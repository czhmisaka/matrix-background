<template>
  <div class="docs">
    <div class="container">
      <header class="page-header">
        <span class="tag">Docs</span>
        <h1>API 完整参考</h1>
        <p class="lead">
          从
          <code>types/index.d.ts</code>
          提取的完整类型签名。所有配置、参数、事件、方法、静态工具一网打尽。
        </p>
      </header>

      <div class="docs-layout">
        <nav class="side-nav" aria-label="本页章节">
          <a
            v-for="s in sections"
            :key="s.id"
            :href="`#${s.id}`"
            :aria-current="activeSection === s.id ? 'location' : undefined"
            :class="{ active: activeSection === s.id }"
            @click="activeSection = s.id"
            >{{ s.title }}</a
          >
        </nav>

        <article class="docs-body">
          <section id="overview">
            <h2>总览</h2>
            <p>@xietuier/matrix-rain 暴露以下顶层 API:</p>
            <pre><code><span class="tk-kw">import</span> {
  <span class="tk-fn">matrixRain</span>,        <span class="tk-com">// 主函数,创建实例</span>
  <span class="tk-fn">textToBitmap</span>,      <span class="tk-com">// 文字 → 灰度位图</span>
  <span class="tk-fn">imageToBitmap</span>,     <span class="tk-com">// 图片 → 灰度位图</span>
  <span class="tk-fn">fileToImage</span>,       <span class="tk-com">// File → HTMLImageElement</span>
  MatrixRainElement,        <span class="tk-com">// Web Component class</span>
  <span class="tk-fn">mountFpsOverlay</span>,   <span class="tk-com">// 简易 FPS 角标</span>
  themes,                   <span class="tk-com">// 5 主题字典</span>
  MatrixRain                <span class="tk-com">// 命名空间静态工具</span>
} <span class="tk-kw">from</span> <span class="tk-st">'@xietuier/matrix-rain'</span>;</code></pre>
            <p>子路径入口:</p>
            <pre><code><span class="tk-kw">import</span> { <span class="tk-fn">matrixRain</span> } <span class="tk-kw">from</span> <span class="tk-st">'@xietuier/matrix-rain/core'</span>;     <span class="tk-com">// SSR 友好,无 DOM</span>
