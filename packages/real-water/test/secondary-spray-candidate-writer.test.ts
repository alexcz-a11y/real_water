import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { PerspectiveCamera } from "three/webgpu";
import { createWaterPreset } from "../src/water-preset.js";
import type { OpenWaterRuntimeSnapshot } from "../src/runtime.js";
import type { StormFrontFrame } from "../src/storm-front.js";
import { createSecondaryParticleStableKeyWriter } from "../src/secondary-particle-key.js";
import { createSecondaryParticleOutputFrustumVisibility } from "../src/secondary-particle-visibility.js";
import { createSecondaryParticleContributionQuantizer } from "../src/secondary-particle-pool.js";
import {
  MAX_SECONDARY_RAIN_SPRAY_CANDIDATES,
  MAX_SECONDARY_STORM_AEROSOL_CANDIDATES,
  writeSecondarySprayCandidates,
  type SecondarySprayCandidateStorage,
  type SecondarySprayInteractionImpact,
} from "../src/secondary-spray-candidate-writer.js";

const reference = Object.freeze({
  width: 320,
  height: 180,
  space: "output-drawing-buffer" as const,
});

describe("secondary spray candidate writer", () => {
  it("preserves the pre-Storm-Front candidate bytes when weather is off", () => {
    const batch = writeBatch([
      impact(0x1_0000_001d, 2),
      impact(0x1_0000_0011, -1),
      impact(0x1_0000_0017, 0),
    ]);

    expect(batchDigest(batch)).toBe(
      "992b75210185521ba3df65a612f3c6b7db39e255616f4d785c805324cf6b6f31",
    );
  });

  it("bounds both weather partitions inside the existing candidate storage", () => {
    const weather = stormFrame({
      rainSprayStrength: 1,
      stormAerosolStrength: 1,
    });

    expect(MAX_SECONDARY_RAIN_SPRAY_CANDIDATES).toBe(8_192);
    expect(MAX_SECONDARY_STORM_AEROSOL_CANDIDATES).toBe(8_192);
    expect(
      writeBatch([], {
        capacity: 65_536,
        count: 0,
        stormFront: weather,
      }).count,
    ).toBe(16_384);

    const maximumHeroes = Array.from({ length: 8 }, (_, index) =>
      hero(0x1_0000_0800 + index, index, 1),
    );
    expect(
      writeBatch(maximumHeroes, {
        capacity: 65_536,
        count: 65_536,
        stormFront: weather,
      }).count,
    ).toBe(65_536);
  });

  it("replays rain spray and storm aerosol byte-exactly in the existing consumer", () => {
    const weather = stormFrame({
      rainSprayStrength: 1,
      stormAerosolStrength: 1,
    });
    const first = writeBatch([], {
      capacity: 16_384,
      count: 0,
      stormFront: weather,
    });
    const replay = writeBatch([], {
      capacity: 16_384,
      count: 0,
      stormFront: weather,
    });

    expect(replay.high).toEqual(first.high);
    expect(replay.low).toEqual(first.low);
    expect(replay.contributions).toEqual(first.contributions);
    expect(replay.payloads).toEqual(first.payloads);
    expect(replay.positions).toEqual(first.positions);
    expect(replay.sizes).toEqual(first.sizes);
    expect(replay.colors).toEqual(first.colors);
    expect(first.consumerId).toBe("spray-droplet-mist");

    const rainEnd = MAX_SECONDARY_RAIN_SPRAY_CANDIDATES;
    expect(
      first.contributions.subarray(0, rainEnd).some((value) => value > 0),
    ).toBe(true);
    expect(
      first.contributions.subarray(rainEnd).some((value) => value > 0),
    ).toBe(true);
    expect(meanHeight(first.positions, 0, rainEnd)).toBeLessThan(1);
    expect(
      maximumHorizontalDistance(first.positions, 0, rainEnd, 0, 8),
    ).toBeLessThan(28);
    expect(mean(first.sizes, rainEnd, first.count)).toBeGreaterThan(
      mean(first.sizes, 0, rainEnd),
    );
    expect(meanAlpha(first.colors, rainEnd, first.count)).toBeLessThan(
      meanAlpha(first.colors, 0, rainEnd),
    );
  });

  it("keeps the canonical Hero partition after both weather partitions", () => {
    const source = hero(0x1_0000_0901, 0, 1);
    const heroOnly = writeBatch([source], {
      capacity: 4_096,
      count: 0,
    });
    const withWeather = writeBatch([source], {
      capacity: 20_480,
      count: 0,
      stormFront: stormFrame({
        rainSprayStrength: 1,
        stormAerosolStrength: 1,
      }),
    });
    const heroOffset =
      MAX_SECONDARY_RAIN_SPRAY_CANDIDATES +
      MAX_SECONDARY_STORM_AEROSOL_CANDIDATES;

    expect(withWeather.count).toBe(20_480);
    expect(withWeather.high.subarray(heroOffset)).toEqual(heroOnly.high);
    expect(withWeather.low.subarray(heroOffset)).toEqual(heroOnly.low);
    expect(withWeather.contributions.subarray(heroOffset)).toEqual(
      heroOnly.contributions,
    );
    expect(withWeather.positions.subarray(heroOffset * 3)).toEqual(
      heroOnly.positions,
    );
    expect(withWeather.sizes.subarray(heroOffset)).toEqual(heroOnly.sizes);
    expect(withWeather.colors.subarray(heroOffset * 4)).toEqual(
      heroOnly.colors,
    );
    expect(
      withWeather.contributions.subarray(heroOffset).some((value) => value > 0),
    ).toBe(true);
  });

  it("writes byte-exact keys and contributions for every source permutation", () => {
    const impacts = [
      impact(0x1_0000_001d, 2),
      impact(0x1_0000_0011, -1),
      impact(0x1_0000_0017, 0),
    ] as const;
    const permutations = [
      impacts,
      [impacts[2], impacts[0], impacts[1]],
      [...impacts].reverse(),
    ] as const;
    const batches = permutations.map((sources) => writeBatch(sources));

    for (const batch of batches.slice(1)) {
      expect(batch.high).toEqual(batches[0]?.high);
      expect(batch.low).toEqual(batches[0]?.low);
      expect(batch.contributions).toEqual(batches[0]?.contributions);
      expect(batch.positions).toEqual(batches[0]?.positions);
      expect(batch.sizes).toEqual(batches[0]?.sizes);
      expect(batch.colors).toEqual(batches[0]?.colors);
    }
  });

  it("canonicalizes more than sixteen sources and rejects duplicate identities", () => {
    const impacts = Array.from({ length: 20 }, (_, index) =>
      impact(0x1_0000_0100 + index, index - 10),
    );
    const forward = writeBatch(impacts);
    const reverse = writeBatch([...impacts].reverse());

    expect(reverse.high).toEqual(forward.high);
    expect(reverse.low).toEqual(forward.low);
    expect(reverse.contributions).toEqual(forward.contributions);
    expect(reverse.positions).toEqual(forward.positions);
    expect(reverse.sizes).toEqual(forward.sizes);
    expect(reverse.colors).toEqual(forward.colors);
    const duplicate = impacts[0];
    if (duplicate === undefined) {
      throw new Error("The spray identity test requires one source.");
    }
    expect(() => writeBatch([duplicate, duplicate])).toThrow(/unique/i);
  });

  it("partitions Hero Breaker sources canonically without keying from source order", () => {
    const first = hero(0x1_0000_0203, 1, 1 / 64);
    const second = hero(0x1_0000_0201, -1, 1 / 32);
    const forward = writeBatch([first, impact(0x1_0000_0011, 0), second], {
      capacity: 320,
    });
    const reverse = writeBatch([second, impact(0x1_0000_0011, 0), first], {
      capacity: 320,
    });

    expect(reverse.count).toBe(320);
    expect(reverse.high).toEqual(forward.high);
    expect(reverse.low).toEqual(forward.low);
    expect(reverse.contributions).toEqual(forward.contributions);
    expect(reverse.positions).toEqual(forward.positions);
    expect(reverse.sizes).toEqual(forward.sizes);
    expect(reverse.colors).toEqual(forward.colors);
  });

  it("rebases absolute interaction sources without changing particle identity or pressure", () => {
    const originX = 32;
    const originZ = -16;
    const equivalentBatches = [
      [
        writeBatch([], {
          capacity: 4,
          count: 4,
          anchorX: 2,
          anchorZ: -1,
        }),
        writeBatch([], {
          capacity: 4,
          count: 4,
          anchorX: 2,
          anchorZ: -1,
          originX,
          originZ,
        }),
      ],
      [
        writeBatch([impact(0x1_0000_0251, 3)], {
          capacity: 4,
          count: 4,
        }),
        writeBatch([impact(0x1_0000_0251, 3)], {
          capacity: 4,
          count: 4,
          originX,
          originZ,
        }),
      ],
      [
        writeBatch([hero(0x1_0000_0252, -2, 1 / 4_096)], {
          capacity: 1,
          count: 0,
        }),
        writeBatch([hero(0x1_0000_0252, -2, 1 / 4_096)], {
          capacity: 1,
          count: 0,
          originX,
          originZ,
        }),
      ],
      [
        writeBatch([], {
          capacity: 2,
          count: 0,
          stormFront: stormFrame({
            rainSprayStrength: 1 / MAX_SECONDARY_RAIN_SPRAY_CANDIDATES,
            stormAerosolStrength: 1 / MAX_SECONDARY_STORM_AEROSOL_CANDIDATES,
          }),
        }),
        writeBatch([], {
          capacity: 2,
          count: 0,
          originX,
          originZ,
          stormFront: stormFrame({
            rainSprayStrength: 1 / MAX_SECONDARY_RAIN_SPRAY_CANDIDATES,
            stormAerosolStrength: 1 / MAX_SECONDARY_STORM_AEROSOL_CANDIDATES,
          }),
        }),
      ],
    ] as const;

    for (const [baseline, shifted] of equivalentBatches) {
      expectOriginRebasedBatch(shifted, baseline, originX, originZ);
    }
  });

  it("emits Hero spray only inside its authored tick interval", () => {
    const source = hero(0x1_0000_0301, 0, 1 / 64, 80, 10);
    const before = writeBatch([source], { capacity: 64, count: 0, tick: 79 });
    const active = writeBatch([source], { capacity: 64, count: 0, tick: 81 });
    const endpoint = writeBatch([source], {
      capacity: 64,
      count: 0,
      tick: 90,
    });

    expect(before.count).toBe(0);
    expect(active.count).toBe(64);
    expect(active.contributions.some((value) => value > 0)).toBe(true);
    expect(endpoint.count).toBe(0);
  });

  it("evaluates the nonzero prepared Hero canary without a negative source tick", () => {
    const canary = writeBatch([hero(0x1_0000_0351, 0, 1 / 64, 0, 120)], {
      capacity: 64,
      count: 0,
      tick: 0,
      revision: -1,
    });

    expect(canary.count).toBe(64);
    expect(canary.contributions.some((value) => value > 0)).toBe(true);
  });

  it("requests no Hero candidates for zero spray and caps one source at 4096", () => {
    const silent = writeBatch([hero(0x1_0000_0401, 0, 0)], {
      capacity: 4_096,
      count: 0,
    });
    const full = writeBatch([hero(0x1_0000_0401, 0, 1)], {
      capacity: 4_096,
      count: 0,
    });

    expect(silent.count).toBe(0);
    expect(full.count).toBe(4_096);
  });

  it("accepts eight Hero source partitions and fails closed on a ninth", () => {
    const eight = Array.from({ length: 8 }, (_, index) =>
      hero(0x1_0000_0600 + index, index, 1 / 64),
    );

    expect(writeBatch(eight, { capacity: 512, count: 0 }).count).toBe(512);
    expect(() =>
      writeBatch([...eight, hero(0x1_0000_0700, 9, 1 / 64)], {
        capacity: 576,
        count: 0,
      }),
    ).toThrow(/capacity/i);
  });

  it("fails closed on an unknown internal interaction kind", () => {
    const unknown = {
      ...impact(0x1_0000_0501, 0),
      kind: "unknown-internal-kind",
    } as unknown as SecondarySprayInteractionImpact;

    expect(() => writeBatch([unknown])).toThrow(/unknown interaction kind/i);
  });
});

