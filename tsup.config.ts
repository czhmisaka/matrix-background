import { defineConfig } from 'tsup';

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
    minify: false,
    target: 'es2020',
    splitting: false,
    treeshake: true,
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
