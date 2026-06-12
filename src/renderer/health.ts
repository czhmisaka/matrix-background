/**
 * @xietuier/matrix-rain · Renderer Health Tracker (0.6.0+)
 *
 * **职责**: 收集 renderer 运行时诊断信号,让"webgl/webgpu 健不健康"可被代码探查
 * - WebGL: 每帧 render() 末尾调 `gl.getError()`,记入 `lastGlError`
 * - WebGPU: 每帧 `queue.submit` 前后 `device.pushErrorScope('validation')` /
 *   `popErrorScope()`,错误信息记入 `lastErrorScope`
 * - canvas2d: trivial,只填 initialized + frameCount
 *
 * **设计原则**:
 * - 零性能分支:tracker 内部所有字段直写,无 if 分支;调用方只在调用 gl.getError() /
 *   error scope 时付出 ~10 ns 成本
 * - `getRendererHealth()` 返回 `Object.freeze` 副本,调用方无法篡改
 * - 字段不重复定义:每帧调一次 `snapshot()` 比对 dirty flag 决定是否 clone
 *
 * @since 0.6.0
 */

import type { RendererImpl } from './types';

/** 一帧内任意位置的错误来源(0.6.0:仅 WebGL 用,WGSL 错误走 lastErrorScope) */
export type RendererHealthErrorCode =
  | number // WebGL gl.getError() raw code
  | 'INSTANCE_COUNT_MISMATCH' // drawArraysInstanced 与 grid cols*rows 不一致
  | 'INIT_FAILED' // init() reject
  | 'BINDGROUP_FAILED' // _createBindGroups 失败
  | string; // 兜底:WebGPU GPUError.message 等

/** Renderer 健康快照(0.6.0+,可序列化为 JSON) */
export interface RendererHealth {
  /** 实际渲染器类型 */
  renderer: RendererImpl;
  /** init() 是否完成(未完成时 draw* / render 会 no-op) */
  initialized: boolean;
  /** 从 init() 完成后累计的帧数 */
  frameCount: number;
  /** 当前帧调 drawChar 写入 instance buffer 的次数(0.4.1 P0-1 修复后用 _drawCallIdx 累计) */
  drawCallIdx: number;
  /** instance buffer 总容量(通常 = gridCols × gridRows) */
  instanceCount: number;
  /** 当前 grid 列数(state.r) */
  gridCols: number;
  /** 当前 grid 行数(state.i) */
  gridRows: number;
  /** init() 耗时(毫秒),init 未完成 = 0 */
  initDurationMs: number;
  /** 上一帧 render() 耗时(毫秒) */
  lastFrameDurationMs: number;
  /** 自启动以来 fps < 30 的帧数(0.6.0+:从 state.fps 检测) */
  droppedFrames: number;
  /** WebGL: gl.getError() 最近一次返回值(0 = NO_ERROR),WebGPU/canvas2d = 0 */
  lastGlError: number;
  /** WebGPU: popErrorScope() 最近一次错误 message,null = 无错误,canvas2d/webgl = null */
  lastErrorScope: string | null;
  /** init() 失败时的 Error.message(可空) */
  lastInitError: string | null;
}

/** 内部 mutable 状态(不导出) */
interface HealthInternal {
  renderer: RendererImpl;
  initialized: boolean;
  frameCount: number;
  drawCallIdx: number;
  instanceCount: number;
  gridCols: number;
  gridRows: number;
  initDurationMs: number;
  lastFrameDurationMs: number;
  droppedFrames: number;
  lastGlError: number;
  lastErrorScope: string | null;
  lastInitError: string | null;
}

/** 创建 health tracker 工厂 */
export const createHealthTracker = (renderer: RendererImpl): HealthInternal => ({
  renderer,
  initialized: false,
  frameCount: 0,
  drawCallIdx: 0,
  instanceCount: 0,
  gridCols: 0,
  gridRows: 0,
  initDurationMs: 0,
  lastFrameDurationMs: 0,
  droppedFrames: 0,
  lastGlError: 0,
  lastErrorScope: null,
  lastInitError: null,
});

/** 记录一次错误(0.6.0:既不 throw 也不 console.error,只更新字段) */
export const recordHealthError = (h: HealthInternal, code: RendererHealthErrorCode): void => {
  if (code === 'INSTANCE_COUNT_MISMATCH' || code === 'INIT_FAILED' || code === 'BINDGROUP_FAILED') {
    // 字符串 code 走 lastInitError(WebGL instance 计数错也算 init 期外逻辑错)
    h.lastInitError = String(code);
    return;
  }
  if (typeof code === 'number') {
    h.lastGlError = code;
    return;
  }
  // 兜底:WebGPU 错误 message
  h.lastErrorScope = String(code);
};

/**
 * 帧末更新 droppedFrames(state.fps < 30 视为掉帧)
 * - 避免对每次调用引入 if 分支:state.fps 默认 60,只读一次
 * - 跨 renderer 共享逻辑,所以放 health.ts
 *
 * @since 0.6.0
 */
export const tickDroppedFrames = (h: HealthInternal, stateFps: number): void => {
  if (stateFps > 0 && stateFps < 30) h.droppedFrames++;
};

/** 返回 Object.freeze 副本 */
export const snapshotHealth = (h: HealthInternal): RendererHealth =>
  Object.freeze({
    renderer: h.renderer,
    initialized: h.initialized,
    frameCount: h.frameCount,
    drawCallIdx: h.drawCallIdx,
    instanceCount: h.instanceCount,
    gridCols: h.gridCols,
    gridRows: h.gridRows,
    initDurationMs: h.initDurationMs,
    lastFrameDurationMs: h.lastFrameDurationMs,
    droppedFrames: h.droppedFrames,
    lastGlError: h.lastGlError,
    lastErrorScope: h.lastErrorScope,
    lastInitError: h.lastInitError,
  }) as RendererHealth;
