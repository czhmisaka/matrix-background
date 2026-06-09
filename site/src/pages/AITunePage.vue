<template>
  <div class="ai-tune-page">
    <!-- 顶 header(全宽) -->
    <header class="topbar">
      <router-link to="/demos" class="back">← Demos</router-link>
      <span class="crumb">Demos</span>
      <h1>🪄 AI 调参 Playground</h1>
      <span class="spacer"></span>
      <span :class="['badge', llmConfigured() ? 'ok' : 'warn']">
        {{ llmConfigured() ? '已连接' : '未连接' }}
      </span>
    </header>

    <!-- 主体:左 380px 面板 + 右 stage -->
    <div class="layout">
      <AITunePanel
        v-model:mode="mode"
        :llm-config="llmConfig"
        :llm-configured="llmConfigured"
        :llm-status="llmStatus"
        :phase="phase"
        :elapsed="elapsed"
        @apply-preset="onApplyPreset"
        @apply-text="onApplyText"
        @apply-image="onApplyImage"
        @clear-bitmap="onClearBitmap"
        @clear-chat="clearMessages"
      />

      <section class="stage" ref="stageRef" aria-label="画布与状态">
        <canvas ref="canvasRef"></canvas>
        <div class="stage-info">
          <span class="stage-tag">FPS: {{ fps.toFixed(0) }}</span>
          <span class="stage-tag">主题: {{ currentOptions.theme || 'silicon-valley' }}</span>
          <span class="stage-tag">变体: {{ currentOptions.variant || 'classic' }}</span>
        </div>

        <!-- 左下角 AI 对话叠加层(占 stage 1/4) -->
        <div :class="['ai-overlay', { collapsed: overlayCollapsed }]">
          <div class="ai-overlay-glow"></div>
          <div class="ai-overlay-header">
            <span class="ai-overlay-dot"></span>
            <span class="ai-overlay-title">AI 对话</span>
            <button
              class="ai-overlay-toggle"
              title="折叠/展开"
              aria-label="折叠/展开 AI 对话"
              @click="overlayCollapsed = !overlayCollapsed"
            >
              ▾
            </button>
          </div>
          <ChatLog
            :messages="messages"
            :loading="isLoading"
            :current-round="currentRound"
            :max-rounds="maxRounds"
          />
          <form class="ai-overlay-form" @submit.prevent="onSendFromOverlay">
            <input
              v-model="heroInput"
              type="text"
              placeholder="描述背景效果·如:熔岩红 雪崩下落 慢节奏"
              maxlength="200"
              aria-label="AI 调参指令"
            />
            <button
              type="submit"
              :disabled="!heroInput.trim() || isLoading"
              title="发送"
              aria-label="发送 AI 指令"
            >
              →
            </button>
          </form>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import AITunePanel from '@/components/AITunePanel.vue';
import ChatLog from '@/components/ChatLog.vue';
import { useMatrixRain } from '@/composables/useMatrixRain';
import { useAitune, type LlmMode, type PresetConfig } from '@/composables/useAitune';
import type { MatrixRainOptions, MatrixRainInstance } from '@xietuier/matrix-rain';

const stageRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

// 默认 matrix-rain 配置
const currentOptions = ref<Partial<MatrixRainOptions>>({
  theme: 'silicon-valley',
  variant: 'classic',
  fontSize: undefined, // 自适应
  trailAlpha: 0.18,
  maxDPR: 2,
});

// 创建实例(useMatrixRain deep-watch currentOptions → 任意字段变化重建)
const instance = useMatrixRain(currentOptions, canvasRef);

// === useAitune(LLM 状态机) ===
const {
  llmConfig,
  llmConfigured,
  llmStatus,
  messages,
  isLoading,
  currentRound,
  maxRounds,
  clearMessages,
  send,
  applyPreset: applyPresetRaw,
  applyTextBitmap,
  applyImageBitmap,
  clearBitmap,
} = useAitune({ instance, canvas: canvasRef, currentOptions });

const mode = ref<LlmMode>('complex');
const heroInput = ref('');
const overlayCollapsed = ref(false);
const phase = ref<'idle' | 'noise' | 'converge' | 'hold' | 'dissolve'>('idle');
const elapsed = ref(0);
const fps = ref(0);

let fpsRaf = 0;
let phaseRaf = 0;
let lastFps = 0;
let lastFpsUpdate = 0;

function tick() {
  const inst = instance.value;
  if (inst) {
    const now = performance.now();
    if (now - lastFpsUpdate > 500) {
      const cur = inst.getFPS?.() ?? 0;
      if (cur > 0) lastFps = cur;
      fps.value = lastFps;
      lastFpsUpdate = now;
    }
    // 阶段状态
    const state = (inst as MatrixRainInstance).getTargetState?.();
    if (state) {
      phase.value = state.phase;
      elapsed.value = state.elapsed;
    }
  }
  fpsRaf = requestAnimationFrame(tick);
}

onMounted(() => {
  // 启动 rAF 循环
  fpsRaf = requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(fpsRaf);
  cancelAnimationFrame(phaseRaf);
});

// === 应用预设 ===
function onApplyPreset(preset: PresetConfig) {
  applyPresetRaw(preset);
}

// === 文本 → bitmap ===
function onApplyText(text: string, opts: { anchor: string; motion: string }) {
  applyTextBitmap(text, opts.anchor as any, opts.motion as any);
}

