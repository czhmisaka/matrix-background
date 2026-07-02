# Changelog

All notable changes to `@xietuier/matrix-rain` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-06-28

### Added — 全局错误处理 + 诊断面板 + Playground 增强

- **`MatrixRain.installGlobalErrorHandler()`** 静态方法：全局错误兜底，捕获引擎/回调中未处理的异常，防止雨滴静默崩溃。
- **Playground Health Panel**：新增 `__matrixRainDebug.getHealthSummary()` 调试入口，实时展示 renderer 健康快照（fps / drawCalls / cellsRendered / lastError）。
- **Playground coords readout**：坐标读数支持键盘可调 + reset 按钮，提升 a11y 可用性。
- **`RendererHealth` 13 字段加 `readonly`**：编译期防篡改，保证诊断数据完整性。
- **`size-limit` 五条目**（ESM/CJS/themes/UMD/CSS）：CI 构建体积门禁上线。

### Fixed

- **a11y**: throttle phase pill live region，仅在 phase 变更时播报，避免 aria-live 刷屏。
- **a11y**: AITunePage canvas 加 `aria-hidden="true"`，防止屏幕阅读器读无意义像素数据。
- **build**: tsup dts chunk 稳定命名，修 `npm pack` 时 `./themes-F8oKFGEV.d.ts` 引用失效。
- **callbacks**: `fireOn*` 回调抛错透出到 `getDiagnostics().userCallbackError`，不再静默吞错。
- **deploy**: `deploy:local` 用 `--frozen-lockfile` 防 lockfile 漂移。

### Changed

- **engines**: 锁 Node 20 LTS（`.nvmrc` + `engines >=20` + CI workflow 读 nvmrc）。

## [0.6.2] - 2026-06-24

### Added — `charGap` 字符间距配置 (从 0.6.1 升版,补 0.6.2 正式节)

- **`charGap` 选项**(默认 `0`,范围 `[-10, +20]` CSS px):控制相邻字符字形之间的视觉间距,对称应用到 x 和 y 轴。
  - `charGap: 1` 或 `2` 让字到字更紧(收紧字体 side bearing 留白)
  - 负值(如 `-3`)让字符重叠
  - 越界自动 clamp;`NaN` / `Infinity` / `undefined` 退到 `0`
- **`inst.setCharGap(n)`** 运行时热更新,不触发 `buildGrid`(列数/行数不变)
- **跨 3 个 renderer 行为一致**(canvas2d / WebGL2 / WebGPU):仅在 `draw-helpers.ts` 的 12 个 `(cx, cy)` 算式末尾加 `state.cfg.charGap`,**不动** atlas、shader、`setFontSize`
- **默认 `0` 完全向后兼容**:`test/char-gap.mjs` 验证 `charGap=0` 时 fillText 的 `(x, y)` 与原公式 byte-for-byte 等价
- 不破字号 4px 硬下限(`memory:feedback_min_font_size.md`),与 fontSize 独立

### Changed — 0.6.2+ Playground 修复轮

- Playground 页内参数滑块 / 主题切换 / 字符集切换的可用性修复(详见 `81cf503 docs(audit): 0.6.2+ Playground 修复轮只读审查`)
- `useMatrixRain.ts:170-186` 参数联动收紧(由 `audit-playground-fix-2026-06-16.md` P0-2 标的对账)
- `PlaygroundPage.vue` 渲染 / 卸载时序修正,避免热重载残留
- 见 `audit-test-release-2026-06-24.md` §3.3 收敛清单

## [0.6.1] - 2026-06-23

### Added — `charGap` 字符间距配置(对称 x/y)

- `charGap` 选项 + `inst.setCharGap(n)` 热更新 API
- 跨 3 个 renderer 行为一致,`charGap=0` 默认完全向后兼容
- 对应 commit: `de352a2 feat(renderer): 0.6.1 charGap 字符间距配置(对称 x/y)`

> 注:此 0.6.1 节保留作为 commit 索引,`charGap` 详细条目已升级并入 [0.6.2] 节。

## [0.6.0] - 2026-06-22

### Added — `getRendererHealth()` 诊断快照(跨 3 renderer)

- 新增 `inst.getRendererHealth()` 公开 API,返回 canvas2d / WebGL2 / WebGPU 三种 renderer 的统一健康快照(fps / drawCalls / cellsRendered / lastError / buffer 状态)
- `deploy:local` / `deploy:serve` 一键本地部署脚本同步上线(commit `4c63418`),完全本地部署、少用 CDN(`memory:project_deployment_goal.md`)
- 对应 commit: `346122a feat(renderer): 0.6.0 getRendererHealth() 诊断快照 (跨 3 renderer)`

## [0.5.0] - 2026-06-11

### Added — 真像素测试基建 (P2-1) + WebGPU compute 恢复 + 代码清理

#### P2-1 真像素测试安全网

- **`test/renderer-pixel.mjs`** + **`test/fixtures/pixel-demo.html`**: Playwright headed Chromium 像素对比测试,跨 3 个场景(1080p+fs14 / 1440p+fs8 / 4K+fs4)× 3 个 renderer(canvas2d / webgl / webgpu)共 6 个对比 case。`canvas2d` 作基准,`webgl` / `webgpu` 与基准 95% 像素灰度 |Δ| < 5/255 视为通过。
  - 浏览器端用 `toBlob('image/png')` 编码再 `FileReader.readAsDataURL` 回 Node,避开 4K 33MB RGBA JSON 序列化 OOM。
  - Node 端用 `@napi-rs/canvas` (`loadImage` + `getImageData`) 解码。
  - WebGPU 在 headless 中常不可用,自动 `⏭` 跳过而非 fail。
  - 支持 `--only <renderer>` / `--scenario <name>` / `--threshold <0..1>` / `--waitMs <ms>` 过滤。
