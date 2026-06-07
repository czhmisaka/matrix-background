<template>
  <div class="demo-themes">
    <div class="container">
      <header class="page-header">
        <span class="tag">Themes</span>
        <h1>冷暖主题混合</h1>
        <p class="lead">用 <code>coldFrom</code> × <code>warmFrom</code> 双主题拼色,5 主题任意两两组合,会得到 25 种渐变。下方是 5 个推荐组合。</p>
      </header>

      <div class="layout">
        <div class="canvas-wrap">
          <canvas ref="canvasRef" aria-hidden="true"></canvas>
          <div class="canvas-overlay">
            <div class="overlay-pair">
              <span class="overlay-tag" :style="{ '--c': accentOf(coldFrom) }">{{ coldFrom }}</span>
              <span class="overlay-x">×</span>
              <span class="overlay-tag" :style="{ '--c': accentOf(warmFrom) }">{{ warmFrom }}</span>
            </div>
          </div>
        </div>

        <aside class="control-panel">
          <h2>手动选择</h2>
          <label>Cold From
            <select v-model="coldFrom" aria-label="冷色主题">
              <option v-for="t in themes" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>
          <label>Warm From
            <select v-model="warmFrom" aria-label="暖色主题">
              <option v-for="t in themes" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>

          <h2 class="mt-32">推荐组合</h2>
          <div class="presets">
            <button
              v-for="p in presets" :key="p.name"
              type="button"
              :class="['preset', { active: coldFrom === p.cold && warmFrom === p.warm }]"
              :aria-pressed="coldFrom === p.cold && warmFrom === p.warm"
              @click="applyPreset(p)"
            >
              <span class="preset-name">{{ p.name }}</span>
              <span class="preset-pair">
                <span :style="{ '--c': accentOf(p.cold) }">{{ p.cold }}</span>
                <span class="preset-x">+</span>
                <span :style="{ '--c': accentOf(p.warm) }">{{ p.warm }}</span>
              </span>
            </button>
          </div>

          <h2 class="mt-32">代码</h2>
          <pre class="code" tabindex="0" aria-label="当前 matrixRain 调用代码"><code>matrixRain({{ '{' }}
  canvas: ...,
  theme: {{ '{' }} coldFrom: '{{ coldFrom }}', warmFrom: '{{ warmFrom }}' {{ '}' }}
{{ '}' }});</code></pre>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue';
import { matrixRain, textToBitmap, type MatrixRainInstance, type ThemeName } from '@xietuier/matrix-rain';
import { useTheme } from '@/composables/useTheme';

const themes: ThemeName[] = ['silicon-valley', 'matrix-green', 'lava-red', 'cyber-blue', 'pure-mono'];
const presets: Array<{ name: string; cold: ThemeName; warm: ThemeName }> = [
  { name: '硅谷冷 → 熔岩暖', cold: 'silicon-valley', warm: 'lava-red' },
  { name: '纯青 → 极光',     cold: 'matrix-green',  warm: 'cyber-blue' },
  { name: '赛博蓝 → 紫罗兰', cold: 'cyber-blue',    warm: 'pure-mono' },
  { name: '熔岩 → 硅谷',     cold: 'lava-red',      warm: 'silicon-valley' },
  { name: '极光蓝 → 硅',     cold: 'cyber-blue',    warm: 'silicon-valley' }
];

const coldFrom = ref<ThemeName>('silicon-valley');
const warmFrom = ref<ThemeName>('lava-red');
const canvasRef = ref<HTMLCanvasElement | null>(null);
const { accent: accentOf } = useTheme();

let inst: MatrixRainInstance | null = null;

function create() {
  if (!canvasRef.value) return;
  inst?.destroy();
  inst = matrixRain({
    canvas: canvasRef.value,
    theme: { coldFrom: coldFrom.value, warmFrom: warmFrom.value },
    fontSize: 14,
    trailAlpha: 0.2,
    targetPhase: 'noise-converge',
    targetNoiseDuration: 0.4,
    targetConvergeDuration: 1.5,
    targetLockStability: 0.85,
    targetLockOrder: 'center',
    targetFadeIn: 0.3,
    targetHold: 3.0,
    targetFadeOut: 2.0
  });
  setTimeout(() => {
    if (!inst || !canvasRef.value) return;
    const cols = Math.max(8, Math.floor(canvasRef.value.width / 14));
    const rows = Math.max(6, Math.floor(canvasRef.value.height / 14));
    inst.setTargetBitmap(textToBitmap('THEMES', cols, rows), {
      phase: 'noise-converge',
      lockOrder: 'center',
      lockStability: 0.85
    });
  }, 300);
}

onMounted(create);
onBeforeUnmount(() => { inst?.destroy(); inst = null; });

watch([coldFrom, warmFrom], () => create());

function applyPreset(p: { cold: ThemeName; warm: ThemeName }) {
  coldFrom.value = p.cold;
  warmFrom.value = p.warm;
}
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
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.canvas-wrap canvas { width: 100%; height: 100%; display: block; }
.canvas-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.overlay-pair {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 20px;
  background: rgba(8, 8, 18, 0.65);
  border: 1px solid var(--border);
  border-radius: 8px;
  backdrop-filter: blur(6px);
}
.overlay-tag {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--c, var(--text));
  text-shadow: 0 0 12px var(--c, var(--text));
}
.overlay-x { color: var(--text-faint); font-size: 18px; }

.control-panel {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
}
.control-panel h3, .control-panel h2 { font-size: 16px; margin: 0 0 12px; font-weight: 500; }
.mt-32 { margin-top: 32px !important; }
.presets { display: flex; flex-direction: column; gap: 8px; }
.preset {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
  transition: all 160ms ease;
}
.preset:hover { color: var(--text); border-color: var(--border-strong); }
.preset.active { color: var(--text); border-color: var(--accent); background: rgba(122, 247, 212, 0.04); }
.preset-name { font-size: 12px; }
.preset-pair { display: flex; gap: 6px; align-items: center; }
.preset-pair span { color: var(--c, var(--text)); }
.preset-x { color: var(--text-faint) !important; }
.code {
  font-size: 12px;
  background: var(--bg);
  margin: 0;
  border-radius: 6px;
  border: 1px solid var(--border);
}

@media (max-width: 920px) {
  .layout { grid-template-columns: 1fr; }
}
</style>
