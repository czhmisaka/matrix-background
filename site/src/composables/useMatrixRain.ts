import { matrixRain, type MatrixRainOptions, type MatrixRainInstance } from '@xietuier/matrix-rain';
import { ref, watch, onMounted, onBeforeUnmount, type Ref, type MaybeRef, unref } from 'vue';

/**
 * 包装 matrixRain 与 Vue 生命周期:
 * - onMounted 创建实例
 * - onBeforeUnmount 销毁实例
 * - watch(options) 深度监听,变更后重建
 * 返回 ref<MatrixRainInstance | null>
 */
export function useMatrixRain(
  optionsRef: Ref<MatrixRainOptions> | MaybeRef<MatrixRainOptions>,
  canvasRef: Ref<HTMLCanvasElement | null>
): Ref<MatrixRainInstance | null> {
  const instance = ref<MatrixRainInstance | null>(null);

  const mount = () => {
    if (!canvasRef.value) return;
    instance.value?.destroy();
    try {
      // 不传 canvas 选项,直接传给 matrixRain
      const opts = { ...unref(optionsRef), canvas: canvasRef.value };
      instance.value = matrixRain(opts);
    } catch (e) {
      console.error('[useMatrixRain] failed to init:', e);
    }
  };

  const destroy = () => {
    instance.value?.destroy();
    instance.value = null;
  };

  onMounted(mount);
  onBeforeUnmount(destroy);
  watch(() => unref(optionsRef), mount, { deep: true });

  return instance;
}
