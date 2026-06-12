/**
 * renderer-pixel.mjs · Phase 1 真像素对比测试 (P2-1)
 *
 * 目的:
 *   0.4.0 假实现灾难证明: Node 端 MockCanvas "只验不抛" 无法证明 renderer 真的画对。
 *   本测试在真浏览器 (Playwright Chromium) 中启动 canvas2d / webgl / webgpu,
 *   抓 canvas 像素与 canvas2d 基准做对比, 防止假实现回归。
 *
 * 通过标准 (与 task_plan_0.5.0.md §Phase 1 一致):
 *   - 同一场景下, webgl / webgpu 与 canvas2d 基准的匹配像素占比 ≥ 95%
 *   - 单像素 |Δ灰度| < 5/255
 *
 * 用法:
 *   # 一次性准备
 *   npx playwright install chromium
 *   npm run build                           # 准备 dist/
 *
 *   # 跑
 *   npm run test:pixel                      # 全 6 case (webgl × 3 + webgpu × 3)
 *   npm run test:pixel -- --only webgl      # 只跑 webgl
 *   npm run test:pixel -- --scenario 1080p  # 只跑 1080p 场景
 *   npm run test:pixel -- --threshold 0.99  # 提高门槛
 *
 * 不依赖 CDN, 完全本地。0.5.0+ 默认纳入 release 前冒烟。
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadImage, createCanvas } from '@napi-rs/canvas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const FIXTURE_DIR = join(__dirname, 'fixtures');

// ==================== 参数解析 ====================
const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  return argv[i + 1];
}
const ONLY_RENDERER = arg('only'); // 'canvas2d' | 'webgl' | 'webgpu' | undefined
const ONLY_SCENARIO = arg('scenario'); // '1080p-fs14' | '1440p-fs8' | '4K-fs4' | undefined
const THRESHOLD = Number(arg('threshold', '0.95'));
const PIXEL_DELTA = Number(arg('delta', '5'));
const WAIT_MS = Number(arg('waitMs', '1500'));
const SAVE_DIR = (() => {
  const i = argv.indexOf('--save-dir');
  return i >= 0 ? argv[i + 1] : null;
})();

// ==================== 场景 & 渲染器 ====================
const SCENARIOS = [
  { name: '1080p-fs14', w: 1920, h: 1080, fontSize: 14, waitMs: WAIT_MS, initTimeoutMs: 20000 },
  { name: '1440p-fs8', w: 2560, h: 1440, fontSize: 8, waitMs: WAIT_MS, initTimeoutMs: 20000 },
  { name: '4K-fs4', w: 3840, h: 2160, fontSize: 4, waitMs: WAIT_MS * 1.2, initTimeoutMs: 60000 },
];
const RENDERERS = ['canvas2d', 'webgl', 'webgpu'];

// ==================== 静态服务器(服务 dist/ + test/fixtures/)==================
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      try {
        // 去掉 query + 防穿越
        const url = new URL(req.url, 'http://x');
        let pathname = url.pathname;
        if (pathname.includes('..')) {
          res.writeHead(400);
          res.end('bad path');
          return;
        }
        // 路径解析: /pixel-demo.html 走 fixtures, 其它走 dist/
        let filePath;
        if (pathname === '/pixel-demo.html') {
          filePath = join(FIXTURE_DIR, 'pixel-demo.html');
        } else {
          filePath = join(DIST, pathname === '/' ? 'index.html' : pathname);
        }
        const data = await readFile(filePath);
        res.writeHead(200, {
          'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
        });
        res.end(data);
      } catch (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`404: ${req.url}\n${e.message}`);
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// ==================== 像素对比 ====================
/**
 * 把 base64 PNG dataURL 解码成 RGBA buffer.
 * 注: 用 toBlob + FileReader 把 4K 像素压到 PNG 再传,避免 33MB JSON 序列化 OOM.
 * 矩阵雨画面背景多黑,PNG 压缩比 50-100x.
 */
async function dataUrlToRGBA(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error(`unexpected dataUrl prefix: ${(dataUrl || '').slice(0, 30)}`);
  }
  const b64 = dataUrl.slice('data:image/png;base64,'.length);
  const buf = Buffer.from(b64, 'base64');
  const img = await loadImage(buf);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return {
    width: img.width,
    height: img.height,
    data: ctx.getImageData(0, 0, img.width, img.height).data,
  };
}

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} a 基准 (canvas2d)
 * @param {{width:number,height:number,data:Uint8ClampedArray}} b 待测 (webgl / webgpu)
 * @returns {{ matchRatio: number, meanDelta: number, size: number }}
 */
