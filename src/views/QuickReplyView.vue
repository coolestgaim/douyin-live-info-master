<template>
  <div class="qr-page">
    <div class="qr-header">
      <span class="qr-title">快捷回复</span>
      <button class="qr-add-btn" @click="addInstance()">+ 添加实例</button>
    </div>

    <div class="qr-scroll" v-if="store.instances.length > 0">
      <div v-for="inst in store.instances" :key="inst.id" class="card qr-phone" :style="phoneStyle(inst.id)">
        <!-- 实例顶栏 -->
        <div class="qr-topbar">
          <input v-model="inst.name" class="qr-name" placeholder="实例名称" />
          <span :class="['qr-inst-status', { on: inst.status === 'running' }]">
            <span class="qr-inst-dot"></span>
            {{ inst.status === 'running' ? '运行中' : '已停止' }}
          </span>
          <div class="qr-top-actions">
            <button v-if="store.instances.length > 1" class="qr-top-btn qr-del-i" @click="doRemoveInstance(inst)">×</button>
          </div>
        </div>

        <!-- URL + 操作行 -->
        <div class="qr-urlbar">
          <input v-model="inst.roomUrl" class="qr-url" placeholder="直播间链接" @keyup.enter="loadWebview(inst)" />
          <button :class="['qr-sm-btn', inst.status === 'running' ? 'qr-sm-danger' : 'qr-sm-pri']"
            @click="inst.status === 'running' ? closeWebview(inst) : loadWebview(inst)">
            {{ inst.status === 'running' ? '关闭' : '加载' }}
          </button>
          <!-- 更多功能下拉 -->
          <div class="qr-more" @click.stop>
            <button v-if="inst.status === 'running'" class="qr-sm-btn qr-more-btn" :class="{ open: moreOpenId === inst.id }"
              @click="moreOpenId = moreOpenId === inst.id ? null : inst.id" title="更多功能">⚙</button>
            <div v-if="moreOpenId === inst.id" class="qr-more-panel">
              <div class="qr-zoom-row">
                <span class="qr-zoom-label">缩放</span>
                <input type="range" class="qr-zoom-slider" min="10" max="300" step="10"
                  :value="Math.round(inst.zoom * 100)"
                  @input="onZoomSlider(inst, ($event.target as HTMLInputElement).value)"
                  title="拖动调整网页缩放" />
                <span class="qr-zoom-val">{{ Math.round(inst.zoom * 100) }}%</span>
                <button class="qr-sm-btn" @click="resetZoom(inst)" title="重置为 100%">重置</button>
              </div>
              <div class="qr-more-row">
                <button class="qr-sm-btn" @click="zoomOut(inst)" title="缩小页面">−</button>
                <button class="qr-sm-btn" @click="zoomIn(inst)" title="放大页面">+</button>
              </div>
              <button class="qr-more-item qr-sm-live" :class="{ on: inst.liveMode }" @click="toggleLive(inst)"
                :title="inst.liveMode ? '退出直播画面模式，回到快捷回复' : '直播画面精简模式：隐藏聊天区，只看直播'">{{ inst.liveMode ? '✓ 直播模式' : '直播画面模式' }}</button>
              <button class="qr-more-item" @click="toggleStripped(inst)"
                :title="inst._stripped ? '恢复全部元素' : '精简模式'">{{ inst._stripped ? '恢复全部元素' : '精简模式' }}</button>
              <button class="qr-more-item" @click="refreshWebview(inst)">刷新网页</button>
              <button class="qr-more-item qr-more-danger" @click="clearLogin(inst)">清除登录</button>
              <button class="qr-more-item qr-more-danger" @click="clearCache(inst)" title="清掉 cookie/缓存，下次重新登录">清空缓存</button>
            </div>
          </div>
        </div>

        <!-- 历史直播间快捷填入（长按拖拽排序） -->
        <div v-if="roomListStore.roomHistory.length > 0" class="qr-history">
          <span class="qr-history-label">历史:</span>
          <button
            v-for="(h, idx) in roomListStore.roomHistory"
            :key="h.url"
            class="qr-history-chip"
            :class="{ dragging: dragIdx === idx }"
            :style="dragIdx === idx ? { transform: `translate(${dragPos.x}px, ${dragPos.y}px)`, zIndex: 10 } : {}"
            :title="h.url"
            @pointerdown="chipDown($event, idx)"
            @pointermove="chipMove($event, idx)"
            @pointerup="chipUp(idx)"
            @pointercancel="chipUp(idx)"
            @click="chipClick(inst, h.url)"
          >{{ h.nickname || h.url.split('/').pop() }}</button>
        </div>

        <!-- 手机主体：v-show 假关闭（保登录态，重开秒显示） -->
        <div class="qr-body" v-show="inst.status === 'running'">
          <div :class="['qr-webview-wrap', { on: inst.status === 'running', 'wv-loading': wvLoading[inst.id] }]">
            <!-- 加载进度条（webview 整页加载时显示） -->
            <div v-if="wvLoading[inst.id]" class="qr-wv-loading"><div class="qr-wv-loading-inner"></div></div>
            <webview :ref="(el:any) => setWebviewRef(inst.id, el)" :src="resolveUrl(inst.roomUrl)"
              :partition="'persist:qr_'+inst.id" allowpopups="true" class="qr-wv" @dom-ready="onWebviewReady(inst.id)"
              @did-start-loading="setWvLoading(inst.id, true)" @did-stop-loading="setWvLoading(inst.id, false)" />
          </div>

          <!-- 回复面板 -->
          <div class="qr-panel">
            <div class="qr-pin-row">
              <span>输入框</span>
              <button v-if="inst.inputPinState !== 'pinning'" class="qr-pin" @click="pinInput(inst)">定位</button>
              <span v-if="inst.inputPinState === 'pinning'" class="qr-pin-h">点击页面中的输入框...</span>
              <span v-if="inst.inputPinState === 'ok'" class="qr-pin-o">✓</span>
              <span style="color:var(--text-muted)">|</span>
              <span>发送</span>
              <button v-if="inst.inputPinState !== 'pinning'" class="qr-pin qr-pin-s" @click="pinSend(inst)">定位</button>
              <span v-if="inst.inputPinState === 'send-ok'" class="qr-pin-o">✓</span>
              <button v-if="inst.inputSelector" class="qr-pin-x" @click="store.clearInputSelector(inst.id)">✕</button>
            </div>

            <!-- 分组 -->
            <div class="qr-groups">
              <div class="qr-g-hd">
                <span>快捷回复</span>
                <div class="qr-g-actions">
                  <button class="qr-g-btn" @click="store.addGroup(inst.id)">+ 分组</button>
                  <button class="qr-g-btn qr-g-io" @click="triggerImport(inst.id)">导入</button>
                </div>
              </div>
              <div class="qr-g-list">
                <div v-for="(g, gi) in inst.quickReplyGroups" :key="gi" :class="['qr-g', { editing: g._tab === 'edit' }]">
                  <div class="qr-g-title" @click="store.toggleGroup(inst.id, gi)">
                    <span :class="['qr-g-arr', { open: g.expanded }]">▸</span>
                    <input :value="g.name" @input="store.setGroupName(inst.id, gi, ($event.target as HTMLInputElement).value)"
                      class="qr-g-name" placeholder="分组名" @click.stop />
                    <button v-if="inst.quickReplyGroups.length>1" class="qr-g-del" @click.stop="store.removeGroup(inst.id, gi)">×</button>
                    <button :class="['qr-g-btn', 'qr-g-edit', { on: g._tab === 'edit' }]" @click.stop="g._tab = g._tab === 'edit' ? 'send' : 'edit'">{{ g._tab === 'edit' ? '完成' : '编辑' }}</button>
                    <button class="qr-g-btn qr-g-export" @click.stop="doExportGroup(inst.id, gi)" title="导出此分组">导出</button>
                  </div>
                  <transition name="qr-grow">
                  <div v-if="g.expanded" class="qr-g-body">
                    <!-- 发送模式：chip 内嵌复制按钮（紧凑、参考「鸽子神 ×」样式） -->
                    <div v-if="g._tab === 'send'">
                      <div class="qr-chips" v-if="g.items.filter(t=>t.trim()).length">
