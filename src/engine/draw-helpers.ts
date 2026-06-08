/**
 * @xietuier/matrix-rain · 绘制 helpers
 *
 * 之前 drawClassic / drawAvalanche / drawRipple / drawInner 全部内联在 matrixRain()
 * 闭包内(共 ~377 行),与 ~30 个 setter / state / 事件回调紧密耦合。
 * 本文件把它们抽出来,所有函数接受 state 作为唯一可变状态源,orchestrator
 * 通过 state.hooks 注入回调。
 *
 * 关键优化(P1-1 性能):
 *   - 第三层 LUT(blended[d_bucket])消除 per-cell applyTP 调用
 *   - 4,800 cells 网格 + 60fps → 每秒 ~278K 次 applyTP → ~0
 *
 * 共享 helper:
 *   - drawInner / drawFillBlended:变体共享,只 set fillStyle + fillText
 *   - applyTargetBitmapPhase / updateTargetBitmapPhaseGlobal:noise-converge 状态机
 *
 * 行为兼容性:所有 setter / state 访问都通过 state 字段 · 运行时序与原版一致
 *  · 三个变体的 warmth 阻尼 / 闪烁 / charsetFunc / 噪声→收敛 逻辑不变
 */

import { MatrixRainState, Cell, easeIn, easeOut, FLICKER_SPEED_DEFAULT } from './state';

// ==================== 共享 fillRGBA helper ====================

/**
 * 按 d 从第三层 LUT 取一个 RGBA(冷暖 + applyTP 全部 bake 完) + 写 fillStyle + fillText
 *
 * 替换原 drawInner / drawAvalanche / drawRipple 内联的 6 行 LUT 查表 + blend + applyTP 逻辑
 * 三个变体共享同一份 4 次数组读取 + 1 次乘法(alpha)代码
 */
const drawFillBlended = (
  state: MatrixRainState,
  c: Cell,
  h: number,
  _s: number,
  y: number,
  l: number,
  d: number,
  totalHue: number
): void => {
  // 第三层 LUT:32 桶(按 d 量化)+ 256 项
  const blendedLUT = state.paletteLUT.getBlendedLUT(state.effectiveTp, totalHue, d);
  const lIdx = (l * 255) | 0;
  const R2 = blendedLUT.r[lIdx];
  const G2 = blendedLUT.g[lIdx];
  const B2 = blendedLUT.b[lIdx];
  const k = blendedLUT.a[lIdx] / 255;
  const finalA = k * state.transitionAlpha;
  state.ctx.fillStyle = `rgba(${R2}, ${G2}, ${B2}, ${finalA})`;
  state.ctx.fillText(state.charset[c.ch], h * state.ef + state.ef / 2, y);
};

// ==================== drawInner · canonical cell 绘制 ====================

/**
 * 单 cell 绘制 · 走 colorOverride 优先,否则走 LUT 路径
 *
 * 用法:被 drawClassic 调(完整路径:userFunc.flickerCurve + charsetFunc)
 * 行为 100% 等价于原 drawInner
 */