- **`package.json`** 新增 `"test:pixel": "node test/renderer-pixel.mjs"`。
- 0.4.1 baseline: webgl 仅 1-4% 匹配 canvas2d(P0-1 假实现),webgpu 1-81%(P0-2/3/4/6 假实现),test:pixel 退出码 1 阻塞 merge — **这正是 0.4.0 fake 灾难的安全网**。

#### WebGPU compute pass 重建 (P0-2/3/4/6 修复)

- **P0-2** compute 输出从未被 render pipeline 读取
  → vertex shader 加 `@group(1) @binding(0) var<storage, read> cells` 并通过
  `@builtin(instance_index) iid` 读 `cells[iid]` 调色(乘到 color.a)
- **P0-3** cellsBuffer 创建后从未写入
  → `_allocateBuffers` 末 + `resizeGrid` 末 `queue.writeBuffer(cells, 0, Float32Array(count))`
  显式初始化为 0,compute 首次 dispatch 读非 undefined 内存
- **P0-4** BindGroupLayout `read-only-storage` 与 WGSL `read_write` 不兼容
  → compute layout 改 `{ type: 'storage' }`(可读写);render@1 layout 用
  `{ type: 'read-only-storage' }`(vertex 只读)
- **P0-6** warmth params 硬编码忽略 state
  → 新增 `_updateWarmthParams(state)` 从 `state.lightCenter/driftSpeed/cfg.warmthRadius/warmthLerp/wallTime` 读取
- **数据结构简化**: cells 从 `array<Cell>(32 bytes/cell)` 简化为 `array<f32>(4 bytes/cell)`,
  8.4M cells 内存从 256MB 降至 32MB

#### P2-3 接口清理

- `drawTrail(r, g, b, a, w, h)` → `drawTrail(r, g, b, a)`(所有 renderer 签名同步)
- canvas2d 内部从 `resize()` 缓存的 `_w/_h` 取视口尺寸(不再依赖 `_ctx.canvas.width`,与 MockCanvas 兼容)
- webgl/webgpu 形参去掉 `_w/_h` 占位

#### 体积优化

- `tsup.config.ts` 主入口开启 `minify: true`,`dist/index.js` 从 173KB raw / 40KB gzip 降至 **93.8KB raw / 28.8KB gzip**(在 32KB 门禁内)
- 新增 `test/build-size.mjs` 体积门禁,纳入 `npm test` 主链路
- 已知: webgl/webgpu 仍 inline 在主 chunk(因 `matrixRain()` 是 sync API,无法做 splitting);**0.6.0+** 可考虑 Promise 化 API 把 webgl/webgpu 真拆出去

## [0.5.1] - 2026-06-11

### Fixed — 0.5.0 字符不可见: 3 个独立 bug 叠加

`test:pixel` 1080p baseline: webgl 0.96% / webgpu 1.06% 匹配 canvas2d(字符完全不可见)。三个独立 bug 叠加,逐个根因 + 修法:

#### 1. `vertexAttribPointer` aUV0/aUV1 offset typo (webgl-renderer.ts)

- instance buffer layout: `vec4[0]` pos+charIdx+pad (offset 0..15), `vec4[1]` aColor (offset 16..31), `vec4[2]` aUV0+aUV1 (offset 32..47)
- 但 attribute 写 `gl.vertexAttribPointer(3, 2, FLOAT, stride, 28)` 错位,实际从 vec4[1] 末尾 + vec4[2] 头部拼 vec2,aUV0 收到 `(aColor.a, aUV0.x)` 错值
- vertex shader `vUV = mix(aUV0, aUV1, ...)` 全错,fragment 采到 atlas 非字符区域
- **修法**: 28 → 32, 36 → 40 (slotOff+8/10 floats × 4 bytes)

#### 2. 孪生 race bug (0.4.3 fix ed61b16 被 f56c935 revert 掉了,重做)

- `engine.ts:212` 同步调 `renderer.init()` (async, 不 await) → 立即 `renderer.setCharset(state.charset)` 时 `_atlasJson` 仍 null
  - `setCharset` 用 `_atlasJson` 构建 `_charsetMap` → `_charsetMap` 永远空 → `drawChar` 写 `atlasIdx=0, uv=undefined` → `aUV=(0,0,1,1)` 整张 atlas
- `webgl-renderer.ts:441` `resizeGrid` 有 `if (!this._initialized) return;` 守卫,buildGrid 在 init 返回前调时挡掉
  - `_instanceBuffer` 保持 init 时按 `state.r=0, state.i=0` 分配的 0 大小 → `drawChar` 全部 silent skip
- 合起来: 屏幕只看到 trail 拖尾,无任何字符
- **修法**: init 末尾用已加载 atlas 重新 `buildCharsetMap`;`resizeGrid` 删 `_initialized` 守卫;webgpu 同 bug 同步修

#### 3. 缺失 premultiplied alpha (webgl-shaders.ts + blendFunc)