// === 图片 → bitmap ===
function onApplyImage(file: File, opts: { anchor: string; motion: string }) {
  applyImageBitmap(file, opts.anchor as any, opts.motion as any);
}

function onClearBitmap() {
  clearBitmap();
}

// === 发送 Hero 输入 ===
async function onSendFromOverlay() {
  const text = heroInput.value.trim();
  if (!text) return;
  heroInput.value = '';
  await send(text, null);
}
</script>

<style scoped>
.ai-tune-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
  overflow: hidden;
}

/* 顶部 header */
.topbar {
  flex-shrink: 0;
  padding: 12px 22px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 14px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.2));
  backdrop-filter: blur(8px);
}
.topbar h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.2px;
}
.back {
  color: var(--accent);
  text-decoration: none;
  font-size: 12px;
  font-family: var(--font-mono);
}
.back:hover {
  text-decoration: underline;
}
.crumb {
  color: var(--text-faint);
  font-size: 11px;
  font-family: var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.spacer {
  flex: 1;
}
.badge {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--font-mono);
  border: 1px solid;
}
.badge.ok {
  background: rgba(46, 213, 115, 0.12);
  color: rgb(46, 213, 115);
  border-color: rgba(46, 213, 115, 0.3);
}
.badge.warn {
  background: rgba(255, 100, 100, 0.12);
  color: rgb(255, 100, 100);
  border-color: rgba(255, 100, 100, 0.3);
}

/* 主体布局 */
.layout {
  flex: 1;
  display: grid;
  grid-template-columns: 380px 1fr;
  min-height: 0;
}

/* 右侧 stage */
.stage {
  position: relative;
  background: #000;
  overflow: hidden;
  min-width: 0;
}
.stage canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.stage-info {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  gap: 8px;
  z-index: 11;
  pointer-events: none;
  flex-wrap: wrap;
}
.stage-tag {
  padding: 4px 10px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(0, 229, 255, 0.25);
  color: rgb(0, 229, 255);
  font-size: 11px;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
  backdrop-filter: blur(6px);
}

/* AI 对话叠加层(左下角 · 1/4 宽) */
.ai-overlay {
  position: absolute;
  left: 16px;
  bottom: 16px;
  width: calc(25% - 24px);
  min-width: 220px;
  max-width: 360px;
  max-height: 50%;
  z-index: 10;
  border-radius: 14px;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    rgba(8, 8, 18, 0) 0%,
    rgba(8, 8, 18, 0.55) 35%,
    rgba(8, 8, 18, 0.92) 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 229, 255, 0.12);
  box-shadow:
    0 0 24px rgba(0, 229, 255, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--text);
  animation: ai-overlay-rise 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) 0.2s both;
}
.ai-overlay-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(0, 229, 255, 0.6) 50%, transparent 100%);
  pointer-events: none;
}
.ai-overlay-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 6px;
  flex-shrink: 0;
}
.ai-overlay-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(0, 229, 255);
  box-shadow: 0 0 6px rgba(0, 229, 255, 0.8);
  animation: ai-overlay-pulse 2s ease-in-out infinite;
}
.ai-overlay-title {
  font-size: 11px;
  font-family: var(--font-mono);
  color: rgba(0, 229, 255, 0.85);
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.ai-overlay-toggle {
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 0 4px;
  min-width: 32px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition:
    transform 0.25s,
    color 0.2s;
}
.ai-overlay-toggle:hover {
  color: rgb(0, 229, 255);
}
.ai-overlay.collapsed .ai-overlay-toggle {
  transform: rotate(180deg);
}
.ai-overlay.collapsed :deep(.chat-log) {
  display: none;
}

.ai-overlay-form {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 10px;
  flex-shrink: 0;
  border-top: 1px solid rgba(0, 229, 255, 0.08);
}
.ai-overlay-form input {
  flex: 1;
  min-width: 0;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(124, 92, 255, 0.25);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 11.5px;
  padding: 6px 10px;
  border-radius: 6px;
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.ai-overlay-form input::placeholder {
  color: var(--text-faint);
}
.ai-overlay-form input:focus {
  border-color: rgba(0, 229, 255, 0.6);
  box-shadow: 0 0 0 1px rgba(0, 229, 255, 0.2);
}
.ai-overlay-form button {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgb(0, 229, 255), rgb(124, 92, 255));
  color: #000;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}
.ai-overlay-form button:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 229, 255, 0.4);
}
.ai-overlay-form button:active {
  transform: translateY(0);
}
.ai-overlay-form button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes ai-overlay-rise {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes ai-overlay-pulse {
  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 6px rgba(0, 229, 255, 0.8);
  }
  50% {
    opacity: 0.4;
    box-shadow: 0 0 3px rgba(0, 229, 255, 0.4);
  }
}

@media (max-width: 768px) {
  .layout {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }
  .ai-panel {
    border-right: 0;
    border-top: 1px solid var(--border);
    max-height: 50vh;
  }
  .stage {
    grid-row: 1;
  }
}
@media (max-width: 480px) {
  /* 320px 移动端:AI 对话叠加层占满 canvas 底部全宽,避免被挤压无法阅读 */
  .ai-overlay {
    left: 8px;
    right: 8px;
    bottom: 8px;
    width: auto;
    min-width: 100%;
    max-width: none;
  }
}
</style>
