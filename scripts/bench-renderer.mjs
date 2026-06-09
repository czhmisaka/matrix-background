/**
 * @xietuier/matrix-rain · Renderer 性能基准测试 (Playwright)
 *
 * 用法:
 *   node scripts/bench-renderer.mjs
 *
 * 策略: Playwright 打开 about:blank，addInitScript 注入 UMD build，
 *       然后 evaluate 调用 matrixRain() 并记录 fps + canvas 中心像素 hash
 *       (0.4.1+ 加 pixelHash + nonZeroRatio 兜底, 防 fake renderer 跑出 fps 但
 *        实际不渲染 — 历史教训见 docs/audit-fake-impl-2026-06-10.md)
 *
 * @since 0.4.0
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const UMD_PATH = join(ROOT, 'dist', 'index.umd.js');
const ATLAS_JSON_PATH = join(ROOT, 'dist', 'atlas', 'jetbrains-mono-32.json');
const ATLAS_PNG_PATH = join(ROOT, 'dist', 'atlas', 'jetbrains-mono-32.png');
if (!existsSync(UMD_PATH)) {
  console.error('ERROR: dist/index.umd.js 不存在。请先运行 npm run build');
  process.exit(1);
}
if (!existsSync(ATLAS_JSON_PATH) || !existsSync(ATLAS_PNG_PATH)) {
  console.error('ERROR: dist/atlas/* 不存在。请先运行 npm run build');
  process.exit(1);
}
const atlasJson = readFileSync(ATLAS_JSON_PATH, 'utf-8');
const atlasPng = readFileSync(ATLAS_PNG_PATH);

const SCENARIOS = [
  { renderer: 'canvas2d', w: 1920, h: 1080, fs: 14, label: '1080p fs14' },
  { renderer: 'canvas2d', w: 2560, h: 1440, fs: 8, label: '1440p fs8' },
  { renderer: 'webgl', w: 2560, h: 1440, fs: 4, label: '1440p fs4' },
  { renderer: 'webgl', w: 3840, h: 2160, fs: 4, label: '4K fs4' },
];

const DURATION_S = 4;
const IDLE_S = 1;

/**
 * 渲染正确性下限阈值 (0.4.1+)
 * - canvas 中心 200×200 区域的 nonZeroRatio (非全黑像素的比例)
 * - canvas2d 实测 > 0.10, webgl 修复后应接近 canvas2d
 * - < 0.05 视为 fake renderer (例如 P0-1 的 ch 当 cell index bug 表现为 ~24 个字符)
 */
const NONZERO_RATIO_FLOOR = 0.05;

