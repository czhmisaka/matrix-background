/**
 * @xietuier/matrix-rain
 * czhmisaka · 数字矩阵背景 · 通用 TypeScript 类型定义
 */

/** 4 通道颜色:R, G, B, alpha(0-1) */
export type RGBA = [number, number, number, number];

/**
 * 目标位图(textToBitmap 输出 / engine 渲染)的缩放策略
 *
 * - `contain` (默认):完整显示位图内容,保持宽高比,可能四周留空
 *   当位图 cols 超过 grid cols 时,自动等比缩小(防止文字溢出可视区)
 * - `cover`:填满整个 grid,保持宽高比,可能裁切
 * - `actual`:按位图原始 cols/rows 渲染(旧版默认行为,可能溢出)
 * - `auto`:根据位图内容自动选择 —— 长文本 / 高度比宽度比大的图 → contain,否则 actual
 */
export type FitMode = 'contain' | 'cover' | 'actual' | 'auto';

/** HSL 调色板(方案 B): H/S/L 起点+终点, 公式生成 0-1 连续亮度 */
export interface HSLPalette {
  /** 0-360 */
  h: number;
  /** 0-1 */
  s: number;
  /** 0-1 起点亮度(L=0 = 熄灯,L=1 = 最亮) */
  lMin: number;
  /** 0-1 终点亮度(L=1) */
  lMax: number;
  /** 最高档 alpha,默认 1.0 */
  aMax?: number;
}

/** 调色板: HSL 描述符(连续亮度) · 10 档数组已废弃 */
export type Palette = HSLPalette;

/** 预设主题名 */
export type ThemeName = 'silicon-valley' | 'matrix-green' | 'lava-red' | 'cyber-blue' | 'pure-mono';

/** 内置变体名 */
export type VariantName = 'avalanche' | 'ripple' | 'ascii' | 'classic';

/**
 * 过渡曲线(0.4.0+)
 * - `'smooth'`: cubic ease(默认,easeIn / easeOut / easeInOut 三种,按过渡点自动选)
 * - `'linear'`: 纯线性 `t` 恒等(无加速/减速)
 *
 * 全局模式通过 `MatrixRainOptions.easing` 设置,通过 `setEasing(mode)` 热更新。
 * 也可在单次 setter 调用时用 `{ easing: 'linear' }` 临时覆盖(见 setTheme 等)。
 */
export type EasingMode = 'smooth' | 'linear';

/** 主题参数(随主题预设) */
export interface ThemeParams {
  /** 整体亮度乘数(0-2, 默认 1) */
  brightness: number;
  /** 饱和度(0=灰阶, 1=原色, 默认 1) */
  chroma: number;
  /** 色相偏移(度数 -180 到 180, 默认 0) */
  hueShift: number;
  /** 饱和度偏移(±1, 默认 0) */
  saturationShift: number;
  /** 亮度偏移(±1, 默认 0) */
  lightnessShift: number;
  /** 反色(0=正常, 1=反色, 默认 0) */
  invertHue: number;
  /** 对比度(0-2, 默认 1) */
  contrast: number;
}

/** 变体调参参数(每变体独立) */
export interface VariantParams {
  /** phase 增量基线(0-0.2, 默认 0.04) */
  phaseStep: number;
  /** phase 增量 jitter(0-0.1, 默认 0.06) */
  phaseJitter: number;
  /** 3 sin 振幅(总和 1) */
  sinWeightA: number;
  sinWeightB: number;
  sinWeightC: number;
  /** bright 阶梯曲线(默认 3.5) */
  brightCurve: number;
  /** 字符随机更新概率(0-1, default 0) */
  chUpdateProb: number;
  /** avalanche: head 亮度(7-9, 默认 8) */
  headBright: number;
  /** avalanche: head 衰减率(1=distance, 2=quadratic, 默认 1) */
  headFalloff: number;
  /** avalanche: yPos 移动速度乘数(0-2, 默认 0.5) */
  avalancheSpeed: number;
}

/** 变体默认参数表 */
export const VARIANT_DEFAULTS: Record<VariantName, VariantParams> = {
  classic: {
    phaseStep: 0.04,
    phaseJitter: 0.06,
    sinWeightA: 0.4,
    sinWeightB: 0.3,
    sinWeightC: 0.3,
    brightCurve: 3.5,
    chUpdateProb: 0,
    headBright: 8,
    headFalloff: 1,
    avalancheSpeed: 0.5,
  },
  ascii: {
    phaseStep: 0.04,
    phaseJitter: 0.06,
    sinWeightA: 0.4,
    sinWeightB: 0.3,
    sinWeightC: 0.3,
    brightCurve: 3.5,
    chUpdateProb: 0,
    headBright: 8,
    headFalloff: 1,
    avalancheSpeed: 0.5,
  },
  avalanche: {
    phaseStep: 0.04,
    phaseJitter: 0.06,
    sinWeightA: 0.4,
    sinWeightB: 0.3,
    sinWeightC: 0.3,
    brightCurve: 3.5,
    chUpdateProb: 0.3,
    headBright: 8,
    headFalloff: 1,
    avalancheSpeed: 0.5,
  },
  ripple: {
    phaseStep: 0.05,
    phaseJitter: 0,
    sinWeightA: 0.5,
    sinWeightB: 0,
    sinWeightC: 0,
    brightCurve: 8,
    chUpdateProb: 0.2,
    headBright: 8,
    headFalloff: 1,
    avalancheSpeed: 0.5,
  },
};

