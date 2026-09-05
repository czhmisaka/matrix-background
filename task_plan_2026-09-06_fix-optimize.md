# 📐 修复与优化总体计划 · 0.7.1 → 0.8.0

> **生成日期**: 2026-09-06 · **基于**: 2026-07 全项目审查（实测验证，非照抄历史审计）
> **前置审查结论**: tsc ✅ / eslint 0 err 40 warn / vitest 535 ✅ / npm test 链路 ❌(pixel 6/6) / P0×5 未修 / 测试资产未入库 / CI perf job 缺 script

---

## 🎯 总目标

1. `npm test` 回绿（含真像素对比）
2. 测试资产与 CI 全部对齐（换机器不丢、CI 全绿）
3. 渲染器丢失/失败场景 100% 可观测 + 自愈或 fallback（P0 清零）
4. canvas2d 默认路径 gzip 30.4KB → ≤28KB（webgl/webgpu 按需加载）
5. 文档三处（README/CHANGELOG/types）与代码对齐，发布 0.7.1 + 0.8.0

---

## Phase 0 · 灭火与入库（0.5-1 天 · 阻塞后续一切）

### [ ] 0.1 npm test 回绿 · pixel 6/6 失败

- **现象**: webgl 匹配率 67%/37%/3%，webgpu 81%/50%/2%（阈值 95%）；1440p/4K 无 baseline，回退 live canvas2d 对比
- **步骤**:
  1. `npm run test:pixel -- --scenario 1080p --only webgl` 单 case 复现
  2. 测试加 `--dump-diff`：导出逐像素差异图，判断是**系统性偏移**（整体亮度/行偏移/字形错位）还是噪声
  3. 分支 A（系统性）: 排查 4K fontSize 自适应映射、atlas 采样（LINEAR）、GL trail fade 8-bit 精度 vs canvas2d 半透明累积
  4. 分支 B（可接受差异）: `MATRIX_RAIN_PIXEL_BASELINE_MODE=init npm run test:pixel` 重录 9 张 → `git add -f test/fixtures/baselines/`（commit 带 `[pixel-update]`）
  5. 补录 1440p/4K canvas2d baseline，消除 live fallback 不稳定
- **验收**: `npm test` exit 0
- **风险**: 跨渲染器抗锯齿本质差异 → 按渲染器分阈值（canvas2d 95% / webgl 90%），测试头注释记录理由

### [ ] 0.2 测试资产入库

- `git add test/unit test/e2e vitest.config.ts`（535 个单测只在本地，换机即丢）
- `test/perf/` 空目录：D2 落地 bench 或删除
- .gitignore 补 `site/public/atlas/`（构建产物）

### [ ] 0.3 CI workflow 对账（本次审查新发现）

- test.yml perf job 调 `npm run perf:bench` / `perf:report` → package.json **无此二 script**，job 必挂
- 修法：落地 script（见 D2）或临时改调 `bench:renderer` / 注释该 job
- pixel job 当前同红 → 与 0.1 联动

### [ ] 0.4 engines 对齐

- package.json `engines.node: ">=20"`（.nvmrc=20、CI 读 nvmrc、CHANGELOG 0.7.0 已声称 ≥20）

---

## Phase A · 运行时健壮性 P0 清零（1-1.5 天）→ 发布 0.7.1

### [ ] A1 (P0-1) WebGL context-lost 自愈 · webgl-renderer.ts

- init() 末尾注册 `webglcontextlost`: preventDefault + `_initialized=false` + `recordHealthError('CONTEXT_LOST')`
- `webglcontextrestored` → 封装 `_rebuildResources()` 重跑 atlas 上传 / program 编译 / buffer 分配
- health.ts + types/index.d.ts 加 `contextLostCount`
- 测试: Playwright 真 Chromium 用 `WEBGL_lose_context.loseContext()` 模拟（happy-dom 桩不支持）

### [ ] A2 (P0-2) WebGPU device.lost · webgpu-renderer.ts

- `device.lost.then(info => recordHealthError('DEVICE_LOST:' + info.reason))` + 标记未初始化
- requestAdapter 失败 → `health.lastInitError`
- 丢失后恢复复用 A3 fallback 机制

### [ ] A3 (P0-3) init 失败 fallback · engine.ts:245

- catch 内: `enableAutoFallback !== false` 且 impl≠canvas2d → 同步换 `Canvas2DRenderer` 重 init
- fallback 失败或已是 canvas2d → `state.isPaused=true` + destroy，rAF 链断（不再空转耗 CPU）
- options + variant-defaults.ts + README 加 `enableAutoFallback`（默认 true）

### [ ] A4 (P0-4) WebGPU create\* null 检查 · 14 处

- 位置: 475 / 572 / 582 / 588 / 594 / 613 / 654 / 696 / 703 / 709 / 713 / 717 / 783 / 793
- 每处卫语句: null → throw 带资源名（init 路径走 A3 fallback；resize 路径入 health.lastGlError）
- 顺带消掉 webgl/webgpu 共 40 处非空断言 `!`（eslint 清零）

### [ ] A5 (P0-5) atlas onerror 入 health · webgl-renderer.ts:521

