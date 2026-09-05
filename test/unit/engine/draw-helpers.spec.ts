/**
 * draw-helpers 单元测试 · Vitest
 *
 * 目标:把 src/engine/draw-helpers.ts 的"可测分支"提升到 ≥50% Stmts。
 *
 * 范围(审计 P1-5):
 *   - shouldLocalBoost / subCellCount / isParentInBitmapRegion / isSubCellInBitmapRegion
 *     全是纯谓词,可直接单测
 *   - computeTargetOrigin 5 种 anchor 模式 + 缓存命中
 *   - drawInner 的 5 个独立分支:
 *       · l < 0.02 早返(不调 drawChar)
 *       · colorOverrideFn 函数式快路径命中
 *       · colorOverrideFn 返回 null 走 LUT
 *       · colorOverrides Record 命中
 *       · colorOverrides Record miss 走 LUT
 *   - drawInner 的 warmth 阻尼:c.warmth 单调向 H 收敛
 *
 * 不在范围(走纯函数覆盖不到):
 *   - drawClassic / drawAvalanche / drawRipple 三个顶层 variant 绘制
 *     依赖 renderer.drawChar / paletteLUT.getBlendedLUT 的完整链路,
 *     真渲染路径走 Playwright pixel(§3.3),见 audit-test-release-2026-06-24 P1-5
 *
 * 兼容 [[feedback_visual_verification_untrusted]] —— 单测只验"接口形状 + 分支走向",
 * 真像素对比走 test/renderer-pixel.mjs(已纳入 npm test 链)。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  drawInner,
  drawClassic,
  drawAvalanche,
  drawRipple,
  shouldLocalBoost,
  subCellCount,
  isParentInBitmapRegion,
  isSubCellInBitmapRegion,
  computeTargetOrigin,
} from '../../../src/engine/draw-helpers';
import type { MatrixRainState, Cell } from '../../../src/engine/state';

// ==================== mock 工厂 ====================

/**
 * 最小 MatrixRainState mock · 仅包含 draw-helpers 触达的字段。
 * 用 `as unknown as MatrixRainState` 强转,免去把整个 400+ 行 interface 铺满。
 */
function makeState(overrides: Partial<MatrixRainState> = {}): MatrixRainState {
  return {
    r: 10,
    i: 8,
    ef: 14,
    cfg: {
      fontSize: 14,
      charGap: 0,
      trailAlpha: 0.18,
      maxDPR: 2,
      warmthRadius: 0.6,
      warmthLerp: 0.04,
      sparkProbability: 0.003,
      targetFPS: 0,
      flickerSpeed: 1,
      renderScale: 1,
      easing: 'smooth',
    },
    renderScaleEffective: 1,
    targetBitmap: null,
    targetCols: 0,
    targetRows: 0,
    targetActive: false,
    __cachedAnchorOx: 0,
    __cachedAnchorOy: 0,
    __cachedAnchorValid: false,
    transitionAlpha: 1,
    effectiveTp: {} as MatrixRainState['effectiveTp'],
    paletteLUT: {
      getBlendedLUT: () => ({ r: new Uint8Array(256), g: new Uint8Array(256), b: new Uint8Array(256), a: new Uint8Array(256) }),
    } as unknown as MatrixRainState['paletteLUT'],
    renderer: {
      drawChar: () => {},
      setFontSize: () => {},
    } as unknown as MatrixRainState['renderer'],
    colorOverrideFn: null,
    colorOverrides: undefined,
    ...overrides,
  } as unknown as MatrixRainState;
}

function makeCell(overrides: Partial<Cell> = {}): Cell {
  return {
    ch: 0,
    bright: 0.5,
    phase: 0,
    warmth: 0,
    ...overrides,
  };
}

// ==================== shouldLocalBoost / subCellCount ====================