function comparePixels(a, b) {
  if (a.data.length !== b.data.length) {
    throw new Error(
      `buffer size mismatch: ${a.data.length} vs ${b.data.length} (${a.width}x${a.height} vs ${b.width}x${b.height})`
    );
  }
  const N = a.data.length / 4; // RGBA
  let match = 0;
  let sumDelta = 0;
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    // 灰度近似 (Rec.601)
    const ga = 0.299 * a.data[o] + 0.587 * a.data[o + 1] + 0.114 * a.data[o + 2];
    const gb = 0.299 * b.data[o] + 0.587 * b.data[o + 1] + 0.114 * b.data[o + 2];
    const d = Math.abs(ga - gb);
    sumDelta += d;
    if (d < PIXEL_DELTA) match++;
  }
  return { matchRatio: match / N, meanDelta: sumDelta / N, size: N };
}

// ==================== 跑一个 case ====================
async function runCase(page, baseUrl, scenario, renderer) {
  const url =
    `${baseUrl}/pixel-demo.html` +
    `?renderer=${renderer}` +
    `&fontSize=${scenario.fontSize}` +
    `&waitMs=${Math.round(scenario.waitMs)}`;
  await page.setViewportSize({ width: scenario.w, height: scenario.h });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // 等 fixture 报告 ready
  // 注: Playwright 签名是 waitForFunction(fn, arg, options), 不是 (fn, options) — 旧写法 timeout 不生效
  await page.waitForFunction(() => window.__ready === true || window.__error, null, {
    timeout: scenario.initTimeoutMs || 30000,
  });
  const initError = await page.evaluate(() => window.__error);
  if (initError) {
    return { ok: false, reason: `init failed: ${initError}`, errors };
  }
  // 抓帧: page 端返回 base64 PNG, Node 端解码到 RGBA
  const dataUrl = await page.evaluate(async () => {
    const d = await window.__captureFrame();
    return d;
  });
  if (!dataUrl) {
    return { ok: false, reason: 'capture returned null', errors };
  }
  try {
    const pixels = await dataUrlToRGBA(dataUrl);
    if (SAVE_DIR) {
      await mkdir(SAVE_DIR, { recursive: true });
      const b64 = dataUrl.slice('data:image/png;base64,'.length);
      await writeFile(
        join(SAVE_DIR, `${scenario.name}-${renderer}.png`),
        Buffer.from(b64, 'base64')
      );
    }
    return { ok: true, pixels, errors };
  } catch (e) {
    return { ok: false, reason: `decode failed: ${e.message}`, errors };
  }
}

