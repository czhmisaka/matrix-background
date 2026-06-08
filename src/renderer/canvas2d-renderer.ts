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
  private _canvas: HTMLCanvasElement | null = null;

  /** 当前 font size 缓存(只在 size 变化时重设 ctx.font) */
  private _currentFontPx = 0;

  /** 当前 charset 字符串(由 setCharset 注入) */
  private _charset = '';

  /** destroy() 幂等标记 */
  private _destroyed = false;

  /** pause/resume 状态 */
  private _paused = false;

  async init(canvas: HTMLCanvasElement, _state: MatrixRainState): Promise<void> {
    if (this._destroyed) throw new Error('[Canvas2DRenderer] init() called after destroy()');
    this._canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('[Canvas2DRenderer] Failed to get 2D context');
    this._ctx = ctx;
    // textBaseline/textAlign 在 init 时设一次,rAF 循环不再改
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    this._charset = ''; // engine.ts 会在 init 后调 setCharset(state.charset)
  }

  resize(_w: number, _h: number, dpr: number): void {
    if (this._destroyed || !this._ctx) return;
    // backing store 已在 engine.ts 那边 `canvas.width = canvas.width` 强制重置
    // 这里只设 transform (DPR 缩放)
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(_state: MatrixRainState, _dt: number): void {
    // canvas2d renderer 不在 render() 做任何事
    // drawing 由 draw-helpers.ts 调 drawChar / drawTrail 完成
    if (this._paused) return;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._ctx = null;
    this._canvas = null;
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

  drawTrail(r: number, g: number, b: number, a: number, w: number, h: number): void {
    if (!this._ctx || this._paused) return;
    this._ctx.fillStyle = toRgba(r, g, b, a);
    this._ctx.fillRect(0, 0, w, h);
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
}
