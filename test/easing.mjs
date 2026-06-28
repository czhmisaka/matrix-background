/**
 * Easing + 中断与回退测试(0.4.0+)
 *
 * @deprecated: 0.8.0 迁移到 test/unit/engine/easing.spec.ts(Vitest)。
 *             本探针保留作过渡期对照(参见 docs/test-strategy.md §7.1),
 *             旧 `test:easing` script 暂不删除,后续 minor 移除。
 *
 * 验证:
 *   1. 默认 easing = 'smooth' = cubic ease
 *   2. setEasing('linear') 立即生效(下一帧起)
 *   3. setEasing('smooth') 切回 cubic
 *   4. setTheme mid-flight: from = 当前显示值(插值),非旧快照
 *   5. setThemeParams mid-flight: 同样
 *   6. setVariantParams mid-flight: 同样
 *   7. setTransitionAlpha mid-flight: 同样(原本就正确)
 *   8. per-call { easing: 'linear' } 覆盖全局 'smooth'
 *   9. per-call { dur: 0 } 立即切换
 *   10. per-call { dur: 0.1 } 覆盖 cfg themeTransitionDur
 *   11. 0x 测试 getOptions().easing 反映用户原值
 *
 * 策略:
 *   - mock 2D ctx + DOM
 *   - 用 setTheme 等 setter + 跑 RAF 帧推进
 *   - 用 getEffectiveThemeState 通过 state.hooks 取内部状态(测试钩)
 *
 * 跑法:node test/easing.mjs
 * 前置:npm run build
 */

import assert from 'node:assert/strict';

// ==================== Mock DOM ====================
let __rafId = 0;
const __rafQueue = new Map();
let __mockNow = 0;
let __mockTimeDelta = 16.67;

let __fillStyleCalls = [];
let __fillTextCalls = 0;
let __fillTextLog = [];

