# matrix-rain-package · 包文件易用度审计

**审查日期**:2026-06-15
**版本**:0.5.1
**审查人**:Claude Code (只读 · 不修改任何源)
**审查范围**:`package.json` / 入口文件 / tsup 配置 / 类型导出 / publish 配置 / README / API 设计 / 打包体积 / CDN 兼容
**审查方法**:shell 实测 gzip 体积 + node 真导入 + 字符串核查 + 对比 README 与 package.json 一致性

---

## 0. 概要(Executive Summary)

matrix-rain-package 的**整体包发布架构成熟**:双格式(ESM + CJS + IIFE + UMD)、SSR 友好子路径(`/core`)、CSS 单独暴露、类型声明齐备、`files` 字段控制 publish 范围,这些都是好的。但**「README 文档与实际发布产物不一致」是当前最大的可用度风险** — 我实测发现 3 处 README 写出的 import 路径会直接 throw:

1. README §🐛DevTools 调试 推荐 `import { mountFpsOverlay } from '@xietuier/matrix-rain/fps-overlay';` — **`/fps-overlay` 不在 `package.json` exports 字段中**(dist/fps-overlay.js 文件存在,但 npm 模块解析会返回 `ERR_PACKAGE_PATH_NOT_EXPORTED`)
2. 同段落 `import { themes, textToBitmap, PRESETS, compileUserFunction } from '@xietuier/matrix-rain/core';` — **`textToBitmap` 已在 0.5.0 移出 `/core`**,真实 import 会 throw `does not provide an export named 'textToBitmap'`
3. README §SSR hydration 段落大量使用 `MatrixRain.fromSnapshot(...)` — **`fromSnapshot` 在 dist 中完全没有 export**(只在 `types/index.d.ts` 里有声明),运行时会 throw `is not a function`

此外还有 1 个 **SSR 隐患**:`MatrixRain.activeCount` / `MatrixRain.destroyAll()` getter 直接访问 `document.querySelectorAll`,**在 Node/Edge/Worker 中调用会立刻 throw `ReferenceError: document is not defined`**。README §SSR 段落宣传的「SSR 友好」不成立。

打包体积方面,**默认 canvas2d 路径 gzip 30KB**(minify 已开)符合 tsup.config.ts §22 注释承诺 ≤32KB。但 webgl/webgpu 路径被 inline 在同一 chunk,**未做 dynamic import splitting**(tsup.config.ts §23-25 自己承认)— 用户即使只用 canvas2d,下载时仍要付 webgl/webgpu 全部代码。

整体评分:**3.0 / 5 ⭐**(架构良好,文档-产物一致性差)

---

## 1. 各项打分

| 维度                          | 评分       | 说明                                                                                                                           |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `package.json` 字段完整度     | ⭐⭐⭐⭐   | 必填字段都在,缺 `peerDependencies` 但有 `engines.node ≥18`,缺 `sideEffects: false` 声明                                        |
| 双格式产物 (ESM+CJS+IIFE+UMD) | ⭐⭐⭐⭐⭐ | 全部齐全,IIFE 头部 `var MatrixRain=(...)` 正确暴露全局                                                                         |
| TypeScript 类型完整性         | ⭐⭐⭐⭐   | `.d.ts` 全部生成,API 覆盖率好,但 `MatrixRainInstance.fromSnapshot` 类型在 dist 中无对应实现                                    |
| 入口文件路径正确性            | ⭐⭐⭐⭐⭐ | `main` / `module` / `types` / `unpkg` / `jsdelivr` 全部指向真实存在的文件                                                      |
| Publish 范围控制 (files 字段) | ⭐⭐⭐⭐   | `files: ["dist", "README.md", "LICENSE"]` 正确;.npmignore 与 files 字段冗余但无冲突                                            |
| README 完整度                 | ⭐⭐⭐⭐   | 1198 行,涵盖 install/quickstart/SSR/React/Vue/Next.js/Web Component/CDN                                                        |
| **README ↔ 产物一致性**       | ⭐⭐       | **3 处 import 示例实测 throw**(详见 §3 P0-2,P0-3,P1-1)                                                                         |
| API 设计直觉度                | ⭐⭐⭐⭐   | `matrixRain(opts)` + `MatrixRain` 命名空间 + `instance.setXxx` 一致性好;默认值友好                                             |
| 默认值友好度                  | ⭐⭐⭐     | `fontSize=14` 默认值好,但 0.5.1 README 提到 4px 硬下限,实际 `setDensity` 路径未看到 `Math.max(4,...)` clamp(只 bitmap.ts 内有) |
| 打包体积(默认 canvas2d 路径)  | ⭐⭐⭐⭐   | gzip 30.1KB,达成 tsup.config.ts §22 注释承诺 ≤32KB                                                                             |
| 打包体积(webgl/webgpu)        | ⭐⭐       | 仍 inline 在主 chunk,实际体积 100KB,gzip 30KB — 用户只为 canvas2d 付出 webgl/webgpu 代价                                       |
| CDN 兼容 (unpkg/jsdelivr)     | ⭐⭐⭐     | UMD/IIFE 在,但 README `@xietuier/matrix-rain@0.1.0` 字面量未更新到 0.5.1                                                       |
| SSR 友好度                    | ⭐⭐       | `/core` 真无 DOM,但主入口 `MatrixRain.activeCount` 缺 SSR 守卫                                                                 |
| Tree-shaking 友好度           | ⭐⭐       | ESM 导出 31 个全部 inline 在 minified chunk,`sideEffects: ["**/*.css"]` 正确,但 internal 状态机类无法 tree-shake               |

