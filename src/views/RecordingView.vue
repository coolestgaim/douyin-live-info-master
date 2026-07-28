<template>
  <div class="recording-page">
    <div class="rec-header">
      <div>
        <h2 class="rec-title">录制管理</h2>
        <div class="rec-subtitle">
          <span class="subtitle-text">直播流录制与保存</span>
          <span v-if="recordStore.recordingCount > 0" class="subtitle-highlight">{{ recordStore.recordingCount }} 个任务进行中</span>
        </div>
      </div>
      <div class="rec-badge">
        <span :class="['rec-badge-dot', { active: recordStore.recordingCount > 0 }]"></span>
        <span class="rec-badge-text">{{ recordStore.recordingCount > 0 ? '录制中' : '待命' }}</span>
      </div>
    </div>

    <div v-if="recordStore.isDurationVisible" class="stats-row">
      <div class="stat-card">
        <div class="stat-glow" style="background: radial-gradient(circle at 50% 0%, rgba(249,115,22,0.12), transparent 70%)"></div>
        <div class="stat-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#f97316" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="#f97316"/></svg>
        </div>
        <div class="stat-value" style="color: #f97316">{{ recordStore.recordingCount }}</div>
        <div class="stat-label">活跃任务</div>
      </div>
      <div class="stat-card">
        <div class="stat-glow" style="background: radial-gradient(circle at 50% 0%, rgba(34,211,238,0.12), transparent 70%)"></div>
        <div class="stat-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="#22d3ee" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="stat-value" style="color: #22d3ee">{{ totalSize }}</div>
        <div class="stat-label">总文件大小</div>
      </div>
      <div class="stat-card">
        <div class="stat-glow" style="background: radial-gradient(circle at 50% 0%, rgba(16,185,129,0.12), transparent 70%)"></div>
        <div class="stat-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#10b981" stroke-width="1.8"/><path d="M12 6v6l4 2" stroke="#10b981" stroke-width="1.8" stroke-linecap="round"/></svg>
        </div>
        <div class="stat-value" style="color: #10b981">{{ activeCount }} / {{ recordStore.recordingItems.length }}</div>
        <div class="stat-label">进行 / 总计</div>
      </div>
    </div>

    <div class="card controls-card">
      <div class="controls-left">
        <n-button
          v-if="recordStore.recordingCount > 0"
          type="error"
          @click="recordStore.stopAll()"
        >
          <template #icon>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>
          </template>
          停止全部录制
        </n-button>
      </div>
      <span class="status-text">{{ recordStore.danmuStatus }}</span>
    </div>

    <div v-if="availableRooms.length > 0" class="card available-section">
      <div class="section-title">可录制直播间</div>
      <div v-for="room in availableRooms" :key="room.enterRoomId" class="avail-row">
        <span class="avail-nick">{{ room.nickname }}</span>
        <span class="avail-id">房间 {{ room.enterRoomId }}</span>
        <span class="avail-status">{{ room.roomStatus === 2 ? '未开播' : '直播中' }}</span>
        <n-select
          v-if="getQualities(room.enterRoomId).length > 1"
          v-model:value="selectedQuality[room.enterRoomId]"
          :options="getQualities(room.enterRoomId)"
          size="tiny"
          style="width: 70px"
          placeholder="画质"
        />
        <n-button size="tiny" type="primary" @click="startWithQuality(room)" :disabled="room.roomStatus === 2">录制</n-button>
      </div>
    </div>

    <div v-if="recordStore.ffmpegMissing" class="ffmpeg-dialog-overlay">
      <div class="ffmpeg-dialog">
        <div class="ffmpeg-dialog-title">未检测到 ffmpeg</div>
        <div class="ffmpeg-dialog-body">录制功能需要 ffmpeg，是否自动下载安装？（约 50MB）</div>
        <div class="ffmpeg-dialog-actions">
          <n-button size="small" @click="recordStore.ffmpegMissing = false">取消</n-button>
          <n-button size="small" type="primary" :loading="recordStore.ffmpegInstalling" @click="recordStore.installFfmpeg()">下载安装</n-button>
        </div>
        <div v-if="recordStore.ffmpegInstalling" class="ffmpeg-progress">
          <div class="ffmpeg-progress-bar"><div class="ffmpeg-progress-fill" :style="{ width: recordStore.ffmpegProgress + '%' }"></div></div>
          <div class="ffmpeg-progress-text">{{ recordStore.ffmpegProgressMsg }}</div>
        </div>
      </div>
    </div>

    <div v-if="recordStore.isDurationVisible" class="recording-list">
      <div
        v-for="item in recordStore.recordingItems"
        :key="item.roomId"
        :class="['card', 'rec-item', { 'rec-item-active': item.isActive }]"
      >
        <div :class="['rec-stripe', { active: item.isActive, stopped: !item.isActive }]"></div>
        <div class="rec-avatar" :style="{ background: avatarGradient(item.roomId) }">
          {{ item.nickname.charAt(0) || '?' }}
        </div>
        <div class="rec-info">
          <div class="rec-name">{{ item.nickname }}</div>
          <div class="rec-room-id">房间 {{ item.roomId }}</div>
        </div>
        <div class="rec-stat-group">
          <div class="rec-stat">
            <div class="stat-label">时长</div>
            <div class="stat-value stat-accent">{{ item.durationText }}</div>
          </div>
          <div class="rec-stat">
            <div class="stat-label">大小</div>
            <div class="stat-value stat-info">{{ item.sizeText }}</div>
          </div>
        </div>
        <div class="rec-status-area">
          <span v-if="item.isActive" class="rec-pulse-dot"></span>
          <span :class="['rec-status-text', { active: item.isActive, error: item.statusText.includes('异常') }]">
            {{ item.statusText }}
          </span>
          <n-button v-if="item.isActive" size="tiny" type="error" quaternary @click="recordStore.stopOne(item.roomId)">停止</n-button>
          <template v-if="!item.isActive">
            <n-button size="tiny" type="primary" quaternary @click="retryRecording(item)" title="新开录制">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polygon points="5,3 19,12 5,21" fill="#f97316"/></svg>
            </n-button>
            <n-button size="tiny" quaternary @click="openFileLocation(item.outputPath)" title="打开文件夹">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="#6b7080" stroke-width="1.8" fill="none"/></svg>
            </n-button>
            <n-button size="tiny" type="error" quaternary @click="confirmDelete(item)" title="删除">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="#ef4444" stroke-width="1.8"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#ef4444" stroke-width="1.8"/></svg>
            </n-button>
          </template>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#2a2d36" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="4" fill="#2a2d36"/>
        </svg>
      </div>
      <div class="empty-title">暂无录制任务</div>
      <div class="empty-hint">在「直播间」页面连接直播间后，点击「全部录制」开始</div>
    </div>

    <div class="history-section">
      <div class="section-title">📼 历史录制</div>
      <div v-if="recordStore.recordingHistory.length === 0" class="empty-hint">暂无录制记录，停止录制后会自动保存</div>
      <div v-for="h in recordStore.recordingHistory" :key="h.outputPath" class="card history-row">
        <span class="hist-nick">{{ h.nickname }}</span>
        <span class="hist-detail">{{ h.durationText }} · {{ h.sizeText }}</span>
        <span class="hist-time">{{ formatTime(h.timestamp) }}</span>
        <div class="hist-actions">
          <n-button size="tiny" quaternary @click="openFileLocation(h.outputPath)" title="打开文件夹">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="#6b7080" stroke-width="1.8" fill="none"/></svg>
          </n-button>
          <n-button size="tiny" type="error" quaternary @click="confirmDeleteHistory(h.roomId)" title="删除">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="#ef4444" stroke-width="1.8"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#ef4444" stroke-width="1.8"/></svg>
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, onMounted } from 'vue'
import { NButton, NSelect, useDialog } from 'naive-ui'
import { useRecordStore } from '../stores/record'
import { useRoomListStore } from '../stores/room-list'
import { formatFileSize } from '../utils/format'

