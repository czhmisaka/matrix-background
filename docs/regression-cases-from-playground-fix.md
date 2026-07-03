# Playground 修复轮 · 像素回归 Case 清单

> 来源:`audit-playground-fix-2026-06-16.md`(主目录副本,539 行,2 P0 + 2 P1 + 5 P2)
> 用途:被 `docs/test-strategy.md` 引用,作为 `test:regression` 子套件的最小覆盖
> 目标版本:0.6.2+(修复后)
> 编写日期:2026-06-16

---

## 0. 如何被 test-strategy.md 引用

> **给 bc3fd agent 复制粘贴块**(直接进 test-strategy.md 的"回归 case 索引"小节即可):

```markdown
### 来源:Playground 修复轮审计(2026-06-16)

四类核心回归 case 来源于 `docs/regression-cases-from-playground-fix.md`:

| Case ID | 等级 | 标题                                               | 覆盖渲染器     | npm script 建议           |
| ------- | ---- | -------------------------------------------------- | -------------- | ------------------------- |
| P0-1    | 🔴   | 不传 fontSize 时每帧 buildGrid(dirty check 漏判)   | canvas2d       | `test:regression:dirty`   |
| P0-2    | 🔴   | setTarget 占位 bitmap {0,0} 让 mount 重放抛错      | canvas2d/webgl | `test:regression:target`  |
| P1-1    | 🟠   | setDensity 隐式改写 options.fontSize 破坏 adaptive | canvas2d       | `test:regression:density` |
| P1-2    | 🟠   | useMatrixRain watch 大 try 吞错吞后续 setter       | canvas2d/webgl | `test:regression:watch`   |

复现脚本范式见 `audit-playground-fix-2026-06-16.md` §4 关键复现日志(已含 60 帧 setTransform / fillText 计数法)。
每条 case 的像素匹配率阈值与 `gl.getError=0` 校验点见下文。
```

> **不要修改本文件**——它是审计产物的"清单"层,test-strategy.md 通过 case ID 反向引用即可。

---

## 1. 缺陷总览

| ID   | 等级 | 一句话                                                                                   | 触发文件                                                    |
| ---- | ---- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| P0-1 | 🔴   | `setDensity` 改 dirty check 后,用户不传 `fontSize` 时每帧 `buildGrid`→CPU 雪崩+视觉雪花  | `src/engine.ts:569-578` + `src/engine/setters.ts:560-571`   |
| P0-2 | 🔴   | `useMatrixRain.setTarget` 未就绪时缓存 `{cols:0, rows:0}` 占位 bitmap,mount 重放必 throw | `site/src/composables/useMatrixRain.ts:170-186` + `133-145` |
| P1-1 | 🟠   | `setDensity` 静默写 `state.options.fontSize` → 永久脱离 adaptive 路径                    | `src/engine/setters.ts:567-571`                             |
| P1-2 | 🟠   | `useMatrixRain` watch effectKey 大 try 块 → 任一 setter 抛错则后续 11 个全跳过           | `site/src/composables/useMatrixRain.ts:288-319`             |
| P2-1 | 🟡   | `setTargetNoiseDuration` / `setTargetConvergeDuration` 缺"相同值快路径"                  | `src/engine/setters.ts:617-633`                             |
| P2-2 | 🟡   | `prettier --check` 2 文件无 trailing newline,CI 红                                       | `useMatrixRain.ts` + `PlaygroundPage.vue`                   |
| P2-3 | 🟡   | `setMaxDPR` 不写 `state.options.maxDPR`(与 setDensity 处理不一致)                        | `src/engine/setters.ts:588-592`                             |
| P2-4 | 🟡   | `setMaxDPR` JSDoc 写"触发 buildGrid"但实现不触发                                         | `types/index.d.ts:559-565`                                  |
| P2-5 | 🟡   | `setDensity` JSDoc 回避 dirty-check adaptive 不等后果,易让后人误判 bug                   | `src/engine/setters.ts:558-565`                             |

> 本文档**只对 P0/P1 共 4 条**展开回归 case 设计;P2 见 §6。

---

## 2. P0-1 · 不传 fontSize 时每帧 buildGrid(dirty check 漏判)

### 2.1 现象(原文 §P0-1)

`setDensity` 0.6.2+ 改 dirty check,要求 `state.cfg.fontSize === state.ef` 才不重建。但 `state.cfg.fontSize` 在用户**未传 fontSize** 时固定为 `6`,而 `state.ef` 走 adaptive 路径(800×600 → 4,3840×2160 → 16)→ 两者永远不等 → **每帧 `buildGrid` + `renderer.resize` + `setTransform`**。

