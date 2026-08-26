import { describe, expect, it, vi } from "vitest";
import {
  createAuthoredShowcasePreset,
  createBlueNoonEnvironmentPreset,
  createCalmSunriseEnvironmentPreset,
  createMinimalWaterPrewarmManifest,
  createMinimalWaterQualityProfile,
  createReferenceShowcasePreset,
  createStormFrontEnvironmentPreset,
  createWaterPreset,
  type ArtisticControls,
  type ArtisticControlUpdateOptions,
  type ArtisticControlUpdateReceipt,
  type DisturbanceSubmissionReceipt,
  type HeroBreakerDisturbanceBatch,
  type HostEnvironmentSnapshot,
  type HostSimulationState,
  type ShowcaseCameraKeyframe,
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
  REFERENCE_PROXY_VESSEL_BODY_ID,
  REFERENCE_STORM_FRONT_LIGHTNING_OFFSET_TICKS,
  createReferenceShowcaseSchedule,
} from "./reference-showcase-schedule.js";

const HERO_TICK = 1_800;
const STORM_TICK = 3_600;
const SHOWCASE_DURATION_TICKS = 5_400;

describe("Reference Showcase schedule", () => {
  it("starts Calm Sunrise and enters all three authored looks at exact 30-second ticks", () => {
    const fixture = createScheduleFixture({ retainInitialWrites: true });

    expect(fixture.showcase.durationTicks).toBe(SHOWCASE_DURATION_TICKS);
    expect(fixture.artisticControlStates).toEqual([
      createWaterPreset("calm").artisticControls,
    ]);
    expect(fixture.environmentStates.at(-1)).toMatchObject({
      lighting: createCalmSunriseEnvironmentPreset().lighting,
      weather: { windStrength: 0.18, rainIntensity: 0 },
    });
    expect(fixture.bodyControls.at(-1)).toEqual({
      throttle: 0.45,
      steering: 0,
    });
    expect(fixture.cameraStates.at(-1)).toMatchObject({ tick: 0 });

    fixture.clearWrites();
    fixture.schedule.afterFixedStep(fixture.state(HERO_TICK - 1));
    expect(fixture.updateArtisticControls).not.toHaveBeenCalled();

    fixture.schedule.afterFixedStep(fixture.state(HERO_TICK));
    expect(fixture.artisticControlStates.at(-1)).toEqual(
      createWaterPreset("swell").artisticControls,
    );
    expect(fixture.environmentStates.at(-1)).toMatchObject({
      lighting: createBlueNoonEnvironmentPreset().lighting,
      weather: { windStrength: 0.55, rainIntensity: 0 },
    });
    expect(fixture.bodyControls.at(-1)).toEqual({
      throttle: 0.7,
      steering: 0.18,
    });
    expect(fixture.cameraStates.at(-1)).toMatchObject({
      tick: HERO_TICK,
      position: [36, 12, 18],
      verticalFovDegrees: 44,
    });

    fixture.schedule.afterFixedStep(fixture.state(STORM_TICK));
    expect(fixture.artisticControlStates.at(-1)).toEqual(
      createWaterPreset("storm").artisticControls,
    );
    expect(fixture.environmentStates.at(-1)).toMatchObject({
      lighting: createStormFrontEnvironmentPreset().lighting,
      weather: { rainIntensity: 0.9 },
      atmosphere: {
        cloudCoverage: 0.9,
        stormAerosolIntensity: 0.8,
        lightningIntensity: 0,
      },
    });
    expect(fixture.bodyControls.at(-1)).toEqual({
      throttle: 0.9,
      steering: -0.22,
    });
    expect(fixture.cameraStates.at(-1)).toMatchObject({
      tick: STORM_TICK,
      position: [-18, 5, 24],
      verticalFovDegrees: 58,
    });
    expect(
      fixture.updateArtisticControls.mock.calls.map(
        ([, options]) => options?.transition,
      ),
    ).toEqual(["sea-state-cut", "sea-state-cut"]);
  });

  it("submits the authored focal and Storm Hero Breakers with exact public batches", () => {
    const fixture = createScheduleFixture();
    fixture.schedule.afterFixedStep(fixture.state(HERO_TICK));

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

    fixture.schedule.afterFixedStep(fixture.state(STORM_TICK));
    expect(fixture.submissionTicks).toEqual([HERO_TICK, STORM_TICK]);
  });

  it("authors the bounded lightning transient from the fixed-tick Storm segment", () => {
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

  it("resets the body, look, camera, and bounded event receipt at the 5,400-tick loop", () => {
    const fixture = createScheduleFixture();
    fixture.schedule.afterFixedStep(fixture.state(STORM_TICK));
    fixture.schedule.afterFixedStep(fixture.state(SHOWCASE_DURATION_TICKS));

    expect(fixture.resetBody).toHaveBeenCalledTimes(2);
    expect(fixture.artisticControlStates.at(-1)).toEqual(
      createWaterPreset("calm").artisticControls,
    );
    expect(fixture.environmentStates.at(-1)).toMatchObject({
      weather: { rainIntensity: 0 },
      atmosphere: { stormAerosolIntensity: 0, lightningIntensity: 0 },
    });
    expect(fixture.bodyControls.at(-1)).toEqual({
      throttle: 0.45,
      steering: 0,
    });
    expect(fixture.cameraStates.at(-1)).toMatchObject({
      tick: SHOWCASE_DURATION_TICKS,
      position: [12, 7, 18],
    });
    expect(fixture.schedule.snapshot()).toMatchObject({
      tick: SHOWCASE_DURATION_TICKS,
      traversalTick: 0,
      activeLook: { id: "calm-sunrise" },
      events: [{ id: "showcase-start", tick: SHOWCASE_DURATION_TICKS }],
    });
  });

  it("disables every Director write while Sandbox owns the same runtime", () => {
    const fixture = createScheduleFixture();
    fixture.schedule.setEnabled(false);
    fixture.schedule.afterFixedStep(fixture.state(STORM_TICK));

    expect(fixture.updateArtisticControls).not.toHaveBeenCalled();
    expect(fixture.setEnvironmentState).not.toHaveBeenCalled();
    expect(fixture.setCamera).not.toHaveBeenCalled();
    expect(fixture.setBodyControls).not.toHaveBeenCalled();
    expect(fixture.submitDisturbances).not.toHaveBeenCalled();

    fixture.schedule.setEnabled(true);
    fixture.schedule.reset();
    expect(fixture.updateArtisticControls).toHaveBeenCalledWith(
      createWaterPreset("calm").artisticControls,
      { transition: "sea-state-cut" },
    );
    expect(fixture.setCamera).toHaveBeenCalledWith(
      fixture.showcase.cameraTimeline[0],
    );
  });

  it("cedes only look writes when manual controls claim an enabled Director timeline", () => {
    const fixture = createScheduleFixture();
    fixture.schedule.setLookControlOwner("manual");
    fixture.schedule.afterFixedStep(fixture.state(HERO_TICK));
    fixture.schedule.afterFixedStep(fixture.state(STORM_TICK));

    expect(fixture.updateArtisticControls).not.toHaveBeenCalled();
    expect(fixture.setEnvironmentState).not.toHaveBeenCalled();
    expect(fixture.setCamera).toHaveBeenCalled();
    expect(fixture.setBodyControls).toHaveBeenCalledWith({
      throttle: 0.9,
      steering: -0.22,
    });
    expect(fixture.submissionTicks).toEqual([HERO_TICK, STORM_TICK]);

    fixture.schedule.setLookControlOwner("showcase");
    expect(fixture.updateArtisticControls).toHaveBeenLastCalledWith(
      createWaterPreset("storm").artisticControls,
      { transition: "sea-state-cut" },
    );
  });

  it("re-arms after explicit reset, Host reset, and ready-lease rebind", () => {
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

  it("fails closed on seed, rewind, Quality Profile, look, or body divergence", () => {
    const fixture = createScheduleFixture();
    expect(() =>
      fixture.schedule.afterFixedStep({
        ...fixture.state(1),
        seed: fixture.showcase.seed + 1,
      }),
    ).toThrowError(/seed diverged/i);

    fixture.schedule.afterFixedStep(fixture.state(20));
    expect(() =>
      fixture.schedule.afterFixedStep(fixture.state(19)),
    ).toThrowError(/moved backwards/i);

    const highDetailLease = {
      ...fixture.lease,
      manifest: createMinimalWaterPrewarmManifest(
        createMinimalWaterQualityProfile("minimal-high-detail"),
      ),
    };
    expect(() => fixture.schedule.bindLease(highDetailLease)).toThrowError(
      /Quality Profile/i,
    );
    const sandboxSchedule = createReferenceShowcaseSchedule({
      environment: { setEnvironmentState() {} },
      camera: { setCamera() {} },
      body: createNoopBody(),
      enforceQualityProfile: false,
    });
    expect(() => sandboxSchedule.bindLease(highDetailLease)).not.toThrow();

    const mismatchedLook = createAuthoredShowcasePreset({
      id: fixture.showcase.id,
      durationTicks: fixture.showcase.durationTicks,
      seed: fixture.showcase.seed,
      waterPreset: fixture.showcase.waterPreset,
      environmentPreset: fixture.showcase.environmentPreset,
      qualityProfile: fixture.showcase.qualityProfile,
      stormFront: fixture.showcase.stormFront,
      lookTimeline: fixture.showcase.lookTimeline.map((look) =>
        look.id === "blue-noon-swell"
          ? { ...look, waterPreset: fixture.showcase.stormFront.waterPreset }
          : look,
      ),
      bodyTimeline: fixture.showcase.bodyTimeline,
      cameraTimeline: fixture.showcase.cameraTimeline,
      eventTimeline: fixture.showcase.eventTimeline,
      captureTimeline: fixture.showcase.captureTimeline,
    });
    expect(() =>
      createReferenceShowcaseSchedule({
        showcase: mismatchedLook,
        environment: { setEnvironmentState() {} },
        camera: { setCamera() {} },
        body: createNoopBody(),
      }),
    ).toThrowError(/pinned preset identities/i);

    expect(() =>
      createReferenceShowcaseSchedule({
        environment: { setEnvironmentState() {} },
        camera: { setCamera() {} },
        body: { ...createNoopBody(), bodyId: "other-body" },
      }),
    ).toThrowError(/body timeline/i);
  });

  it("requires a ready lease before playback", () => {
    const schedule = createReferenceShowcaseSchedule({
      environment: { setEnvironmentState() {} },
      camera: { setCamera() {} },
      body: createNoopBody(),
    });
    expect(() => schedule.afterFixedStep(hostState(1))).toThrowError(
      /ready lease/i,
    );
    expect(() => schedule.reset()).toThrowError(/ready lease/i);
  });
});

interface FixtureOptions {
  readonly retainInitialWrites?: boolean;
}

function createScheduleFixture(options: FixtureOptions = {}) {
  const showcase = createReferenceShowcasePreset();
  let runtimeState = hostState(0);
  const submitted: HeroBreakerDisturbanceBatch[] = [];
  const submissionTicks: number[] = [];
  const artisticControlStates: ArtisticControls[] = [];
  const environmentStates: HostEnvironmentSnapshot[] = [];
  const cameraStates: ShowcaseCameraKeyframe[] = [];
  const bodyControls: Array<{ throttle: number; steering: number }> = [];
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
    (
      controls: ArtisticControls,
      updateOptions?: ArtisticControlUpdateOptions,
    ): ArtisticControlUpdateReceipt => {
      artisticControlStates.push(structuredClone(controls));
      return Object.freeze({
        artisticControls: Object.freeze({ ...controls }),
        changed: true,
        revision: artisticControlStates.length,
        transition: updateOptions?.transition ?? "continuous",
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
  const resetBody = vi.fn();
  const setBodyControls = vi.fn(
    (controls: { readonly throttle: number; readonly steering: number }) => {
      bodyControls.push({ ...controls });
    },
  );
  const lease = {
    manifest: createMinimalWaterPrewarmManifest(),
    inspectRuntime: () => ({
      tick: runtimeState.tick,
      seaLevelMetres: runtimeState.seaLevelMetres,
      interactionAnchor: Object.freeze({ x: 14, z: -6 }),
    }),
    submitDisturbances,
    updateArtisticControls,
  };
  const schedule = createReferenceShowcaseSchedule({
    showcase,
    environment: { setEnvironmentState },
    camera: { setCamera },
    body: {
      bodyId: REFERENCE_PROXY_VESSEL_BODY_ID,
      reset: resetBody,
      setControls: setBodyControls,
    },
  });
  schedule.bindLease(lease);

  const clearWrites = (): void => {
    updateArtisticControls.mockClear();
    setEnvironmentState.mockClear();
    artisticControlStates.length = 0;
    environmentStates.length = 0;
    setCamera.mockClear();
    cameraStates.length = 0;
    setBodyControls.mockClear();
    bodyControls.length = 0;
    submitDisturbances.mockClear();
    submitted.length = 0;
    submissionTicks.length = 0;
  };
  if (options.retainInitialWrites !== true) {
    clearWrites();
  }
  return {
    artisticControlStates,
    bodyControls,
    cameraStates,
    clearWrites,
    environmentStates,
    lease,
    resetBody,
    schedule,
    showcase,
    submitted,
    submissionTicks,
    setBodyControls,
    setCamera,
    setEnvironmentState,
    submitDisturbances,
    updateArtisticControls,
    state(tick: number, simulationResetRevision = 0): HostSimulationState {
      runtimeState = hostState(tick, simulationResetRevision, showcase.seed);
      return runtimeState;
    },
  };
}

function hostState(
  tick: number,
  simulationResetRevision = 0,
  seed = createReferenceShowcasePreset().seed,
): HostSimulationState {
  return Object.freeze({
    seed,
    tick,
    timeSeconds: tick / 60,
    paused: false,
    originX: 0,
    originZ: 0,
    seaLevelMetres: 3,
    simulationResetRevision,
  });
}

function createNoopBody() {
  return {
    bodyId: REFERENCE_PROXY_VESSEL_BODY_ID,
    reset() {},
    setControls() {},
  };
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
