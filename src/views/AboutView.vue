<template>
  <div class="about-page">
    <h2 class="page-title">关于</h2>

    <div class="card about-card">
      <div class="app-info">
        <div class="app-logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="20" height="14" rx="3" stroke="#f97316" stroke-width="2"/>
            <path d="M8 21h8M12 17v4" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="10" r="3" fill="#f97316" opacity="0.3"/>
          </svg>
        </div>
        <div>
          <div class="app-name">LiveMonitor</div>
          <div class="app-version">V 2.3.0 - 抖音直播间信息获取工具</div>
        </div>
      </div>

      <!-- 联系方式和扫码关注已隐藏，后续自定义 -->

      <div class="section-divider"></div>

      <div class="section-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#f97316" stroke-width="1.8" fill="none"/>
        </svg>
        <h3 class="section-title">免责声明</h3>
      </div>

      <div class="disclaimer-text">
        <p>1. 本工具仅供学习和技术研究使用，请勿用于任何商业用途或违法行为。</p>
        <p>2. 使用本工具所产生的一切后果由使用者自行承担，开发者不承担任何责任。</p>
        <p>3. 本工具不存储、不传播任何直播内容，仅采集公开的弹幕互动数据。</p>
        <p>4. 请遵守相关平台的使用条款和当地法律法规，尊重他人隐私和知识产权。</p>
        <p>5. 如有侵权或不妥之处，请联系作者删除。</p>
        <p>6. 本工具完全免费，如您是付费购买的本软件，证明您已经上当受骗。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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
  background: rgba(249, 115, 22, 0.1);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-name { font-size: 18px; font-weight: 700; color: #e0e2e8; }
.app-version { font-size: 12px; color: #6b7080; margin-top: 4px; }

.section-divider {
  height: 1px;
  background: #1e2028;
  margin: 20px 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.section-title { font-size: 15px; font-weight: 700; color: #e0e2e8; }

.contact-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.contact-label {
  font-size: 12px;
  color: #6b7080;
  min-width: 48px;
}

.contact-value {
  font-size: 13px;
  color: #f97316;
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
  border: 1px solid #2a2d36;
  background: #fff;
}

.qr-label {
  font-size: 12px;
  color: #6b7080;
  font-weight: 500;
}

.disclaimer-text {
  font-size: 12px;
  color: #6b7080;
  line-height: 1.8;
}

.disclaimer-text p {
  margin-bottom: 2px;
}
</style>
