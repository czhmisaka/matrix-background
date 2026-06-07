/**
 * @xietuier/matrix-rain · 主题预设
 * 5 套精选 HSL 调色板,公式生成 0-1 连续亮度
 */

import type { HSLPalette, ThemeFactory } from '../types';

/** 硅谷风(默认) · 冷青 + 暖琥珀 */
const siliconValley: ThemeFactory = () => ({
  brightness: 1.0,
  chroma: 1.0,
  hueShift: 0,
  saturationShift: 0,
  lightnessShift: 0,
  invertHue: 0,
  contrast: 1,
  cold: { h: 195, s: 0.55, lMin: 0.05, lMax: 0.95, aMax: 0.95 } as HSLPalette,  // 青蓝
  warm: { h: 35,  s: 0.65, lMin: 0.05, lMax: 0.95, aMax: 0.95 } as HSLPalette   // 琥珀
});

/** 黑客帝国 · 冷绿 + 暖黄 */
const matrixGreen: ThemeFactory = () => ({
  brightness: 1.1,
  chroma: 0.9,
  hueShift: 100,
  saturationShift: 0.05,
  lightnessShift: 0,
  invertHue: 0,
  contrast: 1.05,
  cold: { h: 130, s: 0.6,  lMin: 0.05, lMax: 0.95, aMax: 0.95 } as HSLPalette,  // 绿
  warm: { h: 80,  s: 0.7,  lMin: 0.1,  lMax: 0.98, aMax: 0.95 } as HSLPalette   // 黄绿
});

/** 熔岩 · 冷紫 + 暖红橙 */
const lavaRed: ThemeFactory = () => ({
  brightness: 1.05,
  chroma: 1.1,
  hueShift: -20,
  saturationShift: 0.1,
  lightnessShift: 0.05,
  invertHue: 0,
  contrast: 1.1,
  cold: { h: 290, s: 0.5,  lMin: 0.05, lMax: 0.9,  aMax: 0.95 } as HSLPalette,  // 紫
  warm: { h: 15,  s: 0.85, lMin: 0.1,  lMax: 0.98, aMax: 0.95 } as HSLPalette   // 橙红
});

/** 赛博 · 冷蓝 + 暖品红 */
const cyberBlue: ThemeFactory = () => ({
  brightness: 0.95,
  chroma: 1.2,
  hueShift: -160,
  saturationShift: 0,
  lightnessShift: -0.05,
  invertHue: 0,
  contrast: 1.15,
  cold: { h: 220, s: 0.7,  lMin: 0.05, lMax: 0.95, aMax: 0.95 } as HSLPalette,  // 蓝
  warm: { h: 320, s: 0.7,  lMin: 0.1,  lMax: 0.95, aMax: 0.95 } as HSLPalette   // 品红
});

/** 灰阶 · 冷灰 + 暖灰(无色相) */
const pureMono: ThemeFactory = () => ({
  brightness: 0.85,
  chroma: 0.0,
  hueShift: 0,
  saturationShift: 0,
  lightnessShift: -0.1,
  invertHue: 0,
  contrast: 0.9,
  cold: { h: 0,   s: 0,    lMin: 0.05, lMax: 0.9,  aMax: 0.95 } as HSLPalette,  // 灰
  warm: { h: 30,  s: 0,    lMin: 0.1,  lMax: 0.95, aMax: 0.95 } as HSLPalette   // 暖灰
});

export const themes: Record<string, ThemeFactory> = {
  'silicon-valley': siliconValley,
  'matrix-green': matrixGreen,
  'lava-red': lavaRed,
  'cyber-blue': cyberBlue,
  'pure-mono': pureMono
};
