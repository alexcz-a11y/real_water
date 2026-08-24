import type { OpenWaterRuntimeSnapshot } from "./runtime.js";
import {
  createSecondaryParticleStableKeyWriter,
  type SecondaryParticleStableKeyBuffers,
  type SecondaryParticleStableKeyWriter,
} from "./secondary-particle-key.js";
import {
  createSecondaryParticleOutputFrustumVisibility,
  type SecondaryParticleOutputFrustumVisibility,
} from "./secondary-particle-visibility.js";
import type {
  SecondaryParticleCandidateBatch,
  SecondaryParticleConsumerBinding,
  SecondaryParticleConsumerPlan,
  SecondaryParticleConsumerReceipt,
  SecondaryParticleContributionQuantizer,
  SecondaryParticleContributionReference,
} from "./secondary-particle-pool.js";

export const UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID =
  "underwater-suspended-particles" as const;
export const SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID =
  "subsurface-foam-bubble-cloud" as const;
export const RISING_BUBBLE_CONSUMER_ID = "rising-bubbles" as const;

export const MAX_UNDERWATER_SUSPENDED_PARTICLES = 49_152;
export const UNDERWATER_SUSPENDED_PARTICLE_SOFT_REQUEST_CEILING = 24_576;
export const UNDERWATER_SUSPENDED_PARTICLE_MINIMUM_RETAINED_SLOTS = 2_048;
export const MAX_SUBSURFACE_BUBBLE_CLOUD_PARTICLES = 24_576;
export const SUBSURFACE_BUBBLE_CLOUD_SOFT_REQUEST_CEILING = 12_288;
export const SUBSURFACE_BUBBLE_CLOUD_MINIMUM_RETAINED_SLOTS = 1_024;
export const MAX_RISING_BUBBLES = 8_192;
export const RISING_BUBBLE_SOFT_REQUEST_CEILING = 4_096;
export const RISING_BUBBLE_MINIMUM_RETAINED_SLOTS = 256;

const FIXED_TICKS_PER_SECOND = 60;
const MAX_PRESSURE_IMPACTS = 16;
const SUSPENDED_REENTRY_ALPHA_RAMP_TICKS = 4;
const BUBBLE_CLOUD_REENTRY_ENVELOPE_TICKS = 8;
const SUSPENDED_GLOBAL_SOURCE = 0x78ad_a993;
const BUBBLE_CLOUD_GLOBAL_SOURCE = 0xe116_5c71;
const RISING_BUBBLE_GLOBAL_SOURCE = 0x33ea_71b9;

export type UnderwaterSecondaryParticleConsumerId =
  | typeof UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID
  | typeof SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID
  | typeof RISING_BUBBLE_CONSUMER_ID;

type UnderwaterSecondaryParticleKind = "suspended" | "cloud" | "rising";

interface UnderwaterParticleCandidateStorage {
  readonly stableKeys: SecondaryParticleStableKeyBuffers;
  readonly contributionsQ16: Uint16Array;
  readonly payloadHandles: Uint32Array;
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly colors: Float32Array;
}

interface UnderwaterParticleRetainedStorage {
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly colors: Float32Array;
}

interface UnderwaterParticleRetentionHistory {
  beginTick(tick: number, previousTick: number | null): void;
  markSubmitted(keyHigh: number, keyLow: number, tick: number): void;
  reentryOpacityScale(
    keyHigh: number,
    keyLow: number,
    tick: number,
    previousTick: number | null,
    durationTicks: number,
  ): number;
  clear(): void;
}

interface UnderwaterParticleLane {
  readonly kind: UnderwaterSecondaryParticleKind;
  readonly plan: SecondaryParticleConsumerPlan;
  readonly stableKeyWriter: SecondaryParticleStableKeyWriter;
  readonly candidate: UnderwaterParticleCandidateStorage;
  readonly retained: UnderwaterParticleRetainedStorage;
  readonly retainedLane: UnderwaterSecondaryParticleRetainedLane;
  readonly retentionHistory: UnderwaterParticleRetentionHistory | null;
  readonly batch: SecondaryParticleCandidateBatch;
  candidateCount: number;
  retainedCount: number;
  receipt: SecondaryParticleConsumerReceipt | null;
  candidateTick: number | null;
  previousCandidateTick: number | null;
  continuitySeed: number | null;
  continuityResetRevision: number | null;
}

export interface UnderwaterSecondaryParticleImpact {
  readonly kind: "radial-impact" | "directional-wake" | "propeller-wash";
  readonly x: number;
  readonly z: number;
  readonly directionX: number;
  readonly directionZ: number;
  readonly radius: number;
  readonly amplitude: number;
  readonly startTimeSeconds: number;
}

