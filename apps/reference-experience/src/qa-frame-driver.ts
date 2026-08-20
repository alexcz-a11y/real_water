import type { PerspectiveCamera, Scene } from "three";
import {
  DataUtils,
  FloatType,
  HalfFloatType,
  LinearSRGBColorSpace,
  RGBAFormat,
  RGFormat,
  RedFormat,
  RenderPipeline,
  RenderTarget,
  UnsignedByteType,
  Vector2,
  type Renderer,
  type WebGPURenderer,
} from "three/webgpu";
import {
  linearDepth,
  mrt,
  normalView,
  output,
  pass,
  texture,
  vec4,
} from "three/tsl";
import {
  calculateColorAttachmentBytesPerSample,
  CORE_WEBGPU_MAX_COLOR_ATTACHMENT_BYTES_PER_SAMPLE,
  QA_FRAME_CAPTURE_SHAPES,
  QA_FRAME_FIXED_TICK_HZ,
  QA_SCENE_PASS_COLOR_ATTACHMENT_FORMATS,
  isQaFrameCaptureName,
  isQaFrameSeed,
  isQaFrameTickCount,
  type QaFrameCaptureName,
  type QaScenePassColorAttachmentFormat,
} from "./qa-frame-contract.js";
import type { QaHostSimulationController } from "./qa-simulation-controller.js";

const QA_FRAME_PREWARM_DECLARATIONS = Object.freeze([
  Object.freeze({
    id: "qa-final-color-target" as const,
    kind: "resource" as const,
    format: "rgba8unorm-srgb" as const,
    size: "drawing-buffer-exact" as const,
  }),
  Object.freeze({
    id: "qa-inverse-linear-depth-target" as const,
    kind: "resource" as const,
    format: "r32float" as const,
    size: "drawing-buffer-exact" as const,
  }),
  Object.freeze({
    id: "qa-view-normal-target" as const,
    kind: "resource" as const,
    format: "rg16float" as const,
    size: "drawing-buffer-exact" as const,
  }),
  Object.freeze({
    id: "qa-optical-factors-target" as const,
    kind: "resource" as const,
    format: "rgba16float" as const,
    size: "drawing-buffer-exact" as const,
  }),
  Object.freeze({
    id: "qa-optical-diagnostics-a-target" as const,
    kind: "resource" as const,
    format: "rg8unorm" as const,
    size: "drawing-buffer-exact" as const,
  }),
  Object.freeze({
    id: "qa-optical-diagnostics-b-target" as const,
    kind: "resource" as const,
    format: "rg8unorm" as const,
    size: "drawing-buffer-exact" as const,
  }),
  Object.freeze({
    id: "qa-single-mrt-composition" as const,
    kind: "conditional-route" as const,
  }),
  Object.freeze({
    id: "qa-transform-free-canvas-blit" as const,
    kind: "conditional-route" as const,
  }),
  Object.freeze({
    id: "qa-eight-hidden-stabilization-frames" as const,
    kind: "effect-state" as const,
  }),
  Object.freeze({
    id: "qa-named-buffer-completion-probes" as const,
    kind: "conditional-route" as const,
  }),
  Object.freeze({
    id: "qa-main-camera-guard" as const,
    kind: "conditional-route" as const,
  }),
]);

export const QA_FRAME_PREWARM_MANIFEST = Object.freeze({
  schema: "real-water/qa-frame-prewarm" as const,
  version: 2 as const,
  id: "reference-qa-frame" as const,
  declarations: QA_FRAME_PREWARM_DECLARATIONS,
  captures: Object.freeze([
    Object.freeze({
      name: "final-color" as const,
      preparedFormat: "rgba8unorm-srgb" as const,
    }),
    Object.freeze({
      name: "depth" as const,
      preparedFormat: "r32float-inverse-linear-view" as const,
    }),
    Object.freeze({
      name: "normal" as const,
      preparedFormat: "rg16float-view-normal" as const,
    }),
    Object.freeze({
      name: "optical-fresnel" as const,
      preparedFormat: "rgba16float-optical-factors" as const,
    }),
    Object.freeze({
      name: "optical-thickness" as const,
      preparedFormat: "rgba16float-optical-factors" as const,
    }),
    Object.freeze({
      name: "optical-scattering" as const,
      preparedFormat: "rg8unorm-optical-diagnostics-b" as const,
    }),
    Object.freeze({
      name: "optical-environment-reflection" as const,
      preparedFormat: "rg8unorm-optical-diagnostics-b" as const,
    }),
    Object.freeze({
      name: "optical-crest-transmission" as const,
      preparedFormat: "rg8unorm-optical-diagnostics-a" as const,
    }),
    Object.freeze({
      name: "optical-transmittance" as const,
      preparedFormat: "rg8unorm-optical-diagnostics-a" as const,
    }),
    Object.freeze({
      name: "optical-glint" as const,
      preparedFormat: "rgba16float-optical-factors" as const,
    }),
  ]),
});

