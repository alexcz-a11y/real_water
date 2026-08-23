import { hasExactKeys, isRecord } from "./internal/record-validation.js";
import {
  INTERACTION_FIELD_EDGE_FADE_METRES,
  INTERACTION_FIELD_RADIUS_METRES,
  MAX_ATTACHED_BODIES,
  MAX_ACTIVE_DISTURBANCES,
} from "./capabilities.js";
import {
  MAX_BODY_INTERACTION_SOCKETS,
  MAX_COMPOUND_INTERACTION_SHAPE_CHILDREN,
  MAX_CONVEX_HULL_VERTICES,
} from "./body-physics.js";

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
export const QUALITY_PROFILE_VERSION = 7 as const;

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
 * Fixed local interaction field and bounded Disturbance layout.
 *
 * @public
 */
export interface QualityProfileInteractionField {
  readonly radiusMetres: 48;
  readonly edgeFadeMetres: 8;
  readonly maxActiveDisturbances: 128;
  readonly snapshotBanks: 2;
  readonly maxSnapshotAgeTicks: 1;
  readonly radialImpactRoute: "analytic-uniform-array";
  readonly directionalWakeRoute: "analytic-uniform-array";
}

/**
 * Structural policy for the one prepared Interaction Anchor.
 *
 * @public
 */
export interface QualityProfileInteraction {
  readonly anchorCount: 1;
  readonly field: QualityProfileInteractionField;
}

/**
 * Bounded structural policy for fixed-step Body coupling and authored sockets.
 * Per-Body Interaction Shapes and socket poses remain runtime attachment data.
 *
 * @public
 */
export interface QualityProfileBodyCoupling {
  readonly fixedTickHz: 60;
  readonly maxAttachedBodies: 32;
  readonly maxShapeSamplesPerBody: 32;
  readonly maxConvexHullVertices: 64;
  readonly maxSocketsPerBody: 8;
  readonly socketRoute: "stable-slot-upsert";
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
  readonly interaction: QualityProfileInteraction;
  readonly bodyCoupling: QualityProfileBodyCoupling;
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
// schema, version, id, surface, interaction, bodyCoupling, temporal,
// reflection.
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
      "sha256:1c11f4a6ae5099ee4ffe2610edc4c57fc546975fdb05a3a55ad4b662991db6a4",
    widthSegments: 128,
    heightSegments: 128,
  }),
  "minimal-high-detail": Object.freeze({
    profileHash:
      "sha256:98911284133f9b9be6f93548f7726657c9f5164d4e241c08bab0ac440c04e67a",
    widthSegments: 256,
    heightSegments: 256,
  }),
});

// Version 1 was committed with two different geometry layouts before the
// schema acquired temporal and reflection policies. Both exact payloads remain
// recoverable; their hashes are not aliases for partially matching data.
const LEGACY_V1_QUALITY_PROFILES: readonly Readonly<
  Record<MinimalWaterQualityProfileId, SupportedQualityProfile>
>[] = Object.freeze([
  Object.freeze({
    "minimal": Object.freeze({
      profileHash:
        "sha256:869ac714e56e70d4ffb37b75ff85432accba3caa2feb62946dc341eca66735ec",
      widthSegments: 1,
      heightSegments: 1,
    }),
    "minimal-high-detail": Object.freeze({
      profileHash:
        "sha256:e76e54fc9cb01a477c3006634c5a1cf99bd96e605c6355ed2859241bcd2e6201",
      widthSegments: 2,
      heightSegments: 2,
    }),
  }),
  Object.freeze({
    "minimal": Object.freeze({
      profileHash:
        "sha256:10dcb2e1e7b9e4cf47a49e6805329fd9a9906c198537934603b65a219c4f1f86",
      widthSegments: 128,
      heightSegments: 128,
    }),
    "minimal-high-detail": Object.freeze({
      profileHash:
        "sha256:a528f78e921767962db0afcf519aed7dbfed894e54284fcb7b2c7d21e93e1d0b",
      widthSegments: 256,
      heightSegments: 256,
    }),
  }),
]);
const LEGACY_V2_QUALITY_PROFILES: Readonly<
  Record<MinimalWaterQualityProfileId, SupportedQualityProfile>
