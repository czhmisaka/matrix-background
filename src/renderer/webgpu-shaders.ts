/**
 * @xietuier/matrix-rain · WebGPU Shaders (WGSL) (0.4.0+ Phase 4)
 *
 * **架构**:
 * 1. **Compute shader** (`warmth.wgsl`): 每帧并行更新 cell.warmth
 *    - 8.4M cells × 60fps 跑 compute 不可能慢 (1-2ms)
 * 2. **Render pipeline** (vertex + fragment): instanced draw, 共享 atlas
 * 3. **Bind groups**:
 *    - Compute: @group(0) @binding(0) cells (storage, read_only)
 *                @group(0) @binding(1) params (uniform)
 *    - Render:  @group(0) @binding(0) uniforms (uniform, 16 bytes)
 *                @group(0) @binding(1) atlasTex (texture_2d)
 *                @group(0) @binding(2) atlasSampler (sampler)
 *    - Trail:   @group(0) @binding(0) trailColor (uniform, vec4)
 *
 * **WGSL 规范要求**:
 * - runtime-sized array 不能嵌套在 struct 内，必须直接声明为顶层 var 类型
 * - uniform buffer 字段必须 16-byte 对齐
 *
 * @since 0.4.0
 */

/**
 * Compute shader · 并行更新 cell.warmth
 *
 * @deprecated 0.4.1+: WebGPU 渲染器已移除 compute pass(原实现 cellsBuffer
 *   未写入、render bindgroup 未挂载 cells、layout `read-only-storage` 与
 *   WGSL `read_write` 不兼容,真 Chrome 113+ 会在 createComputePipeline()
 *   抛 ValidationError)。compute warmth 留到 0.5.0 重新设计。当前 export
 *   仅为向后兼容(避免 tsup tree-shake 警告与第三方反序列化失败)。
 *
 * 历史算法 (与 draw-helpers.ts 中的 CPU 路径保持 100% 一致):
 *   C = h - M, A = s - p
 *   B = sqrt(C² + A²)
 *   H = max(0, 1 - B / (rows * warmthRadius))
 *   warmth += (H - warmth) * warmthLerp
 *
 * WGSL: @compute + @workgroup_size(64)  (GPU 一次处理 64 cells)
 */
export const COMPUTE_WARMTH_SHADER = /* wgsl */ `
struct Cell {
  bright: f32,
  phase: f32,
  warmth: f32,
  speed: f32,
  yPos: f32,
  headBright: f32,
  ch: u32,
  locked: u32,
}

// runtime-sized array 必须直接声明，不嵌套在 struct 内（WGSL 规范）
@group(0) @binding(0) var<storage, read_write> cells: array<Cell>;

struct WarmthParams {
  lightCenterX: f32,
  lightCenterY: f32,
  driftSpeedX: f32,
  driftSpeedY: f32,
  warmthRadius: f32,
  warmthLerp: f32,
  gridRows: f32,
  gridCols: f32,
  wallTime: f32,
  targetActive: u32,
  _pad0: u32,  // 对齐填充
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(1) var<uniform> params: WarmthParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= arrayLength(&cells)) { return; }

  let s = f32(idx) / params.gridCols;
  let h = f32(idx) - s * params.gridCols;
  let lightX = params.lightCenterX * params.gridCols +
    cos(params.wallTime * params.driftSpeedX * 60.0) * params.gridCols * 0.2;
  let lightY = params.lightCenterY * params.gridRows +
    sin(params.wallTime * params.driftSpeedY * 60.0) * params.gridRows * 0.2;
  let C = h - lightX;
  let A = s - lightY;
  let B = sqrt(C * C + A * A);
  let H = max(0.0, 1.0 - B / (params.gridRows * params.warmthRadius));

  // 读取当前值，计算新值，写回
  let old = cells[idx].warmth;
  cells[idx].warmth = old + (H - old) * params.warmthLerp;
}
`;

/**
 * Vertex shader · instanced draw
 *
 * 与 WebGL2 vertex shader 功能完全一致：
 * - 4 顶点 triangle-strip quad (vertex_index 0-3)
 * - 每个实例有 12 个 float (48 bytes): [pos.xy, charIdx, pad, color.rgba, uv0.xy, uv1.xy]
 * - 输出 clip-space position + atlas UV + fragment color
 */
export const RENDER_VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
}

struct VertexUniforms {
  viewport: vec2<f32>,
  cellSize: f32,
  _pad: f32,  // 16-byte 对齐填充
}

@group(0) @binding(0) var<uniform> uniforms: VertexUniforms;

struct InstanceInput {
  @location(0) pos: vec2<f32>,
  @location(1) charIdx: f32,
  @location(2) color: vec4<f32>,
  @location(3) uv0: vec2<f32>,
  @location(4) uv1: vec2<f32>,
}

@vertex
fn main(input: InstanceInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
  // 4-vertex triangle-strip quad
  let quadU = select(0.0, 1.0, vid == 1u || vid == 3u);
  let quadV = select(0.0, 1.0, vid == 2u || vid == 3u);

  var output: VertexOutput;
  output.uv = mix(input.uv0, input.uv1, vec2<f32>(quadU, quadV));
  output.color = input.color;

  // 计算角落坐标 (左上角为 origin, +x 右, +y 下)
  let corner = input.pos + vec2<f32>(
    (quadU - 0.5) * uniforms.cellSize,
    (quadV - 0.5) * uniforms.cellSize
  );
  // NDC 变换 (0..viewport → -1..+1, Y 轴翻转)
  let ndc = (corner / uniforms.viewport) * 2.0 - vec2<f32>(1.0);
  output.position = vec4<f32>(ndc.x, -ndc.y, 0.0, 1.0);
  return output;
}
`;

/**
 * Fragment shader · 采样 atlas 纹理 alpha，乘 color
 *
 * 与 WebGL2 fragment shader 功能完全一致
 */
export const RENDER_FRAGMENT_SHADER = /* wgsl */ `
@group(0) @binding(1) var atlasTex: texture_2d<f32>;
@group(0) @binding(2) var atlasSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
  let mask = textureSample(atlasTex, atlasSampler, input.uv).a;
  return vec4<f32>(input.color.rgb, input.color.a * mask);
}
`;

/** Trail (全屏 fade) shader — 与 WebGL2 trail 功能完全一致 */
export const TRAIL_VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
}

@vertex
fn main(@builtin(vertex_index) vid: u32) -> VertexOutput {
  // ND 全屏 quad: 4 顶点 triangle-strip
  let x = select(-1.0, 1.0, vid == 1u || vid == 3u);
  let y = select(-1.0, 1.0, vid == 2u || vid == 3u);
  var output: VertexOutput;
  output.position = vec4<f32>(x, y, 0.0, 1.0);
  return output;
}
`;

export const TRAIL_FRAGMENT_SHADER = /* wgsl */ `
@group(0) @binding(0) var<uniform> trailColor: vec4<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
}

@fragment
fn main(_input: VertexOutput) -> @location(0) vec4<f32> {
  return trailColor;
}
`;

/** instance stride (与 WebGL2 一致: 12 floats / 48 bytes) */
export const INSTANCE_STRIDE_FLOATS = 12;
export const INSTANCE_STRIDE_BYTES = 48;
