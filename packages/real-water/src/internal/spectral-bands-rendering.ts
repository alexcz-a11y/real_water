import {
  cos,
  highpModelNormalViewMatrix,
  positionGeometry,
  sin,
  uniform,
  vec3,
} from "three/tsl";
import type {
  ArtisticControls,
  HostSimulationAdapter,
  OpenWaterRuntimeSnapshot,
  RuntimeStateSink,
} from "../runtime.js";
import { readHostSimulationState } from "../runtime.js";
import {
  SPECTRAL_BANDS,
  prepareSpectralBands,
  spectralBandPhaseOffset,
} from "./spectral-bands.js";
import { createWaterPreset } from "../water-preset.js";

const INITIAL_ARTISTIC_CONTROLS: ArtisticControls =
  createWaterPreset("swell").artisticControls;

export function createSpectralBandRendering(simulation: HostSimulationAdapter) {
  const originX = uniform(0);
  const originZ = uniform(0);
  const phaseOffset = uniform(0);
  const timeSeconds = uniform(0);
  const timeScale = uniform(1);
  const crestSharpness = uniform(0);
  // positionLocal includes this offset after positionNode assignment, so
  // fragment re-evaluation of the spectral field must use the geometry
  // attribute or origin is applied twice and the slope sign flips.
  const worldX = positionGeometry.x.add(originX);
  const worldZ = positionGeometry.z.add(originZ);
  const initialBands = prepareSpectralBands(INITIAL_ARTISTIC_CONTROLS);
  const bandUniforms = SPECTRAL_BANDS.map((band, index) => {
    const initial = initialBands[index];
    return {
      amplitude: uniform(initial?.amplitude ?? 0),
      waveNumber: (Math.PI * 2) / band.wavelengthMetres,
      angularFrequency: (Math.PI * 2) / band.periodSeconds,
      directionX: uniform(initial?.directionX ?? 1),
      directionZ: uniform(initial?.directionZ ?? 0),
    };
  });

  const contributions = bandUniforms.map((band) => {
    const phase = worldX
      .mul(band.waveNumber)
      .mul(band.directionX)
      .add(worldZ.mul(band.waveNumber).mul(band.directionZ))
      .add(phaseOffset)
      .sub(timeSeconds.mul(band.angularFrequency).mul(timeScale));
    const sine = sin(phase);
    const cosine = cos(phase);
    const secondHarmonic = crestSharpness.mul(0.25);
    const wave = sine.sub(secondHarmonic.mul(sin(phase.mul(2))));
    const derivative = cosine.sub(secondHarmonic.mul(2).mul(cos(phase.mul(2))));
    return {
      height: band.amplitude.mul(wave),
      slopeX: band.amplitude
        .mul(derivative)
        .mul(band.waveNumber)
        .mul(band.directionX),
      slopeZ: band.amplitude
        .mul(derivative)
        .mul(band.waveNumber)
        .mul(band.directionZ),
    };
  });
  const first = contributions[0];
  if (first === undefined) {
    throw new Error("Four spectral bands must be prepared for rendering.");
  }
  const height = contributions
    .slice(1)
    .reduce((sum, band) => sum.add(band.height), first.height);
  const slopeX = contributions
    .slice(1)
    .reduce((sum, band) => sum.add(band.slopeX), first.slopeX);
  const slopeZ = contributions
    .slice(1)
    .reduce((sum, band) => sum.add(band.slopeZ), first.slopeZ);

  const localNormal = vec3(slopeX.mul(-1), 1, slopeZ.mul(-1)).normalize();
  const applySnapshot = (snapshot: OpenWaterRuntimeSnapshot): void => {
    const prepared = prepareSpectralBands(snapshot.artisticControls);
    phaseOffset.value = spectralBandPhaseOffset(snapshot.seed);
    timeSeconds.value = snapshot.timeSeconds;
    timeScale.value = snapshot.artisticControls.timeScale;
    crestSharpness.value = snapshot.artisticControls.crestSharpness;
    for (let index = 0; index < bandUniforms.length; index += 1) {
      const uniforms = bandUniforms[index];
      const next = prepared[index];
      if (uniforms === undefined || next === undefined) {
        continue;
      }
      uniforms.amplitude.value = next.amplitude;
      uniforms.directionX.value = next.directionX;
      uniforms.directionZ.value = next.directionZ;
    }
  };
  const synchronizeHostState = (): void => {
    const state = readHostSimulationState(simulation);
    phaseOffset.value = spectralBandPhaseOffset(state.seed);
    timeSeconds.value = state.timeSeconds;
  };
  const sink: RuntimeStateSink = Object.freeze({
    synchronize(snapshot: OpenWaterRuntimeSnapshot): void {
      applySnapshot(snapshot);
    },
  });

  return Object.freeze({
    originX,
    originZ,
    positionNode: vec3(worldX, height, worldZ),
    normalNode: highpModelNormalViewMatrix.mul(localNormal).normalize(),
    heightNode: height,
    sink,
    synchronizeHostState,
  });
}
