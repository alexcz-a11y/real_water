import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  WATER_PRESET_SCHEMA,
  WATER_PRESET_VERSION,
  createMinimalWaterQualityProfile,
  type ArtisticControls,
  type HostEnvironmentReflectionDescriptor,
  type HostEnvironmentState,
  type WaterPresetIdentity,
} from "real-water";
import {
  QA_FRAME_PREWARM_MANIFEST,
  QA_TO_CORE_DECLARATION_IDS,
} from "../src/qa-frame-driver.js";
import type { QaFramePrewarmReceipt } from "../src/qa-frame-driver.js";
import type { QaCameraV1 } from "../src/qa-harness.js";
import {
  assertRegressionDrawingBuffersAgree,
  canonicalJson,
  readQaBoundCoreManifestIdentity,
  readReadyCapabilities,
  type QaBoundCoreManifestIdentity,
  type RegressionDrawingBuffer,
} from "../src/qa-bound-core-identity.js";
import { readScreenshotProfileEvidence } from "./optical-screenshot-profile.js";

export {
  assertNativeTemporalPolicy,
  assertRegressionDrawingBuffersAgree,
  canonicalJson,
  coreManifestEvidence,
  createQaBoundCoreManifestIdentity,
  NATIVE_REGRESSION_TEMPORAL_POLICY,
  readQaBoundCoreManifestIdentity,
  readReadyCapabilities,
  type NativeRegressionTemporalPolicy,
  type QaBoundCoreManifestIdentity,
  type QaBoundCoreQualityProfileIdentity,
  type RegressionDrawingBuffer,
} from "../src/qa-bound-core-identity.js";

export const REGRESSION_ACCEPTANCE_EVIDENCE_CLASS = "Regression acceptance";
export const REGRESSION_ACCEPTANCE_SCHEMA =
  "real-water/regression-acceptance" as const;
export const REGRESSION_ACCEPTANCE_VERSION = 3 as const;
export const REGRESSION_ACCEPTANCE_RELATIVE_DIRECTORY =
  "test-results/regression-acceptance";

export const TEMPORAL_STRESS_SCHEMA = "real-water/temporal-stress" as const;
export const TEMPORAL_STRESS_VERSION = 1 as const;
export const TEMPORAL_STRESS_FIXED_TICK_HZ = 60 as const;
export const TEMPORAL_STRESS_JITTER_SEQUENCE = Object.freeze({
  id: "three-r185-halton-2-3-31" as const,
  period: 31 as const,
});

export const TEMPORAL_STRESS_IDS = Object.freeze([
  "fast-pan-frozen-simulation",
  "high-frequency-glint-horizon-strafe",
  "thin-detail-jitter-only-hold",
] as const);

export type TemporalStressId = (typeof TEMPORAL_STRESS_IDS)[number];
export type TemporalStressRunId = "default" | "sun-on" | "sun-off";
export type TemporalStressMetricCompare = "gte" | "lte" | "eq";

export interface TemporalStressRecipePolicy {
  readonly startTick: 24;
  readonly ticksPerFrame: 0 | 1;
  readonly primePresentations: 8;
  readonly frameCount: 16 | 24;
}

export const TEMPORAL_STRESS_RECIPE_POLICY: Readonly<
  Record<TemporalStressId, TemporalStressRecipePolicy>
> = Object.freeze({
  "fast-pan-frozen-simulation": Object.freeze({
    startTick: 24,
    ticksPerFrame: 0,
    primePresentations: 8,
    frameCount: 16,
  }),
  "high-frequency-glint-horizon-strafe": Object.freeze({
    startTick: 24,
    ticksPerFrame: 1,
    primePresentations: 8,
    frameCount: 24,
  }),
  "thin-detail-jitter-only-hold": Object.freeze({
    startTick: 24,
    ticksPerFrame: 0,
    primePresentations: 8,
    frameCount: 16,
  }),
});

