/**
 * @xietuier/matrix-rain · 主引擎
 * Canvas 2D 数字雨 · 残影拖尾 + 冷暖双调色板 + 阻尼跟随温度光心
 *
 * 纯 ES Module,无外部依赖。
 * 4 种变体:classic / avalanche / ripple / ascii
 */

import type {
  MatrixRainOptions,
  MatrixRainInstance,
  Palette,
  ThemeName,
  ThemeParams,
  VariantName,
  VariantParams,
  ColorOverrides,
  ColorOverrideFn,
  ClickBurstOptions,
  CursorOption,
  MatrixRainSnapshot,
  HSLPalette,
} from '../types';
import {
  VARIANT_DEFAULTS,
  themes,
  compileUserFunction,
  PaletteLUT,
  applyTP,
  type RGBALUT,
  ease,
  SAFE_GLOBALS,
} from './core';

type NumericOptionKeys =
  | 'fontSize'
  | 'trailAlpha'
  | 'maxDPR'
  | 'warmthRadius'
  | 'warmthLerp'
  | 'sparkProbability'
  | 'targetFPS'
  | 'noiseFadeInDuration'
  | 'phaseTransitionDuration'
  | 'cellLockEaseDuration'
  | 'themeTransitionDuration'
  | 'variantTransitionDuration';

const DEFAULTS: Required<Pick<MatrixRainOptions, NumericOptionKeys>> = {
  fontSize: 14,
  trailAlpha: 0.18,
  maxDPR: 2,
  warmthRadius: 0.6,
  warmthLerp: 0.04,
  sparkProbability: 0.003,
  targetFPS: 0, // 0 = 不限(默认随 rAF),正数 = 限频(30/24/15/...)
  // ========== 过渡系统默认时长(秒)==========
  noiseFadeInDuration: 0.2, // A1 noise 阶段开头渐入
  phaseTransitionDuration: 0.15, // A2 阶段间过渡
  cellLockEaseDuration: 0.12, // A3/A4 per-cell 锁定/解锁 ease
  themeTransitionDuration: 0.4, // C1 主题切换 HSL 插值
  variantTransitionDuration: 0.3, // D1 variant 切换
};

const FLICKER_SPEED_DEFAULT = 1;

const DEFAULT_FLICKER = { high: 0.7, mid: 0.4, low: 0.15, dark: 0.04 };

// ==================== 位图缩放(用于 targetFitMode)====================
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
  if (srcW === dstW && srcH === dstH) return new Float32Array(src); // 1:1 直返
  const dst = new Float32Array(dstW * dstH);
  if (dstW >= srcW && dstH >= srcH) {
    // 升采样:nearest neighbor
    for (let y = 0; y < dstH; y++) {
      const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
      for (let x = 0; x < dstW; x++) {
        const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
        dst[y * dstW + x] = src[sy * srcW + sx];
      }
    }
  } else {
    // 降采样:box filter(对每个 dst 像素,覆盖 src 区域求平均)
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

// ==================== 事件节流/防抖常量 ====================
const ONFRAME_THROTTLE_MS = 1000 / 30; // onFrame 30Hz 节流
const RESIZE_DEBOUNCE_MS = 200; // onResize debounce

// ==================== 过渡系统 lerp 助手 ====================
/**
 * HSL 调色板线性插值(a → b over t ∈ [0, 1])
 * 简化: hue 也走线性(虽然视觉上会过中间色相,但 400ms 内感觉是 hue shift)
 * 严格 hue lerp 应走最短弧度,但 5 主题 hue 差一般 < 120°,影响小
 */
const lerpHSLPalette = (a: HSLPalette, b: HSLPalette, t: number): HSLPalette => ({
  h: a.h + (b.h - a.h) * t,
  s: a.s + (b.s - a.s) * t,
  lMin: a.lMin + (b.lMin - a.lMin) * t,
  lMax: a.lMax + (b.lMax - a.lMax) * t,
  aMax: (a.aMax ?? 1) + ((b.aMax ?? 1) - (a.aMax ?? 1)) * t,
});

/** ThemeParams 7 字段逐项 lerp */
const lerpThemeParams = (a: ThemeParams, b: ThemeParams, t: number): ThemeParams => ({
  brightness: a.brightness + (b.brightness - a.brightness) * t,
  chroma: a.chroma + (b.chroma - a.chroma) * t,
  hueShift: a.hueShift + (b.hueShift - a.hueShift) * t,
  saturationShift: a.saturationShift + (b.saturationShift - a.saturationShift) * t,
  lightnessShift: a.lightnessShift + (b.lightnessShift - a.lightnessShift) * t,
  invertHue: a.invertHue + (b.invertHue - a.invertHue) * t,
  contrast: a.contrast + (b.contrast - a.contrast) * t,
});

/** VariantParams 数值字段逐项 lerp */
const lerpVariantParams = (a: VariantParams, b: VariantParams, t: number): VariantParams => ({
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

/** ease 函数(forward 引用) */
const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const easeIn = (t: number) => Math.pow(Math.max(0, Math.min(1, t)), 3);
const easeInOut = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/**
 * 解析主题:支持 ThemeName / { coldFrom, warmFrom } / coldFrom-warmFrom 拼色
 */
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
  // 显式 theme 对象(拼色)
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
  // coldFrom / warmFrom(扁平字段)
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
  // 标准 ThemeName
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
  const w = window as any;
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
        } catch {}
      });
    },
  };
};

/**
 * 创建一个数字矩阵背景实例
 * @example
 * const rain = matrixRain({ theme: 'silicon-valley', fontSize: 16 });
 * // ...用完:
 * rain.destroy();
 */
