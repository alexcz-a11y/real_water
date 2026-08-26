import type { HostEnvironmentSnapshot } from "./environment.js";

const TAU = Math.PI * 2;
export const STORM_FRONT_RAIN_HEIGHT_AMPLITUDE_METRES = 0.012;
export const STORM_FRONT_RAIN_TEMPORAL_RADIANS_PER_TICK = 0.37;
export const STORM_FRONT_RAIN_PRIMARY_X = 11.73;
export const STORM_FRONT_RAIN_PRIMARY_Z = 4.91;
export const STORM_FRONT_RAIN_SECONDARY_X = -6.13;
export const STORM_FRONT_RAIN_SECONDARY_Z = 13.19;
export const STORM_FRONT_RAIN_SECONDARY_PHASE_SCALE = 1.17;
export const STORM_FRONT_RAIN_PRIMARY_WEIGHT = 0.62;
export const STORM_FRONT_RAIN_SECONDARY_WEIGHT = 0.38;

export interface StormFrontAtmosphereResponse {
  readonly horizonHaze: number;
  readonly stormAerosol: number;
  readonly cloudShadow: number;
  readonly lightning: number;
}

export interface StormFrontFrame {
  readonly seed: number;
  readonly tick: number;
  readonly inputRevision: number;
  readonly spatialPhase: number;
  readonly rainRippleStrength: number;
  readonly rainSprayStrength: number;
  readonly stormAerosolStrength: number;
  readonly cloudShadowStrength: number;
  readonly lightningStrength: number;
  readonly glintIllumination: number;
  readonly foamIllumination: number;
  readonly reflectionIllumination: number;
  readonly atmosphere: StormFrontAtmosphereResponse;
}

export interface StormFrontRainCorrection {
  readonly height: number;
  readonly slopeX: number;
  readonly slopeZ: number;
}

export interface StormFrontRuntimeState {
  readonly seed: number;
  readonly tick: number;
  readonly simulationResetRevision: number;
}

export interface StormFrontFramePair {
  readonly current: StormFrontFrame;
  readonly previous: StormFrontFrame;
}

export interface StormFrontController {
  synchronize(state: StormFrontRuntimeState): StormFrontFramePair;
  inspect(): StormFrontFramePair | null;
}

/** Keeps one coherent current/previous weather pair across fixed ticks. */
export function createStormFrontController(
  readEnvironment: () => HostEnvironmentSnapshot,
): StormFrontController {
  let committedState: StormFrontRuntimeState | null = null;
  let committedPair: StormFrontFramePair | null = null;
  return Object.freeze({
    synchronize(state: StormFrontRuntimeState): StormFrontFramePair {
      const current = evaluateStormFrontFrame(
        state.seed,
        state.tick,
        readEnvironment(),
      );
      const reset =
        committedState === null ||
        committedState.seed !== state.seed ||
        committedState.simulationResetRevision !==
          state.simulationResetRevision ||
        state.tick < committedState.tick;
      const sameTick =
        !reset && committedState !== null && state.tick === committedState.tick;
      if (
        sameTick &&
        committedPair !== null &&
        current.inputRevision === committedPair.current.inputRevision
      ) {
        return committedPair;
      }
      const previous =
        reset || committedPair === null
          ? current
          : sameTick
            ? committedPair.previous
            : committedPair.current;
      committedState = Object.freeze({ ...state });
      committedPair = Object.freeze({ current, previous });
      return committedPair;
    },
    inspect(): StormFrontFramePair | null {
      return committedPair;
    },
  });
}

