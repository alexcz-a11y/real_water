import type {
  ArtisticControls,
  GameplayQueryBatch,
  HostSimulationState,
} from "../runtime.js";

export const SINGLE_BAND_AMPLITUDE_METRES = 0.75;
export const SINGLE_BAND_WAVE_NUMBER = Math.PI / 4;
export const SINGLE_BAND_ANGULAR_FREQUENCY = Math.PI / 2;

export function singleSpectralBandPhaseOffset(seed: number): number {
  return (seed / 0x1_0000_0000) * Math.PI * 2;
}

export function writeSingleSpectralBandQueries(
  batch: GameplayQueryBatch,
  state: HostSimulationState,
  artisticControls: ArtisticControls,
): void {
  const amplitude =
    SINGLE_BAND_AMPLITUDE_METRES * artisticControls.waveStrength;
  const phaseOffset = singleSpectralBandPhaseOffset(state.seed);
  const phaseTime = state.timeSeconds * SINGLE_BAND_ANGULAR_FREQUENCY;

  for (let point = 0; point < batch.count; point += 1) {
    const vectorIndex = point * 3;
    const x = batch.positions[vectorIndex] ?? 0;
    const phase = x * SINGLE_BAND_WAVE_NUMBER + phaseOffset - phaseTime;
    const sine = Math.sin(phase);
    const cosine = Math.cos(phase);
    const slope = amplitude * SINGLE_BAND_WAVE_NUMBER * cosine;
    const inverseNormalLength = 1 / Math.hypot(slope, 1);

    batch.results.heights[point] = amplitude * sine;
    batch.results.normals[vectorIndex] = -slope * inverseNormalLength;
    batch.results.normals[vectorIndex + 1] = inverseNormalLength;
    batch.results.normals[vectorIndex + 2] = 0;
    batch.results.velocities[vectorIndex] = 0;
    batch.results.velocities[vectorIndex + 1] =
      -amplitude * SINGLE_BAND_ANGULAR_FREQUENCY * cosine;
    batch.results.velocities[vectorIndex + 2] = 0;
    batch.results.foam[point] = 0;
  }
}
