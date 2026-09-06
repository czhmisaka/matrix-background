# 学习笔记 · Zeabur 官网 Hero 背景动画逆向

> 逆向日期 2026-09-06 · 目标 https://zeabur.com/ · 结论可信度：高（运行时 hook 捕获到真实 shader 源码）

## 一句话结论

Zeabur 新版首页 Hero 背景 = **three.js r184 WebGPU 渲染器 + 商业 TSL 效果库（shaders.com，108 个效果）的 5 层叠加**，
主题色通过 uniform 注入（浅色暖橙 #fe4400 / 暗色紫 #7d36ec），主题切换用 CSS opacity 1.2s 缓动淡入。
官方设计复盘原话：「一片被轻微扰动的数据海——有方向性的光、一层细碎的字符点阵、一次温和的网格扭曲」。

## 侦查路径（方法比结论更值钱）

1. SSR HTML 只有静态骨架 → canvas 是 hydration 后挂载的，静态抓取看不到。
2. 全量下载 62 个 chunk 后 grep `void main` 只找到 three.js 引擎代码 → 效果 GLSL/WGSL 是 TSL 在**运行时**从 JS 节点图拼出来的，源码里没有完整 shader 字符串。
3. buildManifest（`/_next/static/<buildId>/_buildManifest.js`）补齐懒加载 chunk，仍无原生 GLSL。
4. **决定性手段：Playwright 打开真实页面 + `addInitScript` hook `WebGL2RenderingContext.prototype.shaderSource`**，
   把 three.js 编译时的完整 fragment shader 原样截获（`GPUDevice.createShaderModule` 的 WGSL hook 没命中——
   headless 里 three WebGPU backend 回退到了 WebGL2 路径，`data-engine="three.js r184 webgpu"` 只是引擎标识）。

## 5 层结构（从底到顶）

证据：合成 fragment shader 的 uniform 命名 `xxx__r_N_`（N=图层号）与 DOM 嵌套 `data-shader-id` 一一对应。

| 层        | 效果（shaders.com 注册名） | 关键 uniform                                                      | 作用                                                                                                          |
| --------- | -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| r_1（底） | `Grid`                     | gridSize                                                          | 网格线：把下层 UV 吸附到格心采样，形成格线                                                                    |
| r_2       | `Ascii`                    | gamma, spacing, alphaThreshold, preserveAlpha                     | **字符点阵**：按下层亮度经 gamma 量化，从字体 atlas 选字符绘制——「细碎的字符点阵」                            |
| r_3       | `FlowingGradient`          | detail, colorA, colorB, blend                                     | **数据海**：3 个八度 sin/cos 域扭曲的双色流动渐变 + `sin(t*2.5+noise*8)*0.015+1` 呼吸明暗——「温和的网格扭曲」 |
| r_4       | `Godrays`                  | rayColor, center, density, intensity, spotty                      | **方向性光**：极坐标 atan 角度做 value-noise，4 个尺度相乘成放射光束，水平 smoothstep 渐隐                    |
| r_5（顶） | `SineWave`                 | color, thickness, softness, position, angle, frequency, amplitude | 一条带厚度的正弦波浪线（装饰）                                                                                |

### 合成方式

- 全部 over 混合（premultiplied alpha），每层带独立 opacity uniform。
- r_3/r_4/r_5 在一个 fragment shader 里顺序合成（见 `hero-composed-fragment.glsl` 末尾三次 `mix`）；
  r_1/r_2 是独立 pass，各采样下层纹理（见 `hero-grid-layer.glsl` / `hero-ascii-layer.glsl`）。

### 几个可以直接抄的 GLSL 技巧

1. **域扭曲流动渐变**（数据海的核心）：
   ```glsl
   vec2 p = uv + vec2(
     sin(uv.y * detail * 1.7 + t * 0.8) * 0.12 + cos(uv.x * detail * 0.9 - t * 0.5) * 0.05,
     cos(uv.x * detail * 1.3 - t * 0.6) * 0.12 + sin(uv.y * detail * 1.1 + t * 0.7) * 0.05);
   // 再叠 2 个更细的八度, 幅度 0.07/0.04 → 0.04/0.02
   float n = 0.45*sin(...) + 0.35*cos(...) + 0.2*sin(...);
   float m = smoothstep(0.3, 0.7, n * 0.5 + 0.5 + (blend - 50.0) * 0.006);
   color = mix(colorA, colorB, m);
   ```
2. **极坐标放射光束**（Godrays）：`angle = atan(y, x)`，`vec2 grid = vec2(angle * freq, r * scale - t * 0.2)`，
   4 组不同 freq/scale 的 value-noise（`fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453)`）相乘，
   密度互质让光束粗细不均，最后乘 `smoothstep(-0.15, 0.15, x)` 做水平渐隐。
3. **Ascii 字符化**：`charIndex = floor((1 - pow(luminance, gamma)) * levels)`，
   atlas UV = `vec2(mod(charIndex, cols), floor(charIndex / cols)) * cellUV + cell 内偏移`，
   cell 内再除以 spacing 留边，亮度 < 0.1 或出界直接 alpha=0。
4. **主题淡入**：canvas 外层 div `opacity: 0.9; transition: opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1)`，
   切主题时先淡出换 uniform 再淡入，不做硬切。
5. **性能监控内建**：该库在渲染循环里用 `performance.measure("shader-gpu-time")` + timestamp query 记录帧间隔/内存快照。

## 对 @xietuier/matrix-rain 的落地

### 已落地：`zeabur` 主题（src/themes.ts）

- warm 板 = 橙 `h:20 s:0.9`（亮色品牌色 #fe4400），cold 板 = 紫 `h:262 s:0.62`（暗色品牌色 #7d36ec）。
- 同步更新：`types/index.d.ts` ThemeName、`test/themes.mjs`、`test/unit/themes/themes.spec.ts` 的主题清单。

### 建议后续（未实施）

1. **webgl-shaders.ts 增加背景层**：现在 webgl 渲染器只有字符 instance + 拖尾，可以加一个全屏 quad 的
   「flowing-gradient + godrays」背景 pass（上面技巧 1/2 的 GLSL 可直接移植），字符层叠其上。
2. **字符位置的域扭曲**：engine 生成 aPos 后加一个低频 sin/cos 扰动（幅度 ~0.5 cell），就能得到
   zeabur 那种「被轻微扰动的数据海」的字符场，成本近似为零。
3. **slow drift**：zeabur 2 秒内像素 diff≈0——动画极慢是刻意设计。我们的 flickerSpeed 默认偏快，
   做官网 Hero 时建议 speed 0.2~0.4，营造「沉静的基础设施感」。
4. **主题切换淡入淡出**：matrix-rain.css 加 `transition: opacity 1.2s cubic-bezier(0.16,1,0.3,1)`。

## 证据文件

- `docs/study-zeabur/hero-composed-fragment.glsl` — 运行时截获的 5 层合成 fragment shader（15.7KB）
- `docs/study-zeabur/hero-ascii-layer.glsl` — Ascii 字符点阵层（含字符 atlas 采样逻辑）
- `docs/study-zeabur/hero-grid-layer.glsl` — Grid 网格层
- 官方设计复盘：https://zeabur.com/zh-CN/changelogs/landing-reland
