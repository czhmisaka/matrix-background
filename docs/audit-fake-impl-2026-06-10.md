# 虚假实现审查报告 · 2026-06-10

> **作者**: claude (Sonnet) · **目的**: 审查 0.4.0 已 commit 代码中"看起来跑通、其实没实现"的代码  
> **方法**: 只读静态分析,沿调用链回溯。`npm test` 通过 ≠ 真实现 — Node 端用 Mock canvas,只验证"不抛"。  
> **范围**: `src/renderer/*` `src/engine/*` `src/engine.ts` `scripts/bench-renderer.mjs` `site/src/composables/useMatrixRain.ts`  
> **结论**: 发现 6 个 P0(WebGL/WebGPU 渲染器**完全不工作**)+ 4 个 P1 + 3 个 P2

---

## 摘要表

| ID | 优先级 | 文件 | 问题 | 用户可感知后果 |
|---|---|---|---|---|
| P0-1 | 🔴 P0 | webgl/webgpu-renderer | drawChar 用 `ch`(charset index)作 instance buffer 槽位偏移 | 1080p 选 webgl/webgpu 时,屏幕上**最多只显示 24 个字符**(charset 长度),整张矩阵雨**完全不渲染** |
| P0-2 | 🔴 P0 | webgpu-renderer | compute 输出 `cells[idx].warmth` **从未被 render pipeline 读取** | compute pass 跑空,完全没意义,反而浪费 GPU 时间 |
| P0-3 | 🔴 P0 | webgpu-renderer | `_cellsBuffer` 创建后**从未写入数据**就被 compute pipeline 读取 | 真浏览器跑会读 undefined GPU 内存(可能 = 0,可能崩) |
| P0-4 | 🔴 P0 | webgpu-renderer + webgpu-shaders | BindGroupLayout 声明 `read-only-storage` 但 WGSL 写 `read_write` | 真 Chrome 113+ 跑会在 `createComputePipeline()` 抛 validation error,**WebGPU 路径开机即崩** |
| P0-5 | 🔴 P0 | engine.ts | `buildGrid()` 触发后 webgl/webgpu 的 `_instanceBuffer` 大小不变 | resize 窗口 / setDensity 后,WebGL/WebGPU 渲染状态紊乱(虽然因 P0-1 已经看不到了) |
| P0-6 | 🔴 P0 | webgpu-renderer | `_updateWarmthParams` 硬编码 `lightCenter=(0.5,0.5)` `driftSpeed=(0.15,0.1)`,完全忽略 `state.cfg.lightCenter` / `state.cfg.driftSpeed` | 即使 compute 修好了,光源中心与 canvas2d 也对不上 |
| P1-1 | 🟡 P1 | useMatrixRain | `if (o.variant) inst.setVariantParams({})` — 传空对象 `{}`,根本没切 variant | 用户在 Playground 切 variant(classic→ripple)无效果 |
| P1-2 | 🟡 P1 | useMatrixRain | charset/warmthRadius/warmthLerp/lightCenter/driftSpeed/hueRotateSpeed/clickBurst/flickerRates/maxDPR/sparkProbability/trailAlpha/variantParams 入 watch key 但 apply 分支没处理 | 11+ 设置改了后 watch 触发但什么也不做,纯耗 cpu |
| P1-3 | 🟡 P1 | useMatrixRain | `if (o.charset !== undefined) /* skip */ void 0` | charset 软更新被显式跳过,但 effectKey 仍在监听,无限触发空更新 |
| P1-4 | 🟡 P1 | bench-renderer.mjs | bench 只读 `getFPS()`,**完全不验证渲染正确性** | 假 renderer 也能"跑出 30 fps"骗过 bench(实际就是这次发生的事) |
| P2-1 | 🟢 P2 | renderer-webgl/webgpu.mjs 测试 | Node 测试用 MockCanvas,只验"不抛异常",不验任何渲染像素 | "21/21 通过"是真,但只是契约测试,不证明真渲染对 |
| P2-2 | 🟢 P2 | webgpu-renderer | `setFontSize(_px)` 忽略 `_px` 参数,固定写 `_cellSizePx = 32 * _dpr` | fontSize 改了不生效(目前因 P0-1 看不出来) |
| P2-3 | 🟢 P2 | webgpu-renderer.ts:296 `drawTrail(_w, _h)` | `_w` `_h` 参数收下后丢弃,trail 不依赖 viewport 大小(目前是常量) | 无可见影响,但接口签名误导 |

