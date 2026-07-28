<template>
  <div class="qr-page">
    <div class="qr-header">
      <span class="qr-title">快捷回复</span>
      <button class="qr-add-btn" @click="store.addInstance()">+ 添加实例</button>
    </div>

    <div class="qr-scroll" v-if="store.instances.length > 0">
      <div v-for="inst in store.instances" :key="inst.id" class="card qr-phone" :style="phoneStyle(inst.id)">
        <!-- 实例顶栏 -->
        <div class="qr-topbar">
          <input v-model="inst.name" class="qr-name" placeholder="实例名称" />
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
          <button v-if="inst.status === 'running'" class="qr-sm-btn" @click="toggleStripped(inst)"
            :title="inst._stripped ? '恢复全部元素' : '精简模式'">{{ inst._stripped ? '恢复' : '精简' }}</button>
          <button v-if="inst.status === 'running'" class="qr-sm-btn qr-sm-ref" @click="refreshWebview(inst)">刷新</button>
          <button v-if="inst.status === 'running'" class="qr-sm-btn qr-sm-clear" @click="clearLogin(inst)">清登</button>
        </div>

        <!-- 手机主体 -->
        <div class="qr-body" v-show="inst.status === 'running'">
          <div class="qr-webview-wrap">
            <webview :ref="(el:any) => setWebviewRef(inst.id, el)" :src="resolveUrl(inst.roomUrl)"
              :partition="'persist:qr_'+inst.id" allowpopups="true" class="qr-wv" @dom-ready="onWebviewReady(inst.id)" />
          </div>

          <!-- 回复面板 -->
          <div class="qr-panel">
            <div class="qr-pin-row">
              <span>输入框</span>
              <button v-if="inst.inputPinState !== 'pinning'" class="qr-pin" @click="pinInput(inst)">定位</button>
              <span v-if="inst.inputPinState === 'pinning'" class="qr-pin-h">点击页面中的输入框...</span>
              <span v-if="inst.inputPinState === 'ok'" class="qr-pin-o">✓</span>
              <span style="color:#5a5e6e">|</span>
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
                <div v-for="(g, gi) in inst.quickReplyGroups" :key="gi" class="qr-g">
                  <div class="qr-g-title" @click="store.toggleGroup(inst.id, gi)">
                    <span class="qr-g-arr">{{ g.expanded ? '▾' : '▸' }}</span>
                    <input :value="g.name" @input="store.setGroupName(inst.id, gi, ($event.target as HTMLInputElement).value)"
                      class="qr-g-name" placeholder="分组名" @click.stop />
                    <button v-if="inst.quickReplyGroups.length>1" class="qr-g-del" @click.stop="store.removeGroup(inst.id, gi)">×</button>
                    <button class="qr-g-btn" @click.stop="doExportGroup(inst.id, gi)" title="导出此分组">导出</button>
                  </div>
                  <div v-if="g.expanded" class="qr-g-body">
                    <!-- 编辑/发送 tab -->
                    <div class="qr-g-tabs">
                      <button :class="['qr-g-tab', { active: g._tab === 'send' }]" @click.stop="g._tab = 'send'">▶ 发送</button>
                      <button :class="['qr-g-tab', { active: g._tab === 'edit' }]" @click.stop="g._tab = 'edit'">📝 编辑</button>
                    </div>
                    <!-- 发送 tab：chip 按钮 -->
                    <div v-if="g._tab === 'send'">
                      <div class="qr-chips" v-if="g.items.filter(t=>t.trim()).length">
                        <button v-for="(qr, qi) in g.items.filter((t:string)=>t.trim())" :key="qi" class="qr-chip"
                          @click="quickSend(inst.id, qr)">{{ qr }}</button>
                      </div>
                      <div v-else class="qr-g-empty">暂无短语，切换到编辑添加</div>
                    </div>
                    <!-- 编辑 tab：文本框列表 -->
                    <div v-if="g._tab === 'edit'">
                      <div v-for="(_, qi) in g.items" :key="qi" class="qr-g-row">
                        <input :value="g.items[qi]"
                          @input="store.setQuickReply(inst.id, gi, qi, ($event.target as HTMLInputElement).value)"
                          class="qr-g-inp" placeholder="快捷内容..." />
                        <button class="qr-g-rm" @click="store.removeQuickReply(inst.id, gi, qi)">×</button>
                      </div>
                      <button class="qr-g-add" @click="store.addQuickReply(inst.id, gi)">+ 添加短语</button>
                    </div>
                  </div>
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
      </div>
    </div>

    <input ref="importInput" type="file" accept=".json" style="display:none" @change="doImport" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useQuickReplyStore } from '../stores/quick-reply'

defineOptions({ name: 'QuickReplyView' })
const store = useQuickReplyStore()
const wvRefs = ref<Record<number, HTMLWebViewElement>>({})
const importInput = ref<HTMLInputElement | null>(null)
const phoneH = ref<Record<number, number>>({})
const burstMap = reactive<Record<number, boolean>>({})

