import type { PerspectiveCamera, Scene } from "three";
import type { WebGPURenderer } from "three/webgpu";
import {
  type HostLifecycleAdapter,
  type HostPreparationRequest,
  type HostPreparationResult,
  type HostPreparedLease,
} from "real-water";
import {
  QA_FRAME_PREWARM_MANIFEST,
  createQaFrameDriver,
  type QaFrameDriver,
  type QaFrameDriverCapture,
  type QaFramePrewarmReceipt,
} from "./qa-frame-driver.js";
import {
  QA_FRAME_CAPTURE_NAMES,
  QA_FRAME_CAPTURE_SHAPES,
  QA_FRAME_FIXED_TICK_HZ,
  isQaFrameCaptureName,
  isQaFrameSeed,
  isQaFrameTickCount,
  type QaFrameCaptureName,
} from "./qa-frame-contract.js";
import type { ReferenceExperienceSnapshot } from "./start-reference-experience.js";

export { createMemoryHostLifecycleAdapter as createQaMemoryHostLifecycleAdapter } from "real-water";

export const QA_HARNESS_SCHEMA = "real-water/qa-harness" as const;
export const QA_HARNESS_VERSION = 1 as const;
export const QA_HARNESS_FIXED_TICK_HZ = QA_FRAME_FIXED_TICK_HZ;
export const QA_HARNESS_CAPTURE_NAMES = QA_FRAME_CAPTURE_NAMES;
export const QA_CAPTURE_SCHEMA = "real-water/qa-capture" as const;
export const QA_CAPTURE_VERSION = 1 as const;

export type QaCaptureName = QaFrameCaptureName;

export interface QaCameraV1 {
  readonly projection: "perspective";
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly verticalFovDegrees: number;
  readonly near: number;
  readonly far: number;
}

export interface QaFrameStateReceiptV1 {
  readonly seed: number;
  readonly tick: number;
}

export interface QaCameraReceiptV1 {
  readonly cameraRevision: number;
}

export interface QaPresentationReceiptV1 extends QaFrameStateReceiptV1 {
  readonly generation: number;
  readonly presentationId: number;
  readonly manifestHash: string;
  readonly cameraRevision: number;
  readonly captureNames: typeof QA_HARNESS_CAPTURE_NAMES;
  readonly prewarm: QaFramePrewarmReceipt;
}

export interface QaCaptureV1 extends QaPresentationReceiptV1 {
  readonly schema: typeof QA_CAPTURE_SCHEMA;
  readonly version: typeof QA_CAPTURE_VERSION;
  readonly name: QaCaptureName;
  readonly width: number;
  readonly height: number;
  readonly origin: "top-left";
  readonly format:
    "rgba8unorm-srgb" | "r32float-linear-view" | "rgb32float-view-normal";
  readonly elementType: "uint8" | "float32";
  readonly components: 1 | 3 | 4;
  readonly dataEncoding: "base64";
  readonly byteOrder: "not-applicable" | "little-endian";
  readonly data: string;
}

export interface QaFrameSource {
  readonly host: HostLifecycleAdapter;
  driver(): QaFrameDriver | null;
  setCamera(camera: QaCameraV1): void;
}

export interface QaHarnessOptions {
  applySecondQualityProfile(): Promise<void>;
  dispose(): Promise<void>;
  frameSource(): QaFrameSource | null;
  signalLongSuspension(): Promise<void>;
  snapshot(): ReferenceExperienceSnapshot;
  synthesizeDeviceLoss(): void;
}

export interface QaHarnessV1 {
  readonly schema: typeof QA_HARNESS_SCHEMA;
  readonly version: typeof QA_HARNESS_VERSION;
  readonly fixedTickHz: typeof QA_HARNESS_FIXED_TICK_HZ;
  readonly captureNames: typeof QA_HARNESS_CAPTURE_NAMES;
  readonly prewarmManifest: typeof QA_FRAME_PREWARM_MANIFEST;
  reset(request: { readonly seed: number }): Promise<QaFrameStateReceiptV1>;
  advanceTicks(count: number): Promise<QaFrameStateReceiptV1>;
  setCamera(camera: QaCameraV1): Promise<QaCameraReceiptV1>;
  present(): Promise<QaPresentationReceiptV1>;
  capture(name: QaCaptureName): Promise<QaCaptureV1>;
  applySecondQualityProfile(): Promise<void>;
  dispose(): Promise<void>;
  signalLongSuspension(): Promise<void>;
  snapshot(): ReferenceExperienceSnapshot;
  synthesizeDeviceLoss(): void;
}

