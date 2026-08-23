import type { HostSimulationAdapter, HostSimulationState } from "real-water";
import { QA_FRAME_FIXED_TICK_HZ, isQaFrameSeed } from "./qa-frame-contract.js";

export interface QaHostSimulationController extends HostSimulationAdapter {
  reset(seed: number): HostSimulationState;
  advance(ticks: number): HostSimulationState;
  setOrigin(originX: number, originZ: number): HostSimulationState;
}

export interface QaHostSimulationControllerOptions {
  readonly integrateFixedStep?: () => void;
  readonly reset?: () => void;
}

export function createQaHostSimulationController(
  options: QaHostSimulationControllerOptions = {},
): QaHostSimulationController {
  let simulationResetRevision = 0;
  let state = freezeState(0, 0, 0, 0, simulationResetRevision);
  return Object.freeze({
    snapshot: () => state,
    reset(seed: number): HostSimulationState {
      if (!isQaFrameSeed(seed)) {
        throw new RangeError(
          "QA simulation seeds must be unsigned 32-bit integers.",
        );
      }
      simulationResetRevision += 1;
      state = freezeState(seed, 0, 0, 0, simulationResetRevision);
      options.reset?.();
      return state;
    },
    advance(ticks: number): HostSimulationState {
      if (
        !Number.isSafeInteger(ticks) ||
        ticks < 0 ||
        !Number.isSafeInteger(state.tick + ticks)
      ) {
        throw new RangeError(
          "QA simulation tick advances must be non-negative safe integers.",
        );
      }
      for (let advanced = 0; advanced < ticks; advanced += 1) {
        options.integrateFixedStep?.();
        state = freezeState(
          state.seed,
          state.tick + 1,
          state.originX,
          state.originZ,
          simulationResetRevision,
        );
      }
      return state;
    },
    setOrigin(originX: number, originZ: number): HostSimulationState {
      if (!Number.isFinite(originX) || !Number.isFinite(originZ)) {
        throw new RangeError("QA origin must be finite.");
      }
      state = freezeState(
        state.seed,
        state.tick,
        originX,
        originZ,
        simulationResetRevision,
      );
      return state;
    },
  });
}

function freezeState(
  seed: number,
  tick: number,
  originX: number,
  originZ: number,
  simulationResetRevision: number,
): HostSimulationState {
  return Object.freeze({
    seed,
    tick,
    timeSeconds: tick / QA_FRAME_FIXED_TICK_HZ,
    paused: false,
    originX,
    originZ,
    simulationResetRevision,
  });
}
