import type { HostSimulationAdapter, HostSimulationState } from "real-water";
import { QA_FRAME_FIXED_TICK_HZ, isQaFrameSeed } from "./qa-frame-contract.js";

export interface QaHostSimulationController extends HostSimulationAdapter {
  reset(seed: number): HostSimulationState;
  advance(ticks: number): HostSimulationState;
}

export function createQaHostSimulationController(): QaHostSimulationController {
  let state = freezeState(0, 0);
  return Object.freeze({
    snapshot: () => state,
    reset(seed: number): HostSimulationState {
      if (!isQaFrameSeed(seed)) {
        throw new RangeError(
          "QA simulation seeds must be unsigned 32-bit integers.",
        );
      }
      state = freezeState(seed, 0);
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
      state = freezeState(state.seed, state.tick + ticks);
      return state;
    },
  });
}

function freezeState(seed: number, tick: number): HostSimulationState {
  return Object.freeze({
    seed,
    tick,
    timeSeconds: tick / QA_FRAME_FIXED_TICK_HZ,
    paused: false,
  });
}
