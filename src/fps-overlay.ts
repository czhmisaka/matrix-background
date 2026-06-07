/**
 * @xietuier/matrix-rain · 简易 FPS 角标 overlay
 *
 * 创建一个固定在屏幕右上角的 FPS / 实例数 / 主题角标。
 * 用 requestAnimationFrame 简单实现(自身不消耗大量 CPU)。
 *
 * 用法:
 *   import { mountFpsOverlay } from '@xietuier/matrix-rain/element';
 *   // 或
 *   import { mountFpsOverlay } from '@xietuier/matrix-rain';
 *
 *   const overlay = mountFpsOverlay();
 *   // 卸载:
 *   overlay.destroy();
 */

export interface FpsOverlayHandle {
  /** 销毁角标 */
  destroy(): void;
  /** 角标 DOM 节点(暴露给高级用法) */
  el: HTMLDivElement;
}

const CSS = `
.matrix-rain-fps-overlay {
  position: fixed; top: 12px; right: 12px; z-index: 999999;
  background: rgba(8, 8, 18, 0.85); color: #00e5ff;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px; line-height: 1.4;
  padding: 8px 12px; border-radius: 6px;
  border: 1px solid rgba(0, 229, 255, 0.35);
  backdrop-filter: blur(6px);
  pointer-events: none;
  user-select: none;
  white-space: pre;
  min-width: 120px;
  text-align: right;
}
.matrix-rain-fps-overlay .fps-row { color: #00e5ff; }
.matrix-rain-fps-overlay .info-row { color: rgba(0, 229, 255, 0.65); font-size: 11px; }
.matrix-rain-fps-overlay .low { color: #ff5a5a; }
`;

/**
 * 挂载 FPS 角标到 document.body(浏览器环境)
 * @returns 销毁句柄
 */
export const mountFpsOverlay = (): FpsOverlayHandle => {
  if (typeof document === 'undefined') {
    return { destroy: () => {}, el: null as any };
  }
  // 注入样式
  if (!document.getElementById('__mr-fps-overlay-css')) {
    const style = document.createElement('style');
    style.id = '__mr-fps-overlay-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const el = document.createElement('div');
  el.className = 'matrix-rain-fps-overlay';
  el.innerHTML = '<div class="fps-row">FPS: —</div><div class="info-row">— · 0 inst</div>';
  document.body.appendChild(el);

  let raf = 0;
  let lastFps = 0;
  let frameCount = 0;
  let lastUpdate = performance.now();
  let destroyed = false;

  const tick = () => {
    if (destroyed) return;
    raf = requestAnimationFrame(tick);
    frameCount++;
    const now = performance.now();
    const elapsed = now - lastUpdate;
    if (elapsed >= 500) {
      lastFps = Math.round((frameCount * 1000) / elapsed);
      frameCount = 0;
      lastUpdate = now;
      // 取调试钩
      const dbg = (window as any).__matrixRainDebug;
      const fps = dbg?.avgFps ?? lastFps;
      const count = dbg?.count ?? 0;
      const theme = dbg?.instances?.[0]?.theme ?? '—';
      const fpsClass = fps < 30 ? 'fps-row low' : 'fps-row';
      el.innerHTML = `<div class="${fpsClass}">FPS: ${fps}</div><div class="info-row">${theme} · ${count} inst</div>`;
    }
  };
  raf = requestAnimationFrame(tick);

  return {
    el,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      el.remove();
    }
  };
};

// SSR 兜底
export default mountFpsOverlay;
