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

type PresetSchema =
  | typeof WATER_PRESET_SCHEMA
  | typeof ENVIRONMENT_PRESET_SCHEMA
  | typeof QUALITY_PROFILE_SCHEMA
  | typeof SHOWCASE_PRESET_SCHEMA;

interface PresetCodec {
  readonly currentVersion: number;
  normalize(candidate: unknown): PresetDocument;
  migrate(candidate: unknown): PresetDocument;
}

const PRESET_CODECS = Object.freeze({
  [WATER_PRESET_SCHEMA]: Object.freeze({
    currentVersion: WATER_PRESET_VERSION,
    normalize: (candidate: unknown) =>
      normalizeWaterPreset(candidate as WaterPreset),
    migrate: migrateWaterPreset,
  }),
  [ENVIRONMENT_PRESET_SCHEMA]: Object.freeze({
    currentVersion: ENVIRONMENT_PRESET_VERSION,
    normalize: (candidate: unknown) =>
      normalizeEnvironmentPreset(candidate as EnvironmentPreset),
    migrate: migrateEnvironmentPreset,
  }),
  [QUALITY_PROFILE_SCHEMA]: Object.freeze({
    currentVersion: QUALITY_PROFILE_VERSION,
    normalize: (candidate: unknown) =>
      normalizeQualityProfile(candidate as QualityProfile),
    migrate: migrateQualityProfile,
  }),
  [SHOWCASE_PRESET_SCHEMA]: Object.freeze({
    currentVersion: SHOWCASE_PRESET_VERSION,
    normalize: (candidate: unknown) =>
      normalizeShowcasePreset(candidate as ShowcasePreset),
    migrate: migrateShowcasePreset,
  }),
}) satisfies Readonly<Record<PresetSchema, PresetCodec>>;

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
  const codec = readPresetCodec(schema);
  if (codec === undefined) {
    return recovery(rawJson, "unknown-schema", schema);
  }
  const version = candidate.version;
  if (!Number.isSafeInteger(version) || (version as number) < 1) {
    return recovery(rawJson, "invalid-preset", schema);
  }
  const sourceVersion = version as number;
  const currentVersion = codec.currentVersion;
  if (sourceVersion > currentVersion) {
    return recovery(rawJson, "future-version", schema, sourceVersion);
  }

  try {
    return Object.freeze({
      status: "current",
      sourceVersion,
      preset: codec.normalize(candidate),
    });
  } catch {
    // A strict current normalizer intentionally rejects every historical shape.
  }

  try {
    return Object.freeze({
      status: "migrated",
      sourceVersion,
      preset: codec.migrate(candidate),
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

  const codec = readPresetCodec(candidate.schema);
  if (codec === undefined) {
    throw new TypeError("A preset needs a supported schema discriminator.");
  }
  return codec.normalize(candidate);
}

function readPresetCodec(schema: string): PresetCodec | undefined {
  if (Object.hasOwn(PRESET_CODECS, schema)) {
    return PRESET_CODECS[schema as PresetSchema];
  }
  return undefined;
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
