import {
  Color,
  DataUtils,
  HalfFloatType,
  LinearSRGBColorSpace,
  type Matrix4,
  RGBAFormat,
  RGFormat,
  RenderPipeline,
  RenderTarget,
  UnsignedByteType,
  Vector2,
  type PerspectiveCamera,
  type Renderer,
  type Scene,
} from "three/webgpu";
import {
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  texture,
  vec4,
  velocity,
} from "three/tsl";
import { traa } from "three/addons/tsl/display/TRAANode.js";
import {
  DIAGNOSTICS_CAPTURE_SHAPES,
  readHostDiagnosticsPresentRequest,
  type DiagnosticsCapture,
  type DiagnosticsCaptureName,
  type DiagnosticsMotionVectorCapture,
  type DiagnosticsOpticalScalarCapture,
  type DiagnosticsSsrRoughnessCapture,
  type DiagnosticsWhitecapStageCapture,
  type HostDiagnosticsPresentRequest,
  type HostDiagnosticsPresentedFrame,
  type HostDiagnosticsRoute,
} from "../diagnostics.js";
import type {
  HostPresentationRoute,
  HostPresentedFrame,
  HostTemporalResetReason,
} from "../presentation.js";
import type { OpenWaterRuntimeSnapshot } from "../runtime.js";
import { unpackPackedViewNormalRgb } from "../ssr.js";
import { installHostDiagnosticsRoute } from "./diagnostics-route-bridge.js";
import type { HostPresentationRouteBridge } from "./presentation-route-bridge.js";
import {
  createResettableVelocityTextureNode,
  createTraaJitterAdapter,
  createTraaResetUniform,
  type TraaJitterAdapter,
} from "./traa-r185.js";
import {
  createPlanarReflectionPass,
  type PlanarReflectionPass,
} from "./reflection-stack.js";
import {
  MOTION_VECTORS_ATTACHMENT,
  OPTICAL_DIAGNOSTICS_A_ATTACHMENT,
  OPTICAL_DIAGNOSTICS_B_ATTACHMENT,
  OPTICAL_FACTORS_ATTACHMENT,
  VIEW_NORMAL_ATTACHMENT,
} from "./water-optics-rendering.js";
import { assertRendererCopyTextureToTexture } from "./ssr-temporal-reproject.js";
import {
  assertCurrentFrameSsrPreparedSize,
  createCurrentFrameSsrStack,
  disposeCurrentFrameSsrStack,
  renderCurrentFrameSsr,
  renderCurrentFrameSsrHistory,
  type CurrentFrameSsrStack,
} from "./ssr-stack.js";
import {
  createSpectralWhitecapDiagnostics,
  type SpectralWhitecapDiagnostics,
} from "./spectral-whitecap-diagnostics.js";
import type { SpectralWhitecapField } from "./spectral-whitecap-field.js";

export const PREWARM_HISTORY_EPOCH = 1;
export const HIDDEN_STABILIZATION_FRAME_COUNT = 8;

const CORE_WEBGPU_MAX_COLOR_ATTACHMENT_BYTES_PER_SAMPLE = 32;
const CORE_SCENE_PASS_COLOR_ATTACHMENT_FORMATS = [
  "rgba16float",
  "rgba16float",
  "rg16float",
  "rgba16float",
  "rg8unorm",
  "rg8unorm",
] as const;

export interface PresentationReadinessCounters {
  compileCount: number;
  probeCount: number;
  diagnosticReadbackCount: number;
  sceneRenderCount: number;
}

export interface PreparedWaterPresentationResources {
  readonly presentationPipeline: RenderPipeline;
  readonly currentColorPipeline: RenderPipeline;
  readonly temporalPipeline: RenderPipeline;
  readonly traaNode: ReturnType<typeof traa>;
  readonly jitterAdapter: TraaJitterAdapter;
  readonly resetUniform: ReturnType<typeof createTraaResetUniform>;
  readonly currentColorTarget: RenderTarget;
  readonly finalColorTarget: RenderTarget;
  readonly scenePass: ReturnType<typeof pass>;
  readonly ssr: CurrentFrameSsrStack;
  readonly whitecapField: SpectralWhitecapField;
  readonly whitecapDiagnostics: SpectralWhitecapDiagnostics;
  readonly inverseLinearDepthTextureIndex: number;
  readonly viewNormalTextureIndex: number;
  readonly motionVectorsTextureIndex: number;
  readonly opticalFactorsTextureIndex: number;
  readonly opticalDiagnosticsATextureIndex: number;
  readonly opticalDiagnosticsBTextureIndex: number;
  readonly planar: PlanarReflectionPass;
  readonly width: number;
  readonly height: number;
  readonly counters: PresentationReadinessCounters;
}

export type PartialPreparedWaterPresentationResources = {
  -readonly [
    Key in keyof PreparedWaterPresentationResources
  ]?: PreparedWaterPresentationResources[Key];
};

export function createPreparedWaterPresentationResources(
  renderer: Renderer,
  scene: Scene,
  camera: PerspectiveCamera,
  drawingBuffer: Readonly<{ width: number; height: number }>,
  whitecapField: SpectralWhitecapField,
): {
  readonly resources: PreparedWaterPresentationResources;
  readonly partial: PartialPreparedWaterPresentationResources;
} {
  const partial: PartialPreparedWaterPresentationResources = {};
  try {
    return constructPreparedWaterPresentationResources(
      renderer,
      scene,
      camera,
      drawingBuffer,
      whitecapField,
      partial,
    );
  } catch (error) {
    disposePartialPreparedWaterPresentationResources(partial);
    throw error;
  }
}

