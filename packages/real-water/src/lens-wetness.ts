import type { OpenWaterRuntimeSnapshot } from "./runtime.js";

export const LENS_WETNESS_DECAY_TICKS = 180;
export const LENS_WETNESS_MAX_VISUAL_OPACITY = 0.22;
export const LENS_WETNESS_MAX_DISTORTION_UV = 0.006;
export const LENS_WETNESS_MINIMUM_QA_VISIBILITY =
  1 - LENS_WETNESS_MAX_VISUAL_OPACITY;

const MAX_Q16 = 65_535;
const PATTERN_PHASE_SCALE = 1 / 0x1_0000_0000;

export interface LensWetnessTransitionInput {
  readonly transitionRevision: number;
  readonly lensWetnessImpulse: boolean;
}

export interface LensWetnessInspection {
  readonly active: boolean;
  readonly dryIdentity: boolean;
  readonly tick: number | undefined;
  readonly impulseTick: number | undefined;
  readonly impulseTransitionRevision: number | undefined;
  readonly impulseCount: number;
  readonly ageTicks: number;
  readonly remainingTicks: number;
  readonly intensityQ16: number;
  readonly visualOpacity: number;
  readonly distortionUv: number;
  readonly minimumQaVisibility: number;
  readonly patternPhase: number;
}

export interface LensWetnessFrameCandidate {
  readonly inspection: LensWetnessInspection;
}

/**
 * Package-private fixed-tick lens-wetness state tracker. Preview is
 * transactional: commit alone advances authoritative state, and only the most
 * recent candidate can be committed.
 */
export interface LensWetnessTracker {
  preview(
    snapshot: OpenWaterRuntimeSnapshot,
    transition: LensWetnessTransitionInput,
  ): LensWetnessFrameCandidate;
  commit(candidate: LensWetnessFrameCandidate): void;
  inspect(): LensWetnessInspection;
}

interface LensWetnessState {
  readonly lastSeed: number | undefined;
  readonly lastTick: number | undefined;
  readonly lastTimeSeconds: number | undefined;
  readonly lastSimulationResetRevision: number | undefined;
  readonly impulseTick: number | undefined;
  readonly impulseTransitionRevision: number | undefined;
  readonly handledImpulseTransitionRevision: number | undefined;
  readonly impulseCount: number;
  readonly intensityQ16: number;
  readonly patternPhase: number;
}

interface PendingLensWetnessImpulse {
  readonly seed: number;
  readonly simulationResetRevision: number;
  readonly transitionRevision: number;
  readonly tick: number;
  readonly patternPhase: number;
}

/**
 * Creates a bounded lens-wetness tracker. Wetness is event-driven by
 * `lensWetnessImpulse`; previews never advance its fixed-tick envelope, so
 * stepped and batched simulation updates resolve identically.
 */
export function createLensWetnessTracker(): LensWetnessTracker {
  let committedState: LensWetnessState = dryLensWetnessState();
  let pendingImpulse: PendingLensWetnessImpulse | undefined;
  let latestCandidate: LensWetnessFrameCandidate | undefined;
  const candidateStates = new WeakMap<
    LensWetnessFrameCandidate,
    LensWetnessState
  >();

  return Object.freeze({
    preview(
      snapshot: OpenWaterRuntimeSnapshot,
      transition: LensWetnessTransitionInput,
    ): LensWetnessFrameCandidate {
      const discontinuous = isLensWetnessDiscontinuous(
        committedState,
        snapshot,
      );
      let nextState: LensWetnessState;
      if (discontinuous) {
        pendingImpulse = undefined;
        nextState = clearedLensWetnessState(snapshot, transition);
      } else {
        let impulse = pendingImpulse;
        const introducesImpulse =
          transition.lensWetnessImpulse &&
          transition.transitionRevision !==
            committedState.handledImpulseTransitionRevision;
        if (introducesImpulse) {
          if (
            impulse === undefined ||
            impulse.seed !== snapshot.seed ||
            impulse.simulationResetRevision !==
              snapshot.simulationResetRevision ||
            impulse.transitionRevision !== transition.transitionRevision
          ) {
            impulse = Object.freeze({
              seed: snapshot.seed,
              simulationResetRevision: snapshot.simulationResetRevision,
              transitionRevision: transition.transitionRevision,
              tick: snapshot.tick,
              patternPhase: deterministicPatternPhase(
                snapshot.seed,
                snapshot.tick,
                transition.transitionRevision,
              ),
            });
          }
          pendingImpulse = impulse;
        } else {
          pendingImpulse = undefined;
          impulse = undefined;
        }
        nextState = advancedLensWetnessState(committedState, snapshot, impulse);
      }

      const candidate = Object.freeze({
        inspection: inspectLensWetnessState(nextState),
      });
      candidateStates.set(candidate, nextState);
      latestCandidate = candidate;
      return candidate;
    },
    commit(candidate: LensWetnessFrameCandidate): void {
      const nextState = candidateStates.get(candidate);
      if (candidate !== latestCandidate || nextState === undefined) {
        throw new Error("The lens-wetness frame candidate is stale.");
      }
      committedState = nextState;
      pendingImpulse = undefined;
      latestCandidate = undefined;
    },
    inspect(): LensWetnessInspection {
      return inspectLensWetnessState(committedState);
    },
  });
}

