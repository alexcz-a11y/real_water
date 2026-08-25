import {
  createReferenceShowcasePreset,
  environmentPresetIdentity,
  waterPresetIdentity,
  type ArtisticControls,
  type DisturbanceSubmissionReceipt,
  type HeroBreakerDisturbanceBatch,
  type HostEnvironmentSnapshot,
  type HostSimulationState,
  type InteractionAnchor,
  type OpenWaterRuntimeSnapshot,
  type RealWaterLease,
  type ShowcaseBodyKeyframe,
  type ShowcaseCameraKeyframe,
  type ShowcaseLookKeyframe,
  type ShowcasePreset,
} from "real-water";
import {
  REFERENCE_AUTHORED_LOOKS,
  REFERENCE_STORM_AUTHORED_LOOK_ID,
  resolveReferenceAuthoredLook,
} from "./reference-authored-looks.js";

export const REFERENCE_HERO_BREAKER_EVENT_ID = "hero-breaker" as const;
export const REFERENCE_HERO_BREAKER_DISTURBANCE_ID = 0x1800_0001;
export const REFERENCE_HERO_BREAKER_POSITION_OFFSET = Object.freeze({
  x: 0,
  z: -8,
});
export const REFERENCE_HERO_BREAKER_DIRECTION = Object.freeze({
  x: 0,
  y: 0,
  z: 1,
});
export const REFERENCE_HERO_BREAKER_RADIUS_METRES = 10;
export const REFERENCE_HERO_BREAKER_AMPLITUDE_METRES = 2.25;
export const REFERENCE_HERO_BREAKER_FOAM_AMOUNT = 1;
export const REFERENCE_HERO_BREAKER_SPRAY_AMOUNT = 1;
export const REFERENCE_HERO_BREAKER_LIFETIME_TICKS = 240;
export const REFERENCE_HERO_BREAKER_PRIORITY = 255;
export const REFERENCE_STORM_FRONT_EVENT_ID = "weather-front" as const;
export const REFERENCE_STORM_FRONT_HERO_BREAKER_EVENT_ID =
  "storm-front-hero-breaker" as const;
export const REFERENCE_STORM_FRONT_LIGHTNING_OFFSET_TICKS = 90;
export const REFERENCE_STORM_FRONT_LIGHTNING_PERIOD_TICKS = 600;
export const REFERENCE_STORM_FRONT_LIGHTNING_HOLD_TICKS = 3;
export const REFERENCE_STORM_FRONT_LIGHTNING_DECAY_TICKS = 30;
export const REFERENCE_PROXY_VESSEL_BODY_ID = "reference-proxy-vessel" as const;

interface ReferenceShowcaseRuntime {
  readonly manifest: RealWaterLease["manifest"];
  inspectRuntime(): Pick<
    OpenWaterRuntimeSnapshot,
    "interactionAnchor" | "seaLevelMetres" | "tick"
  >;
  readonly submitDisturbances: RealWaterLease["submitDisturbances"];
  readonly updateArtisticControls: RealWaterLease["updateArtisticControls"];
}

export interface ReferenceShowcaseEnvironment {
  setEnvironmentState(state: HostEnvironmentSnapshot): void;
}

export interface ReferenceShowcaseCamera {
  setCamera(keyframe: ShowcaseCameraKeyframe): void;
}

export interface ReferenceShowcaseBody {
  readonly bodyId: string;
  reset(): void;
  setControls(controls: {
    readonly throttle: number;
    readonly steering: number;
  }): void;
}

export interface ReferenceShowcaseEventOccurrence {
  readonly id: string;
  readonly tick: number;
}

export interface ReferenceShowcaseScheduleSnapshot {
  readonly enabled: boolean;
  readonly tick: number;
  readonly traversalTick: number;
  readonly activeLook: ShowcaseLookKeyframe;
  readonly events: readonly ReferenceShowcaseEventOccurrence[];
}

