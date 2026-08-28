import WebSocket from 'ws'
import { gunzipSync } from 'zlib'
import { buildWssUrl } from './signature'
import { parse, getFieldString, getFieldDict, getBytesField, getBoolField, getLongField, getIntField, extractRepeatedField, ProtobufMap } from './protobuf-parser'
import { initializeTable, insertMessage } from './database'
import { nowLocal } from '../utils/time'
import * as logger from './logger'

export interface DanmuMsg {
  type: string
  userName: string
  content: string
  giftName: string
  giftCount: number
  giftPrice: number
  likeCount: number
  totalUser: number
  totalLike: number
  time: string
  roomName: string
  avatar: string
  profileUrl: string
  rawData: string
}

const HEARTBEAT_BYTES = Buffer.from([0x3A, 0x02, 0x68, 0x62])
const LOG_MODULE = 'Danmu'

export class DanmuService {
  private ws: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private roomId = ''
  private nickname = ''
  private cookie = ''
  private manualStop = false          // 主动断开（不重连）
  private hasConnected = false        // 是否曾连接成功（决定意外断开是否自动重连）
  private reconnectAttempts = 0       // 连续重连次数（用于退避与提示）

  public onMessage: ((msg: DanmuMsg) => void) | null = null
  public onStatusChanged: ((status: string) => void) | null = null
  public onDisconnected: ((reason: string) => void) | null = null

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  async connect(roomId: string, cookie: string, nick: string): Promise<void> {
    this.roomId = roomId
    this.cookie = cookie
    this.nickname = nick
    this.manualStop = false
    this.hasConnected = false
    this.reconnectAttempts = 0
    await this.establishWs()
  }

  /** 建立单次连接（签名 + WebSocket）。连接成功后 resolve；首次连接失败 reject（由调用方提示）。 */
  private establishWs(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        this.onStatusChanged?.('正在计算签名...')
        const url = await buildWssUrl(this.roomId)
        logger.info(LOG_MODULE, `签名完成 url长度=${url.length}`)
        this.onStatusChanged?.('正在连接...')

        let settled = false
        const ws = new WebSocket(url, {
          headers: {
            'Cookie': this.cookie,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
          }
        })
        this.ws = ws

        ws.on('open', () => {
          if (ws !== this.ws) return
          logger.info(LOG_MODULE, 'WebSocket连接成功!')
          this.hasConnected = true
          const isReconnect = this.reconnectAttempts > 0
          this.reconnectAttempts = 0
          this.onStatusChanged?.(isReconnect ? '已连接（自动重连成功）' : '已连接')
          this.startHeartbeat()
          initializeTable(this.roomId, this.nickname)
          if (!settled) { settled = true; resolve() }
        })

        ws.on('message', (data: WebSocket.Data) => {
          if (ws !== this.ws) return
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as string)
          this.processMessage(buf)
        })

        ws.on('close', () => {
          if (ws !== this.ws) return
          logger.info(LOG_MODULE, 'WebSocket关闭')
          this.stopHeartbeat()
          this.ws = null
          // 首次连接失败（从未连上）→ 通知断开，不自动重连
          if (!this.hasConnected) {
            if (!settled) { settled = true; reject(new Error('连接失败')) }
            this.onDisconnected?.('连接失败')
            return
          }
          // 已连接后断开：主动断开不重连；意外断开自动重连
          if (this.manualStop) {
            this.onDisconnected?.('连接断开')
          } else {
            this.scheduleReconnect()
          }
        })

