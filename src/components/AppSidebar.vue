<template>
  <div class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="3" width="20" height="14" rx="3" stroke="var(--primary)" stroke-width="2"/>
          <path d="M8 21h8M12 17v4" stroke="var(--accent-cyan)" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="10" r="3" fill="var(--primary)" opacity="0.35"/>
        </svg>
      </div>
      <div class="brand-text">
        <span class="brand-name">灼灼直播控场</span>
        <span class="brand-sub">直播中控台</span>
      </div>
    </div>

    <div class="nav-group">
      <div class="nav-group-label">直播</div>
      <button
        v-for="item in liveNavItems"
        :key="item.path"
        :class="['nav-item', { active: current === item.path }]"
        @click="$emit('navigate', item.path)"
      >
        <div :class="['nav-indicator', { visible: current === item.path }]"></div>
        <span class="nav-icon" v-html="item.icon"></span>
        <span class="nav-label">{{ item.label }}</span>
      </button>
    </div>

    <div class="nav-group">
      <div class="nav-group-label">工具</div>
      <button
        v-for="item in toolNavItems"
        :key="item.path"
        :class="['nav-item', { active: current === item.path }]"
        @click="$emit('navigate', item.path)"
      >
        <div :class="['nav-indicator', { visible: current === item.path }]"></div>
        <span class="nav-icon" v-html="item.icon"></span>
        <span class="nav-label">{{ item.label }}</span>
      </button>
    </div>

    <div class="sidebar-footer">
      <button class="theme-switch" @click="settingsStore.toggleTheme()" :title="isDark ? '切换到亮色主题' : '切换到暗色主题'">
        <svg v-if="isDark" width="13" height="13" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.8"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
        <span class="theme-switch-text">{{ isDark ? '亮色主题' : '暗色主题' }}</span>
      </button>
      <div class="version-tag">V {{ version }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settings'

defineProps<{ current: string }>()
defineEmits<{ navigate: [path: string] }>()

const settingsStore = useSettingsStore()
const isDark = computed(() => settingsStore.themeMode === 'dark')
const version = '2.9.5'

const liveNavItems = [
  {
    path: '/dashboard',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="14" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/></svg>',
    label: '仪表盘'
  },
  {
    path: '/rooms',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="13" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    label: '直播间'
  },
  {
    path: '/danmu',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    label: '弹幕'
  },
  {
    path: '/recording',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>',
    label: '录制'
  }
]

const toolNavItems = [
  {
    path: '/quick-reply',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2 L2 7 L12 12 L22 7 L12 2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M2 17 L12 22 L22 17" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M2 12 L12 17 L22 12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    label: '快捷回复'
  },
  {
    path: '/settings',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    label: '设置'
  },
  {
    path: '/about',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    label: '关于'
  }
]
</script>

<style scoped>
.sidebar {
  background: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-default);
  padding: 16px 8px 12px;
  transition: background-color 0.25s ease;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px 16px;
  border-bottom: 1px solid var(--border-default);
  margin-bottom: 12px;
}

.brand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.brand-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}

.brand-sub {
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 1px;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}

.nav-group-label {
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 1px;
  padding: 4px 12px 4px;
  user-select: none;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  position: relative;
  transition: all 0.2s ease;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.nav-item.active {
  background: var(--bg-active);
  color: var(--primary);
  font-weight: 600;
}

.nav-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  background: linear-gradient(180deg, var(--primary), var(--accent-cyan));
  border-radius: 0 3px 3px 0;
  transition: height 0.2s ease;
}

.nav-indicator.visible {
  height: 20px;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.theme-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s ease;
}

.theme-switch:hover {
  border-color: var(--primary-border);
  color: var(--primary);
  background: var(--bg-hover);
}

.theme-switch-text {
  flex: 1;
  text-align: left;
}

.version-tag {
  text-align: center;
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 1px;
  font-weight: 500;
}
</style>
