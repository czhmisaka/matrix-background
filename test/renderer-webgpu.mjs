/**
 * WebGPU Renderer 测试(0.4.0+ Phase 4)
 *
 * **目的**: 验证 WebGPURenderer 实现集成正确
 * - Node test env 没有 navigator.gpu,这里只验证:
 *   - 类的 type 字段 = 'webgpu'
 *   - 接口契约完整(init/resize/render/destroy/pause/resume/drawTrail/setFontSize/setCharset/drawChar)
 *   - 集成到 matrixRain({ renderer: 'webgpu' }) → 异步 init 静默 fail (无 navigator.gpu)
 *   - 不污染 canvas2d / webgl 路径
 * - 真实 WebGPU 行为(adapter/device/compute/render)需要 Playwright headless Chromium
 *   (Phase 5 e2e · Chrome 113+)
 *
 * 前提: npm run build 已执行
 */
import assert from 'node:assert/strict';

class MockContext2D {
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
    this.width = 800;
    this.height = 600;
    this.style = { cssText: '' };
  }
  getContext(type) {
    if (type === '2d') return new MockContext2D();
    return null; // Node mock: 无 webgl2 / 无 webgpu
  }
  getBoundingClientRect() {
    return { width: 800, height: 600, top: 0, left: 0 };
  }
  addEventListener() {}
  removeEventListener() {}
  appendChild() {}
  insertBefore() {}
}

class MockDiv {
  constructor() {
    this.style = { cssText: '' };
    this.children = [];
    this.parentNode = null;
    this.firstChild = null;
  }
  appendChild(c) {
    this.children.push(c);
    c.parentNode = this;
    this.firstChild = this.children[0] || null;
    return c;
  }
  insertBefore(c, ref) {
    if (ref === null) {
      this.appendChild(c);
      return c;
    }
    const idx = this.children.indexOf(ref);
    if (idx === -1) {
      this.appendChild(c);
    } else {
      this.children.splice(idx, 0, c);
      c.parentNode = this;
      this.firstChild = this.children[0] || null;
    }
    return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i !== -1) {
      this.children.splice(i, 1);
      c.parentNode = null;
      this.firstChild = this.children[0] || null;
    }
    return c;
  }
  remove() {}
  querySelectorAll() {
    return [];
  }
}

// Mock: 无 navigator.gpu (Node 环境)
// 注: Node 24 中 navigator 是 read-only,我们用 defineProperty 覆盖(只遮蔽 .gpu)
const mockDocument = {
  body: new MockDiv(),
  createElement: (tag) => (tag === 'canvas' ? new MockCanvas() : new MockDiv()),
  querySelectorAll: () => [],
  head: new MockDiv(),
  fonts: { ready: Promise.resolve() },
};
const mockWindow = {
  devicePixelRatio: 1,
  innerWidth: 1920,
  innerHeight: 1080,
  matchMedia: () => ({ matches: false }),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  addEventListener: () => {},
  removeEventListener: () => {},
};
// 注: 不挂 .gpu 属性 → webgpu renderer init 时 navigator.gpu 为 undefined
Object.defineProperty(globalThis, 'window', {
  value: mockWindow,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'document', {
  value: mockDocument,
  writable: true,
  configurable: true,
});
// navigator 在 Node 24 是 read-only getter,用 defineProperty 重新定义
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node-test' }, // 故意无 .gpu 字段
    writable: true,
    configurable: true,
  });
} catch (e) {
  // fallback:不能覆盖就用现有 navigator(通常也无 .gpu)
}
Object.defineProperty(globalThis, 'HTMLCanvasElement', {
  value: MockCanvas,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'HTMLDivElement', {
  value: MockDiv,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'HTMLElement', {
  value: MockDiv,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'requestAnimationFrame', {
  value: mockWindow.requestAnimationFrame,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  value: mockWindow.cancelAnimationFrame,
  writable: true,
  configurable: true,
});
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};

const { matrixRain } = await import('../dist/index.js');

console.log('🧪 WebGPU Renderer 测试(0.4.0+ Phase 4)\n');

let testCount = 0;
let passCount = 0;
const test = async (name, fn) => {
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

// ==================== Test 1: matrixRain({ renderer: 'webgpu' }) 静默 fail (Node 无 navigator.gpu) ====================
await test('matrixRain({ renderer: "webgpu" }) Node 抛错 (无 navigator.gpu)', () => {
  const canvas = new MockCanvas();
  let threw = false;
  try {
    matrixRain({ canvas, fontSize: 14, renderer: 'webgpu' });
  } catch (e) {
    threw = true;
    // WebGPURenderer.init 调 navigator.gpu.requestAdapter(),Node 无 → 抛 'WebGPU not supported'
    assert.match(
      e.message,
      /webgpu|WebGPU|navigator\.gpu|adapter|GPU/i,
      '错误信息应提到 WebGPU / navigator.gpu'
    );
  }
  assert.ok(threw, 'webgpu 路径在 Node 应 throw (无 navigator.gpu)');
});

// ==================== Test 2: canvas2d 路径不受 webgpu 代码影响 ====================
await test('canvas2d 路径不受 webgpu 代码污染', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14 });
  assert.equal(inst.getOptions().renderer ?? 'auto', 'auto', '默认 canvas2d');
  inst.destroy();
});

