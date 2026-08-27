<template>
  <div class="replay-page">
    <div class="rp-head">
      <h2 class="rp-title">弹幕回放</h2>
      <div class="rp-sub">视频播放 + 弹幕浮窗滚动（先点击"打开弹幕浮窗"让弹幕在悬浮窗里按时间轴走）</div>
    </div>

    <!-- 工具栏：选择录制文件夹（推荐，自动挂载视频+弹幕） / 历史子文件夹快捷 -->
    <div class="card rp-toolbar">
      <n-button size="small" type="primary" @click="pickReplayFolder" title="选择一个 {nickname}_{时间}/ 文件夹，里面同时有视频和弹幕 CSV，自动挂载并按原始时间轴回放">📂 选择录制文件夹</n-button>
      <n-button size="small" tertiary @click="csvInput?.click()" title="不推荐：先选 CSV 再选视频，需要手动对齐时间">手动导入弹幕 CSV</n-button>
      <input ref="csvInput" type="file" accept=".csv,text/csv" hidden @change="importReplayCsv($event)" />
      <n-button v-if="videoPath || replayItems.length" size="small" @click="pickVideo" title="替换为其他视频文件（需要已导入 CSV 才能对齐）">替换视频</n-button>
      <n-button size="small" type="primary" tertiary @click="openFloating" title="打开弹幕浮窗：回放时弹幕会同步推送到浮窗滚动（效果最接近直播）">🎈 打开弹幕浮窗</n-button>
      <span class="rp-sep"></span>
      <span v-if="replayItems.length" class="rp-meta">{{ replayItems.length }} 条 · {{ formatReplayRange() }}</span>
      <span class="rp-offset">
        偏移
        <input v-model.number="offsetSec" type="number" step="1" class="rp-offset-input" title="弹幕时间轴微调（秒）：正数=弹幕提前出现，负数=推迟；默认 0 时视频第 t 秒 ↔ 录制开始后第 t 秒的弹幕" />
        秒
      </span>
    </div>

    <!-- 历史录制会话（按子文件夹 + 时间倒序）—— 来自录制输出根目录的实时扫描 -->
    <div v-if="historySessions.length" class="rp-history">
      <span class="rp-history-label">历史录制:</span>
      <button
        v-for="h in historySessions.slice(0, 14)"
        :key="h.sessionId"
        :class="['rp-history-chip', { on: h.outputDir === currentSessionDir }]"
        :title="`${h.outputDir}（${h.videoFiles.length} 视频 / ${h.csvFiles.length} 弹幕）`"
        @click="loadFromSession(h)"
      >
        {{ h.nickname }} · {{ h.startTime ? formatStartTime(h.startTime) : h.sessionId }}
        <span v-if="h.videoFiles.length && h.csvFiles.length" class="rp-twin">📹+💬</span>
      </button>
    </div>

    <!-- 视频播放器 -->
    <div class="card rp-player-card">
      <div ref="dmLayerRef" class="rp-video-stage">
        <video
          ref="replayVideo"
          :src="videoLocalUrl"
          class="rp-video"
          @timeupdate="onVideoTime"
          @seeked="onVideoSeek"
          @play="onVideoPlay"
          @pause="onVideoPause"
          @ratechange="onVideoTime"
          @loadedmetadata="onVideoMeta"
        ></video>
        <div v-if="!videoPath" class="rp-stage-empty">
          <div class="rp-empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="13" rx="3" stroke="var(--border-strong)" stroke-width="1.5"/><path d="M8 21h8M12 17v4" stroke="var(--border-strong)" stroke-width="1.5" stroke-linecap="round"/></svg>
          </div>
          <div class="rp-empty-title">点击「📂 选择录制文件夹」开始回放</div>
          <div class="rp-empty-hint">视频下方会有进度时间轴，弹幕按原始时间轴推送到弹幕浮窗滚动（请先点工具栏「🎈 打开弹幕浮窗」）</div>
        </div>
      </div>

      <!-- 自定义控制条 -->
      <div class="rp-controls">
        <button class="rc-btn" @click="toggleVideoPlay" :title="videoPaused ? '播放' : '暂停'">{{ videoPaused ? '▶' : '⏸' }}</button>
        <input type="range" class="rc-range" min="0" max="1000" :value="videoSeekVal" @input="videoSeek($event)" title="进度" />
        <span class="rc-time">{{ fmtVideoTime(videoCur) }} / {{ fmtVideoTime(videoDur) }}</span>
        <button class="rc-btn" @click="toggleVideoMute" :title="videoMuted ? '取消静音' : '静音'">{{ videoMuted ? '🔇' : '🔊' }}</button>
        <select class="rc-rate" :value="videoRate" @change="setVideoRate" title="倍速">
          <option :value="0.5">0.5x</option><option :value="1">1x</option>
          <option :value="1.5">1.5x</option><option :value="2">2x</option>
        </select>
        <button class="rc-btn" @click="toggleFullscreen" title="全屏">⛶</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { NButton, useMessage } from 'naive-ui'

