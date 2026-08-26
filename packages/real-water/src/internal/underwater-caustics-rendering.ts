import {
  Matrix4,
  Vector3,
  type Node,
  type PerspectiveCamera,
  type Texture,
} from "three/webgpu";
import {
  abs,
  exp,
  float,
  Fn,
  getViewPosition,
  If,
  max,
  mix,
  screenUV,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  unpackRGBToNormal,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  readHostEnvironmentState,
  type HostEnvironmentAdapter,
} from "../environment.js";
import type { QualityProfileUnderwaterCaustics } from "../quality-profile.js";
import type { OpenWaterRuntimeSnapshot, RuntimeStateSink } from "../runtime.js";
import {
  originSamplePhase,
  spectralBandPhaseOffset,
} from "./spectral-bands.js";
import type { WaterlineFrameState } from "./waterline-state.js";

const WATER_MASK_EPSILON = 1e-4;
const SKY_DEPTH_THRESHOLD = 0.9999;
const RECEIVER_DEPTH_EPSILON_METRES = 0.01;
const WATER_SEGMENT_EPSILON_METRES = 1e-4;
const CAUSTIC_PRIMARY_X = 1.37;
const CAUSTIC_PRIMARY_Z = 0.61;
const CAUSTIC_SECONDARY_X = -0.47;
const CAUSTIC_SECONDARY_Z = 1.71;
// Authored Blue Noon presentation strength. This is deliberately not a
// Quality Profile field: changing a visual coefficient cannot require prewarm.
const CAUSTIC_PRESENTATION_INTENSITY = 0.35;
const MAX_CAUSTIC_RADIANCE = 0.16;

export interface PreparedUnderwaterSurfaceSample {
  readonly height: Node<"float">;
  readonly slopeX: Node<"float">;
  readonly slopeZ: Node<"float">;
}

/** Narrow package-private bridge to the current prepared water surface. */
export interface PreparedUnderwaterSurfaceSampler {
  sampleSurface(
    hostX: Node<"float">,
    hostZ: Node<"float">,
  ): PreparedUnderwaterSurfaceSample;
}

