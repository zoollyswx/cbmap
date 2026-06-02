export interface ElectronAPI {
  getSources: () => Promise<TileSource[]>
  saveSources: (sources: TileSource[]) => Promise<boolean>
  getBoundaries: () => Promise<Boundary[]>
  saveBoundaries: (boundaries: Boundary[]) => Promise<boolean>
  getConfig: () => Promise<Record<string, any>>
  saveConfig: (config: Record<string, any>) => Promise<boolean>
  selectDirectory: () => Promise<string | null>
  selectFile: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
  readFile: (filePath: string) => Promise<string>
  mkdir: (dirPath: string) => Promise<boolean>
  fileExists: (filePath: string) => Promise<boolean>
  startDownload: (options: any) => Promise<void>
  cancelDownload: (taskId: string) => Promise<boolean>
  retryFailed: (options: any) => Promise<void>
  onDownloadProgress: (callback: (data: any) => void) => void
  packMbtiles: (options: any) => Promise<{ success: boolean; tileCount: number; error?: string }>
  getUserDataPath: () => Promise<string>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
