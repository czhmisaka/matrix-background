/**
 * @xietuier/matrix-rain · 实例 setter 集合
 *
 * 之前 ~30 个 setter 全部内联在 matrixRain() 闭包内(约 600 行),
 * 每个 setter 都对 closure 私有变量进行写操作,无法在 module 间共享。
 *
 * 本文件把所有 setter 抽到 createSetters(state, hooks) 工厂,
 * 行为 100% 等价于原 instance 对象上的 setter。
 * setters 通过:
 *   1. state 字段读/写(可变状态)
 *   2. hooks 调 orchestrator 的回调(buildGrid / applyTheme / fireOnTargetFinish / ...)
 *
 * hooks 是 setters 与 orchestrator 之间的解耦层:
 *   setters 不知道 draw / buildGrid 的实现细节,只触发"需要重算"的信号
 *   orchestrator 持有 hooks 的真实实现,在 setEngineHooks 时注入
 */

import type {
  MatrixRainInstance,
  ThemeName,
  ThemeParams,
  VariantParams,
  ColorOverrides,
  Palette,
  CursorOption,
} from '../../types';
import { compileUserFunction } from '../core';
import { MatrixRainState, MatrixRainHooks } from './state';
import { computeTargetOrigin } from './draw-helpers';

// ==================== 工厂 ====================

/**
 * 创建 instance 公开 API 上所有 setter + getter
 *
 * @param state 共享状态
 * @param hooks orchestrator 注入的回调
 * @returns Partial<MatrixRainInstance> 包含 destroy/pause/resume + 30 个 setter + getter
 *          调用方会把它 spread 到最终 instance 对象上
 */
export const createSetters = (
  state: MatrixRainState,
  hooks: MatrixRainHooks
): Pick<
  MatrixRainInstance,
  | 'destroy'
  | 'pause'
  | 'resume'
  | 'setTheme'
  | 'setThemeParams'
  | 'setColdThemeParams'
  | 'setWarmThemeParams'
  | 'setHueRotate'
  | 'setColorOverrides'
  | 'setColorCurve'
  | 'setTargetBitmap'
  | 'clearTargetBitmap'
  | 'setVariantParams'
  | 'setBrightnessCurve'
  | 'setFlickerCurve'
  | 'setPhaseFunc'
  | 'setCharsetFunc'
  | 'setPalettes'
  | 'setTransitionAlpha'
  | 'setFlickerSpeed'
  | 'setTargetFPS'
  | 'setDensity'
  | 'setRenderScale'
  | 'getRenderScale'
  | 'getFPS'
  | 'getTransitionAlpha'
  | 'getDiagnostics'
  | 'getClickBurstState'
  | 'getTargetState'
  | 'getOptions'
  | 'serialize'
