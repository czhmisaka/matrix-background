import { defineConfig } from 'tsup';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json') as { version: string };

const outExt = ({ format }: { format: string }) => {
  if (format === 'cjs') return { js: '.cjs' };
  if (format === 'iife') return { js: '.iife.js' };
  if (format === 'umd') return { js: '.umd.js' };
  return { js: '.js' };
};

export default [
  // 浏览器主入口:ESM + CJS + IIFE + UMD(用 globalName='MatrixRain')
  defineConfig({
    entry: {
      index: 'src/index.ts',
      themes: 'src/themes.ts'
    },
    format: ['esm', 'cjs', 'iife', 'umd'],
    globalName: 'MatrixRain',
    dts: true,
    sourcemap: false,
    clean: true,
    // 0.5.0+: minify 主入口,canvas2d 默认路径 gzip 应 ≤ 32KB
    // 注: webgl/webgpu 走 dynamic import 仍然保留在 main chunk(未做 splitting),
    //     因 matrixRain() 是 sync API,工程上需要 sync 拿到 renderer 实例。
    //     后续 0.6.0 可考虑 Promise 化 matrixRain() 让 webgl/webgpu 真拆出去。
    minify: true,
    target: 'es2020',
    splitting: false,
    treeshake: true,
    // 0.7.1+: 包版本注入 (engine.ts / index.ts 的 __MATRIX_RAIN_VERSION__)
    define: { __MATRIX_RAIN_VERSION__: JSON.stringify(pkg.version) },
    outExtension: outExt
  }),
  // SSR 友好核心:ESM + CJS(无 DOM)
  defineConfig({
    entry: { core: 'src/core.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: false,
    minify: false,
    target: 'es2020',
    splitting: false,
    treeshake: true,
    outExtension: outExt
  }),
  // Web Component 标签 + FPS overlay:ESM + CJS + IIFE + UMD
  defineConfig({
    entry: {
      element: 'src/matrix-rain-element.ts',
      'fps-overlay': 'src/fps-overlay.ts'
    },
    format: ['esm', 'cjs', 'iife', 'umd'],
    globalName: 'MatrixRainElement',
    dts: true,
    sourcemap: false,
    minify: false,
    target: 'es2020',
    splitting: false,
    treeshake: true,
    outExtension: outExt
  })
];