interface ActiveRecipe {
  readonly source: QaFrameSource;
  readonly driver: QaFrameDriver;
  readonly seed: number;
  tick: number;
  pendingTicks: number;
  cameraRevision: number;
  cameraSet: boolean;
  captures: ReadonlyMap<QaCaptureName, QaCaptureV1> | null;
}

export function createQaHarness(options: QaHarnessOptions): QaHarnessV1 {
  let active: ActiveRecipe | null = null;
  let queue = Promise.resolve();

  const enqueue = <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const result = queue.then(operation);
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  };

  const invalidateRecipe = (): void => {
    active = null;
  };

  const harness: QaHarnessV1 = {
    schema: QA_HARNESS_SCHEMA,
    version: QA_HARNESS_VERSION,
    fixedTickHz: QA_HARNESS_FIXED_TICK_HZ,
    captureNames: QA_HARNESS_CAPTURE_NAMES,
    prewarmManifest: QA_FRAME_PREWARM_MANIFEST,
    reset(request) {
      const seed = request.seed;
      assertSeed(seed);
      return enqueue(async () => {
        const source = requireFrameSource(options.frameSource());
        const driver = requirePreparedDriver(source.driver());
        if (driver.fixedTickHz !== QA_HARNESS_FIXED_TICK_HZ) {
          throw qaError(
            "QA_INVALIDATED",
            "The prepared Host uses an unsupported fixed-tick cadence.",
          );
        }
        const receipt = await driver.reset({ seed });
        active = {
          source,
          driver,
          seed: receipt.seed,
          tick: receipt.tick,
          pendingTicks: 0,
          cameraRevision: 0,
          cameraSet: false,
          captures: null,
        };
        return Object.freeze({ seed: receipt.seed, tick: receipt.tick });
      });
    },
    advanceTicks(count) {
      assertTickCount(count);
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        if (
          !Number.isSafeInteger(recipe.tick + count) ||
          !Number.isSafeInteger(recipe.pendingTicks + count)
        ) {
          throw qaError("QA_INVALID_ARGUMENT", "The QA tick would overflow.");
        }
        recipe.tick += count;
        recipe.pendingTicks += count;
        recipe.captures = null;
        return Object.freeze({ seed: recipe.seed, tick: recipe.tick });
      });
    },
    setCamera(camera) {
      const normalized = normalizeCamera(camera);
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        recipe.source.setCamera(normalized);
        recipe.cameraRevision += 1;
        recipe.cameraSet = true;
        recipe.captures = null;
        return Object.freeze({ cameraRevision: recipe.cameraRevision });
      });
    },
    present() {
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        if (!recipe.cameraSet) {
          throw qaError(
            "QA_CAMERA_REQUIRED",
            "Set a deterministic camera before presenting a QA frame.",
          );
        }
        const frame = await recipe.driver.present({
          advanceFixedTicks: recipe.pendingTicks,
          captures: QA_HARNESS_CAPTURE_NAMES,
        });
        if (frame.seed !== recipe.seed || frame.tick !== recipe.tick) {
          throw qaError(
            "QA_INVALIDATED",
            "The prepared Host frame state diverged from the QA Harness.",
          );
        }
        const generation = options.snapshot().generation;
        const receipt = Object.freeze({
          seed: frame.seed,
          tick: frame.tick,
          generation,
          presentationId: frame.presentationId,
          manifestHash: frame.manifestHash,
          cameraRevision: recipe.cameraRevision,
          captureNames: QA_HARNESS_CAPTURE_NAMES,
          prewarm: frame.prewarm,
        });
        recipe.captures = cacheCaptures(frame.captures, receipt);
        recipe.pendingTicks = 0;
        return receipt;
      });
    },
    capture(name) {
      assertCaptureName(name);
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        const capture = recipe.captures?.get(name);
        if (capture === undefined) {
          throw qaError(
            "QA_PRESENT_REQUIRED",
            "Present the current QA state before requesting a capture.",
          );
        }
        return capture;
      });
    },
    applySecondQualityProfile() {
      invalidateRecipe();
      return options.applySecondQualityProfile();
    },
    dispose() {
      invalidateRecipe();
      return options.dispose();
    },
    signalLongSuspension() {
      invalidateRecipe();
      return options.signalLongSuspension();
    },
    snapshot: options.snapshot,
    synthesizeDeviceLoss() {
      invalidateRecipe();
      options.synthesizeDeviceLoss();
    },
  };

  return Object.freeze(harness);
}