<span v-for="(qr, qi) in g.items.filter((t:string)=>t.trim())" :key="qi" class="qr-chip">
                            <span class="qr-chip-text" @click="quickSend(inst.id, qr)">{{ qr }}</span>
                            <button class="qr-chip-act" :class="{ ok: copiedText === qr }" @click.stop="copyText(qr)" :title="copiedText === qr ? '已复制' : '复制短语'">
                              <svg v-if="copiedText !== qr" class="qr-chip-icon" viewBox="0 0 24 24" fill="none" width="11" height="11"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                              <svg v-else class="qr-chip-icon" viewBox="0 0 24 24" fill="none" width="11" height="11"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                          </span>
                      </div>
                      <div v-else class="qr-g-empty">暂无短语，点「编辑」添加</div>
                    </div>
                    <!-- 编辑模式：chip 同位置变 input + ×（不开新区域） -->
                    <div v-else>
                      <div class="qr-chips" v-if="g.items.length">
                        <span v-for="(_, qi) in g.items" :key="qi" class="qr-chip qr-chip-editing">
                          <input :value="g.items[qi]"
                            @input="store.setQuickReply(inst.id, gi, qi, ($event.target as HTMLInputElement).value)"
                            class="qr-chip-input" placeholder="内容..." />
                          <button class="qr-chip-act qr-chip-del" @click="store.removeQuickReply(inst.id, gi, qi)" title="删除">×</button>
                        </span>
                      </div>
                      <button class="qr-g-add" @click="store.addQuickReply(inst.id, gi)">+ 添加短语</button>
                    </div>
                  </div>
                  </transition>
                </div>
              </div>
            </div>

            <!-- 手动发送 -->
            <div class="qr-send">
              <textarea v-model="inst.sendInput" class="qr-ta" placeholder="输入..." rows="1"
                @keyup.enter="manualSend(inst.id)"></textarea>
              <button class="qr-send-btn" @click="manualSend(inst.id)" :disabled="!inst.sendInput.trim()">发送</button>
              <button class="qr-send-btn qr-send-burst" @click="randomBurst(inst)"
                :disabled="burstMap[inst.id] || !inst.sendInput.trim()">{{ burstMap[inst.id] ? '发送中...' : '三连' }}</button>
            </div>
          </div>
        </div>

        <!-- 机身 Home 指示条（纯装饰） -->
        <div class="qr-home"></div>
      </div>
    </div>

    <input ref="importInput" type="file" accept=".json" style="display:none" @change="doImport" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useQuickReplyStore } from '../stores/quick-reply'
import { useRoomListStore } from '../stores/room-list'

