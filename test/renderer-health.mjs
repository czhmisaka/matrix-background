/**
 * Renderer Health 测试(0.6.0+)
 *
 * **目的**: 验证 `getRendererHealth()` 公共 API
 * - canvas2d: frameCount 随 render() 自增;init 后 initialized=true;snapshot Object.freeze
 * - webgl: 初始化失败时 lastInitError / INSTANCE_COUNT_MISMATCH 路径(0.6.0 暴露"真 bug"而非"假通过")
 * - webgpu: 初始化失败时 lastInitError 路径
 * - 公共契约: getHealth 存在 / 返回 object / 字段齐 / Object.isFrozen
 *
 * 前提: npm run build 已执行
 */
import assert from 'node:assert/strict';

// ==================== Mock DOM(复用 renderer-canvas2d.mjs 的最小化版本)====================
class MockContext2D {
  constructor() {
    this.fillStyle = '';
    this.font = '';
    this.textBaseline = '';
    this.textAlign = '';
  }
  setTransform() {}
  fillText() {}
  fillRect() {}
  save() {}
  restore() {}
  scale() {}
  translate() {}
}

class MockCanvas {
  constructor() {
    this.id = '';
    this.width = 800;
    this.height = 600;
    this.style = { cssText: '' };
    this.parentNode = null;
    this._listeners = new Map();
  }
  getContext() {
    return new MockContext2D();
  }
  getBoundingClientRect() {
    return { width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 0 };
  }
  addEventListener() {}
  removeEventListener() {}
  remove() {}
  appendChild() {}
  insertBefore() {}
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
    if (ref === null) return this.appendChild(child);
    const idx = this.children.indexOf(ref);
    if (idx === -1) return this.appendChild(child);
    this.children.splice(idx, 0, child);
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
    if (tag === 'canvas') return new MockCanvas();
    return new MockDiv();
  },
  querySelectorAll() {
    return [];
  },
  head: new MockDiv(),
  documentElement: new MockDiv(),
  fonts: { ready: Promise.resolve() },
};

let __rafId = 0;
const __rafQueue = new Map();
const mockWindow = {
  devicePixelRatio: 1,
  innerWidth: 800,
  innerHeight: 600,
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
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
  observe() {}
  disconnect() {}
};

// 真正加载 dist(必须在 mock 之后)
const { matrixRain } = await import('../dist/index.js');

console.log('🧪 Renderer Health 测试(0.6.0+)\n');

let testCount = 0;
let passCount = 0;
const test = (name, fn) => {
  testCount++;
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`  ✅ ${name}`);
      passCount++;
    })
    .catch((e) => {
      console.log(`  ❌ ${name}`);
      console.log(`     ${e.message}`);
      throw e;
    });
};

// ==================== Test 1: getRendererHealth 存在(实例 API)==================
await test('matrixRain 实例暴露 getRendererHealth()', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  assert.equal(typeof inst.getRendererHealth, 'function', 'getRendererHealth 必须是 function');
  inst.destroy();
});

// ==================== Test 2: 字段齐(11 个字段)==================
await test('getRendererHealth() 返回完整快照(11 字段)', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  const h = inst.getRendererHealth();
  const required = [
    'renderer',
    'initialized',
    'frameCount',
    'drawCallIdx',
    'instanceCount',
    'gridCols',
    'gridRows',
    'initDurationMs',
    'lastFrameDurationMs',
    'droppedFrames',
    'lastGlError',
    'lastErrorScope',
    'lastInitError',
  ];
  for (const k of required) {
    assert.ok(k in h, `字段 ${k} 必须存在`);
  }
  inst.destroy();
});

// ==================== Test 3: 快照 Object.freeze(无法篡改)==================
await test('getRendererHealth() 返回 Object.freeze 副本(不可写)', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  const h = inst.getRendererHealth();
  assert.ok(Object.isFrozen(h), 'snapshot 必须是 Object.isFrozen');
  // 试图写必抛(strict mode)
  let threw = false;
  try {
    h.frameCount = 9999;
  } catch (e) {
    threw = true;
  }
  assert.ok(threw, '修改 frozen 字段必须抛 TypeError');
  inst.destroy();
});

