import { describe, expect, it } from "vitest";
import { PerspectiveCamera } from "three/webgpu";
import { createWaterPreset } from "../src/water-preset.js";
import type { OpenWaterRuntimeSnapshot } from "../src/runtime.js";
import {
  MAX_SECONDARY_PARTICLES,
  SECONDARY_PARTICLE_DROP_LIFECYCLE_REENTRY_FORBIDDEN,
  createSecondaryParticleContributionQuantizer,
  createSecondaryParticlePool,
  type SecondaryParticleCandidateBatch,
  type SecondaryParticleConsumerBinding,
  type SecondaryParticleConsumerReceipt,
} from "../src/secondary-particle-pool.js";
import {
  MAX_RISING_BUBBLES,
  MAX_SUBSURFACE_BUBBLE_CLOUD_PARTICLES,
  MAX_UNDERWATER_SUSPENDED_PARTICLES,
  RISING_BUBBLE_CONSUMER_ID,
  RISING_BUBBLE_MINIMUM_RETAINED_SLOTS,
  RISING_BUBBLE_SOFT_REQUEST_CEILING,
  SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
  SUBSURFACE_BUBBLE_CLOUD_MINIMUM_RETAINED_SLOTS,
  SUBSURFACE_BUBBLE_CLOUD_SOFT_REQUEST_CEILING,
  UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
  UNDERWATER_SUSPENDED_PARTICLE_MINIMUM_RETAINED_SLOTS,
  UNDERWATER_SUSPENDED_PARTICLE_SOFT_REQUEST_CEILING,
  createUnderwaterSecondaryParticleModel,
  type UnderwaterSecondaryParticleImpact,
  type UnderwaterSecondaryParticleInteraction,
} from "../src/underwater-secondary-particle-model.js";

const contributionReference = Object.freeze({
  width: 320,
  height: 180,
  space: "output-drawing-buffer" as const,
});

function createParticles() {
  return createUnderwaterSecondaryParticleModel({
    contributionReference,
    contributionQuantizer: createSecondaryParticleContributionQuantizer({
      projectedAreaResolution: contributionReference,
      referenceResolution: contributionReference,
    }),
  });
}

function camera(): PerspectiveCamera {
  const value = new PerspectiveCamera(70, 16 / 9, 0.1, 200);
  value.position.set(0, -2, 5);
  value.lookAt(0, -2, 0);
  value.updateProjectionMatrix();
  value.updateMatrixWorld(true);
  return value;
}

function pressureCamera(): PerspectiveCamera {
  const value = new PerspectiveCamera(90, 16 / 9, 0.1, 300);
  value.position.set(0, -5, 100);
  value.lookAt(0, -5, 0);
  value.updateProjectionMatrix();
  value.updateMatrixWorld(true);
  return value;
}

function snapshot(tick: number): OpenWaterRuntimeSnapshot {
  return Object.freeze({
    seed: 0x1020_3040,
    tick,
    timeSeconds: tick / 60,
    paused: false,
    originX: 0,
    originZ: 0,
    seaLevelMetres: 0,
    simulationResetRevision: 0,
    artisticControls: createWaterPreset("swell").artisticControls,
    controlRevision: 0,
    originRevision: 0,
    seaStateCutRevision: 0,
    cameraCutRevision: 0,
    interactionAnchor: Object.freeze({ x: 0, z: 0 }),
    interactionAnchorRevision: 0,
    activeDisturbanceCount: 0,
    activeBodyWakeCount: 0,
    attachedBodyCount: 0,
  });
}

function interaction(count = 0): UnderwaterSecondaryParticleInteraction {
  return Object.freeze({
    revision: count,
    anchorX: 0,
    anchorZ: 0,
    impacts: Object.freeze(
      Array.from({ length: count }, (_, index) =>
        Object.freeze({
          kind: "radial-impact" as const,
          x: index * 0.5,
          z: -index * 0.25,
          directionX: 1,
          directionZ: 0,
          radius: 2 + index * 0.1,
          amplitude: 0.5,
          startTimeSeconds: index / 60,
        }),
      ),
    ),
  });
}

type TestImpact = UnderwaterSecondaryParticleImpact;

function testImpact(x: number, z: number, startTick: number): TestImpact {
  return Object.freeze({
    kind: "radial-impact" as const,
    x,
    z,
    directionX: 1,
    directionZ: 0,
    radius: 2,
    amplitude: 0.5,
    startTimeSeconds: startTick / 60,
  });
}

