import { hasExactKeys, isRecord } from "./internal/record-validation.js";
import { sha256Identifier } from "./internal/sha256.js";
import type { ArtisticControls } from "./runtime.js";

// Kept local so Water Preset construction never introduces a runtime cycle
// through runtime.ts, which restores the default built-in preset at startup.
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
  "whitecapAmount",
  "foamPersistence",
] as const;

// Versions 1 through 3 all predate the spectral whitecap Artistic Controls.
const LEGACY_PRE_WHITECAP_ARTISTIC_CONTROL_KEYS = ARTISTIC_CONTROL_KEYS.filter(
  (key) => key !== "whitecapAmount" && key !== "foamPersistence",
);

const LEGACY_V1_ARTISTIC_CONTROL_KEYS = [
  "waveStrength",
  "swellDrama",
  "directionality",
  "choppiness",
  "crestSharpness",
  "microDetail",
  "timeScale",
] as const;

type LegacyPreWhitecapArtisticControls = Omit<
  ArtisticControls,
  "whitecapAmount" | "foamPersistence"
>;

/**
 * The discriminator for supported Water Presets.
 *
 * @public
 */
export const WATER_PRESET_SCHEMA = "real-water/water-preset" as const;

/**
 * The only Water Preset version accepted by this release.
 *
 * @public
 */
export const WATER_PRESET_VERSION = 4 as const;

/**
 * Built-in named sea characters stored as hot Artistic Controls.
 *
 * @public
 */
export type WaterPresetId = "calm" | "swell" | "storm";

/**
 * A versioned named snapshot of Artistic Controls.
 *
 * @public
 */
export interface WaterPreset {
  readonly schema: typeof WATER_PRESET_SCHEMA;
  readonly version: typeof WATER_PRESET_VERSION;
  readonly id: WaterPresetId;
  readonly presetHash: string;
  readonly artisticControls: ArtisticControls;
}

/**
 * The immutable Water Preset identity attached to a snapshot.
 *
 * @public
 */
export interface WaterPresetIdentity {
  readonly schema: typeof WATER_PRESET_SCHEMA;
  readonly version: typeof WATER_PRESET_VERSION;
  readonly id: WaterPresetId;
  readonly presetHash: string;
}

interface BuiltInWaterPreset {
  readonly artisticControls: ArtisticControls;
}

const BUILT_IN_WATER_PRESETS: Readonly<
  Record<WaterPresetId, BuiltInWaterPreset>
> = Object.freeze({
  calm: Object.freeze({
    artisticControls: Object.freeze({
      waveStrength: 0.55,
      swellDrama: 0.35,
      directionality: 0.85,
      choppiness: 0.25,
      crestSharpness: 0.15,
      microDetail: 0.4,
      timeScale: 0.85,
      grazingReflection: 0.7,
      environmentReflection: 0.85,
      depthSeeThrough: 0.95,
      depthColoring: 0.4,
      inWaterGlow: 0.35,
      crestGlow: 0.25,
      whitecapAmount: 0.25,
      foamPersistence: 0.45,
    }),
  }),
  swell: Object.freeze({
    artisticControls: Object.freeze({
      waveStrength: 1,
      swellDrama: 1,
      directionality: 0,
      choppiness: 1,
      crestSharpness: 0,
      microDetail: 1,
      timeScale: 1,
      grazingReflection: 1,
      environmentReflection: 1,
      depthSeeThrough: 1,
      depthColoring: 1,
      inWaterGlow: 1,
      crestGlow: 1,
      whitecapAmount: 1,
      foamPersistence: 1,
    }),
  }),
  storm: Object.freeze({
    artisticControls: Object.freeze({
      waveStrength: 1.45,
      swellDrama: 1.6,
      directionality: 0.35,
      choppiness: 1.7,
      crestSharpness: 1.1,
      microDetail: 1.5,
      timeScale: 1.15,
      grazingReflection: 1.15,
      environmentReflection: 0.7,
      depthSeeThrough: 0.4,
      depthColoring: 1.55,
      inWaterGlow: 1.45,
      crestGlow: 1.6,
      whitecapAmount: 1.65,
      foamPersistence: 1.6,
    }),
  }),
});

/**
 * Returns a supported Calm, Swell, or Storm Water Preset.
 *
 * @public
 */
