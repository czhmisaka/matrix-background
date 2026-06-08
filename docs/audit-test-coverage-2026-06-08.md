# Test Coverage Audit · 2026-06-08

> 范围:`test/*.mjs` × `src/**/*.ts` 覆盖关系审计 + 缺失用例补全建议
> 日期:2026-06-08
> 基线:commit `21e132d`(text-fit.mjs 100 个组合通过)

---

## TL;DR

- **`npm test` 当前跑 9 个测试文件**(test/ 目录共 11 个,`esm-load.mjs` 和 `usability.mjs` 走 `npm run test:esm` / `test:usability` 单独跑)
- **9 个主测试文件,85+ 测试用例,全部通过**(0 failed)
- **0 覆盖模块(关键用户面)**:`src/themes.ts`(主题配置)、`src/fps-overlay.ts`(FPS 角标)、`src/matrix-rain-element.ts`(Web Component)、`src/palette-lut.ts`(LUT 优化)
- **0 覆盖的子模块**:`src/curves/waves.ts`(evalWave / channelsToCode)、`src/curves/lut.ts`(buildLUT / sampleLUT)、`src/curves/presets.ts`(PRESETS)、`src/variant-defaults.ts`(VARIANT_DEFAULTS)
- **0 覆盖的 API**:`textToBitmap` 的**空字符串/超长/Unicode 边界**未测;`imageToBitmap` / `fileToImage` 完全没测
- **建议新增 4 个测试文件**(总估 ~70 个用例),P0 优先级先补 `themes.mjs` 和 `edge-cases.mjs`

---

## 1 · 当前测试矩阵(npm test 跑的 9 个文件)

| # | 文件 | 主断言数 | 通过 | 失败 | 覆盖点 |
|---|------|----------|------|------|--------|
| 1 | `smoke.mjs` | 1 组(11 个 assert) | ✅ | 0 | dist ESM 加载 + 5 主题 shape 验证 |
| 2 | `leak.mjs` | 1 组(2 个子断言) | ✅ | 0 | 1000× create/destroy 监听器无泄漏 |
| 3 | `frame-rate.mjs` | 6 | ✅ | 0 | dt 时间基准 / ErrorBoundary / reduced-motion / fixedTimeStep |
| 4 | `events.mjs` | 10 | ✅ | 0 | onFrame / onThemeChange / onTargetFinish / getDiagnostics |
| 5 | `sandbox.mjs` | 29 | ✅ | 0 | compileUserFunction 黑名单 + 合法代码接受 |
| 6 | `noise-converge.mjs` | 6 | ✅ | 0 | 5 段状态机 + lockOrder + 多次 setTargetBitmap 状态不累积 |
| 7 | `canvas-remove.mjs` | 15 | ✅ | 0 | destroy() 保留用户 canvas / wrapper 自删除 |
| 8 | `transitions.mjs` | 8 | ✅ | 0 | A1/A3/A4/C1/C2/D1/E1 + 向后兼容 |
| 9 | `text-fit.mjs` | 9 组(100 组合) | ✅ | 0 | 4 fitMode × 5 text × 5 fontSize + 引擎兜底 + 跨调用 |
| **合计** | **9 文件** | **~85 用例** | **✅ 全过** | **0** | |

**额外 2 个文件(走独立 npm 脚本)**:

| 文件 | 触发命令 | 主断言数 | 覆盖点 |
|------|----------|----------|--------|
| `esm-load.mjs` | `npm run test:esm` | 4 段 | ESM/CJS 双轨加载 + core.d.ts 内容 |
| `usability.mjs` | `npm run test:usability` | 10 | setTheme 行为一致性 / keepPaletteParams / 编译失败静默 fallback |

**总计:`test/*.mjs` 共 11 个文件,~100 用例**

---

## 2 · 覆盖对照表(test/*.mjs × src/ 下模块)

> ✅ = 直接测试过(导入 + 调用 + 断言) · ⚪ = 间接覆盖(只是从模块导入,未独立断言) · ❌ = 完全没碰过