function constructPreparedWaterPresentationResources(
  renderer: Renderer,
  scene: Scene,
  camera: PerspectiveCamera,
  drawingBuffer: Readonly<{ width: number; height: number }>,
  whitecapField: SpectralWhitecapField,
  partial: PartialPreparedWaterPresentationResources,
): {
  readonly resources: PreparedWaterPresentationResources;
  readonly partial: PartialPreparedWaterPresentationResources;
} {
  assertRendererCopyTextureToTexture(renderer);
  const counters: PresentationReadinessCounters = {
    compileCount: 0,
    probeCount: 0,
    diagnosticReadbackCount: 0,
    sceneRenderCount: 0,
  };
  const scenePass = pass(scene, camera, { samples: 0 });
  partial.scenePass = scenePass;
  scenePass.updateBeforeType = "render";
  scenePass.setResolutionScale(1);
  scenePass.setSize(drawingBuffer.width, drawingBuffer.height);
  scenePass.setMRT(
    mrt({
      output,
      [VIEW_NORMAL_ATTACHMENT]: vec4(packNormalToRGB(normalView), 1),
      [MOTION_VECTORS_ATTACHMENT]: velocity,
      [OPTICAL_FACTORS_ATTACHMENT]: vec4(0, 0, 0, 1),
      [OPTICAL_DIAGNOSTICS_A_ATTACHMENT]: vec4(0, 0, 0, 1),
      [OPTICAL_DIAGNOSTICS_B_ATTACHMENT]: vec4(0, 0, 0, 1),
    }),
  );
  const outputTexture = scenePass.getTexture("output");
  outputTexture.format = RGBAFormat;
  outputTexture.type = HalfFloatType;
  const viewNormalTexture = scenePass.getTexture(VIEW_NORMAL_ATTACHMENT);
  viewNormalTexture.format = RGBAFormat;
  viewNormalTexture.type = HalfFloatType;
  const motionVectorsTexture = scenePass.getTexture(MOTION_VECTORS_ATTACHMENT);
  motionVectorsTexture.format = RGFormat;
  motionVectorsTexture.type = HalfFloatType;
  const opticalFactorsTexture = scenePass.getTexture(
    OPTICAL_FACTORS_ATTACHMENT,
  );
  opticalFactorsTexture.format = RGBAFormat;
  opticalFactorsTexture.type = HalfFloatType;
  const opticalDiagnosticsATexture = scenePass.getTexture(
    OPTICAL_DIAGNOSTICS_A_ATTACHMENT,
  );
  opticalDiagnosticsATexture.format = RGFormat;
  opticalDiagnosticsATexture.type = UnsignedByteType;
  opticalDiagnosticsATexture.colorSpace = LinearSRGBColorSpace;
  const opticalDiagnosticsBTexture = scenePass.getTexture(
    OPTICAL_DIAGNOSTICS_B_ATTACHMENT,
  );
  opticalDiagnosticsBTexture.format = RGFormat;
  opticalDiagnosticsBTexture.type = UnsignedByteType;
  opticalDiagnosticsBTexture.colorSpace = LinearSRGBColorSpace;
  assertCoreScenePassColorByteBudget(scenePass.renderTarget.textures);
  const whitecapDiagnostics = createSpectralWhitecapDiagnostics(
    renderer,
    camera,
    scenePass.getTexture("depth"),
    opticalFactorsTexture,
    drawingBuffer,
    whitecapField,
  );
  partial.whitecapDiagnostics = whitecapDiagnostics;

  const resetUniform = createTraaResetUniform();
  partial.resetUniform = resetUniform;
  const ssr = createCurrentFrameSsrStack(
    renderer,
    scenePass,
    camera,
    drawingBuffer,
    {
      viewNormal: viewNormalTexture,
      opticalFactors: opticalFactorsTexture,
      motionVectors: motionVectorsTexture,
    },
  );
  partial.ssr = ssr;
  const traaNode = traa(
    vec4(texture(ssr.compositeTarget.texture).rgb, texture(outputTexture).a),
    texture(scenePass.getTexture("depth")),
    createResettableVelocityTextureNode(
      texture(motionVectorsTexture),
      resetUniform,
    ),
    camera,
  );
  traaNode.updateBeforeType = "render";
  partial.traaNode = traaNode;
  const jitterAdapter = createTraaJitterAdapter(traaNode);
  partial.jitterAdapter = jitterAdapter;
  const temporalPipeline = new RenderPipeline(renderer, traaNode);
  partial.temporalPipeline = temporalPipeline;
  const finalColorTarget = new RenderTarget(
    drawingBuffer.width,
    drawingBuffer.height,
    {
      depthBuffer: false,
      stencilBuffer: false,
      type: UnsignedByteType,
    },
  );
  partial.finalColorTarget = finalColorTarget;
  finalColorTarget.texture.name = "Real Water final color";
  const currentColorTarget = new RenderTarget(
    drawingBuffer.width,
    drawingBuffer.height,
    {
      depthBuffer: false,
      stencilBuffer: false,
      type: UnsignedByteType,
    },
  );
  partial.currentColorTarget = currentColorTarget;
  currentColorTarget.texture.name = "Real Water current color";
  const currentColorPipeline = new RenderPipeline(
    renderer,
    vec4(texture(ssr.compositeTarget.texture).rgb, texture(outputTexture).a),
  );
  partial.currentColorPipeline = currentColorPipeline;
  const presentationPipeline = new RenderPipeline(
    renderer,
    texture(finalColorTarget.texture),
  );
  partial.presentationPipeline = presentationPipeline;
  presentationPipeline.outputColorTransform = false;
  const planar = createPlanarReflectionPass(camera, drawingBuffer);
  partial.planar = planar;

  const resources: PreparedWaterPresentationResources = {
    presentationPipeline,
    currentColorPipeline,
    temporalPipeline,
    traaNode,
    jitterAdapter,
    resetUniform,
    currentColorTarget,
    finalColorTarget,
    scenePass,
    ssr,
    whitecapField,
    whitecapDiagnostics,
    inverseLinearDepthTextureIndex: 0,
    viewNormalTextureIndex: textureIndex(
      scenePass.renderTarget,
      VIEW_NORMAL_ATTACHMENT,
    ),
    motionVectorsTextureIndex: textureIndex(
      scenePass.renderTarget,
      MOTION_VECTORS_ATTACHMENT,
    ),
    opticalFactorsTextureIndex: textureIndex(
      scenePass.renderTarget,
      OPTICAL_FACTORS_ATTACHMENT,
    ),
    opticalDiagnosticsATextureIndex: textureIndex(
      scenePass.renderTarget,
      OPTICAL_DIAGNOSTICS_A_ATTACHMENT,
    ),
    opticalDiagnosticsBTextureIndex: textureIndex(
      scenePass.renderTarget,
      OPTICAL_DIAGNOSTICS_B_ATTACHMENT,
    ),
    planar,
    width: drawingBuffer.width,
    height: drawingBuffer.height,
    counters,
  };
  return { resources, partial };
}

export async function compileAndPrimePreparedWaterPresentation(
  renderer: Renderer,
  scene: Scene,
  camera: PerspectiveCamera,
  resources: PreparedWaterPresentationResources,
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  resources.counters.compileCount += 1;
  await resources.planar.prime(renderer, scene, camera);
  resources.counters.sceneRenderCount += 1;
  throwIfAborted(signal);
  resources.counters.compileCount += 1;
  await resources.scenePass.compileAsync(renderer);
  throwIfAborted(signal);
  resources.ssr.ensureGraphPrepared(renderer);
  resources.resetUniform.value = 1;
  renderTemporalFrame(renderer, scene, camera, resources, true);
  resources.resetUniform.value = 0;
  renderCurrentColorConversion(renderer, resources);
  await probeNamedOutputRoutes(renderer, resources);
  throwIfAborted(signal);
}

export function renderHiddenStabilizationFrames(
  renderer: Renderer,
  scene: Scene,
  camera: PerspectiveCamera,
  resources: PreparedWaterPresentationResources,
  signal: AbortSignal,
  resetFirstFrame = false,
): void {
  for (let frame = 0; frame < HIDDEN_STABILIZATION_FRAME_COUNT; frame += 1) {
    const resetFrame = resetFirstFrame && frame === 0;
    if (resetFrame) {
      resources.resetUniform.value = 1;
      resources.jitterAdapter.realign();
    }
    try {
      renderTemporalFrame(renderer, scene, camera, resources, false);
    } finally {
      if (resetFrame) {
        resources.resetUniform.value = 0;
      }
    }
    throwIfAborted(signal);
  }
}

export async function probePreparedCompletion(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
  signal: AbortSignal,
): Promise<void> {
  await probeNamedOutputRoutes(renderer, resources);
  throwIfAborted(signal);
}

export async function renderMainCameraGuard(
  renderer: Renderer,
  scene: Scene,
  camera: PerspectiveCamera,
  resources: PreparedWaterPresentationResources,
  signal: AbortSignal,
): Promise<void> {
  renderTemporalFrame(renderer, scene, camera, resources, false);
  renderCurrentColorConversion(renderer, resources);
  renderer.setRenderTarget(null);
  resources.presentationPipeline.render();
  await probeCompletedFrame(renderer, resources, resources.finalColorTarget);
  throwIfAborted(signal);
}

