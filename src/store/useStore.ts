import { create } from 'zustand'
import type { TileSource, Boundary, DownloadTask, TileCoord } from '../types'

// 自动检测边界分组
export function detectGroup(name: string): string {
  if (/省$/.test(name) || /自治区$/.test(name) || /直辖市$/.test(name) || /特别行政区$/.test(name)) return '省'
  if (/市$/.test(name) || /州$/.test(name) || /盟$/.test(name) || /地区$/.test(name)) return '市'
  if (/县$/.test(name) || /区$/.test(name) || /旗$/.test(name) || /市$/.test(name)) return '县'
  if (/镇$/.test(name) || /乡$/.test(name) || /街道$/.test(name)) return '乡镇'
  return '其他'
}

interface StoreState {
  tileSources: TileSource[]
  activeSourceId: string | null
  setTileSources: (sources: TileSource[]) => void
  addTileSource: (source: TileSource) => void
  updateTileSource: (source: TileSource) => void
  deleteTileSource: (id: string) => void
  setActiveSource: (id: string | null) => void

  boundaries: Boundary[]
  activeBoundaryId: string | null
  selectedBoundaryIds: Set<string>
  setBoundaries: (boundaries: Boundary[]) => void
  addBoundary: (boundary: Boundary) => void
  updateBoundary: (boundary: Boundary) => void
  deleteBoundary: (id: string) => void
  setActiveBoundary: (id: string | null) => void
  toggleBoundaryVisible: (id: string) => void
  toggleSelectBoundary: (id: string) => void
  selectAllBoundaries: () => void
  clearSelection: () => void
  deleteSelectedBoundaries: () => void
  renameBoundary: (id: string, name: string) => void
  setBoundaryColor: (id: string, color: string) => void
  setBoundaryOpacity: (id: string, opacity: number) => void
  toggleFavorite: (id: string) => void
  moveBoundary: (id: string, direction: 'up' | 'down') => void
  batchRename: (ids: string[], prefix: string, suffix: string) => void
  batchSetVisible: (ids: string[], visible: boolean) => void

  downloadTasks: DownloadTask[]
  addDownloadTask: (task: DownloadTask) => void
  updateDownloadTask: (taskId: string, updates: Partial<DownloadTask>) => void
  removeDownloadTask: (taskId: string) => void

  editingSource: TileSource | null
  setEditingSource: (source: TileSource | null) => void
  downloadDialogOpen: boolean
  setDownloadDialogOpen: (open: boolean) => void

  batchRenameOpen: boolean
  setBatchRenameOpen: (open: boolean) => void

  previewTiles: TileCoord[]
  setPreviewTiles: (tiles: TileCoord[]) => void
}

