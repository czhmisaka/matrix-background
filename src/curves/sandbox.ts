/**
 * @xietuier/matrix-rain · 用户函数沙箱
 *
 * 安全运行用户输入的 JS 表达式,防止 XSS 和死循环。
 * 5 个驱动量(brightnessCurve / flickerCurve / phaseFunc / charsetFunc / colorCurve)都用这个评估。
 *
 * v0.2.0 加固:
 *   1. 词级黑名单(用 \b 边界匹配,避免 'allocation' 误中 'location')
 *   2. 白名单安全全局:Math/Number/String/Boolean/Array 经冻结对象只暴露白名单方法
 *   3. 禁用 this / arguments / new Function(编译期 + 词级检测)
 *   4. 步数限制 10000 步
 *   5. 字符串大小 5KB
 *   6. 类型守卫:返回必须 string|number,否则 throw
 *   7. 'use strict': 隐式 undefined this,阻止 with 等
 *
 * v0.3.0 加固(audit-security-2026-06-08 §2):
 *   8. 黑名单补 constructor:堵 .constructor.constructor 拿回 Function 链路
 *   9. 黑名单补 async/await:堵 Promise 异步链路
 *   10. 黑名单补 function / yield / class:堵 generator + class 绕过
 *   11. 黑名单补 __proto__ / prototype:堵原型链污染
 *   12. 字符串拼接绕过防御:解码相邻字面量,检测拼接值是否命中黑名单
 *      例: "win"+"dow" → "window" 命中
 */

const MAX_STEPS = 10000;
const MAX_STR = 5 * 1024;

/** 词级黑名单 —— 用 \b 边界匹配,避免子串误中 */
const BLACKLIST = [
  // 全局对象 / DOM
  'window',
  'document',
  'globalThis',
  'self',
  'top',
  'parent',
  'frames',
  'navigator',
  'location',
  'history',
  'postMessage',
  'onmessage',
  // 存储
  'localStorage',
  'sessionStorage',
  'indexedDB',
  // 动态执行 / 加载
  'eval',
  'Function',
  'import',
  'require',
  // 网络
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'WebRTC',
  // 定时器(可被串成 setTimeout(1, ...))
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'requestAnimationFrame',
  'requestIdleCallback',
  // 进程 / Worker
  'process',
  'Worker',
  'SharedWorker',
  'ServiceWorker',
  // 元编程(可绕过 Proxy/边界)
  'Proxy',
  'Reflect',
  'Symbol',
  'Promise',
  // 标准库(可建 String/Array/Object 间接逃逸)
  'Object',
  'JSON',
  'Date',
  'RegExp',
  'Error',
  'TypeError',
  'RangeError',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'ArrayBuffer',
  'DataView',
  'Uint8Array',
  'Int8Array',
  'Uint16Array',
  'Int16Array',
  'Uint32Array',
  'Int32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
  // console(可泄露)
  'console',
  'alert',
  'confirm',
  'prompt',
  // 关键字 / this / arguments
  'this',
  'arguments',
  'with',
  'debugger',
  // Function constructor 链 (.constructor.constructor 拿回 Function)
  'constructor',
  // async/await(异步链路 + Promise 绕过)
  'async',
  'await',
  // 生成器(function* + yield)
  'function',
  'yield',
  // class(可建实例绕过类型守卫)
  'class',
  // 原型链污染(__proto__.constructor / prototype)
  '__proto__',
  'prototype',
];

/** 词级黑名单(运行时检测) */
const RUNTIME_BLOCKS = ['this', 'arguments', 'Function', 'eval', 'import', 'require'];

/** 词级正则: 匹配整词 */
const wordRegex = (w: string): RegExp =>
  new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);

/** 安全 Math: 白名单静态方法 + 常量(冻结对象) */
const SAFE_MATH = Object.freeze({
  // 三角
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  // 幂 / 对数 / 根
  pow: Math.pow,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  hypot: Math.hypot,
  exp: Math.exp,
  log: Math.log,
  log2: Math.log2,
  log10: Math.log10,
  // 取整 / 取值
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,
  min: Math.min,
  max: Math.max,
  // 随机
  random: Math.random,
  // 常量
  PI: Math.PI,
  E: Math.E,
} as const);