export type ReferenceShowcaseLookControlOwner = "showcase" | "manual";

export interface ReferenceShowcaseSchedule {
  bindLease(lease: ReferenceShowcaseRuntime): void;
  afterFixedStep(state: HostSimulationState): void;
  setEnabled(enabled: boolean): void;
  setLookControlOwner(owner: ReferenceShowcaseLookControlOwner): void;
  reset(): void;
  snapshot(): ReferenceShowcaseScheduleSnapshot;
}

export interface ReferenceShowcaseScheduleOptions {
  readonly showcase?: ShowcasePreset;
  readonly environment: ReferenceShowcaseEnvironment;
  readonly camera: ReferenceShowcaseCamera;
  readonly body: ReferenceShowcaseBody;
  readonly enabled?: boolean;
  readonly enforceQualityProfile?: boolean;
  readonly onLookApplied?: (
    look: ShowcaseLookKeyframe,
    controls: ArtisticControls,
    environment: HostEnvironmentSnapshot,
  ) => void;
}

interface ResolvedReferenceLook {
  readonly controls: ArtisticControls;
  readonly environment: HostEnvironmentSnapshot;
}

/**
 * Executes the versioned Reference Showcase recipe on authoritative fixed
 * ticks. Director and deterministic QA both use this schedule; Sandbox only
 * changes ownership and enables its own Host inputs.
 */
