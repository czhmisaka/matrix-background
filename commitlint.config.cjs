// Conventional Commits 校验 · matrix-rain
// 与现有 git log 风格对齐: feat / fix / docs / chore / refactor / test / perf / style / ci / build
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 与现有 commit 风格对齐
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'chore',
        'refactor',
        'test',
        'perf',
        'style',
        'ci',
        'build',
        'revert',
      ],
    ],
    'subject-case': [0], // 允许中文 subject, 不强制 case
    'header-max-length': [2, 'always', 120], // 审计标题较长, 放宽
    'body-max-line-length': [0], // 不限制 body 行长 (审计报告很长)
    'footer-max-line-length': [0],
  },
};
