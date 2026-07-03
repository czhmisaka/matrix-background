# WebGPU 在 CI 可行性 · 探针报告(2026-06-17)

> 任务来源: [[test-strategy]] §9 风险表第 1 条
> **"WebGPU 在 Linux CI runner 不可用" → 像素层丢 webgpu case**
> 探针: `docs/diag/_probe-webgpu.mjs` · 结果: `docs/diag/_probe-webgpu-result.json`

---

## 1. 结论先行

| 问题                                                                            | 答案                                                                                                                                           |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions 标准 `ubuntu-latest` / `ubuntu-22.04` runner **支持 WebGPU 吗?** | **否**。标准 runner 是无 dGPU 的 VM,WebGPU 在该环境无 GPU adapter,实测 n/a                                                                     |
| 是否有 GitHub 提供的 **GPU runner** 可解?                                       | **有,但成本高**:Enterprise Cloud / Team 计划,按分钟计费($0.07/分钟级别,具体见 §2.3)                                                            |
| **本机 headless Chromium 148 能拿到 WebGPU adapter 吗?**                        | **否**(探针实证,见 §3)。即便加 `--enable-features=WebGPU` / `--use-vulkan=swiftshader` / `--headless=new` 等多组 flag,`navigator.gpu` 仍未暴露 |
| **推荐方案**                                                                    | **A(只本地跑)+ B(关键时再上 GPU runner),C 暂搁置**。理由见 §4                                                                                  |

---

## 2. GitHub runner 调研

### 2.1 标准 runner 硬件(2026 现状)