export function createPresentationRouteBridge(
  renderer: Renderer,
  scene: Scene,
  camera: PerspectiveCamera,
  resources: PreparedWaterPresentationResources,
  drawingBuffer: Readonly<{ width: number; height: number }>,
  manifestHash: string,
): HostPresentationRouteBridge {
  let unbound = false;
  let connected = false;
  let activated = false;
  let inspectRuntime: (() => OpenWaterRuntimeSnapshot) | undefined;
  let lastPresented: PresentedSnapshotKeys | undefined;
  let historyEpoch = PREWARM_HISTORY_EPOCH;
  let presentationId = 0;
  let tail = Promise.resolve();

  const presentOnce = async (
    request: HostDiagnosticsPresentRequest,
  ): Promise<HostDiagnosticsPresentedFrame> => {
    if (unbound || inspectRuntime === undefined) {
      throw new Error("The Host Presentation Route has been unbound.");
    }
    if (!activated) {
      throw new Error("The Host Presentation Route is not active.");
    }
    const accepted = readHostDiagnosticsPresentRequest(request);
    const actual = readDrawingBufferSize(renderer);
    if (
      actual.width !== drawingBuffer.width ||
      actual.height !== drawingBuffer.height
    ) {
      throw new Error(
        "The Three Host drawing buffer does not match the Prewarm Manifest.",
      );
    }
    const snapshot = inspectRuntime();
    await resources.whitecapField.synchronize(renderer, snapshot);
    const resetReason =
      lastPresented === undefined
        ? null
        : detectPresentationReset(lastPresented, snapshot);
    const hostState = captureHostState(renderer, scene, camera);
    const outputs: DiagnosticsCapture[] = [];
    let temporalSceneStarted = false;
    try {
      if (resetReason !== null) {
        resources.resetUniform.value = 1;
        resources.jitterAdapter.realign();
      }
      temporalSceneStarted = true;
      renderTemporalFrame(
        renderer,
        scene,
        camera,
        resources,
        accepted.outputs.some(isWhitecapCaptureName),
      );
      if (accepted.outputs.includes("current-color")) {
        renderCurrentColorConversion(renderer, resources);
      }
      renderer.setRenderTarget(null);
      resources.presentationPipeline.render();
      const whitecapCaptures = accepted.outputs.some(isWhitecapCaptureName)
        ? await readWhitecapStageCaptures(renderer, resources)
        : undefined;
      if (whitecapCaptures !== undefined) {
        resources.counters.diagnosticReadbackCount += 1;
      }
      for (const name of accepted.outputs) {
        if (isWhitecapCaptureName(name)) {
          const capture = whitecapCaptures?.get(name);
          if (capture === undefined) {
            throw new Error(`The ${name} packed capture is unavailable.`);
          }
          outputs.push(capture);
        } else {
          outputs.push(
            await readNamedOutput(renderer, camera, resources, name),
          );
          resources.counters.diagnosticReadbackCount += 1;
        }
      }
      if (resetReason !== null) {
        resources.resetUniform.value = 0;
        if (presentationId > 0) {
          historyEpoch += 1;
        }
      }
      presentationId += 1;
      lastPresented = readPresentedSnapshotKeys(snapshot);
      return Object.freeze({
        presentationId,
        manifestHash,
        seed: snapshot.seed,
        tick: snapshot.tick,
        timeSeconds: snapshot.timeSeconds,
        simulationResetRevision: snapshot.simulationResetRevision,
        controlRevision: snapshot.controlRevision,
        originRevision: snapshot.originRevision,
        cameraCutRevision: snapshot.cameraCutRevision,
        seaStateCutRevision: snapshot.seaStateCutRevision,
        temporal: Object.freeze({
          historyEpoch,
          resetReason,
          resetFrame: resetReason !== null,
        }),
        outputs: Object.freeze(outputs),
        compileCount: resources.counters.compileCount,
        probeCount: resources.counters.probeCount,
        diagnosticReadbackCount: resources.counters.diagnosticReadbackCount,
        sceneRenderCount: resources.counters.sceneRenderCount,
        width: resources.width,
        height: resources.height,
      });
    } catch (error) {
      if (temporalSceneStarted) {
        resources.resetUniform.value = 0;
        unbound = true;
      }
      throw error;
    } finally {
      restoreHostState(renderer, scene, camera, hostState);
    }
  };

  const enqueue = <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const run = tail.then(operation, operation);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const present = (): Promise<HostPresentedFrame> =>
    enqueue(async () =>
      toRootPresentedFrame(await presentOnce({ outputs: [] })),
    );

  const diagnostics: HostDiagnosticsRoute = {
    present(request) {
      return enqueue(() => presentOnce(request));
    },
  };

  return {
    connect(nextInspectRuntime) {
      if (unbound) {
        throw new Error("The Host Presentation Route has been unbound.");
      }
      if (connected) {
        throw new Error("The Core presentation route is already connected.");
      }
      connected = true;
      inspectRuntime = nextInspectRuntime;
      lastPresented = readPresentedSnapshotKeys(nextInspectRuntime());
      const route = { present };
      installHostDiagnosticsRoute(route, diagnostics);
      return Object.freeze(route) satisfies HostPresentationRoute;
    },
    activate() {
      if (unbound) {
        throw new Error("The Host Presentation Route has been unbound.");
      }
      activated = true;
    },
    unbind() {
      if (unbound) {
        return;
      }
      unbound = true;
    },
    drain() {
      return tail;
    },
  };
}

export function disposePreparedWaterPresentationResources(
  resources: PreparedWaterPresentationResources,
): void {
  resources.presentationPipeline.dispose();
  resources.currentColorPipeline.dispose();
  resources.temporalPipeline.dispose();
  resources.traaNode.dispose();
  resources.currentColorTarget.dispose();
  resources.finalColorTarget.dispose();
  resources.whitecapDiagnostics.dispose();
  resources.scenePass.dispose();
  disposeCurrentFrameSsrStack(resources.ssr);
  resources.planar.dispose();
}

export function disposePartialPreparedWaterPresentationResources(
  resources: PartialPreparedWaterPresentationResources,
): void {
  const disposals = [
    () => resources.presentationPipeline?.dispose(),
    () => resources.currentColorPipeline?.dispose(),
    () => resources.temporalPipeline?.dispose(),
    () => resources.traaNode?.dispose(),
    () => resources.currentColorTarget?.dispose(),
    () => resources.finalColorTarget?.dispose(),
    () => resources.whitecapDiagnostics?.dispose(),
    () => resources.scenePass?.dispose(),
    () => {
      if (resources.ssr !== undefined) {
        disposeCurrentFrameSsrStack(resources.ssr);
      }
    },
    () => resources.planar?.dispose(),
  ];
  for (const dispose of disposals) {
    try {
      dispose();
    } catch {
      // Startup continues to reject with the primary preparation failure.
    }
  }
}

interface PresentedSnapshotKeys {
  readonly seed: number;
  readonly tick: number;
  readonly timeSeconds: number;
  readonly simulationResetRevision: number;
  readonly controlRevision: number;
  readonly originRevision: number;
  readonly cameraCutRevision: number;
  readonly seaStateCutRevision: number;
}

function readPresentedSnapshotKeys(
  snapshot: OpenWaterRuntimeSnapshot,
): PresentedSnapshotKeys {
  return {
    seed: snapshot.seed,
    tick: snapshot.tick,
    timeSeconds: snapshot.timeSeconds,
    simulationResetRevision: snapshot.simulationResetRevision,
    controlRevision: snapshot.controlRevision,
    originRevision: snapshot.originRevision,
    cameraCutRevision: snapshot.cameraCutRevision,
    seaStateCutRevision: snapshot.seaStateCutRevision,
  };
}

function detectPresentationReset(
  previous: PresentedSnapshotKeys,
  current: OpenWaterRuntimeSnapshot,
): HostTemporalResetReason | null {
  if (
    current.simulationResetRevision !== previous.simulationResetRevision ||
    current.seed !== previous.seed ||
    current.tick < previous.tick ||
    current.timeSeconds < previous.timeSeconds
  ) {
    return "simulation-reset";
  }
  if (current.cameraCutRevision !== previous.cameraCutRevision) {
    return "camera-cut";
  }
  if (current.originRevision !== previous.originRevision) {
    return "origin-shift";
  }
  if (current.seaStateCutRevision !== previous.seaStateCutRevision) {
    return "sea-state-cut";
  }
  return null;
}

function toRootPresentedFrame(
  frame: HostDiagnosticsPresentedFrame,
): HostPresentedFrame {
  return Object.freeze({
    presentationId: frame.presentationId,
    manifestHash: frame.manifestHash,
    seed: frame.seed,
    tick: frame.tick,
    timeSeconds: frame.timeSeconds,
    simulationResetRevision: frame.simulationResetRevision,
    controlRevision: frame.controlRevision,
    originRevision: frame.originRevision,
    cameraCutRevision: frame.cameraCutRevision,
    seaStateCutRevision: frame.seaStateCutRevision,
    temporal: frame.temporal,
  });
}

