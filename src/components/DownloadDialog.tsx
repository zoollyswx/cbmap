import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { getPolygonBBox, filterTilesByPolygon } from '../utils/tileClip'
import { getTilesByExtent, expandBBox, estimateTileCount } from '../utils/tileMath'
import type { DownloadTask } from '../types'

export default function DownloadDialog() {
  const {
    tileSources, activeSourceId,
    boundaries, activeBoundaryId,
    downloadTasks, addDownloadTask, updateDownloadTask, removeDownloadTask,
    setDownloadDialogOpen,
    setPreviewTiles,
  } = useStore()

  const [saveDir, setSaveDir] = useState('')
  const [nameFormat, setNameFormat] = useState('{source}/{z}/{x}/{y}.png')
  const [customNameFormat, setCustomNameFormat] = useState('')
  const [nameFormatMode, setNameFormatMode] = useState<'preset' | 'custom'>('preset')
  const [minZoom, setMinZoom] = useState(5)
  const [maxZoom, setMaxZoom] = useState(14)
  const [bufferKm, setBufferKm] = useState(0.5)
  const [concurrency, setConcurrency] = useState(12)
  const [estimate, setEstimate] = useState(0)
  const [isFiltering, setIsFiltering] = useState(false)
  const [filteredTiles, setFilteredTiles] = useState<{ z: number; x: number; y: number }[]>([])

  const activeBoundary = boundaries.find(b => b.id === activeBoundaryId)
  const activeSource = tileSources.find(s => s.id === activeSourceId)
  const activeTask = downloadTasks.find(t =>
    t.config.boundaryId === activeBoundaryId && t.config.tileSourceId === activeSourceId
  )

  // 检测是否为 MultiPolygon（子多边形间区域也应下载）
  const isMultiPolygon = activeBoundary?.geojson.type === 'MultiPolygon'
  // MultiPolygon 或有缓冲距离时，不裁剪到多边形形状，取外围 bbox 全量
  const useFullBbox = isMultiPolygon || bufferKm > 0

  // 命名格式预设
  const NAME_FORMAT_PRESETS = [
    { label: '{source}/{z}/{x}/{y}.png', value: '{source}/{z}/{x}/{y}.png' },
    { label: '{source}/{z}/{x}_{y}.png', value: '{source}/{z}/{x}_{y}.png' },
    { label: '{source}/L{z}/{x}/{y}.png', value: '{source}/L{z}/{x}/{y}.png' },
    { label: '{z}/{x}/{y}.png', value: '{z}/{x}/{y}.png' },
    { label: 'TMS: {source}/{z}/{x}/{reverseY}.png', value: '{source}/{z}/{x}/{reverseY}.png' },
  ]
  const activeNameFormat = nameFormatMode === 'custom' ? customNameFormat : nameFormat

  // 加载默认配置
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getConfig().then(config => {
        if (config.defaultSaveDir) setSaveDir(config.defaultSaveDir)
        if (config.defaultNameFormat) setNameFormat(config.defaultNameFormat)
      })
    }
  }, [])

  // 估算瓦片数量（轻量，避免生成巨型数组）
  useEffect(() => {
    if (!activeBoundary) return

    setIsFiltering(true)
    const timer = setTimeout(() => {
      try {
        const rawBbox = getPolygonBBox(activeBoundary.geojson)
        const bbox = expandBBox(rawBbox, bufferKm)

        // 用纯数学估算数量，不为估算生成完整瓦片列表
        let count = estimateTileCount(bbox, minZoom, maxZoom)
        if (!useFullBbox && activeBoundary.geojson.type !== 'MultiPolygon') {
          // 单 Polygon 裁剪大约只取 bbox 的 50% ~ 80%，粗略折减
          count = Math.ceil(count * 0.65)
        }

        setEstimate(count)
        setFilteredTiles([]) // 推迟到实际下载时再生成
        setPreviewTiles([])
      } catch {
        setEstimate(0)
        setFilteredTiles([])
        setPreviewTiles([])
      }
      setIsFiltering(false)
    }, 100)

    return () => clearTimeout(timer)
  }, [activeBoundary, minZoom, maxZoom, bufferKm, useFullBbox, setPreviewTiles])

  // 下载参数变动时，自动清除已完成的任务（恢复为初始状态）
  useEffect(() => {
    if (activeTask && activeTask.status !== 'running') {
      removeDownloadTask(activeTask.id)
    }
  }, [minZoom, maxZoom, bufferKm, activeNameFormat, saveDir])

  const handleSelectDir = async () => {
    if (window.electronAPI) {
      const dir = await window.electronAPI.selectDirectory()
      if (dir) setSaveDir(dir)
    }
  }

  const handleStartDownload = async () => {
    if (!saveDir || !activeSource || !activeBoundary) {
      alert('请先配置保存目录')
      return
    }

    // 如果存在已完成的旧任务，先移除
    if (activeTask) {
      removeDownloadTask(activeTask.id)
    }

    // 逐级生成瓦片列表，避免一次性生成巨型数组导致内存溢出
    const rawBbox = getPolygonBBox(activeBoundary.geojson)
    const bbox = expandBBox(rawBbox, bufferKm)
    let tiles: { z: number; x: number; y: number }[] = []

    for (let z = minZoom; z <= maxZoom; z++) {
      const tilesAtZoom = getTilesByExtent(bbox, z, z)
      if (useFullBbox) {
        for (let i = 0; i < tilesAtZoom.length; i++) {
          tiles.push(tilesAtZoom[i])
        }
      } else {
        const filtered = filterTilesByPolygon(tilesAtZoom, activeBoundary.geojson)
        for (let i = 0; i < filtered.length; i++) {
          tiles.push(filtered[i])
        }
      }
    }

    const taskId = `task_${Date.now()}`
    const task: DownloadTask = {
      id: taskId,
      config: {
        boundaryId: activeBoundaryId!,
        tileSourceId: activeSourceId!,
        saveDir,
        nameFormat: activeNameFormat,
        minZoom,
        maxZoom,
      },
      status: 'idle',
      progress: { total: tiles.length, completed: 0, failed: 0, skipped: 0 },
    }

    addDownloadTask(task)
    updateDownloadTask(taskId, { status: 'running' })

    // MapView renders the grid from the current viewport; do not retain the full tile list for preview.
    setFilteredTiles([])
    setPreviewTiles([])

    // 保存配置
    if (window.electronAPI) {
      window.electronAPI.saveConfig({ defaultSaveDir: saveDir, defaultNameFormat: activeNameFormat })
      await window.electronAPI.mkdir(saveDir)
    }

    if (window.electronAPI) {
      window.electronAPI.startDownload({
        tiles,
        urlTemplate: activeSource.urlTemplate,
        saveDir,
        nameFormat: activeNameFormat,
        sourceName: activeSource.name,
        subdomains: activeSource.subdomains,
        taskId,
        concurrency,
      })
    } else {
      // 浏览器模拟下载
      simulateDownload(taskId, tiles)
    }
  }

  const simulateDownload = async (taskId: string, tiles: typeof filteredTiles) => {
    for (let i = 0; i < tiles.length; i++) {
      await new Promise(r => setTimeout(r, 10))
      useStore.getState().updateDownloadTask(taskId, {
        progress: {
          total: tiles.length,
          completed: i + 1,
          failed: 0,
          skipped: 0,
        },
      })
    }
    useStore.getState().updateDownloadTask(taskId, { status: 'completed' })
  }

  const handleCancel = () => {
    if (activeTask && activeTask.status === 'running') {
      if (window.electronAPI) {
        window.electronAPI.cancelDownload(activeTask.id)
      }
      updateDownloadTask(activeTask.id, { status: 'cancelled' })
    }
  }

  const handleRetryFailed = async () => {
    if (!activeTask || !activeSource) return
    const failedCount = activeTask.progress.failed
    if (failedCount === 0) return

    const retryTaskId = `retry_${Date.now()}`
    updateDownloadTask(activeTask.id, { status: 'running' })

    if (window.electronAPI) {
      window.electronAPI.retryFailed({
        tiles: [],
        urlTemplate: activeSource.urlTemplate,
        saveDir,
        nameFormat: activeNameFormat,
        sourceName: activeSource.name,
        subdomains: activeSource.subdomains,
        taskId: activeTask.id, // 复用原 taskId 以获取 failedCoords
        concurrency,
      })
    } else {
      simulateDownload(retryTaskId, [])
    }
  }

  const handleClose = () => {
    setDownloadDialogOpen(false)
    setPreviewTiles([])
  }

  const isRunning = activeTask?.status === 'running'
  const isDone = activeTask?.status === 'completed'
  const hasFailed = activeTask?.progress.failed && activeTask.progress.failed > 0
  const progress = activeTask?.progress
  const processedCount = progress
    ? progress.completed + progress.skipped + progress.failed
    : 0
  const failureEntries = activeTask?.failureStats
    ? Object.entries(activeTask.failureStats)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : []

  return (
    <div className="download-overlay">
      <div className="dl-header">
        <h3>下载瓦片</h3>
        <button
          onClick={handleClose}
          style={{
            background: 'transparent', border: 'none',
            color: '#fff', cursor: 'pointer', fontSize: 18,
          }}
        >
          ✕
        </button>
      </div>

      <div className="dl-body">
        <div className="form-group">
          <label>瓦片源：{activeSource?.name}</label>
        </div>

        <div className="form-group">
          <label>边界：{activeBoundary?.name}</label>
        </div>

        <div className="form-group">
          <label>保存目录</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={saveDir}
              onChange={e => setSaveDir(e.target.value)}
              placeholder="选择或输入保存目录"
              style={{ flex: 1 }}
            />
            <button
              onClick={handleSelectDir}
              style={{
                padding: '4px 12px', border: '1px solid #ddd',
                borderRadius: 4, background: '#f5f5f5', cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              浏览...
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>命名格式</label>
          <select
            value={nameFormatMode === 'custom' ? '__custom__' : nameFormat}
            onChange={e => {
              const v = e.target.value
              if (v === '__custom__') {
                setNameFormatMode('custom')
                setCustomNameFormat(nameFormat || '{source}/{z}/{x}/{y}.png')
              } else {
                setNameFormatMode('preset')
                setNameFormat(v)
              }
            }}
            style={{
              width: '100%', padding: '6px 10px', border: '1px solid #ddd',
              borderRadius: 4, fontSize: 13, background: '#fff',
            }}
          >
            {NAME_FORMAT_PRESETS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
            <option value="__custom__">自定义格式...</option>
          </select>
          {nameFormatMode === 'custom' && (
            <input
              value={customNameFormat}
              onChange={e => setCustomNameFormat(e.target.value)}
              placeholder="输入自定义格式..."
              style={{ marginTop: 6 }}
            />
          )}
          <div style={{
            fontSize: 11, color: '#4fc3f7', marginTop: 4,
            background: 'rgba(79,195,247,0.06)', padding: '4px 8px', borderRadius: 4,
            fontFamily: 'monospace',
          }}>
            示例：{activeNameFormat
              .replace('{source}', activeSource?.name || '源名称')
              .replace('{z}', '5')
              .replace('{x}', '12')
              .replace('{y}', '10')
              .replace('{reverseY}', '21')}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>最小级别</label>
            <input
              type="number"
              min={0} max={22}
              value={minZoom}
              onChange={e => setMinZoom(Number(e.target.value))}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>最大级别</label>
            <input
              type="number"
              min={0} max={22}
              value={maxZoom}
              onChange={e => setMaxZoom(Number(e.target.value))}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>
              并发数
              <span style={{ fontWeight: 400, color: '#999', marginLeft: 4, fontSize: 11 }}>
                — 同时下载的线程数
              </span>
            </label>
            <select
              value={concurrency}
              onChange={e => setConcurrency(Number(e.target.value))}
              style={{
                width: '100%', padding: '6px 10px', border: '1px solid #ddd',
                borderRadius: 4, fontSize: 13, background: '#fff',
              }}
            >
              {[1, 2, 4, 6, 8, 10, 12, 16, 20, 24].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>
            缓冲距离（km）
            <span style={{ fontWeight: 400, color: '#999', marginLeft: 4 }}>
              — 下载边界外一定范围内的瓦片
            </span>
          </label>
          <input
            type="number"
            min={0} max={100} step={0.5}
            value={bufferKm}
            onChange={e => setBufferKm(Number(e.target.value))}
          />
        </div>

        {useFullBbox && (
          <div style={{
            fontSize: 11, color: '#1976d2', background: 'rgba(25,118,210,0.08)',
            padding: '6px 10px', borderRadius: 4, marginBottom: 12,
          }}>
            {isMultiPolygon && bufferKm > 0
              ? '多面边界 + 缓冲：下载最外围矩形范围内全部瓦片（含子面之间的区域及缓冲带）'
              : isMultiPolygon
                ? '多面边界：下载最外围矩形范围内全部瓦片（含子面之间的区域）'
                : '启用缓冲：下载扩展矩形范围内全部瓦片（不做多边形裁剪）'
            }
          </div>
        )}

        <div className="form-group">
          <label>
            估算瓦片数：
            {isFiltering ? (
              <span style={{ color: '#999' }}>计算中...</span>
            ) : (
              <strong style={{ color: estimate > 0 ? '#333' : '#999' }}>
                {estimate.toLocaleString()}
              </strong>
            )}
          </label>
        </div>

        {activeTask && (
          <div className="form-group">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${activeTask.status === 'completed' || activeTask.status === 'cancelled'
                    ? 100
                    : progress && progress.total > 0
                      ? (processedCount / progress.total) * 100
                      : 0}%`,
                  background: activeTask.status === 'completed'
                    ? '#4caf50'
                    : activeTask.status === 'error'
                    ? '#f44336'
                    : activeTask.status === 'cancelled'
                    ? '#ff9800'
                    : '#1976d2',
                }}
              />
            </div>
            <div className="progress-text">
              {progress && (
                <>
                  已完成: {progress.completed.toLocaleString()}
                  {progress.skipped > 0 && ` | 跳过: ${progress.skipped.toLocaleString()}`}
                  {progress.failed > 0 && ` | 失败: ${progress.failed.toLocaleString()}`}
                  {' | '}总计: {progress.total.toLocaleString()}
                </>
              )}
            </div>
            {failureEntries.length > 0 && (
              <div style={{
                fontSize: 11,
                color: '#b45309',
                marginTop: 4,
                lineHeight: 1.5,
              }}>
                失败原因: {failureEntries
                  .map(([reason, count]) => `${reason}: ${count.toLocaleString()}`)
                  .join(' | ')}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {isRunning ? (
            <button
              onClick={handleCancel}
              style={{
                flex: 1, padding: '8px', border: 'none', borderRadius: 6,
                background: '#ff9800', color: '#fff', cursor: 'pointer', fontSize: 13,
              }}
            >
              取消下载
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, flex: 1 }}>
              <button
                onClick={handleStartDownload}
                disabled={!saveDir || estimate === 0}
                style={{
                  flex: 1, padding: '8px', border: 'none', borderRadius: 6,
                  background: (!saveDir || estimate === 0) ? '#ccc' : '#4caf50',
                  color: '#fff', cursor: (!saveDir || estimate === 0) ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                }}
              >
                {isDone ? '重新下载' : '开始下载'}
              </button>
              {isDone && hasFailed && (
                <button
                  onClick={handleRetryFailed}
                  style={{
                    padding: '6px 14px', border: 'none', borderRadius: 6,
                    background: '#ff9800', color: '#fff', cursor: 'pointer', fontSize: 12,
                    whiteSpace: 'nowrap',
                  }}
                >
                  重试失败项 ({activeTask!.progress.failed})
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
