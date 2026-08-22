import { hasExactKeys, isRecord } from "./internal/record-validation.js";

const BODY_PHYSICS_STATE_KEYS = [
  "position",
  "rotation",
  "linearVelocity",
  "angularVelocity",
  "mass",
] as const;
const BODY_VECTOR_KEYS = ["x", "y", "z"] as const;
const BODY_QUATERNION_KEYS = ["x", "y", "z", "w"] as const;
const BODY_PHYSICS_ROUTE_KEYS = ["beforeIntegrate"] as const;
const BODY_PHYSICS_BINDING_KEYS = ["dispose"] as const;
const BODY_ATTACHMENT_KEYS = ["physics", "shape"] as const;
const SPHERE_INTERACTION_SHAPE_KEYS = ["kind", "radius"] as const;

/**
 * A three-dimensional value in the Host's current Three.js frame.
 *
 * @public
 */
export interface BodyPhysicsVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * A normalized Host rigid-body orientation.
 *
 * @public
 */
export interface BodyPhysicsQuaternion extends BodyPhysicsVector3 {
  readonly w: number;
}

/**
 * Host-owned rigid-body state sampled immediately before one fixed step.
 *
 * @public
 */
export interface BodyPhysicsState {
  readonly position: BodyPhysicsVector3;
  readonly rotation: BodyPhysicsQuaternion;
  readonly linearVelocity: BodyPhysicsVector3;
  readonly angularVelocity: BodyPhysicsVector3;
  readonly mass: number;
}

/**
 * Host presentation pose interpolated between completed fixed steps.
 *
 * @public
 */
export interface BodyPhysicsPose {
  readonly position: BodyPhysicsVector3;
  readonly rotation: BodyPhysicsQuaternion;
}

/**
 * The closed sphere Interaction Shape supported by the first Body coupling.
 *
 * @public
 */
export interface SphereInteractionShape {
  readonly kind: "sphere";
  readonly radius: number;
}

/**
 * A closed, immutable proxy used for bounded water interaction.
 *
 * @public
 */
export type InteractionShape = SphereInteractionShape;

/**
 * One fixed-step water force and its synchronous Gameplay Query metadata.
 *
 * @public
 */
export interface BodyWaterLoad {
  readonly force: BodyPhysicsVector3;
  readonly torque: BodyPhysicsVector3;
  readonly queryTick: number;
  readonly queryControlRevision: number;
  readonly querySnapshotAge: 0 | 1;
}

/**
 * Core callback retained by a Body Physics Adapter's Host fixed-step loop.
 * The Host integrates its rigid body only after this method returns.
 *
 * @public
 */
export interface BodyPhysicsFixedStepRoute {
  beforeIntegrate(): BodyWaterLoad;
}

/**
 * Handle for one Body Physics fixed-step route registration.
 *
 * @public
 */
export interface BodyPhysicsBinding {
  dispose(): void;
}

/**
 * Host-owned rigid-body seam used to sample state and apply water loads.
 *
 * `bind(route)` only registers the route. It must not invoke the route while
 * binding. The Host's 60 Hz physics loop invokes `beforeIntegrate()` and then
 * performs its own rigid-body integration.
 *
 * @public
 */
export interface BodyPhysicsAdapter {
  snapshot(): BodyPhysicsState;
  applyWaterLoad(load: BodyWaterLoad): void;
  bind(route: BodyPhysicsFixedStepRoute): BodyPhysicsBinding;
}

/**
 * Callback implementation used to bridge a Host physics engine to the public
 * Body Physics Adapter seam without adding that engine to Core.
 *
 * @public
 */
export type BodyPhysicsAdapterOptions = BodyPhysicsAdapter;

/**
 * Creates a production Body Physics Adapter from Host-owned callbacks.
 *
 * @public
 */
export function createBodyPhysicsAdapter(
  options: BodyPhysicsAdapterOptions,
): BodyPhysicsAdapter {
  assertBodyPhysicsAdapter(options);
  return Object.freeze({
    snapshot: () => readBodyPhysicsState(options.snapshot()),
    applyWaterLoad(load: BodyWaterLoad): void {
      options.applyWaterLoad(readBodyWaterLoad(load));
    },
    bind(route: BodyPhysicsFixedStepRoute): BodyPhysicsBinding {
      return readBodyPhysicsBinding(
        options.bind(readBodyPhysicsFixedStepRoute(route)),
      );
    },
  });
}

/**
 * Values required to attach one Host-owned rigid body.
 *
 * @public
 */
export interface BodyAttachmentOptions {
  readonly physics: BodyPhysicsAdapter;
  readonly shape: InteractionShape;
}

/**
 * Lightweight state for one Body attachment.
 *
 * @public
 */
export interface BodyAttachmentSnapshot {
  readonly attached: boolean;
  readonly lastWaterLoad: BodyWaterLoad | null;
}

/**
 * One immutable Interaction Shape attachment owned by a ready runtime.
 *
 * @public
 */
export interface BodyAttachment {
  readonly id: number;
  readonly shape: InteractionShape;
  inspect(): BodyAttachmentSnapshot;
  detach(): void;
}

