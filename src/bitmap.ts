/**
 * @xietuier/matrix-rain · 文字/图片转灰度位图
 *
 * 把用户输入的文本/图片缩放到 网格 (cols × rows),生成 0-1 灰度 Float32Array
 * 文字: 用 OffscreenCanvas 2D 渲染文本 → 缩放到网格 → 取 alpha 通道作为灰度
 * 图片: 用 Image + OffscreenCanvas 缩放 → 取亮度
 */

/** 位图 → 网格的缩放策略
 * - 'contain' (默认):内容完整显示,可能留空
 * - 'cover':填满网格,可能裁切
 * - 'actual':按原始尺寸渲染(可能溢出,旧版默认)
 * - 'auto':根据内容自动选 contain / actual
 */
export type FitMode = 'contain' | 'cover' | 'actual' | 'auto';

export interface BitmapSource {
  /** 列数(cols) */
  cols: number;
  /** 行数(rows) */
  rows: number;
  /** 灰度数据 0-1, 长度 cols*rows */
  data: Float32Array;
}

/** 文字 → 灰度位图
 *
 * **关键设计**:画布 = grid 尺寸,字形不超采样
 * 一位 = 一个 grid cell,字形在画布上画完后直接 getImageData 读
 *
 * cols/rows · bitmap 输出尺寸(= grid 尺寸)
 *
 * @param fitMode 缩放策略,默认 'contain'(完整显示,不溢出)
 *   - contain: 取 min(maxByHeight, maxByWidth) · 短文本按高度定,长文本按宽度压
 *   - cover:   取 maxByWidth · 尽可能填满 cols
 *   - actual:  取 maxByHeight · 按高度自然渲染,可能溢出 cols(旧版行为)
 *   - auto:    短文本(< cols*0.4 chars)用 actual,长文本用 contain
 */
export const textToBitmap = (
  text: string,
  cols: number,
  rows: number,
  _gridCharPx?: number,
  fitMode: FitMode = 'contain'
): BitmapSource => {
  if (!cols || cols <= 0) cols = 80;
  if (!rows || rows <= 0) rows = 30;

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas context failed');

  // 黑底
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cols, rows);

  // 白字
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 字号:同时受**高度**和**宽度**限制
  // 高度: 行总高 = rows * 0.85, 行高 = 行总高 / 行数
  // 宽度: 先按最宽行(单行)算 fontSize ≤ cols * 0.95 / (maxLineLen * 0.6)
  const lineCount = text.split('\n').length;
  const maxLineLen = Math.max(...text.split('\n').map(s => s.length), 1);
  const charW = 0.6;  // JetBrains Mono 宽高比
  // 按高度算
  const maxByHeight = Math.floor((rows * 0.85) / lineCount);
  // 按宽度算
  const maxByWidth = Math.floor((cols * 0.95) / (maxLineLen * charW));

  // ==================== fitMode 决定 fontSize 起点 ====================
  let fontSize: number;
  switch (fitMode) {
    case 'cover':
      // 优先按宽度铺满(忽略高度约束,可能纵向超出 rows)
      fontSize = Math.max(4, maxByWidth);
      break;
    case 'actual':
      // 按高度自然渲染(忽略宽度约束,可能横向超出 cols —— 旧版行为)
      fontSize = Math.max(4, maxByHeight);
      break;
    case 'auto':
      // 短文本(< cols*0.4 字符)用 actual(给短文本合适高度),长文本用 contain
      if (maxLineLen <= cols * 0.4) {
        fontSize = Math.max(4, maxByHeight);
      } else {
        fontSize = Math.max(4, Math.min(maxByHeight, maxByWidth));
      }
      break;
    case 'contain':
    default:
      // 默认:取 min,保证文字不超出 cols * 0.95
      fontSize = Math.max(4, Math.min(maxByHeight, maxByWidth));
      break;
  }
  ctx.font = `bold ${fontSize}px "JetBrains Mono", "Menlo", monospace`;

  // 自动换行(超出宽度则换)
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(cur);
      cur = '';
    } else if (ctx.measureText(cur + ch).width > cols * 0.95) {
      lines.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) lines.push(cur);

  // 限宽(contain/auto 时强制 ensure,cover/actual 时尊重用户选择)
  let maxLineW = 0;
  for (const line of lines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
  }
  if (maxLineW > cols * 0.95) {
    // 文本超出宽度 → 等比缩放(contain/auto/actual 都收敛到不超 cols)
    // 注意:cover 模式如果用户想"溢出也填满",此处仍然会缩回 —— cover 模式 fontSize
    // 起点已经按宽度算,正常情况不会到这里
    fontSize = Math.max(4, Math.floor(fontSize * (cols * 0.95) / maxLineW));
    ctx.font = `bold ${fontSize}px "JetBrains Mono", "Menlo", monospace`;
  }

  // 画字(中间对齐)
  const lineH = Math.max(4, Math.floor((rows * 0.85) / lineCount));
  for (let i = 0; i < lines.length; i++) {
    const y = (rows - lineH * lineCount) / 2 + lineH * (i + 0.5);
    ctx.fillText(lines[i], cols / 2, y);
  }

  // 取 RGB 亮度 0-1:黑底=0·白字=1
  const imgData = ctx.getImageData(0, 0, cols, rows).data;
  const data = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    data[i] = (r + g + b) / (3 * 255);
  }
  return { cols, rows, data };
};