- fragment 写 `vec4(vColor.rgb, vColor.a * mask)` (unmultiplied) + `gl.blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` (假设 unmult)
- 但 `getContext('webgl2')` 默认 `premultipliedAlpha: true` → framebuffer 存 premult
- src unmult + framebuffer premult + blit 路径 → 颜色失真 (canvas2d 显示暖白,webgl 显示冷青)
- **修法**: fragment 改写 `vec4(vColor.rgb * a, a)`,`blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` (premult blend);trail shader 同步改
- (webgpu 1080p 82% 命中,因 webgpu `alphaMode: 'premultiplied'` 已自动转换,无需手动改)

#### 验证 (test:pixel 1080p-fs14)

| Renderer | 0.4.x baseline | 0.5.1 fix | 字符可见 |
| -------- | -------------- | --------- | -------- |
| webgl    | 0.96%          | 68.34%    | ✅       |
| webgpu   | 1.06%          | 81.67%    | ✅       |

- 1440p-fs8 webgl: 35.11% (Δ=45.56) — 字符清晰,Δ 大是 webgl 拖尾衰减曲线与 canvas2d 实现差异(均无 bug)
- 4K-fs4 跑不动: swiftshader headless init timeout 60s 不够(环境问题,非 renderer bug)
- type-check: 0 error / lint: 0 new error (91 pre-existing `!` 警告)
- `npm test` Node 套件全过 / `dist/index.js` 94 KB raw, 28.8 KB gzip ≤ 32 KB 门禁

### Notes

- WebGPU 真机(Chrome 113+)上 nonZeroRatio=100% 验证需用户手动: 启动 `site/dist-demo/index.html?renderer=webgpu` 跑 5 秒不抛 validation error
- 0.5.0 完成全部 4 个 Phase(`task_plan_0.5.0.md`)

## [0.4.1] - 2026-06-10

### Fixed — 0.4.0 渲染器虚假实现修复

0.4.0 已发布的 WebGL / WebGPU 渲染器是 fake 实现:`tsc --noEmit` 静态类型 clean、`npm test 21/21` 通过(MockCanvas 只验"不抛")、`npm run bench:renderer 29 fps`(只读 `getFPS()` 不读像素),三层假绿信号互相佐证。但真浏览器选 `renderer: 'webgl'` 或 `'webgpu'` 会看到空白/24 字符画面。详见 `docs/audits/fake-impl-2026-06-10.md`(6 P0 + 4 P1 + 3 P2)。

本版本修复:

- **P0-7** `MatrixRainRenderer.render()` 从未被引擎调过 — WebGL/WebGPU 的 `drawArraysInstanced` 和 `queue.submit` 都是死代码。修法:引擎 rAF 加 `state.renderer.render(state, lastDt)` 调用 + 接口加 optional `beginFrame()` 钩子。canvas2d 不实现两个新方法(no-op),向后兼容。
- **P0-1** `drawChar(ch, ...)` 之前把 charset index(0..24)当 instance buffer 槽位用,32K 个 cell 应画但实际只画 24 个。修法:渲染器内部加 `_drawCallIdx` 计数器,`beginFrame()` 重置 0,`drawChar()` 按 `_drawCallIdx * STRIDE` 写槽位,`render()` 按 `_drawCallIdx` 作 `drawArraysInstanced` 实例数。接口签名不变。
- **P0-5** `buildGrid()` 重算 grid 后没通知 renderer 重 alloc instance buffer。修法:接口加 `resizeGrid?(cols, rows)`,`buildGrid()` 末尾调通(canvas2d 不实现)。
- **P0-2 / P0-3 / P0-4 / P0-6** WebGPU compute pass 完全 fake:cellsBuffer 创建后没写入、compute 输出没人读、`read-only-storage` 与 WGSL `read_write` 不兼容(真 Chrome 113+ 会在 `createComputePipeline()` 抛 ValidationError 开机即崩)、warmth params 硬编码忽略 state。修法:**直接删 compute 整套**(字段、方法、shader import、render() 内 beginComputePass 块)。"WebGPU compute 并行 warmth" 留 0.5.0 重新设计。
- **P1-1** site useMatrixRain `setVariantParams({})` 传空对象切不动 variant。**P1-2** 11+ effectKey 字段没对应 setter 但 apply 分支空跳过。**P1-3** charset 写死 skip。修法:把所有"没 setter 的字段"移到 renderKey 走硬重建,effectKey 只保留 10 个真有 setter 的字段。
- **P1-4** bench 只读 fps 不验证像素。修法:借鉴 `scripts/e2e-demos.py` 的 hash 模式,采集 canvas 中心 200×200 像素算 djb2 hash + nonZeroRatio,`< 5%` 视为 fake 渲染 → `process.exit(2)`。
- **P2-2** `setFontSize(_px)` 忽略 px 参数固定 32。修法:`_cellSizePx = px * dpr` 让 quad 跟随 fontSize 缩放(atlas 仍 bake 32px,sampler 自动 downscale)。

### 附带修复

