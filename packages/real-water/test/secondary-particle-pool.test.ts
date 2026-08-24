import { describe, expect, it } from "vitest";
import { createWaterPreset } from "../src/water-preset.js";
import type { OpenWaterRuntimeSnapshot } from "../src/runtime.js";
import { createSecondaryParticleAllocationRoute } from "../src/secondary-particle-allocation-route.js";
import {
  MAX_SECONDARY_PARTICLES,
  SECONDARY_PARTICLE_DROP_GLOBAL_CONTRIBUTION_PRESSURE,
  SECONDARY_PARTICLE_DROP_INVISIBLE_OR_OCCLUDED,
  SECONDARY_PARTICLE_DROP_LIFECYCLE_REENTRY_FORBIDDEN,
  SECONDARY_PARTICLE_DROP_REENTRY_COOLDOWN,
  SECONDARY_PARTICLE_CONTRIBUTION_SCREEN_AREA_DIVISOR,
  SECONDARY_PARTICLE_MINIMUM_RESIDENCE_TICKS,
  SECONDARY_PARTICLE_REENTRY_COOLDOWN_TICKS,
  SECONDARY_PARTICLE_RETAINED_Q16_BONUS,
  createSecondaryParticleContributionQuantizer,
  createSecondaryParticlePool,
  type SecondaryParticleCandidateBatch,
  type SecondaryParticleConsumerPlan,
  type SecondaryParticlePoolPlan,
} from "../src/secondary-particle-pool.js";

function consumer(
  consumerId: string,
  maximumRequestCount: number,
  minimumRetainedSlots = 1,
  softRequestCeiling = maximumRequestCount,
  pressureReentryPolicy:
    | "after-shared-cooldown"
    | "forbidden-until-absent" = "after-shared-cooldown",
): SecondaryParticleConsumerPlan {
  return {
    consumerId,
    contributionReference: {
      width: 320,
      height: 180,
      space: "output-drawing-buffer",
    },
    maximumRequestCount,
    minimumRetainedSlots,
    softRequestCeiling,
    pressureReentryPolicy,
  };
}

function plan(
  consumers: readonly SecondaryParticleConsumerPlan[],
): SecondaryParticlePoolPlan {
  return {
    capacity: MAX_SECONDARY_PARTICLES,
    contribution: {
      projectedAreaReference: "output-drawing-buffer",
      referenceWidth: 320,
      referenceHeight: 180,
      screenAreaDivisor: SECONDARY_PARTICLE_CONTRIBUTION_SCREEN_AREA_DIVISOR,
      quantization: "q16-unorm-round-nearest",
    },
    hysteresis: {
      mode: "incumbent-bonus-residence-cooldown",
      retainedContributionBonusQ16: SECONDARY_PARTICLE_RETAINED_Q16_BONUS,
      minimumResidenceTicks: SECONDARY_PARTICLE_MINIMUM_RESIDENCE_TICKS,
      reentryCooldownTicks: SECONDARY_PARTICLE_REENTRY_COOLDOWN_TICKS,
    },
    consumers,
  };
}

function batch(options: {
  readonly count: number;
  readonly keyHigh?: number;
  readonly firstKeyLow?: number;
  readonly contributionQ16?: number;
  readonly contributionsQ16?: Uint16Array;
  readonly payloadOffset?: number;
}): SecondaryParticleCandidateBatch {
  const keyHigh = new Uint32Array(options.count).fill(options.keyHigh ?? 0);
  const keyLow = new Uint32Array(options.count);
  const payloadHandles = new Uint32Array(options.count);
  for (let index = 0; index < options.count; index += 1) {
    keyLow[index] = (options.firstKeyLow ?? 0) + index;
    payloadHandles[index] = (options.payloadOffset ?? 0) + index;
  }
  return {
    count: options.count,
    stableKeyHigh: keyHigh,
    stableKeyLow: keyLow,
    contributionsQ16:
      options.contributionsQ16 ??
      new Uint16Array(options.count).fill(options.contributionQ16 ?? 65_535),
    payloadHandles,
  };
}

