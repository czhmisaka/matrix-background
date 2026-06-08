<template>
  <div class="demos-page">
    <div class="container">
      <header class="page-header">
        <span class="tag">Demos</span>
        <h1>5 主题 · 4 变体 · 真实场景</h1>
        <p class="lead">
          每个 demo 都跑真实 matrix-rain 实例。改参数、触发事件、读状态机 — 全部可在浏览器里直接玩。
        </p>
      </header>

      <div class="demos-grid">
        <DemoCard
          to="/demos/element"
          tag="Web Component"
          title="多实例 &lt;matrix-rain&gt;"
          subtitle="Web Component 包装,DOM 节点直接用,4 实例独立配置"
          bitmap-text="multi"
        />
        <DemoCard
          to="/demos/events"
          tag="Events"
          title="4 事件回调"
          subtitle="onFrame / onResize / onThemeChange / onTargetFinish"
          bitmap-text="events"
        />
        <DemoCard
          to="/demos/themes"
          tag="Themes"
          title="冷暖主题混合"
          subtitle="coldFrom × warmFrom 双主题混搭,5 推荐组合"
          bitmap-text="mix"
        />
        <DemoCard
          to="/demos/noise-converge"
          tag="Emergence"
          title="噪声 → 收敛"
          subtitle="5 段状态机 · 7 lockOrder · 3 slider"
          bitmap-text="emerge"
        />
        <DemoCard
          to="/demos/image-converge"
          tag="Image Emergence"
          title="图片涌现"
          subtitle="拖入/上传/预设 → 噪声收敛为图像轮廓"
          bitmap-text="img"
        />
        <DemoCard
          to="/demos/blog"
          tag="Real Scenario"
          title="博客背景"
          subtitle="canvas 全屏 + 文章前景 + 实时调参面板"
          bitmap-text="blog"
        />
        <DemoCard
          to="/demos/ai-tune"
          tag="AI"
          title="🪄 AI 调参"
          subtitle="自然语言改背景,LLM 自动改配置 · 6 预设 + 3 模式"
          bitmap-text="ai"
        />
        <DemoCard
          to="/playground"
          tag="Playground"
          title="实时调参"
          subtitle="改 theme / fontSize / 各参数,canvas 立即更新"
          bitmap-text="play"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import DemoCard from '@/components/DemoCard.vue';
</script>

<style scoped>
.demos-page {
  padding-bottom: 80px;
}
.demos-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
.demos-page .lead {
  margin-top: 16px;
}
@media (max-width: 920px) {
  .demos-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 600px) {
  .demos-grid {
    grid-template-columns: 1fr;
  }
}
</style>