/** 主题字典返回值 */
export interface ThemeResult extends ThemeParams {
  cold: HSLPalette;
  warm: HSLPalette;
}

/** 颜色注入支持函数式:基于 brightness level + 网格坐标生成颜色 */
export type ColorOverrideFn = (
  /** brightness level 0-9 */
  level: number,
  /** 网格列 */
  h: number,
  /** 网格行 */
  s: number,
  /** 单元格引用(c.ch / c.warmth / c.bright) */
  cell: { ch: number; warmth: number; bright: number; phase: number }
) => [number, number, number] | null | undefined;

/** 颜色注入:对象或函数 */
export type ColorOverrides =
  | Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, [number, number, number]>>
  | ColorOverrideFn;

/** 点击爆闪配置 */
export interface ClickBurstOptions {
  /** 爆闪半径(网格单位,默认 6) */
  radius?: number;
  /** 爆闪强度(0-1,默认 0.8) */
  intensity?: number;
  /** 自定义颜色(默认继承当前主题暖色) */
  color?: [number, number, number];
  /** 单次爆闪持续时间(秒,默认 0.6) */
  duration?: number;
  /** 是否自动衰减(默认 true) */
  decay?: boolean;
}

/** 鼠标光标配置 */
export type CursorOption = 'none' | 'crosshair' | 'pointer' | 'default' | false;

/** 帧事件信息 */
export interface FrameInfo {
  /** 帧号(自启动) */
  f: number;
  /** 累计墙钟时间(秒) */
  t: number;
  /** 上一帧 dt(秒) */
  dt: number;
  /** 当前 FPS(平滑) */
  fps: number;
}

/** 尺寸事件信息 */
export interface SizeInfo {
  /** viewport 宽(像素) */
  w: number;
  /** viewport 高(像素) */
  h: number;
  /** 网格列数 */
  cols: number;
  /** 网格行数 */
  rows: number;
}

/** 用户可调的完整配置 */
export interface MatrixRainOptions {
  /** 字符网格宽度(像素),默认 14。越大越疏 */
  fontSize?: number;

  /**
   * 渲染器 init 失败时自动降级到 canvas2d(默认 true)· @since 0.7.1
   * - true(默认): webgl/webgpu init 失败 → 自动换 canvas2d 重新初始化
   * - false: 失败即暂停引擎(rAF 链断, 不空转耗 CPU)
   */
  enableAutoFallback?: boolean;

  /**
   * 字符间距(CSS px)· 对称应用到 x 和 y · 默认 0
   * - 正值:字符间留空(如 1-2 让字到字更紧或更松)
   * - 负值:字符重叠(最多 -10)
   * 范围 [-10, +20] · 越界自动 clamp
   */
  charGap?: number;

  /** 残影 alpha(0-1),默认 0.18。越小拖尾越长 */
  trailAlpha?: number;

  /** DPR 缩放上限,默认 2。性能优先可设 1 */
  maxDPR?: number;

  /**
   * 局部子格渲染倍率(类似"脏渲染"):仅在目标位图激活时,位图覆盖区按此倍率
   * 画子格(每个父格画 renderScale² 个子格),位图区外 0 开销。
   * - 父格 = 基础网格 1 个 cell(state.r × state.i 不变)
   * - 子格 = 父格细分,继承父 cell 状态,只画 fillText
   * - 数字越大,位图边缘越锐利;CPU 开销 = renderScale²(2 → 4x, 4 → 16x)
   *
   * 取值:
   * - `1` (默认): 行为 100% 等价于无此选项(向后兼容)
   * - `2` / `3` / `4`: 显式倍率。`>= 4` 性能急剧下降,仅适合短时演示
   * - `'auto'`: 自动模式 = `2`(位图未激活时回到 `1`)
   * - 实际生效值被钳到 [1, 16] 整数范围(向下取整)
   *
   * ⚠️ `avalanche` 变体: 头亮 trail 按行对齐,子格仅在列方向生效
   * (横向更锐,纵向密度不变)。
   *
   * @since 0.3.0
   * @see setRenderScale
   */
  renderScale?: number | 'auto';

  /**
   * 渲染器类型(0.4.0+ · 多渲染器可插拔)
   * - `'canvas2d'` (默认 / 0 体积): 软件 fillText, 适合 1080p+fontSize ≥ 8
   * - `'webgl'`:   WebGL2 instanced rendering, 适合 4K+fontSize 4-6 (Phase 2B)
   * - `'webgpu'`:  WebGPU compute + render, 适合 8K+fontSize 2 (Phase 4)
   * - `'auto'`:    Phase 3 之后,按 viewport × cell density 估算自动选
   *
   * 切换 renderer 需要硬重建(因为 canvas 只能绑一个 context 类型)
   * - WebGL/WebGPU 路径走 dynamic import,不增加 canvas2d 默认路径体积
   * - 当前 Phase 1 只支持 `'canvas2d'`; 传 webgl/webgpu 会 throw Error
   *
   * @since 0.4.0
   * @see setRenderer (Phase 3)
   */
  renderer?: 'canvas2d' | 'webgl' | 'webgpu' | 'auto';