const SHA_256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const TEMPORAL_STRESS_KEYS = [
  "schema",
  "version",
  "id",
  "fixedTickHz",
  "startTick",
  "ticksPerFrame",
  "primePresentations",
  "frameCount",
  "cameraTransition",
  "jitterSequence",
  "runs",
  "thresholds",
  "observed",
  "passed",
  "sha256",
] as const;
const JITTER_SEQUENCE_KEYS = ["id", "period"] as const;
const RUN_KEYS = [
  "id",
  "cameraPath",
  "sha256",
  "controls",
  "environment",
  "prime",
  "frames",
] as const;
const CONTROLS_KEYS = [
  "artisticControls",
  "waterPreset",
  "transition",
  "sha256",
] as const;
const ENVIRONMENT_KEYS = ["reflection", "lighting", "sha256"] as const;
const PRIME_KEYS = [
  "presentationId",
  "tick",
  "historyEpoch",
  "resetReason",
  "resetFrame",
  "simulationResetRevision",
  "seed",
  "manifestHash",
  "controlRevision",
  "cameraCutRevision",
  "seaStateCutRevision",
  "originRevision",
] as const;
const FRAME_KEYS = [
  "index",
  "tick",
  "presentationId",
  "manifestHash",
  "seed",
  "timeSeconds",
  "cameraRevision",
  "cameraCutRevision",
  "controlRevision",
  "seaStateCutRevision",
  "originRevision",
  "simulationResetRevision",
  "historyEpoch",
  "resetReason",
  "resetFrame",
  "currentColor",
  "finalColor",
  "motionVector",
  "depth",
  "normal",
  "fresnel",
  "glint",
] as const;
const CAMERA_KEYS = [
  "projection",
  "position",
  "target",
  "up",
  "verticalFovDegrees",
  "near",
  "far",
] as const;
const ARTISTIC_CONTROL_KEYS = [
  "waveStrength",
  "swellDrama",
  "directionality",
  "choppiness",
  "crestSharpness",
  "microDetail",
  "timeScale",
  "grazingReflection",
  "environmentReflection",
  "depthSeeThrough",
  "depthColoring",
  "inWaterGlow",
  "crestGlow",
] as const;
const LIGHTING_KEYS = [
  "sunDirectionX",
  "sunDirectionY",
  "sunDirectionZ",
  "sunColorR",
  "sunColorG",
  "sunColorB",
  "sunIntensity",
  "environmentIntensity",
  "sunAngularRadiusRadians",
] as const;
const WATER_PRESET_KEYS = ["schema", "version", "id", "presetHash"] as const;
const REFLECTION_KEYS = [
  "identity",
  "fingerprint",
  "width",
  "height",
  "format",
  "type",
  "colorSpace",
] as const;
const PRESENTATION_FRAME_KEYS = [
  "presentationId",
  "historyEpoch",
  "resetReason",
  "resetFrame",
  "simulationResetRevision",
  "seed",
  "tick",
  "timeSeconds",
  "controlRevision",
  "cameraCutRevision",
  "seaStateCutRevision",
  "originRevision",
  "manifestHash",
  "camera",
  "clip",
  "snapshotName",
  "pngAttachmentName",
  "pngAttachmentPath",
  "pngAttachmentContentType",
  "pngAttachmentSha256",
  "baselineSnapshotSha256",
  "screenshotPngSha256",
  "currentDigest",
  "finalDigest",
  "glintDigest",
  "diffDigest",
  "rgbDiffCoverage",
] as const;
const CLIP_KEYS = ["x", "y", "width", "height"] as const;
const QA_PREWARM_KEYS = [
  "manifest",
  "core",
  "capabilities",
  "width",
  "height",
  "rendererDevice",
  "progress",
] as const;
const PROGRESS_KEYS = [
  "completedWork",
  "totalWork",
  "completedDeclarationIds",
] as const;
const DEVICE_KEYS = ["features", "limits"] as const;
const REGRESSION_ACCEPTANCE_KEYS = [
  "schema",
  "version",
  "evidenceClass",
  "chromeVersion",
  "userAgent",
  "os",
  "osRelease",
  "arch",
  "cpuModel",
  "hardwareConcurrency",
  "projectId",
  "profileId",
  "headed",
  "headless",
  "devicePixelRatio",
  "drawingBuffer",
  "browserCanvas",
  "temporalPolicy",
  "navigatorGpuAdapter",
  "rendererDevice",
  "rendererDeviceFingerprint",
  "powerState",
  "lowPowerMode",
  "screenshotProfile",
  "seaLevelMetres",
  "seed",
  "tick",
  "camera",
  "controlRevision",
  "coreManifest",
  "qaPrewarmManifest",
  "qaHarness",
  "qaCapture",
  "artisticControls",
  "waterPreset",
  "environment",
  "screenshot",
  "presentationFrame",
  "temporalStress",
] as const;
const HORIZON_CAMERA = {
  projection: "perspective" as const,
  position: [0, 8, 0] as const,
  target: [400, 0, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 50,
  near: 0.5,
  far: 4_000,
};

export interface TemporalStressMetricRule {
  readonly thresholdKey: string;
  readonly observedKey: string;
  readonly compare: TemporalStressMetricCompare;
  readonly threshold: number;
}

export interface TemporalStressMetricPolicy {
  readonly thresholdKeys: readonly string[];
  readonly observedKeys: readonly string[];
  readonly rules: readonly TemporalStressMetricRule[];
}

const FAST_PAN_METRIC_POLICY = defineMetricPolicy([
  metric("maskMin", "maskMin", "gte", 256),
  metric("inBoundsRatioMin", "inBoundsRatioMin", "gte", 0.4),
  metric("oobWaterMin", "oobWaterMin", "gte", 64),
  metric("motionP50Min", "motionP50Min", "gte", 2),
  metric("motionP95Max", "motionP95Max", "lte", 12),
  metric("residualP95Max", "residualP95Max", "lte", 0.05),
  metric("residualP99Max", "residualP99Max", "lte", 0.1),
  metric("disocclusionP99Max", "disocclusionP99Max", "lte", 1),
  metric("disocclusionMax", "disocclusionMax", "lte", 1),
  metric("outsideCoverage", "outsideCoverage", "eq", 0),
  metric("maxTrail", "maxTrail", "eq", 0),
  metric("currentResidualP95Min", "currentResidualP95Min", "gte", 0.005),
  metric(
    "finalCurrentResidualRatioMax",
    "finalCurrentResidualRatioMax",
    "lte",
    0.9,
  ),
  metric("stableDiffCoverageMin", "stableDiffCoverage", "gte", 0.01),
]);

const GLINT_METRIC_POLICY = defineMetricPolicy([
  metric("offGlintMax", "offGlintMax", "lte", 0.005),
  metric("offGlintHot", "offGlintHot", "eq", 0),
  metric("onGlintMaxMin", "onGlintMax", "gte", 0.2),
  metric("offEnergyRatioMax", "offEnergyRatio", "lte", 0.01),
  metric("minWaterCount", "minWaterCount", "gte", 256),
  metric("minOutsideWater", "minOutsideWater", "gte", 64),
  metric("activeFramesMin", "activeFrames", "gte", 12),
  metric("validPeakFramesMin", "validPeakFrames", "gte", 12),
  metric("glintPixelFramesMin", "glintPixelFrames", "gte", 128),
  metric("peakRatioP10Min", "peakRatioP10", "gte", 0.7),
  metric("outsideResidualP99Max", "outsideResidualP99", "lte", 8),
  metric("outsideCoverageMax", "outsideCoverage", "lte", 0.005),
  metric("validComponentFramesMin", "validComponentFrames", "gte", 32),
  metric(
    "motionQualifiedComponentsMin",
    "motionQualifiedComponents",
    "gte",
    32,
  ),
  metric("centroidLagP95Max", "centroidLagP95", "lte", 1.5),
  metric("maxTrail", "maxTrail", "lte", 2),
  metric("madValidMin", "madValid", "gte", 128),
  metric("madValidRatioMin", "madValidRatio", "gte", 0.85),
  metric("currentMadP75Min", "currentMadP75", "gte", 1),
  metric("finalMadRatioMax", "finalMadRatio", "lte", 0.9),
  metric("commonSource", "commonSource", "eq", 1),
  observedOnly("madEligible"),
  observedOnly("finalMadP75"),
]);

const THIN_METRIC_POLICY = defineMetricPolicy([
  metric("unionMin", "unionCount", "gte", 64),
  metric("perFrameMin", "minFrameThin", "gte", 8),
  metric("activeFramesMin", "activeFrames", "gte", 8),
  metric("madSampleMin", "madSamples", "gte", 64),
  metric("currentMadP75Min", "currentMadP75", "gte", 0.5),
  metric("finalMadRatioMax", "finalMadRatio", "lte", 0.8),
  metric("ratioSampleMin", "ratioSamples", "gte", 64),
  metric("gradientRatioMedianMin", "gradientRatioMedian", "gte", 0.8),
  metric("coverageRetainMin", "coverageRetain", "gte", 0.85),
  metric("minFrameRetainMin", "minFrameRetain", "gte", 0.85),
  metric("tracksMin", "trackedComponents", "gte", 4),
  metric("trackFramesMin", "trackedComponentFrames", "gte", 8),
  metric("maxConsecutiveMissing", "maxConsecutiveMissing", "lte", 1),
  metric("differingFramesMin", "differingFrames", "gte", 1),
  metric("motionP95Max", "motionP95Max", "lte", 0.05),
  metric("motionMax", "motionMax", "lte", 0.15),
  observedOnly("finalMadP75"),
]);

const METRIC_POLICIES: Readonly<
  Record<TemporalStressId, TemporalStressMetricPolicy>
> = Object.freeze({
  "fast-pan-frozen-simulation": FAST_PAN_METRIC_POLICY,
  "high-frequency-glint-horizon-strafe": GLINT_METRIC_POLICY,
  "thin-detail-jitter-only-hold": THIN_METRIC_POLICY,
});

export interface TemporalStressControlsEvidence {
  readonly artisticControls: ArtisticControls;
  readonly waterPreset: WaterPresetIdentity;
  readonly transition: "continuous";
  readonly sha256: string;
}

export interface TemporalStressEnvironmentEvidence {
  readonly reflection: HostEnvironmentReflectionDescriptor;
  readonly lighting: HostEnvironmentState;
  readonly sha256: string;
}

export interface TemporalStressPrimeReceipt {
  readonly presentationId: number;
  readonly tick: number;
  readonly historyEpoch: number;
  readonly resetReason: string | null;
  readonly resetFrame: boolean;
  readonly simulationResetRevision: number;
  readonly seed: number;
  readonly manifestHash: string;
  readonly controlRevision: number;
  readonly cameraCutRevision: number;
  readonly seaStateCutRevision: number;
  readonly originRevision: number;
}

export interface TemporalStressFrameEvidence {
  readonly index: number;
  readonly tick: number;
  readonly presentationId: number;
  readonly manifestHash: string;
  readonly seed: number;
  readonly timeSeconds: number;
  readonly cameraRevision: number;
  readonly cameraCutRevision: number;
  readonly controlRevision: number;
  readonly seaStateCutRevision: number;
  readonly originRevision: number;
  readonly simulationResetRevision: number;
  readonly historyEpoch: number;
  readonly resetReason: string | null;
  readonly resetFrame: boolean;
  readonly currentColor: string;
  readonly finalColor: string;
  readonly motionVector: string;
  readonly depth: string;
  readonly normal: string;
  readonly fresnel: string;
  readonly glint: string;
}

export interface TemporalStressRunEvidence {
  readonly id: TemporalStressRunId;
  readonly cameraPath: readonly QaCameraV1[];
  readonly sha256: string;
  readonly controls: TemporalStressControlsEvidence;
  readonly environment: TemporalStressEnvironmentEvidence;
  readonly prime: TemporalStressPrimeReceipt;
  readonly frames: readonly TemporalStressFrameEvidence[];
}

export interface TemporalStressEvidenceV1 {
  readonly schema: typeof TEMPORAL_STRESS_SCHEMA;
  readonly version: typeof TEMPORAL_STRESS_VERSION;
  readonly id: TemporalStressId;
  readonly fixedTickHz: typeof TEMPORAL_STRESS_FIXED_TICK_HZ;
  readonly startTick: number;
  readonly ticksPerFrame: number;
  readonly primePresentations: number;
  readonly frameCount: number;
  readonly cameraTransition: "continuous";
  readonly jitterSequence: typeof TEMPORAL_STRESS_JITTER_SEQUENCE;
  readonly runs: readonly TemporalStressRunEvidence[];
  readonly thresholds: Readonly<Record<string, number>>;
  readonly observed: Readonly<Record<string, number>>;
  readonly passed: true;
  readonly sha256: string;
}

export interface TemporalStressFrameCaptureInput {
  readonly tick: number;
  readonly presentationId: number;
  readonly manifestHash: string;
  readonly seed: number;
  readonly timeSeconds: number;
  readonly cameraRevision: number;
  readonly cameraCutRevision: number;
  readonly controlRevision: number;
  readonly seaStateCutRevision: number;
  readonly originRevision: number;
  readonly simulationResetRevision: number;
  readonly historyEpoch: number;
  readonly resetReason: string | null;
  readonly resetFrame: boolean;
  readonly current: string;
  readonly final: string;
  readonly motion: string;
  readonly depth: string;
  readonly normal: string;
  readonly fresnel: string;
  readonly glint: string;
}

export interface TemporalStressRunInput {
  readonly id: TemporalStressRunId;
  readonly cameraPath: readonly QaCameraV1[];
  readonly artisticControls: ArtisticControls;
  readonly waterPreset: WaterPresetIdentity;
  readonly reflection: HostEnvironmentReflectionDescriptor;
  readonly lighting: HostEnvironmentState;
  readonly prime: TemporalStressPrimeReceipt;
  readonly frames: readonly TemporalStressFrameCaptureInput[];
}

export interface CreateTemporalStressEvidenceInput {
  readonly id: TemporalStressId;
  readonly startTick: number;
  readonly ticksPerFrame: number;
  readonly primePresentations: number;
  readonly frameCount: number;
  readonly runs: readonly TemporalStressRunInput[];
  readonly thresholds: Readonly<Record<string, number>>;
  readonly observed: Readonly<Record<string, number>>;
}

export interface PresentationFrameClip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PresentationFrameEvidence {
  readonly presentationId: number;
  readonly historyEpoch: number;
  readonly resetReason: string | null;
  readonly resetFrame: boolean;
  readonly simulationResetRevision: number;
  readonly seed: number;
  readonly tick: number;
  readonly timeSeconds: number;
  readonly controlRevision: number;
  readonly cameraCutRevision: number;
  readonly seaStateCutRevision: number;
  readonly originRevision: number;
  readonly manifestHash: string;
  readonly camera: QaCameraV1;
  readonly clip: PresentationFrameClip;
  readonly snapshotName: string;
  readonly pngAttachmentName: string;
  readonly pngAttachmentPath: string;
  readonly pngAttachmentContentType: "image/png";
  readonly pngAttachmentSha256: string;
  readonly baselineSnapshotSha256: string;
  readonly screenshotPngSha256: string;
  readonly currentDigest: string;
  readonly finalDigest: string;
  readonly glintDigest: string;
  readonly diffDigest: string;
  readonly rgbDiffCoverage: number;
}

export function temporalStressMetricPolicy(
  id: TemporalStressId,
): TemporalStressMetricPolicy {
  return METRIC_POLICIES[id];
}

export function sha256CanonicalJson(value: unknown): string {
  return sha256Bytes(Buffer.from(canonicalJson(value)));
}

export function sha256CaptureBytes(encoded: string): string {
  return sha256Bytes(Buffer.from(encoded, "base64"));
}

export function sha256Buffer(bytes: Buffer): string {
  return sha256Bytes(bytes);
}

export function createTemporalStressEvidence(
  input: CreateTemporalStressEvidenceInput,
): TemporalStressEvidenceV1 {
  readTemporalStressRecipe(input.id, {
    startTick: input.startTick,
    ticksPerFrame: input.ticksPerFrame,
    primePresentations: input.primePresentations,
    frameCount: input.frameCount,
  });
  const runs = input.runs.map((run) =>
    createTemporalStressRun(run, input.id, input.frameCount),
  );
  const thresholds = readExactThresholds(input.id, input.thresholds);
  const observed = readExactObserved(input.id, input.observed);
  const passed = evaluateMetricPolicy(input.id, thresholds, observed);
  if (!passed) {
    throw new Error(
      "Temporal stress observed values do not satisfy the exact metric policy.",
    );
  }
  const unsigned = {
    schema: TEMPORAL_STRESS_SCHEMA,
    version: TEMPORAL_STRESS_VERSION,
    id: input.id,
    fixedTickHz: TEMPORAL_STRESS_FIXED_TICK_HZ,
    startTick: input.startTick,
    ticksPerFrame: input.ticksPerFrame,
    primePresentations: input.primePresentations,
    frameCount: input.frameCount,
    cameraTransition: "continuous" as const,
    jitterSequence: TEMPORAL_STRESS_JITTER_SEQUENCE,
    runs,
    thresholds,
    observed,
    passed: true as const,
  };
  return readTemporalStressEvidence({
    ...unsigned,
    sha256: sha256CanonicalJson(omitShaAndPassed(unsigned)),
  });
}

export function createTemporalStressFrame(
  frame: TemporalStressFrameCaptureInput,
  index: number,
): TemporalStressFrameEvidence {
  return deepFreeze({
    index,
    tick: frame.tick,
    presentationId: frame.presentationId,
    manifestHash: frame.manifestHash,
    seed: frame.seed,
    timeSeconds: frame.timeSeconds,
    cameraRevision: frame.cameraRevision,
    cameraCutRevision: frame.cameraCutRevision,
    controlRevision: frame.controlRevision,
    seaStateCutRevision: frame.seaStateCutRevision,
    originRevision: frame.originRevision,
    simulationResetRevision: frame.simulationResetRevision,
    historyEpoch: frame.historyEpoch,
    resetReason: frame.resetReason,
    resetFrame: frame.resetFrame,
    currentColor: sha256CaptureBytes(frame.current),
    finalColor: sha256CaptureBytes(frame.final),
    motionVector: sha256CaptureBytes(frame.motion),
    depth: sha256CaptureBytes(frame.depth),
    normal: sha256CaptureBytes(frame.normal),
    fresnel: sha256CaptureBytes(frame.fresnel),
    glint: sha256CaptureBytes(frame.glint),
  });
}

export function readTemporalStressEvidence(
  value: unknown,
): TemporalStressEvidenceV1 {
  if (!isRecord(value) || !hasExactKeys(value, TEMPORAL_STRESS_KEYS)) {
    throw new TypeError(
      "Temporal stress evidence must use the exact TemporalStressEvidenceV1 contract.",
    );
  }
  if (
    value.schema !== TEMPORAL_STRESS_SCHEMA ||
    value.version !== TEMPORAL_STRESS_VERSION ||
    !isTemporalStressId(value.id)
  ) {
    throw new TypeError(
      "Temporal stress evidence id/schema/version is unsupported.",
    );
  }
  const id = value.id;
  if (
    value.fixedTickHz !== TEMPORAL_STRESS_FIXED_TICK_HZ ||
    value.cameraTransition !== "continuous" ||
    value.passed !== true
  ) {
    throw new Error(
      "Temporal stress evidence must declare 60 Hz continuous stock jitter and passed=true.",
    );
  }
  const recipe = readTemporalStressRecipe(id, value);
  const startTick = recipe.startTick;
  const ticksPerFrame = recipe.ticksPerFrame;
  const primePresentations = recipe.primePresentations;
  const frameCount = recipe.frameCount;
  const jitter = readJitterSequence(value.jitterSequence);
  const thresholds = readExactThresholds(id, value.thresholds);
  const observed = readExactObserved(id, value.observed);
  if (!evaluateMetricPolicy(id, thresholds, observed)) {
    throw new Error(
      "Temporal stress observed values do not satisfy the exact metric policy.",
    );
  }
  if (!Array.isArray(value.runs) || value.runs.length === 0) {
    throw new TypeError("Temporal stress evidence requires at least one run.");
  }
  const expectedRunIds = expectedRunIdsFor(id);
  if (value.runs.length !== expectedRunIds.length) {
    throw new Error(
      `Temporal stress ${id} must record ${String(expectedRunIds.length)} run(s).`,
    );
  }
  const runs = value.runs.map((run, index) => {
    const expectedId = expectedRunIds[index];
    if (expectedId === undefined) {
      throw new Error("Temporal stress run index drifted.");
    }
    return readTemporalStressRun(
      run,
      id,
      expectedId,
      startTick,
      ticksPerFrame,
      frameCount,
    );
  });
  bindGlintRunAuthority(id, runs, observed, recipe);
  const unsigned = {
    schema: TEMPORAL_STRESS_SCHEMA,
    version: TEMPORAL_STRESS_VERSION,
    id,
    fixedTickHz: TEMPORAL_STRESS_FIXED_TICK_HZ,
    startTick,
    ticksPerFrame,
    primePresentations,
    frameCount,
    cameraTransition: "continuous" as const,
    jitterSequence: jitter,
    runs,
    thresholds,
    observed,
    passed: true as const,
  };
  assertSha256(value.sha256, "temporalStress.sha256");
  const expectedHash = sha256CanonicalJson(omitShaAndPassed(unsigned));
  if (value.sha256 !== expectedHash) {
    throw new Error(
      "Temporal stress sha256 does not match the recipe, runs, thresholds, and observed payload.",
    );
  }
  return deepFreeze({
    ...unsigned,
    sha256: value.sha256,
  });
}

export function createPresentationFrameEvidence(input: {
  readonly presentationId: number;
  readonly historyEpoch: number;
  readonly resetReason: string | null;
  readonly resetFrame: boolean;
  readonly simulationResetRevision: number;
  readonly seed: number;
  readonly tick: number;
  readonly timeSeconds: number;
  readonly controlRevision: number;
  readonly cameraCutRevision: number;
  readonly seaStateCutRevision: number;
  readonly originRevision: number;
  readonly manifestHash: string;
  readonly camera: QaCameraV1;
  readonly clip: PresentationFrameClip;
  readonly snapshotName: string;
  readonly pngAttachmentName: string;
  readonly pngAttachmentPath: string;
  readonly pngAttachmentContentType?: "image/png";
  readonly screenshotPng: Buffer;
  readonly baselineSnapshotSha256: string;
  readonly currentDigest: string;
  readonly finalDigest: string;
  readonly glintDigest: string;
  readonly diffDigest: string;
  readonly rgbDiffCoverage: number;
}): PresentationFrameEvidence {
  return readPresentationFrameEvidence({
    presentationId: input.presentationId,
    historyEpoch: input.historyEpoch,
    resetReason: input.resetReason,
    resetFrame: input.resetFrame,
    simulationResetRevision: input.simulationResetRevision,
    seed: input.seed,
    tick: input.tick,
    timeSeconds: input.timeSeconds,
    controlRevision: input.controlRevision,
    cameraCutRevision: input.cameraCutRevision,
    seaStateCutRevision: input.seaStateCutRevision,
    originRevision: input.originRevision,
    manifestHash: input.manifestHash,
    camera: input.camera,
    clip: input.clip,
    snapshotName: input.snapshotName,
    pngAttachmentName: input.pngAttachmentName,
    pngAttachmentPath: input.pngAttachmentPath,
    pngAttachmentContentType: input.pngAttachmentContentType ?? "image/png",
    pngAttachmentSha256: sha256Buffer(input.screenshotPng),
    baselineSnapshotSha256: input.baselineSnapshotSha256,
    screenshotPngSha256: sha256Buffer(input.screenshotPng),
    currentDigest: input.currentDigest,
    finalDigest: input.finalDigest,
    glintDigest: input.glintDigest,
    diffDigest: input.diffDigest,
    rgbDiffCoverage: input.rgbDiffCoverage,
  });
}

export function readPresentationFrameEvidence(
  value: unknown,
): PresentationFrameEvidence {
  if (!isRecord(value) || !hasExactKeys(value, PRESENTATION_FRAME_KEYS)) {
    throw new TypeError(
      "Presentation frame evidence must use the exact isolated-receipt contract.",
    );
  }
  assertNonNegativeInteger(value.presentationId, "presentationId");
  assertPositiveInteger(value.historyEpoch, "historyEpoch");
  assertNonNegativeInteger(
    value.simulationResetRevision,
    "simulationResetRevision",
  );
  assertNonNegativeInteger(value.seed, "seed");
  assertNonNegativeInteger(value.tick, "tick");
  assertFiniteNumber(value.timeSeconds, "timeSeconds");
  if (value.timeSeconds !== value.tick / TEMPORAL_STRESS_FIXED_TICK_HZ) {
    throw new Error("presentationFrame.timeSeconds must equal tick / 60.");
  }
  assertNonNegativeInteger(value.controlRevision, "controlRevision");
  assertNonNegativeInteger(value.cameraCutRevision, "cameraCutRevision");
  assertNonNegativeInteger(value.seaStateCutRevision, "seaStateCutRevision");
  assertNonNegativeInteger(value.originRevision, "originRevision");
  if (typeof value.resetFrame !== "boolean") {
    throw new TypeError("presentationFrame.resetFrame must be a boolean.");
  }
  if (value.resetReason !== null && typeof value.resetReason !== "string") {
    throw new TypeError(
      "presentationFrame.resetReason must be a string or null.",
    );
  }
  assertSha256(value.manifestHash, "manifestHash");
  if (
    typeof value.snapshotName !== "string" ||
    value.snapshotName.length === 0
  ) {
    throw new TypeError(
      "presentationFrame.snapshotName must be a non-empty string.",
    );
  }
  const pngAttachmentName = readDurablePngAttachmentName(
    value.pngAttachmentName,
  );
  if (
    typeof value.pngAttachmentPath !== "string" ||
    value.pngAttachmentPath !==
      `${REGRESSION_ACCEPTANCE_RELATIVE_DIRECTORY}/${pngAttachmentName}`
  ) {
    throw new Error(
      "presentationFrame.pngAttachmentPath must be the regression-acceptance basename path.",
    );
  }
  if (value.pngAttachmentContentType !== "image/png") {
    throw new TypeError(
      "presentationFrame.pngAttachmentContentType must be image/png.",
    );
  }
  assertSha256(value.pngAttachmentSha256, "pngAttachmentSha256");
  assertSha256(value.baselineSnapshotSha256, "baselineSnapshotSha256");
  assertSha256(value.screenshotPngSha256, "screenshotPngSha256");
  if (value.pngAttachmentSha256 !== value.screenshotPngSha256) {
    throw new Error(
      "presentationFrame.pngAttachmentSha256 must equal screenshotPngSha256.",
    );
  }
  assertSha256(value.currentDigest, "currentDigest");
  assertSha256(value.finalDigest, "finalDigest");
  assertSha256(value.glintDigest, "glintDigest");
  assertSha256(value.diffDigest, "diffDigest");
  if (
    value.currentDigest === value.finalDigest ||
    value.currentDigest === value.diffDigest ||
    value.finalDigest === value.diffDigest
  ) {
    throw new Error(
      "presentationFrame current, final, and diff hashes must be distinct.",
    );
  }
  if (
    typeof value.rgbDiffCoverage !== "number" ||
    !Number.isSafeInteger(value.rgbDiffCoverage) ||
    value.rgbDiffCoverage <= 0
  ) {
    throw new RangeError(
      "presentationFrame.rgbDiffCoverage must be a positive integer.",
    );
  }
  return deepFreeze({
    presentationId: value.presentationId,
    historyEpoch: value.historyEpoch,
    resetReason: value.resetReason,
    resetFrame: value.resetFrame,
    simulationResetRevision: value.simulationResetRevision,
    seed: value.seed,
    tick: value.tick,
    timeSeconds: value.timeSeconds,
    controlRevision: value.controlRevision,
    cameraCutRevision: value.cameraCutRevision,
    seaStateCutRevision: value.seaStateCutRevision,
    originRevision: value.originRevision,
    manifestHash: value.manifestHash,
    camera: readCamera(value.camera, "presentationFrame.camera"),
    clip: readClip(value.clip),
    snapshotName: value.snapshotName,
    pngAttachmentName,
    pngAttachmentPath: value.pngAttachmentPath,
    pngAttachmentContentType: "image/png",
    pngAttachmentSha256: value.pngAttachmentSha256,
    baselineSnapshotSha256: value.baselineSnapshotSha256,
    screenshotPngSha256: value.screenshotPngSha256,
    currentDigest: value.currentDigest,
    finalDigest: value.finalDigest,
    glintDigest: value.glintDigest,
    diffDigest: value.diffDigest,
    rgbDiffCoverage: value.rgbDiffCoverage,
  });
}

export function readRegressionAcceptanceEvidence(
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value) || !hasExactKeys(value, REGRESSION_ACCEPTANCE_KEYS)) {
    throw new TypeError(
      "Regression acceptance evidence must use the exact version-3 contract.",
    );
  }
  if (
    value.schema !== REGRESSION_ACCEPTANCE_SCHEMA ||
    value.version !== REGRESSION_ACCEPTANCE_VERSION
  ) {
    throw new TypeError(
      "Regression acceptance evidence must use schema real-water/regression-acceptance version 3.",
    );
  }
  if (value.evidenceClass !== REGRESSION_ACCEPTANCE_EVIDENCE_CLASS) {
    throw new Error(
      "Regression acceptance evidenceClass must be Regression acceptance.",
    );
  }
  assertNoRawCapturePayload(value);
  if (
    typeof value.seaLevelMetres !== "number" ||
    !Number.isFinite(value.seaLevelMetres)
  ) {
    throw new RangeError(
      "Regression acceptance seaLevelMetres must be finite.",
    );
  }
  const coreIdentity = readQaBoundCoreManifestIdentity(
    isRecord(value.coreManifest) ? value.coreManifest.identity : undefined,
  );
  if (
    !isRecord(value.coreManifest) ||
    value.coreManifest.hash !== coreIdentity.manifestHash
  ) {
    throw new Error(
      "Regression acceptance coreManifest.hash disagrees with the Core identity.",
    );
  }
  const qaPrewarm = readQaPrewarmV9(value.qaPrewarmManifest, coreIdentity);
  const temporalPolicy = readReadyCapabilities(
    qaPrewarm.capabilities,
    createMinimalWaterQualityProfile(coreIdentity.qualityProfile.id),
    coreIdentity.drawingBuffer,
  ).rendering.temporal;
  if (canonicalJson(value.temporalPolicy) !== canonicalJson(temporalPolicy)) {
    throw new Error(
      "Regression acceptance temporalPolicy must be the ready capabilities.rendering.temporal.",
    );
  }
  if (!isRecord(value.drawingBuffer) || !isRecord(value.browserCanvas)) {
    throw new TypeError("Regression acceptance buffers must be present.");
  }
  assertRegressionDrawingBuffersAgree({
    browserCanvas: value.browserCanvas as unknown as RegressionDrawingBuffer,
    coreDrawingBuffer: coreIdentity.drawingBuffer,
    qaPrewarm: { width: qaPrewarm.width, height: qaPrewarm.height },
  });
  const screenshotAsserted =
    isRecord(value.screenshot) && value.screenshot.asserted === true;
  const screenshotProfile = readScreenshotProfileEvidence({
    value: value.screenshotProfile,
    rendererDevice: value.rendererDevice,
    topFingerprint: value.rendererDeviceFingerprint,
    asserted: screenshotAsserted,
  });
  bindScreenshotProfileToDocument(screenshotProfile, value);
  const temporalStress =
    value.temporalStress === null || value.temporalStress === undefined
      ? null
      : readTemporalStressEvidence(value.temporalStress);
  if (temporalStress !== null) {
    bindTemporalStressToDocument(temporalStress, value, coreIdentity);
  }
  const presentationFrame =
    value.presentationFrame === null || value.presentationFrame === undefined
      ? null
      : readPresentationFrameEvidence(value.presentationFrame);
  if (presentationFrame !== null) {
    bindPresentationFrameToDocument(presentationFrame, value, coreIdentity);
  }
  return deepFreeze(
    deepClone({
      ...value,
      temporalPolicy,
      qaPrewarmManifest: qaPrewarm,
      screenshotProfile,
      temporalStress,
      presentationFrame,
    }),
  );
}

