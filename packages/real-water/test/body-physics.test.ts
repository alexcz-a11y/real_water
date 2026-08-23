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
  it("publishes the bounded compound and socket coupling policy", async () => {
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

    expect(lease.capabilities.gameplay.bodyInteraction).toEqual({
      fixedTickHz: 60,
      maxShapeSamplesPerBody: 32,
      maxConvexHullVertices: 64,
      maxSocketsPerBody: 8,
      shapeKinds: ["sphere", "box", "capsule", "convex-hull", "compound"],
      socketKinds: ["bow", "stern", "propeller", "wake", "interaction-anchor"],
      generatedDisturbanceKinds: ["directional-wake", "propeller-wash"],
    });
    expect(Object.isFrozen(lease.capabilities.gameplay.bodyInteraction)).toBe(
      true,
    );
    expect(
      Object.isFrozen(lease.capabilities.gameplay.bodyInteraction.socketKinds),
    ).toBe(true);

    await lease.dispose();
  });

  it("copies and freezes a compound Interaction Shape and authored Body sockets", async () => {
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
    const shape = {
      kind: "compound",
      children: [
        {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          shape: {
            kind: "box",
            halfExtents: { x: 1.8, y: 0.55, z: 4.5 },
          },
        },
        {
          position: { x: 0, y: 0.25, z: -3.75 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          shape: { kind: "capsule", radius: 0.45, halfHeight: 1.4 },
        },
        {
          position: { x: 0, y: 0.5, z: 2.75 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          shape: {
            kind: "convex-hull",
            vertices: [
              { x: -0.6, y: -0.4, z: -0.8 },
              { x: 0.6, y: -0.4, z: -0.8 },
              { x: 0, y: 0.5, z: -0.8 },
              { x: 0, y: 0, z: 0.9 },
            ],
          },
        },
      ],
    };
    const sockets = [
      {
        id: "bow",
        kind: "bow",
        position: { x: 0, y: 0, z: -5.5 },
        direction: { x: 0, y: 0, z: 1 },
        radius: 2.4,
        strength: 0.3,
        priority: 180,
      },
      {
        id: "stern",
        kind: "stern",
        position: { x: 0, y: 0, z: 5.1 },
        direction: { x: 0, y: 0, z: 1 },
        radius: 2,
        strength: 0.2,
        priority: 140,
      },
      {
        id: "propeller-port",
        kind: "propeller",
        position: { x: -0.8, y: -0.25, z: 5.2 },
        direction: { x: 0, y: 0, z: 1 },
        radius: 1.25,
        strength: 0.45,
        priority: 220,
      },
      {
        id: "wake",
        kind: "wake",
        position: { x: 0, y: 0, z: 4.5 },
        direction: { x: 0, y: 0, z: 1 },
        radius: 2.8,
        strength: 0.16,
        priority: 120,
      },
      {
        id: "interaction-anchor",
        kind: "interaction-anchor",
        position: { x: 0, y: 0, z: 0 },
      },
    ];

    const attachment = lease.attachBody({
      physics: createMemoryBodyPhysicsAdapter({ initialState: BODY_AT_REST }),
      shape,
      sockets,
    } as never);
    const mutableChild = shape.children[0];
    const mutableSocket = sockets[0];
    if (
      mutableChild === undefined ||
      mutableChild.shape.kind !== "box" ||
      mutableChild.shape.halfExtents === undefined ||
      mutableSocket === undefined ||
      mutableSocket.direction === undefined
    ) {
      throw new Error("The immutable-input test fixture is incomplete.");
    }
    mutableChild.position.x = 99;
    mutableChild.shape.halfExtents.x = 99;
    mutableSocket.position.x = 99;
    mutableSocket.direction.z = -1;

    expect(attachment.shape).toEqual({
      kind: "compound",
      children: [
        {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          shape: {
            kind: "box",
            halfExtents: { x: 1.8, y: 0.55, z: 4.5 },
          },
        },
        {
          position: { x: 0, y: 0.25, z: -3.75 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          shape: { kind: "capsule", radius: 0.45, halfHeight: 1.4 },
        },
        {
          position: { x: 0, y: 0.5, z: 2.75 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          shape: {
            kind: "convex-hull",
            vertices: [
              { x: -0.6, y: -0.4, z: -0.8 },
              { x: 0.6, y: -0.4, z: -0.8 },
              { x: 0, y: 0.5, z: -0.8 },
              { x: 0, y: 0, z: 0.9 },
            ],
          },
        },
      ],
    });
    expect(attachment.sockets).toMatchObject([
      { id: "bow", kind: "bow", position: { x: 0 }, direction: { z: 1 } },
      { id: "stern", kind: "stern" },
      { id: "propeller-port", kind: "propeller" },
      { id: "wake", kind: "wake" },
      { id: "interaction-anchor", kind: "interaction-anchor" },
    ]);
    expect(Object.isFrozen(attachment.shape)).toBe(true);
    expect(Object.isFrozen(attachment.shape.children)).toBe(true);
    expect(Object.isFrozen(attachment.shape.children[0]?.shape)).toBe(true);
    expect(Object.isFrozen(attachment.sockets)).toBe(true);
    expect(Object.isFrozen(attachment.sockets[0]?.position)).toBe(true);

    await lease.dispose();
  });

  it("batches compound samples into one stabilizing Body water load", async () => {
    const rollRadians = Math.PI / 9;
    const bodyState: BodyPhysicsState = Object.freeze({
      position: Object.freeze({ x: 0, y: 0.25, z: 0 }),
      rotation: Object.freeze({
        x: 0,
        y: 0,
        z: Math.sin(rollRadians / 2),
        w: Math.cos(rollRadians / 2),
      }),
      linearVelocity: Object.freeze({ x: 0.5, y: -0.8, z: 0 }),
      angularVelocity: Object.freeze({ x: 0, y: 0, z: 0.2 }),
      mass: 100,
    });
    let runHostFixedStep: (() => BodyWaterLoad) | undefined;
    const applied: BodyWaterLoad[] = [];
    const body = createBodyPhysicsAdapter({
      snapshot: () => bodyState,
      applyWaterLoad(load) {
        applied.push(load);
      },
      bind(route) {
        runHostFixedStep = route.beforeIntegrate;
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
      shape: {
        kind: "compound",
        children: [-1.4, 1.4].map((x) => ({
          position: { x, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          shape: { kind: "sphere" as const, radius: 0.6 },
        })),
      },
    });

    const load = runHostFixedStep?.();

    expect(applied).toEqual([load]);
    expect(load).toMatchObject({
      queryTick: 0,
      queryControlRevision: 0,
      querySnapshotAge: 0,
    });
    expect(load?.force.y).toBeGreaterThan(0);
    expect(load?.force.x).toBeLessThan(0);
    expect(load?.torque.z).toBeLessThan(0);
    expect(attachment.inspect().queryPointCount).toBe(2);

    await lease.dispose();
  });

  it("uses a Compound child's rotation when evaluating capsule immersion", async () => {
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
    const waterHeight = queryAt(lease, 0, 0, 0).heights[0] ?? Number.NaN;
    const state: BodyPhysicsState = Object.freeze({
      position: Object.freeze({ x: 0, y: waterHeight + 0.75, z: 0 }),
      rotation: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
      linearVelocity: Object.freeze({ x: 0, y: 0, z: 0 }),
      angularVelocity: Object.freeze({ x: 0, y: 0, z: 0 }),
      mass: 10,
    });
    const routes: Array<() => BodyWaterLoad> = [];
    const loads: BodyWaterLoad[] = [];
    const createBody = () =>
      createBodyPhysicsAdapter({
        snapshot: () => state,
        applyWaterLoad(load) {
          loads.push(load);
        },
        bind(route) {
          routes.push(route.beforeIntegrate);
          return Object.freeze({ dispose() {} });
        },
      });
    const attachCapsule = (rotation: BodyPhysicsState["rotation"]) =>
      lease.attachBody({
        physics: createBody(),
        shape: {
          kind: "compound",
          children: [
            {
              position: { x: 0, y: 0, z: 0 },
              rotation,
              shape: { kind: "capsule", radius: 0.5, halfHeight: 1 },
            },
          ],
        },
      });
    attachCapsule({ x: 0, y: 0, z: 0, w: 1 });
    attachCapsule({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });

    routes[0]?.();
    routes[1]?.();

    expect(loads).toHaveLength(2);
    expect(loads[0]?.force.y).toBeGreaterThan(0);
    expect(loads[1]?.force.y).toBe(0);
    await lease.dispose();
  });

  it("upserts authored Body wakes and the Interaction Anchor without per-tick submissions", async () => {
    let simulation: HostSimulationState = Object.freeze({
      seed: 25,
      tick: 0,
      timeSeconds: 0,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
    let bodyState: BodyPhysicsState = Object.freeze({
      position: Object.freeze({ x: 4, y: 0.35, z: -3 }),
      rotation: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
      linearVelocity: Object.freeze({ x: 0, y: 0, z: -6 }),
      angularVelocity: Object.freeze({ x: 0, y: 0, z: 0 }),
      mass: 80,
    });
    let runHostFixedStep: (() => BodyWaterLoad) | undefined;
    const body = createBodyPhysicsAdapter({
      snapshot: () => bodyState,
      applyWaterLoad() {},
      bind(route) {
        runHostFixedStep = route.beforeIntegrate;
        return Object.freeze({ dispose() {} });
      },
    });
    const createLease = () =>
      prepareRealWater({
        manifest: createMinimalWaterPrewarmManifest(),
        loading: { present() {} },
        host: createMemoryHostLifecycleAdapter({
          simulation: { snapshot: () => simulation },
          environment: createTestEnvironmentAdapter(),
          presentation: createStaticHostPresentationAdapter(),
          stepDelayMs: 0,
        }),
      }).ready;
    const lease = await createLease();
    const spectralOnly = await createLease();
    const attachment = lease.attachBody({
      physics: body,
      shape: { kind: "sphere", radius: 0.6 },
      sockets: createVesselSockets(),
    });

    runHostFixedStep?.();
    expect(lease.inspectRuntime()).toMatchObject({
      interactionAnchor: { x: 4, z: -3 },
      attachedBodyCount: 1,
      activeBodyWakeCount: 4,
      activeDisturbanceCount: 4,
    });

    simulation = Object.freeze({
      ...simulation,
      tick: 1,
      timeSeconds: 1 / 60,
    });
    runHostFixedStep?.();
    const wake = queryAt(lease, 4, 0, 3);
    const baseline = queryAt(spectralOnly, 4, 0, 3);
    expect(
      Math.abs((wake.heights[0] ?? 0) - (baseline.heights[0] ?? 0)),
    ).toBeGreaterThan(0.000_01);
    expect(wake.snapshotAges[0]).toBe(1);

    for (let tick = 2; tick <= 140; tick += 1) {
      simulation = Object.freeze({
        ...simulation,
        tick,
        timeSeconds: tick / 60,
      });
      bodyState = Object.freeze({
        ...bodyState,
        position: Object.freeze({
          ...bodyState.position,
          z: -3 - tick / 10,
        }),
      });
      runHostFixedStep?.();
    }

    expect(lease.inspectRuntime()).toMatchObject({
      activeBodyWakeCount: 4,
      activeDisturbanceCount: 4,
    });
    expect(attachment.inspect()).toMatchObject({
      fixedStepCount: 141,
      lastFixedStepTick: 140,
      lastWakeReceipt: {
        tick: 140,
        emittedSocketIds: ["bow", "stern", "propeller-port", "wake"],
        droppedSocketIds: [],
        activeBodyWakeCount: 4,
        activeDisturbanceCount: 4,
      },
    });

    await Promise.all([lease.dispose(), spectralOnly.dispose()]);
  });

  it("does not spend Disturbance capacity on stationary Body sockets", async () => {
    let runHostFixedStep: (() => BodyWaterLoad) | undefined;
    const body = createBodyPhysicsAdapter({
      snapshot: () => BODY_AT_REST,
      applyWaterLoad() {},
      bind(route) {
        runHostFixedStep = route.beforeIntegrate;
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
    const stationarySocket = createVesselSockets().find(
      (socket) => socket.kind === "wake",
    );
    if (stationarySocket === undefined) {
      throw new Error("The stationary Body test requires a wake socket.");
    }
    const attachment = lease.attachBody({
      physics: body,
      shape: { kind: "sphere", radius: 0.5 },
      sockets: [stationarySocket],
    });

    runHostFixedStep?.();

    expect(attachment.inspect().lastWakeReceipt).toEqual({
      tick: 0,
      emittedSocketIds: [],
      droppedSocketIds: [],
      displacedDisturbanceIds: [],
      displacedBodyWakeSources: [],
      activeBodyWakeCount: 0,
      activeDisturbanceCount: 0,
    });
    expect(lease.inspectRuntime()).toMatchObject({
      activeBodyWakeCount: 0,
      activeDisturbanceCount: 0,
    });
    await lease.dispose();
  });

  it("rejects a second Interaction Anchor owner before reading its Host body", async () => {
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
    const anchorSocket = createVesselSockets().find(
      (socket) => socket.kind === "interaction-anchor",
    );
    if (anchorSocket === undefined) {
      throw new Error("The Anchor capacity test requires an Anchor socket.");
    }
    const owner = lease.attachBody({
      physics: createMemoryBodyPhysicsAdapter({ initialState: BODY_AT_REST }),
      shape: { kind: "sphere", radius: 0.5 },
      sockets: [anchorSocket],
    });
    const snapshot = vi.fn(() => BODY_AT_REST);
    const bind = vi.fn(() => Object.freeze({ dispose() {} }));
    const candidate = createBodyPhysicsAdapter({
      snapshot,
      applyWaterLoad() {},
      bind,
    });

    expect(() =>
      lease.attachBody({
        physics: candidate,
        shape: { kind: "sphere", radius: 0.5 },
        sockets: [anchorSocket],
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "RealWaterRuntimeError",
        code: "INTERACTION_ANCHOR_CAPACITY_EXCEEDED",
      }),
    );
    expect(snapshot).not.toHaveBeenCalled();
    expect(bind).not.toHaveBeenCalled();

    owner.detach();
    const replacement = lease.attachBody({
      physics: candidate,
      shape: { kind: "sphere", radius: 0.5 },
      sockets: [anchorSocket],
    });
    expect(replacement.inspect().attached).toBe(true);
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledTimes(1);
    await lease.dispose();
  });

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
      maxActiveDisturbances: 128,
      interactionField: {
        radiusMetres: 48,
        edgeFadeMetres: 8,
        maxSnapshotAgeTicks: 1,
        disturbanceKinds: ["radial-impact", "directional-wake"],
      },
      bodyInteraction: {
        fixedTickHz: 60,
        maxShapeSamplesPerBody: 32,
        maxConvexHullVertices: 64,
        maxSocketsPerBody: 8,
        shapeKinds: ["sphere", "box", "capsule", "convex-hull", "compound"],
        socketKinds: [
          "bow",
          "stern",
          "propeller",
          "wake",
          "interaction-anchor",
        ],
        generatedDisturbanceKinds: ["directional-wake", "propeller-wash"],
      },
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

function queryAt(
  runtime: Pick<
    Awaited<ReturnType<typeof prepareRealWater>["ready"]>,
    "queryGameplay"
  >,
  x: number,
  y: number,
  z: number,
): GameplayQueryResults {
  const results = createQueryResults();
  return runtime.queryGameplay({
    count: 1,
    positions: Float32Array.of(x, y, z),
    results,
  });
}

function createVesselSockets() {
  return [
    {
      id: "bow",
      kind: "bow" as const,
      position: { x: 0, y: 0, z: -5.5 },
      direction: { x: 0, y: 0, z: 1 },
      radius: 2.4,
      strength: 0.3,
      priority: 180,
    },
    {
      id: "stern",
      kind: "stern" as const,
      position: { x: 0, y: 0, z: 5.1 },
      direction: { x: 0, y: 0, z: 1 },
      radius: 2,
      strength: 0.2,
      priority: 140,
    },
    {
      id: "propeller-port",
      kind: "propeller" as const,
      position: { x: -0.8, y: -0.25, z: 5.2 },
      direction: { x: 0, y: 0, z: 1 },
      radius: 1.25,
      strength: 0.45,
      priority: 220,
    },
    {
      id: "wake",
      kind: "wake" as const,
      position: { x: 0, y: 0, z: 4.5 },
      direction: { x: 0, y: 0, z: 1 },
      radius: 2.8,
      strength: 0.16,
      priority: 120,
    },
    {
      id: "interaction-anchor",
      kind: "interaction-anchor" as const,
      position: { x: 0, y: 0, z: 0 },
    },
  ];
}
