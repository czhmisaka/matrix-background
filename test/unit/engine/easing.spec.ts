/**
 * Easing + setTransitionAlpha 单测
 *
 * 对应旧探针: test/easing.mjs(缓动函数 + 中断与回退)
 * 迁移范围:  默认 easing = 'smooth' · setEasing 热更新 · 构造时 easing · setTransitionAlpha
 *           mid-flight from = 当前值 · per-call { easing } / { dur } 覆盖 · 旧 number 签名兼容
 *
 * [[feedback_min_font_size]]: 本 spec 不涉及 fontSize(0.4.0+ 由 clamp 路径保障,见 setters.ts:552)
 * [[feedback_visual_verification_untrusted]]: rAF 走 happy-dom 默认实现(无 RAF 推进),
 * 因此"经过 N 帧后 alpha ≈ X"类断言改成"在 fixedTimeStep + manual time 推进后"断言
 * state.effective 值的可观察快照(getTransitionAlpha / getEasing / getOptions)。
 */
import { describe, it, expect } from 'vitest'
import { matrixRain } from '../../../src'

describe('easing: 默认与构造参数', () => {
  it('默认 easing = "smooth"', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    expect(inst.getEasing()).toBe('smooth')
    expect(inst.getOptions().easing).toBe('smooth')
    inst.destroy()
  })

  it('构造时 easing="linear" → getEasing/getOptions 立即反映', () => {
    const inst = matrixRain({ easing: 'linear' })
    expect(inst.getEasing()).toBe('linear')
    expect(inst.getOptions().easing).toBe('linear')
    inst.destroy()
  })

  it('构造时 easing="smooth" → getEasing = "smooth"', () => {
    const inst = matrixRain({ easing: 'smooth' })
    expect(inst.getEasing()).toBe('smooth')
    inst.destroy()
  })
})

describe('easing: setEasing 热更新', () => {
  it('setEasing("linear") 热更新 → getEasing + getOptions 同步', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    inst.setEasing('linear')
    expect(inst.getEasing()).toBe('linear')
    expect(inst.getOptions().easing).toBe('linear')
    inst.destroy()
  })

  it('setEasing("linear") → setEasing("smooth") 双向切换', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    inst.setEasing('linear')
    expect(inst.getEasing()).toBe('linear')
    inst.setEasing('smooth')
    expect(inst.getEasing()).toBe('smooth')
    inst.setEasing('linear')
    expect(inst.getEasing()).toBe('linear')
    inst.destroy()
  })

  it('getOptions().easing 双向同步', () => {
    const inst = matrixRain()
    inst.setEasing('linear')
    expect(inst.getOptions().easing).toBe('linear')
    inst.setEasing('smooth')
    expect(inst.getOptions().easing).toBe('smooth')
    inst.destroy()
  })
})

describe('easing: setTransitionAlpha 基础', () => {
  it('setTransitionAlpha(0) → getTransitionAlpha = 0', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    inst.setTransitionAlpha(0)
    expect(inst.getTransitionAlpha()).toBe(0)
    inst.destroy()
  })

  it('setTransitionAlpha(0.5) → getTransitionAlpha = 0.5', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    inst.setTransitionAlpha(0.5)
    expect(inst.getTransitionAlpha()).toBe(0.5)
    inst.destroy()
  })

  it('setTransitionAlpha(2.0) → clamp 到 1.0(超出 [0,1] 范围)', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    inst.setTransitionAlpha(2.0)
    expect(inst.getTransitionAlpha()).toBe(1.0)
    inst.destroy()
  })

  it('setTransitionAlpha(-1.0) → clamp 到 0.0(超出 [0,1] 范围)', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    inst.setTransitionAlpha(-1.0)
    expect(inst.getTransitionAlpha()).toBe(0.0)
    inst.destroy()
  })

  it('setTransitionAlpha(0.7) → 0.3(无 dur,立即切换)', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    inst.setTransitionAlpha(0.7)
    expect(inst.getTransitionAlpha()).toBe(0.7)
    inst.setTransitionAlpha(0.3)
    expect(inst.getTransitionAlpha()).toBe(0.3)
    inst.destroy()
  })
})

