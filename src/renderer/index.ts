/**
 * @xietuier/matrix-rain · Renderer 工厂 + auto-pick 占位
 *
 * **职责**: 根据 `options.renderer` 创建对应的 renderer 实例
 * - `'canvas2d'`: Canvas2DRenderer (默认 / 0 体积)
 * - `'webgl'`:    动态 import WebGLRenderer (Phase 2B)
 * - `'webgpu'`:   动态 import WebGPURenderer (Phase 4)
 * - `'auto'`:     Phase 3 之前 fallback 到 canvas2d, 之后按 viewport × cell density 估算
 *
 * **dynamic import 策略**:
 * - canvas2d 走静态 import (eager): 默认路径, 零体积增量
 * - webgl 走 `import('./webgl-renderer')` (lazy): 仅当用户显式选 webgl 才加载
 * - webgpu 同上
 *
 * @since 0.4.0
 */

import { Canvas2DRenderer } from './canvas2d-renderer';
import {
  resolveRenderer,
  type MatrixRainRenderer,
  type RendererImpl,
  type RendererType,
} from './types';

export type { MatrixRainRenderer, RendererImpl, RendererType };
export { resolveRenderer };

/**
 * 创建 renderer 实例(异步, dynamic import)
 * - canvas2d: 静态 import (eager, 默认路径)
 * - webgl:    动态 import (lazy, 用户显式选 webgl 才加载)
 * - webgpu:   动态 import (lazy, Phase 4 引入)
 *
 * 注: 此函数返回 renderer 实例, 调用方需自行 await `renderer.init()`
 *
 * @since 0.4.0
 */
export const createRenderer = async (type: RendererImpl): Promise<MatrixRainRenderer> => {
  switch (type) {
    case 'canvas2d':
      return new Canvas2DRenderer();
    case 'webgl': {
      // 动态 import: webgl-renderer 只在用户选 webgl 时加载
      // 注: 静态 import 会被 tsup tree-shake 掉,体积零增量(默认 canvas2d 路径)
      const mod = await import('./webgl-renderer');
      return new mod.WebGLRenderer();
    }
    case 'webgpu':
      // Phase 4 动态 import
      throw new Error('[matrix-rain] WebGPU renderer not yet implemented (Phase 4)');
    default:
      throw new Error(`[matrix-rain] Unknown renderer type: ${type as string}`);
  }
};

/**
 * 设置 atlas URL(供 WebGL/WebGPU renderer 加载纹理)
 * - 浏览器: 由 engine.ts 在 import 时调一次
 * - IIFE / script tag: 在 <script> 加载完调一次
 *
 * 注: 这里直接 import webgl-renderer(非 dynamic),保证 setAtlasUrls 是 sync
 * - 同步保证: setAtlasUrls() 调完后 __atlasJsonUrl/__atlasPngUrl 立即可用
 *
 * @since 0.4.0
 */
export { setAtlasUrls } from './webgl-renderer';

/**
 * Auto-pick: 根据用户配置 / 环境选择最合适的 renderer
 * Phase 1 实现: 'auto' → 'canvas2d'
 * Phase 3 扩展: 估算 cell 数 × viewport, 选 canvas2d / webgl / webgpu
 *
 * @since 0.4.0
 */
export const autoPickRenderer = (options: { renderer?: RendererType }): RendererImpl => {
  const t = resolveRenderer(options.renderer);
  if (t === 'auto') {
    // Phase 1: 默认 canvas2d
    // Phase 3: 基于 viewport × cell density 估算
    return 'canvas2d';
  }
  return t as RendererImpl;
};