function createTemporalStressRun(
  input: TemporalStressRunInput,
  stressId: TemporalStressId,
  frameCount: number,
): TemporalStressRunEvidence {
  const cameraPath = Object.freeze(
    input.cameraPath.map((camera, index) =>
      readExpectedCamera(stressId, camera, index),
    ),
  );
  const controls = deepFreeze({
    artisticControls: readArtisticControls(input.artisticControls),
    waterPreset: readWaterPreset(input.waterPreset),
    transition: "continuous" as const,
    sha256: sha256CanonicalJson({
      artisticControls: input.artisticControls,
      waterPreset: input.waterPreset,
      transition: "continuous",
    }),
  });
  const environment = deepFreeze({
    reflection: readReflection(input.reflection),
    lighting: readLighting(input.lighting),
    sha256: sha256CanonicalJson({
      reflection: input.reflection,
      lighting: input.lighting,
    }),
  });
  const prime = readPrime(input.prime);
  const frames = Object.freeze(
    input.frames.map((frame, index) => createTemporalStressFrame(frame, index)),
  );
  if (frames.length !== frameCount || cameraPath.length !== frameCount) {
    throw new Error(
      "Temporal stress cameraPath and frames must equal frameCount.",
    );
  }
  const unsignedRun = {
    id: input.id,
    cameraPath,
    controls,
    environment,
    prime,
    frames,
  };
  return deepFreeze({
    ...unsignedRun,
    sha256: sha256CanonicalJson(omitShaAndPassed(unsignedRun)),
  });
}

