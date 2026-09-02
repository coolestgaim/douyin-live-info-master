// 直播画面预览（B 方案）：
// 拉流地址 = 同一份 webcast flv_pull_url；不与录制复用 ffmpeg 进程（单 ffmpeg 无法分叉输出），
// 每房独立 ffmpeg -c copy -f hls 写到 userData/previews/<roomId>/，主进程内起 node http server
// 把 m3u8+ts 暴露到 127.0.0.1:port，由独立 BrowserWindow 用 hls.js 播放。
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { app } from 'electron'
import * as logger from './logger'

const LOG_MODULE = 'LivePreview'

interface PreviewInstance {
  roomId: string
  pullUrl: string
  process: ChildProcess | null
  manualStop: boolean
  retryTimer: ReturnType<typeof setTimeout> | null
  startTime: number
  reloadCount: number
}

export class LivePreviewManager {
  private map = new Map<string, PreviewInstance>()
  private server: http.Server | null = null
  private port = 0
  private readonly ffmpegExe: string
  private readonly outputDir: string

  constructor() {
    this.outputDir = path.join(app.getPath('userData'), 'previews')
    this.ffmpegExe = resolveFfmpegPath()
  }

  /** 起本地 HTTP server（端口由 OS 分配），路由 /preview/<roomId>/<file> → 文件 */
  ensureServer(): Promise<number> {
    if (this.server && this.port) return Promise.resolve(this.port)
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => this.handle(req, res))
      srv.on('error', reject)
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address()
        if (typeof addr === 'object' && addr) {
          this.server = srv
          this.port = addr.port
          logger.info(LOG_MODULE, `preview server listening on http://127.0.0.1:${this.port}`)
          resolve(this.port)
        } else reject(new Error('listen failed'))
      })
    })
  }

  getBaseUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }
  getM3u8Url(roomId: string): string {
    return `${this.getBaseUrl()}/preview/${roomId}/index.m3u8`
  }
  getList(): string[] {
    return Array.from(this.map.keys())
  }
  has(roomId: string): boolean { return this.map.has(roomId) }

  /** 启动预览：每房独立 ffmpeg -c copy -f hls 写到独立目录，断流自动重试 3 次（同 URL） */
  start(roomId: string, pullUrl: string): { ok: boolean; error?: string } {
    if (this.map.has(roomId)) return { ok: true }
    if (!this.server || !this.port) return { ok: false, error: 'preview server not started' }
    const outDir = path.join(this.outputDir, roomId)
    fs.mkdirSync(outDir, { recursive: true })
    const inst: PreviewInstance = {
      roomId, pullUrl, process: null, manualStop: false, retryTimer: null,
      startTime: Date.now(), reloadCount: 0
    }
    this.map.set(roomId, inst)
    this.spawn(inst)
    return { ok: true }
  }

  private spawn(inst: PreviewInstance) {
    if (inst.manualStop) return
    const outDir = path.join(this.outputDir, inst.roomId)
    // A 修复：去掉 delete_segments 滚删后旧 .ts 不再被物理删除（消除"播放器慢半拍 → 请求已删切片 → 404 → 断流"竞速），
    // 改用 temp_file：切片先写临时名再改名，播放器绝不会读到写了一半的文件。
    // 代价：预览期间文件会持续累积（开多久存多久）—— 每次(重)启动前先清空该房残留，stop() 也会在停止后清理目录。
    try { fs.rmSync(outDir, { recursive: true, force: true }) } catch {}
    fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, 'index.m3u8')
    const segPattern = path.join(outDir, 'seg_%05d.ts')
    const args = [
      '-hide_banner', '-loglevel', 'warning',
      '-i', inst.pullUrl,
      '-c', 'copy',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '6',
      '-hls_flags', 'append_list+independent_segments+temp_file',
      '-hls_segment_filename', segPattern,
      outPath
    ]
    try {
      inst.process = spawn(this.ffmpegExe, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      inst.process.stderr?.on('data', (c) => {
        const s = c.toString()
        if (s.includes('error') || s.includes('Error') || s.includes('HTTP error')) {
          logger.warn(LOG_MODULE, `ffmpeg: ${s.slice(0, 240)}`)
        }
      })
      inst.process.on('exit', (code) => {
        if (inst.manualStop) return
        // 检查是否真的产出了数据（<1KB 视为拉流失败/URL 过期）
        let produced = false
        try { if (fs.existsSync(outPath)) produced = fs.statSync(outPath).size > 1024 } catch {}
        if (!produced) {
          inst.reloadCount++
          if (inst.reloadCount <= 3) {
            logger.warn(LOG_MODULE, `ffmpeg 异常退出 code=${code} → 1.5s 后重试 ${inst.reloadCount}/3`)
            inst.retryTimer = setTimeout(() => this.spawn(inst), 1500)
          } else {
            logger.error(LOG_MODULE, `ffmpeg 多次重试仍失败 roomId=${inst.roomId}`)
          }
        }
      })
      inst.process.on('error', (err) => {
        logger.error(LOG_MODULE, `ffmpeg spawn err: ${err.message}`)
      })
    } catch (ex: any) {
      logger.error(LOG_MODULE, `spawn err: ${ex.message}`)
    }
  }

  stop(roomId: string): boolean {
    const inst = this.map.get(roomId)
    if (!inst) return false
    inst.manualStop = true
    if (inst.retryTimer) { clearTimeout(inst.retryTimer); inst.retryTimer = null }
    if (inst.process && !inst.process.killed) {
      try { inst.process.stdin?.write('q'); inst.process.stdin?.end() } catch {}
      setTimeout(() => { if (inst.process && !inst.process.killed) inst.process.kill() }, 3000)
    }
    this.map.delete(roomId)
    setTimeout(() => {
      try { fs.rmSync(path.join(this.outputDir, roomId), { recursive: true, force: true }) } catch {}
    }, 500)
    return true
  }

  stopAll() {
    for (const r of Array.from(this.map.keys())) this.stop(r)
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = (req.url || '/').split('?')[0]
    if (url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
      return res.end('ok')
    }
    const m = url.match(/^\/preview\/([^/]+)\/(index\.m3u8|seg_[\d]+\.ts)$/)
    if (!m) { res.writeHead(404); return res.end('404') }
    const filePath = path.join(this.outputDir, m[1], m[2])
    if (!filePath.startsWith(this.outputDir)) { res.writeHead(403); return res.end('403') }
    if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('404') }
    const ext = path.extname(filePath).toLowerCase()
    const mime = ext === '.m3u8' ? 'application/vnd.apple.mpegurl' : ext === '.ts' ? 'video/mp2t' : 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': mime + '; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    })
    fs.createReadStream(filePath).pipe(res)
  }
}

function resolveFfmpegPath(): string {
  // 与 stream-recorder.ts 同款解析顺序（复制自那里，没 export）
  try {
    const { getCustomFfmpegPath, getFfmpegUserPath } = require('./ffmpeg-installer') as any
    const custom = getCustomFfmpegPath()
    if (custom && fs.existsSync(custom)) return custom
    const user = getFfmpegUserPath()
    if (fs.existsSync(user)) return user
  } catch {}
  const localMain = path.join(__dirname, 'ffmpeg.exe')
  if (fs.existsSync(localMain)) return localMain
  const localRoot = path.join(process.cwd(), 'ffmpeg.exe')
  if (fs.existsSync(localRoot)) return localRoot
  const resourcesPath = (process as any).resourcesPath || ''
  if (resourcesPath) {
    const rp = path.join(resourcesPath, 'ffmpeg.exe')
    if (fs.existsSync(rp)) return rp
  }
  try {
    const { app } = require('electron') as typeof import('electron')
    const exeSide = path.join(path.dirname(app.getPath('exe')), 'ffmpeg.exe')
    if (fs.existsSync(exeSide)) return exeSide
  } catch {}
  return 'ffmpeg'
}

export const livePreview = new LivePreviewManager()
