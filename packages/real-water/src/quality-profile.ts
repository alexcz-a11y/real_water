import { hasExactKeys, isRecord } from "./internal/record-validation.js";
import {
  INTERACTION_FIELD_EDGE_FADE_METRES,
  INTERACTION_FIELD_RADIUS_METRES,
  MAX_ACTIVE_DISTURBANCES,
} from "./capabilities.js";

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
export const QUALITY_PROFILE_VERSION = 8 as const;

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
 * Structural spectral-whitecap field and diagnostic policy. Amount and
 * persistence remain hot Artistic Controls and are deliberately absent here.
 *
 * @public
 */
export interface QualityProfileSpectralWhitecaps {
  readonly mode: "spectral-ping-pong";
  readonly fixedTickHz: 60;
  readonly fieldResolution: 128 | 256;
  readonly tileSizeMetres: 256;
  readonly fieldFormat: "rgba16float";
  readonly stageLayout: "generation-history-advection-decay";
  readonly diffusionTaps: 3;
  readonly updateCadence: "host-fixed-tick";
  readonly captureResolutionPolicy: "drawing-buffer-exact";
  readonly captureFormat: "rgba16float";
  readonly resetDomains: readonly [
    "simulation-reset",
    "seed-change",
    "tick-rewind",
    "time-rewind",
    "sea-state-cut",
  ];
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
  readonly temporal: QualityProfileTemporal;
  readonly reflection: QualityProfileReflection;
  readonly whitecaps: QualityProfileSpectralWhitecaps;
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

// Every committed snapshot predating the spectral whitecap field is described
// by geometry identity alone. Keeping that the narrow type -- rather than
// making whitecapFieldResolution optional -- is what stops `undefined` from
// reaching the current profile's whitecaps.fieldResolution.
interface LegacyQualityProfileSnapshot {
  readonly profileHash: string;
  readonly widthSegments: number;
  readonly heightSegments: number;
}

interface SupportedQualityProfile extends LegacyQualityProfileSnapshot {
  readonly whitecapFieldResolution: 128 | 256;
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
// schema, version, id, surface, interaction, temporal, reflection, whitecaps.
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
// "waterline-crossing" is deliberately absent here. Whitecap foam is simulated
// in the wave field, so its history only has to be dropped when that field is
// discontinuous — a reset, a reseed, a rewind, a sea-state cut. A waterline
// crossing is a presentation-side, view-dependent event: the camera moves
// through the surface while the field itself keeps evolving. Adding it would
// silently throw away converged foam every time the camera dips, so do not add
// it here "for consistency" with the SSR history reset domains, which are
// view-dependent and therefore do list it.
const SPECTRAL_WHITECAP_RESET_DOMAINS = Object.freeze([
  "simulation-reset",
  "seed-change",
  "tick-rewind",
  "time-rewind",
  "sea-state-cut",
] as const);
const SUPPORTED_QUALITY_PROFILES: Readonly<
  Record<MinimalWaterQualityProfileId, SupportedQualityProfile>
> = Object.freeze({
  "minimal": Object.freeze({
    profileHash:
      "sha256:b2e727a8016dbac41a2ea1036275f10c344cffc82b2a10bea2c4bc4807bc651d",
    widthSegments: 128,
    heightSegments: 128,
    whitecapFieldResolution: 128,
  }),
  "minimal-high-detail": Object.freeze({
    profileHash:
      "sha256:a760008c06d5c27ea2cd42f986aff9272f7eaf184e97c6aab6bedf1d73f96bcd",
    widthSegments: 256,
    heightSegments: 256,
    whitecapFieldResolution: 256,
  }),
});

// Version 1 was committed with two different geometry layouts before the
// schema acquired temporal and reflection policies. Both exact payloads remain
// recoverable; their hashes are not aliases for partially matching data.
const LEGACY_V1_QUALITY_PROFILES: readonly Readonly<
  Record<MinimalWaterQualityProfileId, LegacyQualityProfileSnapshot>
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
  Record<MinimalWaterQualityProfileId, LegacyQualityProfileSnapshot>
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
// A legacy variant states the whole contract it was committed under, never
// borrowing the current one. `absentKeys` covers fields the current schema has
// and this shape did not; `absentSsrHistoryKeys` does the same one level down;
// `ssrHistoryResetDomains` covers a field both shapes have but whose VALUE
// changed. Existence and value are two halves of the same question, so they sit
// together.
//
// The lists below are deliberately their own literals rather than references to
// the current policy. Sharing the constant is exactly how a rung silently
// starts demanding a contract written after it: the next reset domain added to
// the current policy would propagate into every historical entry and each one
// would begin rejecting the payload it exists to recover.
type QualityProfileKey = (typeof QUALITY_PROFILE_KEYS)[number];
type SsrHistoryKey = (typeof SSR_HISTORY_KEYS)[number];

interface LegacyQualityProfileVariant {
  readonly absentKeys: readonly QualityProfileKey[];
  readonly absentSsrHistoryKeys: readonly SsrHistoryKey[];
  readonly ssrHistoryResetDomains: readonly string[];
  readonly profiles: Readonly<
    Record<MinimalWaterQualityProfileId, LegacyQualityProfileSnapshot>
  >;
}

// Everything committed before the waterline carries these four, in this order.
const LEGACY_SSR_HISTORY_RESET_DOMAINS = Object.freeze([
  "simulation-reset",
  "camera-cut",
  "origin-shift",
  "sea-state-cut",
] as const);

// #31 shipped a version 6 that already carried the waterline domain. Its own
// literal, for the same reason the list above is its own: a variant is matched
// against the contract it was committed under, never against the current one.
const WATERLINE_SSR_HISTORY_RESET_DOMAINS = Object.freeze([
  "simulation-reset",
  "camera-cut",
  "origin-shift",
  "sea-state-cut",
  "waterline-crossing",
] as const);

// Version 5 was committed twice: once before the SSR history carried a
// resetVelocityFormat, and once after. Neither knew about `interaction` or
// `whitecaps`, so both cover the field order schema, version, id, surface,
// temporal, reflection.
const LEGACY_V5_QUALITY_PROFILES: readonly LegacyQualityProfileVariant[] =
  Object.freeze([
    Object.freeze({
      absentKeys: Object.freeze(["interaction", "whitecaps"] as const),
      absentSsrHistoryKeys: Object.freeze([] as const),
      ssrHistoryResetDomains: LEGACY_SSR_HISTORY_RESET_DOMAINS,
      profiles: Object.freeze({
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
      }),
    }),
    Object.freeze({
      absentKeys: Object.freeze(["interaction", "whitecaps"] as const),
      absentSsrHistoryKeys: Object.freeze(["resetVelocityFormat"] as const),
      ssrHistoryResetDomains: LEGACY_SSR_HISTORY_RESET_DOMAINS,
      profiles: Object.freeze({
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
      }),
    }),
  ]);

// Version 6 was committed more than once, in more than one shape, on branches
// developed in parallel: one added `interaction`, another added `whitecaps`.
// Every exact payload remains recoverable, and no hash is an alias for
// another's partially matching data. Version 7 is the first version that
// carries both fields, which is why it exists at all.
// Version 7 carried interaction and whitecaps but predates the waterline: its
// SSR history reset domains stop at sea-state-cut. Version 8 is the first that
// also resets on a waterline crossing.
const LEGACY_V7_QUALITY_PROFILES: readonly LegacyQualityProfileVariant[] =
  Object.freeze([
    Object.freeze({
      absentKeys: Object.freeze([] as const),
      absentSsrHistoryKeys: Object.freeze([] as const),
      ssrHistoryResetDomains: LEGACY_SSR_HISTORY_RESET_DOMAINS,
      profiles: Object.freeze({
        "minimal": Object.freeze({
          profileHash:
            "sha256:f896b4033ed12264eabcc4e88fc2f41cdbd9e8a2d2a70698b296683b586d3c3f",
          widthSegments: 128,
          heightSegments: 128,
        }),
        "minimal-high-detail": Object.freeze({
          profileHash:
            "sha256:d33533c3f740eb2d9ef0d4a516f8e242ce22ca83ce90f38fb72f74e57c9738b3",
          widthSegments: 256,
          heightSegments: 256,
        }),
      }),
    }),
  ]);

const LEGACY_V6_QUALITY_PROFILES: readonly LegacyQualityProfileVariant[] =
  Object.freeze([
    Object.freeze({
      absentKeys: Object.freeze(["whitecaps"] as const),
      absentSsrHistoryKeys: Object.freeze([] as const),
      ssrHistoryResetDomains: LEGACY_SSR_HISTORY_RESET_DOMAINS,
      profiles: Object.freeze({
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
      }),
    }),
    Object.freeze({
      absentKeys: Object.freeze(["interaction"] as const),
      absentSsrHistoryKeys: Object.freeze([] as const),
      ssrHistoryResetDomains: LEGACY_SSR_HISTORY_RESET_DOMAINS,
      profiles: Object.freeze({
        "minimal": Object.freeze({
          profileHash:
            "sha256:e89f6484cb983b184dee0ee46a77f8f05561b97df2a37c4686525b73b53eda28",
          widthSegments: 128,
          heightSegments: 128,
        }),
        "minimal-high-detail": Object.freeze({
          profileHash:
            "sha256:008a6a813e5e048fca87cce20a13ea7c1a2187a146a4fda7e2a441f4e7d71a37",
          widthSegments: 256,
          heightSegments: 256,
        }),
      }),
    }),
    // The third version 6, from #31. It added no field -- its key set matches
    // version 5 -- and is a distinct shape only because it added
    // waterline-crossing to the reset domains, which moved the hash.
    Object.freeze({
      absentKeys: Object.freeze(["interaction", "whitecaps"] as const),
      absentSsrHistoryKeys: Object.freeze([] as const),
      ssrHistoryResetDomains: WATERLINE_SSR_HISTORY_RESET_DOMAINS,
      profiles: Object.freeze({
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
      }),
    }),
  ]);

const QUALITY_PROFILE_KEYS = [
  "schema",
  "version",
  "id",
  "profileHash",
  "surface",
  "interaction",
  "temporal",
  "reflection",
  "whitecaps",
] as const;
const SPECTRAL_WHITECAP_KEYS = [
  "mode",
  "fixedTickHz",
  "fieldResolution",
  "tileSizeMetres",
  "fieldFormat",
  "stageLayout",
  "diffusionTaps",
  "updateCadence",
  "captureResolutionPolicy",
  "captureFormat",
  "resetDomains",
] as const;
const INTERACTION_KEYS = ["anchorCount", "field"] as const;
const INTERACTION_FIELD_KEYS = [
  "radiusMetres",
  "edgeFadeMetres",
  "maxActiveDisturbances",
  "snapshotBanks",
  "maxSnapshotAgeTicks",
  "radialImpactRoute",
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
      },
    },
    temporal: NATIVE_TEMPORAL,
    reflection: NATIVE_REFLECTION,
    whitecaps: {
      mode: "spectral-ping-pong",
      fixedTickHz: 60,
      fieldResolution: supported.whitecapFieldResolution,
      tileSizeMetres: 256,
      fieldFormat: "rgba16float",
      stageLayout: "generation-history-advection-decay",
      diffusionTaps: 3,
      updateCadence: "host-fixed-tick",
      captureResolutionPolicy: "drawing-buffer-exact",
      captureFormat: "rgba16float",
      resetDomains: SPECTRAL_WHITECAP_RESET_DOMAINS,
    },
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
    !isSupportedSsrPolicy(value.reflection.ssr, supported.reflection.ssr) ||
    !isSupportedSpectralWhitecaps(value.whitecaps, supported.whitecaps)
  ) {
    throw new TypeError(
      "The Quality Profile does not match a supported structural configuration.",
    );
  }

  return supported;
}

