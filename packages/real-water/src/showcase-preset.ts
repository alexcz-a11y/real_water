import type { EnvironmentPresetIdentity } from "./environment-preset.js";
import {
  ENVIRONMENT_PRESET_SCHEMA,
  ENVIRONMENT_PRESET_VERSION,
  createBlueNoonEnvironmentPreset,
  createCalmSunriseEnvironmentPreset,
  createReferenceEnvironmentPreset,
  createStormFrontEnvironmentPreset,
  environmentPresetIdentity,
} from "./environment-preset.js";
import { hasExactKeys, isRecord } from "./internal/record-validation.js";
import { sha256Identifier } from "./internal/sha256.js";
import type { QualityProfileIdentity } from "./quality-profile.js";
import {
  QUALITY_PROFILE_SCHEMA,
  QUALITY_PROFILE_VERSION,
  createMinimalWaterQualityProfile,
  qualityProfileIdentity,
} from "./quality-profile.js";
import type { WaterPresetIdentity } from "./water-preset.js";
import {
  WATER_PRESET_SCHEMA,
  WATER_PRESET_VERSION,
  createWaterPreset,
  waterPresetIdentity,
} from "./water-preset.js";

/**
 * The discriminator for Showcase Presets.
 *
 * @public
 */
export const SHOWCASE_PRESET_SCHEMA = "real-water/showcase-preset" as const;

/**
 * The only Showcase Preset version accepted by this release.
 *
 * @public
 */
export const SHOWCASE_PRESET_VERSION = 3 as const;

/**
 * The fixed unsigned seed carried by the built-in Reference Showcase recipe.
 *
 * @public
 */
export const REFERENCE_SHOWCASE_SEED = 0x5eed_0025 as const;

/**
 * A finite position or target in the Three.js Y-up coordinate contract.
 *
 * @public
 */
export type ShowcaseVector3 = readonly [number, number, number];

/**
 * One deterministic camera keyframe on the Showcase fixed-tick timeline.
 *
 * @public
 */
export interface ShowcaseCameraKeyframe {
  readonly tick: number;
  readonly position: ShowcaseVector3;
  readonly target: ShowcaseVector3;
  readonly verticalFovDegrees: number;
}

/**
 * One stable semantic event on the Showcase fixed-tick timeline.
 *
 * @public
 */
export interface ShowcaseEventKeyframe {
  readonly tick: number;
  readonly id: string;
}

/**
 * One stable named QA capture point on the Showcase fixed-tick timeline.
 *
 * @public
 */
export interface ShowcaseCapturePoint {
  readonly id: string;
  readonly tick: number;
  readonly captureNames: readonly string[];
}

/**
 * One named pair of Water and Environment Preset identities on the fixed-tick
 * Showcase timeline. Different ids may share a tick and execute in array
 * order; the last keyframe at that tick is the final global look.
 *
 * @public
 */
export interface ShowcaseLookKeyframe {
  readonly tick: number;
  readonly id: string;
  readonly waterPreset: WaterPresetIdentity;
  readonly environmentPreset: EnvironmentPresetIdentity;
}

/**
 * One deterministic control input for a stable Showcase body identity.
 *
 * @public
 */
export interface ShowcaseBodyKeyframe {
  readonly tick: number;
  readonly bodyId: string;
  readonly throttle: number;
  readonly steering: number;
}

/**
 * The preset identities and semantic events that make one deterministic Storm
 * Front Showcase segment reproducible.
 *
 * @public
 */
export interface ShowcaseStormFrontSegment {
  readonly eventId: string;
  readonly heroBreakerEventId: string;
  readonly waterPreset: WaterPresetIdentity;
  readonly environmentPreset: EnvironmentPresetIdentity;
}

/**
 * Caller-authored content used to create a Showcase Preset. The factory owns
 * schema, version, and hash fields so authors cannot accidentally stale them.
 *
 * @public
 */
export interface ShowcasePresetAuthoring {
  readonly id: string;
  readonly durationTicks: number;
  readonly seed: number;
  readonly waterPreset: WaterPresetIdentity;
  readonly environmentPreset: EnvironmentPresetIdentity;
  readonly qualityProfile: QualityProfileIdentity;
  readonly stormFront: ShowcaseStormFrontSegment;
  readonly lookTimeline: readonly ShowcaseLookKeyframe[];
  readonly bodyTimeline: readonly ShowcaseBodyKeyframe[];
  readonly cameraTimeline: readonly ShowcaseCameraKeyframe[];
  readonly eventTimeline: readonly ShowcaseEventKeyframe[];
  readonly captureTimeline: readonly ShowcaseCapturePoint[];
}

/**
 * A deterministic presentation recipe that pins all referenced preset
 * identities and schedules camera and semantic event timelines.
 *
 * @public
 */
