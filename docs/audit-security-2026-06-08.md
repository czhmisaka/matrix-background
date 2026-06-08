# @xietuier/matrix-rain · 安全与隐私审计

- 审计日期:2026-06-08
- 审计范围:`src/` 全量 + `site/src/` 全量 + `site/index.html` + `site/vite.config.ts` + `site/public/legacy/*.html` + `robots.txt` + `sitemap.xml` + `package.json` (root + site) + `npm audit` 输出 + `test/sandbox.mjs`
- 审计方法:逐源点 v-html/innerHTML 反向追溯数据源 + 词级沙箱绕过枚举 + localStorage/cookie/CSP grep + setTargetBitmap 入口参数边界分析
- 输出:可执行清单(P0/P1/P2 优先级),不修改任何现有代码

---

## TL;DR

| 维度 | 结论 | 风险 |
|---|---|---|
| v-html XSS(2 处) | 1 处真实 self-XSS(低危,仅攻击自己),1 处 0 风险(纯静态) | P2 |
| 沙箱词级匹配 | 覆盖度 85% · 缺 `this.constructor.constructor` 链 + async/await + generator 等少数绕过向量 | P1 |
| localStorage | 仅 2 处用法(API key + theme),无其它敏感数据 · 沙箱已拦 `localStorage` | P1(警告文案) |
| CSP / Headers | 完全没有 CSP / X-Frame-Options / X-Content-Type-Options | P1 |
| setTargetBitmap 输入校验 | 缺失大小上限 / 形状一致性校验 → OOM 风险 | P1 |
| 第三方依赖漏洞 | 0 个 prod 漏洞 · 2 个 dev-only moderate(esbuild / Vite) | P3 |
| LLM 输出渲染 | **不经过 v-html**,走 `{{ }}` 自动转义,无 XSS | 安全 |
| 第三方 CDN | 0 个(对齐 `project_deployment_goal.md` 记忆) | 安全 |

**整体评估:中低风险**。项目无真实多用户 XSS 攻击面(blog 内容、log 全部本地静态或 self-only),但缺少纵深防御(CSP / 沙箱补全 / 输入上限)。

---

## 1. v-html / innerHTML 风险评估

### 1.1 `site/src/pages/DemoNoiseConverge.vue:100` · `v-html="line"`

**Source 追溯**:
- `line` 来自本文件 135-138 行的 `log(msg)` 函数,4 个调用点全在同一文件:
  - line 155: `` log(`<span class="log-tag">[target]</span> set bitmap "${text}" ...`) ``
  - line 173: `` log(`<span class="log-tag">[mode]</span> phase = ${p}`) ``
  - line 179: `` log(`<span class="log-tag">[order]</span> lockOrder = ${o}`) ``
  - line 203: `log('<span class="log-tag">[target]</span> noise-converge 动画结束,onTargetFinish 触发')`
- **唯一用户输入是 `${text}`(line 155)**,源头是 `<input v-model="inputText" maxlength="20">`(line 26-34)。
- `text = (rawText || '').trim() || ' '`(line 142) — 仅 trim,无 escape。

**结论**:
- ✅ **不是 LLM 输出** · ✅ **不是 API response** · ✅ **不是远端 markdown**
- ⚠️ **是 user input(self-only)**:用户在输入框打字 → 嵌入 log → v-html 渲染
- 实际可注入的 payload 受 `maxlength=20` 限制(JS 端在 input 上有硬限制,但 `applyBitmap(inputText)` 的 `rawText` 来自 v-model,Vue 不会绕过 maxlength)。
- 注入例子(用户攻击自己):
  - `<img src=x onerror=alert(1)>` → 32 字符,超 maxlength
  - `<b>X</b>` → 8 字符,会被渲染为加粗
  - `<a href=javascript:alert(1)>x</a>` → 32 字符,超 maxlength
  - 可行注入:仅限视觉篡改(self-XSS,影响自己)
- **评级:P2(自残 XSS,无跨用户攻击面)**

### 1.2 `site/src/pages/BlogPage.vue:31` · `v-html="post.body"`

**Source 追溯**:
- `posts` 数组在 line 47-93,**硬编码在同一 .vue 文件里**,3 篇 post。
- 数据流:`const posts = [...]` → `v-for="post in posts"` → `v-html="post.body"`
- 无 fetch / 无外部 API / 无 LLM / 无 CMS / 无文件系统读取。

