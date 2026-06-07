<template>
  <div class="not-found">
    <BackgroundMatrixRain text="404" />

    <div class="nf-content">
      <div class="nf-badge">
        <span class="nf-dot"></span>
        <span class="nf-text">page not found</span>
      </div>
      <h1 class="nf-code">404</h1>
      <p class="nf-msg">这条路没铺过数字雨<br>试试回到首页,或者打开 Playground 玩一玩</p>
      <div class="nf-actions">
        <router-link to="/" class="btn btn-primary">回到首页 →</router-link>
        <router-link to="/playground" class="btn btn-ghost">Playground</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import BackgroundMatrixRain from '@/components/BackgroundMatrixRain.vue';
</script>

<style scoped>
.not-found {
  position: relative;
  min-height: calc(100vh - var(--nav-h) - 240px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
}
.nf-content {
  position: relative;
  z-index: 2;
  text-align: center;
  padding: 40px 24px;
  background: rgba(10, 10, 20, 0.55);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  backdrop-filter: blur(8px);
  max-width: 520px;
  margin: 40px auto;
}
.nf-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 24px;
}
.nf-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.nf-code {
  font-size: clamp(96px, 16vw, 180px);
  font-family: var(--font-display);
  font-weight: 500;
  margin: 0;
  background: var(--grad);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  line-height: 1;
  letter-spacing: -0.04em;
}
.nf-msg {
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1.6;
  margin: 24px 0 32px;
}
.nf-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
</style>
