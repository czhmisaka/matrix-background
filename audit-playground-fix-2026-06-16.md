# 0.6.2+ Playground 修复轮 · 只读审查报告

> 日期: 2026-06-16 16:43
> 审查范围: `task.md` 描述的 7 处 setter + watch 重构(commits 工作树未提交 diff)
> 审查类型: 只读 · 不改源码 · P0/P1/P2 分级
> 当前版本: 0.5.1(package.json),task.md 标 0.6.2+(将来版本)
> 上轮报告: `af51029 docs(audit): 0.5.1+ 性能只读审计报告`
> 工作树状态: 6 文件改动 · 313 +/93 - (`src/engine.ts` 8, `src/engine/setters.ts` 109, `types/index.d.ts` 45, `site/src/composables/useMatrixRain.ts` 151, `site/src/pages/PlaygroundPage.vue` 89, `package-lock.json` 4)

---

## 0. TL;DR

| 等级      | 数  | 说明                                               |
| --------- | --- | -------------------------------------------------- |
| 🔴 **P0** | 2   | 性能回归(每帧 buildGrid)+ 运行时抛错(垃圾 bitmap)  |
| 🟠 **P1** | 2   | watch 阻塞 + setDensity 隐式行为变化               |
| 🟡 **P2** | 5   | prettier 失败 / 冗余 recompute / 防御性 / 注释陈旧 |

**核心结论**:

- task.md 标 "T6 全绿"——但 `npm run format:check` 实测**失败**(2 文件无 trailing newline),CI 会红灯。
- 引擎 `setDensity` 不再调 `buildGrid()`,改用 draw 路径每帧 dirty check;实测在**用户未传 `fontSize` 选项**时(`getOptions()` 看似 6,实际 adaptive=4)→ **每帧都触发 `buildGrid`**(完整 cells 重建 + `renderer.resize`)。viewport 800×600 到 3840×2160 均复现,60 帧 60 次 setTransform。
- `useMatrixRain.setTarget(text)` 在 instance 未就绪时缓存的占位 bitmap 是 `{ cols: 0, rows: 0, data: Float32Array(0) }`;mount 完成后自动重放,而 `setTargetBitmap` 第 294 行 **`!Number.isInteger(0) || 0 <= 0` 命中 → throw**`cols 必须是正整数(收到 0)`。靠 `console.warn` 吞错,target 永久无法显示。

均为这一轮 diff 引入。下面给出**最小复现 + 修复点位 + 等级**。详细复现日志见 §4。

---

## 1. 工作树概况

### 1.1 文件改动

```
 package-lock.json                     |   4 +-
 site/src/composables/useMatrixRain.ts | 151 +++++++++++++++++++++++++++--
 site/src/pages/PlaygroundPage.vue     |  89 +++++--------------
 src/engine.ts                         |   8 ++
 src/engine/setters.ts                 | 109 ++++++++++++++++++++-
 types/index.d.ts                      |  45 +++++++++
 6 files changed, 313 insertions(+), 93 deletions(-)
```

### 1.2 类型/构建状态

| 项                | 命令                               | 结果                                                           |
| ----------------- | ---------------------------------- | -------------------------------------------------------------- |
| 包级 type-check   | `npm run type-check`               | ✅ 0 错                                                        |
| 站点级 type-check | `cd site && npx vue-tsc --noEmit`  | ✅ 0 错                                                        |
| smoke             | `npm run test:smoke`               | ✅ 通过                                                        |
| char-gap          | `npm run test:char-gap`            | ✅ 10/10                                                       |
| render-scale      | `npm run test:render-scale`        | ✅ 11/11                                                       |
| dist 体积         | `npm run test:size`                | ✅ raw=98.5KB gzip=29.9KB(实测 30402 B = 29.69 KB,gate ≤ 32KB) |
| **format:check**  | `npx prettier --check` 关键 2 文件 | ❌ **`useMatrixRain.ts` + `PlaygroundPage.vue` 失败**          |

→ task.md "T6 全绿" 与现实不符。

### 1.3 dist 实测体积(本地真值)

