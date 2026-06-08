/**
 * @xietuier/matrix-rain · RGBA 调色板查找表
 *
 * 性能优化:把"HSL→RGBA + applyTP + 冷暖混合"从每字符(per-cell)开销转为 per-frame 查表
 * - 静态 LUT(coldStatic / warmStatic):256 项,HSL→RGBA,palette 变化时重建
 * - 终态 LUT(coldFinal / warmFinal):256 项,applyTP 后的 RGBA,TP 或 hue 变化时重建
 * - 混合 LUT(blended[]):32 桶 × 256 项 · (coldStatic × (1-d) + warmStatic × d) + applyTP 全部 bake
 *   桶按 d 量化到 0.03 精度 · 内存代价 32KB / palette
 *   **核心优化**:drawInner 不再调 applyTP,纯 1 次数组读
 *
 * 失效规则:
 *   setPalettes / setTheme → 静态 LUT 重建,终态 LUT + blended 标记 dirty
 *   setThemeParams / setColdThemeParams / setWarmThemeParams → 终态 LUT + blended dirty
 *   setHueRotate / dynamicHue / colorCurve → 终态 LUT + blended dirty
 *   colorOverride 完全跳过此 LUT(用专门路径)
 */

import type { HSLPalette, ThemeParams } from '../types';

export const LUT_SIZE = 256;

/** 4 通道 256 项 RGBA 表(分离 r/g/b/a 数组,1 字节/通道) */
export interface RGBALUT {
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
  a: Uint8Array;
}

const newLUT = (): RGBALUT => ({
  r: new Uint8Array(LUT_SIZE),
  g: new Uint8Array(LUT_SIZE),
  b: new Uint8Array(LUT_SIZE),
  a: new Uint8Array(LUT_SIZE),
});

/**
 * 256 阶 HSL→RGBA 转换
 * 输入:l ∈ [0,1] 亮度
 * 输出:[r, g, b, a] r/g/b ∈ [0,255] 整数,a ∈ [0,1] 浮点
 */
export const hslToRGBA = (palette: HSLPalette, l: number): [number, number, number, number] => {
  const li = Math.max(0, Math.min(1, l));
  // lMin/lMax 之间线性插值
  const L = palette.lMin + (palette.lMax - palette.lMin) * li;
  const S = palette.s;
  const H = palette.h / 360;
  const aMax = palette.aMax ?? 1.0;
  // alpha: 从 l=0 透明 渐到 lMax 完全不透明
  const a = aMax * (0.1 + 0.9 * li);
  if (S === 0) {
    const v = Math.round(L * 255);
    return [v, v, v, a];
  }
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hh = H * 6;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hh < 1) {
    r = c;
    g = x;
    b = 0;
  } else if (hh < 2) {
    r = x;
    g = c;
    b = 0;
  } else if (hh < 3) {
    r = 0;
    g = c;
    b = x;
  } else if (hh < 4) {
    r = 0;
    g = x;
    b = c;
  } else if (hh < 5) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  const m = L - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255), a];
};

/**
 * applyTP:对 RGB 应用 ThemeParams(brightness/contrast/lightnessShift/saturation/chroma/hueShift/invertHue)
 * 输入:r/g/b ∈ [0,255] 整数,useTP: ThemeParams,extraHue: 额外色相偏移(度)
 * 输出:[r, g, b] ∈ [0,255] 整数
 *
 * **性能注**:此函数在 LUT bake 时调用 256 次/帧(每调色板),不在热路径
 * 即使全 hue 旋转,~50 op/调用 × 256 = 12.8K op/帧,LUT bake 不再是瓶颈
 */
