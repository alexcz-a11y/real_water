import type {
  ArtisticControls,
  GameplayQueryBatch,
  HostSimulationState,
} from "../runtime.js";

export const SPECTRAL_BAND_COUNT = 4 as const;

export type SpectralBandId = "swell" | "wind" | "chop" | "ripple";

export interface SpectralBandDefinition {
  readonly id: SpectralBandId;
  readonly amplitudeMetres: number;
  readonly wavelengthMetres: number;
  readonly periodSeconds: number;
  readonly baseDirectionRadians: number;
}

export const SPECTRAL_BANDS: readonly SpectralBandDefinition[] = Object.freeze([
  Object.freeze({
    id: "swell",
    amplitudeMetres: 0.5,
    wavelengthMetres: 32,
    periodSeconds: 8,
    baseDirectionRadians: 0,
  }),
  Object.freeze({
    id: "wind",
    amplitudeMetres: 0.25,
    wavelengthMetres: 16,
    periodSeconds: 6,
    baseDirectionRadians: Math.PI / 2,
  }),
  Object.freeze({
    id: "chop",
    amplitudeMetres: 0.75,
    wavelengthMetres: 8,
    periodSeconds: 4,
    baseDirectionRadians: 0,
  }),
  Object.freeze({
    id: "ripple",
    amplitudeMetres: 0.125,
    wavelengthMetres: 4,
    periodSeconds: 2,
    baseDirectionRadians: Math.PI / 2,
  }),
]);

export interface PreparedSpectralBand {
  readonly amplitude: number;
  readonly waveNumber: number;
  readonly angularFrequency: number;
  readonly directionX: number;
  readonly directionZ: number;
}

export function spectralBandPhaseOffset(seed: number): number {
  return (seed / 0x1_0000_0000) * Math.PI * 2;
}

export function prepareSpectralBands(
  controls: ArtisticControls,
): readonly PreparedSpectralBand[] {
  const swellDirection = SPECTRAL_BANDS[0]?.baseDirectionRadians ?? 0;
  return SPECTRAL_BANDS.map((band) => {
    const direction =
      swellDirection +
      (band.baseDirectionRadians - swellDirection) *
        (1 - controls.directionality);
    return Object.freeze({
      amplitude: band.amplitudeMetres * bandScale(band.id, controls),
      waveNumber: (Math.PI * 2) / band.wavelengthMetres,
      angularFrequency: (Math.PI * 2) / band.periodSeconds,
      directionX: Math.cos(direction),
      directionZ: Math.sin(direction),
    });
  });
}

export const NON_PERIODIC_ROTATION_COS = 0.5;
export const NON_PERIODIC_ROTATION_SIN = Math.sqrt(3) / 2;
export const NON_PERIODIC_OFFSET_X = 137;
export const NON_PERIODIC_OFFSET_Z = 271;
export const NON_PERIODIC_BLEND_K1 = 0.073;
export const NON_PERIODIC_BLEND_K2 = 0.051;
export const BAND_GEOMETRY_FADE_START_FACTOR = 6;
export const BAND_GEOMETRY_FADE_END_FACTOR = 18;
export const SLOPE_DETAIL_FADE_START_METRES = 140;
export const SLOPE_DETAIL_FADE_END_METRES = 320;
export const FAR_WHITE_PRIMARY_X = 0.018;
export const FAR_WHITE_PRIMARY_Z = 0.011;
export const FAR_WHITE_SECONDARY_X = 0.007;
export const FAR_WHITE_SECONDARY_Z = 0.016;
const TAU = Math.PI * 2;

export function wrapPhase(radians: number): number {
  return radians - TAU * Math.round(radians / TAU);
}

export function originSamplePhase(
  originX: number,
  originZ: number,
  coefficientX: number,
  coefficientZ: number,
): number {
  return wrapPhase(originX * coefficientX + originZ * coefficientZ);
}

export function rotateOrigin(
  originX: number,
  originZ: number,
): Readonly<{ readonly x: number; readonly z: number }> {
  return {
    x:
      NON_PERIODIC_ROTATION_COS * originX - NON_PERIODIC_ROTATION_SIN * originZ,
    z:
      NON_PERIODIC_ROTATION_SIN * originX + NON_PERIODIC_ROTATION_COS * originZ,
  };
}