export interface UnderwaterSecondaryParticleInteraction {
  readonly anchorX: number;
  readonly anchorZ: number;
  readonly impacts: readonly UnderwaterSecondaryParticleImpact[];
}

export type UnderwaterSecondaryParticleCamera = Parameters<
  SecondaryParticleOutputFrustumVisibility["evaluate"]
>[0];

export interface UnderwaterSecondaryParticleModelOptions {
  readonly contributionReference: SecondaryParticleContributionReference;
  readonly contributionQuantizer: SecondaryParticleContributionQuantizer;
}

export interface UnderwaterSecondaryParticleCounts {
  readonly [UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID]: number;
  readonly [SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID]: number;
  readonly [RISING_BUBBLE_CONSUMER_ID]: number;
}

export interface UnderwaterSecondaryParticleReceipts {
  readonly [UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID]: SecondaryParticleConsumerReceipt | null;
  readonly [SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID]: SecondaryParticleConsumerReceipt | null;
  readonly [RISING_BUBBLE_CONSUMER_ID]: SecondaryParticleConsumerReceipt | null;
}

export interface UnderwaterSecondaryParticleModelInspection {
  readonly candidateCounts: UnderwaterSecondaryParticleCounts;
  readonly retainedCounts: UnderwaterSecondaryParticleCounts;
  readonly receipts: UnderwaterSecondaryParticleReceipts;
  readonly retainedOpacitySamples: Readonly<{
    readonly [UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID]: number | null;
    readonly [SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID]: number | null;
    readonly [RISING_BUBBLE_CONSUMER_ID]: number | null;
  }>;
}

export interface UnderwaterSecondaryParticleRetainedLane {
  readonly count: number;
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly colors: Float32Array;
}

export interface UnderwaterSecondaryParticleModel {
  readonly consumerPlans: readonly SecondaryParticleConsumerPlan[];
  candidateBatch(
    consumerId: UnderwaterSecondaryParticleConsumerId,
    snapshot: OpenWaterRuntimeSnapshot,
    interaction: UnderwaterSecondaryParticleInteraction,
    camera: UnderwaterSecondaryParticleCamera,
  ): SecondaryParticleCandidateBatch;
  applyRetained(binding: SecondaryParticleConsumerBinding): void;
  retainedLane(
    consumerId: UnderwaterSecondaryParticleConsumerId,
  ): UnderwaterSecondaryParticleRetainedLane;
  inspect(): UnderwaterSecondaryParticleModelInspection;
  reset(): void;
}

/**
 * Creates three deterministic pre-TRAA consumers of the render-neutral shared
 * pool. Candidate and retained payload storage is fixed at construction; the
 * pool sees only stable keys, Q16 contribution, and payload handles.
 */
