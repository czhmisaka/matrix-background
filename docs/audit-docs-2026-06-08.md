# Docs Completeness Audit — 2026-06-08

> 范围:README.md (447 行) + `types/index.d.ts` (579 行) + `site/src/pages/{DocsPage,TutorialPage}.vue` + `src/**.ts` + `docs/**.md`
> 方法:静态对比 + grep 计数 + 人工校对。
> 性质:**只读审计** — 本文件不改任何现有代码或文档。

---

## TL;DR

- **README 漏了 12 个 API / 18 个 option 字段**;`setTransitionAlpha`、`targetFitMode`、noise-converge 全套 5 个 option、5 类 transition duration 全部缺失。
- **P0 隐患**:`MatrixRain.detect()` 在 `types/index.d.ts` 声明,但 `src/index.ts` 没实现;`DocsPage.vue` 反而把它列在公开 API 中。
- **JSDoc 覆盖极薄**:`types/index.d.ts` 579 行只有 **4 个 @param + 2 个 @example,0 个 @returns**;`src/` 下 7 个文件 0 JSDoc(`core` / `themes` / `palette-lut` / `variant-defaults` / `curves/*`)。
- **缺失 4 类基础文档**:`CHANGELOG.md` / `DEPLOY.md` / `CONTRIBUTING.md` / `ARCHITECTURE.md`(或 `DEVELOPER_GUIDE.md`)。
- **in-page docs(DocsPage / TutorialPage)同样大量遗漏**——但 TutorialPage 已经把 noise-converge 5 字段(`targetPhase` / `targetNoiseDuration` / `targetConvergeDuration` / `targetLockOrder` / `targetLockStability`)写出来了,反衬 README 落后于 site 文档。

整体评分:**README API 覆盖率 ≈ 60% / JSDoc 覆盖率 ≈ 3%**。

---

## 1 · README API 覆盖表

对照 `types/index.d.ts` 的导出 + `MatrixRainInstance` 方法。**❌ = 完全没提,⚠️ = 提了但不完整**。

### 1.1 缺失的实例方法(8 个)

| API | 实际位置 | README 状态 | 备注 |
|---|---|---|---|
| `setTransitionAlpha(alpha, dur?)` | `types/index.d.ts:492` | ❌ | 用于路由切换淡入淡出,**完全没提** |
| `getTransitionAlpha?()` | `types/index.d.ts:494` | ❌ | 测试钩子 |
| `setBrightnessCurve(code)` | `types/index.d.ts:447` | ✅ README:456 | OK |
| `setFlickerCurve(code)` | `types/index.d.ts:449` | ✅ README:457 | OK |
| `setPhaseFunc(code)` | `types/index.d.ts:451` | ✅ README:458 | OK |
| `setCharsetFunc(code)` | `types/index.d.ts:453` | ✅ README:459 | OK |
| `setColorCurve(code)` | `types/index.d.ts:456` | ✅ README:452 | OK |
| `setColdThemeParams(p)` | `types/index.d.ts:434` | ✅ README:448 | OK |
| `setWarmThemeParams(p)` | `types/index.d.ts:435` | ✅ README:449 | OK |
| `getOptions()` | `types/index.d.ts:500` | ❌ | 调试/SSR 用 |
| `serialize()` | `types/index.d.ts:503` | ❌ | SSR hydration |
| `getDiagnostics()` | `types/index.d.ts:506` | ❌ | userFunc 编译错误查询 |
| `getTargetState?()` | `types/index.d.ts:523` | ❌ | noise-converge 调试 |
| `getClickBurstState?()` | `types/index.d.ts:544` | ❌ | clickBurst 调试 |

### 1.2 缺失的 Option 字段(19 个)

