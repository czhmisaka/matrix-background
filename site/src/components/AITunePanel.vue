<template>
  <aside class="ai-panel">
    <!-- Header -->
    <div class="panel-header">
      <span class="tag">🪄 AI</span>
      <h2>调参</h2>
      <button class="clear-btn" title="清空对话" @click="$emit('clear-chat')">×</button>
    </div>

    <!-- 模式选择 -->
    <LlmModeSelector v-model="mode" />

    <!-- 6 个本地预设 -->
    <div class="section">
      <div class="section-label">6 预设(免 LLM)</div>
      <PresetChips @pick="(p) => $emit('apply-preset', p)" />
    </div>

    <!-- 文本 → bitmap -->
    <div class="block">
      <div class="block-header">
        <span class="badge">T</span>
        <span class="block-title">显示文字</span>
        <span class="block-sub">数字化图形</span>
      </div>
      <div class="text-row">
        <textarea
          v-model="textInput"
          rows="2"
          placeholder="例:MATRIX / 硅谷大蟹"
          class="text-input"
        ></textarea>
        <button class="apply-fab" title="生成" :disabled="!textInput.trim()" @click="onApplyText">✦</button>
      </div>
      <div class="opts-row">
        <label class="opts-label">位置</label>
        <select v-model="textAnchor" class="opts-select">
          <option value="center">居中</option>
          <option value="topLeft">左上</option>
          <option value="topRight">右上</option>
          <option value="bottomLeft">左下</option>
          <option value="bottomRight">右下</option>
        </select>
        <label class="opts-label">运动</label>
        <select v-model="textMotion" class="opts-select">
          <option value="static">静止</option>
          <option value="drift">横向漂</option>
          <option value="bounce">反弹</option>
          <option value="float">上下浮</option>
        </select>
      </div>
    </div>

    <!-- 图片 → bitmap -->
    <ImageUploader
      @apply="onApplyImage"
      @clear="$emit('clear-bitmap')"
    />

    <!-- LLM 配置(折叠) -->
    <LlmConfigCard
      :cfg="llmConfig"
      :llm-configured="llmConfigured()"
      :llm-status="llmStatus()"
    />

    <!-- 阶段 pill -->
    <div class="phase-strip">
      <span class="phase-label">PHASE</span>
      <span :class="['phase-pill', `phase-${phase}`]">{{ phase }}</span>
      <span class="phase-time">{{ elapsed.toFixed(2) }}s</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, type PropType } from 'vue';
import PresetChips from './PresetChips.vue';
import LlmModeSelector from './LlmModeSelector.vue';
import LlmConfigCard from './LlmConfigCard.vue';
import ImageUploader from './ImageUploader.vue';
import type { LlmConfig, LlmMode, PresetConfig } from '@/composables/useAitune';

defineProps({
  llmConfig: { type: Object as PropType<LlmConfig>, required: true },
  llmConfigured: { type: Function as PropType<() => boolean>, required: true },
  llmStatus: { type: Function as PropType<() => string>, required: true },
  phase: { type: String, default: 'idle' },
  elapsed: { type: Number, default: 0 }
});
const emit = defineEmits<{
  (e: 'apply-preset', preset: PresetConfig): void;
  (e: 'apply-text', text: string, opts: { anchor: string; motion: string }): void;
  (e: 'apply-image', file: File, opts: { anchor: string; motion: string }): void;
  (e: 'clear-bitmap'): void;
  (e: 'clear-chat'): void;
  (e: 'update:mode', mode: LlmMode): void;
}>();

const mode = defineModel<LlmMode>('mode', { required: true });
const textInput = ref('');
const textAnchor = ref('center');
const textMotion = ref('static');

function onApplyText() {
  const t = textInput.value.trim();
  if (!t) return;
  emit('apply-text', t, { anchor: textAnchor.value, motion: textMotion.value });
}
function onApplyImage(file: File, opts: { anchor: string; motion: string }) {
  // ImageUploader 内部已经传 (file, { anchor, motion })
  emit('apply-image', file, opts);
}
</script>

<style scoped>
.ai-panel {
  background: var(--bg-elev);
  border-right: 1px solid var(--border);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 229, 255, 0.35) transparent;
}
.ai-panel::-webkit-scrollbar { width: 6px; }
.ai-panel::-webkit-scrollbar-track { background: transparent; }
.ai-panel::-webkit-scrollbar-thumb {
  background: rgba(0, 229, 255, 0.35);
  border-radius: 3px;
}
.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.tag {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--accent);
  text-transform: uppercase;
}
.panel-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.clear-btn {
  margin-left: auto;
  width: 22px;
  height: 22px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s;
}
.clear-btn:hover {
  color: var(--text);
  border-color: var(--border-strong);
  background: rgba(255, 255, 255, 0.04);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.section-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 4px;
}

.block {
  background: rgba(8, 8, 18, 0.75);
  border: 1px solid rgba(124, 92, 255, 0.18);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.02) inset;
  position: relative;
}
.block-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.25), rgba(124, 92, 255, 0.25));
  border: 1px solid rgba(0, 229, 255, 0.35);
  color: rgb(0, 229, 255);
  font-size: 10px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
}
.block-title {
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: rgba(0, 229, 255, 0.9);
  font-family: var(--font-mono);
  text-transform: uppercase;
  font-weight: 500;
}
.block-sub {
  font-size: 10.5px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  letter-spacing: 0.05em;
}
.text-row {
  position: relative;
  display: block;
}
.text-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(124, 92, 255, 0.3);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  outline: none;
  resize: vertical;
  min-height: 34px;
  max-height: 96px;
  line-height: 1.5;
  box-sizing: border-box;
  padding-right: 42px;
  padding-bottom: 38px;
}
.text-input:focus { border-color: rgba(0, 229, 255, 0.6); }
.apply-fab {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.25), rgba(124, 92, 255, 0.25));
  border: 1px solid rgba(0, 229, 255, 0.5);
  color: rgb(0, 229, 255);
  border-radius: 7px;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  z-index: 1;
  transition: all 0.15s;
}
.apply-fab:hover {
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.4), rgba(124, 92, 255, 0.4));
  border-color: rgb(0, 229, 255);
  transform: translateY(-1px);
}
.apply-fab:disabled { opacity: 0.4; cursor: not-allowed; }

.opts-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.opts-label {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  letter-spacing: 0.05em;
  line-height: 22px;
}
.opts-select {
  background-color: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(124, 92, 255, 0.18);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 2px 8px;
  border-radius: 4px;
  outline: none;
  cursor: pointer;
  height: 22px;
}
.opts-select:hover { border-color: rgba(0, 229, 255, 0.35); }
.opts-select:focus { border-color: rgba(0, 229, 255, 0.6); }
.opts-select option { background: var(--bg); color: var(--text); }

.phase-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  flex-shrink: 0;
  margin-top: auto;
}
.phase-label {
  color: var(--text-faint);
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.phase-pill {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  letter-spacing: 0.04em;
  background: rgba(0, 0, 0, 0.5);
}
.phase-pill.phase-idle { color: var(--text-muted); }
.phase-pill.phase-noise { color: rgb(255, 92, 124); }
.phase-pill.phase-converge { color: rgb(168, 163, 255); }
.phase-pill.phase-hold { color: rgb(122, 247, 212); }
.phase-pill.phase-dissolve { color: rgb(251, 191, 36); }
.phase-time {
  margin-left: auto;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
</style>
