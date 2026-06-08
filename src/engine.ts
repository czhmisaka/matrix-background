/**
 * @xietuier/matrix-rain · 主引擎 orchestrator
 * Canvas 2D 数字雨 · 残影拖尾 + 冷暖双调色板 + 阻尼跟随温度光心
 *
 * 纯 ES Module,无外部依赖。
 * 4 种变体:classic / avalanche / ripple / ascii
 *
 * 重构后结构(P0-3 + P1-1/P1-3):
 *   - state.ts        全部 closure 私有状态 → MatrixRainState 对象
 *   - draw-helpers.ts drawClassic / drawAvalanche / drawRipple / drawInner + 第三层 LUT
 *   - setters.ts      30 个 setter + 7 个 getter(createSetters 工厂)
 *   - engine.ts(本文件)matrixRain() 工厂 · 200 行以内 · 只剩 rAF 主循环 + 调度
 *
 * 行为 100% 等价于重构前;npm test 全部通过;npm run build 0 error
 */

import type {
  MatrixRainOptions,
  MatrixRainInstance,
  MatrixRainSnapshot,
  FitMode,
  ThemeName,
} from '../types';
import { themes } from './core';
import {
  createMatrixRainState,
  setEngineHooks,
  type MatrixRainHooks,
  type Cell,
  lerpHSLPalette,
  lerpThemeParams,
  lerpVariantParams,
  pickEasingFn,
  resolveEffectiveRenderScale,
  FIT_THRESHOLD,
} from './engine/state';
import {
  drawClassic,
  drawAvalanche,
  drawRipple,
  applyTargetBitmapPhase,
  updateTargetBitmapPhaseGlobal,
} from './engine/draw-helpers';
import { createSetters } from './engine/setters';

// ==================== DevTools 调试钩 ====================
// window.__matrixRainDebug 暴露活跃实例、聚合 FPS、当前主题
// - 每次 create/destroy 时更新
// - Demo 99-debug.html 用它做实时面板
// - SSR/Node 环境自动跳过(无 window)
type DebugInstance = MatrixRainInstance & {
  __debugId?: number;
  __debugTheme?: string;
  __debugVariant?: string;
};
const __debugInstances: Set<DebugInstance> = (() => {
  if (typeof window === 'undefined') return new Set<DebugInstance>();
  return new Set<DebugInstance>();
})();
let __debugNextId = 1;

const __ensureDebugHook = () => {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __matrixRainDebug?: unknown };
  if (w.__matrixRainDebug) return;
  w.__matrixRainDebug = {
    get instances() {
      return Array.from(__debugInstances).map((i) => ({
        id: i.__debugId,
        theme: i.__debugTheme,
        variant: i.__debugVariant,
        fps: i.getFPS(),
      }));
    },
    get count() {
      return __debugInstances.size;
    },
    get avgFps() {
      const all = Array.from(__debugInstances);
      if (all.length === 0) return 0;
      return Math.round(all.reduce((s, i) => s + i.getFPS(), 0) / all.length);
    },
    destroyAll() {
      Array.from(__debugInstances).forEach((i) => {
        try {
          i.destroy();
        } catch {
          /* */
        }
      });
    },
  };
};

// ==================== resampleBitmap helper(用于 fitMode 缩放)================
/**
 * 灰度位图等比缩放(box filter)
 * - src: 源 Float32Array(长度 srcW*srcH)
 * - srcW/srcH: 源宽高
 * - dstW/dstH: 目标宽高
 * - 返回: 新的 Float32Array(长度 dstW*dstH)
 * - 降采样时用 box filter(平均),升采样时用 nearest neighbor(快)
 */