function readTemporalStressRun(
  value: unknown,
  stressId: TemporalStressId,
  expectedId: TemporalStressRunId,
  startTick: number,
  ticksPerFrame: number,
  frameCount: number,
): TemporalStressRunEvidence {
  if (!isRecord(value) || !hasExactKeys(value, RUN_KEYS)) {
    throw new TypeError("Temporal stress run must use the exact run contract.");
  }
  if (value.id !== expectedId) {
    throw new Error(
      `Temporal stress run id must be ${expectedId}, received ${String(value.id)}.`,
    );
  }
  if (
    !Array.isArray(value.cameraPath) ||
    value.cameraPath.length !== frameCount
  ) {
    throw new Error(
      "Temporal stress cameraPath length must equal the declared frameCount.",
    );
  }
  const cameraPath = Object.freeze(
    value.cameraPath.map((camera, index) =>
      readExpectedCamera(stressId, camera, index),
    ),
  );
  const controls = readControls(value.controls);
  const environment = readEnvironment(value.environment);
  const prime = readPrime(value.prime);
  bindPrimeProgression(stressId, expectedId, prime);
  if (!Array.isArray(value.frames) || value.frames.length !== frameCount) {
    throw new Error(
      "Temporal stress frames length must equal the declared frameCount.",
    );
  }
  const frames = value.frames.map((frame, index) =>
    readTemporalStressFrame(frame, index, startTick, ticksPerFrame, prime),
  );
  bindPrimeToFirstFrame(prime, frames, startTick, ticksPerFrame);
  bindRunRevisions(stressId, frames);
  const unsignedRun = {
    id: expectedId,
    cameraPath,
    controls,
    environment,
    prime,
    frames: Object.freeze(frames),
  };
  assertSha256(value.sha256, "run.sha256");
  const expectedHash = sha256CanonicalJson(omitShaAndPassed(unsignedRun));
  if (value.sha256 !== expectedHash) {
    throw new Error(
      "Temporal stress run sha256 does not match path, controls, environment, prime, and frames.",
    );
  }
  return deepFreeze({
    ...unsignedRun,
    sha256: value.sha256,
  });
}

