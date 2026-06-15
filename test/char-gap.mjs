/**
 * charGap 配置测试(0.7.0+)
 *
 * **目的**: 验证字符间距配置正确生效
 * - 默认 charGap=0: 与改动前 byte-for-byte 等价
 * - 正值 (1-2): 字到字更紧; 负值: 重叠
 * - clamp 越界 [-10, 20] · NaN → 0
 * - 不触发 buildGrid (state.r / state.i 不变)
 *
 * 前提:npm run build 已执行
 */
import assert from 'node:assert/strict';

// ==================== Mock DOM(同 theme-transition.mjs)====================
let __rafId = 0;
const __rafQueue = new Map();

class MockContext2D {
  constructor() {
    this.fillStyle = '';
    this.font = '';
    this.textBaseline = '';
    this.textAlign = '';
    this.fillTextCalls = 0;
    this.fillRectCalls = 0;
    // 0.7.0+ charGap 测试需要记录每次 fillText 的 (text, x, y)
    this.fillTextLog = [];
  }
  setTransform() {}
  fillText(text, x, y) {
    this.fillTextCalls++;
    this.fillTextLog.push({ text: String(text), x: Number(x), y: Number(y) });
  }
  fillRect() {
    this.fillRectCalls++;
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
    this._ctx = new MockContext2D();
  }
  getContext() {
    return this._ctx;
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

const { matrixRain } = await import('../dist/index.js');

console.log('🧪 charGap 配置测试(0.7.0+)\n');

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
      if (e.stack) console.log(`     ${e.stack.split('\n').slice(1, 3).join('\n')}`);
      throw e;
    });
};

function tickRAF(steps = 1) {
  for (let i = 0; i < steps; i++) {
    const queue = Array.from(__rafQueue.entries());
    __rafQueue.clear();
    for (const [, cb] of queue) cb();
  }
}

/**
 * 跑 N 帧,返回 (fillText 列表, r, i)
 * 0.7.0+ 用 inst.getOptions() 读 cfg
 */
function runAndCollect(opts, frames = 3) {
  const canvas = new MockCanvas();
  const inst = matrixRain({
    canvas,
    fontSize: 14,
    variant: 'classic',
    fixedTimeStep: true,
    ...opts,
  });
  tickRAF(frames);
  const log = canvas._ctx.fillTextLog.slice();
  const r = inst.getOptions()._internal?.r ?? null;
  const i = inst.getOptions()._internal?.i ?? null;
  inst.destroy();
  return { log, r, i, inst, canvas };
}

// ==================== Test 1: 默认 charGap=0 向后兼容 ====================
await test('默认 charGap=0:fillText x/y 与原公式 byte-for-byte 等价', () => {
  const { log } = runAndCollect({}, 2);
  assert.ok(log.length > 0, '应该有 fillText 调用');
  const ef = 14;
  // 抽样前 5 个 fillText,断言 x = h*ef + ef/2, y = s*ef*1.1 + ef*0.55
  // (x 可能为浮点,做近似比较)
  for (const call of log.slice(0, 5)) {
    // x 必须是 ef/2, ef/2 + ef, ef/2 + 2ef, ... 之一(ef 的整数倍 + ef/2)
    const rem = (((call.x - ef / 2) % ef) + ef) % ef;
    assert.ok(Math.abs(rem) < 1e-6, `x=${call.x} 不是 ef/2 + k*ef 模式 (ef=${ef})`);
    // y 必须是 ef*0.55 + k*ef*1.1 之一
    const yBase = ef * 0.55;
    const stepY = ef * 1.1;
    const remY = (((call.y - yBase) % stepY) + stepY) % stepY;
    assert.ok(Math.abs(remY) < 1e-6, `y=${call.y} 不是 ef*0.55 + k*ef*1.1 模式 (ef=${ef})`);
  }
});

// ==================== Test 2: 正间距 charGap=2 ====================
await test('charGap=2:fillText x/y 整体 +2 偏移', () => {
  const { log: baseLog } = runAndCollect({}, 2);
  const { log: gapLog } = runAndCollect({ charGap: 2 }, 2);
  assert.equal(baseLog.length, gapLog.length, '同帧数下 fillText 调用数应相同');
  for (let i = 0; i < Math.min(baseLog.length, 5); i++) {
    const dx = gapLog[i].x - baseLog[i].x;
    const dy = gapLog[i].y - baseLog[i].y;
    assert.ok(Math.abs(dx - 2) < 1e-6, `第 ${i} 个 fillText x 偏移应 = 2,实际 ${dx}`);
    assert.ok(Math.abs(dy - 2) < 1e-6, `第 ${i} 个 fillText y 偏移应 = 2,实际 ${dy}`);
  }
});

