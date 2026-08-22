import { describe, expect, it } from "vitest";
import {
  ENVIRONMENT_PRESET_SCHEMA,
  ENVIRONMENT_PRESET_VERSION,
  createAuthoredEnvironmentPreset,
  createReferenceEnvironmentPreset,
  environmentPresetIdentity,
  migrateEnvironmentPreset,
  normalizeEnvironmentPreset,
  type EnvironmentPresetSnapshot,
} from "../src/environment-preset.js";

describe("Environment Presets", () => {
  it("creates the versioned Reference Environment snapshot without Host resources", () => {
    const preset = createReferenceEnvironmentPreset();

    expect(preset).toEqual({
      schema: ENVIRONMENT_PRESET_SCHEMA,
      version: ENVIRONMENT_PRESET_VERSION,
      id: "reference",
      presetHash:
        "sha256:944a777311b8e46b986d3b4f6798595adcc99e3b5a7d49adf25cfa69c42bdc24",
      lighting: {
        sunDirectionX: 0.32,
        sunDirectionY: 0.84,
        sunDirectionZ: 0.44,
        sunColorR: 1,
        sunColorG: 0.96,
        sunColorB: 0.82,
        sunIntensity: 1,
        environmentIntensity: 1,
        sunAngularRadiusRadians: 0.069,
      },
      reflection: {
        identity: "water-environment-radiance",
        fingerprint:
          "sha256:84b8a165a60b53c9e86a4b1741543e54dba29c63628244127792cbc9fa236f91",
        width: 8,
        height: 4,
        format: "rgba8unorm",
        type: "equirect",
        colorSpace: "srgb",
      },
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
    expect(Object.isFrozen(preset)).toBe(true);
    expect(Object.isFrozen(preset.lighting)).toBe(true);
    expect(Object.isFrozen(preset.reflection)).toBe(true);
    expect(Object.isFrozen(preset.weather)).toBe(true);
    expect(Object.isFrozen(preset.atmosphere)).toBe(true);
    expect(() => {
      (preset.weather as { rainIntensity: number }).rainIntensity = 1;
    }).toThrow(TypeError);
  });

  it("creates an authored snapshot with a deterministic content hash", () => {
    const reference = createReferenceEnvironmentPreset();
    const snapshot: EnvironmentPresetSnapshot = {
      lighting: {
        ...reference.lighting,
        sunIntensity: 1.25,
        environmentIntensity: 0.9,
      },
      reflection: { ...reference.reflection },
      weather: {
        windDirectionX: -0.6,
        windDirectionZ: 0.8,
        windStrength: 0.75,
        gustStrength: 0.25,
        rainIntensity: 0.1,
      },
      atmosphere: {
        cloudCoverage: 0.25,
        cloudShadowStrength: 0.3,
        horizonHaze: 0.2,
      },
    };

    const authored = createAuthoredEnvironmentPreset("blue-noon", snapshot);

    expect(authored).toEqual({
      schema: ENVIRONMENT_PRESET_SCHEMA,
      version: 1,
      id: "blue-noon",
      presetHash:
        "sha256:0b82c5abc7cc3ed5bd888e2d16d52125d8d0ef64a4df1f333020bc0d2c5a1590",
      ...snapshot,
    });
    expect(Object.isFrozen(authored)).toBe(true);
    expect(Object.isFrozen(authored.lighting)).toBe(true);
    expect(authored.lighting).not.toBe(snapshot.lighting);
    expect(authored.reflection).not.toBe(snapshot.reflection);
  });

  it("normalizes imported current-version JSON into a deeply immutable copy", () => {
    const imported = structuredClone(createReferenceEnvironmentPreset());

    const normalized = normalizeEnvironmentPreset(imported);

    expect(normalized).toEqual(imported);
    expect(normalized).not.toBe(imported);
    expect(normalized.lighting).not.toBe(imported.lighting);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.atmosphere)).toBe(true);
    expect(() =>
      normalizeEnvironmentPreset({
        ...imported,
        weather: { ...imported.weather, rainIntensity: 0.5 },
      }),
    ).toThrow("The Environment Preset content hash does not match.");
    expect(() =>
      normalizeEnvironmentPreset({
        ...imported,
        presetHash: `sha256:${"0".repeat(64)}`,
      }),
    ).toThrow("The Environment Preset content hash does not match.");
  });

  it("exposes immutable Environment Preset identity evidence", () => {
    const preset = createReferenceEnvironmentPreset();

    const identity = environmentPresetIdentity(preset);

    expect(identity).toEqual({
      schema: ENVIRONMENT_PRESET_SCHEMA,
      version: ENVIRONMENT_PRESET_VERSION,
      id: "reference",
      presetHash:
        "sha256:944a777311b8e46b986d3b4f6798595adcc99e3b5a7d49adf25cfa69c42bdc24",
    });
    expect(Object.isFrozen(identity)).toBe(true);
  });

  it("migrates only the current version as a strict no-op", () => {
    const current = structuredClone(createReferenceEnvironmentPreset());

    const migrated = migrateEnvironmentPreset(current);

    expect(migrated).toEqual(current);
    expect(migrated).not.toBe(current);
    expect(Object.isFrozen(migrated)).toBe(true);
    for (const version of [0, 2]) {
      expect(() => migrateEnvironmentPreset({ ...current, version })).toThrow(
        "The Environment Preset version cannot be migrated.",
      );
    }
    expect(() =>
      migrateEnvironmentPreset({
        schema: ENVIRONMENT_PRESET_SCHEMA,
        version: 0,
        id: "legacy",
      }),
    ).toThrow("The Environment Preset version cannot be migrated.");
  });

  it("rejects unexpected preset and snapshot keys, including resource handles and URLs", () => {
    const reference = createReferenceEnvironmentPreset();
    const snapshot: EnvironmentPresetSnapshot = {
      lighting: reference.lighting,
      reflection: reference.reflection,
      weather: reference.weather,
      atmosphere: reference.atmosphere,
    };

    expect(() =>
      normalizeEnvironmentPreset({
        ...reference,
        url: "https://example.invalid/environment.hdr",
      } as unknown as typeof reference),
    ).toThrow();

    for (const candidate of [
      {
        ...snapshot,
        lighting: { ...snapshot.lighting, colorTemperature: 6_500 },
      },
      {
        ...snapshot,
        reflection: {
          ...snapshot.reflection,
          texture: { isTexture: true },
        },
      },
      {
        ...snapshot,
        weather: {
          ...snapshot.weather,
          url: "https://example.invalid/forecast",
        },
      },
      {
        ...snapshot,
        atmosphere: { ...snapshot.atmosphere, dom: { nodeType: 1 } },
      },
    ]) {
      expect(() =>
        createAuthoredEnvironmentPreset(
          "unsafe",
          candidate as EnvironmentPresetSnapshot,
        ),
      ).toThrow();
    }
  });

  it.each([
    ["empty id", "", {}],
    ["URL-like id", "https://example.invalid/preset", {}],
    ["non-finite sun", "invalid-sun", { lighting: { sunIntensity: Infinity } }],
    ["negative sun color", "invalid-color", { lighting: { sunColorR: -0.1 } }],
    [
      "zero sun direction",
      "invalid-direction",
      {
        lighting: { sunDirectionX: 0, sunDirectionY: 0, sunDirectionZ: 0 },
      },
    ],
    [
      "out-of-range angular radius",
      "invalid-radius",
      { lighting: { sunAngularRadiusRadians: Math.PI + 0.01 } },
    ],
    [
      "invalid reflection hash",
      "invalid-hash",
      { reflection: { fingerprint: "sha256:no" } },
    ],
    [
      "fractional reflection size",
      "invalid-size",
      { reflection: { width: 8.5 } },
    ],
    [
      "URL reflection identity",
      "invalid-reflection",
      { reflection: { identity: "https://example.invalid/sky" } },
    ],
    [
      "unsupported reflection type",
      "invalid-layout",
      { reflection: { type: "cube" } },
    ],
    [
      "zero wind direction",
      "invalid-wind",
      { weather: { windDirectionX: 0, windDirectionZ: 0 } },
    ],
    ["out-of-range gust", "invalid-gust", { weather: { gustStrength: 4.01 } }],
    [
      "out-of-range rain",
      "invalid-rain",
      { weather: { rainIntensity: -0.01 } },
    ],
    [
      "non-finite cloud cover",
      "invalid-cloud",
      { atmosphere: { cloudCoverage: Number.NaN } },
    ],
    [
      "out-of-range haze",
      "invalid-haze",
      { atmosphere: { horizonHaze: 1.01 } },
    ],
  ] as const)("rejects %s", (_name, id, changes) => {
    const reference = createReferenceEnvironmentPreset();
    const snapshot = {
      lighting: { ...reference.lighting, ...changes.lighting },
      reflection: { ...reference.reflection, ...changes.reflection },
      weather: { ...reference.weather, ...changes.weather },
      atmosphere: { ...reference.atmosphere, ...changes.atmosphere },
    };

    expect(() =>
      createAuthoredEnvironmentPreset(
        id,
        snapshot as unknown as EnvironmentPresetSnapshot,
      ),
    ).toThrow();
  });
});