/** Package-private, bounded visible-receiver underwater caustics graph. */
export function createUnderwaterCausticsRendering(
  sceneDepth: Texture,
  packedViewNormal: Texture,
  opticalFactors: Texture,
  camera: PerspectiveCamera,
  environment: HostEnvironmentAdapter,
  initialWaterline: WaterlineFrameState,
  policy: QualityProfileUnderwaterCaustics,
  surface: PreparedUnderwaterSurfaceSampler,
  initialSnapshot: OpenWaterRuntimeSnapshot,
) {
  const initialEnvironment = readHostEnvironmentState(environment);
  const projectionMatrixInverse = uniform(
    new Matrix4().copy(camera.projectionMatrixInverse),
  ).setName("causticsProjectionMatrixInverse");
  const cameraWorldMatrix = uniform(
    new Matrix4().copy(camera.matrixWorld),
  ).setName("causticsCameraWorldMatrix");
  const signedCameraDistance = uniform(
    initialWaterline.signedDistanceMetres,
  ).setName("causticsSignedCameraDistance");
  const underwaterTurbidity = uniform(
    initialSnapshot.artisticControls.underwaterTurbidity,
  ).setName("causticsUnderwaterTurbidity");
  const meanSeaLevelMetres = uniform(initialSnapshot.seaLevelMetres).setName(
    "causticsMeanSeaLevelMetres",
  );
  const seedPhase = uniform(
    spectralBandPhaseOffset(initialSnapshot.seed),
  ).setName("causticsSeedPhase");
  const primaryOriginPhase = uniform(
    originSamplePhase(
      initialSnapshot.originX,
      initialSnapshot.originZ,
      CAUSTIC_PRIMARY_X,
      CAUSTIC_PRIMARY_Z,
    ),
  ).setName("causticsPrimaryOriginPhase");
  const secondaryOriginPhase = uniform(
    originSamplePhase(
      initialSnapshot.originX,
      initialSnapshot.originZ,
      CAUSTIC_SECONDARY_X,
      CAUSTIC_SECONDARY_Z,
    ),
  ).setName("causticsSecondaryOriginPhase");
  const sunDirectionValue = new Vector3(
    initialEnvironment.sunDirectionX,
    initialEnvironment.sunDirectionY,
    initialEnvironment.sunDirectionZ,
  );
  const sunColorValue = new Vector3(
    initialEnvironment.sunColorR,
    initialEnvironment.sunColorG,
    initialEnvironment.sunColorB,
  );
  const sunDirection = uniform(sunDirectionValue).setName(
    "causticsSunDirection",
  );
  const sunColor = uniform(sunColorValue).setName("causticsSunColor");
  const sunIntensity = uniform(initialEnvironment.sunIntensity).setName(
    "causticsSunIntensity",
  );
  const applyHostLighting = (): void => {
    const lighting = readHostEnvironmentState(environment);
    sunDirectionValue.set(
      lighting.sunDirectionX,
      lighting.sunDirectionY,
      lighting.sunDirectionZ,
    );
    sunColorValue.set(
      lighting.sunColorR,
      lighting.sunColorG,
      lighting.sunColorB,
    );
    sunIntensity.value = lighting.sunIntensity;
  };
  sunIntensity.onRenderUpdate(applyHostLighting);

  const uvNode = screenUV;
  const depth = texture(sceneDepth, uvNode).r;
  const viewPosition = getViewPosition(uvNode, depth, projectionMatrixInverse);
  const receiverDistance = viewPosition.length();
  const viewRay = viewPosition.normalize();
  const receiverWorld = cameraWorldMatrix.mul(vec4(viewPosition, 1)).xyz;
  const worldRay = cameraWorldMatrix.mul(vec4(viewRay, 0)).xyz.normalize();
  const viewNormal = unpackRGBToNormal(
    texture(packedViewNormal, uvNode).rgb,
  ).normalize();
  const receiverWorldNormal = cameraWorldMatrix
    .mul(vec4(viewNormal, 0))
    .xyz.normalize();

  const cameraBelow = float(1).sub(step(float(0), signedCameraDistance));
  const upwardRay = step(float(1e-4), worldRay.y);
  const downwardRay = float(1).sub(step(float(-1e-4), worldRay.y));
  const exitDistance = signedCameraDistance
    .negate()
    .div(max(worldRay.y, float(1e-4)))
    .clamp(0, policy.maxReceiverDistanceMetres);
  const entryDistance = signedCameraDistance
    .negate()
    .div(worldRay.y.min(float(-1e-4)))
    .clamp(0, policy.maxReceiverDistanceMetres);
  const belowWaterDistance = mix(
    receiverDistance,
    receiverDistance.min(exitDistance),
    upwardRay,
  );
  const aboveWaterDistance = receiverDistance
    .sub(entryDistance)
    .max(0)
    .mul(downwardRay);
  const waterSegmentDistance = mix(
    aboveWaterDistance,
    belowWaterDistance,
    cameraBelow,
  ).clamp(0, policy.maxReceiverDistanceMetres);

  const hasGeometry = float(1).sub(step(SKY_DEPTH_THRESHOLD, depth));
  const waterSurfaceMask = step(
    WATER_MASK_EPSILON,
    texture(opticalFactors, uvNode).a,
  );
  const nonWaterReceiver = float(1).sub(waterSurfaceMask);
  const withinReceiverDistance = step(
    receiverDistance,
    float(policy.maxReceiverDistanceMetres),
  );
  const upFacing = step(
    float(policy.receiverNormalMinY),
    receiverWorldNormal.y,
  );
  const insideWaterSegment = step(
    float(WATER_SEGMENT_EPSILON_METRES),
    waterSegmentDistance,
  );
  const normalizedSunDirection = sunDirection.normalize();
  const sunCanReachSurface = step(float(0.02), normalizedSunDirection.y).mul(
    step(float(1e-4), sunIntensity),
  );
  const receiverCandidateMask = hasGeometry
    .mul(nonWaterReceiver)
    .mul(withinReceiverDistance)
    .mul(upFacing)
    .mul(insideWaterSegment)
    .mul(sunCanReachSurface)
    .clamp(0, 1);

  // Host sun direction points from the receiver toward the sun, matching the
  // above-water half-vector route. Trace its opposite through the water, so
  // the corresponding surface point lies receiver + toSunXZ * depth/toSunY.
  const downwardSunY = normalizedSunDirection.y.max(0.08);
  const causticsOutput = Fn(() => {
    const output = vec4(0).toVar();
    // Keep sky, water-surface, back-facing, out-of-range, and dry pixels out of
    // the prepared-surface route. In particular, a full local-interaction
    // source scan must never be unconditional at drawing-buffer resolution.
    If(receiverCandidateMask.greaterThan(0), () => {
      // One bounded prepared-surface sample approximates the sun entry point.
      // Mean depth selects the sample; the sampled height then refines the
      // network projection without performing a second local-source scan.
      const meanReceiverDepth = meanSeaLevelMetres.sub(receiverWorld.y).max(0);
      const firstProjectedSurfaceX = receiverWorld.x.add(
        normalizedSunDirection.x.div(downwardSunY).mul(meanReceiverDepth),
      );
      const firstProjectedSurfaceZ = receiverWorld.z.add(
        normalizedSunDirection.z.div(downwardSunY).mul(meanReceiverDepth),
      );
      const projectedSurface = surface.sampleSurface(
        firstProjectedSurfaceX,
        firstProjectedSurfaceZ,
      );
      const receiverDepth = projectedSurface.height.sub(receiverWorld.y).max(0);
      const projectedSurfaceX = receiverWorld.x.add(
        normalizedSunDirection.x.div(downwardSunY).mul(receiverDepth),
      );
      const projectedSurfaceZ = receiverWorld.z.add(
        normalizedSunDirection.z.div(downwardSunY).mul(receiverDepth),
      );
      const belowPreparedSurface = step(
        receiverWorld.y.add(RECEIVER_DEPTH_EPSILON_METRES),
        projectedSurface.height,
      );
      const receiverMask = receiverCandidateMask.mul(belowPreparedSurface);
      const primaryPhase = projectedSurfaceX
        .mul(CAUSTIC_PRIMARY_X)
        .add(projectedSurfaceZ.mul(CAUSTIC_PRIMARY_Z))
        .add(primaryOriginPhase)
        .add(projectedSurface.height.sub(meanSeaLevelMetres).mul(0.43))
        .add(projectedSurface.slopeX.mul(2.7))
        .sub(projectedSurface.slopeZ.mul(1.1))
        .add(seedPhase);
      const secondaryPhase = projectedSurfaceX
        .mul(CAUSTIC_SECONDARY_X)
        .add(projectedSurfaceZ.mul(CAUSTIC_SECONDARY_Z))
        .add(secondaryOriginPhase)
        .sub(projectedSurface.height.sub(meanSeaLevelMetres).mul(0.31))
        .add(projectedSurface.slopeX.mul(0.8))
        .add(projectedSurface.slopeZ.mul(2.2))
        .add(seedPhase.mul(1.37));
      const primaryCellDistance = abs(sin(primaryPhase));
      const secondaryCellDistance = abs(sin(secondaryPhase));
      const causticRidges = float(1).sub(
        primaryCellDistance.min(secondaryCellDistance),
      );
      const causticNetwork = smoothstep(0.58, 0.96, causticRidges).pow(1.4);
      const horizontalSun = vec2(
        normalizedSunDirection.x,
        normalizedSunDirection.z,
      );
      const horizontalSunLength = horizontalSun.length().max(1e-4);
      const sunAxis = horizontalSun.div(horizontalSunLength);
      const slopeAlongSun = abs(
        projectedSurface.slopeX
          .mul(sunAxis.x)
          .add(projectedSurface.slopeZ.mul(sunAxis.y)),
      );
      const slopeAcrossSun = abs(
        projectedSurface.slopeX
          .mul(sunAxis.y)
          .sub(projectedSurface.slopeZ.mul(sunAxis.x)),
      );
      const surfaceFocus = smoothstep(
        0.01,
        0.48,
        slopeAlongSun.mul(0.65).add(slopeAcrossSun),
      )
        .mul(0.55)
        .add(0.45);
      const distanceFade = float(1).sub(
        smoothstep(
          policy.maxReceiverDistanceMetres * 0.7,
          policy.maxReceiverDistanceMetres,
          receiverDistance,
        ),
      );
      const receiverFacing = smoothstep(
        policy.receiverNormalMinY,
        Math.min(1, policy.receiverNormalMinY + 0.4),
        receiverWorldNormal.y,
      );
      const turbidityTransmittance = exp(
        receiverDepth.mul(underwaterTurbidity).mul(-0.055),
      ).clamp(0, 1);
      const sunAvailability = smoothstep(0.02, 0.2, normalizedSunDirection.y);
      const baseContribution = causticNetwork
        .mul(surfaceFocus)
        .mul(distanceFade)
        .mul(receiverFacing)
        .mul(turbidityTransmittance)
        .mul(sunAvailability)
        .mul(CAUSTIC_PRESENTATION_INTENSITY)
        .mul(receiverMask)
        .clamp(0, 1);
      const diagnostics = baseContribution
        .mul(sunIntensity.clamp(0, 1))
        .clamp(0, 1);
      const radiance = vec3(sunColor)
        .mul(sunIntensity.max(0))
        .mul(baseContribution)
        .mul(0.24)
        .clamp(0, MAX_CAUSTIC_RADIANCE);
      output.assign(vec4(radiance, diagnostics));
    });
    return output;
  })();
  const radianceNode = causticsOutput.rgb;
  const diagnosticsNode = causticsOutput.a;

  const applySnapshot = (snapshot: OpenWaterRuntimeSnapshot): void => {
    underwaterTurbidity.value = snapshot.artisticControls.underwaterTurbidity;
    meanSeaLevelMetres.value = snapshot.seaLevelMetres;
    seedPhase.value = spectralBandPhaseOffset(snapshot.seed);
    primaryOriginPhase.value = originSamplePhase(
      snapshot.originX,
      snapshot.originZ,
      CAUSTIC_PRIMARY_X,
      CAUSTIC_PRIMARY_Z,
    );
    secondaryOriginPhase.value = originSamplePhase(
      snapshot.originX,
      snapshot.originZ,
      CAUSTIC_SECONDARY_X,
      CAUSTIC_SECONDARY_Z,
    );
  };
  const sink: RuntimeStateSink = Object.freeze({
    synchronize(snapshot: OpenWaterRuntimeSnapshot): void {
      applySnapshot(snapshot);
    },
    observe(snapshot: OpenWaterRuntimeSnapshot): void {
      applySnapshot(snapshot);
    },
  });

  return Object.freeze({
    radianceNode,
    diagnosticsNode,
    sink,
    waterline: Object.freeze({
      synchronize(state: WaterlineFrameState): void {
        signedCameraDistance.value = state.signedDistanceMetres;
        meanSeaLevelMetres.value = state.seaLevelMetres;
      },
    }),
    syncCamera(nextCamera: PerspectiveCamera): void {
      nextCamera.updateMatrixWorld();
      projectionMatrixInverse.value.copy(nextCamera.projectionMatrixInverse);
      cameraWorldMatrix.value.copy(nextCamera.matrixWorld);
    },
  });
}
