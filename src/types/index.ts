// 瓦片源配置
export interface TileSource {
  id: string
  name: string
  urlTemplate: string       // 地图瓦片URL模板，如 https://{s}.tile.osm.org/{z}/{x}/{y}.png
  labelUrlTemplate?: string // 标签瓦片URL模板（可选）
  minZoom: number
  maxZoom: number
  opacity: number           // 0-1
  subdomains?: string[]     // 子域名列表，用于负载均衡
  attribution?: string      // 版权信息
}

// 边界数据
export interface Boundary {
  id: string
  name: string
  type: 'wkt' | 'geojson'
  sourceData: string        // 原始WKT字符串或GeoJSON字符串
  geojson: GeoJSONPolygon   // 解析后的标准GeoJSON
  visible: boolean
  color: string
  opacity: number           // 0-1 填充透明度
  favorite: boolean         // 收藏置顶
  order: number             // 排序序号
  group: string             // 分组标签（如 "省", "市", "县"）
}

// GeoJSON Polygon类型
export interface GeoJSONPolygon {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: number[][][] | number[][][][]
}

// 下载配置
export interface DownloadConfig {
  boundaryId: string        // 关联的边界ID
  tileSourceId: string      // 关联的瓦片源ID
  saveDir: string           // 保存目录
  nameFormat: string        // 命名格式，如 "{source}/{z}/{x}/{y}.png"
  minZoom: number
  maxZoom: number
}

// 下载任务状态
export interface DownloadTask {
  id: string
  config: DownloadConfig
  status: 'idle' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error'
  progress: {
    total: number
    completed: number
    failed: number
    skipped: number
  }
  error?: string
  failureStats?: Record<string, number>
  startedAt?: number
  completedAt?: number
}

// 瓦片坐标
export interface TileCoord {
  z: number
  x: number
  y: number
}

// 应用状态
export interface AppState {
  tileSources: TileSource[]
  boundaries: Boundary[]
  activeSourceId: string | null
  activeBoundaryId: string | null
  downloadTasks: DownloadTask[]
}
