import type { OpenWaterRuntimeSnapshot } from "./runtime.js";
import { createHostSnapshotContinuityTracker } from "./temporal-continuity.js";
import type { LocalInteractionRenderSnapshot } from "./internal/local-interaction.js";
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
  const continuity = createHostSnapshotContinuityTracker();
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
      if (continuity.preview(snapshot) !== null) {
        continuityRevision += 1;
      }
      const transaction = options.pool.beginTick(
        snapshot.tick,
        continuityRevision,
      );
      let frame: SecondaryParticlePoolFrame;
      if (transaction === "accepting-candidates") {
        for (const { participant, binding } of prepared) {
          options.pool.submit(
            binding,
            participant.candidateBatch(snapshot, interaction),
          );
          submissionCount += 1;
        }
        frame = options.pool.resolve();
        resolutionCount += 1;
      } else {
        frame = options.pool.current();
      }
      for (const { participant, binding } of prepared) {
        participant.applyRetained(binding);
        applicationCount += 1;
      }
      advanceCount += 1;
      lastTick = snapshot.tick;
      continuity.commit(snapshot);
      return frame;
    },
    inspect(): SecondaryParticleAllocationRouteInspection {
      return inspection;
    },
  });
}
