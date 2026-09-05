/**
 * MatrixRain.detect() 环境检测单测
 *
 * 对应旧探针: test/detect.mjs(renderer 自动选择 / 特性检测)
 * 迁移范围:  detect() 返回字段齐全 + 类型正确 · UA → browser 映射 · 视口 4 档 ·
 *           matchMedia 暗色模式 · DPR · 移动端综合判断 · SSR-safe · 多次调用幂等
 *
 * [[feedback_visual_verification_untrusted]]: 本 spec 只验"接口形状"(字段 + 类型)
 * + 字段映射逻辑,不验真浏览器像素/能力;真浏览器能力探测走 test/pixel/。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MatrixRain } from '../../../src'

/**
 * 在 happy-dom 下,navigator / window 是 read-only,不能直接赋值。
 * 用 Object.defineProperty 替换 userAgent / innerWidth / devicePixelRatio / matchMedia,
 * 测完恢复。
 */
function setWindowProp<K extends keyof Window>(key: K, value: Window[K]) {
  Object.defineProperty(window, key, { configurable: true, writable: true, value })
}

function setNavigatorUA(ua: string) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: ua },
    configurable: true,
    writable: true,
  })
}

const REQUIRED_FIELDS = [
  'isMobile',
  'isDarkMode',
  'recommendedFontSize',
  'recommendedTargetFPS',
  'recommendedBrightness',
  'browser',
  'viewport',
  'viewportWidth',
  'devicePixelRatio',
  'hasWebGL2',
  'hasWebGPU',
  'recommendedRenderer',
] as const

describe('MatrixRain.detect: 函数 + 返回结构', () => {
  it('MatrixRain.detect 是 function', () => {
    expect(typeof MatrixRain.detect).toBe('function')
  })

  it('返回 object 且 12 字段齐全', () => {
    const env = MatrixRain.detect()
    expect(typeof env).toBe('object')
    expect(env).not.toBeNull()
    for (const f of REQUIRED_FIELDS) {
      expect(f in env).toBe(true)
    }
  })

  it('各字段类型正确', () => {
    const env = MatrixRain.detect()
    expect(typeof env.isMobile).toBe('boolean')
    expect(typeof env.isDarkMode).toBe('boolean')
    expect(typeof env.recommendedFontSize).toBe('number')
    expect(typeof env.recommendedTargetFPS).toBe('number')
    expect(typeof env.recommendedBrightness).toBe('number')
    expect(typeof env.browser).toBe('string')
    expect(typeof env.viewport).toBe('string')
    expect(typeof env.viewportWidth).toBe('number')
    expect(typeof env.devicePixelRatio).toBe('number')
    expect(typeof env.hasWebGL2).toBe('boolean')
    expect(typeof env.hasWebGPU).toBe('boolean')
    expect(['canvas2d', 'webgl', 'webgpu']).toContain(env.recommendedRenderer)
  })

  it('viewport 4 档之一', () => {
    const env = MatrixRain.detect()
    expect(['mobile', 'tablet', 'desktop', 'wide']).toContain(env.viewport)
  })

  it('devicePixelRatio > 0', () => {
    const env = MatrixRain.detect()
    expect(env.devicePixelRatio).toBeGreaterThan(0)
  })
})

describe('MatrixRain.detect: UA → browser 映射', () => {
  const cases: Array<[string, string]> = [
    ['Mozilla/5.0 ... Chrome/120.0 Safari/537.36', 'Chrome'],
    ['Mozilla/5.0 ... Firefox/121.0', 'Firefox'],
    ['Mozilla/5.0 ... Safari/605.1.15 Version/17.1', 'Safari'],
    ['Mozilla/5.0 ... Edg/120.0.2210.91', 'Edge'],
    ['Mozilla/5.0 ... OPR/105.0.4970.21', 'Opera'],
  ]

  for (const [ua, expectBrowser] of cases) {
    it(`UA "${ua.slice(0, 30)}..." → browser="${expectBrowser}"`, () => {
      setNavigatorUA(ua)
      const env = MatrixRain.detect()
      expect(env.browser).toBe(expectBrowser)
    })
  }

  it('未知 UA → browser="Unknown"', () => {
    setNavigatorUA('SomeRandomBot/1.0')
    const env = MatrixRain.detect()
    expect(env.browser).toBe('Unknown')
  })
})

describe('MatrixRain.detect: innerWidth → viewport 4 档', () => {
  const cases: Array<[number, string]> = [
    [320, 'mobile'],
    [767, 'mobile'],
    [768, 'tablet'],
    [1023, 'tablet'],
    [1024, 'desktop'],
    [1439, 'desktop'],
    [1440, 'wide'],
    [2560, 'wide'],
  ]
  let origW = 1024
  beforeEach(() => {
    origW = window.innerWidth
  })
  afterEach(() => {
    setWindowProp('innerWidth', origW)
  })

  for (const [w, expected] of cases) {
    it(`innerWidth=${w} → viewport="${expected}"`, () => {
      setWindowProp('innerWidth', w)
      const env = MatrixRain.detect()
      expect(env.viewport).toBe(expected)
      expect(env.viewportWidth).toBe(w)
    })
  }
})

