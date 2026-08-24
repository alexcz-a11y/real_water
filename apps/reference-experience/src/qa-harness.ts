import {
  DataTexture,
  DirectionalLight,
  Fog,
  SRGBColorSpace,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
} from "three";
import type { WebGPURenderer } from "three/webgpu";
import {
  type ArtisticControls,
  type ArtisticControlUpdateOptions,
  type ArtisticControlUpdateReceipt,
  type DisturbanceBatch,
  type DisturbanceSubmissionReceipt,
  type HostEnvironmentState,
  type HostLifecycleAdapter,
  type HostPreparationRequest,
  type HostPreparationResult,
  type HostPreparedLease,
  type InteractionAnchor,
  type InteractionAnchorUpdateReceipt,
  type PrewarmManifest,
  type RealWaterLease,
} from "real-water";
import type {
  DiagnosticsSecondaryParticles,
  DiagnosticsWaterlineState,
} from "real-water/diagnostics";
import {
  QA_FRAME_PREWARM_MANIFEST,
  createBoundCoreDiagnosticsPrewarmReceipt,
  createQaFrameDriver,
  type QaFrameDriver,
  type QaFrameDriverCapture,
  type QaFramePrewarmReceipt,
  type QaRendererDeviceInventory,
  type QaTemporalResetReason,
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
import type { QaHostSimulationController } from "./qa-simulation-controller.js";
import type { QaHostPresentationController } from "./qa-presentation-controller.js";
import {
  QA_PLANAR_REFLECTION_FIXTURE_NAME,
  applyQaPlanarReflectionFixtureEnabled,
  applyQaPlanarReflectionFixtureHotColor,
  readQaPlanarReflectionFixture,
  type QaPlanarReflectionFixtureHotColor,
  type QaPlanarReflectionFixtureState,
} from "./qa-planar-reflection-fixture.js";
import {
  QA_CURRENT_SSR_FIXTURE_NAME,
  applyQaCurrentSsrFixtureEnabled,
  applyQaCurrentSsrFixtureHotColor,
  readQaCurrentSsrFixture,
  type QaCurrentSsrFixtureHotColor,
  type QaCurrentSsrFixtureState,
} from "./qa-current-ssr-fixture.js";

export type {
  QaPlanarReflectionFixtureHotColor,
  QaPlanarReflectionFixtureState,
} from "./qa-planar-reflection-fixture.js";
export type {
  QaCurrentSsrFixtureHotColor,
  QaCurrentSsrFixtureState,
} from "./qa-current-ssr-fixture.js";

export { createMemoryHostLifecycleAdapter as createQaMemoryHostLifecycleAdapter } from "real-water";
export { createQaHostSimulationController } from "./qa-simulation-controller.js";
export type { QaHostSimulationController } from "./qa-simulation-controller.js";
export { createQaHostPresentationController } from "./qa-presentation-controller.js";
export type { QaHostPresentationController } from "./qa-presentation-controller.js";
export type { QaTemporalResetReason } from "./qa-frame-driver.js";

export const QA_HARNESS_SCHEMA = "real-water/qa-harness" as const;
export const QA_HARNESS_VERSION = 16 as const;
export const QA_HARNESS_FIXED_TICK_HZ = QA_FRAME_FIXED_TICK_HZ;
export const QA_HARNESS_CAPTURE_NAMES = QA_FRAME_CAPTURE_NAMES;
export const QA_CAPTURE_SCHEMA = "real-water/qa-capture" as const;
export const QA_CAPTURE_VERSION = 16 as const;

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

export interface QaFrameStateReceiptV16 {
  readonly seed: number;
  readonly tick: number;
  readonly timeSeconds: number;
  readonly simulationResetRevision: number;
  readonly originX: number;
  readonly originZ: number;
  readonly seaLevelMetres: number;
  readonly originRevision: number;
}

export interface QaCameraReceiptV1 {
  readonly cameraRevision: number;
}

export interface QaOriginReceiptV4 {
  readonly originX: number;
  readonly originZ: number;
  readonly originRevision: number;
}

export interface QaSeaLevelReceiptV16 {
  readonly seaLevelMetres: number;
}

export type QaCameraTransition = "continuous" | "camera-cut";

export interface QaCameraUpdateOptions {
  readonly transition: QaCameraTransition;
}

export interface QaPresentedMotionStateV5 {
  readonly tick: number;
  readonly controlRevision: number;
  readonly originRevision: number;
  readonly cameraRevision: number;
  readonly cameraCutRevision: number;
  readonly seaStateCutRevision: number;
}

export interface QaMotionAssociationV5 {
  readonly previous: QaPresentedMotionStateV5;
  readonly current: QaPresentedMotionStateV5;
}

export interface QaTemporalReceiptV16 {
  readonly historyEpoch: number;
  readonly resetReason: QaTemporalResetReason | null;
  readonly resetFrame: boolean;
}

export interface QaPresentationReceiptV16 extends QaFrameStateReceiptV16 {
  readonly generation: number;
  readonly presentationId: number;
  readonly manifestHash: string;
  readonly cameraRevision: number;
  readonly cameraCutRevision: number;
  readonly controlRevision: number;
  readonly seaStateCutRevision: number;
  readonly compileCount: number;
  readonly probeCount: number;
  readonly captureNames: typeof QA_HARNESS_CAPTURE_NAMES;
  readonly prewarm: QaFramePrewarmReceipt;
  readonly motion: QaMotionAssociationV5;
  readonly waterline: DiagnosticsWaterlineState;
  readonly secondaryParticles: DiagnosticsSecondaryParticles;
  readonly temporal: QaTemporalReceiptV16;
}

export interface QaCaptureV16 extends QaPresentationReceiptV16 {
  readonly schema: typeof QA_CAPTURE_SCHEMA;
  readonly version: typeof QA_CAPTURE_VERSION;
  readonly name: QaCaptureName;
  readonly width: number;
  readonly height: number;
  readonly origin: "top-left";
  readonly format:
    | "rgba8unorm-srgb"
    | "r32float-linear-view"
    | "rgb32float-view-normal"
    | "rg32float-ndc"
    | "r32float-whitecap-stage"
    | "rgba32float-foam-source-identity"
    | "r32float-waterline-coverage"
    | "r32float-history-rejection"
    | "r32float-optical"
    | "r32float-underwater-volume"
    | "r32float-secondary-particle-contribution"
    | "r32float-secondary-particle-overdraw"
    | "r32float-hero-breaker-foam"
    | "r32float-underwater-caustics"
    | "r32float-underwater-particles"
    | "r32float-underwater-bubbles"
    | "r32float-lens-wetness"
    | "rgb32float-linear-ssr"
    | "r32float-ssr-roughness"
    | "rgb32float-linear-reflection-base"
    | "rgb32float-linear-ssr-composite"
    | "rgb32float-linear-ssr-history"
    | "r32float-ssr-history-frame-weight"
    | "rgb32float-linear-ssr-history-input";
  readonly elementType: "uint8" | "float32";
  readonly components: 1 | 2 | 3 | 4;
  readonly dataEncoding: "base64";
  readonly byteOrder: "not-applicable" | "little-endian";
  readonly data: string;
}

export interface QaFrameSource {
  readonly host: HostLifecycleAdapter;
  driver(): QaFrameDriver | null;
  lease(): RealWaterLease | null;
  bindLease(lease: RealWaterLease): void;
  setCamera(camera: QaCameraV1): void;
  incrementCameraCut(): void;
  setOrigin(originX: number, originZ: number): void;
  setSeaLevel(seaLevelMetres: number): void;
  setEnvironmentLighting(state: HostEnvironmentState): void;
  setHostSceneLightingDecoy(enabled: boolean): void;
  setHostSceneForegroundFixture(visible: boolean): void;
  setHostScenePlanarReflectionFixture(enabled: boolean): void;
  setHostScenePlanarReflectionFixtureHotColor(
    hotColor: QaPlanarReflectionFixtureHotColor,
  ): void;
  readHostScenePlanarReflectionFixture(): QaPlanarReflectionFixtureState;
  setHostSceneCurrentSsrFixture(enabled: boolean): void;
  setHostSceneCurrentSsrFixtureHotColor(
    hotColor: QaCurrentSsrFixtureHotColor,
  ): void;
  readHostSceneCurrentSsrFixture(): QaCurrentSsrFixtureState;
  readEnvironmentLighting(): HostEnvironmentState;
}

export interface QaGameplayQueryV4 {
  readonly point: readonly [number, number, number];
  readonly height: number;
  readonly normal: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly foam: number;
  readonly tick: number;
  readonly controlRevision: number;
  readonly snapshotAge: number;
  readonly presentationId: number;
}

export interface QaHarnessOptions {
  applySecondQualityProfile(): Promise<void>;
  dispose(): Promise<void>;
  frameSource(): QaFrameSource | null;
  signalLongSuspension(): Promise<void>;
  snapshot(): ReferenceExperienceSnapshot;
  synthesizeDeviceLoss(): void;
}

export interface QaHarnessV16 {
  readonly schema: typeof QA_HARNESS_SCHEMA;
  readonly version: typeof QA_HARNESS_VERSION;
  readonly fixedTickHz: typeof QA_HARNESS_FIXED_TICK_HZ;
  readonly captureNames: typeof QA_HARNESS_CAPTURE_NAMES;
  readonly prewarmManifest: typeof QA_FRAME_PREWARM_MANIFEST;
  reset(request: { readonly seed: number }): Promise<QaFrameStateReceiptV16>;
  advanceTicks(count: number): Promise<QaFrameStateReceiptV16>;
  setCamera(
    camera: QaCameraV1,
    options: QaCameraUpdateOptions,
  ): Promise<QaCameraReceiptV1>;
  setOrigin(origin: {
    readonly x: number;
    readonly z: number;
  }): Promise<QaOriginReceiptV4>;
  setSeaLevel(seaLevel: {
    readonly metres: number;
  }): Promise<QaSeaLevelReceiptV16>;
  present(): Promise<QaPresentationReceiptV16>;
  capture(name: QaCaptureName): Promise<QaCaptureV16>;
  updateArtisticControls(
    controls: ArtisticControls,
    options: ArtisticControlUpdateOptions,
  ): Promise<ArtisticControlUpdateReceipt>;
  updateInteractionAnchor(
    anchor: InteractionAnchor,
  ): Promise<InteractionAnchorUpdateReceipt>;
  submitDisturbances(
    batch: DisturbanceBatch,
  ): Promise<DisturbanceSubmissionReceipt>;
  updateEnvironmentLighting(
    state: HostEnvironmentState,
  ): Promise<HostEnvironmentState>;
  setHostSceneLightingDecoy(enabled: boolean): Promise<void>;
  setHostSceneForegroundFixture(visible: boolean): Promise<void>;
  setHostScenePlanarReflectionFixture(enabled: boolean): Promise<void>;
  setHostScenePlanarReflectionFixtureHotColor(
    hotColor: QaPlanarReflectionFixtureHotColor,
  ): Promise<void>;
  readHostScenePlanarReflectionFixture(): Promise<QaPlanarReflectionFixtureState>;
  setHostSceneCurrentSsrFixture(enabled: boolean): Promise<void>;
  setHostSceneCurrentSsrFixtureHotColor(
    hotColor: QaCurrentSsrFixtureHotColor,
  ): Promise<void>;
  readHostSceneCurrentSsrFixture(): Promise<QaCurrentSsrFixtureState>;
  queryGameplay(
    point: readonly [number, number, number],
  ): Promise<QaGameplayQueryV4>;
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
  readonly lease: RealWaterLease;
  tick: number;
  originX: number;
  originZ: number;
  seaLevelMetres: number;
  pendingTicks: number;
  cameraRevision: number;
  cameraSet: boolean;
  captures: ReadonlyMap<QaCaptureName, QaCaptureV16> | null;
  presentation: QaPresentationReceiptV16 | null;
  lastPresentedMotion: QaPresentedMotionStateV5 | null;
}

export function createQaHarness(options: QaHarnessOptions): QaHarnessV16 {
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

  const harness: QaHarnessV16 = {
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
        const lease = requirePreparedLease(source.lease());
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
          lease,
          seed: receipt.seed,
          tick: receipt.tick,
          originX: 0,
          originZ: 0,
          seaLevelMetres: 0,
          pendingTicks: 0,
          cameraRevision: 0,
          cameraSet: false,
          captures: null,
          presentation: null,
          lastPresentedMotion: null,
        };
        const runtime = lease.inspectRuntime();
        return Object.freeze({
          seed: receipt.seed,
          tick: receipt.tick,
          timeSeconds: receipt.timeSeconds,
          simulationResetRevision: receipt.simulationResetRevision,
          originX: 0,
          originZ: 0,
          seaLevelMetres: 0,
          originRevision: runtime.originRevision,
        });
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
        recipe.presentation = null;
        const runtime = recipe.lease.inspectRuntime();
        return Object.freeze({
          seed: recipe.seed,
          tick: recipe.tick,
          timeSeconds: recipe.tick / QA_HARNESS_FIXED_TICK_HZ,
          simulationResetRevision: runtime.simulationResetRevision,
          originX: recipe.originX,
          originZ: recipe.originZ,
          seaLevelMetres: recipe.seaLevelMetres,
          originRevision: runtime.originRevision,
        });
      });
    },
    setOrigin(origin) {
      const originX = origin.x;
      const originZ = origin.z;
      if (!Number.isFinite(originX) || !Number.isFinite(originZ)) {
        return Promise.reject(
          qaError("QA_INVALID_ARGUMENT", "The QA origin must be finite."),
        );
      }
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        recipe.source.setOrigin(originX, originZ);
        recipe.originX = originX;
        recipe.originZ = originZ;
        recipe.captures = null;
        recipe.presentation = null;
        const runtime = recipe.lease.inspectRuntime();
        return Object.freeze({
          originX: runtime.originX,
          originZ: runtime.originZ,
          originRevision: runtime.originRevision,
        });
      });
    },
    setSeaLevel(seaLevel) {
      const seaLevelMetres = seaLevel.metres;
      if (!Number.isFinite(seaLevelMetres)) {
        return Promise.reject(
          qaError("QA_INVALID_ARGUMENT", "The QA sea level must be finite."),
        );
      }
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        recipe.source.setSeaLevel(seaLevelMetres);
        recipe.seaLevelMetres = seaLevelMetres;
        recipe.captures = null;
        recipe.presentation = null;
        const runtime = recipe.lease.inspectRuntime();
        return Object.freeze({ seaLevelMetres: runtime.seaLevelMetres });
      });
    },
    setCamera(camera, cameraOptions) {
      const normalized = normalizeCamera(camera);
      const transition = readQaCameraUpdateOptions(cameraOptions);
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        recipe.source.setCamera(normalized);
        recipe.cameraRevision += 1;
        if (recipe.cameraSet && transition === "camera-cut") {
          recipe.source.incrementCameraCut();
        }
        recipe.cameraSet = true;
        recipe.captures = null;
        recipe.presentation = null;
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
        const runtime = recipe.lease.inspectRuntime();
        if (
          runtime.seed !== frame.seed ||
          runtime.tick !== frame.tick ||
          runtime.timeSeconds !== frame.timeSeconds ||
          runtime.simulationResetRevision !== frame.simulationResetRevision ||
          runtime.controlRevision !== frame.controlRevision ||
          runtime.originRevision !== frame.originRevision ||
          runtime.cameraCutRevision !== frame.cameraCutRevision ||
          runtime.seaStateCutRevision !== frame.seaStateCutRevision ||
          runtime.originX !== recipe.originX ||
          runtime.originZ !== recipe.originZ ||
          runtime.seaLevelMetres !== recipe.seaLevelMetres ||
          frame.manifestHash !== recipe.driver.prewarm.core.manifestHash
        ) {
          throw qaError(
            "QA_INVALIDATED",
            "The ready runtime state diverged from the presented Host frame.",
          );
        }
        const generation = options.snapshot().generation;
        const currentMotion = Object.freeze({
          tick: frame.tick,
          controlRevision: frame.controlRevision,
          originRevision: frame.originRevision,
          cameraRevision: recipe.cameraRevision,
          cameraCutRevision: frame.cameraCutRevision,
          seaStateCutRevision: frame.seaStateCutRevision,
        });
        const previousMotion = presentedMotionPrevious(
          recipe.lastPresentedMotion,
          currentMotion,
          frame.temporal.resetFrame,
        );
        const receipt = Object.freeze({
          seed: frame.seed,
          tick: frame.tick,
          timeSeconds: frame.timeSeconds,
          simulationResetRevision: frame.simulationResetRevision,
          originX: runtime.originX,
          originZ: runtime.originZ,
          seaLevelMetres: runtime.seaLevelMetres,
          generation,
          presentationId: frame.presentationId,
          manifestHash: frame.manifestHash,
          cameraRevision: recipe.cameraRevision,
          cameraCutRevision: frame.cameraCutRevision,
          controlRevision: frame.controlRevision,
          seaStateCutRevision: frame.seaStateCutRevision,
          compileCount: frame.compileCount,
          probeCount: frame.probeCount,
          originRevision: frame.originRevision,
          captureNames: QA_HARNESS_CAPTURE_NAMES,
          prewarm: frame.prewarm,
          motion: Object.freeze({
            previous: previousMotion,
            current: currentMotion,
          }),
          waterline: frame.waterline,
          secondaryParticles: frame.secondaryParticles,
          temporal: frame.temporal,
        });
        recipe.captures = cacheCaptures(frame.captures, receipt);
        recipe.presentation = receipt;
        recipe.lastPresentedMotion = currentMotion;
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
    updateArtisticControls(controls, controlOptions) {
      const transition = readArtisticControlUpdateOptions(controlOptions);
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        const receipt = recipe.lease.updateArtisticControls(controls, {
          transition,
        });
        recipe.captures = null;
        recipe.presentation = null;
        return receipt;
      });
    },
    updateInteractionAnchor(anchor) {
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        const receipt = recipe.lease.updateInteractionAnchor(anchor);
        recipe.captures = null;
        recipe.presentation = null;
        return receipt;
      });
    },
    submitDisturbances(batch) {
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        const receipt = recipe.lease.submitDisturbances(batch);
        recipe.captures = null;
        recipe.presentation = null;
        return receipt;
      });
    },
    updateEnvironmentLighting(state) {
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        recipe.source.setEnvironmentLighting(state);
        recipe.captures = null;
        recipe.presentation = null;
        return Object.freeze({ ...recipe.source.readEnvironmentLighting() });
      });
    },
    setHostSceneLightingDecoy(enabled) {
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        recipe.source.setHostSceneLightingDecoy(enabled);
        recipe.captures = null;
        recipe.presentation = null;
      });
    },
    setHostSceneForegroundFixture(visible) {
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        recipe.source.setHostSceneForegroundFixture(visible);
        recipe.captures = null;
        recipe.presentation = null;
      });
    },
    setHostScenePlanarReflectionFixture(enabled) {
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        recipe.source.setHostScenePlanarReflectionFixture(enabled);
        recipe.captures = null;
        recipe.presentation = null;
      });
    },
    setHostScenePlanarReflectionFixtureHotColor(hotColor) {
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        recipe.source.setHostScenePlanarReflectionFixtureHotColor(hotColor);
        recipe.captures = null;
        recipe.presentation = null;
      });
    },
    readHostScenePlanarReflectionFixture() {
      return enqueue(async () =>
        requireFrameSource(
          options.frameSource(),
        ).readHostScenePlanarReflectionFixture(),
      );
    },
    setHostSceneCurrentSsrFixture(enabled) {
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        recipe.source.setHostSceneCurrentSsrFixture(enabled);
        recipe.captures = null;
        recipe.presentation = null;
      });
    },
    setHostSceneCurrentSsrFixtureHotColor(hotColor) {
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        recipe.source.setHostSceneCurrentSsrFixtureHotColor(hotColor);
        recipe.captures = null;
        recipe.presentation = null;
      });
    },
    readHostSceneCurrentSsrFixture() {
      return enqueue(async () =>
        requireFrameSource(
          options.frameSource(),
        ).readHostSceneCurrentSsrFixture(),
      );
    },
    queryGameplay(point) {
      const normalized = normalizeVector(point, "Gameplay Query point");
      return enqueue(async () => {
        const recipe = requireActiveRecipe(active, options.frameSource());
        const presentation = recipe.presentation;
        if (presentation === null) {
          throw qaError(
            "QA_PRESENT_REQUIRED",
            "Present the current QA state before querying its fixed point.",
          );
        }
        const positions = Float32Array.of(...normalized);
        const heights = new Float32Array(1);
        const normals = new Float32Array(3);
        const velocities = new Float32Array(3);
        const foam = new Float32Array(1);
        const ticks = new Float64Array(1);
        const controlRevisions = new Float64Array(1);
        const snapshotAges = new Uint8Array(1);
        const results = recipe.lease.queryGameplay({
          count: 1,
          positions,
          results: {
            heights,
            normals,
            velocities,
            foam,
            ticks,
            controlRevisions,
            snapshotAges,
          },
        });
        return Object.freeze({
          point: normalized,
          height: heights[0] ?? 0,
          normal: Object.freeze([
            normals[0] ?? 0,
            normals[1] ?? 0,
            normals[2] ?? 0,
          ] as const),
          velocity: Object.freeze([
            velocities[0] ?? 0,
            velocities[1] ?? 0,
            velocities[2] ?? 0,
          ] as const),
          foam: foam[0] ?? 0,
          tick: results.ticks[0] ?? 0,
          controlRevision: results.controlRevisions[0] ?? 0,
          snapshotAge: results.snapshotAges[0] ?? 0,
          presentationId: presentation.presentationId,
        });
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
  simulation: QaHostSimulationController,
  environmentLighting: {
    setLighting(state: HostEnvironmentState): void;
    snapshot(): HostEnvironmentState;
  },
  presentation: QaHostPresentationController,
): QaFrameSource {
  let activeDriver: QaFrameDriver | null = null;
  let activeLease: RealWaterLease | null = null;
  let preparedPrewarm: PrewarmManifest | null = null;
  let lightingDecoy: {
    readonly light: DirectionalLight;
    readonly environment: DataTexture;
    readonly fog: Fog;
    readonly previousFog: Scene["fog"];
  } | null = null;
  const observedHost: HostLifecycleAdapter = Object.freeze({
    async prepare(request: HostPreparationRequest) {
      const result = await host.prepare(request);
      if (result.status !== "ready") {
        return result;
      }
      preparedPrewarm = request.manifest;
      const lease = observePreparedLease(
        result.lease,
        () => activeDriver,
        (active) => {
          activeDriver = active;
          if (active === null) {
            activeLease = null;
          }
        },
      );
      return Object.freeze({
        ...result,
        lease,
      }) satisfies HostPreparationResult;
    },
  });

  return Object.freeze({
    host: observedHost,
    driver: () => activeDriver,
    lease: () => activeLease,
    bindLease(lease: RealWaterLease): void {
      const prepared = preparedPrewarm;
      if (prepared === null) {
        throw new Error("The QA frame source is not prepared.");
      }
      if (activeDriver === null) {
        activeDriver = createQaFrameDriver({
          diagnostics: presentation.diagnosticsRoute(),
          manifestHash: prepared.manifestHash,
          simulation,
          prewarm: createBoundCoreDiagnosticsPrewarmReceipt(
            prepared,
            readRendererDeviceInventory(renderer),
            lease.capabilities,
          ),
        });
      }
      activeLease = lease;
    },
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
    incrementCameraCut() {
      presentation.incrementCameraCut();
    },
    setOrigin(originX: number, originZ: number) {
      simulation.setOrigin(originX, originZ);
    },
    setSeaLevel(seaLevelMetres: number) {
      simulation.setSeaLevel(seaLevelMetres);
    },
    setEnvironmentLighting(state: HostEnvironmentState) {
      environmentLighting.setLighting(state);
    },
    setHostSceneLightingDecoy(enabled: boolean) {
      if (enabled) {
        if (lightingDecoy !== null) {
          return;
        }
        const light = new DirectionalLight(0xfff6e0, 12);
        light.position.set(20, 40, 10);
        scene.add(light);
        const environment = new DataTexture(
          Uint8Array.from([
            255, 240, 180, 255, 255, 220, 160, 255, 255, 200, 140, 255, 255,
            180, 120, 255,
          ]),
          2,
          2,
        );
        environment.colorSpace = SRGBColorSpace;
        environment.needsUpdate = true;
        scene.environment = environment;
        const previousFog = scene.fog;
        const fog = new Fog(0xffcc66, 0.2, 10);
        scene.fog = fog;
        lightingDecoy = { light, environment, fog, previousFog };
        return;
      }
      if (lightingDecoy === null) {
        return;
      }
      scene.remove(lightingDecoy.light);
      lightingDecoy.light.dispose();
      if (scene.environment === lightingDecoy.environment) {
        scene.environment = null;
      }
      lightingDecoy.environment.dispose();
      if (scene.fog === lightingDecoy.fog) {
        scene.fog = lightingDecoy.previousFog;
      }
      lightingDecoy = null;
    },
    setHostSceneForegroundFixture(visible: boolean) {
      const fixture = scene.getObjectByName(
        "Reference foreground scene-depth fixture",
      );
      if (fixture !== undefined) {
        fixture.visible = visible;
      }
    },
    setHostScenePlanarReflectionFixture(enabled: boolean) {
      applyQaPlanarReflectionFixtureEnabled(
        requirePlanarReflectionFixture(scene),
        enabled,
      );
    },
    setHostScenePlanarReflectionFixtureHotColor(
      hotColor: QaPlanarReflectionFixtureHotColor,
    ) {
      applyQaPlanarReflectionFixtureHotColor(
        requirePlanarReflectionFixture(scene),
        hotColor,
      );
    },
    readHostScenePlanarReflectionFixture() {
      return readQaPlanarReflectionFixture(
        requirePlanarReflectionFixture(scene),
      );
    },
    setHostSceneCurrentSsrFixture(enabled: boolean) {
      applyQaCurrentSsrFixtureEnabled(requireCurrentSsrFixture(scene), enabled);
    },
    setHostSceneCurrentSsrFixtureHotColor(
      hotColor: QaCurrentSsrFixtureHotColor,
    ) {
      applyQaCurrentSsrFixtureHotColor(
        requireCurrentSsrFixture(scene),
        hotColor,
      );
    },
    readHostSceneCurrentSsrFixture() {
      return readQaCurrentSsrFixture(requireCurrentSsrFixture(scene));
    },
    readEnvironmentLighting() {
      return environmentLighting.snapshot();
    },
  });
}

function requirePreparedLease(lease: RealWaterLease | null): RealWaterLease {
  if (lease === null) {
    throw qaError(
      "QA_NOT_READY",
      "The ready Real Water lease is unavailable to the QA Harness.",
    );
  }
  return lease;
}

function observePreparedLease(
  lease: HostPreparedLease,
  currentDriver: () => QaFrameDriver | null,
  setActive: (driver: QaFrameDriver | null) => void,
): HostPreparedLease {
  let disposal: Promise<void> | undefined;
  const observed: HostPreparedLease = {
    ...lease,
    invalidated: lease.invalidated,
    dispose(): Promise<void> {
      const driver = currentDriver();
      setActive(null);
      disposal ??= disposeFrameDriverAndLease(driver, lease);
      return disposal;
    },
  };
  return Object.freeze(observed);
}

async function disposeFrameDriverAndLease(
  driver: QaFrameDriver | null,
  lease: HostPreparedLease,
): Promise<void> {
  let firstFailure: unknown;
  if (driver !== null) {
    try {
      await driver.dispose();
    } catch (cause) {
      firstFailure = cause;
    }
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

function requirePlanarReflectionFixture(scene: Scene): Object3D {
  const fixture = scene.getObjectByName(QA_PLANAR_REFLECTION_FIXTURE_NAME);
  if (fixture === undefined) {
    throw new Error("The Reference planar reflection fixture is missing.");
  }
  return fixture;
}

function requireCurrentSsrFixture(scene: Scene): Object3D {
  const fixture = scene.getObjectByName(QA_CURRENT_SSR_FIXTURE_NAME);
  if (fixture === undefined) {
    throw new Error("The Reference current-frame SSR fixture is missing.");
  }
  return fixture;
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

function presentedMotionPrevious(
  last: QaPresentedMotionStateV5 | null,
  current: QaPresentedMotionStateV5,
  resetFrame: boolean,
): QaPresentedMotionStateV5 {
  if (
    last === null ||
    resetFrame ||
    last.originRevision !== current.originRevision ||
    last.cameraCutRevision !== current.cameraCutRevision ||
    last.seaStateCutRevision !== current.seaStateCutRevision ||
    current.tick < last.tick
  ) {
    return current;
  }
  return last;
}

function readQaCameraUpdateOptions(
  options: QaCameraUpdateOptions,
): QaCameraTransition {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.keys(options).length !== 1 ||
    !Object.hasOwn(options, "transition")
  ) {
    throw qaError(
      "QA_INVALID_ARGUMENT",
      "QA camera updates require an explicit continuous or camera-cut transition.",
    );
  }
  if (
    options.transition !== "continuous" &&
    options.transition !== "camera-cut"
  ) {
    throw qaError(
      "QA_INVALID_ARGUMENT",
      "QA camera updates require an explicit continuous or camera-cut transition.",
    );
  }
  return options.transition;
}

function readArtisticControlUpdateOptions(
  options: ArtisticControlUpdateOptions,
): ArtisticControlUpdateOptions["transition"] {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.keys(options).length !== 1 ||
    !Object.hasOwn(options, "transition")
  ) {
    throw qaError(
      "QA_INVALID_ARGUMENT",
      "QA Artistic Control updates require an explicit continuous or sea-state-cut transition.",
    );
  }
  if (
    options.transition !== "continuous" &&
    options.transition !== "sea-state-cut"
  ) {
    throw qaError(
      "QA_INVALID_ARGUMENT",
      "QA Artistic Control updates require an explicit continuous or sea-state-cut transition.",
    );
  }
  return options.transition;
}

function cacheCaptures(
  captures: readonly QaFrameDriverCapture[],
  receipt: QaPresentationReceiptV16,
): ReadonlyMap<QaCaptureName, QaCaptureV16> {
  const byName = new Map<QaCaptureName, QaCaptureV16>();
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
  receipt: QaPresentationReceiptV16,
): QaCaptureV16 {
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

type QaErrorCode =
  | "QA_NOT_READY"
  | "QA_RESET_REQUIRED"
  | "QA_CAMERA_REQUIRED"
  | "QA_PRESENT_REQUIRED"
  | "QA_CAPTURE_UNSUPPORTED"
  | "QA_INVALID_ARGUMENT"
  | "QA_INVALIDATED";

function qaError(code: QaErrorCode, message: string): Error {
  const error = Object.assign(new Error(`${code}: ${message}`), { code });
  error.name = "QaHarnessError";
  return error;
}
