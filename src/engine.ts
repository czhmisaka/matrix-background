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
  VariantParams
} from '../types';
import { VARIANT_DEFAULTS } from './variant-defaults';
import { themes } from './themes';
import { compileUserFunction } from './curves/sandbox';

const DEFAULTS: Required<Omit<MatrixRainOptions, 'canvas' | 'container' | 'onReady' | 'theme' | 'variant' | 'charset' | 'coldPalette' | 'warmPalette' | 'flickerRates' | 'flickerSpeed' | 'lightCenter' | 'driftSpeed' | 'themeParams' | 'variantParams' | 'brightnessCurve' | 'flickerCurve' | 'phaseFunc' | 'charsetFunc' | 'coldThemeParams' | 'warmThemeParams' | 'hueRotateSpeed' | 'hueRotateAmount' | 'colorOverrides' | 'colorCurve' | 'targetBitmap' | 'targetCols' | 'targetRows' | 'targetAnchor' | 'targetMotion' | 'targetMotionSpeed' | 'targetFadeIn' | 'targetHold' | 'targetFadeOut' | 'targetChaos'>> = {
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
    try { userFuncs.brightnessCurve = compileUserFunction(options.brightnessCurve); } catch (e) { console.warn('[matrix-rain] brightnessCurve:', e); }
  }
  if (options.flickerCurve) {
    try { userFuncs.flickerCurve = compileUserFunction(options.flickerCurve); } catch (e) { console.warn('[matrix-rain] flickerCurve:', e); }
  }
  if (options.phaseFunc) {
    try { userFuncs.phaseFunc = compileUserFunction(options.phaseFunc); } catch (e) { console.warn('[matrix-rain] phaseFunc:', e); }
  }
  if (options.charsetFunc) {
    try { userFuncs.charsetFunc = compileUserFunction(options.charsetFunc); } catch (e) { console.warn('[matrix-rain] charsetFunc:', e); }
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
  if (options.theme && themes[options.theme]) {
    const t = themes[options.theme]();
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
  }
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

  // 颜色注入(覆盖特定亮度档)
  let colorOverrides: Record<number, [number, number, number]> | null = options.colorOverrides || null;

  // colorCurve userFunc(每帧动态色相偏移,自由度最大)
  let colorCurve: UserFunc | null = options.colorCurve ? (() => {
    try { return compileUserFunction(options.colorCurve!); } catch (e) { console.warn('[matrix-rain] colorCurve:', e); return null; }
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
  let targetFadeOut = options.targetFadeOut ?? 2.0;
  let targetChaos = options.targetChaos ?? 0.5;
  let targetStartFrame = 0;   // 启用时 f 值
  let targetActive = targetBitmap !== null;


  // HSV 转换辅助(应用 brightness + chroma + hueShift 到一个 RGB)
  const applyTP = (r: number, g: number, b: number, useTP?: ThemeParams, extraHue: number = 0): [number, number, number] => {
    const p = useTP || tp;
    const hueExtra = extraHue;
    // brightness
    r *= p.brightness; g *= p.brightness; b *= p.brightness;
    // contrast(在 128 中心点拉伸,0=全灰,1=原,2=极端)
    if (p.contrast !== 1) {
      r = 128 + (r - 128) * p.contrast;
      g = 128 + (g - 128) * p.contrast;
      b = 128 + (b - 128) * p.contrast;
    }
    // lightnessShift(±255 加成, clamp 0-255)
    if (p.lightnessShift !== 0) {
      r += p.lightnessShift * 255;
      g += p.lightnessShift * 255;
      b += p.lightnessShift * 255;
    }
    // saturationShift(±1: -1=全灰, 0=原, +1=最大饱和)
    if (p.saturationShift !== 0) {
      const avg = (r + g + b) / 3;
      const m = 1 + p.saturationShift; // 0 表示全灰
      r = avg + (r - avg) * m;
      g = avg + (g - avg) * m;
      b = avg + (b - avg) * m;
    }
    // chroma(0=灰阶, 1=原色)
    if (p.chroma < 1) {
      const avg = (r + g + b) / 3;
      r = avg + (r - avg) * p.chroma;
      g = avg + (g - avg) * p.chroma;
      b = avg + (b - avg) * p.chroma;
    }
    // hueShift(HSL 上的 H 偏移)
    if (p.hueShift !== 0) {
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        let h: number;
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = h * 60 + p.hueShift + hueExtra; // 度数
        h = ((h % 360) + 360) % 360;
        const c = (1 - Math.abs(2 * l / 255 - 1)) * (max - min);
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m2 = l - c / 2;
        let nr = 0, ng = 0, nb = 0;
        if (h < 60) { nr = c; ng = x; nb = 0; }
        else if (h < 120) { nr = x; ng = c; nb = 0; }
        else if (h < 180) { nr = 0; ng = c; nb = x; }
        else if (h < 240) { nr = 0; ng = x; nb = c; }
        else if (h < 300) { nr = x; ng = 0; nb = c; }
        else { nr = c; ng = 0; nb = x; }
        r = (nr + m2); g = (ng + m2); b = (nb + m2);
      }
    }
    // invertHue(0=正常, 1=反色)
    if (p.invertHue > 0) {
      const k = p.invertHue;
      r = r * (1 - k) + (255 - r) * k;
      g = g * (1 - k) + (255 - g) * k;
      b = b * (1 - k) + (255 - b) * k;
    }
    return [
      Math.max(0, Math.min(255, Math.round(r))),
      Math.max(0, Math.min(255, Math.round(g))),
      Math.max(0, Math.min(255, Math.round(b)))
    ];
  };

  const charset: string = options.charset || '0123456789';
  const flicker = { ...DEFAULT_FLICKER, ...(options.flickerRates || {}) };
  // flickerSpeed 存进 cfg 以便热更新;不需重建
  const lightCenter = options.lightCenter || { x: 0.7, y: 0.3 };
  const driftSpeed = options.driftSpeed || { x: 0.008, y: 0.006 };

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
  let fps = 60;
  let isPaused = false;
  let isDestroyed = false;
  // FPS 节流(0 = 不限,与 rAF 同频;>0 = 跳过中间帧)
  let targetFPS = options.targetFPS ?? 0;
  let fpsAccumMs = 0;

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

  // ==================== FPS 计时初始化 ====================
  let fpsWindowStart = performance.now();
  let fpsWindowCount = 0;

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
  };

  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(buildGrid, 150);
  };

  // 始终监听 canvas 自身的实际展示尺寸变化 —— 不管 container 是 body 还是嵌入元素
  // 这样 PC / mobile / 浏览器缩放 / 横竖屏切换 / CSS 拉伸 都会触发重建
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => onResize());
    ro.observe(canvas);
  }

  const draw = () => {
    if (isPaused || isDestroyed) return;
    // FPS 节流:targetFPS>0 时,间距<帧间隔的跳帧(但仍调 rAF 以保持动画连续感)
    let isSkipped = false;
    if (targetFPS > 0) {
      const now = performance.now();
      fpsAccumMs += now - lastFrameTime;
      lastFrameTime = now;
      const minInterval = 1000 / targetFPS;
      if (fpsAccumMs < minInterval) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      fpsAccumMs = fpsAccumMs % minInterval;  // 补上一帧多余时间
    }
    // 实际画出帧时才记 FPS
    computeFPS();
    f++;

    // 本帧动态色相偏移(时间驱动色相旋转,每帧重算)
    dynamicHue = hueRotateSpeed !== 0 ? (f * 0.016 * hueRotateSpeed) % hueRotateAmount : 0;
    // colorCurve userFunc 计算额外色相偏移
    if (colorCurve) {
      dynamicColorHue = Number(colorCurve({ t: f * 0.016, phase: 0, h: 0, s: 0, r: Math.random(), f, W: r, H: i, L: 0, ch: 0, sin: Math.sin, cos: Math.cos, tan: Math.tan, noise: (x: number) => { const n = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return n - Math.floor(n); }, PI: Math.PI, E: Math.E, clamp: (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)), lerp: (a: number, b: number, t: number) => a + (b - a) * t, ease: null as any })) || 0;
    } else {
      dynamicColorHue = 0;
    }

    // ① 残影拖尾
    ctx!.fillStyle = `rgba(8, 8, 18, ${cfg.trailAlpha})`;
    ctx!.fillRect(0, 0, a, o);

    ctx!.font = `${ef}px "JetBrains Mono", ui-monospace, monospace`;
    ctx!.textBaseline = 'middle';
    ctx!.textAlign = 'center';

    // ② 温度光心(Lissajous 漂移)
    const M = r * lightCenter.x + Math.cos(f * driftSpeed.x) * r * 0.2;
    const p = i * lightCenter.y + Math.sin(f * driftSpeed.y) * i * 0.2;

    // ③ 绘制
    if (variant === 'classic' || variant === 'ascii') {
      drawClassic(M, p);
    } else if (variant === 'avalanche') {
      drawAvalanche(M, p);
    } else if (variant === 'ripple') {
      drawRipple(M, p);
    }

    rafId = requestAnimationFrame(draw);
  };

  // HSL 调色板 → RGBA 公式生成(连续 0-1 亮度, 256 颗粒度)
  // 返回 [r, g, b, a]
  const hslToRGBA = (palette: import('../types').HSLPalette, l: number): [number, number, number, number] => {
    const li = Math.max(0, Math.min(1, l));
    // lMin/lMax 之间线性插值
    const L = palette.lMin + (palette.lMax - palette.lMin) * li;
    const S = palette.s;
    const H = palette.h / 360;
    const aMax = palette.aMax ?? 1.0;
    // alpha: 从 l=0 透明 渐到 lMax 完全不透明
    const a = aMax * (0.1 + 0.9 * li);
    if (S === 0) {
      const v = Math.round(L * 255);
      return [v, v, v, a];
    }
    const c = (1 - Math.abs(2 * L - 1)) * S;
    const hh = H * 6;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hh < 1) { r = c; g = x; b = 0; }
    else if (hh < 2) { r = x; g = c; b = 0; }
    else if (hh < 3) { r = 0; g = c; b = x; }
    else if (hh < 4) { r = 0; g = x; b = c; }
    else if (hh < 5) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    const m = L - c / 2;
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
      a
    ];
  };

  // Sandbox context builder(每帧调用,供 userFunc 使用)
  const buildCtx = (h: number, s: number, c: Cell, L: number): import('./curves/sandbox').SandboxContext => ({
    t: f * 0.016,
    phase: c.phase,
    h,
    s,
    r: Math.random(),
    f,
    W: r,
    H: i,
    L,
    ch: c.ch,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    noise: (x: number) => {
      const n = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
      return n - Math.floor(n);
    },
    PI: Math.PI,
    E: Math.E,
    clamp: (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
    lerp: (a: number, b: number, t: number) => a + (b - a) * t,
    ease: null as any  // ease 依赖 sandbox eval,在 user code 内 import 不到;保留为 null
  });

  const drawClassic = (M: number, p: number) => {
    for (let s = 0; s < i; s++) {
      const y = s * ef * 1.1 + ef * 0.55;
      for (let h = 0; h < r; h++) {
        const c = b[s][h];
        // phase 增量
        const basePhaseInc = (vp.phaseStep + Math.random() * vp.phaseJitter) * (cfg.flickerSpeed ?? FLICKER_SPEED_DEFAULT);
        if (userFuncs.phaseFunc) {
          const ctxObj = buildCtx(h, s, c, c.bright);
          c.phase += Number(userFuncs.phaseFunc(ctxObj)) || 0;
        } else {
          c.phase += basePhaseInc;
        }
        const W =
          Math.sin(c.phase) * vp.sinWeightA +
          Math.sin((h + s) * 0.05 + f * 0.02) * vp.sinWeightB +
          Math.sin(h * 0.1 - s * 0.07 + f * 0.015) * vp.sinWeightC;
        // 亮度
        let l: number;
        if (userFuncs.brightnessCurve) {
          const u = Number(userFuncs.brightnessCurve(buildCtx(h, s, c, c.bright)));
          l = Math.max(0, Math.min(1, isNaN(u) ? 0 : u));
        } else {
          l = Math.max(0, Math.min(1, (W + 1) * 0.5));
        }
        if (Math.random() < cfg.sparkProbability) l = 1;
        c.bright = l;

        // 目标位图覆盖(文字/图片) · 颜色不变,只改亮度
        if (targetBitmap && targetActive) {
          // **位置/运动**计算
          // **重要**: engine 里的 s 走 i (行),h 走 r (列)
          // s = 行索引, h = 列索引
          // ox = 列偏移(横向), oy = 行偏移(纵向)
          let ox = 0, oy = 0;
          if (targetAnchor === 'center') {
            ox = Math.floor((r - targetCols) / 2);
            oy = Math.floor((i - targetRows) / 2);
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
          // **运动**:每帧微调 origin
          if (targetMotion === 'drift') {
            // 匀速横向漂(包边)
            const period = (r + targetCols) / Math.max(0.1, targetMotionSpeed);
            const t = (f - targetStartFrame) * 0.016;
            const phase = (t % period) / period;
            ox = Math.floor(ox + phase * (r + targetCols)) - targetCols;
          } else if (targetMotion === 'bounce') {
            // 贪食蛇 式反弹
            const period = (2 * (r - targetCols)) / Math.max(0.1, targetMotionSpeed);
            const t = (f - targetStartFrame) * 0.016;
            const phase = (t % period) / period;
            const d = phase < 0.5 ? phase * 2 : 2 - phase * 2;
            ox = Math.floor(d * (r - targetCols));
          } else if (targetMotion === 'float') {
            // 上下浮动(柔)
            const t = (f - targetStartFrame) * 0.016;
            oy = Math.floor(oy + Math.sin(t * targetMotionSpeed * 2) * 3);
          }
          // **正确映射**: grid (行=s, 列=h) → bitmap (行=by, 列=bx)
          // bx = 列 = h - 列偏移 ox
          // by = 行 = s - 行偏移 oy
          const bx = h - ox;
          const by = s - oy;
          if (bx >= 0 && bx < targetCols && by >= 0 && by < targetRows) {
            const g = targetBitmap[by * targetCols + bx];
            if (g !== undefined && g > 0) {
              // 状态机计算可见性 0-1 (淑入/保持/淑出)
              const elapsed = (f - targetStartFrame) * 0.016;
              let vis = 1;
              if (elapsed < targetFadeIn) vis = elapsed / targetFadeIn;
              else if (elapsed > targetFadeIn + targetHold) vis = Math.max(0, 1 - (elapsed - targetFadeIn - targetHold) / targetFadeOut);
              // 淑出完成 → 清除
              if (elapsed > targetFadeIn + targetHold + targetFadeOut) {
                targetActive = false;
                targetBitmap = null;
              } else {
                // 混沌: 在淑入/淑出阶段加快速字符变化
                const chaosFactor = (1 - vis) * targetChaos;
                // **调色板自适应**:bitmap 区 l 提升 g·0.7·vis(避免硬叠加至 1,保持主题色相)
                // 这样字形与周围雨同色相(同 cold/warm d 调色)但亮度更高
                l = Math.max(0, Math.min(1, l + g * 0.7 * vis));
                // 混沌时让字符疯狂更新
                if (chaosFactor > 0 && Math.random() < chaosFactor) {
                  c.ch = Math.floor(Math.random() * charset.length);
                }
              }
            }
          }
        }

        const C = h - M, A = s - p;
        const B = Math.sqrt(C * C + A * A);
        const H = Math.max(0, 1 - B / (i * cfg.warmthRadius));
        c.warmth += (H - c.warmth) * cfg.warmthLerp;

        const d = Math.max(0, Math.min(1, c.warmth));
        // 闪烁
        let F: number;
        if (userFuncs.flickerCurve) {
          F = Number(userFuncs.flickerCurve(buildCtx(h, s, c, l))) || 0;
        } else {
          F = l >= 6 ? flicker.high : l >= 3 ? flicker.mid : l >= 1 ? flicker.low : flicker.dark;
        }
        if (Math.random() < F) c.ch = Math.floor(Math.random() * charset.length);
        if (vp.chUpdateProb > 0 && Math.random() < vp.chUpdateProb) c.ch = Math.floor(Math.random() * charset.length);
        // 字符
        if (userFuncs.charsetFunc) {
          const u = Number(userFuncs.charsetFunc(buildCtx(h, s, c, l)));
          if (!isNaN(u)) c.ch = Math.max(0, Math.min(charset.length - 1, Math.floor(u)));
        }

        if (l === 0) continue;
        // colorOverrides: 完全覆盖某档颜色(跳过 blend)
        const __lIdx = Math.floor(l * 9);
        if (colorOverrides && colorOverrides[__lIdx]) {
          const [oR, oG, oB] = colorOverrides[__lIdx];
          const k = 0.9;
          ctx!.fillStyle = `rgba(${oR}, ${oG}, ${oB}, ${k})`;
          ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
          continue;
        }
        const g = hslToRGBA(coldPalette, l), w = hslToRGBA(warmPalette, l);
        // 冷暖色板分别独立调参(在 blend 之前)
        const __totalHue = dynamicHue + dynamicColorHue;
        const [gR, gG, gB] = applyTP(g[0], g[1], g[2], ctp, __totalHue);
        const [wR, wG, wB] = applyTP(w[0], w[1], w[2], wtp, __totalHue);
        const rc = Math.floor(gR * (1 - d) + wR * d);
        const gc = Math.floor(gG * (1 - d) + wG * d);
        const bc = Math.floor(gB * (1 - d) + wB * d);
        const k = g[3] * (1 - d) + w[3] * d;
        const [R2, G2, B2] = applyTP(rc, gc, bc, tp, __totalHue);
        ctx!.fillStyle = `rgba(${R2}, ${G2}, ${B2}, ${k})`;
        ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
      }
    }
  };

  const drawAvalanche = (M: number, p: number) => {
    for (let s = 0; s < i; s++) {
      for (let h = 0; h < r; h++) {
        const c = b[s][h];
        c.yPos! += c.speed! * vp.avalancheSpeed;
        if (c.yPos! > i) c.yPos = 0;

        const distFromHead = Math.abs(s - Math.floor(c.yPos!));
        const l = Math.max(0, Math.min(1, (c.headBright! - Math.pow(distFromHead, vp.headFalloff)) / 8));
        c.bright = l;

        const C = h - M, A = s - p;
        const B = Math.sqrt(C * C + A * A);
        const H = Math.max(0, 1 - B / (i * cfg.warmthRadius));
        c.warmth += (H - c.warmth) * cfg.warmthLerp;

        if (Math.random() < vp.chUpdateProb) c.ch = Math.floor(Math.random() * charset.length);
        if (l === 0) continue;

        const d = Math.max(0, Math.min(1, c.warmth));
        const g = hslToRGBA(coldPalette, l), w = hslToRGBA(warmPalette, l);
        const __totalHue = dynamicHue + dynamicColorHue;
        const [gR, gG, gB] = applyTP(g[0], g[1], g[2], ctp, __totalHue);
        const [wR, wG, wB] = applyTP(w[0], w[1], w[2], wtp, __totalHue);
        const rc = Math.floor(gR * (1 - d) + wR * d);
        const gc = Math.floor(gG * (1 - d) + wG * d);
        const bc = Math.floor(gB * (1 - d) + wB * d);
        const k = g[3] * (1 - d) + w[3] * d;
        const [R2, G2, B2] = applyTP(rc, gc, bc, tp, __totalHue);
        ctx!.fillStyle = `rgba(${R2}, ${G2}, ${B2}, ${k})`;
        const y = c.yPos! * ef * 1.1;
        ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
      }
    }
  };

  const drawRipple = (M: number, p: number) => {
    for (let s = 0; s < i; s++) {
      const y = s * ef * 1.1 + ef * 0.55;
      for (let h = 0; h < r; h++) {
        const c = b[s][h];
        c.phase += (vp.phaseStep + Math.random() * vp.phaseJitter) * (cfg.flickerSpeed ?? FLICKER_SPEED_DEFAULT);
        const W = Math.sin(c.phase) * vp.sinWeightA + 0.5;
        const l = Math.max(0, Math.min(1, W));
        c.bright = l;

        const C = h - M, A = s - p;
        const B = Math.sqrt(C * C + A * A);
        const H = Math.max(0, 1 - B / (i * cfg.warmthRadius));
        c.warmth += (H - c.warmth) * cfg.warmthLerp;

        if (Math.random() < vp.chUpdateProb) c.ch = Math.floor(Math.random() * charset.length);
        if (l === 0) continue;

        const d = Math.max(0, Math.min(1, c.warmth));
        // colorOverrides: 完全覆盖某档颜色(跳过 blend)
        const __lIdx = Math.floor(l * 9);
        if (colorOverrides && colorOverrides[__lIdx]) {
          const [oR, oG, oB] = colorOverrides[__lIdx];
          const k = 0.9;
          ctx!.fillStyle = `rgba(${oR}, ${oG}, ${oB}, ${k})`;
          ctx!.fillText(charset[c.ch], h * ef + ef / 2, y);
          continue;
        }
        const g = hslToRGBA(coldPalette, l), w = hslToRGBA(warmPalette, l);
        const __totalHue = dynamicHue + dynamicColorHue;
        const [gR, gG, gB] = applyTP(g[0], g[1], g[2], ctp, __totalHue);
        const [wR, wG, wB] = applyTP(w[0], w[1], w[2], wtp, __totalHue);
        const rc = Math.floor(gR * (1 - d) + wR * d);
        const gc = Math.floor(gG * (1 - d) + wG * d);
        const bc = Math.floor(gB * (1 - d) + wB * d);
        const k = g[3] * (1 - d) + w[3] * d;
        const [R2, G2, B2] = applyTP(rc, gc, bc, tp, __totalHue);
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
      if (wrapper) wrapper.remove();
      else canvas.remove();
    },
    pause() {
      isPaused = true;
    },
    resume() {
      if (isPaused && !isDestroyed) {
        isPaused = false;
        lastFrameTime = performance.now();
        rafId = requestAnimationFrame(draw);
      }
    },
    setTheme(name: ThemeName) {
      if (!themes[name]) return;
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
      if (options.themeParams) tp = { ...tp, ...options.themeParams };
    },
    setThemeParams(params: Partial<ThemeParams>) {
      tp = { ...tp, ...params };
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
    setColorOverrides(overrides: Record<number, [number, number, number]> | null) {
      colorOverrides = overrides;
    },
    setColorCurve(code: string | null) {
      colorCurve = code ? compileUserFunction(code) : null;
    },
    setTargetBitmap(bitmap: Float32Array | { cols: number; rows: number; data: Float32Array } | null, opts?: { fadeIn?: number; hold?: number; fadeOut?: number; chaos?: number; anchor?: 'topLeft'|'center'|'topRight'|'bottomLeft'|'bottomRight'; motion?: 'static'|'drift'|'bounce'|'float'; motionSpeed?: number }) {
      // **兼容**两种传参:直接 Float32Array 或 BitmapSource 包装对象
      const data: Float32Array | null = bitmap === null
        ? null
        : (bitmap instanceof Float32Array ? bitmap : bitmap.data);
      targetBitmap = data;
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
      if (opts?.fadeOut !== undefined) targetFadeOut = opts.fadeOut;
      if (opts?.chaos !== undefined) targetChaos = opts.chaos;
      if (opts?.anchor !== undefined) targetAnchor = opts.anchor;
      if (opts?.motion !== undefined) targetMotion = opts.motion;
      if (opts?.motionSpeed !== undefined) targetMotionSpeed = opts.motionSpeed;
      if (data) {
        targetStartFrame = f;
        targetActive = true;
      } else {
        targetActive = false;
      }
    },
    clearTargetBitmap() {
      targetBitmap = null;
      targetActive = false;
    },
    setVariantParams(params: Partial<VariantParams>) {
      vp = { ...vp, ...params };
    },
    setBrightnessCurve(code: string | null) {
      userFuncs.brightnessCurve = code ? compileUserFunction(code) : null;
    },
    setFlickerCurve(code: string | null) {
      userFuncs.flickerCurve = code ? compileUserFunction(code) : null;
    },
    setPhaseFunc(code: string | null) {
      userFuncs.phaseFunc = code ? compileUserFunction(code) : null;
    },
    setCharsetFunc(code: string | null) {
      userFuncs.charsetFunc = code ? compileUserFunction(code) : null;
    },
    setPalettes(cold: Palette, warm: Palette) {
      coldPalette = cold;
      warmPalette = warm;
    },
    setFlickerSpeed(speed: number) {
      cfg = { ...cfg, flickerSpeed: Math.max(0, speed) };
    },
    setTargetFPS(fps: number) {
      targetFPS = Math.max(0, fps);
      fpsAccumMs = 0;  // 重置节流累加器,避免改后限频不准
    },
    setDensity(fontSize: number) {
      cfg = { ...cfg, fontSize };
      buildGrid();
    },
    getFPS() {
      return Math.round(fps);
    }
  };

  // ==================== Boot ====================
  buildGrid();
  window.addEventListener('resize', onResize);
  rafId = requestAnimationFrame(draw);

  if (options.onReady) options.onReady(instance);

  // 关联 wrapper → instance(供 MatrixRain.destroyAll 查找)
  if (wrapper) (wrapper as any).__matrixRainInstance = instance;

  return instance;
}
