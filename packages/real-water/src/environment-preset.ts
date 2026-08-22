import {
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
  SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS,
  type HostEnvironmentReflectionDescriptor,
  type HostEnvironmentState,
} from "./environment.js";
import { hasExactKeys, isRecord } from "./internal/record-validation.js";
import { sha256Identifier } from "./internal/sha256.js";

const PRESET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SHA_256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const MAX_REFLECTION_DIMENSION = 16_384;

const ENVIRONMENT_PRESET_KEYS = [
  "schema",
  "version",
  "id",
  "presetHash",
  "lighting",
  "reflection",
  "weather",
  "atmosphere",
] as const;
const ENVIRONMENT_SNAPSHOT_KEYS = [
  "lighting",
  "reflection",
  "weather",
  "atmosphere",
] as const;
const LIGHTING_KEYS = [
  "sunDirectionX",
  "sunDirectionY",
  "sunDirectionZ",
  "sunColorR",
  "sunColorG",
  "sunColorB",
  "sunIntensity",
  "environmentIntensity",
  "sunAngularRadiusRadians",
] as const;
const REFLECTION_KEYS = [
  "identity",
  "fingerprint",
  "width",
  "height",
  "format",
  "type",
  "colorSpace",
] as const;
const WEATHER_KEYS = [
  "windDirectionX",
  "windDirectionZ",
  "windStrength",
  "gustStrength",
  "rainIntensity",
] as const;
const ATMOSPHERE_KEYS = [
  "cloudCoverage",
  "cloudShadowStrength",
  "horizonHaze",
] as const;

/**
 * The discriminator for Environment Presets.
 *
 * @public
 */
export const ENVIRONMENT_PRESET_SCHEMA =
  "real-water/environment-preset" as const;

/**
 * The only Environment Preset version accepted by this release.
 *
 * @public
 */
export const ENVIRONMENT_PRESET_VERSION = 1 as const;

/**
 * Plain-data weather authored alongside Host lighting.
 *
 * @public
 */
export interface EnvironmentPresetWeather {
  readonly windDirectionX: number;
  readonly windDirectionZ: number;
  readonly windStrength: number;
  readonly gustStrength: number;
  readonly rainIntensity: number;
}

/**
 * Plain-data atmosphere authored alongside Host lighting.
 *
 * @public
 */
export interface EnvironmentPresetAtmosphere {
  readonly cloudCoverage: number;
  readonly cloudShadowStrength: number;
  readonly horizonHaze: number;
}

/**
 * The serializable Environment state captured by a preset. The reflection is
 * a reference descriptor; Host textures never enter the snapshot.
 *
 * @public
 */
export interface EnvironmentPresetSnapshot {
  readonly lighting: HostEnvironmentState;
  readonly reflection: HostEnvironmentReflectionDescriptor;
  readonly weather: EnvironmentPresetWeather;
  readonly atmosphere: EnvironmentPresetAtmosphere;
}

/**
 * A versioned named snapshot of sun, weather, atmosphere, and a referenced
 * environment reflection resource.
 *
 * @public
 */
export interface EnvironmentPreset extends EnvironmentPresetSnapshot {
  readonly schema: typeof ENVIRONMENT_PRESET_SCHEMA;
  readonly version: typeof ENVIRONMENT_PRESET_VERSION;
  readonly id: string;
  readonly presetHash: string;
}

/**
 * Immutable content identity for an Environment Preset.
 *
 * @public
 */
export interface EnvironmentPresetIdentity {
  readonly schema: typeof ENVIRONMENT_PRESET_SCHEMA;
  readonly version: typeof ENVIRONMENT_PRESET_VERSION;
  readonly id: string;
  readonly presetHash: string;
}

/**
 * Returns the built-in Reference Environment Preset.
 *
 * @public
 */
export function createReferenceEnvironmentPreset(): EnvironmentPreset {
  return createAuthoredEnvironmentPreset("reference", {
    lighting: {
      sunDirectionX: 0.32,
      sunDirectionY: 0.84,
      sunDirectionZ: 0.44,
      sunColorR: 1,
      sunColorG: 0.96,
      sunColorB: 0.82,
      sunIntensity: 1,
      environmentIntensity: 1,
      sunAngularRadiusRadians: SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS,
    },
    reflection: { ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION },
    weather: {
      windDirectionX: 0.8,
      windDirectionZ: 0.6,
      windStrength: 0.35,
      gustStrength: 0.15,
      rainIntensity: 0,
    },
    atmosphere: {
      cloudCoverage: 0.15,
      cloudShadowStrength: 0.1,
      horizonHaze: 0.25,
    },
  });
}

