import { describe, expect, it, vi } from "vitest";
import type {
  DisturbanceSubmissionReceipt,
  HeroBreakerDisturbanceBatch,
  HostSimulationState,
} from "real-water";
import {
  REFERENCE_HERO_BREAKER_AMPLITUDE_METRES,
  REFERENCE_HERO_BREAKER_DIRECTION,
  REFERENCE_HERO_BREAKER_DISTURBANCE_ID,
  REFERENCE_HERO_BREAKER_FOAM_AMOUNT,
  REFERENCE_HERO_BREAKER_LIFETIME_TICKS,
  REFERENCE_HERO_BREAKER_POSITION_OFFSET,
  REFERENCE_HERO_BREAKER_PRIORITY,
  REFERENCE_HERO_BREAKER_RADIUS_METRES,
  REFERENCE_HERO_BREAKER_SPRAY_AMOUNT,
  createReferenceShowcaseSchedule,
} from "./reference-showcase-schedule.js";

const HERO_TICK = 1_800;
const SHOWCASE_DURATION_TICKS = 5_400;

describe("Reference Showcase schedule", () => {
  it("submits the authored Hero Breaker at the exact fixed tick", () => {
    const fixture = createScheduleFixture();
    fixture.schedule.afterFixedStep(fixture.state(HERO_TICK - 1));
    expect(fixture.submitDisturbances).not.toHaveBeenCalled();

    fixture.schedule.afterFixedStep(fixture.state(HERO_TICK));

    expect(fixture.submitDisturbances).toHaveBeenCalledTimes(1);
    const batch = fixture.submitted[0];
    expect(batch).toMatchObject({ kind: "hero-breaker", count: 1 });
    expect(batch?.ids).toEqual(
      Uint32Array.of(REFERENCE_HERO_BREAKER_DISTURBANCE_ID),
    );
    expect(batch?.positions).toEqual(
      Float32Array.of(
        14 + REFERENCE_HERO_BREAKER_POSITION_OFFSET.x,
        3,
        -6 + REFERENCE_HERO_BREAKER_POSITION_OFFSET.z,
      ),
    );
    expect(batch?.directions).toEqual(
      Float32Array.of(
        REFERENCE_HERO_BREAKER_DIRECTION.x,
        REFERENCE_HERO_BREAKER_DIRECTION.y,
        REFERENCE_HERO_BREAKER_DIRECTION.z,
      ),
    );
    expect(batch?.radii).toEqual(
      Float32Array.of(REFERENCE_HERO_BREAKER_RADIUS_METRES),
    );
    expect(batch?.amplitudes).toEqual(
      Float32Array.of(REFERENCE_HERO_BREAKER_AMPLITUDE_METRES),
    );
    expect(batch?.foamAmounts).toEqual(
      Float32Array.of(REFERENCE_HERO_BREAKER_FOAM_AMOUNT),
    );
    expect(batch?.sprayAmounts).toEqual(
      Float32Array.of(REFERENCE_HERO_BREAKER_SPRAY_AMOUNT),
    );
    expect(batch?.lifetimeTicks).toEqual(
      Uint16Array.of(REFERENCE_HERO_BREAKER_LIFETIME_TICKS),
    );
    expect(batch?.priorities).toEqual(
      Uint8Array.of(REFERENCE_HERO_BREAKER_PRIORITY),
    );
  });

  it("does not miss a crossed tick or repeat within the same traversal", () => {
    const fixture = createScheduleFixture();

    fixture.schedule.afterFixedStep(fixture.state(HERO_TICK + 1));
    fixture.schedule.afterFixedStep(fixture.state(HERO_TICK + 1));
    fixture.schedule.afterFixedStep(fixture.state(3_600));

    expect(fixture.submitDisturbances).toHaveBeenCalledTimes(1);
  });

  it("fires once in every Showcase loop", () => {
    const fixture = createScheduleFixture();

    for (let traversal = 0; traversal < 3; traversal += 1) {
      fixture.schedule.afterFixedStep(
        fixture.state(traversal * SHOWCASE_DURATION_TICKS + HERO_TICK),
      );
    }

    expect(fixture.submissionTicks).toEqual([
      HERO_TICK,
      SHOWCASE_DURATION_TICKS + HERO_TICK,
      SHOWCASE_DURATION_TICKS * 2 + HERO_TICK,
    ]);
  });

  it("re-arms after an explicit reset, a Host reset, and a ready-lease rebind", () => {
    const fixture = createScheduleFixture();
    fixture.schedule.afterFixedStep(fixture.state(HERO_TICK));

    fixture.schedule.reset();
    fixture.schedule.afterFixedStep(fixture.state(HERO_TICK));

    fixture.schedule.afterFixedStep(fixture.state(1, 1));
    fixture.schedule.afterFixedStep(fixture.state(HERO_TICK, 1));

    fixture.schedule.bindLease(fixture.lease);
    fixture.schedule.afterFixedStep(fixture.state(HERO_TICK, 2));

    expect(fixture.submitDisturbances).toHaveBeenCalledTimes(4);
  });

  it("requires a ready lease and rejects an unannounced rewind", () => {
    const schedule = createReferenceShowcaseSchedule();
    expect(() => schedule.afterFixedStep(hostState(1))).toThrowError(
      /ready lease/i,
    );

    const fixture = createScheduleFixture();
    fixture.schedule.afterFixedStep(fixture.state(20));
    expect(() =>
      fixture.schedule.afterFixedStep(fixture.state(19)),
    ).toThrowError(/moved backwards/i);
  });
});

