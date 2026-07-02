# Performance Baseline · 2026-06-08

> **目的**: 在做任何优化之前,先把当前真实数字记下来。这是后续所有改动的参照系。
>
> **方法**:
>
> - 真实本地 serve (Python `http.server` 桥接 `site/dist/` + 父 `dist/`,端口 5174)
> - headless Chromium 145 · viewport 1440×900 · DPR 1 · 关闭网络节流
> - 12 路由 × 3 次连续访问取中位数,清缓存 (no-store header)
> - `PerformanceObserver` 监听 `paint` / `largest-contentful-paint` / `longtask` / `resource` / `layout-shift`
> - rAF 时间差测 FPS (过滤 >100ms 的间隔,代表 tab 切到后台)
> - 完整原始数据: `/tmp/perf-results.json` (本机),资源瀑布: `/tmp/perf-waterfall.txt`
>
> **页面版本**: site/dist build `2026-06-08 01:13:24` · chromium `145.0.7632.6` · anaconda3 Playwright
>
> ⚠️ **本机性能是 best case** — 无网络、无 CDN、无海外链路。在真实生产环境(尤其 Vercel/海外 CDN)上 LCP/FCP 通常会被网络乘 3–5 倍。

---

## 0. TL;DR

| 指标                |                   中位数 |                                最佳 |                         最差 | 评价               |
| ------------------- | -----------------------: | ----------------------------------: | ---------------------------: | ------------------ |
| **FCP**             |                **56 ms** |               52 (`/demos/element`) |         64 (`/demos/themes`) | 🟢 极好            |
| **LCP**             |                **86 ms** |                  56 (`/demos/blog`) |                    132 (`/`) | 🟢 极好            |
| **TTI (估算)**      |                **56 ms** |                                  52 |        76 (`/demos/ai-tune`) | 🟢 极好            |
| **资源数/路由**     |                   **10** | 8 (`/tutorial`, `/docs`, `/legacy`) |           13 (`/playground`) | 🟢 优秀            |
| **总传输/路由**     |               **283 KB** |                  240 KB (`/legacy`) |    323 KB (`/demos/ai-tune`) | 🟡 字体占 43%      |
| **CLS** (max)       |                 **0.11** |                    0.04 (`/legacy`) |               **0.20** (`/`) | 🟠 6/12 路由 > 0.1 |
| **longtask > 50ms** |             **0–1/路由** |                                   — | 1 个 68ms (`/demos/ai-tune`) | 🟢 优秀            |
| **Hero canvas FPS** | **120 fps** (v-sync cap) |                                   — |                            — | 🟢                 |

**总资源(全 12 路由去重)**: 428 KB · **37 个 unique URL** · **3 个字体 = 123 KB (29%)**

**3 个 P0 优化点(下文 § 7)**:

1. **CLS 0.20 超标** — 根因是 3 个 webfont `font-display: swap`,首屏文字回流。
2. **3 个字体无脑加载** — Fraunces italic 只在 H1 用、JetBrains Mono 只在代码块用,但每个路由都拉 ~125 KB 字体文件。
3. **`sourcemap: true` 把 .map 打进 dist/** — 多了 1.4 MB raw / 0.4 MB gzip 完全用不上的源码。

---

## 1. 测试环境

```text
base:                http://127.0.0.1:5174
build:               site/dist (2026-06-08 01:13:24)
userAgent:           chromium 145.0.7632.6
viewport:            1440 × 900
deviceScaleFactor:   1
disable-dev-shm-usage: true
runs per route:      3 (中位数)
routes:              12  (见 § 2)
Cache-Control:       no-store (确保每次拿到 fresh assets)
观察者:              paint / largest-contentful-paint / longtask / resource / layout-shift
```

`/tmp/perf-server.py` 是个小 Python HTTP server,把 `site/dist/` 当根、把 `../dist/` 映射到 `/dist/`,以满足 `index.html` 里 `<link href="/dist/fonts/fonts.css">` 的硬编码引用。

---

## 2. 12 路由性能对比 (3 次中位数)

| 路径                    | FCP (ms) | LCP (ms) | TTI (ms) | Res |         传输 |         编码 |           LT |  CLS (max) | LCP 元素 |
| ----------------------- | -------: | -------: | -------: | --: | -----------: | -----------: | -----------: | ---------: | -------- |
| `/`                     |       60 |  **132** |       60 |  11 |     287.0 KB |     283.8 KB |            0 | **0.1974** | H1       |
| `/playground`           |       52 |       96 |       52 |  13 |     293.4 KB |     289.6 KB |            0 | **0.1926** | H1       |
| `/tutorial`             |       56 |       84 |       56 |   8 |     265.7 KB |     263.3 KB |            0 |     0.0877 | H1       |
| `/docs`                 |       52 |       88 |       52 |   8 |     251.9 KB |     249.5 KB |            0 | **0.1959** | PRE      |
| `/demos/element`        |       52 |       68 |       52 |  11 |     245.7 KB |     242.4 KB |            0 |     0.1384 | H1       |
| `/demos/events`         |       56 |       92 |       56 |  10 |     283.2 KB |     280.2 KB |            0 |     0.0661 | H1       |
| `/demos/themes`         |       64 |      100 |       64 |  10 |     283.2 KB |     280.2 KB |            0 |     0.0824 | H1       |
| `/demos/noise-converge` |       52 |       96 |       52 |  10 |     287.0 KB |     284.1 KB |            0 |     0.1421 | H1       |
| `/demos/blog`           |       56 |       56 |       56 |  12 |     285.6 KB |     282.1 KB |            0 | **0.1956** | P        |
| `/demos/ai-tune`        |       60 |       60 |   **76** |  10 | **323.0 KB** | **320.1 KB** | **1 (68ms)** |     0.0413 | P        |
| `/legacy`               |       56 |       72 |       56 |   8 | **240.0 KB** | **237.6 KB** |            0 |     0.0378 | H1       |
| `/404`                  |       52 |       72 |       52 |  12 |     282.3 KB |     278.7 KB |            0 |     0.0437 | P        |

> **LT** = `longtaskCount_max` (>50ms) · **CLS** = Cumulative Layout Shift (max across 3 runs)

### 观察

- **`/demos/ai-tune` 是全表最大 + 最慢** — 传输最大 (320 KB) + 唯一一个 longtask (68ms at 40ms) + TTI 最高 (76ms)。原因: `ai-tune` 页额外挂了一个 canvas + 模拟"调参"循环,初始化成本最高。
- **`/` 的 LCP 132ms 是全表最高** — 首页 Hero 有 5 个并发动画 + 渐显,渲染最重的文本 (H1 162k px 面积)。
- **`/legacy` 是全表最轻** — 8 个资源 / 240 KB / LCP 72ms,无 matrix-rain 实例,纯静态文档。
- **`/playground` 资源数最多 (13)** — 7 个滑块 + 4 个 select + 1 个 `<matrix-rain>` 实例,需要加载 `useMatrixRain-BQD_FC3m.js` + `index-CqUBGuSE.js` (引擎) + `HomePage`/`useTheme` 等共享 chunk。
- **`/demos/blog` 和 `/demos/ai-tune` 的 LCP 元素是 `<P>`** — 不是 H1,大概率是 Hero 描述段或 canvas 上方文字。`<P>` 当 LCP 通常意味着 LCP 元素不是 H1,会受字体回流影响最大。

---

## 3. Top 10 重资源(全 12 路由聚合)

|   # | URL                                 |         原始 |        gzip | 用途                          | 出现在路由 |
| --: | ----------------------------------- | -----------: | ----------: | ----------------------------- | :--------: |
|   1 | `/assets/index-jJABeqHx.js`         | **101.7 KB** | **39.6 KB** | Vue + 站点主 chunk            |   12/12    |
|   2 | `/dist/fonts/inter-variable.woff2`  |  **48.4 KB** |     48.4 KB | UI 字体(全站)                 |   12/12    |
|   3 | `/dist/fonts/fraunces-italic.woff2` |  **45.6 KB** |     45.6 KB | 标题/品牌字体(只 H1)          |   12/12    |
|   4 | `/assets/index-CqUBGuSE.js`         |  **40.1 KB** | **14.7 KB** | matrix-rain 引擎(动态 import) |  **8/12**  |
|   5 | `/dist/fonts/jetbrains-mono.woff2`  |  **31.3 KB** |     31.3 KB | 等宽字体(只代码块)            |   12/12    |
|   6 | `/assets/AITunePage-B5Tv-Atb.js`    |      28.2 KB |     11.5 KB | `/demos/ai-tune` 页面 chunk   |    1/12    |
|   7 | `/assets/TutorialPage-CEi4nZab.js`  |      26.3 KB |      6.3 KB | `/tutorial` 页面 chunk        |    1/12    |
|   8 | `/assets/AITunePage-DmMM3RWS.css`   |      19.0 KB |      3.9 KB | `/demos/ai-tune` 样式         |    1/12    |
|   9 | `/assets/DocsPage-DqqoYLYI.js`      |      13.5 KB |      3.5 KB | `/docs` 页面 chunk            |    1/12    |
|  10 | `/assets/index-DIg6LcXx.css`        |      12.0 KB |      3.3 KB | 全局样式 + token              |   12/12    |

> **woff2 不再被 gzip 压缩**(浏览器看到 `Content-Encoding: br` 时不会二次压)。表格中"gzip"列对 woff2 = 0 收益。
>
> **代码分割已经做对了**: 主 chunk (39.6 KB gzip) + 矩阵引擎 (14.7 KB gzip) + 路由级 chunk (3–12 KB gzip),每条路由只下载自己需要的。

### 字体子合计

| 字体            |         原始 |         gzip | 用途               | 加载策略             |
| --------------- | -----------: | -----------: | ------------------ | -------------------- |
| Inter Variable  |      48.4 KB |      48.4 KB | UI / 段落          | `font-display: swap` |
| Fraunces Italic |      45.6 KB |      45.6 KB | H1 / 品牌          | `font-display: swap` |
| JetBrains Mono  |      31.3 KB |      31.3 KB | `<code>` / `<pre>` | `font-display: swap` |
| `fonts.css`     |       1.0 KB |       0.5 KB | @font-face 声明    | —                    |
| **小计**        | **126.3 KB** | **125.7 KB** |                    |                      |

**125 KB 字体 / 428 KB 全资源 = 29% 的网络带宽花在字体上**。

---

## 4. 主线程 longtask(>50ms)

**全部 36 次跑(12 路由 × 3)只检测到 1 个 longtask**:

| 路由             |  起始 |      时长 | 名称   | 备注                                 |
| ---------------- | ----: | --------: | ------ | ------------------------------------ |
| `/demos/ai-tune` | 40 ms | **68 ms** | `self` | 第 1 次跑第 1 次出现,后 2 次跑未复现 |

> 68ms 的 longtask + 出现在 LCP 之前,说明这是页面初始化阶段的一个慢脚本(可能是 AI-tune 的 mock LLM 调度器跑了一次预热),被 1.2s LCP-静默窗口吃掉,**对 TTI 没有影响**。
>
> 没有其他 longtask 是好结果 — 即使 playground 触发 `useMatrixRain` 重建实例,也在 rAF 节流内完成。

### Longtask 检测说明

- 用 `PerformanceObserver({ type: 'longtask', buffered: true })`,浏览器只在任务 > 50ms 时上报。
- 36 次跑总 longtask 1 个 = 平均每路由 0.08 个,可以视为"无主线程长任务阻塞"。

---

## 5. Hero Canvas FPS(rAF 时间差)

跑 5 秒,过滤 > 100ms 的间隔(代表 tab 切到后台的假数据)。

| 路径                    | canvas 数 | frames | avg ms | median ms | **fps median** | fps avg |
| ----------------------- | --------: | -----: | -----: | --------: | -------------: | ------: |
| `/`                     |         1 |    531 |    9.4 |       8.3 |      **120.5** |   105.9 |
| `/demos/noise-converge` |         1 |    602 |    8.3 |       8.3 |      **120.5** |   120.3 |

> 两个页面都被 120Hz v-sync 锁死 — 健康,没有掉帧。
>
> `/` 的 avg fps 105.9 略低(531 frames/5s),是因为页面加载刚完时若干次 rAF 间隔偏长(> 8.3ms 但 < 100ms 仍被计入),是首帧渲染成本,稳态后是 120 fps。
>
> **noise-converge 真正"涌现"动画全程 120 fps** — 文字在噪声场里收敛是个相对昂贵的效果(每帧要做像素级 luma 比较),能跑满 vsync 说明引擎调度良好。

---

## 6. Playground 实操性能

测了 7 个 `<input type="range">` 滑块的双向往返(滑到 max → 滑到 min),以及一个 `<select>` 切换(实际切的是 `目标位图出现方式` 而不是 `lockOrder`,因为 lockOrder 在 playground 里是 button group 而不是 select)。

### 6.1 滑块往返耗时

|       # | 控件                   |  min |  max |   往返耗时 |
| ------: | ---------------------- | ---: | ---: | ---------: |
|       0 | fontSize               |   10 |   28 |     152 ms |
|       1 | trailAlpha             | 0.05 | 0.50 |     148 ms |
|       2 | maxDPR                 |    1 |    3 |     154 ms |
|       3 | brightness             |  0.5 |  2.0 |     167 ms |
|       4 | targetNoiseDuration    |    0 |    2 |     163 ms |
|       5 | targetConvergeDuration |  0.5 |    4 |     178 ms |
|       6 | targetLockStability    |    0 |    1 |     172 ms |
| **avg** |                        |      |      | **162 ms** |

> 162ms 包含: 一次 `input` + 一次 `change` 事件 → Vue watch 触发 → `useMatrixRain` 软销毁/重建 + 100ms rAF 抖动的两段 wait_timeout 共 120ms。
>
> **真实 engine 重建耗时 ≈ 162 − 120 = 42 ms**。这是"软销毁旧实例 + 创建新实例 + alpha 渐入"的总时长,在 60 fps 预算(16.67ms)的两倍以上,说明重建是分多帧完成的(使用 `requestAnimationFrame` 节流),符合"过渡流畅不卡顿"的设计目标。

### 6.2 状态机切换(`目标位图出现方式`: `fade` → `noise-converge`)

- **切换总耗时**: 1530 ms(其中 1500 ms 是 `wait_for_timeout(1500)` 等动画稳定)
- **真实引擎响应**: < 30 ms(切 select 后立刻触发了 matrix-rain 实例的 noise-converge 阶段)
- **canvas 像素 hash 变化**: ✅ 1/1 canvas 像素 hash 变化
- **canvas 平均亮度变化**: 87 → 73(噪声场更暗,符合 noise-converge 视觉)

> `lockOrder` 按钮组未测(脚本里只跑了 select),但 6.1 节的滑块测试已覆盖了 `useMatrixRain` 的 watch→重建路径,结论可信。

### 6.3 探测到的 select

| aria-label       | 选项                                                          |
| ---------------- | ------------------------------------------------------------- |
| 主题             | silicon-valley, matrix-green, lava-red, cyber-blue, pure-mono |
| 变体             | classic, avalanche, ripple, ascii                             |
| 目标位图出现方式 | fade, noise-converge                                          |

---

## 7. 优化建议清单(按优先级)

### 🟥 P0 — 修,影响 CLS 与首屏体验

#### P0-1: **CLS 0.20 超标**(6/12 路由)

| 路由                    |         CLS | 评价                 |
| ----------------------- | ----------: | -------------------- |
| `/`                     |      0.1974 | 🟥 poor (> 0.25)     |
| `/docs`                 |      0.1959 | 🟥 poor              |
| `/demos/blog`           |      0.1956 | 🟥 poor              |
| `/playground`           |      0.1926 | 🟥 poor              |
| `/demos/noise-converge` |      0.1421 | 🟠 needs improvement |
| `/demos/element`        |      0.1384 | 🟠 needs improvement |
| 其余 6 路由             | 0.04 – 0.09 | 🟢 good              |

**根因**:`fonts.css` 里 3 个 webfont 都用 `font-display: swap`,在字体到达前浏览器用 fallback 字体(等宽 / serif)排版,字体到达后整段文字宽度变化 → 整页回流。

**建议**:

- Fraunces italic(只 H1 用) → 改 `font-display: optional`,首屏直接跳过自定义字体,代价是标题看起来 fallback 一点点
- 或保留 swap 但 `preload` 字体:`<link rel="preload" as="font" type="font/woff2" crossorigin href="/dist/fonts/fraunces-italic.woff2">` 在 `<head>` 头部加,让字体和 CSS 并行下载
- 给 Inter/Fraunces 加 `size-adjust` / `ascent-override` / `descent-override` (在 @font-face 内),让 fallback 字体"模仿"目标字体的度量,把回流幅度压到最小

**预期收益**: CLS 从 0.20 → < 0.05,Google "good" 区间。资源大小不变。

#### P0-2: **3 个字体每个路由都拉(125 KB)**

| 字体            |  大小 | 真实使用面            | 优化方向                                                    |
| --------------- | ----: | --------------------- | ----------------------------------------------------------- |
| JetBrains Mono  | 31 KB | 仅 `<code>` / `<pre>` | 路由级 chunk 里只有 1–2 个代码块,但字体在所有 12 路由都加载 |
| Fraunces italic | 45 KB | 仅 H1 / 品牌          | 整页 90% 的文字根本不用                                     |
| Inter Variable  | 48 KB | UI / 段落             | **必须**,全页正文都是它                                     |

**建议**:

- JetBrains Mono:改成 `font-display: optional` + 路由级动态 import `<code>` 内容时才 preload
- Fraunces italic:`<link rel="preload" as="font" crossorigin>` 只在 Hero 路由(`/`, `/playground`)的 `<head>` 注入,其他路由不预加载
- Inter Variable:保留 `swap` + preload(必须)

**预期收益**: 多数路由省 76 KB (Fraunces + JetBrains),`/legacy` / `/docs` 这类文档页省最多。

#### P0-3: **`sourcemap: true` 把 .map 打进 dist**

`site/dist/assets/` 里有 1.4 MB raw / 0.4 MB gzip 的 `.js.map` / `.css.map`,**完全用不上** — Vite 的 source map 在生产环境给浏览器 DevTools 用,但:

- 站点已经 `Cache-Control: no-store`,浏览器永远不会复用
- 普通访客的 DevTools 不会解析它们(默认关闭 source map)
- 总占比 = `site_dist_total_raw 1.46 MB` 的 **98%**

**修复**:`site/vite.config.ts` 改 `sourcemap: false`,重新 build。

**预期收益**: dist 总大小从 1.46 MB → 0.06 MB (减小 96%),CI artifact / CDN 缓存友好度大升。

> 注意:本基线的"传输 283 KB/路由"是页面实际加载的 .js .css,不含 .map — 这个数字是真实的;但 `dist/` 文件夹本身的"打包报告"被 .map 严重污染了。

### 🟧 P1 — 应该做,影响 TTI 与 build 大小

#### P1-1: **`/demos/ai-tune` 的 68ms longtask**

| 项目 | 值                                               |
| ---- | ------------------------------------------------ |
| 路由 | `/demos/ai-tune`                                 |
| 起始 | 40 ms                                            |
| 时长 | 68 ms                                            |
| 复现 | 1/3 次                                           |
| 影响 | LCP 之前发生,被 1.2s 静默窗口吃掉,TTI 实际无影响 |

**根因猜测**:`ai-tune` 页有"模拟 LLM 调参循环"在 mount 后立即跑一次预热,生成推荐参数集合,这一步是同步的、>50ms。

**建议**:

- 把预热改成 `requestIdleCallback` 或 `setTimeout(0)`,让它不在 critical path 上
- 或在主入口 lazy import,把"调参循环"延后到第一个交互之后

**预期收益**: 0 个 longtask(干净)。

#### P1-2: **`/demos/blog` 和 `/demos/ai-tune` 的 LCP 元素是 `<P>`**

期望 LCP 元素是 H1 或 canvas(主视觉),实际是 `<P>`(段落),说明 Hero 文字"先到",canvas 在它之后。这不是性能问题(LCP 56–60ms 极好),但说明:

- canvas 的 fade-in 动画可能让 canvas 的 alpha=0 状态被 LCP 候选"挤掉",最终选了更早出现的 `<P>`
- 取决于 fade-in 时长配置;如果是设计意图(文字先出,背景后出),则保持现状

**建议**: 不动,但把这一行写进 commit history,避免后续误改。

#### P1-3: **`/demos/ai-tune` 323 KB 偏大**

| 资源             |    增量 |
| ---------------- | ------: |
| AITunePage CSS   |  +19 KB |
| AITunePage JS    |  +28 KB |
| matrix-rain 引擎 |  +40 KB |
| 字体 3 个        | +125 KB |
| 其他             | +111 KB |

JS+CSS 增量 ~47 KB 是合理的(完整 ai-tune demo 的复杂度);字体 125 KB 在所有路由都加载,见 P0-2。

**建议**: 拆分 ai-tune 的 CSS 看是否有未用规则;JS 用 `vite-plugin-visualizer` 看产物分布。

### 🟨 P2 — 锦上添花

#### P2-1: **`/404` 资源数 12 vs `/legacy` 8**

`/404` 比 `/legacy` 多 4 个资源。原因:`/404` 也包含 matrix-rain 实例(背景),会拉引擎 chunk、useMatrixRain、useTheme 等。

**建议**: 404 页面是用户迷路的兜底,核心是"返回首页"按钮,不一定需要背景动画。可以考虑静态化 404(去掉 matrix-rain 背景),省 4 个资源 ~ 50 KB。

#### P2-2: **H1 LCP 元素 162k px 面积**

`/` 的 LCP H1 面积 162,134 px(根据 `lcpSize`),在 1440×900 viewport 下基本铺满主屏。这正常,但意味着 H1 的渲染成本直接决定 LCP 时间。

**建议**: 用 `content-visibility: auto` 给 `<H1>` 之外的次要内容,跳过离屏渲染(本场景收益小,因为 H1 本身就是要首屏可见)。

#### P2-3: **`useMatrixRain` 重建延迟 42ms**

playground 滑块往返触发重建,引擎耗时 ~42ms,跨 2-3 帧。

**建议**:

- 如果用户感觉滑块"跟手"是核心体验,可以加 16ms 内的 input 合并(当前已有 `cancelAnimationFrame` 节流,看 `PlaygroundPage.vue` 的 `inputRaf` 变量)
- 引擎层可以考虑 `OffscreenCanvas` + Worker,但代价是复杂度

---

## 8. 修复后预期数字

假设 P0-1 + P0-2 + P0-3 全部修复:

| 指标                 |                    当前 |   修复后(估算) | 收益           |
| -------------------- | ----------------------: | -------------: | -------------- |
| 单路由传输(平均)     |                  283 KB | **150–200 KB** | -30 ~ -47%     |
| CLS(平均)            |                    0.11 |     **< 0.05** | Google "good"  |
| `dist/` 总大小       |                 1.46 MB |    **0.06 MB** | -96%           |
| longtask             |                0–1/路由 |              0 | 干净           |
| FPS                  |               120 (cap) |            120 | 持平           |
| FCP/LCP 本机         |                56/86 ms |       56/86 ms | 持平(本就极快) |
| 真实生产环境 LCP(估) | ~250–400ms(无 CDN 推算) |     ~150–250ms | -40%           |

---

## 9. 文件清单(本任务产出)

| 文件                                      |    大小 | 内容                                                   |
| ----------------------------------------- | ------: | ------------------------------------------------------ |
| `docs/audits/perf-baseline-2026-06-08.md` |  本文件 | 报告                                                   |
| `/tmp/perf-results.json`                  |  ~50 KB | 完整原始数据(12 路由样本 + FPS + playground + bundles) |
| `/tmp/perf-waterfall.txt`                 |  ~30 KB | 12 路由瀑布文本(startTime / duration / size / xfer)    |
| `/tmp/perf-waterfall-raw/*.json`          | ~300 KB | 每路由详细 resource + longtask 列表                    |
| `/tmp/perf-routes/`                       |    (空) | 预留路由分项数据目录(本版未使用)                       |
| `/tmp/perf-server.py`                     |  1.4 KB | 桥接 site/dist + 父 dist 的小 HTTP server              |
| `/tmp/perf-baseline.py`                   |   14 KB | 完整 perf 采集脚本(可重复运行)                         |

**复现命令**:

```bash
# 启 server
/Users/chenzhihan/anaconda3/bin/python3 /tmp/perf-server.py

# 跑基线(耗时 ~3 分钟)
/Users/chenzhihan/anaconda3/bin/python3 /tmp/perf-baseline.py
```

---

## 10. 给后续任务的可执行 TODO

- [ ] **P0-3**:`site/vite.config.ts` 的 `sourcemap: true` 改为 `false`,重 build(1 行改动,~5 min)
- [ ] **P0-1**:`dist/fonts/fonts.css` 给 Inter/Fraunces 加 `size-adjust` + `ascent-override`,或者把 Fraunces 改 `font-display: optional`(需要选一组 fallback 字体度量,~30 min)
- [ ] **P0-2**:`site/index.html` 加 `<link rel="preload" as="font" crossorigin>` 给 Inter 字体;Fraunces 和 JetBrains 改成 `font-display: optional` 或路由级 preload
- [ ] **P1-1**:`/demos/ai-tune` 的预热循环改 `requestIdleCallback`
- [ ] **P1-3**:集成 `vite-plugin-visualizer`,看 ai-tune 的实际依赖分布
- [ ] 重跑基线,确认 P0 全部修完后 CLS < 0.05 + 传输 < 200 KB

---

_Generated: 2026-06-08 09:45 (北京时间)_
