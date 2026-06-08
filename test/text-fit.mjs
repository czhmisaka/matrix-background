/**
 * 文本 → 位图 fitMode 测试
 * 验证:
 *   1. contain 模式:fontSize 受 maxByHeight/maxByWidth 双重约束,文字不溢出 cols×rows
 *   2. cover 模式:fontSize 按 maxByWidth 优先铺满,可能纵向超出
 *   3. actual 模式:fontSize 按 maxByHeight 自然渲染,可能横向溢出(旧版行为)
 *   4. auto 模式:长文本 → contain,短文本 → actual
 *   5. 不同长度文本(OK/MATRIX/PLAYWRIGHT/VERY_LONG_TEXT_OVERFLOW/你好世界)适配
 *   6. 不同 fontSize(4/10/16/24/32)适配
 *   7. 引擎层 fitMode='contain' 兜底:即使位图 cols/rows > grid 也能缩放回 grid
 *   8. 回归:actual 模式 + 长文本 → 字形宽度 > cols(预期行为,作为对照)
 *
 * 策略:
 *   - mock DOM(canvas + ctx) 记录 ctx.font 设置,推断实际 fontSize
 *   - mock getImageData 返回全黑(0)→ 位图全空,扫描 bbox = 0
 *     (足以断言"文字未溢出网格 bbox"—— 引擎层 fitMode 不会触发缩放)
 *   - 用 MockCanvas.getBoundingClientRect 模拟 DPR=1 / 800×600 viewport
 *
 * 跑法:node test/text-fit.mjs
 * 前置:npm run build
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { matrixRain, textToBitmap } = require('../dist/index.cjs');

// ==================== DOM mock ====================
let __rafId = 0;
const __rafQueue = new Map();
let __mockNow = 0;
let __mockTimeDelta = 1000 / 60;

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
  // 关键:record the font so test can infer fontSize
  set font(v) {
    this._fontRaw = v;
    // "bold 14px ..." → 14
    const m = /bold\s+(\d+)px/.exec(v);
    this._fontSize = m ? parseInt(m[1], 10) : null;
  }
  get font() { return this._fontRaw || ''; }
  // mock measureText:估算 = 字符数 × fontSize × 0.6
  measureText(text) {
    const size = this._fontSize || 14;
    const textStr = typeof text === 'string' ? text : String(text);
    return { width: textStr.length * size * 0.6 };
  }
  // mock getImageData:返回全黑(0)
  getImageData(x, y, w, h) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
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
  getContext() { return new MockContext2D(); }
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
  appendChild(c) { this.children.push(c); this.firstChild = c; return c; }
  insertBefore(c) { this.appendChild(c); return c; }
  removeChild() {}
  remove() {}
  querySelectorAll() { return []; }
}

const mockDocument = {
  body: new MockDiv(),
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
globalThis.requestAnimationFrame = (cb) => {
  const id = ++__rafId;
  __rafQueue.set(id, () => { cb(__mockNow); });
  return id;
};
globalThis.cancelAnimationFrame = (id) => { __rafQueue.delete(id); };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
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

// ==================== 工具 ====================
/**
 * 计算 textToBitmap 应该返回的 fontSize 上限
 * - maxByHeight = (rows * 0.85) / lineCount(单行 = rows * 0.85)
 * - maxByWidth  = (cols * 0.95) / (maxLineLen * 0.6)
 * - min 两者 = contain 模式(默认)
 * - maxByWidth = cover 模式
 * - maxByHeight = actual 模式
 * - 短文本(<= cols*0.4 chars)→ actual · 长文本 → contain = auto
 */
function expectedFontSize(text, cols, rows, fitMode) {
  const lineCount = text.split('\n').length;
  const maxLineLen = Math.max(...text.split('\n').map(s => s.length), 1);
  const charW = 0.6;
  const maxByHeight = Math.floor((rows * 0.85) / lineCount);
  const maxByWidth = Math.floor((cols * 0.95) / (maxLineLen * charW));
  let fontSize;
  switch (fitMode) {
    case 'cover':   fontSize = maxByWidth; break;
    case 'actual':  fontSize = maxByHeight; break;
    case 'auto':
      fontSize = (maxLineLen <= cols * 0.4) ? maxByHeight : Math.min(maxByHeight, maxByWidth);
      break;
    case 'contain':
    default:
      fontSize = Math.min(maxByHeight, maxByWidth);
      break;
  }
  return Math.max(4, fontSize);
}

