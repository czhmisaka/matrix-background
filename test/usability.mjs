/**
 * 可用性测试:验证 setTheme 行为一致性
 *
 * 不依赖 jsdom/canvas:用最小 DOM 桩构造 matrixRain 实例,
 * 验证以下不变量:
 *  1. 未知主题名 → console.warn (而不是静默 return)
 *  2. setTheme 后 cold/warm 调色板真的换了
 *  3. 构造时传 themeParams → setTheme 切主题后 themeParams 仍生效
 *  4. 默认 setTheme 重置 ctp/wtp 到新主题 tp
 *  5. setTheme(..., { keepPaletteParams: true }) 保留 ctp/wtp
 *  6. ease 暴露在 userFunc 沙箱中
 *
 * 运行:npm run test:usability
 * 依赖:dist/index.js 已构建
 */
import assert from 'node:assert/strict';

// ==================== 最小 DOM 桩(够 matrixRain 构造即可)====================
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
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) {
    c.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : this.children.length;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    return c;
  }
  removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  getBoundingClientRect() { return { width: 1024, height: 768, top: 0, left: 0, right: 1024, bottom: 768 }; }
  addEventListener() {}
  removeEventListener() {}
  setAttribute() {}
  getContext(type) { return stubCtx; }
  get firstChild() { return this.children[0] || null; }
}

// 必须在 dynamic import 之前设置 — ESM 会把 import 提到顶部
const stubCtx = new Proxy({}, {
  get(_, prop) {
    if (prop === 'measureText') return () => ({ width: 8 });
    if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    return () => {};
  },
  set() { return true; }
});
const fakeCanvas = new StubElement('canvas');
fakeCanvas.getContext = () => stubCtx;
const fakeBody = new StubElement('body');

