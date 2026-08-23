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
const BODY_ATTACHMENT_WITH_SOCKETS_KEYS = [
  "physics",
  "shape",
  "sockets",
] as const;
const SPHERE_INTERACTION_SHAPE_KEYS = ["kind", "radius"] as const;
const BOX_INTERACTION_SHAPE_KEYS = ["kind", "halfExtents"] as const;
const CAPSULE_INTERACTION_SHAPE_KEYS = [
  "kind",
  "radius",
  "halfHeight",
] as const;
const CONVEX_HULL_INTERACTION_SHAPE_KEYS = ["kind", "vertices"] as const;
const COMPOUND_INTERACTION_SHAPE_KEYS = ["kind", "children"] as const;
const COMPOUND_INTERACTION_SHAPE_CHILD_KEYS = [
  "position",
  "rotation",
  "shape",
] as const;
const BODY_INTERACTION_ANCHOR_SOCKET_KEYS = ["id", "kind", "position"] as const;
const BODY_EFFECT_SOCKET_KEYS = [
  "id",
  "kind",
  "position",
  "direction",
  "radius",
  "strength",
  "priority",
] as const;

/** @public */
export const MAX_CONVEX_HULL_VERTICES = 64 as const;

/** @public */
export const MAX_COMPOUND_INTERACTION_SHAPE_CHILDREN = 32 as const;

/** @public */
export const MAX_BODY_INTERACTION_SOCKETS = 8 as const;

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
 * An axis-aligned box in Body-local space.
 *
 * @public
 */
export interface BoxInteractionShape {
  readonly kind: "box";
  readonly halfExtents: BodyPhysicsVector3;
}

/**
 * A Y-axis capsule in Body-local space.
 *
 * @public
 */
export interface CapsuleInteractionShape {
  readonly kind: "capsule";
  readonly radius: number;
  readonly halfHeight: number;
}

/**
 * Vertices whose convex hull is the closed Body interaction proxy.
 *
 * @public
 */
export interface ConvexHullInteractionShape {
  readonly kind: "convex-hull";
  readonly vertices: readonly BodyPhysicsVector3[];
}

/**
 * A non-compound shape accepted directly or as one Compound child.
 *
 * @public
 */
export type PrimitiveInteractionShape =
  | SphereInteractionShape
  | BoxInteractionShape
  | CapsuleInteractionShape
  | ConvexHullInteractionShape;

/**
 * One immutable primitive placed in Body-local space.
 *
 * @public
 */
export interface CompoundInteractionShapeChild {
  readonly position: BodyPhysicsVector3;
  readonly rotation: BodyPhysicsQuaternion;
  readonly shape: PrimitiveInteractionShape;
}

/**
 * A bounded flat collection of Body-local primitive proxies.
 *
 * @public
 */
export interface CompoundInteractionShape {
  readonly kind: "compound";
  readonly children: readonly CompoundInteractionShapeChild[];
}

/**
 * A closed, immutable proxy used for bounded water interaction.
 *
 * @public
 */
export type InteractionShape =
  PrimitiveInteractionShape | CompoundInteractionShape;

/**
 * Stable semantics for an authored Body-local water interaction socket.
 *
 * @public
 */
export type BodyInteractionSocketKind =
  "bow" | "stern" | "propeller" | "wake" | "interaction-anchor";

/**
 * The one Body-local point that may drive the Open Water Domain's Interaction
 * Anchor while its attachment remains active.
 *
 * @public
 */
export interface BodyInteractionAnchorSocket {
  readonly id: string;
  readonly kind: "interaction-anchor";
  readonly position: BodyPhysicsVector3;
}

/**
 * One Body-local directional source generated automatically by Body coupling.
 * `direction` points away from the socket along the emitted wake or wash.
 *
 * @public
 */
export interface BodyEffectSocket {
  readonly id: string;
  readonly kind: "bow" | "stern" | "propeller" | "wake";
  readonly position: BodyPhysicsVector3;
  readonly direction: BodyPhysicsVector3;
  readonly radius: number;
  readonly strength: number;
  readonly priority: number;
}

/** @public */
export type BodyInteractionSocket =
  BodyInteractionAnchorSocket | BodyEffectSocket;

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
 * Deterministic result of updating one attachment's stable socket sources.
 *
 * @public
 */
