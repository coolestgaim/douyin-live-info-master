import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock electron（license.ts 依赖 app.getPath，用真实 TEMP 目录避免写入盘根触发慢路径）
vi.mock('electron', () => ({
  app: { getPath: () => process.env.TEMP || '/tmp' }
}))

// mock 在线验证模块（单测只覆盖离线验签逻辑）
vi.mock('../electron/services/license-online', () => ({
  verifyOnline: async () => null,
  startHeartbeat: () => {},
  stopHeartbeat: () => {},
  deactivateOnline: async () => {},
  getMachineCode: () => 'test-machine'
}))

import * as crypto from 'crypto'
import { verifyKey } from '../electron/services/license'

const SECRET = 'dylive-kms-2026-secret-key-v1'

/** 用与 sign 端相同算法构造卡密 */
function makeKey(expireDays: number, userId: string): string {
  const payload = Buffer.alloc(2 + Buffer.byteLength(userId))
  payload.writeUInt16BE(expireDays, 0)
  payload.write(userId, 2, 'utf-8')
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest()
  const full = Buffer.concat([payload, hmac])
  return full.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('license 离线验签', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('合法未过期卡密验证通过', async () => {
    // 365 天（2025-01-01 + 365d ≈ 2025-12-31，若测试运行晚于该日期会失败——用更大值）
    const key = makeKey(10000, 'user-test')
    const result = await verifyKey(key)
    expect(result.valid).toBe(true)
    expect(result.message).toContain('验证通过')
  })

  it('篡改卡密验证失败', async () => {
    const key = makeKey(10000, 'user-test')
    // 翻转 payload 第 1 个字符的 base64 值
    const tampered = (key[0] === 'A' ? 'B' : 'A') + key.slice(1)
    const result = await verifyKey(tampered)
    expect(result.valid).toBe(false)
  })

  it('空输入返回格式无效', async () => {
    const result = await verifyKey('')
    expect(result.valid).toBe(false)
    expect(result.message).toContain('卡密格式无效')
  })

  it('过期卡密提示已过期', async () => {
    // 5 天：2025-01-06 已过期
    const key = makeKey(5, 'user-old')
    const result = await verifyKey(key)
    expect(result.valid).toBe(false)
    expect(result.message).toContain('过期')
  })

  it('非 base64 输入不崩溃', async () => {
    const result = await verifyKey('!!!not-a-valid-key!!!')
    // 不抛异常，返回 valid:false 即可
    expect(result.valid).toBe(false)
  })
})
