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
        >
          <span class="chip-name">{{ h.nickname || h.url.split('/').pop() }}</span>
          <button class="chip-copy" @click.stop="copyUrl(h.url)" title="复制直播间链接" aria-label="复制链接">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/>
              <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="chip-del" @click.stop="roomList.deleteHistory(h.url)" title="删除" aria-label="删除">×</button>
        </span>
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
          <rect x="2" y="4" width="20" height="13" rx="3" stroke="var(--text-muted)" stroke-width="1.8"/>
          <path d="M8 21h8M12 17v4" stroke="var(--text-muted)" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        直播间列表
      </span>
      <div class="header-actions">
        <n-button size="small" @click="roomList.deleteSelected()" :disabled="!roomList.selectedRoom">删除选中</n-button>
        <n-button v-if="recordedRooms.size === 0" type="primary" size="small" @click="recordAllLive" :disabled="!roomList.results.some(r => !r.error && r.roomStatus !== 2)" title="对列表内所有直播中的房间同时连接弹幕 + 开始录制（统一归档到子文件夹 {nickname}_{时间}/）">全局录制</n-button>
        <n-button v-else size="small" type="error" @click="stopAllRecord" :title="`当前正在录制 ${recordedRooms.size} 个直播间，点击全部停止`">停止录制 ({{ recordedRooms.size }})</n-button>
        <n-button size="small" tertiary @click="danmuStore.connectAll(roomList.results)">全部连接</n-button>
        <n-button size="small" tertiary @click="danmuStore.disconnectAll()">全部断开</n-button>
      </div>
    </div>

    <div class="card room-list" v-show="roomList.results.length > 0">
      <n-data-table
        :columns="columns"
        :data="roomList.results"
        :row-key="(row: any) => row.enterRoomId"
        :row-props="rowProps"
        :bordered="false"
        size="small"
        :pagination="false"
      />
    </div>

    <div class="empty-state" v-if="roomList.results.length === 0">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="4" width="20" height="13" rx="3" stroke="var(--border-strong)" stroke-width="1.5"/>
          <path d="M8 21h8M12 17v4" stroke="var(--border-strong)" stroke-width="1.5" stroke-linecap="round"/>
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
import { h, computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { NInput, NButton, NDataTable, useMessage } from 'naive-ui'
import { useRoomListStore } from '../stores/room-list'
import { useDanmuStore } from '../stores/danmu'
import type { DataTableColumns } from 'naive-ui'

const roomList = useRoomListStore()
const danmuStore = useDanmuStore()
const message = useMessage()

// 预约开播：本地缓存已预约房间（真正轮询在主进程 RoomWatchService）
const watchedRooms = ref<Set<string>>(new Set())
// 正在录制的房间（main→render 通过 onRecordUpdate 实时同步）
const recordedRooms = ref<Set<string>>(new Set())
const api = () => (window as any).electronAPI

async function refreshWatched() {
  try {
    const r = await (window as any).electronAPI?.roomWatchList?.()
    if (r?.list) watchedRooms.value = new Set(r.list.filter((t: any) => !t.started).map((t: any) => t.roomId))
  } catch { /* ignore */ }
}
onMounted(() => {
  refreshWatched()
  try { (window as any).electronAPI?.onRoomWatchStarted?.((data: { roomId: string; nickname: string }) => {
    watchedRooms.value.delete(data.roomId)
    watchedRooms.value = new Set(watchedRooms.value)
    message.success(`主播「${data.nickname}」开播了，已自动连接弹幕并开始录制 🎬`)
  }) } catch { /* ignore */ }
  // 监听录制状态：标记当前正在录制的房间
  try { (window as any).electronAPI?.onRecordUpdate?.((state: any) => {
    recordedRooms.value = new Set((state?.items ?? []).filter((it: any) => it.isActive).map((it: any) => it.roomId))
  }) } catch { /* ignore */ }
  // 预约下播自动停止（room-watch 检测到房间已下播 → 主进程停止录制+断开弹幕）
  try { (window as any).electronAPI?.onRoomWatchStopped?.((data: { roomId: string; nickname: string }) => {
    message.info(`主播「${data.nickname}」已下播，录制与弹幕自动停止，产物已归档到子文件夹`)
  }) } catch { /* ignore */ }
})
onBeforeUnmount(() => {
  try { api()?.removeRecordListeners?.() } catch { /* ignore */ }
  try { (window as any).electronAPI?.removeRoomWatchListeners?.() } catch { /* ignore */ }
})

// 全局录制：对列表内所有直播中的房间批量「开始录制 + 自动连弹幕」
// 录到统一子文件夹 {nickname}_{startTime}/ 里，含视频和弹幕 CSV；可在「弹幕回放」页直接打开
async function recordAllLive() {
  // ⚠️ 必须白名单字段拆为普通字面量对象再过 IPC——Vue reactive 对象（Proxy）无法序列化克隆，会抛
  // "An object could not be cloned"
  const liveRooms = (roomList.results as any[])
    .filter((r: any) => !r.error && r.roomStatus !== 2)
    .map((r: any) => ({
      enterRoomId: r.enterRoomId,
      nickname: r.nickname,
      roomStatus: r.roomStatus,
      quality: r.quality || '',
      url: r.url,
    }))
  if (!liveRooms.length) { message.warning('当前没有直播中的房间'); return }
  try {
    const r = await api()?.recordStartAll?.(liveRooms)
    const ok = r?.count ?? liveRooms.length
    const fail = r?.failures?.length ?? 0
    if (fail > 0) message.warning(`已开始录制 ${ok} 个，${fail} 个失败：${(r.failures || []).map((f: any) => f.nickname + '（' + f.reason + '）').join('；')}`)
    else message.success(`已开始录制 ${ok} 个直播间，弹幕自动连接并在「弹幕回放」页查看`)
  } catch (e: any) {
    message.error('全局录制失败: ' + (e?.message || String(e)))
  }
}
// 全局停止：当前所有录制一律停止 + 联动断开弹幕连接（v2.9.26 修复：之前直播页直接调 api 绕过了 record store）
async function stopAllRecord() {
  try {
    // 必须走 record store 的 stopAll：会先 useDanmuStore().disconnectAll() 同步刷新直播间行连接状态，再停止录制
    const { useRecordStore } = await import('../stores/record')
    await useRecordStore().stopAll()
    message.success('全部录制已停止，弹幕连接也已断开')
  } catch (e: any) {
    message.error('停止失败: ' + (e?.message || String(e)))
  }
}

async function watchRoom(row: any) {
  if (!row.enterRoomId) { message.error('该直播间无有效房间号'); return }
  try {
    const r = await (window as any).electronAPI?.roomWatchAdd?.({
      url: row.url, enterRoomId: row.enterRoomId, nickname: row.nickname, quality: row.quality || ''
    })
    if (r?.success) {
      watchedRooms.value = new Set(r.list.filter((t: any) => !t.started).map((t: any) => t.roomId))
      if (r.started) {
        message.success(`「${row.nickname}」正在直播，已直接开始录制并连接弹幕 🎬`)
      } else {
        message.success(`已预约「${row.nickname}」，开播后自动连接弹幕并开始录制`)
      }
    } else {
      message.error(r?.error || '预约失败')
    }
  } catch (e: any) {
    message.error('预约失败: ' + (e?.message || String(e)))
  }
}

async function unwatchRoom(row: any) {
  try {
    const r = await (window as any).electronAPI?.roomWatchRemove?.(row.enterRoomId)
    if (r?.success) {
      watchedRooms.value = new Set(r.list.filter((t: any) => !t.started).map((t: any) => t.roomId))
      message.info(`已取消预约「${row.nickname}」`)
    }
  } catch { /* ignore */ }
}

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    message.success('已复制直播间链接')
  } catch {
    message.error('复制失败')
  }
}

