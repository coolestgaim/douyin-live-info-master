/**
 * dev-restart.cjs — 一键"清理 + 重启"开发环境
 * 本项目 HMR 不可靠（Electron + webview + Naive 主题注入），改代码后必须走此流程：
 *   1. 杀掉残留 electron / douyin_guard / vite 进程，释放 5173-5176 端口
 *   2. 删除 dist（避免 electron 加载旧生产构建）
 *   3. 重新 npm run electron:dev（自动 tsc 编译主进程 → vite → electron）
 *
 * 用法：node scripts/dev-restart.cjs
 */
const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')

function sh(cmd) {
  try { return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }) } catch (e) { return '' }
}

console.log('== 1/4 清理残留进程 ==')
sh('powershell -NoProfile -Command "Get-Process -Name electron,douyin_guard -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"')
// 释放 vite 端口（5173-5176）
for (const port of [5173, 5174, 5175, 5176]) {
  sh(`powershell -NoProfile -Command "$c=Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; if($c){Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue}"`)
}
console.log('   进程/端口已清理')

console.log('== 2/4 删除 dist（保留 dist-electron） ==')
function rmrf(d) {
  if (!fs.existsSync(d)) return
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    try { e.isDirectory() ? rmrf(p) : fs.unlinkSync(p) } catch {}
  }
  try { fs.rmdirSync(d) } catch {}
}
rmrf(path.join(ROOT, 'dist'))
console.log('   dist 已删除')

console.log('== 3/4 清理旧日志 ==')
for (const f of fs.readdirSync(ROOT).filter(f => /\.log$/.test(f))) {
  try { fs.unlinkSync(path.join(ROOT, f)) } catch {}
}
console.log('   日志已清理')

console.log('== 4/4 启动 electron:dev ==')
const child = spawn('npm', ['run', 'electron:dev'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true, // Windows 下 npm 是 .cmd，需要 shell
  env: { ...process.env, NODE_OPTIONS: '' }
})
child.on('error', (e) => console.error('启动失败:', e.message))
child.on('exit', (code) => process.exit(code ?? 0))
