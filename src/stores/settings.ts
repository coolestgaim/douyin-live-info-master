import { defineStore } from 'pinia'
import { ref } from 'vue'

const api = () => (window as any).electronAPI

export const useSettingsStore = defineStore('settings', () => {
  const outputFormats = ['mp3', 'mp4', 'wav', 'flv']
  const selectedFormat = ref('mp3')
  const outputPath = ref('')
  const segmentEnabled = ref(false)
  const segmentDuration = ref(30)
  const statusMessage = ref('')

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
    loadConfig, saveConfig, browsePath
  }
})
