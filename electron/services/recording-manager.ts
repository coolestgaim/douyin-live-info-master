import { StreamRecorder } from './stream-recorder'
import { formatFileSize } from './format'
import * as logger from './logger'

const LOG_MODULE = 'RecordingManager'

interface RecordItem {
  nickname: string
  outputPath: string
  durationText: string
  sizeText: string
  isActive: boolean
  statusText: string
}

export class RecordingManager {
  private recorders = new Map<string, StreamRecorder>()
  private items = new Map<string, RecordItem>()

  public onUpdate: (() => void) | null = null

  has(roomId: string): boolean {
    return this.recorders.has(roomId)
  }

  startRecording(roomId: string, pullUrl: string, nickname: string, format: string): boolean {
    const recorder = new StreamRecorder()

    recorder.onStatusChanged = (status) => {
      if (status.includes('异常')) {
        logger.warn(LOG_MODULE, `录制异常退出 roomId=${roomId} nickname=${nickname}`)
        recorder.stopRecording()
        const item = this.items.get(roomId)
        if (item) {
          item.statusText = '异常退出'
          item.isActive = false
        }
        this.recorders.delete(roomId)
        this.onUpdate?.()
      }
    }

    recorder.startRecording(pullUrl, nickname, format)

    if (!recorder.isRecording) {
      logger.warn(LOG_MODULE, `录制启动失败 roomId=${roomId}`)
      return false
    }

    this.recorders.set(roomId, recorder)
    this.items.set(roomId, {
      nickname,
      outputPath: recorder.outputPath,
      durationText: '00:00:00',
      sizeText: '0 B',
      isActive: true,
      statusText: '录制中'
    })

    logger.info(LOG_MODULE, `开始录制 roomId=${roomId} nickname=${nickname} format=${format}`)
    return true
  }

  stopAll(): void {
    for (const [roomId, recorder] of this.recorders) {
      const item = this.items.get(roomId)
      if (item) {
        item.durationText = recorder.getDurationText()
        item.sizeText = formatFileSize(recorder.currentFileSize)
        item.statusText = '已停止'
        item.isActive = false
      }
      recorder.stopRecording()
    }
    logger.info(LOG_MODULE, `停止全部录制 count=${this.recorders.size}`)
    this.recorders.clear()
  }

  stopOne(roomId: string): void {
    const recorder = this.recorders.get(roomId)
    if (recorder) {
      const item = this.items.get(roomId)
      if (item) {
        item.durationText = recorder.getDurationText()
        item.sizeText = formatFileSize(recorder.currentFileSize)
        item.statusText = '已停止'
        item.isActive = false
      }
      recorder.stopRecording()
      this.recorders.delete(roomId)
      logger.info(LOG_MODULE, `停止录制 roomId=${roomId}`)
    }
  }

  getState(): { items: any[]; count: number } {
    const items: any[] = []
    for (const [roomId, recorder] of this.recorders) {
      const item = this.items.get(roomId)
      if (item && recorder.isRecording) {
        item.durationText = recorder.getDurationText()
        item.sizeText = formatFileSize(recorder.currentFileSize)
      }
    }
    for (const [roomId, item] of this.items) {
      items.push({ roomId, ...item })
    }
    return { items, count: this.recorders.size }
  }
}
