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
  FrameInfo,
  SizeInfo,
  ClickBurstOptions,
  CursorOption,
  MatrixRainSnapshot,
  EnvironmentInfo
} from '../types';
import { VARIANT_DEFAULTS, themes, compileUserFunction, PaletteLUT, applyTP, type RGBALUT, ease, SAFE_GLOBALS } from './core';

const DEFAULTS: Required<Omit<MatrixRainOptions, 'canvas' | 'container' | 'onReady' | 'theme' | 'variant' | 'charset' | 'coldPalette' | 'warmPalette' | 'flickerRates' | 'flickerSpeed' | 'lightCenter' | 'driftSpeed' | 'themeParams' | 'variantParams' | 'brightnessCurve' | 'flickerCurve' | 'phaseFunc' | 'charsetFunc' | 'coldThemeParams' | 'warmThemeParams' | 'hueRotateSpeed' | 'hueRotateAmount' | 'colorOverrides' | 'colorCurve' | 'targetBitmap' | 'targetCols' | 'targetRows' | 'targetAnchor' | 'targetMotion' | 'targetMotionSpeed' | 'targetFadeIn' | 'targetHold' | 'targetFadeOut' | 'targetChaos' | 'fixedTimeStep' | 'enableWhenReducedMotion' | 'coldFrom' | 'warmFrom' | 'onFrame' | 'onResize' | 'onThemeChange' | 'onTargetFinish' | 'clickBurst' | 'cursor'>> = {
  fontSize: 14,
  trailAlpha: 0.18,
  maxDPR: 2,
  warmthRadius: 0.6,
  warmthLerp: 0.04,
  sparkProbability: 0.003,
  targetFPS: 0  // 0 = 不限(默认随 rAF),正数 = 限频(30/24/15/...)
};

const FLICKER_SPEED_DEFAULT = 1;

const DEFAULT_FLICKER = { high: 0.7, mid: 0.4, low: 0.15, dark: 0.04 };

// ==================== 事件节流/防抖常量 ====================
const ONFRAME_THROTTLE_MS = 1000 / 30;  // onFrame 30Hz 节流
const RESIZE_DEBOUNCE_MS = 200;         // onResize debounce

/**
 * 解析主题:支持 ThemeName / { coldFrom, warmFrom } / coldFrom-warmFrom 拼色
 */
const resolveTheme = (
  themeSpec: ThemeName | { coldFrom: ThemeName; warmFrom: ThemeName } | undefined,
  coldFrom: ThemeName | undefined,
  warmFrom: ThemeName | undefined
): {
  cold: Palette; warm: Palette; tp: ThemeParams;
  effectiveName: ThemeName;
  mixedFrom?: { coldFrom: ThemeName; warmFrom: ThemeName }
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
      mixedFrom: { coldFrom: c, warmFrom: w }
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
      mixedFrom: (coldFrom && warmFrom) ? { coldFrom: c, warmFrom: w } : undefined
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
      contrast: t.contrast ?? 1
    },
    effectiveName: name
  };
};

