import { StreamRecorder } from './stream-recorder'
import { formatFileSize } from './format'
import { loadConfig } from './record-config'
import { nowLocal } from '../utils/time'
import * as logger from './logger'
import * as fs from 'fs'
import * as path from 'path'

const LOG_MODULE = 'RecordingManager'

// 自动重拉上限：拉流 URL 过期后最多自动重拉几次，防止死循环
const MAX_RETRY = 3

/** 录制会话：一个直播记录 = 视频 + 弹幕 CSV 在同一个子文件夹里 */
export interface RecordSessionInfo {
  sessionId: string          // 格式：{nickname}_{yyyyMMdd_HHmmss}，用作子文件夹名
  roomId: string
  nickname: string
  startTime: number          // ms 时间戳（录制启动时刻，用于回放与视频时间轴对齐）
  outputDir: string          // 完整的子文件夹绝对路径
  csvPath: string            // 弹幕 CSV 完整路径
  videoPattern: string       // ffmpeg 输出 pattern（含 %03d 时是分段）
}

interface RecordItem {
  nickname: string
  outputPath: string         // 显示用：取首段或单段视频路径
  sessionId: string
  outputDir: string
  csvPath: string
  startTime: number
  durationText: string
  sizeText: string
  isActive: boolean
  statusText: string
  hasDanmuCsv: boolean      // 录制过程中有没有收到弹幕
}

export class RecordingManager {
  private recorders = new Map<string, StreamRecorder>()
  private items = new Map<string, RecordItem>()
  private sessions = new Map<string, RecordSessionInfo>()
  private csvStreams = new Map<string, fs.WriteStream>()
  private retryAttempts = new Map<string, number>()
  private retrying = new Set<string>()
  /** 录制过程定时推送（1s 一次），让前端 stats-row 实时刷新大小/时长 */
  private refreshTimer: ReturnType<typeof setInterval> | null = null

  public onUpdate: (() => void) | null = null
  public onSessionFinalized: ((s: RecordSessionInfo) => void) | null = null   // 录制停止/异常退出时通知 ipc，UI 刷新历史录制

  has(roomId: string): boolean {
    return this.recorders.has(roomId)
  }

  hasSession(roomId: string): boolean {
    return this.sessions.has(roomId)
  }

  getSession(roomId: string): RecordSessionInfo | undefined {
    return this.sessions.get(roomId)
  }

  /** 启动录制：上游（ipc-handlers）需要先把 session/outputDir/csvPath 准备好 */
  startRecording(opts: {
    roomId: string
    pullUrl: string
    nickname: string
    format: string
    segmentMin: number
    quality: string
    sessionId: string
    outputDir: string
    csvPath: string
    startTime: number
  }): boolean {
    const { roomId, pullUrl, nickname, format, segmentMin, quality, sessionId, outputDir, csvPath, startTime } = opts

    // 关闭旧 csv 流（重入场景）
    this.closeCsvStream(roomId)

    const recorder = new StreamRecorder()

    recorder.onStatusChanged = (status) => {
      if (status.includes('异常')) {
        logger.warn(LOG_MODULE, `录制异常退出 roomId=${roomId} nickname=${nickname}`)
        recorder.stopRecording()
        const item = this.items.get(roomId)
        if (item) { item.statusText = '异常退出'; item.isActive = false }
        this.finalizeSession(roomId)
        this.onUpdate?.()
      }
    }

    recorder.onRecordingFailed = () => {
      void this.handleRecordingFailed(opts)
    }

    // 注入 session 信息给 recorder（输出到我们指定的子文件夹，文件名基底 = sessionId）
    recorder.setOutputSession?.({ outputDir, sessionId })
    recorder.startRecording(pullUrl, nickname, format, segmentMin, quality)

    if (!recorder.isRecording) {
      logger.warn(LOG_MODULE, `录制启动失败 roomId=${roomId}`)
      return false
    }

    this.recorders.set(roomId, recorder)
    this.sessions.set(roomId, { sessionId, roomId, nickname, startTime, outputDir, csvPath, videoPattern: recorder.outputPath })
    this.items.set(roomId, {
      nickname,
      outputPath: recorder.outputPath,
      sessionId,
      outputDir,
      csvPath,
      startTime,
      durationText: '00:00:00',
      sizeText: '0 B',
      isActive: true,
      statusText: '录制中',
      hasDanmuCsv: false,
    })

    // 打开 csv 流（append 模式，写 UTF-8 BOM 让 Excel 兼容）
    try {
      const ws = fs.createWriteStream(csvPath, { flags: 'a', encoding: 'utf-8' })
      ws.write('\ufeff时间,类型,用户名,内容,礼物名称,礼物数量,礼物价值,点赞次数\n')
      this.csvStreams.set(roomId, ws)
    } catch (e: any) {
      logger.warn(LOG_MODULE, `打开 CSV 流失败 roomId=${roomId}: ${e?.message ?? e}`)
    }

    logger.info(LOG_MODULE, `开始录制 roomId=${roomId} nickname=${nickname} session=${sessionId} dir=${outputDir}`)
    this.onUpdate?.()  // 主动通知前端「录制已开始」（之前仅异常时才触发，导致渲染页看不到任务）
    this.startRefresh()  // 启动 1s 定时推送（录制过程中 stats 实时刷新）
    return true
  }

