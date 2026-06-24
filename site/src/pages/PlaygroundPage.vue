<template>
  <div class="playground">
    <div class="container">
      <header class="page-header">
        <span class="tag">Playground</span>
        <h1>实时调参</h1>
        <p class="lead">
          改右侧参数,canvas 立即更新。代码块展示当前
          <code>matrixRain(&#123;...&#125;)</code> 调用,直接复制使用。
        </p>
        <div class="header-actions">
          <ThemeSwitcher />
          <button class="btn btn-sm" @click="resetParams">重置</button>
          <button class="btn btn-sm btn-primary" @click="copyCode">复制代码</button>
        </div>
      </header>

      <div class="pg-grid">
        <aside class="params" aria-label="画布参数">
          <h2 class="sr-only">画布参数</h2>
          <h3>基础参数</h3>
          <label
            >Theme
            <select v-model="params.theme" aria-label="主题">
              <option v-for="t in themes" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>
          <label
            >Variant
            <select v-model="params.variant" aria-label="变体">
              <option value="classic">classic</option>
              <option value="avalanche">avalanche</option>
              <option value="ripple">ripple</option>
              <option value="ascii">ascii</option>
            </select>
          </label>
          <label
            >Font Size <span class="cv">{{ params.fontSize }}px</span>
            <input
              type="range"
              min="4"
              max="28"
              v-model.number="params.fontSize"
              aria-label="字符网格宽度(像素)"
              :aria-valuemin="4"
              :aria-valuemax="28"
              :aria-valuenow="params.fontSize"
              :aria-valuetext="`${params.fontSize} 像素`"
            />
          </label>
          <label
            >Trail Alpha <span class="cv">{{ params.trailAlpha.toFixed(2) }}</span>
            <input
              type="range"
              min="0.05"
              max="0.5"
              step="0.01"
              v-model.number="params.trailAlpha"
              aria-label="残影透明度"
              :aria-valuemin="0.05"
              :aria-valuemax="0.5"
              :aria-valuenow="params.trailAlpha"
              :aria-valuetext="params.trailAlpha.toFixed(2)"
            />
          </label>
          <label
            >Max DPR <span class="cv">{{ params.maxDPR.toFixed(1) }}</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.5"
              v-model.number="params.maxDPR"
              aria-label="设备像素比上限"
              :aria-valuemin="1"
              :aria-valuemax="3"
              :aria-valuenow="params.maxDPR"
              :aria-valuetext="`${params.maxDPR.toFixed(1)} 倍`"
            />
          </label>
          <label
            >Brightness <span class="cv">{{ params.brightness.toFixed(2) }}</span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              v-model.number="params.brightness"
              aria-label="主题亮度"
              :aria-valuemin="0.5"
              :aria-valuemax="2"
              :aria-valuenow="params.brightness"
              :aria-valuetext="params.brightness.toFixed(2)"
            />
          </label>

          <hr />

          <h3>Target · 涌现</h3>
          <label
            >Phase
            <select v-model="params.targetPhase" aria-label="目标位图出现方式">
              <option value="fade">fade (传统淡入)</option>
              <option value="noise-converge">noise-converge (涌现)</option>
            </select>
          </label>
          <label v-if="params.targetPhase === 'noise-converge'"
            >Noise Dur <span class="cv">{{ params.targetNoiseDuration.toFixed(1) }}s</span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              v-model.number="params.targetNoiseDuration"
              aria-label="全屏噪点时长(秒)"
              :aria-valuemin="0"
              :aria-valuemax="2"
              :aria-valuenow="params.targetNoiseDuration"
              :aria-valuetext="`${params.targetNoiseDuration.toFixed(1)} 秒`"
            />
          </label>
          <label v-if="params.targetPhase === 'noise-converge'"
            >Converge Dur <span class="cv">{{ params.targetConvergeDuration.toFixed(1) }}s</span>
            <input
              type="range"
              min="0.5"
              max="4"
              step="0.1"
              v-model.number="params.targetConvergeDuration"
              aria-label="逐 cell 锁定时长(秒)"
              :aria-valuemin="0.5"
              :aria-valuemax="4"
              :aria-valuenow="params.targetConvergeDuration"
              :aria-valuetext="`${params.targetConvergeDuration.toFixed(1)} 秒`"
            />
          </label>
          <label v-if="params.targetPhase === 'noise-converge'"
            >Lock Stability <span class="cv">{{ params.targetLockStability.toFixed(2) }}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              v-model.number="params.targetLockStability"
              aria-label="锁定后字符稳定性"
              :aria-valuemin="0"
              :aria-valuemax="1"
              :aria-valuenow="params.targetLockStability"
              :aria-valuetext="params.targetLockStability.toFixed(2)"
            />
          </label>
          <div
            v-if="params.targetPhase === 'noise-converge'"
            class="lock-orders"
            role="group"
            aria-label="锁定顺序"
          >
            <span class="lock-label">Lock Order:</span>
            <button
              v-for="o in lockOrders"
              :key="o"
              type="button"
              :class="['btn', 'btn-sm', { active: params.targetLockOrder === o }]"
              :aria-pressed="params.targetLockOrder === o"
              @click="setLockOrder(o)"
            >
              {{ o }}
            </button>
          </div>

          <hr />

          <h3>Target · 文本</h3>
          <label
            >Target Text
            <input
              type="text"
              v-model="targetText"
              maxlength="20"
              placeholder="MATRIX"
              aria-label="目标文本(将涌现的内容)"
            />
          </label>
          <button class="btn btn-block" type="button" @click="regenerate">应用</button>

          <hr />

          <details class="health-panel" :open="healthOpen">
            <summary @click.prevent="healthOpen = !healthOpen">
              <span class="health-title">Health</span>
              <span
                class="health-pill"
                :data-state="healthBadgeState"
                :aria-label="`renderer ${health?.renderer ?? '-'}, ${
                  health ? health.frameCount : 0
                } 帧`"
                >{{ healthBadgeLabel }}</span
              >
            </summary>
            <table v-if="health" class="health-table" aria-label="renderer 健康快照(13 字段)">
              <tbody>
                <tr v-for="f in HEALTH_FIELDS" :key="f.key" :class="{ 'is-warn': f.warn(health) }">
                  <th scope="row">{{ f.label }}</th>
                  <td>{{ formatHealth(f.key, health) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="health-empty">尚未初始化</p>
            <p class="health-hint">1Hz 刷新 · 字段背景变红 = 当前值异常</p>
          </details>
        </aside>

        <div class="canvas-area">
          <div class="canvas-wrap">
            <canvas ref="canvasRef" aria-hidden="true" @pointermove="onCanvasMove"></canvas>
            <div class="overlay-info" role="group" aria-label="涌现动画状态">
              <span
                class="info-pill"
                :data-phase="phase"
                role="status"
                aria-live="polite"
                :aria-label="`当前阶段 ${phase}`"
                >{{ phase }}</span
              >
              <span class="info-pill mono" aria-hidden="true">{{ elapsed.toFixed(2) }}s</span>
              <span class="info-pill coords-readout" aria-hidden="true"
                >x:{{ String(coords.x).padStart(3, '0') }} y:{{
                  String(coords.y).padStart(3, '0')
                }}
                · cell R{{ coords.row }}:C{{ coords.col }}</span
              >
            </div>
          </div>
        </div>
      </div>

      <section class="code-output">
        <h2>代码</h2>
        <pre
          role="region"
          tabindex="0"
          aria-label="当前 matrixRain 调用代码"
        ><code>{{ codeString }}</code></pre>
        <p class="hint">点击「复制代码」可一键复制当前调用。改任一参数,代码块会实时刷新。</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import ThemeSwitcher from '@/components/ThemeSwitcher.vue';
import {
  textToBitmap,
  type MatrixRainOptions,
  type ThemeName,
  type VariantName,
  type MatrixRainInstance,
} from '@xietuier/matrix-rain';
import { useMatrixRain } from '@/composables/useMatrixRain';

/** 复用 inst.getRendererHealth() 返回类型,避免单独 import 未导出的 RendererHealth */
type Health = ReturnType<MatrixRainInstance['getRendererHealth']>;
/** Health Panel 字段顺序与高亮规则(0.6.0+:13 字段) */
const HEALTH_FIELDS: { key: keyof Health; warn: (h: Health) => boolean; label: string }[] = [
  { key: 'renderer', warn: () => false, label: 'renderer' },
  { key: 'initialized', warn: (h) => !h.initialized, label: 'initialized' },
  { key: 'frameCount', warn: () => false, label: 'frameCount' },
  { key: 'drawCallIdx', warn: () => false, label: 'drawCallIdx' },
  { key: 'instanceCount', warn: () => false, label: 'instanceCount' },
  { key: 'gridCols', warn: () => false, label: 'gridCols' },
  { key: 'gridRows', warn: () => false, label: 'gridRows' },
  { key: 'initDurationMs', warn: () => false, label: 'initDurationMs' },
  { key: 'lastFrameDurationMs', warn: () => false, label: 'lastFrameDurationMs' },
  { key: 'droppedFrames', warn: (h) => h.droppedFrames > 0, label: 'droppedFrames' },
  { key: 'lastGlError', warn: (h) => h.lastGlError !== 0, label: 'lastGlError' },
  { key: 'lastErrorScope', warn: (h) => h.lastErrorScope !== null, label: 'lastErrorScope' },
  { key: 'lastInitError', warn: (h) => h.lastInitError !== null, label: 'lastInitError' },
];

const themes: ThemeName[] = [
  'silicon-valley',
  'matrix-green',
  'lava-red',
  'cyber-blue',
  'pure-mono',
];
const lockOrders = [
  'random',
  'topdown',
  'bottomup',
  'center',
  'edge',
  'leftright',
  'rightleft',
] as const;

interface Params {
  theme: ThemeName;
  variant: VariantName;
  fontSize: number;
  trailAlpha: number;
  maxDPR: number;
  brightness: number;
  targetPhase: 'fade' | 'noise-converge';
  targetNoiseDuration: number;
  targetConvergeDuration: number;
  targetLockStability: number;
  targetLockOrder: (typeof lockOrders)[number];
}

const defaults: Params = {
  theme: 'silicon-valley',
  variant: 'classic',
  fontSize: 6,
  trailAlpha: 0.18,
  maxDPR: 2,
  brightness: 1,
  targetPhase: 'noise-converge',
  targetNoiseDuration: 0.5,
  targetConvergeDuration: 1.5,
  targetLockStability: 0.7,
  targetLockOrder: 'random',
};

const params = reactive<Params>({ ...defaults });
const canvasRef = ref<HTMLCanvasElement | null>(null);
const targetText = ref('MATRIX');
const phase = ref<'idle' | 'noise' | 'converge' | 'hold' | 'dissolve'>('idle');
const elapsed = ref(0);
const coords = reactive({ x: 0, y: 0, row: 0, col: 0 });
let inputRaf: number | null = null;
let phaseRaf = 0;

/**
 * Health Panel 状态
 * - 1Hz setInterval 读 inst.getRendererHealth()(避免每帧 clone + Object.freeze 成本)
 * - 字段值因 setter 改动而改变(frameCount/drawCallIdx/droppedFrames/initDurationMs 都会动)
 * - 因 useMatrixRain 在重建时会先 null 旧实例再赋新值,1Hz 读到的可能是旧实例的 last 帧状态
 *   这没问题 —— 字段变 0 时 panel 会自己反映"未初始化"
 */
const health = ref<Health | null>(null);
const healthOpen = ref(true);
let healthTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 完整 options 传给 useMatrixRain
 * - useMatrixRain 内部 deep watch,任意字段变化 → 销毁旧实例 + 重建
 * - brightness 包在 themeParams 里(引擎约定)
 */
const matrixOptions = computed<MatrixRainOptions>(() => ({
  theme: params.theme,
  variant: params.variant,
  fontSize: params.fontSize,
  trailAlpha: params.trailAlpha,
  maxDPR: params.maxDPR,
  themeParams: { brightness: params.brightness },
  targetPhase: params.targetPhase,
  targetNoiseDuration: params.targetNoiseDuration,
  targetConvergeDuration: params.targetConvergeDuration,
  targetLockStability: params.targetLockStability,
  targetLockOrder: params.targetLockOrder,
  targetFadeIn: 0.3,
  targetHold: 3.0,
  targetFadeOut: 2.0,
}));

const instance = useMatrixRain(matrixOptions, canvasRef);

const codeString = computed(() => {
  const opts: Record<string, unknown> = {
    theme: params.theme,
    variant: params.variant,
    fontSize: params.fontSize,
    trailAlpha: params.trailAlpha,
    maxDPR: params.maxDPR,
    themeParams: { brightness: params.brightness },
  };
  if (params.targetPhase === 'noise-converge') {
    opts.targetPhase = 'noise-converge';
    opts.targetNoiseDuration = params.targetNoiseDuration;
    opts.targetConvergeDuration = params.targetConvergeDuration;
    opts.targetLockStability = params.targetLockStability;
    opts.targetLockOrder = params.targetLockOrder;
  }
  return `import { matrixRain, textToBitmap } from '@xietuier/matrix-rain';