export interface ShowcasePreset extends ShowcasePresetAuthoring {
  readonly schema: typeof SHOWCASE_PRESET_SCHEMA;
  readonly version: typeof SHOWCASE_PRESET_VERSION;
  readonly presetHash: string;
}

/**
 * The immutable content identity of a Showcase Preset.
 *
 * @public
 */
export interface ShowcasePresetIdentity {
  readonly schema: typeof SHOWCASE_PRESET_SCHEMA;
  readonly version: typeof SHOWCASE_PRESET_VERSION;
  readonly id: string;
  readonly presetHash: string;
}

const SHOWCASE_PRESET_KEYS = [
  "schema",
  "version",
  "id",
  "presetHash",
  "durationTicks",
  "seed",
  "waterPreset",
  "environmentPreset",
  "qualityProfile",
  "stormFront",
  "lookTimeline",
  "bodyTimeline",
  "cameraTimeline",
  "eventTimeline",
  "captureTimeline",
] as const;
const SHOWCASE_AUTHORING_KEYS = [
  "id",
  "durationTicks",
  "seed",
  "waterPreset",
  "environmentPreset",
  "qualityProfile",
  "stormFront",
  "lookTimeline",
  "bodyTimeline",
  "cameraTimeline",
  "eventTimeline",
  "captureTimeline",
] as const;
const LEGACY_V2_SHOWCASE_PRESET_KEYS = [
  "schema",
  "version",
  "id",
  "presetHash",
  "durationTicks",
  "waterPreset",
  "environmentPreset",
  "qualityProfile",
  "stormFront",
  "cameraTimeline",
  "eventTimeline",
] as const;
const LEGACY_V1_SHOWCASE_PRESET_KEYS = LEGACY_V2_SHOWCASE_PRESET_KEYS.filter(
  (key) => key !== "stormFront",
);
const LEGACY_V1_SHOWCASE_PRESET_VERSION = 1 as const;
const LEGACY_V2_SHOWCASE_PRESET_VERSION = 2 as const;
const LEGACY_ENVIRONMENT_PRESET_VERSION = 1 as const;
const LEGACY_QUALITY_PROFILE_VERSION = 14 as const;
type LegacyEnvironmentPresetIdentity = Omit<
  EnvironmentPresetIdentity,
  "version"
> & { readonly version: typeof LEGACY_ENVIRONMENT_PRESET_VERSION };
type LegacyQualityProfileIdentity = Omit<QualityProfileIdentity, "version"> & {
  readonly version: typeof LEGACY_QUALITY_PROFILE_VERSION;
};
const PRESET_IDENTITY_KEYS = ["schema", "version", "id", "presetHash"] as const;
const QUALITY_IDENTITY_KEYS = [
  "schema",
  "version",
  "id",
  "profileHash",
] as const;
const CAMERA_KEYFRAME_KEYS = [
  "tick",
  "position",
  "target",
  "verticalFovDegrees",
] as const;
const EVENT_KEYFRAME_KEYS = ["tick", "id"] as const;
const CAPTURE_POINT_KEYS = ["id", "tick", "captureNames"] as const;
const LOOK_KEYFRAME_KEYS = [
  "tick",
  "id",
  "waterPreset",
  "environmentPreset",
] as const;
const BODY_KEYFRAME_KEYS = ["tick", "bodyId", "throttle", "steering"] as const;
const STORM_FRONT_KEYS = [
  "eventId",
  "heroBreakerEventId",
  "waterPreset",
  "environmentPreset",
] as const;
const SHA256_IDENTIFIER = /^sha256:[0-9a-f]{64}$/u;

/**
 * Restores the built-in approximately 90-second directed Reference Experience
 * loop. This function only authors data; it does not play the timeline.
 *
 * @public
 */
