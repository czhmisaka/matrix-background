/**
 * @xietuier/matrix-rain · Web Component 包装
 *
 * 用法:
 *   import '@xietuier/matrix-rain/element';
 *
 *   <matrix-rain theme="cyber-blue" variant="avalanche" font-size="18" charset="01"></matrix-rain>
 *   <matrix-rain theme="matrix-green" font-size="20"></matrix-rain>
 *
 * 编程 API:
 *   const el = document.querySelector('matrix-rain');
 *   el.theme = 'lava-red';        // 热更新
 *   el.setVariant('ripple');
 *   el.fps;                       // 当前 FPS(只读)
 *   el.instance;                  // 拿到原生 MatrixRainInstance
 *   el.destroy();                 // 销毁
 *
 * 子路径导入:
 *   import '@xietuier/matrix-rain/element';
 *   import { MatrixRainElement } from '@xietuier/matrix-rain/element';
 */

import { matrixRain } from './engine';
import type { MatrixRainInstance, MatrixRainOptions, ThemeName, VariantName } from '../types';

const OBSERVED_ATTRS = [
  'theme',
  'variant',
  'font-size',
  'charset',
  'render-scale',
  'renderer',
] as const;
type ObservedAttr = (typeof OBSERVED_ATTRS)[number];

/**
 * 解析 render-scale attribute 值
 * - 'auto' → 透传
 * - 数字字符串 → parseFloat(NaN 退到 1)
 * - null / undefined / 空字符串 → 1(默认)
 */
const parseRenderScaleAttr = (v: string | null): number | 'auto' => {
  if (v === null || v === undefined || v === '') return 1;
  if (v === 'auto') return 'auto';
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 1;
};

/**
 * 解析 renderer attribute 值
 * - 'canvas2d' | 'webgl' | 'webgpu' | 'auto' → 透传
 * - 其它值(空 / null / 非法) → 'auto'(默认)
 */
const parseRendererAttr = (v: string | null): 'canvas2d' | 'webgl' | 'webgpu' | 'auto' => {
  if (v === null || v === undefined || v === '') return 'auto';
  if (v === 'canvas2d' || v === 'webgl' || v === 'webgpu' || v === 'auto') return v;
  return 'auto';
};

/**
 * 数字雨 Web Component
 * - 自定义元素名:`<matrix-rain>`
 * - 观察属性:theme / variant / font-size / charset / render-scale
 * - 子节点内容会被设置为容器(用 light DOM 渲染,便于 CSS 覆盖)
 * - 实例句柄通过 `.__instance` 暴露
 *
 * SSR/Node 兜底:HTMLElement 不存在时 extends 一个空类,class 定义不崩;
 * Web Component 行为只在浏览器生效(Node 端 import 类不会做副作用)。
 */
const _BaseElement: typeof HTMLElement =
  typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as any);

export class MatrixRainElement extends _BaseElement {
  /** 内部实例句柄 */
  __instance: MatrixRainInstance | null = null;
  /** 当前 FPS(只读) */
  get fps(): number {
    return this.__instance?.getFPS() ?? 0;
  }

  private _options: MatrixRainOptions = {};
  private _currentTheme: ThemeName = 'silicon-valley';
  private _currentVariant: VariantName = 'classic';
  private _currentFontSize = 14;
  private _currentCharset = '0123456789';
  private _currentRenderScale: number | 'auto' = 1;
  private _currentRenderer: 'canvas2d' | 'webgl' | 'webgpu' | 'auto' = 'auto';

  static get observedAttributes(): readonly string[] {
    return OBSERVED_ATTRS;
  }

  constructor() {
    super();
    // 不使用 Shadow DOM:让 light DOM 渲染,容器内的内容可被 CSS 覆盖
  }

  connectedCallback(): void {
    // 同步初始属性
    this._currentTheme = (this.getAttribute('theme') as ThemeName) || 'silicon-valley';
    this._currentVariant = (this.getAttribute('variant') as VariantName) || 'classic';
    const fs = this.getAttribute('font-size');
    if (fs !== null) this._currentFontSize = parseInt(fs, 10) || 14;
    const cs = this.getAttribute('charset');
    if (cs !== null) this._currentCharset = cs;
    const rs = this.getAttribute('render-scale');
    if (rs !== null) this._currentRenderScale = parseRenderScaleAttr(rs);
    const rndr = this.getAttribute('renderer');
    if (rndr !== null) this._currentRenderer = parseRendererAttr(rndr);

    this._options = {
      theme: this._currentTheme,
      variant: this._currentVariant,
      fontSize: this._currentFontSize,
      charset: this._currentCharset,
      renderScale: this._currentRenderScale,
      renderer: this._currentRenderer,
      container: this,
    };

    try {
      this.__instance = matrixRain(this._options);
    } catch (e) {
      console.error('[matrix-rain-element] failed to start:', e);
    }
  }

