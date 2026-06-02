import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import type { TileSource } from '../types'

const emptySource: TileSource = {
  id: '',
  name: '',
  urlTemplate: '',
  labelUrlTemplate: '',
  minZoom: 0,
  maxZoom: 18,
  opacity: 1,
  subdomains: [],
  attribution: '',
}

export default function TileSourceForm() {
  const { editingSource, setEditingSource, addTileSource, updateTileSource } = useStore()
  const [form, setForm] = useState<TileSource>(editingSource || emptySource)
  const [subdomainStr, setSubdomainStr] = useState(
    editingSource?.subdomains?.join(',') || ''
  )

  useEffect(() => {
    if (editingSource) {
      setForm(editingSource)
      setSubdomainStr(editingSource.subdomains?.join(',') || '')
    }
  }, [editingSource])

  const handleSubmit = () => {
    if (!form.name.trim() || !form.urlTemplate.trim()) {
      alert('请填写名称和URL模板')
      return
    }

    const source: TileSource = {
      ...form,
      id: form.id || `source_${Date.now()}`,
      subdomains: subdomainStr.split(',').map(s => s.trim()).filter(Boolean),
    }

    if (editingSource?.id) {
      updateTileSource(source)
    } else {
      addTileSource(source)
    }
    setEditingSource(null)
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  }

  const dialogStyle: React.CSSProperties = {
    background: '#1e1e3a',
    borderRadius: 12,
    padding: 24,
    width: 440,
    maxHeight: '90vh',
    overflowY: 'auto',
    color: '#e0e0e0',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #444',
    borderRadius: 6,
    background: '#2a2a4a',
    color: '#e0e0e0',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#aaa',
  }

  return (
    <div style={overlayStyle} onClick={() => setEditingSource(null)}>
      <div style={dialogStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', color: '#4fc3f7', fontSize: 16 }}>
          {editingSource?.id ? '编辑瓦片源' : '添加瓦片源'}
        </h3>

        <div>
          <label style={labelStyle}>名称 *</label>
          <input
            style={inputStyle}
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="示例：OpenStreetMap"
          />
        </div>

        <div>
          <label style={labelStyle}>地图URL模板 *</label>
          <input
            style={inputStyle}
            value={form.urlTemplate}
            onChange={e => setForm({ ...form, urlTemplate: e.target.value })}
            placeholder="https://{s}.tile.osm.org/{z}/{x}/{y}.png"
          />
          <div style={{ fontSize: 11, color: '#666', marginTop: -8, marginBottom: 8 }}>
            支持 &#123;z&#125; &#123;x&#125; &#123;y&#125; &#123;s&#125; 占位符
          </div>
        </div>

        <div>
          <label style={labelStyle}>标签URL模板（可选）</label>
          <input
            style={inputStyle}
            value={form.labelUrlTemplate || ''}
            onChange={e => setForm({ ...form, labelUrlTemplate: e.target.value })}
            placeholder="留空则不显示标签层"
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>最小缩放级别</label>
            <input
              style={inputStyle}
              type="number"
              min={0} max={22}
              value={form.minZoom}
              onChange={e => setForm({ ...form, minZoom: Number(e.target.value) })}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>最大缩放级别</label>
            <input
              style={inputStyle}
              type="number"
              min={0} max={22}
              value={form.maxZoom}
              onChange={e => setForm({ ...form, maxZoom: Number(e.target.value) })}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>子域名（逗号分隔）</label>
          <input
            style={inputStyle}
            value={subdomainStr}
            onChange={e => setSubdomainStr(e.target.value)}
            placeholder="a,b,c"
          />
        </div>

        <div>
          <label style={labelStyle}>透明度</label>
          <input
            style={inputStyle}
            type="range"
            min={0} max={1} step={0.1}
            value={form.opacity}
            onChange={e => setForm({ ...form, opacity: Number(e.target.value) })}
          />
          <span style={{ fontSize: 12, color: '#888' }}>{form.opacity}</span>
        </div>

        <div>
          <label style={labelStyle}>版权信息</label>
          <input
            style={inputStyle}
            value={form.attribution || ''}
            onChange={e => setForm({ ...form, attribution: e.target.value })}
            placeholder="© contributors"
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            style={{
              padding: '8px 20px', border: '1px solid #555', borderRadius: 6,
              background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: 13,
            }}
            onClick={() => setEditingSource(null)}
          >
            取消
          </button>
          <button
            style={{
              padding: '8px 20px', border: 'none', borderRadius: 6,
              background: '#1976d2', color: '#fff', cursor: 'pointer', fontSize: 13,
            }}
            onClick={handleSubmit}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