export function createReferenceShowcasePreset(): ShowcasePreset {
  const calmWater = waterPresetIdentity(createWaterPreset("calm"));
  const calmEnvironment = environmentPresetIdentity(
    createCalmSunriseEnvironmentPreset(),
  );
  const swellWater = waterPresetIdentity(createWaterPreset("swell"));
  const blueNoonEnvironment = environmentPresetIdentity(
    createBlueNoonEnvironmentPreset(),
  );
  const stormWater = waterPresetIdentity(createWaterPreset("storm"));
  const stormEnvironment = environmentPresetIdentity(
    createStormFrontEnvironmentPreset(),
  );
  return createAuthoredShowcasePreset({
    id: "reference-loop",
    durationTicks: 5_400,
    seed: REFERENCE_SHOWCASE_SEED,
    waterPreset: calmWater,
    environmentPreset: calmEnvironment,
    qualityProfile: qualityProfileIdentity(createMinimalWaterQualityProfile()),
    stormFront: {
      eventId: "weather-front",
      heroBreakerEventId: "storm-front-hero-breaker",
      waterPreset: stormWater,
      environmentPreset: stormEnvironment,
    },
    lookTimeline: [
      {
        tick: 0,
        id: "calm-sunrise",
        waterPreset: calmWater,
        environmentPreset: calmEnvironment,
      },
      {
        tick: 1_800,
        id: "blue-noon-swell",
        waterPreset: swellWater,
        environmentPreset: blueNoonEnvironment,
      },
      {
        tick: 3_600,
        id: "storm-front",
        waterPreset: stormWater,
        environmentPreset: stormEnvironment,
      },
      {
        tick: 5_400,
        id: "calm-sunrise",
        waterPreset: calmWater,
        environmentPreset: calmEnvironment,
      },
    ],
    bodyTimeline: [
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
    ],
    cameraTimeline: [
      {
        tick: 0,
        position: [12, 7, 18],
        target: [0, 1, 0],
        verticalFovDegrees: 50,
      },
      {
        tick: 1_800,
        position: [36, 12, 18],
        target: [0, 1, -8],
        verticalFovDegrees: 44,
      },
      {
        tick: 3_600,
        position: [-18, 5, 24],
        target: [0, 0, 0],
        verticalFovDegrees: 58,
      },
      {
        tick: 5_400,
        position: [12, 7, 18],
        target: [0, 1, 0],
        verticalFovDegrees: 50,
      },
    ],
    eventTimeline: [
      { tick: 0, id: "showcase-start" },
      { tick: 1_800, id: "hero-breaker" },
      { tick: 3_600, id: "weather-front" },
      { tick: 3_600, id: "storm-front-hero-breaker" },
    ],
    captureTimeline: [
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
    ],
  });
}

/**
 * Creates a current, deeply immutable Showcase Preset and derives its content
 * hash from canonical field order.
 *
 * @public
 */
export function createAuthoredShowcasePreset(
  authoring: ShowcasePresetAuthoring,
): ShowcasePreset {
  const value: unknown = authoring;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, SHOWCASE_AUTHORING_KEYS) ||
    !isStableId(value.id) ||
    !isPositiveSafeInteger(value.durationTicks) ||
    !isUnsigned32(value.seed)
  ) {
    throw invalidAuthoring();
  }

  const durationTicks = value.durationTicks;
  const cameraTimeline = normalizeCameraTimeline(
    value.cameraTimeline,
    durationTicks,
  );
  const eventTimeline = normalizeEventTimeline(
    value.eventTimeline,
    durationTicks,
  );
  const waterPreset = normalizeWaterPresetIdentity(value.waterPreset);
  const environmentPreset = normalizeEnvironmentPresetIdentity(
    value.environmentPreset,
  );
  const qualityProfile = normalizeQualityProfileIdentity(value.qualityProfile);
  const stormFront = normalizeStormFrontSegment(
    value.stormFront,
    cameraTimeline,
    eventTimeline,
  );
  const lookTimeline = normalizeLookTimeline(value.lookTimeline, durationTicks);
  const bodyTimeline = normalizeBodyTimeline(value.bodyTimeline, durationTicks);
  const captureTimeline = normalizeCaptureTimeline(
    value.captureTimeline,
    durationTicks,
  );
  assertLookTimelineCoherence(
    lookTimeline,
    waterPreset,
    environmentPreset,
    stormFront,
    eventTimeline,
  );
  const content = {
    schema: SHOWCASE_PRESET_SCHEMA,
    version: SHOWCASE_PRESET_VERSION,
    id: value.id,
    durationTicks,
    seed: value.seed,
    waterPreset,
    environmentPreset,
    qualityProfile,
    stormFront,
    lookTimeline,
    bodyTimeline,
    cameraTimeline,
    eventTimeline,
    captureTimeline,
  };

  return Object.freeze({
    schema: content.schema,
    version: content.version,
    id: content.id,
    presetHash: sha256Identifier(JSON.stringify(content)),
    durationTicks: content.durationTicks,
    seed: content.seed,
    waterPreset: content.waterPreset,
    environmentPreset: content.environmentPreset,
    qualityProfile: content.qualityProfile,
    stormFront: content.stormFront,
    lookTimeline: content.lookTimeline,
    bodyTimeline: content.bodyTimeline,
    cameraTimeline: content.cameraTimeline,
    eventTimeline: content.eventTimeline,
    captureTimeline: content.captureTimeline,
  });
}

/**
 * Validates the exact current Showcase schema, verifies its content hash, and
 * returns a fresh deeply immutable value.
 *
 * @public
 */
