import {
  readBodyPhysicsFixedStepRoute,
  readBodyPhysicsState,
  readBodyWaterLoad,
  type BodyPhysicsAdapter,
  type BodyPhysicsBinding,
  type BodyPhysicsFixedStepRoute,
  type BodyPhysicsPose,
  type BodyPhysicsQuaternion,
  type BodyPhysicsState,
  type BodyPhysicsVector3,
  type BodyWaterLoad,
} from "./body-physics.js";

/**
 * Fixed coupling cadence owned by a Real Water Host integration.
 *
 * @public
 */
export const BODY_PHYSICS_FIXED_TICK_HZ = 60 as const;

/**
 * Initial values for the deterministic Memory Body Physics Adapter.
 *
 * @public
 */
export interface MemoryBodyPhysicsAdapterOptions {
  readonly initialState: BodyPhysicsState;
}

/**
 * Deterministic in-memory implementation of the Body Physics Adapter seam.
 *
 * @public
 */
export interface MemoryBodyPhysicsAdapter extends BodyPhysicsAdapter {
  integrateFixedStep(): BodyPhysicsState;
  interpolate(alpha: number): BodyPhysicsPose;
}

/**
 * Creates a deterministic Y-up rigid body with Host-driven 60 Hz integration.
 *
 * @public
 */
export function createMemoryBodyPhysicsAdapter(
  options: MemoryBodyPhysicsAdapterOptions,
): MemoryBodyPhysicsAdapter {
  let current = readBodyPhysicsState(options.initialState);
  let previous = current;
  let route: BodyPhysicsFixedStepRoute | undefined;
  let accumulatedForce = zeroVector();
  let accumulatedTorque = zeroVector();

  return Object.freeze({
    snapshot: () => current,
    applyWaterLoad(load: BodyWaterLoad): void {
      const accepted = readBodyWaterLoad(load);
      accumulatedForce = addVectors(accumulatedForce, accepted.force);
      accumulatedTorque = addVectors(accumulatedTorque, accepted.torque);
    },
    bind(next: BodyPhysicsFixedStepRoute): BodyPhysicsBinding {
      const accepted = readBodyPhysicsFixedStepRoute(next);
      if (route !== undefined) {
        throw new Error("The Memory Body Physics Adapter is already bound.");
      }
      route = accepted;
      let disposed = false;
      return Object.freeze({
        dispose(): void {
          if (disposed) {
            return;
          }
          disposed = true;
          if (route === accepted) {
            route = undefined;
          }
          accumulatedForce = zeroVector();
          accumulatedTorque = zeroVector();
        },
      });
    },
    integrateFixedStep(): BodyPhysicsState {
      const activeRoute = route;
      if (activeRoute === undefined) {
        throw new Error(
          "The Memory Body Physics Adapter has no bound fixed-step route.",
        );
      }
      activeRoute.beforeIntegrate();
      previous = current;
      const deltaSeconds = 1 / BODY_PHYSICS_FIXED_TICK_HZ;
      const acceleration = Object.freeze({
        x: accumulatedForce.x / current.mass,
        y: accumulatedForce.y / current.mass - 9.81,
        z: accumulatedForce.z / current.mass,
      });
      const linearVelocity = Object.freeze({
        x: current.linearVelocity.x + acceleration.x * deltaSeconds,
        y: current.linearVelocity.y + acceleration.y * deltaSeconds,
        z: current.linearVelocity.z + acceleration.z * deltaSeconds,
      });
      current = readBodyPhysicsState({
        position: {
          x: current.position.x + linearVelocity.x * deltaSeconds,
          y: current.position.y + linearVelocity.y * deltaSeconds,
          z: current.position.z + linearVelocity.z * deltaSeconds,
        },
        rotation: current.rotation,
        linearVelocity,
        angularVelocity: current.angularVelocity,
        mass: current.mass,
      });
      accumulatedForce = zeroVector();
      accumulatedTorque = zeroVector();
      return current;
    },
    interpolate(alpha: number): BodyPhysicsPose {
      if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
        throw new RangeError(
          "Body presentation interpolation alpha must be between zero and one.",
        );
      }
      return Object.freeze({
        position: interpolateVector(previous.position, current.position, alpha),
        rotation: interpolateQuaternion(
          previous.rotation,
          current.rotation,
          alpha,
        ),
      });
    },
  });
}

function zeroVector(): BodyPhysicsVector3 {
  return Object.freeze({ x: 0, y: 0, z: 0 });
}

function addVectors(
  left: BodyPhysicsVector3,
  right: BodyPhysicsVector3,
): BodyPhysicsVector3 {
  return Object.freeze({
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  });
}

function interpolateVector(
  previous: BodyPhysicsVector3,
  current: BodyPhysicsVector3,
  alpha: number,
): BodyPhysicsVector3 {
  return Object.freeze({
    x: previous.x + (current.x - previous.x) * alpha,
    y: previous.y + (current.y - previous.y) * alpha,
    z: previous.z + (current.z - previous.z) * alpha,
  });
}

function interpolateQuaternion(
  previous: BodyPhysicsQuaternion,
  current: BodyPhysicsQuaternion,
  alpha: number,
): BodyPhysicsQuaternion {
  const x = previous.x + (current.x - previous.x) * alpha;
  const y = previous.y + (current.y - previous.y) * alpha;
  const z = previous.z + (current.z - previous.z) * alpha;
  const w = previous.w + (current.w - previous.w) * alpha;
  const length = Math.hypot(x, y, z, w);
  return Object.freeze({
    x: x / length,
    y: y / length,
    z: z / length,
    w: w / length,
  });
}