export function createUnderwaterSecondaryParticleModel(
  options: UnderwaterSecondaryParticleModelOptions,
): UnderwaterSecondaryParticleModel {
  assertContributionReference(options.contributionReference);

  const suspended = createLane({
    kind: "suspended",
    plan: createConsumerPlan(
      UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
      options.contributionReference,
      MAX_UNDERWATER_SUSPENDED_PARTICLES,
      UNDERWATER_SUSPENDED_PARTICLE_SOFT_REQUEST_CEILING,
      UNDERWATER_SUSPENDED_PARTICLE_MINIMUM_RETAINED_SLOTS,
      "after-shared-cooldown",
    ),
  });
  const cloud = createLane({
    kind: "cloud",
    plan: createConsumerPlan(
      SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
      options.contributionReference,
      MAX_SUBSURFACE_BUBBLE_CLOUD_PARTICLES,
      SUBSURFACE_BUBBLE_CLOUD_SOFT_REQUEST_CEILING,
      SUBSURFACE_BUBBLE_CLOUD_MINIMUM_RETAINED_SLOTS,
      "after-shared-cooldown",
    ),
  });
  const rising = createLane({
    kind: "rising",
    plan: createConsumerPlan(
      RISING_BUBBLE_CONSUMER_ID,
      options.contributionReference,
      MAX_RISING_BUBBLES,
      RISING_BUBBLE_SOFT_REQUEST_CEILING,
      RISING_BUBBLE_MINIMUM_RETAINED_SLOTS,
      "forbidden-until-absent",
    ),
  });
  const lanes = Object.freeze([suspended, cloud, rising] as const);
  const consumerPlans = Object.freeze(lanes.map((lane) => lane.plan));
  const visibility = createSecondaryParticleOutputFrustumVisibility(
    options.contributionReference,
  );

  const inspection = createInspection(lanes);

  return Object.freeze({
    consumerPlans,
    candidateBatch(
      consumerId: UnderwaterSecondaryParticleConsumerId,
      snapshot: OpenWaterRuntimeSnapshot,
      interaction: UnderwaterSecondaryParticleInteraction,
      camera: UnderwaterSecondaryParticleCamera,
    ): SecondaryParticleCandidateBatch {
      const lane = laneForConsumer(lanes, consumerId);
      const desiredCount = desiredCandidateCount(lane.kind, interaction);
      lane.candidateCount = writeCandidates({
        lane,
        snapshot,
        interaction,
        camera,
        desiredCount,
        contributionReference: options.contributionReference,
        quantizeContribution: options.contributionQuantizer,
        visibility,
      });
      return lane.batch;
    },
    applyRetained(binding: SecondaryParticleConsumerBinding): void {
      const lane = laneForConsumer(
        lanes,
        binding.consumerId as UnderwaterSecondaryParticleConsumerId,
      );
      applyRetainedPayloads(lane, binding);
    },
    retainedLane(
      consumerId: UnderwaterSecondaryParticleConsumerId,
    ): UnderwaterSecondaryParticleRetainedLane {
      return laneForConsumer(lanes, consumerId).retainedLane;
    },
    inspect(): UnderwaterSecondaryParticleModelInspection {
      return inspection;
    },
    reset(): void {
      for (const lane of lanes) {
        lane.candidateCount = 0;
        lane.retainedCount = 0;
        lane.receipt = null;
        lane.candidateTick = null;
        lane.previousCandidateTick = null;
        lane.continuitySeed = null;
        lane.continuityResetRevision = null;
        lane.retentionHistory?.clear();
      }
    },
  });
}

function createConsumerPlan(
  consumerId: UnderwaterSecondaryParticleConsumerId,
  contributionReference: SecondaryParticleContributionReference,
  maximumRequestCount: number,
  softRequestCeiling: number,
  minimumRetainedSlots: number,
  pressureReentryPolicy: "after-shared-cooldown" | "forbidden-until-absent",
): SecondaryParticleConsumerPlan {
  return Object.freeze({
    consumerId,
    contributionReference: Object.freeze({ ...contributionReference }),
    maximumRequestCount,
    minimumRetainedSlots,
    softRequestCeiling,
    pressureReentryPolicy,
  });
}

function createLane(options: {
  readonly kind: UnderwaterSecondaryParticleKind;
  readonly plan: SecondaryParticleConsumerPlan;
}): UnderwaterParticleLane {
  const maximum = options.plan.maximumRequestCount;
  const candidate = Object.freeze({
    stableKeys: Object.freeze({
      high: new Uint32Array(maximum),
      low: new Uint32Array(maximum),
    }),
    contributionsQ16: new Uint16Array(maximum),
    payloadHandles: new Uint32Array(maximum),
    positions: new Float32Array(maximum * 3),
    sizes: new Float32Array(maximum),
    colors: new Float32Array(maximum * 4),
  });
  const retained = Object.freeze({
    positions: new Float32Array(maximum * 3),
    sizes: new Float32Array(maximum),
    colors: new Float32Array(maximum * 4),
  });
  const lane = {
    kind: options.kind,
    plan: options.plan,
    stableKeyWriter: createSecondaryParticleStableKeyWriter(
      options.plan.consumerId,
    ),
    candidate,
    retained,
    retainedLane:
      undefined as unknown as UnderwaterSecondaryParticleRetainedLane,
    retentionHistory:
      options.kind === "rising"
        ? null
        : createUnderwaterParticleRetentionHistory(maximum),
    batch: undefined as unknown as SecondaryParticleCandidateBatch,
    candidateCount: 0,
    retainedCount: 0,
    receipt: null,
    candidateTick: null,
    previousCandidateTick: null,
    continuitySeed: null,
    continuityResetRevision: null,
  } satisfies UnderwaterParticleLane;
  lane.batch = Object.freeze({
    get count(): number {
      return lane.candidateCount;
    },
    stableKeyHigh: candidate.stableKeys.high,
    stableKeyLow: candidate.stableKeys.low,
    contributionsQ16: candidate.contributionsQ16,
    payloadHandles: candidate.payloadHandles,
  });
  lane.retainedLane = Object.freeze({
    get count(): number {
      return lane.retainedCount;
    },
    positions: retained.positions,
    sizes: retained.sizes,
    colors: retained.colors,
  });
  return lane;
}

