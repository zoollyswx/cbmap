import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

export interface MbtilesOptions {
  /** 瓦片文件所在目录 */
  sourceDir: string
  /** 输出 .mbtiles 文件路径 */
  outputPath: string
  /** 瓦片命名格式，如 "{source}/{z}/{x}/{y}.png" */
  nameFormat: string
  /** 瓦片源名称 */
  sourceName: string
  /** 级别范围 */
  minZoom: number
  maxZoom: number
  /** 元数据 */
  metadata?: Record<string, string>
}

/**
 * 将下载到本地的散列瓦片打包成 MBTiles 格式
 */
export function packMbtiles(options: MbtilesOptions): { success: boolean; tileCount: number; error?: string } {
  const { sourceDir, outputPath, nameFormat, sourceName, minZoom, maxZoom, metadata } = options

  try {
    // 删除旧的输出文件
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath)
    }

    // 确保输出目录存在
    const outDir = path.dirname(outputPath)
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }

    const db = new Database(outputPath)

    // 创建 MBTiles 标准表
    db.exec(`
      CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
      CREATE UNIQUE INDEX idx_tiles ON tiles (zoom_level, tile_column, tile_row);
      CREATE TABLE metadata (name TEXT, value TEXT);
    `)

    // 插入元数据
    const meta: Record<string, string> = {
      name: sourceName,
      type: 'baselayer',
      version: '1.0',
      description: `Exported by CBMap`,
      format: 'png',
      minzoom: String(minZoom),
      maxzoom: String(maxZoom),
      ...metadata,
    }

    const insertMeta = db.prepare('INSERT INTO metadata (name, value) VALUES (?, ?)')
    const insertTile = db.prepare('INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)')

    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(meta)) {
        insertMeta.run(key, value)
      }
    })
    tx()

    let tileCount = 0
    const insertTx = db.transaction(() => {
      for (let z = minZoom; z <= maxZoom; z++) {
        scanLevel(z)
      }
    })

    function scanLevel(z: number) {
      const zDir = nameFormat
        .replace('{source}', sourceName)
        .replace('{z}', String(z))
        .replace('{x}', '*')
        .replace('{y}', '*')
        .replace('.png', '')

      // 找到 z 级别目录
      const zPattern = path.join(sourceDir, zDir.replace(/\*/g, ''))
      const zBase = zPattern.substring(0, zPattern.lastIndexOf(path.sep) + 1)

      // 更简单的方法：直接遍历 z 级别目录下的所有文件
      const searchDir = path.join(sourceDir,
        nameFormat.replace('{source}', sourceName).replace('{z}', String(z)).split('/')[0]
      )

      // 递归查找所有匹配的瓦片文件
      function findTiles(dir: string, depth: number) {
        if (!fs.existsSync(dir)) return

        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory() && depth < 5) {
            findTiles(fullPath, depth + 1)
          } else if (entry.isFile() && entry.name.endsWith('.png')) {
            // 尝试从路径中解析 x, y, z
            const relative = path.relative(sourceDir, fullPath)
            const parts = relative.replace(/\\/g, '/').split('/')

            // 从命名格式中推断 z/x/y 位置
            // 格式如: "{source}/{z}/{x}/{y}.png" → parts: [source, z, x, y.png]
            const fmtParts = nameFormat.replace(/\\/g, '/').split('/')
            let xIdx = -1, yIdx = -1, zIdx = -1

            for (let i = 0; i < fmtParts.length; i++) {
              if (fmtParts[i].includes('{x}')) xIdx = i
              if (fmtParts[i].includes('{y}')) yIdx = i
              if (fmtParts[i].includes('{z}')) zIdx = i
            }

            if (xIdx >= 0 && xIdx < parts.length) {
              const x = parseInt(parts[xIdx], 10)
              const yRaw = yIdx >= 0 && yIdx < parts.length ? parts[yIdx].replace('.png', '') : '0'
              const y = parseInt(yRaw, 10)
              const zVal = zIdx >= 0 && zIdx < parts.length ? parseInt(parts[zIdx], 10) : z

              if (!isNaN(x) && !isNaN(y) && zVal === z) {
                const data = fs.readFileSync(fullPath)
                // MBTiles Y 轴: 从上到下 (TMS)，需要翻转
                const tmsY = Math.pow(2, zVal) - 1 - y
                try {
                  insertTile.run(zVal, x, tmsY, data)
                  tileCount++
                } catch {
                  // 跳过重复瓦片
                }
              }
            }
          }
        }
      }

      findTiles(searchDir, 0)
    }

    insertTx()

    db.close()
    return { success: true, tileCount }
  } catch (err: any) {
    return { success: false, tileCount: 0, error: err.message }
  }
}
