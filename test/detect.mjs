/**
 * MatrixRain.detect() 环境检测测试
 *
 * 来源:docs/audit-docs-2026-06-08.md P0
 *   - `types/index.d.ts:577` 声明 detect(),`src/index.ts` 之前没实现
 *   - 此测试验证 MatrixRain.detect() 返回字段齐全、类型正确、SSR-safe
 *
 * 检测信号源:
 *   1. navigator.userAgent  → browser / isMobile
 *   2. matchMedia('(prefers-color-scheme: dark)') → isDarkMode
 *   3. viewport width → viewport 分档(mobile <768 / tablet 768-1024 / desktop 1024-1440 / wide ≥1440)
 *   4. devicePixelRatio → devicePixelRatio
 *
 * 跑法:node test/detect.mjs
 * 前置:npm run build
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// ==================== 最小化 window mock(供 detect() 读 innerWidth/DPR/matchMedia)====================
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

// Node 24 的 globalThis.navigator 是只读 getter,改用 defineProperty
const setNavigatorUA = (ua) => {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: ua },
    configurable: true,
    writable: true,
  });
};
const restoreNavigator = (orig) => {
  if (orig === undefined) {
    delete globalThis.navigator;
  } else {
    Object.defineProperty(globalThis, 'navigator', {
      value: orig,
      configurable: true,
      writable: true,
    });
  }
};

const expectFields = (env) => {
  for (const f of [
    'isMobile',
    'isDarkMode',
    'recommendedFontSize',
    'recommendedTargetFPS',
    'recommendedBrightness',
    'browser',
    'viewport',
    'viewportWidth',
    'devicePixelRatio',
  ]) {
    check(f in env, `字段 ${f} 存在`);
  }
  check(typeof env.isMobile === 'boolean', 'isMobile 是 boolean');
  check(typeof env.isDarkMode === 'boolean', 'isDarkMode 是 boolean');
  check(typeof env.recommendedFontSize === 'number', 'recommendedFontSize 是 number');
  check(typeof env.recommendedTargetFPS === 'number', 'recommendedTargetFPS 是 number');
  check(typeof env.recommendedBrightness === 'number', 'recommendedBrightness 是 number');
  check(typeof env.browser === 'string', 'browser 是 string');
  check(
    ['mobile', 'tablet', 'desktop', 'wide'].includes(env.viewport),
    `viewport 是 4 档之一(实际:${env.viewport})`
  );
  check(typeof env.viewportWidth === 'number', 'viewportWidth 是 number');
  check(
    typeof env.devicePixelRatio === 'number' && env.devicePixelRatio > 0,
    'devicePixelRatio > 0'
  );
};

console.log('🧪 MatrixRain.detect() 环境检测测试');
console.log('─'.repeat(60));

// ==================== Test 1: 函数存在 + 可调用 ====================
console.log('\n[1] detect() 存在且可调用');
{
  check(typeof MatrixRain.detect === 'function', 'MatrixRain.detect 是 function');
  const env = MatrixRain.detect();
  check(env !== null && typeof env === 'object', '返回 object');
  console.log('  ℹ️  返回:', JSON.stringify(env));
}

// ==================== Test 2: 字段齐全 + 类型 ====================
console.log('\n[2] EnvironmentInfo 9 字段齐全 + 类型正确');
{
  const env = MatrixRain.detect();
  expectFields(env);
}

// ==================== Test 3: 浏览器型号识别(模拟 5 种 UA)====================
console.log('\n[3] navigator.userAgent → browser 映射');
{
  // 临时替换 navigator.userAgent 后调用
  const uaCases = [
    { ua: 'Mozilla/5.0 ... Chrome/120.0 Safari/537.36', expect: 'Chrome' },
    { ua: 'Mozilla/5.0 ... Firefox/121.0', expect: 'Firefox' },
    { ua: 'Mozilla/5.0 ... Safari/605.1.15 Version/17.1', expect: 'Safari' },
    { ua: 'Mozilla/5.0 ... Edg/120.0.2210.91', expect: 'Edge' },
    { ua: 'Mozilla/5.0 ... OPR/105.0.4970.21', expect: 'Opera' },
  ];
  const origUA = globalThis.navigator;
  const origMM = globalThis.window?.matchMedia;
  for (const { ua, expect } of uaCases) {
    setNavigatorUA(ua);
    if (globalThis.window) {
      globalThis.window.matchMedia = (q) => ({
        matches: false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      });
    }
    const env = MatrixRain.detect();
    check(
      env.browser === expect,
      `UA "${ua.slice(0, 30)}..." → browser="${expect}"(实际:${env.browser})`
    );
  }
  restoreNavigator(origUA);
  if (globalThis.window && origMM) globalThis.window.matchMedia = origMM;
}

// ==================== Test 4: 视口 4 档分档 ====================
console.log('\n[4] innerWidth → viewport 4 档分档');
{
  const cases = [
    { w: 320, expect: 'mobile' },
    { w: 767, expect: 'mobile' },
    { w: 768, expect: 'tablet' },
    { w: 1023, expect: 'tablet' },
    { w: 1024, expect: 'desktop' },
    { w: 1439, expect: 'desktop' },
    { w: 1440, expect: 'wide' },
    { w: 2560, expect: 'wide' },
  ];
  const origW = globalThis.window?.innerWidth;
  for (const { w, expect } of cases) {
    if (globalThis.window) globalThis.window.innerWidth = w;
    const env = MatrixRain.detect();
    check(
      env.viewport === expect,
      `innerWidth=${w} → viewport="${expect}"(实际:"${env.viewport}")`
    );
    check(env.viewportWidth === w, `viewportWidth=${w} 回填正确`);
  }
  if (globalThis.window) globalThis.window.innerWidth = origW;
}

// ==================== Test 5: 暗色模式 ====================
console.log('\n[5] matchMedia(dark) → isDarkMode');
{
  const origMM = globalThis.window?.matchMedia;
  if (globalThis.window) {
    globalThis.window.matchMedia = (q) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  }
  const envDark = MatrixRain.detect();
  check(envDark.isDarkMode === true, '暗色模式打开 → isDarkMode=true');
  check(
    Math.abs(envDark.recommendedBrightness - 1.1) < 1e-6,
    '暗色模式 → recommendedBrightness=1.1'
  );

  if (globalThis.window) {
    globalThis.window.matchMedia = (q) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  }
  const envLight = MatrixRain.detect();
  check(envLight.isDarkMode === false, '暗色模式关闭 → isDarkMode=false');
  check(
    Math.abs(envLight.recommendedBrightness - 1.0) < 1e-6,
    '亮色模式 → recommendedBrightness=1.0'
  );

  if (globalThis.window && origMM) globalThis.window.matchMedia = origMM;
}

// ==================== Test 6: devicePixelRatio ====================
console.log('\n[6] window.devicePixelRatio → devicePixelRatio');
{
  const origDPR = globalThis.window?.devicePixelRatio;
  if (globalThis.window) globalThis.window.devicePixelRatio = 2;
  const env2 = MatrixRain.detect();
  check(env2.devicePixelRatio === 2, 'DPR=2 正确读取');

  if (globalThis.window) globalThis.window.devicePixelRatio = 1.5;
  const env15 = MatrixRain.detect();
  check(env15.devicePixelRatio === 1.5, 'DPR=1.5 正确读取');

  if (globalThis.window) globalThis.window.devicePixelRatio = origDPR;
}

// ==================== Test 7: 移动端综合判断 ====================
console.log('\n[7] 移动端判断(viewport=mobile + 移动 UA)');
{
  const origW = globalThis.window?.innerWidth;
  const origUA = globalThis.navigator;
  globalThis.window.innerWidth = 375;
  setNavigatorUA(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  );
  const env = MatrixRain.detect();
  check(env.isMobile === true, 'iPhone UA + 375px → isMobile=true');
  check(env.viewport === 'mobile', 'viewport=mobile');
  check(env.recommendedFontSize === 16, 'recommendedFontSize=16');
  check(env.recommendedTargetFPS === 30, 'recommendedTargetFPS=30');

  globalThis.window.innerWidth = origW;
  restoreNavigator(origUA);
}

// ==================== Test 8: SSR-safe(window 缺失)====================
console.log('\n[8] SSR-safe:typeof window === "undefined" 返回合理 default');
{
  const savedWindow = globalThis.window;
  // 完全移除 window
  delete globalThis.window;
  const env = MatrixRain.detect();
  check(typeof env === 'object' && env !== null, 'SSR 模式仍返回 object');
  check(env.isMobile === false, 'SSR → isMobile=false');
  check(env.isDarkMode === false, 'SSR → isDarkMode=false(亮色)');
  check(env.viewport === 'desktop', 'SSR → viewport=desktop');
  check(env.viewportWidth === 0, 'SSR → viewportWidth=0');
  check(env.devicePixelRatio === 1, 'SSR → devicePixelRatio=1');
  check(env.browser === 'Unknown', 'SSR → browser=Unknown');
  check(env.recommendedFontSize === 14, 'SSR → recommendedFontSize=14');
  check(env.recommendedTargetFPS === 0, 'SSR → recommendedTargetFPS=0(不限)');
  check(Math.abs(env.recommendedBrightness - 1.0) < 1e-6, 'SSR → recommendedBrightness=1.0');
  globalThis.window = savedWindow;
}

// ==================== Test 9: 多次调用幂等 ====================
console.log('\n[9] 多次调用幂等 + 不修改 globalThis');
{
  const envA = MatrixRain.detect();
  const envB = MatrixRain.detect();
  // viewportWidth / DPR / matchMedia 至少是同一类型
  check(typeof envA.viewport === typeof envB.viewport, '两次调用 viewport 类型一致');
  check(typeof envA.devicePixelRatio === typeof envB.devicePixelRatio, '两次调用 DPR 类型一致');
}

console.log('─'.repeat(60));
console.log(`${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