export function createWaterPreset(id: WaterPresetId = "swell"): WaterPreset {
  if (!isSupportedPresetId(id)) {
    throw new RangeError(`Unsupported Water Preset: ${id}`);
  }

  const supported: BuiltInWaterPreset | undefined = BUILT_IN_WATER_PRESETS[id];
  if (supported === undefined) {
    throw new RangeError(`Unsupported Water Preset: ${id}`);
  }

  return createAuthoredWaterPreset(id, supported.artisticControls);
}

/**
 * Creates a current Water Preset from a complete Artistic Control snapshot.
 *
 * @public
 */
export function createAuthoredWaterPreset(
  id: WaterPresetId,
  artisticControls: ArtisticControls,
): WaterPreset {
  if (!isSupportedPresetId(id)) {
    throw new RangeError(`Unsupported Water Preset: ${id}`);
  }

  const presetWithoutHash = {
    schema: WATER_PRESET_SCHEMA,
    version: WATER_PRESET_VERSION,
    id,
    artisticControls: readArtisticControls(artisticControls),
  };
  return freezeWaterPreset({
    schema: presetWithoutHash.schema,
    version: presetWithoutHash.version,
    id: presetWithoutHash.id,
    presetHash: sha256Identifier(JSON.stringify(presetWithoutHash)),
    artisticControls: presetWithoutHash.artisticControls,
  });
}

/**
 * Validates the schema, controls, and content hash of a current Water Preset,
 * then returns a deeply immutable copy.
 *
 * @public
 */
export function normalizeWaterPreset(candidate: WaterPreset): WaterPreset {
  const value: unknown = candidate;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schema",
      "version",
      "id",
      "presetHash",
      "artisticControls",
    ]) ||
    !isSupportedPresetId(value.id)
  ) {
    throw new TypeError("The Water Preset is not supported.");
  }

  if (value.version === 1) {
    throw new TypeError(
      "Water Preset version 1 does not include the required optical Artistic Controls.",
    );
  }
  if (value.version === 2) {
    throw new TypeError(
      "Water Preset version 2 does not include the required spectral whitecap Artistic Controls.",
    );
  }

  if (
    value.schema !== WATER_PRESET_SCHEMA ||
    value.version !== WATER_PRESET_VERSION
  ) {
    throw new TypeError("The Water Preset is not a current supported version.");
  }

  const normalized = createAuthoredWaterPreset(
    value.id,
    readArtisticControls(value.artisticControls),
  );
  if (value.presetHash !== normalized.presetHash) {
    throw new TypeError("The Water Preset content hash does not match.");
  }

  return normalized;
}

/**
 * Explicitly migrates a recognized Water Preset to the current version.
 *
 * @public
 */
export function migrateWaterPreset(candidate: unknown): WaterPreset {
  if (!isRecord(candidate)) {
    throw new TypeError("The Water Preset version cannot be migrated.");
  }
  if (candidate.version === WATER_PRESET_VERSION) {
    return normalizeWaterPreset(candidate as unknown as WaterPreset);
  }
  if (candidate.version === 3) {
    return migrateBuiltInWaterPresetV3(candidate);
  }
  if (candidate.version === 2) {
    return migrateBuiltInWaterPresetV2(candidate);
  }
  if (candidate.version === 1) {
    return migrateBuiltInWaterPresetV1(candidate);
  }
  throw new TypeError("The Water Preset version cannot be migrated.");
}

/**
 * Returns the immutable identity of a normalized Water Preset.
 *
 * @public
 */
export function waterPresetIdentity(preset: WaterPreset): WaterPresetIdentity {
  const normalized = normalizeWaterPreset(preset);
  return Object.freeze({
    schema: normalized.schema,
    version: normalized.version,
    id: normalized.id,
    presetHash: normalized.presetHash,
  });
}

function freezeWaterPreset(preset: WaterPreset): WaterPreset {
  return Object.freeze({
    ...preset,
    artisticControls: Object.freeze({ ...preset.artisticControls }),
  });
}