defineOptions({ name: 'DanmuReplayView' })
const message = useMessage()
const api = () => (window as any).electronAPI

// ==== 历史录制会话（来自主进程 scanOutputRoot） ====
interface HistorySession { sessionId: string; nickname: string; startTime: number; outputDir: string; videoFiles: string[]; csvFiles: string[] }
const historySessions = ref<HistorySession[]>([])
const currentSessionDir = ref('')

// ==== 弹幕数据（CSV） ====
// 透传 CSV 里所有字段，方便推送到弹幕浮窗时显示完整文案（如礼物名/礼物数/点赞次数）
interface ReplayMsg {
  time: number; type: string; userName: string; content: string
  giftName?: string; giftCount?: number; giftPrice?: number; likeCount?: number
}
const csvInput = ref<HTMLInputElement | null>(null)
const replayItems = ref<ReplayMsg[]>([])
const offsetSec = ref(0)
let replayBaseTime = 0
let linkedIndex = 0

// ==== 视频 ====
const replayVideo = ref<HTMLVideoElement | null>(null)
const videoPath = ref('')
const videoPaused = ref(true)
const videoCur = ref(0)
const videoDur = ref(0)
const videoMuted = ref(false)
const videoRate = ref<number>(1)
const videoLocalUrl = computed(() => (videoPath.value ? 'local-video:///' + videoPath.value.replace(/\\/g, '/') : ''))
const videoSeekVal = computed(() => (videoDur.value > 0 ? Math.round((videoCur.value / videoDur.value) * 1000) : 0))

async function pickVideo() {
  try {
    const r = await api().pickVideo?.()
    if (!r?.success) return
    videoPath.value = r.path
    resetReplay()
    message.success('已选择视频：播放后弹幕将推送到弹幕浮窗滚动')
  } catch (e: any) {
    message.error('选择视频失败: ' + (e?.message || String(e)))
  }
}

/** 打开弹幕浮窗（回放弹幕实时推送到浮窗滚动，需要先开浮窗才能看到） */
async function openFloating() {
  try {
    await api().floatingOpen?.()
    message.success('弹幕浮窗已打开：回放时弹幕将同步推送过去滚动')
  } catch (e: any) {
    message.error('打开浮窗失败: ' + (e?.message || String(e)))
  }
}

/** 主入口：选择录制会话子文件夹（{nickname}_{时间}/） → 自动匹配视频与 CSV → 立即回放 */
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
  } catch (e: any) {
    message.error('选择失败: ' + (e?.message || String(e)))
  }
}

/** 从历史列表点选 → 同上 */
async function loadFromSession(h: HistorySession) {
  await applySession(h)
}

/** 把一个历史会话应用到当前状态：视频+CSV+偏移 */
async function applySession(s: HistorySession) {
  currentSessionDir.value = s.outputDir
  // 1) 视频：取第一个视频文件（不含 csv 的那个）
  const video = s.videoFiles[0] || ''
  if (!video) {
    message.warning('该录制会话未找到视频文件，仅显示弹幕')
  } else {
    videoPath.value = video
  }
  // 2) 弹幕 CSV：取唯一一个 csv（或第一个）
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
    replayItems.value = items
    if (!items.length) {
      message.warning('CSV 中没有可回放的弹幕')
      resetReplay()
      return
    }
    // ⚠️ 关键：replayBaseTime = 录制会话起始时间戳（ms），视频第 t 秒 ↔ 弹幕时间 <= base + t*1000
    // CSV 里是绝对时间戳，若 base 恒为 0，while 条件永远不成立 → 弹幕一条都不显示
    replayBaseTime = s.startTime || items[0].time
    // 录制与弹幕同时启动，时间轴天然对齐：offset 默认 0，用户可按需微调（视频起点 ≠ 录制起点时）
    offsetSec.value = 0
    // 清空浮窗旧内容：本次回放只滚该文件夹的弹幕，不混直播/上一次回放
    try { api().floatingReplayClear?.() } catch { /* ignore */ }
    resetReplay()
    message.success(`已挂载：${s.nickname} · ${items.length} 条弹幕${video ? '，可播放' : ''}`)
  } catch (e: any) {
    message.error('读取 CSV 失败: ' + (e?.message || String(e)))
  }
}