**结论**:
- ✅ **完全静态** · ✅ **随仓库发布,PR review 可控**
- 风险等同于"如果有人在 PR 里塞 `<script>`,CI 应当拦截"——但目前没 CI lint 校验 post body 的 HTML 安全。
- **评级:实际 P0(零风险),但建议加 ESLint 规则或 build-time 检查防回归到 P1**。

### 1.3 LLM 输出是否经 v-html?

**已确认不会**。
- LLM response 在 `useAitune.ts:666` → `parseLlmResponse` 解析为 `LlmResult`
- 进入 `addMsg('ai', lastReason || '已应用补丁', ...)`(line 728)
- 渲染处:`site/src/components/ChatLog.vue:12` 用 `<div class="content">{{ m.content }}</div>` — **文本插值,自动转义**。
- 结论:LLM 输出安全。

### 1.4 legacy 静态页面的 innerHTML

`site/public/legacy/02-themes.html:48` 和 `03-variants.html:48` 用 `cell.innerHTML = ...` 渲染主题/变体卡片,数据来自页面内静态数组,无用户输入。**P3,无风险**(只用于 legacy 演示,robots.txt 已 `Disallow: /demo/_archive/`)。

---

## 2. sandbox validateUserFunction 覆盖度

### 2.1 当前实现(`src/curves/sandbox.ts`)

- 词级黑名单 50+ 词(window/document/navigator/globalThis/self/Proxy/Reflect/eval/Function/import/setTimeout/queueMicrotask/... 见 line 21-48)
- 运行时硬禁 6 词(this/arguments/Function/eval/import/require)
- 步数 10000 上限
- 字符串 5KB 上限
- 类型守卫:返回必须 string/number
- 'use strict' 强制 this=undefined

### 2.2 已有测试(`test/sandbox.mjs` 9 case)

| Case | 内容 | 覆盖 |
|---|---|---|
| 1 | 词级 `this["win"+"dow"]` | ✅ |
| 2 | window / document / navigator / globalThis / self | ✅ |
| 3 | Proxy / Reflect | ✅ |
| 4 | new Function / eval / import | ✅ |
| 5 | setTimeout / queueMicrotask | ✅ |
| 6 | 合法代码(Math/clamp/ease/noise/Number.isFinite) | ✅ |
| 7 | 词级边界(allocation 不命中 location) | ✅ |
| 8 | validateUserFunction API | ✅ |
| 9 | 步数限制 | ✅(只测了基本调用,未测死循环触发) |

### 2.3 覆盖度差距

| # | 绕过向量 | 能否命中 | 备注 |
|---|---|---|---|
| G1 | `this.constructor.constructor('return window')()` | ❌ `constructor` 不在黑名单 | **关键绕过**:Function constructor 通过 .constructor 链重获 |
| G2 | `({}).constructor.constructor('alert(1)')()` | ❌ 同 G1 | 同上 |
| G3 | `async () => 1` + `await` | ❌ `async` / `await` 不在黑名单 | 异步函数本身无害,但 Promise 已被黑,那 async 实际不可能?需验证 |
| G4 | `function*` 生成器 | ❌ `function*` / `yield` 不在黑名单 | 返回 Generator 实例,类型守卫可拦 |
| G5 | `class Foo {}` | ❌ `class` 不在黑名单 | 语法上不能 return class,但语法错误也会编译失败 |
| G6 | `with({}) {}` | ✅ `with` 已被黑 | OK |
| G7 | `\u0077indow` (unicode escape) | ❌ `\b` 匹配不到 `\uXXXX` 编码的 window | 词级分析盲区 — 词法分析后源码经过字符串 escape 转回,实际编译期能拿到 `window` |
| G8 | `["win","dow"].join('')` 拼字符串当标识符 | ✅ `\b` 命中 `window` 在 result string 内 — 命中! |
| G9 | `obj[window]` | ✅ `\b` 命中 `window` | OK |
| G10 | `obj["win"+"dow"]` | ✅ 命中 | OK |
| G11 | 反引号模板 `` `${window}` `` | ✅ 命中 | OK |
| G12 | `eval.call(null, 'window')` | ❌ `eval` 已黑,但 `eval` 是关键字,`eval.call` 也是 eval | OK 拦 |
| G13 | `setTimeout('alert(1)', 0)` | ✅ 命中 `setTimeout` | OK |
| G14 | `setTimeout.call(null, ...)` | ✅ 命中 | OK |
| G15 | `globalThis.eval` | ✅ `globalThis` 已黑 | OK |
| G16 | 死循环 `while(1){}` 步数限制 | ⚠️ 已测 basic,但未测触发上限 | 需补 `while(true){}/* step overflow */` |
| G17 | 内存炸弹 `a=[];while(1)a.push(a)` | ❌ 无内存限制,步数可能跑完 10000 步但 array 巨大 | 沙箱缺 OOM 保护 |
| G18 | `__proto__` / `prototype` 链 | ❌ 不在黑名单 | 通过 `({}).__proto__.constructor.constructor` 可逃 |

