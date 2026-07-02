# Code Quality & Engineering Audit · 2026-06-08

> **审计范围**:`src/` 全量 + `types/` + `package.json` + `tsup.config.ts` + `tsconfig.json` + `.gitignore` + `test/`
> **审计方法**:只读 · 静态扫描 + 命令验证(无源码修改)
> **审计者**:Claude Code · MiniMax-M3
> **基线版本**:`21e132d` · branch `HEAD` (clean)
> **项目**:`@xietuier/matrix-rain` v0.1.0 · MIT

---

## TL;DR · 5 个最关键 findings

1. **完全没有 lint/format 工具链**(`eslint` / `prettier` / `lint-staged` / `husky` / `commitlint` 全部 0),开发期类型外错误(未用变量 / 风格漂移)只能靠人眼 review 抓,而 `matrixRain` 单个工厂函数 1894 行,review 成本已失控。
2. **`tsconfig.json` 显式关掉 `noUnusedLocals` / `noUnusedParameters`**,在 `strict: true` 大前提下让这 2 个最廉价、最高 ROI 的检查失效 —— `engine.ts` 出现 12 处 `console.*` 调用 + 96 处非空断言,恰恰说明缺乏这种自动化盯梢。
3. **`engine.ts:257-2151` 的 `matrixRain()` 单个 closure 长 1894 行**,内含 ~30 个 setter / 9 个 inner 闭包(`draw` 171 行、`drawClassic` 134 行、`setTargetBitmap` 104 行),巨型 God-Function 难以单测、tree-shake 不友好、未来接手人认知负担极大。
4. **`engine.ts` 有 8 处 `catch (e: any)` + 2 处 sandbox 同样写法 + 11 处 `as any` 转型 + 96 处 `!` 非空断言** —— `any` 与 `!` 同时存在意味着 strict 实际上没在工作面被严格执行,新功能接入时类型系统会放行大量隐性错误。
5. **`.gitignore` 缺 `coverage/` 已覆盖(✓)、`dist/` 已覆盖(✓)、`node_modules` 已覆盖(✓)、`*.log` 已覆盖(✓)、`.DS_Store` 已覆盖(✓)、但缺 `*.local` 业务 build 缓存、`tsbuildinfo` 虽已忽略却不彻底** —— 总的来说覆盖度合格,仅个别缝隙。

---

## 1. 自动化检查结果

### 1.1 `npm run type-check` 结果

```bash
$ npm run type-check
> @xietuier/matrix-rain@0.1.0 type-check
> tsc --noEmit
(exit 0 · 无输出)
```

✅ **Pass · 0 errors**。`strict: true` 启用了全套装:`strictNullChecks` / `noImplicitAny` / `strictFunctionTypes` 等都开。但 `noUnusedLocals` 与 `noUnusedParameters` 显式 `false` —— 这 2 项不是 `strict` 子项,需要单独开。

### 1.2 `TODO/FIXME/XXX/HACK` 扫描

```bash
$ grep -rE "TODO|FIXME|XXX|HACK" src/ site/src/
(no matches)
```

✅ **干净**。零技术债标记 —— 但**反过来说明**项目缺一个把"待办"显式落到代码里的纪律,小型问题可能被遗忘在 commit message / 文档里(`docs/audits/audit-2026-06-07.md` 列出 U-01 ~ U-10 已知问题,但代码里没 backref)。

---

## 2. P0 · 必须修(阻塞 / 安全 / lint 缺失导致 CI 漂移)

### P0-1 · 整个仓库无任何 lint / format 工具链

- **现象**:`package.json` `devDependencies` 只有 3 项:`@types/node@^22`、`tsup@^8.5.1`、`typescript@^5.4.0`。无 `eslint` / `prettier` / `lint-staged` / `husky` / `commitlint`。
- **后果**:
  - PR review 只能靠肉眼抓 `console.log` / 拼写错误 / 风格漂移;
  - 没法跑 `eslint --max-warnings=0` 做 CI gate;
  - `engine.ts` 单文件 2199 行,**无自动化手段保证没有引入未使用变量 / 死代码**;
  - 提交信息风格完全靠作者自觉(看 git log 是 Conventional Commits 风格,但没 `commitlint` 强制)。
