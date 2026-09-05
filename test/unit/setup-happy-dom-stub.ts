/**
 * test/unit/setup.ts · Vitest 全局 setup
 *
 * 硬约束提醒(顶层注释,Vitest 跑时 v8 覆盖也走 happy-dom stub):
 *
 * - [[feedback_min_font_size]]: fontSize 硬下限 4px,任何新建测试断言 fontSize
 *   边界时**必须**用 clamp(>= 4)。本工程约定:
 *   - slider / preset / test fixture 内部一律 `Math.max(4, ...)`
 *   - 直接断言 `setFontSize(2) → getOption('fontSize') === 4`(既验证 clamp,
 *     又不只验证 throw)
 *   - 违反即 fail([[feedback_visual_verification_untrusted]] 同理:不可信)
 *
 * - [[feedback_visual_verification_untrusted]]: happy-dom canvas 是 stub,
 *   fillText / getImageData 都是 no-op。**像素验证必须走真浏览器**(test/pixel/
 *   + Playwright real browser),不允许在单测里靠 mock getContext 跑通就算数。
 *   本文件只负责"接口形状"测试,不能替代真渲染基线。
 *
 * - [[feedback_debug_depth_boundary]]: 诊断兔子洞 > 2 处源码改动 + 30 分钟未果
 *   立即停,写"未结论"占位段,不要硬写死。
 *
 * --------------------------------------------------------------
 * 重要:happy-dom 20 的 canvas.getContext('2d') 返 null(它不实现 2D API),
 * matrixRain / textToBitmap / imageToBitmap 全部走 document.createElement('canvas')
 * 然后立刻 getContext('2d'),所以必须在 beforeAll 里把 getContext stub 掉。
 * stub 不画任何像素(只 no-op),符合 [[feedback_visual_verification_untrusted]]:
 * "happy-dom 不替代真浏览器"。
 *
 * webgl2 / webgpu 返回 null(与 happy-dom 默认行为一致,detect() 测的是
 * "happy-dom 不实现 webgl2" 这一已知约束,不替代真浏览器能力探测)。
 * --------------------------------------------------------------
 */
import { beforeAll, afterAll, vi } from 'vitest'

// happy-dom 20 不实现 2D API,这里用 Proxy 兜底"接口形状"。
// 严格约束(见 [[feedback_visual_verification_untrusted]]):stub 不画任何像素,
// 只让"被测代码不抛 is not a function";真像素必须走 Playwright 浏览器路径。
//
// 白名单分类:
// - COMPLEX_RETURN: 返回有方法的对象(gradient / ImageData 等)
// - STRING_PROP: setter 写、getter 读、值是字符串
// - NUMBER_PROP: 同上,值是数字
// - VOID_METHOD: 0 参 / 多参都成,返回 undefined
// 兜底:未列名属性返回 undefined(避免 Proxy 假装什么都有)
const COMPLEX_RETURN_PROPS = new Set<string>([
  'getImageData',
  'putImageData',
  'createImageData',
  'createLinearGradient',
  'createRadialGradient',
  'createPattern',
  // CanvasGradient / CanvasPattern:补足 setFillStyle 风格用法
])
const STRING_PROPS = new Set<string>([
  'fillStyle',
  'strokeStyle',
  'font',
  'textBaseline',
  'textAlign',
  'direction',
  'filter',
  'globalCompositeOperation',
  'imageSmoothingQuality',
])
const NUMBER_PROPS = new Set<string>([
  'lineWidth',
  'lineCap',
  'lineJoin',
  'miterLimit',
  'lineDashOffset',
  'shadowBlur',
  'shadowOffsetX',
  'shadowOffsetY',
  'globalAlpha',
  'imageSmoothingEnabled',
])
// happy-dom 2D API 方法全集(CanvasRenderingContext2D spec 摘要)
const VOID_METHODS = [
  // 路径
  'arc',
  'arcTo',
  'bezierCurveTo',
  'closePath',
  'ellipse',
  'lineTo',
  'moveTo',
  'quadraticCurveTo',
  'rect',
  // 矩形
  'clearRect',
  'fillRect',
  'strokeRect',
  // 文本
  'fillText',
  'strokeText',
  'measureText',
  // 画图
  'drawImage',
  'drawFocusIfNeeded',
  // 状态
  'beginPath',
  'clip',
  'fill',
  'isPointInPath',
  'isPointInStroke',
  'reset',
  'restore',
  'rotate',
  'save',
  'scale',
  'setLineDash',
  'setTransform',
  'stroke',
  'transform',
  'translate',
  'getLineDash',
  'getTransform',
]

const buildContext = (): unknown => {
  const voidFn = (): void => {}
  return new Proxy(
    {
      // measureText 在原 stub 里返 { width },不是 voidFn——保留
      measureText: () => ({ width: 8 }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      putImageData: voidFn,
      createImageData: (w: number, h?: number) => {
        const hh = h ?? (w as number)
        return { data: new Uint8ClampedArray((w as number) * hh * 4), width: w, height: hh }
      },
      createLinearGradient: () => ({ addColorStop: voidFn }),
      createRadialGradient: () => ({ addColorStop: voidFn }),
      createPattern: () => ({}),
    },
    {
      get(target, prop) {
        if (typeof prop !== 'string') return undefined
        if (prop in target) return (target as Record<string, unknown>)[prop]
        if (COMPLEX_RETURN_PROPS.has(prop)) {
          // 兜底(防白名单漏项,但 COMPLEX_RETURN 已在 buildContext 注册)
          return (target as Record<string, unknown>)[prop]
        }
        if (STRING_PROPS.has(prop)) return ''
        if (NUMBER_PROPS.has(prop)) return 0
        if (VOID_METHODS.includes(prop)) return voidFn
        return undefined
      },
      set(_t, prop) {
        // 任何属性赋值都接住(canvas2d 属性 set 频繁,默认 trap 会抛严格模式错)
        return true
      },
    }
  )
}

const stubCanvasContext = (type?: string): unknown => {
  // webgl2 / webgpu 在 happy-dom 不实现,必须返 null
  if (type === 'webgl2' || type === 'webgpu' || type === 'webgl') return null
  return buildContext()
}

beforeAll(() => {
  // 拦截 document.createElement,canvas 元素强制返回带 stub getContext 的实例
  const origCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = origCreate(tag)
    if (tag.toLowerCase() === 'canvas') {
      ;(el as HTMLCanvasElement).getContext = (type?: string) =>
        stubCanvasContext(type) as CanvasRenderingContext2D
    }
    return el
  })
})

afterAll(() => {
  vi.restoreAllMocks()
})

export {}