        ws.on('error', (err: Error) => {
          if (ws !== this.ws) return
          logger.error(LOG_MODULE, `WebSocket错误: ${err.message}`)
          // 首次连接失败立即 reject（close 兜底已处理，这里防挂起）
          if (!this.hasConnected && !settled) {
            settled = true
            this.onDisconnected?.(err.message)
            reject(new Error(err.message))
          }
          // 已连接后的 error 通常紧接 close，由 close 触发重连
        })
      } catch (ex: any) {
        reject(ex)
      }
    })
  }

  disconnect(): void {
    this.manualStop = true
    this.stopHeartbeat()
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.ws) {
      try { this.ws.close() } catch { /* ignore */ }
    }
    logger.info(LOG_MODULE, '主动断开')
  }

  /** 意外断开后指数退避重连：1s → 2s → 4s → 8s → 16s → 30s 封顶，无限重试 */
  private scheduleReconnect(): void {
    if (this.manualStop) return
    this.reconnectAttempts++
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, this.reconnectAttempts)))
    this.onStatusChanged?.(`连接断开，${Math.round(delay / 1000)}秒后自动重连（第${this.reconnectAttempts}次）`)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => { void this.doReconnect() }, delay)
  }

  private async doReconnect(): Promise<void> {
    if (this.manualStop) return
    try {
      await this.establishWs()
      // 成功：open 回调已更新状态
    } catch (ex: any) {
      logger.warn(LOG_MODULE, `自动重连失败: ${ex.message}`)
      this.scheduleReconnect()
    }
  }

  private startHeartbeat(): void {
    // First heartbeat after 5s, then every 10s (matches C# version)
    setTimeout(() => {
      this.sendHeartbeat()
      this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), 10000)
    }, 5000)
  }

  private sendHeartbeat(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(HEARTBEAT_BYTES)
        logger.info(LOG_MODULE, '发送心跳')
      } catch (ex: any) {
        logger.warn(LOG_MODULE, `心跳失败: ${ex.message}`)
      }
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  private processMessage(data: Buffer): void {
    try {
      const pushFrame = parse(data)
      let payloadBytes = getBytesField(pushFrame, 'f8')
      if (!payloadBytes) {
        logger.warn(LOG_MODULE, `PushFrame字段: ${Object.keys(pushFrame).join(',')} — 无f8`)
        return
      }

      payloadBytes = maybeDecompress(payloadBytes)
      const response = parse(payloadBytes)

      if (getBoolField(response, 'f9')) {
        const internalExt = getFieldString(response, 'f5') || ''
        const logId = getLongField(pushFrame, 'f2', 0)
        this.sendAck(logId, internalExt)
      }

      const messages = extractRepeatedField(payloadBytes, 1)
      for (const msgBytes of messages) {
        try {
          const msgPayloads = extractRepeatedField(msgBytes, 2)
          if (msgPayloads.length === 0) continue

          const msg = parse(msgBytes)
          const method = getFieldString(msg, 'f1')
          if (!method) continue

          const msgPayload = maybeDecompress(msgPayloads[0])
          const inner = parse(msgPayload)
          this.parseByMethod(method, inner)
        } catch (ex: any) {
          logger.error(LOG_MODULE, `[MsgError] ${ex.message}`)
        }
      }
    } catch (ex: any) {
      logger.error(LOG_MODULE, `ProcessMessage异常: ${ex.message}`)
    }
  }

  private sendAck(logId: number, internalExt: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return

    try {
      const parts: Buffer[] = []

      if (logId > 0) {
        parts.push(Buffer.from(encodeVarint(BigInt((2 << 3) | 0))))
        parts.push(Buffer.from(encodeVarint(BigInt(logId))))
      }

      const ackType = Buffer.from('ack', 'utf-8')
      parts.push(Buffer.from(encodeVarint(BigInt((7 << 3) | 2))))
      parts.push(Buffer.from(encodeVarint(BigInt(ackType.length))))
      parts.push(ackType)

      if (internalExt) {
        const payloadBytes = Buffer.from(internalExt, 'utf-8')
        parts.push(Buffer.from(encodeVarint(BigInt((8 << 3) | 2))))
        parts.push(Buffer.from(encodeVarint(BigInt(payloadBytes.length))))
        parts.push(payloadBytes)
      }

      this.ws.send(Buffer.concat(parts))
      logger.info(LOG_MODULE, `发送ACK log_id=${logId}`)
    } catch (ex: any) {
      logger.error(LOG_MODULE, `发送ACK失败: ${ex.message}`)
    }
  }

  private parseByMethod(method: string, data: ProtobufMap): void {
    const rawJson = JSON.stringify({ method, data })

    if (method.includes('WebcastChatMessage')) this.parseChatMessage(data, rawJson)
    else if (method.includes('WebcastMemberMessage')) this.parseMemberMessage(data, rawJson)
    else if (method.includes('WebcastGiftSortMessage')) this.parseGiftSortMessage(data, rawJson)
    else if (method.includes('WebcastGiftMessage')) this.parseGiftMessage(data, rawJson)
    else if (method.includes('WebcastChatLikeMessage')) this.parseChatLikeMessage(data, rawJson)
    else if (method.includes('WebcastLikeMessage')) this.parseLikeMessage(data, rawJson)
    else if (method.includes('WebcastSocialMessage')) this.parseSocialMessage(data, rawJson)
    else if (method.includes('WebcastRoomStatsMessage')) this.parseStatsMessage(data, rawJson)
    else if (method.includes('WebcastRoomUserSeqMessage')) this.parseRoomUserSeqMessage(data, rawJson)
  }

  private emitMsg(partial: Partial<DanmuMsg>): void {
    const msg: DanmuMsg = {
      type: partial.type || 'Chat',
      userName: partial.userName || '',
      content: partial.content || '',
      giftName: partial.giftName || '',
      giftCount: partial.giftCount || 0,
      giftPrice: partial.giftPrice || 0,
      likeCount: partial.likeCount || 0,
      totalUser: partial.totalUser || 0,
      totalLike: partial.totalLike || 0,
      time: nowLocal(),
      roomName: this.nickname,
      avatar: partial.avatar || '',
      profileUrl: partial.profileUrl || '',
      rawData: partial.rawData || ''
    }
    this.onMessage?.(msg)

    // Save to database
    const dbContent = msg.type === 'Stats' ? `在线: ${msg.totalUser} | 点赞: ${msg.totalLike}` : msg.content
    insertMessage(this.roomId, {
      type: msg.type,
      userName: msg.userName,
      content: dbContent,
      giftName: msg.giftName,
      giftCount: msg.giftCount,
      giftPrice: msg.giftPrice,
      likeCount: msg.likeCount,
      avatar: msg.avatar,
      profileUrl: msg.profileUrl,
      rawData: msg.rawData
    })
  }

  private parseChatMessage(data: ProtobufMap, rawJson: string): void {
    const user = getFieldDict(data, 'f2')
    if (!user) return
    this.emitMsg({
      type: 'Chat',
      userName: getNickname(user),
      content: getFieldString(data, 'f3') || '',
      avatar: extractAvatar(user),
      profileUrl: extractProfileUrl(user),
      rawData: rawJson
    })
  }

  private parseMemberMessage(data: ProtobufMap, rawJson: string): void {
    const user = getFieldDict(data, 'f2')
    if (!user) return
    this.emitMsg({
      type: 'Member',
      userName: getNickname(user),
      avatar: extractAvatar(user),
      profileUrl: extractProfileUrl(user),
      rawData: rawJson
    })
  }

  private parseGiftMessage(data: ProtobufMap, rawJson: string): void {
    const user = getFieldDict(data, 'f7') || getFieldDict(data, 'f2') || getFieldDict(data, 'f15')
    const gift = getFieldDict(data, 'f15') || getFieldDict(data, 'f2')

    let giftName = '礼物'
    if (gift) {
      giftName = getFieldString(gift, 'f16') || getFieldString(gift, 'f6') ||
        getFieldString(gift, 'f2') || getFieldString(gift, 'f1') || '礼物'
    }

    let giftCount = getIntField(data, 'f6', 0)
    if (giftCount === 0) giftCount = getIntField(data, 'f4', 0)
    if (giftCount === 0) giftCount = getIntField(gift || data, 'f5', 0)
    if (giftCount === 0) giftCount = 1

    let giftPrice = gift ? getLongField(gift, 'f12', 0) : 0
    if (giftPrice === 0 && gift) giftPrice = getLongField(gift, 'f10', 0)

    this.emitMsg({
      type: 'Gift',
      userName: user ? getNickname(user) : '未知用户',
      giftName, giftCount, giftPrice,
      avatar: user ? extractAvatar(user) : '',
      profileUrl: user ? extractProfileUrl(user) : '',
      rawData: rawJson
    })
  }

  private parseGiftSortMessage(data: ProtobufMap, rawJson: string): void {
    const user = getFieldDict(data, 'f3') || getFieldDict(data, 'f7')
    const gift = getFieldDict(data, 'f5') || getFieldDict(data, 'f2')

    let giftName = '礼物'
    if (gift) {
      giftName = getFieldString(gift, 'f6') || getFieldString(gift, 'f2') ||
        getFieldString(gift, 'f1') || '礼物'
    }

    let giftCount = getIntField(data, 'f6', 0)
    if (giftCount === 0) giftCount = getIntField(data, 'f4', 0)
    if (giftCount === 0) giftCount = 1

    this.emitMsg({
      type: 'Gift',
      userName: user ? getNickname(user) : '未知用户',
      giftName, giftCount,
      giftPrice: gift ? getLongField(gift, 'f12', 0) : 0,
      avatar: user ? extractAvatar(user) : '',
      profileUrl: user ? extractProfileUrl(user) : '',
      rawData: rawJson
    })
  }

  private parseLikeMessage(data: ProtobufMap, rawJson: string): void {
    const user = getFieldDict(data, 'f5')
    if (!user) return
    this.emitMsg({
      type: 'Like',
      userName: getNickname(user),
      likeCount: getIntField(data, 'f2', 1),
      avatar: extractAvatar(user),
      profileUrl: extractProfileUrl(user),
      rawData: rawJson
    })
  }

  private parseChatLikeMessage(_data: ProtobufMap, rawJson: string): void {
    this.emitMsg({ type: 'Like', userName: '观众', likeCount: 1, rawData: rawJson })
  }

  private parseSocialMessage(data: ProtobufMap, rawJson: string): void {
    const user = getFieldDict(data, 'f2')
    if (!user) return
    this.emitMsg({
      type: 'Social',
      userName: getNickname(user),
      avatar: extractAvatar(user),
      profileUrl: extractProfileUrl(user),
      rawData: rawJson
    })
  }

  private parseStatsMessage(data: ProtobufMap, rawJson: string): void {
    this.emitMsg({
      type: 'Stats',
      totalUser: getLongField(data, 'f2', 0),
      totalLike: getLongField(data, 'f3', 0),
      rawData: rawJson
    })
  }

  private parseRoomUserSeqMessage(data: ProtobufMap, rawJson: string): void {
    this.emitMsg({
      type: 'Stats',
      totalUser: getLongField(data, 'f3', 0),
      totalLike: getLongField(data, 'f7', 0),
      rawData: rawJson
    })
  }
}

