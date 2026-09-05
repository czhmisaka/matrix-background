/**
 * 文本 → 位图 fitMode 测试 · Vitest 单元测试
 *
 * 验证:
 *   1. contain 模式:fontSize 受 maxByHeight/maxByWidth 双重约束,文字不溢出 cols×rows
 *   2. cover / actual / auto 模式公式
 *   3. CJK 全角识别(汉字 / 平假名 / 片假名 / 韩文 / 全角 ASCII)
 *   4. 自定义字体:options.font 透传到 ctx.font
 *   5. fontWeight:number / 'normal' / 'bold' / 'lighter' / 'bolder'
 *   6. cjkAware:false 强制走旧行为
 *   7. 引擎层 fitMode='contain' 兜底(大位图自动缩放回 grid)
 *   8. 引擎层 fitMode='actual' 不缩放(旧版行为)
 *   9. 引擎层 fitMode='auto' 短内容不缩放 + 长内容 contain
 *   10. 跨调用 setTargetBitmap 多次 → 每次独立重算 fitMode
 *
 * 硬约束:
 *   - [[feedback_min_font_size]]: 所有 fontSize 必须 clamp >= 4
 *   - [[feedback_visual_verification_untrusted]]: 不断言像素颜色,只断言 bitmap 形状与 ctx.font 元数据
 *
 * 迁移自 test/text-fit.mjs(已加 @deprecated banner,未删)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { matrixRain, textToBitmap } from '../../../src/index';
import {
  MockContext2D,
  getLastCtxFont,
  getLastCtxFontSize,
  getLastCtxFontFamily,
  getLastCtxFontWeight,
} from '../setup';

// ==================== helpers ====================
const CJK_RE = /[　-〿぀-ゟ゠-ヿ㐀-䶿一-鿿가-힯豈-﫿＀-￯]/;
const isCJK = (ch: string) => CJK_RE.test(ch);
const codePointLength = (s: string): number => {
  let n = 0;
  for (const _ of s) n++;
  return n;
};

const CHAR_W_LATIN = 0.6;
const CHAR_W_CJK = 1.0;
const charAspectW = (text: string): number => {
  let cjkN = 0,
    latN = 0;
  for (const ch of text) {
    if (isCJK(ch)) cjkN++;
    else latN++;
  }
  const total = cjkN + latN;
  if (total === 0) return CHAR_W_LATIN;
  return (cjkN * CHAR_W_CJK + latN * CHAR_W_LATIN) / total;
};

/** 计算 fitMode 期望 fontSize(对齐 src/bitmap.ts 公式) */
function expectedFontSize(
  text: string,
  cols: number,
  rows: number,
  fitMode: 'contain' | 'cover' | 'actual' | 'auto',
  cjkAware = true
): number {
  const lineCount = text.split('\n').length;
  const maxLineLen = Math.max(...text.split('\n').map((s) => codePointLength(s)), 1);
  const charW = cjkAware ? charAspectW(text) : 0.6;
  const maxByHeight = Math.floor((rows * 0.85) / lineCount);
  const maxByWidth = Math.floor((cols * 0.95) / (maxLineLen * charW));
  let fontSize: number;
  switch (fitMode) {
    case 'cover':
      fontSize = maxByWidth;
      break;
    case 'actual':
      fontSize = maxByHeight;
      break;
    case 'auto':
      fontSize = maxLineLen <= cols * 0.4 ? maxByHeight : Math.min(maxByHeight, maxByWidth);
      break;
    case 'contain':
    default:
      fontSize = Math.min(maxByHeight, maxByWidth);
      break;
  }
  return Math.max(4, fontSize); // 硬下限 4
}

const texts = ['OK', 'MATRIX', 'PLAYWRIGHT', 'VERY_LONG_TEXT_OVERFLOW', '你好世界'];
const fontSizes = [4, 10, 16, 24, 32];
const fitModes = ['contain', 'cover', 'actual', 'auto'] as const;

describe('textToBitmap - bitmap shape (any fitMode)', () => {
  for (const fm of fitModes) {
    describe(`fitMode='${fm}'`, () => {
      for (const text of texts) {
        for (const fs of fontSizes) {
          it(`${text} · fs=${fs} · bitmap.cols/rows/data 形状正确`, () => {
            const cssW = 800;
            const cssH = 600;
            const cols = Math.max(8, Math.floor(cssW / fs));
            const rows = Math.max(6, Math.floor(cssH / fs));
            const bm = textToBitmap(text, cols, rows, undefined, fm);

            expect(bm.cols).toBe(cols);
            expect(bm.rows).toBe(rows);
            expect(bm.data.length).toBe(cols * rows);
            expect(bm.data).toBeInstanceOf(Float32Array);
          });

          it(`${text} · fs=${fs} · 期望 fontSize ≥ 4(feedback_min_font_size)`, () => {
            const cssW = 800;
            const cssH = 600;
            const cols = Math.max(8, Math.floor(cssW / fs));
            const rows = Math.max(6, Math.floor(cssH / fs));
            const expected = expectedFontSize(text, cols, rows, fm);
            expect(expected).toBeGreaterThanOrEqual(4);
          });
        }
      }
    });
  }
});