defineOptions({ name: 'QuickReplyView' })
const store = useQuickReplyStore()
const roomListStore = useRoomListStore()
const wvRefs = ref<Record<number, HTMLWebViewElement>>({})
const importInput = ref<HTMLInputElement | null>(null)
const phoneH = ref<Record<number, number>>({})
const burstMap = reactive<Record<number, boolean>>({})
/* webview 整页加载状态（驱动加载进度条 + 屏幕微光） */
const wvLoading = reactive<Record<number, boolean>>({})
function setWvLoading(id: number, loading: boolean) { wvLoading[id] = loading }

/* 更多功能下拉：当前打开的实例 id，null = 全部关闭 */
const moreOpenId = ref<number | null>(null)
onMounted(() => {
  document.addEventListener('click', () => { moreOpenId.value = null })
})

const STRIP_RULES = `.webcast-chatroom > :not(.pZzS8QUV):not(.webcast-chatroom___input-container){display:none!important}.LyAdeVIF.sBRqUw32,[class*="gift"],[class*="floating"],[class*="Floating"],[class*="interact-bar"],[class*="VideoPlayer"],video,[class*="player-container"],[class*="Player"],[class*="shop"],[class*="Shop"],[class*="product"],[class*="mall"],[class*="cart"]{display:none!important}`
/* 直播精简模式：隐藏聊天区/互动区，只留直播画面（与 STRIP_RULES 相反） */
const LIVE_RULES = `
[class*="webcast-chatroom"] > :not([class*="player"]):not([class*="Player"]),
[class*="chatroom___input-container"],
[class*="chatroom"][class*="container"] > [class*="list"],
[class*="chatroom"][class*="container"] > [class*="header"],
[class*="like"][class*="animation"],
[class*="interact-bar"],[class*="InteractBar"],
[class*="floating"],[class*="Floating"],
[class*="gift"],[class*="Gift"],
[class*="shop"],[class*="Shop"],[class*="mall"],[class*="cart"],
[class*="webcast-chatroom___"] { display:none !important }
video,[class*="player-container"],[class*="VideoPlayer"],[class*="video-player"] { display:block !important; opacity:1 !important; visibility:visible !important }
[class*="webcast-live-layout"] { display:flex !important }
`

function phoneStyle(id: number) {
  const h = phoneH.value[id]
  return h ? { flex: 'none', height: h + 'px' } : {}
}

function setWebviewRef(id: number, el: HTMLWebViewElement | null) {
  if (el) wvRefs.value[id] = el
}
function resolveUrl(raw: string) { return raw ? (raw.includes('://') ? raw : 'https://' + raw) : 'about:blank' }

function loadWebview(inst: any) { if (inst.roomUrl) { inst.status = 'running'; inst._stripped = true } }
// 点击历史 chip：填入 URL 并直接加载（省去复制粘贴）
function fillHistory(inst: any, url: string) { inst.roomUrl = url; loadWebview(inst) }

// ==== 历史 chip 长按拖拽排序 ====
const dragIdx = ref(-1)          // 正在拖拽的 chip 索引
const dragPos = reactive({ x: 0, y: 0 })  // 位移（transform）
const startPos = reactive({ x: 0, y: 0 }) // 按下时指针位置
let dragTimer: any = null
let dragActive = false
let dragLongPress = false
let dragToIdx = -1
let suppressClick = false

function chipDown(e: PointerEvent, idx: number) {
  dragActive = true
  dragLongPress = false
  dragToIdx = idx
  dragIdx.value = idx
  dragPos.x = 0
  dragPos.y = 0
  startPos.x = e.clientX
  startPos.y = e.clientY
  clearTimeout(dragTimer)
  dragTimer = setTimeout(() => { dragLongPress = true }, 300)
}

function chipMove(e: PointerEvent, idx: number) {
  if (!dragActive || dragIdx.value !== idx) return
  // 未长按前快速移动则取消（视为普通点击）
  if (!dragLongPress) {
    if (Math.abs(e.clientX - startPos.x) > 6 || Math.abs(e.clientY - startPos.y) > 6) {
      clearTimeout(dragTimer)
      dragActive = false
      dragIdx.value = -1
    }
    return
  }
  // 长按后跟随移动：chip 位移 = 指针位移（相对按下点，避免 rect 漂移）
  dragPos.x = e.clientX - startPos.x
  dragPos.y = e.clientY - startPos.y
  // 计算目标位置：只统计当前实例卡片内的 chips
  const card = (e.currentTarget as HTMLElement).closest('.qr-phone')
  const chips = card ? Array.from(card.querySelectorAll('.qr-history-chip')) : []
  let target = idx
  chips.forEach((c, i) => {
    const r = c.getBoundingClientRect()
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      target = i
    }
  })
  dragToIdx = target
}

function chipUp(idx: number) {
  clearTimeout(dragTimer)
  if (dragActive && dragLongPress) {
    if (dragToIdx >= 0 && dragToIdx !== idx) {
      roomListStore.reorderHistory(idx, dragToIdx)
    }
    suppressClick = true
  }
  dragActive = false
  dragLongPress = false
  dragIdx.value = -1
  dragPos.x = 0
  dragPos.y = 0
}

function chipClick(inst: any, url: string) {
  if (suppressClick) { suppressClick = false; return }
  fillHistory(inst, url)
}

