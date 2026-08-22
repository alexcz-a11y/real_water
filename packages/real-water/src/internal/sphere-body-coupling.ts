import {
  readBodyAttachmentOptions,
  readBodyPhysicsBinding,
  readBodyPhysicsState,
  readBodyWaterLoad,
  type BodyAttachment,
  type BodyAttachmentOptions,
  type BodyAttachmentSnapshot,
  type BodyPhysicsBinding,
  type BodyPhysicsFixedStepRoute,
  type BodyWaterLoad,
} from "../body-physics.js";
import type { GameplayQueryBatch, GameplayQueryResults } from "../runtime.js";
import { MAX_ATTACHED_BODIES } from "../capabilities.js";
import { RealWaterRuntimeError } from "../errors.js";

const GRAVITY_METRES_PER_SECOND_SQUARED = 9.81;

export interface SphereBodyCoupling {
  attachBody(options: BodyAttachmentOptions): BodyAttachment;
  dispose(): void;
}

interface BodyQueryStorage {
  readonly positions: Float32Array;
  readonly results: GameplayQueryResults;
}

interface AttachmentRecord {
  attached: boolean;
  binding: BodyPhysicsBinding | undefined;
  lastWaterLoad: BodyWaterLoad | null;
  readonly slot: number;
}

export function createSphereBodyCoupling(
  assertActive: () => void,
  queryGameplay: (batch: GameplayQueryBatch) => GameplayQueryResults,
): SphereBodyCoupling {
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
      try {
        accepted = readBodyAttachmentOptions(options);
        readBodyPhysicsState(accepted.physics.snapshot());
      } catch (cause) {
        freeSlots.push(slot);
        throw cause;
      }
      const query = queryStorage[slot];
      if (query === undefined) {
        freeSlots.push(slot);
        throw new Error("The prepared Body query slot is unavailable.");
      }
      const record: AttachmentRecord = {
        attached: true,
        binding: undefined,
        lastWaterLoad: null,
        slot,
      };
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
          const state = readBodyPhysicsState(accepted.physics.snapshot());
          query.positions[0] = state.position.x;
          query.positions[1] = state.position.y;
          query.positions[2] = state.position.z;
          queryGameplay({
            count: 1,
            positions: query.positions,
            results: query.results,
          });
          const load = createSphereWaterLoad(
            state,
            accepted.shape.radius,
            query.results,
          );
          accepted.physics.applyWaterLoad(load);
          record.lastWaterLoad = load;
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
        freeSlots.push(slot);
        throw cause;
      }
      phase = "active";
      active.add(record);
      const attachmentId = (nextAttachmentId += 1);
      const attachment: BodyAttachment = Object.freeze({
        id: attachmentId,
        shape: accepted.shape,
        inspect(): BodyAttachmentSnapshot {
          return Object.freeze({
            attached: record.attached,
            lastWaterLoad: record.lastWaterLoad,
          });
        },
        detach(): void {
          if (!record.attached) {
            return;
          }
          record.attached = false;
          phase = "detached";
          active.delete(record);
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
    },
  });
}

function createBodyQueryStorage(): BodyQueryStorage {
  return {
    positions: new Float32Array(3),
    results: {
      heights: new Float32Array(1),
      normals: new Float32Array(3),
      velocities: new Float32Array(3),
      foam: new Float32Array(1),
      ticks: new Float64Array(1),
      controlRevisions: new Float64Array(1),
      snapshotAges: new Uint8Array(1),
    },
  };
}

function createSphereWaterLoad(
  state: ReturnType<typeof readBodyPhysicsState>,
  radius: number,
  results: GameplayQueryResults,
): BodyWaterLoad {
  const waterHeight = results.heights[0] ?? Number.NaN;
  const waterVelocityX = results.velocities[0] ?? Number.NaN;
  const waterVelocityY = results.velocities[1] ?? Number.NaN;
  const waterVelocityZ = results.velocities[2] ?? Number.NaN;
  const submergedDepth = waterHeight - (state.position.y - radius);
  const submergedFraction = clamp(submergedDepth / (radius * 2), 0, 1);
  const dampingWeight = clamp(submergedFraction * 2, 0, 1);
  const verticalDamping =
    2 * Math.sqrt(GRAVITY_METRES_PER_SECOND_SQUARED / radius);
  const horizontalDamping = 2 * dampingWeight;
  const load = {
    force: {
      x:
        state.mass *
        horizontalDamping *
        (waterVelocityX - state.linearVelocity.x),
      y:
        state.mass *
        (2 * GRAVITY_METRES_PER_SECOND_SQUARED * submergedFraction +
          verticalDamping *
            dampingWeight *
            (waterVelocityY - state.linearVelocity.y)),
      z:
        state.mass *
        horizontalDamping *
        (waterVelocityZ - state.linearVelocity.z),
    },
    torque: { x: 0, y: 0, z: 0 },
    queryTick: results.ticks[0] ?? Number.NaN,
    queryControlRevision: results.controlRevisions[0] ?? Number.NaN,
    querySnapshotAge: results.snapshotAges[0] ?? Number.NaN,
  };
  return readBodyWaterLoad(load as BodyWaterLoad);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
