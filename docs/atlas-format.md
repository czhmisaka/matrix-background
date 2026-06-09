# Character Atlas Format · 0.4.0+

> **目的**: 文档化 build-time 生成的字符 atlas 文件格式, 给 WebGL / WebGPU renderer 用

---

## TL;DR

| 文件     | 路径                                | 大小 (gzip) | 用途                                 |
| -------- | ----------------------------------- | ----------: | ------------------------------------ |
| **PNG**  | `dist/atlas/jetbrains-mono-32.png`  |      ~20 KB | 1024×1024 RGBA, 224 字符 (0x20-0xFF) |
| **JSON** | `dist/atlas/jetbrains-mono-32.json` |      ~12 KB | 字符 index → UV 坐标 + 度量          |

生成: `npm run build` 末尾自动调 `scripts/build-atlas.mjs`
单独重生成: `npm run build:atlas`

---

## 1. PNG Layout

```
┌────────────────────────────────────────────────┐ ← 0
│ 0  1  2  3  4  5  6  7  8  9  :  ;  <  =  >  ?  │  ← row 0
│ @  A  B  C  D  E  F  G  H  I  J  K  L  M  N  O  │  ← row 1
│ P  Q  R  S  T  U  V  W  X  Y  Z  [  \  ]  ^  _  │  ← row 2
│ `  a  b  c  d  e  f  g  h  i  j  k  l  m  n  o  │  ← row 3
│ ...                                            │
│ ˇ  ˘  ˙  ˚  �排列                                  │  ← row 6 (Latin-1 扩展)
│ ...                                            │
└────────────────────────────────────────────────┘ ← 1023

每字符 32×32 像素, 32 行 × 32 列
24px 字体居中, 4px padding 上下左右
白字, 透明背景 (alpha channel)
```

**Atlas 字符编号 → Unicode codepoint**:

- `index 0` → `0x20` (空格)
- `index 1` → `0x21` (`!`)
- `index 95` → `0x7F` (DEL, 不显示)
- `index 96` → `0x80` (Latin-1 扩展首)
- `index 223` → `0xFF` (Latin-1 扩展末)
- **总 224 字符** (0x20-0xFF)

---

## 2. JSON Schema

```json
{
  "version": 1,
  "font": "JetBrains Mono",
  "fontFile": "jetbrains-mono.woff2",
  "fontSize": 24,
  "cellSize": 32,
  "atlasWidth": 1024,
  "atlasHeight": 1024,
  "gridN": 32,
  "totalChars": 224,
  "chars": [
    {
      "code": 32, // Unicode codepoint
      "index": 0, // atlas 内 index (0..223)
      "x": 0, // 像素坐标
      "y": 0,
      "w": 32, // 字符 cell 宽
      "h": 32, // 字符 cell 高
      "actualWidth": 0, // 字符 glyph 实际宽度 (measureText)
      "advanceWidth": 14.4 // 字符 advance (含 padding)
    },
    // ...
    {
      "code": 48, // '0'
      "index": 16,
      "x": 512,
      "y": 0,
      "w": 32,
      "h": 32,
      "actualWidth": 14.4,
      "advanceWidth": 14.4
    }
    // ...
  ]
}
```

**字段说明**:

- `code` — Unicode codepoint (`.charCodeAt(0)`)
- `index` — atlas 内 0-based 索引(WebGL shader 用)
- `x, y, w, h` — 像素坐标(atlas 内左上角 + 尺寸)
- `actualWidth` — `ctx.measureText().actualBoundingBoxLeft + actualBoundingBoxRight`
- `advanceWidth` — `ctx.measureText().width` (字符 advance 距离)

**UV 坐标计算** (shader 用):

```glsl
vec2 uv = vec2(
  (charPosX + (quadU * cellSize)) / atlasWidth,
  (charPosY + (quadV * cellSize)) / atlasHeight
);
// quadU, quadV ∈ [0, 1] 是 quad 内归一化坐标
```

---

## 3. Runtime 加载 (WebGL Renderer)

```ts
import atlasJson from '@xietuier/matrix-rain/atlas/jetbrains-mono-32.json';
import atlasPng from '@xietuier/matrix-rain/atlas/jetbrains-mono-32.png?url';