| src 模块 | 主要导出 | smoke | leak | frame-rate | events | sandbox | noise-conv | canvas-rm | transitions | text-fit | esm-load | usability |
|----------|----------|:-----:|:----:|:----------:|:------:|:-------:|:----------:|:---------:|:----------:|:--------:|:--------:|:---------:|
| `src/index.ts` | matrixRain, MatrixRain, themes, textToBitmap, MatrixRainElement, mountFpsOverlay | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `src/core.ts` | themes, VARIANT_DEFAULTS, hslToRGBA, applyTP, PaletteLUT, PRESETS, compileUserFunction, validateUserFunction, ease | ⚪ | ❌ | ❌ | ❌ | ⚪ | ❌ | ❌ | ❌ | ❌ | ⚪ | ⚪ |
| `src/engine.ts` | matrixRain, MatrixRainInstance, onFrame, onThemeChange, onTargetFinish, onResize, setTargetBitmap, clearTargetBitmap, setTheme, setVariantParams, getDiagnostics, getFPS, getTransitionAlpha | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `src/bitmap.ts` | textToBitmap, imageToBitmap, fileToImage, FitMode | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `src/themes.ts` | themes(5 套 HSL 调色板) | ⚪ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚪ | ⚪ |
| `src/palette-lut.ts` | LUT_SIZE, hslToRGBA, applyTP, PaletteLUT, RGBALUT | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `src/matrix-rain-element.ts` | MatrixRainElement(Web Component `<matrix-rain>`) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `src/fps-overlay.ts` | mountFpsOverlay, FpsOverlayHandle | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `src/variant-defaults.ts` | VARIANT_DEFAULTS(4 变体初始参数) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `src/curves/sandbox.ts` | compileUserFunction, validateUserFunction, ease, SAFE_GLOBALS | ❌ | ❌ | ❌ | ⚪ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `src/curves/waves.ts` | WAVE_TYPES, COMBINE_MODES, evalWave, evalChannels, channelsToCode | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `src/curves/lut.ts` | LUT_RESOLUTION, CONTROL_POINTS, buildLUT, sampleLUT, controlPointsToCode | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `src/curves/presets.ts` | PRESETS, Preset type | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**说明**:
- ⚪ 表示只在 mock 构造时被导入(例如 `themes` 出现在 ESM 加载),但没有针对其行为做断言
- `engine.ts` 是**唯一**被多个测试深度覆盖的模块(8 个文件直接 import)
- 4 个 ⚪ 标记的"themes"行(在 smoke/esm-load/usability)都是只检查 `themes` 是 object 或 keys 长度,没断言每个主题的 cold/warm 数值范围是否合理

---

## 3 · 0 覆盖模块清单(按"用户最常调"排序)

### 3.1 `src/themes.ts` — 5 主题配置(用户最常调) 🔴

**覆盖状态**:⚪ 间接(只在 smoke 里检查 cold.h/s/lMin/lMax 类型是 number)

**缺失覆盖**:
- 5 个主题 cold/warm 数值是否在合法范围(`h ∈ [0, 360]`,`s ∈ [0, 1]`,`lMin < lMax`)
- 5 主题冷暖对色相是否真的拉开(`|cold.h - warm.h| > 30°`,避免撞色)
- chroma/brightness/contrast 等 TP 字段是否合理(没有 NaN、没有负数)
- `pure-mono` 应满足 `s === 0`(灰阶)
- 切换主题的 onThemeChange 事件触发 + 实际 cold/warm 引用真换了(usability.mjs 只测了不抛错,没断言 ref 真的变)

### 3.2 `src/fps-overlay.ts` — FPS 显示覆盖层 🟡

**覆盖状态**:❌ 完全 0 覆盖

**缺失覆盖**:
- `mountFpsOverlay()` 创建 DOM 节点 / 注入 style
- rAF 循环更新 FPS 文本(高/低 FPS 时 class 切换 `.low`)
- `destroy()` 移除 DOM 节点
- 多次 mount 不重复注入 style(`getElementById('__mr-fps-overlay-css')` 兜底)
- `__matrixRainDebug` hook(avgFps / count / instances)正确读出
- SSR 兜底(`document === undefined` 时返回 noop)

### 3.3 `src/matrix-rain-element.ts` — Web Component 🟡

**覆盖状态**:❌ 完全 0 覆盖

**缺失覆盖**:
- `<matrix-rain>` 标签自动注册(`customElements.define`)
- `connectedCallback` 启动实例 / `disconnectedCallback` 销毁
- 4 个 observedAttributes(`theme` / `variant` / `font-size` / `charset`)动态变化触发 reload
- 编程 API:`el.theme = '...'` / `el.setVariant('ripple')` / `el.fps` / `el.instance` / `el.destroy()`
- variant / charset 变化时 `_reload()` 重建实例(不 crash)
- SSR 兜底(`HTMLElement === undefined` 时 extends 空类不崩)

