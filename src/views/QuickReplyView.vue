<template>
  <div class="qr-page">
    <div class="qr-intro">
      <div class="qr-title">快捷回复</div>
      <div class="qr-subtitle">嵌入式直播页面 + 一键快捷发送（需先在页面内登录抖音）</div>
    </div>

    <div class="qr-grid-single" v-if="store.instances.length > 0">
      <div v-for="inst in store.instances" :key="inst.id" class="card qr-card-full" :class="{ 'qr-card-expanded': inst.expanded }">
        <div class="qr-card-header">
          <input v-model="inst.name" class="qr-name-input" placeholder="实例名称" />
          <div class="qr-url-row">
            <input v-model="inst.roomUrl" class="qr-url-input" placeholder="直播间链接" @keyup.enter="loadWebview(inst)" />
            <button :class="['qr-btn', inst.status === 'running' ? 'qr-btn-danger' : 'qr-btn-primary']" @click="inst.status === 'running' ? closeWebview(inst) : loadWebview(inst)">
              {{ inst.status === 'running' ? '关闭' : '加载' }}
            </button>
            <button v-if="inst.status === 'running'" class="qr-btn qr-btn-expand" @click="inst.expanded = !inst.expanded" :title="inst.expanded ? '收起' : '全屏预览'">
              {{ inst.expanded ? '收起' : '全屏' }}
            </button>
            <button v-if="inst.status === 'running'" class="qr-btn qr-btn-pause" @click="togglePause(inst)">
              {{ pauseMap[inst.id] ? '恢复' : '暂停' }}
            </button>
          </div>
        </div>

        <div class="qr-main" v-if="inst.status === 'running'" :class="{ 'qr-main-expanded': inst.expanded }">
          <div class="qr-browser-wrap" :class="{ 'qr-browser-full': inst.expanded }">
            <webview
              :ref="(el: any) => setWebviewRef(inst.id, el)"
              :src="resolveUrl(inst.roomUrl)"
              :partition="'persist:qr_' + inst.id"
              allowpopups="true"
              class="qr-webview"
              @dom-ready="onWebviewReady(inst.id)"
            />
          </div>

          <div class="qr-sidebar" v-show="!inst.expanded">

            <div class="qr-section-label">快捷回复 <button class="qr-add-group-btn" @click="store.addGroup(inst.id)">+ 分组</button></div>
            <div class="qr-groups">
              <div v-for="(group, gIdx) in inst.quickReplyGroups" :key="gIdx" class="qr-group">
                <div class="qr-group-header" @click="store.toggleGroup(inst.id, gIdx)">
                  <span class="qr-group-arrow">{{ group.expanded ? '▾' : '▸' }}</span>
                  <input v-model="group.name" class="qr-group-name" placeholder="分组名" @click.stop @blur="store.setGroupName(inst.id, gIdx, group.name)" />
                  <button class="qr-group-remove" @click.stop="store.removeGroup(inst.id, gIdx)" v-if="inst.quickReplyGroups.length > 1">×</button>
                </div>
                <div v-if="group.expanded" class="qr-group-body">
                  <div v-for="(_, qi) in group.items" :key="qi" class="qr-quick-field-row">
                    <input v-model="group.items[qi]" class="qr-quick-input" placeholder="快捷内容..." @blur="store.setQuickReply(inst.id, gIdx, qi, group.items[qi])" />
                    <button class="qr-remove-btn" @click="store.removeQuickReply(inst.id, gIdx, qi)">×</button>
                  </div>
                  <button class="qr-add-item-btn" @click="store.addQuickReply(inst.id, gIdx)">+ 添加短语</button>
                </div>
              </div>
            </div>

            <div class="qr-quick-btns">
              <template v-for="group in inst.quickReplyGroups" :key="'chip-' + group.name">
                <template v-if="group.expanded">
                  <button v-for="(qr, qi) in group.items.filter((t: string) => t.trim())" :key="'chip-' + qi" class="qr-chip" @click="quickSend(inst.id, qr)">{{ qr }}</button>
                </template>
              </template>
            </div>

            <div class="qr-send-row">
              <input v-model="inst.sendInput" class="qr-send-input" placeholder="手动输入..." @keyup.enter="manualSend(inst.id)" />
              <button class="qr-btn qr-btn-fill" @click="manualSend(inst.id)" :disabled="!inst.sendInput.trim()">发送</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useQuickReplyStore } from '../stores/quick-reply'

