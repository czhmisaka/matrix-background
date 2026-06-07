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
 *
 * SSR 友好:
 *   import { themes, textToBitmap, PRESETS } from '@xietuier/matrix-rain/core';
 *   // 无 DOM 依赖,可在 Node / Edge / Worker 中安全 import
 */

// ==================== 非 DOM 部分(SSR 友好)====================
export * from './core';

// ==================== DOM 部分 ====================
export { matrixRain as matrixRainInternal } from './engine';
import { matrixRain } from './engine';
export { matrixRain };
export { textToBitmap, imageToBitmap, fileToImage } from './bitmap';
export type { BitmapSource } from './bitmap';

// ==================== Web Component ====================
// 用法: import { MatrixRainElement } from '@xietuier/matrix-rain';
// 然后 <matrix-rain theme="cyber-blue"></matrix-rain> 自动注册 + 启动
// 子路径入口: '@xietuier/matrix-rain/element' 也可拿到
export { MatrixRainElement } from './matrix-rain-element';
export { mountFpsOverlay, type FpsOverlayHandle } from './fps-overlay';

import type { MatrixRainInstance } from '../types';

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

// ==================== 默认导出 ====================
export default matrixRain;
