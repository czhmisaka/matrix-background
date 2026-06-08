<template>
  <div class="tutorial">
    <div class="container">
      <header class="page-header">
        <span class="tag">Tutorial</span>
        <h1>从 0 到生产环境</h1>
        <p class="lead">
          12 个章节覆盖安装、5 分钟上手、5 主题 × 4 变体预览、3 框架集成 (React / Vue /
          Next.js)、CDN 兜底、API 完整参考、内置 Playground。
        </p>
      </header>

      <div class="tabs" role="tablist" aria-label="Tutorial 章节" @keydown="onTabKeydown">
        <button
          v-for="(t, idx) in tabs"
          :key="t.id"
          :ref="(el) => setTabRef(el, idx)"
          :id="`tab-${t.id}`"
          :class="['tab', { active: active === t.id }]"
          role="tab"
          type="button"
          :aria-selected="active === t.id"
          :aria-controls="`panel-${t.id}`"
          :tabindex="active === t.id ? 0 : -1"
          @click="selectTab(t.id)"
        >
          {{ t.label }}
        </button>
      </div>

      <section
        class="tab-content"
        role="tabpanel"
        :id="`panel-${active}`"
        :aria-labelledby="`tab-${active}`"
        tabindex="0"
      >
        <!-- 0 · Intro -->
        <article v-if="active === 'intro'">
          <h2>数字矩阵背景<br /><em class="grad">终端感 × 温度感</em></h2>
          <p>
            Matrix 风格的数字雨看上去浪漫,实现起来却满是工程权衡。@xietuier/matrix-rain 把 5 主题 4
            变体的 Canvas 2D 渲染打包成一个零依赖的小库 — 29 KB gzip,5 行代码即可启动。
          </p>
          <h3>核心特性</h3>
          <ul>
            <li>
              <b>5 主题预设</b> — 硅谷冷 / 矩阵绿 / 熔岩红 / 赛博蓝 / 纯单色,每个都可冷暖双板拼色
            </li>
            <li><b>4 变体形态</b> — classic / avalanche / ripple / ascii,字符运动模式各不同</li>
            <li>
              <b>Web Component</b> — <code>&lt;matrix-rain&gt;</code> 标签即可挂载,Vue/React
              都能识别
            </li>
            <li><b>噪声 → 收敛</b> — 5 段状态机,文字从全屏噪点逐 cell 锁定为清晰图像</li>
            <li><b>事件驱动</b> — onFrame / onResize / onThemeChange / onTargetFinish</li>
            <li><b>SSR 友好</b> — 核心逻辑零 DOM 依赖,Node/Edge/Worker 中可安全 import</li>
          </ul>
          <h3>为什么是 Canvas 2D</h3>
          <p>
            DOM 节点是浏览器最擅长的渲染单元,但当屏幕上要出现几百个独立运动的小元素时,DOM
            会成为瓶颈。Canvas 2D 的方案简单得多:把所有字符当成像素画在同一个画布上,CPU
            端只算逻辑态(位置、亮度、字符),GPU 端只刷一层 texture,几乎零 layout 开销。
          </p>
        </article>

        <!-- 1 · Install -->
        <article v-else-if="active === 'install'">
          <h2>3 种<em class="grad">安装</em>方式</h2>
          <h3>① npm</h3>
          <pre><code><span class="tk-kw">$</span> npm install @xietuier/matrix-rain</code></pre>
          <h3>② pnpm</h3>
          <pre><code><span class="tk-kw">$</span> pnpm add @xietuier/matrix-rain
<span class="tk-kw">$</span> yarn add @xietuier/matrix-rain</code></pre>
          <h3>③ CDN (UMD)</h3>
          <p>不想要打包步骤?UMD 兜底,直接 <code>&lt;script&gt;</code> 引入:</p>
          <pre><code><span class="tk-tag">&lt;link</span> <span class="tk-attr">rel</span>=<span class="tk-st">"stylesheet"</span> <span class="tk-attr">href</span>=<span class="tk-st">"https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain/dist/matrix-rain.css"</span><span class="tk-tag">&gt;</span>
