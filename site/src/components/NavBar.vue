<template>
  <header class="nav">
    <div class="container nav-inner">
      <RouterLink to="/" class="brand">
        <span class="brand-mark">M</span>
        <span class="brand-name">matrix-rain</span>
      </RouterLink>

      <nav class="nav-links" :class="{ open: mobileOpen }">
        <RouterLink to="/demos" @click="mobileOpen = false">Demos</RouterLink>
        <RouterLink to="/tutorial" @click="mobileOpen = false">Tutorial</RouterLink>
        <RouterLink to="/playground" @click="mobileOpen = false">Playground</RouterLink>
        <RouterLink to="/blog" @click="mobileOpen = false">Blog</RouterLink>
        <RouterLink to="/docs" @click="mobileOpen = false">Docs</RouterLink>
        <a href="https://www.npmjs.com/package/@xietuier/matrix-rain" target="_blank" rel="noopener" class="nav-cta">npm ↗</a>
      </nav>

      <button class="nav-toggle" @click="mobileOpen = !mobileOpen" :aria-expanded="mobileOpen" aria-label="toggle menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const mobileOpen = ref(false);
</script>

<style scoped>
.nav {
  position: sticky;
  top: 0;
  z-index: 100;
  height: var(--nav-h);
  background: rgba(10, 10, 20, 0.78);
  backdrop-filter: saturate(140%) blur(14px);
  -webkit-backdrop-filter: saturate(140%) blur(14px);
  border-bottom: 1px solid var(--border);
}
.nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  gap: var(--gap-5);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}
.brand-mark {
  display: inline-flex;
  width: 28px; height: 28px;
  align-items: center; justify-content: center;
  background: var(--grad);
  color: #0a0a14;
  border-radius: 7px;
  font-weight: 700;
  font-size: 16px;
}
.brand-name { letter-spacing: 0.02em; }
.nav-links {
  display: flex;
  align-items: center;
  gap: var(--gap-5);
  font-family: var(--font-mono);
  font-size: 13px;
}
.nav-links a {
  color: var(--text-muted);
  letter-spacing: 0.02em;
  position: relative;
  padding: 4px 0;
}
.nav-links a:hover { color: var(--text); }
.nav-links a.router-link-active { color: var(--accent); }
.nav-links a.router-link-active::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -4px;
  height: 1px;
  background: var(--accent);
}
.nav-cta {
  padding: 6px 12px;
  background: var(--bg-elev);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  color: var(--text) !important;
}
.nav-cta:hover { color: var(--accent) !important; border-color: var(--accent); }
.nav-toggle {
  display: none;
  background: none;
  border: 0;
  width: 32px;
  height: 32px;
  flex-direction: column;
  gap: 5px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.nav-toggle span {
  display: block;
  width: 18px; height: 1.5px;
  background: var(--text);
}

@media (max-width: 768px) {
  .nav-toggle { display: flex; }
  .nav-links {
    position: absolute;
    top: var(--nav-h); left: 0; right: 0;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    padding: var(--gap-3) var(--gap-5);
    background: rgba(10, 10, 20, 0.98);
    border-bottom: 1px solid var(--border);
    max-height: 0;
    overflow: hidden;
    transition: max-height 240ms ease;
  }
  .nav-links.open { max-height: 400px; }
  .nav-links a {
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .nav-cta { text-align: center; }
}
</style>
