/**
 * @xietuier/matrix-rain
 * czhmisaka · 数字矩阵背景 · 通用 TypeScript 类型定义
 */

/** 4 通道颜色:R, G, B, alpha(0-1) */
export type RGBA = [number, number, number, number];

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
  classic:   { phaseStep: 0.04, phaseJitter: 0.06, sinWeightA: 0.4, sinWeightB: 0.3, sinWeightC: 0.3, brightCurve: 3.5, chUpdateProb: 0,   headBright: 8, headFalloff: 1, avalancheSpeed: 0.5 },
  ascii:     { phaseStep: 0.04, phaseJitter: 0.06, sinWeightA: 0.4, sinWeightB: 0.3, sinWeightC: 0.3, brightCurve: 3.5, chUpdateProb: 0,   headBright: 8, headFalloff: 1, avalancheSpeed: 0.5 },
  avalanche: { phaseStep: 0.04, phaseJitter: 0.06, sinWeightA: 0.4, sinWeightB: 0.3, sinWeightC: 0.3, brightCurve: 3.5, chUpdateProb: 0.3, headBright: 8, headFalloff: 1, avalancheSpeed: 0.5 },
  ripple:    { phaseStep: 0.05, phaseJitter: 0,    sinWeightA: 0.5, sinWeightB: 0,   sinWeightC: 0,   brightCurve: 8,   chUpdateProb: 0.2, headBright: 8, headFalloff: 1, avalancheSpeed: 0.5 }
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

  /** 残影 alpha(0-1),默认 0.18。越小拖尾越长 */
  trailAlpha?: number;

  /** DPR 缩放上限,默认 2。性能优先可设 1 */
  maxDPR?: number;

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

  /** 变体(改主循环行为) */
  variant?: VariantName;

  /** 自定义画布(默认自动创建) */
  canvas?: HTMLCanvasElement;

  /** 父容器(默认 document.body) */
  container?: HTMLElement;

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
   */
  setTheme(name: ThemeName, options?: { keepPaletteParams?: boolean }): void;

  /** 动态更新色板(高级) */
  setPalettes(cold: Palette, warm: Palette): void;

  /** 动态调密度 */
  setDensity(fontSize: number): void;

  /** 动态调闪烁速度倍率(0=冻结, 1=默认, >1=加快) */
  setFlickerSpeed(speed: number): void;

  /**
   * 动态设置目标帧率上限(0=不限)
   * @example rain.setTargetFPS(30); // 后台/手机省电
   * @example rain.setTargetFPS(0);  // 恢复不限
   */
  setTargetFPS(fps: number): void;

  /** 动态调主题参数(亮度/饱和度/色相) */
  setThemeParams(params: Partial<ThemeParams>): void;
  setColdThemeParams(params: Partial<ThemeParams>): void;
  setWarmThemeParams(params: Partial<ThemeParams>): void;

  /** 热更新时间驱动色相旋转速度 */
  setHueRotate(speed: number, amount?: number): void;

  /** 热更新颜色注入(传 null 清除) */
  setColorOverrides(overrides: ColorOverrides | null): void;

  /** 动态调变体参数(phase/sin 振幅/avalanche 速度等) */
  setVariantParams(params: Partial<VariantParams>): void;

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

  /** 设置目标位图(0-1 灰度, 长度 r * i) + 计时器自动重置 */
  setTargetBitmap(bitmap: Float32Array | { cols: number; rows: number; data: Float32Array } | null, opts?: { fadeIn?: number; hold?: number; fadeOut?: number; chaos?: number; anchor?: 'topLeft'|'center'|'topRight'|'bottomLeft'|'bottomRight'; motion?: 'static'|'drift'|'bounce'|'float'; motionSpeed?: number }): void;
  /** 立即淑出(提前结束显示) */
  clearTargetBitmap(): void;

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
  };

  /** 读取 clickBurst 当前状态(测试用) */
  getClickBurstState?(): { active: boolean; x: number; y: number; t: number };
}

/** 环境检测结果 */
export interface EnvironmentInfo {
  /** 是否移动端 */
  isMobile: boolean;
  /** 偏好暗色模式 */
  isDarkMode: boolean;
  /** 推荐字号(移动端 16) */
  recommendedFontSize: number;
  /** 推荐 targetFPS(移动端 30) */
  recommendedTargetFPS: number;
  /** 推荐 brightness 乘数(暗色模式 1.1) */
  recommendedBrightness: number;
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
  fromSnapshot(json: string | MatrixRainSnapshot, options?: { canvas?: HTMLCanvasElement; container?: HTMLElement }): MatrixRainInstance;
  /** 环境检测 */
  detect(): EnvironmentInfo;
};
