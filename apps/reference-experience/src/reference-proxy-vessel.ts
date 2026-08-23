import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import type { Scene } from "three";
import {
  createBodyPhysicsAdapter,
  type BodyAttachment,
  type BodyAttachmentOptions,
  type BodyPhysicsAdapter,
  type BodyPhysicsFixedStepRoute,
  type BodyPhysicsPose,
  type BodyPhysicsState,
  type BodyWaterLoad,
  type InteractionShape,
  type RealWaterRuntime,
} from "real-water";

export const REFERENCE_PROXY_VESSEL_NAME = "Reference proxy vessel" as const;
export const REFERENCE_PROXY_VESSEL_FIXED_TICK_HZ = 60 as const;

const FIXED_STEP_SECONDS = 1 / REFERENCE_PROXY_VESSEL_FIXED_TICK_HZ;
const VESSEL_MASS_KILOGRAMS = 8_500;
const GRAVITY_METRES_PER_SECOND_SQUARED = 9.81;
const PROPULSION_ACCELERATION = 4;
const STEERING_ACCELERATION = 1.1;
const LINEAR_DAMPING_PER_SECOND = 0.18;
const ANGULAR_DAMPING_PER_SECOND = 1.4;
const ROLL_INERTIA = VESSEL_MASS_KILOGRAMS * 2.5;
const YAW_INERTIA = VESSEL_MASS_KILOGRAMS * 14;
const PITCH_INERTIA = VESSEL_MASS_KILOGRAMS * 12;

const IDENTITY_ROTATION = freezeQuaternion(0, 0, 0, 1);
const CAPSULE_ALONG_Z_ROTATION = freezeQuaternion(
  Math.SQRT1_2,
  0,
  0,
  Math.SQRT1_2,
);

export const REFERENCE_PROXY_VESSEL_INTERACTION_SHAPE: InteractionShape =
  Object.freeze({
    kind: "compound",
    children: Object.freeze([
      Object.freeze({
        position: freezeVector(0, 0, 0.25),
        rotation: IDENTITY_ROTATION,
        shape: Object.freeze({
          kind: "box",
          halfExtents: freezeVector(1.8, 0.55, 4.5),
        }),
      }),
      Object.freeze({
        position: freezeVector(0, 0, -4.5),
        rotation: IDENTITY_ROTATION,
        shape: Object.freeze({
          kind: "convex-hull",
          vertices: Object.freeze([
            freezeVector(-1.8, -0.55, 0.75),
            freezeVector(1.8, -0.55, 0.75),
            freezeVector(-1.35, 0.55, 0.75),
            freezeVector(1.35, 0.55, 0.75),
            freezeVector(0, -0.3, -2.25),
            freezeVector(0, 0.25, -2.25),
          ]),
        }),
      }),
      Object.freeze({
        position: freezeVector(-1.05, -0.35, 4.35),
        rotation: CAPSULE_ALONG_Z_ROTATION,
        shape: Object.freeze({
          kind: "capsule",
          radius: 0.35,
          halfHeight: 0.8,
        }),
      }),
      Object.freeze({
        position: freezeVector(1.05, -0.35, 4.35),
        rotation: CAPSULE_ALONG_Z_ROTATION,
        shape: Object.freeze({
          kind: "capsule",
          radius: 0.35,
          halfHeight: 0.8,
        }),
      }),
    ]),
  });

export const REFERENCE_PROXY_VESSEL_SOCKETS: NonNullable<
  BodyAttachmentOptions["sockets"]
> = Object.freeze([
  Object.freeze({
    id: "bow",
    kind: "bow",
    position: freezeVector(0, 0, -6.25),
    direction: freezeVector(0, 0, 1),
    radius: 2.4,
    strength: 0.3,
    priority: 180,
  }),
  Object.freeze({
    id: "stern",
    kind: "stern",
    position: freezeVector(0, 0, 5.1),
    direction: freezeVector(0, 0, 1),
    radius: 2,
    strength: 0.2,
    priority: 140,
  }),
  Object.freeze({
    id: "propeller-port",
    kind: "propeller",
    position: freezeVector(-1.05, -0.35, 5.2),
    direction: freezeVector(0, 0, 1),
    radius: 1.25,
    strength: 0.45,
    priority: 220,
  }),
  Object.freeze({
    id: "propeller-starboard",
    kind: "propeller",
    position: freezeVector(1.05, -0.35, 5.2),
    direction: freezeVector(0, 0, 1),
    radius: 1.25,
    strength: 0.45,
    priority: 220,
  }),
  Object.freeze({
    id: "wake",
    kind: "wake",
    position: freezeVector(0, 0, 4.5),
    direction: freezeVector(0, 0, 1),
    radius: 2.8,
    strength: 0.16,
    priority: 120,
  }),
  Object.freeze({
    id: "interaction-anchor",
    kind: "interaction-anchor",
    position: freezeVector(0, 0, 0),
  }),
]);

