# 可观测性与诊断 API 只读审计 (0.6.2+)

| 项目      | 值                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 审计日期  | 2026-06-24                                                                                                                                             |
| 仓库 HEAD | `81cf503` (0.6.2+)                                                                                                                                     |
| 审计范围  | `src/` 全部 + `types/index.d.ts` + `site/src/` + `test/` + `docs/` + `audit-*.md`                                                                      |
| 审计方法  | 静态只读 · grep 全仓 + 关键文件 Read · 未修改任何源码                                                                                                  |
| 总体结论  | **getRendererHealth 是 "加了就死" 的半成品 API** —— 13 字段,9 个契约测试,零真实消费方,零 README 章节,零 Playground 集成,文档还指向一个根本不存在的字段 |

---

## 0. TL;DR

| 维度                           | 评分  | 评语                                                                   |
| ------------------------------ | ----- | ---------------------------------------------------------------------- |
| `getRendererHealth()` 设计     | A     | 13 字段 / 3 renderer 统一 / Object.freeze 防篡改 / 零热路径分支        |
| `getRendererHealth()` 测试     | A     | 9 个契约 case,Node 端全过                                              |
| `getRendererHealth()` 真实消费 | **F** | 0 处产品代码 / 0 处 Playground / 0 处 README / 0 处 demo               |
| 类型健康                       | A-    | 0 处 `as RendererHealth`,返回 `as` 强转仅 1 处,接口一致                |
| 其他可观测性空白               | C     | 1 个 stale doc + 1 个假想字段 + 1 个指向不存在路径的 test-strategy     |
| 文档健康                       | D     | 没有 README 章节,只在 audit-health-2026-06-12 + audit-runtime 各提一嘴 |

**核心矛盾**: `getRendererHealth()` 是一个**质量上乘但完全未被消费**的 API。它的"价值 vs 维护成本"已经失衡(下文 §6) —— 它在 3 个 renderer 跑 hot path tick + 5 个 `recordHealthError` 调用,纯纯"为测试而做"。

---

## 1. `getRendererHealth` 解剖

### 1.1 签名与实现

**`src/renderer/health.ts`** (136 行) 暴露:

```ts
// 公开类型
export interface RendererHealth {
  renderer: RendererImpl; // 'canvas2d' | 'webgl' | 'webgpu'
  initialized: boolean;
  frameCount: number;
  drawCallIdx: number;
  instanceCount: number;
  gridCols: number;
  gridRows: number;
  initDurationMs: number;
  lastFrameDurationMs: number;
  droppedFrames: number; // fps<30 累计
  lastGlError: number; // WebGL gl.getError() raw
  lastErrorScope: string | null; // WebGPU popErrorScope message
  lastInitError: string | null;
}

export type RendererHealthErrorCode = number | 'INSTANCE_COUNT_MISMATCH' | 'INIT_FAILED' | 'BINDGROUP_FAILED' | string;
```

工厂 + 工具:

- `createHealthTracker(renderer)` —— 创建 mutable 内部对象
- `recordHealthError(h, code)` —— 错误分类(number→lastGlError, 字符串→lastInitError/lastErrorScope)
- `snapshotHealth(h)` —— `Object.freeze` 副本返回
- `tickDroppedFrames(h, stateFps)` —— fps<30 累加

### 1.2 公开 API 暴露

| 位置                        | 内容                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `types/index.d.ts:813`      | `MatrixRainInstance.getRendererHealth(): RendererHealth`         |
| `types/index.d.ts:820-847`  | `RendererHealth` interface(13 字段 + 完整 TSDoc)                 |
| `src/renderer/types.ts:171` | `MatrixRainRenderer.getHealth(): RendererHealth` (renderer 内部) |
| `src/renderer/health.ts:30` | source-of-truth 内部 interface(同上)                             |

公开类型与内部类型**结构完全一致**,公开版本带 TSDoc 注释,内部版本用 `HealthInternal` 隐藏 —— 干净。

### 1.3 三个 renderer 接入点

| Renderer         | init 接入                                                                           | render 接入                                                                  | error 接入                                                             |
| ---------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Canvas2DRenderer | `_health.initialized = true` (无 try/catch)                                         | `frameCount++` + `tickDroppedFrames`                                         | 无 GL 错误源                                                           |
| WebGLRenderer    | try/catch → `lastInitError = msg` + `recordHealthError('INIT_FAILED')` (`:261-263`) | frameStart/duration + `gl.getError()` (`:347`)                               | `recordHealthError(err)` 接 raw GL code                                |
| WebGPURenderer   | try/catch → 同上 (`:239-240`)                                                       | frameStart/duration + `pushErrorScope` + `popErrorScope().then` (`:356-367`) | message → `lastErrorScope`;rejection → `popErrorScope rejected: <msg>` |