export function normalizeShowcasePreset(
  candidate: ShowcasePreset,
): ShowcasePreset {
  const value: unknown = candidate;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, SHOWCASE_PRESET_KEYS) ||
    value.schema !== SHOWCASE_PRESET_SCHEMA ||
    value.version !== SHOWCASE_PRESET_VERSION ||
    typeof value.presetHash !== "string"
  ) {
    throw invalidPreset();
  }

  let normalized: ShowcasePreset;
  try {
    normalized = createAuthoredShowcasePreset({
      id: value.id,
      durationTicks: value.durationTicks,
      seed: value.seed,
      waterPreset: value.waterPreset,
      environmentPreset: value.environmentPreset,
      qualityProfile: value.qualityProfile,
      stormFront: value.stormFront,
      lookTimeline: value.lookTimeline,
      bodyTimeline: value.bodyTimeline,
      cameraTimeline: value.cameraTimeline,
      eventTimeline: value.eventTimeline,
      captureTimeline: value.captureTimeline,
    } as ShowcasePresetAuthoring);
  } catch {
    throw invalidPreset();
  }
  if (value.presetHash !== normalized.presetHash) {
    throw invalidPreset();
  }
  return normalized;
}

/**
 * Migrates the complete version-one and version-two Showcase recipes through
 * explicit semantic rungs. Other legacy/future shapes remain fail-closed.
 *
 * @public
 */
export function migrateShowcasePreset(candidate: unknown): ShowcasePreset {
  if (isRecord(candidate) && candidate.version === SHOWCASE_PRESET_VERSION) {
    return normalizeShowcasePreset(candidate as unknown as ShowcasePreset);
  }
  if (
    isRecord(candidate) &&
    candidate.version === LEGACY_V2_SHOWCASE_PRESET_VERSION
  ) {
    return migrateVersionTwoShowcasePreset(candidate);
  }
  if (
    isRecord(candidate) &&
    candidate.version === LEGACY_V1_SHOWCASE_PRESET_VERSION
  ) {
    return migrateVersionOneShowcasePreset(candidate);
  }
  throw invalidPreset();
}

function migrateVersionTwoShowcasePreset(
  candidate: Record<string, unknown>,
): ShowcasePreset {
  if (
    !hasExactKeys(candidate, LEGACY_V2_SHOWCASE_PRESET_KEYS) ||
    candidate.schema !== SHOWCASE_PRESET_SCHEMA ||
    !isStableId(candidate.id) ||
    !isPositiveSafeInteger(candidate.durationTicks) ||
    typeof candidate.presetHash !== "string"
  ) {
    throw invalidPreset();
  }
  const durationTicks = candidate.durationTicks;
  let waterPreset: WaterPresetIdentity;
  let environmentPreset: EnvironmentPresetIdentity;
  let qualityProfile: QualityProfileIdentity;
  let stormFront: ShowcaseStormFrontSegment;
  let cameraTimeline: readonly ShowcaseCameraKeyframe[];
  let eventTimeline: readonly ShowcaseEventKeyframe[];
  try {
    waterPreset = normalizeWaterPresetIdentity(candidate.waterPreset);
    environmentPreset = normalizeEnvironmentPresetIdentity(
      candidate.environmentPreset,
    );
    qualityProfile = normalizeQualityProfileIdentity(candidate.qualityProfile);
    cameraTimeline = normalizeCameraTimeline(
      candidate.cameraTimeline,
      durationTicks,
    );
    eventTimeline = normalizeEventTimeline(
      candidate.eventTimeline,
      durationTicks,
    );
    stormFront = normalizeStormFrontSegment(
      candidate.stormFront,
      cameraTimeline,
      eventTimeline,
    );
  } catch {
    throw invalidPreset();
  }
  const legacyContent = {
    schema: SHOWCASE_PRESET_SCHEMA,
    version: LEGACY_V2_SHOWCASE_PRESET_VERSION,
    id: candidate.id,
    durationTicks,
    waterPreset,
    environmentPreset,
    qualityProfile,
    stormFront,
    cameraTimeline,
    eventTimeline,
  };
  if (
    candidate.presetHash !== sha256Identifier(JSON.stringify(legacyContent))
  ) {
    throw invalidPreset();
  }
  return createVersionThreeFromVersionTwoSemantics({
    id: candidate.id,
    durationTicks,
    waterPreset,
    environmentPreset,
    qualityProfile,
    stormFront,
    cameraTimeline,
    eventTimeline,
  });
}