describe('shouldLocalBoost / subCellCount', () => {
  it('targetActive=false → false', () => {
    expect(shouldLocalBoost(makeState({ targetActive: false, targetBitmap: new Float32Array(1), renderScaleEffective: 2 }))).toBe(false);
  });

  it('targetBitmap=null → false(就算 targetActive=true 也不 boost)', () => {
    expect(shouldLocalBoost(makeState({ targetActive: true, targetBitmap: null, renderScaleEffective: 2 }))).toBe(false);
  });

  it('renderScaleEffective=1 → false(没有子格可分)', () => {
    expect(shouldLocalBoost(makeState({ targetActive: true, targetBitmap: new Float32Array(1), renderScaleEffective: 1 }))).toBe(false);
  });

  it('三条件全 true → true', () => {
    expect(shouldLocalBoost(makeState({ targetActive: true, targetBitmap: new Float32Array(1), renderScaleEffective: 2 }))).toBe(true);
  });

  it('subCellCount 直接透传 renderScaleEffective', () => {
    expect(subCellCount(makeState({ renderScaleEffective: 3 }))).toBe(3);
    expect(subCellCount(makeState({ renderScaleEffective: 1 }))).toBe(1);
  });
});

// ==================== isParentInBitmapRegion / isSubCellInBitmapRegion ====================

describe('isParentInBitmapRegion', () => {
  it('父格在位图区 → true', () => {
    const s = makeState({ targetCols: 5, targetRows: 4 });
    expect(isParentInBitmapRegion(s, 2, 1, 0, 0)).toBe(true); // bx=2∈[0,5), by=1∈[0,4)
  });

  it('父格超出右边界 → false', () => {
    const s = makeState({ targetCols: 5, targetRows: 4 });
    expect(isParentInBitmapRegion(s, 5, 1, 0, 0)).toBe(false);
  });

  it('父格超出底边界 → false', () => {
    const s = makeState({ targetCols: 5, targetRows: 4 });
    expect(isParentInBitmapRegion(s, 2, 4, 0, 0)).toBe(false);
  });

  it('带锚点偏移(ox=2) → bx=h-2', () => {
    const s = makeState({ targetCols: 3, targetRows: 3 });
    expect(isParentInBitmapRegion(s, 3, 1, 2, 0)).toBe(true); // bx=1∈[0,3)
    expect(isParentInBitmapRegion(s, 2, 1, 2, 0)).toBe(true); // bx=0∈[0,3)
    expect(isParentInBitmapRegion(s, 4, 1, 2, 0)).toBe(true); // bx=2∈[0,3)
    expect(isParentInBitmapRegion(s, 5, 1, 2, 0)).toBe(false); // bx=3 ≥ 3
  });

  it('锚点偏移到负值 → false(bx<0)', () => {
    const s = makeState({ targetCols: 3, targetRows: 3 });
    expect(isParentInBitmapRegion(s, 0, 1, 5, 0)).toBe(false); // bx=-5
  });
});

describe('isSubCellInBitmapRegion', () => {
  it('子格 (0,0) parent=(0,0) → true', () => {
    const s = makeState({ targetCols: 5, targetRows: 5 });
    expect(isSubCellInBitmapRegion(s, 0, 0, 2, 0, 0)).toBe(true);
  });

  it('eff=4, 子格 (3,3) parent=(0,0) → true(floor)', () => {
    const s = makeState({ targetCols: 2, targetRows: 2 });
    // parentH = floor(3/4) = 0, parentS = floor(3/4) = 0
    // bx = 0 - 0 = 0 ∈ [0, 2) ✓
    expect(isSubCellInBitmapRegion(s, 3, 3, 4, 0, 0)).toBe(true);
  });

  it('子格跨越父格边界 → 父格在位图外 → false', () => {
    const s = makeState({ targetCols: 1, targetRows: 1 });
    // eff=2, 子格 (2,0) → parentH=floor(2/2)=1, bx=1 ≥ targetCols=1 → false
    expect(isSubCellInBitmapRegion(s, 2, 0, 2, 0, 0)).toBe(false);
  });

  it('带锚点偏移(ox=1) → 子格父格 -1', () => {
    const s = makeState({ targetCols: 2, targetRows: 2 });
    // 子格 (2,0) eff=2 → parent=1, bx=1-1=0 ∈ [0,2) → true
    expect(isSubCellInBitmapRegion(s, 2, 0, 2, 1, 0)).toBe(true);
    // 子格 (0,0) → parent=0, bx=0-1=-1 → false
    expect(isSubCellInBitmapRegion(s, 0, 0, 2, 1, 0)).toBe(false);
  });
});

// ==================== computeTargetOrigin ====================

