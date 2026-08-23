import { describe, expect, it } from "vitest";
import {
  createMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createStaticHostPresentationAdapter,
  prepareRealWater,
  type GameplayQueryResults,
  type HostSimulationState,
} from "../src/index.js";
import { createTestEnvironmentAdapter } from "./test-host-environment.js";

describe("ready local interaction runtime", () => {
  it("makes one radial impact visible to Gameplay Query at the Interaction Anchor", async () => {
    const simulationState: HostSimulationState = Object.freeze({
      seed: 0x24,
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
        scenario: { kind: "success" },
        simulation: { snapshot: () => simulationState },
        environment: createTestEnvironmentAdapter(),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;
    const baseline = queryPoint(lease, 2, 0, 3);

    expect(lease.updateInteractionAnchor({ x: 2, z: 3 })).toEqual({
      anchor: { x: 2, z: 3 },
      changed: true,
      revision: 1,
    });
    expect(
      lease.submitDisturbances({
        kind: "radial-impact",
        count: 1,
        ids: Uint32Array.of(7),
        positions: Float32Array.of(2, 0, 3),
        radii: Float32Array.of(8),
        amplitudes: Float32Array.of(1.25),
        priorities: Uint8Array.of(200),
      }),
    ).toEqual({
      tick: 12,
      acceptedDisturbanceIds: [7],
      droppedDisturbanceIds: [],
      activeDisturbanceCount: 1,
    });

    const impacted = queryPoint(lease, 2, 0, 3);
    expect(impacted.heights[0] - baseline.heights[0]).toBeCloseTo(1.25, 5);
    expect(impacted.velocities[1]).not.toBe(baseline.velocities[1]);
    expect(impacted.ticks[0]).toBe(12);
    expect(impacted.snapshotAges[0]).toBe(0);
    expect(lease.inspectRuntime()).toMatchObject({
      interactionAnchor: { x: 2, z: 3 },
      interactionAnchorRevision: 1,
      activeDisturbanceCount: 1,
    });

    await lease.dispose();
  });

  it("drops the lowest-priority Disturbance with a deterministic overflow receipt", async () => {
    const simulationState: HostSimulationState = Object.freeze({
      seed: 0,
      tick: 4,
      timeSeconds: 4 / 60,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: { snapshot: () => simulationState },
        environment: createTestEnvironmentAdapter(),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;
    expect(lease.capabilities.gameplay.maxActiveDisturbances).toBe(128);
    expect(Object.isFrozen(lease.capabilities.gameplay)).toBe(true);

    const full = lease.submitDisturbances({
      kind: "radial-impact",
      count: 128,
      ids: Uint32Array.from({ length: 128 }, (_, index) => index + 1),
      positions: new Float32Array(128 * 3),
      radii: new Float32Array(128).fill(8),
      amplitudes: new Float32Array(128).fill(4),
      priorities: new Uint8Array(128).fill(1),
    });
    expect(full).toMatchObject({
      acceptedDisturbanceIds: Array.from(
        { length: 128 },
        (_, index) => index + 1,
      ),
      droppedDisturbanceIds: [],
      activeDisturbanceCount: 128,
    });
    const saturated = queryPoint(lease, 0, 0, 0);
    expect(Number.isFinite(saturated.heights[0])).toBe(true);
    expect([...saturated.normals].every(Number.isFinite)).toBe(true);

    expect(
      lease.submitDisturbances(radialImpactBatch({ id: 999, priority: 2 })),
    ).toEqual({
      tick: 4,
      acceptedDisturbanceIds: [999],
      droppedDisturbanceIds: [1],
      activeDisturbanceCount: 128,
    });
    expect(
      lease.submitDisturbances(radialImpactBatch({ id: 1_000, priority: 0 })),
    ).toEqual({
      tick: 4,
      acceptedDisturbanceIds: [],
      droppedDisturbanceIds: [1_000],
      activeDisturbanceCount: 128,
    });

    await lease.dispose();
  });

  it("rejects duplicate Disturbance identities before mutating the local field", async () => {
    const state: HostSimulationState = Object.freeze({
      seed: 0,
      tick: 2,
      timeSeconds: 2 / 60,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: { snapshot: () => state },
        environment: createTestEnvironmentAdapter(),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;
    const baseline = queryPoint(lease, 0, 0, 0).heights[0];

    expect(() =>
      lease.submitDisturbances({
        ...radialImpactBatch({ id: 4, priority: 1 }),
        radii: Float32Array.of(0.000_05),
      }),
    ).toThrow(/at least 0\.0001 metres/i);
    expect(() =>
      lease.submitDisturbances({
        ...radialImpactBatch({ id: 4, priority: 1 }),
        amplitudes: Float32Array.of(5),
      }),
    ).toThrow(/between -4 and 4 metres/i);
    expect(() =>
      lease.submitDisturbances({
        kind: "radial-impact",
        count: 2,
        ids: Uint32Array.of(5, 5),
        positions: new Float32Array(6),
        radii: Float32Array.of(8, 8),
        amplitudes: Float32Array.of(1, 1),
        priorities: Uint8Array.of(1, 2),
      }),
    ).toThrow(/unique Disturbance ids/i);
    expect(lease.inspectRuntime().activeDisturbanceCount).toBe(0);
    expect(queryPoint(lease, 0, 0, 0).heights[0]).toBe(baseline);

    lease.submitDisturbances(radialImpactBatch({ id: 5, priority: 1 }));
    expect(() =>
      lease.submitDisturbances(radialImpactBatch({ id: 5, priority: 2 })),
    ).toThrow(/already active/i);
    expect(lease.inspectRuntime().activeDisturbanceCount).toBe(1);

    await lease.dispose();
  });

  it("moves the edge-free local field with the Interaction Anchor", async () => {
    const state: HostSimulationState = Object.freeze({
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
        simulation: { snapshot: () => state },
        environment: createTestEnvironmentAdapter(),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;
    expect(lease.capabilities.gameplay.interactionField).toEqual({
      radiusMetres: 48,
      edgeFadeMetres: 8,
      maxSnapshotAgeTicks: 1,
      disturbanceKinds: ["radial-impact"],
    });
    expect(Object.isFrozen(lease.capabilities.gameplay.interactionField)).toBe(
      true,
    );
    const baseline = queryPoint(lease, 48, 0, 0);

    lease.submitDisturbances({
      ...radialImpactBatch({ id: 48, priority: 1 }),
      positions: Float32Array.of(48, 0, 0),
      amplitudes: Float32Array.of(1),
    });
    const atEdge = queryPoint(lease, 48, 0, 0);
    expect(atEdge.heights[0]).toBe(baseline.heights[0]);
    expect([...atEdge.normals]).toEqual([...baseline.normals]);

    lease.updateInteractionAnchor({ x: 48, z: 0 });
    const followed = queryPoint(lease, 48, 0, 0);
    expect(followed.heights[0] - baseline.heights[0]).toBeCloseTo(1, 5);
    expect(followed.snapshotAges[0]).toBe(0);

    await lease.dispose();
  });

  it("reports a zero-or-one-tick snapshot and replays deterministically after reset", async () => {
    let state: HostSimulationState = Object.freeze({
      seed: 0x2400,
      tick: 10,
      timeSeconds: 10 / 60,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    const createLease = () =>
      prepareRealWater({
        manifest: createMinimalWaterPrewarmManifest(),
        loading: { present() {} },
        host: createMemoryHostLifecycleAdapter({
          simulation: { snapshot: () => state },
          environment: createTestEnvironmentAdapter(),
          presentation: createStaticHostPresentationAdapter(),
          stepDelayMs: 0,
        }),
      }).ready;
    const lease = await createLease();
    const spectralOnly = await createLease();
    const impact = {
      ...radialImpactBatch({ id: 24, priority: 5 }),
      amplitudes: Float32Array.of(1),
    };

    lease.submitDisturbances(impact);
    const current = queryPoint(lease, 0, 0, 0);
    const currentSpectral = queryPoint(spectralOnly, 0, 0, 0);
    expect(current.heights[0] - currentSpectral.heights[0]).toBeCloseTo(1, 5);
    expect(current.snapshotAges[0]).toBe(0);

    state = Object.freeze({
      ...state,
      tick: 11,
      timeSeconds: 11 / 60,
    });
    const oneTickOld = queryPoint(lease, 0, 0, 0);
    const advancedSpectral = queryPoint(spectralOnly, 0, 0, 0);
    expect(oneTickOld.heights[0] - advancedSpectral.heights[0]).toBeCloseTo(
      1,
      5,
    );
    expect(oneTickOld.snapshotAges[0]).toBe(1);

    state = Object.freeze({
      ...state,
      tick: 0,
      timeSeconds: 0,
      simulationResetRevision: 1,
    });
    expect(lease.inspectRuntime().activeDisturbanceCount).toBe(0);
    const firstReceipt = lease.submitDisturbances(impact);
    const firstReplay = serializeQuery(queryPoint(lease, 1.25, 0, 0));

    state = Object.freeze({
      ...state,
      simulationResetRevision: 2,
    });
    expect(lease.inspectRuntime().activeDisturbanceCount).toBe(0);
    const repeatedReceipt = lease.submitDisturbances(impact);
    const repeatedReplay = serializeQuery(queryPoint(lease, 1.25, 0, 0));
    expect(repeatedReceipt).toEqual(firstReceipt);
    expect(repeatedReplay).toEqual(firstReplay);

    await Promise.all([lease.dispose(), spectralOnly.dispose()]);
  });

  it("retains the previous-tick correction when an impact expires now", async () => {
    let state: HostSimulationState = Object.freeze({
      seed: 0,
      tick: 0,
      timeSeconds: 0,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    const createLease = () =>
      prepareRealWater({
        manifest: createMinimalWaterPrewarmManifest(),
        loading: { present() {} },
        host: createMemoryHostLifecycleAdapter({
          simulation: { snapshot: () => state },
          environment: createTestEnvironmentAdapter(),
          presentation: createStaticHostPresentationAdapter(),
          stepDelayMs: 0,
        }),
      }).ready;
    const lease = await createLease();
    const spectralOnly = await createLease();
    lease.submitDisturbances({
      ...radialImpactBatch({ id: 120, priority: 1 }),
      amplitudes: Float32Array.of(1),
    });

    state = Object.freeze({
      ...state,
      tick: 120,
      timeSeconds: 2,
    });
    const expiring = queryPoint(lease, 0, 0, 0);
    const spectral = queryPoint(spectralOnly, 0, 0, 0);
    expect(expiring.snapshotAges[0]).toBe(1);
    expect(Math.abs(expiring.heights[0] - spectral.heights[0])).toBeGreaterThan(
      0.000_01,
    );
    expect(lease.inspectRuntime().activeDisturbanceCount).toBe(0);

    state = Object.freeze({
      ...state,
      tick: 121,
      timeSeconds: 121 / 60,
    });
    const expired = queryPoint(lease, 0, 0, 0);
    const advancedSpectral = queryPoint(spectralOnly, 0, 0, 0);
    expect(expired.snapshotAges[0]).toBe(0);
    expect(expired.heights[0]).toBe(advancedSpectral.heights[0]);

    await Promise.all([lease.dispose(), spectralOnly.dispose()]);
  });

  it("declares the bounded local interaction route before readiness", () => {
    const manifest = createMinimalWaterPrewarmManifest();

    expect(manifest.version).toBe(5);
    expect(manifest.qualityProfile.version).toBe(7);
    expect(manifest.qualityProfile.interaction).toEqual({
      anchorCount: 1,
      field: {
        radiusMetres: 48,
        edgeFadeMetres: 8,
        maxActiveDisturbances: 128,
        snapshotBanks: 2,
        maxSnapshotAgeTicks: 1,
        radialImpactRoute: "analytic-uniform-array",
      },
    });
    expect(Object.isFrozen(manifest.qualityProfile.interaction.field)).toBe(
      true,
    );
    expect(
      manifest.declarations
        .filter(({ id }) => id.startsWith("water-local-interaction"))
        .map(({ id, kind }) => ({ id, kind })),
    ).toEqual([
      {
        id: "water-local-interaction-field",
        kind: "effect-state",
      },
      {
        id: "water-local-interaction-buffers",
        kind: "resource",
      },
      {
        id: "water-local-interaction-radial-impact-route",
        kind: "conditional-route",
      },
    ]);
  });
});

function radialImpactBatch(options: {
  readonly id: number;
  readonly priority: number;
}) {
  return {
    kind: "radial-impact" as const,
    count: 1,
    ids: Uint32Array.of(options.id),
    positions: Float32Array.of(0, 0, 0),
    radii: Float32Array.of(8),
    amplitudes: Float32Array.of(0.25),
    priorities: Uint8Array.of(options.priority),
  };
}

function queryPoint(
  runtime: Pick<
    Awaited<ReturnType<typeof prepareRealWater>["ready"]>,
    "queryGameplay"
  >,
  x: number,
  y: number,
  z: number,
): GameplayQueryResults {
  const results: GameplayQueryResults = {
    heights: new Float32Array(1),
    normals: new Float32Array(3),
    velocities: new Float32Array(3),
    foam: new Float32Array(1),
    ticks: new Float64Array(1),
    controlRevisions: new Float64Array(1),
    snapshotAges: new Uint8Array(1),
  };
  return runtime.queryGameplay({
    count: 1,
    positions: Float32Array.of(x, y, z),
    results,
  });
}

function serializeQuery(results: GameplayQueryResults) {
  return {
    heights: [...results.heights],
    normals: [...results.normals],
    velocities: [...results.velocities],
    foam: [...results.foam],
    ticks: [...results.ticks],
    controlRevisions: [...results.controlRevisions],
    snapshotAges: [...results.snapshotAges],
  };
}