const resampleBitmap = (
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Float32Array => {
  if (srcW === dstW && srcH === dstH) return new Float32Array(src);
  const dst = new Float32Array(dstW * dstH);
  if (dstW >= srcW && dstH >= srcH) {
    for (let y = 0; y < dstH; y++) {
      const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
      for (let x = 0; x < dstW; x++) {
        const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
        dst[y * dstW + x] = src[sy * srcW + sx];
      }
    }
  } else {
    const xRatio = srcW / dstW;
    const yRatio = srcH / dstH;
    for (let y = 0; y < dstH; y++) {
      const sy0 = Math.floor(y * yRatio);
      const sy1 = Math.min(srcH, Math.floor((y + 1) * yRatio));
      for (let x = 0; x < dstW; x++) {
        const sx0 = Math.floor(x * xRatio);
        const sx1 = Math.min(srcW, Math.floor((x + 1) * xRatio));
        let sum = 0,
          count = 0;
        for (let sy = sy0; sy < sy1; sy++) {
          for (let sx = sx0; sx < sx1; sx++) {
            sum += src[sy * srcW + sx];
            count++;
          }
        }
        dst[y * dstW + x] = count > 0 ? sum / count : 0;
      }
    }
  }
  return dst;
};

// ==================== 工厂 ====================

/**
 * 创建一个数字矩阵背景实例
 * @example
 * const rain = matrixRain({ theme: 'silicon-valley', fontSize: 6 });
 * // ...用完:
 * rain.destroy();
 */
export function matrixRain(options: MatrixRainOptions = {}): MatrixRainInstance {
  // ============ 1. 创建 state ============
  const state = createMatrixRainState(options);

  // ============ 2. 定义内部 helpers(本 closure 内,作为 hooks 注入)============
  const buildGrid = (): void => {
    state.n = Math.min(
      typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1,
      state.cfg.maxDPR
    );
    const rect = state.canvas.getBoundingClientRect();
    state.a = rect.width || (typeof window !== 'undefined' ? window.innerWidth : 1);
    state.o = rect.height || (typeof window !== 'undefined' ? window.innerHeight : 1);
    state.canvas.width = Math.max(1, Math.round(state.a * state.n));
    state.canvas.height = Math.max(1, Math.round(state.o * state.n));
    state.ctx.setTransform(state.n, 0, 0, state.n, 0, 0);
    // 默认 fontSize 按 canvas 宽度连续映射:720p(1280)→6,4K(3840)→16,中间线性
    // < 720p 落到硬下限 4(产品决策,见 memory/feedback_min_font_size.md)
    // > 4K 固定 16,不再放大
    // 用户显式传 fontSize 时,以用户值为准(不被自适应公式覆盖)
    const userOverride = state.options.fontSize;
    let adaptiveSize: number;
    if (state.a < 1280) {
      adaptiveSize = 4; // < 720p:硬下限
    } else if (state.a >= 3840) {
      adaptiveSize = 16; // ≥ 4K:封顶
    } else {
      // 1280 → 6,3840 → 16,中间 10/2560 = 0.00390625 per pixel
      adaptiveSize = Math.round(6 + ((state.a - 1280) * 10) / 2560);
    }
    state.ef = userOverride !== undefined ? userOverride : adaptiveSize;
    state.r = Math.ceil(state.a / state.ef);
    state.i = Math.ceil(state.o / state.ef);

    state.b = [];
    for (let s = 0; s < state.i; s++) {
      const row: Cell[] = [];
      for (let h = 0; h < state.r; h++) {
        const cell: Cell = {
          ch: Math.floor(Math.random() * state.charset.length),
          bright: Math.random() < 0.2 ? Math.floor(Math.random() * 3) : 0,
          phase: Math.random() * Math.PI * 2,
          warmth: Math.random(),
        };
        if (state.variant === 'avalanche') {
          cell.speed = 0.3 + Math.random() * 0.7;
          cell.yPos = Math.random() * state.i;
          cell.headBright = 7 + Math.floor(Math.random() * 2);
        }
        row.push(cell);
      }
      state.b.push(row);
    }
    syncFrameCtxSize();
    if (state.targetBitmap) applyTargetFitMode();
    if (state.targetBitmap && state.targetActive && state.targetPhase === 'noise-converge') {
      recomputeTargetLockTimes();
    }
  };

  const syncFrameCtxSize = (): void => {
    state.__frameCtx.W = state.r;
    state.__frameCtx.H = state.i;
  };

  const applyTheme = (name: ThemeName): boolean => {
    if (!themes[name]) return false;
    // C1 主题过渡:先快照旧值
    state.oldColdPalette = { ...state.coldPalette };
    state.oldWarmPalette = { ...state.warmPalette };
    state.oldTp = { ...state.tp };
    state.oldCtp = { ...state.ctp };
    state.oldWtp = { ...state.wtp };
    const t = themes[name]();
    state.coldPalette = t.cold;
    state.warmPalette = t.warm;
    state.tp = {
      brightness: t.brightness ?? 1,
      chroma: t.chroma ?? 1,
      hueShift: t.hueShift ?? 0,
      saturationShift: t.saturationShift ?? 0,
      lightnessShift: t.lightnessShift ?? 0,
      invertHue: t.invertHue ?? 0,
      contrast: t.contrast ?? 1,
    };
    state.currentThemeName = name;
    state.mixedFrom = undefined;
    return true;
  };

  const applyTargetFitMode = (overrideMode?: FitMode): void => {
    if (!state.targetBitmap || state.targetCols <= 0 || state.targetRows <= 0) return;
    if (state.r <= 0 || state.i <= 0) return;
    const mode = overrideMode ?? state.targetFitMode;
    if (mode === 'actual') return;
    let bbMinX = state.targetCols,
      bbMinY = state.targetRows,
      bbMaxX = -1,
      bbMaxY = -1;
    for (let py = 0; py < state.targetRows; py++) {
      for (let px = 0; px < state.targetCols; px++) {
        if (state.targetBitmap[py * state.targetCols + px] > 0) {
          if (px < bbMinX) bbMinX = px;
          if (px > bbMaxX) bbMaxX = px;
          if (py < bbMinY) bbMinY = py;
          if (py > bbMaxY) bbMaxY = py;
        }
      }
    }
    if (bbMaxX < 0) return;
    const bbCols = bbMaxX - bbMinX + 1;
    const bbRows = bbMaxY - bbMinY + 1;
    let needScale = false;
    let scale = 1.0;
    if (mode === 'contain') {
      if (bbCols > state.r * FIT_THRESHOLD || bbRows > state.i * FIT_THRESHOLD) {
        needScale = true;
        scale = Math.min((state.r * FIT_THRESHOLD) / bbCols, (state.i * FIT_THRESHOLD) / bbRows);
      }
    } else if (mode === 'cover') {
      if (bbCols < state.r * FIT_THRESHOLD || bbRows < state.i * FIT_THRESHOLD) {
        needScale = true;
        scale = Math.max((state.r * FIT_THRESHOLD) / bbCols, (state.i * FIT_THRESHOLD) / bbRows);
      }
    } else if (mode === 'auto') {
      const isLong = bbCols > state.r * 0.4;
      if (isLong && (bbCols > state.r * FIT_THRESHOLD || bbRows > state.i * FIT_THRESHOLD)) {
        needScale = true;
        scale = Math.min((state.r * FIT_THRESHOLD) / bbCols, (state.i * FIT_THRESHOLD) / bbRows);
      }
    }
    if (!needScale || scale <= 0) return;
    const newCols = Math.max(1, Math.round(bbCols * scale));
    const newRows = Math.max(1, Math.round(bbRows * scale));
    const sub = new Float32Array(bbCols * bbRows);
    for (let py = 0; py < bbRows; py++) {
      for (let px = 0; px < bbCols; px++) {
        sub[py * bbCols + px] =
          state.targetBitmap[(py + bbMinY) * state.targetCols + (px + bbMinX)];
      }
    }
    const resampled = resampleBitmap(sub, bbCols, bbRows, newCols, newRows);
    state.targetBitmap = resampled;
    state.targetCols = newCols;
    state.targetRows = newRows;
  };

  const resetAllCellLockState = (): void => {
    for (let s = 0; s < state.i; s++) {
      for (let h = 0; h < state.r; h++) {
        const c = state.b[s][h];
        c.locked = false;
        c.lockTime = undefined;
        c.unlockTime = undefined;
        c.lockedCh = undefined;
        c.lockEaseStart = undefined;
        c.unlockEaseStart = undefined;
        c.lockEaseFromL = undefined;
        c.lockEaseToL = undefined;
        c.unlockEaseFromL = undefined;
        c.unlockEaseToL = undefined;
      }
    }
    state.targetDissolveStartTime = -1;
  };

  const recomputeTargetLockTimes = (): void => {
    if (!state.targetBitmap || !state.targetActive) return;
    if (state.targetPhase !== 'noise-converge') return;
    resetAllCellLockState();
    let ox = 0,
      oy = 0;
    if (state.targetAnchor === 'center') {
      ox = (state.r - state.targetCols) >> 1;
      oy = (state.i - state.targetRows) >> 1;
    } else if (state.targetAnchor === 'topRight') {
      ox = state.r - state.targetCols;
      oy = 0;
    } else if (state.targetAnchor === 'bottomLeft') {
      ox = 0;
      oy = state.i - state.targetRows;
    } else if (state.targetAnchor === 'bottomRight') {
      ox = state.r - state.targetCols;
      oy = state.i - state.targetRows;
    }

    type TC = { h: number; s: number; bx: number; by: number; g: number; rank: number };
    const targets: TC[] = [];
    for (let s = 0; s < state.i; s++) {
      for (let h = 0; h < state.r; h++) {
        const bx = h - ox,
          by = s - oy;
        if (bx >= 0 && bx < state.targetCols && by >= 0 && by < state.targetRows) {
          const g = state.targetBitmap[by * state.targetCols + bx];
          if (g > 0) {
            targets.push({ h, s, bx, by, g, rank: 0 });
          }
        }
      }
    }
    if (targets.length === 0) return;
    const tCols = state.targetCols;
    const tRows = state.targetRows;
    const tCenterX = (tCols - 1) / 2;
    const tCenterY = (tRows - 1) / 2;
    for (const t of targets) {
      let rank: number;
      switch (state.targetLockOrder) {
        case 'topdown':
          rank = t.by / Math.max(1, tRows - 1);
          break;
        case 'bottomup':
          rank = 1 - t.by / Math.max(1, tRows - 1);
          break;
        case 'leftright':
          rank = t.bx / Math.max(1, tCols - 1);
          break;
        case 'rightleft':
          rank = 1 - t.bx / Math.max(1, tCols - 1);
          break;
        case 'center': {
          const dx = t.bx - tCenterX;
          const dy = t.by - tCenterY;
          rank =
            Math.sqrt(dx * dx + dy * dy) /
            Math.max(1, Math.sqrt(tCenterX * tCenterX + tCenterY * tCenterY));
          break;
        }
        case 'edge': {
          const dx = t.bx - tCenterX;
          const dy = t.by - tCenterY;
          rank =
            1 -
            Math.sqrt(dx * dx + dy * dy) /
              Math.max(1, Math.sqrt(tCenterX * tCenterX + tCenterY * tCenterY));
          break;
        }
        case 'random':
        default:
          rank = Math.random();
          break;
      }
      t.rank = Math.max(0, Math.min(1, rank));
    }
    const noiseStart = state.targetNoiseDuration;
    const convergeSpan = state.targetConvergeDuration;
    for (const t of targets) {
      const c = state.b[t.s][t.h];
      c.locked = false;
      c.lockTime = noiseStart + t.rank * convergeSpan;
      c.unlockTime = undefined;
      c.lockedCh = undefined;
    }
    state.targetDissolveStartTime = -1;
  };

  // ============ 3. 事件发射器 ============
  const fireOnFrame = (): void => {
    const opts = state.options;
    if (!opts.onFrame) return;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (now - state.lastOnFrameTs < 1000 / 30) return;
    state.lastOnFrameTs = now;
    try {
      opts.onFrame({
        f: state.f,
        t: state.wallTime,
        dt: state.lastDt,
        fps: Math.round(state.fps),
      });
    } catch {
      /* */
    }
  };

  const fireOnResize = (): void => {
    const opts = state.options;
    if (!opts.onResize) return;
    try {
      opts.onResize({ w: state.a, h: state.o, cols: state.r, rows: state.i });
    } catch {
      /* */
    }
  };

  const fireOnThemeChange = (newTheme: ThemeName): void => {
    const opts = state.options;
    if (!opts.onThemeChange) return;
    try {
      opts.onThemeChange(newTheme);
    } catch {
      /* */
    }
  };

  const fireOnTargetFinish = (): void => {
    const opts = state.options;
    if (!opts.onTargetFinish) return;
    try {
      opts.onTargetFinish();
    } catch {
      /* */
    }
  };

  // ============ 4. Resize / click 事件处理 ============
  const onResize = (): void => {
    if (state.resizeTimer !== null) clearTimeout(state.resizeTimer);
    state.resizeTimer = (typeof window !== 'undefined' ? window.setTimeout : setTimeout)(() => {
      buildGrid();
      fireOnResize();
    }, 200) as unknown as number;
  };

  const onCanvasClick = (ev: MouseEvent): void => {
    if (state.clickBurstCfg.radius <= 0) return;
    const rect = state.canvas.getBoundingClientRect();
    state.clickBurstX = ev.clientX - rect.left;
    state.clickBurstY = ev.clientY - rect.top;
    state.clickBurstStart = state.wallTime;
    state.clickBurstActive = true;
  };

  // ============ 5. rAF 主循环 draw ============
  const draw = (rafTs?: number): void => {
    if (state.isPaused || state.isDestroyed) return;
    try {
      // FPS 节流
      const tsMs =
        rafTs !== undefined ? rafTs : typeof performance !== 'undefined' ? performance.now() : 0;
      if (state.targetFPS > 0) {
        if (tsMs >= state.lastFrameTime) {
          state.fpsAccumMs += tsMs - state.lastFrameTime;
        }
        state.lastFrameTime = tsMs;
        const minInterval = 1000 / state.targetFPS;
        if (state.fpsAccumMs < minInterval) {
          state.rafId = requestAnimationFrame((ts) => draw(ts));
          return;
        }
        state.fpsAccumMs = state.fpsAccumMs % minInterval;
      }
      // FPS 计数
      const nowMs = typeof performance !== 'undefined' ? performance.now() : 0;
      state.fpsWindowCount++;
      const windowMs = nowMs - state.fpsWindowStart;
      if (windowMs >= 500) {
        state.fps = (state.fpsWindowCount * 1000) / windowMs;
        state.fpsWindowStart = nowMs;
        state.fpsWindowCount = 0;
      }
      state.f++;

      // dt / wallTime
      if (state.fixedTimeStep) {
        state.lastDt = state.FIXED_DT;
        state.wallTime += state.lastDt;
      } else {
        const prev = state.lastFrameTime;
        state.lastFrameTime = tsMs;
        if (tsMs > prev) {
          const rawDt = (tsMs - prev) / 1000;
          state.lastDt = Math.min(0.1, Math.max(0, rawDt));
          state.wallTime += state.lastDt;
        } else {
          state.lastDt = 0;
        }
      }

      // dynamicHue / colorCurve
      state.dynamicHue =
        state.hueRotateSpeed !== 0
          ? (state.wallTime * state.hueRotateSpeed) % state.hueRotateAmount
          : 0;
      if (state.colorCurve) {
        state.__frameCtx.t = state.wallTime;
        state.__frameCtx.phase = 0;
        state.__frameCtx.h = 0;
        state.__frameCtx.s = 0;
        state.__frameCtx.r = Math.random();
        state.__frameCtx.f = state.f;
        state.__frameCtx.W = state.r;
        state.__frameCtx.H = state.i;
        state.__frameCtx.L = 0;
        state.__frameCtx.ch = 0;
        state.dynamicColorHue = Number(state.colorCurve(state.__frameCtx)) || 0;
      } else {
        state.dynamicColorHue = 0;
      }
      const totalHue = state.dynamicHue + state.dynamicColorHue;

      // 解析 effective renderScale(0.3.0+)· 'auto' + 位图激活时升档
      state.renderScaleEffective = resolveEffectiveRenderScale(state);

      // 过渡系统:transitionAlpha
      if (state.transitionAlphaAnim) {
        const tt =
          (state.wallTime - state.transitionAlphaAnim.start) / state.transitionAlphaAnim.dur;
        if (tt >= 1) {
          state.transitionAlpha = state.transitionAlphaAnim.to;
          state.transitionAlphaAnim = null;
        } else {
          state.transitionAlpha =
            state.transitionAlphaAnim.from +
            (state.transitionAlphaAnim.to - state.transitionAlphaAnim.from) *
              pickEasingFn(state, 'inOut', state.transitionAlphaAnim.easing)(tt);
        }
      }

      // C1 主题 HSL 插值
      let effectiveCold = state.coldPalette;
      let effectiveWarm = state.warmPalette;
      let effectiveTp = state.tp;
      let effectiveCtp = state.ctp;
      let effectiveWtp = state.wtp;
      if (state.themeTransition) {
        const tt = (state.wallTime - state.themeTransition.start) / state.themeTransition.dur;
        if (tt >= 1) {
          state.themeTransition = null;
        } else {
          const eased = pickEasingFn(
            state,
            'inOut',
            state.themeTransition.easing
          )(Math.min(1, Math.max(0, tt)));
          effectiveCold = lerpHSLPalette(state.themeTransition.fromCold, state.coldPalette, eased);
          effectiveWarm = lerpHSLPalette(state.themeTransition.fromWarm, state.warmPalette, eased);
          effectiveTp = lerpThemeParams(state.themeTransition.fromTp, state.tp, eased);
          effectiveCtp = lerpThemeParams(state.themeTransition.fromCtp, state.ctp, eased);
          effectiveWtp = lerpThemeParams(state.themeTransition.fromWtp, state.wtp, eased);
          state.paletteLUT.setPalettes(effectiveCold, effectiveWarm);
        }
      }
      // C2 主题参数插值
      if (state.themeParamsTransition) {
        const tt =
          (state.wallTime - state.themeParamsTransition.start) / state.themeParamsTransition.dur;
        if (tt >= 1) {
          state.themeParamsTransition = null;
        } else {
          const eased = pickEasingFn(
            state,
            'inOut',
            state.themeParamsTransition.easing
          )(Math.min(1, Math.max(0, tt)));
          effectiveTp = lerpThemeParams(state.themeParamsTransition.fromTp, state.tp, eased);
          effectiveCtp = lerpThemeParams(state.themeParamsTransition.fromCtp, state.ctp, eased);
          effectiveWtp = lerpThemeParams(state.themeParamsTransition.fromWtp, state.wtp, eased);
        }
      }
      // D1 variant 插值
      if (state.variantTransition) {
        const tt = (state.wallTime - state.variantTransition.start) / state.variantTransition.dur;
        if (tt >= 1) {
          state.variantTransition = null;
          state.effectiveVp = state.vp;
        } else {
          const eased = pickEasingFn(
            state,
            'inOut',
            state.variantTransition.easing
          )(Math.min(1, Math.max(0, tt)));
          state.effectiveVp = lerpVariantParams(state.variantTransition.fromVp, state.vp, eased);
        }
      } else {
        state.effectiveVp = state.vp;
      }
      // B1/B2 phase transition
      if (state.phaseTransition) {
        const tt = (state.wallTime - state.phaseTransition.start) / state.phaseTransition.dur;
        if (tt >= 1) {
          state.phaseTransition = null;
          state.oldTargetSnapshot = null;
        }
      }

      // 写入 effective(给 drawInner / 第三层 LUT 查表用)
      state.effectiveTp = effectiveTp;
      state.effectiveCtp = effectiveCtp;
      state.effectiveWtp = effectiveWtp;

      // 注:这里不需要 coldFinal/warmFinal 了——第三层 LUT 在 drawInner 内按 d 桶取
      // 但为了 keep-alive 避免 paletteLUT 静态表被 GC,这里触发一次 getColdFinal
      // (因为 blended LUT bake 需要 coldFinal 的内容;但 getBlendedLUT 内部已自包含)
      // 实际上 getBlendedLUT 不需要 coldFinal,只用 coldStatic · 所以这一步可省
      // 为避免引入未用变量,这里不取 coldFinal/warmFinal · 0 op 节省
      void totalHue; // 保留(若以后需要)

      // 残影拖尾
      state.ctx.fillStyle = `rgba(8, 8, 18, ${state.cfg.trailAlpha})`;
      state.ctx.fillRect(0, 0, state.a, state.o);
      state.ctx.font = `${state.ef}px "JetBrains Mono", ui-monospace, monospace`;
      state.ctx.textBaseline = 'middle';
      state.ctx.textAlign = 'center';

      // 绘制
      if (state.variant === 'classic' || state.variant === 'ascii') {
        drawClassic(state);
      } else if (state.variant === 'avalanche') {
        drawAvalanche(state);
      } else if (state.variant === 'ripple') {
        drawRipple(state);
      }

      // onFrame
      fireOnFrame();

      state.rafId = requestAnimationFrame((ts) => draw(ts));
    } catch (err) {
      console.error('[matrix-rain] draw error (animation continues):', err);
      if (!state.isDestroyed) {
        state.rafId = requestAnimationFrame((ts) => draw(ts));
      }
    }
  };

  // ============ 6. 组装 hooks + setters ============
  const hooks: MatrixRainHooks = {
    draw,
    buildGrid,
    applyTheme,
    applyTargetFitMode,
    recomputeTargetLockTimes,
    resetAllCellLockState,
    updateTargetBitmapPhaseGlobal: () => updateTargetBitmapPhaseGlobal(state),
    applyTargetBitmapPhase: (c, h, s, l, e, isSub) =>
      applyTargetBitmapPhase(state, c, h, s, l, e, isSub),
    syncFrameCtxSize,
    fireOnFrame,
    fireOnResize,
    fireOnThemeChange,
    fireOnTargetFinish,
    onResize,
    onCanvasClick,
  };
  setEngineHooks(state, hooks);
  const methods = createSetters(state, hooks);

  // ============ 7. ResizeObserver 启动 ============
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => onResize());
    ro.observe(state.canvas);
    state.ro = ro;
  }

  // ============ 8. 事件监听 ============
  if (state.clickBurstCfg.radius > 0) {
    state.canvas.addEventListener('click', onCanvasClick);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onResize);
  }

  // ============ 9. 构造 instance 对象 ============
  const instance: MatrixRainInstance = {
    destroy: methods.destroy,
    pause: methods.pause,
    resume: methods.resume,
    setTheme: methods.setTheme,
    setThemeParams: methods.setThemeParams,
    setColdThemeParams: methods.setColdThemeParams,
    setWarmThemeParams: methods.setWarmThemeParams,
    setHueRotate: methods.setHueRotate,
    setColorOverrides: methods.setColorOverrides,
    setColorCurve: methods.setColorCurve,
    setTargetBitmap: methods.setTargetBitmap,
    clearTargetBitmap: methods.clearTargetBitmap,
    setVariantParams: methods.setVariantParams,
    setBrightnessCurve: methods.setBrightnessCurve,
    setFlickerCurve: methods.setFlickerCurve,
    setPhaseFunc: methods.setPhaseFunc,
    setCharsetFunc: methods.setCharsetFunc,
    setPalettes: methods.setPalettes,
    setTransitionAlpha: methods.setTransitionAlpha,
    setFlickerSpeed: methods.setFlickerSpeed,
    setTargetFPS: methods.setTargetFPS,
    setDensity: methods.setDensity,
    setRenderScale: methods.setRenderScale,
    getRenderScale: methods.getRenderScale,
    setEasing: methods.setEasing,
    getEasing: methods.getEasing,
    getFPS: methods.getFPS,
    getTransitionAlpha: methods.getTransitionAlpha,
    getDiagnostics: methods.getDiagnostics,
    getClickBurstState: methods.getClickBurstState,
    getTargetState: methods.getTargetState,
    getOptions: methods.getOptions,
    serialize: methods.serialize,
  };

  // ============ 10. Boot ============
  buildGrid();
  state.rafId = requestAnimationFrame((ts) => draw(ts));

  if (state.options.onReady) state.options.onReady(instance);

  // 关联 wrapper → instance(供 MatrixRain.destroyAll 查找)
  if (state.wrapper) {
    (
      state.wrapper as unknown as { __matrixRainInstance: MatrixRainInstance }
    ).__matrixRainInstance = instance;
  }

  // 调试钩
  if (typeof window !== 'undefined') {
    __ensureDebugHook();
    const di = instance as DebugInstance;
    di.__debugId = __debugNextId++;
    di.__debugTheme = state.currentThemeName;
    di.__debugVariant = state.variant;
    __debugInstances.add(di);
  }

  // 销毁时从 debug set 移除
  const origDestroy = instance.destroy;
  instance.destroy = () => {
    origDestroy();
    if (typeof window !== 'undefined') {
      __debugInstances.delete(instance as DebugInstance);
    }
  };

  return instance;
}

// ==================== 静态方法 ====================

/**
 * 工厂:从 snapshot 还原一个实例(SSR hydration / 持久化)
 * @example
 *   const json = rain.serialize();
 *   // ... 跨页面 / 跨会话 ...
 *   const rain2 = matrixRain.fromSnapshot(json);
 */
(matrixRain as unknown as { fromSnapshot: unknown }).fromSnapshot = (
  json: string | MatrixRainSnapshot,
  options?: { canvas?: HTMLCanvasElement; container?: HTMLElement }
): MatrixRainInstance => {
  let snap: MatrixRainSnapshot;
  if (typeof json === 'string') {
    snap = JSON.parse(json);
  } else {
    snap = json;
  }
  if (snap.v !== 1) throw new Error(`[matrix-rain] unsupported snapshot version: ${snap.v}`);
  const opts: MatrixRainOptions = { ...snap.options, ...(options || {}) };
  return matrixRain(opts);
};

// 注:`detect()` 已迁移到 src/index.ts 的 MatrixRain 命名空间(`MatrixRain.detect()`),
// 涵盖更完整的 9 字段(UA 浏览器型号 / 视口 4 档 / DPR),此处不再重复导出。