async function runBench() {
  console.log('🧪 matrix-rain Renderer Performance Benchmark\n');
  for (const s of SCENARIOS) console.log(`    ${s.renderer.padEnd(8)} ${s.label}`);
  console.log();

  const browser = await chromium.launch({ headless: true });
  const umdSrc = readFileSync(UMD_PATH, 'utf-8');
  const results = [];

  try {
    for (const s of SCENARIOS) {
      console.log(`  [${s.renderer}] ${s.label} ...`);

      const ctx = await browser.newContext({
        viewport: { width: Math.min(s.w, 1920), height: Math.min(s.h, 1080) },
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();

      // 0.4.1+: 通过 Playwright route 把 atlas 请求 fulfill 到本地 dist/atlas/
      // 否则 webgl/webgpu 渲染器 init() 时 fetch 失败, 永远拿不到字符 atlas
      await page.route('**/atlas/jetbrains-mono-32.json', (r) =>
        r.fulfill({ body: atlasJson, contentType: 'application/json' })
      );
      await page.route('**/atlas/jetbrains-mono-32.png', (r) =>
        r.fulfill({ body: atlasPng, contentType: 'image/png' })
      );
      // 路由所有 http://bench-host/* 到一个空 HTML, 提供非 about:blank 的 base URL,
      // 让 canvas style 100vw/100vh 能正常 layout, 且让 setAtlasUrls('/atlas/...') 这种
      // 相对路径能被 fetch 正确解析(about:blank 下相对 URL 无法解析)
      await page.route('http://bench-host/', (r) =>
        r.fulfill({
          body: '<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;width:100%;height:100%;background:#000}canvas{display:block;width:100vw;height:100vh}</style></head><body></body></html>',
          contentType: 'text/html',
        })
      );
      await page.goto('http://bench-host/');

      // Inject UMD build
      await page.addScriptTag({ content: umdSrc });

      // Run benchmark in page context
      const result = await page.evaluate(
        async ({ renderer, w, h, fs, dur, idle }) => {
          const MatrixRain = window.MatrixRain || window.matrixRain;
          if (!MatrixRain) return { error: 'MatrixRain not found on window' };

          // matrixRain might be on MatrixRain object (UMD exports) or directly
          const rainFn =
            typeof MatrixRain === 'function'
              ? MatrixRain
              : MatrixRain.default || MatrixRain.matrixRain;
          if (typeof rainFn !== 'function') {
            return { error: 'rainFn not found. Keys: ' + Object.keys(MatrixRain).join(',') };
          }

          // Create canvas
          const canvas = document.createElement('canvas');
          canvas.style.cssText = 'width:100vw;height:100vh;display:block';
          document.body.appendChild(canvas);

          // Set atlas URLs if available (Playwright route 会拦截到本地 dist/atlas/)
          const setUrls = MatrixRain.setAtlasUrls;
          if (typeof setUrls === 'function') {
            try {
              setUrls('/atlas/jetbrains-mono-32.json', '/atlas/jetbrains-mono-32.png');
            } catch (e) {}
          }

          let rain;
          try {
            // matrixRain 是单参函数: matrixRain({ canvas, renderer, ... })
            // 不是 matrixRain(canvas, { ... }) — 早期 bench 漏了这点(rAF 仍跑但用的是自创 canvas, 不是用户的)
            rain = await rainFn({
              canvas,
              renderer,
              fontSize: fs,
              theme: 'matrix-green',
              variant: 'classic',
            });
          } catch (e) {
            return { error: 'init failed: ' + e.message };
          }

          // Wait idle
          await new Promise((r) => setTimeout(r, idle * 1000));

          // Collect fps
          const samples = [];
          for (let i = 0; i < dur; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            const fps = rain.getFPS ? rain.getFPS() : 0;
            samples.push(fps);
          }

          // 0.4.1+: 像素 hash 校验 (借鉴 scripts/e2e-demos.py 的 all_canvases_hash)
          // 截取 canvas 中心 200x200 区域算 djb2 hash + RGB 均值 + nonZeroRatio
          // 防止 fake renderer 跑出 fps 但实际什么都没画
          let pixelHash = 0;
          let meanR = 0,
            meanG = 0,
            meanB = 0;
          let nonZeroRatio = 0;
          let pixelError = null;
          try {
            const cw = canvas.width,
              ch2 = canvas.height;
            const sx = Math.max(0, Math.floor(cw / 2 - 100));
            const sy = Math.max(0, Math.floor(ch2 / 2 - 100));
            const sw = Math.min(200, cw - sx);
            const sh = Math.min(200, ch2 - sy);
            let imgData = null;
            // canvas2d: 同一 canvas 上能直接 getContext('2d').getImageData
            try {
              const ctx2 = canvas.getContext('2d');
              if (ctx2 && typeof ctx2.getImageData === 'function') {
                imgData = ctx2.getImageData(sx, sy, sw, sh);
              }
            } catch (e) {
              /* webgl/webgpu 的 canvas 不能再 getContext('2d') */
            }
            // webgl/webgpu: 通过中转 canvas + drawImage 拷过来再 getImageData
            if (!imgData) {
              const tmp = document.createElement('canvas');
              tmp.width = sw;
              tmp.height = sh;
              const tmpCtx = tmp.getContext('2d');
              if (tmpCtx) {
                tmpCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
                imgData = tmpCtx.getImageData(0, 0, sw, sh);
              }
            }
            if (imgData) {
              const d = imgData.data;
              let hash = 5381;
              let sumR = 0,
                sumG = 0,
                sumB = 0,
                nonZero = 0;
              const pxCount = d.length / 4;
              for (let i = 0; i < d.length; i += 4) {
                const r = d[i],
                  g = d[i + 1],
                  b = d[i + 2];
                hash = ((hash << 5) + hash + r + g + b) >>> 0;
                sumR += r;
                sumG += g;
                sumB += b;
                if (r + g + b > 0) nonZero++;
              }
              pixelHash = hash;
              meanR = +(sumR / pxCount).toFixed(1);
              meanG = +(sumG / pxCount).toFixed(1);
              meanB = +(sumB / pxCount).toFixed(1);
              nonZeroRatio = +(nonZero / pxCount).toFixed(4);
            } else {
              pixelError = 'getImageData unavailable';
            }
          } catch (e) {
            pixelError = String(e?.message || e);
          }

          rain.destroy();

          const sum = samples.reduce((a, b) => a + b, 0);
          return {
            avgFps: +(sum / samples.length).toFixed(1),
            minFps: +Math.min(...samples).toFixed(1),
            maxFps: +Math.max(...samples).toFixed(1),
            p50Fps: +samples.sort((a, b) => a - b)[Math.floor(samples.length * 0.5)].toFixed(1),
            p95Fps: +samples.sort((a, b) => a - b)[Math.floor(samples.length * 0.95)].toFixed(1),
            samples,
            pixelHash,
            meanR,
            meanG,
            meanB,
            nonZeroRatio,
            pixelError,
          };
        },
        { ...s, dur: DURATION_S, idle: IDLE_S }
      );

      if (result.error) {
        console.log(`    ❌ ${result.error}`);
        results.push({
          renderer: s.renderer,
          viewport: `${s.w}x${s.h}`,
          fontSize: s.fs,
          label: s.label,
          error: result.error,
        });
      } else {
        const pxNote = result.pixelError
          ? `[px:${result.pixelError}]`
          : `nz=${(result.nonZeroRatio * 100).toFixed(1)}%`;
        console.log(
          `    ✅ avg=${result.avgFps} p50=${result.p50Fps} p95=${result.p95Fps} ${pxNote}`
        );
        results.push({
          ...result,
          renderer: s.renderer,
          viewport: `${s.w}x${s.h}`,
          fontSize: s.fs,
          label: s.label,
        });
      }

      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  console.log('\n══════════════════════════════════════════');
  console.log(
    `  ${'renderer'.padEnd(8)} ${'scene'.padEnd(14)} ${'avg'.padStart(5)} ${'p50'.padStart(5)} ${'p95'.padStart(5)} ${'nz%'.padStart(6)} status`
  );
  let fakeCount = 0;
  for (const r of results) {
    const rnd = r.renderer.padEnd(8);
    const sc = r.label.padEnd(14);
    if (r.error) {
      console.log(`  ${rnd} ${sc}   ERROR: ${r.error}`);
      continue;
    }
    const nzPct = r.nonZeroRatio !== undefined ? (r.nonZeroRatio * 100).toFixed(1) : '?';
    const status =
      r.pixelError != null
        ? `⚠ ${r.pixelError}`
        : r.nonZeroRatio < NONZERO_RATIO_FLOOR
          ? `❌ FAKE (nz<${(NONZERO_RATIO_FLOOR * 100).toFixed(0)}%)`
          : '✅';
    if (status.startsWith('❌')) fakeCount++;
    console.log(
      `  ${rnd} ${sc} ${String(r.avgFps).padStart(5)} ${String(r.p50Fps).padStart(5)} ${String(r.p95Fps).padStart(5)} ${nzPct.padStart(6)} ${status}`
    );
  }
  console.log('══════════════════════════════════════════\n');

  const dateStr = new Date().toISOString().slice(0, 10);
  const outFile = join(ROOT, 'docs', `bench-results-${dateStr}.json`);
  await writeFile(
    outFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        scenarios: SCENARIOS,
        results,
        nonZeroRatioFloor: NONZERO_RATIO_FLOOR,
      },
      null,
      2
    )
  );
  console.log(`  📄 ${outFile}\n`);

  if (fakeCount > 0) {
    console.error(`❌ ${fakeCount} 个场景 nonZeroRatio < ${NONZERO_RATIO_FLOOR} — 疑似 fake 渲染`);
    process.exit(2);
  }
}

runBench().catch((err) => {
  console.error('Bench failed:', err);
  process.exit(1);
});
