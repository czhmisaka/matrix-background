<template>
  <div class="blog">
    <div class="container">
      <header class="page-header">
        <span class="tag">Blog</span>
        <h1>工程笔记</h1>
        <p class="lead">写给前端工程师的 canvas 渲染笔记 — 字符运动、目标位图、状态机。</p>
      </header>

      <div class="post-list">
        <article v-for="post in posts" :key="post.slug" class="post-card" :class="{ expanded: expanded === post.slug }">
          <header class="post-header" @click="toggle(post.slug)">
            <div class="post-meta">
              <span class="post-date">{{ post.date }}</span>
              <span class="post-tag">{{ post.tag }}</span>
            </div>
            <h2>{{ post.title }}</h2>
            <p class="post-excerpt">{{ post.excerpt }}</p>
            <span class="post-toggle">{{ expanded === post.slug ? '− Collapse' : '+ Expand' }}</span>
          </header>
          <div v-if="expanded === post.slug" class="post-body" v-html="post.body"></div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const expanded = ref<string | null>(null);
function toggle(slug: string) {
  expanded.value = expanded.value === slug ? null : slug;
}

const posts = [
  {
    slug: 'noise-converge',
    date: '2026-06-07',
    tag: 'engine',
    title: '噪声 → 收敛:5 段状态机的实现思路',
    excerpt: '为什么用全屏噪点 + 逐 cell 锁定的方式,而不是简单的渐变?',
    body: `
      <p>文字涌现看上去浪漫,实现起来却需要"先乱后整"的视觉冲击。直接用 <code>globalAlpha</code> 淡入会有"画布变亮"的感觉,而不是"画面活过来"的感觉。</p>
      <h3>为什么是 5 段状态机</h3>
      <p>noise → converge → hold → dissolve → idle,每段都有独立的 timing / chaos / stability 参数。用户可以完全控制涌现的"形状感":从中心向外(默认)还是从边缘向内,从左扫到右还是从顶到底,7 种 <code>lockOrder</code> 给了设计者足够的表达空间。</p>
      <h3>字符稳定性</h3>
      <p><code>lockStability</code> 是 0-1 之间的数,1 表示完全不变(纯图像),0 表示每帧可换(类似 normal rain)。0.7 是默认 — 锁定区域每帧有 30% 概率换字符,既保留图像感又维持"活着"的感觉。</p>
      <h3>代码示例</h3>
      <pre><code>rain.setTargetBitmap(bitmap, {
  phase: 'noise-converge',
  noiseDuration: 0.5,    // 全屏噪点 0.5s
  convergeDuration: 1.5, // 逐 cell 锁定 1.5s
  lockOrder: 'center',   // 从中心向外
  lockStability: 0.7     // 70% 字符稳定
});</code></pre>
    `
  },
  {
    slug: 'why-canvas',
    date: '2026-05-30',
    tag: 'rendering',
    title: '为什么不用 DOM 节点',
    excerpt: '200 个独立运动的小元素:DOM vs Canvas 2D 的真实开销对比。',
    body: `
      <p>DOM 节点是浏览器最擅长的渲染单元,但当屏幕上要出现几百个独立运动的小元素时,DOM 会成为瓶颈。每次 <code>transform</code> / <code>opacity</code> 变更都会触发 style / layout / paint 三件套,即使在 GPU 加速下,每帧几百次也吃不消。</p>
      <h3>Canvas 2D 的方案</h3>
      <p>把所有字符当成像素画在同一个画布上。CPU 端只算逻辑态(位置、亮度、字符),GPU 端只刷一层 texture,几乎零 layout 开销。本库的典型帧时间:200 cells × 60fps = 12000 cells/s,Canvas 上能轻松跑在 60 fps。</p>
    `
  },
  {
    slug: 'pseudo-random',
    date: '2026-05-15',
    tag: 'math',
    title: '"看起来真随机" 比 "统计意义真随机" 更难',
    excerpt: '字符分布、节奏感、避免连续相同 — 反直觉调优。',
    body: `
      <p>数字雨要的是"看起来像真随机"而不是"统计意义真随机"。人眼对 0-9 字符分布非常敏感 — 连续出现 5 个相同字符就会出戏。</p>
      <p>本库用 0-9 字符集配合 sin 三波叠加 + phase 增量,产生有节奏但不规律的更新。完全随机反而看起来像乱码,这是工程上典型的"反直觉调优"。</p>
    `
  }
];
</script>

<style scoped>
.blog { padding-bottom: 80px; }
.post-list { display: flex; flex-direction: column; gap: 16px; }
.post-card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: border-color 200ms ease;
}
.post-card:hover { border-color: var(--border-strong); }
.post-card.expanded { border-color: var(--accent); }

.post-header {
  padding: 28px 32px;
  cursor: pointer;
  user-select: none;
}
.post-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}
.post-date { color: var(--accent); }
.post-tag {
  padding: 2px 6px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 3px;
  text-transform: uppercase;
}
.post-header h2 {
  font-size: 24px;
  margin: 0 0 8px;
}
.post-excerpt {
  color: var(--text-muted);
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}
.post-toggle {
  display: inline-block;
  margin-top: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-faint);
  letter-spacing: 0.04em;
}
.post-body {
  padding: 0 32px 32px;
  border-top: 1px solid var(--border);
  margin-top: 8px;
  padding-top: 24px;
}
.post-body :deep(h3) {
  font-size: 16px;
  margin: 24px 0 12px;
  color: var(--text);
}
.post-body :deep(p) {
  color: var(--text-muted);
  font-size: 15px;
  line-height: 1.7;
  margin: 0 0 16px;
}
.post-body :deep(pre) {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px 18px;
  font-size: 12px;
  overflow-x: auto;
  margin: 12px 0;
}
.post-body :deep(code) {
  font-size: 13px;
  color: var(--accent);
}
</style>
