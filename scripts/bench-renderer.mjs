/**
 * @xietuier/matrix-rain · Renderer 性能基准测试 (Playwright)
 *
 * 用法:
 *   node scripts/bench-renderer.mjs
 *
 * 策略: Playwright 打开 about:blank，addInitScript 注入 UMD build，
 *       然后 evaluate 调用 matrixRain() 并记录 fps
 *
 * @since 0.4.0
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const UMD_PATH = join(ROOT, 'dist', 'index.umd.js');
if (!existsSync(UMD_PATH)) {
  console.error('ERROR: dist/index.umd.js 不存在。请先运行 npm run build');
  process.exit(1);
}

const SCENARIOS = [
  { renderer: 'canvas2d', w: 1920, h: 1080, fs: 14, label: '1080p fs14' },
  { renderer: 'canvas2d', w: 2560, h: 1440, fs: 8, label: '1440p fs8' },
  { renderer: 'webgl', w: 2560, h: 1440, fs: 4, label: '1440p fs4' },
  { renderer: 'webgl', w: 3840, h: 2160, fs: 4, label: '4K fs4' },
];

const DURATION_S = 4;
const IDLE_S = 1;

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

          // Set atlas URLs if available
          const setUrls = MatrixRain.setAtlasUrls;
          if (typeof setUrls === 'function') {
            try {
              setUrls('/dist/atlas/jetbrains-mono-32.json', '/dist/atlas/jetbrains-mono-32.png');
            } catch (e) {}
          }

          let rain;
          try {
            rain = await rainFn(canvas, {
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

          rain.destroy();

          const sum = samples.reduce((a, b) => a + b, 0);
          return {
            avgFps: +(sum / samples.length).toFixed(1),
            minFps: +Math.min(...samples).toFixed(1),
            maxFps: +Math.max(...samples).toFixed(1),
            p50Fps: +samples.sort((a, b) => a - b)[Math.floor(samples.length * 0.5)].toFixed(1),
            p95Fps: +samples.sort((a, b) => a - b)[Math.floor(samples.length * 0.95)].toFixed(1),
            samples,
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
        console.log(`    ✅ avg=${result.avgFps} p50=${result.p50Fps} p95=${result.p95Fps}`);
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
    `  ${'renderer'.padEnd(8)} ${'scene'.padEnd(14)} ${'avg'.padStart(6)} ${'p50'.padStart(6)} ${'p95'.padStart(6)} ${'min'.padStart(6)}`
  );
  for (const r of results) {
    const rnd = r.renderer.padEnd(8);
    const sc = r.label.padEnd(14);
    if (r.error) console.log(`  ${rnd} ${sc}   ERROR: ${r.error}`);
    else
      console.log(
        `  ${rnd} ${sc} ${String(r.avgFps).padStart(5)} ${String(r.p50Fps).padStart(5)} ${String(r.p95Fps).padStart(5)} ${String(r.minFps).padStart(5)}`
      );
  }
  console.log('══════════════════════════════════════════\n');

  const dateStr = new Date().toISOString().slice(0, 10);
  const outFile = join(ROOT, 'docs', `bench-results-${dateStr}.json`);
  await writeFile(
    outFile,
    JSON.stringify({ timestamp: new Date().toISOString(), scenarios: SCENARIOS, results }, null, 2)
  );
  console.log(`  📄 ${outFile}\n`);
}

runBench().catch((err) => {
  console.error('Bench failed:', err);
  process.exit(1);
});