export function createQaThreeFrameSource(
  host: HostLifecycleAdapter,
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): QaFrameSource {
  let activeDriver: QaFrameDriver | null = null;
  const observedHost: HostLifecycleAdapter = Object.freeze({
    async prepare(request: HostPreparationRequest) {
      const result = await host.prepare(request);
      if (result.status !== "ready") {
        return result;
      }
      let driver: QaFrameDriver;
      try {
        driver = await createQaFrameDriver({
          renderer,
          scene,
          camera,
          manifestHash: request.manifest.manifestHash,
          signal: request.signal,
        });
      } catch (cause) {
        await Promise.resolve(result.lease.dispose()).catch(() => {});
        throw cause;
      }
      const lease = observePreparedLease(result.lease, driver, (active) => {
        activeDriver = active;
      });
      activeDriver = driver;
      return Object.freeze({
        ...result,
        lease,
      }) satisfies HostPreparationResult;
    },
  });

  return Object.freeze({
    host: observedHost,
    driver: () => activeDriver,
    setCamera(candidate: QaCameraV1) {
      const normalized = normalizeCamera(candidate);
      camera.position.set(...normalized.position);
      camera.up.set(...normalized.up);
      camera.fov = normalized.verticalFovDegrees;
      camera.near = normalized.near;
      camera.far = normalized.far;
      camera.lookAt(...normalized.target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
    },
  });
}

function observePreparedLease(
  lease: HostPreparedLease,
  driver: QaFrameDriver,
  setActive: (driver: QaFrameDriver | null) => void,
): HostPreparedLease {
  let disposal: Promise<void> | undefined;
  const observed: HostPreparedLease = {
    invalidated: lease.invalidated,
    dispose(): Promise<void> {
      setActive(null);
      disposal ??= disposeFrameDriverAndLease(driver, lease);
      return disposal;
    },
  };
  return Object.freeze(observed);
}

async function disposeFrameDriverAndLease(
  driver: QaFrameDriver,
  lease: HostPreparedLease,
): Promise<void> {
  let firstFailure: unknown;
  try {
    await driver.dispose();
  } catch (cause) {
    firstFailure = cause;
  }
  try {
    await lease.dispose();
  } catch (cause) {
    firstFailure ??= cause;
  }
  if (firstFailure !== undefined) {
    throw firstFailure;
  }
}

function requireFrameSource(source: QaFrameSource | null): QaFrameSource {
  if (source === null) {
    throw qaError(
      "QA_NOT_READY",
      "Rendered QA frames require a prepared Three Host.",
    );
  }
  return source;
}

function requirePreparedDriver(driver: QaFrameDriver | null): QaFrameDriver {
  if (driver === null) {
    throw qaError(
      "QA_NOT_READY",
      "The Three Host has not completed the Readiness Gate.",
    );
  }
  return driver;
}

function requireActiveRecipe(
  recipe: ActiveRecipe | null,
  source: QaFrameSource | null,
): ActiveRecipe {
  if (recipe === null) {
    throw qaError("QA_RESET_REQUIRED", "Reset the QA Harness first.");
  }
  if (source !== recipe.source || recipe.source.driver() !== recipe.driver) {
    throw qaError(
      "QA_INVALIDATED",
      "The prepared Host changed; reset the QA Harness against the new lease.",
    );
  }
  return recipe;
}

function cacheCaptures(
  captures: readonly QaFrameDriverCapture[],
  receipt: QaPresentationReceiptV1,
): ReadonlyMap<QaCaptureName, QaCaptureV1> {
  const byName = new Map<QaCaptureName, QaCaptureV1>();
  for (const name of QA_HARNESS_CAPTURE_NAMES) {
    const capture = captures.find((candidate) => candidate.name === name);
    if (capture === undefined) {
      throw qaError(
        "QA_INVALIDATED",
        `The prepared frame omitted the ${name} capture.`,
      );
    }
    byName.set(name, encodeCapture(capture, receipt));
  }
  if (captures.length !== QA_HARNESS_CAPTURE_NAMES.length) {
    throw qaError(
      "QA_INVALIDATED",
      "The prepared frame returned an unsupported capture set.",
    );
  }
  return byName;
}

function encodeCapture(
  capture: QaFrameDriverCapture,
  receipt: QaPresentationReceiptV1,
): QaCaptureV1 {
  const shape = QA_FRAME_CAPTURE_SHAPES[capture.name];
  return Object.freeze({
    schema: QA_CAPTURE_SCHEMA,
    version: QA_CAPTURE_VERSION,
    ...receipt,
    name: capture.name,
    width: capture.width,
    height: capture.height,
    origin: capture.origin,
    format: capture.format,
    elementType: shape.elementType,
    components: shape.components,
    dataEncoding: "base64",
    byteOrder:
      capture.data instanceof Float32Array ? "little-endian" : "not-applicable",
    data: encodeBase64(capture.data),
  });
}

function encodeBase64(data: Uint8Array | Float32Array): string {
  const bytes =
    data instanceof Float32Array
      ? encodeFloat32LittleEndian(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function encodeFloat32LittleEndian(data: Float32Array): Uint8Array {
  const bytes = new Uint8Array(data.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < data.length; index += 1) {
    view.setFloat32(index * 4, data[index] ?? 0, true);
  }
  return bytes;
}

function normalizeCamera(candidate: QaCameraV1): QaCameraV1 {
  if (candidate.projection !== "perspective") {
    throw qaError(
      "QA_INVALID_ARGUMENT",
      "Only the perspective QA camera is supported.",
    );
  }
  const position = normalizeVector(candidate.position, "position");
  const target = normalizeVector(candidate.target, "target");
  const up = normalizeVector(candidate.up, "up");
  if (squaredLength(subtract(position, target)) <= Number.EPSILON) {
    throw qaError(
      "QA_INVALID_ARGUMENT",
      "The QA camera position and target must differ.",
    );
  }
  if (squaredLength(up) <= Number.EPSILON) {
    throw qaError("QA_INVALID_ARGUMENT", "The QA camera up vector is zero.");
  }
  if (
    !Number.isFinite(candidate.verticalFovDegrees) ||
    candidate.verticalFovDegrees <= 0 ||
    candidate.verticalFovDegrees >= 180 ||
    !Number.isFinite(candidate.near) ||
    candidate.near <= 0 ||
    !Number.isFinite(candidate.far) ||
    candidate.far <= candidate.near
  ) {
    throw qaError(
      "QA_INVALID_ARGUMENT",
      "The QA camera projection range is invalid.",
    );
  }
  return Object.freeze({
    projection: "perspective",
    position,
    target,
    up,
    verticalFovDegrees: candidate.verticalFovDegrees,
    near: candidate.near,
    far: candidate.far,
  });
}

function normalizeVector(
  value: readonly [number, number, number],
  label: string,
): readonly [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((component) => Number.isFinite(component))
  ) {
    throw qaError(
      "QA_INVALID_ARGUMENT",
      `The QA camera ${label} must contain three finite numbers.`,
    );
  }
  return Object.freeze([value[0], value[1], value[2]] as const);
}

function subtract(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): readonly [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function squaredLength(value: readonly [number, number, number]): number {
  return value[0] ** 2 + value[1] ** 2 + value[2] ** 2;
}

function assertSeed(seed: number): void {
  if (!isQaFrameSeed(seed)) {
    throw qaError(
      "QA_INVALID_ARGUMENT",
      "QA seeds must be unsigned 32-bit integers.",
    );
  }
}

function assertTickCount(count: number): void {
  if (!isQaFrameTickCount(count)) {
    throw qaError(
      "QA_INVALID_ARGUMENT",
      "QA tick counts must be non-negative safe integers.",
    );
  }
}

function assertCaptureName(name: QaCaptureName): void {
  if (!isQaFrameCaptureName(name)) {
    throw qaError(
      "QA_CAPTURE_UNSUPPORTED",
      `Unsupported QA capture: ${String(name)}`,
    );
  }
}

type QaErrorCode =
  | "QA_NOT_READY"
  | "QA_RESET_REQUIRED"
  | "QA_CAMERA_REQUIRED"
  | "QA_PRESENT_REQUIRED"
  | "QA_CAPTURE_UNSUPPORTED"
  | "QA_INVALID_ARGUMENT"
  | "QA_INVALIDATED";

function qaError(code: QaErrorCode, message: string): Error {
  const error = new Error(`${code}: ${message}`);
  error.name = "QaHarnessError";
  return error;
}
