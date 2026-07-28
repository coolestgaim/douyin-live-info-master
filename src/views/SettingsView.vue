<template>
  <div class="settings-page">
    <h2 class="page-title">设置</h2>

    <div class="card settings-card">
      <div class="section-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="#f97316" stroke-width="1.8"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="#f97316" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <h3 class="section-title">录制设置</h3>
      </div>

      <div class="form-group">
        <label class="form-label">输出格式</label>
        <n-select v-model:value="settings.selectedFormat" :options="formatOptions" />
      </div>

      <div class="form-group">
        <label class="form-label">保存路径</label>
        <div class="path-row">
          <n-input v-model:value="settings.outputPath" placeholder="留空则默认保存到桌面「直播录制」文件夹" />
          <n-button @click="settings.browsePath()">浏览</n-button>
        </div>
        <div class="form-hint">留空则默认保存到桌面「直播录制」文件夹</div>
      </div>

      <div class="form-divider"></div>

      <div class="section-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="11" width="18" height="11" rx="2" stroke="#f97316" stroke-width="1.5"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#f97316" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="12" cy="16" r="1" fill="#f97316"/>
        </svg>
        <h3 class="section-title">授权管理</h3>
      </div>
      <div class="form-group">
        <p class="license-info" v-if="licenseInfo">{{ licenseInfo }}</p>
        <p class="license-info muted" v-else>未检测到授权信息</p>
        <n-button size="small" quaternary type="error" @click="clearLicense">清除卡密（下次启动需重新输入）</n-button>
      </div>

      <div class="form-divider"></div>

      <div class="form-actions">
        <n-button type="primary" @click="settings.saveConfig()">保存设置</n-button>
        <span v-if="settings.statusMessage" class="success-text">{{ settings.statusMessage }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NInput, NButton, NSelect } from 'naive-ui'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
const api = () => (window as any).electronAPI
const licenseInfo = ref('')

const formatOptions = [
  { label: 'MP3', value: 'mp3' },
  { label: 'MP4', value: 'mp4' },
  { label: 'WAV', value: 'wav' },
  { label: 'FLV', value: 'flv' }
]

onMounted(async () => {
  settings.loadConfig()
  try {
    const lic = await api().licenseCheck()
    if (lic) licenseInfo.value = `已授权至 ${lic.expires}`
  } catch {}
})

async function clearLicense() {
  await api().licenseClear()
  licenseInfo.value = ''
}
</script>

<style scoped>
.settings-page { padding: 16px 20px 20px; height: 100%; overflow-y: auto; }
.page-title { margin-bottom: 20px; }

.settings-card { padding: 24px; max-width: 520px; margin: 0 auto; }

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}

.section-title { font-size: 15px; font-weight: 700; color: #e0e2e8; }

.form-group { margin-bottom: 18px; }
.form-label {
  font-size: 11px;
  color: #6b7080;
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}

.path-row { display: flex; gap: 8px; }
.form-hint { font-size: 10px; color: #3a3d46; margin-top: 6px; }

.form-divider {
  height: 1px;
  background: #1e2028;
  margin: 20px 0;
}

.form-actions { display: flex; align-items: center; gap: 12px; }
.success-text { font-size: 12px; color: #10b981; font-weight: 500; }
.license-info { font-size: 12px; color: #10b981; margin-bottom: 8px; }
.license-info.muted { color: #4a4e5e; }
</style>
