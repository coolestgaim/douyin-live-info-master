import * as os from 'os'
import * as crypto from 'crypto'
import axios from 'axios'
import * as logger from './logger'
import { loadConfig } from './record-config'

const LOG_MODULE = 'LicenseOnline'

// 服务器地址 - 部署后修改为你的 API 网关地址
function getServerUrl(): string {
  return loadConfig().licenseServerUrl || ''
}

// 心跳间隔 30 分钟
const HEARTBEAT_INTERVAL = 30 * 60 * 1000

let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let currentKey = ''
let currentMachineCode = ''

/**
 * 生成机器指纹
 */
export function getMachineCode(): string {
  try {
    const interfaces = os.networkInterfaces()
    const macs: string[] = []
    for (const [, addrs] of Object.entries(interfaces)) {
      if (addrs) {
        for (const addr of addrs) {
          if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
            macs.push(addr.mac)
          }
        }
      }
    }
    macs.sort()
    const raw = [
      os.hostname(),
      os.cpus()[0]?.model || '',
      os.totalmem().toString(),
      macs.join('|')
    ].join('::')
    return crypto.createHash('sha256').update(raw).digest('hex')
  } catch {
    // 降级：只用 hostname
    return crypto.createHash('sha256').update(os.hostname()).digest('hex')
  }
}

/**
 * 在线验证卡密
 * 优先走网络，网络不通时返回 null（由调用方降级到离线验证）
 */
export async function verifyOnline(key: string, machineCode: string): Promise<{
  valid: boolean
  message: string
  userId?: string
  expiresAt?: string
} | null> {
  if (!getServerUrl()) return null

  try {
    const res = await axios.post(`${getServerUrl()}/verify`, {
      key,
      machine_code: machineCode
    }, { timeout: 8000 })

    const data = res.data
    return {
      valid: data.valid,
      message: data.message || (data.valid ? '验证通过' : '验证失败'),
      userId: data.user_id,
      expiresAt: data.expires_at
    }
  } catch (e: any) {
    logger.warn(LOG_MODULE, `在线验证失败（将降级到离线）: ${e.message}`)
    return null  // 网络不通，降级
  }
}

/**
 * 发送心跳
 */
export async function sendHeartbeat(): Promise<boolean> {
  if (!getServerUrl() || !currentKey) return false
  try {
    const res = await axios.post(`${getServerUrl()}/beat`, {
      key: currentKey,
      machine_code: currentMachineCode
    }, { timeout: 10000 })

    if (res.data.revoked) {
      logger.warn(LOG_MODULE, '卡密已被吊销，即将退出')
      return false  // 返回 false 表示被吊销
    }
    return true
  } catch {
    // 心跳失败不阻塞，下次重试
    return true
  }
}

/**
 * 启动心跳定时器
 */
export function startHeartbeat(key: string, machineCode: string): void {
  stopHeartbeat()
  currentKey = key
  currentMachineCode = machineCode

  // 首次立即发送一次
  sendHeartbeat()

  heartbeatTimer = setInterval(() => {
    sendHeartbeat()
  }, HEARTBEAT_INTERVAL)

  logger.info(LOG_MODULE, '心跳定时器已启动')
}

/**
 * 停止心跳定时器
 */
export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  currentKey = ''
  currentMachineCode = ''
}

/**
 * 退出时通知服务器设备下线
 */
export async function deactivateOnline(key: string, machineCode: string): Promise<void> {
  if (!getServerUrl()) return
  try {
    await axios.post(`${getServerUrl()}/deactivate`, {
      key,
      machine_code: machineCode
    }, { timeout: 5000 })
  } catch {
    // 忽略，不影响退出
  }
}