function renderTemporalFrame(
  renderer: Renderer,
  scene: Scene,
  camera: PerspectiveCamera,
  resources: PreparedWaterPresentationResources,
  captureWhitecaps: boolean,
): void {
  const actual = readDrawingBufferSize(renderer);
  if (actual.width !== resources.width || actual.height !== resources.height) {
    throw new Error(
      "The Three Host drawing buffer does not match the Prewarm Manifest.",
    );
  }
  assertNativeTraaCamera(camera);
  resources.planar.render(renderer, scene, camera);
  if (resources.planar.hasOutput.value === 1) {
    resources.counters.sceneRenderCount += 1;
  }
  const cameraState = captureCameraProjection(camera);
  resources.jitterAdapter.applyCurrentJitter(resources.width, resources.height);
  resources.ssr.syncCamera(camera);
  resources.jitterAdapter.beginTemporalRender();
  let succeeded = false;
  try {
    try {
      renderer.setRenderTarget(resources.currentColorTarget);
      resources.ssr.sceneTriggerPipeline.render();
      resources.counters.sceneRenderCount += 1;
      if (captureWhitecaps) {
        resources.whitecapDiagnostics.render(renderer, camera);
      }
      renderCurrentFrameSsr(renderer, resources.ssr);
      const historyHostState = captureHostState(renderer, scene, camera);
      try {
        renderCurrentFrameSsrHistory(
          renderer,
          resources.ssr,
          resources.resetUniform.value > 0.5,
        );
      } finally {
        restoreHostState(renderer, scene, camera, historyHostState);
      }
      renderer.setRenderTarget(resources.ssr.compositeTarget);
      resources.ssr.compositePipeline.render();
      assertCurrentFrameSsrPreparedSize(resources.ssr);
      renderer.setRenderTarget(resources.ssr.depthConversionTarget);
      resources.ssr.depthConversionPipeline.render();
      resources.jitterAdapter.clearHostCameraViewOffset(camera);
      renderer.setRenderTarget(resources.finalColorTarget);
      resources.temporalPipeline.render();
      succeeded = true;
    } catch (cause) {
      resources.jitterAdapter.clearHostCameraViewOffset(camera);
      restoreVelocityProjection();
      throw cause;
    }
  } finally {
    resources.jitterAdapter.endTemporalRender(succeeded);
    restoreCameraProjection(camera, cameraState);
  }
}

function renderCurrentColorConversion(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): void {
  renderer.setRenderTarget(resources.currentColorTarget);
  resources.currentColorPipeline.render();
}

export function readDrawingBufferSize(renderer: Renderer): Readonly<{
  width: number;
  height: number;
}> {
  if (typeof renderer.getDrawingBufferSize !== "function") {
    throw new TypeError(
      "The Host renderer must expose getDrawingBufferSize for drawing-buffer-exact TRAA.",
    );
  }
  const size = renderer.getDrawingBufferSize(new Vector2());
  const width = Math.floor(size.width);
  const height = Math.floor(size.height);
  if (width < 1 || height < 1) {
    throw new RangeError(
      "The Core drawing buffer must have positive dimensions.",
    );
  }
  return Object.freeze({ width, height });
}

async function probeNamedOutputRoutes(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<void> {
  await probeCompletedFrame(renderer, resources, resources.finalColorTarget);
  await probeCompletedFrame(renderer, resources, resources.currentColorTarget);
  await probeCompletedFrame(
    renderer,
    resources,
    resources.ssr.depthConversionTarget,
    resources.inverseLinearDepthTextureIndex,
  );
  await probeCompletedFrame(
    renderer,
    resources,
    resources.ssr.ssrNode.getRenderTarget(),
  );
  await probeCompletedFrame(renderer, resources, resources.ssr.compositeTarget);
  await probeCompletedFrame(renderer, resources, resources.ssr.beautyTarget);
  await probeCompletedFrame(
    renderer,
    resources,
    resources.ssr.historyResolvedTarget,
  );
  await probeCompletedFrame(
    renderer,
    resources,
    resources.scenePass.renderTarget,
    resources.viewNormalTextureIndex,
  );
  await probeCompletedFrame(
    renderer,
    resources,
    resources.scenePass.renderTarget,
    resources.motionVectorsTextureIndex,
  );
  await probeCompletedFrame(
    renderer,
    resources,
    resources.scenePass.renderTarget,
    resources.opticalFactorsTextureIndex,
  );
  await probeCompletedFrame(
    renderer,
    resources,
    resources.scenePass.renderTarget,
    resources.opticalDiagnosticsATextureIndex,
  );
  await probeCompletedFrame(
    renderer,
    resources,
    resources.scenePass.renderTarget,
    resources.opticalDiagnosticsBTextureIndex,
  );
  await probeCompletedFrame(renderer, resources, resources.planar.target);
  await probeCompletedFrame(
    renderer,
    resources,
    resources.whitecapDiagnostics.target,
  );
}

function isWhitecapCaptureName(name: DiagnosticsCaptureName): boolean {
  return (
    name === "whitecap-generation" ||
    name === "whitecap-history" ||
    name === "whitecap-advection" ||
    name === "whitecap-decay"
  );
}

async function probeCompletedFrame(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
  renderTarget: RenderTarget,
  textureIndex = 0,
): Promise<void> {
  const probeWidth = Math.min(2, Math.max(1, renderTarget.width));
  const pixels = await renderer.readRenderTargetPixelsAsync(
    renderTarget,
    Math.max(0, Math.floor(renderTarget.width / 2) - (probeWidth - 1)),
    Math.max(0, Math.floor(renderTarget.height / 2)),
    probeWidth,
    1,
    textureIndex,
  );
  resources.counters.probeCount += 1;
  if (pixels.length === 0) {
    throw new Error("The Core completion probe returned no pixels.");
  }
}

async function readNamedOutput(
  renderer: Renderer,
  camera: PerspectiveCamera,
  resources: PreparedWaterPresentationResources,
  name: DiagnosticsCaptureName,
): Promise<DiagnosticsCapture> {
  switch (name) {
    case "final-color":
    case "current-color": {
      const raw = await renderer.readRenderTargetPixelsAsync(
        name === "current-color"
          ? resources.currentColorTarget
          : resources.finalColorTarget,
        0,
        0,
        resources.width,
        resources.height,
      );
      if (!(raw instanceof Uint8Array)) {
        throw new TypeError(`${name} readback did not return RGBA8 data.`);
      }
      return Object.freeze({
        name,
        width: resources.width,
        height: resources.height,
        origin: "top-left",
        format: DIAGNOSTICS_CAPTURE_SHAPES[name].format,
        data: compactRows(raw, resources.width, resources.height, 4),
      });
    }
    case "depth": {
      const raw = await renderer.readRenderTargetPixelsAsync(
        resources.ssr.depthConversionTarget,
        0,
        0,
        resources.width,
        resources.height,
        resources.inverseLinearDepthTextureIndex,
      );
      if (!(raw instanceof Float32Array)) {
        throw new TypeError("Depth readback did not return Float32 data.");
      }
      const inverseDepth = compactRows(
        raw,
        resources.width,
        resources.height,
        1,
      );
      const data = new Float32Array(resources.width * resources.height);
      for (let index = 0; index < data.length; index += 1) {
        const inverse = Math.min(1, Math.max(0, inverseDepth[index] ?? 0));
        data[index] = camera.near + (1 - inverse) * (camera.far - camera.near);
      }
      return Object.freeze({
        name,
        width: resources.width,
        height: resources.height,
        origin: "top-left",
        format: DIAGNOSTICS_CAPTURE_SHAPES[name].format,
        data,
      });
    }
    case "normal": {
      const raw = await renderer.readRenderTargetPixelsAsync(
        resources.scenePass.renderTarget,
        0,
        0,
        resources.width,
        resources.height,
        resources.viewNormalTextureIndex,
      );
      if (!(raw instanceof Uint16Array)) {
        throw new TypeError("Normal readback did not return Float16 data.");
      }
      const channels = inferReadbackChannels(
        raw.length,
        resources.width,
        resources.height,
      );
      const packed = compactRows(
        raw,
        resources.width,
        resources.height,
        channels,
      );
      const data = new Float32Array(resources.width * resources.height * 3);
      for (
        let pixel = 0;
        pixel < resources.width * resources.height;
        pixel += 1
      ) {
        const source = pixel * channels;
        const destination = pixel * 3;
        const unpacked = unpackPackedViewNormalRgb([
          DataUtils.fromHalfFloat(packed[source] ?? 0),
          DataUtils.fromHalfFloat(packed[source + 1] ?? 0),
          DataUtils.fromHalfFloat(packed[source + 2] ?? 0),
        ]);
        const length = Math.hypot(unpacked[0], unpacked[1], unpacked[2]);
        if (length === 0) {
          data[destination] = 0;
          data[destination + 1] = 0;
          data[destination + 2] = 1;
        } else {
          data[destination] = unpacked[0] / length;
          data[destination + 1] = unpacked[1] / length;
          data[destination + 2] = unpacked[2] / length;
        }
      }
      return Object.freeze({
        name,
        width: resources.width,
        height: resources.height,
        origin: "top-left",
        format: DIAGNOSTICS_CAPTURE_SHAPES[name].format,
        data,
      });
    }
    case "motion-vector":
      return readMotionVectorCapture(renderer, resources);
    case "whitecap-generation":
    case "whitecap-history":
    case "whitecap-advection":
    case "whitecap-decay":
      throw new Error(
        "The spectral-whitecap diagnostic route has not been prepared.",
      );
    case "optical-fresnel":
      return readOpticalScalarCapture(
        renderer,
        resources,
        name,
        resources.opticalFactorsTextureIndex,
        0,
      );
    case "optical-thickness":
      return readOpticalScalarCapture(
        renderer,
        resources,
        name,
        resources.opticalFactorsTextureIndex,
        1,
      );
    case "optical-scattering":
      return readOpticalScalarCapture(
        renderer,
        resources,
        name,
        resources.opticalDiagnosticsBTextureIndex,
        0,
      );
    case "optical-environment-reflection":
      return readOpticalScalarCapture(
        renderer,
        resources,
        name,
        resources.opticalDiagnosticsBTextureIndex,
        1,
      );
    case "optical-crest-transmission":
      return readOpticalScalarCapture(
        renderer,
        resources,
        name,
        resources.opticalDiagnosticsATextureIndex,
        0,
      );
    case "optical-transmittance":
      return readOpticalScalarCapture(
        renderer,
        resources,
        name,
        resources.opticalDiagnosticsATextureIndex,
        1,
      );
    case "optical-glint":
      return readOpticalScalarCapture(
        renderer,
        resources,
        name,
        resources.opticalFactorsTextureIndex,
        2,
      );
    case "planar-color":
      return readPlanarColorCapture(renderer, resources);
    case "planar-target-alpha":
      return readPlanarTargetAlphaCapture(renderer, resources);
    case "ssr-hit":
      return readSsrHitCapture(renderer, resources);
    case "ssr-confidence":
      return readSsrConfidenceCapture(renderer, resources);
    case "ssr-color":
      return readSsrColorCapture(renderer, resources);
    case "ssr-roughness":
      return readSsrRoughnessCapture(renderer, resources);
    case "reflection-base-color":
      return readReflectionBaseColorCapture(renderer, resources);
    case "ssr-composite-color":
      return readSsrCompositeColorCapture(renderer, resources);
    case "ssr-history-color":
      return readSsrHistoryColorCapture(renderer, resources);
    case "ssr-history-frame-weight":
      return readSsrHistoryFrameWeightCapture(renderer, resources);
    case "ssr-history-input-color":
      return readSsrHistoryInputColorCapture(renderer, resources);
  }
}

async function readMotionVectorCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<DiagnosticsMotionVectorCapture> {
  const raw = await renderer.readRenderTargetPixelsAsync(
    resources.scenePass.renderTarget,
    0,
    0,
    resources.width,
    resources.height,
    resources.motionVectorsTextureIndex,
  );
  const pixelCount = resources.width * resources.height;
  const data = new Float32Array(pixelCount * 2);
  if (raw instanceof Uint16Array) {
    const channels = inferReadbackChannels(
      raw.length,
      resources.width,
      resources.height,
    );
    const packed = compactRows(
      raw,
      resources.width,
      resources.height,
      channels,
    );
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const source = pixel * channels;
      data[pixel * 2] = DataUtils.fromHalfFloat(packed[source] ?? 0);
      data[pixel * 2 + 1] = DataUtils.fromHalfFloat(packed[source + 1] ?? 0);
    }
  } else if (raw instanceof Float32Array) {
    const channels = inferReadbackChannels(
      raw.length,
      resources.width,
      resources.height,
    );
    const packed = compactRows(
      raw,
      resources.width,
      resources.height,
      channels,
    );
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const source = pixel * channels;
      data[pixel * 2] = packed[source] ?? 0;
      data[pixel * 2 + 1] = packed[source + 1] ?? 0;
    }
  } else {
    throw new TypeError(
      "Motion-vector readback did not return Float16 or Float32 RG data.",
    );
  }
  if (
    data.length !== pixelCount * 2 ||
    data.some((value) => !Number.isFinite(value))
  ) {
    throw new RangeError(
      "Motion-vector capture must be finite Float32 RG NDC with width*height*2 values.",
    );
  }
  return Object.freeze({
    name: "motion-vector",
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES["motion-vector"].format,
    data,
  });
}

