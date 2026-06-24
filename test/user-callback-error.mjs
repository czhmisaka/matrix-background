/**
 * fireOn* 回调 try/catch 静默吞错修复测试
 *
 * 验收:onFrame throw 后,getDiagnostics().userCallbackError.message 应 === 'boom'
 *
 * 策略:复用 frame-rate.mjs 的 rAF mock 模式(mock performance.now + 同步驱动 rAF),
 *      验证 5 帧后错误被暴露在 getDiagnostics 上
 *
 * 跑法:node test/user-callback-error.mjs
 * 前置:npm run build
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { matrixRain } = require('../dist/index.cjs');

// ==================== 最小化 DOM mock(与 frame-rate.mjs 同构)====================
let __rafId = 0;
const __rafQueue = new Map();
let __mockNow = 0;
let __mockTimeDelta = 100; // 100ms/帧 → 跳过 30Hz 节流(100 > 33.3)
let __frameCount = 0;

class MockContext2D {
  setTransform() {}
  fillRect() {}
  fillText() {}
  save() {}
  restore() {}
  scale() {}
}
class MockCanvas {
  constructor() {
    this.id = '';
    this.width = 100;
    this.height = 100;
    this.style = { cssText: '' };
    this._listeners = new Map();
  }
  getContext() {
    return new MockContext2D();
  }
  getBoundingClientRect() {
    return { width: 800, height: 600 };
  }
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {}
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
    this.firstChild = null;
  }
  appendChild(c) {
    this.children.push(c);
    this.firstChild = c;
    return c;
  }
  insertBefore(c, ref) {
    this.appendChild(c);
    return c;
  }
  removeChild() {}
  remove() {}
}

globalThis.window = {
  devicePixelRatio: 1,
  innerWidth: 800,
  innerHeight: 600,
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  setTimeout,
  clearTimeout,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = {
  body: new MockDiv(),
  createElement(tag) {
    if (tag === 'canvas') return new MockCanvas();
    return new MockDiv();
  },
  querySelectorAll() {
    return [];
  },
};
globalThis.HTMLCanvasElement = MockCanvas;
globalThis.HTMLDivElement = MockDiv;
globalThis.HTMLElement = MockDiv;
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.performance = { now: () => __mockNow };
globalThis.requestAnimationFrame = (cb) => {
  const id = ++__rafId;
  __rafQueue.set(id, () => {
    __frameCount++;
    __mockNow += __mockTimeDelta;
    cb(__mockNow);
  });
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  __rafQueue.delete(id);
};

function tickRAF(steps = 1) {
  for (let i = 0; i < steps; i++) {
    const queue = Array.from(__rafQueue.entries());
    __rafQueue.clear();
    for (const [, cb] of queue) cb();
    if (__rafQueue.size === 0) break;
  }
}

// ==================== 测试 ====================
console.log('🧪 fireOn* 回调错误透出测试');
console.log('─'.repeat(60));

// ---------------- Test 1: onFrame throw 应被 getDiagnostics 捕获 ----------------
{
  console.log('\n[Test 1] onFrame throw → getDiagnostics().userCallbackError.message === "boom"');
  __mockNow = 0;
  __frameCount = 0;

  const inst = matrixRain({
    fixedTimeStep: true,
    onFrame: () => {
      throw new Error('boom');
    },
  });

  // 初始状态:无错
  assert.equal(inst.getDiagnostics().userCallbackError, null, '初始 userCallbackError 应为 null');

  // 跑 5 帧
  tickRAF(5);
  assert.equal(__frameCount, 5, '5 帧应跑完(throw 不杀 rAF)');

  // 验证错误已捕获
  const diag = inst.getDiagnostics();
  assert.ok(diag.userCallbackError, 'userCallbackError 应非 null');
  assert.equal(
    diag.userCallbackError.name,
    'onFrame',
    `name === 'onFrame'(实际 ${diag.userCallbackError.name})`
  );
  assert.equal(
    diag.userCallbackError.message,
    'boom',
    `message === 'boom'(实际 ${diag.userCallbackError.message})`
  );
  assert.equal(typeof diag.userCallbackError.frame, 'number', 'frame 字段应为数字');
  assert.ok(diag.userCallbackError.frame >= 0, `frame >= 0(实际 ${diag.userCallbackError.frame})`);

  inst.destroy();
  console.log(
    `  ✅ onFrame throw 已透出:name=${diag.userCallbackError.name}, message=${diag.userCallbackError.message}, frame=${diag.userCallbackError.frame}`
  );
}

// ---------------- Test 2: onThemeChange throw 应被 getDiagnostics 捕获 ----------------
{
  console.log('\n[Test 2] onThemeChange throw → userCallbackError.name === "onThemeChange"');
  const inst = matrixRain({
    onThemeChange: () => {
      throw new Error('theme-boom');
    },
  });
  inst.setTheme('lava-red');
  const diag = inst.getDiagnostics();
  assert.ok(diag.userCallbackError, 'userCallbackError 应非 null');
  assert.equal(diag.userCallbackError.name, 'onThemeChange', `name === 'onThemeChange'`);
  assert.equal(diag.userCallbackError.message, 'theme-boom', `message === 'theme-boom'`);
  inst.destroy();
  console.log(`  ✅ onThemeChange throw 已透出`);
}

// ---------------- Test 3: onTargetFinish throw 应被 getDiagnostics 捕获 ----------------
{
  console.log('\n[Test 3] onTargetFinish throw → userCallbackError.name === "onTargetFinish"');
  const inst = matrixRain({
    onTargetFinish: () => {
      throw new Error('finish-boom');
    },
  });
  inst.clearTargetBitmap();
  const diag = inst.getDiagnostics();
  assert.ok(diag.userCallbackError, 'userCallbackError 应非 null');
  assert.equal(diag.userCallbackError.name, 'onTargetFinish', `name === 'onTargetFinish'`);
  assert.equal(diag.userCallbackError.message, 'finish-boom', `message === 'finish-boom'`);
  inst.destroy();
  console.log(`  ✅ onTargetFinish throw 已透出`);
}

// ---------------- Test 4: 无 throw 时 userCallbackError 保持 null ----------------
{
  console.log('\n[Test 4] 无 throw → userCallbackError 保持 null');
  __mockNow = 0;
  __frameCount = 0;
  let frameCalls = 0;
  const inst = matrixRain({
    fixedTimeStep: true,
    onFrame: () => {
      frameCalls++;
    },
  });
  tickRAF(5);
  assert.equal(frameCalls, 5, 'onFrame 应被调 5 次');
  assert.equal(
    inst.getDiagnostics().userCallbackError,
    null,
    '无 throw → userCallbackError 应为 null'
  );
  inst.destroy();
  console.log(`  ✅ 无 throw 时保持 null(共 ${frameCalls} 次 onFrame)`);
}

// ---------------- Test 5: 非 Error throw(string)应被 String() 转字符串 ----------------
{
  console.log('\n[Test 5] throw "字符串" → message === "字符串"');
  __mockNow = 0;
  __frameCount = 0;
  const inst = matrixRain({
    fixedTimeStep: true,
    onFrame: () => {
      throw 'string-error';
    },
  });
  tickRAF(5);
  const diag = inst.getDiagnostics();
  assert.ok(diag.userCallbackError, 'userCallbackError 应非 null');
  assert.equal(
    diag.userCallbackError.message,
    'string-error',
    `message === 'string-error'(实际 ${diag.userCallbackError.message})`
  );
  inst.destroy();
  console.log(`  ✅ 非 Error throw 也被透出`);
}

console.log('─'.repeat(60));
console.log('✅ fireOn* 回调错误透出测试全部通过');
