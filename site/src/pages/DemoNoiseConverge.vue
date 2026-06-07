<template>
  <div class="demo-noise">
    <div class="container">
      <header class="page-header">
        <span class="tag">Emergence</span>
        <h1>噪声 → 收敛</h1>
        <p class="lead">5 段状态机:<b>noise</b>(0.5s 全屏噪点)→ <b>converge</b>(1.5s 逐 cell 锁定)→ <b>hold</b> → <b>dissolve</b>(反向解锁融化)→ <b>idle</b>。7 锁定顺序 × 3 滑块 × rAF debounce 输入框。</p>
      </header>

      <div class="stage">
        <canvas ref="canvasRef"></canvas>
        <div class="phase-indicator">
          <div class="label">Current Phase</div>
          <div class="phase" :data-phase="phase">{{ phase }}</div>
          <div class="time">t = {{ elapsed.toFixed(2) }}s · {{ lockedCount }}/{{ totalTargets }} locked</div>
        </div>
      </div>

      <section class="control-panel">
        <h2>Noise → Converge Control Panel</h2>

        <div class="group">
          <h3>① 输入文本</h3>
          <div class="row">
            <label>target text</label>
            <input
              type="text"
              v-model="inputText"
              @input="onTextInput"
              maxlength="20"
              placeholder="MATRIX"
            >
            <button class="btn btn-sm" @click="applyBitmap(inputText)">应用</button>
          </div>
        </div>

        <div class="group">
          <h3>② 模式切换</h3>
          <div class="row">
            <label>targetPhase</label>
            <button
              :class="['btn', 'btn-sm', { active: currentPhase === 'fade' }]"
              @click="setPhase('fade')"
            >fade (传统淡入)</button>
            <button
              :class="['btn', 'btn-sm', { active: currentPhase === 'noise-converge' }]"
              @click="setPhase('noise-converge')"
            >noise-converge (涌现)</button>
          </div>
        </div>

        <div class="group">
          <h3>③ 锁定顺序 (7 种)</h3>
          <div class="row row-locks">
            <label>targetLockOrder</label>
            <div class="lock-orders">
              <button
                v-for="o in lockOrders" :key="o"
                :class="['btn', 'btn-sm', { active: currentLockOrder === o }]"
                @click="setLockOrder(o)"
              >{{ o }}</button>
            </div>
          </div>
        </div>

        <div class="group">
          <h3>④ 调参</h3>
          <div class="row">
            <label>noiseDuration</label>
            <input type="range" min="0" max="3" step="0.1" v-model.number="noiseDur" @input="onSliderInput" @change="applyBitmap(inputText)">
            <span class="val">{{ noiseDur.toFixed(1) }}s</span>
          </div>
          <div class="row">
            <label>convergeDuration</label>
            <input type="range" min="0.1" max="5" step="0.1" v-model.number="convergeDur" @input="onSliderInput" @change="applyBitmap(inputText)">
            <span class="val">{{ convergeDur.toFixed(1) }}s</span>
          </div>
          <div class="row">
            <label>lockStability</label>
            <input type="range" min="0" max="1" step="0.05" v-model.number="lockStability" @input="onSliderInput" @change="applyBitmap(inputText)">
            <span class="val">{{ lockStability.toFixed(2) }}</span>
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
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue';
import { matrixRain, textToBitmap, type MatrixRainInstance } from '@xietuier/matrix-rain';
import { useTheme } from '@/composables/useTheme';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const { current: theme } = useTheme();
let inst: MatrixRainInstance | null = null;
let inputRaf: number | null = null;
let phaseRaf = 0;

// —— 表单状态 ——
const inputText = ref('MATRIX');
const currentPhase = ref<'fade' | 'noise-converge'>('noise-converge');
const currentLockOrder = ref<'random' | 'topdown' | 'bottomup' | 'center' | 'edge' | 'leftright' | 'rightleft'>('random');
const lockOrders = ['random', 'topdown', 'bottomup', 'center', 'edge', 'leftright', 'rightleft'] as const;
const noiseDur = ref(0.5);
const convergeDur = ref(1.5);
const lockStability = ref(0.7);

// —— 阶段指示器 ——
const phase = ref<'idle' | 'noise' | 'converge' | 'hold' | 'dissolve'>('idle');
const elapsed = ref(0);
const lockedCount = ref(0);
const totalTargets = ref(0);

// —— 日志 ——
const logLines = ref<string[]>([]);
function log(msg: string) {
  logLines.value.push(msg);
  if (logLines.value.length > 20) logLines.value.shift();
}

