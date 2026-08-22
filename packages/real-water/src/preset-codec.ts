import {
  ENVIRONMENT_PRESET_SCHEMA,
  ENVIRONMENT_PRESET_VERSION,
  migrateEnvironmentPreset,
  normalizeEnvironmentPreset,
  type EnvironmentPreset,
} from "./environment-preset.js";
import { isRecord } from "./internal/record-validation.js";
import {
  QUALITY_PROFILE_SCHEMA,
  QUALITY_PROFILE_VERSION,
  migrateQualityProfile,
  normalizeQualityProfile,
  type QualityProfile,
} from "./quality-profile.js";
import {
  SHOWCASE_PRESET_SCHEMA,
  SHOWCASE_PRESET_VERSION,
  migrateShowcasePreset,
  normalizeShowcasePreset,
  type ShowcasePreset,
} from "./showcase-preset.js";
import {
  WATER_PRESET_SCHEMA,
  WATER_PRESET_VERSION,
  migrateWaterPreset,
  normalizeWaterPreset,
  type WaterPreset,
} from "./water-preset.js";

/**
 * The four durable preset documents supported by this release.
 *
 * @public
 */
export type PresetDocument =
  WaterPreset | EnvironmentPreset | QualityProfile | ShowcasePreset;

/**
 * Why imported JSON was retained for recovery instead of made applicable.
 *
 * @public
 */
export type PresetRecoveryReason =
  | "invalid-json"
  | "unknown-schema"
  | "invalid-preset"
  | "unsupported-version"
  | "future-version";

/**
 * A current preset decoded without migration.
 *
 * @public
 */
export interface CurrentPresetImport {
  readonly status: "current";
  readonly sourceVersion: number;
  readonly preset: PresetDocument;
}

/**
 * A known historical preset decoded through an explicit migration.
 *
 * @public
 */
export interface MigratedPresetImport {
  readonly status: "migrated";
  readonly sourceVersion: number;
  readonly preset: PresetDocument;
}

/**
 * JSON retained byte-for-byte because it cannot be applied by this release.
 *
 * @public
 */
export interface RecoveryPresetImport {
  readonly status: "recovery";
  readonly reason: PresetRecoveryReason;
  readonly rawJson: string;
  readonly detectedSchema?: string;
  readonly detectedVersion?: number;
}

/**
 * The result of importing a preset JSON string.
 *
 * @public
 */
export type PresetImportResult =
  CurrentPresetImport | MigratedPresetImport | RecoveryPresetImport;

/**
 * Imports current or known historical preset JSON. Unsupported input is
 * returned unchanged for recovery instead of being discarded or reshaped.
 *
 * @public
 */
export function importPresetJson(rawJson: string): PresetImportResult {
  let candidate: unknown;
  try {
    candidate = JSON.parse(rawJson) as unknown;
  } catch {
    return recovery(rawJson, "invalid-json");
  }

  if (!isRecord(candidate) || typeof candidate.schema !== "string") {
    return recovery(rawJson, "unknown-schema");
  }
  const schema = candidate.schema;
  if (!isKnownPresetSchema(schema)) {
    return recovery(rawJson, "unknown-schema", schema);
  }
  const version = candidate.version;
  if (!Number.isSafeInteger(version) || (version as number) < 1) {
    return recovery(rawJson, "invalid-preset", schema);
  }
  const sourceVersion = version as number;
  const currentVersion = currentPresetVersion(schema);
  if (sourceVersion > currentVersion) {
    return recovery(rawJson, "future-version", schema, sourceVersion);
  }

  try {
    return Object.freeze({
      status: "current",
      sourceVersion,
      preset: normalizePreset(candidate),
    });
  } catch {
    // A strict current normalizer intentionally rejects every historical shape.
  }

  try {
    return Object.freeze({
      status: "migrated",
      sourceVersion,
      preset: migratePreset(schema, candidate),
    });
  } catch {
    return recovery(
      rawJson,
      sourceVersion < currentVersion ? "unsupported-version" : "invalid-preset",
      schema,
      sourceVersion,
    );
  }
}

/**
 * Exports a validated current preset as deterministic formatted JSON.
 *
 * @public
 */
export function exportPresetJson(preset: PresetDocument): string {
  return `${JSON.stringify(normalizePreset(preset), null, 2)}\n`;
}

/**
 * Validates and deeply freezes one current preset value.
 *
 * @public
 */
export function normalizePreset(candidate: unknown): PresetDocument {
  if (!isRecord(candidate) || typeof candidate.schema !== "string") {
    throw new TypeError("A preset needs a supported schema discriminator.");
  }

  switch (candidate.schema) {
    case WATER_PRESET_SCHEMA:
      return normalizeWaterPreset(candidate as unknown as WaterPreset);
    case ENVIRONMENT_PRESET_SCHEMA:
      return normalizeEnvironmentPreset(
        candidate as unknown as EnvironmentPreset,
      );
    case QUALITY_PROFILE_SCHEMA:
      return normalizeQualityProfile(candidate as unknown as QualityProfile);
    case SHOWCASE_PRESET_SCHEMA:
      return normalizeShowcasePreset(candidate as unknown as ShowcasePreset);
    default:
      throw new TypeError("A preset needs a supported schema discriminator.");
  }
}

type PresetSchema =
  | typeof WATER_PRESET_SCHEMA
  | typeof ENVIRONMENT_PRESET_SCHEMA
  | typeof QUALITY_PROFILE_SCHEMA
  | typeof SHOWCASE_PRESET_SCHEMA;

function isKnownPresetSchema(schema: string): schema is PresetSchema {
  return (
    schema === WATER_PRESET_SCHEMA ||
    schema === ENVIRONMENT_PRESET_SCHEMA ||
    schema === QUALITY_PROFILE_SCHEMA ||
    schema === SHOWCASE_PRESET_SCHEMA
  );
}

function currentPresetVersion(schema: PresetSchema): number {
  switch (schema) {
    case WATER_PRESET_SCHEMA:
      return WATER_PRESET_VERSION;
    case ENVIRONMENT_PRESET_SCHEMA:
      return ENVIRONMENT_PRESET_VERSION;
    case QUALITY_PROFILE_SCHEMA:
      return QUALITY_PROFILE_VERSION;
    case SHOWCASE_PRESET_SCHEMA:
      return SHOWCASE_PRESET_VERSION;
  }
}

function migratePreset(
  schema: PresetSchema,
  candidate: unknown,
): PresetDocument {
  switch (schema) {
    case WATER_PRESET_SCHEMA:
      return migrateWaterPreset(candidate);
    case ENVIRONMENT_PRESET_SCHEMA:
      return migrateEnvironmentPreset(candidate);
    case QUALITY_PROFILE_SCHEMA:
      return migrateQualityProfile(candidate);
    case SHOWCASE_PRESET_SCHEMA:
      return migrateShowcasePreset(candidate);
  }
}

function recovery(
  rawJson: string,
  reason: PresetRecoveryReason,
  detectedSchema?: string,
  detectedVersion?: number,
): RecoveryPresetImport {
  return Object.freeze({
    status: "recovery",
    reason,
    rawJson,
    ...(detectedSchema === undefined ? {} : { detectedSchema }),
    ...(detectedVersion === undefined ? {} : { detectedVersion }),
  });
}
