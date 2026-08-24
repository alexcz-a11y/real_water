import {
  PerspectiveCamera,
  WebGLCoordinateSystem,
  WebGPUCoordinateSystem,
} from "three/webgpu";
import { describe, expect, it } from "vitest";
import type { OpenWaterRuntimeSnapshot } from "../src/runtime.js";
import {
  createSecondaryParticleAllocationRoute,
  createSecondaryParticleCameraInputRevision,
  type SecondaryParticleAllocationParticipant,
} from "../src/secondary-particle-allocation-route.js";
import {
  MAX_SECONDARY_PARTICLES,
  SECONDARY_PARTICLE_CONTRIBUTION_SCREEN_AREA_DIVISOR,
  SECONDARY_PARTICLE_MINIMUM_RESIDENCE_TICKS,
  SECONDARY_PARTICLE_REENTRY_COOLDOWN_TICKS,
  SECONDARY_PARTICLE_RETAINED_Q16_BONUS,
  createSecondaryParticlePool,
  type SecondaryParticleCandidateBatch,
  type SecondaryParticleConsumerBinding,
} from "../src/secondary-particle-pool.js";
import { createWaterPreset } from "../src/water-preset.js";

const CONSUMER_ID = "route-test";
type TestInteraction = Parameters<
  SecondaryParticleAllocationParticipant["candidateBatch"]
>[1];

interface CandidateObservation {
  readonly tick: number;
  readonly timeSeconds: number;
  readonly controlRevision: number;
  readonly seaLevelMetres: number;
  readonly cameraCutRevision: number;
  readonly interaction: TestInteraction;
}

function snapshot(
  tick: number,
  overrides: Partial<OpenWaterRuntimeSnapshot> = {},
): OpenWaterRuntimeSnapshot {
  return Object.freeze({
    seed: 17,
    tick,
    timeSeconds: tick / 60,
    paused: false,
    originX: 0,
    originZ: 0,
    seaLevelMetres: 0,
    simulationResetRevision: 0,
    artisticControls: createWaterPreset("swell").artisticControls,
    controlRevision: 0,
    originRevision: 0,
    seaStateCutRevision: 0,
    cameraCutRevision: 0,
    interactionAnchor: Object.freeze({ x: 0, z: 0 }),
    interactionAnchorRevision: 0,
    activeDisturbanceCount: 0,
    activeBodyWakeCount: 0,
    attachedBodyCount: 0,
    ...overrides,
  });
}

function interaction(revision = 0): TestInteraction {
  return Object.freeze({
    revision,
    anchorX: 0,
    anchorZ: 0,
    impacts: Object.freeze([]),
  });
}

function createHarness(options: {
  readonly observations?: CandidateObservation[];
  readonly candidateInputRevision?: () => number;
}) {
  const pool = createSecondaryParticlePool({
    capacity: MAX_SECONDARY_PARTICLES,
    contribution: {
      projectedAreaReference: "output-drawing-buffer",
      referenceWidth: 320,
      referenceHeight: 180,
      screenAreaDivisor: SECONDARY_PARTICLE_CONTRIBUTION_SCREEN_AREA_DIVISOR,
      quantization: "q16-unorm-round-nearest",
    },
    hysteresis: {
      mode: "incumbent-bonus-residence-cooldown",
      retainedContributionBonusQ16: SECONDARY_PARTICLE_RETAINED_Q16_BONUS,
      minimumResidenceTicks: SECONDARY_PARTICLE_MINIMUM_RESIDENCE_TICKS,
      reentryCooldownTicks: SECONDARY_PARTICLE_REENTRY_COOLDOWN_TICKS,
    },
    consumers: [
      {
        consumerId: CONSUMER_ID,
        contributionReference: {
          width: 320,
          height: 180,
          space: "output-drawing-buffer",
        },
        maximumRequestCount: 3,
        minimumRetainedSlots: 1,
        softRequestCeiling: 3,
        pressureReentryPolicy: "after-shared-cooldown",
      },
    ],
  });
  const binding = pool.consumer(CONSUMER_ID);
  const stableKeyHigh = Uint32Array.of(1, 1, 1);
  const stableKeyLow = Uint32Array.of(1, 2, 3);
  const contributionsQ16 = new Uint16Array(3);
  const payloadHandles = Uint32Array.of(0, 1, 2);
  const batch: SecondaryParticleCandidateBatch = Object.freeze({
    count: 3,
    stableKeyHigh,
    stableKeyLow,
    contributionsQ16,
    payloadHandles,
  });
  const participant: SecondaryParticleAllocationParticipant = Object.freeze({
    consumerId: CONSUMER_ID,
    candidateInputRevision() {
      return options.candidateInputRevision?.() ?? 0;
    },
    candidateBatch(state: OpenWaterRuntimeSnapshot, local: TestInteraction) {
      options.observations?.push({
        tick: state.tick,
        timeSeconds: state.timeSeconds,
        controlRevision: state.controlRevision,
        seaLevelMetres: state.seaLevelMetres,
        cameraCutRevision: state.cameraCutRevision,
        interaction: local,
      });
      contributionsQ16[0] = 20_000 + state.tick;
      contributionsQ16[1] = 30_000 + state.tick;
      contributionsQ16[2] = 40_000 + state.tick;
      return batch;
    },
    applyRetained() {},
  });
  return {
    binding,
    route: createSecondaryParticleAllocationRoute({
      pool,
      participants: [participant],
    }),
  };
}

