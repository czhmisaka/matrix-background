/**
 * @xietuier/matrix-rain · matrixRain() closure 状态容器
 *
 * 之前所有 closure 私有变量集中在 `matrixRain()` 函数内(1894 行),无法在 module 间共享。
 * 本文件把所有可变状态抽到单一对象 `MatrixRainState`,orchestrator 持有一份引用,
 * 所有 helper / setter / draw 函数通过 state.X 读写。closure 只是 state 的工厂。
 *
 * 设计要点:
 * - 状态对象是单一可信源(SSOT),避免 closure 隐式捕获
 * - 不变配置(transition 时长 / fixedTimeStep)也放 state,便于 helper 访问
 * - hooks 字段(orchestrator 注入的回调)在 createMatrixRainState 之后由 orchestrator 写入
 *
 * 拆分:draw-helpers.ts 读 state 算颜色,setters.ts 写 state 响应用户调用,
 * engine.ts 只剩 rAF 主循环 + 调度 + 静态方法。
 */

import type {
  MatrixRainOptions,
  Palette,
  ThemeName,
  ThemeParams,
  VariantName,
  VariantParams,
  ColorOverrides,
  ColorOverrideFn,
  ClickBurstOptions,
  HSLPalette,
  EasingMode,
} from '../../types';
import {
  themes,
  PaletteLUT,
  compileUserFunction,
  ease,
  SAFE_GLOBALS,
  VARIANT_DEFAULTS,
} from '../core';
import type { SandboxContext } from '../curves/sandbox';

// ==================== 内部类型 ====================

/** userFunc 签名:每帧可调用的 sandbox 函数 */
export type UserFunc = (ctx: SandboxContext) => number | string;

/** 4 个 userFunc 槽 */
export interface UserFuncs {
  brightnessCurve: UserFunc | null;
  flickerCurve: UserFunc | null;
  phaseFunc: UserFunc | null;
  charsetFunc: UserFunc | null;
}

/** 编译错误缓存(getDiagnostics 返回) */
export interface Diagnostics {
  brightnessCurve?: string;
  flickerCurve?: string;
  phaseFunc?: string;
  charsetFunc?: string;
  colorCurve?: string;
}

/** 阶段切换 crossfade 快照 */
export type PhaseName = 'fade' | 'noise-converge';

export interface TargetSnapshot {
  bitmap: Float32Array | null;
  cols: number;
  rows: number;
  anchor: 'topLeft' | 'center' | 'topRight' | 'bottomLeft' | 'bottomRight';
  motion: 'static' | 'drift' | 'bounce' | 'float';
  motionSpeed: number;
  fadeIn: number;
  hold: number;
  fadeOut: number;
  chaos: number;
  phase: PhaseName;
  startTime: number;
  active: boolean;
  noiseDuration: number;
  convergeDuration: number;
  lockOrder: 'random' | 'topdown' | 'bottomup' | 'center' | 'edge' | 'leftright' | 'rightleft';
  lockStability: number;
}

/** Cell 网格单元(每帧被 phase/char/warmth 大量更新) */
export interface Cell {
  ch: number;
  bright: number;
  phase: number;
  warmth: number;
  // 雪崩变体专用
  speed?: number;
  yPos?: number;
  headBright?: number;
  // 噪声→收敛模式专用
  locked?: boolean;
  lockTime?: number;
  unlockTime?: number;
  lockedCh?: number;
  // 过渡系统(A3/A4 per-cell ease)
  lockEaseStart?: number;
  unlockEaseStart?: number;
  lockEaseFromL?: number;
  lockEaseToL?: number;
  unlockEaseFromL?: number;
  unlockEaseToL?: number;
}

// ==================== 可变字段类型(强约束,避免 any)====================

export type Anchor = 'topLeft' | 'center' | 'topRight' | 'bottomLeft' | 'bottomRight';

export type Motion = 'static' | 'drift' | 'bounce' | 'float';

export type FitMode = 'contain' | 'cover' | 'actual' | 'auto';

export type LockOrder =
  | 'random'
  | 'topdown'
  | 'bottomup'
  | 'center'
  | 'edge'
  | 'leftright'
  | 'rightleft';

// ==================== 数字选项 DEFAULTS(与原 engine.ts 一致)====================

const DEFAULTS = {
  fontSize: 6,
  trailAlpha: 0.18,
  maxDPR: 2,
  warmthRadius: 0.6,
  warmthLerp: 0.04,
  sparkProbability: 0.003,
  targetFPS: 0,
  noiseFadeInDuration: 0.2,
  phaseTransitionDuration: 0.15,
  cellLockEaseDuration: 0.12,
  themeTransitionDuration: 0.4,
  variantTransitionDuration: 0.3,
  renderScale: 1 as number | 'auto',
  easing: 'smooth' as EasingMode,
} as const;

const FLICKER_SPEED_DEFAULT = 1;
const FIXED_DT = 1 / 60;

