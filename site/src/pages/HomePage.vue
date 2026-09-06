<template>
  <div class="home">
    <HeroCanvas />

    <section class="themes-strip">
      <div class="container">
        <div class="strip-grid" role="group" aria-label="主题切换">
          <button
            v-for="t in themes"
            :key="t"
            type="button"
            class="strip-cell"
            :class="{ active: current === t }"
            :style="{ '--swatch': accent(t) }"
            :aria-pressed="current === t"
            :aria-label="`切换到主题 ${label(t)}`"
            @click="setTheme(t)"
          >
            <span class="strip-dot" aria-hidden="true"></span>
            <span class="strip-label">{{ label(t) }}</span>
          </button>
        </div>
      </div>
    </section>

    <section class="features">
      <div class="container">
        <span class="eyebrow">FEATURES</span>
        <h2>6 主题 · 5 变体 · 0 妥协</h2>
        <p class="lead">
          Canvas 2D 直接绘制,所有效果都是像素而非 DOM。从硅谷冷光到熔岩暖意,每个主题都精心调过 HSL
          调色板与色相旋转。
        </p>

        <div class="features-grid">
          <div class="feature">
            <span class="feature-num">01</span>
            <h3>5 主题</h3>
            <p>冷暖双板拼色,可独立调亮 / 饱和 / 色相,支持冷暖双主题混搭。</p>
          </div>
          <div class="feature">
            <span class="feature-num">02</span>
            <h3>4 变体</h3>
            <p>classic / avalanche / ripple / ascii — 字符运动、密度、闪烁各不同。</p>
          </div>
          <div class="feature">
            <span class="feature-num">03</span>
            <h3>Web Component</h3>
            <p>任何框架可直接用 <code>&lt;matrix-rain&gt;</code> 标签挂载,Vue/React 都能识别。</p>
          </div>
          <div class="feature">
            <span class="feature-num">04</span>
            <h3>噪声 → 收敛</h3>
            <p>5 阶段状态机:全屏噪点 → 逐 cell 锁定 → 保持 → 反向解锁融化。</p>
          </div>
          <div class="feature">
            <span class="feature-num">05</span>
            <h3>事件驱动</h3>
            <p>onFrame / onResize / onThemeChange / onTargetFinish,4 个事件全覆盖。</p>
          </div>
          <div class="feature">
            <span class="feature-num">06</span>
            <h3>SSR 友好</h3>
            <p>核心逻辑零 DOM 依赖,Node/Edge/Worker 中可安全 import,主入口仅客户端使用。</p>
          </div>
        </div>
      </div>
    </section>

    <section class="cta">
      <div class="container">
        <h2>5 行代码 · 一个会呼吸的背景</h2>
        <p class="lead">无依赖 · 无打包 · 29 KB gzip · 即装即用</p>
        <div class="cta-actions">
          <router-link to="/playground" class="btn btn-primary">打开 Playground →</router-link>
          <router-link to="/tutorial" class="btn btn-ghost">查看教程</router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import HeroCanvas from '@/components/HeroCanvas.vue';
import { useTheme } from '@/composables/useTheme';

const { current, setTheme, themes, accent, label } = useTheme();
</script>

<style scoped>
.themes-strip {
  padding: 32px 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elev);
}
.strip-grid {
  display: grid;
  /* 大屏自适应:每格 200-280px,5 主题始终一行;超宽屏不会拉伸到 400px+ */
  grid-template-columns: repeat(auto-fit, minmax(200px, 280px));
  justify-content: center;
  gap: 12px;
}
.strip-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 160ms ease;
  text-align: left;
  font-family: var(--font-mono);
  width: 100%;
}
.strip-cell:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.strip-cell.active {
  color: var(--text);
  border-color: var(--swatch);
}
.strip-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--swatch);
  box-shadow: 0 0 8px var(--swatch);
}

.features {
  padding: 100px 0;
  position: relative;
  overflow: hidden;
}
.features::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, var(--border) 1px, transparent 1px),
    linear-gradient(to bottom, var(--border) 1px, transparent 1px);
  background-size: 32px 32px;
  opacity: 0.5;
  pointer-events: none;
  -webkit-mask-image: radial-gradient(ellipse at center, black 20%, transparent 75%);
  mask-image: radial-gradient(ellipse at center, black 20%, transparent 75%);
}
.features::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--accent) 20%,
    var(--accent-2) 50%,
    var(--accent-3) 80%,
    transparent
  );
  opacity: 0.7;
  pointer-events: none;
}
.features .container {
  position: relative;
  z-index: 1;
}
.features h2 {
  margin: 16px 0 16px;
}
.features .lead {
  margin-bottom: 64px;
}
.features-grid {
  display: grid;
  /* 3 列起步(>=1024px) · 大屏不拉伸,每格 320-420px */
  grid-template-columns: repeat(auto-fit, minmax(320px, 420px));
  justify-content: center;
  gap: 24px;
}
.feature {
  position: relative;
  padding: 32px 28px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: border-color 200ms ease;
}
.feature:hover {
  border-color: var(--border-strong);
}
.feature-num {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  margin-bottom: 16px;
  letter-spacing: 0.1em;
}
.feature h3 {
  font-size: 22px;
  margin: 0 0 8px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.feature p {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

.cta {
  padding: 100px 0 120px;
  text-align: center;
  background: var(--bg-elev);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.cta h2 {
  font-size: clamp(36px, 5vw, 64px);
  margin-bottom: 16px;
}
.cta .lead {
  margin: 0 auto 32px;
}
.cta-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .strip-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .features-grid {
    grid-template-columns: 1fr;
  }
}
/* 中桌面补救:auto-fit 在 920-1100 区间可能算出 2 列,把格子放宽 */
@media (min-width: 768px) and (max-width: 1023px) {
  .strip-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .features-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
