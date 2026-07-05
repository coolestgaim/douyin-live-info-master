/**
 * 卡密生成工具 — HMAC-SHA256
 *
 * 用法：node gen-key.js <用户ID> [天数]
 *
 * 示例：
 *   node gen-key.js customer01 30    → 生成有效期30天的卡密
 *   node gen-key.js vip_user 365     → 生成有效期365天的卡密
 */

const crypto = require('crypto')

const userId = process.argv[2]
const days = parseInt(process.argv[3]) || 30

if (!userId) {
  console.log('用法: node gen-key.js <用户ID> [天数]')
  console.log('示例: node gen-key.js customer01 30')
  process.exit(1)
}

const SECRET = 'dylive-kms-2026-secret-key-v1'
const BASE = new Date('2025-01-01').getTime()
const expires = new Date(Date.now() + days * 86400_000)
const expireDays = Math.floor((expires.getTime() - BASE) / 86400_000)

const payload = Buffer.alloc(2 + userId.length)
payload.writeUInt16BE(expireDays, 0)
payload.write(userId, 2, 'utf-8')

const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest()
const raw = Buffer.concat([payload, hmac])
const key = raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

console.log(key)
console.log(`用户: ${userId}  有效期: ${days}天  至 ${expires.toISOString().substring(0,10)}`)