const DEFAULT_FLICKER = { high: 0.7, mid: 0.4, low: 0.15, dark: 0.04 };
const FIT_THRESHOLD = 0.95;

// ==================== 主题解析(与原 engine.ts resolveTheme 行为一致)====================

const resolveTheme = (
  themeSpec: ThemeName | { coldFrom: ThemeName; warmFrom: ThemeName } | undefined,
  coldFrom: ThemeName | undefined,
  warmFrom: ThemeName | undefined
): {
  cold: Palette;
  warm: Palette;
  tp: ThemeParams;
  effectiveName: ThemeName;
  mixedFrom?: { coldFrom: ThemeName; warmFrom: ThemeName };
} => {
  if (themeSpec && typeof themeSpec === 'object') {
    const { coldFrom: c, warmFrom: w } = themeSpec;
    const coldT = themes[c]();
    const warmT = themes[w]();
    return {
      cold: coldT.cold,
      warm: warmT.warm,
      tp: { ...coldT } as ThemeParams,
      effectiveName: c,
      mixedFrom: { coldFrom: c, warmFrom: w },
    };
  }
  if (coldFrom || warmFrom) {
    const c = coldFrom ?? 'silicon-valley';
    const w = warmFrom ?? 'silicon-valley';
    const coldT = themes[c]();
    const warmT = themes[w]();
    return {
      cold: coldT.cold,
      warm: warmT.warm,
      tp: { ...coldT } as ThemeParams,
      effectiveName: c,
      mixedFrom: coldFrom && warmFrom ? { coldFrom: c, warmFrom: w } : undefined,
    };
  }
  const name = (themeSpec as ThemeName | undefined) ?? 'silicon-valley';
  const t = themes[name]();
  return {
    cold: t.cold,
    warm: t.warm,
    tp: {
      brightness: t.brightness ?? 1,
      chroma: t.chroma ?? 1,
      hueShift: t.hueShift ?? 0,
      saturationShift: t.saturationShift ?? 0,
      lightnessShift: t.lightnessShift ?? 0,
      invertHue: t.invertHue ?? 0,
      contrast: t.contrast ?? 1,
    },
    effectiveName: name,
  };
};

// ==================== 沙箱工具(sandboxNoise/sandboxClamp/sandboxLerp)====================

const sandboxNoise = (x: number): number => {
  const n = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return n - Math.floor(n);
};
const sandboxClamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const sandboxLerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ==================== State 主体 ====================

/**
 * 单个 matrixRain() 实例的全部状态。
 * Orchestrator 持有一份引用,所有 helper / setter 通过 `state.X` 读写。
 */
export interface MatrixRainState {
  // ============ 配置(初始化时固化,运行时仅 flickerSpeed / fontSize 等可写)============
  /** 数字字段 + 运行时可改的字段(子集)。所有 setter 都通过这个 cfg 更新 */
  cfg: {
    fontSize: number;
    trailAlpha: number;
    maxDPR: number;
    warmthRadius: number;
    warmthLerp: number;
    sparkProbability: number;
    targetFPS: number;
    flickerSpeed?: number;
    /** 局部子格渲染倍率(0.3.0+)· 用户原值(number | 'auto') */
    renderScale: number | 'auto';
    /** 全局过渡曲线(0.4.0+)· 'smooth' | 'linear' */
    easing: EasingMode;
  };

  /**
   * renderScale 运行时状态(0.3.0+):
   * - `renderScaleUser`: 用户原值(number 已 normalize,或 'auto' 字符串)
   * - `renderScaleEffective`: 每帧由 resolveEffectiveRenderScale() 重算的数值
   *   默认 1;'auto' + targetActive 时为 2;'auto' + inactive 时回 1
   */
  renderScaleUser: number | 'auto';
  renderScaleEffective: number;
  /** 固定时间步长(SSR/测试用):dt 强制 1/60 */
  fixedTimeStep: boolean;
  /** 系统级 prefers-reduced-motion 探测 */
  prefersReducedMotion: boolean;
  /** 过渡时长(秒)—— 0 = 关闭对应过渡 */
  noiseFadeInDur: number;
  phaseTransitionDur: number;
  cellLockEaseDur: number;
  themeTransitionDur: number;
  variantTransitionDur: number;
  /** 1/60 用于 fixedTimeStep 模式 + lastDt 兜底 */
  FIXED_DT: number;

  // ============ 几何 ============
  /** viewport 宽(像素) */
  a: number;
  /** viewport 高(像素) */
  o: number;
  /** 网格列数 */
  r: number;
  /** 网格行数 */
  i: number;
  /** DPR 缩放系数 */
  n: number;
  /** 帧计数器 */
  f: number;
  /** 有效 fontSize(窄屏自适应) */
  ef: number;
  /** 网格:b[s][h] = Cell */
  b: Cell[][];

