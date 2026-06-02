import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'

const TILE_TIMEOUT_MS = 12000
const MAX_RETRIES = 2
const DEFAULT_CONCURRENCY = 4
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])

// Node.js https 模块没有 Chromium 的 per-host 连接数限制
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 32,
  maxFreeSockets: 16,
  timeout: TILE_TIMEOUT_MS,
})

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 32,
  maxFreeSockets: 16,
  timeout: TILE_TIMEOUT_MS,
})

interface TaskControl {
  cancelled: boolean
  failedTileCoords: { z: number; x: number; y: number }[]
}

const downloadTasks: Map<string, TaskControl> = new Map()

export function cancelDownload(taskId: string) {
  const task = downloadTasks.get(taskId)
  if (task) {
    task.cancelled = true
  }
}

interface DownloadOptions {
  tiles: { z: number; x: number; y: number }[]
  urlTemplate: string
  saveDir: string
  nameFormat: string
  sourceName: string
  subdomains?: string[]
  taskId: string
  concurrency?: number
}

function buildTileUrl(
  urlTemplate: string,
  z: number, x: number, y: number,
  subdomains?: string[]
): string {
  let url = urlTemplate
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))

  if (subdomains && subdomains.length > 0) {
    const s = subdomains[Math.abs(x + y) % subdomains.length]
    url = url.replace('{s}', s)
  } else {
    url = url.replace('{s}', 'a')
  }

  return url
}

function buildTilePath(
  nameFormat: string,
  sourceName: string,
  z: number, x: number, y: number
): string {
  return nameFormat
    .replace('{source}', sourceName)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

type TileResult = 'downloaded' | 'skipped' | 'failed' | 'retryable-failed'

function downloadSingleTile(url: string, filePath: string): Promise<TileResult> {
  return new Promise((resolve) => {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch {
        resolve('failed')
        return
      }
    }

    if (fs.existsSync(filePath)) {
      resolve('skipped')
      return
    }

    const parsedUrl = new URL(url)
    const isHttps = parsedUrl.protocol === 'https:'
    const transport = isHttps ? https : http
    const agent = isHttps ? httpsAgent : httpAgent

    let done = false
    const finish = (result: TileResult) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      resolve(result)
    }

    const timeout = setTimeout(() => {
      if (!done) {
        req.destroy()
        finish('retryable-failed')
      }
    }, TILE_TIMEOUT_MS)

    const req = transport.request(
      url,
      {
        agent,
        headers: {
          'User-Agent': 'CBMap/1.0',
          'Accept': 'image/*',
        },
        timeout: TILE_TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          finish(RETRYABLE_STATUS_CODES.has(res.statusCode ?? 0) ? 'retryable-failed' : 'failed')
          return
        }

        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          try {
            fs.writeFileSync(filePath, buffer)
            finish('downloaded')
          } catch {
            finish('failed')
          }
        })
        res.on('error', () => finish('retryable-failed'))
      }
    )

    req.on('error', () => finish('retryable-failed'))
    req.end()
  })
}

async function downloadWithRetry(url: string, filePath: string): Promise<TileResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await downloadSingleTile(url, filePath)
    if (result === 'failed') return 'failed'
    if (result !== 'retryable-failed') return result
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
    }
  }
  return 'failed'
}

async function runWithPool(
  tiles: { z: number; x: number; y: number }[],
  taskControl: TaskControl,
  maxConcurrent: number,
  buildRequest: (tile: { z: number; x: number; y: number }) => Promise<TileResult>,
  onProgress: (completed: number, failed: number, skipped: number) => void,
) {
  const total = tiles.length
  let completed = 0
  let failed = 0
  let skipped = 0
  let nextIndex = 0

  const sendProgress = () => onProgress(completed, failed, skipped)

  async function worker(): Promise<void> {
    while (nextIndex < tiles.length && !taskControl.cancelled) {
      const i = nextIndex++
      const tile = tiles[i]
      try {
        const result = await buildRequest(tile)
        if (result === 'downloaded') completed++
        else if (result === 'skipped') skipped++
        else {
          failed++
          taskControl.failedTileCoords.push(tile)
        }
      } catch {
        failed++
        taskControl.failedTileCoords.push(tile)
      }
      if ((completed + failed + skipped) % 50 === 0 || nextIndex >= total) {
        sendProgress()
      }
    }
  }

  const workers: Promise<void>[] = []
  const poolSize = Math.min(maxConcurrent, tiles.length)
  for (let w = 0; w < poolSize; w++) {
    workers.push(worker())
  }
  await Promise.all(workers)
}

