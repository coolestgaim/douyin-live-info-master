import { ipcMain, BrowserWindow, dialog } from 'electron'
import { DouyinLiveService } from './services/douyin-live'
import { DanmuService, DanmuMsg } from './services/danmu'
import { RecordingManager } from './services/recording-manager'
import { getPullUrl } from './services/live-stream'
import * as db from './services/database'
import * as config from './services/record-config'
import * as floatingDanmu from './services/floating-danmu'
import * as logger from './services/logger'
import * as fs from 'fs'

const LOG_MODULE = 'IPC'

const douyinLive = new DouyinLiveService()
export const danmuConnections = new Map<string, DanmuService>()
const roomNicknames = new Map<string, string>()
const recordingManager = new RecordingManager()

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
  floatingDanmu.setMainWindow(win)
  recordingManager.onUpdate = () => {
    mainWindow?.webContents.send('record:on-update', recordingManager.getState())
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
        results.push({ ...info, url })
      } catch (ex: any) {
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
      mainWindow?.webContents.send('danmu:on-message', { roomId, msg })
      if (msg.type !== 'Stats') {
        const nick = roomNicknames.get(roomId) || ''
        floatingDanmu.sendDanmuToFloating({ ...msg, roomId, roomNickname: nick })
      }
    }
    service.onStatusChanged = (status: string) => {
      mainWindow?.webContents.send('danmu:on-status', { roomId, status })
    }
    service.onDisconnected = (reason: string) => {
      danmuConnections.delete(roomId)
      mainWindow?.webContents.send('danmu:on-disconnect', { roomId, reason })
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
      mainWindow?.webContents.send('danmu:on-disconnect', { roomId, reason: '主动断开' })
    }
    danmuConnections.clear()
    roomNicknames.clear()
    floatingDanmu.sendRoomList(roomNicknames)
  })

  // ===== Record =====
  ipcMain.handle('record:start-all', async (_e, rooms: any[]) => {
    const format = config.loadConfig().outputFormat
    const toRecord = rooms.filter((r: any) => !r.error && r.roomStatus !== 2 && !recordingManager.has(r.enterRoomId))

    for (const room of toRecord) {
      const { success, pullUrl, nickname } = await getPullUrl(room.enterRoomId)
      if (!success) {
        logger.warn(LOG_MODULE, `获取直播流失败 roomId=${room.enterRoomId}`)
        continue
      }

      const nick = nickname || room.nickname
      recordingManager.startRecording(room.enterRoomId, pullUrl, nick, format)
    }

    return recordingManager.getState()
  })

  ipcMain.handle('record:start-one', async (_e, room: any) => {
    const format = config.loadConfig().outputFormat
    const { success, pullUrl, nickname } = await getPullUrl(room.enterRoomId)
    if (!success) throw new Error('无法获取直播流')

    const nick = nickname || room.nickname
    recordingManager.startRecording(room.enterRoomId, pullUrl, nick, format)
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
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.handle('window:close', () => { mainWindow?.close() })
}

export async function cleanup(): Promise<void> {
  for (const [, service] of danmuConnections) service.disconnect()
  danmuConnections.clear()
  recordingManager.stopAll()
  floatingDanmu.closeFloatingDanmu()
  await db.flushDb()
}
