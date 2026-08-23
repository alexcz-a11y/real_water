import {
  MAX_COMPOUND_INTERACTION_SHAPE_CHILDREN,
  readBodyAttachmentOptions,
  readBodyPhysicsBinding,
  readBodyPhysicsState,
  readBodyWaterLoad,
  type BodyAttachment,
  type BodyAttachmentOptions,
  type BodyAttachmentSnapshot,
  type BodyEffectSocket,
  type BodyPhysicsBinding,
  type BodyPhysicsFixedStepRoute,
  type BodyPhysicsQuaternion,
  type BodyPhysicsState,
  type BodyPhysicsVector3,
  type BodyWaterLoad,
  type BodyWakeUpdateReceipt,
  type InteractionShape,
  type PrimitiveInteractionShape,
} from "../body-physics.js";
import type {
  GameplayQueryBatch,
  GameplayQueryResults,
  HostSimulationState,
} from "../runtime.js";
import type {
  BodyWakeSource,
  LocalInteractionField,
} from "./local-interaction.js";
import { MAX_ATTACHED_BODIES } from "../capabilities.js";
import { RealWaterRuntimeError } from "../errors.js";

const GRAVITY_METRES_PER_SECOND_SQUARED = 9.81;

export interface BodyCoupling {
  attachBody(options: BodyAttachmentOptions): BodyAttachment;
  inspect(): Readonly<{ attachedBodyCount: number }>;
  ownsInteractionAnchor(): boolean;
  dispose(): void;
}

export interface BodyCouplingInteraction {
  readonly readSimulationState: () => HostSimulationState;
  readonly localInteraction: LocalInteractionField;
  readonly synchronize: () => void;
}

interface BodyQueryStorage {
  readonly positions: Float32Array;
  readonly results: GameplayQueryResults;
}

interface InteractionSample {
  readonly localPosition: BodyPhysicsVector3;
  readonly localHalfExtents: BodyPhysicsVector3;
  readonly volume: number;
}

interface AttachmentRecord {
  attached: boolean;
  binding: BodyPhysicsBinding | undefined;
  fixedStepCount: number;
  lastFixedStepTick: number | null;
  lastWaterLoad: BodyWaterLoad | null;
  lastWakeReceipt: BodyWakeUpdateReceipt | null;
  readonly queryPointCount: number;
  readonly slot: number;
}

