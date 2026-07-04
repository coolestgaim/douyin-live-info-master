import { app, BrowserWindow } from 'electron'

app.commandLine.appendSwitch('disable-features', 'FontFlash')
app.commandLine.appendSwitch('font-render-hinting', 'medium')
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
  const devUrl = 'http://localhost:5173'
  const prodPath = path.join(__dirname, '..', 'dist', 'index.html')

  if (fs.existsSync(prodPath)) {
    mainWindow.loadFile(prodPath)
  } else {
    mainWindow.loadURL(devUrl)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('close', (e) => {
    e.preventDefault()
    cleanup().then(() => {
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

app.on('window-all-closed', async () => {
  await cleanup()
  app.quit()
})
