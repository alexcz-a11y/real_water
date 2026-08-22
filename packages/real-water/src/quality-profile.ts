import { hasExactKeys, isRecord } from "./internal/record-validation.js";

/**
 * The discriminator for supported Quality Profiles.
 *
 * @public
 */
export const QUALITY_PROFILE_SCHEMA = "real-water/quality-profile" as const;

/**
 * The only Quality Profile version accepted by this release.
 *
 * @public
 */
export const QUALITY_PROFILE_VERSION = 6 as const;

/**
 * Built-in structural configurations for the minimal-water surface.
 *
 * @public
 */
export type MinimalWaterQualityProfileId = "minimal" | "minimal-high-detail";

/**
 * The immutable segment layout used to allocate the minimal-water plane.
 *
 * @public
 */
export interface MinimalWaterGeometrySegments {
  readonly widthSegments: number;
  readonly heightSegments: number;
}

/**
 * Structural configuration of the prepared water surface.
 *
 * @public
 */
export interface QualityProfileSurface {
  readonly geometry: MinimalWaterGeometrySegments;
}

/**
 * Native temporal policy pinned by every supported Quality Profile.
 *
 * @public
 */
export interface QualityProfileTemporal {
  readonly mode: "TRAA";
  readonly renderScale: 1;
  readonly resolutionPolicy: "drawing-buffer-exact";
  readonly taau: false;
  readonly dynamicResolution: false;
  readonly frameGeneration: false;
  readonly msaaSamples: 0;
  readonly updateCadence: "host-present";
}

/**
 * Dedicated specular TemporalReproject history policy. Compile-and-prepare
 * constants, not live knobs. Reset shares the Host presentation domain with
 * TRAA; there is no request-level reset.
 *
 * @public
 */
export interface QualityProfileReflectionSsrHistory {
  readonly mode: "temporal-reproject-specular";
  readonly accumulate: true;
  readonly hitPointReprojection: true;
  readonly maxFrames: 32;
  readonly historyFormat: "rgba16float";
  readonly resolveFormat: "rgba16float";
  readonly inputFormat: "rgba16float";
  readonly captureFormat: "rgba16float";
  readonly resetVelocityFormat: "rg16float";
  readonly normalFormat: "packed-rgba16float";
  readonly resetDomains: readonly [
    "simulation-reset",
    "camera-cut",
    "origin-shift",
    "sea-state-cut",
    "waterline-crossing",
  ];
  readonly updateCadence: "host-present";
}

/**
 * Current-frame SSR structural policy plus dedicated TemporalReproject
 * history. Raw and blur stay current-frame spatial. These values are
 * compile-and-prepare constants, not live knobs.
 *
 * @public
 */
export interface QualityProfileReflectionSsr {
  readonly mode: "current-frame";
  readonly history: QualityProfileReflectionSsrHistory;
  readonly updateCadence: "host-present";
  readonly stochastic: false;
  readonly reflectNonMetals: false;
  readonly binaryRefine: true;
  readonly quality: 0.5;
  readonly maxDistance: 48;
  readonly thickness: 0.35;
  readonly resolutionPolicy: "drawing-buffer-exact";
  readonly resolutionScale: 1;
  readonly samples: 0;
  readonly rawFormat: "rgba16float";
  readonly compositeFormat: "rgba16float";
  readonly blurFormat: "rgba16float";
  readonly blurResolutionPolicy: "drawing-buffer-exact";
  readonly mipCount: 5;
  readonly blurQuality: 2;
  readonly blurRoute: "enabled";
  readonly screenEdgeFade: 0.08;
  readonly roughnessCutoff: 0.5;
}

/**
 * Implemented reflection layers for this release: Host environment, a
 * fixed-size horizontal planar pass, current-frame SSR, and dedicated
 * specular TemporalReproject history.
 *
 * @public
 */
export interface QualityProfileReflection {
  readonly environment: {
    readonly source: "host-adapter";
  };
  readonly planar: {
    readonly resolutionPolicy: "drawing-buffer-exact";
    readonly format: "rgba8unorm-srgb";
    readonly samples: 0;
  };
  readonly ssr: QualityProfileReflectionSsr;
}

/**
 * A closed, versioned structural configuration prepared by the Readiness Gate.
 *
 * @public
 */