export function createReferenceShowcaseSchedule(
  options: ReferenceShowcaseScheduleOptions,
): ReferenceShowcaseSchedule {
  const showcase = options.showcase ?? createReferenceShowcasePreset();
  const resolvedLooks = resolveReferenceLooks(showcase);
  assertReferenceBodyTimeline(showcase, options.body.bodyId);
  const heroEvent = showcase.eventTimeline.find(
    ({ id }) => id === REFERENCE_HERO_BREAKER_EVENT_ID,
  );
  const stormEvent = showcase.eventTimeline.find(
    ({ id }) => id === showcase.stormFront.eventId,
  );
  const stormHeroEvent = showcase.eventTimeline.find(
    ({ id }) => id === showcase.stormFront.heroBreakerEventId,
  );
  const startEvent = showcase.eventTimeline.find(
    ({ id }) => id === "showcase-start",
  );
  if (
    heroEvent === undefined ||
    stormEvent === undefined ||
    stormHeroEvent === undefined ||
    startEvent?.tick !== 0
  ) {
    throw new Error(
      "The Reference Showcase event timeline does not match the directed route.",
    );
  }

  const batch = createHeroBreakerBatchStorage();
  const firstLook = showcase.lookTimeline[0];
  if (firstLook === undefined || firstLook.tick !== 0) {
    throw new Error(
      "The Reference Showcase requires a look at fixed tick zero.",
    );
  }
  let activeLook = firstLook;
  let enabled = options.enabled ?? true;
  let eventOccurrences: ReferenceShowcaseEventOccurrence[] = [];
  let lastFixedTick = 0;
  let lease: ReferenceShowcaseRuntime | null = null;
  let lookControlOwner: ReferenceShowcaseLookControlOwner = "showcase";
  let simulationResetRevision: number | undefined;

  const resetTraversal = (): void => {
    activeLook = firstLook;
    eventOccurrences = [freezeEventOccurrence(startEvent.id, 0)];
    lastFixedTick = 0;
    simulationResetRevision = undefined;
  };

  const applyBodyControl = (keyframe: ShowcaseBodyKeyframe): void => {
    if (keyframe.bodyId !== options.body.bodyId) {
      throw new Error(
        `The Reference Showcase body ${keyframe.bodyId} is not attached.`,
      );
    }
    options.body.setControls({
      throttle: keyframe.throttle,
      steering: keyframe.steering,
    });
  };

  const applyLook = (keyframe: ShowcaseLookKeyframe, tick: number): void => {
    activeLook = keyframe;
    if (lookControlOwner !== "showcase" || lease === null) {
      return;
    }
    const resolved = resolvedLooks.get(keyframe.id);
    if (resolved === undefined) {
      throw new Error(`The Reference Showcase look ${keyframe.id} is unknown.`);
    }
    const environment =
      keyframe.id === REFERENCE_STORM_AUTHORED_LOOK_ID
        ? withLightning(
            resolved.environment,
            referenceStormFrontLightningIntensity(
              positiveModulo(tick, showcase.durationTicks) - stormEvent.tick,
            ),
          )
        : resolved.environment;
    lease.updateArtisticControls(resolved.controls, {
      transition: "sea-state-cut",
    });
    options.environment.setEnvironmentState(environment);
    options.onLookApplied?.(keyframe, resolved.controls, environment);
  };

  const applyFirstCamera = (): void => {
    const firstCamera = showcase.cameraTimeline[0];
    if (firstCamera !== undefined) {
      options.camera.setCamera(firstCamera);
    }
  };

  const resetPlayback = (): void => {
    resetTraversal();
    options.body.reset();
    for (const keyframe of showcase.bodyTimeline) {
      if (keyframe.tick !== 0) {
        break;
      }
      applyBodyControl(keyframe);
    }
    for (const keyframe of showcase.lookTimeline) {
      if (keyframe.tick !== 0) {
        break;
      }
      applyLook(keyframe, 0);
    }
    applyFirstCamera();
  };

  const applyStormEnvironment = (tick: number): void => {
    if (
      lookControlOwner !== "showcase" ||
      activeLook.id !== REFERENCE_STORM_AUTHORED_LOOK_ID ||
      lease === null
    ) {
      return;
    }
    const storm = resolvedLooks.get(REFERENCE_STORM_AUTHORED_LOOK_ID);
    if (storm === undefined) {
      throw new Error(
        "The Reference Showcase Storm Front look is unavailable.",
      );
    }
    const traversalTick = positiveModulo(tick, showcase.durationTicks);
    options.environment.setEnvironmentState(
      withLightning(
        storm.environment,
        referenceStormFrontLightningIntensity(traversalTick - stormEvent.tick),
      ),
    );
  };

  return Object.freeze({
    bindLease(nextLease: ReferenceShowcaseRuntime): void {
      if (options.enforceQualityProfile !== false) {
        assertShowcaseQuality(nextLease, showcase);
      }
      lease = nextLease;
      resetTraversal();
      if (enabled) {
        resetPlayback();
      }
    },
    afterFixedStep(state: HostSimulationState): void {
      assertFixedStepState(state);
      if (lease === null) {
        throw new Error(
          "The Reference Showcase schedule requires a ready lease before fixed-step playback.",
        );
      }
      if (!enabled) {
        lastFixedTick = state.tick;
        simulationResetRevision = state.simulationResetRevision;
        return;
      }
      if (state.seed !== showcase.seed) {
        throw new Error(
          "The Reference Showcase simulation seed diverged from its versioned recipe.",
        );
      }
      if (
        simulationResetRevision !== undefined &&
        simulationResetRevision !== state.simulationResetRevision
      ) {
        resetPlayback();
      }
      simulationResetRevision = state.simulationResetRevision;
      if (state.tick < lastFixedTick) {
        throw new Error(
          "The Reference Showcase fixed tick moved backwards without a simulation reset.",
        );
      }

      for (const boundary of crossedLoopBoundaries(
        showcase.durationTicks,
        lastFixedTick,
        state.tick,
      )) {
        if (boundary > 0) {
          options.body.reset();
        }
      }
      for (const keyframe of crossedShowcaseBodyKeyframes(
        showcase,
        lastFixedTick,
        state.tick,
      )) {
        applyBodyControl(keyframe);
      }
      for (const keyframe of crossedShowcaseLookKeyframes(
        showcase,
        lastFixedTick,
        state.tick,
      )) {
        applyLook(keyframe.item, keyframe.absoluteTick);
      }
      for (const keyframe of crossedShowcaseCameraKeyframes(
        showcase,
        lastFixedTick,
        state.tick,
      )) {
        options.camera.setCamera(keyframe);
      }

      for (const event of crossedShowcaseEvents(
        showcase,
        lastFixedTick,
        state.tick,
      )) {
        if (event.id === startEvent.id) {
          eventOccurrences = [];
        }
        eventOccurrences.push(
          freezeEventOccurrence(event.id, event.absoluteTick),
        );
        if (event.id === heroEvent.id || event.id === stormHeroEvent.id) {
          submitHeroBreaker(lease, state, batch);
        }
      }
      applyStormEnvironment(state.tick);
      lastFixedTick = state.tick;
    },
    setEnabled(nextEnabled: boolean): void {
      if (typeof nextEnabled !== "boolean") {
        throw new TypeError(
          "Reference Showcase enabled state must be boolean.",
        );
      }
      enabled = nextEnabled;
    },
    setLookControlOwner(owner: ReferenceShowcaseLookControlOwner): void {
      if (owner === lookControlOwner) {
        return;
      }
      lookControlOwner = owner;
      if (owner === "showcase" && enabled) {
        applyLook(activeLook, lastFixedTick);
        applyStormEnvironment(lastFixedTick);
      }
    },
    reset(): void {
      if (lease === null) {
        throw new Error(
          "The Reference Showcase schedule requires a ready lease before reset.",
        );
      }
      if (enabled) {
        resetPlayback();
      } else {
        resetTraversal();
      }
    },
    snapshot(): ReferenceShowcaseScheduleSnapshot {
      return Object.freeze({
        enabled,
        tick: lastFixedTick,
        traversalTick: positiveModulo(lastFixedTick, showcase.durationTicks),
        activeLook,
        events: Object.freeze([...eventOccurrences]),
      });
    },
  });
}

