<template>
  <div class="replay-page">
    <div class="rp-head">
      <h2 class="rp-title">回放</h2>
      <div class="rp-sub">视频播放 + 视频下方长条弹幕带匀速滚动（视频播完弹幕正好滚完，CSV/录制历史快捷进入）</div>
    </div>

    <!-- 工具栏 -->
    <div class="card rp-toolbar">
      <n-button size="small" type="primary" @click="pickReplayFolder" title="选择一个 {昵称}_{时间}/ 文件夹，自动挂载视频+CSV">📂 选择录制文件夹</n-button>
      <n-button size="small" tertiary @click="csvInput?.click()" title="先选 CSV 再选视频（手动对齐）">手动导入弹幕 CSV</n-button>
      <input ref="csvInput" type="file" accept=".csv,text/csv" hidden @change="importReplayCsv($event)" />
      <n-button v-if="currentSessionDir" size="small" @click="pickVideo" title="替换视频文件">替换视频</n-button>
      <n-button v-if="videoPath || replayItems.length" size="tiny" type="error" quaternary @click="clearAll">清空</n-button>
      <span class="rp-sep"></span>
      <span v-if="replayItems.length" class="rp-meta">{{ replayItems.length }} 条弹幕 · {{ danmuTotalSec }}s</span>
    </div>

    <!-- 历史录制下拉菜单（v2.9.29；v2.21.0 美化） -->
    <div class="rp-history-dropdown">
      <button
        type="button"
        :class="['rp-history-trigger', { open: historyOpen }]"
        :disabled="!historySessions.length"
        :title="historySessions.length ? '查看历史录制会话' : '暂无历史录制'"
        @click="historyOpen = !historyOpen"
      >
        <span>📂 历史录制</span>
        <span class="rhp-count-badge">{{ historySessions.length }}</span>
        <span class="rhp-caret">▾</span>
      </button>
      <div v-if="historyOpen" class="rp-hist-overlay" @click.self="historyOpen = false">
        <div class="rp-hist-panel">
          <div class="rhp-head">
            <span>历史录制会话</span>
            <button class="rhp-close" @click="historyOpen = false">×</button>
          </div>
          <div v-if="!historySessions.length" class="rhp-empty">暂无历史录制</div>
          <div v-else class="rhp-list">
            <div
              v-for="h in historySessions"
              :key="h.sessionId"
              :class="['rhp-row', { on: h.outputDir === currentSessionDir }]"
              :title="`${h.outputDir}\n${h.videoFiles.length} 视频 / ${h.csvFiles.length} 弹幕`"
            >
              <div class="rhp-info" @click="loadFromSession(h); historyOpen = false">
                <span class="rhp-name">{{ h.nickname || `房间 ${h.sessionId}` }}</span>
                <span class="rhp-time">{{ h.startTime ? formatStartTime(h.startTime) : h.sessionId }}</span>
                <span v-if="h.videoFiles.length && h.csvFiles.length" class="rhp-twin">📹+💬</span>
              </div>
              <div class="rhp-actions">
                <button class="rhp-btn" @click.stop="openSessionFolder(h.outputDir)" title="打开文件夹">📂</button>
                <button class="rhp-btn danger" @click.stop="deleteSession(h)" title="删除整次录制">🗑</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 播放器 + 右侧竖向弹幕条（平行布局，v2.9.27） -->
    <div class="rp-layout">
      <!-- 左：视频播放器 -->
      <div ref="playerCard" class="card rp-player-card">
        <div class="rp-video-stage">
          <video
            ref="replayVideo"
            :src="videoLocalUrl"
            class="rp-video"
            @timeupdate="onTimeUpdate"
            @seeked="onSeek"
            @play="onPlay"
            @pause="onPause"
            @ratechange="onTimeUpdate"
            @loadedmetadata="onMeta"
          ></video>
          <div v-if="!videoPath" class="rp-stage-empty">
            <div class="rp-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="13" rx="3" stroke="var(--border-strong)" stroke-width="1.5"/><path d="M8 21h8M12 17v4" stroke="var(--border-strong)" stroke-width="1.5" stroke-linecap="round"/></svg>
            </div>
            <div class="rp-empty-title">点击「📂 选择录制文件夹」或上方「历史录制」chip 开始回放</div>
            <div class="rp-empty-hint">CSV 弹幕按视频时间在右侧弹幕条逐条向上滚动</div>
          </div>
        </div>
        <!-- 自定义控制条 -->
        <div class="rp-controls">
          <button class="rc-btn" @click="togglePlay" :title="videoPaused ? '播放' : '暂停'">{{ videoPaused ? '▶' : '⏸' }}</button>
          <input type="range" class="rc-range" min="0" max="1000" :value="videoSeekVal" @input="videoSeek($event)" title="进度" />
          <span class="rc-time">{{ fmtVideoTime(videoCur) }} / {{ fmtVideoTime(videoDur) }}</span>
          <button class="rc-btn" @click="toggleMute" :title="videoMuted ? '取消静音' : '静音'">{{ videoMuted ? '🔇' : '🔊' }}</button>
          <select class="rc-rate" :value="videoRate" @change="setRate" title="倍速">
            <option :value="0.5">0.5x</option><option :value="1">1x</option><option :value="1.5">1.5x</option><option :value="2">2x</option>
          </select>
          <button class="rc-btn" @click="toggleFs" title="全屏">⛶</button>
        </div>
      </div>

      <!-- 右：竖向弹幕条（与视频同高，平行） -->
      <div ref="danmuPanel" class="card rp-danmu-panel">
        <div class="dp-head">
          <span class="dp-title">回放弹幕</span>
          <div class="dp-filters">
            <button :class="['dp-chip', { on: dmFilter === 'all' }]" @click="dmFilter = 'all'">全部</button>
            <button :class="['dp-chip', { on: dmFilter === 'chat' }]" @click="dmFilter = 'chat'">弹幕</button>
          </div>
        </div>
        <div class="dp-list">
          <DanmuList :messages="filteredReplayMsgs" empty="暂无弹幕，选择录制会话后播放视频" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { NButton, useMessage } from 'naive-ui'
