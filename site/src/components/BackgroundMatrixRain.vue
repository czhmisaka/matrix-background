<template>
  <div class="bg-matrix-rain">
    <canvas ref="canvasRef" class="bg-canvas" aria-hidden="true"></canvas>
    <div v-if="$slots.overlay" class="bg-overlay">
      <slot name="overlay" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useTheme } from '@/composables/useTheme';
import { textToBitmap, type MatrixRainInstance } from '@xietuier/matrix-rain';

const props = withDefaults(defineProps<{
  text?: string;
  theme?: 'silicon-valley' | 'matrix-green' | 'lava-red' | 'cyber-blue' | 'pure-mono';
  /** 0-2 亮度倍数(传给 themeParams.brightness) */
  brightness?: number;
  /** 0-1 闪烁倍率(传给 flickerSpeed) */
  flicker?: number;
}>(), {
  text: '',
  theme: undefined,
  brightness: 1,
  flicker: 1
});

const canvasRef = ref<HTMLCanvasElement | null>(null);
const { current: globalTheme } = useTheme();
let inst: MatrixRainInstance | null = null;

async function create() {
  if (!canvasRef.value) return;
  inst?.destroy();
  const mod = await import('@xietuier/matrix-rain');
  if (!canvasRef.value) return;
  inst = mod.matrixRain({
    canvas: canvasRef.value,
    theme: (props.theme || globalTheme.value),
    fontSize: 14,
    trailAlpha: 0.2,
    targetPhase: 'noise-converge',
    targetNoiseDuration: 0.5,
    targetConvergeDuration: 1.5,
    targetLockStability: 0.8,
    targetLockOrder: 'center',
    targetFadeIn: 0.4,
    targetHold: 3.0,
    targetFadeOut: 2.0,
    themeParams: { brightness: props.brightness },
    flickerSpeed: props.flicker
  });
  // 启动 250ms 后设 target
  if (props.text) {
    setTimeout(() => {
      if (!inst || !canvasRef.value) return;
      const cols = Math.max(8, Math.floor(canvasRef.value.width / 14));
      const rows = Math.max(6, Math.floor(canvasRef.value.height / 14));
      const bm = mod.textToBitmap(props.text, cols, rows);
      inst.setTargetBitmap(bm, {
        phase: 'noise-converge',
        noiseDuration: 0.5,
        convergeDuration: 1.5,
        lockOrder: 'center',
        lockStability: 0.8
      });
    }, 300);
  }
}

function updateParams() {
  if (!inst) return;
  inst.setThemeParams({ brightness: props.brightness });
  inst.setFlickerSpeed(props.flicker);
}

onMounted(create);
onBeforeUnmount(() => { inst?.destroy(); inst = null; });

watch(() => [props.brightness, props.flicker], updateParams);
watch(globalTheme, (t) => inst?.setTheme(t));
</script>

<style scoped>
.bg-matrix-rain {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  background: var(--bg);
}
.bg-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}
.bg-overlay {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
}
</style>