  /** 字符集,默认 '0123456789' */
  charset?: string;

  /** 冷色板(科技感侧),10 档 */
  coldPalette?: Palette;

  /** 暖色板(温度感侧),10 档 */
  warmPalette?: Palette;

  /**
   * 主题预设(从 builtin 主题模板构造)
   * - 传 ThemeName:走标准主题
   * - 传 { coldFrom, warmFrom }:从两个主题"拼色"(冷色板来自 coldFrom,暖色板来自 warmFrom)
   */
  theme?: ThemeName | { coldFrom: ThemeName; warmFrom: ThemeName };

  /**
   * 冷色板直接复用 builtin 主题(无须自己手填 HSL)
   * 例: matrixRain({ coldFrom: 'cyber-blue' })
   * 等价于 matrixRain({ theme: { coldFrom: 'cyber-blue', warmFrom: 'silicon-valley' } })
   */
  coldFrom?: ThemeName;
  /** 暖色板直接复用 builtin 主题 */
  warmFrom?: ThemeName;

  /** 温度光心位置 0-1,默认 { x: 0.7, y: 0.3 } */
  lightCenter?: { x: number; y: number };

  /** 温度光心漂移速度,默认 0.008 / 0.006 */
  driftSpeed?: { x: number; y: number };

  /** 温度光晕半径系数(相对视口高),默认 0.6 */
  warmthRadius?: number;

  /** 阻尼跟随系数 0-1,默认 0.04。越大跟随越紧 */
  warmthLerp?: number;

  /** 闪烁概率覆盖,不传则用默认阶梯 */
  flickerRates?: { high: number; mid: number; low: number; dark: number };

  /** 闪烁速度倍率,默认 1。<1 慢动作(例 0.3=很慢),>1 加快(例 3=高朝),0=冻结 */
  flickerSpeed?: number;

  /**
   * 目标帧率上限,默认 0(不限,与 rAF 同频,多为 60)。
   * 设 30/24/15 可显著省电(手机、后台 tab、多实例页面推荐 30)。
   * 设 0 = 不限。
   * 可通过 instance.setTargetFPS(n) 热更新。
   */
  targetFPS?: number;

  /**
   * 固定时间步长模式,默认 false。
   * true = 每帧 dt 强制 1/60(确定性,适合 SSR/headless 测试);
   * false(默认)= 用 rAF 时间戳算真实 dt(帧率自适应)。
   * 注:此选项在测试、benchmark 或需要严格 60fps 模拟时开启。
   */
  fixedTimeStep?: boolean;

  /**
   * 忽略系统 prefers-reduced-motion,强制开启动画,默认 false。
   * 默认行为:用户系统开启"减少动画"时,实例自动 pause(可访问性 + 省电)。
   * 传 true 则忽略系统设置,继续动画(用户内容偏好优先)。
   */
  enableWhenReducedMotion?: boolean;

  /** 爆闪到最亮档的概率,默认 0.003 */
  sparkProbability?: number;

  /** 主题参数覆盖(覆盖主题自带) */
  themeParams?: Partial<ThemeParams>;

  /** 冷色板独立调参 */
  coldThemeParams?: Partial<ThemeParams>;
  /** 暖色板独立调参 */
  warmThemeParams?: Partial<ThemeParams>;

  /** 时间驱动色相旋转速度(度/秒, 默认 0) */
  hueRotateSpeed?: number;
  /** 时间驱动色相旋转范围(度, 默认 360) */
  hueRotateAmount?: number;

  /**
   * 颜色注入:
   * - Record<0-9, [r,g,b]>:覆盖特定亮度档
   * - (level, h, s, cell) => [r,g,b]:函数式,基于位置/字符/温度动态生成
   *   返回 null 跳过该 cell(走默认 LUT)
   */
  colorOverrides?: ColorOverrides;

  /** 变体调参(覆盖变体默认) */
  variantParams?: Partial<VariantParams>;

  /** 亮度曲线用户函数(表达式代码) · f(t, h, s, r) → 0-1 */
  brightnessCurve?: string;
  /** 闪烁概率用户函数 · f(t, h, s, L) → 0-1, 叠加在 flickerRates 上 */
  flickerCurve?: string;
  /** phase 增量用户函数 · f(t, phase, h, s) → number, 加到 phase */
  phaseFunc?: string;
  /** 字符分布用户函数 · f(t, h, s, ch) → number(0-charset.length) */
  charsetFunc?: string;

  /** 颜色动态曲线 · f(t, h, s, r) → number(-180 to 180) 度数偏移, 每帧调一次 */
  colorCurve?: string;

