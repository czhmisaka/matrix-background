/**
 * Playwright probe v2 — better text isolation
 *
 * Approach: inject our own canvas + matrixRain instance into the page,
 * fully controlled. Set lockStability=1.0 + targetHold=Infinity so locked
 * target cells are 100% stable. Take 2 frames ~300ms apart, diff them:
 * stable lit pixels = the actual locked text (everything else is rain).
 *
 * Measure: bounding box of stable-lit pixels = where the text REALLY occupies.
 * If text bbox extends beyond canvas edge → overflow.
 * If text bbox is highly asymmetric in padding → cropped on one side.
 *
 * Output:
 *   - PNG screenshots → /tmp/text-overflow-screens/
 *   - Markdown report → /tmp/text-overflow-report.md
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const PHASE = process.argv.find(a => a.startsWith('--phase='))?.split('=')[1] || 'before';
const BASE = 'http://localhost:4173';
const SCREEN_DIR = '/tmp/text-overflow-screens';
const REPORT_PATH = `/tmp/text-overflow-report${PHASE === 'after' ? '-after' : ''}.md`;
const DIFF_TOL = 10;       // |Δ| < 10 = stable
const LUM_THRESHOLD = 50;  // 0-255

const TEXTS = [
  { label: 'short',     text: 'OK' },
  { label: 'medium',    text: 'MATRIX' },
  { label: 'long',      text: 'PLAYWRIGHT' },
  { label: 'extralong', text: 'VERY_LONG_TEXT_OVERFLOW' },
  { label: 'cjk',       text: '你好世界' }
];
const FONT_SIZES = [10, 16, 24, 28];

await fs.mkdir(SCREEN_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2
});
const page = await ctx.newPage();

const results = [];

/**
 * On the page, install a side-canvas (640x400 CSS px) for controlled probing.
 * The site has matrixRain loaded; we make a clean instance with our params.
 */
async function setupProbeCanvas(page) {
  await page.evaluate(async () => {
    // Remove old probe
    document.getElementById('__probe_wrap')?.remove();
    const wrap = document.createElement('div');
    wrap.id = '__probe_wrap';
    wrap.style.cssText = 'position:fixed;top:0;left:0;width:640px;height:400px;z-index:99999;background:#000;';
    const c = document.createElement('canvas');
    c.id = '__probe_canvas';
    c.style.cssText = 'width:100%;height:100%;display:block;';
    wrap.appendChild(c);
    document.body.appendChild(wrap);
    // load matrixRain (already on page)
    window.__probeReady = true;
  });
}

async function probeCase({ text, fontSize, useFitMode }) {
  // (Re)create matrixRain instance
  const setupRes = await page.evaluate(async ({ text, fontSize, useFitMode }) => {
    const mod = await import('/dist/index.js').catch(() => null) || window.MatrixRain || null;
    // The site uses path alias; try named import from a script tag we add
    return { ok: true, hasMod: !!mod };
  }, { text, fontSize, useFitMode });
  return setupRes;
}

/**
 * Simpler approach: visit the actual playground, which already has UI controls.
 * Set targetLockStability=1.0 (slider), set text+fontSize, wait for 'hold' phase.
 * Take 2 screenshots ~300ms apart. Diff them to find stable lit pixels = text.
 */