// 1. 加载 PNG → WebGL texture
const img = new Image();
img.src = atlasPng;
await img.decode();
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

// 2. 解析 JSON → charCode → UV 查表
const codeToUV = new Map<number, AtlasUV>();
for (const ch of atlasJson.chars) {
  codeToUV.set(ch.code, {
    u0: ch.x / atlasJson.atlasWidth,
    v0: ch.y / atlasJson.atlasHeight,
    u1: (ch.x + ch.w) / atlasJson.atlasWidth,
    v1: (ch.y + ch.h) / atlasJson.atlasHeight,
  });
}

// 3. 用户 charset → atlas index 映射
//    (renderer.drawChar 时 ch 是 state.charset 索引)
//    缺失字符 → warn + runtime OffscreenCanvas 补烘 (Phase 2B)
```

---

## 4. Charset 缺失字符处理

默认 charset `'0123456789'` 全部 0x30-0x39, atlas 覆盖。

用户传非默认 charset (e.g. `'一二三'`, Chinese) 时:

1. **Phase 2A**: 只生成默认 atlas → 缺失字符会显示为空白
2. **Phase 2B+**: runtime 走 OffscreenCanvas 补烘缺失字符:
   - 单字符 32×32 OffscreenCanvas
   - `texSubImage2D` 增量更新 atlas
   - `console.warn` 一次(避免刷屏)
3. **未来优化**: 用户传完整自定义 charset → 跑 `scripts/build-atlas.mjs` 重新生成

**检测缺失字符**:

```ts
import { findMissingChars, loadAtlasJson } from '@xietuier/matrix-rain/element';

const atlas = await loadAtlasJson(atlasJsonUrl);
const missing = findMissingChars('用户 charset', atlas);
if (missing.length > 0) {
  console.warn(`[matrix-rain] ${missing.length} chars not in atlas, falling back to runtime bake`);
}
```

---

## 5. WebGPU 复用

WebGPU 路径下:

- PNG → `device.createTexture({ format: 'rgba8unorm' })` + `device.queue.copyExternalImageToTexture`
- JSON → 同样的 `Map<charCode, AtlasUV>` 查表
- 差异: vertex shader 输入 UV 坐标略有不同(WSI vs CSS px)

---

## 6. Build pipeline

```
npm run build
  ↓
  tsup   ── 编译 src/*.ts → dist/{index,element,core,themes,fps-overlay}.{js,cjs,iife.js,umd.js}
  ↓
  build:atlas  ── scripts/build-atlas.mjs
    ↓
    1. 读 src/fonts/jetbrains-mono.woff2
    2. @napi-rs/canvas 渲染 224 字符到 1024×1024 canvas
    3. 输出 dist/atlas/jetbrains-mono-32.png (20.6 KB)
    4. 输出 dist/atlas/jetbrains-mono-32.json (39 KB)
  ↓
  cp src/matrix-rain.css dist/
  ↓
  cp src/fonts/*.woff2 src/fonts/*.css dist/fonts/
```

**增量 build**: tsup watch 模式 + `npm run build:atlas --watch` 配合。

---

## 7. 已知限制 & 未来优化

- **L1**: 当前 atlas 是固定 32×32 字符 cell, 不支持变长宽度
  - 影响: monospace 字体正确; 比例字体未来需要按 advanceWidth 调
- **L2**: 字体文件 hash 没校验, 修改字体需手动 `npm run build:atlas`
  - 优化: build 脚本检测 mtime 变化自动重生成
- **L3**: 不支持 CJK 字符(0x4E00-0x9FFF 在 atlas 之外)
  - 优化: 用户传 CJK charset → runtime 补烘 (Phase 2B+)
- **L4**: Atlas 字符顺序固定, 用户无法扩展
  - 优化: 支持用户传额外字符集 `customChars: string` 生成扩展 atlas

---

_Generated: 2026-06-09 · @xietuier/matrix-rain 0.4.0+ Phase 2A_