  // ============ 时间驱动 ============
  /** 上一帧时间戳(performance.now / rAF ts) */
  lastFrameTime: number;
  /** 累积墙钟(秒)· 用于 dt-based 动画 */
  wallTime: number;
  /** 上一帧 dt(秒) */
  lastDt: number;
  /** 当前 fps(0.5s 滑窗) */
  fps: number;
  /** fps 滑窗起点 */
  fpsWindowStart: number;
  /** fps 滑窗内帧数 */
  fpsWindowCount: number;
  /** FPS 节流累加器(targetFPS>0 时) */
  fpsAccumMs: number;
  /** 目标帧率(0 = 不限) */
  targetFPS: number;
  /** 当前 rAF 句柄(暂停/恢复用) */
  rafId: number | null;
  /** resize 防抖句柄 */
  resizeTimer: number | null;
  /** ResizeObserver 实例(canvas 尺寸变化监听) */
  ro: ResizeObserver | null;

  // ============ 主题(可写)============
  coldPalette: Palette;
  warmPalette: Palette;
  tp: ThemeParams;
  ctp: ThemeParams;
  wtp: ThemeParams;
  /** 主题切换时的"旧"快照(C1 主题过渡用) */
  oldColdPalette: HSLPalette;
  oldWarmPalette: HSLPalette;
  oldTp: ThemeParams;
  oldCtp: ThemeParams;
  oldWtp: ThemeParams;
  currentThemeName: ThemeName;
  mixedFrom?: { coldFrom: ThemeName; warmFrom: ThemeName };

  // ============ 变体 ============
  variant: VariantName;
  vp: VariantParams;
  /** 每帧由 variantTransition 插值填充;无过渡时 = vp */
  effectiveVp: VariantParams;

  // ============ Effective(每帧主题参数插值)============
  effectiveTp: ThemeParams;
  effectiveCtp: ThemeParams;
  effectiveWtp: ThemeParams;

  // ============ 动态色相 ============
  hueRotateSpeed: number;
  hueRotateAmount: number;
  /** wallTime 驱动 */
  dynamicHue: number;
  /** colorCurve userFunc 驱动(每帧重算) */
  dynamicColorHue: number;

  // ============ 过渡系统状态 ============
  /** E1:实例级软 alpha(0=全透明,1=全不透明) */
  transitionAlpha: number;
  transitionAlphaAnim: {
    start: number;
    dur: number;
    from: number;
    to: number;
    /** 0.4.0+ per-call easing 覆盖(未传 = undefined,使用全局 cfg.easing) */
    easing?: EasingMode;
  } | null;
  /** C1:主题切换 HSL 插值 */
  themeTransition: {
    fromCold: HSLPalette;
    fromWarm: HSLPalette;
    fromTp: ThemeParams;
    fromCtp: ThemeParams;
    fromWtp: ThemeParams;
    start: number;
    dur: number;
    /** 0.4.0+ per-call easing 覆盖 */
    easing?: EasingMode;
  } | null;
  /** C2:主题参数切换插值 */
  themeParamsTransition: {
    fromTp: ThemeParams;
    fromCtp: ThemeParams;
    fromWtp: ThemeParams;
    start: number;
    dur: number;
    /** 0.4.0+ per-call easing 覆盖 */
    easing?: EasingMode;
  } | null;
  /** D1:变体参数切换插值 */
  variantTransition: {
    fromVp: VariantParams;
    start: number;
    dur: number;
    /** 0.4.0+ per-call easing 覆盖 */
    easing?: EasingMode;
  } | null;
  /** B1/B2:阶段切换 crossfade */
  phaseTransition: {
    fromPhase: PhaseName;
    start: number;
    dur: number;
  } | null;
  /** B1/B2 跨阶段切换时,旧状态快照(预留接口) */
  oldTargetSnapshot: TargetSnapshot | null;

  // ============ userFuncs / diagnostics ============
  userFuncs: UserFuncs;
  diagnostics: Diagnostics;
  /** 颜色动态曲线(每帧调,返回度数值) */
  colorCurve: UserFunc | null;

  // ============ 颜色覆盖 ============
  colorOverrides: ColorOverrides | null;
  colorOverrideFn: ColorOverrideFn | null;

  // ============ 目标位图(noise-converge + fade)============
  targetBitmap: Float32Array | null;
  targetCols: number;
  targetRows: number;
  targetAnchor: Anchor;
  targetMotion: Motion;
  targetMotionSpeed: number;
  targetFadeIn: number;
  targetHold: number;
  targetFadeOut: number;
  targetChaos: number;
  targetFitMode: FitMode;
  targetPhase: PhaseName;
  targetNoiseDuration: number;
  targetConvergeDuration: number;
  targetLockOrder: LockOrder;
  targetLockStability: number;
  targetDissolveStartTime: number;
  targetStartFrame: number;
  targetStartTime: number;
  targetActive: boolean;
  targetFinishFired: boolean;

  // ============ anchor 缓存(避免每 cell 重算)============
  __cachedAnchorOx: number;
  __cachedAnchorOy: number;
  __cachedAnchorValid: boolean;