| 输出                    | 字节                    |
| ----------------------- | ----------------------- |
| `dist/index.js`         | 100,907 B (98.5 KB)     |
| `dist/index.cjs`        | 101,124 B (98.8 KB)     |
| `dist/index.umd.js`     | 101,371 B (99.0 KB)     |
| `gzip -c dist/index.js` | **30,402 B (29.69 KB)** |

体积无回归。

---

## 2. 问题清单(按严重度)

---

### 🔴 P0-1 · `setDensity` 改 dirty check → 用户未传 `fontSize` 时每帧 rebuildGrid

**位置**: `src/engine.ts:569-578` + `src/engine/setters.ts:560-571`

**改动来由**(diff):

```ts
// OLD
const setDensity = (fontSize: number): void => {
  state.cfg = { ...state.cfg, fontSize };
  hooks.buildGrid(); // 同步 rebuild
};

// NEW (0.6.2)
const setDensity = (fontSize: number): void => {
  const v = Number.isFinite(fontSize) ? Math.max(4, Math.min(64, fontSize)) : 6;
  state.cfg = { ...state.cfg, fontSize: v };
  state.options = { ...state.options, fontSize: v };
  // 不调 hooks.buildGrid —— 改由 draw() 每帧 dirty check 重建
  // 原因:webgl 路径下 buildGrid 内 resizeGrid 在 renderer.init() 未完成时
  //   触发 _vbo 未创建的 race
};
```

draw 路径补的 dirty check(`src/engine.ts:572-578`):

```ts
const wantMaxDPR = Math.min(
  typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1,
  state.cfg.maxDPR
);
if (state.cfg.fontSize !== state.ef || wantMaxDPR !== state.n) {
  buildGrid();
}
```

**Bug 根因**:

1. `state.cfg.fontSize` 在 `createMatrixRainState()` 时被赋值为 `options.fontSize ?? DEFAULTS.fontSize`(`state.ts:534`)→ 用户未传 → **固定为 `6`**。
2. `buildGrid()` 内部根据 viewport 宽度做 adaptive:< 1280 → `state.ef = 4`,3840 → `16`,中间线性(`engine.ts:235-242`)→ 用户未传 `fontSize` 时 `userOverride === undefined`,`state.ef = adaptiveSize`,**不再等于 `cfg.fontSize`**。
3. 所以 `state.cfg.fontSize (6) !== state.ef (e.g. 4)` 永远成立 → **每帧 buildGrid()**。

**实测复现**(用 `test/render-scale.mjs` 的 mock 框架,统计 60 帧期间 `ctx.setTransform` 调用次数。`renderer.resize` 内会触发 setTransform,只在 buildGrid 末尾被调):

| 配置                     | 60 帧 setTransform 数 | 结论            |
| ------------------------ | --------------------- | --------------- |
| 不传 fontSize, 800×600   | **60**                | 🔴 每帧 rebuild |
| 不传 fontSize, 1280×720  | **60**                | 🔴 每帧 rebuild |
| 不传 fontSize, 1920×1080 | **60**                | 🔴 每帧 rebuild |
| 不传 fontSize, 2560×1440 | **60**                | 🔴 每帧 rebuild |
| 不传 fontSize, 3840×2160 | **60**                | 🔴 每帧 rebuild |
| 传 fontSize=6,800×600    | **0**                 | ✅ 正常         |

→ 5 个 viewport 全跨命中。

**进一步证据**(fillText 计数,1 帧 vs 60 帧):

| 配置                   | 1 帧 fillText                    | 60 帧 fillText | 60/1 比 |
| ---------------------- | -------------------------------- | -------------- | ------- |
| 不传 fontSize, 800×600 | 29935(grid 200×150 ≈ adaptive=4) | 1,796,303      | 60.01   |
| 传 fontSize=6          | 13373(grid 134×100)              | 802,421        | 60.00   |
| 传 fontSize=14         | 2494(grid 58×43)                 | 149,380        | 59.90   |

→ 同 viewport 下,不传 fontSize **fillText 翻 2.2 倍**(因为 grid 密度变成 4 而不是 6),且每帧重建 cell 状态会**丢失 trail 累积**(`bright`、`headBright` 都被 `Math.random()` 重新随机化)。

**用户可见后果**:

1. **CPU 帧时间增加** —— buildGrid 在 1080p 下要为 60,720 个 cell 各 push 一个新对象,renderer.resize 重置 backing store(`canvas.width = ...`)
2. **视觉缺陷** —— 每帧 cell.ch / cell.bright / cell.phase / cell.warmth 全部 `Math.random()` 重新随机化(`engine.ts:248-261`)→ 字符**永远闪烁如雪花**,无法形成正常 "字符随机漂移 + 慢速渐变" 的 matrix rain 视觉
3. **target bitmap 永远 racing** —— 第 271 行 `if (state.targetBitmap && state.targetActive && state.targetPhase === 'noise-converge') recomputeTargetLockTimes();` 每帧跑一次 lock times 重算

**影响范围**:**任何不显式传 `fontSize` 的调用方**。这是默认推荐用法(README/Tutorial 多数示例不传)、Hero 组件、`matrix-rain` 元素全覆盖。Playground 自己**总是传 `fontSize: 6`** 所以反而看起来"挺正常"。

**修复建议**(任选其一,不在本审查范围内执行):

- **方案 A(最小)**:dirty check 改用 `state.options.fontSize !== undefined && state.cfg.fontSize !== state.ef`(让 adaptive 路径绕过)
- **方案 B(语义对齐)**:`setDensity` 不再写 `state.options.fontSize`,只写 `state.cfg.fontSize`;dirty check 改成 `state.cfg.fontSize !== (state.options.fontSize ?? adaptiveSize)`,显示算 adaptive
- **方案 C(回滚)**:`setDensity` 重新调 `hooks.buildGrid()`;为了 webgl race,只在 webgl 路径 `init()` 完成后 set 一个 ready flag,未 ready 时 buildGrid 早返回(延迟到下一帧)

任一方案上线前**必须**加 1 个回归测试:`不传 fontSize,跑 60 帧,期望 setTransform = 0(或 ≤ 2)`。否则下个开发者会再次踩坑。

---

### 🔴 P0-2 · `useMatrixRain.setTarget()` 占位 bitmap `{cols:0, rows:0}` 会让自动恢复抛错

**位置**: `site/src/composables/useMatrixRain.ts:170-186` + `133-145`

```ts
// 170-186
const setTarget = (text: string): boolean => {
  const cv = canvasRef.value;
  const inst = instance.value;
  if (!cv || !inst) {
    // instance 未就绪,缓存 args 等下次 mount 重放
    const o = unref(optionsRef);
    lastTargetArgs = {
      // 没有真实 cols/rows,先占位等下次 setTarget 重算
      bm: { cols: 0, rows: 0, data: new Float32Array(0) },   // 🔴
      phase: o.targetPhase ?? 'fade',
      ...
    };
    return false;
  }
  ...
};
```

mount() 后的自动恢复(133-145):

```ts
if (lastTargetArgs && instance.value) {
  try {
    instance.value.setTargetBitmap(lastTargetArgs.bm, { ... });   // 🔴 会 throw
  } catch (e) {
    console.warn('[useMatrixRain] failed to restore target bitmap after mount:', e);
  }
}
```

`setTargetBitmap` 的校验(`src/engine/setters.ts:294-299`):

```ts
if (!Number.isInteger(wrapCols) || wrapCols <= 0) {
  throw new Error(`setTargetBitmap: cols 必须是正整数(收到 ${wrapCols})`);
}
if (!Number.isInteger(wrapRows) || wrapRows <= 0) {
  throw new Error(`setTargetBitmap: rows 必须是正整数(收到 ${wrapRows})`);
}
```

**触发路径**:

1. PlaygroundPage `onMounted(() => setTimeout(() => rain.setTarget(targetText.value), 250))`(409 行)
2. 但用户进 Playground 时,默认参数下**会先触发 renderKey 重建一次**(因为 canvasRef 从 `null` → element,`renderKey` 第一个非空值)→ useMatrixRain 进入 mount() async 流程
3. 若 250ms 后 mount() 还在 await softDestroy / await matrixRain init(WebGL atlas PNG 加载约 50-200ms)→ `inst.value === null` → setTarget 进 if 分支,缓存垃圾 bitmap
4. mount 完成后第 133 行自动重放 → throw → console.warn → **target 永远不显示**
5. 此后用户拖 targetText slider 才会重新算 bitmap → 但此时 `lastTargetArgs.bm` 已经被覆盖