function writeBatch(
  impacts: readonly SecondarySprayInteractionImpact[],
  options: Readonly<{
    capacity?: number;
    count?: number;
    tick?: number;
    revision?: number;
    originX?: number;
    originZ?: number;
    anchorX?: number;
    anchorZ?: number;
    stormFront?: StormFrontFrame;
  }> = {},
) {
  const capacity = options.capacity ?? 128;
  const count = options.count ?? 128;
  const storage: SecondarySprayCandidateStorage = {
    stableKeys: {
      high: new Uint32Array(capacity),
      low: new Uint32Array(capacity),
    },
    contributionsQ16: new Uint16Array(capacity),
    payloadHandles: new Uint32Array(capacity),
    positions: new Float32Array(capacity * 3),
    sizes: new Float32Array(capacity),
    colors: new Float32Array(capacity * 4),
  };
  const originX = options.originX ?? 0;
  const originZ = options.originZ ?? 0;
  const camera = new PerspectiveCamera(70, 16 / 9, 0.1, 200);
  camera.position.set(-originX, 2, 8 - originZ);
  camera.lookAt(-originX, 0, -originZ);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const stableKeyWriter =
    createSecondaryParticleStableKeyWriter("spray-droplet-mist");
  const writtenCount = writeSecondarySprayCandidates(
    snapshot(options.tick, originX, originZ),
    {
      revision: options.revision ?? 0,
      anchorX: options.anchorX ?? 0,
      anchorZ: options.anchorZ ?? 0,
      impacts,
    },
    options.stormFront ?? stormFrame(),
    camera,
    count,
    {
      contributionReference: reference,
      quantizeContribution: createSecondaryParticleContributionQuantizer({
        projectedAreaResolution: reference,
        referenceResolution: reference,
      }),
      stableKeyWriter,
      visibility: createSecondaryParticleOutputFrustumVisibility(reference),
      storage,
      minimumRetainedSlots: 64,
      impactStableSourceIds: new Float64Array(128),
      impactSourceOrder: new Uint32Array(128),
      heroImpactSourceOrder: new Uint32Array(8),
    },
  );
  return {
    count: writtenCount,
    consumerId: stableKeyWriter.domain.consumerId,
    high: storage.stableKeys.high,
    low: storage.stableKeys.low,
    contributions: storage.contributionsQ16,
    payloads: storage.payloadHandles,
    positions: storage.positions,
    sizes: storage.sizes,
    colors: storage.colors,
  };
}