async function readWhitecapStageCaptures(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<
  ReadonlyMap<DiagnosticsCaptureName, DiagnosticsWhitecapStageCapture>
> {
  const raw = await renderer.readRenderTargetPixelsAsync(
    resources.whitecapDiagnostics.target,
    0,
    0,
    resources.width,
    resources.height,
  );
  if (!(raw instanceof Uint16Array) && !(raw instanceof Float32Array)) {
    throw new TypeError(
      "Spectral-whitecap stage readback did not return Float16 or Float32 data.",
    );
  }
  const packed = compactRows(raw, resources.width, resources.height, 4);
  const names = [
    "whitecap-generation",
    "whitecap-history",
    "whitecap-advection",
    "whitecap-decay",
  ] as const;
  const result = new Map<
    DiagnosticsCaptureName,
    DiagnosticsWhitecapStageCapture
  >();
  for (const [channel, name] of names.entries()) {
    const data = new Float32Array(resources.width * resources.height);
    for (let pixel = 0; pixel < data.length; pixel += 1) {
      const encoded = packed[pixel * 4 + channel] ?? 0;
      const value =
        packed instanceof Uint16Array
          ? DataUtils.fromHalfFloat(encoded)
          : encoded;
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(
          `The ${name} capture must contain finite unit density.`,
        );
      }
      data[pixel] = value;
    }
    result.set(
      name,
      Object.freeze({
        name,
        width: resources.width,
        height: resources.height,
        origin: "top-left",
        format: DIAGNOSTICS_CAPTURE_SHAPES[name].format,
        data,
      }),
    );
  }
  return result;
}

async function readPlanarColorCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<DiagnosticsCapture> {
  const raw = await renderer.readRenderTargetPixelsAsync(
    resources.planar.target,
    0,
    0,
    resources.width,
    resources.height,
  );
  if (!(raw instanceof Uint8Array)) {
    throw new TypeError("planar-color readback did not return RGBA8 data.");
  }
  return Object.freeze({
    name: "planar-color",
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES["planar-color"].format,
    data: compactRows(raw, resources.width, resources.height, 4),
  });
}

async function readPlanarTargetAlphaCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<DiagnosticsCapture> {
  const raw = await renderer.readRenderTargetPixelsAsync(
    resources.planar.target,
    0,
    0,
    resources.width,
    resources.height,
  );
  if (!(raw instanceof Uint8Array)) {
    throw new TypeError(
      "planar-target-alpha readback did not return RGBA8 data.",
    );
  }
  const packed = compactRows(raw, resources.width, resources.height, 4);
  const data = new Float32Array(resources.width * resources.height);
  const hasOutput = resources.planar.hasOutput.value;
  for (let pixel = 0; pixel < data.length; pixel += 1) {
    const alpha = (packed[pixel * 4 + 3] ?? 0) / 255;
    data[pixel] = hasOutput * alpha;
  }
  return Object.freeze({
    name: "planar-target-alpha",
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES["planar-target-alpha"].format,
    data,
  });
}