import DanmuList from '../components/DanmuList.vue'

defineOptions({ name: 'DanmuReplayView' })
const message = useMessage()
const api = () => (window as any).electronAPI

// ==== 历史录制会话 ====
interface HistorySession { sessionId: string; nickname: string; startTime: number; outputDir: string; videoFiles: string[]; csvFiles: string[] }
const historySessions = ref<HistorySession[]>([])
const currentSessionDir = ref('')

// ==== 弹幕数据（CSV） ====
interface ReplayMsg {
  time: number; type: string; userName: string; content: string
  giftName?: string; giftCount?: number; giftPrice?: number; likeCount?: number
}
const csvInput = ref<HTMLInputElement | null>(null)
const replayItems = ref<ReplayMsg[]>([])  // 已按 time 升序
// 视频起点对应的"弹幕基准时间"（ms），让视频 0s ↔ 弹幕 baseTime（对齐录制开始）
const replayBaseTime = ref(0)
const offsetSec = ref(0)  // 用户手动偏移（秒），正=弹幕提前

// ==== 视频 ====
const replayVideo = ref<HTMLVideoElement | null>(null)
const videoPath = ref('')
// 高度同步：整个左侧播放器卡片（视频+控制条）= 右侧弹幕条整高（v2.9.29，按红框对齐）
const playerCard = ref<HTMLElement | null>(null)
const danmuPanel = ref<HTMLElement | null>(null)
let heightObserver: ResizeObserver | null = null
const historyOpen = ref(false)
const videoPaused = ref(true)
const videoCur = ref(0)
const videoDur = ref(0)
const videoMuted = ref(false)
const videoRate = ref<number>(1)
const videoLocalUrl = computed(() => (videoPath.value ? 'local-video:///' + videoPath.value.replace(/\\/g, '/') : ''))
const videoSeekVal = computed(() => (videoDur.value > 0 ? Math.round((videoCur.value / videoDur.value) * 1000) : 0))

// ==== 右侧竖向弹幕条（v2.9.27：平行布局，跟弹幕功能区一致，只有"全部/弹幕"两个筛选） ====
const dmFilter = ref<'all' | 'chat'>('all')
// 已进入列表的弹幕（按视频时间逐条 push，unshift 保持最新在上）
const replayMsgs = ref<any[]>([])
let replayCursor = 0  // replayItems 中已消费到的下标
const filteredReplayMsgs = computed(() => {
  if (dmFilter.value === 'chat') return replayMsgs.value.filter(m => m.type === 'Chat')
  return replayMsgs.value
})

// ==== 右侧竖向弹幕条 ====
// （弹幕数据在「弹幕数据（CSV）」区上方定义：dmFilter / replayMsgs / replayCursor / filteredReplayMsgs）