function migrateVersionOneShowcasePreset(
  candidate: Record<string, unknown>,
): ShowcasePreset {
  if (
    !hasExactKeys(candidate, LEGACY_V1_SHOWCASE_PRESET_KEYS) ||
    candidate.schema !== SHOWCASE_PRESET_SCHEMA ||
    !isStableId(candidate.id) ||
    !isPositiveSafeInteger(candidate.durationTicks) ||
    typeof candidate.presetHash !== "string"
  ) {
    throw invalidPreset();
  }
  const durationTicks = candidate.durationTicks;
  let waterPreset: WaterPresetIdentity;
  let environmentPreset: LegacyEnvironmentPresetIdentity;
  let qualityProfile: LegacyQualityProfileIdentity;
  let cameraTimeline: readonly ShowcaseCameraKeyframe[];
  let eventTimeline: readonly ShowcaseEventKeyframe[];
  try {
    waterPreset = normalizeWaterPresetIdentity(candidate.waterPreset);
    environmentPreset = normalizeLegacyEnvironmentPresetIdentity(
      candidate.environmentPreset,
    );
    qualityProfile = normalizeLegacyQualityProfileIdentity(
      candidate.qualityProfile,
    );
    cameraTimeline = normalizeCameraTimeline(
      candidate.cameraTimeline,
      durationTicks,
    );
    eventTimeline = normalizeEventTimeline(
      candidate.eventTimeline,
      durationTicks,
    );
  } catch {
    throw invalidPreset();
  }
  const legacyContent = {
    schema: SHOWCASE_PRESET_SCHEMA,
    version: LEGACY_V1_SHOWCASE_PRESET_VERSION,
    id: candidate.id,
    durationTicks,
    waterPreset,
    environmentPreset,
    qualityProfile,
    cameraTimeline,
    eventTimeline,
  };
  if (
    candidate.presetHash !== sha256Identifier(JSON.stringify(legacyContent)) ||
    environmentPreset.id !== "reference"
  ) {
    throw invalidPreset();
  }
  const stormEvent = eventTimeline.find(({ id }) => id === "weather-front");
  if (
    stormEvent === undefined ||
    !cameraTimeline.some(({ tick }) => tick === stormEvent.tick)
  ) {
    throw invalidPreset();
  }
  const heroBreakerEventId = "storm-front-hero-breaker";
  const existingHero = eventTimeline.find(
    ({ id }) => id === heroBreakerEventId,
  );
  if (existingHero !== undefined && existingHero.tick !== stormEvent.tick) {
    throw invalidPreset();
  }
  const currentEnvironment = environmentPresetIdentity(
    createReferenceEnvironmentPreset(),
  );
  const stormEnvironment = environmentPresetIdentity(
    createStormFrontEnvironmentPreset(),
  );
  const stormWater = waterPresetIdentity(createWaterPreset("storm"));
  return createVersionThreeFromVersionTwoSemantics({
    id: candidate.id,
    durationTicks,
    waterPreset,
    environmentPreset: currentEnvironment,
    qualityProfile: qualityProfileIdentity(
      createMinimalWaterQualityProfile(qualityProfile.id),
    ),
    stormFront: {
      eventId: stormEvent.id,
      heroBreakerEventId,
      waterPreset: stormWater,
      environmentPreset: stormEnvironment,
    },
    cameraTimeline,
    eventTimeline:
      existingHero === undefined
        ? Object.freeze(
            [
              ...eventTimeline,
              { tick: stormEvent.tick, id: heroBreakerEventId },
            ]
              .sort((left, right) => left.tick - right.tick)
              .map((event) => Object.freeze(event)),
          )
        : eventTimeline,
  });
}

interface VersionTwoShowcaseSemantics {
  readonly id: string;
  readonly durationTicks: number;
  readonly waterPreset: WaterPresetIdentity;
  readonly environmentPreset: EnvironmentPresetIdentity;
  readonly qualityProfile: QualityProfileIdentity;
  readonly stormFront: ShowcaseStormFrontSegment;
  readonly cameraTimeline: readonly ShowcaseCameraKeyframe[];
  readonly eventTimeline: readonly ShowcaseEventKeyframe[];
}

function createVersionThreeFromVersionTwoSemantics(
  legacy: VersionTwoShowcaseSemantics,
): ShowcasePreset {
  const stormEvent = legacy.eventTimeline.find(
    ({ id }) => id === legacy.stormFront.eventId,
  );
  if (stormEvent === undefined) {
    throw invalidPreset();
  }
  return createAuthoredShowcasePreset({
    id: legacy.id,
    durationTicks: legacy.durationTicks,
    seed: 0,
    waterPreset: legacy.waterPreset,
    environmentPreset: legacy.environmentPreset,
    qualityProfile: legacy.qualityProfile,
    stormFront: legacy.stormFront,
    lookTimeline: createMigratedLookTimeline(legacy, stormEvent.tick),
    bodyTimeline: [
      {
        tick: 0,
        bodyId: "reference-proxy-vessel",
        throttle: 0,
        steering: 0,
      },
      {
        tick: legacy.durationTicks,
        bodyId: "reference-proxy-vessel",
        throttle: 0,
        steering: 0,
      },
    ],
    cameraTimeline: legacy.cameraTimeline,
    eventTimeline: legacy.eventTimeline,
    captureTimeline: createMigratedCaptureTimeline(
      legacy.durationTicks,
      stormEvent.tick,
    ),
  });
}

function createMigratedCaptureTimeline(
  durationTicks: number,
  stormTick: number,
): readonly ShowcaseCapturePoint[] {
  return [
    {
      id: "legacy-start",
      tick: 0,
      captureNames: ["final-color"],
    },
    ...(stormTick > 0 && stormTick < durationTicks
      ? [
          {
            id: "legacy-storm",
            tick: stormTick,
            captureNames: ["final-color"],
          },
        ]
      : []),
    {
      id: "legacy-loop",
      tick: durationTicks,
      captureNames: ["final-color"],
    },
  ];
}

