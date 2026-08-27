// 预约开播监听服务：轮询主播开播状态，开播后触发自动连接弹幕 + 自动录制
// 使用场景：主播未开播时预约，等开播瞬间自动开始监听与录制，无需人工盯着
import { DouyinLiveService } from './douyin-live'
import * as logger from './logger'

const LOG_MODULE = 'RoomWatch'

/** 开播状态轮询间隔（毫秒）— 60s 一次，避免频繁请求触发风控 */
const POLL_INTERVAL = 60_000
/** 单个房间连续查询失败多少次后移除预约（防无效预约挂住） */
const MAX_RETRY_ROOM = 5

export interface WatchTarget {
  url: string
  roomId: string
  nickname: string
  quality?: string
  started: boolean
  failCount: number
}

export class RoomWatchService {
  private targets = new Map<string, WatchTarget>()
  private timer: ReturnType<typeof setInterval> | null = null
  private polling = false
  private live: DouyinLiveService

  /** 开播回调（由 ipc-handlers 注入：自动连弹幕 + 自动录制） */
  onStarted: ((target: WatchTarget) => void) | null = null
  /** 下播回调（由 ipc-handlers 注入：自动停止录制 + 断开弹幕） */
  onStopped: ((target: WatchTarget) => void) | null = null

  constructor() {
    // 复用同一实例累积 cookie（每次查询都要 ttwid 等）
    this.live = new DouyinLiveService()
  }

  add(target: { url: string; roomId: string; nickname: string; quality?: string }, startPolling = true): boolean {
    if (!target.url || !target.roomId) return false
    if (this.targets.has(target.roomId)) return false
    this.targets.set(target.roomId, { ...target, started: false, failCount: 0 })
    if (startPolling) this.ensurePolling()
    logger.info(LOG_MODULE, `预约开播 roomId=${target.roomId} nickname=${target.nickname}`)
    return true
  }

  remove(roomId: string): boolean {
    const existed = this.targets.delete(roomId)
    if (this.targets.size === 0) this.stopPolling()
    if (existed) logger.info(LOG_MODULE, `取消预约 roomId=${roomId}`)
    return existed
  }

  stopAll(): void {
    this.targets.clear()
    this.stopPolling()
  }

  list(): WatchTarget[] {
    return Array.from(this.targets.values())
  }

  has(roomId: string): boolean {
    return this.targets.has(roomId)
  }

  /** 标记某房间已开播（避免与轮询重复触发） */
  markStarted(roomId: string): WatchTarget | undefined {
    const t = this.targets.get(roomId)
    if (t) { t.started = true; t.failCount = 0 }
    return t
  }

  /** 标记某房间已下播（移除预约 + 触发 onStopped） */
  markStopped(roomId: string, emit: boolean = true): WatchTarget | undefined {
    const t = this.targets.get(roomId)
    if (t) {
      this.targets.delete(roomId)
      if (this.targets.size === 0) this.stopPolling()
      if (emit) {
        try { this.onStopped?.(t) } catch (e: any) {
          logger.error(LOG_MODULE, `下播回调异常: ${e.message}`)
        }
      }
    }
    return t
  }

  /** 未开播时启动轮询；已开播的（started）会被 poll 跳过 */
  startPolling(): void {
    this.ensurePolling()
  }

  private ensurePolling(): void {
    if (!this.timer) {
      // 立即查一次（可能已开播），再进入周期轮询
      void this.poll()
      this.timer = setInterval(() => void this.poll(), POLL_INTERVAL)
    }
  }

  private stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      for (const [roomId, t] of Array.from(this.targets.entries())) {
        if (t.started) continue
        try {
          const info = await this.live.fetchLiveRoomInfo(t.url)
          // roomStatus: 1 = 直播中, 2 = 未开播 / 已下播
          if (info.roomStatus === 1) {
            t.started = true
            t.failCount = 0
            logger.info(LOG_MODULE, `主播开播！roomId=${roomId} nickname=${t.nickname}`)
            try {
              this.onStarted?.(t)
            } catch (e: any) {
              logger.error(LOG_MODULE, `开播回调异常: ${e.message}`)
            }
          } else {
            t.failCount = 0
          }
        } catch (ex: any) {
          t.failCount++
          logger.warn(LOG_MODULE, `查询开播状态失败(${t.failCount}/${MAX_RETRY_ROOM}) roomId=${roomId}: ${ex.message}`)
          if (t.failCount >= MAX_RETRY_ROOM) {
            this.targets.delete(roomId)
            logger.warn(LOG_MODULE, `连续失败超过上限，移除预约 roomId=${roomId}`)
          }
        }
      }

      // 已开播的预约：检测是否下播
      for (const t of this.startedTargets()) {
        try {
          const info = await this.live.fetchLiveRoomInfo(t.url)
          if (info.roomStatus !== 1) {
            logger.info(LOG_MODULE, `检测到主播下播 roomId=${t.roomId} nickname=${t.nickname} roomStatus=${info.roomStatus}`)
            this.markStopped(t.roomId, true)
          }
        } catch (ex: any) {
          logger.warn(LOG_MODULE, `下播检测失败 roomId=${t.roomId}: ${ex.message}`)
          // 不立即停：网络抖动容错，下次轮询再判
        }
      }
    } finally {
      this.polling = false
    }
  }

  /** 列出"开播中"的预约（poll 用于检查下播） */
  private startedTargets(): WatchTarget[] {
    return Array.from(this.targets.values()).filter(t => t.started)
  }
}

export const roomWatch = new RoomWatchService()