function desiredCandidateCount(
  kind: UnderwaterSecondaryParticleKind,
  interaction: UnderwaterSecondaryParticleInteraction,
): number {
  const impactCount = Math.min(
    interaction.impacts.length,
    MAX_PRESSURE_IMPACTS,
  );
  return Math.min(
    maximumCandidateCount(kind),
    baseCandidateCount(kind) + impactCount * candidatesPerImpact(kind),
  );
}

function maximumCandidateCount(kind: UnderwaterSecondaryParticleKind): number {
  switch (kind) {
    case "suspended":
      return MAX_UNDERWATER_SUSPENDED_PARTICLES;
    case "cloud":
      return MAX_SUBSURFACE_BUBBLE_CLOUD_PARTICLES;
    case "rising":
      return MAX_RISING_BUBBLES;
  }
}

function baseCandidateCount(kind: UnderwaterSecondaryParticleKind): number {
  switch (kind) {
    case "suspended":
      return UNDERWATER_SUSPENDED_PARTICLE_SOFT_REQUEST_CEILING;
    case "cloud":
      return SUBSURFACE_BUBBLE_CLOUD_SOFT_REQUEST_CEILING;
    case "rising":
      return RISING_BUBBLE_SOFT_REQUEST_CEILING;
  }
}

function candidatesPerImpact(kind: UnderwaterSecondaryParticleKind): number {
  switch (kind) {
    case "suspended":
      return 1_536;
    case "cloud":
      return 768;
    case "rising":
      return 256;
  }
}

