import { app, BrowserWindow, protocol } from 'electron'

// local-video 协议：按扩展名推断 MIME（视频/音频文件）
const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.flv': 'video/x-flv', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
}

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
  // 本地视频加载协议（弹幕回放内嵌播放器用）：local-video://D:/x.mp4 → file 响应
  // 不依赖 webSecurity，dev(http) 与打包(file) 模式都能播放本地录制文件
  protocol.handle('local-video', (request) => {
    try {
      // URL 形如 local-video:///C:/Users/x.mp4（三斜杠：空 host，盘符在 pathname；自定义 scheme 下 pathname 可能带多个前导斜杠）
      const u = new URL(request.url)
      const filePath = decodeURIComponent(u.pathname).replace(/^\/+/, '')
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('file not found', { status: 404 })
      }
      const stat = fs.statSync(filePath)
      const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
      // 视频播放器依赖 Range 请求（探测格式 + 拖进度条），必须支持
      const range = request.headers.get('Range')
      const cors = { 'Access-Control-Allow-Origin': '*' }
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        let start = m && m[1] !== '' ? parseInt(m[1], 10) : 0
        let end = m && m[2] !== '' ? parseInt(m[2], 10) : stat.size - 1
        if (Number.isNaN(start)) start = 0
        if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1
        if (start > end) return new Response(null, { status: 416, headers: cors })
        const stream = fs.createReadStream(filePath, { start, end })
        return new Response(stream as any, {
          status: 206,
          headers: {
            ...cors,
            'Content-Type': mime,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
          },
        })
      }
      const stream = fs.createReadStream(filePath)
      return new Response(stream as any, {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': mime,
          'Content-Length': String(stat.size),
          'Accept-Ranges': 'bytes',
        },
      })
    } catch (e) {
      return new Response('bad request', { status: 400 })
    }
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})