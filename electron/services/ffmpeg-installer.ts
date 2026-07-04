import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as https from 'https'
import { spawnSync } from 'child_process'
import { extract, findEntry } from './zip-extract'
import * as logger from './logger'

const LOG_MODULE = 'FfmpegInstaller'
const FFMPEG_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'

let ffmpegDir: string

function getFfmpegDir(): string {
  if (!ffmpegDir) ffmpegDir = path.join(app.getPath('userData'), 'ffmpeg')
  if (!fs.existsSync(ffmpegDir)) fs.mkdirSync(ffmpegDir, { recursive: true })
  return ffmpegDir
}

export function getFfmpegUserPath(): string {
  return path.join(getFfmpegDir(), 'ffmpeg.exe')
}

export function isFfmpegAvailable(): boolean {
  const paths = [
    getFfmpegUserPath(),
    path.join(__dirname, 'ffmpeg.exe'),
    path.join(process.cwd(), 'ffmpeg.exe'),
    'ffmpeg'
  ]
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

  onProgress(0, '正在下载 ffmpeg...')

  await downloadFile(FFMPEG_URL, zipPath, (pct, downloaded, total) => {
    onProgress(Math.floor(pct * 0.9), `下载中 ${formatSize(downloaded)}/${formatSize(total)}`)
  })

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
    const file = fs.createWriteStream(dest)
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
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
