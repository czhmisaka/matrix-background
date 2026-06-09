#!/usr/bin/env node
/**
 * @xietuier/matrix-rain · Build-time Character Atlas Generator
 *
 * **目的**: 在 build 阶段把字符集预渲染到 PNG 纹理(WebGL/WebGPU runtime 直接 `texImage2D` 上传)
 * - 输入: JetBrains Mono 字体 + 256 字符 (可打印 ASCII 0x20-0xFF)
 * - 输出: `dist/atlas/jetbrains-mono-32.png` (1024×1024 RGBA)
 *        + `dist/atlas/jetbrains-mono-32.json` (字符 index → UV 映射 + 度量)
 *
 * **设计**:
 * - 32×32 grid, 每字符 32×32 像素 (24px 字体 + 4px padding)
 * - 单色 alpha 通道 (运行时 GPU 端染色)
 * - 字体: 项目内 `src/fonts/jetbrains-mono.woff2`, 避免 CDN 依赖
 *   (符合 project_deployment_goal.md "完全本地部署")
 *
 * **fallback**: runtime 路径下, 用户传非默认 charset → OffscreenCanvas 补烘缺失字符
 * (Phase 2A 只生成默认 atlas, runtime fallback 留到 Phase 2B 之后)
 *
 * **用法**:
 *   node scripts/build-atlas.mjs                 # 默认输出到 dist/atlas/
 *   node scripts/build-atlas.mjs --out=build/atlas  # 自定义输出目录
 *
 * @since 0.4.0
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ==================== 0. 加载 @napi-rs/canvas (devDep) ====================
let createCanvas, GlobalFonts;
try {
  const mod = await import('@napi-rs/canvas');
  createCanvas = mod.createCanvas;
  GlobalFonts = mod.GlobalFonts;
} catch (e) {
  console.error(
    '[build-atlas] 找不到 @napi-rs/canvas, 请先 npm install --save-dev @napi-rs/canvas'
  );
  console.error('[build-atlas] 详细错误:', e.message);
  process.exit(1);
}

// ==================== 1. 解析参数 ====================
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith('--out='));
const OUT_DIR = resolve(ROOT, outArg ? outArg.slice('--out='.length) : 'dist/atlas');

// ==================== 2. 字符集 + 度量 ====================
/**
 * 默认字符集: 0x20-0x7F (95 个可打印 ASCII) + 0x80-0xFF (128 个扩展 Latin-1)
 * = 223 字符. 前 95 是真正需要的, 后面扩展是兜底
 *
 * 实际生产用 charset 多数 ≤ 95. 矩阵雨默认 '0123456789' (10 字符).
 */
const CHARS = (() => {
  const arr = [];
  for (let i = 0x20; i <= 0xff; i++) arr.push(String.fromCharCode(i));
  return arr;
})();

const ATLAS_SIZE = 1024;
const CELL_SIZE = 32; // 32×32 grid, 每字符 32×32 像素
const FONT_SIZE = 24; // 24px 字体 + 4px padding
const GRID_N = ATLAS_SIZE / CELL_SIZE; // 32

// ==================== 3. 加载字体 ====================
const FONT_PATH = resolve(ROOT, 'src/fonts/jetbrains-mono.woff2');
if (!existsSync(FONT_PATH)) {
  console.error(`[build-atlas] 字体文件不存在: ${FONT_PATH}`);
  process.exit(1);
}

console.log(`[build-atlas] 字体: ${FONT_PATH}`);
console.log(`[build-atlas] 字符数: ${CHARS.length} (0x20-0xFF, ${GRID_N}×${GRID_N} grid)`);
console.log(`[build-atlas] 输出: ${OUT_DIR}`);

// @napi-rs/canvas 的 GlobalFonts.registerFromPath 加载 woff2
const fontFamily = 'JetBrainsMono';
try {
  GlobalFonts.registerFromPath(FONT_PATH, fontFamily);
} catch (e) {
  console.error('[build-atlas] 字体注册失败:');
  console.error(' ', e.message);
  process.exit(1);
}

// ==================== 4. 渲染字符到 canvas ====================
const canvas = createCanvas(ATLAS_SIZE, ATLAS_SIZE);
const ctx = canvas.getContext('2d', { alpha: true });

// 透明背景 (运行时 GPU 端染色, 字符用 alpha 表示)
ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

// 白字
ctx.fillStyle = '#ffffff';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.font = `${FONT_SIZE}px "${fontFamily}", monospace`;

// 字符度量 + 位置
const chars = [];
for (let i = 0; i < CHARS.length; i++) {
  const ch = CHARS[i];
  const gx = i % GRID_N;
  const gy = Math.floor(i / GRID_N);
  const cx = gx * CELL_SIZE + CELL_SIZE / 2;
  const cy = gy * CELL_SIZE + CELL_SIZE / 2;

  // 画字
  ctx.fillText(ch, cx, cy);

  // 度量 (用 measureText 取精确宽度)
  const m = ctx.measureText(ch);
  chars.push({
    code: ch.charCodeAt(0),
    index: i,
    x: gx * CELL_SIZE,
    y: gy * CELL_SIZE,
    w: CELL_SIZE,
    h: CELL_SIZE,
    // 度量字段 (供 WebGL shader 微调 vertex 用, 当前备用)
    actualWidth: m.actualBoundingBoxRight + m.actualBoundingBoxLeft,
    advanceWidth: m.width,
  });
}

console.log(`[build-atlas] 渲染 ${chars.length} 字符到 ${ATLAS_SIZE}×${ATLAS_SIZE} canvas 完成`);

// ==================== 5. 输出 PNG + JSON ====================
const pngBuffer = canvas.toBuffer('image/png');
const pngPath = join(OUT_DIR, 'jetbrains-mono-32.png');
const jsonPath = join(OUT_DIR, 'jetbrains-mono-32.json');

await mkdir(OUT_DIR, { recursive: true });
await writeFile(pngPath, pngBuffer);

const json = {
  version: 1,
  font: 'JetBrains Mono',
  fontFile: 'jetbrains-mono.woff2',
  fontSize: FONT_SIZE,
  cellSize: CELL_SIZE,
  atlasWidth: ATLAS_SIZE,
  atlasHeight: ATLAS_SIZE,
  gridN: GRID_N,
  totalChars: chars.length,
  // 字符 lookup: code → index (运行时用 `string.charCodeAt(0)` 查 O(1))
  chars,
};

await writeFile(jsonPath, JSON.stringify(json, null, 2));

console.log(`[build-atlas] ✓ PNG  → ${pngPath} (${(pngBuffer.length / 1024).toFixed(1)} KB)`);
console.log(`[build-atlas] ✓ JSON → ${jsonPath}`);
console.log(`[build-atlas] 完成`);