<span class="tk-kw">import</span> { <span class="tk-fn">matrixRain</span> } <span class="tk-kw">from</span> <span class="tk-st">'@xietuier/matrix-rain/element'</span>; <span class="tk-com">// 仅 Web Component</span></code></pre>
          </section>

          <section id="themes">
            <h2>主题 (ThemeName)</h2>
            <p>5 套预设主题。每个主题都是独立的 HSL 调色板。</p>
            <table class="api-table">
              <thead>
                <tr>
                  <th>ThemeName</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>'silicon-valley'</code></td>
                  <td>硅谷冷光,科技感最强,默认主题</td>
                </tr>
                <tr>
                  <td><code>'matrix-green'</code></td>
                  <td>经典黑客帝国绿,最纯粹的数字雨</td>
                </tr>
                <tr>
                  <td><code>'lava-red'</code></td>
                  <td>熔岩暖意,适合博客 / 阅读场景</td>
                </tr>
                <tr>
                  <td><code>'cyber-blue'</code></td>
                  <td>赛博蓝,与极光紫搭配效果佳</td>
                </tr>
                <tr>
                  <td><code>'pure-mono'</code></td>
                  <td>纯灰阶,极简风,无色彩干扰</td>
                </tr>
              </tbody>
            </table>
            <p>
              可冷暖双板拼色:<code
                >theme: &#123; coldFrom: 'cyber-blue', warmFrom: 'lava-red' &#125;</code
              >
            </p>
          </section>

          <section id="variants">
            <h2>变体 (VariantName)</h2>
            <p>4 种字符运动模式。</p>
            <table class="api-table">
              <thead>
                <tr>
                  <th>VariantName</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>'classic'</code></td>
                  <td>默认变体,均匀下落,密度中等</td>
                </tr>
                <tr>
                  <td><code>'avalanche'</code></td>
                  <td>雪崩,头部高亮拖尾</td>
                </tr>
                <tr>
                  <td><code>'ripple'</code></td>
                  <td>涟漪,sin 单波,头部频繁闪动</td>
                </tr>
                <tr>
                  <td><code>'ascii'</code></td>
                  <td>ASCII 字符集,终端风</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section id="target-phase">
            <h2>Target · 涌现 (5 段状态机)</h2>
            <p>5 段状态: <code>noise → converge → hold → dissolve → idle</code></p>
            <table class="api-table">
              <thead>
                <tr>
                  <th>Option</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>targetPhase</code></td>
                  <td><code>'fade'</code></td>
                  <td><code>'fade'</code> 传统淡入 / <code>'noise-converge'</code> 涌现</td>
                </tr>
                <tr>
                  <td><code>targetNoiseDuration</code></td>
                  <td><code>0.5</code></td>
                  <td>全屏噪点时长(秒)</td>
                </tr>
                <tr>
                  <td><code>targetConvergeDuration</code></td>
                  <td><code>1.5</code></td>
                  <td>逐 cell 锁定时长(秒)</td>
                </tr>
                <tr>
                  <td><code>targetLockStability</code></td>
                  <td><code>0.7</code></td>
                  <td>锁定后字符稳定性 (0-1)</td>
                </tr>
                <tr>
                  <td><code>targetLockOrder</code></td>
                  <td><code>'random'</code></td>
                  <td>锁定顺序 7 种</td>
                </tr>
              </tbody>
            </table>
            <p>
              7 种 lockOrder:
              <code>random / topdown / bottomup / center / edge / leftright / rightleft</code>
            </p>
          </section>

          <section id="events">
            <h2>事件 (Callbacks)</h2>
            <p>4 个原生事件钩子。</p>
            <table class="api-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Frequency</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>onFrame(info)</code></td>
                  <td>30 Hz 节流</td>
                  <td>帧事件,FrameInfo 含 f/t/dt/fps</td>
                </tr>
                <tr>
                  <td><code>onResize(size)</code></td>
                  <td>200ms debounce</td>
                  <td>窗口尺寸变化,SizeInfo 含 w/h/cols/rows</td>
                </tr>
                <tr>
                  <td><code>onThemeChange(theme)</code></td>
                  <td>on setTheme</td>
                  <td>主题切换事件</td>
                </tr>
                <tr>
                  <td><code>onTargetFinish()</code></td>
                  <td>on finish</td>
                  <td>target 淑出完成事件</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section id="methods">
            <h2>实例方法</h2>
            <p>热更新接口,无需重建实例。</p>
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
                  <td>暂停 / 恢复动画</td>
                </tr>
                <tr>
                  <td><code>setTheme(name, opts?)</code></td>
                  <td>动态切换主题</td>
                </tr>
                <tr>
                  <td><code>setPalettes(cold, warm)</code></td>
                  <td>动态更新色板</td>
                </tr>
                <tr>
                  <td><code>setDensity(fontSize)</code></td>
                  <td>动态调密度</td>
                </tr>
                <tr>
                  <td><code>setFlickerSpeed(speed)</code></td>
                  <td>动态调闪烁速度</td>
                </tr>
                <tr>
                  <td><code>setTargetFPS(fps)</code></td>
                  <td>动态设帧率上限</td>
                </tr>
                <tr>
                  <td><code>setThemeParams(p)</code></td>
                  <td>动态调主题参数</td>
                </tr>
                <tr>
                  <td><code>setColorOverrides(o | null)</code></td>
                  <td>热更新颜色注入</td>
                </tr>
                <tr>
                  <td><code>setTargetBitmap(bm, opts?)</code></td>
                  <td>设置目标位图</td>
                </tr>
                <tr>
                  <td><code>clearTargetBitmap()</code></td>
                  <td>立即淑出</td>
                </tr>
                <tr>
                  <td><code>getFPS()</code></td>
                  <td>读取当前 FPS</td>
                </tr>
                <tr>
                  <td><code>getOptions()</code></td>
                  <td>读取当前配置快照</td>
                </tr>
                <tr>
                  <td><code>serialize()</code></td>
                  <td>导出 JSON 字符串(SSR)</td>
                </tr>
                <tr>
                  <td><code>getTargetState?()</code></td>
                  <td>读取 noise-converge 状态机</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section id="static">
            <h2>静态工具 (MatrixRain namespace)</h2>
            <pre><code>MatrixRain.<span class="tk-fn">destroyAll</span>()        <span class="tk-com">// 销毁所有活跃实例</span>
MatrixRain.<span class="tk-fn">destroyAll</span>(el)      <span class="tk-com">// 销毁指定容器内所有实例</span>
MatrixRain.activeCount            <span class="tk-com">// 当前活跃实例数</span>
MatrixRain.<span class="tk-fn">fromSnapshot</span>(json)  <span class="tk-com">// 从 snapshot 还原实例 (SSR hydration)</span>
MatrixRain.<span class="tk-fn">detect</span>()            <span class="tk-com">// 环境检测 (移动端/暗色/recommendedFontSize/...)</span></code></pre>
          </section>

          <section id="web-component">
            <h2>Web Component</h2>
            <p>原生 HTML 标签 <code>&lt;matrix-rain&gt;</code>:</p>
            <pre><code><span class="tk-tag">&lt;script</span> <span class="tk-attr">type</span>=<span class="tk-st">"module"</span> <span class="tk-attr">src</span>=<span class="tk-st">"/dist/element.js"</span><span class="tk-tag">&gt;&lt;/script&gt;</span>