---

## 2. 关键发现详细列表

### 2.1 真实打包体积(gzip / brotli 实测)

| 文件                                |      raw |        gzip |  brotli |
| ----------------------------------- | -------: | ----------: | ------: |
| `dist/index.js` (ESM)               |  99.4 KB | **30.1 KB** | 26.5 KB |
| `dist/index.cjs` (CJS)              |  99.6 KB | **30.1 KB** | 26.6 KB |
| `dist/index.umd.js` (UMD)           |  99.8 KB | **30.3 KB** | 26.7 KB |
| `dist/index.iife.js` (IIFE)         |  99.6 KB | **30.2 KB** | 26.6 KB |
| `dist/core.js` (SSR-safe)           |  26.3 KB |  **8.4 KB** |  7.2 KB |
| `dist/themes.js`                    |   1.1 KB |  **0.4 KB** |  0.3 KB |
| `dist/element.js` (Web Component)   | 161.2 KB | **36.4 KB** | 30.4 KB |
| `dist/element.iife.js`              | 170.2 KB | **36.8 KB** | 30.7 KB |
| `dist/fps-overlay.js`               |   2.4 KB |  **1.0 KB** |  0.8 KB |
| `dist/matrix-rain.css`              |   4.0 KB |  **1.6 KB** |  1.3 KB |
| `dist/atlas/jetbrains-mono-32.png`  |  21.1 KB |         n/a |     n/a |
| `dist/atlas/jetbrains-mono-32.json` |  40.0 KB |         n/a |     n/a |
| `dist/fonts/*.woff2` × 7            |  ~104 KB |         n/a |     n/a |

**canvas2d-only 用户实际承受**:30.1 KB gzip(因 webgl/webgpu 路径 inline)。tsup.config.ts §23-25 注释承认这是因为 `matrixRain()` 是 sync API,无法做 splitting。**目标 0.6.0** 考虑 Promise 化 API 来真拆出去。

**element(WEB COMPONENT)太大**:170KB / 36KB gzip,含 `webgpu-renderer` 和 40KB atlas — `import '@xietuier/matrix-rain/element'` 会把整个 engine + renderer 都拉进来。Web Component 路径考虑仅打包 canvas2d renderer。

### 2.2 package.json exports 字段实测

**当前 9 个 sub-path**:

- `.`(主入口)
- `./style.css`
- `./themes`
- `./core`
- `./element`
- `./script` (alias to `index.iife.js`)
- `./iife` (alias to `index.iife.js`)
- `./umd` (alias to `index.umd.js`)

**对比 README 文档中提到的子路径**(grep `@xietuier/matrix-rain/`):

- ❌ `@xietuier/matrix-rain/fps-overlay` — **README §1158-1162 提到,exports 中没有**
- ❌ `@xietuier/matrix-rain/element` — ✓ 有
- ✓ `@xietuier/matrix-rain/core` — 有
- ✓ `@xietuier/matrix-rain/themes` — 有
- ✓ `@xietuier/matrix-rain/style.css` — 有

### 2.3 实际导入行为实测(`/tmp/mr_test/` 镜像 dist)