function isSupportedSpectralWhitecaps(
  value: unknown,
  supported: QualityProfileSpectralWhitecaps,
): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, SPECTRAL_WHITECAP_KEYS) ||
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
    value.fixedTickHz === supported.fixedTickHz &&
    value.fieldResolution === supported.fieldResolution &&
    value.tileSizeMetres === supported.tileSizeMetres &&
    value.fieldFormat === supported.fieldFormat &&
    value.stageLayout === supported.stageLayout &&
    value.diffusionTaps === supported.diffusionTaps &&
    value.updateCadence === supported.updateCadence &&
    value.captureResolutionPolicy === supported.captureResolutionPolicy &&
    value.captureFormat === supported.captureFormat
  );
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
    candidate.version === 7 &&
    isSupportedProfileId(candidate.id) &&
    matchesLegacyV7Profile(candidate, candidate.id)
  ) {
    return createMinimalWaterQualityProfile(candidate.id);
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
    matchesLegacyV5Profile(candidate, candidate.id)
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
  supported: LegacyQualityProfileSnapshot,
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

function matchesLegacyV7Profile(
  value: Record<string, unknown>,
  id: MinimalWaterQualityProfileId,
): boolean {
  return LEGACY_V7_QUALITY_PROFILES.some((variant) =>
    matchesLegacyVariant(value, id, variant),
  );
}

function matchesLegacyV6Profile(
  value: Record<string, unknown>,
  id: MinimalWaterQualityProfileId,
): boolean {
  return LEGACY_V6_QUALITY_PROFILES.some((variant) =>
    matchesLegacyVariant(value, id, variant),
  );
}

function matchesLegacyVariant(
  value: Record<string, unknown>,
  id: MinimalWaterQualityProfileId,
  variant: LegacyQualityProfileVariant,
): boolean {
  const carriesInteraction = !variant.absentKeys.includes("interaction");
  const carriesWhitecaps = !variant.absentKeys.includes("whitecaps");
  return (
    hasExactKeys(
      value,
      QUALITY_PROFILE_KEYS.filter((key) => !variant.absentKeys.includes(key)),
    ) &&
    value.schema === QUALITY_PROFILE_SCHEMA &&
    matchesLegacySurface(value, variant.profiles[id]) &&
    matchesCurrentTemporal(value.temporal) &&
    matchesVariantReflection(value.reflection, variant) &&
    (!carriesInteraction || matchesCurrentInteraction(value.interaction, id)) &&
    (!carriesWhitecaps ||
      isSupportedSpectralWhitecaps(
        value.whitecaps,
        createMinimalWaterQualityProfile(id).whitecaps,
      ))
  );
}

// The interaction and whitecap policies are unchanged between the two committed
// version 6 shapes and version 7, so the current profile is the comparand.
function matchesCurrentInteraction(
  value: unknown,
  id: MinimalWaterQualityProfileId,
): boolean {
  const supported = createMinimalWaterQualityProfile(id).interaction;
  return (
    isRecord(value) &&
    hasExactKeys(value, INTERACTION_KEYS) &&
    value.anchorCount === supported.anchorCount &&
    isRecord(value.field) &&
    hasExactKeys(value.field, INTERACTION_FIELD_KEYS) &&
    value.field.radiusMetres === supported.field.radiusMetres &&
    value.field.edgeFadeMetres === supported.field.edgeFadeMetres &&
    value.field.maxActiveDisturbances ===
      supported.field.maxActiveDisturbances &&
    value.field.snapshotBanks === supported.field.snapshotBanks &&
    value.field.maxSnapshotAgeTicks === supported.field.maxSnapshotAgeTicks &&
    value.field.radialImpactRoute === supported.field.radialImpactRoute
  );
}

function matchesLegacyV5Profile(
  value: Record<string, unknown>,
  id: MinimalWaterQualityProfileId,
): boolean {
  return LEGACY_V5_QUALITY_PROFILES.some((variant) =>
    matchesLegacyVariant(value, id, variant),
  );
}

function matchesVariantReflection(
  value: unknown,
  variant: LegacyQualityProfileVariant,
): boolean {
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
    matchesVariantSsr(value.ssr, variant)
  );
}

