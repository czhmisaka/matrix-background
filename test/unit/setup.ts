/**
 * Vitest 单元测试 setup
 *
 * 提供:
 *   - globalThis.window / document / canvas / rAF mock(同 canvas-remove.mjs 等手写探针一致)
 *   - 测试结束后清理每个实例 / mock 状态
 *
 * 跨 spec 共享:每个 spec 文件 `import './setup'` 即可,Vitest 配置里把它标记为 setupFiles。
 *
 * 注意:不依赖 DOM env,因为我们走 happy-dom 之外的纯 mock 路线(与现有 .mjs 探针一致,
 *       保证迁移前后行为不变)。
 */

// ==================== rAF / timer 模拟 ====================
let __rafId = 0;
const __rafQueue = new Map();

let __mockNow = 0;
let __mockTimeDelta = 1000 / 60;

// ==================== canvas 2d mock(从 canvas-remove.mjs 同源)====================
class MockContext2D {
  constructor() {
    this.fillStyle = '';
    this.font = '';
    this.textBaseline = '';
    this.textAlign = '';
    this._fontRaw = '';
    this._fontSize = null;
    this._fontFamily = null;
    this._fontWeight = null;
  }
  setTransform() {}
  fillRect() {}
  fillText() {}
  save() {}
  restore() {}
  scale() {}
  translate() {}
  // happy-dom canvas 2D API 不实现 · matrixRain/textToBitmap/imageToBitmap
  // 会调这些接口,本文件只覆盖"接口形状",不画像素
  // (见 [[feedback_visual_verification_untrusted]];真像素必须走 Playwright 路径)
  drawImage() {}
  strokeRect() {}
  clearRect() {}
  strokeText() {}
  stroke() {}
  fill() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  arcTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  ellipse() {}
  rect() {}
  clip() {}
  rotate() {}
  transform() {}
  resetTransform() {}
  getLineDash() { return []; }
  setLineDash() {}
  isPointInPath() { return false; }
  isPointInStroke() { return false; }
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  putImageData() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  // mock measureText(CJK-aware by default for bitmap tests)
  measureText(text) {
    const size = this._fontSize || 14;
    let totalW = 0;
    for (const ch of String(text)) {
      const isCjk =
        /[　-〿぀-ゟ゠-ヿ㐀-䶿一-鿿가-힯豈-﫿＀-￯]/.test(ch);
      totalW += size * (isCjk ? 1.0 : 0.6);
    }
    return { width: totalW };
  }
  // font setter:parse "weight Npx family" 写入 _fontSize/_fontFamily/_fontWeight
  set font(v) {
    this._fontRaw = v;
    const m = /^(\S+)\s+(\d+)px\s+(.+)$/.exec(v);
    if (m) {
      this._fontWeight = m[1];
      this._fontSize = parseInt(m[2], 10);
      this._fontFamily = m[3];
    }
  }
  get font() {
    return this._fontRaw;
  }
  // mock getImageData:返回全黑(0)
  getImageData(x: number, y: number, w: number, h: number) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
}

class MockCanvas {
  constructor() {
    this.id = '';
    this.width = 100;
    this.height = 100;
    this.style = { cssText: '' };
    this.parentNode = null;
    this._listeners = new Map();
  }
  getContext(type) {
    if (type === 'webgl2') return null;
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
    if (idx === -1) this.children.push(child);
    else this.children.splice(idx, 0, child);
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
    return tag === 'canvas' ? new MockCanvas() : new MockDiv();
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
  innerWidth: 1920,
  innerHeight: 1080,
  matchMedia: (q) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
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
  constructor(cb) {
    this.cb = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.performance = { now: () => Date.now() };

// ==================== 跟踪最近一次 ctx.font ====================
// 文本 → 位图类 spec 需要捕获 textToBitmap 设给 ctx.font 的最后一次值
// 用来推断实际 fontSize / weight / family
let __lastCtxFont: string | null = null;
let __lastCtxFontSize: number | null = null;
let __lastCtxFontFamily: string | null = null;
let __lastCtxFontWeight: string | null = null;

const _origGetContext = MockCanvas.prototype.getContext;
(MockCanvas.prototype as unknown as { getContext: (t?: string) => unknown }).getContext = function (
  type?: string
) {
  // 把 type 透传给原始实现(webgl2 → null,其他 → MockContext2D)
  const ctx = _origGetContext.call(this, type) as MockContext2D | null;
  if (ctx === null) return null;
  Object.defineProperty(ctx, 'font', {
    get() {
      return this._fontRaw || '';
    },
    set(v: string) {
      this._fontRaw = v;
      const m = /^(\S+)\s+(\d+)px\s+(.+)$/.exec(v);
      if (m) {
        this._fontWeight = m[1];
        this._fontSize = parseInt(m[2], 10);
        this._fontFamily = m[3];
        __lastCtxFontWeight = m[1];
        __lastCtxFontSize = parseInt(m[2], 10);
        __lastCtxFontFamily = m[3];
      }
      __lastCtxFont = v;
    },
    configurable: true,
  });
  return ctx;
};

// ==================== 工具导出(供 spec 直接用)====================
export const getLastCtxFont = () => __lastCtxFont;
export const getLastCtxFontSize = () => __lastCtxFontSize;
export const getLastCtxFontFamily = () => __lastCtxFontFamily;
export const getLastCtxFontWeight = () => __lastCtxFontWeight;
export const setMockNow = (t: number) => {
  __mockNow = t;
};
export const setMockTimeDelta = (d: number) => {
  __mockTimeDelta = d;
};
export const tickRAF = (steps = 1): void => {
  for (let i = 0; i < steps; i++) {
    const queue = Array.from(__rafQueue.entries());
    __rafQueue.clear();
    for (const [, cb] of queue) cb(__mockNow);
    __mockNow += __mockTimeDelta;
    if (__rafQueue.size === 0) break;
  }
};

export { __rafQueue, MockContext2D, MockCanvas, MockDiv, mockDocument, mockWindow };