import { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from '../store/useStore'
import L from 'leaflet'

type DrawType = 'rectangle' | 'polygon' | 'circle' | null

interface Props {
  mapRef: React.MutableRefObject<L.Map | null>
}

export default function DrawToolbar({ mapRef }: Props) {
  const [activeTool, setActiveTool] = useState<DrawType>(null)
  const drawLayerRef = useRef<L.FeatureGroup | null>(null)
  const tempLayerRef = useRef<L.Layer | null>(null)
  const polygonPointsRef = useRef<L.LatLng[]>([])
  const polygonMarkersRef = useRef<L.CircleMarker[]>([])
  const polygonLineRef = useRef<L.Polyline | null>(null)
  const isDrawingRef = useRef(false)

  const { addBoundary, setActiveBoundary } = useStore()

  const getDrawLayer = useCallback((): L.FeatureGroup => {
    if (drawLayerRef.current) return drawLayerRef.current
    const layer = new L.FeatureGroup()
    mapRef.current?.addLayer(layer)
    drawLayerRef.current = layer
    return layer
  }, [mapRef])

  // 清理所有临时绘制元素
  const cleanupTemp = useCallback(() => {
    if (tempLayerRef.current) {
      mapRef.current?.removeLayer(tempLayerRef.current)
      tempLayerRef.current = null
    }
    polygonMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m))
    polygonMarkersRef.current = []
    if (polygonLineRef.current) {
      mapRef.current?.removeLayer(polygonLineRef.current)
      polygonLineRef.current = null
    }
    polygonPointsRef.current = []
    isDrawingRef.current = false
  }, [mapRef])

  // 停止绘制
  const stopDraw = useCallback(() => {
    cleanupTemp()
    setActiveTool(null)
    const container = mapRef.current?.getContainer()
    if (container) container.style.cursor = ''
  }, [cleanupTemp, mapRef])

  // 保存形状为边界
  const saveShape = useCallback((layer: L.Layer, shapeType: DrawType) => {
    try {
      const geojson = (layer as any).toGeoJSON()
      let polygon = null
      if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') {
        polygon = geojson
      } else if (geojson.type === 'Feature' && geojson.geometry) {
        polygon = geojson.geometry
      }
      if (polygon) {
        const names: Record<string, string> = { rectangle: '矩形', polygon: '多边形', circle: '圆形' }
        addBoundary({
          id: `draw_${Date.now()}`,
          name: `${names[shapeType || ''] || '形状'} ${new Date().toLocaleTimeString()}`,
          type: 'geojson',
          sourceData: JSON.stringify(polygon),
          geojson: polygon,
          visible: true,
          color: '#ff6f00',
          opacity: 0.12,
          favorite: false,
          order: 0,
          group: '绘制',
        })
      }
    } catch {}
  }, [addBoundary])

  // ---- 矩形绘制 ----
  const startRectangle = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    stopDraw()
    setActiveTool('rectangle')
    map.getContainer().style.cursor = 'crosshair'

    let startPoint: L.LatLng | null = null
    let preview: L.Rectangle | null = null

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      if (!isDrawingRef.current) {
        // 第一次点击：开始
        isDrawingRef.current = true
        startPoint = e.latlng
        map.dragging.disable()
      }
    }

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!isDrawingRef.current || !startPoint) return
      if (preview) map.removeLayer(preview)
      const bounds = L.latLngBounds(startPoint, e.latlng)
      preview = L.rectangle(bounds, { color: '#1976d2', weight: 2, fillOpacity: 0.15, interactive: false })
      preview.addTo(map)
      tempLayerRef.current = preview
    }

    const onMouseUp = (e: L.LeafletMouseEvent) => {
      if (!isDrawingRef.current || !startPoint) return
      // 第二次点击：完成
      if (preview) {
        const finalRect = L.rectangle(preview.getBounds(), {
          color: '#1976d2', weight: 2, fillOpacity: 0.15,
        })
        getDrawLayer().addLayer(finalRect)
        saveShape(finalRect, 'rectangle')
      }
      map.dragging.enable()
      cleanupListeners()
      stopDraw()
    }

    const onDblClick = () => {
      // 矩形绘制中双击无影响
    }

    const cleanupListeners = () => {
      map.off('mousedown', onMouseDown)
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
      map.off('dblclick', onDblClick)
    }

    map.on('mousedown', onMouseDown)
    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)
    map.on('dblclick', onDblClick)

    // 保存清理函数
    ;(map as any).__drawCleanup = cleanupListeners
  }, [mapRef, stopDraw, getDrawLayer, saveShape])

  // ---- 多边形绘制 ----
  const startPolygon = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    stopDraw()
    setActiveTool('polygon')
    map.getContainer().style.cursor = 'crosshair'

    const points: L.LatLng[] = []
    const markers: L.CircleMarker[] = []
    let line: L.Polyline | null = null

    const updateLine = () => {
      if (line) map.removeLayer(line)
      if (points.length >= 2) {
        line = L.polyline([...points, points[0]], {
          color: '#ff6f00', weight: 2, dashArray: '6 3', interactive: false,
        })
        line.addTo(map)
        polygonLineRef.current = line
      }
    }

    const addPoint = (latlng: L.LatLng) => {
      points.push(latlng)
      const marker = L.circleMarker(latlng, {
        radius: 4, color: '#ff6f00', fillColor: '#fff', fillOpacity: 1, weight: 2,
        interactive: false,
      })
      marker.addTo(map)
      markers.push(marker)
      updateLine()
      polygonPointsRef.current = points
      polygonMarkersRef.current = markers
    }

    const onClick = (e: L.LeafletMouseEvent) => {
      // 检查是否接近起点（关闭多边形）
      if (points.length >= 3) {
        const dist = e.latlng.distanceTo(points[0])
        if (dist < 15) {
          finishPolygon()
          return
        }
      }
      addPoint(e.latlng)
    }

    const onDblClick = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e)
      if (points.length >= 3) {
        finishPolygon()
      }
    }

    const onRightClick = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e)
      if (points.length >= 3) {
        finishPolygon()
        return false
      }
    }

    const finishPolygon = () => {
      if (points.length < 3) return

      const latlngs = points.map(p => [p.lat, p.lng] as [number, number])
      const polygon = L.polygon(latlngs, {
        color: '#ff6f00', weight: 2, fillOpacity: 0.15,
      })
      getDrawLayer().addLayer(polygon)
      saveShape(polygon, 'polygon')

      cleanupListeners()
      stopDraw()
    }

    const cleanupListeners = () => {
      map.off('click', onClick)
      map.off('dblclick', onDblClick)
      map.off('contextmenu', onRightClick)
      if (line) { map.removeLayer(line); line = null }
      markers.forEach(m => map.removeLayer(m))
      markers.length = 0
      points.length = 0
      polygonLineRef.current = null
    }

    map.on('click', onClick)
    map.on('dblclick', onDblClick)
    map.on('contextmenu', onRightClick)

    ;(map as any).__drawCleanup = cleanupListeners
  }, [mapRef, stopDraw, getDrawLayer, saveShape])

  // ---- 圆形绘制 ----
  const startCircle = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    stopDraw()
    setActiveTool('circle')
    map.getContainer().style.cursor = 'crosshair'

    let center: L.LatLng | null = null
    let preview: L.Circle | null = null

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      if (!isDrawingRef.current) {
        isDrawingRef.current = true
        center = e.latlng
        map.dragging.disable()
      }
    }

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!isDrawingRef.current || !center) return
      if (preview) map.removeLayer(preview)
      const radius = center.distanceTo(e.latlng)
      if (radius > 1) {
        preview = L.circle(center, {
          radius,
          color: '#388e3c', weight: 2, fillOpacity: 0.15, interactive: false,
        })
        preview.addTo(map)
        tempLayerRef.current = preview
      }
    }

    const onMouseUp = () => {
      if (!isDrawingRef.current || !center || !preview) return
      const finalCircle = L.circle(center, {
        radius: preview.getRadius(),
        color: '#388e3c', weight: 2, fillOpacity: 0.15,
      })
      getDrawLayer().addLayer(finalCircle)
      saveShape(finalCircle, 'circle')

      map.dragging.enable()
      cleanupListeners()
      stopDraw()
    }

    const cleanupListeners = () => {
      map.off('mousedown', onMouseDown)
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
    }

    map.on('mousedown', onMouseDown)
    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)

    ;(map as any).__drawCleanup = cleanupListeners
  }, [mapRef, stopDraw, getDrawLayer, saveShape])

  // 启动绘制
  const startDraw = useCallback((type: DrawType) => {
    if (activeTool === type) {
      stopDraw()
      return
    }
    // 清理之前的绘制
    const map = mapRef.current
    if (map && (map as any).__drawCleanup) {
      ;(map as any).__drawCleanup()
      ;(map as any).__drawCleanup = null
    }

    switch (type) {
      case 'rectangle': startRectangle(); break
      case 'polygon': startPolygon(); break
      case 'circle': startCircle(); break
    }
  }, [activeTool, stopDraw, mapRef, startRectangle, startPolygon, startCircle])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      const map = mapRef.current
      if (map && (map as any).__drawCleanup) {
        ;(map as any).__drawCleanup()
        ;(map as any).__drawCleanup = null
      }
      stopDraw()
    }
  }, [])

  const clearAll = useCallback(() => {
    drawLayerRef.current?.clearLayers()
  }, [])

  const btn = (tool: DrawType, color: string, svg: JSX.Element) => (
    <button
      style={{
        width: 36, height: 36,
        border: activeTool === tool ? `2px solid ${color}` : '1px solid #ccc',
        borderRadius: 4,
        background: activeTool === tool ? color : '#fff',
        color: activeTool === tool ? '#fff' : '#333',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
      }}
      onClick={() => startDraw(tool)}
      title={
        tool === 'rectangle' ? '矩形 - 按住拖动' :
        tool === 'polygon' ? '多边形 - 点击加点，双击/右键完成' :
        '圆形 - 按住拖动'
      }
    >
      {svg}
    </button>
  )

  return (
    <div style={{
      position: 'absolute', top: 80, right: 10, zIndex: 1000,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {btn('rectangle', '#1976d2',
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="1" />
        </svg>
      )}
      {btn('polygon', '#ff6f00',
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12,2 22,9 19,22 5,22 2,9" />
        </svg>
      )}
      {btn('circle', '#388e3c',
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
        </svg>
      )}

      <div style={{ height: 1, background: '#ddd', margin: '2px 6px' }} />

      <button
        style={{
          width: 36, height: 36, border: '1px solid #ccc', borderRadius: 4,
          background: '#fff', color: '#666', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}
        onClick={() => { if (confirm('清除所有绘制的形状？')) clearAll() }}
        title="清除所有绘制"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3,6 5,6 21,6" />
          <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2" />
        </svg>
      </button>
    </div>
  )
}