export const drawInner = (
  state: MatrixRainState,
  c: Cell,
  h: number,
  s: number,
  y: number,
  l: number,
  M: number,
  p: number,
  totalHue: number
): void => {
  // warmth 阻尼(每 cell 一次 · 平方根 + lerp)
  const C = h - M,
    A = s - p;
  const B = Math.sqrt(C * C + A * A);
  const H = Math.max(0, 1 - B / (state.i * state.cfg.warmthRadius));
  c.warmth += (H - c.warmth) * state.cfg.warmthLerp;
  const d = Math.max(0, Math.min(1, c.warmth));

  // l < 0.02 肉眼几乎不可见,直接跳过(省 fillStyle + fillText)
  if (l < 0.02) return;

  // colorOverride fast path · 函数式优先,Record 兜底
  const __lIdx = (l * 9) | 0;
  if (state.colorOverrideFn) {
    const out = state.colorOverrideFn(__lIdx, h, s, {
      ch: c.ch,
      warmth: d,
      bright: c.bright,
      phase: c.phase,
    });
    if (out) {
      state.ctx.fillStyle = `rgba(${out[0]}, ${out[1]}, ${out[2]}, 0.9)`;
      state.ctx.fillText(state.charset[c.ch], h * state.ef + state.ef / 2, y);
      return;
    }
  } else if (state.colorOverrides && typeof state.colorOverrides === 'object') {
    const ov = (state.colorOverrides as Record<number, [number, number, number]>)[__lIdx];
    if (ov) {
      state.ctx.fillStyle = `rgba(${ov[0]}, ${ov[1]}, ${ov[2]}, 0.9)`;
      state.ctx.fillText(state.charset[c.ch], h * state.ef + state.ef / 2, y);
      return;
    }
  }

  // 共享 fillRGBA · 第三层 LUT(冷暖 + applyTP 全部 bake 完)
  drawFillBlended(state, c, h, s, y, l, d, totalHue);
};

// ==================== noise-converge 状态机 ====================

/**
 * 推导锚点偏移(每帧调一次,然后所有 cell 共享)
 * 性能优化:避免每个 cell 重算 if 链
 */
export const computeTargetOrigin = (state: MatrixRainState): { ox: number; oy: number } => {
  if (state.__cachedAnchorValid) {
    return { ox: state.__cachedAnchorOx, oy: state.__cachedAnchorOy };
  }
  let ox = 0,
    oy = 0;
  if (state.targetAnchor === 'center') {
    ox = (state.r - state.targetCols) >> 1;
    oy = (state.i - state.targetRows) >> 1;
  } else if (state.targetAnchor === 'topRight') {
    ox = state.r - state.targetCols;
    oy = 0;
  } else if (state.targetAnchor === 'bottomLeft') {
    ox = 0;
    oy = state.i - state.targetRows;
  } else if (state.targetAnchor === 'bottomRight') {
    ox = state.r - state.targetCols;
    oy = state.i - state.targetRows;
  }
  state.__cachedAnchorOx = ox;
  state.__cachedAnchorOy = oy;
  state.__cachedAnchorValid = true;
  return { ox, oy };
};

/**
 * 每帧调一次(在 cell 循环前)· 处理 dissolve 阶段进入与结束判定
 * - 检测首次进入 dissolve 时刻,为所有已锁 cell 计算 unlockTime
 * - 检测 dissolve 完成时刻,清理 targetBitmap + 触发 onTargetFinish
 */
export const updateTargetBitmapPhaseGlobal = (state: MatrixRainState): void => {
  state.__cachedAnchorValid = false;
  if (!state.targetBitmap || !state.targetActive || state.targetPhase !== 'noise-converge') return;
  const elapsed = state.wallTime - state.targetStartTime;
  const dissolveStart = state.targetNoiseDuration + state.targetConvergeDuration + state.targetHold;
  // 进入 dissolve 阶段:为所有已锁 cell 设置 unlockTime(倒序 rank → 1-rank)
  // 用 1e-9 epsilon 容忍 wallTime 累积浮点误差
  if (state.targetDissolveStartTime < 0 && elapsed + 1e-9 >= dissolveStart) {
    state.targetDissolveStartTime = dissolveStart;
    for (let s = 0; s < state.i; s++) {
      for (let h = 0; h < state.r; h++) {
        const c = state.b[s][h];
        if (c.locked && c.lockTime !== undefined && c.unlockTime === undefined) {
          const rank = (c.lockTime - state.targetNoiseDuration) / state.targetConvergeDuration;
          c.unlockTime = state.targetDissolveStartTime + (1 - rank) * state.targetFadeOut;
        }
      }
    }
  }
  // dissolve 完成判定
  if (
    state.targetDissolveStartTime >= 0 &&
    elapsed + 1e-9 >= state.targetDissolveStartTime + state.targetFadeOut
  ) {
    state.targetActive = false;
    state.targetBitmap = null;
    if (!state.targetFinishFired) {
      state.targetFinishFired = true;
      state.hooks.fireOnTargetFinish();
    }
  }
};

