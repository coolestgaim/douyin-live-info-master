import { BrowserWindow, ipcMain, app, screen } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as logger from './logger'

const LOG_MODULE = 'FloatingDanmu'

let floatingWindow: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null
let currentTheme: 'dark' | 'light' = 'dark'  // 主窗口当前主题（由 main.ts 同步）
let pendingBounds: { x: number; y: number; w: number; h: number; opacity?: number } | null = null

const STATE_DIR = path.join(app.getPath('userData'))
const STATE_FILE = path.join(STATE_DIR, 'floating-state.json')

interface FloatingState {
  bounds?: { x: number; y: number; w: number; h: number }
  opacity?: number
}

function loadState(): FloatingState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
    }
  } catch (e) {
    logger.warn(LOG_MODULE, 'loadState failed', e)
  }
  return {}
}

function saveState(state: FloatingState) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true })
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
  } catch (e) {
    logger.warn(LOG_MODULE, 'saveState failed', e)
  }
}

function sendThemeToFloating() {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.webContents.send('floating:theme', currentTheme)
  }
}

/** 主窗口切换主题时由 main.ts 调用 */
export function setFloatingTheme(mode: 'dark' | 'light') {
  currentTheme = mode
  sendThemeToFloating()
}

function resolveHtmlPath(): string {
  // dev 模式：app.getAppPath() 返回项目根；打包后是 resources/app（不含 src/），fallback 到 resources
  const devPath = path.join(app.getAppPath(), 'src', 'floating-danmu.html')
  if (fs.existsSync(devPath)) return devPath
  return path.join(process.resourcesPath, 'floating-danmu.html')
}

export function createFloatingDanmu(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.show()
    floatingWindow.focus()
    return
  }

  const state = loadState()
  const bounds = state.bounds
  pendingBounds = bounds || null

  // 兼容模式（低配/无独显）：浮窗用不透明背景，减少透明窗口合成开销
  const { isCompat } = require('./perf')
  const compat = isCompat()

  const opts: Electron.BrowserWindowConstructorOptions = {
    width: bounds?.w || 480,
    height: bounds?.h || 420,
    minWidth: 360,
    minHeight: 240,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    type: 'toolbar',
    focusable: false,
    // 兼容模式不透明（透明合成是 CPU 重负）；普通模式带 alpha 圆角
    backgroundColor: compat ? '#14161C' : '#14161CE8',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // 兼容模式：后台节流开启（减少 CPU）
      backgroundThrottling: compat,
    }
  }
  // 如果有保存的 bounds（且在当前屏幕范围内），应用位置
  if (bounds) {
    const displays = screen.getAllDisplays()
    const visible = displays.some(d => {
      const w = d.workArea
      return bounds.x >= w.x - 50 && bounds.x <= w.x + w.width - 50 && bounds.y >= w.y - 20 && bounds.y <= w.y + w.height - 50
    })
    if (visible) {
      opts.x = bounds.x
      opts.y = bounds.y
    }
  }

  floatingWindow = new BrowserWindow(opts)
  floatingWindow.setAlwaysOnTop(true, 'screen-saver')
  floatingWindow.setVisibleOnAllWorkspaces(true)
  if (state.opacity) floatingWindow.setOpacity(state.opacity)
  else floatingWindow.setOpacity(1.0)

  const htmlPath = resolveHtmlPath()
  logger.info(LOG_MODULE, `loadFile ${htmlPath}`)
  floatingWindow.loadFile(htmlPath)

  floatingWindow.webContents.on('did-finish-load', () => {
    // 加载完成后立即推送当前主题
    sendThemeToFloating()
  })

  floatingWindow.on('closed', () => {
    floatingWindow = null
    mainWin?.webContents.send('floating:on-closed')
  })
}

export function closeFloatingDanmu(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.close()
    floatingWindow = null
    mainWin?.webContents.send('floating:on-closed')
  }
}

export function setMainWindow(win: BrowserWindow | null): void {
  mainWin = win
}

export function sendDanmuToFloating(msg: { type: string; userName: string; content: string; giftName?: string; giftCount?: number; likeCount?: number; roomId?: string; roomNickname?: string }): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.webContents.send('floating:danmu', msg)
  }
}

/** 清空浮窗当前列表（回放开始前调用，避免与直播弹幕/上一次回放混在一起） */
export function clearFloatingDanmu(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.webContents.send('floating:clear')
  }
}

export function sendRoomList(nicknames: Map<string, string>): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    const rooms = Array.from(nicknames.entries()).map(([roomId, nickname]) => ({ roomId, nickname }))
    floatingWindow.webContents.send('floating:rooms', rooms)
  }
}

export function registerFloatingIPC(): void {
  ipcMain.on('floating:action', (_e, action: string, value?: number) => {
    if (action === 'close') {
      closeFloatingDanmu()
    } else if (action === 'opacity' && floatingWindow && !floatingWindow.isDestroyed()) {
      const opacity = Math.max(0.3, Math.min(1, value || 0.85))
      floatingWindow.setOpacity(opacity)
      const s = loadState()
      saveState({ ...s, opacity })
    } else if (action === 'lock' && floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.setIgnoreMouseEvents(true, { forward: true })
    } else if (action === 'unlock' && floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.setIgnoreMouseEvents(false)
    } else if (action === 'hover-unlock' && floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.setIgnoreMouseEvents(false)
    } else if (action === 'hover-lock' && floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.setIgnoreMouseEvents(true, { forward: true })
    }
  })

  // 浮窗启动时请求当前主题
  ipcMain.on('floating:get-theme', (e) => {
    e.sender.send('floating:theme', currentTheme)
  })

  // 浮窗位置/大小记忆
  ipcMain.on('floating:save-bounds', (_e, bounds: { x: number; y: number; w: number; h: number }) => {
    const s = loadState()
    saveState({ ...s, bounds })
  })

  // 浮窗尺寸预设（v2.21.4：极小/小/中/大 4 档，保持左上角不变）
  ipcMain.on('floating:resize', (_e, size: { w: number; h: number }) => {
    if (!floatingWindow || floatingWindow.isDestroyed() || !size?.w || !size?.h) return
    const [x, y] = floatingWindow.getPosition()
    floatingWindow.setBounds({ x, y, width: Math.round(size.w), height: Math.round(size.h) })
    const s = loadState()
    saveState({ ...s, bounds: { x, y, w: Math.round(size.w), h: Math.round(size.h) } })
  })
}
