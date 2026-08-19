import type { PerspectiveCamera, Scene } from "three";
import {
  DataUtils,
  FloatType,
  HalfFloatType,
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
  uniform,
  vec4,
} from "three/tsl";
import {
  QA_FRAME_CAPTURE_SHAPES,
  QA_FRAME_FIXED_TICK_HZ,
  isQaFrameCaptureName,
  isQaFrameSeed,
  isQaFrameTickCount,
  type QaFrameCaptureName,
} from "./qa-frame-contract.js";

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
    format: "rgba16float" as const,
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
  version: 1 as const,
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
      preparedFormat: "rgba16float-view-normal" as const,
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

export type QaFrameDriverCapture =
  | QaFrameDriverFinalColorCapture
  | QaFrameDriverDepthCapture
  | QaFrameDriverNormalCapture;

export interface QaFrameDriverStateReceipt {
  readonly seed: number;
  readonly tick: number;
}

export interface QaFramePrewarmReceipt {
  readonly manifest: typeof QA_FRAME_PREWARM_MANIFEST;
  readonly width: number;
  readonly height: number;
  readonly progress: Readonly<{
    readonly completedWork: number;
    readonly totalWork: number;
    readonly completedDeclarationIds: readonly string[];
  }>;
}

export interface QaFrameDriverPresentedFrame extends QaFrameDriverStateReceipt {
  readonly presentationId: number;
  readonly manifestHash: string;
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
}

interface PreparedQaResources {
  readonly compositionPipeline: RenderPipeline;
  readonly presentationPipeline: RenderPipeline;
  readonly finalColorTarget: RenderTarget;
  readonly scenePass: ReturnType<typeof pass>;
  readonly inverseLinearDepthTextureIndex: number;
  readonly viewNormalTextureIndex: number;
  readonly presentationSignal: ReturnType<typeof uniform>;
  readonly width: number;
  readonly height: number;
}

const INVERSE_LINEAR_DEPTH_ATTACHMENT = "Real Water QA inverse linear depth";
const VIEW_NORMAL_ATTACHMENT = "Real Water QA view normal";
const HIDDEN_STABILIZATION_FRAME_COUNT = 8;

export async function createQaFrameDriver(
  options: CreateQaFrameDriverOptions,
): Promise<QaFrameDriver> {
  const renderer = options.renderer as unknown as Renderer;
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
    scenePass.setSize(size.width, size.height);
    scenePass.setMRT(
      mrt({
        output,
        [INVERSE_LINEAR_DEPTH_ATTACHMENT]: linearDepth().oneMinus(),
        [VIEW_NORMAL_ATTACHMENT]: normalView,
      }),
    );
    const inverseLinearDepthTexture = scenePass.getTexture(
      INVERSE_LINEAR_DEPTH_ATTACHMENT,
    );
    inverseLinearDepthTexture.format = RedFormat;
    inverseLinearDepthTexture.type = FloatType;
    const viewNormalTexture = scenePass.getTexture(VIEW_NORMAL_ATTACHMENT);
    viewNormalTexture.type = HalfFloatType;
    const sceneColor = scenePass.getTextureNode("output");
    const presentationSignal = uniform(0);

    const finalColorTarget = new RenderTarget(size.width, size.height, {
      depthBuffer: false,
      stencilBuffer: false,
      type: UnsignedByteType,
    });
    partialDisposals.push(() => finalColorTarget.dispose());
    finalColorTarget.texture.name = "Real Water QA final color";
    const compositionPipeline = new RenderPipeline(
      renderer,
      sceneColor.add(vec4(presentationSignal, 0, 0, 0)),
    );
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
      presentationSignal,
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
    const prewarm = progress.finish();

    restoreHostState(renderer, options.scene, options.camera, initialHostState);
    return createPreparedDriver(options, resources, prewarm);
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
): QaFrameDriver {
  const renderer = options.renderer as unknown as Renderer;
  let accepting = true;
  let disposal: Promise<void> | undefined;
  let presentationId = 0;
  let queue = Promise.resolve();
  let seed: number | null = null;
  let tick = 0;

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
        seed = nextSeed;
        tick = 0;
        resources.presentationSignal.value = presentationSignal(nextSeed, 0);
        return Object.freeze({ seed: nextSeed, tick });
      });
    },
    present(request) {
      const advance = request.advanceFixedTicks;
      const requestedCaptures = [...request.captures];
      return enqueue(async () => {
        if (seed === null) {
          throw new Error("Reset the QA frame driver before presentation.");
        }
        assertTickAdvance(advance, tick);
        assertCaptureNames(requestedCaptures);
        assertPreparedDrawingBufferSize(renderer, resources);
        const nextTick = tick + advance;
        resources.presentationSignal.value = presentationSignal(seed, nextTick);
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
        tick = nextTick;
        presentationId += 1;
        return Object.freeze({
          seed,
          tick,
          presentationId,
          manifestHash: options.manifestHash,
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

function presentationSignal(seed: number, tick: number): number {
  return ((seed + tick) & 0x0f) / 127.5;
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
  finish(): QaFramePrewarmReceipt;
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
    finish(): QaFramePrewarmReceipt {
      if (completedIds.length !== expectedIds.length) {
        throw new Error("The QA frame Prewarm Manifest is incomplete.");
      }
      return Object.freeze({
        manifest: QA_FRAME_PREWARM_MANIFEST,
        width,
        height,
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
}

async function probeCompletedFrame(
  renderer: Renderer,
  renderTarget: RenderTarget,
  textureIndex = 0,
): Promise<void> {
  const pixels = await renderer.readRenderTargetPixelsAsync(
    renderTarget,
    Math.max(0, Math.floor(renderTarget.width / 2)),
    Math.max(0, Math.floor(renderTarget.height / 2)),
    1,
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
      const rgba = compactRows(raw, resources.width, resources.height, 4);
      const data = new Float32Array(resources.width * resources.height * 3);
      for (
        let pixel = 0;
        pixel < resources.width * resources.height;
        pixel += 1
      ) {
        const source = pixel * 4;
        const destination = pixel * 3;
        data[destination] = DataUtils.fromHalfFloat(rgba[source] ?? 0);
        data[destination + 1] = DataUtils.fromHalfFloat(rgba[source + 1] ?? 0);
        data[destination + 2] = DataUtils.fromHalfFloat(rgba[source + 2] ?? 0);
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
  }
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
