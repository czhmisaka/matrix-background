/**
 * @xietuier/matrix-rain · B 层:6 基波 + 算符组合
 *
 * 用户配置: 3 个 channel,每个 channel 是一个基波 + amplitude + phase + frequency
 * 然后用 combineMode (sum / max / mul) 合并
 *
 * 例: "sin*0.5 + square*0.3" 等价于
 *   [{wave:'sin', amp:0.5, freq:1, phase:0}, {wave:'square', amp:0.3, freq:1, phase:0}]
 *   combine: sum
 */

export type WaveType = 'sin' | 'cos' | 'square' | 'saw' | 'triangle' | 'noise' | 'constant';
export type CombineMode = 'sum' | 'mul' | 'max' | 'min';

export interface WaveChannel {
  wave: WaveType;
  /** 振幅 0-1 */
  amp: number;
  /** 频率 0-10(乘以 t) */
  freq: number;
  /** 相位偏移 -1 到 1 */
  phase: number;
  /** 占空比(square 用) 0-1 */
  duty?: number;
}

export const WAVE_TYPES: { id: WaveType; name: string; emoji: string }[] = [
  { id: 'sin', name: 'sin', emoji: '〰️' },
  { id: 'cos', name: 'cos', emoji: '🌊' },
  { id: 'square', name: '方波', emoji: '⬜' },
  { id: 'saw', name: '锯齿', emoji: '📐' },
  { id: 'triangle', name: '三角', emoji: '🔺' },
  { id: 'noise', name: '噪声', emoji: '⚡' },
  { id: 'constant', name: '常数', emoji: '⏸️' }
];

export const COMBINE_MODES: { id: CombineMode; name: string; desc: string }[] = [
  { id: 'sum', name: '求和', desc: 'channels 之和' },
  { id: 'mul', name: '相乘', desc: 'channels 之积' },
  { id: 'max', name: '最大', desc: '取 max' },
  { id: 'min', name: '最小', desc: '取 min' }
];

/** 单个基波算值 */
export const evalWave = (ch: WaveChannel, t: number): number => {
  const x = t * ch.freq + ch.phase;
  let v: number;
  switch (ch.wave) {
    case 'sin': v = Math.sin(x * Math.PI * 2); break;
    case 'cos': v = Math.cos(x * Math.PI * 2); break;
    case 'square': v = Math.sin(x * Math.PI * 2) >= 0 ? 1 : -1; break;
    case 'saw': v = 2 * (x - Math.floor(x + 0.5)); break;
    case 'triangle': v = Math.abs(4 * (x - Math.floor(x + 0.5))) - 1; break;
    case 'noise': {
      const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
      v = (s - Math.floor(s)) * 2 - 1;
      break;
    }
    case 'constant': v = 1; break;
  }
  return v * ch.amp;
};

/** 组合 channels */
export const evalChannels = (channels: WaveChannel[], combine: CombineMode, t: number): number => {
  if (!channels.length) return 0;
  if (combine === 'sum') {
    return channels.reduce((a, c) => a + evalWave(c, t), 0);
  }
  if (combine === 'mul') {
    return channels.reduce((a, c) => a * (1 + evalWave(c, t)), 0);
  }
  if (combine === 'max') {
    return Math.max(...channels.map(c => evalWave(c, t)));
  }
  // min
  return Math.min(...channels.map(c => evalWave(c, t)));
};

/** channels 状态生成 JS 代码(给 A 层用,可视化反向) */
export const channelsToCode = (channels: WaveChannel[], combine: CombineMode): string => {
  const parts = channels.map(c => {
    const expr = (() => {
      switch (c.wave) {
        case 'sin': return `sin(t * ${c.freq} + ${c.phase})`;
        case 'cos': return `cos(t * ${c.freq} + ${c.phase})`;
        case 'square': return `sin(t * ${c.freq} + ${c.phase}) >= 0 ? 1 : -1`;
        case 'saw': return `2 * ((t * ${c.freq} + ${c.phase}) - Math.floor(t * ${c.freq} + ${c.phase} + 0.5))`;
        case 'triangle': return `Math.abs(4 * ((t * ${c.freq} + ${c.phase}) - Math.floor(t * ${c.freq} + ${c.phase} + 0.5))) - 1`;
        case 'noise': {
          const s = `Math.sin((t * ${c.freq} + ${c.phase}) * 12.9898 + 78.233) * 43758.5453`;
          return `(${s} - Math.floor(${s})) * 2 - 1`;
        }
        case 'constant': return '1';
      }
    })();
    return `(${c.amp} * (${expr}))`;
  });
  const op = combine === 'sum' ? ' + ' : combine === 'mul' ? ' * ' : combine === 'max' ? ' > ' : ' < ';
  return `return clamp(${parts.join(op)}, 0, 1);`;
};