export interface SpectralSurfaceSample {
  readonly height: number;
  readonly slopeX: number;
  readonly slopeZ: number;
  readonly velocityY: number;
}

export function nonPeriodicBlend(
  x: number,
  z: number,
  phaseOffset: number,
  originX = 0,
  originZ = 0,
): Readonly<{
  readonly weight: number;
  readonly dWeightDx: number;
  readonly dWeightDz: number;
}> {
  const argumentA =
    x * NON_PERIODIC_BLEND_K1 +
    z * NON_PERIODIC_BLEND_K2 +
    phaseOffset +
    originSamplePhase(
      originX,
      originZ,
      NON_PERIODIC_BLEND_K1,
      NON_PERIODIC_BLEND_K2,
    );
  const argumentB =
    x * NON_PERIODIC_BLEND_K2 -
    z * NON_PERIODIC_BLEND_K1 * 0.7 +
    phaseOffset * 1.3 +
    originSamplePhase(
      originX,
      originZ,
      NON_PERIODIC_BLEND_K2,
      -NON_PERIODIC_BLEND_K1 * 0.7,
    );
  const sineA = Math.sin(argumentA);
  const sineB = Math.sin(argumentB);
  const cosineA = Math.cos(argumentA);
  const cosineB = Math.cos(argumentB);
  const field = sineA * sineB;
  const dFieldDx =
    cosineA * NON_PERIODIC_BLEND_K1 * sineB +
    sineA * cosineB * NON_PERIODIC_BLEND_K2;
  const dFieldDz =
    cosineA * NON_PERIODIC_BLEND_K2 * sineB +
    sineA * cosineB * (-NON_PERIODIC_BLEND_K1 * 0.7);
  const unit = field * 0.5 + 0.5;
  const hermiteT = Math.min(1, Math.max(0, (unit - 0.2) / 0.6));
  return {
    weight: hermiteT * hermiteT * (3 - 2 * hermiteT),
    dWeightDx: 5 * hermiteT * (1 - hermiteT) * dFieldDx,
    dWeightDz: 5 * hermiteT * (1 - hermiteT) * dFieldDz,
  };
}

export function rotateNonPeriodicDomain(
  x: number,
  z: number,
): Readonly<{ readonly x: number; readonly z: number }> {
  return {
    x:
      NON_PERIODIC_ROTATION_COS * x -
      NON_PERIODIC_ROTATION_SIN * z +
      NON_PERIODIC_OFFSET_X,
    z:
      NON_PERIODIC_ROTATION_SIN * x +
      NON_PERIODIC_ROTATION_COS * z +
      NON_PERIODIC_OFFSET_Z,
  };
}

export function evaluateSpectralSurface(
  x: number,
  z: number,
  originX: number,
  originZ: number,
  phaseOffset: number,
  timeSeconds: number,
  bands: readonly PreparedSpectralBand[],
  crestSharpness: number,
  timeScale: number,
): SpectralSurfaceSample {
  const rotatedOrigin = rotateOrigin(originX, originZ);
  const primary = evaluatePeriodicSurface(
    x,
    z,
    originX,
    originZ,
    phaseOffset,
    timeSeconds,
    bands,
    crestSharpness,
    timeScale,
  );
  const rotated = rotateNonPeriodicDomain(x, z);
  const secondary = evaluatePeriodicSurface(
    rotated.x,
    rotated.z,
    rotatedOrigin.x,
    rotatedOrigin.z,
    phaseOffset,
    timeSeconds,
    bands,
    crestSharpness,
    timeScale,
  );
  const secondaryWorld = worldSlopesFromRotatedDomain(secondary);
  const blend = nonPeriodicBlend(x, z, phaseOffset, originX, originZ);
  return mixSurfaceSamples(primary, secondaryWorld, blend);
}