实测 60 帧 `setTransform` 数:

| 配置                     | 60 帧 setTransform | 结论            |
| ------------------------ | ------------------ | --------------- |
| 不传 fontSize, 800×600   | **60**             | 🔴 每帧 rebuild |
| 不传 fontSize, 1280×720  | **60**             | 🔴 每帧 rebuild |
| 不传 fontSize, 1920×1080 | **60**             | 🔴 每帧 rebuild |
| 不传 fontSize, 2560×1440 | **60**             | 🔴 每帧 rebuild |
| 不传 fontSize, 3840×2160 | **60**             | 🔴 每帧 rebuild |
| 传 fontSize=6, 800×600   | **0**              | ✅ 正常         |

### 2.2 复现路径

```js
// test/render-scale.mjs mock 框架 + setTransform 计数器
import matrixRain from '../src/engine.js';

const inst = matrixRain({
  // 故意不传 fontSize(README 默认推荐用法)
  // 故意不传 maxDPR
  // 故意不传 charGap
  fixedTimeStep: true, // 让 RAF 循环跑完 60 帧可控
});

tickRAF(1); // 触发 init
__setTransformCount = 0; // 通过 __getMockContext2D().setTransform 计数打桩
tickRAF(60);

console.assert(__setTransformCount === 0, `dirty check 漏判: 60 帧 setTransform=${__setTransformCount}`);
```

### 2.3 建议回归 case 设计

| 维度         | 设计                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Case 名称    | `regression-dirty-check-fontsize-default`                                                                                           |
| 覆盖渲染器   | canvas2d(主)+ webgl/webgpu**后续**;P0-1 触发在 dirty check 公共路径,renderer 无关                                                   |
| 触发参数     | `viewport=800×600` / `1280×720` / `1920×1080` / `2560×1440` / `3840×2160`(5 档)+ **`options={}`**(不传 fontSize)                    |
| 跑帧数       | 60(模拟 1 秒 60FPS)                                                                                                                 |
| 主断言       | `__setTransformCount === 0`(每帧 0 次 setTransform,允许 ≤ 2 容忍度)                                                                 |
| 副断言       | `gl.getError() === 0`(webgl/webgpu 模式)                                                                                            |
| 像素匹配率   | 阈值 **≥ 99.5%** —— 不传 fontSize 跑 60 帧,首尾两帧 shouldMatch(若 cell 状态被每帧重置,字符位置/亮度会有 1-2 像素抖动,99% 已足够高) |
| console 断言 | `console.error` / `console.warn` 调用次数 = 0(P0-1 自身不抛错,但 buildGrid 重置会触发 useMatrixRain 路径上的 warn)                  |
| 性能门       | 60 帧总耗时 ≤ 100ms(单测环境 mock 渲染器,真实主线程应 ≤ 16ms/帧)                                                                    |

### 2.4 配套控制组(必须同跑,否则 case 不可信)

| Case 名                                    | 触发参数                                  | 期望 setTransform | 目的                                                 |
| ------------------------------------------ | ----------------------------------------- | ----------------- | ---------------------------------------------------- |
| `regression-dirty-check-fontsize-default`  | **不传** fontSize, 800×600                | **0**(≤2)         | 检验 dirty check 在 default 路径上不漏判             |
| `regression-dirty-check-fontsize-explicit` | **传** fontSize=6, 800×600                | **0**             | 对照组(应 0 才对,验证 setTransform 计数能区分场景)   |
| `regression-dirty-check-fontsize-resize`   | 不传 fontSize, 800×600 → 1920×1080 resize | 1(只 resize 一次) | 验证 resize 路径单独触发一次,不会变成"resize 后每帧" |

### 2.5 修复后如何认定通过

- 全部 3 个 case 的 setTransform 数符合上表期望
- 像素匹配率 ≥ 99.5%
- `gl.getError() === 0`(若走 webgl/webgpu 路径)
- 60 帧 fillText 总数(800×600) ≤ 1,000,000(原 1,796,303 是 2.24 倍回归)

---

## 3. P0-2 · setTarget 占位 bitmap 让 mount 重放抛错

### 3.1 现象(原文 §P0-2)

`useMatrixRain.setTarget(text)` 在 instance 未就绪时,把占位 bitmap 缓存为 `{ cols: 0, rows: 0, data: new Float32Array(0) }`。mount() 完成后自动重放,`setTargetBitmap` 校验 `!Number.isInteger(0) || 0 <= 0` → **必 throw** `cols 必须是正整数(收到 0)`。靠 `console.warn` 吞错,target 永久不显示。

