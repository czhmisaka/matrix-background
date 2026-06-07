# Text Overflow Report (phase=before)

Generated: 2026-06-07T17:09:26.540Z

## Setup

- Viewport: 1280 × 800 CSS px
- DPR: 2 (canvas backing store ≈ cssWidth × 2)
- Pages probed: `/playground`, `/demos/noise-converge`
- Text samples: `OK` (short, 2 chars), `MATRIX` (medium, 6 chars), `PLAYWRIGHT` (long, 10 chars), `VERY_LONG_TEXT_OVERFLOW` (extralong, 23 chars), `你好世界` (cjk, 4 chars)
- Font sizes: 10, 16, 24, 28
- targetLockStability: 1.0 (locked cells fully stable → measurable via temporal diff)
- Wait per case: 2700ms (noise→converge animation settle to `hold`)

## Methodology

1. Visit page, set lockStability=1.0 + text + fontSize via UI controls
2. Wait 2.7s for state machine to reach `hold` phase
3. Read raw pixels from canvas backing store
4. Wait 320ms, take second snapshot
5. **Diff:** pixels that are lit (lum > 50) AND unchanged between frames (|Δrgb| < 10)
   = **locked target text cells** (rain cells flicker; locked target cells stay constant)
6. Bounding box of stable-lit pixels = where text actually renders
7. `fillRatio` = textWidth / canvasWidth (the key signal)
8. `expectedTextW` = min(0.95 × cssWidth, charCount × fontSize × 0.62) × DPR
   (max plausible text width assuming JetBrains Mono char ≈ 0.62 × em height)
