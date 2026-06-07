# A11Y TODO · 后续 P2 改进项 · 2026-06-08

承接 `A11Y-AUDIT-2026-06-08.md` §5.3。本文档列未在本轮完成的改进项,
按优先级 + 工作量排序。

---

## P2 列表(下次冲刺)

### TODO-1 · heading-order 全面修整
- **影响**:axe moderate 20 处,跨 13 路由。
- **做法**:
  1. HomePage:`.feature h4` → `h3`(`h2 → h3` 正确)。
  2. PlaygroundPage:`<aside>` 内 `<h3>` → 提升为 `<h2>`,但需要在每个 h3 前加
     一段隐藏的 section header(`sr-only`)。
  3. FooterBar:`<h5>` 不动(视觉设计需要),但加 `<aside aria-labelledby="footer-nav-heading">`
     + 隐藏 h2,让 landmark 有名字。
- **工作量**:0.5d。

### TODO-2 · 列表语义(ul/ol)
- **影响**:DemosPage 的 `.demos-grid` 当前是 `<div>`,屏幕阅读器只听到 "6 个 div"。
- **做法**:`<ul role="list" class="demos-grid">` 包裹 + `<li>` 包裹每个 DemoCard。
- **工作量**:0.25d。
- **风险**:grid `display: grid` 在 `<ul>` 上需保留 `list-style: none; padding: 0; margin: 0`。
  已验证无副作用。

### TODO-3 · autoFocus main on route change
- **影响**:屏幕阅读器用户切页后,焦点仍留在 NavBar,新页内容不会自动播报。
- **做法**:`router.afterEach(() => nextTick(() => mainEl.focus()))`,但 main 需 `tabindex="-1"`。
- **工作量**:0.25d。
- **风险**:与 P0-1 联动,加 skip link 时一起做。

### TODO-4 · Tabs 改 ARIA tablist
- **影响**:TutorialPage 12 个 tab 当前是 button,没有 `role="tablist"` /
  `role="tabpanel"` / `aria-selected`。
- **做法**:
  - `<nav class="tabs" role="tablist" aria-label="教程章节">`
  - `<button role="tab" :aria-selected="active === t.id" :aria-controls="`tab-${t.id}`">`
  - `<section :id="`tab-${active}`" role="tabpanel" tabindex="0" :aria-labelledby="`tab-btn-${active}`">`
- **工作量**:0.5d。

### TODO-5 · 真实屏幕阅读器测试
- **影响**:axe 只能查静态标记,无法验证播报顺序、live region 触发、focus trap 等。
- **做法**:在本地 macOS 上用 VoiceOver + Safari 录屏 5 个关键页面;在 Windows VM 上用 NVDA + Chrome 再跑一遍。
- **工作量**:1d(含问题修复)。

### TODO-6 · CI 集成 axe
- **影响**:每次 PR 跑 axe,P0/P1 增量回归自动 fail。
- **做法**:GitHub Actions workflow:
  ```yaml
  - npm ci
  - npm run build
  - npx @axe-core/cli http://localhost:4173/ --exit
  ```
- **工作量**:0.5d。

### TODO-7 · 高对比度模式
- **影响**:Windows High Contrast Mode 下,所有 `border` / `background` 半透明色
  (`rgba(255,255,255,0.08)`) 会变透明,边框消失。
- **做法**:`@media (forced-colors: active) { ... }` 强制重写 border-color。
- **工作量**:0.5d。

### TODO-8 · 200% / 400% 缩放测试
- **影响**:响应式断点 768px / 920px 在极端缩放下可能 overflow。
- **做法**:Chrome DevTools 切 400% 缩放,跑 5 路由,记录 overflow 元素。
- **工作量**:0.5d。

### TODO-9 · Lighthouse a11y score ≥ 95
- **影响**:SEO 间接因素,Google Search Console 标记。
- **做法**:Lighthouse CI,P0 修完后跑。
- **工作量**:0.25d(纯测量)。

### TODO-10 · pa11y 交叉验证
- **影响**:axe 与 pa11y 规则集不同,可捕捉漏网之鱼。
- **做法**:在 CI 加 `pa11y-ci`。
- **工作量**:0.5d。

---

## 总估算:约 5 工作日,分 1-2 个 sprint 完成。