export function readBodyAttachmentOptions(
  options: BodyAttachmentOptions,
): BodyAttachmentOptions {
  if (!isRecord(options) || !hasExactKeys(options, BODY_ATTACHMENT_KEYS)) {
    throw new TypeError(
      "Body attachment options must use the exact physics and shape contract.",
    );
  }
  return Object.freeze({
    physics: assertBodyPhysicsAdapter(options.physics),
    shape: readInteractionShape(options.shape),
  });
}

export function assertBodyPhysicsAdapter(
  physics: BodyPhysicsAdapter,
): BodyPhysicsAdapter {
  if (
    !isRecord(physics) ||
    typeof physics.snapshot !== "function" ||
    typeof physics.applyWaterLoad !== "function" ||
    typeof physics.bind !== "function"
  ) {
    throw new TypeError(
      "A Body Physics Adapter requires snapshot(), applyWaterLoad(load), and bind(route).",
    );
  }
  return physics;
}

export function readBodyPhysicsState(
  state: BodyPhysicsState,
): BodyPhysicsState {
  if (!isRecord(state) || !hasExactKeys(state, BODY_PHYSICS_STATE_KEYS)) {
    throw new TypeError(
      "Body Physics state must use the exact state contract.",
    );
  }
  const rotation = readQuaternion(state.rotation, "Body rotation");
  const quaternionLength = Math.hypot(
    rotation.x,
    rotation.y,
    rotation.z,
    rotation.w,
  );
  if (Math.abs(quaternionLength - 1) > 1e-6) {
    throw new RangeError("Body rotation must be a normalized quaternion.");
  }
  if (!Number.isFinite(state.mass) || state.mass <= 0) {
    throw new RangeError("Body mass must be finite and greater than zero.");
  }
  return Object.freeze({
    position: readVector(state.position, "Body position"),
    rotation,
    linearVelocity: readVector(state.linearVelocity, "Body linear velocity"),
    angularVelocity: readVector(state.angularVelocity, "Body angular velocity"),
    mass: state.mass,
  });
}

export function readInteractionShape(
  shape: InteractionShape,
): InteractionShape {
  if (
    !isRecord(shape) ||
    !hasExactKeys(shape, SPHERE_INTERACTION_SHAPE_KEYS) ||
    shape.kind !== "sphere"
  ) {
    throw new TypeError(
      "This Body coupling requires the exact closed sphere Interaction Shape.",
    );
  }
  if (!Number.isFinite(shape.radius) || shape.radius <= 0) {
    throw new RangeError(
      "Sphere Interaction Shape radius must be finite and greater than zero.",
    );
  }
  return Object.freeze({ kind: "sphere", radius: shape.radius });
}

export function readBodyPhysicsFixedStepRoute(
  route: BodyPhysicsFixedStepRoute,
): BodyPhysicsFixedStepRoute {
  if (
    !isRecord(route) ||
    !hasExactKeys(route, BODY_PHYSICS_ROUTE_KEYS) ||
    typeof route.beforeIntegrate !== "function"
  ) {
    throw new TypeError(
      "A Body Physics fixed-step route requires only beforeIntegrate().",
    );
  }
  return route;
}

export function readBodyPhysicsBinding(
  binding: BodyPhysicsBinding,
): BodyPhysicsBinding {
  if (
    !isRecord(binding) ||
    !hasExactKeys(binding, BODY_PHYSICS_BINDING_KEYS) ||
    typeof binding.dispose !== "function"
  ) {
    throw new TypeError(
      "A Body Physics binding requires only an idempotent dispose().",
    );
  }
  return binding;
}

export function readBodyWaterLoad(load: BodyWaterLoad): BodyWaterLoad {
  if (!isRecord(load)) {
    throw new TypeError("Body water load must be an object.");
  }
  if (!Number.isSafeInteger(load.queryTick) || load.queryTick < 0) {
    throw new RangeError("Body water load queryTick must be non-negative.");
  }
  if (
    !Number.isSafeInteger(load.queryControlRevision) ||
    load.queryControlRevision < 0
  ) {
    throw new RangeError(
      "Body water load queryControlRevision must be non-negative.",
    );
  }
  if (load.querySnapshotAge !== 0 && load.querySnapshotAge !== 1) {
    throw new RangeError(
      "Body water load querySnapshotAge must be zero or one.",
    );
  }
  return Object.freeze({
    force: readVector(load.force, "Body water force"),
    torque: readVector(load.torque, "Body water torque"),
    queryTick: load.queryTick,
    queryControlRevision: load.queryControlRevision,
    querySnapshotAge: load.querySnapshotAge,
  });
}

function readVector(
  value: BodyPhysicsVector3,
  label: string,
): BodyPhysicsVector3 {
  if (!isRecord(value) || !hasExactKeys(value, BODY_VECTOR_KEYS)) {
    throw new TypeError(`${label} must use the exact x, y, and z contract.`);
  }
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new RangeError(`${label} must contain finite values.`);
  }
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function readQuaternion(
  value: BodyPhysicsQuaternion,
  label: string,
): BodyPhysicsQuaternion {
  if (!isRecord(value) || !hasExactKeys(value, BODY_QUATERNION_KEYS)) {
    throw new TypeError(`${label} must use the exact x, y, z, and w contract.`);
  }
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z) ||
    !Number.isFinite(value.w)
  ) {
    throw new RangeError(`${label} must contain finite values.`);
  }
  return Object.freeze({ x: value.x, y: value.y, z: value.z, w: value.w });
}
