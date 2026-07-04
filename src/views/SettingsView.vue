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
    </div>

    <div class="card settings-card" style="margin-top: 16px;">
      <div class="section-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="#22d3ee" stroke-width="1.8"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" stroke="#22d3ee" stroke-width="1.8"/>
        </svg>
        <h3 class="section-title">通义听悟 — OSS 配置</h3>
        <span class="section-hint">用于上传录制文件</span>
      </div>

      <div class="form-group">
        <label class="form-label">AccessKey ID</label>
        <n-input v-model:value="settings.ossAccessKeyId" placeholder="阿里云 OSS AccessKey ID" />
      </div>
      <div class="form-group">
        <label class="form-label">AccessKey Secret</label>
        <n-input v-model:value="settings.ossAccessKeySecret" type="password" placeholder="阿里云 OSS AccessKey Secret" show-password-on="click" />
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label class="form-label">Bucket 名称</label>
          <n-input v-model:value="settings.ossBucket" placeholder="例如 my-bucket" />
        </div>
        <div class="form-group" style="flex:1; margin-left: 12px;">
          <label class="form-label">地域</label>
          <n-input v-model:value="settings.ossRegion" placeholder="oss-cn-hangzhou" />
        </div>
      </div>
    </div>

    <div class="card settings-card" style="margin-top: 16px;">
      <div class="section-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#10b981" stroke-width="1.8"/>
          <polyline points="14 2 14 8 20 8" stroke="#10b981" stroke-width="1.8"/>
          <line x1="16" y1="13" x2="8" y2="13" stroke="#10b981" stroke-width="1.8"/>
          <line x1="16" y1="17" x2="8" y2="17" stroke="#10b981" stroke-width="1.8"/>
        </svg>
        <h3 class="section-title">通义听悟 — API 配置</h3>
        <span class="section-hint">用于语音转文字</span>
      </div>

      <div class="form-group">
        <label class="form-label">AccessKey ID</label>
        <n-input v-model:value="settings.tingwuAccessKeyId" placeholder="通义听悟 AccessKey ID" />
      </div>
      <div class="form-group">
        <label class="form-label">AccessKey Secret</label>
        <n-input v-model:value="settings.tingwuAccessKeySecret" type="password" placeholder="通义听悟 AccessKey Secret" show-password-on="click" />
      </div>
    </div>

    <div class="card settings-card" style="margin-top: 16px;">
      <div class="form-divider"></div>
      <div class="form-actions">
        <n-button type="primary" @click="settings.saveConfig()">保存设置</n-button>
        <span v-if="settings.statusMessage" class="success-text">{{ settings.statusMessage }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { NInput, NButton, NSelect } from 'naive-ui'
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
.section-hint { font-size: 11px; color: #4a4e5e; margin-left: auto; }

.form-group { margin-bottom: 18px; }
.form-label {
  font-size: 11px;
  color: #6b7080;
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}

.form-row { display: flex; }

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