const columns: DataTableColumns<any> = [
  { title: '#', key: 'index', width: 40, align: 'center' },
  { title: '主播', key: 'nickname', width: 100 },
  { title: '标题', key: 'title', width: 160, ellipsis: { tooltip: true } },
  { title: '点赞', key: 'likeCount', width: 70, align: 'right', render: (row) => h('span', { style: 'color: var(--primary); font-weight: 600' }, row.error ? '-' : row.likeCount?.toLocaleString()) },
  { title: '观看', key: 'viewCount', width: 70, align: 'right', render: (row) => h('span', { style: 'color: var(--text-faint)' }, row.error ? '-' : row.viewCount?.toLocaleString()) },
  {
    title: '直播', key: 'roomStatus', width: 60, align: 'center',
    render: (row) => h('span', {
      style: `color: ${row.error ? 'var(--danger)' : 'var(--success)'}; font-weight: 600; font-size: 11px`
    }, row.error ? '失败' : row.roomStatus === 2 ? '未开播' : '直播中')
  },
  {
    title: '弹幕', key: 'connectionState', width: 60, align: 'center',
    render: (row) => h('span', {
      style: (() => {
        if (row.connectionState === 'Connected') return 'color: var(--accent-cyan); font-weight: 600; font-size: 11px'
        if (row.connectionState === 'Connecting') return 'color: var(--warning); font-weight: 500; font-size: 11px'
        if (row.connectionState === 'Disconnected') return 'color: var(--text-faint); font-size: 11px'
        return ''
      })()
    }, row.connectionState === 'Connected' ? '已连接' : row.connectionState === 'Connecting' ? '连接中' : row.connectionState === 'Disconnected' ? '已断开' : '')
  },
  {
    title: '', key: 'connect', width: 50, align: 'center',
    render: (row) => {
      const connected = row.connectionState === 'Connected'
      return h('button', {
        style: connected
          ? 'background:var(--danger-soft);border:1px solid var(--danger-border);color:var(--danger);font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;font-family:inherit'
          : 'background:var(--bg-active);border:1px solid var(--primary-border);color:var(--primary);font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;font-family:inherit',
        onClick: (e: Event) => { e.stopPropagation(); connected ? danmuStore.disconnectRoom(row.enterRoomId) : danmuStore.connectRoom(row.enterRoomId, row.nickname) }
      }, connected ? '断开' : '连接')
    }
  },
  {
    title: '', key: 'watch', width: 50, align: 'center',
    render: (row) => {
      const watching = watchedRooms.value.has(row.enterRoomId)
      return h('button', {
        title: watching ? '已预约：主播开播后自动连接弹幕并开始录制' : '预约开播：主播开播后自动连接弹幕并开始录制',
        style: watching
          ? 'background:var(--success-soft, rgba(99,145,34,.12));border:1px solid var(--success-border, rgba(99,145,34,.4));color:var(--success, #639922);font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;font-family:inherit'
          : 'background:var(--bg-active);border:1px solid var(--warning-border, rgba(186,117,23,.4));color:var(--warning, #BA7517);font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;font-family:inherit',
        onClick: (e: Event) => { e.stopPropagation(); watching ? unwatchRoom(row) : watchRoom(row) }
      }, watching ? '已约' : '预约')
    }
  },
  {
    title: '', key: 'recordState', width: 50, align: 'center',
    render: (row) => {
      const rec = recordedRooms.value.has(row.enterRoomId)
      if (!rec) return null
      return h('span', {
        title: '正在录制中（与该房间的弹幕实时写入同一子文件夹的 CSV，可在「弹幕回放」页查看）',
        style: 'display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--danger, #E55);font-weight:600'
      }, [
        h('span', { style: 'width:6px;height:6px;border-radius:50%;background:var(--danger, #E55);animation:pulse 1s infinite;display:inline-block' }),
        '●REC'
      ])
    }
  }
]