  /** 启动/重启定时推送（多录制时单 timer 复用） */
  private startRefresh(): void {
    if (this.refreshTimer) return
    this.refreshTimer = setInterval(() => { this.onUpdate?.() }, 1000)
  }

  private stopRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  /** 弹幕实时追加到该房间的 CSV 流 */
  appendDanmu(roomId: string, msg: any): void {
    const ws = this.csvStreams.get(roomId)
    if (!ws) return
    const item = this.items.get(roomId)
    const row = [
      msg.time || nowLocal(),
      msg.type || '',
      msg.userName || '',
      msg.content || '',
      msg.giftName || '',
      msg.giftCount ?? 0,
      msg.giftPrice ?? 0,
      msg.likeCount ?? 0,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    try {
      ws.write(row + '\n')
      if (item) item.hasDanmuCsv = true
    } catch { /* 写失败忽略 */ }
  }

  stopAll(): void {
    for (const [roomId, recorder] of this.recorders) {
      const item = this.items.get(roomId)
      if (item) {
        item.durationText = recorder.getDurationText()
        item.sizeText = formatFileSize(recorder.currentFileSize)
        item.statusText = '已停止'
        item.isActive = false
      }
      recorder.stopRecording()
      this.finalizeSession(roomId)
    }
    logger.info(LOG_MODULE, `停止全部录制 count=${this.recorders.size}`)
    this.recorders.clear()
    this.retryAttempts.clear()
    this.retrying.clear()
    this.stopRefresh()  // 全停后清掉定时器
    this.onUpdate?.()  // 主动通知前端
  }

  stopOne(roomId: string): void {
    const recorder = this.recorders.get(roomId)
    if (recorder) {
      const item = this.items.get(roomId)
      if (item) {
        item.durationText = recorder.getDurationText()
        item.sizeText = formatFileSize(recorder.currentFileSize)
        item.statusText = '已停止'
        item.isActive = false
      }
      recorder.stopRecording()
      this.finalizeSession(roomId)
      this.recorders.delete(roomId)
      this.retryAttempts.delete(roomId)
      logger.info(LOG_MODULE, `停止录制 roomId=${roomId}`)
      // 若全停完了，清掉定时器
      if (this.recorders.size === 0) this.stopRefresh()
      this.onUpdate?.()  // 主动通知前端
    }
  }

  /** 收尾：关闭 csv 流、上报已完成的 session（给录制历史） */
  private finalizeSession(roomId: string): void {
    const sess = this.sessions.get(roomId)
    this.closeCsvStream(roomId)
    this.sessions.delete(roomId)
    if (sess) {
      this.onSessionFinalized?.(sess)
    }
  }

  private closeCsvStream(roomId: string): void {
    const ws = this.csvStreams.get(roomId)
    if (ws) {
      try { ws.end() } catch { /* ignore */ }
      this.csvStreams.delete(roomId)
    }
  }

  private async handleRecordingFailed(opts: {
    roomId: string; pullUrl: string; nickname: string; format: string; segmentMin: number; quality: string; sessionId: string; outputDir: string; csvPath: string; startTime: number
  }): Promise<void> {
    const { roomId, nickname, format, segmentMin, quality, sessionId, outputDir, csvPath, startTime } = opts
    if (this.retrying.has(roomId)) return
    this.retrying.add(roomId)
    const item = this.items.get(roomId)
    try {
      const attempts = (this.retryAttempts.get(roomId) || 0) + 1
      this.retryAttempts.set(roomId, attempts)
      if (attempts > MAX_RETRY) {
        logger.warn(LOG_MODULE, `拉流重拉已达上限(${MAX_RETRY}次)，放弃 roomId=${roomId}`)
        if (item) { item.statusText = '异常退出（多次重拉失败）'; item.isActive = false }
        this.recorders.delete(roomId)
        this.retryAttempts.delete(roomId)
        this.finalizeSession(roomId)
        this.onUpdate?.()
        return
      }
      if (item) item.statusText = `拉流中断，自动重连(${attempts}/${MAX_RETRY})...`
      this.onUpdate?.()
      logger.info(LOG_MODULE, `拉流失败，自动重拉 URL (${attempts}/${MAX_RETRY}) roomId=${roomId}`)

      const { getPullUrl } = await import('./live-stream')
      const result = await getPullUrl(roomId)
      if (!result.success || !result.pullUrl) {
        throw new Error('重拉失败：拉流接口无返回（可能已下播或风控）')
      }
      const match = result.qualities.find(q => q.value === quality)
      const newUrl = match ? match.url : result.pullUrl

      const ok = this.startRecording({ roomId, pullUrl: newUrl, nickname, format, segmentMin, quality, sessionId, outputDir, csvPath, startTime })
      if (!ok) throw new Error('重启录制失败')
      if (item) { item.statusText = `录制中（已自动重连 ${attempts} 次）`; item.isActive = true }
      this.retryAttempts.set(roomId, attempts)
      this.onUpdate?.()
    } catch (ex: any) {
      logger.error(LOG_MODULE, `自动重拉失败 roomId=${roomId}: ${ex.message}`)
      if (item) { item.statusText = '异常退出'; item.isActive = false }
      this.recorders.delete(roomId)
      this.retryAttempts.delete(roomId)
      this.finalizeSession(roomId)
      this.onUpdate?.()
    } finally {
      this.retrying.delete(roomId)
    }
  }

  getState(): { items: any[]; count: number; sessions: RecordSessionInfo[] } {
    const items: any[] = []
    for (const [roomId, recorder] of this.recorders) {
      const item = this.items.get(roomId)
      if (item && recorder.isRecording) {
        item.durationText = recorder.getDurationText()
        item.sizeText = formatFileSize(recorder.currentFileSize)
      }
    }
    for (const [roomId, item] of this.items) {
      items.push({ roomId, ...item })
    }
    const sessions: RecordSessionInfo[] = []
    for (const s of this.sessions.values()) sessions.push(s)
    return { items, count: this.recorders.size, sessions }
  }

  /** 给上层用：扫描输出根目录，按子文件夹索引出所有历史录制
   *  ⚠️ 隐私保护：只认本程序生成的会话命名 {nickname}_{yyyyMMdd_HHmmss}，
   *  且文件夹内必须至少有一个视频或 CSV；其余文件夹一律跳过（不列进历史） */
  static scanOutputRoot(rootDir: string, nicknameHint?: string): Array<{ sessionId: string; nickname: string; startTime: number; outputDir: string; videoFiles: string[]; csvFiles: string[] }> {
    const results: Array<{ sessionId: string; nickname: string; startTime: number; outputDir: string; videoFiles: string[]; csvFiles: string[] }> = []
    if (!fs.existsSync(rootDir)) return results
    const SESSION_RE = /^(.+)_(\d{8})_(\d{6})$/
    const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const m = e.name.match(SESSION_RE)
      // 非本程序会话命名 → 跳过（避免把用户个人文件夹当历史录制展示，保护隐私）
      if (!m) continue
      const sessionId = e.name
      const dir = path.join(rootDir, sessionId)
      let files: string[]
      try { files = fs.readdirSync(dir) } catch { continue }
      const videoFiles = files.filter(f => /\.(mp4|flv|ts|m4v)$/i.test(f)).map(f => path.join(dir, f))
      const csvFiles = files.filter(f => /\.csv$/i.test(f)).map(f => path.join(dir, f))
      // 文件夹里连一个视频或 CSV 都没有 → 不是有效录制产物，跳过
      if (videoFiles.length === 0 && csvFiles.length === 0) continue
      const nickname = m[1]
      const startTime = new Date(`${m[2].slice(0, 4)}-${m[2].slice(4, 6)}-${m[2].slice(6, 8)}T${m[3].slice(0, 2)}:${m[3].slice(2, 4)}:${m[3].slice(4, 6)}`).getTime()
      if (nicknameHint && nickname !== nicknameHint) continue
      results.push({ sessionId, nickname, startTime, outputDir: dir, videoFiles, csvFiles })
    }
    results.sort((a, b) => b.startTime - a.startTime)
    return results
  }
}