---

## 详细分析

### P0-1: `ch` 当 cell index 用 — 渲染器**根本无法**画完整矩阵

**位置**: [src/renderer/webgl-renderer.ts:322-351](src/renderer/webgl-renderer.ts#L322-L351) + [src/renderer/webgpu-renderer.ts:318-342](src/renderer/webgpu-renderer.ts#L318-L342)

**接口契约** ([src/renderer/types.ts:132](src/renderer/types.ts#L132)):
```ts
/** @param ch 字符索引 (0..charset.length-1) */
drawChar(ch: number, cx: number, cy: number, ...): void
```

**Canvas2D 实现** ([src/renderer/canvas2d-renderer.ts:125](src/renderer/canvas2d-renderer.ts#L125)) — 正确:
```ts
drawChar(ch, cx, cy, r, g, b, a) {
  const chStr = this._charset[ch];
  this._ctx.fillText(chStr, cx, cy);  // 立即画在 (cx, cy)
}
```

**WebGL/WebGPU 实现** — **错误**:
```ts
drawChar(ch, cx, cy, ...) {
  if (ch < 0 || ch >= this._instanceCount) return;   // 错:ch 是 charset index 不是 cell index
  const off = ch * INSTANCE_STRIDE_FLOATS;            // 错:同上
  buf[off + 0] = cx * this._dpr;                      // 写入"ch 号槽位"的 pos
  buf[off + 1] = cy * this._dpr;
  ...
}
```

**为什么是 fake 实现**: `ch` 取值范围 0..charset.length-1(典型 24-64 个)。`drawChar` 被 `drawInner()`([draw-helpers.ts:50](src/engine/draw-helpers.ts#L50)) 在 rAF 内**对每个 cell 调一次**,grid 通常 thousands ~ millions。

- 假设 1080p+fontSize 8 = 32K cells × 24 charset:
  - canvas2d:32K 次 `fillText`,屏幕上 32K 个字符
  - webgl/webgpu:32K 次 drawChar,但只写到 24 个 instance buffer 槽位(0..23)。**剩下 32K-24 个 cell 互相覆盖**,只有"每个 charset index 最后被调到的那次"的 (cx,cy) 留下来
  - `drawArraysInstanced(TRIANGLE_STRIP, 0, 4, instanceCount=32K)` 调用 GPU 跑 32K 实例,但 32K-24 个实例的 instance data 是初始化 0(alpha=0),全是透明
  - **用户在 Playground 选 webgl 时,屏幕上最多见到 24 个字符**(还不一定连续)

**测试为何没抓到**: `test/renderer-webgl.mjs` `test/renderer-webgpu.mjs` 用 MockCanvas,根本没真渲染。`scripts/bench-renderer.mjs` 只读 fps,不读像素 — 一个画 24 字符的 renderer 也能跑 60 fps 还更快。

**修复**: drawChar 需要接收一个 cell index 参数(或 `cx,cy` 映射到 cell index),webgl/webgpu 用 cell index 做槽位偏移。建议:

```ts
// 方案 A:接口加 cellIdx 参数
drawChar(cellIdx: number, ch: number, cx: number, cy: number, ...): void
// canvas2d 忽略 cellIdx,webgl/webgpu 用 cellIdx 作 offset

// 方案 B:webgl/webgpu 用内部计数器
private _drawCallIdx = 0;  // 每帧 reset 为 0
drawChar(ch, cx, cy, ...) {
  const off = this._drawCallIdx++ * INSTANCE_STRIDE_FLOATS;
  ...
}
// render() 前 reset _drawCallIdx,render 后 set this._instanceCount = this._drawCallIdx
```

---

### P0-2 + P0-3 + P0-4: WebGPU compute pass 是空跑 + 创建期就崩

**P0-2** ([src/renderer/webgpu-renderer.ts:228-234](src/renderer/webgpu-renderer.ts#L228)):
```ts
// 4. Compute pass (warmth 并行计算)
const computePass = encoder.beginComputePass();
computePass.setPipeline(this._computePipeline!);
computePass.setBindGroup(0, this._warmthBindGroup!);
const workgroupCount = Math.ceil(this._instanceCount / 64);
computePass.dispatchWorkgroups(workgroupCount);
computePass.end();
```

Compute shader 写 `cells[idx].warmth = ...`,但 render pipeline 的 bind group:
```ts
// _createBindGroups - 第 454 行
this._renderBindGroup = device.createBindGroup({
  entries: [
    { binding: 0, resource: { buffer: this._vertexUniformsBuffer } },  // viewport+cellSize
    { binding: 1, resource: this._atlasTex.createView() ... },          // atlas texture
    { binding: 2, resource: this._sampler },                            // sampler
  ],
});
```

**`_cellsBuffer` 不在 render bind group 里**,vertex/fragment shader 也没声明任何 storage binding。Compute pass 的输出永远没人读 — **整个 compute pass 是装饰**。

**P0-3** ([src/renderer/webgpu-renderer.ts:566](src/renderer/webgpu-renderer.ts#L566)): `_cellsBuffer` `createBuffer({ size: count * 32, usage: STORAGE | COPY_DST })`,但代码里**搜不到任何 `_cellsBuffer` 的 writeBuffer/copyBufferToBuffer 调用**。Compute shader 第一次跑就读 undefined 内存。

**P0-4** ([src/renderer/webgpu-renderer.ts:393-401](src/renderer/webgpu-renderer.ts#L393)):
```ts
// _createBindGroupLayouts - Compute binding 0
{ binding: 0, visibility: COMPUTE, buffer: { type: 'read-only-storage' } },
```

但 [webgpu-shaders.ts:47](src/renderer/webgpu-shaders.ts#L47):
```wgsl
@group(0) @binding(0) var<storage, read_write> cells: array<Cell>;
```

WebGPU 规范:`read-only-storage` layout 不接受 `read_write` shader binding。`createComputePipeline()` 必然抛 ValidationError。**真 Chrome 跑 WebGPU 路径,init() 第 191 行 `_createPipelines` 直接崩**,然后 auto-pick 降级到 webgl(但 webgl 也踩 P0-1,等于看不到东西)。

**Node 测试为何没抓到**: Node 没 navigator.gpu,init() 在第 130 行就 return error,从没走到 `_createPipelines`。所以 `npm test` 6/6 全过 — 但全是 "WebGPU not supported,init 静默 fail" 的契约测试,完全没测真 GPU 路径。

**修复**:
1. `_createBindGroupLayouts` Compute binding 0 改 `{ type: 'storage' }`(可读写)
2. render bind group 加 cells storage binding,fragment shader 用 `cells[instance_id].warmth` 调色
3. init() 后给 `_cellsBuffer` 写一次初始数据(全 0 即可,或者把当前 state.b 序列化进去)

---

### P0-5: `buildGrid()` 后,webgl/webgpu instance buffer 大小不变

**位置**: [src/engine.ts:217-274](src/engine.ts#L217) `buildGrid()` 重算 `state.r * state.i`,只调 `renderer.resize(w,h,dpr)`(设 viewport),**没调 `resizeGrid(cols, rows)`**。

**证据**: 
```sh
$ grep -rn "resizeGrid" src/
src/renderer/webgl-renderer.ts:393:  public resizeGrid(cols: number, rows: number): void {
src/renderer/webgpu-renderer.ts:635:  public resizeGrid(cols: number, rows: number): void {
# 只有定义,没有调用方
```

[webgl-renderer.ts](src/renderer/webgl-renderer.ts):
- `init()` 第 215 行 `_allocateInstanceBuffer(gl, state.r, state.i)` 一次性按 init 时的 grid 分配
- 之后 buildGrid 改 state.r/state.i 不会反映到 buffer 大小

**用户场景**:
- 启动时窗口 1920×1080 fontSize 14 → grid 137×77 = 10K cells → instance buffer 480 KB
- 用户 resize 窗口到 4K(3840×2160)→ buildGrid 算出 274×154 = 42K cells → 但 buffer 还是 480 KB(只够装 10K)
- drawChar 写到 cell 10K..42K 时,**写出 buffer 边界**(Float32Array 静默截断,不会抛)

不过因为 P0-1 已经让 webgl/webgpu 看不到东西了,P0-5 是次生问题。

**修复**: `buildGrid()` 末尾调 `if ('resizeGrid' in state.renderer) state.renderer.resizeGrid(state.r, state.i)`。

---

### P0-6: WebGPU 硬编码光源参数

**位置**: [src/renderer/webgpu-renderer.ts:586-617](src/renderer/webgpu-renderer.ts#L586):
```ts
const driftSpeedX = 0.15;      // 硬编码
const driftSpeedY = 0.1;       // 硬编码
const lightCenterX = 0.5;      // 硬编码
const lightCenterY = 0.5;      // 硬编码
```

但 [src/engine/state.ts:435](src/engine/state.ts#L435) 定义:
```ts
lightCenter: { x: number; y: number };   // 默认 { x: 0.7, y: 0.3 }
driftSpeed: { x: number; y: number };    // 默认 { x: 0.008, y: 0.006 }
```

用户传 `lightCenter: { x: 0.2, y: 0.8 }` → canvas2d 路径生效,WebGPU 路径完全无视。

**修复**:
```ts
const data = new Float32Array([
  cfg.lightCenter.x,
  cfg.lightCenter.y,
  cfg.driftSpeed.x,
  cfg.driftSpeed.y,
  ...
]);
```

---

### P1-1: variant 软更新永远传空对象

**位置**: [site/src/composables/useMatrixRain.ts:196](site/src/composables/useMatrixRain.ts#L196):
```ts
if (o.variant) inst.setVariantParams({});
```

`setVariantParams({})` 只更新"覆盖参数",不切 variant 本身。要切 variant 必须走 mount/重建(`o.variant` 没在 renderKey 里),所以**用户在 Playground 选 ripple → 看到的还是 classic**。

**修复**: 把 `o.variant` 也加进 renderKey,或者暴露 setVariant API。

---

### P1-2: 11+ 设置入 watch 但 apply 不处理

**位置**: [site/src/composables/useMatrixRain.ts:154-180](site/src/composables/useMatrixRain.ts#L154) effectKey:
```ts
return [
  o.theme, o.fontSize, o.charset, o.coldPalette, o.warmPalette, o.themeParams,
  o.variant, o.variantParams, o.targetFPS, o.trailAlpha, o.maxDPR,
  o.sparkProbability, o.hueRotateSpeed, o.renderScale, o.clickBurst,
  o.flickerRates, o.flickerSpeed, o.warmthRadius, o.warmthLerp,
  o.lightCenter, o.driftSpeed,
];
```

apply 分支(184-202)只处理 `theme / fontSize / coldPalette&&warmPalette / themeParams / variant / targetFPS / renderScale / flickerSpeed` 8 项。剩下:
- `trailAlpha` `maxDPR` `sparkProbability` `hueRotateSpeed` `clickBurst` `flickerRates` `warmthRadius` `warmthLerp` `lightCenter` `driftSpeed` `variantParams` `charset` **全部不处理**

Watch fire → 进 try → 跳过 → 完事。用户改这些参数:**watch 触发了** + **CPU 算了一遍 effectKey** + **GUI 显示新值** + **实际 matrix 完全没变**。

**修复**: 要么补齐 setter 调用(setLightCenter / setDriftSpeed / setWarmthRadius 等已经在 engine/setters.ts 存在),要么从 effectKey 移除。

---

### P1-3: charset 软更新写死 skip

**位置**: [site/src/composables/useMatrixRain.ts:193](site/src/composables/useMatrixRain.ts#L193):
```ts
if (o.charset !== undefined) /* charset 需 _reload(): setCharsetFunc 暂未暴露,skip */ void 0;
```

注释承认这是 todo,但 effectKey 还在监听 `o.charset` — 每次用户改 charset:watch 触发 + apply skip + 渲染不变。**charset 应该走 renderKey 硬重建**(就像 renderer 一样),否则永远 fake。

**修复**: 把 `o.charset` 从 effectKey 移到 renderKey。

---

### P1-4: bench-renderer 只测 fps 不测正确性

**位置**: [scripts/bench-renderer.mjs:88-95](scripts/bench-renderer.mjs#L88):
```js
for (let i = 0; i < dur; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const fps = rain.getFPS ? rain.getFPS() : 0;
  samples.push(fps);
}
```

只读 `getFPS()` —— 它来自 engine 的帧率计数,跟"是否真画对"无关。一个**只画 24 字符的 webgl renderer 跑 fps 反而更高**(GPU 闲死)。这就是 task.md 里 "✅ webgl 1440p fs4 = 29.8 fps avg" 的真相 — 那个数字证明的不是 webgl 渲染对,而是 webgl 渲染**几乎什么都没画**。

**修复**: 
1. bench 加 pixel hash 校验:同样 seed 下 canvas2d 与 webgl 的 ImageData 应该高度相似(允许 alpha 误差)
2. 或者最简单:每 renderer 跑完截图,人眼看
3. 或者:对 instance buffer 写入次数计数,断言 ≥ cells 总数

---

### P2-1: Node 渲染器测试只测"不抛"

**位置**: [test/renderer-webgl.mjs](test/renderer-webgl.mjs) `test/renderer-webgpu.mjs` 用 `MockContext2D`,`getContext('webgl2')` 返回的还是 MockContext2D。所有 `gl.createBuffer / gl.compileShader` 调用都返回 undefined,WebGLRenderer init 在 atlas fetch 阶段就抛 "Failed to parse URL"。

测试断言"init throw 是 expected" — 这是契约测试,不是行为测试。"21/21 全过"成立,但**没有任何一个测试验证渲染像素**。

**修复**: 加 Playwright headed Chromium 测试,对 canvas 截屏后 hash 比对。

---

### P2-2: WebGPU setFontSize 忽略参数

**位置**: [src/renderer/webgpu-renderer.ts:305-309](src/renderer/webgpu-renderer.ts#L305):
```ts
setFontSize(_px: number): void {
  if (this._device) {
    this._cellSizePx = 32 * this._dpr;   // 固定 32px,不用 _px
  }
}
```

WebGL 路径也一样([webgl-renderer.ts:307](src/renderer/webgl-renderer.ts#L307))。理论上 atlas 已经烘焙 32×32 cellSize,所以"忽略 _px"是 deliberate。但 quad 显示大小(`uniforms.cellSize`)固定 32 也意味着用户改 fontSize 后字符 quad 不缩放 —— 字符密度变了(grid 更密),但单个字符 quad 还是 32px,会重叠。

**修复**: `_cellSizePx = px * this._dpr` 让 vertex shader 按 fontSize 缩放 quad。

---

## 验证假设

我没有真机 Chrome WebGPU 跑,但 P0-4 是可静态推断的(WebGPU 规范明文):  
> "A bind group entry whose layout entry has `buffer.type: read-only-storage` may not be bound to a buffer in a pipeline that uses `var<storage, read_write>`."

P0-1 / P0-2 / P0-3 / P0-5 / P0-6 都是纯静态可证。

P1-1 / P1-2 / P1-3 是 site 代码直接读出,无需运行。

---

## 必须修复的最小集(可发布 0.4.1 的前置)

1. **P0-1**(必修):drawChar 接口加 cellIdx OR 用内部计数器。不修则 webgl/webgpu 100% 不可用。
2. **P0-4**(必修):BindGroupLayout `read-only-storage` → `storage`,否则 WebGPU 真机开机即崩。
3. **P0-5**(必修):buildGrid 末尾调 renderer.resizeGrid。
4. **P1-1**(必修):variant 入 renderKey 或加 setVariant API。

P0-2 / P0-3 / P0-6:WebGPU compute 改成"真有用"或者直接删 compute pass(P0-1 修完后,纯 render pipeline 也能 60 fps 跑 1M cells)。**建议先删 compute pass**,因为目前它是装饰且会出错。

---

## 现状结论

**0.4.0 的 WebGPU + WebGL renderer 都是"看起来跑通、实际不工作"的 fake 实现**:
- TypeScript 编译过、`npm test` 21/21 过、bench 跑出 fps 数字 —— 三层"绿色信号"互相佐证
- 但只要在真浏览器选 webgl/webgpu 看一眼,就能发现屏幕只画了几十个字符
- `task.md` 的 "✅ 全部完成" 是被这三层假绿色误导的产物

**唯一可用渲染器**:canvas2d(本身正确,因为它压根不走 instance buffer 路径)。

**用户影响**:
- 主包 0.4.0 发布到 npm 后,任何用户传 `renderer: 'webgl'` 或 `'webgpu'` 都会看到空白/错乱画面
- auto 模式 cells ≥ 100K → 选 webgl → 同样空白
- 实际 0.4.0 等价于 canvas2d-only,但宣传"多渲染器架构"

**建议**:
1. **不要发布 0.4.0 到 npm**,先修 P0-1 + P0-4 + P0-5 + P1-1
2. 加 Playwright headed 像素 hash 测试,把这次的 fake 兜底
3. 把现状写进 CHANGELOG 的 "Known limitations" — 不能让用户踩

---

## 修复进度(0.5.0 · 2026-06-11 — 全部 13 项修复)

| ID | 状态 | 修复 commit | 备注 |
|---|---|---|---|
| **P0-1** drawChar 用 ch 当 cell index | ✅ 已修 | [a32ecf2](../) | 渲染器加 `_drawCallIdx` 计数器, beginFrame 重置 |
| **P0-2** WebGPU compute 输出无人读 | ✅ 已修 | [a32ecf2](../) | 删 compute pass 整套(P0-2/3/4/6 同步) |
| **P0-3** WebGPU cellsBuffer 未写入 | ✅ 已修 | [a32ecf2](../) | 同上(删除) |
| **P0-4** WebGPU BindGroupLayout 不匹配 | ✅ 已修 | [a32ecf2](../) | 同上(删除) |
| **P0-5** buildGrid 后 instance buffer 不 resize | ✅ 已修 | [f7e0287](../) | 接口加 resizeGrid?, buildGrid 末尾调通 |
| **P0-6** WebGPU 硬编码光源 | ✅ 已修 | [a32ecf2](../) | 同 P0-2(删除整个 warmthParams) |
| **P0-7** (plan 阶段新发现) render() 从未被调 | ✅ 已修 | [f7e0287](../) | engine.draw() 末尾调 renderer.render() |
| **P1-1** site variant 切不动 | ✅ 已修 | [4080e8d](../) | variant 移到 renderKey 走硬重建 |
| **P1-2** site effectKey 11+ 字段空跳过 | ✅ 已修 | [4080e8d](../) | 移到 renderKey 走硬重建 |
| **P1-3** site charset 写死 skip | ✅ 已修 | [4080e8d](../) | 移到 renderKey 走硬重建 |
| **P1-4** bench 只读 fps 不验像素 | ✅ 已修 | [d6425d0](../) | 加 djb2 hash + nonZeroRatio gate(< 5% 退出码 2) |
| **P2-1** Node 测试只验"不抛" | ✅ 已修 | [1790b6f](../) + [HEAD](../) | `test/renderer-pixel.mjs` + Playwright Chromium 像素对比;webgl/webgpu 现需 ≥95% 匹配 canvas2d 才能 merge |
| **P2-2** setFontSize 忽略 px | ✅ 已修 | [a32ecf2](../) | `_cellSizePx = px * dpr` |
| **P2-3** drawTrail _w/_h 参数 | ✅ 已修 | [0def2f4](../) | 签名清理为 4 参,canvas2d 内部从 `resize()` 缓存取 w/h |

### 附带发现的次生 bug(0.4.1 一并修了)

- **async-init 竞态**:`void renderer.init().catch(...)` 不 await,WebGL/WebGPU init 跑完前 rAF 已调 render/drawChar 读到 null shader uniforms 崩。修法:加 `_initialized` 标志守卫。
- **WebGL `preserveDrawingBuffer`**:Chromium 默认 false,headless bench 读不到上一帧像素。修法:`getContext('webgl2', { preserveDrawingBuffer: true })`。
- **bench `matrixRain(canvas, options)` 调用签名错**:正确是 `matrixRain({ canvas, ...options })`。0.4.0 bench 之所以拿到 fps 完全是因为引擎自创了 detached canvas,用户的 canvas 从未被画。
- **bench 页面 baseURL = about:blank**:相对 URL `/atlas/...` 无法 fetch。修法:`page.goto('http://bench-host/')` + `page.route` fulfill。

### 端到端验证(0.4.1)

```
npm run type-check          # 0 错
cd site && npm run type-check  # 0 错
npm test                    # 21/21 全部通过
npm run build               # 全 entry success
npm run bench:renderer      # 4 场景 nonZeroRatio = 100% (真渲染)
```