export function referenceStormFrontLightningIntensity(
  elapsedStormTicks: number,
): number {
  if (!Number.isSafeInteger(elapsedStormTicks)) {
    return 0;
  }
  const strikeAge =
    elapsedStormTicks - REFERENCE_STORM_FRONT_LIGHTNING_OFFSET_TICKS;
  if (strikeAge < 0) {
    return 0;
  }
  const cycle = positiveModulo(
    strikeAge,
    REFERENCE_STORM_FRONT_LIGHTNING_PERIOD_TICKS,
  );
  if (cycle < REFERENCE_STORM_FRONT_LIGHTNING_HOLD_TICKS) {
    return 1;
  }
  const decayAge = cycle - REFERENCE_STORM_FRONT_LIGHTNING_HOLD_TICKS;
  if (decayAge >= REFERENCE_STORM_FRONT_LIGHTNING_DECAY_TICKS) {
    return 0;
  }
  return 1 - decayAge / REFERENCE_STORM_FRONT_LIGHTNING_DECAY_TICKS;
}

function crossedShowcaseEvents(
  showcase: ShowcasePreset,
  fromTick: number,
  toTick: number,
): readonly { readonly id: string; readonly absoluteTick: number }[] {
  return Object.freeze(
    collectTimelineOccurrences(
      showcase.eventTimeline,
      showcase.durationTicks,
      fromTick,
      toTick,
    ).map(({ item, absoluteTick }) =>
      Object.freeze({ id: item.id, absoluteTick }),
    ),
  );
}

function crossedShowcaseCameraKeyframes(
  showcase: ShowcasePreset,
  fromTick: number,
  toTick: number,
): readonly ShowcaseCameraKeyframe[] {
  return Object.freeze(
    deduplicateOccurrences(
      collectTimelineOccurrences(
        showcase.cameraTimeline,
        showcase.durationTicks,
        fromTick,
        toTick,
      ),
      sameCameraKeyframe,
    ).map(({ item }) => item),
  );
}

