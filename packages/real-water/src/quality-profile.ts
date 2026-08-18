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
export const QUALITY_PROFILE_VERSION = 1 as const;

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

// Each static hash is the SHA-256 digest of the profile's canonical JSON,
// excluding profileHash and preserving the public field order.
const SUPPORTED_QUALITY_PROFILES: Readonly<
  Record<MinimalWaterQualityProfileId, SupportedQualityProfile>
> = Object.freeze({
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
});

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
    !hasExactKeys(value, [
      "schema",
      "version",
      "id",
      "profileHash",
      "surface",
    ]) ||
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
      supported.surface.geometry.heightSegments
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

function freezeQualityProfile(profile: QualityProfile): QualityProfile {
  return Object.freeze({
    ...profile,
    surface: Object.freeze({
      ...profile.surface,
      geometry: Object.freeze({ ...profile.surface.geometry }),
    }),
  });
}

function isSupportedProfileId(
  value: unknown,
): value is MinimalWaterQualityProfileId {
  return value === "minimal" || value === "minimal-high-detail";
}
