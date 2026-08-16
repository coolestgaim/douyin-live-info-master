import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LiveRoomInfo } from '../types'
import { DanmuConnectionState } from '../types'

const api = () => (window as any).electronAPI
const HISTORY_KEY = 'douyin-room-history-v1'

interface RoomHistory { url: string; nickname: string }

function loadHistory(): RoomHistory[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveHistory(rooms: LiveRoomInfo[]) {
  try {
    const existing = loadHistory()
    const urls = new Set(existing.map(h => h.url))
    for (const r of rooms) {
      if (!r.error && r.url && !urls.has(r.url)) {
        existing.unshift({ url: r.url, nickname: r.nickname || '' })
        urls.add(r.url)
      }
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(existing.slice(0, 20)))
  } catch {}
}

function removeHistory(url: string) {
  const h = loadHistory().filter(r => r.url !== url)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
}

export const useRoomListStore = defineStore('room-list', () => {
  const results = ref<(LiveRoomInfo & { connectionState: DanmuConnectionState })[]>([])
  const selectedRoom = ref<(LiveRoomInfo & { connectionState: DanmuConnectionState }) | null>(null)
  const statusMessage = ref('')
  const isLoading = ref(false)
  const urlText = ref('')
  const roomHistory = ref<RoomHistory[]>(loadHistory())

  function selectRoom(room: (LiveRoomInfo & { connectionState: DanmuConnectionState }) | null) {
    selectedRoom.value = room
  }

  function fillFromHistory(h: RoomHistory) {
    const lines = urlText.value.split(/[\r\n]/).filter(l => l.trim())
    if (!lines.includes(h.url)) {
      urlText.value = urlText.value ? urlText.value + '\n' + h.url : h.url
    }
  }

  async function fetchRooms() {
    const lines = urlText.value
      .split(/[\r\n]/)
      .map(l => l.trim())
      .filter(l => l.includes('live.douyin.com'))

    if (lines.length === 0) {
      statusMessage.value = '请输入至少一个有效的直播间链接'
      return
    }

    isLoading.value = true
    statusMessage.value = '正在获取...'

    try {
      const fetched = await api().roomFetch(lines)
      let addedSuccess = 0
      const newRooms: LiveRoomInfo[] = []

      for (const info of fetched) {
        if (!info.error && info.enterRoomId && results.value.some(r => r.enterRoomId === info.enterRoomId)) continue

        const room: LiveRoomInfo & { connectionState: DanmuConnectionState } = {
          ...info,
          index: results.value.length + 1,
          connectionState: DanmuConnectionState.None
        }
        results.value.push(room)
        if (!info.error) { addedSuccess++; newRooms.push(info as LiveRoomInfo) }
      }

      statusMessage.value = `完成！本次成功 ${addedSuccess}/${lines.length}，共 ${results.value.length} 个直播间`
      saveHistory(newRooms)
      roomHistory.value = loadHistory()
    } catch (ex: any) {
      statusMessage.value = `获取失败: ${ex.message}`
    } finally {
      isLoading.value = false
    }
  }

  function deleteSelected() {
    if (!selectedRoom.value) return
    const idx = results.value.indexOf(selectedRoom.value)
    if (idx >= 0) results.value.splice(idx, 1)
    reindex()
    selectedRoom.value = null
  }

  function deleteHistory(url: string) {
    removeHistory(url)
    roomHistory.value = loadHistory()
  }

  // 长按拖拽排序历史记录
  function reorderHistory(fromIdx: number, toIdx: number) {
    const h = loadHistory()
    if (fromIdx < 0 || fromIdx >= h.length || toIdx < 0 || toIdx >= h.length) return
    const [item] = h.splice(fromIdx, 1)
    h.splice(toIdx, 0, item)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
    roomHistory.value = loadHistory()
  }

  function clear() {
    results.value = []
    selectedRoom.value = null
    statusMessage.value = ''
    urlText.value = ''
  }

  function reindex() {
    results.value.forEach((r, i) => r.index = i + 1)
  }

  return {
    results, selectedRoom, statusMessage, isLoading, urlText, roomHistory,
    selectRoom, fetchRooms, fillFromHistory, deleteSelected, deleteHistory, reorderHistory, clear
  }
})