function readTemporalStressFrame(
  value: unknown,
  index: number,
  startTick: number,
  ticksPerFrame: number,
  prime: TemporalStressPrimeReceipt,
): TemporalStressFrameEvidence {
  if (!isRecord(value) || !hasExactKeys(value, FRAME_KEYS)) {
    throw new TypeError(
      `Temporal stress frame ${String(index)} must use the exact frame contract.`,
    );
  }
  if (value.index !== index) {
    throw new Error(
      `Temporal stress frame index must be sequential; expected ${String(index)}.`,
    );
  }
  const expectedTick = startTick + (index + 1) * ticksPerFrame;
  if (value.tick !== expectedTick) {
    throw new Error(
      `Temporal stress frame ${String(index)} tick must be ${String(expectedTick)}.`,
    );
  }
  if (value.presentationId !== prime.presentationId + 1 + index) {
    throw new Error(
      `Temporal stress frame ${String(index)} presentationId must be prime+${String(index + 1)}.`,
    );
  }
  if (value.timeSeconds !== expectedTick / TEMPORAL_STRESS_FIXED_TICK_HZ) {
    throw new Error(
      `Temporal stress frame ${String(index)} timeSeconds must equal tick / 60.`,
    );
  }
  if (value.resetReason !== null || value.resetFrame !== false) {
    throw new Error(
      `Temporal stress frame ${String(index)} must not record a cut or reset.`,
    );
  }
  assertNonNegativeInteger(value.seed, "seed");
  assertSha256(value.manifestHash, "manifestHash");
  assertNonNegativeInteger(value.cameraRevision, "cameraRevision");
  assertNonNegativeInteger(value.cameraCutRevision, "cameraCutRevision");
  assertNonNegativeInteger(value.controlRevision, "controlRevision");
  assertNonNegativeInteger(value.seaStateCutRevision, "seaStateCutRevision");
  assertNonNegativeInteger(value.originRevision, "originRevision");
  assertNonNegativeInteger(
    value.simulationResetRevision,
    "simulationResetRevision",
  );
  assertPositiveInteger(value.historyEpoch, "historyEpoch");
  assertSha256(value.currentColor, "currentColor");
  assertSha256(value.finalColor, "finalColor");
  assertSha256(value.motionVector, "motionVector");
  assertSha256(value.depth, "depth");
  assertSha256(value.normal, "normal");
  assertSha256(value.fresnel, "fresnel");
  assertSha256(value.glint, "glint");
  return deepFreeze({
    index,
    tick: value.tick,
    presentationId: value.presentationId,
    manifestHash: value.manifestHash,
    seed: value.seed,
    timeSeconds: value.timeSeconds,
    cameraRevision: value.cameraRevision,
    cameraCutRevision: value.cameraCutRevision,
    controlRevision: value.controlRevision,
    seaStateCutRevision: value.seaStateCutRevision,
    originRevision: value.originRevision,
    simulationResetRevision: value.simulationResetRevision,
    historyEpoch: value.historyEpoch,
    resetReason: null,
    resetFrame: false,
    currentColor: value.currentColor,
    finalColor: value.finalColor,
    motionVector: value.motionVector,
    depth: value.depth,
    normal: value.normal,
    fresnel: value.fresnel,
    glint: value.glint,
  });
}

function bindPrimeToFirstFrame(
  prime: TemporalStressPrimeReceipt,
  frames: readonly TemporalStressFrameEvidence[],
  startTick: number,
  ticksPerFrame: number,
): void {
  const first = frames[0];
  if (first === undefined) {
    throw new Error("Temporal stress run has no frames.");
  }
  if (prime.tick !== startTick) {
    throw new Error(
      "Temporal stress prime.tick must equal the recipe startTick.",
    );
  }
  if (first.tick !== prime.tick + ticksPerFrame) {
    throw new Error(
      "The first stress frame tick must be prime.tick plus ticksPerFrame.",
    );
  }
  if (first.historyEpoch !== prime.historyEpoch) {
    throw new Error(
      "The first stress frame historyEpoch must match the last prime.",
    );
  }
  if (first.simulationResetRevision !== prime.simulationResetRevision) {
    throw new Error(
      "The first stress frame simulationResetRevision must match the last prime.",
    );
  }
  if (first.seed !== prime.seed) {
    throw new Error("The first stress frame seed must match the last prime.");
  }
  if (first.manifestHash !== prime.manifestHash) {
    throw new Error(
      "The first stress frame manifestHash must match the last prime.",
    );
  }
  if (first.controlRevision !== prime.controlRevision) {
    throw new Error(
      "The first stress frame controlRevision must match the last prime.",
    );
  }
  if (first.cameraCutRevision !== prime.cameraCutRevision) {
    throw new Error(
      "The first stress frame cameraCutRevision must match the last prime.",
    );
  }
  if (first.seaStateCutRevision !== prime.seaStateCutRevision) {
    throw new Error(
      "The first stress frame seaStateCutRevision must match the last prime.",
    );
  }
  if (first.originRevision !== prime.originRevision) {
    throw new Error(
      "The first stress frame originRevision must match the last prime.",
    );
  }
}

function bindRunRevisions(
  stressId: TemporalStressId,
  frames: readonly TemporalStressFrameEvidence[],
): void {
  const first = frames[0];
  if (first === undefined) {
    throw new Error("Temporal stress run has no frames.");
  }
  for (const [index, frame] of frames.entries()) {
    if (frame.manifestHash !== first.manifestHash) {
      throw new Error(
        "Temporal stress manifestHash must stay stable in a run.",
      );
    }
    if (frame.seed !== first.seed) {
      throw new Error("Temporal stress seed must stay stable in a run.");
    }
    if (frame.historyEpoch !== first.historyEpoch) {
      throw new Error(
        "Temporal stress historyEpoch must stay stable in a continuous run.",
      );
    }
    if (frame.cameraCutRevision !== first.cameraCutRevision) {
      throw new Error("Temporal stress frames must not include a camera cut.");
    }
    if (frame.controlRevision !== first.controlRevision) {
      throw new Error("Temporal stress controlRevision must stay stable.");
    }
    if (frame.seaStateCutRevision !== first.seaStateCutRevision) {
      throw new Error("Temporal stress seaStateCutRevision must stay stable.");
    }
    if (frame.originRevision !== first.originRevision) {
      throw new Error("Temporal stress originRevision must stay stable.");
    }
    if (frame.simulationResetRevision !== first.simulationResetRevision) {
      throw new Error(
        "Temporal stress simulationResetRevision must stay stable.",
      );
    }
    if (index === 0) {
      continue;
    }
    const previous = frames[index - 1];
    if (previous === undefined) {
      throw new Error("Temporal stress frame pairing drifted.");
    }
    if (stressId === "thin-detail-jitter-only-hold") {
      if (frame.cameraRevision !== first.cameraRevision) {
        throw new Error(
          "Thin-detail cameraRevision must stay fixed on the horizon hold.",
        );
      }
    } else if (frame.cameraRevision <= previous.cameraRevision) {
      throw new Error(
        "Temporal stress cameraRevision must increase when the camera moves.",
      );
    }
  }
}

function readPrime(value: unknown): TemporalStressPrimeReceipt {
  if (!isRecord(value) || !hasExactKeys(value, PRIME_KEYS)) {
    throw new TypeError(
      "Temporal stress prime receipt must use the exact contract.",
    );
  }
  assertNonNegativeInteger(value.presentationId, "prime.presentationId");
  assertNonNegativeInteger(value.tick, "prime.tick");
  assertPositiveInteger(value.historyEpoch, "prime.historyEpoch");
  assertNonNegativeInteger(
    value.simulationResetRevision,
    "prime.simulationResetRevision",
  );
  if (typeof value.resetFrame !== "boolean") {
    throw new TypeError("prime.resetFrame must be a boolean.");
  }
  if (value.resetReason !== null && typeof value.resetReason !== "string") {
    throw new TypeError("prime.resetReason must be a string or null.");
  }
  assertNonNegativeInteger(value.seed, "prime.seed");
  assertSha256(value.manifestHash, "prime.manifestHash");
  assertNonNegativeInteger(value.controlRevision, "prime.controlRevision");
  assertNonNegativeInteger(value.cameraCutRevision, "prime.cameraCutRevision");
  assertNonNegativeInteger(
    value.seaStateCutRevision,
    "prime.seaStateCutRevision",
  );
  assertNonNegativeInteger(value.originRevision, "prime.originRevision");
  return deepFreeze({
    presentationId: value.presentationId,
    tick: value.tick,
    historyEpoch: value.historyEpoch,
    resetReason: value.resetReason,
    resetFrame: value.resetFrame,
    simulationResetRevision: value.simulationResetRevision,
    seed: value.seed,
    manifestHash: value.manifestHash,
    controlRevision: value.controlRevision,
    cameraCutRevision: value.cameraCutRevision,
    seaStateCutRevision: value.seaStateCutRevision,
    originRevision: value.originRevision,
  });
}

