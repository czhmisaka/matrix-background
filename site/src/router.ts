import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./pages/HomePage.vue') },
  { path: '/demos', name: 'demos', component: () => import('./pages/DemosPage.vue') },
  {
    path: '/demos/element',
    name: 'demo-element',
    component: () => import('./pages/DemoElement.vue'),
  },
  { path: '/demos/events', name: 'demo-events', component: () => import('./pages/DemoEvents.vue') },
  { path: '/demos/themes', name: 'demo-themes', component: () => import('./pages/DemoThemes.vue') },
  {
    path: '/demos/noise-converge',
    name: 'demo-noise',
    component: () => import('./pages/DemoNoiseConverge.vue'),
  },
  { path: '/demos/blog', name: 'demo-blog', component: () => import('./pages/DemoBlog.vue') },
  {
    path: '/demos/ai-tune',
    name: 'demo-ai-tune',
    component: () => import('./pages/AITunePage.vue'),
  },
  { path: '/tutorial', name: 'tutorial', component: () => import('./pages/TutorialPage.vue') },
  {
    path: '/playground',
    name: 'playground',
    component: () => import('./pages/PlaygroundPage.vue'),
  },
  { path: '/blog', name: 'blog', component: () => import('./pages/BlogPage.vue') },
  { path: '/docs', name: 'docs', component: () => import('./pages/DocsPage.vue') },
  { path: '/legacy', name: 'legacy', component: () => import('./pages/LegacyPage.vue') },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('./pages/NotFoundPage.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
});

/**
 * a11y P2-12 · 路由切换后把焦点移到 <main id="main" tabindex="-1">,
 * 让屏幕阅读器用户听到新页面的 landmark + h1,而不是停留在 nav 链接。
 * preventScroll: false 走 scrollBehavior 已设置的位置;true 会用 main 自身位置,
 * 这里用 false 让路由的 scrollBehavior 决定滚动行为。
 */
router.afterEach(() => {
  // 等待 RouterView 切换完成
  setTimeout(() => {
    const main = document.getElementById('main');
    if (main) main.focus({ preventScroll: false });
  }, 0);
});
