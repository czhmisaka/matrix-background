<template>
  <div class="demo-blog">
    <BackgroundMatrixRain text="BLOG" v-bind="bgProps" />

    <div class="blog-content">
      <article>
        <header class="article-header">
          <span class="date">2026-06-05</span>
          <h1>数字雨背后的 3 个工程取舍</h1>
          <p class="article-meta">by czhmisaka · 8 min read · canvas · rendering</p>
        </header>

        <div class="article-body">
          <p class="lead">Matrix 风格的数字雨看上去浪漫,实现起来却充满工程权衡。本文从 canvas 渲染策略、字符随机性、目标位图涌现三个角度,讨论怎么在浏览器里"以假乱真"。</p>

          <h2>1. 像素级绘制 vs DOM 节点</h2>
          <p>DOM 节点是浏览器最擅长的渲染单元,但当屏幕上要出现几百个独立运动的小元素时,DOM 会成为瓶颈:每次 transform/opacity 变更都会触发 style/layout/paint 三件套。</p>
          <p>Canvas 2D 的方案简单得多:把所有字符当成像素画在同一个画布上。CPU 端只算逻辑态(位置、亮度、字符),GPU 端只刷一层 texture,几乎零 layout 开销。</p>

          <h2>2. 字符"真随机" vs 伪随机</h2>
          <p>数字雨要的是"看起来像真随机"而不是"统计意义真随机"。人眼对 0-9 字符分布非常敏感 — 连续出现 5 个相同字符就会出戏。</p>
          <p>本库用 0-9 字符集配合 sin 三波叠加 + phase 增量,产生有节奏但不规律的更新。完全随机反而看起来像乱码,这是工程上典型的"反直觉调优"。</p>

          <h2>3. 噪声 → 收敛:5 段状态机</h2>
          <p>最浪漫的特性是 target bitmap 涌现 — 文字从全屏噪点逐 cell 锁定为清晰图像。实现要管 5 段状态:noise → converge → hold → dissolve → idle,每段有独立的 timing / chaos / stability 参数。</p>
          <p>好处是用户能完全控制涌现的"形状感":从中心向外(默认)还是从边缘向内,从左扫到右还是从顶到底,7 种 lockOrder 给了设计者足够的表达空间。</p>

          <p class="signoff">— czhmisaka,写于 2026 春夏之交</p>
        </div>
      </article>
    </div>

    <div class="control-floating">
      <h2>背景调参</h2>
      <label>Brightness
        <input type="range" min="0.5" max="2" step="0.05" v-model.number="brightness"
               aria-label="背景亮度"
               :aria-valuemin="0.5" :aria-valuemax="2"
               :aria-valuenow="brightness"
               :aria-valuetext="brightness.toFixed(2)">
        <span class="cv" aria-hidden="true">{{ brightness.toFixed(2) }}</span>
      </label>
      <label>Flicker Speed
        <input type="range" min="0" max="3" step="0.1" v-model.number="flicker"
               aria-label="闪烁速度"
               :aria-valuemin="0" :aria-valuemax="3"
               :aria-valuenow="flicker"
               :aria-valuetext="`${flicker.toFixed(1)} 倍`">
        <span class="cv" aria-hidden="true">{{ flicker.toFixed(1) }}x</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import BackgroundMatrixRain from '@/components/BackgroundMatrixRain.vue';

const brightness = ref(1.0);
const flicker = ref(1.0);

const bgProps = computed(() => ({
  brightness: brightness.value,
  flicker: flicker.value
}));
</script>

<style scoped>
.demo-blog {
  position: relative;
  min-height: 100vh;
  background: var(--bg);
}
.blog-content {
  position: relative;
  z-index: 2;
  max-width: 720px;
  margin: 0 auto;
  padding: 100px 24px 80px;
  background: linear-gradient(180deg, rgba(10, 10, 20, 0.6) 0%, rgba(10, 10, 20, 0.85) 50%, rgba(10, 10, 20, 0.95) 100%);
  border-radius: var(--radius);
  margin-top: 60px;
  margin-bottom: 60px;
  backdrop-filter: blur(4px);
  border: 1px solid var(--border);
}
article { color: var(--text); }
.article-header { margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
.date {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.article-header h1 {
  font-size: clamp(28px, 4vw, 44px);
  margin: 12px 0 8px;
}
.article-meta {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-faint);
  margin: 0;
}
.article-body p { font-size: 16px; line-height: 1.7; color: var(--text-muted); margin-bottom: 18px; }
.article-body .lead { color: var(--text); font-size: 18px; }
.article-body h2 { font-size: 22px; margin: 32px 0 12px; color: var(--text); }
.signoff { font-style: italic; color: var(--text-faint); margin-top: 40px; }

.control-floating {
  position: fixed;
  bottom: 24px; right: 24px;
  z-index: 10;
  background: rgba(8, 8, 18, 0.92);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 16px 20px;
  width: 280px;
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-2);
}
.control-floating h4, .control-floating h2 {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 14px;
  font-weight: 500;
}
.control-floating label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.control-floating label input[type=range] { flex: 1; }
.cv {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--text);
  min-width: 40px;
  text-align: right;
}

@media (max-width: 600px) {
  .control-floating { width: calc(100vw - 32px); right: 16px; left: 16px; bottom: 16px; }
  .blog-content { padding: 60px 20px 60px; }
}
</style>