export interface ReferenceProxyVesselControls {
  readonly throttle: number;
  readonly steering: number;
}

export interface ReferenceProxyVesselSnapshot {
  readonly controls: ReferenceProxyVesselControls;
  readonly fixedStepCount: number;
  readonly pose: BodyPhysicsPose;
}

export interface ReferenceProxyVessel {
  readonly physics: BodyPhysicsAdapter;
  setControls(controls: ReferenceProxyVesselControls): void;
  reset(): void;
  attach(runtime: Pick<RealWaterRuntime, "attachBody">): BodyAttachment;
  integrateFixedStep(): void;
  present(alpha: number): void;
  inspect(): ReferenceProxyVesselSnapshot;
  dispose(): void;
}

export interface ReferenceProxyVesselOptions {
  readonly attachmentSockets?: NonNullable<BodyAttachmentOptions["sockets"]>;
}

export function createReferenceProxyVessel(
  scene: Scene,
  options: ReferenceProxyVesselOptions = {},
): ReferenceProxyVessel {
  const attachmentSockets = Object.freeze([
    ...(options.attachmentSockets ?? REFERENCE_PROXY_VESSEL_SOCKETS),
  ]);
  const root = new Group();
  root.name = REFERENCE_PROXY_VESSEL_NAME;

  const hullMaterial = new MeshBasicMaterial({ color: new Color(0x3d4548) });
  const deckMaterial = new MeshBasicMaterial({ color: new Color(0xe4e0d7) });
  const accentMaterial = new MeshBasicMaterial({ color: new Color(0xf16b32) });

  const hull = new Mesh(new BoxGeometry(3.6, 1.1, 9), hullMaterial);
  hull.position.set(0, 0, 0.25);
  hull.name = "proxy-hull";
  root.add(hull);

  const bow = new Mesh(new ConeGeometry(1.8, 3, 4), hullMaterial);
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0, -5.75);
  bow.name = "proxy-bow";
  root.add(bow);

  const cabin = new Mesh(new BoxGeometry(2.5, 1.5, 2.7), deckMaterial);
  cabin.position.set(0, 1.25, 0.35);
  cabin.name = "proxy-cabin";
  root.add(cabin);

  for (const x of [-1.05, 1.05]) {
    const engine = new Mesh(
      new CylinderGeometry(0.35, 0.35, 1.6, 12),
      accentMaterial,
    );
    engine.rotation.x = Math.PI / 2;
    engine.position.set(x, -0.35, 4.35);
    engine.name = x < 0 ? "proxy-engine-port" : "proxy-engine-starboard";
    root.add(engine);
  }

  const socketForward = new Vector3(0, 0, 1);
  for (const descriptor of REFERENCE_PROXY_VESSEL_SOCKETS) {
    const socket = new Object3D();
    socket.name = descriptor.id;
    socket.position.set(
      descriptor.position.x,
      descriptor.position.y,
      descriptor.position.z,
    );
    if ("direction" in descriptor) {
      socket.quaternion.copy(
        new Quaternion().setFromUnitVectors(
          socketForward,
          new Vector3(
            descriptor.direction.x,
            descriptor.direction.y,
            descriptor.direction.z,
          ),
        ),
      );
    }
    root.add(socket);
  }

  scene.add(root);
  let controls = freezeControls({ throttle: 0, steering: 0 });
  let state = createInitialState();
  let previousPose = poseFromState(state);
  let currentPose = previousPose;
  let fixedStepCount = 0;
  let retainedRoute: BodyPhysicsFixedStepRoute | undefined;
  let pendingWaterLoad: BodyWaterLoad | undefined;
  let attachment: BodyAttachment | undefined;
  let disposed = false;
  setPresentedPose(root, currentPose);

  const physics = createBodyPhysicsAdapter({
    snapshot: () => state,
    applyWaterLoad(load): void {
      pendingWaterLoad = load;
    },
    bind(route) {
      if (disposed) {
        throw new Error("The Reference proxy vessel has been disposed.");
      }
      if (retainedRoute !== undefined) {
        throw new Error("The Reference proxy vessel is already attached.");
      }
      retainedRoute = route;
      let bindingDisposed = false;
      return Object.freeze({
        dispose(): void {
          if (bindingDisposed) {
            return;
          }
          bindingDisposed = true;
          if (retainedRoute === route) {
            retainedRoute = undefined;
          }
        },
      });
    },
  });
  const takePendingWaterLoad = (): BodyWaterLoad | undefined => {
    const load = pendingWaterLoad;
    pendingWaterLoad = undefined;
    return load;
  };

  return Object.freeze({
    physics,
    setControls(nextControls: ReferenceProxyVesselControls): void {
      assertUsable(disposed);
      controls = freezeControls(nextControls);
    },
    reset(): void {
      assertUsable(disposed);
      controls = freezeControls({ throttle: 0, steering: 0 });
      state = createInitialState();
      previousPose = poseFromState(state);
      currentPose = previousPose;
      fixedStepCount = 0;
      pendingWaterLoad = undefined;
      setPresentedPose(root, currentPose);
    },
    attach(runtime: Pick<RealWaterRuntime, "attachBody">): BodyAttachment {
      assertUsable(disposed);
      if (attachment?.inspect().attached === true) {
        throw new Error("The Reference proxy vessel is already attached.");
      }
      attachment = runtime.attachBody({
        physics,
        shape: REFERENCE_PROXY_VESSEL_INTERACTION_SHAPE,
        sockets: attachmentSockets,
      });
      return attachment;
    },
    integrateFixedStep(): void {
      assertUsable(disposed);
      pendingWaterLoad = undefined;
      const routedWaterLoad = retainedRoute?.beforeIntegrate();
      const waterLoad = takePendingWaterLoad() ?? routedWaterLoad;
      const waterForce = waterLoad?.force ?? ZERO_VECTOR;
      const waterTorque = waterLoad?.torque ?? ZERO_VECTOR;
      const currentRotation = new Quaternion(
        state.rotation.x,
        state.rotation.y,
        state.rotation.z,
        state.rotation.w,
      );
      const forward = new Vector3(0, 0, -1).applyQuaternion(currentRotation);
      const horizontalForwardLength = Math.hypot(forward.x, forward.z);
      const forwardX = forward.x / Math.max(horizontalForwardLength, 1e-6);
      const forwardZ = forward.z / Math.max(horizontalForwardLength, 1e-6);
      const thrust = state.mass * PROPULSION_ACCELERATION * controls.throttle;
      const linearDamping = Math.max(
        0,
        1 - LINEAR_DAMPING_PER_SECOND * FIXED_STEP_SECONDS,
      );
      const angularDamping = Math.max(
        0,
        1 - ANGULAR_DAMPING_PER_SECOND * FIXED_STEP_SECONDS,
      );
      const nextLinearVelocity = freezeVector(
        (state.linearVelocity.x +
          ((waterForce.x + forwardX * thrust) / state.mass) *
            FIXED_STEP_SECONDS) *
          linearDamping,
        (state.linearVelocity.y +
          (waterForce.y / state.mass - GRAVITY_METRES_PER_SECOND_SQUARED) *
            FIXED_STEP_SECONDS) *
          linearDamping,
        (state.linearVelocity.z +
          ((waterForce.z + forwardZ * thrust) / state.mass) *
            FIXED_STEP_SECONDS) *
          linearDamping,
      );
      const steeringAcceleration =
        STEERING_ACCELERATION *
        controls.steering *
        (0.25 + Math.abs(controls.throttle));
      const nextAngularVelocity = freezeVector(
        (state.angularVelocity.x +
          (waterTorque.x / ROLL_INERTIA) * FIXED_STEP_SECONDS) *
          angularDamping,
        (state.angularVelocity.y +
          (waterTorque.y / YAW_INERTIA + steeringAcceleration) *
            FIXED_STEP_SECONDS) *
          angularDamping,
        (state.angularVelocity.z +
          (waterTorque.z / PITCH_INERTIA) * FIXED_STEP_SECONDS) *
          angularDamping,
      );
      const angularSpeed = Math.hypot(
        nextAngularVelocity.x,
        nextAngularVelocity.y,
        nextAngularVelocity.z,
      );
      const nextRotation =
        angularSpeed < 1e-12
          ? currentRotation
          : new Quaternion()
              .setFromAxisAngle(
                new Vector3(
                  nextAngularVelocity.x,
                  nextAngularVelocity.y,
                  nextAngularVelocity.z,
                ).normalize(),
                angularSpeed * FIXED_STEP_SECONDS,
              )
              .multiply(currentRotation)
              .normalize();
      previousPose = currentPose;
      state = freezeState({
        position: freezeVector(
          state.position.x + nextLinearVelocity.x * FIXED_STEP_SECONDS,
          state.position.y + nextLinearVelocity.y * FIXED_STEP_SECONDS,
          state.position.z + nextLinearVelocity.z * FIXED_STEP_SECONDS,
        ),
        rotation: freezeQuaternion(
          nextRotation.x,
          nextRotation.y,
          nextRotation.z,
          nextRotation.w,
        ),
        linearVelocity: nextLinearVelocity,
        angularVelocity: nextAngularVelocity,
        mass: state.mass,
      });
      currentPose = poseFromState(state);
      fixedStepCount += 1;
    },
    present(alpha: number): void {
      assertUsable(disposed);
      assertInterpolationAlpha(alpha);
      const position = freezeVector(
        lerp(previousPose.position.x, currentPose.position.x, alpha),
        lerp(previousPose.position.y, currentPose.position.y, alpha),
        lerp(previousPose.position.z, currentPose.position.z, alpha),
      );
      const previousRotation = new Quaternion(
        previousPose.rotation.x,
        previousPose.rotation.y,
        previousPose.rotation.z,
        previousPose.rotation.w,
      );
      const rotation = previousRotation.slerp(
        new Quaternion(
          currentPose.rotation.x,
          currentPose.rotation.y,
          currentPose.rotation.z,
          currentPose.rotation.w,
        ),
        alpha,
      );
      setPresentedPose(root, {
        position,
        rotation: freezeQuaternion(
          rotation.x,
          rotation.y,
          rotation.z,
          rotation.w,
        ),
      });
    },
    inspect(): ReferenceProxyVesselSnapshot {
      return Object.freeze({
        controls,
        fixedStepCount,
        pose: currentPose,
      });
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      attachment?.detach();
      attachment = undefined;
      root.removeFromParent();
      disposeOwnedMeshes(root);
    },
  });
}

