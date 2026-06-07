// 验证 dist 产物能被 Node ESM 正常加载 + API shape
import { matrixRain, themes } from '../dist/index.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

console.log('✅ ESM 加载:');
console.log('  - matrixRain:', typeof matrixRain);
console.log('  - themes keys:', Object.keys(themes));
console.log('  - silicon-valley cold 长度:', themes['silicon-valley']().cold.length);
console.log('  - matrix-green warm 长度:', themes['matrix-green']().warm.length);

console.log('\n✅ CJS 加载:');
const cjs = require('../dist/index.cjs');
console.log('  - CJS matrixRain:', typeof cjs.matrixRain);
console.log('  - CJS themes:', Object.keys(cjs.themes).length, '个主题');

console.log('\n✅ TypeScript 类型文件:');
import('node:fs').then(fs => {
  const dt = fs.readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
  console.log('  - index.d.ts:', dt.length, 'bytes');
  console.log('  - 包含 matrixRain:', dt.includes('matrixRain'));
  console.log('  - 包含 MatrixRainInstance:', dt.includes('MatrixRainInstance'));
});
