import { describe, expect, it } from "vitest";
import {
  createLensWetnessTracker,
  LENS_WETNESS_DECAY_TICKS,
  LENS_WETNESS_MAX_DISTORTION_UV,
  LENS_WETNESS_MAX_VISUAL_OPACITY,
  LENS_WETNESS_MINIMUM_QA_VISIBILITY,
  type LensWetnessTracker,
  type LensWetnessTransitionInput,
} from "../src/lens-wetness.js";
import type { OpenWaterRuntimeSnapshot } from "../src/runtime.js";
import { createWaterPreset } from "../src/water-preset.js";

const controls = createWaterPreset("swell").artisticControls;

function snapshot(
  tick: number,
  overrides: Partial<OpenWaterRuntimeSnapshot> = {},
): OpenWaterRuntimeSnapshot {
  return {
    seed: 7,
    tick,
    timeSeconds: tick / 60,
    paused: false,
    originX: 0,
    originZ: 0,
    seaLevelMetres: 0,
    simulationResetRevision: 0,
    artisticControls: controls,
    controlRevision: 0,
    originRevision: 0,
    seaStateCutRevision: 0,
    cameraCutRevision: 0,
    interactionAnchor: { x: 0, z: 0 },
    interactionAnchorRevision: 0,
    activeDisturbanceCount: 0,
    activeBodyWakeCount: 0,
    attachedBodyCount: 0,
    ...overrides,
  };
}

function transition(
  transitionRevision: number,
  lensWetnessImpulse: boolean,
): LensWetnessTransitionInput {
  return { transitionRevision, lensWetnessImpulse };
}

function commitFrame(
  tracker: LensWetnessTracker,
  frame: OpenWaterRuntimeSnapshot,
  transitionInput: LensWetnessTransitionInput,
) {
  const candidate = tracker.preview(frame, transitionInput);
  tracker.commit(candidate);
  return candidate;
}

describe("lens-wetness tracker", () => {
  it("starts as a strict dry identity", () => {
    const tracker = createLensWetnessTracker();

    expect(tracker.inspect()).toEqual({
      active: false,
      dryIdentity: true,
      tick: undefined,
      impulseTick: undefined,
      impulseTransitionRevision: undefined,
      impulseCount: 0,
      ageTicks: 0,
      remainingTicks: 0,
      intensityQ16: 0,
      visualOpacity: 0,
      distortionUv: 0,
      minimumQaVisibility: 1,
      patternPhase: 0,
    });
  });

  it("decays from fixed ticks identically for stepped and missing-tick updates", () => {
    const stepped = createLensWetnessTracker();
    const batched = createLensWetnessTracker();
    commitFrame(stepped, snapshot(12), transition(3, true));
    commitFrame(batched, snapshot(12), transition(3, true));

    for (let tick = 13; tick <= 91; tick += 1) {
      commitFrame(stepped, snapshot(tick), transition(3, false));
    }
    commitFrame(batched, snapshot(91), transition(3, false));

    expect(stepped.inspect()).toEqual(batched.inspect());
    expect(stepped.inspect()).toMatchObject({
      tick: 91,
      impulseTick: 12,
      impulseTransitionRevision: 3,
      impulseCount: 1,
      ageTicks: 79,
      remainingTicks: LENS_WETNESS_DECAY_TICKS - 79,
    });
  });

  it("treats repeated synchronization of the same transition tick as idempotent", () => {
    const tracker = createLensWetnessTracker();
    const frame = snapshot(40);
    const emergence = transition(8, true);

    commitFrame(tracker, frame, emergence);
    const first = tracker.inspect();
    commitFrame(tracker, frame, emergence);
    commitFrame(tracker, frame, emergence);

    expect(tracker.inspect()).toEqual(first);
    expect(tracker.inspect().impulseCount).toBe(1);
  });

  it("does not consume a failed preview and reuses its impulse across a later-tick retry", () => {
    const tracker = createLensWetnessTracker();
    commitFrame(tracker, snapshot(39), transition(7, false));

    const failed = tracker.preview(snapshot(40), transition(8, true));
    expect(failed.inspection).toMatchObject({
      tick: 40,
      impulseTick: 40,
      impulseTransitionRevision: 8,
      impulseCount: 1,
      ageTicks: 0,
    });
    expect(tracker.inspect()).toMatchObject({
      tick: 39,
      dryIdentity: true,
      impulseCount: 0,
    });

    const retry = tracker.preview(snapshot(41), transition(8, true));
    expect(retry.inspection).toMatchObject({
      tick: 41,
      impulseTick: 40,
      impulseTransitionRevision: 8,
      impulseCount: 1,
      ageTicks: 1,
      remainingTicks: LENS_WETNESS_DECAY_TICKS - 1,
      patternPhase: failed.inspection.patternPhase,
    });
    expect(() => tracker.commit(failed)).toThrow(/stale/i);
    tracker.commit(retry);
    expect(tracker.inspect()).toEqual(retry.inspection);
  });

  it("bounds visibility and distortion, then reaches exact zero at a finite tick", () => {
    const tracker = createLensWetnessTracker();
    commitFrame(tracker, snapshot(100), transition(1, true));

    expect(tracker.inspect().visualOpacity).toBe(
      LENS_WETNESS_MAX_VISUAL_OPACITY,
    );
    expect(tracker.inspect().distortionUv).toBe(LENS_WETNESS_MAX_DISTORTION_UV);
    expect(tracker.inspect().minimumQaVisibility).toBe(
      LENS_WETNESS_MINIMUM_QA_VISIBILITY,
    );

    commitFrame(
      tracker,
      snapshot(100 + LENS_WETNESS_DECAY_TICKS - 1),
      transition(1, false),
    );
    expect(tracker.inspect().intensityQ16).toBeGreaterThan(0);

    commitFrame(
      tracker,
      snapshot(100 + LENS_WETNESS_DECAY_TICKS),
      transition(1, false),
    );
    expect(tracker.inspect()).toMatchObject({
      active: false,
      dryIdentity: true,
      remainingTicks: 0,
      intensityQ16: 0,
      visualOpacity: 0,
      distortionUv: 0,
      minimumQaVisibility: 1,
    });
  });

  it("clears and suppresses stale impulses on reseed, reset, and rewind", () => {
    const tracker = createLensWetnessTracker();
    commitFrame(tracker, snapshot(50), transition(4, true));
    expect(tracker.inspect().active).toBe(true);

    commitFrame(tracker, snapshot(51, { seed: 99 }), transition(5, true));
    expect(tracker.inspect()).toMatchObject({
      active: false,
      dryIdentity: true,
      impulseCount: 0,
    });
    commitFrame(tracker, snapshot(51, { seed: 99 }), transition(5, true));
    expect(tracker.inspect().active).toBe(false);

    commitFrame(tracker, snapshot(52, { seed: 99 }), transition(6, true));
    expect(tracker.inspect().active).toBe(true);
    commitFrame(
      tracker,
      snapshot(52, { seed: 99, simulationResetRevision: 1 }),
      transition(6, false),
    );
    expect(tracker.inspect().active).toBe(false);

    commitFrame(
      tracker,
      snapshot(60, { seed: 99, simulationResetRevision: 1 }),
      transition(7, true),
    );
    expect(tracker.inspect().active).toBe(true);
    commitFrame(
      tracker,
      snapshot(59, { seed: 99, simulationResetRevision: 1 }),
      transition(7, false),
    );
    expect(tracker.inspect()).toMatchObject({
      active: false,
      dryIdentity: true,
      impulseCount: 0,
    });
  });
});