  /**
   * 目标位图(文字/图片转换的灰度,0-1)
   * 网格大小与 cell 一致; null = 不使用, 走默认 rain 行为
   * 使用时 brightnessCurve 被 target 灰度覆盖(颜色不变,只改亮度)
   */
  targetBitmap?: Float32Array | null;
  /** 位图宽(列数)· 0 = 默认等于 grid cols */
  targetCols?: number;
  /** 位图高(行数)· 0 = 默认等于 grid rows */
  targetRows?: number;
  /**
   * 位图 → 网格的缩放策略,默认 'contain'
   * - contain (默认):位图内容超出 grid 时等比缩放以保证 0 溢出
   * - cover:位图内容缩放填满 grid,可能裁切
   * - actual:按位图原始尺寸渲染(可能溢出,旧版行为)
   * - auto:根据位图实际内容 bbox 智能选择 contain/actual
   * 引擎会扫描非零像素 bbox:若 cols/rows > 0.95 × grid,自动等比缩放
   */
  targetFitMode?: FitMode;
  /** 位图锚点· 决定位图在 grid 中的默认位置
   * - 'topLeft' (左上)
   * - 'center' (居中,默认)
   * - 'topRight' / 'bottomLeft' / 'bottomRight'
   */
  targetAnchor?: 'topLeft' | 'center' | 'topRight' | 'bottomLeft' | 'bottomRight';
  /** 位图运动方式
   * - 'static' (默认,不动)
   * - 'drift' (匀速横向漂·包边)
   * - 'bounce' (贪食蛇 式反弹)
   * - 'float' (上下柔性浮动)
   */
  targetMotion?: 'static' | 'drift' | 'bounce' | 'float';
  /** 运动速度(网格/秒)· 默认 0.3 */
  targetMotionSpeed?: number;
  /** 渐入时长(秒) · 默认 0.5 */
  targetFadeIn?: number;
  /** 保持时长(秒) · 默认 Infinity */
  targetHold?: number;
  /** 淑出时长(秒) · 默认 2.0 */
  targetFadeOut?: number;
  /** 叠加混乱度(0-1): 数字在过渡时快速变换,默认 0.5 */
  targetChaos?: number;

  /**
   * 目标位图出现方式
   * - 'fade' (默认,向后兼容):线性透明度淡入,经典数字雨过渡
   * - 'noise-converge': 0.5s 全屏噪点 → 1.5s 逐个锁定为图像 → 保持 → 2s 反向解锁融化
   */
  targetPhase?: 'fade' | 'noise-converge';
  /** 噪声→收敛:全屏噪点时长(秒),默认 0.5 */
  targetNoiseDuration?: number;
  /** 噪声→收敛:逐个锁定时长(秒),默认 1.5 */
  targetConvergeDuration?: number;
  /** 噪声→收敛:目标区 cell 锁定顺序
   * - 'random' (默认):随机顺序锁定,曲线平滑
   * - 'topdown': 从顶行到末行顺序
   * - 'bottomup': 从末行到顶行顺序
   * - 'center': 从中心向外扩散
   * - 'edge': 从边缘向中心收缩
   * - 'leftright': 从左到右扫
   * - 'rightleft': 从右到左扫
   */
  targetLockOrder?:
    | 'random'
    | 'topdown'
    | 'bottomup'
    | 'center'
    | 'edge'
    | 'leftright'
    | 'rightleft';
  /** 噪声→收敛:目标区 cell 锁定后字符稳定性 (0-1,默认 0.7)
   * 1 = 字符完全不变(纯图像);0 = 字符每帧可换(类似 normal rain)
   */
  targetLockStability?: number;

  /**
   * ========== 平滑过渡系统(10 类过渡的可调时长)==========
   * 全部可选;不传 → 用默认值,与旧版行为一致(向后兼容)
   * 注:即使不传这些选项,引擎仍会避免明显的硬切;
   * 但"完整平滑过渡"必须显式打开对应的字段。
   */
  /** noise 阶段开头渐入时长(秒)· 默认 0.2。0 = 关闭 */
  noiseFadeInDuration?: number;
  /** 阶段间过渡时长(秒)· 默认 0.15。0 = 关闭 */
  phaseTransitionDuration?: number;
  /** per-cell 锁定/解锁后亮度 ease 时长(秒)· 默认 0.12。0 = 关闭 */
  cellLockEaseDuration?: number;
  /** 主题切换 HSL 插值时长(秒)· 默认 0.4。0 = 关闭 */
  themeTransitionDuration?: number;
  /** 切 variant 时雨速/密度插值时长(秒)· 默认 0.3。0 = 关闭 */
  variantTransitionDuration?: number;

  /** 变体(改主循环行为) */
  variant?: VariantName;

  /** 自定义画布(默认自动创建) */
  canvas?: HTMLCanvasElement;

  /** 父容器(默认 document.body) */
  container?: HTMLElement;

  /**
   * 全局过渡曲线(0.4.0+)· 决定所有 8 个内部 ease 调用点的曲线
   * - `'smooth'` (默认): cubic ease — 看起来"自然"但启停略有加速
   * - `'linear'`: 纯线性 t — 启停匀速,无加速感
   *
   * 单次 setter 调用可以用 `{ easing: 'linear' }` 临时覆盖全局模式。
   * 详情见 [README §平滑过渡时长 / 中断与回退]。
   *
   * @since 0.4.0
   */
  easing?: EasingMode;