const ZERO_VECTOR = freezeVector(0, 0, 0);

function createInitialState(): BodyPhysicsState {
  return freezeState({
    position: freezeVector(0, 0.25, 0),
    rotation: IDENTITY_ROTATION,
    linearVelocity: freezeVector(0, 0, 0),
    angularVelocity: freezeVector(0, 0, 0),
    mass: VESSEL_MASS_KILOGRAMS,
  });
}

function freezeVector(x: number, y: number, z: number) {
  return Object.freeze({ x, y, z });
}

function freezeQuaternion(x: number, y: number, z: number, w: number) {
  return Object.freeze({ x, y, z, w });
}

function freezeState(state: BodyPhysicsState): BodyPhysicsState {
  return Object.freeze(state);
}

function freezeControls(
  controls: ReferenceProxyVesselControls,
): ReferenceProxyVesselControls {
  assertControl(controls.throttle, "throttle");
  assertControl(controls.steering, "steering");
  return Object.freeze({
    throttle: controls.throttle,
    steering: controls.steering,
  });
}

function poseFromState(state: BodyPhysicsState): BodyPhysicsPose {
  return Object.freeze({
    position: state.position,
    rotation: state.rotation,
  });
}

function setPresentedPose(root: Group, pose: BodyPhysicsPose): void {
  root.position.set(pose.position.x, pose.position.y, pose.position.z);
  root.quaternion.set(
    pose.rotation.x,
    pose.rotation.y,
    pose.rotation.z,
    pose.rotation.w,
  );
  root.updateMatrixWorld();
}

function disposeOwnedMeshes(root: Group): void {
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set<{ dispose(): void }>();
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
  for (const geometry of geometries) {
    geometry.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

function assertControl(value: number, label: string): void {
  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new RangeError(
      `Reference proxy vessel ${label} must be between -1 and 1.`,
    );
  }
}

function assertInterpolationAlpha(alpha: number): void {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RangeError(
      "Reference proxy vessel presentation alpha must be between 0 and 1.",
    );
  }
}

function assertUsable(disposed: boolean): void {
  if (disposed) {
    throw new Error("The Reference proxy vessel has been disposed.");
  }
}