export interface BodyWakeUpdateReceipt {
  readonly tick: number;
  readonly emittedSocketIds: readonly string[];
  readonly droppedSocketIds: readonly string[];
  readonly activeBodyWakeCount: number;
  readonly activeDisturbanceCount: number;
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
  readonly sockets?: readonly BodyInteractionSocket[];
}

/**
 * Lightweight state for one Body attachment.
 *
 * @public
 */
export interface BodyAttachmentSnapshot {
  readonly attached: boolean;
  readonly queryPointCount: number;
  readonly fixedStepCount: number;
  readonly lastFixedStepTick: number | null;
  readonly lastWaterLoad: BodyWaterLoad | null;
  readonly lastWakeReceipt: BodyWakeUpdateReceipt | null;
}

/**
 * One immutable Interaction Shape attachment owned by a ready runtime.
 *
 * @public
 */
export interface BodyAttachment {
  readonly id: number;
  readonly shape: InteractionShape;
  readonly sockets: readonly BodyInteractionSocket[];
  inspect(): BodyAttachmentSnapshot;
  detach(): void;
}

export function readBodyAttachmentOptions(
  options: BodyAttachmentOptions,
): Readonly<{
  physics: BodyPhysicsAdapter;
  shape: InteractionShape;
  sockets: readonly BodyInteractionSocket[];
}> {
  if (
    !isRecord(options) ||
    (!hasExactKeys(options, BODY_ATTACHMENT_KEYS) &&
      !hasExactKeys(options, BODY_ATTACHMENT_WITH_SOCKETS_KEYS))
  ) {
    throw new TypeError(
      "Body attachment options must use the exact physics, shape, and optional sockets contract.",
    );
  }
  return Object.freeze({
    physics: assertBodyPhysicsAdapter(options.physics),
    shape: readInteractionShape(options.shape),
    sockets: readBodyInteractionSockets(options.sockets ?? []),
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
  if (!isRecord(shape)) {
    throw new TypeError(
      "An Interaction Shape must be a supported closed shape.",
    );
  }
  switch (shape.kind) {
    case "sphere":
      return readSphereInteractionShape(shape);
    case "box":
      return readBoxInteractionShape(shape);
    case "capsule":
      return readCapsuleInteractionShape(shape);
    case "convex-hull":
      return readConvexHullInteractionShape(shape);
    case "compound":
      return readCompoundInteractionShape(shape);
    default:
      throw new TypeError(
        "An Interaction Shape must be a sphere, box, capsule, convex hull, or flat compound.",
      );
  }
}

function readSphereInteractionShape(
  shape: Record<string, unknown>,
): SphereInteractionShape {
  if (!hasExactKeys(shape, SPHERE_INTERACTION_SHAPE_KEYS)) {
    throw new TypeError(
      "A sphere Interaction Shape uses kind and radius only.",
    );
  }
  assertPositiveFinite(shape.radius, "Sphere Interaction Shape radius");
  return Object.freeze({ kind: "sphere", radius: shape.radius });
}

function readBoxInteractionShape(
  shape: Record<string, unknown>,
): BoxInteractionShape {
  if (!hasExactKeys(shape, BOX_INTERACTION_SHAPE_KEYS)) {
    throw new TypeError(
      "A box Interaction Shape uses kind and halfExtents only.",
    );
  }
  const halfExtents = readVector(
    shape.halfExtents as BodyPhysicsVector3,
    "Box Interaction Shape halfExtents",
  );
  assertPositiveFinite(halfExtents.x, "Box halfExtent x");
  assertPositiveFinite(halfExtents.y, "Box halfExtent y");
  assertPositiveFinite(halfExtents.z, "Box halfExtent z");
  return Object.freeze({ kind: "box", halfExtents });
}

function readCapsuleInteractionShape(
  shape: Record<string, unknown>,
): CapsuleInteractionShape {
  if (!hasExactKeys(shape, CAPSULE_INTERACTION_SHAPE_KEYS)) {
    throw new TypeError(
      "A capsule Interaction Shape uses kind, radius, and halfHeight only.",
    );
  }
  assertPositiveFinite(shape.radius, "Capsule Interaction Shape radius");
  assertPositiveFinite(
    shape.halfHeight,
    "Capsule Interaction Shape halfHeight",
  );
  return Object.freeze({
    kind: "capsule",
    radius: shape.radius,
    halfHeight: shape.halfHeight,
  });
}

function readConvexHullInteractionShape(
  shape: Record<string, unknown>,
): ConvexHullInteractionShape {
  if (
    !hasExactKeys(shape, CONVEX_HULL_INTERACTION_SHAPE_KEYS) ||
    !Array.isArray(shape.vertices)
  ) {
    throw new TypeError(
      "A convex-hull Interaction Shape uses kind and vertices only.",
    );
  }
  if (
    shape.vertices.length < 4 ||
    shape.vertices.length > MAX_CONVEX_HULL_VERTICES
  ) {
    throw new RangeError(
      `A convex-hull Interaction Shape requires 4 to ${String(MAX_CONVEX_HULL_VERTICES)} vertices.`,
    );
  }
  const vertices = shape.vertices.map((vertex, index) =>
    readVector(
      vertex as BodyPhysicsVector3,
      `Convex-hull vertex ${String(index)}`,
    ),
  );
  if (!containsNonCoplanarVertices(vertices)) {
    throw new RangeError(
      "A convex-hull Interaction Shape requires four non-coplanar vertices.",
    );
  }
  return Object.freeze({
    kind: "convex-hull",
    vertices: Object.freeze(vertices),
  });
}

function readCompoundInteractionShape(
  shape: Record<string, unknown>,
): CompoundInteractionShape {
  if (
    !hasExactKeys(shape, COMPOUND_INTERACTION_SHAPE_KEYS) ||
    !Array.isArray(shape.children)
  ) {
    throw new TypeError(
      "A compound Interaction Shape uses kind and children only.",
    );
  }
  if (
    shape.children.length < 1 ||
    shape.children.length > MAX_COMPOUND_INTERACTION_SHAPE_CHILDREN
  ) {
    throw new RangeError(
      `A compound Interaction Shape requires 1 to ${String(MAX_COMPOUND_INTERACTION_SHAPE_CHILDREN)} children.`,
    );
  }
  const children = shape.children.map((candidate, index) => {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, COMPOUND_INTERACTION_SHAPE_CHILD_KEYS)
    ) {
      throw new TypeError(
        `Compound Interaction Shape child ${String(index)} must use position, rotation, and shape only.`,
      );
    }
    const childShape = readInteractionShape(
      candidate.shape as InteractionShape,
    );
    if (childShape.kind === "compound") {
      throw new TypeError("Compound Interaction Shapes cannot be nested.");
    }
    return Object.freeze({
      position: readVector(
        candidate.position as BodyPhysicsVector3,
        `Compound child ${String(index)} position`,
      ),
      rotation: readNormalizedQuaternion(
        candidate.rotation as BodyPhysicsQuaternion,
        `Compound child ${String(index)} rotation`,
      ),
      shape: childShape,
    });
  });
  return Object.freeze({
    kind: "compound",
    children: Object.freeze(children),
  });
}