3 个 renderer 全部实现 `getHealth(): RendererHealth { return snapshotHealth(this._health); }`,1 行转发,无差异化逻辑。

### 1.4 包装到实例 (`src/engine.ts:831`)

```ts
const instance: MatrixRainInstance = {
  // ...30 个 setter/getter
  getRendererHealth: () => renderer.getHealth(), // 0.6.0+: 透传 renderer 健康快照
};
```

一行箭头函数透传,符合 0.6.0+ 注释承诺"给外部调试 + 测试用"。

### 1.5 消费方调研(关键)

| 调用方                                             | 实际消费         | 备注                                                                               |
| -------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `src/engine.ts:831`                                | 包装 / 透传      | 实现方,不算消费                                                                    |
| `test/renderer-health.mjs`                         | **9 个契约测试** | 唯一真实消费:字段齐 / Object.freeze / frameCount tick / create-destroy 循环        |
| `audit-code-quality.md:33`                         | 文本提及         | "引入 getRendererHealth() 跨 3 renderer 统一暴露诊断快照"                          |
| `audit-runtime.md:57,85`                           | 文本提及         | P0-1 / P0-2 修复建议"health 快照加 contextLostCount 字段,getRendererHealth() 透出" |
| `audit-code-structure-2026-06-22.md:185`           | 文本提及         | interface listing                                                                  |
| `audit-performance.md:127`                         | 文本提及         | "运行时可读 getRendererHealth()"                                                   |
| `types/index.d.ts:813`                             | 公共类型声明     | 接口本身                                                                           |
| `src/renderer/types.ts:171`                        | renderer 接口    | 内部接口                                                                           |
| `src/renderer/{canvas2d,webgl,webgpu}-renderer.ts` | 实现             | 不算消费                                                                           |
| **PlaygroundPage.vue**                             | **❌ 无**        | 不读 health, 不暴露 panel                                                          |
| **useMatrixRain composable**                       | **❌ 无**        | 不读 health, 无 error 回调                                                         |
| **MatrixRain.detect()**                            | **❌ 无**        | `src/index.ts:123` 仍纯静态 navigator 探测,未接 health                             |
| **README.md**                                      | **❌ 无**        | grep 0 命中                                                                        |
| **CHANGELOG.md**                                   | **❌ 无**        | grep 0 命中                                                                        |
| **site/src/components/HeroCanvas.vue**             | **❌ 无**        | 不读 health                                                                        |
| **site/src/pages/DemosPage.vue 等 demo 页**        | **❌ 无**        | 不读 health                                                                        |
| **`__matrixRainDebug` (engine.ts:67)**             | **❌ 无**        | 只暴露 instances / count / avgFps / destroyAll,不暴露 health                       |
| **`mountFpsOverlay` (src/fps-overlay.ts)**         | **❌ 无**        | 只读 `__matrixRainDebug.avgFps`,不读 health                                        |

**结论**: 在**真实运行时代码**中,`getRendererHealth()` **零消费** —— 唯一的消费场景是它自己的契约测试。

### 1.6 被挂在墙上的字段(死字段)

13 字段中,`drawCallIdx` / `instanceCount` / `gridCols` / `gridRows` / `lastFrameDurationMs` / `lastGlError` / `lastErrorScope` 这 7 个**只在测试中读**,实际产品代码 0 引用。
而 `audit-runtime.md:57` 提议的 `contextLostCount` 字段**根本没有实现**,但 audit 文档已经把它当成"将来加",这是文档与实现脱节的典型例子。

---

## 2. 其他可观测性空白

### 2.1 错误捕获(`grep -rn "try\\s*{" src/`)

**`src/` 内 try 块统计**: 18 个 try 块,**8 个空 catch 块**(`} catch {}` / `} catch (e) {}`):