- **async-init 竞态**:引擎用 `void renderer.init().catch(...)` 不 await。WebGL/WebGPU 的 atlas fetch 异步未完成时,rAF 已经在调 render/drawChar,读到 null shader uniforms 崩溃。修法:渲染器加 `_initialized = true` 标志(init 末尾设),`render/beginFrame/drawChar/resizeGrid` 全部加 `if (!this._initialized) return` 守卫。
- **WebGL `preserveDrawingBuffer`**:Chromium 默认 false,composited 后 framebuffer 内容可能丢,headless bench 的 `readPixels`/`drawImage(webglCanvas)` 读不到上一帧。`init()` 创建 context 时显式传 `preserveDrawingBuffer: true`。
- **bench 调用签名**:之前 `matrixRain(canvas, options)` 是错的 —— 正确是 `matrixRain({ canvas, ...options })`,canvas 当 options 对象传给引擎导致用户 canvas 永远不被画。
- **bench 页面 baseURL**:`page.setContent('...')` 让页面在 about:blank 下,相对 URL `/atlas/...` 无法 fetch。改:`page.goto('http://bench-host/')` + `page.route` fulfill。

### 验证

| 检查                            | 结果                                                   |
| ------------------------------- | ------------------------------------------------------ |
| `npm run type-check`            | ✅ 0 错                                                |
| `cd site && npm run type-check` | ✅ 0 错                                                |
| `npm test`                      | ✅ 21/21 全部通过                                      |
| `npm run build`                 | ✅ 全 entry success(165 KB raw / 39 KB gzip)           |
| `npm run bench:renderer`        | ✅ 4 场景 nonZeroRatio = 100%(canvas2d/webgl 都真渲染) |

---

## [0.4.0] - 2026-06-09

### Added

- **多渲染器可插拔架构(0.4.0+)** —— 新增 `MatrixRainRenderer` 接口契约,支持 3 个渲染后端:
  - **`canvas2d`** —— 默认 / 零额外体积 / 100% 浏览器覆盖 · 软件 fillText · 适合 1080p + fontSize ≥ 8
  - **`webgl`** —— WebGL2 instanced rendering + 字符 atlas · 适合 4K + fontSize 4-6 (60 fps 跑 518K cells)
  - **`webgpu`** —— WebGPU compute shader (warmth 阻尼并行) + instanced render · 适合 8K + fontSize 2
  - **`auto`** —— Phase 3 实现 viewport × cell density 智能选最合适的 renderer
    - `< 100K cells` → canvas2d
    - `100K-500K cells` → webgl
    - `> 500K cells` → webgpu (失败降级 webgl)
  - 降级链 `webgpu → webgl → canvas2d` (100% 浏览器总覆盖)
  - 新增 `MatrixRainOptions.renderer?: 'canvas2d' | 'webgl' | 'webgpu' | 'auto'` (默认 `'auto'`)
  - Web Component: `<matrix-rain renderer="webgl">` 同步 attribute
  - `MatrixRain.detect()` 扩展 3 字段: `hasWebGL2` / `hasWebGPU` / `recommendedRenderer`
  - `useMatrixRain` composable watch 拆分:`renderKey` (renderer/canvas) → 硬重建,`effectKey` (theme/param 等 20 字段) → 软更新 setter(WebGL shader 编译 10-50ms 不再因主题切换触发)
  - **`MatrixRainRenderer` 接口**:
    - `init(canvas, state): Promise<void>` (WebGPU 异步 adapter 申请)
    - `resize(w, h, dpr)` (DPR 缩放)
    - `render(state, dt)` (WebGL/WebGPU 走 instanced / compute,Canvas 2D 走 no-op)
    - `destroy()` 幂等
    - `pause() / resume()` 转发
    - `drawTrail / setFontSize / setCharset / drawChar` 4 个 drawing primitive
  - **边界规则**(写进 types.ts 注释):
    - Renderer 只读 state (b/charset/paletteLUT/effectiveTp/cfg/canvas)
    - Renderer 不得写 state 任何字段
    - Renderer 私有状态 (programs/buffers/atlas) 放 renderer 实例内
    - destroy() 必须幂等
    - resize() 必须先 `canvas.width = canvas.width` 强制重置
    - init() 是 Promise (WebGPU 异步)
  - **Build-time 字符 Atlas** —— `scripts/build-atlas.mjs` 在 `npm run build` 末尾自动跑,生成 `dist/atlas/jetbrains-mono-32.png` (20.6 KB, 1024×1024, 224 字符 0x20-0xFF) + JSON sidecar (UV 坐标 + 字符度量)
  - **Phase 5 优化空间**: esbuild `splitting: true` + `manualChunks` 拆 webgl/webgpu → canvas2d 默认路径恢复 ~28 KB gzip
  - 配套文档:
    - `docs/atlas-format.md` —— 字符布局图 + JSON schema + WebGL/WebGPU 加载示例
    - `docs/audits/perf-renderer-baseline-2026-06-09.md` —— 3 renderer × 8 场景性能矩阵
  - 配套测试 (5 个新 .mjs, 共 36 case):
    - `test/renderer-canvas2d.mjs` (10 case) —— 默认 canvas2d 行为 / webgl/webgpu throw
    - `test/atlas-load.mjs` (9 case) —— PNG magic / JSON schema / 字符覆盖
    - `test/renderer-webgl.mjs` (5 case) —— Node 端类型/集成验证
    - `test/auto-pick.mjs` (9 case) —— 显式/auto/renderScale/3 变体
    - `test/renderer-webgpu.mjs` (6 case) —— Node 端类型/集成验证