export type QaFrameDriverCaptureName = QaFrameCaptureName;

interface QaFrameDriverCaptureBase {
  readonly width: number;
  readonly height: number;
  readonly origin: "top-left";
}

export interface QaFrameDriverFinalColorCapture extends QaFrameDriverCaptureBase {
  readonly name: "final-color";
  readonly format: "rgba8unorm-srgb";
  readonly data: Uint8Array;
}

export interface QaFrameDriverDepthCapture extends QaFrameDriverCaptureBase {
  readonly name: "depth";
  readonly format: "r32float-linear-view";
  readonly data: Float32Array;
}

export interface QaFrameDriverNormalCapture extends QaFrameDriverCaptureBase {
  readonly name: "normal";
  readonly format: "rgb32float-view-normal";
  readonly data: Float32Array;
}

export interface QaFrameDriverOpticalScalarCapture extends QaFrameDriverCaptureBase {
  readonly name:
    | "optical-fresnel"
    | "optical-thickness"
    | "optical-scattering"
    | "optical-environment-reflection"
    | "optical-crest-transmission"
    | "optical-transmittance"
    | "optical-glint";
  readonly format: "r32float-optical";
  readonly data: Float32Array;
}

export type QaFrameDriverCapture =
  | QaFrameDriverFinalColorCapture
  | QaFrameDriverDepthCapture
  | QaFrameDriverNormalCapture
  | QaFrameDriverOpticalScalarCapture;

export interface QaFrameDriverStateReceipt {
  readonly seed: number;
  readonly tick: number;
  readonly timeSeconds: number;
}

export interface QaRendererDeviceInventory {
  readonly features: readonly string[];
  readonly limits: Readonly<Record<string, number>>;
}

export interface QaFramePrewarmReceipt {
  readonly manifest: typeof QA_FRAME_PREWARM_MANIFEST;
  readonly width: number;
  readonly height: number;
  readonly rendererDevice: QaRendererDeviceInventory | null;
  readonly progress: Readonly<{
    readonly completedWork: number;
    readonly totalWork: number;
    readonly completedDeclarationIds: readonly string[];
  }>;
}

export interface QaFrameDriverPresentedFrame extends QaFrameDriverStateReceipt {
  readonly presentationId: number;
  readonly manifestHash: string;
  readonly compileCount: number;
  readonly probeCount: number;
  readonly prewarm: QaFramePrewarmReceipt;
  readonly captures: readonly QaFrameDriverCapture[];
}

export interface QaFrameDriver {
  readonly fixedTickHz: typeof QA_FRAME_FIXED_TICK_HZ;
  readonly prewarm: QaFramePrewarmReceipt;
  reset(request: { readonly seed: number }): Promise<QaFrameDriverStateReceipt>;
  present(request: {
    readonly advanceFixedTicks: number;
    readonly captures: readonly QaFrameDriverCaptureName[];
  }): Promise<QaFrameDriverPresentedFrame>;
  dispose(): Promise<void>;
}

export interface CreateQaFrameDriverOptions {
  readonly renderer: WebGPURenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly manifestHash: string;
  readonly signal: AbortSignal;
  readonly simulation: QaHostSimulationController;
}