function matchesVariantSsr(
  value: unknown,
  variant: LegacyQualityProfileVariant,
): boolean {
  const supported = NATIVE_REFLECTION.ssr;
  return (
    isRecord(value) &&
    hasExactKeys(value, SSR_KEYS) &&
    matchesVariantSsrHistory(value.history, variant) &&
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

function matchesVariantSsrHistory(
  value: unknown,
  variant: LegacyQualityProfileVariant,
): boolean {
  const supported = NATIVE_REFLECTION.ssr.history;
  const expectedKeys = SSR_HISTORY_KEYS.filter(
    (key) => !variant.absentSsrHistoryKeys.includes(key),
  );
  if (
    !isRecord(value) ||
    !hasExactKeys(value, expectedKeys) ||
    !matchesResetDomains(value.resetDomains, variant.ssrHistoryResetDomains)
  ) {
    return false;
  }
  const carriesResetVelocityFormat = !variant.absentSsrHistoryKeys.includes(
    "resetVelocityFormat",
  );
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
    value.updateCadence === supported.updateCadence &&
    (!carriesResetVelocityFormat ||
      value.resetVelocityFormat === supported.resetVelocityFormat)
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

function matchesResetDomains(
  value: unknown,
  supported: readonly string[],
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
    temporal: Object.freeze({ ...profile.temporal }),
    reflection: Object.freeze({
      environment: Object.freeze({ ...profile.reflection.environment }),
      planar: Object.freeze({ ...profile.reflection.planar }),
      ssr: Object.freeze({
        ...profile.reflection.ssr,
        history: Object.freeze({
          ...profile.reflection.ssr.history,
          // Copied, never re-listed. Re-typing the domains here would make this
          // function a second declaration of the policy that has to be kept in
          // step with the first by hand, and a frozen profile that quietly
          // disagrees with its own type is not something any assertion in this
          // package can see: normalizeQualityProfile compares against another
          // profile frozen by this same function, and profileHash is a literal.
          resetDomains: Object.freeze([
            ...profile.reflection.ssr.history.resetDomains,
          ]) as QualityProfileReflectionSsrHistory["resetDomains"],
        }),
      }),
    }),
    whitecaps: Object.freeze({
      ...profile.whitecaps,
      resetDomains: Object.freeze([
        ...profile.whitecaps.resetDomains,
      ]) as QualityProfileSpectralWhitecaps["resetDomains"],
    }),
  });
}

function isSupportedProfileId(
  value: unknown,
): value is MinimalWaterQualityProfileId {
  return value === "minimal" || value === "minimal-high-detail";
}