const rowProps = computed(() => {
  const selId = roomList.selectedRoom?.enterRoomId ?? ''
  return (row: any) => ({
    style: { background: row.enterRoomId === selId ? 'var(--bg-selected)' : undefined, cursor: 'pointer' },
    class: roomList.selectedRoom?.enterRoomId === row.enterRoomId ? 'active-room-row' : '',
    onClick: () => {
      roomList.selectRoom(row)
      danmuStore.selectRoom(row)
    }
  })
})

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
  color: var(--text-muted);
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
  color: var(--text-muted);
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
  color: var(--text-dim);
  margin-left: auto;
}

.history-chips { display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.chips-label { font-size: 10px; color: var(--text-faint); flex-shrink: 0; }
.history-chip { font-size: 11px; color: var(--text-secondary); background: var(--bg-card); border: 1px solid var(--border-strong); padding: 2px 4px 2px 8px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 3px; transition: all .15s; max-width: 260px; }
.history-chip:hover { border-color: var(--primary); color: var(--text-primary); }
.chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.chip-del, .chip-copy { font-size: 10px; color: var(--text-faint); background: none; border: none; cursor: pointer; padding: 1px 3px; line-height: 1; flex-shrink: 0; display: flex; align-items: center; }
.chip-copy:hover { color: var(--info); }
.chip-del:hover { color: var(--danger); }

.empty-state {
  padding: 40px 0;
}

.empty-title {
  font-size: 13px;
  color: var(--text-faint);
}

/* 选中行高亮（n-data-table 行内 style 8% 透明看不见，用 .active-room-row + !important） */
:deep(.active-room-row td) {
  background: rgba(240, 80, 110, 0.16) !important;
  box-shadow: inset 3px 0 0 var(--primary);
}
:deep(.active-room-row:hover td) {
  background: rgba(240, 80, 110, 0.24) !important;
}
</style>
