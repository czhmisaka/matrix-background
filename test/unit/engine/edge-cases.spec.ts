/**
 * 边界 + 异常输入测试
 *
 * 对应旧探针: test/edge-cases.mjs(textToBitmap / imageToBitmap / setTargetBitmap 异常路径)
 * 迁移范围:  textToBitmap 空串 / 空白 / 多换行 / 10000 字符 / Emoji / CJK / RTL /
 *           0 维 / 负数维 · imageToBitmap null / undefined / 非 Image · setTargetBitmap
 *           0 维 / 负数维 / 长度不匹配 / null
 *
 * [[feedback_min_font_size]]: textToBitmap 内部 fontSize clamp ≥ 4 由
 * bitmap.ts:175/184/196/213 `Math.max(4, ...)` 保障;本 spec 不再额外断言。
 *
 * [[feedback_visual_verification_untrusted]]: happy-dom canvas getImageData 是 stub,
 * data 数值只在 happy-dom 范围内断言(不验真浏览器像素)。
 */
import { describe, it, expect } from 'vitest'
import { textToBitmap, imageToBitmap, matrixRain } from '../../../src'

describe('textToBitmap: 输入边界', () => {
  it("textToBitmap('') 空字符串 → 不崩,data 长度 = cols*rows", () => {
    const bm = textToBitmap('', 40, 20)
    expect(bm.cols).toBe(40)
    expect(bm.rows).toBe(20)
    expect(bm.data.length).toBe(40 * 20)
  })

  it("textToBitmap('   ') 纯空白 → 不崩,data 长度 = cols*rows", () => {
    const bm = textToBitmap('   ', 20, 10)
    expect(bm.cols).toBe(20)
    expect(bm.rows).toBe(10)
    expect(bm.data.length).toBe(200)
  })

  it("textToBitmap('\\n\\n\\n') 多换行 → 不崩,行数保持参数值", () => {
    const bm = textToBitmap('\n\n\n', 30, 15)
    expect(bm.cols).toBe(30)
    expect(bm.rows).toBe(15)
    expect(bm.data.length).toBe(450)
  })

  it("textToBitmap('A'.repeat(10000)) 超长输入 → 不崩 + 耗时 < 1s", () => {
    const t0 = Date.now()
    const bm = textToBitmap('A'.repeat(10000), 80, 30)
    const elapsed = Date.now() - t0
    expect(bm.cols).toBe(80)
    expect(bm.rows).toBe(30)
    expect(bm.data.length).toBe(80 * 30)
    expect(elapsed).toBeLessThan(1000)
  })

  it("textToBitmap('🎉🚀💖') Emoji 4 字节 UTF-8 → 不崩", () => {
    const bm = textToBitmap('🎉🚀💖', 30, 15)
    expect(bm.cols).toBe(30)
    expect(bm.rows).toBe(15)
    expect(bm.data.length).toBe(30 * 15)
  })

  it("textToBitmap('你好世界') CJK → 不崩,走 charW 估算", () => {
    const bm = textToBitmap('你好世界', 40, 20)
    expect(bm.cols).toBe(40)
    expect(bm.rows).toBe(20)
    expect(bm.data.length).toBe(800)
  })

  it("textToBitmap('مرحبا\\u200Bالعالم') RTL + 零宽 → 不崩", () => {
    const bm = textToBitmap('مرحبا​العالم', 50, 20)
    expect(bm.cols).toBe(50)
    expect(bm.rows).toBe(20)
    expect(bm.data.length).toBe(1000)
  })

  it("textToBitmap('ok', 0, 0) 0 维 → 兜底为 80×30", () => {
    const bm = textToBitmap('OK', 0, 0)
    expect(bm.cols).toBe(80)
    expect(bm.rows).toBe(30)
  })

  it("textToBitmap('ok', -5, -10) 负数维 → 兜底为 80×30", () => {
    const bm = textToBitmap('OK', -5, -10)
    expect(bm.cols).toBe(80)
    expect(bm.rows).toBe(30)
  })

  it("textToBitmap 单字符 'A' (1×1) → 1×1 bitmap", () => {
    const bm = textToBitmap('A', 1, 1)
    expect(bm.cols).toBe(1)
    expect(bm.rows).toBe(1)
    expect(bm.data.length).toBe(1)
  })

  it('textToBitmap data 全部为有限 number(无 NaN/Infinity)', () => {
    const bm = textToBitmap('Hello Matrix', 16, 8)
    for (let i = 0; i < bm.data.length; i++) {
      expect(Number.isFinite(bm.data[i])).toBe(true)
    }
  })
})

