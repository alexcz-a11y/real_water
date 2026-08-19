import { hasExactKeys, isRecord } from "./internal/record-validation.js";
import type { ArtisticControls } from "./runtime.js";

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
export const WATER_PRESET_VERSION = 1 as const;

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

const SUPPORTED_WATER_PRESETS: Readonly<
  Record<WaterPresetId, SupportedWaterPreset>
> = Object.freeze({
  calm: Object.freeze({
    presetHash:
      "sha256:46e77abd2ff1bc2db00440dab4634c935e56e36d624a0e5fc932c06c9c203069",
    artisticControls: Object.freeze({
      waveStrength: 0.55,
      swellDrama: 0.35,
      directionality: 0.85,
      choppiness: 0.25,
      crestSharpness: 0.15,
      microDetail: 0.4,
      timeScale: 0.85,
    }),
  }),
  swell: Object.freeze({
    presetHash:
      "sha256:88703f2f6e7efb3ccba841230d4ac58dfe9c18bc57ea8969c1a7426cf3c3dc48",
    artisticControls: Object.freeze({
      waveStrength: 1,
      swellDrama: 1,
      directionality: 0,
      choppiness: 1,
      crestSharpness: 0,
      microDetail: 1,
      timeScale: 1,
    }),
  }),
  storm: Object.freeze({
    presetHash:
      "sha256:07ef1822a50063f707e4a723e15f1eb0e0cb7310b4563a598d7225f7066fe956",
    artisticControls: Object.freeze({
      waveStrength: 1.45,
      swellDrama: 1.6,
      directionality: 0.35,
      choppiness: 1.7,
      crestSharpness: 1.1,
      microDetail: 1.5,
      timeScale: 1.15,
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

  const supported = createWaterPreset(value.id);
  if (
    value.schema !== supported.schema ||
    value.version !== supported.version ||
    value.presetHash !== supported.presetHash ||
    !isRecord(value.artisticControls) ||
    !hasExactKeys(value.artisticControls, [
      "waveStrength",
      "swellDrama",
      "directionality",
      "choppiness",
      "crestSharpness",
      "microDetail",
      "timeScale",
    ]) ||
    value.artisticControls.waveStrength !==
      supported.artisticControls.waveStrength ||
    value.artisticControls.swellDrama !==
      supported.artisticControls.swellDrama ||
    value.artisticControls.directionality !==
      supported.artisticControls.directionality ||
    value.artisticControls.choppiness !==
      supported.artisticControls.choppiness ||
    value.artisticControls.crestSharpness !==
      supported.artisticControls.crestSharpness ||
    value.artisticControls.microDetail !==
      supported.artisticControls.microDetail ||
    value.artisticControls.timeScale !== supported.artisticControls.timeScale
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
