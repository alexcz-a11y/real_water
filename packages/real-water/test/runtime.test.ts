import { describe, expect, it } from "vitest";
import {
  createMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createStaticHostSimulationAdapter,
  prepareRealWater,
  type GameplayQueryResults,
} from "../src/index.js";

const STATIC_SIMULATION = createStaticHostSimulationAdapter();

describe("ready Open Water runtime", () => {
  it("publishes the prepared per-tick Gameplay Query capacity", async () => {
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: STATIC_SIMULATION,
        stepDelayMs: 0,
      }),
    }).ready;

    expect(lease.capabilities.gameplay).toEqual({
      maxQueryPointsPerTick: 2_048,
    });
    expect(Object.isFrozen(lease.capabilities.gameplay)).toBe(true);
    await lease.dispose();
  });

  it("fills caller-owned Gameplay Query results from the hot spectral state", async () => {
    let simulation = Object.freeze({
      seed: 0,
      tick: 0,
      timeSeconds: 0,
      paused: false,
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        stepDelayMs: 0,
        simulation: { snapshot: () => simulation },
      }),
    }).ready;

    const results: GameplayQueryResults = {
      heights: new Float32Array(2),
      normals: new Float32Array(6),
      velocities: new Float32Array(6),
      foam: new Float32Array(2),
      ticks: new Float64Array(2),
      controlRevisions: new Float64Array(2),
      snapshotAges: new Uint8Array(2),
    };
    const returned = lease.queryGameplay({
      count: 2,
      positions: Float32Array.of(2, 0, 0, 0, 0, 0),
      results,
    });

    expect(returned).toBe(results);
    expect(results.heights[0]).toBeCloseTo(0.941_342, 5);
    expect(results.heights[1]).toBeCloseTo(0, 5);
    expect(results.normals[0]).toBeCloseTo(-0.086_679, 5);
    expect(results.normals[1]).toBeCloseTo(0.955_649, 5);
    expect(results.normals[2]).toBeCloseTo(-0.281_462, 5);
    expect(results.normals[3]).toBeCloseTo(-0.550_392, 5);
    expect(results.normals[4]).toBeCloseTo(0.800_892, 5);
    expect(results.normals[5]).toBeCloseTo(-0.235_882, 5);
    expect(results.velocities[0]).toBe(0);
    expect(results.velocities[1]).toBeCloseTo(-1.017_305, 5);
    expect(results.velocities[2]).toBe(0);
    expect(results.velocities[3]).toBe(0);
    expect(results.velocities[4]).toBeCloseTo(-2.225_295, 5);
    expect(results.velocities[5]).toBe(0);
    expect([...results.foam]).toEqual([0, 0]);
    expect([...results.ticks]).toEqual([0, 0]);
    expect([...results.controlRevisions]).toEqual([0, 0]);
    expect([...results.snapshotAges]).toEqual([0, 0]);

    lease.queryGameplay({
      count: 1,
      positions: Float32Array.of(0, 0, 2),
      results,
    });
    expect(results.heights[0]).toBeCloseTo(0.176_777, 5);

    const doubled = {
      ...lease.inspectRuntime().artisticControls,
      waveStrength: 2,
    };
    expect(lease.updateArtisticControls(doubled)).toMatchObject({
      changed: true,
      revision: 1,
    });
    expect(lease.updateArtisticControls(doubled)).toMatchObject({
      changed: false,
      revision: 1,
    });
    lease.queryGameplay({
      count: 2,
      positions: Float32Array.of(2, 0, 0, 0, 0, 0),
      results,
    });
    expect(results.heights[0]).toBeCloseTo(1.882_683, 5);
    expect(results.heights[1]).toBeCloseTo(0, 5);
    expect([...results.controlRevisions]).toEqual([1, 1]);

    simulation = Object.freeze({
      seed: 0,
      tick: 60,
      timeSeconds: 1,
      paused: false,
    });
    lease.queryGameplay({
      count: 1,
      positions: Float32Array.of(0, 0, 0),
      results,
    });
    expect(results.heights[0]).toBeCloseTo(-2.640_119, 5);
    expect(results.ticks[0]).toBe(60);

    await lease.dispose();
  });

  it("fails before writes when a tick exceeds its prepared query capacity", async () => {
    let simulation = Object.freeze({
      seed: 0,
      tick: 7,
      timeSeconds: 0,
      paused: false,
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        stepDelayMs: 0,
        simulation: { snapshot: () => simulation },
      }),
    }).ready;
    const fullResults = createResults(2_048, 0);
    lease.queryGameplay({
      count: 2_048,
      positions: new Float32Array(2_048 * 3),
      results: fullResults,
    });
    const overflowResults = createResults(1, 42);

    expect(() =>
      lease.queryGameplay({
        count: 1,
        positions: new Float32Array(3),
        results: overflowResults,
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "RealWaterRuntimeError",
        code: "GAMEPLAY_QUERY_CAPACITY_EXCEEDED",
        diagnostics: {
          capacity: 2_048,
          requestedThisBatch: 1,
          usedThisTick: 2_048,
        },
      }),
    );
    expect([...overflowResults.heights]).toEqual([42]);
    expect([...overflowResults.ticks]).toEqual([42]);
    expect([...overflowResults.controlRevisions]).toEqual([42]);
    expect([...overflowResults.snapshotAges]).toEqual([42]);

    simulation = Object.freeze({
      seed: 1,
      tick: 7,
      timeSeconds: 0,
      paused: false,
    });
    expect(() =>
      lease.queryGameplay({
        count: 1,
        positions: new Float32Array(3),
        results: overflowResults,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "GAMEPLAY_QUERY_CAPACITY_EXCEEDED" }),
    );
    simulation = Object.freeze({
      seed: 1,
      tick: 8,
      timeSeconds: 1 / 60,
      paused: false,
    });
    expect(() =>
      lease.queryGameplay({
        count: 1,
        positions: new Float32Array(3),
        results: overflowResults,
      }),
    ).not.toThrow();
    await lease.dispose();
  });

  it("validates every queried world position before writing any result", async () => {
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: STATIC_SIMULATION,
        stepDelayMs: 0,
      }),
    }).ready;
    const results = createResults(2, 42);

    expect(() =>
      lease.queryGameplay({
        count: 2,
        positions: Float32Array.of(2, 0, 0, Number.NaN, 0, 0),
        results,
      }),
    ).toThrowError(
      new RangeError("Gameplay Query positions must contain finite values."),
    );
    expect([...results.heights]).toEqual([42, 42]);
    expect([...results.normals]).toEqual([42, 42, 42, 42, 42, 42]);
    expect([...results.ticks]).toEqual([42, 42]);
    expect([...results.controlRevisions]).toEqual([42, 42]);
    expect([...results.snapshotAges]).toEqual([42, 42]);
    await lease.dispose();
  });

  it("rejects hot commands after invalidation before mutating caller results", async () => {
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: STATIC_SIMULATION,
        stepDelayMs: 0,
      }),
    }).ready;
    const results = createResults(1, 42);
    lease.invalidateForLongSuspension();

    expect(() =>
      lease.queryGameplay({
        count: 1,
        positions: new Float32Array(3),
        results,
      }),
    ).toThrowError(expect.objectContaining({ code: "RUNTIME_INVALIDATED" }));
    expect(() =>
      lease.updateArtisticControls({
        ...lease.inspectRuntime().artisticControls,
        waveStrength: 2,
      }),
    ).toThrowError(expect.objectContaining({ code: "RUNTIME_INVALIDATED" }));
    expect([...results.heights]).toEqual([42]);
    expect([...results.ticks]).toEqual([42]);
    expect([...results.controlRevisions]).toEqual([42]);
    expect([...results.snapshotAges]).toEqual([42]);
    await lease.dispose();
  });
});

function createResults(count: number, fill: number): GameplayQueryResults {
  return {
    heights: new Float32Array(count).fill(fill),
    normals: new Float32Array(count * 3).fill(fill),
    velocities: new Float32Array(count * 3).fill(fill),
    foam: new Float32Array(count).fill(fill),
    ticks: new Float64Array(count).fill(fill),
    controlRevisions: new Float64Array(count).fill(fill),
    snapshotAges: new Uint8Array(count).fill(fill),
  };
}