> => {
  // ============ destroy / pause / resume ============
  const destroy = (): void => {
    if (state.isDestroyed) return;
    state.isDestroyed = true;
    if (state.rafId !== null) cancelAnimationFrame(state.rafId);
    if (state.resizeTimer !== null) clearTimeout(state.resizeTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', hooks.onResize);
    }
    if (state.ro) state.ro.disconnect();
    state.canvas.removeEventListener('click', hooks.onCanvasClick);
    if (state.wrapper) state.wrapper.remove();
    // 用户传入的 canvas 不删 —— 只解除事件监听(已经做了)
    // 误删会导致消费者(Vue/React 等)重建实例时丢失原 canvas 节点
  };

  const pause = (): void => {
    state.isPaused = true;
  };

  const resume = (): void => {
    if (state.isPaused && !state.isDestroyed) {
      state.isPaused = false;
      // 防止 pause 期间累积的 dt 引发 phase 跳跃
      state.lastFrameTime = typeof performance !== 'undefined' ? performance.now() : 0;
      state.rafId = requestAnimationFrame((ts) => hooks.draw(ts));
    }
  };

  // ============ 主题 ============
  const setTheme = (name: ThemeName, themeOptions?: { keepPaletteParams?: boolean }): void => {
    if (!hooks.applyTheme(name)) {
      return;
    }
    // 合并构造时传入的 options.themeParams(同 init 行为)
    if (state.options.themeParams) state.tp = { ...state.tp, ...state.options.themeParams };
    if (!themeOptions?.keepPaletteParams) {
      state.ctp = { ...state.tp };
      state.wtp = { ...state.tp };
    }
    // C1 主题切换 HSL 插值
    if (state.themeTransitionDur > 0) {
      state.themeTransition = {
        fromCold: { ...state.oldColdPalette },
        fromWarm: { ...state.oldWarmPalette },
        fromTp: { ...state.oldTp },
        fromCtp: { ...state.oldCtp },
        fromWtp: { ...state.oldWtp },
        start: state.wallTime,
        dur: state.themeTransitionDur,
      };
      // 立即 LUT 失效
      state.paletteLUT.setPalettes(state.coldPalette, state.warmPalette);
    } else {
      state.paletteLUT.setPalettes(state.coldPalette, state.warmPalette);
    }
    hooks.fireOnThemeChange(name);
  };

  const setThemeParams = (params: Partial<ThemeParams>): void => {
    if (state.themeTransitionDur > 0) {
      state.themeParamsTransition = {
        fromTp: { ...state.tp },
        fromCtp: { ...state.ctp },
        fromWtp: { ...state.wtp },
        start: state.wallTime,
        dur: state.themeTransitionDur,
      };
    }
    state.tp = { ...state.tp, ...params };
  };

  const setColdThemeParams = (params: Partial<ThemeParams>): void => {
    if (state.themeTransitionDur > 0) {
      state.themeParamsTransition = {
        fromTp: { ...state.tp },
        fromCtp: { ...state.ctp },
        fromWtp: { ...state.wtp },
        start: state.wallTime,
        dur: state.themeTransitionDur,
      };
    }
    state.ctp = { ...state.ctp, ...params };
  };

  const setWarmThemeParams = (params: Partial<ThemeParams>): void => {
    if (state.themeTransitionDur > 0) {
      state.themeParamsTransition = {
        fromTp: { ...state.tp },
        fromCtp: { ...state.ctp },
        fromWtp: { ...state.wtp },
        start: state.wallTime,
        dur: state.themeTransitionDur,
      };
    }
    state.wtp = { ...state.wtp, ...params };
  };

  // ============ 动态调参 ============
  const setHueRotate = (speed: number, amount?: number): void => {
    state.hueRotateSpeed = speed;
    if (amount !== undefined) state.hueRotateAmount = amount;
  };

  const setColorOverrides = (overrides: ColorOverrides | null): void => {
    state.colorOverrides = overrides;
    state.colorOverrideFn = typeof overrides === 'function' ? overrides : null;
  };

  const setColorCurve = (code: string | null): void => {
    if (!code) {
      state.colorCurve = null;
      state.diagnostics.colorCurve = undefined;
      return;
    }
    try {
      state.colorCurve = compileUserFunction(code);
      state.diagnostics.colorCurve = undefined;
    } catch (e) {
      state.diagnostics.colorCurve = e instanceof Error ? e.message : String(e);
      state.colorCurve = null;
    }
  };

  // ============ 目标位图 ============
  const setTargetBitmap = (
    bitmap: Float32Array | { cols: number; rows: number; data: Float32Array } | null,
    opts?: {
      fadeIn?: number;
      hold?: number;
      fadeOut?: number;
      chaos?: number;
      anchor?: 'topLeft' | 'center' | 'topRight' | 'bottomLeft' | 'bottomRight';
      motion?: 'static' | 'drift' | 'bounce' | 'float';
      motionSpeed?: number;
      phase?: 'fade' | 'noise-converge';
      noiseDuration?: number;
      convergeDuration?: number;
      lockOrder?: 'random' | 'topdown' | 'bottomup' | 'center' | 'edge' | 'leftright' | 'rightleft';
      lockStability?: number;
      fitMode?: 'contain' | 'cover' | 'actual' | 'auto';
      phaseTransitionDuration?: number;
    }
  ): void => {
    // **兼容**两种传参:直接 Float32Array 或 BitmapSource 包装对象
    const data: Float32Array | null =
      bitmap === null ? null : bitmap instanceof Float32Array ? bitmap : bitmap.data;
    // 输入校验(audit-security §5 P1 S-03)
    const MAX_BITMAP_CELLS = 1_000_000;
    if (data !== null) {
      if (!(data instanceof Float32Array)) {
        throw new Error(
          'setTargetBitmap: bitmap 必须是 Float32Array(或 { cols, rows, data: Float32Array } 包装)'
        );
      }
      if (data.length > MAX_BITMAP_CELLS) {
        throw new Error(
          `setTargetBitmap: bitmap 单元数 ${data.length} 超过上限 ${MAX_BITMAP_CELLS}(防止 OOM)`
        );
      }
      if (bitmap !== null && typeof bitmap === 'object' && !(bitmap instanceof Float32Array)) {
        const wrapCols = (bitmap as { cols: number }).cols;
        const wrapRows = (bitmap as { rows: number }).rows;
        if (!Number.isInteger(wrapCols) || wrapCols <= 0) {
          throw new Error(`setTargetBitmap: cols 必须是正整数(收到 ${wrapCols})`);
        }
        if (!Number.isInteger(wrapRows) || wrapRows <= 0) {
          throw new Error(`setTargetBitmap: rows 必须是正整数(收到 ${wrapRows})`);
        }
        if (wrapCols * wrapRows !== data.length) {
          throw new Error(
            `setTargetBitmap: 形状不一致 cols*rows=${wrapCols * wrapRows} ≠ data.length=${data.length}`
          );
        }
      }
    }
    // B1/B2 阶段切换 crossfade
    const prevPhase = state.targetPhase;
    const prevActive = state.targetActive;
    const prevBitmap = state.targetBitmap;
    if (
      data &&
      prevActive &&
      prevBitmap !== null &&
      opts?.phase !== undefined &&
      opts.phase !== prevPhase
    ) {
      const dur = opts.phaseTransitionDuration ?? state.phaseTransitionDur;
      if (dur > 0) {
        state.oldTargetSnapshot = {
          bitmap: prevBitmap,
          cols: state.targetCols,
          rows: state.targetRows,
          anchor: state.targetAnchor,
          motion: state.targetMotion,
          motionSpeed: state.targetMotionSpeed,
          fadeIn: state.targetFadeIn,
          hold: state.targetHold,
          fadeOut: state.targetFadeOut,
          chaos: state.targetChaos,
          phase: prevPhase,
          startTime: state.targetStartTime,
          active: true,
          noiseDuration: state.targetNoiseDuration,
          convergeDuration: state.targetConvergeDuration,
          lockOrder: state.targetLockOrder,
          lockStability: state.targetLockStability,
        };
        state.phaseTransition = {
          fromPhase: prevPhase,
          start: state.wallTime,
          dur,
        };
      }
    }
    state.targetBitmap = data;
    state.targetFinishFired = false;
    if (bitmap && typeof bitmap === 'object' && !(bitmap instanceof Float32Array)) {
      state.targetCols = bitmap.cols;
      state.targetRows = bitmap.rows;
    } else if (data) {
      if (state.targetCols === 0) state.targetCols = state.r;
      if (state.targetRows === 0) state.targetRows = state.i;
    }
    // A: fitMode 缩放
    if (data && state.targetCols > 0 && state.targetRows > 0) {
      hooks.applyTargetFitMode(opts?.fitMode);
    }
    if (opts?.fadeIn !== undefined) state.targetFadeIn = opts.fadeIn;
    if (opts?.hold !== undefined) state.targetHold = opts.hold;
    if (opts?.fadeOut !== undefined) state.targetFadeOut = Math.max(0.001, opts.fadeOut);
    if (opts?.chaos !== undefined) state.targetChaos = Math.max(0, Math.min(1, opts.chaos));
    if (opts?.anchor !== undefined) state.targetAnchor = opts.anchor;
    if (opts?.motion !== undefined) state.targetMotion = opts.motion;
    if (opts?.motionSpeed !== undefined) state.targetMotionSpeed = opts.motionSpeed;
    if (opts?.phase !== undefined) state.targetPhase = opts.phase;
    if (opts?.noiseDuration !== undefined)
      state.targetNoiseDuration = Math.max(0, opts.noiseDuration);
    if (opts?.convergeDuration !== undefined)
      state.targetConvergeDuration = Math.max(0.001, opts.convergeDuration);
    if (opts?.lockOrder !== undefined) state.targetLockOrder = opts.lockOrder;
    if (opts?.lockStability !== undefined)
      state.targetLockStability = Math.max(0, Math.min(1, opts.lockStability));
    if (data) {
      state.targetStartFrame = state.f;
      state.targetStartTime = state.wallTime;
      state.targetActive = true;
      hooks.resetAllCellLockState();
      if (state.targetPhase === 'noise-converge') {
        hooks.recomputeTargetLockTimes();
      }
    } else {
      state.targetActive = false;
    }
  };

  const clearTargetBitmap = (): void => {
    state.targetBitmap = null;
    state.targetActive = false;
    hooks.resetAllCellLockState();
    if (!state.targetFinishFired) {
      state.targetFinishFired = true;
      hooks.fireOnTargetFinish();
    }
  };

  // ============ 变体参数 ============
  const setVariantParams = (params: Partial<VariantParams>): void => {
    if (state.variantTransitionDur > 0) {
      state.variantTransition = {
        fromVp: { ...state.vp },
        start: state.wallTime,
        dur: state.variantTransitionDur,
      };
    }
    state.vp = { ...state.vp, ...params };
  };

  // ============ userFuncs ============
  const setBrightnessCurve = (code: string | null): void => {
    if (!code) {
      state.userFuncs.brightnessCurve = null;
      state.diagnostics.brightnessCurve = undefined;
      return;
    }
    try {
      state.userFuncs.brightnessCurve = compileUserFunction(code);
      state.diagnostics.brightnessCurve = undefined;
    } catch (e) {
      state.diagnostics.brightnessCurve = e instanceof Error ? e.message : String(e);
      state.userFuncs.brightnessCurve = null;
    }
  };

  const setFlickerCurve = (code: string | null): void => {
    if (!code) {
      state.userFuncs.flickerCurve = null;
      state.diagnostics.flickerCurve = undefined;
      return;
    }
    try {
      state.userFuncs.flickerCurve = compileUserFunction(code);
      state.diagnostics.flickerCurve = undefined;
    } catch (e) {
      state.diagnostics.flickerCurve = e instanceof Error ? e.message : String(e);
      state.userFuncs.flickerCurve = null;
    }
  };

  const setPhaseFunc = (code: string | null): void => {
    if (!code) {
      state.userFuncs.phaseFunc = null;
      state.diagnostics.phaseFunc = undefined;
      return;
    }
    try {
      state.userFuncs.phaseFunc = compileUserFunction(code);
      state.diagnostics.phaseFunc = undefined;
    } catch (e) {
      state.diagnostics.phaseFunc = e instanceof Error ? e.message : String(e);
      state.userFuncs.phaseFunc = null;
    }
  };

  const setCharsetFunc = (code: string | null): void => {
    if (!code) {
      state.userFuncs.charsetFunc = null;
      state.diagnostics.charsetFunc = undefined;
      return;
    }
    try {
      state.userFuncs.charsetFunc = compileUserFunction(code);
      state.diagnostics.charsetFunc = undefined;
    } catch (e) {
      state.diagnostics.charsetFunc = e instanceof Error ? e.message : String(e);
      state.userFuncs.charsetFunc = null;
    }
  };

  // ============ 调色板 ============
  const setPalettes = (cold: Palette, warm: Palette): void => {
    if (state.themeTransitionDur > 0) {
      state.oldColdPalette = { ...state.coldPalette };
      state.oldWarmPalette = { ...state.warmPalette };
      state.themeTransition = {
        fromCold: { ...state.oldColdPalette },
        fromWarm: { ...state.oldWarmPalette },
        fromTp: { ...state.tp },
        fromCtp: { ...state.ctp },
        fromWtp: { ...state.wtp },
        start: state.wallTime,
        dur: state.themeTransitionDur,
      };
    }
    state.coldPalette = cold;
    state.warmPalette = warm;
    state.paletteLUT.setPalettes(state.coldPalette, state.warmPalette);
  };

  // ============ 过渡 alpha ============
  const setTransitionAlpha = (alpha: number, dur?: number): void => {
    const a = Math.max(0, Math.min(1, alpha));
    if (dur !== undefined && dur > 0) {
      state.transitionAlphaAnim = {
        start: state.wallTime,
        dur,
        from: state.transitionAlpha,
        to: a,
      };
    } else {
      state.transitionAlpha = a;
      state.transitionAlphaAnim = null;
    }
  };

  // ============ 性能开关 ============
  const setFlickerSpeed = (speed: number): void => {
    state.cfg = { ...state.cfg, flickerSpeed: Math.max(0, speed) };
  };

  const setTargetFPS = (fps: number): void => {
    state.targetFPS = Math.max(0, fps);
    state.fpsAccumMs = 0;
    state.lastFrameTime = typeof performance !== 'undefined' ? performance.now() : 0;
  };

  const setDensity = (fontSize: number): void => {
    state.cfg = { ...state.cfg, fontSize };
    hooks.buildGrid();
  };

  /**
   * 动态更新局部子格渲染倍率(0.3.0+)· 不触发 buildGrid
   * - 同步写 4 处:cfg / options / renderScaleUser / renderScaleEffective
   * - 'auto' 透传;number 钳到 [1, 16] 整数(向下取整)
   * - NaN / 负数 / 0 → 1
   * - 'auto' 模式:基于当前 targetActive 立即解析(tickRAF 也可)
   *   - targetActive && targetBitmap → 2
   *   - 否则 → 1
   */
  const setRenderScale = (s: number | 'auto'): void => {
    const normalized: number | 'auto' =
      s === 'auto' ? 'auto' : Math.min(16, Math.max(1, Math.floor(Number(s) || 1)));
    state.cfg = { ...state.cfg, renderScale: normalized };
    state.options = { ...state.options, renderScale: normalized };
    state.renderScaleUser = normalized;
    // 立即更新 effective(同步而非下一帧)
    if (normalized === 'auto') {
      state.renderScaleEffective = state.targetActive && state.targetBitmap !== null ? 2 : 1;
    } else {
      state.renderScaleEffective = normalized;
    }
  };

  /**
   * 读取当前 effective renderScale(总 >= 1 的整数)
   * - 用户传 number → 返回同值(已 normalize)
   * - 用户传 'auto' → 返回当前解析值
   *   (位图未激活时返回 1,激活时返回 2)
   */
  const getRenderScale = (): number => state.renderScaleEffective;

  // ============ Getters ============
  const getFPS = (): number => Math.round(state.fps);

  const getTransitionAlpha = (): number => state.transitionAlpha;

  const getDiagnostics = (): {
    brightnessCurve?: string;
    flickerCurve?: string;
    phaseFunc?: string;
    charsetFunc?: string;
    colorCurve?: string;
  } => ({ ...state.diagnostics });

  const getClickBurstState = (): {
    active: boolean;
    x: number;
    y: number;
    t: number;
  } => ({
    active: state.clickBurstActive,
    x: state.clickBurstX,
    y: state.clickBurstY,
    t: state.clickBurstStart,
  });

  /**
   * 读取目标位图状态机当前快照(用于 demo 调试 + 单元测试)
   */
  const getTargetState = (): {
    active: boolean;
    phase: 'idle' | 'noise' | 'converge' | 'hold' | 'dissolve';
    elapsed: number;
    lockedCount: number;
    unlockedCount: number;
    totalTargets: number;
    lockOrder: string;
    targetPhase: 'fade' | 'noise-converge';
    noiseDuration: number;
    convergeDuration: number;
    lockStability: number;
    targetDissolveStartTime: number;
    transitionAlpha: number;
    phaseTransition: {
      fromPhase: 'fade' | 'noise-converge';
      progress: number;
      dur: number;
    } | null;
    themeTransition: { progress: number; dur: number } | null;
    themeParamsTransition: { progress: number; dur: number } | null;
    variantTransition: { progress: number; dur: number } | null;
  } => {
    let lockedCount = 0;
    let totalTargets = 0;
    if (state.targetBitmap && state.targetActive) {
      // 调 computeTargetOrigin(自动用每帧缓存)
      const { ox, oy } = computeTargetOrigin(state);
      for (let s = 0; s < state.i; s++) {
        for (let h = 0; h < state.r; h++) {
          const bx = h - ox,
            by = s - oy;
          if (bx >= 0 && bx < state.targetCols && by >= 0 && by < state.targetRows) {
            const g = state.targetBitmap[by * state.targetCols + bx];
            if (g > 0) {
              totalTargets++;
              if (state.b[s][h].locked) lockedCount++;
            }
          }
        }
      }
    }
    const elapsed = state.wallTime - state.targetStartTime;
    const EPS = 1e-9;
    let phase: 'idle' | 'noise' | 'converge' | 'hold' | 'dissolve' = 'idle';
    if (state.targetBitmap && state.targetActive && state.targetPhase === 'noise-converge') {
      if (elapsed + EPS < state.targetNoiseDuration) phase = 'noise';
      else if (elapsed + EPS < state.targetNoiseDuration + state.targetConvergeDuration)
        phase = 'converge';
      else if (state.targetDissolveStartTime < 0) phase = 'hold';
      else phase = 'dissolve';
    }
    return {
      active: !!(state.targetBitmap && state.targetActive),
      phase,
      elapsed,
      lockedCount,
      unlockedCount: totalTargets - lockedCount,
      totalTargets,
      lockOrder: state.targetLockOrder,
      targetPhase: state.targetPhase,
      noiseDuration: state.targetNoiseDuration,
      convergeDuration: state.targetConvergeDuration,
      lockStability: state.targetLockStability,
      targetDissolveStartTime: state.targetDissolveStartTime,
      transitionAlpha: state.transitionAlpha,
      phaseTransition: state.phaseTransition
        ? {
            fromPhase: state.phaseTransition.fromPhase,
            progress: Math.min(
              1,
              Math.max(
                0,
                (state.wallTime - state.phaseTransition.start) / state.phaseTransition.dur
              )
            ),
            dur: state.phaseTransition.dur,
          }
        : null,
      themeTransition: state.themeTransition
        ? {
            progress: Math.min(
              1,
              Math.max(
                0,
                (state.wallTime - state.themeTransition.start) / state.themeTransition.dur
              )
            ),
            dur: state.themeTransition.dur,
          }
        : null,
      themeParamsTransition: state.themeParamsTransition
        ? {
            progress: Math.min(
              1,
              Math.max(
                0,
                (state.wallTime - state.themeParamsTransition.start) /
                  state.themeParamsTransition.dur
              )
            ),
            dur: state.themeParamsTransition.dur,
          }
        : null,
      variantTransition: state.variantTransition
        ? {
            progress: Math.min(
              1,
              Math.max(
                0,
                (state.wallTime - state.variantTransition.start) / state.variantTransition.dur
              )
            ),
            dur: state.variantTransition.dur,
          }
        : null,
    };
  };

  /**
   * 读取当前生效配置快照
   */
  const getOptions = () => ({
    fontSize: state.cfg.fontSize,
    trailAlpha: state.cfg.trailAlpha,
    maxDPR: state.cfg.maxDPR,
    charset: state.charset,
    coldPalette: state.coldPalette,
    warmPalette: state.warmPalette,
    lightCenter: { ...state.lightCenter },
    driftSpeed: { ...state.driftSpeed },
    warmthRadius: state.cfg.warmthRadius,
    warmthLerp: state.cfg.warmthLerp,
    flickerRates: { ...state.flicker },
    flickerSpeed: state.cfg.flickerSpeed,
    targetFPS: state.targetFPS,
    sparkProbability: state.cfg.sparkProbability,
    theme: state.mixedFrom ?? state.currentThemeName,
    themeParams: { ...state.tp },
    coldThemeParams: { ...state.ctp },
    warmThemeParams: { ...state.wtp },
    hueRotateSpeed: state.hueRotateSpeed,
    hueRotateAmount: state.hueRotateAmount,
    colorOverrides: state.colorOverrides ?? undefined,
    variant: state.variant,
    variantParams: { ...state.vp },
    targetAnchor: state.targetAnchor,
    targetMotion: state.targetMotion,
    targetMotionSpeed: state.targetMotionSpeed,
    targetFadeIn: state.targetFadeIn,
    targetHold: state.targetHold,
    targetFadeOut: state.targetFadeOut,
    targetChaos: state.targetChaos,
    targetPhase: state.targetPhase,
    targetNoiseDuration: state.targetNoiseDuration,
    targetConvergeDuration: state.targetConvergeDuration,
    targetLockOrder: state.targetLockOrder,
    targetLockStability: state.targetLockStability,
    noiseFadeInDuration: state.noiseFadeInDur,
    phaseTransitionDuration: state.phaseTransitionDur,
    cellLockEaseDuration: state.cellLockEaseDur,
    themeTransitionDuration: state.themeTransitionDur,
    variantTransitionDuration: state.variantTransitionDur,
    renderScale: state.cfg.renderScale,
    clickBurst: state.clickBurstCfg.radius > 0 ? { ...state.clickBurstCfg } : false,
    cursor: (state.canvas.style.cursor || undefined) as CursorOption,
  });

  const serialize = (): string => {
    const snapshot = {
      v: 1 as const,
      options: getOptions(),
      theme: state.currentThemeName,
      mixedFrom: state.mixedFrom,
    };
    return JSON.stringify(snapshot);
  };

  return {
    destroy,
    pause,
    resume,
    setTheme,
    setThemeParams,
    setColdThemeParams,
    setWarmThemeParams,
    setHueRotate,
    setColorOverrides,
    setColorCurve,
    setTargetBitmap,
    clearTargetBitmap,
    setVariantParams,
    setBrightnessCurve,
    setFlickerCurve,
    setPhaseFunc,
    setCharsetFunc,
    setPalettes,
    setTransitionAlpha,
    setFlickerSpeed,
    setTargetFPS,
    setDensity,
    setRenderScale,
    getRenderScale,
    getFPS,
    getTransitionAlpha,
    getDiagnostics,
    getClickBurstState,
    getTargetState,
    getOptions,
    serialize,
  };
};
