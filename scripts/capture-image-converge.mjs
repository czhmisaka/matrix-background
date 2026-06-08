/**
 * Playwright screenshot for image-converge demo
 *
 * Captures:
 *   docs/playwright/image-converge-noise.png    — 噪声阶段(t≈0.3s)
 *   docs/playwright/image-converge-converge.png — 收敛阶段(t≈1.2s)
 *   docs/playwright/image-converge-hold.png     — 完整呈现(t≈3.0s)
 *
 * 跑法:
 *   1. cd /Users/chenzhihan/Desktop/matrix-rain-package
 *   2. (终端 1) cd site && npx vite --port 5173 &
 *   3. (终端 2) node scripts/capture-image-converge.mjs
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'docs', 'playwright');
const BASE = process.env.BASE || 'http://localhost:5173';

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

console.log('🎬 启动 playwright 截图(image-converge 涌现动画)');
console.log('  BASE:', BASE);
console.log('  OUT_DIR:', OUT_DIR);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

// 错误收集
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message.slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 200)}`);
});

console.log('\n[1] 导航到 /demos/image-converge');
await page.goto(`${BASE}/demos/image-converge`, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForSelector('canvas', { timeout: 10000 });
// 滚到 page 顶部(canvas 之后)
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);

console.log('[2] 点击 Heart 预设');
// 找到 Heart 按钮(aria-label="使用预设 Heart")并点击
await page.locator('button[aria-label="使用预设 Heart"]').click({ timeout: 5000 });
// 滚回顶部,确保 canvas + phase indicator 在 viewport
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(200);

// 立刻(noise fade-in 0.3s 阶段)截 noise
await page.waitForTimeout(50);
console.log('[3] 截图: noise 阶段(t≈0.05s)');
await page.screenshot({ path: path.join(OUT_DIR, 'image-converge-noise.png'), fullPage: false });

// converge 中段(t≈1.0s)
await page.waitForTimeout(900);
console.log('[4] 截图: converge 阶段(t≈1.0s)');
await page.screenshot({ path: path.join(OUT_DIR, 'image-converge-converge.png'), fullPage: false });

// hold 完整(t≈3.0s)
await page.waitForTimeout(2000);
console.log('[5] 截图: hold 阶段(t≈3.0s)');
await page.screenshot({ path: path.join(OUT_DIR, 'image-converge-hold.png'), fullPage: false });

// 验证 phase 状态
const phase = await page
  .locator('.phase')
  .textContent()
  .catch(() => 'unknown');
const lockedText = await page
  .locator('.time')
  .textContent()
  .catch(() => 'unknown');
console.log(`\n  phase 状态: ${phase}`);
console.log(`  ${lockedText}`);

if (errors.length > 0) {
  console.error('\n❌ 错误:');
  for (const e of errors) console.error('  ', e);
}

await browser.close();
console.log('\n✅ 截图完成:');
console.log('  -', path.join(OUT_DIR, 'image-converge-noise.png'));
console.log('  -', path.join(OUT_DIR, 'image-converge-converge.png'));
console.log('  -', path.join(OUT_DIR, 'image-converge-hold.png'));
console.log(errors.length === 0 ? '' : `\n⚠ ${errors.length} 错误,见上`);