function retainedKeys(binding: {
  readonly retained: {
    readonly count: Uint32Array;
    readonly stableKeyHigh: Uint32Array;
    readonly stableKeyLow: Uint32Array;
  };
}): string[] {
  const count = binding.retained.count[0] ?? 0;
  return Array.from(
    { length: count },
    (_, index) =>
      `${String(binding.retained.stableKeyHigh[index])}:${String(binding.retained.stableKeyLow[index])}`,
  );
}

function allocationSnapshot(binding: {
  readonly retained: {
    readonly count: Uint32Array;
    readonly stableKeyHigh: Uint32Array;
    readonly stableKeyLow: Uint32Array;
    readonly contributionsQ16: Uint16Array;
    readonly payloadHandles: Uint32Array;
    readonly poolSlots: Uint32Array;
  };
  readonly receipt: {
    readonly requested: number;
    readonly requestedAboveSoftCeiling: number;
    readonly retained: number;
    readonly floorRetained: number;
    readonly residenceRetained: number;
    readonly globalRetained: number;
    readonly thinned: number;
    readonly invisibleOrOccluded: number;
    readonly reentryCooldown: number;
    readonly lifecycleReentryForbidden: number;
    readonly contributionMinimumQ16: number;
    readonly contributionMaximumQ16: number;
    readonly dropReasonMask: number;
  };
}) {
  const count = binding.retained.count[0] ?? 0;
  return {
    keys: retainedKeys(binding),
    contributionsQ16: Array.from(
      binding.retained.contributionsQ16.subarray(0, count),
    ),
    payloadHandles: Array.from(
      binding.retained.payloadHandles.subarray(0, count),
    ),
    poolSlots: Array.from(binding.retained.poolSlots.subarray(0, count)),
    receipt: {
      requested: binding.receipt.requested,
      requestedAboveSoftCeiling: binding.receipt.requestedAboveSoftCeiling,
      retained: binding.receipt.retained,
      floorRetained: binding.receipt.floorRetained,
      residenceRetained: binding.receipt.residenceRetained,
      globalRetained: binding.receipt.globalRetained,
      thinned: binding.receipt.thinned,
      invisibleOrOccluded: binding.receipt.invisibleOrOccluded,
      reentryCooldown: binding.receipt.reentryCooldown,
      lifecycleReentryForbidden: binding.receipt.lifecycleReentryForbidden,
      contributionMinimumQ16: binding.receipt.contributionMinimumQ16,
      contributionMaximumQ16: binding.receipt.contributionMaximumQ16,
      dropReasonMask: binding.receipt.dropReasonMask,
    },
  };
}

