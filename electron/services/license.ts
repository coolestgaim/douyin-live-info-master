/**
 * 卡密验证 — HMAC-SHA256（64 字符短卡密）
 *
 * 卡密格式：纯 base64url 64 字符
 * 解码 → [2B 过期天][用户ID][32B HMAC] → 验签 + 日期检查
 */

import * as crypto from 'crypto'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { verifyOnline, startHeartbeat, stopHeartbeat, deactivateOnline, getMachineCode } from './license-online'

const SECRET = 'dylive-kms-2026-secret-key-v1'
const LICENSE_FILE = path.join(app.getPath('userData'), 'license.dat')
const COS_REVOKED_URL = 'https://douyin-license-1304282821.cos.ap-guangzhou.myqcloud.com/revoked_list.json'

// ? COS ??????
let revokedCache: Set<string> | null = null
let revokedCacheTime = 0

async function getRevokedList(): Promise<Set<string>> {
  // ?? 5 ??
  if (revokedCache && Date.now() - revokedCacheTime < 5 * 60 * 1000) {
    return revokedCache
  }
  try {
    const res = await axios.get(COS_REVOKED_URL, { timeout: 5000 })
    revokedCache = new Set(res.data)
    revokedCacheTime = Date.now()
    return revokedCache
  } catch {
    // ????????????
    return new Set()
  }
}

export let lastVerifiedKey = ''

export function verifyKeyOnline(input: string): Promise<{ valid: boolean; message: string }> {
  return verifyKey(input, true)
}

export function verifyKey(input: string, tryOnline = false): Promise<{ valid: boolean; message: string }> {
  if (tryOnline) {
    return (async () => {
      const machineCode = getMachineCode()
      const onlineResult = await verifyOnline(input, machineCode)
      if (onlineResult) {
        if (onlineResult.valid) {
          lastVerifiedKey = input
          startHeartbeat(input, machineCode)
          const expiresMs = onlineResult.expiresAt ? new Date(onlineResult.expiresAt).getTime() : Date.now() + 365 * 86400_000
          const uid = onlineResult.userId || ''
          fs.writeFileSync(LICENSE_FILE, JSON.stringify({
            userId: uid,
            expires: new Date(expiresMs).toISOString(),
            savedAt: new Date().toISOString()
          }), 'utf-8')
          return { valid: true, message: onlineResult.message }
        }
        return { valid: false, message: onlineResult.message }
      }
      // 网络不通，降级到离线验证
      return doOfflineVerify(input)
    })()
  }
  return doOfflineVerify(input)
}

async function doOfflineVerify(input: string): Promise<{ valid: boolean; message: string }> {
  try {
    // base64url → standard
    const raw = input.trim()
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    const padding = b64.length % 4
    const data = Buffer.from(b64 + (padding ? '='.repeat(4 - padding) : ''), 'base64')

    if (data.length < 34) return { valid: false, message: '卡密格式无效' }

    // 提取：payload (前 N-32 字节) + hmac (后 32 字节)
    const hmac = data.subarray(data.length - 32)
    const payload = data.subarray(0, data.length - 32)

    // 验签
    const expected = crypto.createHmac('sha256', SECRET).update(payload).digest()
    if (!crypto.timingSafeEqual(hmac, expected)) {
      return { valid: false, message: '卡密验证失败' }
    }

    // 解析 payload：2B过期天 + 用户ID
    const expireDays = payload.readUInt16BE(0)
    const userId = payload.subarray(2).toString('utf-8')

    // 检查过期
    const BASE = new Date('2025-01-01').getTime()
    const expireMs = BASE + expireDays * 86400_000
    if (Date.now() > expireMs) {
      const d = new Date(expireMs)
      return { valid: false, message: `卡密已过期（${d.toISOString().substring(0, 10)}）` }
    }

    saveLicense(userId, expireMs)
    return { valid: true, message: `验证通过，有效期至 ${new Date(expireMs).toISOString().substring(0, 10)}` }
  } catch (e: any) {
    return { valid: false, message: '卡密解析失败: ' + e.message }
  }
}



function saveLicense(userId: string, expireMs: number) {
  try {
    fs.writeFileSync(LICENSE_FILE, JSON.stringify({
      userId, expires: new Date(expireMs).toISOString(), savedAt: new Date().toISOString()
    }), 'utf-8')
  } catch {}
}

export function loadLicense(): { userId: string; expires: string } | null {
  try {
    const data = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf-8'))
    if (data.expires && new Date(data.expires) > new Date()) {
      return { userId: data.userId, expires: data.expires }
    }
    try { fs.unlinkSync(LICENSE_FILE) } catch {}
  } catch {}
  return null
}

export function clearLicense() {
  try { fs.unlinkSync(LICENSE_FILE) } catch {}
}
