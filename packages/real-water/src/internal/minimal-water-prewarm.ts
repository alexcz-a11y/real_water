import {
  type BufferGeometry,
  DataTexture,
  Mesh,
  MeshStandardNodeMaterial,
  RenderPipeline,
  SRGBColorSpace,
  type Camera,
  type Renderer,
  type Scene,
} from "three/webgpu";
import { mix, pass, texture, vec3 } from "three/tsl";
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
import type { HostSimulationAdapter } from "../runtime.js";
import {
  clipmapInnerCellMetres,
  createCameraRelativeClipmapGeometry,
  snapClipmapToCamera,
} from "./camera-relative-clipmap.js";
import { HOST_RUNTIME_STATE_BRIDGE } from "./runtime-state-bridge.js";
import { createSpectralBandRendering } from "./spectral-bands-rendering.js";

const HIDDEN_STABILIZATION_FRAME_COUNT = 8;

interface MinimalWaterPrewarmOptions {
  readonly renderer: ThreeHostRenderer;
  readonly scene: ThreeHostScene;
  readonly camera: ThreeHostCamera;
  readonly request: HostPreparationRequest;
  readonly invalidated: Promise<WebGPUDeviceLoss>;
  readonly simulation: HostSimulationAdapter;
}

interface PreparedResources {
  readonly plane: Mesh;
  readonly geometry: BufferGeometry;
  readonly material: MeshStandardNodeMaterial;
  readonly waterTexture: DataTexture;
  readonly pipeline: RenderPipeline;
  readonly scenePass: ReturnType<typeof pass>;
  readonly spectralBand: ReturnType<typeof createSpectralBandRendering>;
}

