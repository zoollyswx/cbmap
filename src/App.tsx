import { useEffect, useRef } from 'react'
import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import TileSourceForm from './components/TileSourceForm'
import DownloadDialog from './components/DownloadDialog'

export default function App() {
  const {
    tileSources, setTileSources,
    boundaries, setBoundaries,
    editingSource, setEditingSource,
    downloadDialogOpen,
  } = useStore()

  // 防止数据未加载完就触发保存
  const dataLoaded = useRef(false)

  // 加载已保存的数据
  useEffect(() => {
    if (window.electronAPI) {
      Promise.all([
        window.electronAPI.getSources(),
        window.electronAPI.getBoundaries(),
      ]).then(([sources, bds]) => {
        // 先标记加载完成，再设置状态（React 18 批处理后 dataLoaded 已为 true）
        dataLoaded.current = true
        setTileSources(sources)
        setBoundaries(bds)
      })

      // 监听下载进度
      window.electronAPI.onDownloadProgress((data) => {
        useStore.getState().updateDownloadTask(data.taskId, {
          status: data.status,
          progress: data.progress,
          failureStats: data.failureStats,
        })
      })
    } else {
      // 浏览器开发模式 - 加载示例数据
      loadDemoData()
      dataLoaded.current = true
    }
  }, [])

  // 持久化瓦片源（跳过初始空状态）
  useEffect(() => {
    if (dataLoaded.current && window.electronAPI) {
      window.electronAPI.saveSources(tileSources)
    }
  }, [tileSources])

  // 持久化边界（跳过初始空状态）
  useEffect(() => {
    if (dataLoaded.current && window.electronAPI) {
      window.electronAPI.saveBoundaries(boundaries)
    }
  }, [boundaries])

  return (
    <div className="app-layout">
      <Sidebar />
      <MapView />
      {editingSource && <TileSourceForm />}
      {downloadDialogOpen && <DownloadDialog />}
    </div>
  )
}

function loadDemoData() {
  const store = useStore.getState()
  store.setTileSources([
    {
      id: 'osm',
      name: 'OpenStreetMap',
      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      minZoom: 0,
      maxZoom: 19,
      opacity: 1,
      subdomains: [],
      attribution: '© OpenStreetMap contributors',
    },
    {
      id: 'osm-topo',
      name: 'OpenTopoMap',
      urlTemplate: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      minZoom: 0,
      maxZoom: 17,
      opacity: 1,
      subdomains: ['a', 'b', 'c'],
      attribution: '© OpenTopoMap contributors',
    },
  ])
}