export interface QualityProfile {
  readonly schema: typeof QUALITY_PROFILE_SCHEMA;
  readonly version: typeof QUALITY_PROFILE_VERSION;
  readonly id: MinimalWaterQualityProfileId;
  readonly profileHash: string;
  readonly surface: QualityProfileSurface;
  readonly temporal: QualityProfileTemporal;
  readonly reflection: QualityProfileReflection;
}

/**
 * The immutable Quality Profile identity attached to a prepared manifest.
 *
 * @public
 */
export interface QualityProfileIdentity {
  readonly schema: typeof QUALITY_PROFILE_SCHEMA;
  readonly version: typeof QUALITY_PROFILE_VERSION;
  readonly id: MinimalWaterQualityProfileId;
  readonly profileHash: string;
}

interface SupportedQualityProfile {
  readonly profileHash: string;
  readonly widthSegments: number;
  readonly heightSegments: number;
}

export const CURRENT_FRAME_SSR_HISTORY_POLICY: QualityProfileReflectionSsrHistory =
  Object.freeze({
    mode: "temporal-reproject-specular",
    accumulate: true,
    hitPointReprojection: true,
    maxFrames: 32,
    historyFormat: "rgba16float",
    resolveFormat: "rgba16float",
    inputFormat: "rgba16float",
    captureFormat: "rgba16float",
    resetVelocityFormat: "rg16float",
    normalFormat: "packed-rgba16float",
    resetDomains: Object.freeze([
      "simulation-reset",
      "camera-cut",
      "origin-shift",
      "sea-state-cut",
      "waterline-crossing",
    ] as const),
    updateCadence: "host-present",
  });

export const CURRENT_FRAME_SSR_POLICY: QualityProfileReflectionSsr =
  Object.freeze({
    mode: "current-frame",
    history: CURRENT_FRAME_SSR_HISTORY_POLICY,
    updateCadence: "host-present",
    stochastic: false,
    reflectNonMetals: false,
    binaryRefine: true,
    quality: 0.5,
    maxDistance: 48,
    thickness: 0.35,
    resolutionPolicy: "drawing-buffer-exact",
    resolutionScale: 1,
    samples: 0,
    rawFormat: "rgba16float",
    compositeFormat: "rgba16float",
    blurFormat: "rgba16float",
    blurResolutionPolicy: "drawing-buffer-exact",
    mipCount: 5,
    blurQuality: 2,
    blurRoute: "enabled",
    screenEdgeFade: 0.08,
    roughnessCutoff: 0.5,
  });

// Each static hash is the SHA-256 digest of the profile's canonical JSON,
// excluding profileHash and preserving the public field order:
// schema, version, id, surface, temporal, reflection.
const NATIVE_TEMPORAL: QualityProfileTemporal = Object.freeze({
  mode: "TRAA",
  renderScale: 1,
  resolutionPolicy: "drawing-buffer-exact",
  taau: false,
  dynamicResolution: false,
  frameGeneration: false,
  msaaSamples: 0,
  updateCadence: "host-present",
});
const NATIVE_REFLECTION: QualityProfileReflection = Object.freeze({
  environment: Object.freeze({
    source: "host-adapter" as const,
  }),
  planar: Object.freeze({
    resolutionPolicy: "drawing-buffer-exact" as const,
    format: "rgba8unorm-srgb" as const,
    samples: 0 as const,
  }),
  ssr: CURRENT_FRAME_SSR_POLICY,
});
const SUPPORTED_QUALITY_PROFILES: Readonly<
  Record<MinimalWaterQualityProfileId, SupportedQualityProfile>
> = Object.freeze({
  "minimal": Object.freeze({
    profileHash:
      "sha256:e09b96aea95dcf7f52f3220a07ec83a90f29f59c978814b5e107f86098e892c2",
    widthSegments: 128,
    heightSegments: 128,
  }),
  "minimal-high-detail": Object.freeze({
    profileHash:
      "sha256:cb9323969633c4f8a5d6e44dfe9baf84bd3b61923dbc884e65f704e4d7e3b772",
    widthSegments: 256,
    heightSegments: 256,
  }),
});