function crossedShowcaseLookKeyframes(
  showcase: ShowcasePreset,
  fromTick: number,
  toTick: number,
): readonly TimelineOccurrence<ShowcaseLookKeyframe>[] {
  return Object.freeze(
    deduplicateOccurrences(
      collectTimelineOccurrences(
        showcase.lookTimeline,
        showcase.durationTicks,
        fromTick,
        toTick,
      ),
      sameLookKeyframe,
    ),
  );
}

function crossedShowcaseBodyKeyframes(
  showcase: ShowcasePreset,
  fromTick: number,
  toTick: number,
): readonly ShowcaseBodyKeyframe[] {
  return Object.freeze(
    deduplicateOccurrences(
      collectTimelineOccurrences(
        showcase.bodyTimeline,
        showcase.durationTicks,
        fromTick,
        toTick,
      ),
      sameBodyKeyframe,
    ).map(({ item }) => item),
  );
}

interface TimelineOccurrence<Item> {
  readonly absoluteTick: number;
  readonly item: Item;
  readonly sequence: number;
}

function collectTimelineOccurrences<Item extends { readonly tick: number }>(
  timeline: readonly Item[],
  durationTicks: number,
  fromTick: number,
  toTick: number,
): Array<TimelineOccurrence<Item>> {
  const occurrences: Array<TimelineOccurrence<Item>> = [];
  const firstTraversal = Math.max(0, Math.floor(fromTick / durationTicks));
  const lastTraversal = Math.floor(toTick / durationTicks);
  for (
    let traversal = firstTraversal;
    traversal <= lastTraversal;
    traversal += 1
  ) {
    timeline.forEach((item, sequence) => {
      const absoluteTick = traversal * durationTicks + item.tick;
      if (absoluteTick > fromTick && absoluteTick <= toTick) {
        occurrences.push({ absoluteTick, item, sequence });
      }
    });
  }
  occurrences.sort(
    (left, right) =>
      left.absoluteTick - right.absoluteTick || left.sequence - right.sequence,
  );
  return occurrences;
}

function deduplicateOccurrences<Item>(
  occurrences: readonly TimelineOccurrence<Item>[],
  sameItem: (left: Item, right: Item) => boolean,
): Array<TimelineOccurrence<Item>> {
  const deduplicated: Array<TimelineOccurrence<Item>> = [];
  for (const occurrence of occurrences) {
    const previous = deduplicated.at(-1);
    if (
      previous !== undefined &&
      previous.absoluteTick === occurrence.absoluteTick &&
      sameItem(previous.item, occurrence.item)
    ) {
      deduplicated[deduplicated.length - 1] = occurrence;
    } else {
      deduplicated.push(occurrence);
    }
  }
  return deduplicated;
}

function crossedLoopBoundaries(
  durationTicks: number,
  fromTick: number,
  toTick: number,
): readonly number[] {
  const boundaries: number[] = [];
  const first = Math.max(1, Math.floor(fromTick / durationTicks) + 1);
  const last = Math.floor(toTick / durationTicks);
  for (let traversal = first; traversal <= last; traversal += 1) {
    boundaries.push(traversal * durationTicks);
  }
  return boundaries;
}

function sameCameraKeyframe(
  left: ShowcaseCameraKeyframe,
  right: ShowcaseCameraKeyframe,
): boolean {
  return (
    sameVector(left.position, right.position) &&
    sameVector(left.target, right.target) &&
    left.verticalFovDegrees === right.verticalFovDegrees
  );
}

function sameLookKeyframe(
  left: ShowcaseLookKeyframe,
  right: ShowcaseLookKeyframe,
): boolean {
  return (
    left.id === right.id &&
    sameWaterPresetIdentity(left.waterPreset, right.waterPreset) &&
    sameEnvironmentPresetIdentity(
      left.environmentPreset,
      right.environmentPreset,
    )
  );
}