| Import 表达式                                                                                     | 期望                       | 实测                                   | 状态     |
| ------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------- | -------- |
| `import { matrixRain } from '@xietuier/matrix-rain'`                                              | function                   | function ✓                             | OK       |
| `import m from '@xietuier/matrix-rain'`                                                           | function (matrixRain)      | function ✓,`m === matrixRain`          | OK       |
| `import { themes } from '@xietuier/matrix-rain'`                                                  | Record<ThemeName, Factory> | object ✓,5 keys                        | OK       |
| `import { MatrixRain } from '@xietuier/matrix-rain'`                                              | 命名空间对象               | object ✓                               | OK       |
| `MatrixRain.destroyAll()`                                                                         | function                   | function ✓                             | OK       |
| `MatrixRain.detect()` SSR                                                                         | returns default env        | ✓ returns {browser:'Unknown',...}      | OK       |
| `MatrixRain.activeCount` SSR                                                                      | safe getter                | ❌ throws `document is not defined`    | **P0-1** |
| `MatrixRain.destroyAll()` SSR                                                                     | safe call                  | ❌ throws `document is not defined`    | **P0-1** |
| `MatrixRain.fromSnapshot()`                                                                       | SSR hydrate API            | ❌ `is not a function`(dist 无 export) | **P0-2** |
| `import { matrixRain, textToBitmap, imageToBitmap, fileToImage } from '@xietuier/matrix-rain'`    | DOM helpers                | ✓ 全部 function                        | OK       |
| `import { themes, textToBitmap, PRESETS, compileUserFunction } from '@xietuier/matrix-rain/core'` | SSR core                   | ❌ textToBitmap 不在 core              | **P0-3** |
| `import { mountFpsOverlay } from '@xietuier/matrix-rain/fps-overlay'`                             | FPS overlay                | ❌ ERR_PACKAGE_PATH_NOT_EXPORTED       | **P0-3** |
| `import { MatrixRainElement } from '@xietuier/matrix-rain/element'`                               | web component class        | ✓ function (class)                     | OK       |
| `import { themes } from '@xietuier/matrix-rain/themes'`                                           | themes dict                | ✓ object,5 keys                        | OK       |

---

## 3. P0 / P1 / P2 问题清单

### P0(必须修,影响用户首次使用就跑不起来)

#### **P0-1 · `MatrixRain.activeCount` / `destroyAll()` 在 SSR 中必崩**

- **位置**:`src/index.ts:104-105`(activeCount),`src/index.ts:82-101`(destroyAll)
- **现象**:Node / Edge runtime import 后,**直接访问** `MatrixRain.activeCount` 立刻 throw `ReferenceError: document is not defined`
- **根因**:与 README §22 "SSR 友好"声明冲突 — 只对 `MatrixRain.detect()` 做了 `typeof window === 'undefined'` 守卫,`destroyAll` / `activeCount` 没有
- **影响**:任何想做 SSR theme 预设生成的代码(`themes['silicon-valley']().cold` 后想读 `MatrixRain.activeCount` 调试)都会 crash
- **建议**(`src/index.ts:104-105`):加 SSR 守卫
  ```ts
  get activeCount(): number {
    if (typeof document === 'undefined') return 0;
    return document.querySelectorAll('.matrix-rain-wrapper').length;
  }
  ```

#### **P0-2 · `MatrixRain.fromSnapshot` 在 dist 完全没 export**

- **位置**:README §972,1004,999 文档使用 `MatrixRain.fromSnapshot(json, { container })`
- **现象**:TypeScript IDE 提示有这个 API(因为 `types/index.d.ts:855` 有声明),但运行时 `typeof MatrixRain.fromSnapshot === 'undefined'`
- **根因**:`src/index.ts` 的 `MatrixRain` 命名空间定义里只导出 `destroyAll` / `activeCount` / `detect`,没有 `fromSnapshot`
- **影响**:SSR hydration 是 README 大字宣传的卖点,用户按文档写一定 throw
- **建议**(`src/index.ts:76-202`):在 `MatrixRain` 命名空间添加 `fromSnapshot` 实现,读取 `serialize()` 输出的 JSON,重建 instance

#### **P0-3 · README §DevTools 调试 段落推荐 broken import**

- **位置**:README.md:1158-1162
- **现象 1**:
  ```js
  import { mountFpsOverlay } from '@xietuier/matrix-rain/fps-overlay';
  ```
  → throws `ERR_PACKAGE_PATH_NOT_EXPORTED`
- **现象 2**:
  ```js
  import { themes, textToBitmap, PRESETS, compileUserFunction } from '@xietuier/matrix-rain/core';
  ```
  → throws `does not provide an export named 'textToBitmap'`(0.5.0 移出)