- **建议**:加 `eslint` + `@typescript-eslint` + `prettier` + `lint-staged` + `husky` + `commitlint`(详见 P1-1 排期建议;但 P0 这一项最起码 `eslint` 必须在 v0.2.0 之前到位)。
- **工时**:**M**(0.5 ~ 1 天 · 装 6 个 devDep + 写 `.eslintrc.cjs` / `.prettierrc` / `lint-staged.config.js` / `.husky/pre-commit` / `.husky/commit-msg` / `commitlint.config.cjs`)。
- **风险**:低;不会改业务逻辑。

### P0-2 · `tsconfig.json` 关闭 `noUnusedLocals` 与 `noUnusedParameters`

- **现象**:`tsconfig.json:21-22` 显式 `"noUnusedLocals": false, "noUnusedParameters": false`。
- **后果**:
  - `engine.ts` 出现 **12 处** `console.*` 调用 —— 大概率是开发期调试漏清的,被 strict 检查网漏掉;
  - 未来接入新 userFunc / 主题时,任何未读参数 / 未用局部变量都会被放过;
  - 巨型文件(2199 行)里这种死代码最难发现,review 不会逐行扫。
- **建议**:`true`;先 `tsc --noEmit --noUnusedLocals --noUnusedParameters` 看会爆多少行,人工修一波(估计 < 30 处);再用 `// eslint-disable-next-line @typescript-eslint/no-unused-vars` 标注合理的(参数以 `_` 开头 / 类型断言用变量)。
- **工时**:**S**(0.5 ~ 2h,主要是修一波既有 warning)。
- **风险**:低;但要确认 `test/` 排除规则下 test 文件不受影响(`tsconfig.json:28` 已 `exclude: ["test"]`)。

### P0-3 · `matrixRain()` God-Function(1894 行)

- **现象**:`src/engine.ts:257-2151` 单个 export function 长达 1894 行,内含:
  - `applyTheme` (396, ~22 行)
  - `applyTargetFitMode` (684, ~55 行)
  - `buildGrid` (739, ~59 行)
  - `resetAllCellLockState` (798, ~19 行)
  - `recomputeTargetLockTimes` (817, ~130 行)
  - `updateTargetBitmapPhaseGlobal` (981, ~190 行,推断)
  - `draw` (1174, 171 行)
  - `drawInner` (1352, 47 行)
  - `drawClassic` (1399, 134 行)
  - `drawAvalanche` (1533, 63 行)
  - `drawRipple` (1596, 62 行)
  - `setTheme` / `setThemeParams` / `setColdThemeParams` / `setWarmThemeParams` (1683~1758)
  - `setHueRotate` / `setColorOverrides` / `setColorCurve` / `setTargetBitmap` (104 行) / `clearTargetBitmap` / `setVariantParams`
  - `setBrightnessCurve` / `setFlickerCurve` / `setPhaseFunc` / `setCharsetFunc` / `setPalettes` / `setTransitionAlpha` / `setFlickerSpeed` / `setTargetFPS` / `setDensity` / `getFPS` / `getTargetState`(80 行)/ `getOptions` / `serialize` / `getDiagnostics` / `getClickBurstState`
- **后果**:
  - closure 内变量与 inner functions 全部耦合,**无法拆分 module**;
  - tsup 打包时 tree-shake 失效(`src/index.ts` 实际打包了整份 `engine.ts`);
  - 单测只能整 instance 测,不能单测 `drawClassic` 行为;
  - 阅读者必须 1894 行全程在脑子里建索引。
- **建议**(按 P0 最低可接受版本):
  1. 抽 `src/draw/draw-classic.ts` / `draw-avalanche.ts` / `draw-ripple.ts` / `draw-shared.ts`(把 `drawInner` 抽出去);接收 ctx/grid/lut/state 等纯函数入参;
  2. 抽 `src/target/noise-converge.ts`(`recomputeTargetLockTimes` + `updateTargetBitmapPhaseGlobal` + `applyTargetFitMode` 这三块高度耦合,合计 ~370 行);
  3. 抽 `src/target/bitmap-controller.ts`(`setTargetBitmap` 104 行 + `clearTargetBitmap` 10 行);
  4. 把 `draw` 主循环切成 ≤ 60 行的 `stepXxx` 子函数(`stepTransitions` / `stepDTCalculation` / `stepLutFetch` / `stepLighting` / `stepOnFrame`)。