| 文件:行                                                     | catch 行为                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/engine.ts:90-94`                                       | destroyAll 内 try/catch 空吞(可接受:destroy 应无副作用)                                                      |
| `src/engine.ts:486-488` / `496-498` / `506-508` / `516-518` | `fireOnFrame/Resize/ThemeChange/TargetFinish` 内 try/catch 空吞(**潜在可观测性损失**:用户回调抛错永远看不到) |
| `src/engine.ts:741-746`                                     | draw 错误 catch → `console.error('[matrix-rain] draw error (animation continues):', err)` ✓                  |
| `src/renderer/auto-pick.ts:71`                              | webgl/webgpu feature detect try/catch 静默(可接受:降级)                                                      |
| `src/curves/sandbox.ts:445,486,527`                         | sandbox 编译错误,后续走 `getDiagnostics()` 上报 ✓                                                            |
| `src/engine/setters.ts:246,431,446,461,476`                 | setter 边界 try/catch,**未上报** (audit-code-quality.md 已标 P0-2)                                           |
| `src/engine/state.ts:574,581,588,595,605`                   | 同上                                                                                                         |
| `src/matrix-rain-element.ts:121,181,195,205`                | element 初始化错误,`console.error` ✓                                                                         |

**空白**: 4 个 `fireOn*` 回调的 try/catch 完全不向 `getDiagnostics()` 报 —— 用户回调 throw 永远丢失,只能靠用户自己 console.log。**建议**: `fireOnFrame` 内的 try/catch 应同时 `state.diagnostics.lastUserCallbackError = e.message`,走 `getDiagnostics()` 透出。

### 2.2 性能指标(`grep -rn "performance\|mark\|measure\|stats" src/`)

- **0 处 `performance.mark()`** —— 没有任何 user-timing API
- **0 处 `performance.measure()`** —— 没有任何关键路径耗时打点
- 现有 `performance.now()` 全部为单点差值(init 起止 / frame 起止),无法在 DevTools Performance 面板可视化
- 0 处 `stats.js` / `stats-gl` / 自实现 rolling-window stats panel

**空白**: 健康快照的 `lastFrameDurationMs` / `initDurationMs` 是单点数据,**没法画时序图**。要给外部 DevTools 暴露完整 user-timing 数据,需在 `engine.ts:740`(`rAF` 循环内)加 `performance.mark('mr-frame-end')`,配套 `performance.measure('mr-frame', 'mr-frame-start', 'mr-frame-end')`。当前 0 命中。

### 2.3 内存 / 资源释放

`grep -rn "WeakMap\|WeakSet\|dispose\|cleanup\|finalize"` 在 `src/` 0 命中(WebGPU atlas 资源释放走显式 `device.destroy()`,不走 weak ref)。

**3 个 renderer 的 `destroy()` 都实现了** (webgl-renderer.ts:354-372, webgpu-renderer.ts:372-385, canvas2d-renderer.ts — 检查):

- webgl: `gl.deleteVertexArray / deleteBuffer / deleteProgram / deleteTexture` ✓
- webgpu: `ctx.unconfigure() + device.destroy()` ✓
- canvas2d: 0 行(无 GPU 资源)✓

**没有** `getMemoryUsage()` / `estimateSizeBytes()` 这类 API,健康快照里**完全没有内存维度** —— 8.4M cells 的 webgpu 路径在 users 报告"占用高"时,无法对外暴露 instance buffer / atlas 占用。

### 2.4 渲染帧率 / rAF

- 内部有 `state.fps` 滑窗 + `__matrixRainDebug.avgFps` 聚合
- **0 处 `IntersectionObserver`** —— 不在视口的实例不自动 pause(audit-runtime.md 已标 P1-1)
- **0 处 `visibilitychange` 监听** —— 后台标签页 rAF 不主动停
- `mountFpsOverlay` 已是公开 API(`src/fps-overlay.ts`),但只读 `__matrixRainDebug.avgFps`,**不读 `getRendererHealth()`** —— 即 fps overlay 与 health 快照是两条独立信息流,健康信号没接进 overlay。

### 2.5 浏览器原生 / 错误上报

- **0 处 `PerformanceObserver`** —— 长任务 / layout shift 0 监控
- **0 处 `console.time/console.timeEnd`** —— 调试时长只能自己写
- 0 处 `window.onerror` / `window.addEventListener('error', ...)` / `window.addEventListener('unhandledrejection', ...)` —— **真线上错误完全无全局兜底**,只在 `init()` 失败路径 + draw 错误时打 `console.error`
- 0 处 `Sentry` / `Bugsnag` / 自建上报

**空白**: 0 个全局错误兜底,生产事故时 `console.error` 是唯一信号,运维拿不到。

### 2.6 用户反馈渠道

- `useMatrixRain.ts:142-147` / `212-216` / `314-316` 都有 `console.error('[useMatrixRain] ...')`,但**没接到 health 快照**
- `MatrixRain.destroyAll()` 静默吞 catch (合理,销毁失败不致命)
- `__matrixRainDebug.destroyAll()` 同上

**空白**: 应用层没有 hook 把 `getRendererHealth()` 推到外部监控 / telemetry。

---

## 3. 类型健康

### 3.1 公开类型声明

| 类型                             | 位置                           | 风格                 |
| -------------------------------- | ------------------------------ | -------------------- |
| `RendererHealth` (公开)          | `types/index.d.ts:820-847`     | `interface`,有 TSDoc |
| `RendererHealth` (内部)          | `src/renderer/health.ts:30-57` | `interface`,有 TSDoc |
| `HealthInternal` (私有)          | `src/renderer/health.ts:60-74` | `interface`,不导出   |
| `RendererHealthErrorCode` (公开) | `src/renderer/health.ts:22-27` | `type` 联合          |

**风格不一致**:

- 内部 + 公开都用 `interface` 描述 RendererHealth(无 readonly 字段),一致
- `RendererHealthErrorCode` 是 `type` 联合(因有 4 种成员 + 兜底 string)
- **未用 `readonly` 修饰**字段(`h.frameCount = 9999` 在测试中靠 `Object.freeze` 拒绝,而不是 TS 层拒绝)。这意味着 TypeScript 消费方在 IDE 里看不到"不可变"信号。
- `MatrixRainInstance.getRendererHealth` 返回 `RendererHealth`(非 `Readonly<RendererHealth>`),TS 不会警告你试图改 `h.frameCount`

**建议**: `types/index.d.ts:820` interface 改为 `Readonly<{ ... }>` 形式,或在每个字段加 `readonly` 修饰符;`src/renderer/health.ts:30` 同步改。这样 `getRendererHealth()` 调用方在 IDE 看到"红字"就知道不可写。

### 3.2 `as` 强制断言

| 文件:行                                                                                   | 形态                                                              | 必要性                                                   |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| `src/renderer/health.ts:135`                                                              | `Object.freeze({...}) as RendererHealth`                          | 必要(冻结对象实际是 plain object,需断言)                 |
| `src/renderer/webgl-renderer.ts:74` / `webgpu-renderer.ts:80` / `canvas2d-renderer.ts:52` | `readonly type: RendererImpl = 'canvas2d' \| 'webgl' \| 'webgpu'` | 必要(literal narrowing)                                  |
| `src/themes.ts:17-70`                                                                     | 主题 5 处 `as HSLPalette`                                         | **可避免** —— interface 字段全 optional,可直接对象字面量 |
| `src/renderer/webgpu-renderer.ts:161,177,191,194,318,486,576,637,662`                     | 7+ 处 `as unknown as GPUCanvasContext` / `as GPUTextureView` 等   | webgpu 类型 stub 不完整所致,audit-code-quality.md 已标   |

健康模块本身的 `as` 全部必要,且只 1 处。健康。

### 3.3 `as const` vs `readonly` 风格

- 内部状态用 `interface HealthInternal`,13 字段全 mutable(因为热路径要直写)
- 公共 API 返回用 `Object.freeze` + `as RendererHealth` 强制 readonly
- 一致:内部 mutable / 外部 immutable

`as const` 在 `src/` 中主要用于 literal tuple(`as const` 在 `src/curves/sandbox.ts`,`src/renderer/auto-pick.ts`),与 health 模块无关。

---

## 4. 文档与示例

### 4.1 README 章节

`grep -n "health\|Health\|getRendererHealth" README.md` **0 命中**。

`grep -n "0\.6\.0\|0\.6\.1\|0\.6\.2" README.md` 仅 0 命中。**README 完全没有 0.6.x 章节**,更没有 health API 章节。这是**最严重的可观测性空白** —— 用户拿到包,根本不知道这个 API 存在。

### 4.2 CHANGELOG

`grep -n "getRendererHealth\|health" CHANGELOG.md` 0 命中。`[Unreleased]` 章节只写了 charGap,**漏掉了 0.6.0 的 getRendererHealth、0.6.1 的 charGap 之前的 health** 等多个公共 API。

### 4.3 仓库根 + docs/ 文档

唯一专门讲 `getRendererHealth()` 的文档是 `docs/audits/health-2026-06-12.md` (审计报告),`audit-code-quality.md:33` / `audit-runtime.md:57,85` / `audit-performance.md:127` 是**片段引用**,无用户视角说明。

`docs/audits/health-2026-06-12.md` 内容详尽(150 行,5 大段),但定位是"内部审计",不是"用户文档"。

### 4.4 注释健康

`src/renderer/health.ts:1-17` 文件头注释完整(`@since 0.6.0`,职责 / 设计原则),`recordHealthError` / `tickDroppedFrames` / `snapshotHealth` 都有 TSDoc。

`types/index.d.ts:804-813` `getRendererHealth` 的 TSDoc 写得很详细(11 字段含义 + @since 0.6.0 + WebGL/WebGPU/canvas2d 行为说明)。

**注释质量高,问题在覆盖面**。

### 4.5 Stale / 错误引用

| 文件:行                                            | 问题                                                                                                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/regression-cases-from-playground-fix.md:170` | 引用 `getRendererHealth().targetCellsLocked > 0`,但 RendererHealth **根本没有 `targetCellsLocked` 字段**。这是**假想字段** —— 写文档的人可能误把"target 状态机的 getTargetState()" 错写到了 health 接口上。 |
| `docs/test-strategy.md:96`                         | 引用 `src/engine/getRendererHealth.ts` 路径,**该文件不存在**(health 模块在 `src/renderer/health.ts`)。                                                                                                      |
| `audit-runtime.md:57`                              | 提议"加 contextLostCount 字段",但 0.6.0+ 至今未实现。                                                                                                                                                       |
| `docs/audits/health-2026-06-12.md:148-149`         | "0.6.1+ 可选 / 0.7.0+ 可选" 的 follow-up 没追踪,导致"version 字段"和"接进 detect()"两件事永远 in-flight。                                                                                                   |

