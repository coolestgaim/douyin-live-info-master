<template>
  <div :class="['danmu-item', { 'danmu-gift': msg.type === 'Gift', 'danmu-social': msg.type === 'Social' }]">
    <span class="danmu-time">{{ msg.time.substring(11, 19) }}</span>
    <span :class="['danmu-tag', `danmu-tag-${msg.type.toLowerCase()}`]">{{ tagText }}</span>
    <a v-if="msg.avatar && msg.type !== 'Stats'" class="danmu-avatar-link" :href="msg.profileUrl || '#'" target="_blank" @click.stop>
      <img :src="msg.avatar" class="danmu-avatar" @error="onAvatarError" />
    </a>
    <span class="danmu-text">
      <template v-if="msg.profileUrl && msg.type !== 'Stats'">
        <a :href="msg.profileUrl" target="_blank" class="danmu-username" @click.stop>{{ msg.userName }}</a>
      </template>
      <template v-else>
        {{ msg.userName }}
      </template>
      {{ displaySuffix }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DanmuMessage } from '../types'

const props = defineProps<{ msg: DanmuMessage }>()

const tagText = computed(() => {
  switch (props.msg.type) {
    case 'Chat': return '弹幕'
    case 'Gift': return '礼物'
    case 'Member': return '进入'
    case 'Like': return '点赞'
    case 'Social': return '关注'
    case 'Stats': return '统计'
    default: return ''
  }
})

const displaySuffix = computed(() => {
  switch (props.msg.type) {
    case 'Chat': return `: ${props.msg.content}`
    case 'Gift': return ` 赠送 ${props.msg.giftName} x${props.msg.giftCount}`
    case 'Member': return ' 进入直播间'
    case 'Like': return ` 点赞了 ${props.msg.likeCount} 次`
    case 'Social': return ' 关注了主播'
    case 'Stats': return `在线: ${props.msg.totalUser} | 点赞: ${props.msg.totalLike}`
    default: return props.msg.content
  }
})

function onAvatarError(e: Event) {
  ;(e.target as HTMLImageElement).style.display = 'none'
}
</script>

<style scoped>
.danmu-item {
  display: flex;
  align-items: center;
  padding: 5px 10px;
  margin: 2px 4px;
  border-radius: 6px;
  gap: 10px;
  transition: background 0.15s;
}

.danmu-item:hover {
  background: rgba(249, 115, 22, 0.04);
}

.danmu-gift {
  background: rgba(249, 115, 22, 0.06);
  border: 1px solid rgba(249, 115, 22, 0.15);
}

.danmu-gift:hover {
  background: rgba(249, 115, 22, 0.1);
}

.danmu-social {
  background: rgba(59, 130, 246, 0.06);
  border: 1px solid rgba(59, 130, 246, 0.15);
}

.danmu-time {
  font-size: 10px;
  color: #3a3d46;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.danmu-tag {
  font-size: 10px;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  flex-shrink: 0;
  font-weight: 500;
}

.danmu-tag-chat { background: #3a3d46; }
.danmu-tag-gift { background: linear-gradient(135deg, #f97316, #ea580c); }
.danmu-tag-member { background: #10b981; }
.danmu-tag-like { background: #ef4444; }
.danmu-tag-social { background: #3b82f6; }
.danmu-tag-stats { background: #6b7080; }

.danmu-text {
  font-size: 12px;
  color: #c0c2c8;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.danmu-avatar-link {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.danmu-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid #2a2d36;
}

.danmu-username {
  color: #f97316;
  text-decoration: none;
  font-weight: 500;
  cursor: pointer;
}

.danmu-username:hover {
  color: #fb923c;
  text-decoration: underline;
}
</style>
