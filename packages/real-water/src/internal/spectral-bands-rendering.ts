import {
  abs,
  cameraPosition,
  cos,
  dot,
  float,
  highpModelNormalViewMatrix,
  length,
  max,
  mix,
  positionGeometry,
  pow,
  sin,
  smoothstep,
  uniform,
  vec2,
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
  BAND_GEOMETRY_FADE_END_FACTOR,
  BAND_GEOMETRY_FADE_START_FACTOR,
  NON_PERIODIC_BLEND_K1,
  NON_PERIODIC_BLEND_K2,
  NON_PERIODIC_OFFSET_X,
  NON_PERIODIC_OFFSET_Z,
  NON_PERIODIC_ROTATION_COS,
  NON_PERIODIC_ROTATION_SIN,
  SLOPE_DETAIL_FADE_END_METRES,
  SLOPE_DETAIL_FADE_START_METRES,
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
  const hostOriginX = uniform(0);
  const hostOriginZ = uniform(0);
  const phaseOffset = uniform(0);
  const timeSeconds = uniform(0);
  const timeScale = uniform(1);
  const crestSharpness = uniform(0);
  const initialBands = prepareSpectralBands(INITIAL_ARTISTIC_CONTROLS);
  const bandUniforms = SPECTRAL_BANDS.map((band, index) => {
    const initial = initialBands[index];
    return {
      amplitude: uniform(initial?.amplitude ?? 0),
      wavelengthMetres: band.wavelengthMetres,
      waveNumber: (Math.PI * 2) / band.wavelengthMetres,
      angularFrequency: (Math.PI * 2) / band.periodSeconds,
      directionX: uniform(initial?.directionX ?? 1),
      directionZ: uniform(initial?.directionZ ?? 0),
    };
  });

  const createHostSample = () => {
    // positionLocal includes the clipmap snap after positionNode assignment, so
    // fragment re-evaluation must use the geometry attribute or the snap is
    // applied twice and the slope sign flips. Host floating origin is added
    // only to the ocean-domain sample, never to the Host-frame vertex position.
    const hostX = positionGeometry.x.add(originX);
    const hostZ = positionGeometry.z.add(originZ);
    return {
      hostX,
      hostZ,
      oceanX: hostX.add(hostOriginX),
      oceanZ: hostZ.add(hostOriginZ),
    };
  };
  type HostSample = ReturnType<typeof createHostSample>;
  type WaveAxis = HostSample["oceanX"];
  const viewDistanceNode = (hostX: WaveAxis, hostZ: WaveAxis) =>
    length(vec2(hostX.sub(cameraPosition.x), hostZ.sub(cameraPosition.z)));
  const slopeFadeNode = (viewDistance: ReturnType<typeof viewDistanceNode>) =>
    smoothstep(
      SLOPE_DETAIL_FADE_START_METRES,
      SLOPE_DETAIL_FADE_END_METRES,
      viewDistance,
    );
  type ViewDistance = ReturnType<typeof viewDistanceNode>;
  type SlopeFade = ReturnType<typeof slopeFadeNode>;

  const evaluatePeriodicField = (
    sampleX: WaveAxis,
    sampleZ: WaveAxis,
    viewDistance: ViewDistance,
    slopeFade: SlopeFade,
  ) => {
    const contributions = bandUniforms.map((band) => {
      const phase = sampleX
        .mul(band.waveNumber)
        .mul(band.directionX)
        .add(sampleZ.mul(band.waveNumber).mul(band.directionZ))
        .add(phaseOffset)
        .sub(timeSeconds.mul(band.angularFrequency).mul(timeScale));
      const sine = sin(phase);
      const cosine = cos(phase);
      const secondHarmonic = crestSharpness.mul(0.25);
      const wave = sine.sub(secondHarmonic.mul(sin(phase.mul(2))));
      const derivative = cosine.sub(
        secondHarmonic.mul(2).mul(cos(phase.mul(2))),
      );
      // Short-wave geometry exits first, middle distances keep analytic
      // normals, and far distances convert remaining slope into filtered
      // BRDF energy.
      const geometryWeight = float(1).sub(
        smoothstep(
          band.wavelengthMetres * BAND_GEOMETRY_FADE_START_FACTOR,
          band.wavelengthMetres * BAND_GEOMETRY_FADE_END_FACTOR,
          viewDistance,
        ),
      );
      const normalWeight = float(1)
        .sub(geometryWeight)
        .mul(float(1).sub(slopeFade));
      const slopeWeight = float(1).sub(geometryWeight).mul(slopeFade);
      const height = band.amplitude.mul(wave);
      const slopeX = band.amplitude
        .mul(derivative)
        .mul(band.waveNumber)
        .mul(band.directionX);
      const slopeZ = band.amplitude
        .mul(derivative)
        .mul(band.waveNumber)
        .mul(band.directionZ);
      const shadingWeight = geometryWeight.add(normalWeight);
      return {
        height: height.mul(geometryWeight),
        slopeX: slopeX.mul(shadingWeight),
        slopeZ: slopeZ.mul(shadingWeight),
        variance: band.amplitude
          .mul(band.waveNumber)
          .mul(band.amplitude)
          .mul(band.waveNumber)
          .mul(0.5)
          .mul(slopeWeight),
      };
    });
    const first = contributions[0];
    if (first === undefined) {
      throw new Error("Four spectral bands must be prepared for rendering.");
    }
    return {
      height: contributions
        .slice(1)
        .reduce((sum, band) => sum.add(band.height), first.height),
      slopeX: contributions
        .slice(1)
        .reduce((sum, band) => sum.add(band.slopeX), first.slopeX),
      slopeZ: contributions
        .slice(1)
        .reduce((sum, band) => sum.add(band.slopeZ), first.slopeZ),
      variance: contributions
        .slice(1)
        .reduce((sum, band) => sum.add(band.variance), first.variance),
    };
  };

  const blendWeightNode = (oceanX: WaveAxis, oceanZ: WaveAxis) => {
    const argumentA = oceanX
      .mul(NON_PERIODIC_BLEND_K1)
      .add(oceanZ.mul(NON_PERIODIC_BLEND_K2))
      .add(phaseOffset);
    const argumentB = oceanX
      .mul(NON_PERIODIC_BLEND_K2)
      .sub(oceanZ.mul(NON_PERIODIC_BLEND_K1).mul(0.7))
      .add(phaseOffset.mul(1.3));
    const sineA = sin(argumentA);
    const sineB = sin(argumentB);
    const blendField = sineA.mul(sineB);
    const blendT = blendField.mul(0.5).add(0.5).sub(0.2).div(0.6).clamp(0, 1);
    const dWeightDField = blendT.mul(float(1).sub(blendT)).mul(5);
    return {
      weight: blendT.mul(blendT).mul(float(3).sub(blendT.mul(2))),
      dWeightDx: dWeightDField.mul(
        cos(argumentA)
          .mul(NON_PERIODIC_BLEND_K1)
          .mul(sineB)
          .add(sineA.mul(cos(argumentB)).mul(NON_PERIODIC_BLEND_K2)),
      ),
      dWeightDz: dWeightDField.mul(
        cos(argumentA)
          .mul(NON_PERIODIC_BLEND_K2)
          .mul(sineB)
          .add(sineA.mul(cos(argumentB)).mul(-NON_PERIODIC_BLEND_K1 * 0.7)),
      ),
    };
  };

  const rotatedDomain = (oceanX: WaveAxis, oceanZ: WaveAxis) => ({
    x: oceanX
      .mul(NON_PERIODIC_ROTATION_COS)
      .sub(oceanZ.mul(NON_PERIODIC_ROTATION_SIN))
      .add(NON_PERIODIC_OFFSET_X),
    z: oceanX
      .mul(NON_PERIODIC_ROTATION_SIN)
      .add(oceanZ.mul(NON_PERIODIC_ROTATION_COS))
      .add(NON_PERIODIC_OFFSET_Z),
  });

  const evaluateBlendedSurface = (
    oceanX: WaveAxis,
    oceanZ: WaveAxis,
    viewDistance: ViewDistance,
    slopeFade: SlopeFade,
  ) => {
    const primary = evaluatePeriodicField(
      oceanX,
      oceanZ,
      viewDistance,
      slopeFade,
    );
    const rotated = rotatedDomain(oceanX, oceanZ);
    const secondary = evaluatePeriodicField(
      rotated.x,
      rotated.z,
      viewDistance,
      slopeFade,
    );
    const blend = blendWeightNode(oceanX, oceanZ);
    const secondarySlopeX = secondary.slopeX
      .mul(NON_PERIODIC_ROTATION_COS)
      .add(secondary.slopeZ.mul(NON_PERIODIC_ROTATION_SIN));
    const secondarySlopeZ = secondary.slopeX
      .mul(-NON_PERIODIC_ROTATION_SIN)
      .add(secondary.slopeZ.mul(NON_PERIODIC_ROTATION_COS));
    const heightDelta = secondary.height.sub(primary.height);
    return {
      height: mix(primary.height, secondary.height, blend.weight),
      slopeX: mix(primary.slopeX, secondarySlopeX, blend.weight).add(
        heightDelta.mul(blend.dWeightDx),
      ),
      slopeZ: mix(primary.slopeZ, secondarySlopeZ, blend.weight).add(
        heightDelta.mul(blend.dWeightDz),
      ),
      slopeVariance: mix(primary.variance, secondary.variance, blend.weight),
    };
  };

  // Vertex displacement and fragment shading own separate TSL graphs. Sharing
  // ocean-domain sample nodes with color, highlights, or white-detail lets the
  // compiler evaluate the non-periodic mix in fragment and leave camera-relative
  // periodic vertex heights.
  const vertexSample = createHostSample();
  const vertexViewDistance = viewDistanceNode(
    vertexSample.hostX,
    vertexSample.hostZ,
  );
  const vertexSlopeFade = slopeFadeNode(vertexViewDistance);
  const vertexSurface = evaluateBlendedSurface(
    vertexSample.oceanX,
    vertexSample.oceanZ,
    vertexViewDistance,
    vertexSlopeFade,
  );
  const vertexHeight = vertexSurface.height.toVertexStage();

  const fragmentSample = createHostSample();
  const fragmentViewDistance = viewDistanceNode(
    fragmentSample.hostX,
    fragmentSample.hostZ,
  );
  const fragmentSlopeFade = slopeFadeNode(fragmentViewDistance);
  const fragmentSurface = evaluateBlendedSurface(
    fragmentSample.oceanX,
    fragmentSample.oceanZ,
    fragmentViewDistance,
    fragmentSlopeFade,
  );

  const localNormal = vec3(
    fragmentSurface.slopeX.mul(-1),
    1,
    fragmentSurface.slopeZ.mul(-1),
  ).normalize();
  const roughnessNode = mix(
    float(0.08),
    float(0.58),
    fragmentSurface.slopeVariance.mul(8).clamp(0, 1),
  );
  const sunDirection = vec3(0.32, 0.84, 0.44).normalize();
  const viewDirection = cameraPosition
    .sub(vec3(fragmentSample.hostX, vertexHeight, fragmentSample.hostZ))
    .normalize();
  const halfDirection = sunDirection.add(viewDirection).normalize();
  const specularPower = mix(float(110), float(10), roughnessNode);
  const nearWhite = smoothstep(
    0.22,
    0.9,
    length(vec2(fragmentSurface.slopeX, fragmentSurface.slopeZ)),
  );
  const farWhite = smoothstep(
    0.12,
    0.72,
    abs(
      sin(
        fragmentSample.oceanX
          .mul(0.018)
          .add(fragmentSample.oceanZ.mul(0.011))
          .add(phaseOffset),
      ),
    ).mul(
      abs(
        sin(
          fragmentSample.oceanX
            .mul(0.007)
            .sub(fragmentSample.oceanZ.mul(0.016)),
        ),
      ),
    ),
  );
  const whiteDetailNode = mix(nearWhite, farWhite, fragmentSlopeFade);
  const highlightNode = pow(
    max(dot(localNormal, halfDirection), 0),
    specularPower,
  )
    .mul(mix(float(0.55), float(0.28), roughnessNode))
    .mul(mix(float(1), farWhite.add(0.35), fragmentSlopeFade));
  const applySnapshot = (snapshot: OpenWaterRuntimeSnapshot): void => {
    const prepared = prepareSpectralBands(snapshot.artisticControls);
    phaseOffset.value = spectralBandPhaseOffset(snapshot.seed);
    timeSeconds.value = snapshot.timeSeconds;
    timeScale.value = snapshot.artisticControls.timeScale;
    crestSharpness.value = snapshot.artisticControls.crestSharpness;
    hostOriginX.value = snapshot.originX;
    hostOriginZ.value = snapshot.originZ;
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
    hostOriginX.value = state.originX;
    hostOriginZ.value = state.originZ;
  };
  const sink: RuntimeStateSink = Object.freeze({
    synchronize(snapshot: OpenWaterRuntimeSnapshot): void {
      applySnapshot(snapshot);
    },
  });

  return Object.freeze({
    originX,
    originZ,
    positionNode: vec3(vertexSample.hostX, vertexHeight, vertexSample.hostZ),
    normalNode: highpModelNormalViewMatrix.mul(localNormal).normalize(),
    heightNode: vertexHeight,
    roughnessNode,
    highlightNode,
    whiteDetailNode,
    sink,
    synchronizeHostState,
  });
}