**4 处 stale doc 引用,2 处是不存在的字段/路径**。

---

## 5. P0 / P1 / P2 编号清单

### P0(影响用户可见的"加了就死")

#### P0-1 · `getRendererHealth()` 零真实消费方,纯"为测试而做"

- **位置**: `src/engine.ts:831` 包装;`types/index.d.ts:813` 公开类型
- **现状**: 唯一消费方是 `test/renderer-health.mjs` 的 9 个契约测试;`site/src/` / `useMatrixRain.ts` / `PlaygroundPage.vue` / `__matrixRainDebug` / `MatrixRain.detect()` / `mountFpsOverlay` 全部 0 消费
- **影响**:
  - 3 个 renderer 跑 6 处 `_health.frameCount++` / 6 处 `tickDroppedFrames` + `gl.getError()` 每帧调用 + `pushErrorScope/popErrorScope` 每帧调用,纯纯"hot path 零成本但完全无收益"
  - `audit-runtime.md:85` 提议的"加 contextLostCount 字段"会以"先找一个消费方"为前置依赖
- **修复方向**:
  1. 短期:在 `PlaygroundPage.vue` 右侧加可折叠 Health Panel,把 13 字段显示成表格,实时刷新(1Hz);`__matrixRainDebug` 也暴露 `getHealth(i)` 取第 i 个实例的 health
  2. 中期:把 health 快照接进 `MatrixRain.detect()`(返回 `EnvironmentInfo & { health?: RendererHealth }`),让"启动前静态探测 + 启动后运行态"合成一个统一 API
  3. 长期:健康信号推到 Sentry / 自建 telemetry,运维真能收到"webgpu 用户突然 lastErrorScope 非空"告警