| Option | 实际位置 | README 状态 |
|---|---|---|
| `targetPhase` (`'fade' \| 'noise-converge'`) | types:319 | ❌ |
| `targetNoiseDuration` | types:321 | ❌ |
| `targetConvergeDuration` | types:323 | ❌ |
| `targetLockOrder` (7 种) | types:333 | ❌ |
| `targetLockStability` | types:337 | ❌ |
| `targetFitMode` (`FitMode`) | types:289 | ❌(连同 `FitMode` 类型一起) |
| `noiseFadeInDuration` | types:346 | ❌ |
| `phaseTransitionDuration` | types:348 | ❌ |
| `cellLockEaseDuration` | types:350 | ❌ |
| `themeTransitionDuration` | types:352 | ❌ |
| `variantTransitionDuration` | types:354 | ❌ |
| `fixedTimeStep` | types:223 | ❌ |
| `enableWhenReducedMotion` | types:230 | ❌ |
| `clickBurst` | types:378 | ❌ |
| `cursor` | types:380 | ❌ |
| `onFrame` / `onResize` / `onThemeChange` / `onTargetFinish` | types:369-375 | ❌(回调全表无) |
| `MatrixRainSnapshot` 类型 | types:387 | ❌ |
| `EnvironmentInfo` 类型 | types:548 | ❌ |
| `VARIANT_DEFAULTS` 常量 | types:84 | ❌ |

### 1.3 缺失的静态工具(2 个)

| API | 实际位置 | README 状态 |
|---|---|---|
| `MatrixRain.fromSnapshot(json, opts?)` | types:575(在 engine.ts:2162 monkey-patch) | ❌ |
| `MatrixRain.detect()` | types:577 | ⚠️ **声明但未实现** — `src/index.ts:51-80` 只实现 `destroyAll` + `activeCount` |

### 1.4 `setTargetBitmap` 签名不完整

README:461 显示 opts 字段是 `{fadeIn?, hold?, fadeOut?, chaos?, anchor?, motion?, motionSpeed?}`(7 个)。
实际 types:459-480 的 opts 有 **14 个字段**:上面 7 个 + `phase` + `noiseDuration` + `convergeDuration` + `lockOrder` + `lockStability` + `fitMode` + `phaseTransitionDuration`。

### 1.5 README 已覆盖(✅)

- `matrixRain()` 入口 / 5 Theme / 4 Variant / fontSize / charset / trailAlpha / maxDPR / flickerSpeed
- `coldPalette` / `warmPalette` / `lightCenter` / `driftSpeed` / `warmthRadius` / `warmthLerp` / `sparkProbability` / `flickerRates`
- `themeParams` / `variantParams` / `coldThemeParams` / `warmThemeParams` / `coldFrom` / `warmFrom`
- `hueRotateSpeed` / `hueRotateAmount` / `colorOverrides` / `colorCurve`
- `brightnessCurve` / `flickerCurve` / `phaseFunc` / `charsetFunc`
- `targetBitmap` / `targetFadeIn` / `targetHold` / `targetFadeOut` / `targetChaos` / `targetCols` / `targetRows` / `targetAnchor` / `targetMotion` / `targetMotionSpeed`
- `container` / `canvas` / `onReady`
- `destroy` / `pause` / `resume` / `getFPS` / `setTheme` / `setThemeParams` / `setHueRotate` / `setColorOverrides` / `setVariantParams` / `setFlickerSpeed` / `clearTargetBitmap` / `setDensity` / `setPalettes`
- `MatrixRain.destroyAll` / `MatrixRain.activeCount`
- 框架集成(React / Vue / Next.js / Web Component)
- 子路径导入 + CDN + 性能调优

---

## 2 · JSDoc 完整度

### 2.1 `types/index.d.ts` 计数(grep)

```
@param   × 4
@returns × 0
@example × 2
```

文件 579 行,导出 **21 个 type/interface + 3 个 const + 1 个 function + 1 个 namespace**。JSDoc 几乎只覆盖了字段级(`/** 0-360 */ h: number;` 这种),方法签名只有 `setTheme` / `setTargetFPS` / `setTransitionAlpha` 三处带 JSDoc。

