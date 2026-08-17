import { ipcMain, BrowserWindow, dialog, shell, session } from 'electron'
import { DouyinLiveService } from './services/douyin-live'
import { DanmuService, DanmuMsg } from './services/danmu'
import { RecordingManager } from './services/recording-manager'
import { getPullUrl, type PullUrlResult } from './services/live-stream'
import * as db from './services/database'
import * as config from './services/record-config'
import * as floatingDanmu from './services/floating-danmu'
import * as ffmpegInstaller from './services/ffmpeg-installer'
import * as logger from './services/logger'
import * as fs from 'fs'

const LOG_MODULE = 'IPC'

const douyinLive = new DouyinLiveService()
export const danmuConnections = new Map<string, DanmuService>()
const roomNicknames = new Map<string, string>()
const recordingManager = new RecordingManager()

function pickQualityUrl(result: PullUrlResult, quality: string): string {
  if (!quality || result.qualities.length === 0) return result.pullUrl
  const match = result.qualities.find(q => q.value === quality)
  return match ? match.url : result.pullUrl
}

let mainWindow: BrowserWindow | null = null
function safeSend(channel: string, ...args: any[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}



export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
  floatingDanmu.setMainWindow(win)
  recordingManager.onUpdate = () => {
    safeSend('record:on-update', recordingManager.getState())
  }
}

