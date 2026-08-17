<template>
  <div class="about-page">
    <h2 class="page-title">关于</h2>

    <div class="card about-card">
      <div class="app-info">
        <div class="app-logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="20" height="14" rx="3" stroke="var(--primary)" stroke-width="2"/>
            <path d="M8 21h8M12 17v4" stroke="var(--primary)" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="10" r="3" fill="var(--primary)" opacity="0.3"/>
          </svg>
        </div>
        <div>
          <div class="app-name">灼灼直播控场</div>
          <div class="app-version">V 2.9.7 — 实时弹幕监听 · 直播录制 · 快捷控场 · 双主题</div>
        </div>
      </div>

      <div class="section-divider"></div>

      <div class="section-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" stroke="var(--primary)" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <h3 class="section-title">联系方式</h3>
      </div>

      <div class="contact-row">
        <span class="contact-label">微信</span>
        <span class="contact-value">Likeyou_OwO</span>
      </div>

      <div class="section-divider"></div>

      <div class="section-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect x="1" y="3" width="22" height="14" rx="2" stroke="var(--primary)" stroke-width="1.8"/>
          <path d="M23 7l-11 7L1 7" stroke="var(--primary)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h3 class="section-title">扫码关注</h3>
      </div>

      <div class="qr-grid">
        <div class="qr-item">
          <img :src="wechatImg" class="qr-img" alt="微信" />
          <span class="qr-label">微信</span>
        </div>
        <div class="qr-item">
          <img :src="douyinImg" class="qr-img" alt="抖音" />
          <span class="qr-label">抖音</span>
        </div>
        <div class="qr-item">
          <img :src="qqImg" class="qr-img" alt="QQ" />
          <span class="qr-label">QQ</span>
        </div>
        <div class="qr-item">
          <img :src="rewardImg" class="qr-img" alt="赞赏" />
          <span class="qr-label">赞赏支持</span>
        </div>
      </div>

      <div class="section-divider"></div>

      <div class="section-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="var(--primary)" stroke-width="1.8" fill="none"/>
        </svg>
        <h3 class="section-title">免责声明</h3>
      </div>

      <div class="disclaimer-text">
        <p>1. 本工具仅供学习和技术研究使用，请勿用于任何违法行为。</p>
        <p>2. 使用本工具所产生的一切后果由使用者自行承担，开发者不承担任何责任。</p>
        <p>3. 本工具不存储、不传播任何直播内容，仅采集公开的弹幕互动数据。</p>
        <p>4. 请遵守相关平台的使用条款和当地法律法规，尊重他人隐私和知识产权。</p>
        <p>5. 如有疑问或合作需求，请通过上方微信联系开发者。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import wechatImg from '@/assets/wechat.jpg'
import douyinImg from '@/assets/douyin.jpg'
import qqImg from '@/assets/qq.jpg'
import rewardImg from '@/assets/reward.jpg'
</script>

<style scoped>
.about-page { padding: 16px 20px 20px; height: 100%; overflow-y: auto; }

.about-card { padding: 24px; max-width: 600px; margin: 0 auto; }

.app-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.app-logo {
  width: 56px;
  height: 56px;
  background: var(--bg-active);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-name { font-size: 18px; font-weight: 700; color: var(--text-primary); }
.app-version { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

.section-divider {
  height: 1px;
  background: var(--border-default);
  margin: 20px 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.section-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }

.contact-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.contact-label {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 48px;
}

.contact-value {
  font-size: 13px;
  color: var(--primary);
  font-weight: 500;
}

.qr-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.qr-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.qr-img {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--bg-card);
}

.qr-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.disclaimer-text {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.8;
}

.disclaimer-text p {
  margin-bottom: 2px;
}
</style>
