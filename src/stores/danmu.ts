import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import type { DanmuMessage, RoomInfo } from '../types'
import { DanmuConnectionState } from '../types'
import { useRoomListStore } from './room-list'
import { useDashboardStore } from './dashboard'

const api = () => (window as any).electronAPI

export const useDanmuStore = defineStore('danmu', () => {
  const allMessages = ref<DanmuMessage[]>([])
  const chatMessages = ref<DanmuMessage[]>([])
  const giftMessages = ref<DanmuMessage[]>([])
  const likeMessages = ref<DanmuMessage[]>([])
  const memberMessages = ref<DanmuMessage[]>([])
  const socialMessages = ref<DanmuMessage[]>([])
  const historyRooms = ref<RoomInfo[]>([])

  const danmuStatus = ref('未连接')
  const danmuTitle = ref('弹幕消息')
  const danmuRoom = ref('请先在左侧选择一个直播间')
  const danmuCountText = ref('')
  const selectedTab = ref('all')

  // Use reactive Set so mutations are tracked
  const connectedRoomIds = reactive(new Set<string>())

  // Room filter
  const filterRoomId = ref('')

  const connectedRoomCount = computed(() => connectedRoomIds.size)

  // Available rooms for filtering (from connected rooms)
  const filterRoomOptions = computed(() => {
    const rooms: { roomId: string; nickname: string }[] = []
    const roomList = useRoomListStore()
    for (const id of connectedRoomIds) {
      const room = roomList.results.find(r => r.enterRoomId === id)
      rooms.push({ roomId: id, nickname: room?.nickname || `房间 ${id}` })
    }
    return rooms
  })

  // Filtered messages
  const filteredAllMessages = computed(() =>
    filterRoomId.value ? allMessages.value.filter(m => m.roomId === filterRoomId.value) : allMessages.value
  )
  const filteredChatMessages = computed(() =>
    filterRoomId.value ? chatMessages.value.filter(m => m.roomId === filterRoomId.value) : chatMessages.value
  )
  const filteredGiftMessages = computed(() =>
    filterRoomId.value ? giftMessages.value.filter(m => m.roomId === filterRoomId.value) : giftMessages.value
  )
  const filteredLikeMessages = computed(() =>
    filterRoomId.value ? likeMessages.value.filter(m => m.roomId === filterRoomId.value) : likeMessages.value
  )
  const filteredMemberMessages = computed(() =>
    filterRoomId.value ? memberMessages.value.filter(m => m.roomId === filterRoomId.value) : memberMessages.value
  )
  const filteredSocialMessages = computed(() =>
    filterRoomId.value ? socialMessages.value.filter(m => m.roomId === filterRoomId.value) : socialMessages.value
  )

  let listenersSetup = false

  function setupListeners() {
    if (listenersSetup) return
    listenersSetup = true

    api().onDanmuMessage((data: { roomId: string; msg: DanmuMessage }) => {
      data.msg.roomId = data.roomId
      addMessage(data.msg)

      // Forward to dashboard
      const dashboard = useDashboardStore()
      dashboard.onMessage(data.roomId, data.msg)
    })

    api().onDanmuStatus((data: { roomId: string; status: string }) => {
      const roomList = useRoomListStore()
      const room = roomList.results.find(r => r.enterRoomId === data.roomId)
      if (room && room === roomList.selectedRoom) {
        danmuStatus.value = data.status
      }
    })

    api().onDanmuDisconnect((data: { roomId: string; reason: string }) => {
      connectedRoomIds.delete(data.roomId)

      const dashboard = useDashboardStore()
      if (connectedRoomIds.size === 0) dashboard.stopMonitoring()

      const roomList = useRoomListStore()
      const room = roomList.results.find(r => r.enterRoomId === data.roomId)
      if (room) room.connectionState = DanmuConnectionState.Disconnected
      if (roomList.selectedRoom?.enterRoomId === data.roomId) {
        danmuStatus.value = `${room?.nickname || ''} 已断开: ${data.reason}`
      }
      updateCountText()
    })
  }

  function removeListeners() {
    api().removeDanmuListeners()
    listenersSetup = false
  }

  function addMessage(msg: DanmuMessage) {
    // 高频消息（点赞/进入）大幅降低存储上限，减少内存占用；其余保留 2000
    allMessages.value = [msg, ...allMessages.value].slice(0, 2000)

    switch (msg.type) {
      case 'Chat': chatMessages.value = [msg, ...chatMessages.value].slice(0, 2000); break
      case 'Gift': giftMessages.value = [msg, ...giftMessages.value].slice(0, 1000); break
      case 'Like': likeMessages.value = [msg, ...likeMessages.value].slice(0, 500); break
      case 'Member': memberMessages.value = [msg, ...memberMessages.value].slice(0, 800); break
      case 'Social': socialMessages.value = [msg, ...socialMessages.value].slice(0, 2000); break
    }

    updateCountText()
  }

  function updateCountText() {
    danmuCountText.value = allMessages.value.length > 0
      ? `消息: ${allMessages.value.length} | 连接: ${connectedRoomIds.size} 个房间`
      : `连接: ${connectedRoomIds.size} 个房间`
  }

  function selectRoom(room: any) {
    if (room) {
      danmuTitle.value = room.title || '弹幕消息'
      danmuRoom.value = `${room.nickname} · 房间 ${room.enterRoomId}`

      if (connectedRoomIds.has(room.enterRoomId)) {
        danmuStatus.value = `${room.nickname} 已连接`
      } else {
        danmuStatus.value = room.roomStatus === 2 ? '未开播' : '未连接'
      }
    } else {
      danmuTitle.value = '弹幕消息'
      danmuRoom.value = '请先在左侧选择一个直播间'
      danmuStatus.value = '未连接'
    }
  }

  async function connectRoom(roomId: string, nickname: string) {
    const dashboard = useDashboardStore()
    const roomList = useRoomListStore()
    dashboard.updateRooms(roomList.results)

    try {
      await api().danmuConnect(roomId, nickname)
      connectedRoomIds.add(roomId)
      danmuStatus.value = `${nickname} 已连接`
      updateCountText()

      const room = roomList.results.find(r => r.enterRoomId === roomId)
      if (room) room.connectionState = DanmuConnectionState.Connected

      dashboard.updateConnectionState(roomId, true)
      dashboard.startMonitoring()

      // 多房间时默认筛选到新连的房间，避免弹幕混在一起
      if (connectedRoomIds.size >= 2 && !filterRoomId.value) {
        filterRoomId.value = roomId
      }
    } catch (ex: any) {
      danmuStatus.value = `连接失败: ${ex.message}`
    }
  }

  async function disconnectRoom(roomId: string) {
    await api().danmuDisconnect(roomId)
    connectedRoomIds.delete(roomId)

    // 如果当前筛选的是断开连接的房间，切换到其他房间或清除筛选
    if (filterRoomId.value === roomId) {
      const remaining = [...connectedRoomIds]
      filterRoomId.value = remaining.length > 0 ? remaining[0] : ''
    }

    updateCountText()

    const dashboard = useDashboardStore()
    if (connectedRoomIds.size === 0) dashboard.stopMonitoring()

    const roomList = useRoomListStore()
    const room = roomList.results.find(r => r.enterRoomId === roomId)
    if (room) room.connectionState = DanmuConnectionState.Disconnected
  }

  async function connectAll(rooms: any[]) {
    const toConnect = rooms.filter(r => !r.error && r.roomStatus !== 2 && !connectedRoomIds.has(r.enterRoomId))
    if (toConnect.length === 0) { danmuStatus.value = '没有可连接的直播间'; return }

    // Ensure dashboard has room entries before connecting
    const dashboard = useDashboardStore()
    dashboard.updateRooms(rooms)

    danmuStatus.value = `正在连接 ${toConnect.length} 个直播间...`
    let successCount = 0

    for (const room of toConnect) {
      room.connectionState = DanmuConnectionState.Connecting
      try {
        await api().danmuConnect(room.enterRoomId, room.nickname)
        connectedRoomIds.add(room.enterRoomId)
        room.connectionState = DanmuConnectionState.Connected
        successCount++

        dashboard.updateConnectionState(room.enterRoomId, true)
      } catch {
        room.connectionState = DanmuConnectionState.Disconnected
      }
    }

    danmuStatus.value = `已连接 ${successCount}/${toConnect.length} 个直播间`
    updateCountText()

    // 多房间时默认筛选到第一个连上的房间
    if (connectedRoomIds.size >= 2 && !filterRoomId.value) {
      filterRoomId.value = [...connectedRoomIds][0]
    }

    if (successCount > 0) dashboard.startMonitoring()
  }

  async function disconnectAll() {
    await api().danmuDisconnectAll()
    connectedRoomIds.clear()
    filterRoomId.value = ''

    const roomList = useRoomListStore()
    for (const room of roomList.results) {
      room.connectionState = DanmuConnectionState.Disconnected
    }

    danmuStatus.value = '未连接'
    updateCountText()

    const dashboard = useDashboardStore()
    dashboard.stopMonitoring()
  }

  async function loadHistory() {
    historyRooms.value = await api().dbGetRooms()
  }

  async function clearDatabase() {
    await api().dbClearAll()
    historyRooms.value = []
    danmuStatus.value = '数据库已清空'
  }

  // 清空当前筛选房间的内存弹幕（不删数据库）
  function clearMessages(roomId?: string) {
    const filterFn = (m: DanmuMessage) => roomId ? m.roomId !== roomId : false
    if (roomId) {
      allMessages.value = allMessages.value.filter(filterFn)
      chatMessages.value = chatMessages.value.filter(filterFn)
      giftMessages.value = giftMessages.value.filter(filterFn)
      likeMessages.value = likeMessages.value.filter(filterFn)
      memberMessages.value = memberMessages.value.filter(filterFn)
      socialMessages.value = socialMessages.value.filter(filterFn)
    } else {
      // 无筛选时清空全部
      allMessages.value = []
      chatMessages.value = []
      giftMessages.value = []
      likeMessages.value = []
      memberMessages.value = []
      socialMessages.value = []
    }
    updateCountText()
  }

  async function getMessages(roomId: string, typeFilter?: string, keyword?: string, username?: string) {
    return api().dbGetMessages(roomId, typeFilter, keyword, username)
  }

  return {
    allMessages, chatMessages, giftMessages, likeMessages, memberMessages, socialMessages,
    historyRooms, danmuStatus, danmuTitle, danmuRoom, danmuCountText, selectedTab,
    connectedRoomIds, connectedRoomCount,
    filterRoomId, filterRoomOptions,
    filteredAllMessages, filteredChatMessages, filteredGiftMessages,
    filteredLikeMessages, filteredMemberMessages, filteredSocialMessages,
    setupListeners, removeListeners, selectRoom,
    connectRoom, disconnectRoom, connectAll, disconnectAll,
    loadHistory, clearDatabase, clearMessages, getMessages
  }
})
