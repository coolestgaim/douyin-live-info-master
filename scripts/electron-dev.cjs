/**
 * electron-dev.cjs — Electron 开发模式启动器
 * 修复本机环境陷阱：
 *  1. ELECTRON_RUN_AS_NODE=1 劫持（electron 变纯 Node 模式，app 为 undefined）
 *  2. NODE_OPTIONS 注入 safe-delete 劫持（node 删除文件走回收站导致失败）
 * 启动时从子进程环境中剔除这两个变量，保证 electron 正常启动。
 */
const { spawn } = require('child_process')
const path = require('path')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS

const electronBin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron')

const args = ['.', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disk-cache-size=0']

const child = spawn(electronBin, args, { env, stdio: 'inherit', shell: true })

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

process.on('SIGINT', () => { child.kill('SIGINT') })
process.on('SIGTERM', () => { child.kill('SIGTERM') })
