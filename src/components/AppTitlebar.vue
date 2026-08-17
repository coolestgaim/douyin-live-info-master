<template>
  <div class="titlebar">
    <div class="titlebar-left">
      <div class="app-dot"></div>
      <span class="app-name">灼灼直播控场</span>
    </div>
    <div class="titlebar-center"></div>
    <div class="titlebar-controls">
      <button
        class="titlebar-btn theme-btn"
        @click="toggleTheme"
        :title="isDark ? '切换到亮色主题' : '切换到暗色主题'"
      >
        <svg v-if="isDark" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.8"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      </button>
      <button :class="['titlebar-btn', { active: pinned }]" @click="togglePin" title="置顶窗口">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M16 4V2M12 4V2M8 4V2M5 10h14M5 10v10l2 2h10l2-2V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="12" cy="10" r="1.5" :fill="pinned ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
      <button class="titlebar-btn" @click="minimize" title="最小化">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="titlebar-btn" @click="maximize" :title="maximized ? '还原窗口' : '最大化'">
        <svg v-if="!maximized" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="5" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="8" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/>
          <path d="M9 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="titlebar-btn titlebar-btn-close" @click="close" title="关闭">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '../stores/settings'

const api = () => (window as any).electronAPI
const settingsStore = useSettingsStore()
const pinned = ref(false)
const maximized = ref(false)

const isDark = computed(() => settingsStore.themeMode === 'dark')

function toggleTheme() {
  settingsStore.toggleTheme()
}

onMounted(async () => {
  pinned.value = await api().windowIsPinned()
  try {
    maximized.value = await api().windowIsMaximized?.() ?? false
  } catch { /* 无此接口时忽略 */ }
  api().onWindowMaximizeChange?.((isMax: boolean) => { maximized.value = isMax })
})

onUnmounted(() => {
  api().offWindowMaximizeChange?.()
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
  height: 38px;
  display: flex;
  align-items: center;
  background: var(--bg-titlebar);
  border-bottom: 1px solid var(--border-default);
  -webkit-app-region: drag;
  user-select: none;
}
.titlebar-left {
  width: 200px;
  display: flex;
  align-items: center;
  padding-left: 20px;
  gap: 8px;
}
.app-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent-cyan));
  box-shadow: 0 0 8px var(--primary-border);
}
.app-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}
.titlebar-center { flex: 1; }
.titlebar-controls { display: flex; -webkit-app-region: no-drag; }
.titlebar-btn {
  width: 38px;
  height: 38px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.titlebar-btn:hover { background: var(--bg-card-hover); color: var(--text-primary); }
.titlebar-btn.active { color: var(--primary); }
.theme-btn:hover { color: var(--primary); }
.titlebar-btn-close:hover { background: var(--danger); color: #ffffff; border-radius: 0 0 8px 0; }
</style>