export function createBodyCoupling(
  assertActive: () => void,
  queryGameplay: (batch: GameplayQueryBatch) => GameplayQueryResults,
  interaction: BodyCouplingInteraction,
): BodyCoupling {
  const active = new Set<AttachmentRecord>();
  const queryStorage = Array.from(
    { length: MAX_ATTACHED_BODIES },
    createBodyQueryStorage,
  );
  const freeSlots = Array.from(
    { length: MAX_ATTACHED_BODIES },
    (_, index) => MAX_ATTACHED_BODIES - index - 1,
  );
  let nextAttachmentId = 0;
  let interactionAnchorOwner: number | undefined;

  return Object.freeze({
    attachBody(options: BodyAttachmentOptions): BodyAttachment {
      assertActive();
      const slot = freeSlots.pop();
      if (slot === undefined) {
        throw new RealWaterRuntimeError({
          code: "BODY_CAPACITY_EXCEEDED",
          message: "The Body attachment exceeds the prepared capacity.",
          diagnostics: {
            capacity: MAX_ATTACHED_BODIES,
            requested: 1,
            used: active.size,
          },
        });
      }
      let accepted: ReturnType<typeof readBodyAttachmentOptions>;
      let samples: readonly InteractionSample[];
      try {
        accepted = readBodyAttachmentOptions(options);
        samples = createInteractionSamples(accepted.shape);
      } catch (cause) {
        freeSlots.push(slot);
        throw cause;
      }
      const query = queryStorage[slot];
      if (query === undefined) {
        freeSlots.push(slot);
        throw new Error("The prepared Body query slot is unavailable.");
      }
      const attachmentId = (nextAttachmentId += 1);
      const anchorSocket = accepted.sockets.find(
        (socket) => socket.kind === "interaction-anchor",
      );
      if (anchorSocket !== undefined && interactionAnchorOwner !== undefined) {
        freeSlots.push(slot);
        throw new RealWaterRuntimeError({
          code: "INTERACTION_ANCHOR_CAPACITY_EXCEEDED",
          message:
            "The one prepared Interaction Anchor is already owned by an attached Body.",
          diagnostics: {
            capacity: 1,
            requested: 1,
            used: 1,
          },
        });
      }
      try {
        readBodyPhysicsState(accepted.physics.snapshot());
      } catch (cause) {
        freeSlots.push(slot);
        throw cause;
      }
      const effectSockets = accepted.sockets.filter(
        (socket): socket is BodyEffectSocket =>
          socket.kind !== "interaction-anchor",
      );
      const wakeSources = effectSockets.map(
        (socket): MutableBodyWakeSource => ({
          socketId: socket.id,
          kind: socket.kind,
          x: 0,
          y: 0,
          z: 0,
          directionX: 0,
          directionZ: 1,
          radius: socket.radius,
          amplitude: 0,
          priority: socket.priority,
        }),
      );
      const activeWakeSources: MutableBodyWakeSource[] = [];
      const record: AttachmentRecord = {
        attached: true,
        binding: undefined,
        fixedStepCount: 0,
        lastFixedStepTick: null,
        lastWaterLoad: null,
        lastWakeReceipt: null,
        queryPointCount: samples.length,
        slot,
      };
      let lastRouteState:
        | Readonly<{ seed: number; tick: number; resetRevision: number }>
        | undefined;
      let phase: "binding" | "active" | "detached" = "binding";
      let invokedDuringBind = false;
      const route: BodyPhysicsFixedStepRoute = Object.freeze({
        beforeIntegrate(): BodyWaterLoad {
          assertActive();
          if (phase === "binding") {
            invokedDuringBind = true;
            throw new Error(
              "Body Physics bind must not call beforeIntegrate().",
            );
          }
          if (phase !== "active" || !record.attached) {
            throw new Error("The Body Physics fixed-step route is detached.");
          }
          const simulationState = interaction.readSimulationState();
          if (
            lastRouteState?.seed === simulationState.seed &&
            lastRouteState.tick === simulationState.tick &&
            lastRouteState.resetRevision ===
              simulationState.simulationResetRevision
          ) {
            throw new RealWaterRuntimeError({
              code: "BODY_ROUTE_TICK_REPEATED",
              message:
                "A Body fixed-step route can run only once per Host simulation tick.",
              diagnostics: {
                attachmentId,
                tick: simulationState.tick,
              },
            });
          }
          const state = readBodyPhysicsState(accepted.physics.snapshot());
          if (anchorSocket !== undefined) {
            const worldAnchor = transformPoint(
              anchorSocket.position,
              state.position,
              state.rotation,
            );
            interaction.localInteraction.updateAnchor(
              { x: worldAnchor.x, z: worldAnchor.z },
              simulationState,
            );
          }
          writeSamplePositions(query.positions, samples, state);
          queryGameplay({
            count: samples.length,
            positions: query.positions,
            results: query.results,
          });
          const load = createCompoundWaterLoad(state, samples, query.results);
          writeBodyWakeSources(wakeSources, effectSockets, state);
          activeWakeSources.length = 0;
          for (const source of wakeSources) {
            if (Math.abs(source.amplitude) > 1e-6) {
              activeWakeSources.push(source);
            }
          }
          const wakeReceipt = interaction.localInteraction.updateBodyWakes(
            attachmentId,
            activeWakeSources,
            simulationState,
          );
          interaction.synchronize();
          accepted.physics.applyWaterLoad(load);
          lastRouteState = Object.freeze({
            seed: simulationState.seed,
            tick: simulationState.tick,
            resetRevision: simulationState.simulationResetRevision,
          });
          record.fixedStepCount += 1;
          record.lastFixedStepTick = simulationState.tick;
          record.lastWaterLoad = load;
          record.lastWakeReceipt = wakeReceipt;
          return load;
        },
      });

      try {
        record.binding = readBodyPhysicsBinding(accepted.physics.bind(route));
        if (invokedDuringBind) {
          try {
            record.binding.dispose();
          } finally {
            record.binding = undefined;
          }
          throw new Error("Body Physics bind must not call beforeIntegrate().");
        }
      } catch (cause) {
        record.attached = false;
        phase = "detached";
        if (interactionAnchorOwner === attachmentId) {
          interactionAnchorOwner = undefined;
        }
        interaction.localInteraction.removeBodyWakes(attachmentId);
        freeSlots.push(slot);
        throw cause;
      }
      phase = "active";
      active.add(record);
      if (anchorSocket !== undefined) {
        interactionAnchorOwner = attachmentId;
      }
      const attachment: BodyAttachment = Object.freeze({
        id: attachmentId,
        shape: accepted.shape,
        sockets: accepted.sockets,
        inspect(): BodyAttachmentSnapshot {
          return Object.freeze({
            attached: record.attached,
            queryPointCount: record.queryPointCount,
            fixedStepCount: record.fixedStepCount,
            lastFixedStepTick: record.lastFixedStepTick,
            lastWaterLoad: record.lastWaterLoad,
            lastWakeReceipt: record.lastWakeReceipt,
          });
        },
        detach(): void {
          if (!record.attached) {
            return;
          }
          record.attached = false;
          phase = "detached";
          active.delete(record);
          if (interactionAnchorOwner === attachmentId) {
            interactionAnchorOwner = undefined;
          }
          interaction.localInteraction.removeBodyWakes(attachmentId);
          interaction.synchronize();
          freeSlots.push(record.slot);
          try {
            record.binding?.dispose();
          } finally {
            record.binding = undefined;
          }
        },
      });
      return attachment;
    },
    inspect() {
      return Object.freeze({ attachedBodyCount: active.size });
    },
    ownsInteractionAnchor() {
      return interactionAnchorOwner !== undefined;
    },
    dispose(): void {
      for (const record of [...active]) {
        record.attached = false;
        active.delete(record);
        freeSlots.push(record.slot);
        try {
          record.binding?.dispose();
        } catch {
          // A Host binding cannot retain another body's Core attachment.
        } finally {
          record.binding = undefined;
        }
      }
      interactionAnchorOwner = undefined;
    },
  });
}

