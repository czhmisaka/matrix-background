# matrix-rain-package 代码质量审计报告 (0.6.1)

| 项目     | 值                                                                                     |
| -------- | -------------------------------------------------------------------------------------- |
| 审计日期 | 2026-06-15                                                                             |
| 项目版本 | 0.6.1 (CHANGELOG) / package.json `0.5.1` (落后)                                        |
| 仓库根   | `/Users/chenzhihan/Desktop/matrix-rain-package`                                        |
| 审计类型 | 只读审查,未修改任何文件                                                                |
| 总体评级 | **B-** (类型与测试基建扎实,但 3 renderer 高度重复 + 异常吞掉 + catch 误用为主要扣分项) |

> 评分说明: A=可生产 · B=优秀早期项目 · C=可工作但需清理 · D=存在风险 · F=不应发布。本项目处于 0.6.x 早期阶段,内部质量按"成熟项目"标准从严扣分,公共 API 兼容性按 0.x 阶段略宽。

---

## 1. 整体评分

**B- (85/100)**

**扣分明细** (合计 -15):

| 维度                   | 满分 | 得分 | 主要扣分                                                                                                |
| ---------------------- | ---- | ---- | ------------------------------------------------------------------------------------------------------- |
| 类型安全               | 25   | 22   | `as unknown as X` 在 WebGPU 重复 7 处 (`webgpu-renderer.ts:161,177,191,194,318,486`),`window as any` 等 |
| 测试覆盖               | 20   | 17   | 29 个 test 覆盖广,但都是 Node 端 MockCanvas,renderer 行为靠 Playwright 真像素测试兜底 (单一文件)        |
| 复用 / DRY             | 15   | 9    | **3 个 renderer ~70% 字段和方法重复**,无 base class 抽象                                                |
| 错误处理               | 15   | 10   | 大量 `catch {}` / `catch (e) {}` 吞掉异常;`error instanceof Error ? : String(e)` 模式重复 9 次          |
| 命名 / 结构 / 注释     | 10   | 9    | TSDoc 覆盖率好;state 单字母字段 (`a`/`o`/`r`/`i`/`n`/`f`/`b`/`ef`) 是历史遗留的密集热路径优化,可接受    |
| 依赖 / 构建 / 提交规范 | 15   | 13   | sourcemap 关闭、core 入口无 minify(应有)、`/atlas` 静态资产协议不清晰                                   |

**加分明细** (合计 +5):

- TSDoc 完整且结构清晰 (每个文件头部"职责/性能特性/API 兼容"三段式)
- 引入 `getRendererHealth()` (0.6.0+) 跨 3 renderer 统一暴露诊断快照
- `test:pixel` 真像素对比 + `@napi-rs/canvas` 解码 + `nonZeroRatio` 兜底,挡住 0.4.0 fake renderer 灾难重演
- `commitlint` + `husky` + `lint-staged` 工具链齐全,且 `lint-staged` 不阻塞 commit (eslint 走 warn) 是务实选择
- `Object.freeze(getHealth())` 防篡改,`getDiagnostics()` 把编译错误喂回用户而不 throw,设计成熟

---

## 2. 分类发现

### 2.1 [P0] 三个 Renderer 严重重复 — 缺失 base class / template method

**位置**:

- `src/renderer/canvas2d-renderer.ts` (152 行)
- `src/renderer/webgl-renderer.ts` (558 行)
- `src/renderer/webgpu-renderer.ts` (803 行)

**重复点** (按重要度排序):

1. **`drawChar` 写 instance buffer 块 100% 复制粘贴** (`webgl-renderer.ts:413-450` vs `webgpu-renderer.ts:428-456`)
   - 12 个 `buf[slotOff + N] = ...` 字段完全相同,只是底层 buffer 类型 (`Float32Array` vs `Float32Array`)
   - charset 索引 → atlas idx → UV 查表逻辑一字不差
   - **diff 实测 30 行只有变量名差异**,意味着任何字段顺序调整都要改 3 个文件