async function readSsrRawPixels(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<Float32Array> {
  const raw = await renderer.readRenderTargetPixelsAsync(
    resources.ssr.ssrNode.getRenderTarget(),
    0,
    0,
    resources.width,
    resources.height,
  );
  if (!(raw instanceof Uint16Array) && !(raw instanceof Float32Array)) {
    throw new TypeError(
      "SSR raw readback did not return Float16 or Float32 data.",
    );
  }
  const channels = inferReadbackChannels(
    raw.length,
    resources.width,
    resources.height,
  );
  const packed =
    raw instanceof Uint16Array
      ? compactRows(raw, resources.width, resources.height, channels)
      : compactRows(raw, resources.width, resources.height, channels);
  const data = new Float32Array(resources.width * resources.height * 4);
  for (let pixel = 0; pixel < resources.width * resources.height; pixel += 1) {
    const source = pixel * channels;
    const destination = pixel * 4;
    if (raw instanceof Uint16Array) {
      data[destination] = DataUtils.fromHalfFloat(packed[source] ?? 0);
      data[destination + 1] = DataUtils.fromHalfFloat(packed[source + 1] ?? 0);
      data[destination + 2] = DataUtils.fromHalfFloat(packed[source + 2] ?? 0);
      data[destination + 3] = DataUtils.fromHalfFloat(packed[source + 3] ?? 0);
    } else {
      data[destination] = packed[source] ?? 0;
      data[destination + 1] = packed[source + 1] ?? 0;
      data[destination + 2] = packed[source + 2] ?? 0;
      data[destination + 3] = packed[source + 3] ?? 0;
    }
  }
  return data;
}

async function readSsrHitCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<DiagnosticsOpticalScalarCapture> {
  const raw = await readSsrRawPixels(renderer, resources);
  const data = new Float32Array(resources.width * resources.height);
  for (let pixel = 0; pixel < data.length; pixel += 1) {
    const distance = raw[pixel * 4 + 3] ?? 0;
    if (!Number.isFinite(distance) || distance < 0) {
      throw new TypeError(
        "SSR hit readback must be a finite non-negative world-distance (0 = miss).",
      );
    }
    data[pixel] = distance;
  }
  return Object.freeze({
    name: "ssr-hit",
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES["ssr-hit"].format,
    data,
  });
}

async function readSsrConfidenceCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<DiagnosticsOpticalScalarCapture> {
  const raw = await renderer.readRenderTargetPixelsAsync(
    resources.ssr.compositeTarget,
    0,
    0,
    resources.width,
    resources.height,
  );
  if (!(raw instanceof Uint16Array) && !(raw instanceof Float32Array)) {
    throw new TypeError(
      "SSR confidence readback did not return Float16 or Float32 data.",
    );
  }
  const channels = inferReadbackChannels(
    raw.length,
    resources.width,
    resources.height,
  );
  const packed = compactRows(raw, resources.width, resources.height, channels);
  const data = new Float32Array(resources.width * resources.height);
  for (let pixel = 0; pixel < data.length; pixel += 1) {
    const value =
      raw instanceof Uint16Array
        ? DataUtils.fromHalfFloat(packed[pixel * channels + 3] ?? 0)
        : (packed[pixel * channels + 3] ?? 0);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new TypeError(
        "SSR confidence readback must be finite and inside [0, 1].",
      );
    }
    data[pixel] = value;
  }
  return Object.freeze({
    name: "ssr-confidence",
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES["ssr-confidence"].format,
    data,
  });
}

async function readPackedLinearRgb(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
  renderTarget: RenderTarget,
  textureIndex: number,
  label: string,
): Promise<Float32Array> {
  const raw = await renderer.readRenderTargetPixelsAsync(
    renderTarget,
    0,
    0,
    resources.width,
    resources.height,
    textureIndex,
  );
  if (!(raw instanceof Uint16Array) && !(raw instanceof Float32Array)) {
    throw new TypeError(
      `${label} readback did not return Float16 or Float32 data.`,
    );
  }
  const channels = inferReadbackChannels(
    raw.length,
    resources.width,
    resources.height,
  );
  const packed = compactRows(raw, resources.width, resources.height, channels);
  const data = new Float32Array(resources.width * resources.height * 3);
  for (let pixel = 0; pixel < resources.width * resources.height; pixel += 1) {
    const source = pixel * channels;
    const destination = pixel * 3;
    const red =
      raw instanceof Uint16Array
        ? DataUtils.fromHalfFloat(packed[source] ?? 0)
        : (packed[source] ?? 0);
    const green =
      raw instanceof Uint16Array
        ? DataUtils.fromHalfFloat(packed[source + 1] ?? 0)
        : (packed[source + 1] ?? 0);
    const blue =
      raw instanceof Uint16Array
        ? DataUtils.fromHalfFloat(packed[source + 2] ?? 0)
        : (packed[source + 2] ?? 0);
    if (
      !Number.isFinite(red) ||
      !Number.isFinite(green) ||
      !Number.isFinite(blue)
    ) {
      throw new TypeError(`${label} readback contained a non-finite sample.`);
    }
    data[destination] = red;
    data[destination + 1] = green;
    data[destination + 2] = blue;
  }
  return data;
}

async function readReflectionBaseColorCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<DiagnosticsCapture> {
  const data = await readPackedLinearRgb(
    renderer,
    resources,
    resources.scenePass.renderTarget,
    scenePassOutputTextureIndex(resources),
    "Reflection base color",
  );
  return Object.freeze({
    name: "reflection-base-color",
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES["reflection-base-color"].format,
    data,
  });
}

async function readSsrCompositeColorCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<DiagnosticsCapture> {
  const data = await readPackedLinearRgb(
    renderer,
    resources,
    resources.ssr.compositeTarget,
    0,
    "SSR composite color",
  );
  return Object.freeze({
    name: "ssr-composite-color",
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES["ssr-composite-color"].format,
    data,
  });
}

async function readSsrHistoryColorCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<DiagnosticsCapture> {
  const data = await readPackedLinearRgb(
    renderer,
    resources,
    resources.ssr.historyResolvedTarget,
    0,
    "SSR history color",
  );
  return Object.freeze({
    name: "ssr-history-color",
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES["ssr-history-color"].format,
    data,
  });
}

async function readSsrHistoryFrameWeightCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<DiagnosticsCapture> {
  const raw = await renderer.readRenderTargetPixelsAsync(
    resources.ssr.historyResolvedTarget,
    0,
    0,
    resources.width,
    resources.height,
  );
  if (!(raw instanceof Uint16Array) && !(raw instanceof Float32Array)) {
    throw new TypeError(
      "SSR history frame-weight readback did not return Float16 or Float32 data.",
    );
  }
  const channels = inferReadbackChannels(
    raw.length,
    resources.width,
    resources.height,
  );
  const packed = compactRows(raw, resources.width, resources.height, channels);
  const data = new Float32Array(resources.width * resources.height);
  for (let pixel = 0; pixel < data.length; pixel += 1) {
    const value =
      raw instanceof Uint16Array
        ? DataUtils.fromHalfFloat(packed[pixel * channels + 3] ?? 0)
        : (packed[pixel * channels + 3] ?? 0);
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "SSR history frame-weight readback contained a non-finite sample.",
      );
    }
    data[pixel] = value;
  }
  return Object.freeze({
    name: "ssr-history-frame-weight",
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES["ssr-history-frame-weight"].format,
    data,
  });
}

async function readSsrHistoryInputColorCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<DiagnosticsCapture> {
  const data = await readPackedLinearRgb(
    renderer,
    resources,
    resources.ssr.beautyTarget,
    0,
    "SSR history input color",
  );
  return Object.freeze({
    name: "ssr-history-input-color",
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES["ssr-history-input-color"].format,
    data,
  });
}

function scenePassOutputTextureIndex(
  resources: PreparedWaterPresentationResources,
): number {
  const outputTexture = resources.scenePass.getTexture("output");
  const index =
    resources.scenePass.renderTarget.textures.indexOf(outputTexture);
  if (index < 0) {
    throw new Error("The prepared scene-pass output attachment is missing.");
  }
  return index;
}

async function readSsrColorCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<DiagnosticsCapture> {
  const raw = await readSsrRawPixels(renderer, resources);
  const data = new Float32Array(resources.width * resources.height * 3);
  for (let pixel = 0; pixel < resources.width * resources.height; pixel += 1) {
    const source = pixel * 4;
    const destination = pixel * 3;
    const red = raw[source] ?? 0;
    const green = raw[source + 1] ?? 0;
    const blue = raw[source + 2] ?? 0;
    if (
      !Number.isFinite(red) ||
      !Number.isFinite(green) ||
      !Number.isFinite(blue)
    ) {
      throw new TypeError("SSR color readback contained a non-finite sample.");
    }
    data[destination] = red;
    data[destination + 1] = green;
    data[destination + 2] = blue;
  }
  return Object.freeze({
    name: "ssr-color",
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES["ssr-color"].format,
    data,
  });
}

