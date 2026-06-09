<template>
  <div class="image-converge">
    <div class="container">
      <header class="page-header">
        <span class="tag">Image Emergence</span>
        <h1>图片噪声 → 收敛涌现</h1>
        <p class="lead">
          5 段状态机:<b>idle</b>(等待图片)→ <b>loading</b>(File→Image)→ <b>noise</b>(全屏噪点)→
          <b>converge</b>(逐 cell 锁定为图像)→ <b>hold</b>(完整呈现)。上传 / 拖入 / 选择预设
          即可演示。
        </p>
      </header>

      <div class="stage">
        <canvas ref="canvasRef" aria-hidden="true"></canvas>
        <div class="phase-indicator" role="group" aria-label="涌现动画状态">
          <div class="label">Current Phase</div>
          <div
            class="phase"
            :data-phase="phase"
            role="status"
            aria-live="polite"
            :aria-label="`当前阶段 ${phase}`"
          >
            {{ phase }}
          </div>
          <div class="time" aria-hidden="true">
            t = {{ elapsed.toFixed(2) }}s · {{ lockedCount }}/{{ totalTargets }} locked
          </div>
        </div>
        <div v-if="errorMsg" class="error-banner" role="alert" aria-live="assertive">
          <span class="err-icon">⚠</span>
          <span>{{ errorMsg }}</span>
          <button class="err-dismiss" @click="errorMsg = ''" aria-label="关闭错误">×</button>
        </div>
      </div>

      <div
        class="progress"
        v-if="phase !== 'idle' && phase !== 'hold'"
        role="progressbar"
        :aria-valuemin="0"
        :aria-valuemax="1"
        :aria-valuenow="progress"
        :aria-valuetext="`${(progress * 100).toFixed(0)}%`"
      >
        <div class="progress-bar" :style="{ width: `${progress * 100}%` }"></div>
      </div>

      <section class="control-panel">
        <h2>Image Noise → Converge Control Panel</h2>

        <div class="group">
          <h3>① 上传图片</h3>
          <ImageUploader ref="uploaderRef" @apply="onUploaderApply" @clear="onUploaderClear" />
          <div class="row" style="margin-top: 10px">
            <span class="hint">提示:支持 PNG / JPG / WebP,4 MB 以内</span>
          </div>
        </div>

        <div class="group">
          <h3>② 预设图片</h3>
          <div class="preset-row">
            <button
              v-for="(p, i) in presets"
              :key="i"
              :class="['preset-btn', { active: activePresetIdx === i }]"
              @click="loadPreset(i)"
              :aria-label="`使用预设 ${p.name}`"
              :aria-pressed="activePresetIdx === i"
            >
              <img
                v-if="p.thumb"
                :src="p.thumb"
                class="preset-thumb"
                :alt="`${p.name} 预览`"
                aria-hidden="true"
              />
              <span class="preset-name">{{ p.name }}</span>
            </button>
          </div>
        </div>

        <div class="group">
          <h3>③ 调参</h3>
          <div class="row">
            <label for="imgc-noiseDur">noiseDuration</label>
            <input
              id="imgc-noiseDur"
              type="range"
              min="0"
              max="3"
              step="0.1"
              v-model.number="noiseDur"
              @input="onSliderInput"
              @change="onParamsChange"
              aria-label="全屏噪点时长(秒)"
              :aria-valuemin="0"
              :aria-valuemax="3"
              :aria-valuenow="noiseDur"
              :aria-valuetext="`${noiseDur.toFixed(1)} 秒`"
            />
            <span class="val" aria-hidden="true">{{ noiseDur.toFixed(1) }}s</span>
          </div>
          <div class="row">
            <label for="imgc-convergeDur">convergeDuration</label>
            <input
              id="imgc-convergeDur"
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              v-model.number="convergeDur"
              @input="onSliderInput"
              @change="onParamsChange"
              aria-label="逐 cell 锁定时长(秒)"
              :aria-valuemin="0.1"
              :aria-valuemax="5"
              :aria-valuenow="convergeDur"
              :aria-valuetext="`${convergeDur.toFixed(1)} 秒`"
            />
            <span class="val" aria-hidden="true">{{ convergeDur.toFixed(1) }}s</span>
          </div>
          <div class="row">
            <label for="imgc-noiseFadeIn">noiseFadeInDuration</label>
            <input
              id="imgc-noiseFadeIn"
              type="range"
              min="0"
              max="1"
              step="0.05"
              v-model.number="noiseFadeIn"
              @input="onSliderInput"
              @change="onParamsChange"
              aria-label="噪点渐入时长(秒)"
              :aria-valuemin="0"
              :aria-valuemax="1"
              :aria-valuenow="noiseFadeIn"
              :aria-valuetext="`${noiseFadeIn.toFixed(2)} 秒`"
            />
            <span class="val" aria-hidden="true">{{ noiseFadeIn.toFixed(2) }}s</span>
          </div>
        </div>

        <div class="log">
          <div v-for="(line, i) in logLines" :key="i" class="log-line" v-html="line"></div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import {
  matrixRain,
  imageToBitmap,
  fileToImage,
  type MatrixRainInstance,
  type BitmapSource,
} from '@xietuier/matrix-rain';
import { useTheme } from '@/composables/useTheme';
import ImageUploader from '@/components/ImageUploader.vue';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const uploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null);
const { current: theme } = useTheme();
let inst: MatrixRainInstance | null = null;
let phaseRaf = 0;
let pendingBitmap: BitmapSource | null = null;

