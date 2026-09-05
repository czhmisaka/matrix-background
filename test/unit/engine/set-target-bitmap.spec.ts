/**
 * setTargetBitmap 输入校验 · Vitest 单元测试
 *
 * 来源:docs/audits/security-2026-06-08.md §5 输入校验 P1 (S-03)
 * 目标:验证 setTargetBitmap 入口校验 3 条规则
 *   1. bitmap 必须是 Float32Array(显式 instanceof 检查)
 *   2. 尺寸上限:cols * rows <= 1_000_000(防 10000x10000 OOM)
 *   3. 形状一致性:rows * cols === data.length
 *
 * 迁移自 test/set-target-bitmap-validation.mjs(已加 @deprecated banner,未删)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { matrixRain } from '../../../src/index';

describe('setTargetBitmap input validation', () => {
  let rain: ReturnType<typeof matrixRain>;

  beforeEach(() => {
    rain = matrixRain({ theme: 'matrix-green' });
  });

  // ============ Case [1] null 合法 ============
  describe('null input (legal clear)', () => {
    it('setTargetBitmap(null) 不 throw', () => {
      expect(() => rain.setTargetBitmap(null)).not.toThrow();
    });

    it('多次连续 setTargetBitmap(null) 仍合法', () => {
      expect(() => {
        rain.setTargetBitmap(null);
        rain.setTargetBitmap(null);
      }).not.toThrow();
    });

    it('clearTargetBitmap() 也不 throw', () => {
      expect(() => rain.clearTargetBitmap()).not.toThrow();
    });
  });

  // ============ Case [2] 超大 → throw ============
  describe('oversized bitmap (size cap)', () => {
    it('直接 Float32Array 1_000_001 单元触发 throw', () => {
      const arr = new Float32Array(1_000_001);
      expect(() => rain.setTargetBitmap(arr)).toThrow(/超过上限.*1000000/);
    });

    it('wrap 形式 2000x2000(=4M) 触发 throw', () => {
      const wrap = { cols: 2000, rows: 2000, data: new Float32Array(4_000_000) };
      expect(() => rain.setTargetBitmap(wrap)).toThrow(/超过上限.*1000000/);
    });

    it('刚好 1M (1_000_000) 不 throw(边界值包含)', () => {
      const wrap = { cols: 1000, rows: 1000, data: new Float32Array(1_000_000) };
      expect(() => rain.setTargetBitmap(wrap)).not.toThrow();
    });

    it('刚好 1M+1 触发 throw(边界排除)', () => {
      const wrap = { cols: 1000, rows: 1001, data: new Float32Array(1_001_000) };
      expect(() => rain.setTargetBitmap(wrap)).toThrow(/超过上限/);
    });
  });

  // ============ Case [3] 形状不一致 → throw ============
  describe('shape mismatch', () => {
    it('cols*rows ≠ data.length 触发 throw', () => {
      const wrap = { cols: 100, rows: 100, data: new Float32Array(50 * 50) };
      expect(() => rain.setTargetBitmap(wrap)).toThrow(/形状不一致/);
    });

    it('cols=0 触发 throw(必须是正整数)', () => {
      const wrap = { cols: 0, rows: 10, data: new Float32Array(0) };
      expect(() => rain.setTargetBitmap(wrap)).toThrow(/cols 必须是正整数/);
    });

    it('rows=0 触发 throw(必须是正整数)', () => {
      const wrap = { cols: 10, rows: 0, data: new Float32Array(0) };
      expect(() => rain.setTargetBitmap(wrap)).toThrow(/rows 必须是正整数/);
    });

    it('cols=-1 触发 throw', () => {
      const wrap = { cols: -1, rows: 10, data: new Float32Array(10) };
      expect(() => rain.setTargetBitmap(wrap)).toThrow(/cols 必须是正整数/);
    });

    it('cols=2.5(非整数)触发 throw', () => {
      const wrap = { cols: 2.5, rows: 4, data: new Float32Array(10) };
      expect(() => rain.setTargetBitmap(wrap)).toThrow(/cols 必须是正整数/);
    });
  });

  // ============ Case [4] 类型错误 → throw ============
  describe('type error (non-Float32Array)', () => {
    it('普通 Array 触发 throw', () => {
      expect(() => rain.setTargetBitmap([0.1, 0.2, 0.3])).toThrow(/必须是 Float32Array/);
    });

    it('Float64Array 触发 throw(只接受 Float32)', () => {
      expect(() => rain.setTargetBitmap(new Float64Array(10))).toThrow(/必须是 Float32Array/);
    });

    it('Int8Array 触发 throw', () => {
      expect(() => rain.setTargetBitmap(new Int8Array(10))).toThrow(/必须是 Float32Array/);
    });

    it('Uint8Array 触发 throw', () => {
      expect(() => rain.setTargetBitmap(new Uint8Array(10))).toThrow(/必须是 Float32Array/);
    });

    it('字符串触发 throw', () => {
      expect(() => rain.setTargetBitmap('hello' as unknown as Float32Array)).toThrow();
    });

    it('number 触发 throw', () => {
      expect(() => rain.setTargetBitmap(42 as unknown as Float32Array)).toThrow();
    });

    it('undefined 触发 throw(null 才是合法 clear,undefined 不是)', () => {
      expect(() => rain.setTargetBitmap(undefined as unknown as null)).toThrow();
    });
  });

  // ============ Case [5] 合法输入 → 通过 ============
  describe('valid input (accept both shapes)', () => {
    it('直接 Float32Array(100 单元)不 throw', () => {
      const arr = new Float32Array(100);
      expect(() => rain.setTargetBitmap(arr)).not.toThrow();
    });

    it('wrap 形式 10x10(=100) 不 throw', () => {
      const wrap = { cols: 10, rows: 10, data: new Float32Array(100) };
      expect(() => rain.setTargetBitmap(wrap)).not.toThrow();
    });

    it('wrap 形式 1x1 不 throw', () => {
      const wrap = { cols: 1, rows: 1, data: new Float32Array(1) };
      expect(() => rain.setTargetBitmap(wrap)).not.toThrow();
    });

    it('wrap 形式 100x1(=100) 不 throw', () => {
      const wrap = { cols: 100, rows: 1, data: new Float32Array(100) };
      expect(() => rain.setTargetBitmap(wrap)).not.toThrow();
    });

    it('wrap 形式 1x100(=100) 不 throw', () => {
      const wrap = { cols: 1, rows: 100, data: new Float32Array(100) };
      expect(() => rain.setTargetBitmap(wrap)).not.toThrow();
    });

    it('Float32Array 内容 0.5/0.8/0.0 合法', () => {
      const arr = new Float32Array([0.0, 0.5, 0.8, 1.0]);
      expect(() => rain.setTargetBitmap(arr)).not.toThrow();
    });

    it('超大 Float32Array(999_999 单元)< 1M 上限不 throw', () => {
      const arr = new Float32Array(999_999);
      expect(() => rain.setTargetBitmap(arr)).not.toThrow();
    });
  });

  // ============ Case [6] 错误信息格式 ============
  describe('error message format', () => {
    it('超过上限错误信息含 setTargetBitmap 前缀', () => {
      const arr = new Float32Array(1_000_001);
      expect(() => rain.setTargetBitmap(arr)).toThrow(/setTargetBitmap/);
    });

    it('超过上限错误信息含具体单元数', () => {
      const arr = new Float32Array(2_000_000);
      expect(() => rain.setTargetBitmap(arr)).toThrow(/2000000/);
    });

    it('形状不一致错误信息含具体数字', () => {
      const wrap = { cols: 100, rows: 100, data: new Float32Array(50 * 50) };
      expect(() => rain.setTargetBitmap(wrap)).toThrow(/10000/);
      expect(() => rain.setTargetBitmap(wrap)).toThrow(/2500/);
    });
  });

  // ============ Case [7] options 参数仍接受 ============
  describe('options parameter still works alongside bitmap', () => {
    it('null bitmap + options 不 throw', () => {
      expect(() =>
        rain.setTargetBitmap(null, { fadeIn: 0.5, hold: 1, fadeOut: 0.5 })
      ).not.toThrow();
    });

    it('合法 bitmap + fitMode="contain" 不 throw', () => {
      const wrap = { cols: 10, rows: 10, data: new Float32Array(100) };
      expect(() => rain.setTargetBitmap(wrap, { fitMode: 'contain' })).not.toThrow();
    });

    it('合法 bitmap + phase="noise-converge" 不 throw', () => {
      const wrap = { cols: 10, rows: 10, data: new Float32Array(100) };
      expect(() =>
        rain.setTargetBitmap(wrap, {
          phase: 'noise-converge',
          noiseDuration: 0.1,
          convergeDuration: 0.3,
        })
      ).not.toThrow();
    });
  });
});