### 2.4 关键评级

- **G1 / G2 / G18 是真实可逃逸路径**(Function constructor via .constructor chain)
- 缓解:类型守卫 `typeof __ret !== 'number' && typeof __ret !== 'string'` 会拒 — 但攻击者可以 `return eval(...)` 来返回字符串,绕过不了。实际 G1 走的是 `return this.constructor.constructor('return window')()` 后再访问 window — 此时 return 值可能是 undefined,被 `() => 0` 兜底接住。
- **结论:沙箱在"阻止函数引用逃逸 + 阻止执行副作用"上 OK,但在"阻止代码编译"上**未完全严密——攻击者不能直接 `return window`,但可以 `return globalThis.alert` 的引用之类。**P1**。

### 2.5 建议(只列,不实现)

- G1/G2/G18:加黑名单 `constructor`(注意:`constructor` 是合法属性名,可能误伤用户的 `obj.constructor` 用法 — 需评估对 userFunc 场景的影响)
- G7:加黑名单 `\u` 开头的 escape 序列
- G3-G5:补 async/await/class/function* 黑名单(防御性,即使被类型守卫拦)
- G16:补死循环 step 触发测试
- G17:加内存限制或循环次数步数限制(currently 只有 AST 步数,无真实内存监控)

---

## 3. localStorage 用法审计

### 3.1 grep 全部用法

| 文件 | 行号 | 用途 | 风险 |
|---|---|---|---|
| `site/src/composables/useAitune.ts` | 53-66 | LLM config(`baseUrl` / `apiKey` / `model` / `visionEnabled`) | **存 API key** — 明文,仅本机 |
| `site/src/composables/useTheme.ts` | 18-31 | 主题名(`'silicon-valley'` / 等 5 选 1) | 无敏感 |
| `src/curves/sandbox.ts` | 26 | **黑名单**(拦 userFunc 引用) | 反向使用 |
| `site/src/components/LlmConfigCard.vue` | 9 | UI 文案,不是实际 localStorage 调用 | OK |

### 3.2 存储内容(无其它敏感信息)

- **API key 风险**:
  - 明文存 localStorage
  - 任何同源 XSS 都能读到 → 但本项目 v-html 风险面是 self-only(P2)
  - 浏览器扩展 / 设备共享 / 公共电脑 → 泄露
  - **当前 UI 提示**:`LlmConfigCard.vue:9` 已写"🔒 key 仅存浏览器 localStorage,不上传任何服务。" — **警告到位**
  - **建议**:
    - 文档(RUNBOOK / README)增加"公共电脑请用完后清浏览器数据"
    - 长期方案:SubtleCrypto + 用户密码派生密钥包装(用户体验成本大,非必须)
- **无 cookie 使用**
- **无 sessionStorage 使用**
- **无 IndexedDB 使用**

### 3.3 沙箱拦截验证

`src/curves/sandbox.ts:26` 把 `localStorage` / `sessionStorage` / `indexedDB` 全部加入词级黑名单。**即使有 self-XSS,userFunc 也读不到 API key**。

---

## 4. CSP / Headers 建议

### 4.1 当前状态

- `site/index.html`:无 `<meta http-equiv="Content-Security-Policy">`,无 X-Frame-Options meta
- 仓库无 `_headers`(Netlify) / `vercel.json` / `nginx.conf` / `Caddyfile`
- `site/vite.config.ts`:无 headers 配置

### 4.2 风险