export function matrixRain(options: MatrixRainOptions = {}): MatrixRainInstance {
  // ==================== 状态 ====================
  let cfg = { ...DEFAULTS, ...options };

  // ===== 编译错误缓存(instance.getDiagnostics) =====
  const diagnostics: {
    brightnessCurve?: string;
    flickerCurve?: string;
    phaseFunc?: string;
    charsetFunc?: string;
    colorCurve?: string;
  } = {};

  // 用户函数驱动器(4 个量可选)
  type UserFunc = (ctx: import('./curves/sandbox').SandboxContext) => number | string;
  const userFuncs: {
    brightnessCurve: UserFunc | null; // f(t, h, s, r) → 0-1, 覆盖 brightCurve
    flickerCurve: UserFunc | null; // f(t, h, s, r) → 0-1, 覆盖 flickerRates
    phaseFunc: UserFunc | null; // f(t, phase, h, s) → 增量, 累加到 phase
    charsetFunc: UserFunc | null; // f(t, h, s, ch) → 字符索引
  } = {
    brightnessCurve: null,
    flickerCurve: null,
    phaseFunc: null,
    charsetFunc: null,
  };
  if (options.brightnessCurve) {
    try {
      userFuncs.brightnessCurve = compileUserFunction(options.brightnessCurve);
    } catch (e: any) {
      diagnostics.brightnessCurve = e.message;
    }
  }
  if (options.flickerCurve) {
    try {
      userFuncs.flickerCurve = compileUserFunction(options.flickerCurve);
    } catch (e: any) {
      diagnostics.flickerCurve = e.message;
    }
  }
  if (options.phaseFunc) {
    try {
      userFuncs.phaseFunc = compileUserFunction(options.phaseFunc);
    } catch (e: any) {
      diagnostics.phaseFunc = e.message;
    }
  }
  if (options.charsetFunc) {
    try {
      userFuncs.charsetFunc = compileUserFunction(options.charsetFunc);
    } catch (e: any) {
      diagnostics.charsetFunc = e.message;
    }
  }

  let a = 0,
    o = 0; // viewport w/h
  let r = 0,
    i = 0; // cols/rows
  let n = 1; // DPR scale
  let f = 0; // frame counter
  let b: Cell[][] = []; // grid
  let ef = 14; // effective fontSize (窄屏自适应)

  let coldPalette: Palette = (options.coldPalette || themes['silicon-valley']().cold) as Palette;
  let warmPalette: Palette = (options.warmPalette || themes['silicon-valley']().warm) as Palette;
  let tp: ThemeParams = {
    brightness: 1,
    chroma: 1,
    hueShift: 0,
    saturationShift: 0,
    lightnessShift: 0,
    invertHue: 0,
    contrast: 1,
  };

  // ==================== 过渡系统选项 ====================
  // 5 个时长字段均由 DEFAULTS 兜底;用户传 0 = 关闭对应过渡
  const noiseFadeInDur: number = cfg.noiseFadeInDuration ?? 0.2;
  const phaseTransitionDur: number = cfg.phaseTransitionDuration ?? 0.15;
  const cellLockEaseDur: number = cfg.cellLockEaseDuration ?? 0.12;
  const themeTransitionDur: number = cfg.themeTransitionDuration ?? 0.4;
  const variantTransitionDur: number = cfg.variantTransitionDuration ?? 0.3;

  // ==================== 过渡系统状态 ====================
  // E1: instance-level soft alpha(0=全透明,1=全不透明)· 路由切换/页面离开用
  let transitionAlpha = 1.0;
  let transitionAlphaAnim: { start: number; dur: number; from: number; to: number } | null = null;

  // C1: 主题切换 HSL 插值状态(from palette → to palette over themeTransitionDur)
  let themeTransition: {
    fromCold: HSLPalette;
    fromWarm: HSLPalette;
    fromTp: ThemeParams;
    fromCtp: ThemeParams;
    fromWtp: ThemeParams;
    start: number;
    dur: number;
  } | null = null;

  // C2: 主题参数切换(主要为 brightness)插值状态
  let themeParamsTransition: {
    fromTp: ThemeParams;
    fromCtp: ThemeParams;
    fromWtp: ThemeParams;
    start: number;
    dur: number;
  } | null = null;

  // D1: 变体参数切换插值状态
  let variantTransition: {
    fromVp: VariantParams;
    start: number;
    dur: number;
  } | null = null;

  // B1/B2: 阶段切换 crossfade 状态(fade ↔ noise-converge)
  let phaseTransition: {
    fromPhase: 'fade' | 'noise-converge';
    start: number;
    dur: number;
  } | null = null;

  // A1: noise 阶段起始时间(-1 = 未在 noise 阶段)
  // @ts-expect-error -- 预留给 noise phase 状态机接口,未消费
  const noisePhaseStartTime = -1;

  // B1/B2: 阶段切换 crossfade 期间,保存"旧"状态以便与"新"状态叠加
  type TargetSnapshot = {
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
    phase: 'fade' | 'noise-converge';
    startTime: number;
    active: boolean;
    noiseDuration: number;
    convergeDuration: number;
    lockOrder: 'random' | 'topdown' | 'bottomup' | 'center' | 'edge' | 'leftright' | 'rightleft';
    lockStability: number;
  };
  // @ts-expect-error -- 跨阶段 crossfade 写入用,绘制端未接续消费(预留接口)
  let oldTargetSnapshot: TargetSnapshot | null = null;

  // ==================== 解析主题(支持 coldFrom/warmFrom 拼色)====================
  const themeResolved = resolveTheme(options.theme, options.coldFrom, options.warmFrom);
  let currentThemeName: ThemeName = themeResolved.effectiveName;
  let mixedFrom: { coldFrom: ThemeName; warmFrom: ThemeName } | undefined = themeResolved.mixedFrom;
  coldPalette = themeResolved.cold;
  warmPalette = themeResolved.warm;
  tp = themeResolved.tp;

  /**
   * 主题应用助手:把 name 主题的 cold/warm/tp 写入闭包状态。
   * 返回 true=成功,false=未知主题。
   * 复用:init 时用一次,setTheme 时再用一次,保证两者行为一致。
   */
  const applyTheme = (name: ThemeName): boolean => {
    if (!themes[name]) return false;
    // ========== C1 主题过渡:先快照旧值(供 setTheme 启动 themeTransition 用)==========
    oldColdPalette = { ...coldPalette };
    oldWarmPalette = { ...warmPalette };
    oldTp = { ...tp };
    oldCtp = { ...ctp };
    oldWtp = { ...wtp };
    const t = themes[name]();
    coldPalette = t.cold;
    warmPalette = t.warm;
    tp = {
      brightness: t.brightness ?? 1,
      chroma: t.chroma ?? 1,
      hueShift: t.hueShift ?? 0,
      saturationShift: t.saturationShift ?? 0,
      lightnessShift: t.lightnessShift ?? 0,
      invertHue: t.invertHue ?? 0,
      contrast: t.contrast ?? 1,
    };
    currentThemeName = name;
    mixedFrom = undefined;
    return true;
  };
  // 若用户显式 coldPalette/warmPalette(不走 theme),尊重用户
  if (options.coldPalette) coldPalette = options.coldPalette;
  if (options.warmPalette) warmPalette = options.warmPalette;
  if (options.themeParams) tp = { ...tp, ...options.themeParams };

  // 冷暖色板独立调参
  let ctp: ThemeParams = { ...tp };
  let wtp: ThemeParams = { ...tp };
  if (options.coldThemeParams) ctp = { ...ctp, ...options.coldThemeParams };
  if (options.warmThemeParams) wtp = { ...wtp, ...options.warmThemeParams };

  // ========== C1/C2 主题过渡用的"旧值"快照(每次 setTheme/setThemeParams 时更新)==========
  let oldColdPalette: HSLPalette = { ...coldPalette };
  let oldWarmPalette: HSLPalette = { ...warmPalette };
  let oldTp: ThemeParams = { ...tp };
  let oldCtp: ThemeParams = { ...ctp };
  let oldWtp: ThemeParams = { ...wtp };

  // 时间驱动色相旋转
  let hueRotateSpeed = options.hueRotateSpeed || 0;
  let hueRotateAmount = options.hueRotateAmount || 360;
  let dynamicHue = 0;

  // ==================== fixedTimeStep 选项(可靠性)====================
  // true = 固定 dt = 1/60(确定性,适合测试/SSR);false(默认)= 真实 dt(rAF 时间戳)
  const fixedTimeStep: boolean = options.fixedTimeStep === true;
  const FIXED_DT = 1 / 60;

  // ==================== prefers-reduced-motion 探测(可靠性)====================
  // OS/浏览器告诉用户"减少动画";默认自动暂停(省电 + 可访问性)
  // 用户可传 enableWhenReducedMotion: true 强制开启
  let prefersReducedMotion = false;
  if (
    !options.enableWhenReducedMotion &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    prefersReducedMotion = true;
  }

  // 颜色注入(支持对象 + 函数式:基于位置/字符/温度动态生成)
  let colorOverrides: ColorOverrides | null =
    (options.colorOverrides as ColorOverrides | null) ?? null;
  // 函数式 colorOverride 缓存(let 以便 setColorOverrides 热更新)
  let colorOverrideFn: ColorOverrideFn | null =
    typeof colorOverrides === 'function' ? colorOverrides : null;

  // colorCurve userFunc(每帧动态色相偏移,自由度最大)
  let colorCurve: UserFunc | null = options.colorCurve
    ? (() => {
        try {
          return compileUserFunction(options.colorCurve!);
        } catch (e: any) {
          diagnostics.colorCurve = e.message;
          return null;
        }
      })()
    : null;
  let dynamicColorHue = 0;

  // 目标位图状态机(null = 未启用)
  let targetBitmap: Float32Array | null = options.targetBitmap || null;
  let targetCols = options.targetCols ?? 0; // bitmap 宽(列数)
  let targetRows = options.targetRows ?? 0; // bitmap 高(行数)
  // targetOriginX/targetOriginY:已规划为预计算但未启用,删除以满足 noUnusedLocals
  let targetAnchor: 'topLeft' | 'center' | 'topRight' | 'bottomLeft' | 'bottomRight' =
    options.targetAnchor ?? 'center';
  let targetMotion: 'static' | 'drift' | 'bounce' | 'float' = options.targetMotion ?? 'static';
  let targetMotionSpeed = options.targetMotionSpeed ?? 0.3; // 网格/秒
  // targetMotionT:已规划但未启用,删除以满足 noUnusedLocals
  let targetFadeIn = options.targetFadeIn ?? 0.5;
  let targetHold = options.targetHold ?? Infinity;
  let targetFadeOut = Math.max(0.001, options.targetFadeOut ?? 2.0);
  let targetChaos = Math.max(0, Math.min(1, options.targetChaos ?? 0.5));
  // ==================== A: 位图缩放策略(targetFitMode)====================
  // contain (默认):位图 cols/rows 超过 grid 的 95% 时,等比缩放至完整显示
  // cover:位图 cols/rows 小于 grid 时,等比放大填满(可能裁切)
  // actual:按位图原始尺寸渲染(可能溢出)
  // auto:根据内容自动选(长文本→contain,短文本/图→actual)
  const targetFitMode: 'contain' | 'cover' | 'actual' | 'auto' = options.targetFitMode ?? 'contain';
  // fitMode 缩放阈值(比例):bitmap dim 超过 grid dim * threshold 时,触发缩放
  const FIT_THRESHOLD = 0.95;
  // 噪声→收敛模式(targetPhase='noise-converge')专用
  let targetPhase: 'fade' | 'noise-converge' = options.targetPhase ?? 'fade';
  let targetNoiseDuration = Math.max(0, options.targetNoiseDuration ?? 0.5); // 全屏噪点时长(秒)
  let targetConvergeDuration = Math.max(0.001, options.targetConvergeDuration ?? 1.5); // 逐个锁定时长(秒)
  let targetLockOrder:
    | 'random'
    | 'topdown'
    | 'bottomup'
    | 'center'
    | 'edge'
    | 'leftright'
    | 'rightleft' = options.targetLockOrder ?? 'random';
  let targetLockStability = Math.max(0, Math.min(1, options.targetLockStability ?? 0.7)); // 锁定后字符稳定性
  let targetDissolveStartTime = -1; // dissolve 阶段开始时间(-1 = 未开始)
  // @ts-expect-error -- 预留给 userFunc/调试接口,setTargetBitmap 写入但未消费
  let targetStartFrame = 0; // 启用时 f 值(保留用于 userFunc/调试)
  let targetStartTime = 0; // 启用时 wallTime(秒) · 用于 dt-based 状态机
  let targetActive = targetBitmap !== null;
  let targetFinishFired = false; // 防止 onTargetFinish 重复触发

  // ==================== 交互状态(clickBurst) =====================
  let clickBurstActive = false;
  let clickBurstX = 0;
  let clickBurstY = 0;
  let clickBurstStart = 0;
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

  // 注:applyTP 来自 palette-lut.ts(模块级),不再在 engine.ts 闭包内定义

  const charset: string = options.charset || '0123456789';
  const flicker = { ...DEFAULT_FLICKER, ...(options.flickerRates || {}) };
  // flickerSpeed 存进 cfg 以便热更新;不需重建
  const lightCenter = options.lightCenter || { x: 0.7, y: 0.3 };
  const driftSpeed = options.driftSpeed || { x: 0.008, y: 0.006 };

  // ==================== Palette LUT(性能优化)====================
  // 256 项 RGBA 表,把 HSL→RGBA + applyTP 从 per-cell 转为 per-frame
  // 失效: setPalettes / setTheme / setThemeParams / setColdThemeParams / setWarmThemeParams / setHueRotate / colorCurve
  const paletteLUT = new PaletteLUT();
  paletteLUT.setPalettes(coldPalette, warmPalette);

  const variant: VariantName = options.variant || 'classic';

  // 变体参数
  let vp: VariantParams = { ...VARIANT_DEFAULTS[variant] };
  if (options.variantParams) vp = { ...vp, ...options.variantParams };

  // ==================== DOM ====================
  const container = options.container || document.body;
  const canvas: HTMLCanvasElement =
    options.canvas ||
    (() => {
      const c = document.createElement('canvas');
      c.id = 'matrix-rain-canvas';
      container.appendChild(c);
      return c;
    })();

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('[matrix-rain] Failed to get 2D context');

  // wrapper for pointer-events none / z-index
  let wrapper: HTMLDivElement | null = null;
  if (!options.canvas) {
    wrapper = document.createElement('div');
    wrapper.className = 'matrix-rain-wrapper';
    // 默认全屏定位(body);用户传 container 改用 absolute,跟随容器
    const isBody = container === document.body;
    wrapper.style.cssText = isBody
      ? 'position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.85;'
      : 'position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0.85;';
    container.insertBefore(wrapper, container.firstChild);
    wrapper.appendChild(canvas);
  }

  canvas.style.cssText = 'display:block;width:100%;height:100%;';

  // 鼠标光标配置
  if (options.cursor !== undefined) {
    canvas.style.cursor = options.cursor === false ? 'default' : options.cursor;
  }

  // ==================== 事件触发器 ====================
  let lastOnFrameTs = 0;
  const fireOnFrame = (): void => {
    if (!options.onFrame) return;
    const now = performance.now();
    if (now - lastOnFrameTs < ONFRAME_THROTTLE_MS) return;
    lastOnFrameTs = now;
    try {
      options.onFrame({ f, t: wallTime, dt: lastDt, fps: Math.round(fps) });
    } catch (e) {
      /* 用户回调异常吞掉,不阻断主循环 */
    }
  };
  const fireOnResize = (): void => {
    if (!options.onResize) return;
    try {
      options.onResize({ w: a, h: o, cols: r, rows: i });
    } catch (e) {
      /* */
    }
  };
  const fireOnThemeChange = (newTheme: ThemeName): void => {
    if (!options.onThemeChange) return;
    try {
      options.onThemeChange(newTheme);
    } catch (e) {
      /* */
    }
  };
  const fireOnTargetFinish = (): void => {
    if (!options.onTargetFinish) return;
    try {
      options.onTargetFinish();
    } catch (e) {
      /* */
    }
  };

  // ==================== clickBurst 点击处理 =====================
  const onCanvasClick = (ev: MouseEvent): void => {
    if (clickBurstCfg.radius <= 0) return;
    const rect = canvas.getBoundingClientRect();
    clickBurstX = ev.clientX - rect.left;
    clickBurstY = ev.clientY - rect.top;
    clickBurstStart = wallTime;
    clickBurstActive = true;
  };
  if (clickBurstCfg.radius > 0) {
    canvas.addEventListener('click', onCanvasClick);
  }

  // ==================== Grid cell ====================
  interface Cell {
    ch: number;
    bright: number;
    phase: number;
    warmth: number;
    // 雪崩变体专用
    speed?: number;
    yPos?: number;
    headBright?: number;
    // 噪声→收敛模式专用(targetPhase='noise-converge')
    locked?: boolean; // 目标区 cell:当前是否锁定
    lockTime?: number; // 锁定时刻(墙钟,秒,相对 targetStartTime)
    unlockTime?: number; // 解锁时刻(dissolve 阶段设置)
    lockedCh?: number; // 锁定后使用的字符索引
    // ========== 过渡系统(A3/A4 per-cell ease)==========
    lockEaseStart?: number; // 锁定瞬间的 wallTime(秒)· undefined = 未在 ease
    unlockEaseStart?: number; // 解锁瞬间的 wallTime(秒)· undefined = 未在 ease
    lockEaseFromL?: number; // 锁定瞬间的 l(噪声亮度)· 用于 A3 ease
    lockEaseToL?: number; // 锁定瞬间的目标 l(bitmap 亮度)· 用于 A3 ease
    unlockEaseFromL?: number; // 解锁瞬间的 l(锁定亮度)· 用于 A4 ease
    unlockEaseToL?: number; // 解锁瞬间的目标 l(噪声亮度)· 用于 A4 ease
  }

  // ==================== Lifecycle ====================
  let rafId: number | null = null;
  let resizeTimer: number | null = null;
  let lastFrameTime = performance.now();
  // startTime:已规划但未启用,删除以满足 noUnusedLocals
  let wallTime = 0; // 累积墙钟(秒) · 用于 dt-based 动画
  let lastDt = 1 / 60; // 上一帧 dt(秒) · 用于相位累积
  let fps = 60;
  let isPaused = prefersReducedMotion; // prefers-reduced-motion → 启动暂停(可访问性 + 省电)
  let isDestroyed = false;
  // FPS 节流(0 = 不限,与 rAF 同频;>0 = 跳过中间帧)
  let targetFPS = options.targetFPS ?? 0;
  let fpsAccumMs = 0;

  // ==================== FPS 计时初始化(必须在 computeFPS 之前)====================
  let fpsWindowStart = performance.now();
  let fpsWindowCount = 0;

  const computeFPS = () => {
    // 限频模式: 只有“画出的帧”才调
    const now = performance.now();
    fpsWindowCount++;
    const windowMs = now - fpsWindowStart;
    if (windowMs >= 500) {
      // 0.5s 滑窗
      fps = (fpsWindowCount * 1000) / windowMs;
      fpsWindowStart = now;
      fpsWindowCount = 0;
    }
  };

  // ==================== 过渡系统:D1 variant 过渡用 effectiveVp(每帧更新)====================
  let effectiveVp: VariantParams = vp;
  // C1/C2: 主题 / 主题参数 过渡用 effectiveTp(每帧更新)
  // effectiveCtp / effectiveWtp 在 draw() 内局部重声明,模块级被遮蔽;删除以满足 noUnusedLocals
  const effectiveTp: ThemeParams = tp;

  // ==================== A: fitMode 缩放(用于 setTargetBitmap / resize)====================
  // 1) contain:扫描非零 bbox,若 cols/rows > grid × 0.95,等比缩放
  // 2) cover:  扫描非零 bbox,若 cols/rows < grid,等比放大
  // 3) actual: 不缩放(旧版默认)
  // 4) auto:   长文本(> grid cols * 0.4)→ contain,否则 actual
  const applyTargetFitMode = (overrideMode?: 'contain' | 'cover' | 'actual' | 'auto') => {
    if (!targetBitmap || targetCols <= 0 || targetRows <= 0) return;
    if (r <= 0 || i <= 0) return; // grid 未就绪
    const mode = overrideMode ?? targetFitMode;
    if (mode === 'actual') return;
    // 扫描非零像素 bbox
    let bbMinX = targetCols,
      bbMinY = targetRows,
      bbMaxX = -1,
      bbMaxY = -1;
    for (let py = 0; py < targetRows; py++) {
      for (let px = 0; px < targetCols; px++) {
        if (targetBitmap[py * targetCols + px] > 0) {
          if (px < bbMinX) bbMinX = px;
          if (px > bbMaxX) bbMaxX = px;
          if (py < bbMinY) bbMinY = py;
          if (py > bbMaxY) bbMaxY = py;
        }
      }
    }
    if (bbMaxX < 0) return; // 整张位图都黑,无内容
    const bbCols = bbMaxX - bbMinX + 1;
    const bbRows = bbMaxY - bbMinY + 1;
    let needScale = false;
    let scale = 1.0;
    if (mode === 'contain') {
      if (bbCols > r * FIT_THRESHOLD || bbRows > i * FIT_THRESHOLD) {
        needScale = true;
        scale = Math.min((r * FIT_THRESHOLD) / bbCols, (i * FIT_THRESHOLD) / bbRows);
      }
    } else if (mode === 'cover') {
      if (bbCols < r * FIT_THRESHOLD || bbRows < i * FIT_THRESHOLD) {
        needScale = true;
        scale = Math.max((r * FIT_THRESHOLD) / bbCols, (i * FIT_THRESHOLD) / bbRows);
      }
    } else if (mode === 'auto') {
      const isLong = bbCols > r * 0.4;
      if (isLong && (bbCols > r * FIT_THRESHOLD || bbRows > i * FIT_THRESHOLD)) {
        needScale = true;
        scale = Math.min((r * FIT_THRESHOLD) / bbCols, (i * FIT_THRESHOLD) / bbRows);
      }
    }
    if (!needScale || scale <= 0) return;
    const newCols = Math.max(1, Math.round(bbCols * scale));
    const newRows = Math.max(1, Math.round(bbRows * scale));
    // 提取 bbox 子位图
    const sub = new Float32Array(bbCols * bbRows);
    for (let py = 0; py < bbRows; py++) {
      for (let px = 0; px < bbCols; px++) {
        sub[py * bbCols + px] = targetBitmap[(py + bbMinY) * targetCols + (px + bbMinX)];
      }
    }
    const resampled = resampleBitmap(sub, bbCols, bbRows, newCols, newRows);
    targetBitmap = resampled;
    targetCols = newCols;
    targetRows = newRows;
  };

  const buildGrid = () => {
    n = Math.min(window.devicePixelRatio || 1, cfg.maxDPR);
    // 关键修复:从 canvas 自身的实际展示尺寸读,而不是从 container 读
    // wrapper 是 position:fixed;inset:0,canvas 是 100%×100%,所以 canvas 实际显示尺寸 = viewport 尺寸
    // 这样无论 PC / mobile / 横竖屏 / 嵌入小 cell / CSS 拉伸,backing store 永远 1:1,字符不被压扇
    const rect = canvas.getBoundingClientRect();
    a = rect.width || window.innerWidth || 1;
    o = rect.height || window.innerHeight || 1;
    // 只设 backing store,不再设 canvas.style.width/height —— 让 CSS 100% 接管,避免冲突
    canvas.width = Math.max(1, Math.round(a * n));
    canvas.height = Math.max(1, Math.round(o * n));
    ctx!.setTransform(n, 0, 0, n, 0, 0);

    // 窄屏自适应:视口 < 600px 时把字号缩到 12(不限于 fontSize===14)
    // mobile 510 / 横屏 iPad 等都会触发,避免 16px 字号在小屏画扇
    ef = a < 600 ? Math.min(cfg.fontSize, 12) : cfg.fontSize;
    r = Math.ceil(a / ef);
    // 严格方格:行间距 = 列间距 = ef,字符 cell 是正方形,字符不扇
    i = Math.ceil(o / ef);

    b = [];
    for (let s = 0; s < i; s++) {
      const row: Cell[] = [];
      for (let h = 0; h < r; h++) {
        const cell: Cell = {
          ch: Math.floor(Math.random() * charset.length),
          bright: Math.random() < 0.2 ? Math.floor(Math.random() * 3) : 0,
          phase: Math.random() * Math.PI * 2,
          warmth: Math.random(),
        };
        if (variant === 'avalanche') {
          cell.speed = 0.3 + Math.random() * 0.7;
          cell.yPos = Math.random() * i;
          cell.headBright = 7 + Math.floor(Math.random() * 2);
        }
        row.push(cell);
      }
      b.push(row);
    }
    syncFrameCtxSize();
    // ==================== A: resize 时重新 fitMode 缩放 ====================
    // 网格大小变了,旧缩放可能不再合适,重新跑一遍
    applyTargetFitMode();
    // noise-converge 模式:为每个目标区 cell 计算 lockTime + 初始化 locked
    // 放在 buildGrid 末尾,因为网格大小/锚点依赖最新 r/i/bitmap
    recomputeTargetLockTimes();
  };

  /**
   * 为 noise-converge 模式预计算每个目标区 cell 的 lockTime + rank
   * - lockTime ∈ [noiseDur, noiseDur + convergeDur],按 lockOrder 排布
   * - rank ∈ [0, 1]:cell 在 lockOrder 中的位置(0=最先锁,1=最后锁)
   * - cell.locked = false(全部初始未锁)
   * - cell.unlockTime 留空(dissolve 阶段计算)
   *
   * 调用时机:
   * 1. setTargetBitmap 设置新 bitmap 时
   * 2. buildGrid(resize 触发)网格大小/锚点变化时
   */
  const resetAllCellLockState = () => {
    for (let s = 0; s < i; s++) {
      for (let h = 0; h < r; h++) {
        const c = b[s][h];
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
    targetDissolveStartTime = -1;
  };

  const recomputeTargetLockTimes = () => {
    if (!targetBitmap || !targetActive) return;
    if (targetPhase !== 'noise-converge') return;
    // 先清空所有 cell 旧 lock 状态(防 buildGrid 后旧 cell 残留 locked=true)
    resetAllCellLockState();
    // 计算锚点偏移(与 drawInner 中逻辑一致)
    let ox = 0,
      oy = 0;
    if (targetAnchor === 'center') {
      ox = (r - targetCols) >> 1;
      oy = (i - targetRows) >> 1;
    } else if (targetAnchor === 'topRight') {
      ox = r - targetCols;
      oy = 0;
    } else if (targetAnchor === 'bottomLeft') {
      ox = 0;
      oy = i - targetRows;
    } else if (targetAnchor === 'bottomRight') {
      ox = r - targetCols;
      oy = i - targetRows;
    }

    // 收集目标区 cell(bx, by, s, h)
    type TC = { h: number; s: number; bx: number; by: number; g: number; rank: number };
    const targets: TC[] = [];
    for (let s = 0; s < i; s++) {
      for (let h = 0; h < r; h++) {
        const bx = h - ox,
          by = s - oy;
        if (bx >= 0 && bx < targetCols && by >= 0 && by < targetRows) {
          const g = targetBitmap[by * targetCols + bx];
          if (g > 0) {
            targets.push({ h, s, bx, by, g, rank: 0 });
          }
        }
      }
    }
    if (targets.length === 0) return;
    const tCols = targetCols,
      tRows = targetRows;
    const tCenterX = (tCols - 1) / 2,
      tCenterY = (tRows - 1) / 2;
    // 计算 rank(0-1,0=最先锁)
    for (const t of targets) {
      let rank: number;
      switch (targetLockOrder) {
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
          const dx = t.bx - tCenterX,
            dy = t.by - tCenterY;
          rank =
            Math.sqrt(dx * dx + dy * dy) /
            Math.max(1, Math.sqrt(tCenterX * tCenterX + tCenterY * tCenterY));
          break;
        }
        case 'edge': {
          const dx = t.bx - tCenterX,
            dy = t.by - tCenterY;
          rank =
            1 -
            Math.sqrt(dx * dx + dy * dy) /
              Math.max(1, Math.sqrt(tCenterX * tCenterX + tCenterY * tCenterY));
          break;
        }
        case 'random':
        default:
          // 每个 cell 一个独立随机 rank(噪声感)
          rank = Math.random();
          break;
      }
      t.rank = Math.max(0, Math.min(1, rank));
    }
    // 写入 cell 状态
    const noiseStart = targetNoiseDuration;
    const convergeSpan = targetConvergeDuration;
    for (const t of targets) {
      const c = b[t.s][t.h];
      c.locked = false;
      c.lockTime = noiseStart + t.rank * convergeSpan;
      c.unlockTime = undefined;
      c.lockedCh = undefined;
    }
    // 重置 dissolve 起始时间(下一次进入 dissolve 时重算)
    targetDissolveStartTime = -1;
  };

  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      buildGrid();
      fireOnResize();
    }, RESIZE_DEBOUNCE_MS);
  };

  // 始终监听 canvas 自身的实际展示尺寸变化 —— 不管 container 是 body 还是嵌入元素
  // 这样 PC / mobile / 浏览器缩放 / 横竖屏切换 / CSS 拉伸 都会触发重建
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => onResize());
    ro.observe(canvas);
  }

  // ==================== 共享 sandbox 工具(模块级常驻,避免 per-cell 分配)====================
  const sandboxNoise = (x: number): number => {
    const n = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
    return n - Math.floor(n);
  };
  const sandboxClamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const sandboxLerp = (a: number, b: number, t: number): number => a + (b - a) * t;

  // ==================== __frameCtx:per-cell userFunc 共享 ctx 缓存(性能优化)====================
  // 每帧复用同一对象,userFunc 调前 mutate 字段 → 消除 ~20K obj/帧的 GC 压力
  const __frameCtx: import('./curves/sandbox').SandboxContext = {
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
  // 同步 grid 尺寸到 ctx(避免 userFunc 读到旧 W/H)
  const syncFrameCtxSize = () => {
    __frameCtx.W = r;
    __frameCtx.H = i;
  };

  // ==================== noise-converge 状态机:applyTargetBitmapPhase ====================
  // 每帧共享状态:目标区 cell 的 lockTime / unlockTime 状态机
  // 5 段:noise → converge → hold → dissolve → idle
  // 调用入口:drawClassic / drawAvalanche / drawRipple 在 cell brightness 计算之后
  // 返回值:{ l, ch, skipCharset, finished } - null 表示非 noise-converge 模式(走原路径)

  /**
   * 推导锚点偏移(每帧调一次,然后所有 cell 共享)
   * 性能优化:避免每个 cell 重算 if 链
   */
  let __cachedAnchorOx = 0,
    __cachedAnchorOy = 0;
  let __cachedAnchorValid = false;
  const computeTargetOrigin = (): { ox: number; oy: number } => {
    if (__cachedAnchorValid) return { ox: __cachedAnchorOx, oy: __cachedAnchorOy };
    let ox = 0,
      oy = 0;
    if (targetAnchor === 'center') {
      ox = (r - targetCols) >> 1;
      oy = (i - targetRows) >> 1;
    } else if (targetAnchor === 'topRight') {
      ox = r - targetCols;
      oy = 0;
    } else if (targetAnchor === 'bottomLeft') {
      ox = 0;
      oy = i - targetRows;
    } else if (targetAnchor === 'bottomRight') {
      ox = r - targetCols;
      oy = i - targetRows;
    }
    __cachedAnchorOx = ox;
    __cachedAnchorOy = oy;
    __cachedAnchorValid = true;
    return { ox, oy };
  };
  const invalidateTargetAnchor = () => {
    __cachedAnchorValid = false;
  };

  /**
   * 每帧调一次(在 cell 循环前):处理 dissolve 阶段进入与结束判定
   * - 检测首次进入 dissolve 时刻,为所有已锁 cell 计算 unlockTime
   * - 检测 dissolve 完成时刻,清理 targetBitmap + 触发 onTargetFinish
   */
  const updateTargetBitmapPhaseGlobal = () => {
    invalidateTargetAnchor();
    if (!targetBitmap || !targetActive || targetPhase !== 'noise-converge') return;
    const elapsed = wallTime - targetStartTime;
    const dissolveStart = targetNoiseDuration + targetConvergeDuration + targetHold;
    // 进入 dissolve 阶段:为所有已锁 cell 设置 unlockTime(倒序 rank → 1-rank)
    // 注:用 1e-9 epsilon 容忍 wallTime 累积浮点误差(180×1/60 = 2.999...942)
    if (targetDissolveStartTime < 0 && elapsed + 1e-9 >= dissolveStart) {
      targetDissolveStartTime = dissolveStart;
      for (let s = 0; s < i; s++) {
        for (let h = 0; h < r; h++) {
          const c = b[s][h];
          if (c.locked && c.lockTime !== undefined && c.unlockTime === undefined) {
            const rank = (c.lockTime - targetNoiseDuration) / targetConvergeDuration;
            c.unlockTime = targetDissolveStartTime + (1 - rank) * targetFadeOut;
          }
        }
      }
    }
    // dissolve 完成判定
    if (targetDissolveStartTime >= 0 && elapsed + 1e-9 >= targetDissolveStartTime + targetFadeOut) {
      targetActive = false;
      targetBitmap = null;
      if (!targetFinishFired) {
        targetFinishFired = true;
        fireOnTargetFinish();
      }
    }
  };

  /**
   * 单 cell 阶段处理(在 cell 循环中调)
   * 输入:c(单元格)· h/s(网格坐标)· l(变体原始亮度)· elapsed(可选,默认用全局 wallTime)
   * 输出:{ l, ch, skipCharset } 或 null(非 noise-converge 模式)
   * - skipCharset = true:此 cell 由 phase 完全接管,跳过 normal flicker/charset 更新
   * - skipCharset = false:此 cell 让 normal flicker/charset 接管 ch 更新(非目标区 hold/dissolve)
   *
   * 过渡系统集成:
   * - A1 noise 阶段开头渐入:在 noise phase 且 elapsed < noiseFadeInDur 时,lerp l from baseL to chaos
   * - A3 per-cell lock-in:cell 锁定瞬间记录 lockEaseStart + 起始/终值,后续 cell 的 l 由 ease 决定
   * - A4 per-cell unlock:cell 解锁瞬间记录 unlockEaseStart + 起始/终值,后续 cell 的 l 由 ease 决定
   */
  const applyTargetBitmapPhase = (
    c: Cell,
    h: number,
    s: number,
    l: number,
    elapsedOpt?: number
  ): { l: number; ch: number; skipCharset: boolean } | null => {
    if (!targetBitmap || !targetActive || targetPhase !== 'noise-converge') return null;
    const elapsed = elapsedOpt !== undefined ? elapsedOpt : wallTime - targetStartTime;
    const noiseStart = targetNoiseDuration;
    const convergeSpan = targetConvergeDuration;
    // noiseAndConverge = noiseStart + convergeSpan;已规划但未消费,删除以满足 noUnusedLocals
    // 1e-9 epsilon:容忍 wallTime 累积浮点误差(60/180/...×1/60 可能 < 整数)
    const EPS = 1e-9;

    // ========== A3 per-cell lock-in ease (优先级最高)==========
    // cell 已锁但 lockEaseStart 还在 ease 窗口内 → 用 ease 后的 l 覆盖
    if (
      c.lockEaseStart !== undefined &&
      c.lockEaseFromL !== undefined &&
      c.lockEaseToL !== undefined
    ) {
      const t = Math.min(
        1,
        Math.max(0, (elapsed - c.lockEaseStart) / Math.max(0.001, cellLockEaseDur))
      );
      const eased = easeOut(t);
      const resultL = c.lockEaseFromL * (1 - eased) + c.lockEaseToL * eased;
      if (t >= 1) {
        c.lockEaseStart = undefined;
        c.lockEaseFromL = undefined;
        c.lockEaseToL = undefined;
      }
      return { l: Math.max(0, Math.min(1, resultL)), ch: c.ch, skipCharset: true };
    }
    // ========== A4 per-cell unlock ease ==========
    if (
      c.unlockEaseStart !== undefined &&
      c.unlockEaseFromL !== undefined &&
      c.unlockEaseToL !== undefined
    ) {
      const t = Math.min(
        1,
        Math.max(0, (elapsed - c.unlockEaseStart) / Math.max(0.001, cellLockEaseDur))
      );
      const eased = easeIn(t);
      const resultL = c.unlockEaseFromL * (1 - eased) + c.unlockEaseToL * eased;
      if (t >= 1) {
        c.unlockEaseStart = undefined;
        c.unlockEaseFromL = undefined;
        c.unlockEaseToL = undefined;
      }
      return { l: Math.max(0, Math.min(1, resultL)), ch: c.ch, skipCharset: false };
    }

    // Phase 1: noise(全屏 chaos,即使变体也算 noise)
    if (elapsed + EPS < noiseStart) {
      const noiseL = Math.random();
      // ========== A1 noise 开头渐入 ==========
      if (noiseFadeInDur > 0) {
        const t = Math.min(1, Math.max(0, elapsed / noiseFadeInDur));
        if (t < 1) {
          const eased = easeOut(t);
          return {
            l: l * (1 - eased) + noiseL * eased, // 从 rain 渐变到 noise
            ch: Math.floor(Math.random() * charset.length),
            skipCharset: true,
          };
        }
      }
      return {
        l: noiseL,
        ch: Math.floor(Math.random() * charset.length),
        skipCharset: true,
      };
    }

    // 锚点快速拒绝
    const { ox, oy } = computeTargetOrigin();
    const bx = h - ox,
      by = s - oy;
    if (bx < 0 || bx >= targetCols || by < 0 || by >= targetRows) {
      // 非目标区
      const convergeElapsed = elapsed - noiseStart;
      if (convergeElapsed + EPS < convergeSpan) {
        // Phase 2 blend:noise → rain
        const rainFactor = convergeElapsed / convergeSpan;
        const noiseL = Math.random();
        return {
          l: noiseL * (1 - rainFactor) + l * rainFactor,
          ch: c.ch, // 字符走 normal flicker 路径
          skipCharset: false,
        };
      }
      // Phase 3 (hold) / Phase 4 (dissolve):normal rain
      return { l, ch: c.ch, skipCharset: false };
    }
    const g = targetBitmap[by * targetCols + bx];
    if (g <= 0) {
      // 目标区但 g=0(透明位),按非目标区处理
      const convergeElapsed = elapsed - noiseStart;
      if (convergeElapsed + EPS < convergeSpan) {
        const rainFactor = convergeElapsed / convergeSpan;
        const noiseL = Math.random();
        return { l: noiseL * (1 - rainFactor) + l * rainFactor, ch: c.ch, skipCharset: false };
      }
      return { l, ch: c.ch, skipCharset: false };
    }

    // 目标区 cell:lock state machine
    // wasLocked / wasUnlockTime:已规划用于 diff 检测但未消费,删除以满足 noUnusedLocals
    if (c.locked && c.unlockTime !== undefined && elapsed + EPS >= c.unlockTime) {
      // 解锁 → 切到 noise(此 cell 后续不再重新锁定,因 unlockTime 已生效)
      // ========== A4 unlock ease:记录 ease 起点 ==========
      const prevL = Math.max(0, Math.min(1, g * 0.7));
      c.locked = false;
      c.unlockEaseStart = elapsed;
      c.unlockEaseFromL = prevL;
      c.unlockEaseToL = Math.random();
    }
    // 只在 dissolve 阶段前(没有 unlockTime)才允许锁定,避免 dissolve 中解锁后立即被重新锁
    if (
      !c.locked &&
      c.unlockTime === undefined &&
      c.lockTime !== undefined &&
      elapsed + EPS >= c.lockTime
    ) {
      // ========== A3 lock ease:记录 ease 起点 ==========
      const prevL = Math.random();
      c.locked = true;
      c.lockEaseStart = elapsed;
      c.lockEaseFromL = prevL;
      c.lockEaseToL = Math.max(0, Math.min(1, g * 0.7));
      c.lockedCh = Math.floor(Math.random() * charset.length);
    }
    if (c.locked) {
      // 字符稳定性:stability=1 不变;stability=0 每帧可换
      if (Math.random() > targetLockStability) {
        c.lockedCh = Math.floor(Math.random() * charset.length);
      }
      return {
        l: Math.max(0, Math.min(1, g * 0.7)),
        ch: c.lockedCh!,
        skipCharset: true,
      };
    }
    // 未锁(noise/converge 早期 或 dissolve 中已解锁):noise 行为
    // 如果刚刚进入 A4 ease(本帧设置 unlockEaseStart),立刻返回 ease 第一帧
    if (
      c.unlockEaseStart !== undefined &&
      !c.locked &&
      c.unlockEaseFromL !== undefined &&
      c.unlockEaseToL !== undefined
    ) {
      const t = Math.min(
        1,
        Math.max(0, (elapsed - c.unlockEaseStart) / Math.max(0.001, cellLockEaseDur))
      );
      const eased = easeIn(t);
      const resultL = c.unlockEaseFromL * (1 - eased) + c.unlockEaseToL * eased;
      if (t >= 1) {
        c.unlockEaseStart = undefined;
        c.unlockEaseFromL = undefined;
        c.unlockEaseToL = undefined;
      }
      return { l: Math.max(0, Math.min(1, resultL)), ch: c.ch, skipCharset: false };
    }
    return {
      l: Math.random(),
      ch: Math.floor(Math.random() * charset.length),
      skipCharset: true,
    };
  };

  /**
   * 主绘制循环
   * @param rafTs 可选:rAF 时间戳(浏览器自动传入,精度 = 帧间隔)
   *              不传则用 performance.now() 兜底(供 setTimeout / 测试用)
   *
   * 关键修复(可靠性):
   * - 接受 rAF 时间戳参数,避免 init→firstDraw 期间 dt 累积巨大值
   * - fixedTimeStep 模式:dt 强制 1/60(确定性,适合 SSR/测试)
   * - ErrorBoundary:用户函数/几何异常不再杀掉整个 rAF
   */
  const draw = (rafTs?: number) => {
    if (isPaused || isDestroyed) return;

    // ==================== ErrorBoundary(可靠性)====================
    // 用户 userFunc 抛错 / 几何异常不再终结 rAF 链
    try {
      // FPS 节流:targetFPS>0 时,间距<帧间隔的跳帧(但仍调 rAF 以保持动画连续感)
      // 用 rAF 时间戳(若可用)而非 performance.now(),避免与 wallTime 漂移
      const tsMs = rafTs !== undefined ? rafTs : performance.now();

      if (targetFPS > 0) {
        // 首帧保护:lastFrameTime 已在 init 时设为 performance.now(),
        // 若 rAF 时间戳远早于 lastFrameTime(罕见,如切 tab 后回退),用 tsMs 兜底
        if (tsMs >= lastFrameTime) {
          fpsAccumMs += tsMs - lastFrameTime;
        }
        lastFrameTime = tsMs;
        const minInterval = 1000 / targetFPS;
        if (fpsAccumMs < minInterval) {
          rafId = requestAnimationFrame((ts) => draw(ts));
          return;
        }
        fpsAccumMs = fpsAccumMs % minInterval; // 补上一帧多余时间
      }
      // 实际画出帧时才记 FPS
      computeFPS();
      f++;

      // ==================== dt / wallTime(统一时间基准)====================
      // fixedTimeStep 模式:dt 强制 1/60(确定性,适合 SSR/headless 测试)
      if (fixedTimeStep) {
        lastDt = FIXED_DT;
        wallTime += lastDt;
      } else {
        // dt 累积 + 限幅:防止切 tab 后 huge dt 引起 phase 爆炸
        // 首帧:若 tsMs < lastFrameTime(rAF 时间戳回退,罕见),lastDt 兜底为 0
        const prev = lastFrameTime;
        lastFrameTime = tsMs;
        if (tsMs > prev) {
          const rawDt = (tsMs - prev) / 1000;
          lastDt = Math.min(0.1, Math.max(0, rawDt)); // 上限 100ms,下限 0
          wallTime += lastDt;
        } else {
          lastDt = 0;
        }
      }

      // 本帧动态色相偏移(wallTime 驱动,60fps 时与 f*0.016 等价)
      dynamicHue = hueRotateSpeed !== 0 ? (wallTime * hueRotateSpeed) % hueRotateAmount : 0;
      // colorCurve userFunc 计算额外色相偏移(t 用 wallTime)
      if (colorCurve) {
        __frameCtx.t = wallTime;
        __frameCtx.phase = 0;
        __frameCtx.h = 0;
        __frameCtx.s = 0;
        __frameCtx.r = Math.random();
        __frameCtx.f = f;
        __frameCtx.W = r;
        __frameCtx.H = i;
        __frameCtx.L = 0;
        __frameCtx.ch = 0;
        dynamicColorHue = Number(colorCurve(__frameCtx)) || 0;
      } else {
        dynamicColorHue = 0;
      }
      const totalHue = dynamicHue + dynamicColorHue;

      // ==================== 过渡系统:每帧应用 ====================
      // E1: transitionAlpha 插值(若有 in-flight 动画)
      if (transitionAlphaAnim) {
        const tt = (wallTime - transitionAlphaAnim.start) / transitionAlphaAnim.dur;
        if (tt >= 1) {
          transitionAlpha = transitionAlphaAnim.to;
          transitionAlphaAnim = null;
        } else {
          transitionAlpha =
            transitionAlphaAnim.from +
            (transitionAlphaAnim.to - transitionAlphaAnim.from) * easeInOut(tt);
        }
      }

      // C1: 主题 HSL 插值(每帧用 interpolated palette 重建 LUT)
      let effectiveCold = coldPalette,
        effectiveWarm = warmPalette;
      // @ts-expect-error -- effectiveTp 在 draw() 内是过渡插值的目标,绘制端走的是 effectiveCtp/effectiveWtp(在 drawInner 中读模块级 effectiveTp);局部重声明是过渡历史残留
      let effectiveTp = tp,
        effectiveCtp = ctp,
        effectiveWtp = wtp;
      if (themeTransition) {
        const tt = (wallTime - themeTransition.start) / themeTransition.dur;
        if (tt >= 1) {
          themeTransition = null;
        } else {
          const eased = easeInOut(Math.min(1, Math.max(0, tt)));
          effectiveCold = lerpHSLPalette(themeTransition.fromCold, coldPalette, eased);
          effectiveWarm = lerpHSLPalette(themeTransition.fromWarm, warmPalette, eased);
          effectiveTp = lerpThemeParams(themeTransition.fromTp, tp, eased);
          effectiveCtp = lerpThemeParams(themeTransition.fromCtp, ctp, eased);
          effectiveWtp = lerpThemeParams(themeTransition.fromWtp, wtp, eased);
          // 每帧 push 临时 palette 给 LUT(setPalettes 内部 hash 失配会重建)
          paletteLUT.setPalettes(effectiveCold, effectiveWarm);
        }
      }
      // C2: 主题参数(brightness/chroma 等)插值
      if (themeParamsTransition) {
        const tt = (wallTime - themeParamsTransition.start) / themeParamsTransition.dur;
        if (tt >= 1) {
          themeParamsTransition = null;
        } else {
          const eased = easeInOut(Math.min(1, Math.max(0, tt)));
          effectiveTp = lerpThemeParams(themeParamsTransition.fromTp, tp, eased);
          effectiveCtp = lerpThemeParams(themeParamsTransition.fromCtp, ctp, eased);
          effectiveWtp = lerpThemeParams(themeParamsTransition.fromWtp, wtp, eased);
        }
      }
      // D1: 变体参数插值 — 通过闭包共享,draw 函数内读 effectiveVp
      if (variantTransition) {
        const tt = (wallTime - variantTransition.start) / variantTransition.dur;
        if (tt >= 1) {
          variantTransition = null;
        } else {
          const eased = easeInOut(Math.min(1, Math.max(0, tt)));
          effectiveVp = lerpVariantParams(variantTransition.fromVp, vp, eased);
        }
      } else {
        effectiveVp = vp;
      }
      // B1/B2: 阶段切换 crossfade — 在 draw* 函数内处理(old vs new vis lerp)
      // 这里仅判断/清理过期
      if (phaseTransition) {
        const tt = (wallTime - phaseTransition.start) / phaseTransition.dur;
        if (tt >= 1) {
          phaseTransition = null;
          oldTargetSnapshot = null;
        }
      }

      // ==================== Palette LUT(每帧一次)====================
      // 拿冷暖两色终态 LUT:TP 或 hue 变化时内部 hash 失配会自动重建
      const coldFinal = paletteLUT.getColdFinal(effectiveCtp, totalHue);
      const warmFinal = paletteLUT.getWarmFinal(effectiveWtp, totalHue);

      // ① 残影拖尾
      ctx!.fillStyle = `rgba(8, 8, 18, ${cfg.trailAlpha})`;
      ctx!.fillRect(0, 0, a, o);

      ctx!.font = `${ef}px "JetBrains Mono", ui-monospace, monospace`;
      ctx!.textBaseline = 'middle';
      ctx!.textAlign = 'center';

      // ② 温度光心(Lissajous 漂移,wallTime 驱动;×60 与原 f*driftSpeed 等价)
      const M = r * lightCenter.x + Math.cos(wallTime * driftSpeed.x * 60) * r * 0.2;
      const p = i * lightCenter.y + Math.sin(wallTime * driftSpeed.y * 60) * i * 0.2;

      // ③ 绘制
      if (variant === 'classic' || variant === 'ascii') {
        drawClassic(M, p, coldFinal, warmFinal);
      } else if (variant === 'avalanche') {
        drawAvalanche(M, p, coldFinal, warmFinal);
      } else if (variant === 'ripple') {
        drawRipple(M, p, coldFinal, warmFinal);
      }

      // 触发 onFrame(30Hz 节流)
      fireOnFrame();

      rafId = requestAnimationFrame((ts) => draw(ts));
    } catch (err) {
      // 用户 userFunc 抛错 / 几何异常 / 任何运行时错误:
      // 1. 打印但不抛出,避免把整个动画杀掉
      // 2. 仍调度下一帧,让动画继续(单帧错误不应让 UI 死掉)
      // 3. 销毁状态下不重排,避免 destroy 后又调 rAF
      console.error('[matrix-rain] draw error (animation continues):', err);
      if (!isDestroyed) {
        rafId = requestAnimationFrame((ts) => draw(ts));
      }
    }
  };

  // ==================== drawInner:三变体共享热路径(性能优化)====================
  // 输入:c(单元格) · h/s(网格坐标) · y(像素 y) · l(亮度 0-1) · M/p(光心)
  //      coldFinal/warmFinal(本帧 LUT) · totalHue(动态色相)
  // 流程:warmth 阻尼 → 颜色覆盖快路径 → LUT 查表冷暖 → blend → applyTP(tp) → fillText
  // 注:colorOverride 完全覆盖某档颜色,跳过 blend/LUT
  const drawInner = (
    c: Cell,
    h: number,
    s: number,
    y: number,
    l: number,
    M: number,
    p: number,
    coldFinal: RGBALUT,
    warmFinal: RGBALUT,
    totalHue: number
  ) => {
    // warmth 阻尼
    const C = h - M,
      A = s - p;
    const B = Math.sqrt(C * C + A * A);
    const H = Math.max(0, 1 - B / (i * cfg.warmthRadius));
    c.warmth += (H - c.warmth) * cfg.warmthLerp;
    const d = Math.max(0, Math.min(1, c.warmth));

    // l < 0.02 肉眼几乎不可见,直接跳过(省 fillStyle + fillText 调用)
    if (l < 0.02) return;

    // colorOverride 完全覆盖某档颜色(跳过 blend / LUT 查表)
    // 支持:函数式 (level, h, s, cell) => [r,g,b] / Record<level, [r,g,b]>
    const __lIdx = (l * 9) | 0;
    if (colorOverrideFn) {
      const out = colorOverrideFn(__lIdx, h, s, {
        ch: c.ch,
        warmth: d,
        bright: c.bright,
        phase: c.phase,
      });
      if (out) {
        ctx!.fillStyle = `rgba(${out[0]}, ${out[1]}, ${out[2]}, 0.9)`;
        ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
        return;
      }
    } else if (colorOverrides && typeof colorOverrides === 'object') {
      const ov = (colorOverrides as Record<number, [number, number, number]>)[__lIdx];
      if (ov) {
        ctx!.fillStyle = `rgba(${ov[0]}, ${ov[1]}, ${ov[2]}, 0.9)`;
        ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
        return;
      }
    }

    // LUT 查表(已应用 ctp/wtp/hue)→ 冷暖混合 → applyTP(tp, hue)
    const lIdx = (l * 255) | 0;
    const gR = coldFinal.r[lIdx],
      gG = coldFinal.g[lIdx],
      gB = coldFinal.b[lIdx];
    const wR = warmFinal.r[lIdx],
      wG = warmFinal.g[lIdx],
      wB = warmFinal.b[lIdx];
    const gA = coldFinal.a[lIdx],
      wA = warmFinal.a[lIdx];
    const oneMinusD = 1 - d;
    const rc = gR * oneMinusD + wR * d;
    const gc = gG * oneMinusD + wG * d;
    const bc = gB * oneMinusD + wB * d;
    const k = (gA * oneMinusD + wA * d) / 255;
    const [R2, G2, B2] = applyTP(rc, gc, bc, effectiveTp, totalHue);
    // ========== E1 transitionAlpha:整体透明度缩放 ==========
    const finalA = k * transitionAlpha;
    ctx!.fillStyle = `rgba(${R2}, ${G2}, ${B2}, ${finalA})`;
    ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
  };

  const drawClassic = (M: number, p: number, coldFinal: RGBALUT, warmFinal: RGBALUT) => {
    // 每帧共享状态:wallTime-derived 值,放外层避免 per-cell 重算
    const totalHue = dynamicHue + dynamicColorHue;
    // sin/cos 系数每次画都依赖 f · 用 wallTime*1.2/wallTime*0.9 替代 f*0.02/wallTime*0.9
    // 60fps 等价:f*0.02 = wallTime*1.2 (因 f 每帧 +1,wallTime 每帧 +1/60,×60+1.2)
    const fBase1 = wallTime * 1.2;
    const fBase2 = wallTime * 0.9;
    // 同步 __frameCtx 的 f(给 userFunc 用)
    __frameCtx.f = f;
    __frameCtx.t = wallTime;
    // noise-converge 模式:每帧调一次全局状态(dissolve 进入/完成判定)
    updateTargetBitmapPhaseGlobal();
    for (let s = 0; s < i; s++) {
      const y = s * ef * 1.1 + ef * 0.55;
      for (let h = 0; h < r; h++) {
        const c = b[s][h];
        // phase 增量(dt-based:60fps 时与原 f-step 等价)
        const basePhaseInc =
          (effectiveVp.phaseStep + Math.random() * effectiveVp.phaseJitter) *
          (cfg.flickerSpeed ?? FLICKER_SPEED_DEFAULT);
        if (userFuncs.phaseFunc) {
          __frameCtx.h = h;
          __frameCtx.s = s;
          __frameCtx.phase = c.phase;
          __frameCtx.L = c.bright;
          __frameCtx.ch = c.ch;
          __frameCtx.r = Math.random();
          c.phase += Number(userFuncs.phaseFunc(__frameCtx)) || 0;
        } else {
          c.phase += basePhaseInc * lastDt * 60;
        }
        const W =
          Math.sin(c.phase) * effectiveVp.sinWeightA +
          Math.sin((h + s) * 0.05 + fBase1) * effectiveVp.sinWeightB +
          Math.sin(h * 0.1 - s * 0.07 + fBase2) * effectiveVp.sinWeightC;
        // 亮度
        let l: number;
        if (userFuncs.brightnessCurve) {
          __frameCtx.h = h;
          __frameCtx.s = s;
          __frameCtx.phase = c.phase;
          __frameCtx.L = c.bright;
          __frameCtx.ch = c.ch;
          __frameCtx.r = Math.random();
          const u = Number(userFuncs.brightnessCurve(__frameCtx));
          l = Math.max(0, Math.min(1, isNaN(u) ? 0 : u));
        } else {
          l = Math.max(0, Math.min(1, (W + 1) * 0.5));
        }
        if (Math.random() < cfg.sparkProbability) l = 1;
        c.bright = l;

        // 目标位图覆盖(文字/图片)
        let skipCharset = false;
        if (targetBitmap && targetActive) {
          if (targetPhase === 'noise-converge') {
            // noise-converge 模式:5 段状态机(共享函数)
            const result = applyTargetBitmapPhase(c, h, s, l);
            if (result) {
              l = result.l;
              c.ch = result.ch;
              skipCharset = result.skipCharset;
            }
          } else {
            // 'fade' 模式:线性透明度淡入(向后兼容)
            let ox = 0,
              oy = 0;
            if (targetAnchor === 'center') {
              ox = (r - targetCols) >> 1;
              oy = (i - targetRows) >> 1;
            } else if (targetAnchor === 'topRight') {
              ox = r - targetCols;
              oy = 0;
            } else if (targetAnchor === 'bottomLeft') {
              ox = 0;
              oy = i - targetRows;
            } else if (targetAnchor === 'bottomRight') {
              ox = r - targetCols;
              oy = i - targetRows;
            }
            if (targetMotion === 'drift') {
              const period = (r + targetCols) / Math.max(0.1, targetMotionSpeed);
              const t = wallTime - targetStartTime;
              const phase = (t % period) / period;
              ox = Math.floor(ox + phase * (r + targetCols)) - targetCols;
            } else if (targetMotion === 'bounce') {
              const period = (2 * (r - targetCols)) / Math.max(0.1, targetMotionSpeed);
              const t = wallTime - targetStartTime;
              const phase = (t % period) / period;
              const d2 = phase < 0.5 ? phase * 2 : 2 - phase * 2;
              ox = Math.floor(d2 * (r - targetCols));
            } else if (targetMotion === 'float') {
              const t = wallTime - targetStartTime;
              oy = Math.floor(oy + Math.sin(t * targetMotionSpeed * 2) * 3);
            }
            const bx = h - ox;
            const by = s - oy;
            if (bx >= 0 && bx < targetCols && by >= 0 && by < targetRows) {
              const g = targetBitmap[by * targetCols + bx];
              if (g > 0) {
                const elapsed = wallTime - targetStartTime;
                let vis = 1;
                if (elapsed < targetFadeIn) vis = elapsed / targetFadeIn;
                else if (elapsed > targetFadeIn + targetHold)
                  vis = Math.max(0, 1 - (elapsed - targetFadeIn - targetHold) / targetFadeOut);
                if (elapsed > targetFadeIn + targetHold + targetFadeOut) {
                  targetActive = false;
                  targetBitmap = null;
                  if (!targetFinishFired) {
                    targetFinishFired = true;
                    fireOnTargetFinish();
                  }
                } else {
                  const chaosFactor = (1 - vis) * targetChaos;
                  l = Math.max(0, Math.min(1, l + g * 0.7 * vis));
                  if (chaosFactor > 0 && Math.random() < chaosFactor) {
                    c.ch = Math.floor(Math.random() * charset.length);
                  }
                }
              }
            }
          }
        }

        // 闪烁 / 字符更新(noise-converge 接管时跳过)
        if (!skipCharset) {
          let F: number;
          if (userFuncs.flickerCurve) {
            __frameCtx.h = h;
            __frameCtx.s = s;
            __frameCtx.phase = c.phase;
            __frameCtx.L = l;
            __frameCtx.ch = c.ch;
            __frameCtx.r = Math.random();
            F = Number(userFuncs.flickerCurve(__frameCtx)) || 0;
          } else {
            F =
              l >= 0.66
                ? flicker.high
                : l >= 0.33
                  ? flicker.mid
                  : l >= 0.05
                    ? flicker.low
                    : flicker.dark;
          }
          if (Math.random() < F) c.ch = Math.floor(Math.random() * charset.length);
          if (effectiveVp.chUpdateProb > 0 && Math.random() < effectiveVp.chUpdateProb)
            c.ch = Math.floor(Math.random() * charset.length);
          if (userFuncs.charsetFunc) {
            __frameCtx.h = h;
            __frameCtx.s = s;
            __frameCtx.phase = c.phase;
            __frameCtx.L = l;
            __frameCtx.ch = c.ch;
            __frameCtx.r = Math.random();
            const u = Number(userFuncs.charsetFunc(__frameCtx));
            if (!isNaN(u)) c.ch = Math.max(0, Math.min(charset.length - 1, Math.floor(u)));
          }
        }

        drawInner(c, h, s, y, l, M, p, coldFinal, warmFinal, totalHue);
      }
    }
  };

  const drawAvalanche = (M: number, p: number, coldFinal: RGBALUT, warmFinal: RGBALUT) => {
    const totalHue = dynamicHue + dynamicColorHue;
    __frameCtx.f = f;
    __frameCtx.t = wallTime;
    const yPosSpeed = effectiveVp.avalancheSpeed;
    // noise-converge 模式:每帧调一次全局状态
    updateTargetBitmapPhaseGlobal();
    for (let s = 0; s < i; s++) {
      for (let h = 0; h < r; h++) {
        const c = b[s][h];
        // yPos 移动(dt-based;60fps 等价)
        c.yPos! += c.speed! * yPosSpeed * lastDt * 60;
        if (c.yPos! > i) c.yPos = 0;

        const distFromHead = Math.abs(s - Math.floor(c.yPos!));
        let l = Math.max(
          0,
          Math.min(1, (c.headBright! - Math.pow(distFromHead, effectiveVp.headFalloff)) / 8)
        );
        c.bright = l;

        // 噪声→收敛模式
        let skipCharset = false;
        if (targetBitmap && targetActive && targetPhase === 'noise-converge') {
          const result = applyTargetBitmapPhase(c, h, s, l);
          if (result) {
            l = result.l;
            c.ch = result.ch;
            skipCharset = result.skipCharset;
          }
        }

        if (!skipCharset && Math.random() < effectiveVp.chUpdateProb)
          c.ch = Math.floor(Math.random() * charset.length);
        if (l < 0.02) continue; // 走老路径的 continue,仅 brightness 计算

        const d = Math.max(0, Math.min(1, c.warmth));
        const C = h - M,
          A = s - p;
        const B = Math.sqrt(C * C + A * A);
        const H = Math.max(0, 1 - B / (i * cfg.warmthRadius));
        c.warmth += (H - c.warmth) * cfg.warmthLerp;

        const y = c.yPos! * ef * 1.1;
        const __lIdx = (l * 9) | 0;
        if (colorOverrides && (colorOverrides as any)[__lIdx]) {
          const o = (colorOverrides as any)[__lIdx]!;
          ctx!.fillStyle = `rgba(${o[0]}, ${o[1]}, ${o[2]}, ${0.9 * transitionAlpha})`;
          ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
          continue;
        }
        const lIdx = (l * 255) | 0;
        const gR = coldFinal.r[lIdx],
          gG = coldFinal.g[lIdx],
          gB = coldFinal.b[lIdx];
        const wR = warmFinal.r[lIdx],
          wG = warmFinal.g[lIdx],
          wB = warmFinal.b[lIdx];
        const gA = coldFinal.a[lIdx],
          wA = warmFinal.a[lIdx];
        const oneMinusD = 1 - d;
        const rc = gR * oneMinusD + wR * d;
        const gc = gG * oneMinusD + wG * d;
        const bc = gB * oneMinusD + wB * d;
        const k = (gA * oneMinusD + wA * d) / 255;
        const [R2, G2, B2] = applyTP(rc, gc, bc, effectiveTp, totalHue);
        const finalA = k * transitionAlpha;
        ctx!.fillStyle = `rgba(${R2}, ${G2}, ${B2}, ${finalA})`;
        ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
      }
    }
  };

  const drawRipple = (M: number, p: number, coldFinal: RGBALUT, warmFinal: RGBALUT) => {
    const totalHue = dynamicHue + dynamicColorHue;
    __frameCtx.f = f;
    __frameCtx.t = wallTime;
    // noise-converge 模式:每帧调一次全局状态
    updateTargetBitmapPhaseGlobal();
    for (let s = 0; s < i; s++) {
      const y = s * ef * 1.1 + ef * 0.55;
      for (let h = 0; h < r; h++) {
        const c = b[s][h];
        c.phase +=
          (effectiveVp.phaseStep + Math.random() * effectiveVp.phaseJitter) *
          (cfg.flickerSpeed ?? FLICKER_SPEED_DEFAULT) *
          lastDt *
          60;
        const W = Math.sin(c.phase) * effectiveVp.sinWeightA + 0.5;
        let l = Math.max(0, Math.min(1, W));
        c.bright = l;

        // 噪声→收敛模式
        let skipCharset = false;
        if (targetBitmap && targetActive && targetPhase === 'noise-converge') {
          const result = applyTargetBitmapPhase(c, h, s, l);
          if (result) {
            l = result.l;
            c.ch = result.ch;
            skipCharset = result.skipCharset;
          }
        }

        if (!skipCharset && Math.random() < effectiveVp.chUpdateProb)
          c.ch = Math.floor(Math.random() * charset.length);
        if (l < 0.02) continue;

        // 走简化路径(无 colorOverride 文档提及的 ripple 路径,但保留兼容)
        const C = h - M,
          A = s - p;
        const B = Math.sqrt(C * C + A * A);
        const H = Math.max(0, 1 - B / (i * cfg.warmthRadius));
        c.warmth += (H - c.warmth) * cfg.warmthLerp;
        const d = Math.max(0, Math.min(1, c.warmth));

        const __lIdx = (l * 9) | 0;
        if (colorOverrides && (colorOverrides as any)[__lIdx]) {
          const o = (colorOverrides as any)[__lIdx]!;
          ctx!.fillStyle = `rgba(${o[0]}, ${o[1]}, ${o[2]}, ${0.9 * transitionAlpha})`;
          ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
          continue;
        }
        const lIdx = (l * 255) | 0;
        const gR = coldFinal.r[lIdx],
          gG = coldFinal.g[lIdx],
          gB = coldFinal.b[lIdx];
        const wR = warmFinal.r[lIdx],
          wG = warmFinal.g[lIdx],
          wB = warmFinal.b[lIdx];
        const gA = coldFinal.a[lIdx],
          wA = warmFinal.a[lIdx];
        const oneMinusD = 1 - d;
        const rc = gR * oneMinusD + wR * d;
        const gc = gG * oneMinusD + wG * d;
        const bc = gB * oneMinusD + wB * d;
        const k = (gA * oneMinusD + wA * d) / 255;
        const [R2, G2, B2] = applyTP(rc, gc, bc, effectiveTp, totalHue);
        const finalA = k * transitionAlpha;
        ctx!.fillStyle = `rgba(${R2}, ${G2}, ${B2}, ${finalA})`;
        ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
      }
    }
  };

  // ==================== Public API ====================
  const instance: MatrixRainInstance = {
    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
      canvas.removeEventListener('click', onCanvasClick);
      if (wrapper) wrapper.remove();
      // 用户传入的 canvas 不删 —— 只解除事件监听(上面已经做了);
      // 误删会导致消费者(Vue/React 等)重建实例时丢失原 canvas 节点。
      // 调试钩:从活跃集合移除
      if (typeof window !== 'undefined') __debugInstances.delete(instance as DebugInstance);
    },
    pause() {
      isPaused = true;
    },
    resume() {
      if (isPaused && !isDestroyed) {
        isPaused = false;
        // 防止 pause 期间累积的 dt 引发 phase 跳跃:重置 lastFrameTime,wallTime 继续累积
        lastFrameTime = performance.now();
        rafId = requestAnimationFrame((ts) => draw(ts));
      }
    },
    setTheme(name: ThemeName, themeOptions?: { keepPaletteParams?: boolean }) {
      // 用 applyTheme 助手(与 init 共用),未知主题 → 静默 return
      if (!applyTheme(name)) {
        return;
      }
      // 合并构造时传入的 options.themeParams(同 init 行为)
      if (options.themeParams) tp = { ...tp, ...options.themeParams };
      // 默认重置 ctp/wtp 到新主题 tp;用户传 keepPaletteParams:true 保留自定义
      if (!themeOptions?.keepPaletteParams) {
        ctp = { ...tp };
        wtp = { ...tp };
      }
      // ========== C1 主题切换 HSL 插值 ==========
      // 记录旧 palette(快照)· 启动过渡,dur 内每帧 lerp cold/warm/tp/ctp/wtp
      if (themeTransitionDur > 0) {
        themeTransition = {
          fromCold: { ...oldColdPalette },
          fromWarm: { ...oldWarmPalette },
          fromTp: { ...oldTp },
          fromCtp: { ...oldCtp },
          fromWtp: { ...oldWtp },
          start: wallTime,
          dur: themeTransitionDur,
        };
        // 立即 LUT 失效:during transition,每帧用 interpolated palette 重建
        paletteLUT.setPalettes(coldPalette, warmPalette);
      } else {
        // 立即切换
        paletteLUT.setPalettes(coldPalette, warmPalette);
      }
      // 调试钩:同步主题
      (instance as DebugInstance).__debugTheme = name;
      // 触发 onThemeChange
      fireOnThemeChange(name);
    },
    setThemeParams(params: Partial<ThemeParams>) {
      // ========== C2 主题参数(brightness 等)切换插值 ==========
      if (themeTransitionDur > 0) {
        themeParamsTransition = {
          fromTp: { ...tp },
          fromCtp: { ...ctp },
          fromWtp: { ...wtp },
          start: wallTime,
          dur: themeTransitionDur,
        };
      }
      tp = { ...tp, ...params };
      // 终态 LUT dirty(下次 getColdFinal/getWarmFinal 内部 hash 失配)
    },
    setColdThemeParams(params: Partial<ThemeParams>) {
      if (themeTransitionDur > 0) {
        themeParamsTransition = {
          fromTp: { ...tp },
          fromCtp: { ...ctp },
          fromWtp: { ...wtp },
          start: wallTime,
          dur: themeTransitionDur,
        };
      }
      ctp = { ...ctp, ...params };
    },
    setWarmThemeParams(params: Partial<ThemeParams>) {
      if (themeTransitionDur > 0) {
        themeParamsTransition = {
          fromTp: { ...tp },
          fromCtp: { ...ctp },
          fromWtp: { ...wtp },
          start: wallTime,
          dur: themeTransitionDur,
        };
      }
      wtp = { ...wtp, ...params };
    },
    setHueRotate(speed: number, amount?: number) {
      hueRotateSpeed = speed;
      if (amount !== undefined) hueRotateAmount = amount;
    },
    setColorOverrides(overrides: ColorOverrides | null) {
      colorOverrides = overrides;
      // 函数式:更新缓存(原 const 不能重赋值,所以用 any 转换;实际只读)
      (colorOverrideFn as ColorOverrideFn | null) =
        typeof overrides === 'function' ? overrides : null;
    },
    setColorCurve(code: string | null) {
      if (!code) {
        colorCurve = null;
        diagnostics.colorCurve = undefined;
        return;
      }
      try {
        colorCurve = compileUserFunction(code);
        diagnostics.colorCurve = undefined;
      } catch (e: any) {
        diagnostics.colorCurve = e.message;
        colorCurve = null;
      }
    },
    setTargetBitmap(
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
        lockOrder?:
          | 'random'
          | 'topdown'
          | 'bottomup'
          | 'center'
          | 'edge'
          | 'leftright'
          | 'rightleft';
        lockStability?: number;
        /** 单次覆盖 fitMode(不传则走实例 targetFitMode) */
        fitMode?: 'contain' | 'cover' | 'actual' | 'auto';
        /** 可选:切换 phase 时,跨阶段过渡时长(秒)。不传则走实例默认 phaseTransitionDuration */
        phaseTransitionDuration?: number;
      }
    ) {
      // **兼容**两种传参:直接 Float32Array 或 BitmapSource 包装对象
      const data: Float32Array | null =
        bitmap === null ? null : bitmap instanceof Float32Array ? bitmap : bitmap.data;
      // ==================== 输入校验(audit-security §5 P1 S-03)====================
      // 防止 OOM(10000x10000 Float32Array = 400MB)+ 形状不一致 越界扫描
      const MAX_BITMAP_CELLS = 1_000_000; // 1M 单元上限(1000x1000)
      if (data !== null) {
        // 1) 类型校验:必须是 Float32Array(拦 undefined / 普通 Array / TypedArray 其它类型)
        if (!(data instanceof Float32Array)) {
          throw new Error(
            'setTargetBitmap: bitmap 必须是 Float32Array(或 { cols, rows, data: Float32Array } 包装)'
          );
        }
        // 2) 尺寸上限:防 10000x10000 OOM
        if (data.length > MAX_BITMAP_CELLS) {
          throw new Error(
            `setTargetBitmap: bitmap 单元数 ${data.length} 超过上限 ${MAX_BITMAP_CELLS}(防止 OOM)`
          );
        }
        // 3) 形状一致性(wrap 形式才有 cols/rows 字段)
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
      // ========== B1/B2 阶段切换 crossfade:快照旧状态(若有旧 bitmap 在跑)==========
      const prevPhase = targetPhase;
      const prevActive = targetActive;
      const prevBitmap = targetBitmap;
      if (
        data &&
        prevActive &&
        prevBitmap !== null &&
        opts?.phase !== undefined &&
        opts.phase !== prevPhase
      ) {
        // 跨阶段切换 → 快照旧状态,启动 crossfade
        const dur = opts.phaseTransitionDuration ?? phaseTransitionDur;
        if (dur > 0) {
          oldTargetSnapshot = {
            bitmap: prevBitmap,
            cols: targetCols,
            rows: targetRows,
            anchor: targetAnchor,
            motion: targetMotion,
            motionSpeed: targetMotionSpeed,
            fadeIn: targetFadeIn,
            hold: targetHold,
            fadeOut: targetFadeOut,
            chaos: targetChaos,
            phase: prevPhase,
            startTime: targetStartTime,
            active: true,
            noiseDuration: targetNoiseDuration,
            convergeDuration: targetConvergeDuration,
            lockOrder: targetLockOrder,
            lockStability: targetLockStability,
          };
          phaseTransition = {
            fromPhase: prevPhase,
            start: wallTime,
            dur,
          };
        }
      }
      targetBitmap = data;
      targetFinishFired = false; // 重置 finish 触发标记
      // **记录位图尺寸**·用于位置 / 运动
      if (bitmap && typeof bitmap === 'object' && !(bitmap instanceof Float32Array)) {
        targetCols = bitmap.cols;
        targetRows = bitmap.rows;
      } else if (data) {
        // 纯 Float32Array·需要传 cols/rows·这里用默认值(全屏)
        if (targetCols === 0) targetCols = r;
        if (targetRows === 0) targetRows = i;
      }
      // ==================== A: fitMode 缩放(防止位图溢出 grid)====================
      // 单次覆盖 opts.fitMode 优先,否则走实例 targetFitMode
      if (data && targetCols > 0 && targetRows > 0) {
        applyTargetFitMode(opts?.fitMode);
      }
      if (opts?.fadeIn !== undefined) targetFadeIn = opts.fadeIn;
      if (opts?.hold !== undefined) targetHold = opts.hold;
      if (opts?.fadeOut !== undefined) targetFadeOut = Math.max(0.001, opts.fadeOut);
      if (opts?.chaos !== undefined) targetChaos = Math.max(0, Math.min(1, opts.chaos));
      if (opts?.anchor !== undefined) targetAnchor = opts.anchor;
      if (opts?.motion !== undefined) targetMotion = opts.motion;
      if (opts?.motionSpeed !== undefined) targetMotionSpeed = opts.motionSpeed;
      // 噪声→收敛模式选项
      if (opts?.phase !== undefined) targetPhase = opts.phase;
      if (opts?.noiseDuration !== undefined) targetNoiseDuration = Math.max(0, opts.noiseDuration);
      if (opts?.convergeDuration !== undefined)
        targetConvergeDuration = Math.max(0.001, opts.convergeDuration);
      if (opts?.lockOrder !== undefined) targetLockOrder = opts.lockOrder;
      if (opts?.lockStability !== undefined)
        targetLockStability = Math.max(0, Math.min(1, opts.lockStability));
      if (data) {
        targetStartFrame = f;
        targetStartTime = wallTime; // dt-based 状态机起点
        targetActive = true;
        // 重置所有 cell 的 locked/unlockTime 状态(防跨调用累积)
        resetAllCellLockState();
        // 预计算 lockTime(noise-converge 模式)
        if (targetPhase === 'noise-converge') {
          recomputeTargetLockTimes();
        }
      } else {
        targetActive = false;
      }
    },
    clearTargetBitmap() {
      targetBitmap = null;
      targetActive = false;
      // 清理所有 cell 的 lock 状态(noise-converge 模式)
      resetAllCellLockState();
      // 主动 clear 也触发 finish
      if (!targetFinishFired) {
        targetFinishFired = true;
        fireOnTargetFinish();
      }
    },
    setVariantParams(params: Partial<VariantParams>) {
      // ========== D1 变体切换:记录旧值,启动插值 ==========
      if (variantTransitionDur > 0) {
        variantTransition = {
          fromVp: { ...vp },
          start: wallTime,
          dur: variantTransitionDur,
        };
      }
      vp = { ...vp, ...params };
    },
    setBrightnessCurve(code: string | null) {
      if (!code) {
        userFuncs.brightnessCurve = null;
        diagnostics.brightnessCurve = undefined;
        return;
      }
      try {
        userFuncs.brightnessCurve = compileUserFunction(code);
        diagnostics.brightnessCurve = undefined;
      } catch (e: any) {
        diagnostics.brightnessCurve = e.message;
        userFuncs.brightnessCurve = null;
      }
    },
    setFlickerCurve(code: string | null) {
      if (!code) {
        userFuncs.flickerCurve = null;
        diagnostics.flickerCurve = undefined;
        return;
      }
      try {
        userFuncs.flickerCurve = compileUserFunction(code);
        diagnostics.flickerCurve = undefined;
      } catch (e: any) {
        diagnostics.flickerCurve = e.message;
        userFuncs.flickerCurve = null;
      }
    },
    setPhaseFunc(code: string | null) {
      if (!code) {
        userFuncs.phaseFunc = null;
        diagnostics.phaseFunc = undefined;
        return;
      }
      try {
        userFuncs.phaseFunc = compileUserFunction(code);
        diagnostics.phaseFunc = undefined;
      } catch (e: any) {
        diagnostics.phaseFunc = e.message;
        userFuncs.phaseFunc = null;
      }
    },
    setCharsetFunc(code: string | null) {
      if (!code) {
        userFuncs.charsetFunc = null;
        diagnostics.charsetFunc = undefined;
        return;
      }
      try {
        userFuncs.charsetFunc = compileUserFunction(code);
        diagnostics.charsetFunc = undefined;
      } catch (e: any) {
        diagnostics.charsetFunc = e.message;
        userFuncs.charsetFunc = null;
      }
    },
    setPalettes(cold: Palette, warm: Palette) {
      // ========== C1 主题过渡:记录旧值,启动插值 ==========
      if (themeTransitionDur > 0) {
        oldColdPalette = { ...coldPalette };
        oldWarmPalette = { ...warmPalette };
        themeTransition = {
          fromCold: { ...oldColdPalette },
          fromWarm: { ...oldWarmPalette },
          fromTp: { ...tp },
          fromCtp: { ...ctp },
          fromWtp: { ...wtp },
          start: wallTime,
          dur: themeTransitionDur,
        };
      }
      coldPalette = cold;
      warmPalette = warm;
      // LUT 静态表重建 + 终态表 dirty
      paletteLUT.setPalettes(coldPalette, warmPalette);
    },
    /**
     * 设置过渡 alpha(0=全透明,1=全不透明)
     * - 用于:路由切换/页面离开时优雅淡出;新实例淡入
     * - 不影响性能:在 LUT 输出端乘 alpha,无额外 LUT 重建
     * - alpha=1 时完全等价于未启用
     * - 不传 dur → 立即设置;传 dur → 在 dur 秒内从当前 alpha 渐变到目标 alpha
     */
    setTransitionAlpha(alpha: number, dur?: number) {
      const a = Math.max(0, Math.min(1, alpha));
      if (dur !== undefined && dur > 0) {
        transitionAlphaAnim = {
          start: wallTime,
          dur,
          from: transitionAlpha,
          to: a,
        };
      } else {
        transitionAlpha = a;
        transitionAlphaAnim = null;
      }
    },
    getTransitionAlpha(): number {
      return transitionAlpha;
    },
    setFlickerSpeed(speed: number) {
      cfg = { ...cfg, flickerSpeed: Math.max(0, speed) };
    },
    setTargetFPS(fps: number) {
      targetFPS = Math.max(0, fps);
      fpsAccumMs = 0; // 重置节流累加器,避免改后限频不准
      // 同步 lastFrameTime,避免 first frame elapsed 累积(P-10)
      lastFrameTime = performance.now();
    },
    setDensity(fontSize: number) {
      cfg = { ...cfg, fontSize };
      buildGrid();
    },
    getFPS() {
      return Math.round(fps);
    },
    /**
     * 读取目标位图状态机当前快照(用于 demo 调试 + 单元测试)
     * - phase: 'idle' | 'noise' | 'converge' | 'hold' | 'dissolve'
     * - elapsed: 相对 targetStartTime 的墙钟秒数
     * - lockedCount / totalTargets: 目标区已锁 cell 数 / 总数
     * - lockOrder / targetPhase / noiseDuration / convergeDuration / lockStability
     */
    getTargetState(): {
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
      // ========== 过渡系统快照(测试用)==========
      transitionAlpha: number;
      phaseTransition: {
        fromPhase: 'fade' | 'noise-converge';
        progress: number;
        dur: number;
      } | null;
      themeTransition: { progress: number; dur: number } | null;
      themeParamsTransition: { progress: number; dur: number } | null;
      variantTransition: { progress: number; dur: number } | null;
    } {
      let lockedCount = 0;
      let totalTargets = 0;
      if (targetBitmap && targetActive) {
        const { ox, oy } = computeTargetOrigin();
        for (let s = 0; s < i; s++) {
          for (let h = 0; h < r; h++) {
            const bx = h - ox,
              by = s - oy;
            if (bx >= 0 && bx < targetCols && by >= 0 && by < targetRows) {
              const g = targetBitmap[by * targetCols + bx];
              if (g > 0) {
                totalTargets++;
                if (b[s][h].locked) lockedCount++;
              }
            }
          }
        }
      }
      const elapsed = wallTime - targetStartTime;
      const EPS = 1e-9;
      let phase: 'idle' | 'noise' | 'converge' | 'hold' | 'dissolve' = 'idle';
      if (targetBitmap && targetActive && targetPhase === 'noise-converge') {
        if (elapsed + EPS < targetNoiseDuration) phase = 'noise';
        else if (elapsed + EPS < targetNoiseDuration + targetConvergeDuration) phase = 'converge';
        else if (targetDissolveStartTime < 0) phase = 'hold';
        else phase = 'dissolve';
      }
      return {
        active: !!(targetBitmap && targetActive),
        phase,
        elapsed,
        lockedCount,
        unlockedCount: totalTargets - lockedCount,
        totalTargets,
        lockOrder: targetLockOrder,
        targetPhase,
        noiseDuration: targetNoiseDuration,
        convergeDuration: targetConvergeDuration,
        lockStability: targetLockStability,
        targetDissolveStartTime,
        // ========== 过渡状态快照(测试用)==========
        transitionAlpha,
        phaseTransition: phaseTransition
          ? {
              fromPhase: phaseTransition.fromPhase,
              progress: Math.min(
                1,
                Math.max(0, (wallTime - phaseTransition.start) / phaseTransition.dur)
              ),
              dur: phaseTransition.dur,
            }
          : null,
        themeTransition: themeTransition
          ? {
              progress: Math.min(
                1,
                Math.max(0, (wallTime - themeTransition.start) / themeTransition.dur)
              ),
              dur: themeTransition.dur,
            }
          : null,
        themeParamsTransition: themeParamsTransition
          ? {
              progress: Math.min(
                1,
                Math.max(0, (wallTime - themeParamsTransition.start) / themeParamsTransition.dur)
              ),
              dur: themeParamsTransition.dur,
            }
          : null,
        variantTransition: variantTransition
          ? {
              progress: Math.min(
                1,
                Math.max(0, (wallTime - variantTransition.start) / variantTransition.dur)
              ),
              dur: variantTransition.dur,
            }
          : null,
      };
    },
    getOptions(): MatrixRainOptions {
      return {
        fontSize: cfg.fontSize,
        trailAlpha: cfg.trailAlpha,
        maxDPR: cfg.maxDPR,
        charset,
        coldPalette,
        warmPalette,
        lightCenter: { ...lightCenter },
        driftSpeed: { ...driftSpeed },
        warmthRadius: cfg.warmthRadius,
        warmthLerp: cfg.warmthLerp,
        flickerRates: { ...flicker },
        flickerSpeed: cfg.flickerSpeed,
        targetFPS,
        sparkProbability: cfg.sparkProbability,
        theme: mixedFrom ?? currentThemeName,
        themeParams: { ...tp },
        coldThemeParams: { ...ctp },
        warmThemeParams: { ...wtp },
        hueRotateSpeed,
        hueRotateAmount,
        colorOverrides: colorOverrides ?? undefined,
        variant,
        variantParams: { ...vp },
        targetAnchor,
        targetMotion,
        targetMotionSpeed,
        targetFadeIn,
        targetHold,
        targetFadeOut,
        targetChaos,
        targetPhase,
        targetNoiseDuration,
        targetConvergeDuration,
        targetLockOrder,
        targetLockStability,
        // ========== 过渡系统选项(可序列化)==========
        noiseFadeInDuration: noiseFadeInDur,
        phaseTransitionDuration: phaseTransitionDur,
        cellLockEaseDuration: cellLockEaseDur,
        themeTransitionDuration: themeTransitionDur,
        variantTransitionDuration: variantTransitionDur,
        clickBurst: clickBurstCfg.radius > 0 ? { ...clickBurstCfg } : false,
        cursor: (canvas.style.cursor || undefined) as CursorOption,
      };
    },
    serialize(): string {
      const snapshot: MatrixRainSnapshot = {
        v: 1,
        options: this.getOptions(),
        theme: currentThemeName,
        mixedFrom,
      };
      return JSON.stringify(snapshot);
    },
    getDiagnostics() {
      return { ...diagnostics };
    },
    getClickBurstState() {
      return { active: clickBurstActive, x: clickBurstX, y: clickBurstY, t: clickBurstStart };
    },
  };

  // ==================== Boot ====================
  buildGrid();
  window.addEventListener('resize', onResize);
  rafId = requestAnimationFrame((ts) => draw(ts));

  if (options.onReady) options.onReady(instance);

  // 关联 wrapper → instance(供 MatrixRain.destroyAll 查找)
  if (wrapper) (wrapper as any).__matrixRainInstance = instance;

  // 调试钩:注册到 window.__matrixRainDebug
  if (typeof window !== 'undefined') {
    __ensureDebugHook();
    const di = instance as DebugInstance;
    di.__debugId = __debugNextId++;
    di.__debugTheme = currentThemeName;
    di.__debugVariant = variant;
    __debugInstances.add(di);
  }

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
(matrixRain as any).fromSnapshot = (
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
  // 合并 options(canvas / container 来自调用方)
  const opts: MatrixRainOptions = { ...snap.options, ...(options || {}) };
  return matrixRain(opts);
};

// 注:`detect()` 已迁移到 src/index.ts 的 MatrixRain 命名空间(`MatrixRain.detect()`),
// 涵盖更完整的 9 字段(UA 浏览器型号 / 视口 4 档 / DPR),此处不再重复导出。