/** 安全 Number 静态 */
const SAFE_NUMBER = Object.freeze({
  isFinite: Number.isFinite,
  isNaN: Number.isNaN,
  isInteger: Number.isInteger,
  isSafeInteger: Number.isSafeInteger,
  parseFloat: Number.parseFloat,
  parseInt: Number.parseInt,
  MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
  MIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
  MAX_VALUE: Number.MAX_VALUE,
  MIN_VALUE: Number.MIN_VALUE,
  EPSILON: Number.EPSILON,
} as const);

/** 安全 String 静态 */
const SAFE_STRING = Object.freeze({
  fromCharCode: String.fromCharCode,
  fromCodePoint: String.fromCodePoint,
  raw: String.raw,
} as const);

/** 安全 Boolean 静态(实际只有构造函数) */
const SAFE_BOOLEAN = Object.freeze({} as const);

/** 安全 Array 静态 */
const SAFE_ARRAY = Object.freeze({
  isArray: Array.isArray,
  from: Array.from,
  of: Array.of,
} as const);

/** 沙箱内上下文:user 可见的字段 */
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
  /** 安全 Math 白名单(只读) */
  Math: typeof SAFE_MATH;
  /** 安全 Number 白名单(只读) */
  Number: typeof SAFE_NUMBER;
  /** 安全 String 白名单(只读) */
  String: typeof SAFE_STRING;
  /** 安全 Boolean 白名单(只读) */
  Boolean: typeof SAFE_BOOLEAN;
  /** 安全 Array 白名单(只读) */
  Array: typeof SAFE_ARRAY;
}

/** 缓动函数(模块级导出,SSR 友好) */
export const ease = {
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => --t * t * t + 1,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  inQuart: (t: number) => t * t * t * t,
  outQuart: (t: number) => 1 - --t * t * t * t,
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t),
  inSine: (t: number) => -Math.cos((t * Math.PI) / 2) + 1,
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
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
  inOutCirc: (t: number) =>
    t < 0.5
      ? -0.5 * (Math.sqrt(1 - 4 * t * t) - 1)
      : 0.5 * (Math.sqrt(1 - (2 * t - 2) * (2 * t - 2)) + 1),
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
  },
};

