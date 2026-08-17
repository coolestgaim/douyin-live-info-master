import { defineStore } from 'pinia'
import { ref } from 'vue'

const api = () => (window as any).electronAPI

export type ThemeMode = 'dark' | 'light'

const THEME_KEY = 'douyin-live-info-theme'

function loadTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch { /* localStorage 不可用时静默回退默认 */ }
  return 'dark'
}

export const useSettingsStore = defineStore('settings', () => {
  const outputFormats = ['mp3', 'mp4', 'wav', 'flv']
  const selectedFormat = ref('mp3')
  const outputPath = ref('')
  const segmentEnabled = ref(false)
  const segmentDuration = ref(30)
  const statusMessage = ref('')

  /* 界面主题（默认暗色，手动切换，localStorage 持久化） */
  const themeMode = ref<ThemeMode>(loadTheme())

  function setThemeMode(mode: ThemeMode) {
    themeMode.value = mode
    try {
      localStorage.setItem(THEME_KEY, mode)
    } catch { /* 忽略写入失败 */ }
  }

  function toggleTheme() {
    setThemeMode(themeMode.value === 'dark' ? 'light' : 'dark')
  }

  async function loadConfig() {
    const cfg = await api().configLoad()
    selectedFormat.value = cfg.outputFormat || 'mp3'
    outputPath.value = cfg.outputPath || ''
    segmentEnabled.value = cfg.segmentEnabled || false
    segmentDuration.value = cfg.segmentDuration || 30
  }

  async function saveConfig() {
    await api().configSave({
      outputFormat: selectedFormat.value,
      recordQuality: 'OD',
      outputPath: outputPath.value,
      segmentEnabled: segmentEnabled.value,
      segmentDuration: segmentDuration.value,
    })
    statusMessage.value = '已保存'
  }

  async function browsePath() {
    const path = await api().configBrowsePath()
    if (path) outputPath.value = path
  }

  return {
    outputFormats, selectedFormat, outputPath,
    segmentEnabled, segmentDuration, statusMessage,
    themeMode, setThemeMode, toggleTheme,
    loadConfig, saveConfig, browsePath
  }
})
