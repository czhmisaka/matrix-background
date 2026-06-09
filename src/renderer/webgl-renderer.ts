/**
 * @xietuier/matrix-rain · WebGL2 Renderer(0.4.0+)
 *
 * **职责**: 把 4,800 ~ 数百万 cells 一次性 drawArraysInstanced 渲染
 * - 用 WebGL2 instanced rendering,1 次 draw call = r × i 个字符
 * - 用 build-time 字符 atlas (`dist/atlas/jetbrains-mono-32.png`) 替代 fillText
 * - palette LUT 上传 GPU 端作为 RGBA texture
 * - warmth 阻尼 / character update / charset 仍 CPU 端调(写入 instance buffer)
 *
 * **性能特性**:
 * - 4K + fontSize 4 ≈ 518K cells → 1 ms drawArraysInstanced (vs 3-6s Canvas 2D)
 * - 8K + fontSize 2 ≈ 8.4M cells → 10-20 ms (still 60fps cap)
 * - 性能与 fillText 无关,主要瓶颈是 instance buffer 上传(可 bufferSubData 增量)
 *
 * **性能权衡**:
 * - drawChar 仍调 4800 次/帧(JS 端 loop, 写 instance buffer)
 * - 实际 GPU draw = 1 次 / 帧
 * - canvas2d 模式 fillText = 4800 次/帧 GPU 渲染
 *
 * **fallback**: 用户传非默认 charset → runtime OffscreenCanvas 补烘缺失字符
 * (Phase 2B MVP 暂未实现,只支持默认 charset, 缺失字符渲空白)
 *
 * @since 0.4.0
 */

import type { MatrixRainRenderer, RendererImpl } from './types';
import type { MatrixRainState } from '../engine/state';
import {
  type AtlasJson,
  type AtlasUV,
  buildAtlasLookup,
  buildCharsetMap,
  findMissingChars,
  isAtlasJson,
  loadAtlasJson,
} from './atlas-loader';
import {
  VERTEX_SHADER,
  FRAGMENT_SHADER,
  TRAIL_VERTEX_SHADER,
  TRAIL_FRAGMENT_SHADER,
  INSTANCE_STRIDE_FLOATS,
  INSTANCE_STRIDE_BYTES,
} from './webgl-shaders';

/**
 * WebGL2 context 抽象(便于测试 / SSR)
 * - 浏览器: 实际 WebGL2RenderingContext
 * - SSR/Node: 抛错
 */
type GL = WebGL2RenderingContext;

/**
 * Atlas URL 解析策略
 * - 浏览器: 静态 import 时由 bundler 注入 URL
 * - 运行时: 通过 setAtlasUrls() 注入(由 engine.ts 负责)
 */
let __atlasJsonUrl: string | null = null;
let __atlasPngUrl: string | null = null;

export const setAtlasUrls = (jsonUrl: string, pngUrl: string): void => {
  __atlasJsonUrl = jsonUrl;
  __atlasPngUrl = pngUrl;
};

export class WebGLRenderer implements MatrixRainRenderer {
  readonly type: RendererImpl = 'webgl';

  private _gl: GL | null = null;
  private _canvas: HTMLCanvasElement | null = null;

  /** atlas 加载结果 */
  private _atlasJson: AtlasJson | null = null;
  private _atlasLookup: Map<number, AtlasUV> | null = null;
  /** charCode → atlas index(0..totalChars-1) */
  private _charsetMap: Map<number, number> | null = null;

  /** GL programs / locations */
  private _program: WebGLProgram | null = null;
  private _trailProgram: WebGLProgram | null = null;
  private _attribs: {
    aPos: number;
    aCharIdx: number;
    aColor: number;
    aUV0: number;
    aUV1: number;
  } | null = null;
  private _uniforms: {
    uViewport: WebGLUniformLocation | null;
    uCellSize: WebGLUniformLocation | null;
    uAtlas: WebGLUniformLocation | null;
  } | null = null;
  private _trailUniforms: {
    uTrailColor: WebGLUniformLocation | null;
  } | null = null;

