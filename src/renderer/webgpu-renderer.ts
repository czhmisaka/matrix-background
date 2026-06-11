/**
 * @xietuier/matrix-rain · WebGPU Renderer (0.4.0+ Phase 4)
 *
 * **职责**: 8K+fontSize 2 等极端场景下,GPU 并行 warmth 阻尼 + instanced 渲染
 * - WebGPU compute shader 跑 warmth 阻尼(并行,1-2ms for 8M cells)
 * - instanced render pipeline 共享 atlas 纹理(同 WebGL2 路径)
 * - 异步 init (`await navigator.gpu.requestAdapter()`)
 *
 * **性能特性**:
 * - 4K + fontSize 4 (518K cells) → 1-2ms (compute) + 1ms (render) = 3ms/帧 ✓
 * - 8K + fontSize 2 (8.4M cells) → 5-10ms (compute) + 5ms (render) = 15ms/帧 ✓
 * - 8K + fontSize 4 (2.1M cells) → 2-3ms + 1ms = 4ms/帧 ✓
 *
 * **降级链**: webgpu 失败 → webgl → canvas2d
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
  RENDER_VERTEX_SHADER,
  RENDER_FRAGMENT_SHADER,
  TRAIL_VERTEX_SHADER,
  TRAIL_FRAGMENT_SHADER,
  INSTANCE_STRIDE_FLOATS,
  INSTANCE_STRIDE_BYTES,
} from './webgpu-shaders';
import {
  type GPUCanvasContext,
  type GpuNavigator,
  type GPUDevice,
  type GPUQueue,
  type GPUBuffer,
  type GPUTexture,
  type GPUTextureView,
  type GPUSampler,
  type GPURenderPipeline,
  type GPUBindGroup,
  type GPUBindGroupLayout,
  type GPUCommandBuffer,
  type GPUTextureFormat,
  GPUBufferUsage,
  GPUShaderStage,
  GPUTextureUsage,
} from './webgpu-types';

// =========== Uniform buffer 布局定义 ============

/** Vertex uniforms: viewport + cellSize (16 bytes) */
const VERTEX_UNIFORMS_SIZE = 16; // 4 floats × 4 bytes
/** Trail color: rgba (16 bytes) */
const TRAIL_COLOR_SIZE = 16; // 4 floats × 4 bytes

export class WebGPURenderer implements MatrixRainRenderer {
  readonly type: RendererImpl = 'webgpu';

  private _device: GPUDevice | null = null;
  private _queue: GPUQueue | null = null;

  /**
   * init() 完成后置 true(0.4.1+ 修复: engine 不 await renderer.init,
   * 所以 init 跑完前不允许 render/drawChar/beginFrame, 避免读到 null pipelines)
   */
  private _initialized = false;

  /** atlas 加载结果 */
  private _atlasJson: AtlasJson | null = null;
  private _atlasLookup: Map<number, AtlasUV> | null = null;
  private _charsetMap: Map<number, number> | null = null;

  /** Pipelines (0.4.1+: 移除 fake compute pass, 只剩 render + trail) */
  private _renderPipeline: GPURenderPipeline | null = null;
  private _trailPipeline: GPURenderPipeline | null = null;

  /** Bind group layouts */
  private _renderBindGroupLayout: GPUBindGroupLayout | null = null;
  private _trailBindGroupLayout: GPUBindGroupLayout | null = null;

  /** Bind groups */
  private _renderBindGroup: GPUBindGroup | null = null;
  private _trailBindGroup: GPUBindGroup | null = null;

  /** Buffers */
  private _instanceBuffer: GPUBuffer | null = null;
  private _vertexUniformsBuffer: GPUBuffer | null = null;
  private _trailColorBuffer: GPUBuffer | null = null;

  /** atlas texture + sampler */
  private _atlasTex: GPUTexture | null = null;
  private _sampler: GPUSampler | null = null;

  /** GPUCanvasContext (从 canvas.getContext('webgpu') 获取) */
  private _ctx: GPUCanvasContext | null = null;

  /** Per-frame CPU data */
  private _instanceData: Float32Array | null = null;
  private _cellSizePx = 32;
  private _charset = '';
  private _w = 0;
  private _h = 0;
  private _dpr = 1;
  private _destroyed = false;
  private _paused = false;

  /**
   * 当前帧内 drawChar 的调用计数(0.4.1+ 修复 P0-1)
   * beginFrame() 重置, drawChar 每次写完 ++.
   * render() 用 draw(4, _drawCallIdx) 作为实际 instance 数.
   */
  private _drawCallIdx = 0;