### 3.4 `src/palette-lut.ts` — Palette LUT 优化 🟡

**覆盖状态**:❌ 完全 0 覆盖(只在 engine 内部间接走)

**缺失覆盖**:
- `hslToRGBA(palette, l)` 在 `l = 0/0.5/1`、`s = 0`(灰阶)、各 hue 区间(0-60/60-120/.../300-360)返回正确 RGB
- `applyTP` 各分支(brightness / contrast / lightnessShift / saturationShift / chroma / hueShift / invertHue)独立正确
- `PaletteLUT.setPalettes` 身份比较(`!==` 避免无意义重建)
- `getColdFinal` / `getWarmFinal` hash cache:相同 tp+hue 第二次直接 return(无重建)
- `getColdFinal` tp 变化时正确重建并更新 hash
- S=0 灰阶 fallback
- `aMax` 缺省时默认 1.0
- `l` 超出 [0,1] 被 clamp

### 3.5 `src/bitmap.ts` 部分 API — imageToBitmap / fileToImage 🟢

**覆盖状态**:`textToBitmap` 已 100 组合测过;`imageToBitmap` / `fileToImage` 完全 0 覆盖

**缺失覆盖**:
- `imageToBitmap` 4 fitMode(contain/cover/actual/auto)在 mock canvas 下输出正确 cols/rows/data 长度
- `fileToImage` 返回 Promise,`onload` / `onerror` 路径
- 空 Blob / 不支持的 image format 走 `reject`

### 3.6 `src/curves/*` 大量 API ❌

| 模块 | 0 覆盖 API | 备注 |
|------|------------|------|
| `curves/waves.ts` | `evalWave` / `evalChannels` / `channelsToCode` | PRESETS 内部用,没单测 |
| `curves/lut.ts` | `buildLUT` / `sampleLUT` / `controlPointsToCode` | LUT 端点插值,核心工具 |
| `curves/presets.ts` | `PRESETS` 全部 | 13+ 个预设(noise/sin/pulse...)没被遍历断言 |
| `curves/sandbox.ts` | `SAFE_GLOBALS` / `noise()` / 步数限制 | sandbox.mjs 测了入口,内部 noise 没断言 |

### 3.7 `src/variant-defaults.ts` ❌

**覆盖状态**:完全 0 覆盖(4 个变体的 phaseStep / chUpdateProb / headBright 等)

---

## 4 · 建议新增的 4 个测试文件

### 4.1 `test/themes.mjs` — 主题配置 + 切换行为 ⭐ P0

**目标**:覆盖 `src/themes.ts` + 增强 `setTheme` 测试
**估计测试数**:~18 个

```
[Test 1]  5 主题对象结构断言(cold.h 0-360、s 0-1、lMin<lMax、aMax 0-1)
[Test 2]  5 主题冷暖色相间隔 > 30°(避免撞色)
[Test 3]  5 主题 brightness/chroma/contrast 在合理范围(无 NaN、无负、无极端)
[Test 4]  pure-mono 灰阶验证(cold.s === 0 && warm.s === 0)
[Test 5]  lava-red 暖色 h ∈ [0, 50] 范围(橙红)
[Test 6]  matrix-green 冷色 h ∈ [100, 160](绿)
[Test 7]  setTheme 切换后 cold/warm 调色板引用 === !== (实际换了)
[Test 8]  setTheme 切换后冷暖数值真的更新了(数值比较)
[Test 9]  setTheme 未知主题 → console.warn 含主题列表(已在 usability.mjs 测,这里补强)
[Test 10] 主题不可变性:themed() 返回的对象冻结 / 不可修改引擎共享状态
[Test 11] 5 主题冷暖 7 字段 × 5 主题 = 35 个 TP 数值 cross-check(全在 number 范围)
[Test 12] keepPaletteParams: 切主题后 ctp/wtp 真的保留
[Test 13] 切主题后 onThemeChange 触发顺序与名字一致
[Test 14] 反复切主题 100 次无内存泄漏(与 leak.mjs 同模式)
[Test 15] 切到同主题不重启 transition(noop)
[Test 16] 主题 A → B → A,B 期间被拦截
[Test 17] 切主题期间 HSL 插值进度(transition.mjs 已部分测,这里补主题配置)
[Test 18] export 数量 = 5(防止误增/误删)
```

