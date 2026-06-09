<template>
  <section class="hero">
    <canvas ref="canvasRef" class="hero-canvas" aria-hidden="true"></canvas>
    <div class="hero-overlay">
      <div class="container">
        <h1>
          给做 <em class="grad">UI</em> 的人<br />5 行代码一个<br /><em class="grad">会呼吸</em
          >的背景
        </h1>
        <p class="hero-sub">
          Canvas 2D 渲染 · 5 主题 4 变体 · Web Component · SSR 友好 · 29 KB gzip
        </p>
        <div class="hero-ctas">
          <router-link to="/playground" class="btn btn-primary">立即试用 →</router-link>
          <a
            href="https://www.npmjs.com/package/@xietuier/matrix-rain"
            class="btn btn-ghost"
            target="_blank"
            rel="noopener"
            >npm install</a
          >
        </div>
        <div class="hero-prompt" @click="copyPrompt">
          <span class="prompt-sigil" aria-hidden="true">$</span>
          <span class="prompt-cmd">npm install @xietuier/matrix-rain</span>
          <span class="prompt-cursor" aria-hidden="true">▍</span>
          <button
            type="button"
            class="prompt-copy"
            :class="{ copied }"
            :aria-label="copied ? '已复制' : '复制命令'"
          >
            {{ copied ? '✓' : '⎘' }}
          </button>
        </div>
        <div class="hero-meta">
          <span class="meta-item"
            ><span class="meta-dot" style="--c: var(--c-silicon)"></span>noise-converge 涌现</span
          >
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
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue';
import { useMatrixRain } from '@/composables/useMatrixRain';
import { useTheme } from '@/composables/useTheme';
import { textToBitmap, type MatrixRainInstance } from '@xietuier/matrix-rain';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const { current: theme } = useTheme();

// 终端 prompt 复制状态
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;
async function copyPrompt() {
  const cmd = 'npm install @xietuier/matrix-rain';
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(cmd);
    } else {
      // fallback: textarea + execCommand
      const ta = document.createElement('textarea');
      ta.value = cmd;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    // silent
  }
}

const options = computed(() => ({
  theme: theme.value,
  fontSize: undefined, // 让 buildGrid 按 canvas 自适应(<600px → 8px,否则 6px)
  trailAlpha: 0.15,
  targetPhase: 'noise-converge' as const,
  targetNoiseDuration: 0.5,
  targetConvergeDuration: 1.5,
  targetLockStability: 0.8,
  targetLockOrder: 'center' as const,
  targetFadeIn: 0.3,
  targetHold: 2.5,
  targetFadeOut: 2.0,
}));

const instance = useMatrixRain(options, canvasRef);

// canvas 拿到尺寸后,设置 target bitmap
function regenerate() {
  const inst = instance.value as MatrixRainInstance | null;
  const cv = canvasRef.value;
  if (!inst || !cv) return;
  const cols = Math.max(8, Math.floor(cv.width / 6));
  const rows = Math.max(6, Math.floor(cv.height / 6));
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
      fadeOut: 2.0,
    });
  } catch (e) {
    // silent
  }
}

// 路由级 preload:Space Grotesk (替代 Fraunces,新 H1 字体) 仅 hero 路由预载
let fontPreloadLink: HTMLLinkElement | null = null;
let regenerateTimer: ReturnType<typeof setTimeout> | null = null;
let regenerateInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  // 仅在 hero 路由插入 preload,避免 12/12 路由全局拉
  if (typeof document !== 'undefined' && !document.querySelector('link[data-sg-preload]')) {
    fontPreloadLink = document.createElement('link');
    fontPreloadLink.rel = 'preload';
    fontPreloadLink.as = 'font';
    fontPreloadLink.type = 'font/woff2';
    fontPreloadLink.href = '/dist/fonts/space-grotesk-500.woff2';
    fontPreloadLink.crossOrigin = 'anonymous';
    fontPreloadLink.setAttribute('data-sg-preload', '');
    document.head.appendChild(fontPreloadLink);
  }

  regenerateTimer = setTimeout(regenerate, 250);
  // 每 8s 重新涌现一次,但用户启用 reduced-motion 时跳过循环(前庭无障碍)
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    regenerateInterval = setInterval(regenerate, 8000);
  }
});

onBeforeUnmount(() => {
  if (regenerateTimer) {
    clearTimeout(regenerateTimer);
    regenerateTimer = null;
  }
  if (regenerateInterval) {
    clearInterval(regenerateInterval);
    regenerateInterval = null;
  }
  if (copyTimer) {
    clearTimeout(copyTimer);
    copyTimer = null;
  }
  if (fontPreloadLink && fontPreloadLink.parentNode) {
    fontPreloadLink.parentNode.removeChild(fontPreloadLink);
    fontPreloadLink = null;
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

/* 大屏适配(2026-06-08)· 与全站 style.css 6 档断点对齐
 * 1280+: hero 高度从 92vh 降到 88vh,字稍微再涨
 * 1920+: 88vh, h1 → 96
 * 2560+: 86vh, h1 → 108, hero-sub 字号也升
 * 3840+: 84vh, h1 → 120, overlay padding 加大 */
@media (min-width: 1280px) {
  .hero {
    min-height: 90vh;
  }
  h1 {
    font-size: clamp(48px, 5.6vw, 96px);
  }
}
@media (min-width: 1920px) {
  .hero {
    min-height: 88vh;
  }
  .hero-overlay {
    padding: 160px 0 140px;
  }
  h1 {
    font-size: clamp(56px, 5vw, 104px);
  }
  .hero-sub {
    font-size: 20px;
    max-width: 720px;
  }
}
@media (min-width: 2560px) {
  .hero {
    min-height: 86vh;
  }
  .hero-overlay {
    padding: 180px 0 160px;
  }
  h1 {
    font-size: clamp(64px, 4.4vw, 116px);
  }
  .hero-sub {
    font-size: 22px;
    max-width: 800px;
  }
}
@media (min-width: 3840px) {
  .hero {
    min-height: 84vh;
  }
  .hero-overlay {
    padding: 220px 0 200px;
  }
  h1 {
    font-size: clamp(80px, 3.6vw, 128px);
  }
  .hero-sub {
    font-size: 26px;
    max-width: 920px;
  }
  .hero-ctas {
    gap: 24px;
  }
  .btn {
    font-size: 16px;
    padding: 14px 24px;
  }
}
.hero-ctas {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.hero-prompt {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  padding: 12px 16px;
  margin-bottom: 32px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text);
  background: var(--bg-elev);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  cursor: text;
  user-select: all;
  transition: border-color 160ms ease;
}
.hero-prompt:hover {
  border-color: var(--accent);
}
.prompt-sigil {
  color: var(--accent);
  font-weight: 600;
  user-select: none;
}
.prompt-cmd {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.prompt-cursor {
  color: var(--accent);
  animation: blink 1s step-end infinite;
  user-select: none;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.prompt-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-faint);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  transition: all 160ms ease;
  user-select: none;
  padding: 0;
  line-height: 1;
}
.prompt-copy:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.prompt-copy.copied {
  color: var(--accent);
  border-color: var(--accent);
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
.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.meta-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c, var(--accent));
  box-shadow: 0 0 6px var(--c, var(--accent));
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

@media (max-width: 768px) {
  .hero-overlay {
    padding: 100px 0 80px;
  }
  h1 br {
    display: none;
  }
  h1 {
    font-size: clamp(34px, 9vw, 56px);
  }
}
</style>