defineOptions({ name: 'QuickReplyView' })

const store = useQuickReplyStore()
const webviewRefs = ref<Record<number, HTMLWebViewElement>>({})
const pauseMap = ref<Record<number, boolean>>({})

function setWebviewRef(id: number, el: HTMLWebViewElement | null) {
  if (el) webviewRefs.value[id] = el
}

function togglePause(inst: any) {
  const paused = !pauseMap.value[inst.id]
  pauseMap.value[inst.id] = paused
  const webview = webviewRefs.value[inst.id]
  if (webview) {
    try {
      webview.executeJavaScript(paused
        ? `(function(){var v=document.querySelector('video');if(v)v.pause();return !!v})()`
        : `(function(){var v=document.querySelector('video');if(v)v.play();return !!v})()`)
    } catch (e) {}
  }
}

function resolveUrl(raw: string): string {
  if (!raw) return 'about:blank'
  return raw.includes('://') ? raw : 'https://' + raw
}

function loadWebview(inst: any) {
  if (!inst.roomUrl) return
  inst.status = 'running'
  inst.expanded = false
}

function closeWebview(inst: any) {
  inst.status = 'idle'
  inst.lastDanmu = []
  inst.expanded = false
  delete webviewRefs.value[inst.id]
}

function onWebviewReady(id: number) {
  const webview = webviewRefs.value[id]
  if (!webview) return

  try { webview.setAudioMuted(true) } catch (e) {}

  try {
    webview.insertCSS(`
      [class*="gift"], [class*="Gift"],
      [class*="like-animation"], [class*="LikeAnimation"],
      [class*="live-room-gift"], [class*="gift-panel"],
      [class*="giftPanel"], [class*="GiftPanel"],
      [class*="floating"], [class*="Floating"],
      [class*="interact-bar"], [class*="InteractBar"],
      [class*="shop"], [class*="Shop"],
      [class*="product"], [class*="Product"],
      [class*="mall"], [class*="Mall"],
      [class*="cart"], [class*="Cart"]
      { display: none !important; }
    `)
  } catch (e) {}
}

async function quickSend(id: number, text: string) {
  const webview = webviewRefs.value[id]
  if (!webview) return
  try {
    const result = await store.sendViaWebview(webview, text)
    if (!result.success) {
      alert('发送失败: ' + (result.error || '未知错误') + '\n\n请确保已在直播间页面中登录抖音账号')
    }
  } catch (e: any) {
    alert('发送异常: ' + e.message)
  }
}

async function manualSend(id: number) {
  const inst = store.instances.find(i => i.id === id)
  if (!inst || !inst.sendInput.trim()) return
  const text = inst.sendInput.trim()
  inst.sendInput = ''
  await quickSend(id, text)
}
</script>