function readControls(value: unknown): TemporalStressControlsEvidence {
  if (!isRecord(value) || !hasExactKeys(value, CONTROLS_KEYS)) {
    throw new TypeError(
      "Temporal stress controls must use the exact contract.",
    );
  }
  if (value.transition !== "continuous") {
    throw new Error("Temporal stress controls.transition must be continuous.");
  }
  const artisticControls = readArtisticControls(value.artisticControls);
  const waterPreset = readWaterPreset(value.waterPreset);
  assertSha256(value.sha256, "controls.sha256");
  const expected = sha256CanonicalJson({
    artisticControls,
    waterPreset,
    transition: "continuous",
  });
  if (value.sha256 !== expected) {
    throw new Error(
      "Temporal stress controls sha256 does not match the payload.",
    );
  }
  return deepFreeze({
    artisticControls,
    waterPreset,
    transition: "continuous" as const,
    sha256: value.sha256,
  });
}

function readEnvironment(value: unknown): TemporalStressEnvironmentEvidence {
  if (!isRecord(value) || !hasExactKeys(value, ENVIRONMENT_KEYS)) {
    throw new TypeError(
      "Temporal stress environment must use the exact contract.",
    );
  }
  const reflection = readReflection(value.reflection);
  const lighting = readLighting(value.lighting);
  assertSha256(value.sha256, "environment.sha256");
  const expected = sha256CanonicalJson({
    reflection,
    lighting,
  });
  if (value.sha256 !== expected) {
    throw new Error(
      "Temporal stress environment sha256 does not match the payload.",
    );
  }
  return deepFreeze({
    reflection,
    lighting,
    sha256: value.sha256,
  });
}

function readExpectedCamera(
  id: TemporalStressId,
  value: unknown,
  index: number,
): QaCameraV1 {
  const camera = readCamera(value, `cameraPath[${String(index)}]`);
  const expected = expectedCameraAt(id, index);
  if (canonicalJson(camera) !== canonicalJson(expected)) {
    throw new Error(
      `Temporal stress ${id} cameraPath[${String(index)}] is not the exact recipe camera.`,
    );
  }
  return camera;
}

function expectedCameraAt(id: TemporalStressId, index: number): QaCameraV1 {
  if (id === "fast-pan-frozen-simulation") {
    return {
      ...HORIZON_CAMERA,
      target: [400, 0, -60 + index * 8],
    };
  }
  if (id === "high-frequency-glint-horizon-strafe") {
    const offsetZ = (index + 1) * 0.25;
    return {
      ...HORIZON_CAMERA,
      position: [0, 8, offsetZ],
      target: [400, 0, offsetZ],
    };
  }
  return HORIZON_CAMERA;
}

function readCamera(value: unknown, label: string): QaCameraV1 {
  if (!isRecord(value) || !hasExactKeys(value, CAMERA_KEYS)) {
    throw new TypeError(
      `${label} must use the exact perspective camera contract.`,
    );
  }
  if (value.projection !== "perspective") {
    throw new Error(`${label}.projection must be perspective.`);
  }
  const position = readFiniteTriple(value.position, `${label}.position`);
  const target = readFiniteTriple(value.target, `${label}.target`);
  const up = readFiniteTriple(value.up, `${label}.up`);
  assertFiniteNumber(value.verticalFovDegrees, `${label}.verticalFovDegrees`);
  assertFiniteNumber(value.near, `${label}.near`);
  assertFiniteNumber(value.far, `${label}.far`);
  if (!(value.near > 0) || !(value.far > value.near)) {
    throw new RangeError(`${label} near/far must be a positive finite range.`);
  }
  return deepFreeze({
    projection: "perspective",
    position,
    target,
    up,
    verticalFovDegrees: value.verticalFovDegrees,
    near: value.near,
    far: value.far,
  });
}

function readArtisticControls(value: unknown): ArtisticControls {
  if (!isRecord(value) || !hasExactKeys(value, ARTISTIC_CONTROL_KEYS)) {
    throw new TypeError(
      "Artistic controls must use the exact 13-key contract.",
    );
  }
  const controls: Record<string, number> = {};
  for (const key of ARTISTIC_CONTROL_KEYS) {
    assertFiniteNumber(value[key], `artisticControls.${key}`);
    controls[key] = value[key];
  }
  return deepFreeze(controls) as unknown as ArtisticControls;
}

function readWaterPreset(value: unknown): WaterPresetIdentity {
  if (!isRecord(value) || !hasExactKeys(value, WATER_PRESET_KEYS)) {
    throw new TypeError("Water preset identity must use the exact contract.");
  }
  if (
    value.schema !== WATER_PRESET_SCHEMA ||
    value.version !== WATER_PRESET_VERSION ||
    (value.id !== "calm" && value.id !== "swell" && value.id !== "storm")
  ) {
    throw new Error("Water preset identity schema/version/id is unsupported.");
  }
  assertSha256(value.presetHash, "waterPreset.presetHash");
  return deepFreeze({
    schema: WATER_PRESET_SCHEMA,
    version: WATER_PRESET_VERSION,
    id: value.id,
    presetHash: value.presetHash,
  });
}

function readReflection(value: unknown): HostEnvironmentReflectionDescriptor {
  if (!isRecord(value) || !hasExactKeys(value, REFLECTION_KEYS)) {
    throw new TypeError(
      "Environment reflection must use the exact descriptor contract.",
    );
  }
  if (
    typeof value.identity !== "string" ||
    value.format !== "rgba8unorm" ||
    value.type !== "equirect" ||
    value.colorSpace !== "srgb"
  ) {
    throw new Error(
      "Environment reflection layout is not the supported descriptor.",
    );
  }
  assertSha256(value.fingerprint, "reflection.fingerprint");
  assertPositiveInteger(value.width, "reflection.width");
  assertPositiveInteger(value.height, "reflection.height");
  return deepFreeze({
    identity: value.identity,
    fingerprint: value.fingerprint,
    width: value.width,
    height: value.height,
    format: "rgba8unorm",
    type: "equirect",
    colorSpace: "srgb",
  });
}

function readLighting(value: unknown): HostEnvironmentState {
  if (!isRecord(value) || !hasExactKeys(value, LIGHTING_KEYS)) {
    throw new TypeError(
      "Environment lighting must use the exact 9-key contract.",
    );
  }
  const lighting: Record<string, number> = {};
  for (const key of LIGHTING_KEYS) {
    assertFiniteNumber(value[key], `lighting.${key}`);
    lighting[key] = value[key];
  }
  return deepFreeze(lighting) as unknown as HostEnvironmentState;
}

function readClip(value: unknown): PresentationFrameClip {
  if (!isRecord(value) || !hasExactKeys(value, CLIP_KEYS)) {
    throw new TypeError(
      "presentationFrame.clip must be { x, y, width, height }.",
    );
  }
  const x = readNonNegativeInteger(value.x, "clip.x");
  const y = readNonNegativeInteger(value.y, "clip.y");
  const width = readPositiveInteger(value.width, "clip.width");
  const height = readPositiveInteger(value.height, "clip.height");
  return deepFreeze({
    x,
    y,
    width,
    height,
  });
}

function readJitterSequence(
  value: unknown,
): typeof TEMPORAL_STRESS_JITTER_SEQUENCE {
  if (!isRecord(value) || !hasExactKeys(value, JITTER_SEQUENCE_KEYS)) {
    throw new TypeError("Temporal stress jitterSequence must be exact.");
  }
  if (
    value.id !== TEMPORAL_STRESS_JITTER_SEQUENCE.id ||
    value.period !== TEMPORAL_STRESS_JITTER_SEQUENCE.period
  ) {
    throw new Error(
      "Temporal stress jitterSequence must be three-r185-halton-2-3-31 / 31.",
    );
  }
  return TEMPORAL_STRESS_JITTER_SEQUENCE;
}

function readExactThresholds(
  id: TemporalStressId,
  value: unknown,
): Readonly<Record<string, number>> {
  const policy = METRIC_POLICIES[id];
  const record = readNumericRecord(value, "thresholds");
  if (!hasExactKeys(record, policy.thresholdKeys)) {
    throw new TypeError(
      `Temporal stress ${id} thresholds must use the exact policy keys.`,
    );
  }
  for (const rule of policy.rules) {
    if (record[rule.thresholdKey] !== rule.threshold) {
      throw new Error(
        `Temporal stress ${id} thresholds.${rule.thresholdKey} must be the exact policy value.`,
      );
    }
  }
  return record;
}

function readExactObserved(
  id: TemporalStressId,
  value: unknown,
): Readonly<Record<string, number>> {
  const policy = METRIC_POLICIES[id];
  const record = readNumericRecord(value, "observed");
  if (!hasExactKeys(record, policy.observedKeys)) {
    throw new TypeError(
      `Temporal stress ${id} observed must use the exact policy keys.`,
    );
  }
  return record;
}

function evaluateMetricPolicy(
  id: TemporalStressId,
  thresholds: Readonly<Record<string, number>>,
  observed: Readonly<Record<string, number>>,
): boolean {
  for (const rule of METRIC_POLICIES[id].rules) {
    const threshold = thresholds[rule.thresholdKey];
    const actual = observed[rule.observedKey];
    if (threshold === undefined || actual === undefined) {
      return false;
    }
    if (rule.compare === "gte" && !(actual >= threshold)) {
      return false;
    }
    if (rule.compare === "lte" && !(actual <= threshold)) {
      return false;
    }
    if (rule.compare === "eq" && actual !== threshold) {
      return false;
    }
  }
  return true;
}