function createMigratedLookTimeline(
  legacy: VersionTwoShowcaseSemantics,
  stormTick: number,
): readonly ShowcaseLookKeyframe[] {
  return [
    {
      tick: 0,
      id: "base",
      waterPreset: legacy.waterPreset,
      environmentPreset: legacy.environmentPreset,
    },
    {
      tick: stormTick,
      id: "storm-front",
      waterPreset: legacy.stormFront.waterPreset,
      environmentPreset: legacy.stormFront.environmentPreset,
    },
    {
      tick: legacy.durationTicks,
      id: "base",
      waterPreset: legacy.waterPreset,
      environmentPreset: legacy.environmentPreset,
    },
  ];
}

/**
 * Returns the immutable content identity of a normalized Showcase Preset.
 *
 * @public
 */
export function showcasePresetIdentity(
  preset: ShowcasePreset,
): ShowcasePresetIdentity {
  const normalized = normalizeShowcasePreset(preset);
  return Object.freeze({
    schema: normalized.schema,
    version: normalized.version,
    id: normalized.id,
    presetHash: normalized.presetHash,
  });
}

function normalizeWaterPresetIdentity(value: unknown): WaterPresetIdentity {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, PRESET_IDENTITY_KEYS) ||
    value.schema !== WATER_PRESET_SCHEMA ||
    value.version !== WATER_PRESET_VERSION ||
    !isWaterPresetId(value.id) ||
    !isSha256Identifier(value.presetHash)
  ) {
    throw invalidAuthoring();
  }
  return Object.freeze({
    schema: WATER_PRESET_SCHEMA,
    version: WATER_PRESET_VERSION,
    id: value.id,
    presetHash: value.presetHash,
  });
}

function normalizeEnvironmentPresetIdentity(
  value: unknown,
): EnvironmentPresetIdentity {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, PRESET_IDENTITY_KEYS) ||
    value.schema !== ENVIRONMENT_PRESET_SCHEMA ||
    value.version !== ENVIRONMENT_PRESET_VERSION ||
    !isStableId(value.id) ||
    !isSha256Identifier(value.presetHash)
  ) {
    throw invalidAuthoring();
  }
  return Object.freeze({
    schema: ENVIRONMENT_PRESET_SCHEMA,
    version: ENVIRONMENT_PRESET_VERSION,
    id: value.id,
    presetHash: value.presetHash,
  });
}

function normalizeLegacyEnvironmentPresetIdentity(
  value: unknown,
): LegacyEnvironmentPresetIdentity {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, PRESET_IDENTITY_KEYS) ||
    value.schema !== ENVIRONMENT_PRESET_SCHEMA ||
    value.version !== LEGACY_ENVIRONMENT_PRESET_VERSION ||
    !isStableId(value.id) ||
    !isSha256Identifier(value.presetHash)
  ) {
    throw invalidAuthoring();
  }
  return Object.freeze({
    schema: ENVIRONMENT_PRESET_SCHEMA,
    version: LEGACY_ENVIRONMENT_PRESET_VERSION,
    id: value.id,
    presetHash: value.presetHash,
  });
}

function normalizeQualityProfileIdentity(
  value: unknown,
): QualityProfileIdentity {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, QUALITY_IDENTITY_KEYS) ||
    value.schema !== QUALITY_PROFILE_SCHEMA ||
    value.version !== QUALITY_PROFILE_VERSION ||
    !isQualityProfileId(value.id) ||
    !isSha256Identifier(value.profileHash)
  ) {
    throw invalidAuthoring();
  }
  return Object.freeze({
    schema: QUALITY_PROFILE_SCHEMA,
    version: QUALITY_PROFILE_VERSION,
    id: value.id,
    profileHash: value.profileHash,
  });
}

function normalizeLegacyQualityProfileIdentity(
  value: unknown,
): LegacyQualityProfileIdentity {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, QUALITY_IDENTITY_KEYS) ||
    value.schema !== QUALITY_PROFILE_SCHEMA ||
    value.version !== LEGACY_QUALITY_PROFILE_VERSION ||
    !isQualityProfileId(value.id) ||
    !isSha256Identifier(value.profileHash)
  ) {
    throw invalidAuthoring();
  }
  return Object.freeze({
    schema: QUALITY_PROFILE_SCHEMA,
    version: LEGACY_QUALITY_PROFILE_VERSION,
    id: value.id,
    profileHash: value.profileHash,
  });
}

