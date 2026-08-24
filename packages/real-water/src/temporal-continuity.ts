import type { OpenWaterRuntimeSnapshot } from "./runtime.js";

export type HostSnapshotDiscontinuityReason =
  "simulation-reset" | "camera-cut" | "origin-shift" | "sea-state-cut";

/**
 * Package-private, allocation-free preview/commit tracker shared by temporal
 * presentation history and secondary-particle allocation continuity.
 */
export interface HostSnapshotContinuityTracker {
  preview(
    snapshot: OpenWaterRuntimeSnapshot,
  ): HostSnapshotDiscontinuityReason | null;
  commit(snapshot: OpenWaterRuntimeSnapshot): void;
}

export function createHostSnapshotContinuityTracker(): HostSnapshotContinuityTracker {
  let hasSnapshot = false;
  let seed = 0;
  let tick = 0;
  let timeSeconds = 0;
  let simulationResetRevision = 0;
  let originRevision = 0;
  let cameraCutRevision = 0;
  let seaStateCutRevision = 0;

  return Object.freeze({
    preview(
      snapshot: OpenWaterRuntimeSnapshot,
    ): HostSnapshotDiscontinuityReason | null {
      if (!hasSnapshot) {
        return null;
      }
      if (
        snapshot.simulationResetRevision !== simulationResetRevision ||
        snapshot.seed !== seed ||
        snapshot.tick < tick ||
        snapshot.timeSeconds < timeSeconds
      ) {
        return "simulation-reset";
      }
      if (snapshot.cameraCutRevision !== cameraCutRevision) {
        return "camera-cut";
      }
      if (snapshot.originRevision !== originRevision) {
        return "origin-shift";
      }
      if (snapshot.seaStateCutRevision !== seaStateCutRevision) {
        return "sea-state-cut";
      }
      return null;
    },
    commit(snapshot: OpenWaterRuntimeSnapshot): void {
      hasSnapshot = true;
      seed = snapshot.seed;
      tick = snapshot.tick;
      timeSeconds = snapshot.timeSeconds;
      simulationResetRevision = snapshot.simulationResetRevision;
      originRevision = snapshot.originRevision;
      cameraCutRevision = snapshot.cameraCutRevision;
      seaStateCutRevision = snapshot.seaStateCutRevision;
    },
  });
}