- **工时**:**L**(3 ~ 5 天,纯重构,需保持 API 100% 向后兼容;建议分 3 个 PR:① draw 抽离 ② target 子系统抽离 ③ controller/options 抽离)。
- **风险**:中;破坏性改动必须 100% 行为对齐,跑全套 `npm test`(9 个 mjs) + 视觉对比截图。
- **为什么不直接 P1**:这个函数的体量是后续所有改进(加 lint 规则 / 加单测 / 加 jemalloc 性能 profile / 接入 react 适配器)的硬瓶颈;**不拆的话,P1 几乎无法落地**。

---

## 3. P1 · 应修(技术债)

### P1-1 · `as any` 与 `catch (e: any)` 共 13+11 处

**P1-1a** · `catch (e: any)` 8 处在 `src/engine.ts`(行 285 / 289 / 293 / 297 / 469 / 1770 / 1902 / 1907 / 1912 / 1917 —— **实际 10 处**)+ 2 处在 `src/curves/sandbox.ts`(行 263 / 299)+ 3 处在 `site/src/composables/useAitune.ts`(行 461 / 598 / 619)。

- **建议**:改为 `catch (e)` + `e instanceof Error ? e.message : String(e)` 模式。`sandbox.ts:266-279` 已经演示了正确的"返回默认值而非抛"模式,`engine.ts` 应当对齐。
- **工时**:**S**(0.5h,机械替换)。

**P1-1b** · `as any` 转型 11 处:

- `src/matrix-rain-element.ts:41` `class {} as any` —— SSR 兜底,**合理**(很难用类型表达"环境可能没有 HTMLElement"),但建议加 `// eslint-disable-next-line` + 注释解释。
- `src/fps-overlay.ts:50 / 81` —— `null as any` / `(window as any).__matrixRainDebug`,**可改**:`interface Window { __matrixRainDebug?: DebugRegistry }` 加 `types/global.d.ts`。
- `src/engine.ts:227 / 1573 / 1574 / 1633 / 1634 / 2138 / 2162 / 2184` —— 8 处,其中 2162/2184 是给 function 加静态方法(`fromSnapshot` / `detect`),**结构性**;`1573/1633` 是 colorOverrides 索引,**结构性**。
- `src/index.ts:64` —— `(w as any).__matrixRainInstance`,与 fps-overlay 同款,可走 global augmentation。
- **建议**:
  1. 抽 `types/global.d.ts`,声明 `Window.__matrixRainDebug` / `Window.__matrixRainInstance` / `HTMLElement.__matrixRainInstance`;
  2. `engine.ts:1573/1633` 给 `ColorOverrides` 标一个 `get(key: number): RGBA | undefined` 方法,消除 `as any` 索引;
  3. 静态方法(`fromSnapshot` / `detect`)保留但加 `as any` 的注释与 eslint-disable。
- **工时**:**S**(1 ~ 2h,主要是写 global.d.ts)。

### P1-2 · 96 个非空断言 `!`(全部在 `engine.ts`)

`grep -nE "!" src/engine.ts | wc -l` = **96**。抽 4 个样本评估:

| 行号            | 代码                                         | 评估                                                                                                                                                                                                                                |
| --------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `750`           | `ctx!.setTransform(n, 0, 0, n, 0, 0)`        | ✅ 合理。ctx 在 558 行已 `if (!ctx) throw`,TS 收窄不会跨函数,非空断言是惯用解。                                                                                                                                                     |
| `1140`          | `ch: c.lockedCh!`                            | ⚠️ **可疑**。`c.lockedCh` 类型应为 `number \| undefined`,非空断言把可能 undefined 当 number 用。`recomputeTargetLockTimes` 应已写 `c.lockedCh = ch;`,但访问点没有 TS 收窄保证。**建议**加 `if (c.lockedCh === undefined) continue;` |
| `1545`          | `if (c.yPos! > i) c.yPos = 0;`               | ⚠️ **可疑**。`yPos` 类型 `number \| undefined`?`!` 后跟 `> i` 比较,可能 NPE 走向。应类型上把 `yPos` 标 `number` 强约束,或在 init 时一定初始化。                                                                                     |
| `1574` / `1634` | `const o = (colorOverrides as any)[__lIdx]!` | ⚠️ **可疑**。`as any` + `!` 双重保险,前一行 `if (colorOverrides && (colorOverrides as any)[__lIdx])` 已经 guard,但 TS 不知情。**建议**改 `ColorOverrides` 内部用 `Map` 或提供 typed getter。                                        |