function normalizeStormFrontSegment(
  value: unknown,
  cameraTimeline: readonly ShowcaseCameraKeyframe[],
  eventTimeline: readonly ShowcaseEventKeyframe[],
): ShowcaseStormFrontSegment {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, STORM_FRONT_KEYS) ||
    !isStableId(value.eventId) ||
    !isStableId(value.heroBreakerEventId) ||
    value.eventId === value.heroBreakerEventId
  ) {
    throw invalidAuthoring();
  }
  const event = eventTimeline.find(({ id }) => id === value.eventId);
  const hero = eventTimeline.find(({ id }) => id === value.heroBreakerEventId);
  if (
    event === undefined ||
    hero === undefined ||
    event.tick !== hero.tick ||
    !cameraTimeline.some(({ tick }) => tick === event.tick)
  ) {
    throw invalidAuthoring();
  }
  return Object.freeze({
    eventId: value.eventId,
    heroBreakerEventId: value.heroBreakerEventId,
    waterPreset: normalizeWaterPresetIdentity(value.waterPreset),
    environmentPreset: normalizeEnvironmentPresetIdentity(
      value.environmentPreset,
    ),
  });
}

function normalizeCameraTimeline(
  value: unknown,
  durationTicks: number,
): readonly ShowcaseCameraKeyframe[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidAuthoring();
  }
  const timeline: ShowcaseCameraKeyframe[] = [];
  let previousTick = -1;
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, CAMERA_KEYFRAME_KEYS) ||
      !isTimelineTick(candidate.tick, durationTicks) ||
      candidate.tick < previousTick ||
      !isFiniteNumber(candidate.verticalFovDegrees) ||
      candidate.verticalFovDegrees <= 0 ||
      candidate.verticalFovDegrees >= 180
    ) {
      throw invalidAuthoring();
    }
    const position = normalizeVector(candidate.position);
    const target = normalizeVector(candidate.target);
    timeline.push(
      Object.freeze({
        tick: candidate.tick,
        position,
        target,
        verticalFovDegrees: candidate.verticalFovDegrees,
      }),
    );
    previousTick = candidate.tick;
  }
  return Object.freeze(timeline);
}

function normalizeEventTimeline(
  value: unknown,
  durationTicks: number,
): readonly ShowcaseEventKeyframe[] {
  if (!Array.isArray(value)) {
    throw invalidAuthoring();
  }
  const timeline: ShowcaseEventKeyframe[] = [];
  const ids = new Set<string>();
  let previousTick = -1;
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, EVENT_KEYFRAME_KEYS) ||
      !isTimelineTick(candidate.tick, durationTicks) ||
      candidate.tick < previousTick ||
      !isStableId(candidate.id) ||
      ids.has(candidate.id)
    ) {
      throw invalidAuthoring();
    }
    timeline.push(
      Object.freeze({
        tick: candidate.tick,
        id: candidate.id,
      }),
    );
    ids.add(candidate.id);
    previousTick = candidate.tick;
  }
  return Object.freeze(timeline);
}

function normalizeCaptureTimeline(
  value: unknown,
  durationTicks: number,
): readonly ShowcaseCapturePoint[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidAuthoring();
  }
  const timeline: ShowcaseCapturePoint[] = [];
  const ids = new Set<string>();
  let previousTick = -1;
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, CAPTURE_POINT_KEYS) ||
      !isStableId(candidate.id) ||
      ids.has(candidate.id) ||
      !isTimelineTick(candidate.tick, durationTicks) ||
      candidate.tick < previousTick ||
      !Array.isArray(candidate.captureNames) ||
      candidate.captureNames.length === 0
    ) {
      throw invalidAuthoring();
    }
    const captureNames = new Set<string>();
    for (const captureName of candidate.captureNames) {
      if (!isStableId(captureName) || captureNames.has(captureName)) {
        throw invalidAuthoring();
      }
      captureNames.add(captureName);
    }
    timeline.push(
      Object.freeze({
        id: candidate.id,
        tick: candidate.tick,
        captureNames: Object.freeze([...candidate.captureNames]),
      }),
    );
    ids.add(candidate.id);
    previousTick = candidate.tick;
  }
  return Object.freeze(timeline);
}

function normalizeLookTimeline(
  value: unknown,
  durationTicks: number,
): readonly ShowcaseLookKeyframe[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidAuthoring();
  }
  const timeline: ShowcaseLookKeyframe[] = [];
  const idsByTick = new Map<number, Set<string>>();
  let previousTick = -1;
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, LOOK_KEYFRAME_KEYS) ||
      !isTimelineTick(candidate.tick, durationTicks) ||
      candidate.tick < previousTick ||
      !isStableId(candidate.id) ||
      hasTimelineId(idsByTick, candidate.tick, candidate.id)
    ) {
      throw invalidAuthoring();
    }
    timeline.push(
      Object.freeze({
        tick: candidate.tick,
        id: candidate.id,
        waterPreset: normalizeWaterPresetIdentity(candidate.waterPreset),
        environmentPreset: normalizeEnvironmentPresetIdentity(
          candidate.environmentPreset,
        ),
      }),
    );
    recordTimelineId(idsByTick, candidate.tick, candidate.id);
    previousTick = candidate.tick;
  }
  return Object.freeze(timeline);
}