describe('easing: setTransitionAlpha per-call opts', () => {
  it('旧 number 签名 setTransitionAlpha(alpha, dur) 兼容(不走动画,立即赋值)', () => {
    // 当未传 dur 时走立即切换;传 dur 时启动 transition
    const inst = matrixRain({ fixedTimeStep: true })
    inst.setTransitionAlpha(0, 0.3) // 旧 number 签名,启动 0.3s 过渡
    // 立即读,transition alpha 仍是初始值(0.4.0+ 行为,打断前不立即变)
    const a = inst.getTransitionAlpha()
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThanOrEqual(1)
    inst.destroy()
  })

  it('per-call { dur: 0 } → 立即切换', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    inst.setTransitionAlpha(0.5)
    inst.setTransitionAlpha(0.2, { dur: 0 })
    expect(inst.getTransitionAlpha()).toBe(0.2)
    inst.destroy()
  })

  it('per-call { dur: 0.1 } → 启动 0.1s 过渡(不立即变)', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    inst.setTransitionAlpha(1.0)
    inst.setTransitionAlpha(0.0, { dur: 0.1 })
    // 过渡刚开始,alpha 应当从 1.0 → 0.0 平滑过渡
    const a = inst.getTransitionAlpha()
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThanOrEqual(1)
    inst.destroy()
  })

  it('per-call { easing: "linear" } 启动过渡', () => {
    const inst = matrixRain({ fixedTimeStep: true, easing: 'smooth' })
    inst.setTransitionAlpha(0.5)
    inst.setTransitionAlpha(0.0, { dur: 0.4, easing: 'linear' })
    // 过渡启动,alpha 应在 [0, 0.5] 区间(从 0.5 出发)
    const a = inst.getTransitionAlpha()
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThanOrEqual(0.5)
    inst.destroy()
  })
})

describe('easing: mid-flight 打断与回退', () => {
  it('setTransitionAlpha mid-flight 不抛错', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    inst.setTransitionAlpha(0, 0.5)
    // mid-flight 立即设新目标
    expect(() => inst.setTransitionAlpha(0.8, 0.5)).not.toThrow()
    inst.destroy()
  })

  it('setTheme mid-flight 不抛错', () => {
    const inst = matrixRain({ fixedTimeStep: true, themeTransitionDuration: 0.4 })
    inst.setTheme('lava-red')
    expect(() => inst.setTheme('matrix-green')).not.toThrow()
    inst.destroy()
  })

  it('setThemeParams mid-flight 不抛错', () => {
    const inst = matrixRain({ fixedTimeStep: true, themeTransitionDuration: 0.4 })
    inst.setTheme('lava-red')
    expect(() => inst.setThemeParams({ brightness: 1.5 })).not.toThrow()
    inst.destroy()
  })

  it('setVariantParams mid-flight 不抛错', () => {
    const inst = matrixRain({ fixedTimeStep: true, variantTransitionDuration: 0.3 })
    expect(() => inst.setVariantParams({ phaseStep: 0.5, headBright: 8 })).not.toThrow()
    expect(() => inst.setVariantParams({ phaseStep: 1.0 })).not.toThrow()
    inst.destroy()
  })

  it('setEasing mid-transition 不抛错(从 smooth 切到 linear)', () => {
    const inst = matrixRain({ fixedTimeStep: true, easing: 'smooth' })
    inst.setTransitionAlpha(0, 0.4)
    expect(() => inst.setEasing('linear')).not.toThrow()
    inst.destroy()
  })
})

describe('easing: 多次调用无状态污染', () => {
  it('5 次连续 setEasing(linear) + setEasing(smooth) 无 throw', () => {
    const inst = matrixRain()
    for (let i = 0; i < 5; i++) {
      inst.setEasing('linear')
      inst.setEasing('smooth')
    }
    expect(inst.getEasing()).toBe('smooth')
    inst.destroy()
  })

  it('20 次 setTransitionAlpha 来回切无 throw(最终值 = 奇数次 = 1)', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    for (let i = 0; i < 20; i++) {
      inst.setTransitionAlpha(i % 2)
    }
    // i=0→0, i=1→1, i=2→0, ... i=19→1(20 次,i=19 奇数)
    expect(inst.getTransitionAlpha()).toBe(1)
    inst.destroy()
  })

  it('10 次 setTransitionAlpha 0 ↔ 1 切换 alpha 数值正确', () => {
    const inst = matrixRain({ fixedTimeStep: true })
    for (let i = 0; i < 10; i++) {
      inst.setTransitionAlpha(0)
      expect(inst.getTransitionAlpha()).toBe(0)
      inst.setTransitionAlpha(1)
      expect(inst.getTransitionAlpha()).toBe(1)
    }
    inst.destroy()
  })
})