const recordStore = useRecordStore()
const roomList = useRoomListStore()
const dialog = useDialog()
const api = () => (window as any).electronAPI

// Quality state per room
const selectedQuality = reactive<Record<string, string>>({})
const roomQualities = reactive<Record<string, { label: string; value: string }[]>>({})

async function fetchQualities(roomId: string) {
  if (roomQualities[roomId]) return
  try {
    const result = await api().recordGetQualities(roomId)
    if (result.success && result.qualities?.length > 0) {
      roomQualities[roomId] = result.qualities.map((q: any) => ({ label: q.label, value: q.value }))
      selectedQuality[roomId] = result.qualities[0].value
    }
  } catch { /* ignore */ }
}

function getQualities(roomId: string) {
  return roomQualities[roomId] || []
}

function startWithQuality(room: any) {
  recordStore.startRecording({
    enterRoomId: room.enterRoomId,
    nickname: room.nickname,
    quality: selectedQuality[room.enterRoomId] || ''
  })
}

// Fetch qualities for all available rooms
function refreshAllQualities() {
  for (const room of roomList.results) {
    if (!room.error && room.roomStatus !== 2) {
      fetchQualities(room.enterRoomId)
    }
  }
}

onMounted(() => {
  refreshAllQualities()
})

function confirmDelete(item: any) {
  dialog.warning({
    title: '确认删除',
    content: `将删除「${item.nickname}」的录制记录及本地文件，此操作不可撤销。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: () => recordStore.deleteRecording(item)
  })
}

function confirmDeleteHistory(roomId: string) {
  const item = recordStore.recordingHistory.find((h: any) => h.roomId === roomId)
  if (!item) return
  dialog.warning({
    title: '确认删除',
    content: `将删除「${item.nickname}」的录制文件及历史记录。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: () => recordStore.deleteHistoryItem(roomId)
  })
}

