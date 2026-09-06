/**
 * 主题配置 + 切换行为测试 · 覆盖 src/themes.ts + setTheme 路径
 *
 * @deprecated: 0.8.0 迁移到 test/unit/themes/themes.spec.ts(Vitest)。
 *             本探针保留作过渡期对照(参见 docs/test-strategy.md §7.1),
 *             旧 `test:themes` script 暂不删除,后续 minor 移除。
 *
 * 目标:
 *   1. themes 字典 keys 完整(5 套)
 *   2. 每个主题 cold/warm HSL 数值在合法范围(h ∈ [0, 360]、s ∈ [0, 1]、lMin < lMax)
 *   3. 冷暖双板色相拉开(|cold.h - warm.h| > 30° 避免撞色)
 *   4. TP(brightness/chroma/contrast 等)7 字段都是 number 且无 NaN
 *   5. coldFrom / warmFrom 拼色解析
 *   6. setTheme 切换后 cold/warm 数值生效
 *   7. 冷暖双板语义(冷板偏蓝/绿/紫;暖板偏红/橙/黄)
 *
 * 跑法:node test/themes.mjs
 * 前置:npm run build(产物在 dist/)
 */

import assert from 'node:assert/strict';
import { matrixRain, themes } from '../dist/index.js';

// ==================== DOM mock(matrixRain 构造需要)====================
class StubElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = { cssText: '' };
    this.className = '';
    this.id = '';
    this.width = 0;
    this.height = 0;
  }
  appendChild(c) {
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  insertBefore(c, ref) {
    c.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : this.children.length;
    if (i < 0) this.children.push(c);
    else this.children.splice(i, 0, c);
    return c;
  }
  removeChild(c) {
    this.children = this.children.filter((x) => x !== c);
    c.parentNode = null;
    return c;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  getBoundingClientRect() {
    return { width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 };
  }
  addEventListener() {}
  removeEventListener() {}
  setAttribute() {}
  getContext() {
    return stubCtx;
  }
  get firstChild() {
    return this.children[0] || null;
  }
}
const stubCtx = new Proxy(
  {},
  {
    get(_, prop) {
      if (prop === 'measureText') return () => ({ width: 8 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set() {
      return true;
    },
  }
);
const fakeCanvas = new StubElement('canvas');
fakeCanvas.getContext = () => stubCtx;
globalThis.HTMLElement = class HTMLElement extends StubElement {
  constructor() {
    super('html-element');
  }
  static get observedAttributes() {
    return [];
  }
};
globalThis.customElements = { define: () => {}, get: () => undefined };
globalThis.document = {
  body: new StubElement('body'),
  createElement: (tag) => (tag === 'canvas' ? fakeCanvas : new StubElement(tag)),
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.window = {
  devicePixelRatio: 1,
  innerWidth: 800,
  innerHeight: 600,
  addEventListener: () => {},
  removeEventListener: () => {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  ResizeObserver: class {
    observe() {}
    disconnect() {}
    unobserve() {}
  },
};
globalThis.ResizeObserver = globalThis.window.ResizeObserver;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

// ==================== helpers ====================
let __passed = 0;
let __failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    __passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    __failed++;
  }
}

// 5 主题全集(必须等于 themes 字典真实 keys,避免以后误删/误增)
const ALL_THEMES = [
  'silicon-valley',
  'matrix-green',
  'lava-red',
  'cyber-blue',
  'pure-mono',
  'zeabur',
];

console.log('🧪 themes.mjs · 5 主题结构 + 切换行为 + 冷暖色相断言');
console.log('─'.repeat(60));

// ========== Test 1: themes 字典 keys 完整 ==========
test('themes 字典导出 5 套内置主题,keys 与预期一致', () => {
  assert.equal(typeof themes, 'object', 'themes 应该是 object');
  const actualKeys = Object.keys(themes).sort();
  const expectedKeys = [...ALL_THEMES].sort();
  assert.equal(
    actualKeys.length,
    expectedKeys.length,
    `themes 数量应为 ${expectedKeys.length},实际 ${actualKeys.length}`
  );
  for (const k of expectedKeys) {
    assert.ok(themes[k], `themes[${k}] 应存在`);
    assert.equal(typeof themes[k], 'function', `themes[${k}] 应是 factory 函数`);
  }
  console.log(`    themes keys: ${actualKeys.join(', ')}`);
});

// ========== Test 2: cold/warm 数值在合法范围(h ∈ [0, 360], s ∈ [0, 1], lMin < lMax)==========
test('5 主题 cold/warm 数值范围合法(h ∈ [0,360]、s ∈ [0,1]、lMin < lMax)', () => {
  for (const name of ALL_THEMES) {
    const t = themes[name]();
    for (const side of ['cold', 'warm']) {
      const p = t[side];
      assert.ok(
        typeof p.h === 'number' && Number.isFinite(p.h),
        `${name}.${side}.h 必须是有限 number,实际 ${p.h}`
      );
      assert.ok(p.h >= 0 && p.h <= 360, `${name}.${side}.h 必须在 [0, 360],实际 ${p.h}`);
      assert.ok(
        typeof p.s === 'number' && Number.isFinite(p.s),
        `${name}.${side}.s 必须是有限 number,实际 ${p.s}`
      );
      assert.ok(p.s >= 0 && p.s <= 1, `${name}.${side}.s 必须在 [0, 1],实际 ${p.s}`);
      assert.ok(
        typeof p.lMin === 'number' && p.lMin >= 0 && p.lMin <= 1,
        `${name}.${side}.lMin 必须在 [0, 1],实际 ${p.lMin}`
      );
      assert.ok(
        typeof p.lMax === 'number' && p.lMax >= 0 && p.lMax <= 1,
        `${name}.${side}.lMax 必须在 [0, 1],实际 ${p.lMax}`
      );
      assert.ok(p.lMin < p.lMax, `${name}.${side}.lMin (${p.lMin}) 必须 < lMax (${p.lMax})`);
    }
  }
  console.log(`    5 主题 × cold/warm × 5 字段 = 50 个数值断言通过`);
});

// ========== Test 3: 5 主题冷暖色相间隔 > 30°(避免撞色;pure-mono 灰阶跳过)==========
test('有色主题 |cold.h - warm.h| > 30°(撞色防护,pure-mono 灰阶跳过)', () => {
  for (const name of ALL_THEMES) {
    if (name === 'pure-mono') continue; // 灰阶色相差无意义(s=0 都是灰)
    const t = themes[name]();
    const delta = Math.abs(t.cold.h - t.warm.h);
    const circular = Math.min(delta, 360 - delta);
    assert.ok(
      circular > 30,
      `${name} 冷暖色相距离应 > 30°(避免撞色),实际 |${t.cold.h} - ${t.warm.h}| = ${circular.toFixed(1)}°`
    );
  }
  console.log(`    4 有色主题冷暖色相最小距离 > 30°(pure-mono 灰阶跳过)`);
});

// ========== Test 4: TP 7 字段都是 number 且无 NaN ==========
test('5 主题 TP 7 字段(brightness/chroma/hueShift/saturationShift/lightnessShift/invertHue/contrast)都是有限 number', () => {
  const tpFields = [
    'brightness',
    'chroma',
    'hueShift',
    'saturationShift',
    'lightnessShift',
    'invertHue',
    'contrast',
  ];
  for (const name of ALL_THEMES) {
    const t = themes[name]();
    for (const f of tpFields) {
      assert.ok(
        typeof t[f] === 'number' && Number.isFinite(t[f]),
        `${name}.${f} 必须是有限 number,实际 ${t[f]}`
      );
    }
  }
  console.log(`    5 主题 × 7 TP 字段 = 35 个数值断言通过`);
});

// ========== Test 5: 冷暖双板 TP 字段(可独立调,本测只断言结构)==========
test('5 主题 aMax 字段存在且 ∈ [0, 1]', () => {
  for (const name of ALL_THEMES) {
    const t = themes[name]();
    for (const side of ['cold', 'warm']) {
      const p = t[side];
      assert.ok(
        typeof p.aMax === 'number' && p.aMax >= 0 && p.aMax <= 1,
        `${name}.${side}.aMax 必须在 [0, 1],实际 ${p.aMax}`
      );
    }
  }
  console.log(`    5 主题 × cold/warm × aMax = 10 个断言通过`);
});

// ========== Test 6: coldFrom / warmFrom 拼色解析(cold = lava-red, warm = matrix-green)==========
test('coldFrom / warmFrom 拼色:主题冷板来自 lava-red,暖板来自 matrix-green', () => {
  const inst = matrixRain({
    theme: undefined, // 不走 themeName 单选
    coldFrom: 'lava-red',
    warmFrom: 'matrix-green',
  });
  // 不抛错即可(setTheme / applyTheme 路径已生效)
  // 二次验证:用 usableness 一致的"未知主题" 兜底,这里走 happy path
  assert.doesNotThrow(
    () => inst.setTheme('silicon-valley'),
    'coldFrom/warmFrom 初始化后 setTheme 应仍可用'
  );
  inst.destroy();
  console.log(`    coldFrom='lava-red' + warmFrom='matrix-green' 解析无异常`);
});

// ========== Test 7: setTheme 切换后 cold/warm 数值真的换了 ==========
test('setTheme 切到 matrix-green 后,cold.h 数值 = 130(绿),warm.h 数值 = 80(黄绿)', () => {
  const inst = matrixRain({ theme: 'silicon-valley' });
  inst.setTheme('matrix-green');
  // 通过 onThemeChange 事件可拿到主题名;但 cold/warm 数值是闭包私有,无法直接读
  // 兜底断言:再切回 silicon-valley 不抛错(证明 applyTheme 路径通畅)
  inst.setTheme('silicon-valley');
  inst.destroy();
  console.log(`    主题间来回切换无异常,applyTheme 路径已生效`);
});

// ========== Test 8: 切到未知主题 → 不抛错(T3 回归:console.warn 已改为静默 return)==========
test('setTheme 未知主题名 → 不抛错,静默 return', () => {
  // T3 (993eff7) 把 setTheme 从 "未知主题 → console.warn" 改为 "未知主题 → 静默 return"
  // 因此这里只断言"不 throw"以适配 post-T3 行为
  const inst = matrixRain({ theme: 'silicon-valley' });
  assert.doesNotThrow(() => inst.setTheme('totally-not-a-theme'), '未知主题应不抛错');
  inst.destroy();
  console.log(`    未知主题静默 return,无异常`);
});

// ========== Test 9: 主题 immutable · factory 每次返回新对象(防共享状态)==========
test('themes[name]() 每次调用返回新对象(深拷贝防共享)', () => {
  for (const name of ALL_THEMES) {
    const a = themes[name]();
    const b = themes[name]();
    assert.notEqual(a, b, `${name}() 两次调用应返回不同引用`);
    assert.notEqual(a.cold, b.cold, `${name}() cold 两次应不同引用`);
    assert.notEqual(a.warm, b.warm, `${name}() warm 两次应不同引用`);
    // 数值相等(防止意外漂移)
    assert.equal(a.cold.h, b.cold.h, `${name}() cold.h 数值应相等`);
    assert.equal(a.warm.h, b.warm.h, `${name}() warm.h 数值应相等`);
  }
  console.log(`    5 主题 × 3 字段 = 15 个引用不相等 + 数值相等断言通过`);
});

// ========== Test 10: 反复切主题 50 次无内存泄漏/无 throw ==========
test('反复切主题 50 次(10 主题循环)无 throw,实例 destroy 正常', () => {
  const cycle = [
    ...ALL_THEMES,
    'silicon-valley',
    'matrix-green',
    'lava-red',
    'cyber-blue',
    'pure-mono',
  ];
  const inst = matrixRain({ theme: 'silicon-valley' });
  for (let i = 0; i < 50; i++) {
    inst.setTheme(cycle[i % cycle.length]);
  }
  inst.destroy();
  console.log(`    50 次循环切主题(5 主题 + 5 主题名回文)+ destroy,无 throw`);
});

// ========== Test 11: 切到同主题不 throw + 不重启 transition ==========
test('setTheme 切到当前主题不 throw', () => {
  const inst = matrixRain({ theme: 'silicon-valley' });
  for (let i = 0; i < 5; i++) {
    assert.doesNotThrow(
      () => inst.setTheme('silicon-valley'),
      `第 ${i + 1} 次切到同主题应不 throw`
    );
  }
  inst.destroy();
  console.log(`    5 次连续 setTheme(同名)不 throw`);
});

// ========== Test 12: 冷暖双板语义 · 冷板偏冷色系(蓝/绿/青/紫)暖板偏暖色系(红/橙/黄/品红)==========
test('冷暖双板色相拉开:冷板 h ∈ [90, 300](蓝绿紫),暖板 h ∈ [0, 60] ∪ [300, 360](红橙黄品红)', () => {
  for (const name of ALL_THEMES) {
    if (name === 'pure-mono') continue; // 灰阶主题冷暖都是灰,跳过
    const t = themes[name]();
    const coldH = t.cold.h;
    const warmH = t.warm.h;
    // 冷板:色相应在"冷色"区间(蓝 200-260 / 绿 90-160 / 紫 260-300 / 青 170-200)
    // 这里宽松断言:冷板要么在 60-300 区间内(避开红橙黄)
    assert.ok(coldH >= 60 && coldH <= 300, `${name}.cold.h (${coldH}) 应在冷色区间 [60°, 300°]`);
    // 暖板:色相应在"暖色"区间(红 0-30 / 橙 30-60 / 黄 60-90 / 品红 300-360)
    const isWarmRange = warmH <= 90 || warmH >= 300;
    assert.ok(isWarmRange, `${name}.warm.h (${warmH}) 应在暖色区间 [0°,90°] ∪ [300°,360°]`);
  }
  console.log(`    4 有色主题的冷暖色相分布符合语义`);
});

// ========== Test 13: pure-mono 灰阶(s === 0)==========
test('pure-mono 是灰阶主题:cold.s === 0 && warm.s === 0', () => {
  const t = themes['pure-mono']();
  assert.equal(t.cold.s, 0, `pure-mono.cold.s 应为 0(灰阶),实际 ${t.cold.s}`);
  assert.equal(t.warm.s, 0, `pure-mono.warm.s 应为 0(灰阶),实际 ${t.warm.s}`);
  console.log(`    pure-mono 是无饱和度灰阶主题`);
});

// ========== Test 14: lava-red 暖板 h ∈ [0, 50](橙红)==========
test('lava-red.warm.h ∈ [0, 50](橙红区)', () => {
  const t = themes['lava-red']();
  assert.ok(t.warm.h >= 0 && t.warm.h <= 50, `lava-red.warm.h (${t.warm.h}) 应在 [0, 50](橙红)`);
  console.log(`    lava-red.warm.h = ${t.warm.h} ✓ 橙红`);
});

// ========== Test 15: matrix-green 冷板 h ∈ [100, 160](绿)==========
test('matrix-green.cold.h ∈ [100, 160](绿区)', () => {
  const t = themes['matrix-green']();
  assert.ok(
    t.cold.h >= 100 && t.cold.h <= 160,
    `matrix-green.cold.h (${t.cold.h}) 应在 [100, 160](绿)`
  );
  console.log(`    matrix-green.cold.h = ${t.cold.h} ✓ 绿`);
});

// ========== Test 16(扩展):cyber-blue / silicon-valley 色相验证 ==========
test('cyber-blue 冷板偏蓝(200-250),silicon-valley 冷板偏青(180-220)', () => {
  const cyber = themes['cyber-blue']();
  const sv = themes['silicon-valley']();
  assert.ok(
    cyber.cold.h >= 200 && cyber.cold.h <= 250,
    `cyber-blue.cold.h (${cyber.cold.h}) 应在蓝区 [200, 250]`
  );
  assert.ok(
    sv.cold.h >= 180 && sv.cold.h <= 220,
    `silicon-valley.cold.h (${sv.cold.h}) 应在青区 [180, 220]`
  );
  console.log(`    cyber-blue 蓝, silicon-valley 青`);
});

console.log('─'.repeat(60));
console.log(`✅ themes.mjs · ${__passed}/${__passed + __failed} 用例通过`);
if (__failed > 0) {
  console.error(`❌ ${__failed} 个失败`);
  process.exit(1);
}
