<template>
  <div class="mode-selector">
    <div class="mode-label">AI 调参模式</div>
    <div class="mode-buttons">
      <button
        v-for="m in modes"
        :key="m.value"
        :class="['mode-btn', { active: modelValue === m.value }]"
        :title="m.hint"
        @click="$emit('update:modelValue', m.value)"
      >
        <span class="mode-name">{{ m.label }}</span>
        <span class="mode-hint">{{ m.hint }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LlmMode } from '@/composables/useAitune';

defineProps<{ modelValue: LlmMode }>();
defineEmits<{ (e: 'update:modelValue', v: LlmMode): void }>();

const modes: { value: LlmMode; label: string; hint: string }[] = [
  { value: 'precise', label: '精准点修', hint: '"把亮度改成 0.8"' },
  { value: 'numerical', label: '数字微调', hint: '"再亮一点 / 再快一点"' },
  { value: 'complex', label: '复杂描述', hint: '"想要更赛博朋克"' }
];
</script>

<style scoped>
.mode-selector {
  margin-bottom: 12px;
}
.mode-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 6px;
}
.mode-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4px;
}
.mode-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
  min-width: 0;
}
.mode-btn:hover { border-color: var(--border-strong); color: var(--text); }
.mode-btn.active {
  background: rgba(0, 229, 255, 0.12);
  border-color: rgb(0, 229, 255);
  color: rgb(0, 229, 255);
}
.mode-name {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}
.mode-hint {
  font-size: 9px;
  color: var(--text-faint);
  line-height: 1.3;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.mode-btn.active .mode-hint { color: rgba(0, 229, 255, 0.7); }
</style>