describe('MatrixRain.detect: matchMedia 暗色模式', () => {
  let origMM: typeof window.matchMedia | null = null
  beforeEach(() => {
    origMM = window.matchMedia
  })
  afterEach(() => {
    if (origMM) setWindowProp('matchMedia', origMM)
  })

  it('暗色模式打开 → isDarkMode=true + recommendedBrightness=1.1', () => {
    setWindowProp('matchMedia', ((q: string) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as typeof window.matchMedia)
    const env = MatrixRain.detect()
    expect(env.isDarkMode).toBe(true)
    expect(env.recommendedBrightness).toBeCloseTo(1.1, 5)
  })

  it('亮色模式 → isDarkMode=false + recommendedBrightness=1.0', () => {
    setWindowProp('matchMedia', ((q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as typeof window.matchMedia)
    const env = MatrixRain.detect()
    expect(env.isDarkMode).toBe(false)
    expect(env.recommendedBrightness).toBeCloseTo(1.0, 5)
  })
})

describe('MatrixRain.detect: devicePixelRatio', () => {
  let origDpr = 1
  beforeEach(() => {
    origDpr = window.devicePixelRatio
  })
  afterEach(() => {
    setWindowProp('devicePixelRatio', origDpr)
  })

  it('DPR=2 正确读取', () => {
    setWindowProp('devicePixelRatio', 2)
    expect(MatrixRain.detect().devicePixelRatio).toBe(2)
  })

  it('DPR=1.5 正确读取', () => {
    setWindowProp('devicePixelRatio', 1.5)
    expect(MatrixRain.detect().devicePixelRatio).toBe(1.5)
  })

  it('DPR=3(高 DPI 移动端)正确读取', () => {
    setWindowProp('devicePixelRatio', 3)
    expect(MatrixRain.detect().devicePixelRatio).toBe(3)
  })
})

describe('MatrixRain.detect: 移动端综合判断', () => {
  let origW = 1024
  let origUA = ''
  beforeEach(() => {
    origW = window.innerWidth
    origUA = navigator.userAgent
  })
  afterEach(() => {
    setWindowProp('innerWidth', origW)
    setNavigatorUA(origUA)
  })

  it('iPhone UA + 375px → isMobile=true + viewport=mobile + recommendedFontSize=4 + recommendedTargetFPS=30', () => {
    setWindowProp('innerWidth', 375)
    setNavigatorUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    )
    const env = MatrixRain.detect()
    expect(env.isMobile).toBe(true)
    expect(env.viewport).toBe('mobile')
    expect(env.recommendedFontSize).toBe(4)
    expect(env.recommendedTargetFPS).toBe(30)
  })

  it('Android UA + 720px → isMobile=true(UA 命中移动关键字)', () => {
    setWindowProp('innerWidth', 720)
    setNavigatorUA(
      'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
    )
    const env = MatrixRain.detect()
    expect(env.isMobile).toBe(true)
  })

  it('桌面 Chrome + 1920px → isMobile=false + viewport=wide', () => {
    setWindowProp('innerWidth', 1920)
    setNavigatorUA('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36')
    const env = MatrixRain.detect()
    expect(env.isMobile).toBe(false)
    expect(env.viewport).toBe('wide')
  })
})

describe('MatrixRain.detect: SSR-safe (typeof window === undefined)', () => {
  it('window 缺失 → 返回 desktop 默认', () => {
    // 真实 SSR 模拟:直接调用 detect(),因为 happy-dom 全局有 window
    // 我们通过 stub 实现"window 不存在"分支:把 window 临时设为 undefined
    const origWindow = globalThis.window
    // @ts-expect-error - 故意清掉 window
    delete (globalThis as { window?: Window }).window
    try {
      const env = MatrixRain.detect()
      expect(env.isMobile).toBe(false)
      expect(env.isDarkMode).toBe(false)
      expect(env.viewport).toBe('desktop')
      expect(env.viewportWidth).toBe(0)
      expect(env.devicePixelRatio).toBe(1)
      expect(env.browser).toBe('Unknown')
      expect(env.recommendedFontSize).toBe(6)
      expect(env.recommendedTargetFPS).toBe(0)
      expect(env.recommendedBrightness).toBeCloseTo(1.0, 5)
      expect(env.hasWebGL2).toBe(false)
      expect(env.hasWebGPU).toBe(false)
      expect(env.recommendedRenderer).toBe('canvas2d')
    } finally {
      ;(globalThis as { window?: Window }).window = origWindow
    }
  })
})

describe('MatrixRain.detect: 多次调用幂等', () => {
  it('两次调用字段类型一致', () => {
    const envA = MatrixRain.detect()
    const envB = MatrixRain.detect()
    expect(typeof envA.viewport).toBe(typeof envB.viewport)
    expect(typeof envA.devicePixelRatio).toBe(typeof envB.devicePixelRatio)
    expect(typeof envA.isDarkMode).toBe(typeof envB.isDarkMode)
    expect(typeof envA.browser).toBe(typeof envB.browser)
  })

  it('10 次连续调用无 throw + 返回值形状稳定', () => {
    for (let i = 0; i < 10; i++) {
      const env = MatrixRain.detect()
      expect(typeof env).toBe('object')
      for (const f of REQUIRED_FIELDS) {
        expect(f in env).toBe(true)
      }
    }
  })
})

describe('MatrixRain.detect: hasWebGL2 / hasWebGPU', () => {
  it('happy-dom 下 createElement(canvas).getContext("webgl2") 返回 null → hasWebGL2=false', () => {
    const env = MatrixRain.detect()
    // happy-dom 不实现 webgl2 → false;真浏览器下可能 true
    expect(env.hasWebGL2).toBe(false)
  })

  it('happy-dom 下 navigator.gpu 不存在 → hasWebGPU=false', () => {
    const env = MatrixRain.detect()
    expect(env.hasWebGPU).toBe(false)
  })
})

describe('MatrixRain.detect: recommendedRenderer 选择', () => {
  it('普通视口 + happy-dom → canvas2d', () => {
    setWindowProp('innerWidth', 1024)
    setWindowProp('devicePixelRatio', 1)
    const env = MatrixRain.detect()
    expect(env.recommendedRenderer).toBe('canvas2d')
  })
})
