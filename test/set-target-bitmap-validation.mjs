/**
 * setTargetBitmap 输入校验测试
 *
 * 来源:docs/audits/security-2026-06-08.md §5 输入校验 P1 (S-03)
 * 目标:验证 setTargetBitmap 入口校验 3 条规则
 *   1. bitmap 必须是 Float32Array(显式 instanceof 检查)
 *   2. 尺寸上限:cols * rows <= 1_000_000(防 10000x10000 OOM)
 *   3. 形状一致性:rows * cols === data.length
 *
 * Case 设计:
 *   [1] null   —— 合法 clear,不应 throw
 *   [2] 超大   —— 触发 size cap + 类型错误,验证错误信息
 *   [3] 正常   —— 合法 bitmap 接受(直接 Float32Array + wrap 形式)
 *
 * 跑法:node test/detect.mjs
 * 前置:npm run build
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// ==================== 最小化 DOM mock(同 canvas-remove.mjs)====================
let __rafId = 0;
const __rafQueue = new Map();

class MockContext2D {
  constructor() {
    this.fillStyle = '';
    this.font = '';
    this.textBaseline = '';
    this.textAlign = '';
  }
  setTransform() {}
  fillRect() {}
  fillText() {}
  save() {}
  restore() {}
  scale() {}
  translate() {}
}

class MockCanvas {
  constructor() {
    this.id = '';
    this.width = 100;
    this.height = 100;
    this.style = { cssText: '' };
    this.parentNode = null;
    this._listeners = new Map();
  }
  getContext() {
    return new MockContext2D();
  }
  getBoundingClientRect() {
    return { width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 };
  }
  addEventListener() {}
  removeEventListener() {}
  remove() {}
  appendChild() {}
  insertBefore() {}
  removeChild() {}
}

class MockDiv {
  constructor() {
    this.className = '';
    this.style = { cssText: '' };
    this.children = [];
    this.parentNode = null;
    this.firstChild = null;
  }
  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    this.firstChild = this.children[0] || null;
    return child;
  }
  insertBefore(child, ref) {
    if (ref === null) {
      this.appendChild(child);
      return child;
    }
    const idx = this.children.indexOf(ref);
    if (idx === -1) this.appendChild(child);
    else this.children.splice(idx, 0, child);
    child.parentNode = this;
    this.firstChild = this.children[0] || null;
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
      this.firstChild = this.children[0] || null;
    }
    return child;
  }
  remove() {}
  querySelectorAll() {
    return [];
  }
}

class MockBody extends MockDiv {}

const mockDocument = {
  body: new MockBody(),
  createElement(tag) {
    return tag === 'canvas' ? new MockCanvas() : new MockDiv();
  },
  querySelectorAll() {
    return [];
  },
  head: new MockDiv(),
  documentElement: new MockDiv(),
};

const mockWindow = {
  devicePixelRatio: 1,
  innerWidth: 800,
  innerHeight: 600,
  matchMedia: (q) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame(cb) {
    const id = ++__rafId;
    __rafQueue.set(id, cb);
    return id;
  },
  cancelAnimationFrame(id) {
    __rafQueue.delete(id);
  },
  addEventListener() {},
  removeEventListener() {},
};

globalThis.window = mockWindow;
globalThis.document = mockDocument;
globalThis.HTMLCanvasElement = MockCanvas;
globalThis.HTMLDivElement = MockDiv;
globalThis.HTMLElement = MockDiv;
globalThis.requestAnimationFrame = mockWindow.requestAnimationFrame;
globalThis.cancelAnimationFrame = mockWindow.cancelAnimationFrame;
globalThis.setTimeout = setTimeout;
globalThis.clearTimeout = clearTimeout;
globalThis.ResizeObserver = class {
  constructor(cb) {
    this.cb = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.performance = { now: () => Date.now() };

// ==================== 加载 matrixRain ====================
const require = createRequire(import.meta.url);
const { matrixRain } = require('../dist/index.cjs');

// ==================== 测试 ====================
let passed = 0;
let failed = 0;
const check = (cond, msg) => {
  if (cond) {
    console.log('  ✅', msg);
    passed++;
  } else {
    console.error('  ❌', msg);
    failed++;
  }
};

console.log('🧪 setTargetBitmap 输入校验测试');
console.log('─'.repeat(60));

// 公共:创建实例(每个 case 用独立实例)
const makeInstance = () => matrixRain({ theme: 'matrix-green' });

// ==================== Test 1: null 合法 ====================
console.log('\n[1] setTargetBitmap(null) —— 合法 clear,不应 throw');
{
  const rain = makeInstance();
  let threw = false;
  try {
    rain.setTargetBitmap(null);
  } catch (e) {
    threw = true;
    console.error('  意外 throw:', e.message);
  }
  check(!threw, 'setTargetBitmap(null) 不 throw');
  rain.destroy();
}

// ==================== Test 2: 超大 → throw ====================
console.log('\n[2] 超大 bitmap —— 应 throw 含"超过上限"中文消息');
{
  const rain = makeInstance();

  // 2a) 直接 Float32Array 超出 1M
  const oversizeArr = new Float32Array(1_000_001);
  let caught1 = null;
  try {
    rain.setTargetBitmap(oversizeArr);
  } catch (e) {
    caught1 = e;
  }
  check(caught1 !== null, '1_000_001 单元 Float32Array 触发 throw');
  check(
    caught1 && /超过上限.*1000000/.test(caught1.message),
    `错误信息含"超过上限"与"1000000"(实际:"${caught1 && caught1.message}")`
  );

  // 2b) wrap 形式 cols * rows 超 1M
  const oversizeWrap = { cols: 2000, rows: 2000, data: new Float32Array(4_000_000) };
  let caught2 = null;
  try {
    rain.setTargetBitmap(oversizeWrap);
  } catch (e) {
    caught2 = e;
  }
  check(caught2 !== null, '2000x2000 wrap 形式触发 throw');
  check(
    caught2 && /超过上限.*1000000/.test(caught2.message),
    `wrap 错误信息含"超过上限"与"1000000"(实际:"${caught2 && caught2.message}")`
  );

  // 2c) wrap 形式形状不一致(cols * rows !== data.length)
  const mismatchWrap = { cols: 100, rows: 100, data: new Float32Array(50 * 50) };
  let caught3 = null;
  try {
    rain.setTargetBitmap(mismatchWrap);
  } catch (e) {
    caught3 = e;
  }
  check(caught3 !== null, 'cols*rows ≠ data.length 触发 throw');
  check(
    caught3 && /形状不一致/.test(caught3.message),
    `形状不一致错误信息含"形状不一致"(实际:"${caught3 && caught3.message}")`
  );

  // 2d) 非 Float32Array 类型(普通 Array)
  let caught4 = null;
  try {
    rain.setTargetBitmap([0.1, 0.2, 0.3]);
  } catch (e) {
    caught4 = e;
  }
  check(caught4 !== null, '普通 Array 触发 throw');
  check(
    caught4 && /必须是 Float32Array/.test(caught4.message),
    `类型错误信息含"必须是 Float32Array"(实际:"${caught4 && caught4.message}")`
  );

  rain.destroy();
}

// ==================== Test 3: 正常 ====================
console.log('\n[3] 正常 bitmap —— 不 throw,接受直接 Float32Array + wrap 两种形式');
{
  const rain = makeInstance();

  // 3a) 直接 Float32Array(用 grid 默认 cols/rows)
  const directArr = new Float32Array(100); // 100 个 0-1 值
  let threw1 = false;
  try {
    rain.setTargetBitmap(directArr);
  } catch (e) {
    threw1 = true;
    console.error('  意外 throw(直接 Float32Array):', e.message);
  }
  check(!threw1, '100 单元 Float32Array 不 throw');

  // 3b) wrap 形式 10x10 = 100,形状一致
  const validWrap = { cols: 10, rows: 10, data: new Float32Array(100) };
  let threw2 = false;
  try {
    rain.setTargetBitmap(validWrap);
  } catch (e) {
    threw2 = true;
    console.error('  意外 throw(wrap 形式):', e.message);
  }
  check(!threw2, '10x10 wrap 形式不 throw');

  // 3c) 边界值:刚好 1M(1000x1000)
  const exactMax = { cols: 1000, rows: 1000, data: new Float32Array(1_000_000) };
  let threw3 = false;
  try {
    rain.setTargetBitmap(exactMax);
  } catch (e) {
    threw3 = true;
    console.error('  意外 throw(边界 1M):', e.message);
  }
  check(!threw3, '刚好 1_000_000 单元(1000x1000)不 throw');

  rain.destroy();
}

console.log('─'.repeat(60));
console.log(`${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