interface PreparedQaResources {
  readonly compositionPipeline: RenderPipeline;
  readonly presentationPipeline: RenderPipeline;
  readonly finalColorTarget: RenderTarget;
  readonly scenePass: ReturnType<typeof pass>;
  readonly inverseLinearDepthTextureIndex: number;
  readonly viewNormalTextureIndex: number;
  readonly opticalFactorsTextureIndex: number;
  readonly opticalDiagnosticsATextureIndex: number;
  readonly opticalDiagnosticsBTextureIndex: number;
  readonly width: number;
  readonly height: number;
}

const INVERSE_LINEAR_DEPTH_ATTACHMENT = "Real Water QA inverse linear depth";
const VIEW_NORMAL_ATTACHMENT = "Real Water QA view normal";
const OPTICAL_FACTORS_ATTACHMENT = "Real Water optical factors";
const OPTICAL_DIAGNOSTICS_A_ATTACHMENT = "Real Water optical diagnostics A";
const OPTICAL_DIAGNOSTICS_B_ATTACHMENT = "Real Water optical diagnostics B";
const HIDDEN_STABILIZATION_FRAME_COUNT = 8;

export async function createQaFrameDriver(
  options: CreateQaFrameDriverOptions,
): Promise<QaFrameDriver> {
  const renderer = options.renderer as unknown as Renderer;
  const hostCounters = installRendererCounters(renderer);
  const initialHostState = captureHostState(
    renderer,
    options.scene,
    options.camera,
  );
  let resources: PreparedQaResources | null = null;
  const partialDisposals: Array<() => void> = [];

  try {
    throwIfAborted(options.signal);
    const size = readDrawingBufferSize(renderer);
    const progress = createPrewarmProgress(size.width, size.height);
    const scenePass = pass(options.scene, options.camera);
    partialDisposals.push(() => scenePass.dispose());
    // PassNode defaults to one scene render per rAF. QA presents are explicit
    // command/query ticks, so the scene pass must run on every present.
    scenePass.updateBeforeType = "render";
    scenePass.setSize(size.width, size.height);
    scenePass.setMRT(
      mrt({
        output,
        [INVERSE_LINEAR_DEPTH_ATTACHMENT]: linearDepth().oneMinus(),
        [VIEW_NORMAL_ATTACHMENT]: vec4(normalView.x, normalView.y, 0, 1),
        [OPTICAL_FACTORS_ATTACHMENT]: vec4(0, 0, 0, 1),
        [OPTICAL_DIAGNOSTICS_A_ATTACHMENT]: vec4(0, 0, 0, 1),
        [OPTICAL_DIAGNOSTICS_B_ATTACHMENT]: vec4(0, 0, 0, 1),
      }),
    );
    const inverseLinearDepthTexture = scenePass.getTexture(
      INVERSE_LINEAR_DEPTH_ATTACHMENT,
    );
    inverseLinearDepthTexture.format = RedFormat;
    inverseLinearDepthTexture.type = FloatType;
    const outputTexture = scenePass.getTexture("output");
    outputTexture.format = RGBAFormat;
    outputTexture.type = HalfFloatType;
    const viewNormalTexture = scenePass.getTexture(VIEW_NORMAL_ATTACHMENT);
    viewNormalTexture.format = RGFormat;
    viewNormalTexture.type = HalfFloatType;
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
    assertQaScenePassColorByteBudget(scenePass.renderTarget.textures);
    const sceneColor = scenePass.getTextureNode("output");
    const finalColorTarget = new RenderTarget(size.width, size.height, {
      depthBuffer: false,
      stencilBuffer: false,
      type: UnsignedByteType,
    });
    partialDisposals.push(() => finalColorTarget.dispose());
    finalColorTarget.texture.name = "Real Water QA final color";
    const compositionPipeline = new RenderPipeline(renderer, sceneColor);
    partialDisposals.push(() => compositionPipeline.dispose());
    const presentationPipeline = new RenderPipeline(
      renderer,
      texture(finalColorTarget.texture),
    );
    partialDisposals.push(() => presentationPipeline.dispose());
    presentationPipeline.outputColorTransform = false;
    resources = {
      compositionPipeline,
      presentationPipeline,
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
      width: size.width,
      height: size.height,
    };

    await scenePass.compileAsync(renderer);
    throwIfAborted(options.signal);
    renderPreparedFrame(renderer, resources);
    await probePreparedCaptures(renderer, resources);
    throwIfAborted(options.signal);
    progress.complete("qa-final-color-target");
    progress.complete("qa-inverse-linear-depth-target");
    progress.complete("qa-view-normal-target");
    progress.complete("qa-optical-factors-target");
    progress.complete("qa-optical-diagnostics-a-target");
    progress.complete("qa-optical-diagnostics-b-target");
    progress.complete("qa-single-mrt-composition");
    progress.complete("qa-transform-free-canvas-blit");

    for (let frame = 0; frame < HIDDEN_STABILIZATION_FRAME_COUNT; frame += 1) {
      renderPreparedFrame(renderer, resources);
      throwIfAborted(options.signal);
    }
    progress.complete("qa-eight-hidden-stabilization-frames");

    await probePreparedCaptures(renderer, resources);
    throwIfAborted(options.signal);
    progress.complete("qa-named-buffer-completion-probes");

    renderPreparedFrame(renderer, resources);
    await probeCompletedFrame(renderer, resources.finalColorTarget);
    throwIfAborted(options.signal);
    progress.complete("qa-main-camera-guard");
    const prewarm = progress.finish(
      readRendererDeviceInventory(options.renderer),
    );

    restoreHostState(renderer, options.scene, options.camera, initialHostState);
    return createPreparedDriver(options, resources, prewarm, hostCounters);
  } catch (cause) {
    if (resources !== null) {
      try {
        disposeResources(resources);
      } catch {
        // Preserve the authoritative preparation failure.
      }
    } else {
      for (const dispose of partialDisposals.reverse()) {
        try {
          dispose();
        } catch {
          // Preserve the authoritative preparation failure.
        }
      }
    }
    try {
      restoreHostState(
        renderer,
        options.scene,
        options.camera,
        initialHostState,
      );
    } catch {
      // Preserve the authoritative preparation failure.
    }
    throw cause;
  }
}

