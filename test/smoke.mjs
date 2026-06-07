/**
 * 冒烟测试:验证 dist 产物 ESM 加载链路通畅
 * 前提:npm run build 已执行(产物在 dist/)
 * 注:Node 原生不支持 .ts 后缀导入(audit I-07),改走 dist/
 */
import { matrixRain, themes } from '../dist/index.js';

console.log('✅ ES Module 加载成功');
console.log('  - matrixRain:', typeof matrixRain);
console.log('  - themes:', Object.keys(themes));

// 验证工厂函数可独立调用
const sv = themes['silicon-valley']();
console.log('  - silicon-valley.cold.h:', sv.cold.h, '(青蓝)');
console.log('  - silicon-valley.warm.h:', sv.warm.h, '(琥珀)');
const green = themes['matrix-green']();
console.log('  - matrix-green.cold.h:', green.cold.h, '(绿)');
console.log('  - matrix-green.warm.h:', green.warm.h, '(黄绿)');

console.log('\n✅ 所有冒烟测试通过');
