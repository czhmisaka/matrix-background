<template>
  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <div class="brand">
            <span class="brand-mark">M</span>
            <span class="brand-name">matrix-rain</span>
          </div>
          <p class="footer-tagline">
            Canvas 2D 渲染的 Matrix 数字雨背景库<br />5 主题 · 4 变体 · Web Component · 29 KB gzip
          </p>
        </div>
        <nav class="footer-col" aria-label="页脚导航 Explore">
          <h3 class="footer-heading">Explore</h3>
          <ul>
            <li><RouterLink to="/demos">Demos</RouterLink></li>
            <li><RouterLink to="/tutorial">Tutorial</RouterLink></li>
            <li><RouterLink to="/playground">Playground</RouterLink></li>
            <li><RouterLink to="/legacy">Legacy</RouterLink></li>
          </ul>
        </nav>
        <nav class="footer-col" aria-label="页脚导航 Reference">
          <h3 class="footer-heading">Reference</h3>
          <ul>
            <li><RouterLink to="/docs">API Docs</RouterLink></li>
            <li><RouterLink to="/blog">Blog</RouterLink></li>
          </ul>
        </nav>
        <nav class="footer-col" aria-label="页脚导航 Resources">
          <h3 class="footer-heading">Resources</h3>
          <ul>
            <li>
              <a
                href="https://www.npmjs.com/package/@xietuier/matrix-rain"
                target="_blank"
                rel="noopener"
                >npm</a
              >
            </li>
            <li>
              <a href="https://github.com/xietuier/matrix-rain" target="_blank" rel="noopener"
                >GitHub</a
              >
            </li>
            <li>
              <a
                href="https://github.com/xietuier/matrix-rain/blob/main/LICENSE"
                target="_blank"
                rel="noopener"
                >MIT License</a
              >
            </li>
          </ul>
        </nav>
      </div>
      <div class="footer-bottom">
        <span>© 2026 czhmisaka · @xietuier</span>
        <span class="dot">·</span>
        <span>本地部署 · 无 CDN</span>
        <span class="dot">·</span>
        <span class="build-hash">
          <span class="pulse-dot" style="color: var(--accent)" aria-hidden="true"></span>
          build {{ commitHash.slice(0, 7) }} · v{{ version }}
        </span>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
// build hash & version · 由 Vite 在构建时注入;无 CI 时 fallback 到固定值
const commitHash = (import.meta.env.VITE_COMMIT_HASH as string) || 'a1b2c3d';
const version = (import.meta.env.VITE_PKG_VERSION as string) || '1.0.0';
</script>

<style scoped>
.footer {
  margin-top: var(--gap-8);
  padding: var(--gap-7) 0 var(--gap-5);
  background: var(--bg-elev);
  border-top: 1px solid var(--border);
}
.footer-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr 1fr 1fr;
  gap: var(--gap-6);
  margin-bottom: var(--gap-6);
}
.footer-brand .brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: 14px;
  margin-bottom: var(--gap-3);
}
.brand-mark {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  background: var(--grad);
  color: #0a0a14;
  border-radius: 7px;
  font-weight: 700;
  font-size: 16px;
}
.footer-tagline {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
}
.footer-col h3,
.footer-col .footer-heading {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin: 0 0 var(--gap-4);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.footer-col ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.footer-col li {
  margin-bottom: 10px;
}
.footer-col a {
  font-size: 14px;
  color: var(--text-muted);
}
.footer-col a:hover {
  color: var(--accent);
}
.footer-bottom {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: var(--gap-5);
  border-top: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-faint);
  letter-spacing: 0.04em;
}
.dot {
  opacity: 0.4;
}
.build-hash {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: 0.04em;
  text-transform: lowercase;
}

@media (max-width: 768px) {
  .footer-grid {
    grid-template-columns: 1fr 1fr;
    gap: var(--gap-5);
  }
  .footer-brand {
    grid-column: 1 / -1;
  }
}
</style>
