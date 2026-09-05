// Vitest 配置 · 单元测试
// environment: node(纯 Node 环境,DOM 由 test/unit/setup.ts mock)
// setupFiles: test/unit/setup.ts(每个 spec 前自动注入 mock DOM)
// include: test/unit/**/*.spec.ts
// alias: '@/' → 'src/' + '~/' → 'types/' —— 让 spec 用绝对路径 import
// 注:Stage 1A 同期若有自己的 vitest.config.ts,merge 时需保留 setupFiles + alias。
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/unit/**/*.spec.ts'],
    setupFiles: ['test/unit/setup.ts'],
    // P1-1 加固:fail 时也要拿到 coverage 信号
    // - bail: 1 —— 找到第一个 fail 就停,避免后续 spec 跑死
    // - reporters: default + json —— json 落盘到 coverage/.summary.json,fail 时 CI 仍能读
    //   (text reporter 走 stdout,fail 时 vitest 4 仍打印,加 json 是双保险)
    bail: 1,
    reporters: ['default', ['json', { outputFile: './coverage/.summary.json' }]],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts', 'src/**/*.css'],
    },
  },
});