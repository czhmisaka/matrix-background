/**
 * Build size gate (0.5.0+)
 *
 * 目的: 防止 dist 体积随提交膨胀。
 * 门槛: dist/index.js (esm 主入口) gzip ≤ 32KB
 *
 * 0.5.0 当前: ~28.6KB gzip(包含 webgl + webgpu 全部代码, 因 sync API 限制未做 splitting)
 *
 * 用法:  npm run build && npm run test:size
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'dist', 'index.js');
const LIMIT_KB = 32;

const raw = readFileSync(FILE);
const gz = gzipSync(raw);
const rawKb = (raw.length / 1024).toFixed(1);
const gzKb = (gz.length / 1024).toFixed(1);

console.log(`dist/index.js: raw=${rawKb}KB gzip=${gzKb}KB`);

if (gz.length > LIMIT_KB * 1024) {
  console.error(`❌ 体积超 ${LIMIT_KB}KB gzip 上限: ${gzKb}KB`);
  process.exit(1);
}
console.log(`✅ ${gzKb}KB ≤ ${LIMIT_KB}KB`);
