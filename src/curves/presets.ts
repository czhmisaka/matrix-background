/**
 * @xietuier/matrix-rain · D 层:8 个内置 preset 曲线
 *
 * 1 个 preset 是一段代码 + 描述。点击 → 自动加载到 A 层文本框。
 */

export interface Preset {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  /** 用户可读的 JS 表达式,会丢进 A 层文本框 */
  code: string;
}

export type { WaveType, CombineMode, WaveChannel } from './waves';
export type { SandboxContext } from './sandbox';

export const PRESETS: Preset[] = [
  {
    id: 'linear',
    name: '线性',
    emoji: '📏',
    desc: '恒定 0.5,平均亮度',
    code: 'return 0.5;'
  },
  {
    id: 'easeIn',
    name: '缓入',
    emoji: '🐌',
    desc: '开始慢,后段陡增',
    code: 'return ease.inQuad(t % 1);'
  },
  {
    id: 'easeOut',
    name: '缓出',
    emoji: '🏃',
    desc: '开始陡,后段平',
    code: 'return ease.outQuad(t % 1);'
  },
  {
    id: 'pulse',
    name: '脉冲',
    emoji: '💓',
    desc: 'sin 心跳',
    code: 'return 0.5 + 0.5 * sin(t * 3);'
  },
  {
    id: 'breathe',
    name: '呼吸',
    emoji: '🫁',
    desc: 'inOutSine 长周期',
    code: 'return ease.inOutSine((t * 0.3) % 1);'
  },
  {
    id: 'sparkle',
    name: '闪烁',
    emoji: '✨',
    desc: '高频随机 + 低频衰减',
    code: 'return noise(t * 5) * 0.8 + 0.2 * sin(t * 0.5);'
  },
  {
    id: 'heartbeat',
    name: '心电图',
    emoji: '📈',
    desc: '两连击 + 长静默',
    code: 'const p = (t * 0.7) % 1; return p < 0.1 ? 1 : p < 0.2 ? 0.3 : 0;'
  },
  {
    id: 'chaos',
    name: '混沌',
    emoji: '🌀',
    desc: 'logistic map 混沌序列',
    code: 'const x = (noise(t * 0.3) + noise(t * 1.7) + noise(t * 5.3)) / 3; return clamp(x * 1.5, 0, 1);'
  }
];
