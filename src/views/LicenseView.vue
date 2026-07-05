<template>
  <div class="license-page">
    <div class="license-card">
      <div class="license-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="11" width="18" height="11" rx="2" stroke="#f97316" stroke-width="1.5"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#f97316" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="12" cy="16" r="1" fill="#f97316"/>
        </svg>
      </div>
      <div class="license-title">输入卡密</div>
      <div class="license-subtitle">请输入购买获得的卡密以继续使用</div>

      <div class="license-input-row">
        <input
          ref="inputRef"
          v-model="keyInput"
          class="license-input"
          placeholder="DY-XXXX-XXXX-XXXX"
          :disabled="verifying"
          @keyup.enter="doVerify"
        />
        <button class="license-btn" @click="doVerify" :disabled="verifying || !keyInput.trim()">
          {{ verifying ? '验证中...' : '验证' }}
        </button>
      </div>

      <div v-if="msg" :class="['license-msg', { error: !msgOk, success: msgOk }]">{{ msg }}</div>

      <div class="license-footer">
        联系开发者获取卡密
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

defineOptions({ name: 'LicenseView' })

const api = () => (window as any).electronAPI
const inputRef = ref<HTMLInputElement | null>(null)
const keyInput = ref('')
const verifying = ref(false)
const msg = ref('')
const msgOk = ref(false)

const emit = defineEmits(['verified'])

onMounted(() => nextTick(() => inputRef.value?.focus()))

async function doVerify() {
  const raw = keyInput.value.trim()
  if (!raw) return
  verifying.value = true
  msg.value = ''
  try {
    const result = await api().licenseVerify(raw)
    msgOk.value = result.valid
    msg.value = result.message
    if (result.valid) {
      await api().licenseDone()
      emit('verified')
    }
  } catch (e: any) {
    msgOk.value = false
    msg.value = '验证失败: ' + (e.message || '未知错误')
  } finally {
    verifying.value = false
  }
}
</script>

<style scoped>
.license-page {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111318;
  -webkit-app-region: drag;
}
.license-card {
  background: #1a1d26;
  border: 1px solid #2a2d36;
  border-radius: 16px;
  padding: 40px 36px;
  width: 400px;
  max-width: 90%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  -webkit-app-region: no-drag;
}
.license-icon { margin-bottom: 4px; }
.license-title { font-size: 20px; font-weight: 700; color: #e0e2e8; }
.license-subtitle { font-size: 12px; color: #6b7080; margin-bottom: 8px; }
.license-input-row { display: flex; gap: 8px; width: 100%; }
.license-input {
  flex: 1;
  background: #111318;
  border: 1px solid #2a2d36;
  border-radius: 8px;
  padding: 10px 14px;
  color: #e0e2e8;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  letter-spacing: 1px;
}
.license-input:focus { border-color: #f97316; }
.license-input::placeholder { color: #4a4e5e; }
.license-btn {
  background: #f97316;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.license-btn:hover { background: #fb923c; }
.license-btn:disabled { opacity: 0.4; cursor: default; }
.license-msg { font-size: 12px; margin-top: 4px; }
.license-msg.error { color: #ef4444; }
.license-msg.success { color: #10b981; }
.license-footer { font-size: 10px; color: #3a3d46; margin-top: 12px; }
</style>