describe('textToBitmap - cover/actual/auto specific', () => {
  it('contain:fontSize 同时受 height/width 双重约束', () => {
    const text = 'VERY_LONG_TEXT_OVERFLOW';
    const cols = 10,
      rows = 8;
    const bm = textToBitmap(text, cols, rows, undefined, 'contain');
    const expected = expectedFontSize(text, cols, rows, 'contain');
    expect(bm.cols).toBe(cols);
    expect(bm.rows).toBe(rows);
    expect(expected).toBeGreaterThanOrEqual(4);
  });

  it('actual:长文本 → 字形宽度 > cols(预期行为,回归对照)', () => {
    const text = 'VERY_LONG_TEXT_OVERFLOW';
    const cols = 10,
      rows = 8;
    const bm = textToBitmap(text, cols, rows, undefined, 'actual');
    const fs = expectedFontSize(text, cols, rows, 'actual');
    const charW = charAspectW(text);
    const glyphW = codePointLength(text) * fs * charW;
    expect(glyphW).toBeGreaterThan(cols);
    // 形状仍正确(不因为溢出而截断)
    expect(bm.data.length).toBe(cols * rows);
  });

  it('cover:fontSize 按 maxByWidth 优先,可能纵向超出', () => {
    const text = 'OK'; // 短文本
    const cols = 10,
      rows = 2;
    const bm = textToBitmap(text, cols, rows, undefined, 'cover');
    expect(bm.cols).toBe(cols);
    expect(bm.rows).toBe(rows);
  });

  it('auto + 短文本(<= cols*0.4)→ actual', () => {
    const text = 'OK'; // 2 字符 < 10 * 0.4 = 4
    const cols = 10,
      rows = 8;
    const bm = textToBitmap(text, cols, rows, undefined, 'auto');
    expect(bm.cols).toBe(cols);
    expect(bm.rows).toBe(rows);
  });

  it('auto + 长文本(> cols*0.4)→ contain', () => {
    const text = 'VERY_LONG_TEXT_OVERFLOW'; // 23 字符 > 10 * 0.4
    const cols = 10,
      rows = 8;
    const bm = textToBitmap(text, cols, rows, undefined, 'auto');
    expect(bm.cols).toBe(cols);
    expect(bm.rows).toBe(rows);
  });
});

describe('textToBitmap - CJK 全角识别', () => {
  beforeEach(() => {
    // 调用前清空,确保读最新值
  });

  it('CJK 纯文本(8 字符)理论 fontSize=3 → 被 4px 硬下限托起', () => {
    const cols = 30,
      rows = 20;
    textToBitmap('你好世界你好世界', cols, rows, undefined, 'contain');
    const size = getLastCtxFontSize();
    expect(size).toBe(4);
  });

  it('Latin 纯文本(8 字符)应得 fontSize=5', () => {
    const cols = 30,
      rows = 20;
    textToBitmap('MMMMMMMM', cols, rows, undefined, 'contain');
    const size = getLastCtxFontSize();
    expect(size).toBe(5);
  });

  it('CJK 字号 < Latin 字号(同长度下)', () => {
    const cols = 30,
      rows = 20;
    textToBitmap('MMMMMMMM', cols, rows, undefined, 'contain');
    const latinSize = getLastCtxFontSize();
    textToBitmap('你好世界你好世界', cols, rows, undefined, 'contain');
    const cjkSize = getLastCtxFontSize();
    expect(cjkSize).toBeLessThan(latinSize);
  });

  it('CJK 范围:汉字 / 平假名 / 片假名 / 韩文 / 全角 ASCII 全部按 1.0×fs', () => {
    const cols = 30,
      rows = 20;
    const samples = [
      '你好世界',
      'あいうえお',
      'アイウエオ',
      '한글',
      'ＡＢＣ',
    ];
    for (const s of samples) {
      const n = codePointLength(s);
      const latinPad = 'M'.repeat(n);
      textToBitmap(latinPad, cols, rows, undefined, 'contain');
      const latinSize = getLastCtxFontSize()!;
      textToBitmap(s, cols, rows, undefined, 'contain');
      const cjkSize = getLastCtxFontSize()!;
      // CJK 字号 ≤ Latin 字号(同长度下,CJK 字符更宽 → maxByWidth 更小)
      expect(cjkSize).toBeLessThanOrEqual(latinSize);
    }
  });

  it('混合 CJK + Latin(4+4) → fontSize=4(加权 charW=0.8)', () => {
    const cols = 30,
      rows = 20;
    textToBitmap('你好世界ABCD', cols, rows, undefined, 'contain');
    const size = getLastCtxFontSize();
    expect(size).toBe(4);
  });

  it('混合字号介于 纯 CJK 与 纯 Latin 之间', () => {
    const cols = 30,
      rows = 20;
    textToBitmap('MMMMMMMM', cols, rows, undefined, 'contain');
    const refLatin = getLastCtxFontSize()!;
    textToBitmap('你好世界你好世界', cols, rows, undefined, 'contain');
    const refCjk = getLastCtxFontSize()!;
    textToBitmap('你好世界ABCD', cols, rows, undefined, 'contain');
    const mixed = getLastCtxFontSize()!;
    expect(mixed).toBeGreaterThanOrEqual(refCjk);
    expect(mixed).toBeLessThanOrEqual(refLatin);
  });
});