type PartialPreparedResources = {
  -readonly [Key in keyof PreparedResources]?: PreparedResources[Key];
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
  const camera = options.camera as unknown as Camera;
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
    const waterTexture = createWaterTexture();
    partial.waterTexture = waterTexture;

    throwIfAborted(options.request.signal);
    const scenePass = pass(scene, camera);
    partial.scenePass = scenePass;
    scenePass.renderTarget.texture.name = "Real Water minimal scene color";

    throwIfAborted(options.request.signal);
    const geometry = createCameraRelativeClipmapGeometry(
      geometrySegments.widthSegments,
    );
    partial.geometry = geometry;
    const material = new MeshStandardNodeMaterial();
    partial.material = material;
    material.name = "Real Water minimal material";
    const spectralBand = createSpectralBandRendering(options.simulation);
    partial.spectralBand = spectralBand;
    material.positionNode = spectralBand.positionNode;
    material.normalNode = spectralBand.normalNode;
    const waterColor = texture(waterTexture).mul(
      spectralBand.heightNode.mul(0.08).add(1),
    );
    const whiteDetail = vec3(0.93, 0.96, 0.98);
    const surfaceColor = mix(
      waterColor,
      whiteDetail,
      spectralBand.whiteDetailNode.mul(0.55),
    ).add(vec3(spectralBand.highlightNode).mul(vec3(1, 0.96, 0.82)));
    material.colorNode = surfaceColor;
    material.emissiveNode = surfaceColor.rgb;
    material.roughnessNode = spectralBand.roughnessNode;
    const plane = new Mesh(geometry, material);
    partial.plane = plane;
    plane.name = "Real Water clipmap";
    plane.frustumCulled = false;
    const innerCellMetres = clipmapInnerCellMetres(
      geometrySegments.widthSegments,
    );
    plane.onBeforeRender = (_renderer, _scene, renderCamera) => {
      snapClipmapToCamera(
        renderCamera,
        spectralBand.originX,
        spectralBand.originZ,
        innerCellMetres,
      );
      spectralBand.synchronizeHostState();
    };
    scene.add(plane);

    throwIfAborted(options.request.signal);
    const pipeline = new RenderPipeline(renderer, scenePass);
    partial.pipeline = pipeline;
    renderer.setRenderTarget(null);
    renderer.initTexture(waterTexture);
    await renderer.compileAsync(scene, camera);
    throwIfAborted(options.request.signal);
    pipeline.render();
    await probeCompletedFrame(renderer, scenePass.renderTarget);
    throwIfAborted(options.request.signal);
    await options.request.progress.complete(
      MINIMAL_WATER_PREWARM_DECLARATION_IDS.texture,
    );
    await options.request.progress.complete(
      MINIMAL_WATER_PREWARM_DECLARATION_IDS.renderTarget,
    );
    await options.request.progress.complete(
      MINIMAL_WATER_PREWARM_DECLARATION_IDS.clipmap,
    );
    await options.request.progress.complete(
      MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBandSwell,
    );
    await options.request.progress.complete(
      MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBandWind,
    );
    await options.request.progress.complete(
      MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBandChop,
    );
    await options.request.progress.complete(
      MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBandRipple,
    );
    await options.request.progress.complete(
      MINIMAL_WATER_PREWARM_DECLARATION_IDS.material,
    );
    await options.request.progress.complete(
      MINIMAL_WATER_PREWARM_DECLARATION_IDS.renderRoute,
    );

    throwIfAborted(options.request.signal);
    for (let frame = 0; frame < HIDDEN_STABILIZATION_FRAME_COUNT; frame += 1) {
      pipeline.render();
      throwIfAborted(options.request.signal);
    }
    await options.request.progress.complete(
      MINIMAL_WATER_PREWARM_DECLARATION_IDS.hiddenStabilization,
    );

    await probeCompletedFrame(renderer, scenePass.renderTarget);
    throwIfAborted(options.request.signal);
    await options.request.progress.complete(
      MINIMAL_WATER_PREWARM_DECLARATION_IDS.completionProbe,
    );

    throwIfAborted(options.request.signal);
    pipeline.render();
    await probeCompletedFrame(renderer, scenePass.renderTarget);
    throwIfAborted(options.request.signal);
    await options.request.progress.complete(
      MINIMAL_WATER_PREWARM_DECLARATION_IDS.mainCameraGuard,
    );

    throwIfAborted(options.request.signal);
    restoreCapturedHostState();
    return createPreparedLease(
      scene,
      {
        plane,
        geometry,
        material,
        waterTexture,
        pipeline,
        scenePass,
        spectralBand,
      },
      options.invalidated,
      options.simulation,
    );
  } catch (cause) {
    cleanupPreparation();
    throw cause;
  } finally {
    options.request.signal.removeEventListener("abort", cleanupAfterAbort);
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

async function probeCompletedFrame(
  renderer: Renderer,
  renderTarget: ReturnType<typeof pass>["renderTarget"],
): Promise<void> {
  const x = Math.max(0, Math.floor(renderTarget.width / 2));
  const y = Math.max(0, Math.floor(renderTarget.height / 2));
  const pixels = await renderer.readRenderTargetPixelsAsync(
    renderTarget,
    x,
    y,
    1,
    1,
  );
  if (pixels.length === 0) {
    throw new Error("The minimal-water completion probe returned no pixels.");
  }
}

function createPreparedLease(
  scene: Scene,
  resources: PreparedResources,
  invalidated: Promise<WebGPUDeviceLoss>,
  simulation: HostSimulationAdapter,
): HostPreparedLease {
  let disposal: Promise<void> | undefined;
  return Object.freeze({
    [HOST_RUNTIME_STATE_BRIDGE]: resources.spectralBand.sink,
    invalidated,
    simulation,
    dispose(): Promise<void> {
      disposal ??= Promise.resolve().then(() => {
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
  resources.pipeline.dispose();
  resources.scenePass.dispose();
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
    () => resources.pipeline?.dispose(),
    () => resources.scenePass?.dispose(),
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

interface HostState {
  readonly renderTarget: ReturnType<Renderer["getRenderTarget"]>;
  readonly activeCubeFace: number;
  readonly activeMipmapLevel: number;
  readonly mrt: ReturnType<Renderer["getMRT"]>;
  readonly toneMapping: Renderer["toneMapping"];
  readonly outputColorSpace: Renderer["outputColorSpace"];
  readonly autoClear: boolean;
  readonly transparent: boolean;
  readonly opaque: boolean;
  readonly contextNode: Renderer["contextNode"];
  readonly xrEnabled: boolean;
  readonly sceneName: string;
  readonly sceneOverrideMaterial: Scene["overrideMaterial"];
  readonly cameraLayerMask: number;
}

function captureHostState(
  renderer: Renderer,
  scene: Scene,
  camera: Camera,
): HostState {
  return {
    renderTarget: renderer.getRenderTarget(),
    activeCubeFace: renderer.getActiveCubeFace(),
    activeMipmapLevel: renderer.getActiveMipmapLevel(),
    mrt: renderer.getMRT(),
    toneMapping: renderer.toneMapping,
    outputColorSpace: renderer.outputColorSpace,
    autoClear: renderer.autoClear,
    transparent: renderer.transparent,
    opaque: renderer.opaque,
    contextNode: renderer.contextNode,
    xrEnabled: renderer.xr.enabled,
    sceneName: scene.name,
    sceneOverrideMaterial: scene.overrideMaterial,
    cameraLayerMask: camera.layers.mask,
  };
}

function restoreHostState(
  renderer: Renderer,
  scene: Scene,
  camera: Camera,
  state: HostState,
): void {
  renderer.setRenderTarget(
    state.renderTarget,
    state.activeCubeFace,
    state.activeMipmapLevel,
  );
  renderer.setMRT(state.mrt);
  renderer.toneMapping = state.toneMapping;
  renderer.outputColorSpace = state.outputColorSpace;
  renderer.autoClear = state.autoClear;
  renderer.transparent = state.transparent;
  renderer.opaque = state.opaque;
  renderer.contextNode = state.contextNode;
  renderer.xr.enabled = state.xrEnabled;
  scene.name = state.sceneName;
  scene.overrideMaterial = state.sceneOverrideMaterial;
  camera.layers.mask = state.cameraLayerMask;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Three Host preparation was cancelled.");
  }
}
