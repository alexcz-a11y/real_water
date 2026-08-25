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
  createBlueNoonEnvironmentPreset,
  createCalmSunriseEnvironmentPreset,
  createReferenceEnvironmentPreset,
  createStormFrontEnvironmentPreset,
  environmentPresetIdentity,
} from "../src/environment-preset.js";
import {
  REFERENCE_SHOWCASE_SEED,
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
    seed: 0x1020_3040,
    waterPreset: waterPresetIdentity(createWaterPreset("storm")),
    environmentPreset: environmentPresetIdentity(
      createReferenceEnvironmentPreset(),
    ),
    qualityProfile: qualityProfileIdentity(
      createMinimalWaterQualityProfile("minimal-high-detail"),
    ),
    stormFront: {
      eventId: "weather-front",
      heroBreakerEventId: "storm-front-hero-breaker",
      waterPreset: waterPresetIdentity(createWaterPreset("storm")),
      environmentPreset: environmentPresetIdentity(
        createStormFrontEnvironmentPreset(),
      ),
    },
    lookTimeline: [
      {
        tick: 0,
        id: "base",
        waterPreset: waterPresetIdentity(createWaterPreset("storm")),
        environmentPreset: environmentPresetIdentity(
          createReferenceEnvironmentPreset(),
        ),
      },
      {
        tick: 120,
        id: "storm-front",
        waterPreset: waterPresetIdentity(createWaterPreset("storm")),
        environmentPreset: environmentPresetIdentity(
          createStormFrontEnvironmentPreset(),
        ),
      },
      {
        tick: 180,
        id: "base",
        waterPreset: waterPresetIdentity(createWaterPreset("storm")),
        environmentPreset: environmentPresetIdentity(
          createReferenceEnvironmentPreset(),
        ),
      },
    ],
    bodyTimeline: [
      {
        tick: 0,
        bodyId: "reference-proxy-vessel",
        throttle: 0.25,
        steering: -0.5,
      },
      {
        tick: 180,
        bodyId: "reference-proxy-vessel",
        throttle: 0,
        steering: 0,
      },
    ],
    cameraTimeline: [
      {
        tick: 0,
        position: [16, 8, 24],
        target: [0, 1, 0],
        verticalFovDegrees: 50,
      },
      {
        tick: 120,
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
      { tick: 120, id: "weather-front" },
      { tick: 120, id: "storm-front-hero-breaker" },
    ],
    captureTimeline: [
      { id: "opening", tick: 0, captureNames: ["final-color"] },
      {
        id: "storm",
        tick: 120,
        captureNames: ["final-color", "storm-lightning"],
      },
      { id: "loop", tick: 180, captureNames: ["final-color"] },
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
        seed: preset.seed,
        waterPreset: preset.waterPreset,
        environmentPreset: preset.environmentPreset,
        qualityProfile: preset.qualityProfile,
        stormFront: preset.stormFront,
        lookTimeline: preset.lookTimeline,
        bodyTimeline: preset.bodyTimeline,
        cameraTimeline: preset.cameraTimeline,
        eventTimeline: preset.eventTimeline,
        captureTimeline: preset.captureTimeline,
      }),
    )
    .digest("hex")}`;
}

function createVersionTwoPreset(
  authoring: ShowcasePresetAuthoring,
): Record<string, unknown> {
  const legacyContent = {
    schema: SHOWCASE_PRESET_SCHEMA,
    version: 2,
    id: authoring.id,
    durationTicks: authoring.durationTicks,
    waterPreset: authoring.waterPreset,
    environmentPreset: authoring.environmentPreset,
    qualityProfile: authoring.qualityProfile,
    stormFront: authoring.stormFront,
    cameraTimeline: authoring.cameraTimeline,
    eventTimeline: authoring.eventTimeline,
  };
  return {
    ...legacyContent,
    presetHash: `sha256:${createHash("sha256")
      .update(JSON.stringify(legacyContent))
      .digest("hex")}`,
  };
}

describe("Showcase Presets", () => {
  it("authors a content-addressed deterministic presentation recipe", () => {
    const preset = createAuthoredShowcasePreset(createAuthoring());

    expect(SHOWCASE_PRESET_VERSION).toBe(3);
    expect(preset).toMatchObject({
      schema: SHOWCASE_PRESET_SCHEMA,
      version: 3,
      id: "storm-orbit",
      durationTicks: 180,
      seed: 0x1020_3040,
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
      stormFront: {
        eventId: "weather-front",
        heroBreakerEventId: "storm-front-hero-breaker",
        waterPreset: {
          schema: WATER_PRESET_SCHEMA,
          version: WATER_PRESET_VERSION,
          id: "storm",
        },
        environmentPreset: {
          schema: ENVIRONMENT_PRESET_SCHEMA,
          version: ENVIRONMENT_PRESET_VERSION,
          id: "storm-front",
        },
      },
    });
    expect(preset.presetHash).toBe(expectedContentHash(preset));
    expect(Object.isFrozen(preset)).toBe(true);
    expect(Object.isFrozen(preset.waterPreset)).toBe(true);
    expect(Object.isFrozen(preset.environmentPreset)).toBe(true);
    expect(Object.isFrozen(preset.qualityProfile)).toBe(true);
    expect(Object.isFrozen(preset.stormFront)).toBe(true);
    expect(Object.isFrozen(preset.stormFront.waterPreset)).toBe(true);
    expect(Object.isFrozen(preset.stormFront.environmentPreset)).toBe(true);
    expect(Object.isFrozen(preset.lookTimeline)).toBe(true);
    expect(Object.isFrozen(preset.lookTimeline[0])).toBe(true);
    expect(Object.isFrozen(preset.lookTimeline[0]?.waterPreset)).toBe(true);
    expect(Object.isFrozen(preset.lookTimeline[0]?.environmentPreset)).toBe(
      true,
    );
    expect(Object.isFrozen(preset.bodyTimeline)).toBe(true);
    expect(Object.isFrozen(preset.bodyTimeline[0])).toBe(true);
    expect(Object.isFrozen(preset.cameraTimeline)).toBe(true);
    expect(Object.isFrozen(preset.cameraTimeline[0])).toBe(true);
    expect(Object.isFrozen(preset.cameraTimeline[0]?.position)).toBe(true);
    expect(Object.isFrozen(preset.cameraTimeline[0]?.target)).toBe(true);
    expect(Object.isFrozen(preset.eventTimeline)).toBe(true);
    expect(Object.isFrozen(preset.eventTimeline[0])).toBe(true);
    expect(Object.isFrozen(preset.captureTimeline)).toBe(true);
    expect(Object.isFrozen(preset.captureTimeline[0])).toBe(true);
    expect(Object.isFrozen(preset.captureTimeline[0]?.captureNames)).toBe(true);
  });

  it("includes capture points in the Showcase content identity", () => {
    const authoring = createAuthoring();
    const baseline = createAuthoredShowcasePreset(authoring);
    const changed = createAuthoredShowcasePreset({
      ...authoring,
      captureTimeline: authoring.captureTimeline.map((point) =>
        point.id === "storm"
          ? { ...point, captureNames: [...point.captureNames, "depth"] }
          : point,
      ),
    });

    expect(changed.presetHash).not.toBe(baseline.presetHash);
    expect(changed.presetHash).toBe(expectedContentHash(changed));
  });

  it("preserves different same-tick look ids in last-wins execution order", () => {
    const authoring = createAuthoring();
    const initialLook = authoring.lookTimeline[0];
    const stormLook = authoring.lookTimeline[1];
    const finalLook = authoring.lookTimeline[2];
    if (
      initialLook === undefined ||
      stormLook === undefined ||
      finalLook === undefined
    ) {
      throw new Error("The test Showcase authoring is incomplete.");
    }
    const preset = createAuthoredShowcasePreset({
      ...authoring,
      lookTimeline: [
        initialLook,
        {
          tick: 120,
          id: "storm-approach",
          waterPreset: authoring.waterPreset,
          environmentPreset: authoring.environmentPreset,
        },
        stormLook,
        finalLook,
      ],
    });

    expect(
      preset.lookTimeline
        .filter(({ tick }) => tick === 120)
        .map(({ id }) => id),
    ).toEqual(["storm-approach", "storm-front"]);
    expect(preset.lookTimeline[2]?.waterPreset).toEqual(
      preset.stormFront.waterPreset,
    );
    expect(preset.lookTimeline[2]?.environmentPreset).toEqual(
      preset.stormFront.environmentPreset,
    );
  });

  it("restores one deterministic approximately 90-second reference loop", () => {
    const first = createReferenceShowcasePreset();
    const second = createReferenceShowcasePreset();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.id).toBe("reference-loop");
    expect(first.durationTicks).toBe(5_400);
    expect(first.durationTicks / 60).toBe(90);
    expect(REFERENCE_SHOWCASE_SEED).toBe(0x5eed_0025);
    expect(first.seed).toBe(REFERENCE_SHOWCASE_SEED);
    expect(first.waterPreset).toEqual(
      waterPresetIdentity(createWaterPreset("calm")),
    );
    expect(first.environmentPreset).toEqual(
      environmentPresetIdentity(createCalmSunriseEnvironmentPreset()),
    );
    expect(first.qualityProfile).toEqual(
      qualityProfileIdentity(createMinimalWaterQualityProfile()),
    );
    expect(first.stormFront).toEqual({
      eventId: "weather-front",
      heroBreakerEventId: "storm-front-hero-breaker",
      waterPreset: waterPresetIdentity(createWaterPreset("storm")),
      environmentPreset: environmentPresetIdentity(
        createStormFrontEnvironmentPreset(),
      ),
    });
    expect(first.lookTimeline).toEqual([
      {
        tick: 0,
        id: "calm-sunrise",
        waterPreset: waterPresetIdentity(createWaterPreset("calm")),
        environmentPreset: environmentPresetIdentity(
          createCalmSunriseEnvironmentPreset(),
        ),
      },
      {
        tick: 1_800,
        id: "blue-noon-swell",
        waterPreset: waterPresetIdentity(createWaterPreset("swell")),
        environmentPreset: environmentPresetIdentity(
          createBlueNoonEnvironmentPreset(),
        ),
      },
      {
        tick: 3_600,
        id: "storm-front",
        waterPreset: first.stormFront.waterPreset,
        environmentPreset: first.stormFront.environmentPreset,
      },
      {
        tick: 5_400,
        id: "calm-sunrise",
        waterPreset: first.waterPreset,
        environmentPreset: first.environmentPreset,
      },
    ]);
    expect(new Set(first.lookTimeline.map(({ id }) => id))).toEqual(
      new Set(["calm-sunrise", "blue-noon-swell", "storm-front"]),
    );
    expect(first.bodyTimeline).toEqual([
      {
        tick: 0,
        bodyId: "reference-proxy-vessel",
        throttle: 0.45,
        steering: 0,
      },
      {
        tick: 1_800,
        bodyId: "reference-proxy-vessel",
        throttle: 0.7,
        steering: 0.18,
      },
      {
        tick: 3_600,
        bodyId: "reference-proxy-vessel",
        throttle: 0.9,
        steering: -0.22,
      },
      {
        tick: 5_400,
        bodyId: "reference-proxy-vessel",
        throttle: 0.45,
        steering: 0,
      },
    ]);
    expect(first.cameraTimeline[0]?.tick).toBe(0);
    expect(first.cameraTimeline.at(-1)?.tick).toBe(first.durationTicks);
    expect(first.eventTimeline.map(({ id }) => id)).toEqual([
      "showcase-start",
      "hero-breaker",
      "weather-front",
      "storm-front-hero-breaker",
    ]);
    expect(first.captureTimeline).toEqual([
      {
        id: "calm-sunrise",
        tick: 0,
        captureNames: ["final-color", "depth", "normal"],
      },
      {
        id: "calm-stability",
        tick: 120,
        captureNames: ["final-color"],
      },
      {
        id: "blue-noon-swell",
        tick: 1_800,
        captureNames: [
          "final-color",
          "depth",
          "normal",
          "hero-breaker-foam",
          "underwater-caustics",
          "underwater-particles",
          "underwater-bubbles",
          "lens-wetness",
        ],
      },
      {
        id: "storm-front",
        tick: 3_600,
        captureNames: [
          "final-color",
          "hero-breaker-foam",
          "storm-rain-ripples",
          "storm-aerosol",
          "storm-cloud-shadow",
          "storm-lightning",
        ],
      },
      {
        id: "loop-reset",
        tick: 5_400,
        captureNames: ["final-color"],
      },
    ]);
    expect(first.presetHash).toBe(
      "sha256:ad213eed70ccab18c0c37b80e6fe90c50d3f26bcec4e4e7a0fc21f445a33ca54",
    );
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

  it("migrates any valid version-two recipe with deterministic defaults", () => {
    const authoring = createAuthoring();
    const legacy = createVersionTwoPreset(authoring);

    const migrated = migrateShowcasePreset(legacy);

    expect(migrated.version).toBe(3);
    expect(migrated.seed).toBe(0);
    expect(migrated.lookTimeline).toEqual([
      {
        tick: 0,
        id: "base",
        waterPreset: authoring.waterPreset,
        environmentPreset: authoring.environmentPreset,
      },
      {
        tick: 120,
        id: "storm-front",
        waterPreset: authoring.stormFront.waterPreset,
        environmentPreset: authoring.stormFront.environmentPreset,
      },
      {
        tick: 180,
        id: "base",
        waterPreset: authoring.waterPreset,
        environmentPreset: authoring.environmentPreset,
      },
    ]);
    expect(migrated.bodyTimeline).toEqual([
      {
        tick: 0,
        bodyId: "reference-proxy-vessel",
        throttle: 0,
        steering: 0,
      },
      {
        tick: 180,
        bodyId: "reference-proxy-vessel",
        throttle: 0,
        steering: 0,
      },
    ]);
    expect(migrated.cameraTimeline).toEqual(authoring.cameraTimeline);
    expect(migrated.eventTimeline).toEqual(authoring.eventTimeline);
    expect(migrated.captureTimeline).toEqual([
      { id: "legacy-start", tick: 0, captureNames: ["final-color"] },
      { id: "legacy-storm", tick: 120, captureNames: ["final-color"] },
      { id: "legacy-loop", tick: 180, captureNames: ["final-color"] },
    ]);
    expect(migrated.presetHash).toBe(expectedContentHash(migrated));
    expect(Object.isFrozen(migrated.lookTimeline[0])).toBe(true);
    expect(Object.isFrozen(migrated.bodyTimeline[0])).toBe(true);
  });

  it.each([0, 180])(
    "migrates a valid v2 Storm segment at endpoint tick %i in last-wins order",
    (stormTick) => {
      const authoring = createAuthoring();
      const otherEvents = authoring.eventTimeline.filter(
        ({ id }) =>
          id !== authoring.stormFront.eventId &&
          id !== authoring.stormFront.heroBreakerEventId,
      );
      const stormEvents = [
        { tick: stormTick, id: authoring.stormFront.eventId },
        { tick: stormTick, id: authoring.stormFront.heroBreakerEventId },
      ];
      const eventTimeline = [...otherEvents, ...stormEvents].sort(
        (left, right) => left.tick - right.tick,
      );

      const migrated = migrateShowcasePreset(
        createVersionTwoPreset({ ...authoring, eventTimeline }),
      );

      expect(
        migrated.lookTimeline.map(({ tick, id }) => ({ tick, id })),
      ).toEqual(
        stormTick === 0
          ? [
              { tick: 0, id: "base" },
              { tick: 0, id: "storm-front" },
              { tick: 180, id: "base" },
            ]
          : [
              { tick: 0, id: "base" },
              { tick: 180, id: "storm-front" },
              { tick: 180, id: "base" },
            ],
      );
      expect(migrated.captureTimeline).toEqual([
        { id: "legacy-start", tick: 0, captureNames: ["final-color"] },
        { id: "legacy-loop", tick: 180, captureNames: ["final-color"] },
      ]);
    },
  );

  it("migrates the complete committed version-one Reference recipe through v3", () => {
    const reference = createReferenceShowcasePreset();
    const legacyWater = waterPresetIdentity(createWaterPreset("swell"));
    const legacyContent = {
      schema: SHOWCASE_PRESET_SCHEMA,
      version: 1,
      id: reference.id,
      durationTicks: reference.durationTicks,
      waterPreset: legacyWater,
      environmentPreset: {
        schema: ENVIRONMENT_PRESET_SCHEMA,
        version: 1,
        id: "reference",
        presetHash:
          "sha256:944a777311b8e46b986d3b4f6798595adcc99e3b5a7d49adf25cfa69c42bdc24",
      },
      qualityProfile: {
        schema: QUALITY_PROFILE_SCHEMA,
        version: 14,
        id: "minimal",
        profileHash:
          "sha256:9fb629031064c5718584b77355748965e9cfafe11cba7e3f4675eedf715cd684",
      },
      cameraTimeline: reference.cameraTimeline,
      eventTimeline: reference.eventTimeline.filter(
        ({ id }) => id !== "storm-front-hero-breaker",
      ),
    };
    const legacy = {
      ...legacyContent,
      presetHash: `sha256:${createHash("sha256")
        .update(JSON.stringify(legacyContent))
        .digest("hex")}`,
    };
    expect(legacy.presetHash).toBe(
      "sha256:aa473df87dd254e533abe7202210991197323d15be68198dd34b33ab8eb5ffd0",
    );
    const migrated = migrateShowcasePreset(legacy);
    expect(migrated.version).toBe(3);
    expect(migrated.seed).toBe(0);
    expect(migrated.waterPreset).toEqual(legacyWater);
    expect(migrated.environmentPreset).toEqual(
      environmentPresetIdentity(createReferenceEnvironmentPreset()),
    );
    expect(migrated.lookTimeline).toEqual([
      {
        tick: 0,
        id: "base",
        waterPreset: legacyWater,
        environmentPreset: migrated.environmentPreset,
      },
      {
        tick: 3_600,
        id: "storm-front",
        waterPreset: migrated.stormFront.waterPreset,
        environmentPreset: migrated.stormFront.environmentPreset,
      },
      {
        tick: 5_400,
        id: "base",
        waterPreset: legacyWater,
        environmentPreset: migrated.environmentPreset,
      },
    ]);
    expect(migrated.bodyTimeline).toEqual([
      {
        tick: 0,
        bodyId: "reference-proxy-vessel",
        throttle: 0,
        steering: 0,
      },
      {
        tick: 5_400,
        bodyId: "reference-proxy-vessel",
        throttle: 0,
        steering: 0,
      },
    ]);
    expect(migrated.eventTimeline.map(({ id }) => id)).toEqual([
      "showcase-start",
      "hero-breaker",
      "weather-front",
      "storm-front-hero-breaker",
    ]);
    expect(migrated.captureTimeline).toEqual([
      { id: "legacy-start", tick: 0, captureNames: ["final-color"] },
      {
        id: "legacy-storm",
        tick: 3_600,
        captureNames: ["final-color"],
      },
      { id: "legacy-loop", tick: 5_400, captureNames: ["final-color"] },
    ]);
  });

  it("rejects malformed, tampered, and unsupported Showcase migration inputs", () => {
    const legacy = createVersionTwoPreset(createAuthoring());

    expect(() =>
      migrateShowcasePreset({
        ...legacy,
        presetHash: `sha256:${"0".repeat(64)}`,
      }),
    ).toThrow(TypeError);
    expect(() =>
      migrateShowcasePreset({ ...legacy, lookTimeline: [] }),
    ).toThrow(TypeError);
    for (const version of [0, 4]) {
      expect(() => migrateShowcasePreset({ ...legacy, version })).toThrow(
        TypeError,
      );
    }
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
      "an unknown capture point field",
      (preset: ShowcasePreset) => ({
        ...preset,
        captureTimeline: [
          { ...preset.captureTimeline[0], label: "Opening" },
          ...preset.captureTimeline.slice(1),
        ],
      }),
    ],
    [
      "a missing capture timeline",
      (preset: ShowcasePreset) => {
        const candidate: Record<string, unknown> = { ...preset };
        Reflect.deleteProperty(candidate, "captureTimeline");
        return candidate;
      },
    ],
    [
      "an unknown look field",
      (preset: ShowcasePreset) => ({
        ...preset,
        lookTimeline: [
          { ...preset.lookTimeline[0], transition: "cut" },
          ...preset.lookTimeline.slice(1),
        ],
      }),
    ],
    [
      "an unknown body field",
      (preset: ShowcasePreset) => ({
        ...preset,
        bodyTimeline: [
          { ...preset.bodyTimeline[0], brake: 0 },
          ...preset.bodyTimeline.slice(1),
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
      "an unknown Storm Front field",
      (preset: ShowcasePreset) => ({
        ...preset,
        stormFront: { ...preset.stormFront, lightningPeriodTicks: 600 },
      }),
    ],
    [
      "a future schema version",
      (preset: ShowcasePreset) => ({ ...preset, version: 4 }),
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
      "a negative seed",
      (input: ShowcasePresetAuthoring) => ({ ...input, seed: -1 }),
    ],
    [
      "an empty capture timeline",
      (input: ShowcasePresetAuthoring) => ({ ...input, captureTimeline: [] }),
    ],
    [
      "out-of-order capture ticks",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        captureTimeline: [...input.captureTimeline].reverse(),
      }),
    ],
    [
      "a duplicate capture point id",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        captureTimeline: [
          input.captureTimeline[0],
          { ...input.captureTimeline[1], id: input.captureTimeline[0]?.id },
          input.captureTimeline[2],
        ],
      }),
    ],
    [
      "an empty capture point id",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        captureTimeline: [
          { ...input.captureTimeline[0], id: "" },
          ...input.captureTimeline.slice(1),
        ],
      }),
    ],
    [
      "an empty capture set",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        captureTimeline: [
          { ...input.captureTimeline[0], captureNames: [] },
          ...input.captureTimeline.slice(1),
        ],
      }),
    ],
    [
      "an empty capture name",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        captureTimeline: [
          { ...input.captureTimeline[0], captureNames: [""] },
          ...input.captureTimeline.slice(1),
        ],
      }),
    ],
    [
      "a duplicate capture name",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        captureTimeline: [
          {
            ...input.captureTimeline[0],
            captureNames: ["final-color", "final-color"],
          },
          ...input.captureTimeline.slice(1),
        ],
      }),
    ],
    [
      "a capture tick beyond the duration",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        captureTimeline: [
          ...input.captureTimeline,
          {
            id: "late-capture",
            tick: input.durationTicks + 1,
            captureNames: ["final-color"],
          },
        ],
      }),
    ],
    [
      "an overflowing seed",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        seed: 0x1_0000_0000,
      }),
    ],
    [
      "a fractional seed",
      (input: ShowcasePresetAuthoring) => ({ ...input, seed: 0.5 }),
    ],
    [
      "unsafe duration",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        durationTicks: Number.MAX_SAFE_INTEGER + 1,
      }),
    ],
    [
      "an empty look timeline",
      (input: ShowcasePresetAuthoring) => ({ ...input, lookTimeline: [] }),
    ],
    [
      "out-of-order look ticks",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        lookTimeline: [...input.lookTimeline].reverse(),
      }),
    ],
    [
      "a duplicate same-tick look id",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        lookTimeline: [
          input.lookTimeline[0],
          input.lookTimeline[1],
          { ...input.lookTimeline[1] },
          input.lookTimeline[2],
        ],
      }),
    ],
    [
      "an empty look id",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        lookTimeline: [
          { ...input.lookTimeline[0], id: "" },
          ...input.lookTimeline.slice(1),
        ],
      }),
    ],
    [
      "a look tick beyond the duration",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        lookTimeline: [
          ...input.lookTimeline,
          {
            ...input.lookTimeline[0],
            tick: input.durationTicks + 1,
            id: "late-look",
          },
        ],
      }),
    ],
    [
      "a base look identity mismatch",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        lookTimeline: [
          {
            ...input.lookTimeline[0],
            waterPreset: waterPresetIdentity(createWaterPreset("calm")),
          },
          ...input.lookTimeline.slice(1),
        ],
      }),
    ],
    [
      "a Storm Front look identity mismatch",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        lookTimeline: input.lookTimeline.map((look) =>
          look.tick === 120
            ? {
                ...look,
                environmentPreset: input.environmentPreset,
              }
            : look,
        ),
      }),
    ],
    [
      "an empty body timeline",
      (input: ShowcasePresetAuthoring) => ({ ...input, bodyTimeline: [] }),
    ],
    [
      "a body without a tick-zero initial control",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        bodyTimeline: [
          { ...input.bodyTimeline[0], tick: 1 },
          input.bodyTimeline[1],
        ],
      }),
    ],
    [
      "a second body introduced after tick zero",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        bodyTimeline: [
          input.bodyTimeline[0],
          {
            tick: 120,
            bodyId: "late-body",
            throttle: 0,
            steering: 0,
          },
          input.bodyTimeline[1],
        ],
      }),
    ],
    [
      "a duplicate same-tick body id",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        bodyTimeline: [
          input.bodyTimeline[0],
          { ...input.bodyTimeline[0] },
          input.bodyTimeline[1],
        ],
      }),
    ],
    [
      "out-of-order body ticks",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        bodyTimeline: [
          input.bodyTimeline[0],
          {
            tick: 120,
            bodyId: "reference-proxy-vessel",
            throttle: 0.5,
            steering: 0,
          },
          {
            tick: 60,
            bodyId: "reference-proxy-vessel",
            throttle: 0.4,
            steering: 0,
          },
        ],
      }),
    ],
    [
      "an empty body id",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        bodyTimeline: [
          { ...input.bodyTimeline[0], bodyId: "" },
          ...input.bodyTimeline.slice(1),
        ],
      }),
    ],
    [
      "an out-of-range throttle",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        bodyTimeline: [
          { ...input.bodyTimeline[0], throttle: 1.01 },
          ...input.bodyTimeline.slice(1),
        ],
      }),
    ],
    [
      "a non-finite steering input",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        bodyTimeline: [
          { ...input.bodyTimeline[0], steering: Number.NaN },
          ...input.bodyTimeline.slice(1),
        ],
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
    [
      "a Storm Front Hero event at another tick",
      (input: ShowcasePresetAuthoring) => ({
        ...input,
        eventTimeline: input.eventTimeline.map((event) =>
          event.id === input.stormFront.heroBreakerEventId
            ? { ...event, tick: 121 }
            : event,
        ),
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
