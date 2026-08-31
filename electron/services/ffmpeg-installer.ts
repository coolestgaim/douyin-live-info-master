import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as https from 'https'
import * as http from 'http'
import { spawnSync } from 'child_process'
import { extract, findEntry } from './zip-extract'
import * as logger from './logger'

const LOG_MODULE = 'FfmpegInstaller'

// Multiple download sources — tried in order until one succeeds
const FFMPEG_URLS = [
  'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
  'https://ghproxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
  'https://mirror.ghproxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
]

let ffmpegDir: string

function getFfmpegDir(): string {
  if (!ffmpegDir) ffmpegDir = path.join(app.getPath('userData'), 'ffmpeg')
  if (!fs.existsSync(ffmpegDir)) fs.mkdirSync(ffmpegDir, { recursive: true })
  return ffmpegDir
}

export function getFfmpegUserPath(): string {
  return path.join(getFfmpegDir(), 'ffmpeg.exe')
}

// ===== 用户手动指定的 ffmpeg 路径（"指定 ffmpeg" 绑定）=====
const CUSTOM_PATH_FILE = 'ffmpeg-custom-path.json'
let customFfmpegPath = ''
try {
  const raw = fs.readFileSync(path.join(app.getPath('userData'), CUSTOM_PATH_FILE), 'utf-8')
  const parsed = JSON.parse(raw)
  if (typeof parsed?.path === 'string') customFfmpegPath = parsed.path
} catch { /* 无历史绑定 */ }

/** 读取用户手动绑定的 ffmpeg 路径（空 = 未绑定） */
export function getCustomFfmpegPath(): string {
  return customFfmpegPath
}

/** 绑定用户手动指定的 ffmpeg 路径（校验存在且可运行）；返回是否成功 */
export function setCustomFfmpegPath(p: string): { success: boolean; error?: string } {
  if (!p) return { success: false, error: '路径为空' }
  if (!fs.existsSync(p)) return { success: false, error: '文件不存在' }
  try {
    const r = spawnSync(p, ['-version'], { windowsHide: true, timeout: 10000 })
    if (r.status !== 0) return { success: false, error: '不是可用的 ffmpeg（-version 执行失败）' }
  } catch (e: any) {
    return { success: false, error: `校验失败: ${e.message}` }
  }
  customFfmpegPath = p
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), CUSTOM_PATH_FILE), JSON.stringify({ path: p }), 'utf-8')
  } catch { /* 持久化失败不阻断本次绑定 */ }
  return { success: true }
}

/** 清除手动绑定（回落到自动查找） */
export function clearCustomFfmpegPath(): void {
  customFfmpegPath = ''
  try { fs.unlinkSync(path.join(app.getPath('userData'), CUSTOM_PATH_FILE)) } catch { /* ignore */ }
}

export function isFfmpegAvailable(): boolean {
  const paths = [
    // 用户手动绑定的路径优先级最高
    ...(customFfmpegPath ? [customFfmpegPath] : []),
    getFfmpegUserPath(),
    path.join(__dirname, 'ffmpeg.exe'),
    path.join(process.cwd(), 'ffmpeg.exe'),
    path.join(process.resourcesPath || '', 'ffmpeg.exe'),
  ]
  // 应用 exe 同级目录（用户手动放置）
  try { paths.push(path.join(path.dirname(app.getPath('exe')), 'ffmpeg.exe')) } catch {}
  paths.push('ffmpeg')
  for (const p of paths) {
    try {
      if (p === 'ffmpeg') {
        const r = spawnSync('ffmpeg', ['-version'], { windowsHide: true, timeout: 5000 })
        if (r.status === 0) return true
      } else if (fs.existsSync(p)) {
        const r = spawnSync(p, ['-version'], { windowsHide: true, timeout: 5000 })
        if (r.status === 0) return true
      }
    } catch { /* try next */ }
  }
  return false
}

export async function downloadAndInstall(onProgress: (pct: number, msg: string) => void): Promise<boolean> {
  const destDir = getFfmpegDir()
  const zipPath = path.join(destDir, 'ffmpeg-temp.zip')
  const exePath = getFfmpegUserPath()

  // Already installed
  if (fs.existsSync(exePath)) {
    const r = spawnSync(exePath, ['-version'], { windowsHide: true, timeout: 5000 })
    if (r.status === 0) return true
  }

  // Try each URL until one succeeds
  let lastErr = ''
  for (let i = 0; i < FFMPEG_URLS.length; i++) {
    onProgress(0, `正在下载 ffmpeg... (源 ${i + 1}/${FFMPEG_URLS.length})`)
    try {
      await downloadFile(FFMPEG_URLS[i], zipPath, (pct, downloaded, total) => {
        onProgress(Math.floor(pct * 0.9), `下载中 ${formatSize(downloaded)}/${formatSize(total)}`)
      })
      lastErr = ''
      break
    } catch (err: any) {
      logger.warn(LOG_MODULE, `源 ${i + 1} 下载失败: ${err.message}`)
      lastErr = err.message
      try { fs.unlinkSync(zipPath) } catch {}
      if (i < FFMPEG_URLS.length - 1) {
        onProgress(0, `切换备用源 ${i + 2}...`)
      }
    }
  }
  if (lastErr) {
    throw new Error(`所有下载源均失败: ${lastErr}`)
  }

  onProgress(90, '正在解压...')

  // Find ffmpeg.exe inside zip
  const entry = findInZip(zipPath, 'bin/ffmpeg.exe')
  if (!entry) {
    logger.error(LOG_MODULE, 'zip 中未找到 ffmpeg.exe')
    try { fs.unlinkSync(zipPath) } catch {}
    return false
  }

  extract(zipPath, entry, exePath)

  // Cleanup
  try { fs.unlinkSync(zipPath) } catch {}

  const r = spawnSync(exePath, ['-version'], { windowsHide: true, timeout: 5000 })
  if (r.status === 0) {
    onProgress(100, '安装完成')
    logger.info(LOG_MODULE, `ffmpeg 安装成功 path=${exePath}`)
    return true
  }

  logger.error(LOG_MODULE, `ffmpeg 验证失败 path=${exePath}`)
  try { fs.unlinkSync(exePath) } catch {}
  return false
}

function downloadFile(url: string, dest: string, onProgress: (pct: number, downloaded: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(dest)
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        downloadFile(res.headers.location!, dest, onProgress).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }

      const total = parseInt(res.headers['content-length'] || '0', 10)
      let downloaded = 0

      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        file.write(chunk)
        if (total > 0) onProgress(downloaded / total, downloaded, total)
      })

      res.on('end', () => { file.end(); resolve() })
      res.on('error', (err) => { file.close(); try { fs.unlinkSync(dest) } catch {}; reject(err) })
    }).on('error', (err) => { file.close(); try { fs.unlinkSync(dest) } catch {}; reject(err) })
  })
}

function findInZip(zipPath: string, targetEntry: string): string | null {
  // Read zip central directory to find the entry offset
  // This is a simple zip reader that finds the local file header
  try {
    const buf = fs.readFileSync(zipPath)
    return findEntry(buf, targetEntry)
  } catch (e) {
    logger.error(LOG_MODULE, '查找zip条目失败', e)
    return null
  }
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  if (bytes > 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}