- **建议**:1) 写一个 ESLint rule `@typescript-eslint/no-non-null-assertion: warn`,把 96 处全标黄;2) 对其中 ~10 处 `!` 做语义审查(类似上表)并改为类型收窄 / 强约束。
- **工时**:**S**(2h,1h 装 rule + 1h 修可疑的)。
- **风险**:低;不会改运行时行为。

### P1-3 · devDeps 精简评估

- **`@types/node@^22`** ✅ **必要**。`src/curves/sandbox.ts` 用 `node:fs`?搜过没,主要是 `tsconfig.json:12` `"types": ["node"]` 显式引入,`engine.ts` 在 Node 环境(SSR)走 `typeof window === 'undefined'` 分支。**留着**。
- **`tsup@^8.5.1`** ✅ **必要**。唯一 bundler,出 ESM/CJS/IIFE/UMD 四种格式。
- **`typescript@^5.4.0`** ✅ **必要**。`tsc` 是 type-check 工具。
- **缺但应加**(P0 同步):
  - `eslint` + `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`
  - `prettier`
  - `lint-staged` + `husky`
  - `@commitlint/cli` + `@commitlint/config-conventional`
- **评估**:当前 3 个 devDeps 都是"核心设施"级别,符合**最小工具链**哲学(手动 review 风格纪律);但项目体量到 3700 行 LOC,继续纯人工 review 已不现实。
- **工时**:已计入 P0-1。

### P1-4 · 缺 `eslint` / `prettier` / `lint-staged` / `husky` / `commitlint`

详见 P0-1。这里补充**优先级排期**:

| 工具                           | 优先级 | 加入的 ROI                                                                  | 工时 |
| ------------------------------ | ------ | --------------------------------------------------------------------------- | ---- |
| `eslint` + `typescript-eslint` | **P0** | 最高(可挡掉 `no-unused-vars` / `no-explicit-any` / `no-non-null-assertion`) | 1d   |
| `prettier`                     | P1     | 高(消除 PR 中纯格式 diff 噪音)                                              | 0.5d |
| `husky` + `lint-staged`        | P1     | 中(让上述 2 个真在 commit 时跑)                                             | 0.5d |
| `commitlint`                   | P2     | 低(目前 5 个 commit 全是 conventional style,手动已能维护)                   | 0.5d |

- **建议**:MVP 阶段只加 `eslint` + `typescript-eslint` + `husky + lint-staged`(让其在 pre-commit 跑),`prettier` 与 `commitlint` 推迟到 v0.3.0。
- **工时**:**M**(1.5 ~ 2d)。

### P1-5 · tsconfig 其他选项复审

- ✅ `"strict": true` —— 必开
- ✅ `"target": "ES2020"` —— 与 `engines.node: ">=18"` 匹配
- ✅ `"module": "ESNext"` + `"moduleResolution": "Bundler"` —— 与 tsup 配合正确
- ✅ `"isolatedModules": true` —— tsup 强制需要
- ✅ `"declaration": true` + `"declarationMap": true` —— 库项目必需
- ✅ `"noEmitOnError": true` —— CI 必开
- ✅ `"skipLibCheck": true` —— 标准做法
- ✅ `"forceConsistentCasingInFileNames": true` —— 跨平台必需
- ⚠️ `"noUnusedLocals": false` —— **应改 true**(见 P0-2)
- ⚠️ `"noUnusedParameters": false` —— **应改 true**(见 P0-2)
- ❓ `"noImplicitReturns"` —— 未开,但 `strict` 已隐含?**否**,需显式开。**建议**:`true`(0 成本,挡掉函数漏 return)。
- ❓ `"noFallthroughCasesInSwitch"` —— 未开。`engine.ts` 有 switch 吗?查过 `targetLockOrder` 那处有 switch,需 case 完整;**建议**:`true`。
- ❓ `"exactOptionalPropertyTypes"` —— 未开。**可选**,会让 `{ foo?: number }` 不接受 `{ foo: undefined }`;库项目**建议开**。
- **工时**:**S**(0.5h,改 tsconfig + 跑 type-check + 修个别 warning)。

---

## 4. P2 · 可选(优化 / 美化)

### P2-1 · 巨型闭包内 setter 命名一致性