function expectOriginRebasedBatch(
  shifted: ReturnType<typeof writeBatch>,
  baseline: ReturnType<typeof writeBatch>,
  originX: number,
  originZ: number,
): void {
  expect(shifted.count).toBe(baseline.count);
  expect(shifted.high).toEqual(baseline.high);
  expect(shifted.low).toEqual(baseline.low);
  expect(shifted.contributions).toEqual(baseline.contributions);
  expect(shifted.payloads).toEqual(baseline.payloads);
  expect(shifted.sizes).toEqual(baseline.sizes);
  expect(shifted.colors).toEqual(baseline.colors);
  for (let ordinal = 0; ordinal < baseline.count; ordinal += 1) {
    const positionOffset = ordinal * 3;
    expect(shifted.positions[positionOffset]).toBeCloseTo(
      (baseline.positions[positionOffset] ?? 0) - originX,
      5,
    );
    expect(shifted.positions[positionOffset + 1]).toBe(
      baseline.positions[positionOffset + 1],
    );
    expect(shifted.positions[positionOffset + 2]).toBeCloseTo(
      (baseline.positions[positionOffset + 2] ?? 0) - originZ,
      5,
    );
  }
}

function mean(values: Float32Array, start: number, end: number): number {
  let total = 0;
  for (let index = start; index < end; index += 1) {
    total += values[index] ?? 0;
  }
  return total / Math.max(1, end - start);
}

