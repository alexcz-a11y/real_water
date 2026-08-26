import {
  type BufferGeometry,
  DataTexture,
  DoubleSide,
  type PerspectiveCamera,
  Mesh,
  NoBlending,
  NodeMaterial,
  type Renderer,
  type Scene,
  SRGBColorSpace,
  type Texture,
} from "three/webgpu";
import {
  MINIMAL_WATER_PREWARM_DECLARATION_IDS,
  assertMinimalWaterPrewarmManifest,
} from "../manifest.js";
import { getMinimalWaterGeometrySegments } from "../quality-profile.js";
import type {
  HostPreparedLease,
  HostPreparationRequest,
  WebGPUDeviceLoss,
} from "../startup.js";
import type {
  ThreeHostCamera,
  ThreeHostRenderer,
  ThreeHostScene,
} from "../three-host.js";
import type { HostEnvironmentAdapter } from "../environment.js";
import {
  assertHostEnvironmentMatchesManifest,
  readHostEnvironmentSnapshot,
} from "../environment.js";
import {
  createStormFrontController,
  type StormFrontController,
} from "../storm-front.js";
import {
  readHostSimulationState,
  type HostSimulationAdapter,
  type OpenWaterRuntimeSnapshot,
  type RuntimeStateSink,
} from "../runtime.js";
import {
  readHostPresentationState,
  type HostPresentationAdapter,
} from "../presentation.js";
import { createWaterPreset } from "../water-preset.js";
import { HOST_RUNTIME_STATE_BRIDGE } from "./runtime-state-bridge.js";
import { HOST_PRESENTATION_ROUTE_BRIDGE } from "./presentation-route-bridge.js";
import {
  clipmapInnerCellMetres,
  createCameraRelativeClipmapGeometry,
} from "./camera-relative-clipmap.js";
import { createWaterOpticsRendering } from "./water-optics-rendering.js";
import { createSpectralBandRendering } from "./spectral-bands-rendering.js";
import {
  createUnifiedFoamField,
  type UnifiedFoamField,
} from "./spectral-whitecap-field.js";
import {
  createSecondaryParticleContributionQuantizer,
  createSecondaryParticlePool,
  type SecondaryParticlePool,
} from "../secondary-particle-pool.js";
import {
  createSecondarySprayAllocationParticipant,
  createSecondarySprayParticles,
  type SecondarySprayParticles,
} from "./secondary-spray-particles.js";
import { createUnderwaterSecondaryParticleAllocationParticipants } from "./underwater-secondary-particles.js";
import type { LocalInteractionRenderSnapshot } from "./local-interaction.js";
import {
  createSecondaryParticleAllocationRoute,
  type SecondaryParticleAllocationRoute,
} from "../secondary-particle-allocation-route.js";
import {
  createInitialWaterlineSampleState,
  createWaterlineStateController,
} from "./waterline-state.js";
import {
  captureHostState,
  compileAndPrimePreparedWaterPresentation,
  createPreparedWaterPresentationResources,
  createPresentationRouteBridge,
  disposePartialPreparedWaterPresentationResources,
  disposePreparedWaterPresentationResources,
  probePreparedCompletion,
  readDrawingBufferSize,
  renderHiddenStabilizationFrames,
  renderMainCameraGuard,
  restoreHostState,
  type PartialPreparedWaterPresentationResources,
  type PreparedWaterPresentationResources,
} from "./prepared-water-presentation.js";

interface MinimalWaterPrewarmOptions {
  readonly renderer: ThreeHostRenderer;
  readonly scene: ThreeHostScene;
  readonly camera: ThreeHostCamera;
  readonly request: HostPreparationRequest;
  readonly invalidated: Promise<WebGPUDeviceLoss>;
  readonly simulation: HostSimulationAdapter;
  readonly environment: HostEnvironmentAdapter;
  readonly presentation: HostPresentationAdapter;
}