export const applyTP = (
  r: number,
  g: number,
  b: number,
  p: ThemeParams,
  extraHue: number = 0
): [number, number, number] => {
  // brightness
  r *= p.brightness;
  g *= p.brightness;
  b *= p.brightness;
  // contrast(在 128 中心点拉伸,0=全灰,1=原,2=极端)
  if (p.contrast !== 1) {
    r = 128 + (r - 128) * p.contrast;
    g = 128 + (g - 128) * p.contrast;
    b = 128 + (b - 128) * p.contrast;
  }
  // lightnessShift(±255 加成, clamp 0-255)
  if (p.lightnessShift !== 0) {
    const d = p.lightnessShift * 255;
    r += d;
    g += d;
    b += d;
  }
  // saturationShift(±1: -1=全灰, 0=原, +1=最大饱和)
  if (p.saturationShift !== 0) {
    const avg = (r + g + b) / 3;
    const m = 1 + p.saturationShift; // 0 表示全灰
    r = avg + (r - avg) * m;
    g = avg + (g - avg) * m;
    b = avg + (b - avg) * m;
  }
  // chroma(0=灰阶, 1=原色)
  if (p.chroma < 1) {
    const avg = (r + g + b) / 3;
    r = avg + (r - avg) * p.chroma;
    g = avg + (g - avg) * p.chroma;
    b = avg + (b - avg) * p.chroma;
  }
  // hueShift(HSL 上的 H 偏移)
  if (p.hueShift !== 0 || extraHue !== 0) {
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      let h: number;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = h * 60 + p.hueShift + extraHue; // 度数
      h = ((h % 360) + 360) % 360;
      const c = (1 - Math.abs((2 * l) / 255 - 1)) * (max - min);
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m2 = l - c / 2;
      let nr = 0,
        ng = 0,
        nb = 0;
      if (h < 60) {
        nr = c;
        ng = x;
        nb = 0;
      } else if (h < 120) {
        nr = x;
        ng = c;
        nb = 0;
      } else if (h < 180) {
        nr = 0;
        ng = c;
        nb = x;
      } else if (h < 240) {
        nr = 0;
        ng = x;
        nb = c;
      } else if (h < 300) {
        nr = x;
        ng = 0;
        nb = c;
      } else {
        nr = c;
        ng = 0;
        nb = x;
      }
      r = nr + m2;
      g = ng + m2;
      b = nb + m2;
    }
  }
  // invertHue(0=正常, 1=反色)
  if (p.invertHue > 0) {
    const k = p.invertHue;
    r = r * (1 - k) + (255 - r) * k;
    g = g * (1 - k) + (255 - g) * k;
    b = b * (1 - k) + (255 - b) * k;
  }
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
  ];
};

/**
 * PaletteLUT:管理冷暖双调色板的两层 LUT
 *
 * 用法:
 *   const lut = new PaletteLUT();
 *   lut.setPalettes(cold, warm);
 *   // 每帧:
 *   const coldFinal = lut.getColdFinal(ctp, dynamicHue);
 *   const warmFinal = lut.getWarmFinal(wtp, dynamicHue);
 *   // 每 cell:
 *   const idx = (l * 255) | 0;
 *   const r = coldFinal.r[idx]; // 等
 */
/** 第三层 LUT 的 warmth 桶数(d 量化到 1/NBUCKETS) */
const D_BUCKETS = 32;

export class PaletteLUT {
  private coldStatic: RGBALUT = newLUT();
  private warmStatic: RGBALUT = newLUT();
  private coldFinal: RGBALUT = newLUT();
  private warmFinal: RGBALUT = newLUT();
  /**
   * 第三层 LUT:32 个桶,每个桶是 256 项 RGBA
   * 内容 = coldFinal[lIdx] * (1-d) + warmFinal[lIdx] * d,然后 applyTP 全部 bake
   * 内存:32 * 256 * 4 = 32KB / palette,64KB 总
   *
   * 这是"applyTP 不再在热路径调"的关键:
   *   drawInner 之前要 6 次数组读 + 4 次乘法 + applyTP(30 op)
   *   现在 1 次数组读 + 1 次乘法(alpha) → 4-5 op
   */
  private blended: RGBALUT[] = Array.from({ length: D_BUCKETS }, newLUT);
  private blendedHash: string[] = new Array(D_BUCKETS).fill('');

  private coldPalette: HSLPalette | null = null;
  private warmPalette: HSLPalette | null = null;

  // Hash cache: 用来检测 TP/hue 是否变化,决定是否重建终态 LUT
  private coldFinalHash = '';
  private warmFinalHash = '';

  /**
   * 设置冷暖调色板(参考身份比较避免无意义重建)
   * 调用后静态 LUT 重建,终态 LUT 标记 dirty
   */
  setPalettes(cold: HSLPalette, warm: HSLPalette): void {
    const coldChanged = cold !== this.coldPalette;
    const warmChanged = warm !== this.warmPalette;
    if (!coldChanged && !warmChanged) return;

    if (coldChanged) {
      this.coldPalette = cold;
      this.rebuildStatic(this.coldStatic, cold);
    }
    if (warmChanged) {
      this.warmPalette = warm;
      this.rebuildStatic(this.warmStatic, warm);
    }
    // 终态 LUT 失效
    this.coldFinalHash = '';
    this.warmFinalHash = '';
    // 第三层 LUT 失效(palette 变了 → coldFinal / warmFinal 变 → blended 输出变)
    for (let i = 0; i < D_BUCKETS; i++) this.blendedHash[i] = '';
  }

  /** 取冷色终态 LUT(tp + dynamicHue 变化时才重建) */
  getColdFinal(tp: ThemeParams, hue: number): RGBALUT {
    return this.getFinal(this.coldStatic, this.coldFinal, tp, hue, 'cold');
  }

  /** 取暖色终态 LUT */
  getWarmFinal(tp: ThemeParams, hue: number): RGBALUT {
    return this.getFinal(this.warmStatic, this.warmFinal, tp, hue, 'warm');
  }

