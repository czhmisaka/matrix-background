<template>
  <div class="demo-events">
    <div class="container">
      <header class="page-header">
        <span class="tag">Events</span>
        <h1>4 事件回调</h1>
        <p class="lead">
          onFrame / onResize / onThemeChange / onTargetFinish —
          全部原生事件钩子。点击下方按钮触发,右侧实时计数。
        </p>
      </header>

      <div class="layout">
        <div class="canvas-wrap">
          <canvas ref="canvasRef" aria-hidden="true"></canvas>
          <div class="overlay-msg">
            <span class="msg-dot"></span>
            <span class="msg-text">{{ lastEvent }}</span>
          </div>
          <div class="controls">
            <button class="btn btn-sm" @click="cycleTheme">Cycle Theme</button>
            <button class="btn btn-sm" @click="setTarget">Set Target</button>
            <button class="btn btn-sm" @click="triggerResize">Trigger Resize</button>
            <button class="btn btn-sm btn-ghost" @click="reset">Reset</button>
          </div>
        </div>

        <aside class="log-panel">
          <h2>事件计数</h2>
          <div class="counter" v-for="c in counters" :key="c.name">
            <div class="counter-info">
              <span class="counter-name">{{ c.name }}</span>
              <span class="counter-desc">{{ c.desc }}</span>
            </div>
            <span class="counter-value">{{ c.value }}</span>
          </div>

          <h2 class="mt-32">最近事件</h2>
          <pre class="log-stream" role="region" tabindex="0" aria-label="最近事件日志流">{{
            lastEvent
          }}</pre>

          <h2 class="mt-32">说明</h2>
          <p class="hint">
            onFrame 由内部 30Hz 节流,正常运行会持续增加;其他 3 个事件需手动触发或自动触发(onResize
            200ms debounce,onTargetFinish 在 noise-converge 完成后)。
          </p>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue';
import {
  matrixRain,
  textToBitmap,
  type MatrixRainInstance,
  type ThemeName,
} from '@xietuier/matrix-rain';
import { useTheme } from '@/composables/useTheme';

const canvasRef = ref<HTMLCanvasElement | null>(null);
let inst: MatrixRainInstance | null = null;
const { current: theme } = useTheme();

const counters = reactive([
  { name: 'onFrame', value: 0, desc: '每帧触发(30Hz 节流)' },
  { name: 'onResize', value: 0, desc: '窗口尺寸变化(200ms debounce)' },
  { name: 'onThemeChange', value: 0, desc: '主题切换' },
  { name: 'onTargetFinish', value: 0, desc: 'target 淑出完成' },
]);
const lastEvent = ref('(等待事件...)');
const themes: ThemeName[] = [
  'silicon-valley',
  'matrix-green',
  'lava-red',
  'cyber-blue',
  'pure-mono',
];
let themeIdx = 0;

onMounted(async () => {
  if (!canvasRef.value) return;
  inst = matrixRain({
    canvas: canvasRef.value,
    theme: theme.value,
    targetPhase: 'noise-converge',
    targetNoiseDuration: 0.4,
    targetConvergeDuration: 1.2,
    targetLockStability: 0.8,
    targetLockOrder: 'random',
    fontSize: undefined, // 自适应
    trailAlpha: 0.2,
    onFrame: () => {
      counters[0].value++;
    },
    onResize: () => {
      counters[1].value++;
      lastEvent.value = `onResize @ ${new Date().toLocaleTimeString()}`;
    },
    onThemeChange: (t) => {
      counters[2].value++;
      lastEvent.value = `onThemeChange → ${t}`;
    },
    onTargetFinish: () => {
      counters[3].value++;
      lastEvent.value = `onTargetFinish @ ${new Date().toLocaleTimeString()}`;
    },
  });

  // 初始 target
  setTimeout(() => {
    if (!inst || !canvasRef.value) return;
    const cols = Math.max(8, Math.floor(canvasRef.value.width / 14));
    const rows = Math.max(6, Math.floor(canvasRef.value.height / 14));
    inst.setTargetBitmap(textToBitmap('EVENTS', cols, rows), {
      phase: 'noise-converge',
      noiseDuration: 0.4,
      convergeDuration: 1.2,
      lockOrder: 'random',
      hold: 2.0,
      fadeOut: 1.5,
    });
  }, 300);
});

onBeforeUnmount(() => {
  inst?.destroy();
  inst = null;
});

const cycleTheme = () => {
  themeIdx = (themeIdx + 1) % themes.length;
  inst?.setTheme(themes[themeIdx]);
};
const setTarget = () => {
  if (!inst || !canvasRef.value) return;
  const cols = Math.max(8, Math.floor(canvasRef.value.width / 14));
  const rows = Math.max(6, Math.floor(canvasRef.value.height / 14));
  inst.setTargetBitmap(textToBitmap('EVENTS', cols, rows), {
    phase: 'noise-converge',
    noiseDuration: 0.4,
    convergeDuration: 1.2,
    lockOrder: 'random',
    hold: 2.0,
    fadeOut: 1.5,
  });
};
const triggerResize = () => window.dispatchEvent(new Event('resize'));
const reset = () => {
  counters.forEach((c) => (c.value = 0));
  lastEvent.value = '(已重置)';
};

watch(theme, (t) => inst?.setTheme(t));
</script>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 32px;
  padding-bottom: 80px;
}
.canvas-wrap {
  position: relative;
  aspect-ratio: 16/10;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg);
}
.canvas-wrap canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.controls {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.overlay-msg {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(8, 8, 18, 0.78);
  border: 1px solid var(--border);
  border-radius: 6px;
  backdrop-filter: blur(8px);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
  max-width: 360px;
  pointer-events: none;
}
.msg-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
  animation: pulse 1.5s ease-in-out infinite;
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

.log-panel {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
}
.log-panel h2,
.log-panel h3 {
  font-size: 16px;
  margin: 0 0 12px;
  font-weight: 500;
}
.mt-32 {
  margin-top: 32px !important;
}
.counter {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}
.counter:last-child {
  border-bottom: 0;
}
.counter-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.counter-name {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text);
}
.counter-desc {
  font-size: 11px;
  color: var(--text-faint);
}
.counter-value {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 500;
  color: var(--accent);
  min-width: 40px;
  text-align: right;
}
.log-stream {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  min-height: 36px;
}
.hint {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
}

@media (max-width: 920px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
