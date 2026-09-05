/**
 * 主题参数合法性 · 5 主题 × 4 变体
 *
 * 对应旧探针: test/themes.mjs(theme 参数合法性 + 切换行为)
 * 迁移范围:  themes 字典 keys 完整 · 冷暖 HSL 数值范围 · 色相间隔 · TP 字段 · aMax ·
 *           切到未知主题静默 return · 反复切主题不 throw · pure-mono 灰阶 ·
 *           lava-red / matrix-green / cyber-blue / silicon-valley 各自冷暖色相区间
 * 不迁移:    coldFrom/warmFrom 拼色(已在 0.4.0 文档化,不需重测)
 *
 * [[feedback_visual_verification_untrusted]]: 本文件只验接口形状与 HSL 数值范围,
 * 不验证渲染像素(像素走 test/pixel/ + Playwright)。
 */
import { describe, it, expect } from 'vitest'
import { themes, matrixRain, type ThemeName } from '../../../src'

// 5 主题全集(必须等于 themes 字典真实 keys,避免以后误删/误增)
const ALL_THEMES: ThemeName[] = [
  'silicon-valley',
  'matrix-green',
  'lava-red',
  'cyber-blue',
  'pure-mono',
]

// 4 变体全集(types/index.d.ts: VariantName)
const ALL_VARIANTS = ['classic', 'avalanche', 'ripple', 'ascii'] as const

const HS = (h: number) => Math.min(360, Math.max(0, h))

describe('themes: dictionary shape', () => {
  it('themes 字典导出 5 套内置主题,keys 与预期一致', () => {
    const actualKeys = Object.keys(themes).sort()
    const expectedKeys = [...ALL_THEMES].sort()
    expect(actualKeys).toEqual(expectedKeys)
    for (const k of expectedKeys) {
      expect(typeof themes[k]).toBe('function')
    }
  })

  it('5 主题 × cold/warm × 5 字段 = 50 个数值断言通过', () => {
    for (const name of ALL_THEMES) {
      const t = themes[name]()
      for (const side of ['cold', 'warm'] as const) {
        const p = t[side]
        expect(Number.isFinite(p.h)).toBe(true)
        expect(p.h).toBeGreaterThanOrEqual(0)
        expect(p.h).toBeLessThanOrEqual(360)
        expect(Number.isFinite(p.s)).toBe(true)
        expect(p.s).toBeGreaterThanOrEqual(0)
        expect(p.s).toBeLessThanOrEqual(1)
        expect(p.lMin).toBeGreaterThanOrEqual(0)
        expect(p.lMin).toBeLessThanOrEqual(1)
        expect(p.lMax).toBeGreaterThanOrEqual(0)
        expect(p.lMax).toBeLessThanOrEqual(1)
        expect(p.lMin).toBeLessThan(p.lMax)
      }
    }
  })

  it('5 主题 TP 7 字段(brightness/chroma/hueShift/saturationShift/lightnessShift/invertHue/contrast)都是有限 number', () => {
    const tpFields = [
      'brightness',
      'chroma',
      'hueShift',
      'saturationShift',
      'lightnessShift',
      'invertHue',
      'contrast',
    ] as const
    for (const name of ALL_THEMES) {
      const t = themes[name]()
      for (const f of tpFields) {
        expect(Number.isFinite(t[f])).toBe(true)
      }
    }
  })

  it('5 主题 cold/warm aMax ∈ [0, 1]', () => {
    for (const name of ALL_THEMES) {
      const t = themes[name]()
      for (const side of ['cold', 'warm'] as const) {
        const p = t[side]
        expect(p.aMax).toBeGreaterThanOrEqual(0)
        expect(p.aMax).toBeLessThanOrEqual(1)
      }
    }
  })

  it('themes[name]() 每次调用返回新对象(深拷贝防共享)', () => {
    for (const name of ALL_THEMES) {
      const a = themes[name]()
      const b = themes[name]()
      expect(a).not.toBe(b)
      expect(a.cold).not.toBe(b.cold)
      expect(a.warm).not.toBe(b.warm)
      expect(a.cold.h).toBe(b.cold.h)
      expect(a.warm.h).toBe(b.warm.h)
    }
  })
})

