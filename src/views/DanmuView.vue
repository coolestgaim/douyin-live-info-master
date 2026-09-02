<template>
  <div class="danmu-page">
    <div class="card danmu-header">
      <div>
        <div class="danmu-title">{{ danmuStore.danmuTitle }}</div>
        <div class="danmu-room">{{ danmuStore.danmuRoom }}</div>
      </div>
      <div class="danmu-status-area">
        <button class="chat-only-btn" :class="{ on: danmuStore.chatOnly }" @click="danmuStore.setChatOnly(!danmuStore.chatOnly)"
          :title="danmuStore.chatOnly ? '仅监听弹幕中：礼物/点赞/进房已忽略，省资源' : '监听全部消息（含礼物/点赞/进房）'">{{ danmuStore.chatOnly ? '仅弹幕' : '全部消息' }}</button>
        <button class="float-btn" @click="toggleFloating" :title="floatingOpen ? '关闭弹幕浮窗' : '打开弹幕浮窗'">{{ floatingOpen ? '关闭浮窗' : '弹幕浮窗' }}</button>
        <button class="clear-btn" @click="clearCurrentMessages" title="清空当前筛选的消息">清空</button>
        <span class="danmu-count">{{ danmuStore.danmuCountText }}</span>
        <span :class="['status-dot', { green: danmuStore.connectedRoomCount > 0, red: danmuStore.danmuStatus.includes('失败') }]"></span>
        <span class="danmu-status-text">{{ danmuStore.danmuStatus }}</span>
      </div>
    </div>

    <div class="card danmu-content">
      <div v-if="danmuStore.connectedRoomCount > 1" class="room-filter-bar">
        <span class="filter-label">房间筛选:</span>
        <div class="filter-chips">
          <button
            :class="['filter-chip', { active: danmuStore.filterRoomId === '' }]"
            @click="danmuStore.filterRoomId = ''"
          >全部</button>
          <button
            v-for="opt in danmuStore.filterRoomOptions"
            :key="opt.roomId"
            :class="['filter-chip', { active: danmuStore.filterRoomId === opt.roomId }]"
            @click="danmuStore.filterRoomId = opt.roomId"
          >{{ opt.nickname }}</button>
        </div>
      </div>

      <n-tabs v-model:value="danmuStore.selectedTab" type="line" animated>
        <n-tab-pane name="all" tab="全部">
          <DanmuList :messages="danmuStore.filteredAllMessages" empty="暂无消息，连接直播间后将实时显示" />
        </n-tab-pane>
        <n-tab-pane name="chat" tab="弹幕">
          <DanmuList :messages="danmuStore.filteredChatMessages" empty="暂无弹幕消息" />
        </n-tab-pane>
        <n-tab-pane name="gift" tab="礼物">
          <DanmuList :messages="danmuStore.filteredGiftMessages" empty="暂无礼物消息" />
        </n-tab-pane>
        <n-tab-pane name="like" tab="点赞">
          <DanmuList :messages="danmuStore.filteredLikeMessages" empty="暂无点赞消息" />
        </n-tab-pane>
        <n-tab-pane name="member" tab="进入">
          <DanmuList :messages="danmuStore.filteredMemberMessages" empty="暂无进入消息" />
        </n-tab-pane>
        <n-tab-pane name="social" tab="关注">
          <DanmuList :messages="danmuStore.filteredSocialMessages" empty="暂无关注消息" />
        </n-tab-pane>
        <n-tab-pane name="history" tab="历史">
          <div class="history-header">
            <span class="history-hint">双击卡片查看历史弹幕记录</span>
            <n-button size="tiny" tertiary @click="danmuStore.clearDatabase()">清空记录</n-button>
          </div>
          <div v-if="danmuStore.historyRooms.length > 0" class="history-cards">
            <div v-for="room in danmuStore.historyRooms" :key="room.roomId + '|' + (room.sessionStart || '')" class="history-card" @dblclick="openHistory(room)" :title="'连接: ' + (room.sessionStart || '-') + ' → 断开: ' + (room.lastActive || '-')">
              <div class="history-name">{{ room.nickname || `房间 ${room.roomId}` }}</div>
              <div class="history-meta">
                <span class="accent">{{ room.messageCount }} 条消息</span>
                <span class="history-time">{{ fmtSession(room) }}</span>
              </div>
            </div>
          </div>
          <div v-else class="empty-inline">暂无历史记录</div>
        </n-tab-pane>
      </n-tabs>
    </div>

    <n-modal v-model:show="showHistory" preset="card" style="width: 90%; max-width: 900px; max-height: 640px;" :title="historyTitle">
      <div class="history-filters">
        <n-radio-group v-model:value="historyFilter" size="small" @update:value="loadHistoryMessages">
          <n-radio-button value="">全部</n-radio-button>
          <n-radio-button value="Chat">弹幕</n-radio-button>
        </n-radio-group>
        <n-input v-model:value="historyKeyword" size="small" placeholder="搜索内容..." style="width: 200px" @update:value="loadHistoryMessages" />
        <n-input v-model:value="historyUsername" size="small" placeholder="筛选用户名..." style="width: 200px" @update:value="loadHistoryMessages" />
      </div>
      <div class="history-list">
        <div v-for="msg in historyMessages" :key="msg.id" class="history-row">
          <span class="history-row-time">{{ msg.time }}</span>
          <span :class="['history-tag', `tag-${msg.type.toLowerCase()}`]">{{ typeLabel(msg.type) }}</span>
          <span class="history-line">{{ msg.displayLine }}</span>
        </div>
      </div>
      <div class="history-footer">
        <span class="history-info">{{ historyMessages.length }} 条记录</span>
        <div class="export-btns">
          <n-button size="tiny" tertiary :loading="exporting" @click="exportData('csv')">导出 CSV</n-button>
          <n-button size="tiny" tertiary :loading="exporting" @click="exportData('json')">导出 JSON</n-button>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { NTabs, NTabPane, NModal, NRadioGroup, NRadioButton, NInput, NButton, useMessage } from 'naive-ui'