注释说"等下次 setTarget 重算"——但**没有任何机制保证 setTarget 会被再次调用**。如果用户的第一波操作是改 theme 而非 targetText,那么 renderKey 触发的重建会反复用这个垃圾 bitmap,每次都 throw。

**实测可信度**:`task.md` §八 自己的"运行时调试"记录已经命中过这个 race(原文 411-412):

> 诊断到 1 个调试引入 bug:原本 setTarget 添加 console.log 时顺序错了,`'o' before initialization` → 已修复

但 0,0 bitmap 这一项**没有被命中**——因为 task.md 实测时是手动改 targetText 触发覆盖。**自动化或用户不改 targetText 的场景下,该 bug 100% 触发**。

**修复建议**:

- 占位分支**不要**塞 placeholder bitmap;直接缓存 `pendingText: string` 即可:

```ts
if (!cv || !inst) {
  pendingText = text; // ★ 只记 text,不算 bitmap
  return false;
}
// mount() 完成后:
if (pendingText !== null) {
  setTarget(pendingText);
  pendingText = null;
}
```

或者占位时直接 `lastTargetArgs = null` + 在 mount 末尾不重放占位,只重放真实 bitmap。

---

### 🟠 P1-1 · `setDensity` 静默改写 `state.options.fontSize` 破坏 adaptive 语义

**位置**: `src/engine/setters.ts:567-571`

```ts
const setDensity = (fontSize: number): void => {
  const v = Number.isFinite(fontSize) ? Math.max(4, Math.min(64, fontSize)) : 6;
  state.cfg = { ...state.cfg, fontSize: v };
  state.options = { ...state.options, fontSize: v }; // 🟠 这是行为变化
};
```

**老行为**:

- 用户**不传** `fontSize` → `options.fontSize === undefined` → buildGrid 永远走 adaptive(720p→6, 4K→16)
- 即便用户在运行时调 `setDensity(8)` 切到 8,只改 `cfg.fontSize`;后续 resize 时 buildGrid 仍读 `options.fontSize === undefined` → 仍 adaptive

**新行为**:

- 一旦调过 `setDensity(8)`,`options.fontSize = 8` 被强制写入 → 后续 resize 时 `userOverride !== undefined` → 永远固定 8,不再 adaptive

**影响**:`matrix-rain-element.ts:152` 在 `font-size` 属性变化时调 `setDensity(n)`(类似响应式)→ 一旦用户改过一次 font-size,从此元素切设备 / resize 也不会自适应。

**是否真有用例需要 adaptive**?有 —— 项目本身 README 推荐用法就是不传 fontSize 让引擎自适应。这条隐式改变会让 web component 用户感到"很奇怪"。

**修复建议**:`setDensity` 只写 `state.cfg.fontSize`,不写 `state.options.fontSize`(保留 options 作为 "用户原意" 不可变),或者把 dirty check 改成不依赖 `state.options.fontSize` 一致性。

---

### 🟠 P1-2 · `useMatrixRain` 软更新 watch 无 await——多个 setter 串联抛错会跳过后续

**位置**: `site/src/composables/useMatrixRain.ts:288-319`

```ts
watch(effectKey, (_n, _o, onCleanup) => {
  const inst = instance.value;
  if (!inst) return;
  const o = unref(optionsRef);
  try {
    if (typeof o.theme === 'string') inst.setTheme(o.theme);
    if (o.fontSize !== undefined) inst.setDensity(o.fontSize);
    if (o.coldPalette && o.warmPalette) inst.setPalettes(o.coldPalette, o.warmPalette);
    ...
    // 11 个 setter 串成一根烟囱
    if (o.targetLockStability !== undefined) inst.setTargetLockStability(o.targetLockStability);
  } catch (e) {
    console.error('[useMatrixRain] soft update failed:', e);
  }
});
```

**问题**:

1. **大 try 块吞错**——任一 setter 抛错,后面 11 个全跳过;下次 effectKey 变化时上次没设的值不会补设。
2. **每次 effectKey 变化都把 11 个 setter 全调一遍**——即使用户只改了 `theme`,也会 `setDensity` / `setTrailAlpha` / `setMaxDPR` / `setTargetPhase` / 5 个 target setter 全调一次。
   - `setTargetPhase` 有 `if (state.targetPhase === phase) return;` 的快路径(setters.ts:611)→ 没问题
   - `setTargetLockOrder` 有(638 行)→ 没问题
   - `setTargetNoiseDuration` / `setTargetConvergeDuration` **没有快路径**(617-623, 627-633),每次都会 `recomputeTargetLockTimes()` ——这是 O(cells) 操作

   见 §P2-1。