<span class="tk-tag">&lt;matrix-rain</span>
  <span class="tk-attr">theme</span>=<span class="tk-st">"silicon-valley"</span>
  <span class="tk-attr">variant</span>=<span class="tk-st">"classic"</span>
  <span class="tk-attr">cell-size</span>=<span class="tk-st">"14"</span>
  <span class="tk-attr">click-burst</span>
<span class="tk-tag">&gt;&lt;/matrix-rain&gt;</span></code></pre>
            <p>
              属性 (kebab-case): <code>theme</code> / <code>variant</code> /
              <code>cell-size</code> / <code>target-fps</code> / <code>click-burst</code> /
              <code>cursor</code>
            </p>
          </section>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const sections = [
  { id: 'overview', title: '总览' },
  { id: 'themes', title: '主题' },
  { id: 'variants', title: '变体' },
  { id: 'target-phase', title: 'Target · 涌现' },
  { id: 'events', title: '事件' },
  { id: 'methods', title: '实例方法' },
  { id: 'static', title: '静态工具' },
  { id: 'web-component', title: 'Web Component' },
];

const activeSection = ref('overview');

onMounted(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) activeSection.value = entry.target.id;
      });
    },
    { rootMargin: '-20% 0px -60% 0px' }
  );
  document.querySelectorAll('section[id]').forEach((s) => observer.observe(s));
});
</script>

<style scoped>
.docs {
  padding-bottom: 80px;
}
.docs-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 32px;
  align-items: start;
}
.side-nav {
  position: sticky;
  top: calc(var(--nav-h) + 24px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.side-nav a {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
  padding: 6px 10px;
  border-radius: 4px;
  transition: all 160ms ease;
}
.side-nav a:hover {
  color: var(--text);
  background: var(--bg-soft);
}
.side-nav a.active {
  color: var(--accent);
  background: rgba(122, 247, 212, 0.06);
}

.docs-body section {
  scroll-margin-top: 80px;
  margin-bottom: 56px;
}
.docs-body h2 {
  font-size: 28px;
  margin: 0 0 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.docs-body p {
  color: var(--text-muted);
  font-size: 15px;
  line-height: 1.7;
}
.docs-body pre {
  font-size: 12px;
  line-height: 1.7;
  background: var(--bg-elev);
  margin: 12px 0;
}
.api-table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.api-table th,
.api-table td {
  padding: 10px 14px;
  text-align: left;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}
.api-table th {
  background: var(--bg-elev-2);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.api-table td {
  color: var(--text);
}
.api-table tr:last-child td {
  border-bottom: none;
}
.api-table code {
  font-size: 12px;
}

@media (max-width: 920px) {
  .docs-layout {
    grid-template-columns: 1fr;
  }
  .side-nav {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }
}

/* 桌面中-大屏适配(2026-06-08)· API 表格 / 文档列宽随屏宽 scale */
@media (min-width: 1280px) {
  .docs-layout {
    grid-template-columns: 220px 1fr;
    gap: 40px;
  }
  .api-table th,
  .api-table td {
    padding: 12px 18px;
    font-size: 14px;
  }
  .api-table code {
    font-size: 13px;
  }
}
@media (min-width: 1920px) {
  .docs-layout {
    grid-template-columns: 240px 1fr;
    gap: 56px;
  }
  .api-table th,
  .api-table td {
    padding: 14px 22px;
    font-size: 15px;
  }
  .api-table code {
    font-size: 14px;
  }
  pre {
    font-size: 14px;
  }
}
@media (min-width: 2560px) {
  .docs-layout {
    grid-template-columns: 280px 1fr;
    gap: 72px;
  }
  .api-table th,
  .api-table td {
    padding: 18px 28px;
    font-size: 17px;
  }
  .api-table th {
    font-size: 13px;
  }
  .api-table code {
    font-size: 16px;
  }
  pre {
    font-size: 16px;
  }
}
@media (min-width: 3840px) {
  .docs-layout {
    grid-template-columns: 320px 1fr;
    gap: 96px;
  }
  .api-table th,
  .api-table td {
    padding: 22px 36px;
    font-size: 19px;
  }
  .api-table th {
    font-size: 15px;
  }
  .api-table code {
    font-size: 18px;
  }
  pre {
    font-size: 18px;
  }
}
</style>