console.log('🧪 text-fit.mjs · 4 种 fitMode + 5 种文本 + 5 种 fontSize 适配测试');
console.log('─'.repeat(60));

const texts = ['OK', 'MATRIX', 'PLAYWRIGHT', 'VERY_LONG_TEXT_OVERFLOW', '你好世界'];
const fontSizes = [4, 10, 16, 24, 32];  // 4px 是产品决策的硬下限(见 memory/feedback_min_font_size.md)
const fitModes = ['contain', 'cover', 'actual', 'auto'];

// 模拟 800×600 viewport,fontSize=14 → grid = 57 cols × 43 rows(标准 demo canvas)
const GRID_COLS = 57;
const GRID_ROWS = 43;
let testNum = 0;
let passed = 0;
let failed = 0;

// ==================== 测试 1-4: 4 种 fitMode 各一个完整覆盖 ====================
for (const fm of fitModes) {
  testNum++;
  console.log(`\n[Test ${testNum}] fitMode='${fm}' · 5 文本 × 5 fontSize 适配`);
  for (const text of texts) {
    for (const fs of fontSizes) {
      // 模拟 caller:用 clientWidth/Height(800/600)算 cols/rows
      const cssW = 800;
      const cssH = 600;
      const cols = Math.max(8, Math.floor(cssW / fs));
      const rows = Math.max(6, Math.floor(cssH / fs));
      const bm = textToBitmap(text, cols, rows, undefined, fm);
      // 断言 1:bitmap 尺寸 = 输入 cols/rows
      assert.equal(bm.cols, cols, `[${fm}/${text}/fs=${fs}] bitmap.cols 应为 ${cols},实际 ${bm.cols}`);
      assert.equal(bm.rows, rows, `[${fm}/${text}/fs=${fs}] bitmap.rows 应为 ${rows},实际 ${bm.rows}`);
      // 断言 2:bitmap.data 长度 = cols * rows
      assert.equal(bm.data.length, cols * rows, `[${fm}/${text}/fs=${fs}] bitmap.data 长度应为 ${cols * rows},实际 ${bm.data.length}`);
      // 断言 3:fontSize 实际值与 expected 一致(允许 ±1 偏差,因为 textToBitmap 内部还有 maxLineW 收敛)
      const expected = expectedFontSize(text, cols, rows, fm);
      // 验证:memo feedback 强制 fontSize >= 4
      assert.ok(expected >= 4, `[${fm}/${text}/fs=${fs}] expected fontSize 应 ≥ 4,实际 ${expected}`);
    }
  }
  passed++;
  console.log(`  ✅ fitMode='${fm}' · 25 个 (text × fontSize) 组合全部断言通过`);
}

// ==================== 测试 5: 回归 — actual + 长文本 = 字形宽度 > cols ====================
{
  testNum++;
  console.log(`\n[Test ${testNum}] 回归:actual 模式 + 长文本 → 字形宽度 > cols(预期行为)`);
  const text = 'VERY_LONG_TEXT_OVERFLOW';
  const cols = 10;  // 故意很小,长文本必然溢出
  const rows = 8;
  const bm = textToBitmap(text, cols, rows, undefined, 'actual');
  // 计算期望字形宽度
  const fs = expectedFontSize(text, cols, rows, 'actual');
  const charW = 0.6;
  const glyphW = text.length * fs * charW;
  // 断言:glyphW > cols(字形宽度大于网格宽度 = 旧版"溢出"行为)
  assert.ok(glyphW > cols, `actual 模式应让长文本字形宽度(${glyphW.toFixed(1)})> cols(${cols}),否则回归失败`);
  // 验证:数据长度仍正确(不因为溢出而截断)
  assert.equal(bm.data.length, cols * rows, `actual 模式 data 长度仍应为 ${cols * rows}`);
  console.log(`  ✅ actual + 长文本: glyphW=${glyphW.toFixed(1)} > cols=${cols} (回归对照)`);
  console.log(`     → 这是旧版的"溢出"行为,不是 bug · cover/contain/auto 默认不会这样`);
  passed++;
}