/** 弹幕带总时长 = 视频总时长；用于"视频播完弹幕正好滚完" */
const danmuTotalSec = computed(() => {
  if (!videoDur.value) return Math.round((replayItems.value.at(-1)?.time ?? 0 - (replayItems.value[0]?.time ?? 0)) / 1000)
  return Math.round(videoDur.value)
})

async function pickVideo() {
  try {
    const r = await api().pickVideo?.()
    if (!r?.success) return
    videoPath.value = r.path
    currentSessionDir.value = ''
    resetReplay()
    message.success('已选择视频：播放后下方弹幕带开始滚动')
  } catch (e: any) { message.error('选择视频失败: ' + (e?.message || String(e))) }
}

async function pickReplayFolder() {
  try {
    const r = await api().pickReplayFolder?.()
    if (!r?.success) return
    if (!r.videoFiles?.length && !r.csvFiles?.length) {
      message.warning('该文件夹内未找到视频或弹幕 CSV')
      return
    }
    await applySession({
      sessionId: r.sessionId,
      nickname: r.nickname,
      startTime: r.startTime,
      outputDir: r.folder,
      videoFiles: r.videoFiles || [],
      csvFiles: r.csvFiles || [],
    })
    void refreshHistorySessions()
  } catch (e: any) { message.error('选择失败: ' + (e?.message || String(e))) }
}

async function loadFromSession(h: HistorySession) { await applySession(h) }

async function applySession(s: HistorySession) {
  currentSessionDir.value = s.outputDir
  const video = s.videoFiles[0] || ''
  if (!video) { message.warning('该录制会话未找到视频文件') }
  else { videoPath.value = video }
  const csv = s.csvFiles[0] || ''
  if (!csv) {
    replayItems.value = []
    message.warning('该录制会话未找到弹幕 CSV，仅显示视频')
    resetReplay()
    return
  }
  try {
    const text = await readFileUtf8(csv)
    const rows = parseCsvText(text)
    const items = csvRowsToReplayItems(rows)
    if (!items.length) { message.warning('CSV 中没有可回放的弹幕'); resetReplay(); return }
    replayItems.value = items
    // 基准 = 录制会话起始时间戳；用户在「偏移」可微调
    replayBaseTime.value = s.startTime || items[0].time
    offsetSec.value = 0
    resetReplay()
    message.success(`已挂载：${s.nickname} · ${items.length} 条弹幕${video ? '，可播放' : ''}`)
  } catch (e: any) { message.error('读取 CSV 失败: ' + (e?.message || String(e))) }
}

async function readFileUtf8(p: string): Promise<string> {
  const r = await api().readTextFile?.(p)
  if (r?.success) return r.content
  try { const resp = await fetch('local-video:///' + p.replace(/\\/g, '/')); return await resp.text() } catch { throw new Error('读取文件失败（请升级版本）') }
}

async function refreshHistorySessions() {
  try { const r = await api().recordScanSessions?.(); if (r?.success) historySessions.value = r.sessions || [] } catch { /* ignore */ }
}

