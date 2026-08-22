import { hasExactKeys, isRecord } from "./internal/record-validation.js";
import { ARTISTIC_CONTROL_KEYS, type ArtisticControls } from "./runtime.js";

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
export const WATER_PRESET_VERSION = 3 as const;

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

interface SupportedWaterPreset {
  readonly presetHash: string;
  readonly artisticControls: ArtisticControls;
}

// Each static hash is the SHA-256 digest of the preset's canonical JSON,
// excluding presetHash and preserving the public field order.
const SUPPORTED_WATER_PRESETS: Readonly<
  Record<WaterPresetId, SupportedWaterPreset>
> = Object.freeze({
  calm: Object.freeze({
    presetHash:
      "sha256:2636557cea16c0c4c8fc249e486192db8b205737d2679df95e36ee10baeb2825",
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
    presetHash:
      "sha256:a271f14c1aad0eaf6681b9499cb962b94b19531870cf5b4bca3a6061636ccbeb",
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
    presetHash:
      "sha256:04ba3bb41ea6ca9c9f6b54bd7bf8888c0b634df026379be67bad284143f2d3e9",
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

  const supported: SupportedWaterPreset | undefined =
    SUPPORTED_WATER_PRESETS[id];
  if (supported === undefined) {
    throw new RangeError(`Unsupported Water Preset: ${id}`);
  }

  return freezeWaterPreset({
    schema: WATER_PRESET_SCHEMA,
    version: WATER_PRESET_VERSION,
    id,
    presetHash: supported.presetHash,
    artisticControls: supported.artisticControls,
  });
}

/**
 * Validates and freezes a supported Water Preset.
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

  const supported = createWaterPreset(value.id);
  const artisticControls = value.artisticControls;
  if (
    value.schema !== supported.schema ||
    value.version !== supported.version ||
    value.presetHash !== supported.presetHash ||
    !isRecord(artisticControls) ||
    !hasExactKeys(artisticControls, ARTISTIC_CONTROL_KEYS) ||
    ARTISTIC_CONTROL_KEYS.some(
      (key) => artisticControls[key] !== supported.artisticControls[key],
    )
  ) {
    throw new TypeError(
      "The Water Preset does not match a supported Artistic Control snapshot.",
    );
  }

  return supported;
}

/**
 * Returns the immutable identity of a normalized Water Preset.
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

function isSupportedPresetId(value: unknown): value is WaterPresetId {
  return value === "calm" || value === "swell" || value === "storm";
}
