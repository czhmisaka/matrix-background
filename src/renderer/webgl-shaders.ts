/**
 * @xietuier/matrix-rain · WebGL2 Shader Source
 *
 * GLSL ES 3.00 (WebGL 2 必需)
 *
 * **架构**:
 * - 每个 cell 1 个 instance (1 quad = 2 triangles, 4 vertices)
 * - per-instance attributes: aPos (vec2, 字符中心 CSS px) + aCharIdx + aColor + aUV0 + aUV1
 * - per-vertex (4 个/quad) 隐式计算 UV: gl_VertexID ∈ {0, 1, 2, 3} → quad corners
 *
 * **坐标**:
 * - 输入 aPos 是字符中心 CSS 像素坐标
 * - gl_Position 转换到 NDC ([-1, 1] × [-1, 1]) 区间
 * - viewport = (0, 0, canvas.width, canvas.height)  (backing store = CSS px × DPR)
 *
 * **颜色**:
 * - 字符颜色 = palette LUT 查出的 RGB (来自 draw-helpers)
 * - alpha = palette.a × state.transitionAlpha × texture.alpha (per-pixel)
 *
 * @since 0.4.0
 */

/** Vertex shader · WebGL2 GLSL ES 3.00 */
export const VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

// Per-instance attributes (8 floats per cell)
in vec2 aPos;          // 字符中心坐标 (CSS px)
in float aCharIdx;     // atlas 内字符 index
in vec4 aColor;        // RGBA 颜色
in vec2 aUV0;          // atlas UV 左上
in vec2 aUV1;          // atlas UV 右下

// Uniforms
uniform vec2 uViewport;  // (canvas.width, canvas.height) backing store pixels
uniform float uCellSize; // 字符 cell 像素大小(以 backing store px 计, e.g. 32)

// Per-vertex (4 vertices per quad, instanced rendering)
out vec4 vColor;
out vec2 vUV;

void main() {
  // 4 个 vertex 编号: 0 = TL, 1 = TR, 2 = BL, 3 = BR (TRIANGLE_STRIP 顺序)
  int vid = gl_VertexID;
  float quadU = float((vid == 1 || vid == 3) ? 1 : 0);  // x: 0 or 1
  float quadV = float((vid == 2 || vid == 3) ? 1 : 0);  // y: 0 or 1

  // UV 在 atlas 内的子区间(从 aUV0 到 aUV1)
  vUV = mix(aUV0, aUV1, vec2(quadU, quadV));
  vColor = aColor;

  // 字符位置: aPos 是中心 → 偏移 ±uCellSize/2 得 TL corner
  vec2 corner = aPos + vec2(
    (quadU - 0.5) * uCellSize,
    (quadV - 0.5) * uCellSize
  );

  // CSS px → backing store px → NDC [-1, 1]
  vec2 ndc = (corner / uViewport) * 2.0 - 1.0;
  // Y 翻转(canvas Y 朝下, NDC Y 朝上)
  ndc.y = -ndc.y;

  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

/** Fragment shader · WebGL2 GLSL ES 3.00 */
export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec4 vColor;
in vec2 vUV;

uniform sampler2D uAtlas;

out vec4 fragColor;

void main() {
  // 采样 atlas (texture alpha = 字符 mask)
  float mask = texture(uAtlas, vUV).a;
  // 字符颜色 (unmultiplied) × mask × alpha → premultiplied for framebuffer (默认 premultipliedAlpha=true)
  float a = vColor.a * mask;
  fragColor = vec4(vColor.rgb * a, a);
}
`;

/**
 * 拖尾全屏 quad shader (drawTrail)
 * - 单 fragment shader (无纹理)
 * - 输出固定 rgba
 */
export const TRAIL_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;
// 全屏 quad 4 个 vertex (TRIANGLE_STRIP)
out vec2 vUV;
void main() {
  // 4 个 vertex → -1,-1 / 1,-1 / -1,1 / 1,1
  float x = float((gl_VertexID == 1 || gl_VertexID == 3) ? 1 : -1);
  float y = float((gl_VertexID == 2 || gl_VertexID == 3) ? 1 : -1);
  vUV = vec2((x + 1.0) * 0.5, (y + 1.0) * 0.5);
  gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

export const TRAIL_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
uniform vec4 uTrailColor;
out vec4 fragColor;
void main() {
  // trail 颜色 (unmultiplied) 乘 alpha → premult for framebuffer (premultipliedAlpha=true)
  fragColor = vec4(uTrailColor.rgb * uTrailColor.a, uTrailColor.a);
}
`;

/**
 * Per-instance attribute stride (8 floats)
 * [aPos.x, aPos.y, aCharIdx, aColor.r, aColor.g, aColor.b, aColor.a, ...]
 *
 * 注: 把 aColor 和 aUV 拆 2 个 attribute(WebGL2 支持)
 * - location 0: vec2 aPos
 * - location 1: float aCharIdx
 * - location 2: vec4 aColor
 * - location 3: vec2 aUV0
 * - location 4: vec2 aUV1
 */
export const INSTANCE_ATTRIBUTES = [
  { name: 'aPos', size: 2, offset: 0 },
  { name: 'aCharIdx', size: 1, offset: 8 },
  { name: 'aColor', size: 4, offset: 12 },
  { name: 'aUV0', size: 2, offset: 28 },
  { name: 'aUV1', size: 2, offset: 36 },
] as const;

/** 单 instance stride (字节) = 8 (aPos vec2) + 4 (aCharIdx + pad) + 16 (aColor vec4) + 16 (aUV0+aUV1) = 44 字节
 * 但因 alignment, 实际 stride = 44 字节 (4-byte align)
 *
 * 简化: 全部用 vec4 pack → 12 vec4 = 48 字节 / instance
 *  - vec4[0]: (aPos.x, aPos.y, aCharIdx, _pad)
 *  - vec4[1]: (aColor.r, aColor.g, aColor.b, aColor.a)
 *  - vec4[2]: (aUV0.x, aUV0.y, aUV1.x, aUV1.y)
 */
export const INSTANCE_STRIDE_FLOATS = 12; // 3 × vec4
export const INSTANCE_STRIDE_BYTES = INSTANCE_STRIDE_FLOATS * 4; // 48