function formatStartTime(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(() => {
  void refreshHistorySessions()
  try { api().onRecordSessionFinalized?.(() => { void refreshHistorySessions() }) } catch { /* ignore */ }
  // 视频画面与右侧弹幕条高度严格一致（v2.9.29：红框覆盖整个播放器卡片 = 弹幕条整高）
  if (typeof ResizeObserver !== 'undefined') {
    heightObserver = new ResizeObserver(() => {
      const h = playerCard.value?.offsetHeight
      if (h && danmuPanel.value && Math.abs(danmuPanel.value.offsetHeight - h) > 1) {
        danmuPanel.value.style.height = h + 'px'
      }
    })
    if (playerCard.value) heightObserver.observe(playerCard.value)
  }
})
onBeforeUnmount(() => {
  heightObserver?.disconnect()
  heightObserver = null
  try { api().removeRecordListeners?.() } catch { /* ignore */ }
})

function clearAll() {
  replayItems.value = []
  videoPath.value = ''
  currentSessionDir.value = ''
  replayBaseTime.value = 0
  offsetSec.value = 0
  replayMsgs.value = []
  replayCursor = 0
  resetReplay()
  void refreshHistorySessions()
}

function resetReplay() {
  replayMsgs.value = []
  replayCursor = 0
  const v = replayVideo.value
  if (v) { try { v.currentTime = 0 } catch {} }
  videoCur.value = 0
}

// ==== CSV 解析（同 v2.9.25） ====
function parseCsvText(text: string): string[][] {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false }
      else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

function csvRowsToReplayItems(rows: string[][]): ReplayMsg[] {
  const items: ReplayMsg[] = []
  for (const r of rows) {
    if (r.length < 4) continue
    const time = Date.parse((r[0] || '').replace(' ', 'T'))
    if (Number.isNaN(time)) continue
    const type = (r[1] || 'Chat').trim()
    if (type === 'Stats') continue
    const userName = (r[2] || '观众').trim()
    let content = (r[3] || '').trim()
    const giftName = (r[4] || '').trim()
    const giftCount = parseInt(r[5] || '0', 10) || 0
    const giftPrice = parseInt(r[6] || '0', 10) || 0
    const likeCount = parseInt(r[7] || '1', 10) || 1
    if (type === 'Gift') content = `送出 ${(giftName || '礼物').trim()} x${giftCount || 1}`
    else if (type === 'Member') content = '进入直播间'
    else if (type === 'Social') content = '关注了主播'
    else if (type === 'Like') content = `点赞 x${likeCount}`
    if (!content) continue
    items.push({ time, type, userName, content, giftName, giftCount, giftPrice, likeCount })
  }
  items.sort((a, b) => a.time - b.time)
  return items
}

function importReplayCsv(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const rows = parseCsvText(String(reader.result || ''))
      const items = csvRowsToReplayItems(rows)
      if (!items.length) { message.warning('CSV 中没有可回放的弹幕'); return }
      replayItems.value = items
      replayBaseTime.value = items[0].time
      offsetSec.value = 0
      currentSessionDir.value = ''
      resetReplay()
      message.success(`已导入 ${items.length} 条弹幕，选择视频后播放即可`)
    } catch (err: any) { message.error('CSV 解析失败: ' + (err?.message || String(err))) }
  }
  reader.onerror = () => message.error('文件读取失败')
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

// ==== 历史 chip 操作 ====
function openSessionFolder(dir: string) {
  api().fileOpenLocation?.(dir)
}
function deleteSession(h: HistorySession) {
  // 二次确认（用 native confirm 避免再引 dialog）
  // eslint-disable-next-line no-alert
  if (!confirm(`确认删除本次录制？\n${h.outputDir}\n将删除整个文件夹（视频+弹幕 CSV）`)) return
  api().fileDeleteDir?.(h.outputDir)
  historySessions.value = historySessions.value.filter(x => x.outputDir !== h.outputDir)
  if (currentSessionDir.value === h.outputDir) clearAll()
  message.success('已删除')
}

// ==== 联动：视频进度 → 右侧竖向弹幕条（v2.9.27：逐条按时间 push，最新在上，与弹幕功能区一致） ====
function onTimeUpdate() {
  const v = replayVideo.value
  if (!v || !replayItems.value.length) return
  videoCur.value = v.currentTime || 0
  pushReplayToNow(v.currentTime)
}
function onSeek() {
  const v = replayVideo.value
  if (!v) return
  videoCur.value = v.currentTime || 0
  // 拖动进度：重建列表（回放到新时刻为止的弹幕）
  replayCursor = 0
  replayMsgs.value = []
  pushReplayToNow(v.currentTime)
}
function onPlay() { videoPaused.value = false }
function onPause() { videoPaused.value = true }
function onMeta() { const v = replayVideo.value; if (!v) return; videoDur.value = v.duration || 0; onSeek() }

/** 把 <= 当前视频时间对应的弹幕都 push 进右侧列表（逐条、最新在上） */
function pushReplayToNow(vCur: number) {
  const items = replayItems.value
  if (!items.length) return
  const vDur = replayVideo.value?.duration || 0
  const first = items[0].time
  const last = items[items.length - 1].time
  const danmuTotalMs = Math.max(1, last - first)
  const offsetMs = (offsetSec.value || 0) * 1000
  // 当前视频时刻对应的弹幕绝对时间：视频 0s ↔ 第一条；视频播完 ↔ 最后一条
  const targetMs = vDur > 0 ? first + (vCur / vDur) * danmuTotalMs + offsetMs : first + vCur * 1000 + offsetMs
  const pushList: any[] = []
  while (replayCursor < items.length && items[replayCursor].time <= targetMs) {
    const it = items[replayCursor]
    if (it.content) {
      pushList.push({
        type: it.type,
        userName: it.userName,
        content: it.content,
        giftName: it.giftName || '',
        giftCount: it.giftCount || 0,
        giftPrice: it.giftPrice || 0,
        likeCount: it.likeCount || 0,
        time: new Date(it.time).toLocaleTimeString('zh-CN', { hour12: false }),
        totalUser: 0, totalLike: 0, roomName: '', avatar: '', profileUrl: '',
      })
    }
    replayCursor++
  }
  if (pushList.length) {
    // 最新在上（unshift），最多保留 800 条
    replayMsgs.value = [...pushList.reverse(), ...replayMsgs.value].slice(0, 800)
  }
}