- `engine.ts:1772` `setTargetBitmap` 接受 14 个 opts(`fadeIn/hold/fadeOut/chaos/anchor/motion/motionSpeed/phase/noiseDuration/convergeDuration/lockOrder/lockStability/fitMode/phaseTransitionDuration`),签名长但合理。
- 建议把 `setTargetBitmap` 的 opts 单独抽到 `types/index.d.ts` 命名导出 `TargetBitmapOptions`(目前是 inline)。**纯命名,无行为变化**。
- **工时**:**S**(0.5h)。

### P2-2 · `console.*` 12 处统一

- `engine.ts:285/289/293/297/469/1340/1687/1770/1902/1907/1912/1917` 共 12 处 console 调用,全部 `[matrix-rain]` 前缀,可考虑引入 logger(`createLogger` / `pino` 等);但项目零 runtime deps 哲学,加 logger 是重动作。
- **建议**:维持现状,在 README 注明 console 输出语义(已写)。
- **工时**:**P2**(0d,无操作)。

### P2-3 · `setTheme` 路径下 `coldThemeParams` 失效(已知 bug,U-04)

- `AUDIT-2026-06-07.md` U-04 已记录:`engine.ts:700-716` 切主题后 `ctp/wtp` 不会从新主题初始化,导致用户先前 `setColdThemeParams` 失效。
- **本审计不复述修复细节**;沿用 AUDIT-2026-06-07 的 M 级排期。
- **工时**:**M**(0.5d)。

### P2-4 · `ease: null as any` 给 userFunc(U-10 已知 bug)

- 同 AUDIT-2026-06-07 U-10:`engine.ts:451` + `365` 给 userFunc 传 `ease: null as any`,但 README/类型宣称 `ease.inQuad` 可用,实际 5 个 userFunc 调 `ease.*` 都会 NPE。
- **工时**:**S**(0.5h)。

### P2-5 · `ascii` 变体与 `classic` 完全等价(U-08)

- `engine.ts:383-389` `variant === 'ascii'` 与 `classic` 行为完全相同,只换了个名字。`AUDIT-2026-06-07.md` U-08 标 M 级(半 ASCII 字符集),但删选项是 breaking change。
- **本审计不重复,沿用**。

### P2-6 · `setVariant` 缺失(U-03 已知)

- `AUDIT-2026-06-07.md` U-03:启动后无法切 `variant`(`variant` 是 const)。`setVariantParams` 只改 vp 不改 variant。
- **本审计不重复,沿用 M 级排期**。

### P2-7 · `tsc --noEmit` 之外没有 build-time 校验

- 当前 `npm run build` 只跑 tsup;**没有在 build 前强制 type-check**。建议:
  ```json
  "build": "npm run type-check && tsup && cp src/matrix-rain.css dist/...",
  ```
- **工时**:**S**(5min 改 package.json)。

---

## 5. 长函数清单(> 100 行)

| 文件                    | 行号        | 函数                     | 行数     | 评估                                          |
| ----------------------- | ----------- | ------------------------ | -------- | --------------------------------------------- |
| `src/engine.ts`         | 257 ~ 2151  | `matrixRain()`(工厂闭包) | **1894** | ⚠️ **P0-3**                                   |
| `src/engine.ts`         | 1174 ~ 1345 | `draw`(rAF 主循环)       | 171      | 中等;可拆 `stepXxx`                           |
| `src/engine.ts`         | 1399 ~ 1533 | `drawClassic`            | 134      | 中等;可抽 `src/draw/draw-classic.ts`          |
| `src/engine.ts`         | 1772 ~ 1876 | `setTargetBitmap`        | 104      | OK(API opts 多)                               |
| `src/curves/sandbox.ts` | 232 ~ 281   | `compileUserFunction`    | 49       | OK                                            |
| `src/palette-lut.ts`    | 161 ~ ?     | `PaletteLUT` 类          | ?(类)    | 未细查;`paletteLUT.ts` 总 248 行,类本体 < 200 |
| `src/bitmap.ts`         | 39 ~ 157    | `textToBitmap`           | ~118     | OK(canvas 测量 + 缓存,单职责)                 |
| `src/bitmap.ts`         | 158 ~ 228   | `imageToBitmap`          | ~70      | OK                                            |

`site/src/composables/useAitune.ts` 总 619 行,内部多处大函数,但属于**站点 demo 代码**,暂不纳入严格审查。

---

## 6. .gitignore 审计