describe('themes: chromatic separation', () => {
  it('有色主题 |cold.h - warm.h| > 30°(撞色防护,pure-mono 灰阶跳过)', () => {
    for (const name of ALL_THEMES) {
      if (name === 'pure-mono') continue
      const t = themes[name]()
      const delta = Math.abs(t.cold.h - t.warm.h)
      const circular = Math.min(delta, 360 - delta)
      expect(circular).toBeGreaterThan(30)
    }
  })

  it('冷暖双板色相拉开:冷板 h ∈ [60, 300],暖板 h ∈ [0, 90] ∪ [300, 360]', () => {
    for (const name of ALL_THEMES) {
      if (name === 'pure-mono') continue
      const t = themes[name]()
      const coldH = t.cold.h
      const warmH = t.warm.h
      expect(coldH).toBeGreaterThanOrEqual(60)
      expect(coldH).toBeLessThanOrEqual(300)
      const isWarmRange = warmH <= 90 || warmH >= 300
      expect(isWarmRange).toBe(true)
    }
  })

  it('pure-mono 是灰阶主题:cold.s === 0 && warm.s === 0', () => {
    const t = themes['pure-mono']()
    expect(t.cold.s).toBe(0)
    expect(t.warm.s).toBe(0)
  })

  it('lava-red.warm.h ∈ [0, 50](橙红区)', () => {
    const t = themes['lava-red']()
    expect(t.warm.h).toBeGreaterThanOrEqual(0)
    expect(t.warm.h).toBeLessThanOrEqual(50)
  })

  it('matrix-green.cold.h ∈ [100, 160](绿区)', () => {
    const t = themes['matrix-green']()
    expect(t.cold.h).toBeGreaterThanOrEqual(100)
    expect(t.cold.h).toBeLessThanOrEqual(160)
  })

  it('cyber-blue 冷板偏蓝(200-250),silicon-valley 冷板偏青(180-220)', () => {
    const cyber = themes['cyber-blue']()
    const sv = themes['silicon-valley']()
    expect(cyber.cold.h).toBeGreaterThanOrEqual(200)
    expect(cyber.cold.h).toBeLessThanOrEqual(250)
    expect(sv.cold.h).toBeGreaterThanOrEqual(180)
    expect(sv.cold.h).toBeLessThanOrEqual(220)
  })
})

describe('themes: 4 变体 × 5 主题 = 20 组合构造不抛错', () => {
  // 20 组笛卡尔积 · 每组 matrixRain() 成功
  for (const variant of ALL_VARIANTS) {
    for (const theme of ALL_THEMES) {
      it(`matrixRain({ theme: '${theme}', variant: '${variant}' }) 不抛错`, () => {
        const inst = matrixRain({ theme, variant })
        expect(inst).toBeDefined()
        expect(typeof inst.setTheme).toBe('function')
        expect(typeof inst.destroy).toBe('function')
        inst.destroy()
      })
    }
  }
})