async function readSsrRoughnessCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
): Promise<DiagnosticsSsrRoughnessCapture> {
  const raw = await readAttachmentPixels(
    renderer,
    resources,
    resources.viewNormalTextureIndex,
  );
  if (!(raw instanceof Uint16Array) && !(raw instanceof Float32Array)) {
    throw new TypeError(
      "SSR roughness readback did not return Float16 or Float32 data.",
    );
  }
  const channels = inferReadbackChannels(
    raw.length,
    resources.width,
    resources.height,
  );
  const packed = compactRows(raw, resources.width, resources.height, channels);
  const data = new Float32Array(resources.width * resources.height);
  for (let pixel = 0; pixel < data.length; pixel += 1) {
    const value =
      raw instanceof Uint16Array
        ? DataUtils.fromHalfFloat(packed[pixel * channels + 3] ?? 0)
        : (packed[pixel * channels + 3] ?? 0);
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "SSR roughness readback contained a non-finite sample.",
      );
    }
    data[pixel] = value;
  }
  return Object.freeze({
    name: "ssr-roughness",
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES["ssr-roughness"].format,
    data,
  });
}

type ReadbackArray = Uint8Array | Uint16Array | Float32Array;

async function readAttachmentPixels(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
  textureIndex: number,
): Promise<ReadbackArray> {
  const isRg8 =
    textureIndex === resources.opticalDiagnosticsATextureIndex ||
    textureIndex === resources.opticalDiagnosticsBTextureIndex;
  if (isRg8 && resources.width % 2 !== 0) {
    return readOddWidthRg8Attachment(
      renderer,
      resources.scenePass.renderTarget,
      resources.width,
      resources.height,
      textureIndex,
    );
  }
  const raw = await renderer.readRenderTargetPixelsAsync(
    resources.scenePass.renderTarget,
    0,
    0,
    resources.width,
    resources.height,
    textureIndex,
  );
  if (
    raw instanceof Uint8Array ||
    raw instanceof Uint16Array ||
    raw instanceof Float32Array
  ) {
    return raw;
  }
  throw new TypeError(
    "Optical attachment readback used an unsupported array type.",
  );
}

async function readOddWidthRg8Attachment(
  renderer: Renderer,
  renderTarget: RenderTarget,
  width: number,
  height: number,
  textureIndex: number,
): Promise<Uint8Array> {
  if (width < 3) {
    throw new RangeError(
      "Odd-width RG8 optical diagnostics require at least three pixels for a 4-byte-aligned readback.",
    );
  }
  const evenWidth = width - 1;
  const left = await renderer.readRenderTargetPixelsAsync(
    renderTarget,
    0,
    0,
    evenWidth,
    height,
    textureIndex,
  );
  const right = await renderer.readRenderTargetPixelsAsync(
    renderTarget,
    evenWidth - 1,
    0,
    2,
    height,
    textureIndex,
  );
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) {
    throw new TypeError("RG8 readback did not return 8-bit data.");
  }
  const leftChannels = inferReadbackChannels(left.length, evenWidth, height);
  const rightChannels = inferReadbackChannels(right.length, 2, height);
  const leftPacked = compactRows(left, evenWidth, height, leftChannels);
  const rightPacked = compactRows(right, 2, height, rightChannels);
  const channels = leftChannels;
  const packed = new Uint8Array(width * height * channels);
  for (let row = 0; row < height; row += 1) {
    packed.set(
      leftPacked.subarray(
        row * evenWidth * leftChannels,
        (row + 1) * evenWidth * leftChannels,
      ),
      row * width * channels,
    );
    const destination = row * width * channels + evenWidth * channels;
    const source = row * 2 * rightChannels + rightChannels;
    for (let channel = 0; channel < channels; channel += 1) {
      packed[destination + channel] = rightPacked[source + channel] ?? 0;
    }
  }
  return packed;
}

async function readOpticalScalarCapture(
  renderer: Renderer,
  resources: PreparedWaterPresentationResources,
  name: DiagnosticsOpticalScalarCapture["name"],
  textureIndex: number,
  channel: number,
): Promise<DiagnosticsOpticalScalarCapture> {
  if (channel > 2) {
    throw new RangeError(
      "Optical scalar evidence must use an RGB channel; transparent MRT alpha is coverage.",
    );
  }
  const data = new Float32Array(resources.width * resources.height);
  const raw = await readAttachmentPixels(renderer, resources, textureIndex);
  if (raw instanceof Uint16Array) {
    const rgba = compactRows(raw, resources.width, resources.height, 4);
    for (let pixel = 0; pixel < data.length; pixel += 1) {
      data[pixel] = DataUtils.fromHalfFloat(rgba[pixel * 4 + channel] ?? 0);
    }
  } else if (raw instanceof Uint8Array) {
    const channels = inferReadbackChannels(
      raw.length,
      resources.width,
      resources.height,
    );
    if (channel >= channels) {
      throw new RangeError(
        "Optical scalar evidence requested a channel outside the packed attachment.",
      );
    }
    const packed = compactRows(
      raw,
      resources.width,
      resources.height,
      channels,
    );
    for (let pixel = 0; pixel < data.length; pixel += 1) {
      data[pixel] = (packed[pixel * channels + channel] ?? 0) / 255;
    }
  } else {
    throw new TypeError(
      "Optical factor readback did not return Float16 or 8-bit data.",
    );
  }
  return Object.freeze({
    name,
    width: resources.width,
    height: resources.height,
    origin: "top-left",
    format: DIAGNOSTICS_CAPTURE_SHAPES[name].format,
    data,
  });
}

function compactRows<ArrayType extends ReadbackArray>(
  data: ArrayType,
  width: number,
  height: number,
  channels: number,
): ArrayType {
  const rowLength = resolvePaddedRowLength(
    data.length,
    width,
    height,
    channels,
  );
  const tightLength = width * channels;
  const Constructor = data.constructor as new (length: number) => ArrayType;
  const result = new Constructor(tightLength * height);
  for (let row = 0; row < height; row += 1) {
    result.set(
      data.subarray(row * rowLength, row * rowLength + tightLength),
      row * tightLength,
    );
  }
  return result;
}

function resolvePaddedRowLength(
  dataLength: number,
  width: number,
  height: number,
  channels: number,
): number {
  const tightLength = width * channels;
  if (height === 1) {
    if (dataLength < tightLength) {
      throw new RangeError("The Core diagnostics readback row is incomplete.");
    }
    return tightLength;
  }
  const rowLength = (dataLength - tightLength) / (height - 1);
  if (!Number.isInteger(rowLength) || rowLength < tightLength) {
    throw new RangeError(
      "The Core diagnostics readback row layout is invalid.",
    );
  }
  return rowLength;
}

function inferReadbackChannels(
  dataLength: number,
  width: number,
  height: number,
): 2 | 4 {
  for (const channels of [4, 2] as const) {
    try {
      resolvePaddedRowLength(dataLength, width, height, channels);
      return channels;
    } catch {
      // Try the next packed layout.
    }
  }
  throw new RangeError(
    "Packed attachment readback did not match an RG or RGBA row layout.",
  );
}

function assertCoreScenePassColorByteBudget(
  textures: readonly { readonly format: number; readonly type: number }[],
): void {
  const formats = textures.map(colorAttachmentFormat);
  if (
    formats.length !== CORE_SCENE_PASS_COLOR_ATTACHMENT_FORMATS.length ||
    formats.some(
      (format, index) =>
        format !== CORE_SCENE_PASS_COLOR_ATTACHMENT_FORMATS[index],
    )
  ) {
    throw new TypeError(
      `Core scene-pass MRT formats were ${formats.join(", ")}; expected ${CORE_SCENE_PASS_COLOR_ATTACHMENT_FORMATS.join(", ")}.`,
    );
  }
  const bytesPerSample = calculateColorAttachmentBytesPerSample(formats);
  if (bytesPerSample > CORE_WEBGPU_MAX_COLOR_ATTACHMENT_BYTES_PER_SAMPLE) {
    throw new RangeError(
      `Core scene-pass MRT uses ${String(bytesPerSample)} bytes/sample; Core WebGPU maxColorAttachmentBytesPerSample is ${String(CORE_WEBGPU_MAX_COLOR_ATTACHMENT_BYTES_PER_SAMPLE)}.`,
    );
  }
}