function createPreparedDriver(
  options: CreateQaFrameDriverOptions,
  resources: PreparedQaResources,
  prewarm: QaFramePrewarmReceipt,
  hostCounters: RendererHostCounters,
): QaFrameDriver {
  const renderer = options.renderer as unknown as Renderer;
  let accepting = true;
  let disposal: Promise<void> | undefined;
  let presentationId = 0;
  let queue = Promise.resolve();
  let reset = false;

  const enqueue = <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    if (!accepting) {
      return Promise.reject(
        new Error("The QA frame driver has been disposed."),
      );
    }
    const result = queue.then(operation);
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  };

  const driver: QaFrameDriver = {
    fixedTickHz: QA_FRAME_FIXED_TICK_HZ,
    prewarm,
    reset(request) {
      const nextSeed = request.seed;
      assertSeed(nextSeed);
      return enqueue(async () => {
        reset = true;
        const state = options.simulation.reset(nextSeed);
        return Object.freeze({
          seed: state.seed,
          tick: state.tick,
          timeSeconds: state.timeSeconds,
        });
      });
    },
    present(request) {
      const advance = request.advanceFixedTicks;
      const requestedCaptures = [...request.captures];
      return enqueue(async () => {
        if (!reset) {
          throw new Error("Reset the QA frame driver before presentation.");
        }
        const current = options.simulation.snapshot();
        assertTickAdvance(advance, current.tick);
        assertCaptureNames(requestedCaptures);
        assertPreparedDrawingBufferSize(renderer, resources);
        const nextState = options.simulation.advance(advance);
        const state = captureHostState(renderer, options.scene, options.camera);
        let captures: QaFrameDriverCapture[];
        try {
          renderPreparedFrame(renderer, resources);
          captures = [];
          for (const name of requestedCaptures) {
            captures.push(
              await readCapture(renderer, options.camera, resources, name),
            );
          }
        } finally {
          restoreHostState(renderer, options.scene, options.camera, state);
        }
        presentationId += 1;
        return Object.freeze({
          seed: nextState.seed,
          tick: nextState.tick,
          timeSeconds: nextState.timeSeconds,
          presentationId,
          manifestHash: options.manifestHash,
          compileCount: hostCounters.compileCount,
          probeCount: hostCounters.probeCount,
          prewarm,
          captures: Object.freeze(captures),
        });
      });
    },
    dispose(): Promise<void> {
      accepting = false;
      disposal ??= queue.then(() => {
        disposeResources(resources);
      });
      return disposal;
    },
  };
  return Object.freeze(driver);
}

