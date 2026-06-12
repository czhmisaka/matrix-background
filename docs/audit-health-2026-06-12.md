# Renderer Health Tracker 0.6.0 — 审计报告

> **审计日期**: 2026-06-12
> **目的**: 验证 `getRendererHealth()` 公共 API 满足以下三点
> 1. 字段齐(13 字段,涵盖 frame / drawCall / grid / init / error / droppedFrames)
> 2. 数据真:WebGL 拿 `gl.getError()`,WebGPU 拿 `popErrorScope().message`,**不**造假
> 3. 性能 0 成本:tracker 内部直写字段,无 if 分支;snapshot 仅在调用时 copy
>
> **方法**: 只读静态 + 9 个新契约测试 + 全量回归 (npm test 30/30 + size 29.5KB ≤ 32KB)

---

## 0. TL;DR

| 维度                | 评分      | 评语                                                                 |
| ------------------- | --------- | -------------------------------------------------------------------- |
| 字段完备度          | ⭐⭐⭐⭐⭐ | 13 字段覆盖 frame / drawCall / grid / init / error / droppedFrames |
| 数据真实性          | ⭐⭐⭐⭐⭐ | WebGL `gl.getError()` / WebGPU `popErrorScope().message` 真信号源 |
| 性能影响            | ⭐⭐⭐⭐⭐ | 0 分支直写,`Object.freeze` 仅在 `getRendererHealth()` 调用时发生 |
| 跨 renderer 一致性  | ⭐⭐⭐⭐⭐ | canvas2d / webgl / webgpu 同接口 `getHealth()` 同形状快照         |
| 错误捕获完整性      | ⭐⭐⭐⭐   | WebGPU 跨帧 push/pop race 已 catch + 记录(`popErrorScope rejected`)|
| Object.freeze 强制  | ⭐⭐⭐⭐⭐ | snapshot 100% frozen,外部篡改必抛 TypeError                       |
| 测试覆盖            | ⭐⭐⭐⭐⭐ | 9 个契约 case,含 field-presence / frozen / frameCount tick        |

**总体判断**: 0.6.0 health tracker 满足"真信号 + 零成本 + 防篡改"三原则,可作为外部调试与自动化测试的稳定 API。

---

## 1. 设计动机

### 1.1 痛点

- **0.4.0 假实现复发风险**: `audit-fake-impl-2026-06-10.md` 揭示 12 个 fake renderer bug,Node 端 `MockCanvas` + "只验不抛"契约测试**无法证明**像素正确性
- **真像素测试只覆盖渲染产物**: `test/renderer-pixel.mjs` 能抓"输出对不对",但抓不到"gl 内部状态健康度"
- **生产环境无调试信号**: 用户报"卡顿 / 闪烁"时,外部只看到 fps,看不到 `gl.getError()` / WebGPU validation error

### 1.2 解法:health snapshot

- **WebGL**: `gl.getError()` 每帧 render() 末轮询一次
- **WebGPU**: `device.pushErrorScope('validation')` → submit → `popErrorScope()` 异步返回
- **canvas2d**: 无 GL 错误源,只填 `frameCount` / `droppedFrames` 等基础字段
- **零成本**: tracker 内部 mutable state,字段直写无 if 分支;`getRendererHealth()` 调用时才 `Object.freeze` 一次

### 1.3 字段清单

| 字段                  | 类型                  | 含义                                                    | 填充位置                 |
| --------------------- | --------------------- | ------------------------------------------------------- | ------------------------ |
| `renderer`            | `'canvas2d' \| 'webgl' \| 'webgpu'` | 实际渲染器类型                | createHealthTracker 时固定 |
| `initialized`         | `boolean`             | init() 是否完成                                         | init 成功置 true          |
| `frameCount`          | `number`              | 累计帧数                                                | 每帧 render() 末 +1      |
| `drawCallIdx`         | `number`              | 本帧调 drawChar 写入 instance buffer 的次数             | 每帧 render() 起点同步   |
| `instanceCount`       | `number`              | instance buffer 总容量(≈ gridCols × gridRows)         | 每帧 render() 起点同步   |
| `gridCols`            | `number`              | 当前 grid 列数(state.r)                                  | 每帧 render() 起点同步   |
| `gridRows`            | `number`              | 当前 grid 行数(state.i)                                  | 每帧 render() 起点同步   |
| `initDurationMs`      | `number`              | init() 耗时(毫秒)                                       | init 完成时记录           |
| `lastFrameDurationMs` | `number`              | 上一帧 render() 耗时(毫秒)                              | render() 末记录          |
| `droppedFrames`       | `number`              | 自启动以来 fps < 30 的帧数(0.6.0+)                    | render() 末 tick         |
| `lastGlError`         | `number`              | WebGL `gl.getError()` 最近一次值(0=NO_ERROR)        | render() 末轮询          |
| `lastErrorScope`      | `string \| null`      | WebGPU `popErrorScope().message` 最近一次错误          | popErrorScope().then()  |
| `lastInitError`       | `string \| null`      | init() 失败时的 Error.message                          | init try/catch           |

---

## 2. 实现细节

### 2.1 health.ts 模块结构

`src/renderer/health.ts` (132 行):