function calculateColorAttachmentBytesPerSample(
  formats: readonly (typeof CORE_SCENE_PASS_COLOR_ATTACHMENT_FORMATS)[number][],
): number {
  const layout = {
    rgba16float: { pixelByteCost: 8, componentAlignment: 2 },
    r32float: { pixelByteCost: 4, componentAlignment: 4 },
    rg16float: { pixelByteCost: 4, componentAlignment: 2 },
    rg8unorm: { pixelByteCost: 2, componentAlignment: 1 },
  } as const;
  let bytesPerSample = 0;
  for (const format of formats) {
    const next = layout[format];
    bytesPerSample =
      Math.ceil(bytesPerSample / next.componentAlignment) *
        next.componentAlignment +
      next.pixelByteCost;
  }
  return bytesPerSample;
}

function colorAttachmentFormat(texture: {
  readonly format: number;
  readonly type: number;
}): (typeof CORE_SCENE_PASS_COLOR_ATTACHMENT_FORMATS)[number] {
  if (texture.format === RGFormat && texture.type === HalfFloatType) {
    return "rg16float";
  }
  if (texture.format === RGFormat && texture.type === UnsignedByteType) {
    return "rg8unorm";
  }
  if (texture.format === RGBAFormat && texture.type === HalfFloatType) {
    return "rgba16float";
  }
  throw new TypeError(
    "Core scene-pass color attachment uses an unsupported format for the Core WebGPU byte budget.",
  );
}

function textureIndex(
  renderTarget: ReturnType<typeof pass>["renderTarget"],
  name: string,
): number {
  const index = renderTarget.textures.findIndex(
    (candidate) => candidate.name === name,
  );
  if (index < 0) {
    throw new Error(`The prepared scene-pass attachment is missing: ${name}`);
  }
  return index;
}

function assertNativeTraaCamera(camera: PerspectiveCamera): void {
  if (camera.view !== null && camera.view.enabled) {
    throw new Error(
      "The Native Core TRAA route refuses a camera that already has a tiled view offset.",
    );
  }
}

function restoreVelocityProjection(): void {
  velocity.setProjectionMatrix(null);
}

interface HostState {
  readonly renderTarget: ReturnType<Renderer["getRenderTarget"]>;
  readonly activeCubeFace: number;
  readonly activeMipmapLevel: number;
  readonly mrt: ReturnType<Renderer["getMRT"]>;
  readonly toneMapping: Renderer["toneMapping"];
  readonly toneMappingExposure: number;
  readonly outputColorSpace: Renderer["outputColorSpace"];
  readonly autoClear: boolean;
  readonly clearColor: Color;
  readonly clearAlpha: number;
  readonly renderObjectFunction: ReturnType<
    Renderer["getRenderObjectFunction"]
  >;
  readonly scissorTest: boolean;
  readonly pixelRatio: number;
  readonly transparent: boolean;
  readonly opaque: boolean;
  readonly contextNode: Renderer["contextNode"];
  readonly xrEnabled: boolean;
  readonly sceneName: string;
  readonly sceneOverrideMaterial: Scene["overrideMaterial"];
  readonly cameraLayerMask: number;
  readonly cameraAspect: number;
  readonly cameraView: PerspectiveCamera["view"];
  readonly cameraProjectionMatrix: Matrix4;
  readonly cameraProjectionMatrixInverse: Matrix4;
}

interface CameraProjectionState {
  readonly aspect: number;
  readonly view: PerspectiveCamera["view"];
  readonly projectionMatrix: Matrix4;
  readonly projectionMatrixInverse: Matrix4;
}

function captureCameraProjection(
  camera: PerspectiveCamera,
): CameraProjectionState {
  return {
    aspect: camera.aspect,
    view: camera.view === null ? null : { ...camera.view },
    projectionMatrix: camera.projectionMatrix.clone(),
    projectionMatrixInverse: camera.projectionMatrixInverse.clone(),
  };
}

function restoreCameraProjection(
  camera: PerspectiveCamera,
  state: CameraProjectionState,
): void {
  camera.aspect = state.aspect;
  if (state.view === null) {
    camera.view = null;
  } else {
    camera.view = { ...state.view };
  }
  camera.projectionMatrix.copy(state.projectionMatrix);
  camera.projectionMatrixInverse.copy(state.projectionMatrixInverse);
}

export function captureHostState(
  renderer: Renderer,
  scene: Scene,
  camera: PerspectiveCamera,
): HostState {
  const cameraState = captureCameraProjection(camera);
  return {
    renderTarget: renderer.getRenderTarget(),
    activeCubeFace: renderer.getActiveCubeFace(),
    activeMipmapLevel: renderer.getActiveMipmapLevel(),
    mrt: renderer.getMRT(),
    toneMapping: renderer.toneMapping,
    toneMappingExposure:
      typeof renderer.toneMappingExposure === "number"
        ? renderer.toneMappingExposure
        : 1,
    outputColorSpace: renderer.outputColorSpace,
    autoClear: renderer.autoClear,
    clearColor:
      typeof renderer.getClearColor === "function"
        ? renderer.getClearColor(new Color())
        : new Color(),
    clearAlpha:
      typeof renderer.getClearAlpha === "function"
        ? renderer.getClearAlpha()
        : 1,
    renderObjectFunction:
      typeof renderer.getRenderObjectFunction === "function"
        ? renderer.getRenderObjectFunction()
        : null,
    scissorTest:
      typeof renderer.getScissorTest === "function"
        ? renderer.getScissorTest()
        : false,
    pixelRatio:
      typeof renderer.getPixelRatio === "function"
        ? renderer.getPixelRatio()
        : 1,
    transparent: renderer.transparent,
    opaque: renderer.opaque,
    contextNode: renderer.contextNode,
    xrEnabled: renderer.xr.enabled,
    sceneName: scene.name,
    sceneOverrideMaterial: scene.overrideMaterial,
    cameraLayerMask: camera.layers.mask,
    cameraAspect: cameraState.aspect,
    cameraView: cameraState.view,
    cameraProjectionMatrix: cameraState.projectionMatrix,
    cameraProjectionMatrixInverse: cameraState.projectionMatrixInverse,
  };
}

export function restoreHostState(
  renderer: Renderer,
  scene: Scene,
  camera: PerspectiveCamera,
  state: HostState,
): void {
  renderer.setRenderTarget(
    state.renderTarget,
    state.activeCubeFace,
    state.activeMipmapLevel,
  );
  renderer.setMRT(state.mrt);
  renderer.toneMapping = state.toneMapping;
  renderer.toneMappingExposure = state.toneMappingExposure;
  renderer.outputColorSpace = state.outputColorSpace;
  renderer.autoClear = state.autoClear;
  if (typeof renderer.setClearColor === "function") {
    renderer.setClearColor(state.clearColor, state.clearAlpha);
  }
  if (typeof renderer.setRenderObjectFunction === "function") {
    renderer.setRenderObjectFunction(state.renderObjectFunction);
  }
  if (typeof renderer.setScissorTest === "function") {
    renderer.setScissorTest(state.scissorTest);
  }
  if (typeof renderer.setPixelRatio === "function") {
    renderer.setPixelRatio(state.pixelRatio);
  }
  renderer.transparent = state.transparent;
  renderer.opaque = state.opaque;
  renderer.contextNode = state.contextNode;
  renderer.xr.enabled = state.xrEnabled;
  scene.name = state.sceneName;
  scene.overrideMaterial = state.sceneOverrideMaterial;
  camera.layers.mask = state.cameraLayerMask;
  restoreCameraProjection(camera, {
    aspect: state.cameraAspect,
    view: state.cameraView,
    projectionMatrix: state.cameraProjectionMatrix,
    projectionMatrixInverse: state.cameraProjectionMatrixInverse,
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Three Host preparation was cancelled.");
  }
}
