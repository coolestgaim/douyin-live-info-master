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
        <label class="form-label">分段录制</label>
        <n-switch v-model:value="settings.segmentEnabled" />
        <span class="switch-label">{{ settings.segmentEnabled ? '已启用' : '已关闭' }}</span>
      </div>

      <div class="form-group" v-if="settings.segmentEnabled">
        <label class="form-label">分段时长（分钟）</label>
        <n-input-number v-model:value="settings.segmentDuration" :min="5" :max="120" :step="5" />
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

      <div class="form-actions">
        <n-button type="primary" @click="settings.saveConfig()">保存设置</n-button>
        <span v-if="settings.statusMessage" class="success-text">{{ settings.statusMessage }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NInput, NButton, NSelect, NSwitch, NInputNumber } from 'naive-ui'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()

const formatOptions = [
  { label: 'MP3', value: 'mp3' },
  { label: 'MP4', value: 'mp4' },
  { label: 'WAV', value: 'wav' },
  { label: 'FLV', value: 'flv' }
]

onMounted(() => {
  settings.loadConfig()
})
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
.switch-label { font-size: 12px; color: #8b8fa3; margin-left: 8px; vertical-align: middle; }

.path-row { display: flex; gap: 8px; }
.form-hint { font-size: 10px; color: #3a3d46; margin-top: 6px; }

.form-divider {
  height: 1px;
  background: #1e2028;
  margin: 20px 0;
}

.form-actions { display: flex; align-items: center; gap: 12px; }
.success-text { font-size: 12px; color: #10b981; font-weight: 500; }
</style>