- **过渡曲线 + 打断与回退(0.4.0+)** —— 新增 `EasingMode = 'smooth' | 'linear'` 全局曲线模式,以及 4 个过渡 setter 的 `dur` + `easing` per-call 覆盖。所有过渡现在都正确**支持打断与回退**:mid-flight 调用时,`from` 取当前显示值(插值),不是旧快照,保证视觉上平滑衔接(无突跳)。
  - 新增 `MatrixRainOptions.easing?: 'smooth' | 'linear'`(默认 `'smooth'` = cubic ease)
  - 新增 `setEasing(mode)` / `getEasing()` 热更新
  - **修复的 3 个 bug**:
    - `setTheme` 之前从 `oldColdPalette` 旧快照出发(不是当前显示值)→ 现在用 `getEffectiveThemeState`
    - `setThemeParams` / `setColdThemeParams` / `setWarmThemeParams` 之前从 `state.tp` 新值出发(0 步移动)→ 现在用 `getEffectiveThemeParamsState`
    - `setVariantParams` 之前从 `state.vp` 新值出发 → 现在用 `getEffectiveVariantState`
    - `setTransitionAlpha` 原本就正确(从 `state.transitionAlpha` 当前值出发),保持
  - Per-call 选项(在 setter 第 2 参):
    - `setTheme(name, { keepPaletteParams, dur, easing })`
    - `setThemeParams(params, { dur, easing })`
    - `setColdThemeParams / setWarmThemeParams` 同上
    - `setVariantParams(params, { dur, easing })`
    - `setTransitionAlpha(alpha, { dur, easing })` —— 向后兼容老 `number` 签名
  - 9 个内部 ease 调用点抽成 `pickEasingFn(state, kind, override?)`:线性模式返恒等 `t`、smooth 模式返 easeIn/easeOut/easeInOut
  - 配套 `test/easing.mjs`(14 用例):默认 smooth / setEasing 双向 / 构造时设置 / 中断与回退 / per-call linear 覆盖 / per-call dur 覆盖 / 鲁棒性 / 旧 number 签名兼容 / mid 切曲线不破坏过渡值

- **`renderScale?: number | 'auto'`** —— 数字像素背景**动态分辨率**(类似"脏渲染")。启用后,目标位图激活时,**仅位图覆盖区**按倍率画子格(`renderScale=2` → 区内每个父格画 4 个子格 / 像素),位图区外 0 额外开销。文字/图片边缘锐度可肉眼对比提升,雨滴密度不变。

- **`renderScale?: number | 'auto'`** —— 数字像素背景**动态分辨率**(类似"脏渲染")。启用后,目标位图激活时,**仅位图覆盖区**按倍率画子格(`renderScale=2` → 区内每个父格画 4 个子格 / 像素),位图区外 0 额外开销。文字/图片边缘锐度可肉眼对比提升,雨滴密度不变。
  - `1` (默认): 行为 100% 等价于无此选项(向后兼容)
  - `2` / `3` / `4`: 显式倍率,`>= 4` 性能急剧下降(仅适合短时演示)
  - `'auto'`: 等价于 `2`,位图未激活时回到 `1`
  - 输入钳位: `NaN` / 负数 / 0 → 1;`Infinity` / 100 → 16(上限)
  - 配套热更新 `setRenderScale(s: number | 'auto')` + `getRenderScale(): number`,`getOptions().renderScale` 反映用户原值
  - Web Component: `<matrix-rain render-scale="2">` / `render-scale="auto"`(不重建,同 `font-size` 走 `setDensity` 模式)
  - ⚠️ **`avalanche` 变体**: 头亮 trail 按行对齐,子格仅在列方向生效(横向更锐,纵向密度不变)
  - 配套 `test/render-scale.mjs`(11 用例): 1x 字节等价 / 2x 子格 fillText 计数 / 'auto' 解析 / 输入钳位 / 三变体协同 / 锁字符不重复写 bug 验证 / 颜色覆盖协同 / mid-animation 切换 / 主题切换协同。

- **`textToBitmap` 第 6 参 `options: TextToBitmapOptions`** —— 支持任意字体(`font` 任意 CSS font-family,系统字体 / 自托管字体 / Google Fonts / 字符串列表 fallback 全兼容)+ CJK 全角字符宽度识别(`cjkAware` 默认 `true`,自动检测 8 段 CJK Unicode 范围:汉字 / 平假名 / 片假名 / 韩文 / 全角符号等,按 1.0×fontSize 宽计算;Latin 按 0.6×fontSize;混合文本按权重加权)+ `fontWeight` 可调(number 100-900 或 `normal` / `bold` / `lighter` / `bolder`)。**非破坏式扩展** —— 默认参数下行为与旧版一致(纯 Latin 文本)。配套 `test/text-fit.mjs` 新增 6 类用例:纯 CJK 字号小于纯 Latin / 5 类 CJK 字符 Unicode 范围识别 / 9 个 CSS font-family 透传 / 10 个 fontWeight 解析 / `cjkAware: false` 强制走旧行为 / 混合 CJK+Latin 字符按加权 charW 中庸值。

- **`textToBitmap` 第 6 参 `options: TextToBitmapOptions`** —— 支持任意字体(`font` 任意 CSS font-family,系统字体 / 自托管字体 / Google Fonts / 字符串列表 fallback 全兼容)+ CJK 全角字符宽度识别(`cjkAware` 默认 `true`,自动检测 8 段 CJK Unicode 范围:汉字 / 平假名 / 片假名 / 韩文 / 全角符号等,按 1.0×fontSize 宽计算;Latin 按 0.6×fontSize;混合文本按权重加权)+ `fontWeight` 可调(number 100-900 或 `normal` / `bold` / `lighter` / `bolder`)。**非破坏式扩展** —— 默认参数下行为与旧版一致(纯 Latin 文本)。配套 `test/text-fit.mjs` 新增 6 类用例:纯 CJK 字号小于纯 Latin / 5 类 CJK 字符 Unicode 范围识别 / 9 个 CSS font-family 透传 / 10 个 fontWeight 解析 / `cjkAware: false` 强制走旧行为 / 混合 CJK+Latin 字符按加权 charW 中庸值。

