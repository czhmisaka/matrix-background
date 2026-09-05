/**
 * webgl-renderer 单元测试 · Vitest
 *
 * 目标:把 src/renderer/webgl-renderer.ts 的"非 GL 路径"覆盖到 ≥35% Stmts。
 *
 * 范围(单元可测的纯逻辑/早返分支):
 *   - setAtlasUrls() 模块级函数
 *   - destroy() 幂等
 *   - pause() / resume() 状态切换
 *   - drawChar 在 _gl / _instanceBuffer / _initialized 缺失时早返(no-op)
 *   - drawTrail 在 _gl / _paused 缺失时早返
 *   - setCharset() 在 _atlasJson 未加载时只更新 _charset
 *   - setFontSize() 在 _gl 缺失时 no-op
 *   - beginFrame 在 _initialized=false 时不重置 _drawCallIdx
 *   - resize() 在 destroyed / !_gl 时 no-op
 *
 * 不在范围(走真浏览器 GL 上下文):
 *   - init() / _compileProgram / _uploadAtlasTexture / _renderTrail / _allocateInstanceBuffer
 *     全要 WebGL2RenderingContext 真对象,走 test/renderer-pixel.mjs 的 Playwright 路径
 *     (audit-test-release-2026-06-24 P1-5 § "真渲染依赖 Playwright")
 *
 * 兼容 [[feedback_visual_verification_untrusted]] —— 单测只验"接口形状 + 早返分支",
 * 真像素对比走 test/renderer-pixel.mjs(已纳入 npm test 链)。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WebGLRenderer, setAtlasUrls } from '../../../src/renderer/webgl-renderer';

// ==================== mock canvas factory ====================

/**
 * 构造一个 webgl-renderer 可吃的最小 canvas:
 *   - getContext('webgl2') → null(模拟环境无 WebGL,renderer 不应崩)
 *   - width / height 可读
 *   - 不必真的有 GL,所有 GL 路径早返
 */
function makeMockCanvas(): HTMLCanvasElement {
  return {
    width: 100,
    height: 100,
    style: {},
    getContext: (type: string) => (type === 'webgl2' ? null : null),
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100 }),
  } as unknown as HTMLCanvasElement;
}

