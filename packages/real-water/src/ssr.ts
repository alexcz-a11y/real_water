import {
  CURRENT_FRAME_SSR_POLICY,
  type QualityProfileReflectionSsr,
} from "./quality-profile.js";

/**
 * Package-private current-frame SSR confidence and minimum-error compose
 * policy. This is the CPU specification the GPU compose shader must match.
 * It is not a full water BRDF: transmission and the pre-SSR reflected
 * radiance are no longer separable after the beauty pass.
 *
 * Minimum-error overlay:
 *   candidateWeight = confidence * fresnel
 *   candidateMixed = mix(base, ssrRgb, candidateWeight)
 *   invalid (non-finite confidence, fresnel, or candidate RGB) selects base;
 *   it does not rely on a 0 multiply to kill NaN.
 *
 * History candidate:
 *   valid raw black hit uses current black (TemporalReproject treats black
 *   as miss); otherwise finite history RGB; non-finite history uses current.
 *
 * `screenU` / `screenV` are the reconstructed stock-hit UVs, not the
 * reflecting surface pixel.
 */

export const CURRENT_FRAME_SSR_WATER_MASK_EPSILON = 1e-4;
/** Matches r185 TSL EPSILON used by TemporalReproject black-as-miss. */
export const CURRENT_FRAME_SSR_BLACK_HIT_EPSILON = 1e-6;

export interface CurrentFrameSsrConfidenceInput {
  readonly worldDistance: number;
  readonly screenU: number;
  readonly screenV: number;
  readonly roughness: number;
  readonly fresnel: number;
  readonly hitFresnel?: number;
  readonly hitDepth?: number;
  readonly policy?: QualityProfileReflectionSsr;
  readonly waterMaskEpsilon?: number;
}

export interface CurrentFrameSsrComposeInput {
  readonly baseRgb: readonly [number, number, number];
  readonly ssrRgb: readonly [number, number, number];
  readonly confidence: number;
  readonly fresnel: number;
  readonly historyRgb?: readonly [number, number, number];
  readonly rawWorldDistance?: number;
}

export interface SsrHistoryCandidateInput {
  readonly currentRgb: readonly [number, number, number];
  readonly historyRgb: readonly [number, number, number];
  readonly rawWorldDistance: number;
}

export function evaluateCurrentFrameSsrConfidence(
  input: CurrentFrameSsrConfidenceInput,
): number {
  if (
    !Number.isFinite(input.worldDistance) ||
    !Number.isFinite(input.screenU) ||
    !Number.isFinite(input.screenV) ||
    !Number.isFinite(input.roughness) ||
    !Number.isFinite(input.fresnel) ||
    (input.hitFresnel !== undefined && !Number.isFinite(input.hitFresnel)) ||
    (input.hitDepth !== undefined && !Number.isFinite(input.hitDepth))
  ) {
    return 0;
  }
  const policy = input.policy ?? CURRENT_FRAME_SSR_POLICY;
  const waterMaskEpsilon =
    input.waterMaskEpsilon ?? CURRENT_FRAME_SSR_WATER_MASK_EPSILON;
  if (!(input.worldDistance > 0)) {
    return 0;
  }
  if (input.worldDistance > policy.maxDistance) {
    return 0;
  }
  if (
    input.screenU < 0 ||
    input.screenU > 1 ||
    input.screenV < 0 ||
    input.screenV > 1
  ) {
    return 0;
  }
  if (input.roughness >= policy.roughnessCutoff) {
    return 0;
  }
  if (!(input.fresnel > waterMaskEpsilon)) {
    return 0;
  }
  if (input.hitFresnel !== undefined && input.hitFresnel > waterMaskEpsilon) {
    return 0;
  }
  if (input.hitDepth !== undefined && input.hitDepth >= 1) {
    return 0;
  }
  const distanceFactor = 1 - input.worldDistance / policy.maxDistance;
  const edgeDist = Math.min(
    input.screenU,
    1 - input.screenU,
    input.screenV,
    1 - input.screenV,
  );
  const edgeFactor =
    policy.screenEdgeFade <= 0
      ? 1
      : Math.min(1, Math.max(0, edgeDist / policy.screenEdgeFade));
  const confidence = distanceFactor * edgeFactor;
  if (!Number.isFinite(confidence)) {
    return 0;
  }
  return Math.min(1, Math.max(0, confidence));
}

export function unpackPackedViewNormalRgb(
  packedRgb: readonly [number, number, number],
): readonly [number, number, number] {
  return [packedRgb[0] * 2 - 1, packedRgb[1] * 2 - 1, packedRgb[2] * 2 - 1];
}

export function selectSsrHistoryCandidateRgb(
  input: SsrHistoryCandidateInput,
): readonly [number, number, number] {
  const currentLength = Math.hypot(
    input.currentRgb[0],
    input.currentRgb[1],
    input.currentRgb[2],
  );
  const currentBlack =
    Number.isFinite(currentLength) &&
    currentLength < CURRENT_FRAME_SSR_BLACK_HIT_EPSILON;
  const rawHit =
    Number.isFinite(input.rawWorldDistance) && input.rawWorldDistance > 0;
  if (rawHit && currentBlack) {
    return [input.currentRgb[0], input.currentRgb[1], input.currentRgb[2]];
  }
  const historyFinite =
    Number.isFinite(input.historyRgb[0]) &&
    Number.isFinite(input.historyRgb[1]) &&
    Number.isFinite(input.historyRgb[2]);
  if (historyFinite) {
    return [input.historyRgb[0], input.historyRgb[1], input.historyRgb[2]];
  }
  return [input.currentRgb[0], input.currentRgb[1], input.currentRgb[2]];
}

export function composeCurrentFrameSsrRgb(
  input: CurrentFrameSsrComposeInput,
): readonly [number, number, number] {
  const ssrRgb =
    input.historyRgb === undefined || input.rawWorldDistance === undefined
      ? input.ssrRgb
      : selectSsrHistoryCandidateRgb({
          currentRgb: input.ssrRgb,
          historyRgb: input.historyRgb,
          rawWorldDistance: input.rawWorldDistance,
        });
  const candidateWeight = input.confidence * input.fresnel;
  const candidateMixed = [
    input.baseRgb[0] * (1 - candidateWeight) + ssrRgb[0] * candidateWeight,
    input.baseRgb[1] * (1 - candidateWeight) + ssrRgb[1] * candidateWeight,
    input.baseRgb[2] * (1 - candidateWeight) + ssrRgb[2] * candidateWeight,
  ] as const;
  const valid =
    Number.isFinite(input.confidence) &&
    Number.isFinite(input.fresnel) &&
    Number.isFinite(ssrRgb[0]) &&
    Number.isFinite(ssrRgb[1]) &&
    Number.isFinite(ssrRgb[2]);
  if (!valid) {
    return [input.baseRgb[0], input.baseRgb[1], input.baseRgb[2]];
  }
  return candidateMixed;
}
