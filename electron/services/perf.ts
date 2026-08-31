// 性能模式（无独显/低配电脑优化）：high 高性能 / balanced 平衡 / compat 兼容（关 GPU + 浮窗降级）
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export type PerfMode = 'high' | 'balanced' | 'compat'

const FILE = 'perf-mode.json'
let mode: PerfMode = 'balanced'

try {
  const raw = fs.readFileSync(path.join(app.getPath('userData'), FILE), 'utf-8')
  const v = JSON.parse(raw)
  if (v?.mode === 'high' || v?.mode === 'compat') mode = v.mode
} catch { /* 默认 balanced */ }

export function getPerfMode(): PerfMode {
  return mode
}

export function setPerfMode(m: PerfMode): void {
  if (m !== 'high' && m !== 'balanced' && m !== 'compat') return
  mode = m
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), FILE), JSON.stringify({ mode: m }), 'utf-8')
  } catch { /* 持久化失败不阻断 */ }
}

export function isCompat(): boolean {
  return mode === 'compat'
}

export const PERF_LABELS: Record<PerfMode, string> = {
  high: '高性能',
  balanced: '平衡',
  compat: '兼容（无独显/低配）',
}
