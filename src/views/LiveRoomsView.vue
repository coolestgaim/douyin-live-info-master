<template>
  <div class="rooms-page">
    <h2 class="page-title">直播间</h2>

    <div class="card input-card">
      <div class="input-label">直播间链接（每行一个）</div>
      <n-input
        v-model:value="roomList.urlText"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 4 }"
        :disabled="roomList.isLoading"
        placeholder="https://live.douyin.com/123456"
      />
      <div v-if="roomList.roomHistory.length > 0" class="history-chips">
        <span class="chips-label">历史:</span>
        <span
          v-for="h in roomList.roomHistory"
          :key="h.url"
          class="history-chip"
          @click="roomList.fillFromHistory(h)"
          :title="h.url"
        >{{ h.nickname || h.url.split('/').pop() }}<button class="chip-del" @click.stop="roomList.deleteHistory(h.url)">×</button></span>
      </div>
      <div class="input-actions">
        <n-button size="small" @click="importLinks">导入链接</n-button>
        <n-button size="small" @click="exportLinks" :disabled="roomList.results.length === 0">导出链接</n-button>
        <n-button type="primary" size="small" @click="handleFetch" :loading="roomList.isLoading">获取信息</n-button>
        <n-button size="small" tertiary @click="roomList.clear()">清空</n-button>
      </div>
    </div>

    <div class="card list-header">
      <span class="list-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 6px;">
          <rect x="2" y="4" width="20" height="13" rx="3" stroke="#6b7080" stroke-width="1.8"/>
          <path d="M8 21h8M12 17v4" stroke="#6b7080" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        直播间列表
      </span>
      <div class="header-actions">
        <n-button size="small" @click="roomList.deleteSelected()" :disabled="!roomList.selectedRoom">删除选中</n-button>
        <n-button type="primary" size="small" @click="danmuStore.connectAll(roomList.results)">全部连接</n-button>
        <n-button size="small" tertiary @click="danmuStore.disconnectAll()">全部断开</n-button>
      </div>
    </div>

    <div class="card room-list" v-if="roomList.results.length > 0">
      <n-data-table
        :columns="columns"
        :data="roomList.results"
        :row-props="rowProps"
        :bordered="false"
        size="small"
        :pagination="false"
      />
    </div>

    <div class="empty-state" v-else>
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="4" width="20" height="13" rx="3" stroke="#2a2d36" stroke-width="1.5"/>
          <path d="M8 21h8M12 17v4" stroke="#2a2d36" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="empty-title">在上方输入直播间链接，点击「获取信息」</div>
    </div>

    <div class="status-bar">
      <div v-if="roomList.isLoading" class="loading-bar"><div class="loading-bar-inner"></div></div>
      <span class="status-text">{{ roomList.statusMessage }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { h } from 'vue'
import { NInput, NButton, NDataTable } from 'naive-ui'
import { useRoomListStore } from '../stores/room-list'
import { useDanmuStore } from '../stores/danmu'
import type { DataTableColumns } from 'naive-ui'

const roomList = useRoomListStore()
const danmuStore = useDanmuStore()

const columns: DataTableColumns<any> = [
  { title: '#', key: 'index', width: 40, align: 'center' },
  { title: '主播', key: 'nickname', width: 100 },
  { title: '标题', key: 'title', width: 160, ellipsis: { tooltip: true } },
  { title: '点赞', key: 'likeCount', width: 70, align: 'right', render: (row) => h('span', { style: 'color: #f97316; font-weight: 600' }, row.error ? '-' : row.likeCount?.toLocaleString()) },
  { title: '观看', key: 'viewCount', width: 70, align: 'right', render: (row) => h('span', { style: 'color: #4a4e5e' }, row.error ? '-' : row.viewCount?.toLocaleString()) },
  {
    title: '直播', key: 'roomStatus', width: 60, align: 'center',
    render: (row) => h('span', {
      style: `color: ${row.error ? '#ef4444' : '#10b981'}; font-weight: 600; font-size: 11px`
    }, row.error ? '失败' : row.roomStatus === 2 ? '未开播' : '直播中')
  },
  {
    title: '弹幕', key: 'connectionState', width: 60, align: 'center',
    render: (row) => h('span', {
      style: 'color: #22d3ee; font-weight: 600; font-size: 11px'
    }, row.connectionState === 'Connected' ? '已连接' : row.connectionState === 'Connecting' ? '连接中' : '')
  },
  {
    title: '', key: 'connect', width: 50, align: 'center',
    render: (row) => h('button', {
      style: 'background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);color:#f97316;font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;font-family:inherit',
      onClick: (e: Event) => { e.stopPropagation(); danmuStore.connectRoom(row.enterRoomId, row.nickname) }
    }, row.connectionState === 'Connected' ? '' : '连接')
  }
]

function rowProps(row: any) {
  const selected = roomList.selectedRoom?.enterRoomId === row.enterRoomId
  return {
    style: { background: selected ? 'rgba(249,115,22,0.08)' : undefined, cursor: 'pointer' },
    onClick: () => {
      roomList.selectRoom(row)
      danmuStore.selectRoom(row)
    }
  }
}

async function handleFetch() {
  await roomList.fetchRooms()
}

function importLinks() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.txt'
  input.onchange = async (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    roomList.urlText = text
  }
  input.click()
}

function exportLinks() {
  const text = roomList.results.map(r => r.url).join('\n')
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `直播链接_${new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14)}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.rooms-page {
  padding: 16px 20px 20px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card { padding: 16px 18px; }

.input-label {
  font-size: 12px;
  color: #6b7080;
  margin-bottom: 8px;
  font-weight: 500;
}

.input-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  justify-content: flex-end;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
}

.list-title {
  font-size: 12px;
  font-weight: 600;
  color: #6b7080;
  display: flex;
  align-items: center;
}

.header-actions { display: flex; gap: 6px; }

.room-list {
  flex: 1;
  padding: 8px 10px;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.status-text {
  font-size: 11px;
  color: #3a3d46;
  margin-left: auto;
}

.history-chips { display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.chips-label { font-size: 10px; color: #4a4e5e; flex-shrink: 0; }
.history-chip { font-size: 11px; color: #8b8fa3; background: #1a1d26; border: 1px solid #2a2d36; padding: 2px 6px 2px 8px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 3px; transition: all .15s; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-chip:hover { border-color: #f97316; color: #e0e2e8; }
.chip-del { font-size: 10px; color: #4a4e5e; background: none; border: none; cursor: pointer; padding: 0 2px; line-height: 1; flex-shrink: 0; }
.chip-del:hover { color: #ef4444; }

.empty-state {
  padding: 40px 0;
}

.empty-title {
  font-size: 13px;
  color: #4a4e5e;
}
</style>
