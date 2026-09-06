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
import {
  createHealthTracker,
  recordHealthError,
  snapshotHealth,
  tickDroppedFrames,
  type RendererHealth,
} from './health';

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

  /**
   * init() 完成后置 true(0.4.1+ 修复: engine 不 await renderer.init,
   * 所以 init 跑完前不允许 render/drawChar/beginFrame, 避免读到 null shader uniforms)
   */
  private _initialized = false;

  /** atlas 加载结果 */
  private _atlasJson: AtlasJson | null = null;
  private _atlasLookup: Map<number, AtlasUV> | null = null;
  /** charCode → atlas index(0..totalChars-1) */
  private _charsetMap: Map<number, number> | null = null;

  /** GL programs / locations */
  private _program: WebGLProgram | null = null;
  private _trailProgram: WebGLProgram | null = null;
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
  /** 0.7.1+: 最近一次 grid 尺寸 (context-restored 重建 instance buffer 用) */
  private _lastCols = 0;
  private _lastRows = 0;

  /**
   * 当前帧内 drawChar 的调用计数(0.4.1+ 修复 P0-1)
   * 引擎在 rAF 每帧开头调 beginFrame() 重置为 0,
   * 每次 drawChar 写入第 `_drawCallIdx` 号 instance buffer 槽位后 ++.
   * render() 最终用此值作为 drawArraysInstanced 的实例数.
   */
  private _drawCallIdx = 0;

  /** 0.6.0+ 渲染器健康跟踪(每帧 gl.getError() + drawCallIdx 断言) */
  private _health = createHealthTracker('webgl');

  // ============ Lifecycle ============

  async init(canvas: HTMLCanvasElement, state: MatrixRainState): Promise<void> {
    if (this._destroyed) {
      throw new Error('[WebGLRenderer] init() called after destroy()');
    }

    // 0.6.0+: 记录 init 起止时间,失败时入 health.lastInitError
    const initStart = performance.now();
    try {
      // 1. WebGL2 context (NOT 2d!)
      // 0.4.1+: preserveDrawingBuffer:true 让 readPixels/drawImage(webglCanvas) 能拿到上一帧的内容
      // (浏览器默认 false — composited 后 framebuffer 内容可能被丢弃, bench 像素读不出来)
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      if (!gl) {
        throw new Error(
          '[WebGLRenderer] WebGL2 not supported (this browser falls back to canvas2d renderer via auto-pick)'
        );
      }
      this._gl = gl;

      // 2. 加载 atlas
      if (!__atlasJsonUrl || !__atlasPngUrl) {
        throw new Error(
          '[WebGLRenderer] atlas URLs not set (call setAtlasUrls() before matrixRain)'
        );
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
      // location 3: aUV0 (vec2) - offset 32 (slotOff+8 floats × 4 bytes = 32)
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 32);
      gl.vertexAttribDivisor(3, 1);
      // location 4: aUV1 (vec2) - offset 40 (aUV0 后 8 bytes)
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 40);
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
      this._lastCols = state.r;
      this._lastRows = state.i;
      this._allocateInstanceBuffer(gl, state.r, state.i);

      // 0.4.3 修复: engine 同步调 setCharset(state.charset) 在 init() 完成前,
      //   此时 _atlasJson 还是 null → _charsetMap 永远空 → drawChar 写 instance buffer
      //   时 atlasIdx=0, uv=undefined → aUV=(0,0,1,1) (整张 atlas),字符位置/形态错乱。
      //   修法:init 末尾用已加载的 atlasJson 重新 buildCharsetMap(state.charset)。
      this._charsetMap = buildCharsetMap(state.charset, this._atlasJson!);

      // 0.4.1+ 修复: engine 不 await init(), 用此标志告诉 render/beginFrame/drawChar 现在可以工作了
      this._initialized = true;

      // 0.7.1+ P0-1 修复: WebGL context-lost 自愈
      // - lost: preventDefault(允许 restore) + 标记未初始化 + health 计数
      //   (不 preventDefault 的话浏览器会销毁 context, 永远不会 restored)
      // - restored: 重跑 GPU 资源重建 (atlas texture / programs / VAO/VBO / instance buffer)
      canvas.addEventListener(
        'webglcontextlost',
        (e: Event) => {
          e.preventDefault();
          this._initialized = false;
          this._health.contextLostCount++;
          recordHealthError(this._health, 'CONTEXT_LOST');
        },
        { once: false }
      );
      canvas.addEventListener(
        'webglcontextrestored',
        () => {
          void this._rebuildResources();
        },
        { once: false }
      );
    } catch (e) {
      // 0.6.0+: 错误入 health,不 console.error(调用方矩阵雨仍能跑降级路径)
      const msg = e instanceof Error ? e.message : String(e);
      this._health.lastInitError = msg;
      recordHealthError(this._health, 'INIT_FAILED');
      throw e;
    }
    // 0.6.0+: init 成功,记耗时
    this._health.initialized = true;
    this._health.initDurationMs = performance.now() - initStart;
    // 0.7.1+ F-4: 资源字段(atlas 纹理 1 个 + vbo/trailVbo;显存 = instance buffer + atlas 纹理估算)
    this._health.textureCount = 1;
    this._updateGpuMemoryHealth();
  }

  /**
   * 0.7.1+ P0-1: webglcontextrestored 后重建全部 GPU 资源
   * (context 丢失时浏览器清空所有 GL 对象, texture/program/buffer 全部失效)
   * 失败入 health.lastInitError 并保持 _initialized=false, 引擎层 draw 会跳过空帧
   */
  private async _rebuildResources(): Promise<void> {
    const gl = this._gl;
    if (this._destroyed || !gl || !this._atlasJson || !__atlasPngUrl) return;
    try {
      // 1. atlas texture (context 丢失后旧 texture 已失效, 重传)
      await this._uploadAtlasTexture(gl, __atlasPngUrl);
      // 2. programs + uniforms
      this._program = this._compileProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
      this._trailProgram = this._compileProgram(gl, TRAIL_VERTEX_SHADER, TRAIL_FRAGMENT_SHADER);
      this._uniforms = {
        uViewport: gl.getUniformLocation(this._program, 'uViewport'),
        uCellSize: gl.getUniformLocation(this._program, 'uCellSize'),
        uAtlas: gl.getUniformLocation(this._program, 'uAtlas'),
      };
      this._trailUniforms = {
        uTrailColor: gl.getUniformLocation(this._trailProgram, 'uTrailColor'),
      };
      // 3. VAO/VBO (主 + trail) — 与 init() 步骤 5/6 相同
      this._vao = gl.createVertexArray();
      this._vbo = gl.createBuffer();
      gl.bindVertexArray(this._vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
      const stride = INSTANCE_STRIDE_BYTES;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(0, 1);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 12);
      gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 32);
      gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 40);
      gl.vertexAttribDivisor(4, 1);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this._trailVao = gl.createVertexArray();
      this._trailVbo = gl.createBuffer();
      gl.bindVertexArray(this._trailVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._trailVbo);
      gl.bindVertexArray(null);
      // 4. instance buffer (按当前 grid 尺寸重分配)
      this._allocateInstanceBuffer(gl, this._lastCols, this._lastRows);
      // 5. 恢复 viewport
      gl.viewport(0, 0, Math.round(this._w * this._dpr), Math.round(this._h * this._dpr));
      this._initialized = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this._health.lastInitError = msg;
      recordHealthError(this._health, 'RESTORE_FAILED');
      // 保持 _initialized=false — 引擎每帧 render() 会跳过, 下次 restored 再试
    }
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

  /**
   * 0.4.1+: 引擎在 rAF 内、drawTrail 之后、drawChar 循环之前调.
   * 把 _drawCallIdx 重置为 0,让本帧的 drawChar 写入从槽位 0 开始.
   */
  beginFrame(): void {
    if (!this._initialized) return; // init 还没完成,跳过本帧
    this._drawCallIdx = 0;
  }

  render(state: MatrixRainState, _dt: number): void {
    if (this._destroyed || this._paused || !this._gl) return;
    if (!this._initialized) return; // init 还没完成,跳过本帧
    const gl = this._gl;
    if (this._drawCallIdx === 0) return;
    if (!this._instanceBuffer) return;

    // 0.6.0+: 帧起点测耗时 + 帧数 + 同步 grid dims 进 health
    const frameStart = performance.now();
    this._health.frameCount++;
    this._health.drawCallIdx = this._drawCallIdx;
    this._health.gridCols = state.r;
    this._health.gridRows = state.i;
    this._health.instanceCount = this._drawCallIdx;

    // 0.6.0+: drawArraysInstanced instance 数断言(0.5.1 P0-1 旧 bug 复发检测)
    const expectedInstances = state.r * state.i;
    if (this._drawCallIdx !== expectedInstances) {
      recordHealthError(this._health, 'INSTANCE_COUNT_MISMATCH');
    }

    // 1. 残影拖尾(每帧全屏 alpha fade)
    this._renderTrail(gl, state);

    // 2. 字符 instanced draw
    //    - draw-helpers 在本帧内调了 _drawCallIdx 次 drawChar,
    //      写入了 _instanceBuffer 的前 _drawCallIdx*STRIDE 个 float
    //    - 这里只上传"用到的部分"+ drawArraysInstanced
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this._instanceBuffer,
      0,
      this._drawCallIdx * INSTANCE_STRIDE_FLOATS
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

    // 4. Enable blending (premultiplied alpha + framebuffer is premultipliedAlpha=true)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // 5. Draw: 4 vertices (TRIANGLE_STRIP quad) × 本帧实际写入的 cell 数
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this._drawCallIdx);

    gl.bindVertexArray(null);

    // 0.6.0+: 帧末 gl.getError() 轮询(一次性,本帧所有 GL 调用后的残留错误)
    const err = gl.getError();
    if (err !== 0) {
      recordHealthError(this._health, err);
    }
    this._health.lastFrameDurationMs = performance.now() - frameStart;
    tickDroppedFrames(this._health, state.fps);
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

  // 0.6.0+: 渲染器健康快照
  getHealth(): RendererHealth {
    return snapshotHealth(this._health);
  }

  // ============ Drawing surface (per-cell / per-frame) ============

  drawTrail(r: number, g: number, b: number, a: number): void {
    if (!this._gl || this._paused) return;
    // 暂存 trail color, render() 时用
    this._trailR = r;
    this._trailG = g;
    this._trailB = b;
    this._trailA = a;
  }

  setFontSize(px: number): void {
    // 0.4.1+: cellSize 跟随 fontSize 缩放 (atlas 仍 bake 在 32px, sampler 自动 downscale)
    // 这样改 fontSize 后 quad 大小同步, 与 canvas2d 视觉一致
    if (this._gl) {
      this._cellSizePx = px * this._dpr; // backing store px
    }
  }

  setCharset(s: string): void {
    this._charset = s;
    if (this._atlasJson) {
      this._charsetMap = buildCharsetMap(s, this._atlasJson);
    }
  }

  drawChar(
    ch: number,
    cx: number,
    cy: number,
    r: number,
    g: number,
    b: number,
    a: number,
    gridIdx?: number
  ): void {
    if (!this._gl || !this._instanceBuffer || this._paused) return;
    if (!this._initialized) return; // init 还没完成
    // 0.4.1+ 修复 P0-1: ch 是 charset index (查 atlas/UV 用),
    // 不是 instance buffer 槽位 — 槽位用 _drawCallIdx 算
    const slotOff = this._drawCallIdx * INSTANCE_STRIDE_FLOATS;
    if (slotOff + INSTANCE_STRIDE_FLOATS > this._instanceBuffer.length) return; // 容量守卫

    // 查 atlas index
    const chStr = this._charset[ch];
    if (!chStr) {
      // charset miss: 不写入,但 _drawCallIdx 也不递增,避免下一次跳格
      return;
    }
    const code = chStr.charCodeAt(0);
    const atlasIdx = this._charsetMap?.get(code) ?? 0;
    // 查 UV
    const uv = this._atlasLookup?.get(code);

    // 写 instance buffer
    // 12 floats per instance: [pos.x, pos.y, charIdx, pad, r, g, b, a, u0, v0, u1, v1]
    const buf = this._instanceBuffer;
    // backing store px (DPR 缩放)
    buf[slotOff + 0] = cx * this._dpr; // aPos.x
    buf[slotOff + 1] = cy * this._dpr; // aPos.y
    buf[slotOff + 2] = atlasIdx; // aCharIdx
    buf[slotOff + 3] = gridIdx ?? this._drawCallIdx; // 0.7.1+ P1-4: pad 槽改写 gridIdx(webgl shader 暂未用,与 webgpu 对齐)
    buf[slotOff + 4] = r / 255; // aColor.r (0-1)
    buf[slotOff + 5] = g / 255; // aColor.g
    buf[slotOff + 6] = b / 255; // aColor.b
    buf[slotOff + 7] = a; // aColor.a (already 0-1)
    buf[slotOff + 8] = uv?.u0 ?? 0; // aUV0.x
    buf[slotOff + 9] = uv?.v0 ?? 0; // aUV0.y
    buf[slotOff + 10] = uv?.u1 ?? 1; // aUV1.x
    buf[slotOff + 11] = uv?.v1 ?? 1; // aUV1.y

    this._drawCallIdx++;
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
    // premultiplied alpha (framebuffer is premultipliedAlpha=true)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private _allocateInstanceBuffer(gl: GL, cols: number, rows: number): void {
    const count = cols * rows;
    if (count === 0) {
      this._instanceBuffer = null;
      return;
    }
    this._instanceBuffer = new Float32Array(count * INSTANCE_STRIDE_FLOATS);
    // Re-upload VBO size hint
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._instanceBuffer.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this._updateGpuMemoryHealth();
  }

  /**
   * 0.7.1+ F-4: 更新 health 的 GPU 显存估算
   * = instance VBO (r×i×48B) + trail VBO (恒 0, gl_VertexID 计算) + atlas 纹理 (1024²×4B)
   */
  private _updateGpuMemoryHealth(): void {
    const atlasBytes = 1024 * 1024 * 4; // build-atlas 固定 1024×1024 RGBA
    const instanceBytes = this._instanceBuffer ? this._instanceBuffer.byteLength : 0;
    this._health.gpuMemoryBytes = instanceBytes + atlasBytes;
  }

  /** Public hook: engine.ts resize 时调, 重新分配 instance buffer */
  public resizeGrid(cols: number, rows: number): void {
    if (!this._gl || this._destroyed) return;
    // 0.4.3 修复: buildGrid 在 init() 返回前调 resizeGrid 重新分配 instance buffer.
    //   之前的 _initialized 守卫把这次调用挡掉, _instanceBuffer 保持 init 时按
    //   state.r=0, state.i=0 分配的 0 大小 buffer → drawChar 全部 silent skip
    //   (因为 buffer 容量 = 0) → 屏幕只剩残影拖尾.
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
        // 字符 alpha 是硬边, NEAREST 避免边缘模糊 + LINEAR 边缘过滤混用
        // (默认 LINEAR 跟 webgpu 一致, swiftshader 头无下字符仍可见)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this._atlasTex = tex;
        resolve();
      };
      img.onerror = (e) => {
        // 0.7.1+ P0-5: atlas 加载失败也要入 health (原只 reject, health 无感知)
        this._health.lastInitError = 'ATLAS_LOAD_FAILED';
        recordHealthError(this._health, 'ATLAS_LOAD_FAILED');
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
}
