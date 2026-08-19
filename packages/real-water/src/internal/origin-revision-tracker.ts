import type { HostSimulationState } from "../runtime.js";

export interface OriginRevisionTracker {
  observe(state: HostSimulationState): number;
}

export function createOriginRevisionTracker(
  baseline: HostSimulationState,
): OriginRevisionTracker {
  let originX = baseline.originX;
  let originZ = baseline.originZ;
  let originRevision = 0;

  return Object.freeze({
    observe(state: HostSimulationState): number {
      if (state.originX !== originX || state.originZ !== originZ) {
        originRevision += 1;
        originX = state.originX;
        originZ = state.originZ;
      }
      return originRevision;
    },
  });
}
