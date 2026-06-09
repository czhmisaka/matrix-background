/**
 * @xietuier/matrix-rain · 站点本地资产拷贝脚本
 *
 * 把 dist/index.umd.js + dist/matrix-rain.css 拷到 site/public/matrix-rain/
 * site 教程页 / vercel 部署都从该路径走（per 用户偏好"完全本地部署、少用 CDN"）。
 *
 * 用法（在 site 内自动触发）:
 *   - site/package.json `predev` / `prebuild` 会调用此脚本
 *   - 手动:  node scripts/copy-site-assets.mjs
 *
 * @since 0.4.0
 */

import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const TARGET_DIR = join(ROOT, 'site', 'public', 'matrix-rain');

const FILES = [
  { from: 'index.umd.js', to: 'index.umd.js' },
  { from: 'matrix-rain.css', to: 'matrix-rain.css' },
];

function ensureBuilt() {
  if (!existsSync(DIST)) {
    console.error('[copy-site-assets] ERROR: dist/ 不存在。请先运行 `npm run build`');
    process.exit(1);
  }
  for (const { from } of FILES) {
    const src = join(DIST, from);
    if (!existsSync(src)) {
      console.error(`[copy-site-assets] ERROR: ${src} 不存在。请先运行 \`npm run build\``);
      process.exit(1);
    }
  }
}

function main() {
  ensureBuilt();
  if (!existsSync(TARGET_DIR)) mkdirSync(TARGET_DIR, { recursive: true });

  for (const { from, to } of FILES) {
    const src = join(DIST, from);
    const dst = join(TARGET_DIR, to);
    copyFileSync(src, dst);
    const sz = statSync(dst).size;
    console.log(
      `[copy-site-assets] ✓ ${from} → site/public/matrix-rain/${to} (${(sz / 1024).toFixed(1)} KB)`
    );
  }
}

main();