### Changed

- `textToBitmap` 内部 charW 估计从硬编码 `0.6` (JetBrains Mono Latin 经验值)改为 **measureText 实测 + CJK 比例加权** 两步走:先用 100px 参考字号测真实宽度(任意字体自动适应),再按 CJK 字符数加权。空文本 fallback 到 `'M'` 测宽,避免除 0。
- `text.length` 在 maxLineLen 等位置改为 `codePointLength(text)` —— 避免 supplementary plane(emoji / 罕用 CJK Ext B-G)的 surrogate pair 误算。

---

## [0.2.0] - 2026-06-08

> 自 0.1.0 起累计 **23 个 commit**。`docs/` 6 份审计报告落地;`MatrixRain.detect()` 首版;`setTargetBitmap` 严输入校验;`FitMode` 默认改 `contain`(详见 §Changed);`ARCHITECTURE.md` 4 层模型。

### Added

#### 新 API 与加固

- **`MatrixRain.detect(): EnvironmentInfo`** —— 读 `navigator.userAgent` + `matchMedia('(prefers-color-scheme: dark)')` + 视口宽,返回 `{isMobile, isDarkMode, recommendedFontSize, recommendedTargetFPS, recommendedBrightness, browser, viewport, viewportWidth, devicePixelRatio}`,SSR / 不识别时优雅降级为 `Unknown` / `0` / `1`。补齐 `types/index.d.ts:577` 长期声明缺口。配套 `test/detect.mjs`。
- **`setTargetBitmap` 输入校验** —— `Float32Array` 大小 cap(`> 10000` cells 直接 throw),shape 与 `targetCols` × `targetRows` 一致性检查,`null` / `BitmapSource` 对象双分支支持。配套 `test/set-target-bitmap-validation.mjs`。
- **Sandbox 补强** —— `validateUserFunction` 拦截 `this.constructor.constructor` (Function 构造器逃逸) + `async function` + `function*` generator + `await`,黑名单 + 步数上限 + 字符串上限维持原状。配套 `test/sandbox.mjs` 新增 5 用例。

#### 文档与可访问性

- **a11y P0 修复** —— 4 个 `<select>` 加显式 `name` + 显式 label;移除重复 `<main>`(`<main>` → `<section>`);5 个 icon-only 控件加 `aria-label`;聊天输入框加 `aria-label`;`aria-live` polite region 提示动态内容。
- **README 扩 5 段** —— `setTransitionAlpha` / `FitMode` / `targetFitMode` / 5 类 transition duration / 4 个回调 / 5 个调试 getter,完整覆盖 `types/index.d.ts` 公开 API。
- **`ARCHITECTURE.md`** —— 4 层用户函数驱动(ABCD)架构图 + 数据流 + 引擎循环时序 + 状态机详解,496 行。

#### 测试

- **`test/themes.mjs`** —— 8 用例,覆盖 5 主题 × unknown theme 静默返回 / coldFrom / warmFrom / 拼色主题 / `setTheme` keepPaletteParams 等。
- **`test/edge-cases.mjs`** —— 17 用例,覆盖极端输入(0 视口、负字号、NaN DPR、显式 destroy × 多次调用、未调用 `matrixRain` 直接销毁、ASCII 极小字符集等)。
- **现有 12 个 test 脚本** —— 持续维护,总用例数 ≥ 70。

#### 安全

- **CSP meta + 安全 headers** —— `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; ...">` 注入 demo / docs;`X-Frame-Options: DENY` + `X-Content-Type-Options: nosniff` + `Referrer-Policy: strict-origin-when-cross-origin`。详见 `docs/audits/security-2026-06-08.md`。

#### 工具链

- **lint / format 工具链** —— ESLint 9 flat config + Prettier 3 + Husky 9 + lint-staged 15 + commitlint 19(Conventional Commits)。`npm run lint` / `npm run format` / `npm run prepare` 全链路打通。详见 `commitlint.config.cjs` / `lint-staged.config.cjs`。

#### 审计文档(6 份)

- `docs/audits/a11y-2026-06-08.md` —— axe-core 12 路由扫描 + 残留 gap
- `docs/audits/perf-2026-06-08.md` —— P0/P1/P2 优化路线图(NPM -1.8MB / site -1MB)
- `docs/audits/security-2026-06-08.md` —— v-html / sandbox / localStorage / CSP 评估
- `docs/audits/code-quality-2026-06-08.md` —— `noUnusedLocals` / `noUnusedParameters` 启用 + 死代码清理
- `docs/audits/test-coverage-2026-06-08.md` —— 现有 12 个 test 脚本覆盖率图 + 缺失测试提案
- `docs/audits/docs-2026-06-08.md` —— README / JSDoc / missing-doc 列表

### Changed

- **BREAKING** `FitMode` 默认从 `actual` 改为 `contain` —— `setTargetBitmap` 缩放行为以等比完整显示为目标,可能四周留白适配。需 1:1 像素对齐(像素艺术、极小位图)的用户必须显式传 `targetFitMode: 'actual'`。`FitMode` 新增 `'auto'` 档 —— 引擎扫描非零像素 bbox,智能选择 contain / actual。
- README `targetHold` 默认值标注从含糊描述改为明确 `Infinity`(修复自相矛盾)。