- reject 前 `recordHealthError(this._health, 'ATLAS_LOAD_FAILED')`

### [ ] A6 (P1-6) canvas2d init 失败也写 health · canvas2d-renderer.ts:76

- try/catch + `recordHealthError('INIT_FAILED:'+msg)`，与 webgl/webgpu 行为一致

- **发布**: 0.7.1 · CHANGELOG 记录
- **验收**: 3 渲染器失败路径全写 health；context-lost 自愈；eslint src 0 警告；535 单测 + 28 探针全绿

---

## Phase B · 观测性闭环（1 天，可与 Phase D 并行）

### [ ] B1 (F-1) health 加 `version` 字段 — build 时 tsup define 注入 package.json 版本

### [ ] B2 (F-2) `MatrixRain.detect()` 返回 `& { health?: RendererHealth }`

### [ ] B3 (F-3) `MatrixRain.installTelemetryHook(fn)` — lastGlError/lastInitError/CONTEXT_LOST 变化推送（去抖）

### [ ] B4 (P2-7) fps-overlay 接 health — lastGlError≠0 时变红 + 显示错误码

### [ ] B5 (P2-9) 确认 `__matrixRainDebug.getHealthSummary()` 覆盖新字段（contextLostCount/version）

### [ ] B6 (P2-10) useMatrixRain.ts 错误回调接 `getRendererHealth()` 快照

### [ ] B7 (P2-8) engine 加 `visibilitychange` — 后台主动 pause / 回前台 resume（尊重用户手动 pause）

- **验收**: Playground Health Panel 显示 version + contextLostCount；README 有 telemetry 章节

---

## Phase C · 体积优化（1 天）→ 随 0.8.0

**现状**: tsup 注释已挑明矛盾——`matrixRain()` 是 sync API，webgl/webgpu 静态内联在主 chunk（30.4KB）。

### [ ] C1 方案 A（推荐·非破坏）: 懒升级

- autoPick 到 webgl/webgpu 时：先同步建 canvas2d **立即出画**，后台 dynamic import chunk 就绪后**下一帧无缝切换**
- tsup 主 entry `splitting: true`；webgl/webgpu/health 独立 chunk
- 预期: 主 chunk 30.4 → ~24-26KB；webgl ~6KB / webgpu ~8KB 按需
- health 记录 `UPGRADED` 事件；.size-limit.json 收紧 32→28KB

### [ ] C2 方案 B（备选·破坏性）: Promise 化 `matrixRainAsync()` — 留给 0.9.0

- **验收**: `npm run size` 绿；iife/umd 保持全量单文件（CDN 场景）

---

## Phase D · 测试工程补强（0.5-1 天）

### [ ] D1 (P2-12 可选) `performance.mark/measure('frame')` 时序数据

### [ ] D2 `perf:bench` / `perf:report` script 落地（vitest bench 或包装 bench-renderer.mjs）→ CI perf job 回绿

### [ ] D3 CI pixel job 加 `--dump-diff` artifact 上传，远程可定位

### [ ] D4 `npm test` 主链最前串 `test:unit`，一条命令覆盖全层级

### [ ] D5 task.md P1-3 修正（renderer-pixel 已在链内，实际问题是它失败）

---

## Phase E · 文档对账 + 发布（0.5 天）

### [ ] E1 (P2-1) README 补 `installTelemetryHook` / `enableAutoFallback` / `health.version`

### [ ] E2 (P2-3) task_plan_0.5.0.md checkbox 更新（P1✅/P2 部分/P3✅/P4⬜）

### [ ] E3 (P2-5) 修 2 处假想引用：regression-cases:170 `targetCellsLocked`（不存在）、test-strategy:96 错误路径

### [ ] E4 (P2-6) health 字段表补齐（14 字段，对齐 types/index.d.ts）

### [ ] E5 发布 0.7.1（Phase A+B）→ CHANGELOG → publish → 0.8.0（Phase C）

---

## 📅 排期与依赖

```
Phase 0 (0.5-1d) ──→ Phase A (1-1.5d) ──→ Phase B (1d) ──┐
                  └──→ Phase D (0.5-1d, 并行) ──────────┼──→ Phase E (0.5d) 发布
                       Phase C (1d, 依赖 A4 守卫就绪) ──┘
总计 ~5-6 个工作日
```

依赖说明：Phase 0 的 npm test 回绿是一切验证的前提；A3 的 fallback 机制是 A2 恢复路径的复用点；C1 依赖 A4 的守卫（切 renderer 时错误路径必须已闭环）。

---

## ✅ 总验收清单（Definition of Done）

| #   | 标准                                                    |
| --- | ------------------------------------------------------- |
| 1   | `npm test` exit 0（含 pixel 9 case）                    |
| 2   | CI 5 job 全绿（unit / size / pixel / e2e / perf）       |
| 3   | tsc 0 错误 · eslint src 0 警告                          |
| 4   | index gzip ≤ 28KB（canvas2d-only 路径）                 |
| 5   | 3 渲染器丢失/失败场景均有 health 记录 + 自愈或 fallback |
| 6   | README / CHANGELOG / types 三处对齐                     |
| 7   | git status 干净（无未跟踪测试资产）                     |
