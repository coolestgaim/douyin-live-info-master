/**
 * 卡密验证 — HMAC-SHA256（64 字符短卡密）
 *
 * 卡密格式：纯 base64url 64 字符
 * 解码 → [2B 过期天][用户ID][32B HMAC] → 验签 + 日期检查
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

const SECRET = 'dylive-kms-2026-secret-key-v1'
const LICENSE_FILE = path.join(app.getPath('userData'), 'license.dat')

export function verifyKey(input: string): { valid: boolean; message: string } {
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