### 4.2 `test/edge-cases.mjs` — 边界输入 ⭐ P0

**目标**:补 `textToBitmap` 边界 + 引擎对异常输入的鲁棒性
**估计测试数**:~22 个

```
[Test 1]  textToBitmap('') 空字符串 → data 全 0(不崩)
[Test 2]  textToBitmap('   ') 空白 → data 全 0
[Test 3]  textToBitmap('\n\n\n') 多换行 → 不崩,行高正确
[Test 4]  textToBitmap('A'.repeat(1000)) 超长 → 不崩,data 长度 = cols*rows
[Test 5]  textToBitmap('🎉🚀') emoji(4 字节 UTF-8)→ canvas 渲染可能黑块但不崩
[Test 6]  textToBitmap('中文字符') 双字节 → 走 0.6 charW 估算
[Test 7]  textToBitmap('你好'.repeat(500)) 超长中文 → 不崩
[Test 8]  textToBitmap(text, 0, 0) cols/rows 兜底(应=80/30)
[Test 9]  textToBitmap(text, -5, -5) 负数兜底
[Test 10] textToBitmap(text, NaN, NaN) NaN 兜底
[Test 11] textToBitmap(unicode-控制字符 '\u0000') → 不崩
[Test 12] setTargetBitmap(null) → 走 idle 路径(不崩)
[Test 13] setTargetBitmap({cols: 0, rows: 0, data: []}) 兜底
[Test 14] setTargetBitmap({cols: 1000, rows: 1000, data: new Float32Array(10)}) 长度不匹配 → 不崩
[Test 15] setTheme(null) → console.warn(类似未知主题)
[Test 16] setTheme(123) 数字 → console.warn
[Test 17] setTheme('') 空串 → console.warn
[Test 18] setVariantParams(null) → 不崩
[Test 19] setBrightnessCurve('') 空串 → 静默 fallback(usability.mjs 测过)这里补 unit
[Test 20] matrixRain({fontSize: 3}) fontSize=3 应被夹到 4(见 memory/feedback_min_font_size.md)
[Test 21] matrixRain({fontSize: 0}) 同上
[Test 22] matrixRain({fontSize: -1}) 同上
```

### 4.3 `test/fps-overlay.mjs` — FPS 角标 ⭐ P1

**目标**:覆盖 `src/fps-overlay.ts`
**估计测试数**:~10 个

```
[Test 1]  mountFpsOverlay() 注入 style 节点(id='__mr-fps-overlay-css')
[Test 2]  挂载后 .matrix-rain-fps-overlay div 在 document.body
[Test 3]  默认文本含 'FPS: —'
[Test 4]  多次 mount 只注入 1 个 style(去重)
[Test 5]  rAF tick 一次后 FPS 数字更新
[Test 6]  FPS < 30 时加 .low class(颜色变红)
[Test 7]  __matrixRainDebug.avgFps 覆盖 lastFps
[Test 8]  __matrixRainDebug.count 显示实例数
[Test 9]  destroy() 移除 DOM 节点
[Test 10] destroy() 取消 rAF(无更多 tick)
```

### 4.4 `test/element.mjs` — Web Component ⭐ P1

**目标**:覆盖 `src/matrix-rain-element.ts` 公开 API
**估计测试数**:~12 个

```
[Test 1]  import 后 customElements.get('matrix-rain') 返回 class
[Test 2]  new MatrixRainElement() 不崩
[Test 3]  el.theme = 'cyber-blue' 触发 setAttribute
[Test 4]  el.theme getter 返回当前主题
[Test 5]  el.variant = 'ripple' 触发 reload
[Test 6]  el.fontSize = 24 调 setDensity(24)
[Test 7]  el.charset = '01' 触发 reload
[Test 8]  el.fps 在实例未启动时返回 0
[Test 9]  el.instance 返回 MatrixRainInstance
[Test 10] el.destroy() 销毁实例
[Test 11] observedAttributes 含 ['theme', 'variant', 'font-size', 'charset']
[Test 12] 编程式 setAttribute('theme', ...) 与 el.theme = ... 行为一致
```

---

## 5 · 现有测试的边界缺口

