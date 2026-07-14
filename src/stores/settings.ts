import { defineStore } from 'pinia'
import { ref } from 'vue'

const api = () => (window as any).electronAPI

export const useSettingsStore = defineStore('settings', () => {
  const outputFormats = ['mp3', 'mp4', 'wav', 'flv']
  const selectedFormat = ref('mp3')
  const outputPath = ref('')
  const dashscopeKey = ref('')
  const licenseServerUrl = ref('')
  const statusMessage = ref('')

  async function loadConfig() {
    const cfg = await api().configLoad()
    selectedFormat.value = cfg.outputFormat || 'mp3'
    outputPath.value = cfg.outputPath || ''
    dashscopeKey.value = cfg.dashscopeKey || ''
    licenseServerUrl.value = cfg.licenseServerUrl || ''
  }

  async function saveConfig() {
    await api().configSave({
      outputFormat: selectedFormat.value,
      outputPath: outputPath.value,
      dashscopeKey: dashscopeKey.value,
      licenseServerUrl: licenseServerUrl.value,
    })
    statusMessage.value = '已保存'
  }

  async function browsePath() {
    const path = await api().configBrowsePath()
    if (path) outputPath.value = path
  }

  return {
    outputFormats, selectedFormat, outputPath, dashscopeKey, statusMessage,
    loadConfig, saveConfig, browsePath
  }
})
