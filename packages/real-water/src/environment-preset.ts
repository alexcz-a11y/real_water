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
  "stormAerosolIntensity",
  "lightningIntensity",
] as const;
const LEGACY_ATMOSPHERE_KEYS = [
  "cloudCoverage",
  "cloudShadowStrength",
  "horizonHaze",
] as const;
const LEGACY_ENVIRONMENT_PRESET_VERSION = 1 as const;

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
export const ENVIRONMENT_PRESET_VERSION = 2 as const;

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
  readonly stormAerosolIntensity: number;
  readonly lightningIntensity: number;
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
 * Returns the built-in Calm Sunrise Environment look.
 *
 * @public
 */
export function createCalmSunriseEnvironmentPreset(): EnvironmentPreset {
  return createAuthoredEnvironmentPreset("calm-sunrise", {
    lighting: {
      sunDirectionX: 0.72,
      sunDirectionY: 0.38,
      sunDirectionZ: 0.58,
      sunColorR: 1,
      sunColorG: 0.72,
      sunColorB: 0.48,
      sunIntensity: 0.78,
      environmentIntensity: 0.68,
      sunAngularRadiusRadians: SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS,
    },
    reflection: { ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION },
    weather: {
      windDirectionX: 0.8,
      windDirectionZ: 0.6,
      windStrength: 0.18,
      gustStrength: 0.06,
      rainIntensity: 0,
    },
    atmosphere: {
      cloudCoverage: 0.12,
      cloudShadowStrength: 0.08,
      horizonHaze: 0.38,
      stormAerosolIntensity: 0,
      lightningIntensity: 0,
    },
  });
}

/**
 * Returns the built-in Blue Noon Environment look.
 *
 * @public
 */
export function createBlueNoonEnvironmentPreset(): EnvironmentPreset {
  return createAuthoredEnvironmentPreset("blue-noon", {
    lighting: {
      sunDirectionX: -0.16,
      sunDirectionY: 0.97,
      sunDirectionZ: 0.18,
      sunColorR: 0.82,
      sunColorG: 0.91,
      sunColorB: 1,
      sunIntensity: 1.2,
      environmentIntensity: 1.15,
      sunAngularRadiusRadians: SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS,
    },
    reflection: { ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION },
    weather: {
      windDirectionX: 0.65,
      windDirectionZ: 0.76,
      windStrength: 0.55,
      gustStrength: 0.18,
      rainIntensity: 0,
    },
    atmosphere: {
      cloudCoverage: 0.08,
      cloudShadowStrength: 0.06,
      horizonHaze: 0.12,
      stormAerosolIntensity: 0,
      lightningIntensity: 0,
    },
  });
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
      stormAerosolIntensity: 0,
      lightningIntensity: 0,
    },
  });
}

/**
 * Returns the built-in Storm Front Environment look. Lightning starts at zero
 * because the deterministic Showcase timeline authors the transient pulse.
 *
 * @public
 */
export function createStormFrontEnvironmentPreset(): EnvironmentPreset {
  return createAuthoredEnvironmentPreset("storm-front", {
    lighting: {
      sunDirectionX: 0.24,
      sunDirectionY: 0.72,
      sunDirectionZ: 0.65,
      sunColorR: 0.76,
      sunColorG: 0.84,
      sunColorB: 1,
      sunIntensity: 0.55,
      environmentIntensity: 0.62,
      sunAngularRadiusRadians: SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS,
    },
    reflection: { ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION },
    weather: {
      windDirectionX: 0.92,
      windDirectionZ: 0.39,
      windStrength: 1.25,
      gustStrength: 0.85,
      rainIntensity: 0.9,
    },
    atmosphere: {
      cloudCoverage: 0.9,
      cloudShadowStrength: 0.75,
      horizonHaze: 0.65,
      stormAerosolIntensity: 0.8,
      lightningIntensity: 0,
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
  if (!isRecord(candidate)) {
    throw new TypeError("The Environment Preset version cannot be migrated.");
  }
  if (candidate.version === ENVIRONMENT_PRESET_VERSION) {
    return normalizeEnvironmentPreset(
      candidate as unknown as EnvironmentPreset,
    );
  }
  if (candidate.version === LEGACY_ENVIRONMENT_PRESET_VERSION) {
    return migrateVersionOneEnvironmentPreset(candidate);
  }
  throw new TypeError("The Environment Preset version cannot be migrated.");
}

function migrateVersionOneEnvironmentPreset(
  candidate: Record<string, unknown>,
): EnvironmentPreset {
  if (
    !hasExactKeys(candidate, ENVIRONMENT_PRESET_KEYS) ||
    candidate.schema !== ENVIRONMENT_PRESET_SCHEMA ||
    typeof candidate.id !== "string" ||
    typeof candidate.presetHash !== "string" ||
    !SHA_256_PATTERN.test(candidate.presetHash) ||
    !isRecord(candidate.lighting) ||
    !hasExactKeys(candidate.lighting, LIGHTING_KEYS) ||
    !isRecord(candidate.reflection) ||
    !hasExactKeys(candidate.reflection, REFLECTION_KEYS) ||
    !isRecord(candidate.weather) ||
    !hasExactKeys(candidate.weather, WEATHER_KEYS) ||
    !isRecord(candidate.atmosphere) ||
    !hasExactKeys(candidate.atmosphere, LEGACY_ATMOSPHERE_KEYS)
  ) {
    throw new TypeError("The Environment Preset version cannot be migrated.");
  }
  const legacyWithoutHash = {
    schema: ENVIRONMENT_PRESET_SCHEMA,
    version: LEGACY_ENVIRONMENT_PRESET_VERSION,
    id: candidate.id,
    lighting: candidate.lighting,
    reflection: candidate.reflection,
    weather: candidate.weather,
    atmosphere: candidate.atmosphere,
  };
  if (
    candidate.presetHash !== sha256Identifier(JSON.stringify(legacyWithoutHash))
  ) {
    throw new TypeError("The Environment Preset content hash does not match.");
  }
  return createAuthoredEnvironmentPreset(candidate.id, {
    lighting: candidate.lighting,
    reflection: candidate.reflection,
    weather: candidate.weather,
    atmosphere: {
      cloudCoverage: candidate.atmosphere.cloudCoverage,
      cloudShadowStrength: candidate.atmosphere.cloudShadowStrength,
      horizonHaze: candidate.atmosphere.horizonHaze,
      stormAerosolIntensity: 0,
      lightningIntensity: 0,
    },
  } as unknown as EnvironmentPresetSnapshot);
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
  assertFiniteRange(
    candidate.atmosphere.stormAerosolIntensity,
    0,
    1,
    "stormAerosolIntensity",
  );
  assertFiniteRange(
    candidate.atmosphere.lightningIntensity,
    0,
    1,
    "lightningIntensity",
  );

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
      stormAerosolIntensity: candidate.atmosphere.stormAerosolIntensity,
      lightningIntensity: candidate.atmosphere.lightningIntensity,
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