describe('imageToBitmap: 输入异常', () => {
  it('imageToBitmap(null) → 抛 TypeError(访问 null.naturalWidth)', () => {
    // 当前实现:不解包 null,直接访问 img.naturalWidth → TypeError
    expect(() => imageToBitmap(null as unknown as HTMLImageElement, 40, 20)).toThrow()
  })

  it('imageToBitmap(undefined) → 抛错(访问 undefined.naturalWidth)', () => {
    expect(() =>
      imageToBitmap(undefined as unknown as HTMLImageElement, 40, 20)
    ).toThrow()
  })

  it('imageToBitmap({}) 非 HTMLImageElement → 不 crash(data 长度 = cols*rows 或 throw)', () => {
    // 当前实现:不验证 img 类型,直接访问 .naturalWidth
    // happy-dom:({}).naturalWidth = undefined → NaN 路径,drawImage no-op → data 全 0
    // 真浏览器下:TypeError(无法 drawImage plain object)→ throw
    let threw = false
    let bm: ReturnType<typeof imageToBitmap> | undefined
    try {
      bm = imageToBitmap({} as unknown as HTMLImageElement, 40, 20)
    } catch {
      threw = true
    }
    if (!threw && bm) {
      expect(bm.cols).toBe(40)
      expect(bm.rows).toBe(20)
      expect(bm.data.length).toBe(800)
      // data 应当为有限 number(可能是 0 / NaN 都可接受,但不应崩)
      // happy-dom 实测 data 全 0(等价黑图)
      for (let i = 0; i < bm.data.length; i++) {
        // 不验证具体值(可能是 0 或 NaN,取决 stub 行为)
        expect(bm.data[i] === bm.data[i] || bm.data[i] === 0).toBe(true)
      }
    } else {
      // 真浏览器行为 — 接受 throw
      expect(threw).toBe(true)
    }
  })

  it('imageToBitmap({naturalWidth: 0}) 零宽图 → 不崩(产生 0 填充位图)或 throw', () => {
    const fakeImg = { naturalWidth: 0, naturalHeight: 0 } as unknown as HTMLImageElement
    let threw = false
    let bm: ReturnType<typeof imageToBitmap> | undefined
    try {
      bm = imageToBitmap(fakeImg, 40, 20)
    } catch {
      threw = true
    }
    if (!threw && bm) {
      expect(bm.cols).toBe(40)
      expect(bm.rows).toBe(20)
      expect(bm.data.length).toBe(800)
    } else {
      // 接受 throw(零宽图绘制无意义)
      expect(threw).toBe(true)
    }
  })

  it('imageToBitmap(fakeImg, 10, 10) 正数维 + 正常 img → data 长度 100', () => {
    // 当前 imageToBitmap 实现不对 cols=0/负数 做兜底(与 textToBitmap 行为不同)
    // 此处只验证"正常输入"路径,文档化兜底差异
    const fakeImg = { naturalWidth: 100, naturalHeight: 100 } as unknown as HTMLImageElement
    const bm = imageToBitmap(fakeImg, 10, 10)
    expect(bm.cols).toBe(10)
    expect(bm.rows).toBe(10)
    expect(bm.data.length).toBe(100)
  })
})

describe('setTargetBitmap: 0/负数维/形状不匹配抛错,null 走 idle', () => {
  // 注意:此组测试需一个 matrixRain 实例(throw 仅在 setter 层验证)
  function newInst() {
    return matrixRain({ theme: 'silicon-valley' })
  }

  it('0 维 → 抛 "cols 必须是正整数"', () => {
    const inst = newInst()
    expect(() =>
      inst.setTargetBitmap({ cols: 0, rows: 0, data: new Float32Array(0) })
    ).toThrow(/cols 必须是正整数/)
    inst.destroy()
  })

  it('负数 cols → 抛 "cols 必须是正整数"', () => {
    const inst = newInst()
    expect(() =>
      inst.setTargetBitmap({ cols: -5, rows: 10, data: new Float32Array(50) })
    ).toThrow(/cols 必须是正整数/)
    inst.destroy()
  })

  it('负数 rows → 抛 "rows 必须是正整数"', () => {
    const inst = newInst()
    expect(() =>
      inst.setTargetBitmap({ cols: 10, rows: -1, data: new Float32Array(10) })
    ).toThrow(/rows 必须是正整数/)
    inst.destroy()
  })

  it('cols 不是整数(1.5) → 抛错', () => {
    const inst = newInst()
    expect(() =>
      inst.setTargetBitmap({
        cols: 1.5,
        rows: 2,
        data: new Float32Array(3),
      })
    ).toThrow(/cols 必须是正整数/)
    inst.destroy()
  })

  it('cols*rows 与 data.length 不一致 → 抛 "形状不一致"', () => {
    const inst = newInst()
    expect(() =>
      inst.setTargetBitmap({ cols: 100, rows: 100, data: new Float32Array(10) })
    ).toThrow(/形状不一致/)
    inst.destroy()
  })

  it('null bitmap → 不抛错(走 idle 路径)', () => {
    const inst = newInst()
    expect(() => inst.setTargetBitmap(null)).not.toThrow()
    inst.destroy()
  })

  it('data 不是 Float32Array(普通 Array) → 抛错', () => {
    const inst = newInst()
    expect(() =>
      inst.setTargetBitmap({
        cols: 2,
        rows: 2,
        data: new Array(4).fill(0) as unknown as Float32Array,
      })
    ).toThrow(/Float32Array/)
    inst.destroy()
  })

  it('正数 cols/rows + data 长度匹配 → 不抛错', () => {
    const inst = newInst()
    expect(() =>
      inst.setTargetBitmap({ cols: 4, rows: 4, data: new Float32Array(16) })
    ).not.toThrow()
    inst.destroy()
  })
})

describe('boundary smoke: 综合负样本', () => {
  it('textToBitmap 0 维 + 负数 兜底(注意:imageToBitmap 不兜底)', () => {
    // textToBitmap:0 维 / 负数 兜底为 80×30
    expect(textToBitmap('x', 0, 0).cols).toBe(80)
    expect(textToBitmap('x', 0, 0).rows).toBe(30)
    expect(textToBitmap('x', -1, -1).cols).toBe(80)
    expect(textToBitmap('x', -1, -1).rows).toBe(30)
  })

  it('textToBitmap cols=0 rows=0 data.length 兜底 80×30=2400', () => {
    const bm = textToBitmap('x', 0, 0)
    expect(bm.data.length).toBe(80 * 30)
  })

  it('textToBitmap 小网格 2×2 仍能完成', () => {
    expect(() => textToBitmap('X', 2, 2)).not.toThrow()
  })

  it('textToBitmap 极小网格 1×1 data 长度 1', () => {
    const bm = textToBitmap('X', 1, 1)
    expect(bm.data.length).toBe(1)
    expect(Number.isFinite(bm.data[0])).toBe(true)
  })
})