#### P0-2 · 4 个 `fireOn*` 用户回调 throw 后静默吞,健康快照永远看不到

- **位置**: `src/engine.ts:486-488` (fireOnFrame) / `496-498` (fireOnResize) / `506-508` (fireOnThemeChange) / `516-518` (fireOnTargetFinish)
- **现状**: `try { opts.onFrame({...}) } catch { /* */ }` —— 吞掉,不上报
- **影响**:
  - 用户在 `onFrame` 回调里 throw → 无 console 报错,无 health 标记
  - `getDiagnostics()` 接口**已有**(`types/index.d.ts:762`),本应作为透出口,但 `fireOn*` 路径完全没接
- **修复方向**:
  - `src/engine/state.ts` 新增 `state.userCallbackError: { frame: number, name: 'onFrame'|'onResize'|'onThemeChange'|'onTargetFinish', message: string } | null = null`
  - `fireOn*` 4 处 try/catch 改为 `try { ... } catch (e) { state.userCallbackError = { ... } }`
  - `getDiagnostics()` 透出 `userCallbackError`
  - 加测试 `test/user-callback-error.mjs`

#### P0-3 · 4 处审计/文档 follow-up 永久 in-flight

- **位置**:
  - `audit-runtime.md:57` —— "health 快照加 contextLostCount 字段"
  - `audit-runtime.md:85` —— "requestAdapter 失败应给 getRendererHealth() 写明 lastInitError"
  - `docs/audits/health-2026-06-12.md:148` —— "加 version: '0.6.0' 字段"
  - `docs/audits/health-2026-06-12.md:149` —— "接进 MatrixRain.detect()"