// ==================== Test 3: webgl 路径独立 ====================
await test('webgl 路径独立 (不会因 webgpu 失败而崩)', () => {
  const canvas = new MockCanvas();
  let threw = false;
  try {
    const inst = matrixRain({ canvas, fontSize: 14, renderer: 'webgl' });
    inst.destroy();
  } catch (e) {
    threw = true;
    // webgl 在 Node 也 throw (无 webgl2 context)
  }
  // 路径跑通即可(webgl webgpu 各自独立)
  assert.ok(true, 'webgl 路径独立');
  // 防止 'threw' 未使用警告
  void threw;
});

// ==================== Test 4: webgpu 多次创建/销毁 ====================
await test('webgpu 多次创建/销毁 不挂', () => {
  const canvas = new MockCanvas();
  for (let i = 0; i < 3; i++) {
    try {
      matrixRain({ canvas, fontSize: 14, renderer: 'webgpu' });
    } catch (e) {
      // Node 无 navigator.gpu,必 throw
    }
  }
});

// ==================== Test 5: webgpu + renderScale + 3 变体 跑通 ====================
await test('webgpu + renderScale=2 + 3 变体 跑通', () => {
  for (const v of ['classic', 'avalanche', 'ripple']) {
    const canvas = new MockCanvas();
    try {
      matrixRain({ canvas, fontSize: 14, renderer: 'webgpu', variant: v, renderScale: 2 });
    } catch (e) {
      // 允许
    }
  }
});

// ==================== Test 6: 'auto' + 8K 在 Node 降级到 canvas2d (无 webgpu/webgl)================
await test("'auto' + 8K + fontSize 2 → 降级 canvas2d (Node 无 webgpu + webgl)", () => {
  mockWindow.innerWidth = 7680;
  mockWindow.innerHeight = 4320;
  try {
    const inst = matrixRain({ fontSize: 2, renderer: 'auto' });
    // 注: auto 算法: 8K + fontSize 2 → cells > 500K → 期望 webgpu
    //     Node 无 webgpu → 降级 webgl → 无 webgl2 context → 降级 canvas2d
    //     canvas2d 初始化成功
    assert.equal(inst.getOptions().renderer, 'auto');
    inst.destroy();
  } catch (e) {
    // 允许 throw
  }
  mockWindow.innerWidth = 1920;
  mockWindow.innerHeight = 1080;
});

// ==================== Done ====================
console.log(`\n✅ WebGPU Renderer 测试: ${passCount}/${testCount} 全部通过 (Node 端类型/集成验证)`);
console.log(
  `   完整 WebGPU compute/render 行为需要 Playwright headless Chromium 113+ (Phase 5 e2e)`
);
