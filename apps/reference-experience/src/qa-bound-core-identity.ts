import {
  createMinimalWaterPrewarmManifest,
  createMinimalWaterQualityProfile,
  MAX_ATTACHED_BODIES,
  MAX_ACTIVE_DISTURBANCES,
  MAX_GAMEPLAY_QUERY_POINTS,
  type HostEnvironmentReflectionDescriptor,
  type PrewarmDeclaration,
  type PrewarmDrawingBuffer,
  type PrewarmEffectVariant,
  type PrewarmManifest,
  type QualityProfile,
  type QualityProfileTemporal,
  type RealWaterCapabilities,
  type RenderingCapabilitiesTemporal,
} from "real-water";

export interface QaBoundCoreQualityProfileIdentity {
  readonly schema: PrewarmManifest["qualityProfile"]["schema"];
  readonly version: PrewarmManifest["qualityProfile"]["version"];
  readonly id: PrewarmManifest["qualityProfile"]["id"];
  readonly profileHash: string;
  readonly temporal: QualityProfileTemporal;
}

export interface QaBoundCoreManifestIdentity {
  readonly schema: PrewarmManifest["schema"];
  readonly version: PrewarmManifest["version"];
  readonly id: string;
  readonly manifestHash: string;
  readonly qualityProfile: QaBoundCoreQualityProfileIdentity;
  readonly drawingBuffer: PrewarmDrawingBuffer;
  readonly environmentReflection: HostEnvironmentReflectionDescriptor;
  readonly effectVariants: readonly PrewarmEffectVariant[];
  readonly declarations: readonly PrewarmDeclaration[];
}

export const NATIVE_REGRESSION_TEMPORAL_POLICY = Object.freeze({
  mode: "TRAA" as const,
  renderScale: 1 as const,
  resolutionPolicy: "drawing-buffer-exact" as const,
  taau: false as const,
  dynamicResolution: false as const,
  frameGeneration: false as const,
  msaaSamples: 0 as const,
  updateCadence: "host-present" as const,
});

export type NativeRegressionTemporalPolicy =
  typeof NATIVE_REGRESSION_TEMPORAL_POLICY;

export interface RegressionDrawingBuffer {
  readonly width: number;
  readonly height: number;
}

const SHA_256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const CORE_IDENTITY_KEYS = [
  "schema",
  "version",
  "id",
  "manifestHash",
  "qualityProfile",
  "drawingBuffer",
  "environmentReflection",
  "effectVariants",
  "declarations",
] as const;
const QUALITY_PROFILE_KEYS = [
  "schema",
  "version",
  "id",
  "profileHash",
  "temporal",
] as const;
const TEMPORAL_KEYS = [
  "mode",
  "renderScale",
  "resolutionPolicy",
  "taau",
  "dynamicResolution",
  "frameGeneration",
  "msaaSamples",
  "updateCadence",
] as const;
const CAPABILITIES_KEYS = ["rendering", "gameplay"] as const;
const RENDERING_CAPABILITY_KEYS = [
  "backend",
  "timestampQuery",
  "temporal",
  "reflection",
] as const;
const REFLECTION_CAPABILITY_KEYS = ["environment", "planar", "ssr"] as const;
const REFLECTION_SSR_KEYS = [
  "width",
  "height",
  "rawFormat",
  "compositeFormat",
  "samples",
  "mode",
  "history",
  "updateCadence",
  "missFallbackPriority",
  "blur",
] as const;
const REFLECTION_SSR_BLUR_KEYS = [
  "width",
  "height",
  "format",
  "mipCount",
  "blurQuality",
  "enabled",
] as const;
const REFLECTION_SSR_HISTORY_KEYS = [
  "width",
  "height",
  "historyFormat",
  "resolveFormat",
  "inputFormat",
  "captureFormat",
  "resetVelocityFormat",
  "maxFrames",
  "mode",
  "accumulate",
  "hitPointReprojection",
  "normalFormat",
  "resetDomains",
  "updateCadence",
] as const;
const REFLECTION_ENVIRONMENT_KEYS = ["source"] as const;
const REFLECTION_PLANAR_KEYS = [
  "width",
  "height",
  "format",
  "samples",
] as const;
const GAMEPLAY_CAPABILITY_KEYS = [
  "maxAttachedBodies",
  "maxQueryPointsPerTick",
  "maxActiveDisturbances",
  "interactionField",
] as const;
const INTERACTION_FIELD_CAPABILITY_KEYS = [
  "radiusMetres",
  "edgeFadeMetres",
  "maxSnapshotAgeTicks",
  "disturbanceKinds",
] as const;
const CAPABILITIES_TEMPORAL_KEYS = [
  ...TEMPORAL_KEYS,
  "motionFormat",
  "stockThreeRevision",
] as const;
const DRAWING_BUFFER_KEYS = ["width", "height"] as const;
const DECLARATION_KEYS = ["id", "kind", "label", "fingerprint"] as const;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function createQaBoundCoreManifestIdentity(
  manifest: PrewarmManifest,
): QaBoundCoreManifestIdentity {
  const expected = expectedCoreManifest(manifest);
  return freezeCoreIdentity(
    {
      schema: manifest.schema,
      version: manifest.version,
      id: manifest.id,
      manifestHash: manifest.manifestHash,
      qualityProfile: {
        schema: manifest.qualityProfile.schema,
        version: manifest.qualityProfile.version,
        id: manifest.qualityProfile.id,
        profileHash: manifest.qualityProfile.profileHash,
        temporal: manifest.qualityProfile.temporal,
      },
      drawingBuffer: manifest.drawingBuffer,
      environmentReflection: manifest.environmentReflection,
      effectVariants: manifest.effectVariants,
      declarations: manifest.declarations,
    },
    expected,
  );
}