**修复建议**:细分 watch(Vue 推荐),按 setter 拆 11 个 watcher;或者每个 setter 内部加 `if (value === currentValue) return` 快路径;或者把 try 缩小到每个 setter 一个。

---

### 🟡 P2-1 · 5 target setter 中 2 个缺"相同值快路径",effectKey 变化时多余 `recomputeTargetLockTimes`

**位置**: `src/engine/setters.ts:617-633`

```ts
const setTargetNoiseDuration = (dur: number): void => {
  const v = Number.isFinite(dur) ? Math.max(0, dur) : 0;
  state.targetNoiseDuration = v;
  if (state.targetPhase === 'noise-converge' && state.targetBitmap && state.targetActive) {
    hooks.recomputeTargetLockTimes(); // 🟡 没有 "未变化跳过"
  }
};

const setTargetConvergeDuration = (dur: number): void => {
  const v = Number.isFinite(dur) ? Math.max(0.001, dur) : 1.5;
  state.targetConvergeDuration = v;
  if (state.targetPhase === 'noise-converge' && state.targetBitmap && state.targetActive) {
    hooks.recomputeTargetLockTimes(); // 🟡 同上
  }
};
```

`recomputeTargetLockTimes` 是 O(cells) 遍历(给每个 target cell 算 lock 时间)。effectKey 触发一次,P1-2 把 2 个都调了——即便用户只改 theme,也跑 2 次 `recomputeTargetLockTimes`。

**修复建议**:像 `setTargetPhase` 那样加 `if (state.targetNoiseDuration === v) return;`。

---

### 🟡 P2-2 · `format:check` 失败 —— 2 文件无 trailing newline,CI 会红灯

**实测**:

```
$ npx prettier --check site/src/composables/useMatrixRain.ts site/src/pages/PlaygroundPage.vue
[warn] site/src/composables/useMatrixRain.ts
[warn] site/src/pages/PlaygroundPage.vue
[warn] Code style issues found in 2 files.
```

末尾字节(od -c):

| 文件                 | 末尾                                           |
| -------------------- | ---------------------------------------------- |
| `useMatrixRain.ts`   | `... { setTarget });\n}` (无 trailing newline) |
| `PlaygroundPage.vue` | `... }\n}\n</style>` (无 trailing newline)     |

`.husky/pre-commit` + `lint-staged.config.cjs` 启用了 prettier,本地 commit 会被拦——但工作树未 commit,task.md 已经说"全绿"。**与现实不符**。

**修复**:运行 `npx prettier --write` 或手动加 `\n`。

---

### 🟡 P2-3 · `setMaxDPR` 不写 `state.options.maxDPR`(与 `setDensity` 处理不一致)

**位置**: `src/engine/setters.ts:588-592`

```ts
const setMaxDPR = (dpr: number): void => {
  const v = Number.isFinite(dpr) ? Math.max(0.5, Math.min(4, dpr)) : 1;
  state.cfg = { ...state.cfg, maxDPR: v };
  // 🟡 没有 state.options = { ..., maxDPR: v }
};
```

而 `setDensity` 同时写 `cfg + options`(P1-1 说这是 bug,但起码做了)。同 setters 一致性差。`getOptions()` 会返回不正确的 maxDPR(用户调过 `setMaxDPR(3)` 之后 `getOptions().maxDPR` 还是初始值)。

**修复**:统一约定,要么都不写,要么都写。我建议**都不写**(options 是 "user intent",cfg 是 "current state",不应混淆)。

---

### 🟡 P2-4 · 注释/类型与实现不符 · `setMaxDPR` JSDoc 写"触发 buildGrid",代码不触发

**位置**: `types/index.d.ts:559-565`

```ts
/**
 * 0.6.2+: 动态调整 DPR 上限(0.5-4)· 触发 buildGrid     ← 🟡 谎话
 * - 钳到 [0.5, 4];非有限数 → 1
 * - 重建 canvas backing store 尺寸,不影响字符间距/fontSize
 */
setMaxDPR(dpr: number): void;
```