// —— 5 段状态机:idle / loading / noise / converge / hold ——
const phase = ref<'idle' | 'loading' | 'noise' | 'converge' | 'hold'>('idle');
const elapsed = ref(0);
const lockedCount = ref(0);
const totalTargets = ref(0);
const errorMsg = ref('');

// —— 调参 ——
const noiseDur = ref(0.5);
const convergeDur = ref(1.5);
const noiseFadeIn = ref(0.3);

// —— 预设图片(SVG data URL,本地零依赖)——
interface Preset {
  name: string;
  thumb: string;
  /** 完整 SVG 内容(等同 <img> 加载的视觉) */
  svg: string;
}

function makeSvgDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const HEART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ff5c7c"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
const STAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#7af7d4"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
const ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#a8a3ff"><path d="M5 12h14M13 5l7 7-7 7" stroke="#a8a3ff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SMILEY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fbbf24"><circle cx="12" cy="12" r="10" fill="#fbbf24"/><circle cx="9" cy="10" r="1.5" fill="#000"/><circle cx="15" cy="10" r="1.5" fill="#000"/><path d="M8 14c0 0 1.5 2 4 2s4-2 4-2" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;

const presets: Preset[] = [
  { name: 'Heart', thumb: makeSvgDataUrl(HEART_SVG), svg: HEART_SVG },
  { name: 'Star', thumb: makeSvgDataUrl(STAR_SVG), svg: STAR_SVG },
  { name: 'Arrow', thumb: makeSvgDataUrl(ARROW_SVG), svg: ARROW_SVG },
  { name: 'Face', thumb: makeSvgDataUrl(SMILEY_SVG), svg: SMILEY_SVG },
];
const activePresetIdx = ref(-1);

// —— 日志 ——
const logLines = ref<string[]>([]);
function log(msg: string) {
  logLines.value.push(msg);
  if (logLines.value.length > 20) logLines.value.shift();
}

// —— 进度条(0-1) ——
const progress = computed(() => {
  if (phase.value === 'idle') return 0;
  if (phase.value === 'loading') return 0.05;
  if (phase.value === 'noise') {
    const d = noiseDur.value;
    return d > 0 ? Math.min(0.4, (elapsed.value / d) * 0.4) : 0.4;
  }
  if (phase.value === 'converge') {
    const d = convergeDur.value;
    const tInPhase = Math.max(0, elapsed.value - noiseDur.value);
    return d > 0 ? Math.min(0.95, 0.4 + (tInPhase / d) * 0.55) : 0.95;
  }
  return 1;
});