**触发概率**:Playground 默认 250ms 延时,WebGL atlas PNG 加载 50-200ms → 50% 概率 race。

### 3.2 复现路径

```js
// 1. 创建 useMatrixRain,但故意延后 instance
const wrapper = mountUseMatrixRain(canvasRef, optionsRef);
// 2. 在 instance.value 还是 null 之前调 setTarget
const ok = wrapper.setTarget('HELLO');
assert.equal(ok, false); // 走未就绪分支
// 3. 等 instance 就绪后,trigger mount() 重放
await waitForInstanceReady(wrapper);
// 4. 监听 console.warn
const warnings = captureConsoleWarn();
const errors = captureConsoleError();
wrapper.getState().targetBitmap; // 应当是合法 cols/rows,而不是 {0,0}
assert.equal(warnings.length, 0, 'setTarget 重放不该走 console.warn 吞错路径');
assert.equal(errors.length, 0);
```

### 3.3 建议回归 case 设计

| 维度         | 设计                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Case 名称    | `regression-target-mount-race`                                                                                   |
| 覆盖渲染器   | **canvas2d + webgl + webgpu** 三个分支各跑一遍(P0-2 触发在 setTargetBitmap 公共校验)                             |
| 触发参数     | `targetText='HELLO'` + `targetPhase='fade'`,延时 0-500ms 调 setTarget(模拟 Playground 250ms + atlas 加载 race)   |
| 主断言       | `console.warn` / `console.error` 调用次数 = **0**                                                                |
| 副断言       | `getTargetBitmap()` 返回值 `cols > 0 && rows > 0`                                                                |
| 像素匹配率   | **N/A**(这是行为缺陷,不是像素缺陷);改为 target bitmap 在 200ms 内出现并稳定,前 5 帧 `getTargetActive() === true` |
| console 断言 | `setTarget` 返回 `true`(不是 false)                                                                              |

### 3.4 配套控制组

| Case 名                                   | 触发参数                                                 | 期望                       |
| ----------------------------------------- | -------------------------------------------------------- | -------------------------- |
| `regression-target-mount-race-cold`       | 冷启动,atlas PNG 加载 ≥ 200ms                            | setTarget 重放后应正常显示 |
| `regression-target-mount-race-warm`       | 热启动,instance.value 已就绪                             | setTarget 立刻返回 true    |
| `regression-target-mount-race-then-theme` | 触发 race 后用户改 theme(模拟 P0-2 §"反复用垃圾 bitmap") | theme 变化不触发新 throw   |

### 3.5 修复后如何认定通过

- 全部 3 个 case 的 `console.warn` / `console.error` 数为 0
- `getTargetBitmap()` 返回合法 cols/rows
- 像素层(200ms 后)target 区域 ≥ 30% 字符命中(用 `getRendererHealth().targetCellsLocked` > 0 间接验证)

---

## 4. P1-1 · setDensity 隐式改写 options.fontSize 破坏 adaptive

### 4.1 现象(原文 §P1-1)

`setDensity` 0.6.2+ 改写 `state.options.fontSize = v`。一旦调过 `setDensity(8)`,后续 resize 时 `userOverride !== undefined` → 永远固定 8,**不再 adaptive**。

老行为:用户运行时改 `setDensity(8)`,只改 `cfg.fontSize`;resize 时仍走 adaptive(读 `options.fontSize === undefined`)。

新行为:`setDensity(8)` → `options.fontSize = 8` 永久写入。

### 4.2 复现路径

```js
const inst = matrixRain({}); // 不传 fontSize,options.fontSize = undefined
assert.equal(inst.getOptions().fontSize, undefined, '初始 options.fontSize 应为 undefined');

inst.setDensity(8); // 用户主动调
// 期望老行为:options.fontSize 仍 undefined
// 实际新行为:options.fontSize = 8
const opt = inst.getOptions();
assert.equal(opt.fontSize, undefined, 'setDensity 不应污染 options');

// 触发 resize
inst.resize(1920, 1080); // 假设从 800×600 切到 1920×1080
// 期望:state.ef 走 adaptive(1080p → 8 左右)
// 实际(新行为):state.ef 固定 8
assert.ok(inst.getEffectiveFontSize() !== 8, 'resize 后应自适应,而非锁死 8');
```

### 4.3 建议回归 case 设计