export function readReadyCapabilities(
  value: unknown,
  profile: Pick<QualityProfile, "temporal" | "reflection">,
  drawingBuffer: PrewarmDrawingBuffer,
): RealWaterCapabilities {
  if (!isRecord(value) || !hasExactKeys(value, CAPABILITIES_KEYS)) {
    throw new TypeError(
      "QA prewarm receipt requires the actual ready Real Water capabilities.",
    );
  }
  if (
    !isRecord(value.rendering) ||
    !hasExactKeys(value.rendering, RENDERING_CAPABILITY_KEYS)
  ) {
    throw new TypeError(
      "Ready capabilities.rendering must include backend, timestampQuery, temporal, and reflection.",
    );
  }
  if (
    !isRecord(value.gameplay) ||
    !hasExactKeys(value.gameplay, GAMEPLAY_CAPABILITY_KEYS)
  ) {
    throw new TypeError(
      "Ready capabilities.gameplay must include the exact Body, Query, Disturbance, and interaction-field limits.",
    );
  }
  if (value.rendering.backend !== "core-webgpu") {
    throw new Error(
      "Ready capabilities.rendering.backend must be core-webgpu.",
    );
  }
  if (typeof value.rendering.timestampQuery !== "boolean") {
    throw new TypeError(
      "Ready capabilities.rendering.timestampQuery must be a boolean.",
    );
  }
  if (value.gameplay.maxQueryPointsPerTick !== MAX_GAMEPLAY_QUERY_POINTS) {
    throw new Error(
      "Ready capabilities.gameplay.maxQueryPointsPerTick disagrees with Core.",
    );
  }
  if (value.gameplay.maxAttachedBodies !== MAX_ATTACHED_BODIES) {
    throw new Error(
      "Ready capabilities.gameplay.maxAttachedBodies disagrees with Core.",
    );
  }
  if (value.gameplay.maxActiveDisturbances !== MAX_ACTIVE_DISTURBANCES) {
    throw new Error(
      "Ready capabilities.gameplay.maxActiveDisturbances disagrees with Core.",
    );
  }
  const interactionField = value.gameplay.interactionField;
  if (
    !isRecord(interactionField) ||
    !hasExactKeys(interactionField, INTERACTION_FIELD_CAPABILITY_KEYS) ||
    interactionField.radiusMetres !== 48 ||
    interactionField.edgeFadeMetres !== 8 ||
    interactionField.maxSnapshotAgeTicks !== 1 ||
    !Array.isArray(interactionField.disturbanceKinds) ||
    interactionField.disturbanceKinds.length !== 1 ||
    interactionField.disturbanceKinds[0] !== "radial-impact"
  ) {
    throw new Error(
      "Ready capabilities.gameplay.interactionField disagrees with Core.",
    );
  }
  const temporal = readCapabilitiesTemporal(
    value.rendering.temporal,
    profile.temporal,
  );
  const reflection = readCapabilitiesReflection(
    value.rendering.reflection,
    profile.reflection,
    drawingBuffer,
  );
  return deepFreeze(
    deepClone({
      rendering: {
        backend: "core-webgpu" as const,
        timestampQuery: value.rendering.timestampQuery,
        temporal,
        reflection,
      },
      gameplay: {
        maxAttachedBodies: MAX_ATTACHED_BODIES,
        maxQueryPointsPerTick: MAX_GAMEPLAY_QUERY_POINTS,
        maxActiveDisturbances: MAX_ACTIVE_DISTURBANCES,
        interactionField: {
          radiusMetres: 48 as const,
          edgeFadeMetres: 8 as const,
          maxSnapshotAgeTicks: 1 as const,
          disturbanceKinds: ["radial-impact" as const],
        },
      },
    }),
  );
}