  // ============ clickBurst ============
  clickBurstActive: boolean;
  clickBurstX: number;
  clickBurstY: number;
  clickBurstStart: number;
  clickBurstCfg: Required<ClickBurstOptions>;

  // ============ Charset + flicker + light ============
  charset: string;
  flicker: { high: number; mid: number; low: number; dark: number };
  lightCenter: { x: number; y: number };
  driftSpeed: { x: number; y: number };

  // ============ 生命周期 ============
  isPaused: boolean;
  isDestroyed: boolean;
  /** onFrame 30Hz 节流 */
  lastOnFrameTs: number;

  // ============ DOM ============
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  /** 渲染器(0.4.0+ · 替代原 state.ctx)
   *  - canvas2d 模式: Canvas2DRenderer 实例,内部持 ctx2d
   *  - webgl 模式:   WebGLRenderer 实例(Phase 2B)
   *  - webgpu 模式:  WebGPURenderer 实例(Phase 4)
   * 边界规则: renderer 只读 state, 不写 state
   */
  renderer: import('../renderer/types').MatrixRainRenderer;
  wrapper: HTMLDivElement | null;

  // ============ Palette LUT(性能优化)============
  paletteLUT: PaletteLUT;

  // ============ 沙箱 __frameCtx(userFunc 调用上下文)============
  __frameCtx: SandboxContext;

  // ============ 选项原始引用(setter 用)============
  options: MatrixRainOptions;

  // ============ Hooks(orchestrator 注入的回调)============
  // 这些函数引用 orchestrator 内的 closure(setter 内部需要触发 buildGrid 等)
  hooks: MatrixRainHooks;
}

/**
 * Orchestrator 必须注入的回调 · setters 内部用
 *
 * 不放在 hooks 中直接调用的:draw / buildGrid / 各种 internal
 * 而是 orchestrator 把它们写进 state.hooks,在 setters/draw-helpers 里调 state.hooks.X()
 */
export interface MatrixRainHooks {
  draw: (rafTs?: number) => void;
  buildGrid: () => void;
  applyTheme: (name: ThemeName) => boolean;
  applyTargetFitMode: (overrideMode?: FitMode) => void;
  recomputeTargetLockTimes: () => void;
  resetAllCellLockState: () => void;
  updateTargetBitmapPhaseGlobal: () => void;
  applyTargetBitmapPhase: (
    c: Cell,
    h: number,
    s: number,
    l: number,
    elapsedOpt?: number,
    isSub?: boolean
  ) => { l: number; ch: number; skipCharset: boolean } | null;
  syncFrameCtxSize: () => void;
  fireOnFrame: () => void;
  fireOnResize: () => void;
  fireOnThemeChange: (newTheme: ThemeName) => void;
  fireOnTargetFinish: () => void;
  onResize: () => void;
  onCanvasClick: (ev: MouseEvent) => void;
}

// ==================== 工厂 ====================

/**
 * 创建一份完整的 MatrixRainState · orchestrator 持有并传给所有 helper
 *
 * 行为 100% 等价于原 matrixRain() 闭包内的初始化(行 286 ~ 740)
 * - 所有闭包私有变量搬到这里
 * - 初始化时计算所有 derived 字段(effectiveVp, effectiveTp, ...)
 * - target_/transition 状态全部置零/默认
 * - 沙箱 __frameCtx 字段填好(Math/Number/String/Boolean/Array 全是 SAFE_GLOBALS)
 */
