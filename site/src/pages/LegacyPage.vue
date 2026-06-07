<template>
  <div class="legacy">
    <div class="container">
      <header class="page-header">
        <span class="tag">ARCHIVED</span>
        <h1>Legacy Demos</h1>
        <p class="lead">早期版本的 demo,已被新站点的现代版替代。仍可访问,但不再维护。</p>
      </header>

      <div class="legacy-list">
        <a v-for="item in legacy" :key="item.file" :href="item.url" target="_blank" class="legacy-card">
          <div class="legacy-card-head">
            <span class="legacy-tag">{{ item.tag }}</span>
            <span class="legacy-status">{{ item.status }}</span>
          </div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.desc }}</p>
          <div class="legacy-replace">
            <span class="replace-label">现代版:</span>
            <span class="replace-link">{{ item.replace }} →</span>
          </div>
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const legacy = [
  {
    file: '01-basic.html', tag: '01', status: 'DEPRECATED',
    title: 'Basic Demo', desc: '最简示例 — 默认主题直接启动',
    replace: '/tutorial?tab=quickstart', url: '/legacy/01-basic.html'
  },
  {
    file: '02-themes.html', tag: '02', status: 'DEPRECATED',
    title: '5 Themes', desc: '5 主题切换对比',
    replace: '/tutorial?tab=themes', url: '/legacy/02-themes.html'
  },
  {
    file: '03-variants.html', tag: '03', status: 'DEPRECATED',
    title: '4 Variants', desc: '4 变体形态对比',
    replace: '/tutorial?tab=variants', url: '/legacy/03-variants.html'
  },
  {
    file: '06-playground.html', tag: '06', status: 'DEPRECATED',
    title: 'Playground', desc: '早期参数 Playground',
    replace: '/playground', url: '/legacy/06-playground.html'
  }
];
</script>

<style scoped>
.legacy { padding-bottom: 80px; }
.legacy-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}
.legacy-card {
  display: flex;
  flex-direction: column;
  padding: 24px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: all 200ms ease;
  text-decoration: none;
  color: inherit;
}
.legacy-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: var(--shadow-2);
}
.legacy-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.legacy-tag {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  letter-spacing: 0.06em;
}
.legacy-status {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(255, 107, 154, 0.12);
  border: 1px solid rgba(255, 107, 154, 0.3);
  border-radius: 3px;
  color: #ff5c7c;
  letter-spacing: 0.08em;
}
.legacy-card h3 {
  font-size: 18px;
  margin: 0 0 8px;
}
.legacy-card p {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.55;
  margin: 0 0 16px;
  flex: 1;
}
.legacy-replace {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-faint);
}
.replace-label { color: var(--text-faint); }
.replace-link { color: var(--accent); }
</style>
