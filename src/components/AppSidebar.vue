<template>
  <div class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="3" width="20" height="14" rx="3" stroke="#f97316" stroke-width="2"/>
          <path d="M8 21h8M12 17v4" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="10" r="3" fill="#f97316" opacity="0.3"/>
        </svg>
      </div>
      <span class="brand-name">LiveMonitor</span>
    </div>
    <div class="nav-items">
      <button
        v-for="item in navItems"
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
      <div class="version-tag">V 2.5.1</div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ current: string }>()
defineEmits<{ navigate: [path: string] }>()

const navItems = [
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
  },
  {
    path: '/settings',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    label: '设置'
  },
  {
    path: '/quick-reply',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2 L2 7 L12 12 L22 7 L12 2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M2 17 L12 22 L22 17" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M2 12 L12 17 L22 12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    label: '回复'
  },
  {
    path: '/offline',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    label: '下播数据'
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
  background: #0d0f14;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #1a1d26;
  padding: 20px 8px 12px;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px 20px;
  border-bottom: 1px solid #1a1d26;
  margin-bottom: 16px;
}

.brand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-name {
  font-size: 14px;
  font-weight: 700;
  color: #e0e2e8;
  letter-spacing: 0.5px;
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: #5a5e6e;
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  position: relative;
  transition: all 0.2s ease;
}

.nav-item:hover {
  background: rgba(249, 115, 22, 0.06);
  color: #a0a4b0;
}

.nav-item.active {
  background: rgba(249, 115, 22, 0.1);
  color: #f97316;
  font-weight: 600;
}

.nav-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  background: linear-gradient(180deg, #f97316, #ef4444);
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
  border-top: 1px solid #1a1d26;
}

.version-tag {
  text-align: center;
  font-size: 10px;
  color: #3a3d46;
  letter-spacing: 1px;
  font-weight: 500;
}
</style>
