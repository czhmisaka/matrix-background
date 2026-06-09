/**
 * @xietuier/matrix-rain · 字符 Atlas 加载器(0.4.0+)
 *
 * **职责**: 加载 build-time 生成的字符 PNG + JSON, 提供给 WebGL/WebGPU renderer
 * - PNG: `dist/atlas/jetbrains-mono-32.png` (1024×1024 RGBA)
 * - JSON: `dist/atlas/jetbrains-mono-32.json` (字符 index → UV + 度量)
 *
 * **加载策略**:
 * - 浏览器 ESM: `import atlasJson from '@xietuier/matrix-rain/atlas/jetbrains-mono-32.json'`
 *   + `fetch('@xietuier/matrix-rain/atlas/jetbrains-mono-32.png')`
 * - 浏览器 IIFE: 通过 `<script>` 全局名 `MatrixRain.__atlas__` 注入
 * - Node / SSR: 抛错(WebGL/WebGPU 不支持 Node)
 *
 * **字符 lookup O(1)**:
 * - 用户传 charset `'01'`, renderer 内部建 `Map<charCode, atlasIndex>` (256 项)
 * - 缺失字符(不在 atlas 内)抛 warn 一次, runtime 走 OffscreenCanvas 补烘 (Phase 2B)
 *
 * @since 0.4.0
 */

import type { MatrixRainState } from '../engine/state';

/** Atlas JSON schema · 与 scripts/build-atlas.mjs 输出一致 */
export interface AtlasChar {
  code: number;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  actualWidth: number;
  advanceWidth: number;
}

export interface AtlasJson {
  version: 1;
  font: string;
  fontFile: string;
  fontSize: number;
  cellSize: number;
  atlasWidth: number;
  atlasHeight: number;
  gridN: number;
  totalChars: number;
  chars: AtlasChar[];
}

/** Atlas UV 查表 · cell index → { u0, v0, u1, v1 } in [0,1] */
export interface AtlasUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * 加载 atlas JSON
 * - ESM: 走 `import` (静态, 走 bundler 内联 / 分包)
 * - 浏览器: 也可走 `fetch` (Phase 2B 用)
 *
 * @param url JSON URL 或 import()
 */
export const loadAtlasJson = async (url: string): Promise<AtlasJson> => {
  // 浏览器 fetch 路径(支持任意 URL)
  if (typeof fetch === 'function') {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`[atlas] Failed to fetch ${url}: ${r.status}`);
    return (await r.json()) as AtlasJson;
  }
  throw new Error('[atlas] No loader available (Node fallback not implemented)');
};

/**
 * 从 atlas JSON 查字符的 UV 坐标
 * - O(1) Map 查表(预构建)
 *
 * @param atlasJson atlas JSON
 * @param charCode 字符 Unicode codepoint (e.g. '0'.charCodeAt(0) === 48)
 * @returns UV 坐标(若字符不在 atlas,返回 null)
 */
export const buildAtlasLookup = (atlasJson: AtlasJson): Map<number, AtlasUV> => {
  const map = new Map<number, AtlasUV>();
  const W = atlasJson.atlasWidth;
  const H = atlasJson.atlasHeight;
  for (const ch of atlasJson.chars) {
    map.set(ch.code, {
      u0: ch.x / W,
      v0: ch.y / H,
      u1: (ch.x + ch.w) / W,
      v1: (ch.y + ch.h) / H,
    });
  }
  return map;
};

/**
 * 把 `state.charset` 字符串映射到 atlas index
 * - 缺失字符返回 -1
 *
 * @param charset 用户传入的字符集(例如 '0123456789')
 * @param atlasJson atlas JSON
 * @returns `{ charCode → atlasIndex }` map
 */
export const buildCharsetMap = (charset: string, atlasJson: AtlasJson): Map<number, number> => {
  const map = new Map<number, number>();
  // 反向查: charCode → atlas index
  const codeToIndex = new Map<number, number>();
  for (const ch of atlasJson.chars) {
    codeToIndex.set(ch.code, ch.index);
  }
  for (let i = 0; i < charset.length; i++) {
    const code = charset.charCodeAt(i);
    const idx = codeToIndex.get(code);
    if (idx !== undefined) {
      map.set(code, idx);
    }
  }
  return map;
};

/**
 * 校验: 用户的 charset 是不是 atlas 全覆盖
 * - 缺失字符走 OffscreenCanvas 补烘 (Phase 2B)
 *
 * @returns 缺失的字符数组(空数组 = 全覆盖)
 */
export const findMissingChars = (charset: string, atlasJson: AtlasJson): string[] => {
  const available = new Set(atlasJson.chars.map((c) => c.code));
  const missing: string[] = [];
  for (let i = 0; i < charset.length; i++) {
    const code = charset.charCodeAt(i);
    if (!available.has(code)) missing.push(String.fromCharCode(code));
  }
  return missing;
};

/** Type guard: 校验 atlas JSON schema */
export const isAtlasJson = (v: unknown): v is AtlasJson => {
  if (!v || typeof v !== 'object') return false;
  const j = v as Record<string, unknown>;
  return (
    j.version === 1 &&
    typeof j.font === 'string' &&
    typeof j.atlasWidth === 'number' &&
    typeof j.atlasHeight === 'number' &&
    Array.isArray(j.chars) &&
    j.chars.length > 0
  );
};

/** 便利函数: 直接读 state.charset + atlas → 缺失字符列表 */
export const validateCharset = (state: MatrixRainState, atlasJson: AtlasJson): string[] =>
  findMissingChars(state.charset, atlasJson);