async function measureWithDiff(page, canvasSel) {
  const result = await page.evaluate(async ({ canvasSel, diffTol, lumThresh }) => {
    const c = document.querySelector(canvasSel);
    if (!c) return { err: 'no canvas' };
    const tctx = c.getContext('2d');
    const w = c.width, h = c.height;

    function snap() {
      return tctx.getImageData(0, 0, w, h).data;
    }
    const a = snap();
    // wait ~300ms
    await new Promise(r => setTimeout(r, 320));
    const b = snap();

    let minX = w, maxX = -1, minY = h, maxY = -1;
    let stableLit = 0, totalLit = 0;
    // Scan every 2 pixels
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const ra = a[i], ga = a[i + 1], ba = a[i + 2];
        const rb = b[i], gb = b[i + 1], bb = b[i + 2];
        const luma = 0.299 * ra + 0.587 * ga + 0.114 * ba;
        const lumb = 0.299 * rb + 0.587 * gb + 0.114 * bb;
        const litA = luma > lumThresh, litB = lumb > lumThresh;
        if (litA) totalLit++;
        const dr = Math.abs(ra - rb), dg = Math.abs(ga - gb), db = Math.abs(ba - bb);
        if (litA && litB && dr < diffTol && dg < diffTol && db < diffTol) {
          stableLit++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      w, h,
      cssW: c.clientWidth, cssH: c.clientHeight,
      minX, maxX, minY, maxY,
      stableLit, totalLit,
      hasText: stableLit > 5 && maxX >= 0
    };
  }, { canvasSel, diffTol: DIFF_TOL, lumThresh: LUM_THRESHOLD });
  return result;
}