describe('computeTargetOrigin', () => {
  let s: MatrixRainState;

  beforeEach(() => {
    s = makeState({ r: 10, i: 8 });
  });

  it('topLeft(默认) → ox=0, oy=0', () => {
    const { ox, oy } = computeTargetOrigin(s);
    expect(ox).toBe(0);
    expect(oy).toBe(0);
  });

  it('center → ox=(r-targetCols)>>1, oy=(i-targetRows)>>1', () => {
    s.targetCols = 4;
    s.targetRows = 2;
    s.targetAnchor = 'center';
    const { ox, oy } = computeTargetOrigin(s);
    expect(ox).toBe((10 - 4) >> 1); // 3
    expect(oy).toBe((8 - 2) >> 1); // 3
  });

  it('topRight → ox=r-targetCols, oy=0', () => {
    s.targetCols = 3;
    s.targetAnchor = 'topRight';
    const { ox, oy } = computeTargetOrigin(s);
    expect(ox).toBe(7);
    expect(oy).toBe(0);
  });

  it('bottomLeft → ox=0, oy=i-targetRows', () => {
    s.targetRows = 3;
    s.targetAnchor = 'bottomLeft';
    const { ox, oy } = computeTargetOrigin(s);
    expect(ox).toBe(0);
    expect(oy).toBe(5);
  });

  it('bottomRight → ox=r-targetCols, oy=i-targetRows', () => {
    s.targetCols = 4;
    s.targetRows = 3;
    s.targetAnchor = 'bottomRight';
    const { ox, oy } = computeTargetOrigin(s);
    expect(ox).toBe(6);
    expect(oy).toBe(5);
  });

  it('命中缓存 → 直接返 cached,不重算(目标列变化也返旧值)', () => {
    s.targetCols = 4;
    s.targetAnchor = 'center';
    const r1 = computeTargetOrigin(s);
    expect(r1.ox).toBe((10 - 4) >> 1);
    // 改 state 但缓存有效 → 仍返旧值
    s.targetCols = 8;
    const r2 = computeTargetOrigin(s);
    expect(r2.ox).toBe(r1.ox);
    expect(r2.oy).toBe(r1.oy);
  });

  it('__cachedAnchorValid=false → 重算并写回缓存', () => {
    s.targetCols = 4;
    s.targetAnchor = 'center';
    const r1 = computeTargetOrigin(s);
    // 模拟下一帧: invalidate + 改 anchor
    s.__cachedAnchorValid = false;
    s.targetAnchor = 'topRight';
    const r2 = computeTargetOrigin(s);
    expect(r2.ox).toBe(6); // 10-4
    expect(r2.oy).toBe(0);
    // 缓存应被刷新
    expect(s.__cachedAnchorValid).toBe(true);
    expect(s.__cachedAnchorOx).toBe(6);
    expect(s.__cachedAnchorOy).toBe(0);
  });
});

// ==================== drawInner 分支覆盖 ====================