// 复制快捷短语
const copiedText = ref('')
let copyTimer: any = null
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copiedText.value = text
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copiedText.value = '' }, 1500)
  } catch {}
}
function closeWebview(inst: any) {
  // 假关闭：保留 webview（保登录态），静音 + 隐藏，重开秒显示
  const w = wvRefs.value[inst.id]
  if (w) { try { w.setAudioMuted(true) } catch {} }
  delete wvRefs.value[inst.id]
  inst.status = 'idle'
}
function doRemoveInstance(inst: any) {
  if (inst.status === 'running') closeWebview(inst)
  // 异步清缓存（不阻塞删除）
  ;(window as any).electronAPI.sessionClear('persist:qr_' + inst.id).catch(() => {})
  store.removeInstance(inst.id)
}

/* 添加实例：复用最小可用 ID；若有历史 partition 缓存先清掉（避免脏登录态） */
function addInstance() {
  const before = new Set(store.instances.map(i => i.id))
  store.addInstance()
  const added = store.instances.find(i => !before.has(i.id))
  if (added) {
    // 复用旧 ID 时清掉历史 partition 缓存
    ;(window as any).electronAPI.sessionClear('persist:qr_' + added.id).catch(() => {})
  }
}
function refreshWebview(inst: any) {
  // 真刷新：忽略缓存强制重新加载网页（登录 cookie 保留）
  const w = wvRefs.value[inst.id]
  if (!w) return
  try { w.reloadIgnoringCache() } catch {
    try { w.reload() } catch {}
  }
}

// 精简模式
const stripKeys = ref<Record<number, string>>({})
// 直播画面模式
const liveKeys = ref<Record<number, string>>({})

async function toggleStripped(inst: any) {
  inst._stripped = !inst._stripped
  const w = wvRefs.value[inst.id]
  if (!w) return
  try {
    if (inst._stripped) {
      const key = await (w as any).insertCSS(STRIP_RULES)
      stripKeys.value[inst.id] = key
    } else {
      const key = stripKeys.value[inst.id]
      if (key) { try { await (w as any).removeInsertedCSS(key) } catch {} }
      delete stripKeys.value[inst.id]
    }
  } catch {}
}

/* ==== 缩放 + 直播画面模式 ==== */
function applyZoom(inst: any, f: number) {
  inst.zoom = Math.min(3, Math.max(0.1, f))
  const w = wvRefs.value[inst.id]
  if (!w) return
  try { (w as any).setZoomFactor(inst.zoom) } catch {}
}
function zoomIn(inst: any) { applyZoom(inst, (inst.zoom || 1) + 0.25) }
function zoomOut(inst: any) { applyZoom(inst, (inst.zoom || 1) - 0.25) }
function resetZoom(inst: any) { applyZoom(inst, 1) }

/* 缩放滑块：实时更新显示 + 防抖应用（拖动时 60ms 合并） */
let zoomSliderTimer: ReturnType<typeof setTimeout> | null = null
function onZoomSlider(inst: any, v: string) {
  const pct = Math.min(300, Math.max(10, parseInt(v, 10) || 100))
  inst.zoom = pct / 100
  if (zoomSliderTimer) clearTimeout(zoomSliderTimer)
  zoomSliderTimer = setTimeout(() => {
    const w = wvRefs.value[inst.id]
    if (w) { try { (w as any).setZoomFactor(inst.zoom) } catch {} }
  }, 60)
}

async function toggleLive(inst: any) {
  inst.liveMode = !inst.liveMode
  const w = wvRefs.value[inst.id]
  if (!w) return
  try {
    // 先移除聊天精简规则，避免与直播规则冲突
    const stripKey = stripKeys.value[inst.id]
    if (stripKey) { try { await (w as any).removeInsertedCSS(stripKey) } catch {} }
    delete stripKeys.value[inst.id]
    if (inst.liveMode) {
      // 直播画面模式：隐藏聊天区 + 放大到 180%
      const key = await (w as any).insertCSS(LIVE_RULES)
      liveKeys.value[inst.id] = key
      try { (w as any).setZoomFactor(1.8) } catch {}
    } else {
      const liveKey = liveKeys.value[inst.id]
      if (liveKey) { try { await (w as any).removeInsertedCSS(liveKey) } catch {} }
      delete liveKeys.value[inst.id]
      try { (w as any).setZoomFactor(inst.zoom || 1) } catch {}
      if (inst._stripped) {
        const key = await (w as any).insertCSS(STRIP_RULES)
        stripKeys.value[inst.id] = key
      }
    }
  } catch {}
}

async function randomBurst(inst: any) {
  if (!inst.sendInput.trim() || burstMap[inst.id]) return
  const text = inst.sendInput.trim()
  burstMap[inst.id] = true
  for (let i = 0; i < 3; i++) {
    await quickSend(inst.id, text)
    if (i < 2) await new Promise(r => setTimeout(r, 500 + Math.floor(Math.random() * 2000)))
  }
  burstMap[inst.id] = false
}