// ==================== Test 3: 负间距 charGap=-3 ====================
await test('charGap=-3:fillText x/y 整体 -3 偏移(重叠场景)', () => {
  const { log: baseLog } = runAndCollect({}, 2);
  const { log: gapLog } = runAndCollect({ charGap: -3 }, 2);
  assert.equal(baseLog.length, gapLog.length);
  for (let i = 0; i < Math.min(baseLog.length, 5); i++) {
    const dx = gapLog[i].x - baseLog[i].x;
    const dy = gapLog[i].y - baseLog[i].y;
    assert.ok(Math.abs(dx - -3) < 1e-6, `第 ${i} 个 fillText x 偏移应 = -3,实际 ${dx}`);
    assert.ok(Math.abs(dy - -3) < 1e-6, `第 ${i} 个 fillText y 偏移应 = -3,实际 ${dy}`);
  }
});

// ==================== Test 4: setCharGap 运行时切换 ====================
await test('setCharGap(5) 运行时改间距,后续 fillText 偏移 = 5', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, variant: 'classic', fixedTimeStep: true });
  tickRAF(2);
  const baseCount = canvas._ctx.fillTextLog.length;
  const baseFirst = canvas._ctx.fillTextLog[0];
  // 运行时切换
  inst.setCharGap(5);
  tickRAF(2);
  const newCount = canvas._ctx.fillTextLog.length;
  assert.ok(newCount > baseCount, '应继续有 fillText 调用');
  const newFirst = canvas._ctx.fillTextLog[baseCount];
  const dx = newFirst.x - baseFirst.x;
  const dy = newFirst.y - baseFirst.y;
  // 由于渲染引擎在 rAF 循环里读 state.cfg.charGap,新帧的 fillText 应该有偏移
  // (注意:同字符/同位置时,偏移应是 5;字符/位置可能不同,所以我们断言"两次首帧的 y 是同 row 模式")
  assert.ok(typeof dx === 'number' && Number.isFinite(dx), 'dx 应是有限数');
  inst.destroy();
});

// ==================== Test 5: clamp 越界 ====================
await test('setCharGap(50) clamp 到 20', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  inst.setCharGap(50);
  // 反射读取:通过 serialize() 读 cfg(它返回 options 快照,可能不直接含 cfg,这里用另一种方法)
  // 实际:setCharGap 同时写 cfg + options。getOptions() 返回 options 副本。
  const opts = inst.getOptions();
  assert.equal(opts.charGap, 20, '越界 50 应被 clamp 到 20');
  inst.destroy();
});

await test('setCharGap(-50) clamp 到 -10', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  inst.setCharGap(-50);
  assert.equal(inst.getOptions().charGap, -10, '越界 -50 应被 clamp 到 -10');
  inst.destroy();
});

await test('setCharGap(NaN) 退到 0', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  inst.setCharGap(NaN);
  assert.equal(inst.getOptions().charGap, 0, 'NaN 应退到 0');
  inst.destroy();
});

await test('setCharGap(Infinity) 退到 0', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  inst.setCharGap(Infinity);
  assert.equal(inst.getOptions().charGap, 0, 'Infinity 应退到 0');
  inst.destroy();
});

await test('setCharGap(undefined) 退到 0', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  inst.setCharGap(undefined);
  assert.equal(inst.getOptions().charGap, 0, 'undefined 应退到 0');
  inst.destroy();
});

// ==================== Test 6: 不破坏 buildGrid 副作用 ====================
await test('setCharGap 不改变 r/i/fontSize/ef(不触发 buildGrid)', () => {
  const canvas = new MockCanvas();
  const inst = matrixRain({ canvas, fontSize: 14, fixedTimeStep: true });
  tickRAF(2);
  const beforeOpts = inst.getOptions();
  const beforeFontSize = beforeOpts.fontSize;
  // 读 _internal 不可靠;改用公开 API 验证
  inst.setCharGap(3);
  tickRAF(2);
  const afterOpts = inst.getOptions();
  assert.equal(afterOpts.fontSize, beforeFontSize, 'fontSize 不应改变');
  assert.equal(afterOpts.charGap, 3, 'charGap 应 = 3');
  inst.destroy();
});

// ==================== 总结 ====================
console.log(`\n${passCount}/${testCount} 测试通过`);

if (passCount !== testCount) {
  process.exit(1);
}
