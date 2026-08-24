import { describe, expect, it, vi } from "vitest";
import type {
  ArtisticControls,
  ArtisticControlUpdateReceipt,
  DisturbanceSubmissionReceipt,
  HostEnvironmentSnapshot,
  HeroBreakerDisturbanceBatch,
  HostSimulationState,
  ShowcaseCameraKeyframe,
} from "real-water";
import {
  createAuthoredShowcasePreset,
  createReferenceShowcasePreset,
  createWaterPreset,
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
  REFERENCE_STORM_FRONT_EVENT_ID,
  REFERENCE_STORM_FRONT_LIGHTNING_OFFSET_TICKS,
  createReferenceShowcaseSchedule,
} from "./reference-showcase-schedule.js";

const HERO_TICK = 1_800;
const STORM_TICK = 3_600;
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

    expect(fixture.submitDisturbances).toHaveBeenCalledTimes(2);
  });

  it("enters the authored Storm Front at its exact fixed tick", () => {
    const fixture = createScheduleFixture();

    fixture.schedule.afterFixedStep(fixture.state(STORM_TICK - 1));
    expect(fixture.updateArtisticControls).not.toHaveBeenCalled();
    expect(fixture.setEnvironmentState).not.toHaveBeenCalled();
    fixture.submitDisturbances.mockClear();
    fixture.submitted.length = 0;
    fixture.submissionTicks.length = 0;

    fixture.schedule.afterFixedStep(fixture.state(STORM_TICK));

    expect(fixture.updateArtisticControls).toHaveBeenCalledWith(
      createWaterPreset("storm").artisticControls,
    );
    expect(fixture.environmentStates.at(-1)).toMatchObject({
      weather: { rainIntensity: 0.9 },
      atmosphere: {
        cloudCoverage: 0.9,
        cloudShadowStrength: 0.75,
        stormAerosolIntensity: 0.8,
        lightningIntensity: 0,
      },
    });
    expect(REFERENCE_STORM_FRONT_EVENT_ID).toBe("weather-front");
    expect(fixture.submitDisturbances).toHaveBeenCalledTimes(1);
    expect(fixture.submitted[0]?.ids).toEqual(
      Uint32Array.of(REFERENCE_HERO_BREAKER_DISTURBANCE_ID),
    );
    expect(fixture.cameraStates.at(-1)).toMatchObject({
      tick: STORM_TICK,
      position: [-18, 5, 24],
      target: [0, 0, 0],
      verticalFovDegrees: 58,
    });
  });

  it("authors a bounded lightning transient from the fixed-tick timeline", () => {
    const fixture = createScheduleFixture();
    fixture.schedule.afterFixedStep(fixture.state(STORM_TICK));

    fixture.schedule.afterFixedStep(
      fixture.state(
        STORM_TICK + REFERENCE_STORM_FRONT_LIGHTNING_OFFSET_TICKS - 1,
      ),
    );
    expect(
      fixture.environmentStates.at(-1)?.atmosphere.lightningIntensity,
    ).toBe(0);

    fixture.schedule.afterFixedStep(
      fixture.state(STORM_TICK + REFERENCE_STORM_FRONT_LIGHTNING_OFFSET_TICKS),
    );
    expect(
      fixture.environmentStates.at(-1)?.atmosphere.lightningIntensity,
    ).toBe(1);
  });

  it("restores the base look at the next loop before replaying Storm Front", () => {
    const fixture = createScheduleFixture();
    fixture.schedule.afterFixedStep(fixture.state(STORM_TICK));
    fixture.schedule.afterFixedStep(fixture.state(SHOWCASE_DURATION_TICKS));

    expect(fixture.environmentStates.at(-1)).toMatchObject({
      weather: { rainIntensity: 0 },
      atmosphere: {
        stormAerosolIntensity: 0,
        lightningIntensity: 0,
      },
    });
    expect(fixture.artisticControlStates.at(-1)).toEqual(
      createWaterPreset("swell").artisticControls,
    );
    expect(fixture.cameraStates.at(-1)).toMatchObject({
      tick: 0,
      position: [12, 7, 18],
    });

    fixture.schedule.afterFixedStep(
      fixture.state(SHOWCASE_DURATION_TICKS + STORM_TICK),
    );
    expect(fixture.environmentStates.at(-1)?.weather.rainIntensity).toBe(0.9);
  });

  it("fires the focal and Storm Hero Breakers once in every Showcase loop", () => {
    const fixture = createScheduleFixture();

    for (let traversal = 0; traversal < 3; traversal += 1) {
      fixture.schedule.afterFixedStep(
        fixture.state(traversal * SHOWCASE_DURATION_TICKS + HERO_TICK),
      );
      fixture.schedule.afterFixedStep(
        fixture.state(traversal * SHOWCASE_DURATION_TICKS + STORM_TICK),
      );
    }

    expect(fixture.submissionTicks).toEqual([
      HERO_TICK,
      STORM_TICK,
      SHOWCASE_DURATION_TICKS + HERO_TICK,
      SHOWCASE_DURATION_TICKS + STORM_TICK,
      SHOWCASE_DURATION_TICKS * 2 + HERO_TICK,
      SHOWCASE_DURATION_TICKS * 2 + STORM_TICK,
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
    const schedule = createReferenceShowcaseSchedule({
      environment: { setEnvironmentState() {} },
      camera: { setCamera() {} },
    });
    expect(() => schedule.afterFixedStep(hostState(1))).toThrowError(
      /ready lease/i,
    );

    const fixture = createScheduleFixture();
    fixture.schedule.afterFixedStep(fixture.state(20));
    expect(() =>
      fixture.schedule.afterFixedStep(fixture.state(19)),
    ).toThrowError(/moved backwards/i);
  });

  it("rejects a Storm segment whose pinned look is not this build's look", () => {
    const reference = createReferenceShowcasePreset();
    const mismatched = createAuthoredShowcasePreset({
      id: reference.id,
      durationTicks: reference.durationTicks,
      waterPreset: reference.waterPreset,
      environmentPreset: reference.environmentPreset,
      qualityProfile: reference.qualityProfile,
      stormFront: {
        ...reference.stormFront,
        environmentPreset: {
          ...reference.stormFront.environmentPreset,
          presetHash: `sha256:${"0".repeat(64)}`,
        },
      },
      cameraTimeline: reference.cameraTimeline,
      eventTimeline: reference.eventTimeline,
    });

    expect(() =>
      createReferenceShowcaseSchedule({
        showcase: mismatched,
        environment: { setEnvironmentState() {} },
        camera: { setCamera() {} },
      }),
    ).toThrowError(/pinned preset identities/i);
  });
});