describe("shared secondary-particle pool", () => {
  it("quantizes contribution from one output-drawing-buffer pixel-area ruler", () => {
    const reference = Object.freeze({ width: 2_560, height: 1_440 });
    const nativeQuantizer = createSecondaryParticleContributionQuantizer({
      projectedAreaResolution: reference,
      referenceResolution: reference,
    });
    const scaledQuantizer = createSecondaryParticleContributionQuantizer({
      projectedAreaResolution: { width: 1_920, height: 1_080 },
      referenceResolution: reference,
    });
    const qaQuantizer = createSecondaryParticleContributionQuantizer({
      projectedAreaResolution: { width: 320, height: 180 },
      referenceResolution: { width: 320, height: 180 },
    });
    const native = nativeQuantizer(1_024, 1, 1, 1);
    const scaled = scaledQuantizer(576, 1, 1, 1);

    expect(native).toBe(Math.round((1 - Math.exp(-1)) * 65_535));
    expect(scaled).toBe(native);
    expect(qaQuantizer(16, 1, 1, 1)).toBe(native);
  });

  it("rejects a consumer that submits against a different projected-area ruler", () => {
    const mismatched = {
      ...consumer("spray", 4),
      contributionReference: {
        width: 321,
        height: 180,
        space: "output-drawing-buffer" as const,
      },
    };
    expect(() => createSecondaryParticlePool(plan([mismatched]))).toThrow(
      /different contribution ruler/i,
    );
  });

  it("preserves visible consumer floors and lends unused floor capacity to global contribution competition", () => {
    const dominantCount = MAX_SECONDARY_PARTICLES - 1;
    const pool = createSecondaryParticlePool(
      plan([
        consumer("dominant", dominantCount),
        consumer("focal", 2, 2),
        consumer("unused", 8, 4),
      ]),
    );
    const dominant = pool.consumer("dominant");
    const focal = pool.consumer("focal");

    expect(pool.beginTick(10, 0)).toBe("accepting-candidates");
    pool.submit(
      dominant,
      batch({ count: dominantCount, keyHigh: 1, contributionQ16: 58_982 }),
    );
    pool.submit(focal, batch({ count: 2, keyHigh: 2, contributionQ16: 655 }));
    const frame = pool.resolve();

    expect(frame.retainedCount).toBe(MAX_SECONDARY_PARTICLES);
    expect(focal.retained.count[0]).toBe(2);
    expect(focal.receipt.floorRetained).toBe(2);
    expect(focal.receipt.thinned).toBe(0);
    expect(dominant.retained.count[0]).toBe(dominantCount - 1);
    expect(dominant.receipt.thinned).toBe(1);
    expect(dominant.receipt.dropReasonMask).toBe(
      SECONDARY_PARTICLE_DROP_GLOBAL_CONTRIBUTION_PRESSURE,
    );
    expect(pool.consumer("unused").retained.count[0]).toBe(0);
    expect(frame.globalReceipt.requested).toBe(MAX_SECONDARY_PARTICLES + 1);
    expect(frame.globalReceipt.floorRetained).toBe(3);
    expect(frame.globalReceipt.residenceRetained).toBe(0);
    expect(frame.globalReceipt.globalRetained).toBe(
      MAX_SECONDARY_PARTICLES - 3,
    );
  });

  it("thins low-contribution density before focal candidates under pressure", () => {
    const requestCount = MAX_SECONDARY_PARTICLES + 2;
    const pool = createSecondaryParticlePool(
      plan([consumer("spray", requestCount, 2)]),
    );
    const spray = pool.consumer("spray");
    const contributionsQ16 = new Uint16Array(requestCount);
    contributionsQ16.fill(50_000);
    contributionsQ16[0] = 100;
    contributionsQ16[1] = 200;

    pool.beginTick(0, 0);
    pool.submit(
      spray,
      batch({ count: requestCount, keyHigh: 1, contributionsQ16 }),
    );
    pool.resolve();

    expect(spray.receipt.retained).toBe(MAX_SECONDARY_PARTICLES);
    expect(spray.receipt.thinned).toBe(2);
    expect(spray.receipt.dropReasonMask).toBe(
      SECONDARY_PARTICLE_DROP_GLOBAL_CONTRIBUTION_PRESSURE,
    );
    expect(
      spray.retained.contributionsQ16.subarray(0, spray.receipt.retained),
    ).not.toContain(100);
    expect(
      spray.retained.contributionsQ16.subarray(0, spray.receipt.retained),
    ).not.toContain(200);
    expect(spray.receipt.contributionRange).toEqual({
      minimumQ16: 100,
      maximumQ16: 50_000,
    });
  });

  it("fills a visible consumer floor before applying reentry cooldown", () => {
    const pool = createSecondaryParticlePool(
      plan([
        consumer("dominant", MAX_SECONDARY_PARTICLES),
        consumer("focal", 2),
      ]),
    );
    const dominant = pool.consumer("dominant");
    const focal = pool.consumer("focal");
    const dominantCandidates = batch({
      count: MAX_SECONDARY_PARTICLES,
      keyHigh: 1,
      contributionQ16: 50_000,
    });

    pool.beginTick(0, 0);
    pool.submit(dominant, dominantCandidates);
    pool.submit(
      focal,
      batch({
        count: 2,
        keyHigh: 2,
        contributionsQ16: Uint16Array.of(60_000, 100),
      }),
    );
    pool.resolve();
    expect(retainedKeys(focal)).toEqual(["2:0"]);

    pool.beginTick(1, 0);
    pool.submit(dominant, dominantCandidates);
    pool.submit(
      focal,
      batch({
        count: 1,
        keyHigh: 2,
        firstKeyLow: 1,
        contributionQ16: 100,
      }),
    );
    pool.resolve();

    expect(retainedKeys(focal)).toEqual(["2:1"]);
    expect(focal.receipt.floorRetained).toBe(1);
    expect(focal.receipt.reentryCooldown).toBe(0);
  });

  it("reports lifecycle-terminal rejection distinctly after shared cooldown would have expired", () => {
    const pool = createSecondaryParticlePool(
      plan([
        consumer("dominant", MAX_SECONDARY_PARTICLES),
        consumer("rising-bubbles", 2, 1, 2, "forbidden-until-absent"),
      ]),
    );
    const dominant = pool.consumer("dominant");
    const rising = pool.consumer("rising-bubbles");
    const dominantCandidates = batch({
      count: MAX_SECONDARY_PARTICLES,
      keyHigh: 1,
      contributionQ16: 50_000,
    });
    const risingCandidates = batch({
      count: 2,
      keyHigh: 2,
      contributionsQ16: Uint16Array.of(100, 90),
    });

    pool.beginTick(0, 0);
    pool.submit(dominant, dominantCandidates);
    pool.submit(rising, risingCandidates);
    pool.resolve();
    expect(retainedKeys(rising)).toEqual(["2:0"]);

    risingCandidates.contributionsQ16[1] = 65_535;
    for (let tick = 1; tick <= 5; tick += 1) {
      pool.beginTick(tick, 0);
      pool.submit(dominant, dominantCandidates);
      pool.submit(rising, risingCandidates);
      pool.resolve();

      expect(retainedKeys(rising)).toEqual(["2:0"]);
      expect(rising.receipt.floorRetained).toBe(1);
      expect(rising.receipt.reentryCooldown).toBe(0);
      expect(rising.receipt.lifecycleReentryForbidden).toBe(1);
      expect(
        rising.receipt.dropReasonMask &
          SECONDARY_PARTICLE_DROP_LIFECYCLE_REENTRY_FORBIDDEN,
      ).toBe(SECONDARY_PARTICLE_DROP_LIFECYCLE_REENTRY_FORBIDDEN);
      expect(
        rising.receipt.dropReasonMask &
          SECONDARY_PARTICLE_DROP_REENTRY_COOLDOWN,
      ).toBe(0);
      expect(rising.receipt.requested).toBe(
        rising.receipt.retained +
          rising.receipt.thinned +
          rising.receipt.invisibleOrOccluded +
          rising.receipt.reentryCooldown +
          rising.receipt.lifecycleReentryForbidden,
      );
    }
    expect(pool.current().globalReceipt.lifecycleReentryForbidden).toBe(1);
  });

  it("is independent of consumer declaration, candidate traversal, and batch splitting order", () => {
    const first = createSecondaryParticlePool(
      plan([consumer("bravo", 2), consumer("alpha", 2)]),
    );
    const second = createSecondaryParticlePool(
      plan([consumer("alpha", 2), consumer("bravo", 2)]),
    );
    const alphaContributions = Uint16Array.of(26_214, 58_982);
    const bravoContributions = Uint16Array.of(45_875, 13_107);

    first.beginTick(0, 0);
    first.submit(
      first.consumer("bravo"),
      batch({
        count: 2,
        keyHigh: 2,
        firstKeyLow: 20,
        contributionsQ16: bravoContributions,
      }),
    );
    first.submit(
      first.consumer("alpha"),
      batch({
        count: 2,
        keyHigh: 1,
        firstKeyLow: 10,
        contributionsQ16: alphaContributions,
      }),
    );
    first.resolve();

    second.beginTick(0, 0);
    second.submit(
      second.consumer("alpha"),
      batch({
        count: 1,
        keyHigh: 1,
        firstKeyLow: 11,
        contributionQ16: 58_982,
        payloadOffset: 1,
      }),
    );
    second.submit(
      second.consumer("bravo"),
      batch({
        count: 1,
        keyHigh: 2,
        firstKeyLow: 21,
        contributionQ16: 13_107,
        payloadOffset: 1,
      }),
    );
    second.submit(
      second.consumer("alpha"),
      batch({
        count: 1,
        keyHigh: 1,
        firstKeyLow: 10,
        contributionQ16: 26_214,
      }),
    );
    second.submit(
      second.consumer("bravo"),
      batch({
        count: 1,
        keyHigh: 2,
        firstKeyLow: 20,
        contributionQ16: 45_875,
      }),
    );
    second.resolve();

    expect(retainedKeys(first.consumer("alpha"))).toEqual(
      retainedKeys(second.consumer("alpha")),
    );
    expect(retainedKeys(first.consumer("bravo"))).toEqual(
      retainedKeys(second.consumer("bravo")),
    );
    expect(
      Array.from(first.consumer("alpha").retained.poolSlots.subarray(0, 2)),
    ).toEqual(
      Array.from(second.consumer("alpha").retained.poolSlots.subarray(0, 2)),
    );
  });

  it("applies shared residence, replacement-margin, and reentry-cooldown hysteresis without reviving zero contribution", () => {
    const pool = createSecondaryParticlePool(
      plan([
        consumer(
          "particles",
          MAX_SECONDARY_PARTICLES + 1,
          1,
          MAX_SECONDARY_PARTICLES,
        ),
      ]),
    );
    const particles = pool.consumer("particles");
    const candidates = batch({
      count: MAX_SECONDARY_PARTICLES + 1,
      keyHigh: 1,
      firstKeyLow: 1,
      contributionQ16: 32_768,
    });
    candidates.stableKeyHigh[MAX_SECONDARY_PARTICLES] = 0;
    candidates.stableKeyLow[MAX_SECONDARY_PARTICLES] = 0;

    pool.beginTick(0, 0);
    pool.submit(particles, { ...candidates, count: MAX_SECONDARY_PARTICLES });
    const first = pool.resolve();
    const retainedStorage = particles.retained.poolSlots;
    const receiptIdentity = particles.receipt;

    for (let tick = 1; tick <= 4; tick += 1) {
      pool.beginTick(tick, 0);
      pool.submit(particles, {
        ...candidates,
        count: MAX_SECONDARY_PARTICLES,
      });
      const continuous = pool.resolve();
      if (tick === 1) {
        expect(continuous.globalReceipt.floorRetained).toBe(1);
        expect(continuous.globalReceipt.residenceRetained).toBe(
          MAX_SECONDARY_PARTICLES - 1,
        );
      }
    }

    candidates.contributionsQ16[MAX_SECONDARY_PARTICLES] =
      32_768 + SECONDARY_PARTICLE_RETAINED_Q16_BONUS / 2;
    pool.beginTick(5, 0);
    pool.submit(particles, candidates);
    pool.resolve();
    expect(retainedKeys(particles)).not.toContain("0:0");

    candidates.contributionsQ16[MAX_SECONDARY_PARTICLES] =
      32_768 + SECONDARY_PARTICLE_RETAINED_Q16_BONUS * 2;
    for (let tick = 6; tick <= 8; tick += 1) {
      pool.beginTick(tick, 0);
      pool.submit(particles, candidates);
      pool.resolve();
      expect(retainedKeys(particles)).not.toContain("0:0");
      expect(particles.receipt.reentryCooldown).toBe(1);
      expect(particles.receipt.lifecycleReentryForbidden).toBe(0);
      expect(
        particles.receipt.dropReasonMask &
          SECONDARY_PARTICLE_DROP_REENTRY_COOLDOWN,
      ).toBe(SECONDARY_PARTICLE_DROP_REENTRY_COOLDOWN);
    }
    pool.beginTick(9, 0);
    pool.submit(particles, candidates);
    pool.resolve();
    expect(retainedKeys(particles)).toContain("0:0");
    expect(particles.retained.poolSlots).toBe(retainedStorage);
    expect(particles.receipt).toBe(receiptIdentity);
    expect(pool.current()).toBe(first);

    const zeroAndVisible = batch({
      count: 2,
      keyHigh: 0,
      firstKeyLow: 0,
      contributionsQ16: Uint16Array.of(0, 16_384),
    });
    pool.beginTick(10, 0);
    pool.submit(particles, zeroAndVisible);
    pool.resolve();
    expect(retainedKeys(particles)).toEqual(["0:1"]);
    expect(particles.receipt.invisibleOrOccluded).toBe(1);
    expect(particles.receipt.dropReasonMask).toBe(
      SECONDARY_PARTICLE_DROP_INVISIBLE_OR_OCCLUDED,
    );
  });

  it("treats soft request ceilings as inspectable planning thresholds, never quotas", () => {
    const pool = createSecondaryParticlePool(
      plan([consumer("spray", 4, 1, 2)]),
    );
    const spray = pool.consumer("spray");
    pool.beginTick(0, 0);
    pool.submit(spray, batch({ count: 4, contributionQ16: 39_321 }));
    pool.resolve();

    expect(spray.receipt.requested).toBe(4);
    expect(spray.receipt.requestedAboveSoftCeiling).toBe(2);
    expect(spray.receipt.retained).toBe(4);
    expect(spray.receipt.thinned).toBe(0);
  });

  it("keeps the previous successful frame authoritative after an invalid transaction", () => {
    const pool = createSecondaryParticlePool(plan([consumer("spray", 2)]));
    const spray = pool.consumer("spray");
    pool.beginTick(0, 0);
    pool.submit(spray, batch({ count: 1, contributionQ16: 32_768 }));
    const previous = pool.resolve();

    pool.beginTick(1, 0);
    expect(() =>
      pool.submit(
        spray,
        batch({
          count: 1,
          contributionsQ16: Float32Array.of(Number.NaN) as never,
        }),
      ),
    ).toThrow(/Uint16Array/i);
    expect(pool.current()).toBe(previous);
    expect(() => pool.resolve()).toThrow(/invalid/i);
  });

  it("rejects duplicate stable keys, reuses an identical allocation tuple, and reopens for a changed revision", () => {
    const pool = createSecondaryParticlePool(plan([consumer("spray", 2)]));
    const spray = pool.consumer("spray");
    pool.beginTick(0, 0);
    pool.submit(spray, batch({ count: 1, contributionQ16: 32_768 }));
    const frame = pool.resolve();
    expect(pool.beginTick(0, 0)).toBe("reuse-current-tick");
    expect(pool.current()).toBe(frame);

    expect(pool.beginTick(0, 0, 1)).toBe("accepting-candidates");
    pool.submit(
      spray,
      batch({
        count: 1,
        firstKeyLow: 1,
        contributionQ16: 45_875,
      }),
    );
    const revised = pool.resolve();
    expect(retainedKeys(spray)).toEqual(["0:1"]);
    expect(pool.beginTick(0, 0, 1)).toBe("reuse-current-tick");
    expect(pool.current()).toBe(revised);

    pool.beginTick(1, 0);
    const duplicate = batch({ count: 2, contributionQ16: 32_768 });
    duplicate.stableKeyLow[1] = duplicate.stableKeyLow[0] ?? 0;
    expect(() => pool.submit(spray, duplicate)).toThrow(/duplicate.*key/i);
  });

  it("recomputes same-tick revisions from the first-submit checkpoint", () => {
    const allocationPlan = plan([consumer("particles", 4)]);
    const prior = batch({
      count: 2,
      firstKeyLow: 10,
      contributionsQ16: Uint16Array.of(30_000, 40_000),
    });
    const allocationA = batch({
      count: 2,
      firstKeyLow: 11,
      contributionsQ16: Uint16Array.of(50_000, 20_000),
      payloadOffset: 100,
    });
    const allocationB = batch({
      count: 2,
      firstKeyLow: 10,
      contributionsQ16: Uint16Array.of(35_000, 45_000),
      payloadOffset: 200,
    });
    allocationB.stableKeyLow[1] = 13;

    const createWithPriorHistory = () => {
      const pool = createSecondaryParticlePool(allocationPlan);
      const particles = pool.consumer("particles");
      pool.beginTick(0, 0);
      pool.submit(particles, prior);
      pool.resolve();
      return { pool, particles };
    };

    const revised = createWithPriorHistory();
    revised.pool.beginTick(1, 0, 0);
    revised.pool.submit(revised.particles, allocationA);
    revised.pool.resolve();
    const firstA = allocationSnapshot(revised.particles);

    expect(revised.pool.beginTick(1, 0, 1)).toBe("accepting-candidates");
    revised.pool.submit(revised.particles, allocationB);
    revised.pool.resolve();
    const resultB = allocationSnapshot(revised.particles);

    const freshB = createWithPriorHistory();
    freshB.pool.beginTick(1, 0, 1);
    freshB.pool.submit(freshB.particles, allocationB);
    freshB.pool.resolve();
    expect(resultB).toEqual(allocationSnapshot(freshB.particles));

    expect(revised.pool.beginTick(1, 0, 0)).toBe("accepting-candidates");
    revised.pool.submit(revised.particles, allocationA);
    revised.pool.resolve();

    const freshA = createWithPriorHistory();
    freshA.pool.beginTick(1, 0, 0);
    freshA.pool.submit(freshA.particles, allocationA);
    freshA.pool.resolve();
    expect(allocationSnapshot(revised.particles)).toEqual(firstA);
    expect(allocationSnapshot(revised.particles)).toEqual(
      allocationSnapshot(freshA.particles),
    );
  });

  it("rolls back same-tick lifecycle-terminal retirement before recomputing", () => {
    const pool = createSecondaryParticlePool(
      plan([
        consumer(
          "rising-bubbles",
          MAX_SECONDARY_PARTICLES + 1,
          1,
          MAX_SECONDARY_PARTICLES + 1,
          "forbidden-until-absent",
        ),
      ]),
    );
    const rising = pool.consumer("rising-bubbles");
    const candidates = batch({
      count: MAX_SECONDARY_PARTICLES + 1,
      contributionQ16: 50_000,
    });

    pool.beginTick(0, 0);
    pool.submit(rising, { ...candidates, count: MAX_SECONDARY_PARTICLES });
    pool.resolve();

    candidates.contributionsQ16[0] = 100;
    candidates.contributionsQ16[MAX_SECONDARY_PARTICLES] = 60_000;
    pool.beginTick(5, 0, 0);
    pool.submit(rising, candidates);
    pool.resolve();
    expect(
      rising.retained.stableKeyLow
        .subarray(0, rising.receipt.retained)
        .includes(0),
    ).toBe(false);

    candidates.contributionsQ16[0] = 65_535;
    candidates.contributionsQ16[1] = 100;
    expect(pool.beginTick(5, 0, 1)).toBe("accepting-candidates");
    pool.submit(rising, candidates);
    pool.resolve();

    const retained = rising.retained.stableKeyLow.subarray(
      0,
      rising.receipt.retained,
    );
    expect(retained.includes(0)).toBe(true);
    expect(retained.includes(1)).toBe(false);
    expect(rising.receipt.lifecycleReentryForbidden).toBe(0);
    expect(rising.receipt.thinned).toBe(1);
  });

  it("starts a fresh allocation epoch when the continuity revision changes", () => {
    const pool = createSecondaryParticlePool(plan([consumer("spray", 2)]));
    const spray = pool.consumer("spray");
    pool.beginTick(10, 0);
    pool.submit(spray, batch({ count: 1, contributionQ16: 32_768 }));
    pool.resolve();

    expect(pool.beginTick(0, 1)).toBe("accepting-candidates");
    pool.submit(spray, batch({ count: 1, contributionQ16: 32_768 }));
    const reset = pool.resolve();
    expect(reset.tick).toBe(0);
    expect(reset.continuityRevision).toBe(1);
    expect(reset.globalReceipt.residenceRetained).toBe(0);
  });

  it("reuses same-tick allocation and opens a fresh epoch after a tick rewind", () => {
    const pool = createSecondaryParticlePool(plan([consumer("spray", 1)]));
    const route = createSecondaryParticleAllocationRoute({
      pool,
      participants: [
        {
          consumerId: "spray",
          candidateInputRevision: () => 0,
          candidateBatch: () => batch({ count: 1, contributionQ16: 32_768 }),
          applyRetained() {},
        },
      ],
    });
    const interaction = Object.freeze({
      revision: 0,
      anchorX: 0,
      anchorZ: 0,
      impacts: Object.freeze([]),
    });
    const initial = runtimeSnapshot(10);

    const first = route.advance(initial, interaction);
    const sameTick = route.advance(initial, interaction);

    expect(sameTick).toBe(first);
    expect(route.inspect()).toEqual({
      advanceCount: 2,
      submissionCount: 1,
      resolutionCount: 1,
      applicationCount: 2,
      lastTick: 10,
    });

    route.advance(runtimeSnapshot(11), interaction);
    const rewind = runtimeSnapshot(2);
    route.advance(rewind, interaction);
    const repeatedRewind = route.advance(rewind, interaction);

    expect(repeatedRewind.tick).toBe(2);
    expect(repeatedRewind.continuityRevision).toBe(1);
    expect(route.inspect()).toEqual({
      advanceCount: 5,
      submissionCount: 3,
      resolutionCount: 3,
      applicationCount: 5,
      lastTick: 2,
    });
  });
});

function runtimeSnapshot(tick: number): OpenWaterRuntimeSnapshot {
  return Object.freeze({
    seed: 17,
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