  /** 启动后回调 */
  onReady?: (instance: MatrixRainInstance) => void;

  /** 帧事件(30Hz 节流) */
  onFrame?: (info: FrameInfo) => void;
  /** resize 事件(200ms debounce) */
  onResize?: (size: SizeInfo) => void;
  /** 主题切换事件 */
  onThemeChange?: (newTheme: ThemeName) => void;
  /** 目标位图淑出完成事件 */
  onTargetFinish?: () => void;

  /** 点击爆闪:点击 canvas 触发指定半径的临时高亮 */
  clickBurst?: boolean | ClickBurstOptions;
  /** 鼠标光标配置 */
  cursor?: CursorOption;
}

/** 主题预设工厂(用户也可以在外部 import 复用) */
export type ThemeFactory = () => ThemeResult;

/** 实例序列化快照(SSR hydration / 保存恢复用) */
export interface MatrixRainSnapshot {
  /** 协议版本 */
  v: 1;
  /** 完整配置 */
  options: MatrixRainOptions;
  /** 当前主题(若是拼色主题,记录源) */
  theme: ThemeName;
  /** 拼色主题源(若适用) */
  mixedFrom?: { coldFrom: ThemeName; warmFrom: ThemeName };
}

/** 实例句柄 */
export interface MatrixRainInstance {
  /** 销毁实例,释放 rAF / 事件监听 */
  destroy(): void;

  /** 暂停动画(切 tab / 隐藏时省电) */
  pause(): void;

  /** 恢复动画 */
  resume(): void;

  /**
   * 动态更新主题
   * @param name 主题名(从 ThemeName 枚举)
   * @param options.keepPaletteParams 传 true 时保留 ctp/wtp 自定义;默认 false 重置为新主题的 tp
   * @param options.dur 覆盖该次切换的过渡时长(秒)· 0 = 立即切换· 不传 = 走 `themeTransitionDuration`
   * @param options.easing 覆盖该次切换的曲线(`'smooth' | 'linear'`)· 不传 = 走全局 `easing`
   *
   * **支持打断与回退** —— 若调用时上一次切换正在过渡中,新切换的 `from` 取当前显示值(插值)
   * (不是上次的原值),保证视觉上平滑衔接(无突跳)。
   *
   * @since 0.4.0 dur + easing 选项
   */
  setTheme(
    name: ThemeName,
    options?: { keepPaletteParams?: boolean; dur?: number; easing?: EasingMode }
  ): void;

  /**
   * 动态更新色板(高级)· 不走主题过渡(立即切换 LUT)
   * 备注:不走打断逻辑,因为 setPalettes 直接 setPalettes(cold, warm) 无 from
   */
  setPalettes(cold: Palette, warm: Palette): void;

  /** 动态调密度 */
  setDensity(fontSize: number): void;

  /**
   * 0.6.2+: 动态调整残影 alpha(0-1)· 不触发 buildGrid
   * - 钳到 [0, 1];非有限数 → 0
   * - 运行时立即生效(下一帧 drawTrail 使用新值)
   */
  setTrailAlpha(alpha: number): void;

  /**
   * 0.6.2+: 动态调整 DPR 上限(0.5-4)· 触发 buildGrid
   * - 钳到 [0.5, 4];非有限数 → 1
   * - 重建 canvas backing store 尺寸,不影响字符间距/fontSize
   */
  setMaxDPR(dpr: number): void;

  /**
   * 0.6.2+: 切换 target 出现阶段(fade <-> noise-converge)
   * - 切到 noise-converge 且当前有活跃位图 → 自动 recompute lock times
   * - 不重置 targetStartTime,下一次循环时新 phase 会自然应用
   */
  setTargetPhase(phase: 'fade' | 'noise-converge'): void;

  /**
   * 0.6.2+: 动态调整 noise-converge 噪点时长(秒)· >=0
   * - noise-converge 且活跃 → recompute lock times
   */
  setTargetNoiseDuration(dur: number): void;

  /**
   * 0.6.2+: 动态调整 noise-converge 逐 cell 锁定时长(秒)· >=0.001
   * - noise-converge 且活跃 → recompute lock times
   */
  setTargetConvergeDuration(dur: number): void;

  /**
   * 0.6.2+: 动态调整 lock 顺序· noise-converge 且活跃 → recompute
   */
  setTargetLockOrder(
    order: 'random' | 'topdown' | 'bottomup' | 'center' | 'edge' | 'leftright' | 'rightleft'
  ): void;

  /**
   * 0.6.2+: 动态调整 lock 后字符稳定性 (0-1)· 不需 recompute
   */
  setTargetLockStability(stab: number): void;

  /**
   * 动态调整字符间距(对称应用 x/y)· 不触发 buildGrid
   * - 列数/行数不变,仅每个 cell 内字符的 (cx, cy) 偏移
   * - 钳到 [-10, 20];非有限数 → 0
   */
  setCharGap(charGap: number): void;

