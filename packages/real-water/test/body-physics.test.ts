import { describe, expect, it, vi } from "vitest";
import {
  createBodyPhysicsAdapter,
  createMemoryBodyPhysicsAdapter,
  createMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createStaticHostPresentationAdapter,
  createStaticHostSimulationAdapter,
  MAX_ATTACHED_BODIES,
  prepareRealWater,
  type BodyPhysicsState,
  type BodyWaterLoad,
  type GameplayQueryResults,
  type HostSimulationState,
} from "../src/index.js";
import { createTestEnvironmentAdapter } from "./test-host-environment.js";

const BODY_AT_REST: BodyPhysicsState = Object.freeze({
  position: Object.freeze({ x: 0, y: 0.4, z: 0 }),
  rotation: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
  linearVelocity: Object.freeze({ x: 0, y: 0, z: 0 }),
  angularVelocity: Object.freeze({ x: 0, y: 0, z: 0 }),
  mass: 1,
});

describe("Body Physics Adapter seam", () => {
  it("applies a synchronous water load before Host fixed integration", async () => {
    const events: string[] = [];
    let runHostFixedStep: (() => BodyWaterLoad) | undefined;
    const body = createBodyPhysicsAdapter({
      snapshot() {
        events.push("snapshot");
        return BODY_AT_REST;
      },
      applyWaterLoad(load) {
        events.push(
          `water-load:${String(load.queryTick)}:${String(load.querySnapshotAge)}`,
        );
      },
      bind(route) {
        events.push("bind");
        runHostFixedStep = () => {
          const load = route.beforeIntegrate();
          events.push("host-integrate");
          return load;
        };
        return Object.freeze({ dispose() {} });
      },
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: createStaticHostSimulationAdapter(),
        environment: createTestEnvironmentAdapter(),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;

    const attachment = lease.attachBody({
      physics: body,
      shape: { kind: "sphere", radius: 0.5 },
    });
    expect(runHostFixedStep).toBeTypeOf("function");
    events.length = 0;

    const load = runHostFixedStep?.();

    expect(events).toEqual(["snapshot", "water-load:0:0", "host-integrate"]);
    expect(load).toMatchObject({
      queryTick: 0,
      queryControlRevision: 0,
      querySnapshotAge: 0,
    });
    expect(Number.isFinite(load?.force.y)).toBe(true);
    expect(attachment.inspect().lastWaterLoad).toBe(load);
    await lease.dispose();
  });

  it("rejects a Body Adapter that drives its route during bind", async () => {
    const disposeBinding = vi.fn();
    const body = createBodyPhysicsAdapter({
      snapshot: () => BODY_AT_REST,
      applyWaterLoad() {},
      bind(route) {
        try {
          route.beforeIntegrate();
        } catch {
          // A broken Host Adapter must not make bind-time work disappear.
        }
        return Object.freeze({ dispose: disposeBinding });
      },
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: createStaticHostSimulationAdapter(),
        environment: createTestEnvironmentAdapter(),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;

    expect(() =>
      lease.attachBody({
        physics: body,
        shape: { kind: "sphere", radius: 0.5 },
      }),
    ).toThrowError(/bind must not call beforeIntegrate/i);
    expect(disposeBinding).toHaveBeenCalledTimes(1);
    await lease.dispose();
  });

  it("keeps 60 Hz memory coupling deterministic under 30 FPS interpolation", async () => {
    let simulation: HostSimulationState = Object.freeze({
      seed: 0,
      tick: 0,
      timeSeconds: 0,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    const presentedBody = createMemoryBodyPhysicsAdapter({
      initialState: BODY_AT_REST,
    });
    const unpresentedBody = createMemoryBodyPhysicsAdapter({
      initialState: BODY_AT_REST,
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: { snapshot: () => simulation },
        environment: createTestEnvironmentAdapter(),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;
    lease.attachBody({
      physics: presentedBody,
      shape: { kind: "sphere", radius: 0.5 },
    });
    lease.attachBody({
      physics: unpresentedBody,
      shape: { kind: "sphere", radius: 0.5 },
    });

    let presentationCount = 0;
    let maximumHeightError = 0;
    let maximumVerticalSpeed = 0;
    const sampledWater = createQueryResults();
    for (let fixedStep = 0; fixedStep < 600; fixedStep += 1) {
      const beforePresentationBody = presentedBody.snapshot();
      presentedBody.integrateFixedStep();
      unpresentedBody.integrateFixedStep();
      simulation = Object.freeze({
        ...simulation,
        tick: simulation.tick + 1,
        timeSeconds: (simulation.tick + 1) / 60,
      });
      const currentBody = presentedBody.snapshot();
      lease.queryGameplay({
        count: 1,
        positions: Float32Array.of(
          currentBody.position.x,
          currentBody.position.y,
          currentBody.position.z,
        ),
        results: sampledWater,
      });
      maximumHeightError = Math.max(
        maximumHeightError,
        Math.abs(currentBody.position.y - (sampledWater.heights[0] ?? 0)),
      );
      maximumVerticalSpeed = Math.max(
        maximumVerticalSpeed,
        Math.abs(currentBody.linearVelocity.y),
      );
      if (fixedStep % 2 === 1) {
        const current = presentedBody.snapshot();
        const interpolated = presentedBody.interpolate(0.5);
        expect(interpolated.position.y).toBeCloseTo(
          (beforePresentationBody.position.y + current.position.y) / 2,
          12,
        );
        presentationCount += 1;
      }
    }

    expect(presentationCount).toBe(300);
    expect(presentedBody.snapshot()).toEqual(unpresentedBody.snapshot());
    expect(maximumHeightError).toBeLessThan(1.5);
    expect(maximumVerticalSpeed).toBeLessThan(4);
    const finalBody = presentedBody.snapshot();
    const water = createQueryResults();
    lease.queryGameplay({
      count: 1,
      positions: Float32Array.of(
        finalBody.position.x,
        finalBody.position.y,
        finalBody.position.z,
      ),
      results: water,
    });
    expect(
      Math.abs(finalBody.position.y - (water.heights[0] ?? 0)),
    ).toBeLessThan(1);
    expect(Math.abs(finalBody.linearVelocity.y)).toBeLessThan(4);
    await lease.dispose();
  });

  it("keeps immutable Body attachments within prepared capacity", async () => {
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: createStaticHostSimulationAdapter(),
        environment: createTestEnvironmentAdapter(),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;
    expect(lease.capabilities.gameplay).toEqual({
      maxAttachedBodies: 32,
      maxQueryPointsPerTick: 2_048,
    });
    expect(MAX_ATTACHED_BODIES).toBe(32);

    const mutableShape = { kind: "sphere" as const, radius: 0.5 };
    const bodies = Array.from({ length: 33 }, () =>
      createMemoryBodyPhysicsAdapter({ initialState: BODY_AT_REST }),
    );
    const overflowBody = bodies[32];
    if (overflowBody === undefined) {
      throw new Error("The capacity test requires a thirty-third Body.");
    }
    const attachments = bodies.slice(0, 32).map((physics, index) =>
      lease.attachBody({
        physics,
        shape: index === 0 ? mutableShape : { kind: "sphere", radius: 0.5 },
      }),
    );
    mutableShape.radius = 9;
    expect(attachments[0]?.shape).toEqual({ kind: "sphere", radius: 0.5 });
    expect(Object.isFrozen(attachments[0]?.shape)).toBe(true);

    expect(() =>
      lease.attachBody({
        physics: overflowBody,
        shape: { kind: "sphere", radius: 0.5 },
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "RealWaterRuntimeError",
        code: "BODY_CAPACITY_EXCEEDED",
        diagnostics: {
          capacity: 32,
          requested: 1,
          used: 32,
        },
      }),
    );

    attachments[0]?.detach();
    attachments[0]?.detach();
    expect(attachments[0]?.inspect().attached).toBe(false);
    const replacement = lease.attachBody({
      physics: overflowBody,
      shape: { kind: "sphere", radius: 0.5 },
    });
    expect(replacement.inspect().attached).toBe(true);
    await lease.dispose();
  });

  it("unbinds coupling without disposing the Host rigid body", async () => {
    const hostBody = {
      destroy: vi.fn(),
      state: BODY_AT_REST,
    };
    const disposeBinding = vi.fn();
    let retainedRoute:
      | Parameters<Parameters<typeof createBodyPhysicsAdapter>[0]["bind"]>[0]
      | undefined;
    const body = createBodyPhysicsAdapter({
      snapshot: () => hostBody.state,
      applyWaterLoad() {},
      bind(route) {
        retainedRoute = route;
        return Object.freeze({ dispose: disposeBinding });
      },
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: createStaticHostSimulationAdapter(),
        environment: createTestEnvironmentAdapter(),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;
    const attachment = lease.attachBody({
      physics: body,
      shape: { kind: "sphere", radius: 0.5 },
    });

    const firstDisposal = lease.dispose();
    const secondDisposal = lease.dispose();
    expect(secondDisposal).toBe(firstDisposal);
    await firstDisposal;

    expect(disposeBinding).toHaveBeenCalledTimes(1);
    expect(attachment.inspect().attached).toBe(false);
    expect(hostBody.destroy).not.toHaveBeenCalled();
    expect(body.snapshot()).toEqual(BODY_AT_REST);
    expect(() => retainedRoute?.beforeIntegrate()).toThrowError(
      expect.objectContaining({
        name: "RealWaterRuntimeError",
        code: "RUNTIME_INVALIDATED",
      }),
    );
  });
});

function createQueryResults(): GameplayQueryResults {
  return {
    heights: new Float32Array(1),
    normals: new Float32Array(3),
    velocities: new Float32Array(3),
    foam: new Float32Array(1),
    ticks: new Float64Array(1),
    controlRevisions: new Float64Array(1),
    snapshotAges: new Uint8Array(1),
  };
}