function getNickname(user: ProtobufMap): string {
  return getFieldString(user, 'f3') || getFieldString(user, 'f1') || getFieldString(user, 'f2') || '未知'
}

function extractAvatar(user: ProtobufMap): string {
  const raw = getFieldString(user, 'f9')
  if (raw) {
    // f9 is a string: "\n" + one char + actual url
    return raw.length > 2 ? raw.substring(2) : raw.replace(/^\s+/, '')
  }
  // f9 may be a nested dict with f1 as the avatar url
  const f9dict = getFieldDict(user, 'f9')
  if (f9dict) {
    return getFieldString(f9dict, 'f1') || ''
  }
  return ''
}

function extractProfileUrl(user: ProtobufMap): string {
  const secUid = getFieldString(user, 'f46') || ''
  if (!secUid) return ''
  return `https://www.douyin.com/user/${secUid}`
}

function maybeDecompress(data: Buffer): Buffer {
  if (data.length > 2 && data[0] === 0x1F && data[1] === 0x8B) {
    return gunzipSync(data)
  }
  return data
}

function encodeVarint(value: bigint): number[] {
  const bytes: number[] = []
  let v = value
  while (v > 0x7Fn) {
    bytes.push(Number(v & 0x7Fn) | 0x80)
    v >>= 7n
  }
  bytes.push(Number(v))
  return bytes
}