  /**
   * 第三层 LUT:在 getColdFinal / getWarmFinal 之上,再对 (coldFinal, warmFinal)
   * 按 warmth 阻尼 d 预混合 + applyTP 全部 bake。
   *
   * 关键性能:drawInner 原热路径每 cell 调一次 applyTP,在 4,800 cells 网格下
   * 每秒 ~278K 次 applyTP 调用。本 API 把"tp + hue + 冷暖混合"全部 bake 进 LUT,
   * per-cell 路径变纯 1 次数组读。
   *
   * d 量化为 32 桶(0/32, 1/32, ..., 31/32)· 桶内精度 ~0.03
   * 内存:32 × 256 × 4 = 32KB / palette(冷暖各 1 个)
   *
   * 调用方约定:同一帧内同一 d-bucket 可被多 cell 共享(因为桶是离散的)
   *
   * @param d warmth 混合比 d ∈ [0,1](0=全冷,1=全暖)
   * @returns 256 项 RGBA LUT,索引 (l * 255) | 0
   */
  getBlendedLUT(tp: ThemeParams, hue: number, d: number): RGBALUT {
    // 量化 d 到 32 桶
    const di = Math.max(0, Math.min(D_BUCKETS - 1, Math.floor(d * D_BUCKETS)));
    const dQuant = di / D_BUCKETS; // 桶中心值(给 hash 用)
    const hash =
      tp.brightness +
      '|' +
      tp.chroma +
      '|' +
      tp.hueShift +
      '|' +
      tp.saturationShift +
      '|' +
      tp.lightnessShift +
      '|' +
      tp.invertHue +
      '|' +
      tp.contrast +
      '|' +
      (hue | 0) +
      '|' +
      di;
    if (hash === this.blendedHash[di]) return this.blended[di];

    // coldFinal / warmFinal 内部已 TP-baked;再混合 + 再 TP 等价于:
    //   1) blend coldStatic & warmStatic at d → rawBlended
    //   2) applyTP(rawBlended, tp, hue)
    // 注:coldFinal/warmFinal 已经 applyTP 过一次,如果再次对它们的 blend 做 applyTP,
    //    会"双 TP"。所以这里必须从 coldStatic/warmStatic 开始,再 blend + applyTP。
    const dst = this.blended[di];
    const oneMinusD = 1 - dQuant;
    for (let i = 0; i < LUT_SIZE; i++) {
      const cR = this.coldStatic.r[i];
      const cG = this.coldStatic.g[i];
      const cB = this.coldStatic.b[i];
      const wR = this.warmStatic.r[i];
      const wG = this.warmStatic.g[i];
      const wB = this.warmStatic.b[i];
      const cA = this.coldStatic.a[i];
      const wA = this.warmStatic.a[i];
      const rc = cR * oneMinusD + wR * dQuant;
      const gc = cG * oneMinusD + wG * dQuant;
      const bc = cB * oneMinusD + wB * dQuant;
      const [r2, g2, b2] = applyTP(rc, gc, bc, tp, hue);
      dst.r[i] = r2;
      dst.g[i] = g2;
      dst.b[i] = b2;
      dst.a[i] = Math.round((cA * oneMinusD + wA * dQuant) / 255);
    }
    this.blendedHash[di] = hash;
    return dst;
  }

  private getFinal(
    src: RGBALUT,
    dst: RGBALUT,
    tp: ThemeParams,
    hue: number,
    which: 'cold' | 'warm'
  ): RGBALUT {
    // hash 包含所有 TP 字段 + 动态 hue(round to 1° 量化避免浮点抖动)
    const hash =
      tp.brightness +
      '|' +
      tp.chroma +
      '|' +
      tp.hueShift +
      '|' +
      tp.saturationShift +
      '|' +
      tp.lightnessShift +
      '|' +
      tp.invertHue +
      '|' +
      tp.contrast +
      '|' +
      (hue | 0);
    const stored = which === 'cold' ? this.coldFinalHash : this.warmFinalHash;
    if (hash === stored) return dst;

    for (let i = 0; i < LUT_SIZE; i++) {
      const [r, g, b] = applyTP(src.r[i], src.g[i], src.b[i], tp, hue);
      dst.r[i] = r;
      dst.g[i] = g;
      dst.b[i] = b;
      dst.a[i] = src.a[i];
    }
    if (which === 'cold') this.coldFinalHash = hash;
    else this.warmFinalHash = hash;
    return dst;
  }

  private rebuildStatic(dst: RGBALUT, palette: HSLPalette): void {
    for (let i = 0; i < LUT_SIZE; i++) {
      const l = i / 255;
      const [r, g, b, a] = hslToRGBA(palette, l);
      dst.r[i] = r;
      dst.g[i] = g;
      dst.b[i] = b;
      dst.a[i] = Math.round(a * 255);
    }
  }
}