function readQaPrewarmV9(
  value: unknown,
  coreIdentity: QaBoundCoreManifestIdentity,
): QaFramePrewarmReceipt {
  if (!isRecord(value) || !hasExactKeys(value, QA_PREWARM_KEYS)) {
    throw new TypeError("Regression acceptance requires QA prewarm v9.");
  }
  if (
    !isRecord(value.manifest) ||
    value.manifest.schema !== QA_FRAME_PREWARM_MANIFEST.schema ||
    value.manifest.version !== QA_FRAME_PREWARM_MANIFEST.version ||
    value.manifest.id !== QA_FRAME_PREWARM_MANIFEST.id
  ) {
    throw new Error("Regression acceptance requires QA prewarm v9.");
  }
  if (
    canonicalJson(value.manifest.captures) !==
      canonicalJson(QA_FRAME_PREWARM_MANIFEST.captures) ||
    canonicalJson(value.manifest.coreDeclarations) !==
      canonicalJson(QA_FRAME_PREWARM_MANIFEST.coreDeclarations)
  ) {
    throw new Error(
      "Regression acceptance requires the exact QA v9 25-name capture mapping.",
    );
  }
  if (QA_FRAME_PREWARM_MANIFEST.captures.length !== 25) {
    throw new Error("QA v9 capture contract must name exactly 25 outputs.");
  }
  const core = readQaBoundCoreManifestIdentity(value.core);
  if (core.manifestHash !== coreIdentity.manifestHash) {
    throw new Error(
      "QA prewarm Core identity disagrees with the Regression acceptance Core hash.",
    );
  }
  const capabilities = readReadyCapabilities(
    value.capabilities,
    createMinimalWaterQualityProfile(core.qualityProfile.id),
    core.drawingBuffer,
  );
  if (
    value.width !== core.drawingBuffer.width ||
    value.height !== core.drawingBuffer.height
  ) {
    throw new Error(
      "QA prewarm width/height must match the Core drawing buffer.",
    );
  }
  const rendererDevice = readRendererDevice(value.rendererDevice);
  const progress = readPrewarmProgress(value.progress);
  return {
    manifest: QA_FRAME_PREWARM_MANIFEST,
    core,
    capabilities,
    width: core.drawingBuffer.width,
    height: core.drawingBuffer.height,
    rendererDevice,
    progress,
  };
}

function readPrewarmProgress(
  value: unknown,
): QaFramePrewarmReceipt["progress"] {
  if (!isRecord(value) || !hasExactKeys(value, PROGRESS_KEYS)) {
    throw new TypeError(
      "QA prewarm progress must record completed declarations.",
    );
  }
  const expectedIds = mappedCoreDeclarationIds();
  if (
    !Array.isArray(value.completedDeclarationIds) ||
    canonicalJson(value.completedDeclarationIds) !== canonicalJson(expectedIds)
  ) {
    throw new Error(
      "QA prewarm progress must list the exact mapped Core declaration IDs.",
    );
  }
  if (
    value.completedWork !== expectedIds.length ||
    value.totalWork !== expectedIds.length
  ) {
    throw new Error(
      "QA prewarm progress completedWork/totalWork must match the mapped Core declarations.",
    );
  }
  return deepFreeze({
    completedWork: expectedIds.length,
    totalWork: expectedIds.length,
    completedDeclarationIds: expectedIds,
  });
}

function readRendererDevice(
  value: unknown,
): NonNullable<QaFramePrewarmReceipt["rendererDevice"]> {
  if (!isRecord(value) || !hasExactKeys(value, DEVICE_KEYS)) {
    throw new Error(
      "Regression acceptance requires the QA renderer device inventory.",
    );
  }
  if (
    !Array.isArray(value.features) ||
    !value.features.every((feature) => typeof feature === "string")
  ) {
    throw new TypeError("QA renderer device features must be strings.");
  }
  if (!isRecord(value.limits)) {
    throw new TypeError("QA renderer device limits must be a finite record.");
  }
  const limits: Record<string, number> = {};
  for (const [name, limit] of Object.entries(value.limits)) {
    if (typeof limit !== "number" || !Number.isFinite(limit)) {
      throw new TypeError(`QA renderer device limit ${name} must be finite.`);
    }
    limits[name] = limit;
  }
  return deepFreeze({
    features: [...value.features],
    limits,
  });
}

function mappedCoreDeclarationIds(): readonly string[] {
  const mapped: string[] = [];
  for (const coreId of Object.values(QA_TO_CORE_DECLARATION_IDS)) {
    if (!mapped.includes(coreId)) {
      mapped.push(coreId);
    }
  }
  return mapped;
}

function readTemporalStressRecipe(
  id: TemporalStressId,
  value: Record<string, unknown>,
): TemporalStressRecipePolicy {
  const recipe = TEMPORAL_STRESS_RECIPE_POLICY[id];
  const startTick = readNonNegativeInteger(value.startTick, "startTick");
  const ticksPerFrame = readNonNegativeInteger(
    value.ticksPerFrame,
    "ticksPerFrame",
  );
  const primePresentations = readNonNegativeInteger(
    value.primePresentations,
    "primePresentations",
  );
  const frameCount = readPositiveInteger(value.frameCount, "frameCount");
  if (
    startTick !== recipe.startTick ||
    ticksPerFrame !== recipe.ticksPerFrame ||
    primePresentations !== recipe.primePresentations ||
    frameCount !== recipe.frameCount
  ) {
    throw new Error(
      `Temporal stress ${id} must use the exact recipe ${String(recipe.startTick)}/${String(recipe.ticksPerFrame)}/${String(recipe.primePresentations)}/${String(recipe.frameCount)}.`,
    );
  }
  return recipe;
}

function bindPrimeProgression(
  stressId: TemporalStressId,
  runId: TemporalStressRunId,
  prime: TemporalStressPrimeReceipt,
): void {
  if (prime.resetReason !== null || prime.resetFrame !== false) {
    throw new Error(
      "Temporal stress last prime must record resetReason=null and resetFrame=false.",
    );
  }
  const expectedId = expectedPrimePresentationId(stressId, runId);
  if (prime.presentationId !== expectedId) {
    throw new Error(
      `Temporal stress ${stressId} ${runId} prime presentationId must be ${String(expectedId)}.`,
    );
  }
}

function expectedPrimePresentationId(
  stressId: TemporalStressId,
  runId: TemporalStressRunId,
): number {
  if (
    stressId === "high-frequency-glint-horizon-strafe" &&
    runId === "sun-off"
  ) {
    return 40;
  }
  return 8;
}

function readDurablePngAttachmentName(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(
      "presentationFrame.pngAttachmentName must be a non-empty string.",
    );
  }
  if (
    value.includes("/") ||
    value.includes("\\") ||
    !value.endsWith(".png") ||
    !/--worker-\d+--/u.test(value) ||
    !/--retry-\d+--/u.test(value)
  ) {
    throw new Error(
      "presentationFrame.pngAttachmentName must be the unique project/testId/worker/retry PNG basename.",
    );
  }
  return value;
}

function bindGlintRunAuthority(
  id: TemporalStressId,
  runs: readonly TemporalStressRunEvidence[],
  observed: Readonly<Record<string, number>>,
  recipe: TemporalStressRecipePolicy,
): void {
  if (id !== "high-frequency-glint-horizon-strafe") {
    return;
  }
  const on = runs[0];
  const off = runs[1];
  if (on === undefined || off === undefined) {
    throw new Error("Glint stress evidence requires sun-on and sun-off runs.");
  }
  if (
    off.prime.simulationResetRevision !==
    on.prime.simulationResetRevision + 1
  ) {
    throw new Error(
      "Glint off prime simulationResetRevision must be on prime + 1.",
    );
  }
  if (
    off.prime.presentationId !==
    on.prime.presentationId + recipe.frameCount + recipe.primePresentations
  ) {
    throw new Error(
      "Glint off prime presentationId must follow on prime + 24 + 8.",
    );
  }
  const derived = deriveGlintCommonSource(on, off);
  if (observed.commonSource !== derived) {
    throw new Error(
      "Glint observed.commonSource must equal the derived common-source receipt.",
    );
  }
}

function deriveGlintCommonSource(
  on: TemporalStressRunEvidence,
  off: TemporalStressRunEvidence,
): 0 | 1 {
  if (canonicalJson(on.cameraPath) !== canonicalJson(off.cameraPath)) {
    return 0;
  }
  if (
    canonicalJson({
      artisticControls: on.controls.artisticControls,
      waterPreset: on.controls.waterPreset,
      transition: on.controls.transition,
    }) !==
    canonicalJson({
      artisticControls: off.controls.artisticControls,
      waterPreset: off.controls.waterPreset,
      transition: off.controls.transition,
    })
  ) {
    return 0;
  }
  if (
    canonicalJson(on.environment.reflection) !==
    canonicalJson(off.environment.reflection)
  ) {
    return 0;
  }
  if (
    canonicalJson(lightingExceptRadius(on.environment.lighting)) !==
    canonicalJson(lightingExceptRadius(off.environment.lighting))
  ) {
    return 0;
  }
  if (on.frames.length !== off.frames.length) {
    return 0;
  }
  for (const [index, onFrame] of on.frames.entries()) {
    const offFrame = off.frames[index];
    if (offFrame === undefined) {
      return 0;
    }
    if (
      onFrame.motionVector !== offFrame.motionVector ||
      onFrame.depth !== offFrame.depth ||
      onFrame.normal !== offFrame.normal ||
      onFrame.fresnel !== offFrame.fresnel ||
      onFrame.tick !== offFrame.tick ||
      onFrame.seed !== offFrame.seed ||
      onFrame.manifestHash !== offFrame.manifestHash ||
      onFrame.cameraRevision !== offFrame.cameraRevision ||
      onFrame.cameraCutRevision !== offFrame.cameraCutRevision ||
      onFrame.controlRevision !== offFrame.controlRevision ||
      onFrame.seaStateCutRevision !== offFrame.seaStateCutRevision ||
      onFrame.originRevision !== offFrame.originRevision
    ) {
      return 0;
    }
  }
  return 1;
}