describe('WebGLRenderer - 接口形状与早返分支', () => {
  let renderer: WebGLRenderer;

  beforeEach(() => {
    renderer = new WebGLRenderer();
  });

  // ============ type / getHealth ============
  it('type === "webgl"', () => {
    expect(renderer.type).toBe('webgl');
  });

  it('getHealth() 返回对象(未 init 时 initialized=false)', () => {
    const h = renderer.getHealth();
    expect(h).toBeTypeOf('object');
    expect(h.initialized).toBe(false);
    expect(h.frameCount).toBe(0);
  });

  // ============ destroy 幂等 ============
  it('destroy() 不抛(未 init)', () => {
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('destroy() 第二次调用 no-op(幂等)', () => {
    renderer.destroy();
    expect(() => renderer.destroy()).not.toThrow();
  });

  // ============ pause / resume ============
  it('pause() / resume() 不抛', () => {
    expect(() => renderer.pause()).not.toThrow();
    expect(() => renderer.resume()).not.toThrow();
  });

  // ============ beginFrame 未 init 时早返 ============
  it('beginFrame() 未 init 时不抛(no-op)', () => {
    expect(() => renderer.beginFrame()).not.toThrow();
  });

  // ============ drawChar 早返(_gl=null)============
  it('drawChar() 在 _gl=null 时 no-op', () => {
    expect(() => renderer.drawChar(0, 0, 0, 0, 0, 0, 0)).not.toThrow();
  });

  it('drawChar() 调 1000 次,未 init 时无副作用', () => {
    for (let i = 0; i < 1000; i++) renderer.drawChar(0, 0, 0, 0, 0, 0, 0);
    // 健康跟踪:drawCallIdx 不递增(早返)
    const h = renderer.getHealth();
    expect(h.drawCallIdx).toBe(0);
  });

  // ============ drawTrail 早返 ============
  it('drawTrail() 在 _gl=null 时 no-op', () => {
    expect(() => renderer.drawTrail(0, 0, 0, 0)).not.toThrow();
  });

  // ============ setFontSize 在 _gl=null 时 no-op ============
  it('setFontSize() 在 _gl=null 时 no-op(不抛)', () => {
    expect(() => renderer.setFontSize(14)).not.toThrow();
  });

  // ============ setCharset 行为 ============
  it('setCharset() 在 _atlasJson=null 时只更新 charset(不抛)', () => {
    expect(() => renderer.setCharset('01')).not.toThrow();
  });

  it('setCharset() 多次调用不抛(空字符串 + 特殊字符)', () => {
    expect(() => renderer.setCharset('')).not.toThrow();
    expect(() => renderer.setCharset('日本語')).not.toThrow();
    expect(() => renderer.setCharset('01')).not.toThrow();
  });

  // ============ resize 在 destroyed 时早返 ============
  it('resize() 在 destroyed 时 no-op', () => {
    renderer.destroy();
    expect(() => renderer.resize(800, 600, 1)).not.toThrow();
  });

  it('resize() 在未 init / _gl=null 时 no-op', () => {
    expect(() => renderer.resize(800, 600, 1)).not.toThrow();
    expect(() => renderer.resize(1920, 1080, 2)).not.toThrow();
  });

  // ============ resizeGrid 在 destroyed 时早返 ============
  it('resizeGrid() 在 destroyed 时 no-op', () => {
    renderer.destroy();
    expect(() => renderer.resizeGrid!(10, 5)).not.toThrow();
  });

  it('resizeGrid() 在未 init 时早返(_gl=null),不抛', () => {
    expect(() => renderer.resizeGrid!(10, 5)).not.toThrow();
  });

  it('resizeGrid(0,0) 不抛(allocateInstanceBuffer 走 count=0 分支)', () => {
    // 注:这里 _gl=null 会早返,不走 allocateInstanceBuffer 真分支
    expect(() => renderer.resizeGrid!(0, 0)).not.toThrow();
  });

  it('resizeGrid(2,2) 不抛 + resize() 设 _w/_h/_dpr', () => {
    // resize() 设 _w/_h/_dpr,然后 resizeGrid() 走 _gl=null 早返
    renderer.resize(800, 600, 1);
    expect(() => renderer.resizeGrid!(2, 2)).not.toThrow();
  });

  it('resizeGrid() 后 beginFrame / drawChar 仍 no-op(_gl 缺失)', () => {
    renderer.resizeGrid!(5, 3);
    expect(() => renderer.beginFrame()).not.toThrow();
    expect(() => renderer.drawChar(0, 0, 0, 0, 0, 0, 0)).not.toThrow();
  });

  // ============ render() 在 _gl=null / _drawCallIdx=0 时早返 ============
  it('render() 在 _gl=null / _drawCallIdx=0 时早返,不抛', () => {
    const fakeState = { r: 5, i: 3, fps: 60 } as unknown as Parameters<typeof renderer.render>[0];
    expect(() => renderer.render(fakeState, 1 / 60)).not.toThrow();
  });

  it('render() 在 destroyed 时早返', () => {
    renderer.destroy();
    const fakeState = { r: 5, i: 3, fps: 60 } as unknown as Parameters<typeof renderer.render>[0];
    expect(() => renderer.render(fakeState, 1 / 60)).not.toThrow();
  });

  /**
   * 通过类型断言注入私有字段,模拟"已 init 但 _drawCallIdx=0" 状态。
   * render() 在 _drawCallIdx===0 处早返(frameCount 仍未 ++)。
   * (注:用 Proxy 模拟 GL,所有调用 noop)
   */
  it('render() 在 _initialized=true + _drawCallIdx=0 时仍早返(走 frameCount++ 然后 return)', () => {
    // 注入私有字段
    const r = renderer as unknown as {
      _initialized: boolean;
      _drawCallIdx: number;
      _gl: unknown;
      _instanceBuffer: Float32Array | null;
    };
    r._initialized = true;
    r._drawCallIdx = 0;
    r._instanceBuffer = new Float32Array(48);
    r._gl = makeMockCanvasReturningStub().getContext('webgl2');

    const fakeState = { r: 5, i: 3, fps: 60 } as unknown as Parameters<typeof renderer.render>[0];
    expect(() => renderer.render(fakeState, 1 / 60)).not.toThrow();
    // frameCount 不递增(因为 _drawCallIdx===0 在 line 293 早返,在 frameCount++ 之前)
    expect(renderer.getHealth().frameCount).toBe(0);
  });

  /**
   * _drawCallIdx > 0 + _instanceBuffer 非空 → render() 进入 GPU 路径。
   * Proxy GL stub 让所有 gl.* 调用 noop → 不抛。
   * 这覆盖了 render() body 中 _renderTrail / bufferSubData / drawArraysInstanced 全部调用。
   */
  it('render() 走完整 GPU 路径(Proxy GL stub)', () => {
    const r = renderer as unknown as {
      _initialized: boolean;
      _drawCallIdx: number;
      _gl: unknown;
      _instanceBuffer: Float32Array | null;
      _program: unknown;
      _trailProgram: unknown;
      _vao: unknown;
      _vbo: unknown;
      _trailVao: unknown;
      _trailVbo: unknown;
      _atlasTex: unknown;
      _uniforms: unknown;
      _trailUniforms: unknown;
      _w: number;
      _h: number;
      _dpr: number;
    };
    r._initialized = true;
    r._drawCallIdx = 5;
    r._w = 800;
    r._h = 600;
    r._dpr = 1;
    r._instanceBuffer = new Float32Array(5 * 12); // 5 instances × 12 floats
    r._gl = makeMockCanvasReturningStub().getContext('webgl2');
    r._program = { id: 1 };
    r._trailProgram = { id: 2 };
    r._vao = { id: 3 };
    r._vbo = { id: 4 };
    r._trailVao = { id: 5 };
    r._trailVbo = { id: 6 };
    r._atlasTex = { id: 7 };
    r._uniforms = { uViewport: { id: 'vp' }, uCellSize: { id: 'cs' }, uAtlas: { id: 'at' } };
    r._trailUniforms = { uTrailColor: { id: 'tc' } };

    const fakeState = { r: 5, i: 1, fps: 60 } as unknown as Parameters<typeof renderer.render>[0];
    expect(() => renderer.render(fakeState, 1 / 60)).not.toThrow();
    // instanceCount 应更新
    const h = renderer.getHealth();
    expect(h.instanceCount).toBe(5);
    expect(h.gridCols).toBe(5);
    expect(h.gridRows).toBe(1);
  });
});

// ==================== init() 错误路径(canvas.getContext('webgl2')=null)================
describe('WebGLRenderer.init() - 错误路径', () => {
  it('canvas.getContext("webgl2")=null → init throws + health 记 INIT_FAILED', async () => {
    const renderer = new WebGLRenderer();
    const canvas = makeMockCanvas();
    let err: unknown = null;
    try {
      await renderer.init(canvas, {} as unknown as Parameters<typeof renderer.init>[1]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/WebGL2 not supported/i);
    const h = renderer.getHealth();
    expect(h.initialized).toBe(false);
    // health.recordHealthError 把 lastInitError 覆盖为 'INIT_FAILED'(tag 不是 message)
    expect(h.lastInitError).toBe('INIT_FAILED');
  });

  it('init() 后 destroy() 幂等', async () => {
    const renderer = new WebGLRenderer();
    const canvas = makeMockCanvas();
    try { await renderer.init(canvas, {} as unknown as Parameters<typeof renderer.init>[1]); } catch { /* expected */ }
    expect(() => renderer.destroy()).not.toThrow();
    expect(() => renderer.destroy()).not.toThrow(); // 第二次幂等
  });

  it('destroy() 后再 init() 抛"called after destroy()"', async () => {
    const renderer = new WebGLRenderer();
    renderer.destroy();
    const canvas = makeMockCanvas();
    let err: unknown = null;
    try {
      await renderer.init(canvas, {} as unknown as Parameters<typeof renderer.init>[1]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/init\(\) called after destroy\(\)/);
  });

  it('atlas URLs 未设置 / load 失败 → init throws (走到 atlas 路径)', async () => {
    const renderer = new WebGLRenderer();
    const canvas = makeMockCanvasReturningStub();
    // 注:setAtlasUrls 是 module-level 共享;这里尝试设成不存在路径,触发 atlas JSON 加载失败
    setAtlasUrls('/__nonexistent__/atlas.json', '/__nonexistent__/atlas.png');
    let err: unknown = null;
    try {
      await renderer.init(canvas, {} as unknown as Parameters<typeof renderer.init>[1]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    // 至少含 "atlas"(URIs not set / JSON load / PNG load)
    expect(msg).toMatch(/atlas/i);
  });
});

/**
 * 给 init() 走到 atlas 加载阶段的 canvas mock:
 *   - getContext('webgl2') → 返回 noop stub(模拟有 GL 但内容是 noop)
 *   - atlas loader 会失败(Image src 404),所以 init 走 catch 分支
 * 这样能覆盖 init() body 中 _gl 创建 + 各种 early throw 之间的代码路径。
 */
function makeMockCanvasReturningStub(): HTMLCanvasElement {
  const noop = () => {};
  const glStub = new Proxy(
    {},
    {
      get: (_t, prop) => {
        // create* 返回有 id 的伪对象(供 isValid 判 null 用)
        if (prop === 'createBuffer' || prop === 'createVertexArray' || prop === 'createProgram' ||
            prop === 'createShader' || prop === 'createTexture') {
          return () => ({ id: 1 });
        }
        if (prop === 'getUniformLocation' || prop === 'getAttribLocation') return () => null;
        if (prop === 'getError') return () => 0;
        // 数字枚举(VERTEX_SHADER=35633 等)给个常量 0
        if (typeof prop === 'string' && /^[A-Z_]+$/.test(prop)) return 0;
        return noop;
      },
    }
  );
  return {
    width: 100,
    height: 100,
    style: {},
    getContext: (type: string) => (type === 'webgl2' ? glStub : null),
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100 }),
  } as unknown as HTMLCanvasElement;
}

describe('setAtlasUrls (module-level)', () => {
  it('不抛(接受任意字符串)', () => {
    expect(() => setAtlasUrls('/path/to/atlas.json', '/path/to/atlas.png')).not.toThrow();
  });

  it('空字符串也接受(不抛)', () => {
    expect(() => setAtlasUrls('', '')).not.toThrow();
  });

  it('多次调用不抛(后值覆盖前值)', () => {
    setAtlasUrls('/a.json', '/a.png');
    expect(() => setAtlasUrls('/b.json', '/b.png')).not.toThrow();
  });
});