export const useStore = create<StoreState>((set) => ({
  tileSources: [],
  activeSourceId: null,
  setTileSources: (sources) => set({ tileSources: sources }),
  addTileSource: (source) => set((s) => ({ tileSources: [...s.tileSources, source] })),
  updateTileSource: (source) => set((s) => ({
    tileSources: s.tileSources.map((t) => (t.id === source.id ? source : t)),
  })),
  deleteTileSource: (id) => set((s) => ({
    tileSources: s.tileSources.filter((t) => t.id !== id),
    activeSourceId: s.activeSourceId === id ? null : s.activeSourceId,
  })),
  setActiveSource: (id) => set({ activeSourceId: id }),

  boundaries: [],
  activeBoundaryId: null,
  selectedBoundaryIds: new Set<string>(),
  setBoundaries: (boundaries) => set({ boundaries }),
  addBoundary: (boundary) => set((s) => {
    const maxOrder = s.boundaries.reduce((max, b) => Math.max(max, b.order || 0), 0)
    const group = boundary.group || detectGroup(boundary.name)
    return { boundaries: [...s.boundaries, { ...boundary, order: maxOrder + 1, group }] }
  }),
  updateBoundary: (boundary) => set((s) => ({
    boundaries: s.boundaries.map((b) => (b.id === boundary.id ? boundary : b)),
  })),
  deleteBoundary: (id) => set((s) => ({
    boundaries: s.boundaries.filter((b) => b.id !== id),
    activeBoundaryId: s.activeBoundaryId === id ? null : s.activeBoundaryId,
    selectedBoundaryIds: new Set([...s.selectedBoundaryIds].filter(sid => sid !== id)),
  })),
  setActiveBoundary: (id) => set({ activeBoundaryId: id }),
  toggleBoundaryVisible: (id) => set((s) => ({
    boundaries: s.boundaries.map((b) =>
      b.id === id ? { ...b, visible: !b.visible } : b
    ),
  })),
  toggleSelectBoundary: (id) => set((s) => {
    const next = new Set(s.selectedBoundaryIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { selectedBoundaryIds: next }
  }),
  selectAllBoundaries: () => set((s) => ({
    selectedBoundaryIds: new Set(s.boundaries.map(b => b.id)),
  })),
  clearSelection: () => set({ selectedBoundaryIds: new Set() }),
  deleteSelectedBoundaries: () => set((s) => {
    const ids = s.selectedBoundaryIds
    return {
      boundaries: s.boundaries.filter((b) => !ids.has(b.id)),
      activeBoundaryId: ids.has(s.activeBoundaryId || '') ? null : s.activeBoundaryId,
      selectedBoundaryIds: new Set<string>(),
    }
  }),
  renameBoundary: (id, name) => set((s) => ({
    boundaries: s.boundaries.map((b) => (b.id === id ? { ...b, name } : b)),
  })),
  setBoundaryColor: (id, color) => set((s) => ({
    boundaries: s.boundaries.map((b) => (b.id === id ? { ...b, color } : b)),
  })),
  setBoundaryOpacity: (id, opacity) => set((s) => ({
    boundaries: s.boundaries.map((b) => (b.id === id ? { ...b, opacity } : b)),
  })),
  toggleFavorite: (id) => set((s) => ({
    boundaries: s.boundaries.map((b) =>
      b.id === id ? { ...b, favorite: !b.favorite } : b
    ),
  })),
  moveBoundary: (id, direction) => set((s) => {
    const sorted = [...s.boundaries].sort((a, b) => (a.order || 0) - (b.order || 0))
    const idx = sorted.findIndex(b => b.id === id)
    if (idx < 0) return s
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= sorted.length) return s

    // Swap orders
    const temp = sorted[idx].order
    sorted[idx] = { ...sorted[idx], order: sorted[targetIdx].order || 0 }
    sorted[targetIdx] = { ...sorted[targetIdx], order: temp || 0 }

    // Map back to original array (maintain id-based lookup)
    const orderMap = new Map(sorted.map(b => [b.id, b.order]))
    return {
      boundaries: s.boundaries.map(b =>
        orderMap.has(b.id) ? { ...b, order: orderMap.get(b.id)! } : b
      ),
    }
  }),
  batchRename: (ids, prefix, suffix) => set((s) => ({
    boundaries: s.boundaries.map((b) => {
      if (!ids.includes(b.id)) return b
      let name = b.name
      if (prefix) name = prefix + name
      if (suffix) name = name + suffix
      return { ...b, name }
    }),
  })),
  batchSetVisible: (ids, visible) => set((s) => ({
    boundaries: s.boundaries.map((b) =>
      ids.includes(b.id) ? { ...b, visible } : b
    ),
  })),

  downloadTasks: [],
  addDownloadTask: (task) => set((s) => ({ downloadTasks: [...s.downloadTasks, task] })),
  updateDownloadTask: (taskId, updates) => set((s) => ({
    downloadTasks: s.downloadTasks.map((t) =>
      t.id === taskId ? { ...t, ...updates } : t
    ),
  })),
  removeDownloadTask: (taskId) => set((s) => ({
    downloadTasks: s.downloadTasks.filter((t) => t.id !== taskId),
  })),

  editingSource: null,
  setEditingSource: (source) => set({ editingSource: source }),
  downloadDialogOpen: false,
  setDownloadDialogOpen: (open) => set({ downloadDialogOpen: open }),

  batchRenameOpen: false,
  setBatchRenameOpen: (open) => set({ batchRenameOpen: open }),

  previewTiles: [],
  setPreviewTiles: (tiles) => set({ previewTiles: tiles }),
}))
