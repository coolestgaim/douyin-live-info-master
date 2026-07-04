<template>
  <div class="danmu-list" ref="listRef">
    <template v-if="messages.length > 0">
      <DanmuItem v-for="(msg, idx) in messages" :key="`${msg.time}-${msg.type}-${idx}`" :msg="msg" />
    </template>
    <div v-else class="danmu-empty">{{ empty }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { DanmuMessage } from '../types'
import DanmuItem from './DanmuItem.vue'

defineProps<{
  messages: DanmuMessage[]
  empty: string
}>()

const listRef = ref<HTMLElement | null>(null)
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