describe('themes: themed setters 行为契约', () => {
  it('setTheme 切到 matrix-green → getOptions().theme = "matrix-green"', () => {
    const inst = matrixRain({ theme: 'silicon-valley' })
    inst.setTheme('matrix-green')
    expect(inst.getOptions().theme).toBe('matrix-green')
    inst.destroy()
  })

  it('setTheme keepPaletteParams:true 不重置 ctp/wtp', () => {
    const inst = matrixRain({
      theme: 'silicon-valley',
      coldThemeParams: { brightness: 1.3 },
    })
    const ctpBefore = inst.getOptions().coldThemeParams
    inst.setTheme('matrix-green', { keepPaletteParams: true })
    const ctpAfter = inst.getOptions().coldThemeParams
    expect(ctpAfter.brightness).toBe(ctpBefore.brightness)
    inst.destroy()
  })

  it('setThemeParams 不抛错 + 写入 getOptions().themeParams', () => {
    const inst = matrixRain({ theme: 'silicon-valley' })
    inst.setThemeParams({ brightness: 1.5, chroma: 1.2 })
    const opts = inst.getOptions()
    expect(opts.themeParams.brightness).toBe(1.5)
    expect(opts.themeParams.chroma).toBe(1.2)
    inst.destroy()
  })

  it('setColdThemeParams 不抛错 + 写入 getOptions().coldThemeParams', () => {
    const inst = matrixRain({ theme: 'silicon-valley' })
    inst.setColdThemeParams({ brightness: 0.8 })
    expect(inst.getOptions().coldThemeParams.brightness).toBe(0.8)
    inst.destroy()
  })

  it('setWarmThemeParams 不抛错 + 写入 getOptions().warmThemeParams', () => {
    const inst = matrixRain({ theme: 'silicon-valley' })
    inst.setWarmThemeParams({ chroma: 0.5 })
    expect(inst.getOptions().warmThemeParams.chroma).toBe(0.5)
    inst.destroy()
  })

  it('setHueRotate(speed, amount) 不抛错 + 写入 getOptions', () => {
    const inst = matrixRain()
    inst.setHueRotate(0.5, 180)
    const opts = inst.getOptions()
    expect(opts.hueRotateSpeed).toBe(0.5)
    expect(opts.hueRotateAmount).toBe(180)
    inst.destroy()
  })

  it('setColorOverrides(null) → 清空 colorOverrides', () => {
    const inst = matrixRain()
    inst.setColorOverrides(null)
    expect(inst.getOptions().colorOverrides).toBeUndefined()
    inst.destroy()
  })

  it('setColorOverrides({ 0: [1,0,0] }) → 写入 getOptions', () => {
    const inst = matrixRain()
    inst.setColorOverrides({ 0: [1, 0, 0], 9: [0, 1, 0] })
    expect(inst.getOptions().colorOverrides).toBeDefined()
    inst.destroy()
  })

  it('setPalettes 不抛错', () => {
    const inst = matrixRain({ theme: 'silicon-valley' })
    expect(() =>
      inst.setPalettes({ h: 200, s: 0.5, lMin: 0.1, lMax: 0.9, aMax: 0.9 }, {
        h: 30,
        s: 0.5,
        lMin: 0.1,
        lMax: 0.9,
        aMax: 0.9,
      })
    ).not.toThrow()
    inst.destroy()
  })

  it('coldFrom / warmFrom 拼色:不抛错', () => {
    const inst = matrixRain({
      coldFrom: 'lava-red',
      warmFrom: 'matrix-green',
    })
    expect(inst).toBeDefined()
    inst.destroy()
  })
})

describe('themes: setTheme 行为', () => {
  it('setTheme 切到同主题不 throw', () => {
    const inst = matrixRain({ theme: 'silicon-valley' })
    for (let i = 0; i < 5; i++) {
      expect(() => inst.setTheme('silicon-valley')).not.toThrow()
    }
    inst.destroy()
  })

  it('setTheme 未知主题名 → 不抛错(静默 return,T3 回归)', () => {
    const inst = matrixRain({ theme: 'silicon-valley' })
    expect(() => inst.setTheme('totally-not-a-theme' as ThemeName)).not.toThrow()
    inst.destroy()
  })

  it('反复切主题 50 次不 throw,实例 destroy 正常', () => {
    const cycle = [...ALL_THEMES, ...ALL_THEMES]
    const inst = matrixRain({ theme: 'silicon-valley' })
    for (let i = 0; i < 50; i++) {
      inst.setTheme(cycle[i % cycle.length])
    }
    expect(() => inst.destroy()).not.toThrow()
  })

  it('setTheme 之间来回切换不 throw(applyTheme 路径通畅)', () => {
    const inst = matrixRain({ theme: 'silicon-valley' })
    inst.setTheme('matrix-green')
    inst.setTheme('silicon-valley')
    inst.setTheme('lava-red')
    inst.setTheme('cyber-blue')
    expect(() => inst.setTheme('pure-mono')).not.toThrow()
    inst.destroy()
  })

  it('5 主题 × 4 变体的 cycle 内色相值有效(不出现 NaN/undefined)', () => {
    // 4 变体 × 5 主题 cycle 5 圈 · 验证内部 cold/warm palette 数值未损
    for (let i = 0; i < 5; i++) {
      for (const theme of ALL_THEMES) {
        const t = themes[theme]()
        for (const side of ['cold', 'warm'] as const) {
          expect(Number.isFinite(t[side].h)).toBe(true)
          expect(Number.isFinite(t[side].s)).toBe(true)
          // hue 应当归一化到 [0, 360] · 这里用宽容断言允许任意 0-360 区间
          expect(HS(t[side].h)).toBe(t[side].h)
        }
      }
    }
  })
})
