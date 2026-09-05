# 0.5.0 开发任务 · 完整 Plan

> **状态**: 🔶 大部分完成(Phase 2 完整重设计除外)· **创建**: 2026-06-10 · **更新**: 2026-09-06 复核勾选
> **目标**: 真像素测试安全网 + WebGPU compute 恢复 + 代码清理 + 发版
> **前置**: 0.4.1 已发布,12 个 bug 已修 ([audit-fake-impl-2026-06-10.md](docs/audits/fake-impl-2026-06-10.md))
> **Plan 结构**: 每个 Phase 必含 `### 长期目标` / `### 本轮交付` / `### 实际测试代码` / `### 自我验证` 四段(由 [[feedback_plan_structure]] 强制)

---

## 任务总览

| Phase   | 内容                                      | 优先级 | 长期目标                 | 状态                                                                     |
| ------- | ----------------------------------------- | ------ | ------------------------ | ------------------------------------------------------------------------ |
| Phase 1 | Playwright headed 真像素测试 (P2-1)       | 🔴 P0  | 防"只验不抛"假实现复发   | ✅ (0.5.x 建成;2026-09-06 修复为 per-renderer baseline + 确定性 fixture) |
| Phase 2 | WebGPU compute pass 重新设计              | 🟡 P1  | 恢复 WebGPU 真实并行计算 | 🔶 部分 (0.5.0 恢复基础 compute;完整重设计待做)                          |
| Phase 3 | `drawTrail` 参数清理 (P2-3)               | 🟢 P2  | 接口契约自洽             | ✅                                                                       |
| Phase 4 | 收尾:esbuild splitting + CHANGELOG + bump | 🟢 P3  | 0.5.0 可发布             | ✅ (0.5.0 已发;splitting 于 0.7.1 懒升级落地)                            |

**执行顺序**: Phase 1 → Phase 2 → (Phase 3 可穿插) → Phase 4

---

## Phase 1 — 真像素测试 (P2-1)

### 长期目标

- 永久防"假实现"回归:任何 renderer 上线前,必须在真浏览器中跑出**与 canvas2d 基准视觉等价**的像素,才能 merge。
- 与 [audit-fake-impl-2026-06-10.md](docs/audits/fake-impl-2026-06-10.md) P2-1 直接对应:Node 端 `MockCanvas` + "只验不抛"的契约测试无法证明渲染正确,必须升级为 headed 浏览器像素对比。
- 建立 0.5.0+ 的视觉回归门槛:此 Phase 完成后,**任何 P0 渲染 bug 一旦回归,CI 立刻红屏**。

### 本轮交付

1. 新增 `test/renderer-pixel.mjs`:
   - Playwright Chromium headed(必须 headed,headless 缺 GPU/字体差异)
   - 跑 3 个场景 × 3 个 renderer = 9 个 case:
     - 场景 A:1080p / fontSize 14 / 30 fps 跑 60 帧
     - 场景 B:1440p / fontSize 8 / 60 fps 跑 60 帧
     - 场景 C:4K / fontSize 4 / 30 fps 跑 30 帧
   - 对每对 renderer(以 canvas2d 为基准)做 SSIM 简化版像素差:
     - 取第 30 帧 / 第 60 帧(中间帧 + 稳定帧)截 canvas → PNG buffer
     - 灰度化 → 计算 95% 像素与基准的 |Δ| < 5/255
     - 任何一对不达标 → exit 1 并打印差异热力图路径
2. `package.json` 新增 `"test:pixel": "node test/renderer-pixel.mjs"`
3. README/CONTRIBUTING 加一段"新加 renderer 必须先过 test:pixel"
4. 不动任何生产代码(本 Phase 是纯测试基建)

### 实际测试代码

**`test/renderer-pixel.mjs`**(可直接落地):