/**
 * Creates a current Environment Preset from a complete serializable snapshot.
 *
 * @public
 */
export function createAuthoredEnvironmentPreset(
  id: string,
  snapshot: EnvironmentPresetSnapshot,
): EnvironmentPreset {
  assertPresetId(id);
  const normalizedSnapshot = readEnvironmentPresetSnapshot(snapshot);
  const presetWithoutHash = {
    schema: ENVIRONMENT_PRESET_SCHEMA,
    version: ENVIRONMENT_PRESET_VERSION,
    id,
    lighting: normalizedSnapshot.lighting,
    reflection: normalizedSnapshot.reflection,
    weather: normalizedSnapshot.weather,
    atmosphere: normalizedSnapshot.atmosphere,
  };
  return freezeEnvironmentPreset({
    ...presetWithoutHash,
    presetHash: sha256Identifier(JSON.stringify(presetWithoutHash)),
  });
}

/**
 * Validates a current Environment Preset and returns a deeply immutable copy.
 *
 * @public
 */
export function normalizeEnvironmentPreset(
  candidate: EnvironmentPreset,
): EnvironmentPreset {
  const value: unknown = candidate;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ENVIRONMENT_PRESET_KEYS) ||
    value.schema !== ENVIRONMENT_PRESET_SCHEMA ||
    value.version !== ENVIRONMENT_PRESET_VERSION
  ) {
    throw new TypeError("The Environment Preset is not a current version.");
  }
  const normalized = createAuthoredEnvironmentPreset(
    value.id as string,
    {
      lighting: value.lighting,
      reflection: value.reflection,
      weather: value.weather,
      atmosphere: value.atmosphere,
    } as EnvironmentPresetSnapshot,
  );
  if (normalized.presetHash !== value.presetHash) {
    throw new TypeError("The Environment Preset content hash does not match.");
  }
  return normalized;
}

/**
 * Validates a current Environment Preset without inventing legacy reshapes.
 * Older and future versions fail closed until an explicit migration exists.
 *
 * @public
 */
export function migrateEnvironmentPreset(
  candidate: unknown,
): EnvironmentPreset {
  if (
    !isRecord(candidate) ||
    candidate.version !== ENVIRONMENT_PRESET_VERSION
  ) {
    throw new TypeError("The Environment Preset version cannot be migrated.");
  }
  return normalizeEnvironmentPreset(candidate as unknown as EnvironmentPreset);
}

/**
 * Returns the immutable identity of a normalized Environment Preset.
 *
 * @public
 */
export function environmentPresetIdentity(
  preset: EnvironmentPreset,
): EnvironmentPresetIdentity {
  const normalized = normalizeEnvironmentPreset(preset);
  return Object.freeze({
    schema: normalized.schema,
    version: normalized.version,
    id: normalized.id,
    presetHash: normalized.presetHash,
  });
}

