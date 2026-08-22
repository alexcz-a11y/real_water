import {
  abs,
  cameraPosition,
  cos,
  float,
  highpModelNormalViewMatrix,
  length,
  Fn,
  mix,
  nodeObject,
  NodeUpdateType,
  positionGeometry,
  positionPrevious,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
} from "three/tsl";
import { Node } from "three/webgpu";
import type {
  ArtisticControls,
  HostSimulationAdapter,
  OpenWaterRuntimeSnapshot,
  RuntimeStateSink,
} from "../runtime.js";
import { readHostSimulationState } from "../runtime.js";
import {
  readHostPresentationState,
  type HostPresentationAdapter,
} from "../presentation.js";
import {
  BAND_GEOMETRY_FADE_END_FACTOR,
  BAND_GEOMETRY_FADE_START_FACTOR,
  FAR_WHITE_PRIMARY_X,
  FAR_WHITE_PRIMARY_Z,
  FAR_WHITE_SECONDARY_X,
  FAR_WHITE_SECONDARY_Z,
  NON_PERIODIC_BLEND_K1,
  NON_PERIODIC_BLEND_K2,
  NON_PERIODIC_OFFSET_X,
  NON_PERIODIC_OFFSET_Z,
  NON_PERIODIC_ROTATION_COS,
  NON_PERIODIC_ROTATION_SIN,
  SLOPE_DETAIL_FADE_END_METRES,
  SLOPE_DETAIL_FADE_START_METRES,
  SPECTRAL_BANDS,
  originSamplePhase,
  prepareSpectralBands,
  rotateOrigin,
  spectralBandPhaseOffset,
} from "./spectral-bands.js";
import { snapClipmapToCamera } from "./camera-relative-clipmap.js";
import { createWaterPreset } from "../water-preset.js";

const INITIAL_ARTISTIC_CONTROLS: ArtisticControls =
  createWaterPreset("swell").artisticControls;

