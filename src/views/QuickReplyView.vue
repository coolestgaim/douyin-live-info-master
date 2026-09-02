<template>
  <div class="qr-page">
    <div class="qr-header">
      <span class="qr-title">快捷回复</span>
      <button class="qr-add-btn" @click="addInstance()">+ 添加实例</button>
    </div>

    <div class="qr-scroll" v-if="store.instances.length > 0">
      <div v-for="inst in store.instances" :key="inst.id" class="card qr-phone" :style="phoneStyle(inst.id)">
        <!-- 实例顶栏（删除键固定最左，避免被 input flex:1 挤到右边溢出） -->
        <div class="qr-topbar">
          <button v-if="store.instances.length > 1" class="qr-top-btn qr-del-i" @click="doRemoveInstance(inst)" title="删除实例">×</button>
          <input v-model="inst.name" class="qr-name" placeholder="实例名称" />
          <select v-model="inst.platform" class="qr-platform" @change="onPlatformChange(inst)" title="直播平台：决定功能按钮组与预设选择器">
            <option v-for="p in PLATFORMS" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <span :class="['qr-inst-status', { on: inst.status === 'running' }]">
            <span class="qr-inst-dot"></span>
            {{ inst.status === 'running' ? '运行中' : '已停止' }}
          </span>
        </div>

        <!-- URL + 操作行 -->
        <div class="qr-urlbar">
          <input v-model="inst.roomUrl" class="qr-url" placeholder="网页链接（支持任意直播网站，定位输入框+发送按钮即可）" @keyup.enter="loadWebview(inst)" />
          <button :class="['qr-sm-btn', inst.status === 'running' ? 'qr-sm-danger' : 'qr-sm-pri']"
            @click="inst.status === 'running' ? closeWebview(inst) : loadWebview(inst)">
            {{ inst.status === 'running' ? '关闭' : '加载' }}
          </button>
          <!-- 独立刷新按钮（运行中才显示，替代下拉菜单里的刷新项） -->
          <button v-if="inst.status === 'running'" class="qr-sm-btn qr-refresh-btn" @click="refreshWebview(inst)" title="刷新网页（忽略缓存强制重载，登录保留）">⟳</button>
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
              <!-- 抖音专属：直播画面精简模式 + 沉浸（CSS 为抖音页面定制） -->
              <template v-if="inst.platform === 'douyin'">
                <button class="qr-more-item qr-sm-live" :class="{ on: inst.liveMode }" @click="toggleLive(inst)"
                  :title="inst.liveMode ? '退出直播画面模式，回到快捷回复' : '直播画面精简模式：隐藏聊天区，只看直播'">{{ inst.liveMode ? '✓ 直播模式' : '直播画面模式' }}</button>
                <button class="qr-more-item" @click="toggleStripped(inst)"
                  :title="inst._stripped ? '恢复全部元素' : '精简模式'">{{ inst._stripped ? '恢复全部元素' : '精简模式' }}</button>
              </template>
              <!-- 需全屏才能发送的平台（虎牙/B站）：全屏化按钮 -->
              <button v-if="getPlatform(inst.platform).needFullscreen" class="qr-more-item" @click="fullscreenWebview(inst)"
                :title="getPlatform(inst.platform).loginHint">⛶ 全屏化（{{ getPlatform(inst.platform).name }}需全屏发送）</button>
              <!-- 快手：扫码登录指引 -->
              <button v-if="inst.platform === 'kuaishou'" class="qr-more-item" @click="showPlatformHint(inst)"
                :title="getPlatform(inst.platform).loginHint">扫码登录指引</button>
              <button class="qr-more-item qr-more-danger" @click="clearLogin(inst)">清除登录</button>
              <button class="qr-more-item qr-more-danger" @click="clearCache(inst)" title="清掉 cookie/缓存，下次重新登录">清空缓存</button>
              <div class="qr-more-hint" v-if="getPlatform(inst.platform).loginHint && inst.platform !== 'douyin'">
                {{ getPlatform(inst.platform).name }}：{{ getPlatform(inst.platform).loginHint }}
              </div>
            </div>
          </div>
        </div>

        <!-- 历史直播间快捷填入（下拉菜单省空间，面板内可拖拽排序） -->
        <div v-if="roomListStore.roomHistory.length > 0" class="qr-history">
          <button class="qr-history-btn" :class="{ open: historyOpenId === inst.id }" @click.stop="historyOpenId = historyOpenId === inst.id ? null : inst.id" title="历史直播间（点击选择，长按拖拽排序）">
            历史 <span class="qr-h-cnt">{{ roomListStore.roomHistory.length }}</span>
            <svg class="qr-h-arr" viewBox="0 0 24 24" width="10" height="10"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <transition name="qr-hdrop">
            <div v-if="historyOpenId === inst.id" class="qr-history-panel" @click.stop>
              <button
                v-for="(h, idx) in roomListStore.roomHistory"
                :key="h.url"
                class="qr-history-chip"
                :class="{ dragging: dragIdx === idx }"
                :style="dragIdx === idx ? { transform: `translate(${dragPos.x}px, ${dragPos.y}px)`, zIndex: 10 } : {}"
                :title="(h.nickname || h.url.split('/').pop()) + ' — ' + h.url"
                @pointerdown="chipDown($event, idx)"
                @pointermove="chipMove($event, idx)"
                @pointerup="chipUp(idx)"
                @pointercancel="chipUp(idx)"
                @click="chipClick(inst, h.url)"
              >
                <span class="qr-hi-name">{{ h.nickname || h.url.split('/').pop() }}</span>
                <span class="qr-hi-url">{{ h.url }}</span>
              </button>
            </div>
          </transition>
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
                    <!-- 发送模式：点击 chip 发送，长按拖拽排序（像手机桌面图标） -->
                    <div v-if="g._tab === 'send'">
                      <div class="qr-chips" v-if="g.items.filter(t=>t.trim()).length">
                        <template v-for="(c, vi) in visibleChips(g)" :key="c.rawIdx">
                          <span class="qr-chip"
                            :class="{ dragging: isDragChip(inst.id, gi, c.rawIdx) }"
                            :data-g="gi"
                            :style="chipDragStyle(inst.id, gi, c.rawIdx, vi)"
                            @pointerdown="qrChipDown($event, inst.id, gi, c.rawIdx)"
                            @pointermove="qrChipMove($event, gi)"
                            @pointerup="qrChipUp()"
                            @pointercancel="qrChipUp()"
                            @click="qrChipClick(inst.id, c.raw)">
                            <span class="qr-chip-text">{{ c.raw }}</span>
                          </span>
                        </template>
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
                          <button class="qr-chip-del" @click="store.removeQuickReply(inst.id, gi, qi)" title="删除">×</button>
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
import { PLATFORMS, getPlatform, guessPlatform } from '../data/platforms'

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
/* 历史直播间下拉：当前展开的实例 id，null = 全部关闭（按实例隔离，避免多实例同步展开） */
const historyOpenId = ref<number | null>(null)
onMounted(() => {
  document.addEventListener('click', () => { moreOpenId.value = null; historyOpenId.value = null })
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
/* 播放器容器铺满整个 webview：固定定位 + 全屏尺寸，视频 contain 完整显示 */
[class*="player-container"],[class*="webcast-player"],[class*="VideoPlayer"],[class*="video-player"] {
  position: fixed !important; inset: 0 !important;
  width: 100% !important; height: 100% !important;
  max-width: none !important; max-height: none !important;
  z-index: 99999 !important; background: #000 !important;
}
video { object-fit: contain !important; width: 100% !important; height: 100% !important; }
body { overflow: hidden !important; }
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

// 加载 webview：按 URL 推断平台 + 空 selector 填入平台预设
function loadWebview(inst: any) {
  if (inst.roomUrl) {
    inst.platform = guessPlatform(inst.roomUrl)
    const cfg = getPlatform(inst.platform)
    if (!inst.inputSelector && cfg.inputSelector) inst.inputSelector = cfg.inputSelector
    if (!inst.sendSelector && cfg.sendSelector) inst.sendSelector = cfg.sendSelector
    store.persist()
    inst.status = 'running'; inst._stripped = true
  }
}
// 手动切换平台：空 selector 时填入该平台预设（不覆盖已自定义的）
function onPlatformChange(inst: any) {
  const cfg = getPlatform(inst.platform)
  if (!inst.inputSelector && cfg.inputSelector) inst.inputSelector = cfg.inputSelector
  if (!inst.sendSelector && cfg.sendSelector) inst.sendSelector = cfg.sendSelector
  store.persist()
}
// 平台登录/操作指引弹窗
function showPlatformHint(inst: any) {
  const cfg = getPlatform(inst.platform)
  const text = `${cfg.name}平台指引\n\n${cfg.loginHint || '无特殊指引'}\n\n输入框选择器: ${cfg.inputSelector || '手动定位'}\n发送按钮选择器: ${cfg.sendSelector || '手动定位'}`
  window.alert(text)
}
// 全屏化（虎牙/B站等需全屏才能发送）：在网页里点击全屏按钮
async function fullscreenWebview(inst: any) {
  const w = wvRefs.value[inst.id]
  if (!w) return
  try {
    await w.executeJavaScript(`(function(){
      const els = document.querySelectorAll('button,[class*="fullscreen"],[class*="Fullscreen"],[id*="fullscreen"],[class*="player-full"]');
      for (const b of els) {
        const t = (b.textContent||'').trim();
        if (t.includes('全屏') || /fullscreen/i.test(b.className||'')) { b.click(); return true }
      }
      return false;
    })()`)
  } catch {}
}
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
  // 计算目标位置：只统计当前实例卡片内的 chips（排除自己，否则自己跟随指针会永远盖住目标）
  const card = (e.currentTarget as HTMLElement).closest('.qr-phone')
  const chips = card ? Array.from(card.querySelectorAll('.qr-history-chip')) : []
  let target = idx
  chips.forEach((c, i) => {
    if (i === idx) return
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

// ==== 快捷回复 chip 长按拖拽排序（发送模式下，仿手机桌面图标） ====
// qrDrag.idx = items 原始索引（模板里 rawIdx 对应）；visIdx/fromVis = 可见顺序索引；toIdx = 目标可见顺序索引
const qrDrag = reactive({
  active: false, longPress: false,
  instId: 0, gIdx: 0, idx: -1, visIdx: -1, fromVis: -1, toIdx: -1,
  x: 0, y: 0, sx: 0, sy: 0,
  chipWidths: [] as number[],   // 当前实例当前分组可见 chip 的宽度（让位动画用）
})
let qrDragTimer: any = null
let qrSuppressClick = false

// 可见 chip 列表（跳过空项）：raw = 文本, rawIdx = items 原始索引
function visibleChips(g: any): { raw: string; rawIdx: number }[] {
  return g.items.map((t: string, i: number) => ({ raw: t, rawIdx: i })).filter((c: any) => c.raw.trim())
}

// 是否当前正在拖拽的 chip（必须实例 + 分组 + 索引全匹配，避免跨实例误判）
function isDragChip(instId: number, gIdx: number, rawIdx: number): boolean {
  return qrDrag.active && qrDrag.instId === instId && qrDrag.gIdx === gIdx && qrDrag.idx === rawIdx
}

// chip 拖拽/让位样式：被拖 chip 浮起跟随指针；中间的 chip 向两边让位（插队动画）
function chipDragStyle(instId: number, gIdx: number, rawIdx: number, vi: number): Record<string, string> {
  if (isDragChip(instId, gIdx, rawIdx)) {
    return { transform: `translate(${qrDrag.x}px, ${qrDrag.y}px) scale(1.05)`, zIndex: '20', transition: 'none' }
  }
  // 让位：仅拖拽本实例本分组时，位于被拖 chip 与目标之间的 chip 平移让开
  if (qrDrag.active && qrDrag.longPress && qrDrag.instId === instId && qrDrag.gIdx === gIdx) {
    const from = qrDrag.fromVis, to = qrDrag.toIdx
    if (from >= 0 && to >= 0 && from !== to) {
      const w = qrDrag.chipWidths[vi] || 60
      if (to > from && vi > from && vi <= to) {
        return { transform: `translateX(${-(w + 4)}px)` }
      }
      if (to < from && vi >= to && vi < from) {
        return { transform: `translateX(${w + 4}px)` }
      }
    }
  }
  return {}
}

function qrChipDown(e: PointerEvent, instId: number, gIdx: number, idx: number) {
  qrDrag.active = true
  qrDrag.longPress = false
  qrDrag.instId = instId
  qrDrag.gIdx = gIdx
  qrDrag.idx = idx
  qrDrag.toIdx = idx
  qrDrag.x = 0
  qrDrag.y = 0
  qrDrag.sx = e.clientX
  qrDrag.sy = e.clientY
  // 记录被拖 chip 的可见顺序索引 + 所有 chip 宽度（目标计算排除自己 + 让位动画）
  const card = (e.currentTarget as HTMLElement).closest('.qr-phone')
  const chips = card ? Array.from(card.querySelectorAll('.qr-chip[data-g="' + gIdx + '"]')) : []
  qrDrag.visIdx = chips.indexOf(e.currentTarget as HTMLElement)
  qrDrag.fromVis = qrDrag.visIdx
  qrDrag.chipWidths = chips.map(c => (c as HTMLElement).getBoundingClientRect().width)
  clearTimeout(qrDragTimer)
  qrDragTimer = setTimeout(() => { qrDrag.longPress = true }, 300)
}

function qrChipMove(e: PointerEvent, gIdx: number) {
  if (!qrDrag.active || qrDrag.idx < 0 || qrDrag.gIdx !== gIdx) return
  // 未长按前快速移动则取消（视为普通点击）
  if (!qrDrag.longPress) {
    if (Math.abs(e.clientX - qrDrag.sx) > 6 || Math.abs(e.clientY - qrDrag.sy) > 6) {
      clearTimeout(qrDragTimer)
      qrDrag.active = false
      qrDrag.idx = -1
    }
    return
  }
  // 长按后跟随移动：chip 位移 = 指针位移（相对按下点）
  qrDrag.x = e.clientX - qrDrag.sx
  qrDrag.y = e.clientY - qrDrag.sy
  // 目标位置 = 指针落在的可见 chip（排除自己：自己跟随指针移动会一直盖住指针）
  const card = (e.currentTarget as HTMLElement).closest('.qr-phone')
  const chips = card ? Array.from(card.querySelectorAll('.qr-chip[data-g="' + gIdx + '"]')) : []
  let target = qrDrag.toIdx
  chips.forEach((c, i) => {
    if (i === qrDrag.visIdx) return
    const r = c.getBoundingClientRect()
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      target = i
    }
  })
  qrDrag.toIdx = target
  // 刷新宽度（让位动画的位移量随目标 chip 宽度变化）
  if (chips.length === qrDrag.chipWidths.length) {
    qrDrag.chipWidths = chips.map(c => (c as HTMLElement).getBoundingClientRect().width)
  }
}

function qrChipUp() {
  clearTimeout(qrDragTimer)
  if (qrDrag.active && qrDrag.longPress) {
    if (qrDrag.toIdx >= 0 && qrDrag.toIdx !== qrDrag.fromVis) {
      store.moveQuickReply(qrDrag.instId, qrDrag.gIdx, qrDrag.idx, qrDrag.toIdx)
    }
    qrSuppressClick = true
  }
  qrDrag.active = false
  qrDrag.longPress = false
  qrDrag.idx = -1
  qrDrag.x = 0
  qrDrag.y = 0
  qrDrag.chipWidths = []
}

function qrChipClick(instId: number, text: string) {
  if (qrSuppressClick) { qrSuppressClick = false; return }
  quickSend(instId, text)
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
      try { (w as any).setZoomFactor(1) } catch {}
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
    try { (w as any).setZoomFactor(1) } catch {}
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

/* 手机卡：固定高度（模拟手机竖屏比例），最多 3 个并排，超出自动换行 */
/* v2.9.30：移除内部硬编码的暗色变量覆盖 —— 之前写死导致切换亮/暗主题时实例不跟随配色。
   现在继承全局 tokens（.theme-dark / .theme-light），实例配色随应用主题实时切换 */
.qr-phone {
  width: 100%; height: 640px; display: flex; flex-direction: column; padding: 8px; gap: 6px; overflow: hidden;
  position: relative;
  border-radius: 22px;
  border: 1.5px solid var(--border-strong);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.22);
}
.qr-topbar { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.qr-name { flex: 1; min-width: 0; background: transparent; border: none; color: var(--text-primary); font-size: 13px; font-weight: 600; font-family: inherit; outline: none; padding: 2px 4px; }
/* 平台选择下拉 */
.qr-platform {
  flex-shrink: 0; max-width: 88px;
  background: var(--bg-card); border: 1px solid var(--border-strong); color: var(--text-secondary);
  font-size: 10px; padding: 1px 4px; border-radius: 6px; cursor: pointer; font-family: inherit; outline: none;
}
.qr-platform:hover { border-color: var(--primary); }
.qr-platform option { background: var(--bg-card); color: var(--text-primary); }
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
/* 删除关闭键：常显 + 圆形按钮化（实例卡加高后原 hover 才显示太不显眼） */
.qr-del-i {
  color: var(--danger);
  width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--danger); border-radius: 50%;
  font-size: 15px; line-height: 1;
  background: var(--danger-soft);
  transition: background .15s, color .15s;
}
.qr-del-i:hover { background: var(--danger); color: #fff; }

.qr-urlbar { display: flex; gap: 4px; flex-shrink: 0; align-items: center; }
/* 独立刷新按钮（替代下拉菜单里的刷新项） */
.qr-refresh-btn { font-size: 14px; padding: 3px 9px; }
.qr-refresh-btn:hover { border-color: var(--accent-cyan); color: var(--accent-cyan); background: var(--accent-cyan-soft); }
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
/* 平台登录/操作提示（面板底部灰色小字） */
.qr-more-hint {
  margin-top: 4px; padding-top: 4px; border-top: 1px dashed var(--border-default);
  font-size: 9px; color: var(--text-faint); line-height: 1.5; max-width: 180px; white-space: normal;
}
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

/* 历史直播间快捷填入（下拉菜单，省空间） */
.qr-history { position: relative; flex-shrink: 0; }
.qr-history-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; color: var(--text-secondary); background: var(--bg-card);
  border: 1px solid var(--border-strong); padding: 2px 8px; border-radius: 10px;
  cursor: pointer; font-family: inherit; white-space: nowrap;
  transition: border-color .15s, color .15s;
}
.qr-history-btn:hover, .qr-history-btn.open { border-color: var(--primary); color: var(--primary-hover); }
.qr-h-cnt { background: var(--primary-soft); color: var(--primary); border-radius: 7px; padding: 0 5px; font-size: 9px; }
.qr-h-arr { flex-shrink: 0; transition: transform .18s ease; }
.qr-history-btn.open .qr-h-arr { transform: rotate(180deg); }
/* 下拉面板：独立定位 + 高 z-index 防被机身 overflow 裁剪；面板内滚动防长列表溢出 */
.qr-history-panel {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 45;
  min-width: 240px; max-width: 300px; max-height: 180px; overflow-y: auto;
  background: var(--bg-card); border: 1px solid var(--border-strong);
  border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.45);
  padding: 4px; display: flex; flex-direction: column; gap: 2px;
}
.qr-history-panel::-webkit-scrollbar { width: 6px; }
.qr-history-panel::-webkit-scrollbar-thumb { background: var(--primary-border); border-radius: 3px; }
.qr-history-chip {
  display: flex; flex-direction: column; align-items: flex-start; gap: 0;
  width: 100%; text-align: left;
  font-size: 10px; color: var(--text-secondary); background: transparent;
  border: 1px solid transparent; padding: 3px 6px; border-radius: 6px; cursor: pointer;
  transition: border-color .15s, background .15s;
  touch-action: none; user-select: none; -webkit-user-select: none;
}
.qr-history-chip:hover { border-color: var(--primary); color: var(--primary-hover); background: var(--bg-hover); }
.qr-hi-name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.qr-hi-url { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-faint); font-size: 9px; }
.qr-history-chip.dragging {
  border-color: var(--primary); color: var(--primary-hover); background: var(--bg-active);
  box-shadow: 0 4px 14px rgba(240,80,110,0.3);
  cursor: grabbing; position: relative; z-index: 20;
}
/* 下拉展开/收起过渡 */
.qr-hdrop-enter-active, .qr-hdrop-leave-active { transition: opacity .14s ease, transform .14s ease; }
.qr-hdrop-enter-from, .qr-hdrop-leave-to { opacity: 0; transform: translateY(-4px); }
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
.qr-sm-clear { border-color: rgba(107,114,128,0.3); color: var(--text-muted); }
.qr-sm-clear:hover { background: rgba(107,114,128,0.1); }

.qr-body { flex: 1; display: flex; flex-direction: column; min-height: 0; gap: 6px; }
/* 手机屏幕：圆角大屏 + 内阴影 + 顶部屏幕装饰条 */
.qr-webview-wrap {
  flex: 0 1 240px; min-height: 120px; border-radius: 14px; overflow: auto;
  border: 1px solid var(--border-strong); position: relative;
  background: var(--bg-track);
  box-shadow: inset 0 0 12px rgba(0,0,0,0.25);
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
.qr-panel::-webkit-scrollbar-thumb:hover { background: rgba(240,80,110,0.7); }
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
.qr-groups::-webkit-scrollbar-thumb:hover { background: rgba(240,80,110,0.7); }
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
/* 紧凑 chip：点击发送，长按拖拽排序 */
.qr-g-btn.on { border-color: var(--success-border); color: var(--success); }
.qr-g-add { background: transparent; border: 1px dashed var(--border-strong); color: var(--text-muted); font-size: 9px; padding: 1px 6px; border-radius: 3px; cursor: pointer; font-family: inherit; width: fit-content; }
.qr-g-add:hover { border-color: var(--primary); color: var(--primary); }
.qr-g-empty { font-size: 10px; color: var(--text-dim); text-align: center; padding: 8px 0; }
.qr-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.qr-chip {
  display: inline-flex; align-items: center; gap: 0;
  background: var(--bg-selected); border: 1px solid var(--primary-soft);
  color: var(--primary-hover); font-size: 10px; padding: 0; border-radius: 10px;
  max-width: 180px; min-width: 0; min-height: 20px; overflow: hidden;
  cursor: pointer; user-select: none; -webkit-user-select: none; touch-action: none;
  transition: border-color .15s, box-shadow .15s, transform .18s ease;
}
.qr-chip:hover { border-color: var(--primary); }
.qr-chip-text {
  cursor: pointer; padding: 2px 8px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; flex: 1; min-width: 0;
}
.qr-chip-text:hover { color: #ff8ba0; }
/* 拖拽浮起效果 */
.qr-chip.dragging {
  position: relative;
  border-color: var(--primary); color: var(--primary-hover); background: var(--primary-soft);
  box-shadow: 0 4px 14px rgba(240, 80, 110, 0.35);
  cursor: grabbing;
}

/* 编辑模式：chip 同位置变 input + × */
.qr-chip-editing { background: var(--success-soft); border-color: var(--success-border); user-select: text; -webkit-user-select: text; touch-action: auto; cursor: default; }
.qr-chip-input {
  background: var(--bg-track); border: none; padding: 2px 6px; color: var(--text-primary);
  font-size: 10px; font-family: inherit; outline: none; flex: 1; min-width: 0; max-width: 150px;
}
.qr-chip-input:focus { background: var(--bg-card); }
.qr-chip-del {
  background: transparent; border: none; color: var(--text-muted); cursor: pointer;
  padding: 0 5px; line-height: 20px; flex-shrink: 0;
}
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