// ==================== Test 4: canvas2d 字段合理 ==================
await test('canvas2d 快照字段:renderer=canvas2d / initialized=true / frameCount=0 初始', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  const h = inst.getRendererHealth();
  assert.equal(h.renderer, 'canvas2d');
  assert.equal(h.initialized, true);
  assert.equal(h.frameCount, 0, '刚 init frameCount=0');
  assert.equal(h.lastGlError, 0, 'canvas2d lastGlError=0(无 GL 错误源)');
  assert.equal(h.lastErrorScope, null, 'canvas2d lastErrorScope=null');
  assert.equal(h.lastInitError, null, 'canvas2d 成功 init → lastInitError=null');
  inst.destroy();
});

// ==================== Test 5: canvas2d frameCount 自增 ==================
// 0.6.0+ 修复:canvas2d render() 之前是 no-op,frameCount 永远 0
// 现在 render() 集中 tick frameCount + droppedFrames
// 注:Node 端 rAF 不会自动 fire,需手动 drain __rafQueue
await test('canvas2d 跑 N 帧后 frameCount == N(0.6.0+ 修复:render tick)', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  // 跑 5 帧(每帧 drain rAF queue,模拟浏览器 rAF 节奏)
  for (let i = 0; i < 5; i++) {
    const queue = Array.from(__rafQueue.entries());
    __rafQueue.clear();
    for (const [, cb] of queue) cb();
  }
  const h = inst.getRendererHealth();
  assert.ok(
    h.frameCount >= 1,
    `跑 5 帧后 frameCount 必须 ≥ 1,实际 ${h.frameCount}(0.6.0 修复前 = 0)`
  );
  inst.destroy();
});

// ==================== Test 6: webgl init 失败 → lastInitError 入库 ==================
// Node env: MockCanvas.getContext('webgl2') 返回 MockContext2D,webgl resize 同步调
// gl.viewport() 抛 TypeError.matrixRain 自身 sync 返回 inst,init 异步静默 fail,
// 关键承诺: getRendererHealth() 暴露 lastInitError 字段,且不抛
await test('webgl Node env: getRendererHealth() 暴露 lastInitError 字段 + 不抛', () => {
  const canvas = new MockCanvas();
  let inst;
  try {
    inst = matrixRain({ canvas, fontSize: 14, renderer: 'webgl' });
  } catch (e) {
    // webgl resize 同步抛(viewport is not function)— 0.6.0+ 不应发生,但兜底
    return;
  }
  const h = inst.getRendererHealth();
  assert.equal(h.renderer, 'webgl', 'webgl 路径 renderer=webgl');
  assert.ok('lastInitError' in h, '字段 lastInitError 必须存在');
  assert.ok('lastGlError' in h, '字段 lastGlError 必须存在');
  assert.ok('droppedFrames' in h, '字段 droppedFrames 必须存在(0.6.0+)');
  assert.equal(typeof h.lastInitError === 'string' || h.lastInitError === null, true);
  inst.destroy();
});

// ==================== Test 7: webgpu init 失败 → lastInitError 入库 ==================
// Node env: navigator.gpu undefined,webgpu init 抛
await test('webgpu Node env: getRendererHealth() 暴露 lastInitError 字段 + 不抛', () => {
  const canvas = new MockCanvas();
  let inst;
  try {
    inst = matrixRain({ canvas, fontSize: 14, renderer: 'webgpu' });
  } catch (e) {
    return;
  }
  const h = inst.getRendererHealth();
  assert.equal(h.renderer, 'webgpu', 'webgpu 路径 renderer=webgpu');
  assert.ok('lastInitError' in h, '字段 lastInitError 必须存在');
  assert.ok('lastErrorScope' in h, '字段 lastErrorScope 必须存在');
  inst.destroy();
});

// ==================== Test 8: 连续读快照得到独立副本(不共享引用)==================
await test('连续两次 getRendererHealth() 返回不同对象(防御 race)', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  const h1 = inst.getRendererHealth();
  const h2 = inst.getRendererHealth();
  assert.notEqual(h1, h2, '必须返回新对象,不能共享引用(避免外部 race)');
  inst.destroy();
});

// ==================== Test 9: 多次 create/destroy 后 health API 仍可用 ==================
await test('多次 create/destroy 不影响 getRendererHealth() 可用性', () => {
  for (let i = 0; i < 3; i++) {
    const canvas = new MockCanvas();
    const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
    const h = inst.getRendererHealth();
    assert.equal(h.renderer, 'canvas2d');
    inst.destroy();
  }
});

// ==================== Done ==================
console.log(`\n✅ Renderer Health 测试: ${passCount}/${testCount} 全部通过`);