async function readFileUtf8(p: string): Promise<string> {
  // 优先用主进程 open 失败回退到 fs.readFileSync，electronAPI 暂未暴露文件读取，用 fetch + file:// 又受限
  // 这里借助 fetch 走 local-video 协议的网络支持，但 fetch 不支持 file://，所以用同源 fs 方式：
  // 直接通过 ipc 暴露一个 read-file 方法
  const r = await api().readTextFile?.(p)
  if (r?.success) return r.content
  // 兜底：再尝试 fetch('local-file:///' + 路径)
  try {
    const resp = await fetch('local-video:///' + p.replace(/\\/g, '/'))
    return await resp.text()
  } catch { throw new Error('读取文件失败（请升级版本）') }
}

async function refreshHistorySessions() {
  try {
    const r = await api().recordScanSessions?.()
    if (r?.success) historySessions.value = r.sessions || []
  } catch { /* ignore */ }
}

function formatStartTime(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(() => {
  void refreshHistorySessions()
  // 每次新录制完成时自动刷新列表
  try { api().onRecordSessionFinalized?.(() => { void refreshHistorySessions() }) } catch { /* ignore */ }
})
onBeforeUnmount(() => {
  try { api().removeRecordListeners?.() } catch { /* ignore */ }
})

function resetReplay() {
  linkedIndex = 0
  const v = replayVideo.value
  if (v) { try { v.currentTime = 0 } catch {} }
}

/** 推送回放弹幕到弹幕浮窗（复用直播时浮窗滚动链路：IPC → sendDanmuToFloating）
 *  透传 CSV 里所有字段（giftName/giftCount/likeCount）让浮窗能准确显示礼物/点赞文案 */
function pushToFloating(item: ReplayMsg) {
  try {
    api().floatingReplay?.({
      type: item.type,
      userName: item.userName,
      content: item.content,
      giftName: item.giftName,
      giftCount: item.giftCount,
      likeCount: item.likeCount,
      roomNickname: '',
    })
  } catch { /* ignore */ }
}

// ==== CSV 解析（兼容 BOM/引号转义） ====
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

// db 导出列：时间,类型,用户名,内容,礼物名称,礼物数量,礼物价值,点赞次数,头像URL,主页链接,原始数据
// 将 CSV 二维数组转为 ReplayMsg[]（过滤无效行；按时间排序；Stats 不渲染）
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
    // 列：4=礼物名称 5=礼物数量 6=礼物价值 7=点赞次数（db 导出格式）
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
      // 手动导入模式没有会话起始时间：以第一条弹幕时间作为基准（视频 0 秒对齐第一条弹幕）
      replayBaseTime = items[0].time
      offsetSec.value = 0
      resetReplay()
      replayItems.value = items
      currentSessionDir.value = ''
      message.success(`已导入 ${items.length} 条弹幕，选择视频后播放即可`)
    } catch (err: any) {
      message.error('CSV 解析失败: ' + (err?.message || String(err)))
    }
  }
  reader.onerror = () => message.error('文件读取失败')
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

function formatReplayRange(): string {
  if (!replayItems.value.length) return ''
  const a = new Date(replayItems.value[0].time)
  const b = new Date(replayItems.value[replayItems.value.length - 1].time)
  const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  const totalSec = Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000))
  return `${fmt(a)} ~ ${fmt(b)}（${Math.floor(totalSec / 3600)}h ${Math.floor((totalSec % 3600) / 60)}m ${totalSec % 60}s）`
}

// ==== 联动：视频进度 → 弹幕浮窗 ====（视频上不再叠遮罩，B 站风格被浮窗替代，效果更稳更清晰）
function onVideoTime() {
  const v = replayVideo.value
  if (!v || !replayItems.value.length) return
  videoCur.value = v.currentTime || 0
  const targetMs = v.currentTime * 1000 + offsetSec.value * 1000
  while (linkedIndex < replayItems.value.length && replayItems.value[linkedIndex].time <= replayBaseTime + targetMs) {
    pushToFloating(replayItems.value[linkedIndex])
    linkedIndex++
  }
}

