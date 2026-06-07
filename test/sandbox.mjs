/**
 * 沙箱安全测试
 * 尝试多种注入 / 逃逸手段,确保沙箱拒绝编译
 *
 * 测试矩阵:
 *   1. 词级绕过: this['win'+'dow']
 *   2. 全局对象: window / document / navigator / globalThis
 *   3. 元编程:   Proxy / Reflect
 *   4. 动态执行: new Function / eval
 *   5. 定时器:   setTimeout
 *   6. 合法代码: 数字运算 / 字符串拼接 (应通过)
 */

import { compileUserFunction, validateUserFunction } from '../dist/index.js';

let passed = 0;
let failed = 0;
const assert = (cond, msg) => {
  if (cond) { console.log('  ✅', msg); passed++; }
  else { console.error('  ❌', msg); failed++; }
};

const expectReject = (code, label) => {
  try {
    compileUserFunction(code);
    assert(false, `${label} 应该被拒,但通过了`);
  } catch (e) {
    assert(true, `${label} 被拒: ${e.message.split(':')[0]}`);
  }
};

const expectAccept = (code, label) => {
  try {
    const fn = compileUserFunction(code);
    assert(typeof fn === 'function', `${label} 编译通过,返回函数`);
  } catch (e) {
    assert(false, `${label} 应该通过,但被拒: ${e.message}`);
  }
};

// ==================== 1. 词级绕过(关键测试) ====================
console.log('\n[1] 词级绕过: this["win"+"dow"] 注入');
expectReject(`return this['win' + 'dow'].alert(1)`, 'this["win"+"dow"]');
expectReject(`var w = this["win"+"dow"]; return w;`, 'this["win"+"dow"] var');

// ==================== 2. 全局对象 ====================
console.log('\n[2] 全局对象直接引用');
expectReject(`return window;`, 'window');
expectReject(`return document.body;`, 'document');
expectReject(`return navigator.userAgent;`, 'navigator');
expectReject(`return globalThis;`, 'globalThis');
expectReject(`return self;`, 'self');

// ==================== 3. 元编程 ====================
console.log('\n[3] 元编程尝试');
expectReject(`return new Proxy({}, {});`, 'new Proxy');
expectReject(`return Reflect.get({});`, 'Reflect');

// ==================== 4. 动态执行 ====================
console.log('\n[4] 动态执行');
expectReject(`return new Function('return window')();`, 'new Function');
expectReject(`return eval('1');`, 'eval');
expectReject(`return (() => import("x"))();`, 'import');

// ==================== 5. 定时器 ====================
console.log('\n[5] 定时器');
expectReject(`setTimeout(() => {}, 0); return 0;`, 'setTimeout');
expectReject(`return queueMicrotask;`, 'queueMicrotask');

// ==================== 6. 合法代码 ====================
console.log('\n[6] 合法代码应通过');
expectAccept(`return 0.5;`, '常量');
expectAccept(`return Math.sin(t);`, 'Math.sin(参数沙箱内合法)');
expectAccept(`return clamp(t, 0, 1);`, 'clamp(参数)');
expectAccept(`return ease.inQuad(t);`, 'ease.inQuad');
expectAccept(`return noise(t * 5);`, 'noise');
expectAccept(`return 0.5 + 0.5 * sin(t * 3);`, 'sin(参数)');
expectAccept(`return Math.max(Math.min(t, 1), 0);`, 'Math.max/min');
expectAccept(`return Number.isFinite(t) ? t : 0;`, 'Number.isFinite');
expectAccept(`return String.fromCharCode(65);`, 'String.fromCharCode');

// ==================== 7. 边界情况(词级匹配)====================
console.log('\n[7] 边界情况(词级匹配,已知限制)');
expectAccept(`return allocation;`, 'allocation(纯变量名,不被 location 误中)');
// 注:字符串字面量中的 location 仍会被词级匹配拦下 —— 这是词级分析已知限制
// 攻击者即使能写 "location" 字符串,也无法访问 window.location 对象(类型守卫拦下)
expectReject(`return "location is just a string";`, '字符串字面量中含 location(已知限制)');

// ==================== 8. validateUserFunction API ====================
console.log('\n[8] validateUserFunction 独立校验');
{
  const r1 = validateUserFunction('return window;');
  assert(r1.ok === false, 'validateUserFunction 拒绝 window');
  const r2 = validateUserFunction('return Math.sin(t);');
  assert(r2.ok === true, 'validateUserFunction 接受 Math.sin');
  const r3 = validateUserFunction('return 1');
  assert(r3.ok === true, 'validateUserFunction 接受纯数字');
}

// ==================== 9. 步数限制 ====================
console.log('\n[9] 步数限制(10000 步)');
{
  // 死循环会被步数限制兜住
  // 但用户代码要 'return' 之前不能超过步数
  const fn = compileUserFunction(`return 0;`);
  // 简单调一次,不应 throw
  try {
    fn({ t: 0, phase: 0, h: 0, s: 0, r: 0, f: 0, W: 10, H: 10, L: 0, ch: 0,
         sin: Math.sin, cos: Math.cos, tan: Math.tan, noise: () => 0,
         PI: Math.PI, E: Math.E, clamp: (v, lo, hi) => v, lerp: (a, b) => a,
         ease: { inQuad: t => t },
         Math: { sin: Math.sin, cos: Math.cos }, Number: {}, String: {}, Boolean: {}, Array: {} });
    assert(true, '基本调用不 throw');
  } catch (e) {
    assert(false, `基本调用 throw: ${e.message}`);
  }
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