<style scoped>
.qr-page { padding: 12px 16px 16px; height: 100%; overflow: hidden; display: flex; flex-direction: column; }
.qr-intro { margin-bottom: 12px; flex-shrink: 0; }
.qr-title { font-size: 18px; font-weight: 700; color: #e0e2e8; }
.qr-subtitle { font-size: 12px; color: #6b7080; margin-top: 2px; }
.qr-grid-single { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }

.qr-card-full { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; }
.qr-card-expanded { position: absolute; top: 38px; left: 200px; right: 0; bottom: 0; z-index: 100; margin: 0; border-radius: 0; }

.qr-card-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
.qr-name-input { background: #111318; border: 1px solid #2a2d36; border-radius: 6px; padding: 6px 10px; color: #e0e2e8; font-size: 14px; font-weight: 600; font-family: inherit; width: 110px; outline: none; flex-shrink: 0; }
.qr-name-input:focus { border-color: #f97316; }
.qr-url-row { display: flex; gap: 6px; flex: 1; min-width: 0; }
.qr-url-input { flex: 1; background: #111318; border: 1px solid #2a2d36; border-radius: 6px; padding: 6px 10px; color: #a0a4b0; font-size: 11px; font-family: inherit; outline: none; min-width: 160px; }
.qr-url-input:focus { border-color: #f97316; }
.qr-btn { padding: 5px 12px; border-radius: 6px; font-size: 12px; font-family: inherit; cursor: pointer; border: none; transition: all 0.15s; white-space: nowrap; }
.qr-btn-primary { background: #f97316; color: #fff; }
.qr-btn-primary:hover { background: #fb923c; }
.qr-btn-danger { background: rgba(239,68,68,0.12); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
.qr-btn-danger:hover { background: rgba(239,68,68,0.2); }
.qr-btn-expand { background: rgba(59,130,246,0.1); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3); }
.qr-btn-expand:hover { background: rgba(59,130,246,0.2); }
.qr-btn-fill { background: rgba(249,115,22,0.1); color: #f97316; border: 1px solid rgba(249,115,22,0.3); }
.qr-btn-fill:hover { background: rgba(249,115,22,0.2); }
.qr-btn-fill:disabled { opacity: 0.3; cursor: default; }

.qr-main { display: flex; gap: 12px; flex: 1; min-height: 0; }
.qr-main-expanded { gap: 0; }
.qr-browser-wrap { flex: 1; min-width: 0; border-radius: 8px; overflow: auto; border: 1px solid #2a2d36; position: relative; }
.qr-browser-full { border-radius: 0; border: none; }
.qr-webview { width: 1024px; min-height: 680px; display: flex; }

.qr-sidebar { width: 250px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }

.qr-section-label { font-size: 11px; color: #5a5e6e; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.qr-btn-effect { background: rgba(234,179,8,0.1); color: #eab308; border: 1px solid rgba(234,179,8,0.3); }
.qr-btn-effect:hover { background: rgba(234,179,8,0.2); }

.qr-add-group-btn { background: rgba(249,115,22,0.08); border: 1px solid rgba(249,115,22,0.3); color: #fb923c; font-size: 11px; padding: 2px 10px; border-radius: 4px; cursor: pointer; font-family: inherit; margin-left: auto; }
.qr-add-group-btn:hover { background: rgba(249,115,22,0.18); }
.qr-groups { display: flex; flex-direction: column; gap: 3px; }
.qr-group { border: 1px solid #1e2028; border-radius: 6px; overflow: hidden; }
.qr-group-header { display: flex; align-items: center; gap: 4px; padding: 3px 8px; background: #15171e; cursor: pointer; user-select: none; }
.qr-group-header:hover { background: #1a1d26; }
.qr-group-arrow { color: #5a5e6e; font-size: 12px; width: 14px; text-align: center; flex-shrink: 0; }
.qr-group-name { flex: 1; background: transparent; border: none; color: #a0a4b0; font-size: 11px; font-weight: 600; font-family: inherit; outline: none; min-width: 0; }
.qr-group-name:focus { color: #e0e2e8; }
.qr-group-remove { background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 14px; padding: 0 4px; line-height: 1; }
.qr-group-body { padding: 3px 8px 6px; display: flex; flex-direction: column; gap: 3px; }
.qr-add-item-btn { background: transparent; border: 1px dashed #2a2d36; color: #5a5e6e; font-size: 10px; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-family: inherit; width: fit-content; }
.qr-add-item-btn:hover { border-color: #f97316; color: #f97316; }

.qr-quick-field-row { display: flex; gap: 4px; align-items: center; }
.qr-quick-input { flex: 1; background: #111318; border: 1px solid #2a2d36; border-radius: 4px; padding: 3px 8px; color: #a0a4b0; font-size: 11px; font-family: inherit; outline: none; }
.qr-quick-input:focus { border-color: #f97316; }
.qr-remove-btn { background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 16px; padding: 0 4px; line-height: 1; }

.qr-quick-btns { display: flex; flex-wrap: wrap; gap: 4px; }
.qr-chip { background: rgba(249,115,22,0.08); border: 1px solid rgba(249,115,22,0.2); color: #fb923c; font-size: 11px; padding: 3px 10px; border-radius: 12px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
.qr-chip:hover { background: rgba(249,115,22,0.18); }

.qr-send-row { display: flex; gap: 6px; margin-top: auto; padding-top: 6px; }
.qr-send-input { flex: 1; background: #111318; border: 1px solid #2a2d36; border-radius: 6px; padding: 6px 10px; color: #e0e2e8; font-size: 12px; font-family: inherit; outline: none; }
.qr-send-input:focus { border-color: #f97316; }
</style>
