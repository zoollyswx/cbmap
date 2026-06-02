import { useState, useEffect } from 'react'
import L from 'leaflet'

interface Props {
  mapRef: React.MutableRefObject<L.Map | null>
}

export default function StatusBar({ mapRef }: Props) {
  const [coords, setCoords] = useState({ lat: 0, lng: 0, zoom: 0 })

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const update = () => {
      const center = map.getCenter()
      setCoords({
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom(),
      })
    }

    map.on('moveend', update)
    map.on('zoomend', update)
    update()

    return () => {
      map.off('moveend', update)
      map.off('zoomend', update)
    }
  }, [mapRef.current])

  return (
    <div className="status-bar">
      <span>经度: {coords.lng.toFixed(4)}</span>
      <span>纬度: {coords.lat.toFixed(4)}</span>
      <span>缩放级别: {coords.zoom}</span>
      <span style={{ flex: 1 }} />
      <span>鼠标滚轮缩放 | 拖拽平移</span>
    </div>
  )
}
