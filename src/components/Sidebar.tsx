import { useState, useMemo, useEffect, useCallback } from 'react'
import { useStore, detectGroup } from '../store/useStore'
import BoundaryImporter from './BoundaryImporter'

// ---- 颜色选择器 ----
const PRESET_COLORS = [
  '#ff6f00', '#1976d2', '#388e3c', '#d32f2f', '#7b1fa2',
  '#0097a7', '#e64a19', '#455a64', '#00bfa5', '#ff6d00',
  '#304ffe', '#c51162', '#64dd17', '#aa00ff', '#2962ff',
]

function ColorPicker({ current, onChange, onClose }: {
  current: string; onChange: (c: string) => void; onClose: () => void
}) {
  return (
    <div style={{
      position: 'absolute', left: 48, zIndex: 20,
      background: '#2a2a4a', borderRadius: 6, padding: 6,
      display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4,
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)', border: '1px solid #444',
    }}>
      {PRESET_COLORS.map(c => (
        <div key={c} style={{
          width: 22, height: 22, borderRadius: 3, background: c, cursor: 'pointer',
          border: c === current ? '2px solid #fff' : '1px solid transparent',
          boxSizing: 'border-box',
        }} onClick={() => onChange(c)} />
      ))}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 4, marginTop: 4 }}>
        <input type="color" value={current}
          style={{ flex: 1, height: 22, cursor: 'pointer', border: 'none', background: 'transparent' }}
          onChange={e => onChange(e.target.value)} />
        <button onClick={onClose} style={{
          background: 'none', border: '1px solid #555', color: '#aaa',
          borderRadius: 3, fontSize: 10, cursor: 'pointer', padding: '0 6px',
        }}>✕</button>
      </div>
    </div>
  )
}

// ---- 小按钮样式 ----
const miniBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#888', cursor: 'pointer',
  fontSize: 10, padding: '1px 4px',
}

