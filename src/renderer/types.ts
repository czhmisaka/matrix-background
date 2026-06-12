/**
 * @xietuier/matrix-rain · Renderer 接口契约
 *
 * **目的**: 把"如何把一帧画到 canvas"从引擎 orchestrator 抽出来,
 * 让同一个 state 可以分别用 Canvas 2D / WebGL2 / WebGPU 渲染。
 *
 * **架构**(0.4.0+):
 * ```
 *   MatrixRainState (renderer-agnostic, 共享)
 *      ↑ 读
 *      │
 *   MatrixRainRenderer (per-renderer 接口)
 *      │   ↑              ↑               ↑
 *      │   │              │               │
 *   Canvas2DRenderer  WebGL2Renderer  WebGPURenderer
 *   (默认 / 0 体积)    (4K+fs4)        (8K+fs2)
 * ```
 *
 * **边界规则** (写下来避免实现期反复改 state 接口):
 * 1. **Renderer 只读** `state.b / charset / paletteLUT / effectiveTp / cfg / canvas`
 * 2. **Renderer 不得写 state 任何字段** (避免 renderer 间状态污染)
 * 3. **Renderer 私有状态** (programs / buffers / atlas) 放 renderer 实例内, 不进 state
 * 4. **destroy() 必须幂等** (`if (this._destroyed) return`)
 * 5. **resize() 必须先** `state.canvas.width = state.canvas.width` 强制重置 backing store,
 *    然后再 `getContext('webgl' | 'webgpu')` —— canvas 一旦绑死 2d context 就不能再绑 webgl
 * 6. **init() 是 Promise** (WebGPU adapter 申请是异步);canvas2d / webgl 内部用 async 包装保持一致
 *
 * @since 0.4.0
 */

import type { MatrixRainState } from '../engine/state';
import type { RendererHealth } from './health';

/** 用户可指定的渲染器类型 */
export type RendererType = 'canvas2d' | 'webgl' | 'webgpu' | 'auto';

/** Renderer 实例的实际类型(不含 'auto',因为 auto 在 init 之前已解析) */
export type RendererImpl = 'canvas2d' | 'webgl' | 'webgpu';

/**
 * 渲染器接口契约 · 所有 renderer(Canvas 2D / WebGL2 / WebGPU)必须实现
 *
 * @since 0.4.0
 */
export interface MatrixRainRenderer {
  /** 实际类型(不含 'auto') */
  readonly type: RendererImpl;

  /**
   * 初始化 renderer(创建 context / 编译 shader / 上传 atlas)
   * - canvas2d: 同步,内部 await Promise.resolve() 保持签名一致
   * - webgl: 创建 WebGL2 context, compile shader, upload atlas (PNG → texture)
   * - webgpu: `await navigator.gpu.requestAdapter()` + `requestDevice()`
   *
   * @param canvas 共享 DOM canvas(所有 renderer 复用同一元素)
   * @param state  renderer-agnostic 状态
   * @returns Promise resolved = 可以开始 render
   */
  init(canvas: HTMLCanvasElement, state: MatrixRainState): Promise<void>;

  /**
   * 视口/DPR 变化(由 ResizeObserver 触发,经由 engine.ts 转发)
   * - canvas2d: `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`
   * - webgl: `gl.viewport(0, 0, w*dpr, h*dpr)` + 重建 framebuffer
   * - webgpu: 重新配置 swap chain
   *
   * **重要**: 调用本方法前 engine.ts 必须先 `canvas.width = canvas.width` 强制重置 backing store
   */
  resize(w: number, h: number, dpr: number): void;

  /**
   * 渲染一帧
   * - canvas2d: 实际不做任何事(drawing 由 draw-helpers 调 drawChar 完成)
   * - webgl:   读 state.b 打包 instance buffer, 1 次 `drawArraysInstanced`
   * - webgpu:  读 state.b, 跑 compute shader 更新 warmth, 然后 1 次 `renderPass.draw`
   *
   * @param state renderer-agnostic 状态(只读)
   * @param dt    上一帧到现在的 delta time(秒)
   */
  render(state: MatrixRainState, dt: number): void;

  /**
   * 每帧绘制开始时调用(rAF 内,drawTrail 之后、drawChar 循环之前)
   * - canvas2d: 不实现(no-op)
   * - webgl/webgpu: 重置内部 `_drawCallIdx` 计数器, 给本帧的 drawChar 序号从 0 开始
   *
   * **必须 optional**,canvas2d 不实现此方法
   * @since 0.4.1
   */
  beginFrame?(): void;

