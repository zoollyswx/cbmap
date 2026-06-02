import { useRef, useEffect, useState, useCallback } from 'react'
import { useStore } from '../store/useStore'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import StatusBar from './StatusBar'
import DrawToolbar from './DrawToolbar'
import { getPolygonBBox, filterTilesByPolygon } from '../utils/tileClip'
import { tileBounds, getTilesInRange } from '../utils/tileMath'

export default function MapView() {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const labelLayerRef = useRef<L.TileLayer | null>(null)
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null)
  const drawLayerRef = useRef<L.FeatureGroup | null>(null)
  const tileGridRef = useRef<L.FeatureGroup | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [currentZoom, setCurrentZoom] = useState(5)

  const { activeSourceId, tileSources, boundaries, activeBoundaryId, setActiveBoundary,
    previewTiles } = useStore()

  // 初始化地图 — 只创建一次，不随数据源切换销毁
  useEffect(() => {
    if (mapRef.current) return
    if (!mapContainerRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [35, 105],
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    })

    mapRef.current = map
    setMapReady(true)

    // 绘制图层（持久存在）
    const drawLayer = new L.FeatureGroup()
    map.addLayer(drawLayer)
    drawLayerRef.current = drawLayer

    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  // 监听 activeSourceId 变化：如果没有源则不初始化（但有源时 map 已就绪）
  // 在处理边界前需要确保 map 存在

  // 瓦片源切换 — 不销毁地图，只替换图层
  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    const map = mapRef.current
    const source = tileSources.find(s => s.id === activeSourceId)

    // 移除旧图层
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
      tileLayerRef.current = null
    }
    if (labelLayerRef.current) {
      map.removeLayer(labelLayerRef.current)
      labelLayerRef.current = null
    }

    if (!source) return

    const subdomains = source.subdomains?.length
      ? source.subdomains.join('')
      : 'abc'

    tileLayerRef.current = L.tileLayer(source.urlTemplate, {
      subdomains,
      minZoom: source.minZoom,
      maxZoom: source.maxZoom,
      opacity: source.opacity,
      attribution: source.attribution || '',
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 4,
    }).addTo(map)

    if (source.labelUrlTemplate) {
      labelLayerRef.current = L.tileLayer(source.labelUrlTemplate, {
        subdomains,
        minZoom: source.minZoom,
        maxZoom: source.maxZoom,
        opacity: 1,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 2,
      }).addTo(map)
    }

    // 确保地图尺寸正确
    setTimeout(() => map.invalidateSize(), 100)
  }, [activeSourceId, tileSources, mapReady])

  // 边界渲染
  const updateBoundaries = useCallback(() => {
    if (!mapRef.current || !mapReady) return

    if (geoJsonLayerRef.current) {
      mapRef.current.removeLayer(geoJsonLayerRef.current)
      geoJsonLayerRef.current = null
    }

    const visibleBoundaries = boundaries.filter(b => b.visible)
    if (visibleBoundaries.length === 0) return

    const geoJsonData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: visibleBoundaries.map(b => ({
        type: 'Feature' as const,
        properties: { id: b.id, name: b.name, color: b.color, opacity: b.opacity },
        geometry: b.geojson as any,
      })),
    }

    geoJsonLayerRef.current = L.geoJSON(geoJsonData, {
      style: (feature) => {
        const color = feature?.properties?.color || '#ff6f00'
        const opacity = feature?.properties?.opacity ?? 0.12
        return {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: opacity,
          dashArray: '6 3',
        }
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties.name || '边界'
        layer.bindPopup(name)
        layer.on('click', () => {
          const id = feature.properties.id
          if (id) setActiveBoundary(id)
        })
      },
    }).addTo(mapRef.current!)
  }, [boundaries, activeBoundaryId, mapReady, setActiveBoundary])

  useEffect(() => {
    updateBoundaries()
  }, [updateBoundaries])

  // 选中边界时，定位到该边界的完整范围
  useEffect(() => {
    if (!mapRef.current || !activeBoundaryId || !mapReady) return

    const active = boundaries.find(b => b.id === activeBoundaryId)
    if (!active) return

    try {
      const bbox = getPolygonBBox(active.geojson)
      const bounds = L.latLngBounds(
        L.latLng(bbox.south, bbox.west),
        L.latLng(bbox.north, bbox.east),
      )
      if (bounds.isValid()) {
        mapRef.current.flyToBounds(bounds, {
          padding: [40, 40],
          maxZoom: 14,
          duration: 0.8,
        })
      }
    } catch {
      // ignore
    }
  }, [activeBoundaryId, boundaries, mapReady])

  // 瓦片网格预览图层（有选中边界时始终显示，不依赖下载弹窗）
  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    // 清理旧网格
    if (tileGridRef.current) {
      mapRef.current.removeLayer(tileGridRef.current)
      tileGridRef.current = null
    }

    // 没有选中边界 → 不显示网格
    if (!activeBoundaryId) return

    const activeBoundary = boundaries.find(b => b.id === activeBoundaryId)
    if (!activeBoundary) return

    const z = mapRef.current.getZoom()

    // 优先用下载弹窗传来的 previewTiles（含全级别）；否则自行计算当前级别
    let tilesAtZoom: { z: number; x: number; y: number }[]
    if (previewTiles.length > 0) {
      tilesAtZoom = previewTiles.filter(t => t.z === z)
    } else {
      try {
        const bbox = getPolygonBBox(activeBoundary.geojson)
        const allTiles = getTilesInRange(bbox.north, bbox.south, bbox.east, bbox.west, z)
        tilesAtZoom = activeBoundary.geojson.type === 'MultiPolygon'
          ? allTiles
          : filterTilesByPolygon(allTiles, activeBoundary.geojson)
      } catch {
        return
      }
    }

    if (tilesAtZoom.length === 0) return

    const group = new L.FeatureGroup()
    tilesAtZoom.forEach(tile => {
      const b = tileBounds(tile.x, tile.y, tile.z)
      const rect = L.rectangle(
        L.latLngBounds(L.latLng(b.south, b.west), L.latLng(b.north, b.east)),
        { color: '#1976d2', weight: 1, fillOpacity: 0.1, interactive: false }
      )
      rect.bindTooltip(`${tile.z}/${tile.x}/${tile.y}`, {
        direction: 'center', permanent: true,
        className: 'tile-grid-label',
        opacity: 0.85,
      })
      group.addLayer(rect)
    })
    group.addTo(mapRef.current)
    tileGridRef.current = group
  }, [previewTiles, mapReady, currentZoom, activeBoundaryId, boundaries])

  // 跟踪地图缩放级别
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const map = mapRef.current
    const onZoom = () => setCurrentZoom(map.getZoom())
    map.on('zoomend', onZoom)
    return () => { map.off('zoomend', onZoom) }
  }, [mapReady])

  const activeSource = tileSources.find(s => s.id === activeSourceId)

  return (
    <div className="map-container">
      {!activeSource && (
        <div className="map-placeholder">
          <div style={{ fontSize: 48, opacity: 0.3 }}>🗺</div>
          <div>请从左侧选择一个地图源</div>
        </div>
      )}
      <div
        ref={mapContainerRef}
        style={{
          height: '100%',
          width: '100%',
          display: activeSource ? 'block' : 'none',
        }}
      />
      {mapReady && <DrawToolbar mapRef={mapRef} />}
      <StatusBar mapRef={mapRef} />
    </div>
  )
}
