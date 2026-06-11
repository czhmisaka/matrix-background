/**
 * @xietuier/matrix-rain · WebGPU Shaders (WGSL) (0.4.0+ Phase 4, 0.5.0 重建)
 *
 * **架构** (0.5.0):
 * 1. **Compute shader** (`COMPUTE_WARMTH_SHADER`): 每帧并行更新 cell.warmth
 *    - 8.4M cells × 60fps 跑 compute 1-2ms
 *    - WGSL: `var<storage, read_write> cells: array<f32>`(顶层 runtime-sized array)
 * 2. **Render pipeline** (vertex + fragment): instanced draw, 共享 atlas
 *    - vertex shader 用 `@builtin(instance_index)` 读 `cells[iid]` 调色
 * 3. **Bind groups**:
 *    - Compute:   @group(0) @binding(0) cells (storage, read_write)
 *                 @group(0) @binding(1) params (uniform, 48 bytes)
 *    - Render @0: @group(0) @binding(0) uniforms (uniform, 16 bytes)
 *                 @group(0) @binding(1) atlasTex (texture_2d)
 *                 @group(0) @binding(2) atlasSampler (sampler)
 *    - Render @1: @group(1) @binding(0) cells (storage, read) ← 0.5.0 新增
 *    - Trail:     @group(0) @binding(0) trailColor (uniform, vec4)
 *
 * **WGSL 规范要求**:
 * - runtime-sized array 必须直接声明为顶层 var,**不能嵌套在 struct 内**
 * - uniform buffer 字段必须 16-byte 对齐(48 bytes = 12 f32,刚好对齐)
 *
 * @since 0.4.0
 */

/**
 * Compute shader · 并行更新每 cell 的 warmth (0.5.0 重写)
 *
 * **设计**:
 * - `cells` 是 `array<f32>`,每元素一格的 warmth(0..1)。**顶层 runtime-sized array**(WGSL 规范),
 *   `var<storage, read_write>`(可读可写,layout 必须 `type: 'storage'`,**不是** `read-only-storage`)。
 * - `params` 是 uniform,装 lightCenter/driftSpeed/warmthRadius/warmthLerp/gridDims/wallTime。
 *   uniform buffer 字段必须 16-byte 对齐,所以最后塞 _pad 凑 8 floats = 32 bytes。
 * - 算法**完全镜像** CPU 路径 [draw-helpers.ts:72-78](src/engine/draw-helpers.ts#L72-L78):
 *   ```
 *   s = floor(idx / cols), h = idx - s*cols
 *   lightX = lightCenterX*cols + cos(wallTime*driftSpeedX*60)*cols*0.2
 *   lightY = lightCenterY*rows + sin(wallTime*driftSpeedY*60)*rows*0.2
 *   C = h - lightX, A = s - lightY
 *   B = sqrt(C² + A²)
 *   H = max(0, 1 - B/(rows*warmthRadius))
 *   cells[idx] += (H - cells[idx]) * warmthLerp
 *   ```
 *
 * **绑定**:
 * - `@group(0) @binding(0)` cells (storage, read_write)
 * - `@group(0) @binding(1)` params (uniform)
 *
 * **为什么不再用 nested struct 数组**: 0.4.0 的 `array<Cell>` 内嵌 8 f32 字段
 * 浪费带宽(warmth 只 1 f32,实际我们要 1 f32/cell)。**改用 `array<f32>`**
 * 直接表达 1 f32/cell,8.4M cells × 4 bytes = 32MB(原 256MB),降一个量级。
 *
 * @since 0.5.0
 */
export const COMPUTE_WARMTH_SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> cells: array<f32>;

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
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(1) var<uniform> params: WarmthParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= arrayLength(&cells)) { return; }

  let s = floor(f32(idx) / params.gridCols);
  let h = f32(idx) - s * params.gridCols;
  let lightX = params.lightCenterX * params.gridCols +
    cos(params.wallTime * params.driftSpeedX * 60.0) * params.gridCols * 0.2;
  let lightY = params.lightCenterY * params.gridRows +
    sin(params.wallTime * params.driftSpeedY * 60.0) * params.gridRows * 0.2;
  let C = h - lightX;
  let A = s - lightY;
  let B = sqrt(C * C + A * A);
  let H = max(0.0, 1.0 - B / (params.gridRows * params.warmthRadius));

  // 读取当前值, 阻尼后写回
  let old = cells[idx];
  cells[idx] = old + (H - old) * params.warmthLerp;
}
`;

/**
 * Vertex shader · instanced draw (0.5.0+: 读 cells storage 调色)
 *
 * 0.4.1 之前 compute 输出 cells[idx].warmth 但 vertex shader 不用,导致 P0-2。
 * 0.5.0 把 cells 作为 group(1) binding(0) 传入,vertex shader 在
 * `@builtin(instance_index)` 处读 `cells[idx]` 乘到 color.a,实现
 * "GPU 并行计算 warmth + vertex 一次性应用" 的完整闭环。
 *
 * - 4 顶点 triangle-strip quad (vertex_index 0-3)
 * - 每个实例有 12 个 float (48 bytes): [pos.xy, charIdx, pad, color.rgba, uv0.xy, uv1.xy]
 * - 输出 clip-space position + atlas UV + fragment color (含 warmth 调制)
 */
export const RENDER_VERTEX_SHADER = /* wgsl */ `
@group(1) @binding(0) var<storage, read> cells: array<f32>;

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
fn main(input: InstanceInput, @builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VertexOutput {
  // 4-vertex triangle-strip quad
  let quadU = select(0.0, 1.0, vid == 1u || vid == 3u);
  let quadV = select(0.0, 1.0, vid == 2u || vid == 3u);

  var output: VertexOutput;
  output.uv = mix(input.uv0, input.uv1, vec2<f32>(quadU, quadV));

  // 0.5.0+: 读 compute 写的 warmth,乘到 color.alpha 上(亮度受 warmth 调制)
  let w = cells[iid];
  output.color = vec4<f32>(input.color.rgb, input.color.a * w);

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
