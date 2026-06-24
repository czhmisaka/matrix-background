/**
 * MatrixRain.installGlobalErrorHandler() 全局错误兜底测试
 *
 * 来源:docs/audit-* 0 处 window.onerror/unhandledrejection 兜底
 *   - async reject / 全局 throw 永远丢失,只有 console.error
 *   - 此测试验证 installGlobalErrorHandler 正确注册 + 触发 + 卸载
 *
 * 跑法:node test/global-error-handler.mjs
 * 前置:npm run build
 */

import { createRequire } from 'node:module';

// ==================== 最小化 window mock(支持 addEventListener / dispatchEvent)====================
// 真实 DOM 的 EventTarget 语义:同一 type 多个 listener 都应被调用
const listenerMap = new Map();

// Node 24 没有 ErrorEvent / PromiseRejectionEvent 全局,这里做 shim
class ErrorEventShim extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.message = init.message ?? '';
    this.filename = init.filename;
    this.lineno = init.lineno;
    this.colno = init.colno;
    this.error = init.error;
  }
}

class PromiseRejectionEventShim extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.reason = init.reason;
    this.promise = init.promise;
  }
}

const mockWindow = {
  innerWidth: 1024,
  innerHeight: 768,
  devicePixelRatio: 1,
  matchMedia: (q) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
  addEventListener(type, cb) {
    if (!listenerMap.has(type)) listenerMap.set(type, []);
    listenerMap.get(type).push(cb);
  },
  removeEventListener(type, cb) {
    const arr = listenerMap.get(type);
    if (!arr) return;
    const i = arr.indexOf(cb);
    if (i >= 0) arr.splice(i, 1);
  },
  dispatchEvent(event) {
    const arr = listenerMap.get(event.type) || [];
    // 复制一份:避免回调内部 add/remove 干扰迭代
    for (const cb of arr.slice()) {
      try {
        cb(event);
      } catch (_) {
        // 真实 DOM 也是这样的:一个 listener 抛错不影响其他
      }
    }
    return true;
  },
};

globalThis.window = mockWindow;

const require = createRequire(import.meta.url);
const { MatrixRain } = require('../dist/index.cjs');

// ==================== 断言工具 ====================
let passed = 0;
let failed = 0;
const check = (cond, msg) => {
  if (cond) {
    console.log('  ✅', msg);
    passed++;
  } else {
    console.error('  ❌', msg);
    failed++;
  }
};

// 卸载所有 listener,确保测试间不串
const clearAllListeners = () => listenerMap.clear();

console.log('🧪 MatrixRain.installGlobalErrorHandler() 全局错误兜底测试');
console.log('─'.repeat(60));

// ==================== Test 1: 函数存在 + 可调用 ====================
console.log('\n[1] installGlobalErrorHandler 存在且可调用');
{
  check(
    typeof MatrixRain.installGlobalErrorHandler === 'function',
    'MatrixRain.installGlobalErrorHandler 是 function'
  );
}

// ==================== Test 2: 返回 remove 函数 ====================
console.log('\n[2] 返回 remove 函数');
{
  let calls = 0;
  const remove = MatrixRain.installGlobalErrorHandler({ onError: () => calls++ });
  check(typeof remove === 'function', '返回值是 function(卸载句柄)');
  remove();
}

// ==================== Test 3: 监听 window.error 事件 ====================
console.log('\n[3] 监听 window.error 事件');
{
  clearAllListeners();
  const captured = [];
  const remove = MatrixRain.installGlobalErrorHandler({
    onError: (e) => captured.push(e),
  });

  // 触发 ErrorEvent
  const evt = new ErrorEventShim('error', {
    message: 'boom',
    filename: 'app.js',
    lineno: 42,
    colno: 7,
  });
  mockWindow.dispatchEvent(evt);

  check(captured.length === 1, 'onError 被调用 1 次');
  check(captured[0]?.type === 'error', "type === 'error'");
  check(captured[0]?.message === 'boom', "message === 'boom'");
  check(captured[0]?.filename === 'app.js', "filename === 'app.js'");
  check(captured[0]?.line === 42, 'line === 42');
  check(captured[0]?.col === 7, 'col === 7');

  remove();
}

// ==================== Test 4: 监听 window.unhandledrejection 事件 ====================
console.log('\n[4] 监听 window.unhandledrejection 事件');
{
  clearAllListeners();
  const captured = [];
  const remove = MatrixRain.installGlobalErrorHandler({
    onError: (e) => captured.push(e),
  });

  const rejEvt = new PromiseRejectionEventShim('unhandledrejection', {
    reason: new Error('async-bang'),
  });
  mockWindow.dispatchEvent(rejEvt);

  check(captured.length === 1, 'onError 被调用 1 次');
  check(captured[0]?.type === 'unhandledrejection', "type === 'unhandledrejection'");
  check(captured[0]?.message === 'async-bang', "message === 'async-bang'(从 Error.reason 提取)");
  check(captured[0]?.filename === undefined, 'unhandledrejection 无 filename');

  remove();
}