function writeCandidates(options: {
  readonly lane: UnderwaterParticleLane;
  readonly snapshot: OpenWaterRuntimeSnapshot;
  readonly interaction: UnderwaterSecondaryParticleInteraction;
  readonly camera: UnderwaterSecondaryParticleCamera;
  readonly desiredCount: number;
  readonly contributionReference: SecondaryParticleContributionReference;
  readonly quantizeContribution: SecondaryParticleContributionQuantizer;
  readonly visibility: SecondaryParticleOutputFrustumVisibility;
}): number {
  const { lane, snapshot, interaction, camera } = options;
  beginLaneCandidateTick(lane, snapshot);
  camera.updateWorldMatrix(true, false);
  const cameraWorld = camera.matrixWorld.elements;
  const cameraX = cameraWorld[12] ?? 0;
  const cameraY = cameraWorld[13] ?? 0;
  const cameraZ = cameraWorld[14] ?? 0;
  const pixelsPerRadian =
    options.contributionReference.height /
    (2 * Math.tan((camera.fov * Math.PI) / 360));
  const impacts = interaction.impacts;
  const impactCount = Math.min(impacts.length, MAX_PRESSURE_IMPACTS);
  const storage = lane.candidate;
  let writeIndex = 0;

  // The global population always owns its base partition. Each accepted local
  // impact then owns a fixed-size partition whose identity uses a source-local
  // ordinal, so adding or removing another impact cannot rename existing keys.
  for (
    let partition = -1;
    partition < impactCount && writeIndex < options.desiredCount;
    partition += 1
  ) {
    const impact = partition < 0 ? undefined : impacts[partition];
    const partitionCount = Math.min(
      partition < 0
        ? baseCandidateCount(lane.kind)
        : candidatesPerImpact(lane.kind),
      options.desiredCount - writeIndex,
    );
    const sourceId =
      impact === undefined
        ? globalSource(lane.kind)
        : stableImpactSource(impact.x, impact.z, impact.startTimeSeconds);
    const sourceStartTick =
      impact === undefined
        ? 0
        : Math.round(impact.startTimeSeconds * FIXED_TICKS_PER_SECOND);
    if (sourceStartTick > snapshot.tick) {
      continue;
    }
    const sourceX = (impact?.x ?? interaction.anchorX) - snapshot.originX;
    const sourceZ = (impact?.z ?? interaction.anchorZ) - snapshot.originZ;
    const sourceRadius = Math.max(1, impact?.radius ?? 24);

    for (
      let localOrdinal = 0;
      localOrdinal < partitionCount;
      localOrdinal += 1
    ) {
      const lifetimeTicks = particleLifetimeTicks(
        lane.kind,
        localOrdinal,
        sourceId,
      );
      const ageTicks = positiveModulo(
        snapshot.tick - sourceStartTick,
        lifetimeTicks,
      );
      const spawnEpochTick = snapshot.tick - ageTicks;
      lane.stableKeyWriter.writeAt(
        storage.stableKeys,
        writeIndex,
        snapshot.seed,
        sourceId,
        spawnEpochTick,
        localOrdinal,
      );
      const keyHigh = storage.stableKeys.high[writeIndex] ?? 0;
      const keyLow = storage.stableKeys.low[writeIndex] ?? 0;
      lane.retentionHistory?.markSubmitted(keyHigh, keyLow, snapshot.tick);
      storage.payloadHandles[writeIndex] = writeIndex;

      const randomA = unitFloat(mix32(keyLow ^ 0xa511_e9b3));
      const randomB = unitFloat(mix32(keyHigh ^ 0x63d8_35f1));
      const randomC = unitFloat(mix32(keyLow ^ keyHigh ^ 0x91e1_0da5));
      const ageSeconds = ageTicks / FIXED_TICKS_PER_SECOND;
      const normalizedAge = ageTicks / lifetimeTicks;
      const angle = randomA * Math.PI * 2;
      let x: number;
      let y: number;
      let z: number;
      let worldRadius: number;
      let opacity: number;
      let contrast: number;
      let red: number;
      let green: number;
      let blue: number;

      if (lane.kind === "suspended") {
        const radialDistance = Math.sqrt(randomB) * sourceRadius * 1.5;
        const drift = Math.sin(ageSeconds * (0.25 + randomC * 0.35)) * 0.4;
        x = sourceX + Math.cos(angle) * radialDistance + drift;
        z = sourceZ + Math.sin(angle) * radialDistance - drift * 0.5;
        y =
          snapshot.seaLevelMetres -
          (0.6 + randomC * 18) +
          Math.sin(ageSeconds * 0.4 + angle) * 0.18;
        worldRadius = 0.012 + randomA * 0.055;
        opacity = 0.05 + randomB * 0.16;
        contrast = 0.08 + randomC * 0.24;
        red = 0.48;
        green = 0.68;
        blue = 0.72;
      } else if (lane.kind === "cloud") {
        const radialDistance = Math.sqrt(randomB) * sourceRadius * 0.75;
        const directionX = impact?.directionX ?? Math.cos(angle);
        const directionZ = impact?.directionZ ?? Math.sin(angle);
        x =
          sourceX +
          Math.cos(angle) * radialDistance +
          directionX * ageSeconds * 0.08;
        z =
          sourceZ +
          Math.sin(angle) * radialDistance +
          directionZ * ageSeconds * 0.08;
        y = snapshot.seaLevelMetres - (0.15 + randomC * 2.2);
        worldRadius = 0.05 + randomA * 0.32;
        const densityEnvelope = Math.min(
          1,
          ageTicks / BUBBLE_CLOUD_REENTRY_ENVELOPE_TICKS,
          (lifetimeTicks - ageTicks) / BUBBLE_CLOUD_REENTRY_ENVELOPE_TICKS,
        );
        opacity = densityEnvelope * (0.12 + randomB * 0.38);
        contrast = 0.28 + randomC * 0.42;
        red = 0.62;
        green = 0.83;
        blue = 0.9;
      } else {
        const initialDepth = 2.5 + randomB * 18;
        const radialDistance = Math.sqrt(randomC) * sourceRadius * 0.4;
        x =
          sourceX +
          Math.cos(angle) * radialDistance +
          Math.sin(ageSeconds * 1.7 + angle) * 0.22;
        z =
          sourceZ +
          Math.sin(angle) * radialDistance +
          Math.cos(ageSeconds * 1.3 + angle) * 0.22;
        y = Math.min(
          snapshot.seaLevelMetres - 0.05,
          snapshot.seaLevelMetres - initialDepth * (1 - normalizedAge),
        );
        worldRadius = 0.025 + randomA * 0.11;
        const lifetimeEnvelope = Math.min(
          1,
          normalizedAge * 8,
          (1 - normalizedAge) * 10,
        );
        opacity = lifetimeEnvelope * (0.2 + randomB * 0.5);
        contrast = 0.38 + randomC * 0.48;
        red = 0.68;
        green = 0.87;
        blue = 0.96;
      }

      const positionOffset = writeIndex * 3;
      storage.positions[positionOffset] = x;
      storage.positions[positionOffset + 1] = y;
      storage.positions[positionOffset + 2] = z;
      const cameraDistance = Math.max(
        0.25,
        Math.hypot(x - cameraX, y - cameraY, z - cameraZ),
      );
      const diameterPixels = Math.max(
        0.5,
        Math.min(96, (worldRadius * 2 * pixelsPerRadian) / cameraDistance),
      );
      storage.sizes[writeIndex] = diameterPixels;
      const projectedAreaPixels =
        Math.PI * diameterPixels * diameterPixels * 0.25;
      const depthVisibility = options.visibility.evaluate(
        camera,
        x,
        y,
        z,
        diameterPixels * 0.5,
      );
      storage.contributionsQ16[writeIndex] = options.quantizeContribution(
        projectedAreaPixels,
        opacity,
        contrast,
        depthVisibility,
      );
      const colorOffset = writeIndex * 4;
      storage.colors[colorOffset] = red;
      storage.colors[colorOffset + 1] = green;
      storage.colors[colorOffset + 2] = blue;
      storage.colors[colorOffset + 3] = opacity;

      writeIndex += 1;
    }
  }
  return writeIndex;
}