function renderPreparedFrame(
  renderer: Renderer,
  resources: PreparedQaResources,
): void {
  renderer.setRenderTarget(resources.finalColorTarget);
  resources.compositionPipeline.render();
  renderer.setRenderTarget(null);
  resources.presentationPipeline.render();
}

interface PrewarmProgressRecorder {
  complete(declarationId: string): void;
  finish(
    rendererDevice: QaRendererDeviceInventory | null,
  ): QaFramePrewarmReceipt;
}

function createPrewarmProgress(
  width: number,
  height: number,
): PrewarmProgressRecorder {
  const expectedIds = QA_FRAME_PREWARM_MANIFEST.declarations.map(
    ({ id }) => id,
  );
  const completedIds: string[] = [];

  return Object.freeze({
    complete(declarationId: string): void {
      const expected = expectedIds[completedIds.length];
      if (declarationId !== expected) {
        throw new Error(
          `QA prewarm work completed out of order: expected ${String(expected)}, received ${declarationId}.`,
        );
      }
      completedIds.push(declarationId);
    },
    finish(
      rendererDevice: QaRendererDeviceInventory | null,
    ): QaFramePrewarmReceipt {
      if (completedIds.length !== expectedIds.length) {
        throw new Error("The QA frame Prewarm Manifest is incomplete.");
      }
      return Object.freeze({
        manifest: QA_FRAME_PREWARM_MANIFEST,
        width,
        height,
        rendererDevice,
        progress: Object.freeze({
          completedWork: completedIds.length,
          totalWork: expectedIds.length,
          completedDeclarationIds: Object.freeze([...completedIds]),
        }),
      });
    },
  });
}

async function probePreparedCaptures(
  renderer: Renderer,
  resources: PreparedQaResources,
): Promise<void> {
  await probeCompletedFrame(renderer, resources.finalColorTarget);
  await probeCompletedFrame(
    renderer,
    resources.scenePass.renderTarget,
    resources.inverseLinearDepthTextureIndex,
  );
  await probeCompletedFrame(
    renderer,
    resources.scenePass.renderTarget,
    resources.viewNormalTextureIndex,
  );
  await probeCompletedFrame(
    renderer,
    resources.scenePass.renderTarget,
    resources.opticalFactorsTextureIndex,
  );
  await probeCompletedFrame(
    renderer,
    resources.scenePass.renderTarget,
    resources.opticalDiagnosticsATextureIndex,
  );
  await probeCompletedFrame(
    renderer,
    resources.scenePass.renderTarget,
    resources.opticalDiagnosticsBTextureIndex,
  );
}

async function probeCompletedFrame(
  renderer: Renderer,
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
  if (pixels.length === 0) {
    throw new Error("The QA frame completion probe returned no pixels.");
  }
}

async function readCapture(
  renderer: Renderer,
  camera: PerspectiveCamera,
  resources: PreparedQaResources,
  name: QaFrameDriverCaptureName,
): Promise<QaFrameDriverCapture> {
  switch (name) {
    case "final-color": {
      const raw = await renderer.readRenderTargetPixelsAsync(
        resources.finalColorTarget,
        0,
        0,
        resources.width,
        resources.height,
      );
      if (!(raw instanceof Uint8Array)) {
        throw new TypeError("Final-color readback did not return RGBA8 data.");
      }
      return Object.freeze({
        name,
        width: resources.width,
        height: resources.height,
        origin: "top-left",
        format: QA_FRAME_CAPTURE_SHAPES[name].format,
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
        format: QA_FRAME_CAPTURE_SHAPES[name].format,
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
        format: QA_FRAME_CAPTURE_SHAPES[name].format,
        data,
      });
    }
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

async function readAttachmentPixels(
  renderer: Renderer,
  resources: PreparedQaResources,
  textureIndex: number,
): Promise<QaReadbackArray> {
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
  resources: PreparedQaResources,
  name: QaFrameDriverOpticalScalarCapture["name"],
  textureIndex: number,
  channel: number,
): Promise<QaFrameDriverOpticalScalarCapture> {
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
    format: QA_FRAME_CAPTURE_SHAPES[name].format,
    data,
  });
}