  /**
   * 销毁 renderer(释放 GL context / 删 program / 删 buffer)
   * **必须幂等** —— `destroy()` 第二次调用 no-op
   */
  destroy(): void;

  /** 暂停渲染(raf 循环仍在跑但 skip render) */
  pause(): void;

  /** 恢复渲染 */
  resume(): void;

  // ============ Drawing surface (per-cell / per-frame, 由 draw-helpers 调) ============

  /**
   * 残影拖尾: 全屏 alpha 矩形(把上一帧的 canvas 整体按 alpha 衰减)
   * - 代替 `ctx.fillStyle = rgba; ctx.fillRect(0, 0, w, h)`
   * - canvas2d: 直接 fillRect(0, 0, canvas.width, canvas.height)
   * - webgl:   全屏 quad + blend, blend 模式 src*alpha + dst*(1-alpha)
   *
   * @param r g b a  颜色分量 0-255 / 0-1
   */
  drawTrail(r: number, g: number, b: number, a: number): void;

  /**
   * 设置当前 charset(下次 drawChar 用)
   * - canvas2d: 缓存字符串数组, drawChar 时 `this._charset[ch]`
   * - webgl:   重建 string→index map (用户动态改 charset 时)
   * - webgpu:  同 webgl
   *
   * engine.ts 在 state.charset 变化时调一次
   */
  setCharset(s: string): void;

  /**
   * 设置当前 font size(下次 drawChar 用)
   * - canvas2d: `ctx.font = '${px}px "JetBrains Mono", monospace'`
   * - webgl:   no-op (atlas 预烘焙固定 size, vertex shader 缩放 quad)
   * - webgpu:  no-op (同上)
   *
   * 注: 当前 font size 缓存在 renderer 内部, 调用方只传 px 即可
   */
  setFontSize(px: number): void;

  /**
   * 画一个字符(以 (cx, cy) 为中心锚点)
   * - canvas2d: `ctx.fillText(this._charset[ch], cx, cy)`
   * - webgl:   写入 instance buffer 的 4 字段 (ch, x, y, warmth), 实际渲染在 render() 一次性 drawArraysInstanced
   * - webgpu:  同 webgl
   *
   * @param ch   字符索引 (0..charset.length-1)
   * @param cx   字符中心 X 坐标 (CSS 像素)
   * @param cy   字符中心 Y 坐标 (CSS 像素)
   * @param r g b 颜色分量 0-255
   * @param a    alpha 0-1
   */
  drawChar(ch: number, cx: number, cy: number, r: number, g: number, b: number, a: number): void;

  /**
   * 当 grid 维度变化时通知 renderer(重 alloc instance buffer 等 GPU 资源)
   * 调用时机: engine.ts 的 `buildGrid()` 末尾(setDensity / resize / 初始化后)
   * - canvas2d: 不实现(无 instance buffer)
   * - webgl/webgpu: 删旧 buffer, 按新 cols*rows 重 alloc
   *
   * **必须 optional**,canvas2d 不实现此方法
   * @param cols grid 列数 (state.r)
   * @param rows grid 行数 (state.i)
   * @since 0.4.1
   */
  resizeGrid?(cols: number, rows: number): void;

  /**
   * 读取 renderer 健康快照(0.6.0+:用于真实调试)
   * - 包含 GL 错误码 / WebGPU error scope / 帧数 / instance 计数 / 耗时
   * - 默认常驻,无性能分支(数据填/不填零成本)
   * - 返回 `Object.freeze` 副本,调用方无法篡改
   *
   * @since 0.6.0
   */
  getHealth(): RendererHealth;
}

/**
 * Renderer 工厂签名
 * - engine.ts 调 `createRenderer('canvas2d', state)` 拿实例
 * - WebGL/WebGPU 走动态 import,工厂函数本身也是 async
 *
 * @since 0.4.0
 */
export type RendererFactory = (
  type: RendererImpl,
  state: MatrixRainState
) => Promise<MatrixRainRenderer>;

/**
 * 用户在 `matrixRain({ renderer: ... })` 传的字符串 → 解析成实际类型
 * - 'canvas2d' / 'webgl' / 'webgpu' → 直接用
 * - 'auto' → 由 auto-pick.ts 根据 viewport/fontSize/DPR 估算 cell 数, 选最优
 *
 * @since 0.4.0
 */
export const resolveRenderer = (s: RendererType | undefined): RendererType => s ?? 'auto';