function sameBodyKeyframe(
  left: ShowcaseBodyKeyframe,
  right: ShowcaseBodyKeyframe,
): boolean {
  return (
    left.bodyId === right.bodyId &&
    left.throttle === right.throttle &&
    left.steering === right.steering
  );
}

function sameVector(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return left.every((value, index) => value === right[index]);
}

function resolveReferenceLooks(
  showcase: ShowcasePreset,
): ReadonlyMap<string, ResolvedReferenceLook> {
  const resolved = new Map<string, ResolvedReferenceLook>();
  const expectedIdentities = new Map<
    string,
    {
      readonly water: ShowcasePreset["waterPreset"];
      readonly environment: ShowcasePreset["environmentPreset"];
    }
  >();
  for (const { id } of REFERENCE_AUTHORED_LOOKS) {
    const look = resolveReferenceAuthoredLook(id);
    resolved.set(id, {
      controls: look.waterPreset.artisticControls,
      environment: toHostEnvironmentSnapshot(look.environmentPreset),
    });
    expectedIdentities.set(id, {
      water: waterPresetIdentity(look.waterPreset),
      environment: environmentPresetIdentity(look.environmentPreset),
    });
  }
  for (const keyframe of showcase.lookTimeline) {
    const expected = expectedIdentities.get(keyframe.id);
    if (
      expected === undefined ||
      !sameWaterPresetIdentity(keyframe.waterPreset, expected.water) ||
      !sameEnvironmentPresetIdentity(
        keyframe.environmentPreset,
        expected.environment,
      )
    ) {
      throw new Error(
        "The Reference Showcase look timeline does not match its pinned preset identities.",
      );
    }
  }
  if (
    showcase.stormFront.eventId !== REFERENCE_STORM_FRONT_EVENT_ID ||
    showcase.stormFront.heroBreakerEventId !==
      REFERENCE_STORM_FRONT_HERO_BREAKER_EVENT_ID
  ) {
    throw new Error(
      "The Reference Showcase Storm Front events do not match the prepared route.",
    );
  }
  return resolved;
}

function assertReferenceBodyTimeline(
  showcase: ShowcasePreset,
  bodyId: string,
): void {
  if (
    bodyId !== REFERENCE_PROXY_VESSEL_BODY_ID ||
    showcase.bodyTimeline.some(({ bodyId: scheduled }) => scheduled !== bodyId)
  ) {
    throw new Error(
      "The Reference Showcase body timeline does not match the proxy vessel.",
    );
  }
}

function assertShowcaseQuality(
  lease: ReferenceShowcaseRuntime,
  showcase: ShowcasePreset,
): void {
  const active = lease.manifest.qualityProfile;
  if (
    active.schema !== showcase.qualityProfile.schema ||
    active.version !== showcase.qualityProfile.version ||
    active.id !== showcase.qualityProfile.id ||
    active.profileHash !== showcase.qualityProfile.profileHash
  ) {
    throw new Error(
      "The ready lease Quality Profile does not match the Reference Showcase recipe.",
    );
  }
}

function sameWaterPresetIdentity(
  left: ShowcasePreset["waterPreset"],
  right: ShowcasePreset["waterPreset"],
): boolean {
  return (
    left.schema === right.schema &&
    left.version === right.version &&
    left.id === right.id &&
    left.presetHash === right.presetHash
  );
}

function sameEnvironmentPresetIdentity(
  left: ShowcasePreset["environmentPreset"],
  right: ShowcasePreset["environmentPreset"],
): boolean {
  return (
    left.schema === right.schema &&
    left.version === right.version &&
    left.id === right.id &&
    left.presetHash === right.presetHash
  );
}

