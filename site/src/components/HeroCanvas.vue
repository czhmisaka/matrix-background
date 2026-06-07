<template>
  <section class="hero">
    <canvas ref="canvasRef" class="hero-canvas" aria-hidden="true"></canvas>
    <div class="hero-overlay">
      <div class="container">
        <h1>给做 <em class="grad">UI</em> 的人<br>5 行代码一个<br><em class="grad">会呼吸</em>的背景</h1>
        <p class="hero-sub">Canvas 2D 渲染 · 5 主题 4 变体 · Web Component · SSR 友好 · 29 KB gzip</p>
        <div class="hero-ctas">
          <router-link to="/playground" class="btn btn-primary">立即试用 →</router-link>
          <a href="https://www.npmjs.com/package/@xietuier/matrix-rain" class="btn btn-ghost" target="_blank" rel="noopener">npm install</a>
        </div>
        <div class="hero-meta">
          <span class="meta-item"><span class="meta-dot" style="--c: var(--c-silicon)"></span>noise-converge 涌现</span>
          <span class="meta-item">·</span>
          <span class="meta-item">本地部署 · 0 CDN</span>
          <span class="meta-item">·</span>
          <span class="meta-item">MIT</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useMatrixRain } from '@/composables/useMatrixRain';
import { useTheme } from '@/composables/useTheme';
import { textToBitmap, type MatrixRainInstance } from '@xietuier/matrix-rain';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const { current: theme } = useTheme();

const options = computed(() => ({
  theme: theme.value,
  fontSize: 16,
  trailAlpha: 0.15,
  targetPhase: 'noise-converge' as const,
  targetNoiseDuration: 0.5,
  targetConvergeDuration: 1.5,
  targetLockStability: 0.8,
  targetLockOrder: 'center' as const,
  targetFadeIn: 0.3,
  targetHold: 2.5,
  targetFadeOut: 2.0
}));

const instance = useMatrixRain(options, canvasRef);

// canvas 拿到尺寸后,设置 target bitmap
function regenerate() {
  const inst = instance.value as MatrixRainInstance | null;
  const cv = canvasRef.value;
  if (!inst || !cv) return;
  const cols = Math.max(8, Math.floor(cv.width / 16));
  const rows = Math.max(6, Math.floor(cv.height / 16));
  try {
    const bm = textToBitmap('matrix-rain', cols, rows);
    inst.setTargetBitmap(bm, {
      phase: 'noise-converge',
      noiseDuration: 0.5,
      convergeDuration: 1.5,
      lockOrder: 'center',
      lockStability: 0.8,
      fadeIn: 0.3,
      hold: 2.5,
      fadeOut: 2.0
    });
  } catch (e) {
    // silent
  }
}

onMounted(() => {
  setTimeout(regenerate, 250);
  // 每 8s 重新涌现一次,但用户启用 reduced-motion 时跳过循环(前庭无障碍)
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    setInterval(regenerate, 8000);
  }
});

watch(theme, (t) => {
  instance.value?.setTheme(t);
});
</script>

<style scoped>
.hero {
  position: relative;
  min-height: 92vh;
  display: flex;
  align-items: center;
  overflow: hidden;
}
.hero-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}
.hero-overlay {
  position: relative;
  z-index: 2;
  width: 100%;
  background: linear-gradient(180deg, rgba(10, 10, 20, 0.35) 0%, rgba(10, 10, 20, 0.65) 100%);
  padding: 140px 0 120px;
}
h1 {
  font-size: clamp(40px, 6.4vw, 88px);
  font-weight: 500;
  margin: 0 0 16px;
}
.hero-sub {
  font-size: 18px;
  color: var(--text-muted);
  margin: 24px 0 32px;
  max-width: 640px;
  line-height: 1.55;
}
.hero-ctas {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 32px;
}
.hero-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-faint);
  flex-wrap: wrap;
}
.meta-item { display: inline-flex; align-items: center; gap: 6px; }
.meta-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--c, var(--accent));
  box-shadow: 0 0 6px var(--c, var(--accent));
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@media (max-width: 768px) {
  .hero-overlay { padding: 100px 0 80px; }
  h1 br { display: none; }
  h1 { font-size: clamp(34px, 9vw, 56px); }
}
</style>
