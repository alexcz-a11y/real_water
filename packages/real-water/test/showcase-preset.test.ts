import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  QUALITY_PROFILE_SCHEMA,
  QUALITY_PROFILE_VERSION,
  createMinimalWaterQualityProfile,
  qualityProfileIdentity,
} from "../src/quality-profile.js";
import {
  WATER_PRESET_SCHEMA,
  WATER_PRESET_VERSION,
  createWaterPreset,
  waterPresetIdentity,
} from "../src/water-preset.js";
import {
  ENVIRONMENT_PRESET_SCHEMA,
  ENVIRONMENT_PRESET_VERSION,
  createReferenceEnvironmentPreset,
  environmentPresetIdentity,
} from "../src/environment-preset.js";
import {
  SHOWCASE_PRESET_SCHEMA,
  SHOWCASE_PRESET_VERSION,
  createAuthoredShowcasePreset,
  createReferenceShowcasePreset,
  migrateShowcasePreset,
  normalizeShowcasePreset,
  showcasePresetIdentity,
  type ShowcasePreset,
  type ShowcasePresetAuthoring,
} from "../src/showcase-preset.js";

function createAuthoring(): ShowcasePresetAuthoring {
  return {
    id: "storm-orbit",
    durationTicks: 180,
    waterPreset: waterPresetIdentity(createWaterPreset("storm")),
    environmentPreset: environmentPresetIdentity(
      createReferenceEnvironmentPreset(),
    ),
    qualityProfile: qualityProfileIdentity(
      createMinimalWaterQualityProfile("minimal-high-detail"),
    ),
    cameraTimeline: [
      {
        tick: 0,
        position: [16, 8, 24],
        target: [0, 1, 0],
        verticalFovDegrees: 50,
      },
      {
        tick: 90,
        position: [-12, 5, 18],
        target: [2, 0, -4],
        verticalFovDegrees: 44,
      },
      {
        tick: 180,
        position: [16, 8, 24],
        target: [0, 1, 0],
        verticalFovDegrees: 50,
      },
    ],
    eventTimeline: [
      { tick: 30, id: "bow-impact" },
      { tick: 120, id: "hero-breaker" },
    ],
  };
}

