<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
      <div class="app-frame">
        <AppTitlebar />
        <div class="app-body">
          <AppSidebar :current="currentRoute" @navigate="navigate" />
          <div class="app-content">
            <DashboardView v-show="currentRoute === '/dashboard'" />
            <LiveRoomsView v-show="currentRoute === '/rooms'" />
            <DanmuView v-show="currentRoute === '/danmu'" />
            <RecordingView v-show="currentRoute === '/recording'" />
            <SettingsView v-show="currentRoute === '/settings'" />
            <QuickReplyView v-show="currentRoute === '/quick-reply'" />
            <AboutView v-show="currentRoute === '/about'" />
          </div>
        </div>
      </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { darkTheme, lightTheme, NConfigProvider, NMessageProvider, NDialogProvider, type GlobalThemeOverrides } from 'naive-ui'
import AppTitlebar from './components/AppTitlebar.vue'
import AppSidebar from './components/AppSidebar.vue'
import DashboardView from './views/DashboardView.vue'
import LiveRoomsView from './views/LiveRoomsView.vue'
import DanmuView from './views/DanmuView.vue'
import RecordingView from './views/RecordingView.vue'
import SettingsView from './views/SettingsView.vue'
import QuickReplyView from './views/QuickReplyView.vue'
import AboutView from './views/AboutView.vue'
import { useSettingsStore } from './stores/settings'

const router = useRouter()
const route = useRoute()
const settingsStore = useSettingsStore()

const currentRoute = computed(() => route.path)

function navigate(path: string) {
  router.push(path)
}

/* ===== 双主题 ===== */
const isDark = computed(() => settingsStore.themeMode === 'dark')
const naiveTheme = computed(() => (isDark.value ? darkTheme : lightTheme))

// 主题切换时同步 html class，驱动 tokens.css 变量
watch(isDark, (dark) => {
  document.documentElement.classList.toggle('theme-dark', dark)
  document.documentElement.classList.toggle('theme-light', !dark)
}, { immediate: true })

const themeOverrides = computed<GlobalThemeOverrides>(() => {
  if (isDark.value) {
    return {
      common: {
        primaryColor: '#f0506e',
        primaryColorHover: '#f26b84',
        primaryColorPressed: '#d13b58',
        primaryColorSuppl: '#f26b84',
        infoColor: '#5b9bf0',
        successColor: '#4cc38a',
        warningColor: '#e9b949',
        errorColor: '#e5484d',
        borderRadius: '10px',
        fontFamily: 'Microsoft YaHei UI, system-ui, sans-serif',
        borderColor: 'var(--border-strong)',
        dividerColor: 'var(--border-default)'
      },
      DataTable: {
        tdColor: 'var(--bg-card)',
        thColor: 'var(--bg-elevated)',
        borderColor: 'var(--border-default)',
        thTextColor: 'var(--text-secondary)',
        tdTextColor: 'var(--text-secondary)'
      },
      Input: {
        color: 'var(--bg-card)',
        borderColor: 'var(--border-strong)',
        colorFocus: 'var(--bg-card)'
      },
      Tabs: {
        tabTextColorLine: 'var(--text-muted)',
        tabTextColorActiveLine: '#f0506e',
        barColor: '#f0506e'
      },
      Button: {
        borderRadiusMedium: '8px',
        borderRadiusSmall: '6px'
      },
      InternalSelection: {
        color: 'var(--bg-card)',
        borderColor: 'var(--border-strong)'
      }
    }
  }
  return {
    common: {
      primaryColor: '#c63a55',
      primaryColorHover: '#d04963',
      primaryColorPressed: '#a92f47',
      primaryColorSuppl: '#d04963',
      infoColor: '#2f6fc4',
      successColor: '#2e8b62',
      warningColor: '#b8791a',
      errorColor: '#c24038',
      borderRadius: '10px',
      fontFamily: 'Microsoft YaHei UI, system-ui, sans-serif',
      borderColor: '#d5d1c8',
      dividerColor: '#e6e2da'
    },
    DataTable: {
      tdColor: '#fbfaf7',
      thColor: '#f2efe9',
      borderColor: '#e6e2da',
      thTextColor: '#5f5c56',
      tdTextColor: '#2e2c2a'
    },
    Input: {
      color: '#ffffff',
      borderColor: '#d5d1c8',
      colorFocus: '#ffffff'
    },
    Tabs: {
      tabTextColorLine: '#aaa69c',
      tabTextColorActiveLine: '#c63a55',
      barColor: '#c63a55'
    },
    Button: {
      borderRadiusMedium: '8px',
      borderRadiusSmall: '6px'
    },
    InternalSelection: {
      color: '#ffffff',
      borderColor: '#d5d1c8'
    }
  }
})
</script>

<style>
/* 布局样式（颜色已全部移交 tokens.css） */
.app-frame {
  display: grid;
  grid-template-rows: auto 1fr;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.app-body {
  display: grid;
  grid-template-columns: 200px 1fr;
  overflow: hidden;
  min-height: 0;
}

.app-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  min-width: 0;
}

.app-content > * {
  flex: 1;
  min-height: 0;
}
</style>