  private _warnedMissing = false;

  // ============ Lifecycle ============

  async init(canvas: HTMLCanvasElement, state: MatrixRainState): Promise<void> {
    if (this._destroyed) {
      throw new Error('[WebGPURenderer] init() called after destroy()');
    }

    // 1. Request adapter (async!)
    const gpu = (navigator as unknown as GpuNavigator).gpu;
    if (!gpu) {
      throw new Error('[WebGPURenderer] WebGPU not supported (navigator.gpu undefined)');
    }
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('[WebGPURenderer] Failed to get GPUAdapter');
    }
    this._device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: 256 * 1024 * 1024, // 256MB for 8M cells
      },
    });
    this._queue = this._device.queue;

    // 2. Configure GPUCanvasContext (connects canvas to device)
    const ctx = canvas.getContext('webgpu') as unknown as GPUCanvasContext;
    if (!ctx) {
      throw new Error('[WebGPURenderer] canvas.getContext("webgpu") failed');
    }
    this._ctx = ctx;
    const format = gpu.getPreferredCanvasFormat();
    ctx.configure({
      device: this._device,
      format,
      alphaMode: 'premultiplied',
    });

    // 3. Load atlas
    const atlasJsonUrl =
      (state as unknown as { __atlasJsonUrl?: string }).__atlasJsonUrl ??
      '/atlas/jetbrains-mono-32.json';
    const atlasPngUrl =
      (state as unknown as { __atlasPngUrl?: string }).__atlasPngUrl ??
      '/atlas/jetbrains-mono-32.png';
    const atlasJson = await loadAtlasJson(atlasJsonUrl);
    if (!isAtlasJson(atlasJson)) {
      throw new Error('[WebGPURenderer] atlas JSON failed schema validation');
    }
    this._atlasJson = atlasJson;
    this._atlasLookup = buildAtlasLookup(atlasJson);
    this._charsetMap = buildCharsetMap(state.charset, atlasJson);

    const missing = findMissingChars(state.charset, atlasJson);
    if (missing.length > 0 && !this._warnedMissing) {
      console.warn(
        `[WebGPURenderer] ${missing.length} chars not in atlas (showing blank):`,
        missing.slice(0, 10).join('') + (missing.length > 10 ? '...' : '')
      );
      this._warnedMissing = true;
    }

    // 4. Upload atlas texture
    await this._uploadAtlasTexture(this._device, this._queue, atlasPngUrl);

    // 5. Create bind group layouts
    this._createBindGroupLayouts(this._device);

    // 6. Allocate buffers
    this._allocateBuffers(this._device, state.r, state.i);

    // 7. Create pipelines
    this._createPipelines(this._device, format);

    // 8. Create bind groups
    this._createBindGroups(this._device);

    // 0.4.1+ 修复: engine 不 await init(), 用此标志告诉 render/beginFrame/drawChar 现在可以工作
    this._initialized = true;
  }

  resize(w: number, h: number, dpr: number): void {
    if (this._destroyed || !this._device) return;
    this._w = w;
    this._h = h;
    this._dpr = dpr;
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
    if (this._destroyed || this._paused || !this._device || !this._queue) return;
    if (!this._initialized) return; // init 还没完成
    if (this._drawCallIdx === 0) return;
    if (!this._ctx || !this._instanceData) return;
    // state 暂未在 render 中用到(0.4.1+ 移除 compute warmth 之后),保留参数为接口一致
    void state;

    const device = this._device;
    const queue = this._queue;

    // 1. Update vertex uniform buffer (viewport + cellSize)
    this._updateVertexUniforms();

    // 2. Upload instance buffer 的"用到的部分"
    queue.writeBuffer(
      this._instanceBuffer!,
      0,
      this._instanceData.buffer as ArrayBuffer,
      this._instanceData.byteOffset,
      this._drawCallIdx * INSTANCE_STRIDE_FLOATS * 4
    );

    // 3. Create command encoder
    const encoder = device.createCommandEncoder();

    // 4. Render pass (0.4.1+: 移除 fake compute pass, 直接 render)
    const currentTexture = this._ctx.getCurrentTexture();
    const textureView = currentTexture.createView() as GPUTextureView;

    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    // 4a. Trail (full-screen fade quad)
    renderPass.setPipeline(this._trailPipeline!);
    renderPass.setBindGroup(0, this._trailBindGroup!);
    renderPass.draw(4);

    // 4b. Character instanced draw — 本帧实际写入的 cell 数
    renderPass.setPipeline(this._renderPipeline!);
    renderPass.setVertexBuffer(0, this._instanceBuffer!);
    renderPass.setBindGroup(0, this._renderBindGroup!);
    renderPass.draw(4, this._drawCallIdx);

    renderPass.end();

    // 5. Submit
    queue.submit([encoder.finish() as GPUCommandBuffer]);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._ctx) {
      this._ctx.unconfigure();
    }
    if (this._device) {
      this._device.destroy();
    }
    this._device = null;
    this._queue = null;
    this._instanceData = null;
    this._ctx = null;
  }

  pause(): void {
    this._paused = true;
  }

  resume(): void {
    this._paused = false;
  }

  // ============ Drawing surface (per-cell / per-frame) ============

  drawTrail(r: number, g: number, b: number, a: number): void {
    if (this._paused) return;
    // 直接更新 trail uniform buffer
    if (this._queue && this._trailColorBuffer) {
      this._queue.writeBuffer(
        this._trailColorBuffer,
        0,
        new Float32Array([r / 255, g / 255, b / 255, a])
      );
    }
  }

  setFontSize(px: number): void {
    // 0.4.1+: cellSize 跟随 fontSize 缩放 (atlas 仍 bake 在 32px, sampler 自动 downscale)
    if (this._device) {
      this._cellSizePx = px * this._dpr;
    }
  }

  setCharset(s: string): void {
    this._charset = s;
    if (this._atlasJson) {
      this._charsetMap = buildCharsetMap(s, this._atlasJson);
    }
  }

  drawChar(ch: number, cx: number, cy: number, r: number, g: number, b: number, a: number): void {
    if (!this._instanceData || this._paused) return;
    if (!this._initialized) return; // init 还没完成
    // 0.4.1+ 修复 P0-1: ch 是 charset index, 槽位用 _drawCallIdx
    const slotOff = this._drawCallIdx * INSTANCE_STRIDE_FLOATS;
    if (slotOff + INSTANCE_STRIDE_FLOATS > this._instanceData.length) return; // 容量守卫

    const chStr = this._charset[ch];
    if (!chStr) return;
    const code = chStr.charCodeAt(0);
    const atlasIdx = this._charsetMap?.get(code) ?? 0;
    const uv = this._atlasLookup?.get(code);

    const buf = this._instanceData;
    buf[slotOff + 0] = cx * this._dpr;
    buf[slotOff + 1] = cy * this._dpr;
    buf[slotOff + 2] = atlasIdx;
    buf[slotOff + 3] = 0;
    buf[slotOff + 4] = r / 255;
    buf[slotOff + 5] = g / 255;
    buf[slotOff + 6] = b / 255;
    buf[slotOff + 7] = a;
    buf[slotOff + 8] = uv?.u0 ?? 0;
    buf[slotOff + 9] = uv?.v0 ?? 0;
    buf[slotOff + 10] = uv?.u1 ?? 1;
    buf[slotOff + 11] = uv?.v1 ?? 1;

    this._drawCallIdx++;
  }

  // ============ Internal: Atlas Upload (Task 1.1) ============

  private async _uploadAtlasTexture(
    device: GPUDevice,
    queue: GPUQueue,
    pngUrl: string
  ): Promise<void> {
    const resp = await fetch(pngUrl);
    if (!resp.ok) {
      throw new Error(`[WebGPURenderer] atlas PNG fetch failed: ${resp.status}`);
    }
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob, {
      premultiplyAlpha: 'none',
      imageOrientation: 'none',
    });

    const tex = device.createTexture({
      size: { width: bitmap.width, height: bitmap.height },
      format: 'rgba8unorm' as GPUTextureFormat,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture: tex as unknown as GPUTexture },
      { width: bitmap.width, height: bitmap.height }
    );

    this._atlasTex = tex;

    this._sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  }

  // ============ Internal: Bind Group Layouts (0.4.1+: 移除 compute) ============

  private _createBindGroupLayouts(device: GPUDevice): void {
    // Render bind group layout: uniform viewport + atlas texture + sampler
    this._renderBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
    });

    // Trail bind group layout: uniform trail color
    this._trailBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });
  }

  // ============ Internal: Bind Groups (Task 1.3) ============

  private _createBindGroups(device: GPUDevice): void {
    if (!this._vertexUniformsBuffer || !this._atlasTex || !this._sampler) return;
    if (!this._trailColorBuffer) return;

    // Render bind group
    this._renderBindGroup = device.createBindGroup({
      layout: this._renderBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: this._vertexUniformsBuffer } },
        { binding: 1, resource: this._atlasTex.createView() as GPUTextureView },
        { binding: 2, resource: this._sampler },
      ],
    });

    // Trail bind group
    this._trailBindGroup = device.createBindGroup({
      layout: this._trailBindGroupLayout!,
      entries: [{ binding: 0, resource: { buffer: this._trailColorBuffer } }],
    });
  }

  // ============ Internal: Pipelines (0.4.1+: 移除 compute pipeline) ============

  private _createPipelines(device: GPUDevice, format: string): void {
    // Render pipeline (instanced draw)
    const vsModule = device.createShaderModule({ code: RENDER_VERTEX_SHADER });
    const fsModule = device.createShaderModule({ code: RENDER_FRAGMENT_SHADER });
    const renderLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._renderBindGroupLayout!],
    });
    this._renderPipeline = device.createRenderPipeline({
      layout: renderLayout,
      vertex: {
        module: vsModule,
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: INSTANCE_STRIDE_BYTES,
            stepMode: 'instance',
            attributes: [
              { format: 'float32x2', offset: 0, shaderLocation: 0 },
              { format: 'float32', offset: 8, shaderLocation: 1 },
              { format: 'float32x4', offset: 12, shaderLocation: 2 },
              { format: 'float32x2', offset: 28, shaderLocation: 3 },
              { format: 'float32x2', offset: 36, shaderLocation: 4 },
            ],
          },
        ],
      },
      fragment: {
        module: fsModule,
        entryPoint: 'main',
        targets: [
          {
            format: format as GPUTextureFormat,
            blend: {
              color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-strip' },
    });

    // Trail pipeline (full-screen fade)
    const trailVs = device.createShaderModule({ code: TRAIL_VERTEX_SHADER });
    const trailFs = device.createShaderModule({ code: TRAIL_FRAGMENT_SHADER });
    const trailLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._trailBindGroupLayout!],
    });
    this._trailPipeline = device.createRenderPipeline({
      layout: trailLayout,
      vertex: { module: trailVs, entryPoint: 'main', buffers: [] },
      fragment: {
        module: trailFs,
        entryPoint: 'main',
        targets: [
          {
            format: format as GPUTextureFormat,
            blend: {
              color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  // ============ Internal: Buffers ============

  private _allocateBuffers(device: GPUDevice, cols: number, rows: number): void {
    const count = cols * rows;
    if (count === 0) return;

    // Instance buffer (per-frame, per-cell data for drawChar)
    this._instanceData = new Float32Array(count * INSTANCE_STRIDE_FLOATS);
    this._instanceBuffer = device.createBuffer({
      size: this._instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // Uniform buffers (0.4.1+: 移除 cellsBuffer + warmthParamsBuffer)
    this._vertexUniformsBuffer = device.createBuffer({
      size: VERTEX_UNIFORMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._trailColorBuffer = device.createBuffer({
      size: TRAIL_COLOR_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /** 更新 vertex shader 的 viewport + cellSize */
  private _updateVertexUniforms(): void {
    if (!this._queue || !this._vertexUniformsBuffer) return;

    const data = new Float32Array([
      this._w * this._dpr, // viewport.x
      this._h * this._dpr, // viewport.y
      this._cellSizePx, // cellSize
      0, // _pad
    ]);

    this._queue.writeBuffer(this._vertexUniformsBuffer, 0, data);
  }

  /** Public hook: 引擎 resize grid 时重新分配 instance buffer */
  public resizeGrid(cols: number, rows: number): void {
    if (!this._device || this._destroyed) return;
    if (!this._initialized) return; // init() 还没建好 GPU resources

    // 重新分配 instance buffer (CPU + GPU)
    const count = cols * rows;
    if (count === 0) {
      this._instanceData = null;
      return;
    }
    this._instanceData = new Float32Array(count * INSTANCE_STRIDE_FLOATS);

    // 重建 GPU buffer (不能 resize, 只能新建)
    this._instanceBuffer = this._device.createBuffer({
      size: this._instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    // 注: render/trail bindgroup 只引用 vertexUniformsBuffer + atlas + sampler + trailColorBuffer
    //     都没换, 不必重建 bindgroup. instanceBuffer 通过 setVertexBuffer 直接挂入 render pass.
  }
}
