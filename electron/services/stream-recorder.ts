import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { loadConfig, getEffectiveOutputPath } from './record-config'
import * as logger from './logger'

const LOG_MODULE = 'StreamRecorder'

export class StreamRecorder {
  private process: ChildProcess | null = null
  private startTime: Date | null = null
  private durationTimer: ReturnType<typeof setInterval> | null = null
  private manualStop = false

  public outputPath = ''
  public currentFileSize = 0
  public isRecording = false
  /** 外部指定输出子文件夹（如录制管理用：{nickname}_{startTime}/） */
  private outputDirOverride: string | null = null

  public onStatusChanged: ((status: string) => void) | null = null
  /** 拉流失败/URL 过期时的回调（由 RecordingManager 负责自动重拉重录） */
  public onRecordingFailed: (() => void) | null = null

  setOutputSession(opts: { outputDir: string; sessionId?: string }): void {
    this.outputDirOverride = opts.outputDir
    if (opts.sessionId) this.sessionIdOverride = opts.sessionId
  }
  private sessionIdOverride: string | null = null

  startRecording(pullUrl: string, nickname: string, format = 'mp3', segmentMin = 0, quality = ''): void {
    this.manualStop = false
    const config = loadConfig()
    const dir = this.outputDirOverride ?? getEffectiveOutputPath(config)
    fs.mkdirSync(dir, { recursive: true })

    const ext = format
    const safeName = nickname.replace(/[<>:"/\\|?*]/g, '_')
    const qLabel = quality || config.recordQuality || 'OD'
    const ts = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14)

    const useSegments = segmentMin > 0 && (format === 'mp4' || format === 'flv')
    const segSec = segmentMin * 60
    // 若外部传了 sessionId（如 {nickname}_{startTime}），用它作基底，保持 mp4/CSV 同子文件夹、命名空间统一；否则退回到旧格式
    const baseName = this.sessionIdOverride ?? `${safeName}_${qLabel}_${ts}`

    if (useSegments) {
      this.outputPath = path.join(dir, `${baseName}_%03d.${ext}`)
    } else {
      this.outputPath = path.join(dir, `${baseName}.${ext}`)
    }

    const ffmpegArgs = this.buildFfmpegArgs(pullUrl, format, this.outputPath, useSegments, segSec)

    const ffmpegExe = resolveFfmpegPath()

    try {
      this.process = spawn(ffmpegExe, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (ex: any) {
      logger.error(LOG_MODULE, `启动ffmpeg失败: ${ex.message}`)
      this.onStatusChanged?.(`启动ffmpeg失败: ${ex.message}`)
      return
    }

    this.process.stderr?.on('data', (chunk: Buffer) => {
      logger.info(LOG_MODULE, `ffmpeg: ${chunk.toString().substring(0, 200)}`)
    })

    this.startTime = new Date()
    this.isRecording = true

    this.durationTimer = setInterval(() => {
      if (this.isRecording) {
        this.updateFileSize()
      }
    }, 1000)

    this.process.on('exit', (code) => {
      this.isRecording = false
      logger.info(LOG_MODULE, `ffmpeg退出 code=${code} path=${this.outputPath}`)
      if (this.durationTimer) clearInterval(this.durationTimer)
      this.durationTimer = null
      // 用户主动停止：不报错，正常提示
      if (this.manualStop) {
        this.onStatusChanged?.('录制已停止')
        return
      }
      // 方案A：检查是否真的产出了数据（<1KB 视为拉流失败/URL过期）
      let produced = false
      try {
        if (this.outputPath.includes('%')) {
          // segment 模式：扫描目录下是否有非空 segment 文件（匹配 _000.mp4 等）
          const dir = path.dirname(this.outputPath)
          const extMatch = path.basename(this.outputPath).match(/\.(\w+)$/)
          const ext = extMatch ? extMatch[1] : 'mp4'
          const prefix = path.basename(this.outputPath).replace(/_%\d+d\.\w+$/, '')
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix + '_') && f.endsWith('.' + ext))
            produced = files.some(f => fs.statSync(path.join(dir, f)).size > 1024)
          }
        } else if (fs.existsSync(this.outputPath)) {
          produced = fs.statSync(this.outputPath).size > 1024
        }
      } catch { /* ignore */ }
      if (!produced) {
        this.onStatusChanged?.(`录制失败：拉流URL可能已过期（${code !== 0 ? `code=${code}` : '无数据'}），正在自动重连...`)
        // 通知 manager 重新拉取 URL 并重启录制
        this.onRecordingFailed?.()
      } else {
        this.onStatusChanged?.(code !== 0 ? `录制异常退出 (code=${code})` : '录制已停止')
      }
    })

    this.process.on('error', (err) => {
      this.isRecording = false
      logger.error(LOG_MODULE, 'ffmpeg进程错误', err)
      this.onStatusChanged?.(`启动ffmpeg失败: ${err.message}`)
    })

    this.onStatusChanged?.('正在录制...')
  }