function onVideoSeek() {
  // 拖动进度：跳到新时刻继续推送弹幕
  linkedIndex = 0
  const v = replayVideo.value
  if (!v) return
  const targetMs = v.currentTime * 1000 + offsetSec.value * 1000
  while (linkedIndex < replayItems.value.length && replayItems.value[linkedIndex].time <= replayBaseTime + targetMs) linkedIndex++
  onVideoTime()
}

function onVideoPlay() {
  videoPaused.value = false
  const v = replayVideo.value
  if (v && v.currentTime < 0.3) { linkedIndex = 0 }
}

function onVideoPause() {
  videoPaused.value = true
}

function onVideoMeta() {
  const v = replayVideo.value
  if (!v) return
  videoDur.value = v.duration || 0
  videoCur.value = v.currentTime || 0
}

// ==== 自定义控制条 ====
function toggleVideoPlay() {
  const v = replayVideo.value
  if (!v) return
  if (v.paused) void v.play()
  else v.pause()
}
function toggleVideoMute() {
  const v = replayVideo.value
  if (!v) return
  v.muted = !v.muted
  videoMuted.value = v.muted
}
function setVideoRate(e: Event) {
  const v = replayVideo.value
  if (!v) return
  v.playbackRate = parseFloat((e.target as HTMLSelectElement).value) || 1
  videoRate.value = v.playbackRate
  onVideoTime()
}
function videoSeek(e: Event) {
  const v = replayVideo.value
  if (!v || !videoDur.value) return
  v.currentTime = (parseFloat((e.target as HTMLInputElement).value) / 1000) * videoDur.value
  videoCur.value = v.currentTime
}
function toggleFullscreen() {
  const v = replayVideo.value
  if (!v) return
  if (document.fullscreenElement) void document.exitFullscreen()
  else void v.requestFullscreen?.()
}
function fmtVideoTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

onBeforeUnmount(() => {
  // 弹幕遮罩代码已删，不再需要清理
})
</script>

<style scoped>
.replay-page { padding: 16px 20px 20px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.rp-head { display: flex; align-items: baseline; gap: 12px; flex-shrink: 0; }
.rp-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; }
.rp-sub { font-size: 11px; color: var(--text-faint); }

.rp-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0; }
.rp-sep { width: 1px; height: 18px; background: var(--border-default); margin: 0 2px; }
.rp-check { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-secondary); cursor: pointer; }
.rp-check input { cursor: pointer; }
.rp-label { font-size: 11px; color: var(--text-faint); }
.rp-select { background: var(--bg-track); border: 1px solid var(--border-strong); color: var(--text-secondary); font-size: 11px; border-radius: 5px; padding: 2px 4px; font-family: inherit; outline: none; cursor: pointer; }
.rp-meta { font-size: 11px; color: var(--text-faint); }
.rp-offset { font-size: 11px; color: var(--text-faint); display: inline-flex; align-items: center; gap: 4px; }
.rp-offset-input { width: 56px; background: var(--bg-track); border: 1px solid var(--border-strong); border-radius: 4px; color: var(--text-primary); padding: 2px 6px; font-size: 11px; font-family: inherit; outline: none; }
.rp-offset-input:focus { border-color: var(--primary); }

.rp-history { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
.rp-history-label { font-size: 11px; color: var(--text-faint); }
.rp-history-chip {
  font-size: 11px; padding: 2px 10px; border-radius: 12px; cursor: pointer; font-family: inherit;
  border: 1px solid var(--border-strong); background: transparent; color: var(--text-secondary);
}
.rp-history-chip:hover { border-color: var(--primary); color: var(--text-primary); }
.rp-history-chip.on { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }

/* 视频播放器舞台（弹幕遮罩已移除，v2.9.22 起改用弹幕浮窗） */
.rp-player-card { padding: 10px; flex-shrink: 0; }
.rp-video-stage { position: relative; width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 8px 8px 0 0; overflow: hidden; }
.rp-video { width: 100%; height: 100%; display: block; background: #000; }
.rp-stage-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  background: var(--bg-elevated, #14161c);
}
.rp-empty-title { font-size: 13px; color: var(--text-secondary); }
.rp-empty-hint { font-size: 11px; color: var(--text-faint); }

/* 控制条（暗色） */
.rp-controls {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px;
  background: var(--bg-elevated, #1a1d24); border: 1px solid var(--border-default);
  border-radius: 0 0 8px 8px; border-top: none;
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
