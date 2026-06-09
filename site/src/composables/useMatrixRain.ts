import { matrixRain, type MatrixRainOptions, type MatrixRainInstance } from '@xietuier/matrix-rain';
import { ref, watch, onMounted, onBeforeUnmount, type Ref, type MaybeRef, unref } from 'vue';

/**
 * 包装 matrixRain 与 Vue 生命周期:
 * - onMounted 创建实例(可选初始 fade-in)
 * - onBeforeUnmount 软销毁(可选淡出后销毁)
 * - watch(options) 深度监听,变更后旧实例淡出 → 新实例淡入
 * 返回 ref<MatrixRainInstance | null>
 *
 * 过渡系统集成:
 * - mountFadeInDuration:新建实例从 alpha=0 渐变到 1 的秒数
 * - destroyFadeOutDuration:销毁前从 alpha=1 渐变到 0 的秒数
 * - 重建时:先旧实例淡出(destroyFadeOutDuration),再新实例创建并淡入(mountFadeInDuration)
 */
export interface UseMatrixRainOptions {
  /** 创建后从 alpha=0 渐变到 1 的秒数(0 = 立即显示) */
  mountFadeInDuration?: number;
  /** 销毁前从 alpha=1 渐变到 0 的秒数(0 = 立即销毁) */
  destroyFadeOutDuration?: number;
}

/**
 * 关于 fitMode 透传:
 * - matrixRain 支持 MatrixRainOptions.targetFitMode('contain' | 'cover' | 'actual' | 'auto',默认 'contain')
 * - useMatrixRain 把整个 optionsRef 透传给 matrixRain,所以 consumer 只要在 optionsRef 里加 targetFitMode 即可
 * - 详见 types/index.d.ts 中 FitMode 的注释
 * - 默认 contain 会自动检测 targetBitmap 是否溢出 grid(扫描非零像素 bbox),
 *   若 cols/rows > 0.95 × grid 自动等比缩放,确保文字始终在可视区内
 * - 旧版 Playground / BackgroundMatrixRain 调用方 bug 修复:
 *   旧代码用 canvas.width/height(DPR-缩放 backing store)算 cols/rows 传给 textToBitmap
 *   新代码改用 canvas.clientWidth/Height(CSS 像素)—— 但 fitMode='contain' 仍是兜底
 *   即使未来再出现类似 bug,引擎层也会自动拦截
 */

