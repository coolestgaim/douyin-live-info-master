<template>
  <div class="danmu-list" ref="listRef">
    <template v-if="localMessages.length > 0">
      <DanmuItem v-for="(msg, idx) in localMessages" :key="`${msg.time}-${msg.type}-${idx}`" :msg="msg" />
    </template>
    <div v-else class="danmu-empty">{{ empty }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import type { DanmuMessage } from '../types'
import DanmuItem from './DanmuItem.vue'

const props = defineProps<{
  messages: DanmuMessage[]
  empty: string
  /** 暂停更新：弹幕列表冻结当前内容，浮窗打开时使用 */
  paused?: boolean
}>()

/** 渲染上限：只渲染最近 N 条，避免 2000 条全量 diff 导致卡顿 */
const RENDER_LIMIT = 300

const listRef = ref<HTMLElement | null>(null)
const localMessages = ref<DanmuMessage[]>([])
let rafId = 0

// 高频弹幕合并渲染：同一帧内的多条消息只渲染一次（去掉 deep watch，避免整树 diff）
function syncMessages() {
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    localMessages.value = props.paused ? localMessages.value : props.messages.slice(-RENDER_LIMIT)
  })
}
watch(() => props.messages, syncMessages, { immediate: true })
watch(() => props.paused, (p) => {
  if (!p) syncMessages()
})

onUnmounted(() => cancelAnimationFrame(rafId))
</script>

<style scoped>
.danmu-list {
  overflow-y: auto;
  height: 100%;
  padding: 4px;
}

.danmu-empty {
  text-align: center;
  color: var(--text-faint);
  font-size: 13px;
  padding: 40px 0;
}
</style>