function lightingExceptRadius(
  lighting: HostEnvironmentState,
): Omit<HostEnvironmentState, "sunAngularRadiusRadians"> {
  return Object.fromEntries(
    Object.entries(lighting).filter(
      ([key]) => key !== "sunAngularRadiusRadians",
    ),
  ) as Omit<HostEnvironmentState, "sunAngularRadiusRadians">;
}

function bindTemporalStressToDocument(
  stress: TemporalStressEvidenceV1,
  document: Record<string, unknown>,
  coreIdentity: QaBoundCoreManifestIdentity,
): void {
  if (
    document.artisticControls === null ||
    document.waterPreset === null ||
    document.environment === null ||
    !isRecord(document.environment)
  ) {
    throw new Error(
      "Temporal stress evidence must bind top artisticControls, waterPreset, and environment.",
    );
  }
  for (const run of stress.runs) {
    if (run.prime.seed !== document.seed) {
      throw new Error(
        "Temporal stress prime seed must match the top artifact.",
      );
    }
    if (run.prime.manifestHash !== coreIdentity.manifestHash) {
      throw new Error(
        "Temporal stress prime manifestHash must match the Core identity.",
      );
    }
    if (
      canonicalJson(run.controls.artisticControls) !==
      canonicalJson(document.artisticControls)
    ) {
      throw new Error(
        "Temporal stress artisticControls must match the top artifact.",
      );
    }
    if (
      canonicalJson(run.controls.waterPreset) !==
      canonicalJson(document.waterPreset)
    ) {
      throw new Error(
        "Temporal stress waterPreset must match the top artifact.",
      );
    }
    if (
      canonicalJson(run.environment.reflection) !==
      canonicalJson(document.environment.reflection)
    ) {
      throw new Error(
        "Temporal stress reflection must match the top environment.",
      );
    }
    if (stress.id === "high-frequency-glint-horizon-strafe") {
      if (
        canonicalJson(lightingExceptRadius(run.environment.lighting)) !==
        canonicalJson(
          lightingExceptRadius(readLighting(document.environment.lighting)),
        )
      ) {
        throw new Error(
          "Glint run lighting must match the top environment except sunAngularRadiusRadians.",
        );
      }
    } else if (
      canonicalJson(run.environment.lighting) !==
      canonicalJson(document.environment.lighting)
    ) {
      throw new Error(
        "Temporal stress lighting must match the top environment.",
      );
    }
    for (const frame of run.frames) {
      if (frame.seed !== document.seed) {
        throw new Error(
          "Temporal stress frame seed must match the top artifact.",
        );
      }
      if (frame.manifestHash !== coreIdentity.manifestHash) {
        throw new Error(
          "Temporal stress frame manifestHash must match the Core identity.",
        );
      }
    }
  }
}

function bindScreenshotProfileToDocument(
  profile: ReturnType<typeof readScreenshotProfileEvidence>,
  document: Record<string, unknown>,
): void {
  if (
    document.os !== profile.os ||
    document.osRelease !== profile.osRelease ||
    document.arch !== profile.arch ||
    document.cpuModel !== profile.cpuModel ||
    document.chromeVersion !== profile.chromeVersion ||
    document.headless !== profile.headless ||
    document.powerState !== profile.powerState ||
    document.lowPowerMode !== profile.lowPowerMode ||
    document.projectId !== profile.projectId ||
    document.rendererDeviceFingerprint !== profile.rendererDeviceFingerprint
  ) {
    throw new Error(
      "screenshotProfile host identity must equal the top Regression acceptance artifact.",
    );
  }
  if (isRecord(document.screenshot)) {
    if (document.screenshot.asserted !== profile.asserted) {
      throw new Error(
        "screenshot.asserted must match the recomputed screenshotProfile.asserted.",
      );
    }
    if (document.screenshot.authoritative !== profile.authoritative) {
      throw new Error(
        "screenshot.authoritative must match the recomputed screenshotProfile.authoritative.",
      );
    }
  }
}

function bindPresentationFrameToDocument(
  frame: PresentationFrameEvidence,
  document: Record<string, unknown>,
  coreIdentity: QaBoundCoreManifestIdentity,
): void {
  if (frame.seed !== document.seed || frame.tick !== document.tick) {
    throw new Error(
      "presentationFrame seed/tick must match the top Regression acceptance artifact.",
    );
  }
  if (frame.timeSeconds !== frame.tick / TEMPORAL_STRESS_FIXED_TICK_HZ) {
    throw new Error("presentationFrame.timeSeconds must equal tick / 60.");
  }
  if (frame.controlRevision !== document.controlRevision) {
    throw new Error(
      "presentationFrame.controlRevision must match the top artifact.",
    );
  }
  if (frame.manifestHash !== coreIdentity.manifestHash) {
    throw new Error(
      "presentationFrame.manifestHash must match the Core identity.",
    );
  }
  if (canonicalJson(frame.camera) !== canonicalJson(document.camera)) {
    throw new Error(
      "presentationFrame.camera must match the top artifact camera.",
    );
  }
  if (
    isRecord(document.screenshot) &&
    isRecord(document.screenshot.criticalRegion)
  ) {
    const region = document.screenshot.criticalRegion;
    if (
      region.kind === "clip" &&
      (region.x !== frame.clip.x ||
        region.y !== frame.clip.y ||
        region.width !== frame.clip.width ||
        region.height !== frame.clip.height)
    ) {
      throw new Error(
        "presentationFrame.clip must match screenshot.criticalRegion.",
      );
    }
  }
  if (isRecord(document.screenshot)) {
    if (frame.snapshotName !== document.screenshot.name) {
      throw new Error(
        "presentationFrame.snapshotName must match screenshot.name.",
      );
    }
  }
}

function readNumericRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, number>> {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new TypeError(
      `Temporal stress ${label} must be a non-empty numeric record.`,
    );
  }
  const record: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new TypeError(
        `Temporal stress ${label}.${key} must be a finite number.`,
      );
    }
    record[key] = entry;
  }
  return Object.freeze(record);
}

function expectedRunIdsFor(
  id: TemporalStressId,
): readonly TemporalStressRunId[] {
  if (id === "high-frequency-glint-horizon-strafe") {
    return ["sun-on", "sun-off"];
  }
  return ["default"];
}

function isTemporalStressId(value: unknown): value is TemporalStressId {
  return (
    value === "fast-pan-frozen-simulation" ||
    value === "high-frequency-glint-horizon-strafe" ||
    value === "thin-detail-jitter-only-hold"
  );
}

function omitShaAndPassed(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => omitShaAndPassed(entry));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const record: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "sha256" || key === "passed") {
      continue;
    }
    record[key] = omitShaAndPassed(entry);
  }
  return record;
}

function assertNoRawCapturePayload(value: unknown): void {
  const visit = (entry: unknown, path: string): void => {
    if (typeof entry === "string") {
      if (
        entry.length > 128 &&
        !entry.startsWith("sha256:") &&
        /^[A-Za-z0-9+/]+=*$/u.test(entry)
      ) {
        throw new Error(
          `Regression acceptance ${path} contains raw base64 capture bytes.`,
        );
      }
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach((child, index) =>
        visit(child, `${path}[${String(index)}]`),
      );
      return;
    }
    if (entry === null || typeof entry !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(entry)) {
      if (key === "data" && typeof child === "string" && child.length > 80) {
        throw new Error(
          `Regression acceptance ${path}.${key} must not retain raw capture data.`,
        );
      }
      visit(child, path === "" ? key : `${path}.${key}`);
    }
  };
  visit(value, "");
}

function sha256Bytes(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function metric(
  thresholdKey: string,
  observedKey: string,
  compare: TemporalStressMetricCompare,
  threshold: number,
): TemporalStressMetricRule {
  return { thresholdKey, observedKey, compare, threshold };
}

function observedOnly(observedKey: string): TemporalStressMetricRule {
  return {
    thresholdKey: observedKey,
    observedKey,
    compare: "eq",
    threshold: Number.NaN,
  };
}

function defineMetricPolicy(
  rules: readonly TemporalStressMetricRule[],
): TemporalStressMetricPolicy {
  const compared = rules.filter((rule) => Number.isFinite(rule.threshold));
  const observedKeys = unique(rules.map((rule) => rule.observedKey));
  const thresholdKeys = unique(compared.map((rule) => rule.thresholdKey));
  return Object.freeze({
    thresholdKeys: Object.freeze(thresholdKeys),
    observedKeys: Object.freeze(observedKeys),
    rules: Object.freeze(compared),
  });
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function readFiniteTriple(
  value: unknown,
  label: string,
): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} must be a 3-tuple.`);
  }
  const first = value[0];
  const second = value[1];
  const third = value[2];
  if (
    typeof first !== "number" ||
    typeof second !== "number" ||
    typeof third !== "number" ||
    !Number.isFinite(first) ||
    !Number.isFinite(second) ||
    !Number.isFinite(third)
  ) {
    throw new TypeError(`${label} must contain finite numbers.`);
  }
  return [first, second, third];
}

function assertFiniteNumber(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA_256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a sha256:<64 hex> digest.`);
  }
}

function readNonNegativeInteger(value: unknown, label: string): number {
  assertNonNegativeInteger(value, label);
  return value;
}

function readPositiveInteger(value: unknown, label: string): number {
  assertPositiveInteger(value, label);
  return value;
}

function assertNonNegativeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}

function assertPositiveInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

function deepClone<Value>(value: Value): Value {
  return structuredClone(value);
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    if (Array.isArray(value)) {
      for (const entry of value) {
        deepFreeze(entry);
      }
    } else {
      for (const entry of Object.values(value)) {
        deepFreeze(entry);
      }
    }
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
