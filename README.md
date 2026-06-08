# @xietuier/matrix-rain

> **czhmisaka 出品 · 数字矩阵背景 · 终端感 + 温度感**
>
> 黑客帝国式数字雨 + 5 层暗色动态背景,5 主题 4 变体,**全参数可调**。
> 零依赖,Canvas 2D + rAF,首屏 4KB JS。

[![npm version](https://img.shields.io/npm/v/@xietuier/matrix-rain.svg)](https://www.npmjs.com/package/@xietuier/matrix-rain)
[![npm downloads](https://img.shields.io/npm/dm/@xietuier/matrix-rain.svg)](https://www.npmjs.com/package/@xietuier/matrix-rain)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@xietuier/matrix-rain)](https://bundlephobia.com/package/@xietuier/matrix-rain)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![types: TypeScript](https://img.shields.io/badge/types-TypeScript-blue.svg)](./types/index.d.ts)

[在线演示](https://matrix-rain.xietuier.ai) · [GitHub](https://github.com/xietuier/matrix-rain) · [报告 Bug](https://github.com/xietuier/matrix-rain/issues)

---

## ✨ 特性

- 🎨 **5 套主题预设**:`silicon-valley`(默认) / `matrix-green` / `lava-red` / `cyber-blue` / `pure-mono`
- 🎬 **4 种变体**:`classic`(经典残影) / `avalanche`(雪崩下落) / `ripple`(涟漪扩散) / `ascii`(ASCII 符号)
- 🎛️ **全参数可调**:字体大小、残影、字符集、色板、光心、漂移、闪烁、爆闪……**每一个魔法数字都暴露**
- 🌈 **HSL 连续调色板**:色板由 HSL 公式实时算,亮度 256+ 颗粒度平滑渐变
- 🖼️ **文字/图片目标位图**:用户输入文字或上传图片,所有数字快速变换后呈现灰度轮廓
- 🌌 **图像"噪声 → 收敛"涌现动画**:上传图片后,5 段状态机(noise → converge → hold → dissolve)让数字雨从全屏噪点逐渐锁定为图像轮廓
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
  fontSize: 14, // 字符宽(px),越大越疏
  charset: '0123456789', // 字符集

  // 残影拖尾
  trailAlpha: 0.18, // 0.05=长拖尾,0.5=无拖尾

  // 温度光心
  lightCenter: { x: 0.7, y: 0.3 }, // 屏幕坐标比例
  driftSpeed: { x: 0.008, y: 0.006 }, // 漂移速度
  warmthRadius: 0.6, // 光晕半径(相对视口高)
  warmthLerp: 0.04, // 阻尼跟随(0-1)

  // 闪烁
  sparkProbability: 0.003, // 爆闪概率

  // 变体
  variant: 'classic', // 'avalanche' | 'ripple' | 'ascii'

  // 性能
  maxDPR: 2, // DPR 上限

  // DOM
  container: document.body, // 父容器
  // canvas: existingCanvas,   // 用你自己的 canvas

  onReady(instance) {
    console.log('启动!当前 FPS:', instance.getFPS());
  },
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
rain.setDensity(20); // 调疏
rain.setPalettes(myCustomCold, myCustomWarm); // 换色板

// 暂停/恢复
rain.pause(); // 切 tab 省电
rain.resume();
```

### 销毁

```ts
rain.destroy(); // 释放 rAF、事件、DOM
```

### 静态工具 · `MatrixRain` 命名空间

页面级批量管理(路由切换、SPA 卸载、HMR 兜底):

```ts
import { MatrixRain } from '@xietuier/matrix-rain';

// 销毁全部活跃实例
const n = MatrixRain.destroyAll();

// 只销毁指定容器内的实例
MatrixRain.destroyAll(document.getElementById('modal'));

// 当前活跃实例数(调试 / 性能监控)
console.log(MatrixRain.activeCount);
```

`MatrixRain.destroyAll()` 走 DOM `.matrix-rain-wrapper` 反查,即使丢了实例引用也能兜底停掉 rAF。

---

## 🧬 4 层动态量模型(ABCD)

每一个动态量(亮度 / 闪烁 / 相位 / 字符 / 颜色)都有 **4 种描述方式**,从最简单到最自由:

```
┌────────────────────────────────────────────────────────────────┐
│  D  预设 (Presets)        一键加载 · 8 个内置                   │
│     │  点击 → 自动填到 A 层文本框                              │
│     ▼                                                          │
│  C  控制点 LUT            16 个滑块拖动 · 64 步采样 → 查找表      │
│     │  拖动 / 调值 → 生成 JS 代码                              │
│     ▼                                                          │
│  B  波形组合 (Waves)      3 个 channel × 6 基波 × 4 算符         │
│     │  sin*0.5 + square*0.3 + noise*0.2                       │
│     ▼                                                          │
│  A  沙箱代码 (Sandbox)    自由 JS 表达式 · 黑名单 + 步数限制     │
│     │  return 0.5 + 0.5 * sin(t * 3)                          │
│     ▼                                                          │
│  ─────────────► 引擎逐帧调用 (60Hz · t∈[0,∞))                  │
└────────────────────────────────────────────────────────────────┘
```

| 层         | 模块                | 适合       | 例子                                                          |
| ---------- | ------------------- | ---------- | ------------------------------------------------------------- |
| **D** 预设 | `curves/presets.ts` | 一键出效果 | `linear` / `easeIn` / `pulse` / `heartbeat` / `chaos` 共 8 个 |
| **C** LUT  | `curves/lut.ts`     | 设计师手画 | 拖 16 控制点,自动生成线性采样表                               |
| **B** 波形 | `curves/waves.ts`   | 数据驱动   | `[sin*0.5, square*0.3, noise*0.2]` + `combine: sum`           |
| **A** 沙箱 | `curves/sandbox.ts` | 自由表达   | `ease.outBack(t % 1) * noise(t * 4)`                          |

**4 个动态量共享同一 4 层模型:**

- 亮度曲线 `brightnessCurve` — 头部亮度的时序形状
- 闪烁曲线 `flickerCurve` — 闪烁概率的时序形状
- 相位函数 `phaseFunc` — 每个字符相位推进速度
- 字符函数 `charsetFunc` — 当前字符索引
- 颜色曲线 `colorCurve` — HSL 色相时序偏移

> **冷暖独立 + 注入点 + 时间旋转** = 颜色这条 4 层模型之外的额外控制(见上文"颜色动态控制"表)。

**5 个沙箱变量 + 9 个沙箱函数**(都可在 A 层自由组合):

| 类别   | 名称              | 类型     | 用途                                                                                  |
| ------ | ----------------- | -------- | ------------------------------------------------------------------------------------- |
| 上下文 | `t`               | `number` | 全局时间(秒)                                                                          |
| 上下文 | `phase`           | `number` | 当前字符相位(0-1)                                                                     |
| 上下文 | `h, s, r, f`      | `number` | 行/列/亮度/闪烁                                                                       |
| 上下文 | `W, H, L, ch`     | `number` | 网格宽/高/层级/字符索引                                                               |
| 工具   | `sin / cos / tan` | `fn`     | 三角函数                                                                              |
| 工具   | `noise(x)`        | `fn`     | 哈希确定性噪声(可调种子)                                                              |
| 工具   | `clamp / lerp`    | `fn`     | 限幅 / 线性插值                                                                       |
| 工具   | `ease.*`          | `obj`    | 13 种缓动:`inQuad` / `outCubic` / `inOutSine` / `outBack` / `inOutExpo` / `outCirc` … |
| 常量   | `PI / E`          | `number` | 数学常量                                                                              |

**安全保证**(防 XSS / 死循环):

- 词级黑名单:`window` / `document` / `eval` / `fetch` / `setTimeout` / `Proxy` / `import` 等 50+ 关键词
- 白名单全局:`Math` / `Number` / `String` / `Boolean` / `Array` 冻结对象,只暴露安全方法
- 步数上限 10000 · 字符串上限 5KB · 返回值必须 `string | number`
- 编译失败静默 fallback,运行期不抛

---

## 🎨 主题预览

| 主题名           | 风格               | 适合                 |
| ---------------- | ------------------ | -------------------- |
| `silicon-valley` | 冷青 + 暖琥珀,默认 | 科技产品、AI、量化   |
| `matrix-green`   | 纯黑客帝国绿       | cyberpunk、加密货币  |
| `lava-red`       | 全暖红橙           | 火焰、末日、加密牛市 |
| `cyber-blue`     | 冷蓝 + 暖品红      | 赛博朋克、霓虹       |
| `pure-mono`      | 纯灰阶             | 低调、内容站         |

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

  return null; // Canvas 由库自动创建
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
watch(
  () => props.theme,
  (t) => instance.value?.setTheme(t)
);
</script>

<template><!-- 不需要任何 DOM --></template>
```

### 纯 HTML + CDN(jsdelivr)

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain/dist/matrix-rain.css" />
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
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/matrix-rain.css" />
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
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/matrix-rain.css" />
<script type="module" src="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/element.js"></script>

<matrix-rain theme="cyber-blue" font-size="18" charset="01"></matrix-rain>
<matrix-rain theme="matrix-green" variant="avalanche"></matrix-rain>
<matrix-rain theme="lava-red" variant="ripple"></matrix-rain>
```

观察属性:`theme` / `variant` / `font-size` / `charset` 改了即热更新。
编程 API:

```js
const el = document.querySelector('matrix-rain');
el.setAttribute('theme', 'matrix-green'); // 热更新
el.fps; // 当前 FPS
el.instance; // 原生 MatrixRainInstance
el.destroy(); // 销毁
```

### Next.js(App Router)

```tsx
// app/layout.tsx
import '@xietuier/matrix-rain/style.css';
import MatrixBg from '@/components/MatrixBg';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <MatrixBg />
        {children}
      </body>
    </html>
  );
}

// components/MatrixBg.tsx
('use client');
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

| 字段           | 类型               | 默认               | 说明                                                                                   |
| -------------- | ------------------ | ------------------ | -------------------------------------------------------------------------------------- |
| `theme`        | `ThemeName`        | `'silicon-valley'` | 主题预设 · `silicon-valley` / `matrix-green` / `lava-red` / `cyber-blue` / `pure-mono` |
| `variant`      | `VariantName`      | `'classic'`        | 变体 · `classic` / `avalanche` / `ripple` / `ascii`                                    |
| `fontSize`     | `number`           | `14`               | 字符宽(px)                                                                             |
| `charset`      | `string`           | `'0123456789'`     | 字符集                                                                                 |
| `trailAlpha`   | `number`           | `0.18`             | 残影 alpha,0.05=长拖尾 / 0.5=无拖尾                                                    |
| `maxDPR`       | `number`           | `2`                | DPR 上限,性能优先设 1                                                                  |
| `renderScale`  | `number \| 'auto'` | `1`                | 局部子格渲染倍率(0.3.0+)· 详见[§动态分辨率 / 局部子格](#动态分辨率--局部子格)          |
| `flickerSpeed` | `number`           | `1`                | 闪烁速度倍率 · 0=冻结 1=默认 3=狂暴                                                    |

**颜色 / 调色板**

| 字段               | 类型                  | 默认                 | 说明                                         |
| ------------------ | --------------------- | -------------------- | -------------------------------------------- |
| `coldPalette`      | `HSLPalette`          | (theme)              | 冷色板 · HSL 公式 `{h, s, lMin, lMax, aMax}` |
| `warmPalette`      | `HSLPalette`          | (theme)              | 暖色板 · HSL 公式                            |
| `lightCenter`      | `{x,y}`               | `{x:0.7, y:0.3}`     | 温度光心位置(屏幕比例 0-1)                   |
| `driftSpeed`       | `{x,y}`               | `{x:0.008, y:0.006}` | 光心漂移速度                                 |
| `warmthRadius`     | `number`              | `0.6`                | 光晕半径(相对视口高)                         |
| `warmthLerp`       | `number`              | `0.04`               | 阻尼跟随(0-1),越大越紧                       |
| `sparkProbability` | `number`              | `0.003`              | 爆闪到最亮档的概率                           |
| `flickerRates`     | `{high,mid,low,dark}` | `0.7/0.4/0.15/0.04`  | 闪烁概率阶梯                                 |

**主题/变体参数覆盖**

| 字段              | 类型                     | 默认                                | 说明                                                                                                                            |
| ----------------- | ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `themeParams`     | `Partial<ThemeParams>`   | (跟随主题)                          | 主题参数覆盖 7 字段:brightness, chroma, hueShift, saturationShift, lightnessShift, invertHue, contrast                          |
| `variantParams`   | `Partial<VariantParams>` | (跟随变体)                          | 变体参数覆盖 10 字段:phaseStep, phaseJitter, sinWeightA/B/C, brightCurve, chUpdateProb, headBright, headFalloff, avalancheSpeed |
| `coldThemeParams` | `Partial<ThemeParams>`   | `{hueShift:0, sat:0, brightness:1}` | 冷色板独立参数(混色前 applyTP)                                                                                                  |
| `warmThemeParams` | `Partial<ThemeParams>`   | `{hueShift:0, sat:0, brightness:1}` | 暖色板独立参数                                                                                                                  |

**颜色动态控制**

| 字段              | 类型            | 默认   | 说明                                     |
| ----------------- | --------------- | ------ | ---------------------------------------- |
| `hueRotateSpeed`  | `number`        | `0`    | 时间驱动色相旋转速度(度/秒)              |
| `hueRotateAmount` | `number`        | `360`  | 色相旋转累计量(色相最大偏移)             |
| `colorOverrides`  | `{[L]:[r,g,b]}` | `null` | 颜色注入点 · L=0-9 覆盖冷暖混色后的颜色  |
| `colorCurve`      | `string`        | `null` | 颜色动态曲线代码 · `f(t,h,s,r)→度数偏移` |

**4 层用户函数驱动 (ABCD)**

| 字段              | 类型     | 默认   | 说明                           |
| ----------------- | -------- | ------ | ------------------------------ |
| `brightnessCurve` | `string` | `null` | 亮度曲线 · `f(t,h,s,r)→0-1`    |
| `flickerCurve`    | `string` | `null` | 闪烁概率 · `f(t,h,s,r)→0-1`    |
| `phaseFunc`       | `string` | `null` | 相位增量 · `f(t,h,s,r)→±0.05`  |
| `charsetFunc`     | `string` | `null` | 字符分布 · `f(t,h,s,r,ch)→int` |

**文字/图片目标位图**

| 字段                | 类型           | 默认              | 说明                                                                        |
| ------------------- | -------------- | ----------------- | --------------------------------------------------------------------------- |
| `targetBitmap`      | `Float32Array` | `null`            | 目标位图(文字/图片转换的灰度 0-1,长度 r×i)                                  |
| `targetFadeIn`      | `number`       | `0.5`             | 渐入时长(秒)                                                                |
| `targetHold`        | `number`       | `3.0`             | 保持时长(秒)· `Infinity`=永久                                               |
| `targetFadeOut`     | `number`       | `2.0`             | 渐出时长(秒)                                                                |
| `targetChaos`       | `number 0-1`   | `0.5`             | 渐入渐出时字符混乱度                                                        |
| `targetCols`        | `number`       | `0` (= grid cols) | 位图宽(列数)· 纯 `Float32Array` 时需传;`BitmapSource` 对象从 `.cols` 自动取 |
| `targetRows`        | `number`       | `0` (= grid rows) | 位图高(行数)· 同上                                                          |
| `targetAnchor`      | `Anchor`       | `'center'`        | `'topLeft'` / `'center'` / `'topRight'` / `'bottomLeft'` / `'bottomRight'`  |
| `targetMotion`      | `Motion`       | `'static'`        | `'static'` / `'drift'`(横向漂) / `'bounce'`(反弹) / `'float'`(浮动)         |
| `targetMotionSpeed` | `number`       | `0.3`             | 运动速度(网格/秒)                                                           |

**容器 / 回调**

| 字段        | 类型                | 默认            | 说明       |
| ----------- | ------------------- | --------------- | ---------- |
| `container` | `HTMLElement`       | `document.body` | 父容器     |
| `canvas`    | `HTMLCanvasElement` | (auto-create)   | 自定义画布 |
| `onReady`   | `(i) => void`       | -               | 启动回调   |

#### Instance

| 方法                           | 签名                                                                                                 | 说明                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `destroy()`                    | `() => void`                                                                                         | 销毁实例,释放 rAF/事件/DOM                                     |
| `pause()`                      | `() => void`                                                                                         | 暂停动画(切 tab 省电)                                          |
| `resume()`                     | `() => void`                                                                                         | 恢复动画                                                       |
| `getFPS()`                     | `() => number`                                                                                       | 当前 FPS(30 帧滑动平均)                                        |
| **主题/变体/色板**             |                                                                                                      |                                                                |
| `setTheme(name, opts?)`        | `(ThemeName, { keepPaletteParams?: boolean }) => void`                                               | 切换主题(5 预设)· `keepPaletteParams:true` 保留 ctp/wtp 自定义 |
| `setThemeParams(p)`            | `(Partial<ThemeParams>) => void`                                                                     | 热更新主题参数 7 字段                                          |
| `setColdThemeParams(p)`        | `(Partial<ThemeParams>) => void`                                                                     | 热更新冷色板独立参数                                           |
| `setWarmThemeParams(p)`        | `(Partial<ThemeParams>) => void`                                                                     | 热更新暖色板独立参数                                           |
| `setHueRotate(speed, amount?)` | `(number, number?) => void`                                                                          | 热更新时间驱动色相旋转                                         |
| `setColorOverrides(o)`         | `({[L]:[r,g,b]} \| null) => void`                                                                    | 热更新颜色注入点                                               |
| `setColorCurve(code)`          | `(string \| null) => void`                                                                           | 热更新颜色动态曲线                                             |
| `setVariantParams(p)`          | `(Partial<VariantParams>) => void`                                                                   | 热更新变体参数 10 字段                                         |
| `setFlickerSpeed(s)`           | `(number) => void`                                                                                   | 热更新闪烁速度倍率                                             |
| **4 层用户函数 (ABCD)**        |                                                                                                      |                                                                |
| `setBrightnessCurve(code)`     | `(string \| null) => void`                                                                           | 热更新亮度曲线                                                 |
| `setFlickerCurve(code)`        | `(string \| null) => void`                                                                           | 热更新闪烁曲线                                                 |
| `setPhaseFunc(code)`           | `(string \| null) => void`                                                                           | 热更新相位增量函数                                             |
| `setCharsetFunc(code)`         | `(string \| null) => void`                                                                           | 热更新字符分布函数                                             |
| **文字/图片目标位图**          |                                                                                                      |                                                                |
| `setTargetBitmap(bmp, opts?)`  | `(Float32Array \| null, {fadeIn?, hold?, fadeOut?, chaos?, anchor?, motion?, motionSpeed?}) => void` | 设置目标位图 + 状态机参数                                      |
| `clearTargetBitmap()`          | `() => void`                                                                                         | 立即渐出(提前结束显示)                                         |

---

## 🎭 主题工厂(用于自定义)

```ts
import { themes } from '@xietuier/matrix-rain';

// 拿预设 · 返回 HSLPalette { h, s, lMin, lMax, aMax }
const green = themes['matrix-green']();
console.log(green.cold); // { h: 130, s: 0.6, lMin: 0.05, lMax: 0.95, aMax: 0.95 }

// 用预设做变体
matrixRain({ coldPalette: themes['lava-red']().cold });

// 完全自定义 HSL 调色板
matrixRain({
  coldPalette: { h: 200, s: 0.7, lMin: 0.05, lMax: 0.95, aMax: 0.95 },
  warmPalette: { h: 30, s: 0.7, lMin: 0.1, lMax: 0.98, aMax: 0.95 },
});
```

## 🖼️ 文字/图片目标位图

```ts
import { matrixRain, textToBitmap, imageToBitmap, fileToImage } from '@xietuier/matrix-rain';

const rain = matrixRain({
  targetBitmap: textToBitmap('HELLO', 50, 30).data, // 文字转灰度
  targetFadeIn: 0.5,
  targetHold: 3.0,
  targetFadeOut: 2.0,
  targetChaos: 0.5,
});

// 热更新 · 显示图片轮廓
const img = await fileToImage(file);
rain.setTargetBitmap(imageToBitmap(img, 50, 30).data);

// 提前结束
rain.clearTargetBitmap();
```

### 🈶 `textToBitmap` 文字渲染:任意字体 + CJK 全角识别

`textToBitmap` 第 6 个参数 `options` 支持自定义字体和 CJK 字符宽度识别:

```ts
textToBitmap(
  text: string,
  cols: number,
  rows: number,
  _gridCharPx?: number,
  fitMode?: 'contain' | 'cover' | 'actual' | 'auto',  // 默认 'contain'
  options?: {
    font?: string;                                    // CSS font-family
    fontWeight?: number | 'normal' | 'bold' | ...;    // CSS font-weight
    cjkAware?: boolean;                               // 是否启用 CJK 全角识别
  }
): { cols, rows, data: Float32Array };
```

| 选项                 | 默认值                                      | 说明                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options.font`       | `'JetBrains Mono, ui-monospace, monospace'` | 任意 CSS font-family。系统字体(serif / sans-serif / monospace)、自托管字体(Inter / Fraunces)、Google Fonts 全部支持。字符串列表自动 fallback:`'"Source Han Sans CN", "PingFang SC", "Microsoft YaHei", sans-serif'` |
| `options.fontWeight` | `'bold'` (700)                              | 接受 100-900 数字或 `'normal'` / `'bold'` / `'lighter'` / `'bolder'`                                                                                                                                                |
| `options.cjkAware`   | `true`                                      | 启用后自动检测 CJK 字符(汉字 / 平假名 / 片假名 / 韩文 / 全角符号),按 1.0×fontSize 宽计算;Latin 按 0.6×fontSize;混合文本按权重加权。`false` 时全部按 0.6×fontSize(旧版行为)                                          |

**典型场景**:

```ts
// 1. 中英文混合标题 · 系统 CJK 字体
const bm = textToBitmap('Hello · 你好世界', 60, 20, undefined, 'contain', {
  font: '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif',
  fontWeight: 600,
});
rain.setTargetBitmap(bm, { phase: 'noise-converge' });

// 2. 衬线大标题 · Fraunces italic
const bm2 = textToBitmap('MATRIX', 80, 30, undefined, 'cover', {
  font: 'Fraunces, Georgia, serif',
  fontWeight: 700,
});

// 3. 纯数字 ASCII · 关闭 CJK 识别提速(避免 measureText 走 CJK regex 分支)
const bm3 = textToBitmap('0123456789', 100, 20, undefined, 'contain', {
  font: '"JetBrains Mono", monospace',
  cjkAware: false,
});
```

**CJK 字符识别范围**(共 8 个 Unicode 区段,覆盖全部常用 CJK + 韩文 + 日文假名 + 全角符号):

| 范围        | 名称                             |
| ----------- | -------------------------------- |
| U+3000-303F | CJK Symbols and Punctuation      |
| U+3040-309F | Hiragana(平假名)                 |
| U+30A0-30FF | Katakana(片假名)                 |
| U+3400-4DBF | CJK Extension A                  |
| U+4E00-9FFF | CJK Unified Ideographs(基本汉字) |
| U+AC00-D7AF | Hangul Syllables(韩文)           |
| U+F900-FAFF | CJK Compatibility Ideographs     |
| U+FF00-FFEF | Halfwidth and Fullwidth Forms    |

不含 emoji(避免误判装饰 emoji);不含 SMP 扩展(罕用 CJK Ext B-G,需要时手动传 `cjkAware: false`)。

### 🌌 图像"噪声 → 收敛"涌现动画

把图片上传/拖入,引擎先用全屏噪点覆盖网格,然后逐 cell 锁定为图片轮廓,5 段状态机跑完整段:

```
idle → noise(全屏噪点) → converge(逐 cell 锁定) → hold(完整呈现) → dissolve(反向融化)
```

```ts
import { matrixRain, imageToBitmap, fileToImage } from '@xietuier/matrix-rain';

const rain = matrixRain({ theme: 'silicon-valley' });

// 1. 读用户上传
const file = input.files[0];
const img = await fileToImage(file);

// 2. 图片 → 灰度位图
const cols = Math.floor(canvas.width / 14);
const rows = Math.floor(canvas.height / 14);
const bitmap = imageToBitmap(img, cols, rows, 'contain');

// 3. noise → converge → hold
rain.setTargetBitmap(bitmap, {
  phase: 'noise-converge',
  noiseDuration: 0.5, // 全屏噪点 0.5s
  convergeDuration: 1.5, // 逐 cell 锁定 1.5s
  noiseFadeInDuration: 0.3, // noise 阶段开头渐入
  lockOrder: 'random', // 7 种顺序:random / topdown / bottomup / center / edge / leftright / rightleft
  lockStability: 0.85, // 锁定后字符稳定性(0-1,1 = 字符完全不变)
  hold: Infinity, // 持续显示
  fadeOut: 2.0, // 2s 反向解锁融化
  anchor: 'center',
});
```

完整 Demo 见 [`/demos/image-converge`](https://matrix-rain.xietuier.ai/demos/image-converge) — 拖入图片、4 个内置预设、3 个滑块调参。

---

## 🔍 动态分辨率 / 局部子格(0.3.0+)

**问题**: 文字/图片位图(`textToBitmap` / `imageToBitmap`)的精度被网格密度锁死,想"字形更锐"只能调小 `fontSize` —— 但这同时缩小显示尺寸、改变雨滴密度,副作用大。

**方案**: 类似"脏渲染" —— 启用 `renderScale` 后,**仅位图覆盖区**按倍率画子格(父格被拆成 `renderScale²` 个子格),位图区外 0 额外开销。雨滴密度不变,文字/图片边缘锐度肉眼可辨地提升。

### 用法

```ts
import { matrixRain } from '@xietuier/matrix-rain';

// 1) 显式倍率 2x(位图激活时,区内每个父格画 4 个子格)
const rain = matrixRain({ renderScale: 2 });
rain.setTargetBitmap(myBitmap, { phase: 'noise-converge', hold: Infinity });

// 2) 自动模式(等价于 2,位图未激活时回到 1)
const rain2 = matrixRain({ renderScale: 'auto' });
// 位图未激活时:rain2.getRenderScale() === 1
// 位图激活时:rain2.getRenderScale() === 2

// 3) 热更新
rain.setRenderScale(3); // 立即生效,不重建
rain.setRenderScale('auto');
rain.getRenderScale(); // 读取 effective 数值
```

### 关键特性

| 取值       | 行为                            | 性能                 |
| ---------- | ------------------------------- | -------------------- |
| `1` (默认) | 100% 等价于无此选项             | 0 额外开销           |
| `2`        | 位图区每父格画 4 个子格         | ~1.7x fillText/帧    |
| `3`        | 9 个子格/父格                   | ~2.5x                |
| `4`        | 16 个子格/父格                  | ~4.5x,建议短时演示   |
| `8`+       | 几何极限                        | 性能急剧下降         |
| `'auto'`   | 等价于 `2`,位图未激活时回到 `1` | 同 `2`(但仅在激活时) |

**热更新**:`setRenderScale(s)` 不触发 `buildGrid`(基础网格 r/i 不变),只影响后续帧的子格路径。`getRenderScale()` 立即反映新值。

**Web Component**: `<matrix-rain render-scale="2">` / `render-scale="auto"`(不重建,同 `font-size` 走 `setDensity` 模式)。

### 输入钳位

| 输入                       | 钳位后         |
| -------------------------- | -------------- |
| `setRenderScale(0.5)`      | `1`            |
| `setRenderScale(-2)`       | `1`            |
| `setRenderScale(NaN)`      | `1`            |
| `setRenderScale(2.7)`      | `2`(向下取整)  |
| `setRenderScale(Infinity)` | `16`(上限)     |
| `setRenderScale(100)`      | `16`           |
| `setRenderScale('auto')`   | `'auto'`(透传) |

### 变体差异

| 变体        | 子格支持              | 说明                                                |
| ----------- | --------------------- | --------------------------------------------------- |
| `classic`   | ✅ 完整               | 横向 + 纵向都锐化                                   |
| `ascii`     | ✅ 完整(同 `classic`) | 同上                                                |
| `avalanche` | ⚠️ 仅横向             | 头亮 trail 按行对齐,子格只在列方向生效;纵向密度不变 |
| `ripple`    | ✅ 完整               | 横向 + 纵向都锐化                                   |

### 与 `textToBitmap` / `imageToBitmap` 协同

要获得最佳效果,生成位图时按**当前网格大小**调 `cols` / `rows`:

```ts
// 方案 1:用 state.r / state.i(实例启动后)
const cols = rain.getOptions().maxDPR ? Math.floor(800 / rain.getOptions().fontSize) : 80;
const bm = textToBitmap('HELLO', cols, rows);

// 方案 2:用固定值(简化)
const bm = textToBitmap('HELLO', 80, 30); // 1x 网格大小
rain.setTargetBitmap(bm, { ... }); // 引擎自动映射,2x 时 1px → 4 sub-cells
```

> 即使 `bm` 的 `cols`/`rows` 与网格 `state.r`/`state.i` 不匹配,引擎也会按位图→网格 1:1 映射(`applyTargetBitmapPhase` 内 `bx = (isSub ? floor(h/eff) : h) - ox`)。

### 为什么不直接用更小的 `fontSize`?

| 维度     | `fontSize=14` + `renderScale=1` | `fontSize=7` + `renderScale=1` | `fontSize=14` + `renderScale=2`(位图区) |
| -------- | ------------------------------- | ------------------------------ | --------------------------------------- |
| 雨滴密度 | 1x                              | 2x(更密)                       | 1x(不变)                                |
| 位图锐度 | 1x                              | 2x                             | 2x(等价)                                |
| 区外开销 | 1x                              | 4x                             | 1x                                      |
| 区外锐度 | 1x                              | 2x                             | 1x                                      |

`renderScale` 是**局部的**:只在位图区升档,不影响区外。

---

## 🎬 路由切换淡入淡出 · `setTransitionAlpha(alpha, dur?)`

SPA 路由切换时,优雅地把实例从全不透明软淡到全透明(或反过来),**不影响性能** —— alpha 在 LUT 输出端相乘,无额外 LUT 重建。

```ts
rain.setTransitionAlpha(0, 0.3); // 0.3 秒内淡出到完全透明
await new Promise((r) => setTimeout(r, 300));
rain.destroy(); // 路由离开时,先淡出再销毁

// 新路由的实例淡入
const next = matrixRain({ theme: 'cyber-blue' });
next.setTransitionAlpha(0); // 初始化 alpha=0
requestAnimationFrame(
  () => next.setTransitionAlpha(1, 0.3) // 0.3 秒淡入到完全不透明
);
```

| 参数    | 类型          | 默认       | 说明                                                       |
| ------- | ------------- | ---------- | ---------------------------------------------------------- |
| `alpha` | `number 0-1`  | —          | 目标透明度,0=全透明,1=全不透明                             |
| `dur?`  | `number (秒)` | `0` (立即) | 渐变时长,默认 300ms (`0.3`)。不传 = 立即切换,>0 = 线性插值 |

**典型场景**:

```ts
// React Router 离开时
useEffect(
  () => () => {
    rain.setTransitionAlpha(0, 0.3);
    setTimeout(() => rain.destroy(), 320);
  },
  []
);

// Vue Router beforeRouteLeave
onBeforeRouteLeave(() => {
  rain.setTransitionAlpha(0, 0.3);
  return new Promise((r) => setTimeout(r, 320));
});
```

读取当前 alpha(测试钩子):

```ts
const a = rain.getTransitionAlpha?.(); // 0-1
```

---

## 🖼️ 位图缩放策略 · `FitMode` / `targetFitMode`

位图(文字/图片) → 网格的缩放方式。**4 种模式**:

| 模式                 | 行为                                                                        | 适用                          |
| -------------------- | --------------------------------------------------------------------------- | ----------------------------- |
| `contain` **(默认)** | 等比缩放,完整显示位图,可能四周留空;位图 cols > grid cols 时自动再缩(防溢出) | 长文本、横幅 logo、保持原比例 |
| `cover`              | 等比缩放,填满 grid,可能裁切                                                 | 全屏背景、人物肖像            |
| `actual`             | 按位图原始 cols/rows 渲染(可能溢出)                                         | 像素艺术、极小位图            |
| `auto`               | 引擎扫描非零像素 bbox:若 cols/rows > 0.95 × grid,自动 contain;否则 actual   | 通用入口,智能选择             |

```ts
import { matrixRain, type FitMode, textToBitmap } from '@xietuier/matrix-rain';

const rain = matrixRain({
  targetBitmap: textToBitmap('HELLO', 80, 24).data,
  targetFitMode: 'contain', // ← 默认值,显式声明更清晰
});
```

热更新单次位图(fitMode 临时覆盖,不影响实例默认):

```ts
rain.setTargetBitmap(newBitmap, { fitMode: 'cover' });
```

> ⚠️ **Breaking Change(自 0.1.0 起)**:FitMode 默认值从旧版的 `actual` 改为 `contain`。
> 旧代码若依赖位图按原始尺寸铺满(可能溢出),需显式传 `targetFitMode: 'actual'` 恢复旧行为。

---

## ⏱️ 平滑过渡时长 · 5 类 transition duration option

E1 整套平滑过渡系统的开关。**全部可选**;不传 = 引擎自动用默认值,且仍然避免明显硬切,但要"完整平滑过渡"必须显式调。

| 字段                        | 类型          | 默认   | 关闭(0)    | 作用                                              |
| --------------------------- | ------------- | ------ | ---------- | ------------------------------------------------- |
| `noiseFadeInDuration`       | `number (秒)` | `0.2`  | 跳过渐入   | noise 阶段开头字符由全暗渐亮(noise→converge 模式) |
| `phaseTransitionDuration`   | `number (秒)` | `0.15` | 立即切换   | `fade` ↔ `noise-converge` 两个 phase 间过渡       |
| `cellLockEaseDuration`      | `number (秒)` | `0.12` | 立即锁     | 单个 cell 锁定/解锁后亮度 ease 动画               |
| `themeTransitionDuration`   | `number (秒)` | `0.4`  | 立即换色   | 主题切换时 HSL 颜色空间插值                       |
| `variantTransitionDuration` | `number (秒)` | `0.3`  | 立即换雨速 | 切 variant 时雨速/密度插值                        |

```ts
// 极简:全部走默认值(向后兼容,无平滑)
matrixRain({ targetBitmap: bmp, targetPhase: 'noise-converge' });

// 显式拉长:做"影视感"过渡
matrixRain({
  targetBitmap: bmp,
  targetPhase: 'noise-converge',
  noiseFadeInDuration: 0.5, // 慢启
  cellLockEaseDuration: 0.3, // 锁定时柔和
  phaseTransitionDuration: 0.4, // 阶段切换不突兀
});

// 关闭一切过渡(性能/低端机省电)
matrixRain({
  targetPhase: 'noise-converge',
  noiseFadeInDuration: 0,
  cellLockEaseDuration: 0,
  phaseTransitionDuration: 0,
});

// 主题切换也用同一套(动态调节)
rain.setTheme('matrix-green', {
  /* keepPaletteParams */
});
// themeTransitionDuration 在切换瞬间生效,默认 0.4s
```

---

## 📞 生命周期回调 · 4 个 `on*` 选项

| 字段             | 触发时机                 | 签名                            |
| ---------------- | ------------------------ | ------------------------------- |
| `onFrame`        | 每帧(30Hz 节流)          | `(info: FrameInfo) => void`     |
| `onResize`       | 视口变化(200ms debounce) | `(size: SizeInfo) => void`      |
| `onThemeChange`  | 主题切换后               | `(newTheme: ThemeName) => void` |
| `onTargetFinish` | 目标位图完全淡出后       | `() => void`                    |

```ts
import { matrixRain } from '@xietuier/matrix-rain';

// onFrame:实时 FPS / 性能上报
matrixRain({
  onFrame(info) {
    analytics.track('matrix-frame', { fps: info.fps, t: info.t });
  },
});

// onResize:布局重算
matrixRain({
  onResize({ width, height }) {
    console.log(`新尺寸:${width}×${height}`);
  },
});

// onThemeChange:同步外部 UI
matrixRain({
  onThemeChange(newTheme) {
    document.documentElement.dataset.theme = newTheme;
  },
});

// onTargetFinish:动画结束钩子(链式触发下一段)
matrixRain({
  targetBitmap: bmp1,
  onTargetFinish() {
    // 上一段播完,自动接下一段
    rain.setTargetBitmap(bmp2);
  },
});
```

---

## 🐛 调试 / SSR · 5 个 getter

| 方法                    | 用途                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `getOptions()`          | 读取当前生效配置(主题 + 变体 + 全部参数)                                                              |
| `serialize()`           | 导出 JSON 字符串(SSR hydration / 持久化)                                                              |
| `getDiagnostics()`      | 读取最近一次 userFunc 编译错误(brightnessCurve / flickerCurve / phaseFunc / charsetFunc / colorCurve) |
| `getTargetState?()`     | noise-converge 状态机快照(phase / elapsed / lockedCount / 各类过渡进度)                               |
| `getClickBurstState?()` | clickBurst 当前状态(active / x / y / t)                                                               |

```ts
// 1. getOptions:调试当前实例的全部参数
const opts = rain.getOptions();
console.log('当前主题:', opts.theme, '· 变体:', opts.variant);
console.log('fitMode:', opts.targetFitMode, '· charset len:', opts.charset?.length);

// 2. serialize:SSR 把状态传到客户端
const json = rain.serialize(); // MatrixRainSnapshot JSON 字符串
const restored = MatrixRain.fromSnapshot(json, { container }); // 客户端还原

// 3. getDiagnostics:沙箱代码写错时查
rain.setBrightnessCurve('return Math.window' /* typo */);
const errs = rain.getDiagnostics();
if (errs.brightnessCurve) console.error('亮度曲线编译失败:', errs.brightnessCurve);

// 4. getTargetState:noise-converge 进度可视化
const s = rain.getTargetState?.();
if (s?.active) {
  console.log(`phase=${s.phase} · 已锁 ${s.lockedCount}/${s.totalTargets} · alpha=${s.transitionAlpha}`);
  console.log('phase 过渡:', s.phaseTransition);
  console.log('theme 过渡:', s.themeTransition);
  console.log('variant 过渡:', s.variantTransition);
}

// 5. getClickBurstState:点击爆闪测试
const cb = rain.getClickBurstState?.();
if (cb?.active) console.log(`爆闪中 @(${cb.x.toFixed(2)}, ${cb.y.toFixed(2)}) t=${cb.t.toFixed(2)}s`);
```

**SSR 完整流程**(序列化 → 传输 → 还原):

```ts
// server.ts
import { matrixRain } from '@xietuier/matrix-rain/core';
const serverInstance = matrixRain({ theme: 'matrix-green' });
const html = `<script id="mr-snapshot" type="application/json">${serverInstance.serialize()}</script>`;

// client.tsx
import { MatrixRain } from '@xietuier/matrix-rain';
const json = document.getElementById('mr-snapshot')!.textContent!;
const clientInstance = MatrixRain.fromSnapshot(json, { container: document.body });
```

---

## 🛠️ 性能调优

| 场景       | 改法                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| 老旧设备   | `maxDPR: 1`                                                                                           |
| 移动端     | `fontSize: 18`                                                                                        |
| 4K 屏      | `maxDPR: 1`(默认已限 2)                                                                               |
| 隐藏时省电 | `document.addEventListener('visibilitychange', () => document.hidden ? rain.pause() : rain.resume())` |
| 无障碍     | CSS 已内置 `prefers-reduced-motion` 处理                                                              |

---

## 🌐 CDN

零构建、零依赖,在任何静态页面里直接用。锁定版本号以防破坏性升级。

### jsDelivr

```html
<!-- 1. 样式 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/matrix-rain.css" />

<!-- 2a. ES Module(推荐,支持 tree-shake) -->
<script type="module">
  import { matrixRain } from 'https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/index.js';
  matrixRain({ theme: 'silicon-valley' });
</script>

<!-- 2b. IIFE(全局 window.MatrixRain,免 import) -->
<script src="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/index.iife.js"></script>
<script>
  window.MatrixRain.matrixRain({ theme: 'cyber-blue' });
</script>

<!-- 2c. Web Component(<matrix-rain> 标签) -->
<script type="module" src="https://cdn.jsdelivr.net/npm/@xietuier/matrix-rain@0.1.0/dist/element.js"></script>
<matrix-rain theme="matrix-green" variant="avalanche"></matrix-rain>
```

### unpkg

把 `cdn.jsdelivr.net` 换成 `unpkg.com` 即可:

```html
<link rel="stylesheet" href="https://unpkg.com/@xietuier/matrix-rain@0.1.0/dist/matrix-rain.css" />
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
window.__matrixRainDebug.instances; // → [{id, theme, variant, fps}, ...]
window.__matrixRainDebug.count; // → 当前实例数
window.__matrixRainDebug.avgFps; // → 平均 FPS
window.__matrixRainDebug.destroyAll(); // 销毁全部
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