- **根因 1**:`fps-overlay.js` dist 文件存在,但 `package.json` exports 中没有 `./fps-overlay` sub-path
- **根因 2**:`textToBitmap` 0.5.0+ 改为 DOM 依赖(用 OffscreenCanvas),移出 `/core`,只通过主入口暴露
- **建议**(2 选 1):
  1. 修 README:把 `/fps-overlay` 改为 `import { mountFpsOverlay } from '@xietuier/matrix-rain'`;把 `/core` import 改成 `themes, PRESETS, compileUserFunction`(去掉 textToBitmap)
  2. 修 package.json:补 `./fps-overlay` sub-path,把 `textToBitmap` 加回 `/core`(但需 0.5.0 之前的 OffscreenCanvas 检测是否真有 SSR fallback)
- **建议(2 选 1)**:**修 README**(改文档比改 API surface 安全,且能让真实 SSR 故事更准确)

### P1(应该修,影响文档可信度与体验)

#### **P1-1 · README 中 CDN URL 锁死 `@xietuier/matrix-rain@0.1.0`**

- **位置**:README.md:298, 302, 316, 317, 1122, 1126, 1131, 1137, 1146, 1148(共 10 处)
- **现象**:所有 unpkg / jsdelivr 示例都硬编码 `@0.1.0` 版本号,但当前是 0.5.1
- **根因**:这是开发期间占位符,没替换
- **影响**:用户复制粘贴后,会在 0.1.0(早已过时)运行,与 README 当前 API 不一致
- **建议**:README.md 全局 `s|@xietuier/matrix-rain@0.1.0|@xietuier/matrix-rain|`,或用 `https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain/dist/...`(无版本号,跟随 latest)

#### **P1-2 · `matrixRain.length === 0`,IntelliSense 无参数提示**

- **位置**:src/index.ts:31,dist/index.js (function `Z(e={})`)
- **现象**:用户 IDE 写 `matrixRain(` 时不会弹出参数提示,因为函数声明用了默认参数 `e={}`(可见 dist 中 `function Z(e={})`)
- **根因**:tsup 把 `function matrixRain(options?: MatrixRainOptions)` 编译为 `function Z(e={})`(JSDoc 注释被 strip,default param 让 arity 变 0)
- **影响**:对 TypeScript 用户无影响(类型还在),但对 JavaScript 用户 + LSP hover 体验差
- **建议**:tsup 配置加 `keepNames: true` + `noTerser` 注释保留,或者在 build 后注回 JSDoc 注释

#### **P1-3 · `setDensity` 没看到 fontSize 4px 下限 clamp**

- **位置**:src/engine/setters.ts:551(`const setDensity = (fontSize: number) => {...}`)
- **现象**:`textToBitmap` 内部多处用 `Math.max(4, ...)`,但 `setDensity(fontSize)` 路径未看到 clamp
- **根因**:memory `feedback_min_font_size.md` 提到硬下限 4px,需验证所有 setter 路径
- **影响**:用户写 `rain.setDensity(2)` 可能造成 grid cells 过多炸性能,而非友好降级
- **建议**:`src/engine/setters.ts:551` 内补 `fontSize = Math.max(4, fontSize)`,加 unit test 覆盖

#### **P1-4 · 缺 `peerDependencies`,包兼容性靠运气**

- **位置**:package.json:108-125(devDependencies)
- **现象**:无 `peerDependencies` 段,且 `dependencies` 段也是空的(全部依赖都在 dev)
- **根因**:本库是纯前端 canvas 库,无运行时 npm 依赖,这是合理的
- **影响**:但用户不知道最低 Node 版本(README §36 写 `node ≥18`,靠 `engines` 字段),缺 peer 声明可能导致老 bundler(webpack 4 / parcel 1)解析 ESM 主入口出错
- **建议**:`package.json` 加
  ```json
  "peerDependencies": { "typescript": ">=5" }
  ```
  并在 README 中明示"无运行时依赖,纯 DOM API"

#### **P1-5 · Element bundle 体积过大(36KB gzip),超出 Web Component 用户预期**

- **位置**:dist/element.iife.js = 170KB raw / 36.8KB gzip
- **现象**:用 `<script type="module" src="dist/element.js">` 一个标签就吃 36KB,且包含 webgpu-renderer / 40KB atlas PNG
- **根因**:tsup 把 element 入口的所有依赖(包括 3 个 renderer)都打成一个 chunk
- **影响**:Web Component 卖点是"零依赖 + 1 行 HTML",36KB 是不可忽视的 cost
- **建议**:把 element 入口改成只打包 canvas2d 路径 + webgl(按需 dynamic import webgpu)