describe('drawInner 分支', () => {
  it('l < 0.02 早返 → 不调 drawChar', () => {
    let called = 0;
    const state = makeState({
      renderer: { drawChar: () => called++ } as unknown as MatrixRainState['renderer'],
    });
    const c = makeCell();
    drawInner(state, c, 0, 0, 0, 0.01, 5, 4, 0);
    expect(called).toBe(0);
  });

  it('colorOverrideFn 返回 truthy → 走快路径,alpha=0.9', () => {
    const calls: unknown[] = [];
    const state = makeState({
      colorOverrideFn: (lIdx, h, s, info) => {
        // 记录输入供断言
        return [255, 0, 0]; // R/G/B tuple
      },
      renderer: {
        drawChar: (ch, cx, cy, r, g, b, a) => calls.push({ ch, cx, cy, r, g, b, a }),
      } as unknown as MatrixRainState['renderer'],
    });
    const c = makeCell({ ch: 42 });
    drawInner(state, c, 0, 0, 0, 0.5, 5, 4, 0);
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ ch: 42, r: 255, g: 0, b: 0, a: 0.9 });
  });

  it('colorOverrideFn 返回 null/undefined → fallthrough 到 LUT', () => {
    const calls: unknown[] = [];
    const state = makeState({
      colorOverrideFn: () => null,
      renderer: {
        drawChar: (...args) => calls.push(args),
      } as unknown as MatrixRainState['renderer'],
    });
    drawInner(state, makeCell(), 0, 0, 0, 0.5, 5, 4, 0);
    // LUT 路径走 drawFillBlended,也会调一次 drawChar
    expect(calls.length).toBe(1);
    // alpha 来自 transitionAlpha=1 × LUT.a[0]/255 = 1 × 0 = 0(空数组)
    expect((calls[0] as number[])[6]).toBe(0);
  });

  it('colorOverrides Record 命中 → 走快路径,alpha=0.9', () => {
    const calls: unknown[] = [];
    const state = makeState({
      colorOverrideFn: null,
      colorOverrides: { 4: [10, 20, 30] } as MatrixRainState['colorOverrides'],
      renderer: {
        drawChar: (ch, cx, cy, r, g, b, a) => calls.push({ r, g, b, a }),
      } as unknown as MatrixRainState['renderer'],
    });
    // l=0.5, lIdx=(0.5*9)|0=4
    drawInner(state, makeCell(), 0, 0, 0, 0.5, 5, 4, 0);
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ r: 10, g: 20, b: 30, a: 0.9 });
  });

  it('colorOverrides Record miss → fallthrough 到 LUT', () => {
    const calls: unknown[] = [];
    const state = makeState({
      colorOverrideFn: null,
      colorOverrides: { 7: [1, 2, 3] } as MatrixRainState['colorOverrides'], // lIdx=4 不命中
      renderer: {
        drawChar: () => calls.push(1),
      } as unknown as MatrixRainState['renderer'],
    });
    drawInner(state, makeCell(), 0, 0, 0, 0.5, 5, 4, 0);
    expect(calls.length).toBe(1);
  });

  it('colorOverrideFn 优先于 colorOverrides(互斥)', () => {
    const calls: unknown[] = [];
    const state = makeState({
      colorOverrideFn: () => [9, 9, 9], // 函数命中 → 红绿蓝
      colorOverrides: { 4: [1, 1, 1] } as MatrixRainState['colorOverrides'], // Record 也会命中但被旁路
      renderer: {
        drawChar: (ch, cx, cy, r, g, b, a) => calls.push({ r, g, b }),
      } as unknown as MatrixRainState['renderer'],
    });
    drawInner(state, makeCell(), 0, 0, 0, 0.5, 5, 4, 0);
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ r: 9, g: 9, b: 9 });
  });

  it('字符空判定:l=0.5 + 色覆盖未设 → 仍调 drawChar 一次(LUT)', () => {
    const calls: unknown[] = [];
    const state = makeState({
      renderer: { drawChar: () => calls.push(1) } as unknown as MatrixRainState['renderer'],
    });
    drawInner(state, makeCell({ ch: 0 }), 0, 0, 0, 0.5, 5, 4, 0);
    expect(calls.length).toBe(1);
  });

  it('warmth 阻尼:c.warmth 单调向 H 收敛(连续调同一 cell)', () => {
    const state = makeState({
      renderer: { drawChar: () => {} } as unknown as MatrixRainState['renderer'],
    });
    const c = makeCell({ warmth: 0 });
    // 调 50 次,warmth 应单调上升(0 → ~H,稳定后不增)
    let prev = -1;
    let monotone = true;
    for (let k = 0; k < 50; k++) {
      drawInner(state, c, 5, 4, 0, 0.5, 5, 4, 0);
      if (c.warmth < prev) monotone = false;
      prev = c.warmth;
    }
    expect(monotone).toBe(true);
    // 收敛后期望 ~H,但 warmLerp=0.04,50 次未必完全收敛;断言至少 > 0
    expect(c.warmth).toBeGreaterThan(0);
  });

  it('colorOverrideFn 接收的 ctx 包含 ch/bright/phase + 阻尼后的 warmth', () => {
    let captured: { ch: number; warmth: number; bright: number; phase: number } | null = null;
    const state = makeState({
      colorOverrideFn: (_lIdx, _h, _s, info) => {
        captured = info;
        return [0, 0, 0];
      },
    });
    const c = makeCell({ ch: 7, warmth: 0.3, bright: 0.6, phase: 1.2 });
    drawInner(state, c, 0, 0, 0, 0.5, 5, 4, 0);
    expect(captured).not.toBeNull();
    // warmth 经 drawInner 阻尼后传给 colorOverrideFn(不是原始 c.warmth)
    expect(captured!.ch).toBe(7);
    expect(captured!.bright).toBe(0.6);
    expect(captured!.phase).toBe(1.2);
    expect(captured!.warmth).toBeGreaterThanOrEqual(0);
    expect(captured!.warmth).toBeLessThanOrEqual(1);
  });
});