export const createMatrixRainState = (
  options: MatrixRainOptions,
  renderer: import('../renderer/types').MatrixRainRenderer
): MatrixRainState => {
  // ============ cfg 合并 ============
  const cfg = {
    fontSize: options.fontSize ?? DEFAULTS.fontSize,
    trailAlpha: options.trailAlpha ?? DEFAULTS.trailAlpha,
    maxDPR: options.maxDPR ?? DEFAULTS.maxDPR,
    warmthRadius: options.warmthRadius ?? DEFAULTS.warmthRadius,
    warmthLerp: options.warmthLerp ?? DEFAULTS.warmthLerp,
    sparkProbability: options.sparkProbability ?? DEFAULTS.sparkProbability,
    targetFPS: options.targetFPS ?? DEFAULTS.targetFPS,
    flickerSpeed: options.flickerSpeed,
    renderScale: options.renderScale ?? DEFAULTS.renderScale,
    easing: options.easing ?? DEFAULTS.easing,
  };

  // ============ 主题解析 ============
  const themeResolved = resolveTheme(options.theme, options.coldFrom, options.warmFrom);
  let coldPalette: Palette = options.coldPalette || themeResolved.cold;
  let warmPalette: Palette = options.warmPalette || themeResolved.warm;
  let tp: ThemeParams = themeResolved.tp;
  const currentThemeName: ThemeName = themeResolved.effectiveName;
  const mixedFrom: { coldFrom: ThemeName; warmFrom: ThemeName } | undefined =
    themeResolved.mixedFrom;

  if (options.coldPalette) coldPalette = options.coldPalette;
  if (options.warmPalette) warmPalette = options.warmPalette;
  if (options.themeParams) tp = { ...tp, ...options.themeParams };

  let ctp: ThemeParams = { ...tp };
  let wtp: ThemeParams = { ...tp };
  if (options.coldThemeParams) ctp = { ...ctp, ...options.coldThemeParams };
  if (options.warmThemeParams) wtp = { ...wtp, ...options.warmThemeParams };

  // ============ userFunc 编译 + diagnostics 缓存 ============
  const diagnostics: Diagnostics = {};
  const userFuncs: UserFuncs = {
    brightnessCurve: null,
    flickerCurve: null,
    phaseFunc: null,
    charsetFunc: null,
  };
  if (options.brightnessCurve) {
    try {
      userFuncs.brightnessCurve = compileUserFunction(options.brightnessCurve);
    } catch (e) {
      diagnostics.brightnessCurve = e instanceof Error ? e.message : String(e);
    }
  }
  if (options.flickerCurve) {
    try {
      userFuncs.flickerCurve = compileUserFunction(options.flickerCurve);
    } catch (e) {
      diagnostics.flickerCurve = e instanceof Error ? e.message : String(e);
    }
  }
  if (options.phaseFunc) {
    try {
      userFuncs.phaseFunc = compileUserFunction(options.phaseFunc);
    } catch (e) {
      diagnostics.phaseFunc = e instanceof Error ? e.message : String(e);
    }
  }
  if (options.charsetFunc) {
    try {
      userFuncs.charsetFunc = compileUserFunction(options.charsetFunc);
    } catch (e) {
      diagnostics.charsetFunc = e instanceof Error ? e.message : String(e);
    }
  }

  // ============ colorCurve userFunc ============
  let colorCurve: UserFunc | null = null;
  if (options.colorCurve) {
    try {
      colorCurve = compileUserFunction(options.colorCurve);
    } catch (e) {
      diagnostics.colorCurve = e instanceof Error ? e.message : String(e);
    }
  }

  // ============ 颜色覆盖 ============
  const colorOverrides: ColorOverrides | null =
    (options.colorOverrides as ColorOverrides | null) ?? null;
  const colorOverrideFn: ColorOverrideFn | null =
    typeof colorOverrides === 'function' ? colorOverrides : null;

  // ============ fixedTimeStep / reducedMotion ============
  const fixedTimeStep = options.fixedTimeStep === true;
  let prefersReducedMotion = false;
  if (
    !options.enableWhenReducedMotion &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    prefersReducedMotion = true;
  }

  // ============ 几何 / palette LUT / charset ============
  const paletteLUT = new PaletteLUT();
  paletteLUT.setPalettes(coldPalette, warmPalette);

  const variant: VariantName = options.variant || 'classic';
  let vp: VariantParams = { ...VARIANT_DEFAULTS[variant] };
  if (options.variantParams) vp = { ...vp, ...options.variantParams };

  const charset: string = options.charset || '0123456789';
  const flicker = {
    ...DEFAULT_FLICKER,
    ...(options.flickerRates || {}),
  };
  const lightCenter = options.lightCenter || { x: 0.7, y: 0.3 };
  const driftSpeed = options.driftSpeed || { x: 0.008, y: 0.006 };

  // ============ DOM ============
  const container: HTMLElement = options.container || document.body;
  const canvas: HTMLCanvasElement =
    options.canvas ||
    (() => {
      const c = document.createElement('canvas');
      c.id = 'matrix-rain-canvas';
      container.appendChild(c);
      return c;
    })();
  // 注: 0.4.0+ 不在此处 `canvas.getContext('2d')`
  // - canvas2d 模式: Canvas2DRenderer.init() 内部 getContext('2d')
  // - webgl 模式:   WebGLRenderer.init() 内部 getContext('webgl2')
  // 此处先不绑死 context 类型, renderer init 时再决定
  // 注: 'auto' 模式下 engine.ts 在 init 之前解析 type, 然后创建对应 renderer

  let wrapper: HTMLDivElement | null = null;
  if (!options.canvas) {
    wrapper = document.createElement('div');
    wrapper.className = 'matrix-rain-wrapper';
    const isBody = container === document.body;
    wrapper.style.cssText = isBody
      ? 'position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.85;'
      : 'position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0.85;';
    container.insertBefore(wrapper, container.firstChild);
    wrapper.appendChild(canvas);
  }
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  if (options.cursor !== undefined) {
    canvas.style.cursor = options.cursor === false ? 'default' : options.cursor;
  }

  // ============ 沙箱 __frameCtx ============
  const __frameCtx: SandboxContext = {
    t: 0,
    phase: 0,
    h: 0,
    s: 0,
    r: 0,
    f: 0,
    W: 0,
    H: 0,
    L: 0,
    ch: 0,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    noise: sandboxNoise,
    PI: Math.PI,
    E: Math.E,
    clamp: sandboxClamp,
    lerp: sandboxLerp,
    ease,
    Math: SAFE_GLOBALS.Math,
    Number: SAFE_GLOBALS.Number,
    String: SAFE_GLOBALS.String,
    Boolean: SAFE_GLOBALS.Boolean,
    Array: SAFE_GLOBALS.Array,
  };

  // ============ clickBurst 配置 ============
  const clickBurstActive = false;
  const clickBurstX = 0;
  const clickBurstY = 0;
  const clickBurstStart = 0;
  const clickBurstCfg: Required<ClickBurstOptions> = (() => {
    const cb = options.clickBurst;
    if (cb === false || cb === undefined) {
      return {
        radius: 0,
        intensity: 0,
        color: [255, 255, 255] as [number, number, number],
        duration: 0,
        decay: true,
      };
    }
    const o = typeof cb === 'object' ? cb : {};
    return {
      radius: o.radius ?? 6,
      intensity: Math.max(0, Math.min(1, o.intensity ?? 0.8)),
      color: o.color ?? [255, 255, 255],
      duration: o.duration ?? 0.6,
      decay: o.decay ?? true,
    };
  })();

  // ============ fps / 时间 ============
  const fpsWindowStart = typeof performance !== 'undefined' ? performance.now() : 0;

  // ============ 组装 state(空 hooks 占位,orchestrator 写入)============
  const state: MatrixRainState = {
    // config
    cfg,
    fixedTimeStep,
    prefersReducedMotion,
    noiseFadeInDur: options.noiseFadeInDuration ?? DEFAULTS.noiseFadeInDuration,
    phaseTransitionDur: options.phaseTransitionDuration ?? DEFAULTS.phaseTransitionDuration,
    cellLockEaseDur: options.cellLockEaseDuration ?? DEFAULTS.cellLockEaseDuration,
    themeTransitionDur: options.themeTransitionDuration ?? DEFAULTS.themeTransitionDuration,
    variantTransitionDur: options.variantTransitionDuration ?? DEFAULTS.variantTransitionDuration,
    FIXED_DT,

    // renderScale(0.3.0+)· 用户原值 + 每帧解析的 effective 数值
    renderScaleUser: cfg.renderScale,
    renderScaleEffective: typeof cfg.renderScale === 'number' ? cfg.renderScale : 1,

    // geometry
    a: 0,
    o: 0,
    r: 0,
    i: 0,
    n: 1,
    f: 0,
    ef: cfg.fontSize,
    b: [],

    // time
    lastFrameTime: typeof performance !== 'undefined' ? performance.now() : 0,
    wallTime: 0,
    lastDt: 1 / 60,
    fps: 60,
    fpsWindowStart,
    fpsWindowCount: 0,
    fpsAccumMs: 0,
    targetFPS: cfg.targetFPS,
    rafId: null,
    resizeTimer: null,
    ro: null,

    // theme
    coldPalette,
    warmPalette,
    tp,
    ctp,
    wtp,
    oldColdPalette: { ...coldPalette },
    oldWarmPalette: { ...warmPalette },
    oldTp: { ...tp },
    oldCtp: { ...ctp },
    oldWtp: { ...wtp },
    currentThemeName,
    mixedFrom,

    // variant
    variant,
    vp,
    effectiveVp: vp,

    // effective
    effectiveTp: tp,
    effectiveCtp: ctp,
    effectiveWtp: wtp,

    // dynamic hue
    hueRotateSpeed: options.hueRotateSpeed || 0,
    hueRotateAmount: options.hueRotateAmount || 360,
    dynamicHue: 0,
    dynamicColorHue: 0,

    // transitions
    transitionAlpha: 1.0,
    transitionAlphaAnim: null,
    themeTransition: null,
    themeParamsTransition: null,
    variantTransition: null,
    phaseTransition: null,
    oldTargetSnapshot: null,

    // userFuncs
    userFuncs,
    diagnostics,
    colorCurve,

    // color overrides
    colorOverrides,
    colorOverrideFn,

    // target bitmap
    targetBitmap: options.targetBitmap || null,
    targetCols: options.targetCols ?? 0,
    targetRows: options.targetRows ?? 0,
    targetAnchor: options.targetAnchor ?? 'center',
    targetMotion: options.targetMotion ?? 'static',
    targetMotionSpeed: options.targetMotionSpeed ?? 0.3,
    targetFadeIn: options.targetFadeIn ?? 0.5,
    targetHold: options.targetHold ?? Infinity,
    targetFadeOut: Math.max(0.001, options.targetFadeOut ?? 2.0),
    targetChaos: Math.max(0, Math.min(1, options.targetChaos ?? 0.5)),
    targetFitMode: options.targetFitMode ?? 'contain',
    targetPhase: options.targetPhase ?? 'fade',
    targetNoiseDuration: Math.max(0, options.targetNoiseDuration ?? 0.5),
    targetConvergeDuration: Math.max(0.001, options.targetConvergeDuration ?? 1.5),
    targetLockOrder: options.targetLockOrder ?? 'random',
    targetLockStability: Math.max(0, Math.min(1, options.targetLockStability ?? 0.7)),
    targetDissolveStartTime: -1,
    targetStartFrame: 0,
    targetStartTime: 0,
    targetActive: (options.targetBitmap || null) !== null,
    targetFinishFired: false,

    // anchor cache
    __cachedAnchorOx: 0,
    __cachedAnchorOy: 0,
    __cachedAnchorValid: false,

    // clickBurst
    clickBurstActive,
    clickBurstX,
    clickBurstY,
    clickBurstStart,
    clickBurstCfg,

    // charset + flicker
    charset,
    flicker,
    lightCenter,
    driftSpeed,

    // lifecycle
    isPaused: prefersReducedMotion,
    isDestroyed: false,
    lastOnFrameTs: 0,

    // DOM
    container,
    canvas,
    renderer, // 0.4.0+ 替代 ctx
    wrapper,

    // palette LUT
    paletteLUT,

    // sandbox
    __frameCtx,

    // options original
    options,

    // hooks placeholder(orchestrator 必须先注入再使用)
    hooks: {} as MatrixRainHooks,
  };

  return state;
};

