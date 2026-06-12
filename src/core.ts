/**
 * @xietuier/matrix-rain · SSR 友好核心模块
 *
 * 纯非 DOM 代码:主题工厂 / HSL 调色板 / LUT / 位图转换工具 / 曲线编译 / 变体默认值
 * 不依赖 document / window / canvas · 可以在 Node / SSR / Edge 环境中安全 import
 *
 * 典型用途:
 *   - Nuxt / Next SSR: import { themes, textToBitmap, PRESETS } from '@xietuier/matrix-rain/core'
 *   - 在服务端预生成位图 / 验证主题配置 / 编译用户函数代码
 *   - Worker / Deno / Bun / Cloudflare Workers 等无 DOM 环境
 *
 * 注意:
 *   - textToBitmap / imageToBitmap / fileToImage 在 Node 环境无 document 会 throw,
 *     仅供浏览器使用;服务端需要预渲染请用预生成工具或自定义实现
 *   - 真正的渲染请走主入口 `@xietuier/matrix-rain` 或 `./engine`
 */

export { themes } from './themes';
export { VARIANT_DEFAULTS } from './variant-defaults';
export type { BitmapSource, TextToBitmapOptions } from './bitmap';

// 调色板 / LUT(纯函数,SSR 安全)
export { LUT_SIZE, hslToRGBA, applyTP, PaletteLUT, type RGBALUT } from './palette-lut';

// 位图:仅纯数据转换与代码生成
export { channelsToCode, WAVE_TYPES, COMBINE_MODES, evalWave, evalChannels } from './curves/waves';
export {
  controlPointsToCode,
  buildLUT,
  sampleLUT,
  LUT_RESOLUTION,
  CONTROL_POINTS,
  DEFAULT_CONTROL_POINTS,
} from './curves/lut';
export { PRESETS } from './curves/presets';

// 用户函数编译(纯字符串 → 函数,与 DOM 无关)
export { compileUserFunction, validateUserFunction, ease, SAFE_GLOBALS } from './curves/sandbox';

// 类型导出
export type {
  MatrixRainOptions,
  MatrixRainInstance,
  Palette,
  RGBA,
  HSLPalette,
  ThemeName,
  VariantName,
  ThemeFactory,
  ThemeResult,
  ThemeParams,
  VariantParams,
  RendererHealth,
} from '../types';

export type { Preset, WaveType, CombineMode, WaveChannel, SandboxContext } from './curves/presets';