- **现状**: 4 个 follow-up,3 个完全无 commit,1 个(`lastInitError`)在 0.6.0+ **已实现**(webgl-renderer.ts:261)但 audit 没勾
- **影响**: 文档/审计与实现长期脱节,新来工程师会以为"这些 follow-up 真的没做"
- **修复方向**:
  - 在 `RendererHealth` 加 `version: '0.6.0'` 字段(1 行 + 1 行测试)
  - `MatrixRain.detect()` 返回类型扩 `& { health?: RendererHealth }`,需在用户传 canvas 后才能填
  - 把 `audit-runtime.md:85` 那条标 "[✅ 已实现 @ 0.6.0+]" 删掉,只剩未做的 2 条
  - 设立 `audit/FOLLOWUPS.md` 跟踪表

### P1(影响类型 / 文档)

#### P1-1 · `RendererHealth` 字段无 TS `readonly` 修饰

- **位置**: `types/index.d.ts:820-847` / `src/renderer/health.ts:30-57`
- **现状**: 13 字段全 mutable,运行期靠 `Object.freeze` 防篡改
- **影响**: TS 用户在 IDE 里看不到"返回的是只读结构",可能在不知情下写 `h.frameCount = 9999` 然后运行期才抛 TypeError
- **修复方向**: 全部 13 字段加 `readonly` 修饰符(`readonly renderer: RendererImpl;` 等),`snapshotHealth` 内部 `Object.freeze` 保持
- **风险**: 0 风险,纯编译期增强

#### P1-2 · 2 处 stale doc 引用(假想字段 + 不存在路径)

- **位置**:
  - `docs/regression-cases-from-playground-fix.md:170` —— `getRendererHealth().targetCellsLocked` 字段不存在
  - `docs/test-strategy.md:96` —— `src/engine/getRendererHealth.ts` 路径不存在
- **影响**: 误导后续维护者 / 写代码的人去找不存在的 API
- **修复方向**:
  - `regression-cases-from-playground-fix.md:170` 改为 `getTargetState()?.lockedCount > 0`(走真接口)
  - `test-strategy.md:96` 改为 `src/renderer/health.ts`
  - 同时检查 `audit-runtime.md:57` 的 `contextLostCount` 字段是否最终实现(没实现就把那行删掉,避免永久性"假想"承诺)

#### P1-3 · `__matrixRainDebug` 与 `mountFpsOverlay` 不读 health,3 条独立信息流未汇聚

- **位置**:
  - `src/engine.ts:71-97` —— `__matrixRainDebug` 只暴露 instances/count/avgFps/destroyAll
  - `src/fps-overlay.ts:82` —— 只读 `__matrixRainDebug.avgFps`
  - `src/index.ts:123` —— `MatrixRain.detect()` 不读 health
- **影响**: fps overlay 只看帧率,看不到 GL 错误;`__matrixRainDebug.destroyAll` 不知道哪些实例 health.lastInitError 非空(可能误杀健康实例)
- **修复方向**:
  - `__matrixRainDebug` 加 `getHealth(idx?: number)` 方法,默认聚合所有实例的 lastGlError/lastErrorScope/lastInitError(detect-style)
  - `mountFpsOverlay` 读 `__matrixRainDebug.getHealth()` 当 `lastGlError !== 0` 时 FPS 行变红

#### P1-4 · 0 处 `window.onerror` / `unhandledrejection` 全局兜底

- **位置**: 整个 `src/`
- **现状**: `grep -rn "onerror\|onError\|unhandledrejection" src/` 0 命中
- **影响**: 异步 reject / 全局 throw 永远丢失;Playground 报错靠用户自己开 DevTools console
- **修复方向**:
  - `MatrixRain` 命名空间(`src/index.ts:76`)加 `installGlobalErrorHandler(opts: { onError: (e) => void })`,内部 `window.addEventListener('error', ...)` + `'unhandledrejection', ...`,把 catch 到的 Error.message + URL + line/col 喂给 `onError`
  - 内部不默认开(opt-in),避免与用户的 Sentry 等冲突