| 维度         | 设计                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Case 名称    | `regression-density-options-pollution`                                                                                    |
| 覆盖渲染器   | canvas2d(adaptive 逻辑公共路径)                                                                                           |
| 触发参数     | (a) `setDensity(8)` 前后对比 `getOptions().fontSize`;(b) 800×600 → 1920×1080 resize 后 `getEffectiveFontSize()` 应当 ≥ 10 |
| 主断言       | `setDensity(8)` 之后 `getOptions().fontSize === undefined`(老行为对齐)                                                    |
| 副断言       | resize 后 `getEffectiveFontSize()` 不等于 8(应 ≥ 10,因为 1080p 走 adaptive → 8 ~ 10)                                      |
| 像素匹配率   | 阈值 **≥ 98%** —— resize 前后字符应保持视觉密度(每 100 像素至少 12 字符,误差 ±2)                                          |
| console 断言 | 0 错 0 警                                                                                                                 |

### 4.4 配套控制组

| Case 名                                       | 触发参数                                | 期望                                   |
| --------------------------------------------- | --------------------------------------- | -------------------------------------- |
| `regression-density-options-untouched`        | 用户**不调** setDensity,直接 resize     | `getOptions().fontSize` 始终 undefined |
| `regression-density-options-after-setdensity` | 调 `setDensity(8)`,再 resize            | options 仍 undefined,ef ≥ 10           |
| `regression-density-options-webcomponent`     | `matrix-rain-element` 改 font-size 属性 | setOptions 路径不污染                  |

### 4.5 修复后如何认定通过

- 3 个 case 的 options 字段保持 immutable
- resize 前后 ef 走 adaptive
- 像素匹配率 ≥ 98%

---

## 5. P1-2 · useMatrixRain watch 大 try 吞错吞后续 setter

### 5.1 现象(原文 §P1-2)

`useMatrixRain` 的 effectKey watch 把 11 个 setter 串成一根烟囱,外层一个 `try { ... } catch { console.error(...) }`。任一 setter 抛错,后续 10 个**全跳过**;下次 effectKey 变化时,上次没设的值也不会补设。

### 5.2 复现路径

```js
// 模拟:第 5 个 setter(setTargetPhase)抛错,后续 6 个应仍执行
const spy = mockSetters({
  setTheme: () => {},
  setDensity: () => {},
  setPalettes: () => {},
  setTrailAlpha: () => {},
  setTargetPhase: () => {
    throw new Error('forced');
  },
  setTargetLockOrder: () => {}, // 这些应当**仍执行**
  setTargetLockStability: () => {},
  setTargetNoiseDuration: () => {},
  setTargetConvergeDuration: () => {},
  setMaxDPR: () => {},
  setCharGap: () => {},
});

const w = useMatrixRain(canvasRef, optionsRef);
w.optionsRef.value = { theme: 'matrix-green' /* ... */ };
w.effectKey.value++; // 触发 watch

assert.equal(spy.setTargetLockOrder.calls, 1, 'setTargetPhase 抛错后,后续 setter 仍应执行');
assert.equal(spy.setMaxDPR.calls, 1);
assert.equal(spy.setCharGap.calls, 1);
assert.equal(captureConsoleError().length, 1, '应有 1 个错误(被 setTargetPhase 抛出)');
```

### 5.3 建议回归 case 设计

| 维度         | 设计                                                                               |
| ------------ | ---------------------------------------------------------------------------------- |
| Case 名称    | `regression-watch-setter-isolation`                                                |
| 覆盖渲染器   | canvas2d + webgl(主要在 useMatrixRain 层,renderer 无关)                            |
| 触发参数     | mock 11 个 setter,中间 1 个抛错,验证前后 setter 都被调                             |
| 主断言       | 中间 setter 抛错时,**后续** 6 个 setter 仍各被调 1 次                              |
| 副断言       | `console.error` 捕获到 1 条(`setTargetPhase` 抛出的),**不是** 0 条(不允许静默吞错) |
| 像素匹配率   | **N/A**(行为缺陷);副断言改为 `getOptions()` 应反映所有**非抛错** setter 的最新值   |
| console 断言 | `console.error` 数 = 1(精准等于),`console.warn` 数 = 0                             |

### 5.4 配套控制组

