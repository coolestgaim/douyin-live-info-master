import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LiveRoomInfo } from '../types'
import { DanmuConnectionState } from '../types'

const api = () => (window as any).electronAPI

export const useRoomListStore = defineStore('room-list', () => {
  const results = ref<(LiveRoomInfo & { connectionState: DanmuConnectionState })[]>([])
  const selectedRoom = ref<(LiveRoomInfo & { connectionState: DanmuConnectionState }) | null>(null)
  const statusMessage = ref('')
  const isLoading = ref(false)
  const urlText = ref('')

  function selectRoom(room: (LiveRoomInfo & { connectionState: DanmuConnectionState }) | null) {
    selectedRoom.value = room
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

      for (const info of fetched) {
        // Deduplicate
        if (!info.error && info.enterRoomId && results.value.some(r => r.enterRoomId === info.enterRoomId)) continue

        const room: LiveRoomInfo & { connectionState: DanmuConnectionState } = {
          ...info,
          index: results.value.length + 1,
          connectionState: DanmuConnectionState.None
        }
        results.value.push(room)
        if (!info.error) addedSuccess++
      }

      statusMessage.value = `完成！本次成功 ${addedSuccess}/${lines.length}，共 ${results.value.length} 个直播间`
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
    results, selectedRoom, statusMessage, isLoading, urlText,
    selectRoom, fetchRooms, deleteSelected, clear
  }
})