/**
 * 单 cell 阶段处理(在 cell 循环中调)
 * 输入:c(单元格)· h/s(网格坐标)· l(变体原始亮度)· elapsed(可选,默认用全局 wallTime)
 * 输出:{ l, ch, skipCharset } 或 null(非 noise-converge 模式)
 * - skipCharset = true:此 cell 由 phase 完全接管,跳过 normal flicker/charset 更新
 * - skipCharset = false:此 cell 让 normal flicker/charset 接管 ch 更新(非目标区 hold/dissolve)
 */
export const applyTargetBitmapPhase = (
  state: MatrixRainState,
  c: Cell,
  h: number,
  s: number,
  l: number,
  elapsedOpt?: number,
  isSub: boolean = false
): { l: number; ch: number; skipCharset: boolean } | null => {
  if (!state.targetBitmap || !state.targetActive || state.targetPhase !== 'noise-converge')
    return null;
  const elapsed = elapsedOpt !== undefined ? elapsedOpt : state.wallTime - state.targetStartTime;
  const noiseStart = state.targetNoiseDuration;
  const convergeSpan = state.targetConvergeDuration;
  const EPS = 1e-9;

  // ========== A3 per-cell lock-in ease (优先级最高)==========
  if (
    c.lockEaseStart !== undefined &&
    c.lockEaseFromL !== undefined &&
    c.lockEaseToL !== undefined
  ) {
    const t = Math.min(
      1,
      Math.max(0, (elapsed - c.lockEaseStart) / Math.max(0.001, state.cellLockEaseDur))
    );
    const eased = easeOut(t);
    const resultL = c.lockEaseFromL * (1 - eased) + c.lockEaseToL * eased;
    if (t >= 1) {
      c.lockEaseStart = undefined;
      c.lockEaseFromL = undefined;
      c.lockEaseToL = undefined;
    }
    return { l: Math.max(0, Math.min(1, resultL)), ch: c.ch, skipCharset: true };
  }
  // ========== A4 per-cell unlock ease ==========
  if (
    c.unlockEaseStart !== undefined &&
    c.unlockEaseFromL !== undefined &&
    c.unlockEaseToL !== undefined
  ) {
    const t = Math.min(
      1,
      Math.max(0, (elapsed - c.unlockEaseStart) / Math.max(0.001, state.cellLockEaseDur))
    );
    const eased = easeIn(t);
    const resultL = c.unlockEaseFromL * (1 - eased) + c.unlockEaseToL * eased;
    if (t >= 1) {
      c.unlockEaseStart = undefined;
      c.unlockEaseFromL = undefined;
      c.unlockEaseToL = undefined;
    }
    return {
      l: Math.max(0, Math.min(1, resultL)),
      ch: c.ch,
      skipCharset: false,
    };
  }

  // Phase 1: noise(全屏 chaos,即使变体也算 noise)
  if (elapsed + EPS < noiseStart) {
    const noiseL = Math.random();
    if (state.noiseFadeInDur > 0) {
      const t = Math.min(1, Math.max(0, elapsed / state.noiseFadeInDur));
      if (t < 1) {
        const eased = easeOut(t);
        return {
          l: l * (1 - eased) + noiseL * eased,
          ch: Math.floor(Math.random() * state.charset.length),
          skipCharset: true,
        };
      }
    }
    return {
      l: noiseL,
      ch: Math.floor(Math.random() * state.charset.length),
      skipCharset: true,
    };
  }

  // 锚点快速拒绝 · 子格模式按 floor(h/eff) 映射回父格坐标再减锚点
  const { ox, oy } = computeTargetOrigin(state);
  const eff = state.renderScaleEffective;
  const bx = (isSub ? Math.floor(h / eff) : h) - ox,
    by = (isSub ? Math.floor(s / eff) : s) - oy;
  if (bx < 0 || bx >= state.targetCols || by < 0 || by >= state.targetRows) {
    // 非目标区
    const convergeElapsed = elapsed - noiseStart;
    if (convergeElapsed + EPS < convergeSpan) {
      // Phase 2 blend:noise → rain
      const rainFactor = convergeElapsed / convergeSpan;
      const noiseL = Math.random();
      return {
        l: noiseL * (1 - rainFactor) + l * rainFactor,
        ch: c.ch,
        skipCharset: false,
      };
    }
    return { l, ch: c.ch, skipCharset: false };
  }
  const g = state.targetBitmap[by * state.targetCols + bx];
  if (g <= 0) {
    const convergeElapsed = elapsed - noiseStart;
    if (convergeElapsed + EPS < convergeSpan) {
      const rainFactor = convergeElapsed / convergeSpan;
      const noiseL = Math.random();
      return {
        l: noiseL * (1 - rainFactor) + l * rainFactor,
        ch: c.ch,
        skipCharset: false,
      };
    }
    return { l, ch: c.ch, skipCharset: false };
  }

  // 目标区 cell:lock state machine
  if (c.locked && c.unlockTime !== undefined && elapsed + EPS >= c.unlockTime) {
    // 解锁 → 切到 noise
    const prevL = Math.max(0, Math.min(1, g * 0.7));
    c.locked = false;
    c.unlockEaseStart = elapsed;
    c.unlockEaseFromL = prevL;
    c.unlockEaseToL = Math.random();
  }
  // 只在 dissolve 阶段前(没有 unlockTime)才允许锁定
  if (
    !c.locked &&
    c.unlockTime === undefined &&
    c.lockTime !== undefined &&
    elapsed + EPS >= c.lockTime
  ) {
    const prevL = Math.random();
    c.locked = true;
    c.lockEaseStart = elapsed;
    c.lockEaseFromL = prevL;
    c.lockEaseToL = Math.max(0, Math.min(1, g * 0.7));
    c.lockedCh = Math.floor(Math.random() * state.charset.length);
  }
  if (c.locked) {
    // 子格模式:lockedCh 写只在父格层发生 1 次(Step 4 wrapper 在外层做)
    // 此处只在 isSub=false 时随机化,避免 4 子格各写一次 → 最后赢的 bug
    if (!isSub && Math.random() > state.targetLockStability) {
      c.lockedCh = Math.floor(Math.random() * state.charset.length);
    }
    return {
      l: Math.max(0, Math.min(1, g * 0.7)),
      ch: c.lockedCh!,
      skipCharset: true,
    };
  }
  // 未锁(noise/converge 早期 或 dissolve 中已解锁):noise 行为
  if (
    c.unlockEaseStart !== undefined &&
    !c.locked &&
    c.unlockEaseFromL !== undefined &&
    c.unlockEaseToL !== undefined
  ) {
    const t = Math.min(
      1,
      Math.max(0, (elapsed - c.unlockEaseStart) / Math.max(0.001, state.cellLockEaseDur))
    );
    const eased = easeIn(t);
    const resultL = c.unlockEaseFromL * (1 - eased) + c.unlockEaseToL * eased;
    if (t >= 1) {
      c.unlockEaseStart = undefined;
      c.unlockEaseFromL = undefined;
      c.unlockEaseToL = undefined;
    }
    return {
      l: Math.max(0, Math.min(1, resultL)),
      ch: c.ch,
      skipCharset: false,
    };
  }
  return {
    l: Math.random(),
    ch: Math.floor(Math.random() * state.charset.length),
    skipCharset: true,
  };
};

