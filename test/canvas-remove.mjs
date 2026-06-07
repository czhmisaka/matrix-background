/**
 * destroy() 不能误删用户传入的 canvas
 *
 * 背景 (Playwright 自动化发现):
 * - 用户调 matrixRain({canvas: myCanvas}) 传自己的 canvas
 * - 用户调 instance.destroy() 想停动画
 * - 旧实现额外把用户的 canvas 从 DOM 删了
 * - Playground 重建实例时,canvas 已被前一个 instance.destroy() 删掉,canvasRef 失效
 *
 * 修复后行为:
 * 1. 用户提供 canvas —— destroy() 只解除事件监听,canvas 留在 DOM 里
 * 2. library 自创建 canvas —— wrapper + canvas 一起从 DOM 删(行为不变)
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// ==================== 最小化 DOM mock(参考 leak.mjs 模式)====================
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
  getContext() { return new MockContext2D(); }
  getBoundingClientRect() {
    return { width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 };
  }
  addEventListener(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) {
    if (this._listeners.has(type)) this._listeners.get(type).delete(handler);
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
      this.parentNode = null;
    }
  }
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
    if (ref === null) { this.appendChild(child); return child; }
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
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
    // 模拟真实 DOM:从 DOM 移除父节点时,所有子节点也脱离 DOM(parentNode 变 null)
    const detach = (node) => {
      if (node && Array.isArray(node.children)) {
        for (const c of node.children) {
          c.parentNode = null;
          detach(c);
        }
      }
    };
    detach(this);
  }
  querySelectorAll() { return []; }
}

class MockBody extends MockDiv {}

// 记录创建的元素(用于校验)
const createdCanvases = [];
const createdWrappers = [];

const mockDocument = {
  body: new MockBody(),
  createElement(tag) {
    if (tag === 'canvas') {
      const c = new MockCanvas();
      createdCanvases.push(c);
      return c;
    }
    const d = new MockDiv();
    createdWrappers.push(d);
    return d;
  },
  querySelectorAll() { return []; },
  head: new MockDiv(),
  documentElement: new MockDiv()
};

const mockWindow = {
  devicePixelRatio: 1,
  innerWidth: 800,
  innerHeight: 600,
  matchMedia: (q) => ({
    matches: false, media: q,
    addEventListener: () => {}, removeEventListener: () => {}
  }),
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame(cb) {
    const id = ++__rafId;
    __rafQueue.set(id, cb);
    return id;
  },
  cancelAnimationFrame(id) { __rafQueue.delete(id); },
  addEventListener() {},
  removeEventListener() {}
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
  constructor(cb) { this.cb = cb; }
  observe() {} unobserve() {} disconnect() {}
};
globalThis.performance = { now: () => Date.now() };

// ==================== 加载 matrixRain ====================
const require = createRequire(import.meta.url);
const { matrixRain } = require('../dist/index.cjs');

// ==================== 测试 ====================
let passed = 0;
let failed = 0;
const check = (cond, msg) => {
  if (cond) { console.log('  ✅', msg); passed++; }
  else { console.error('  ❌', msg); failed++; }
};

console.log('🧪 destroy() canvas 保留测试');
console.log('─'.repeat(60));

// ==================== Test 1: 用户传入 canvas,destroy() 不删 ====================
console.log('\n[1] 用户传入 canvas —— destroy() 不删');
{
  // 模拟 Playground:用户在自己的 div 里塞了一个 canvas,把它交给 library
  const userDiv = new MockDiv();
  userDiv.className = 'user-container';
  const userCanvas = new MockCanvas();
  userCanvas.id = 'playground-canvas';
  userDiv.appendChild(userCanvas);

  // 记录创建前的 DOM 状态
  const beforeDestroy = userDiv.children.length;
  assert.equal(beforeDestroy, 1, '前置:userDiv 含 1 个 canvas');

  const rain = matrixRain({ canvas: userCanvas });
  check(userCanvas.parentNode === userDiv, 'userCanvas 仍挂在 userDiv 下(library 未移动它)');
  check(userDiv.children.includes(userCanvas), 'userCanvas 在 userDiv.children 里');

  // 关键断言:destroy() 后 canvas 必须在 DOM 里
  rain.destroy();
  check(userCanvas.parentNode === userDiv, 'destroy() 后 userCanvas 仍挂在 userDiv 下');
  check(userDiv.children.length === 1, `destroy() 后 userDiv 仍有 1 个子节点(实际 ${userDiv.children.length})`);
  check(userDiv.children[0] === userCanvas, 'destroy() 后 userDiv.children[0] 仍是 userCanvas');
}

// ==================== Test 2: 重建实例:复用同一个 canvas ====================
console.log('\n[2] 重建实例 —— 同一个 canvas 可被多次复用');
{
  const userDiv = new MockDiv();
  const userCanvas = new MockCanvas();
  userDiv.appendChild(userCanvas);

  // 第一次:theme A
  const rain1 = matrixRain({ canvas: userCanvas, theme: 'silicon-valley' });
  rain1.setTheme('matrix-green');
  rain1.destroy();
  // 第二次:用同一个 canvas,theme B(Playground 切 theme 场景)
  const rain2 = matrixRain({ canvas: userCanvas, theme: 'lava-red' });
  check(rain2 != null, '第二次实例能成功创建');
  check(userDiv.children.length === 1, '重建后 userDiv 仍有 1 个 canvas');
  check(userDiv.children[0] === userCanvas, '重建后 userCanvas 仍是同一个节点');
  rain2.destroy();
}

// ==================== Test 3: library 自创建 canvas —— wrapper + canvas 一起删(回归)====================
console.log('\n[3] library 自创建 canvas —— destroy() 删 wrapper(canvas 在 wrapper 内)');
{
  // 计数 reset
  const before = createdWrappers.length;

  const rain = matrixRain(); // 不传 canvas,library 自己创建
  const newWrappers = createdWrappers.slice(before);
  assert.equal(newWrappers.length, 1, 'library 创建了 1 个 wrapper');
  const wrapper = newWrappers[0];
  check(wrapper.parentNode === mockDocument.body, 'wrapper 挂在 document.body 下');
  check(wrapper.children.length === 1, 'wrapper 内含 1 个 canvas');
  const libCanvas = wrapper.children[0];
  check(libCanvas.parentNode === wrapper, 'library canvas 挂在 wrapper 下');

  rain.destroy();
  check(wrapper.parentNode === null, 'destroy() 后 wrapper 已从 DOM 移除');
  check(libCanvas.parentNode === null, 'destroy() 后 library canvas 已从 wrapper 移除(随 wrapper 一起)');
}

// ==================== Test 4: 用户传入 canvas 反复 destroy 创建/销毁,canvas 始终在 ====================
console.log('\n[4] 反复 create/destroy 10 次 —— 同一 user canvas 始终在 DOM 里');
{
  const userDiv = new MockDiv();
  const userCanvas = new MockCanvas();
  userDiv.appendChild(userCanvas);
  for (let i = 0; i < 10; i++) {
    const r = matrixRain({ canvas: userCanvas, theme: i % 2 ? 'lava-red' : 'matrix-green' });
    r.destroy();
  }
  check(userDiv.children.length === 1, '10 次循环后 userDiv 仍有 1 个 canvas');
  check(userDiv.children[0] === userCanvas, '10 次循环后 canvas 节点身份未变(=== 比较)');
}

console.log('─'.repeat(60));
console.log(`${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