function applyRetainedPayloads(
  lane: UnderwaterParticleLane,
  binding: SecondaryParticleConsumerBinding,
): void {
  if (binding.consumerId !== lane.plan.consumerId) {
    throw new Error(
      `Underwater ${lane.kind} particles cannot consume binding ${binding.consumerId}.`,
    );
  }
  const retainedCount = binding.retained.count[0] ?? 0;
  if (retainedCount > lane.plan.maximumRequestCount) {
    throw new Error(
      `Underwater ${lane.kind} retained count exceeds its capacity.`,
    );
  }
  const candidate = lane.candidate;
  const retained = lane.retained;
  const candidateTick = lane.candidateTick;
  if (candidateTick === null) {
    throw new Error(
      `Underwater ${lane.kind} retained payloads require a prepared candidate tick.`,
    );
  }
  for (let index = 0; index < retainedCount; index += 1) {
    const payload = binding.retained.payloadHandles[index] ?? 0;
    if (payload >= lane.candidateCount) {
      throw new Error(
        `Underwater ${lane.kind} retained unknown payload handle ${String(payload)}.`,
      );
    }
    const sourcePosition = payload * 3;
    const targetPosition = index * 3;
    retained.positions[targetPosition] =
      candidate.positions[sourcePosition] ?? 0;
    retained.positions[targetPosition + 1] =
      candidate.positions[sourcePosition + 1] ?? 0;
    retained.positions[targetPosition + 2] =
      candidate.positions[sourcePosition + 2] ?? 0;
    retained.sizes[index] = candidate.sizes[payload] ?? 0;
    const sourceColor = payload * 4;
    const targetColor = index * 4;
    retained.colors[targetColor] = candidate.colors[sourceColor] ?? 0;
    retained.colors[targetColor + 1] = candidate.colors[sourceColor + 1] ?? 0;
    retained.colors[targetColor + 2] = candidate.colors[sourceColor + 2] ?? 0;
    const opacityScale =
      lane.retentionHistory?.reentryOpacityScale(
        binding.retained.stableKeyHigh[index] ?? 0,
        binding.retained.stableKeyLow[index] ?? 0,
        candidateTick,
        lane.previousCandidateTick,
        reentryEnvelopeTicks(lane.kind),
      ) ?? 1;
    retained.colors[targetColor + 3] =
      (candidate.colors[sourceColor + 3] ?? 0) * opacityScale;
  }
  lane.retainedCount = retainedCount;
  lane.receipt = binding.receipt;
}

function reentryEnvelopeTicks(kind: UnderwaterSecondaryParticleKind): number {
  switch (kind) {
    case "suspended":
      return SUSPENDED_REENTRY_ALPHA_RAMP_TICKS;
    case "cloud":
      return BUBBLE_CLOUD_REENTRY_ENVELOPE_TICKS;
    case "rising":
      return 0;
  }
}

function createInspection(
  lanes: readonly [
    UnderwaterParticleLane,
    UnderwaterParticleLane,
    UnderwaterParticleLane,
  ],
): UnderwaterSecondaryParticleModelInspection {
  const [suspended, cloud, rising] = lanes;
  const candidateCounts = Object.freeze({
    get [UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID](): number {
      return suspended.candidateCount;
    },
    get [SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID](): number {
      return cloud.candidateCount;
    },
    get [RISING_BUBBLE_CONSUMER_ID](): number {
      return rising.candidateCount;
    },
  });
  const retainedCounts = Object.freeze({
    get [UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID](): number {
      return suspended.retainedCount;
    },
    get [SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID](): number {
      return cloud.retainedCount;
    },
    get [RISING_BUBBLE_CONSUMER_ID](): number {
      return rising.retainedCount;
    },
  });
  const receipts = Object.freeze({
    get [UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID](): SecondaryParticleConsumerReceipt | null {
      return suspended.receipt;
    },
    get [SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID](): SecondaryParticleConsumerReceipt | null {
      return cloud.receipt;
    },
    get [RISING_BUBBLE_CONSUMER_ID](): SecondaryParticleConsumerReceipt | null {
      return rising.receipt;
    },
  });
  const retainedOpacitySamples = Object.freeze({
    get [UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID](): number | null {
      return firstRetainedOpacity(suspended);
    },
    get [SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID](): number | null {
      return firstRetainedOpacity(cloud);
    },
    get [RISING_BUBBLE_CONSUMER_ID](): number | null {
      return firstRetainedOpacity(rising);
    },
  });
  return Object.freeze({
    candidateCounts,
    retainedCounts,
    receipts,
    retainedOpacitySamples,
  });
}