```js
/**
 * 真像素对比测试 (P2-1)
 *
 * 目的: 防止 0.4.0 假实现重演 —— 任何 renderer 必须与 canvas2d 基准在真浏览器中视觉等价。
 *
 * 用法:
 *   npx playwright install chromium   # 首次必须
 *   npm run build                      # 准备 dist
 *   npm run test:pixel
 *
 * 通过标准: 95% 像素与 canvas2d 基准差 < 5/255(允许 alpha/抗锯齿差异)
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist', 'index.iife.js');
const PASS_THRESHOLD = 0.95; // 95% 像素合格
const PIXEL_DELTA = 5; // |Δ| < 5/255

const SCENARIOS = [
  { name: '1080p-fs14', w: 1920, h: 1080, fontSize: 14, frames: 60 },
  { name: '1440p-fs8', w: 2560, h: 1440, fontSize: 8, frames: 60 },
  { name: '4K-fs4', w: 3840, h: 2160, fontSize: 4, frames: 30 },
];
const RENDERERS = ['canvas2d', 'webgl', 'webgpu'];

// ---------- 极简静态服(服务 dist/)----------
function startServer() {
  return new Promise((resolve) => {
    const MIME = {
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json',
    };
    const srv = createServer(async (req, res) => {
      try {
        const p = join(__dirname, '..', 'dist', req.url === '/' ? '/demo.html' : req.url);
        const data = await readFile(p);
        res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
        res.end(data);
      } catch (e) {
        res.writeHead(404);
        res.end(String(e));
      }
    });
    srv.listen(0, () => resolve(srv));
  });
}

// ---------- 像素差 ----------
function pixelDelta(a, b) {
  if (a.length !== b.length) throw new Error(`buffer size mismatch: ${a.length} vs ${b.length}`);
  const N = a.length / 4; // RGBA
  let match = 0;
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    const dr = Math.abs(a[o] - b[o]);
    const dg = Math.abs(a[o + 1] - b[o + 1]);
    const db = Math.abs(a[o + 2] - b[o + 2]);
    // 灰度近似
    const delta = (dr + dg + db) / 3;
    if (delta < PIXEL_DELTA) match++;
  }
  return match / N;
}

// ---------- 主流程 ----------
async function captureFrame(page, frameIdx) {
  return page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const off = document.createElement('canvas');
        off.width = window.innerWidth;
        off.height = window.innerHeight;
        const ctx = off.getContext('2d');
        // 等到指定帧
        const wait = () => {
          if (window.__frameIdx >= n) {
            ctx.drawImage(document.querySelector('canvas'), 0, 0);
            resolve(ctx.getImageData(0, 0, off.width, off.height).data);
          } else requestAnimationFrame(wait);
        };
        requestAnimationFrame(wait);
      }),
    frameIdx
  );
}

async function runOne(page, renderer, sc) {
  await page.setViewportSize({ width: sc.w, height: sc.h });
  await page.goto(`http://localhost:${PORT}/demo.html?renderer=${renderer}&fontSize=${sc.fontSize}`);
  // 等首帧
  await page.waitForFunction(() => window.__frameIdx > 0);
  return captureFrame(page, sc.frames - 1);
}

const srv = await startServer();
const PORT = srv.address().port;
const browser = await chromium.launch({ headless: true /* CI */ });
const page = await browser.newPage();

let totalCases = 0,
  passCases = 0;
const failures = [];

for (const sc of SCENARIOS) {
  const baseline = await runOne(page, 'canvas2d', sc);
  for (const r of RENDERERS) {
    if (r === 'canvas2d') continue; // 自己对自己跳过
    totalCases++;
    try {
      const got = await runOne(page, r, sc);
      const ratio = pixelDelta(got, baseline);
      const ok = ratio >= PASS_THRESHOLD;
      console.log(`[${sc.name}/${r}] match=${(ratio * 100).toFixed(2)}% ${ok ? '✅' : '❌'}`);
      if (ok) passCases++;
      else failures.push({ scenario: sc.name, renderer: r, ratio });
    } catch (e) {
      totalCases++;
      failures.push({ scenario: sc.name, renderer: r, error: String(e) });
      console.log(`[${sc.name}/${r}] ❌ THROW: ${e.message}`);
    }
  }
}

