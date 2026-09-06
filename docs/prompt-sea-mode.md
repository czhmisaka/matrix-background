# 接入提示词 · 数据海背景(sea 模式)

> 把下面整段复制给 AI(或同事)即可完成接入。适用于任何有「全屏/局部 hero 容器」的网页项目。

---

## 任务

在我的页面里接入 @xietuier/matrix-rain 的「数据海」背景效果(逆向自 zeabur.com Hero):
一片缓慢流动的紫橙色带 + 若隐若现的字符点阵 + 右上角柔光, 颜色随时间自主波动。
数字雨叠在它上面(可选, 我可能只想要纯背景)。

## 环境要求

- npm 包: @xietuier/matrix-rain ≥ 0.8.0
- 浏览器需支持 WebGL2(不支持时自动静默降级为无背景, 不要报错)
- 宿主容器需要 position: relative/absolute(模块的 canvas 是 absolute inset:0)

## 方案 A · 只要数据海背景(推荐先试这个)

```html
<div id="hero" style="position:relative; min-height:100svh">
  <div id="sea-holder" style="position:absolute; inset:0"></div>
  <div style="position:relative; z-index:2">页面内容…</div>
</div>

<script type="module">
  import { createSeaBackground } from '@xietuier/matrix-rain/sea';

  const sea = createSeaBackground({
    container: document.getElementById('sea-holder'),
    theme: 'dark', // 'dark' 暗紫 | 'light' 暖橙
    speed: 1.3, // 色带流速
    colorWave: true, // 潮谷/潮峰颜色随时间波动(色相±22°+亮度±12%)
    opacity: 1,
  });

  // 可选: 亮暗切换(sea.setTheme 内置 1.2s 缓动淡入, 不是硬切)
  // sea.setTheme('light');

  // 页面卸载时: sea.destroy();
</script>
```

## 方案 B · 数字雨叠在数据海上

```html
<div id="hero" style="position:relative; min-height:100svh">
  <div id="rain-holder" style="position:absolute; inset:0; pointer-events:none"></div>
  <div style="position:relative; z-index:2">页面内容…</div>
</div>

<script type="module">
  import { matrixRain } from '@xietuier/matrix-rain';
  import '@xietuier/matrix-rain/style.css';

  const rain = matrixRain({
    container: document.getElementById('rain-holder'),
    theme: 'zeabur', // 暗紫+暖橙 双色板(数据海同源配色)
    variant: 'zeabur', // 数据海流场亮度模式
    fontSize: 16,
    charGap: 4,
    rowPitch: 0.75,
    trailAlpha: 0.4, // ★ 重要: 垫数据海时拖尾必须 ≥0.4, 默认 0.18 会把海面压暗
    flickerSpeed: 0.35, // ★ 数据海气质 = 极慢极静, 不要用默认 1
    sparkProbability: 0.001,
    background: 'sea', // ← 一行接入数据海(引擎自动创建/销毁/分层)
  });

  // 纯数据海模式(不要雨): opacity 调 0 或干脆用方案 A
  // rain.setTransitionAlpha(0)  /  容器 CSS opacity:0
</script>
```

## 参数速查(sea 模块)

| 参数      | 默认   | 说明                                           |
| --------- | ------ | ---------------------------------------------- |
| theme     | 'dark' | 'dark' 暗紫 / 'light' 暖橙, 切换自带 1.2s 缓动 |
| speed     | 1.3    | 色带流速, 0 冻结                               |
| colorWave | true   | 潮谷/潮峰颜色随时间波动                        |
| opacity   | 1      | canvas 不透明度                                |
| zIndex    | 0      | canvas 层级                                    |
| layers    | 全开   | { grid, ascii, gradient, rays, wave } 逐层开关 |

## 禁忌(踩过的坑)

1. **不要用默认 trailAlpha(0.18) 叠海** — 雨的拖尾每帧叠 rgba(8,8,18,0.18), 稳态会把海面压成灰暗, 必须 ≥0.4 或直接方案 A
2. **不要把雨 canvas 放在海 canvas 之上且都 position:static** — 必须 absolute 分层
3. **不要自己 setInterval 改颜色** — colorWave 已内置双频噪声波动, 手动改会打架
4. **WebGL2 不可用时不要 try-catch 重试** — 模块已静默降级, 重复创建只会泄漏
5. **容器高度别用内容撑** — 用 min-height:100svh 或固定高度, height:0 会画不出东西

## 验证接入成功

1. 容器里有 2 个 canvas 时(方案 B): 第一个是 webgl(海), 第二个 2d(雨)
2. DevTools 无 "[matrix-rain] sea background init failed" 警告
3. 静止观察 10s: 色带有明显的明暗潮水涌动, 颜色在紫↔蓝紫↔粉紫间缓慢游移
   一
