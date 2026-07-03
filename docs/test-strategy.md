# `@xietuier/matrix-rain` 测试方案设计文档

> 版本: v1.0 · 起草日期 2026-06-16
> 适用范围: 当前 0.5.1 → 目标 0.7.x 全阶段
> 文档类型: 设计方案(无任何可运行代码;所有 case 名/路径为伪代码标识符)
> 引用记忆:
>
> - [[feedback_min_font_size]] —— fontSize 硬下限 4px,所有 test/UI/slider 必须 clamp
> - [[feedback_visual_verification_untrusted]] —— 视觉验证必须 gl.getError=0 + 像素匹配率 ≥X%
> - [[feedback_audit_pattern]] —— 真 gzip + P0/P1/P2 + ≥100 行 + auto-commit
> - [[feedback_debug_depth_boundary]] —— 调试兔子洞超过 2 处源码改动 + 30 分钟未果即停
> - [[feedback_plan_structure]] —— 每阶段含"开发目标/最终需求审查/测试"三段
> - [[feedback_kanban_worktree_loss]] —— 只读报告类任务必须 cp 到主目录,防 worktree 被清

---

## 0. 阅读须知

本文档回答一个问题:**"如何把 39 个手写/单测探针(31 mjs + 8 spec)升级成可重复、可度量、可拦截回归的现代测试体系,且不推翻已有投资"**。

要点:

1. **不搞革命**。`test/*.mjs` 探针累计 ~3 000 行有效代码,记录了项目独有的边界(bitmap 校验、setter 副作用顺序、charGap 物理含义)。直接 `rm -rf` 是浪费 —— 本文给出"保留 / 并行 / 重写 / 废弃"四档迁移路线。
2. **不堆框架**。单元层选 Vitest + happy-dom,像素层选 Playwright + pixelmatch,性能层选 Vitest bench + size-limit。不引入 Cypress / Jest / Mocha 任何第二选择。
3. **不强求 100% 行覆盖**。本项目 80% 代码是 renderer 副作用(像素/着色器/WebGPU buffer),纯单元覆盖意义不大,必须分层。

---

## 1. 背景与现状

### 1.1 仓库现状(已锁定,本节不重复调研)

| 资产            | 数量 / 路径                                                                                                            | 性质                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 手写 Node 探针  | 31 个 `test/*.mjs` + 8 个 `test/unit/**/*.spec.ts` = **39 个探针**                                                     | `*.mjs` `node test/*.mjs` 串行,`*.spec.ts` 走 Vitest 框架 |
| npm scripts     | 25+ 个 `test:*` + 1 个聚合 `test`                                                                                      | 主入口 ~25 行 `&&` 串联                                   |
| 既有 audit 报告 | 4 份 `audits/{performance,runtime,code-quality,usability}-*.md`（见 `docs/audits.md` 索引）                            | 仅文档,不可执行                                           |
| 构建/基准脚本   | `scripts/build-atlas.mjs` / `scripts/bench-renderer.mjs` / `scripts/copy-site-assets.mjs` / `scripts/fix-dts-hash.mjs` | 构建管线 4 件套                                           |
| 站点            | `site/PlaygroundPage.vue` + `site/src/composables/useMatrixRain.ts` + `site/public/atlas/`                             | E2E 真实入口                                              |
| 像素 demo       | `test/fixtures/pixel-demo.html` + `test/renderer-pixel.mjs`                                                            | Phase 1 升格原型                                          |
| 主目录脚本      | `site/public/atlas/` 已存在                                                                                            | 真浏览器可加载                                            |

### 1.2 现状痛点(已观察到的事实,非推测)

| 痛点                              | 证据                                                                                                                     | 后果                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| **无框架**                        | `test/*.mjs` 全是 `import assert from 'node:assert/strict'` + 自写 mock                                                  | 无 watch/TDD/覆盖率/并发/失败聚合      |
| **无浏览器 e2e**                  | 历史 `scripts/e2e-demos.py`(Python Playwright)已于 2026-07 删除 · 当前 Playwright 入口在 `test/e2e/playwright.config.ts` | 迁移进度见 `test/e2e/`                 |
| **像素基线脆弱**                  | `renderer-pixel.mjs` 阈值 ≥95% 写死,无按 renderer/case 分档                                                              | webgpu 浮点误差会误报                  |
| **性能基线漂移**                  | `bench-renderer.mjs` 输出 JSON 但无 diff、无阈值                                                                         | PR 不挡 perf 回归                      |
| **包体积手工 gzip**               | `scripts/build-size.mjs` 手算压缩                                                                                        | 阈值"个人约定",CI 不能 fail            |
| **0.6.2+ Playground 修复轮 P0×2** | `audit-playground-fix-2026-06-16.md` 报告 `setDensity` 每帧 `buildGrid` + `setTargetBitmap` 占位 bitmap 抛错             | **这两个 bug 应该作为第一批回归 case** |

### 1.3 已有探针的归类(决定迁移策略)

按"可被框架替代程度"分四档:

| 档位                          | 含义                           | 数量 | 示例                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. 单元级,无 DOM**          | 纯逻辑,可直接迁 Vitest         | 8    | `themes.mjs` / `edge-cases.mjs` / `set-target-bitmap-validation.mjs` / `detect.mjs` / `easing.mjs` / `validation.mjs` / `esm-load.mjs` / `auto-pick.mjs`                                              |
| **B. 单元级,需 mock DOM/RAF** | 须 happy-dom 或 jsdom          | 11   | `smoke.mjs` / `leak.mjs` / `frame-rate.mjs` / `events.mjs` / `sandbox.mjs` / `canvas-remove.mjs` / `transitions.mjs` / `text-fit.mjs` / `char-gap.mjs` / `render-scale.mjs` / `renderer-canvas2d.mjs` |
| **C. 真浏览器像素/着色器**    | 必须 Playwright + WebGL/WebGPU | 6    | `renderer-pixel.mjs` / `renderer-webgl.mjs` / `renderer-webgpu.mjs` / `image-converge.mjs` / `noise-converge.mjs` / `atlas-load.mjs`                                                                  |
| **D. 健康/规模/部署**         | 工具脚本,保留或半自动化        | 6    | `renderer-health.mjs` / `build-size.mjs` / `usability.mjs` / `e2e-screenshots.mjs`(e2e-demos.py 已删)                                                                                                 |

迁移路线总览见 §7。

---

## 2. 目标与原则

### 2.1 四大目标

| 目标               | 量化指标                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| **覆盖度**         | 公开 API 100% 有单元 case;5 主题 × 4 变体参数合法性 100%;3 renderer 各 ≥6 个像素 case             |
| **可重复**         | 同 commit 同一 CI runner,像素匹配率波动 ≤0.5%                                                     |
| **速度**           | 单元层 < 30 s · 像素层 < 3 min · 性能层 < 5 min · e2e < 4 min                                     |
| **与现有探针共存** | 旧 `test:*` 脚本在迁移窗口期全部保留,新 `vitest`/`playwright` 平行跑,旧脚本逐步标记 `deprecated:` |

### 2.2 七条原则

1. **分层不可串**:单元 → 像素 → e2e → 性能,不允许 e2e 反向替代像素(精度不够)
2. **像素阈值分档**:canvas2d / webgl / webgpu 三档不同阈值(见 §3.3.3)
3. **真浏览器不可省**:任何"画"相关的断言必须真 canvas,不允许只 mock `getContext` 跑通([[feedback_visual_verification_untrusted]])
4. **基准图入库**:`test/baselines/*.png` 入 git LFS,变更走 PR review,不允许本地覆盖
5. **性能阈值守门**:`vitest bench` 相对 baseline 浮动 >10% 标 P2,>20% 标 P1,>50% 标 P0
6. **fontSize 永远 clamp**:[[feedback_min_font_size]] —— slider/preset/test fixture 一律 `Math.max(4, ...)`,违反即 fail
7. **CI 优先**:GitHub Actions 必须 fail-fast,任一维度红线立即红(详见 §6)

---

## 3. 四维度方案

### 3.1 维度一:API 单元测试(Vitest + happy-dom)

