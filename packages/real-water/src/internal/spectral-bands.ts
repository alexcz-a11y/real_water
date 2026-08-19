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

export function evaluateSpectralSurface(
  x: number,
  z: number,
  phaseOffset: number,
  timeSeconds: number,
  bands: readonly PreparedSpectralBand[],
  crestSharpness: number,
  timeScale: number,
): Readonly<{
  readonly height: number;
  readonly slopeX: number;
  readonly slopeZ: number;
  readonly velocityY: number;
}> {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  let velocityY = 0;
  const secondHarmonic = crestSharpness * 0.25;

  for (const band of bands) {
    const phase =
      x * band.waveNumber * band.directionX +
      z * band.waveNumber * band.directionZ +
      phaseOffset -
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