import { useDanmuStore } from '../stores/danmu'
import { useRoomListStore } from '../stores/room-list'
import DanmuList from '../components/DanmuList.vue'
import type { RoomInfo } from '../types'

const message = useMessage()

const danmuStore = useDanmuStore()
const roomListStore = useRoomListStore()

const showHistory = ref(false)
const historyTitle = ref('')
const historyRoomId = ref('')
const historyFilter = ref('')
const historyKeyword = ref('')
const historyUsername = ref('')
const historyMessages = ref<any[]>([])
const exporting = ref(false)

const api = () => (window as any).electronAPI
// 浮窗状态：仅用于顶部按钮文案（开关浮窗）。主窗口弹幕不因浮窗开启而暂停，v2.9.24 起两侧独立显示
const floatingOpen = ref(false)

function toggleFloating() {
  if (floatingOpen.value) {
    api().floatingClose()
    floatingOpen.value = false
  } else {
    api().floatingOpen()
    floatingOpen.value = true
  }
}

function clearCurrentMessages() {
  danmuStore.clearMessages(danmuStore.filterRoomId || undefined)
}

onMounted(() => {
  if (danmuStore.selectedTab === 'history') danmuStore.loadHistory()
  api().onFloatingClosed(() => { floatingOpen.value = false })
})

watch(() => danmuStore.selectedTab, (val) => {
  if (val === 'history') danmuStore.loadHistory()
})

/** 会话时间展示：连接开始 ~ 断开（同房间每次连接独立一张卡） */
function fmtSession(room: RoomInfo): string {
  const short = (t: string) => (t ? t.slice(5, 16) : '')
  const s = room.sessionStart
  const e = room.lastActive
  if (s && e) return `${short(s)} ~ ${short(e)}`
  if (s) return `${short(s)} ~ 连接中`
  return room.lastActive || ''
}

async function openHistory(room: RoomInfo) {
  historyRoomId.value = room.roomId
  historyTitle.value = room.nickname || `房间 ${room.roomId}`
  historyFilter.value = ''
  historyKeyword.value = ''
  historyUsername.value = ''
  showHistory.value = true
  await loadHistoryMessages()
}

async function loadHistoryMessages() {
  historyMessages.value = await danmuStore.getMessages(
    historyRoomId.value,
    historyFilter.value || undefined,
    historyKeyword.value || undefined,
    historyUsername.value || undefined
  )
}

function typeLabel(type: string): string {
  const map: Record<string, string> = { Chat: '弹幕', Gift: '礼物', Like: '点赞', Member: '进入', Social: '关注', Stats: '统计' }
  return map[type] || type
}

