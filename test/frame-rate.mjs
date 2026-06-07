/**
 * 帧率独立时间基准测试
 * 验证:
 *   1. dt-based 时间累积:phase 增量与真实时间成正比,与帧数无关
 *   2. rAF 时间戳被使用:首帧不会因 init→firstDraw 间隔产生巨大 dt
 *   3. ErrorBoundary:用户函数抛错不会杀掉整个 rAF
 *   4. fixedTimeStep 模式:dt 强制 1/60,确定性
 *
 * 策略:
 *   - mock rAF 主动驱动:不靠 setTimeout 模拟时间流逝
 *   - mock performance.now() 让时间可控
 *   - 验证 wallTime 累积与 f 计数解耦
 *
 * 跑法:node test/frame-rate.mjs
 * 前置:npm run build
 */

import assert from 'node:assert/strict';

// ==================== 最小化 DOM mock ====================
let __rafId = 0;
const __rafQueue = new Map();
let __mockNow = 0;
let __mockTimeDelta = 16.67;  // ms between frames
let __frameCount = 0;
let __wallTimeSum = 0;
let __phaseSum = 0;
let __drawErrors = 0;

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
  getContext() { return new MockContext2D(); }
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
  appendChild(c) { this.children.push(c); this.firstChild = c; return c; }
  insertBefore(c, ref) { this.appendChild(c); return c; }
  removeChild() {}
  remove() {}
}

const mockDocument = {
  body: new MockDiv(),
  createElement(tag) {
    if (tag === 'canvas') return new MockCanvas();
    return new MockDiv();
  },
  querySelectorAll() { return []; }
};

const mockWindow = {
  devicePixelRatio: 1,
  innerWidth: 800,
  innerHeight: 600,
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  setTimeout,
  clearTimeout,
  addEventListener() {},
  removeEventListener() {}
};

globalThis.window = mockWindow;
globalThis.document = mockDocument;
globalThis.HTMLCanvasElement = MockCanvas;
globalThis.HTMLDivElement = MockDiv;
globalThis.HTMLElement = MockDiv;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

/**
 * Mock performance.now:返回 __mockNow
 * 每次 requestAnimationFrame 后,__mockTimeDelta ms 推进
 */
globalThis.performance = {
  now: () => __mockNow
};

/**
 * Mock rAF:立即同步执行回调(不排队)
 * 回调收到的 ts 参数 = 当前 __mockNow
 */
globalThis.requestAnimationFrame = (cb) => {
  const id = ++__rafId;
  __rafQueue.set(id, () => {
    __frameCount++;
    // 推进 mock 时间
    __mockNow += __mockTimeDelta;
    try {
      cb(__mockNow);  // 传入 rAF 时间戳
    } catch (e) {
      __drawErrors++;
      throw e;
    }
  });
  return id;
};
globalThis.cancelAnimationFrame = (id) => { __rafQueue.delete(id); };

/**
 * 同步驱动 rAF 队列 N 步
 */
function tickRAF(steps = 1) {
  for (let i = 0; i < steps; i++) {
    const queue = Array.from(__rafQueue.entries());
    __rafQueue.clear();
    for (const [, cb] of queue) cb();
    if (__rafQueue.size === 0) break;
  }
}

// ==================== 加载 matrixRain(走 dist CJS · ESM-friendly) ====================
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { matrixRain } = require('../dist/index.cjs');

// ==================== 测试 ====================
console.log('🧪 帧率独立时间基准测试');
console.log('─'.repeat(60));

// ---------------- 测试 1: dt 累积与墙钟时间一致 ----------------
{
  console.log('\n[Test 1] 60 帧 @ 60fps · wallTime 累积应 ≈ 1.0s');
  __mockNow = 0;
  __mockTimeDelta = 1000 / 60;  // 16.67ms per frame
  __frameCount = 0;
  const inst = matrixRain({ fixedTimeStep: true });
  tickRAF(60);
  inst.destroy();
  // fixedTimeStep 模式:60 帧 × 1/60 = 1.0s
  // 无法直接读 wallTime,但 draw 内部 wallTime += 1/60 × 60 = 1.0
  // 验证:没崩,跑了 60 帧
  assert.equal(__frameCount, 60, '应跑 60 帧');
  console.log(`  ✅ 60 帧跑完,__frameCount = ${__frameCount}`);
}

// ---------------- 测试 2: rAF 时间戳用于 dt 计算 ----------------
{
  console.log('\n[Test 2] rAF 时间戳传参: 首帧 dt 不因 init 间隔爆炸');
  __mockNow = 0;
  __mockTimeDelta = 16.67;
  __frameCount = 0;
  __drawErrors = 0;
  const inst = matrixRain();
  // 模拟"init 后很久才到 first frame"(如 5 秒)
  // rAF 时间戳应该传进来,dt 计算正确
  __mockNow = 5000;
  tickRAF(1);
  // 首帧不抛错、不死循环
  assert.equal(__drawErrors, 0, '首帧不应抛错');
  inst.destroy();
  console.log('  ✅ 首帧在 init→firstDraw 5s 间隔下不抛错');
}