// —— 处理用户上传/预设 ——
async function applyImageSource(source: File | Blob | HTMLImageElement, label: string) {
  if (!inst || !canvasRef.value) {
    errorMsg.value = '实例尚未初始化';
    return;
  }
  errorMsg.value = '';
  phase.value = 'loading';
  log(`<span class="log-tag">[load]</span> ${label}`);

  let img: HTMLImageElement;
  try {
    if (source instanceof HTMLImageElement) {
      img = source;
    } else {
      img = await fileToImage(source);
    }
  } catch (e: any) {
    errorMsg.value = `图片加载失败:${e?.message || e}`;
    phase.value = 'idle';
    log(`<span class="log-tag">[error]</span> 图片加载失败`);
    return;
  }

  // imageToBitmap(容许列过大,校验通过)
  const cols = Math.max(8, Math.floor(canvasRef.value.width / 14));
  const rows = Math.max(6, Math.floor(canvasRef.value.height / 14));
  try {
    pendingBitmap = imageToBitmap(img, cols, rows, 'contain');
  } catch (e: any) {
    errorMsg.value = `位图转换失败:${e?.message || e}`;
    phase.value = 'idle';
    return;
  }
  triggerConverge();
}

function triggerConverge() {
  if (!inst || !pendingBitmap) return;
  const bm = pendingBitmap;
  inst.setTargetBitmap(bm, {
    phase: 'noise-converge',
    noiseDuration: noiseDur.value,
    convergeDuration: convergeDur.value,
    fadeIn: noiseFadeIn.value,
    lockOrder: 'random',
    lockStability: 0.85,
    hold: Infinity,
    fadeOut: 2.0,
    anchor: 'center',
    fitMode: 'contain',
  });
  log(
    `<span class="log-tag">[target]</span> set image bitmap ${bm.cols}×${bm.rows} (noise-converge)`
  );
}

function onUploaderApply(file: File, _opts: { anchor: string; motion: string }) {
  void applyImageSource(file, `上传 ${file.name}`);
}
function onUploaderClear() {
  // 切回 idle;引擎不立即清 target(留给 hold)
  log(`<span class="log-tag">[clear]</span> 已清除,等待下一张图`);
  pendingBitmap = null;
  phase.value = 'idle';
}

async function loadPreset(idx: number) {
  activePresetIdx.value = idx;
  const p = presets[idx];
  // 把 SVG 转成 data URL → Image
  const img = new Image();
  img.src = makeSvgDataUrl(p.svg);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
  });
  void applyImageSource(img, `preset "${p.name}"`);
}

function onSliderInput() {
  /* 触发 reactivity,apply 在 change 时 */
}
function onParamsChange() {
  // 滑块 change 时,如果当前 phase 在 noise/converge/hold,重建 target
  if (phase.value === 'noise' || phase.value === 'converge' || phase.value === 'hold') {
    if (pendingBitmap) triggerConverge();
  }
}

function phaseTick() {
  if (!inst) return;
  const state = (inst as any).getTargetState?.();
  if (state) {
    // 同步 phase;hold 模式是 noise-converge 的终态
    if (state.active) {
      if (state.phase === 'noise') phase.value = 'noise';
      else if (state.phase === 'converge') phase.value = 'converge';
      else if (state.phase === 'hold') phase.value = 'hold';
      else if (state.phase === 'dissolve') phase.value = 'hold';
    } else if (phase.value !== 'idle' && phase.value !== 'loading') {
      // 淑出完保持当前 hold 显示
    }
    elapsed.value = state.elapsed;
    lockedCount.value = state.lockedCount || 0;
    totalTargets.value = state.totalTargets || 0;
  }
  phaseRaf = requestAnimationFrame(phaseTick);
}

onMounted(() => {
  if (!canvasRef.value) return;
  inst = matrixRain({
    canvas: canvasRef.value,
    theme: theme.value,
    fontSize: undefined, // 自适应
    trailAlpha: 0.2,
    onTargetFinish: () => {
      log('<span class="log-tag">[target]</span> noise-converge 淑出完成,onTargetFinish 触发');
    },
  });
  phaseTick();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(phaseRaf);
  inst?.destroy();
  inst = null;
});

