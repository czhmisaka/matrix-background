import {
  matrixRain,
  textToBitmap,
  type MatrixRainOptions,
  type MatrixRainInstance,
} from '@xietuier/matrix-rain';
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
 *
 * 0.6.2+ 增强(Playground 修复):
 * - 补齐 effectKey(renderKey 移除 trailAlpha/maxDPR → 走 setter 软更新)
 * - 新增 lastTargetArgs 缓存 + setTarget(text) 暴露
 * - mount() 完成新实例就绪后,若 lastTargetArgs 存在则自动重放 setTargetBitmap
 *   → 解决"硬重建(renderer/variant/charset)丢失 target bitmap"的 race
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
 */

export function useMatrixRain(
  optionsRef: Ref<MatrixRainOptions> | MaybeRef<MatrixRainOptions>,
  canvasRef: Ref<HTMLCanvasElement | null>,
  composableOpts: UseMatrixRainOptions = {}
): Ref<MatrixRainInstance | null> & { setTarget: (text: string) => boolean } {
  const instance = ref<MatrixRainInstance | null>(null);
  const mountFadeInDur = composableOpts.mountFadeInDuration ?? 0.1;
  const destroyFadeOutDur = composableOpts.destroyFadeOutDuration ?? 0.15;
  let pendingFadeInTimer: number | null = null;

  /**
   * 0.6.2+ target bitmap 缓存(供 mount 重建后自动恢复)
   * - 缓存 text → bitmap 计算后的 BitmapSource + 5 个 phase/lock 参数
   * - 用户调 setTarget(text) 时刷新
   * - 用户调 setTargetBitmap(bm, opts) 时也需要刷新(若 component 直接用 instance 调)
   */
  let lastTargetArgs: {
    bm: { cols: number; rows: number; data: Float32Array };
    phase: 'fade' | 'noise-converge';
    noiseDuration: number;
    convergeDuration: number;
    lockOrder: 'random' | 'topdown' | 'bottomup' | 'center' | 'edge' | 'leftright' | 'rightleft';
    lockStability: number;
  } | null = null;

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
      // ★ 0.6.2+ 关键: 新实例就绪后自动恢复 target bitmap
      // 解决硬重建(renderer/variant/charset)时丢失 target 的 race
      if (lastTargetArgs && instance.value) {
        try {
          instance.value.setTargetBitmap(lastTargetArgs.bm, {
            phase: lastTargetArgs.phase,
            noiseDuration: lastTargetArgs.noiseDuration,
            convergeDuration: lastTargetArgs.convergeDuration,
            lockOrder: lastTargetArgs.lockOrder,
            lockStability: lastTargetArgs.lockStability,
          });
        } catch (e) {
          console.warn('[useMatrixRain] failed to restore target bitmap after mount:', e);
        }
      }
    } catch (e) {
      console.error('[useMatrixRain] failed to init:', e);
      // 0.7.1+ B6/P2-10: 错误时带上 renderer health 快照, 便于远程定位
      try {
        const dbg = (
          window as unknown as { __matrixRainDebug?: { getHealthSummary?: () => unknown } }
        ).__matrixRainDebug;
        if (dbg && typeof dbg.getHealthSummary === 'function') {
          console.error('[useMatrixRain] health summary at failure:', dbg.getHealthSummary());
        }
      } catch {
        /* 忽略 */
      }
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

  /**
   * 0.6.2+ 暴露:设置目标位图(text 自动转 bitmap)· 缓存参数,mount 重建后自动恢复
   * - 取代旧版 PlaygroundPage 自己 watch params + regenerate() 的 race-y 流程
   * - 内部根据 canvas CSS 尺寸 + fontSize 计算 cols/rows,textToBitmap,缓存 args
   * - 若 instance 还没 mount 完(text/canvas 未就绪),直接缓存等下次 mount 重放
   * @returns true = 已 set, false = 等待(instance/canvas 未就绪)
   */
  const setTarget = (text: string): boolean => {
    const cv = canvasRef.value;
    const inst = instance.value;
    if (!cv || !inst) {
      // instance 未就绪,缓存 args 等下次 mount 重放
      const o = unref(optionsRef);
      lastTargetArgs = {
        // 没有真实 cols/rows,先占位等下次 setTarget 重算
        bm: { cols: 0, rows: 0, data: new Float32Array(0) },
        phase: o.targetPhase ?? 'fade',
        noiseDuration: o.targetNoiseDuration ?? 0.5,
        convergeDuration: o.targetConvergeDuration ?? 1.5,
        lockOrder: o.targetLockOrder ?? 'random',
        lockStability: o.targetLockStability ?? 0.7,
      };
      return false;
    }
    const cssW = cv.clientWidth || cv.width;
    const cssH = cv.clientHeight || cv.height;
    const o = unref(optionsRef);
    const fontSize = o.fontSize ?? 6;
    const cols = Math.max(8, Math.floor(cssW / fontSize));
    const rows = Math.max(6, Math.floor(cssH / fontSize));
    const t = (text || ' ').trim() || ' ';
    const bm = textToBitmap(t, cols, rows, undefined, 'contain');
    lastTargetArgs = {
      bm,
      phase: o.targetPhase ?? 'fade',
      noiseDuration: o.targetNoiseDuration ?? 0.5,
      convergeDuration: o.targetConvergeDuration ?? 1.5,
      lockOrder: o.targetLockOrder ?? 'random',
      lockStability: o.targetLockStability ?? 0.7,
    };
    try {
      inst.setTargetBitmap(bm, {
        phase: lastTargetArgs.phase,
        noiseDuration: lastTargetArgs.noiseDuration,
        convergeDuration: lastTargetArgs.convergeDuration,
        lockOrder: lastTargetArgs.lockOrder,
        lockStability: lastTargetArgs.lockStability,
      });
      return true;
    } catch (e) {
      console.error('[useMatrixRain] setTarget failed:', e);
      try {
        const dbg = (
          window as unknown as { __matrixRainDebug?: { getHealthSummary?: () => unknown } }
        ).__matrixRainDebug;
        if (dbg && typeof dbg.getHealthSummary === 'function') {
          console.error('[useMatrixRain] health summary:', dbg.getHealthSummary());
        }
      } catch {
        /* 忽略 */
      }
      return false;
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
    // 清理缓存
    lastTargetArgs = null;
  });

  // 0.4.0+ watch 拆分:
  // - renderKey: 改 canvas / renderer / variant / charset / 物理参数(无 setter) → 硬重建
  // - effectKey: 改 theme / fontSize / themeParams / variantParams / 0.6.2+ target 等(有 setter) → 软更新
  //
  // 0.6.2+ 修复(Playground bug 修复):
  // - trailAlpha / maxDPR 之前在 renderKey(强制硬重建)→ 走 setter 软更新,消除闪烁
  // - targetPhase / targetNoiseDuration / targetConvergeDuration / targetLockOrder / targetLockStability
  //   之前完全不在任何一个 key → 走 setter 软更新,改完立即生效
  const renderKey = (): unknown => {
    const o = unref(optionsRef);
    return [
      o.renderer,
      o.variant,
      o.charset,
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
      // 0.6.2+ 软更新字段(此前缺失,导致 Playground 调参不响应)
      o.trailAlpha,
      o.maxDPR,
      o.targetPhase,
      o.targetNoiseDuration,
      o.targetConvergeDuration,
      o.targetLockOrder,
      o.targetLockStability,
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
      // 0.6.2+ 软更新 setter:
      if (o.trailAlpha !== undefined) inst.setTrailAlpha(o.trailAlpha);
      if (o.maxDPR !== undefined) inst.setMaxDPR(o.maxDPR);
      if (o.targetPhase !== undefined) inst.setTargetPhase(o.targetPhase);
      if (o.targetNoiseDuration !== undefined) inst.setTargetNoiseDuration(o.targetNoiseDuration);
      if (o.targetConvergeDuration !== undefined)
        inst.setTargetConvergeDuration(o.targetConvergeDuration);
      if (o.targetLockOrder !== undefined) inst.setTargetLockOrder(o.targetLockOrder);
      if (o.targetLockStability !== undefined) inst.setTargetLockStability(o.targetLockStability);
    } catch (e) {
      console.error('[useMatrixRain] soft update failed:', e);
      try {
        const dbg = (
          window as unknown as { __matrixRainDebug?: { getHealthSummary?: () => unknown } }
        ).__matrixRainDebug;
        if (dbg && typeof dbg.getHealthSummary === 'function') {
          console.error('[useMatrixRain] health summary:', dbg.getHealthSummary());
        }
      } catch {
        /* 忽略 */
      }
    }
    onCleanup(() => {
      /* noop */
    });
  });

  // 0.6.2+: 把 setTarget 挂到 ref 上(返回增强 ref,component 可直接 rain.setTarget(text))
  return Object.assign(instance, { setTarget });
}
