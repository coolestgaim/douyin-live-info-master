/**
 * 卡密验证 — ECDSA 离线验签
 *
 * 卡密格式：DY-XXXX-XXXX-XXX...
 * 去分段 → base64url 解码 → userId|expires|signature → ECDSA 验签
 *
 * 公钥由 scripts/gen-key.js 自动生成并写入此处
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

// ⚠️ 此公钥由 scripts/gen-key.js 自动更新，请勿手动修改
const PUBLIC_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsOlCOhWELn6Fe17/hU8fuAcWtc6+Ppd84LFj7GRCHn4lhy4UFG9rYed4KvLhpAaahC5mlPqRGLXglcUiwqOW1Q=='

const LICENSE_FILE = path.join(app.getPath('userData'), 'license.dat')

// ─── 验证卡密 ─────────────────────────────────────────
export function verifyKey(input: string): { valid: boolean; message: string } {
  try {
    // 去空格、DY- 前缀
    const raw = input.trim().replace(/^DY-/i, '')

    // base64url → standard: -→+, _→/, 补 =
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    const padding = b64.length % 4
    const standard = b64 + (padding ? '='.repeat(4 - padding) : '')

    const decoded = Buffer.from(standard, 'base64').toString('utf-8')
    const parts = decoded.split('|')
    if (parts.length !== 3) return { valid: false, message: '卡密格式无效' }

    const [userId, expiresStr, signatureB64] = parts
    const expiresDate = new Date(expiresStr)
    if (isNaN(expiresDate.getTime())) return { valid: false, message: '有效期格式错误' }
    if (expiresDate < new Date()) return { valid: false, message: `卡密已过期（有效期至 ${expiresStr}）` }

    // ECDSA 验签
    const payload = `${userId}:${expiresStr}`
    const signature = Buffer.from(signatureB64, 'base64')
    const pubKey = `-----BEGIN PUBLIC KEY-----\n${PUBLIC_KEY}\n-----END PUBLIC KEY-----`

    const ok = crypto.verify('sha256', Buffer.from(payload), pubKey, signature)
    if (!ok) return { valid: false, message: '卡密验证失败' }

    // 缓存
    saveLicense(userId, expiresStr)
    return { valid: true, message: `验证通过，有效期至 ${expiresStr}` }
  } catch (e: any) {
    return { valid: false, message: '卡密解析失败: ' + e.message }
  }
}

// ─── 本地缓存 ─────────────────────────────────────────
function saveLicense(userId: string, expires: string) {
  try {
    fs.writeFileSync(LICENSE_FILE, JSON.stringify({
      userId, expires, savedAt: new Date().toISOString()
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