export async function downloadTiles(
  event: Electron.IpcMainInvokeEvent,
  options: DownloadOptions
) {
  const { tiles, urlTemplate, saveDir, nameFormat, sourceName, subdomains, taskId, concurrency } = options
  const maxConcurrent = concurrency ?? DEFAULT_CONCURRENCY

  const taskControl: TaskControl = { cancelled: false, failedTileCoords: [] }
  downloadTasks.set(taskId, taskControl)

  const total = tiles.length
  let completed = 0
  let failed = 0
  let skipped = 0

  await runWithPool(tiles, taskControl, maxConcurrent, async (tile) => {
    const url = buildTileUrl(urlTemplate, tile.z, tile.x, tile.y, subdomains)
    const tilePath = buildTilePath(nameFormat, sourceName, tile.z, tile.x, tile.y)
    const fullPath = path.join(saveDir, tilePath)
    return downloadWithRetry(url, fullPath)
  }, (c, f, s) => {
    completed = c
    failed = f
    skipped = s
    if (taskControl.cancelled) return
    event.sender.send('download:progress', {
      taskId,
      progress: { total, completed, failed, skipped },
      status: 'running',
    })
  })

  if (taskControl.cancelled) {
    event.sender.send('download:progress', {
      taskId,
      progress: { total, completed, failed, skipped },
      status: 'cancelled',
    })
    downloadTasks.delete(taskId)
    return
  }

  event.sender.send('download:progress', {
    taskId,
    progress: { total, completed, failed, skipped },
    status: 'completed',
  })
  if (failed === 0) {
    downloadTasks.delete(taskId)
  }
}

export async function retryFailedTiles(
  event: Electron.IpcMainInvokeEvent,
  options: DownloadOptions & { failedCoords: { z: number; x: number; y: number }[] }
) {
  const { failedCoords, urlTemplate, saveDir, nameFormat, sourceName, subdomains, taskId, concurrency } = options
  const maxConcurrent = concurrency ?? DEFAULT_CONCURRENCY

  const taskControl: TaskControl = { cancelled: false, failedTileCoords: [] }
  downloadTasks.set(taskId, taskControl)

  const total = failedCoords.length
  let completed = 0
  let failed = 0
  let skipped = 0

  await runWithPool(failedCoords, taskControl, maxConcurrent, async (tile) => {
    const url = buildTileUrl(urlTemplate, tile.z, tile.x, tile.y, subdomains)
    const tilePath = buildTilePath(nameFormat, sourceName, tile.z, tile.x, tile.y)
    const fullPath = path.join(saveDir, tilePath)
    return downloadWithRetry(url, fullPath)
  }, (c, f, s) => {
    completed = c
    failed = f
    skipped = s
    if (taskControl.cancelled) return
    event.sender.send('download:progress', {
      taskId,
      progress: { total, completed, failed, skipped },
      status: 'running',
    })
  })

  if (taskControl.cancelled) {
    event.sender.send('download:progress', {
      taskId,
      progress: { total, completed, failed, skipped },
      status: 'cancelled',
    })
    downloadTasks.delete(taskId)
    return
  }

  event.sender.send('download:progress', {
    taskId,
    progress: { total, completed, failed, skipped },
    status: 'completed',
  })
  if (failed === 0) {
    downloadTasks.delete(taskId)
  }
}

export function getFailedCoords(taskId: string): { z: number; x: number; y: number }[] {
  return downloadTasks.get(taskId)?.failedTileCoords ?? []
}
