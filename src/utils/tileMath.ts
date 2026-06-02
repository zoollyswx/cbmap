import type { TileCoord } from '../types'

// 经纬度转瓦片坐标
export function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom)
  const x = (lon + 180) / 360 * n
  const y = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
  return { x: Math.floor(x), y: Math.floor(y) }
}

// 瓦片坐标转经纬度（左上角）
export function tileToLonLat(x: number, y: number, zoom: number): { lon: number; lat: number } {
  const n = Math.pow(2, zoom)
  const lon = x / n * 360 - 180
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI
  return { lon, lat }
}

// 瓦片坐标转经纬度范围
export function tileBounds(x: number, y: number, zoom: number): {
  north: number; south: number; east: number; west: number
} {
  const topLeft = tileToLonLat(x, y, zoom)
  const bottomRight = tileToLonLat(x + 1, y + 1, zoom)
  return {
    north: topLeft.lat,
    south: bottomRight.lat,
    west: topLeft.lon,
    east: bottomRight.lon,
  }
}

// 从经纬度范围计算瓦片范围
export function bboxToTileRange(
  north: number, south: number, east: number, west: number, zoom: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  const topLeft = lonLatToTile(west, north, zoom)
  const bottomRight = lonLatToTile(east, south, zoom)
  return {
    minX: Math.floor(topLeft.x),
    maxX: Math.floor(bottomRight.x),
    minY: Math.floor(topLeft.y),
    maxY: Math.floor(bottomRight.y),
  }
}

// 获取指定范围内的所有瓦片坐标
export function getTilesInRange(
  north: number, south: number, east: number, west: number, zoom: number
): TileCoord[] {
  const range = bboxToTileRange(north, south, east, west, zoom)
  const tiles: TileCoord[] = []
  const maxTiles = Math.pow(2, zoom)

  for (let x = range.minX; x <= range.maxX; x++) {
    if (x < 0 || x >= maxTiles) continue
    for (let y = range.minY; y <= range.maxY; y++) {
      if (y < 0 || y >= maxTiles) continue
      tiles.push({ z: zoom, x, y })
    }
  }
  return tiles
}

// 获取指定级别整个区域的瓦片坐标
export function getTilesByExtent(
  extent: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number
): TileCoord[] {
  const allTiles: TileCoord[] = []
  for (let z = minZoom; z <= maxZoom; z++) {
    const tiles = getTilesInRange(extent.north, extent.south, extent.east, extent.west, z)
    // 使用 concat 避免 push(...tiles) 在大数组时栈溢出
    for (let i = 0; i < tiles.length; i++) {
      allTiles.push(tiles[i])
    }
  }
  return allTiles
}

// 按公里扩展包围盒（用于下载缓冲区域）
export function expandBBox(
  bbox: { north: number; south: number; east: number; west: number },
  bufferKm: number
): { north: number; south: number; east: number; west: number } {
  if (bufferKm <= 0) return { ...bbox }
  const latCenter = (bbox.north + bbox.south) / 2
  const latDegPerKm = 1 / 111.32
  const lonDegPerKm = 1 / (111.32 * Math.cos(latCenter * Math.PI / 180))
  return {
    north: Math.min(90, bbox.north + bufferKm * latDegPerKm),
    south: Math.max(-90, bbox.south - bufferKm * latDegPerKm),
    east:  Math.min(180, bbox.east + bufferKm * lonDegPerKm),
    west:  Math.max(-180, bbox.west - bufferKm * lonDegPerKm),
  }
}

// 估算瓦片数量
export function estimateTileCount(
  extent: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number
): number {
  let count = 0
  for (let z = minZoom; z <= maxZoom; z++) {
    const range = bboxToTileRange(extent.north, extent.south, extent.east, extent.west, z)
    const tilesX = range.maxX - range.minX + 1
    const tilesY = range.maxY - range.minY + 1
    const maxTiles = Math.pow(2, z)
    const validX = Math.min(tilesX, maxTiles)
    const validY = Math.min(tilesY, maxTiles)
    count += Math.max(0, validX * validY)
  }
  return count
}