type QaReadbackArray = Uint8Array | Uint16Array | Float32Array;

function compactRows<ArrayType extends QaReadbackArray>(
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
      throw new RangeError("The QA frame readback row is incomplete.");
    }
    return tightLength;
  }
  const rowLength = (dataLength - tightLength) / (height - 1);
  if (!Number.isInteger(rowLength) || rowLength < tightLength) {
    throw new RangeError("The QA frame readback row layout is invalid.");
  }
  return rowLength;
}

function assertQaScenePassColorByteBudget(
  textures: readonly { readonly format: number; readonly type: number }[],
): void {
  const formats = textures.map(colorAttachmentFormat);
  if (
    formats.length !== QA_SCENE_PASS_COLOR_ATTACHMENT_FORMATS.length ||
    formats.some(
      (format, index) =>
        format !== QA_SCENE_PASS_COLOR_ATTACHMENT_FORMATS[index],
    )
  ) {
    throw new TypeError(
      `QA scene-pass MRT formats were ${formats.join(", ")}; expected ${QA_SCENE_PASS_COLOR_ATTACHMENT_FORMATS.join(", ")}.`,
    );
  }
  const bytesPerSample = calculateColorAttachmentBytesPerSample(formats);
  if (bytesPerSample > CORE_WEBGPU_MAX_COLOR_ATTACHMENT_BYTES_PER_SAMPLE) {
    throw new RangeError(
      `QA scene-pass MRT uses ${String(bytesPerSample)} bytes/sample; Core WebGPU maxColorAttachmentBytesPerSample is ${String(CORE_WEBGPU_MAX_COLOR_ATTACHMENT_BYTES_PER_SAMPLE)}.`,
    );
  }
}