function meanHeight(
  positions: Float32Array,
  start: number,
  end: number,
): number {
  let total = 0;
  for (let index = start; index < end; index += 1) {
    total += positions[index * 3 + 1] ?? 0;
  }
  return total / Math.max(1, end - start);
}

function meanAlpha(colors: Float32Array, start: number, end: number): number {
  let total = 0;
  for (let index = start; index < end; index += 1) {
    total += colors[index * 4 + 3] ?? 0;
  }
  return total / Math.max(1, end - start);
}

function maximumHorizontalDistance(
  positions: Float32Array,
  start: number,
  end: number,
  x: number,
  z: number,
): number {
  let maximum = 0;
  for (let index = start; index < end; index += 1) {
    const dx = (positions[index * 3] ?? 0) - x;
    const dz = (positions[index * 3 + 2] ?? 0) - z;
    maximum = Math.max(maximum, Math.hypot(dx, dz));
  }
  return maximum;
}

function stormFrame(overrides: Partial<StormFrontFrame> = {}): StormFrontFrame {
  return Object.freeze({
    seed: 0x1020_3040,
    tick: 73,
    inputRevision: 0,
    spatialPhase: 0,
    rainRippleStrength: 0,
    rainSprayStrength: 0,
    stormAerosolStrength: 0,
    cloudShadowStrength: 0,
    lightningStrength: 0,
    glintIllumination: 1,
    foamIllumination: 1,
    reflectionIllumination: 1,
    atmosphere: Object.freeze({
      horizonHaze: 0,
      stormAerosol: 0,
      cloudShadow: 0,
      lightning: 0,
    }),
    ...overrides,
  });
}