<span class="tk-tag">&lt;script</span> <span class="tk-attr">src</span>=<span class="tk-st">"https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain/dist/index.umd.js"</span><span class="tk-tag">&gt;&lt;/script&gt;</span>
<span class="tk-tag">&lt;script&gt;</span>
  <span class="tk-kw">const</span> rain = MatrixRain.matrixRain({ canvas: document.querySelector(<span class="tk-st">'canvas'</span>) });
<span class="tk-tag">&lt;/script&gt;</span></code></pre>
        </article>

        <!-- 2 · Quickstart -->
        <article v-else-if="active === 'quickstart'">
          <h2>一行代码<em class="grad">起手</em></h2>
          <p>最简版 — 5 行代码一个会呼吸的背景:</p>
          <pre><code><span class="tk-kw">import</span> { <span class="tk-fn">matrixRain</span> } <span class="tk-kw">from</span> <span class="tk-st">'@xietuier/matrix-rain'</span>;
<span class="tk-kw">import</span> <span class="tk-st">'@xietuier/matrix-rain/style.css'</span>;

<span class="tk-kw">const</span> canvas = document.<span class="tk-fn">querySelector</span>(<span class="tk-st">'canvas'</span>);
<span class="tk-kw">const</span> rain = <span class="tk-fn">matrixRain</span>({ canvas, theme: <span class="tk-st">'silicon-valley'</span> });</code></pre>

          <h3>让它呼吸 — 涌现动画</h3>
          <pre><code><span class="tk-kw">import</span> { <span class="tk-fn">matrixRain</span>, <span class="tk-fn">textToBitmap</span> } <span class="tk-kw">from</span> <span class="tk-st">'@xietuier/matrix-rain'</span>;

<span class="tk-kw">const</span> rain = <span class="tk-fn">matrixRain</span>({
  canvas,
  theme: <span class="tk-st">'silicon-valley'</span>,
  targetPhase: <span class="tk-st">'noise-converge'</span>,
  targetNoiseDuration: <span class="tk-num">0.5</span>,
  targetConvergeDuration: <span class="tk-num">1.5</span>,
  targetLockOrder: <span class="tk-st">'center'</span>
});

<span class="tk-kw">const</span> bitmap = <span class="tk-fn">textToBitmap</span>(<span class="tk-st">'HELLO'</span>, <span class="tk-num">40</span>, <span class="tk-num">20</span>);
rain.<span class="tk-fn">setTargetBitmap</span>(bitmap, { phase: <span class="tk-st">'noise-converge'</span> });</code></pre>
        </article>

        <!-- 3 · Themes -->
        <article v-else-if="active === 'themes'">
          <h2>5 套<em class="grad">主题</em>预设</h2>
          <p>
            每个主题都是独立的 HSL 调色板,带 <code>brightness</code> / <code>chroma</code> /
            <code>hueShift</code> / <code>contrast</code> 等参数。
          </p>
          <div class="theme-grid">
            <div
              v-for="t in themeList"
              :key="t.name"
              class="theme-card"
              :style="{ '--swatch': t.swatch }"
            >
              <span class="theme-dot"></span>
              <strong>{{ t.name }}</strong>
              <span class="theme-id">{{ t.id }}</span>
              <p>{{ t.desc }}</p>
            </div>
          </div>

          <h3>冷暖双板拼色</h3>
          <pre><code><span class="tk-fn">matrixRain</span>({
  canvas,
  theme: { coldFrom: <span class="tk-st">'cyber-blue'</span>, warmFrom: <span class="tk-st">'lava-red'</span> }
});</code></pre>
        </article>

        <!-- 4 · Variants -->
        <article v-else-if="active === 'variants'">
          <h2>4 种<em class="grad">变体</em>形态</h2>
          <p>变体决定字符运动模式。每个变体都有独立的 phase / sin / bright 参数可调。</p>
          <div class="variant-grid">
            <div v-for="v in variantList" :key="v.id" class="variant-card">
              <h3>{{ v.name }}</h3>
              <code>variant: "{{ v.id }}"</code>
              <p>{{ v.desc }}</p>
            </div>
          </div>
        </article>

        <!-- 5 · React -->
        <article v-else-if="active === 'react'">
          <h2>React <em class="grad">组件</em></h2>
          <p>最直接的方式 — 在 useEffect 里初始化实例,组件卸载时 destroy。</p>
          <pre><code><span class="tk-kw">import</span> { <span class="tk-fn">useEffect</span>, <span class="tk-fn">useRef</span> } <span class="tk-kw">from</span> <span class="tk-st">'react'</span>;