function copyArtisticControls(
  artisticControls: ArtisticControls,
): ArtisticControls {
  return {
    waveStrength: artisticControls.waveStrength,
    swellDrama: artisticControls.swellDrama,
    directionality: artisticControls.directionality,
    choppiness: artisticControls.choppiness,
    crestSharpness: artisticControls.crestSharpness,
    microDetail: artisticControls.microDetail,
    timeScale: artisticControls.timeScale,
    grazingReflection: artisticControls.grazingReflection,
    environmentReflection: artisticControls.environmentReflection,
    depthSeeThrough: artisticControls.depthSeeThrough,
    depthColoring: artisticControls.depthColoring,
    inWaterGlow: artisticControls.inWaterGlow,
    crestGlow: artisticControls.crestGlow,
    whitecapAmount: artisticControls.whitecapAmount,
    foamPersistence: artisticControls.foamPersistence,
  };
}

function readArtisticControls(candidate: unknown): ArtisticControls {
  if (!isRecord(candidate) || !hasExactKeys(candidate, ARTISTIC_CONTROL_KEYS)) {
    throw new TypeError(
      "Artistic Controls must use the complete supported control set.",
    );
  }

  assertControlRange(candidate.waveStrength, 0, 2, "waveStrength");
  assertControlRange(candidate.swellDrama, 0, 2, "swellDrama");
  assertControlRange(candidate.directionality, 0, 1, "directionality");
  assertControlRange(candidate.choppiness, 0, 2, "choppiness");
  assertControlRange(candidate.crestSharpness, 0, 2, "crestSharpness");
  assertControlRange(candidate.microDetail, 0, 2, "microDetail");
  assertControlRange(candidate.timeScale, 0, 2, "timeScale");
  assertControlRange(candidate.grazingReflection, 0, 2, "grazingReflection");
  assertControlRange(
    candidate.environmentReflection,
    0,
    2,
    "environmentReflection",
  );
  assertControlRange(candidate.depthSeeThrough, 0, 2, "depthSeeThrough");
  assertControlRange(candidate.depthColoring, 0, 2, "depthColoring");
  assertControlRange(candidate.inWaterGlow, 0, 2, "inWaterGlow");
  assertControlRange(candidate.crestGlow, 0, 2, "crestGlow");
  assertControlRange(candidate.whitecapAmount, 0, 2, "whitecapAmount");
  assertControlRange(candidate.foamPersistence, 0, 2, "foamPersistence");

  return copyArtisticControls(candidate as unknown as ArtisticControls);
}

// A pre-whitecap snapshot carries thirteen controls, so the current reader's
// exact-key check cannot be used directly. Range validation is still shared
// with it by attaching the canonical default whitecap pair: createWaterPreset
// defaults to "swell", whose whitecapAmount and foamPersistence are both 1.
// That pair is then discarded -- the returned record, the content hash, and the
// built-in comparison all stay on the thirteen controls actually committed, so
// the migrated preset's whitecap values are its own, not a substituted default.
function readLegacyPreWhitecapArtisticControls(
  candidate: unknown,
): LegacyPreWhitecapArtisticControls {
  if (
    !isRecord(candidate) ||
    !hasExactKeys(candidate, LEGACY_PRE_WHITECAP_ARTISTIC_CONTROL_KEYS)
  ) {
    throw new TypeError(
      "Artistic Controls must use the complete supported control set.",
    );
  }

  const validated = readArtisticControls({
    ...candidate,
    whitecapAmount: 1,
    foamPersistence: 1,
  });
  const legacy: Partial<Record<string, number>> = {};
  for (const key of LEGACY_PRE_WHITECAP_ARTISTIC_CONTROL_KEYS) {
    legacy[key] = validated[key];
  }
  return legacy as LegacyPreWhitecapArtisticControls;
}

function assertControlRange(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new RangeError(
      `Artistic Control ${label} must be finite and between ${minimum} and ${maximum}.`,
    );
  }
}

function migrateBuiltInWaterPresetV2(candidate: Record<string, unknown>) {
  if (
    !hasExactKeys(candidate, [
      "schema",
      "version",
      "id",
      "presetHash",
      "artisticControls",
    ]) ||
    candidate.schema !== WATER_PRESET_SCHEMA ||
    candidate.version !== 2 ||
    !isSupportedPresetId(candidate.id)
  ) {
    throw new TypeError("The Water Preset v2 snapshot cannot be migrated.");
  }

  const artisticControls = readLegacyPreWhitecapArtisticControls(
    candidate.artisticControls,
  );
  const supported = BUILT_IN_WATER_PRESETS[candidate.id].artisticControls;
  const canonical = {
    schema: WATER_PRESET_SCHEMA,
    version: 2,
    id: candidate.id,
    artisticControls,
  };
  if (
    candidate.presetHash !== sha256Identifier(JSON.stringify(canonical)) ||
    LEGACY_PRE_WHITECAP_ARTISTIC_CONTROL_KEYS.some(
      (key) => artisticControls[key] !== supported[key],
    )
  ) {
    throw new TypeError("The Water Preset v2 snapshot cannot be migrated.");
  }

  return createWaterPreset(candidate.id);
}