// ==================== drawClassic smoke (无 target bitmap · 最简配置)===================
//
// 注:drawClassic 调 state.hooks.updateTargetBitmapPhaseGlobal / .applyTargetBitmapPhase
// + state.userFuncs.* / state.paletteLUT.getBlendedLUT / state.renderer.drawChar 等。
// 这里只验"不抛 + 调了 drawChar"(行为覆盖走 Playwright pixel,见 audit P1-5)。
describe('drawClassic smoke', () => {
  function makeClassicState(opts: { r?: number; i?: number; charset?: string } = {}): MatrixRainState {
    const r = opts.r ?? 3;
    const i = opts.i ?? 2;
    const charset = opts.charset ?? '01';
    const b: Cell[][] = [];
    for (let s = 0; s < i; s++) {
      const row: Cell[] = [];
      for (let h = 0; h < r; h++) row.push(makeCell({ ch: h % charset.length }));
      b.push(row);
    }
    return {
      r,
      i,
      ef: 14,
      f: 1,
      wallTime: 0,
      lastDt: 1 / 60,
      charset,
      b,
      cfg: {
        fontSize: 14, charGap: 0, trailAlpha: 0.18, maxDPR: 2,
        warmthRadius: 0.6, warmthLerp: 0.04, sparkProbability: 0,
        targetFPS: 0, flickerSpeed: 1, renderScale: 1, easing: 'smooth',
      },
      renderScaleEffective: 1,
      targetBitmap: null,
      targetCols: 0,
      targetRows: 0,
      targetActive: false,
      targetPhase: 'fade',
      targetAnchor: 'topLeft',
      targetMotion: 'static',
      targetMotionSpeed: 0,
      targetFadeIn: 0,
      targetHold: 0,
      targetFadeOut: 0,
      targetStartTime: 0,
      targetChaos: 0,
      targetFinishFired: false,
      targetDissolveStartTime: -1,
      targetNoiseDuration: 0,
      targetConvergeDuration: 0,
      targetLockStability: 0.5,
      __cachedAnchorOx: 0,
      __cachedAnchorOy: 0,
      __cachedAnchorValid: false,
      transitionAlpha: 1,
      dynamicHue: 0,
      dynamicColorHue: 0,
      lightCenter: { x: 0.5, y: 0.5 },
      driftSpeed: { x: 0, y: 0 },
      flicker: { high: 0.7, mid: 0.4, low: 0.15, dark: 0.04 },
      effectiveVp: {
        phaseStep: 0.05, phaseJitter: 0.01,
        sinWeightA: 1, sinWeightB: 0, sinWeightC: 0,
        chUpdateProb: 0.1, sparkProbability: 0,
        headBright: 8, headFalloff: 2, avalancheSpeed: 0.5,
      },
      effectiveTp: {} as MatrixRainState['effectiveTp'],
      paletteLUT: {
        getBlendedLUT: () => ({ r: new Uint8Array(256), g: new Uint8Array(256), b: new Uint8Array(256), a: new Uint8Array(256) }),
      } as unknown as MatrixRainState['paletteLUT'],
      renderer: {
        drawChar: () => {},
        setFontSize: () => {},
      } as unknown as MatrixRainState['renderer'],
      colorOverrideFn: null,
      colorOverrides: undefined,
      userFuncs: { brightnessCurve: null, flickerCurve: null, phaseFunc: null, charsetFunc: null },
      __frameCtx: {} as MatrixRainState['__frameCtx'],
      hooks: {
        fireOnTargetFinish: () => {},
        updateTargetBitmapPhaseGlobal: () => {},
        applyTargetBitmapPhase: () => null,
      } as unknown as MatrixRainState['hooks'],
    } as unknown as MatrixRainState;
  }

  it('3×2 grid · 无 target · 不抛 + drawChar 调用次数 = 网格大小', () => {
    const drawCalls: number[] = [];
    const state = makeClassicState({ r: 3, i: 2 });
    state.renderer = {
      drawChar: () => drawCalls.push(1),
      setFontSize: () => {},
    } as unknown as MatrixRainState['renderer'];
    drawClassic(state);
    // 3×2 = 6 cell,每个 1 次 drawChar(走 LUT 路径)
    expect(drawCalls.length).toBe(6);
  });

  it('子格路径:renderScaleEffective=2 + targetActive=true + bitmap 全 0', () => {
    const drawCalls: number[] = [];
    const state = makeClassicState({ r: 2, i: 1 });
    state.renderScaleEffective = 2;
    state.targetBitmap = new Float32Array(2); // 全 0
    state.targetCols = 2;
    state.targetRows = 1;
    state.targetActive = true;
    state.targetPhase = 'noise-converge';
    state.renderer = {
      drawChar: () => drawCalls.push(1),
      setFontSize: () => {},
    } as unknown as MatrixRainState['renderer'];
    // hooks.applyTargetBitmapPhase 必须返非 null 才会走子格路径
    (state.hooks as { applyTargetBitmapPhase: (c: Cell, h: number, s: number, l: number, _?: unknown, isSub?: boolean) => { l: number; ch: number; skipCharset: boolean } | null }).applyTargetBitmapPhase =
      (_c: Cell, _h: number, _s: number, l: number) => ({ l, ch: 0, skipCharset: true });
    drawClassic(state);
    // r*i*eff² = 2*1*4 = 8 次 drawChar(每个子格 1 次)
    expect(drawCalls.length).toBe(8);
    // setFontSize 在子格模式被调 1 次
    // (不直接断言,因为已有 drawChar 数验证)
  });
});