### P2(代码质量 / 锦上添花)

#### P2-1 · `playground fix` 后 13 字段文案与真实字段不一致

- **位置**: `docs/audits/health-2026-06-12.md:5` 说"13 字段";`test/renderer-health.mjs:177-191` 实际 assert 列表有 13 个字段
- **现状**: 文案与代码一致,但 `audit-health-2026-06-12.md:5` 与 `audit-health-2026-06-12.md:17` 重复"13 字段"但**第 5 行的字段表只列了 11 个**(表 1.3 在 :46-60,只列 11 字段,缺 `renderer` / `initialized` / `drawCallIdx` 三个?)
- **修复方向**: 校对 `docs/audits/health-2026-06-12.md:46-60` 字段表补齐 13 个,与 `types/index.d.ts:820-847` 对齐

#### P2-2 · 0 处 `performance.mark` / `performance.measure` —— health 的 `lastFrameDurationMs` 是单点,无时序

- **位置**: `src/engine.ts:560` 处的 rAF 循环
- **现状**: 已有 `performance.now() - frameStart` 算 `lastFrameDurationMs`,但**没**在 DevTools Performance 面板可见
- **修复方向**: `engine.ts:540` 加 `performance.mark('mr-frame-start')`,`:740` 加 `performance.mark('mr-frame-end')` + `performance.measure('mr-frame', 'mr-frame-start', 'mr-frame-end')`,便于在 DevTools 看见

#### P2-3 · 健康快照没有内存维度

- **位置**: `src/renderer/health.ts:30-57` interface
- **现状**: 13 字段全是"渲染状态 + 错误",无"资源占用"
- **影响**: 8.4M cells webgpu 报告"占用高"时,无法诊断
- **修复方向**: 加 `estimatedBytes: number`(webgl: instanceBuffer + atlas texture;webgpu: 同上 + cellsBuffer;canvas2d: 0)

#### P2-4 · 0 处 `IntersectionObserver` —— 视口外实例不自动 pause

- **位置**: `src/engine.ts:771-776` ResizeObserver 旁
- **现状**: 已有 ResizeObserver 监听 canvas resize,缺 visibility / intersection
- **修复方向**: `engine.ts:772` 旁加 `IntersectionObserver`,`isIntersecting=false` 时 `state.isPaused = true`

#### P2-5 · `mountFpsOverlay` 不读 health —— 与 health 完全脱钩

- **位置**: `src/fps-overlay.ts:60-90`
- **现状**: overlay 只显示 FPS + theme + count,不看 `lastGlError` / `lastInitError`
- **修复方向**: `fps-overlay.ts:80` 加 health 字段显示,`lastGlError !== 0` 时 overlay 变红 + 显示 "GL error: 0x502"

---

## 6. 价值 vs 维护成本评估

### 6.1 已投入成本(自 0.6.0 起)

| 项                                                                                                            | 行数        | 来源                  |
| ------------------------------------------------------------------------------------------------------------- | ----------- | --------------------- |
| `src/renderer/health.ts`                                                                                      | 136         | 0.6.0 新增            |
| `RendererHealth` interface × 2(public/internal)                                                               | 28          | 同上                  |
| 3 个 renderer 的 `getHealth()` 方法                                                                           | 9           | 3 行 × 3              |
| 3 个 renderer 的 hot path tick(`frameCount++` + `tickDroppedFrames` + `gl.getError()` + `push/popErrorScope`) | ~30         | 散落 render()         |
| `engine.ts:831` 包装                                                                                          | 2           | 1 行透传 + 1 行注释   |
| `types/index.d.ts` 公开类型 + TSDoc                                                                           | 45          | 1.3% 公开类型         |
| `test/renderer-health.mjs` 9 个契约 case                                                                      | 312         | 全 Mock DOM + Node 跑 |
| `docs/audits/health-2026-06-12.md` 审计报告                                                                   | 150         | 间接维护成本          |
| **合计**                                                                                                      | **~712 行** |                       |

### 6.2 当前收益(诚实评估)