// Version 3 was committed twice, in two different shapes, on two branches that
// were developed in parallel: one derived presetHash at runtime over the
// thirteen optical controls, the other added the two spectral whitecap
// controls. Both exact payloads remain recoverable. Version 4 is the first
// version that carries both, which is why it exists at all.
function migrateBuiltInWaterPresetV3(candidate: Record<string, unknown>) {
  if (
    !hasExactKeys(candidate, [
      "schema",
      "version",
      "id",
      "presetHash",
      "artisticControls",
    ]) ||
    candidate.schema !== WATER_PRESET_SCHEMA ||
    candidate.version !== 3 ||
    !isSupportedPresetId(candidate.id) ||
    !isRecord(candidate.artisticControls)
  ) {
    throw new TypeError("The Water Preset v3 snapshot cannot be migrated.");
  }

  const supported = BUILT_IN_WATER_PRESETS[candidate.id].artisticControls;
  const withWhitecaps = hasExactKeys(
    candidate.artisticControls,
    ARTISTIC_CONTROL_KEYS,
  );
  const keys = withWhitecaps
    ? ARTISTIC_CONTROL_KEYS
    : LEGACY_PRE_WHITECAP_ARTISTIC_CONTROL_KEYS;
  const artisticControls: Record<string, number> = withWhitecaps
    ? readArtisticControls(candidate.artisticControls)
    : readLegacyPreWhitecapArtisticControls(candidate.artisticControls);
  const canonical = {
    schema: WATER_PRESET_SCHEMA,
    version: 3,
    id: candidate.id,
    artisticControls,
  };
  if (
    candidate.presetHash !== sha256Identifier(JSON.stringify(canonical)) ||
    keys.some((key) => artisticControls[key] !== supported[key])
  ) {
    throw new TypeError("The Water Preset v3 snapshot cannot be migrated.");
  }

  return createWaterPreset(candidate.id);
}

function migrateBuiltInWaterPresetV1(candidate: Record<string, unknown>) {
  if (
    !hasExactKeys(candidate, [
      "schema",
      "version",
      "id",
      "presetHash",
      "artisticControls",
    ]) ||
    candidate.schema !== WATER_PRESET_SCHEMA ||
    candidate.version !== 1 ||
    !isSupportedPresetId(candidate.id) ||
    !isRecord(candidate.artisticControls) ||
    !hasExactKeys(candidate.artisticControls, LEGACY_V1_ARTISTIC_CONTROL_KEYS)
  ) {
    throw new TypeError("The Water Preset v1 snapshot cannot be migrated.");
  }

  const supported = BUILT_IN_WATER_PRESETS[candidate.id].artisticControls;
  const artisticControls = {
    waveStrength: candidate.artisticControls.waveStrength,
    swellDrama: candidate.artisticControls.swellDrama,
    directionality: candidate.artisticControls.directionality,
    choppiness: candidate.artisticControls.choppiness,
    crestSharpness: candidate.artisticControls.crestSharpness,
    microDetail: candidate.artisticControls.microDetail,
    timeScale: candidate.artisticControls.timeScale,
  };
  const canonical = {
    schema: WATER_PRESET_SCHEMA,
    version: 1,
    id: candidate.id,
    artisticControls,
  };
  if (
    candidate.presetHash !== sha256Identifier(JSON.stringify(canonical)) ||
    LEGACY_V1_ARTISTIC_CONTROL_KEYS.some(
      (key) => artisticControls[key] !== supported[key],
    )
  ) {
    throw new TypeError("The Water Preset v1 snapshot cannot be migrated.");
  }

  return createWaterPreset(candidate.id);
}

function isSupportedPresetId(value: unknown): value is WaterPresetId {
  return value === "calm" || value === "swell" || value === "storm";
}