const QUALITY_PROFILE_KEYS = [
  "schema",
  "version",
  "id",
  "profileHash",
  "surface",
  "temporal",
  "reflection",
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
const REFLECTION_KEYS = ["environment", "planar", "ssr"] as const;
const SSR_KEYS = [
  "mode",
  "history",
  "updateCadence",
  "stochastic",
  "reflectNonMetals",
  "binaryRefine",
  "quality",
  "maxDistance",
  "thickness",
  "resolutionPolicy",
  "resolutionScale",
  "samples",
  "rawFormat",
  "compositeFormat",
  "blurFormat",
  "blurResolutionPolicy",
  "mipCount",
  "blurQuality",
  "blurRoute",
  "screenEdgeFade",
  "roughnessCutoff",
] as const;
const SSR_HISTORY_KEYS = [
  "mode",
  "accumulate",
  "hitPointReprojection",
  "maxFrames",
  "historyFormat",
  "resolveFormat",
  "inputFormat",
  "captureFormat",
  "resetVelocityFormat",
  "normalFormat",
  "resetDomains",
  "updateCadence",
] as const;

/**
 * Returns a supported minimal-water Quality Profile.
 *
 * @public
 */
export function createMinimalWaterQualityProfile(
  id: MinimalWaterQualityProfileId = "minimal",
): QualityProfile {
  if (!isSupportedProfileId(id)) {
    throw new RangeError(`Unsupported minimal-water Quality Profile: ${id}`);
  }

  const supported: SupportedQualityProfile | undefined =
    SUPPORTED_QUALITY_PROFILES[id];
  if (supported === undefined) {
    throw new RangeError(`Unsupported minimal-water Quality Profile: ${id}`);
  }

  return freezeQualityProfile({
    schema: QUALITY_PROFILE_SCHEMA,
    version: QUALITY_PROFILE_VERSION,
    id,
    profileHash: supported.profileHash,
    surface: {
      geometry: {
        widthSegments: supported.widthSegments,
        heightSegments: supported.heightSegments,
      },
    },
    temporal: NATIVE_TEMPORAL,
    reflection: NATIVE_REFLECTION,
  });
}

/**
 * Validates and freezes a supported Quality Profile.
 */
export function normalizeQualityProfile(
  candidate: QualityProfile,
): QualityProfile {
  const value: unknown = candidate;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, QUALITY_PROFILE_KEYS) ||
    !isSupportedProfileId(value.id)
  ) {
    throw new TypeError("The Quality Profile is not supported.");
  }

  const supported = createMinimalWaterQualityProfile(value.id);
  if (
    value.schema !== supported.schema ||
    value.version !== supported.version ||
    value.profileHash !== supported.profileHash ||
    !isRecord(value.surface) ||
    !hasExactKeys(value.surface, ["geometry"]) ||
    !isRecord(value.surface.geometry) ||
    !hasExactKeys(value.surface.geometry, [
      "widthSegments",
      "heightSegments",
    ]) ||
    value.surface.geometry.widthSegments !==
      supported.surface.geometry.widthSegments ||
    value.surface.geometry.heightSegments !==
      supported.surface.geometry.heightSegments ||
    !isRecord(value.temporal) ||
    !hasExactKeys(value.temporal, TEMPORAL_KEYS) ||
    value.temporal.mode !== supported.temporal.mode ||
    value.temporal.renderScale !== supported.temporal.renderScale ||
    value.temporal.resolutionPolicy !== supported.temporal.resolutionPolicy ||
    value.temporal.taau !== supported.temporal.taau ||
    value.temporal.dynamicResolution !== supported.temporal.dynamicResolution ||
    value.temporal.frameGeneration !== supported.temporal.frameGeneration ||
    value.temporal.msaaSamples !== supported.temporal.msaaSamples ||
    value.temporal.updateCadence !== supported.temporal.updateCadence ||
    !isRecord(value.reflection) ||
    !hasExactKeys(value.reflection, REFLECTION_KEYS) ||
    !isRecord(value.reflection.environment) ||
    !hasExactKeys(value.reflection.environment, ["source"]) ||
    value.reflection.environment.source !==
      supported.reflection.environment.source ||
    !isRecord(value.reflection.planar) ||
    !hasExactKeys(value.reflection.planar, [
      "resolutionPolicy",
      "format",
      "samples",
    ]) ||
    value.reflection.planar.resolutionPolicy !==
      supported.reflection.planar.resolutionPolicy ||
    value.reflection.planar.format !== supported.reflection.planar.format ||
    value.reflection.planar.samples !== supported.reflection.planar.samples ||
    !isSupportedSsrPolicy(value.reflection.ssr, supported.reflection.ssr)
  ) {
    throw new TypeError(
      "The Quality Profile does not match a supported structural configuration.",
    );
  }

  return supported;
}