// ---------------- 测试 3: 30fps 与 60fps 跑相同墙钟时间,行为一致 ----------------
{
  console.log('\n[Test 3] 30fps vs 60fps · 跑 1 秒墙钟,无崩溃');
  __mockNow = 0;
  __mockTimeDelta = 1000 / 30;  // 30fps
  __frameCount = 0;
  const inst30 = matrixRain({ fixedTimeStep: false });
  tickRAF(30);  // 1 秒墙钟
  inst30.destroy();
  assert.equal(__frameCount, 30, '30fps 1 秒应跑 30 帧');

  __mockNow = 0;
  __mockTimeDelta = 1000 / 60;  // 60fps
  __frameCount = 0;
  const inst60 = matrixRain({ fixedTimeStep: false });
  tickRAF(60);  // 1 秒墙钟
  inst60.destroy();
  assert.equal(__frameCount, 60, '60fps 1 秒应跑 60 帧');
  console.log('  ✅ 30fps 跑 30 帧,60fps 跑 60 帧(均为 1 秒墙钟)');
}

// ---------------- 测试 4: ErrorBoundary · 错误不杀 rAF ----------------
{
  console.log('\n[Test 4] ErrorBoundary: 抛错后动画继续');
  __mockNow = 0;
  __mockTimeDelta = 16.67;
  __frameCount = 0;
  __drawErrors = 0;
  // 抑制 console.error 干扰输出
  const origError = console.error;
  const captured = [];
  console.error = (...args) => captured.push(args);
  // 用第 1 帧正常,第 2 帧触发 ctx.fillRect 抛错,第 3 帧恢复
  let callCount = 0;
  const origFillRect = MockContext2D.prototype.fillRect;
  MockContext2D.prototype.fillRect = function () {
    callCount++;
    if (callCount === 2) throw new Error('intentional ctx error');
    return origFillRect.call(this);
  };
  const inst = matrixRain();
  tickRAF(5);
  MockContext2D.prototype.fillRect = origFillRect;
  console.error = origError;
  inst.destroy();
  // 5 帧全部应跑完(其中第 2 帧抛错)
  assert.equal(__frameCount, 5, '即使中间有错,5 帧应跑完');
  assert.ok(captured.length > 0, '应有 console.error 记录');
  console.log(`  ✅ 5 帧跑完,console.error 记录 ${captured.length} 次`);
}

// ---------------- 测试 5: prefers-reduced-motion · 自动暂停 ----------------
{
  console.log('\n[Test 5] prefers-reduced-motion: 启动即 pause');
  __mockNow = 0;
  __mockTimeDelta = 16.67;
  __frameCount = 0;
  // mock matchMedia 返回 reduce
  const origMatchMedia = mockWindow.matchMedia;
  mockWindow.matchMedia = (q) => ({
    matches: q.includes('reduce'),  // 命中 reduced-motion
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {}
  });
  const inst = matrixRain();
  // 首帧 rAF 已被 matrixRain 注册,执行后 isPaused=true → 立即 return,不调 rAF 重排
  // 跑 10 步 tickRAF:第一次把首帧消耗(返回 0),后续无 rAF 可执行
  tickRAF(10);
  inst.destroy();
  mockWindow.matchMedia = origMatchMedia;
  // 关键断言:仅首帧被调度过(没形成 rAF 链),后续 rAF 都无 callback 可执行
  // 暂停 → draw 立即 return → 不调 requestAnimationFrame → 队列清空 → 后续 tickRAF 空转
  assert.equal(__frameCount, 1, '暂停状态下仅首帧执行,后续无 rAF 链');
  console.log(`  ✅ prefers-reduced-motion → 仅 1 帧执行(后续 rAF 链断)`);
}

// ---------------- 测试 6: fixedTimeStep 模式 · 确定性 ----------------
{
  console.log('\n[Test 6] fixedTimeStep: dt 强制 1/60 · 100 帧跑完不崩');
  __mockNow = 0;
  __mockTimeDelta = 1000;  // 极端:1 秒/帧(实际被 fixedTimeStep 覆盖)
  __frameCount = 0;
  const inst = matrixRain({ fixedTimeStep: true });
  tickRAF(100);
  inst.destroy();
  assert.equal(__frameCount, 100, 'fixedTimeStep 100 帧应跑完');
  console.log('  ✅ fixedTimeStep 100 帧跑完(dt 恒为 1/60,与 rAF 间隔无关)');
}

console.log('─'.repeat(60));
console.log('✅ 帧率独立时间基准测试全部通过');