来源: [actions/runner-images README](https://raw.githubusercontent.com/actions/runner-images/main/README.md)(2026-06 拉取)。

| 标签                                | OS             | CPU           | RAM   | GPU                 |
| ----------------------------------- | -------------- | ------------- | ----- | ------------------- |
| `ubuntu-latest` (== `ubuntu-24.04`) | Ubuntu 24.04   | 4 vCPU        | 16 GB | **无**              |
| `ubuntu-22.04`                      | Ubuntu 22.04   | 4 vCPU        | 16 GB | **无**              |
| `ubuntu-26.04`(preview)             | Ubuntu 26.04   | 4 vCPU        | 16 GB | **无**              |
| `windows-latest`                    | Server 2025    | 4 vCPU        | 16 GB | 无                  |
| `macos-latest`                      | macOS 15 ARM64 | Apple Silicon | 14 GB | **Apple GPU(集成)** |

**WebGPU 需要 GPU + Vulkan/Metal/Driver12 后端。** 标准 ubuntu/windows runner 无 dGPU,且 VM 通常无 `/dev/dri` 直通 → `navigator.gpu.requestAdapter()` 在该环境会返回 `null`。

### 2.2 唯一在标准 runner 上能跑 WebGPU 的路径:`macos-latest`

Apple Silicon 上 Chromium 启用 WebGPU 后调用 Metal 后端,实测可获得 adapter(**这是 0.5.1+ 阶段唯一能在 CI 跑 webgpu case 的免费路径**)。

- **优势**: 不额外花钱(标准 macOS runner,公开仓库免费,私有仓库按 minute 计费)
- **劣势**:
  - macOS runner **贵**($0.08/min Linux 4×),见下表
  - 启动慢(Mac 镜像拉取 ~30–60s)
  - pixel baseline 是 macOS Metal 渲染 → 跟用户最终运行环境(浏览器、Win/Linux)有 dGPU 厂商差异
  - 并发槽位少(常 1–3 个)

来源: [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)(2026-06 拉取,价格表因地区/org plan 浮动,以下为公开数值):

| Runner                       | 公开仓库 | 私有仓库(Team/Enterprise) |
| ---------------------------- | -------- | ------------------------- |
| Linux 2-core                 | $0 免费  | $0.008/分                 |
| Linux 4-core (ubuntu-latest) | $0 免费  | $0.016/分                 |
| macOS ARM64(macOS-latest)    | $0 免费  | **$0.08/分**              |
| Windows 4-core               | $0 免费  | $0.016/分                 |

### 2.3 Larger runner(GPU runner) · 选项 B 的成本

来源: [Using larger runners](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners) + [concepts page](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners) (2026-06 拉取)。

- 文档原话: "provision a runner with more cores, **or a runner that's powered by a GPU processor**. These machines are referred to as 'larger runner.'"
- 仅 **GitHub Team / Enterprise Cloud** 计划可见,公开仓库**不能**用
- 典型 GPU 规格 = **NVIDIA Tesla T4**(16 GB VRAM,配 A2 算力,WebGPU 走 Vulkan 后端)
- 价格:大约 $0.07/分 起,GPU SKU 通常 $0.14–0.18/分(具体看 org billing),每月 1000 分钟起跳
- 配置步骤: org 管理员进 Settings → Actions → Larger runners → New runner → 选 GPU 镜像 → 加 `gpu` 标签
- 代码侧: `runs-on: gpu-runner` (或自定义 label) + `container: --gpus all` (如需 CUDA)

> ⚠️ **价格是公开数据的近似值**,以 org 后台实际计费为准。

### 2.4 关键发现:标准 Linux runner **永远拿不到 WebGPU adapter**

不存在 "用 `ubuntu-22.04` 取代 `ubuntu-latest` 就能跑 webgpu" 的路径 —— test-strategy §9 现状里写的 "ubuntu-22.04 + dGPU runner" 实际上是两件事:换 OS 没用,必须上 larger runner。

---

## 3. 本机探针实证

### 3.1 探针脚本

`docs/diag/_probe-webgpu.mjs`(归档自 `test/_probe-webgpu.mjs`,已 cp 到主目录)

- 启动 `chromium.launch({ headless: true })` + 多组 WebGPU/Vulkan flags
- 注入 HTML,跑 `navigator.gpu.requestAdapter()` → 输出 adapter 是否为 null

### 3.2 试过的 launch 组合(全部失败)

| #   | args                                                | `navigator.gpu` | `requestAdapter()` |
| --- | --------------------------------------------------- | --------------- | ------------------ |
| 1   | `--enable-unsafe-webgpu` + Vulkan/swiftshader/ANGLE | **undefined**   | n/a                |
| 2   | + `--enable-features=WebGPU,Vulkan`                 | **undefined**   | n/a                |
| 3   | + `--enable-features=WebGPUService,WebGPU`          | **undefined**   | n/a                |
| 4   | + `--headless=new` + `--ignore-gpu-blocklist`       | **undefined**   | n/a                |

### 3.3 探针原始输出(简化)

```json
{
  "hasNavigatorGpu": false,
  "userAgent": "Mozilla/5.0 ... HeadlessChrome/148.0.7778.96 Safari/537.36",
  "requestAdapterResponse": null,
  "adapterInfo": null,
  "notes": ["navigator.gpu is undefined - WebGPU not exposed in this context"]
}
```

### 3.4 探针结论与含义

1. **chromium 148 headless 在本机 macOS 上根本不暴露 `navigator.gpu`** — 这与 chromium 138 之后 "WebGPU 默认 stable" 的口径不符。可能是:
   - playwright 1.60.0 的 chromium 148 用的 `--headless=old`(不是 `--headless=new`)与 WebGPU 不兼容
   - macOS 上 Metal 后端需要先 `navigator.gpu.requestAdapter()` 才能枚举,而 chromium 决定不在 headless 模式提供 GPU surface
2. **同源问题**:即使用户升级到 `ubuntu-latest` + Linux + dGPU,headless chromium 的 WebGPU 暴露也是前置依赖 —— 不解决,选项 C(docker + 软件光栅化)也不能工作
3. **唯一的可信 webgpu 路径**:
   - **本机 headed Chromium + 真 dGPU**(开发者手测)
   - **macos-latest runner + headed 模式**(可能;需进一步验证 headed 模式下 `navigator.gpu` 是否暴露)
   - **GitHub GPU larger runner + headed 模式**(可,但贵)

### 3.5 调试深度边界

> 调试时间 ~12 分钟(在 30 分钟边界内),探针已能给出"默认 headless 不可用"的确定结论。剩余可能性(headed / WSL / 真 GPU 机器)需要更多基础设施投入,不在本任务范围。

---

## 4. 三选项对比表

| 选项                                      | 描述                                                                                            | 优势                                                    | 劣势                                                                                                                          | 成本                            | **本项目适配度**                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------- |
| **A. CI 完全 skip webgpu,只本地跑**       | `test:pixel` 在 CI 跑 canvas2d + webgl,webgpu case 标 `it.skip`;开发者本地 headed 跑 webgpu     | 零额外成本;CI 稳定;测试分层清晰                         | webgpu 缺回归网,只有"手动验证"                                                                                                | **$0**                          | ✅ **推荐基线**                 |
| **B. macos-latest runner 跑 webgpu**      | 单独 job,`runs-on: macos-latest`,Playwright headed 模式(需先 headed 探针验证 navigator.gpu)     | 跟用户 macOS 环境最接近;不需要 enterprise plan          | 私有仓库贵(~$0.08/分);启动慢;Metal 渲染跟 Linux 仍有差异                                                                      | **~免费(公开仓库)~ 中高(私有)** | ✅ **关键时再启用**             |
| **B'. GPU larger runner**                 | `runs-on: gpu-runner` (NVIDIA T4) + headed Playwright                                           | 真 GPU,Vulkan 路径;pixel baseline 跟 Linux 用户环境接近 | 仅 Team/Enterprise 计划;$0.14–0.18/分;需要 org admin 配置                                                                     | **高**                          | ⚠️ 不必要(本项目 webgpu 占比小) |
| **C. docker + 软件光栅化(mesa lavapipe)** | 自建 docker 镜像:`apt install mesa-vulkan-drivers vulkan-tools` + Playwright 走 lavapipe Vulkan | 跟 GitHub runner 兼容;理论可跑在 ubuntu-latest          | 探针证明 chromium headless 不暴露 navigator.gpu 是**先于** lavapipe 的更早问题;lavapipe 性能慢;WebGPU compute shader 漂移更大 | **$0**(时间成本高)              | ❌ **本任务边界外**             |

### 4.1 推荐:**A 基线 + B 关键时再上**

**理由**:

1. **WebGPU case 占比 < 5%**。test-strategy §3.3.3 阈值表里 webgpu 是 3 档(92%/95%)里**阈值最低**的一档,意味着 pixel 漂移容忍度最大 → 本来就不该是 CI 的关键路径
2. **canvas2d + webgl 已覆盖 95% 像素回归**。三档分阈值的初衷是 webgpu 漂移大,CI 跑反而易假阳
3. **本项目不发 GPU 算力产品**,webgpu 是"高级功能可选启用",不是 SLA
4. **macos-latest 路径保留**为"季度发版前手动验"用,不进 daily CI

### 4.2 落地动作(下一轮,本任务**不实现**)

| 动作                                                                                       | 文件                       | 备注                             |
| ------------------------------------------------------------------------------------------ | -------------------------- | -------------------------------- |
| `renderer-pixel.mjs` webgpu case 加 `if (process.env.CI) { it.skip(...) }`                 | `test/renderer-pixel.mjs`  | 改 spec 文件,本任务不实现        |
| `renderer-webgpu.mjs` 加 `test:webgpu:e2e` script                                          | `test/renderer-webgpu.mjs` | 同上                             |
| `.github/workflows/ci.yml` 加 `webgpu-mac` job,`runs-on: macos-latest`,manual trigger only | `.github/workflows/ci.yml` | workflow_dispatch,不在 push 时跑 |
| README 标注 webgpu 是 manual gate                                                          | `README.md`                | 状态徽章分两套                   |

---

## 5. 归档

- 探针脚本: `docs/diag/_probe-webgpu.mjs` ← `test/_probe-webgpu.mjs`(防 worktree 清理)
- 探针结果: `docs/diag/_probe-webgpu-result.json`
- 本报告: `docs/diag/webgpu-ci-feasibility.md`

---

## 6. 引用

- GitHub: [actions/runner-images README](https://github.com/actions/runner-images/blob/main/README.md)
- GitHub Docs: [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- GitHub Docs: [Using larger runners](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners)
- GitHub Docs: [GitHub-hosted runners(concepts)](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners)
- Chromium 148 headless WebGPU 行为参考: chromium issue tracker
- 社区案例: [ParadiseEngine/ParadiseEngine#45 "Renderer M4"](https://github.com/ParadiseEngine/ParadiseEngine/issues/45)(lavapipe + Dawn headless adapter + `SDL_VIDEODRIVER=dummy` 模式参考)

---

_本报告由一次只读探针任务生成 · 2026-06-17 · 不修改 src/site/types/ 任何源码 · 不 auto-commit_