async function exportData(format: 'csv' | 'json') {
  exporting.value = true
  try {
    const res = await api().dbExportMessages(
      historyRoomId.value, historyTitle.value,
      historyFilter.value || undefined,
      historyKeyword.value || undefined,
      historyUsername.value || undefined,
      format
    )
    if (res.success) {
      message.success(`已导出 ${res.count} 条记录`)
    }
  } catch (ex: any) {
    message.error('导出失败: ' + (ex.message || '未知错误'))
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.danmu-page { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 10px; min-height: 0; flex: 1; }

.danmu-header {
  padding: 12px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.danmu-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.danmu-room { font-size: 11px; color: var(--text-dim); margin-top: 2px; }

.danmu-status-area { display: flex; align-items: center; gap: 8px; }
.float-btn { background: var(--bg-selected); border: 1px solid var(--primary-border); color: var(--primary-hover); font-size: 11px; padding: 2px 10px; border-radius: 4px; cursor: pointer; font-family: inherit; white-space: nowrap; }
.float-btn:hover { background: var(--primary-soft); }
.clear-btn { background: var(--danger-soft); border: 1px solid var(--danger-border); color: var(--danger); font-size: 11px; padding: 2px 10px; border-radius: 4px; cursor: pointer; font-family: inherit; white-space: nowrap; }
.clear-btn:hover { background: var(--danger-soft); }
/* 仅弹幕模式开关 */
.chat-only-btn { background: var(--bg-selected); border: 1px solid var(--border-strong); color: var(--text-muted); font-size: 11px; padding: 2px 10px; border-radius: 4px; cursor: pointer; font-family: inherit; white-space: nowrap; transition: all .15s; }
.chat-only-btn:hover { border-color: var(--primary); color: var(--text-secondary); }
.chat-only-btn.on { background: var(--success-soft); border-color: var(--success-border); color: var(--success); }
.danmu-count { font-size: 11px; color: var(--text-faint); }
.danmu-status-text { font-size: 12px; color: var(--text-muted); }

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-strong);
}

.status-dot.green {
  background: var(--success);
  box-shadow: 0 0 8px var(--success-border);
}

.status-dot.red {
  background: var(--danger);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
}

.danmu-content { flex: 1; min-height: 0; padding: 0 10px 10px; overflow: hidden; display: flex; flex-direction: column; position: relative; }

.danmu-content :deep(.n-tabs) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.danmu-content :deep(.n-tabs-pane-wrapper) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.danmu-content :deep(.n-tab-pane) {
  height: 100%;
  overflow-y: auto;
}

.room-filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.filter-label {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.filter-chips {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  flex: 1;
}

.filter-chip {
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  font-family: inherit;
}

.filter-chip:hover {
  border-color: var(--primary);
  color: var(--text-secondary);
}

.filter-chip.active {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 500;
}

.history-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; }
.history-hint { font-size: 11px; color: var(--text-faint); }

.history-cards { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px; }

.history-card {
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  padding: 12px 16px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.history-card:hover {
  border-color: var(--primary);
}

.history-name { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.history-meta { display: flex; gap: 12px; font-size: 10px; }
.history-time { color: var(--text-faint); }

.empty-inline {
  text-align: center;
  color: var(--text-faint);
  padding: 24px;
  font-size: 13px;
}

.history-filters { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.history-list { max-height: 400px; overflow-y: auto; }

.history-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-default);
}

.history-row-time { font-size: 11px; color: var(--text-faint); }

.history-tag {
  font-size: 10px;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.tag-chat { background: var(--text-dim); }
.tag-gift { background: var(--primary); }
.tag-like { background: var(--danger); }
.tag-member { background: var(--success); }
.tag-social { background: var(--info); }
.tag-stats { background: var(--text-muted); }

.history-line { font-size: 12px; color: var(--text-secondary); }
.history-info { font-size: 11px; color: var(--text-faint); }
.history-footer { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; }
.export-btns { display: flex; gap: 6px; }

/* 浮窗开启时主窗口暂停覆盖层 */
.floating-pause-overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--bg-sidebar) 94%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  border-radius: 12px;
  backdrop-filter: blur(4px);
}
.pause-card { text-align: center; max-width: 360px; padding: 24px; }
.pause-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--primary); margin: 0 auto 14px; box-shadow: 0 0 12px rgba(240, 80, 110, 0.5); }
.pause-title { font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
.pause-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-bottom: 18px; }
.pause-actions { display: flex; gap: 8px; justify-content: center; }
.pause-btn { background: transparent; border: 1px solid var(--border-strong); color: var(--text-secondary); font-size: 12px; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
.pause-btn:hover { border-color: var(--primary); color: var(--primary-hover); }
.pause-btn.primary { background: var(--primary-soft); border-color: var(--primary-border); color: var(--primary-hover); }
.pause-btn.primary:hover { background: var(--primary-soft); }
</style>