/** HTMLImageElement → 灰度位图
 *
 * @param fitMode 缩放策略,默认 'contain'(与旧版行为一致)
 *   - contain: 等比缩放完整显示,可能留空(旧版默认)
 *   - cover:   等比缩放填满,可能裁切
 *   - actual:  按原图尺寸拉伸到 cols×rows(可能变形)
 *   - auto:    contain(同 contain,本函数无 auto 优化空间)
 */
export const imageToBitmap = (
  img: HTMLImageElement,
  cols: number,
  rows: number,
  fitMode: FitMode = 'contain'
): BitmapSource => {
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas context failed');

  // 黑底
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cols, rows);

  // 按 fitMode 计算目标绘制尺寸
  const ar = img.naturalWidth / img.naturalHeight;
  const tar = cols / rows;
  let w: number, h: number, x: number, y: number;
  if (fitMode === 'actual') {
    // 拉伸到 cols×rows(可能变形,旧版之外的选项)
    w = cols;
    h = rows;
    x = 0;
    y = 0;
  } else if (fitMode === 'cover') {
    // 等比缩放填满,可能裁切
    if (ar > tar) {
      h = rows;
      w = rows * ar;
      x = (cols - w) / 2;
      y = 0;
    } else {
      w = cols;
      h = cols / ar;
      x = 0;
      y = (rows - h) / 2;
    }
  } else {
    // contain / auto · 居中绘制并保持比例(完整显示,可能留空)
    if (ar > tar) {
      w = cols;
      h = cols / ar;
      x = 0;
      y = (rows - h) / 2;
    } else {
      h = rows;
      w = rows * ar;
      x = (cols - w) / 2;
      y = 0;
    }
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, x, y, w, h);

  // **反转**:黑底=0(暗)·图亮处=1(亮)·图内字符被强制亮起
  const imgData = ctx.getImageData(0, 0, cols, rows).data;
  const data = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    // **关键**:1 - 亮度(原是 luminance 越亮越高,原“图外=黑=0”已经对了)
    // 这里原逻辑已正确(黑底=0,图亮=1)· 保持不变
    data[i] = Math.max(0, (0.299 * r + 0.587 * g + 0.114 * b) / 255);
  }
  return { cols, rows, data };
};

/** File/Blob → HTMLImageElement */
export const fileToImage = (file: File | Blob): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
};
