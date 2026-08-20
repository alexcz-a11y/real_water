import type { HostSimulationAdapter, HostSimulationState } from "real-water";

export const REFERENCE_SIMULATION_FIXED_TICK_HZ = 60 as const;
export const REFERENCE_SIMULATION_SEED = 0 as const;

export interface ReferenceHostSimulationController extends HostSimulationAdapter {
  start(timestamp: number): HostSimulationState;
  beforePresent(timestamp: number): HostSimulationState;
}

export function createReferenceHostSimulationController(): ReferenceHostSimulationController {
  let epoch: number | undefined;
  let tick = 0;

  return Object.freeze({
    snapshot: () => freezeState(tick),
    start(timestamp: number): HostSimulationState {
      assertFiniteTimestamp(timestamp);
      if (epoch === undefined) {
        epoch = timestamp;
        tick = 0;
      }
      return freezeState(tick);
    },
    beforePresent(timestamp: number): HostSimulationState {
      assertFiniteTimestamp(timestamp);
      if (epoch === undefined) {
        throw new Error(
          "The Reference Host Simulation Controller has not started.",
        );
      }
      const targetTick = Math.floor(
        ((timestamp - epoch) * REFERENCE_SIMULATION_FIXED_TICK_HZ) / 1000,
      );
      if (targetTick > tick) {
        tick = targetTick;
      }
      return freezeState(tick);
    },
  });
}

function freezeState(tick: number): HostSimulationState {
  return Object.freeze({
    seed: REFERENCE_SIMULATION_SEED,
    tick,
    timeSeconds: tick / REFERENCE_SIMULATION_FIXED_TICK_HZ,
    paused: false,
    originX: 0,
    originZ: 0,
    simulationResetRevision: 0,
  });
}

function assertFiniteTimestamp(timestamp: number): void {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    throw new TypeError(
      "Reference Host Simulation timestamps must be finite RAF times.",
    );
  }
}
