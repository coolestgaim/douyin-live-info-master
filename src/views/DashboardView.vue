<template>
  <div class="dashboard">
    <div class="dash-header">
      <div>
        <h2 class="dash-title">实时监控大屏</h2>
        <div class="dash-subtitle">
          <span class="subtitle-text">直播间数据实时聚合</span>
          <span v-if="store.roomStats.length > 0" class="subtitle-highlight">监控 {{ store.roomStats.length }} 个直播间</span>
        </div>
      </div>
      <div class="monitor-badge">
        <span :class="['monitor-dot', { active: store.isMonitoring }]"></span>
        <span class="monitor-text">{{ store.monitorTimeText }}</span>
      </div>
    </div>

    <div class="stats-row">
      <div v-for="s in aggregateStats" :key="s.label" class="stat-card">
        <div class="stat-glow" :style="{ background: s.glowColor }"></div>
        <div class="stat-icon" v-html="s.icon"></div>
        <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>

    <div v-if="store.roomStats.length > 0" class="room-cards">
      <div v-for="stats in store.roomStats" :key="stats.roomId" class="room-card">
        <div :class="['room-stripe', { connected: stats.isConnected }]"></div>
        <div class="room-card-body">
          <div class="room-header">
            <div class="room-avatar" :style="{ background: avatarGradient(stats.roomId) }">
              {{ stats.nickname.charAt(0) || '?' }}
            </div>
            <span class="room-name">{{ stats.nickname }}</span>
            <span v-if="stats.isRecording" class="rec-badge">
              <span class="rec-dot"></span>
              {{ stats.recordDurationText }} {{ stats.recordSizeText }}
            </span>
          </div>
          <div class="room-badges">
            <span :class="['live-badge', { offline: stats.roomStatus === 2 }]">
              {{ stats.roomStatus === 2 ? '未开播' : '直播中' }}
            </span>
            <span class="room-stats-text">
              观看 {{ stats.roomViewCount.toLocaleString() }}  ·  点赞 {{ stats.roomLikeCount.toLocaleString() }}
            </span>
          </div>
          <div class="bars">
            <div v-for="bar in getBars(stats)" :key="bar.label" class="bar-row">
              <span class="bar-label">
                <span class="bar-dot" :style="{ background: bar.color }"></span>
                {{ bar.label }}
              </span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: bar.ratio + '%', background: bar.gradient }"></div>
              </div>
              <span class="bar-value">{{ bar.count.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="2" stroke="#2a2d36" stroke-width="1.5"/>
          <rect x="14" y="3" width="7" height="7" rx="2" stroke="#2a2d36" stroke-width="1.5"/>
          <rect x="3" y="14" width="7" height="7" rx="2" stroke="#2a2d36" stroke-width="1.5"/>
          <rect x="14" y="14" width="7" height="7" rx="2" stroke="#2a2d36" stroke-width="1.5"/>
        </svg>
      </div>
      <div class="empty-title">暂无监控中的直播间</div>
      <div class="empty-hint">在「直播间」页面添加并连接直播间后，数据将实时显示在这里</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useDashboardStore, type RoomStatsData } from '../stores/dashboard'
import { useRoomListStore } from '../stores/room-list'

const store = useDashboardStore()
const roomListStore = useRoomListStore()

const aggregateStats = computed(() => [
  { icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#f97316" stroke-width="1.8"/></svg>', label: '弹幕', value: store.totalDanmu.toLocaleString(), color: '#f97316', glowColor: 'radial-gradient(circle at 50% 0%, rgba(249,115,22,0.12), transparent 70%)' },
  { icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5c0-2 1.5-3.5 4.5-3.5s4.5 1.5 4.5 3.5" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>', label: '礼物', value: store.totalGift.toLocaleString(), color: '#fbbf24', glowColor: 'radial-gradient(circle at 50% 0%, rgba(251,191,36,0.12), transparent 70%)' },
  { icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="#ef4444" stroke-width="1.8"/></svg>', label: '点赞', value: store.totalLike.toLocaleString(), color: '#ef4444', glowColor: 'radial-gradient(circle at 50% 0%, rgba(239,68,68,0.12), transparent 70%)' },
  { icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" stroke="#22d3ee" stroke-width="1.8" stroke-linecap="round"/></svg>', label: '进入', value: store.totalMember.toLocaleString(), color: '#22d3ee', glowColor: 'radial-gradient(circle at 50% 0%, rgba(34,211,238,0.12), transparent 70%)' },
  { icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#10b981" stroke-width="1.8" stroke-linecap="round"/></svg>', label: '关注', value: store.totalFollow.toLocaleString(), color: '#10b981', glowColor: 'radial-gradient(circle at 50% 0%, rgba(16,185,129,0.12), transparent 70%)' }
])

function avatarGradient(roomId: string) {
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

function getBars(stats: RoomStatsData) {
  const max = Math.max(1, stats.danmuCount, stats.giftCount, stats.likeCount, stats.memberCount, stats.followCount)
  return [
    { label: '弹幕', count: stats.danmuCount, ratio: stats.danmuCount / max * 100, color: '#f97316', gradient: 'linear-gradient(90deg, #f97316, #fb923c)' },
    { label: '礼物', count: stats.giftCount, ratio: stats.giftCount / max * 100, color: '#fbbf24', gradient: 'linear-gradient(90deg, #fbbf24, #fcd34d)' },
    { label: '点赞', count: stats.likeCount, ratio: stats.likeCount / max * 100, color: '#ef4444', gradient: 'linear-gradient(90deg, #ef4444, #f87171)' },
    { label: '进入', count: stats.memberCount, ratio: stats.memberCount / max * 100, color: '#22d3ee', gradient: 'linear-gradient(90deg, #22d3ee, #67e8f9)' },
    { label: '关注', count: stats.followCount, ratio: stats.followCount / max * 100, color: '#10b981', gradient: 'linear-gradient(90deg, #10b981, #34d399)' }
  ]
}

let intervalId: ReturnType<typeof setInterval> | null = null
let statsIntervalId: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  store.updateRooms(roomListStore.results)
  store.refreshApiStats(roomListStore.results)
  intervalId = setInterval(() => {
    store.updateRooms(roomListStore.results)
  }, 2000)
  statsIntervalId = setInterval(() => {
    store.refreshApiStats(roomListStore.results)
  }, 30000)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
  if (statsIntervalId) clearInterval(statsIntervalId)
})
</script>

<style scoped>
.dashboard {
  padding: 20px 24px 24px;
  overflow-y: auto;
  height: 100%;
}

.dash-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.dash-title {
  font-size: 20px;
  font-weight: 700;
  color: #e0e2e8;
}

.dash-subtitle {
  display: flex;
  gap: 16px;
  margin-top: 4px;
}

.subtitle-text { font-size: 12px; color: #4a4e5e; }
.subtitle-highlight { font-size: 12px; color: #f97316; }

.monitor-badge {
  background: #1a1d26;
  border: 1px solid #2a2d36;
  border-radius: 8px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.monitor-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3a3d46;
}

.monitor-dot.active {
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
}

.monitor-text {
  font-size: 12px;
  font-weight: 500;
  color: #6b7080;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 24px;
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

.room-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 10px;
}

.room-card {
  display: flex;
  background: #1a1d26;
  border-radius: 10px;
  border: 1px solid #1e2028;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}

.room-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.room-stripe {
  width: 3px;
  background: #2a2d36;
  flex-shrink: 0;
}

.room-stripe.connected {
  background: linear-gradient(180deg, #10b981, #059669);
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.3);
}

.room-card-body { flex: 1; padding: 16px 18px; }

.room-header { display: flex; align-items: center; gap: 10px; }
.room-avatar {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.room-name {
  font-size: 14px;
  font-weight: 600;
  color: #e0e2e8;
}

.rec-badge {
  margin-left: auto;
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 10px;
  color: #fbbf24;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.rec-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fbbf24;
  animation: rec-pulse 1.5s ease-in-out infinite;
}

@keyframes rec-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.room-badges {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0 12px 44px;
}

.live-badge {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  color: #10b981;
}

.live-badge.offline {
  background: rgba(107, 112, 128, 0.1);
  border-color: rgba(107, 112, 128, 0.2);
  color: #6b7080;
}

.room-stats-text {
  font-size: 11px;
  color: #4a4e5e;
}

.bars { display: flex; flex-direction: column; gap: 6px; }

.bar-row {
  display: grid;
  grid-template-columns: 40px 1fr 56px;
  align-items: center;
  gap: 0;
}

.bar-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 500;
  color: #6b7080;
}

.bar-dot { width: 5px; height: 5px; border-radius: 50%; }

.bar-track {
  height: 5px;
  background: #111318;
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}

.bar-value {
  font-size: 11px;
  font-weight: 600;
  color: #c0c2c8;
  text-align: right;
}

.empty-state {
  padding: 60px 0;
  font-size: 14px;
}

.empty-icon {
  margin-bottom: 8px;
}

.empty-title {
  font-size: 14px;
  color: #4a4e5e;
  font-weight: 500;
}

.empty-hint {
  font-size: 12px;
  color: #3a3d46;
  margin-top: 4px;
}
</style>
