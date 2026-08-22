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
import { assertHostEnvironmentMatchesManifest } from "../environment.js";
import {
  readHostSimulationState,
  type HostSimulationAdapter,
} from "../runtime.js";
import type { HostPresentationAdapter } from "../presentation.js";
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
  const cleanupAfterAbort = (): void => {
    cleanupPreparation();
  };
  if (options.request.signal.aborted) {
    cleanupAfterAbort();
  } else {
    options.request.signal.addEventListener("abort", cleanupAfterAbort, {
      once: true,
    });
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
    const waterTexture = createWaterTexture();
    partial.waterTexture = waterTexture;
    const waterline = createWaterlineStateController();
    partial.waterline = waterline;
    const initialWaterline = waterline.commit(
      waterline.preview(
        camera,
        createInitialWaterlineSampleState(
          readHostSimulationState(options.simulation),
          createWaterPreset("swell").artisticControls,
        ),
      ),
    );

    throwIfAborted(options.request.signal);
    const createdPresentation = createPreparedWaterPresentationResources(
      renderer,
      scene,
      camera,
      declaredDrawingBuffer,
      initialWaterline,
    );
    partial.presentation = createdPresentation.resources;
    partial.presentationPartial = createdPresentation.partial;

    throwIfAborted(options.request.signal);
    const geometry = createCameraRelativeClipmapGeometry(
      geometrySegments.widthSegments,
    );
    partial.geometry = geometry;
    const material = new NodeMaterial();
    partial.material = material;
    material.name = "Real Water minimal material";
    material.lights = false;
    material.fog = false;
    const innerCellMetres = clipmapInnerCellMetres(
      geometrySegments.widthSegments,
    );
    const spectralBand = createSpectralBandRendering(
      options.simulation,
      options.presentation,
      innerCellMetres,
    );
    partial.spectralBand = spectralBand;
    const opticalPath = createWaterOpticsRendering(
      spectralBand,
      options.environment,
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
    await compileAndPrimePreparedWaterPresentation(
      renderer,
      scene,
      camera,
      createdPresentation.resources,
      options.request.signal,
    );
    await completeDeclaredWork(options.request.progress, [
      "texture",
      "environmentRadiance",
      "sceneColor",
      "sceneDepth",
      "renderTarget",
      "clipmap",
      "spectralBandSwell",
      "spectralBandWind",
      "spectralBandChop",
      "spectralBandRipple",
      "material",
      "opticalRoute",
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
      "renderRoute",
      "proceduralMotion",
      "motionVectors",
      "inverseLinearDepth",
      "viewNormal",
      "opticalFactorsTarget",
      "opticalDiagnosticsA",
      "opticalDiagnosticsB",
      "finalColorTarget",
      "currentColorTarget",
      "stockTraaHistory",
      "traaResolveJitter",
      "traaResetRoute",
      "currentColorConversion",
      "namedOutputRoutes",
    ]);

    renderHiddenStabilizationFrames(
      renderer,
      scene,
      camera,
      createdPresentation.resources,
      options.request.signal,
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
    options.request.signal.removeEventListener("abort", cleanupAfterAbort);
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
  const presentationRoute = createPresentationRouteBridge(
    renderer,
    scene,
    camera,
    resources.presentation,
    resources.waterline,
    resources.opticalPath.waterline,
    drawingBuffer,
    manifestHash,
  );
  let disposal: Promise<void> | undefined;
  return Object.freeze({
    [HOST_RUNTIME_STATE_BRIDGE]: resources.opticalPath.sink,
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
  ];
  for (const dispose of disposals) {
    try {
      dispose();
    } catch {
      // Startup continues to reject with the primary preparation failure.
    }
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Three Host preparation was cancelled.");
  }
}
