import { describe, expect, it } from "vitest";
import { Mesh, Quaternion, Scene, Vector3 } from "three";
import {
  createMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createStaticHostEnvironmentAdapter,
  createStaticHostPresentationAdapter,
  createSupportedHostEnvironmentReflection,
  prepareRealWater,
} from "real-water";
import {
  REFERENCE_PROXY_VESSEL_INTERACTION_SHAPE,
  REFERENCE_PROXY_VESSEL_NAME,
  REFERENCE_PROXY_VESSEL_SOCKETS,
  createReferenceProxyVessel,
} from "./reference-proxy-vessel.js";
import { createReferenceHostSimulationController } from "./reference-simulation-controller.js";

describe("Reference proxy vessel", () => {
  it("publishes one stable compound Interaction Shape and matching authored socket transforms", () => {
    expect(REFERENCE_PROXY_VESSEL_INTERACTION_SHAPE).toEqual({
      kind: "compound",
      children: [
        {
          position: { x: 0, y: 0, z: 0.25 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          shape: {
            kind: "box",
            halfExtents: { x: 1.8, y: 0.55, z: 4.5 },
          },
        },
        {
          position: { x: 0, y: 0, z: -4.5 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          shape: {
            kind: "convex-hull",
            vertices: [
              { x: -1.8, y: -0.55, z: 0.75 },
              { x: 1.8, y: -0.55, z: 0.75 },
              { x: -1.35, y: 0.55, z: 0.75 },
              { x: 1.35, y: 0.55, z: 0.75 },
              { x: 0, y: -0.3, z: -2.25 },
              { x: 0, y: 0.25, z: -2.25 },
            ],
          },
        },
        {
          position: { x: -1.05, y: -0.35, z: 4.35 },
          rotation: {
            x: 0.7071067811865476,
            y: 0,
            z: 0,
            w: 0.7071067811865476,
          },
          shape: { kind: "capsule", radius: 0.35, halfHeight: 0.8 },
        },
        {
          position: { x: 1.05, y: -0.35, z: 4.35 },
          rotation: {
            x: 0.7071067811865476,
            y: 0,
            z: 0,
            w: 0.7071067811865476,
          },
          shape: { kind: "capsule", radius: 0.35, halfHeight: 0.8 },
        },
      ],
    });
    expect(REFERENCE_PROXY_VESSEL_SOCKETS).toEqual([
      {
        id: "bow",
        kind: "bow",
        position: { x: 0, y: 0, z: -6.25 },
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
        position: { x: -1.05, y: -0.35, z: 5.2 },
        direction: { x: 0, y: 0, z: 1 },
        radius: 1.25,
        strength: 0.45,
        priority: 220,
      },
      {
        id: "propeller-starboard",
        kind: "propeller",
        position: { x: 1.05, y: -0.35, z: 5.2 },
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
    ]);
    expect(Object.isFrozen(REFERENCE_PROXY_VESSEL_INTERACTION_SHAPE)).toBe(
      true,
    );
    if (REFERENCE_PROXY_VESSEL_INTERACTION_SHAPE.kind !== "compound") {
      throw new Error(
        "The proxy vessel requires a compound Interaction Shape.",
      );
    }
    expect(
      Object.isFrozen(REFERENCE_PROXY_VESSEL_INTERACTION_SHAPE.children),
    ).toBe(true);
    for (const child of REFERENCE_PROXY_VESSEL_INTERACTION_SHAPE.children) {
      expect(Object.isFrozen(child)).toBe(true);
      expect(Object.isFrozen(child.position)).toBe(true);
      expect(Object.isFrozen(child.rotation)).toBe(true);
      expect(Object.isFrozen(child.shape)).toBe(true);
    }
    expect(Object.isFrozen(REFERENCE_PROXY_VESSEL_SOCKETS)).toBe(true);
    expect(
      new Set(REFERENCE_PROXY_VESSEL_SOCKETS.map((socket) => socket.id)).size,
    ).toBe(REFERENCE_PROXY_VESSEL_SOCKETS.length);
    for (const descriptor of REFERENCE_PROXY_VESSEL_SOCKETS) {
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(Object.isFrozen(descriptor.position)).toBe(true);
      if ("direction" in descriptor) {
        expect(Object.isFrozen(descriptor.direction)).toBe(true);
      }
    }

    const scene = new Scene();
    const vessel = createReferenceProxyVessel(scene);
    const root = scene.getObjectByName(REFERENCE_PROXY_VESSEL_NAME);
    expect(root).toBeDefined();
    if (root === undefined) {
      throw new Error("The proxy vessel root was not added to the Scene.");
    }

    for (const descriptor of REFERENCE_PROXY_VESSEL_SOCKETS) {
      const socket = root.getObjectByName(descriptor.id);
      expect(socket).toBeDefined();
      if (socket === undefined) {
        throw new Error(`Missing authored socket ${descriptor.id}.`);
      }
      expect(socket.parent).toBe(root);
      expect(socket.position.toArray()).toEqual([
        descriptor.position.x,
        descriptor.position.y,
        descriptor.position.z,
      ]);
      if ("direction" in descriptor) {
        const direction = new Vector3(0, 0, 1).applyQuaternion(
          socket.quaternion,
        );
        expect(direction.toArray()).toEqual([
          descriptor.direction.x,
          descriptor.direction.y,
          descriptor.direction.z,
        ]);
      }
    }
    vessel.dispose();
  });

  it("drives two controllable fixed steps by 34 ms and presents only an interpolated pose", async () => {
    const scene = new Scene();
    const vessel = createReferenceProxyVessel(scene);
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: vessel.integrateFixedStep,
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation,
        environment: createStaticHostEnvironmentAdapter(
          createSupportedHostEnvironmentReflection(),
          {
            sunDirectionX: 0.32,
            sunDirectionY: 0.84,
            sunDirectionZ: 0.44,
            sunColorR: 1,
            sunColorG: 0.96,
            sunColorB: 0.82,
            sunIntensity: 1,
            environmentIntensity: 1,
            sunAngularRadiusRadians: 0.069,
          },
        ),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;
    const attachment = vessel.attach(lease);
    vessel.setControls({ throttle: 1, steering: 0.5 });

    simulation.start(0);
    expect(simulation.beforePresent(17).tick).toBe(1);
    const firstPose = vessel.inspect().pose;
    expect(simulation.beforePresent(34).tick).toBe(2);
    const beforePresentation = vessel.inspect();
    const beforePhysics = vessel.physics.snapshot();
    const beforeAttachment = attachment.inspect();

    expect(beforePresentation).toMatchObject({
      controls: { throttle: 1, steering: 0.5 },
      fixedStepCount: 2,
    });
    expect(beforePresentation.pose.position.z).toBeLessThan(0);
    expect(beforePresentation.pose.rotation.y).toBeGreaterThan(0);
    expect(beforeAttachment).toMatchObject({
      attached: true,
      fixedStepCount: 2,
      lastFixedStepTick: 1,
      lastWaterLoad: {
        queryTick: 1,
        queryControlRevision: 0,
      },
      lastWakeReceipt: {
        tick: 1,
        emittedSocketIds: [
          "bow",
          "stern",
          "propeller-port",
          "propeller-starboard",
          "wake",
        ],
        droppedSocketIds: [],
        activeBodyWakeCount: 5,
        activeDisturbanceCount: 5,
      },
    });
    expect(lease.inspectRuntime()).toMatchObject({
      attachedBodyCount: 1,
      activeBodyWakeCount: 5,
      activeDisturbanceCount: 5,
      interactionAnchor: {
        x: firstPose.position.x,
        z: firstPose.position.z,
      },
    });
    expect(lease.capabilities.gameplay).toMatchObject({
      maxAttachedBodies: 32,
      maxActiveDisturbances: 128,
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
    expect(
      beforeAttachment.lastWaterLoad?.querySnapshotAge,
    ).toBeGreaterThanOrEqual(0);
    expect(
      beforeAttachment.lastWaterLoad?.querySnapshotAge,
    ).toBeLessThanOrEqual(1);

    const alpha = simulation.interpolationAlpha(42);
    expect(alpha).toBeCloseTo(0.52, 12);
    vessel.present(alpha);

    expect(vessel.physics.snapshot()).toEqual(beforePhysics);
    expect(vessel.inspect()).toEqual(beforePresentation);
    expect(attachment.inspect()).toEqual(beforeAttachment);
    const root = scene.getObjectByName(REFERENCE_PROXY_VESSEL_NAME);
    const expectedPosition = [
      firstPose.position.x +
        (beforePresentation.pose.position.x - firstPose.position.x) * alpha,
      firstPose.position.y +
        (beforePresentation.pose.position.y - firstPose.position.y) * alpha,
      firstPose.position.z +
        (beforePresentation.pose.position.z - firstPose.position.z) * alpha,
    ];
    expect(root?.position.x).toBeCloseTo(expectedPosition[0] ?? Number.NaN, 12);
    expect(root?.position.y).toBeCloseTo(expectedPosition[1] ?? Number.NaN, 12);
    expect(root?.position.z).toBeCloseTo(expectedPosition[2] ?? Number.NaN, 12);
    const expectedRotation = new Quaternion()
      .set(
        firstPose.rotation.x,
        firstPose.rotation.y,
        firstPose.rotation.z,
        firstPose.rotation.w,
      )
      .slerp(
        new Quaternion(
          beforePresentation.pose.rotation.x,
          beforePresentation.pose.rotation.y,
          beforePresentation.pose.rotation.z,
          beforePresentation.pose.rotation.w,
        ),
        alpha,
      );
    expect(root?.quaternion.angleTo(expectedRotation)).toBeLessThan(1e-7);

    await lease.dispose();
    vessel.dispose();
  });

  it("can isolate the twin-propeller socket route without changing authored semantics", async () => {
    const attachmentSockets = REFERENCE_PROXY_VESSEL_SOCKETS.filter(
      (socket) =>
        socket.kind === "propeller" || socket.kind === "interaction-anchor",
    );
    const vessel = createReferenceProxyVessel(new Scene(), {
      attachmentSockets,
    });
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: vessel.integrateFixedStep,
    });
    const lease = await createReadyLease(simulation);
    const attachment = vessel.attach(lease);
    vessel.setControls({ throttle: 1, steering: 0 });
    simulation.start(0);
    simulation.beforePresent(34);

    expect(attachment.sockets.map(({ id }) => id)).toEqual([
      "propeller-port",
      "propeller-starboard",
      "interaction-anchor",
    ]);
    expect(attachment.inspect().lastWakeReceipt).toMatchObject({
      emittedSocketIds: ["propeller-port", "propeller-starboard"],
      droppedSocketIds: [],
    });

    await lease.dispose();
    vessel.dispose();
  });

  it("replays an identical control sequence deterministically", async () => {
    const first = await runDeterministicVesselRoute();
    const second = await runDeterministicVesselRoute();

    expect(second).toEqual(first);
  });

  it("integrates compound stabilization torque into the presented orientation", async () => {
    const vessel = createReferenceProxyVessel(new Scene());
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: vessel.integrateFixedStep,
    });
    const lease = await createReadyLease(simulation);
    vessel.attach(lease);
    simulation.start(0);

    for (let tick = 1; tick <= 120; tick += 1) {
      simulation.beforePresent((tick * 1_000) / 60 + 0.001);
    }
    const state = vessel.physics.snapshot();

    expect(
      Math.hypot(state.angularVelocity.x, state.angularVelocity.z),
    ).toBeGreaterThan(0.000_001);
    expect(Math.hypot(state.rotation.x, state.rotation.z)).toBeGreaterThan(
      0.000_001,
    );

    await lease.dispose();
    vessel.dispose();
  });

  it("accepts only copied throttle and steering values in the -1 to 1 range", () => {
    const vessel = createReferenceProxyVessel(new Scene());
    const controls = { throttle: -1, steering: 1 };
    vessel.setControls(controls);
    controls.throttle = 0;
    controls.steering = 0;

    expect(vessel.inspect().controls).toEqual({
      throttle: -1,
      steering: 1,
    });
    expect(Object.isFrozen(vessel.inspect().controls)).toBe(true);
    expect(() =>
      vessel.setControls({ throttle: 1.01, steering: 0 }),
    ).toThrowError(/throttle.*between -1 and 1/i);
    expect(() =>
      vessel.setControls({ throttle: 0, steering: Number.NaN }),
    ).toThrowError(/steering.*between -1 and 1/i);
    expect(vessel.inspect().controls).toEqual({
      throttle: -1,
      steering: 1,
    });

    vessel.dispose();
  });

  it("resets Host controls and motion without disposing the proxy", () => {
    const vessel = createReferenceProxyVessel(new Scene());
    vessel.setControls({ throttle: 1, steering: 1 });
    vessel.integrateFixedStep();

    vessel.reset();

    expect(vessel.inspect()).toEqual({
      controls: { throttle: 0, steering: 0 },
      fixedStepCount: 0,
      pose: {
        position: { x: 0, y: 0.25, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
    expect(vessel.physics.snapshot()).toMatchObject({
      position: { x: 0, y: 0.25, z: 0 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    });
    vessel.dispose();
  });

  it("detaches without destroying Host state and disposes owned Three resources once", async () => {
    const scene = new Scene();
    const vessel = createReferenceProxyVessel(scene);
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: vessel.integrateFixedStep,
    });
    const lease = await createReadyLease(simulation);
    const firstAttachment = vessel.attach(lease);
    simulation.start(0);
    simulation.beforePresent(17);
    firstAttachment.detach();

    expect(lease.inspectRuntime()).toMatchObject({
      attachedBodyCount: 0,
      activeBodyWakeCount: 0,
      activeDisturbanceCount: 0,
    });

    const attachment = vessel.attach(lease);
    const root = scene.getObjectByName(REFERENCE_PROXY_VESSEL_NAME);
    if (root === undefined) {
      throw new Error("The proxy vessel root was not added to the Scene.");
    }
    const geometries = new Set<{
      addEventListener(type: "dispose", listener: () => void): void;
    }>();
    const materials = new Set<{
      addEventListener(type: "dispose", listener: () => void): void;
    }>();
    root.traverse((object) => {
      if (!(object instanceof Mesh)) {
        return;
      }
      geometries.add(object.geometry);
      if (Array.isArray(object.material)) {
        for (const material of object.material) {
          materials.add(material);
        }
      } else {
        materials.add(object.material);
      }
    });
    let disposedGeometryCount = 0;
    let disposedMaterialCount = 0;
    for (const geometry of geometries) {
      geometry.addEventListener("dispose", () => {
        disposedGeometryCount += 1;
      });
    }
    for (const material of materials) {
      material.addEventListener("dispose", () => {
        disposedMaterialCount += 1;
      });
    }
    const hostState = vessel.physics.snapshot();

    await lease.dispose();

    expect(attachment.inspect().attached).toBe(false);
    expect(vessel.physics.snapshot()).toEqual(hostState);
    expect(scene.getObjectByName(REFERENCE_PROXY_VESSEL_NAME)).toBe(root);
    expect(disposedGeometryCount).toBe(0);
    expect(disposedMaterialCount).toBe(0);

    vessel.dispose();
    vessel.dispose();

    expect(scene.getObjectByName(REFERENCE_PROXY_VESSEL_NAME)).toBeUndefined();
    expect(disposedGeometryCount).toBe(geometries.size);
    expect(disposedMaterialCount).toBe(materials.size);
    expect(vessel.physics.snapshot()).toEqual(hostState);
  });
});

async function runDeterministicVesselRoute() {
  const scene = new Scene();
  const vessel = createReferenceProxyVessel(scene);
  const simulation = createReferenceHostSimulationController({
    integrateFixedStep: vessel.integrateFixedStep,
  });
  const lease = await createReadyLease(simulation);
  const attachment = vessel.attach(lease);
  simulation.start(0);
  for (const sample of [
    { timestamp: 17, throttle: 0.8, steering: 0.25 },
    { timestamp: 34, throttle: 1, steering: -0.4 },
    { timestamp: 50, throttle: 0.35, steering: 0.75 },
    { timestamp: 67, throttle: -0.2, steering: 0 },
  ]) {
    vessel.setControls({
      throttle: sample.throttle,
      steering: sample.steering,
    });
    simulation.beforePresent(sample.timestamp);
  }
  vessel.present(simulation.interpolationAlpha(75));
  const root = scene.getObjectByName(REFERENCE_PROXY_VESSEL_NAME);
  const result = {
    physics: vessel.physics.snapshot(),
    vessel: vessel.inspect(),
    attachment: attachment.inspect(),
    runtime: lease.inspectRuntime(),
    presentedPosition: root?.position.toArray(),
    presentedRotation: root?.quaternion.toArray(),
  };
  await lease.dispose();
  vessel.dispose();
  return result;
}

async function createReadyLease(
  simulation: ReturnType<typeof createReferenceHostSimulationController>,
) {
  return prepareRealWater({
    manifest: createMinimalWaterPrewarmManifest(),
    loading: { present() {} },
    host: createMemoryHostLifecycleAdapter({
      simulation,
      environment: createStaticHostEnvironmentAdapter(
        createSupportedHostEnvironmentReflection(),
        {
          sunDirectionX: 0.32,
          sunDirectionY: 0.84,
          sunDirectionZ: 0.44,
          sunColorR: 1,
          sunColorG: 0.96,
          sunColorB: 0.82,
          sunIntensity: 1,
          environmentIntensity: 1,
          sunAngularRadiusRadians: 0.069,
        },
      ),
      presentation: createStaticHostPresentationAdapter(),
      stepDelayMs: 0,
    }),
  }).ready;
}
