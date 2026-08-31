<template>
  <div class="danmu-list" ref="listRef">
    <template v-if="localMessages.length > 0">
      <DanmuItem v-for="(msg, idx) in localMessages" :key="`${msg.time}-${msg.type}-${idx}`" :msg="msg" />
    </template>
    <div v-else class="danmu-empty">{{ empty }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'
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

/** 距底部多少像素内算"已贴底"：用户在此区域内才跟随新消息自动滚到底 */
const STICK_BOTTOM_PX = 40

const listRef = ref<HTMLElement | null>(null)
const localMessages = ref<DanmuMessage[]>([])
let rafId = 0

// 高频弹幕合并渲染：同一帧内的多条消息只渲染一次（去掉 deep watch，避免整树 diff）
function syncMessages() {
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    const el = listRef.value
    // 同步前判断用户是否已贴底（"在底部"才跟随新消息自动滚到底）
    const wasAtBottom = !!(el && (el.scrollHeight - el.scrollTop - el.clientHeight) < STICK_BOTTOM_PX)
    if (props.paused) return
    // 约定：props.messages 最新在数组头部（store 与回放页都是 unshift）
    // 取最新 N 条（前 300）并反转成"旧→新"，渲染后最新固定在底部，新弹幕从底部冒出
    localMessages.value = props.messages.slice(0, RENDER_LIMIT).reverse()
    if (el && wasAtBottom) {
      // 下一个 tick 让 DOM 完成 v-for 渲染后再滚到底（最新弹幕从底部出现，旧消息向上推）
      nextTick(() => { el.scrollTop = el.scrollHeight })
    }
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