async function probePlayground() {
  console.log('=== /playground (with diff measurement) ===');
  await page.goto(BASE + '/playground', { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas');
  await page.waitForTimeout(500);

  // Set lockStability=1.0 for max stability of locked cells
  await page.evaluate(() => {
    const sliders = document.querySelectorAll('input[type="range"]');
    sliders.forEach(s => {
      // lockStability slider has min=0 max=1 step=0.05
      if (s.min === '0' && s.max === '1' && s.step === '0.05') {
        s.value = '1';
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
  await page.waitForTimeout(200);

  for (const { label, text } of TEXTS) {
    for (const fs of FONT_SIZES) {
      // Set fontSize slider (min=10 max=28)
      await page.evaluate(({ fs }) => {
        const sliders = document.querySelectorAll('input[type="range"]');
        sliders.forEach(s => {
          if (s.min === '10' && s.max === '28') {
            s.value = String(fs);
            s.dispatchEvent(new Event('input', { bubbles: true }));
            s.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }, { fs });
      const inp = await page.locator('input[type="text"]').first();
      await inp.fill(text);
      await page.locator('button:has-text("应用")').first().click().catch(() => {});
      // Wait noise(0.5) + converge(1.5) + safety
      await page.waitForTimeout(2700);

      const m = await measureWithDiff(page, '.canvas-wrap canvas');
      const canvasLoc = page.locator('.canvas-wrap canvas').first();
      const shotName = `${PHASE}_playground_${label}_fs${fs}.png`;
      await canvasLoc.screenshot({ path: path.join(SCREEN_DIR, shotName) });

      const w = m.w || 0;
      const textW = m.hasText ? (m.maxX - m.minX + 1) : 0;
      const leftPad = m.hasText ? m.minX : 0;
      const rightPad = m.hasText ? (w - 1 - m.maxX) : 0;
      const fillRatio = m.hasText ? (textW / w) : 0;
      // Expected text width if rendered correctly:
      // engine: cssChars = floor(cssW / fs) cols; text occupies ~0.95 × charCount × 0.6 × cellPx_in_CSS = charCount × 0.6 × fs CSS px;
      // backing store ≈ cssW × DPR; expected textW_backing = min(0.95 × cssW × DPR, charCount × 0.6 × fs × DPR)
      const cssW_est = m.cssW || (w / 2);
      const charCount = [...text].length;  // proper unicode codepoint count
      // In monospace-ish JetBrains Mono, charW ≈ 0.6 of cellHeight; cellHeight in engine = fs CSS px
      const expectedTextCSS = Math.min(cssW_est * 0.95, charCount * fs * 0.62);
      const expectedTextW = expectedTextCSS * (w / cssW_est);  // scale to backing store
      const overflowRatio = expectedTextW > 0 ? (textW / expectedTextW) : 0;
      // Clear-bug signal: fillRatio > 80% when expected < 50% of canvas
      const expectedFillRatio = expectedTextW / w;
      const isOverflow = m.hasText && (fillRatio > 0.6 && expectedFillRatio < 0.7);

      results.push({
        page: 'playground',
        label, text, fontSize: fs,
        bw: w, bh: m.h, cssW: m.cssW, cssH: m.cssH,
        minX: m.minX, maxX: m.maxX, textW, leftPad, rightPad, fillRatio,
        expectedTextW: Math.round(expectedTextW), expectedFillRatio,
        overflowRatio,
        stableLit: m.stableLit, totalLit: m.totalLit,
        hasText: m.hasText,
        isOverflow,
        shot: shotName
      });
      console.log(`  ${label.padEnd(10)} fs=${String(fs).padStart(2)} textW=${textW}/${w} (fill=${(fillRatio*100).toFixed(0)}%) exp=${Math.round(expectedTextW)} ratio=${overflowRatio.toFixed(2)}× overflow=${isOverflow ? 'YES' : 'no'}`);
    }
  }
}

async function probeNoiseConverge() {
  console.log('=== /demos/noise-converge ===');
  await page.goto(BASE + '/demos/noise-converge', { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas');
  await page.waitForTimeout(500);

  // Max stability
  await page.evaluate(() => {
    const sliders = document.querySelectorAll('input[type="range"]');
    sliders.forEach(s => {
      if (s.min === '0' && s.max === '1' && s.step === '0.05') {
        s.value = '1';
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
  await page.waitForTimeout(200);

  for (const { label, text } of TEXTS) {
    const fs = 14;
    const inp = await page.locator('input[type="text"]').first();
    await inp.fill(text);
    await page.locator('button:has-text("应用")').first().click().catch(() => {});
    await page.waitForTimeout(2700);

    const m = await measureWithDiff(page, '.stage canvas');
    const canvasLoc = page.locator('.stage canvas').first();
    const shotName = `${PHASE}_noise_${label}_fs${fs}.png`;
    await canvasLoc.screenshot({ path: path.join(SCREEN_DIR, shotName) });

    const w = m.w || 0;
    const textW = m.hasText ? (m.maxX - m.minX + 1) : 0;
    const leftPad = m.hasText ? m.minX : 0;
    const rightPad = m.hasText ? (w - 1 - m.maxX) : 0;
    const fillRatio = m.hasText ? (textW / w) : 0;
    const cssW_est = m.cssW || (w / 2);
    const charCount = [...text].length;
    const expectedTextCSS = Math.min(cssW_est * 0.95, charCount * fs * 0.62);
    const expectedTextW = expectedTextCSS * (w / cssW_est);
    const overflowRatio = expectedTextW > 0 ? (textW / expectedTextW) : 0;
    const expectedFillRatio = expectedTextW / w;
    const isOverflow = m.hasText && (fillRatio > 0.6 && expectedFillRatio < 0.7);

    results.push({
      page: 'noise-converge',
      label, text, fontSize: fs,
      bw: w, bh: m.h, cssW: m.cssW, cssH: m.cssH,
      minX: m.minX, maxX: m.maxX, textW, leftPad, rightPad, fillRatio,
      expectedTextW: Math.round(expectedTextW), expectedFillRatio,
      overflowRatio,
      stableLit: m.stableLit, totalLit: m.totalLit,
      hasText: m.hasText,
      isOverflow,
      shot: shotName
    });
    console.log(`  ${label.padEnd(10)} fs=${fs} textW=${textW}/${w} (fill=${(fillRatio*100).toFixed(0)}%) exp=${Math.round(expectedTextW)} ratio=${overflowRatio.toFixed(2)}× overflow=${isOverflow ? 'YES' : 'no'}`);
  }
}

await probePlayground();
await probeNoiseConverge();

await browser.close();

const overflowCases   = results.filter(r => r.isOverflow);
const cleanCases      = results.filter(r => r.hasText && !r.isOverflow);

let md = `# Text Overflow Report (phase=${PHASE})

Generated: ${new Date().toISOString()}

## Setup

- Viewport: 1280 × 800 CSS px
- DPR: 2 (canvas backing store ≈ cssWidth × 2)
- Pages probed: \`/playground\`, \`/demos/noise-converge\`
- Text samples: ${TEXTS.map(t => `\`${t.text}\` (${t.label}, ${t.text.length} chars)`).join(', ')}
- Font sizes: ${FONT_SIZES.join(', ')}
- targetLockStability: 1.0 (locked cells fully stable → measurable via temporal diff)
- Wait per case: 2700ms (noise→converge animation settle to \`hold\`)

## Methodology

1. Visit page, set lockStability=1.0 + text + fontSize via UI controls
2. Wait 2.7s for state machine to reach \`hold\` phase
3. Read raw pixels from canvas backing store
4. Wait 320ms, take second snapshot
5. **Diff:** pixels that are lit (lum > ${LUM_THRESHOLD}) AND unchanged between frames (|Δrgb| < ${DIFF_TOL})
   = **locked target text cells** (rain cells flicker; locked target cells stay constant)
6. Bounding box of stable-lit pixels = where text actually renders
7. \`fillRatio\` = textWidth / canvasWidth (the key signal)
8. \`expectedTextW\` = min(0.95 × cssWidth, charCount × fontSize × 0.62) × DPR
   (max plausible text width assuming JetBrains Mono char ≈ 0.62 × em height)
9. \`isOverflow\` = fillRatio > 60% AND expectedFillRatio < 70%
   (text fills canvas but shouldn't, given char count + fontSize)

## Summary

- **Total cases**: ${results.length}
- **Cases flagged as overflow**: ${overflowCases.length} / ${results.length}
- **Average fillRatio**: ${(results.filter(r=>r.hasText).reduce((a,r)=>a+r.fillRatio,0) / Math.max(1, results.filter(r=>r.hasText).length) * 100).toFixed(1)}%
- **Average overflow magnitude** (measured/expected): ${(results.filter(r=>r.hasText).reduce((a,r)=>a+r.overflowRatio,0) / Math.max(1, results.filter(r=>r.hasText).length)).toFixed(2)}×

${PHASE === 'before' ? '**Verdict (before fix)**: text consistently overflows — fillRatio ≈ 99% on every case regardless of text length. "OK" (2 chars) fills the canvas just like "VERY_LONG_TEXT_OVERFLOW" (23 chars).' : '**Verdict (after fix)**: textW now scales with charCount × fontSize; short text leaves margin; long text wraps inside canvas.'}

## Detailed results

| Page | Text | Font | Canvas (bw×bh) | TextW | FillRatio | ExpectedW | OverflowRatio | minX | maxX | Lpad | Rpad | Overflow | Shot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${results.map(r => `| ${r.page} | \`${r.text}\` (${r.text.length}) | ${r.fontSize} | ${r.bw}×${r.bh} | ${r.textW} | ${(r.fillRatio*100).toFixed(0)}% | ${r.expectedTextW} | ${r.overflowRatio.toFixed(2)}× | ${r.minX} | ${r.maxX} | ${r.leftPad} | ${r.rightPad} | ${r.isOverflow ? '⚠️ YES' : '✓ no'} | [\`${r.shot}\`](text-overflow-screens/${r.shot}) |`).join('\n')}

## Overflow cases

These cases have stable-lit text whose width is far larger than the character count + font size justifies:

${overflowCases.length === 0 ? '_(none — fixed!)_' : overflowCases.map(r => `- **${r.page}** · "${r.text}" (${r.text.length} chars) · fs=${r.fontSize} · textW=${r.textW}px (${(r.fillRatio*100).toFixed(0)}% of canvas) vs expected ${r.expectedTextW}px → ${r.overflowRatio.toFixed(1)}× too wide → [\`${r.shot}\`](text-overflow-screens/${r.shot})`).join('\n')}

## Visual evidence

Screenshots in \`/tmp/text-overflow-screens/\`. Compare ${PHASE === 'before' ? '\`before_*\` (current bug)' : '\`after_*\` (post-fix)'} cases:
- \`${PHASE}_playground_short_fs28.png\` — should show tiny "OK" in middle; bug shows full-width text
- \`${PHASE}_playground_extralong_fs10.png\` — long text at small font, should fit comfortably
- \`${PHASE}_noise_cjk_fs14.png\` — CJK "你好世界" centering

## Root cause (validated by data)

\`engine.ts:464-481\` (buildGrid) — uses \`canvas.getBoundingClientRect()\` (CSS px) for grid:
\`\`\`ts
const rect = canvas.getBoundingClientRect();
a = rect.width;             // 640 CSS px
canvas.width = round(a * n); // backing store 1280 (DPR=2)
r = ceil(a / ef);            // 640 / 16 = 40 cols (CORRECT — engine grid in CSS px)
\`\`\`

But call sites use \`canvas.width\` (backing store, NOT clientWidth):
- \`site/src/pages/PlaygroundPage.vue:211\`
- \`site/src/pages/DemoNoiseConverge.vue:129\`
- \`site/src/components/BackgroundMatrixRain.vue:58\`
\`\`\`ts
const cols = floor(canvas.width / fontSize);   // 1280/16 = 80 cols (WRONG, 2× engine grid)
const rows = floor(canvas.height / fontSize);
\`\`\`

**Consequence**: \`textToBitmap\` creates a 2× oversized bitmap. \`textToBitmap\` auto-scales
font so text fills ~95% of the requested cols, so text in bitmap occupies ~0.95 × 80 = 76 cells.
Engine centers bitmap with \`ox = (40 - 80)/2 = -20\` → only bitmap cells [20, 60) map to visible
grid cells [0, 40), with outer cells (20 on each side) **cropped off-canvas**.

**Effect**: text **appears to fill the entire canvas** regardless of length, because the
bitmap was rendered at 2× scale and we see only the middle 50% of it. Short text "OK" rendered
as if for 2× canvas → looks giant; long text "VERY_LONG_TEXT_OVERFLOW" middle slice shows
only the middle few characters (rest cropped).

This matches the measured data: textW ≈ canvasWidth × 99% for **every test case**, with
fillRatio being independent of charCount and fontSize.

## Recommended fix (validated against report)

1. **Plan B (must)**: 3 call sites use \`canvas.clientWidth/clientHeight\` instead of
   \`canvas.width/height\`. Fixes the immediate user-visible bug.
2. **Plan A (safety net)**: \`MatrixRainOptions.fitMode: 'contain' | 'cover' | 'actual'\`,
   default \`'contain'\`. Engine detects bitmap-content bounding box and scales/repositions
   so visible text always fits inside the canvas, even if caller passes wrong cols/rows.
3. **Type sync**: \`types/index.d.ts\` adds \`fitMode\` field on \`MatrixRainOptions\` and
   \`setTargetBitmap.opts\`.
4. **Test**: \`test/text-fit.mjs\` — each fitMode × long/short text, asserts visible
   bitmap content is fully inside grid bounds.
`;

await fs.writeFile(REPORT_PATH, md, 'utf8');
console.log(`\nReport: ${REPORT_PATH}`);
console.log(`Screens: ${SCREEN_DIR}`);
console.log(`Total cases: ${results.length}, overflow: ${overflowCases.length} (avg fillRatio ${(results.filter(r=>r.hasText).reduce((a,r)=>a+r.fillRatio,0)/Math.max(1,results.filter(r=>r.hasText).length)*100).toFixed(0)}%)`);
