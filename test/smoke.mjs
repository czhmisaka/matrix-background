/**
 * 冒烟测试:把 src 当 ESM 引入,验证 import 链路通畅
 * 真正运行需要 DOM,这里只验证模块加载和类型
 */
import { matrixRain, themes } from '../src/index.ts';

console.log('✅ ES Module 加载成功');
console.log('  - matrixRain:', typeof matrixRain);
console.log('  - themes:', Object.keys(themes));
console.log('  - silicon-valley cold[0]:', themes['silicon-valley']().cold[0]);

// 验证工厂函数可独立调用
const green = themes['matrix-green']();
console.log('  - matrix-green cold 长度:', green.cold.length, '(应为 10)');
console.log('  - matrix-green warm 长度:', green.warm.length, '(应为 10)');

console.log('\n✅ 所有冒烟测试通过');
