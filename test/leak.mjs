/**
 * 监听器泄漏测试
 * 验证:反复创建/销毁 1000 次后,window 上累积的 resize 监听器数量应该为 0
 *
 * 策略:
 * 1. 在 globalThis 上挂最小化 DOM mock(window/document/canvas/...)
 * 2. 拦截 window.addEventListener / removeEventListener,统计 resize 监听器
 * 3. 反复调 matrixRain().destroy()
 * 4. 验证 resize 监听器数为 0
 *
 * 跑法:node test/leak.mjs
 * 前置:npm run build
 */

import assert from 'node:assert/strict';

// ==================== 最小化 DOM mock ====================
let __rafId = 0;
const __rafQueue = new Map();
const __rafCallbacks = new Map();
const __resizeListeners = new Set();

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
  dispatchEvent(type) {
    const ls = this._listeners.get(type);
    if (ls) for (const h of ls) h({ type });
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
    if (ref === null) {
      this.appendChild(child);
      return child;
    }
    const idx = this.children.indexOf(ref);
    if (idx === -1) {
      this.appendChild(child);
    } else {
      this.children.splice(idx, 0, child);
      child.parentNode = this;
      this.firstChild = this.children[0] || null;
    }
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
  }
  querySelectorAll() { return []; }
}

class MockBody extends MockDiv {}

const mockDocument = {
  body: new MockBody(),
  createElement(tag) {
    if (tag === 'canvas') return new MockCanvas();
    return new MockDiv();
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
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {}
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
  // 监听器追踪:addEventListener / removeEventListener
  addEventListener(type, handler) {
    if (type === 'resize') {
      if (__resizeListeners.has(handler)) {
        throw new Error('addEventListener resize: 同一 handler 已存在(泄漏!)');
      }
      __resizeListeners.add(handler);
    }
  },
  removeEventListener(type, handler) {
    if (type === 'resize') {
      __resizeListeners.delete(handler);
    }
  }
};

globalThis.window = mockWindow;
globalThis.document = mockDocument;
globalThis.HTMLCanvasElement = MockCanvas;
globalThis.HTMLDivElement = MockDiv;
globalThis.HTMLElement = MockDiv;
// dist/index.js 内部用裸名 requestAnimationFrame,需要挂到 globalThis
globalThis.requestAnimationFrame = mockWindow.requestAnimationFrame;
globalThis.cancelAnimationFrame = mockWindow.cancelAnimationFrame;
globalThis.setTimeout = setTimeout;
globalThis.clearTimeout = clearTimeout;
globalThis.ResizeObserver = class {
  constructor(cb) { this.cb = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.performance = { now: () => Date.now() };

// ==================== 加载 matrixRain(走 dist CJS · ESM-friendly) ====================
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { matrixRain } = require('../dist/index.cjs');

// ==================== 测试 ====================
console.log('🧪 监听器泄漏测试');
console.log('─'.repeat(60));

// 1. 首次 create/destroy 一对实例
const inst1 = matrixRain();
assert.equal(__resizeListeners.size, 1, 'create 后应有 1 个 resize 监听器');
inst1.destroy();
assert.equal(__resizeListeners.size, 0, 'destroy 后 resize 监听器应为 0');

// 2. 反复 create/destroy 1000 次
const N = 1000;
console.log(`  反复 create/destroy ${N} 次...`);
const instances = [];
for (let i = 0; i < N; i++) {
  instances.push(matrixRain());
}
assert.equal(__resizeListeners.size, N, `create ${N} 次后应有 ${N} 个 resize 监听器`);
for (const inst of instances) inst.destroy();
assert.equal(__resizeListeners.size, 0, `destroy ${N} 次后 resize 监听器应为 0`);

// 3. 销毁后 GC(尽力):手动置空引用
instances.length = 0;
if (globalThis.gc) {
  globalThis.gc();
  console.log('  触发 GC');
}

assert.equal(__resizeListeners.size, 0, 'GC 后 resize 监听器仍为 0');

console.log('  ✅ resize 监听器无泄漏');
console.log(`  ✅ ${N} 次 create/destroy 循环后监听器计数 = 0`);
console.log('─'.repeat(60));
console.log('✅ 监听器泄漏测试通过');