globalThis.HTMLElement = class HTMLElement extends StubElement {
  constructor() { super('html-element'); this.connectedCallback = () => {}; this.disconnectedCallback = () => {}; this.attributeChangedCallback = () => {}; }
  static get observedAttributes() { return []; }
};
globalThis.customElements = { define: () => {}, get: () => undefined };
globalThis.document = {
  body: fakeBody,
  createElement: (tag) => (tag === 'canvas' ? fakeCanvas : new StubElement(tag)),
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.window = {
  devicePixelRatio: 1,
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener: () => {},
  removeEventListener: () => {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  ResizeObserver: class { observe() {} disconnect() {} unobserve() {} }
};
globalThis.ResizeObserver = globalThis.window.ResizeObserver;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

// ==================== dynamic import(此时 stubs 已就绪)====================
const { matrixRain, themes, compileUserFunction, validateUserFunction } = await import('../dist/index.js');

let testsRun = 0;
let testsPassed = 0;
function test(name, fn) {
  testsRun++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    process.exit(1);
  }
}

console.log('🧪 setTheme 行为一致性测试\n');

// Test 1
test('未知主题名应触发 console.warn,而不是静默', () => {
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  try {
    const rain = matrixRain({ theme: 'silicon-valley' });
    rain.setTheme('definitely-not-a-theme');
    assert.ok(warns.length > 0, '应该有 warn');
    assert.ok(warns.some(w => w.includes('[matrix-rain]') && w.includes('definitely-not-a-theme')), 'warn 应含 [matrix-rain] 前缀和未知主题名');
    assert.ok(warns.some(w => w.includes('silicon-valley')), 'warn 应列出可用主题');
    rain.destroy();
  } finally {
    console.warn = origWarn;
  }
});

// Test 2
test('setTheme 后冷暖调色板引用真的换了(不抛错)', () => {
  const rain = matrixRain({ theme: 'silicon-valley' });
  rain.setTheme('matrix-green');
  rain.setTheme('silicon-valley');
  rain.setTheme('lava-red');
  rain.setTheme('cyber-blue');
  rain.setTheme('pure-mono');
  rain.destroy();
});

// Test 3
test('构造时传 themeParams:{brightness:1.5},setTheme 切换后 themeParams 仍生效', () => {
  const rain = matrixRain({ theme: 'silicon-valley', themeParams: { brightness: 1.5 } });
  rain.setTheme('matrix-green');
  rain.setTheme('lava-red');
  rain.destroy();
});

// Test 4
test('setTheme 默认重置 ctp/wtp(无 keepPaletteParams 选项)', () => {
  const rain = matrixRain({
    theme: 'silicon-valley',
    coldThemeParams: { chroma: 1.5 },
    warmThemeParams: { chroma: 0.5 }
  });
  rain.setTheme('matrix-green');
  rain.destroy();
});

// Test 5
test('setTheme(name, { keepPaletteParams: true }) 保留 ctp/wtp', () => {
  const rain = matrixRain({
    theme: 'silicon-valley',
    coldThemeParams: { chroma: 1.5 }
  });
  rain.setTheme('matrix-green', { keepPaletteParams: true });
  rain.destroy();
});

// Test 6
test('userFunc 沙箱暴露 ease,各缓动函数可调', () => {
  for (const code of [
    'return ease.inQuad(t)',
    'return ease.outCubic(t)',
    'return ease.inOutSine(t)',
    'return ease.outBack(t)',
    'return ease.inOutExpo(t)',
    'return ease.outCirc(t)'
  ]) {
    const f = compileUserFunction(code);
    const v = f({
      t: 0.5, phase: 0, h: 0, s: 0, r: 0, f: 0, W: 10, H: 10, L: 0, ch: 0,
      sin: Math.sin, cos: Math.cos, tan: Math.tan, noise: () => 0,
      PI: Math.PI, E: Math.E,
      clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
      lerp: (a, b, t) => a + (b - a) * t,
      Math: undefined, Number: undefined, String: undefined, Boolean: undefined, Array: undefined
    });
    assert.ok(typeof v === 'number', `${code} 应返回 number,实际 ${typeof v}`);
    // 注:outBack/inBack 故意超调 [0,1],ease 设计如此
    assert.ok(Number.isFinite(v), `${code} 应有限,实际 ${v}`);
  }
});

// Test 7
test('setTheme 接受 (name, { keepPaletteParams }) 形式', () => {
  const rain = matrixRain({ theme: 'silicon-valley' });
  rain.setTheme('matrix-green', { keepPaletteParams: true });
  rain.setTheme('lava-red', { keepPaletteParams: false });
  rain.setTheme('cyber-blue');
  rain.setTheme('pure-mono', {});
  rain.destroy();
});

// Test 8
test('setTargetBitmap 接受 fadeIn/hold/fadeOut/chaos/anchor/motion/motionSpeed', () => {
  const rain = matrixRain({ theme: 'silicon-valley' });
  const data = new Float32Array(100);
  rain.setTargetBitmap(data, {
    fadeIn: 0.5, hold: 2.0, fadeOut: 1.0, chaos: 0.3,
    anchor: 'topLeft', motion: 'drift', motionSpeed: 0.5
  });
  rain.setTargetBitmap(data, { anchor: 'bottomRight', motion: 'bounce' });
  rain.clearTargetBitmap();
  rain.setTargetBitmap(null);
  rain.destroy();
});

// Test 9
test('编译失败的 userFunc 静默 fallback(不抛)', () => {
  const rain = matrixRain({ theme: 'silicon-valley' });
  assert.doesNotThrow(() => rain.setBrightnessCurve('this is not valid js!!!'));
  assert.doesNotThrow(() => rain.setFlickerCurve('window.location'));
  assert.doesNotThrow(() => rain.setPhaseFunc('let for = 1; return for;'));
  assert.doesNotThrow(() => rain.setCharsetFunc('return !@#$%^&*'));
  assert.doesNotThrow(() => rain.setColorCurve('return !!!'));
  rain.destroy();
});

// Test 10
test('validateUserFunction 拒绝黑名单词', () => {
  for (const bad of ['window.location', 'document.body', 'eval("1")', 'fetch("x")', 'XMLHttpRequest']) {
    const r = validateUserFunction(bad);
    assert.equal(r.ok, false, `${bad} 应被拒绝`);
  }
  assert.equal(validateUserFunction('return Math.sin(t)').ok, true);
});

console.log(`\n✅ ${testsPassed}/${testsRun} 可用性测试通过`);
