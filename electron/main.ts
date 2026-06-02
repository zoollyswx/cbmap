import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { downloadTiles, cancelDownload, retryFailedTiles, getFailedCoords } from './downloader'
import { loadConfig, saveConfig } from './config'
import { packMbtiles } from './mbtiles'

let mainWindow: BrowserWindow | null = null

// 用户数据目录
const userDataPath = app.getPath('userData')
const sourcesPath = path.join(userDataPath, 'sources.json')
const boundariesPath = path.join(userDataPath, 'boundaries.json')
const configPath = path.join(userDataPath, 'config.json')

function ensureDataFiles() {
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }
  if (!fs.existsSync(sourcesPath)) {
    fs.writeFileSync(sourcesPath, '[]', 'utf-8')
  }
  if (!fs.existsSync(boundariesPath)) {
    fs.writeFileSync(boundariesPath, '[]', 'utf-8')
  }
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
      defaultSaveDir: path.join(app.getPath('documents'), 'CBMapTiles'),
      defaultNameFormat: '{source}/{z}/{x}/{y}.png'
    }, null, 2), 'utf-8')
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'CBMap - 地图瓦片管理器',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // 允许加载在线地图瓦片
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  ensureDataFiles()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ========== IPC Handlers ==========

// 瓦片源 CRUD
ipcMain.handle('sources:getAll', async () => {
  const data = fs.readFileSync(sourcesPath, 'utf-8')
  return JSON.parse(data)
})

ipcMain.handle('sources:save', async (_event, sources) => {
  fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2), 'utf-8')
  return true
})

// 边界数据 CRUD
ipcMain.handle('boundaries:getAll', async () => {
  const data = fs.readFileSync(boundariesPath, 'utf-8')
  return JSON.parse(data)
})

ipcMain.handle('boundaries:save', async (_event, boundaries) => {
  fs.writeFileSync(boundariesPath, JSON.stringify(boundaries, null, 2), 'utf-8')
  return true
})

// 配置读写
ipcMain.handle('config:get', async () => {
  return loadConfig(configPath)
})

ipcMain.handle('config:save', async (_event, config) => {
  saveConfig(configPath, config)
  return true
})

// 选择目录对话框
ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// 选择文件对话框
ipcMain.handle('dialog:selectFile', async (_event, filters: { name: string; extensions: string[] }[]) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters,
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// 读取文件内容
ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  return fs.readFileSync(filePath, 'utf-8')
})

// 创建目录
ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
  return true
})

// 检查文件是否存在
ipcMain.handle('fs:exists', async (_event, filePath: string) => {
  return fs.existsSync(filePath)
})

// 开始下载瓦片
ipcMain.handle('download:start', async (event, options: {
  tiles: { z: number; x: number; y: number }[]
  urlTemplate: string
  saveDir: string
  nameFormat: string
  sourceName: string
  subdomains?: string[]
  taskId: string
  concurrency?: number
}) => {
  return downloadTiles(event, options)
})

// 取消下载
ipcMain.handle('download:cancel', async (_event, taskId: string) => {
  cancelDownload(taskId)
  return true
})

// 重试失败的瓦片
ipcMain.handle('download:retry', async (event, options: {
  tiles: { z: number; x: number; y: number }[]
  urlTemplate: string
  saveDir: string
  nameFormat: string
  sourceName: string
  subdomains?: string[]
  taskId: string
  concurrency?: number
}) => {
  const failedCoords = getFailedCoords(options.taskId)
  if (failedCoords.length === 0) return
  return retryFailedTiles(event, { ...options, failedCoords })
})

// MBTiles 打包
ipcMain.handle('mbtiles:pack', async (_event, options) => {
  return packMbtiles(options)
})

// 获取用户数据路径
ipcMain.handle('app:getUserDataPath', async () => {
  return userDataPath
})