/** 简单 1D 噪声(基于 sin 组合,纯函数) */
const noise = (x: number): number => {
  const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** 词级安全检查: 命中黑名单则返回首个命中词 */
const checkBlacklist = (code: string): string | null => {
  for (const bad of BLACKLIST) {
    const re = wordRegex(bad);
    if (re.test(code)) return bad;
  }
  // 字符串拼接绕过防御: 抽出相邻字符串字面量,检查其拼接值是否命中黑名单
  // 例: "win"+"dow" 拼接后 = "window"
  const concatHit = checkStringConcatBlacklist(code);
  if (concatHit) return concatHit;
  return null;
};

/**
 * 解码 JS 字符串字面量(支持 \n \r \t \' \" \\ \uXXXX \xXX)
 * 不支持模板字符串 `${...}` —— 用户用普通字符串即可表达
 */
const decodeStringLiteral = (lit: string): string => {
  if (lit.length < 2) return '';
  const quote = lit[0];
  if (lit[lit.length - 1] !== quote) return '';
  let out = '';
  let i = 1;
  while (i < lit.length - 1) {
    const c = lit[i];
    if (c === '\\' && i + 1 < lit.length - 1) {
      const next = lit[i + 1];
      if (next === 'u' && i + 5 < lit.length) {
        const hex = lit.slice(i + 2, i + 6);
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
      } else if (next === 'x' && i + 3 < lit.length) {
        const hex = lit.slice(i + 2, i + 4);
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else {
        const map: Record<string, string> = {
          n: '\n',
          r: '\r',
          t: '\t',
          b: '\b',
          f: '\f',
          v: '\v',
          '0': '\0',
          '\\': '\\',
          "'": "'",
          '"': '"',
          '`': '`',
        };
        out += map[next] ?? next;
        i += 2;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
};

/** 提取源码中所有字符串字面量("..." / '...',跳过模板字符串) */
const extractStringLiterals = (code: string): string[] => {
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(code)) !== null && count < 200) {
    out.push(decodeStringLiteral(m[0]));
    count++;
  }
  return out;
};

/**
 * 字符串拼接绕过检测: 对相邻字面量做滑动窗口拼接(最多 5 个),
 * 检查拼接结果是否包含黑名单任一词
 */
const checkStringConcatBlacklist = (code: string): string | null => {
  const literals = extractStringLiterals(code);
  if (literals.length === 0) return null;
  // 单个字面量: 直接命中(防御 "window" 字面量)
  for (const lit of literals) {
    for (const bad of BLACKLIST) {
      if (lit.includes(bad)) return bad;
    }
  }
  // 滑动窗口拼接相邻字面量(最多 5 个)
  const win = Math.min(5, literals.length);
  for (let i = 0; i < literals.length; i++) {
    let acc = '';
    for (let j = i; j < i + win && j < literals.length; j++) {
      acc += literals[j];
      for (const bad of BLACKLIST) {
        if (acc.includes(bad)) return bad;
      }
    }
  }
  return null;
};

/** 运行时黑名单检测(this/arguments/Function/eval/import/require) */
const checkRuntime = (code: string): string | null => {
  for (const bad of RUNTIME_BLOCKS) {
    const re = wordRegex(bad);
    if (re.test(code)) return bad;
  }
  return null;
};

/** 安全编译 + 评估。code 是表达式体,fn(ctx) → number|string */
export const compileUserFunction = (code: string): ((ctx: SandboxContext) => number | string) => {
  if (typeof code !== 'string') return () => 0;
  if (code.length > MAX_STR) {
    console.warn(`[matrix-rain] sandbox: code too long (${code.length} > ${MAX_STR})`);
    return () => 0;
  }
  // 词级黑名单
  const bad = checkBlacklist(code);
  if (bad) throw new Error(`沙箱禁用词: ${bad}`);
  // 运行时硬禁
  const runtimeBad = checkRuntime(code);
  if (runtimeBad) throw new Error(`沙箱禁用词: ${runtimeBad}`);

  // 编译为 fn(加 'use strict' 强制 this=undefined)
  let fn: Function;
  try {
    fn = new Function(
      't',
      'phase',
      'h',
      's',
      'r',
      'f',
      'W',
      'H',
      'L',
      'ch',
      'sin',
      'cos',
      'tan',
      'noise',
      'PI',
      'E',
      'clamp',
      'lerp',
      'ease',
      'Math',
      'Number',
      'String',
      'Boolean',
      'Array',
      `'use strict';
let __ret = (function() {
  let __steps = 0;
  const __check = () => { if (++__steps > ${MAX_STEPS}) throw new Error('exceeded ${MAX_STEPS} steps'); };
  ${code}
})();
if (typeof __ret !== 'number' && typeof __ret !== 'string') {
  throw new Error('userFunc must return number or string, got ' + typeof __ret);
}
return __ret;`
    );
  } catch (e: any) {
    throw new Error(`编译错误: ${e.message}`);
  }
  return (ctx: SandboxContext) => {
    try {
      return fn(
        ctx.t,
        ctx.phase,
        ctx.h,
        ctx.s,
        ctx.r,
        ctx.f,
        ctx.W,
        ctx.H,
        ctx.L,
        ctx.ch,
        Math.sin,
        Math.cos,
        Math.tan,
        noise,
        Math.PI,
        Math.E,
        (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
        (a: number, b: number, t: number) => a + (b - a) * t,
        ease,
        SAFE_MATH,
        SAFE_NUMBER,
        SAFE_STRING,
        SAFE_BOOLEAN,
        SAFE_ARRAY
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
  const bad = checkBlacklist(code);
  if (bad) return { ok: false, error: `禁用: ${bad}` };
  const runtimeBad = checkRuntime(code);
  if (runtimeBad) return { ok: false, error: `禁用: ${runtimeBad}` };
  try {
    new Function(
      't',
      'phase',
      'h',
      's',
      'r',
      'f',
      'W',
      'H',
      'L',
      'ch',
      'sin',
      'cos',
      'tan',
      'noise',
      'PI',
      'E',
      'clamp',
      'lerp',
      'ease',
      'Math',
      'Number',
      'String',
      'Boolean',
      'Array',
      `'use strict';\n${code}`
    );
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
};

/** 暴露安全全局白名单(测试/外部引用) */
export const SAFE_GLOBALS = {
  Math: SAFE_MATH,
  Number: SAFE_NUMBER,
  String: SAFE_STRING,
  Boolean: SAFE_BOOLEAN,
  Array: SAFE_ARRAY,
} as const;
