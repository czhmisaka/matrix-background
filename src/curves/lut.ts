/**
 * @xietuier/matrix-rain · C 层:16 控制点贝塞尔曲线 → LUT
 *
 * 16 控制点 y 值(0-1)→ 64 步采样生成查找表
 * 控制点可以拖动。生成时返回 LUT 和对应用 JS 代码
 */

export const LUT_RESOLUTION = 64;
export const CONTROL_POINTS = 16;

export type ControlPoints = number[]; // 长度 16,值 0-1

export const DEFAULT_CONTROL_POINTS: ControlPoints = [
  0.1, 0.3, 0.5, 0.7, 0.9, 0.8, 0.6, 0.4,
  0.2, 0.4, 0.6, 0.8, 0.7, 0.5, 0.3, 0.5
];

/** 简单线性插值 LUT(非贝塞尔,免去矩阵运算) */
export const buildLUT = (cp: ControlPoints): Float32Array => {
  const lut = new Float32Array(LUT_RESOLUTION);
  for (let i = 0; i < LUT_RESOLUTION; i++) {
    const t = i / (LUT_RESOLUTION - 1);
    // 映射到 cp 索引
    const pos = t * (cp.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(cp.length - 1, lo + 1);
    const frac = pos - lo;
    lut[i] = cp[lo] * (1 - frac) + cp[hi] * frac;
  }
  return lut;
};

/** LUT 查表 */
export const sampleLUT = (lut: Float32Array, t: number): number => {
  const i = Math.max(0, Math.min(LUT_RESOLUTION - 1, Math.floor(t * (LUT_RESOLUTION - 1))));
  return lut[i];
};

/** 控制点 → JS 代码(用 lerp 多项式) */
export const controlPointsToCode = (cp: ControlPoints): string => {
  const arr = cp.map(v => v.toFixed(3)).join(', ');
  const lines: string[] = [
    `const __cp = [${arr}];`,
    'const __t = ((t * 8) % 16 + 16) % 16;',
    'const __i = Math.floor(__t);',
    'const __f = __t - __i;'
  ];
  lines.push('return clamp(__cp[__i] * (1 - __f) + __cp[Math.min(15, __i + 1)] * __f, 0, 1);');
  return lines.join('\n');
};