export function registerIpcHandlers(): void {

  // Register floating danmu IPC (close/opacity from floating window)
  floatingDanmu.registerFloatingIPC()

  // ===== Room =====
  ipcMain.handle('room:fetch', async (_e, urls: string[]) => {
    const results: any[] = []
    for (const url of urls) {
      try {
        const info = await douyinLive.fetchLiveRoomInfo(url)
        // data 为空时（风控/接口变化）明确报错，不再静默返回全空数据
        if (!info || (!info.nickname && !info.title && !info.roomStatus)) {
          const msg = '接口返回空数据（可能触发抖音反爬风控）'
          console.error(`[RoomFetch] ${msg} url=${url}`)
          logger.error(LOG_MODULE, `roomFetch空数据 url=${url}`)
          results.push({ url, error: msg, enterRoomId: '', nickname: '', title: '', roomStatus: 0, likeCount: 0, viewCount: 0 })
          continue
        }
        results.push({ ...info, url })
      } catch (ex: any) {
        console.error(`[RoomFetch] 失败 url=${url}`, ex?.message || ex)
        logger.error(LOG_MODULE, `roomFetch失败 url=${url}`, ex)
        results.push({ url, error: ex.message, enterRoomId: '', nickname: '', title: '', roomStatus: 0, likeCount: 0, viewCount: 0 })
      }
    }
    return results
  })

  ipcMain.handle('room:refresh-stats', async (_e, rooms: any[]) => {
    await douyinLive.refreshRoomStats(rooms)
    return rooms
  })

  // ===== Danmu =====
  ipcMain.handle('danmu:connect', async (_e, roomId: string, nickname: string) => {
    const service = new DanmuService()
    danmuConnections.set(roomId, service)

    service.onMessage = (msg: DanmuMsg) => {
      safeSend('danmu:on-message', { roomId, msg })
      if (msg.type !== 'Stats') {
        const nick = roomNicknames.get(roomId) || ''
        floatingDanmu.sendDanmuToFloating({ ...msg, roomId, roomNickname: nick })
      }
    }
    service.onStatusChanged = (status: string) => {
      safeSend('danmu:on-status', { roomId, status })
    }
    service.onDisconnected = (reason: string) => {
      danmuConnections.delete(roomId)
      safeSend('danmu:on-disconnect', { roomId, reason })
    }

    await service.connect(roomId, douyinLive.cookie, nickname)
    roomNicknames.set(roomId, nickname)
    floatingDanmu.sendRoomList(roomNicknames)
    return true
  })

  ipcMain.handle('danmu:disconnect', async (_e, roomId: string) => {
    const service = danmuConnections.get(roomId)
    if (service) {
      service.disconnect()
      danmuConnections.delete(roomId)
    }
    roomNicknames.delete(roomId)
    floatingDanmu.sendRoomList(roomNicknames)
  })

  ipcMain.handle('danmu:disconnect-all', async () => {
    for (const [roomId, service] of danmuConnections) {
      service.disconnect()
      safeSend('danmu:on-disconnect', { roomId, reason: '主动断开' })
    }
    danmuConnections.clear()
    roomNicknames.clear()
    floatingDanmu.sendRoomList(roomNicknames)
  })

  // ===== Record =====
  ipcMain.handle('record:get-qualities', async (_e, roomId: string) => {
    const { success, qualities } = await getPullUrl(roomId)
    return { success, qualities }
  })

  ipcMain.handle('record:start-all', async (_e, rooms: any[]) => {
    const cfg = config.loadConfig()
    const format = cfg.outputFormat
    const segmentMin = cfg.segmentEnabled ? cfg.segmentDuration : 0
    const toRecord = rooms.filter((r: any) => !r.error && r.roomStatus !== 2 && !recordingManager.has(r.enterRoomId))

    for (const room of toRecord) {
      const result = await getPullUrl(room.enterRoomId)
      if (!result.success) {
        logger.warn(LOG_MODULE, `获取直播流失败 roomId=${room.enterRoomId}`)
        continue
      }

      const pullUrl = pickQualityUrl(result, room.quality || '')
      const nick = result.nickname || room.nickname
      recordingManager.startRecording(room.enterRoomId, pullUrl, nick, format, segmentMin, room.quality || '')
    }

    return recordingManager.getState()
  })

  ipcMain.handle('record:start-one', async (_e, room: any) => {
    const cfg = config.loadConfig()
    const format = cfg.outputFormat
    const segmentMin = cfg.segmentEnabled ? cfg.segmentDuration : 0
    const result = await getPullUrl(room.enterRoomId)
    if (!result.success) throw new Error('无法获取直播流')

    const pullUrl = pickQualityUrl(result, room.quality || '')
    const nick = result.nickname || room.nickname
    recordingManager.startRecording(room.enterRoomId, pullUrl, nick, format, segmentMin, room.quality || '')
    return recordingManager.getState()
  })

  ipcMain.handle('record:stop-all', async () => {
    recordingManager.stopAll()
    return recordingManager.getState()
  })

  ipcMain.handle('record:stop-one', async (_e, roomId: string) => {
    recordingManager.stopOne(roomId)
    return recordingManager.getState()
  })

  ipcMain.handle('record:get-state', () => {
    return recordingManager.getState()
  })

  // ===== Database =====
  ipcMain.handle('db:get-rooms', () => db.getRooms())
  ipcMain.handle('db:get-messages', (_e, roomId: string, typeFilter?: string, keyword?: string, username?: string) =>
    db.getMessages(roomId, typeFilter, keyword, username))
  ipcMain.handle('db:clear-all', () => { db.clearAll() })

  ipcMain.handle('db:export-messages', async (_e, roomId: string, nickname: string, typeFilter?: string, keyword?: string, username?: string, format: 'csv' | 'json' = 'csv') => {
    const messages = await db.getAllMessagesForExport(roomId, nickname, typeFilter, keyword, username)
    if (!mainWindow) return { success: false, error: 'No window' }

    const ext = format === 'json' ? 'json' : 'csv'
    const safeName = (nickname || roomId).replace(/[\\/:*?"<>|]/g, '_')
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${safeName}_弹幕记录.${ext}`,
      filters: [{ name: format === 'json' ? 'JSON 文件' : 'CSV 文件', extensions: [ext] }]
    })

    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' }

    let content: string
    if (format === 'json') {
      const data = messages.map(m => ({ time: m.time, type: m.type, userName: m.userName, content: m.content, giftName: m.giftName, giftCount: m.giftCount, giftPrice: m.giftPrice, likeCount: m.likeCount, avatar: m.avatar, profileUrl: m.profileUrl, rawData: m.rawData ? JSON.parse(m.rawData) : null }))
      content = JSON.stringify(data, null, 2)
    } else {
      const BOM = '﻿'
      const header = '时间,类型,用户名,内容,礼物名称,礼物数量,礼物价值,点赞次数,头像URL,主页链接,原始数据'
      const rows = messages.map(m =>
        [m.time, m.type, m.userName, m.content, m.giftName, m.giftCount, m.giftPrice, m.likeCount, m.avatar, m.profileUrl, m.rawData]
          .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
      content = BOM + header + '\n' + rows.join('\n')
    }

    fs.writeFileSync(result.filePath, content, 'utf-8')
    return { success: true, count: messages.length }
  })

  // ===== Config =====
  ipcMain.handle('config:load', () => config.loadConfig())
  ipcMain.handle('config:save', (_e, cfg: config.RecordConfig) => config.saveConfig(cfg))
  ipcMain.handle('config:browse-path', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择录制文件保存路径'
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ===== Window Controls =====
  ipcMain.handle('window:minimize', () => { mainWindow?.minimize() })

  // ===== Floating Danmu =====
  ipcMain.handle('floating:open', () => {
    floatingDanmu.createFloatingDanmu()
    floatingDanmu.sendRoomList(roomNicknames)
    return true
  })
  ipcMain.handle('floating:close', () => {
    floatingDanmu.closeFloatingDanmu()
  })
  ipcMain.on('floating:close', () => {
    floatingDanmu.closeFloatingDanmu()
  })

  // ===== Session =====
  ipcMain.handle('session:clear', async (_e, partition: string) => {
    try { await session.fromPartition(partition).clearStorageData(); return true }
    catch (e: any) { return false }
  })

  // ===== File Operations =====
  ipcMain.handle('file:delete', async (_e, filePath: string) => {
    try {
      if (!filePath) return { success: false, error: '路径为空' }
      const pathMod = require('path') as typeof import('path')
      if (filePath.includes('%')) {
        // 分段模式：删除目录下所有匹配的 segment 文件（xxx_000.mp4 / _001.mp4 ...）
        const dir = pathMod.dirname(filePath)
        const extMatch = pathMod.basename(filePath).match(/\.(\w+)$/)
        const ext = extMatch ? extMatch[1] : 'mp4'
        const prefix = pathMod.basename(filePath).replace(/_%\d+d\.\w+$/, '')
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix + '_') && f.endsWith('.' + ext))
          for (const f of files) { try { fs.unlinkSync(pathMod.join(dir, f)) } catch {} }
          return { success: true, deleted: files.length }
        }
        return { success: false, error: '目录不存在' }
      }
      if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return { success: true } }
      return { success: false, error: '文件不存在' }
    } catch (ex: any) { return { success: false, error: ex.message } }
  })

  // ===== FFmpeg =====
  ipcMain.handle('ffmpeg:check', () => {
    return { available: ffmpegInstaller.isFfmpegAvailable() }
  })

  ipcMain.handle('ffmpeg:install', async () => {
    try {
      const ok = await ffmpegInstaller.downloadAndInstall((pct, msg) => {
        safeSend('ffmpeg:progress', { pct, msg })
      })
      return { success: ok }
    } catch (ex: any) {
      logger.error(LOG_MODULE, 'ffmpeg install failed', ex)
      return { success: false, error: ex.message }
    }
  })
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() || false)
  ipcMain.handle('window:close', () => { mainWindow?.close() })
  ipcMain.handle('window:pin', () => {
    if (!mainWindow) return false
    const pinned = !mainWindow.isAlwaysOnTop()
    mainWindow.setAlwaysOnTop(pinned)
    return pinned
  })
  ipcMain.handle('window:isPinned', () => mainWindow?.isAlwaysOnTop() || false)

  // 主题切换：主进程转发给浮窗（不阻塞主窗口）
  ipcMain.on('window:set-theme', (_e, mode: 'dark' | 'light') => {
    floatingDanmu.setFloatingTheme(mode)
  })

  // ===== 外部窗口置顶（DeskPins） =====
  const deskpins = require('./services/deskpins')
  ipcMain.handle('deskpins:list', () => deskpins.listWindows())
  ipcMain.handle('deskpins:pin', (_e, hwnd: string) => deskpins.pinWindow(hwnd))
  ipcMain.handle('deskpins:unpin', (_e, hwnd: string) => deskpins.unpinWindow(hwnd))

  // 文件/文件夹：在资源管理器中显示文件（Windows 自动选中）
  ipcMain.handle('file:open-location', (_e, filePath: string) => {
    try {
      if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath)
      else if (filePath) shell.openPath(require('path').dirname(filePath))
      return { success: true }
    } catch (ex: any) {
      return { success: false, error: ex.message }
    }
  })
}

export async function cleanup(): Promise<void> {
  try {
    for (const [, service] of danmuConnections) { try { service.disconnect() } catch {} }
    danmuConnections.clear()
    try { recordingManager.stopAll() } catch {}
    try { floatingDanmu.closeFloatingDanmu() } catch {}
    try { await db.flushDb() } catch {}
  } catch {}
}