type MutableBodyWakeSource = {
  -readonly [Key in keyof BodyWakeSource]: BodyWakeSource[Key];
};

function writeBodyWakeSources(
  sources: MutableBodyWakeSource[],
  sockets: readonly BodyEffectSocket[],
  state: BodyPhysicsState,
): void {
  for (let index = 0; index < sockets.length; index += 1) {
    const socket = sockets[index];
    const source = sources[index];
    if (socket === undefined || source === undefined) {
      continue;
    }
    const worldPosition = transformPoint(
      socket.position,
      state.position,
      state.rotation,
    );
    const worldDirection = rotateVector(socket.direction, state.rotation);
    const horizontalLength = Math.hypot(worldDirection.x, worldDirection.z);
    const directionX =
      horizontalLength < 1e-6
        ? socket.direction.x
        : worldDirection.x / horizontalLength;
    const directionZ =
      horizontalLength < 1e-6
        ? socket.direction.z
        : worldDirection.z / horizontalLength;
    const speedIntoSource = Math.max(
      0,
      -(
        state.linearVelocity.x * directionX +
        state.linearVelocity.z * directionZ
      ),
    );
    source.x = worldPosition.x;
    source.y = worldPosition.y;
    source.z = worldPosition.z;
    source.directionX = directionX;
    source.directionZ = directionZ;
    source.amplitude = clamp(speedIntoSource * socket.strength, 0, 4);
  }
}

function transformPoint(
  local: BodyPhysicsVector3,
  position: BodyPhysicsVector3,
  rotation: BodyPhysicsQuaternion,
): BodyPhysicsVector3 {
  const rotated = rotateVector(local, rotation);
  return freezeVector({
    x: position.x + rotated.x,
    y: position.y + rotated.y,
    z: position.z + rotated.z,
  });
}

function createBodyQueryStorage(): BodyQueryStorage {
  const count = MAX_COMPOUND_INTERACTION_SHAPE_CHILDREN;
  return {
    positions: new Float32Array(count * 3),
    results: {
      heights: new Float32Array(count),
      normals: new Float32Array(count * 3),
      velocities: new Float32Array(count * 3),
      foam: new Float32Array(count),
      ticks: new Float64Array(count),
      controlRevisions: new Float64Array(count),
      snapshotAges: new Uint8Array(count),
    },
  };
}