// ==================== Test 5: reason 是字符串 ====================
console.log('\n[5] unhandledrejection.reason 是 string');
{
  clearAllListeners();
  const captured = [];
  const remove = MatrixRain.installGlobalErrorHandler({
    onError: (e) => captured.push(e),
  });

  class PromiseRejectionEventShim extends Event {
    constructor(type, init) {
      super(type, init);
      this.reason = init?.reason;
    }
  }
  const rejEvt = new PromiseRejectionEventShim('unhandledrejection', {
    reason: 'just a string',
  });
  mockWindow.dispatchEvent(rejEvt);

  check(captured.length === 1, 'onError 被调用 1 次');
  check(captured[0]?.message === 'just a string', 'message 透传 string reason');

  remove();
}

// ==================== Test 6: reason 是 object(走 String() 兜底)====================
console.log('\n[6] unhandledrejection.reason 是 object(走 String() 兜底)');
{
  clearAllListeners();
  const captured = [];
  const remove = MatrixRain.installGlobalErrorHandler({
    onError: (e) => captured.push(e),
  });

  class PromiseRejectionEventShim extends Event {
    constructor(type, init) {
      super(type, init);
      this.reason = init?.reason;
    }
  }
  const rejEvt = new PromiseRejectionEventShim('unhandledrejection', {
    reason: { code: 500, msg: 'server fail' },
  });
  mockWindow.dispatchEvent(rejEvt);

  check(captured.length === 1, 'onError 被调用 1 次');
  check(
    typeof captured[0]?.message === 'string' && captured[0].message.length > 0,
    'message 是非空字符串'
  );

  remove();
}

// ==================== Test 7: remove() 后不再触发 ====================
console.log('\n[7] remove() 后 listener 全部解绑,不再触发');
{
  clearAllListeners();
  let calls = 0;
  const remove = MatrixRain.installGlobalErrorHandler({
    onError: () => calls++,
  });
  check(calls === 0, '安装后尚未触发 → calls=0');

  // 触发一次
  mockWindow.dispatchEvent(new ErrorEventShim('error', { message: 'a' }));
  check(calls === 1, '触发 1 次 → calls=1');

  // 卸载
  remove();

  // 再触发,应不增加
  mockWindow.dispatchEvent(new ErrorEventShim('error', { message: 'b' }));
  check(calls === 1, 'remove 后再触发 → calls 仍为 1');

  // unhandledrejection 也要被解绑
  mockWindow.dispatchEvent(new PromiseRejectionEventShim('unhandledrejection', { reason: 'c' }));
  check(calls === 1, 'remove 后 unhandledrejection 也不触发');
}

// ==================== Test 8: 多次 install 互不干扰 ====================
console.log('\n[8] 多次 install 互不干扰');
{
  clearAllListeners();
  const a = [];
  const b = [];
  const removeA = MatrixRain.installGlobalErrorHandler({ onError: (e) => a.push(e) });
  const removeB = MatrixRain.installGlobalErrorHandler({ onError: (e) => b.push(e) });

  mockWindow.dispatchEvent(new ErrorEventShim('error', { message: 'shared' }));

  check(a.length === 1, 'handler A 收到事件');
  check(b.length === 1, 'handler B 收到事件');

  // 只卸载 A,B 不受影响
  removeA();
  mockWindow.dispatchEvent(new ErrorEventShim('error', { message: 'after' }));
  check(a.length === 1, 'handler A 不再收到(已卸载)');
  check(b.length === 2, 'handler B 仍正常收到');

  removeB();
}

// ==================== Test 9: 用户回调 throw 不影响其他 listener ====================
console.log('\n[9] 用户回调 throw 不影响其他 listener');
{
  clearAllListeners();
  const captured = [];
  const removeBad = MatrixRain.installGlobalErrorHandler({
    onError: () => {
      throw new Error('user cb broken');
    },
  });
  const removeGood = MatrixRain.installGlobalErrorHandler({
    onError: (e) => captured.push(e),
  });

  // 真实 DOM 行为:一个 listener 抛错不影响同事件的其他 listener
  // 我们的 mock dispatchEvent 已经包了 try/catch(见 mockWindow.dispatchEvent)
  // 但 installGlobalErrorHandler 内部也包了一层 try/catch,所以回调 throw 不会爆
  mockWindow.dispatchEvent(new ErrorEventShim('error', { message: 'safe' }));
  check(captured.length === 1, 'good handler 仍收到事件(坏 handler throw 不影响)');
  check(captured[0]?.message === 'safe', 'message 正确传递');

  removeBad();
  removeGood();
}

// ==================== Test 10: 缺 onError → throw TypeError ====================
console.log('\n[10] 缺 opts.onError → 抛 TypeError');
{
  let threw = false;
  try {
    // @ts-expect-error: 故意传错
    MatrixRain.installGlobalErrorHandler({});
  } catch (e) {
    threw = e instanceof TypeError;
  }
  check(threw, 'opts.onError 不是 function 时抛 TypeError');
}

console.log('─'.repeat(60));
console.log(`${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
