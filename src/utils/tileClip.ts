import type { GeoJSONPolygon, TileCoord } from '../types'
import { tileBounds } from './tileMath'

// 计算瓦片中心点
function tileCenter(x: number, y: number, z: number): [number, number] {
  const bounds = tileBounds(x, y, z)
  return [(bounds.west + bounds.east) / 2, (bounds.north + bounds.south) / 2]
}

// 射线法判断点是否在多边形内
function pointInPolygon(point: [number, number], ring: number[][]): boolean {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// 判断瓦片是否与多边形相交（使用中心点判断）
export function isTileInPolygon(
  tile: TileCoord,
  polygon: GeoJSONPolygon
): boolean {
  try {
    const center = tileCenter(tile.x, tile.y, tile.z)

    if (polygon.type === 'Polygon') {
      const outerRing = polygon.coordinates[0] as number[][]
      if (!pointInPolygon(center, outerRing)) return false
      // 检查是否在洞内
      for (let i = 1; i < polygon.coordinates.length; i++) {
        if (pointInPolygon(center, polygon.coordinates[i] as number[][])) return false
      }
      return true
    }
    // MultiPolygon
    for (const polyCoords of polygon.coordinates) {
      const outerRing = polyCoords[0] as number[][]
      if (pointInPolygon(center, outerRing)) {
        let inHole = false
        for (let i = 1; i < polyCoords.length; i++) {
          if (pointInPolygon(center, polyCoords[i] as number[][])) {
            inHole = true
            break
          }
        }
        if (!inHole) return true
      }
    }
    return false
  } catch {
    return false
  }
}

// 过滤出多边形范围内的瓦片
export function filterTilesByPolygon(
  tiles: TileCoord[],
  polygon: GeoJSONPolygon,
  onProgress?: (processed: number, total: number) => void
): TileCoord[] {
  const result: TileCoord[] = []
  const total = tiles.length

  for (let i = 0; i < tiles.length; i++) {
    if (isTileInPolygon(tiles[i], polygon)) {
      result.push(tiles[i])
    }
    if (onProgress && i % 100 === 0) {
      onProgress(i + 1, total)
    }
  }

  return result
}

// 获取多边形包围盒（支持Polygon和MultiPolygon的完整范围）
export function getPolygonBBox(polygon: GeoJSONPolygon): {
  north: number; south: number; east: number; west: number
} {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity

  // 收集所有坐标点
  const allCoords: number[][] = []

  if (polygon.type === 'Polygon') {
    // Polygon: coordinates[0] = outer ring
    for (const ring of polygon.coordinates as number[][][]) {
      allCoords.push(...ring)
    }
  } else {
    // MultiPolygon: coordinates[i][0] = outer ring of each polygon
    for (const polyCoords of polygon.coordinates as number[][][][]) {
      for (const ring of polyCoords) {
        allCoords.push(...ring)
      }
    }
  }

  if (allCoords.length === 0) {
    return { north: 90, south: -90, east: 180, west: -180 }
  }

  for (const [lng, lat] of allCoords) {
    if (lng < west) west = lng
    if (lng > east) east = lng
    if (lat < south) south = lat
    if (lat > north) north = lat
  }

  return { north, south, east, west }
}
