import {
  createReferenceEnvironmentPreset,
  createReferenceShowcasePreset,
  createStormFrontEnvironmentPreset,
  createWaterPreset,
  environmentPresetIdentity,
  waterPresetIdentity,
  type ArtisticControls,
  type ArtisticControlUpdateReceipt,
  type DisturbanceSubmissionReceipt,
  type HostEnvironmentSnapshot,
  type HeroBreakerDisturbanceBatch,
  type HostSimulationState,
  type InteractionAnchor,
  type OpenWaterRuntimeSnapshot,
  type ShowcaseCameraKeyframe,
  type ShowcasePreset,
} from "real-water";

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

interface ReferenceShowcaseRuntime {
  inspectRuntime(): Pick<
    OpenWaterRuntimeSnapshot,
    "interactionAnchor" | "seaLevelMetres" | "tick"
  >;
  submitDisturbances(
    batch: HeroBreakerDisturbanceBatch,
  ): DisturbanceSubmissionReceipt;
  updateArtisticControls(
    controls: ArtisticControls,
  ): ArtisticControlUpdateReceipt;
}

export interface ReferenceShowcaseEnvironment {
  setEnvironmentState(state: HostEnvironmentSnapshot): void;
}

export interface ReferenceShowcaseCamera {
  setCamera(keyframe: ShowcaseCameraKeyframe): void;
}

export interface ReferenceShowcaseSchedule {
  bindLease(lease: ReferenceShowcaseRuntime): void;
  afterFixedStep(state: HostSimulationState): void;
  reset(): void;
}

export interface ReferenceShowcaseScheduleOptions {
  readonly showcase?: ShowcasePreset;
  readonly environment: ReferenceShowcaseEnvironment;
  readonly camera: ReferenceShowcaseCamera;
}

/**
 * Consumes the built-in Showcase semantic timeline on authoritative fixed
 * ticks. The schedule owns no simulation or particle capacity; it applies the
 * preset-pinned camera and looks and submits ordinary public Hero Breaker
 * batches to the ready lease.
 */
