import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 瓦片源
  getSources: () => ipcRenderer.invoke('sources:getAll'),
  saveSources: (sources: any[]) => ipcRenderer.invoke('sources:save', sources),

  // 边界数据
  getBoundaries: () => ipcRenderer.invoke('boundaries:getAll'),
  saveBoundaries: (boundaries: any[]) => ipcRenderer.invoke('boundaries:save', boundaries),

  // 配置
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config: any) => ipcRenderer.invoke('config:save', config),

  // 对话框
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  selectFile: (filters: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('dialog:selectFile', filters),

  // 文件操作
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  mkdir: (dirPath: string) => ipcRenderer.invoke('fs:mkdir', dirPath),
  fileExists: (filePath: string) => ipcRenderer.invoke('fs:exists', filePath),

  // 下载
  startDownload: (options: any) => ipcRenderer.invoke('download:start', options),
  cancelDownload: (taskId: string) => ipcRenderer.invoke('download:cancel', taskId),
  retryFailed: (options: any) => ipcRenderer.invoke('download:retry', options),
  onDownloadProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('download:progress', (_event, data) => callback(data))
  },

  // MBTiles
  packMbtiles: (options: any) => ipcRenderer.invoke('mbtiles:pack', options),

  // 应用信息
  getUserDataPath: () => ipcRenderer.invoke('app:getUserDataPath'),
})