function onWebviewReady(id: number) {
  const w = wvRefs.value[id]
  if (!w) return
  try { w.setAudioMuted(true) } catch {}
  const inst = store.instances.find(i => i.id === id)
  if (!inst) return
  // 直播画面模式：应用直播规则 + 放大
  if (inst.liveMode) {
    ;(w as any).insertCSS(LIVE_RULES).then((key: any) => { liveKeys.value[id] = key }).catch(() => {})
    try { (w as any).setZoomFactor(1.8) } catch {}
  } else {
    // 默认应用聊天精简模式
    if (inst._stripped) {
      ;(w as any).insertCSS(STRIP_RULES).then((key: any) => { stripKeys.value[id] = key }).catch(() => {})
    }
    if (inst.zoom && inst.zoom !== 1) {
      try { (w as any).setZoomFactor(inst.zoom) } catch {}
    }
  }
  // 默认滚到底部（抖音 SPA 异步渲染，多次尝试覆盖；之后用户可自由滚动）
  if (inst) {
    let tries = 0
    const tryScroll = () => {
      try {
        w.executeJavaScript(`
          (() => {
            const all = [document.scrollingElement, document.documentElement, document.body, ...document.querySelectorAll('*')];
            const scrollables = all.filter(el => {
              if (!el || el.scrollHeight <= el.clientHeight + 4) return false;
              const s = getComputedStyle(el);
              return (s.overflowY === 'scroll' || s.overflowY === 'auto');
            });
            scrollables.forEach(el => { el.scrollTop = el.scrollHeight; });
          })();
        `).catch(() => {})
      } catch {}
      if (tries++ < 6) setTimeout(tryScroll, 800)
    }
    tryScroll()
  }
}

async function pinInput(inst: any) {
  const w = wvRefs.value[inst.id]; if (!w) return
  inst.inputPinState = 'pinning'
  const r = await store.pinInputSelector(w, inst.id)
  if (!r.success && r.error) alert('定位失败: ' + r.error)
}
async function pinSend(inst: any) {
  const w = wvRefs.value[inst.id]; if (!w) return
  inst.inputPinState = 'pinning'
  const r = await store.pinSendSelector(w, inst.id)
  if (!r.success && r.error) alert('定位失败: ' + r.error)
}

async function quickSend(id: number, text: string) {
  const w = wvRefs.value[id]; if (!w) return
  const inst = store.instances.find(i => i.id === id)
  try {
    const r = await store.sendViaWebview(w, text, inst?.inputSelector ?? null, inst?.sendSelector ?? null)
    if (!r.success) alert('发送失败: ' + (r.error || '未知错误'))
  } catch (e: any) { alert('发送异常: ' + e.message) }
}
async function manualSend(id: number) {
  const inst = store.instances.find(i => i.id === id)
  if (!inst || !inst.sendInput.trim()) return
  await quickSend(id, inst.sendInput.trim())
}

async function clearLogin(inst: any) {
  if (!confirm('确定清除登录状态？')) return
  try { await (window as any).electronAPI.sessionClear('persist:qr_' + inst.id) } catch {}
  const w = wvRefs.value[inst.id]
  if (w) { try { w.reload() } catch {}; setTimeout(() => { try { w.reload() } catch {} }, 500) }
}

/* 清缓存：清 storage（cookie/IndexedDB/localStorage），比清登更彻底——重置整个会话 */
async function clearCache(inst: any) {
  if (!confirm('清空该实例的 cookie/缓存？下次需要重新登录抖音')) return
  try { await (window as any).electronAPI.sessionClear('persist:qr_' + inst.id) } catch {}
  // 清缓存后强制刷新（连续 reload 多次，抖音 SPA 有时需要）
  const w = wvRefs.value[inst.id]
  if (w) {
    try { w.reload() } catch {}
    setTimeout(() => { try { w.reload() } catch {} }, 800)
  }
}

onMounted(() => {})

function doExportGroup(instId: number, gIdx: number) {
  const json = store.exportGroup(instId, gIdx)
  if (!json) return
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const parsed = JSON.parse(json)
  a.href = url; a.download = `分组_${parsed.name}_${new Date().toISOString().slice(0,10)}.json`
  a.click(); URL.revokeObjectURL(url)
}

let importTargetId = 0
function triggerImport(instId: number) { importTargetId = instId; importInput.value?.click() }
function doImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const r = store.importGroupAsNew(reader.result as string, importTargetId)
    if (r.success) alert(`导入成功！已创建分组「${r.name}」`)
    else alert('导入失败: ' + (r.error || '未知错误'))
  }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<style scoped>
.qr-page { display: flex; flex-direction: column; height: 100vh; min-height: 600px; overflow: hidden; padding: 10px 12px 12px; }
.qr-header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; margin-bottom: 8px; }
.qr-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.qr-add-btn { background: transparent; border: 1px dashed var(--border-strong); color: var(--text-muted); font-size: 11px; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-family: inherit; }
.qr-add-btn:hover { border-color: var(--primary); color: var(--primary); }

.qr-scroll { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(340px, 375px)); gap: 12px; overflow: auto; padding: 4px 0; align-content: start; }

