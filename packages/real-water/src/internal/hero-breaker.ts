export const HERO_BREAKER_FIXED_TICKS_PER_SECOND = 60;
export const HERO_BREAKER_INITIAL_CREST_CENTER_RADII = -0.2;
export const HERO_BREAKER_FORWARD_TRAVEL_RADII = 0.75;
export const HERO_BREAKER_BACK_WIDTH_RADII = 0.72;
export const HERO_BREAKER_FRONT_WIDTH_RADII = 0.26;
export const HERO_BREAKER_FORWARD_HOLLOW_CENTER_RADII = 0.38;
export const HERO_BREAKER_FORWARD_HOLLOW_WIDTH_RADII = 0.24;
export const HERO_BREAKER_FORWARD_HOLLOW_DEPTH = 0.42;
export const HERO_BREAKER_LATERAL_WIDTH_RADII = 0.7;
export const HERO_BREAKER_ATTACK_FRACTION = 0.18;
export const HERO_BREAKER_RELEASE_START_FRACTION = 0.68;
export const HERO_BREAKER_FORWARD_CURL_STRENGTH = 0.35;

export interface HeroBreakerShapeInput {
  readonly alongMetres: number;
  readonly lateralMetres: number;
  readonly radiusMetres: number;
  readonly amplitudeMetres: number;
  readonly ageTicks: number;
  readonly lifetimeTicks: number;
  readonly foamAmount: number;
}

export interface HeroBreakerShapeSample {
  readonly height: number;
  readonly slopeAlong: number;
  readonly slopeLateral: number;
  readonly velocityY: number;
  readonly foam: number;
  readonly forwardCurl: number;
}

const ZERO_HERO_BREAKER_SAMPLE: HeroBreakerShapeSample = Object.freeze({
  height: 0,
  slopeAlong: 0,
  slopeLateral: 0,
  velocityY: 0,
  foam: 0,
  forwardCurl: 0,
});

/**
 * Evaluates the one authored asymmetric Hero Breaker profile shared by the
 * CPU Gameplay Query reconstruction and prepared rendering routes.
 */
export function evaluateHeroBreakerShape(
  input: HeroBreakerShapeInput,
): HeroBreakerShapeSample {
  if (
    input.radiusMetres <= 0 ||
    input.lifetimeTicks <= 0 ||
    input.ageTicks < 0 ||
    input.ageTicks >= input.lifetimeTicks
  ) {
    return ZERO_HERO_BREAKER_SAMPLE;
  }

  const progress = input.ageTicks / input.lifetimeTicks;
  const envelope = evaluateLifetimeEnvelope(progress);
  const lateralWidth = input.radiusMetres * HERO_BREAKER_LATERAL_WIDTH_RADII;
  const lateralT = Math.abs(input.lateralMetres) / lateralWidth;
  if (lateralT >= 1) {
    return ZERO_HERO_BREAKER_SAMPLE;
  }
  const lateralWindow = 1 - smoothHermite(lateralT);
  const lateralDerivative =
    ((-6 * lateralT * (1 - lateralT)) / lateralWidth) *
    (input.lateralMetres < 0 ? -1 : 1);

  const crestCenter =
    HERO_BREAKER_INITIAL_CREST_CENTER_RADII +
    progress * HERO_BREAKER_FORWARD_TRAVEL_RADII;
  const localAlong = input.alongMetres / input.radiusMetres - crestCenter;
  const crestWidth =
    localAlong < 0
      ? HERO_BREAKER_BACK_WIDTH_RADII
      : HERO_BREAKER_FRONT_WIDTH_RADII;
  const crest = gaussian(localAlong, crestWidth);
  const crestDerivative = gaussianDerivative(localAlong, crestWidth, crest);
  const hollowAlong = localAlong - HERO_BREAKER_FORWARD_HOLLOW_CENTER_RADII;
  const forwardHollow = gaussian(
    hollowAlong,
    HERO_BREAKER_FORWARD_HOLLOW_WIDTH_RADII,
  );
  const forwardHollowDerivative = gaussianDerivative(
    hollowAlong,
    HERO_BREAKER_FORWARD_HOLLOW_WIDTH_RADII,
    forwardHollow,
  );
  const shape = crest - HERO_BREAKER_FORWARD_HOLLOW_DEPTH * forwardHollow;
  const shapeDerivative =
    crestDerivative -
    HERO_BREAKER_FORWARD_HOLLOW_DEPTH * forwardHollowDerivative;
  const amplitudeEnvelope = input.amplitudeMetres * envelope.value;
  const height = amplitudeEnvelope * lateralWindow * shape;
  const progressDerivative =
    input.amplitudeMetres *
    lateralWindow *
    (envelope.derivative * shape -
      envelope.value * shapeDerivative * HERO_BREAKER_FORWARD_TRAVEL_RADII);

  return {
    height,
    slopeAlong:
      (amplitudeEnvelope * lateralWindow * shapeDerivative) /
      input.radiusMetres,
    slopeLateral: amplitudeEnvelope * lateralDerivative * shape,
    velocityY:
      progressDerivative *
      (HERO_BREAKER_FIXED_TICKS_PER_SECOND / input.lifetimeTicks),
    foam:
      clampUnit(input.foamAmount) *
      Math.sqrt(envelope.value) *
      lateralWindow *
      clampUnit(0.72 * crest + 0.58 * forwardHollow),
    forwardCurl:
      input.amplitudeMetres *
      HERO_BREAKER_FORWARD_CURL_STRENGTH *
      envelope.value *
      lateralWindow *
      forwardHollow,
  };
}

function evaluateLifetimeEnvelope(
  progress: number,
): Readonly<{ value: number; derivative: number }> {
  const attackT = Math.min(1, progress / HERO_BREAKER_ATTACK_FRACTION);
  const attack = smoothHermite(attackT);
  const attackDerivative =
    attackT < 1
      ? (6 * attackT * (1 - attackT)) / HERO_BREAKER_ATTACK_FRACTION
      : 0;
  if (progress <= HERO_BREAKER_RELEASE_START_FRACTION) {
    return { value: attack, derivative: attackDerivative };
  }
  const releaseDuration = 1 - HERO_BREAKER_RELEASE_START_FRACTION;
  const releaseT =
    (progress - HERO_BREAKER_RELEASE_START_FRACTION) / releaseDuration;
  const release = 1 - smoothHermite(releaseT);
  const releaseDerivative = (-6 * releaseT * (1 - releaseT)) / releaseDuration;
  return {
    value: attack * release,
    derivative: attackDerivative * release + attack * releaseDerivative,
  };
}

function gaussian(value: number, width: number): number {
  const normalized = value / width;
  return Math.exp(-0.5 * normalized * normalized);
}

function gaussianDerivative(
  value: number,
  width: number,
  gaussianValue: number,
): number {
  return (-value * gaussianValue) / (width * width);
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothHermite(value: number): number {
  return value * value * (3 - 2 * value);
}
