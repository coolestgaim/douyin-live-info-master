import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const api = () => (window as any).electronAPI

export interface RoomStatsData {
  roomId: string
  nickname: string
  danmuCount: number
  giftCount: number
  likeCount: number
  memberCount: number
  followCount: number
  isConnected: boolean
  isRecording: boolean
  recordDurationText: string
  recordSizeText: string
  roomLikeCount: number
  roomViewCount: number
  roomStatus: number
}

export const useDashboardStore = defineStore('dashboard', () => {
  const roomStats = ref<RoomStatsData[]>([])
  const isMonitoring = ref(false)
  const monitorTimeText = ref('未开始监控')
  const startTime = ref<Date | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null

  const totalDanmu = computed(() => roomStats.value.reduce((s, r) => s + r.danmuCount, 0))
  const totalGift = computed(() => roomStats.value.reduce((s, r) => s + r.giftCount, 0))
  const totalLike = computed(() => roomStats.value.reduce((s, r) => s + r.likeCount, 0))
  const totalMember = computed(() => roomStats.value.reduce((s, r) => s + r.memberCount, 0))
  const totalFollow = computed(() => roomStats.value.reduce((s, r) => s + r.followCount, 0))

  function updateRooms(rooms: any[]) {
    for (const room of rooms) {
      const existing = roomStats.value.find(s => s.roomId === room.enterRoomId)
      if (!existing) {
        roomStats.value.push({
          roomId: room.enterRoomId,
          nickname: room.nickname,
          danmuCount: 0, giftCount: 0, likeCount: 0, memberCount: 0, followCount: 0,
          isConnected: false, isRecording: false,
          recordDurationText: '', recordSizeText: '',
          roomLikeCount: room.likeCount || 0,
          roomViewCount: room.viewCount || 0,
          roomStatus: room.roomStatus || 0
        })
      } else {
        if (room.likeCount) existing.roomLikeCount = room.likeCount
        if (room.viewCount) existing.roomViewCount = room.viewCount
        if (room.roomStatus) existing.roomStatus = room.roomStatus
      }
    }
    // Remove deleted rooms
    roomStats.value = roomStats.value.filter(s => rooms.some(r => r.enterRoomId === s.roomId))
  }

  async function refreshApiStats(sourceRooms: any[]) {
    const rooms = sourceRooms.map(r => ({
      url: r.url || `https://live.douyin.com/${r.enterRoomId}`,
      enterRoomId: r.enterRoomId,
      error: ''
    }))
    if (rooms.length === 0) return
    try {
      const updated = await api().roomRefreshStats(rooms)
      for (const room of updated) {
        const stats = roomStats.value.find(s => s.roomId === room.enterRoomId)
        if (stats) {
          stats.roomLikeCount = room.likeCount || 0
          stats.roomViewCount = room.viewCount || 0
          stats.roomStatus = room.roomStatus ?? 0
        }
      }
    } catch { /* ignore */ }
  }

  function onMessage(roomId: string, msg: any) {
    let stats = roomStats.value.find(s => s.roomId === roomId)
    if (!stats) {
      stats = {
        roomId,
        nickname: msg.roomName || roomId,
        danmuCount: 0, giftCount: 0, likeCount: 0, memberCount: 0, followCount: 0,
        isConnected: true, isRecording: false,
        recordDurationText: '', recordSizeText: '',
        roomLikeCount: 0, roomViewCount: 0, roomStatus: 0
      }
      roomStats.value.push(stats)
    }

    switch (msg.type) {
      case 'Chat': stats.danmuCount++; break
      case 'Gift': stats.giftCount++; break
      case 'Like': stats.likeCount++; break
      case 'Member': stats.memberCount++; break
      case 'Social': stats.followCount++; break
    }
  }

  function startMonitoring() {
    startTime.value = new Date()
    isMonitoring.value = true
    timer = setInterval(updateTimer, 1000)
  }

  function stopMonitoring() {
    if (timer) clearInterval(timer)
    isMonitoring.value = false
    if (startTime.value) {
      const elapsed = Date.now() - startTime.value.getTime()
      monitorTimeText.value = `已停止 · 本次监控 ${formatTime(elapsed)}`
    }
    startTime.value = null
  }

  function updateTimer() {
    if (!startTime.value) return
    const elapsed = Date.now() - startTime.value.getTime()
    monitorTimeText.value = `监控中: ${formatTime(elapsed)}`
  }

  function updateConnectionState(roomId: string, isConnected: boolean) {
    const stats = roomStats.value.find(s => s.roomId === roomId)
    if (stats) stats.isConnected = isConnected
  }

  function updateRecordingState(roomId: string, isRecording: boolean, duration: string, size: string) {
    const stats = roomStats.value.find(s => s.roomId === roomId)
    if (!stats) return
    stats.isRecording = isRecording
    stats.recordDurationText = isRecording ? duration : ''
    stats.recordSizeText = isRecording ? size : ''
  }

  function updateRoomApiStats(roomId: string, likeCount: number, viewCount: number, roomStatus: number) {
    const stats = roomStats.value.find(s => s.roomId === roomId)
    if (!stats) return
    stats.roomLikeCount = likeCount
    stats.roomViewCount = viewCount
    stats.roomStatus = roomStatus
  }

  function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return {
    roomStats, isMonitoring, monitorTimeText,
    totalDanmu, totalGift, totalLike, totalMember, totalFollow,
    updateRooms, onMessage, startMonitoring, stopMonitoring,
    updateConnectionState, updateRecordingState, updateRoomApiStats,
    refreshApiStats
  }
})
