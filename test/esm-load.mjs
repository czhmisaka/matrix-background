// 验证 dist 产物能被 Node ESM 正常加载 + API shape
import { matrixRain, themes, compileUserFunction, validateUserFunction } from '../dist/index.js';
import { createRequire } from 'module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);

console.log('✅ ESM 加载:');
assert.equal(typeof matrixRain, 'function');
assert.equal(typeof themes, 'object');
console.log('  - matrixRain:', typeof matrixRain);
console.log('  - themes keys:', Object.keys(themes));
// HSLPalette 是 object(无 length);断言它的字段类型
const svCold = themes['silicon-valley']().cold;
assert.equal(typeof svCold.h, 'number', 'cold.h 应该是 number');
assert.equal(typeof svCold.s, 'number', 'cold.s 应该是 number');
assert.equal(typeof svCold.lMin, 'number', 'cold.lMin 应该是 number');
assert.equal(typeof svCold.lMax, 'number', 'cold.lMax 应该是 number');
console.log('  - silicon-valley cold:', JSON.stringify(svCold));
const greenWarm = themes['matrix-green']().warm;
assert.equal(typeof greenWarm.h, 'number', 'warm.h 应该是 number');
console.log('  - matrix-green warm:', JSON.stringify(greenWarm));

console.log('\n✅ CJS 加载:');
const cjs = require('../dist/index.cjs');
assert.equal(typeof cjs.matrixRain, 'function');
assert.equal(Object.keys(cjs.themes).length, 5, 'CJS 应该有 5 个主题');
console.log('  - CJS matrixRain:', typeof cjs.matrixRain);
console.log('  - CJS themes:', Object.keys(cjs.themes).length, '个主题');

console.log('\n✅ Sandbox 沙箱:');
assert.equal(typeof compileUserFunction, 'function');
assert.equal(typeof validateUserFunction, 'function');
const valid = validateUserFunction('return 0.5');
assert.equal(valid.ok, true, '简单表达式应通过验证');
const blacklisted = validateUserFunction('return window.location');
assert.equal(blacklisted.ok, false, 'window 关键字应被拒绝');
console.log('  - compileUserFunction:', typeof compileUserFunction);
console.log('  - validateUserFunction:', typeof validateUserFunction);

console.log('\n✅ TypeScript 类型文件:');
import('node:fs').then(fs => {
  const dt = fs.readFileSync(new URL('../dist/core.d.ts', import.meta.url), 'utf8');
  assert.ok(dt.length > 1000, 'core.d.ts 应该有内容');
  assert.ok(dt.includes('matrixRain'), 'core.d.ts 应包含 matrixRain');
  assert.ok(dt.includes('MatrixRainInstance'), 'core.d.ts 应包含 MatrixRainInstance');
  assert.ok(dt.includes('keepPaletteParams'), 'core.d.ts 应包含 keepPaletteParams (setTheme options)');
  console.log('  - core.d.ts:', dt.length, 'bytes');
  console.log('  - 包含 matrixRain:', dt.includes('matrixRain'));
  console.log('  - 包含 MatrixRainInstance:', dt.includes('MatrixRainInstance'));
  console.log('  - 包含 keepPaletteParams:', dt.includes('keepPaletteParams'));
});
