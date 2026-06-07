# @xietuier/matrix-rain

> **czhmisaka 出品 · 数字矩阵背景 · 终端感 + 温度感**
>
> 黑客帝国式数字雨 + 5 层暗色动态背景,5 主题 4 变体,**全参数可调**。
> 零依赖,Canvas 2D + rAF,首屏 4KB JS。

[在线演示](https://matrix-rain.xietuier.ai) · [GitHub](https://github.com/xietuier/matrix-rain) · [报告 Bug](https://github.com/xietuier/matrix-rain/issues)

---

## ✨ 特性

- 🎨 **5 套主题预设**:`silicon-valley`(默认) / `matrix-green` / `lava-red` / `cyber-blue` / `pure-mono`
- 🎬 **4 种变体**:`classic`(经典残影) / `avalanche`(雪崩下落) / `ripple`(涟漪扩散) / `ascii`(ASCII 符号)
- 🎛️ **全参数可调**:字体大小、残影、字符集、色板、光心、漂移、闪烁、爆闪……**每一个魔法数字都暴露**
- 🌈 **HSL 连续调色板**:色板由 HSL 公式实时算,亮度 256+ 颗粒度平滑渐变
- 🖼️ **文字/图片目标位图**:用户输入文字或上传图片,所有数字快速变换后呈现灰度轮廓
- 🧬 **4 层用户函数驱动 (ABCD)**:D 预设 / C 手画曲线 / B 波形组合 / A 沙箱代码,每一个动态量都有 4 种描述方式
- 🎨 **5 步颜色控制**:主题参数 / 冷暖独立 / 时间旋转 / 颜色注入 / 颜色曲线
- 📦 **零依赖**:Canvas 2D 原生,4KB minified,无 React/Vue 依赖
- 🧩 **多框架兼容**:纯 JS API + 完整 TypeScript 类型,可被任何框架包装
- 🪶 **高性能**:DPR 限 2x、resize 防抖、rAF 递归,i5 单核 < 3% CPU
- ♿ **无障碍**:`prefers-reduced-motion` 自动停用
- 🔌 **生命周期完整**:`destroy / pause / resume / setTheme / getFPS` + 15+ 热更新 setter

---

## 📦 安装

```bash
npm install @xietuier/matrix-rain
# 或
pnpm add @xietuier/matrix-rain
# 或
yarn add @xietuier/matrix-rain
```

---

## 🚀 30 秒上手

### 最小用法(全默认)

```ts
import { matrixRain } from '@xietuier/matrix-rain';

const rain = matrixRain();

// 用完销毁
// rain.destroy();
```

### 完整用法(全参数示例)

```ts
import { matrixRain, themes } from '@xietuier/matrix-rain';
import '@xietuier/matrix-rain/style.css';

const rain = matrixRain({
  // 主题预设(覆盖 coldPalette + warmPalette)
  theme: 'silicon-valley',

  // 或:自定义色板(高级)
  // coldPalette: themes['lava-red']().cold,
  // warmPalette: themes['lava-red']().warm,

  // 字符网格
  fontSize: 14,                // 字符宽(px),越大越疏
  charset: '0123456789',       // 字符集

  // 残影拖尾
  trailAlpha: 0.18,            // 0.05=长拖尾,0.5=无拖尾

  // 温度光心
  lightCenter: { x: 0.7, y: 0.3 },  // 屏幕坐标比例
  driftSpeed: { x: 0.008, y: 0.006 }, // 漂移速度
  warmthRadius: 0.6,           // 光晕半径(相对视口高)
  warmthLerp: 0.04,            // 阻尼跟随(0-1)

  // 闪烁
  sparkProbability: 0.003,     // 爆闪概率

  // 变体
  variant: 'classic',          // 'avalanche' | 'ripple' | 'ascii'

  // 性能
  maxDPR: 2,                   // DPR 上限

  // DOM
  container: document.body,    // 父容器
  // canvas: existingCanvas,   // 用你自己的 canvas

  onReady(instance) {
    console.log('启动!当前 FPS:', instance.getFPS());
  }
});
```

### 主题切换

```ts
rain.setTheme('matrix-green');
rain.setTheme('lava-red');
rain.setTheme('cyber-blue');
rain.setTheme('pure-mono');
```

### 动态调参

```ts
rain.setDensity(20);                    // 调疏
rain.setPalettes(myCustomCold, myCustomWarm);  // 换色板

// 暂停/恢复
rain.pause();    // 切 tab 省电
rain.resume();
```

### 销毁

```ts
rain.destroy();  // 释放 rAF、事件、DOM
```

---

## 🎨 主题预览

| 主题名 | 风格 | 适合 |
|---|---|---|
| `silicon-valley` | 冷青 + 暖琥珀,默认 | 科技产品、AI、量化 |
| `matrix-green` | 纯黑客帝国绿 | cyberpunk、加密货币 |
| `lava-red` | 全暖红橙 | 火焰、末日、加密牛市 |
| `cyber-blue` | 冷蓝 + 暖品红 | 赛博朋克、霓虹 |
| `pure-mono` | 纯灰阶 | 低调、内容站 |

---

## 🧩 框架集成

### React

```tsx
import { useEffect, useRef } from 'react';
import { matrixRain, type MatrixRainInstance } from '@xietuier/matrix-rain';
import '@xietuier/matrix-rain/style.css';

export function MatrixRain({ theme = 'silicon-valley' }) {
  const ref = useRef<MatrixRainInstance>(null);

  useEffect(() => {
    ref.current = matrixRain({ theme });
    return () => ref.current?.destroy();
  }, [theme]);

  return null;  // Canvas 由库自动创建
}
```

### Vue 3

```vue
<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { matrixRain } from '@xietuier/matrix-rain';
import '@xietuier/matrix-rain/style.css';

const props = defineProps({ theme: { type: String, default: 'silicon-valley' } });
const instance = ref(null);

onMounted(() => {
  instance.value = matrixRain({ theme: props.theme });
});
onUnmounted(() => instance.value?.destroy());
watch(() => props.theme, t => instance.value?.setTheme(t));
</script>

<template><!-- 不需要任何 DOM --></template>
```

### 纯 HTML + CDN(jsdelivr)

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain/dist/matrix-rain.css">
</head>
<body>
  <main>你的内容</main>
  <script type="module">
    import { matrixRain } from 'https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain/dist/index.js';
    matrixRain({ theme: 'silicon-valley' });
  </script>
</body>
</html>
```

### 纯 HTML · IIFE(无需构建,直接 `<script src>`)

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/matrix-rain.css">
</head>
<body>
  <main>你的内容</main>
  <script src="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/index.iife.js"></script>
  <script>
    // window.MatrixRain 全局变量:{ matrixRain, themes, MatrixRain, ... }
    window.MatrixRain.matrixRain({ theme: 'cyber-blue' });
  </script>
</body>
</html>
```

### Web Component(`<matrix-rain>`)

零 JS,直接 HTML 标签:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/matrix-rain.css">
<script type="module" src="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/element.js"></script>

<matrix-rain theme="cyber-blue" font-size="18" charset="01"></matrix-rain>
<matrix-rain theme="matrix-green" variant="avalanche"></matrix-rain>
<matrix-rain theme="lava-red" variant="ripple"></matrix-rain>
```

观察属性:`theme` / `variant` / `font-size` / `charset` 改了即热更新。
编程 API:

```js
const el = document.querySelector('matrix-rain');
el.setAttribute('theme', 'matrix-green');  // 热更新
el.fps;                                    // 当前 FPS
el.instance;                               // 原生 MatrixRainInstance
el.destroy();                              // 销毁
```

### Next.js(App Router)

```tsx
// app/layout.tsx
import '@xietuier/matrix-rain/style.css';
import MatrixBg from '@/components/MatrixBg';

export default function RootLayout({ children }) {
  return (
    <html><body>
      <MatrixBg />
      {children}
    </body></html>
  );
}

// components/MatrixBg.tsx
'use client';
import { useEffect } from 'react';
import { matrixRain } from '@xietuier/matrix-rain';

export default function MatrixBg() {
  useEffect(() => {
    const rain = matrixRain({ theme: 'silicon-valley' });
    return () => rain.destroy();
  }, []);
  return null;
}
```

---

## ⚙️ 完整 API

### `matrixRain(options): MatrixRainInstance`

#### Options

**基础**

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `theme` | `ThemeName` | `'silicon-valley'` | 主题预设 · `silicon-valley` / `matrix-green` / `lava-red` / `cyber-blue` / `pure-mono` |
| `variant` | `VariantName` | `'classic'` | 变体 · `classic` / `avalanche` / `ripple` / `ascii` |
| `fontSize` | `number` | `14` | 字符宽(px) |
| `charset` | `string` | `'0123456789'` | 字符集 |
| `trailAlpha` | `number` | `0.18` | 残影 alpha,0.05=长拖尾 / 0.5=无拖尾 |
| `maxDPR` | `number` | `2` | DPR 上限,性能优先设 1 |
| `flickerSpeed` | `number` | `1` | 闪烁速度倍率 · 0=冻结 1=默认 3=狂暴 |

**颜色 / 调色板**

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `coldPalette` | `HSLPalette` | (theme) | 冷色板 · HSL 公式 `{h, s, lMin, lMax, aMax}` |
| `warmPalette` | `HSLPalette` | (theme) | 暖色板 · HSL 公式 |
| `lightCenter` | `{x,y}` | `{x:0.7, y:0.3}` | 温度光心位置(屏幕比例 0-1) |
| `driftSpeed` | `{x,y}` | `{x:0.008, y:0.006}` | 光心漂移速度 |
| `warmthRadius` | `number` | `0.6` | 光晕半径(相对视口高) |
| `warmthLerp` | `number` | `0.04` | 阻尼跟随(0-1),越大越紧 |
| `sparkProbability` | `number` | `0.003` | 爆闪到最亮档的概率 |
| `flickerRates` | `{high,mid,low,dark}` | `0.7/0.4/0.15/0.04` | 闪烁概率阶梯 |

**主题/变体参数覆盖**

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `themeParams` | `Partial<ThemeParams>` | (跟随主题) | 主题参数覆盖 7 字段:brightness, chroma, hueShift, saturationShift, lightnessShift, invertHue, contrast |
| `variantParams` | `Partial<VariantParams>` | (跟随变体) | 变体参数覆盖 10 字段:phaseStep, phaseJitter, sinWeightA/B/C, brightCurve, chUpdateProb, headBright, headFalloff, avalancheSpeed |
| `coldThemeParams` | `Partial<ThemeParams>` | `{hueShift:0, sat:0, brightness:1}` | 冷色板独立参数(混色前 applyTP) |
| `warmThemeParams` | `Partial<ThemeParams>` | `{hueShift:0, sat:0, brightness:1}` | 暖色板独立参数 |

**颜色动态控制**

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `hueRotateSpeed` | `number` | `0` | 时间驱动色相旋转速度(度/秒) |
| `hueRotateAmount` | `number` | `360` | 色相旋转累计量(色相最大偏移) |
| `colorOverrides` | `{[L]:[r,g,b]}` | `null` | 颜色注入点 · L=0-9 覆盖冷暖混色后的颜色 |
| `colorCurve` | `string` | `null` | 颜色动态曲线代码 · `f(t,h,s,r)→度数偏移` |

**4 层用户函数驱动 (ABCD)**

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `brightnessCurve` | `string` | `null` | 亮度曲线 · `f(t,h,s,r)→0-1` |
| `flickerCurve` | `string` | `null` | 闪烁概率 · `f(t,h,s,r)→0-1` |
| `phaseFunc` | `string` | `null` | 相位增量 · `f(t,h,s,r)→±0.05` |
| `charsetFunc` | `string` | `null` | 字符分布 · `f(t,h,s,r,ch)→int` |

**文字/图片目标位图**

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `targetBitmap` | `Float32Array` | `null` | 目标位图(文字/图片转换的灰度 0-1,长度 r×i) |
| `targetFadeIn` | `number` | `0.5` | 渐入时长(秒) |
| `targetHold` | `number` | `3.0` | 保持时长(秒)· `Infinity`=永久 |
| `targetFadeOut` | `number` | `2.0` | 渐出时长(秒) |
| `targetChaos` | `number 0-1` | `0.5` | 渐入渐出时字符混乱度 |
| `targetCols` | `number` | `0` (= grid cols) | 位图宽(列数)· 纯 `Float32Array` 时需传;`BitmapSource` 对象从 `.cols` 自动取 |
| `targetRows` | `number` | `0` (= grid rows) | 位图高(行数)· 同上 |
| `targetAnchor` | `Anchor` | `'center'` | `'topLeft'` / `'center'` / `'topRight'` / `'bottomLeft'` / `'bottomRight'` |
| `targetMotion` | `Motion` | `'static'` | `'static'` / `'drift'`(横向漂) / `'bounce'`(反弹) / `'float'`(浮动) |
| `targetMotionSpeed` | `number` | `0.3` | 运动速度(网格/秒) |

**容器 / 回调**

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `container` | `HTMLElement` | `document.body` | 父容器 |
| `canvas` | `HTMLCanvasElement` | (auto-create) | 自定义画布 |
| `onReady` | `(i) => void` | - | 启动回调 |

#### Instance

| 方法 | 签名 | 说明 |
|---|---|---|
| `destroy()` | `() => void` | 销毁实例,释放 rAF/事件/DOM |
| `pause()` | `() => void` | 暂停动画(切 tab 省电) |
| `resume()` | `() => void` | 恢复动画 |
| `getFPS()` | `() => number` | 当前 FPS(30 帧滑动平均) |
| **主题/变体/色板** | | |
| `setTheme(name, opts?)` | `(ThemeName, { keepPaletteParams?: boolean }) => void` | 切换主题(5 预设)· `keepPaletteParams:true` 保留 ctp/wtp 自定义 |
| `setThemeParams(p)` | `(Partial<ThemeParams>) => void` | 热更新主题参数 7 字段 |
| `setColdThemeParams(p)` | `(Partial<ThemeParams>) => void` | 热更新冷色板独立参数 |
| `setWarmThemeParams(p)` | `(Partial<ThemeParams>) => void` | 热更新暖色板独立参数 |
| `setHueRotate(speed, amount?)` | `(number, number?) => void` | 热更新时间驱动色相旋转 |
| `setColorOverrides(o)` | `({[L]:[r,g,b]} \| null) => void` | 热更新颜色注入点 |
| `setColorCurve(code)` | `(string \| null) => void` | 热更新颜色动态曲线 |
| `setVariantParams(p)` | `(Partial<VariantParams>) => void` | 热更新变体参数 10 字段 |
| `setFlickerSpeed(s)` | `(number) => void` | 热更新闪烁速度倍率 |
| **4 层用户函数 (ABCD)** | | |
| `setBrightnessCurve(code)` | `(string \| null) => void` | 热更新亮度曲线 |
| `setFlickerCurve(code)` | `(string \| null) => void` | 热更新闪烁曲线 |
| `setPhaseFunc(code)` | `(string \| null) => void` | 热更新相位增量函数 |
| `setCharsetFunc(code)` | `(string \| null) => void` | 热更新字符分布函数 |
| **文字/图片目标位图** | | |
| `setTargetBitmap(bmp, opts?)` | `(Float32Array \| null, {fadeIn?, hold?, fadeOut?, chaos?, anchor?, motion?, motionSpeed?}) => void` | 设置目标位图 + 状态机参数 |
| `clearTargetBitmap()` | `() => void` | 立即渐出(提前结束显示) |

---

## 🎭 主题工厂(用于自定义)

```ts
import { themes } from '@xietuier/matrix-rain';

// 拿预设 · 返回 HSLPalette { h, s, lMin, lMax, aMax }
const green = themes['matrix-green']();
console.log(green.cold);  // { h: 130, s: 0.6, lMin: 0.05, lMax: 0.95, aMax: 0.95 }

// 用预设做变体
matrixRain({ coldPalette: themes['lava-red']().cold });

// 完全自定义 HSL 调色板
matrixRain({
  coldPalette: { h: 200, s: 0.7, lMin: 0.05, lMax: 0.95, aMax: 0.95 },
  warmPalette: { h: 30,  s: 0.7, lMin: 0.1,  lMax: 0.98, aMax: 0.95 }
});
```

## 🖼️ 文字/图片目标位图

```ts
import { matrixRain, textToBitmap, imageToBitmap, fileToImage } from '@xietuier/matrix-rain';

const rain = matrixRain({
  targetBitmap: textToBitmap('HELLO', 50, 30).data,  // 文字转灰度
  targetFadeIn: 0.5,
  targetHold: 3.0,
  targetFadeOut: 2.0,
  targetChaos: 0.5
});

// 热更新 · 显示图片轮廓
const img = await fileToImage(file);
rain.setTargetBitmap(imageToBitmap(img, 50, 30).data);

// 提前结束
rain.clearTargetBitmap();
```

---

## 🛠️ 性能调优

| 场景 | 改法 |
|---|---|
| 老旧设备 | `maxDPR: 1` |
| 移动端 | `fontSize: 18` |
| 4K 屏 | `maxDPR: 1`(默认已限 2) |
| 隐藏时省电 | `document.addEventListener('visibilitychange', () => document.hidden ? rain.pause() : rain.resume())` |
| 无障碍 | CSS 已内置 `prefers-reduced-motion` 处理 |

---

## 🌐 CDN

零构建、零依赖,在任何静态页面里直接用。锁定版本号以防破坏性升级。

### jsDelivr

```html
<!-- 1. 样式 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/matrix-rain.css">

<!-- 2a. ES Module(推荐,支持 tree-shake) -->
<script type="module">
  import { matrixRain } from 'https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/index.js';
  matrixRain({ theme: 'silicon-valley' });
</script>

<!-- 2b. IIFE(全局 window.MatrixRain,免 import) -->
<script src="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/index.iife.js"></script>
<script>window.MatrixRain.matrixRain({ theme: 'cyber-blue' });</script>

<!-- 2c. Web Component(<matrix-rain> 标签) -->
<script type="module" src="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/element.js"></script>
<matrix-rain theme="matrix-green" variant="avalanche"></matrix-rain>
```

### unpkg

把 `cdn.jsdelivr.net` 换成 `unpkg.com` 即可:

```html
<link rel="stylesheet" href="https://unpkg.com/@xietuier/matrix-rain@0.1.0/dist/matrix-rain.css">
<script type="module">
  import { matrixRain } from 'https://unpkg.com/@xietuier/matrix-rain@0.1.0/dist/index.js';
</script>
```

### 子路径导入(SSR 友好)

```js
// 浏览器主包
import { matrixRain } from '@xietuier/matrix-rain';
// 浏览器:Web Component 标签
import '@xietuier/matrix-rain/element';
// 浏览器:独立 FPS 角标 overlay
import { mountFpsOverlay } from '@xietuier/matrix-rain/fps-overlay';
// 服务端:无 DOM 依赖,可在 Node/Edge/Worker 跑
import { themes, textToBitmap, PRESETS, compileUserFunction } from '@xietuier/matrix-rain/core';
```

---

## 🐛 DevTools 调试

```js
// 浏览器控制台:
// 全局调试对象
window.__matrixRainDebug.instances  // → [{id, theme, variant, fps}, ...]
window.__matrixRainDebug.count      // → 当前实例数
window.__matrixRainDebug.avgFps     // → 平均 FPS
window.__matrixRainDebug.destroyAll() // 销毁全部
```

GUI 面板见 `demo/99-debug.html`,启动即看到:

- 活跃实例 / 聚合 FPS / 创建/销毁计数 / DOM wrapper 数
- 每实例的 ID / 主题 / 变体 / 实时 FPS
- 一键新增/销毁

---

## 📐 浏览器兼容

- Chrome / Edge ≥ 90
- Firefox ≥ 88
- Safari ≥ 14
- iOS Safari ≥ 14(注:低电量模式会被降到 30fps)
- Node ≥ 18(仅 SSR 类型检查需要,运行时是纯浏览器 API)

---

## 📜 License

MIT © czhmisaka