  private buildFfmpegArgs(url: string, format: string, outPath: string, useSegments: boolean, segSec: number): string[] {
    if (useSegments) {
      // Segment recording
      const segArgs = [
        '-y', '-i', url,
        '-c', 'copy',
        '-map', '0',
        '-f', 'segment',
        '-segment_time', String(segSec),
        '-segment_format', format === 'mp4' ? 'mp4' : 'flv',
        '-reset_timestamps', '1'
      ]
      if (format === 'mp4') {
        segArgs.push('-movflags', '+frag_keyframe+empty_moov+faststart')
      }
      segArgs.push(outPath)
      return segArgs
    }

    // Single file recording
    return format === 'mp4'
      ? ['-y', '-i', url, '-c', 'copy', outPath]
      : format === 'flv'
        ? ['-y', '-i', url, '-c', 'copy', outPath]
        : format === 'wav'
          ? ['-y', '-i', url, '-vn', '-acodec', 'pcm_s16le', outPath]
          : ['-y', '-i', url, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', outPath]
  }

  stopRecording(): void {
    this.manualStop = true
    if (this.durationTimer) clearInterval(this.durationTimer)
    this.durationTimer = null

    if (this.process && !this.process.killed) {
      try {
        this.process.stdin?.write('q')
        this.process.stdin?.end()
        setTimeout(() => {
          if (this.process && !this.process.killed) this.process.kill()
        }, 5000)
      } catch { /* ignore */ }
    }
    this.process = null
    this.isRecording = false
  }

  getDurationText(): string {
    if (!this.startTime) return '00:00:00'
    const d = Date.now() - this.startTime.getTime()
    const totalSeconds = Math.floor(d / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  private updateFileSize(): void {
    try {
      if (this.outputPath.includes('%')) {
        // 分段模式：统计目录下所有 segment 文件大小
        // pattern: baseName_%03d.mp4 → 实际文件 baseName_000.mp4 / _001.mp4
        const dir = path.dirname(this.outputPath)
        const extMatch = path.basename(this.outputPath).match(/\.(\w+)$/)
        const ext = extMatch ? extMatch[1] : 'mp4'
        const prefix = path.basename(this.outputPath).replace(/_%\d+d\.\w+$/, '')
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix + '_') && f.endsWith('.' + ext))
          this.currentFileSize = files.reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0)
        }
      } else if (fs.existsSync(this.outputPath)) {
        this.currentFileSize = fs.statSync(this.outputPath).size
      }
    } catch { /* ignore */ }
  }
}

function resolveFfmpegPath(): string {
  // 0. 用户手动绑定的路径（"指定 ffmpeg"，优先级最高）
  const { getCustomFfmpegPath, getFfmpegUserPath } = require('./ffmpeg-installer')
  const customPath = getCustomFfmpegPath()
  if (customPath && fs.existsSync(customPath)) return customPath

  // 1. User-installed (via ffmpeg-installer)
  const userPath = getFfmpegUserPath()
  if (fs.existsSync(userPath)) return userPath

  // 1. Next to the compiled main.js (dist-electron)
  const localMain = path.join(__dirname, 'ffmpeg.exe')
  if (fs.existsSync(localMain)) return localMain

  // 2. Project root (where package.json lives)
  const localRoot = path.join(process.cwd(), 'ffmpeg.exe')
  if (fs.existsSync(localRoot)) return localRoot

  // 3. ExtraResources (electron-builder packaging)
  const resourcesPath = (process as any).resourcesPath || ''
  if (resourcesPath) {
    const resPath = path.join(resourcesPath, 'ffmpeg.exe')
    if (fs.existsSync(resPath)) return resPath
  }

  // 4. Next to the app executable (user manually places ffmpeg.exe beside the installed exe)
  try {
    const { app } = require('electron')
    const exeDir = path.dirname(app.getPath('exe'))
    const exeSide = path.join(exeDir, 'ffmpeg.exe')
    if (fs.existsSync(exeSide)) return exeSide
  } catch { /* ignore */ }

  // 5. Fallback to PATH
  return 'ffmpeg'
}
