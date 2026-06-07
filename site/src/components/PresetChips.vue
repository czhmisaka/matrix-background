<template>
  <div class="preset-chips">
    <button
      v-for="p in (presets ?? defaultPresets)"
      :key="p.id"
      class="preset-chip"
      :title="p.prompt"
      @click="$emit('pick', p)"
    >{{ p.label }}</button>
  </div>
</template>

<script setup lang="ts">
import { PRESETS, type PresetConfig } from '@/composables/useAitune';

withDefaults(defineProps<{ presets?: PresetConfig[] }>(), { presets: undefined });
defineEmits<{ (e: 'pick', preset: PresetConfig): void }>();

// 内部默认 = 全局 PRESETS(无需 prop 传入)
const defaultPresets = PRESETS;
</script>

<style scoped>
.preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 12px;
}
.preset-chip {
  padding: 5px 10px;
  background: rgba(0, 229, 255, 0.08);
  border: 1px solid rgba(0, 229, 255, 0.25);
  border-radius: 999px;
  color: rgb(0, 229, 255);
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  cursor: pointer;
  transition: all 0.15s;
}
.preset-chip:hover {
  background: rgba(0, 229, 255, 0.18);
  border-color: rgb(0, 229, 255);
}
.preset-chip:active { transform: scale(0.96); }
</style>
