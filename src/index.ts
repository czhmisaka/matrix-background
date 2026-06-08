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
export type { BitmapSource, FitMode } from './bitmap';

// ==================== Web Component ====================
// 用法: import { MatrixRainElement } from '@xietuier/matrix-rain';
// 然后 <matrix-rain theme="cyber-blue"></matrix-rain> 自动注册 + 启动
// 子路径入口: '@xietuier/matrix-rain/element' 也可拿到
export { MatrixRainElement } from './matrix-rain-element';
export { mountFpsOverlay, type FpsOverlayHandle } from './fps-overlay';

import type { MatrixRainInstance, EnvironmentInfo, ViewportBucket, BrowserName } from '../types';

/**
 * 视口宽度分档(<768 / 768-1024 / 1024-1440 / ≥1440)
 * SSR / window 不可用时默认 'desktop'
 */
function pickViewportBucket(width: number): ViewportBucket {
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  if (width < 1440) return 'desktop';
  return 'wide';
}

/**
 * UA 正则 → 浏览器型号(粗粒度;首匹配)
 * 顺序:Edge / Opera / Chrome / Firefox / Safari / IE
 */
function detectBrowser(ua: string): BrowserName {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  if (/MSIE|Trident\//.test(ua)) return 'IE';
  return 'Unknown';
}

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

    wrappers.forEach((w) => {
      const inst = (w as any).__matrixRainInstance as MatrixRainInstance | undefined;
      if (inst) {
        try {
          inst.destroy();
        } catch (e) {}
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
  },

  /**
   * 环境检测 · 一次性读取当前运行环境
   *
   * 信号源:
   * - `navigator.userAgent` → 浏览器型号 + 移动端判断
   * - `window.matchMedia('(prefers-color-scheme: dark)')` → 暗色模式
   * - `window.innerWidth` → 视口分档(mobile <768 / tablet 768-1024 / desktop 1024-1440 / wide ≥1440)
   * - `window.devicePixelRatio` → DPR
   *
   * SSR 安全:`typeof window === 'undefined'` 时返回 desktop + 亮色 + 'Unknown' + DPR=1 默认值。
   *
   * 用法:
   *   const env = MatrixRain.detect();
   *   matrixRain({ fontSize: env.recommendedFontSize, targetFPS: env.recommendedTargetFPS, ... });
   */
  detect(): EnvironmentInfo {
    // SSR / Node 环境:返回合理的 desktop 默认
    if (typeof window === 'undefined') {
      return {
        isMobile: false,
        isDarkMode: false,
        recommendedFontSize: 14,
        recommendedTargetFPS: 0,
        recommendedBrightness: 1.0,
        browser: 'Unknown',
        viewport: 'desktop',
        viewportWidth: 0,
        devicePixelRatio: 1,
      };
    }

    const w = window as any;
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const viewportWidth = typeof w.innerWidth === 'number' ? w.innerWidth : 0;
    const dpr = typeof w.devicePixelRatio === 'number' ? w.devicePixelRatio : 1;
    const browser = detectBrowser(ua);
    const viewport = pickViewportBucket(viewportWidth);
    const isDarkMode =
      typeof w.matchMedia === 'function'
        ? w.matchMedia('(prefers-color-scheme: dark)').matches
        : true;
    const isMobile =
      viewport === 'mobile' ||
      /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
      (typeof w.matchMedia === 'function' && w.matchMedia('(pointer: coarse)').matches);

    return {
      isMobile,
      isDarkMode,
      recommendedFontSize: isMobile ? 16 : 14,
      recommendedTargetFPS: isMobile ? 30 : 0,
      recommendedBrightness: isDarkMode ? 1.1 : 1.0,
      browser,
      viewport,
      viewportWidth,
      devicePixelRatio: dpr,
    };
  },
};

// ==================== 默认导出 ====================
export default matrixRain;
