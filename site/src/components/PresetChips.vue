<template>
  <div class="preset-chips">
    <button
      v-for="p in displayed"
      :key="p.id"
      class="preset-chip"
      :title="p.prompt"
      @click="$emit('pick', p)"
    >
      {{ p.label }}
    </button>
    <!-- 1 帧占位:动态 import 完成前不闪烁 -->
    <span v-if="displayed.length === 0" class="preset-chip placeholder" aria-hidden="true">…</span>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import type { PresetConfig } from '@/composables/useAitune';

const props = withDefaults(defineProps<{ presets?: PresetConfig[] }>(), { presets: undefined });
defineEmits<{ (e: 'pick', preset: PresetConfig): void }>();

// 内部默认 = 全局 PRESETS(无需 prop 传入)
// 懒加载:不在模块顶层同步 import aitune-prompts,推迟到 onMounted
const localPresets = ref<PresetConfig[]>([]);
onMounted(() => {
  // 动态 import 走 Vite 自动拆 chunk,与 useAitune.send() 共享同一份缓存
  import('@/composables/aitune-prompts').then((m) => {
    localPresets.value = m.PRESETS;
  });
});

const displayed = computed<PresetConfig[]>(() => props.presets ?? localPresets.value);
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
.preset-chip:active {
  transform: scale(0.96);
}
.preset-chip.placeholder {
  cursor: default;
  opacity: 0.4;
  background: transparent;
  border-style: dashed;
}
.preset-chip.placeholder:hover {
  background: transparent;
  border-color: rgba(0, 229, 255, 0.25);
}
</style>
