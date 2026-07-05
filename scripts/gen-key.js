/**
 * 卡密生成工具 — ECDSA 离线验签（短卡密）
 *
 * 用法：
 *   node scripts/gen-key.js                → 先生成密钥对
 *   node scripts/gen-key.js user001 30     → 生成卡密，有效期 30 天
 *
 * 输出格式：DY-XXXX-XXXX-XXXX（短）
 * 公钥自动更新到 electron/services/license.ts
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const KEY_DIR = path.join(__dirname, '..', 'keys')
const PRIVATE_KEY_PATH = path.join(KEY_DIR, 'ec-private.pem')
const PUBLIC_KEY_PATH = path.join(KEY_DIR, 'ec-public.pem')
const LICENSE_TS = path.join(__dirname, '..', 'electron', 'services', 'license.ts')

function chunk(s, n) {
  const parts = []
  for (let i = 0; i < s.length; i += n) parts.push(s.substring(i, i + n))
  return parts
}

// ─── 生成 ECDSA 密钥对 ────────────────────────────────
if (process.argv.length < 4) {
  if (!fs.existsSync(PRIVATE_KEY_PATH) || !fs.existsSync(PUBLIC_KEY_PATH)) {
    console.log('🔑 生成 ECDSA P-256 密钥对...')
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })

    fs.mkdirSync(KEY_DIR, { recursive: true })
    fs.writeFileSync(PRIVATE_KEY_PATH, privateKey)
    fs.writeFileSync(PUBLIC_KEY_PATH, publicKey)
    console.log('✅ 密钥对已生成到 keys/ 目录')

    const pubKeyBase64 = publicKey
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '')
    const licContent = fs.readFileSync(LICENSE_TS, 'utf-8')
    const updated = licContent.replace(
      /const PUBLIC_KEY = '.*?'/,
      `const PUBLIC_KEY = '${pubKeyBase64}'`
    )
    fs.writeFileSync(LICENSE_TS, updated)
    console.log('  📄 license.ts 公钥已自动更新')
  } else {
    console.log('⚙️  密钥对已存在')
  }
  process.exit(0)
}

// ─── 生成卡密 ─────────────────────────────────────────
const userId = process.argv[2]
const days = parseInt(process.argv[3]) || 30

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error('❌ 请先运行 `node scripts/gen-key.js` 生成密钥对')
  process.exit(1)
}

const expires = new Date(Date.now() + days * 86400_000).toISOString().substring(0, 10)
const payload = `${userId}:${expires}`
const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8')
const signature = crypto.sign('sha256', Buffer.from(payload), privateKey).toString('base64')

// userId|expires|signature → base64url（不分段，仅 DY- 前缀）
const raw = Buffer.from(`${userId}|${expires}|${signature}`)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '')
const key = 'DY-' + raw

console.log('\n🔑 生成卡密:')
console.log(`  ${key}\n`)
console.log(`  用户ID : ${userId}`)
console.log(`  有效期 : ${expires}（${days}天）`)
console.log(`  卡密长度: ${key.length} 字符`)