function expectedContentHash(preset: ShowcasePreset): string {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        schema: preset.schema,
        version: preset.version,
        id: preset.id,
        durationTicks: preset.durationTicks,
        waterPreset: preset.waterPreset,
        environmentPreset: preset.environmentPreset,
        qualityProfile: preset.qualityProfile,
        cameraTimeline: preset.cameraTimeline,
        eventTimeline: preset.eventTimeline,
      }),
    )
    .digest("hex")}`;
}

describe("Showcase Presets", () => {
  it("authors a content-addressed deterministic presentation recipe", () => {
    const preset = createAuthoredShowcasePreset(createAuthoring());

    expect(SHOWCASE_PRESET_VERSION).toBe(1);
    expect(preset).toMatchObject({
      schema: SHOWCASE_PRESET_SCHEMA,
      version: 1,
      id: "storm-orbit",
      durationTicks: 180,
      waterPreset: {
        schema: WATER_PRESET_SCHEMA,
        version: WATER_PRESET_VERSION,
        id: "storm",
      },
      environmentPreset: {
        schema: ENVIRONMENT_PRESET_SCHEMA,
        version: ENVIRONMENT_PRESET_VERSION,
        id: "reference",
      },
      qualityProfile: {
        schema: QUALITY_PROFILE_SCHEMA,
        version: QUALITY_PROFILE_VERSION,
        id: "minimal-high-detail",
      },
    });
    expect(preset.presetHash).toBe(expectedContentHash(preset));
    expect(Object.isFrozen(preset)).toBe(true);
    expect(Object.isFrozen(preset.waterPreset)).toBe(true);
    expect(Object.isFrozen(preset.environmentPreset)).toBe(true);
    expect(Object.isFrozen(preset.qualityProfile)).toBe(true);
    expect(Object.isFrozen(preset.cameraTimeline)).toBe(true);
    expect(Object.isFrozen(preset.cameraTimeline[0])).toBe(true);
    expect(Object.isFrozen(preset.cameraTimeline[0]?.position)).toBe(true);
    expect(Object.isFrozen(preset.cameraTimeline[0]?.target)).toBe(true);
    expect(Object.isFrozen(preset.eventTimeline)).toBe(true);
    expect(Object.isFrozen(preset.eventTimeline[0])).toBe(true);
  });

  it("restores one deterministic approximately 90-second reference loop", () => {
    const first = createReferenceShowcasePreset();
    const second = createReferenceShowcasePreset();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.id).toBe("reference-loop");
    expect(first.durationTicks).toBe(5_400);
    expect(first.waterPreset).toEqual(
      waterPresetIdentity(createWaterPreset("swell")),
    );
    expect(first.environmentPreset).toEqual(
      environmentPresetIdentity(createReferenceEnvironmentPreset()),
    );
    expect(first.qualityProfile).toEqual(
      qualityProfileIdentity(createMinimalWaterQualityProfile()),
    );
    expect(first.cameraTimeline[0]?.tick).toBe(0);
    expect(first.cameraTimeline.at(-1)?.tick).toBe(first.durationTicks);
    expect(first.eventTimeline.map(({ id }) => id)).toEqual([
      "showcase-start",
      "hero-breaker",
      "weather-front",
    ]);
    expect(first.presetHash).toBe(expectedContentHash(first));
  });

  it("normalizes, identifies, and current-migrates without semantic changes", () => {
    const candidate = structuredClone(
      createAuthoredShowcasePreset(createAuthoring()),
    );
    const normalized = normalizeShowcasePreset(candidate);
    const migrated = migrateShowcasePreset(candidate);
    const identity = showcasePresetIdentity(normalized);

    expect(normalized).toEqual(candidate);
    expect(normalized).not.toBe(candidate);
    expect(migrated).toEqual(candidate);
    expect(migrated).not.toBe(candidate);
    expect(identity).toEqual({
      schema: SHOWCASE_PRESET_SCHEMA,
      version: SHOWCASE_PRESET_VERSION,
      id: candidate.id,
      presetHash: candidate.presetHash,
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(migrated)).toBe(true);
    expect(Object.isFrozen(identity)).toBe(true);
  });

  it.each([
    [
      "an unknown top-level field",
      (preset: ShowcasePreset) => ({ ...preset, playbackRate: 1 }),
    ],
    [
      "an unknown camera field",
      (preset: ShowcasePreset) => ({
        ...preset,
        cameraTimeline: [
          { ...preset.cameraTimeline[0], easing: "linear" },
          ...preset.cameraTimeline.slice(1),
        ],
      }),
    ],
    [
      "an unknown event field",
      (preset: ShowcasePreset) => ({
        ...preset,
        eventTimeline: [
          { ...preset.eventTimeline[0], payload: {} },
          ...preset.eventTimeline.slice(1),
        ],
      }),
    ],
    [
      "an unknown identity field",
      (preset: ShowcasePreset) => ({
        ...preset,
        waterPreset: { ...preset.waterPreset, name: "Storm" },
      }),
    ],
    [
      "a future schema version",
      (preset: ShowcasePreset) => ({ ...preset, version: 2 }),
    ],
    [
      "a mismatched identity schema",
      (preset: ShowcasePreset) => ({
        ...preset,
        environmentPreset: {
          ...preset.environmentPreset,
          schema: "real-water/environment-preset-drift",
        },
      }),
    ],
    [
      "a malformed identity hash",
      (preset: ShowcasePreset) => ({
        ...preset,
        qualityProfile: {
          ...preset.qualityProfile,
          profileHash: "quality-profile-latest",
        },
      }),
    ],
    [
      "a stale content hash",
      (preset: ShowcasePreset) => ({
        ...preset,
        presetHash: `sha256:${"0".repeat(64)}`,
      }),
    ],
  ])("fails closed on %s", (_name, mutate) => {
    const candidate = mutate(createAuthoredShowcasePreset(createAuthoring()));

    expect(() =>
      normalizeShowcasePreset(candidate as unknown as ShowcasePreset),
    ).toThrow(TypeError);
  });

  it.each([
    [
      "unsafe duration",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        durationTicks: Number.MAX_SAFE_INTEGER + 1,
      }),
    ],
    [
      "negative camera tick",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        cameraTimeline: [
          { ...input.cameraTimeline[0], tick: -1 },
          ...input.cameraTimeline.slice(1),
        ],
      }),
    ],
    [
      "fractional event tick",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        eventTimeline: [
          { ...input.eventTimeline[0], tick: 30.5 },
          ...input.eventTimeline.slice(1),
        ],
      }),
    ],
    [
      "out-of-order camera ticks",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        cameraTimeline: [
          input.cameraTimeline[1],
          input.cameraTimeline[0],
          input.cameraTimeline[2],
        ],
      }),
    ],
    [
      "out-of-order event ticks",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        eventTimeline: [...input.eventTimeline].reverse(),
      }),
    ],
    [
      "a camera tick beyond the duration",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        cameraTimeline: [
          ...input.cameraTimeline,
          { ...input.cameraTimeline[0], tick: input.durationTicks + 1 },
        ],
      }),
    ],
    [
      "an event tick beyond the duration",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        eventTimeline: [
          ...input.eventTimeline,
          { tick: input.durationTicks + 1, id: "late-event" },
        ],
      }),
    ],
    [
      "a non-finite camera component",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        cameraTimeline: [
          {
            ...input.cameraTimeline[0],
            position: [0, Number.NaN, 0],
          },
          ...input.cameraTimeline.slice(1),
        ],
      }),
    ],
    [
      "a non-finite FOV",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        cameraTimeline: [
          {
            ...input.cameraTimeline[0],
            verticalFovDegrees: Number.POSITIVE_INFINITY,
          },
          ...input.cameraTimeline.slice(1),
        ],
      }),
    ],
    [
      "an empty event id",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        eventTimeline: [
          { ...input.eventTimeline[0], id: "" },
          ...input.eventTimeline.slice(1),
        ],
      }),
    ],
    [
      "a duplicate event id",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        eventTimeline: [
          input.eventTimeline[0],
          { ...input.eventTimeline[1], id: input.eventTimeline[0]?.id },
        ],
      }),
    ],
  ])("rejects %s", (_name, mutate) => {
    const candidate = mutate(createAuthoring());

    expect(() =>
      createAuthoredShowcasePreset(
        candidate as unknown as ShowcasePresetAuthoring,
      ),
    ).toThrow(TypeError);
  });
});
