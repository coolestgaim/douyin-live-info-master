import { app, BrowserWindow } from 'electron'

app.commandLine.appendSwitch('disable-features', 'FontFlash')
app.commandLine.appendSwitch('font-render-hinting', 'medium')
// 禁用磁盘缓存：避免 userData 缓存锁/损坏导致渲染黑屏（配合 electron:dev 的 --disk-cache-size=0）
app.commandLine.appendSwitch('disk-cache-size', '0')

// 兜底：任何主进程未捕获异常都只 console.warn，不再弹窗打断用户
process.on('uncaughtException', (err) => {
  console.warn('[main] uncaughtException:', err?.message || err)
})
process.on('unhandledRejection', (reason) => {
  console.warn('[main] unhandledRejection:', reason)
})

import * as path from 'path'
import * as fs from 'fs'
import { registerIpcHandlers, setMainWindow, cleanup } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 900,
    minHeight: 550,
    frame: false,
    backgroundColor: '#111318',
    resizable: true,
    title: app.isPackaged ? '灼灼直播控场' : '灼灼直播控场 (开发)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      webviewTag: true
    }
  })

  setMainWindow(mainWindow)

  // Dev: load from Vite dev server; Prod: load from built files
  const devUrl = process.env.VITE_DEV_URL || 'http://localhost:5173'
  const prodPath = path.join(__dirname, '..', 'dist', 'index.html')

  if (fs.existsSync(prodPath)) {
    mainWindow.loadFile(prodPath)
  } else {
    mainWindow.loadURL(devUrl)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 最大化状态变化推送给渲染进程（标题栏图标联动）
  mainWindow.on('maximize', () => {
    if (mainWindow) mainWindow.webContents.send('window:maximize-change', true)
  })
  mainWindow.on('unmaximize', () => {
    if (mainWindow) mainWindow.webContents.send('window:maximize-change', false)
  })

  mainWindow.on('close', (e) => {
    e.preventDefault()
    cleanup().catch(() => {}).finally(() => {
      app.exit(0)
    })
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})