export function readBodyInteractionSockets(
  sockets: readonly BodyInteractionSocket[],
): readonly BodyInteractionSocket[] {
  if (!Array.isArray(sockets)) {
    throw new TypeError("Body interaction sockets must be an array.");
  }
  if (sockets.length > MAX_BODY_INTERACTION_SOCKETS) {
    throw new RangeError(
      `A Body attachment supports at most ${String(MAX_BODY_INTERACTION_SOCKETS)} authored sockets.`,
    );
  }
  const ids = new Set<string>();
  const singletonKinds = new Set<
    Exclude<BodyInteractionSocketKind, "propeller">
  >();
  const accepted = sockets.map((socket, index): BodyInteractionSocket => {
    if (!isRecord(socket) || typeof socket.id !== "string") {
      throw new TypeError(
        `Body interaction socket ${String(index)} requires a stable string id.`,
      );
    }
    const id = socket.id.trim();
    if (id.length === 0 || id !== socket.id || ids.has(id)) {
      throw new TypeError(
        "Body interaction socket ids must be non-empty, trimmed, and unique.",
      );
    }
    ids.add(id);
    if (socket.kind === "interaction-anchor") {
      if (!hasExactKeys(socket, BODY_INTERACTION_ANCHOR_SOCKET_KEYS)) {
        throw new TypeError(
          "An Interaction Anchor socket uses id, kind, and position only.",
        );
      }
      assertSingletonSocketKind(singletonKinds, socket.kind);
      return Object.freeze({
        id,
        kind: "interaction-anchor",
        position: readVector(
          socket.position as BodyPhysicsVector3,
          "Interaction Anchor socket position",
        ),
      });
    }
    if (
      socket.kind !== "bow" &&
      socket.kind !== "stern" &&
      socket.kind !== "propeller" &&
      socket.kind !== "wake"
    ) {
      throw new TypeError(
        "A Body interaction socket kind must be bow, stern, propeller, wake, or interaction-anchor.",
      );
    }
    if (!hasExactKeys(socket, BODY_EFFECT_SOCKET_KEYS)) {
      throw new TypeError(
        "A Body effect socket uses id, kind, position, direction, radius, strength, and priority only.",
      );
    }
    if (socket.kind !== "propeller") {
      assertSingletonSocketKind(singletonKinds, socket.kind);
    }
    const direction = readUnitDirection(
      socket.direction as BodyPhysicsVector3,
      `${socket.kind} socket direction`,
    );
    assertPositiveFinite(socket.radius, `${socket.kind} socket radius`);
    if (socket.radius > 48) {
      throw new RangeError(
        "Body effect socket radius must not exceed 48 metres.",
      );
    }
    const strength = socket.strength;
    if (
      typeof strength !== "number" ||
      !Number.isFinite(strength) ||
      strength < 0 ||
      strength > 4
    ) {
      throw new RangeError(
        "Body effect socket strength must be between zero and four.",
      );
    }
    const priority = socket.priority;
    if (
      typeof priority !== "number" ||
      !Number.isInteger(priority) ||
      priority < 0 ||
      priority > 255
    ) {
      throw new RangeError(
        "Body effect socket priority must be an unsigned 8-bit integer.",
      );
    }
    return Object.freeze({
      id,
      kind: socket.kind,
      position: readVector(
        socket.position as BodyPhysicsVector3,
        `${socket.kind} socket position`,
      ),
      direction,
      radius: socket.radius,
      strength,
      priority,
    });
  });
  return Object.freeze(accepted);
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

function readNormalizedQuaternion(
  value: BodyPhysicsQuaternion,
  label: string,
): BodyPhysicsQuaternion {
  const rotation = readQuaternion(value, label);
  const length = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
  if (Math.abs(length - 1) > 1e-6) {
    throw new RangeError(`${label} must be normalized.`);
  }
  return rotation;
}

function readUnitDirection(
  value: BodyPhysicsVector3,
  label: string,
): BodyPhysicsVector3 {
  const direction = readVector(value, label);
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (
    Math.abs(length - 1) > 1e-6 ||
    Math.hypot(direction.x, direction.z) < 1e-6
  ) {
    throw new RangeError(
      `${label} must be normalized and have a horizontal component.`,
    );
  }
  return direction;
}

function assertPositiveFinite(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and greater than zero.`);
  }
}

function assertSingletonSocketKind(
  kinds: Set<Exclude<BodyInteractionSocketKind, "propeller">>,
  kind: Exclude<BodyInteractionSocketKind, "propeller">,
): void {
  if (kinds.has(kind)) {
    throw new TypeError(`A Body attachment supports only one ${kind} socket.`);
  }
  kinds.add(kind);
}

function containsNonCoplanarVertices(
  vertices: readonly BodyPhysicsVector3[],
): boolean {
  const origin = vertices[0];
  if (origin === undefined) {
    return false;
  }
  for (let a = 1; a < vertices.length - 2; a += 1) {
    const first = subtract(vertices[a], origin);
    for (let b = a + 1; b < vertices.length - 1; b += 1) {
      const second = subtract(vertices[b], origin);
      const crossX = first.y * second.z - first.z * second.y;
      const crossY = first.z * second.x - first.x * second.z;
      const crossZ = first.x * second.y - first.y * second.x;
      for (let c = b + 1; c < vertices.length; c += 1) {
        const third = subtract(vertices[c], origin);
        const volume = crossX * third.x + crossY * third.y + crossZ * third.z;
        if (Math.abs(volume) > 1e-9) {
          return true;
        }
      }
    }
  }
  return false;
}

function subtract(
  left: BodyPhysicsVector3 | undefined,
  right: BodyPhysicsVector3,
): BodyPhysicsVector3 {
  if (left === undefined) {
    return Object.freeze({ x: 0, y: 0, z: 0 });
  }
  return Object.freeze({
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  });
}