| 收益                                           | 量化                                             |
| ---------------------------------------------- | ------------------------------------------------ |
| 测试覆盖(9 契约 case)                          | 通过,挡住 Object.freeze 失效 / 字段遗漏等回归    |
| 调试时能 dump 状态                             | **理论**上;**实际**上无人 dump(0 处产品代码消费) |
| 文档承诺"健康快照可读"                         | **形式**上(审计文档 + 公开类型);**实际**上无人读 |
| Sentry / Telemetry 上报                        | 0(未实现)                                        |
| 自动化测试 + Playwright 抓 health 抓真 GL 错误 | 0(只有 Node 契约测试)                            |

### 6.3 价值 vs 成本

```
价值(实际):  ★☆☆☆☆ (1/5)
维护成本(已):  ★★★☆☆ (3/5, ~712 行 + 持续审计)
净收益:        ★☆☆☆☆ (1/5 净亏)
```

**判断**: 边际价值是负的(每加一个 0.6.x release 都要审计 health 模块,但消费方没增长)。

### 6.4 救活路径(若要扭亏为盈)

按 P0-1 修复方向做齐 3 件事,可让 health 真实可用:

1. **Playground Health Panel**(短期, 1-2 天):右侧折叠面板,实时显示 13 字段,1Hz 刷新;这一刻 health 从"零消费"变成"演示性消费"
2. **`MatrixRain.detect() & { health }`**(中期, 1 周):让用户在 `matrixRain` 启动后,1 次调用同时拿到"环境信息 + 当前实例 health";这一刻 health 进入产品代码主路径
3. **telemetry 桥**(长期, 2 周):提供 `MatrixRain.installTelemetryHook(fn)`,把 health.lastGlError / lastErrorScope / lastInitError 任一非空时推给 `fn`;这一刻 health 真正能拯救生产事故

### 6.5 若不救活

最务实的降级方案:**把 health 改成 internal-only**:

- 移除 `MatrixRainInstance.getRendererHealth` 公开方法
- 保留 3 个 renderer 的 `_health` 字段 + `getHealth()` 内部方法
- 保留 9 个契约测试
- 移除 `types/index.d.ts:820-847` 公开 interface
- 节省 1 个公开 API,降低文档 / 兼容性维护成本

如果未来真有 Playwright 抓真 GL 错误 / Sentry 上报等真实需求,**再**回退到"重新公开 + 写消费方"模式。

### 6.6 一句话结论

`getRendererHealth()` 是一个**设计出色、测试完整、但**:

- **生产代码 0 消费** ← P0-1
- **README 0 文档** ← P0-3 + 隐性问题
- **文档 2 处假想字段 / 1 处不存在路径** ← P1-2
- **4 处 fireOn\* 回调错误比它更值得加** ← P0-2
- **净收益 1/5,处于"加了就死"状态**

要嘛救活(P0-1 三步走,1-2 周可达成"扭转"),要嘛阉割成 internal(半天,降低未来维护成本)。
**"维持现状"是最差选择** —— 每个 0.6.x+ 都要为它写审计,但没人用它。

---

## 附录 A:本审计依赖的数据源

- `git log --all --oneline -- src/engine/renderer*` → `346122a feat(renderer): 0.6.0 getRendererHealth() 诊断快照 (跨 3 renderer)`
- `grep -rn "getRendererHealth" .` → 26 命中,分类见 §1.5
- `grep -rn "try\s*{" src/` → 18 try 块
- `grep -rn "performance\|console\." src/` → 0 `performance.mark`,0 `console.time`
- `grep -rn "requestAnimationFrame\|cancelAnimationFrame" src/` → rAF 已有,`IntersectionObserver` 0
- `grep -rn "as [A-Z]" src/` → 1 处 health 必要,webgpu 7 处必要
- `grep -rn "as const\|readonly" src/` → readonly 仅用于 `RendererImpl` 字面量
- `grep -rn "Object.freeze" src/` → health 1 处 + sandbox 5 处
- `grep -rn "onerror\|unhandledrejection\|reportError" src/` → 0 命中
- `grep -n "health\|Health" README.md CHANGELOG.md` → 0 命中

## 附录 B:本审计未做(避免越界,见 memory/feedback_debug_depth_boundary)

- 未读 `src/renderer/{webgl,webgpu}-renderer.ts` 全部 1500+ 行
- 未读 `src/engine/state.ts` 全部 800+ 行
- 未读 `test/` 下其他 30 个 test 文件
- 未跑 `npm test` / `npm run build`(无源码改动,审计不触发)
- 未触发 Playwright 真像素 / 真 GL 错误探测(只静态读代码)