interface PreparedResources {
  readonly plane: Mesh;
  readonly geometry: BufferGeometry;
  readonly material: NodeMaterial;
  readonly waterTexture: DataTexture;
  readonly foamField: UnifiedFoamField;
  readonly secondaryParticlePool: SecondaryParticlePool;
  readonly secondaryParticleAllocationRoute: SecondaryParticleAllocationRoute;
  readonly stormFront: StormFrontController;
  readonly spectralBand: ReturnType<typeof createSpectralBandRendering>;
  readonly opticalPath: ReturnType<typeof createWaterOpticsRendering>;
  readonly waterline: ReturnType<typeof createWaterlineStateController>;
  readonly presentation: PreparedWaterPresentationResources;
}

type PartialPreparedResources = {
  -readonly [
    Key in keyof Omit<PreparedResources, "presentation">
  ]?: PreparedResources[Key];
} & {
  presentation?: PreparedWaterPresentationResources;
  presentationPartial?: PartialPreparedWaterPresentationResources;
  secondarySpray?: SecondarySprayParticles;
};

export async function prepareMinimalWaterPlane(
  options: MinimalWaterPrewarmOptions,
): Promise<HostPreparedLease> {
  assertMinimalWaterPrewarmManifest(options.request.manifest);
  const geometrySegments = getMinimalWaterGeometrySegments(
    options.request.manifest.qualityProfile,
  );

  const renderer = options.renderer as unknown as Renderer;
  const scene = options.scene as unknown as Scene;
  const camera = options.camera as unknown as PerspectiveCamera;
  const state = captureHostState(renderer, scene, camera);
  const partial: PartialPreparedResources = {};
  let resourcesDisposed = false;
  let hostStateRestored = false;

  const restoreCapturedHostState = (): void => {
    if (hostStateRestored) {
      return;
    }
    restoreHostState(renderer, scene, camera, state);
    hostStateRestored = true;
  };
  const cleanupPreparation = (): void => {
    if (!resourcesDisposed) {
      resourcesDisposed = true;
      disposePartialResourcesSilently(scene, partial);
    }
    try {
      restoreCapturedHostState();
    } catch {
      // Preserve the authoritative preparation or abort failure.
    }
  };
  const cleanupImmediatelyAfterDeviceLossAbort = (): void => {
    const reason: unknown = options.request.signal.reason;
    // The Three Host device-loss race returns before its pending preparation,
    // so a lost device keeps the prompt cleanup path. A live-device cancel
    // instead reaches the catch below after the current async GPU call settles.
    if (isDeviceLossAbortReason(reason)) {
      cleanupPreparation();
    }
  };
  if (options.request.signal.aborted) {
    cleanupImmediatelyAfterDeviceLossAbort();
  } else {
    options.request.signal.addEventListener(
      "abort",
      cleanupImmediatelyAfterDeviceLossAbort,
      { once: true },
    );
  }

  try {
    throwIfAborted(options.request.signal);
    const declaredDrawingBuffer = options.request.manifest.drawingBuffer;
    const actualDrawingBuffer = readDrawingBufferSize(renderer);
    if (
      actualDrawingBuffer.width !== declaredDrawingBuffer.width ||
      actualDrawingBuffer.height !== declaredDrawingBuffer.height
    ) {
      throw new Error(
        "The Three Host drawing buffer does not match the Prewarm Manifest.",
      );
    }
    assertHostEnvironmentMatchesManifest(
      options.environment,
      options.request.manifest,
    );
    const environmentRadiance = requireHostTexture(
      options.environment.texture,
      "environment radiance",
    );
    const preparationSnapshot = createPreparationFoamSnapshot(
      options.simulation,
      options.presentation,
    );
    const stormFront = createStormFrontController(() =>
      readHostEnvironmentSnapshot(options.environment),
    );
    stormFront.synchronize(preparationSnapshot);
    partial.stormFront = stormFront;
    const secondaryParticlePolicy =
      options.request.manifest.qualityProfile.secondaryParticles;
    const secondaryParticlePool = createSecondaryParticlePool({
      capacity: secondaryParticlePolicy.capacity,
      contribution: {
        projectedAreaReference: "output-drawing-buffer",
        referenceWidth: declaredDrawingBuffer.width,
        referenceHeight: declaredDrawingBuffer.height,
        screenAreaDivisor:
          secondaryParticlePolicy.contribution.screenAreaDivisor,
        quantization: secondaryParticlePolicy.contribution.quantization,
      },
      hysteresis: secondaryParticlePolicy.hysteresis,
      consumers: secondaryParticlePolicy.consumers.map((consumer) => ({
        consumerId: consumer.consumerId,
        contributionReference: {
          width: declaredDrawingBuffer.width,
          height: declaredDrawingBuffer.height,
          space: "output-drawing-buffer" as const,
        },
        maximumRequestCount: consumer.maximumRequestCount,
        minimumRetainedSlots: consumer.minimumRetainedSlots,
        softRequestCeiling: consumer.softRequestCeiling,
        pressureReentryPolicy: consumer.pressureReentryPolicy,
      })),
    });
    partial.secondaryParticlePool = secondaryParticlePool;
    const contributionReference = Object.freeze({
      width: declaredDrawingBuffer.width,
      height: declaredDrawingBuffer.height,
      space: "output-drawing-buffer" as const,
    });
    const secondarySpray = createSecondarySprayParticles({
      contributionReference,
      contributionQuantizer: createSecondaryParticleContributionQuantizer({
        projectedAreaResolution: declaredDrawingBuffer,
        referenceResolution: declaredDrawingBuffer,
      }),
      stormFront,
    });
    partial.secondarySpray = secondarySpray;
    const waterTexture = createWaterTexture();
    partial.waterTexture = waterTexture;
    const foamField = createUnifiedFoamField(
      options.request.manifest.qualityProfile.whitecaps,
    );
    partial.foamField = foamField;
    const waterline = createWaterlineStateController();
    partial.waterline = waterline;
    const initialWaterline = waterline.commit(
      waterline.preview(
        camera,
        createInitialWaterlineSampleState(
          preparationSnapshot,
          preparationSnapshot.artisticControls,
        ),
      ),
    );

    throwIfAborted(options.request.signal);
    const geometry = createCameraRelativeClipmapGeometry(
      geometrySegments.widthSegments,
    );
    partial.geometry = geometry;
    const innerCellMetres = clipmapInnerCellMetres(
      geometrySegments.widthSegments,
    );
    const spectralBand = createSpectralBandRendering(
      options.simulation,
      options.presentation,
      innerCellMetres,
      foamField,
      stormFront,
    );
    partial.spectralBand = spectralBand;

    throwIfAborted(options.request.signal);
    const createdPresentation = createPreparedWaterPresentationResources(
      renderer,
      scene,
      camera,
      declaredDrawingBuffer,
      foamField,
      secondaryParticlePool,
      secondaryParticlePolicy,
      secondarySpray,
      stormFront,
      options.request.manifest.qualityProfile.postTraaComposition,
      options.environment,
      options.request.manifest.qualityProfile.underwater,
      spectralBand.surfaceSampler,
      preparationSnapshot,
      initialWaterline,
    );
    partial.presentation = createdPresentation.resources;
    partial.presentationPartial = createdPresentation.partial;
    const secondaryParticleAllocationRoute =
      createSecondaryParticleAllocationRoute({
        pool: secondaryParticlePool,
        participants: [
          createSecondarySprayAllocationParticipant(secondarySpray, camera),
          ...createUnderwaterSecondaryParticleAllocationParticipants(
            createdPresentation.resources.underwaterParticles,
            camera,
          ),
        ],
      });
    partial.secondaryParticleAllocationRoute = secondaryParticleAllocationRoute;
    secondaryParticleAllocationRoute.advance(
      preparationSnapshot,
      createPreparationLocalInteraction(preparationSnapshot),
    );
    const material = new NodeMaterial();
    partial.material = material;
    material.name = "Real Water minimal material";
    material.lights = false;
    material.fog = false;
    const opticalPath = createWaterOpticsRendering(
      spectralBand,
      options.environment,
      stormFront,
      waterTexture,
      {
        texture: createdPresentation.resources.planar.target.texture,
        viewProjection: createdPresentation.resources.planar.viewProjection,
        hasOutput: createdPresentation.resources.planar.hasOutput,
      },
      initialWaterline,
    );
    partial.opticalPath = opticalPath;
    material.positionNode = spectralBand.positionNode;
    material.normalNode = spectralBand.normalNode;
    material.colorNode = opticalPath.colorNode;
    material.mrtNode = opticalPath.mrtNode;
    material.transparent = true;
    material.blending = NoBlending;
    material.side = DoubleSide;
    const plane = new Mesh(geometry, material);
    partial.plane = plane;
    plane.name = "Real Water clipmap";
    plane.frustumCulled = false;
    createdPresentation.resources.planar.bindWaterMesh(plane);
    scene.add(plane);

    throwIfAborted(options.request.signal);
    renderer.setRenderTarget(null);
    renderer.initTexture(waterTexture);
    renderer.initTexture(environmentRadiance);
    renderer.initTexture(createdPresentation.resources.planar.target.texture);
    await foamField.prewarm(renderer, preparationSnapshot);
    await completeDeclaredWork(options.request.progress, [
      "whitecapFieldA",
      "whitecapFieldB",
      "whitecapResetRoute",
      "whitecapGenerationRoute",
      "whitecapHistory",
      "whitecapAdvectionRoute",
      "whitecapDiffusionRoute",
      "whitecapDecayRoute",
      "foamLocalFieldA",
      "foamLocalFieldB",
      "underwaterCausticsLocalSurfaceField",
      "foamSourceHistory",
      "foamLocalAdvectionRoute",
      "foamLocalResolveRoute",
    ]);
    const stagedPrewarmInteraction =
      spectralBand.stagePrewarmLocalInteractionRoutes();
    const heroBreakerCanarySnapshot =
      createHeroBreakerCanarySnapshot(preparationSnapshot);
    spectralBand.sink.synchronize(
      heroBreakerCanarySnapshot,
      stagedPrewarmInteraction,
    );
    secondaryParticleAllocationRoute.advance(
      heroBreakerCanarySnapshot,
      stagedPrewarmInteraction,
    );
    try {
      await foamField.synchronize(renderer, heroBreakerCanarySnapshot);
      await compileAndPrimePreparedWaterPresentation(
        renderer,
        scene,
        camera,
        createdPresentation.resources,
        options.request.signal,
      );
    } finally {
      spectralBand.clearPrewarmLocalInteractionRoutes();
      const clearedPrewarmInteraction =
        createPreparationLocalInteraction(preparationSnapshot);
      spectralBand.sink.synchronize(
        preparationSnapshot,
        clearedPrewarmInteraction,
      );
      secondaryParticleAllocationRoute.advance(
        preparationSnapshot,
        clearedPrewarmInteraction,
      );
      await foamField.synchronize(renderer, preparationSnapshot);
    }
    await completeDeclaredWork(options.request.progress, [
      "texture",
      "environmentRadiance",
      "sceneColor",
      "sceneDepth",
      "renderTarget",
      "clipmap",
      "localInteractionField",
      "localInteractionBuffers",
      "localInteractionRadialImpactRoute",
      "localInteractionDirectionalWakeRoute",
      "heroBreakerState",
      "heroBreakerDeformationRoute",
      "heroBreakerFoamRoute",
      "heroBreakerSprayRoute",
      "heroBreakerFoamDiagnosticsTarget",
      "heroBreakerFoamDiagnosticsRoute",
      "stormFrontState",
      "bodySocketEmissionRoute",
      "spectralBandSwell",
      "spectralBandWind",
      "spectralBandChop",
      "spectralBandRipple",
      "stormRainRippleRoute",
      "whitecapStageTarget",
      "whitecapStageRoute",
      "foamSourceIdentityTarget",
      "foamSourceIdentityRoute",
      "material",
      "opticalRoute",
      "stormCloudShadowRoute",
      "stormLightningRoute",
      "waterlineState",
      "undersideOpticalRoute",
      "waterlineHistoryResetRoute",
      "lensWetnessTransition",
      "planarReflectionTarget",
      "planarReflectionRoute",
      "planarEnvironmentFallback",
      "planarReflectionProbe",
      "ssrRawTarget",
      "ssrCompositeTarget",
      "ssrRoute",
      "ssrCompositeRoute",
      "underwaterVolumeTarget",
      "underwaterVolumeRoute",
      "underwaterDepthCompositionRoute",
      "underwaterSunShaftShadowRoute",
      "underwaterDiagnosticsTarget",
      "underwaterDiagnosticsRoute",
      "underwaterCausticsReceiverRoute",
      "underwaterCausticsDiagnosticsTarget",
      "underwaterCausticsDiagnosticsRoute",
      "underwaterParticleCandidateState",
      "underwaterParticleAllocationRoutes",
      "underwaterSuspendedParticleTarget",
      "underwaterSuspendedParticleRoute",
      "underwaterBubbleTarget",
      "underwaterBubbleRoute",
      "underwaterTracerCompositeTarget",
      "underwaterTracerCompositeRoute",
      "renderRoute",
      "proceduralMotion",
      "motionVectors",
      "inverseLinearDepth",
      "viewNormal",
      "opticalFactorsTarget",
      "historyRejectionTarget",
      "historyRejectionRoute",
      "opticalDiagnosticsA",
      "opticalDiagnosticsB",
      "finalColorTarget",
      "currentColorTarget",
      "stockTraaHistory",
      "traaResolveJitter",
      "traaResetRoute",
      "secondaryParticlePool",
      "secondaryParticleAllocationRoute",
      "postTraaCompositionPlan",
      "traaResolvedTarget",
      "secondaryParticleAccumulationTarget",
      "secondaryParticleCompositeTarget",
      "secondaryParticleStageRoute",
      "secondaryParticleCompositeRoute",
      "secondaryParticleDiagnosticsRoute",
      "stormRainSprayRoute",
      "stormAerosolRoute",
      "stormAtmosphereTarget",
      "stormAtmosphereStageRoute",
      "stormDiagnosticsTarget",
      "stormDiagnosticsRoute",
      "lensWetnessDiagnosticsTarget",
      "lensWetnessStageRoute",
      "lensWetnessDiagnosticsRoute",
      "currentColorConversion",
      "namedOutputRoutes",
    ]);

    renderHiddenStabilizationFrames(
      renderer,
      scene,
      camera,
      createdPresentation.resources,
      options.request.signal,
      true,
    );
    await completeDeclaredWork(options.request.progress, [
      "ssrBlurTarget",
      "ssrBlurCopyRoute",
      "ssrBlurRoute",
      "ssrProbe",
      "hiddenStabilization",
    ]);

    await probePreparedCompletion(
      renderer,
      createdPresentation.resources,
      options.request.signal,
    );
    await completeDeclaredWork(options.request.progress, [
      "ssrHistoryTarget",
      "ssrHistoryResolveTarget",
      "ssrHistoryBeautyTarget",
      "ssrHistoryBeautyRoute",
      "ssrHistoryResolvedCaptureTarget",
      "ssrHistoryResolvedCopyRoute",
      "ssrHistoryPreviousDepth",
      "ssrHistoryPreviousNormal",
      "ssrHistorySeedRoute",
      "ssrHistoryResolveRoute",
      "ssrHistoryAccumulateRoute",
      "ssrHistoryResetRoute",
      "ssrHistoryResetVelocityTarget",
      "ssrHistoryResetVelocityRoute",
      "ssrHistoryProbe",
      "underwaterProbe",
      "underwaterCausticsProbe",
      "underwaterTracerProbe",
      "whitecapProbe",
      "foamSourceIdentityProbe",
      "secondaryParticleProbe",
      "lensWetnessProbe",
      "stormProbe",
      "heroBreakerFoamProbe",
      "completionProbe",
    ]);

    await renderMainCameraGuard(
      renderer,
      scene,
      camera,
      createdPresentation.resources,
      options.request.signal,
    );
    await completeDeclaredWork(options.request.progress, ["mainCameraGuard"]);

    throwIfAborted(options.request.signal);
    restoreCapturedHostState();
    return createPreparedLease(
      scene,
      renderer,
      camera,
      {
        plane,
        geometry,
        material,
        waterTexture,
        foamField,
        secondaryParticlePool,
        secondaryParticleAllocationRoute,
        stormFront,
        spectralBand,
        opticalPath,
        waterline,
        presentation: createdPresentation.resources,
      },
      options.invalidated,
      options.simulation,
      options.presentation,
      declaredDrawingBuffer,
      options.request.manifest.manifestHash,
    );
  } catch (cause) {
    cleanupPreparation();
    throw cause;
  } finally {
    options.request.signal.removeEventListener(
      "abort",
      cleanupImmediatelyAfterDeviceLossAbort,
    );
  }
}

