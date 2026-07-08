import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RecordingItem } from '../types'
import { useRoomListStore } from './room-list'
import { useDanmuStore } from './danmu'
import { useDashboardStore } from './dashboard'

const api = () => (window as any).electronAPI

interface HistoryItem {
  roomId: string
  nickname: string
  outputPath: string
  durationText: string
  sizeText: string
  timestamp: number
}

const HISTORY_KEY = 'recording_history_v1'

function loadHistory(): HistoryItem[] {
  try { const raw = localStorage.getItem(HISTORY_KEY); return raw ? JSON.parse(raw) : [] } catch { return [] }
}

function saveHistory(items: HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 50)))
}

export const useRecordStore = defineStore('record', () => {
  const recordingItems = ref<RecordingItem[]>([])
  const recordingCount = ref(0)
  const danmuStatus = ref('')
  const isDurationVisible = ref(false)
  const ffmpegMissing = ref(false)
  const ffmpegProgress = ref(0)
  const ffmpegProgressMsg = ref('')
  const ffmpegInstalling = ref(false)
  const recordingHistory = ref<HistoryItem[]>(loadHistory())

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
    // 如果该房间有已停止的旧记录，先保存到历史
    const oldItem = recordingItems.value.find(i => i.roomId === room.enterRoomId && !i.isActive)
    if (oldItem?.outputPath) addToHistory(oldItem)
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
    for (const item of recordingItems.value) {
      if (item.isActive && item.outputPath) addToHistory(item)
    }
    const state = await api().recordStopAll()
    if (state) {
      for (const item of (state.items || [])) {
        if (!item.isActive && item.outputPath) addToHistory(item)
      }
      recordingItems.value = state.items || []
    }
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
      const completed = state.items?.find((i: any) => i.roomId === roomId)
      if (completed?.outputPath) addToHistory(completed)
      recordingItems.value = state.items || []
      recordingCount.value = state.count || 0
    }
    if (recordingCount.value === 0) {
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
    }
    isDurationVisible.value = recordingItems.value.length > 0
  }

  // ===== History =====
  function addToHistory(item: { roomId: string; nickname: string; outputPath: string; durationText?: string; sizeText?: string }) {
    if (!item.outputPath) return
    recordingHistory.value.unshift({
      roomId: item.roomId, nickname: item.nickname, outputPath: item.outputPath,
      durationText: item.durationText || '', sizeText: item.sizeText || '', timestamp: Date.now()
    })
    saveHistory(recordingHistory.value)
  }

  function removeFromHistory(roomId: string) {
    recordingHistory.value = recordingHistory.value.filter(h => h.roomId !== roomId)
    saveHistory(recordingHistory.value)
  }

  async function deleteRecording(item: { roomId: string; outputPath: string }) {
    if (item.outputPath) await api().fileDelete(item.outputPath)
    recordingItems.value = recordingItems.value.filter(i => i.roomId !== item.roomId)
    if (recordingItems.value.length === 0) isDurationVisible.value = false
    removeFromHistory(item.roomId)
  }

  async function deleteHistoryItem(roomId: string) {
    const h = recordingHistory.value.find(x => x.roomId === roomId)
    if (h?.outputPath) await api().fileDelete(h.outputPath)
    removeFromHistory(roomId)
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
        true,
        item.durationText || '',
        item.sizeText || ''
      )
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
    recordingHistory,
    setupListeners, removeListeners, recordAll, stopAll, startRecording, stopOne,
    installFfmpeg, deleteRecording, deleteHistoryItem
  }
})