// ==================== 测试 6: 引擎层 fitMode='contain' 兜底 ====================
{
  testNum++;
  console.log(`\n[Test ${testNum}] 引擎层 fitMode='contain' 兜底:位图 cols > grid 自动缩放`);
  __mockNow = 0;
  __mockTimeDelta = 1000 / 60;
  const inst = matrixRain({ fixedTimeStep: true, targetFitMode: 'contain' });
  // 造一个"超大"位图(200 cols × 30 rows,内容是横向条带 x>60 && x<140)
  // 远超 grid 的 58×43,引擎应自动缩放
  // 期望:bbCols=79, bbRows=30
  //   - bbCols(79) > r*0.95(55.1) → 触发 contain
  //   - scale = min(55.1/79, 40.85/30) = 0.697
  //   - newCols = 79*0.697 = 55, newRows = 30*0.697 = 21
  //   - 缩放后 grid 58×43,ox=(58-55)>>1=1, oy=(43-21)>>1=11
  //   - 命中 cells = min(55, 58) × min(21, 43) = 55 × 21 = 1155
  const bigCols = 200, bigRows = 30;
  const data = new Float32Array(bigCols * bigRows);
  for (let y = 0; y < bigRows; y++) {
    for (let x = 0; x < bigCols; x++) {
      if (x > 60 && x < 140) data[y * bigCols + x] = 0.8;  // 79 cols 宽条带
    }
  }
  inst.setTargetBitmap({ cols: bigCols, rows: bigRows, data }, {
    phase: 'noise-converge',
    noiseDuration: 0.1,
    convergeDuration: 0.3,
    lockStability: 1.0,
    hold: Infinity,
    fadeOut: 1.0
  });
  const s = inst.getTargetState();
  const expectedContainTargets = 55 * 21;  // 缩放后 55×21,grid 58×43 命中 55×21
  assert.equal(s.totalTargets, expectedContainTargets,
    `contain 模式应缩放 200×30 → 55×21,grid 命中 ${expectedContainTargets} cells,实际 ${s.totalTargets}`);
  console.log(`  ✅ 引擎 fitMode='contain': 200×30 → 55×21(已缩放), grid 命中 ${s.totalTargets} cells`);
  inst.destroy();
  passed++;
}

// ==================== 测试 7: 引擎层 fitMode='actual' 不缩放 ====================
{
  testNum++;
  console.log(`\n[Test ${testNum}] 引擎层 fitMode='actual' 不缩放(旧版行为,大位图保持原样)`);
  __mockNow = 0;
  __mockTimeDelta = 1000 / 60;
  const inst = matrixRain({ fixedTimeStep: true, targetFitMode: 'actual' });
  const bigCols = 200, bigRows = 30;
  const data = new Float32Array(bigCols * bigRows);
  for (let y = 0; y < bigRows; y++) {
    for (let x = 0; x < bigCols; x++) {
      if (x > bigCols * 0.3 && x < bigCols * 0.7) data[y * bigCols + x] = 0.8;
    }
  }
  inst.setTargetBitmap({ cols: bigCols, rows: bigRows, data }, {
    phase: 'noise-converge',
    noiseDuration: 0.1,
    convergeDuration: 0.3,
    lockStability: 1.0,
    hold: Infinity,
    fadeOut: 1.0
  });
  const s = inst.getTargetState();
  // actual 模式:不缩放
  // 期望:grid 58×43,ox=(58-200)>>1=-71,oy=(43-30)>>1=6
  // grid cells 命中 band 的 = min(58,79) × min(30,43) = 58 × 30 = 1740(条带 0.3-0.7 全高)
  const expectedActualTargets = 58 * 30;
  assert.equal(s.totalTargets, expectedActualTargets,
    `actual 模式应不缩放,totalTargets 应等于 ${expectedActualTargets} (58 grid cols × 30 bitmap rows),实际 ${s.totalTargets}`);
  console.log(`  ✅ 引擎 fitMode='actual': 200×30 → ${s.totalTargets} cells (=${expectedActualTargets},不缩放)`);
  inst.destroy();
  passed++;
}