/** Evaluates one allocation-free, fixed-tick Storm Front control frame. */
export function evaluateStormFrontFrame(
  seed: number,
  tick: number,
  environment: HostEnvironmentSnapshot,
): StormFrontFrame {
  assertUnsigned32(seed, "Storm Front seed");
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError(
      "Storm Front ticks must be non-negative safe integers.",
    );
  }
  const weather = environment.weather;
  const atmosphere = environment.atmosphere;
  const rainRippleStrength = clampUnit(weather.rainIntensity);
  const rainSprayStrength =
    rainRippleStrength *
    clampUnit(0.55 + weather.windStrength * 0.15 + weather.gustStrength * 0.1);
  const stormAerosolStrength = clampUnit(atmosphere.stormAerosolIntensity);
  const cloudShadowStrength =
    clampUnit(atmosphere.cloudCoverage) *
    clampUnit(atmosphere.cloudShadowStrength);
  const lightningStrength = clampUnit(atmosphere.lightningIntensity);
  const spatialPhase = unitFloat(mix32(seed ^ 0x91e1_0da5));
  const inputRevision = hashEnvironmentInput(seed, tick, environment);

  return Object.freeze({
    seed,
    tick,
    inputRevision,
    spatialPhase,
    rainRippleStrength,
    rainSprayStrength,
    stormAerosolStrength,
    cloudShadowStrength,
    lightningStrength,
    glintIllumination: clamp(
      1 - cloudShadowStrength * 0.75 + lightningStrength * 1.25,
      0,
      2,
    ),
    foamIllumination: clamp(
      1 - cloudShadowStrength * 0.45 + lightningStrength * 0.9,
      0,
      2,
    ),
    reflectionIllumination: clamp(
      1 - cloudShadowStrength * 0.6 + lightningStrength * 1.1,
      0,
      2,
    ),
    atmosphere: Object.freeze({
      horizonHaze: clampUnit(atmosphere.horizonHaze),
      stormAerosol: stormAerosolStrength,
      cloudShadow: cloudShadowStrength,
      lightning: lightningStrength,
    }),
  });
}

/** Returns the additive rain-only correction applied to the prepared ocean. */
export function evaluateStormFrontRainCorrection(
  hostX: number,
  hostZ: number,
  frame: StormFrontFrame,
): StormFrontRainCorrection {
  if (!Number.isFinite(hostX) || !Number.isFinite(hostZ)) {
    throw new RangeError("Storm Front rain samples require finite XZ values.");
  }
  const amplitude =
    STORM_FRONT_RAIN_HEIGHT_AMPLITUDE_METRES * frame.rainRippleStrength;
  if (amplitude === 0) {
    return Object.freeze({ height: 0, slopeX: 0, slopeZ: 0 });
  }
  const phase =
    frame.spatialPhase * TAU +
    frame.tick * STORM_FRONT_RAIN_TEMPORAL_RADIANS_PER_TICK;
  const argumentA =
    hostX * STORM_FRONT_RAIN_PRIMARY_X +
    hostZ * STORM_FRONT_RAIN_PRIMARY_Z +
    phase;
  const argumentB =
    hostX * STORM_FRONT_RAIN_SECONDARY_X +
    hostZ * STORM_FRONT_RAIN_SECONDARY_Z -
    phase * STORM_FRONT_RAIN_SECONDARY_PHASE_SCALE;
  return Object.freeze({
    height:
      amplitude *
      (Math.sin(argumentA) * STORM_FRONT_RAIN_PRIMARY_WEIGHT +
        Math.sin(argumentB) * STORM_FRONT_RAIN_SECONDARY_WEIGHT),
    slopeX:
      amplitude *
      (Math.cos(argumentA) *
        STORM_FRONT_RAIN_PRIMARY_WEIGHT *
        STORM_FRONT_RAIN_PRIMARY_X +
        Math.cos(argumentB) *
          STORM_FRONT_RAIN_SECONDARY_WEIGHT *
          STORM_FRONT_RAIN_SECONDARY_X),
    slopeZ:
      amplitude *
      (Math.cos(argumentA) *
        STORM_FRONT_RAIN_PRIMARY_WEIGHT *
        STORM_FRONT_RAIN_PRIMARY_Z +
        Math.cos(argumentB) *
          STORM_FRONT_RAIN_SECONDARY_WEIGHT *
          STORM_FRONT_RAIN_SECONDARY_Z),
  });
}

function hashEnvironmentInput(
  seed: number,
  tick: number,
  environment: HostEnvironmentSnapshot,
): number {
  let hash = mix32(seed ^ (tick >>> 0) ^ Math.floor(tick / 0x1_0000_0000));
  const values = [
    ...Object.values(environment.lighting),
    ...Object.values(environment.weather),
    ...Object.values(environment.atmosphere),
  ];
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  for (const value of values) {
    view.setFloat64(0, value, true);
    hash = mix32(hash ^ view.getUint32(0, true));
    hash = mix32(hash ^ view.getUint32(4, true));
  }
  return hash;
}

function assertUnsigned32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer.`);
  }
}

function mix32(input: number): number {
  let value = input >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function unitFloat(value: number): number {
  return value / 0x1_0000_0000;
}

function clampUnit(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