export default function Sidebar() {
  const {
    tileSources, activeSourceId, setActiveSource,
    deleteTileSource, setEditingSource,
    boundaries, activeBoundaryId, setActiveBoundary,
    deleteBoundary, toggleBoundaryVisible, renameBoundary, setBoundaryColor,
    setBoundaryOpacity, toggleFavorite, moveBoundary, batchRename,
    selectedBoundaryIds, toggleSelectBoundary,
    selectAllBoundaries, clearSelection, deleteSelectedBoundaries,
    setDownloadDialogOpen,
    batchRenameOpen, setBatchRenameOpen,
  } = useStore()

  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)
  const [opacitySliderId, setOpacitySliderId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [batchPrefix, setBatchPrefix] = useState('')
  const [batchSuffix, setBatchSuffix] = useState('')

  // 过滤
  const filtered = useMemo(() => {
    if (!search.trim()) return boundaries
    const q = search.toLowerCase()
    return boundaries.filter(b => b.name.toLowerCase().includes(q))
  }, [boundaries, search])

  // 分组 + 排序：收藏置顶，然后按 order
  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
      return (a.order || 0) - (b.order || 0)
    })

    const groups = new Map<string, typeof sorted>()
    for (const b of sorted) {
      const g = b.group || detectGroup(b.name)
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(b)
    }

    // 分组顺序：收藏 > 省 > 市 > 县 > 乡镇 > 绘制 > 其他
    const order = ['收藏', '省', '市', '县', '乡镇', '绘制', '其他']
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const ia = order.indexOf(a), ib = order.indexOf(b)
      return (ia >= 0 ? ia : 99) - (ib >= 0 ? ib : 99)
    })
  }, [filtered])

  // 键盘快捷键
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedBoundaryIds.size > 0) {
        e.preventDefault()
        if (confirm(`确定要删除选中的 ${selectedBoundaryIds.size} 个边界吗？`)) {
          deleteSelectedBoundaries()
        }
      }
    }
  }, [selectedBoundaryIds, deleteSelectedBoundaries])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // ---- 操作函数 ----
  const handleAddSource = () => {
    setEditingSource({
      id: '', name: '', urlTemplate: '', labelUrlTemplate: '',
      minZoom: 0, maxZoom: 18, opacity: 1, subdomains: [], attribution: '',
    })
  }

  const startRename = (id: string, name: string) => {
    setEditingId(id)
    setEditName(name)
  }
  const commitRename = () => {
    if (editingId && editName.trim()) renameBoundary(editingId, editName.trim())
    setEditingId(null)
  }

  const handleExport = () => {
    const ids = selectedBoundaryIds
    const toExport = ids.size > 0 ? boundaries.filter(b => ids.has(b.id)) : boundaries
    if (toExport.length === 0) { alert('没有可导出的边界'); return }
    const geojson = {
      type: 'FeatureCollection',
      features: toExport.map(b => ({
        type: 'Feature',
        properties: { name: b.name, color: b.color, opacity: b.opacity },
        geometry: b.geojson,
      })),
    }
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `boundaries_${new Date().toISOString().slice(0, 10)}.geojson`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleBatchRename = () => {
    const ids = selectedBoundaryIds.size > 0 ? [...selectedBoundaryIds] : boundaries.map(b => b.id)
    batchRename(ids, batchPrefix, batchSuffix)
    setBatchPrefix('')
    setBatchSuffix('')
    setBatchRenameOpen(false)
  }

  const toggleGroup = (group: string) => {
    const next = new Set(collapsedGroups)
    if (next.has(group)) next.delete(group)
    else next.add(group)
    setCollapsedGroups(next)
  }

  const ckStyle = (checked: boolean): React.CSSProperties => ({
    width: 15, height: 15, flexShrink: 0,
    border: `1.5px solid ${checked ? '#1976d2' : '#555'}`,
    borderRadius: 3, background: checked ? '#1976d2' : 'transparent',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, color: '#fff',
  })

  const canDownload = activeSourceId && activeBoundaryId
  const hasSelection = selectedBoundaryIds.size > 0

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>CBMap</h2>
        <div className="subtitle">地图瓦片管理器</div>
      </div>

      {/* ---- 瓦片源 ---- */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">瓦片源</div>
        {tileSources.map((source) => (
          <div key={source.id}
            className={`source-tab ${activeSourceId === source.id ? 'active' : ''}`}
            onClick={() => setActiveSource(source.id)}
            title={`${source.name}\n${source.urlTemplate}`}
          >
            <span className="source-name">{source.name}</span>
            <div className="source-actions">
              <button className="action-btn" onClick={(e) => { e.stopPropagation(); setEditingSource({ ...source }) }} title="编辑">✎</button>
              <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); if (confirm('确定要删除此瓦片源吗？')) deleteTileSource(source.id) }} title="删除">✕</button>
            </div>
          </div>
        ))}
        <button className="add-btn" onClick={handleAddSource}>+ 添加瓦片源</button>
      </div>

      {/* ---- 边界 ---- */}
      <div className="sidebar-section" style={{ flex: 1 }}>
        <div className="sidebar-section-title">
          边界
          <span style={{ fontSize: 10, color: '#888', marginLeft: 4 }}>
            {search ? `${filtered.length}/${boundaries.length}` : boundaries.length}
          </span>
        </div>

        {/* 搜索 */}
        {boundaries.length > 0 && (
          <div style={{ padding: '0 8px 4px' }}>
            <input
              style={{
                width: '100%', padding: '4px 8px', border: '1px solid #333',
                borderRadius: 4, background: '#1a1a2e', color: '#ccc', fontSize: 11, outline: 'none',
              }}
              placeholder="搜索边界名称..."
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}

        {/* 批量工具栏 */}
        {boundaries.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 6px', fontSize: 11, color: '#aaa' }}>
            <span style={ckStyle(filtered.length > 0 && filtered.every(b => selectedBoundaryIds.has(b.id)))}
              onClick={() => {
                const allSel = filtered.every(b => selectedBoundaryIds.has(b.id))
                if (allSel) clearSelection()
                else filtered.forEach(b => { if (!selectedBoundaryIds.has(b.id)) toggleSelectBoundary(b.id) })
              }}
              title="全选/取消"
            />
            <span style={{ flex: 1 }} />
            <button onClick={handleExport} style={miniBtn} title="导出GeoJSON">📤导出</button>
            <button onClick={() => setBatchRenameOpen(!batchRenameOpen)} style={miniBtn} title="批量重命名">✏批量改名</button>
            {hasSelection && (
              <button onClick={() => {
                if (confirm(`确定要删除选中的 ${selectedBoundaryIds.size} 个边界吗？`)) deleteSelectedBoundaries()
              }} style={{ ...miniBtn, color: '#d32f2f' }}>🗑({selectedBoundaryIds.size})</button>
            )}
          </div>
        )}

        {/* 批量重命名面板 */}
        {batchRenameOpen && (
          <div style={{ padding: '4px 8px', background: '#1a1a30', borderBottom: '1px solid #333', fontSize: 11 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input placeholder="前缀" value={batchPrefix} onChange={e => setBatchPrefix(e.target.value)}
                style={inputSm} />
              <input placeholder="后缀" value={batchSuffix} onChange={e => setBatchSuffix(e.target.value)}
                style={inputSm} />
            </div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button onClick={() => setBatchRenameOpen(false)} style={miniBtn}>取消</button>
              <button onClick={handleBatchRename} style={{ ...miniBtn, color: '#4fc3f7' }}>
                应用{hasSelection ? `(选中${selectedBoundaryIds.size})` : '(全部)'}
              </button>
            </div>
          </div>
        )}

        {/* 边界列表（按分组） */}
        {grouped.map(([group, items]) => {
          const collapsed = collapsedGroups.has(group)
          return (
            <div key={group}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', padding: '4px 8px',
                  cursor: 'pointer', fontSize: 11, color: '#888',
                  borderBottom: '1px solid #1a1a30',
                }}
                onClick={() => toggleGroup(group)}
              >
                <span style={{ marginRight: 4, fontSize: 10 }}>{collapsed ? '▶' : '▼'}</span>
                <span>{group}</span>
                <span style={{ marginLeft: 4, color: '#555' }}>({items.length})</span>
                <span style={{ flex: 1 }} />
                <button onClick={(e) => {
                  e.stopPropagation()
                  items.forEach(b => { if (!selectedBoundaryIds.has(b.id)) toggleSelectBoundary(b.id) })
                }} style={miniBtn} title="选中本组">☐</button>
                <button onClick={(e) => {
                  e.stopPropagation()
                  items.forEach(b => { if (!b.visible) toggleBoundaryVisible(b.id) })
                }} style={miniBtn} title="显示本组">👁</button>
                <button onClick={(e) => {
                  e.stopPropagation()
                  items.forEach(b => { if (b.visible) toggleBoundaryVisible(b.id) })
                }} style={miniBtn} title="隐藏本组">━</button>
              </div>

              {!collapsed && items.map((b, idx) => {
                const isSelected = selectedBoundaryIds.has(b.id)
                return (
                  <div key={b.id}
                    className={`boundary-item ${activeBoundaryId === b.id ? 'active' : ''}`}
                    style={{ background: isSelected ? 'rgba(25,118,210,0.15)' : undefined }}
                  >
                    <span style={ckStyle(isSelected)}
                      onClick={(e) => { e.stopPropagation(); toggleSelectBoundary(b.id) }}
                    >{isSelected ? '✓' : ''}</span>

                    {/* ⭐ 收藏 */}
                    <span style={{
                      cursor: 'pointer', fontSize: 11, flexShrink: 0, opacity: b.favorite ? 1 : 0.3,
                    }}
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(b.id) }}
                      title={b.favorite ? '取消收藏' : '收藏'}
                    >⭐</span>

                    {/* 颜色 */}
                    <span style={{
                      width: 12, height: 12, borderRadius: 3, background: b.color,
                      flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)',
                    }}
                      onClick={(e) => { e.stopPropagation(); setColorPickerId(colorPickerId === b.id ? null : b.id) }}
                      title="换颜色"
                    />
                    {colorPickerId === b.id && (
                      <ColorPicker current={b.color} onChange={(c) => { setBoundaryColor(b.id, c); setColorPickerId(null) }} onClose={() => setColorPickerId(null)} />
                    )}

                    {/* 名称 / 编辑 */}
                    {editingId === b.id ? (
                      <input
                        style={{ flex: 1, minWidth: 0, padding: '2px 4px', border: '1px solid #4fc3f7', borderRadius: 3, background: '#1a1a2e', color: '#fff', fontSize: 12, outline: 'none' }}
                        value={editName} onChange={e => setEditName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
                        autoFocus onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="boundary-name" style={{ flex: 1 }}
                        onClick={() => { if (!b.visible) toggleBoundaryVisible(b.id); setActiveBoundary(b.id) }}
                        onDoubleClick={(e) => { e.stopPropagation(); startRename(b.id, b.name) }}
                      >{b.name}</span>
                    )}

                    {/* 显示/隐藏 */}
                    <button className="visibility-btn"
                      onClick={(e) => { e.stopPropagation(); toggleBoundaryVisible(b.id) }}
                      title={b.visible ? '隐藏' : '显示'}
                    >{b.visible ? '👁' : '━'}</button>

                    {/* 透明度滑条 */}
                    <span style={{ fontSize: 10, color: '#888', cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); setOpacitySliderId(opacitySliderId === b.id ? null : b.id) }}
                      title="透明度"
                    >◐</span>
                    {opacitySliderId === b.id && (
                      <div style={{
                        position: 'absolute', right: 60, zIndex: 20,
                        background: '#2a2a4a', borderRadius: 6, padding: '6px 10px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.5)', border: '1px solid #444',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <input type="range" min={0} max={1} step={0.05}
                          value={b.opacity ?? 0.12}
                          onChange={e => setBoundaryOpacity(b.id, Number(e.target.value))}
                          style={{ width: 60 }}
                        />
                        <span style={{ fontSize: 11, color: '#aaa', minWidth: 28 }}>{((b.opacity ?? 0.12) * 100).toFixed(0)}%</span>
                        <button onClick={() => setOpacitySliderId(null)} style={miniBtn}>✕</button>
                      </div>
                    )}

                    {/* 排序 */}
                    <button onClick={(e) => { e.stopPropagation(); moveBoundary(b.id, 'up') }}
                      style={{ ...miniBtn, fontSize: 8, padding: 0, width: 14 }}
                      disabled={idx === 0}
                      title="上移"
                    >▲</button>
                    <button onClick={(e) => { e.stopPropagation(); moveBoundary(b.id, 'down') }}
                      style={{ ...miniBtn, fontSize: 8, padding: 0, width: 14 }}
                      disabled={idx === items.length - 1}
                      title="下移"
                    >▼</button>

                    {/* 删除 */}
                    <button className="action-btn delete" style={{ width: 20, height: 20, fontSize: 9 }}
                      onClick={(e) => { e.stopPropagation(); if (confirm('确定要删除此边界吗？')) deleteBoundary(b.id) }}
                      title="删除"
                    >✕</button>
                  </div>
                )
              })}
            </div>
          )
        })}

        {search && filtered.length === 0 && (
          <div style={{ padding: 12, textAlign: 'center', color: '#666', fontSize: 12 }}>无匹配结果</div>
        )}

        <BoundaryImporter />
      </div>

      {/* 下载按钮 */}
      <div style={{ padding: 8, borderTop: '1px solid #2a2a4a' }}>
        <button className="add-btn"
          style={{
            borderColor: canDownload ? '#4caf50' : '#444',
            color: canDownload ? '#4caf50' : '#666',
            cursor: canDownload ? 'pointer' : 'not-allowed',
          }}
          disabled={!canDownload}
          onClick={() => canDownload && setDownloadDialogOpen(true)}
        >
          {canDownload ? '⬇ 下载瓦片' : '请先选择瓦片源和边界'}
        </button>
      </div>
    </div>
  )
}

const inputSm: React.CSSProperties = {
  flex: 1, padding: '2px 6px', border: '1px solid #333', borderRadius: 3,
  background: '#1a1a2e', color: '#ccc', fontSize: 11, outline: 'none',
}