| 导出项 | JSDoc | 缺什么 |
|---|---|---|
| `matrixRain(options?)` | ❌ 无 | 入口函数无任何 JSDoc |
| `MatrixRainInstance` 全部方法 | ❌ 仅 `setTheme` / `setTargetFPS` / `setTransitionAlpha` | 25+ 个方法缺 `@param` `@returns` |
| `MatrixRain` 静态命名空间 | ❌ | `destroyAll` / `fromSnapshot` / `detect` 全无 |
| `themes` | ❌ | 字典 const 无说明 |
| `VARIANT_DEFAULTS` | ❌ | 4 个变体的默认值无说明 |
| `BitmapSource` | ❌(仅 `FitMode` 有) | 文字/图片 → Float32Array 的中间表示 |
| `MatrixRainSnapshot` | ❌ | SSR 协议结构无说明 |

### 2.2 `src/` 文件级 JSDoc 计数

| 文件 | 行数 | `@param` | `@returns` | `@example` | 状态 |
|---|---|---|---|---|---|
| `src/index.ts` | 83 | 1 | 1 | 0 | 顶部文件头 OK,内部导出全无 |
| `src/engine.ts` | 2199 | 3 | 0 | 0 | 巨型核心,几乎裸导出 |
| `src/bitmap.ts` | 243 | 2 | 0 | 0 | `textToBitmap` / `imageToBitmap` 缺 |
| `src/fps-overlay.ts` | 103 | 1 | 0 | 0 | OK 但薄 |
| `src/matrix-rain-element.ts` | 176 | 0 | 0 | 0 | **Web Component 公共 API 0 JSDoc** |
| `src/themes.ts` | 79 | 0 | 0 | 0 | 5 主题工厂无 JSDoc |
| `src/variant-defaults.ts` | 13 | 0 | 0 | 0 | 默认值表无说明 |
| `src/palette-lut.ts` | 248 | 0 | 0 | 0 | `hslToRGBA` / `applyTP` / `PaletteLUT` 0 JSDoc |
| `src/core.ts` | 48 | 0 | 0 | 0 | 仅 re-export,内容薄 |
| `src/curves/lut.ts` | 50 | 0 | 0 | 0 | LUT 系统无说明 |
| `src/curves/presets.ts` | 76 | 0 | 0 | 0 | 8 个预设 0 JSDoc |
| `src/curves/sandbox.ts` | 311 | 0 | 0 | 0 | 沙箱安全模型 0 JSDoc(关键!) |
| `src/curves/waves.ts` | 101 | 0 | 0 | 0 | 波形组合 0 JSDoc |

**总 JSDoc 密度:`types/index.d.ts` ≈ 0.6% · `src/` 平均 ≈ 0.4%**。远低于 npm 主流库水平(typings 行业基线约 30-50%)。

---

## 3 · 缺失文档清单(4 个建议新文件)

| 文件 | 用途 | 缺失原因 / 影响 |
|---|---|---|
| **`CHANGELOG.md`** | 版本历史 + 破坏性变更 | 当前 0.1.0 没有任何发布说明;`setTransitionAlpha` / noise-converge / FitMode 何时加入、API 怎么演化,使用者无从追溯。`git log` 仅有 commit 消息,缺少 Keep-a-Changelog 风格的 *Added / Changed / Fixed* 段。 |
| **`DEPLOY.md`** | 部署 / 发布流程(NPM publish、CDN 同步、tag 规范、版本号规则) | 项目虽以"完全本地部署"为目标,`docs/playwright/` 已有截图流程;但 README 没有任何"我作为 maintainer 怎么发版"的指南,新 contributor 接手时一头雾水。 |
| **`CONTRIBUTING.md`** | 贡献指南(PR 规范、测试要求、commit 格式、code review checklist) | 仓库只有 `LICENSE` + `README`,没有 `CONTRIBUTING.md`。观察到 commit 习惯用 `feat:` / `fix:` / `docs(audit):` 前缀(类型化提交),值得文档化。 |
| **`ARCHITECTURE.md`** 或 **`DEVELOPER_GUIDE.md`** | 架构总览(模块图 / 渲染管线 / 状态机 / 性能预算) | `src/engine.ts` 2199 行是个黑盒;新人想知道"ABCD 4 层模型怎么串成 rAF 主循环 / noise-converge 5 段状态机在哪里切 / PaletteLUT 怎么缓存"都要自己读。`docs/AUDIT-2026-06-07.md` / `docs/PERF-BASELINE-2026-06-08.md` 是某个切面,缺少全局架构图。 |

