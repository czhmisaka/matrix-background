<template>
  <details class="llm-config" :open="!llmConfigured">
    <summary>
      <span class="label">LLM 配置</span>
      <span :class="['status', llmConfigured ? 'ok' : 'err']">{{ llmStatus }}</span>
    </summary>
    <div class="hint">
      👋 请填入兼容 OpenAI Chat Completions 的端点(如 MiniMax / OpenAI / 其它)。 🔒 key 仅存浏览器
      localStorage,不上传任何服务。
    </div>
    <div class="field">
      <label>API Base URL</label>
      <input
        type="text"
        v-model="cfg.baseUrl"
        placeholder="必填 · 例如 https://your-llm.example.com/v1"
        spellcheck="false"
        required
      />
    </div>
    <div class="field">
      <label>API Key</label>
      <input type="password" v-model="cfg.apiKey" placeholder="eyJhbGciOi..." autocomplete="off" />
    </div>
    <div class="field">
      <label>模型名</label>
      <input type="text" v-model="cfg.model" placeholder="MiniMax-M3" />
    </div>
    <div class="field row">
      <input id="cfg-vision" type="checkbox" v-model="cfg.visionEnabled" />
      <label for="cfg-vision">启用视觉审核(送截图给 LLM)</label>
    </div>
  </details>
</template>

<script setup lang="ts">
import type { LlmConfig } from '@/composables/useAitune';

defineProps<{ cfg: LlmConfig; llmConfigured: boolean; llmStatus: string }>();
</script>

<style scoped>
.llm-config {
  border-top: 1px solid rgba(0, 229, 255, 0.1);
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.25);
  font-size: 12px;
  margin: 0 -14px;
}
.llm-config summary {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
  font-family: var(--font-mono);
  font-size: 11px;
  list-style: none;
}
.llm-config summary::-webkit-details-marker {
  display: none;
}
.llm-config summary::before {
  content: '▸';
  color: var(--accent);
  transition: transform 0.2s;
  display: inline-block;
  width: 12px;
}
.llm-config[open] summary::before {
  transform: rotate(90deg);
}
.label {
  color: var(--accent);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.status {
  margin-left: auto;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid currentColor;
  font-family: var(--font-mono);
}
.status.ok {
  color: rgb(46, 213, 115);
}
.status.err {
  color: rgb(255, 100, 100);
}

.hint {
  font-size: 10.5px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  line-height: 1.6;
  margin: 8px 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}
.field {
  margin-top: 8px;
}
.field.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field.row label {
  margin: 0;
  cursor: pointer;
}
.field input[type='text'],
.field input[type='password'] {
  width: 100%;
  margin-top: 4px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(0, 229, 255, 0.2);
  border-radius: 4px;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 11px;
  outline: none;
}
.field input[type='text']:focus,
.field input[type='password']:focus {
  border-color: rgb(0, 229, 255);
}
.field label {
  display: block;
  font-size: 10.5px;
  color: var(--text-muted);
  margin-bottom: 2px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.field input[type='checkbox'] {
  width: auto;
  margin: 0;
}
</style>