export function coreManifestEvidence(core: QaBoundCoreManifestIdentity): {
  readonly hash: string;
  readonly identity: QaBoundCoreManifestIdentity;
} {
  const identity = readQaBoundCoreManifestIdentity(core);
  return Object.freeze({
    hash: identity.manifestHash,
    identity,
  });
}

export function readQaBoundCoreManifestIdentity(
  value: unknown,
): QaBoundCoreManifestIdentity {
  if (!isRecord(value) || !hasExactKeys(value, CORE_IDENTITY_KEYS)) {
    throw new TypeError(
      "Core evidence requires the actual Prewarm Manifest identity and declarations.",
    );
  }
  const qualityProfile = readQualityProfileIdentity(value.qualityProfile);
  const drawingBuffer = readDrawingBuffer(value.drawingBuffer);
  return freezeCoreIdentity(
    {
      schema: value.schema,
      version: value.version,
      id: value.id,
      manifestHash: value.manifestHash,
      qualityProfile,
      drawingBuffer,
      environmentReflection: value.environmentReflection,
      effectVariants: value.effectVariants,
      declarations: value.declarations,
    } as QaBoundCoreManifestIdentity,
    expectedCoreManifest({
      qualityProfile: {
        id: qualityProfile.id,
      },
      drawingBuffer,
    }),
  );
}

export function assertRegressionDrawingBuffersAgree(input: {
  readonly browserCanvas: RegressionDrawingBuffer;
  readonly coreDrawingBuffer: RegressionDrawingBuffer;
  readonly qaPrewarm: RegressionDrawingBuffer;
  readonly captures?: readonly RegressionDrawingBuffer[];
}): void {
  const expected = readDrawingBuffer(input.coreDrawingBuffer);
  assertSameDrawingBuffer(expected, input.browserCanvas, "browser canvas");
  assertSameDrawingBuffer(expected, input.qaPrewarm, "QA prewarm");
  for (const [index, capture] of (input.captures ?? []).entries()) {
    assertSameDrawingBuffer(expected, capture, `capture ${String(index)}`);
  }
}

export function assertNativeTemporalPolicy(
  temporal: QualityProfileTemporal,
): void {
  const expected = NATIVE_REGRESSION_TEMPORAL_POLICY;
  if (
    temporal.mode !== expected.mode ||
    temporal.renderScale !== expected.renderScale ||
    temporal.resolutionPolicy !== expected.resolutionPolicy ||
    temporal.taau !== expected.taau ||
    temporal.dynamicResolution !== expected.dynamicResolution ||
    temporal.frameGeneration !== expected.frameGeneration ||
    temporal.msaaSamples !== expected.msaaSamples ||
    temporal.updateCadence !== expected.updateCadence
  ) {
    throw new Error(
      "Core Quality Profile temporal policy is not the Native TRAA drawing-buffer-exact contract.",
    );
  }
}

