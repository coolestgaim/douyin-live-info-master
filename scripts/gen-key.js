/**
 * 卡密生成工具 — HMAC-SHA256（64字符短卡密）
 *
 * 用法：
 *   node scripts/gen-key.js user001 30  → 生成卡密，有效期 30 天
 *
 * 输出格式：仅 64 字符纯 base64url
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// ⚠️ 密钥：与 electron/services/license.ts 保持一致
const SECRET = 'dylive-kms-2026-secret-key-v1'

const userId = process.argv[2]
const days = parseInt(process.argv[3]) || 30

if (!userId) {
  console.error('用法: node scripts/gen-key.js <用户ID> [天数]')
  process.exit(1)
}

// 过期时间：days since 2025-01-01
const BASE = new Date('2025-01-01').getTime()
const expires = new Date(Date.now() + days * 86400_000)
const expireDays = Math.floor((expires.getTime() - BASE) / 86400_000)

// 打包：2字节过期 + 用户ID → HMAC
const payload = Buffer.alloc(2 + userId.length)
payload.writeUInt16BE(expireDays, 0)
payload.write(userId, 2, 'utf-8')

const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest()

// payload + hmac → base64url → 64字符
const raw = Buffer.concat([payload, hmac])
const key = raw.toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '')

console.log('\n🔑 生成卡密 (64字符):')
console.log(`  ${key}\n`)
console.log(`  用户ID  : ${userId}`)
console.log(`  有效期  : ${expires.toISOString().substring(0, 10)}（${days}天）`)
console.log(`  卡密长度: ${key.length} 字符`)
