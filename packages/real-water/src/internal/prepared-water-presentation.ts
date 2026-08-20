import {
  DataUtils,
  FloatType,
  HalfFloatType,
  LinearSRGBColorSpace,
  type Matrix4,
  RedFormat,
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
  linearDepth,
  mrt,
  normalView,
  output,
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
import { installHostDiagnosticsRoute } from "./diagnostics-route-bridge.js";
import type { HostPresentationRouteBridge } from "./presentation-route-bridge.js";
import {
  createResettableVelocityTextureNode,
  createTraaJitterAdapter,
  createTraaResetUniform,
  type TraaJitterAdapter,
} from "./traa-r185.js";
import {
  INVERSE_LINEAR_DEPTH_ATTACHMENT,
  MOTION_VECTORS_ATTACHMENT,
  OPTICAL_DIAGNOSTICS_A_ATTACHMENT,
  OPTICAL_DIAGNOSTICS_B_ATTACHMENT,
  OPTICAL_FACTORS_ATTACHMENT,
  VIEW_NORMAL_ATTACHMENT,
} from "./water-optics-rendering.js";

export const PREWARM_HISTORY_EPOCH = 1;
export const HIDDEN_STABILIZATION_FRAME_COUNT = 8;

const CORE_WEBGPU_MAX_COLOR_ATTACHMENT_BYTES_PER_SAMPLE = 32;
const CORE_SCENE_PASS_COLOR_ATTACHMENT_FORMATS = [
  "rgba16float",
  "r32float",
  "rg16float",
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
  readonly inverseLinearDepthTextureIndex: number;
  readonly viewNormalTextureIndex: number;
  readonly motionVectorsTextureIndex: number;
  readonly opticalFactorsTextureIndex: number;
  readonly opticalDiagnosticsATextureIndex: number;
  readonly opticalDiagnosticsBTextureIndex: number;
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
  partial: PartialPreparedWaterPresentationResources,
): {
  readonly resources: PreparedWaterPresentationResources;
  readonly partial: PartialPreparedWaterPresentationResources;
} {
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
      [INVERSE_LINEAR_DEPTH_ATTACHMENT]: linearDepth().oneMinus(),
      [VIEW_NORMAL_ATTACHMENT]: vec4(normalView.x, normalView.y, 0, 1),
      [MOTION_VECTORS_ATTACHMENT]: velocity,
      [OPTICAL_FACTORS_ATTACHMENT]: vec4(0, 0, 0, 1),
      [OPTICAL_DIAGNOSTICS_A_ATTACHMENT]: vec4(0, 0, 0, 1),
      [OPTICAL_DIAGNOSTICS_B_ATTACHMENT]: vec4(0, 0, 0, 1),
    }),
  );
  const outputTexture = scenePass.getTexture("output");
  outputTexture.format = RGBAFormat;
  outputTexture.type = HalfFloatType;
  const inverseLinearDepthTexture = scenePass.getTexture(
    INVERSE_LINEAR_DEPTH_ATTACHMENT,
  );
  inverseLinearDepthTexture.format = RedFormat;
  inverseLinearDepthTexture.type = FloatType;
  const viewNormalTexture = scenePass.getTexture(VIEW_NORMAL_ATTACHMENT);
  viewNormalTexture.format = RGFormat;
  viewNormalTexture.type = HalfFloatType;
  const motionVectorsTexture = scenePass.getTexture(MOTION_VECTORS_ATTACHMENT);
  motionVectorsTexture.format = RGFormat;
  motionVectorsTexture.type = HalfFloatType;
  scenePass.getTextureNode(MOTION_VECTORS_ATTACHMENT);
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

  const beauty = scenePass.getTextureNode("output");
  const depth = scenePass.getTextureNode("depth");
  const actualMotion = scenePass.getTextureNode(MOTION_VECTORS_ATTACHMENT);
  const resetUniform = createTraaResetUniform();
  partial.resetUniform = resetUniform;
  const traaNode = traa(
    beauty,
    depth,
    createResettableVelocityTextureNode(actualMotion, resetUniform),
    camera,
  );
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
    texture(scenePass.getTexture("output")),
  );
  partial.currentColorPipeline = currentColorPipeline;
  const presentationPipeline = new RenderPipeline(
    renderer,
    texture(finalColorTarget.texture),
  );
  partial.presentationPipeline = presentationPipeline;
  presentationPipeline.outputColorTransform = false;

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
    inverseLinearDepthTextureIndex: textureIndex(
      scenePass.renderTarget,
      INVERSE_LINEAR_DEPTH_ATTACHMENT,
    ),
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
    width: drawingBuffer.width,
    height: drawingBuffer.height,
    counters,
  };
  return { resources, partial };
}