function createScheduleFixture() {
  let runtimeState = hostState(0);
  const submitted: HeroBreakerDisturbanceBatch[] = [];
  const submissionTicks: number[] = [];
  const artisticControlStates: ArtisticControls[] = [];
  const environmentStates: HostEnvironmentSnapshot[] = [];
  const cameraStates: ShowcaseCameraKeyframe[] = [];
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
  const updateArtisticControls = vi.fn(
    (controls: ArtisticControls): ArtisticControlUpdateReceipt => {
      artisticControlStates.push(structuredClone(controls));
      return Object.freeze({
        artisticControls: Object.freeze({ ...controls }),
        changed: true,
        revision: artisticControlStates.length,
        transition: "continuous",
        seaStateCutRevision: 0,
      });
    },
  );
  const setEnvironmentState = vi.fn((state: HostEnvironmentSnapshot): void => {
    environmentStates.push(structuredClone(state));
  });
  const setCamera = vi.fn((state: ShowcaseCameraKeyframe): void => {
    cameraStates.push(structuredClone(state));
  });
  const lease = {
    inspectRuntime: () => ({
      tick: runtimeState.tick,
      seaLevelMetres: runtimeState.seaLevelMetres,
      interactionAnchor: Object.freeze({ x: 14, z: -6 }),
    }),
    submitDisturbances,
    updateArtisticControls,
  };
  const schedule = createReferenceShowcaseSchedule({
    environment: { setEnvironmentState },
    camera: { setCamera },
  });
  schedule.bindLease(lease);
  updateArtisticControls.mockClear();
  setEnvironmentState.mockClear();
  artisticControlStates.length = 0;
  environmentStates.length = 0;
  setCamera.mockClear();
  cameraStates.length = 0;
  return {
    artisticControlStates,
    environmentStates,
    cameraStates,
    lease,
    schedule,
    submitted,
    submissionTicks,
    setEnvironmentState,
    setCamera,
    submitDisturbances,
    updateArtisticControls,
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
