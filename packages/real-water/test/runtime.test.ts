import { describe, expect, it, vi } from "vitest";
import {
  createMemoryHostLifecycleAdapter as createBaseMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createStaticHostPresentationAdapter,
  createStaticHostSimulationAdapter,
  prepareRealWater,
  type GameplayQueryResults,
} from "../src/index.js";
import {
  createRealWaterRuntime,
  readHostSimulationState,
} from "../src/runtime.js";
import { createTestEnvironmentAdapter } from "./test-host-environment.js";

const STATIC_SIMULATION = createStaticHostSimulationAdapter();

function createMemoryHostLifecycleAdapter(
  options: Omit<
    Parameters<typeof createBaseMemoryHostLifecycleAdapter>[0],
    "simulation" | "environment" | "presentation"
  > &
    Partial<
      Pick<
        Parameters<typeof createBaseMemoryHostLifecycleAdapter>[0],
        "simulation"
      >
    >,
) {
  return createBaseMemoryHostLifecycleAdapter({
    ...options,
    simulation: options.simulation ?? STATIC_SIMULATION,
    environment: createTestEnvironmentAdapter(),
    presentation: createStaticHostPresentationAdapter(),
  });
}

describe("ready Open Water runtime", () => {
  it("publishes simulationResetRevision 0 on the static Host Simulation Adapter", () => {
    const adapter = createStaticHostSimulationAdapter();
    expect(adapter.snapshot()).toEqual({
      seed: 0,
      tick: 0,
      timeSeconds: 0,
      paused: true,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    expect(readHostSimulationState(adapter).simulationResetRevision).toBe(0);
    expect(() =>
      readHostSimulationState({
        snapshot: () => ({
          seed: 0,
          tick: 0,
          timeSeconds: 0,
          paused: true,
          originX: 0,
          originZ: 0,
          simulationResetRevision: -1,
        }),
      }),
    ).toThrowError(/simulationResetRevision/i);
  });

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
      maxAttachedBodies: 32,
      maxQueryPointsPerTick: 2_048,
      maxActiveDisturbances: 128,
      interactionField: {
        radiusMetres: 48,
        edgeFadeMetres: 8,
        maxSnapshotAgeTicks: 1,
        disturbanceKinds: ["radial-impact"],
      },
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
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
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
    expect(results.heights[0]).toBeCloseTo(1.177_562, 5);
    expect(results.heights[1]).toBeCloseTo(0.400_026, 5);
    expect(results.normals[0]).toBeCloseTo(-0.117_398, 5);
    expect(results.normals[1]).toBeCloseTo(0.973_31, 5);
    expect(results.normals[2]).toBeCloseTo(-0.197_194, 5);
    expect(results.normals[3]).toBeCloseTo(-0.434_361, 5);
    expect(results.normals[4]).toBeCloseTo(0.900_737, 5);
    expect(results.normals[5]).toBeCloseTo(0.001_916, 5);
    expect(results.velocities[0]).toBe(0);
    expect(results.velocities[1]).toBeCloseTo(-0.625_267, 5);
    expect(results.velocities[2]).toBe(0);
    expect(results.velocities[3]).toBe(0);
    expect(results.velocities[4]).toBeCloseTo(-1.611_797, 5);
    expect(results.velocities[5]).toBe(0);
    expect(results.foam[0]).toBe(0);
    expect(results.foam[1]).toBeCloseTo(0.68, 5);
    expect([...results.ticks]).toEqual([0, 0]);
    expect([...results.controlRevisions]).toEqual([0, 0]);
    expect([...results.snapshotAges]).toEqual([0, 0]);

    lease.queryGameplay({
      count: 1,
      positions: Float32Array.of(0, 0, 2),
      results,
    });
    expect(results.heights[0]).toBeCloseTo(0.133_053, 5);

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
    expect(lease.inspectRuntime().artisticControls).toEqual(doubled);
    expect(() => {
      const { grazingReflection: _omitted, ...incomplete } = doubled;
      void _omitted;
      lease.updateArtisticControls(incomplete);
    }).toThrow(/complete supported control set/);
    expect(() =>
      lease.updateArtisticControls({
        ...lease.inspectRuntime().artisticControls,
        grazingReflection: 3,
      }),
    ).toThrow(/grazingReflection must be between 0 and 2/);
    lease.queryGameplay({
      count: 2,
      positions: Float32Array.of(2, 0, 0, 0, 0, 0),
      results,
    });
    expect(results.heights[0]).toBeCloseTo(2.355_123, 5);
    expect(results.heights[1]).toBeCloseTo(0.800_052, 5);
    expect([...results.controlRevisions]).toEqual([1, 1]);

    simulation = Object.freeze({
      seed: 0,
      tick: 60,
      timeSeconds: 1,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    lease.queryGameplay({
      count: 1,
      positions: Float32Array.of(0, 0, 0),
      results,
    });
    expect(results.heights[0]).toBeCloseTo(-1.557_516, 5);
    expect(results.ticks[0]).toBe(60);

    await lease.dispose();
  });

  it("reports spectral foam with hot abundance and persistence", async () => {
    const simulation = Object.freeze({
      seed: 0x5eed_cafe,
      tick: 90,
      timeSeconds: 1.5,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    const runtime = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: { snapshot: () => simulation },
        stepDelayMs: 0,
      }),
    }).ready;
    const positions = createWhitecapProbePositions();
    const pointCount = positions.length / 3;
    const sample = (whitecapAmount: number, foamPersistence: number) => {
      runtime.updateArtisticControls({
        ...runtime.inspectRuntime().artisticControls,
        whitecapAmount,
        foamPersistence,
      });
      const results = createResults(pointCount, 0);
      runtime.queryGameplay({ count: pointCount, positions, results });
      return [...results.foam];
    };

    expect(sample(0, 2)).toEqual(new Array<number>(pointCount).fill(0));
    const immediate = sample(2, 0);
    const persistent = sample(2, 2);
    const replay = sample(2, 2);

    expect(Math.max(...immediate)).toBeGreaterThan(0);
    expect(persistent.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(
      immediate.reduce((sum, value) => sum + value, 0),
    );
    expect(replay).toEqual(persistent);
    await runtime.dispose();
  });

  it("clears spectral foam history on reset and replays the same fixed-tick recipe", async () => {
    let simulation = Object.freeze({
      seed: 0x5eed_cafe,
      tick: 90,
      timeSeconds: 1.5,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    const runtime = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: { snapshot: () => simulation },
        stepDelayMs: 0,
      }),
    }).ready;
    runtime.updateArtisticControls({
      ...runtime.inspectRuntime().artisticControls,
      whitecapAmount: 2,
      foamPersistence: 2,
    });
    const positions = createWhitecapProbePositions();
    const sample = () => {
      const results = createResults(positions.length / 3, 0);
      runtime.queryGameplay({
        count: positions.length / 3,
        positions,
        results,
      });
      return [...results.foam];
    };

    const first = sample();
    simulation = Object.freeze({
      ...simulation,
      simulationResetRevision: 1,
    });
    const reset = sample();

    expect(reset.reduce((sum, value) => sum + value, 0)).toBeLessThan(
      first.reduce((sum, value) => sum + value, 0),
    );

    simulation = Object.freeze({
      ...simulation,
      tick: 0,
      timeSeconds: 0,
      simulationResetRevision: 2,
    });
    sample();
    simulation = Object.freeze({
      ...simulation,
      tick: 90,
      timeSeconds: 1.5,
    });
    const replay = sample();

    expect(replay).toEqual(first);
    expect(new Set(replay).size).toBeGreaterThan(1);
    await runtime.dispose();
  });

  it("synchronizes the render sink only when Artistic Controls change", () => {
    const sink = { synchronize: vi.fn() };
    const runtime = createRealWaterRuntime(
      () => {},
      STATIC_SIMULATION,
      createStaticHostPresentationAdapter(),
      sink,
    );
    const controls = runtime.inspectRuntime().artisticControls;

    runtime.updateArtisticControls(controls);
    expect(sink.synchronize).not.toHaveBeenCalled();

    runtime.updateArtisticControls({ ...controls, waveStrength: 2 });
    expect(sink.synchronize).toHaveBeenCalledTimes(1);

    runtime.updateArtisticControls({ ...controls, waveStrength: 2 });
    expect(sink.synchronize).toHaveBeenCalledTimes(1);
  });

  it("fails before writes when a tick exceeds its prepared query capacity", async () => {
    let simulation = Object.freeze({
      seed: 0,
      tick: 7,
      timeSeconds: 0,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
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
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
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
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
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

  it("keeps Gameplay Queries continuous across host floating-origin shifts", async () => {
    let simulation = Object.freeze({
      seed: 0,
      tick: 12,
      timeSeconds: 0.2,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        stepDelayMs: 0,
        simulation: { snapshot: () => simulation },
      }),
    }).ready;
    const results = createResults(1, 0);
    lease.queryGameplay({
      count: 1,
      positions: Float32Array.of(40, 1, -12),
      results,
    });
    const height = results.heights[0] ?? Number.NaN;
    const normal = Float32Array.from(results.normals);
    const velocity = Float32Array.from(results.velocities);
    const before = lease.inspectRuntime();

    expect(height).not.toBe(0);
    expect(before).toMatchObject({
      seed: 0,
      tick: 12,
      timeSeconds: 0.2,
      paused: false,
      originX: 0,
      originZ: 0,
      controlRevision: 0,
      originRevision: 0,
    });
    expect(lease.inspectRuntime().originRevision).toBe(0);

    simulation = Object.freeze({
      seed: 0,
      tick: 12,
      timeSeconds: 0.2,
      paused: false,
      originX: 40,
      originZ: -12,
      simulationResetRevision: 0,
    });
    const shifted = lease.inspectRuntime();
    lease.queryGameplay({
      count: 1,
      positions: Float32Array.of(0, 4, 0),
      results,
    });

    expect(shifted).toMatchObject({
      seed: 0,
      tick: 12,
      timeSeconds: 0.2,
      paused: false,
      originX: 40,
      originZ: -12,
      controlRevision: 0,
      originRevision: 1,
    });
    expect(lease.inspectRuntime().originRevision).toBe(1);
    expect(shifted.artisticControls).toEqual(before.artisticControls);
    expect(results.heights[0]).toBeCloseTo(height, 5);
    expect(results.normals[0]).toBeCloseTo(normal[0] ?? Number.NaN, 5);
    expect(results.normals[1]).toBeCloseTo(normal[1] ?? Number.NaN, 5);
    expect(results.normals[2]).toBeCloseTo(normal[2] ?? Number.NaN, 5);
    expect(results.velocities[0]).toBeCloseTo(velocity[0] ?? Number.NaN, 5);
    expect(results.velocities[1]).toBeCloseTo(velocity[1] ?? Number.NaN, 5);
    expect(results.velocities[2]).toBeCloseTo(velocity[2] ?? Number.NaN, 5);
    expect(results.ticks[0]).toBe(12);
    expect(results.snapshotAges[0]).toBe(0);

    simulation = Object.freeze({
      seed: 0,
      tick: 13,
      timeSeconds: 13 / 60,
      paused: false,
      originX: 40,
      originZ: -12,
      simulationResetRevision: 0,
    });
    expect(lease.inspectRuntime()).toMatchObject({
      originX: 40,
      originZ: -12,
      tick: 13,
      originRevision: 1,
    });
    await lease.dispose();
  });

  it("counts an origin shift that happens before the first inspect", async () => {
    let simulation = Object.freeze({
      seed: 0,
      tick: 3,
      timeSeconds: 0.05,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        stepDelayMs: 0,
        simulation: { snapshot: () => simulation },
      }),
    }).ready;

    simulation = Object.freeze({
      seed: 0,
      tick: 3,
      timeSeconds: 0.05,
      paused: false,
      originX: 96,
      originZ: -24,
      simulationResetRevision: 0,
    });
    const firstInspect = lease.inspectRuntime();

    expect(firstInspect).toMatchObject({
      originX: 96,
      originZ: -24,
      tick: 3,
      originRevision: 1,
    });
    simulation = Object.freeze({
      seed: 0,
      tick: 3,
      timeSeconds: 0.05,
      paused: false,
      originX: 96,
      originZ: -24,
      simulationResetRevision: 0,
    });
    expect(lease.inspectRuntime().originRevision).toBe(1);
    await lease.dispose();
  });

  it("keeps Gameplay Queries continuous across a billion-metre origin rebase", async () => {
    const baselineOrigin = 1_000_000_000;
    let simulation = Object.freeze({
      seed: 0,
      tick: 12,
      timeSeconds: 0.2,
      paused: false,
      originX: baselineOrigin,
      originZ: 0,
      simulationResetRevision: 0,
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        stepDelayMs: 0,
        simulation: { snapshot: () => simulation },
      }),
    }).ready;
    const results = createResults(1, 0);
    lease.queryGameplay({
      count: 1,
      positions: Float32Array.of(96, 1, 0),
      results,
    });
    const height = results.heights[0] ?? Number.NaN;
    const normal = Float32Array.from(results.normals);
    expect(lease.inspectRuntime().originRevision).toBe(0);
    expect(lease.inspectRuntime().originRevision).toBe(0);

    simulation = Object.freeze({
      seed: 0,
      tick: 12,
      timeSeconds: 0.2,
      paused: false,
      originX: baselineOrigin + 96,
      originZ: 0,
      simulationResetRevision: 0,
    });
    const shifted = lease.inspectRuntime();
    lease.queryGameplay({
      count: 1,
      positions: Float32Array.of(0, 4, 0),
      results,
    });

    expect(shifted.originRevision).toBe(1);
    expect(height).not.toBe(0);
    expect(results.heights[0]).toBeCloseTo(height, 5);
    expect(results.normals[0]).toBeCloseTo(normal[0] ?? Number.NaN, 5);
    expect(results.normals[1]).toBeCloseTo(normal[1] ?? Number.NaN, 5);
    expect(results.normals[2]).toBeCloseTo(normal[2] ?? Number.NaN, 5);
    await lease.dispose();
  });

  it("reports Gameplay Query normals from blended height derivatives", async () => {
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        stepDelayMs: 0,
        simulation: createStaticHostSimulationAdapter(),
      }),
    }).ready;
    const results = createResults(3, 0);
    const originX = 11;
    const originZ = 7;
    const step = 0.05;
    lease.queryGameplay({
      count: 3,
      positions: Float32Array.of(
        originX,
        0,
        originZ,
        originX + step,
        0,
        originZ,
        originX,
        0,
        originZ + step,
      ),
      results,
    });
    const height = results.heights[0] ?? Number.NaN;
    const slopeX =
      -(results.normals[0] ?? Number.NaN) / (results.normals[1] ?? Number.NaN);
    const slopeZ =
      -(results.normals[2] ?? Number.NaN) / (results.normals[1] ?? Number.NaN);
    expect((results.heights[1] ?? Number.NaN) - height).toBeCloseTo(
      slopeX * step,
      2,
    );
    expect((results.heights[2] ?? Number.NaN) - height).toBeCloseTo(
      slopeZ * step,
      2,
    );
    await lease.dispose();
  });

  it("breaks repeating spectral patches across a swell-period translation", async () => {
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        stepDelayMs: 0,
        simulation: createStaticHostSimulationAdapter(),
      }),
    }).ready;
    const results = createResults(2, 0);
    lease.queryGameplay({
      count: 2,
      positions: Float32Array.of(0, 0, 0, 288, 0, 0),
      results,
    });
    expect(results.heights[1]).not.toBeCloseTo(
      results.heights[0] ?? Number.NaN,
      3,
    );
    expect(results.normals[3]).not.toBeCloseTo(
      results.normals[0] ?? Number.NaN,
      3,
    );
    await lease.dispose();
  });

  it("rejects a non-finite host origin before writing Gameplay Query results", async () => {
    let simulation = Object.freeze({
      seed: 0,
      tick: 1,
      timeSeconds: 1 / 60,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        stepDelayMs: 0,
        simulation: { snapshot: () => simulation },
      }),
    }).ready;
    const results = createResults(1, 42);

    simulation = Object.freeze({
      ...simulation,
      originX: Number.NaN,
    });
    expect(() =>
      lease.queryGameplay({
        count: 1,
        positions: new Float32Array(3),
        results,
      }),
    ).toThrowError(new RangeError("Open Water origin must be finite."));
    expect(() => lease.inspectRuntime()).toThrowError(
      new RangeError("Open Water origin must be finite."),
    );
    expect([...results.heights]).toEqual([42]);
    expect([...results.ticks]).toEqual([42]);
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

function createWhitecapProbePositions(): Float32Array {
  return Float32Array.of(
    -24,
    0,
    -16,
    -12,
    0,
    -16,
    0,
    0,
    -16,
    12,
    0,
    -16,
    24,
    0,
    -16,
    -24,
    0,
    0,
    -12,
    0,
    0,
    0,
    0,
    0,
    12,
    0,
    0,
    24,
    0,
    0,
    -24,
    0,
    16,
    -12,
    0,
    16,
    0,
    0,
    16,
    12,
    0,
    16,
    24,
    0,
    16,
  );
}
