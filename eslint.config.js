// ESLint flat config · matrix-rain
// 第一轮: 所有规则用 warn 不用 error, 留 TODO 等 src/ 重构后再升级
// TODO(v0.3.0): 升级 @typescript-eslint/no-non-null-assertion 为 error (P1-2, 96 处)
// TODO(v0.3.0): 升级 no-console 为 error (P2-2, 12 处需先清理)
// TODO(v0.3.0): 升级 @typescript-eslint/no-explicit-any 为 error (P1-1b, 11 处需先清理)
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import vuePlugin from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';

export default [
  // 全局忽略
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'site/dist/**',
      'site/node_modules/**',
      'coverage/**',
      '*.min.js',
      'src/fonts/**',
      'test/**', // test/*.mjs 走 node, 暂不 lint
      'scripts/**', // python scripts
    ],
  },

  // src/ TypeScript (library code)
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // === 第一轮 warn (TODO: 后续升 error) ===
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // === 基础 (保留 error, 这些不会因为 src 现状炸) ===
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',

      // === 关闭与 strict TS 重复的 ===
      'no-undef': 'off', // TS 自己检查
      'no-unused-vars': 'off', // 走 @typescript-eslint/no-unused-vars
    },
  },

  // site/ TypeScript (Vue demo 站点)
  {
    files: ['site/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: { ...globals.browser },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // site/ 是 demo 代码, 规则比 src/ 略宽松
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },

  // site/ Vue 单文件组件
  {
    files: ['site/src/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: { ...globals.browser },
    },
    plugins: {
      vue: vuePlugin,
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Vue3 基础规则 (仅最稳的几条, 不强制风格)
      'vue/multi-word-component-names': 'off', // demo 用 Home/About 单词名
      'vue/no-v-html': 'warn', // P0 安全: v-html 走 warn (审计已有 finding)
      'vue/no-unused-components': 'warn',
      'vue/no-unused-vars': 'warn',
      'vue/require-v-for-key': 'warn',
      'vue/no-mutating-props': 'warn',

      // TS 规则同 site/
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
];