export function createReferenceShowcaseSchedule(
  options: ReferenceShowcaseScheduleOptions,
): ReferenceShowcaseSchedule {
  const showcase = options.showcase ?? createReferenceShowcasePreset();
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
  const referenceEnvironmentPreset = createReferenceEnvironmentPreset();
  const referenceEnvironment = toHostEnvironmentSnapshot(
    referenceEnvironmentPreset,
  );
  const stormEnvironmentPreset = createStormFrontEnvironmentPreset();
  const stormEnvironment = toHostEnvironmentSnapshot(stormEnvironmentPreset);
  const swellWaterPreset = createWaterPreset("swell");
  const swellControls = swellWaterPreset.artisticControls;
  const stormWaterPreset = createWaterPreset("storm");
  const stormControls = stormWaterPreset.artisticControls;
  assertPinnedShowcaseLooks(
    showcase,
    swellWaterPreset,
    referenceEnvironmentPreset,
    stormWaterPreset,
    stormEnvironmentPreset,
  );
  const batch = createHeroBreakerBatchStorage();
  let lease: ReferenceShowcaseRuntime | null = null;
  let lastFixedTick = 0;
  let simulationResetRevision: number | undefined;

  const resetTraversal = (): void => {
    lastFixedTick = 0;
    simulationResetRevision = undefined;
  };

  const applyBaseLook = (): void => {
    options.environment.setEnvironmentState(referenceEnvironment);
    lease?.updateArtisticControls(swellControls);
    const firstCamera = showcase.cameraTimeline[0];
    if (firstCamera !== undefined) {
      options.camera.setCamera(firstCamera);
    }
  };

  const applyStormLook = (tick: number): void => {
    if (stormEvent === undefined) {
      return;
    }
    const traversalTick = positiveModulo(tick, showcase.durationTicks);
    const lightningIntensity = referenceStormFrontLightningIntensity(
      traversalTick - stormEvent.tick,
    );
    options.environment.setEnvironmentState(
      withLightning(stormEnvironment, lightningIntensity),
    );
  };

  return Object.freeze({
    bindLease(nextLease: ReferenceShowcaseRuntime): void {
      lease = nextLease;
      resetTraversal();
      applyBaseLook();
    },
    afterFixedStep(state: HostSimulationState): void {
      assertFixedStepState(state);
      if (lease === null) {
        throw new Error(
          "The Reference Showcase schedule requires a ready lease before fixed-step playback.",
        );
      }
      if (
        simulationResetRevision !== undefined &&
        simulationResetRevision !== state.simulationResetRevision
      ) {
        resetTraversal();
        applyBaseLook();
      }
      simulationResetRevision = state.simulationResetRevision;
      if (state.tick < lastFixedTick) {
        throw new Error(
          "The Reference Showcase fixed tick moved backwards without a simulation reset.",
        );
      }

      for (const keyframe of crossedShowcaseCameraKeyframes(
        showcase,
        lastFixedTick,
        state.tick,
      )) {
        options.camera.setCamera(keyframe);
      }

      const crossed = crossedShowcaseEvents(
        showcase,
        lastFixedTick,
        state.tick,
      );
      for (const event of crossed) {
        if (event.id === startEvent?.id) {
          applyBaseLook();
        } else if (
          event.id === heroEvent?.id ||
          event.id === stormHeroEvent?.id
        ) {
          submitHeroBreaker(lease, state, batch);
        } else if (event.id === stormEvent?.id) {
          lease.updateArtisticControls(stormControls);
          applyStormLook(event.absoluteTick);
        }
      }
      const traversalTick = positiveModulo(state.tick, showcase.durationTicks);
      if (stormEvent !== undefined && traversalTick >= stormEvent.tick) {
        applyStormLook(state.tick);
      }
      lastFixedTick = state.tick;
    },
    reset(): void {
      resetTraversal();
      applyBaseLook();
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
  const occurrences = collectTimelineOccurrences(
    showcase.cameraTimeline,
    showcase.durationTicks,
    fromTick,
    toTick,
  );
  const deduplicated: typeof occurrences = [];
  for (const occurrence of occurrences) {
    const previous = deduplicated.at(-1);
    if (
      previous !== undefined &&
      previous.absoluteTick === occurrence.absoluteTick &&
      sameCameraKeyframe(previous.item, occurrence.item)
    ) {
      deduplicated[deduplicated.length - 1] = occurrence;
    } else {
      deduplicated.push(occurrence);
    }
  }
  return Object.freeze(deduplicated.map(({ item }) => item));
}

function collectTimelineOccurrences<Item extends { readonly tick: number }>(
  timeline: readonly Item[],
  durationTicks: number,
  fromTick: number,
  toTick: number,
): Array<{ readonly absoluteTick: number; readonly item: Item }> {
  const occurrences: Array<{
    readonly absoluteTick: number;
    readonly item: Item;
  }> = [];
  const firstTraversal = Math.max(0, Math.floor(fromTick / durationTicks));
  const lastTraversal = Math.floor(toTick / durationTicks);
  for (
    let traversal = firstTraversal;
    traversal <= lastTraversal;
    traversal += 1
  ) {
    for (const item of timeline) {
      const absoluteTick = traversal * durationTicks + item.tick;
      if (absoluteTick > fromTick && absoluteTick <= toTick) {
        occurrences.push({ absoluteTick, item });
      }
    }
  }
  occurrences.sort((left, right) => left.absoluteTick - right.absoluteTick);
  return occurrences;
}

function sameCameraKeyframe(
  left: ShowcaseCameraKeyframe,
  right: ShowcaseCameraKeyframe,
): boolean {
  return (
    left.position.every((value, index) => value === right.position[index]) &&
    left.target.every((value, index) => value === right.target[index]) &&
    left.verticalFovDegrees === right.verticalFovDegrees
  );
}

function assertPinnedShowcaseLooks(
  showcase: ShowcasePreset,
  swellWater: ReturnType<typeof createWaterPreset>,
  referenceEnvironment: ReturnType<typeof createReferenceEnvironmentPreset>,
  stormWater: ReturnType<typeof createWaterPreset>,
  stormEnvironment: ReturnType<typeof createStormFrontEnvironmentPreset>,
): void {
  const swellIdentity = waterPresetIdentity(swellWater);
  const referenceIdentity = environmentPresetIdentity(referenceEnvironment);
  const waterIdentity = waterPresetIdentity(stormWater);
  const environmentIdentity = environmentPresetIdentity(stormEnvironment);
  if (
    !sameWaterPresetIdentity(showcase.waterPreset, swellIdentity) ||
    !sameEnvironmentPresetIdentity(
      showcase.environmentPreset,
      referenceIdentity,
    ) ||
    showcase.stormFront.eventId !== REFERENCE_STORM_FRONT_EVENT_ID ||
    showcase.stormFront.heroBreakerEventId !==
      REFERENCE_STORM_FRONT_HERO_BREAKER_EVENT_ID ||
    !sameWaterPresetIdentity(showcase.stormFront.waterPreset, waterIdentity) ||
    !sameEnvironmentPresetIdentity(
      showcase.stormFront.environmentPreset,
      environmentIdentity,
    )
  ) {
    throw new Error(
      "The Reference Showcase Storm Front segment does not match its pinned preset identities.",
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
  const receipt = lease.submitDisturbances(batch);
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