/**
 * Orchestrator 注入 hooks(在 createMatrixRainState 之后,buildGrid 之前)
 */
export const setEngineHooks = (state: MatrixRainState, hooks: MatrixRainHooks): void => {
  state.hooks = hooks;
};

// ==================== 内部工具导出(setters / draw-helpers 用)====================

/** HSL 调色板线性插值 */
export const lerpHSLPalette = (a: HSLPalette, b: HSLPalette, t: number): HSLPalette => ({
  h: a.h + (b.h - a.h) * t,
  s: a.s + (b.s - a.s) * t,
  lMin: a.lMin + (b.lMin - a.lMin) * t,
  lMax: a.lMax + (b.lMax - a.lMax) * t,
  aMax: (a.aMax ?? 1) + ((b.aMax ?? 1) - (a.aMax ?? 1)) * t,
});

/** ThemeParams 7 字段逐项 lerp */
export const lerpThemeParams = (a: ThemeParams, b: ThemeParams, t: number): ThemeParams => ({
  brightness: a.brightness + (b.brightness - a.brightness) * t,
  chroma: a.chroma + (b.chroma - a.chroma) * t,
  hueShift: a.hueShift + (b.hueShift - a.hueShift) * t,
  saturationShift: a.saturationShift + (b.saturationShift - a.saturationShift) * t,
  lightnessShift: a.lightnessShift + (b.lightnessShift - a.lightnessShift) * t,
  invertHue: a.invertHue + (b.invertHue - a.invertHue) * t,
  contrast: a.contrast + (b.contrast - a.contrast) * t,
});