async function completeDeclaredWork(
  progress: HostPreparationRequest["progress"],
  keys: readonly (keyof typeof MINIMAL_WATER_PREWARM_DECLARATION_IDS)[],
): Promise<void> {
  for (const key of keys) {
    await progress.complete(MINIMAL_WATER_PREWARM_DECLARATION_IDS[key]);
  }
}

function createWaterTexture(): DataTexture {
  const waterTexture = new DataTexture(
    Uint8Array.from([
      8, 68, 92, 255, 12, 92, 120, 255, 18, 112, 140, 255, 10, 78, 108, 255,
    ]),
    2,
    2,
  );
  waterTexture.name = "Real Water minimal texture";
  waterTexture.colorSpace = SRGBColorSpace;
  waterTexture.needsUpdate = true;
  return waterTexture;
}

function requireHostTexture(
  value: HostEnvironmentAdapter["texture"],
  label: string,
): Texture {
  if (value === null || value.isTexture !== true) {
    throw new TypeError(
      `The Host ${label} must be a Host-owned Three texture.`,
    );
  }
  return value as unknown as Texture;
}

function createPreparedLease(
  scene: Scene,
  renderer: Renderer,
  camera: PerspectiveCamera,
  resources: PreparedResources,
  invalidated: Promise<WebGPUDeviceLoss>,
  simulation: HostSimulationAdapter,
  presentation: HostPresentationAdapter,
  drawingBuffer: Readonly<{ width: number; height: number }>,
  manifestHash: string,
): HostPreparedLease {
  const leasePreparationSnapshot = createPreparationFoamSnapshot(
    simulation,
    presentation,
  );
  let secondaryParticleInteraction = createPreparationLocalInteraction(
    leasePreparationSnapshot,
  );
  const waterlineComposition = Object.freeze({
    synchronize(
      state: Parameters<typeof resources.opticalPath.waterline.synchronize>[0],
    ): void {
      resources.opticalPath.waterline.synchronize(state);
      resources.presentation.underwater.waterline.synchronize(state);
    },
  });
  const runtimeSink: RuntimeStateSink = Object.freeze({
    synchronize(
      snapshot: Parameters<RuntimeStateSink["synchronize"]>[0],
      interaction: Parameters<RuntimeStateSink["synchronize"]>[1],
    ): void {
      resources.opticalPath.sink.synchronize(snapshot, interaction);
      resources.presentation.underwater.sink.synchronize(snapshot, interaction);
      secondaryParticleInteraction = interaction;
      resources.secondaryParticleAllocationRoute.advance(snapshot, interaction);
    },
    observe(snapshot: OpenWaterRuntimeSnapshot): void {
      resources.opticalPath.sink.observe?.(snapshot);
      resources.presentation.underwater.sink.observe?.(snapshot);
      resources.secondaryParticleAllocationRoute.advance(
        snapshot,
        secondaryParticleInteraction,
      );
    },
  });
  const presentationRoute = createPresentationRouteBridge(
    renderer,
    scene,
    camera,
    resources.presentation,
    resources.waterline,
    waterlineComposition,
    drawingBuffer,
    manifestHash,
  );
  let disposal: Promise<void> | undefined;
  return Object.freeze({
    [HOST_RUNTIME_STATE_BRIDGE]: runtimeSink,
    [HOST_PRESENTATION_ROUTE_BRIDGE]: presentationRoute,
    invalidated,
    simulation,
    presentation,
    dispose(): Promise<void> {
      presentationRoute.unbind();
      disposal ??= Promise.resolve().then(async () => {
        await presentationRoute.drain();
        disposePreparedResources(scene, resources);
      });
      return disposal;
    },
  });
}