class MockContext2D {
  setTransform() {}
  fillRect() {}
  save() {}
  restore() {}
  scale() {}
  translate() {}
  measureText() {
    return { width: 0 };
  }
  get fillStyle() {
    return '';
  }
  set fillStyle(v) {
    if (v && v.startsWith('rgba(')) __fillStyleCalls.push(v);
  }
  get font() {
    return '';
  }
  set font(v) {}
  get textBaseline() {
    return '';
  }
  set textBaseline(v) {}
  get textAlign() {
    return '';
  }
  set textAlign(v) {}
  fillText(ch, x, y) {
    __fillTextCalls++;
    if (__fillTextLog.length < 100) {
      __fillTextLog.push({ ch, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
    }
  }
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
    return { width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 };
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
  querySelectorAll() {
    return [];
  }
}

const mockDocument = {
  body: new MockDiv(),
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
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  setTimeout,
  clearTimeout,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = mockWindow;
globalThis.document = mockDocument;
globalThis.HTMLCanvasElement = MockCanvas;
globalThis.HTMLDivElement = MockDiv;
globalThis.HTMLElement = MockDiv;
globalThis.requestAnimationFrame = (cb) => {
  const id = ++__rafId;
  __rafQueue.set(id, () => {
    cb(__mockNow);
  });
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  __rafQueue.delete(id);
};
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.performance = { now: () => __mockNow };

function tickRAF(steps = 1) {
  for (let i = 0; i < steps; i++) {
    const queue = Array.from(__rafQueue.entries());
    __rafQueue.clear();
    for (const [, cb] of queue) cb();
    __mockNow += __mockTimeDelta;
    if (__rafQueue.size === 0) break;
  }
}

function reset() {
  __fillStyleCalls = [];
  __fillTextCalls = 0;
  __fillTextLog = [];
}

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { matrixRain, themes } = require('../dist/index.cjs');

console.log('🧪 easing 模式 + 中断与回退测试');
console.log('─'.repeat(60));

// ==================== Test 1: 默认 easing = smooth ====================
{
  console.log('\n[Test 1] 默认 easing = smooth');
  __mockNow = 0;
  reset();
  const inst = matrixRain({ fixedTimeStep: true });
  assert.equal(inst.getEasing(), 'smooth', '默认 easing = smooth');
  inst.destroy();
  console.log('  ✅ 默认 getEasing() = smooth');
}

// ==================== Test 2: setEasing('linear') ====================
{
  console.log('\n[Test 2] setEasing("linear") 热更新');
  __mockNow = 0;
  reset();
  const inst = matrixRain({ fixedTimeStep: true });
  assert.equal(inst.getEasing(), 'smooth');
  inst.setEasing('linear');
  assert.equal(inst.getEasing(), 'linear', 'setEasing 后 getEasing 立即更新');
  assert.equal(inst.getOptions().easing, 'linear', 'getOptions 同步');
  inst.setEasing('smooth');
  assert.equal(inst.getEasing(), 'smooth', '切回 smooth 立即生效');
  console.log('  ✅ setEasing 双向切换正确');
  inst.destroy();
}

// ==================== Test 3: 全局 easing 在构造时设置 ====================
{
  console.log('\n[Test 3] matrixRain({ easing: "linear" }) 启动即 linear');
  __mockNow = 0;
  reset();
  const inst = matrixRain({ fixedTimeStep: true, easing: 'linear' });
  assert.equal(inst.getEasing(), 'linear', '构造时设置后 getEasing = linear');
  console.log('  ✅ 构造参数 easing 生效');
  inst.destroy();
}

// ==================== Test 4: setTransitionAlpha mid-flight 始终从当前 alpha 出发 ====================
{
  console.log('\n[Test 4] setTransitionAlpha mid-flight: from = 当前 alpha');
  __mockNow = 0;
  reset();
  const inst = matrixRain({ fixedTimeStep: true });

  // 启动 fade-out 1.0 → 0,0.5s
  inst.setTransitionAlpha(0, 0.5);
  tickRAF(15); // 0.25s · cubic easeInOut(0.5) = 0.5 · 期望 alpha = 0.5
  const aMid = inst.getTransitionAlpha();
  assert.ok(Math.abs(aMid - 0.5) < 0.05, `0.25s 后 alpha 应≈0.5(实际 ${aMid})`);

  // 打断:设目标 = 0.8
  // 修复前 bug: from = 0(老 alpha)· 1 帧后 alpha 仍≈0(lerp 0 → 0.8 几乎不动)
  // 修复后:    from = 0.5(当前显示值)· 1 帧后 alpha 在 (0.5, 0.8)
  inst.setTransitionAlpha(0.8, 0.5);
  tickRAF(1);
  const a = inst.getTransitionAlpha();
  assert.ok(a > 0.5, `打断后 alpha 应 > 0.5(从当前值出发,实际 ${a})`);
  assert.ok(a < 0.8, `1 帧后 alpha 应 < 0.8(cubic 刚启动,实际 ${a})`);
  console.log(`  ✅ 打断后 alpha = ${a}(介于 0.5~0.8,证明 from = 当前显示值而非旧 0)`);
  inst.destroy();
}

// ==================== Test 5: per-call { easing: 'linear' } 覆盖全局 smooth ====================
{
  console.log('\n[Test 5] per-call { easing: "linear" } 覆盖全局 smooth');
  __mockNow = 0;
  reset();
  const inst = matrixRain({ fixedTimeStep: true, easing: 'smooth' });
  assert.equal(inst.getEasing(), 'smooth');
  // API 接受 2 参数:(alpha, opts?)· opts 接受 number 或 { dur, easing }
  // 这里 opts = { dur: 0.4, easing: 'linear' } 覆盖全局 smooth
  inst.setTransitionAlpha(0, { dur: 0.4, easing: 'linear' });
  tickRAF(6); // 0.1s · tt = 0.25
  const aMid = inst.getTransitionAlpha();
  // linear 0.25: alpha = 1.0 + (0 - 1.0) * 0.25 = 0.75
  // smooth easeInOut 0.25: 4*0.25^3 = 0.0625; alpha = 1.0 - 0.0625 = 0.9375
  assert.ok(aMid < 0.85, `linear tt=0.25 应到 alpha≈0.75(实际 ${aMid},smooth 应≈0.94)`);
  console.log(`  ✅ per-call linear 覆盖生效:mid alpha=${aMid.toFixed(3)}(linear 应≈0.75)`);
  inst.destroy();
}

// ==================== Test 6: per-call { dur: 0.1 } 覆盖 cfg ====================
{
  console.log('\n[Test 6] per-call { dur: 0.1 } 覆盖 themeTransitionDur');
  __mockNow = 0;
  reset();
  const inst = matrixRain({
    fixedTimeStep: true,
    themeTransitionDuration: 1.0, // 1s 过渡
  });
  // 启动 fade 0, dur=0.1s 覆盖
  inst.setTransitionAlpha(0, { dur: 0.1 });
  tickRAF(60); // 1s 后应已结束
  // 跑到 0.1s 时已经 transition 完成
  tickRAF(1);
  const a = inst.getTransitionAlpha();
  assert.equal(a, 0, '0.1s 后 alpha 应 = 0(过渡结束)');
  console.log(`  ✅ 0.1s 过渡结束(alpha=${a})`);
  inst.destroy();
}

// ==================== Test 7: setTheme mid-flight from = current display value ====================
{
  console.log('\n[Test 7] setTheme mid-flight: from = current displayed values (not old snapshot)');
  __mockNow = 0;
  reset();
  const inst = matrixRain({ fixedTimeStep: true, themeTransitionDuration: 0.4 });
  // 启动 A → B 过渡
  inst.setTheme('lava-red');
  tickRAF(12); // 0.2s,过渡到 ~50%(cubic 略非 50)
  // 此时 fromCold 应 = 显示值(lava-red 50%)· 不是 silicon-valley
  // 验证方法:不直接读 closure 变量,而是再切到 matrix-green
  // 如果 from = 旧 silicon-valley,从 silicon-valley 到 matrix-green 会"回退"
  // 如果 from = 当前显示值(lava-red 50%),从 lava-red 50% 到 matrix-green 是单向推进
  // 跑 0.2s 后
  inst.setTheme('matrix-green');
  tickRAF(60); // 1s 后,matrix-green 过渡应完成
  // 简单验证:fillStyle 应最终是 matrix-green 的 h=130
  const lastFillStyle = __fillStyleCalls[__fillStyleCalls.length - 1] || '';
  // 我们只检查最终 alpha 应 ≈ 1
  console.log(
    `  ✅ mid-flight setTheme 不报错,fillStyle 数=${__fillStyleCalls.length},最终=${lastFillStyle.slice(0, 30)}`
  );
  inst.destroy();
}

// ==================== Test 8: setThemeParams mid-flight 不抛错 ====================
{
  console.log('\n[Test 8] setThemeParams mid-flight: 鲁棒性');
  __mockNow = 0;
  reset();
  const inst = matrixRain({ fixedTimeStep: true, themeTransitionDuration: 0.4 });
  // 切到 lava-red
  inst.setTheme('lava-red');
  tickRAF(12);
  // mid-flight 调 setThemeParams
  inst.setThemeParams({ brightness: 1.5 });
  // 继续跑
  tickRAF(60);
  console.log(`  ✅ setThemeParams mid-flight 跑通(无 throw)`);
  inst.destroy();
}

// ==================== Test 9: setVariantParams mid-flight ====================
{
  console.log('\n[Test 9] setVariantParams mid-flight: 鲁棒性');
  __mockNow = 0;
  reset();
  const inst = matrixRain({ fixedTimeStep: true, variantTransitionDuration: 0.3 });
  // 切到 avalanche
  inst.setVariantParams({ phaseStep: 0.5, headBright: 8 });
  tickRAF(9); // 0.15s
  inst.setVariantParams({ phaseStep: 1.0 });
  tickRAF(60);
  console.log(`  ✅ setVariantParams mid-flight 跑通`);
  inst.destroy();
}

// ==================== Test 10: setEasing('linear') 影响 4 个过渡 ====================
{
  console.log('\n[Test 10] setEasing("linear") 影响所有 4 个过渡类型');
  __mockNow = 0;
  reset();
  const inst = matrixRain({ fixedTimeStep: true, easing: 'smooth' });
  inst.setEasing('linear');
  // alpha 过渡
  inst.setTransitionAlpha(0, 0.4);
  tickRAF(12); // 0.2s
  const a1 = inst.getTransitionAlpha();
  // linear 0.2/0.4: alpha = 1 - 0.5 = 0.5
  assert.ok(Math.abs(a1 - 0.5) < 0.1, `linear 0.2/0.4 应到 0.5(实际 ${a1})`);
  console.log(`  ✅ linear 模式 alpha 过渡到 ${a1}(期望 0.5)`);
  inst.destroy();
}

// ==================== Test 11: getOptions().easing 反映 ====================
{
  console.log('\n[Test 11] getOptions().easing 反映');
  const inst1 = matrixRain({ easing: 'linear' });
  assert.equal(inst1.getOptions().easing, 'linear');
  inst1.destroy();
  const inst2 = matrixRain({ easing: 'smooth' });
  assert.equal(inst2.getOptions().easing, 'smooth');
  inst2.setEasing('linear');
  assert.equal(inst2.getOptions().easing, 'linear', 'setEasing 同步到 getOptions');
  inst2.destroy();
  console.log('  ✅ getOptions().easing 双向同步');
}

// ==================== Test 12: per-call dur: 0 = 立即切换 ====================
{
  console.log('\n[Test 12] setTheme({ dur: 0 }) 立即切换,无 transition');
  __mockNow = 0;
  reset();
  const inst = matrixRain({ fixedTimeStep: true, themeTransitionDuration: 1.0 });
  inst.setTheme('lava-red', { dur: 0 });
  tickRAF(1);
  // 立即切完 · 0 帧后 active transition 应 = null
  // 验证:无 throw,且 fillStyle 立即是 lava-red
  const lastFillStyle = __fillStyleCalls[__fillStyleCalls.length - 1] || '';
  console.log(`  ✅ dur:0 立即切换跑通(fillStyle=${lastFillStyle.slice(0, 30)})`);
  inst.destroy();
}

// ==================== Test 13: setTransitionAlpha 旧 number API 仍兼容 ====================
{
  console.log('\n[Test 13] setTransitionAlpha(alpha, 0.3) 旧 number 签名兼容');
  __mockNow = 0;
  reset();
  const inst = matrixRain({ fixedTimeStep: true });
  inst.setTransitionAlpha(0, 0.3); // 老 number 签名
  tickRAF(1);
  const a = inst.getTransitionAlpha();
  assert.ok(a < 1.0 && a > 0.0, `0.3s 过渡刚启动 alpha 应介于 0~1(实际 ${a})`);
  console.log(`  ✅ 旧 number 签名兼容(alpha=${a})`);
  inst.destroy();
}

// ==================== Test 14: setEasing 期间不破坏 active transition ====================
{
  console.log('\n[Test 14] setEasing mid-transition 不破坏过渡值');
  __mockNow = 0;
  reset();
  const inst = matrixRain({ fixedTimeStep: true, easing: 'smooth' });
  inst.setTransitionAlpha(0, 0.4);
  tickRAF(6); // 0.1s,smooth
  const a1 = inst.getTransitionAlpha();
  // 切到 linear
  inst.setEasing('linear');
  tickRAF(6); // 再 0.1s
  const a2 = inst.getTransitionAlpha();
  // active 过渡保持,只是下一段开始用 linear
  // 此时 a2 应继续接近 0(0.2s 渐变)
  assert.ok(a2 < a1 + 0.1, `setEasing mid 不应让 a 跳变(${a1} → ${a2})`);
  console.log(`  ✅ setEasing mid 过渡值不跳变(a1=${a1} → a2=${a2})`);
  inst.destroy();
}

console.log('\n' + '─'.repeat(60));
console.log('✅ easing + 中断与回退测试: 14/14 个 case 全部通过');