const STRIP_RULES = `.webcast-chatroom > :not(.pZzS8QUV):not(.webcast-chatroom___input-container){display:none!important}.LyAdeVIF.sBRqUw32,[class*="gift"],[class*="floating"],[class*="Floating"],[class*="interact-bar"],[class*="VideoPlayer"],video,[class*="player-container"],[class*="Player"],[class*="shop"],[class*="Shop"],[class*="product"],[class*="mall"],[class*="cart"]{display:none!important}`

function phoneStyle(id: number) {
  const h = phoneH.value[id]
  return h ? { flex: 'none', height: h + 'px' } : {}
}

function setWebviewRef(id: number, el: HTMLWebViewElement | null) {
  if (el) wvRefs.value[id] = el
}
function resolveUrl(raw: string) { return raw ? (raw.includes('://') ? raw : 'https://' + raw) : 'about:blank' }

function loadWebview(inst: any) { if (inst.roomUrl) { inst.status = 'running'; inst._stripped = true } }
function closeWebview(inst: any) { inst.status = 'idle'; delete wvRefs.value[inst.id] }
function doRemoveInstance(inst: any) { if (inst.status === 'running') closeWebview(inst); store.removeInstance(inst.id) }
function refreshWebview(inst: any) { const w = wvRefs.value[inst.id]; if (w) try { w.reload() } catch {} }