function dryLensWetnessState(): LensWetnessState {
  return Object.freeze({
    lastSeed: undefined,
    lastTick: undefined,
    lastTimeSeconds: undefined,
    lastSimulationResetRevision: undefined,
    impulseTick: undefined,
    impulseTransitionRevision: undefined,
    handledImpulseTransitionRevision: undefined,
    impulseCount: 0,
    intensityQ16: 0,
    patternPhase: 0,
  });
}

function isLensWetnessDiscontinuous(
  state: LensWetnessState,
  snapshot: OpenWaterRuntimeSnapshot,
): boolean {
  return (
    state.lastSeed !== undefined &&
    (snapshot.seed !== state.lastSeed ||
      snapshot.simulationResetRevision !== state.lastSimulationResetRevision ||
      snapshot.tick < (state.lastTick ?? snapshot.tick) ||
      snapshot.timeSeconds < (state.lastTimeSeconds ?? snapshot.timeSeconds))
  );
}

function clearedLensWetnessState(
  snapshot: OpenWaterRuntimeSnapshot,
  transition: LensWetnessTransitionInput,
): LensWetnessState {
  return Object.freeze({
    lastSeed: snapshot.seed,
    lastTick: snapshot.tick,
    lastTimeSeconds: snapshot.timeSeconds,
    lastSimulationResetRevision: snapshot.simulationResetRevision,
    impulseTick: undefined,
    impulseTransitionRevision: undefined,
    handledImpulseTransitionRevision: transition.lensWetnessImpulse
      ? transition.transitionRevision
      : undefined,
    impulseCount: 0,
    intensityQ16: 0,
    patternPhase: 0,
  });
}

function advancedLensWetnessState(
  committed: LensWetnessState,
  snapshot: OpenWaterRuntimeSnapshot,
  impulse: PendingLensWetnessImpulse | undefined,
): LensWetnessState {
  const impulseTick = impulse?.tick ?? committed.impulseTick;
  return Object.freeze({
    lastSeed: snapshot.seed,
    lastTick: snapshot.tick,
    lastTimeSeconds: snapshot.timeSeconds,
    lastSimulationResetRevision: snapshot.simulationResetRevision,
    impulseTick,
    impulseTransitionRevision:
      impulse?.transitionRevision ?? committed.impulseTransitionRevision,
    handledImpulseTransitionRevision:
      impulse?.transitionRevision ?? committed.handledImpulseTransitionRevision,
    impulseCount: committed.impulseCount + (impulse === undefined ? 0 : 1),
    intensityQ16: lensWetnessIntensityQ16(snapshot.tick, impulseTick),
    patternPhase: impulse?.patternPhase ?? committed.patternPhase,
  });
}

function lensWetnessIntensityQ16(
  tick: number,
  impulseTick: number | undefined,
): number {
  if (impulseTick === undefined || tick < impulseTick) {
    return 0;
  }
  const ageTicks = tick - impulseTick;
  const remainingTicks = Math.max(0, LENS_WETNESS_DECAY_TICKS - ageTicks);
  return Math.round((MAX_Q16 * remainingTicks) / LENS_WETNESS_DECAY_TICKS);
}

function inspectLensWetnessState(
  state: LensWetnessState,
): LensWetnessInspection {
  const ageTicks =
    state.impulseTick === undefined || state.lastTick === undefined
      ? 0
      : Math.max(0, state.lastTick - state.impulseTick);
  const remainingTicks =
    state.intensityQ16 === 0
      ? 0
      : Math.max(0, LENS_WETNESS_DECAY_TICKS - ageTicks);
  const strength = state.intensityQ16 / MAX_Q16;
  return Object.freeze({
    active: state.intensityQ16 > 0,
    dryIdentity: state.intensityQ16 === 0,
    tick: state.lastTick,
    impulseTick: state.impulseTick,
    impulseTransitionRevision: state.impulseTransitionRevision,
    impulseCount: state.impulseCount,
    ageTicks,
    remainingTicks,
    intensityQ16: state.intensityQ16,
    visualOpacity: strength * LENS_WETNESS_MAX_VISUAL_OPACITY,
    distortionUv: strength * LENS_WETNESS_MAX_DISTORTION_UV,
    minimumQaVisibility: 1 - strength * LENS_WETNESS_MAX_VISUAL_OPACITY,
    patternPhase: state.patternPhase,
  });
}

function deterministicPatternPhase(
  seed: number,
  tick: number,
  transitionRevision: number,
): number {
  let value = seed >>> 0;
  value = Math.imul(value ^ (tick >>> 0), 0x85eb_ca6b) >>> 0;
  value = Math.imul(value ^ (transitionRevision >>> 0), 0xc2b2_ae35) >>> 0;
  value ^= value >>> 16;
  return (value >>> 0) * PATTERN_PHASE_SCALE;
}