function applyBitmap(rawText: string) {
  if (!inst || !canvasRef.value) return;
  const text = (rawText || '').trim() || ' ';
  const cols = Math.max(8, Math.floor(canvasRef.value.width / 14));
  const rows = Math.max(6, Math.floor(canvasRef.value.height / 14));
  inst.setTargetBitmap(textToBitmap(text, cols, rows), {
    phase: currentPhase.value,
    noiseDuration: noiseDur.value,
    convergeDuration: convergeDur.value,
    lockOrder: currentLockOrder.value,
    lockStability: lockStability.value,
    hold: Infinity,
    fadeOut: 2.0,
    anchor: 'center'
  });
  log(`<span class="log-tag">[target]</span> set bitmap "${text}" phase=${currentPhase.value} order=${currentLockOrder.value}`);
  // 阶段指示器由 rAF 循环读取 instance.getTargetState() 实时刷新
}

// rAF debounce:多个 input 事件合并为 1 帧 1 次 applyBitmap
function onTextInput() {
  if (inputRaf !== null) cancelAnimationFrame(inputRaf);
  inputRaf = requestAnimationFrame(() => {
    inputRaf = null;
    applyBitmap(inputText.value);
  });
}

// 滑块 input 不立即重建(避免拖拽过程中频繁销毁),只改 ref;change 时才 apply
function onSliderInput() { /* 触发 reactivity 但不重建 */ }

function setPhase(p: 'fade' | 'noise-converge') {
  currentPhase.value = p;
  log(`<span class="log-tag">[mode]</span> phase = ${p}`);
  applyBitmap(inputText.value);
}

function setLockOrder(o: typeof currentLockOrder.value) {
  currentLockOrder.value = o;
  log(`<span class="log-tag">[order]</span> lockOrder = ${o}`);
  applyBitmap(inputText.value);
}

function phaseTick() {
  if (!inst) return;
  const state = (inst as any).getTargetState?.();
  if (state) {
    phase.value = state.phase;
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
    fontSize: 14,
    trailAlpha: 0.2,
    onTargetFinish: () => {
      log('<span class="log-tag">[target]</span> noise-converge 动画结束,onTargetFinish 触发');
    }
  });
  // 初始应用
  setTimeout(() => applyBitmap(inputText.value), 300);
  phaseTick();
});

onBeforeUnmount(() => {
  if (inputRaf !== null) cancelAnimationFrame(inputRaf);
  cancelAnimationFrame(phaseRaf);
  inst?.destroy();
  inst = null;
});

watch(theme, (t) => inst?.setTheme(t));
</script>

<style scoped>
.demo-noise { padding-bottom: 80px; }
.stage {
  position: relative;
  width: 100%;
  height: 60vh;
  min-height: 480px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 32px;
}
.stage canvas { width: 100%; height: 100%; display: block; }
.phase-indicator {
  position: absolute;
  top: 24px; right: 24px;
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
.phase-indicator .label { color: #aaa; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px; }
.phase-indicator .phase {
  color: #ff5c7c;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.phase-indicator .phase[data-phase="hold"] { color: #7af7d4; }
.phase-indicator .phase[data-phase="converge"] { color: #a8a3ff; }
.phase-indicator .phase[data-phase="noise"] { color: #ff5c7c; }
.phase-indicator .phase[data-phase="dissolve"] { color: #fbbf24; }
.phase-indicator .time { color: #888; font-size: 10px; margin-top: 4px; font-variant-numeric: tabular-nums; }

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
  min-width: 140px;
  margin: 0;
  text-transform: none;
  letter-spacing: 0;
  flex-direction: row;
  align-items: center;
}
.row > input[type=text] {
  background: var(--bg-elev-2);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  color: var(--text);
  padding: 6px 10px;
  font-family: var(--font-mono);
  font-size: 13px;
  flex: 1;
  min-width: 200px;
  max-width: 360px;
  text-transform: none;
  letter-spacing: 0;
}
.row > input[type=range] { width: 200px; max-width: 100%; }
.val {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  min-width: 60px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.row-locks { align-items: flex-start; }
.lock-orders { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
.btn.active {
  background: rgba(255, 92, 124, 0.2);
  color: #ff5c7c;
  border-color: #ff5c7c;
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
.log-line { padding: 2px 0; }
.log-tag { color: #ff5c7c; }

@media (max-width: 700px) {
  .row { flex-direction: column; align-items: stretch; }
  .row > label { min-width: 0; }
  .row > input[type=range] { width: 100%; }
  .row > input[type=text] { max-width: none; }
  .phase-indicator { top: 12px; right: 12px; padding: 8px 12px; min-width: 140px; }
  .phase-indicator .phase { font-size: 14px; }
}
</style>