// ==================== 三个变体 draw ====================

/**
 * Classic 变体:3 sin 相加 + phaseStep + brightnessCurve + 完整 flicker / charset
 * 行为 100% 等价于原 drawClassic · 'ascii' 变体直接走同一路径
 */
export const drawClassic = (state: MatrixRainState): void => {
  const totalHue = state.dynamicHue + state.dynamicColorHue;
  const fBase1 = state.wallTime * 1.2;
  const fBase2 = state.wallTime * 0.9;
  // 同步 __frameCtx 的 f(给 userFunc 用)
  state.__frameCtx.f = state.f;
  state.__frameCtx.t = state.wallTime;
  // noise-converge 模式:每帧调一次全局状态
  state.hooks.updateTargetBitmapPhaseGlobal();

  for (let s = 0; s < state.i; s++) {
    const y = s * state.ef * 1.1 + state.ef * 0.55;
    for (let h = 0; h < state.r; h++) {
      const c = state.b[s][h];
      // phase 增量(dt-based:60fps 时与原 f-step 等价)
      const basePhaseInc =
        (state.effectiveVp.phaseStep + Math.random() * state.effectiveVp.phaseJitter) *
        (state.cfg.flickerSpeed ?? FLICKER_SPEED_DEFAULT);
      if (state.userFuncs.phaseFunc) {
        state.__frameCtx.h = h;
        state.__frameCtx.s = s;
        state.__frameCtx.phase = c.phase;
        state.__frameCtx.L = c.bright;
        state.__frameCtx.ch = c.ch;
        state.__frameCtx.r = Math.random();
        c.phase += Number(state.userFuncs.phaseFunc(state.__frameCtx)) || 0;
      } else {
        c.phase += basePhaseInc * state.lastDt * 60;
      }
      const W =
        Math.sin(c.phase) * state.effectiveVp.sinWeightA +
        Math.sin((h + s) * 0.05 + fBase1) * state.effectiveVp.sinWeightB +
        Math.sin(h * 0.1 - s * 0.07 + fBase2) * state.effectiveVp.sinWeightC;
      // 亮度
      let l: number;
      if (state.userFuncs.brightnessCurve) {
        state.__frameCtx.h = h;
        state.__frameCtx.s = s;
        state.__frameCtx.phase = c.phase;
        state.__frameCtx.L = c.bright;
        state.__frameCtx.ch = c.ch;
        state.__frameCtx.r = Math.random();
        const u = Number(state.userFuncs.brightnessCurve(state.__frameCtx));
        l = Math.max(0, Math.min(1, isNaN(u) ? 0 : u));
      } else {
        l = Math.max(0, Math.min(1, (W + 1) * 0.5));
      }
      if (Math.random() < state.cfg.sparkProbability) l = 1;
      c.bright = l;

      // 目标位图覆盖(文字/图片)
      let skipCharset = false;
      if (state.targetBitmap && state.targetActive) {
        if (state.targetPhase === 'noise-converge') {
          const result = state.hooks.applyTargetBitmapPhase(c, h, s, l);
          if (result) {
            l = result.l;
            c.ch = result.ch;
            skipCharset = result.skipCharset;
          }
        } else {
          // 'fade' 模式:线性透明度淡入(向后兼容)
          let ox = 0,
            oy = 0;
          if (state.targetAnchor === 'center') {
            ox = (state.r - state.targetCols) >> 1;
            oy = (state.i - state.targetRows) >> 1;
          } else if (state.targetAnchor === 'topRight') {
            ox = state.r - state.targetCols;
            oy = 0;
          } else if (state.targetAnchor === 'bottomLeft') {
            ox = 0;
            oy = state.i - state.targetRows;
          } else if (state.targetAnchor === 'bottomRight') {
            ox = state.r - state.targetCols;
            oy = state.i - state.targetRows;
          }
          if (state.targetMotion === 'drift') {
            const period = (state.r + state.targetCols) / Math.max(0.1, state.targetMotionSpeed);
            const t = state.wallTime - state.targetStartTime;
            const phase = (t % period) / period;
            ox = Math.floor(ox + phase * (state.r + state.targetCols)) - state.targetCols;
          } else if (state.targetMotion === 'bounce') {
            const period =
              (2 * (state.r - state.targetCols)) / Math.max(0.1, state.targetMotionSpeed);
            const t = state.wallTime - state.targetStartTime;
            const phase = (t % period) / period;
            const d2 = phase < 0.5 ? phase * 2 : 2 - phase * 2;
            ox = Math.floor(d2 * (state.r - state.targetCols));
          } else if (state.targetMotion === 'float') {
            const t = state.wallTime - state.targetStartTime;
            oy = Math.floor(oy + Math.sin(t * state.targetMotionSpeed * 2) * 3);
          }
          const bx = h - ox;
          const by = s - oy;
          if (bx >= 0 && bx < state.targetCols && by >= 0 && by < state.targetRows) {
            const g = state.targetBitmap[by * state.targetCols + bx];
            if (g > 0) {
              const elapsed2 = state.wallTime - state.targetStartTime;
              let vis = 1;
              if (elapsed2 < state.targetFadeIn) vis = elapsed2 / state.targetFadeIn;
              else if (elapsed2 > state.targetFadeIn + state.targetHold)
                vis = Math.max(
                  0,
                  1 - (elapsed2 - state.targetFadeIn - state.targetHold) / state.targetFadeOut
                );
              if (elapsed2 > state.targetFadeIn + state.targetHold + state.targetFadeOut) {
                state.targetActive = false;
                state.targetBitmap = null;
                if (!state.targetFinishFired) {
                  state.targetFinishFired = true;
                  state.hooks.fireOnTargetFinish();
                }
              } else {
                const chaosFactor = (1 - vis) * state.targetChaos;
                l = Math.max(0, Math.min(1, l + g * 0.7 * vis));
                if (chaosFactor > 0 && Math.random() < chaosFactor) {
                  c.ch = Math.floor(Math.random() * state.charset.length);
                }
              }
            }
          }
        }
      }

      // 闪烁 / 字符更新(noise-converge 接管时跳过)
      if (!skipCharset) {
        let F: number;
        if (state.userFuncs.flickerCurve) {
          state.__frameCtx.h = h;
          state.__frameCtx.s = s;
          state.__frameCtx.phase = c.phase;
          state.__frameCtx.L = l;
          state.__frameCtx.ch = c.ch;
          state.__frameCtx.r = Math.random();
          F = Number(state.userFuncs.flickerCurve(state.__frameCtx)) || 0;
        } else {
          F =
            l >= 0.66
              ? state.flicker.high
              : l >= 0.33
                ? state.flicker.mid
                : l >= 0.05
                  ? state.flicker.low
                  : state.flicker.dark;
        }
        if (Math.random() < F) c.ch = Math.floor(Math.random() * state.charset.length);
        if (state.effectiveVp.chUpdateProb > 0 && Math.random() < state.effectiveVp.chUpdateProb)
          c.ch = Math.floor(Math.random() * state.charset.length);
        if (state.userFuncs.charsetFunc) {
          state.__frameCtx.h = h;
          state.__frameCtx.s = s;
          state.__frameCtx.phase = c.phase;
          state.__frameCtx.L = l;
          state.__frameCtx.ch = c.ch;
          state.__frameCtx.r = Math.random();
          const u = Number(state.userFuncs.charsetFunc(state.__frameCtx));
          if (!isNaN(u)) c.ch = Math.max(0, Math.min(state.charset.length - 1, Math.floor(u)));
        }
      }

      // 取光心(M, p)从 orchestrator 缓存 · 这里直接从 state 重新计算(便宜)
      const M =
        state.r * state.lightCenter.x +
        Math.cos(state.wallTime * state.driftSpeed.x * 60) * state.r * 0.2;
      const p =
        state.i * state.lightCenter.y +
        Math.sin(state.wallTime * state.driftSpeed.y * 60) * state.i * 0.2;

      drawInner(state, c, h, s, y, l, M, p, totalHue);
    }
  }
};