function firstRetainedOpacity(lane: UnderwaterParticleLane): number | null {
  return lane.retainedCount === 0 ? null : (lane.retained.colors[3] ?? 0);
}

function laneForConsumer(
  lanes: readonly [
    UnderwaterParticleLane,
    UnderwaterParticleLane,
    UnderwaterParticleLane,
  ],
  consumerId: UnderwaterSecondaryParticleConsumerId,
): UnderwaterParticleLane {
  switch (consumerId) {
    case UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID:
      return lanes[0];
    case SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID:
      return lanes[1];
    case RISING_BUBBLE_CONSUMER_ID:
      return lanes[2];
    default:
      throw new Error(
        `Unknown underwater particle consumer ${String(consumerId)}.`,
      );
  }
}

function beginLaneCandidateTick(
  lane: UnderwaterParticleLane,
  snapshot: OpenWaterRuntimeSnapshot,
): void {
  const continuityChanged =
    lane.continuitySeed !== null &&
    (lane.continuitySeed !== snapshot.seed ||
      lane.continuityResetRevision !== snapshot.simulationResetRevision ||
      (lane.candidateTick !== null && snapshot.tick < lane.candidateTick));
  if (continuityChanged) {
    lane.retentionHistory?.clear();
    lane.candidateTick = null;
    lane.previousCandidateTick = null;
  }
  lane.continuitySeed = snapshot.seed;
  lane.continuityResetRevision = snapshot.simulationResetRevision;
  if (lane.candidateTick === snapshot.tick) {
    return;
  }
  const previousTick = lane.candidateTick;
  lane.previousCandidateTick = previousTick;
  lane.candidateTick = snapshot.tick;
  lane.retentionHistory?.beginTick(snapshot.tick, previousTick);
}

