import type { GeoJSONPolygon } from '../types'

// 简单的WKT解析器，支持 POLYGON 和 MULTIPOLYGON
// 生产环境建议使用 wicket 库，这里实现一个轻量解析器以免额外依赖

export function parseWKT(wkt: string): GeoJSONPolygon | null {
  try {
    const trimmed = wkt.trim()

    if (trimmed.toUpperCase().startsWith('POLYGON')) {
      return parsePolygon(trimmed)
    } else if (trimmed.toUpperCase().startsWith('MULTIPOLYGON')) {
      return parseMultiPolygon(trimmed)
    }

    return null
  } catch {
    return null
  }
}

function parsePolygon(wkt: string): GeoJSONPolygon {
  // POLYGON ((x y, x y, ...), (x y, x y, ...))
  const ringsStr = wkt.replace(/POLYGON\s*\(/i, '').replace(/\)\s*$/, '').trim()
  const rings = parseRings(ringsStr)

  return {
    type: 'Polygon',
    coordinates: rings.map(ring => ring.map(([x, y]) => [x, y])),
  }
}

function parseMultiPolygon(wkt: string): GeoJSONPolygon {
  // MULTIPOLYGON (((x y, ...)), ((x y, ...)))
  const inner = wkt.replace(/MULTIPOLYGON\s*\(/i, '').trim()
  // Remove outer parentheses
  const content = inner.slice(0, -1).trim()

  const polygons: number[][][][] = []
  let depth = 0
  let current = ''
  let i = 0

  while (i < content.length) {
    const ch = content[i]
    if (ch === '(') {
      depth++
      current += ch
    } else if (ch === ')') {
      depth--
      current += ch
      if (depth === 0 && current.trim()) {
        const ringsStr = current.trim()
        const parsed = parseRings(ringsStr.slice(1, -1))
        polygons.push(parsed.map(ring => ring.map(([x, y]) => [x, y])))
        current = ''
      }
    } else {
      current += ch
    }
    i++
  }

  return {
    type: 'MultiPolygon',
    coordinates: polygons,
  }
}

function parseRings(ringsStr: string): number[][][] {
  const rings: number[][][] = []
  let depth = 0
  let current = ''

  for (let i = 0; i < ringsStr.length; i++) {
    const ch = ringsStr[i]
    if (ch === '(') {
      depth++
      if (depth > 1) current += ch
    } else if (ch === ')') {
      depth--
      if (depth > 0) current += ch
      if (depth === 0 && current.trim()) {
        rings.push(parseCoordinateList(current.trim()))
        current = ''
      }
    } else {
      if (depth > 0) current += ch
    }
  }

  return rings
}

function parseCoordinateList(str: string): number[][] {
  const coords: number[][] = []
  const pairs = str.split(',').map(s => s.trim()).filter(Boolean)

  for (const pair of pairs) {
    const parts = pair.split(/\s+/)
    if (parts.length >= 2) {
      const x = parseFloat(parts[0])
      const y = parseFloat(parts[1])
      if (!isNaN(x) && !isNaN(y)) {
        coords.push([x, y])
      }
    }
  }

  return coords
}

// 验证GeoJSON是否为有效的Polygon/MultiPolygon（返回第一个）
export function validateGeoJSONPolygon(geojson: any): GeoJSONPolygon | null {
  const all = extractAllPolygons(geojson)
  return all.length > 0 ? all[0].geometry : null
}

// 从GeoJSON中提取所有Polygon（支持FeatureCollection）
export interface ExtractedPolygon {
  geometry: GeoJSONPolygon
  name: string
  properties: Record<string, any>
}
export function extractAllPolygons(geojson: any): ExtractedPolygon[] {
  const results: ExtractedPolygon[] = []

  if (!geojson || typeof geojson !== 'object') return results

  // 直接是Geometry
  if (geojson.type === 'Polygon' && Array.isArray(geojson.coordinates)) {
    results.push({ geometry: geojson as GeoJSONPolygon, name: '', properties: {} })
  }
  if (geojson.type === 'MultiPolygon' && Array.isArray(geojson.coordinates)) {
    results.push({ geometry: geojson as GeoJSONPolygon, name: '', properties: {} })
  }

  // Feature
  if (geojson.type === 'Feature' && geojson.geometry) {
    const subResults = extractAllPolygons(geojson.geometry)
    for (const r of subResults) {
      // 从properties中提取名称
      const props = geojson.properties || {}
      const name = props.name || props.NAME || props.名称 || props.Name || ''
      results.push({
        geometry: r.geometry,
        name,
        properties: props,
      })
    }
  }

  // FeatureCollection
  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (const feature of geojson.features) {
      const subResults = extractAllPolygons(feature)
      results.push(...subResults)
    }
  }

  return results
}