9. `isOverflow` = fillRatio > 60% AND expectedFillRatio < 70%
   (text fills canvas but shouldn't, given char count + fontSize)

## Summary

- **Total cases**: 25
- **Cases flagged as overflow**: 25 / 25
- **Average fillRatio**: 99.1%
- **Average overflow magnitude** (measured/expected): 18.70×

**Verdict (before fix)**: text consistently overflows — fillRatio ≈ 99% on every case regardless of text length. "OK" (2 chars) fills the canvas just like "VERY_LONG_TEXT_OVERFLOW" (23 chars).

## Detailed results

| Page | Text | Font | Canvas (bw×bh) | TextW | FillRatio | ExpectedW | OverflowRatio | minX | maxX | Lpad | Rpad | Overflow | Shot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| playground | `OK` (2) | 10 | 1612×1006 | 1605 | 100% | 25 | 64.72× | 6 | 1610 | 6 | 1 | ⚠️ YES | [`before_playground_short_fs10.png`](text-overflow-screens/before_playground_short_fs10.png) |
| playground | `OK` (2) | 16 | 1612×1006 | 1601 | 99% | 40 | 40.35× | 10 | 1610 | 10 | 1 | ⚠️ YES | [`before_playground_short_fs16.png`](text-overflow-screens/before_playground_short_fs16.png) |
| playground | `OK` (2) | 24 | 1612×1006 | 1597 | 99% | 60 | 26.83× | 14 | 1610 | 14 | 1 | ⚠️ YES | [`before_playground_short_fs24.png`](text-overflow-screens/before_playground_short_fs24.png) |
| playground | `OK` (2) | 28 | 1612×1006 | 1591 | 99% | 69 | 22.91× | 16 | 1606 | 16 | 5 | ⚠️ YES | [`before_playground_short_fs28.png`](text-overflow-screens/before_playground_short_fs28.png) |
| playground | `MATRIX` (6) | 10 | 1612×1006 | 1605 | 100% | 74 | 21.57× | 6 | 1610 | 6 | 1 | ⚠️ YES | [`before_playground_medium_fs10.png`](text-overflow-screens/before_playground_medium_fs10.png) |
| playground | `MATRIX` (6) | 16 | 1612×1006 | 1601 | 99% | 119 | 13.45× | 10 | 1610 | 10 | 1 | ⚠️ YES | [`before_playground_medium_fs16.png`](text-overflow-screens/before_playground_medium_fs16.png) |
| playground | `MATRIX` (6) | 24 | 1612×1006 | 1597 | 99% | 179 | 8.94× | 14 | 1610 | 14 | 1 | ⚠️ YES | [`before_playground_medium_fs24.png`](text-overflow-screens/before_playground_medium_fs24.png) |
| playground | `MATRIX` (6) | 28 | 1612×1006 | 1583 | 98% | 208 | 7.60× | 16 | 1598 | 16 | 13 | ⚠️ YES | [`before_playground_medium_fs28.png`](text-overflow-screens/before_playground_medium_fs28.png) |
| playground | `PLAYWRIGHT` (10) | 10 | 1612×1006 | 1605 | 100% | 124 | 12.94× | 6 | 1610 | 6 | 1 | ⚠️ YES | [`before_playground_long_fs10.png`](text-overflow-screens/before_playground_long_fs10.png) |
| playground | `PLAYWRIGHT` (10) | 16 | 1612×1006 | 1601 | 99% | 198 | 8.07× | 10 | 1610 | 10 | 1 | ⚠️ YES | [`before_playground_long_fs16.png`](text-overflow-screens/before_playground_long_fs16.png) |
| playground | `PLAYWRIGHT` (10) | 24 | 1612×1006 | 1597 | 99% | 298 | 5.37× | 14 | 1610 | 14 | 1 | ⚠️ YES | [`before_playground_long_fs24.png`](text-overflow-screens/before_playground_long_fs24.png) |
| playground | `PLAYWRIGHT` (10) | 28 | 1612×1006 | 1591 | 99% | 347 | 4.58× | 16 | 1606 | 16 | 5 | ⚠️ YES | [`before_playground_long_fs28.png`](text-overflow-screens/before_playground_long_fs28.png) |
| playground | `VERY_LONG_TEXT_OVERFLOW` (23) | 10 | 1612×1006 | 1605 | 100% | 285 | 5.63× | 6 | 1610 | 6 | 1 | ⚠️ YES | [`before_playground_extralong_fs10.png`](text-overflow-screens/before_playground_extralong_fs10.png) |
| playground | `VERY_LONG_TEXT_OVERFLOW` (23) | 16 | 1612×1006 | 1601 | 99% | 456 | 3.51× | 10 | 1610 | 10 | 1 | ⚠️ YES | [`before_playground_extralong_fs16.png`](text-overflow-screens/before_playground_extralong_fs16.png) |
| playground | `VERY_LONG_TEXT_OVERFLOW` (23) | 24 | 1612×1006 | 1597 | 99% | 684 | 2.33× | 14 | 1610 | 14 | 1 | ⚠️ YES | [`before_playground_extralong_fs24.png`](text-overflow-screens/before_playground_extralong_fs24.png) |
| playground | `VERY_LONG_TEXT_OVERFLOW` (23) | 28 | 1612×1006 | 1591 | 99% | 799 | 1.99× | 16 | 1606 | 16 | 5 | ⚠️ YES | [`before_playground_extralong_fs28.png`](text-overflow-screens/before_playground_extralong_fs28.png) |
| playground | `你好世界` (4) | 10 | 1612×1006 | 1605 | 100% | 50 | 32.36× | 6 | 1610 | 6 | 1 | ⚠️ YES | [`before_playground_cjk_fs10.png`](text-overflow-screens/before_playground_cjk_fs10.png) |
| playground | `你好世界` (4) | 16 | 1612×1006 | 1601 | 99% | 79 | 20.17× | 10 | 1610 | 10 | 1 | ⚠️ YES | [`before_playground_cjk_fs16.png`](text-overflow-screens/before_playground_cjk_fs16.png) |
| playground | `你好世界` (4) | 24 | 1612×1006 | 1597 | 99% | 119 | 13.42× | 14 | 1610 | 14 | 1 | ⚠️ YES | [`before_playground_cjk_fs24.png`](text-overflow-screens/before_playground_cjk_fs24.png) |
| playground | `你好世界` (4) | 28 | 1612×1006 | 1591 | 99% | 139 | 11.46× | 16 | 1606 | 16 | 5 | ⚠️ YES | [`before_playground_cjk_fs28.png`](text-overflow-screens/before_playground_cjk_fs28.png) |
| noise-converge | `OK` (2) | 14 | 2300×956 | 2279 | 99% | 35 | 65.64× | 8 | 2286 | 8 | 13 | ⚠️ YES | [`before_noise_short_fs14.png`](text-overflow-screens/before_noise_short_fs14.png) |
| noise-converge | `MATRIX` (6) | 14 | 2300×956 | 2279 | 99% | 104 | 21.88× | 8 | 2286 | 8 | 13 | ⚠️ YES | [`before_noise_medium_fs14.png`](text-overflow-screens/before_noise_medium_fs14.png) |
| noise-converge | `PLAYWRIGHT` (10) | 14 | 2300×956 | 2279 | 99% | 174 | 13.13× | 8 | 2286 | 8 | 13 | ⚠️ YES | [`before_noise_long_fs14.png`](text-overflow-screens/before_noise_long_fs14.png) |
| noise-converge | `VERY_LONG_TEXT_OVERFLOW` (23) | 14 | 2300×956 | 2279 | 99% | 399 | 5.71× | 8 | 2286 | 8 | 13 | ⚠️ YES | [`before_noise_extralong_fs14.png`](text-overflow-screens/before_noise_extralong_fs14.png) |
| noise-converge | `你好世界` (4) | 14 | 2300×956 | 2279 | 99% | 69 | 32.82× | 8 | 2286 | 8 | 13 | ⚠️ YES | [`before_noise_cjk_fs14.png`](text-overflow-screens/before_noise_cjk_fs14.png) |

## Overflow cases

These cases have stable-lit text whose width is far larger than the character count + font size justifies:

- **playground** · "OK" (2 chars) · fs=10 · textW=1605px (100% of canvas) vs expected 25px → 64.7× too wide → [`before_playground_short_fs10.png`](text-overflow-screens/before_playground_short_fs10.png)
- **playground** · "OK" (2 chars) · fs=16 · textW=1601px (99% of canvas) vs expected 40px → 40.3× too wide → [`before_playground_short_fs16.png`](text-overflow-screens/before_playground_short_fs16.png)
- **playground** · "OK" (2 chars) · fs=24 · textW=1597px (99% of canvas) vs expected 60px → 26.8× too wide → [`before_playground_short_fs24.png`](text-overflow-screens/before_playground_short_fs24.png)
- **playground** · "OK" (2 chars) · fs=28 · textW=1591px (99% of canvas) vs expected 69px → 22.9× too wide → [`before_playground_short_fs28.png`](text-overflow-screens/before_playground_short_fs28.png)
- **playground** · "MATRIX" (6 chars) · fs=10 · textW=1605px (100% of canvas) vs expected 74px → 21.6× too wide → [`before_playground_medium_fs10.png`](text-overflow-screens/before_playground_medium_fs10.png)
- **playground** · "MATRIX" (6 chars) · fs=16 · textW=1601px (99% of canvas) vs expected 119px → 13.4× too wide → [`before_playground_medium_fs16.png`](text-overflow-screens/before_playground_medium_fs16.png)
- **playground** · "MATRIX" (6 chars) · fs=24 · textW=1597px (99% of canvas) vs expected 179px → 8.9× too wide → [`before_playground_medium_fs24.png`](text-overflow-screens/before_playground_medium_fs24.png)
- **playground** · "MATRIX" (6 chars) · fs=28 · textW=1583px (98% of canvas) vs expected 208px → 7.6× too wide → [`before_playground_medium_fs28.png`](text-overflow-screens/before_playground_medium_fs28.png)
- **playground** · "PLAYWRIGHT" (10 chars) · fs=10 · textW=1605px (100% of canvas) vs expected 124px → 12.9× too wide → [`before_playground_long_fs10.png`](text-overflow-screens/before_playground_long_fs10.png)
- **playground** · "PLAYWRIGHT" (10 chars) · fs=16 · textW=1601px (99% of canvas) vs expected 198px → 8.1× too wide → [`before_playground_long_fs16.png`](text-overflow-screens/before_playground_long_fs16.png)
- **playground** · "PLAYWRIGHT" (10 chars) · fs=24 · textW=1597px (99% of canvas) vs expected 298px → 5.4× too wide → [`before_playground_long_fs24.png`](text-overflow-screens/before_playground_long_fs24.png)
- **playground** · "PLAYWRIGHT" (10 chars) · fs=28 · textW=1591px (99% of canvas) vs expected 347px → 4.6× too wide → [`before_playground_long_fs28.png`](text-overflow-screens/before_playground_long_fs28.png)
- **playground** · "VERY_LONG_TEXT_OVERFLOW" (23 chars) · fs=10 · textW=1605px (100% of canvas) vs expected 285px → 5.6× too wide → [`before_playground_extralong_fs10.png`](text-overflow-screens/before_playground_extralong_fs10.png)
- **playground** · "VERY_LONG_TEXT_OVERFLOW" (23 chars) · fs=16 · textW=1601px (99% of canvas) vs expected 456px → 3.5× too wide → [`before_playground_extralong_fs16.png`](text-overflow-screens/before_playground_extralong_fs16.png)
- **playground** · "VERY_LONG_TEXT_OVERFLOW" (23 chars) · fs=24 · textW=1597px (99% of canvas) vs expected 684px → 2.3× too wide → [`before_playground_extralong_fs24.png`](text-overflow-screens/before_playground_extralong_fs24.png)
- **playground** · "VERY_LONG_TEXT_OVERFLOW" (23 chars) · fs=28 · textW=1591px (99% of canvas) vs expected 799px → 2.0× too wide → [`before_playground_extralong_fs28.png`](text-overflow-screens/before_playground_extralong_fs28.png)
- **playground** · "你好世界" (4 chars) · fs=10 · textW=1605px (100% of canvas) vs expected 50px → 32.4× too wide → [`before_playground_cjk_fs10.png`](text-overflow-screens/before_playground_cjk_fs10.png)
- **playground** · "你好世界" (4 chars) · fs=16 · textW=1601px (99% of canvas) vs expected 79px → 20.2× too wide → [`before_playground_cjk_fs16.png`](text-overflow-screens/before_playground_cjk_fs16.png)
- **playground** · "你好世界" (4 chars) · fs=24 · textW=1597px (99% of canvas) vs expected 119px → 13.4× too wide → [`before_playground_cjk_fs24.png`](text-overflow-screens/before_playground_cjk_fs24.png)
- **playground** · "你好世界" (4 chars) · fs=28 · textW=1591px (99% of canvas) vs expected 139px → 11.5× too wide → [`before_playground_cjk_fs28.png`](text-overflow-screens/before_playground_cjk_fs28.png)
- **noise-converge** · "OK" (2 chars) · fs=14 · textW=2279px (99% of canvas) vs expected 35px → 65.6× too wide → [`before_noise_short_fs14.png`](text-overflow-screens/before_noise_short_fs14.png)
- **noise-converge** · "MATRIX" (6 chars) · fs=14 · textW=2279px (99% of canvas) vs expected 104px → 21.9× too wide → [`before_noise_medium_fs14.png`](text-overflow-screens/before_noise_medium_fs14.png)
- **noise-converge** · "PLAYWRIGHT" (10 chars) · fs=14 · textW=2279px (99% of canvas) vs expected 174px → 13.1× too wide → [`before_noise_long_fs14.png`](text-overflow-screens/before_noise_long_fs14.png)
- **noise-converge** · "VERY_LONG_TEXT_OVERFLOW" (23 chars) · fs=14 · textW=2279px (99% of canvas) vs expected 399px → 5.7× too wide → [`before_noise_extralong_fs14.png`](text-overflow-screens/before_noise_extralong_fs14.png)
- **noise-converge** · "你好世界" (4 chars) · fs=14 · textW=2279px (99% of canvas) vs expected 69px → 32.8× too wide → [`before_noise_cjk_fs14.png`](text-overflow-screens/before_noise_cjk_fs14.png)

## Visual evidence

Screenshots in `/tmp/text-overflow-screens/`. Compare `before_*` (current bug) cases:
- `before_playground_short_fs28.png` — should show tiny "OK" in middle; bug shows full-width text
- `before_playground_extralong_fs10.png` — long text at small font, should fit comfortably
- `before_noise_cjk_fs14.png` — CJK "你好世界" centering

## Root cause (validated by data)

`engine.ts:464-481` (buildGrid) — uses `canvas.getBoundingClientRect()` (CSS px) for grid:
```ts
const rect = canvas.getBoundingClientRect();
a = rect.width;             // 640 CSS px
canvas.width = round(a * n); // backing store 1280 (DPR=2)
r = ceil(a / ef);            // 640 / 16 = 40 cols (CORRECT — engine grid in CSS px)
```

But call sites use `canvas.width` (backing store, NOT clientWidth):
- `site/src/pages/PlaygroundPage.vue:211`
- `site/src/pages/DemoNoiseConverge.vue:129`
- `site/src/components/BackgroundMatrixRain.vue:58`
```ts
const cols = floor(canvas.width / fontSize);   // 1280/16 = 80 cols (WRONG, 2× engine grid)
const rows = floor(canvas.height / fontSize);
```

**Consequence**: `textToBitmap` creates a 2× oversized bitmap. `textToBitmap` auto-scales
font so text fills ~95% of the requested cols, so text in bitmap occupies ~0.95 × 80 = 76 cells.
Engine centers bitmap with `ox = (40 - 80)/2 = -20` → only bitmap cells [20, 60) map to visible
grid cells [0, 40), with outer cells (20 on each side) **cropped off-canvas**.

**Effect**: text **appears to fill the entire canvas** regardless of length, because the
bitmap was rendered at 2× scale and we see only the middle 50% of it. Short text "OK" rendered
as if for 2× canvas → looks giant; long text "VERY_LONG_TEXT_OVERFLOW" middle slice shows
only the middle few characters (rest cropped).

This matches the measured data: textW ≈ canvasWidth × 99% for **every test case**, with
fillRatio being independent of charCount and fontSize.

## Recommended fix (validated against report)

1. **Plan B (must)**: 3 call sites use `canvas.clientWidth/clientHeight` instead of
   `canvas.width/height`. Fixes the immediate user-visible bug.
2. **Plan A (safety net)**: `MatrixRainOptions.fitMode: 'contain' | 'cover' | 'actual'`,
   default `'contain'`. Engine detects bitmap-content bounding box and scales/repositions
   so visible text always fits inside the canvas, even if caller passes wrong cols/rows.
3. **Type sync**: `types/index.d.ts` adds `fitMode` field on `MatrixRainOptions` and
   `setTargetBitmap.opts`.
4. **Test**: `test/text-fit.mjs` — each fitMode × long/short text, asserts visible
   bitmap content is fully inside grid bounds.