function openFileLocation(filePath: string) {
  (window as any).electronAPI.fileOpenLocation(filePath)
}

function retryRecording(item: any) {
  recordStore.startRecording({ enterRoomId: item.roomId, nickname: item.nickname })
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const availableRooms = computed(() => {
  const activeRecordingIds = new Set(recordStore.recordingItems.filter(i => i.isActive).map(i => i.roomId))
  return roomList.results.filter(r => !r.error && !activeRecordingIds.has(r.enterRoomId))
})

const activeCount = computed(() => recordStore.recordingItems.filter(i => i.isActive).length)

const totalSize = computed(() => {
  let bytes = 0
  for (const item of recordStore.recordingItems) {
    const match = item.sizeText.match(/[\d.]+/)
    if (!match) continue
    const num = parseFloat(match[0])
    if (item.sizeText.includes('GB')) bytes += num * 1024 * 1024 * 1024
    else if (item.sizeText.includes('MB')) bytes += num * 1024 * 1024
    else if (item.sizeText.includes('KB')) bytes += num * 1024
    else bytes += num
  }
  return formatFileSize(bytes)
})

function avatarGradient(roomId: string): string {
  const colors = [
    'linear-gradient(135deg, #f97316, #ef4444)',
    'linear-gradient(135deg, #fbbf24, #f97316)',
    'linear-gradient(135deg, #ef4444, #ec4899)',
    'linear-gradient(135deg, #22d3ee, #3b82f6)',
    'linear-gradient(135deg, #10b981, #06b6d4)'
  ]
  let hash = 0
  for (let i = 0; i < roomId.length; i++) hash = roomId.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}
</script>

<style scoped>
.recording-page { padding: 20px 24px 24px; overflow-y: auto; height: 100%; }

.rec-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.rec-title { font-size: 20px; font-weight: 700; color: #e0e2e8; }

.rec-subtitle {
  display: flex;
  gap: 16px;
  margin-top: 4px;
}

.subtitle-text { font-size: 12px; color: #4a4e5e; }
.subtitle-highlight { font-size: 12px; color: #f97316; }

.rec-badge {
  background: #1a1d26;
  border: 1px solid #2a2d36;
  border-radius: 8px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.rec-badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3a3d46;
}

.rec-badge-dot.active {
  background: #ef4444;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
  animation: badge-pulse 2s ease-in-out infinite;
}

@keyframes badge-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.rec-badge-text { font-size: 12px; font-weight: 500; color: #6b7080; }

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.stat-card {
  background: #1a1d26;
  border: 1px solid #1e2028;
  border-radius: 10px;
  padding: 20px 16px;
  text-align: center;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.stat-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  pointer-events: none;
}

.stat-icon {
  position: relative;
  z-index: 1;
  margin-bottom: 8px;
  display: flex;
  justify-content: center;
}

.stat-value {
  position: relative;
  z-index: 1;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.5px;
}

.stat-label {
  position: relative;
  z-index: 1;
  font-size: 11px;
  color: #4a4e5e;
  margin-top: 4px;
  font-weight: 500;
}

.controls-card {
  padding: 12px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.status-text { font-size: 11px; color: #4a4e5e; }

.recording-list { display: flex; flex-direction: column; gap: 8px; }

.rec-item {
  display: flex;
  align-items: center;
  padding: 16px 18px;
  gap: 14px;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}

.rec-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.rec-item-active {
  border-color: rgba(249, 115, 22, 0.15);
}

.rec-stripe {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: #2a2d36;
}

.rec-stripe.active {
  background: linear-gradient(180deg, #f97316, #ef4444);
  box-shadow: 0 0 8px rgba(249, 115, 22, 0.3);
}

.rec-stripe.stopped {
  background: #2a2d36;
}

.rec-avatar {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.rec-info { flex: 1; min-width: 0; }

.rec-name {
  font-size: 14px;
  font-weight: 600;
  color: #e0e2e8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rec-room-id {
  font-size: 11px;
  color: #4a4e5e;
  margin-top: 2px;
}

.rec-stat-group { display: flex; gap: 8px; }

.rec-stat {
  background: #111318;
  border: 1px solid #1e2028;
  border-radius: 8px;
  padding: 8px 14px;
  text-align: center;
  min-width: 85px;
}

.stat-label {
  font-size: 9px;
  color: #4a4e5e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
}

.stat-value { font-size: 15px; font-weight: 700; margin-top: 2px; }
.stat-accent { color: #f97316; }
.stat-info { color: #22d3ee; }

.rec-status-area {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.rec-pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  animation: rec-pulse 1.5s ease-in-out infinite;
}

@keyframes rec-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 4px rgba(16, 185, 129, 0.5); }
  50% { opacity: 0.3; box-shadow: none; }
}

.rec-status-text { font-size: 11px; font-weight: 500; color: #6b7080; }
.rec-status-text.active { color: #10b981; }
.rec-status-text.error { color: #ef4444; }

.empty-state { padding: 60px 0; }

.empty-icon { margin-bottom: 8px; }

.empty-title { font-size: 14px; color: #4a4e5e; font-weight: 500; }
.empty-hint { font-size: 12px; color: #3a3d46; margin-top: 4px; }

.ffmpeg-dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
.ffmpeg-dialog { background: #1a1d26; border: 1px solid #2a2d36; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%; }
.ffmpeg-dialog-title { font-size: 16px; font-weight: 700; color: #e0e2e8; margin-bottom: 8px; }
.ffmpeg-dialog-body { font-size: 13px; color: #8b8fa3; margin-bottom: 16px; line-height: 1.5; }
.ffmpeg-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.ffmpeg-progress { margin-top: 12px; }
.ffmpeg-progress-bar { height: 4px; background: #2a2d36; border-radius: 2px; overflow: hidden; }
.ffmpeg-progress-fill { height: 100%; background: #f97316; transition: width 0.3s; }
.ffmpeg-progress-text { font-size: 11px; color: #6b7080; margin-top: 4px; }

.available-section { padding: 12px 18px; margin-bottom: 12px; }
.section-title { font-size: 12px; font-weight: 600; color: #6b7080; margin-bottom: 8px; }
.avail-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #1e2028; }
.avail-row:last-child { border-bottom: none; }
.avail-nick { font-size: 13px; color: #e0e2e8; font-weight: 500; }
.avail-id { font-size: 11px; color: #4a4e5e; }
.avail-status { font-size: 11px; color: #10b981; margin-left: auto; }

/* History */
.history-section {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #1e2028;
}
.history-row {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  gap: 12px;
  margin-top: 6px;
}
.hist-nick { font-size: 13px; font-weight: 500; color: #e0e2e8; min-width: 80px; }
.hist-detail { font-size: 11px; color: #4a4e5e; flex: 1; }
.hist-time { font-size: 11px; color: #3a3d46; }
.hist-actions { display: flex; gap: 6px; }
</style>
