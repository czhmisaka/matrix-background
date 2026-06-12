/**
 * @xietuier/matrix-rain · Canvas 2D Renderer(默认 / 0 体积)
 *
 * **职责**: 把 `state.ctx.fillStyle / fillText / fillRect / font` 这些 canvas2D-specific
 * API 集中到本类, engine.ts 和 draw-helpers.ts 通过 `state.renderer.drawChar / drawTrail / setFontSize`
 * 间接调用, 不再直接访问 `state.ctx`。
 *
 * **性能特性**:
 * - fillText 是 Canvas 2D 软件渲染, 5-10 μs/字符
 * - 4K + fontSize 4 ≈ 518K cells → ~3-6s/帧 (不可用)
 * - 1080p + fontSize 14 ≈ 10K cells → ~50-100ms/帧 (60fps 可用)
 * - 推荐场景: < 100K cells (1K×1K viewport + fontSize ≥ 8)
 *
 * **API 兼容**: 行为 100% 等价于重构前, 现有 15 个 `test/*.mjs` 全部 pass。
 *
 * @since 0.4.0
 */

import type { MatrixRainRenderer, RendererImpl } from './types';
import type { MatrixRainState } from '../engine/state';
import {
  createHealthTracker,
  snapshotHealth,
  tickDroppedFrames,
  type RendererHealth,
} from './health';

/** 8 槽 rgba 字符串 buffer · 避免 per-cell `rgba(...)` 模板字符串 GC 压力 */
const RGBA_BUF_SIZE = 8;
const _rgbaBuf: string[] = new Array(RGBA_BUF_SIZE).fill('rgba(0,0,0,0)');
let _rgbaBufIdx = 0;

/**
 * 用轮换 buffer 生成 rgba 字符串(避免每次模板字符串分配)
 * - 8 槽轮换,V8 短字符串 inline,实测零 GC
 * - 详情见 docs/audit-perf-2026-06-09.md P0-1
 *
 * @param r g b 0-255 整数
 * @param a 0-1 浮点
 */
const toRgba = (r: number, g: number, b: number, a: number): string => {
  // 量化 alpha 到 0.01 精度 → ~100 唯一值,字符串复用机会更大
  const aQ = (Math.round(a * 100) / 100).toFixed(2);
  const s = `rgba(${r | 0},${g | 0},${b | 0},${aQ})`;
  _rgbaBuf[_rgbaBufIdx] = s;
  const idx = _rgbaBufIdx;
  _rgbaBufIdx = (_rgbaBufIdx + 1) & (RGBA_BUF_SIZE - 1);
  return _rgbaBuf[idx];
};

export class Canvas2DRenderer implements MatrixRainRenderer {
  readonly type: RendererImpl = 'canvas2d';

  /** Canvas 2D 渲染上下文(私有,外部不暴露) */
  private _ctx: CanvasRenderingContext2D | null = null;

  /** 当前 font size 缓存(只在 size 变化时重设 ctx.font) */
  private _currentFontPx = 0;

  /** 当前 charset 字符串(由 setCharset 注入) */
  private _charset = '';

  /** CSS 像素视口尺寸(0.5.0+: 由 resize() 写入,drawTrail 不再依赖 _ctx.canvas) */
  private _w = 0;
  private _h = 0;

  /** destroy() 幂等标记 */
  private _destroyed = false;

  /** pause/resume 状态 */
  private _paused = false;

  /** 0.6.0+ 渲染器健康跟踪(canvas2d trivial:无 GL 错误码) */
  private _health = createHealthTracker('canvas2d');

  async init(canvas: HTMLCanvasElement, _state: MatrixRainState): Promise<void> {
    if (this._destroyed) throw new Error('[Canvas2DRenderer] init() called after destroy()');
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('[Canvas2DRenderer] Failed to get 2D context');
    this._ctx = ctx;
    // textBaseline/textAlign 在 init 时设一次,rAF 循环不再改
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    this._charset = ''; // engine.ts 会在 init 后调 setCharset(state.charset)
    this._health.initialized = true;
  }

  resize(w: number, h: number, dpr: number): void {
    if (this._destroyed || !this._ctx) return;
    // backing store 已在 engine.ts 那边 `canvas.width = canvas.width` 强制重置
    // 这里只设 transform (DPR 缩放)
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 0.5.0+: 缓存 CSS 视口尺寸,drawTrail 用此(避免依赖 _ctx.canvas 兼容性)
    this._w = w;
    this._h = h;
  }

  render(_state: MatrixRainState, _dt: number): void {
    if (this._paused) return;
    // 0.6.0+: tick 帧计数 + droppedFrames(其它 renderer 在 render 末 tick,这里集中)
    this._health.frameCount++;
    tickDroppedFrames(this._health, _state.fps);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._ctx = null;
    this._currentFontPx = 0;
    this._charset = '';
  }

  pause(): void {
    this._paused = true;
  }

  resume(): void {
    this._paused = false;
  }

  // ============ Drawing surface (per-cell / per-frame) ============

  drawTrail(r: number, g: number, b: number, a: number): void {
    if (!this._ctx || this._paused) return;
    this._ctx.fillStyle = toRgba(r, g, b, a);
    this._ctx.fillRect(0, 0, this._w, this._h);
  }

  setFontSize(px: number): void {
    if (!this._ctx) return;
    if (this._currentFontPx === px) return; // cache: 只在变化时设
    this._ctx.font = `${px}px "JetBrains Mono", ui-monospace, monospace`;
    this._currentFontPx = px;
  }

  setCharset(s: string): void {
    this._charset = s;
  }

  drawChar(ch: number, cx: number, cy: number, r: number, g: number, b: number, a: number): void {
    if (!this._ctx || this._paused) return;
    const chStr = this._charset[ch];
    if (!chStr) return;
    this._ctx.fillStyle = toRgba(r, g, b, a);
    this._ctx.fillText(chStr, cx, cy);
  }

  // 0.6.0+: 渲染器健康快照
  getHealth(): RendererHealth {
    return snapshotHealth(this._health);
  }
}