function createInteractionSamples(
  shape: InteractionShape,
): readonly InteractionSample[] {
  if (shape.kind !== "compound") {
    return Object.freeze([primitiveSample(shape)]);
  }
  return Object.freeze(
    shape.children.map((child) => {
      const primitive = primitiveSample(child.shape);
      const rotatedCenter = rotateVector(
        primitive.localPosition,
        child.rotation,
      );
      return Object.freeze({
        localPosition: freezeVector({
          x: child.position.x + rotatedCenter.x,
          y: child.position.y + rotatedCenter.y,
          z: child.position.z + rotatedCenter.z,
        }),
        localHalfExtents: rotateHalfExtents(
          primitive.localHalfExtents,
          child.rotation,
        ),
        volume: primitive.volume,
      });
    }),
  );
}

function primitiveSample(shape: PrimitiveInteractionShape): InteractionSample {
  switch (shape.kind) {
    case "sphere":
      return Object.freeze({
        localPosition: zeroVector(),
        localHalfExtents: freezeVector({
          x: shape.radius,
          y: shape.radius,
          z: shape.radius,
        }),
        volume: (4 / 3) * Math.PI * shape.radius ** 3,
      });
    case "box":
      return Object.freeze({
        localPosition: zeroVector(),
        localHalfExtents: shape.halfExtents,
        volume:
          8 * shape.halfExtents.x * shape.halfExtents.y * shape.halfExtents.z,
      });
    case "capsule":
      return Object.freeze({
        localPosition: zeroVector(),
        localHalfExtents: freezeVector({
          x: shape.radius,
          y: shape.radius + shape.halfHeight,
          z: shape.radius,
        }),
        volume:
          Math.PI * shape.radius ** 2 * shape.halfHeight * 2 +
          (4 / 3) * Math.PI * shape.radius ** 3,
      });
    case "convex-hull": {
      const bounds = convexBounds(shape.vertices);
      return Object.freeze({
        localPosition: freezeVector({
          x: (bounds.minimum.x + bounds.maximum.x) / 2,
          y: (bounds.minimum.y + bounds.maximum.y) / 2,
          z: (bounds.minimum.z + bounds.maximum.z) / 2,
        }),
        localHalfExtents: freezeVector({
          x: Math.max((bounds.maximum.x - bounds.minimum.x) / 2, 0.000_1),
          y: Math.max((bounds.maximum.y - bounds.minimum.y) / 2, 0.000_1),
          z: Math.max((bounds.maximum.z - bounds.minimum.z) / 2, 0.000_1),
        }),
        volume: Math.max(
          (bounds.maximum.x - bounds.minimum.x) *
            (bounds.maximum.y - bounds.minimum.y) *
            (bounds.maximum.z - bounds.minimum.z),
          0.000_001,
        ),
      });
    }
  }
}

function writeSamplePositions(
  positions: Float32Array,
  samples: readonly InteractionSample[],
  state: BodyPhysicsState,
): void {
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample === undefined) {
      continue;
    }
    const lever = rotateVector(sample.localPosition, state.rotation);
    const vectorIndex = index * 3;
    positions[vectorIndex] = state.position.x + lever.x;
    positions[vectorIndex + 1] = state.position.y + lever.y;
    positions[vectorIndex + 2] = state.position.z + lever.z;
  }
}