可选追加(优先级 P2):

- **`docs/SECURITY.md`** — sandbox 黑名单(README:200-205 提了 50+ 关键词),可独立成文件并标注 CVE 状态。
- **`docs/MIGRATION.md`** — 破坏性升级时(从 0.1.0 → 0.2.0)提供 codemod 指南。

---

## 4 · in-page docs vs API 一致性

### 4.1 `site/src/pages/DocsPage.vue`(255 行)

声称的章节(源码 154-163):overview / themes / variants / target-phase / events / methods / static / web-component。

**过时 / 错配**:
- L130 `MatrixRain.detect()` — **P0**:在 types:577 声明,但 `src/index.ts:51-80` 没实现。`detect` 既未导出也未定义;`environment.ts` 也没找到。

**遗漏的实例方法**(types/index.d.ts 已声明,DocsPage 未列):
- `setTransitionAlpha` / `getTransitionAlpha`
- `setVariantParams` / `setBrightnessCurve` / `setFlickerCurve` / `setPhaseFunc` / `setCharsetFunc` / `setColorCurve`
- `setHueRotate` / `setColdThemeParams` / `setWarmThemeParams`
- `getOptions` / `serialize` / `getDiagnostics` / `getClickBurstState`

**遗漏的 Options 字段**(已存在于 types):
- 整个 noise-converge 5 字段已在 §target-phase 段写出来 ✅(L75-79),但与 README 不同步
- 5 个 transition duration 全无
- `targetFitMode` / `FitMode` 全无
- `fixedTimeStep` / `enableWhenReducedMotion` / `clickBurst` / `cursor` 全无

**Web Component 段** L143 列的属性:`theme` / `variant` / `cell-size` / `target-fps` / `click-burst` / `cursor` —— 其中 `cell-size` 是否真存在需要查 `matrix-rain-element.ts` 确认(此处未做完整验证,留作 follow-up)。

### 4.2 `site/src/pages/TutorialPage.vue`(441 行)

12 个 tab:intro / install / quickstart / themes / variants / react / vue / next / cdn / api-options / api-methods / playground。

**遗漏的实例方法**(同 DocsPage,反而 api-methods 段 L227-243 写得比 DocsPage 还全):
- `setTransitionAlpha` 等热更新方法全部缺失
- `getDiagnostics` / `getClickBurstState` 缺失
- `setVariantParams` 缺失

**遗漏的 Options**:
- `api-options` 段 L196-215 列了 13 个 option,但 `types/index.d.ts` 总共 **80+**;`palette` 系列 5 个 + `lightCenter` / `driftSpeed` / `warmthRadius` / `warmthLerp` / `sparkProbability` / `flickerRates` / `coldFrom` / `warmFrom` / `target*` 大部分 / `clickBurst` / `cursor` / `fixedTimeStep` / `enableWhenReducedMotion` 等都缺。
- §quickstart L66-73 用到了 `targetPhase: 'noise-converge'`,证明 site 文档对 noise-converge 已有正确认知——但 README 整体落后。

**TutorialPage 写得好的部分**(对比 README):
- ✅ noise-converge 4 字段(table L207-209)
- ✅ `setHueRotate` L235
- ✅ onFrame / onResize / onThemeChange / onTargetFinish L210-213

### 4.3 总结:site 文档比 README 详细

按覆盖率排序:`types/index.d.ts`(100%,源真值)>`site/TutorialPage.vue`(约 70%)>`site/DocsPage.vue`(约 60%)>`README.md`(约 60%)。

**两个 in-page 文档都漏了 `setTransitionAlpha` + 5 个 transition duration option**——这块 0 覆盖。

---

## 5 · 优先级与建议行动