function evaluatePeriodicSurface(
  x: number,
  z: number,
  originX: number,
  originZ: number,
  phaseOffset: number,
  timeSeconds: number,
  bands: readonly PreparedSpectralBand[],
  crestSharpness: number,
  timeScale: number,
): SpectralSurfaceSample {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  let velocityY = 0;
  const secondHarmonic = crestSharpness * 0.25;

  for (const band of bands) {
    const phase =
      x * band.waveNumber * band.directionX +
      z * band.waveNumber * band.directionZ +
      phaseOffset +
      originSamplePhase(
        originX,
        originZ,
        band.waveNumber * band.directionX,
        band.waveNumber * band.directionZ,
      ) -
      timeSeconds * band.angularFrequency * timeScale;
    const sine = Math.sin(phase);
    const cosine = Math.cos(phase);
    const wave = sine - secondHarmonic * Math.sin(phase * 2);
    const derivative = cosine - 2 * secondHarmonic * Math.cos(phase * 2);
    height += band.amplitude * wave;
    slopeX += band.amplitude * derivative * band.waveNumber * band.directionX;
    slopeZ += band.amplitude * derivative * band.waveNumber * band.directionZ;
    velocityY +=
      band.amplitude * derivative * (-band.angularFrequency * timeScale);
  }

  return { height, slopeX, slopeZ, velocityY };
}

function worldSlopesFromRotatedDomain(
  sample: SpectralSurfaceSample,
): SpectralSurfaceSample {
  return {
    height: sample.height,
    slopeX:
      sample.slopeX * NON_PERIODIC_ROTATION_COS +
      sample.slopeZ * NON_PERIODIC_ROTATION_SIN,
    slopeZ:
      -sample.slopeX * NON_PERIODIC_ROTATION_SIN +
      sample.slopeZ * NON_PERIODIC_ROTATION_COS,
    velocityY: sample.velocityY,
  };
}

function mixSurfaceSamples(
  primary: SpectralSurfaceSample,
  secondary: SpectralSurfaceSample,
  blend: Readonly<{
    readonly weight: number;
    readonly dWeightDx: number;
    readonly dWeightDz: number;
  }>,
): SpectralSurfaceSample {
  const inverse = 1 - blend.weight;
  const heightDelta = secondary.height - primary.height;
  return {
    height: primary.height * inverse + secondary.height * blend.weight,
    slopeX:
      primary.slopeX * inverse +
      secondary.slopeX * blend.weight +
      heightDelta * blend.dWeightDx,
    slopeZ:
      primary.slopeZ * inverse +
      secondary.slopeZ * blend.weight +
      heightDelta * blend.dWeightDz,
    velocityY: primary.velocityY * inverse + secondary.velocityY * blend.weight,
  };
}

export function writeSpectralBandQueries(
  batch: GameplayQueryBatch,
  state: HostSimulationState,
  artisticControls: ArtisticControls,
): void {
  const bands = prepareSpectralBands(artisticControls);
  const phaseOffset = spectralBandPhaseOffset(state.seed);

  for (let point = 0; point < batch.count; point += 1) {
    const vectorIndex = point * 3;
    const x = batch.positions[vectorIndex] ?? 0;
    const z = batch.positions[vectorIndex + 2] ?? 0;
    const surface = evaluateSpectralSurface(
      x,
      z,
      state.originX,
      state.originZ,
      phaseOffset,
      state.timeSeconds,
      bands,
      artisticControls.crestSharpness,
      artisticControls.timeScale,
    );
    const inverseNormalLength =
      1 / Math.hypot(surface.slopeX, 1, surface.slopeZ);

    batch.results.heights[point] = surface.height;
    batch.results.normals[vectorIndex] = -surface.slopeX * inverseNormalLength;
    batch.results.normals[vectorIndex + 1] = inverseNormalLength;
    batch.results.normals[vectorIndex + 2] =
      -surface.slopeZ * inverseNormalLength;
    batch.results.velocities[vectorIndex] = 0;
    batch.results.velocities[vectorIndex + 1] = surface.velocityY;
    batch.results.velocities[vectorIndex + 2] = 0;
    batch.results.foam[point] = 0;
  }
}

function bandScale(id: SpectralBandId, controls: ArtisticControls): number {
  const overall = controls.waveStrength;
  switch (id) {
    case "swell":
      return overall * controls.swellDrama;
    case "wind":
      return (
        overall * (controls.choppiness * 0.65 + controls.swellDrama * 0.35)
      );
    case "chop":
      return overall * controls.choppiness;
    case "ripple":
      return overall * controls.microDetail;
  }
}
