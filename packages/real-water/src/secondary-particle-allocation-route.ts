import type { OpenWaterRuntimeSnapshot } from "./runtime.js";
import { createHostSnapshotContinuityTracker } from "./temporal-continuity.js";
import type { LocalInteractionRenderSnapshot } from "./internal/local-interaction.js";
import type { PerspectiveCamera } from "three/webgpu";
import type {
  SecondaryParticleCandidateBatch,
  SecondaryParticleConsumerBinding,
  SecondaryParticlePool,
  SecondaryParticlePoolFrame,
} from "./secondary-particle-pool.js";

/**
 * One prepared consumer at the unified secondary-particle allocation seam.
 * Consumers own candidate payloads and retained rendering data; the route
 * owns only transaction ordering across all registered consumers.
 */
export interface SecondaryParticleAllocationParticipant {
  readonly consumerId: string;
  /**
   * Returns a monotonic revision for candidate inputs that are not already
   * represented by tick, Host continuity, or the route's endpoint revision
   * vector. The revision must cover every other external value read by
   * `candidateBatch`; it identifies domain input, never container order.
   */
  candidateInputRevision(
    snapshot: OpenWaterRuntimeSnapshot,
    interaction: LocalInteractionRenderSnapshot,
  ): number;
  candidateBatch(
    snapshot: OpenWaterRuntimeSnapshot,
    interaction: LocalInteractionRenderSnapshot,
  ): SecondaryParticleCandidateBatch;
  applyRetained(binding: SecondaryParticleConsumerBinding): void;
}

export interface SecondaryParticleAllocationRouteInspection {
  readonly advanceCount: number;
  readonly submissionCount: number;
  readonly resolutionCount: number;
  readonly applicationCount: number;
  readonly lastTick: number | null;
}

export interface SecondaryParticleAllocationRoute {
  advance(
    snapshot: OpenWaterRuntimeSnapshot,
    interaction: LocalInteractionRenderSnapshot,
  ): SecondaryParticlePoolFrame;
  inspect(): SecondaryParticleAllocationRouteInspection;
}

interface PreparedParticipant {
  readonly participant: SecondaryParticleAllocationParticipant;
  readonly binding: SecondaryParticleConsumerBinding;
}

const FIXED_TICKS_PER_SECOND = 60;

/**
 * Tracks every camera value read by current secondary-particle candidate
 * writers. Exact component comparison avoids hash collisions, and all scratch
 * storage is prepared once so the hot-path check does not allocate.
 */
export function createSecondaryParticleCameraInputRevision(
  camera: PerspectiveCamera,
): () => number {
  const committedMatrixWorld = new Float64Array(16);
  const committedProjectionMatrix = new Float64Array(16);
  let hasCommittedCamera = false;
  let committedFov = 0;
  let committedCoordinateSystem = camera.coordinateSystem;
  let revision = 0;

  return (): number => {
    camera.updateWorldMatrix(true, false);
    const matrixWorld = camera.matrixWorld.elements;
    const projectionMatrix = camera.projectionMatrix.elements;
    let changed = !hasCommittedCamera;
    for (let index = 0; index < 16; index += 1) {
      changed ||=
        !Object.is(committedMatrixWorld[index], matrixWorld[index]) ||
        !Object.is(committedProjectionMatrix[index], projectionMatrix[index]);
    }
    changed ||=
      !Object.is(committedFov, camera.fov) ||
      committedCoordinateSystem !== camera.coordinateSystem;
    if (!changed) {
      return revision;
    }
    if (hasCommittedCamera) {
      revision = incrementSafeRevision(revision, "candidate input");
    }
    committedMatrixWorld.set(matrixWorld);
    committedProjectionMatrix.set(projectionMatrix);
    committedFov = camera.fov;
    committedCoordinateSystem = camera.coordinateSystem;
    hasCommittedCamera = true;
    return revision;
  };
}

/**
 * Prepares the single submit-all -> resolve-once -> apply-all transaction
 * point shared by pre- and post-TRAA consumers. The route deliberately knows
 * nothing about payload layout, motion, depth, or the consumer's render phase.
 */