/**
 * Avalanche 变体:yPos 沿 row 方向下移 + headBright 距离衰减 + 简单 flicker
 * 行为 100% 等价于原 drawAvalanche · 走共享 drawInner 路径(走简化 colorOverride)
 */
export const drawAvalanche = (state: MatrixRainState): void => {
  const totalHue = state.dynamicHue + state.dynamicColorHue;
  state.__frameCtx.f = state.f;
  state.__frameCtx.t = state.wallTime;
  const yPosSpeed = state.effectiveVp.avalancheSpeed;
  state.hooks.updateTargetBitmapPhaseGlobal();

  const M =
    state.r * state.lightCenter.x +
    Math.cos(state.wallTime * state.driftSpeed.x * 60) * state.r * 0.2;
  const p =
    state.i * state.lightCenter.y +
    Math.sin(state.wallTime * state.driftSpeed.y * 60) * state.i * 0.2;

  for (let s = 0; s < state.i; s++) {
    for (let h = 0; h < state.r; h++) {
      const c = state.b[s][h];
      // yPos 移动(dt-based;60fps 等价)
      c.yPos! += c.speed! * yPosSpeed * state.lastDt * 60;
      if (c.yPos! > state.i) c.yPos = 0;

      const distFromHead = Math.abs(s - Math.floor(c.yPos!));
      let l = Math.max(
        0,
        Math.min(1, (c.headBright! - Math.pow(distFromHead, state.effectiveVp.headFalloff)) / 8)
      );
      c.bright = l;

      // 噪声→收敛模式
      let skipCharset = false;
      if (state.targetBitmap && state.targetActive && state.targetPhase === 'noise-converge') {
        const result = state.hooks.applyTargetBitmapPhase(c, h, s, l);
        if (result) {
          l = result.l;
          c.ch = result.ch;
          skipCharset = result.skipCharset;
        }
      }

      if (!skipCharset && Math.random() < state.effectiveVp.chUpdateProb)
        c.ch = Math.floor(Math.random() * state.charset.length);
      if (l < 0.02) continue;

      // 走共享 drawInner(warmth 阻尼 + colorOverride + 第三层 LUT 全在其中)
      const y = c.yPos! * state.ef * 1.1;
      drawInner(state, c, h, s, y, l, M, p, totalHue);
    }
  }
};