function interactionFromImpacts(
  impacts: readonly TestImpact[],
  anchorX = 0,
  anchorZ = 0,
): UnderwaterSecondaryParticleInteraction {
  return Object.freeze({
    revision: impacts.length,
    anchorX,
    anchorZ,
    impacts: Object.freeze([...impacts]),
  });
}

function snapshotAtOrigin(
  tick: number,
  originX: number,
  originZ: number,
): OpenWaterRuntimeSnapshot {
  return Object.freeze({
    ...snapshot(tick),
    originX,
    originZ,
    originRevision: originX === 0 && originZ === 0 ? 0 : 1,
  });
}

function copyBatch(batch: SecondaryParticleCandidateBatch) {
  return {
    count: batch.count,
    high: batch.stableKeyHigh.slice(0, batch.count),
    low: batch.stableKeyLow.slice(0, batch.count),
    contributions: batch.contributionsQ16.slice(0, batch.count),
    payloads: batch.payloadHandles.slice(0, batch.count),
  };
}

function fullSprayBatch(): SecondaryParticleCandidateBatch {
  const count = 65_536;
  const stableKeyLow = new Uint32Array(count);
  const payloadHandles = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) {
    stableKeyLow[index] = index;
    payloadHandles[index] = index;
  }
  return {
    count,
    stableKeyHigh: new Uint32Array(count).fill(1),
    stableKeyLow,
    contributionsQ16: new Uint16Array(count).fill(65_535),
    payloadHandles,
  };
}

function dominantBatch(count: number): SecondaryParticleCandidateBatch {
  const stableKeyLow = new Uint32Array(count);
  const payloadHandles = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) {
    stableKeyLow[index] = index;
    payloadHandles[index] = index;
  }
  return {
    count,
    stableKeyHigh: new Uint32Array(count).fill(0xffff_ffff),
    stableKeyLow,
    contributionsQ16: new Uint16Array(count).fill(65_535),
    payloadHandles,
  };
}

function expectTypedArrayEqual(
  actual: Uint32Array | Uint16Array,
  expected: Uint32Array | Uint16Array,
): void {
  expect(actual.length).toBe(expected.length);
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`Typed-array mismatch at index ${String(index)}.`);
    }
  }
}

function receipt(
  requested: number,
  retained: number,
): SecondaryParticleConsumerReceipt {
  return {
    requested,
    requestedAboveSoftCeiling: 0,
    retained,
    floorRetained: retained,
    residenceRetained: 0,
    globalRetained: 0,
    thinned: requested - retained,
    invisibleOrOccluded: 0,
    reentryCooldown: 0,
    lifecycleReentryForbidden: 0,
    contributionMinimumQ16: 1,
    contributionMaximumQ16: 65_535,
    contributionRange: { minimumQ16: 1, maximumQ16: 65_535 },
    dropReasonMask: 0,
  };
}

function binding(
  consumerId: string,
  batch: SecondaryParticleCandidateBatch,
  payloads: readonly number[],
): SecondaryParticleConsumerBinding {
  const count = payloads.length;
  const stableKeyHigh = new Uint32Array(count);
  const stableKeyLow = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) {
    const payload = payloads[index] ?? 0;
    stableKeyHigh[index] = batch.stableKeyHigh[payload] ?? 0;
    stableKeyLow[index] = batch.stableKeyLow[payload] ?? 0;
  }
  return {
    consumerId,
    retained: {
      count: Uint32Array.of(count),
      stableKeyHigh,
      stableKeyLow,
      contributionsQ16: new Uint16Array(count),
      payloadHandles: Uint32Array.from(payloads),
      poolSlots: new Uint32Array(count),
    },
    receipt: receipt(batch.count, count),
  };
}