function createUnderwaterParticleRetentionHistory(
  maximumCandidateCount: number,
): UnderwaterParticleRetentionHistory {
  // At a lifecycle boundary the previous and next fixed populations may both
  // be present until the next rebuild. Two bounded cohorts are therefore the
  // exact worst case; no state grows with runtime duration.
  const recordCapacity = maximumCandidateCount * 2;
  const keyHigh = new Uint32Array(recordCapacity);
  const keyLow = new Uint32Array(recordCapacity);
  const lastSubmittedTick = new Float64Array(recordCapacity);
  const lastRetainedTick = new Float64Array(recordCapacity);
  const rampStartTick = new Float64Array(recordCapacity);
  const everRetained = new Uint8Array(recordCapacity);
  let hashCapacity = 1;
  while (hashCapacity < recordCapacity * 2) {
    hashCapacity *= 2;
  }
  const hashRecords = new Uint32Array(hashCapacity);
  const hashStamps = new Uint32Array(hashCapacity);
  const hashMask = hashCapacity - 1;
  let hashGeneration = 1;
  let recordCount = 0;

  const advanceHashGeneration = (): void => {
    hashGeneration += 1;
    if (hashGeneration >= 0xffff_ffff) {
      hashStamps.fill(0);
      hashGeneration = 1;
    }
  };
  const insertHash = (record: number): void => {
    let bucket =
      retentionHash(keyHigh[record] ?? 0, keyLow[record] ?? 0) & hashMask;
    while (hashStamps[bucket] === hashGeneration) {
      bucket = (bucket + 1) & hashMask;
    }
    hashStamps[bucket] = hashGeneration;
    hashRecords[bucket] = record;
  };
  const findRecord = (high: number, low: number): number => {
    let bucket = retentionHash(high, low) & hashMask;
    while (hashStamps[bucket] === hashGeneration) {
      const record = hashRecords[bucket] ?? 0;
      if (keyHigh[record] === high && keyLow[record] === low) {
        return record;
      }
      bucket = (bucket + 1) & hashMask;
    }
    return -1;
  };
  const clear = (): void => {
    recordCount = 0;
    advanceHashGeneration();
  };

  return Object.freeze({
    beginTick(_tick: number, previousTick: number | null): void {
      advanceHashGeneration();
      if (previousTick === null) {
        recordCount = 0;
        return;
      }
      let write = 0;
      for (let read = 0; read < recordCount; read += 1) {
        if (lastSubmittedTick[read] !== previousTick) {
          continue;
        }
        if (write !== read) {
          keyHigh[write] = keyHigh[read] ?? 0;
          keyLow[write] = keyLow[read] ?? 0;
          lastSubmittedTick[write] = lastSubmittedTick[read] ?? 0;
          lastRetainedTick[write] = lastRetainedTick[read] ?? 0;
          rampStartTick[write] = rampStartTick[read] ?? 0;
          everRetained[write] = everRetained[read] ?? 0;
        }
        insertHash(write);
        write += 1;
      }
      recordCount = write;
    },
    markSubmitted(high: number, low: number, tick: number): void {
      let record = findRecord(high, low);
      if (record < 0) {
        if (recordCount >= recordCapacity) {
          throw new RangeError(
            "Underwater particle reentry history exceeded its bounded capacity.",
          );
        }
        record = recordCount;
        recordCount += 1;
        keyHigh[record] = high;
        keyLow[record] = low;
        lastRetainedTick[record] = Number.NEGATIVE_INFINITY;
        rampStartTick[record] = Number.NEGATIVE_INFINITY;
        everRetained[record] = 0;
        insertHash(record);
      }
      lastSubmittedTick[record] = tick;
    },
    reentryOpacityScale(
      high: number,
      low: number,
      tick: number,
      previousTick: number | null,
      durationTicks: number,
    ): number {
      const record = findRecord(high, low);
      if (record < 0) {
        throw new Error(
          "Underwater retained particle is missing reentry history.",
        );
      }
      if (everRetained[record] === 0) {
        everRetained[record] = 1;
        lastRetainedTick[record] = tick;
        return 1;
      }
      if (
        previousTick !== null &&
        lastRetainedTick[record] !== tick &&
        (lastRetainedTick[record] ?? Number.NEGATIVE_INFINITY) < previousTick
      ) {
        rampStartTick[record] = tick;
      }
      const rampStart = rampStartTick[record] ?? Number.NEGATIVE_INFINITY;
      const scale = Number.isFinite(rampStart)
        ? Math.min(1, (tick - rampStart + 1) / durationTicks)
        : 1;
      if (scale >= 1) {
        rampStartTick[record] = Number.NEGATIVE_INFINITY;
      }
      lastRetainedTick[record] = tick;
      return scale;
    },
    clear,
  });
}

function retentionHash(high: number, low: number): number {
  return mix32(high ^ Math.imul(low, 0x9e37_79b9));
}

function particleLifetimeTicks(
  kind: UnderwaterSecondaryParticleKind,
  ordinal: number,
  sourceId: number,
): number {
  const random = mix32(ordinal ^ sourceId);
  switch (kind) {
    case "suspended":
      return 480 + (random % 361);
    case "cloud":
      return 90 + (random % 91);
    case "rising":
      return 180 + (random % 121);
  }
}

function globalSource(kind: UnderwaterSecondaryParticleKind): number {
  switch (kind) {
    case "suspended":
      return SUSPENDED_GLOBAL_SOURCE;
    case "cloud":
      return BUBBLE_CLOUD_GLOBAL_SOURCE;
    case "rising":
      return RISING_BUBBLE_GLOBAL_SOURCE;
  }
}

function stableImpactSource(
  x: number,
  z: number,
  startTimeSeconds: number,
): number {
  const xMillimetres = Math.round(x * 1_000);
  const zMillimetres = Math.round(z * 1_000);
  const startTick = Math.round(startTimeSeconds * FIXED_TICKS_PER_SECOND);
  return mix32(
    Math.imul(xMillimetres, 0x27d4_eb2d) ^
      Math.imul(zMillimetres, 0x1656_67b1) ^
      startTick,
  );
}

function mix32(input: number): number {
  let value = input >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function unitFloat(value: number): number {
  return value / 0x1_0000_0000;
}

function positiveModulo(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

function assertContributionReference(
  reference: SecondaryParticleContributionReference,
): void {
  if (
    reference.space !== "output-drawing-buffer" ||
    !Number.isSafeInteger(reference.width) ||
    reference.width <= 0 ||
    !Number.isSafeInteger(reference.height) ||
    reference.height <= 0
  ) {
    throw new Error(
      "Underwater secondary particles require a positive output-drawing-buffer contribution ruler.",
    );
  }
}
