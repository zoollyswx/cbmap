import { useStore } from '../store/useStore'
import { parseWKT, extractAllPolygons, type ExtractedPolygon } from '../utils/wktParser'

export default function BoundaryImporter() {
  const { addBoundary } = useStore()

  const handleImportWKT = async () => {
    let filePath: string | null = null
    if (window.electronAPI) {
      filePath = await window.electronAPI.selectFile([
        { name: 'WKT & GeoJSON 文件', extensions: ['wkt', 'geojson', 'json', 'txt'] },
      ])
      if (!filePath) return
    } else {
      triggerFileInput(['.wkt', '.geojson', '.json', '.txt'])
      return
    }

    processFile(filePath)
  }

  const triggerFileInput = (extensions: string[]) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = extensions.join(',')
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const content = await file.text()
      importContent(content, file.name)
    }
    input.click()
  }

  const processFile = async (filePath: string) => {
    if (!window.electronAPI) return
    const content = await window.electronAPI.readFile(filePath)
    const name = filePath.split(/[/\\]/).pop() || '导入边界'
    importContent(content, name)
  }

  const importContent = (content: string, fileName: string) => {
    const trimmed = content.trim()
    const baseName = fileName.replace(/\.\w+$/, '')

    // 尝试作为WKT解析（单个多边形）
    if (trimmed.toUpperCase().startsWith('POLYGON') || trimmed.toUpperCase().startsWith('MULTIPOLYGON')) {
      const geojson = parseWKT(trimmed)
      if (!geojson) {
        alert('WKT解析失败')
        return
      }
      addBoundary({
        id: `boundary_${Date.now()}`,
        name: baseName,
        type: 'wkt',
        sourceData: trimmed,
        geojson,
        visible: true,
        color: getColor(),
        opacity: 0.12,
        favorite: false,
        order: 0,
        group: '',
      })
      return
    }

    // GeoJSON解析 - 支持FeatureCollection批量导入
    try {
      const parsed = JSON.parse(trimmed)
      const polygons = extractAllPolygons(parsed)

      if (polygons.length === 0) {
        alert('文件中未找到有效的Polygon/MultiPolygon数据')
        return
      }

      if (polygons.length > 500) {
        if (!confirm(`文件包含 ${polygons.length} 个边界，批量导入可能较慢。是否继续？`)) {
          return
        }
      }

      const baseTimestamp = Date.now()
      polygons.forEach((p, idx) => {
        // 使用要素属性中的名字，或自动编号
        const featureName = p.name || `${baseName}_${idx + 1}`
        addBoundary({
          id: `boundary_${baseTimestamp}_${idx}`,
          name: featureName,
          type: 'geojson',
          sourceData: JSON.stringify(p.geometry),
          geojson: p.geometry,
          visible: polygons.length <= 50,
          color: getColor(),
          opacity: 0.12,
          favorite: false,
          order: 0,
          group: '',
        })
      })

      const hiddenMsg = polygons.length > 50
        ? '（默认隐藏，可手动显示）'
        : ''
      alert(`成功导入 ${polygons.length} 个边界${hiddenMsg}`)
    } catch {
      alert('无法解析文件内容，请确认是有效的WKT或GeoJSON格式')
    }
  }

  return (
    <div>
      <button className="add-btn" onClick={window.electronAPI ? handleImportWKT : () => triggerFileInput(['.wkt', '.geojson', '.json', '.txt'])}>
        + 导入边界文件
      </button>
      <div style={{ fontSize: 10, color: '#555', marginTop: 4, paddingLeft: 4 }}>
        支持 WKT / GeoJSON (可批量导入FeatureCollection)
      </div>
    </div>
  )
}

const COLORS = [
  '#ff6f00', '#1976d2', '#388e3c', '#d32f2f',
  '#7b1fa2', '#0097a7', '#e64a19', '#455a64',
  '#00bfa5', '#ff6d00', '#304ffe', '#c51162',
  '#64dd17', '#aa00ff', '#2962ff', '#aeea00',
]
let colorIndex = 0
function getColor(): string {
  return COLORS[colorIndex++ % COLORS.length]
}