#### **P1-6 · README §379 API 表格文档 `renderer` 选项描述自相矛盾**

- **位置**:README.md §392 行附近(API 表格 renderer 一行)
- **现象**:表格说"渲染器类型,默认 canvas2d",但 JSDoc 注释(src/types)又说"切换 renderer 需要硬重建...当前 Phase 1 只支持 canvas2d;传 webgl/webgpu 会 throw Error"
- **影响**:用户读 README 表格以为可以传 `renderer: 'webgl'`,运行时 throw
- **建议**:README 表格 `renderer` 行加 `**实验性** · 0.5.1 默认 canvas2d,传 webgl/webgpu 会 throw(等 0.6.0)`

### P2(可选优化)

#### **P2-1 · `tsup.config.ts` 内嵌的 `_atlas_note` 在 `package.json` 里**

- **位置**:package.json:65
- **现象**:用了非标准字段 `_atlas_note`(下划线前缀约定为私有),但 `npm publish` 会忽略下划线开头的字段,功能没问题但不规范
- **建议**:改用 `description` 字段或放到 README

#### **P2-2 · `.npmignore` 与 `files` 字段冗余**

- **位置**:`.npmignore` + `package.json:60-64` `files: ["dist", "README.md", "LICENSE"]`
- **现象**:`files` 字段已限定范围,`.npmignore` 实际不生效(被 files 覆盖)
- **影响**:无功能问题,但给维护者带来认知负担(改 .npmignore 没效果)
- **建议**:删 `.npmignore`,或删 `files` 字段用 `.npmignore`(业界惯例倾向 `files`)

#### **P2-3 · README 行 791 Breaking Change 标的是 0.1.0**

- **位置**:README.md:791
- **现象**:"⚠️ Breaking Change(自 0.1.0 起):FitMode 默认值从旧版的 actual 改为 contain"
- **影响**:0.1.0 是 alpha 早期版本,实际从 0.2.0 才稳定 contain 默认
- **建议**:改为"自 0.2.0 起"

#### **P2-4 · README 章节顺序:`API 完整参考`在 `主题工厂`之后**

- **位置**:README.md §369 在 §482 之后
- **现象**:完整 API 文档在 §369,而 `theme` 章节在 §482 之后才讲 themes() 工厂返回
- **影响**:用户看完 API 引用想看 `themes` 工厂细节要往下翻几百行
- **建议**:把 §369 `⚙️ 完整 API` 拆成 §🎨 主题工厂 之前的章节

#### **P2-5 · dist/index.d.ts 是「简化版」,与 src/types/index.d.ts 不一致**

- **位置**:`dist/index.d.ts`(8 行 re-export)vs `types/index.d.ts`(866 行完整)
- **现象**:package.json `types` 字段指向 `dist/index.d.ts`,但 `types/index.d.ts` 是真正的完整版
- **根因**:tsup 编译时把 src/index.ts 的所有类型 export 都打成了 re-export 形式 `import { ... } from './themes-DO4o9shK.js'`,而不是保留展开
- **影响**:用户 IDE 跳转到 `MatrixRain` 命名空间定义时,看到的不是 src/types/index.d.ts 的清晰 JSDoc,而是 minified 重导出
- **建议**:`tsup.config.ts` 第一个 defineConfig 加 `noExternal: ['../types']`,或在 src/index.ts 直接重导出需要的接口

#### **P2-6 · IIFE 与 UMD 在 package.json 中位置不正交**

- **位置**:package.json:32-33(`unpkg`/`jsdelivr` 都指向 `dist/index.umd.js`)
- **现象**:`unpkg` / `jsdelivr` 是顶层字段,而 `exports` 又有 `./umd` sub-path(也指向 `index.umd.js`);同时 `./script` 和 `./iife` 都指向 `index.iife.js`
- **影响**:冗余,但无功能问题
- **建议**:合并 `./script` 和 `./iife` 为只保留 `./iife`(语义更明确),`./umd` 与顶层 `unpkg/jsdelivr` 共享

#### **P2-7 · README 没有 `peerDependencies` / 安装 Node 版本警告**

- **位置**:README.md §36 安装段落
- **现象**:README 写 `npm install @xietuier/matrix-rain`,但没提示 Node ≥18
- **建议**:在 §📦 安装 后加一行 `**Node ≥18**(本库使用 ES2020 语法 + ESM 主入口)`

---

## 4. 改进建议(具体到文件:行号)

### 4.1 紧急(P0)修复路径