export function useMatrixRain(
  optionsRef: Ref<MatrixRainOptions> | MaybeRef<MatrixRainOptions>,
  canvasRef: Ref<HTMLCanvasElement | null>,
  composableOpts: UseMatrixRainOptions = {}
): Ref<MatrixRainInstance | null> {
  const instance = ref<MatrixRainInstance | null>(null);
  const mountFadeInDur = composableOpts.mountFadeInDuration ?? 0.1;
  const destroyFadeOutDur = composableOpts.destroyFadeOutDuration ?? 0.15;
  let pendingFadeInTimer: number | null = null;

  /**
   * 软销毁:fade-out alpha over dur,期间 stop new rAF activity 但仍绘制
   * 实际:用 setTransitionAlpha + rAF 动画(不真停 rAF · 否则 fade-out 期间无帧)
   */
  const softDestroy = (inst: MatrixRainInstance | null, dur: number): Promise<void> => {
    if (!inst) return Promise.resolve();
    if (dur <= 0) {
      try {
        inst.destroy();
      } catch {}
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      try {
        inst.setTransitionAlpha(1.0, dur);
      } catch {
        resolve();
        return;
      }
      const start = performance.now();
      const tick = () => {
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed >= dur) {
          try {
            inst.destroy();
          } catch {}
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };

  const mount = async () => {
    if (!canvasRef.value) return;
    // 销毁前先淡出(若旧实例还在)
    if (instance.value) {
      await softDestroy(instance.value, destroyFadeOutDur);
      instance.value = null;
    }
    try {
      // 不传 canvas 选项,直接传给 matrixRain
      const opts = { ...unref(optionsRef), canvas: canvasRef.value };
      instance.value = matrixRain(opts);
      // ========== F1 Hero canvas 渐入(默认 100ms)==========
      if (mountFadeInDur > 0) {
        try {
          instance.value.setTransitionAlpha(0);
          if (pendingFadeInTimer !== null) clearTimeout(pendingFadeInTimer);
          pendingFadeInTimer = window.setTimeout(() => {
            try {
              instance.value?.setTransitionAlpha(1.0, mountFadeInDur);
            } catch {}
            pendingFadeInTimer = null;
          }, 16); // 等首帧渲染后再启动 fade
        } catch {
          // 旧版本无 setTransitionAlpha,忽略
        }
      }
    } catch (e) {
      console.error('[useMatrixRain] failed to init:', e);
    }
  };

  const destroy = async () => {
    if (pendingFadeInTimer !== null) {
      clearTimeout(pendingFadeInTimer);
      pendingFadeInTimer = null;
    }
    // 软销毁:让 instance 走完淡出,再真正 destroy
    if (instance.value) {
      await softDestroy(instance.value, destroyFadeOutDur);
      instance.value = null;
    }
  };

  onMounted(() => {
    // mount 内部已经 await,这里 fire-and-forget 即可(Vue 不需要等 onMounted)
    void mount();
  });
  onBeforeUnmount(() => {
    if (pendingFadeInTimer !== null) {
      clearTimeout(pendingFadeInTimer);
      pendingFadeInTimer = null;
    }
    // 不阻塞 unmount:同步触发 destroy,然后异步完成 fade-out
    if (instance.value) {
      const inst = instance.value;
      instance.value = null;
      // 同步开始淡出(异步完成销毁,不阻塞路由切换)
      void softDestroy(inst, destroyFadeOutDur);
    }
  });

  // 0.4.0+ watch 拆分:
  // - renderKey: 改 canvas / renderer / variant / charset / 任何没有 setter 的字段 → 硬重建
  // - effectKey: 改 theme / fontSize / themeParams / variantParams / ... 有 setter 的字段 → 软更新
  //
  // 0.4.1 修复 P1-1/2/3:
  // - variant 之前传空对象 setVariantParams({}) 切不动 variant → 改走硬重建
  // - charset 之前 skip → 改走硬重建
  // - 11+ 没有 setter 的字段(trailAlpha/maxDPR/sparkProbability/clickBurst/
  //   flickerRates/warmthRadius/warmthLerp/lightCenter/driftSpeed)之前在
  //   effectKey 监听但 apply 分支空跳过 → 改走硬重建
  //
  // 注: 旧版单一 deep watch → 任何字段都触发软销毁重建。WebGL 模式下 shader 编译
  // 需 10-50ms,频繁 rebuild 会让用户体验明显卡顿。拆分后:
  // - 调主题: setTheme 走 setter, 1-2 帧过渡
  // - 改 renderer / variant / charset / 物理参数: _reload() 硬重建, 一次性
  const renderKey = (): unknown => {
    const o = unref(optionsRef);
    return [
      o.renderer,
      o.variant,
      o.charset,
      o.trailAlpha,
      o.maxDPR,
      o.sparkProbability,
      o.clickBurst,
      o.flickerRates,
      o.warmthRadius,
      o.warmthLerp,
      o.lightCenter,
      o.driftSpeed,
      canvasRef.value,
    ];
  };
  const effectKey = (): unknown => {
    const o = unref(optionsRef);
    return [
      o.theme,
      o.fontSize,
      o.coldPalette,
      o.warmPalette,
      o.themeParams,
      o.variantParams,
      o.targetFPS,
      o.renderScale,
      o.flickerSpeed,
      o.hueRotateSpeed,
    ];
  };
  watch(renderKey, () => {
    void mount();
  });
  watch(effectKey, (_n, _o, onCleanup) => {
    const inst = instance.value;
    if (!inst) return;
    const o = unref(optionsRef);
    // 软更新(直接调 setter,不走 mount/destroy)
    try {
      // setTheme 只接受 ThemeName(string),不接受 { coldFrom, warmFrom } 拼色对象
      // — 拼色场景走 renderKey 硬重建(由 matrixRain init 时构造)
      if (typeof o.theme === 'string') inst.setTheme(o.theme);
      if (o.fontSize !== undefined) inst.setDensity(o.fontSize);
      if (o.coldPalette && o.warmPalette) inst.setPalettes(o.coldPalette, o.warmPalette);
      if (o.themeParams) inst.setThemeParams(o.themeParams);
      if (o.variantParams) inst.setVariantParams(o.variantParams);
      if (o.targetFPS !== undefined) inst.setTargetFPS(o.targetFPS);
      if (o.renderScale !== undefined) inst.setRenderScale(o.renderScale);
      if (o.flickerSpeed !== undefined) inst.setFlickerSpeed(o.flickerSpeed);
      if (typeof o.hueRotateSpeed === 'number') inst.setHueRotate(o.hueRotateSpeed);
    } catch (e) {
      console.error('[useMatrixRain] soft update failed:', e);
    }
    onCleanup(() => {
      /* noop */
    });
  });

  return instance;
}