<span class="tk-kw">import</span> { <span class="tk-fn">matrixRain</span> } <span class="tk-kw">from</span> <span class="tk-st">'@xietuier/matrix-rain'</span>;

<span class="tk-kw">function</span> <span class="tk-fn">MatrixBackground</span>({ theme = <span class="tk-st">'silicon-valley'</span> }) {
  <span class="tk-kw">const</span> ref = <span class="tk-fn">useRef</span>(<span class="tk-kw">null</span>);

  <span class="tk-fn">useEffect</span>(() =&gt; {
    <span class="tk-kw">const</span> rain = <span class="tk-fn">matrixRain</span>({ canvas: ref.current, theme });
    <span class="tk-kw">return</span> () =&gt; rain.<span class="tk-fn">destroy</span>();
  }, [theme]);

  <span class="tk-kw">return</span> <span class="tk-tag">&lt;canvas</span> <span class="tk-attr">ref</span>=<span class="tk-st">{ref}</span> <span class="tk-tag">/&gt;</span>;
}</code></pre>
        </article>

        <!-- 6 · Vue 3 -->
        <article v-else-if="active === 'vue'">
          <h2>Vue 3 <em class="grad">组合式</em></h2>
          <p>本项目自己就用 Vue 3,直接用本站点的 <code>useMatrixRain</code> composable:</p>
          <pre><code><span class="tk-tag">&lt;script</span> <span class="tk-attr">setup</span> <span class="tk-attr">lang</span>=<span class="tk-st">"ts"</span><span class="tk-tag">&gt;</span>
<span class="tk-kw">import</span> { <span class="tk-fn">useMatrixRain</span> } <span class="tk-kw">from</span> <span class="tk-st">'@/composables/useMatrixRain'</span>;
<span class="tk-kw">import</span> { <span class="tk-fn">ref</span>, <span class="tk-fn">computed</span> } <span class="tk-kw">from</span> <span class="tk-st">'vue'</span>;

<span class="tk-kw">const</span> canvasRef = <span class="tk-fn">ref</span>&lt;HTMLCanvasElement | <span class="tk-kw">null</span>&gt;(<span class="tk-kw">null</span>);
<span class="tk-kw">const</span> theme = <span class="tk-fn">ref</span>(<span class="tk-st">'silicon-valley'</span>);
<span class="tk-kw">const</span> options = <span class="tk-fn">computed</span>(() =&gt; ({ theme: theme.value, fontSize: <span class="tk-num">14</span> }));

<span class="tk-fn">useMatrixRain</span>(options, canvasRef);
<span class="tk-tag">&lt;/script&gt;</span>

<span class="tk-tag">&lt;template&gt;&lt;canvas</span> <span class="tk-attr">ref</span>=<span class="tk-st">"canvasRef"</span> <span class="tk-tag">/&gt;&lt;/template&gt;</span></code></pre>
        </article>

        <!-- 7 · Next.js -->
        <article v-else-if="active === 'next'">
          <h2>Next.js <em class="grad">客户端组件</em></h2>
          <p>注意:matrix-rain 涉及 canvas / window,必须在 client 组件中使用:</p>
          <pre><code><span class="tk-st">'use client'</span>;