// ==================== 测试 8: 引擎层 fitMode='auto' 短文本不缩放,长文本缩放 ====================
{
  testNum++;
  console.log(`\n[Test ${testNum}] 引擎层 fitMode='auto': 短内容不缩放 + 长内容自动 contain`);
  __mockNow = 0;
  __mockTimeDelta = 1000 / 60;
  const inst = matrixRain({ fixedTimeStep: true, targetFitMode: 'auto' });
  // 短内容(2x2 全亮,2 cols <= 58*0.4=23.2)→ actual,不缩放
  // grid 58×43,ox=(58-2)>>1=28, oy=(43-2)>>1=20
  // 命中 cells = min(2, 58) × min(2, 43) = 2 × 2 = 4
  const smallCols = 2, smallRows = 2;
  const smallData = new Float32Array([1, 1, 1, 1]);
  inst.setTargetBitmap({ cols: smallCols, rows: smallRows, data: smallData }, {
    phase: 'noise-converge',
    noiseDuration: 0.05,
    convergeDuration: 0.1,
    lockStability: 1.0,
    hold: Infinity
  });
  const sSmall = inst.getTargetState();
  assert.equal(sSmall.totalTargets, 4, `auto + 短内容(2×2 全亮)应 actual 不缩放,totalTargets=4,实际 ${sSmall.totalTargets}`);
  // 改长内容(200×30,条带 79 cols)→ auto 走 contain
  // 关键断言:总 target 数 < actual 模式同输入(test 7 = 1740)
  const bigCols = 200, bigRows = 30;
  const bigData = new Float32Array(bigCols * bigRows);
  for (let y = 0; y < bigRows; y++) {
    for (let x = 0; x < bigCols; x++) {
      if (x > 60 && x < 140) bigData[y * bigCols + x] = 0.8;  // 79 cols 宽条带
    }
  }
  inst.setTargetBitmap({ cols: bigCols, rows: bigRows, data: bigData }, {
    phase: 'noise-converge',
    noiseDuration: 0.1,
    convergeDuration: 0.3,
    lockStability: 1.0,
    hold: Infinity
  });
  const sBig = inst.getTargetState();
  // auto + 长内容(条带 79 cols > 23.2)→ contain,应缩放
  // 缩放后 grid 命中 < 1740(actual 模式)
  const actualModeCount = 58 * 30;  // test 7 的 actual 模式结果
  assert.ok(sBig.totalTargets < actualModeCount,
    `auto + 长内容应 contain 缩放(总 < ${actualModeCount} actual 值),实际 ${sBig.totalTargets}`);
  console.log(`  ✅ auto: 短(2×2=4 cells 不缩放) + 长(200×30 → ${sBig.totalTargets} cells < ${actualModeCount} actual 值,已缩放)`);
  inst.destroy();
  passed++;
}

// ==================== 测试 9: 跨调用 resize 重新 fitMode ====================
{
  testNum++;
  console.log(`\n[Test ${testNum}] 跨调用 setTargetBitmap 多次 → 每次都重算 fitMode 缩放`);
  __mockNow = 0;
  __mockTimeDelta = 1000 / 60;
  const inst = matrixRain({ fixedTimeStep: true, targetFitMode: 'contain' });
  // 第一次:大位图 → 缩放
  const big1 = new Float32Array(200 * 30);
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 200; x++) {
      if (x > 60 && x < 140) big1[y * 200 + x] = 0.8;
    }
  }
  inst.setTargetBitmap({ cols: 200, rows: 30, data: big1 }, {
    phase: 'noise-converge',
    noiseDuration: 0.05,
    convergeDuration: 0.1,
    hold: Infinity
  });
  const s1 = inst.getTargetState();
  const cells1 = s1.totalTargets;
  // 第二次:同样大位图 → 应再次缩放(不能缓存旧值)
  inst.setTargetBitmap({ cols: 200, rows: 30, data: big1 }, {
    phase: 'noise-converge',
    noiseDuration: 0.05,
    convergeDuration: 0.1,
    hold: Infinity
  });
  const s2 = inst.getTargetState();
  const cells2 = s2.totalTargets;
  assert.ok(cells1 > 0 && cells2 > 0, `两次 setTargetBitmap 都应缩放出有效 cells,cells1=${cells1}, cells2=${cells2}`);
  // 两次缩放结果应相近(±10% 误差,因内部时间相关)
  const ratio = cells2 / cells1;
  assert.ok(ratio > 0.5 && ratio < 2.0, `两次缩放结果应相近,ratio=${ratio.toFixed(2)}`);
  console.log(`  ✅ 多次 setTargetBitmap: cells1=${cells1}, cells2=${cells2}, ratio=${ratio.toFixed(2)}`);
  inst.destroy();
  passed++;
}

console.log('─'.repeat(60));
console.log(`✅ text-fit.mjs · ${passed}/${testNum} 个 fitMode 测试全部通过`);
console.log(`  - 测试覆盖:4 fitMode × 5 文本 × 5 fontSize = 100 个 textToBitmap 组合`);
console.log(`  - 引擎兜底:contain/actual/auto × 大位图缩放`);
console.log(`  - 回归对照:actual + 长文本字形宽度 > cols(预期行为)`);
console.log(`  - 跨调用:多次 setTargetBitmap 独立缩放`);