| Case 名                                         | 触发参数                    | 期望                                     |
| ----------------------------------------------- | --------------------------- | ---------------------------------------- |
| `regression-watch-setter-isolation-no-throw`    | 11 个 setter 全部 mock 无错 | 11 个全部执行,console = 0 错             |
| `regression-watch-setter-isolation-mid-throw`   | 第 5 个抛错                 | 前 4 + 后 6 = 10 个仍执行,console = 1 错 |
| `regression-watch-setter-isolation-first-throw` | 第 1 个抛错                 | 后 10 个仍执行,console = 1 错            |
| `regression-watch-setter-isolation-last-throw`  | 第 11 个抛错                | 前 10 个仍执行,console = 1 错            |

### 5.5 修复后如何认定通过

- 4 个 case 的 setter 调用计数符合上表
- 每次仅 1 条 console.error(精准对应抛错那 1 个)
- `getOptions()` 反映所有非抛错 setter 的最新值

---

## 6. P2 待观察清单(下阶段候选)

> **不入 npm test 主套件**,先挂 `test:regression:monitor`,跑 1 周观察是否升级到 P1。

| ID   | 一句话                                                          | 监控方式                                                 | 升级触发                                          |
| ---- | --------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| P2-1 | `setTargetNoiseDuration` / `setTargetConvergeDuration` 缺快路径 | bench:effectKey-burst → 测 `recomputeTargetLockTimes` 调 | 任一 setter 调 > 100 次/秒 时升级                 |
| P2-2 | `prettier --check` 2 文件无 trailing newline                    | `npm run format:check` 入 husky pre-commit               | CI 红就升级                                       |
| P2-3 | `setMaxDPR` 不写 `state.options.maxDPR`                         | 写 1 个 case 测 `getOptions().maxDPR` 一致性             | 用户报"getOptions 不对" bug 时升级                |
| P2-4 | `setMaxDPR` JSDoc 写"触发 buildGrid"谎话                        | JSDoc lint 工具(check-jsdoc 之类)                        | 有新人按 JSDoc 写代码后出 bug 时升级              |
| P2-5 | `setDensity` JSDoc 回避 dirty-check adaptive 不等后果           | review 时人工核对                                        | 未来有 backport 到 charGap/renderScale 踩坑时升级 |

### 6.1 P2 → P1 自动升级的判断准则

| 现象                                                          | 升级等级 |
| ------------------------------------------------------------- | -------- |
| P2-1 在 60Hz 设备上单帧 `recomputeTargetLockTimes` 耗时 > 4ms | P1       |
| P2-2 阻断 CI ≥ 3 次/周                                        | P1       |
| P2-3 引发用户 bug 报告 ≥ 1 起                                 | P1       |
| P2-5 衍生 bug(backport 失败)≥ 1 起                            | P0       |

---

## 7. 总览:case 与渲染器分布

| Case ID | canvas2d | webgl   | webgpu  | 等级 |
| ------- | -------- | ------- | ------- | ---- |
| P0-1    | ✅ 主    | ⏳ 后续 | ⏳ 后续 | 🔴   |
| P0-2    | ✅       | ✅      | ✅      | 🔴   |
| P1-1    | ✅       | ⏳ 后续 | ⏳ 后续 | 🟠   |
| P1-2    | ✅       | ✅      | ✅      | 🟠   |

**P0+P1 分布**:

- canvas2d:4/4(100%)
- webgl:2/4(50%)(P0-2 + P1-2,因为它们在 setTargetBitmap / useMatrixRain 层公共路径)
- webgpu:2/4(50%)(同上,公共路径)

---

## 8. 与 npm script 命名约定(对齐 audit 报告 §5)

```jsonc
// package.json scripts 建议
{
  "test:regression:dirty": "node test/regression/dirty-check-fontsize.mjs",
  "test:regression:target": "node test/regression/target-mount-race.mjs",
  "test:regression:density": "node test/regression/density-options-pollution.mjs",
  "test:regression:watch": "node test/regression/watch-setter-isolation.mjs",
  "test:regression": "npm run test:regression:dirty && npm run test:regression:target && npm run test:regression:density && npm run test:regression:watch",
}
```

> 命名遵循:`<主语>-<动词短语>`,与 `test:render-scale` / `test:char-gap` 既有风格一致。

---

## 9. 引用入口

- **来源审计**:`audit-playground-fix-2026-06-16.md`(主目录,539 行,2026-06-16 16:43)
- **被引用方**:`docs/test-strategy.md`(待 bc3fd agent 加 §"回归 case 索引"小节)
- **执行模板**:`test/render-scale.mjs`(P0-1 复现框架)+ `test/char-gap.mjs`(渲染器 mock 范式)
- **数据真值**:60 帧 setTransform 计数 / fillText 总数(见 audit §4.1,§4.2)