  /**
   * 动态更新局部子格渲染倍率。
   * - 不触发 buildGrid(基础网格 r/i 不变);只影响后续帧的子格路径
   * - `setRenderScale('auto')` 立即生效,但 effective 数值在每帧重算
   * - 输入校验: `number` 被钳到 [1, 16] 整数范围(向下取整);
   *   NaN / 负数 / 0 → 1;`Infinity` → 16
   *
   * @example
   * rain.setRenderScale(2);          // 2x 子格
   * rain.setRenderScale('auto');     // 自动模式
   * rain.setRenderScale(1);          // 关闭
   *
   * @since 0.3.0
   */
  setRenderScale(s: number | 'auto'): void;

  /**
   * 读取当前 effective renderScale(总 >= 1 的整数)。
   * - 用户传 number → 返回同值(经钳位)
   * - 用户传 'auto' → 返回当前解析值
   *   (位图未激活时返回 1,激活时返回 2)
   *
   * @since 0.3.0
   */
  getRenderScale(): number;

  /** 动态调闪烁速度倍率(0=冻结, 1=默认, >1=加快) */
  setFlickerSpeed(speed: number): void;

  /**
   * 动态设置目标帧率上限(0=不限)
   * @example rain.setTargetFPS(30); // 后台/手机省电
   * @example rain.setTargetFPS(0);  // 恢复不限
   */
  setTargetFPS(fps: number): void;

  /**
   * 动态调主题参数(亮度/饱和度/色相)· 支持打断与回退
   * @param options.dur 覆盖该次过渡时长(秒)· 不传 = 走 `themeTransitionDuration`
   * @param options.easing 覆盖该次曲线(`'smooth' | 'linear'`)· 不传 = 走全局 `easing`
   * @since 0.4.0 dur + easing 选项
   */
  setThemeParams(
    params: Partial<ThemeParams>,
    options?: { dur?: number; easing?: EasingMode }
  ): void;
  setColdThemeParams(
    params: Partial<ThemeParams>,
    options?: { dur?: number; easing?: EasingMode }
  ): void;
  setWarmThemeParams(
    params: Partial<ThemeParams>,
    options?: { dur?: number; easing?: EasingMode }
  ): void;

  /** 热更新时间驱动色相旋转速度 */
  setHueRotate(speed: number, amount?: number): void;

  /** 热更新颜色注入(传 null 清除) */
  setColorOverrides(overrides: ColorOverrides | null): void;

  /**
   * 动态调变体参数(phase/sin 振幅/avalanche 速度等)· 支持打断与回退
   * @param options.dur 覆盖该次过渡时长(秒)· 不传 = 走 `variantTransitionDuration`
   * @param options.easing 覆盖该次曲线(`'smooth' | 'linear'`)· 不传 = 走全局 `easing`
   * @since 0.4.0 dur + easing 选项
   */
  setVariantParams(
    params: Partial<VariantParams>,
    options?: { dur?: number; easing?: EasingMode }
  ): void;

  /** 热更新亮度曲线(null 清除) */
  setBrightnessCurve(code: string | null): void;
  /** 热更新闪烁概率曲线 */
  setFlickerCurve(code: string | null): void;
  /** 热更新 phase 增量函数 */
  setPhaseFunc(code: string | null): void;
  /** 热更新字符分布函数 */
  setCharsetFunc(code: string | null): void;

  /** 热更新颜色动态曲线 */
  setColorCurve(code: string | null): void;

  /**
   * 设置目标位图(0-1 灰度, 长度 r * i) + 计时器自动重置
   * @throws {RangeError} 当 Float32Array 长度 > 10000 cells(防内存炸弹)或与 targetCols × targetRows 不一致
   * @since 0.2.0 输入校验(0.1.0 仅接受 Float32Array,0.2.0 起支持 `{ cols, rows, data }` 包装对象)
   */
  setTargetBitmap(
    bitmap: Float32Array | { cols: number; rows: number; data: Float32Array } | null,
    opts?: {
      fadeIn?: number;
      hold?: number;
      fadeOut?: number;
      chaos?: number;
      anchor?: 'topLeft' | 'center' | 'topRight' | 'bottomLeft' | 'bottomRight';
      motion?: 'static' | 'drift' | 'bounce' | 'float';
      motionSpeed?: number;
      phase?: 'fade' | 'noise-converge';
      noiseDuration?: number;
      convergeDuration?: number;
      lockOrder?: 'random' | 'topdown' | 'bottomup' | 'center' | 'edge' | 'leftright' | 'rightleft';
      lockStability?: number;
      /**
       * 临时覆盖 instance.targetFitMode(单次生效)
       * - 'contain' / 'cover' / 'actual' / 'auto'
       * - 不传 → 走实例 targetFitMode(默认 'contain')
       */
      fitMode?: 'contain' | 'cover' | 'actual' | 'auto';
      /** 可选:切换 phase 时,跨阶段过渡时长(秒)。不传则走实例默认 phaseTransitionDuration */
      phaseTransitionDuration?: number;
    }
  ): void;
  /** 立即淑出(提前结束显示) */
  clearTargetBitmap(): void;

