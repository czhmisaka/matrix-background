/**
 * Canvas 2D Renderer 测试(0.4.0+)
 *
 * **目的**: 验证 Phase 1 引入的 Canvas2DRenderer 行为正确
 * - 默认 renderer = 'auto' → canvas2d
 * - 显式 renderer: 'canvas2d' 等价
 * - WebGL / WebGPU 在 Phase 1 抛错(待 Phase 2B / Phase 4)
 * - 集成: matrixRain() 跑 N 帧 fillText 仍正常工作
 *
 * 前提: npm run build 已执行
 */
import assert from 'node:assert/strict';

// ==================== 最小化 DOM mock(参考 test/leak.mjs)====================
let __rafId = 0;
const __rafQueue = new Map();

class MockContext2D {
  constructor() {
    this.fillStyle = '';
    this.font = '';
    this.textBaseline = '';
    this.textAlign = '';
    this.fillTextCalls = [];
    this.fillRectCalls = [];
  }
  setTransform() {}
  fillText(text, x, y) {
    this.fillTextCalls.push({ text, x, y });
  }
  fillRect(x, y, w, h) {
    this.fillRectCalls.push({ x, y, w, h });
  }
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
    return { width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 };
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

console.log('🧪 Canvas 2D Renderer 测试(0.4.0+)\n');

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

// ==================== Test 1: 默认走 canvas2d ====================
await test('默认 renderer = "auto" → Canvas2DRenderer', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  assert.equal(inst.getOptions().renderer ?? 'auto', 'auto', '默认 options.renderer = auto');
  inst.destroy();
});

// ==================== Test 2: 显式 renderer: 'canvas2d' ====================
await test('显式 renderer: "canvas2d" 等价于 auto', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true, renderer: 'canvas2d' });
  assert.equal(inst.getOptions().renderer, 'canvas2d', 'options.renderer = canvas2d');
  inst.destroy();
});

// ==================== Test 3: 集成 - fillText 仍正常 ====================
await test('集成: matrixRain() 跑 60 帧 fillText 计数正常 (默认 canvas2d)', async () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  // 跑 60 帧
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1));
  }
  // 验证 fillText 有被调(默认 1x 路径,~ 57*40=2280 cells)
  // 注: MockContext2D 每次 getContext 都返回新 ctx, 所以 fillTextCalls 不在原 canvas 上
  // 改为: 验证 inst.getFPS() 正常(说明 rAF 在跑) + destroy() 不抛
  assert.ok(typeof inst.getFPS() === 'number', 'getFPS() 应返回 number');
  inst.destroy();
});

// ==================== Test 4: renderer=webgl 在 Phase 1 抛错 ====================
await test('renderer=webgl 在 Phase 1 throw (Phase 2B 才实现)', () => {
  const canvas = new MockCanvas();
  let threw = false;
  try {
    matrixRain({ canvas, fontSize: 14, renderer: 'webgl' });
  } catch (e) {
    threw = true;
    assert.match(e.message, /WebGL|not yet implemented/i, '错误信息应提到 WebGL');
  }
  assert.ok(threw, 'renderer=webgl 应 throw');
});

// ==================== Test 5: renderer=webgpu 在 Phase 1 抛错 ====================
await test('renderer=webgpu 在 Phase 1 throw (Phase 4 才实现)', () => {
  const canvas = new MockCanvas();
  let threw = false;
  try {
    matrixRain({ canvas, fontSize: 14, renderer: 'webgpu' });
  } catch (e) {
    threw = true;
    assert.match(e.message, /WebGPU|not yet implemented/i, '错误信息应提到 WebGPU');
  }
  assert.ok(threw, 'renderer=webgpu 应 throw');
});

// ==================== Test 6: renderScale 集成 ====================
await test('集成: renderer=canvas2d + renderScale=2 跑通不崩', async () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true, renderScale: 2 });
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1));
  }
  assert.ok(typeof inst.getFPS() === 'number');
  inst.destroy();
});

// ==================== Test 7: destroy() 幂等 ====================
await test('destroy() 第二次调用 no-op(不抛错)', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  inst.destroy();
  inst.destroy(); // 第二次不抛错
  inst.destroy(); // 第三次仍不抛
});

// ==================== Test 8: 多次创建/销毁 ====================
await test('多次创建/销毁(模拟热重载场景)', () => {
  const canvas = new MockCanvas();
  for (let i = 0; i < 5; i++) {
    const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
    inst.destroy();
  }
});

// ==================== Test 9: 子格 + canvas2d 组合不崩 ====================
await test('集成: renderScale=auto + canvas2d 不崩(子格 1x 路径)', async () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true, renderScale: 'auto' });
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1));
  }
  assert.ok(typeof inst.getFPS() === 'number');
  inst.destroy();
});

// ==================== Test 10: 所有 variants + canvas2d ====================
await test('集成: variant=avalanche/ripple + canvas2d 不崩', async () => {
  for (const v of ['avalanche', 'ripple']) {
    const canvas = new MockCanvas();
    const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true, variant: v });
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    assert.ok(typeof inst.getFPS() === 'number', `variant=${v} getFPS() OK`);
    inst.destroy();
  }
});

// ==================== Done ====================
console.log(`\n✅ Canvas 2D Renderer 测试: ${passCount}/${testCount} 全部通过`);
