<template>
  <div class="danmu-list" ref="listRef">
    <template v-if="localMessages.length > 0">
      <DanmuItem v-for="(msg, idx) in localMessages" :key="`${msg.time}-${msg.type}-${idx}`" :msg="msg" />
    </template>
    <div v-else class="danmu-empty">{{ empty }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { DanmuMessage } from '../types'
import DanmuItem from './DanmuItem.vue'

const props = defineProps<{
  messages: DanmuMessage[]
  empty: string
  /** 暂停更新：弹幕列表冻结当前内容，浮窗打开时使用 */
  paused?: boolean
}>()

const listRef = ref<HTMLElement | null>(null)
const localMessages = ref<DanmuMessage[]>([...props.messages])

// paused 时不响应 prop 变化（保持冻结快照），否则正常更新
watch(() => props.messages, (newMsgs) => {
  if (!props.paused) localMessages.value = newMsgs
}, { deep: true })
// paused 状态变化时，如果切到非 paused 立即同步
watch(() => props.paused, (p) => {
  if (!p) localMessages.value = props.messages
})
</script>

<style scoped>
.danmu-list {
  overflow-y: auto;
  height: 100%;
  padding: 4px;
}

.danmu-empty {
  text-align: center;
  color: #5A5A5A;
  font-size: 13px;
  padding: 40px 0;
}
</style>