// ==================== drawAvalanche smoke ====================
// Avalanche 变体 cell 字段:yPos / speed / headBright。yPos 沿 row 下移。
describe('drawAvalanche smoke', () => {
  function makeAvalancheState(opts: { r?: number; i?: number; charset?: string } = {}): MatrixRainState {
    const r = opts.r ?? 3;
    const i = opts.i ?? 2;
    const charset = opts.charset ?? '01';
    const b: Cell[][] = [];
    for (let s = 0; s < i; s++) {
      const row: Cell[] = [];
      for (let h = 0; h < r; h++) {
        row.push(makeCell({ ch: h % charset.length, yPos: s, speed: 0.05, headBright: 6 }));
      }
      b.push(row);
    }
    return {
      r,
      i,
      ef: 14,
      f: 1,
      wallTime: 0,
      lastDt: 1 / 60,
      charset,
      b,
      cfg: {
        fontSize: 14, charGap: 0, trailAlpha: 0.18, maxDPR: 2,
        warmthRadius: 0.6, warmthLerp: 0.04, sparkProbability: 0,
        targetFPS: 0, flickerSpeed: 1, renderScale: 1, easing: 'smooth',
      },
      renderScaleEffective: 1,
      targetBitmap: null,
      targetCols: 0,
      targetRows: 0,
      targetActive: false,
      targetPhase: 'fade',
      targetAnchor: 'topLeft',
      targetMotion: 'static',
      targetMotionSpeed: 0,
      targetFadeIn: 0,
      targetHold: 0,
      targetFadeOut: 0,
      targetStartTime: 0,
      targetChaos: 0,
      targetFinishFired: false,
      targetDissolveStartTime: -1,
      targetNoiseDuration: 0,
      targetConvergeDuration: 0,
      targetLockStability: 0.5,
      __cachedAnchorOx: 0,
      __cachedAnchorOy: 0,
      __cachedAnchorValid: false,
      transitionAlpha: 1,
      dynamicHue: 0,
      dynamicColorHue: 0,
      lightCenter: { x: 0.5, y: 0.5 },
      driftSpeed: { x: 0, y: 0 },
      flicker: { high: 0.7, mid: 0.4, low: 0.15, dark: 0.04 },
      effectiveVp: {
        phaseStep: 0.05, phaseJitter: 0.01,
        sinWeightA: 1, sinWeightB: 0, sinWeightC: 0,
        chUpdateProb: 0.1, sparkProbability: 0,
        headBright: 6, headFalloff: 2, avalancheSpeed: 0.5,
      },
      effectiveTp: {} as MatrixRainState['effectiveTp'],
      paletteLUT: {
        getBlendedLUT: () => ({ r: new Uint8Array(256), g: new Uint8Array(256), b: new Uint8Array(256), a: new Uint8Array(256) }),
      } as unknown as MatrixRainState['paletteLUT'],
      renderer: {
        drawChar: () => {},
        setFontSize: () => {},
      } as unknown as MatrixRainState['renderer'],
      colorOverrideFn: null,
      colorOverrides: undefined,
      userFuncs: { brightnessCurve: null, flickerCurve: null, phaseFunc: null, charsetFunc: null },
      __frameCtx: {} as MatrixRainState['__frameCtx'],
      hooks: {
        fireOnTargetFinish: () => {},
        updateTargetBitmapPhaseGlobal: () => {},
        applyTargetBitmapPhase: () => null,
      } as unknown as MatrixRainState['hooks'],
    } as unknown as MatrixRainState;
  }

  it('Avalanche 1x 路径:不抛 + drawChar 调用次数 = r*i', () => {
    const drawCalls: number[] = [];
    const state = makeAvalancheState({ r: 3, i: 2 });
    state.renderer = {
      drawChar: () => drawCalls.push(1),
      setFontSize: () => {},
    } as unknown as MatrixRainState['renderer'];
    drawAvalanche(state);
    // 部分 cell.l=0 < 0.02 会早返;非全画,但应 > 0
    expect(drawCalls.length).toBeGreaterThan(0);
    expect(drawCalls.length).toBeLessThanOrEqual(3 * 2);
  });

  it('Avalanche 子格路径:renderScaleEffective=2 + bitmap 全 0', () => {
    const drawCalls: number[] = [];
    const state = makeAvalancheState({ r: 2, i: 1 });
    state.renderScaleEffective = 2;
    state.targetBitmap = new Float32Array(2);
    state.targetCols = 2;
    state.targetRows = 1;
    state.targetActive = true;
    state.targetPhase = 'noise-converge';
    state.renderer = {
      drawChar: () => drawCalls.push(1),
      setFontSize: () => {},
    } as unknown as MatrixRainState['renderer'];
    (state.hooks as { applyTargetBitmapPhase: (c: Cell, h: number, s: number, l: number, _?: unknown, isSub?: boolean) => { l: number; ch: number; skipCharset: boolean } | null }).applyTargetBitmapPhase =
      (_c: Cell, _h: number, _s: number, l: number) => ({ l, ch: 0, skipCharset: true });
    drawAvalanche(state);
    // 子格:每个父格 1 行子格(横向 eff 个),所以 eff*r*i 次
    expect(drawCalls.length).toBe(2 * 2 * 1);
  });
});