<span class="tk-kw">import</span> { <span class="tk-fn">useEffect</span>, <span class="tk-fn">useRef</span> } <span class="tk-kw">from</span> <span class="tk-st">'react'</span>;
<span class="tk-kw">import</span> { <span class="tk-fn">matrixRain</span> } <span class="tk-kw">from</span> <span class="tk-st">'@xietuier/matrix-rain'</span>;

<span class="tk-kw">export default function</span> <span class="tk-fn">MatrixRainClient</span>({ theme }: { theme: <span class="tk-kw">string</span> }) {
  <span class="tk-kw">const</span> ref = <span class="tk-fn">useRef</span>&lt;HTMLCanvasElement&gt;(<span class="tk-kw">null</span>);
  <span class="tk-fn">useEffect</span>(() =&gt; {
    <span class="tk-kw">const</span> rain = <span class="tk-fn">matrixRain</span>({ canvas: ref.current!, theme });
    <span class="tk-kw">return</span> () =&gt; rain.<span class="tk-fn">destroy</span>();
  }, [theme]);
  <span class="tk-kw">return</span> <span class="tk-tag">&lt;canvas</span> <span class="tk-attr">ref</span>=<span class="tk-st">{ref}</span> <span class="tk-tag">/&gt;</span>;
}</code></pre>
        </article>

        <!-- 8 · CDN / IIFE -->
        <article v-else-if="active === 'cdn'">
          <h2>纯 HTML + <em class="grad">CDN</em></h2>
          <p>无构建步骤的最简 HTML,适合 demo / 静态页面:</p>
          <pre><code><span class="tk-com">&lt;!DOCTYPE html&gt;</span>
<span class="tk-tag">&lt;html&gt;</span>
<span class="tk-tag">&lt;head&gt;</span>
  <span class="tk-tag">&lt;link</span> <span class="tk-attr">rel</span>=<span class="tk-st">"stylesheet"</span> <span class="tk-attr">href</span>=<span class="tk-st">"https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain/dist/matrix-rain.css"</span><span class="tk-tag">&gt;</span>
<span class="tk-tag">&lt;/head&gt;</span>
<span class="tk-tag">&lt;body&gt;</span>
  <span class="tk-tag">&lt;canvas</span> <span class="tk-attr">id</span>=<span class="tk-st">"bg"</span> <span class="tk-attr">style</span>=<span class="tk-st">"position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;"</span><span class="tk-tag">&gt;&lt;/canvas&gt;</span>

  <span class="tk-tag">&lt;script</span> <span class="tk-attr">src</span>=<span class="tk-st">"https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain/dist/index.umd.js"</span><span class="tk-tag">&gt;&lt;/script&gt;</span>
  <span class="tk-tag">&lt;script&gt;</span>
    <span class="tk-kw">const</span> rain = MatrixRain.<span class="tk-fn">matrixRain</span>({
      canvas: document.<span class="tk-fn">getElementById</span>(<span class="tk-st">'bg'</span>),
      theme: <span class="tk-st">'silicon-valley'</span>
    });
  <span class="tk-tag">&lt;/script&gt;</span>
