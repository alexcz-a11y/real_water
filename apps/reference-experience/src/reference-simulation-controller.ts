import {
  REFERENCE_SHOWCASE_SEED,
  type HostSimulationAdapter,
  type HostSimulationState,
} from "real-water";

export const REFERENCE_SIMULATION_FIXED_TICK_HZ = 60 as const;
export const REFERENCE_SIMULATION_SEED = REFERENCE_SHOWCASE_SEED;
export const REFERENCE_SIMULATION_MAX_CATCH_UP_TICKS = 8 as const;

export interface ReferenceHostSimulationController extends HostSimulationAdapter {
  start(timestamp: number): HostSimulationState;
  beforePresent(timestamp: number): HostSimulationState;
  interpolationAlpha(timestamp: number): number;
  setPaused(paused: boolean): HostSimulationState;
  reset(): HostSimulationState;
}

export interface ReferenceHostSimulationControllerOptions {
  readonly integrateFixedStep?: () => void;
  readonly afterFixedStep?: (state: HostSimulationState) => void;
  readonly reset?: () => void;
}

export function createReferenceHostSimulationController(
  options: ReferenceHostSimulationControllerOptions = {},
): ReferenceHostSimulationController {
  let epoch: number | undefined;
  let lastTimestamp: number | undefined;
  let tick = 0;
  let paused = false;
  let simulationResetRevision = 0;
  let resetPendingRebase = false;
  let resumePendingRebase = false;

  return Object.freeze({
    snapshot: () => freezeState(tick, paused, simulationResetRevision),
    start(timestamp: number): HostSimulationState {
      assertFiniteTimestamp(timestamp);
      if (epoch === undefined) {
        epoch = timestamp;
        lastTimestamp = timestamp;
        tick = 0;
      }
      return freezeState(tick, paused, simulationResetRevision);
    },
    beforePresent(timestamp: number): HostSimulationState {
      assertFiniteTimestamp(timestamp);
      if (epoch === undefined || lastTimestamp === undefined) {
        throw new Error(
          "The Reference Host Simulation Controller has not started.",
        );
      }
      if (resetPendingRebase) {
        epoch = timestamp;
        lastTimestamp = timestamp;
        resetPendingRebase = false;
        return freezeState(tick, paused, simulationResetRevision);
      }
      if (timestamp < lastTimestamp) {
        return freezeState(tick, paused, simulationResetRevision);
      }
      if (paused || resumePendingRebase) {
        epoch += timestamp - lastTimestamp;
        lastTimestamp = timestamp;
        if (resumePendingRebase) {
          resumePendingRebase = false;
        }
        return freezeState(tick, paused, simulationResetRevision);
      }
      const unboundedTargetTick = Math.floor(
        ((timestamp - epoch) * REFERENCE_SIMULATION_FIXED_TICK_HZ) / 1000,
      );
      const targetTick = Math.min(
        unboundedTargetTick,
        tick + REFERENCE_SIMULATION_MAX_CATCH_UP_TICKS,
      );
      const droppedExcessTime = targetTick !== unboundedTargetTick;
      while (targetTick > tick) {
        options.integrateFixedStep?.();
        tick += 1;
        options.afterFixedStep?.(
          freezeState(tick, paused, simulationResetRevision),
        );
      }
      if (droppedExcessTime) {
        // #11 bounds long Host gaps instead of retaining an unbounded backlog.
        // Rebase to the completed tick so the next frame resumes continuously.
        epoch = timestamp - (tick * 1000) / REFERENCE_SIMULATION_FIXED_TICK_HZ;
      }
      lastTimestamp = timestamp;
      return freezeState(tick, paused, simulationResetRevision);
    },
    interpolationAlpha(timestamp: number): number {
      assertFiniteTimestamp(timestamp);
      if (epoch === undefined || lastTimestamp === undefined) {
        throw new Error(
          "The Reference Host Simulation Controller has not started.",
        );
      }
      if (resetPendingRebase) {
        return 0;
      }
      const interpolationTimestamp =
        paused || resumePendingRebase ? lastTimestamp : timestamp;
      const continuousTick =
        ((interpolationTimestamp - epoch) *
          REFERENCE_SIMULATION_FIXED_TICK_HZ) /
        1000;
      return Math.min(1, Math.max(0, continuousTick - tick));
    },
    setPaused(nextPaused: boolean): HostSimulationState {
      assertBooleanPauseState(nextPaused);
      if (nextPaused === paused) {
        return freezeState(tick, paused, simulationResetRevision);
      }
      paused = nextPaused;
      if (!paused && epoch !== undefined && !resetPendingRebase) {
        resumePendingRebase = true;
      }
      return freezeState(tick, paused, simulationResetRevision);
    },
    reset(): HostSimulationState {
      tick = 0;
      simulationResetRevision += 1;
      resetPendingRebase = epoch !== undefined;
      resumePendingRebase = false;
      const state = freezeState(tick, paused, simulationResetRevision);
      options.reset?.();
      return state;
    },
  });
}

function freezeState(
  tick: number,
  paused: boolean,
  simulationResetRevision: number,
): HostSimulationState {
  return Object.freeze({
    seed: REFERENCE_SIMULATION_SEED,
    tick,
    timeSeconds: tick / REFERENCE_SIMULATION_FIXED_TICK_HZ,
    paused,
    originX: 0,
    originZ: 0,
    seaLevelMetres: 0,
    simulationResetRevision,
  });
}

function assertFiniteTimestamp(timestamp: number): void {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    throw new TypeError(
      "Reference Host Simulation timestamps must be finite RAF times.",
    );
  }
}

function assertBooleanPauseState(paused: boolean): void {
  if (typeof paused !== "boolean") {
    throw new TypeError(
      "Reference Host Simulation pause state must be boolean.",
    );
  }
}
