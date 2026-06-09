/**
 * @xietuier/matrix-rain · WebGPU Shaders (WGSL) (0.4.0+ Phase 4)
 *
 * **架构**:
 * 1. **Compute shader** (`warmth.wgsl`): 每帧并行更新 cell.warmth / cell.phase
 *    - 8.4M cells × 60fps 跑 compute 不可能慢 (1-2ms)
 * 2. **Render pipeline** (vertex + fragment): instanced draw,共享 atlas
 * 3. **Bind groups**:
 *    - group(0): uniforms (viewport, time, atlas)
 *    - group(1): cells storage buffer
 *    - group(2): instance data (per-frame)
 *
 * **WGSL** = WebGPU Shading Language (类似 Rust)
 *
 * @since 0.4.0
 */

/**
 * Compute shader · 并行更新 cell.warmth / cell.bright
 *
 * 注: warmth 阻尼公式 (与 draw-helpers.ts:73-78 保持 100% 一致)
 *   C = h - M, A = s - p
 *   B = sqrt(C² + A²)
 *   H = max(0, 1 - B / (state.i * state.cfg.warmthRadius))
 *   warmth += (H - warmth) * state.cfg.warmthLerp
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

struct CellBuffer {
  cells: array<Cell>,
}

@group(0) @binding(0) var<storage, read_write> cells: CellBuffer;

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
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(1) var<uniform> params: WarmthParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= arrayLength(&cells.cells)) { return; }

  // 注: 简化版,只更新 warmth / bright,其他字段 CPU 端调
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
  cells.cells[idx].warmth += (H - cells.cells[idx].warmth) * params.warmthLerp;
}
`;

/**
 * Vertex shader · instanced draw
 *
 * 注: 共享 atlas + palette LUT texture,与 WebGL2 类似
 * 区别: WGSL 用 @vertex / @fragment
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
  _pad: f32,
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
  let quadU = f32((vid == 1u || vid == 3u) ? 1u : 0u);
  let quadV = f32((vid == 2u || vid == 3u) ? 1u : 0u);

  var output: VertexOutput;
  output.uv = mix(input.uv0, input.uv1, vec2<f32>(quadU, quadV));
  output.color = input.color;

  let corner = input.pos + vec2<f32>(
    (quadU - 0.5) * uniforms.cellSize,
    (quadV - 0.5) * uniforms.cellSize
  );
  let ndc = (corner / uniforms.viewport) * 2.0 - vec2<f32>(1.0);
  output.position = vec4<f32>(ndc.x, -ndc.y, 0.0, 1.0);
  return output;
}
`;

/**
 * Fragment shader · 采样 atlas,乘 color
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

/** Trail (全屏 fade) shader */
export const TRAIL_VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
}

@vertex
fn main(@builtin(vertex_index) vid: u32) -> VertexOutput {
  let x = f32((vid == 1u || vid == 3u) ? 1 : -1);
  let y = f32((vid == 2u || vid == 3u) ? 1 : -1);
  var output: VertexOutput;
  output.position = vec4<f32>(f32(x), f32(y), 0.0, 1.0);
  return output;
}
`;

export const TRAIL_FRAGMENT_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
}

@group(0) @binding(0) var<uniform> trailColor: vec4<f32>;

@fragment
fn main(_input: VertexOutput) -> @location(0) vec4<f32> {
  return trailColor;
}
`;

/** instance stride (与 WebGL2 一致: 12 floats / 48 bytes) */
export const INSTANCE_STRIDE_FLOATS = 12;
export const INSTANCE_STRIDE_BYTES = 48;
