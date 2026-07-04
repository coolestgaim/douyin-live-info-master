import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RecordingItem } from '../types'
import { useRoomListStore } from './room-list'
import { useDanmuStore } from './danmu'
import { useDashboardStore } from './dashboard'

const api = () => (window as any).electronAPI

export const useRecordStore = defineStore('record', () => {
  const recordingItems = ref<RecordingItem[]>([])
  const recordingCount = ref(0)
  const danmuStatus = ref('')
  const isDurationVisible = ref(false)
  const ffmpegMissing = ref(false)
  const ffmpegProgress = ref(0)
  const ffmpegProgressMsg = ref('')
  const ffmpegInstalling = ref(false)

  // Tingwu state per room
  const tingwuState = ref<Record<string, {
    status: 'idle' | 'uploading' | 'processing' | 'polling' | 'completed' | 'error'
    taskId: string
    message: string
    result: any
    filePath: string
  }>>({})

  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let listenersSetup = false

  function setupListeners() {
    if (listenersSetup) return
    listenersSetup = true

    api().onRecordUpdate((data: { items: RecordingItem[]; count: number }) => {
      recordingItems.value = data.items
      recordingCount.value = data.count
      isDurationVisible.value = data.items.length > 0
      syncToDashboard()
    })
  }

  function removeListeners() {
    api().removeRecordListeners()
    listenersSetup = false
  }

  async function recordAll() {
    if (recordingCount.value > 0) {
      await stopAll()
      return
    }

    const roomList = useRoomListStore()
    const rooms = roomList.results.map(r => ({
      url: r.url,
      enterRoomId: r.enterRoomId,
      nickname: r.nickname,
      title: r.title,
      roomStatus: r.roomStatus,
      likeCount: r.likeCount,
      viewCount: r.viewCount,
      error: r.error
    }))

    danmuStatus.value = '正在获取直播流...'
    const state = await api().recordStartAll(rooms)

    applyState(state)
  }

  async function startRecording(room: any) {
    if (!await checkFfmpeg()) return
    danmuStatus.value = `正在获取 ${room.nickname} 的直播流...`
    const state = await api().recordStartOne({
      enterRoomId: room.enterRoomId,
      nickname: room.nickname
    })
    applyState(state)
    danmuStatus.value = state?.count ? `${room.nickname} 开始录制` : '录制失败'
  }

  async function checkFfmpeg(): Promise<boolean> {
    const result = await api().ffmpegCheck()
    if (result.available) return true
    ffmpegMissing.value = true
    return false
  }

  function applyState(state: any) {
    if (state) {
      recordingItems.value = state.items || []
      recordingCount.value = state.count || 0
      isDurationVisible.value = (state.items?.length || 0) > 0
    }
    if (recordingCount.value > 0) startRefresh()
  }

  async function stopAll() {
    const state = await api().recordStopAll()
    if (state) recordingItems.value = state.items || []
    recordingCount.value = 0
    isDurationVisible.value = recordingItems.value.length > 0
    danmuStatus.value = '已停止所有录制'
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
    const dashboard = useDashboardStore()
    for (const item of recordingItems.value) {
      dashboard.updateRecordingState(item.roomId, false, '', '')
    }
  }

  async function stopOne(roomId: string) {
    const state = await api().recordStopOne(roomId)
    if (state) {
      recordingItems.value = state.items || []
      recordingCount.value = state.count || 0
    }
    if (recordingCount.value === 0) {
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
    }
    isDurationVisible.value = recordingItems.value.length > 0
  }

  function startRefresh() {
    if (refreshTimer) clearInterval(refreshTimer)
    refreshTimer = setInterval(async () => {
      try {
        const state = await api().recordGetState()
        if (state) {
          recordingItems.value = state.items || []
          recordingCount.value = state.count || 0
          syncToDashboard()
        }
      } catch { /* ignore */ }
    }, 1000)
  }

  function syncToDashboard() {
    const dashboard = useDashboardStore()
    for (const item of recordingItems.value) {
      dashboard.updateRecordingState(
        item.roomId,
        item.isActive,
        item.durationText || '',
        item.sizeText || ''
      )
    }
  }

  // ===== Tingwu =====
  function getTingwuRoom(roomId: string) {
    if (!tingwuState.value[roomId]) {
      tingwuState.value[roomId] = {
        status: 'idle',
        taskId: '',
        message: '',
        result: null,
        filePath: ''
      }
    }
    return tingwuState.value[roomId]
  }

  async function startTranscribe(filePath: string, roomId: string, nickname: string) {
    const state = getTingwuRoom(roomId)
    state.status = 'uploading'
    state.message = '正在上传到 OSS...'
    state.filePath = filePath

    try {
      const res = await api().tingwuTranscribe(filePath)
      if (!res.success) {
        state.status = 'error'
        state.message = res.error || '上传失败'
        return
      }

      state.taskId = res.taskId
      state.status = 'polling'
      state.message = 'AI 正在转写中...'

      // Poll every 5 seconds
      const poll = setInterval(async () => {
        if (state.status !== 'polling') {
          clearInterval(poll)
          return
        }
        try {
          const r = await api().tingwuPoll(state.taskId)
          if (r.taskStatus === 'COMPLETED') {
            clearInterval(poll)
            state.status = 'completed'
            state.message = `${nickname} 转写完成`
            state.result = r.result
          } else if (r.taskStatus === 'FAILED') {
            clearInterval(poll)
            state.status = 'error'
            state.message = '转写任务失败'
          }
        } catch {
          // retry next interval
        }
      }, 5000)
    } catch (ex: any) {
      state.status = 'error'
      state.message = ex.message || '未知错误'
    }
  }

  async function installFfmpeg() {
    ffmpegInstalling.value = true
    ffmpegMissing.value = false
    ffmpegProgress.value = 0

    api().onFfmpegProgress(({ pct, msg }: { pct: number; msg: string }) => {
      ffmpegProgress.value = pct
      ffmpegProgressMsg.value = msg
    })

    try {
      const result = await api().ffmpegInstall()
      if (result.success) {
        danmuStatus.value = 'ffmpeg 安装成功，可以开始录制'
      } else {
        danmuStatus.value = '安装失败: ' + (result.error || '未知错误')
      }
    } catch (ex: any) {
      danmuStatus.value = '安装异常: ' + (ex.message || '')
    } finally {
      ffmpegInstalling.value = false
    }
  }

  return {
    recordingItems, recordingCount, danmuStatus, isDurationVisible,
    ffmpegMissing, ffmpegProgress, ffmpegProgressMsg, ffmpegInstalling,
    tingwuState,
    setupListeners, removeListeners, recordAll, stopAll, startRecording, stopOne,
    installFfmpeg, startTranscribe
  }
})