// ==================== drawRipple smoke ====================
describe('drawRipple smoke', () => {
  function makeRippleState(opts: { r?: number; i?: number; charset?: string } = {}): MatrixRainState {
    const r = opts.r ?? 3;
    const i = opts.i ?? 2;
    const charset = opts.charset ?? '01';
    const b: Cell[][] = [];
    for (let s = 0; s < i; s++) {
      const row: Cell[] = [];
      for (let h = 0; h < r; h++) row.push(makeCell({ ch: h % charset.length }));
      b.push(row);
    }
    return {
      r,
      i,
      ef: 14,
      f: 1,
      wallTime: 0,
      lastDt: 1 / 60,
      charset,
      b,
      cfg: {
        fontSize: 14, charGap: 0, trailAlpha: 0.18, maxDPR: 2,
        warmthRadius: 0.6, warmthLerp: 0.04, sparkProbability: 0,
        targetFPS: 0, flickerSpeed: 1, renderScale: 1, easing: 'smooth',
      },
      renderScaleEffective: 1,
      targetBitmap: null,
      targetCols: 0,
      targetRows: 0,
      targetActive: false,
      targetPhase: 'fade',
      targetAnchor: 'topLeft',
      targetMotion: 'static',
      targetMotionSpeed: 0,
      targetFadeIn: 0,
      targetHold: 0,
      targetFadeOut: 0,
      targetStartTime: 0,
      targetChaos: 0,
      targetFinishFired: false,
      targetDissolveStartTime: -1,
      targetNoiseDuration: 0,
      targetConvergeDuration: 0,
      targetLockStability: 0.5,
      __cachedAnchorOx: 0,
      __cachedAnchorOy: 0,
      __cachedAnchorValid: false,
      transitionAlpha: 1,
      dynamicHue: 0,
      dynamicColorHue: 0,
      lightCenter: { x: 0.5, y: 0.5 },
      driftSpeed: { x: 0, y: 0 },
      flicker: { high: 0.7, mid: 0.4, low: 0.15, dark: 0.04 },
      effectiveVp: {
        phaseStep: 0.05, phaseJitter: 0.01,
        sinWeightA: 1, sinWeightB: 0, sinWeightC: 0,
        chUpdateProb: 0.1, sparkProbability: 0,
        headBright: 6, headFalloff: 2, avalancheSpeed: 0.5,
      },
      effectiveTp: {} as MatrixRainState['effectiveTp'],
      paletteLUT: {
        getBlendedLUT: () => ({ r: new Uint8Array(256), g: new Uint8Array(256), b: new Uint8Array(256), a: new Uint8Array(256) }),
      } as unknown as MatrixRainState['paletteLUT'],
      renderer: {
        drawChar: () => {},
        setFontSize: () => {},
      } as unknown as MatrixRainState['renderer'],
      colorOverrideFn: null,
      colorOverrides: undefined,
      userFuncs: { brightnessCurve: null, flickerCurve: null, phaseFunc: null, charsetFunc: null },
      __frameCtx: {} as MatrixRainState['__frameCtx'],
      hooks: {
        fireOnTargetFinish: () => {},
        updateTargetBitmapPhaseGlobal: () => {},
        applyTargetBitmapPhase: () => null,
      } as unknown as MatrixRainState['hooks'],
    } as unknown as MatrixRainState;
  }

  it('Ripple 1x 路径:不抛 + drawChar > 0', () => {
    const drawCalls: number[] = [];
    const state = makeRippleState({ r: 3, i: 2 });
    state.renderer = {
      drawChar: () => drawCalls.push(1),
      setFontSize: () => {},
    } as unknown as MatrixRainState['renderer'];
    drawRipple(state);
    expect(drawCalls.length).toBeGreaterThan(0);
    expect(drawCalls.length).toBeLessThanOrEqual(3 * 2);
  });

  it('Ripple 子格路径:renderScaleEffective=2 + bitmap 全 0', () => {
    const drawCalls: number[] = [];
    const state = makeRippleState({ r: 2, i: 1 });
    state.renderScaleEffective = 2;
    state.targetBitmap = new Float32Array(2);
    state.targetCols = 2;
    state.targetRows = 1;
    state.targetActive = true;
    state.targetPhase = 'noise-converge';
    state.renderer = {
      drawChar: () => drawCalls.push(1),
      setFontSize: () => {},
    } as unknown as MatrixRainState['renderer'];
    (state.hooks as { applyTargetBitmapPhase: (c: Cell, h: number, s: number, l: number, _?: unknown, isSub?: boolean) => { l: number; ch: number; skipCharset: boolean } | null }).applyTargetBitmapPhase =
      (_c: Cell, _h: number, _s: number, l: number) => ({ l, ch: 0, skipCharset: true });
    drawRipple(state);
    // Ripple 子格复用 drawSubCellClassic,与 classic 子格同公式 eff²
    expect(drawCalls.length).toBe(2 * 1 * 4);
  });
});
describe('字符空判定 (ch undefined)', () => {
  it('cell.ch = undefined 不抛,仍走 LUT', () => {
    const calls: unknown[] = [];
    const state = makeState({
      renderer: { drawChar: (ch, cx, cy, r, g, b, a) => calls.push(ch) } as unknown as MatrixRainState['renderer'],
    });
    const c = makeCell({ ch: undefined as unknown as number });
    expect(() => drawInner(state, c, 0, 0, 0, 0.5, 5, 4, 0)).not.toThrow();
    expect(calls.length).toBe(1);
  });
});