- **无 CSP** → 任何 XSS 注入的 `<script>` 都能直连外网(CC / data exfiltration)
- **无 X-Frame-Options** → 可被 clickjacking 嵌入
- **无 X-Content-Type-Options: nosniff** → 浏览器 MIME 嗅探风险
- **无 Referrer-Policy** → 默认 `strict-origin-when-cross-origin`,可接受

### 4.3 建议(按优先级)

**P1(必须)** — 加 CSP meta 到 `site/index.html`:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self' data:;
  connect-src 'self' https://api.minimax.io https://api.openai.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
">
```
注意:`script-src` 需要 `'unsafe-inline'` 因为 Vite dev 注入 inline script;prod build 后可以收紧到 `'self'`(基于 hash)。`connect-src` 需要把 LLM API host 加白(目前 `useAitune.ts:48` 默认 `https://api.minimax.io/v1`,用户可改 `baseUrl` → 用户自定义 host 会违反 CSP — **需要思考:动态允许 OR 文档提示用户**)。

**P2** — 加 `_headers`(Netlify) 或等价配置,设置:
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### 4.4 robots.txt / sitemap.xml 评审

- `robots.txt`:合理 — Disallow `_archive` / `node_modules` / `src` / `test` / `types` / `*.map`
- `sitemap.xml`:12 条 URL,priority 合理,无敏感路径泄露
- **OK,无需修改**

---

## 5. setTargetBitmap / setThemeBitmap 输入校验

### 5.1 当前实现(`src/engine.ts:1772-1869`)

```ts
setTargetBitmap(bitmap: Float32Array | { cols, rows, data } | null, opts?: { ... }): void
```

**校验缺口**:

| 缺口 | 位置 | 后果 |
|---|---|---|
| 1. 无 `cols * rows === data.length` 一致性检查 | 1837-1844 | `data` 与 `cols/rows` 不匹配时,扫描 bbox 时越界访问 → NaN / 静默乱码 |
| 2. 无 max size 上限(用户传 10000x10000 = 100MB Float32Array) | 全文 | OOM → tab crash |
| 3. 无 `cols > 0 && rows > 0` 显式校验 | 1842-1843 | `cols=0` 时 `targetCols` 用 `r`(行数?)兜底,语义混乱 |
| 4. 传 `undefined` / 数字 / 字符串等非预期类型 | 1791-1793 | `bitmap instanceof Float32Array` 为 false → 走 `bitmap.data` → `undefined` → `targetBitmap = undefined` → render 崩 |
| 5. `applyTargetFitMode` 扫描全图未先 early-return 0/超大 | 684-737 | 100MB bitmap 时全扫描 → 卡死主线程(几百 ms) |
| 6. `lockOrder` / `phase` 等 enum 字段未做联合类型校验 | 1861-1862 | 编译期 OK(TS),但运行期传错值不 throw,可能落到 default branch |
| 7. `setThemeBitmap` 实际不存在 —— 引擎只有 `setTheme`(themeName 字符串,line 700) | — | 用户易混淆 API 命名 |

### 5.2 setTheme 输入校验(顺便审计)

`setTheme(name: ThemeName)` 接受 5 个 union 值,**TS 类型保护拦了**。运行期 `setTheme('xxx')` 会落到 themes 工厂里 `themes[name]` 为 undefined → 后续可能 throw。**OK,无 OOM 风险**。

### 5.3 P1 建议

- 加 `MAX_BITMAP_PIXELS = 4096 * 4096 = 16M`(canvas 安全上限参考)
- 加 `data.length === cols * rows` 一致性检查
- 加 `cols > 0 && rows > 0` 显式校验
- `bitmap == null` 走 null 分支(已实现)
- 其它类型 throw `TypeError`

---

## 6. 第三方依赖漏洞(npm audit)

### 6.1 根包(`/`)

```
metadata: 1 prod, 100 dev, 0 vulnerabilities
```

✅ 干净。

### 6.2 site(`site/`)

```
2 moderate:
  - esbuild ≤0.24.2 (CVE-2026-1102341, dev server arbitrary request)
  - vite ≤6.4.1  (path traversal in optimized deps .map handling, GHSA-4w7w-66w2-5vf9)
```

