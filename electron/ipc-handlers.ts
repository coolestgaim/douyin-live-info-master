import { ipcMain, BrowserWindow, dialog, shell, session } from 'electron'
import { DouyinLiveService } from './services/douyin-live'
import { DanmuService, DanmuMsg } from './services/danmu'
import { RecordingManager, type RecordSessionInfo } from './services/recording-manager'
import { getPullUrl, type PullUrlResult } from './services/live-stream'
import * as db from './services/database'
import * as config from './services/record-config'
import * as floatingDanmu from './services/floating-danmu'
import * as ffmpegInstaller from './services/ffmpeg-installer'
import * as logger from './services/logger'
import { roomWatch } from './services/room-watch'
import * as fs from 'fs'
import * as path from 'path'

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

/** 为录制会话生成统一命名空间：{nickname}_{yyyyMMdd_HHmmss}/ */
function makeSessionId(nickname: string): string {
  const safe = (nickname || '主播').replace(/[<>:"/\\|?*\s]/g, '_').substring(0, 32)
  const d = new Date()
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
  return `${safe}_${ts}`
}

/** 建立录制会话（建子文件夹、CSV 路径）；开始时间统一保证与 ipc 的推送对齐 */
function buildRecordSession(roomId: string, nickname: string): RecordSessionInfo {
  const cfg = config.loadConfig()
  const root = config.getEffectiveOutputPath(cfg)
  const sessionId = makeSessionId(nickname)
  const outputDir = path.join(root, sessionId)
  fs.mkdirSync(outputDir, { recursive: true })
  const csvPath = path.join(outputDir, `${sessionId}_danmu.csv`)
  const startTime = Date.now()
  return { sessionId, roomId, nickname, startTime, outputDir, csvPath, videoPattern: '' }
}

// 把"原始 msg"格式化为 danmu csv 用的字段（与 danmu.ts 推上来的 msg 兼容）
function danmuToRow(msg: DanmuMsg): { time: string; type: string; userName: string; content: string; giftName: string; giftCount: number; giftPrice: number; likeCount: number } {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
  return {
    time: now,
    type: msg.type || 'Chat',
    userName: msg.userName || '',
    content: msg.type === 'Gift'
      ? `送出 ${msg.giftName || ''} x${msg.giftCount || 1}`
      : msg.type === 'Stats'
        ? `在线:${msg.totalUser ?? 0} 点赞:${msg.totalLike ?? 0}`
        : (msg.content || ''),
    giftName: msg.giftName || '',
    giftCount: msg.giftCount || 0,
    giftPrice: 0,
    likeCount: msg.type === 'Stats' ? (msg.totalLike || 0) : (msg.likeCount || 0),
  }
}

/** 把入参还原成"普通字面量"——Vue reactive（Proxy）对象过 IPC 会抛 "An object could not be cloned"
 *  兜底做一次 JSON 往返剥掉所有 Proxy/函数/Symbol，rooms 这种纯数据字段无损 */
function toPlain<T = any>(input: T): T {
  try { return JSON.parse(JSON.stringify(input)) } catch { return input }
}

/** 建立某房间的弹幕连接（已连接则跳过；预约开播自动连接与手动连接共用） */
export async function connectDanmuRoom(roomId: string, nickname: string): Promise<boolean> {
  if (danmuConnections.has(roomId)) return true
  const service = new DanmuService()
  danmuConnections.set(roomId, service)

  service.onMessage = (msg: DanmuMsg) => {
    // db 由 danmu.ts 内部 insertMessage 处理；这里只负责"录制时的实时 CSV 同步 + UI 推送"
    // 若该房间正在录制 → 实时追加到对应子文件夹的 CSV（弹幕与视频同一子文件夹、同一时间轴）
    if (recordingManager.hasSession(roomId) && msg.type !== 'Stats') {
      recordingManager.appendDanmu(roomId, danmuToRow(msg))
    }
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
}

/** 预约开播 → 自动连接弹幕 + 自动开始录制（带重试：拉流可能刚开播不稳定） */
async function autoStartOnLive(target: { roomId: string; nickname: string; quality?: string }): Promise<void> {
  // 1. 自动连接弹幕
  try {
    await connectDanmuRoom(target.roomId, target.nickname || '')
  } catch (ex: any) {
    logger.warn(LOG_MODULE, `预约开播自动连弹幕失败 roomId=${target.roomId}: ${ex.message}`)
  }
  // 2. 自动开始录制：建会话 + 拉流 + startRecording（带重试）
  const cfg = config.loadConfig()
  const format = cfg.outputFormat
  const segmentMin = cfg.segmentEnabled ? cfg.segmentDuration : 0
  const session = buildRecordSession(target.roomId, target.nickname || '')
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await getPullUrl(target.roomId)
      if (!result.success || !result.pullUrl) throw new Error('拉流失败')
      const pullUrl = pickQualityUrl(result, target.quality || '')
      recordingManager.startRecording({
        roomId: target.roomId,
        pullUrl,
        nickname: target.nickname || result.nickname,
        format,
        segmentMin,
        quality: target.quality || '',
        sessionId: session.sessionId,
        outputDir: session.outputDir,
        csvPath: session.csvPath,
        startTime: session.startTime,
      })
      logger.info(LOG_MODULE, `预约开播自动录制已启动 roomId=${target.roomId} session=${session.sessionId}`)
      return
    } catch (ex: any) {
      logger.warn(LOG_MODULE, `预约开播自动录制尝试 ${attempt}/3 失败 roomId=${target.roomId}: ${ex.message}`)
      if (attempt < 3) await new Promise(r => setTimeout(r, 5000))
    }
  }
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

  // 弹幕回放：渲染层推送回放弹幕到悬浮窗（模拟实时弹幕滚动）
  ipcMain.on('floating:replay', (_e, msg: any) => {
    if (msg && typeof msg === 'object') {
      floatingDanmu.sendDanmuToFloating(msg)
    }
  })
  // 弹幕回放：开始前清空浮窗旧内容（避免与直播弹幕/上一次回放混在一起）
  ipcMain.on('floating:replay-clear', () => {
    floatingDanmu.clearFloatingDanmu()
  })

  // 弹幕回放：选择本地录制视频文件（内嵌播放器联动用）
  ipcMain.handle('file:pick-video', async () => {
    if (!mainWindow) return { success: false, error: '窗口未就绪' }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择录制视频（弹幕回放联动）',
      filters: [
        { name: '视频/音频', extensions: ['mp4', 'flv', 'mp3', 'wav', 'mkv', 'mov', 'avi'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true }
    return { success: true, path: result.filePaths[0] }
  })

  // 弹幕回放：选择"录制会话子文件夹"（推荐入口）—— 自动匹配该文件夹下的视频与 CSV
  ipcMain.handle('file:pick-folder', async () => {
    if (!mainWindow) return { success: false, error: '窗口未就绪' }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择录制会话文件夹（自动挂载视频 + 弹幕）',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true }
    const folder = result.filePaths[0]
    const all = fs.readdirSync(folder).map(f => path.join(folder, f))
    const videoFiles = all.filter(f => /\.(mp4|flv|ts|m4v|mkv|mov|avi)$/i.test(f)).sort()
    const csvFiles = all.filter(f => /\.csv$/i.test(f)).sort()
    const subJson = all.find(f => path.basename(f).toLowerCase() === 'meta.json')
    let meta: any = null
    if (subJson && fs.existsSync(subJson)) {
      try { meta = JSON.parse(fs.readFileSync(subJson, 'utf-8')) } catch { meta = null }
    }
    const sessionId = path.basename(folder)
    const m = sessionId.match(/^(.+)_(\d{8})_(\d{6})$/)
    const nickname = m ? m[1] : sessionId
    const startTime = m ? new Date(`${m[2].slice(0, 4)}-${m[2].slice(4, 6)}-${m[2].slice(6, 8)}T${m[3].slice(0, 2)}:${m[3].slice(2, 4)}:${m[3].slice(4, 6)}`).getTime() : 0
    return { success: true, folder, sessionId, nickname, startTime, videoFiles, csvFiles, meta }
  })

  // 弹幕回放：扫描录制输出根目录，返回所有历史会话（按时间倒序）
  ipcMain.handle('record:scan-sessions', (_e, nicknameHint?: string) => {
    const cfg = config.loadConfig()
    const root = config.getEffectiveOutputPath(cfg)
    return { success: true, sessions: RecordingManager.scanOutputRoot(root, nicknameHint) }
  })

  // 弹幕回放：读本地文本文件（CSV），utf-8 文本，安全校验：只允许读取录制输出根目录下的文件
  ipcMain.handle('file:read-text', async (_e, filePath: string) => {
    try {
      if (typeof filePath !== 'string' || !filePath) return { success: false, error: '路径无效' }
      if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' }
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) return { success: false, error: '不是文件' }
      // 安全：限定在录制输出根目录下
      const cfg = config.loadConfig()
      const root = path.resolve(config.getEffectiveOutputPath(cfg))
      const abs = path.resolve(filePath)
      if (!abs.startsWith(root)) return { success: false, error: '仅允许访问录制输出目录' }
      if (stat.size > 200 * 1024 * 1024) return { success: false, error: '文件过大（>200MB）' }
      const content = fs.readFileSync(abs, 'utf-8')
      return { success: true, content }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

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

  // ===== 预约开播（RoomWatch）：主播开播自动连弹幕 + 自动录制；下播自动停止 =====
  // 开播回调：自动连接弹幕 + 自动开始录制 + 通知渲染层
  roomWatch.onStarted = (target) => {
    void autoStartOnLive(target)
    safeSend('room:watch-started', { roomId: target.roomId, nickname: target.nickname })
  }
  // 下播回调：自动停止录制 + 断开该房间弹幕，并从预约列表移除
  roomWatch.onStopped = (target) => {
    try { recordingManager.stopOne(target.roomId) } catch { /* ignore */ }
    try {
      const svc = danmuConnections.get(target.roomId)
      if (svc) { svc.disconnect(); danmuConnections.delete(target.roomId) }
    } catch { /* ignore */ }
    safeSend('room:watch-stopped', { roomId: target.roomId, nickname: target.nickname })
    logger.info(LOG_MODULE, `下播已自动停止录制+弹幕 roomId=${target.roomId} nickname=${target.nickname}`)
  }
  ipcMain.handle('room:watch-add', async (_e, room: { url?: string; enterRoomId?: string; nickname?: string; quality?: string }) => {
    if (!room?.url || !room.enterRoomId) return { success: false, error: '参数不完整', list: roomWatch.list() }
    // 加入预约（先不启动轮询，避免与下面的"已开播直接触发"并发重复）
    const ok = roomWatch.add({ url: room.url, roomId: room.enterRoomId, nickname: room.nickname || '', quality: room.quality || '' }, false)
    if (!ok) return { success: false, error: '该直播间已在预约中', list: roomWatch.list() }

    // 立即查一次开播状态：已开播 → 直接触发开播回调（连接弹幕+开始录制），无需等轮询
    let startedNow = false
    try {
      const info = await douyinLive.fetchLiveRoomInfo(room.url)
      if (info.roomStatus === 1) {
        const t = roomWatch.markStarted(room.enterRoomId)
        if (t) {
          startedNow = true
          logger.info(LOG_MODULE, `预约时已开播，直接触发 roomId=${room.enterRoomId}`)
          void autoStartOnLive({ roomId: t.roomId, nickname: t.nickname || room.nickname || '', quality: t.quality || '' })
        }
      }
    } catch (ex: any) {
      logger.warn(LOG_MODULE, `预约立即查开播状态失败 roomId=${room.enterRoomId}: ${ex.message}`)
    }
    // 未开播（或查询失败）→ 进入 60s 周期轮询等开播
    if (!startedNow) roomWatch.startPolling()
    return { success: true, started: startedNow, list: roomWatch.list() }
  })
  ipcMain.handle('room:watch-remove', (_e, roomId: string) => {
    roomWatch.remove(roomId)
    return { success: true, list: roomWatch.list() }
  })
  ipcMain.handle('room:watch-list', () => ({ list: roomWatch.list() }))

  // ===== Danmu =====
  ipcMain.handle('danmu:connect', async (_e, roomId: string, nickname: string) => {
    try {
      await connectDanmuRoom(roomId, nickname)
      return true
    } catch (ex: any) {
      logger.error(LOG_MODULE, `danmu:connect 失败 roomId=${roomId}: ${ex.message}`)
      return false
    }
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
    // 兜底：Vue reactive Proxy 对象无法被 IPC 结构化克隆；统一先转纯字面量
    const safeRooms: any[] = toPlain(rooms || [])
    const toRecord = safeRooms.filter((r: any) => !r.error && r.roomStatus !== 2 && !recordingManager.has(r.enterRoomId))

    const failures: Array<{ roomId: string; nickname: string; reason: string }> = []
    for (const room of toRecord) {
      try {
        const nick = (room.nickname || '').toString() || `room_${room.enterRoomId}`
        // 保证：弹幕先连上（"全局录制"语义 = 弹幕也要自动连）
        if (!danmuConnections.has(room.enterRoomId)) {
          try { await connectDanmuRoom(room.enterRoomId, nick) } catch (e: any) {
            logger.warn(LOG_MODULE, `全局录制-连弹幕失败 roomId=${room.enterRoomId}: ${e.message}`)
          }
        }
        const result = await getPullUrl(room.enterRoomId)
        if (!result.success) {
          failures.push({ roomId: room.enterRoomId, nickname: nick, reason: '获取直播流失败' })
          continue
        }
        const pullUrl = pickQualityUrl(result, room.quality || '')
        const session = buildRecordSession(room.enterRoomId, result.nickname || nick)
        const ok = recordingManager.startRecording({
          roomId: room.enterRoomId,
          pullUrl,
          nickname: result.nickname || nick,
          format,
          segmentMin,
          quality: room.quality || '',
          sessionId: session.sessionId,
          outputDir: session.outputDir,
          csvPath: session.csvPath,
          startTime: session.startTime,
        })
        if (!ok) failures.push({ roomId: room.enterRoomId, nickname: nick, reason: '启动录制失败' })
      } catch (ex: any) {
        failures.push({ roomId: room.enterRoomId, nickname: room.nickname, reason: ex.message })
      }
    }
    if (failures.length) logger.warn(LOG_MODULE, `全局录制部分失败 ${failures.length}/${toRecord.length}: ${JSON.stringify(failures)}`)
    return { ...recordingManager.getState(), failures }
  })

  ipcMain.handle('record:start-one', async (_e, room: any) => {
    const cfg = config.loadConfig()
    const format = cfg.outputFormat
    const segmentMin = cfg.segmentEnabled ? cfg.segmentDuration : 0
    const nick = (room.nickname || '').toString() || `room_${room.enterRoomId}`
    if (!danmuConnections.has(room.enterRoomId)) {
      try { await connectDanmuRoom(room.enterRoomId, nick) } catch (e: any) {
        logger.warn(LOG_MODULE, `单录制-连弹幕失败 roomId=${room.enterRoomId}: ${e.message}`)
      }
    }
    const result = await getPullUrl(room.enterRoomId)
    if (!result.success) throw new Error('无法获取直播流')
    const pullUrl = pickQualityUrl(result, room.quality || '')
    const session = buildRecordSession(room.enterRoomId, result.nickname || nick)
    recordingManager.startRecording({
      roomId: room.enterRoomId,
      pullUrl,
      nickname: result.nickname || nick,
      format,
      segmentMin,
      quality: room.quality || '',
      sessionId: session.sessionId,
      outputDir: session.outputDir,
      csvPath: session.csvPath,
      startTime: session.startTime,
    })
    return recordingManager.getState()
  })

  // 录制完成后通知前端刷新历史录制
  recordingManager.onSessionFinalized = (s) => {
    safeSend('record:session-finalized', s)
  }

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