// 精简模式
const stripKeys = ref<Record<number, string>>({})

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
  // 默认应用精简模式
  const inst = store.instances.find(i => i.id === id)
  if (inst && inst._stripped) {
    (w as any).insertCSS(STRIP_RULES).then((key: any) => { stripKeys.value[id] = key }).catch(() => {})
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
.qr-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; padding: 10px 12px 12px; }
.qr-header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; margin-bottom: 8px; }
.qr-title { font-size: 16px; font-weight: 700; color: #e0e2e8; }
.qr-add-btn { background: transparent; border: 1px dashed #2a2d36; color: #5a5e6e; font-size: 11px; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-family: inherit; }
.qr-add-btn:hover { border-color: #f97316; color: #f97316; }

.qr-scroll { flex: 1; min-height: 0; display: flex; gap: 10px; overflow-x: auto; overflow-y: hidden; padding: 4px 0; }

/* 手机卡 */
.qr-phone { width: 375px; min-width: 375px; display: flex; flex-direction: column; padding: 8px; gap: 6px; flex-shrink: 0; min-height: 400px; overflow-y: auto; }
.qr-topbar { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.qr-name { flex: 1; background: transparent; border: none; color: #e0e2e8; font-size: 13px; font-weight: 600; font-family: inherit; outline: none; padding: 2px 4px; }
.qr-top-actions { display: flex; gap: 4px; }
.qr-top-btn { background: transparent; border: none; color: #5a5e6e; font-size: 14px; cursor: pointer; padding: 0 4px; line-height: 1; }
.qr-del-i { color: #ef4444; }

.qr-urlbar { display: flex; gap: 4px; flex-shrink: 0; }
.qr-url { flex: 1; background: #111318; border: 1px solid #2a2d36; border-radius: 4px; padding: 4px 8px; color: #a0a4b0; font-size: 10px; font-family: inherit; outline: none; min-width: 0; }
.qr-url:focus { border-color: #f97316; }
.qr-sm-btn { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-family: inherit; cursor: pointer; border: 1px solid #2a2d36; background: transparent; color: #6b7080; white-space: nowrap; }
.qr-sm-btn:hover { border-color: #f97316; color: #a0a4b0; }
.qr-sm-pri { background: #f97316; color: #fff; border-color: #f97316; }
.qr-sm-pri:hover { background: #fb923c; }
.qr-sm-danger { background: rgba(239,68,68,0.12); color: #ef4444; border-color: rgba(239,68,68,0.3); }
.qr-sm-danger:hover { background: rgba(239,68,68,0.2); }
.qr-sm-ref { border-color: rgba(34,197,94,0.3); color: #22c55e; }
.qr-sm-ref:hover { background: rgba(34,197,94,0.1); }
.qr-sm-clear { border-color: rgba(107,114,128,0.3); color: #6b7280; }
.qr-sm-clear:hover { background: rgba(107,114,128,0.1); }

.qr-body { flex: 1; display: flex; flex-direction: column; min-height: 0; gap: 6px; }
.qr-webview-wrap { flex: 1; min-height: 240px; border-radius: 8px; overflow: auto; border: 1px solid #2a2d36; position: relative; }
.qr-wv { width: 1024px; min-height: 680px; display: flex; }

/* 回复面板 */
.qr-panel { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; max-height: 60%; overflow-y: auto; }
.qr-pin-row { font-size: 10px; color: #5a5e6e; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.qr-pin { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); color: #22c55e; font-size: 9px; padding: 1px 6px; border-radius: 3px; cursor: pointer; font-family: inherit; }
.qr-pin:hover { background: rgba(34,197,94,0.2); }
.qr-pin-s { border-color: rgba(249,115,22,0.3); color: #f97316; }
.qr-pin-s:hover { background: rgba(249,115,22,0.15); }
.qr-pin-h { font-size: 9px; color: #eab308; }
.qr-pin-o { font-size: 9px; color: #22c55e; }
.qr-pin-x { background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 10px; padding: 0 2px; }

.qr-groups { border: 1px solid #1e2028; border-radius: 6px; overflow: hidden; }
.qr-g-hd { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: #15171e; font-size: 10px; color: #6b7080; }
.qr-g-actions { display: flex; gap: 3px; }
.qr-g-btn { background: transparent; border: 1px solid #2a2d36; color: #5a5e6e; font-size: 9px; padding: 1px 6px; border-radius: 3px; cursor: pointer; font-family: inherit; }
.qr-g-btn:hover { border-color: #f97316; color: #f97316; }
.qr-g-io { color: #6b7080; }
.qr-g-io:hover { border-color: #5a5e6e; color: #a0a4b0; }
.qr-g-list { display: flex; flex-direction: column; gap: 2px; padding: 2px; }
.qr-g { border: 1px solid #1e2028; border-radius: 4px; overflow: hidden; }
.qr-g-title { display: flex; align-items: center; gap: 3px; padding: 2px 6px; background: #13151c; cursor: pointer; user-select: none; font-size: 10px; }
.qr-g-title:hover { background: #1a1d26; }
.qr-g-arr { color: #5a5e6e; font-size: 10px; width: 12px; text-align: center; flex-shrink: 0; }
.qr-g-name { flex: 1; background: transparent; border: none; color: #a0a4b0; font-size: 10px; font-weight: 600; font-family: inherit; outline: none; min-width: 0; }
.qr-g-name:focus { color: #e0e2e8; }
.qr-g-del { background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 12px; padding: 0 2px; line-height: 1; }
.qr-g-body { padding: 2px 6px 4px; display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto; }
.qr-g-row { display: flex; gap: 3px; align-items: center; }
.qr-g-inp { flex: 1; background: #111318; border: 1px solid #2a2d36; border-radius: 3px; padding: 2px 6px; color: #a0a4b0; font-size: 10px; font-family: inherit; outline: none; }
.qr-g-inp:focus { border-color: #f97316; }
.qr-g-rm { background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 12px; padding: 0 2px; line-height: 1; }
.qr-g-add { background: transparent; border: 1px dashed #2a2d36; color: #5a5e6e; font-size: 9px; padding: 1px 6px; border-radius: 3px; cursor: pointer; font-family: inherit; width: fit-content; }
.qr-g-add:hover { border-color: #f97316; color: #f97316; }
.qr-g-tabs { display: flex; gap: 2px; margin-bottom: 4px; }
.qr-g-tab { flex: 1; background: transparent; border: 1px solid #2a2d36; color: #5a5e6e; font-size: 9px; padding: 2px 0; border-radius: 4px; cursor: pointer; font-family: inherit; text-align: center; transition: all .15s; }
.qr-g-tab:hover { border-color: #f97316; color: #a0a4b0; }
.qr-g-tab.active { background: rgba(249,115,22,0.1); border-color: #f97316; color: #f97316; font-weight: 600; }
.qr-g-empty { font-size: 10px; color: #3a3d46; text-align: center; padding: 8px 0; }

.qr-chips { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
.qr-chip { background: rgba(249,115,22,0.08); border: 1px solid rgba(249,115,22,0.2); color: #fb923c; font-size: 10px; padding: 2px 8px; border-radius: 10px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
.qr-chip:hover { background: rgba(249,115,22,0.18); }

.qr-send { display: flex; gap: 4px; flex-shrink: 0; }
.qr-ta { flex: 1; background: #111318; border: 1px solid #2a2d36; border-radius: 4px; padding: 3px 6px; color: #e0e2e8; font-size: 10px; font-family: inherit; outline: none; resize: none; }
.qr-ta:focus { border-color: #f97316; }
.qr-send-btn { padding: 3px 10px; border-radius: 4px; font-size: 10px; font-family: inherit; cursor: pointer; border: none; background: rgba(249,115,22,0.1); color: #f97316; border: 1px solid rgba(249,115,22,0.3); white-space: nowrap; }
.qr-send-btn:hover { background: rgba(249,115,22,0.2); }
.qr-send-btn:disabled { opacity: 0.3; cursor: default; }
.qr-send-burst { border-color: rgba(168,85,247,0.3); color: #a855f7; }
.qr-send-burst:hover:not(:disabled) { background: rgba(168,85,247,0.15); }
</style>