function toHostEnvironmentSnapshot(environment: {
  readonly lighting: HostEnvironmentSnapshot["lighting"];
  readonly weather: HostEnvironmentSnapshot["weather"];
  readonly atmosphere: HostEnvironmentSnapshot["atmosphere"];
}): HostEnvironmentSnapshot {
  return Object.freeze({
    lighting: Object.freeze({ ...environment.lighting }),
    weather: Object.freeze({ ...environment.weather }),
    atmosphere: Object.freeze({ ...environment.atmosphere }),
  });
}

function withLightning(
  environment: HostEnvironmentSnapshot,
  lightningIntensity: number,
): HostEnvironmentSnapshot {
  return Object.freeze({
    lighting: environment.lighting,
    weather: environment.weather,
    atmosphere: Object.freeze({
      ...environment.atmosphere,
      lightningIntensity,
    }),
  });
}

function positiveModulo(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

function createHeroBreakerBatchStorage(): HeroBreakerDisturbanceBatch {
  return Object.freeze({
    kind: "hero-breaker",
    count: 1,
    ids: Uint32Array.of(REFERENCE_HERO_BREAKER_DISTURBANCE_ID),
    positions: new Float32Array(3),
    directions: Float32Array.of(
      REFERENCE_HERO_BREAKER_DIRECTION.x,
      REFERENCE_HERO_BREAKER_DIRECTION.y,
      REFERENCE_HERO_BREAKER_DIRECTION.z,
    ),
    radii: Float32Array.of(REFERENCE_HERO_BREAKER_RADIUS_METRES),
    amplitudes: Float32Array.of(REFERENCE_HERO_BREAKER_AMPLITUDE_METRES),
    foamAmounts: Float32Array.of(REFERENCE_HERO_BREAKER_FOAM_AMOUNT),
    sprayAmounts: Float32Array.of(REFERENCE_HERO_BREAKER_SPRAY_AMOUNT),
    lifetimeTicks: Uint16Array.of(REFERENCE_HERO_BREAKER_LIFETIME_TICKS),
    priorities: Uint8Array.of(REFERENCE_HERO_BREAKER_PRIORITY),
  });
}

function submitHeroBreaker(
  lease: ReferenceShowcaseRuntime,
  state: HostSimulationState,
  batch: HeroBreakerDisturbanceBatch,
): void {
  const runtime = lease.inspectRuntime();
  if (runtime.tick !== state.tick) {
    throw new Error(
      "The Reference Showcase schedule is not aligned to the ready runtime fixed tick.",
    );
  }
  writeHeroBreakerPosition(
    batch.positions,
    runtime.interactionAnchor,
    runtime.seaLevelMetres,
  );
  const receipt: DisturbanceSubmissionReceipt = lease.submitDisturbances(batch);
  if (
    receipt.tick !== state.tick ||
    !receipt.acceptedDisturbanceIds.includes(
      REFERENCE_HERO_BREAKER_DISTURBANCE_ID,
    )
  ) {
    throw new Error(
      "The Reference Showcase Hero Breaker was not accepted at its scheduled fixed tick.",
    );
  }
}

function writeHeroBreakerPosition(
  positions: Float32Array,
  anchor: InteractionAnchor,
  seaLevelMetres: number,
): void {
  positions[0] = anchor.x + REFERENCE_HERO_BREAKER_POSITION_OFFSET.x;
  positions[1] = seaLevelMetres;
  positions[2] = anchor.z + REFERENCE_HERO_BREAKER_POSITION_OFFSET.z;
}

function freezeEventOccurrence(
  id: string,
  tick: number,
): ReferenceShowcaseEventOccurrence {
  return Object.freeze({ id, tick });
}

function assertFixedStepState(state: HostSimulationState): void {
  if (
    !Number.isSafeInteger(state.tick) ||
    state.tick < 0 ||
    !Number.isSafeInteger(state.simulationResetRevision) ||
    state.simulationResetRevision < 0
  ) {
    throw new RangeError(
      "Reference Showcase fixed-step state requires non-negative safe tick revisions.",
    );
  }
}
