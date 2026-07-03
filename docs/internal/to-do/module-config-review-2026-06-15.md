# task_byds.md — 模块配置项审查 & 开发方向

> 日期：2026-06-15  
> 基于：对 `MatrixRainOptions`（62 配置项）、`MatrixRainState`、`setters.ts`、`matrix-rain-element.ts`、`ARCHITECTURE.md` 的全面审查

---

## 一、审查发现

### P0-1 · ARCHITECTURE.md 文档与源码不一致 — `targetMotion`

| 位置                                     | 内容                                  |
| ---------------------------------------- | ------------------------------------- | ------- | -------- | -------- |
| ARCHITECTURE.md §3.5 第 265 行           | `motion: 'none'                       | 'drift' | 'wave'   | 'pulse'` |
| types/index.d.ts 第 401 行               | `targetMotion?: 'static'              | 'drift' | 'bounce' | 'float'` |
| src/engine/draw-helpers.ts 第 598-611 行 | 实际实现 `drift` / `bounce` / `float` |

**结论**：源码（类型定义 + engine）是正确的，ARCHITECTURE.md 描述的 `wave` / `pulse` 并不存在，`none` 应改为 `static`。需要更新架构文档。

**方向**：更新 ARCHITECTURE.md §3.5 表格中的 motion 字段值。

---

### P0-2 · `ascii` 变体未真正独立（遗留 U-08）

`ascii` 的 `VARIANT_DEFAULTS` 与 `classic` 完全一致（types/index.d.ts 第 107-118 行），字符集也未独立。`ascii` 作为 `VariantName` 存在但行为与 `classic` 完全相同——这是一个虚假配置项。

**方向 A**（推荐）：为 `ascii` 实现真正的差异化——独立的 ASCII 字符集（如加入字母、符号），默认参数微调。  
**方向 B**：从 VariantName 中移除 `ascii`，标注为 breaking change。

---

### P1 · Web Component 属性暴露不足

当前 `OBSERVED_ATTRS` 仅 6 个：

`theme` | `variant` | `font-size` | `charset` | `render-scale` | `renderer`

应补充的高频属性：

| 属性            | 对应 option    | 说明                            |
| --------------- | -------------- | ------------------------------- |
| `trail-alpha`   | `trailAlpha`   | 残影 alpha，核心视觉效果        |
| `flicker-speed` | `flickerSpeed` | 闪烁速度倍率                    |
| `target-fps`    | `targetFPS`    | 省电模式关键参数                |
| `opacity`       | (新增)         | wrapper 透明度，当前硬编码 0.85 |
| `cursor`        | `cursor`       | 鼠标光标样式                    |

**方向**：扩展 `OBSERVED_ATTRS` 到 10+ 个，实现 `attributeChangedCallback` 对应的热更新逻辑。

---

### P2-1 · `cursor: false` 语义不清

**types/index.d.ts** 第 183 行：`CursorOption = 'none' | 'crosshair' | 'pointer' | 'default' | false`  
**src/engine/state.ts** 第 674-676 行：

```ts
canvas.style.cursor = options.cursor === false ? 'default' : options.cursor;
```

用户传 `cursor: false` 的实际效果是设为 `'default'`，但语义上应表示「不设置 cursor 样式」（跳过赋值）。

**方向**：改为 `false` → 跳过赋值，`undefined` → 跳过赋值，`'default'` → 显式设为 `default`。

---

### P2-2 · wrapper 透明度硬编码

**src/engine/state.ts** 第 667-669 行：

```ts
wrapper.style.cssText = `…opacity:0.85;`;
```

`opacity: 0.85` 和 `z-index: 0` 均硬编码，无配置项。

**方向**：增加 `wrapperOpacity?: number` 和 `wrapperZIndex?: number` 选项，默认值保持 0.85 / 0。同时 Web Component 应暴露对应 attribute。

---

### P3-1 · 缺少运行时可热更新的 setter

以下字段在 `state` 中存在但无公开 setter：

| 字段                     | 说明         |
| ------------------------ | ------------ |
| `warmthLerp`             | 阻尼跟随系数 |
| `warmthRadius`           | 温度光晕半径 |
| `lightCenter`            | 温度光心位置 |
| `driftSpeed`             | 光心漂移速度 |
| `flicker` (flickerRates) | 闪烁概率阶梯 |

**方向**：为这些字段增加 `setWarmthLerp()`、`setWarmthRadius()`、`setLightCenter()`、`setDriftSpeed()`、`setFlickerRates()` 方法。

---

### P3-2 · `setPalettes` 不支持过渡动画

`setTheme` 支持 HSL 插值过渡（C1），但 `setPalettes` 直接切换 LUT，「备注:不走打断逻辑」。类型定义中也无 `dur` / `easing` 参数。

**方向 A**：在 `setPalettes` 中加入可选的 `dur` / `easing` 参数，实现与 `setTheme` 一致的平滑过渡。  
**方向 B**：保持现状，在文档中明确标注这是「硬切换」。

---

## 二、推荐开发优先级

### 第一阶段 — 修 bug / 补文档（1-2 天）

- [ ] **P0-1**：更新 ARCHITECTURE.md §3.5 中 `targetMotion` 的枚举值为 `static | drift | bounce | float`
- [ ] **P0-2**：为 `ascii` 变体实现独立字符集 + 参数差异（或移除）
- [ ] **P2-1**：修复 `cursor: false` 语义（跳过赋值而非设为 `default`）

### 第二阶段 — 补 setter / Web Component（2-3 天）

- [ ] **P1**：扩展 `OBSERVED_ATTRS` 到 10+ 个，实现对应热更新
- [ ] **P3-1**：增加 `setWarmthLerp()`、`setWarmthRadius()`、`setLightCenter()`、`setDriftSpeed()`、`setFlickerRates()`
- [ ] **P2-2**：增加 `wrapperOpacity` / `wrapperZIndex` 配置项 + Web Component attribute

### 第三阶段 — 过渡增强（可选）

- [ ] **P3-2**：为 `setPalettes` 加入可选过渡参数

---

## 三、已确认无问题的项（排除）

| 项目                         | 验证结果                                                                    |
| ---------------------------- | --------------------------------------------------------------------------- |
| `targetMotion` 类型定义      | ✅ 与 draw-helpers.ts 实现一致（drift/bounce/float）                        |
| `colorOverrides` 对象形式    | ✅ draw-helpers.ts 第 113-114、807-808 行正确处理了 Record<number, [r,g,b]> |
| `targetMotion` 在 setters.ts | ✅ `setTargetBitmap` 支持 opts.motion / opts.motionSpeed 热更新             |
| `render-scale` Web Component | ✅ 已暴露                                                                   |
| `renderer` Web Component     | ✅ 已暴露                                                                   |