| 已有测试 | 测过 | 未测边界 |
|----------|------|----------|
| `text-fit.mjs` | 4 fitMode × 5 文本 × 5 fontSize = 100 组合(包含 fontSize=4 下限、含中文) | **空字符串** / **超长 1000+ 字符** / **emoji 🎉** / **null/undefined 输入** / **NaN 数值** / **负数 cols/rows** |
| `leak.mjs` | resize 监听器 1000× 循环 | 未测:timeout / interval / rAF 累积;destroy 期间抛错 |
| `events.mjs` | onFrame / onThemeChange / onTargetFinish | 未测:onResize debounce 实际行为;多个 onFrame 实例互相干扰 |
| `sandbox.mjs` | 词级 + 运行时黑名单;29 个用例 | 未测:`_` 变量名(可能误中 word boundary);`window1` 类命名;`Proxy` 字符串子串 |
| `noise-converge.mjs` | 5 段状态机 + lockOrder | 未测:`hold: 0` 立即进 dissolve;`fadeOut: 0` 立即结束;`lockStability` < 0.5 反复跳 |
| `transitions.mjs` | A1/A3/A4/C1/C2/D1/E1 + 8 测试 | 未测:同帧多次 setTheme(后者覆盖前者);`setTransitionAlpha(NaN)` |
| `frame-rate.mjs` | dt 累积 + ErrorBoundary | 未测:`fixedTimeStep: true` 下 rAF 间隔 0(连续触发) |
| `canvas-remove.mjs` | user canvas 不被删 | 未测:library wrapper 内用户插入自己的额外元素 |
| `usability.mjs` | setTheme 行为 + 编译失败 fallback | 未测:keepPaletteParams: true 时切同主题是否无变化 |
| `esm-load.mjs` | ESM/CJS/d.ts shape | 未测:sub-path 导入('./themes' / './core' / './element') |

---

## 6 · P0 / P1 / P2 优先级

### P0(本周做)

1. **`test/edge-cases.mjs`**(~22 用例)
   - 价值:覆盖用户最可能传错的所有边界(空 / 超长 / Unicode / NaN)
   - 风险:不测这些,production 报错无兜底
   - 估时:半天(框架可复用 text-fit.mjs)

2. **`test/themes.mjs`**(~18 用例)
   - 价值:themes.ts 是用户最常调的配置入口,但目前 0 深度覆盖
   - 风险:5 主题数值飘了 / 撞色 / chroma NaN 都不会被发现
   - 估时:半天

### P1(下周做)

3. **`test/element.mjs`**(~12 用例)
   - 价值:Web Component 是面向 HTML 用户的主入口,公开 API 全部裸奔
   - 风险:`<matrix-rain>` 改一行属性就崩 production
   - 估时:0.5 天

4. **`test/fps-overlay.mjs`**(~10 用例)
   - 价值:FPS 角标是 debug 工具,但 0 覆盖 = 改 style 注入逻辑无人拦
   - 风险:小(用户量小),但写起来简单
   - 估时:0.25 天

### P2(有需求时补)

5. `test/curves.mjs`(buildLUT / sampleLUT / PRESETS / evalWave,~30 用例)
   - 价值:curves 是 SSR 入口的核心,工具函数全 0 测
   - 风险:工具函数,出错是数值不精确,影响可控

6. `test/palette-lut.mjs`(hslToRGBA / applyTP / PaletteLUT,~25 用例)
   - 价值:LUT 是性能关键路径,bug 难以肉眼发现
   - 风险:中等(改一行 HSL 算法 → 所有主题色偏)

7. `test/bitmap-image.mjs`(imageToBitmap / fileToImage,~8 用例)
   - 价值:文件上传入口 0 测
   - 风险:小(用户需自己传入 Image 对象)

8. `test/variant-defaults.mjs`(VARIANT_DEFAULTS 4 变体数值,~5 用例)
   - 价值:4 变体初始参数没人 assert
   - 风险:小

---

## 7 · 总结

| 维度 | 当前 | 建议补完后 |
|------|------|------------|
| 测试文件 | 11 | 15(+4) |
| 用例总数 | ~100 | ~160(+60) |
| 0 覆盖模块(关键面) | 4 | 0 |
| 边界输入覆盖 | 弱(只 fontSize=4 测了) | 强(空/超长/Unicode/NaN 都有) |
| 用户最常调 API(themes)覆盖 | ⚪ 弱 | ✅ 强 |

**新测试文件总估时 ~1.5 天**;P0 优先级(2 个文件,40 用例)可在 **1 天** 内完成并合并。

**附:所有改动建议都是新增 `test/*.mjs`,不动 `src/`,符合审计约束。**