const rain = matrixRain({
  canvas: document.querySelector('canvas'),
${Object.entries(opts)
  .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
  .join(',\n')}
});

// 然后设置 target 让文字涌现:
const bitmap = textToBitmap('${targetText.value || ' '}', 40, 20);
rain.setTargetBitmap(bitmap, {
  phase: '${params.targetPhase}'${
    params.targetPhase === 'noise-converge'
      ? `,
  noiseDuration: ${params.targetNoiseDuration},
  convergeDuration: ${params.targetConvergeDuration},
  lockOrder: '${params.targetLockOrder}',
  lockStability: ${params.targetLockStability}`
      : ''
  }
});`;
});

function setLockOrder(o: typeof params.targetLockOrder) {
  params.targetLockOrder = o;
  // regenerate 由下方 watcher 自动触发(useMatrixRain 重建 + rAF 后重新 setTargetBitmap)
}

function regenerate() {
  const inst = instance.value;
  if (!inst || !canvasRef.value) return;
  // **DPR-safe** 修复:用 clientWidth/clientHeight(CSS 像素)而不是 canvas.width/height(DPR-缩放 backing store)
  // 旧版用 canvas.width/height 传 textToBitmap,DPR=2 时 cols 翻倍 → 文字"过大"溢出
  // 详见 docs/playwright/text-overflow-report.md(阶段 1 报告,commit 1efa77d)
  const cssW = canvasRef.value.clientWidth || canvasRef.value.width;
  const cssH = canvasRef.value.clientHeight || canvasRef.value.height;
  const cols = Math.max(8, Math.floor(cssW / params.fontSize));
  const rows = Math.max(6, Math.floor(cssH / params.fontSize));
  const text = (targetText.value || ' ').trim() || ' ';
  const bm = textToBitmap(text, cols, rows, undefined, 'contain');
  inst.setTargetBitmap(bm, {
    phase: params.targetPhase,
    noiseDuration: params.targetNoiseDuration,
    convergeDuration: params.targetConvergeDuration,
    lockOrder: params.targetLockOrder,
    lockStability: params.targetLockStability,
  });
}

function copyCode() {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(codeString.value).catch(() => {
      /* silent */
    });
  }
}

function resetParams() {
  Object.assign(params, defaults);
  targetText.value = 'MATRIX';
  // regenerate 由下方 watcher 自动触发
}

function phaseTick() {
  const inst = instance.value;
  if (inst && typeof (inst as any).getTargetState === 'function') {
    const state = (inst as any).getTargetState();
    if (state) {
      phase.value = state.phase;
      elapsed.value = state.elapsed;
    }
  }
  phaseRaf = requestAnimationFrame(phaseTick);
}

/**
 * Health Panel:1Hz 从 instance 拉一次快照
 * - 字段值由 getter 返回 Object.freeze 副本,Vue 浅比较能检测到字段变化
 * - 任一异常字段触发 is-warn 高亮
 * - 整个面板不参与 rAF,不污染渲染主循环
 */
function pollHealth() {
  const inst = instance.value;
  if (!inst || typeof inst.getRendererHealth !== 'function') {
    health.value = null;
    return;
  }
  try {
    health.value = inst.getRendererHealth();
  } catch {
    health.value = null;
  }
}

/** Health Panel 折叠头角标:renderer + frameCount + 错误数 */
const healthBadgeState = computed<'ok' | 'warn' | 'init'>(() => {
  if (!health.value) return 'init';
  const h = health.value;
  if (h.lastGlError !== 0 || h.lastErrorScope !== null || h.lastInitError !== null) return 'warn';
  if (!h.initialized || h.frameCount === 0) return 'init';
  return 'ok';
});
const healthBadgeLabel = computed(() => {
  const h = health.value;
  if (!h) return '未初始化';
  const errCount =
    (h.lastGlError !== 0 ? 1 : 0) +
    (h.lastErrorScope !== null ? 1 : 0) +
    (h.lastInitError !== null ? 1 : 0);
  if (errCount > 0) return `${h.renderer} · ${errCount} err`;
  return `${h.renderer} · ${h.frameCount}f`;
});

/** Health 字段渲染:错误值裁断长度,数字保持 tabular */
function formatHealth(key: keyof Health, h: Health): string {
  const v = h[key];
  if (key === 'lastErrorScope' || key === 'lastInitError') {
    return v == null ? 'null' : String(v).slice(0, 80);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return String(v);
}

// canvas 鼠标坐标 readout · 跟 cell R:C 同步
function onCanvasMove(ev: PointerEvent) {
  const cv = canvasRef.value;
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  const x = Math.round(ev.clientX - rect.left);
  const y = Math.round(ev.clientY - rect.top);
  coords.x = Math.max(0, Math.min(x, rect.width));
  coords.y = Math.max(0, Math.min(y, rect.height));
  coords.col = Math.max(0, Math.floor(coords.x / params.fontSize));
  coords.row = Math.max(0, Math.floor(coords.y / params.fontSize));
}

/**
 * 关键修复:原版直接调 matrixRain() 后没有 watch params,
 * 导致 theme/variant/fontSize/trailAlpha/maxDPR/brightness/phase/duration/lockStability/lockOrder 全部不生效。
 *
 * 现在 useMatrixRain 已 deep watch matrixOptions → 任意 param 变化触发重建。
 * 但重建后新实例没有 target bitmap,必须再 setTargetBitmap 才能保持涌现效果。
 * 监听 targetText + 所有 params,rAF 节流后调 regenerate()。
 */
watch(
  [
    () => targetText.value,
    () => params.theme,
    () => params.variant,
    () => params.fontSize,
    () => params.trailAlpha,
    () => params.maxDPR,
    () => params.brightness,
    () => params.targetPhase,
    () => params.targetLockOrder,
    () => params.targetNoiseDuration,
    () => params.targetConvergeDuration,
    () => params.targetLockStability,
  ],
  () => {
    if (inputRaf !== null) cancelAnimationFrame(inputRaf);
    inputRaf = requestAnimationFrame(() => {
      inputRaf = null;
      regenerate();
    });
  }
);

onMounted(() => {
  setTimeout(regenerate, 250);
  phaseTick();
  // Health Panel:1Hz 拉一次(等到首帧后再启,避免拿空实例)
  setTimeout(() => {
    pollHealth();
    healthTimer = setInterval(pollHealth, 1000);
  }, 1100);
});

onBeforeUnmount(() => {
  if (inputRaf !== null) cancelAnimationFrame(inputRaf);
  cancelAnimationFrame(phaseRaf);
  if (healthTimer !== null) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  // instance 销毁由 useMatrixRain 自动处理
});
</script>

<style scoped>
.playground {
  padding-bottom: 80px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.pg-grid {
  display: grid;
  /* 桌面起步:面板 320px 固定,canvas 占满剩余
   * 大屏:面板加宽 360-400px,canvas 也有合理 max-width 不至于太宽 */
  grid-template-columns: 320px 1fr;
  gap: 24px;
  margin-bottom: 32px;
  align-items: start;
}
.params {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  max-height: 80vh;
  overflow-y: auto;
}
.params h3 {
  font-size: 11px;
  font-family: var(--font-mono);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin: 0 0 12px;
  font-weight: 500;
}
.params h2.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.params h3:not(:first-of-type) {
  margin-top: 24px;
}
.params label {
  margin-bottom: 12px;
  font-size: 11px;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-muted);
  font-family: var(--font-mono);
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.cv {
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.lock-orders {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  margin-bottom: 12px;
}
.lock-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  width: 100%;
  margin-bottom: 6px;
}
.btn.active {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}

/**
 * Health Panel 样式(0.6.0+ Playground 可折叠诊断面板)
 * - 默认折叠角标显示 renderer + frameCount + 错误数
 * - lastGlError/lastErrorScope/lastInitError 任一异常 → is-warn 红色背景
 * - 字段宽度自适 table-layout:fixed;保持列对齐
 */
.health-panel {
  margin-top: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
.health-panel > summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  user-select: none;
  font-size: 11px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.health-panel > summary::-webkit-details-marker {
  display: none;
}
.health-panel > summary::before {
  content: '▸';
  display: inline-block;
  margin-right: 4px;
  transition: transform 0.15s ease;
}
.health-panel[open] > summary::before {
  transform: rotate(90deg);
}
.health-title {
  font-weight: 500;
}
.health-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  text-transform: none;
}
.health-pill[data-state='ok'] {
  color: #7af7d4;
  border-color: rgba(122, 247, 212, 0.3);
}
.health-pill[data-state='warn'] {
  color: #ff5c7c;
  border-color: rgba(255, 92, 124, 0.5);
  background: rgba(255, 92, 124, 0.08);
}
.health-pill[data-state='init'] {
  color: var(--text-faint);
}
.health-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  table-layout: fixed;
}
.health-table th,
.health-table td {
  text-align: left;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  font-weight: 400;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}
.health-table th {
  width: 48%;
  color: var(--text-faint);
  text-transform: none;
  letter-spacing: 0;
}
.health-table td {
  color: var(--text);
}
.health-table tr.is-warn td,
.health-table tr.is-warn th {
  background: rgba(255, 92, 124, 0.12);
  color: #ff5c7c;
}
.health-empty {
  font-size: 11px;
  color: var(--text-faint);
  margin: 8px 0 0;
}
.health-hint {
  font-size: 10px;
  color: var(--text-faint);
  margin: 8px 0 0;
  text-transform: none;
  letter-spacing: 0;
}

.canvas-area {
  min-width: 0;
  /* 大屏 canvas 也不无限拉伸,留 1280 上限 */
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
}
.canvas-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16/10;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.canvas-wrap canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.overlay-info {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  gap: 8px;
  pointer-events: none;
}
.info-pill {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 4px 10px;
  background: rgba(8, 8, 18, 0.85);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text);
  letter-spacing: 0.04em;
  backdrop-filter: blur(8px);
}
.info-pill.mono {
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.info-pill[data-phase='hold'] {
  color: #7af7d4;
}
.info-pill[data-phase='converge'] {
  color: #a8a3ff;
}
.info-pill[data-phase='noise'] {
  color: #ff5c7c;
}
.info-pill[data-phase='dissolve'] {
  color: #fbbf24;
}

.code-output {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
}
.code-output h3 {
  font-size: 16px;
  margin: 0 0 16px;
}
.code-output pre {
  font-size: 12px;
  line-height: 1.7;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  white-space: pre;
  margin: 0;
}
.hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-faint);
}

@media (max-width: 920px) {
  .pg-grid {
    grid-template-columns: 1fr;
  }
  .params {
    max-height: none;
  }
}

/* 桌面中-大屏适配(2026-06-08)· 面板加宽 · 字号 scale
 * 1280+: 面板 360,canvas max-width 不动
 * 1440+: 面板 400
 * 1920+: 面板 440,canvas 高度也加
 * 2560+: 面板 480
 * 3840+: 面板 540,所有字号 14-15 */
@media (min-width: 1280px) {
  .pg-grid {
    grid-template-columns: 360px 1fr;
    gap: 32px;
  }
  .params {
    padding: 28px;
  }
  .params h3 {
    font-size: 12px;
  }
}
@media (min-width: 1440px) {
  .pg-grid {
    grid-template-columns: 400px 1fr;
    gap: 36px;
  }
  .params {
    padding: 32px;
  }
  .params h3 {
    font-size: 13px;
  }
}
@media (min-width: 1920px) {
  .pg-grid {
    grid-template-columns: 440px 1fr;
    gap: 40px;
  }
  .params {
    padding: 36px;
  }
  .params h3 {
    font-size: 13px;
    margin-bottom: 16px;
  }
  .params label {
    font-size: 12px;
  }
  .code-output pre {
    font-size: 14px;
    padding: 20px;
  }
}
@media (min-width: 2560px) {
  .pg-grid {
    grid-template-columns: 480px 1fr;
    gap: 48px;
  }
  .params {
    padding: 40px;
  }
  .params h3 {
    font-size: 14px;
  }
  .params label {
    font-size: 13px;
  }
  .code-output pre {
    font-size: 16px;
    padding: 24px;
  }
}
@media (min-width: 3840px) {
  .pg-grid {
    grid-template-columns: 540px 1fr;
    gap: 56px;
  }
  .params {
    padding: 48px;
  }
  .params h3 {
    font-size: 15px;
    letter-spacing: 0.18em;
  }
  .params label {
    font-size: 14px;
  }
  .code-output pre {
    font-size: 18px;
    padding: 32px;
  }
  .info-pill {
    font-size: 13px;
    padding: 6px 14px;
  }
  .code-output h3 {
    font-size: 22px;
  }
}
</style>
