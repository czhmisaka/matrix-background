# Changelog

All notable changes to `@xietuier/matrix-rain` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — 0.2.0 计划

> 计划随 `docs/audit-docs-2026-06-08.md` P0 / P1 项落地。**未发布**。

### Added(计划)

- `MatrixRain.detect(): EnvironmentInfo` —— 读 `navigator.userAgent` + `matchMedia('(prefers-color-scheme: dark)')` + 视口宽,补齐 `types/index.d.ts:577` 声明缺口(对应 audit P0)
- 增补 README §`setTransitionAlpha` 段(对应 audit P0)
- 增补 README §`noise-converge` 5 字段段(对应 audit P1)
- 增补 README §`FitMode` / `targetFitMode` 段(对应 audit P1)
- 增补 README §5 类 transition duration option 段(对应 audit P1)
- 增补 4 个回调签名段:`onFrame` / `onResize` / `onThemeChange` / `onTargetFinish`
- 增补 5 个调试 getter 段:`getOptions` / `serialize` / `getDiagnostics` / `getTargetState` / `getClickBurstState`
- `CONTRIBUTING.md` —— PR / commit / 测试规范(对应 audit §3)
- `DEPLOY.md` —— NPM publish / CDN 同步 / tag 规范(对应 audit §3)

### Changed(计划)

- `MatrixRain.detect()` 实际返回值与 `types/index.d.ts:577` 声明对齐(目前未实现)
- README 标注对齐实际默认行为(`targetHold` 默认 `Infinity` 修复自相矛盾)

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

| 方法 | 用途 |
|---|---|
| `setTheme(name)` | 切换主题(可指定 `coldFrom` / `warmFrom` 拼色) |
| `setThemeParams(p)` / `setColdThemeParams(p)` / `setWarmThemeParams(p)` | 热更新 ThemeParams 7 字段 |
| `setVariantParams(p)` | 热更新 VariantParams 11 字段 |
| `setHueRotate(speed, amount)` | 持续 hue 旋转 |
| `setColorOverrides(fn)` | 注入颜色回调 |
| `setFlickerSpeed(n)` | 热更新闪烁速度倍率 |
| `setDensity(fontSize)` | 热更新字符大小 |
| `setPalettes(cold, warm)` | 注入自定义 HSLPalette |
| `setTargetFPS(n)` | 限频(0 = 不限) |
| `setTargetBitmap(bmp, opts)` | 启用位图收敛目标(噪声→收敛 5 段状态机) |
| `clearTargetBitmap()` | 立即终止位图状态机 |
| `destroy()` / `pause()` / `resume()` / `getFPS()` | 生命周期 |

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

- 用户函数沙箱(`src/curves/sandbox.ts`):词级黑名单 + 白名单全局 + 步数上限 + 字符串上限,详见 `docs/audit-security-2026-06-08.md`

---

## 版本约定

- **MAJOR** (1.x):破坏性 API 变更 / 删字段 / 默认值变更
- **MINOR** (0.x):新 API / 新 option / 新主题 / 新变体
- **PATCH** (0.0.x):bug fix / 性能优化 / 文档

## 参考

- [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
- `docs/audit-docs-2026-06-08.md` —— 本 changelog 内容的源头审计
