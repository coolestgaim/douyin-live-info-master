<template>
  <div class="offline-data">
    <div class="dash-header">
      <div>
        <h2 class="dash-title">识图</h2>
        <div class="dash-subtitle">
          <span class="subtitle-text">上传截图，AI自动识别直播数据</span>
        </div>
      </div>
      <n-button
        type="primary"
        :loading="analyzing"
        :disabled="!douyinFile || !videoFile"
        @click="analyze"
        size="large"
      >
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </template>
        分析截图
      </n-button>
    </div>

    <!-- 上传区域 -->
    <div class="upload-row">
      <!-- 抖音截图 -->
      <div
        :class="['upload-zone', { 'has-file': douyinPreview, 'drag-over': dragDouyin }]"
        @dragover.prevent="dragDouyin = true"
        @dragleave.prevent="dragDouyin = false"
        @drop.prevent="handleDrop($event, 'douyin')"
        @click="triggerFile('douyin')"
      >
        <input
          ref="douyinInput"
          type="file"
          accept="image/*"
          hidden
          @change="handleFile($event, 'douyin')"
        />
        <template v-if="douyinPreview">
          <img :src="douyinPreview" class="preview-img" />
          <div class="preview-overlay">
            <n-button size="tiny" quaternary circle @click.stop="clearFile('douyin')">
              <template #icon>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </template>
            </n-button>
          </div>
        </template>
        <template v-else>
          <div class="upload-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
              <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="upload-label">抖音大屏截图</div>
          <div class="upload-hint">拖拽或点击上传</div>
        </template>
      </div>

      <!-- 视频号截图 -->
      <div
        :class="['upload-zone', { 'has-file': videoPreview, 'drag-over': dragVideo }]"
        @dragover.prevent="dragVideo = true"
        @dragleave.prevent="dragVideo = false"
        @drop.prevent="handleDrop($event, 'video')"
        @click="triggerFile('video')"
      >
        <input
          ref="videoInput"
          type="file"
          accept="image/*"
          hidden
          @change="handleFile($event, 'video')"
        />
        <template v-if="videoPreview">
          <img :src="videoPreview" class="preview-img" />
          <div class="preview-overlay">
            <n-button size="tiny" quaternary circle @click.stop="clearFile('video')">
              <template #icon>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </template>
            </n-button>
          </div>
        </template>
        <template v-else>
          <div class="upload-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
              <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="upload-label">视频号截图</div>
          <div class="upload-hint">拖拽或点击上传</div>
        </template>
      </div>
    </div>

    <!-- 错误提示 -->
    <n-alert v-if="errorMsg" type="error" closable @close="errorMsg = ''" style="margin-bottom: 16px">
      {{ errorMsg }}
    </n-alert>

    <!-- 结果展示 -->
    <div v-if="result" class="result-section card">
      <div class="result-header">
        <span class="result-title">📋 提取结果</span>
        <n-button size="small" type="primary" ghost @click="copyResult">
          <template #icon>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
            </svg>
          </template>
          复制此行
        </n-button>
      </div>
      <div class="result-table">
        <div class="result-header-row">
          <div class="result-cell header-cell">开播</div>
          <div class="result-cell header-cell">下播</div>
          <div class="result-cell header-cell">直播总时长</div>
          <div class="result-cell header-cell">抖音销售额</div>
          <div class="result-cell header-cell">视频号销售额</div>
          <div class="result-cell header-cell">控场时长</div>
        </div>
        <div class="result-data-row">
          <div class="result-cell data-cell highlight">{{ result.kaibo }}</div>
          <div class="result-cell data-cell highlight">{{ result.xiabo }}</div>
          <div class="result-cell data-cell">{{ result.shichang }}</div>
          <div class="result-cell data-cell money">{{ result.douyinXs }}</div>
          <div class="result-cell data-cell money">{{ result.shipinXs }}</div>
          <div class="result-cell data-cell">{{ result.shichang }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NAlert } from 'naive-ui'

interface Result {
  kaibo: string
  xiabo: string
  shichang: string
  douyinXs: string
  shipinXs: string
}

const douyinFile = ref<File | null>(null)
const videoFile = ref<File | null>(null)
const douyinPreview = ref('')
const videoPreview = ref('')
const douyinB64 = ref('')
const videoB64 = ref('')
const dragDouyin = ref(false)
const dragVideo = ref(false)
const analyzing = ref(false)
const errorMsg = ref('')
const result = ref<Result | null>(null)

const douyinInput = ref<HTMLInputElement | null>(null)
const videoInput = ref<HTMLInputElement | null>(null)