<span class="tk-tag">&lt;/body&gt;</span>
<span class="tk-tag">&lt;/html&gt;</span></code></pre>
        </article>

        <!-- 9 · API · Options -->
        <article v-else-if="active === 'api-options'">
          <h2>API · <em class="grad">配置项</em></h2>
          <p>完整配置项列表。从 <code>MatrixRainOptions</code> 类型提取。</p>
          <table class="api-table">
            <thead>
              <tr>
                <th>Option</th>
                <th>Type</th>
                <th>Default</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>theme</code></td>
                <td><code>ThemeName | &#123; coldFrom, warmFrom &#125;</code></td>
                <td><code>'silicon-valley'</code></td>
                <td>主题预设或冷暖双主题拼色</td>
              </tr>
              <tr>
                <td><code>variant</code></td>
                <td><code>'classic' | 'avalanche' | 'ripple' | 'ascii'</code></td>
                <td><code>'classic'</code></td>
                <td>变体形态</td>
              </tr>
              <tr>
                <td><code>fontSize</code></td>
                <td><code>number</code></td>
                <td><code>14</code></td>
                <td>字符网格宽度(像素)</td>
              </tr>
              <tr>
                <td><code>trailAlpha</code></td>
                <td><code>number</code></td>
                <td><code>0.18</code></td>
                <td>残影 alpha (0-1)。越小拖尾越长</td>
              </tr>
              <tr>
                <td><code>maxDPR</code></td>
                <td><code>number</code></td>
                <td><code>2</code></td>
                <td>DPR 缩放上限,性能优先可设 1</td>
              </tr>
              <tr>
                <td><code>charset</code></td>
                <td><code>string</code></td>
                <td><code>'0123456789'</code></td>
                <td>字符集</td>
              </tr>
              <tr>
                <td><code>targetPhase</code></td>
                <td><code>'fade' | 'noise-converge'</code></td>
                <td><code>'fade'</code></td>
                <td>目标位图出现方式</td>
              </tr>
              <tr>
                <td><code>targetLockOrder</code></td>
                <td><code>'random' | 'topdown' | ... (7 种)</code></td>
                <td><code>'random'</code></td>
                <td>noise-converge 锁定顺序</td>
              </tr>
              <tr>
                <td><code>targetLockStability</code></td>
                <td><code>number</code></td>
                <td><code>0.7</code></td>
                <td>锁定后字符稳定性 (0-1)</td>
              </tr>
              <tr>
                <td><code>onFrame</code></td>
                <td><code>(info: FrameInfo) =&gt; void</code></td>
                <td>—</td>
                <td>帧事件(30Hz 节流)</td>
              </tr>
              <tr>
                <td><code>onResize</code></td>
                <td><code>(size: SizeInfo) =&gt; void</code></td>
                <td>—</td>
                <td>resize 事件(200ms debounce)</td>
              </tr>
              <tr>
                <td><code>onThemeChange</code></td>
                <td><code>(newTheme: ThemeName) =&gt; void</code></td>
                <td>—</td>
                <td>主题切换事件</td>
              </tr>
              <tr>
                <td><code>onTargetFinish</code></td>
                <td><code>() =&gt; void</code></td>
                <td>—</td>
                <td>target 淑出完成事件</td>
              </tr>
            </tbody>
          </table>
        </article>

        <!-- 10 · API · Methods -->
        <article v-else-if="active === 'api-methods'">
          <h2>API · <em class="grad">实例方法</em></h2>
          <p>从 <code>MatrixRainInstance</code> 类型提取。热更新接口,无需重建实例。</p>
          <table class="api-table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>destroy()</code></td>
                <td>销毁实例,释放 rAF / 事件监听</td>
              </tr>
              <tr>
                <td><code>pause() / resume()</code></td>
                <td>暂停 / 恢复动画(切 tab 省电)</td>
              </tr>
              <tr>
                <td><code>setTheme(name, opts?)</code></td>
                <td>动态切换主题,opts.keepPaletteParams 保留调参</td>
              </tr>
              <tr>
                <td><code>setPalettes(cold, warm)</code></td>
                <td>动态更新色板(高级)</td>
              </tr>
              <tr>
                <td><code>setDensity(fontSize)</code></td>
                <td>动态调密度</td>
              </tr>
              <tr>
                <td><code>setFlickerSpeed(speed)</code></td>
                <td>动态调闪烁速度倍率(0=冻结, 1=默认, &gt;1=加快)</td>
              </tr>
              <tr>
                <td><code>setTargetFPS(fps)</code></td>
                <td>动态设目标帧率上限(0=不限,30=省电)</td>
              </tr>
              <tr>
                <td><code>setThemeParams(p)</code></td>
                <td>动态调亮度/饱和/色相</td>
              </tr>
              <tr>
                <td><code>setHueRotate(speed, amount?)</code></td>
                <td>热更新时间驱动色相旋转</td>
              </tr>
              <tr>
                <td><code>setColorOverrides(overrides | null)</code></td>
                <td>热更新颜色注入(传 null 清除)</td>
              </tr>
              <tr>
                <td><code>setTargetBitmap(bm, opts?)</code></td>
                <td>设置目标位图 + 计时器自动重置</td>
              </tr>
              <tr>
                <td><code>clearTargetBitmap()</code></td>
                <td>立即淑出(提前结束显示)</td>
              </tr>
              <tr>
                <td><code>getFPS()</code></td>
                <td>读取当前 FPS</td>
              </tr>
              <tr>
                <td><code>getOptions()</code></td>
                <td>读取当前生效配置快照</td>
              </tr>
              <tr>
                <td><code>serialize()</code></td>
                <td>导出 JSON 字符串(SSR hydration / 持久化)</td>
              </tr>
              <tr>
                <td><code>getTargetState?()</code></td>
                <td>读取 noise-converge 状态机当前快照(调试用)</td>
              </tr>
            </tbody>
          </table>
        </article>

        <!-- 11 · Playground (link out) -->
        <article v-else-if="active === 'playground'">
          <h2>配置项 <em class="grad">Playground</em></h2>
          <p>完整版 Playground 已独立成页 — 8 控件实时调参,canvas 立即更新,代码块一键复制。</p>
          <div class="pg-cta">
            <router-link to="/playground" class="btn btn-primary">打开 Playground →</router-link>
          </div>
          <h3>本节包含的简化版</h3>
          <p>如果你只想快速试 3 个核心参数,这里有个迷你版:</p>
          <pre><code><span class="tk-kw">const</span> rain = <span class="tk-fn">matrixRain</span>({
  canvas,
  theme: <span class="tk-st">'silicon-valley'</span>,
  fontSize: <span class="tk-num">14</span>,
  trailAlpha: <span class="tk-num">0.18</span>,
  variant: <span class="tk-st">'classic'</span>
});

