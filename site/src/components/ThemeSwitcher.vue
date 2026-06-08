<template>
  <div class="theme-switcher" role="group" aria-label="主题切换">
    <button
      v-for="t in themes"
      :key="t"
      type="button"
      :class="['ts-btn', { active: current === t }]"
      :style="{ '--swatch': accent(t) }"
      :aria-pressed="current === t"
      :aria-label="`切换到主题 ${label(t)}`"
      :title="label(t)"
      @click="setTheme(t)"
    >
      <span class="ts-dot" aria-hidden="true"></span>
      <span class="ts-name">{{ shortLabel(t) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useTheme, type ThemeName } from '@/composables/useTheme';

const { current, setTheme, themes, accent, label } = useTheme();

function shortLabel(t: ThemeName) {
  // 短标签:截前两段
  const s = label(t);
  return s.length > 10 ? s.replace(' ', '\u00A0') : s;
}
</script>

<style scoped>
.theme-switcher {
  display: inline-flex;
  gap: 6px;
  padding: 6px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 999px;
  flex-wrap: wrap;
}
.ts-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  min-height: 32px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 160ms ease;
  white-space: nowrap;
}
.ts-btn:hover {
  color: var(--text);
  background: var(--bg-soft);
}
.ts-btn.active {
  background: var(--bg-elev-2);
  color: var(--text);
  border-color: var(--swatch);
  box-shadow: 0 0 0 1px var(--swatch) inset;
}
.ts-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--swatch);
  box-shadow: 0 0 6px var(--swatch);
}
</style>
