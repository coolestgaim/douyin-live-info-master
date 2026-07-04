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

  public outputPath = ''
  public currentFileSize = 0
  public isRecording = false

  public onStatusChanged: ((status: string) => void) | null = null

  startRecording(pullUrl: string, nickname: string, format = 'mp3'): void {
    const config = loadConfig()
    const dir = getEffectiveOutputPath(config)
    fs.mkdirSync(dir, { recursive: true })

    const ext = format
    const safeName = nickname.replace(/[<>:"/\\|?*]/g, '_')
    const fileName = `${safeName}_${new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14)}.${ext}`
    this.outputPath = path.join(dir, fileName)

    const ffmpegArgs: string[] = format === 'mp4'
      ? ['-y', '-i', pullUrl, '-c', 'copy', this.outputPath]
      : format === 'flv'
        ? ['-y', '-i', pullUrl, '-c', 'copy', this.outputPath]
        : format === 'wav'
          ? ['-y', '-i', pullUrl, '-vn', '-acodec', 'pcm_s16le', this.outputPath]
          : ['-y', '-i', pullUrl, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', this.outputPath]

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
      this.onStatusChanged?.(code !== 0 ? `录制异常退出 (code=${code})` : '录制已停止')
    })

    this.process.on('error', (err) => {
      this.isRecording = false
      logger.error(LOG_MODULE, 'ffmpeg进程错误', err)
      this.onStatusChanged?.(`启动ffmpeg失败: ${err.message}`)
    })

    this.onStatusChanged?.('正在录制...')
  }

  stopRecording(): void {
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
      if (fs.existsSync(this.outputPath)) {
        this.currentFileSize = fs.statSync(this.outputPath).size
      }
    } catch { /* ignore */ }
  }
}

function resolveFfmpegPath(): string {
  // 1. Next to the compiled main.js (dist-electron)
  const localMain = path.join(__dirname, 'ffmpeg.exe')
  if (fs.existsSync(localMain)) return localMain

  // 2. Project root (where package.json lives)
  const localRoot = path.join(process.cwd(), 'ffmpeg.exe')
  if (fs.existsSync(localRoot)) return localRoot

  // 3. Fallback to PATH
  return 'ffmpeg'
}
