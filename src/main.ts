import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import DashboardView from './views/DashboardView.vue'
import LiveRoomsView from './views/LiveRoomsView.vue'
import DanmuView from './views/DanmuView.vue'
import RecordingView from './views/RecordingView.vue'
import SettingsView from './views/SettingsView.vue'
import AboutView from './views/AboutView.vue'
import QuickReplyView from './views/QuickReplyView.vue'
import OfflineDataView from './views/OfflineDataView.vue'

import { useDanmuStore } from './stores/danmu'
import { useRecordStore } from './stores/record'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: DashboardView },
    { path: '/rooms', component: LiveRoomsView },
    { path: '/danmu', component: DanmuView },
    { path: '/recording', component: RecordingView },
    { path: '/settings', component: SettingsView },
    { path: '/about', component: AboutView },
    { path: '/quick-reply', component: QuickReplyView },
    { path: '/offline', component: OfflineDataView }
  ]
})

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(router)

// Register IPC listeners immediately after Pinia is ready,
// before mount, so they work regardless of which page is active.
const danmuStore = useDanmuStore()
danmuStore.setupListeners()

const recordStore = useRecordStore()
recordStore.setupListeners()

app.mount('#app')
