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
  {
    path: '/demos/image-converge',
    name: 'demo-image-converge',
    component: () => import('./pages/ImageConvergePage.vue'),
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