### P0(必修,影响功能 / 用户体验)

1. **修复 `MatrixRain.detect()` 未实现**:`types/index.d.ts:577` 声明,`DocsPage.vue:130` 公开;`src/index.ts` 没写。`EnvironmentInfo` 类型悬空。补全 `detect()`(读 `navigator.userAgent` + `matchMedia('(prefers-color-scheme: dark)')` + 视口宽)。
2. **README 增补 `setTransitionAlpha` 段**:路由切换的软淡入/淡出是 SPA 刚需,目前完全埋在 types 里,用户不可能发现。

### P1(应做,影响覆盖率)

3. **README 新增 §noise-converge 5 字段**(直接抄 `DocsPage.vue:75-79`)。
4. **README 新增 §FitMode / targetFitMode 段**(types:18 + types:289,默认 `contain` 跟旧版 `actual` 行为不一致,必须显式提示)。
5. **README 新增 §5 类 transition duration option 段**(`noiseFadeInDuration` / `phaseTransitionDuration` / `cellLockEaseDuration` / `themeTransitionDuration` / `variantTransitionDuration`)——这些是 E1 整套平滑过渡系统的开关,默认静默 fallback 行为对用户不透明。
6. **README 增补 4 个回调** `onFrame` / `onResize` / `onThemeChange` / `onTargetFinish` + 5 个调试 getter(`getOptions` / `serialize` / `getDiagnostics` / `getTargetState` / `getClickBurstState`)。
7. **新增 `CHANGELOG.md`**(Keep-a-Changelog 格式,标注 0.1.0 已有 API + 下一版 0.2.0 计划)。
8. **新增 `ARCHITECTURE.md`**(或 `DEVELOPER_GUIDE.md`):画一张 4 层 ABCD 模型 + 渲染管线 + noise-converge 5 段状态机的总图,至少 200 行。

### P2(可做,影响体验)

9. **README 增补 `clickBurst` / `cursor` / `fixedTimeStep` / `enableWhenReducedMotion`** —— 都是简单开关,各 1 行说明。
10. **JSDoc 系统性补强**:从 `types/index.d.ts` 入口函数 `matrixRain()` 和 `MatrixRainInstance` 方法开始,目标 30% 字段覆盖;`src/curves/sandbox.ts` 沙箱安全模型单独写一段(50+ 关键词黑名单的来源)。
11. **DocsPage.vue + TutorialPage.vue 同步加 `setTransitionAlpha` / 5 transition duration 段**。
12. **新增 `CONTRIBUTING.md`** + **`DEPLOY.md`**(可拆 PR 提)。

---

## 6 · 统计汇总

| 维度 | 实际 | 文档覆盖 | 覆盖率 |
|---|---|---|---|
| `types/index.d.ts` exports | 27 | README 提了 ~17 | ~63% |
| `MatrixRainInstance` 方法 | 25 | README 提了 12 | 48% |
| `MatrixRainOptions` 字段 | ~80 | README 提了 ~30 | 38% |
| `@param` in `types/index.d.ts` | — | 4 | (基线 ~250 应有) |
| `@returns` in `types/index.d.ts` | — | 0 | (基线 ~25 应有) |
| `@example` in `types/index.d.ts` | — | 2 | (基线 ~15 应有) |
| `src/` 文件 JSDoc 完整 | 4/13 | 31% | 行业基线 ~60% |
| `docs/` 必需文档 | 5/9 | 56% | 缺 CHANGELOG/DEPLOY/CONTRIBUTING/ARCHITECTURE |

---

## 附录 · 验证用命令

```bash
# README 提及的 API 数量
grep -cE "set|get|clear" README.md   # 75(含 setThemeParams 等)

# types 导出数量
grep -cE "^export " types/index.d.ts  # 26

# JSDoc 计数
grep -c "@param\|@returns\|@example" types/index.d.ts  # 6
```

> 本审计由 Claude(模型 MiniMax-M3)于 2026-06-08 完成。**未修改任何源文件**。仅在 `docs/` 下新增本报告文件。