function triggerFile(type: 'douyin' | 'video') {
  if (type === 'douyin') douyinInput.value?.click()
  else videoInput.value?.click()
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // 去掉 "data:image/...;base64," 前缀
      const b64 = result.split(',')[1]
      resolve(b64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function handleDrop(e: DragEvent, type: 'douyin' | 'video') {
  if (type === 'douyin') dragDouyin.value = false
  else dragVideo.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) await setFile(file, type)
}

async function handleFile(e: Event, type: 'douyin' | 'video') {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await setFile(file, type)
}

async function setFile(file: File, type: 'douyin' | 'video') {
  if (!file.type.startsWith('image/')) {
    errorMsg.value = '请上传图片文件'
    return
  }
  const preview = URL.createObjectURL(file)
  const b64 = await fileToBase64(file)
  if (type === 'douyin') {
    douyinFile.value = file
    douyinPreview.value = preview
    douyinB64.value = b64
  } else {
    videoFile.value = file
    videoPreview.value = preview
    videoB64.value = b64
  }
  errorMsg.value = ''
  result.value = null
}

function clearFile(type: 'douyin' | 'video') {
  if (type === 'douyin') {
    douyinFile.value = null
    douyinPreview.value = ''
    douyinB64.value = ''
  } else {
    videoFile.value = null
    videoPreview.value = ''
    videoB64.value = ''
  }
  result.value = null
}

async function analyze() {
  if (!douyinB64.value || !videoB64.value) return
  analyzing.value = true
  errorMsg.value = ''
  try {
    const api = (window as any).electronAPI
    const res = await api.offlineAnalyze(douyinB64.value, videoB64.value)
    if (res.success) {
      result.value = res.data
    } else {
      errorMsg.value = res.error || '分析失败，请重试'
    }
  } catch (e: any) {
    errorMsg.value = e.message || '分析失败'
  } finally {
    analyzing.value = false
  }
}

function copyResult() {
  if (!result.value) return
  const { kaibo, xiabo, shichang, douyinXs, shipinXs } = result.value
  const line = [kaibo, xiabo, shichang, douyinXs, shipinXs, shichang].join('\t')
  navigator.clipboard.writeText(line).then(() => {
    errorMsg.value = ''
  }).catch(() => {
    errorMsg.value = '复制失败，请手动复制'
  })
}
</script>

<style scoped>
.offline-data {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.dash-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.dash-title {
  font-size: 18px;
  font-weight: 700;
  color: #e0e2e8;
  margin: 0 0 4px;
}

.dash-subtitle {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.subtitle-text {
  color: #5a5e6e;
}

/* 上传区域 */
.upload-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.upload-zone {
  aspect-ratio: 16 / 10;
  border: 2px dashed #2a2d36;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  background: #14161c;
  position: relative;
  overflow: hidden;
}

.upload-zone:hover {
  border-color: #f97316;
  background: rgba(249, 115, 22, 0.04);
}

.upload-zone.drag-over {
  border-color: #f97316;
  background: rgba(249, 115, 22, 0.08);
}

.upload-zone.has-file {
  border-style: solid;
  border-color: #2a2d36;
  padding: 0;
}

.upload-icon {
  color: #3a3d46;
  margin-bottom: 10px;
}

.upload-label {
  font-size: 14px;
  font-weight: 600;
  color: #6b7080;
  margin-bottom: 4px;
}

.upload-hint {
  font-size: 11px;
  color: #3a3d46;
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #0d0f14;
}

.preview-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
}

/* 结果区域 */
.result-section {
  padding: 20px;
  margin-top: auto;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.result-title {
  font-size: 14px;
  font-weight: 600;
  color: #e0e2e8;
}

.result-table {
  border: 1px solid #1e2028;
  border-radius: 8px;
  overflow: hidden;
}

.result-header-row,
.result-data-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
}

.result-header-row {
  background: #15171e;
}

.result-cell {
  padding: 10px 12px;
  font-size: 13px;
  text-align: center;
  border-right: 1px solid #1e2028;
}

.result-cell:last-child {
  border-right: none;
}

.header-cell {
  color: #5a5e6e;
  font-weight: 600;
  font-size: 12px;
}

.data-cell {
  color: #c8cad0;
  font-variant-numeric: tabular-nums;
}

.data-cell.highlight {
  color: #f97316;
  font-weight: 600;
}

.data-cell.money {
  color: #22c55e;
  font-weight: 700;
  font-size: 15px;
}
</style>