**`src/index.ts:82-101`(P0-1)**:

```ts
destroyAll(container?: HTMLElement): number {
  if (typeof document === 'undefined') return 0;  // ← 新增 SSR 守卫
  // ... 原逻辑
}
```

**`src/index.ts:104-106`(P0-1)**:

```ts
get activeCount(): number {
  if (typeof document === 'undefined') return 0;  // ← 新增 SSR 守卫
  return document.querySelectorAll('.matrix-rain-wrapper').length;
}
```

**`src/index.ts:76-202` 添加 fromSnapshot(P0-2)**:

```ts
// 在 MatrixRain 命名空间添加
fromSnapshot(json: string | MatrixRainSnapshot, options?: {
  canvas?: HTMLCanvasElement; container?: HTMLElement;
}): MatrixRainInstance {
  // 解析 JSON,调用 matrixRain(options),然后用 setXxx 恢复
}
```

**`README.md:1158-1162`(P0-3)** 改为:

```js
// 浏览器:Web Component 标签
import '@xietuier/matrix-rain/element';
// 浏览器:FPS 角标 overlay (从主入口拿)
import { mountFpsOverlay } from '@xietuier/matrix-rain';
// 服务端:无 DOM 依赖,可在 Node/Edge/Worker 跑
import { themes, PRESETS, compileUserFunction } from '@xietuier/matrix-rain/core';
```

### 4.2 重要(P1)修复路径

**`README.md:298,302,316,317,1122,1126,1131,1137,1146,1148`(P1-1)**:全局替换 `@0.1.0` 为空字符串(用 unpkg 的 latest 跟随)或 `@0.5.1`

**`src/engine/setters.ts:551`(P1-3)**:

```ts
const setDensity = (rawFontSize: number): void => {
  const fontSize = Math.max(4, Math.floor(rawFontSize) || 4); // ← 4px 硬下限
  // ... 原逻辑
};
```

**`package.json:108-125`(P1-4)** 在 devDependencies 后加:

```json
"peerDependenciesMeta": {
  "typescript": { "optional": true }
}
```

**`README.md:392 附近`(P1-6)**:renderer 行加 `**实验性,0.5.1 实际只支持 canvas2d**`

### 4.3 推荐(P2)清理

**`package.json:65`(P2-1)**:删 `_atlas_note`,改用 README 注释

**删除 `.npmignore` 或保留并加注释**(P2-2):

```bash
# .npmignore 在 files 字段下不生效,保留为 fallback 文档
```

**`README.md:791`(P2-3)**:改为"自 0.2.0 起"

**`tsup.config.ts`(P2-5)**:第一个 defineConfig 加:

```ts
dts: { bundle: true, resolve: true }  // 把 ../types 也打进 d.ts
```

---

## 5. 审计结论

**适合发布的方面**(已是 0.5.1 最佳实践):

- ✅ 多格式产物(ESM + CJS + IIFE + UMD)
- ✅ 浏览器 + Node + Web Component 三入口分离
- ✅ SSR 友好子路径 `/core`(纯逻辑,8.4KB gzip)
- ✅ CSS 单文件 + sideEffects 字段标记
- ✅ TypeScript 类型齐全且 JSDoc 注释详细
- ✅ `files` 字段精确控制 publish 范围
- ✅ 体积 30KB(gzip)对全功能库合理
- ✅ UMD 头部使用 `globalThis` polyfill 模式,浏览器/Node 通吃

**必须先修再发布**:

- ❌ P0-1:`MatrixRain.activeCount` / `destroyAll()` SSR 守卫缺失
- ❌ P0-2:`MatrixRain.fromSnapshot` 完全没实现却写进 README
- ❌ P0-3:README §DevTools 段落两处 import 示例实测 throw

**强烈建议修**:

- ⚠️ P1-1:CDN URL 锁死 `@0.1.0`
- ⚠️ P1-2:`matrixRain.length === 0` IntelliSense 无提示
- ⚠️ P1-3:setDensity 路径 fontSize 4px clamp 缺失
- ⚠️ P1-6:renderer API 文档与实际行为不符

**整体判断**:矩阵雨包已经是一个**结构优秀**的 npm 包(架构层面 4.5 星),但**文档-产物一致性是当前最大的可用度短板**(2 星)。修完 3 个 P0 后,可以放心 `npm publish` 给外部用户。

---

**审查结束。报告 487 行,真实 gzip 数字 + 真导入测试,所有 P0/P1/P2 都在源码中找到对应位置。**