function readQualityProfileIdentity(
  value: unknown,
): QaBoundCoreManifestIdentity["qualityProfile"] {
  if (!isRecord(value) || !hasExactKeys(value, QUALITY_PROFILE_KEYS)) {
    throw new TypeError(
      "Core evidence qualityProfile must include identity and temporal policy.",
    );
  }
  if (
    !isRecord(value.temporal) ||
    !hasExactKeys(value.temporal, TEMPORAL_KEYS)
  ) {
    throw new TypeError("Core evidence qualityProfile.temporal must be exact.");
  }
  assertSha256Digest(value.profileHash, "qualityProfile.profileHash");
  const temporal = value.temporal as unknown as QualityProfileTemporal;
  assertNativeTemporalPolicy(temporal);
  if (
    typeof value.schema !== "string" ||
    typeof value.version !== "number" ||
    typeof value.id !== "string"
  ) {
    throw new TypeError(
      "Core evidence qualityProfile schema/version/id must be exact.",
    );
  }
  return Object.freeze({
    schema: value.schema,
    version: value.version,
    id: value.id,
    profileHash: value.profileHash,
    temporal: Object.freeze({ ...temporal }),
  }) as QaBoundCoreManifestIdentity["qualityProfile"];
}

function readDrawingBuffer(value: unknown): PrewarmDrawingBuffer {
  if (!isRecord(value) || !hasExactKeys(value, DRAWING_BUFFER_KEYS)) {
    throw new TypeError("Core drawingBuffer must be { width, height }.");
  }
  const width = value.width;
  const height = value.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError(
      "Core drawingBuffer dimensions must be positive integers.",
    );
  }
  return Object.freeze({
    width,
    height,
  });
}

function freezeCoreIdentity(
  candidate: QaBoundCoreManifestIdentity,
  expected: PrewarmManifest,
): QaBoundCoreManifestIdentity {
  const normalized = readExactCandidate(candidate);
  const rebuilt = exactCoreIdentity(expected);
  if (canonicalJson(normalized) !== canonicalJson(rebuilt)) {
    throw new Error(
      "Core evidence disagrees with the rebuilt public Core Prewarm Manifest.",
    );
  }
  return deepFreeze(deepClone(normalized));
}

function readExactCandidate(
  candidate: QaBoundCoreManifestIdentity,
): QaBoundCoreManifestIdentity {
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    throw new TypeError("Core evidence id must be a non-empty string.");
  }
  assertSha256Digest(candidate.manifestHash, "manifestHash");
  if (
    !Array.isArray(candidate.declarations) ||
    candidate.declarations.length === 0
  ) {
    throw new TypeError(
      "Core evidence requires the actual Prewarm declarations.",
    );
  }
  const declarations = candidate.declarations.map((declaration, index) =>
    readDeclaration(declaration, index),
  );
  return {
    schema: candidate.schema,
    version: candidate.version,
    id: candidate.id,
    manifestHash: candidate.manifestHash,
    qualityProfile: candidate.qualityProfile,
    drawingBuffer: candidate.drawingBuffer,
    environmentReflection: candidate.environmentReflection,
    effectVariants: candidate.effectVariants,
    declarations,
  };
}

function exactCoreIdentity(
  expected: PrewarmManifest,
): QaBoundCoreManifestIdentity {
  return {
    schema: expected.schema,
    version: expected.version,
    id: expected.id,
    manifestHash: expected.manifestHash,
    qualityProfile: {
      schema: expected.qualityProfile.schema,
      version: expected.qualityProfile.version,
      id: expected.qualityProfile.id,
      profileHash: expected.qualityProfile.profileHash,
      temporal: { ...expected.qualityProfile.temporal },
    },
    drawingBuffer: { ...expected.drawingBuffer },
    environmentReflection: expected.environmentReflection,
    effectVariants: expected.effectVariants.map((variant) => ({ ...variant })),
    declarations: expected.declarations.map((declaration) => ({
      id: declaration.id,
      kind: declaration.kind,
      label: declaration.label,
      fingerprint: declaration.fingerprint,
    })),
  };
}