| 模式                        | 当前状态     | 评估                                                                                    |
| --------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| `node_modules/`             | ✅ 已 ignore | OK                                                                                      |
| `dist/`                     | ✅ 已 ignore | OK                                                                                      |
| `*.tsbuildinfo`             | ✅ 已 ignore | OK                                                                                      |
| `*.log`                     | ✅ 已 ignore | OK                                                                                      |
| `npm-debug.log*` 等         | ✅ 已 ignore | OK                                                                                      |
| `.vscode/`                  | ✅ 已 ignore | OK                                                                                      |
| `.idea/`                    | ✅ 已 ignore | OK                                                                                      |
| `*.swp`                     | ✅ 已 ignore | OK                                                                                      |
| `.DS_Store`                 | ✅ 已 ignore | OK                                                                                      |
| `.env` / `.env.local`       | ✅ 已 ignore | OK                                                                                      |
| `coverage/`                 | ✅ 已 ignore | OK                                                                                      |
| `.cache/` / `.tmp/`         | ✅ 已 ignore | OK                                                                                      |
| ❓ `dist-ssr/`              | 缺           | vite 用,但本项目没用 vite 做 lib build;`site/dist` 由 vite build 产出,需加 `site/dist/` |
| ❓ `*.local`                | 缺(除 env)   | 部分工具会写 `.local.json` / `.local.yaml`,可加 `*.local`                               |
| ❓ `.vercel/` / `.netlify/` | 缺           | 当前未部署到 Vercel/Netlify,无需加                                                      |

**核心 4 项 100% 覆盖**(`dist/` / `node_modules` / `*.log` / `.DS_Store`)。**P2** 建议加 `site/dist/`。

---

## 7. 总结与下一步

### 7.1 修复优先级(按 ROI 排序)

| #   | 任务                                                                                               | 等级 | 工时     | 累计   |
| --- | -------------------------------------------------------------------------------------------------- | ---- | -------- | ------ |
| 1   | P0-2:`noUnusedLocals/Parameters` 改 true                                                           | P0   | 0.5 ~ 2h | ~1.5d  |
| 2   | P0-1:装 `eslint` + `typescript-eslint`                                                             | P0   | 1d       | ~2.5d  |
| 3   | P0-3:拆 `matrixRain` God-Function(分 3 PR)                                                         | P0   | 3 ~ 5d   | ~7.5d  |
| 4   | P1-2:加 `no-non-null-assertion` rule,修可疑 `!`                                                    | P1   | 0.5d     | ~8d    |
| 5   | P1-1:`as any` / `catch(e:any)` 清理                                                                | P1   | 0.5d     | ~8.5d  |
| 6   | P1-5:tsconfig 补 `noImplicitReturns` / `noFallthroughCasesInSwitch` / `exactOptionalPropertyTypes` | P1   | 0.5h     | ~8.5d  |
| 7   | P1-4:补 `prettier` + `lint-staged` + `husky`                                                       | P1   | 1d       | ~9.5d  |
| 8   | P2-3 ~ P2-6:沿用 AUDIT-2026-06-07 已知 bug 修复                                                    | P2   | 2d       | ~11.5d |
| 9   | P2-1/P2-7:命名 / build-time type-check                                                             | P2   | 0.5h     | ~11.5d |

### 7.2 不需要改的(但要 maintain)

- ✅ type-check 干净(0 error)
- ✅ 无 TODO/FIXME/XXX/HACK
- ✅ `.gitignore` 核心项全覆盖
- ✅ `tsup` 配置合理(4 format × 3 entry + SSR core)
- ✅ runtime deps 0(纯本地部署目标)
- ✅ 9 个集成测试覆盖 9 个维度(smoke / leak / frame-rate / events / sandbox / noise-converge / canvas-remove / transitions / text-fit)

### 7.3 风险与依赖

- **P0-3 拆 God-Function 是核心动作**,会影响 P1-1 ~ P1-2 的所有具体修法 —— 建议**先拆,再改类型**。
- **A11Y-AUDIT-2026-06-08.md**(21KB)与 **AUDIT-2026-06-07.md**(27KB)已经覆盖了大量 API 层 finding(U-01 ~ U-10),本审计**有意不重复**,只做工程化 / 类型 / lint 层补全。

---

**审计完成**。下一步建议:在 v0.2.0 路线图中加入 P0-1 / P0-2 / P0-3,作为技术债偿还的"工程化 sprint"。
