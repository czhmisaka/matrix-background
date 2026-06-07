/**
 * @xietuier/matrix-rain · 变体默认参数表
 * 4 种内置变体的初始参数。用户可通过 matrixRain({ variantParams: {...} }) 覆盖。
 */

import type { VariantName, VariantParams } from '../types';

export const VARIANT_DEFAULTS: Record<VariantName, VariantParams> = {
  classic:   { phaseStep: 0.04, phaseJitter: 0.06, sinWeightA: 0.4, sinWeightB: 0.3, sinWeightC: 0.3, brightCurve: 3.5, chUpdateProb: 0,   headBright: 8, headFalloff: 1, avalancheSpeed: 0.5 },
  ascii:     { phaseStep: 0.04, phaseJitter: 0.06, sinWeightA: 0.4, sinWeightB: 0.3, sinWeightC: 0.3, brightCurve: 3.5, chUpdateProb: 0,   headBright: 8, headFalloff: 1, avalancheSpeed: 0.5 },
  avalanche: { phaseStep: 0.04, phaseJitter: 0.06, sinWeightA: 0.4, sinWeightB: 0.3, sinWeightC: 0.3, brightCurve: 3.5, chUpdateProb: 0.3, headBright: 8, headFalloff: 1, avalancheSpeed: 0.5 },
  ripple:    { phaseStep: 0.05, phaseJitter: 0,    sinWeightA: 0.5, sinWeightB: 0,   sinWeightC: 0,   brightCurve: 8,   chUpdateProb: 0.2, headBright: 8, headFalloff: 1, avalancheSpeed: 0.5 }
};
