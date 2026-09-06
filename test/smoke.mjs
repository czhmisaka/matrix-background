/**
 * 冒烟测试:验证 dist 产物 ESM 加载链路通畅 + 主题结构
 * 前提:npm run build 已执行(产物在 dist/)
 * 注:Node 原生不支持 .ts 后缀导入(audit I-07),改走 dist/
 */
import { matrixRain, themes } from '../dist/index.js';
import assert from 'node:assert/strict';

// ESM 加载
assert.equal(typeof matrixRain, 'function', 'matrixRain 应该是函数');
assert.equal(typeof themes, 'object', 'themes 应该是对象');
console.log('✅ ES Module 加载成功');
console.log('  - matrixRain:', typeof matrixRain);
console.log('  - themes keys:', Object.keys(themes));

// 主题对象应为 5 个内置主题
const expectedThemes = [
  'silicon-valley',
  'matrix-green',
  'lava-red',
  'cyber-blue',
  'pure-mono',
  'zeabur',
];
assert.equal(
  Object.keys(themes).length,
  expectedThemes.length,
  `应有 ${expectedThemes.length} 个主题`
);
for (const name of expectedThemes) {
  assert.ok(themes[name], `主题 ${name} 应该存在`);
  const t = themes[name]();
  // HSLPalette 结构断言:{h, s, lMin, lMax, aMax?}
  assert.equal(typeof t.cold.h, 'number', `${name}.cold.h 应该是 number`);
  assert.equal(typeof t.cold.s, 'number', `${name}.cold.s 应该是 number`);
  assert.equal(typeof t.cold.lMin, 'number', `${name}.cold.lMin 应该是 number`);
  assert.equal(typeof t.cold.lMax, 'number', `${name}.cold.lMax 应该是 number`);
  assert.equal(typeof t.warm.h, 'number', `${name}.warm.h 应该是 number`);
  assert.equal(typeof t.warm.s, 'number', `${name}.warm.s 应该是 number`);
  assert.equal(typeof t.warm.lMin, 'number', `${name}.warm.lMin 应该是 number`);
  assert.equal(typeof t.warm.lMax, 'number', `${name}.warm.lMax 应该是 number`);
  // ThemeParams 7 字段
  for (const f of [
    'brightness',
    'chroma',
    'hueShift',
    'saturationShift',
    'lightnessShift',
    'invertHue',
    'contrast',
  ]) {
    assert.equal(typeof t[f], 'number', `${name}.${f} 应该是 number`);
  }
}
console.log('  - silicon-valley.cold.h:', themes['silicon-valley']().cold.h, '(青蓝)');
console.log('  - silicon-valley.warm.h:', themes['silicon-valley']().warm.h, '(琥珀)');
console.log('  - matrix-green.cold.h:', themes['matrix-green']().cold.h, '(绿)');
console.log('  - matrix-green.warm.h:', themes['matrix-green']().warm.h, '(黄绿)');

console.log('\n✅ 所有冒烟测试通过');