function readDeclaration(value: unknown, index: number): PrewarmDeclaration {
  if (!isRecord(value) || !hasExactKeys(value, DECLARATION_KEYS)) {
    throw new TypeError(
      `Core evidence declaration ${String(index)} must include id, kind, label, and fingerprint.`,
    );
  }
  if (
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    (value.kind !== "resource" &&
      value.kind !== "effect-state" &&
      value.kind !== "conditional-route")
  ) {
    throw new TypeError(
      `Core evidence declaration ${String(index)} id/kind/label must be exact.`,
    );
  }
  assertSha256Digest(
    value.fingerprint,
    `declarations[${String(index)}].fingerprint`,
  );
  return {
    id: value.id,
    kind: value.kind,
    label: value.label,
    fingerprint: value.fingerprint,
  };
}

function readCapabilitiesReflection(
  value: unknown,
  profileReflection: QualityProfile["reflection"],
  drawingBuffer: PrewarmDrawingBuffer,
): RealWaterCapabilities["rendering"]["reflection"] {
  if (!isRecord(value) || !hasExactKeys(value, REFLECTION_CAPABILITY_KEYS)) {
    throw new TypeError(
      "Ready capabilities.rendering.reflection must include environment, planar, and ssr.",
    );
  }
  if (
    !isRecord(value.environment) ||
    !hasExactKeys(value.environment, REFLECTION_ENVIRONMENT_KEYS) ||
    value.environment.source !== "host-adapter"
  ) {
    throw new TypeError(
      "Ready capabilities.rendering.reflection.environment.source must be host-adapter.",
    );
  }
  if (
    !isRecord(value.planar) ||
    !hasExactKeys(value.planar, REFLECTION_PLANAR_KEYS)
  ) {
    throw new TypeError(
      "Ready capabilities.rendering.reflection.planar must use the exact prepared target fields.",
    );
  }
  const width = value.planar.width;
  const height = value.planar.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError(
      "Ready capabilities.rendering.reflection.planar dimensions must be positive integers.",
    );
  }
  if (width !== drawingBuffer.width || height !== drawingBuffer.height) {
    throw new Error(
      "Ready capabilities.rendering.reflection.planar dimensions must match the Core drawing buffer.",
    );
  }
  if (
    value.planar.format !== profileReflection.planar.format ||
    value.planar.samples !== profileReflection.planar.samples ||
    value.environment.source !== profileReflection.environment.source
  ) {
    throw new Error(
      "Ready capabilities.rendering.reflection disagrees with the Quality Profile reflection layer.",
    );
  }
  if (value.planar.format !== "rgba8unorm-srgb" || value.planar.samples !== 0) {
    throw new Error(
      "Ready capabilities.rendering.reflection.planar is not the prepared RGBA8 sRGB samples-0 target.",
    );
  }
  const ssr = readCapabilitiesSsr(
    value.ssr,
    profileReflection.ssr,
    drawingBuffer,
  );
  return {
    environment: {
      source: "host-adapter",
    },
    planar: {
      width,
      height,
      format: "rgba8unorm-srgb",
      samples: 0,
    },
    ssr,
  };
}