function retainedState(binding: SecondaryParticleConsumerBinding) {
  const count = binding.retained.count[0] ?? 0;
  return {
    keysHigh: Array.from(binding.retained.stableKeyHigh.slice(0, count)),
    keysLow: Array.from(binding.retained.stableKeyLow.slice(0, count)),
    contributions: Array.from(
      binding.retained.contributionsQ16.slice(0, count),
    ),
    slots: Array.from(binding.retained.poolSlots.slice(0, count)),
    receipt: binding.receipt,
  };
}

describe("secondary-particle allocation route deterministic replay", () => {
  it("tracks exact candidate-visible camera state without hashing", () => {
    const view = new PerspectiveCamera(70, 16 / 9, 0.1, 200);
    view.updateProjectionMatrix();
    const revision = createSecondaryParticleCameraInputRevision(view);

    expect(revision()).toBe(0);
    expect(revision()).toBe(0);
    view.position.x = 1;
    expect(revision()).toBe(1);
    view.position.x = 0;
    expect(revision()).toBe(2);
    view.projectionMatrix.elements[0] =
      (view.projectionMatrix.elements[0] ?? 0) + 0.25;
    expect(revision()).toBe(3);
    view.fov = 71;
    expect(revision()).toBe(4);
    view.coordinateSystem =
      view.coordinateSystem === WebGLCoordinateSystem
        ? WebGPUCoordinateSystem
        : WebGLCoordinateSystem;
    expect(revision()).toBe(5);
  });

  it("replays every missing tick with endpoint inputs before resolving the endpoint", () => {
    const endpointInteraction = interaction(9);
    const endpointOverrides = Object.freeze({
      controlRevision: 1,
      seaLevelMetres: 2,
      cameraCutRevision: 1,
    });
    const jumpObservations: CandidateObservation[] = [];
    const jump = createHarness({ observations: jumpObservations });
    jump.route.advance(snapshot(0), endpointInteraction);
    const jumpFrame = jump.route.advance(
      snapshot(5, endpointOverrides),
      endpointInteraction,
    );

    const stepped = createHarness({});
    stepped.route.advance(snapshot(0), endpointInteraction);
    let steppedFrame = stepped.route.advance(
      snapshot(1, endpointOverrides),
      endpointInteraction,
    );
    for (let tick = 2; tick <= 5; tick += 1) {
      steppedFrame = stepped.route.advance(
        snapshot(tick, endpointOverrides),
        endpointInteraction,
      );
    }

    expect(retainedState(jump.binding)).toEqual(retainedState(stepped.binding));
    expect(jumpFrame).toEqual(steppedFrame);
    expect(jumpObservations.map(({ tick }) => tick)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    for (const observation of jumpObservations.slice(1)) {
      expect(observation.timeSeconds).toBeCloseTo(observation.tick / 60, 12);
      expect(observation.controlRevision).toBe(1);
      expect(observation.seaLevelMetres).toBe(2);
      expect(observation.cameraCutRevision).toBe(1);
      expect(observation.interaction).toBe(endpointInteraction);
    }
    expect(jump.route.inspect()).toEqual({
      advanceCount: 2,
      submissionCount: 6,
      resolutionCount: 6,
      applicationCount: 6,
      lastTick: 5,
    });
  });

  it("reuses only identical same-tick inputs and recomputes every changed endpoint", () => {
    const view = new PerspectiveCamera(70, 16 / 9, 0.1, 200);
    view.updateProjectionMatrix();
    const cameraRevision = createSecondaryParticleCameraInputRevision(view);
    const harness = createHarness({ candidateInputRevision: cameraRevision });
    const base = snapshot(4);
    const initialInteraction = interaction(0);
    const first = harness.route.advance(base, initialInteraction);

    expect(harness.route.advance(base, initialInteraction)).toBe(first);
    harness.route.advance(base, interaction(1));
    harness.route.advance(snapshot(4, { controlRevision: 1 }), interaction(1));
    harness.route.advance(
      snapshot(4, { controlRevision: 1, seaLevelMetres: 2 }),
      interaction(1),
    );
    harness.route.advance(
      snapshot(4, { controlRevision: 1, seaLevelMetres: 0 }),
      interaction(1),
    );
    view.position.x = 3;
    harness.route.advance(
      snapshot(4, { controlRevision: 1, seaLevelMetres: 0 }),
      interaction(1),
    );

    expect(harness.route.inspect()).toEqual({
      advanceCount: 7,
      submissionCount: 6,
      resolutionCount: 6,
      applicationCount: 7,
      lastTick: 4,
    });
  });
});
