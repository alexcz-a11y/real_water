import {
  createReferenceShowcasePreset,
  type DisturbanceSubmissionReceipt,
  type HeroBreakerDisturbanceBatch,
  type HostSimulationState,
  type InteractionAnchor,
  type OpenWaterRuntimeSnapshot,
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

interface ReferenceShowcaseRuntime {
  inspectRuntime(): Pick<
    OpenWaterRuntimeSnapshot,
    "interactionAnchor" | "seaLevelMetres" | "tick"
  >;
  submitDisturbances(
    batch: HeroBreakerDisturbanceBatch,
  ): DisturbanceSubmissionReceipt;
}

export interface ReferenceShowcaseSchedule {
  bindLease(lease: ReferenceShowcaseRuntime): void;
  afterFixedStep(state: HostSimulationState): void;
  reset(): void;
}

export interface ReferenceShowcaseScheduleOptions {
  readonly showcase?: ShowcasePreset;
}

/**
 * Consumes the built-in Showcase semantic timeline on authoritative fixed
 * ticks. The schedule owns no simulation or particle capacity; it submits one
 * ordinary public Hero Breaker batch to the ready lease.
 */
export function createReferenceShowcaseSchedule(
  options: ReferenceShowcaseScheduleOptions = {},
): ReferenceShowcaseSchedule {
  const showcase = options.showcase ?? createReferenceShowcasePreset();
  const heroEvent = showcase.eventTimeline.find(
    ({ id }) => id === REFERENCE_HERO_BREAKER_EVENT_ID,
  );
  const batch = createHeroBreakerBatchStorage();
  let lease: ReferenceShowcaseRuntime | null = null;
  let lastFixedTick = 0;
  let simulationResetRevision: number | undefined;

  const resetTraversal = (): void => {
    lastFixedTick = 0;
    simulationResetRevision = undefined;
  };

  return Object.freeze({
    bindLease(nextLease: ReferenceShowcaseRuntime): void {
      lease = nextLease;
      resetTraversal();
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
      }
      simulationResetRevision = state.simulationResetRevision;
      if (state.tick < lastFixedTick) {
        throw new Error(
          "The Reference Showcase fixed tick moved backwards without a simulation reset.",
        );
      }

      if (heroEvent !== undefined) {
        const firstTraversal = Math.max(
          0,
          Math.floor(
            (lastFixedTick - heroEvent.tick) / showcase.durationTicks,
          ) + 1,
        );
        const lastTraversal = Math.floor(
          (state.tick - heroEvent.tick) / showcase.durationTicks,
        );
        for (
          let traversal = firstTraversal;
          traversal <= lastTraversal;
          traversal += 1
        ) {
          submitHeroBreaker(lease, state, batch);
        }
      }
      lastFixedTick = state.tick;
    },
    reset(): void {
      resetTraversal();
    },
  });
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
