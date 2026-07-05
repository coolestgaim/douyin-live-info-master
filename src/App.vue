<template>
  <LicenseView v-if="!hasLicense" @verified="onVerified" />
  <n-config-provider v-else :theme="darkTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <div class="app-frame">
        <AppTitlebar />
        <div class="app-body">
          <AppSidebar :current="currentRoute" @navigate="navigate" />
          <div class="app-content">
            <router-view v-slot="{ Component }">
              <transition name="page" mode="out-in">
                <component :is="Component" />
              </transition>
            </router-view>
          </div>
        </div>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { darkTheme, NConfigProvider, NMessageProvider, type GlobalThemeOverrides } from 'naive-ui'
import AppTitlebar from './components/AppTitlebar.vue'
import AppSidebar from './components/AppSidebar.vue'
import LicenseView from './views/LicenseView.vue'

const api = () => (window as any).electronAPI
const hasLicense = ref(false)

onMounted(async () => {
  try { const lic = await api().licenseCheck(); if (lic) hasLicense.value = true } catch {}
})

function onVerified() { hasLicense.value = true }

const router = useRouter()
const route = useRoute()

const currentRoute = computed(() => route.path)

function navigate(path: string) {
  router.push(path)
}

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#f97316',
    primaryColorHover: '#fb923c',
    primaryColorPressed: '#ea580c',
    borderRadius: '10px',
    fontFamily: 'Microsoft YaHei UI, system-ui, sans-serif',
    borderColor: '#2a2d36',
    dividerColor: '#1e2028'
  },
  DataTable: {
    tdColor: '#1a1d26',
    thColor: '#15171e',
    borderColor: '#1e2028',
    thTextColor: '#8b8fa3',
    tdTextColor: '#c8cad0'
  },
  Input: {
    color: '#1a1d26',
    borderColor: '#2a2d36',
    colorFocus: '#1a1d26'
  },
  Tabs: {
    tabTextColorLine: '#5a5e6e',
    tabTextColorActiveLine: '#f97316',
    barColor: '#f97316'
  },
  Button: {
    borderRadiusMedium: '8px',
    borderRadiusSmall: '6px'
  },
  InternalSelection: {
    color: '#1a1d26',
    borderColor: '#2a2d36'
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #111318;
  color: #e0e2e8;
  font-family: 'Microsoft YaHei UI', system-ui, -apple-system, sans-serif;
  -webkit-app-region: no-drag;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

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

::-webkit-scrollbar {
  width: 5px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #2a2d36;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #3a3d46;
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.2s ease;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
}

.card {
  background: #1a1d26;
  border-radius: 10px;
  border: 1px solid #1e2028;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
}

.muted { color: #4a4e5e; }
.secondary { color: #6b7080; }
.accent { color: #f97316; }
.small { font-size: 11px; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #4a4e5e;
  gap: 10px;
}

.empty-icon { font-size: 36px; color: #2a2d36; }

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: #e0e2e8;
  margin-bottom: 4px;
}

@keyframes loading-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(300%); }
}

.loading-bar {
  height: 2px;
  width: 100%;
  overflow: hidden;
  background: #1a1d26;
  border-radius: 1px;
}

.loading-bar-inner {
  width: 30%;
  height: 100%;
  background: linear-gradient(90deg, #f97316, #ef4444);
  border-radius: 1px;
  animation: loading-slide 1.2s ease-in-out infinite;
}
</style>