export function createSpectralBandRendering(
  simulation: HostSimulationAdapter,
  presentation: HostPresentationAdapter,
  innerCellMetres: number,
) {
  const originX = uniform(0);
  const originZ = uniform(0);
  const phaseOffset = uniform(0);
  const timeSeconds = uniform(0);
  const seaLevelMetres = uniform(0);
  const timeScale = uniform(1);
  const crestSharpness = uniform(0);
  const blendOriginPhaseA = uniform(0);
  const blendOriginPhaseB = uniform(0);
  const farWhiteOriginPhaseA = uniform(0);
  const farWhiteOriginPhaseB = uniform(0);
  const initialBands = prepareSpectralBands(INITIAL_ARTISTIC_CONTROLS);
  const createBandUniforms = () =>
    SPECTRAL_BANDS.map((band, index) => {
      const initial = initialBands[index];
      return {
        amplitude: uniform(initial?.amplitude ?? 0),
        wavelengthMetres: band.wavelengthMetres,
        waveNumber: (Math.PI * 2) / band.wavelengthMetres,
        angularFrequency: (Math.PI * 2) / band.periodSeconds,
        directionX: uniform(initial?.directionX ?? 1),
        directionZ: uniform(initial?.directionZ ?? 0),
        originPhase: uniform(0),
        rotatedOriginPhase: uniform(0),
      };
    });
  const bandUniforms = createBandUniforms();
  const previousBandUniforms = createBandUniforms();
  const previousPhaseOffset = uniform(0);
  const previousTimeSeconds = uniform(0);
  const previousSeaLevelMetres = uniform(0);
  const previousTimeScale = uniform(1);
  const previousCrestSharpness = uniform(0);
  const previousBlendOriginPhaseA = uniform(0);
  const previousBlendOriginPhaseB = uniform(0);

  const createHostSample = () => {
    // Clipmap snap uniforms stay in the Host frame. positionLocal includes that
    // snap after positionNode assignment, so fragment re-evaluation must use the
    // geometry attribute or the snap is applied twice and the slope sign flips.
    // The Host floating origin never enters these sample coordinates; CPU double
    // wraps it into small per-component phase uniforms.
    const hostX = positionGeometry.x.add(originX);
    const hostZ = positionGeometry.z.add(originZ);
    return {
      hostX,
      hostZ,
    };
  };
  type HostSample = ReturnType<typeof createHostSample>;
  type WaveAxis = HostSample["hostX"];
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

  type BandUniforms = (typeof bandUniforms)[number];
  type WaveFieldNodes = Readonly<{
    readonly phaseOffset: typeof phaseOffset;
    readonly timeSeconds: typeof timeSeconds;
    readonly seaLevelMetres: typeof seaLevelMetres;
    readonly timeScale: typeof timeScale;
    readonly crestSharpness: typeof crestSharpness;
    readonly blendOriginPhaseA: typeof blendOriginPhaseA;
    readonly blendOriginPhaseB: typeof blendOriginPhaseB;
    readonly bands: readonly BandUniforms[];
  }>;
  const currentWaveField: WaveFieldNodes = {
    phaseOffset,
    timeSeconds,
    seaLevelMetres,
    timeScale,
    crestSharpness,
    blendOriginPhaseA,
    blendOriginPhaseB,
    bands: bandUniforms,
  };
  const previousWaveField: WaveFieldNodes = {
    phaseOffset: previousPhaseOffset,
    timeSeconds: previousTimeSeconds,
    seaLevelMetres: previousSeaLevelMetres,
    timeScale: previousTimeScale,
    crestSharpness: previousCrestSharpness,
    blendOriginPhaseA: previousBlendOriginPhaseA,
    blendOriginPhaseB: previousBlendOriginPhaseB,
    bands: previousBandUniforms,
  };
  const evaluatePeriodicField = (
    sampleX: WaveAxis,
    sampleZ: WaveAxis,
    originPhaseOf: (band: BandUniforms) => WaveAxis,
    viewDistance: ViewDistance,
    slopeFade: SlopeFade,
    field: WaveFieldNodes,
  ) => {
    const contributions = field.bands.map((band) => {
      const phase = sampleX
        .mul(band.waveNumber)
        .mul(band.directionX)
        .add(sampleZ.mul(band.waveNumber).mul(band.directionZ))
        .add(field.phaseOffset)
        .add(originPhaseOf(band))
        .sub(field.timeSeconds.mul(band.angularFrequency).mul(field.timeScale));
      const sine = sin(phase);
      const cosine = cos(phase);
      const secondHarmonic = field.crestSharpness.mul(0.25);
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

  const blendWeightNode = (
    hostX: WaveAxis,
    hostZ: WaveAxis,
    field: WaveFieldNodes,
  ) => {
    const argumentA = hostX
      .mul(NON_PERIODIC_BLEND_K1)
      .add(hostZ.mul(NON_PERIODIC_BLEND_K2))
      .add(field.phaseOffset)
      .add(field.blendOriginPhaseA);
    const argumentB = hostX
      .mul(NON_PERIODIC_BLEND_K2)
      .sub(hostZ.mul(NON_PERIODIC_BLEND_K1).mul(0.7))
      .add(field.phaseOffset.mul(1.3))
      .add(field.blendOriginPhaseB);
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

  const rotatedDomain = (hostX: WaveAxis, hostZ: WaveAxis) => ({
    x: hostX
      .mul(NON_PERIODIC_ROTATION_COS)
      .sub(hostZ.mul(NON_PERIODIC_ROTATION_SIN))
      .add(NON_PERIODIC_OFFSET_X),
    z: hostX
      .mul(NON_PERIODIC_ROTATION_SIN)
      .add(hostZ.mul(NON_PERIODIC_ROTATION_COS))
      .add(NON_PERIODIC_OFFSET_Z),
  });

  const evaluateBlendedSurface = (
    hostX: WaveAxis,
    hostZ: WaveAxis,
    viewDistance: ViewDistance,
    slopeFade: SlopeFade,
    field: WaveFieldNodes,
  ) => {
    const primary = evaluatePeriodicField(
      hostX,
      hostZ,
      (band) => band.originPhase,
      viewDistance,
      slopeFade,
      field,
    );
    const rotated = rotatedDomain(hostX, hostZ);
    const secondary = evaluatePeriodicField(
      rotated.x,
      rotated.z,
      (band) => band.rotatedOriginPhase,
      viewDistance,
      slopeFade,
      field,
    );
    const blend = blendWeightNode(hostX, hostZ, field);
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
    vertexSample.hostX,
    vertexSample.hostZ,
    vertexViewDistance,
    vertexSlopeFade,
    currentWaveField,
  );
  const vertexHeight = vertexSurface.height
    .add(currentWaveField.seaLevelMetres)
    .toVertexStage();
  const previousVertexSurface = evaluateBlendedSurface(
    vertexSample.hostX,
    vertexSample.hostZ,
    vertexViewDistance,
    vertexSlopeFade,
    previousWaveField,
  );
  const previousVertexHeight = previousVertexSurface.height
    .add(previousWaveField.seaLevelMetres)
    .toVertexStage();

  const fragmentSample = createHostSample();
  const fragmentViewDistance = viewDistanceNode(
    fragmentSample.hostX,
    fragmentSample.hostZ,
  );
  const fragmentSlopeFade = slopeFadeNode(fragmentViewDistance);
  const fragmentSurface = evaluateBlendedSurface(
    fragmentSample.hostX,
    fragmentSample.hostZ,
    fragmentViewDistance,
    fragmentSlopeFade,
    currentWaveField,
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
  const viewDirection = cameraPosition
    .sub(vec3(fragmentSample.hostX, vertexHeight, fragmentSample.hostZ))
    .normalize();
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
        fragmentSample.hostX
          .mul(FAR_WHITE_PRIMARY_X)
          .add(fragmentSample.hostZ.mul(FAR_WHITE_PRIMARY_Z))
          .add(phaseOffset)
          .add(farWhiteOriginPhaseA),
      ),
    ).mul(
      abs(
        sin(
          fragmentSample.hostX
            .mul(FAR_WHITE_SECONDARY_X)
            .sub(fragmentSample.hostZ.mul(FAR_WHITE_SECONDARY_Z))
            .add(farWhiteOriginPhaseB),
        ),
      ),
    ),
  );
  const detailStrengthNode = mix(nearWhite, farWhite, fragmentSlopeFade);
  const writeOriginPhases = (
    originXValue: number,
    originZValue: number,
    field: WaveFieldNodes,
    writeFarWhite: boolean,
  ): void => {
    const rotated = rotateOrigin(originXValue, originZValue);
    field.blendOriginPhaseA.value = originSamplePhase(
      originXValue,
      originZValue,
      NON_PERIODIC_BLEND_K1,
      NON_PERIODIC_BLEND_K2,
    );
    field.blendOriginPhaseB.value = originSamplePhase(
      originXValue,
      originZValue,
      NON_PERIODIC_BLEND_K2,
      -NON_PERIODIC_BLEND_K1 * 0.7,
    );
    if (writeFarWhite) {
      farWhiteOriginPhaseA.value = originSamplePhase(
        originXValue,
        originZValue,
        FAR_WHITE_PRIMARY_X,
        FAR_WHITE_PRIMARY_Z,
      );
      farWhiteOriginPhaseB.value = originSamplePhase(
        originXValue,
        originZValue,
        FAR_WHITE_SECONDARY_X,
        -FAR_WHITE_SECONDARY_Z,
      );
    }
    for (const uniforms of field.bands) {
      uniforms.originPhase.value = originSamplePhase(
        originXValue,
        originZValue,
        uniforms.waveNumber * uniforms.directionX.value,
        uniforms.waveNumber * uniforms.directionZ.value,
      );
      uniforms.rotatedOriginPhase.value = originSamplePhase(
        rotated.x,
        rotated.z,
        uniforms.waveNumber * uniforms.directionX.value,
        uniforms.waveNumber * uniforms.directionZ.value,
      );
    }
  };
  const writeWaveField = (
    field: WaveFieldNodes,
    snapshot: Pick<
      OpenWaterRuntimeSnapshot,
      | "seed"
      | "timeSeconds"
      | "originX"
      | "originZ"
      | "seaLevelMetres"
      | "artisticControls"
    >,
    writeFarWhite: boolean,
  ): void => {
    const prepared = prepareSpectralBands(snapshot.artisticControls);
    field.phaseOffset.value = spectralBandPhaseOffset(snapshot.seed);
    field.timeSeconds.value = snapshot.timeSeconds;
    field.seaLevelMetres.value = snapshot.seaLevelMetres;
    field.timeScale.value = snapshot.artisticControls.timeScale;
    field.crestSharpness.value = snapshot.artisticControls.crestSharpness;
    for (let index = 0; index < field.bands.length; index += 1) {
      const uniforms = field.bands[index];
      const next = prepared[index];
      if (uniforms === undefined || next === undefined) {
        continue;
      }
      uniforms.amplitude.value = next.amplitude;
      uniforms.directionX.value = next.directionX;
      uniforms.directionZ.value = next.directionZ;
    }
    writeOriginPhases(snapshot.originX, snapshot.originZ, field, writeFarWhite);
  };
  type PresentedWaveField = Readonly<{
    readonly seed: number;
    readonly tick: number;
    readonly timeSeconds: number;
    readonly originX: number;
    readonly originZ: number;
    readonly seaLevelMetres: number;
    readonly simulationResetRevision: number;
    readonly cameraCutRevision: number;
    readonly seaStateCutRevision: number;
    readonly artisticControls: ArtisticControls;
  }>;
  let desiredControls = INITIAL_ARTISTIC_CONTROLS;
  let desiredSeaStateCutRevision = 0;
  let committed: PresentedWaveField | null = null;
  let pending: PresentedWaveField | null = null;
  const shouldResetWaveHistory = (current: PresentedWaveField): boolean =>
    committed === null ||
    committed.seed !== current.seed ||
    committed.simulationResetRevision !== current.simulationResetRevision ||
    committed.originX !== current.originX ||
    committed.originZ !== current.originZ ||
    current.timeSeconds < committed.timeSeconds ||
    current.tick < committed.tick ||
    committed.cameraCutRevision !== current.cameraCutRevision ||
    committed.seaStateCutRevision !== current.seaStateCutRevision;
  class WaveFieldPresentationNode extends Node {
    constructor() {
      super("void");
      this.updateBeforeType = NodeUpdateType.RENDER;
      this.updateAfterType = NodeUpdateType.RENDER;
    }

    override updateBefore(frame: { readonly camera: unknown }): undefined {
      const state = readHostSimulationState(simulation);
      const presentationState = readHostPresentationState(presentation);
      const current: PresentedWaveField = {
        seed: state.seed,
        tick: state.tick,
        timeSeconds: state.timeSeconds,
        originX: state.originX,
        originZ: state.originZ,
        seaLevelMetres: state.seaLevelMetres,
        simulationResetRevision: state.simulationResetRevision,
        cameraCutRevision: presentationState.cameraCutRevision,
        seaStateCutRevision: desiredSeaStateCutRevision,
        artisticControls: desiredControls,
      };
      const previous = shouldResetWaveHistory(current) ? current : committed;
      writeWaveField(currentWaveField, current, true);
      writeWaveField(previousWaveField, previous ?? current, false);
      const camera = frame.camera;
      if (
        camera !== null &&
        typeof camera === "object" &&
        "updateMatrixWorld" in camera &&
        "matrixWorld" in camera
      ) {
        snapClipmapToCamera(
          camera as {
            updateMatrixWorld(): void;
            readonly matrixWorld: { readonly elements: ArrayLike<number> };
          },
          originX,
          originZ,
          innerCellMetres,
        );
      }
      pending = current;
    }

    override updateAfter(): undefined {
      if (pending !== null) {
        committed = pending;
        pending = null;
      }
    }
  }
  const presentationNode = new WaveFieldPresentationNode();
  const positionNode = Fn(() => {
    nodeObject(presentationNode).toStack();
    positionPrevious.assign(
      vec3(vertexSample.hostX, previousVertexHeight, vertexSample.hostZ),
    );
    return vec3(vertexSample.hostX, vertexHeight, vertexSample.hostZ);
  })();
  const sink: RuntimeStateSink = Object.freeze({
    synchronize(snapshot: OpenWaterRuntimeSnapshot): void {
      desiredControls = snapshot.artisticControls;
      desiredSeaStateCutRevision = snapshot.seaStateCutRevision;
    },
  });

  return Object.freeze({
    originX,
    originZ,
    positionNode,
    normalNode: highpModelNormalViewMatrix.mul(localNormal).normalize(),
    worldNormalNode: localNormal,
    viewDirectionNode: viewDirection,
    hostXNode: fragmentSample.hostX,
    hostZNode: fragmentSample.hostZ,
    heightNode: vertexHeight,
    slopeStrengthNode: length(
      vec2(fragmentSurface.slopeX, fragmentSurface.slopeZ),
    ),
    roughnessNode,
    detailStrengthNode,
    sink,
  });
}