/**
 * Ripple 变体:简化 phase + sin(phase) * 0.5 + 简单 flicker
 * 行为 100% 等价于原 drawRipple · 走共享 drawInner 路径
 */
export const drawRipple = (state: MatrixRainState): void => {
  const totalHue = state.dynamicHue + state.dynamicColorHue;
  state.__frameCtx.f = state.f;
  state.__frameCtx.t = state.wallTime;
  state.hooks.updateTargetBitmapPhaseGlobal();

  const M =
    state.r * state.lightCenter.x +
    Math.cos(state.wallTime * state.driftSpeed.x * 60) * state.r * 0.2;
  const p =
    state.i * state.lightCenter.y +
    Math.sin(state.wallTime * state.driftSpeed.y * 60) * state.i * 0.2;

  for (let s = 0; s < state.i; s++) {
    const y = s * state.ef * 1.1 + state.ef * 0.55;
    for (let h = 0; h < state.r; h++) {
      const c = state.b[s][h];
      c.phase +=
        (state.effectiveVp.phaseStep + Math.random() * state.effectiveVp.phaseJitter) *
        (state.cfg.flickerSpeed ?? FLICKER_SPEED_DEFAULT) *
        state.lastDt *
        60;
      const W = Math.sin(c.phase) * state.effectiveVp.sinWeightA + 0.5;
      let l = Math.max(0, Math.min(1, W));
      c.bright = l;

      // 噪声→收敛模式
      let skipCharset = false;
      if (state.targetBitmap && state.targetActive && state.targetPhase === 'noise-converge') {
        const result = state.hooks.applyTargetBitmapPhase(c, h, s, l);
        if (result) {
          l = result.l;
          c.ch = result.ch;
          skipCharset = result.skipCharset;
        }
      }

      if (!skipCharset && Math.random() < state.effectiveVp.chUpdateProb)
        c.ch = Math.floor(Math.random() * state.charset.length);
      if (l < 0.02) continue;

      // 走共享 drawInner
      drawInner(state, c, h, s, y, l, M, p, totalHue);
    }
  }
};