describe("underwater secondary-particle consumers", () => {
  it("declares the three preassigned pool plans exactly", () => {
    const particles = createParticles();

    expect(particles.consumerPlans).toEqual([
      {
        consumerId: UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
        contributionReference,
        maximumRequestCount: MAX_UNDERWATER_SUSPENDED_PARTICLES,
        minimumRetainedSlots:
          UNDERWATER_SUSPENDED_PARTICLE_MINIMUM_RETAINED_SLOTS,
        softRequestCeiling: UNDERWATER_SUSPENDED_PARTICLE_SOFT_REQUEST_CEILING,
        pressureReentryPolicy: "after-shared-cooldown",
      },
      {
        consumerId: SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
        contributionReference,
        maximumRequestCount: MAX_SUBSURFACE_BUBBLE_CLOUD_PARTICLES,
        minimumRetainedSlots: SUBSURFACE_BUBBLE_CLOUD_MINIMUM_RETAINED_SLOTS,
        softRequestCeiling: SUBSURFACE_BUBBLE_CLOUD_SOFT_REQUEST_CEILING,
        pressureReentryPolicy: "after-shared-cooldown",
      },
      {
        consumerId: RISING_BUBBLE_CONSUMER_ID,
        contributionReference,
        maximumRequestCount: MAX_RISING_BUBBLES,
        minimumRetainedSlots: RISING_BUBBLE_MINIMUM_RETAINED_SLOTS,
        softRequestCeiling: RISING_BUBBLE_SOFT_REQUEST_CEILING,
        pressureReentryPolicy: "forbidden-until-absent",
      },
    ]);
    particles.reset();
  });

  it("replays byte-exact fixed batches from seed, tick, and interaction input", () => {
    const first = createParticles();
    const replay = createParticles();
    const view = camera();
    const state = snapshot(73);
    const local = interaction(3);

    for (const consumerId of [
      UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
      SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
      RISING_BUBBLE_CONSUMER_ID,
    ] as const) {
      const actual = copyBatch(
        first.candidateBatch(consumerId, state, local, view),
      );
      const expected = copyBatch(
        replay.candidateBatch(consumerId, state, local, view),
      );
      expect(actual.count).toBe(expected.count);
      expectTypedArrayEqual(actual.high, expected.high);
      expectTypedArrayEqual(actual.low, expected.low);
      expectTypedArrayEqual(actual.contributions, expected.contributions);
      expectTypedArrayEqual(actual.payloads, expected.payloads);
    }

    first.reset();
    replay.reset();
  });

  it("keeps absolute source identity while rendering in floating-origin local space", () => {
    const particles = createParticles();
    const view = camera();
    const absoluteX = 1_024;
    const local = interactionFromImpacts(
      [testImpact(absoluteX, 0, 0)],
      absoluteX,
      0,
    );
    const unshifted = copyBatch(
      particles.candidateBatch(
        UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
        snapshotAtOrigin(73, 0, 0),
        local,
        view,
      ),
    );
    const shifted = copyBatch(
      particles.candidateBatch(
        UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
        snapshotAtOrigin(73, absoluteX, 0),
        local,
        view,
      ),
    );

    expectTypedArrayEqual(unshifted.high, shifted.high);
    expectTypedArrayEqual(unshifted.low, shifted.low);
    expect(
      Array.from(unshifted.contributions).every((value) => value === 0),
    ).toBe(true);
    expect(Array.from(shifted.contributions).some((value) => value > 0)).toBe(
      true,
    );

    particles.reset();
  });

  it("keeps the global base and source-local impact partitions stable across membership changes", () => {
    const particles = createParticles();
    const view = camera();
    const state = snapshot(73);
    const impactA = testImpact(1, -0.5, 12);
    const impactB = testImpact(-2, 0.75, 24);
    const baseCount = UNDERWATER_SUSPENDED_PARTICLE_SOFT_REQUEST_CEILING;
    const impactPartitionCount =
      (MAX_UNDERWATER_SUSPENDED_PARTICLES - baseCount) / 16;
    const base = copyBatch(
      particles.candidateBatch(
        UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
        state,
        interactionFromImpacts([]),
        view,
      ),
    );
    const onlyA = copyBatch(
      particles.candidateBatch(
        UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
        state,
        interactionFromImpacts([impactA]),
        view,
      ),
    );
    const aThenB = copyBatch(
      particles.candidateBatch(
        UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
        state,
        interactionFromImpacts([impactA, impactB]),
        view,
      ),
    );
    const bThenA = copyBatch(
      particles.candidateBatch(
        UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
        state,
        interactionFromImpacts([impactB, impactA]),
        view,
      ),
    );

    expectTypedArrayEqual(
      onlyA.high.slice(0, baseCount),
      base.high.slice(0, baseCount),
    );
    expectTypedArrayEqual(
      onlyA.low.slice(0, baseCount),
      base.low.slice(0, baseCount),
    );
    expectTypedArrayEqual(
      onlyA.high.slice(baseCount, baseCount + impactPartitionCount),
      aThenB.high.slice(baseCount, baseCount + impactPartitionCount),
    );
    expectTypedArrayEqual(
      onlyA.low.slice(baseCount, baseCount + impactPartitionCount),
      aThenB.low.slice(baseCount, baseCount + impactPartitionCount),
    );
    expectTypedArrayEqual(
      onlyA.high.slice(baseCount, baseCount + impactPartitionCount),
      bThenA.high.slice(
        baseCount + impactPartitionCount,
        baseCount + impactPartitionCount * 2,
      ),
    );
    expectTypedArrayEqual(
      onlyA.low.slice(baseCount, baseCount + impactPartitionCount),
      bThenA.low.slice(
        baseCount + impactPartitionCount,
        baseCount + impactPartitionCount * 2,
      ),
    );

    particles.reset();
  });

  it("starts impact lifecycles at their fixed start tick", () => {
    const particles = createParticles();
    const view = camera();
    const startTick = 120;
    const local = interactionFromImpacts([testImpact(0, 0, startTick)]);
    const future = copyBatch(
      particles.candidateBatch(
        SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
        snapshot(startTick - 1),
        local,
        view,
      ),
    );
    const started = copyBatch(
      particles.candidateBatch(
        SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
        snapshot(startTick),
        local,
        view,
      ),
    );
    const next = copyBatch(
      particles.candidateBatch(
        SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
        snapshot(startTick + 1),
        local,
        view,
      ),
    );
    const impactOffset = SUBSURFACE_BUBBLE_CLOUD_SOFT_REQUEST_CEILING;

    expect(future.count).toBe(impactOffset);
    expect(started.count).toBeGreaterThan(impactOffset);
    expect(started.contributions[impactOffset]).toBe(0);
    expect(next.contributions[impactOffset]).toBeGreaterThan(0);
    expect(next.high[impactOffset]).toBe(started.high[impactOffset]);
    expect(next.low[impactOffset]).toBe(started.low[impactOffset]);

    particles.reset();
  });

  it("preserves rising lifecycles when unrelated impact partitions enter or leave", () => {
    const particles = createParticles();
    const view = camera();
    const impactA = testImpact(1, 0, 0);
    const impactB = testImpact(-1, 0, 0);
    const baseCount = RISING_BUBBLE_SOFT_REQUEST_CEILING;
    const impactPartitionCount = (MAX_RISING_BUBBLES - baseCount) / 16;
    const onlyA = copyBatch(
      particles.candidateBatch(
        RISING_BUBBLE_CONSUMER_ID,
        snapshot(80),
        interactionFromImpacts([impactA]),
        view,
      ),
    );
    const both = copyBatch(
      particles.candidateBatch(
        RISING_BUBBLE_CONSUMER_ID,
        snapshot(81),
        interactionFromImpacts([impactA, impactB]),
        view,
      ),
    );
    const onlyAAgain = copyBatch(
      particles.candidateBatch(
        RISING_BUBBLE_CONSUMER_ID,
        snapshot(82),
        interactionFromImpacts([impactA]),
        view,
      ),
    );

    expectTypedArrayEqual(
      onlyA.high.slice(baseCount, baseCount + impactPartitionCount),
      both.high.slice(baseCount, baseCount + impactPartitionCount),
    );
    expectTypedArrayEqual(
      onlyA.low.slice(baseCount, baseCount + impactPartitionCount),
      onlyAAgain.low.slice(baseCount, baseCount + impactPartitionCount),
    );

    particles.reset();
  });

  it("ramps suspended and cloud opacity after pressure reentry", () => {
    const view = camera();
    const local = interactionFromImpacts([]);
    const cases = [
      {
        consumerId: UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
        duration: 4,
      },
      {
        consumerId: SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
        duration: 8,
      },
    ] as const;

    for (const { consumerId, duration } of cases) {
      const particles = createParticles();
      const initial = particles.candidateBatch(
        consumerId,
        snapshot(20),
        local,
        view,
      );
      particles.applyRetained(binding(consumerId, initial, [0]));
      const dropped = particles.candidateBatch(
        consumerId,
        snapshot(21),
        local,
        view,
      );
      particles.applyRetained(binding(consumerId, dropped, []));

      for (let step = 0; step < duration; step += 1) {
        const tick = 22 + step;
        const reentered = particles.candidateBatch(
          consumerId,
          snapshot(tick),
          local,
          view,
        );
        particles.applyRetained(binding(consumerId, reentered, [0]));
        const control = createParticles();
        const controlBatch = control.candidateBatch(
          consumerId,
          snapshot(tick),
          local,
          view,
        );
        control.applyRetained(binding(consumerId, controlBatch, [0]));
        const actual =
          particles.inspect().retainedOpacitySamples[consumerId] ?? 0;
        const full = control.inspect().retainedOpacitySamples[consumerId] ?? 0;
        expect(actual / full).toBeCloseTo((step + 1) / duration, 6);
        control.reset();
      }

      particles.reset();
    }
  });

  it("restores retention history before replacing a same-tick candidate set", () => {
    const consumerId = UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID;
    const view = camera();
    const local = interactionFromImpacts([]);
    const replaced = createParticles();
    const fresh = createParticles();

    for (const particles of [replaced, fresh]) {
      const initial = particles.candidateBatch(
        consumerId,
        snapshot(20),
        local,
        view,
      );
      particles.applyRetained(binding(consumerId, initial, [0]));
      const absent = particles.candidateBatch(
        consumerId,
        snapshot(21),
        local,
        view,
      );
      particles.applyRetained(binding(consumerId, absent, []));
    }

    const polluted = replaced.candidateBatch(
      consumerId,
      snapshot(22),
      local,
      view,
    );
    replaced.applyRetained(binding(consumerId, polluted, [0]));
    const replacement = replaced.candidateBatch(
      consumerId,
      snapshot(22),
      local,
      view,
    );
    replaced.applyRetained(binding(consumerId, replacement, []));

    const direct = fresh.candidateBatch(consumerId, snapshot(22), local, view);
    fresh.applyRetained(binding(consumerId, direct, []));

    const replacedNext = replaced.candidateBatch(
      consumerId,
      snapshot(23),
      local,
      view,
    );
    replaced.applyRetained(binding(consumerId, replacedNext, [0]));
    const freshNext = fresh.candidateBatch(
      consumerId,
      snapshot(23),
      local,
      view,
    );
    fresh.applyRetained(binding(consumerId, freshNext, [0]));

    expect(replaced.inspect().retainedOpacitySamples[consumerId]).toBe(
      fresh.inspect().retainedOpacitySamples[consumerId],
    );
    expect(
      Array.from(replaced.retainedLane(consumerId).colors.slice(0, 4)),
    ).toEqual(Array.from(fresh.retainedLane(consumerId).colors.slice(0, 4)));
    replaced.reset();
    fresh.reset();
  });

  it("uses fixed maximum storage and reaches genuine global pressure at peak input", () => {
    const particles = createParticles();
    const view = camera();
    const state = snapshot(80);
    const calm = interaction();
    const peak = interaction(16);

    const suspendedCalm = particles.candidateBatch(
      UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
      state,
      calm,
      view,
    );
    const suspendedStorage = suspendedCalm.stableKeyHigh;
    expect(suspendedCalm.count).toBe(
      UNDERWATER_SUSPENDED_PARTICLE_SOFT_REQUEST_CEILING,
    );
    expect(suspendedCalm.stableKeyHigh.length).toBe(
      MAX_UNDERWATER_SUSPENDED_PARTICLES,
    );

    const peakCounts = [
      particles.candidateBatch(
        UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
        state,
        peak,
        view,
      ).count,
      particles.candidateBatch(
        SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
        state,
        peak,
        view,
      ).count,
      particles.candidateBatch(RISING_BUBBLE_CONSUMER_ID, state, peak, view)
        .count,
    ];
    expect(peakCounts).toEqual([
      MAX_UNDERWATER_SUSPENDED_PARTICLES,
      MAX_SUBSURFACE_BUBBLE_CLOUD_PARTICLES,
      MAX_RISING_BUBBLES,
    ]);
    expect(65_536 + peakCounts.reduce((sum, count) => sum + count, 0)).toBe(
      147_456,
    );
    expect(
      particles.candidateBatch(
        UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
        state,
        calm,
        view,
      ).stableKeyHigh,
    ).toBe(suspendedStorage);

    particles.reset();
  });

  it("submits the peak populations into real cross-consumer pool pressure", () => {
    const particles = createParticles();
    const view = pressureCamera();
    const state = snapshot(80);
    const peak = interaction(16);
    const sprayPlan = {
      consumerId: "spray-droplet-mist",
      contributionReference,
      maximumRequestCount: 65_536,
      minimumRetainedSlots: 2_048,
      softRequestCeiling: 32_768,
      pressureReentryPolicy: "after-shared-cooldown" as const,
    };
    const pool = createSecondaryParticlePool({
      capacity: MAX_SECONDARY_PARTICLES,
      contribution: {
        projectedAreaReference: "output-drawing-buffer",
        referenceWidth: contributionReference.width,
        referenceHeight: contributionReference.height,
        screenAreaDivisor: 3_600,
        quantization: "q16-unorm-round-nearest",
      },
      hysteresis: {
        mode: "incumbent-bonus-residence-cooldown",
        retainedContributionBonusQ16: 4_096,
        minimumResidenceTicks: 4,
        reentryCooldownTicks: 4,
      },
      consumers: [sprayPlan, ...particles.consumerPlans],
    });

    pool.beginTick(state.tick, 0);
    pool.submit(pool.consumer(sprayPlan.consumerId), fullSprayBatch());
    for (const consumerId of [
      UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
      SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
      RISING_BUBBLE_CONSUMER_ID,
    ] as const) {
      pool.submit(
        pool.consumer(consumerId),
        particles.candidateBatch(consumerId, state, peak, view),
      );
    }
    const frame = pool.resolve();

    expect(frame.globalReceipt.requested).toBe(147_456);
    expect(frame.retainedCount).toBe(MAX_SECONDARY_PARTICLES);
    expect(frame.globalReceipt.thinned).toBe(16_384);
    expect(
      particles.consumerPlans.reduce(
        (sum, plan) =>
          sum + pool.consumer(plan.consumerId).receipt.floorRetained,
        0,
      ),
    ).toBe(
      UNDERWATER_SUSPENDED_PARTICLE_MINIMUM_RETAINED_SLOTS +
        SUBSURFACE_BUBBLE_CLOUD_MINIMUM_RETAINED_SLOTS +
        RISING_BUBBLE_MINIMUM_RETAINED_SLOTS,
    );

    particles.reset();
  });

  it("submits one rising key continuously, omits it at lifecycle end, then starts a new lifecycle", () => {
    const particles = createParticles();
    const view = camera();
    const local = interaction();
    const first = particles.candidateBatch(
      RISING_BUBBLE_CONSUMER_ID,
      snapshot(0),
      local,
      view,
    );
    const high = first.stableKeyHigh[0] ?? 0;
    const low = first.stableKeyLow[0] ?? 0;
    let absentTick: number | null = null;

    for (let tick = 1; tick <= 400; tick += 1) {
      const batch = particles.candidateBatch(
        RISING_BUBBLE_CONSUMER_ID,
        snapshot(tick),
        local,
        view,
      );
      let present = false;
      for (let index = 0; index < batch.count; index += 1) {
        if (
          batch.stableKeyHigh[index] === high &&
          batch.stableKeyLow[index] === low
        ) {
          present = true;
          break;
        }
      }
      if (!present) {
        absentTick = tick;
        break;
      }
    }

    expect(absentTick).not.toBeNull();
    const next = particles.candidateBatch(
      RISING_BUBBLE_CONSUMER_ID,
      snapshot((absentTick ?? 0) + 1),
      local,
      view,
    );
    expect(next.count).toBe(RISING_BUBBLE_SOFT_REQUEST_CEILING);
    expect(
      Array.from(
        { length: next.count },
        (_, index) =>
          `${String(next.stableKeyHigh[index])}:${String(next.stableKeyLow[index])}`,
      ),
    ).not.toContain(`${String(high)}:${String(low)}`);

    particles.reset();
  });

  it("turns a continuously submitted pressure-retired rising key into a terminal lifecycle drop", () => {
    const particles = createParticles();
    const view = pressureCamera();
    const local = interaction(16);
    const risingPlan = particles.consumerPlans.find(
      ({ consumerId }) => consumerId === RISING_BUBBLE_CONSUMER_ID,
    );
    if (risingPlan === undefined) {
      throw new Error("Missing rising-bubble consumer plan.");
    }
    const dominantPlan = {
      consumerId: "test-dominant",
      contributionReference,
      maximumRequestCount: MAX_SECONDARY_PARTICLES,
      minimumRetainedSlots: MAX_SECONDARY_PARTICLES - 256,
      softRequestCeiling: MAX_SECONDARY_PARTICLES,
      pressureReentryPolicy: "after-shared-cooldown" as const,
    };
    const pool = createSecondaryParticlePool({
      capacity: MAX_SECONDARY_PARTICLES,
      contribution: {
        projectedAreaReference: "output-drawing-buffer",
        referenceWidth: contributionReference.width,
        referenceHeight: contributionReference.height,
        screenAreaDivisor: 3_600,
        quantization: "q16-unorm-round-nearest",
      },
      hysteresis: {
        mode: "incumbent-bonus-residence-cooldown",
        retainedContributionBonusQ16: 4_096,
        minimumResidenceTicks: 4,
        reentryCooldownTicks: 4,
      },
      consumers: [dominantPlan, risingPlan],
    });
    const dominant = pool.consumer(dominantPlan.consumerId);
    const rising = pool.consumer(RISING_BUBBLE_CONSUMER_ID);
    const dominantCandidates = dominantBatch(MAX_SECONDARY_PARTICLES);

    for (const tick of [80, 81]) {
      pool.beginTick(tick, 0);
      pool.submit(dominant, dominantCandidates);
      pool.submit(
        rising,
        particles.candidateBatch(
          RISING_BUBBLE_CONSUMER_ID,
          snapshot(tick),
          local,
          view,
        ),
      );
      pool.resolve();
    }

    expect(rising.receipt.lifecycleReentryForbidden).toBeGreaterThan(0);
    expect(
      rising.receipt.dropReasonMask &
        SECONDARY_PARTICLE_DROP_LIFECYCLE_REENTRY_FORBIDDEN,
    ).toBe(SECONDARY_PARTICLE_DROP_LIFECYCLE_REENTRY_FORBIDDEN);
    expect(rising.receipt.reentryCooldown).toBe(0);

    particles.reset();
  });

  it("packs retained payloads into fixed per-consumer buffers", () => {
    const particles = createParticles();
    const view = camera();
    const state = snapshot(12);
    const local = interaction(1);
    for (const consumerId of [
      UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
      SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
      RISING_BUBBLE_CONSUMER_ID,
    ] as const) {
      const batch = particles.candidateBatch(consumerId, state, local, view);
      const lastPayload = batch.count - 1;
      particles.applyRetained(binding(consumerId, batch, [lastPayload, 0]));
      const lane = particles.retainedLane(consumerId);

      expect(lane.count).toBe(2);
      const firstPositions = lane.positions.slice(0, 6);
      const firstSizes = lane.sizes.slice(0, 2);
      const firstColors = lane.colors.slice(0, 8);
      expect(Array.from(firstSizes).every((size) => size > 0)).toBe(true);
      expect(Array.from(firstColors).every(Number.isFinite)).toBe(true);

      particles.applyRetained(binding(consumerId, batch, [0, lastPayload]));
      expect(Array.from(lane.positions.slice(0, 3))).toEqual(
        Array.from(firstPositions.slice(3, 6)),
      );
      expect(Array.from(lane.positions.slice(3, 6))).toEqual(
        Array.from(firstPositions.slice(0, 3)),
      );
      expect(Array.from(lane.sizes.slice(0, 2))).toEqual([
        firstSizes[1],
        firstSizes[0],
      ]);
      expect(Array.from(lane.colors.slice(0, 4))).toEqual(
        Array.from(firstColors.slice(4, 8)),
      );
      expect(Array.from(lane.colors.slice(4, 8))).toEqual(
        Array.from(firstColors.slice(0, 4)),
      );
    }

    expect(particles.inspect().retainedCounts).toEqual({
      [UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID]: 2,
      [SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID]: 2,
      [RISING_BUBBLE_CONSUMER_ID]: 2,
    });
    expect(
      particles.inspect().receipts[SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID],
    ).toMatchObject({ retained: 2 });

    particles.reset();
    expect(particles.inspect().retainedCounts).toEqual({
      [UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID]: 0,
      [SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID]: 0,
      [RISING_BUBBLE_CONSUMER_ID]: 0,
    });
  });
});