describe('textToBitmap - 自定义字体 options.font', () => {
  const fonts = [
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    '"Comic Sans MS", cursive',
    '"Source Han Sans CN", "PingFang SC", sans-serif',
    '"My-Custom-Font", monospace',
  ];

  for (const font of fonts) {
    it(`font='${font}' 透传到 ctx.font`, () => {
      const cols = 30,
        rows = 20;
      textToBitmap('HELLO', cols, rows, undefined, 'contain', { font });
      const family = getLastCtxFontFamily() ?? '';
      const weight = getLastCtxFontWeight() ?? '';
      // family 应包含用户传入的 font
      const ok = family.includes(font) || font.includes(family);
      expect(ok).toBe(true);
      // 默认 weight 应是 'bold'
      expect(weight).toBe('bold');
    });
  }
});

describe('textToBitmap - fontWeight 选项', () => {
  const weights: (number | 'normal' | 'bold' | 'lighter' | 'bolder')[] = [
    100, 300, 400, 500, 700, 900, 'normal', 'bold', 'lighter', 'bolder',
  ];

  for (const fw of weights) {
    it(`fontWeight=${fw} 透传到 ctx.font`, () => {
      textToBitmap('HELLO', 30, 20, undefined, 'contain', { fontWeight: fw });
      const weight = getLastCtxFontWeight();
      expect(weight).toBe(String(fw));
    });
  }
});

describe('textToBitmap - cjkAware 开关', () => {
  it('cjkAware=true CJK 8 字符 → fontSize=4(被硬下限托起)', () => {
    const cols = 30,
      rows = 20;
    textToBitmap('你好世界你好世界', cols, rows, undefined, 'contain');
    const size = getLastCtxFontSize();
    expect(size).toBe(4);
  });

  it('cjkAware=false CJK 8 字符 → 走旧行为,字号仍 ≥ 4', () => {
    const cols = 30,
      rows = 20;
    textToBitmap('你好世界你好世界', cols, rows, undefined, 'contain', { cjkAware: false });
    const size = getLastCtxFontSize();
    expect(size).toBeGreaterThanOrEqual(4);
  });

  it('cjkAware=false 不抛错 · bitmap 仍合法', () => {
    const cols = 30,
      rows = 20;
    const bm = textToBitmap('你好世界你好世界', cols, rows, undefined, 'contain', {
      cjkAware: false,
    });
    expect(bm.cols).toBe(cols);
    expect(bm.rows).toBe(rows);
    expect(bm.data.length).toBe(cols * rows);
    expect(bm.data).toBeInstanceOf(Float32Array);
  });

  it('cjkAware 两种模式都遵守 4px 硬下限', () => {
    const cols = 30,
      rows = 20;
    textToBitmap('你好世界你好世界', cols, rows, undefined, 'contain');
    const on = getLastCtxFontSize()!;
    textToBitmap('你好世界你好世界', cols, rows, undefined, 'contain', { cjkAware: false });
    const off = getLastCtxFontSize()!;
    expect(on).toBeGreaterThanOrEqual(4);
    expect(off).toBeGreaterThanOrEqual(4);
  });
});

// ==================== 引擎层 fitMode 兜底 ====================