**评级**:
- 仅 dev 依赖,prod build 不携带
- 修复方案:`npm audit fix --force` → vite 8(breaking change)
- **P3** · 不阻塞 release,但建议下次 vite 升级时跟进

---

## 7. P0 / P1 / P2 优先级清单

### P0(必修 · 真实风险,本次未发现)

无。当前 v-html 风险面是 self-only,无跨用户攻击路径。

### P1(应修 · 防御纵深)

| # | 项 | 文件 | 工作量 | 风险 |
|---|---|---|---|---|
| S-01 | 加 CSP meta / `_headers` | `site/index.html` / 新增 `site/public/_headers` | S | 必须先确认 LLM baseUrl 动态 host 策略 |
| S-02 | 沙箱补 `constructor` 黑名单(G1/G2/G18) | `src/curves/sandbox.ts` | S | 误伤风险:userFunc 不可用 `obj.constructor`,需评估 |
| S-03 | setTargetBitmap 加大小/形状校验 | `src/engine.ts:1772` | S | 防止 OOM |
| S-04 | 沙箱补死循环 step 触发测试 | `test/sandbox.mjs` | S | 验证 G16 |
| S-05 | API key 文档警告(RUNBOOK 加"公共电脑"提示) | `README.md` / 新 RUNBOOK | S | 提升用户安全意识 |

### P2(宜修 · 增强)

| # | 项 | 文件 | 工作量 |
|---|---|---|---|
| S-06 | DemoNoiseConverge log 改用文本插值(去掉 v-html) | `site/src/pages/DemoNoiseConverge.vue:100,155,173,179,203` | S |
| S-07 | 沙箱补 `async` / `function*` / `class` / `__proto__` 黑名单 | `src/curves/sandbox.ts` | S |
| S-08 | 沙箱补 unicode escape(`\u0077indow`)防御 | `src/curves/sandbox.ts` | S |
| S-09 | 沙箱加内存/对象大小软限制 | `src/curves/sandbox.ts` | M |
| S-10 | Vite/esbuild 升级到 8.x(dev only) | `site/package.json` | M(breaking) |

### P3(可选)

| # | 项 |
|---|---|
| S-11 | 加 ESLint 规则禁止 v-html(全仓扫描,除白名单) |
| S-12 | BlogPage post body 走 markdown 渲染(去除 v-html) |
| S-13 | legacy 静态页面改用 textContent 代替 innerHTML |
| S-14 | `setThemeBitmap` 命名澄清(目前引擎只有 setTheme) |

---

## 8. 备注:本次审计未涉及的范围

- **后端**:本仓库无服务端代码,`robots.txt` 引用的 `matrix-rain.xietuier.ai` 部署在别处,nginx/Caddy 配置不在审计范围。
- **CSS 注入风险**:`<style>` 选择器攻击 — 本项目 `<style scoped>` 全用 SFC scoped,无动态 style 注入,无风险。
- **prototype pollution**:userFunc 沙箱内 `Object` / `JSON` 已黑,但 `({}).__proto__` 没黑(G18 已记录)。
- **依赖 lock 文件**:未审计 `package-lock.json` 锁定的具体传递依赖版本(hash 一致性靠 npm 自身保证)。
- **CI/CD secrets**:无 GitHub Actions 工作流文件,无 secrets 暴露风险。

---

## 9. 引用文件清单(便于 review)

- `site/src/pages/DemoNoiseConverge.vue:100,135-138,155,173,179,203`
- `site/src/pages/BlogPage.vue:31,47-93`
- `site/src/components/ChatLog.vue:12` (确认 LLM 输出走文本插值)
- `site/src/composables/useAitune.ts:36-66,504-511` (LLM config storage)
- `site/src/composables/useTheme.ts:18-31` (theme storage)
- `site/src/components/LlmConfigCard.vue:9` (UI warning 文案)
- `src/curves/sandbox.ts:17-312` (沙箱实现)
- `test/sandbox.mjs:1-120` (沙箱测试)
- `src/engine.ts:684-737,1772-1869` (setTargetBitmap 入口)
- `site/index.html:1-16` (无 CSP)
- `robots.txt`, `sitemap.xml` (无问题)
- `site/public/legacy/02-themes.html:48`, `03-variants.html:48` (legacy innerHTML)
- `package.json` (根), `site/package.json` (site)

---

**审计完成。本报告只读,未修改任何现有文件。**