function normalizeBodyTimeline(
  value: unknown,
  durationTicks: number,
): readonly ShowcaseBodyKeyframe[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidAuthoring();
  }
  const timeline: ShowcaseBodyKeyframe[] = [];
  const bodyIdsByTick = new Map<number, Set<string>>();
  const initializedBodyIds = new Set<string>();
  let previousTick = -1;
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, BODY_KEYFRAME_KEYS) ||
      !isTimelineTick(candidate.tick, durationTicks) ||
      candidate.tick < previousTick ||
      !isStableId(candidate.bodyId) ||
      (!initializedBodyIds.has(candidate.bodyId) && candidate.tick !== 0) ||
      hasTimelineId(bodyIdsByTick, candidate.tick, candidate.bodyId) ||
      !isUnitControl(candidate.throttle) ||
      !isUnitControl(candidate.steering)
    ) {
      throw invalidAuthoring();
    }
    timeline.push(
      Object.freeze({
        tick: candidate.tick,
        bodyId: candidate.bodyId,
        throttle: candidate.throttle,
        steering: candidate.steering,
      }),
    );
    initializedBodyIds.add(candidate.bodyId);
    recordTimelineId(bodyIdsByTick, candidate.tick, candidate.bodyId);
    previousTick = candidate.tick;
  }
  return Object.freeze(timeline);
}

function assertLookTimelineCoherence(
  lookTimeline: readonly ShowcaseLookKeyframe[],
  waterPreset: WaterPresetIdentity,
  environmentPreset: EnvironmentPresetIdentity,
  stormFront: ShowcaseStormFrontSegment,
  eventTimeline: readonly ShowcaseEventKeyframe[],
): void {
  const stormEvent = eventTimeline.find(({ id }) => id === stormFront.eventId);
  if (
    !lookTimeline.some(
      (look) =>
        look.tick === 0 &&
        sameWaterPresetIdentity(look.waterPreset, waterPreset) &&
        sameEnvironmentPresetIdentity(
          look.environmentPreset,
          environmentPreset,
        ),
    ) ||
    stormEvent === undefined ||
    !lookTimeline.some(
      (look) =>
        look.tick === stormEvent.tick &&
        sameWaterPresetIdentity(look.waterPreset, stormFront.waterPreset) &&
        sameEnvironmentPresetIdentity(
          look.environmentPreset,
          stormFront.environmentPreset,
        ),
    )
  ) {
    throw invalidAuthoring();
  }
}

function sameWaterPresetIdentity(
  left: WaterPresetIdentity,
  right: WaterPresetIdentity,
): boolean {
  return (
    left.schema === right.schema &&
    left.version === right.version &&
    left.id === right.id &&
    left.presetHash === right.presetHash
  );
}

function sameEnvironmentPresetIdentity(
  left: EnvironmentPresetIdentity,
  right: EnvironmentPresetIdentity,
): boolean {
  return (
    left.schema === right.schema &&
    left.version === right.version &&
    left.id === right.id &&
    left.presetHash === right.presetHash
  );
}

function hasTimelineId(
  idsByTick: ReadonlyMap<number, ReadonlySet<string>>,
  tick: number,
  id: string,
): boolean {
  return idsByTick.get(tick)?.has(id) === true;
}

function recordTimelineId(
  idsByTick: Map<number, Set<string>>,
  tick: number,
  id: string,
): void {
  const ids = idsByTick.get(tick);
  if (ids === undefined) {
    idsByTick.set(tick, new Set([id]));
  } else {
    ids.add(id);
  }
}

function normalizeVector(value: unknown): ShowcaseVector3 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    Object.keys(value).length !== 3 ||
    !value.every((component) =>
      typeof component === "number" ? Number.isFinite(component) : false,
    )
  ) {
    throw invalidAuthoring();
  }
  return Object.freeze([value[0], value[1], value[2]]) as ShowcaseVector3;
}

function isTimelineTick(
  value: unknown,
  durationTicks: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= durationTicks
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isUnitControl(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -1 && value <= 1;
}

function isUnsigned32(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffff_ffff
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256Identifier(value: unknown): value is string {
  return typeof value === "string" && SHA256_IDENTIFIER.test(value);
}

function isWaterPresetId(value: unknown): value is WaterPresetIdentity["id"] {
  return value === "calm" || value === "swell" || value === "storm";
}

function isQualityProfileId(
  value: unknown,
): value is QualityProfileIdentity["id"] {
  return value === "minimal" || value === "minimal-high-detail";
}

function invalidAuthoring(): TypeError {
  return new TypeError("The Showcase Preset authoring is invalid.");
}

function invalidPreset(): TypeError {
  return new TypeError("The Showcase Preset is not supported.");
}
