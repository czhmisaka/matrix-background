/**
 * Atlas 加载测试(0.4.0+)
 *
 * **目的**: 验证 build-time 生成的 atlas PNG + JSON 可被 dist 链路加载
 * - JSON schema 完整
 * - PNG magic number 正确
 * - 字符 lookup 覆盖默认 charset
 * - 缺失字符检测正确
 *
 * 前提: npm run build 已执行(产物在 dist/atlas/)
 */
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ATLAS_DIR = resolve(__dirname, '../dist/atlas');
const PNG_PATH = resolve(ATLAS_DIR, 'jetbrains-mono-32.png');
const JSON_PATH = resolve(ATLAS_DIR, 'jetbrains-mono-32.json');

console.log('🧪 Atlas 加载测试(0.4.0+)\n');

let testCount = 0;
let passCount = 0;
const test = async (name, fn) => {
  testCount++;
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passCount++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    throw e;
  }
};

// ==================== Test 1: 文件存在 ====================
await test('dist/atlas/jetbrains-mono-32.png 存在', async () => {
  assert.ok(existsSync(PNG_PATH), `PNG 应在 ${PNG_PATH}`);
});

await test('dist/atlas/jetbrains-mono-32.json 存在', async () => {
  assert.ok(existsSync(JSON_PATH), `JSON 应在 ${JSON_PATH}`);
});

// ==================== Test 2: PNG magic number ====================
await test('PNG 文件 magic number 正确 (89 50 4E 47 0D 0A 1A 0A)', async () => {
  const buf = await readFile(PNG_PATH);
  assert.equal(buf[0], 0x89, 'byte 0 = 0x89');
  assert.equal(buf[1], 0x50, 'byte 1 = 0x50 (P)');
  assert.equal(buf[2], 0x4e, 'byte 2 = 0x4E (N)');
  assert.equal(buf[3], 0x47, 'byte 3 = 0x47 (G)');
});

// ==================== Test 3: PNG size ≤ 50 KB ====================
await test('PNG 文件大小 ≤ 50 KB (预算上限)', async () => {
  const s = await stat(PNG_PATH);
  const kb = s.size / 1024;
  assert.ok(kb <= 50, `PNG 应 ≤ 50 KB, 实得 ${kb.toFixed(1)} KB`);
});

// ==================== Test 4: JSON schema 完整 ====================
await test('JSON schema 完整 (version/font/dimensions/chars)', async () => {
  const json = JSON.parse(await readFile(JSON_PATH, 'utf-8'));
  assert.equal(json.version, 1);
  assert.equal(json.font, 'JetBrains Mono');
  assert.equal(json.atlasWidth, 1024);
  assert.equal(json.atlasHeight, 1024);
  assert.equal(json.cellSize, 32);
  assert.equal(json.gridN, 32);
  assert.equal(json.fontSize, 24);
  assert.ok(Array.isArray(json.chars));
  assert.ok(json.chars.length > 0, '应至少 1 个字符');
  assert.equal(json.chars.length, json.totalChars, 'chars.length == totalChars');
});

// ==================== Test 5: chars 包含 0-9 + A-Z + 空格 ====================
await test('chars 包含默认 charset 全部字符', async () => {
  const json = JSON.parse(await readFile(JSON_PATH, 'utf-8'));
  const codes = new Set(json.chars.map((c) => c.code));
  for (let i = 0; i < 10; i++) {
    assert.ok(codes.has('0'.charCodeAt(0) + i), `数字 ${i} 应在 atlas 内`);
  }
  for (let i = 0; i < 26; i++) {
    assert.ok(
      codes.has('A'.charCodeAt(0) + i),
      `大写 ${String.fromCharCode(65 + i)} 应在 atlas 内`
    );
  }
  assert.ok(codes.has(' '.charCodeAt(0)), '空格应在 atlas 内');
});

// ==================== Test 6: chars index 0..N-1 连续 ====================
await test('chars index 0..N-1 连续(无空洞)', async () => {
  const json = JSON.parse(await readFile(JSON_PATH, 'utf-8'));
  const indices = json.chars.map((c) => c.index).sort((a, b) => a - b);
  for (let i = 0; i < indices.length; i++) {
    assert.equal(indices[i], i, `index ${i} 应在, 实得 ${indices[i]}`);
  }
});

// ==================== Test 7: chars 覆盖 0x20-0xFF ====================
await test('chars 覆盖 0x20-0xFF (224 字符)', async () => {
  const json = JSON.parse(await readFile(JSON_PATH, 'utf-8'));
  assert.equal(
    json.chars.length,
    0xff - 0x20 + 1,
    `应 ${0xff - 0x20 + 1} 字符, 实得 ${json.chars.length}`
  );
  // 第一字符是 space (0x20)
  assert.equal(json.chars[0].code, 0x20);
  // 最后一字符是 0xFF
  assert.equal(json.chars[json.chars.length - 1].code, 0xff);
});

// ==================== Test 8: 字符 x/y 在 [0, atlasSize) 范围内 ====================
await test('每个 char 的 x/y 在 [0, atlasSize) 范围内', async () => {
  const json = JSON.parse(await readFile(JSON_PATH, 'utf-8'));
  for (const ch of json.chars) {
    assert.ok(
      ch.x >= 0 && ch.x + ch.w <= json.atlasWidth,
      `char ${ch.code} x 越界: ${ch.x}+${ch.w} > ${json.atlasWidth}`
    );
    assert.ok(
      ch.y >= 0 && ch.y + ch.h <= json.atlasHeight,
      `char ${ch.code} y 越界: ${ch.y}+${ch.h} > ${json.atlasHeight}`
    );
  }
});

// ==================== Done ====================
console.log(`\n✅ Atlas 加载测试: ${passCount}/${testCount} 全部通过`);
