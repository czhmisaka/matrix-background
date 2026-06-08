/**
 * E2E 截图测试:12 路由 × 2 viewport(桌面 + 移动)= 24 张 PNG
 *
 * 目的:对 site/dist 部署产物做视觉巡检,记录每条路由在 desktop / mobile
 *      两个视口下的渲染情况,作为 CI 巡检 + 视觉回归基线。
 *
 * 流程:
 *   1. 启动 `vite preview --port 4173`(产物在 site/dist)
 *   2. playwright headless chromium 打开 12 路由 × 2 viewport
 *   3. 等 networkidle + 短暂 waitForTimeout 让 canvas paint 完
 *   4. 截全页 PNG → docs/e2e-2026-06-08/<id>-<slug>-<viewport>.png
 *   5. 收集每条路由的 console.error / pageerror,生成报告
 *
 * 跑法:
 *   node test/e2e-screenshots.mjs
 *
 * 注意:不依赖 npm test 链路(test 目录独立);不在此跑 axe
 *      (axe 数据来自 /tmp/a11y-axe-2026-06-08.json,见报告交叉引用)。
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE_DIR = path.join(ROOT, 'site');
const OUT_DIR = path.join(ROOT, 'docs', 'e2e-2026-06-08');
const REPORT_JSON = path.join(OUT_DIR, 'report.json');
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

// ---------- 路由映射(顺序与编号固定) ----------
const ROUTES = [
  { id: '00', slug: 'home', name: 'Home', path: '/' },
  { id: '01', slug: 'playground', name: 'Playground', path: '/playground' },
  { id: '02', slug: 'tutorial', name: 'Tutorial', path: '/tutorial' },
  { id: '03', slug: 'docs', name: 'Docs', path: '/docs' },
  { id: '10', slug: 'element', name: 'DemoElement', path: '/demos/element' },
  { id: '11', slug: 'events', name: 'DemoEvents', path: '/demos/events' },
  { id: '12', slug: 'themes', name: 'DemoThemes', path: '/demos/themes' },
  { id: '13', slug: 'noise-converge', name: 'DemoNoiseConverge', path: '/demos/noise-converge' },
  { id: '14', slug: 'blog', name: 'DemoBlog', path: '/demos/blog' },
  { id: '15', slug: 'ai-tune', name: 'DemoAITune', path: '/demos/ai-tune' },
  { id: '90', slug: 'legacy', name: 'Legacy', path: '/legacy' },
  { id: '99', slug: '404', name: 'NotFound', path: '/this-route-does-not-exist' },
];

const VIEWPORTS = [
  { tag: 'desktop', width: 1440, height: 900 },
  { tag: 'mobile', width: 375, height: 812 },
];

// ---------- 启动 vite preview ----------
function startPreview() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
      cwd: SITE_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const onData = (chunk) => {
      const s = chunk.toString();
      process.stdout.write(`[preview] ${s}`);
      if (!resolved && /Local:\s+http/i.test(s)) {
        resolved = true;
        resolve(proc);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (c) => process.stderr.write(`[preview-err] ${c}`));

    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (!resolved) reject(new Error(`preview exited early with ${code}`));
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(proc);
      }
    }, 4000);
  });
}

async function waitForReady(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// ---------- 主流程 ----------
async function main() {
  // 清空旧目录,确保 24 张全新
  if (existsSync(OUT_DIR)) {
    await rm(OUT_DIR, { recursive: true, force: true });
  }
  await mkdir(OUT_DIR, { recursive: true });

  console.log('▶ 启动 vite preview ...');
  const preview = await startPreview();
  const ready = await waitForReady(`${BASE}/`);
  if (!ready) {
    preview.kill('SIGTERM');
    throw new Error(`preview server ${BASE} not ready`);
  }
  console.log(`✓ preview ready: ${BASE}`);

  const browser = await chromium.launch();
  const results = [];

  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      for (const route of ROUTES) {
        const url = `${BASE}${route.path}`;
        const errors = [];
        const onPageError = (e) => errors.push(`PAGEERROR: ${e.message.slice(0, 240)}`);
        const onConsole = (m) => {
          if (m.type() === 'error') {
            const t = m.text();
            if (t.includes('favicon') || t.includes('Failed to load resource')) return;
            errors.push(`console.error: ${t.slice(0, 240)}`);
          }
        };
        page.on('pageerror', onPageError);
        page.on('console', onConsole);

        const t0 = Date.now();
        let httpStatus = null;
        try {
          const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
          httpStatus = resp ? resp.status() : null;
          // 等 canvas paint 1-2 帧
          await page.waitForTimeout(800);
        } catch (e) {
          errors.push(`goto-failed: ${String(e).slice(0, 240)}`);
        }

        // 体检:页面是否非空(有 main 或 canvas)
        const bodyProbe = await page.evaluate(() => {
          const main = document.querySelector('main');
          const canvas = document.querySelector('canvas');
          const headings = document.querySelectorAll('h1, h2, h3');
          return {
            mainExists: !!main,
            mainText: main ? (main.innerText || '').trim().slice(0, 200) : '',
            canvasCount: document.querySelectorAll('canvas').length,
            headingCount: headings.length,
            bodyHeight: document.body.scrollHeight,
            title: document.title,
          };
        });

        const filename = `${route.id}-${route.slug}-${vp.tag}.png`;
        const outPath = path.join(OUT_DIR, filename);

        try {
          await page.screenshot({ path: outPath, fullPage: true });
        } catch (e) {
          errors.push(`screenshot-failed: ${String(e).slice(0, 200)}`);
        }

        const fileStat = existsSync(outPath) ? await stat(outPath) : null;
        const ms = Date.now() - t0;

        results.push({
          id: route.id,
          slug: route.slug,
          name: route.name,
          path: route.path,
          viewport: vp.tag,
          width: vp.width,
          height: vp.height,
          url,
          http_status: httpStatus,
          duration_ms: ms,
          file: filename,
          file_size_bytes: fileStat ? fileStat.size : 0,
          probe: bodyProbe,
          errors,
        });

        page.off('pageerror', onPageError);
        page.off('console', onConsole);
        console.log(
          `  ${route.id}-${route.slug} @ ${vp.tag.padEnd(7)} → ${httpStatus ?? '???'}  ${(fileStat ? fileStat.size : 0).toString().padStart(8)}B  ${ms}ms  errs=${errors.length}`
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
    preview.kill('SIGTERM');
    // 等子进程退出
    await new Promise((r) => setTimeout(r, 300));
  }

  // 写 report.json
  await writeFile(REPORT_JSON, JSON.stringify(results, null, 2));
  console.log(`\n✓ wrote ${REPORT_JSON}`);

  // 简单统计
  const total = results.length;
  const ok = results.filter((r) => r.http_status === 200 && r.errors.length === 0).length;
  const withErr = results.filter((r) => r.errors.length > 0).length;
  const blank = results.filter(
    (r) => r.probe.bodyHeight < 100 || r.probe.headingCount === 0
  ).length;
  const totalBytes = results.reduce((a, b) => a + b.file_size_bytes, 0);
  console.log(
    `\n汇总: ${total} 张 (期望 24) | HTTP 200 & 无 console.error: ${ok} | 含 error: ${withErr} | 空白嫌疑: ${blank} | 总大小: ${(totalBytes / 1024).toFixed(1)} KB`
  );

  if (total !== 24) {
    throw new Error(`expected 24 screenshots, got ${total}`);
  }
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