/**
 * Returns the immutable identity of a normalized Quality Profile.
 */
export function qualityProfileIdentity(
  profile: QualityProfile,
): QualityProfileIdentity {
  const normalized = normalizeQualityProfile(profile);
  return Object.freeze({
    schema: normalized.schema,
    version: normalized.version,
    id: normalized.id,
    profileHash: normalized.profileHash,
  });
}

/**
 * Returns the immutable plane segment layout selected by a Quality Profile.
 */
export function getMinimalWaterGeometrySegments(
  profile: QualityProfile,
): MinimalWaterGeometrySegments {
  return normalizeQualityProfile(profile).surface.geometry;
}

function isSupportedSsrHistory(
  value: unknown,
  supported: QualityProfileReflectionSsrHistory,
): boolean {
  if (!isRecord(value) || !hasExactKeys(value, SSR_HISTORY_KEYS)) {
    return false;
  }
  if (
    !Array.isArray(value.resetDomains) ||
    value.resetDomains.length !== supported.resetDomains.length
  ) {
    return false;
  }
  for (let index = 0; index < supported.resetDomains.length; index += 1) {
    if (value.resetDomains[index] !== supported.resetDomains[index]) {
      return false;
    }
  }
  return (
    value.mode === supported.mode &&
    value.accumulate === supported.accumulate &&
    value.hitPointReprojection === supported.hitPointReprojection &&
    value.maxFrames === supported.maxFrames &&
    value.historyFormat === supported.historyFormat &&
    value.resolveFormat === supported.resolveFormat &&
    value.inputFormat === supported.inputFormat &&
    value.captureFormat === supported.captureFormat &&
    value.resetVelocityFormat === supported.resetVelocityFormat &&
    value.normalFormat === supported.normalFormat &&
    value.updateCadence === supported.updateCadence
  );
}

function isSupportedSsrPolicy(
  value: unknown,
  supported: QualityProfileReflectionSsr,
): boolean {
  if (!isRecord(value) || !hasExactKeys(value, SSR_KEYS)) {
    return false;
  }
  return (
    value.mode === supported.mode &&
    isSupportedSsrHistory(value.history, supported.history) &&
    value.updateCadence === supported.updateCadence &&
    value.stochastic === supported.stochastic &&
    value.reflectNonMetals === supported.reflectNonMetals &&
    value.binaryRefine === supported.binaryRefine &&
    value.quality === supported.quality &&
    value.maxDistance === supported.maxDistance &&
    value.thickness === supported.thickness &&
    value.resolutionPolicy === supported.resolutionPolicy &&
    value.resolutionScale === supported.resolutionScale &&
    value.samples === supported.samples &&
    value.rawFormat === supported.rawFormat &&
    value.compositeFormat === supported.compositeFormat &&
    value.blurFormat === supported.blurFormat &&
    value.blurResolutionPolicy === supported.blurResolutionPolicy &&
    value.mipCount === supported.mipCount &&
    value.blurQuality === supported.blurQuality &&
    value.blurRoute === supported.blurRoute &&
    value.screenEdgeFade === supported.screenEdgeFade &&
    value.roughnessCutoff === supported.roughnessCutoff
  );
}

function freezeQualityProfile(profile: QualityProfile): QualityProfile {
  return Object.freeze({
    ...profile,
    surface: Object.freeze({
      ...profile.surface,
      geometry: Object.freeze({ ...profile.surface.geometry }),
    }),
    temporal: Object.freeze({ ...profile.temporal }),
    reflection: Object.freeze({
      environment: Object.freeze({ ...profile.reflection.environment }),
      planar: Object.freeze({ ...profile.reflection.planar }),
      ssr: Object.freeze({
        ...profile.reflection.ssr,
        history: Object.freeze({
          ...profile.reflection.ssr.history,
          resetDomains: Object.freeze([
            "simulation-reset",
            "camera-cut",
            "origin-shift",
            "sea-state-cut",
            "waterline-crossing",
          ] as const),
        }),
      }),
    }),
  });
}

function isSupportedProfileId(
  value: unknown,
): value is MinimalWaterQualityProfileId {
  return value === "minimal" || value === "minimal-high-detail";
}