// ==== 自定义控制条 ====
function togglePlay() { const v = replayVideo.value; if (!v) return; if (v.paused) void v.play(); else v.pause() }
function toggleMute() { const v = replayVideo.value; if (!v) return; v.muted = !v.muted; videoMuted.value = v.muted }
function setRate(e: Event) { const v = replayVideo.value; if (!v) return; v.playbackRate = parseFloat((e.target as HTMLSelectElement).value) || 1; videoRate.value = v.playbackRate }
function videoSeek(e: Event) { const v = replayVideo.value; if (!v || !videoDur.value) return; v.currentTime = (parseFloat((e.target as HTMLInputElement).value) / 1000) * videoDur.value; videoCur.value = v.currentTime }
function toggleFs() { const v = replayVideo.value; if (!v) return; if (document.fullscreenElement) void document.exitFullscreen(); else void v.requestFullscreen?.() }
function fmtVideoTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
</script>

<style scoped>
.replay-page { padding: 16px 20px 20px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.rp-head { display: flex; align-items: baseline; gap: 12px; flex-shrink: 0; }
.rp-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; }
.rp-sub { font-size: 11px; color: var(--text-faint); }
.rp-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0; }
.rp-sep { width: 1px; height: 18px; background: var(--border-default); margin: 0 2px; }
.rp-meta { font-size: 11px; color: var(--text-faint); }

/* 历史录制下拉菜单（v2.9.29；v2.21.0 美化：更大气 + 选中色条 + 徽章） */
.rp-history-dropdown { position: relative; flex-shrink: 0; }
.rp-history-trigger {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; padding: 4px 12px; height: 28px;
  background: var(--bg-elevated, #1a1d24);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  border-radius: 6px; cursor: pointer; font-family: inherit;
  transition: all .15s;
}
.rp-history-trigger:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
}
.rp-history-trigger:disabled { opacity: 0.5; cursor: not-allowed; }
.rp-history-trigger.open { border-color: var(--primary); color: var(--primary); }
.rhp-count-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 16px; padding: 0 5px;
  background: var(--primary); color: #fff;
  font-size: 10px; font-weight: 600; border-radius: 8px;
  line-height: 1;
}
.rp-history-trigger .rhp-caret { font-size: 10px; opacity: 0.6; transition: transform .15s; }
.rp-history-trigger.open .rhp-caret { transform: rotate(180deg); }