  /** VAO + VBO (WebGL2 必需 VAO) */
  private _vao: WebGLVertexArrayObject | null = null;
  private _vbo: WebGLBuffer | null = null;
  private _trailVao: WebGLVertexArrayObject | null = null;
  private _trailVbo: WebGLBuffer | null = null;

  /** atlas texture */
  private _atlasTex: WebGLTexture | null = null;

  /** Instance buffer: Float32Array, 预分配 r × i × INSTANCE_STRIDE_FLOATS */
  private _instanceBuffer: Float32Array | null = null;
  private _instanceCount = 0;
  private _cellSizePx = 32; // backing store px 中的 cell size

  /** destroy() 幂等 */
  private _destroyed = false;

  /** pause/resume */
  private _paused = false;

  /** charset cache (从 setCharset 注入) */
  private _charset = '';

  /** current viewport (CSS px) */
  private _w = 0;
  private _h = 0;
  private _dpr = 1;

  // ============ Lifecycle ============

  async init(canvas: HTMLCanvasElement, state: MatrixRainState): Promise<void> {
    if (this._destroyed) {
      throw new Error('[WebGLRenderer] init() called after destroy()');
    }
    this._canvas = canvas;

    // 1. WebGL2 context (NOT 2d!)
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true });
    if (!gl) {
      throw new Error(
        '[WebGLRenderer] WebGL2 not supported (this browser falls back to canvas2d renderer via auto-pick)'
      );
    }
    this._gl = gl;

    // 2. 加载 atlas
    if (!__atlasJsonUrl || !__atlasPngUrl) {
      throw new Error('[WebGLRenderer] atlas URLs not set (call setAtlasUrls() before matrixRain)');
    }
    const atlasJson = await loadAtlasJson(__atlasJsonUrl);
    if (!isAtlasJson(atlasJson)) {
      throw new Error('[WebGLRenderer] atlas JSON failed schema validation');
    }
    this._atlasJson = atlasJson;
    this._atlasLookup = buildAtlasLookup(atlasJson);
    this._charsetMap = buildCharsetMap(state.charset, atlasJson);

    // 缺失字符 warn
    const missing = findMissingChars(state.charset, atlasJson);
    if (missing.length > 0 && !this._warnedMissing) {
      console.warn(
        `[WebGLRenderer] ${missing.length} chars not in atlas (showing blank):`,
        missing.slice(0, 10).join('') + (missing.length > 10 ? '...' : '')
      );
      this._warnedMissing = true;
    }

    // 3. 加载 atlas PNG → texture
    await this._uploadAtlasTexture(gl, __atlasPngUrl);

    // 4. 编译 shader
    this._program = this._compileProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this._trailProgram = this._compileProgram(gl, TRAIL_VERTEX_SHADER, TRAIL_FRAGMENT_SHADER);
    this._attribs = this._bindAttribLocations(gl, this._program);
    this._uniforms = {
      uViewport: gl.getUniformLocation(this._program, 'uViewport'),
      uCellSize: gl.getUniformLocation(this._program, 'uCellSize'),
      uAtlas: gl.getUniformLocation(this._program, 'uAtlas'),
    };
    this._trailUniforms = {
      uTrailColor: gl.getUniformLocation(this._trailProgram, 'uTrailColor'),
    };

    // 5. 创建 VAO + VBO (instanced rendering 必备)
    this._vao = gl.createVertexArray();
    this._vbo = gl.createBuffer();
    gl.bindVertexArray(this._vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);

    // Instance attributes (per-cell 12 floats, stride 48 bytes)
    // vec4[0]: (aPos.x, aPos.y, aCharIdx, _pad)
    // vec4[1]: (aColor.r, aColor.g, aColor.b, aColor.a)
    // vec4[2]: (aUV0.x, aUV0.y, aUV1.x, aUV1.y)
    const stride = INSTANCE_STRIDE_BYTES;
    // location 0: aPos (vec2) - offset 0
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(0, 1); // 1 = per-instance
    // location 1: aCharIdx (float) - offset 8
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(1, 1);
    // location 2: aColor (vec4) - offset 12
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(2, 1);
    // location 3: aUV0 (vec2) - offset 28
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 28);
    gl.vertexAttribDivisor(3, 1);
    // location 4: aUV1 (vec2) - offset 36
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 36);
    gl.vertexAttribDivisor(4, 1);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // 6. Trail VAO (full-screen quad, no instance attribute)
    this._trailVao = gl.createVertexArray();
    this._trailVbo = gl.createBuffer(); // empty, no data needed
    gl.bindVertexArray(this._trailVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._trailVbo);
    // 不需要 VBO 数据 - vertex shader 用 gl_VertexID 算全屏 quad
    gl.bindVertexArray(null);

    // 7. Allocate instance buffer (lazy, expanded on resize)
    this._allocateInstanceBuffer(gl, state.r, state.i);
  }

  resize(w: number, h: number, dpr: number): void {
    if (this._destroyed || !this._gl) return;
    this._w = w;
    this._h = h;
    this._dpr = dpr;
    // backing store: 已在 engine.ts 那边 `canvas.width = canvas.width` 强制重置
    // 这里设 viewport
    this._gl.viewport(0, 0, Math.round(w * dpr), Math.round(h * dpr));
  }

  render(state: MatrixRainState, _dt: number): void {
    if (this._destroyed || this._paused || !this._gl) return;
    const gl = this._gl;
    if (this._instanceCount === 0) return;

    // 1. 残影拖尾(每帧全屏 alpha fade)
    this._renderTrail(gl, state);

    // 2. 字符 instanced draw
    //    - 假设 draw-helpers 已调 drawChar 填充 _instanceBuffer
    //    - 这里上传 buffer + drawArraysInstanced
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this._instanceBuffer,
      0,
      this._instanceCount * INSTANCE_STRIDE_FLOATS
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // 3. Use program + bind VAO + uniforms
    gl.useProgram(this._program);
    gl.bindVertexArray(this._vao);
    gl.uniform2f(this._uniforms!.uViewport, this._w * this._dpr, this._h * this._dpr);
    gl.uniform1f(this._uniforms!.uCellSize, this._cellSizePx);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._atlasTex);
    gl.uniform1i(this._uniforms!.uAtlas, 0);

    // 4. Enable blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 5. Draw: 4 vertices (TRIANGLE_STRIP quad) × instanceCount
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this._instanceCount);

    gl.bindVertexArray(null);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    const gl = this._gl;
    if (gl) {
      if (this._vao) gl.deleteVertexArray(this._vao);
      if (this._vbo) gl.deleteBuffer(this._vbo);
      if (this._trailVao) gl.deleteVertexArray(this._trailVao);
      if (this._trailVbo) gl.deleteBuffer(this._trailVbo);
      if (this._program) gl.deleteProgram(this._program);
      if (this._trailProgram) gl.deleteProgram(this._trailProgram);
      if (this._atlasTex) gl.deleteTexture(this._atlasTex);
    }
    this._gl = null;
    this._canvas = null;
    this._instanceBuffer = null;
    this._atlasJson = null;
    this._atlasLookup = null;
    this._charsetMap = null;
  }

  pause(): void {
    this._paused = true;
  }

  resume(): void {
    this._paused = false;
  }

  // ============ Drawing surface (per-cell / per-frame) ============

  drawTrail(r: number, g: number, b: number, a: number, _w: number, _h: number): void {
    if (!this._gl || this._paused) return;
    // 暂存 trail color, render() 时用
    this._trailR = r;
    this._trailG = g;
    this._trailB = b;
    this._trailA = a;
  }

  setFontSize(_px: number): void {
    // no-op: 字符 cell size 由 atlas cellSize 固定(32px backing store)
    // 实际 quad size 跟 DPR 同步
    if (this._gl) {
      this._cellSizePx = 32 * this._dpr; // backing store px
    }
  }

  setCharset(s: string): void {
    this._charset = s;
    if (this._atlasJson) {
      this._charsetMap = buildCharsetMap(s, this._atlasJson);
    }
  }

  drawChar(ch: number, cx: number, cy: number, r: number, g: number, b: number, a: number): void {
    if (!this._gl || !this._instanceBuffer || this._paused) return;
    if (ch < 0 || ch >= this._instanceCount) return;

    // 查 atlas index
    const chStr = this._charset[ch];
    if (!chStr) return;
    const code = chStr.charCodeAt(0);
    const atlasIdx = this._charsetMap?.get(code) ?? 0;
    // 查 UV
    const uv = this._atlasLookup?.get(code);

    // 写 instance buffer
    // 12 floats per instance: [pos.x, pos.y, charIdx, pad, r, g, b, a, u0, v0, u1, v1]
    const off = ch * INSTANCE_STRIDE_FLOATS;
    const buf = this._instanceBuffer;
    // backing store px (DPR 缩放)
    buf[off + 0] = cx * this._dpr; // aPos.x
    buf[off + 1] = cy * this._dpr; // aPos.y
    buf[off + 2] = atlasIdx; // aCharIdx
    buf[off + 3] = 0; // pad
    buf[off + 4] = r / 255; // aColor.r (0-1)
    buf[off + 5] = g / 255; // aColor.g
    buf[off + 6] = b / 255; // aColor.b
    buf[off + 7] = a; // aColor.a (already 0-1)
    buf[off + 8] = uv?.u0 ?? 0; // aUV0.x
    buf[off + 9] = uv?.v0 ?? 0; // aUV0.y
    buf[off + 10] = uv?.u1 ?? 1; // aUV1.x
    buf[off + 11] = uv?.v1 ?? 1; // aUV1.y
  }

  // ============ Internal ============

  private _trailR = 8;
  private _trailG = 8;
  private _trailB = 18;
  private _trailA = 0.18;
  private _warnedMissing = false;

  private _renderTrail(gl: GL, _state: MatrixRainState): void {
    gl.useProgram(this._trailProgram);
    gl.bindVertexArray(this._trailVao);
    gl.uniform4f(
      this._trailUniforms!.uTrailColor,
      this._trailR / 255,
      this._trailG / 255,
      this._trailB / 255,
      this._trailA
    );
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private _allocateInstanceBuffer(gl: GL, cols: number, rows: number): void {
    const count = cols * rows;
    if (count === 0) {
      this._instanceBuffer = null;
      this._instanceCount = 0;
      return;
    }
    this._instanceBuffer = new Float32Array(count * INSTANCE_STRIDE_FLOATS);
    this._instanceCount = count;
    // Re-upload VBO size hint
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._instanceBuffer.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /** Public hook: engine.ts resize 时调, 重新分配 instance buffer */
  public resizeGrid(cols: number, rows: number): void {
    if (!this._gl || this._destroyed) return;
    this._allocateInstanceBuffer(this._gl, cols, rows);
  }

  private _uploadAtlasTexture(gl: GL, pngUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const tex = gl.createTexture();
        if (!tex) {
          reject(new Error('[WebGLRenderer] createTexture failed'));
          return;
        }
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        // 字符 alpha 是硬边, 用 NEAREST 避免边缘模糊
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this._atlasTex = tex;
        resolve();
      };
      img.onerror = (e) => {
        reject(new Error(`[WebGLRenderer] atlas PNG load failed: ${e}`));
      };
      img.src = pngUrl;
    });
  }

  private _compileProgram(gl: GL, vsSrc: string, fsSrc: string): WebGLProgram {
    const vs = this._compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    if (!prog) throw new Error('[WebGLRenderer] createProgram failed');
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`[WebGLRenderer] program link failed: ${log}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  private _compileShader(gl: GL, type: number, src: string): WebGLShader {
    const sh = gl.createShader(type);
    if (!sh) throw new Error('[WebGLRenderer] createShader failed');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`[WebGLRenderer] shader compile failed: ${log}`);
    }
    return sh;
  }

  private _bindAttribLocations(
    gl: GL,
    prog: WebGLProgram
  ): {
    aPos: number;
    aCharIdx: number;
    aColor: number;
    aUV0: number;
    aUV1: number;
  } {
    return {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aCharIdx: gl.getAttribLocation(prog, 'aCharIdx'),
      aColor: gl.getAttribLocation(prog, 'aColor'),
      aUV0: gl.getAttribLocation(prog, 'aUV0'),
      aUV1: gl.getAttribLocation(prog, 'aUV1'),
    };
  }
}