function readCapabilitiesSsr(
  value: unknown,
  profileSsr: QualityProfile["reflection"]["ssr"],
  drawingBuffer: PrewarmDrawingBuffer,
): RealWaterCapabilities["rendering"]["reflection"]["ssr"] {
  if (!isRecord(value) || !hasExactKeys(value, REFLECTION_SSR_KEYS)) {
    throw new TypeError(
      "Ready capabilities.rendering.reflection.ssr must use the exact current-frame fields.",
    );
  }
  if (value.history === false || value.history === true) {
    throw new Error(
      "Ready capabilities.rendering.reflection.ssr.history must be the TemporalReproject policy.",
    );
  }
  const width = value.width;
  const height = value.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError(
      "Ready capabilities.rendering.reflection.ssr dimensions must be positive integers.",
    );
  }
  if (width !== drawingBuffer.width || height !== drawingBuffer.height) {
    throw new Error(
      "Ready capabilities.rendering.reflection.ssr dimensions must match the Core drawing buffer.",
    );
  }
  if (
    value.rawFormat !== profileSsr.rawFormat ||
    value.compositeFormat !== profileSsr.compositeFormat ||
    value.samples !== profileSsr.samples ||
    value.mode !== profileSsr.mode ||
    value.updateCadence !== profileSsr.updateCadence
  ) {
    throw new Error(
      "Ready capabilities.rendering.reflection.ssr disagrees with the Quality Profile reflection layer.",
    );
  }
  if (
    value.rawFormat !== "rgba16float" ||
    value.compositeFormat !== "rgba16float" ||
    value.samples !== 0 ||
    value.mode !== "current-frame" ||
    value.updateCadence !== "host-present"
  ) {
    throw new Error(
      "Ready capabilities.rendering.reflection.ssr is not the prepared current-frame RGBA16F samples-0 target.",
    );
  }
  if (
    !Array.isArray(value.missFallbackPriority) ||
    value.missFallbackPriority.length !== 2 ||
    value.missFallbackPriority[0] !== "planar" ||
    value.missFallbackPriority[1] !== "host-adapter"
  ) {
    throw new Error(
      "Ready capabilities.rendering.reflection.ssr.missFallbackPriority must be planar then host-adapter.",
    );
  }
  if (
    !isRecord(value.blur) ||
    !hasExactKeys(value.blur, REFLECTION_SSR_BLUR_KEYS)
  ) {
    throw new TypeError(
      "Ready capabilities.rendering.reflection.ssr.blur must use the exact current-frame fields.",
    );
  }
  const blurWidth = value.blur.width;
  const blurHeight = value.blur.height;
  if (
    typeof blurWidth !== "number" ||
    typeof blurHeight !== "number" ||
    !Number.isSafeInteger(blurWidth) ||
    !Number.isSafeInteger(blurHeight) ||
    blurWidth !== width ||
    blurHeight !== height
  ) {
    throw new RangeError(
      "Ready capabilities.rendering.reflection.ssr.blur dimensions must match the SSR drawing buffer.",
    );
  }
  if (
    value.blur.format !== "rgba16float" ||
    value.blur.mipCount !== 5 ||
    value.blur.blurQuality !== 2 ||
    value.blur.enabled !== true
  ) {
    throw new Error(
      "Ready capabilities.rendering.reflection.ssr.blur is not the prepared RGBA16F 5-mip quality-2 target.",
    );
  }
  const history = readCapabilitiesSsrHistory(
    value.history,
    profileSsr.history,
    width,
    height,
  );
  return {
    width,
    height,
    rawFormat: "rgba16float",
    compositeFormat: "rgba16float",
    samples: 0,
    mode: "current-frame",
    history,
    updateCadence: "host-present",
    missFallbackPriority: ["planar", "host-adapter"],
    blur: {
      width,
      height,
      format: "rgba16float",
      mipCount: 5,
      blurQuality: 2,
      enabled: true,
    },
  };
}