export async function compileAndPrimePreparedWaterPresentation(
  renderer: Renderer,
  camera: PerspectiveCamera,
  resources: PreparedWaterPresentationResources,
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  resources.counters.compileCount += 1;
  await resources.scenePass.compileAsync(renderer);
  throwIfAborted(signal);
  resources.resetUniform.value = 1;
  renderTemporalFrame(renderer, camera, resources);
  resources.resetUniform.value = 0;
  renderCurrentColorConversion(renderer, resources);
  await probeNamedOutputRoutes(renderer, resources);
  throwIfAborted(signal);
}

export function renderHiddenStabilizationFrames(
  renderer: Renderer,
  camera: PerspectiveCamera,
  resources: PreparedWaterPresentationResources,
  signal: AbortSignal,
): void {
  for (let frame = 0; frame < HIDDEN_STABILIZATION_FRAME_COUNT; frame += 1) {
    renderTemporalFrame(renderer, camera, resources);
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
  camera: PerspectiveCamera,
  resources: PreparedWaterPresentationResources,
  signal: AbortSignal,
): Promise<void> {
  renderTemporalFrame(renderer, camera, resources);
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
      renderTemporalFrame(renderer, camera, resources);
      if (accepted.outputs.includes("current-color")) {
        renderCurrentColorConversion(renderer, resources);
      }
      renderer.setRenderTarget(null);
      resources.presentationPipeline.render();
      for (const name of accepted.outputs) {
        outputs.push(await readNamedOutput(renderer, camera, resources, name));
        resources.counters.diagnosticReadbackCount += 1;
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
  resources.scenePass.dispose();
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
    () => resources.scenePass?.dispose(),
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
  camera: PerspectiveCamera,
  resources: PreparedWaterPresentationResources,
): void {
  assertNativeTraaCamera(camera);
  const cameraState = captureCameraProjection(camera);
  resources.jitterAdapter.beginTemporalRender();
  let succeeded = false;
  try {
    try {
      renderer.setRenderTarget(resources.finalColorTarget);
      resources.temporalPipeline.render();
      resources.counters.sceneRenderCount += 1;
      succeeded = true;
    } catch (cause) {
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
    resources.scenePass.renderTarget,
    resources.inverseLinearDepthTextureIndex,
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
        resources.scenePass.renderTarget,
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
        const reconstructed = reconstructFrontFacingViewNormal(
          DataUtils.fromHalfFloat(packed[source] ?? 0),
          DataUtils.fromHalfFloat(packed[source + 1] ?? 0),
        );
        data[destination] = reconstructed[0];
        data[destination + 1] = reconstructed[1];
        data[destination + 2] = reconstructed[2];
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
  for (const channels of [2, 4] as const) {
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

function reconstructFrontFacingViewNormal(
  x: number,
  y: number,
): readonly [number, number, number] {
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  const length = Math.hypot(x, y, z);
  if (length === 0) {
    return [0, 0, 1];
  }
  return [x / length, y / length, z / length];
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
  if (texture.format === RedFormat && texture.type === FloatType) {
    return "r32float";
  }
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
  readonly outputColorSpace: Renderer["outputColorSpace"];
  readonly autoClear: boolean;
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
    camera.clearViewOffset();
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
    outputColorSpace: renderer.outputColorSpace,
    autoClear: renderer.autoClear,
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
  renderer.outputColorSpace = state.outputColorSpace;
  renderer.autoClear = state.autoClear;
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