/** VariantParams 数值字段逐项 lerp(所有项 a → b 线性插值) */
export const lerpVariantParams = (
  a: VariantParams,
  b: VariantParams,
  t: number
): VariantParams => ({
  phaseStep: a.phaseStep + (b.phaseStep - a.phaseStep) * t,
  phaseJitter: a.phaseJitter + (b.phaseJitter - a.phaseJitter) * t,
  sinWeightA: a.sinWeightA + (b.sinWeightA - a.sinWeightA) * t,
  sinWeightB: a.sinWeightB + (b.sinWeightB - a.sinWeightB) * t,
  sinWeightC: a.sinWeightC + (b.sinWeightC - a.sinWeightC) * t,
  brightCurve: a.brightCurve + (b.brightCurve - a.brightCurve) * t,
  chUpdateProb: a.chUpdateProb + (b.chUpdateProb - a.chUpdateProb) * t,
  headBright: a.headBright + (b.headBright - a.headBright) * t,
  headFalloff: a.headFalloff + (b.headFalloff - a.headFalloff) * t,
  avalancheSpeed: a.avalancheSpeed + (b.avalancheSpeed - a.avalancheSpeed) * t,
});

/** ease 工具(forward reference,跟原 engine.ts 一致) */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
export const easeIn = (t: number) => Math.pow(Math.max(0, Math.min(1, t)), 3);
export const easeInOut = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** fitMode 缩放阈值(原 FIT_THRESHOLD) */
export { FIT_THRESHOLD };

/** FLICKER_SPEED_DEFAULT 暴露给 draw-helpers */
export { FLICKER_SPEED_DEFAULT };

/** 常量 export,便于 setter / orchestrator 引用 */
export { DEFAULTS };

/**
 * 每帧解析 effective renderScale(0.3.0+):
 * - 'auto' + targetActive && targetBitmap → 2
 * - 'auto' + inactive → 1
 * - number(已 normalize) → 同值
 *
 * 由 rAF draw 入口每帧调一次,结果写入 state.renderScaleEffective。
 * 调时机:在 colorCurve / hueRotate 计算之后,任何 draw 变体之前(保证
 * targetActive 已是当前帧最新值,updateTargetBitmapPhaseGlobal 不会改它)。
 */