  /**
   * 软淡入/淡出 alpha(0=全透明,1=全不透明)
   * - 用于:路由切换/页面离开时优雅淡出;新实例淡入
   * - 不影响性能:在 LUT 输出端乘 alpha,无额外 LUT 重建
   * - alpha=1 时完全等价于未启用
   * - **支持打断与回退** —— 若调用时上一次过渡还在进行,新动画的 from 取当前 alpha 值
   *
   * @param alpha 目标透明度 0-1
   * @param opts 可选 · 接受 `number`(向后兼容,当 dur 传)或 options 对象 `{ dur?, easing? }`
   *   - `dur` 渐变时长(秒)· 不传或 0 = 立即切换;>0 = 在 dur 秒内插值
   *   - `easing` 该次曲线(`'smooth' | 'linear'`)· 不传 = 走全局 `easing`
   * @since 0.2.0
   * @since 0.4.0 options 对象支持 dur + easing
   */
  setTransitionAlpha(alpha: number, opts?: number | { dur?: number; easing?: EasingMode }): void;
  /** 读取当前 transition alpha(测试用) @since 0.2.0 */
  getTransitionAlpha?(): number;

  /**
   * 热更新全局过渡曲线(0.4.0+)
   * @param mode 'smooth' = cubic ease(默认),'linear' = 纯线性
   * @since 0.4.0
   */
  setEasing(mode: EasingMode): void;
  /**
   * 读取当前全局过渡曲线(0.4.0+)
   * @since 0.4.0
   */
  getEasing(): EasingMode;

  /** 读取当前 fps */
  getFPS(): number;

  /** 读取当前生效配置快照(主题 + 变体 + 全部参数) */
  getOptions(): MatrixRainOptions;

  /** 导出 JSON 字符串(用于 SSR hydration / 持久化) */
  serialize(): string;

  /** 读取最近一次 userFunc 编译错误 */
  getDiagnostics(): {
    brightnessCurve?: string;
    flickerCurve?: string;
    phaseFunc?: string;
    charsetFunc?: string;
    colorCurve?: string;
    userCallbackError?: {
      name: 'onFrame' | 'onResize' | 'onThemeChange' | 'onTargetFinish';
      message: string;
      frame?: number;
    } | null;
  };

  /**
   * 读取目标位图状态机当前快照(noise-converge 模式调试用)
   * - phase: 'idle' | 'noise' | 'converge' | 'hold' | 'dissolve'
   * - elapsed: 相对 targetStartTime 的墙钟秒数
   * - lockedCount / totalTargets: 目标区已锁 cell 数 / 总数
   * - transitionAlpha: 当前 instance-level 软淡入/淡出 alpha
   * - phaseTransition / themeTransition / themeParamsTransition / variantTransition:
   *   过渡进行中时返回 { fromPhase?, progress, dur };null = 不在过渡
   * @since 0.2.0
   */
  getTargetState?(): {
    active: boolean;
    phase: 'idle' | 'noise' | 'converge' | 'hold' | 'dissolve';
    elapsed: number;
    lockedCount: number;
    unlockedCount: number;
    totalTargets: number;
    lockOrder: string;
    targetPhase: 'fade' | 'noise-converge';
    noiseDuration: number;
    convergeDuration: number;
    lockStability: number;
    targetDissolveStartTime: number;
    transitionAlpha: number;
    phaseTransition: { fromPhase: 'fade' | 'noise-converge'; progress: number; dur: number } | null;
    themeTransition: { progress: number; dur: number } | null;
    themeParamsTransition: { progress: number; dur: number } | null;
    variantTransition: { progress: number; dur: number } | null;
  };

  /** 读取 clickBurst 当前状态(测试用) */
  getClickBurstState?(): { active: boolean; x: number; y: number; t: number };

  /**
   * 读取 renderer 健康快照(0.6.0+:用于真实调试 / 自动化测试)
   * - WebGL: `lastGlError` = gl.getError() 最近一次值(0 = NO_ERROR)
   * - WebGPU: `lastErrorScope` = popErrorScope() 最近一次错误 message,null = 无错误
   * - canvas2d: 上述两字段恒为 0 / null(无 GL 错误源)
   * - 其他字段:frameCount / drawCallIdx / instanceCount / gridCols / gridRows /
   *   initDurationMs / lastFrameDurationMs / droppedFrames / lastInitError
   *
   * @since 0.6.0
   */
  getRendererHealth(): RendererHealth;
}

/**
 * Renderer 健康快照(0.6.0+:返回 `Object.freeze` 副本)
 * @since 0.6.0
 */
