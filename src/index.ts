/**
 * @xietuier/matrix-rain · 主入口
 * czhmisaka · 数字矩阵背景 · NPM 包
 *
 * 用法:
 *   import { matrixRain, themes, MatrixRain } from '@xietuier/matrix-rain';
 *   import '@xietuier/matrix-rain/style.css';
 *
 *   const rain = matrixRain({ theme: 'silicon-valley' });
 *
 *   // 销毁单个实例:
 *   rain.destroy();
 *
 *   // 批量销毁(页面卸载 / 切路由时):
 *   MatrixRain.destroyAll();  // 销毁所有
 *   MatrixRain.destroyAll(document.getElementById('modal'));  // 销毁指定容器内所有
 *
 *   // 查活跃实例数(调试用):
 *   console.log(MatrixRain.activeCount);
 */

import { matrixRain as _matrixRain } from './engine';
import type { MatrixRainInstance, MatrixRainOptions } from '../types';
export { matrixRain } from './engine';
export { themes } from './themes';
export { VARIANT_DEFAULTS } from './variant-defaults';
export { textToBitmap, imageToBitmap, fileToImage } from './bitmap';
export { PRESETS } from './curves/presets';
export { WAVE_TYPES, COMBINE_MODES, channelsToCode, evalWave, evalChannels } from './curves/waves';
export { LUT_RESOLUTION, CONTROL_POINTS, buildLUT, sampleLUT, controlPointsToCode, DEFAULT_CONTROL_POINTS } from './curves/lut';
export { compileUserFunction, validateUserFunction } from './curves/sandbox';
export type { Preset, WaveType, CombineMode, WaveChannel, SandboxContext } from './curves/presets';
export type { BitmapSource } from './bitmap';
export type {
  MatrixRainOptions,
  MatrixRainInstance,
  Palette,
  RGBA,
  ThemeName,
  VariantName,
  ThemeFactory,
  ThemeParams,
  VariantParams
} from '../types';

/**
 * 全局命名空间 · 静态工具方法
 * - MatrixRain.destroyAll()      销毁所有活跃实例
 * - MatrixRain.destroyAll(el)    销毁指定容器内所有实例
 * - MatrixRain.activeCount       当前活跃实例数
 */
export const MatrixRain = {
  /**
   * 销毁所有活跃实例
   * @param container 可选 · 只销毁该容器内的实例(通过遍历 .matrix-rain-wrapper)
   * @returns 销毁的实例数
   */
  destroyAll(container?: HTMLElement): number {
    let count = 0;
    const wrappers = container
      ? container.querySelectorAll<HTMLElement>('.matrix-rain-wrapper')
      : document.querySelectorAll<HTMLElement>('.matrix-rain-wrapper');

    wrappers.forEach(w => {
      const inst = (w as any).__matrixRainInstance as MatrixRainInstance | undefined;
      if (inst) {
        try { inst.destroy(); } catch (e) {}
      } else {
        // 兜底:即使没有实例引用,直接 remove DOM 也能停掉 rAF
        w.remove();
      }
      count++;
    });
    return count;
  },

  /** 当前活跃实例数(估算 · 通过数 DOM wrapper) */
  get activeCount(): number {
    return document.querySelectorAll('.matrix-rain-wrapper').length;
  }
};

import { matrixRain } from './engine';
export default matrixRain;
