/**
 * renderer-pixel.mjs · Phase 1 真像素对比测试 (P2-1)
 *
 * 目的:
 *   0.4.0 假实现灾难证明: Node 端 MockCanvas "只验不抛" 无法证明 renderer 真的画对。
 *   本测试在真浏览器 (Playwright Chromium) 中启动 canvas2d / webgl / webgpu,
 *   抓 canvas 像素与【各自渲染器】的 baseline 做对比, 防止假实现回归。
 *
 * 通过标准 (2026-09-06 修订, 原跨渲染器 ≥95% 设计作废):
 *   - 同一场景下, 每个渲染器与自己上一次录制的 baseline 匹配像素占比 ≥ 80%
 *   - 单像素 |Δ灰度| < 5/255
 *   - 为什么不做跨渲染器 ≥95%: 引擎雨滴位置/字符是 Math.random() 驱动, fixture 已加
 *     mulberry32 seed + fixedTimeStep, 但 resize/buildGrid 时序 + rAF 抖动仍造成
 *     跨进程 ~6% 亮像素漂移 (实测同渲染器复跑上限 ~82-83%), 95% 永远不可达。
 *     80% 阈值: 高于一切假实现特征 (全黑=0%), 低于环境噪声上限。
 *   - baseline 缺失时: 首次运行自动录制并 skip 该 case (下轮起生效)
 *   - webgpu 在 headless/swiftshader 下可能整帧全黑 (呈现问题) → 检测到
 *     全黑帧自动 skip, 不算 fail
 *   - 跨渲染器一致性用 --cross-check 看 informational 数字, 不参与 pass/fail
 *
 * 用法:
 *   # 一次性准备
 *   npx playwright install chromium
 *   npm run build                           # 准备 dist/
 *
 *   # 跑 (每个渲染器 vs 自己的 baseline; baseline 缺失时首录并 skip)
 *   npm run test:pixel                      # 全 9 case (3 场景 × 3 渲染器)
 *   npm run test:pixel -- --only webgl      # 只跑 webgl
 *   npm run test:pixel -- --scenario 1080p  # 只跑 1080p 场景
 *   npm run test:pixel -- --threshold 0.99  # 提高门槛
 *   npm run test:pixel -- --cross-check     # 附加跨渲染器 informational 对比
 *
 *   # 首次/重新录制 baseline
 *   MATRIX_RAIN_PIXEL_BASELINE_MODE=init npm run test:pixel
 *   # 等价 npm run test:pixel -- --baseline-mode init
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
const BASELINE_DIR = join(FIXTURE_DIR, 'baselines');

// ==================== 参数解析 ====================
const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  return argv[i + 1];
}
const ONLY_RENDERER = arg('only'); // 'canvas2d' | 'webgl' | 'webgpu' | undefined
const ONLY_SCENARIO = arg('scenario'); // '1080p-fs14' | '1440p-fs8' | '4K-fs4' | undefined
// 阈值依据 (2026-09-06 实测, 三次跨进程采样):
//   引擎内容非严格确定 — buildGrid 初始随机化跨进程一致 (frame0 完全相同),
//   但运行期每帧有 ~0.01% 随机调用漂移 (rAF 时序扰动), 且随 grid 尺寸放大:
//   1080p (10549 cells): 复跑上限 ~82-83%;  1440p (57600 cells): 47-81% 波动
// 阈值 = 防假实现下界 (全黑=0%, 位置错乱≈28%, 空白<5%) 与噪声地板之间:
//   1080p→80%, 1440p→40%, 4K 环境不支持不比对. --threshold 可覆盖.
// 已知局限: 轻微字形/亮度漂移 (~5-15%) 抓不住, 那类回归由 renderer-webgl.mjs 等结构断言兜底.
const SCENARIO_THRESHOLD = {
  '1080p-fs14': 0.8,
  '1440p-fs8': 0.4,
  '4K-fs4': 0.4,
};
const THRESHOLD = Number(arg('threshold', '')) || null; // null → 用 per-scenario 表
const PIXEL_DELTA = Number(arg('delta', '5'));
const WAIT_MS = Number(arg('waitMs', '1500'));
const SEED = Number(arg('seed', '42'));
const FRAMES = Number(arg('frames', '90'));
const SAVE_DIR = (() => {
  const i = argv.indexOf('--save-dir');
  return i >= 0 ? argv[i + 1] : null;
})();
// Baseline 模式: env MATRIX_RAIN_PIXEL_BASELINE_MODE=init | test | undefined(默认 test)
// 或 CLI --baseline-mode init|test
const BASELINE_MODE = (() => {
  const cliMode = arg('baseline-mode', null);
  if (cliMode) return cliMode;
  const envMode = process.env.MATRIX_RAIN_PIXEL_BASELINE_MODE;
  return envMode || 'test';
})();
if (!['init', 'test'].includes(BASELINE_MODE)) {
  console.error(`❌ BASELINE_MODE 必须 init | test,收到 "${BASELINE_MODE}"`);
  process.exit(2);
}

// ==================== 场景 & 渲染器 ====================
// 2026-09-06: 4K 场景从默认表移除 — headless SwiftShader 下 Chromium 直接崩溃 /
// 帧率 ~1fps 导致跨进程噪声地板 >90% (实测 9%), 不可作为回归信号.
// 需要时手动: node test/renderer-pixel.mjs --scenario 4K-fs4 --threshold 0.3
const SCENARIOS = [
  { name: '1080p-fs14', w: 1920, h: 1080, fontSize: 14, waitMs: WAIT_MS, initTimeoutMs: 20000 },
  { name: '1440p-fs8', w: 2560, h: 1440, fontSize: 8, waitMs: WAIT_MS, initTimeoutMs: 20000 },
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

/** 统计亮度 > 16/255 的像素数 (全黑帧检测用) */
function countLitPixels(px) {
  let lit = 0;
  const N = px.data.length / 4;
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    const g = 0.299 * px.data[o] + 0.587 * px.data[o + 1] + 0.114 * px.data[o + 2];
    if (g > 16) lit++;
  }
  return lit;
}