function createScheduleFixture() {
  let runtimeState = hostState(0);
  const submitted: HeroBreakerDisturbanceBatch[] = [];
  const submissionTicks: number[] = [];
  const submitDisturbances = vi.fn(
    (batch: HeroBreakerDisturbanceBatch): DisturbanceSubmissionReceipt => {
      submitted.push(cloneBatch(batch));
      submissionTicks.push(runtimeState.tick);
      return Object.freeze({
        tick: runtimeState.tick,
        acceptedDisturbanceIds: Object.freeze([
          REFERENCE_HERO_BREAKER_DISTURBANCE_ID,
        ]),
        droppedDisturbanceIds: Object.freeze([]),
        displacedBodyWakeSources: Object.freeze([]),
        activeDisturbanceCount: 1,
      });
    },
  );
  const lease = {
    inspectRuntime: () => ({
      tick: runtimeState.tick,
      seaLevelMetres: runtimeState.seaLevelMetres,
      interactionAnchor: Object.freeze({ x: 14, z: -6 }),
    }),
    submitDisturbances,
  };
  const schedule = createReferenceShowcaseSchedule();
  schedule.bindLease(lease);
  return {
    lease,
    schedule,
    submitted,
    submissionTicks,
    submitDisturbances,
    state(tick: number, simulationResetRevision = 0): HostSimulationState {
      runtimeState = hostState(tick, simulationResetRevision);
      return runtimeState;
    },
  };
}

function hostState(
  tick: number,
  simulationResetRevision = 0,
): HostSimulationState {
  return Object.freeze({
    seed: 0,
    tick,
    timeSeconds: tick / 60,
    paused: false,
    originX: 0,
    originZ: 0,
    seaLevelMetres: 3,
    simulationResetRevision,
  });
}

function cloneBatch(
  batch: HeroBreakerDisturbanceBatch,
): HeroBreakerDisturbanceBatch {
  return Object.freeze({
    kind: batch.kind,
    count: batch.count,
    ids: batch.ids.slice(),
    positions: batch.positions.slice(),
    directions: batch.directions.slice(),
    radii: batch.radii.slice(),
    amplitudes: batch.amplitudes.slice(),
    foamAmounts: batch.foamAmounts.slice(),
    sprayAmounts: batch.sprayAmounts.slice(),
    lifetimeTicks: batch.lifetimeTicks.slice(),
    priorities: batch.priorities.slice(),
  });
}