/* 手机卡：固定高度（620px，模拟手机竖屏比例），最多 3 个并排，超出自动换行 */
/* 手机操作台固定暗色：内部变量重定义为暗色值，模拟手机屏不随应用主题漂移 */
.qr-phone {
  width: 100%; height: 540px; display: flex; flex-direction: column; padding: 8px; gap: 6px; overflow: hidden;
  position: relative;
  border-radius: 22px;
  border: 1.5px solid #3a3d46;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35);
  --bg-card: #1a1d26;
  --bg-elevated: #15171e;
  --bg-track: #111318;
  --bg-hover: rgba(240, 80, 110, 0.06);
  --bg-active: rgba(240, 80, 110, 0.1);
  --bg-selected: rgba(240, 80, 110, 0.08);
  --border-default: #1e2028;
  --border-strong: #2a2d36;
  --border-hover: #3a3d46;
  --text-primary: #e0e2e8;
  --text-secondary: #8b8fa3;
  --text-muted: #6b7080;
  --text-faint: #4a4e5e;
  --text-dim: #3a3d46;
  --primary: #f0506e;
  --primary-hover: #f26b84;
  --primary-pressed: #d13b58;
  --primary-soft: rgba(240, 80, 110, 0.12);
  --primary-border: rgba(240, 80, 110, 0.35);
  --danger: #e5484d;
  --danger-soft: rgba(229, 72, 77, 0.1);
  --danger-border: rgba(229, 72, 77, 0.3);
  --info: #5b9bf0;
  --info-soft: rgba(91, 155, 240, 0.12);
  --warning: #e9b949;
  --success: #4cc38a;
  --success-soft: rgba(76, 195, 138, 0.12);
  --success-border: rgba(76, 195, 138, 0.3);
}
.qr-topbar { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.qr-name { flex: 1; background: transparent; border: none; color: var(--text-primary); font-size: 13px; font-weight: 600; font-family: inherit; outline: none; padding: 2px 4px; }
/* 实例运行状态胶囊 */
.qr-inst-status {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 9px; color: var(--text-faint); padding: 1px 8px; border-radius: 8px;
  border: 1px solid var(--border-strong); background: var(--bg-card);
  white-space: nowrap; flex-shrink: 0;
}
.qr-inst-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--text-dim); }
.qr-inst-status.on { color: var(--success); border-color: var(--success-border); background: var(--success-soft); }
.qr-inst-status.on .qr-inst-dot { background: var(--success); box-shadow: 0 0 5px var(--success-border); }
.qr-top-actions { display: flex; gap: 4px; }
.qr-top-btn { background: transparent; border: none; color: var(--text-muted); font-size: 14px; cursor: pointer; padding: 0 4px; line-height: 1; }
.qr-del-i { color: var(--danger); opacity: 0; transition: opacity .15s; }
.qr-phone:hover .qr-del-i { opacity: 1; }

.qr-urlbar { display: flex; gap: 4px; flex-shrink: 0; align-items: center; }
/* 更多功能下拉 */
.qr-more { position: relative; flex-shrink: 0; }
.qr-more-btn { font-size: 13px; padding: 3px 8px; }
.qr-more-btn.open { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }
.qr-more-panel {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 30;
  display: flex; flex-direction: column; gap: 3px; min-width: 130px;
  padding: 6px; background: var(--bg-card); border: 1px solid var(--border-strong);
  border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.4);
}
.qr-more-row { display: flex; gap: 4px; align-items: center; justify-content: center; }
/* 缩放滑块行 */
.qr-zoom-row { display: flex; align-items: center; gap: 6px; padding: 2px 4px 6px; border-bottom: 1px dashed var(--border-default); margin-bottom: 4px; }
.qr-zoom-label { font-size: 10px; color: var(--text-faint); flex-shrink: 0; }
.qr-zoom-slider { flex: 1; min-width: 0; height: 4px; -webkit-appearance: none; appearance: none; background: var(--border-strong); border-radius: 2px; outline: none; cursor: pointer; }
.qr-zoom-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: var(--primary); cursor: pointer; box-shadow: 0 0 4px var(--primary-border); }
.qr-zoom-slider::-webkit-slider-thumb:hover { background: var(--primary-hover); }
.qr-more-item {
  padding: 5px 8px; border-radius: 6px; font-size: 11px; font-family: inherit; cursor: pointer;
  border: 1px solid var(--border-strong); background: transparent; color: var(--text-secondary);
  text-align: left; white-space: nowrap; transition: all .15s;
}
.qr-more-item:hover { border-color: var(--primary); color: var(--text-primary); background: var(--bg-hover); }
.qr-more-item.qr-more-danger { color: var(--danger); }
.qr-more-item.qr-more-danger:hover { border-color: var(--danger); background: var(--danger-soft); }
.qr-more-item.qr-sm-live { border-color: var(--accent-cyan); color: var(--accent-cyan); }
.qr-more-item.qr-sm-live:hover { background: var(--accent-cyan-soft); }
.qr-more-item.qr-sm-live.on { background: var(--accent-cyan-soft); font-weight: 600; }

