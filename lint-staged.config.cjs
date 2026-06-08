// 仅对暂存文件跑 lint+format, 速度快
// 第一轮不阻塞 commit (eslint 走 warn), 仅运行 prettier --write 自动整理
module.exports = {
  'src/**/*.{ts,tsx}': ['eslint --fix', 'prettier --write'],
  'site/src/**/*.{ts,tsx,vue}': ['eslint --fix', 'prettier --write'],
  '*.{json,md,cjs,js,mjs}': ['prettier --write'],
  'src/**/*.css': ['prettier --write'],
  'site/src/**/*.css': ['prettier --write'],
};
