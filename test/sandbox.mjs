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
  if (cond) {
    console.log('  ✅', msg);
    passed++;
  } else {
    console.error('  ❌', msg);
    failed++;
  }
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
    fn({
      t: 0,
      phase: 0,
      h: 0,
      s: 0,
      r: 0,
      f: 0,
      W: 10,
      H: 10,
      L: 0,
      ch: 0,
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      noise: () => 0,
      PI: Math.PI,
      E: Math.E,
      clamp: (v, lo, hi) => v,
      lerp: (a, b) => a,
      ease: { inQuad: (t) => t },
      Math: { sin: Math.sin, cos: Math.cos },
      Number: {},
      String: {},
      Boolean: {},
      Array: {},
    });
    assert(true, '基本调用不 throw');
  } catch (e) {
    assert(false, `基本调用 throw: ${e.message}`);
  }
}

// ==================== 10. Function constructor 链(.constructor.constructor)====================
console.log('\n[10] Function constructor 链绕过');
expectReject(`return ({}).constructor;`, '({}).constructor 引用 Function');
expectReject(`return ({}).constructor.constructor;`, '({}).constructor.constructor');
expectReject(`({}).constructor.constructor('return 1')(); return 0;`, 'Function 链调用');
expectReject(`var o = {}; return o.constructor;`, 'obj.constructor');

// ==================== 11. async / await ====================
console.log('\n[11] async / await 异步链路');
expectReject(`async function f() { return 1; } return 0;`, 'async function');
expectReject(`return (async () => 1)();`, 'async arrow');
expectReject(`await Promise.resolve(1); return 0;`, 'await 表达式');

// ==================== 12. 生成器(function* + yield)====================
console.log('\n[12] 生成器 function* / yield');
expectReject(`function* g() { yield 1; } return 0;`, 'function* 生成器');
expectReject(`function g() { return 1; } return g();`, 'function 关键字');

// ==================== 13. class 声明 ====================
console.log('\n[13] class 类声明');
expectReject(`class Foo { bar() { return 1; } } return 0;`, 'class 声明');

// ==================== 14. 原型链污染 ====================
console.log('\n[14] 原型链污染 __proto__ / prototype');
expectReject(`return ({}).__proto__;`, '__proto__ 直接访问');
expectReject(`var o = {}; return o.prototype;`, 'prototype 访问');
expectReject(`return ({}).__proto__.constructor;`, '__proto__.constructor 链');

// ==================== 15. 字符串拼接绕过 ====================
console.log('\n[15] 字符串拼接构造禁用词("win"+"dow")');
expectReject(`var w = "win" + "dow"; return w;`, '两段拼接成 window');
expectReject(`return "win" + "dow";`, '两段拼接返回值');
expectReject(`var w = "wi" + "n" + "dow"; return w;`, '三段拼接成 window');
expectReject(`return "global" + "This";`, '两段拼接成 globalThis');

// ==================== 16. validateUserFunction 同步新词 ====================
console.log('\n[16] validateUserFunction 同步新词');
{
  const cases = [
    ['return ({}).constructor;', 'constructor'],
    ['async function f() { return 1; } return 0;', 'async'],
    ['function* g() { yield 1; } return 0;', 'function'],
    ['class Foo {} return 0;', 'class'],
    ['return ({}).__proto__;', '__proto__'],
    ['var w = "win" + "dow"; return w;', 'window (concat)'],
  ];
  for (const [code, label] of cases) {
    const r = validateUserFunction(code);
    assert(r.ok === false, `validateUserFunction 拒绝 ${label}`);
  }
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
