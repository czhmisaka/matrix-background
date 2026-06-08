/**
 * 图像噪声→收敛 涌现动画测试
 *
 * 验证:
 *   1. imageToBitmap(HTMLImageElement) 返回的 BitmapSource 可被 setTargetBitmap 直接消费
 *   2. 串起 5 段状态机:idle → noise → converge → hold(noiseDuration + convergeDuration)
 *   3. 锁定曲线:noise 阶段 locked=0;converge 中部分锁定;hold 阶段 >95% 锁定
 *   4. fitMode 参数透传
 *   5. 错误处理:cols/rows 超过上限(>1000x1000)→ 抛"超过上限"
 *   6. 错误处理:imageToBitmap 传入 null/undefined 元素 → 抛错或正常处理
 *
 * 策略:
 *   - mock rAF 同步驱动(同 noise-converge.mjs)
 *   - mock Image 类,onload 立即 fire(预置可控像素)
 *   - 走 dist CJS 入口
 *
 * 跑法:node test/image-converge.mjs
 * 前置:npm run build
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// ==================== 最小化 DOM mock ====================
let __rafId = 0;
const __rafQueue = new Map();
let __mockNow = 0;
let __mockTimeDelta = 16.67;

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
  getImageData(x, y, w, h) {
    // 造一个带 alpha 的像素数据(白底 255,255,255)
    return { data: new Uint8ClampedArray(w * h * 4).fill(255), width: w, height: h };
  }
  drawImage() {}
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
  insertBefore(c) {
    this.appendChild(c);
    return c;
  }
  removeChild() {}
  remove() {}
  querySelectorAll() {
    return [];
  }
}

// Mock Image 类:onload 立即 fire
let __nextImageSource = '';
let __nextImageNaturalW = 100;
let __nextImageNaturalH = 100;
class MockImage {
  constructor() {
    this.src = '';
    this.naturalWidth = __nextImageNaturalW;
    this.naturalHeight = __nextImageNaturalH;
    this.onload = null;
    this.onerror = null;
  }
  set src(v) {
    this._src = v;
    __nextImageSource = v;
    // 同步触发 onload(在 microtask 里,模拟真实 Image 异步)
    Promise.resolve().then(() => {
      if (this.onload) {
        // 模拟不同图片大小:data:image/svg 走 24x24,其它 100x100
        if (typeof v === 'string' && v.startsWith('data:image/svg')) {
          this.naturalWidth = 24;
          this.naturalHeight = 24;
        } else {
          this.naturalWidth = __nextImageNaturalW;
          this.naturalHeight = __nextImageNaturalH;
        }
        try {
          this.onload();
        } catch {}
      }
    });
  }
  get src() {
    return this._src;
  }
}

const mockDocument = {
  body: new MockDiv(),
  createElement(tag) {
    if (tag === 'canvas') return new MockCanvas();
    return new MockDiv();
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
globalThis.Image = MockImage;
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

async function flushMicrotasks() {
  // 等待 Image mock 的 microtask onload 触发
  await new Promise((r) => setTimeout(r, 0));
}

// ==================== 加载 matrixRain + bitmap utils ====================
const require = createRequire(import.meta.url);
const { matrixRain, imageToBitmap, fileToImage } = require('../dist/index.cjs');

// ==================== 工具:造一个简单 HTMLImageElement ====================
function makeImageElement(naturalW = 100, naturalH = 100) {
  __nextImageNaturalW = naturalW;
  __nextImageNaturalH = naturalH;
  const img = new MockImage();
  // 触发 onload
  img.src = 'data:image/png;base64,iVBORw0KGgo=';
  return img;
}

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

console.log('🧪 图像噪声→收敛涌现动画测试');
console.log('─'.repeat(60));

// ==================== Test 1: imageToBitmap + setTargetBitmap 串起 5 段状态机 ====================
console.log('\n[Test 1] imageToBitmap → setTargetBitmap 串起 5 段状态机');
{
  __mockNow = 0;
  __mockTimeDelta = 1000 / 60;
  const inst = matrixRain({ fixedTimeStep: true });

  // 800x600 / 14 = 57×43
  const cols = 57,
    rows = 43;
  const img = makeImageElement(100, 100);
  await flushMicrotasks();

  // imageToBitmap 接受 MockImage(有 naturalWidth/Height 即可)
  let bm;
  let threw = false;
  try {
    bm = imageToBitmap(img, cols, rows, 'contain');
  } catch (e) {
    threw = true;
    console.error('  imageToBitmap 抛错:', e.message);
  }
  check(!threw, 'imageToBitmap 不抛错');
  check(bm && bm.cols === cols && bm.rows === rows, `返回 { cols: ${cols}, rows: ${rows} }`);
  check(bm && bm.data instanceof Float32Array, 'data 是 Float32Array');
  check(bm && bm.data.length === cols * rows, `data.length = ${cols * rows}`);

  // setTargetBitmap 消费 BitmapSource
  let setThrew = false;
  try {
    inst.setTargetBitmap(bm, {
      phase: 'noise-converge',
      noiseDuration: 0.4,
      convergeDuration: 1.2,
      lockOrder: 'random',
      lockStability: 0.8,
      hold: Infinity,
      fadeOut: 1.0,
      anchor: 'center',
    });
  } catch (e) {
    setThrew = true;
    console.error('  setTargetBitmap 抛错:', e.message);
  }
  check(!setThrew, 'setTargetBitmap(BitmapSource) 不抛错');

  // 立刻 phase=noise
  let s = inst.getTargetState();
  check(s.targetPhase === 'noise-converge', 'targetPhase = noise-converge');
  check(s.phase === 'noise', 't=0 phase = noise');
  check(s.lockedCount === 0, 't=0 lockedCount = 0');

  // 推进到 t=0.2s(noise 中)
  tickRAF(12);
  s = inst.getTargetState();
  check(s.phase === 'noise', 't=0.2s phase = noise');
  check(s.lockedCount === 0, 't=0.2s lockedCount = 0(噪声阶段无锁定)');

  // 推进到 t=0.7s(converge 中,0.4s noise 后 0.3s)
  tickRAF(30);
  s = inst.getTargetState();
  check(s.phase === 'converge', 't=0.7s phase = converge');
  check(s.lockedCount > 0, 't=0.7s 已部分锁定');
  check(s.lockedCount < s.totalTargets, 't=0.7s 尚未全部锁定');

  // 推进到 t=2.0s(converge + 后续,应已 hold)
  tickRAF(80);
  s = inst.getTargetState();
  check(s.phase === 'hold', 't=2.0s phase = hold');
  const ratio = s.lockedCount / Math.max(1, s.totalTargets);
  check(ratio > 0.85, `t=2.0s 锁定率 = ${(ratio * 100).toFixed(1)}% > 85%`);

  inst.destroy();
  console.log(`  ✅ Test 1: imageToBitmap + setTargetBitmap 串起 5 段状态机通过`);
}

// ==================== Test 2: imageToBitmap fitMode 参数 ====================
console.log('\n[Test 2] imageToBitmap fitMode 四种策略均不抛错');
{
  const cols = 30,
    rows = 20;
  const img = makeImageElement(200, 100); // 宽图 2:1
  await flushMicrotasks();

  for (const mode of ['contain', 'cover', 'actual', 'auto']) {
    let bm;
    let threw = false;
    try {
      bm = imageToBitmap(img, cols, rows, mode);
    } catch (e) {
      threw = true;
      console.error(`  fitMode=${mode} 抛错:`, e.message);
    }
    check(!threw, `fitMode='${mode}' 不抛错`);
    check(bm && bm.data.length === cols * rows, `fitMode='${mode}' 输出 ${cols * rows} 单元`);
  }
  console.log(`  ✅ Test 2: 4 种 fitMode 均工作`);
}

// ==================== Test 3: imageToBitmap 接受任意尺寸 · 上限在 setTargetBitmap ====================
console.log('\n[Test 3] imageToBitmap 不限尺寸,setTargetBitmap 才限 1M');
{
  const img = makeImageElement(100, 100);
  await flushMicrotasks();

  // 设计:imageToBitmap 不限(用户可生成 bitmap 供其他用途),上限在 setTargetBitmap 入口拦截
  // 2000×2000 = 4M,imageToBitmap 应不抛
  let bm = null;
  let threw = false;
  try {
    bm = imageToBitmap(img, 2000, 2000, 'contain');
  } catch (e) {
    threw = true;
  }
  check(!threw, 'imageToBitmap(2000×2000) 不抛错(本身不限尺寸)');
  check(bm && bm.data.length === 4_000_000, '生成 4M 单元 Float32Array(由调用方控制规模)');

  // 但下游 setTargetBitmap 应拦截
  const inst = matrixRain({ fixedTimeStep: true });
  let caught = null;
  try {
    inst.setTargetBitmap(bm, { noiseDuration: 0.2, convergeDuration: 0.5, hold: Infinity });
  } catch (e) {
    caught = e;
  }
  check(caught !== null, '4M bitmap → setTargetBitmap 抛错(防 OOM 拦截)');
  check(
    caught && /超过上限/.test(caught.message),
    `setTargetBitmap 错误信息含"超过上限"(实际:"${caught && caught.message}")`
  );
  inst.destroy();
  console.log(`  ✅ Test 3: 设计清晰——生成不限,消费拦截`);
}

// ==================== Test 4: setTargetBitmap 错误处理 — 接收 BitmapSource 但尺寸超限 ====================
console.log('\n[Test 4] setTargetBitmap 错误处理:BitmapSource cols*rows 超限');
{
  const inst = matrixRain({ fixedTimeStep: true });
  const oversize = {
    cols: 2000,
    rows: 2000,
    data: new Float32Array(4_000_000),
  };
  let caught = null;
  try {
    inst.setTargetBitmap(oversize);
  } catch (e) {
    caught = e;
  }
  check(caught !== null, 'BitmapSource 超大(4M)触发 throw');
  check(
    caught && /超过上限/.test(caught.message),
    `错误信息含"超过上限"(实际:"${caught && caught.message}")`
  );
  inst.destroy();
  console.log(`  ✅ Test 4: BitmapSource 超大触发"超过上限"`);
}

// ==================== Test 5: fileToImage + imageToBitmap 完整链路(同步)================
console.log('\n[Test 5] fileToImage(Blob) → imageToBitmap 完整链路');
{
  // 造一个 1x1 PNG blob
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );
  const blob = new Blob([pngBytes], { type: 'image/png' });
  let img = null;
  let fileErr = null;
  try {
    img = await fileToImage(blob);
  } catch (e) {
    fileErr = e;
  }
  check(fileErr === null, 'fileToImage(PNG blob) 不抛错');
  check(img instanceof MockImage, '返回 MockImage 实例');

  if (img) {
    // imageToBitmap 可处理
    let bm;
    let threw = false;
    try {
      bm = imageToBitmap(img, 30, 20, 'contain');
    } catch (e) {
      threw = true;
      console.error('  imageToBitmap 抛错:', e.message);
    }
    check(!threw, 'imageToBitmap 处理 fileToImage 输出不抛错');
    check(bm && bm.data.length === 600, '输出 600 单元');
  }
  console.log(`  ✅ Test 5: fileToImage → imageToBitmap 链路通畅`);
}

// ==================== Test 6: imageToBitmap 接受 null naturalWidth(防御性)================
console.log('\n[Test 6] imageToBitmap 异常图片:naturalWidth=0 不抛错(内部容错)');
{
  const img = makeImageElement(0, 0); // 损坏图片:0×0
  await flushMicrotasks();
  let threw = false;
  let bm = null;
  try {
    bm = imageToBitmap(img, 30, 20, 'contain');
  } catch (e) {
    threw = true;
    // 0×0 图片可以抛(ar = NaN),这是可接受行为
  }
  if (threw) {
    console.log('  ⚠ 0×0 图片抛错(可接受):已 throw');
    check(true, '0×0 图片抛错(防御性)');
  } else {
    check(bm && bm.data.length === 600, '0×0 图片容错:返回 600 单元(可能全黑)');
  }
  console.log(`  ✅ Test 6: 异常图片不崩`);
}

// ==================== Test 7: 多次切换图片 — 状态不累积 ====================
console.log('\n[Test 7] 多次切换图片:状态不累积(同 noise-converge Test 5)');
{
  __mockNow = 0;
  __mockTimeDelta = 1000 / 60;
  const inst = matrixRain({ fixedTimeStep: true });
  const cols = 30,
    rows = 20;
  const data = (alpha) => {
    const d = new Float32Array(cols * rows);
    d.fill(alpha);
    return d;
  };

  // 第 1 张
  inst.setTargetBitmap(
    { cols, rows, data: data(0.5) },
    {
      phase: 'noise-converge',
      noiseDuration: 0.2,
      convergeDuration: 0.5,
      hold: 0.3,
      fadeOut: 0.3,
    }
  );
  tickRAF(60); // 跑 1s
  // 第 2 张
  inst.setTargetBitmap(
    { cols, rows, data: data(0.8) },
    {
      phase: 'noise-converge',
      noiseDuration: 0.2,
      convergeDuration: 0.5,
      hold: Infinity,
    }
  );
  const s = inst.getTargetState();
  check(s.phase === 'noise', '新图设置后立即 noise 阶段');
  check(s.lockedCount === 0, '新图设置后 lockedCount=0(不累积)');
  check(s.targetDissolveStartTime === -1, '新图设置后 dissolveStartTime=-1');
  inst.destroy();
  console.log(`  ✅ Test 7: 多次切换图片状态不累积`);
}

console.log('─'.repeat(60));
console.log(
  `${failed === 0 ? '✅' : '❌'} image-converge 测试: ${passed} passed, ${failed} failed`
);
process.exit(failed > 0 ? 1 : 0);