.rp-hist-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: transparent;  /* 透明遮罩，仅用于捕获外部点击关闭 */
  display: flex; align-items: flex-start; justify-content: flex-start;
}
.rp-hist-panel {
  margin-top: 56px; margin-left: 220px;  /* 弹在侧边栏右侧、顶栏下方 */
  width: 560px; max-height: 580px;
  background: var(--bg-elevated, #1a1d24);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02);
  display: flex; flex-direction: column; overflow: hidden;
}
.rhp-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  background: linear-gradient(180deg, var(--bg-elevated, #1a1d24) 0%, transparent 100%);
  border-bottom: 1px solid var(--border-default);
  font-size: 13px; font-weight: 600; color: var(--text-primary);
}
.rhp-head .rhp-head-title { display: inline-flex; align-items: center; gap: 8px; }
.rhp-head .rhp-head-title::before { content: '📂'; font-size: 14px; }
.rhp-close {
  background: transparent; border: none; color: var(--text-faint);
  font-size: 18px; cursor: pointer; padding: 2px 6px; line-height: 1;
  border-radius: 4px; transition: all .12s;
}
.rhp-close:hover { color: var(--text-primary); background: var(--bg-active); }
.rhp-empty { padding: 48px; text-align: center; color: var(--text-faint); font-size: 12px; }
.rhp-list { flex: 1; overflow-y: auto; padding: 8px 10px; }
.rhp-list::-webkit-scrollbar { width: 8px; }
.rhp-list::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 4px; }
.rhp-list::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }
.rhp-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; margin-bottom: 4px; border-radius: 8px;
  position: relative; transition: background .12s;
}
.rhp-row:last-child { margin-bottom: 0; }
.rhp-row:hover { background: var(--bg-active); }
.rhp-row.on {
  background: linear-gradient(90deg, var(--primary-soft, rgba(240,80,110,0.12)) 0%, transparent 80%);
  box-shadow: inset 3px 0 0 var(--primary);
}
.rhp-info {
  flex: 1; display: flex; align-items: center; gap: 8px; cursor: pointer; min-width: 0;
}
.rhp-name {
  font-size: 13px; font-weight: 500; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 200px;
}
.rhp-time {
  font-size: 11px; color: var(--text-faint);
  font-family: var(--font-mono, ui-monospace, monospace);
}
.rhp-twin {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; padding: 2px 7px; border-radius: 10px;
  background: var(--bg-track); color: var(--text-secondary);
  border: 1px solid var(--border-default);
  font-weight: 500;
}
.rhp-actions { display: flex; gap: 6px; flex-shrink: 0; }
.rhp-btn {
  background: transparent;
  border: 1px solid var(--border-default);
  color: var(--text-faint);
  width: 26px; height: 24px; border-radius: 5px;
  cursor: pointer; font-family: inherit; font-size: 13px;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all .12s;
}
.rhp-btn:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }
.rhp-btn.danger:hover { border-color: var(--danger); color: var(--danger); background: rgba(229,72,77,0.08); }

/* 左右布局：左=视频播放器，右=竖向弹幕条（平行） */
.rp-layout { display: flex; gap: 10px; align-items: flex-start; flex-shrink: 0; }
.rp-player-card { padding: 10px; flex: 1; min-width: 0; }
.rp-video-stage { position: relative; width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 8px 8px 0 0; overflow: hidden; }
.rp-video { width: 100%; height: 100%; display: block; background: #000; }
.rp-stage-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  background: var(--bg-elevated, #14161c);
}
.rp-empty-title { font-size: 13px; color: var(--text-secondary); }
.rp-empty-hint { font-size: 11px; color: var(--text-faint); }

/* 右侧竖向弹幕条（与视频同高平行，跟弹幕功能区一致；高度由 ResizeObserver 同步视频画面高度） */
.rp-danmu-panel {
  width: 340px; flex-shrink: 0; display: flex; flex-direction: column;
  padding: 0; overflow: hidden; border-radius: 8px;
}
.rp-danmu-panel .dp-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--border-default); flex-shrink: 0;
}
.rp-danmu-panel .dp-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.rp-danmu-panel .dp-filters { display: flex; gap: 4px; }
.rp-danmu-panel .dp-chip {
  background: transparent; border: 1px solid var(--border-strong); color: var(--text-secondary);
  font-size: 11px; padding: 2px 10px; border-radius: 10px; cursor: pointer; font-family: inherit;
}
.rp-danmu-panel .dp-chip:hover { border-color: var(--primary); color: var(--text-primary); }
.rp-danmu-panel .dp-chip.on { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.rp-danmu-panel .dp-list { flex: 1; min-height: 0; overflow: hidden; }

/* 控制条 */
.rp-controls {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px;
  background: var(--bg-elevated, #1a1d24); border: 1px solid var(--border-default);
  border-radius: 0 0 8px 8px; border-top: 1px solid var(--border-default);
  margin-top: 6px;
}
.rc-btn {
  background: transparent; border: 1px solid var(--border-strong); color: var(--text-secondary);
  font-size: 12px; width: 28px; height: 24px; border-radius: 5px; cursor: pointer; font-family: inherit; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
}
.rc-btn:hover { border-color: var(--primary); color: var(--text-primary); }
.rc-range { flex: 1; height: 4px; accent-color: var(--primary); cursor: pointer; min-width: 60px; }
.rc-time { font-size: 11px; color: var(--text-faint); font-family: var(--font-mono, monospace); white-space: nowrap; }
.rc-rate { background: var(--bg-track); border: 1px solid var(--border-strong); color: var(--text-secondary); font-size: 11px; border-radius: 5px; padding: 2px 4px; font-family: inherit; outline: none; cursor: pointer; }
</style>
