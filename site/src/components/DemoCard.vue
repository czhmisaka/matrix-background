<template>
  <router-link :to="to" class="demo-card">
    <div class="demo-card-canvas-wrap">
      <canvas ref="canvasRef" class="demo-card-canvas"></canvas>
      <div class="demo-card-shimmer"></div>
    </div>
    <div class="demo-card-body">
      <span class="demo-card-tag">{{ tag }}</span>
      <h3>{{ title }}</h3>
      <p>{{ subtitle }}</p>
      <span class="demo-card-cta">Try it →</span>
    </div>
  </router-link>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue';
import { useTheme } from '@/composables/useTheme';
import { textToBitmap, type MatrixRainInstance } from '@xietuier/matrix-rain';

const props = defineProps<{
  to: string;
  tag: string;
  title: string;
  subtitle: string;
  bitmapText: string;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const { current: theme } = useTheme();
let inst: MatrixRainInstance | null = null;

function create() {
  if (!canvasRef.value) return;
  inst?.destroy();
  try {
    inst = (window as any).__matrixRainNoop || null;
    // 动态 import 避免 SSR
    import('@xietuier/matrix-rain').then((mod) => {
      if (!canvasRef.value) return;
      inst?.destroy();
      inst = mod.matrixRain({
        canvas: canvasRef.value,
        theme: theme.value,
        fontSize: 10,
        trailAlpha: 0.2,
        targetPhase: 'noise-converge',
        targetNoiseDuration: 0.4,
        targetConvergeDuration: 1.2,
        targetLockStability: 0.85,
        targetLockOrder: 'random',
        targetFadeIn: 0.2,
        targetHold: 2.0,
        targetFadeOut: 1.5
      });
      // 启动后设 target
      setTimeout(() => {
        if (!inst || !canvasRef.value) return;
        const cols = Math.max(8, Math.floor(canvasRef.value.width / 10));
        const rows = Math.max(6, Math.floor(canvasRef.value.height / 10));
        const bm = mod.textToBitmap(props.bitmapText || ' ', cols, rows);
        inst.setTargetBitmap(bm, {
          phase: 'noise-converge',
          noiseDuration: 0.4,
          convergeDuration: 1.2,
          lockOrder: 'random',
          lockStability: 0.85
        });
      }, 300);
    });
  } catch (e) { /* silent */ }
}

onMounted(create);

onBeforeUnmount(() => {
  inst?.destroy();
  inst = null;
});

watch(theme, (t) => inst?.setTheme(t));
</script>

<style scoped>
.demo-card {
  display: flex;
  flex-direction: column;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: all 220ms ease;
  text-decoration: none;
  color: inherit;
}
.demo-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-3px);
  box-shadow: var(--shadow-2);
}
.demo-card-canvas-wrap {
  position: relative;
  aspect-ratio: 16 / 10;
  background: var(--bg);
  overflow: hidden;
}
.demo-card-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.demo-card-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.04) 50%, transparent 70%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 220ms ease;
}
.demo-card:hover .demo-card-shimmer { opacity: 1; }

.demo-card-body {
  padding: 20px 22px 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.demo-card-tag {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--accent);
  margin-bottom: 4px;
}
.demo-card h3 {
  font-size: 20px;
  margin: 0 0 4px;
}
.demo-card p {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.55;
  margin: 0;
  flex: 1;
}
.demo-card-cta {
  margin-top: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-faint);
  letter-spacing: 0.04em;
  transition: color 160ms ease;
}
.demo-card:hover .demo-card-cta { color: var(--accent); }
</style>
