import fs from 'fs'
import path from 'path'
import { net } from 'electron'

const TILE_TIMEOUT_MS = 30000
const MAIN_DOWNLOAD_RETRIES = 2
const RETRY_DOWNLOAD_RETRIES = 2
const DEFAULT_CONCURRENCY = 4
const RETRYABLE_STATUS_CODES = new Set([408, 500, 502, 503, 504])

interface TaskControl {
  cancelled: boolean
  failedTileCoords: { z: number; x: number; y: number }[]
  failureStats: Record<string, number>
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

type TileOutcome = 'downloaded' | 'skipped' | 'failed' | 'retryable-failed'
interface TileResult {
  outcome: TileOutcome
  reason?: string
}

const tileResult = (outcome: TileOutcome, reason?: string): TileResult => ({ outcome, reason })

function downloadSingleTile(url: string, filePath: string): Promise<TileResult> {
  return new Promise((resolve) => {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch {
        resolve(tileResult('failed', 'mkdir'))
        return
      }
    }

    if (fs.existsSync(filePath)) {
      resolve(tileResult('skipped'))
      return
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      resolve(tileResult('failed', 'invalid-url'))
      return
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      resolve(tileResult('failed', 'invalid-protocol'))
      return
    }

    let done = false
    const finish = (result: TileResult) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      resolve(result)
    }

    const timeout = setTimeout(() => {
      if (!done) {
        req.abort()
        finish(tileResult('retryable-failed', 'timeout'))
      }
    }, TILE_TIMEOUT_MS)

    const req = net.request({
      method: 'GET',
      url,
    })
    req.setHeader('User-Agent', 'CBMap/1.0')
    req.setHeader('Accept', 'image/*')

    req.on('response', (res) => {
      if (res.statusCode !== 200) {
        const reason = `http ${res.statusCode ?? 'unknown'}`
        res.on('data', () => {})
        res.on('end', () => finish(tileResult(
          RETRYABLE_STATUS_CODES.has(res.statusCode ?? 0) ? 'retryable-failed' : 'failed',
          reason
        )))
        res.on('error', () => finish(tileResult('retryable-failed', 'response-error')))
        return
      }

      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        try {
          fs.writeFileSync(filePath, buffer)
          finish(tileResult('downloaded'))
        } catch {
          finish(tileResult('failed', 'write-file'))
        }
      })
      res.on('error', () => finish(tileResult('retryable-failed', 'response-error')))
    })

    req.on('error', () => finish(tileResult('retryable-failed', 'network')))
    req.end()
  })
}

async function downloadWithRetry(url: string, filePath: string, maxRetries: number): Promise<TileResult> {
  let lastRetryableReason = 'retry-exhausted'
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await downloadSingleTile(url, filePath)
    if (result.outcome === 'failed') return result
    if (result.outcome !== 'retryable-failed') return result
    lastRetryableReason = result.reason ?? lastRetryableReason
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
    }
  }
  return tileResult('failed', lastRetryableReason)
}

function recordFailure(taskControl: TaskControl, reason?: string) {
  const key = reason || 'unknown'
  taskControl.failureStats[key] = (taskControl.failureStats[key] ?? 0) + 1
}

async function runWithPool(
  tiles: { z: number; x: number; y: number }[],
  taskControl: TaskControl,
  maxConcurrent: number,
  buildRequest: (tile: { z: number; x: number; y: number }) => Promise<TileResult>,
  onProgress: (
    completed: number,
    failed: number,
    skipped: number,
    failureStats: Record<string, number>,
  ) => void,
) {
  const total = tiles.length
  let completed = 0
  let failed = 0
  let skipped = 0
  let nextIndex = 0

  const sendProgress = () => onProgress(completed, failed, skipped, { ...taskControl.failureStats })

  async function worker(): Promise<void> {
    while (nextIndex < tiles.length && !taskControl.cancelled) {
      const i = nextIndex++
      const tile = tiles[i]
      try {
        const result = await buildRequest(tile)
        if (result.outcome === 'downloaded') completed++
        else if (result.outcome === 'skipped') skipped++
        else {
          failed++
          taskControl.failedTileCoords.push(tile)
          recordFailure(taskControl, result.reason)
        }
      } catch {
        failed++
        taskControl.failedTileCoords.push(tile)
        recordFailure(taskControl, 'exception')
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

  const taskControl: TaskControl = { cancelled: false, failedTileCoords: [], failureStats: {} }
  downloadTasks.set(taskId, taskControl)

  const total = tiles.length
  let completed = 0
  let failed = 0
  let skipped = 0

  await runWithPool(tiles, taskControl, maxConcurrent, async (tile) => {
    const url = buildTileUrl(urlTemplate, tile.z, tile.x, tile.y, subdomains)
    const tilePath = buildTilePath(nameFormat, sourceName, tile.z, tile.x, tile.y)
    const fullPath = path.join(saveDir, tilePath)
    return downloadWithRetry(url, fullPath, MAIN_DOWNLOAD_RETRIES)
  }, (c, f, s, stats) => {
    completed = c
    failed = f
    skipped = s
    if (taskControl.cancelled) return
    event.sender.send('download:progress', {
      taskId,
      progress: { total, completed, failed, skipped },
      failureStats: stats,
      status: 'running',
    })
  })

  if (taskControl.cancelled) {
    event.sender.send('download:progress', {
      taskId,
      progress: { total, completed, failed, skipped },
      failureStats: { ...taskControl.failureStats },
      status: 'cancelled',
    })
    downloadTasks.delete(taskId)
    return
  }

  event.sender.send('download:progress', {
    taskId,
    progress: { total, completed, failed, skipped },
    failureStats: { ...taskControl.failureStats },
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

  const taskControl: TaskControl = { cancelled: false, failedTileCoords: [], failureStats: {} }
  downloadTasks.set(taskId, taskControl)

  const total = failedCoords.length
  let completed = 0
  let failed = 0
  let skipped = 0

  await runWithPool(failedCoords, taskControl, maxConcurrent, async (tile) => {
    const url = buildTileUrl(urlTemplate, tile.z, tile.x, tile.y, subdomains)
    const tilePath = buildTilePath(nameFormat, sourceName, tile.z, tile.x, tile.y)
    const fullPath = path.join(saveDir, tilePath)
    return downloadWithRetry(url, fullPath, RETRY_DOWNLOAD_RETRIES)
  }, (c, f, s, stats) => {
    completed = c
    failed = f
    skipped = s
    if (taskControl.cancelled) return
    event.sender.send('download:progress', {
      taskId,
      progress: { total, completed, failed, skipped },
      failureStats: stats,
      status: 'running',
    })
  })

  if (taskControl.cancelled) {
    event.sender.send('download:progress', {
      taskId,
      progress: { total, completed, failed, skipped },
      failureStats: { ...taskControl.failureStats },
      status: 'cancelled',
    })
    downloadTasks.delete(taskId)
    return
  }

  event.sender.send('download:progress', {
    taskId,
    progress: { total, completed, failed, skipped },
    failureStats: { ...taskControl.failureStats },
    status: 'completed',
  })
  if (failed === 0) {
    downloadTasks.delete(taskId)
  }
}

export function getFailedCoords(taskId: string): { z: number; x: number; y: number }[] {
  return downloadTasks.get(taskId)?.failedTileCoords ?? []
}