> = Object.freeze({
  "minimal": Object.freeze({
    profileHash:
      "sha256:647ceaf12d769ddc4a95414593ca23131f3ec9a516a32341517609d4788cbc73",
    widthSegments: 128,
    heightSegments: 128,
  }),
  "minimal-high-detail": Object.freeze({
    profileHash:
      "sha256:975a61a72c43c660866970618ee747db41fab60cd54d6cce6654edd7376b8ba3",
    widthSegments: 256,
    heightSegments: 256,
  }),
});
// The version 5 hashes below are the digests committed before the interaction
// field existed, so they cover the version 5 field order: schema, version, id,
// surface, temporal, reflection.
const LEGACY_V5_QUALITY_PROFILES: Readonly<
  Record<MinimalWaterQualityProfileId, SupportedQualityProfile>
> = Object.freeze({
  "minimal": Object.freeze({
    profileHash:
      "sha256:9a75bfe19d0e81f51ee19908ce547b5a7abd49ab01dbe00feb234e3c95d23ec0",
    widthSegments: 128,
    heightSegments: 128,
  }),
  "minimal-high-detail": Object.freeze({
    profileHash:
      "sha256:04b1d29617d1d2dd50f9d0f5b4f5dcd6ab6012cde62ae7e36ab0bba7be3061d8",
    widthSegments: 256,
    heightSegments: 256,
  }),
});

// Version 6 introduced the local interaction field. These are the exact
// built-in digests committed before directional wake and Body coupling policy
// became structural Quality Profile data.
const LEGACY_V6_QUALITY_PROFILES: Readonly<
  Record<MinimalWaterQualityProfileId, SupportedQualityProfile>
> = Object.freeze({
  "minimal": Object.freeze({
    profileHash:
      "sha256:c60b0a30fa310fbc1f21270c413a35b5b6265d6f157e5f41233be4b8042d8ec5",
    widthSegments: 128,
    heightSegments: 128,
  }),
  "minimal-high-detail": Object.freeze({
    profileHash:
      "sha256:4cba756cba61d7f4e071605c4d6939c1ba76b2cab0ef500bcf5ed1be7404d7f4",
    widthSegments: 256,
    heightSegments: 256,
  }),
});

const LEGACY_PRE_RESET_V5_QUALITY_PROFILES: Readonly<
  Record<MinimalWaterQualityProfileId, SupportedQualityProfile>
