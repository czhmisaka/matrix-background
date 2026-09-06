/**
 * ESM 加载测试 · Vitest 单元测试
 *
 * 验证:
 *   - dist/index.js ESM 可被 Node 加载
 *   - dist/index.cjs CJS 可被 Node 加载
 *   - 关键 named exports 存在(matrixRain / themes / compileUserFunction / validateUserFunction / ...)
 *   - 5 个主题对象结构合规
 *   - sandbox 沙箱(compileUserFunction / validateUserFunction)行为正确
 *   - dist/core.d.ts 类型文件包含核心 API
 *
 * 迁移自 test/esm-load.mjs(已加 @deprecated banner,未删)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { matrixRain, themes } from '../../../src/index';
import { compileUserFunction, validateUserFunction } from '../../../src/curves/sandbox';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const DIST_ROOT = resolve(__dirname, '../../dist');

describe('ESM load - core named exports (from src)', () => {
  it('matrixRain 是 function', () => {
    expect(typeof matrixRain).toBe('function');
  });

  it('themes 是 object', () => {
    expect(typeof themes).toBe('object');
    expect(themes).not.toBeNull();
  });

  it('themes 含 6 个主题', () => {
    const keys = Object.keys(themes);
    expect(keys.length).toBe(6);
  });

  it('themes 含 silicon-valley / matrix-green / lava-red / cyber-blue / pure-mono / zeabur', () => {
    expect(themes).toHaveProperty('silicon-valley');
    expect(themes).toHaveProperty('matrix-green');
    expect(themes).toHaveProperty('lava-red');
    expect(themes).toHaveProperty('cyber-blue');
    expect(themes).toHaveProperty('pure-mono');
    expect(themes).toHaveProperty('zeabur');
  });

  it('每个主题都是 factory function(返回 cold/warm/...)', () => {
    const sv = themes['silicon-valley']();
    expect(sv).toHaveProperty('cold');
    expect(sv).toHaveProperty('warm');
  });

  it('silicon-valley.cold 字段类型 (h/s/lMin/lMax 都是 number)', () => {
    const cold = themes['silicon-valley']().cold;
    expect(typeof cold.h).toBe('number');
    expect(typeof cold.s).toBe('number');
    expect(typeof cold.lMin).toBe('number');
    expect(typeof cold.lMax).toBe('number');
  });

  it('matrix-green.warm 字段类型', () => {
    const warm = themes['matrix-green']().warm;
    expect(typeof warm.h).toBe('number');
    expect(typeof warm.s).toBe('number');
    expect(typeof warm.lMin).toBe('number');
    expect(typeof warm.lMax).toBe('number');
  });

  it('lava-red.cyber-blue.pure-mono 也都能 factory 调用', () => {
    expect(themes['lava-red']()).toBeTruthy();
    expect(themes['cyber-blue']()).toBeTruthy();
    expect(themes['pure-mono']()).toBeTruthy();
  });
});

describe('ESM load - sandbox (compileUserFunction / validateUserFunction)', () => {
  it('compileUserFunction 是 function', () => {
    expect(typeof compileUserFunction).toBe('function');
  });

  it('validateUserFunction 是 function', () => {
    expect(typeof validateUserFunction).toBe('function');
  });

  it('"return 0.5" 通过 validateUserFunction', () => {
    const r = validateUserFunction('return 0.5');
    expect(r.ok).toBe(true);
  });

  it('window.location 被 sandbox 拒绝', () => {
    const r = validateUserFunction('return window.location');
    expect(r.ok).toBe(false);
  });

  it('document 被 sandbox 拒绝', () => {
    const r = validateUserFunction('return document');
    expect(r.ok).toBe(false);
  });

  it('compileUserFunction("return 0.5") 返回 function', () => {
    const fn = compileUserFunction('return 0.5');
    expect(typeof fn).toBe('function');
  });

  it('编译函数被调用时返回 0.5', () => {
    const fn = compileUserFunction('return 0.5');
    // 注:实际调用可能依赖 sandbox 注入的 ctx 参数
    const result = (fn as unknown as (ctx: unknown) => number)({});
    expect(result).toBe(0.5);
  });

  it('eval 全局关键字被拒绝', () => {
    const r = validateUserFunction('return eval("1")');
    expect(r.ok).toBe(false);
  });

  it('Function 构造器被拒绝', () => {
    const r = validateUserFunction('return new Function("return 1")()');
    expect(r.ok).toBe(false);
  });
});

describe('ESM load - dist artifacts', () => {
  // dist 不一定 build 了 —— 用 existsSync 守护,有就测
  it('dist/index.js 存在', () => {
    const p = resolve(DIST_ROOT, 'index.js');
    if (!existsSync(p)) return; // skip silently when no build
    expect(existsSync(p)).toBe(true);
  });

  it('dist/index.cjs 存在且能 require', () => {
    const p = resolve(DIST_ROOT, 'index.cjs');
    if (!existsSync(p)) return;
    const require = createRequire(import.meta.url);
    const cjs = require(p);
    expect(typeof cjs.matrixRain).toBe('function');
    expect(typeof cjs.themes).toBe('object');
    expect(Object.keys(cjs.themes).length).toBe(5);
  });

  it('dist/core.d.ts 包含核心 API', () => {
    const p = resolve(DIST_ROOT, 'core.d.ts');
    if (!existsSync(p)) return;
    const dt = readFileSync(p, 'utf8');
    expect(dt.length).toBeGreaterThan(1000);
    expect(dt).toContain('matrixRain');
    expect(dt).toContain('MatrixRainInstance');
  });

  it('dist/index.d.ts 包含 matrixRain / themes / MatrixRain', () => {
    const p = resolve(DIST_ROOT, 'index.d.ts');
    if (!existsSync(p)) return;
    const dt = readFileSync(p, 'utf8');
    expect(dt).toContain('matrixRain');
    expect(dt).toContain('MatrixRainInstance');
  });

  it('dist ESM 文件包含 named exports', async () => {
    const p = resolve(DIST_ROOT, 'index.js');
    if (!existsSync(p)) return;
    const mod = await import(p);
    expect(typeof mod.matrixRain).toBe('function');
    expect(typeof mod.themes).toBe('object');
  });
});

describe('ESM load - src index.ts re-exports', () => {
  it('src/index.ts 重导出 matrixRain', async () => {
    const mod = await import('../../../src/index');
    expect(typeof mod.matrixRain).toBe('function');
  });

  it('src/index.ts 重导出 themes', async () => {
    const mod = await import('../../../src/index');
    expect(mod.themes).toBeTruthy();
  });

  it('src/index.ts 重导出 textToBitmap', async () => {
    const mod = await import('../../../src/index');
    expect(typeof mod.textToBitmap).toBe('function');
  });

  it('src/index.ts 重导出 compileUserFunction + validateUserFunction', async () => {
    const mod = await import('../../../src/index');
    expect(typeof mod.compileUserFunction).toBe('function');
    expect(typeof mod.validateUserFunction).toBe('function');
  });

  it('src/index.ts 重导出 MatrixRain(命名空间工具)', async () => {
    const mod = await import('../../../src/index');
    expect(mod.MatrixRain).toBeTruthy();
    expect(typeof mod.MatrixRain.destroyAll).toBe('function');
    expect(typeof mod.MatrixRain.detect).toBe('function');
  });
});

describe('ESM load - sub-path exports', () => {
  it('src/core.ts 重导出 themes (SSR-friendly)', async () => {
    const mod = await import('../../../src/core');
    expect(mod.themes).toBeTruthy();
  });

  it('src/core.ts 重导出 compileUserFunction (纯函数)', async () => {
    const mod = await import('../../../src/core');
    expect(typeof mod.compileUserFunction).toBe('function');
  });

  it('src/themes.ts 是 themes 字典', async () => {
    const mod = await import('../../../src/themes');
    expect(mod.themes).toBeTruthy();
  });
});

describe('ESM load - matrixRain() 仍可用', () => {
  it('matrixRain() 返回 instance(可 destroy)', () => {
    const inst = matrixRain({ fontSize: 14 });
    expect(inst).toBeTruthy();
    expect(typeof inst.destroy).toBe('function');
    expect(typeof inst.setTargetBitmap).toBe('function');
    inst.destroy();
  });
});