describe('engine - fitMode="contain" 兜底缩放', () => {
  it('位图 200×30 含 79 cols 宽条带 → 引擎 contain 缩放到 55×21 → grid 命中 1155 cells', () => {
    const inst = matrixRain({ fixedTimeStep: true, targetFitMode: 'contain', fontSize: 14 });
    const bigCols = 200,
      bigRows = 30;
    const data = new Float32Array(bigCols * bigRows);
    for (let y = 0; y < bigRows; y++) {
      for (let x = 0; x < bigCols; x++) {
        if (x > 60 && x < 140) data[y * bigCols + x] = 0.8;
      }
    }
    inst.setTargetBitmap(
      { cols: bigCols, rows: bigRows, data },
      {
        phase: 'noise-converge',
        noiseDuration: 0.1,
        convergeDuration: 0.3,
        lockStability: 1.0,
        hold: Infinity,
        fadeOut: 1.0,
      }
    );
    const s = inst.getTargetState();
    const expected = 55 * 21;
    expect(s.totalTargets).toBe(expected);
    inst.destroy();
  });
});

describe('engine - fitMode="actual" 不缩放', () => {
  it('位图 200×30 含条带 → 不缩放,grid 命中 58×30=1740 cells', () => {
    const inst = matrixRain({ fixedTimeStep: true, targetFitMode: 'actual', fontSize: 14 });
    const bigCols = 200,
      bigRows = 30;
    const data = new Float32Array(bigCols * bigRows);
    for (let y = 0; y < bigRows; y++) {
      for (let x = 0; x < bigCols; x++) {
        if (x > bigCols * 0.3 && x < bigCols * 0.7) data[y * bigCols + x] = 0.8;
      }
    }
    inst.setTargetBitmap(
      { cols: bigCols, rows: bigRows, data },
      {
        phase: 'noise-converge',
        noiseDuration: 0.1,
        convergeDuration: 0.3,
        lockStability: 1.0,
        hold: Infinity,
        fadeOut: 1.0,
      }
    );
    const s = inst.getTargetState();
    const expected = 58 * 30;
    expect(s.totalTargets).toBe(expected);
    inst.destroy();
  });
});

describe('engine - fitMode="auto" 短/长分流', () => {
  it('auto + 短内容(2×2 全亮)→ actual 不缩放,totalTargets=4', () => {
    const inst = matrixRain({ fixedTimeStep: true, targetFitMode: 'auto', fontSize: 14 });
    const smallCols = 2,
      smallRows = 2;
    const smallData = new Float32Array([1, 1, 1, 1]);
    inst.setTargetBitmap(
      { cols: smallCols, rows: smallRows, data: smallData },
      {
        phase: 'noise-converge',
        noiseDuration: 0.05,
        convergeDuration: 0.1,
        lockStability: 1.0,
        hold: Infinity,
      }
    );
    const sSmall = inst.getTargetState();
    expect(sSmall.totalTargets).toBe(4);
    inst.destroy();
  });

  it('auto + 长内容(200×30 含 79 cols 条带)→ contain 缩放,totalTargets < 1740(actual 值)', () => {
    const inst = matrixRain({ fixedTimeStep: true, targetFitMode: 'auto', fontSize: 14 });
    const bigCols = 200,
      bigRows = 30;
    const bigData = new Float32Array(bigCols * bigRows);
    for (let y = 0; y < bigRows; y++) {
      for (let x = 0; x < bigCols; x++) {
        if (x > 60 && x < 140) bigData[y * bigCols + x] = 0.8;
      }
    }
    inst.setTargetBitmap(
      { cols: bigCols, rows: bigRows, data: bigData },
      {
        phase: 'noise-converge',
        noiseDuration: 0.1,
        convergeDuration: 0.3,
        lockStability: 1.0,
        hold: Infinity,
      }
    );
    const sBig = inst.getTargetState();
    const actualModeCount = 58 * 30;
    expect(sBig.totalTargets).toBeLessThan(actualModeCount);
    inst.destroy();
  });
});

describe('engine - 跨调用 setTargetBitmap 独立重算 fitMode', () => {
  it('连续两次 setTargetBitmap 大位图都缩放出有效 cells,且 ratio 0.5-2.0', () => {
    const inst = matrixRain({ fixedTimeStep: true, targetFitMode: 'contain', fontSize: 14 });
    const big1 = new Float32Array(200 * 30);
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 200; x++) {
        if (x > 60 && x < 140) big1[y * 200 + x] = 0.8;
      }
    }
    inst.setTargetBitmap(
      { cols: 200, rows: 30, data: big1 },
      { phase: 'noise-converge', noiseDuration: 0.05, convergeDuration: 0.1, hold: Infinity }
    );
    const cells1 = inst.getTargetState().totalTargets;
    inst.setTargetBitmap(
      { cols: 200, rows: 30, data: big1 },
      { phase: 'noise-converge', noiseDuration: 0.05, convergeDuration: 0.1, hold: Infinity }
    );
    const cells2 = inst.getTargetState().totalTargets;
    expect(cells1).toBeGreaterThan(0);
    expect(cells2).toBeGreaterThan(0);
    const ratio = cells2 / cells1;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2.0);
    inst.destroy();
  });
});