> = Object.freeze({
  "minimal": Object.freeze({
    profileHash:
      "sha256:3ec933fa8238e5bfd50608dc451d8354374c8337e49c793f191a3ad86cdf67b2",
    widthSegments: 128,
    heightSegments: 128,
  }),
  "minimal-high-detail": Object.freeze({
    profileHash:
      "sha256:d61edd12017f4b8adfe9878fa2c116fd9831b1681ce8b52c5e474e012ad94886",
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
  "interaction",
  "bodyCoupling",
  "temporal",
  "reflection",
] as const;
const INTERACTION_KEYS = ["anchorCount", "field"] as const;
const INTERACTION_FIELD_KEYS = [
  "radiusMetres",
  "edgeFadeMetres",
  "maxActiveDisturbances",
  "snapshotBanks",
  "maxSnapshotAgeTicks",
  "radialImpactRoute",
  "directionalWakeRoute",
] as const;
const BODY_COUPLING_KEYS = [
  "fixedTickHz",
  "maxAttachedBodies",
  "maxShapeSamplesPerBody",
  "maxConvexHullVertices",
  "maxSocketsPerBody",
  "socketRoute",
] as const;
const LEGACY_V1_QUALITY_PROFILE_KEYS = [
  "schema",
  "version",
  "id",
  "profileHash",
  "surface",
] as const;
const LEGACY_V2_QUALITY_PROFILE_KEYS = [
  ...LEGACY_V1_QUALITY_PROFILE_KEYS,
  "temporal",
] as const;
const LEGACY_V2_TEMPORAL_KEYS = [
  "mode",
  "renderScale",
  "resolutionPolicy",
  "taau",
  "dynamicResolution",
  "frameGeneration",
  "msaaSamples",
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
const LEGACY_V5_QUALITY_PROFILE_KEYS = QUALITY_PROFILE_KEYS.filter(
  (key) => key !== "interaction" && key !== "bodyCoupling",
);
const LEGACY_V6_QUALITY_PROFILE_KEYS = QUALITY_PROFILE_KEYS.filter(
  (key) => key !== "bodyCoupling",
);
const LEGACY_V6_INTERACTION_FIELD_KEYS = INTERACTION_FIELD_KEYS.filter(
  (key) => key !== "directionalWakeRoute",
);
const LEGACY_PRE_RESET_SSR_HISTORY_KEYS = SSR_HISTORY_KEYS.filter(
  (key) => key !== "resetVelocityFormat",
);

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
    interaction: {
      anchorCount: 1,
      field: {
        radiusMetres: INTERACTION_FIELD_RADIUS_METRES,
        edgeFadeMetres: INTERACTION_FIELD_EDGE_FADE_METRES,
        maxActiveDisturbances: MAX_ACTIVE_DISTURBANCES,
        snapshotBanks: 2,
        maxSnapshotAgeTicks: 1,
        radialImpactRoute: "analytic-uniform-array",
        directionalWakeRoute: "analytic-uniform-array",
      },
    },
    bodyCoupling: {
      fixedTickHz: 60,
      maxAttachedBodies: MAX_ATTACHED_BODIES,
      maxShapeSamplesPerBody: MAX_COMPOUND_INTERACTION_SHAPE_CHILDREN,
      maxConvexHullVertices: MAX_CONVEX_HULL_VERTICES,
      maxSocketsPerBody: MAX_BODY_INTERACTION_SOCKETS,
      socketRoute: "stable-slot-upsert",
    },
    temporal: NATIVE_TEMPORAL,
    reflection: NATIVE_REFLECTION,
  });
}

/**
 * Validates and freezes a supported Quality Profile.
 *
 * @public
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
    !isRecord(value.interaction) ||
    !hasExactKeys(value.interaction, INTERACTION_KEYS) ||
    value.interaction.anchorCount !== supported.interaction.anchorCount ||
    !isRecord(value.interaction.field) ||
    !hasExactKeys(value.interaction.field, INTERACTION_FIELD_KEYS) ||
    value.interaction.field.radiusMetres !==
      supported.interaction.field.radiusMetres ||
    value.interaction.field.edgeFadeMetres !==
      supported.interaction.field.edgeFadeMetres ||
    value.interaction.field.maxActiveDisturbances !==
      supported.interaction.field.maxActiveDisturbances ||
    value.interaction.field.snapshotBanks !==
      supported.interaction.field.snapshotBanks ||
    value.interaction.field.maxSnapshotAgeTicks !==
      supported.interaction.field.maxSnapshotAgeTicks ||
    value.interaction.field.radialImpactRoute !==
      supported.interaction.field.radialImpactRoute ||
    value.interaction.field.directionalWakeRoute !==
      supported.interaction.field.directionalWakeRoute ||
    !isRecord(value.bodyCoupling) ||
    !hasExactKeys(value.bodyCoupling, BODY_COUPLING_KEYS) ||
    value.bodyCoupling.fixedTickHz !== supported.bodyCoupling.fixedTickHz ||
    value.bodyCoupling.maxAttachedBodies !==
      supported.bodyCoupling.maxAttachedBodies ||
    value.bodyCoupling.maxShapeSamplesPerBody !==
      supported.bodyCoupling.maxShapeSamplesPerBody ||
    value.bodyCoupling.maxConvexHullVertices !==
      supported.bodyCoupling.maxConvexHullVertices ||
    value.bodyCoupling.maxSocketsPerBody !==
      supported.bodyCoupling.maxSocketsPerBody ||
    value.bodyCoupling.socketRoute !== supported.bodyCoupling.socketRoute ||
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
 * Migrates a previously committed Quality Profile into the current schema.
 *
 * @public
 */
export function migrateQualityProfile(candidate: unknown): QualityProfile {
  if (isRecord(candidate) && candidate.version === QUALITY_PROFILE_VERSION) {
    try {
      return normalizeQualityProfile(candidate as unknown as QualityProfile);
    } catch {
      throw new TypeError("The Quality Profile cannot be migrated.");
    }
  }

  if (
    isRecord(candidate) &&
    candidate.version === 6 &&
    isSupportedProfileId(candidate.id) &&
    matchesLegacyV6Profile(candidate, candidate.id)
  ) {
    return createMinimalWaterQualityProfile(candidate.id);
  }

  if (
    isRecord(candidate) &&
    candidate.version === 5 &&
    isSupportedProfileId(candidate.id) &&
    (matchesLegacyV5Profile(candidate, candidate.id) ||
      matchesLegacyPreResetV5Profile(candidate, candidate.id))
  ) {
    return createMinimalWaterQualityProfile(candidate.id);
  }

  if (
    isRecord(candidate) &&
    hasExactKeys(candidate, LEGACY_V1_QUALITY_PROFILE_KEYS) &&
    candidate.schema === QUALITY_PROFILE_SCHEMA &&
    candidate.version === 1 &&
    isSupportedProfileId(candidate.id) &&
    matchesLegacyV1Profile(candidate, candidate.id)
  ) {
    return createMinimalWaterQualityProfile(candidate.id);
  }

  if (
    isRecord(candidate) &&
    hasExactKeys(candidate, LEGACY_V2_QUALITY_PROFILE_KEYS) &&
    candidate.schema === QUALITY_PROFILE_SCHEMA &&
    candidate.version === 2 &&
    isSupportedProfileId(candidate.id) &&
    matchesLegacySurface(candidate, LEGACY_V2_QUALITY_PROFILES[candidate.id]) &&
    matchesLegacyV2Temporal(candidate.temporal)
  ) {
    return createMinimalWaterQualityProfile(candidate.id);
  }

  throw new TypeError("The Quality Profile cannot be migrated.");
}

/**
 * Returns the immutable identity of a normalized Quality Profile.
 *
 * @public
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

function matchesLegacySurface(
  value: Record<string, unknown>,
  supported: SupportedQualityProfile,
): boolean {
  return (
    value.profileHash === supported.profileHash &&
    isRecord(value.surface) &&
    hasExactKeys(value.surface, ["geometry"]) &&
    isRecord(value.surface.geometry) &&
    hasExactKeys(value.surface.geometry, ["widthSegments", "heightSegments"]) &&
    value.surface.geometry.widthSegments === supported.widthSegments &&
    value.surface.geometry.heightSegments === supported.heightSegments
  );
}

function matchesLegacyV1Profile(
  value: Record<string, unknown>,
  id: MinimalWaterQualityProfileId,
): boolean {
  return LEGACY_V1_QUALITY_PROFILES.some((variant) =>
    matchesLegacySurface(value, variant[id]),
  );
}

function matchesLegacyV2Temporal(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, LEGACY_V2_TEMPORAL_KEYS) &&
    value.mode === "TRAA" &&
    value.renderScale === 1 &&
    value.resolutionPolicy === "drawing-buffer-exact" &&
    value.taau === false &&
    value.dynamicResolution === false &&
    value.frameGeneration === false &&
    value.msaaSamples === 0
  );
}

function matchesLegacyV5Profile(
  value: Record<string, unknown>,
  id: MinimalWaterQualityProfileId,
): boolean {
  return (
    hasExactKeys(value, LEGACY_V5_QUALITY_PROFILE_KEYS) &&
    value.schema === QUALITY_PROFILE_SCHEMA &&
    matchesLegacySurface(value, LEGACY_V5_QUALITY_PROFILES[id]) &&
    matchesCurrentTemporal(value.temporal) &&
    matchesCurrentReflection(value.reflection)
  );
}

function matchesLegacyV6Profile(
  value: Record<string, unknown>,
  id: MinimalWaterQualityProfileId,
): boolean {
  return (
    hasExactKeys(value, LEGACY_V6_QUALITY_PROFILE_KEYS) &&
    value.schema === QUALITY_PROFILE_SCHEMA &&
    matchesLegacySurface(value, LEGACY_V6_QUALITY_PROFILES[id]) &&
    matchesLegacyV6Interaction(value.interaction) &&
    matchesCurrentTemporal(value.temporal) &&
    matchesCurrentReflection(value.reflection)
  );
}

function matchesLegacyV6Interaction(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, INTERACTION_KEYS) &&
    value.anchorCount === 1 &&
    isRecord(value.field) &&
    hasExactKeys(value.field, LEGACY_V6_INTERACTION_FIELD_KEYS) &&
    value.field.radiusMetres === INTERACTION_FIELD_RADIUS_METRES &&
    value.field.edgeFadeMetres === INTERACTION_FIELD_EDGE_FADE_METRES &&
    value.field.maxActiveDisturbances === MAX_ACTIVE_DISTURBANCES &&
    value.field.snapshotBanks === 2 &&
    value.field.maxSnapshotAgeTicks === 1 &&
    value.field.radialImpactRoute === "analytic-uniform-array"
  );
}

function matchesCurrentReflection(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, REFLECTION_KEYS) &&
    isRecord(value.environment) &&
    hasExactKeys(value.environment, ["source"]) &&
    value.environment.source === NATIVE_REFLECTION.environment.source &&
    isRecord(value.planar) &&
    hasExactKeys(value.planar, ["resolutionPolicy", "format", "samples"]) &&
    value.planar.resolutionPolicy ===
      NATIVE_REFLECTION.planar.resolutionPolicy &&
    value.planar.format === NATIVE_REFLECTION.planar.format &&
    value.planar.samples === NATIVE_REFLECTION.planar.samples &&
    isSupportedSsrPolicy(value.ssr, NATIVE_REFLECTION.ssr)
  );
}

function matchesLegacyPreResetV5Profile(
  value: Record<string, unknown>,
  id: MinimalWaterQualityProfileId,
): boolean {
  return (
    hasExactKeys(value, LEGACY_V5_QUALITY_PROFILE_KEYS) &&
    value.schema === QUALITY_PROFILE_SCHEMA &&
    matchesLegacySurface(value, LEGACY_PRE_RESET_V5_QUALITY_PROFILES[id]) &&
    matchesCurrentTemporal(value.temporal) &&
    matchesLegacyPreResetReflection(value.reflection)
  );
}

function matchesCurrentTemporal(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, TEMPORAL_KEYS) &&
    value.mode === NATIVE_TEMPORAL.mode &&
    value.renderScale === NATIVE_TEMPORAL.renderScale &&
    value.resolutionPolicy === NATIVE_TEMPORAL.resolutionPolicy &&
    value.taau === NATIVE_TEMPORAL.taau &&
    value.dynamicResolution === NATIVE_TEMPORAL.dynamicResolution &&
    value.frameGeneration === NATIVE_TEMPORAL.frameGeneration &&
    value.msaaSamples === NATIVE_TEMPORAL.msaaSamples &&
    value.updateCadence === NATIVE_TEMPORAL.updateCadence
  );
}

function matchesLegacyPreResetReflection(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, REFLECTION_KEYS) &&
    isRecord(value.environment) &&
    hasExactKeys(value.environment, ["source"]) &&
    value.environment.source === NATIVE_REFLECTION.environment.source &&
    isRecord(value.planar) &&
    hasExactKeys(value.planar, ["resolutionPolicy", "format", "samples"]) &&
    value.planar.resolutionPolicy ===
      NATIVE_REFLECTION.planar.resolutionPolicy &&
    value.planar.format === NATIVE_REFLECTION.planar.format &&
    value.planar.samples === NATIVE_REFLECTION.planar.samples &&
    matchesLegacyPreResetSsr(value.ssr)
  );
}

function matchesLegacyPreResetSsr(value: unknown): boolean {
  const supported = NATIVE_REFLECTION.ssr;
  return (
    isRecord(value) &&
    hasExactKeys(value, SSR_KEYS) &&
    matchesLegacyPreResetSsrHistory(value.history) &&
    value.mode === supported.mode &&
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

function matchesLegacyPreResetSsrHistory(value: unknown): boolean {
  const supported = NATIVE_REFLECTION.ssr.history;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, LEGACY_PRE_RESET_SSR_HISTORY_KEYS) ||
    !matchesResetDomains(value.resetDomains, supported.resetDomains)
  ) {
    return false;
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
    value.normalFormat === supported.normalFormat &&
    value.updateCadence === supported.updateCadence
  );
}

function matchesResetDomains(
  value: unknown,
  supported: QualityProfileReflectionSsrHistory["resetDomains"],
): boolean {
  if (!Array.isArray(value) || value.length !== supported.length) {
    return false;
  }
  return supported.every((domain, index) => value[index] === domain);
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
    interaction: Object.freeze({
      anchorCount: profile.interaction.anchorCount,
      field: Object.freeze({ ...profile.interaction.field }),
    }),
    bodyCoupling: Object.freeze({ ...profile.bodyCoupling }),
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
