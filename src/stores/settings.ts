import { defineStore } from 'pinia'
import { ref } from 'vue'

const api = () => (window as any).electronAPI

export const useSettingsStore = defineStore('settings', () => {
  const outputFormats = ['mp3', 'mp4', 'wav', 'flv']
  const selectedFormat = ref('mp3')
  const outputPath = ref('')
  const statusMessage = ref('')

  // OSS settings
  const ossAccessKeyId = ref('')
  const ossAccessKeySecret = ref('')
  const ossBucket = ref('')
  const ossRegion = ref('oss-cn-hangzhou')

  // Tingwu settings
  const tingwuAccessKeyId = ref('')
  const tingwuAccessKeySecret = ref('')

  async function loadConfig() {
    const cfg = await api().configLoad()
    selectedFormat.value = cfg.outputFormat
    outputPath.value = cfg.outputPath
    ossAccessKeyId.value = cfg.ossAccessKeyId || ''
    ossAccessKeySecret.value = cfg.ossAccessKeySecret || ''
    ossBucket.value = cfg.ossBucket || ''
    ossRegion.value = cfg.ossRegion || 'oss-cn-hangzhou'
    tingwuAccessKeyId.value = cfg.tingwuAccessKeyId || ''
    tingwuAccessKeySecret.value = cfg.tingwuAccessKeySecret || ''
  }

  async function saveConfig() {
    await api().configSave({
      outputFormat: selectedFormat.value,
      outputPath: outputPath.value,
      ossAccessKeyId: ossAccessKeyId.value,
      ossAccessKeySecret: ossAccessKeySecret.value,
      ossBucket: ossBucket.value,
      ossRegion: ossRegion.value,
      tingwuAccessKeyId: tingwuAccessKeyId.value,
      tingwuAccessKeySecret: tingwuAccessKeySecret.value
    })
    statusMessage.value = '已保存'
  }

  async function browsePath() {
    const path = await api().configBrowsePath()
    if (path) outputPath.value = path
  }

  return {
    outputFormats, selectedFormat, outputPath, statusMessage,
    ossAccessKeyId, ossAccessKeySecret, ossBucket, ossRegion,
    tingwuAccessKeyId, tingwuAccessKeySecret,
    loadConfig, saveConfig, browsePath
  }
})