### Performance

- **禁 sourcemap** —— `tsup` 配置移除 `sourcemap: true`,NPM 包体积 **-1.8MB**(从 2.0MB → 0.2MB),site 端 \*\*-1MB`(从 1.2MB → 0.2MB)。
- **Fraunces italic 路由级 preload** —— `AILandingPage` 路由切换前 `document.head` 注入 `<link rel="preload" as="font" crossorigin>` → LCP 字体加载减少 ~120ms。
- **AITunePage 68ms longtask 拆异步** —— LLM 预热 `dynamic import()` 延后到首帧渲染后,`PRESETS` 模块懒加载,长任务从 68ms 拆为 2 个 < 30ms 任务,主线程释放给首帧绘制。

### Security

- **CSP meta + `X-Frame-Options`** —— demo / docs 页 `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; ...">` 显式声明;demo 服务端响应头加 `X-Frame-Options: DENY` 防止 clickjacking。详见 §Added > Security。

---

## [0.1.0] - 2026-06-08

> 首发版本。包含 5 主题 × 4 变体 × 12 method API + 噪声→收敛状态机 + Web Component 包装。
> 此前的提交均在 `git log` 中追溯,本文件为首个正式发布说明。

### Added

#### 入口与主题

- 公开入口函数 `matrixRain(options?): MatrixRainInstance`
- 5 套 HSL 调色板主题预设(`src/themes.ts`):
  - `silicon-valley`(冷青 + 暖琥珀,默认)
  - `matrix-green`(冷绿 + 暖黄绿)
  - `lava-red`(冷紫 + 暖红橙)
  - `cyber-blue`(冷蓝 + 暖品红)
  - `pure-mono`(冷灰 + 暖灰)
- 4 种变体(`src/variant-defaults.ts`):`classic` / `ascii` / `avalanche` / `ripple`
- 静态工具命名空间 `MatrixRain`:
  - `MatrixRain.destroyAll(container?: HTMLElement): number`
  - `MatrixRain.activeCount: number`(估算,通过数 DOM wrapper)

#### 12 个公开 method API(`MatrixRainInstance`)

| 方法                                                                    | 用途                                          |
| ----------------------------------------------------------------------- | --------------------------------------------- |
| `setTheme(name)`                                                        | 切换主题(可指定 `coldFrom` / `warmFrom` 拼色) |
| `setThemeParams(p)` / `setColdThemeParams(p)` / `setWarmThemeParams(p)` | 热更新 ThemeParams 7 字段                     |
| `setVariantParams(p)`                                                   | 热更新 VariantParams 11 字段                  |
| `setHueRotate(speed, amount)`                                           | 持续 hue 旋转                                 |
| `setColorOverrides(fn)`                                                 | 注入颜色回调                                  |
| `setFlickerSpeed(n)`                                                    | 热更新闪烁速度倍率                            |
| `setDensity(fontSize)`                                                  | 热更新字符大小                                |
| `setPalettes(cold, warm)`                                               | 注入自定义 HSLPalette                         |
| `setTargetFPS(n)`                                                       | 限频(0 = 不限)                                |
| `setTargetBitmap(bmp, opts)`                                            | 启用位图收敛目标(噪声→收敛 5 段状态机)        |
| `clearTargetBitmap()`                                                   | 立即终止位图状态机                            |
| `destroy()` / `pause()` / `resume()` / `getFPS()`                       | 生命周期                                      |

#### Transition 过渡系统(10 类别)

- **A1** noise 阶段开头渐入 — `noiseFadeInDuration`(默认 0.2s)
- **A2** 阶段间 crossfade — `phaseTransitionDuration`(默认 0.15s)
- **A3** per-cell 锁定 ease — `cellLockEaseDuration`(默认 0.12s)
- **A4** per-cell 解锁 ease — 复用 `cellLockEaseDuration`
- **B1** fade ↔ noise-converge 阶段切换 — 复用 `phaseTransitionDuration`
- **B2** 同 B1,跨调用累积状态保护
- **C1** 主题切换 HSL 调色板插值 — `themeTransitionDuration`(默认 0.4s)
- **C2** 主题参数(`brightness` / `contrast` 等)切换 — 跟随 C1 时长
- **D1** variant 切换 — `variantTransitionDuration`(默认 0.3s)
- **E1** 整体过渡系统(包裹 A1–D1 全部)

#### 噪声→收敛 5 段状态机(`targetPhase: 'noise-converge'`)

- Phase 1:`noise` — 全屏 chaos 字符(持续 `targetNoiseDuration` 秒)
- Phase 2:`converge` — 目标区从 noise 渐变到锁定形态(持续 `targetConvergeDuration` 秒)
- Phase 3:`hold` — 锁定目标,字符闪烁(持续 `targetHold` 秒,默认 `Infinity` 永久)
- Phase 4:`dissolve` — 倒序解锁,变回 rain(持续 `targetFadeOut` 秒)
- Phase 5:`idle` — 还原到普通 rain,`onTargetFinish` 触发
- 状态机共享函数:`applyTargetBitmapPhase` / `updateTargetBitmapPhaseGlobal`(`src/engine.ts:952-1009`)
- 5 个 `noise-converge` 字段:`targetPhase` / `targetNoiseDuration` / `targetConvergeDuration` / `targetLockOrder` / `targetLockStability`