export interface RendererHealth {
  /** 实际渲染器类型 */
  readonly renderer: 'canvas2d' | 'webgl' | 'webgpu';
  /** init() 是否完成(未完成时 draw* / render 会 no-op) */
  readonly initialized: boolean;
  /** 从 init() 完成后累计的帧数 */
  readonly frameCount: number;
  /** 当前帧调 drawChar 写入 instance buffer 的次数(0.4.1+ P0-1 修复后用 _drawCallIdx) */
  readonly drawCallIdx: number;
  /** instance buffer 总容量(通常 = gridCols × gridRows) */
  readonly instanceCount: number;
  /** 当前 grid 列数(state.r) */
  readonly gridCols: number;
  /** 当前 grid 行数(state.i) */
  readonly gridRows: number;
  /** init() 耗时(毫秒),init 未完成 = 0 */
  readonly initDurationMs: number;
  /** 上一帧 render() 耗时(毫秒) */
  readonly lastFrameDurationMs: number;
  /** 自启动以来 fps < 30 的帧数 */
  readonly droppedFrames: number;
  /** WebGL: gl.getError() 最近一次返回值(0 = NO_ERROR),WebGPU/canvas2d = 0 */
  readonly lastGlError: number;
  /** WebGPU: popErrorScope() 最近一次错误 message,null = 无错误,canvas2d/webgl = null */
  readonly lastErrorScope: string | null;
  /** init() 失败时的 Error.message(可空) */
  readonly lastInitError: string | null;
  /** WebGL context-lost / WebGPU device-lost 累计次数(0.7.1+ 含自愈后恢复) */
  readonly contextLostCount: number;
  /** 0.7.1+ 当前持有的 GPU 纹理数(canvas2d = 0) */
  readonly textureCount: number;
  /** 0.7.1+ GPU buffer 显存占用估算(bytes;canvas2d = 0) */
  readonly gpuMemoryBytes: number;
}

/** 视口宽度分档(<768 / 768-1024 / 1024-1440 / ≥1440) */
export type ViewportBucket = 'mobile' | 'tablet' | 'desktop' | 'wide';

/** 浏览器型号(粗粒度 · UA 正则) */
export type BrowserName = 'Chrome' | 'Firefox' | 'Safari' | 'Edge' | 'Opera' | 'IE' | 'Unknown';

/**
 * 环境检测结果
 * @since 0.2.0
 */
export interface EnvironmentInfo {
  /** 是否移动端(UA + 视口分档 + coarse pointer 综合判断) */
  isMobile: boolean;
  /** 偏好暗色模式 */
  isDarkMode: boolean;
  /** 推荐字号(移动端 16) */
  recommendedFontSize: number;
  /** 推荐 targetFPS(移动端 30) */
  recommendedTargetFPS: number;
  /** 推荐 brightness 乘数(暗色模式 1.1) */
  recommendedBrightness: number;
  /** 浏览器型号(SSR / 不识别时为 'Unknown') */
  browser: BrowserName;
  /** 视口宽度分档 */
  viewport: ViewportBucket;
  /** 当前视口宽度像素(SSR / 不可用时为 0) */
  viewportWidth: number;
  /** devicePixelRatio(SSR / 不可用时为 1) */
  devicePixelRatio: number;
  /** 0.4.0+ 浏览器支持 WebGL2(98% 覆盖) */
  hasWebGL2: boolean;
  /** 0.4.0+ 浏览器支持 WebGPU(75% 覆盖,Firefox 暂未) */
  hasWebGPU: boolean;
  /** 0.4.0+ 根据 viewport + fontSize + 浏览器能力推荐的 renderer */
  recommendedRenderer: 'canvas2d' | 'webgl' | 'webgpu';
  /** 0.7.1+ 包版本(构建时注入) */
  version: string;
}

/** 默认主题导出 */
export const themes: Record<ThemeName, ThemeFactory>;

/** 主导出 */
export default function matrixRain(options?: MatrixRainOptions): MatrixRainInstance;
export { matrixRain };

/** 命名空间:静态工具 */
export const MatrixRain: {
  /** 销毁所有活跃实例 */
  destroyAll(container?: HTMLElement): number;
  /** 当前活跃实例数 */
  readonly activeCount: number;
  /** 从 snapshot 还原一个实例(SSR hydration) */
  fromSnapshot(
    json: string | MatrixRainSnapshot,
    options?: { canvas?: HTMLCanvasElement; container?: HTMLElement }
  ): MatrixRainInstance;
  /**
   * 环境检测(读 navigator.userAgent + matchMedia + 视口宽)
   * - SSR / Node 环境安全调用:返回 `browser: 'Unknown'` / `viewportWidth: 0` / `devicePixelRatio: 1`
   * - 用于:启动时自动选择 `fontSize` / `targetFPS` / `brightness`,无需硬编码设备分支
   * @since 0.2.0
   */
  detect(): EnvironmentInfo;
  /**
   * 安装全局错误兜底(0.5.2+)
   *
   * 默认不开启(opt-in),避免与用户自带的 Sentry / Bugsnag 冲突。
   * 监听 `window.error` 与 `window.unhandledrejection` 两种事件,统一回调给用户。
   *
   * 用法:
   * ```ts
   * const remove = MatrixRain.installGlobalErrorHandler({
   *   onError: (e) => {
   *     // e.type: 'error' | 'unhandledrejection'
   *     // e.message: 错误信息
   *     // e.filename / e.line / e.col: 仅 'error' 类型有
   *     myLogger.report(e);
   *   }
   * });
   *
   * // 测试 / 卸载:
   * remove();
   * ```
   *
   * SSR 安全:`typeof window === 'undefined'` 时返回 noop。
   *
   * @param opts.onError 必填 · 错误回调
   * @returns 卸载函数(调用后移除两个 listener)
   * @since 0.5.2
   */
  installGlobalErrorHandler(opts: {
    onError: (e: {
      type: 'error' | 'unhandledrejection';
      message: string;
      filename?: string;
      line?: number;
      col?: number;
    }) => void;
  }): () => void;
};