function batchDigest(batch: ReturnType<typeof writeBatch>): string {
  const digest = createHash("sha256");
  digest.update(new Uint8Array(batch.high.buffer));
  digest.update(new Uint8Array(batch.low.buffer));
  digest.update(new Uint8Array(batch.contributions.buffer));
  digest.update(new Uint8Array(batch.payloads.buffer));
  digest.update(new Uint8Array(batch.positions.buffer));
  digest.update(new Uint8Array(batch.sizes.buffer));
  digest.update(new Uint8Array(batch.colors.buffer));
  return digest.digest("hex");
}

function impact(
  stableSourceId: number,
  x: number,
): SecondarySprayInteractionImpact {
  return Object.freeze({
    stableSourceId,
    kind: "radial-impact",
    x,
    z: -x * 0.5,
    directionX: 1,
    directionZ: 0,
    radius: 2,
    amplitude: 0.5,
    startTick: 0,
    lifetimeTicks: 120,
    sprayAmount: 1,
  });
}

function hero(
  stableSourceId: number,
  x: number,
  sprayAmount: number,
  startTick = 60,
  lifetimeTicks = 60,
): SecondarySprayInteractionImpact {
  return Object.freeze({
    ...impact(stableSourceId, x),
    kind: "hero-breaker",
    directionX: 0,
    directionZ: -1,
    radius: 4,
    amplitude: 1.2,
    startTick,
    lifetimeTicks,
    sprayAmount,
  });
}

function snapshot(
  tick = 73,
  originX = 0,
  originZ = 0,
): OpenWaterRuntimeSnapshot {
  return Object.freeze({
    seed: 0x1020_3040,
    tick,
    timeSeconds: tick / 60,
    paused: false,
    originX,
    originZ,
    seaLevelMetres: 0,
    simulationResetRevision: 0,
    artisticControls: createWaterPreset("swell").artisticControls,
    controlRevision: 0,
    originRevision: 0,
    seaStateCutRevision: 0,
    cameraCutRevision: 0,
    interactionAnchor: Object.freeze({ x: 0, z: 0 }),
    interactionAnchorRevision: 0,
    activeDisturbanceCount: 3,
    activeHeroBreakerCount: 0,
    activeBodyWakeCount: 0,
    attachedBodyCount: 0,
  });
}