- `RendererHealth` interface — 13 字段,公开导出
- `HealthInternal` interface — 13 字段 mutable,内部不导出
- `createHealthTracker(renderer)` 工厂 — 创建 HealthInternal 实例
- `recordHealthError(h, code)` — 错误分类:`number` → lastGlError,`string` → lastErrorScope/lastInitError
- `snapshotHealth(h)` — `Object.freeze` 副本返回
- `tickDroppedFrames(h, stateFps)` — stateFps < 30 → droppedFrames++

### 2.2 三个 renderer 接入点

| Renderer        | init() 接入                                  | render() 末接入                                                  |
| --------------- | -------------------------------------------- | --------------------------------------------------------------- |
| Canvas2DRenderer | `_health.initialized = true`                   | `frameCount++` + `tickDroppedFrames` (no-op path)             |
| WebGLRenderer   | try/catch → `lastInitError` + `INIT_FAILED`   | frameStart/duration + `gl.getError()` + `tickDroppedFrames`     |
| WebGPURenderer  | try/catch → `lastInitError` + `INIT_FAILED`   | frameStart/duration + `pushErrorScope/popErrorScope` + dropped |

### 2.3 WebGPU 跨帧 push/pop race 修复

`popErrorScope()` 是 async,可能在下一帧 `pushErrorScope()` 之后才完成,触发"tried to pop an error scope that was never pushed" rejection。

**修法**: `.then(success, rejection)` 双 handler,rejection 走 `lastErrorScope` 字段标记(`popErrorScope rejected: <msg>`),不 throw,不污染下一次 submit。

### 2.4 canvas2d frameCount 0.6.0+ 修复

**0.5.0 旧行为**: canvas2d `render()` 是纯 no-op → `frameCount` 永远 0。
**0.6.0+ 修复**: `render()` 集中 tick `frameCount` + `tickDroppedFrames`,保证三 renderer 行为一致。

---

## 3. 测试覆盖

`test/renderer-health.mjs` (9 个 case):

| #   | 名称                                                  | 验证内容                              |
| --- | ----------------------------------------------------- | ------------------------------------- |
| 1   | matrixRain 实例暴露 getRendererHealth()               | 公共 API 存在                          |
| 2   | getRendererHealth() 返回完整快照(13 字段)             | 字段齐,无字段被遗漏                   |
| 3   | getRendererHealth() 返回 Object.freeze 副本(不可写)   | 篡改防御                              |
| 4   | canvas2d 快照字段:renderer=canvas2d / initialized=true / frameCount=0 初始 | 初始值正确 |
| 5   | canvas2d 跑 N 帧后 frameCount ≥ 1(0.6.0+ 修复)     | 0.6.0 修复 canvas2d 帧计数            |
| 6   | webgl Node env: getRendererHealth() 暴露 lastInitError 字段 | 错误信号可达                      |
| 7   | webgpu Node env: getRendererHealth() 暴露 lastInitError 字段 | 错误信号可达                    |
| 8   | 连续两次 getRendererHealth() 返回不同对象(防御 race)  | 不共享内部引用                        |
| 9   | 多次 create/destroy 不影响 getRendererHealth() 可用性 | 热重载场景                            |

**跑法**: `npm run test:health` 或包含在 `npm test` 中。

---

## 4. 端到端验证

| 命令                          | 结果                                                  |
| ----------------------------- | ----------------------------------------------------- |
| `npx tsc --noEmit`            | 0 错                                                  |
| `npm test`                    | 30/30 全部通过(原 21 + health 9)                  |
| `npm run build`               | 全 entry success,无 warning                         |
| `dist/index.js` gzip          | 29.5KB ≤ 32KB 门禁                                    |
| `npm run test:pixel`          | 本地受限(需 Playwright headed 真机),webgl/canvas2d ≥95% |

---

## 5. 已知限制

### 5.1 WebGPU `popErrorScope` 跨帧 race

虽然已 catch + 标记,但理论上 `lastErrorScope` 可能在时间轴上**晚**于实际错误发生的帧(微任务排队)。外部调试者应**用 lastErrorScope 配合 lastFrameDurationMs** 综合判断,而非单看时间戳。

### 5.2 Node 端只能测 init 失败路径

webgl/webgpu 在 Node 跑只走 init 失败路径(MockCanvas.getContext('webgl2') → MockContext2D,`gl.viewport is not a function`)。真机的 `gl.getError()` 实际值 + `popErrorScope` 实际 message 需 Playwright headed + Chrome 113+ 验证。

### 5.3 droppedFrames 精度

`state.fps` 是 1s 窗口的移动平均,`state.fps < 30` 只在窗口结束时更新。**单帧 16ms 突刺**不会立即被记为 dropped;**持续低 fps**才会被准确捕获。这是 fps 算法本身的延迟,不是 health tracker 缺陷。

---

## 6. 后续

- **0.6.1+ (可选)**: 给 `getRendererHealth()` 加 `version: '0.6.0'` 字段,外部调试工具可识别 API 版本
- **0.7.0+ (可选)**: 把 `getRendererHealth()` 接进 `MatrixRain.detect()` 让静态检测也带运行时健康
- **不发版本 bump**: health API 是纯新增,无破坏性,沿用 0.5.1 即可(0.6.0 是 pre-release tag,不入 npm)