function createCompoundWaterLoad(
  state: BodyPhysicsState,
  samples: readonly InteractionSample[],
  results: GameplayQueryResults,
): BodyWaterLoad {
  const totalVolume = samples.reduce((sum, sample) => sum + sample.volume, 0);
  let force = mutableZeroVector();
  let torque = mutableZeroVector();
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample === undefined) {
      continue;
    }
    const vectorIndex = index * 3;
    const lever = rotateVector(sample.localPosition, state.rotation);
    const immersionRadius = Math.max(
      rotateHalfExtents(sample.localHalfExtents, state.rotation).y,
      0.000_1,
    );
    const pointVelocity = addMutable(
      state.linearVelocity,
      cross(state.angularVelocity, lever),
    );
    const waterHeight = results.heights[index] ?? Number.NaN;
    const waterVelocityX = results.velocities[vectorIndex] ?? Number.NaN;
    const waterVelocityY = results.velocities[vectorIndex + 1] ?? Number.NaN;
    const waterVelocityZ = results.velocities[vectorIndex + 2] ?? Number.NaN;
    const sampleY = state.position.y + lever.y;
    const submergedDepth = waterHeight - (sampleY - immersionRadius);
    const submergedFraction = clamp(
      submergedDepth / (immersionRadius * 2),
      0,
      1,
    );
    const dampingWeight = clamp(submergedFraction * 2, 0, 1);
    const verticalDamping =
      2 * Math.sqrt(GRAVITY_METRES_PER_SECOND_SQUARED / immersionRadius);
    const horizontalDamping = 2 * dampingWeight;
    const sampleMass = state.mass * (sample.volume / totalVolume);
    const sampleForce = {
      x: sampleMass * horizontalDamping * (waterVelocityX - pointVelocity.x),
      y:
        sampleMass *
        (2 * GRAVITY_METRES_PER_SECOND_SQUARED * submergedFraction +
          verticalDamping * dampingWeight * (waterVelocityY - pointVelocity.y)),
      z: sampleMass * horizontalDamping * (waterVelocityZ - pointVelocity.z),
    };
    force = addMutable(force, sampleForce);
    torque = addMutable(torque, cross(lever, sampleForce));
  }
  return readBodyWaterLoad({
    force,
    torque,
    queryTick: results.ticks[0] ?? Number.NaN,
    queryControlRevision: results.controlRevisions[0] ?? Number.NaN,
    querySnapshotAge: results.snapshotAges[0] ?? Number.NaN,
  } as BodyWaterLoad);
}

function convexBounds(vertices: readonly BodyPhysicsVector3[]): Readonly<{
  minimum: BodyPhysicsVector3;
  maximum: BodyPhysicsVector3;
}> {
  const minimum = { x: Infinity, y: Infinity, z: Infinity };
  const maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const vertex of vertices) {
    minimum.x = Math.min(minimum.x, vertex.x);
    minimum.y = Math.min(minimum.y, vertex.y);
    minimum.z = Math.min(minimum.z, vertex.z);
    maximum.x = Math.max(maximum.x, vertex.x);
    maximum.y = Math.max(maximum.y, vertex.y);
    maximum.z = Math.max(maximum.z, vertex.z);
  }
  return Object.freeze({
    minimum: freezeVector(minimum),
    maximum: freezeVector(maximum),
  });
}

function rotateVector(
  vector: BodyPhysicsVector3,
  rotation: BodyPhysicsQuaternion,
): BodyPhysicsVector3 {
  const tx = 2 * (rotation.y * vector.z - rotation.z * vector.y);
  const ty = 2 * (rotation.z * vector.x - rotation.x * vector.z);
  const tz = 2 * (rotation.x * vector.y - rotation.y * vector.x);
  return freezeVector({
    x: vector.x + rotation.w * tx + rotation.y * tz - rotation.z * ty,
    y: vector.y + rotation.w * ty + rotation.z * tx - rotation.x * tz,
    z: vector.z + rotation.w * tz + rotation.x * ty - rotation.y * tx,
  });
}

function rotateHalfExtents(
  halfExtents: BodyPhysicsVector3,
  rotation: BodyPhysicsQuaternion,
): BodyPhysicsVector3 {
  const xAxis = rotateVector({ x: halfExtents.x, y: 0, z: 0 }, rotation);
  const yAxis = rotateVector({ x: 0, y: halfExtents.y, z: 0 }, rotation);
  const zAxis = rotateVector({ x: 0, y: 0, z: halfExtents.z }, rotation);
  return freezeVector({
    x: Math.abs(xAxis.x) + Math.abs(yAxis.x) + Math.abs(zAxis.x),
    y: Math.abs(xAxis.y) + Math.abs(yAxis.y) + Math.abs(zAxis.y),
    z: Math.abs(xAxis.z) + Math.abs(yAxis.z) + Math.abs(zAxis.z),
  });
}

function cross(
  left: BodyPhysicsVector3,
  right: BodyPhysicsVector3,
): BodyPhysicsVector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function addMutable(
  left: BodyPhysicsVector3,
  right: BodyPhysicsVector3,
): BodyPhysicsVector3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

function mutableZeroVector(): BodyPhysicsVector3 {
  return { x: 0, y: 0, z: 0 };
}

function zeroVector(): BodyPhysicsVector3 {
  return Object.freeze({ x: 0, y: 0, z: 0 });
}

function freezeVector(value: BodyPhysicsVector3): BodyPhysicsVector3 {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