// ==================== DevTools 调试钩 ====================
// window.__matrixRainDebug 暴露活跃实例、聚合 FPS、当前主题
// - 每次 create/destroy 时更新
// - Demo 99-debug.html 用它做实时面板
// - SSR/Node 环境自动跳过(无 window)
type DebugInstance = MatrixRainInstance & { __debugId?: number; __debugTheme?: string; __debugVariant?: string };
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
      return Array.from(__debugInstances).map(i => ({
        id: i.__debugId,
        theme: i.__debugTheme,
        variant: i.__debugVariant,
        fps: i.getFPS()
      }));
    },
    get count() { return __debugInstances.size; },
    get avgFps() {
      const all = Array.from(__debugInstances);
      if (all.length === 0) return 0;
      return Math.round(all.reduce((s, i) => s + i.getFPS(), 0) / all.length);
    },
    destroyAll() {
      Array.from(__debugInstances).forEach(i => { try { i.destroy(); } catch {} });
    }
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
    brightnessCurve: UserFunc | null;  // f(t, h, s, r) → 0-1, 覆盖 brightCurve
    flickerCurve: UserFunc | null;     // f(t, h, s, r) → 0-1, 覆盖 flickerRates
    phaseFunc: UserFunc | null;        // f(t, phase, h, s) → 增量, 累加到 phase
    charsetFunc: UserFunc | null;      // f(t, h, s, ch) → 字符索引
  } = {
    brightnessCurve: null,
    flickerCurve: null,
    phaseFunc: null,
    charsetFunc: null
  };
  if (options.brightnessCurve) {
    try { userFuncs.brightnessCurve = compileUserFunction(options.brightnessCurve); }
    catch (e: any) { diagnostics.brightnessCurve = e.message; console.warn('[matrix-rain] brightnessCurve:', e.message); }
  }
  if (options.flickerCurve) {
    try { userFuncs.flickerCurve = compileUserFunction(options.flickerCurve); }
    catch (e: any) { diagnostics.flickerCurve = e.message; console.warn('[matrix-rain] flickerCurve:', e.message); }
  }
  if (options.phaseFunc) {
    try { userFuncs.phaseFunc = compileUserFunction(options.phaseFunc); }
    catch (e: any) { diagnostics.phaseFunc = e.message; console.warn('[matrix-rain] phaseFunc:', e.message); }
  }
  if (options.charsetFunc) {
    try { userFuncs.charsetFunc = compileUserFunction(options.charsetFunc); }
    catch (e: any) { diagnostics.charsetFunc = e.message; console.warn('[matrix-rain] charsetFunc:', e.message); }
  }

  let a = 0, o = 0;          // viewport w/h
  let r = 0, i = 0;          // cols/rows
  let n = 1;                 // DPR scale
  let f = 0;                 // frame counter
  let b: Cell[][] = [];      // grid
  let ef = 14;               // effective fontSize (窄屏自适应)

  let coldPalette: Palette = (options.coldPalette || themes['silicon-valley']().cold) as Palette;
  let warmPalette: Palette = (options.warmPalette || themes['silicon-valley']().warm) as Palette;
  let tp: ThemeParams = { brightness: 1, chroma: 1, hueShift: 0, saturationShift: 0, lightnessShift: 0, invertHue: 0, contrast: 1 };

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
      contrast: t.contrast ?? 1
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
  let colorOverrides: ColorOverrides | null = (options.colorOverrides as ColorOverrides | null) ?? null;
  // 函数式 colorOverride 缓存(let 以便 setColorOverrides 热更新)
  let colorOverrideFn: ColorOverrideFn | null = typeof colorOverrides === 'function' ? colorOverrides : null;

  // colorCurve userFunc(每帧动态色相偏移,自由度最大)
  let colorCurve: UserFunc | null = options.colorCurve ? (() => {
    try { return compileUserFunction(options.colorCurve!); }
    catch (e: any) { diagnostics.colorCurve = e.message; console.warn('[matrix-rain] colorCurve:', e.message); return null; }
  })() : null;
  let dynamicColorHue = 0;

  // 目标位图状态机(null = 未启用)
  let targetBitmap: Float32Array | null = options.targetBitmap || null;
  let targetCols = options.targetCols ?? 0;   // bitmap 宽(列数)
  let targetRows = options.targetRows ?? 0;   // bitmap 高(行数)
  let targetOriginX = 0;  // bitmap 在 grid 中的起点(列偏移,负值居中时 = (gridCols - targetCols) / 2)
  let targetOriginY = 0;  // 行偏移
  let targetAnchor: 'topLeft' | 'center' | 'topRight' | 'bottomLeft' | 'bottomRight' = options.targetAnchor ?? 'center';
  let targetMotion: 'static' | 'drift' | 'bounce' | 'float' = options.targetMotion ?? 'static';
  let targetMotionSpeed = options.targetMotionSpeed ?? 0.3;  // 网格/秒
  let targetMotionT = 0;  // 动画累计时间
  let targetFadeIn = options.targetFadeIn ?? 0.5;
  let targetHold = options.targetHold ?? Infinity;
  let targetFadeOut = Math.max(0.001, options.targetFadeOut ?? 2.0);
  let targetChaos = Math.max(0, Math.min(1, options.targetChaos ?? 0.5));
  let targetStartFrame = 0;   // 启用时 f 值(保留用于 userFunc/调试)
  let targetStartTime = 0;    // 启用时 wallTime(秒) · 用于 dt-based 状态机
  let targetActive = targetBitmap !== null;
  let targetFinishFired = false;  // 防止 onTargetFinish 重复触发

  // ==================== 交互状态(clickBurst) =====================
  let clickBurstActive = false;
  let clickBurstX = 0;
  let clickBurstY = 0;
  let clickBurstStart = 0;
  const clickBurstCfg: Required<ClickBurstOptions> = (() => {
    const cb = options.clickBurst;
    if (cb === false || cb === undefined) {
      return { radius: 0, intensity: 0, color: [255, 255, 255] as [number, number, number], duration: 0, decay: true };
    }
    const o = typeof cb === 'object' ? cb : {};
    return {
      radius: o.radius ?? 6,
      intensity: Math.max(0, Math.min(1, o.intensity ?? 0.8)),
      color: o.color ?? [255, 255, 255],
      duration: o.duration ?? 0.6,
      decay: o.decay ?? true
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
  const canvas: HTMLCanvasElement = options.canvas || (() => {
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
    canvas.style.cursor = (options.cursor === false ? 'default' : options.cursor);
  }

  // ==================== 事件触发器 ====================
  let lastOnFrameTs = 0;
  const fireOnFrame = (): void => {
    if (!options.onFrame) return;
    const now = performance.now();
    if (now - lastOnFrameTs < ONFRAME_THROTTLE_MS) return;
    lastOnFrameTs = now;
    try { options.onFrame({ f, t: wallTime, dt: lastDt, fps: Math.round(fps) }); }
    catch (e) { /* 用户回调异常吞掉,不阻断主循环 */ }
  };
  const fireOnResize = (): void => {
    if (!options.onResize) return;
    try { options.onResize({ w: a, h: o, cols: r, rows: i }); }
    catch (e) { /* */ }
  };
  const fireOnThemeChange = (newTheme: ThemeName): void => {
    if (!options.onThemeChange) return;
    try { options.onThemeChange(newTheme); } catch (e) { /* */ }
  };
  const fireOnTargetFinish = (): void => {
    if (!options.onTargetFinish) return;
    try { options.onTargetFinish(); } catch (e) { /* */ }
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
  }

  // ==================== Lifecycle ====================
  let rafId: number | null = null;
  let resizeTimer: number | null = null;
  let lastFrameTime = performance.now();
  const startTime = lastFrameTime;
  let wallTime = 0;            // 累积墙钟(秒) · 用于 dt-based 动画
  let lastDt = 1 / 60;          // 上一帧 dt(秒) · 用于相位累积
  let fps = 60;
  let isPaused = prefersReducedMotion;  // prefers-reduced-motion → 启动暂停(可访问性 + 省电)
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
    if (windowMs >= 500) {  // 0.5s 滑窗
      fps = (fpsWindowCount * 1000) / windowMs;
      fpsWindowStart = now;
      fpsWindowCount = 0;
    }
  };

  const buildGrid = () => {
    n = Math.min(window.devicePixelRatio || 1, cfg.maxDPR);
    // 关键修复:从 canvas 自身的实际展示尺寸读,而不是从 container 读
    // wrapper 是 position:fixed;inset:0,canvas 是 100%×100%,所以 canvas 实际显示尺寸 = viewport 尺寸
    // 这样无论 PC / mobile / 横竖屏 / 嵌入小 cell / CSS 拉伸,backing store 永远 1:1,字符不被压扇
    const rect = canvas.getBoundingClientRect();
    a = rect.width  || window.innerWidth  || 1;
    o = rect.height || window.innerHeight || 1;
    // 只设 backing store,不再设 canvas.style.width/height —— 让 CSS 100% 接管,避免冲突
    canvas.width  = Math.max(1, Math.round(a * n));
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
          warmth: Math.random()
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
    Array: SAFE_GLOBALS.Array
  };
  // 同步 grid 尺寸到 ctx(避免 userFunc 读到旧 W/H)
  const syncFrameCtxSize = () => {
    __frameCtx.W = r;
    __frameCtx.H = i;
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
        fpsAccumMs = fpsAccumMs % minInterval;  // 补上一帧多余时间
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
          lastDt = Math.min(0.1, Math.max(0, rawDt));   // 上限 100ms,下限 0
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

      // ==================== Palette LUT(每帧一次)====================
      // 拿冷暖两色终态 LUT:TP 或 hue 变化时内部 hash 失配会自动重建
      const coldFinal = paletteLUT.getColdFinal(ctp, totalHue);
      const warmFinal = paletteLUT.getWarmFinal(wtp, totalHue);

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
  const drawInner = (c: Cell, h: number, s: number, y: number, l: number, M: number, p: number, coldFinal: RGBALUT, warmFinal: RGBALUT, totalHue: number) => {
    // warmth 阻尼
    const C = h - M, A = s - p;
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
      const out = colorOverrideFn(__lIdx, h, s, { ch: c.ch, warmth: d, bright: c.bright, phase: c.phase });
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
    const gR = coldFinal.r[lIdx], gG = coldFinal.g[lIdx], gB = coldFinal.b[lIdx];
    const wR = warmFinal.r[lIdx], wG = warmFinal.g[lIdx], wB = warmFinal.b[lIdx];
    const gA = coldFinal.a[lIdx], wA = warmFinal.a[lIdx];
    const oneMinusD = 1 - d;
    const rc = gR * oneMinusD + wR * d;
    const gc = gG * oneMinusD + wG * d;
    const bc = gB * oneMinusD + wB * d;
    const k = (gA * oneMinusD + wA * d) / 255;
    const [R2, G2, B2] = applyTP(rc, gc, bc, tp, totalHue);
    ctx!.fillStyle = `rgba(${R2}, ${G2}, ${B2}, ${k})`;
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
    for (let s = 0; s < i; s++) {
      const y = s * ef * 1.1 + ef * 0.55;
      for (let h = 0; h < r; h++) {
        const c = b[s][h];
        // phase 增量(dt-based:60fps 时与原 f-step 等价)
        const basePhaseInc = (vp.phaseStep + Math.random() * vp.phaseJitter) * (cfg.flickerSpeed ?? FLICKER_SPEED_DEFAULT);
        if (userFuncs.phaseFunc) {
          __frameCtx.h = h; __frameCtx.s = s; __frameCtx.phase = c.phase;
          __frameCtx.L = c.bright; __frameCtx.ch = c.ch; __frameCtx.r = Math.random();
          c.phase += Number(userFuncs.phaseFunc(__frameCtx)) || 0;
        } else {
          c.phase += basePhaseInc * lastDt * 60;
        }
        const W =
          Math.sin(c.phase) * vp.sinWeightA +
          Math.sin((h + s) * 0.05 + fBase1) * vp.sinWeightB +
          Math.sin(h * 0.1 - s * 0.07 + fBase2) * vp.sinWeightC;
        // 亮度
        let l: number;
        if (userFuncs.brightnessCurve) {
          __frameCtx.h = h; __frameCtx.s = s; __frameCtx.phase = c.phase;
          __frameCtx.L = c.bright; __frameCtx.ch = c.ch; __frameCtx.r = Math.random();
          const u = Number(userFuncs.brightnessCurve(__frameCtx));
          l = Math.max(0, Math.min(1, isNaN(u) ? 0 : u));
        } else {
          l = Math.max(0, Math.min(1, (W + 1) * 0.5));
        }
        if (Math.random() < cfg.sparkProbability) l = 1;
        c.bright = l;

        // 目标位图覆盖(文字/图片) · 颜色不变,只改亮度
        if (targetBitmap && targetActive) {
          let ox = 0, oy = 0;
          if (targetAnchor === 'center') {
            ox = (r - targetCols) >> 1;
            oy = (i - targetRows) >> 1;
          } else if (targetAnchor === 'topRight') {
            ox = r - targetCols; oy = 0;
          } else if (targetAnchor === 'bottomLeft') {
            ox = 0; oy = i - targetRows;
          } else if (targetAnchor === 'bottomRight') {
            ox = r - targetCols; oy = i - targetRows;
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
              else if (elapsed > targetFadeIn + targetHold) vis = Math.max(0, 1 - (elapsed - targetFadeIn - targetHold) / targetFadeOut);
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

        // 闪烁 / 字符更新
        let F: number;
        if (userFuncs.flickerCurve) {
          __frameCtx.h = h; __frameCtx.s = s; __frameCtx.phase = c.phase;
          __frameCtx.L = l; __frameCtx.ch = c.ch; __frameCtx.r = Math.random();
          F = Number(userFuncs.flickerCurve(__frameCtx)) || 0;
        } else {
          F = l >= 0.66 ? flicker.high : l >= 0.33 ? flicker.mid : l >= 0.05 ? flicker.low : flicker.dark;
        }
        if (Math.random() < F) c.ch = Math.floor(Math.random() * charset.length);
        if (vp.chUpdateProb > 0 && Math.random() < vp.chUpdateProb) c.ch = Math.floor(Math.random() * charset.length);
        if (userFuncs.charsetFunc) {
          __frameCtx.h = h; __frameCtx.s = s; __frameCtx.phase = c.phase;
          __frameCtx.L = l; __frameCtx.ch = c.ch; __frameCtx.r = Math.random();
          const u = Number(userFuncs.charsetFunc(__frameCtx));
          if (!isNaN(u)) c.ch = Math.max(0, Math.min(charset.length - 1, Math.floor(u)));
        }

        drawInner(c, h, s, y, l, M, p, coldFinal, warmFinal, totalHue);
      }
    }
  };

  const drawAvalanche = (M: number, p: number, coldFinal: RGBALUT, warmFinal: RGBALUT) => {
    const totalHue = dynamicHue + dynamicColorHue;
    __frameCtx.f = f;
    __frameCtx.t = wallTime;
    const yPosSpeed = vp.avalancheSpeed;
    for (let s = 0; s < i; s++) {
      for (let h = 0; h < r; h++) {
        const c = b[s][h];
        // yPos 移动(dt-based;60fps 等价)
        c.yPos! += c.speed! * yPosSpeed * lastDt * 60;
        if (c.yPos! > i) c.yPos = 0;

        const distFromHead = Math.abs(s - Math.floor(c.yPos!));
        const l = Math.max(0, Math.min(1, (c.headBright! - Math.pow(distFromHead, vp.headFalloff)) / 8));
        c.bright = l;

        if (Math.random() < vp.chUpdateProb) c.ch = Math.floor(Math.random() * charset.length);
        if (l < 0.02) continue;  // 走老路径的 continue,仅 brightness 计算

        const d = Math.max(0, Math.min(1, c.warmth));
        const C = h - M, A = s - p;
        const B = Math.sqrt(C * C + A * A);
        const H = Math.max(0, 1 - B / (i * cfg.warmthRadius));
        c.warmth += (H - c.warmth) * cfg.warmthLerp;

        const y = c.yPos! * ef * 1.1;
        const __lIdx = (l * 9) | 0;
        if (colorOverrides && (colorOverrides as any)[__lIdx]) {
          const o = (colorOverrides as any)[__lIdx]!;
          ctx!.fillStyle = `rgba(${o[0]}, ${o[1]}, ${o[2]}, 0.9)`;
          ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
          continue;
        }
        const lIdx = (l * 255) | 0;
        const gR = coldFinal.r[lIdx], gG = coldFinal.g[lIdx], gB = coldFinal.b[lIdx];
        const wR = warmFinal.r[lIdx], wG = warmFinal.g[lIdx], wB = warmFinal.b[lIdx];
        const gA = coldFinal.a[lIdx], wA = warmFinal.a[lIdx];
        const oneMinusD = 1 - d;
        const rc = gR * oneMinusD + wR * d;
        const gc = gG * oneMinusD + wG * d;
        const bc = gB * oneMinusD + wB * d;
        const k = (gA * oneMinusD + wA * d) / 255;
        const [R2, G2, B2] = applyTP(rc, gc, bc, tp, totalHue);
        ctx!.fillStyle = `rgba(${R2}, ${G2}, ${B2}, ${k})`;
        ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
      }
    }
  };

  const drawRipple = (M: number, p: number, coldFinal: RGBALUT, warmFinal: RGBALUT) => {
    const totalHue = dynamicHue + dynamicColorHue;
    __frameCtx.f = f;
    __frameCtx.t = wallTime;
    for (let s = 0; s < i; s++) {
      const y = s * ef * 1.1 + ef * 0.55;
      for (let h = 0; h < r; h++) {
        const c = b[s][h];
        c.phase += (vp.phaseStep + Math.random() * vp.phaseJitter) * (cfg.flickerSpeed ?? FLICKER_SPEED_DEFAULT) * lastDt * 60;
        const W = Math.sin(c.phase) * vp.sinWeightA + 0.5;
        const l = Math.max(0, Math.min(1, W));
        c.bright = l;

        if (Math.random() < vp.chUpdateProb) c.ch = Math.floor(Math.random() * charset.length);
        if (l < 0.02) continue;

        // 走简化路径(无 colorOverride 文档提及的 ripple 路径,但保留兼容)
        const C = h - M, A = s - p;
        const B = Math.sqrt(C * C + A * A);
        const H = Math.max(0, 1 - B / (i * cfg.warmthRadius));
        c.warmth += (H - c.warmth) * cfg.warmthLerp;
        const d = Math.max(0, Math.min(1, c.warmth));

        const __lIdx = (l * 9) | 0;
        if (colorOverrides && (colorOverrides as any)[__lIdx]) {
          const o = (colorOverrides as any)[__lIdx]!;
          ctx!.fillStyle = `rgba(${o[0]}, ${o[1]}, ${o[2]}, 0.9)`;
          ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
          continue;
        }
        const lIdx = (l * 255) | 0;
        const gR = coldFinal.r[lIdx], gG = coldFinal.g[lIdx], gB = coldFinal.b[lIdx];
        const wR = warmFinal.r[lIdx], wG = warmFinal.g[lIdx], wB = warmFinal.b[lIdx];
        const gA = coldFinal.a[lIdx], wA = warmFinal.a[lIdx];
        const oneMinusD = 1 - d;
        const rc = gR * oneMinusD + wR * d;
        const gc = gG * oneMinusD + wG * d;
        const bc = gB * oneMinusD + wB * d;
        const k = (gA * oneMinusD + wA * d) / 255;
        const [R2, G2, B2] = applyTP(rc, gc, bc, tp, totalHue);
        ctx!.fillStyle = `rgba(${R2}, ${G2}, ${B2}, ${k})`;
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
      else canvas.remove();
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
      // 用 applyTheme 助手(与 init 共用),未知主题 → 警告而非静默
      if (!applyTheme(name)) {
        const available = Object.keys(themes).join(', ');
        console.warn(`[matrix-rain] setTheme: unknown theme "${name}". Available: ${available}`);
        return;
      }
      // 合并构造时传入的 options.themeParams(同 init 行为)
      if (options.themeParams) tp = { ...tp, ...options.themeParams };
      // 默认重置 ctp/wtp 到新主题 tp;用户传 keepPaletteParams:true 保留自定义
      if (!themeOptions?.keepPaletteParams) {
        ctp = { ...tp };
        wtp = { ...tp };
      }
      // LUT 失效:静态 LUT 重建(cold/warm 引用变了),终态 LUT dirty
      paletteLUT.setPalettes(coldPalette, warmPalette);
      // 调试钩:同步主题
      (instance as DebugInstance).__debugTheme = name;
      // 触发 onThemeChange
      fireOnThemeChange(name);
    },
    setThemeParams(params: Partial<ThemeParams>) {
      tp = { ...tp, ...params };
      // 终态 LUT dirty(下次 getColdFinal/getWarmFinal 内部 hash 失配)
    },
    setColdThemeParams(params: Partial<ThemeParams>) {
      ctp = { ...ctp, ...params };
    },
    setWarmThemeParams(params: Partial<ThemeParams>) {
      wtp = { ...wtp, ...params };
    },
    setHueRotate(speed: number, amount?: number) {
      hueRotateSpeed = speed;
      if (amount !== undefined) hueRotateAmount = amount;
    },
    setColorOverrides(overrides: ColorOverrides | null) {
      colorOverrides = overrides;
      // 函数式:更新缓存(原 const 不能重赋值,所以用 any 转换;实际只读)
      (colorOverrideFn as ColorOverrideFn | null) = typeof overrides === 'function' ? overrides : null;
    },
    setColorCurve(code: string | null) {
      if (!code) { colorCurve = null; diagnostics.colorCurve = undefined; return; }
      try { colorCurve = compileUserFunction(code); diagnostics.colorCurve = undefined; }
      catch (e: any) { diagnostics.colorCurve = e.message; console.warn('[matrix-rain] colorCurve:', e.message); colorCurve = null; }
    },
    setTargetBitmap(bitmap: Float32Array | { cols: number; rows: number; data: Float32Array } | null, opts?: { fadeIn?: number; hold?: number; fadeOut?: number; chaos?: number; anchor?: 'topLeft'|'center'|'topRight'|'bottomLeft'|'bottomRight'; motion?: 'static'|'drift'|'bounce'|'float'; motionSpeed?: number }) {
      // **兼容**两种传参:直接 Float32Array 或 BitmapSource 包装对象
      const data: Float32Array | null = bitmap === null
        ? null
        : (bitmap instanceof Float32Array ? bitmap : bitmap.data);
      targetBitmap = data;
      targetFinishFired = false;  // 重置 finish 触发标记
      // **记录位图尺寸**·用于位置 / 运动
      if (bitmap && typeof bitmap === 'object' && !(bitmap instanceof Float32Array)) {
        targetCols = bitmap.cols;
        targetRows = bitmap.rows;
      } else if (data) {
        // 纯 Float32Array·需要传 cols/rows·这里用默认值(全屏)
        if (targetCols === 0) targetCols = r;
        if (targetRows === 0) targetRows = i;
      }
      if (opts?.fadeIn !== undefined) targetFadeIn = opts.fadeIn;
      if (opts?.hold !== undefined) targetHold = opts.hold;
      if (opts?.fadeOut !== undefined) targetFadeOut = Math.max(0.001, opts.fadeOut);
      if (opts?.chaos !== undefined) targetChaos = Math.max(0, Math.min(1, opts.chaos));
      if (opts?.anchor !== undefined) targetAnchor = opts.anchor;
      if (opts?.motion !== undefined) targetMotion = opts.motion;
      if (opts?.motionSpeed !== undefined) targetMotionSpeed = opts.motionSpeed;
      if (data) {
        targetStartFrame = f;
        targetStartTime = wallTime;   // dt-based 状态机起点
        targetActive = true;
      } else {
        targetActive = false;
      }
    },
    clearTargetBitmap() {
      targetBitmap = null;
      targetActive = false;
      // 主动 clear 也触发 finish
      if (!targetFinishFired) {
        targetFinishFired = true;
        fireOnTargetFinish();
      }
    },
    setVariantParams(params: Partial<VariantParams>) {
      vp = { ...vp, ...params };
    },
    setBrightnessCurve(code: string | null) {
      if (!code) { userFuncs.brightnessCurve = null; diagnostics.brightnessCurve = undefined; return; }
      try { userFuncs.brightnessCurve = compileUserFunction(code); diagnostics.brightnessCurve = undefined; }
      catch (e: any) { diagnostics.brightnessCurve = e.message; console.warn('[matrix-rain] brightnessCurve:', e.message); userFuncs.brightnessCurve = null; }
    },
    setFlickerCurve(code: string | null) {
      if (!code) { userFuncs.flickerCurve = null; diagnostics.flickerCurve = undefined; return; }
      try { userFuncs.flickerCurve = compileUserFunction(code); diagnostics.flickerCurve = undefined; }
      catch (e: any) { diagnostics.flickerCurve = e.message; console.warn('[matrix-rain] flickerCurve:', e.message); userFuncs.flickerCurve = null; }
    },
    setPhaseFunc(code: string | null) {
      if (!code) { userFuncs.phaseFunc = null; diagnostics.phaseFunc = undefined; return; }
      try { userFuncs.phaseFunc = compileUserFunction(code); diagnostics.phaseFunc = undefined; }
      catch (e: any) { diagnostics.phaseFunc = e.message; console.warn('[matrix-rain] phaseFunc:', e.message); userFuncs.phaseFunc = null; }
    },
    setCharsetFunc(code: string | null) {
      if (!code) { userFuncs.charsetFunc = null; diagnostics.charsetFunc = undefined; return; }
      try { userFuncs.charsetFunc = compileUserFunction(code); diagnostics.charsetFunc = undefined; }
      catch (e: any) { diagnostics.charsetFunc = e.message; console.warn('[matrix-rain] charsetFunc:', e.message); userFuncs.charsetFunc = null; }
    },
    setPalettes(cold: Palette, warm: Palette) {
      coldPalette = cold;
      warmPalette = warm;
      // LUT 静态表重建 + 终态表 dirty
      paletteLUT.setPalettes(coldPalette, warmPalette);
    },
    setFlickerSpeed(speed: number) {
      cfg = { ...cfg, flickerSpeed: Math.max(0, speed) };
    },
    setTargetFPS(fps: number) {
      targetFPS = Math.max(0, fps);
      fpsAccumMs = 0;  // 重置节流累加器,避免改后限频不准
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
        clickBurst: clickBurstCfg.radius > 0 ? { ...clickBurstCfg } : false,
        cursor: (canvas.style.cursor || undefined) as CursorOption
      };
    },
    serialize(): string {
      const snapshot: MatrixRainSnapshot = {
        v: 1,
        options: this.getOptions(),
        theme: currentThemeName,
        mixedFrom
      };
      return JSON.stringify(snapshot);
    },
    getDiagnostics() {
      return { ...diagnostics };
    },
    getClickBurstState() {
      return { active: clickBurstActive, x: clickBurstX, y: clickBurstY, t: clickBurstStart };
    }
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

/**
 * 环境检测(浏览器):移动端 / 暗色模式 → 推荐默认值
 * 用户可手动覆盖:
 *   const env = matrixRain.detect();
 *   matrixRain({ fontSize: env.recommendedFontSize, targetFPS: env.recommendedTargetFPS, ... })
 */
(matrixRain as any).detect = (): EnvironmentInfo => {
  const isMobile = typeof window !== 'undefined' && (
    /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator?.userAgent || '') ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  );
  const isDarkMode = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true;
  return {
    isMobile,
    isDarkMode,
    recommendedFontSize: isMobile ? 16 : 14,
    recommendedTargetFPS: isMobile ? 30 : 0,
    recommendedBrightness: isDarkMode ? 1.1 : 1.0
  };
};
