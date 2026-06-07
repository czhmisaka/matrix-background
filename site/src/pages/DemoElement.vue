<template>
  <div class="demo-element">
    <div class="container">
      <header class="page-header">
        <span class="tag">Web Component</span>
        <h1>&lt;matrix-rain&gt; · 多实例</h1>
        <p class="lead">把 matrix-rain 包成原生 Web Component,任何 DOM 节点直接挂载。Vue/React/原生 HTML 都能识别。下方 4 个实例各自独立配置。</p>
        <ThemeSwitcher />
      </header>

      <div class="grid-2x2">
        <div v-for="cfg in cells" :key="cfg.label" class="cell">
          <matrix-rain
            :theme="cfg.theme"
            :variant="cfg.variant"
            cell-size="14"
            :click-burst="true"
          />
          <div class="cell-overlay">
            <span class="cell-label">{{ cfg.variant }} · {{ cfg.theme }}</span>
            <span class="cell-fps" v-if="fpsByIndex[cfg.idx]">{{ fpsByIndex[cfg.idx] }} FPS</span>
          </div>
        </div>
      </div>

      <section class="code-sample">
        <h2>用法</h2>
        <p class="lead">直接 <code>&lt;script&gt;</code> 引入 dist 里的 element 入口,即可用 <code>&lt;matrix-rain&gt;</code> 标签。</p>
        <pre><code><span class="tk-tag">&lt;script</span> <span class="tk-attr">type</span>=<span class="tk-st">"module"</span> <span class="tk-attr">src</span>=<span class="tk-st">"/dist/element.js"</span><span class="tk-tag">&gt;&lt;/script&gt;</span>

<span class="tk-com">&lt;!-- 4 实例独立配置 --&gt;</span>
<span class="tk-tag">&lt;matrix-rain</span> <span class="tk-attr">theme</span>=<span class="tk-st">"silicon-valley"</span> <span class="tk-attr">variant</span>=<span class="tk-st">"classic"</span><span class="tk-tag">&gt;&lt;/matrix-rain&gt;</span>
<span class="tk-tag">&lt;matrix-rain</span> <span class="tk-attr">theme</span>=<span class="tk-st">"lava-red"</span>     <span class="tk-attr">variant</span>=<span class="tk-st">"avalanche"</span><span class="tk-tag">&gt;&lt;/matrix-rain&gt;</span>
<span class="tk-tag">&lt;matrix-rain</span> <span class="tk-attr">theme</span>=<span class="tk-st">"cyber-blue"</span>   <span class="tk-attr">variant</span>=<span class="tk-st">"ripple"</span><span class="tk-tag">&gt;&lt;/matrix-rain&gt;</span>
<span class="tk-tag">&lt;matrix-rain</span> <span class="tk-attr">theme</span>=<span class="tk-st">"matrix-green"</span> <span class="tk-attr">variant</span>=<span class="tk-st">"classic"</span><span class="tk-tag">&gt;&lt;/matrix-rain&gt;</span></code></pre>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, reactive } from 'vue';
import ThemeSwitcher from '@/components/ThemeSwitcher.vue';
import { useTheme } from '@/composables/useTheme';
import type { MatrixRainElement as MatrixRainElType } from '@xietuier/matrix-rain/element';

const { current: theme } = useTheme();

const cells = reactive([
  { idx: 0, theme: 'silicon-valley', variant: 'classic',   label: 'classic · silicon-valley' },
  { idx: 1, theme: 'lava-red',       variant: 'avalanche', label: 'avalanche · lava-red' },
  { idx: 2, theme: 'cyber-blue',     variant: 'ripple',    label: 'ripple · cyber-blue' },
  { idx: 3, theme: 'matrix-green',   variant: 'classic',   label: 'classic · matrix-green' }
]);

const fpsByIndex = ref<Record<number, number>>({});
const wrapperRefs = ref<MatrixRainElType[]>([]);
let raf = 0;

function tickFps() {
  wrapperRefs.value.forEach((el: MatrixRainElType, i: number) => {
    if (!el) return;
    const inst = (el as any).instance;
    if (inst && typeof inst.getFPS === 'function') {
      fpsByIndex.value[i] = inst.getFPS();
    }
  });
  raf = requestAnimationFrame(tickFps);
}

onMounted(() => {
  // 找到所有 matrix-rain 元素(它们注册时已经 start)
  const els = document.querySelectorAll('matrix-rain') as NodeListOf<MatrixRainElType>;
  wrapperRefs.value = Array.from(els);
  // 等下一帧
  setTimeout(() => {
    wrapperRefs.value = Array.from(document.querySelectorAll('matrix-rain')) as unknown as MatrixRainElType[];
    tickFps();
  }, 100);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
});

watch(theme, (t) => {
  // ThemeSwitcher 切换主题时,直接修改所有 web component 的 theme 属性
  const els = document.querySelectorAll('matrix-rain') as NodeListOf<MatrixRainElType>;
  els.forEach((el: any) => {
    if (el.setAttribute) el.setAttribute('theme', t);
  });
});
</script>

<style scoped>
.grid-2x2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  margin-bottom: 80px;
}
.cell {
  position: relative;
  aspect-ratio: 16/10;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.matrix-rain { width: 100% !important; height: 100% !important; }
.cell-overlay {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(0deg, rgba(10, 10, 20, 0.85) 0%, transparent 100%);
  pointer-events: none;
}
.cell-label {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
  letter-spacing: 0.04em;
}
.cell-fps {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  padding: 2px 6px;
  background: rgba(10, 10, 20, 0.6);
  border: 1px solid var(--border);
  border-radius: 4px;
}

.code-sample { padding-top: var(--gap-7); border-top: 1px solid var(--border); }
.code-sample h3, .code-sample h2 { margin-bottom: 12px; font-size: 22px; font-weight: 500; }
.code-sample .lead { margin-bottom: 24px; }

@media (max-width: 700px) {
  .grid-2x2 { grid-template-columns: 1fr; }
}
</style>