2. **`setCharset` / `setFontSize` / `pause` / `resume` / `drawTrail` / `destroy`** 在 3 个 renderer 都是 1-5 行纯转发或相同逻辑
3. **状态字段 `_destroyed / _paused / _initialized / _charset / _w / _h / _dpr / _cellSizePx`** 在 3 个 class 中字段名一致,初始化模式一致
4. **atlas 加载 + missing chars warn + 错误记录 health** 5 行代码逻辑相同 (`webgl-renderer.ts:180-187` vs `webgpu-renderer.ts:204-211`)
5. **`resizeGrid`** 在 webgl/webgpu 都是"重新分配 instance buffer + 不重建 bindgroup",逻辑相同 (`webgl-renderer.ts:491-498` vs `webgpu-renderer.ts:768-802`)
6. **`_instanceBuffer` / `_charsetMap` / `_atlasLookup` / `_atlasJson` 4 字段同时声明** 在 webgl + webgpu 中字段、类型、用途完全相同

**建议** (重要度递增):

1. **抽出 `BaseRenderer` 抽象类** (abstract class):
   - 持有 `_destroyed / _paused / _initialized / _charset` 4 字段
   - 提供 `pause() / resume() / destroy() / setCharset()` 默认实现
   - 抽象方法 `protected writeInstance(slotOff, ch, cx, cy, r, g, b, a, atlasIdx, uv)` — 让 webgl/webgpu 只覆盖底层 buffer 写入
2. **抽出 `AtlasMixin` 或独立 `AtlasController`**,管 atlas JSON / PNG / charsetMap / missing warn
3. **`drawChar` 公共部分** 提到 base,仅 `gl.bufferSubData` / `queue.writeBuffer` 留 subclass 实现

**预计收益**:

- webgpu-renderer.ts 803 行 → ~500 行 (-38%)
- 字段顺序修改 = 改 1 处而非 3 处
- 单元测试 base 即可覆盖 charset / pause / destroy 路径

---

### 2.2 [P0] 错误吞掉与异常吞没问题

**位置与现状**:

| 文件                         | 行号               | 代码                                                                        | 问题                                                          |
| ---------------------------- | ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/index.ts`               | 91-93              | `try { inst.destroy(); } catch (e) {}`                                      | 吞掉 destroy 错误,后续 `wrapper.remove()` 仍执行,无任何上下文 |
| `src/matrix-rain-element.ts` | 183                | `try { this.__instance.destroy(); } catch {}`                               | 同上                                                          |
| `src/matrix-rain-element.ts` | 207                | `try { this.__instance.destroy(); } catch {}`                               | 同上                                                          |
| `src/engine.ts`              | 92                 | `__debugInstances destroyAll 内 catch {}`                                   | 同上                                                          |
| `src/engine.ts`              | 486, 496, 506, 516 | `fireOnFrame / fireOnResize / fireOnThemeChange / fireOnTargetFinish` catch | 用户回调抛错被静默,违反"用户代码错了应暴露"原则               |

**问题放大**:

- `src/curves/sandbox.ts:482, 556` 用 `catch (e: any)` — TypeScript strict 模式下应改为 `catch (e: unknown)` 后 `instanceof Error` 窄化
- `src/engine.ts:207-211` 把 `renderer.init() failed` 静默 + 一次 warn,后续每帧的 draw\* 全是 no-op,屏幕只剩残影拖尾;0.5.1 P0-1 fake renderer bug 就是这种"静默失败"的复现

**建议**:

1. **destroy 路径** 改为 `console.error('[matrix-rain] destroy failed:', e)` 至少留痕,不要 `catch (e) {}` 完全吞
2. **用户回调** (`onFrame` / `onResize` 等) 改为 `console.error` 一次后**继续保持监听** (当前是 stop rAF 后抛错就静默,行为可接受,但应有 log)
3. **统一 `errorToMessage(e: unknown): string`** 工具函数,封装 `e instanceof Error ? e.message : String(e)` 模式 (现已在 9 个文件复制 9 次)

---

### 2.3 [P1] 类型安全的边缘松动

**统计**:

- `as any`: 7 处 (`src/index.ts:89,142,168` · `src/fps-overlay.ts:50,81` · `src/matrix-rain-element.ts:71` · `src/curves/sandbox.ts:482,556`)
- `as unknown as X` (double cast): 9 处
  - `src/engine.ts:69,527,824,859` (4 处,均为"挂载私有字段"模式,可统一)
  - `src/renderer/webgpu-renderer.ts:161,177,191,194,486` (5 处,集中在 webgpu init)
  - `src/renderer/auto-pick.ts:80` (1 处)
- `as` 强转总计 ~50+ 处,大量集中在 themes.ts 重复 HSLPalette 字面量

**问题点**:

1. **`src/themes.ts:17-70`**: 每个 cold/warm HSLPalette 都有 `as HSLPalette`,实际是因为 HSLPalette 字段顺序 / 缺省 aMax 没自动推断;应让 HSLPalette 字段全部 optional,或写工厂函数消除重复
2. **`src/renderer/webgpu-renderer.ts:191,194`** 从 `state as unknown as { __atlasJsonUrl?: string }` 取字段 — 这是**代码异味**:state 不该承载 atlas URL,应通过 `setAtlasUrls` 注入 (webgl 路径已经这样做了)。修法:删掉这两行,改用与 webgl 一致的 `setAtlasUrls` 注入
3. **`src/index.ts:142` `const w = window as any`** — 应改为 `const w = window as unknown as { innerWidth: number; ... }` 或抽取 `WindowWithExtras` 类型
4. **`src/matrix-rain-element.ts:71` `(class {} as any)`** SSR 兜底,但此时 HTMLElement 也未定义,`class {} as any` 无意义;应使用更精确的占位类型

**non-null assertion (`!.`)**: 4 处,均在 webgl-renderer (uniforms / instanceBuffer),用 `!` 后置断言。**可以接受**(已通过 `if (this._destroyed) return` 守卫),但 `tsup` + `noImplicitAny` + `strictNullChecks` 的组合下不算违规

---

### 2.4 [P1] GL 错误检查覆盖不完整

**覆盖现状**:

- ✅ WebGL2: `webgl-renderer.ts:346-349` 每帧 `gl.getError()` 轮询 (0.6.0+ 加)
- ✅ WebGPU: `webgpu-renderer.ts:287,356-367` `pushErrorScope('validation')` + `popErrorScope().then(...)`
- ✅ atlas JSON: schema 校验 (`atlas-loader.ts:138-149`)
- ✅ shader compile/link: `webgl-renderer.ts:536-540,551-555` 拿 getShaderInfoLog / getProgramInfoLog

**缺失**:

- ❌ WebGL `_uploadAtlasTexture` PNG `onerror` 仅 `reject(new Error(...))`,**未把错误码 push 到 health**;`webgl-renderer.ts:521-523` 与 `webgpu-renderer.ts:466-468` 同样模式,缺少统一 error → health bridge
- ❌ WebGPU `createTexture / createBuffer / createBindGroup` 失败**不检查返回值**(返回 null 时 GPU API 不抛错)
- ❌ `init` 失败后 `_health.initialized` 仍为 false,但 `_gl / _device` 已被部分设置 → 后续 `destroy()` 不能完整释放 GL 资源。`webgl-renderer.ts:354-372` `destroy()` 在 `gl` 存在时 `deleteVertexArray` 等,但若 init 在 `_vao = gl.createVertexArray()` 之后失败,`_program` 等已 partial set,目前的写法是 "如果非 null 就 delete" 实际安全,但容易在重构时漏掉新字段

**建议**: 抽 `safeGpuCall<T>(label: string, fn: () => T): T` 辅助,把"调用 + 错误捕获 + 入 health"统一

---

### 2.5 [P2] sourcemap / 构建产物可读性

**问题**:

- `tsup.config.ts:20` 主入口 `sourcemap: false`,意味着 npm 上的 dist 产物出 bug 时只能看 minified 字符串
- `core.cjs` (SSR 入口) `minify: false` 是对的;但主入口 `index.cjs / index.js` 一律 minify,**不利于调试**。建议至少 `dev` build 走 sourcemap
- `dist/atlas/` 内置字符 PNG + JSON (1MB+),但 `files` 字段没列 atlas,只列 `dist`;`npm publish` 会包含 atlas,但 README 没说需要同发 atlas,部署到 CDN 步骤缺失

---

### 2.6 [P2] 命名规范边缘

**已合规** (强制要求检查的点):

- 类名 PascalCase (`Canvas2DRenderer`, `WebGLRenderer`, `MatrixRainState`, `RendererHealth`)
- 常量 UPPER_SNAKE (`RGBA_BUF_SIZE`, `WEBGL_THRESHOLD`, `FIXED_DT`)
- 私有字段下划线前缀 (`_destroyed`, `_paused`, `_charset`)
- 文件名 kebab-case (`webgl-renderer.ts`, `atlas-loader.ts`, `auto-pick.ts`)

**可商榷**:

- `state.a / o / r / i / n / f / b / ef` (`engine/state.ts:271-285`) 单字母字段是**历史遗留 + 热路径优化**(注释说"避免 V8 deopt"),但 `b: Cell[][]` 这种核心数据结构用单字母让人抓狂。`engine.ts:218-228` `state.n = ...; state.a = ...; state.o = ...; state.ef = ...; state.r = ...; state.i = ...` 6 个连续短变量名可读性差。**建议**:**保留单字母字段名**(热路径),但 `interface MatrixRainState` 的 TSDoc 加别名注释 `{@link a → viewportWidthCSS}`
- `MatrixRainInstance.setTargetBitmap` 接受 `(bitmap, opts)` 而非 `(opts)` 对象,API 形态不统一 (其他 setter 走 `setX(params: XParams)`);属于历史债务,不在本审计范围内

---

### 2.7 [P2] `instanceof Error` 模式重复 9 次

**位置**:

```
src/renderer/webgpu-renderer.ts:238  const msg = e instanceof Error ? e.message : String(e);
src/renderer/webgpu-renderer.ts:364  const msg = popErr instanceof Error ? popErr.message : String(popErr);
src/engine.ts:208                   const msg = e instanceof Error ? e.message : String(e);
src/engine/setters.ts:243/428/443/458/473 (5 处)
src/renderer/webgl-renderer.ts:260  const msg = e instanceof Error ? e.message : String(e);
src/engine/state.ts:577             diagnostics.brightnessCurve = e instanceof Error ? e.message : String(e);
```

**建议**: 抽 `src/util/error.ts`:

```ts
export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
```

---

### 2.8 [P3] 测试覆盖评估

**29 个 test 文件** (8318 LOC test/,11714 LOC src/) — 测试/源码比 0.71,优秀

**覆盖强项**:

- 集成 (smoke / leak / canvas-remove / auto-pick)
- 性能 (frame-rate, build-size)
- 边缘 (text-fit / char-gap / render-scale)
- 浏览器真像素 (renderer-pixel.mjs, Playwright + @napi-rs/canvas)
- Health 诊断 (renderer-health.mjs)

**覆盖薄弱**:

- `src/curves/sandbox.ts` (568 行,含 `new Function` 编译沙箱) **没有专门的单元测试** — 仅 `test/easing.mjs` 测了 ease 函数。沙箱的黑名单 (`RUNTIME_BLOCKS`) / 编译错误路径 (`MAX_STEPS` 抛出 / `MAX_STR` 截断) 没单测
- `src/engine/setters.ts` 844 行有 30+ setter,没有针对单 setter 的"set 后 get 应返回" 测试
- `src/renderer/webgpu-shaders.ts` WGSL 代码 0 行测试,只能靠 renderer-pixel.mjs 端到端覆盖
- `src/bitmap.ts` (355 行, textToBitmap / imageToBitmap / fileToImage) 没有 "已知字符串 → 已知像素 hash" 单元测试

**测试运行方式**: `npm test` 串行跑 29 个 `node test/*.mjs`,没有 parallelism。CI 友好但本地慢。

**断言质量**: 普遍用 `node:assert/strict` 的 `assert.equal / ok / deepEqual`,质量合格。无 `expect`/`should` 风格依赖。

---

### 2.9 [P3] 依赖卫生

**devDependencies 16 个**,无 `dependencies` (纯 ESM 自包含):

| 依赖                                        | 必要性                          | 备注                         |
| ------------------------------------------- | ------------------------------- | ---------------------------- |
| `@commitlint/cli + config-conventional`     | 必要                            | conventional commits         |
| `@napi-rs/canvas`                           | 必要                            | test:pixel 解码 PNG          |
| `@types/node`                               | 必要                            | process/Buffer 类型          |
| `@typescript-eslint/eslint-plugin + parser` | 必要                            | flat config 兼容版本         |
| `eslint` ^9                                 | 必要                            | flat config 必需 v9+         |
| `eslint-plugin-vue + vue-eslint-parser`     | 仅 site/ demo 用,不是 src/ 必要 | 可考虑挪到 site/package.json |
| `globals` ^15                               | 必要                            | eslint flat config globals   |
| `husky` ^9                                  | 必要                            | 已有 .husky/                 |
| `lint-staged` ^15                           | 必要                            |                              |
| `playwright` ^1.60                          | 必要                            | test:pixel + bench           |
| `prettier` ^3                               | 必要                            |                              |
| `tsup` ^8.5                                 | 必要                            | 构建                         |
| `typescript` ^5.4                           | 必要                            |                              |

**问题**:

- `eslint-plugin-vue` + `vue-eslint-parser` 出现在主 package.json devDependencies,但 src/ 全部是 .ts,无 Vue 组件。应挪到 `site/package.json`。当前安装到 root 是浪费
- `playwright` ^1.60 + `chromium` 浏览器 ~150MB,只在 bench/test:pixel 时用,但装到 root devDeps 导致 `npm install` 慢

---

### 2.10 [P3] lockfile 一致性

`package-lock.json` (182KB) 与 package.json 一致 (npm install 无 diff),已审计。`engines.node >= 18` 与 `target: es2020` 兼容。

---

### 2.11 [P3] CHANGELOG / 提交规范

- ✅ `CHANGELOG.md` 33KB,完整记录 0.x 全部 breaking changes + P0/P1 修复细节
- ✅ `commitlint.config.cjs` 启用 conventional commits,允许中文 subject
- ✅ `.husky/commit-msg` + `pre-commit` 已挂
- ✅ git log: 90% commit 符合 conventional 格式,偶有 `Revert` (f56c935) 标注规范
- ⚠️ `package.json:3` version = `0.5.1` 但 CHANGELOG 顶部 `[Unreleased] charGap` 实际已发布 (npm view 应为 0.6.1) — **版本号未同步**!这会导致 npm publish 时发布 0.5.1,CHANGELOG 显示 0.6.1 不一致
- ⚠️ `f56c935` 是 `Revert "fix(renderer): 0.4.3 ..."`,但 0.4.3 在 CHANGELOG 中**未撤销记录**,会出现"代码已 revert 但 CHANGELOG 仍显示 0.4.3 修复存在"的矛盾

---

## 3. Top 10 待改进项

> 格式: `[P?] 标题 | 文件:行 | 现状 | 建议`

### 3.1 [P0] 抽 `BaseRenderer` 抽象类消除 3 renderer ~70% 重复

- **位置**: `src/renderer/canvas2d-renderer.ts:51-152` · `src/renderer/webgl-renderer.ts:73-558` · `src/renderer/webgpu-renderer.ts:79-803`
- **现状**: `_destroyed/_paused/_initialized/_charset/_w/_h/_dpr/_cellSizePx` 字段在 3 类声明;`pause/resume/destroy/setCharset/drawChar instance-buffer-写入块` 实现 100% 复制
- **建议**:
  ```ts
  // src/renderer/base-renderer.ts (new)
  export abstract class BaseRenderer implements MatrixRainRenderer {
    protected _destroyed = false;
    protected _paused = false;
    protected _initialized = false;
    protected _charset = '';
    protected _w = 0;
    protected _h = 0;
    protected _dpr = 1;
    protected _cellSizePx = 32;

    pause() {
      this._paused = true;
    }
    resume() {
      this._paused = false;
    }
    setCharset(s: string) {
      this._charset = s;
    }

    // subclass implements:
    protected abstract writeInstance(
      slotOff: number,
      ch: number,
      cx: number,
      cy: number,
      r: number,
      g: number,
      b: number,
      a: number,
      atlasIdx: number,
      uv: AtlasUV | undefined
    ): void;

    drawChar(ch, cx, cy, r, g, b, a) {
      if (!this._canRender()) return;
      const chStr = this._charset[ch];
      if (!chStr) return;
      const code = chStr.charCodeAt(0);
      const atlasIdx = this._atlasIdx(code);
      const uv = this._atlasUv(code);
      const slotOff = this._drawCallIdx * INSTANCE_STRIDE_FLOATS;
      if (slotOff + INSTANCE_STRIDE_FLOATS > this._instanceBufferLength()) return;
      this.writeInstance(slotOff, ch, cx, cy, r, g, b, a, atlasIdx, uv);
      this._drawCallIdx++;
    }
  }
  ```
  预计 webgpu-renderer.ts 803 行 → ~450 行 (-43%)。

### 3.2 [P0] 抽 `errorMessage(e: unknown): string` 工具消除 9 处重复

- **位置**: `src/engine.ts:208` · `src/engine/setters.ts:243,428,443,458,473` · `src/engine/state.ts:577` · `src/renderer/webgl-renderer.ts:260` · `src/renderer/webgpu-renderer.ts:238,364`
- **现状**: `e instanceof Error ? e.message : String(e)` 字面量复制 9 次
- **建议**:
  ```ts
  // src/util/error.ts (new)
  export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
  ```
  全局替换,9 处都改 import。

### 3.3 [P0] `destroy` 路径不要完全吞错

- **位置**: `src/index.ts:91-93` · `src/matrix-rain-element.ts:183,207` · `src/engine.ts:92`
- **现状**: 5 处 `catch (e) {}` 或 `catch {}` 完全静默 destroy 异常
- **建议**: 改为:
  ```ts
  try {
    inst.destroy();
  } catch (e) {
    console.error('[matrix-rain] destroy failed:', errorMessage(e));
  }
  ```
  至少留痕,方便 debug 内存泄漏。

### 3.4 [P1] `webgpu-renderer.ts` 删掉 `state as unknown as { __atlasJsonUrl }` 反模式

- **位置**: `src/renderer/webgpu-renderer.ts:191-195`
- **现状**: webgpu 从 `state as unknown as { __atlasJsonUrl?: string }` 取 atlas URL,但 engine.ts `setAtlasUrls('/atlas/jetbrains-mono-32.json', '/atlas/jetbrains-mono-32.png')` 只在 webgl 路径调 (engine.ts:199),**WebGPU 路径根本走不到**
- **建议**: 在 `engine.ts:188` `case 'webgpu':` 里也调一次 `setAtlasUrls(...)`,然后删掉 webgpu-renderer.ts:191-195 的 5 行 double-cast hack。统一 setAtlasUrls 是 webgl/webgpu 共享入口

### 3.5 [P1] `themes.ts` HSLPalette 字段全部 optional 或工厂化

- **位置**: `src/themes.ts:17-70`
- **现状**: 5 个主题 × 2 (cold/warm) = 10 处 `as HSLPalette` 强转
- **建议**: HSLPalette 字段 (`h`/`s`/`lMin`/`lMax`/`aMax`) 全 optional,工厂函数推断类型:
  ```ts
  const HSL = (h: number, s: number, lMin = 0.05, lMax = 0.95, aMax = 0.95): HSLPalette => ({ h, s, lMin, lMax, aMax });
  ```
  10 处 `as HSLPalette` 全部删掉,字段值更紧凑

### 3.6 [P1] WebGPU `createTexture / createBuffer / createBindGroup` 返回 null 检查

- **位置**: `src/renderer/webgpu-renderer.ts:475-498, 567-602, 689-721`
- **现状**: WebGPU API 失败时返回 `null` 而非 throw,但代码假设返回非 null
- **建议**:
  ```ts
  const tex = device.createTexture({ ... });
  if (!tex) throw new Error('[WebGPURenderer] createTexture failed (OOM?)');
  ```
  5 处需要补

### 3.7 [P1] `eslint-plugin-vue` + `vue-eslint-parser` 挪到 `site/package.json`

- **位置**: `package.json:116,124`
- **现状**: 主 package.json 装 vue 相关插件,但 src/ 没有 Vue 组件,只有 site/ demo 用
- **建议**: 移到 `site/package.json` devDependencies,主项目 npm install 节省 ~5MB

### 3.8 [P2] 修 `package.json` version 与 CHANGELOG 同步

- **位置**: `package.json:3` = `0.5.1` 但 git 头部 commits + CHANGELOG 0.6.1 + `tsup`产物 `dist/index.cjs` 内版本
- **现状**: 版本号落后 1 个 minor
- **建议**: 立即 `npm version 0.6.1 --no-git-tag-version` 同步,再 `npm publish`

### 3.9 [P2] 给主入口 (`index`) 生成 sourcemap

- **位置**: `tsup.config.ts:20`
- **现状**: `sourcemap: false`,dist 内联 minify,生产 debug 困难
- **建议**:
  ```ts
  sourcemap: true, // 0.6.2+
  ```
  体积影响 < 5%,但用户报错时能拿到 source map

### 3.10 [P2] `sandbox.ts` 加单元测试

- **位置**: `src/curves/sandbox.ts:430-517` · 当前无专门 test
- **现状**: `new Function` 编译沙箱是安全敏感路径,但无单元测试
- **建议**: 新增 `test/sandbox-isolation.mjs`,验证:
  - 黑名单词 (`this`/`arguments`/`Function`/`eval`/`import`/`require`) 被拒
  - 编译错误 throw 合理 message
  - `MAX_STEPS` 超限 throw
  - `MAX_STR` 超长 warn + 返回 `() => 0`

---

## 4. 其他发现 (中低优先级)

### 4.1 测试运行无 parallelism

- 29 个 `node test/*.mjs` 串行,完整跑需 ~30s。`test:health` / `test:pixel` 跑 Playwright 头启慢
- 建议: 用 `node --test --test-concurrency=4` (Node 18+ 自带 test runner) 或 `concurrently` 并发 4-8 个,目标 ≤ 10s

### 4.2 `setRendererHealth` (0.6.0+) 跨 3 renderer 路径不统一

- canvas2d: `init` 失败 throw,**没写 health.lastInitError** (canvas2d-renderer.ts:76-86 没有 try/catch)
- webgl/webgpu: 写 health
- canvas2d `init()` fail 时 caller 拿到 throw,**与 webgl 行为不一致**(webgl 也是 throw 但已经入 health)
- 建议: canvas2d 也加 health 字段统一

### 4.3 `engine.ts:733-734` catch 后继续 rAF 但没 console.error 当前帧

- `console.error` 已加 (`engine.ts:731`),但错误信息包含原始 Error,**用户 debug 时**长 verbose
- 建议: 把 stack 第一帧截到 `[matrix-rain] draw error at frame N` 简短摘要 + `error.stack` 全量

### 4.4 `tsconfig.json` 缺 `noImplicitOverride`

- `strict: true` 已启用,但 `noImplicitOverride` 默认 false
- 建议: 启用,强制子类显式 `override` 关键字,提高重构安全 (renderer 现在就有大量 `override` 写法风险)

### 4.5 `engine/setters.ts` 缺单元测试

- 30+ setter,每个 setter 行为应 "set 后 state.X 应等于",目前没有针对 setX 函数的单测
- 建议: 加 `test/setters.mjs`,每个 setter 1-2 个 assert case

### 4.6 `matriRain-element.ts` 用 `(class {} as any)` SSR 兜底

- **位置**: `src/matrix-rain-element.ts:71`
- 现状: `class {} as any` 在 SSR 环境 extends,损失类型
- 建议: 改为 `declare class _BaseElement { /* minimal interface */ }`,`extends` `_BaseElement`

### 4.7 `webgpu-types.ts` 645 行手写类型声明

- 自实现 WebGPU 接口 (`GPUDevice` / `GPUBuffer` 等) 645 行,与官方 `@webgpu/types` 重复
- 当前理由注释说 "避免引入整个 @webgpu/types 依赖",但 `@webgpu/types` 仅 ~200KB,**且** 与此手写版的差异就是 "覆盖更多 API surface"
- 建议: 评估是否改用 `@webgpu/types`,开发成本与维护成本哪个更低

### 4.8 `setDebugHook` 挂在 window 上 (`engine.ts:67-98`)

- 全局命名空间污染 (`window.__matrixRainDebug`),无 `Symbol` 或 WeakMap 隔离
- 风险: 与用户代码的 `__matrixRainDebug` 冲突
- 建议: 加 `Symbol.for('matrix-rain-debug')` fallback,或文档强标 "保留命名空间"

---

## 5. 总结

| 维度        | 评级   | 关键发现                                                           |
| ----------- | ------ | ------------------------------------------------------------------ |
| 类型安全    | **A-** | strict 全开,`as` 集中在 themes 与 webgpu,可控                      |
| 测试覆盖    | **B+** | 29 个 test 广覆盖,但 sandbox/setters 单测缺失                      |
| 代码复用    | **C+** | 3 renderer 重复 70%,抽 base class 收益巨大                         |
| 错误处理    | **C**  | 大量 catch 吞错,9 处 `instanceof Error` 模式重复                   |
| 文档 / 注释 | **A**  | TSDoc 覆盖率好,每个文件顶部"职责/性能/兼容"三段式                  |
| 依赖卫生    | **B**  | 16 devDep 中 2 个 (vue) 可移走                                     |
| 构建产物    | **B-** | sourcemap 关闭是最大遗憾,版本号不同步                              |
| 提交规范    | **A-** | conventional commits + husky + lint-staged 完整,版本号不同步是缺陷 |

**一句话**: 类型与文档质量是 1.0 项目水准,但 3 个 renderer 的重复代码 + catch 吞错 模式是 0.6.x 阶段必须解决的**最大技术债**。优先做 §3.1 (抽 BaseRenderer) + §3.2 (errorMessage util) + §3.4 (webgpu 删 double-cast),预计 -500 行重复代码 + 消除 9 处隐患。
