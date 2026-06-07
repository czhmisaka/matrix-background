import { ref, watch } from 'vue';

export type ThemeName =
  | 'silicon-valley'
  | 'matrix-green'
  | 'lava-red'
  | 'cyber-blue'
  | 'pure-mono';

const THEMES: ThemeName[] = [
  'silicon-valley',
  'matrix-green',
  'lava-red',
  'cyber-blue',
  'pure-mono'
];

const STORAGE_KEY = 'mr-theme';

function readStored(): ThemeName {
  if (typeof localStorage === 'undefined') return 'silicon-valley';
  const v = localStorage.getItem(STORAGE_KEY);
  return THEMES.includes(v as ThemeName) ? (v as ThemeName) : 'silicon-valley';
}

const current = ref<ThemeName>(readStored());

if (typeof window !== 'undefined') {
  watch(current, (t) => {
    try { localStorage.setItem(STORAGE_KEY, t); } catch (e) { /* quota / private mode */ }
  });
}

/** 跨页同步主题 ref */
export function useTheme() {
  return {
    current,
    setTheme: (t: ThemeName) => { current.value = t; },
    themes: THEMES,
    /** 主题色标(用于 UI 按钮 hover 边框等) */
    accent: (t: ThemeName) => {
      switch (t) {
        case 'silicon-valley': return '#7af7d4';
        case 'matrix-green':   return '#4ade80';
        case 'lava-red':       return '#ff6b9a';
        case 'cyber-blue':     return '#38bdf8';
        case 'pure-mono':      return '#e5e7eb';
      }
    },
    /** 主题中文/英文名(简短) */
    label: (t: ThemeName) => {
      switch (t) {
        case 'silicon-valley': return 'Silicon Valley';
        case 'matrix-green':   return 'Matrix Green';
        case 'lava-red':       return 'Lava Red';
        case 'cyber-blue':     return 'Cyber Blue';
        case 'pure-mono':      return 'Pure Mono';
      }
    }
  };
}