实现里**不触发** `buildGrid`(setters.ts:591),依赖 `engine.ts:572-578` 的 dirty check(`wantMaxDPR !== state.n`)在下一帧 draw 时触发。注释会误导调用方,以为是同步 rebuild。

**修复**:JSDoc 改成 "不主动触发 buildGrid,下一帧 draw 路径 dirty check 命中后重建"。

---

### 🟡 P2-5 · `setTransform` 0 次 vs 60 次的行为差异未文档化,易让后人误判 bug

`setDensity` JSDoc 自己说(setters.ts:558-565):

```
* @since 0.6.2+ 不再主动调 buildGrid
* 原因:webgl 路径下 buildGrid 内的 resizeGrid 在 renderer.init() 未完成时
*   会触发 _vbo 未创建的 race(INVALID_OPERATION: bufferData: no buffer)
* draw 每帧调,保证 renderer 已 ready 后才 buildGrid
```

这话**回避了** dirty check 在"用户不传 fontSize"时永远命中的 P0-1 后果,反而让人以为"draw 每帧调 dirty check 是安全的"。一旦未来有人想 backport 此模式到 charGap / renderScale 等其他字段,就会再次踩 P0-1 同款坑。

**修复建议**:JSDoc 补一句"前提:dirty check 字段必须在 cfg 与 ef 同语义对齐(adaptive 时两者会不等,需特殊处理)"。

---

## 3. 通过项 ✅

不一一列了,捡几个反直觉的:

- `setTargetPhase` / `setTargetLockOrder` 都有 "相同值快路径"(setters.ts:611, 638)——避免了 P2-1 同款问题。
- `useMatrixRain` `onBeforeUnmount` 末尾清理 `lastTargetArgs = null`(useMatrixRain.ts:235)——避免跨 route 残留缓存。
- `PlaygroundPage` 删 `inputRaf`(原 inputRaf 节流逻辑)与 `regenerate` 内部 watch—— `useMatrixRain` 集中处理后单一职责清晰。
- `engine.ts:796-803` instance 对象上挂 7 个新 setter——挂载齐全,没遗漏。
- `types/index.d.ts:550-595` 8 个新方法签名都 export 了,JSDoc 模式与现有保持一致。
- `setTarget` 内部 `o.fontSize ?? 6` 兜底(useMatrixRain.ts:190)与 DEFAULTS.fontSize 一致——这就是为什么 Playground 自己看起来"正常",它**总是显式传 6**,绕过了 P0-1 的触发条件。
- 实测 dist 体积 30.4 KB ≤ 32 KB gate——本轮 +7 setter 增加 ~1 KB,余量充足。
- `npm test` 现有 25 项全跑通——没破坏既有行为(因为没有任何测试覆盖"不传 fontSize + 多帧 setTransform 计数")。

---

## 4. 关键复现日志

### 4.1 dirty check 复现(P0-1)

挂 `MockContext2D.prototype.setTransform` 计数,跑 60 帧:

```
==== viewport 800x600, 不传 fontSize ====
60 帧 setTransform 调用次数: 60      🔴
==== viewport 1280x720, 不传 fontSize ====
60 帧 setTransform 调用次数: 60      🔴
==== viewport 1920x1080, 不传 fontSize ====
60 帧 setTransform 调用次数: 60      🔴
==== viewport 2560x1440, 不传 fontSize ====
60 帧 setTransform 调用次数: 60      🔴
==== viewport 3840x2160, 不传 fontSize ====
60 帧 setTransform 调用次数: 60      🔴

==== 对照:viewport 800x600, 显式传 fontSize: 6 ====
60 帧 setTransform 调用次数: 0       ✅
```

fillText 计数(进一步确认 grid 维度差):

```
==== 不传 fontSize, viewport 800x600 ====
1 帧 fillText:  29935  (grid 200×150 = 30000,adaptive=4)
60 帧 fillText: 1796303
60/1 = 60.01

==== 显式传 fontSize: 6 ====
1 帧 fillText:  13373  (grid 134×100 = 13400)
60 帧 fillText: 802421
60/1 = 60.00

==== 显式传 fontSize: 14 ====
1 帧 fillText:  2494   (grid 58×43 ≈ 2494)
60 帧 fillText: 149380
60/1 = 59.90
```

