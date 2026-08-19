import {
  cos,
  highpModelNormalViewMatrix,
  positionLocal,
  sin,
  uniform,
  vec3,
} from "three/tsl";
import type {
  HostSimulationAdapter,
  OpenWaterRuntimeSnapshot,
  RuntimeStateSink,
} from "../runtime.js";
import { readHostSimulationState } from "../runtime.js";
import {
  SINGLE_BAND_AMPLITUDE_METRES,
  SINGLE_BAND_ANGULAR_FREQUENCY,
  SINGLE_BAND_WAVE_NUMBER,
  singleSpectralBandPhaseOffset,
} from "./single-spectral-band.js";

export function createSingleSpectralBandRendering(
  simulation: HostSimulationAdapter,
) {
  const amplitude = uniform(SINGLE_BAND_AMPLITUDE_METRES);
  const phaseOffset = uniform(0);
  const timeSeconds = uniform(0);
  const phase = positionLocal.x
    .mul(SINGLE_BAND_WAVE_NUMBER)
    .add(phaseOffset)
    .sub(timeSeconds.mul(SINGLE_BAND_ANGULAR_FREQUENCY));
  const height = sin(phase).mul(amplitude);
  const slope = cos(phase).mul(amplitude).mul(SINGLE_BAND_WAVE_NUMBER);
  const localNormal = vec3(slope.mul(-1), 1, 0).normalize();
  const synchronizeHostState = (): void => {
    const state = readHostSimulationState(simulation);
    phaseOffset.value = singleSpectralBandPhaseOffset(state.seed);
    timeSeconds.value = state.timeSeconds;
  };
  const sink: RuntimeStateSink = Object.freeze({
    synchronize(snapshot: OpenWaterRuntimeSnapshot): void {
      amplitude.value =
        SINGLE_BAND_AMPLITUDE_METRES * snapshot.artisticControls.waveStrength;
      phaseOffset.value = singleSpectralBandPhaseOffset(snapshot.seed);
      timeSeconds.value = snapshot.timeSeconds;
    },
  });

  return Object.freeze({
    positionNode: positionLocal.add(vec3(0, height, 0)),
    normalNode: highpModelNormalViewMatrix.mul(localNormal).normalize(),
    heightNode: height,
    sink,
    synchronizeHostState,
  });
}