function readCapabilitiesSsrHistory(
  value: unknown,
  profileHistory: QualityProfile["reflection"]["ssr"]["history"],
  width: number,
  height: number,
): RealWaterCapabilities["rendering"]["reflection"]["ssr"]["history"] {
  if (!isRecord(value) || !hasExactKeys(value, REFLECTION_SSR_HISTORY_KEYS)) {
    throw new TypeError(
      "Ready capabilities.rendering.reflection.ssr.history must use the exact TemporalReproject fields.",
    );
  }
  if (
    value.width !== width ||
    value.height !== height ||
    value.historyFormat !== profileHistory.historyFormat ||
    value.resolveFormat !== profileHistory.resolveFormat ||
    value.inputFormat !== profileHistory.inputFormat ||
    value.captureFormat !== profileHistory.captureFormat ||
    value.resetVelocityFormat !== profileHistory.resetVelocityFormat ||
    value.maxFrames !== profileHistory.maxFrames ||
    value.mode !== profileHistory.mode ||
    value.accumulate !== profileHistory.accumulate ||
    value.hitPointReprojection !== profileHistory.hitPointReprojection ||
    value.normalFormat !== profileHistory.normalFormat ||
    value.updateCadence !== profileHistory.updateCadence
  ) {
    throw new Error(
      "Ready capabilities.rendering.reflection.ssr.history disagrees with the Quality Profile history policy.",
    );
  }
  if (
    !Array.isArray(value.resetDomains) ||
    value.resetDomains.length !== profileHistory.resetDomains.length
  ) {
    throw new Error(
      "Ready capabilities.rendering.reflection.ssr.history.resetDomains must match the shared Host reset domain.",
    );
  }
  for (let index = 0; index < profileHistory.resetDomains.length; index += 1) {
    if (value.resetDomains[index] !== profileHistory.resetDomains[index]) {
      throw new Error(
        "Ready capabilities.rendering.reflection.ssr.history.resetDomains must match the shared Host reset domain.",
      );
    }
  }
  return {
    width,
    height,
    historyFormat: "rgba16float",
    resolveFormat: "rgba16float",
    inputFormat: "rgba16float",
    captureFormat: "rgba16float",
    resetVelocityFormat: "rg16float",
    maxFrames: 32,
    mode: "temporal-reproject-specular",
    accumulate: true,
    hitPointReprojection: true,
    normalFormat: "packed-rgba16float",
    resetDomains: [
      "simulation-reset",
      "camera-cut",
      "origin-shift",
      "sea-state-cut",
      "waterline-crossing",
    ],
    updateCadence: "host-present",
  };
}

function readCapabilitiesTemporal(
  value: unknown,
  profileTemporal: QualityProfileTemporal,
): RenderingCapabilitiesTemporal {
  if (!isRecord(value) || !hasExactKeys(value, CAPABILITIES_TEMPORAL_KEYS)) {
    throw new TypeError(
      "Ready capabilities.rendering.temporal must include the lease temporal fields.",
    );
  }
  assertNativeTemporalPolicy(profileTemporal);
  if (
    value.mode !== profileTemporal.mode ||
    value.renderScale !== profileTemporal.renderScale ||
    value.resolutionPolicy !== profileTemporal.resolutionPolicy ||
    value.taau !== profileTemporal.taau ||
    value.dynamicResolution !== profileTemporal.dynamicResolution ||
    value.frameGeneration !== profileTemporal.frameGeneration ||
    value.msaaSamples !== profileTemporal.msaaSamples ||
    value.updateCadence !== profileTemporal.updateCadence
  ) {
    throw new Error(
      "Ready capabilities.rendering.temporal disagrees with the Quality Profile temporal fields.",
    );
  }
  if (value.motionFormat !== "rg16float") {
    throw new Error(
      "Ready capabilities.rendering.temporal.motionFormat is not the Core rg16float lease value.",
    );
  }
  if (value.stockThreeRevision !== "185") {
    throw new Error(
      "Ready capabilities.rendering.temporal.stockThreeRevision is not the Core r185 lease value.",
    );
  }
  return {
    mode: "TRAA",
    renderScale: 1,
    resolutionPolicy: "drawing-buffer-exact",
    taau: false,
    dynamicResolution: false,
    frameGeneration: false,
    msaaSamples: 0,
    updateCadence: "host-present",
    motionFormat: "rg16float",
    stockThreeRevision: "185",
  };
}

function expectedCoreManifest(source: {
  readonly qualityProfile: {
    readonly id: PrewarmManifest["qualityProfile"]["id"];
  };
  readonly drawingBuffer: PrewarmDrawingBuffer;
}): PrewarmManifest {
  return createMinimalWaterPrewarmManifest(
    createMinimalWaterQualityProfile(source.qualityProfile.id),
    source.drawingBuffer,
  );
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

function assertSameDrawingBuffer(
  expected: RegressionDrawingBuffer,
  actual: RegressionDrawingBuffer,
  label: string,
): void {
  const read = readDrawingBuffer(actual);
  if (read.width !== expected.width || read.height !== expected.height) {
    throw new Error(
      `${label} drawing buffer ${String(read.width)}x${String(read.height)} disagrees with Core ${String(expected.width)}x${String(expected.height)}.`,
    );
  }
}

function assertSha256Digest(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !SHA_256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a sha256:<64 hex> digest.`);
  }
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
