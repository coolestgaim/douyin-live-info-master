<template>
  <div class="titlebar">
    <div class="titlebar-left">
      <div class="app-dot"></div>
    </div>
    <div class="titlebar-center">抖音直播间信息获取</div>
    <div class="titlebar-controls">
      <button :class="['titlebar-btn', { active: pinned }]" @click="togglePin" title="置顶窗口">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M16 4V2M12 4V2M8 4V2M5 10h14M5 10v10l2 2h10l2-2V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="12" cy="10" r="1.5" :fill="pinned ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
      <button class="titlebar-btn" @click="minimize">&#xE921;</button>
      <button class="titlebar-btn" @click="maximize">&#xE922;</button>
      <button class="titlebar-btn titlebar-btn-close" @click="close">&#xE8BB;</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const api = () => (window as any).electronAPI
const pinned = ref(false)

onMounted(async () => {
  pinned.value = await api().windowIsPinned()
})

async function togglePin() {
  pinned.value = await api().windowPin()
}

function minimize() { api().windowMinimize?.() }
function maximize() { api().windowMaximize?.() }
function close() { api().windowClose?.() }
</script>

<style scoped>
.titlebar {
  height: 38px; display: flex; align-items: center; background: #0d0f14;
  border-bottom: 1px solid #1a1d26; -webkit-app-region: drag; user-select: none;
}
.titlebar-left { width: 200px; display: flex; align-items: center; padding-left: 20px; gap: 8px; }
.app-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  box-shadow: 0 0 8px rgba(249, 115, 22, 0.4);
}
.titlebar-center { flex: 1; text-align: center; font-size: 11px; color: #3a3d46; letter-spacing: 0.5px; }
.titlebar-controls { display: flex; -webkit-app-region: no-drag; }
.titlebar-btn {
  width: 38px; height: 38px; border: none; background: transparent;
  color: #5a5e6e; font-family: 'Segoe MDL2 Assets'; font-size: 10px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
}
.titlebar-btn:hover { background: #1a1d26; color: #a0a4b0; }
.titlebar-btn.active { color: #f97316; }
.titlebar-btn-close:hover { background: #dc2626; color: white; border-radius: 0 0 8px 0; }
</style>