export function createSecondaryParticleAllocationRoute(options: {
  readonly pool: SecondaryParticlePool;
  readonly participants: readonly SecondaryParticleAllocationParticipant[];
}): SecondaryParticleAllocationRoute {
  if (options.participants.length === 0) {
    throw new RangeError(
      "Secondary-particle allocation route requires at least one participant.",
    );
  }
  const consumerIds = new Set<string>();
  const prepared: PreparedParticipant[] = options.participants.map(
    (participant) => {
      if (
        participant.consumerId.length === 0 ||
        participant.consumerId !== participant.consumerId.trim() ||
        consumerIds.has(participant.consumerId)
      ) {
        throw new TypeError(
          "Secondary-particle allocation participants require unique canonical consumerIds.",
        );
      }
      consumerIds.add(participant.consumerId);
      return Object.freeze({
        participant,
        binding: options.pool.consumer(participant.consumerId),
      });
    },
  );
  Object.freeze(prepared);

  let advanceCount = 0;
  let submissionCount = 0;
  let resolutionCount = 0;
  let applicationCount = 0;
  let lastTick: number | null = null;
  let continuityRevision = 0;
  let allocationRevision = 0;
  let requiresRecoveryEpoch = false;
  let hasCommittedEndpointInputs = false;
  let committedInteractionRevision = 0;
  let committedControlRevision = 0;
  let committedSeaLevelMetres = 0;
  let committedOriginX = 0;
  let committedOriginZ = 0;
  const pendingParticipantRevisions = new Float64Array(prepared.length);
  const committedParticipantRevisions = new Float64Array(prepared.length);
  const continuity = createHostSnapshotContinuityTracker();
  let replayEndpoint: OpenWaterRuntimeSnapshot | null = null;
  let replayTick = 0;
  let replayTimeSeconds = 0;
  const replaySnapshot: OpenWaterRuntimeSnapshot = Object.freeze({
    get seed(): number {
      return requireReplayEndpoint(replayEndpoint).seed;
    },
    get tick(): number {
      return replayTick;
    },
    get timeSeconds(): number {
      return replayTimeSeconds;
    },
    get paused(): boolean {
      return requireReplayEndpoint(replayEndpoint).paused;
    },
    get originX(): number {
      return requireReplayEndpoint(replayEndpoint).originX;
    },
    get originZ(): number {
      return requireReplayEndpoint(replayEndpoint).originZ;
    },
    get seaLevelMetres(): number {
      return requireReplayEndpoint(replayEndpoint).seaLevelMetres;
    },
    get simulationResetRevision(): number {
      return requireReplayEndpoint(replayEndpoint).simulationResetRevision;
    },
    get artisticControls() {
      return requireReplayEndpoint(replayEndpoint).artisticControls;
    },
    get controlRevision(): number {
      return requireReplayEndpoint(replayEndpoint).controlRevision;
    },
    get originRevision(): number {
      return requireReplayEndpoint(replayEndpoint).originRevision;
    },
    get seaStateCutRevision(): number {
      return requireReplayEndpoint(replayEndpoint).seaStateCutRevision;
    },
    get cameraCutRevision(): number {
      return requireReplayEndpoint(replayEndpoint).cameraCutRevision;
    },
    get interactionAnchor() {
      return requireReplayEndpoint(replayEndpoint).interactionAnchor;
    },
    get interactionAnchorRevision(): number {
      return requireReplayEndpoint(replayEndpoint).interactionAnchorRevision;
    },
    get activeDisturbanceCount(): number {
      return requireReplayEndpoint(replayEndpoint).activeDisturbanceCount;
    },
    get activeBodyWakeCount(): number {
      return requireReplayEndpoint(replayEndpoint).activeBodyWakeCount;
    },
    get attachedBodyCount(): number {
      return requireReplayEndpoint(replayEndpoint).attachedBodyCount;
    },
  });
  const inspection: SecondaryParticleAllocationRouteInspection = Object.freeze({
    get advanceCount(): number {
      return advanceCount;
    },
    get submissionCount(): number {
      return submissionCount;
    },
    get resolutionCount(): number {
      return resolutionCount;
    },
    get applicationCount(): number {
      return applicationCount;
    },
    get lastTick(): number | null {
      return lastTick;
    },
  });

  return Object.freeze({
    advance(
      snapshot: OpenWaterRuntimeSnapshot,
      interaction: LocalInteractionRenderSnapshot,
    ): SecondaryParticlePoolFrame {
      advanceCount += 1;
      for (let index = 0; index < prepared.length; index += 1) {
        const revision = prepared[index]?.participant.candidateInputRevision(
          snapshot,
          interaction,
        );
        assertNonnegativeSafeRevision(revision, "candidate input");
        pendingParticipantRevisions[index] = revision;
      }
      const endpointInputsChanged =
        hasCommittedEndpointInputs &&
        (interaction.revision !== committedInteractionRevision ||
          snapshot.controlRevision !== committedControlRevision ||
          !Object.is(snapshot.seaLevelMetres, committedSeaLevelMetres) ||
          !Object.is(snapshot.originX, committedOriginX) ||
          !Object.is(snapshot.originZ, committedOriginZ) ||
          participantRevisionsDiffer(
            pendingParticipantRevisions,
            committedParticipantRevisions,
          ));
      const nextAllocationRevision = endpointInputsChanged
        ? incrementSafeRevision(allocationRevision, "allocation")
        : allocationRevision;
      const discontinuity = continuity.preview(snapshot) !== null;
      if (discontinuity || requiresRecoveryEpoch) {
        continuityRevision = incrementSafeRevision(
          continuityRevision,
          "continuity",
        );
      }

      let frame: SecondaryParticlePoolFrame | null = null;
      let openedTransaction = false;
      try {
        if (
          lastTick !== null &&
          snapshot.tick > lastTick + 1 &&
          !requiresRecoveryEpoch
        ) {
          replayEndpoint = snapshot;
          for (let tick = lastTick + 1; tick <= snapshot.tick; tick += 1) {
            replayTick = tick;
            replayTimeSeconds = Math.max(
              0,
              snapshot.timeSeconds -
                (snapshot.tick - tick) / FIXED_TICKS_PER_SECOND,
            );
            frame = transact(replaySnapshot, interaction);
          }
        } else {
          frame = transact(snapshot, interaction);
        }
      } catch (error: unknown) {
        requiresRecoveryEpoch ||= openedTransaction;
        throw error;
      }

      allocationRevision = nextAllocationRevision;
      committedInteractionRevision = interaction.revision;
      committedControlRevision = snapshot.controlRevision;
      committedSeaLevelMetres = snapshot.seaLevelMetres;
      committedOriginX = snapshot.originX;
      committedOriginZ = snapshot.originZ;
      committedParticipantRevisions.set(pendingParticipantRevisions);
      hasCommittedEndpointInputs = true;
      requiresRecoveryEpoch = false;
      lastTick = snapshot.tick;
      continuity.commit(snapshot);
      if (frame === null) {
        throw new Error(
          "Secondary-particle allocation route produced no frame.",
        );
      }
      return frame;

      function transact(
        transactionSnapshot: OpenWaterRuntimeSnapshot,
        transactionInteraction: LocalInteractionRenderSnapshot,
      ): SecondaryParticlePoolFrame {
        const transaction = options.pool.beginTick(
          transactionSnapshot.tick,
          continuityRevision,
          nextAllocationRevision,
        );
        if (transaction === "reuse-current-tick") {
          const current = options.pool.current();
          for (const { participant, binding } of prepared) {
            participant.applyRetained(binding);
            applicationCount += 1;
          }
          return current;
        }
        openedTransaction = true;
        for (const { participant, binding } of prepared) {
          options.pool.submit(
            binding,
            participant.candidateBatch(
              transactionSnapshot,
              transactionInteraction,
            ),
          );
          submissionCount += 1;
        }
        const resolved = options.pool.resolve();
        resolutionCount += 1;
        for (const { participant, binding } of prepared) {
          participant.applyRetained(binding);
          applicationCount += 1;
        }
        return resolved;
      }
    },
    inspect(): SecondaryParticleAllocationRouteInspection {
      return inspection;
    },
  });
}

function participantRevisionsDiffer(
  pending: Float64Array,
  committed: Float64Array,
): boolean {
  for (let index = 0; index < pending.length; index += 1) {
    if (pending[index] !== committed[index]) {
      return true;
    }
  }
  return false;
}

function incrementSafeRevision(revision: number, name: string): number {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError(
      `${name} revision must be a non-negative safe integer.`,
    );
  }
  if (revision === Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${name} revision exhausted the safe integer range.`);
  }
  return revision + 1;
}

function assertNonnegativeSafeRevision(
  revision: number | undefined,
  name: string,
): asserts revision is number {
  if (!Number.isSafeInteger(revision) || (revision ?? -1) < 0) {
    throw new RangeError(
      `${name} revision must be a non-negative safe integer.`,
    );
  }
}

function requireReplayEndpoint(
  endpoint: OpenWaterRuntimeSnapshot | null,
): OpenWaterRuntimeSnapshot {
  if (endpoint === null) {
    throw new Error("Secondary-particle replay snapshot has no endpoint.");
  }
  return endpoint;
}