function disposePreparedResources(
  scene: Scene,
  resources: PreparedResources,
): void {
  scene.remove(resources.plane);
  disposePreparedWaterPresentationResources(resources.presentation);
  resources.material.dispose();
  resources.geometry.dispose();
  resources.waterTexture.dispose();
  resources.foamField.dispose();
}

function disposePartialResourcesSilently(
  scene: Scene,
  resources: PartialPreparedResources,
): void {
  const disposals = [
    () => {
      if (resources.plane !== undefined) {
        scene.remove(resources.plane);
      }
    },
    () => {
      if (resources.presentation !== undefined) {
        disposePreparedWaterPresentationResources(resources.presentation);
        return;
      }
      if (resources.presentationPartial !== undefined) {
        disposePartialPreparedWaterPresentationResources(
          resources.presentationPartial,
        );
      }
    },
    () => resources.material?.dispose(),
    () => resources.geometry?.dispose(),
    () => resources.waterTexture?.dispose(),
    () => resources.foamField?.dispose(),
    () => resources.secondarySpray?.dispose(),
  ];
  for (const dispose of disposals) {
    try {
      dispose();
    } catch {
      // Startup continues to reject with the primary preparation failure.
    }
  }
}

function createPreparationFoamSnapshot(
  simulation: HostSimulationAdapter,
  presentation: HostPresentationAdapter,
): OpenWaterRuntimeSnapshot {
  const state = readHostSimulationState(simulation);
  return Object.freeze({
    ...state,
    artisticControls: createWaterPreset("swell").artisticControls,
    controlRevision: 0,
    originRevision: 0,
    seaStateCutRevision: 0,
    cameraCutRevision:
      readHostPresentationState(presentation).cameraCutRevision,
    interactionAnchor: Object.freeze({ x: 0, z: 0 }),
    interactionAnchorRevision: 0,
    activeDisturbanceCount: 0,
    activeHeroBreakerCount: 0,
    // Prewarm runs before any Host body is attached, so the Body coupling
    // counts #25 added are zero for the same reason the disturbance count is.
    attachedBodyCount: 0,
    activeBodyWakeCount: 0,
  });
}

function createPreparationLocalInteraction(
  snapshot: OpenWaterRuntimeSnapshot,
): LocalInteractionRenderSnapshot {
  return Object.freeze({
    revision: 0,
    anchorX: snapshot.interactionAnchor.x,
    anchorZ: snapshot.interactionAnchor.z,
    impacts: Object.freeze([]),
  });
}

function createHeroBreakerCanarySnapshot(
  snapshot: OpenWaterRuntimeSnapshot,
): OpenWaterRuntimeSnapshot {
  return Object.freeze({
    ...snapshot,
    activeHeroBreakerCount: 1,
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Three Host preparation was cancelled.");
  }
}

function isDeviceLossAbortReason(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === "WEBGPU_DEVICE_LOST"
  );
}