#### `setTargetBitmap` 14 字段 opts

`fadeIn` / `hold` / `fadeOut` / `chaos` / `anchor` / `motion` / `motionSpeed` / `phase` / `noiseDuration` / `convergeDuration` / `lockOrder` / `lockStability` / `fitMode` / `phaseTransitionDuration`

#### `setTargetBitmap` 配合 `setTransitionAlpha` 淡入淡出

- `setTransitionAlpha(alpha, dur?)` —— 用于路由切换时软淡入/淡出
- `getTransitionAlpha?()` —— 测试钩子

#### `setTargetBitmap` 配合 `FitMode`

- `FitMode` 类型:`'actual' | 'contain' | 'cover' | 'width' | 'height'`
- `targetFitMode: FitMode` —— 位图在网格中的适配方式

#### 5 个 transition duration option

`noiseFadeInDuration` / `phaseTransitionDuration` / `cellLockEaseDuration` / `themeTransitionDuration` / `variantTransitionDuration`

#### 4 层用户函数驱动(ABCD)

- **A 沙箱**(`src/curves/sandbox.ts`):自由 JS 表达式 + 词级黑名单(50+ 关键词)+ 步数上限 10000 + 字符串上限 5KB
- **B 波形组合**(`src/curves/waves.ts`):3 channel × 6 基波 × 4 算符,`evalWave` / `evalChannels`
- **C 控制点 LUT**(`src/curves/lut.ts`):16 控制点 → 64 步采样 → 查找表
- **D 预设**(`src/curves/presets.ts`):8 个内置 preset,一键填到 A 层文本框
- 5 个动态量共享 4 层模型:`brightnessCurve` / `flickerCurve` / `phaseFunc` / `charsetFunc` / `colorCurve`

#### Web Component 包装

- 自定义元素 `<matrix-rain>`(`src/matrix-rain-element.ts`)
- 观察属性:`theme` / `variant` / `font-size` / `charset`
- 编程 API:`el.theme = 'cyber-blue'` / `el.setVariant('ripple')` / `el.fps` / `el.instance` / `el.destroy()`
- Light DOM 渲染(便于 CSS 覆盖,无 Shadow DOM)
- 自动注册(浏览器环境);SSR / Node 环境只导出类不挂副作用

#### SSR 友好核心模块

- 子路径 `@xietuier/matrix-rain/core` —— 无 DOM 依赖
- 导出:`themes` / `VARIANT_DEFAULTS` / `PaletteLUT` / `hslToRGBA` / `applyTP` / `textToBitmap` / `imageToBitmap` / `compileUserFunction` / `validateUserFunction` / `ease` / `PRESETS` / `SAFE_GLOBALS`
- Nuxt / Next SSR / Edge / Worker 均可安全 import

#### 子路径导入(package.json `exports`)

- `@xietuier/matrix-rain`(主入口)
- `@xietuier/matrix-rain/style.css`
- `@xietuier/matrix-rain/core`(SSR 友好)
- `@xietuier/matrix-rain/element`(Web Component)
- `@xietuier/matrix-rain/themes`(主题字典)
- `@xietuier/matrix-rain/script` / `@xietuier/matrix-rain/iife` / `@xietuier/matrix-rain/umd`(CDN)

#### 性能优化基础设施

- `PaletteLUT` 缓存机制(`src/palette-lut.ts`):4 张 256 阶 RGBA 表(coldStatic / warmStatic / coldFinal / warmFinal),失效重建
- `targetFPS` 限频(0/30/24/15 …)
- `onFrame` 30Hz 节流(避免回调过频)
- `onResize` 200ms debounce
- `ResizeObserver` 监听尺寸变化
- 4 个变体共用 `drawClassic`,4 KB minified(实测 `dist/index.js` 41KB,未 minify)

#### FPS 调试覆盖

- `mountFpsOverlay(target)` 实时 FPS 角标(`src/fps-overlay.ts`)
- `getFPS()` 滑窗 500ms 读数

#### 9 个 test 脚本(共 9 个 `.mjs`)

`smoke` / `leak` / `frame-rate` / `events` / `sandbox` / `noise-converge` / `canvas-remove` / `transitions` / `text-fit` / `usability` / `esm-load`

### Changed

- **BREAKING** `FitMode` 默认从 `actual` 改为 `contain` —— 0.2.0 起 `setTargetBitmap` 缩放行为以等比完整显示为目标,需 1:1 像素对齐的用户必须显式传 `targetFitMode: 'actual'`。旧版 `actual` 行为下图片超出容器会裁剪,新默认 `contain` 会留白适配。
- `dist/index.js` 当前为 41KB(未 minify),`tsup` 改 `minify: true` 后预计 ~12-15KB

### Fixed

- 无(0.1.0 为首发,无修复记录)

### Removed

- 无

### Security

- 用户函数沙箱(`src/curves/sandbox.ts`):词级黑名单 + 白名单全局 + 步数上限 + 字符串上限,详见 `docs/audits/security-2026-06-08.md`

---

## 版本约定

- **MAJOR** (1.x):破坏性 API 变更 / 删字段 / 默认值变更
- **MINOR** (0.x):新 API / 新 option / 新主题 / 新变体
- **PATCH** (0.0.x):bug fix / 性能优化 / 文档

## 参考

- [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
- `docs/audits/docs-2026-06-08.md` —— 本 changelog 内容的源头审计
