/**
 * @xietuier/matrix-rain · WebGPU Renderer (0.4.0+ Phase 4, 0.5.0 重建 compute)
 *
 * **职责**: 8K+fontSize 2 等极端场景下,GPU 并行 warmth 阻尼 + instanced 渲染
 * - WebGPU compute shader 跑 warmth 阻尼(并行,1-2ms for 8M cells)
 * - vertex shader 读 compute 写的 warmth 调色,完整闭环
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
  createHealthTracker,
  recordHealthError,
  snapshotHealth,
  tickDroppedFrames,
  type RendererHealth,
} from './health';
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
  COMPUTE_WARMTH_SHADER,
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
  type GPUComputePipeline,
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
/**
 * WarmthParams uniform: 12 floats = 48 bytes (16-byte 对齐要求)
 * 字段顺序必须与 WGSL struct 一致。
 */
const WARMTH_PARAMS_SIZE = 48;

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

  /** Pipelines (0.5.0+: 恢复 compute pass, render + trail + compute 三件套) */
  private _renderPipeline: GPURenderPipeline | null = null;
  private _trailPipeline: GPURenderPipeline | null = null;
  private _computePipeline: GPUComputePipeline | null = null;

  /** Bind group layouts */
  private _renderBindGroupLayout: GPUBindGroupLayout | null = null; // group(0) for render
  private _trailBindGroupLayout: GPUBindGroupLayout | null = null;
  private _computeBindGroupLayout: GPUBindGroupLayout | null = null;
  private _renderCellsBindGroupLayout: GPUBindGroupLayout | null = null; // group(1) for render

  /** Bind groups */
  private _renderBindGroup: GPUBindGroup | null = null;
  private _trailBindGroup: GPUBindGroup | null = null;
  private _computeBindGroup: GPUBindGroup | null = null;
  private _renderCellsBindGroup: GPUBindGroup | null = null;

  /** Buffers */
  private _instanceBuffer: GPUBuffer | null = null;
  private _vertexUniformsBuffer: GPUBuffer | null = null;
  private _trailColorBuffer: GPUBuffer | null = null;
  private _cellsBuffer: GPUBuffer | null = null; // compute 写,vertex 读
  private _warmthParamsBuffer: GPUBuffer | null = null;

  /** atlas texture + sampler */
  private _atlasTex: GPUTexture | null = null;
  private _sampler: GPUSampler | null = null;

  /** GPUCanvasContext (从 canvas.getContext('webgpu') 获取) */
  private _ctx: GPUCanvasContext | null = null;

  /** Per-frame CPU data */
  private _instanceData: Float32Array | null = null;
  private _instanceCount = 0; // cols * rows, 决定 cells buffer 长度
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

  /** 0.6.0+ 渲染器健康跟踪(每帧 popErrorScope + drawCallIdx 断言) */
  private _health = createHealthTracker('webgpu');

  // ============ Lifecycle ============

  async init(canvas: HTMLCanvasElement, state: MatrixRainState): Promise<void> {
    if (this._destroyed) {
      throw new Error('[WebGPURenderer] init() called after destroy()');
    }

    // 0.6.0+: 记录 init 起止时间,失败时入 health.lastInitError
    const initStart = performance.now();
    try {
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

      // 0.7.1+ P0-2 修复: device.lost 监听 — WebGPU 设备丢失后无监听会静默黑屏
      // - 记录 health.contextLostCount + DEVICE_LOST:<reason>
      // - 标记未初始化 (render/beginFrame 跳过空帧, 不再让 GPU 调用打在失效设备上)
      // - 恢复策略: WebGPU 无 context-restored 等价事件, 由引擎层 enableAutoFallback
      //   (A3) 在 init 失败/丢失后切 canvas2d 兜底
      this._device.lost.then((info) => {
        this._initialized = false;
        this._health.contextLostCount++;
        recordHealthError(this._health, 'DEVICE_LOST:' + (info.reason || 'unknown'));
        this._health.lastInitError = 'DEVICE_LOST:' + (info.reason || 'unknown');
      });

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

      // 9. 初始化 cellsBuffer 为 0(compute 第一次跑需要非 undefined 内存)
      // 0.5.0 修复 P0-3 (原 0.4.0 compute buffer 创建后从未写入,首次 dispatch 读 undefined 内存)
      if (this._cellsBuffer && this._queue) {
        this._queue.writeBuffer(this._cellsBuffer, 0, new Float32Array(this._instanceCount));
      }

      // 0.4.1+ 修复: engine 不 await init(), 用此标志告诉 render/beginFrame/drawChar 现在可以工作
      this._initialized = true;
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
    // 0.7.1+ F-4: 资源字段(atlas 纹理 1 个)
    this._health.textureCount = 1;
    this._updateGpuMemoryHealth();
  }

  resize(w: number, h: number, dpr: number): void {
    if (this._destroyed || !this._device) return;
    this._w = w;
    this._h = h;
    this._dpr = dpr;
  }

  /**
   * 0.7.1+ F-4: 更新 health 的 GPU 显存估算
   * = instance (r×i×48B) + cells (r×i×4B) + uniforms (固定 3 个小 buffer) + atlas (1024²×4B)
   */
  private _updateGpuMemoryHealth(): void {
    const atlasBytes = 1024 * 1024 * 4;
    const cells = this._cellsBuffer
      ? (this as unknown as { _instanceCount: number })._instanceCount * 4
      : 0;
    const instance = this._instanceData ? this._instanceData.byteLength : 0;
    this._health.gpuMemoryBytes = instance + cells + atlasBytes + 256;
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
    void _dt;

    const device = this._device;
    const queue = this._queue;

    // 0.6.0+: 帧起点测耗时 + 帧数 + 同步 grid dims + drawCallIdx 断言
    const frameStart = performance.now();
    this._health.frameCount++;
    this._health.drawCallIdx = this._drawCallIdx;
    this._health.gridCols = state.r;
    this._health.gridRows = state.i;
    this._health.instanceCount = this._drawCallIdx;
    const expectedInstances = state.r * state.i;
    if (this._drawCallIdx !== expectedInstances) {
      recordHealthError(this._health, 'INSTANCE_COUNT_MISMATCH');
    }

    // 0.6.0+: 在 device 上开 validation error scope,捕获 submit 期间的 validation error
    device.pushErrorScope('validation');

    // 1. Update uniforms (vertex + warmth params)
    this._updateVertexUniforms();
    this._updateWarmthParams(state);

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

    // 4. 0.5.0+ 恢复: Compute pass (warmth 阻尼并行计算)
    //    dispatch 后 cells 写入新 warmth, render pass 紧接其后会读
    if (this._computePipeline && this._computeBindGroup && this._instanceCount > 0) {
      const computePass = encoder.beginComputePass();
      computePass.setPipeline(this._computePipeline);
      computePass.setBindGroup(0, this._computeBindGroup);
      const workgroupCount = Math.ceil(this._instanceCount / 64);
      computePass.dispatchWorkgroups(workgroupCount);
      computePass.end();
    }

    // 5. Render pass
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

    // 5a. Trail (full-screen fade quad)
    renderPass.setPipeline(this._trailPipeline!);
    renderPass.setBindGroup(0, this._trailBindGroup!);
    renderPass.draw(4);

    // 5b. Character instanced draw — 本帧实际写入的 cell 数
    //     0.5.0+: 额外 setBindGroup(1, _renderCellsBindGroup) 让 vertex shader 读 cells warmth
    renderPass.setPipeline(this._renderPipeline!);
    renderPass.setVertexBuffer(0, this._instanceBuffer!);
    renderPass.setBindGroup(0, this._renderBindGroup!);
    if (this._renderCellsBindGroup) {
      renderPass.setBindGroup(1, this._renderCellsBindGroup);
    }
    renderPass.draw(4, this._drawCallIdx);

    renderPass.end();

    // 6. Submit
    queue.submit([encoder.finish() as GPUCommandBuffer]);

    // 0.6.0+: popErrorScope() 异步返回 GPUError|null
    //   - 不 await,不阻塞 rAF(微任务排队)
    //   - 在 next microtask 完成时把错误写回 health.lastErrorScope
    //   - 0.6.0 修 race: 跨帧 push/pop 不匹配时,popErrorScope 抛
    //     "tried to pop error scope that was never pushed",catch 后记到 lastInitError
    device.popErrorScope().then(
      (err) => {
        if (err) {
          recordHealthError(this._health, err.message);
        }
      },
      (popErr: unknown) => {
        // 跨帧 race / device destroyed
        const msg = popErr instanceof Error ? popErr.message : String(popErr);
        this._health.lastErrorScope = `popErrorScope rejected: ${msg}`;
      }
    );
    this._health.lastFrameDurationMs = performance.now() - frameStart;
    tickDroppedFrames(this._health, state.fps);
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

  // 0.6.0+: 渲染器健康快照
  getHealth(): RendererHealth {
    return snapshotHealth(this._health);
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
    // 0.7.1+ P1-4: pad 槽改写 gridIdx — 暗格跳过时 instance 序号 ≠ grid 索引,
    // vertex shader 需按 gridIdx 索引 warmth 数据(不再用 instance_index)
    buf[slotOff + 3] = gridIdx ?? this._drawCallIdx;
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

    // 0.7.1+ P0-4: GPU API 可能返回 null (设备丢失/超限), 后续使用会静默渲染失败
    if (!tex) {
      throw new Error('[WebGPURenderer] createTexture(atlas) returned null');
    }

    this._atlasTex = tex;

    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    if (!sampler) {
      throw new Error('[WebGPURenderer] createSampler returned null');
    }
    this._sampler = sampler;
  }

  // ============ Internal: Bind Group Layouts (0.5.0+: compute + render group(1) cells) ============

  private _createBindGroupLayouts(device: GPUDevice): void {
    // Render bind group layout @group(0): uniform viewport + atlas texture + sampler
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

    // Render bind group layout @group(1): cells storage buffer (vertex shader 读 warmth)
    // 0.5.0+: 这是 P0-2 修复关键 —— compute 输出 cells, vertex shader 在这里读出来调色
    this._renderCellsBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
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

    // Compute bind group layout: cells storage(rw) + params uniform
    // 0.5.0 修复 P0-4: cells 必须是 `type: 'storage'`(可读写),与 WGSL `read_write` 配对
    this._computeBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
      ],
    });
  }

  // ============ Internal: Bind Groups (0.5.0+: +compute +render@1 cells) ============

  private _createBindGroups(device: GPUDevice): void {
    if (!this._vertexUniformsBuffer || !this._atlasTex || !this._sampler) return;
    if (!this._trailColorBuffer || !this._cellsBuffer || !this._warmthParamsBuffer) return;

    // Render bind group @group(0)
    const renderBg = device.createBindGroup({
      layout: this._renderBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: this._vertexUniformsBuffer } },
        { binding: 1, resource: this._atlasTex.createView() as GPUTextureView },
        { binding: 2, resource: this._sampler },
      ],
    });
    if (!renderBg) throw new Error('[WebGPURenderer] createBindGroup(render) returned null');
    this._renderBindGroup = renderBg;

    // Render bind group @group(1): cells storage (vertex shader 读 warmth)
    const cellsBg = device.createBindGroup({
      layout: this._renderCellsBindGroupLayout!,
      entries: [{ binding: 0, resource: { buffer: this._cellsBuffer } }],
    });
    if (!cellsBg) throw new Error('[WebGPURenderer] createBindGroup(renderCells) returned null');
    this._renderCellsBindGroup = cellsBg;

    // Trail bind group
    const trailBg = device.createBindGroup({
      layout: this._trailBindGroupLayout!,
      entries: [{ binding: 0, resource: { buffer: this._trailColorBuffer } }],
    });
    if (!trailBg) throw new Error('[WebGPURenderer] createBindGroup(trail) returned null');
    this._trailBindGroup = trailBg;

    // Compute bind group: cells(rw) + params
    const computeBg = device.createBindGroup({
      layout: this._computeBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: this._cellsBuffer } },
        { binding: 1, resource: { buffer: this._warmthParamsBuffer } },
      ],
    });
    if (!computeBg) throw new Error('[WebGPURenderer] createBindGroup(compute) returned null');
    this._computeBindGroup = computeBg;
  }

  // ============ Internal: Pipelines (0.5.0+: +compute pipeline) ============

  private _createPipelines(device: GPUDevice, format: string): void {
    // Render pipeline (instanced draw)
    const vsModule = device.createShaderModule({ code: RENDER_VERTEX_SHADER });
    const fsModule = device.createShaderModule({ code: RENDER_FRAGMENT_SHADER });
    // 0.5.0+: render pipeline 用 2 个 bind group(@group(0) uniforms/atlas, @group(1) cells)
    const renderLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._renderBindGroupLayout!, this._renderCellsBindGroupLayout!],
    });
    const renderPipeline = device.createRenderPipeline({
      layout: renderLayout,
      vertex: {
        module: vsModule,
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: INSTANCE_STRIDE_BYTES,
            stepMode: 'instance',
            attributes: [
              // 0.7.1+ P1-4: loc1 改 vec2 (charIdx + gridIdx), color 从 16 起 —
              // 消除旧布局中 color@12 覆盖 pad 槽导致的通道错位隐患
              { format: 'float32x2', offset: 0, shaderLocation: 0 },
              { format: 'float32x2', offset: 8, shaderLocation: 1 },
              { format: 'float32x4', offset: 16, shaderLocation: 2 },
              { format: 'float32x2', offset: 32, shaderLocation: 3 },
              { format: 'float32x2', offset: 40, shaderLocation: 4 },
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
    if (!renderPipeline)
      throw new Error('[WebGPURenderer] createRenderPipeline(render) returned null');
    this._renderPipeline = renderPipeline;

    // Trail pipeline (full-screen fade)
    const trailVs = device.createShaderModule({ code: TRAIL_VERTEX_SHADER });
    const trailFs = device.createShaderModule({ code: TRAIL_FRAGMENT_SHADER });
    const trailLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._trailBindGroupLayout!],
    });
    const trailPipeline = device.createRenderPipeline({
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
    if (!trailPipeline)
      throw new Error('[WebGPURenderer] createRenderPipeline(trail) returned null');
    this._trailPipeline = trailPipeline;

    // 0.5.0+ 恢复: compute pipeline (warmth 阻尼并行计算)
    const computeModule = device.createShaderModule({ code: COMPUTE_WARMTH_SHADER });
    const computeLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._computeBindGroupLayout!],
    });
    const computePipeline = device.createComputePipeline({
      layout: computeLayout,
      compute: {
        module: computeModule,
        entryPoint: 'main',
      },
    });
    if (!computePipeline) throw new Error('[WebGPURenderer] createComputePipeline returned null');
    this._computePipeline = computePipeline;
  }

  // ============ Internal: Buffers ============

  private _allocateBuffers(device: GPUDevice, cols: number, rows: number): void {
    const count = cols * rows;
    this._instanceCount = count;
    if (count === 0) return;

    // Instance buffer (per-frame, per-cell data for drawChar)
    this._instanceData = new Float32Array(count * INSTANCE_STRIDE_FLOATS);
    const instanceBuffer = device.createBuffer({
      size: this._instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    if (!instanceBuffer) throw new Error('[WebGPURenderer] createBuffer(instance) returned null');
    this._instanceBuffer = instanceBuffer;

    // Cells storage buffer (compute 写, vertex 读)
    // 0.5.0+: 1 f32/cell, 8.4M cells × 4 bytes = 32MB(原 0.4.0 nested-struct 256MB)
    const cellsBuffer = device.createBuffer({
      size: count * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    if (!cellsBuffer) throw new Error('[WebGPURenderer] createBuffer(cells) returned null');
    this._cellsBuffer = cellsBuffer;

    // Uniform buffers
    const vertexUniforms = device.createBuffer({
      size: VERTEX_UNIFORMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    if (!vertexUniforms)
      throw new Error('[WebGPURenderer] createBuffer(vertexUniforms) returned null');
    this._vertexUniformsBuffer = vertexUniforms;
    const trailColor = device.createBuffer({
      size: TRAIL_COLOR_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    if (!trailColor) throw new Error('[WebGPURenderer] createBuffer(trailColor) returned null');
    this._trailColorBuffer = trailColor;
    const warmthParams = device.createBuffer({
      size: WARMTH_PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    if (!warmthParams) throw new Error('[WebGPURenderer] createBuffer(warmthParams) returned null');
    this._warmthParamsBuffer = warmthParams;
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

  /**
   * 0.5.0+ 修复 P0-6: warmth params 从 state.cfg 读取,不再硬编码
   *
   * 字段顺序必须与 WGSL `WarmthParams` struct 严格一致(12 floats = 48 bytes,16-byte 对齐):
   *   lightCenterX, lightCenterY, driftSpeedX, driftSpeedY,
   *   warmthRadius, warmthLerp, gridRows, gridCols,
   *   wallTime, _pad0, _pad1, _pad2
   */
  private _updateWarmthParams(state: MatrixRainState): void {
    if (!this._queue || !this._warmthParamsBuffer) return;
    if (this._instanceCount === 0) return;

    const data = new Float32Array([
      state.lightCenter.x, // 0: lightCenterX
      state.lightCenter.y, // 1: lightCenterY
      state.driftSpeed.x, // 2: driftSpeedX
      state.driftSpeed.y, // 3: driftSpeedY
      state.cfg.warmthRadius, // 4: warmthRadius
      state.cfg.warmthLerp, // 5: warmthLerp
      state.i, // 6: gridRows (= state.i)
      state.r, // 7: gridCols (= state.r)
      state.wallTime, // 8: wallTime (驱动 light drift)
      0, // 9: _pad0
      0, // 10: _pad1
      0, // 11: _pad2
    ]);

    this._queue.writeBuffer(this._warmthParamsBuffer, 0, data);
  }

  /** Public hook: 引擎 resize grid 时重新分配 instance buffer */
  public resizeGrid(cols: number, rows: number): void {
    if (!this._device || this._destroyed) return;
    // 0.4.3 修复: buildGrid 在 init() 返回前调 resizeGrid 重新分配 instance buffer.
    //   之前的 _initialized 守卫把这次调用挡掉 → _instanceBuffer 保持 init 时按
    //   0×0 分配的小 buffer → drawChar 全部 silent skip → 屏幕只剩残影拖尾.
    // 重新分配 instance buffer (CPU + GPU)
    const count = cols * rows;
    this._instanceCount = count;
    if (count === 0) {
      this._instanceData = null;
      return;
    }
    this._instanceData = new Float32Array(count * INSTANCE_STRIDE_FLOATS);

    // 重建 GPU buffer (不能 resize, 只能新建)
    const newInstanceBuffer = this._device.createBuffer({
      size: this._instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    if (!newInstanceBuffer)
      throw new Error('[WebGPURenderer] resizeGrid: createBuffer(instance) returned null');
    this._instanceBuffer = newInstanceBuffer;
    // 注: render/trail bindgroup 只引用 vertexUniformsBuffer + atlas + sampler + trailColorBuffer
    //     都没换, 不必重建 bindgroup. instanceBuffer 通过 setVertexBuffer 直接挂入 render pass.

    // 0.5.0+: cells storage buffer 也要重建 + 重新写 0(compute 需要非 undefined 内存)
    //     bindgroup 也要重建(cells buffer 引用变了)
    if (this._cellsBuffer) this._cellsBuffer.destroy();
    const newCellsBuffer = this._device.createBuffer({
      size: count * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    if (!newCellsBuffer)
      throw new Error('[WebGPURenderer] resizeGrid: createBuffer(cells) returned null');
    this._cellsBuffer = newCellsBuffer;
    if (this._queue) {
      this._queue.writeBuffer(this._cellsBuffer, 0, new Float32Array(count));
    }
    // 重绑 cells 到 render@group(1) + compute@group(0)
    this._createBindGroups(this._device);
    // 0.7.1+ F-4: buffer 重建后刷新显存估算
    this._updateGpuMemoryHealth();
  }
}