function readEnvironmentPresetSnapshot(
  candidate: unknown,
): EnvironmentPresetSnapshot {
  if (
    !isRecord(candidate) ||
    !hasExactKeys(candidate, ENVIRONMENT_SNAPSHOT_KEYS) ||
    !isRecord(candidate.lighting) ||
    !hasExactKeys(candidate.lighting, LIGHTING_KEYS) ||
    !isRecord(candidate.reflection) ||
    !hasExactKeys(candidate.reflection, REFLECTION_KEYS) ||
    !isRecord(candidate.weather) ||
    !hasExactKeys(candidate.weather, WEATHER_KEYS) ||
    !isRecord(candidate.atmosphere) ||
    !hasExactKeys(candidate.atmosphere, ATMOSPHERE_KEYS)
  ) {
    throw new TypeError(
      "The Environment Preset snapshot must contain only serializable Environment fields.",
    );
  }
  assertFiniteRange(candidate.lighting.sunDirectionX, -1, 1, "sunDirectionX");
  assertFiniteRange(candidate.lighting.sunDirectionY, -1, 1, "sunDirectionY");
  assertFiniteRange(candidate.lighting.sunDirectionZ, -1, 1, "sunDirectionZ");
  if (
    candidate.lighting.sunDirectionX === 0 &&
    candidate.lighting.sunDirectionY === 0 &&
    candidate.lighting.sunDirectionZ === 0
  ) {
    throw new RangeError("Environment sun direction must be non-zero.");
  }
  assertFiniteRange(candidate.lighting.sunColorR, 0, 16, "sunColorR");
  assertFiniteRange(candidate.lighting.sunColorG, 0, 16, "sunColorG");
  assertFiniteRange(candidate.lighting.sunColorB, 0, 16, "sunColorB");
  assertFiniteRange(candidate.lighting.sunIntensity, 0, 64, "sunIntensity");
  assertFiniteRange(
    candidate.lighting.environmentIntensity,
    0,
    64,
    "environmentIntensity",
  );
  assertFiniteRange(
    candidate.lighting.sunAngularRadiusRadians,
    Number.MIN_VALUE,
    Math.PI,
    "sunAngularRadiusRadians",
  );

  if (
    typeof candidate.reflection.identity !== "string" ||
    candidate.reflection.identity.length > 128 ||
    !PRESET_ID_PATTERN.test(candidate.reflection.identity) ||
    typeof candidate.reflection.fingerprint !== "string" ||
    !SHA_256_PATTERN.test(candidate.reflection.fingerprint) ||
    typeof candidate.reflection.width !== "number" ||
    !Number.isInteger(candidate.reflection.width) ||
    candidate.reflection.width < 1 ||
    candidate.reflection.width > MAX_REFLECTION_DIMENSION ||
    typeof candidate.reflection.height !== "number" ||
    !Number.isInteger(candidate.reflection.height) ||
    candidate.reflection.height < 1 ||
    candidate.reflection.height > MAX_REFLECTION_DIMENSION ||
    candidate.reflection.format !== "rgba8unorm" ||
    candidate.reflection.type !== "equirect" ||
    candidate.reflection.colorSpace !== "srgb"
  ) {
    throw new TypeError(
      "Environment reflection must be a finite referenced equirect descriptor.",
    );
  }

  assertFiniteRange(candidate.weather.windDirectionX, -1, 1, "windDirectionX");
  assertFiniteRange(candidate.weather.windDirectionZ, -1, 1, "windDirectionZ");
  if (
    candidate.weather.windDirectionX === 0 &&
    candidate.weather.windDirectionZ === 0
  ) {
    throw new RangeError("Environment wind direction must be non-zero.");
  }
  assertFiniteRange(candidate.weather.windStrength, 0, 4, "windStrength");
  assertFiniteRange(candidate.weather.gustStrength, 0, 4, "gustStrength");
  assertFiniteRange(candidate.weather.rainIntensity, 0, 1, "rainIntensity");
  assertFiniteRange(candidate.atmosphere.cloudCoverage, 0, 1, "cloudCoverage");
  assertFiniteRange(
    candidate.atmosphere.cloudShadowStrength,
    0,
    1,
    "cloudShadowStrength",
  );
  assertFiniteRange(candidate.atmosphere.horizonHaze, 0, 1, "horizonHaze");

  return {
    lighting: {
      sunDirectionX: candidate.lighting.sunDirectionX,
      sunDirectionY: candidate.lighting.sunDirectionY,
      sunDirectionZ: candidate.lighting.sunDirectionZ,
      sunColorR: candidate.lighting.sunColorR,
      sunColorG: candidate.lighting.sunColorG,
      sunColorB: candidate.lighting.sunColorB,
      sunIntensity: candidate.lighting.sunIntensity,
      environmentIntensity: candidate.lighting.environmentIntensity,
      sunAngularRadiusRadians: candidate.lighting.sunAngularRadiusRadians,
    },
    reflection: {
      identity: candidate.reflection.identity,
      fingerprint: candidate.reflection.fingerprint,
      width: candidate.reflection.width,
      height: candidate.reflection.height,
      format: candidate.reflection.format,
      type: candidate.reflection.type,
      colorSpace: candidate.reflection.colorSpace,
    },
    weather: {
      windDirectionX: candidate.weather.windDirectionX,
      windDirectionZ: candidate.weather.windDirectionZ,
      windStrength: candidate.weather.windStrength,
      gustStrength: candidate.weather.gustStrength,
      rainIntensity: candidate.weather.rainIntensity,
    },
    atmosphere: {
      cloudCoverage: candidate.atmosphere.cloudCoverage,
      cloudShadowStrength: candidate.atmosphere.cloudShadowStrength,
      horizonHaze: candidate.atmosphere.horizonHaze,
    },
  };
}

function assertPresetId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !PRESET_ID_PATTERN.test(value)
  ) {
    throw new TypeError(
      "Environment Preset id must be a non-empty lowercase slug.",
    );
  }
}

function assertFiniteRange(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new RangeError(
      `Environment Preset ${field} must be finite and in [${minimum}, ${maximum}].`,
    );
  }
}

function freezeEnvironmentPreset(preset: EnvironmentPreset): EnvironmentPreset {
  return Object.freeze({
    ...preset,
    lighting: Object.freeze({ ...preset.lighting }),
    reflection: Object.freeze({ ...preset.reflection }),
    weather: Object.freeze({ ...preset.weather }),
    atmosphere: Object.freeze({ ...preset.atmosphere }),
  });
}
