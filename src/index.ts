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
export type { BitmapSource, FitMode, TextToBitmapOptions } from './bitmap';

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
    // SSR / Node 环境:document 不存在,直接返回 0(无副作用)
    if (typeof document === 'undefined') return 0;
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
    // SSR / Node 环境:document 不存在,返回 0(无活跃实例)
    if (typeof document === 'undefined') return 0;
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
        recommendedFontSize: 6,
        recommendedTargetFPS: 0,
        recommendedBrightness: 1.0,
        browser: 'Unknown',
        viewport: 'desktop',
        viewportWidth: 0,
        devicePixelRatio: 1,
        hasWebGL2: false,
        hasWebGPU: false,
        recommendedRenderer: 'canvas2d',
      };
    }

    const w = window as any;
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const viewportWidth = typeof w.innerWidth === 'number' ? w.innerWidth : 0;
    const viewportHeight = typeof w.innerHeight === 'number' ? w.innerHeight : 0;
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

    // 0.4.0+ 浏览器能力探测
    const hasWebGL2 = (() => {
      try {
        const c = document.createElement('canvas');
        return !!c.getContext('webgl2');
      } catch {
        return false;
      }
    })();
    const hasWebGPU =
      typeof navigator !== 'undefined' && typeof (navigator as any).gpu !== 'undefined';

    const recommendedFontSize =
      viewportWidth < 1280
        ? 4
        : viewportWidth >= 3840
          ? 16
          : Math.round(6 + ((viewportWidth - 1280) * 10) / 2560);

    // 0.4.0+ 推荐 renderer(viewport × cell density)
    const recommendedRenderer: 'canvas2d' | 'webgl' | 'webgpu' = (() => {
      const cells =
        Math.ceil((viewportWidth * dpr) / recommendedFontSize) *
        Math.ceil((viewportHeight * dpr) / recommendedFontSize);
      if (cells >= 500_000 && hasWebGPU) return 'webgpu';
      if (cells >= 100_000 && hasWebGL2) return 'webgl';
      return 'canvas2d';
    })();

    return {
      isMobile,
      isDarkMode,
      recommendedFontSize,
      recommendedTargetFPS: isMobile ? 30 : 0,
      recommendedBrightness: isDarkMode ? 1.1 : 1.0,
      browser,
      viewport,
      viewportWidth,
      devicePixelRatio: dpr,
      hasWebGL2,
      hasWebGPU,
      recommendedRenderer,
    };
  },

  /**
   * 安装全局错误兜底(0.5.2+)
   *
   * 默认不开启(opt-in),避免与用户自带的 Sentry / Bugsnag 冲突。
   * 只在用户主动调用时加 2 个 event listener,无性能开销。
   *
   * 监听两类事件:
   * - `window.error` → 同步 throw / 资源加载失败等
   * - `window.unhandledrejection` → async Promise reject
   *
   * 用法:
   *   const remove = MatrixRain.installGlobalErrorHandler({
   *     onError: (e) => {
   *       // e.type: 'error' | 'unhandledrejection'
   *       // e.message: 错误信息
   *       // e.filename/line/col: 仅 'error' 类型有
   *       myLogger.report(e);
   *     }
   *   });
   *
   *   // 测试 / 卸载:
   *   remove();
   *
   * SSR 安全:`typeof window === 'undefined'` 时直接返回 noop。
   *
   * @param opts.onError 必填 · 错误回调
   * @returns 卸载函数(调用后移除两个 listener)
   */
  installGlobalErrorHandler(opts: {
    onError: (e: {
      type: 'error' | 'unhandledrejection';
      message: string;
      filename?: string;
      line?: number;
      col?: number;
    }) => void;
  }): () => void {
    if (typeof window === 'undefined') {
      return () => {};
    }
    if (typeof opts?.onError !== 'function') {
      throw new TypeError('MatrixRain.installGlobalErrorHandler: opts.onError must be a function');
    }

    const onErrorEvent = (e: Event) => {
      const err = e as ErrorEvent;
      try {
        opts.onError({
          type: 'error',
          message: err.message ?? '',
          filename: err.filename,
          line: err.lineno,
          col: err.colno,
        });
      } catch (_) {
        // 兜底:用户回调自身 throw 不能影响其他 listener
      }
    };

    const onRejection = (e: Event) => {
      const pe = e as PromiseRejectionEvent;
      const reason = pe.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : (() => {
                try {
                  return String(reason);
                } catch {
                  return 'Unknown rejection';
                }
              })();
      try {
        opts.onError({ type: 'unhandledrejection', message });
      } catch (_) {
        // 兜底同上
      }
    };

    window.addEventListener('error', onErrorEvent);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('error', onErrorEvent);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  },
};

// ==================== 默认导出 ====================
export default matrixRain;