  disconnectedCallback(): void {
    this.destroy();
  }

  attributeChangedCallback(name: ObservedAttr, oldVal: string | null, newVal: string | null): void {
    if (oldVal === newVal) return;
    if (!this.__instance) return;

    switch (name) {
      case 'theme':
        this._currentTheme = (newVal as ThemeName) || 'silicon-valley';
        this.__instance.setTheme(this._currentTheme);
        break;
      case 'variant':
        this._currentVariant = (newVal as VariantName) || 'classic';
        // setVariantParams 不重建 grid;若需要重建可手动 destroy + init
        this.__instance.setVariantParams({});
        // 通过 reload 重建
        this._reload();
        break;
      case 'font-size': {
        const n = parseInt(newVal || '14', 10);
        if (!isNaN(n)) {
          this._currentFontSize = n;
          this.__instance.setDensity(n);
        }
        break;
      }
      case 'charset':
        this._currentCharset = newVal || '0123456789';
        this._reload();
        break;
      case 'render-scale': {
        this._currentRenderScale = parseRenderScaleAttr(newVal);
        // 热更新:不重建(同 font-size 走 setDensity 模式)
        this.__instance.setRenderScale(this._currentRenderScale);
        break;
      }
      case 'renderer': {
        const newRenderer = parseRendererAttr(newVal);
        if (newRenderer !== this._currentRenderer) {
          this._currentRenderer = newRenderer;
          // renderer 切换必须硬重建(canvas 只能绑一个 context 类型)
          this._reload();
        }
        break;
      }
    }
  }

  /** 重新启动实例(用于 variant / charset / renderer 变化) */
  private _reload(): void {
    if (this.__instance) {
      try {
        this.__instance.destroy();
      } catch {}
      this.__instance = null;
    }
    this._options = {
      theme: this._currentTheme,
      variant: this._currentVariant,
      fontSize: this._currentFontSize,
      charset: this._currentCharset,
      renderScale: this._currentRenderScale,
      renderer: this._currentRenderer,
      container: this,
    };
    try {
      this.__instance = matrixRain(this._options);
    } catch (e) {
      console.error('[matrix-rain-element] failed to reload:', e);
    }
  }

  /** 销毁实例 */
  destroy(): void {
    if (this.__instance) {
      try {
        this.__instance.destroy();
      } catch {}
      this.__instance = null;
    }
  }

  /** 切换主题(等同 setAttribute('theme', name)) */
  set theme(name: ThemeName) {
    this.setAttribute('theme', name);
  }
  get theme(): ThemeName {
    return this._currentTheme;
  }

  set variant(name: VariantName) {
    this.setAttribute('variant', name);
  }
  get variant(): VariantName {
    return this._currentVariant;
  }

  set fontSize(n: number) {
    this.setAttribute('font-size', String(n));
  }
  get fontSize(): number {
    return this._currentFontSize;
  }

  set charset(s: string) {
    this.setAttribute('charset', s);
  }
  get charset(): string {
    return this._currentCharset;
  }

  set renderScale(s: number | 'auto') {
    this.setAttribute('render-scale', String(s));
  }
  get renderScale(): number | 'auto' {
    return this._currentRenderScale;
  }

  set renderer(s: 'canvas2d' | 'webgl' | 'webgpu' | 'auto') {
    this.setAttribute('renderer', s);
  }
  get renderer(): 'canvas2d' | 'webgl' | 'webgpu' | 'auto' {
    return this._currentRenderer;
  }

  /** 拿到原生实例句柄 */
  get instance(): MatrixRainInstance | null {
    return this.__instance;
  }
}

/**
 * 自动注册(浏览器环境)
 * SSR / Node 环境:不挂载,只导出类
 */
if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  if (!customElements.get('matrix-rain')) {
    customElements.define('matrix-rain', MatrixRainElement);
  }
}