#### 3.1.1 目标

覆盖 `src/engine.ts` + `src/engine/setters.ts` + `src/engine/getRendererHealth.ts` + `src/bitmap.ts` + `src/core.ts` + `src/themes.ts` + `src/palette-lut.ts` 的**纯逻辑分支**和**公开 API 契约**。覆盖 `types/index.d.ts` 中声明的每个 setter/getter(确保 TS 契约与运行时一致)。

#### 3.1.2 工具与版本

| 包                      | 版本(锁定) | 作用                                                       |
| ----------------------- | ---------- | ---------------------------------------------------------- |
| `vitest`                | ^2.1.x     | 主 runner,原生 ESM / TS / watch                            |
| `@vitest/coverage-v8`   | ^2.1.x     | 行/分支覆盖,出 lcov                                        |
| `happy-dom`             | ^15.x      | 轻量 DOM/canvas,启动 ~50 ms,够覆盖 RAF/Canvas2D            |
| `@vitest/browser`(可选) | ^2.1.x     | 真浏览器跑 subset,用于需要 `OffscreenCanvas` 的极少数 case |

> 不选 jsdom:jsdom 的 Canvas API 仅 stub,fillText 不真画;happy-dom 走 node-canvas 兼容更好,[[feedback_visual_verification_untrusted]] 提醒真像素必须真浏览器,因此 happy-dom 仅用于**接口形状**测试。
> 不选 Playwright Test 做单元:启动开销 1+ 秒/文件,杀速度。

#### 3.1.3 目录结构

```
test/unit/
├── engine/
│   ├── api.contract.spec.ts          # 公开 API 签名 + 返回类型
│   ├── api.lifecycle.spec.ts         # start/pause/resume/dispose/destroy 状态机
│   ├── api.setters.coverage.spec.ts  # types/index.d.ts 每一个 setter 至少 1 case
│   ├── api.getters.coverage.spec.ts  # 每一个 getter 至少 1 case
│   ├── api.events.spec.ts            # onFrame/onError/onReady/onResize 契约
│   └── api.errors.spec.ts            # 异常路径 (无效 theme / 负 density / NaN)
├── engine/
│   ├── charGap.spec.ts               # 边界 [-10, 20] / NaN / 0(等价基线)
│   ├── fontSize.clamp.spec.ts        # [[feedback_min_font_size]] 硬下限 4px
│   ├── density.spec.ts               # 自适应 vs 显式,audit-playground-fix P0 #1
│   ├── buildGrid.spec.ts             # 仅在 resize/setDensity 显式调用时触发
│   ├── bitmap.spec.ts                # cols/rows 必须正整数;audit-playground-fix P0 #2
│   ├── theme-switch.spec.ts          # 5 主题切换不重建 engine
│   ├── variant-switch.spec.ts        # 4 变体 × 5 主题 = 20 组合参数合法性
│   └── palette-lut.spec.ts           # 颜色插值边界 / 透明色
├── themes/
│   ├── matrix.green.spec.ts
│   ├── matrix.red.spec.ts
│   ├── matrix.blue.spec.ts
│   ├── matrix.purple.spec.ts
│   └── matrix.gold.spec.ts
├── core/
│   ├── curves.spec.ts                # easing 函数纯函数
│   ├── palette-lut.spec.ts
│   └── state.spec.ts                 # state.r / state.i 不变性
├── fixtures/
│   ├── mock-dom.ts                   # 提供 MockContext2D + RAF 队列
│   ├── engine-harness.ts             # createEngine(opts) → instance,统一 reset
│   └── parameter-matrix.ts           # 5×4 = 20 组主题/变体参数发生器
├── setup.ts                          # 全局 beforeEach 清 RAF 队列
└── tsconfig.json                     # 继承根 tsconfig + jsx preserve
```

#### 3.1.4 测试用例清单(枚举)

> 以下 case 名均为伪代码标识符,落地时再决定 `it('...')` 字符串。

**A. 公开 API 契约(`engine/api.*`)**

| Case                                                        | 描述                                                      | 关键断言                        |
| ----------------------------------------------------------- | --------------------------------------------------------- | ------------------------------- |
| `api.contract.start_returns_promise`                        | `start()` 返回 Promise,resolve 后 `isRunning===true`      | typeof === 'object' 且有 then   |
| `api.contract.pause_resume_idempotent`                      | 连续 pause 两次不抛,resume 后 frame 计数继续              | onFrame 计数 == N               |
| `api.contract.destroy_clears_raf`                           | destroy 后 RAF 队列为空,无泄漏                            | \_\_rafQueue.size === 0         |
| `api.contract.dispose_chainable`                            | dispose() 可链式调用且不抛                                | 返回值 === instance             |
| `api.setters.all_setters_are_callable`                      | **枚举** `types/index.d.ts` 中所有 setter,运行时必须存在  | Object.keys 比对 100% 覆盖      |
| `api.setters.charGap_zero_is_baseline`                      | `setCharGap(0)` 后画布位与默认值 byte-for-byte 等价       | hash(像素) === hash(baseline)   |
| `api.setters.fontSize_clamps_to_4`                          | `setFontSize(2)` 不抛,实际渲染用 4px                      | getOption('fontSize') >= 4      |
| `api.setters.setDensity_calls_buildGrid_once`               | audit-playground-fix P0 #1 回归                           | buildGrid 调用计数 === 1        |
| `api.setters.setDensity_without_fontSize_does_not_loop`     | audit-playground-fix P0 #1:无 fontSize 选项时不每帧 dirty | 60 帧内 buildGrid 调用次数 <= 1 |
| `api.setters.setTargetBitmap_validates_zero_rows`           | audit-playground-fix P0 #2:rows=0 必须 throw              | throws / 不会 swallow           |
| `api.setters.setTargetBitmap_accepts_only_positive_integer` | `cols/rows` 必须正整数(类型 d.ts 也声明)                  | NaN / 0 / 负 / 1.5 → throw      |
| `api.setters.setTheme_invalid_throws`                       | `setTheme('banana')` 抛 TypeError                         | msg 包含 'theme'                |
| `api.setters.setVariant_invalid_throws`                     | `setVariant('xxl')` 抛                                    | 同上                            |
| `api.events.onFrame_called_with_stats`                      | 每帧回调签名 `{ fps, frame, dropped }`                    | 三字段全在                      |
| `api.events.onError_called_on_gl_error`                     | WebGL 触发 GL_INVALID_OPERATION 时 onError 至少调一次     | cb.mock.calls.length >= 1       |
| `api.events.onReady_called_after_first_frame`               | onReady 时机不早于首帧                                    | cb 调用时 frame >= 1            |
| `api.events.onResize_called_with_size`                      | onResize 传 `{ width, height, dpr }`                      | 全字段                          |
| `api.errors.engine_constructed_twice`                       | 已 dispose 的 canvas 再 new engine 不残留                 | 不抛 TypeError                  |
| `api.errors.engine_disposed_cannot_set`                     | dispose 后 set\* 抛 / warn 行为                           | 文档化行为                      |

**B. 参数合法性矩阵(`engine/variant-switch.spec.ts`)**

| Case                                                | 描述                                                   |
| --------------------------------------------------- | ------------------------------------------------------ |
| `param_matrix.5themes_4variants_each_constructible` | 笛卡尔积 20 组,每组 `createEngine()` 成功              |
| `param_matrix.invalid_density_throws`               | density = -1 / 0 / Infinity → 拒绝                     |
| `param_matrix.invalid_target_throws`                | bitmap target = `null` / `undefined` / 非正整数 → 拒绝 |
| `param_matrix.charGap_overflow_clamps`              | charGap = -10 / 20 / NaN → 内部 clamp,画布渲染不破     |

**C. 主题/调色板(`themes/*`)**

| Case                                   | 描述                                        |
| -------------------------------------- | ------------------------------------------- |
| `theme.matrix.green.contrast_above_aa` | 末帧字符与背景对比度 ≥ WCAG AA 4.5          |
| `theme.matrix.red.glow_in_red_band`    | WebGL 输出 RGB r-g-b 排序在 [R>B, R>G] 区间 |
| `theme.matrix.gold.luminance_in_range` | gold 主题渲染后整体亮度在 [120, 200] / 255  |
| `palette.interpolate_endpoints`        | 渐变 LUT 端点等于 theme 定义的首末色        |
| `palette.interpolate_alpha_preserved`  | alpha 不参与颜色插值                        |