→ 同 viewport 下不传 fontSize 的 fillText 是显式传 6 的 **2.24 倍**(因为 grid 密度 4 vs 6)。

### 4.2 setTargetBitmap 抛错复现(P0-2)

`setTargetBitmap({ cols: 0, rows: 0, data: new Float32Array(0) })` 必经 `setters.ts:294-299` 的:

```ts
if (!Number.isInteger(wrapCols) || wrapCols <= 0) {
  throw new Error(`setTargetBitmap: cols 必须是正整数(收到 0)`);
}
```

→ `useMatrixRain.ts:133-145` 自动重放时一定命中 `catch (e) { console.warn(...) }`。Playground 视觉上"target 没出现",但浏览器 console.warn 一行。

### 4.3 format:check 失败复现(P2-2)

```
$ npx prettier --check site/src/composables/useMatrixRain.ts site/src/pages/PlaygroundPage.vue
Checking formatting...
[warn] site/src/composables/useMatrixRain.ts
[warn] site/src/pages/PlaygroundPage.vue
[warn] Code style issues found in 2 files. Run Prettier with --write to fix.
```

---

## 5. 修复优先级建议(不在本审查范围)

| 优先级  | 工作量 | 描述                                                                                         |
| ------- | ------ | -------------------------------------------------------------------------------------------- |
| 🔴 P0-1 | 30 min | dirty check 改 `state.options.fontSize !== undefined && cfg !== ef`,加 setTransform 回归测试 |
| 🔴 P0-2 | 15 min | setTarget 不存占位 bitmap,改 `pendingText: string \| null`                                   |
| 🟠 P1-1 | 10 min | setDensity 不写 `state.options.fontSize`                                                     |
| 🟠 P1-2 | 20 min | watch effectKey 拆 try 块或拆 11 个 watcher                                                  |
| 🟡 P2-1 | 5 min  | 2 setter 加 "相同值快路径"                                                                   |
| 🟡 P2-2 | 1 min  | `prettier --write` 修 trailing newline                                                       |
| 🟡 P2-3 | 2 min  | setMaxDPR 是否写 options 与 setDensity 统一                                                  |
| 🟡 P2-4 | 1 min  | 修 JSDoc 谎话                                                                                |
| 🟡 P2-5 | 5 min  | setDensity JSDoc 补 dirty-check 注意事项                                                     |

**回归测试建议**(并入 npm test):

```js
// test/dirty-check-fontsize.mjs(新)
const inst = matrixRain({ fixedTimeStep: true }); // 不传 fontSize
tickRAF(1);
__setTransformCount = 0;
tickRAF(60);
assert.equal(__setTransformCount, 0, '不传 fontSize 时,60 帧不应触发 buildGrid');
```

---

## 6. 与 MEMORY 中"调试深度边界"原则对照

`feedback_debug_depth_boundary.md` 写过:"诊断兔子洞超过 2 处源码改动 + 30 分钟未果就停"。本轮 task.md 改了 6 文件 313/93 +/-,触达 setters / engine / types / useMatrixRain / PlaygroundPage 5 个层,且**新引入 1 个跨文件 race(P0-2)和 1 个全场景性能 P0**——已经"超出兔子洞边界"。

建议:

- **冻结本轮 diff,先 prettier + 修 P0-1 / P0-2 + 加回归测试再 commit**
- **下一轮把 webgl race(setDensity 不能调 buildGrid 的原始动因)做单独 PR** —— 不要把性能优化和 race 修复混在一起
- 0.6.2 这个版本号还没发布,**还有机会回收**

---

## 7. 结论

本轮 task.md 的目标(Playground 调参不报错)**功能层达成**(12 个 slider 都能响应了),但:

- **引入 2 个 P0**(全场景性能 / 自动恢复抛错)
- **task.md 说的 "T6 全绿"** 与现实不符(format:check 失败)
- **测试套件没覆盖**关键新路径(dirty check / setTarget mount race / format:check)

工作树状态:**不建议直接 commit**,先修 §5 的 P0-1 + P0-2 + P2-2 再走 husky pre-commit。