await browser.close();
srv.close();

console.log(`\n=== ${passCases}/${totalCases} 通过 ===`);
if (failures.length) {
  console.log('失败明细:', JSON.stringify(failures, null, 2));
  process.exit(1);
}
```

**`dist/demo.html`**(test 用,不入 git 也行,放 scripts/ 模板):

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="./matrix-rain.css" />
  </head>
  <body style="margin:0;background:#000">
    <canvas id="c" style="display:block"></canvas>
    <script src="./index.iife.js"></script>
    <script>
      const params = new URLSearchParams(location.search);
      const r = params.get('renderer') || 'auto';
      const fs = Number(params.get('fontSize') || 14);
      window.__frameIdx = 0;
      const m = matrixRain(document.querySelector('#c'), { renderer: r, fontSize: fs });
      function loop() {
        window.__frameIdx++;
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
      window.__m = m;
    </script>
  </body>
</html>
```

### 自我验证

- **跑命令**: `npm run test:pixel` → 期望输出 `2/2 通过` (webgl vs canvas2d, webgpu vs canvas2d,2 个非基准 renderer)
- **手动负面验证**: 临时把 [src/renderer/webgl-renderer.ts:331](src/renderer/webgl-renderer.ts#L331) `drawTrail` 改成 `return;` → 重跑 `npm run test:pixel` → 必须 ❌(证明这个测试真能抓 bug,不只是"恒真")
- **不应误伤**: canvas2d vs canvas2d 必须 100% 通过(空跑自检)
- **门禁**: 后续 Phase 2 改完 WebGPU 也要进同一个 test:pixel,保证不破 95% 门槛

---

## Phase 2 — WebGPU compute pass 重新设计

### 长期目标

- WebGPU 路径恢复 **GPU 并行计算 warmth 的能力**(发挥 WebGPU 相对 WebGL 的核心优势)
- 修复 P0-2/3/4/6 四个根因,**正确性优先于性能**
- 完成后:`bench:renderer` 中 webgpu 场景 `nonZeroRatio = 100%`(不再有 P0-1 那种"假 60 fps 实际无渲染")
- Chrome 113+ 真机不 crash(原 P0-4 开机即崩)

### 本轮交付

1. **WGSL compute shader** 正确性:
   - `var<storage, read_write> cells: array<Cell>`(非嵌套 runtime array,非 `read-only-storage`)
   - `@compute @workgroup_size(64)` 每个 invocation 处理一格
   - 输入:`lightCenter: vec2<f32>`,`driftSpeed: vec2<f32>`,`dt: f32`
   - 输出:`cells[i].warmth`(累积 + 衰减)
2. **BindGroupLayout 配对**:
   - `{ binding: 0, visibility: STORAGE | COMPUTE, buffer: { type: 'storage' } }` ← 关键:`type: 'storage'`,**不是** `read-only-storage`
3. **Render pipeline fragment shader**:
   - 读 `cells[instance_id].warmth` 调色(canvas2d 路径不依赖此字段)
4. **`_updateWarmthParams()`** 从 `state.cfg.lightCenter` / `state.cfg.driftSpeed` 读,**不再硬编码 (0.5,0.5)/(0.15,0.1)**
5. **`init()`** 完成后:用 queue.writeBuffer 写入 cells 初始 warmth(0.0~1.0 随机或固定)
6. **`render()`** 顺序:`commandEncoder.beginComputePass() → setPipeline + dispatch → end → beginRenderPass() → setPipeline + draw → end`
7. **不破坏现有**: 已有 `test/renderer-webgpu.mjs` 21 个契约测试必须仍通过

### 实际测试代码

**A. 单元/契约测试** (Node 端,扩展 `test/renderer-webgpu.mjs`):

```js
// 在 test/renderer-webgpu.mjs 末尾追加
import assert from 'node:assert/strict';

// P0-4 回归: compute pipeline 必须能创建(以前一启动就抛)
test('WebGPU compute pipeline 不抛 validation error', async () => {
  const r = new WebGPURenderer();
  await r.init(mockCanvas, mockState);
  // 之前:  createComputePipeline() 抛 "buffer binding 'cells' is read-only-storage but shader uses read_write"
  // 现在:  不抛
  assert.ok(r._computePipeline, 'compute pipeline 必须存在');
  assert.equal(r._computePipeline.getBindGroupLayout(0).entries[0].buffer.type, 'storage');
  r.destroy();
});

// P0-6 回归: lightCenter 必须从 state.cfg 读
test('lightCenter/driftSpeed 来自 state.cfg', async () => {
  mockState.cfg.lightCenter = { x: 0.7, y: 0.3 };
  mockState.cfg.driftSpeed = { x: 0.2, y: 0.05 };
  const r = new WebGPURenderer();
  await r.init(mockCanvas, mockState);
  r._updateWarmthParams(mockState);
  // uniform buffer 内容应反映 cfg
  const buf = new Float32Array(r._warmthParamsBuffer.getMappedRange());
  assert.ok(Math.abs(buf[0] - 0.7) < 0.001);
  assert.ok(Math.abs(buf[1] - 0.3) < 0.001);
});

// P0-3 回归: cellsBuffer 必须在 init() 后有非零数据
test('cellsBuffer 在 init() 后被写入', async () => {
  const r = new WebGPURenderer();
  await r.init(mockCanvas, mockState);
  await r._cellsBuffer.mapAsync(GPUMapMode.READ);
  const data = new Float32Array(r._cellsBuffer.getMappedRange());
  const sum = data.reduce((a, b) => a + b, 0);
  assert.ok(sum > 0, 'cellsBuffer 必须被写入非零 warmth');
});
```

**B. 真像素测试** (复用 Phase 1 的 `test/renderer-pixel.mjs`,**自动覆盖**)

跑 `npm run test:pixel` 时,webgpu 必须 ≥ 95% 匹配 canvas2d,这是 Phase 2 的硬门槛。

**C. 手动冒烟**(`scripts/bench-renderer.mjs` 已含 webgpu 场景):

```bash
npm run bench:renderer
# 输出末尾必须含: "webgpu: nonZeroRatio=100.00% FPS=..."
# 之前 0.4.0: nonZeroRatio ≈ 0% (因为 P0-1 假实现)
```

### 自我验证

- **静态**: `npm run type-check` 0 错
- **契约**: `npm test` 仍 21/21 + 新加 3 个 case
- **真像素**: `npm run test:pixel` webgpu ≥ 95% 匹配
- **Bench**: `npm run bench:renderer` webgpu `nonZeroRatio = 100%`(以前是 0%)
- **真机**: Chrome 113+ (--enable-unsafe-webgpu flag) 打开 `site/dist-demo/index.html?renderer=webgpu` 跑 5 秒**不抛**任何 validation error
- **退路**: 如果 compute 在某些平台/驱动上仍崩,**回退**到 instanced-only(0.4.1 状态),保留 init/destroy 钩子;不强行 ship

---

## Phase 3 — `drawTrail` 参数清理 (P2-3)

### 长期目标

- 接口契约自洽:`drawTrail` 不再接受永远被忽略的 `w` / `h` 参数
- 对应 [audit-fake-impl-2026-06-10.md](docs/audits/fake-impl-2026-06-10.md) P2-3
- 顺手清掉 3 个 renderer 的形参噪音 + 1 个调用点
- 风险极低(纯签名调整,无行为变化),可与 Phase 2 穿插

### 本轮交付

1. `src/renderer/types.ts:114`: `drawTrail(r, g, b, a, w, h)` → `drawTrail(r, g, b, a)`
2. `src/renderer/canvas2d-renderer.ts:105`: 同上
3. `src/renderer/webgl-renderer.ts:331`: 同上
4. `src/renderer/webgpu-renderer.ts:302`: 同上
5. `src/engine/draw-helpers.ts`: 找到调用点(目前传 `state.canvas.width/height` 或类似)→ 改为只传 4 个参数
6. **不**改内部行为:webgl 仍读 `this._w/_h`,canvas2d 仍读 `state.canvas`,只是签名层去掉

### 实际测试代码

**A. 静态检查**(自动,无需新文件):

```bash
npm run type-check    # 必须 0 错(签名不匹配会立刻报)
npm run lint          # 必须 0 错
```

**B. 契约测试**(扩展 `test/renderer-canvas2d.mjs` 等):

```js
// 验证新签名存在 + 旧签名已移除
test('canvas2d drawTrail 是 4 参函数', () => {
  const r = new Canvas2DRenderer();
  assert.equal(r.drawTrail.length, 4, 'drawTrail 长度必须是 4');
});
test('webgl drawTrail 是 4 参函数', () => {
  const r = new WebGL2Renderer();
  assert.equal(r.drawTrail.length, 4);
});
test('webgpu drawTrail 是 4 参函数', () => {
  const r = new WebGPURenderer();
  assert.equal(r.drawTrail.length, 4);
});
// type-check 已覆盖 types.ts 签名,这里只是运行时备份
```

**C. 视觉零回归**: 跑 Phase 1 的 `npm run test:pixel` —— `drawTrail` 只影响底色,canvas2d 自身通过 + (webgl/webgpu 改动后)仍通过即可

### 自我验证

- `npm run type-check` ✅ 0 错
- `npm run lint` ✅ 0 错
- `npm test` ✅ 21/21 + 3 个新签名 case
- `npm run test:pixel` ✅ canvas2d 自对比仍 100% (因为本 Phase 不改行为,只改签名)

---

## Phase 4 — 收尾 & 发版 0.5.0

### 长期目标

- 0.5.0 作为"渲染正确性已立安全网 + WebGPU 真实可用"的可信版本入库
- 包体积改善(canvas2d 默认路径约 28KB gzip,WebGL/WebGPU 走 dynamic import)
- CHANGELOG / 审计报告 / 文档三方一致

### 本轮交付

1. **esbuild code splitting** ([tsup.config.ts](tsup.config.ts)):
   - 把 `src/renderer/webgl-renderer.ts` / `webgl-shaders.ts` / `webgpu-*` 拆成独立 chunk
   - 配置: `splitting: true`, `format: ['esm']`, 入口仍 `./src/index.ts` 不变
   - **验证**: `npm run build` 后 `dist/index.js` 不再 inline webgl/webgpu 代码
2. **`package.json`** version: `0.4.1` → `0.5.0`
3. **[CHANGELOG.md](CHANGELOG.md)** 新增 0.5.0 段:
   - Features: 真像素测试基建 + WebGPU compute 恢复
   - Bugfixes: P2-3 drawTrail 接口
   - Performance: esbuild splitting
4. **[docs/audits/fake-impl-2026-06-10.md](docs/audits/fake-impl-2026-06-10.md)** "修复进度"表更新:
   - P2-1 → ✅ (test/renderer-pixel.mjs)
   - P2-3 → ✅ (drawTrail 清理)
   - 其余保持 0.4.1 状态
5. **端到端冒烟** (见自我验证)

### 实际测试代码

**A. 体积回归测试** (新加 `test/build-size.mjs`):

```js
/**
 * 体积门禁: canvas2d 默认入口 gzip 必须 ≤ 32KB
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const FILE = join(import.meta.dirname, '..', 'dist', 'index.js');
const raw = readFileSync(FILE);
const gz = gzipSync(raw);
const kb = (gz.length / 1024).toFixed(1);
console.log(`dist/index.js: raw=${(raw.length / 1024).toFixed(1)}KB gzip=${kb}KB`);
if (gz.length > 32 * 1024) {
  console.error(`❌ 体积超 32KB gzip 上限: ${kb}KB`);
  process.exit(1);
}
console.log(`✅ ${kb}KB ≤ 32KB`);
```

配套 `package.json`: `"test:size": "node test/build-size.mjs"`

**B. 全量回归**: 把 test:pixel 也并入 `npm test` 主链路(`test:pixel` 跑完再跑契约):

```json
"test": "... 现有 21 个 ... && node test/build-size.mjs"
```

(注:Playwright 首次跑要 `npx playwright install chromium`,README 必须写清楚)

**C. CHANGELOG 自动化校验** (`scripts/check-changelog.mjs`,可选用 lint-staged 钩):

```js
// 简单 grep: 0.5.0 段必须含 "P2-1" "P2-3" 两个关键词
```

### 自我验证

按以下顺序跑(任一失败 → 阻塞发版):

1. `npm run type-check` → 0 错
2. `cd site && npm run type-check` → 0 错
3. `npm test` → 21 原有 + 3 签名 + 3 体积 (≈ 27/27)
4. `npm run test:pixel` → webgl + webgpu 各 3 场景 ≥ 95% 匹配
5. `npm run build` → 0 warning(可接受的 esbuild hint 例外)
6. `npm run test:size` → dist/index.js gzip ≤ 32KB
7. `npm run bench:renderer` → webgpu `nonZeroRatio=100%`
8. **手动**: `git diff v0.4.1..HEAD --stat` 看到的文件清单与 CHANGELOG 一致
9. `git tag v0.5.0` + `git push origin v0.5.0` → GitHub Action 触发自动 publish

---

## 跨阶段约束

- **commit 节奏**: 每个 Phase 完成 → `git add -A && git commit -m "feat(<scope>): <desc>"` → auto-commit 由 [[feedback_audit_pattern]] 强制
- **不破 0.4.1**: 任一 Phase 中如发现需要改 docs/audit 中标记为 ✅ 的项,**立即停下**开新 issue,不在 0.5.0 顺手修
- **fontSize 下限**: 任何 Phase 改 cfg/slider 都要遵守 [[feedback_min_font_size]] 4px 硬下限
- **测试优先**: Phase 1 落地前**不能**进 Phase 2(假实现可能在没有安全网时再次溜进 WebGPU)
- **不引入 CDN**: 沿用 [[project_deployment_goal]] 路线,Playwright 安装是 devDep,不影响产物

---

## 待办序列(可勾选)

- [ ] **Phase 1**
  - [ ] `test/renderer-pixel.mjs` 落地
  - [ ] `package.json` 加 `test:pixel` script
  - [ ] 自检:webgl 故意坏掉 → test:pixel 必 ❌
  - [ ] 自检:test:pixel webgl 修好 → ✅
- [ ] **Phase 2**
  - [ ] `src/renderer/webgpu-shaders.ts` 修 WGSL
  - [ ] `src/renderer/webgpu-renderer.ts` 修 pipeline/params/init
  - [ ] `test/renderer-webgpu.mjs` 加 3 个回归 case
  - [ ] `bench:renderer` webgpu `nonZeroRatio=100%`
  - [ ] Chrome 113+ 真机冒烟
- [ ] **Phase 3**
  - [ ] `types.ts` 改 4 参
  - [ ] 3 个 renderer 改 4 参
  - [ ] `draw-helpers.ts` 调用点改 4 参
  - [ ] 3 个签名 case 通过
- [ ] **Phase 4**
  - [ ] esbuild splitting
  - [ ] version bump
  - [ ] CHANGELOG
  - [ ] 审计 doc 更新
  - [ ] 端到端冒烟全过
  - [ ] tag v0.5.0
