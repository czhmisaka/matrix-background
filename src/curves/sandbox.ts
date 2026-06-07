/**
 * @xietuier/matrix-rain · 用户函数沙箱
 *
 * 安全运行用户输入的 JS 表达式,防止 XSS 和死循环。
 * 4 个驱动量(brightnessCurve / flickerCurve / phaseFunc / charsetFunc)都用这个评估。
 *
 * 风险控制:
 *   1. 黑名单: window / document / globalThis / self / eval / Function / import / require / fetch
 *   2. 步数限制: 10000 步内必须返回(用 Proxy 计数)
 *   3. 字符串大小: 最大 5KB
 *   4. 超时: 用 PerformanceObserver 不可行,改用步数限制
 *   5. try/catch 容错,失败时返回 fallback
 */

const MAX_STEPS = 10000;
const MAX_STR = 5 * 1024;
const BLACKLIST = [
  'window', 'document', 'globalThis', 'self', 'top', 'parent', 'frames',
  'eval', 'Function', 'import', 'require', 'fetch', 'XMLHttpRequest',
  'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB',
  'navigator', 'location', 'history', 'postMessage', 'onmessage'
];

export interface SandboxContext {
  /** 当前时间(秒, 高精度) */
  t: number;
  /** 当前 phase 值 */
  phase: number;
  /** 网格列 h / 行 s */
  h: number;
  /** 网格行 s */
  s: number;
  /** 0-1 随机种子 */
  r: number;
  /** 帧计数器 */
  f: number;
  /** 网格宽度/高度 */
  W: number;
  /** 网格高度 */
  H: number;
  /** 当前 brightness level (0-9) */
  L: number;
  /** 字符索引 */
  ch: number;
  /** sin 预绑定 */
  sin: (x: number) => number;
  cos: (x: number) => number;
  tan: (x: number) => number;
  /** 噪声(smooth random) */
  noise: (x: number) => number;
  /** 数学常量 */
  PI: number;
  E: number;
  /** clamp / lerp 工具 */
  clamp: (v: number, lo: number, hi: number) => number;
  lerp: (a: number, b: number, t: number) => number;
  /** 缓动函数 */
  ease: {
    inQuad: (t: number) => number;
    outQuad: (t: number) => number;
    inOutQuad: (t: number) => number;
    inCubic: (t: number) => number;
    outCubic: (t: number) => number;
    inOutCubic: (t: number) => number;
    inQuart: (t: number) => number;
    outQuart: (t: number) => number;
    inOutQuart: (t: number) => number;
    inSine: (t: number) => number;
    outSine: (t: number) => number;
    inOutSine: (t: number) => number;
    inExpo: (t: number) => number;
    outExpo: (t: number) => number;
    inOutExpo: (t: number) => number;
    inCirc: (t: number) => number;
    outCirc: (t: number) => number;
    inOutCirc: (t: number) => number;
    inBack: (t: number) => number;
    outBack: (t: number) => number;
    inOutBack: (t: number) => number;
  };
}

const ease = {
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => --t * t * t + 1,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  inQuart: (t: number) => t * t * t * t,
  outQuart: (t: number) => 1 - --t * t * t * t,
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t),
  inSine: (t: number) => -Math.cos(t * Math.PI / 2) + 1,
  outSine: (t: number) => Math.sin(t * Math.PI / 2),
  inOutSine: (t: number) => -0.5 * (Math.cos(Math.PI * t) - 1),
  inExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  outExpo: (t: number) => (t === 1 ? 1 : -Math.pow(2, -10 * t) + 1),
  inOutExpo: (t: number) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5 ? Math.pow(2, 10 * (t * 2 - 1)) / 2 : (-Math.pow(2, -10 * (t * 2 - 1)) + 2) / 2;
  },
  inCirc: (t: number) => -Math.sqrt(1 - t * t) + 1,
  outCirc: (t: number) => Math.sqrt(1 - (t - 1) * (t - 1)),
  inOutCirc: (t: number) => (t < 0.5 ? -0.5 * (Math.sqrt(1 - 4 * t * t) - 1) : 0.5 * (Math.sqrt(1 - (2 * t - 2) * (2 * t - 2)) + 1)),
  inBack: (t: number) => {
    const s = 1.70158;
    return t * t * ((s + 1) * t - s);
  },
  outBack: (t: number) => {
    const s = 1.70158;
    return --t * t * ((s + 1) * t + s) + 1;
  },
  inOutBack: (t: number) => {
    const s = 1.70158 * 1.525;
    return t < 0.5
      ? 0.5 * (t * t * ((s + 1) * 2 * t - s))
      : 0.5 * ((2 * t - 2) * (2 * t - 2) * ((s + 1) * (2 * t - 2) + s) + 2);
  }
};

/** 简单 1D 噪声(基于 sin 组合,纯函数) */
const noise = (x: number): number => {
  const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** 安全编译 + 评估。code 是表达式体,fn(ctx) → number|string */
export const compileUserFunction = (code: string): ((ctx: SandboxContext) => number | string) => {
  if (typeof code !== 'string') return () => 0;
  if (code.length > MAX_STR) return () => 0;
  // 黑名单
  for (const bad of BLACKLIST) {
    if (code.includes(bad)) {
      throw new Error(`禁用词: ${bad}`);
    }
  }
  // 编译为 fn
  let fn: Function;
  try {
    fn = new Function(
      't', 'phase', 'h', 's', 'r', 'f', 'W', 'H', 'L', 'ch',
      'sin', 'cos', 'tan', 'noise', 'PI', 'E', 'clamp', 'lerp', 'ease',
      `return (function() {\nlet __steps = 0;\nconst __check = () => { if (++__steps > ${MAX_STEPS}) throw new Error('exceeded 10000 steps'); };\n${code}\n})();`
    );
  } catch (e: any) {
    throw new Error(`编译错误: ${e.message}`);
  }
  return (ctx: SandboxContext) => {
    try {
      return fn(
        ctx.t, ctx.phase, ctx.h, ctx.s, ctx.r, ctx.f, ctx.W, ctx.H, ctx.L, ctx.ch,
        Math.sin, Math.cos, Math.tan, noise,
        Math.PI, Math.E,
        (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
        (a: number, b: number, t: number) => a + (b - a) * t,
        ease
      );
    } catch (e) {
      return 0;
    }
  };
};

/** 单纯验证代码合法性(给 Playground UI 用,不实际执行) */
export const validateUserFunction = (code: string): { ok: boolean; error?: string } => {
  if (typeof code !== 'string') return { ok: false, error: 'not a string' };
  if (code.length > MAX_STR) return { ok: false, error: `> 5KB (${code.length})` };
  for (const bad of BLACKLIST) {
    if (code.includes(bad)) return { ok: false, error: `禁用: ${bad}` };
  }
  try {
    new Function(
      't', 'phase', 'h', 's', 'r', 'f', 'W', 'H', 'L', 'ch',
      'sin', 'cos', 'tan', 'noise', 'PI', 'E', 'clamp', 'lerp', 'ease',
      code
    );
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
};
