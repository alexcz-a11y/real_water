import type { EnvironmentPresetIdentity } from "./environment-preset.js";
import {
  ENVIRONMENT_PRESET_SCHEMA,
  ENVIRONMENT_PRESET_VERSION,
  createReferenceEnvironmentPreset,
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
export const SHOWCASE_PRESET_VERSION = 1 as const;

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
 * Caller-authored content used to create a Showcase Preset. The factory owns
 * schema, version, and hash fields so authors cannot accidentally stale them.
 *
 * @public
 */
export interface ShowcasePresetAuthoring {
  readonly id: string;
  readonly durationTicks: number;
  readonly waterPreset: WaterPresetIdentity;
  readonly environmentPreset: EnvironmentPresetIdentity;
  readonly qualityProfile: QualityProfileIdentity;
  readonly cameraTimeline: readonly ShowcaseCameraKeyframe[];
  readonly eventTimeline: readonly ShowcaseEventKeyframe[];
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
  "waterPreset",
  "environmentPreset",
  "qualityProfile",
  "cameraTimeline",
  "eventTimeline",
] as const;
const SHOWCASE_AUTHORING_KEYS = [
  "id",
  "durationTicks",
  "waterPreset",
  "environmentPreset",
  "qualityProfile",
  "cameraTimeline",
  "eventTimeline",
] as const;
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
const SHA256_IDENTIFIER = /^sha256:[0-9a-f]{64}$/u;

/**
 * Restores the built-in approximately 90-second directed Reference Experience
 * loop. This function only authors data; it does not play the timeline.
 *
 * @public
 */
export function createReferenceShowcasePreset(): ShowcasePreset {
  return createAuthoredShowcasePreset({
    id: "reference-loop",
    durationTicks: 5_400,
    waterPreset: waterPresetIdentity(createWaterPreset("swell")),
    environmentPreset: environmentPresetIdentity(
      createReferenceEnvironmentPreset(),
    ),
    qualityProfile: qualityProfileIdentity(createMinimalWaterQualityProfile()),
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
    !isPositiveSafeInteger(value.durationTicks)
  ) {
    throw invalidAuthoring();
  }

  const durationTicks = value.durationTicks;
  const content = {
    schema: SHOWCASE_PRESET_SCHEMA,
    version: SHOWCASE_PRESET_VERSION,
    id: value.id,
    durationTicks,
    waterPreset: normalizeWaterPresetIdentity(value.waterPreset),
    environmentPreset: normalizeEnvironmentPresetIdentity(
      value.environmentPreset,
    ),
    qualityProfile: normalizeQualityProfileIdentity(value.qualityProfile),
    cameraTimeline: normalizeCameraTimeline(
      value.cameraTimeline,
      durationTicks,
    ),
    eventTimeline: normalizeEventTimeline(value.eventTimeline, durationTicks),
  };

  return Object.freeze({
    schema: content.schema,
    version: content.version,
    id: content.id,
    presetHash: sha256Identifier(JSON.stringify(content)),
    durationTicks: content.durationTicks,
    waterPreset: content.waterPreset,
    environmentPreset: content.environmentPreset,
    qualityProfile: content.qualityProfile,
    cameraTimeline: content.cameraTimeline,
    eventTimeline: content.eventTimeline,
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
      waterPreset: value.waterPreset,
      environmentPreset: value.environmentPreset,
      qualityProfile: value.qualityProfile,
      cameraTimeline: value.cameraTimeline,
      eventTimeline: value.eventTimeline,
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
 * Migrates a previously committed Showcase Preset into the current schema.
 * Version 1 is current, so this release deliberately performs only validated
 * normalization and has no speculative historical reshape.
 *
 * @public
 */
export function migrateShowcasePreset(candidate: unknown): ShowcasePreset {
  return normalizeShowcasePreset(candidate as ShowcasePreset);
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