watch(theme, (t) => inst?.setTheme(t));
</script>

<style scoped>
.image-converge {
  padding-bottom: 80px;
}
.stage {
  position: relative;
  width: 100%;
  height: 60vh;
  min-height: 480px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 16px;
}
.stage canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.phase-indicator {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 10;
  font-family: var(--font-mono);
  font-size: 12px;
  background: rgba(8, 8, 18, 0.85);
  border: 1px solid rgba(255, 92, 124, 0.35);
  padding: 10px 16px;
  border-radius: 8px;
  color: #fff;
  backdrop-filter: blur(8px);
  min-width: 160px;
}
.phase-indicator .label {
  color: #aaa;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.phase-indicator .phase {
  color: #ff5c7c;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.phase-indicator .phase[data-phase='hold'] {
  color: #7af7d4;
}
.phase-indicator .phase[data-phase='converge'] {
  color: #a8a3ff;
}
.phase-indicator .phase[data-phase='noise'] {
  color: #ff5c7c;
}
.phase-indicator .phase[data-phase='loading'] {
  color: #fbbf24;
}
.phase-indicator .phase[data-phase='idle'] {
  color: #888;
}
.phase-indicator .time {
  color: #888;
  font-size: 10px;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}

.error-banner {
  position: absolute;
  top: 24px;
  left: 24px;
  z-index: 11;
  max-width: 60%;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 92, 124, 0.15);
  border: 1px solid rgba(255, 92, 124, 0.5);
  color: #ffd5dd;
  padding: 8px 12px;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  backdrop-filter: blur(8px);
}
.err-icon {
  color: #ff5c7c;
}
.err-dismiss {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 4px;
}

.progress {
  width: 100%;
  height: 4px;
  background: var(--bg-elev);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 32px;
  border: 1px solid var(--border);
}
.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #ff5c7c, #a8a3ff, #7af7d4);
  transition: width 80ms linear;
}

.control-panel {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
}
.control-panel h2 {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.15em;
  color: var(--accent);
  text-transform: uppercase;
  margin: 0 0 16px;
}
.group {
  padding: 12px 14px;
  background: var(--bg);
  border-radius: 8px;
  margin-bottom: 12px;
}
.group h3 {
  margin: 0 0 12px;
  font-size: 11px;
  color: var(--accent);
  font-family: var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 500;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.row > label {
  color: var(--text-muted);
  font-size: 12px;
  font-family: var(--font-mono);
  min-width: 180px;
  margin: 0;
  text-transform: none;
  letter-spacing: 0;
  flex-direction: row;
  align-items: center;
}
.row > input[type='range'] {
  width: 200px;
  max-width: 100%;
}
.val {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  min-width: 60px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.hint {
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 11px;
}
.preset-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
}
.preset-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background: var(--bg-elev-2);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
  transition: all 160ms ease;
}
.preset-btn:hover {
  border-color: var(--accent);
  color: var(--text);
  transform: translateY(-1px);
}
.preset-btn.active {
  background: rgba(255, 92, 124, 0.12);
  border-color: #ff5c7c;
  color: #ff5c7c;
}
.preset-thumb {
  width: 32px;
  height: 32px;
  object-fit: contain;
  filter: drop-shadow(0 0 6px rgba(255, 92, 124, 0.2));
}
.preset-name {
  letter-spacing: 0.05em;
}

.log {
  margin-top: 8px;
  max-height: 100px;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: #888;
  background: var(--bg);
  border-radius: 6px;
  padding: 8px 12px;
}
.log-line {
  padding: 2px 0;
}
.log-tag {
  color: #ff5c7c;
}

@media (max-width: 700px) {
  .row {
    flex-direction: column;
    align-items: stretch;
  }
  .row > label {
    min-width: 0;
  }
  .row > input[type='range'] {
    width: 100%;
  }
  .phase-indicator {
    top: 12px;
    right: 12px;
    padding: 8px 12px;
    min-width: 140px;
  }
  .phase-indicator .phase {
    font-size: 14px;
  }
  .error-banner {
    left: 12px;
    right: 12px;
    max-width: none;
  }
}
</style>