<span class="tk-com">// 热切换主题</span>
rain.<span class="tk-fn">setTheme</span>(<span class="tk-st">'lava-red'</span>);

<span class="tk-com">// 调密度</span>
rain.<span class="tk-fn">setDensity</span>(<span class="tk-num">20</span>);

<span class="tk-com">// 设目标位图</span>
rain.<span class="tk-fn">setTargetBitmap</span>(textToBitmap(<span class="tk-st">'DEMO'</span>, <span class="tk-num">40</span>, <span class="tk-num">20</span>));</code></pre>
        </article>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';

const tabs = [
  { id: 'intro', label: '介绍' },
  { id: 'install', label: '安装' },
  { id: 'quickstart', label: '5 分钟上手' },
  { id: 'themes', label: '5 主题' },
  { id: 'variants', label: '4 变体' },
  { id: 'react', label: 'React' },
  { id: 'vue', label: 'Vue 3' },
  { id: 'next', label: 'Next.js' },
  { id: 'cdn', label: 'CDN' },
  { id: 'api-options', label: 'API · 配置项' },
  { id: 'api-methods', label: 'API · 方法' },
  { id: 'playground', label: 'Playground' },
];

const active = ref('intro');
const tabRefs = ref<HTMLButtonElement[]>([]);

function setTabRef(el: Element | any, idx: number) {
  // v-for 中把按钮元素收集到数组里,供键盘导航 focus 用
  if (el) tabRefs.value[idx] = el as HTMLButtonElement;
}

function selectTab(id: string) {
  active.value = id;
  // tab 切换后,把焦点留在 tab 按钮上(aria-selected=true)
  nextTick(() => {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx >= 0) tabRefs.value[idx]?.focus();
  });
}

function onTabKeydown(e: KeyboardEvent) {
  const idx = tabs.findIndex((t) => t.id === active.value);
  if (idx < 0) return;
  let nextIdx = idx;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    nextIdx = (idx + 1) % tabs.length;
    e.preventDefault();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    nextIdx = (idx - 1 + tabs.length) % tabs.length;
    e.preventDefault();
  } else if (e.key === 'Home') {
    nextIdx = 0;
    e.preventDefault();
  } else if (e.key === 'End') {
    nextIdx = tabs.length - 1;
    e.preventDefault();
  }
  if (nextIdx !== idx) {
    active.value = tabs[nextIdx].id;
    nextTick(() => tabRefs.value[nextIdx]?.focus());
  }
}

