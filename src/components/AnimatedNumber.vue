<template>
  <span :style="color ? { color } : undefined">{{ display }}</span>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

/**
 * AnimatedNumber — 数值平滑滚动动画
 * value 变化时从旧值缓动过渡到新值（400ms easeOutCubic）
 * 高频变化自动取消上一帧动画，不会抖动
 */
const props = defineProps<{ value: number; color?: string }>()

const display = ref(props.value.toLocaleString())
let rafId = 0

watch(() => props.value, (newVal, oldVal) => {
  cancelAnimationFrame(rafId)
  if (typeof oldVal !== 'number') {
    display.value = newVal.toLocaleString()
    return
  }
  const from = oldVal
  const to = newVal
  if (from === to) return
  const duration = 400
  const start = performance.now()
  const step = (t: number) => {
    const p = Math.min(1, (t - start) / duration)
    const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
    display.value = Math.round(from + (to - from) * eased).toLocaleString()
    if (p < 1) rafId = requestAnimationFrame(step)
  }
  rafId = requestAnimationFrame(step)
})

onUnmounted(() => cancelAnimationFrame(rafId))
</script>
