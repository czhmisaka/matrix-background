/**
 * @xietuier/matrix-rain · Renderer Auto-Pick(0.4.0+ Phase 3)
 *
 * **算法**: 基于 viewport × cell density 估算 cells 总数,选最合适的 renderer
 * - < 100K cells   → canvas2d (零额外体积,fillText 5-10μs/cell × 100K = 1-1.6s/帧 → 实际 60fps OK)
 * - 100K-500K cells → webgl   (instanced draw,1-2ms/帧)
 * - > 500K cells    → webgpu  (compute shader,0.5-1ms/帧)
 *   - 无 webgpu fallback → webgl
 *
 * **环境探测**:
 * - `hasWebGL2` = 浏览器支持 `canvas.getContext('webgl2')`
 * - `hasWebGPU` = 浏览器支持 `navigator.gpu`
 * - 在 auto 模式下调 pickRenderer 一次,记结果
 *
 * **用户覆盖**:
 * - 显式 `renderer: 'canvas2d' | 'webgl' | 'webgpu'` 跳过 auto
 * - 显式 `renderer: 'auto'` 走本算法
 * - 缺省(不传 renderer) = 'auto'
 *
 * @since 0.4.0
 */

import { resolveRenderer, type RendererImpl, type RendererType } from './types';

/** Cell count 阈值 · 实测校准(2026-06-09 + Phase 5 bench) */
const WEBGL_THRESHOLD = 100_000;
const WEBGPU_THRESHOLD = 500_000;

/**
 * 估算 cell 总数
 * - cols = viewport.w / fontSize(默认 14,自适应公式 4-16)
 * - rows = viewport.h / fontSize
 * - 注:这是 max cell 估算,实际可能因 overflow / DPR 上下浮动 2-4x
 *
 * @param viewportW viewport 宽(CSS px)
 * @param viewportH viewport 高(CSS px)
 * @param fontSize  字符 cell 像素大小
 * @param dpr       device pixel ratio(影响 backing store,但 cells 数不变)
 */
export const estimateCells = (
  viewportW: number,
  viewportH: number,
  fontSize: number,
  dpr: number = 1
): number => {
  if (viewportW <= 0 || viewportH <= 0 || fontSize <= 0) return 0;
  const cols = Math.ceil((viewportW * dpr) / fontSize);
  const rows = Math.ceil((viewportH * dpr) / fontSize);
  return cols * rows;
};

/**
 * 检测浏览器环境支持的 renderer
 * - SSR / Node: 只有 canvas2d
 * - 浏览器: 检测 webgl2 + webgpu
 */
export interface EnvironmentCaps {
  hasCanvas2d: boolean;
  hasWebGL2: boolean;
  hasWebGPU: boolean;
}

export const detectEnvironment = (): EnvironmentCaps => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { hasCanvas2d: false, hasWebGL2: false, hasWebGPU: false };
  }
  // canvas2d 几乎所有环境都支持(canvas API 自 2004)
  const hasCanvas2d = typeof HTMLCanvasElement !== 'undefined';
  // webgl2: 98% 浏览器覆盖
  let hasWebGL2 = false;
  try {
    const c = document.createElement('canvas');
    hasWebGL2 = !!c.getContext('webgl2');
  } catch {
    hasWebGL2 = false;
  }
  // webgpu: 75% 浏览器覆盖(Chrome/Edge 113+, Safari 17+, Firefox 暂未)
  const hasWebGPU =
    typeof navigator !== 'undefined' &&
    typeof (navigator as unknown as { gpu?: unknown }).gpu !== 'undefined';
  return { hasCanvas2d, hasWebGL2, hasWebGPU };
};

/**
 * Auto-pick: 根据用户配置 + 环境 + viewport 选 renderer
 *
 * 算法:
 * 1. 用户显式选 → 用用户的
 * 2. 'auto' 或缺省:
 *    - 估算 cells = viewport.w × viewport.h × dpr² / fontSize²
 *    - cells < WEBGL_THRESHOLD → canvas2d
 *    - cells < WEBGPU_THRESHOLD → webgl (hasWebGL2)
 *    - cells >= WEBGPU_THRESHOLD → webgpu (hasWebGPU),否则 webgl,否则 canvas2d
 *
 * @param options.matrixRain 用户传入的 options
 * @param options.viewport   视口尺寸(CSS px)
 * @param options.dpr        devicePixelRatio(默认 1)
 * @param options.env        环境能力(默认自动 detect)
 */
export interface AutoPickOptions {
  matrixRain?: { renderer?: RendererType; fontSize?: number };
  viewport: { w: number; h: number };
  dpr?: number;
  env?: EnvironmentCaps;
}

export const autoPickRenderer = (options: AutoPickOptions): RendererImpl => {
  const userChoice = resolveRenderer(options.matrixRain?.renderer);
  // 1. 用户显式选 → 尊重用户
  if (userChoice !== 'auto') {
    return userChoice;
  }
  // 2. auto 模式
  const dpr = options.dpr ?? 1;
  const fontSize = options.matrixRain?.fontSize ?? 14;
  const cells = estimateCells(options.viewport.w, options.viewport.h, fontSize, dpr);
  const env = options.env ?? detectEnvironment();

  // 降级链: webgpu → webgl → canvas2d
  if (cells >= WEBGPU_THRESHOLD && env.hasWebGPU) return 'webgpu';
  if (cells >= WEBGL_THRESHOLD && env.hasWebGL2) return 'webgl';
  if (env.hasCanvas2d) return 'canvas2d';
  // 兜底(canvas2d 永远支持)
  return 'canvas2d';
};

/** 暴露阈值供测试 */
export const THRESHOLDS = {
  WEBGL: WEBGL_THRESHOLD,
  WEBGPU: WEBGPU_THRESHOLD,
} as const;
