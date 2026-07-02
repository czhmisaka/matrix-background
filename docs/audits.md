# 审计索引

仓库所有历史 + 当前审计的导航入口。每份各 1 行简介，正文进对应文件。

最近一次整理:2026-07-01(把根目录 audit 与 docs/audit 合并)。

## 索引 · 按发布日期递增

| 日期       | 主题                                                                  | 一句话                                                   | 行数 |
| ---------- | --------------------------------------------------------------------- | -------------------------------------------------------- | ---: |
| 2026-06-07 | [audit](audits/audit-2026-06-07.md)                                   | 7 上线前最后综合体检                                     |    — |
| 2026-06-07 | [routing](audits/routing-2026-06-07.md)                               | 7 路由配置 + 部署前的网络拓扑核对                        |    — |
| 2026-06-08 | [a11y-2026-06-08](audits/a11y-2026-06-08.md)                          | axe + 人工 a11y 全站扫描                                 |    — |
| 2026-06-08 | [a11y-baseline](audits/a11y-baseline-2026-06-08.md)                   | 同日基线(数字快照)                                       |    — |
| 2026-06-08 | [a11y-deep-audit](audits/a11y-deep-audit-2026-06-08.md)               | 深度 UX + a11y 审计(全站点)                              |    — |
| 2026-06-08 | [a11y-todo](audits/a11y-todo.md)                                      | 同日 a11y 待办列表                                       |    — |
| 2026-06-08 | [code-quality](audits/code-quality-2026-06-08.md)                     | 评分 B- · DRY / 错误处理扣分                             |    — |
| 2026-06-08 | [docs](audits/docs-2026-06-08.md)                                     | 文档与产品一致性                                         |    — |
| 2026-06-08 | [perf](audits/perf-2026-06-08.md)                                     | 性能首次摸底                                             |    — |
| 2026-06-08 | [perf-baseline](audits/perf-baseline-2026-06-08.md)                   | 同日性能基线(数字)                                       |    — |
| 2026-06-08 | [security](audits/security-2026-06-08.md)                             | 安全审查                                                 |    — |
| 2026-06-08 | [test-coverage](audits/test-coverage-2026-06-08.md)                   | Node 端探针覆盖盘点                                      |    — |
| 2026-06-09 | [perf](audits/perf-2026-06-09.md)                                     | 性能 v0.5.0+                                             |    — |
| 2026-06-09 | [perf-renderer-baseline](audits/perf-renderer-baseline-2026-06-09.md) | 3 renderer 横评基线                                      |    — |
| 2026-06-10 | [fake-impl](audits/fake-impl-2026-06-10.md)                           | "假实现" 检测(`throw new Error('Not implemented')` 模式) |    — |
| 2026-06-12 | [deploy](audits/deploy-2026-06-12.md)                                 | 部署脚本审查                                             |    — |
| 2026-06-12 | [health](audits/health-2026-06-12.md)                                 | `getDiagnostics()` 健康诊断                              |    — |
| 2026-06-15 | [code-quality](audits/code-quality-2026-06-15.md)                     | 0.6.1 代码质量评分 B- 复评                               |  423 |
| 2026-06-15 | [performance](audits/performance-2026-06-15.md)                       | 性能复审 · 真 gzip + bench                               |  501 |
| 2026-06-15 | [runtime](audits/runtime-2026-06-15.md)                               | 浏览器/SSR 兼容性矩阵                                    |  356 |
| 2026-06-15 | [usability](audits/usability-2026-06-15.md)                           | 包文件易用度 · ★3.0/5                                    |  353 |
| 2026-06-16 | [playground-fix](audits/playground-fix-2026-06-16.md)                 | 0.6.2+ Playground 修复轮 · 2 P0 + 2 P1 + 5 P2            |  541 |
| 2026-06-22 | [code-structure](audits/code-structure-2026-06-22.md)                 | 代码结构审查 · 0.6.x 后期                                |  323 |
| 2026-06-24 | [a11y-i18n](audits/a11y-i18n-2026-06-24.md)                           | a11y + i18n + SEO 横评                                   |  361 |
| 2026-06-24 | [observability](audits/observability-2026-06-24.md)                   | `getRendererHealth` 审查 · "加了就死" 半成品 API         |  465 |
| 2026-06-24 | [reconcile](audits/reconcile-2026-06-24.md)                           | 历史审计对账 · 评分 52/100                               |  264 |
| 2026-06-24 | [test-release](audits/test-release-2026-06-24.md)                     | 测试 + 发布工程 · 5 P0 + 5 P1 + 5 P2                     |  492 |

## 当前未结关键 P0

按最新一份审计([test-release-2026-06-24](audits/test-release-2026-06-24.md))汇总:

1. **`.gitignore` 误伤** — 把 `test/e2e` / `perf` / `pixel` / `unit` / `vitest.config.ts` 全部 ignore,CI 上找不到入口
2. **`package.json` `version: "0.5.1"` 与 git log 不同步** — 已合 0.6.0+ 但版本号未提
3. **`vitest run` 漏报** — 1 个 spec fail,`--coverage` 因失败不输出 summary
4. **`.size-limit.json` 三条目 `limit: "0 B"`** — 永远 EXCEED,等效强制红灯
5. **`npm pack` 产物 dts 桩文件** — consumer `import type` 拿到空导出

## 性能基线数据

[bench-results/2026-06-09.json](audits/bench-results/2026-06-09.json) · [bench-results/2026-06-11.json](audits/bench-results/2026-06-11.json) — 跨日 perf-bench 探针原始数字。

## 命名约定

所有审计使用小写 kebab-case:`{topic}-YYYY-MM-DD.md`。同主题多个日期 → 同名前缀、日期不同(`perf-2026-06-08.md` / `perf-2026-06-09.md`)。