/* 历史直播间快捷填入 */
.qr-history { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; flex-shrink: 0; }
.qr-history-label { font-size: 10px; color: var(--text-faint); flex-shrink: 0; }
.qr-history-chip {
  font-size: 10px; color: var(--text-secondary); background: var(--bg-card); border: 1px solid var(--border-strong);
  padding: 1px 8px; border-radius: 10px; cursor: pointer; max-width: 140px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: border-color .15s, box-shadow .15s;
  touch-action: none; user-select: none; -webkit-user-select: none;
}
.qr-history-chip:hover { border-color: var(--primary); color: var(--primary-hover); }
.qr-history-chip.dragging {
  border-color: var(--primary); color: var(--primary-hover); background: #1f2430;
  box-shadow: 0 4px 14px rgba(249,115,22,0.25);
  cursor: grabbing; position: relative;
}
.qr-url { flex: 1; background: var(--bg-track); border: 1px solid var(--border-strong); border-radius: 8px; padding: 4px 10px; color: var(--text-secondary); font-size: 10px; font-family: inherit; outline: none; min-width: 0; transition: border-color .15s; }
.qr-url:focus { border-color: var(--primary); }
.qr-sm-btn { padding: 3px 8px; border-radius: 6px; font-size: 10px; font-family: inherit; cursor: pointer; border: 1px solid var(--border-strong); background: transparent; color: var(--text-muted); white-space: nowrap; }
.qr-sm-btn:hover { border-color: var(--primary); color: var(--text-secondary); }
/* 缩放档位显示 + 直播模式切换 */
.qr-zoom-val { padding: 3px 5px; border-radius: 6px; font-size: 10px; font-family: inherit; border: 1px solid transparent; background: transparent; color: var(--text-faint); cursor: pointer; min-width: 34px; text-align: center; font-variant-numeric: tabular-nums; }
.qr-zoom-val:hover { border-color: var(--primary); color: var(--text-secondary); }
.qr-sm-btn.qr-sm-live { border-color: var(--accent-cyan); color: var(--accent-cyan); }
.qr-sm-btn.qr-sm-live:hover { background: var(--accent-cyan-soft); }
.qr-sm-btn.qr-sm-live.on { background: var(--accent-cyan-soft); color: var(--accent-cyan); font-weight: 600; }
.qr-sm-pri { background: var(--primary); color: #fff; border-color: var(--primary); }
.qr-sm-pri:hover { background: var(--primary-hover); color: #fff; }
.qr-sm-danger { background: rgba(239,68,68,0.12); color: var(--danger); border-color: var(--danger-border); }
.qr-sm-danger:hover { background: var(--danger-border); }
.qr-sm-ref { border-color: var(--success-border); color: var(--success); }
.qr-sm-ref:hover { background: var(--success-soft); }
.qr-sm-clear { border-color: rgba(107,114,128,0.3); color: #6b7280; }
.qr-sm-clear:hover { background: rgba(107,114,128,0.1); }

.qr-body { flex: 1; display: flex; flex-direction: column; min-height: 0; gap: 6px; }
/* 手机屏幕：圆角大屏 + 内阴影 + 顶部屏幕装饰条 */
.qr-webview-wrap {
  flex: 0 1 240px; min-height: 120px; border-radius: 14px; overflow: auto;
  border: 1px solid #2a2d36; position: relative;
  background: #0d0f14;
  box-shadow: inset 0 0 12px rgba(0,0,0,0.45);
  transition: border-color .3s ease, box-shadow .3s ease;
}
/* 运行中：青色微光描边 */
.qr-webview-wrap.on {
  border-color: var(--success-border);
  box-shadow: 0 0 0 1px var(--success-border), inset 0 0 12px rgba(0,0,0,0.45);
}
/* 加载中：主红呼吸 */
.qr-webview-wrap.wv-loading {
  border-color: var(--primary-border);
  animation: qr-wv-pulse 1.2s ease-in-out infinite;
}
@keyframes qr-wv-pulse {
  0%, 100% { box-shadow: 0 0 4px var(--primary-border), inset 0 0 12px rgba(0,0,0,0.45); }
  50% { box-shadow: 0 0 14px var(--primary-border), inset 0 0 12px rgba(0,0,0,0.45); }
}
/* 加载进度条：屏幕顶部细条 */
.qr-wv-loading {
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  overflow: hidden; z-index: 12; border-radius: 14px 14px 0 0;
}
.qr-wv-loading-inner {
  height: 100%; width: 40%;
  background: linear-gradient(90deg, var(--primary), var(--accent-cyan));
  border-radius: 2px;
  animation: qr-wv-loading-slide 1s ease-in-out infinite;
}
@keyframes qr-wv-loading-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
.qr-wv { width: 1024px; min-height: 680px; display: flex; }
/* Home 指示条（机身底部装饰） */
.qr-home {
  position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%);
  width: 42px; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.22);
  pointer-events: none;
}

/* 回复面板：flex 自适应占剩余空间（qr-phone 高度确定，flex 链可算）；
   pin-row/send 固定，groups 独立滚动 → send 永远可见 */
.qr-panel { display: flex; flex-direction: column; gap: 4px; flex: 1 1 0; min-height: 0; overflow: hidden; }
.qr-panel::-webkit-scrollbar { width: 8px; }
.qr-panel::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); border-radius: 4px; }
.qr-panel::-webkit-scrollbar-thumb { background: var(--primary-border); border-radius: 4px; }
.qr-panel::-webkit-scrollbar-thumb:hover { background: rgba(249,115,22,0.7); }
.qr-pin-row { font-size: 10px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; flex-shrink: 0; padding: 1px 2px; }
.qr-pin { background: var(--success-soft); border: 1px solid var(--success-border); color: var(--success); font-size: 9px; padding: 1px 6px; border-radius: 5px; cursor: pointer; font-family: inherit; }
.qr-pin:hover { background: var(--success-soft); }
.qr-pin-s { border-color: var(--primary-border); color: var(--primary); }
.qr-pin-s:hover { background: var(--primary-border); }
.qr-pin-h { font-size: 9px; color: #eab308; }
.qr-pin-o { font-size: 9px; color: var(--success); }
.qr-pin-x { background: transparent; border: none; color: var(--danger); cursor: pointer; font-size: 10px; padding: 0 2px; }

/* 分组区：占满中间剩余空间，独立滚动（这是分组多的滚动容器） */
.qr-groups { flex: 1 1 0; min-height: 0; overflow-y: auto; border: 1px solid var(--border-default); border-radius: 6px; }
.qr-groups::-webkit-scrollbar { width: 8px; }
.qr-groups::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); border-radius: 4px; }
.qr-groups::-webkit-scrollbar-thumb { background: var(--primary-border); border-radius: 4px; }
.qr-groups::-webkit-scrollbar-thumb:hover { background: rgba(249,115,22,0.7); }
.qr-g-hd { display: flex; align-items: center; justify-content: space-between; padding: 5px 9px; background: var(--bg-elevated); font-size: 10px; color: var(--text-muted); border-bottom: 1px solid var(--border-default); }
.qr-g-actions { display: flex; gap: 3px; }
.qr-g-btn { background: transparent; border: 1px solid var(--border-strong); color: var(--text-muted); font-size: 9px; padding: 2px 7px; border-radius: 5px; cursor: pointer; font-family: inherit; }
.qr-g-btn:hover { border-color: var(--primary); color: var(--primary); }
.qr-g-io { color: var(--text-muted); }
.qr-g-io:hover { border-color: var(--text-muted); color: var(--text-secondary); }
.qr-g-list { display: flex; flex-direction: column; gap: 3px; padding: 3px; }
.qr-g { border: 1px solid var(--border-default); border-radius: 7px; overflow: hidden; transition: border-color .2s, box-shadow .2s; }
/* 编辑中的分组：青绿描边提示 */
.qr-g.editing { border-color: var(--success-border); box-shadow: 0 0 0 1px var(--success-border); }
.qr-g-title { display: flex; align-items: center; gap: 3px; padding: 3px 7px; background: var(--bg-elevated); cursor: pointer; user-select: none; font-size: 10px; }
.qr-g-title:hover { background: var(--bg-card); }
.qr-g-arr { color: var(--text-muted); font-size: 10px; width: 12px; text-align: center; flex-shrink: 0; display: inline-block; transition: transform .2s ease; }
.qr-g-arr.open { transform: rotate(90deg); color: var(--primary); }
.qr-g-name { flex: 1; background: transparent; border: none; color: var(--text-secondary); font-size: 10px; font-weight: 600; font-family: inherit; outline: none; min-width: 0; }
.qr-g-name:focus { color: var(--text-primary); }
.qr-g-del { background: transparent; border: none; color: var(--danger); cursor: pointer; font-size: 12px; padding: 0 2px; line-height: 1; opacity: 0; transition: opacity .15s; }
.qr-g-title:hover .qr-g-del { opacity: 1; }
.qr-g-export { opacity: 0; transition: opacity .15s; }
.qr-g-title:hover .qr-g-export { opacity: 1; }
.qr-g-body { padding: 2px 6px 4px; display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto; }
/* 分组展开/收起过渡 */
.qr-grow-enter-active, .qr-grow-leave-active { transition: opacity .16s ease, transform .16s ease; }
.qr-grow-enter-from, .qr-grow-leave-to { opacity: 0; transform: translateY(-4px); }
/* 紧凑 chip：内嵌文本 + 动作按钮（参考「鸽子神 ×」chip 样式） */
.qr-g-btn.on { border-color: var(--success-border); color: var(--success); }
.qr-g-add { background: transparent; border: 1px dashed var(--border-strong); color: var(--text-muted); font-size: 9px; padding: 1px 6px; border-radius: 3px; cursor: pointer; font-family: inherit; width: fit-content; }
.qr-g-add:hover { border-color: var(--primary); color: var(--primary); }
.qr-g-empty { font-size: 10px; color: var(--text-dim); text-align: center; padding: 8px 0; }
.qr-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.qr-chip {
  display: inline-flex; align-items: center; gap: 0;
  background: var(--bg-selected); border: 1px solid var(--primary-soft);
  color: var(--primary-hover); font-size: 10px; padding: 0; border-radius: 10px;
  max-width: 200px; min-height: 20px; overflow: hidden;
}
.qr-chip-text {
  cursor: pointer; padding: 2px 4px 2px 8px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; flex: 1; min-width: 0; max-width: 160px;
}
.qr-chip-text:hover { color: #fdba74; }
.qr-chip-act {
  background: transparent; border: none; color: var(--text-muted); cursor: pointer;
  padding: 0 4px; line-height: 20px; flex-shrink: 0; opacity: 0;
  transition: opacity .15s, color .15s;
}
.qr-chip:hover .qr-chip-act { opacity: 1; }
.qr-chip-act:hover { color: var(--info); background: var(--info-soft); border-radius: 0 9px 9px 0; }
.qr-chip-act.ok { opacity: 1; color: var(--success); background: var(--success-soft); border-radius: 0 9px 9px 0; }

/* 编辑模式：chip 同位置变 input + × */
.qr-chip-editing { background: var(--success-soft); border-color: var(--success-border); }
.qr-chip-input {
  background: var(--bg-track); border: none; padding: 2px 6px; color: var(--text-primary);
  font-size: 10px; font-family: inherit; outline: none; flex: 1; min-width: 0; max-width: 150px;
}
.qr-chip-input:focus { background: var(--bg-card); }
.qr-chip-del:hover { color: var(--danger); background: var(--danger-soft); }

.qr-send { display: flex; gap: 4px; flex-shrink: 0; }
.qr-ta { flex: 1; background: var(--bg-track); border: 1px solid var(--border-strong); border-radius: 8px; padding: 4px 10px; color: var(--text-primary); font-size: 10px; font-family: inherit; outline: none; resize: none; transition: border-color .15s; }
.qr-ta:focus { border-color: var(--primary); }
.qr-send-btn { padding: 4px 12px; border-radius: 8px; font-size: 10px; font-family: inherit; cursor: pointer; border: none; background: var(--bg-active); color: var(--primary); border: 1px solid var(--primary-border); white-space: nowrap; }
.qr-send-btn:hover { background: var(--primary-soft); }
.qr-send-btn:disabled { opacity: 0.3; cursor: default; }
.qr-send-burst { border-color: rgba(168,85,247,0.3); color: #a855f7; }
.qr-send-burst:hover:not(:disabled) { background: rgba(168,85,247,0.15); }
</style>