// ==================== 主流程 ====================
async function main() {
  console.log('┌─ 真像素测试 (Phase 1 / P2-1) ─────────────────────');
  console.log(`│ threshold = ${THRESHOLD * 100}%  pixel |Δ| < ${PIXEL_DELTA}/255`);
  console.log(`│ scenarios = ${SCENARIOS.map((s) => s.name).join(', ')}`);
  console.log(`│ renderers = ${RENDERERS.join(', ')}`);
  if (ONLY_RENDERER) console.log(`│ filter    = renderer=${ONLY_RENDERER}`);
  if (ONLY_SCENARIO) console.log(`│ filter    = scenario=${ONLY_SCENARIO}`);

  const srv = await startServer();
  const PORT = srv.address().port;
  const baseUrl = `http://127.0.0.1:${PORT}`;
  console.log(`│ server    = ${baseUrl}`);
  console.log('│');

  // 启动浏览器: headless + 强制 SwiftShader 走 WebGL(WebGPU 跑不动会走 try/catch 跳过)
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-webgpu', // headless 也尝试开 webgpu, 不行就跳过
      '--enable-features=Vulkan',
      '--no-sandbox', // CI 容器需要
    ],
  });
  const page = await browser.newPage();
  const results = [];
  let webgpuAvailable = null; // 第一次跑 webgpu 时探测, 决定后续 skip

  for (const sc of SCENARIOS) {
    if (ONLY_SCENARIO && sc.name !== ONLY_SCENARIO) continue;
    console.log(`├─ 场景 ${sc.name} (${sc.w}×${sc.h}, fs=${sc.fontSize})`);

    // 1. 先抓 canvas2d 基准
    const baseline = await runCase(page, baseUrl, sc, 'canvas2d');
    if (!baseline.ok) {
      console.log(`│  ❌ canvas2d 基准失败: ${baseline.reason}`);
      results.push({ scenario: sc.name, renderer: 'canvas2d', ok: false, reason: baseline.reason });
      continue;
    }
    console.log(
      `│  ✓ canvas2d 基准: ${baseline.pixels.width}×${baseline.pixels.height} (${(baseline.pixels.data.length / 4).toLocaleString()} px)`
    );

    // 2. 跑 webgl / webgpu 对比
    for (const r of RENDERERS) {
      if (r === 'canvas2d') continue; // 自己 vs 自己跳过
      if (ONLY_RENDERER && ONLY_RENDERER !== r) continue;

      const res = await runCase(page, baseUrl, sc, r);

      // WebGPU 在 headless 中可能 init 失败 -> 视为"环境不支持", 跳过但不算 fail
      if (r === 'webgpu') {
        if (webgpuAvailable === null) {
          webgpuAvailable = res.ok;
        }
        if (!res.ok && /init failed|webgpu/i.test(res.reason)) {
          console.log(`│  ⏭  webgpu 跳过 (headless 不支持): ${res.reason}`);
          results.push({ scenario: sc.name, renderer: r, ok: 'skip', reason: res.reason });
          continue;
        }
      }

      if (!res.ok) {
        console.log(`│  ❌ ${r} 失败: ${res.reason}`);
        if (res.errors && res.errors.length) {
          for (const e of res.errors.slice(0, 3)) console.log(`│     ${e}`);
        }
        results.push({ scenario: sc.name, renderer: r, ok: false, reason: res.reason });
        continue;
      }

      const cmp = comparePixels(baseline.pixels, res.pixels);
      const ok = cmp.matchRatio >= THRESHOLD;
      const mark = ok ? '✅' : '❌';
      console.log(
        `│  ${mark} ${r}: match=${(cmp.matchRatio * 100).toFixed(2)}% meanΔ=${cmp.meanDelta.toFixed(2)} (n=${cmp.size.toLocaleString()})`
      );
      if (!ok && res.errors && res.errors.length) {
        for (const e of res.errors.slice(0, 3)) console.log(`│     ${e}`);
      }
      results.push({
        scenario: sc.name,
        renderer: r,
        ok,
        matchRatio: cmp.matchRatio,
        meanDelta: cmp.meanDelta,
      });
    }
  }

  await browser.close();
  srv.close();

  // ==================== 汇总 ====================
  console.log('│');
  console.log('└─ 汇总 ─────────────────────────────────');
  const ran = results.filter((r) => r.ok !== 'skip');
  const passed = ran.filter((r) => r.ok === true).length;
  const failed = ran.filter((r) => r.ok === false).length;
  const skipped = results.length - ran.length;
  console.log(`   通过 ${passed} / 失败 ${failed} / 跳过 ${skipped}`);
  for (const r of results) {
    const tag = r.ok === true ? '✅' : r.ok === false ? '❌' : '⏭';
    let detail;
    if (r.ok === true) {
      detail = `match=${(r.matchRatio * 100).toFixed(2)}% Δ=${r.meanDelta.toFixed(2)}`;
    } else {
      detail =
        r.reason || `match=${(r.matchRatio * 100).toFixed(2)}% Δ=${(r.meanDelta || 0).toFixed(2)}`;
    }
    console.log(`   ${tag} ${r.scenario} / ${r.renderer.padEnd(8)} — ${detail}`);
  }

  // 至少要跑过 1 个非 skip 的 case
  if (ran.length === 0) {
    if (results.length > 0) {
      // filter 模式导致全是基准 + 0 对比 (例: --only canvas2d)
      console.log(`\n✅ 已抓取 ${results.length} 个基准 (filter 模式下不要求对比 case)`);
    } else {
      console.error(
        '\n❌ 没有跑任何有效 case (可能 Playwright Chromium 未装: `npx playwright install chromium`)'
      );
      process.exit(2);
    }
  } else {
    // 至少要有一个 webgl case (webgpu 可全 skip)
    const webglRan = ran.filter((r) => r.renderer === 'webgl');
    if (webglRan.length === 0) {
      console.error('\n❌ webgl 全部未跑, 检查 scenarios/renderer 过滤');
      process.exit(2);
    }
    // 任一失败即 exit 1
    if (failed > 0) {
      console.error(`\n❌ ${failed} 个 case 未达 ${THRESHOLD * 100}% 像素匹配`);
      process.exit(1);
    }
    console.log(`\n✅ 所有非 skip case 匹配 ≥ ${THRESHOLD * 100}%`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