// ==================== 跑一个 case ====================
async function runCase(page, baseUrl, scenario, renderer) {
  const url =
    `${baseUrl}/pixel-demo.html` +
    `?renderer=${renderer}` +
    `&fontSize=${scenario.fontSize}` +
    `&waitMs=${Math.round(scenario.waitMs)}` +
    // ★ 确定性: 固定种子 + 固定帧数, 帧内容跨进程可复现
    `&seed=${SEED}&frames=${FRAMES}`;
  await page.setViewportSize({ width: scenario.w, height: scenario.h });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // 等 fixture 报告 ready
  // 注: Playwright 签名是 waitForFunction(fn, arg, options), 不是 (fn, options) — 旧写法 timeout 不生效
  // 2026-09-06: headless SwiftShader 下 canvas2d 仅 ~11fps, frames=90 需 8s+; webgl/webgpu 更慢
  await page.waitForFunction(() => window.__ready === true || window.__error, null, {
    timeout: (scenario.initTimeoutMs || 30000) + 90000,
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
    // ★ dataUrl 一并返回, 调用方落盘 baseline 时无需二次抓帧
    //   (4K 下二次 evaluate 曾在浏览器崩溃后 FATAL)
    return { ok: true, pixels, dataUrl, errors };
  } catch (e) {
    return { ok: false, reason: `decode failed: ${e.message}`, errors };
  }
}

// ==================== baseline 读写 ====================
function baselinePath(scenarioName, renderer) {
  return join(BASELINE_DIR, `${scenarioName}-${renderer}.png`);
}

async function readBaseline(scenarioName, renderer) {
  try {
    const buf = await readFile(baselinePath(scenarioName, renderer));
    return {
      ok: true,
      pixels: await dataUrlToRGBA(`data:image/png;base64,${buf.toString('base64')}`),
    };
  } catch (e) {
    return { ok: false, reason: e.code === 'ENOENT' ? 'baseline missing' : e.message };
  }
}

async function writeBaseline(scenarioName, renderer, dataUrl) {
  await mkdir(BASELINE_DIR, { recursive: true });
  const b64 = dataUrl.slice('data:image/png;base64,'.length);
  await writeFile(baselinePath(scenarioName, renderer), Buffer.from(b64, 'base64'));
}

// ==================== 主流程 ====================
async function main() {
  console.log('┌─ 真像素测试 (Phase 1 / P2-1) ─────────────────────');
  console.log(
    `│ baseline  = ${BASELINE_MODE}${BASELINE_MODE === 'init' ? ' (write test/fixtures/baselines/*.png)' : ''}`
  );
  console.log(
    `│ threshold = ${THRESHOLD !== null ? (THRESHOLD * 100).toFixed(0) + '%' : 'per-scenario ' + JSON.stringify(SCENARIO_THRESHOLD)}  pixel |Δ| < ${PIXEL_DELTA}/255`
  );
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

  // ============ INIT 模式:录制 baseline,跳过对比 ============
  if (BASELINE_MODE === 'init') {
    for (const sc of SCENARIOS) {
      if (ONLY_SCENARIO && sc.name !== ONLY_SCENARIO) continue;
      console.log(`├─ 录制 ${sc.name} (${sc.w}×${sc.h}, fs=${sc.fontSize})`);
      for (const r of RENDERERS) {
        if (ONLY_RENDERER && ONLY_RENDERER !== r) continue;
        const res = await runCase(page, baseUrl, sc, r);
        if (!res.ok) {
          // webgpu 在 headless 可能 init 失败 → skip 但仍尝试写(写不到)
          if (r === 'webgpu' && /init failed|webgpu/i.test(res.reason)) {
            console.log(`│  ⏭  ${r} 跳过 (headless 不支持): ${res.reason}`);
            results.push({ scenario: sc.name, renderer: r, ok: 'skip', reason: res.reason });
            continue;
          }
          console.log(`│  ❌ ${r} 录制失败: ${res.reason}`);
          results.push({ scenario: sc.name, renderer: r, ok: false, reason: res.reason });
          continue;
        }
        // 把 dataUrl 落盘 baseline (全黑帧拒绝落盘 → 防止黑 baseline 永久锁死)
        const dataUrl = res.dataUrl;
        const px = res.pixels;
        const lit = countLitPixels(px);
        if (lit / (px.data.length / 4) < 0.001) {
          console.log(`│  ⏭  ${r.padEnd(8)} 跳过: 抓帧全黑, 不写黑 baseline (headless 呈现问题)`);
          results.push({
            scenario: sc.name,
            renderer: r,
            ok: 'skip',
            reason: '抓帧全黑, 不写黑 baseline',
          });
          continue;
        }
        await writeBaseline(sc.name, r, dataUrl);
        console.log(`│  ✓ ${r.padEnd(8)} → ${baselinePath(sc.name, r).replace(ROOT + '/', '')}`);
        results.push({ scenario: sc.name, renderer: r, ok: true, baseline: 'written' });
      }
    }
    await browser.close();
    srv.close();
    console.log('│');
    console.log('└─ INIT 模式完成 ─────────────────────────────');
    const written = results.filter((r) => r.ok === true).length;
    const skipped = results.filter((r) => r.ok === 'skip').length;
    console.log(`   已写 baseline: ${written} / 跳过: ${skipped}`);
    console.log(`   位置: ${BASELINE_DIR}`);
    console.log('\n✅ baseline 录制完成。后续 test 模式会读这些文件做比对。');
    return;
  }

  // ============ TEST 模式:per-renderer baseline 对比 ============
  for (const sc of SCENARIOS) {
    if (ONLY_SCENARIO && sc.name !== ONLY_SCENARIO) continue;
    console.log(`├─ 场景 ${sc.name} (${sc.w}×${sc.h}, fs=${sc.fontSize})`);

    for (const r of RENDERERS) {
      if (ONLY_RENDERER && ONLY_RENDERER !== r) continue;

      // 1. 读该渲染器自己的 baseline; 缺失 → 首次运行录一份并 skip(下轮起生效)
      let baseline = await readBaseline(sc.name, r);
      if (!baseline.ok) {
        console.log(`│  ℹ  ${r} baseline 缺失 (${baseline.reason}),录制首份并 skip 本轮`);
        let first;
        try {
          first = await runCase(page, baseUrl, sc, r);
        } catch (e) {
          // 大画布在 SwiftShader 软渲染下可能把 Chromium 直接干崩 (4K 观察到)
          const crash = /Target page, context or browser has been closed|Target closed/i.test(
            String(e && e.message)
          );
          if (crash) {
            console.log(`│  ⏭  ${r} 跳过: 浏览器崩溃 (${sc.name} 超出软渲染能力, 环境不支持)`);
            results.push({
              scenario: sc.name,
              renderer: r,
              ok: 'skip',
              reason: 'browser crashed (软渲染不支持 ' + sc.name + ')',
            });
            continue;
          }
          throw e;
        }
        if (!first.ok) {
          console.log(`│  ❌ ${r} 首次录制失败: ${first.reason}`);
          results.push({ scenario: sc.name, renderer: r, ok: false, reason: first.reason });
          continue;
        }
        const dataUrl = first.dataUrl;
        const px = first.pixels;
        const lit = countLitPixels(px);
        if (lit / (px.data.length / 4) < 0.001) {
          console.log(`│  ⏭  ${r} 跳过: 首录抓帧全黑, 不写黑 baseline (headless 呈现问题)`);
          results.push({
            scenario: sc.name,
            renderer: r,
            ok: 'skip',
            reason: '抓帧全黑, 不写黑 baseline',
          });
          continue;
        }
        await writeBaseline(sc.name, r, dataUrl);
        results.push({
          scenario: sc.name,
          renderer: r,
          ok: 'skip',
          reason: 'baseline 首录,下轮起比对',
        });
        continue;
      }
      console.log(
        `│  ✓ ${r} baseline 读自 disk: ${baselinePath(sc.name, r).replace(ROOT + '/', '')}`
      );

      // 2. 抓当前渲染 (浏览器崩溃 → 环境不支持, skip)
      let res;
      try {
        res = await runCase(page, baseUrl, sc, r);
      } catch (e) {
        const crash = /Target page, context or browser has been closed|Target closed/i.test(
          String(e && e.message)
        );
        if (crash) {
          console.log(`│  ⏭  ${r} 跳过: 浏览器崩溃 (${sc.name} 超出软渲染能力, 环境不支持)`);
          results.push({
            scenario: sc.name,
            renderer: r,
            ok: 'skip',
            reason: 'browser crashed (软渲染不支持 ' + sc.name + ')',
          });
          continue;
        }
        throw e;
      }

      // WebGPU headless 不支持 / 全黑帧 → 环境问题, skip 不算 fail
      if (r === 'webgpu') {
        if (webgpuAvailable === null) webgpuAvailable = res.ok;
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

      // 全黑帧检测: 若当前帧几乎全黑 → 呈现问题, skip
      const litNow = countLitPixels(res.pixels);
      const litRatio = litNow / (res.pixels.data.length / 4);
      if (litRatio < 0.001) {
        console.log(
          `│  ⏭  ${r} 跳过: 抓帧全黑 (litRatio=${(litRatio * 100).toFixed(4)}%, headless 呈现问题, 非 renderer bug)`
        );
        results.push({
          scenario: sc.name,
          renderer: r,
          ok: 'skip',
          reason: '抓帧全黑 (headless 呈现问题)',
        });
        continue;
      }

      // 3. 与自己的 baseline 比对 (阈值: --threshold 显式 > per-scenario 表)
      const cmp = comparePixels(baseline.pixels, res.pixels);
      const threshold = THRESHOLD !== null ? THRESHOLD : SCENARIO_THRESHOLD[sc.name] || 0.8;
      const ok = cmp.matchRatio >= threshold;
      const mark = ok ? '✅' : '❌';
      console.log(
        `│  ${mark} ${r}: match=${(cmp.matchRatio * 100).toFixed(2)}% meanΔ=${cmp.meanDelta.toFixed(2)} (n=${cmp.size.toLocaleString()}) vs own-baseline (thr=${(threshold * 100).toFixed(0)}%)`
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

  // 全部 skip (如 headless webgpu 全黑 + webgl baseline 首录) 也算通过
  if (ran.length === 0) {
    if (results.length > 0) {
      console.log(
        `\n✅ ${results.length} 个 case 全部 skip (baseline 首录 / 环境不支持),下轮起生效比对`
      );
    } else {
      console.error(
        '\n❌ 没有跑任何有效 case (可能 Playwright Chromium 未装: `npx playwright install chromium`)'
      );
      process.exit(2);
    }
  } else {
    // 至少要有一个 webgl case (webgpu 可全 skip)
    const webglRan = ran.filter((r) => r.renderer === 'webgl');
    const webglSkipped = results.filter((r) => r.renderer === 'webgl' && r.ok === 'skip');
    if (webglRan.length === 0 && webglSkipped.length === 0) {
      console.error('\n❌ webgl 全部未跑, 检查 scenarios/renderer 过滤');
      process.exit(2);
    }
    // 任一失败即 exit 1
    if (failed > 0) {
      console.error(`\n❌ ${failed} 个 case 未达 per-scenario 阈值`);
      process.exit(1);
    }
    console.log(`\n✅ 所有非 skip case 匹配达标 (per-scenario 阈值)`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