**D. 状态/曲线(`core/*`)**

| Case                                | 描述                              |
| ----------------------------------- | --------------------------------- |
| `state.frame_counter_monotonic`     | 帧计数严格递增,不重置除非 destroy |
| `state.i_j_k_remain_int`            | grid index 始终整数               |
| `curves.easeInQuad_endpoints`       | f(0)=0, f(1)=1                    |
| `curves.easeInOutCubic_monotonic`   | 一阶导非负                        |
| `curves.easeOutBack_overshoot_safe` | overshoot 在 [1.0, 1.1] 区间      |

#### 3.1.5 通过标准

| 项                            | 阈值                                                            |
| ----------------------------- | --------------------------------------------------------------- |
| 行覆盖(`@vitest/coverage-v8`) | `src/engine/**` ≥ 90%,`src/core/**` ≥ 85%,`src/themes/**` ≥ 80% |
| 分支覆盖                      | ≥ 80%                                                           |
| 用例数                        | ≥ 200(等效旧探针规模)                                           |
| 单测耗时                      | `vitest run` < 30 s(无 watch)                                   |
| 失败聚合                      | 单 case 失败仅阻断该 file,继续跑(默认 reporter)                 |

#### 3.1.6 与现有探针的关系

| 旧探针                             | 新归宿                                       | 关系                                          |
| ---------------------------------- | -------------------------------------------- | --------------------------------------------- |
| `smoke.mjs`                        | `engine/api.lifecycle.spec.ts`               | **重写**(框架化)                              |
| `leak.mjs`                         | `engine/api.lifecycle.spec.ts`(destroy 分支) | **重写**                                      |
| `frame-rate.mjs`                   | `engine/api.events.spec.ts` + 性能层         | **拆分**:契约入单元,FPS 数据入 perf           |
| `events.mjs`                       | `engine/api.events.spec.ts`                  | **重写**                                      |
| `sandbox.mjs`                      | `engine/api.errors.spec.ts`                  | **重写**                                      |
| `transitions.mjs`                  | `engine/theme-switch.spec.ts`                | **重写**                                      |
| `text-fit.mjs`                     | `engine/fontSize.clamp.spec.ts`              | **重写**                                      |
| `char-gap.mjs`                     | `engine/charGap.spec.ts`                     | **重写**(保留所有边界值)                      |
| `render-scale.mjs`                 | `engine/api.events.spec.ts`(onResize)        | **并入**                                      |
| `renderer-canvas2d.mjs`            | 单元层 + 像素层各取一段                      | **拆分**:接口入单元,渲染入像素                |
| `themes.mjs`                       | `themes/*`                                   | **重写**                                      |
| `edge-cases.mjs`                   | `engine/api.errors.spec.ts`                  | **重写**                                      |
| `set-target-bitmap-validation.mjs` | `engine/bitmap.spec.ts`                      | **重写**(audit-playground-fix P0 #2 直接落入) |
| `detect.mjs`                       | `engine/auto-pick.spec.ts`                   | **重写**                                      |
| `easing.mjs`                       | `core/curves.spec.ts`                        | **重写**                                      |
| `validation.mjs`                   | `engine/bitmap.spec.ts`                      | **重写**                                      |
| `esm-load.mjs`                     | **保留**为冒烟,不进单测                      | **保留**(测 dist 产物,Vitest 不跑 dist)       |
| `auto-pick.mjs`                    | `engine/auto-pick.spec.ts`                   | **重写**                                      |
| `usability.mjs`                    | **保留**(人工)                               | **保留**                                      |

#### 3.1.7 落地步骤(具体到路径 + script)

1. **新增依赖**(commit 单独发):`vitest@^2.1` `@vitest/coverage-v8@^2.1` `happy-dom@^15`
2. **新增** `vitest.config.ts`(根):`environment: 'happy-dom'` + `coverage: { provider: 'v8', reporter: ['text','lcov'] }`
3. **新增** `test/unit/setup.ts` + 上述目录树骨架(每个 spec 文件先 stub)
4. **迁移** A 档 8 个 → B 档 11 个探针到对应 spec(顺序见 §7)
5. **新增 scripts**:
   - `"test:unit": "vitest run"`
   - `"test:unit:watch": "vitest"`
   - `"test:unit:coverage": "vitest run --coverage"`
6. **CI gate**(见 §6)

---

### 3.2 维度二:E2E 浏览器测试(Playwright Test)

#### 3.2.1 目标

在真浏览器里跑 `site/PlaygroundPage.vue` + `useMatrixRain.ts` + `site/public/atlas/`,覆盖:页面加载、5 主题切换、Playground 控件(滑块/下拉/按钮)、dispose 路径、错误兜底。**E2E 只验交互与契约,不验像素**(像素走 §3.3)。

#### 3.2.2 工具与版本

| 包                            | 版本    | 作用                                                                   |
| ----------------------------- | ------- | ---------------------------------------------------------------------- |
| `@playwright/test`            | ^1.48.x | runner + assertion + trace                                             |
| `@playwright/experimental-ct` | 不引入  | Vue 测试用 `@vue/test-utils` 即可,e2e 不需要                           |
| `axe-playwright`              | ^4.x    | 顺手挂 a11y,见 `docs/audits/a11y-deep-audit-2026-06-08.md`(主目录已有) |

> 用户机器已留 `.playwright-cli/` 痕迹,说明 Playwright 已安装过;CI 全新装需要 `npx playwright install --with-deps chromium`。

#### 3.2.3 目录结构

```
test/e2e/
├── playwright.config.ts              # baseURL=http://localhost:4173, webServer 自动 npm run deploy:serve
├── fixtures/
│   ├── site-fixture.ts                # 自定义 test fixture: 预热 site preview server + 注入 atlas
│   └── console-capture.ts             # 收集 page.on('console') 错误,失败时 attach
├── pages/
│   ├── playground.page.ts             # Page Object: themeSelect/densitySlider/charGapSlider/...
│   └── home.page.ts
├── specs/
│   ├── smoke.spec.ts                  # 1. 加载 → canvas 出现 → onReady 触发
│   ├── playground.theme-switch.spec.ts # 2. 5 主题切换不闪退,主题名一致
│   ├── playground.controls.spec.ts    # 3. 控件交互:density/fontSize/charGap/speed
│   ├── playground.dispose.spec.ts     # 4. 路由跳走 → RAF 清空 → console 无错
│   ├── playground.atlas-load.spec.ts  # 5. atlas 资源 200,WebGL renderer 不退化到 canvas2d
│   ├── playground.error.spec.ts       # 6. 注入 GL_INVALID_OPERATION → onError toast 出现
│   ├── accessibility.spec.ts          # 7. axe 扫描 + 键盘可达性
│   └── visual-journey.spec.ts         # 8. 控件拖动截图(留作对比基线,见 §3.3)
├── screenshots/                       # 截图产物(不入 git,见 §3.3.5)
└── README.md
```

#### 3.2.4 测试用例清单

**A. 冒烟(`smoke.spec.ts`)**

| Case                            | 描述                                        | 关键断言            |
| ------------------------------- | ------------------------------------------- | ------------------- |
| `smoke.home_loads_with_canvas`  | 访问 `/`,首屏 1 s 内出现 `<canvas>`         | locator visible     |
| `smoke.console_clean_on_load`   | 加载完成 console 无 error 级                | 自定义 fixture 收集 |
| `smoke.onReady_fires_within_2s` | `window.__matrixRainReady === true` 2 s 内  | pollUntil           |
| `smoke.atlas_assets_200`        | `site/public/atlas/*.json` + `*.png` 全 200 | request fixture     |

**B. 主题切换(`playground.theme-switch.spec.ts`)**

| Case                                  | 描述                            |
| ------------------------------------- | ------------------------------- |
| `theme.all_5_switchable`              | 5 主题依次切换,canvas 不闪退    |
| `theme.switch_persists_across_reload` | localStorage 持久化(若产品承诺) |
| `theme.invalid_url_param_falls_back`  | `?theme=banana` 回退 default    |
| `theme.switch_resets_easing_state`    | 切换瞬间无半透明鬼影            |

**C. 控件交互(`playground.controls.spec.ts`)**

| Case                                  | 描述                                                            |
| ------------------------------------- | --------------------------------------------------------------- |
| `control.density_slider_respects_min` | density 滑到 0 时引擎不爆,[[feedback_min_font_size]] 同步保 4px |
| `control.fontSize_slider_clamps_to_4` | 拖到 2,实际值仍 4(README 契约)                                  |
| `control.charGap_slider_boundary`     | -10 / +20 / NaN 输入均不破                                      |
| `control.speed_slider_smooth`         | 1× → 4× 不应掉帧到 < 30 fps                                     |
| `control.target_bitmap_upload`        | 上传小图 → 收敛动画出现                                         |

**D. 释放路径(`playground.dispose.spec.ts`)**

| Case                               | 描述                                                         |
| ---------------------------------- | ------------------------------------------------------------ |
| `dispose.route_change_clears_raf`  | PlayGround → Home 路由切换后,RAF 队列 0                      |
| `dispose.unmount_no_console_error` | 组件卸载后 console.error 计数 == 0                           |
| `dispose.repeated_mount_unmount`   | 连续 5 次 mount/unmount 无内存增长 > 5 MB(Heapsnapshot 比对) |

**E. Atlas / 资源(`playground.atlas-load.spec.ts`)**

| Case                            | 描述                                                              |
| ------------------------------- | ----------------------------------------------------------------- |
| `atlas.webgl_loads_real_atlas`  | WebGL renderer 选中时,`gl.getParameter` 查 atlas texture 实际绑定 |
| `atlas.fallback_when_atlas_404` | 模拟 atlas 404,引擎降级到 canvas2d 并 warn                        |
| `atlas.cross_origin_works`      | 不带 `crossorigin` 的 atlas 也能跑(CORS 测试)                     |

**F. 错误兜底(`playground.error.spec.ts`)**

| Case                                       | 描述                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `error.gl_invalid_op_shows_toast`          | 注入 GL error,UI 显示降级提示                                              |
| `error.bitmap_target_zero_cols_no_swallow` | **audit-playground-fix P0 #2 回归**:rows=0 必须 throw,不被 console.warn 吞 |
| `error.engine_throws_on_reinit`            | 已运行实例再 start → throw                                                 |

**G. 可访问性(`accessibility.spec.ts`)**

| Case                             | 描述                            |
| -------------------------------- | ------------------------------- |
| `a11y.axe_no_critical_violation` | axe 扫描,critical = 0           |
| `a11y.keyboard_tab_order`        | Tab 顺序覆盖所有控件            |
| `a11y.aria_labels_present`       | 滑块有 aria-label/aria-valuenow |

**H. 视觉旅程(`visual-journey.spec.ts`)**

| Case                                | 描述                                                |
| ----------------------------------- | --------------------------------------------------- |
| `journey.record_5themes_x_3devices` | 输出截图到 `screenshots/journey-*.png`,留 §3.3 比对 |

#### 3.2.5 通过标准

| 项             | 阈值                                                       |
| -------------- | ---------------------------------------------------------- |
| 用例数         | ≥ 35(覆盖 5 主题 × 7 控件 + 7 类错误 + 3 类 a11y)          |
| 总耗时         | < 4 min(默认串行;webServer 预热 1 次)                      |
| flakiness 预算 | 30 天内 < 2% 重试率(trace 自带 video)                      |
| 失败附件       | 必含 `trace.zip` + `console.log` + 失败时 DOM snapshot     |
| 控制台错误     | 整个 suite 内 console.error/warn 计数 == 0(白名单单独登记) |

#### 3.2.6 与现有探针的关系

| 旧资产                                    | 新归宿                                                    | 关系                                                           |
| ----------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `scripts/e2e-demos.py`(Python Playwright) | `test/e2e/specs/smoke.spec.ts` + `visual-journey.spec.ts` | **已删除(2026-07)** · Python 探针完全下线,新写 Playwright spec |
| `test/e2e-screenshots.mjs`(Node 截图)     | `visual-journey.spec.ts`                                  | **重写**                                                       |
| `test/usability.mjs`                      | `accessibility.spec.ts` 自动化部分                        | **拆分**:可机测的入 Playwright,主观项保留人工 checklist        |

#### 3.2.7 落地步骤

1. **新增依赖**:`@playwright/test@^1.48` `@playwright/experimental-ct`(暂不引入)`axe-playwright@^4`
2. **新增** `test/e2e/playwright.config.ts`:webServer 调 `npm run deploy:serve`(主目录已有脚本)
3. **新建** 上述目录骨架
4. **CI 装 Chromium**:`npx playwright install --with-deps chromium`(见 §6)
5. **新增 scripts**:
   - `"test:e2e": "playwright test"`
   - `"test:e2e:ui": "playwright test --ui"`
   - `"test:e2e:debug": "playwright test --debug"`
   - `"test:e2e:headed": "playwright test --headed"`(本地用)

---

### 3.3 维度三:视觉/像素回归(Playwright + pixelmatch)

#### 3.3.1 目标

把 `test/renderer-pixel.mjs` + `test/fixtures/pixel-demo.html` 从 Phase 1 原型升格成正式方案。覆盖 **canvas2d / webgl / webgpu** 三个 renderer 的 `charGap` / `atlas` / `image-converge` / `noise-converge` / `theme-transition` 像素基线,**按 renderer 分档阈值**。

#### 3.3.2 工具与版本

| 包                                   | 版本    | 作用                                                  |
| ------------------------------------ | ------- | ----------------------------------------------------- |
| `@playwright/test`                   | ^1.48   | 复用 §3.2,加 project: `pixel`                         |
| `pixelmatch`                         | ^6.x    | 像素对比,纯 JS,无原生依赖                             |
| `pngjs`                              | ^7.x    | PNG 编解码                                            |
| `sharp`                              | ^0.33.x | 高效 resize / format convert(基线更新时用,对比时不用) |
| `@types/pixelmatch` / `@types/pngjs` | latest  | TS 类型                                               |

> 不选 resemble.js:API 类似 pixelmatch,但 WebGL 浮点误差场景误报率更高。
> 不选 odiff(纯 Rust):启动慢、不易嵌入 Playwright 报告。

#### 3.3.3 阈值表(按 renderer 分档)

> [[feedback_visual_verification_untrusted]] 强调"看着对"≠"真对",所以阈值必须分档而不是一刀切。

| Renderer                      | 匹配像素率阈值   | 单像素灰度容差 | 备注                              |
| ----------------------------- | ---------------- | -------------- | --------------------------------- |
| **canvas2d**(基准)            | 100%(reference)  | n/a            | 任何 case 的 ground truth         |
| **webgl**                     | ≥ 95%            | ≤ 5/255        | 允许 ATI/Intel 浮点漂移           |
| **webgpu**                    | ≥ 92%            | ≤ 8/255        | 浮点 buffer 更大漂移;原子操作尤甚 |
| **theme-transition**(跨主题)  | ≥ 85%(前 250 ms) | n/a            | 过渡动画本身非像素稳定            |
| **image-converge**(t≥3000 ms) | ≥ 95%            | ≤ 5/255        | 收敛后稳定帧                      |
| **noise-converge**(t≥2000 ms) | ≥ 90%            | ≤ 10/255       | 噪声图本身像素级抖动              |

> 任意 case `gl.getError() !== 0` → 直接 P0 失败,不入像素对比。

#### 3.3.4 目录结构

```
test/pixel/
├── playwright.config.ts              # 复用根配置,新加 project: { name: 'pixel', testDir: './specs' }
├── helpers/
│   ├── capture.ts                     # page.screenshot({ clip: canvas bounding box }) → PNG buffer
│   ├── compare.ts                     # pixelmatch(actual, baseline, diff, options) → { mismatched, ratio }
│   ├── baselines.ts                   # 读 test/baselines/${case}.png,缓存 LFS 文件
│   ├── gl-error-guard.ts              # 在 page context 内注入 hook: window.__glErrorCount
│   └── report.ts                      # 输出 Markdown 报告 → docs/pixel-diff-YYYY-MM-DD.md
├── fixtures/
│   └── pixel-harness.html             # 升级自 test/fixtures/pixel-demo.html
├── specs/
│   ├── charGap.canvas2d.spec.ts
│   ├── charGap.webgl.spec.ts
│   ├── charGap.webgpu.spec.ts
│   ├── atlas.canvas2d.spec.ts
│   ├── atlas.webgl.spec.ts
│   ├── atlas.webgpu.spec.ts
│   ├── image-converge.all.spec.ts     # 跨 3 renderer,使用 image-converge.mjs 探针的场景
│   ├── noise-converge.all.spec.ts
│   └── theme-transition.all.spec.ts
├── baselines/                        # 入 git LFS,文件名 = case 名
│   ├── charGap-0.canvas2d.png
│   ├── charGap-0.webgl.png
│   ├── ...
│   └── README.md                     # 如何用 npm run pixel:update 更新基线
└── diff/                             # 产物,不入 git
```

#### 3.3.5 基线管理

| 事项        | 决策                                                                                 |
| ----------- | ------------------------------------------------------------------------------------ |
| 存储        | `test/pixel/baselines/*.png`,Git LFS(`*.png lfs`)                                    |
| 更新方式    | `npm run pixel:update -- --case=charGap-0`(重写 1 张)/ `npm run pixel:update`(全量)  |
| 准入门槛    | 仅 maintainer 推送时自动触发 `pixel:update`,PR 必须显示"基线未变或被审查"            |
| 准入 review | baseline 改动必须 commit message 含 `[pixel-update]` 前缀,触发 CODEOWNERS 复核       |
| 过期清理    | 季度清理:case 删除超过 90 天无引用的 baseline(脚本 `scripts/clean-baselines.mjs`)    |
| 版本标签    | 基线文件名含 renderer + 参数指纹(如 `charGap-2.atlas-v3.theme-green.png`),不靠时间戳 |

#### 3.3.6 测试用例清单

| Case                                   | 描述                                                             | Renderer 阈值                            |
| -------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `charGap-0`                            | 默认字符间距(等价旧基线)                                         | canvas2d 100% · webgl ≥97% · webgpu ≥95% |
| `charGap-2`                            | 字到字更紧                                                       | 同上(差 ≤1%)                             |
| `charGap--2`                           | 字符重叠                                                         | 同上                                     |
| `atlas-load-default`                   | atlas 正常加载首屏                                               | canvas2d 100% · webgl ≥95%               |
| `atlas-missing-fallback`               | atlas 404 → 退化                                                 | canvas2d 100% · webgl ≥90%(退化文本更稀) |
| `image-converge.target=heart`          | 收敛到目标图,稳定后                                              | ≥95%                                     |
| `noise-converge.iteration-500`         | 噪声迭代到 500 步                                                | ≥90%                                     |
| `theme-transition.green→red.t=250ms`   | 主题过渡中                                                       | ≥85%                                     |
| `theme-transition.green→red.t=600ms`   | 过渡结束                                                         | ≥97%                                     |
| `audit-playground-fix.setDensity_loop` | **回归 audit-playground-fix P0 #1**:60 帧无 buildGrid → 像素不变 | canvas2d 100%                            |
| `audit-playground-fix.target_zero`     | **回归 audit-playground-fix P0 #2**:rows=0 占位 bitmap 不被渲染  | canvas2d 100%                            |

#### 3.3.7 通过标准

| 项          | 阈值                                                      |
| ----------- | --------------------------------------------------------- |
| 用例数      | ≥ 30(10 场景 × 3 renderer 不全乘,部分 case 不跨 renderer) |
| 总耗时      | < 3 min                                                   |
| gl.getError | 全程 0(`__glErrorCount` === 0)                            |
| 像素匹配率  | 见 §3.3.3 表                                              |
| 报告产出    | `docs/pixel-diff-YYYY-MM-DD.md`(失败时)+ JUnit XML(CI 用) |

#### 3.3.8 与现有探针的关系

| 旧探针                               | 新归宿                                                | 关系                                 |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------ |
| `test/renderer-pixel.mjs`            | `test/pixel/specs/*.spec.ts`                          | **重写**                             |
| `test/fixtures/pixel-demo.html`      | `test/pixel/fixtures/pixel-harness.html`              | **重写**(模板化参数注入)             |
| `test/renderer-webgl.mjs`            | `specs/atlas.webgl.spec.ts` + `charGap.webgl.spec.ts` | **拆分**:健康检查入 §3.1,渲染入 §3.3 |
| `test/renderer-webgpu.mjs`           | 同上 webgpu 版本                                      | **拆分**                             |
| `test/atlas-load.mjs`                | `specs/atlas.*.spec.ts`                               | **重写**                             |
| `test/image-converge.mjs`            | `specs/image-converge.all.spec.ts`                    | **重写**                             |
| `test/noise-converge.mjs`            | `specs/noise-converge.all.spec.ts`                    | **重写**                             |
| `test/transitions.mjs`(主题过渡部分) | `specs/theme-transition.all.spec.ts`                  | **拆分**:事件契约入 §3.1,像素入 §3.3 |

#### 3.3.9 落地步骤

1. **新增依赖**:`pixelmatch@^6` `pngjs@^7` `sharp@^0.33` `@types/pixelmatch` `@types/pngjs`
2. **新增** `test/pixel/` 树 + `playwright.config.ts`(复用根配置 + project 子集)
3. **升级** `pixel-harness.html` 模板,接收 URL params 选择 renderer/theme/charGap/case
4. **录制首批基线**:`npm run pixel:update`(在 reviewer 屏幕 + Chrome 131 stable 本地)
5. **LFS 初始化**:`git lfs track "test/pixel/baselines/*.png"` + `.gitattributes`
6. **新增 scripts**:
   - `"test:pixel": "playwright test --project=pixel"`
   - `"pixel:update": "playwright test --project=pixel --update-snapshots"`(命名适配)
   - `"pixel:report": "node scripts/render-pixel-report.mjs"`(把 JUnit 转 Markdown)

---

### 3.4 维度四:性能 / 包体积(Vitest bench + size-limit + 真 gzip)

#### 3.4.1 目标

把 `scripts/build-size.mjs`(手工 gzip) + `scripts/bench-renderer.mjs`(手动计时)升级为 **CI 可 fail** 的两套工具:**size-limit**(体积)+ **Vitest bench**(FPS/FPS 抖动)。既给单 commit 反馈,也对齐 [[feedback_audit_pattern]] 的"真 gzip 数字 + P0/P1/P2"格式。

#### 3.4.2 工具与版本

| 包                         | 版本   | 作用                                        |
| -------------------------- | ------ | ------------------------------------------- |
| `size-limit`               | ^11.x  | 真实 gzip 后字节数 + ESM/CJS 分产物阈值     |
| `@size-limit/preset-app`   | latest | size-limit preset                           |
| `vitest`(已有)             | ^2.1   | 启用 `--bench` 模式                         |
| `mitata`(可选)             | ^0.1.x | 更细粒度 bench runner(若 Vitest bench 不够) |
| `vitest --typebench`(实验) | 不用   | 弃用,选 mitata                              |

> 不选 benchmark.js:老牌但无统计 warmup/noise。
> 不选 tinybench:API 类似 mitata,但 commit 数不如 mitata,生态更新慢。

#### 3.4.3 阈值与基线

| 指标                                | 阈值                 | 备注                      |
| ----------------------------------- | -------------------- | ------------------------- |
| ESM gzipped(`dist/index.js`)        | ≤ 30 KB(当前 ~25 KB) | 警戒 32 KB,P1;超 35 KB,P0 |
| CJS gzipped(`dist/index.cjs`)       | ≤ 30 KB              | 同上                      |
| UMD gzipped(`dist/index.umd.js`)    | ≤ 35 KB              | UMD 含 polyfill,稍宽      |
| CSS gzipped(`dist/matrix-rain.css`) | ≤ 5 KB               | 当前 ~3 KB                |
| Atlas 单 PNG                        | ≤ 80 KB/字符         | 已存在                    |
| FPS p50(canvas2d,1080p,density=0.5) | ≥ 58                 | 当前 ~60                  |
| FPS p95                             | ≥ 50                 | 当前 ~52                  |
| FPS p50(webgl,1080p)                | ≥ 58                 | 当前 ~60                  |
| FPS p50(webgpu,1080p)               | ≥ 56                 | WebGPU buffer 略慢        |
| 冷启动 → onReady                    | ≤ 1500 ms            | 包含 atlas 加载           |
| GC pause p95                        | ≤ 8 ms               | 防碎片化                  |
| 抖动(σ fps)                         | ≤ 2 fps              | 体感顺滑门槛              |

> **基线校准期**:第一次落地时,以 5 次本地跑取中位数为初始基线,PR 时与基线 diff。基线文件 `test/perf/baseline.json` 入 git。

#### 3.4.4 目录结构

```
test/perf/
├── benches/
│   ├── fps.canvas2d.bench.ts         # 1080p / 4K / 5 主题 / 4 变体,grid search
│   ├── fps.webgl.bench.ts
│   ├── fps.webgpu.bench.ts
│   ├── cold-start.bench.ts           # TTI / onReady / atlas 加载
│   ├── memory-leak.bench.ts          # 持续运行 10 分钟,堆增长 < 5 MB
│   └── setter-apply.bench.ts         # 调 1000 次 setDensity,setTheme,setCharGap
├── baseline.json                     # git LFS-free,小文件
├── harness/
│   ├── renderer-harness.ts           # 统一创建 engine,预热 60 帧后开始采样
│   ├── fps-sampler.ts                # 每 100 ms 采一次 FPS,出 p50/p95/σ
│   └── stats.ts                      # 输出中位数 / 置信区间
└── report.ts                         # 输出 Markdown + JUnit
```

#### 3.4.5 包体积(`size-limit` 配置)

```text
# .size-limit.json(伪配置,非可运行)
[
  { "name": "ESM",      "path": "dist/index.js",          "limit": "30 KB", "gzip": true },
  { "name": "CJS",      "path": "dist/index.cjs",         "limit": "30 KB", "gzip": true },
  { "name": "UMD",      "path": "dist/index.umd.js",      "limit": "35 KB", "gzip": true },
  { "name": "CSS",      "path": "dist/matrix-rain.css",   "limit": "5 KB",  "gzip": true },
  { "name": "themes",   "path": "dist/themes.js",         "limit": "8 KB",  "gzip": true },
  { "name": "core",     "path": "dist/core.js",           "limit": "12 KB", "gzip": true }
]
```

> 阈值匹配 [[feedback_audit_pattern]] 的"真 gzip 数字",不再人工数。

#### 3.4.6 测试用例清单(伪 `bench()` 标识符)

| Case                                | 描述                                     | 阈值               |
| ----------------------------------- | ---------------------------------------- | ------------------ |
| `fps.canvas2d.1080p.matrix.green`   | 默认场景                                 | p50 ≥ 58, p95 ≥ 50 |
| `fps.canvas2d.4K.matrix.gold`       | 4K 高负载                                | p50 ≥ 30           |
| `fps.webgl.1080p.matrix.purple`     | WebGL 默认                               | p50 ≥ 58           |
| `fps.webgl.1080p.atlas-loaded`      | atlas 加载后                             | p50 ≥ 58           |
| `fps.webgpu.1080p.matrix.blue`      | WebGPU                                   | p50 ≥ 56           |
| `fps.webgpu.atlas-missing`          | 退化路径不掉到 30 以下                   | p50 ≥ 40           |
| `fps.all_renderers.cross_theme`     | 5 主题 × 3 renderer = 15 case            | 全过               |
| `cold-start.atlas-cached`           | 二次进入                                 | ≤ 500 ms           |
| `cold-start.atlas-cold`             | 首次进入                                 | ≤ 1500 ms          |
| `memory-leak.10min_run`             | 长跑,堆增长                              | < 5 MB             |
| `setter-apply.setDensity_x1000`     | 高频 setter                              | 单次 < 0.5 ms      |
| `setter-apply.setTheme_x1000`       | 同上                                     | 单次 < 0.3 ms      |
| `setter-apply.setCharGap_x1000`     | 含 [[feedback_min_font_size]] clamp 路径 | 单次 < 0.5 ms      |
| `gc-pause.p95`                      | GC 长尾                                  | < 8 ms             |
| `build-atlas.cold`                  | 全字符集 atlas 构建                      | < 30 s             |
| `audit-baseline.no_perf_regression` | 与 baseline.json 比对,阈值表 §3.4.3      |

#### 3.4.7 通过标准 + P0/P1/P2 分级(对齐 [[feedback_audit_pattern]])

| 等级   | 触发条件                                                                                | CI 行为                             |
| ------ | --------------------------------------------------------------------------------------- | ----------------------------------- |
| **P0** | 任一指标 > 50% 回归 · 体积 > 35 KB · FPS p50 跌穿 50 · onReady > 3 s · gl.getError 非零 | fail,block merge                    |
| **P1** | 20–50% 回归 · 体积 > 32 KB · FPS p95 < 45                                               | warn,block merge,需 maintainer 复核 |
| **P2** | 10–20% 回归 · σ FPS > 2 · GC pause p95 > 6 ms                                           | warn,不 block                       |

> 回归 % 算法:`(new - baseline) / baseline`,正数=变慢,负数=变快。
> 任何 P0 都自动生成 issue,标题 `perf-regression: <case> <delta>`。

#### 3.4.8 与现有脚本的关系

| 旧资产                         | 新归宿                                                      | 关系                               |
| ------------------------------ | ----------------------------------------------------------- | ---------------------------------- |
| `scripts/build-size.mjs`       | `.size-limit.json` + `npm run size`                         | **替换**                           |
| `scripts/bench-renderer.mjs`   | `test/perf/benches/fps.*.bench.ts`                          | **替换**                           |
| `audit-performance.md`         | **保留**为历史报告,新发现入 `docs/perf-audit-YYYY-MM-DD.md` | **共存**:脚本产出数据,文档产出解读 |
| `bench-results-*.json`(主目录) | `test/perf/baseline.json` + 每次 PR 临时 json               | **迁移**:旧 json 归档              |

#### 3.4.9 落地步骤

1. **新增依赖**:`size-limit@^11` `@size-limit/preset-app`
2. **新增** `.size-limit.json`
3. **新增** `test/perf/` 树 + bench 文件
4. **录制 baseline**:`npm run perf:bench -- --save-baseline`
5. **新增 scripts**:
   - `"size": "size-limit"`
   - `"perf:bench": "vitest bench --run"`
   - `"perf:bench:update": "vitest bench --run --update-baseline"`
   - `"perf:report": "node scripts/render-perf-report.mjs"`

---

## 4. 目录结构总览

```
matrix-rain-package/
├── src/                              # 既有,不变
│   ├── engine/
│   │   ├── setters.ts
│   │   ├── state.ts
│   │   └── draw-helpers.ts
│   ├── renderer/
│   │   ├── canvas2d-renderer.ts
│   │   ├── webgl-renderer.ts
│   │   ├── webgl-shaders.ts
│   │   ├── webgpu-renderer.ts
│   │   ├── webgpu-shaders.ts
│   │   ├── atlas-loader.ts
│   │   ├── auto-pick.ts
│   │   └── health.ts
│   └── ...
├── test/                             # 既有 + 新
│   ├── *.mjs                         # 既有 31 个探针(保留窗口期)
│   ├── fixtures/                     # 既有
│   ├── unit/                         # 新
│   │   ├── engine/
│   │   ├── themes/
│   │   ├── core/
│   │   ├── fixtures/
│   │   └── setup.ts
│   ├── e2e/                          # 新
│   │   ├── playwright.config.ts
│   │   ├── fixtures/
│   │   ├── pages/
│   │   ├── specs/
│   │   └── screenshots/
│   ├── pixel/                        # 新
│   │   ├── playwright.config.ts
│   │   ├── helpers/
│   │   ├── fixtures/
│   │   ├── specs/
│   │   ├── baselines/                # LFS
│   │   └── diff/
│   └── perf/                         # 新
│       ├── benches/
│       ├── harness/
│       ├── baseline.json
│       └── report.ts
├── scripts/                          # 既有 + 增量
│   ├── build-size.mjs                # 既有,过渡期保留
│   ├── bench-renderer.mjs            # 既有,过渡期保留
│   ├── build-atlas.mjs               # 既有
│   ├── copy-site-assets.mjs          # 既有
│   ├── render-pixel-report.mjs       # 新
│   ├── render-perf-report.mjs        # 新
│   └── clean-baselines.mjs           # 新
├── docs/                             # 既有(主目录丰富,worktree 仅有本文件)
│   ├── test-strategy.md              # 本文档
│   ├── A11Y-AUDIT-2026-06-08.md      # 主目录既有
│   ├── atlas-format.md               # 主目录既有
│   ├── audit-*.md                    # 主目录既有
│   ├── perf-audit-YYYY-MM-DD.md      # 新(每次 perf fail)
│   ├── pixel-diff-YYYY-MM-DD.md      # 新(每次像素 fail)
│   └── ...
├── site/                             # 既有
├── types/                            # 既有
├── .size-limit.json                  # 新
├── .gitattributes                    # 新(LFS)
├── vitest.config.ts                  # 新
├── tsconfig.json                     # 既有
└── package.json                      # 既有 + scripts 接入
```

---

## 5. package.json scripts 接入方案

> 新增部分,既有 `test:*` 全部保留并加 `// @deprecated` 注释。

```text
// package.json scripts 节选(伪,非可运行)
{
  "scripts": {
    /* ===== 既有,不删 ===== */
    "test":                  "node test/smoke.mjs && node test/leak.mjs && ..." /* 既有 25 行 && */
    "test:smoke":            "node test/smoke.mjs",
    /* ... 25 个旧探针全部保留 ... */

    /* ===== 新增 ===== */
    "test:unit":             "vitest run",
    "test:unit:watch":       "vitest",
    "test:unit:coverage":    "vitest run --coverage",

    "test:e2e":              "playwright test --project=e2e",
    "test:e2e:ui":           "playwright test --project=e2e --ui",
    "test:e2e:debug":        "playwright test --project=e2e --debug",
    "test:e2e:headed":       "playwright test --project=e2e --headed",

    "test:pixel":            "playwright test --project=pixel",
    "pixel:update":          "playwright test --project=pixel --update-snapshots",
    "pixel:report":          "node scripts/render-pixel-report.mjs",

    "size":                  "size-limit",
    "perf:bench":            "vitest bench --run",
    "perf:bench:update":     "vitest bench --run --update-baseline",
    "perf:report":           "node scripts/render-perf-report.mjs",

    "test:all":              "npm run test:unit && npm run size && npm run test:pixel && npm run test:e2e && npm run perf:bench",
    "test:all:no-perf":      "npm run test:unit && npm run size && npm run test:pixel && npm run test:e2e",
    "test:ci":               "npm run test:all"   // 给 GitHub Actions 用
  }
}
```

> `test:all` 是 §6 CI 默认入口。`test:ci` 别名供历史 commit message 兼容。
> 旧 `test` 入口保留,带 deprecation banner,2026 Q3 移除。

---

## 6. CI 接入(GitHub Actions 骨架)

> 完整可粘贴 YAML,放 `.github/workflows/test.yml`。

```yaml
name: test
on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  unit:
    name: unit (vitest)
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with: { lfs: true }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - run: npm run test:unit
      - run: npm run test:unit:coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  size:
    name: bundle size (size-limit)
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - run: npm run size

  pixel:
    name: pixel regression (playwright)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with: { lfs: true }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:pixel
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: pixel-diff
          path: test/pixel/diff/

  e2e:
    name: e2e (playwright site)
    runs-on: ubuntu-latest
    timeout-minutes: 12
    steps:
      - uses: actions/checkout@v4
        with: { lfs: true }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - run: npm ci
      - run: cd site && pnpm install --prefer-offline
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: e2e-trace
          path: test/e2e/test-results/

  perf:
    name: perf (vitest bench)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with: { lfs: true }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - run: npm run perf:bench
      - run: npm run perf:report
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: perf-report
          path: docs/perf-audit-*.md

  audit-baseline-drift:
    name: audit baseline drift
    runs-on: ubuntu-latest
    timeout-minutes: 5
    needs: [unit, size, pixel, e2e, perf]
    if: always()
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: node scripts/check-baseline-drift.mjs
      - uses: github-script@v7
        with:
          script: |
            const status = '${{ needs.pixel.result }}';
            if (status !== 'success') {
              core.setFailed('pixel regression detected, see artifact');
            }
```

**关键决策**:

| 项                   | 决策                                              | 理由                                        |
| -------------------- | ------------------------------------------------- | ------------------------------------------- |
| 五 job 拆分          | unit / size / pixel / e2e / perf                  | 失败时定位快,artifact 隔离                  |
| 不矩阵化浏览器       | 只 Chromium                                       | webgl/webgpu 跨浏览器易假阳,先稳定 Chromium |
| webServer            | `npm run deploy:serve` 已有,workflow 内 inline 启 | 节省本地 CI 时间                            |
| lfs: true            | pixel baselines 必须                              | 防 baseline 缺图                            |
| concurrency 取消     | 同一 PR 新 push 取消旧 build                      | 省 CI 配额                                  |
| timeout 阶梯         | unit 5 / size 3 / pixel 10 / e2e 12 / perf 15     | 给单测快反馈,慢的容忍                       |
| audit-baseline-drift | 聚合 job,任一上游失败 → fail                      | 把单测/像素/perf 的"全绿"作为一个契约       |

---

## 7. 与现有 31 个 `test/*.mjs` 的迁移路线

### 7.1 分阶段

> 锚定 [[feedback_plan_structure]] 的"开发目标/最终需求审查/测试"三段。每个阶段交付前必须 self-review。

#### 阶段 0:基础设施(1 周)

| 交付                                                                                       | 验收                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 安装 Vitest + happy-dom + Playwright + size-limit                                          | `npm run test:unit -- --version` 等可执行 |
| 新建 `test/unit/` + `test/e2e/` + `test/pixel/` + `test/perf/` 空骨架                      | 目录存在,空 spec 通过                     |
| `vitest.config.ts` + `test/e2e/playwright.config.ts` + `.size-limit.json` 三个配置文件就位 | 各 runner --help 不报错                   |
| CI workflow 占位(只跑 unit + size)就位                                                     | PR 上能看到两个 job                       |

#### 阶段 1:API 单元迁移(2 周)

| 交付                                                                                                                                                            | 验收                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| A 档 8 探针全部迁完(`themes.mjs` `edge-cases.mjs` `set-target-bitmap-validation.mjs` `detect.mjs` `easing.mjs` `validation.mjs` `esm-load.mjs` `auto-pick.mjs`) | `npm run test:unit` 200+ case 全绿        |
| B 档 11 探针迁完(包含 charGap / fontSize clamp / theme-switch)                                                                                                  | 同上,[[feedback_min_font_size]] 100% 覆盖 |
| 旧探针加 `// @deprecated: 0.x.x 移除` banner                                                                                                                    | 源码 grep `deprecated` ≥ 11 处            |
| 行覆盖 ≥ 80%                                                                                                                                                    | `coverage/lcov.info` 数字满足             |

#### 阶段 2:像素基线(1.5 周)

| 交付                                                     | 验收                                              |
| -------------------------------------------------------- | ------------------------------------------------- | ----------- |
| `test/pixel/specs/charGap.*.spec.ts` 三个 renderer       | `npm run test:pixel` 全绿                         |
| `test/pixel/specs/atlas.*.spec.ts` 三个 renderer         | 同上                                              |
| `test/pixel/baselines/*.png` 入 LFS,baseline README 写完 | `git lfs ls-files                                 | wc -l` ≥ 30 |
| audit-playground-fix P0 × 2 case 落入回归                | `pixel:update` 后 commit 含 `[pixel-update]` 前缀 |

#### 阶段 3:E2E + 像素补完(2 周)

| 交付                                                                                         | 验收                                         |
| -------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `test/e2e/specs/smoke.spec.ts` + `playground.*.spec.ts`                                      | `npm run test:e2e` 全绿,trace 收集正常       |
| `image-converge.all.spec.ts` + `noise-converge.all.spec.ts` + `theme-transition.all.spec.ts` | 像素阈值按 §3.3.3 表                         |
| axe-playwright 接入                                                                          | `accessibility.spec.ts` critical = 0         |
| 旧 `scripts/e2e-demos.py` 已下线（2026-07）                                                  | commit `chore(cleanup): remove e2e-demos.py` |

#### 阶段 4:性能 + 体积(1 周)

| 交付                                                                         | 验收                               |
| ---------------------------------------------------------------------------- | ---------------------------------- |
| `.size-limit.json` 阈值就位                                                  | `npm run size` 全绿                |
| `test/perf/benches/fps.*.bench.ts` 跑通,baseline.json 录制                   | `npm run perf:bench` 输出 p50/p95  |
| `audit-baseline-drift` job 接入                                              | PR 上能看到 5 个 job 全绿          |
| `audit-performance.md` 旧基准数字归档,新 `perf-audit-YYYY-MM-DD.md` 模板就位 | docs/perf-audit-2026-XX-XX.md 存在 |

#### 阶段 5:清理 + 文档(1 周)

| 交付                                                                                                        | 验收                 |
| ----------------------------------------------------------------------------------------------------------- | -------------------- |
| 旧 `test/*.mjs` 中已迁移的 19 个加 `// @deprecated: 1.0.0 移除` banner,`npm run test` 入口更新为 `test:all` | grep deprecated ≥ 19 |
| 本文档同步章节"已落地探针清单"                                                                              | 文档与代码一致       |
| README.md "测试" 段更新,链接本设计文档                                                                      | README diff < 30 行  |

### 7.2 时间线(总览)

```text
Week 1       Week 2       Week 3       Week 4       Week 5       Week 6       Week 7
├───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼───────────┤
│  Stage 0  │  Stage 1   │  Stage 1   │  Stage 2   │  Stage 2   │  Stage 3   │  Stage 3  │
│  infra    │  unit A    │  unit B    │  pixel     │  pixel     │  e2e       │  e2e      │
│           │            │            │            │  baselines │            │           │
├───────────┴───────────┴───────────┼───────────┴───────────┼───────────┴───────────┤
                                    │  Stage 4 perf        │  Stage 5 cleanup      │
                                    │  + size-limit        │  + deprecation        │
                                    │  Week 7-8            │  Week 8-9             │
```

总周期 **8–9 周**。Stage 5 完成后,旧 19 个 `*.mjs` 进入 deprecated;再过 1 个 minor(0.9.x)后,删除。

### 7.3 阶段最终需求审查(每阶段必做,[[feedback_plan_structure]])

每阶段交付前:

1. **开发目标**:该阶段交付清单是否齐全
2. **最终需求审查**:阈值是否达成 / deprecation banner 是否加 / CI 是否绿
3. **测试**:新 case 自测通过 + 旧 `npm run test` 全绿 + audit 报告未退化

---

## 8. 验收清单(Definition of Done)

### 8.1 维度层

- [ ] **API 单测**:`npm run test:unit` 全绿,行覆盖 ≥ 85%,200+ case,[[feedback_min_font_size]] 100% 覆盖
- [ ] **E2E**:`npm run test:e2e` 全绿,console 0 错误,trace 完整
- [ ] **像素**:`npm run test:pixel` 全绿,`gl.getError === 0`,匹配率按 §3.3.3 表达标,baseline LFS 入库
- [ ] **性能 / 体积**:`npm run size` 全绿,`npm run perf:bench` p50/p95 ≥ 阈值,[[feedback_audit_pattern]] 风格报告产出

### 8.2 流程层

- [ ] **CI**:5 个 GitHub Actions job 全绿,artifact 上传正常
- [ ] **迁移路线**:阶段 0–5 全部交付,旧 19 个 `*.mjs` 标 deprecated
- [ ] **可重复**:同 commit 同 runner,像素匹配率波动 ≤ 0.5%(以 5 次本地跑中位数为基线)
- [ ] **速度**:unit < 30 s · pixel < 3 min · e2e < 4 min · perf < 5 min · size < 30 s

### 8.3 文档层

- [ ] `docs/test-strategy.md` 在 worktree 和主目录两处都有([[feedback_kanban_worktree_loss]])
- [ ] `docs/pixel-diff-YYYY-MM-DD.md` 模板就位
- [ ] `docs/perf-audit-YYYY-MM-DD.md` 模板就位
- [ ] README.md "测试" 段更新

### 8.4 治理层

- [ ] `pixel:update` 必须 maintainer 触发且 commit message 含 `[pixel-update]`
- [ ] `perf:bench:update` 同上,commit message 含 `[perf-baseline-update]`
- [ ] baseline 改动 CODEOWNERS 复核生效
- [ ] P0 perf 回归自动开 issue

---

## 9. 风险与未结论(对应 [[feedback_debug_depth_boundary]])

> 本节为"未结论"占位,不强行下结论。

| 风险                                                                              | 影响                     | 现状                                       | 后续动作                                                       |
| --------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------ | -------------------------------------------------------------- |
| WebGPU 在 Linux CI runner 上不可用                                                | 像素层丢 webgpu case     | GitHub Actions ubuntu-latest 默认无 WebGPU | 评估:用 `ubuntu-22.04` + dGPU runner / 或 skip webgpu 仅本地跑 |
| Playwright WebGL 浮点跨版本漂移                                                   | 像素 baseline 需频繁更新 | 未测真实漂移                               | Stage 2 落地时实测 5 次取波动区间                              |
| `site/public/atlas/` 资源在 CI 与本地路径不一致                                   | e2e 失败                 | `deploy:serve` 已处理                      | Stage 3 验证                                                   |
| Vitest bench 跨 OS 不可比                                                         | perf baseline 漂移       | 未实测                                     | Stage 4 锁定 runner OS                                         |
| happy-dom 与真浏览器 API 差异                                                     | 单元测试"全绿"但 e2e 红  | 已知 happy-dom canvas 是 stub              | Stage 1 完成前必须 e2e 烟测一次                                |
| size-limit 与 `sideEffects: ["**/*.css"]` 冲突                                    | CSS 体积误报             | 未验证                                     | Stage 0 末尾验证                                               |
| audit-playground-fix P0 #2 的"占位 bitmap"修复后,本设计文档的对应 case 是否还有效 | 回归 case 失效           | 当前 commit 未落地修复                     | 修复 PR 合入后,review 此 case 是否改写                         |

> 任何一项超过"2 处源码改动 + 30 分钟"未果,即按 [[feedback_debug_depth_boundary]] 转入"未结论",不强行写死。

---

## 10. 附录:case 数与工作量估算

| 维度        | case 数       | 估算工作量(人日) |
| ----------- | ------------- | ---------------- |
| API 单测    | ~210          | 10               |
| E2E         | ~35           | 6                |
| 像素        | ~30           | 5                |
| 性能 + 体积 | ~25           | 4                |
| CI + 文档   | n/a           | 3                |
| 迁移 + 清理 | n/a           | 3                |
| **合计**    | **~300 case** | **~31 人日**     |

---

## 11. 一句话总结

> **"Vitest 守契约,happy-dom 守接口,Playwright 守交互,pixelmatch 守像素,size-limit 守体重,Vitest bench 守心跳 —— 五维并立,旧探针渐进退役,直到 0.9.x 全部由现代测试栈接管。"**

---

_文档结束 · v1.0 · 2026-06-16 · 维护人:czhmisaka_