export const resolveEffectiveRenderScale = (state: MatrixRainState): number => {
  if (state.renderScaleUser === 'auto') {
    return state.targetActive && state.targetBitmap !== null ? 2 : 1;
  }
  return state.renderScaleUser;
};

/**
 * 取一条 ease 曲线(0.4.0+)· 根据 easing mode 决定 cubic 还是恒等
 * @param state MatrixRainState
 * @param kind 'in' | 'out' | 'inOut' —— 对应 easeIn / easeOut / easeInOut
 *   (仅在 mode='smooth' 时有差异;'linear' 模式三种都返恒等)
 * @param override 可选 per-call 覆盖(从 transition 自身的 easing 字段读)
 *   优先级:override > state.cfg.easing
 */
export const pickEasingFn = (
  state: MatrixRainState,
  kind: 'in' | 'out' | 'inOut',
  override?: EasingMode
): ((t: number) => number) => {
  const mode = override ?? state.cfg.easing;
  if (mode === 'linear') {
    // 恒等:clamp 到 [0, 1]
    return (t: number) => Math.max(0, Math.min(1, t));
  }
  switch (kind) {
    case 'in':
      return easeIn;
    case 'out':
      return easeOut;
    case 'inOut':
      return easeInOut;
  }
};

// ==================== 打断与回退:getEffective*State helpers(0.4.0+)====================
/**
 * 5-tuple of current displayed theme values.
 * - If a themeTransition is active: return lerp(from, current, eased(t))
 * - Otherwise: return current state values directly
 *
 * Used by `setTheme` / `setThemeParams` to capture the current displayed
 * state as the new transition's `from` — enabling smooth interrupt/rollback.
 */
export interface EffectiveThemeState {
  cold: Palette;
  warm: Palette;
  tp: ThemeParams;
  ctp: ThemeParams;
  wtp: ThemeParams;
}

export const getEffectiveThemeState = (state: MatrixRainState): EffectiveThemeState => {
  if (!state.themeTransition) {
    return {
      cold: state.coldPalette,
      warm: state.warmPalette,
      tp: state.tp,
      ctp: state.ctp,
      wtp: state.wtp,
    };
  }
  const tt = (state.wallTime - state.themeTransition.start) / state.themeTransition.dur;
  if (tt >= 1) {
    return {
      cold: state.coldPalette,
      warm: state.warmPalette,
      tp: state.tp,
      ctp: state.ctp,
      wtp: state.wtp,
    };
  }
  const eased = pickEasingFn(
    state,
    'inOut',
    state.themeTransition.easing
  )(Math.min(1, Math.max(0, tt)));
  return {
    cold: lerpHSLPalette(state.themeTransition.fromCold, state.coldPalette, eased),
    warm: lerpHSLPalette(state.themeTransition.fromWarm, state.warmPalette, eased),
    tp: lerpThemeParams(state.themeTransition.fromTp, state.tp, eased),
    ctp: lerpThemeParams(state.themeTransition.fromCtp, state.ctp, eased),
    wtp: lerpThemeParams(state.themeTransition.fromWtp, state.wtp, eased),
  };
};

/**
 * 3-tuple of current displayed ThemeParams (tp / ctp / wtp) · 供 setThemeParams
 * 在打断时取当前显示值作新 from。
 */
export interface EffectiveThemeParamsState {
  tp: ThemeParams;
  ctp: ThemeParams;
  wtp: ThemeParams;
}

export const getEffectiveThemeParamsState = (state: MatrixRainState): EffectiveThemeParamsState => {
  if (!state.themeParamsTransition) {
    return { tp: state.tp, ctp: state.ctp, wtp: state.wtp };
  }
  const tt = (state.wallTime - state.themeParamsTransition.start) / state.themeParamsTransition.dur;
  if (tt >= 1) {
    return { tp: state.tp, ctp: state.ctp, wtp: state.wtp };
  }
  const eased = pickEasingFn(
    state,
    'inOut',
    state.themeParamsTransition.easing
  )(Math.min(1, Math.max(0, tt)));
  return {
    tp: lerpThemeParams(state.themeParamsTransition.fromTp, state.tp, eased),
    ctp: lerpThemeParams(state.themeParamsTransition.fromCtp, state.ctp, eased),
    wtp: lerpThemeParams(state.themeParamsTransition.fromWtp, state.wtp, eased),
  };
};

/**
 * Current displayed variant params · 供 setVariantParams 打断时取当前显示值作新 from。
 */
export const getEffectiveVariantState = (state: MatrixRainState): VariantParams => {
  if (!state.variantTransition) {
    return state.vp;
  }
  const tt = (state.wallTime - state.variantTransition.start) / state.variantTransition.dur;
  if (tt >= 1) {
    return state.vp;
  }
  const eased = pickEasingFn(
    state,
    'inOut',
    state.variantTransition.easing
  )(Math.min(1, Math.max(0, tt)));
  return lerpVariantParams(state.variantTransition.fromVp, state.vp, eased);
};