const themeList = [
  {
    id: 'silicon-valley',
    name: 'Silicon Valley',
    swatch: '#7af7d4',
    desc: '硅谷冷光,科技感最强,默认主题',
  },
  {
    id: 'matrix-green',
    name: 'Matrix Green',
    swatch: '#4ade80',
    desc: '经典黑客帝国绿,最纯粹的数字雨',
  },
  { id: 'lava-red', name: 'Lava Red', swatch: '#ff6b9a', desc: '熔岩暖意,适合博客 / 阅读场景' },
  { id: 'cyber-blue', name: 'Cyber Blue', swatch: '#38bdf8', desc: '赛博蓝,与极光紫搭配效果佳' },
  { id: 'pure-mono', name: 'Pure Mono', swatch: '#e5e7eb', desc: '纯灰阶,极简风,无色彩干扰' },
];

const variantList = [
  { id: 'classic', name: 'classic', desc: '默认变体,均匀下落,密度中等' },
  { id: 'avalanche', name: 'avalanche', desc: '雪崩,头部高亮拖尾,chUpdateProb=0.3' },
  { id: 'ripple', name: 'ripple', desc: '涟漪,sin 单波,头部频繁闪动' },
  { id: 'ascii', name: 'ascii', desc: 'ASCII 字符集,适合终端风' },
];
</script>

<style scoped>
.tutorial {
  padding-bottom: 80px;
}
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 32px;
  flex-wrap: wrap;
  padding: 6px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.tab {
  padding: 8px 14px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 160ms ease;
}
.tab:hover {
  color: var(--text);
  background: var(--bg-soft);
}
.tab.active {
  color: var(--bg);
  background: var(--accent);
  font-weight: 500;
}

.tab-content {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 40px 48px;
}
.tab-content h2 {
  margin: 0 0 24px;
  font-size: clamp(28px, 3.4vw, 40px);
}
.tab-content h3 {
  margin: 32px 0 12px;
  font-size: 18px;
  color: var(--text);
}
.tab-content p,
.tab-content li {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-muted);
}
.tab-content ul {
  padding-left: 24px;
}
.tab-content li {
  margin-bottom: 8px;
}
.tab-content code {
  font-size: 13px;
}
.tab-content b {
  color: var(--text);
  font-weight: 500;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin: 16px 0 24px;
}
.theme-card {
  position: relative;
  padding: 20px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.theme-card strong {
  display: block;
  font-size: 15px;
  margin: 8px 0 2px;
  color: var(--text);
}
.theme-card .theme-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--swatch);
  letter-spacing: 0.04em;
}
.theme-card p {
  font-size: 12px;
  margin: 8px 0 0;
}
.theme-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--swatch);
  box-shadow: 0 0 12px var(--swatch);
}

.variant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin: 16px 0 24px;
}
.variant-card {
  padding: 20px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.variant-card h3 {
  margin: 0 0 6px;
  font-family: var(--font-mono);
  font-size: 14px;
}
.variant-card code {
  display: inline-block;
  margin-bottom: 10px;
}
.variant-card p {
  font-size: 12px;
  margin: 0;
}

.api-table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0 24px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.api-table th,
.api-table td {
  padding: 12px 16px;
  text-align: left;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}
.api-table th {
  background: var(--bg-elev-2);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.api-table td {
  color: var(--text);
  vertical-align: top;
}
.api-table tr:last-child td {
  border-bottom: none;
}
.api-table code {
  font-size: 12px;
}

.pg-cta {
  margin: 16px 0 32px;
}

@media (max-width: 768px) {
  .tab-content {
    padding: 24px 20px;
  }
  .tab {
    padding: 6px 10px;
    font-size: 11px;
  }
}
</style>
