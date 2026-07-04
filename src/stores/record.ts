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
    danmuStatus.value = `正在获取 ${room.nickname} 的直播流...`
    const state = await api().recordStartOne({
      enterRoomId: room.enterRoomId,
      nickname: room.nickname
    })
    applyState(state)
    danmuStatus.value = state?.count ? `${room.nickname} 开始录制` : '录制失败'
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
    isDurationVisible.value = false
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
      isDurationVisible.value = false
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
    }
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

  return {
    recordingItems, recordingCount, danmuStatus, isDurationVisible,
    setupListeners, removeListeners, recordAll, stopAll, startRecording, stopOne
  }
})