function colorAttachmentFormat(texture: {
  readonly format: number;
  readonly type: number;
}): QaScenePassColorAttachmentFormat {
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
  if (texture.format === RGBAFormat && texture.type === UnsignedByteType) {
    return "rgba8unorm";
  }
  throw new TypeError(
    "QA scene-pass color attachment uses an unsupported format for the Core WebGPU byte budget.",
  );
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

interface RendererHostCounters {
  compileCount: number;
  probeCount: number;
}

const RENDERER_DEVICE_LIMIT_NAMES = [
  "maxTextureDimension1D",
  "maxTextureDimension2D",
  "maxTextureDimension3D",
  "maxTextureArrayLayers",
  "maxBindGroups",
  "maxBindingsPerBindGroup",
  "maxDynamicUniformBuffersPerPipelineLayout",
  "maxDynamicStorageBuffersPerPipelineLayout",
  "maxSampledTexturesPerShaderStage",
  "maxSamplersPerShaderStage",
  "maxStorageBuffersPerShaderStage",
  "maxStorageTexturesPerShaderStage",
  "maxUniformBuffersPerShaderStage",
  "maxUniformBufferBindingSize",
  "maxStorageBufferBindingSize",
  "minUniformBufferOffsetAlignment",
  "minStorageBufferOffsetAlignment",
  "maxVertexBuffers",
  "maxBufferSize",
  "maxVertexAttributes",
  "maxVertexBufferArrayStride",
  "maxInterStageShaderVariables",
  "maxColorAttachments",
  "maxColorAttachmentBytesPerSample",
  "maxComputeWorkgroupStorageSize",
  "maxComputeInvocationsPerWorkgroup",
  "maxComputeWorkgroupSizeX",
  "maxComputeWorkgroupSizeY",
  "maxComputeWorkgroupSizeZ",
  "maxComputeWorkgroupsPerDimension",
] as const;

function installRendererCounters(renderer: Renderer): RendererHostCounters {
  const counters: RendererHostCounters = {
    compileCount: 0,
    probeCount: 0,
  };
  const compileAsync = renderer.compileAsync.bind(renderer);
  const readPixels = renderer.readRenderTargetPixelsAsync.bind(renderer);
  renderer.compileAsync = ((...args: Parameters<Renderer["compileAsync"]>) => {
    counters.compileCount += 1;
    return compileAsync(...args);
  }) as Renderer["compileAsync"];
  renderer.readRenderTargetPixelsAsync = ((
    ...args: Parameters<Renderer["readRenderTargetPixelsAsync"]>
  ) => {
    counters.probeCount += 1;
    return readPixels(...args);
  }) as Renderer["readRenderTargetPixelsAsync"];
  return counters;
}

function readRendererDeviceInventory(
  renderer: WebGPURenderer,
): QaRendererDeviceInventory | null {
  const internals = renderer as unknown as {
    readonly backend?: {
      readonly device?: {
        readonly features?: Iterable<string>;
        readonly limits?: Readonly<Record<string, number | undefined>>;
      };
    };
  };
  const device = internals.backend?.device;
  if (device === undefined) {
    return null;
  }
  const features = [...(device.features ?? [])].sort();
  const limits: Record<string, number> = {};
  for (const name of RENDERER_DEVICE_LIMIT_NAMES) {
    const value = device.limits?.[name];
    if (typeof value === "number" && Number.isFinite(value)) {
      limits[name] = value;
    }
  }
  return Object.freeze({
    features: Object.freeze(features),
    limits: Object.freeze(limits),
  });
}

function textureIndex(renderTarget: RenderTarget, name: string): number {
  const index = renderTarget.textures.findIndex(
    (candidate) => candidate.name === name,
  );
  if (index < 0) {
    throw new Error(`The prepared QA capture attachment is missing: ${name}`);
  }
  return index;
}

function readDrawingBufferSize(renderer: Renderer): Readonly<{
  width: number;
  height: number;
}> {
  const size = renderer.getDrawingBufferSize(new Vector2());
  const width = Math.floor(size.width);
  const height = Math.floor(size.height);
  if (width < 1 || height < 1) {
    throw new RangeError(
      "The QA drawing buffer must have positive dimensions.",
    );
  }
  return Object.freeze({ width, height });
}

function assertPreparedDrawingBufferSize(
  renderer: Renderer,
  resources: PreparedQaResources,
): void {
  const current = readDrawingBufferSize(renderer);
  if (
    current.width !== resources.width ||
    current.height !== resources.height
  ) {
    throw new Error(
      "The QA drawing buffer changed after its frame route was prepared.",
    );
  }
}

function assertSeed(seed: number): void {
  if (!isQaFrameSeed(seed)) {
    throw new RangeError("QA frame seeds must be unsigned 32-bit integers.");
  }
}

function assertTickAdvance(advance: number, currentTick: number): void {
  if (
    !isQaFrameTickCount(advance) ||
    !Number.isSafeInteger(currentTick + advance)
  ) {
    throw new RangeError(
      "QA frame tick advances must be non-negative safe integers.",
    );
  }
}

function assertCaptureNames(names: readonly QaFrameDriverCaptureName[]): void {
  if (new Set(names).size !== names.length) {
    throw new TypeError("QA frame capture names must be unique.");
  }
  for (const name of names) {
    if (!isQaFrameCaptureName(name)) {
      throw new TypeError(`Unsupported QA frame capture: ${String(name)}`);
    }
  }
}

function disposeResources(resources: PreparedQaResources): void {
  let firstFailure: unknown;
  for (const dispose of [
    () => resources.presentationPipeline.dispose(),
    () => resources.compositionPipeline.dispose(),
    () => resources.finalColorTarget.dispose(),
    () => resources.scenePass.dispose(),
  ]) {
    try {
      dispose();
    } catch (cause) {
      firstFailure ??= cause;
    }
  }
  if (firstFailure !== undefined) {
    throw firstFailure;
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
  camera: PerspectiveCamera,
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
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("QA frame preparation was cancelled.");
  }
}
