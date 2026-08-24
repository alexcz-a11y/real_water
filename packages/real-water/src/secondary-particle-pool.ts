import { MAX_SECONDARY_PARTICLES } from "./capabilities.js";

export { MAX_SECONDARY_PARTICLES };
export const SECONDARY_PARTICLE_CONTRIBUTION_SCREEN_AREA_DIVISOR = 3_600;
export const SECONDARY_PARTICLE_RETAINED_Q16_BONUS = 4_096;
export const SECONDARY_PARTICLE_MINIMUM_RESIDENCE_TICKS = 4;
export const SECONDARY_PARTICLE_REENTRY_COOLDOWN_TICKS = 4;

export const SECONDARY_PARTICLE_DROP_INVISIBLE_OR_OCCLUDED = 1 << 0;
export const SECONDARY_PARTICLE_DROP_GLOBAL_CONTRIBUTION_PRESSURE = 1 << 1;
export const SECONDARY_PARTICLE_DROP_REENTRY_COOLDOWN = 1 << 2;
export const SECONDARY_PARTICLE_DROP_LIFECYCLE_REENTRY_FORBIDDEN = 1 << 3;

const MAX_EFFECTIVE_CONTRIBUTION =
  65_535 + SECONDARY_PARTICLE_RETAINED_Q16_BONUS;
const EMPTY_SLOT = 0xffff_ffff;
const SELECTION_ROUTE_GLOBAL = 0;
const SELECTION_ROUTE_FLOOR = 1;
const SELECTION_ROUTE_RESIDENCE = 2;
type SelectionRoute =
  | typeof SELECTION_ROUTE_GLOBAL
  | typeof SELECTION_ROUTE_FLOOR
  | typeof SELECTION_ROUTE_RESIDENCE;
const REENTRY_ALLOWED = 0;
const REENTRY_SHARED_COOLDOWN = 1;
const REENTRY_LIFECYCLE_FORBIDDEN = 2;
const BINDING_OWNER = Symbol("secondary-particle-pool-owner");
const BINDING_INDEX = Symbol("secondary-particle-consumer-index");

export interface SecondaryParticleResolution {
  readonly width: number;
  readonly height: number;
}

export interface SecondaryParticleContributionReference extends SecondaryParticleResolution {
  readonly space: "output-drawing-buffer";
}

export type SecondaryParticlePressureReentryPolicy =
  "after-shared-cooldown" | "forbidden-until-absent";

export interface SecondaryParticleConsumerPlan {
  readonly consumerId: string;
  readonly contributionReference: SecondaryParticleContributionReference;
  readonly maximumRequestCount: number;
  readonly minimumRetainedSlots: number;
  readonly softRequestCeiling: number;
  /**
   * `after-shared-cooldown` candidates may satisfy their consumer floor while
   * cooling because the floor guarantee precedes shared hysteresis.
   * `forbidden-until-absent` makes pressure removal terminal for a stable key
   * while that key remains continuously submitted; terminal keys are no
   * longer floor-eligible, so another lifecycle must satisfy the floor.
   */
  readonly pressureReentryPolicy: SecondaryParticlePressureReentryPolicy;
}

export interface SecondaryParticlePoolPlan {
  readonly capacity: number;
  readonly contribution: {
    readonly projectedAreaReference: "output-drawing-buffer";
    readonly referenceWidth: number;
    readonly referenceHeight: number;
    readonly screenAreaDivisor: number;
    readonly quantization: "q16-unorm-round-nearest";
  };
  readonly hysteresis: {
    readonly mode: "incumbent-bonus-residence-cooldown";
    readonly retainedContributionBonusQ16: number;
    readonly minimumResidenceTicks: number;
    readonly reentryCooldownTicks: number;
  };
  readonly consumers: readonly SecondaryParticleConsumerPlan[];
}

export interface SecondaryParticleCandidateBatch {
  readonly count: number;
  readonly stableKeyHigh: Uint32Array;
  readonly stableKeyLow: Uint32Array;
  readonly contributionsQ16: Uint16Array;
  readonly payloadHandles: Uint32Array;
}

export interface SecondaryParticleRetainedView {
  readonly count: Uint32Array;
  readonly stableKeyHigh: Uint32Array;
  readonly stableKeyLow: Uint32Array;
  readonly contributionsQ16: Uint16Array;
  readonly payloadHandles: Uint32Array;
  readonly poolSlots: Uint32Array;
}

export interface SecondaryParticleContributionRange {
  readonly minimumQ16: number;
  readonly maximumQ16: number;
}

export interface SecondaryParticleConsumerReceipt {
  readonly requested: number;
  readonly requestedAboveSoftCeiling: number;
  readonly retained: number;
  readonly floorRetained: number;
  readonly residenceRetained: number;
  readonly globalRetained: number;
  readonly thinned: number;
  readonly invisibleOrOccluded: number;
  readonly reentryCooldown: number;
  readonly lifecycleReentryForbidden: number;
  readonly contributionMinimumQ16: number;
  readonly contributionMaximumQ16: number;
  readonly contributionRange: SecondaryParticleContributionRange;
  readonly dropReasonMask: number;
}

export type SecondaryParticleGlobalReceipt = SecondaryParticleConsumerReceipt;

export interface SecondaryParticleConsumerBinding {
  readonly consumerId: string;
  readonly retained: SecondaryParticleRetainedView;
  readonly receipt: SecondaryParticleConsumerReceipt;
}

interface InternalConsumerBinding extends SecondaryParticleConsumerBinding {
  readonly [BINDING_OWNER]: object;
  readonly [BINDING_INDEX]: number;
}

export interface SecondaryParticlePoolFrame {
  readonly tick: number;
  readonly continuityRevision: number;
  readonly retainedCount: number;
  readonly globalReceipt: SecondaryParticleGlobalReceipt;
}

export interface SecondaryParticlePool {
  consumer(consumerId: string): SecondaryParticleConsumerBinding;
  /**
   * Opens one allocation transaction. An identical resolved
   * `{tick, continuityRevision, allocationRevision}` reuses its frame. Changing
   * only `allocationRevision` restores that tick's first-submit history
   * checkpoint before accepting a replacement candidate set.
   */
  beginTick(
    tick: number,
    continuityRevision: number,
    allocationRevision?: number,
  ): "accepting-candidates" | "reuse-current-tick";
  submit(
    consumer: SecondaryParticleConsumerBinding,
    batch: SecondaryParticleCandidateBatch,
  ): void;
  resolve(): SecondaryParticlePoolFrame;
  current(): SecondaryParticlePoolFrame;
}

export interface SecondaryParticleContributionQuantizerPlan {
  readonly projectedAreaResolution: SecondaryParticleResolution;
  readonly referenceResolution: SecondaryParticleResolution;
}

export type SecondaryParticleContributionQuantizer = (
  projectedAreaPixels: number,
  opacity: number,
  contrast: number,
  /**
   * CPU-known visibility at allocation time. Current consumers use output-
   * frustum visibility here; scene-depth occlusion stays in the GPU render
   * adapter's soft fusion because the pool has no render timing or readback
   * dependency. Consequently, a particle hidden entirely by opaque geometry
   * can still occupy a retained slot. A previous-frame occlusion estimate is a
   * known one-frame-latency option, deliberately deferred until visual evidence
   * justifies that extra seam.
   */
  depthVisibility: number,
) => number;

export function createSecondaryParticleContributionQuantizer(
  options: SecondaryParticleContributionQuantizerPlan,
): SecondaryParticleContributionQuantizer {
  assertResolution(options.projectedAreaResolution, "projected-area");
  assertResolution(options.referenceResolution, "reference");

  // projectedAreaPixels is first converted to the manifest's immutable output
  // drawing-buffer ruler. k then scales with that ruler's screen area. Keeping
  // k = width * height / 3600 makes the response curve resolution invariant:
  // k is 16 pixels at the 320x180 QA resolution and 1024 at 2560x1440 Native.
  const sourceArea =
    options.projectedAreaResolution.width *
    options.projectedAreaResolution.height;
  const referenceArea =
    options.referenceResolution.width * options.referenceResolution.height;
  const projectedAreaScale = referenceArea / sourceArea;
  const saturationScale =
    referenceArea / SECONDARY_PARTICLE_CONTRIBUTION_SCREEN_AREA_DIVISOR;
  return (projectedAreaPixels, opacity, contrast, depthVisibility) => {
    assertFiniteNonnegative(projectedAreaPixels, "projectedAreaPixels");
    assertUnitFactor(opacity, "opacity");
    assertUnitFactor(contrast, "contrast");
    assertUnitFactor(depthVisibility, "depthVisibility");
    const pixelEnergy =
      projectedAreaPixels *
      projectedAreaScale *
      opacity *
      contrast *
      depthVisibility;
    return Math.round((1 - Math.exp(-pixelEnergy / saturationScale)) * 65_535);
  };
}

const RECEIPT_REQUESTED = 0;
const RECEIPT_ABOVE_SOFT_CEILING = 1;
const RECEIPT_RETAINED = 2;
const RECEIPT_FLOOR_RETAINED = 3;
const RECEIPT_RESIDENCE_RETAINED = 4;
const RECEIPT_GLOBAL_RETAINED = 5;
const RECEIPT_THINNED = 6;
const RECEIPT_INVISIBLE = 7;
const RECEIPT_COOLDOWN = 8;
const RECEIPT_LIFECYCLE_REENTRY_FORBIDDEN = 9;
const RECEIPT_MINIMUM = 10;
const RECEIPT_MAXIMUM = 11;
const RECEIPT_DROP_MASK = 12;
const RECEIPT_FIELD_COUNT = 13;

interface ConsumerState {
  readonly id: string;
  readonly binding: SecondaryParticleConsumerBinding;
  readonly receiptBacking: Uint32Array;
  readonly maximum: number;
  readonly floor: number;
  readonly softCeiling: number;
  readonly pressureReentryPolicy: SecondaryParticlePressureReentryPolicy;
  readonly candidateOffset: number;
  candidateCount: number;
  workRequested: number;
  workVisible: number;
  workCooldown: number;
  workLifecycleReentryForbidden: number;
  workFloor: number;
  workResidence: number;
  workGlobal: number;
  workRetained: number;
  workMinimum: number;
  workMaximum: number;
  workDropMask: number;
}

/**
 * Creates the shared, render-phase-neutral allocator. Consumers own their
 * payload and simulation; this object only arbitrates stable particle handles.
 */
export function createSecondaryParticlePool(
  inputPlan: SecondaryParticlePoolPlan,
): SecondaryParticlePool {
  const plan = validatePlan(inputPlan);
  const consumerCount = plan.consumers.length;
  let totalMaximum = 0;
  for (const consumer of plan.consumers) {
    totalMaximum += consumer.maximumRequestCount;
  }

  const candidateKeyHigh = new Uint32Array(totalMaximum);
  const candidateKeyLow = new Uint32Array(totalMaximum);
  const candidateContribution = new Uint16Array(totalMaximum);
  const candidatePayload = new Uint32Array(totalMaximum);
  const candidateConsumer = new Uint32Array(totalMaximum);
  const candidateHistory = new Uint32Array(totalMaximum);
  const candidateEffective = new Uint32Array(totalMaximum);
  const candidateSelected = new Uint8Array(totalMaximum);
  const candidateReentryBlock = new Uint8Array(totalMaximum);
  const orderA = new Uint32Array(totalMaximum);
  const orderB = new Uint32Array(totalMaximum);
  const radixCounts = new Uint32Array(65_536);

  // The retained population plus four cooldown cohorts is the maximum history
  // that can affect a future arbitration. A terminal pressure-retired key is
  // kept only while submitted on consecutive ticks, so it occupies one of the
  // same bounded candidate cohorts rather than growing a lifetime-wide set.
  const historyCapacity = Math.max(
    1,
    totalMaximum * (SECONDARY_PARTICLE_REENTRY_COOLDOWN_TICKS + 1),
  );
  const historyKeyHigh = new Uint32Array(historyCapacity);
  const historyKeyLow = new Uint32Array(historyCapacity);
  const historyConsumer = new Uint32Array(historyCapacity);
  const historyLastRetained = new Float64Array(historyCapacity);
  const historyRetainedSince = new Float64Array(historyCapacity);
  const historyCooldownUntil = new Float64Array(historyCapacity);
  const historyPressureRetired = new Uint8Array(historyCapacity);
  const historyPoolSlot = new Uint32Array(historyCapacity);
  const historySubmittedTick = new Float64Array(historyCapacity);
  let historyCount = 0;

  // Same-tick allocation revisions are speculative views over one tick-start
  // history checkpoint. The journal stores each pre-existing record at most
  // once, so rollback remains bounded by the declared maximum request count
  // without copying the full multi-cohort history.
  const checkpointRecord = new Uint32Array(totalMaximum);
  const checkpointLastRetained = new Float64Array(totalMaximum);
  const checkpointRetainedSince = new Float64Array(totalMaximum);
  const checkpointCooldownUntil = new Float64Array(totalMaximum);
  const checkpointPressureRetired = new Uint8Array(totalMaximum);
  const checkpointPoolSlot = new Uint32Array(totalMaximum);
  const checkpointSubmittedTick = new Float64Array(totalMaximum);
  const checkpointRecordStamps = new Uint32Array(historyCapacity);
  let checkpointRecordGeneration = 1;
  let checkpointJournalCount = 0;
  let checkpointHistoryCount = 0;
  let checkpointPreviousResolvedTick = Number.NEGATIVE_INFINITY;
  let checkpointTick = -1;
  let checkpointContinuityRevision = -1;

  let hashCapacity = 1;
  while (hashCapacity < Math.max(4, historyCapacity * 2)) {
    hashCapacity *= 2;
  }
  const hashRecords = new Uint32Array(hashCapacity);
  const hashStamps = new Uint32Array(hashCapacity);
  const hashMask = hashCapacity - 1;
  let hashGeneration = 1;

  const slotStamps = new Uint32Array(plan.capacity);
  let slotGeneration = 1;
  const states: ConsumerState[] = [];
  const bindingsById = new Map<string, SecondaryParticleConsumerBinding>();
  const bindingOwner = Object.freeze({});
  let candidateOffset = 0;

  for (let index = 0; index < consumerCount; index += 1) {
    const declaration = plan.consumers[index];
    if (declaration === undefined) {
      throw new Error("Secondary-particle consumer declaration disappeared.");
    }
    const retainedCapacity = Math.min(
      declaration.maximumRequestCount,
      plan.capacity,
    );
    const receiptBacking = new Uint32Array(RECEIPT_FIELD_COUNT);
    const receipt = createReceiptView(receiptBacking);
    const retained: SecondaryParticleRetainedView = Object.freeze({
      count: new Uint32Array(1),
      stableKeyHigh: new Uint32Array(retainedCapacity),
      stableKeyLow: new Uint32Array(retainedCapacity),
      contributionsQ16: new Uint16Array(retainedCapacity),
      payloadHandles: new Uint32Array(retainedCapacity),
      poolSlots: new Uint32Array(retainedCapacity),
    });
    const binding: InternalConsumerBinding = Object.freeze({
      consumerId: declaration.consumerId,
      retained,
      receipt,
      [BINDING_OWNER]: bindingOwner,
      [BINDING_INDEX]: index,
    });
    states.push({
      id: declaration.consumerId,
      binding,
      receiptBacking,
      maximum: declaration.maximumRequestCount,
      floor: declaration.minimumRetainedSlots,
      softCeiling: declaration.softRequestCeiling,
      pressureReentryPolicy: declaration.pressureReentryPolicy,
      candidateOffset,
      candidateCount: 0,
      workRequested: 0,
      workVisible: 0,
      workCooldown: 0,
      workLifecycleReentryForbidden: 0,
      workFloor: 0,
      workResidence: 0,
      workGlobal: 0,
      workRetained: 0,
      workMinimum: 65_535,
      workMaximum: 0,
      workDropMask: 0,
    });
    bindingsById.set(declaration.consumerId, binding);
    candidateOffset += declaration.maximumRequestCount;
  }

  const globalReceiptBacking = new Uint32Array(RECEIPT_FIELD_COUNT);
  const globalReceipt = createReceiptView(globalReceiptBacking);
  const mutableFrame = {
    tick: -1,
    continuityRevision: -1,
    retainedCount: 0,
    globalReceipt,
  };
  const frame = mutableFrame as SecondaryParticlePoolFrame;
  let transaction: "idle" | "accepting" | "invalid" | "resolved" = "idle";
  let tick = -1;
  let continuityRevision = -1;
  let allocationRevision = -1;
  let resolvedAllocationRevision = -1;
  let previousResolvedTick = Number.NEGATIVE_INFINITY;
  let hasCurrent = false;

  function advanceHashGeneration(): void {
    hashGeneration += 1;
    if (hashGeneration === 0xffff_ffff) {
      hashStamps.fill(0);
      hashGeneration = 1;
    }
  }

  function rebuildHistory(): void {
    advanceHashGeneration();
    let write = 0;
    for (let read = 0; read < historyCount; read += 1) {
      const incumbent =
        previousResolvedTick !== Number.NEGATIVE_INFINITY &&
        historyLastRetained[read] === previousResolvedTick;
      const cooling = (historyCooldownUntil[read] ?? 0) > tick;
      const pressureRetiredLifecycle =
        historyPressureRetired[read] !== 0 &&
        historySubmittedTick[read] === previousResolvedTick;
      if (!incumbent && !cooling && !pressureRetiredLifecycle) {
        continue;
      }
      if (write !== read) {
        historyKeyHigh[write] = historyKeyHigh[read] ?? 0;
        historyKeyLow[write] = historyKeyLow[read] ?? 0;
        historyConsumer[write] = historyConsumer[read] ?? 0;
        historyLastRetained[write] = historyLastRetained[read] ?? 0;
        historyRetainedSince[write] = historyRetainedSince[read] ?? 0;
        historyCooldownUntil[write] = historyCooldownUntil[read] ?? 0;
        historyPressureRetired[write] = historyPressureRetired[read] ?? 0;
        historyPoolSlot[write] = historyPoolSlot[read] ?? EMPTY_SLOT;
        historySubmittedTick[write] = historySubmittedTick[read] ?? 0;
      }
      insertHash(write);
      write += 1;
    }
    historyCount = write;
  }

  function rebuildHistoryHash(): void {
    advanceHashGeneration();
    for (let record = 0; record < historyCount; record += 1) {
      insertHash(record);
    }
  }

  function openHistoryAttemptJournal(): void {
    checkpointRecordGeneration += 1;
    if (checkpointRecordGeneration === 0xffff_ffff) {
      checkpointRecordStamps.fill(0);
      checkpointRecordGeneration = 1;
    }
    checkpointJournalCount = 0;
  }

  function openHistoryCheckpoint(): void {
    openHistoryAttemptJournal();
    checkpointHistoryCount = historyCount;
    checkpointPreviousResolvedTick = previousResolvedTick;
    checkpointTick = tick;
    checkpointContinuityRevision = continuityRevision;
  }

  function journalHistoryRecord(record: number): void {
    if (
      record >= checkpointHistoryCount ||
      checkpointRecordStamps[record] === checkpointRecordGeneration
    ) {
      return;
    }
    if (checkpointJournalCount >= totalMaximum) {
      throw new RangeError(
        "Secondary-particle same-tick undo journal capacity was exceeded.",
      );
    }
    const journal = checkpointJournalCount;
    checkpointJournalCount += 1;
    checkpointRecordStamps[record] = checkpointRecordGeneration;
    checkpointRecord[journal] = record;
    checkpointLastRetained[journal] = historyLastRetained[record] ?? 0;
    checkpointRetainedSince[journal] = historyRetainedSince[record] ?? 0;
    checkpointCooldownUntil[journal] = historyCooldownUntil[record] ?? 0;
    checkpointPressureRetired[journal] = historyPressureRetired[record] ?? 0;
    checkpointPoolSlot[journal] = historyPoolSlot[record] ?? EMPTY_SLOT;
    checkpointSubmittedTick[journal] = historySubmittedTick[record] ?? 0;
  }

  function restoreHistoryCheckpoint(): void {
    if (
      checkpointTick !== tick ||
      checkpointContinuityRevision !== continuityRevision
    ) {
      throw new Error(
        "Secondary-particle same-tick history checkpoint disappeared.",
      );
    }
    for (let journal = 0; journal < checkpointJournalCount; journal += 1) {
      const record = checkpointRecord[journal] ?? 0;
      historyLastRetained[record] = checkpointLastRetained[journal] ?? 0;
      historyRetainedSince[record] = checkpointRetainedSince[journal] ?? 0;
      historyCooldownUntil[record] = checkpointCooldownUntil[journal] ?? 0;
      historyPressureRetired[record] = checkpointPressureRetired[journal] ?? 0;
      historyPoolSlot[record] = checkpointPoolSlot[journal] ?? EMPTY_SLOT;
      historySubmittedTick[record] = checkpointSubmittedTick[journal] ?? 0;
    }
    historyCount = checkpointHistoryCount;
    previousResolvedTick = checkpointPreviousResolvedTick;
    rebuildHistoryHash();
    openHistoryAttemptJournal();
  }

  function insertHash(record: number): void {
    let bucket =
      hashKey(historyKeyHigh[record] ?? 0, historyKeyLow[record] ?? 0) &
      hashMask;
    while (hashStamps[bucket] === hashGeneration) {
      bucket = (bucket + 1) & hashMask;
    }
    hashStamps[bucket] = hashGeneration;
    hashRecords[bucket] = record;
  }

  function findHistory(keyHigh: number, keyLow: number): number {
    let bucket = hashKey(keyHigh, keyLow) & hashMask;
    while (hashStamps[bucket] === hashGeneration) {
      const record = hashRecords[bucket] ?? 0;
      if (
        historyKeyHigh[record] === keyHigh &&
        historyKeyLow[record] === keyLow
      ) {
        return record;
      }
      bucket = (bucket + 1) & hashMask;
    }
    return -1;
  }

  function createHistory(
    consumerIndex: number,
    keyHigh: number,
    keyLow: number,
  ): number {
    if (historyCount >= historyCapacity) {
      throw new RangeError(
        "Secondary-particle hysteresis history capacity was exceeded.",
      );
    }
    const record = historyCount;
    historyCount += 1;
    historyConsumer[record] = consumerIndex;
    historyKeyHigh[record] = keyHigh;
    historyKeyLow[record] = keyLow;
    historyLastRetained[record] = Number.NEGATIVE_INFINITY;
    historyRetainedSince[record] = tick;
    historyCooldownUntil[record] = Number.NEGATIVE_INFINITY;
    historyPressureRetired[record] = 0;
    historyPoolSlot[record] = EMPTY_SLOT;
    historySubmittedTick[record] = Number.NEGATIVE_INFINITY;
    insertHash(record);
    return record;
  }

  function markInvalid(error: unknown): never {
    transaction = "invalid";
    throw error;
  }

  function sortEligible(count: number): Uint32Array {
    radixPassCandidates(
      orderA,
      orderB,
      count,
      0,
      0,
      radixCounts,
      candidateKeyHigh,
      candidateKeyLow,
      candidateEffective,
    );
    radixPassCandidates(
      orderB,
      orderA,
      count,
      16,
      0,
      radixCounts,
      candidateKeyHigh,
      candidateKeyLow,
      candidateEffective,
    );
    radixPassCandidates(
      orderA,
      orderB,
      count,
      0,
      1,
      radixCounts,
      candidateKeyHigh,
      candidateKeyLow,
      candidateEffective,
    );
    radixPassCandidates(
      orderB,
      orderA,
      count,
      16,
      1,
      radixCounts,
      candidateKeyHigh,
      candidateKeyLow,
      candidateEffective,
    );
    radixPassCandidates(
      orderA,
      orderB,
      count,
      0,
      2,
      radixCounts,
      candidateKeyHigh,
      candidateKeyLow,
      candidateEffective,
    );
    radixPassCandidates(
      orderB,
      orderA,
      count,
      16,
      2,
      radixCounts,
      candidateKeyHigh,
      candidateKeyLow,
      candidateEffective,
    );
    return orderA;
  }

  function select(candidate: number, route: SelectionRoute): boolean {
    if (candidateSelected[candidate] !== 0) {
      return false;
    }
    candidateSelected[candidate] = 1;
    const consumerIndex = candidateConsumer[candidate] ?? 0;
    const state = states[consumerIndex];
    if (state === undefined) {
      throw new Error("Secondary-particle consumer state disappeared.");
    }
    state.workRetained += 1;
    if (route === SELECTION_ROUTE_FLOOR) {
      state.workFloor += 1;
    } else if (route === SELECTION_ROUTE_RESIDENCE) {
      state.workResidence += 1;
    } else {
      state.workGlobal += 1;
    }
    return true;
  }

  const pool: SecondaryParticlePool = Object.freeze({
    consumer(consumerId: string) {
      const binding = bindingsById.get(consumerId);
      if (binding === undefined) {
        throw new RangeError(
          `Unknown secondary-particle consumer "${consumerId}".`,
        );
      }
      return binding;
    },
    beginTick(
      nextTick: number,
      nextContinuityRevision: number,
      nextAllocationRevision = 0,
    ) {
      assertNonnegativeInteger(nextTick, "tick");
      assertNonnegativeInteger(nextContinuityRevision, "continuityRevision");
      assertNonnegativeInteger(nextAllocationRevision, "allocationRevision");
      if (
        hasCurrent &&
        transaction === "resolved" &&
        nextTick === mutableFrame.tick &&
        nextContinuityRevision === mutableFrame.continuityRevision &&
        nextAllocationRevision === resolvedAllocationRevision
      ) {
        transaction = "resolved";
        return "reuse-current-tick";
      }
      if (
        nextTick === tick &&
        nextContinuityRevision === continuityRevision &&
        nextAllocationRevision !== allocationRevision
      ) {
        restoreHistoryCheckpoint();
        allocationRevision = nextAllocationRevision;
        for (let index = 0; index < consumerCount; index += 1) {
          const state = states[index];
          if (state !== undefined) {
            state.candidateCount = 0;
          }
        }
        transaction = "accepting";
        return "accepting-candidates";
      }
      const continuityChanged =
        hasCurrent && nextContinuityRevision !== continuityRevision;
      if (!continuityChanged && nextTick <= previousResolvedTick) {
        throw new RangeError(
          "Secondary-particle ticks must advance monotonically " +
            `(next={tick:${String(nextTick)},continuity:${String(nextContinuityRevision)}}; ` +
            `current={tick:${String(tick)},continuity:${String(continuityRevision)}}; ` +
            `previous={tick:${String(previousResolvedTick)},continuity:${String(mutableFrame.continuityRevision)}}).`,
        );
      }
      tick = nextTick;
      if (continuityChanged) {
        historyCount = 0;
        previousResolvedTick = Number.NEGATIVE_INFINITY;
      }
      continuityRevision = nextContinuityRevision;
      allocationRevision = nextAllocationRevision;
      rebuildHistory();
      openHistoryCheckpoint();
      for (let index = 0; index < consumerCount; index += 1) {
        const state = states[index];
        if (state !== undefined) {
          state.candidateCount = 0;
        }
      }
      transaction = "accepting";
      return "accepting-candidates";
    },
    submit(
      binding: SecondaryParticleConsumerBinding,
      batch: SecondaryParticleCandidateBatch,
    ) {
      if (transaction !== "accepting") {
        throw new Error("Secondary-particle pool is not accepting candidates.");
      }
      const internalBinding = binding as InternalConsumerBinding;
      if (internalBinding[BINDING_OWNER] !== bindingOwner) {
        markInvalid(
          new TypeError("Secondary-particle binding belongs to another pool."),
        );
      }
      const consumerIndex = internalBinding[BINDING_INDEX];
      const state = states[consumerIndex];
      if (state === undefined || state.binding !== binding) {
        markInvalid(
          new Error("Secondary-particle consumer state disappeared."),
        );
      }
      try {
        validateBatch(batch);
        if (state.candidateCount + batch.count > state.maximum) {
          throw new RangeError(
            `Secondary-particle consumer "${state.id}" exceeded maximumRequestCount.`,
          );
        }
        for (let index = 0; index < batch.count; index += 1) {
          const high = batch.stableKeyHigh[index] ?? 0;
          const low = batch.stableKeyLow[index] ?? 0;
          let record = findHistory(high, low);
          if (record < 0) {
            record = createHistory(consumerIndex, high, low);
          }
          if (historyConsumer[record] !== consumerIndex) {
            throw new TypeError(
              "Duplicate secondary-particle stable key across consumers.",
            );
          }
          if (historySubmittedTick[record] === tick) {
            throw new TypeError("Duplicate secondary-particle stable key.");
          }
          journalHistoryRecord(record);
          historySubmittedTick[record] = tick;
          const candidate = state.candidateOffset + state.candidateCount;
          state.candidateCount += 1;
          candidateKeyHigh[candidate] = high;
          candidateKeyLow[candidate] = low;
          candidateContribution[candidate] = batch.contributionsQ16[index] ?? 0;
          candidatePayload[candidate] = batch.payloadHandles[index] ?? 0;
          candidateConsumer[candidate] = consumerIndex;
          candidateHistory[candidate] = record;
        }
      } catch (error) {
        markInvalid(error);
      }
    },
    resolve() {
      if (transaction === "invalid") {
        throw new Error("Secondary-particle transaction is invalid.");
      }
      if (transaction === "resolved") {
        if (!hasCurrent) {
          throw new Error("Secondary-particle pool has no resolved frame.");
        }
        return frame;
      }
      if (transaction !== "accepting") {
        throw new Error("Secondary-particle pool has no active transaction.");
      }

      candidateSelected.fill(0);
      candidateReentryBlock.fill(0);
      let eligibleCount = 0;
      let totalRequested = 0;
      let totalVisible = 0;
      let totalCooldown = 0;
      let totalLifecycleReentryForbidden = 0;
      for (
        let consumerIndex = 0;
        consumerIndex < consumerCount;
        consumerIndex += 1
      ) {
        const state = states[consumerIndex];
        if (state === undefined) continue;
        state.workRequested = state.candidateCount;
        state.workVisible = 0;
        state.workCooldown = 0;
        state.workLifecycleReentryForbidden = 0;
        state.workFloor = 0;
        state.workResidence = 0;
        state.workGlobal = 0;
        state.workRetained = 0;
        state.workMinimum = 65_535;
        state.workMaximum = 0;
        state.workDropMask = 0;
        totalRequested += state.candidateCount;
        for (let local = 0; local < state.candidateCount; local += 1) {
          const candidate = state.candidateOffset + local;
          const contribution = candidateContribution[candidate] ?? 0;
          if (contribution === 0) {
            state.workDropMask |= SECONDARY_PARTICLE_DROP_INVISIBLE_OR_OCCLUDED;
            continue;
          }
          state.workVisible += 1;
          totalVisible += 1;
          if (contribution < state.workMinimum)
            state.workMinimum = contribution;
          if (contribution > state.workMaximum)
            state.workMaximum = contribution;
          const record = candidateHistory[candidate] ?? 0;
          const incumbent =
            previousResolvedTick !== Number.NEGATIVE_INFINITY &&
            historyLastRetained[record] === previousResolvedTick;
          if (historyPressureRetired[record] !== 0) {
            candidateReentryBlock[candidate] = REENTRY_LIFECYCLE_FORBIDDEN;
          } else if (!incumbent && (historyCooldownUntil[record] ?? 0) > tick) {
            candidateReentryBlock[candidate] = REENTRY_SHARED_COOLDOWN;
          }
          candidateEffective[candidate] = Math.min(
            MAX_EFFECTIVE_CONTRIBUTION,
            contribution +
              (incumbent ? SECONDARY_PARTICLE_RETAINED_Q16_BONUS : 0),
          );
          orderA[eligibleCount] = candidate;
          eligibleCount += 1;
        }
      }

      const sorted = sortEligible(eligibleCount);
      let retainedCount = 0;
      // Floors precede every incumbent privilege so a newly visible consumer
      // cannot be reduced to zero by another consumer's residence lock.
      for (
        let consumerIndex = 0;
        consumerIndex < consumerCount;
        consumerIndex += 1
      ) {
        const state = states[consumerIndex];
        if (state === undefined) continue;
        let needed = Math.max(
          0,
          Math.min(state.floor, state.workVisible) - state.workRetained,
        );
        // Fill the guarantee from normally eligible candidates first. Shared
        // cooldown is bypassed only when it would otherwise leave the
        // consumer below its floor; terminal lifecycle retirements stay out.
        for (
          let order = eligibleCount - 1;
          order >= 0 && needed > 0 && retainedCount < plan.capacity;
          order -= 1
        ) {
          const candidate = sorted[order] ?? 0;
          if (
            candidateConsumer[candidate] === consumerIndex &&
            candidateReentryBlock[candidate] === REENTRY_ALLOWED &&
            select(candidate, SELECTION_ROUTE_FLOOR)
          ) {
            retainedCount += 1;
            needed -= 1;
          }
        }
        for (
          let order = eligibleCount - 1;
          order >= 0 && needed > 0 && retainedCount < plan.capacity;
          order -= 1
        ) {
          const candidate = sorted[order] ?? 0;
          if (
            candidateConsumer[candidate] === consumerIndex &&
            candidateReentryBlock[candidate] === REENTRY_SHARED_COOLDOWN &&
            select(candidate, SELECTION_ROUTE_FLOOR)
          ) {
            retainedCount += 1;
            needed -= 1;
          }
        }
      }
      // Minimum residence is stronger than global contribution pressure, but
      // never stronger than floors and never exceeds the hard pool capacity.
      for (
        let order = eligibleCount - 1;
        order >= 0 && retainedCount < plan.capacity;
        order -= 1
      ) {
        const candidate = sorted[order] ?? 0;
        const record = candidateHistory[candidate] ?? 0;
        if (
          candidateReentryBlock[candidate] === REENTRY_ALLOWED &&
          previousResolvedTick !== Number.NEGATIVE_INFINITY &&
          historyLastRetained[record] === previousResolvedTick &&
          tick - (historyRetainedSince[record] ?? tick) <
            SECONDARY_PARTICLE_MINIMUM_RESIDENCE_TICKS &&
          select(candidate, SELECTION_ROUTE_RESIDENCE)
        ) {
          retainedCount += 1;
        }
      }
      // Unused floors are deliberately lent to the one global contribution
      // competition; soft ceilings are diagnostics, never quotas.
      for (
        let order = eligibleCount - 1;
        order >= 0 && retainedCount < plan.capacity;
        order -= 1
      ) {
        const candidate = sorted[order] ?? 0;
        if (
          candidateReentryBlock[candidate] === REENTRY_ALLOWED &&
          select(candidate, SELECTION_ROUTE_GLOBAL)
        ) {
          retainedCount += 1;
        }
      }

      slotGeneration += 1;
      if (slotGeneration === 0xffff_ffff) {
        slotStamps.fill(0);
        slotGeneration = 1;
      }
      for (let index = 0; index < eligibleCount; index += 1) {
        const candidate = sorted[index] ?? 0;
        if (candidateSelected[candidate] === 0) continue;
        const record = candidateHistory[candidate] ?? 0;
        if (
          previousResolvedTick !== Number.NEGATIVE_INFINITY &&
          historyLastRetained[record] === previousResolvedTick
        ) {
          const slot = historyPoolSlot[record] ?? EMPTY_SLOT;
          if (slot !== EMPTY_SLOT) slotStamps[slot] = slotGeneration;
        }
      }
      let nextFreeSlot = 0;
      for (let order = eligibleCount - 1; order >= 0; order -= 1) {
        const candidate = sorted[order] ?? 0;
        if (candidateSelected[candidate] === 0) continue;
        const record = candidateHistory[candidate] ?? 0;
        if (
          previousResolvedTick === Number.NEGATIVE_INFINITY ||
          historyLastRetained[record] !== previousResolvedTick
        ) {
          while (slotStamps[nextFreeSlot] === slotGeneration) nextFreeSlot += 1;
          journalHistoryRecord(record);
          historyPoolSlot[record] = nextFreeSlot;
          slotStamps[nextFreeSlot] = slotGeneration;
        }
      }

      for (
        let consumerIndex = 0;
        consumerIndex < consumerCount;
        consumerIndex += 1
      ) {
        const state = states[consumerIndex];
        if (state === undefined) continue;
        let output = 0;
        for (let order = eligibleCount - 1; order >= 0; order -= 1) {
          const candidate = sorted[order] ?? 0;
          if (
            candidateSelected[candidate] === 0 ||
            candidateConsumer[candidate] !== consumerIndex
          )
            continue;
          const record = candidateHistory[candidate] ?? 0;
          state.binding.retained.stableKeyHigh[output] =
            candidateKeyHigh[candidate] ?? 0;
          state.binding.retained.stableKeyLow[output] =
            candidateKeyLow[candidate] ?? 0;
          state.binding.retained.contributionsQ16[output] =
            candidateContribution[candidate] ?? 0;
          state.binding.retained.payloadHandles[output] =
            candidatePayload[candidate] ?? 0;
          state.binding.retained.poolSlots[output] =
            historyPoolSlot[record] ?? 0;
          const incumbent =
            previousResolvedTick !== Number.NEGATIVE_INFINITY &&
            historyLastRetained[record] === previousResolvedTick;
          journalHistoryRecord(record);
          if (!incumbent) historyRetainedSince[record] = tick;
          historyLastRetained[record] = tick;
          historyCooldownUntil[record] = Number.NEGATIVE_INFINITY;
          output += 1;
        }
        state.binding.retained.count[0] = output;
        for (let local = 0; local < state.candidateCount; local += 1) {
          const candidate = state.candidateOffset + local;
          if (
            (candidateContribution[candidate] ?? 0) > 0 &&
            candidateSelected[candidate] === 0
          ) {
            const record = candidateHistory[candidate] ?? 0;
            if (candidateReentryBlock[candidate] === REENTRY_SHARED_COOLDOWN) {
              state.workCooldown += 1;
              totalCooldown += 1;
              state.workDropMask |= SECONDARY_PARTICLE_DROP_REENTRY_COOLDOWN;
            } else if (
              candidateReentryBlock[candidate] === REENTRY_LIFECYCLE_FORBIDDEN
            ) {
              state.workLifecycleReentryForbidden += 1;
              totalLifecycleReentryForbidden += 1;
              state.workDropMask |=
                SECONDARY_PARTICLE_DROP_LIFECYCLE_REENTRY_FORBIDDEN;
            }
            if (
              candidateReentryBlock[candidate] === REENTRY_ALLOWED &&
              state.pressureReentryPolicy === "forbidden-until-absent"
            ) {
              journalHistoryRecord(record);
              historyPressureRetired[record] = 1;
            } else if (
              candidateReentryBlock[candidate] === REENTRY_ALLOWED &&
              (historyCooldownUntil[record] ?? 0) <= tick
            ) {
              journalHistoryRecord(record);
              historyCooldownUntil[record] =
                tick + SECONDARY_PARTICLE_REENTRY_COOLDOWN_TICKS;
            }
          }
        }
        const thinned = Math.max(
          0,
          state.workVisible -
            state.workCooldown -
            state.workLifecycleReentryForbidden -
            state.workRetained,
        );
        if (thinned > 0) {
          state.workDropMask |=
            SECONDARY_PARTICLE_DROP_GLOBAL_CONTRIBUTION_PRESSURE;
        }
        writeReceipt(
          state.receiptBacking,
          state.workRequested,
          Math.max(0, state.workRequested - state.softCeiling),
          state.workRetained,
          state.workFloor,
          state.workResidence,
          state.workGlobal,
          thinned,
          state.workRequested - state.workVisible,
          state.workCooldown,
          state.workLifecycleReentryForbidden,
          state.workVisible === 0 ? 0 : state.workMinimum,
          state.workMaximum,
          state.workDropMask,
        );
      }

      let floorRetained = 0;
      let residenceRetained = 0;
      let globalRetained = 0;
      let requestedAboveSoftCeiling = 0;
      let invisibleOrOccluded = 0;
      let thinned = 0;
      let contributionMinimumQ16 = 65_535;
      let contributionMaximumQ16 = 0;
      let dropReasonMask = 0;
      for (let index = 0; index < consumerCount; index += 1) {
        const state = states[index];
        if (state === undefined) continue;
        const receipt = state.receiptBacking;
        floorRetained += receipt[RECEIPT_FLOOR_RETAINED] ?? 0;
        residenceRetained += receipt[RECEIPT_RESIDENCE_RETAINED] ?? 0;
        globalRetained += receipt[RECEIPT_GLOBAL_RETAINED] ?? 0;
        requestedAboveSoftCeiling += receipt[RECEIPT_ABOVE_SOFT_CEILING] ?? 0;
        invisibleOrOccluded += receipt[RECEIPT_INVISIBLE] ?? 0;
        thinned += receipt[RECEIPT_THINNED] ?? 0;
        dropReasonMask |= receipt[RECEIPT_DROP_MASK] ?? 0;
        if (state.workVisible > 0) {
          contributionMinimumQ16 = Math.min(
            contributionMinimumQ16,
            receipt[RECEIPT_MINIMUM] ?? 0,
          );
          contributionMaximumQ16 = Math.max(
            contributionMaximumQ16,
            receipt[RECEIPT_MAXIMUM] ?? 0,
          );
        }
      }
      writeReceipt(
        globalReceiptBacking,
        totalRequested,
        requestedAboveSoftCeiling,
        retainedCount,
        floorRetained,
        residenceRetained,
        globalRetained,
        thinned,
        invisibleOrOccluded,
        totalCooldown,
        totalLifecycleReentryForbidden,
        totalVisible === 0 ? 0 : contributionMinimumQ16,
        contributionMaximumQ16,
        dropReasonMask,
      );
      mutableFrame.tick = tick;
      mutableFrame.continuityRevision = continuityRevision;
      mutableFrame.retainedCount = retainedCount;
      previousResolvedTick = tick;
      resolvedAllocationRevision = allocationRevision;
      hasCurrent = true;
      transaction = "resolved";
      return frame;
    },
    current() {
      if (!hasCurrent) {
        throw new Error("Secondary-particle pool has no current frame.");
      }
      return frame;
    },
  });
  return pool;
}

function validatePlan(plan: SecondaryParticlePoolPlan): {
  readonly capacity: number;
  readonly consumers: readonly SecondaryParticleConsumerPlan[];
} {
  if (plan.capacity !== MAX_SECONDARY_PARTICLES) {
    throw new RangeError(
      `Secondary-particle pool capacity must be ${MAX_SECONDARY_PARTICLES}.`,
    );
  }
  if (
    plan.contribution.projectedAreaReference !== "output-drawing-buffer" ||
    plan.contribution.quantization !== "q16-unorm-round-nearest" ||
    plan.contribution.screenAreaDivisor !==
      SECONDARY_PARTICLE_CONTRIBUTION_SCREEN_AREA_DIVISOR
  ) {
    throw new TypeError(
      "Secondary-particle contribution contract does not match the shared Q16 output ruler.",
    );
  }
  assertResolution(
    {
      width: plan.contribution.referenceWidth,
      height: plan.contribution.referenceHeight,
    },
    "contribution reference",
  );
  if (
    plan.hysteresis.mode !== "incumbent-bonus-residence-cooldown" ||
    plan.hysteresis.retainedContributionBonusQ16 !==
      SECONDARY_PARTICLE_RETAINED_Q16_BONUS ||
    plan.hysteresis.minimumResidenceTicks !==
      SECONDARY_PARTICLE_MINIMUM_RESIDENCE_TICKS ||
    plan.hysteresis.reentryCooldownTicks !==
      SECONDARY_PARTICLE_REENTRY_COOLDOWN_TICKS
  ) {
    throw new TypeError(
      "Secondary-particle hysteresis contract does not match the shared policy.",
    );
  }
  if (plan.consumers.length === 0) {
    throw new RangeError(
      "Secondary-particle pool must declare at least one consumer.",
    );
  }
  const consumers = plan.consumers.map((consumer) => {
    if (
      consumer.consumerId.length === 0 ||
      consumer.consumerId !== consumer.consumerId.trim() ||
      consumer.consumerId !== consumer.consumerId.normalize("NFC")
    ) {
      throw new TypeError(
        "Secondary-particle consumerId must be a canonical non-empty string.",
      );
    }
    if (
      consumer.contributionReference.space !== "output-drawing-buffer" ||
      consumer.contributionReference.width !==
        plan.contribution.referenceWidth ||
      consumer.contributionReference.height !==
        plan.contribution.referenceHeight
    ) {
      throw new TypeError(
        `Secondary-particle consumer "${consumer.consumerId}" uses a different contribution ruler.`,
      );
    }
    assertPositiveInteger(consumer.maximumRequestCount, "maximumRequestCount");
    assertPositiveInteger(
      consumer.minimumRetainedSlots,
      "minimumRetainedSlots",
    );
    assertNonnegativeInteger(consumer.softRequestCeiling, "softRequestCeiling");
    if (consumer.minimumRetainedSlots > consumer.softRequestCeiling) {
      throw new RangeError(
        "minimumRetainedSlots cannot exceed softRequestCeiling.",
      );
    }
    if (consumer.softRequestCeiling > consumer.maximumRequestCount) {
      throw new RangeError(
        "softRequestCeiling cannot exceed maximumRequestCount.",
      );
    }
    if (
      consumer.pressureReentryPolicy !== "after-shared-cooldown" &&
      consumer.pressureReentryPolicy !== "forbidden-until-absent"
    ) {
      throw new TypeError(
        "pressureReentryPolicy must be after-shared-cooldown or forbidden-until-absent.",
      );
    }
    return Object.freeze({
      consumerId: consumer.consumerId,
      contributionReference: Object.freeze({
        ...consumer.contributionReference,
      }),
      maximumRequestCount: consumer.maximumRequestCount,
      minimumRetainedSlots: consumer.minimumRetainedSlots,
      softRequestCeiling: consumer.softRequestCeiling,
      pressureReentryPolicy: consumer.pressureReentryPolicy,
    });
  });
  consumers.sort((left, right) =>
    left.consumerId < right.consumerId
      ? -1
      : left.consumerId > right.consumerId
        ? 1
        : 0,
  );
  let declaredFloorSlots = 0;
  let declaredMaximumRequests = 0;
  for (const consumer of consumers) {
    declaredFloorSlots += consumer.minimumRetainedSlots;
    declaredMaximumRequests += consumer.maximumRequestCount;
  }
  if (declaredFloorSlots > plan.capacity) {
    throw new RangeError(
      "Secondary-particle consumer floors cannot exceed the shared capacity.",
    );
  }
  if (
    !Number.isSafeInteger(declaredMaximumRequests) ||
    declaredMaximumRequests * (SECONDARY_PARTICLE_REENTRY_COOLDOWN_TICKS + 1) >
      0xffff_ffff
  ) {
    throw new RangeError(
      "Secondary-particle declared request bounds exceed allocator addressability.",
    );
  }
  for (let index = 1; index < consumers.length; index += 1) {
    if (consumers[index - 1]?.consumerId === consumers[index]?.consumerId) {
      throw new TypeError(
        `Duplicate secondary-particle consumerId "${consumers[index]?.consumerId}".`,
      );
    }
  }
  return Object.freeze({
    capacity: plan.capacity,
    consumers: Object.freeze(consumers),
  });
}

function validateBatch(batch: SecondaryParticleCandidateBatch): void {
  assertNonnegativeInteger(batch.count, "candidate count");
  if (!(batch.stableKeyHigh instanceof Uint32Array)) {
    throw new TypeError("stableKeyHigh must be a Uint32Array.");
  }
  if (!(batch.stableKeyLow instanceof Uint32Array)) {
    throw new TypeError("stableKeyLow must be a Uint32Array.");
  }
  if (!(batch.contributionsQ16 instanceof Uint16Array)) {
    throw new TypeError("contributionsQ16 must be a Uint16Array.");
  }
  if (!(batch.payloadHandles instanceof Uint32Array)) {
    throw new TypeError("payloadHandles must be a Uint32Array.");
  }
  if (
    batch.stableKeyHigh.length < batch.count ||
    batch.stableKeyLow.length < batch.count ||
    batch.contributionsQ16.length < batch.count ||
    batch.payloadHandles.length < batch.count
  ) {
    throw new RangeError(
      "Secondary-particle candidate batch arrays are shorter than count.",
    );
  }
}

function createReceiptView(
  backing: Uint32Array,
): SecondaryParticleConsumerReceipt {
  const contributionRange: SecondaryParticleContributionRange = Object.freeze({
    get minimumQ16() {
      return backing[RECEIPT_MINIMUM] ?? 0;
    },
    get maximumQ16() {
      return backing[RECEIPT_MAXIMUM] ?? 0;
    },
  });
  return Object.freeze({
    get requested() {
      return backing[RECEIPT_REQUESTED] ?? 0;
    },
    get requestedAboveSoftCeiling() {
      return backing[RECEIPT_ABOVE_SOFT_CEILING] ?? 0;
    },
    get retained() {
      return backing[RECEIPT_RETAINED] ?? 0;
    },
    get floorRetained() {
      return backing[RECEIPT_FLOOR_RETAINED] ?? 0;
    },
    get residenceRetained() {
      return backing[RECEIPT_RESIDENCE_RETAINED] ?? 0;
    },
    get globalRetained() {
      return backing[RECEIPT_GLOBAL_RETAINED] ?? 0;
    },
    get thinned() {
      return backing[RECEIPT_THINNED] ?? 0;
    },
    get invisibleOrOccluded() {
      return backing[RECEIPT_INVISIBLE] ?? 0;
    },
    get reentryCooldown() {
      return backing[RECEIPT_COOLDOWN] ?? 0;
    },
    get lifecycleReentryForbidden() {
      return backing[RECEIPT_LIFECYCLE_REENTRY_FORBIDDEN] ?? 0;
    },
    get contributionMinimumQ16() {
      return backing[RECEIPT_MINIMUM] ?? 0;
    },
    get contributionMaximumQ16() {
      return backing[RECEIPT_MAXIMUM] ?? 0;
    },
    contributionRange,
    get dropReasonMask() {
      return backing[RECEIPT_DROP_MASK] ?? 0;
    },
  });
}

function writeReceipt(
  target: Uint32Array,
  requested: number,
  requestedAboveSoftCeiling: number,
  retained: number,
  floorRetained: number,
  residenceRetained: number,
  globalRetained: number,
  thinned: number,
  invisibleOrOccluded: number,
  reentryCooldown: number,
  lifecycleReentryForbidden: number,
  contributionMinimumQ16: number,
  contributionMaximumQ16: number,
  dropReasonMask: number,
): void {
  target[RECEIPT_REQUESTED] = requested;
  target[RECEIPT_ABOVE_SOFT_CEILING] = requestedAboveSoftCeiling;
  target[RECEIPT_RETAINED] = retained;
  target[RECEIPT_FLOOR_RETAINED] = floorRetained;
  target[RECEIPT_RESIDENCE_RETAINED] = residenceRetained;
  target[RECEIPT_GLOBAL_RETAINED] = globalRetained;
  target[RECEIPT_THINNED] = thinned;
  target[RECEIPT_INVISIBLE] = invisibleOrOccluded;
  target[RECEIPT_COOLDOWN] = reentryCooldown;
  target[RECEIPT_LIFECYCLE_REENTRY_FORBIDDEN] = lifecycleReentryForbidden;
  target[RECEIPT_MINIMUM] = contributionMinimumQ16;
  target[RECEIPT_MAXIMUM] = contributionMaximumQ16;
  target[RECEIPT_DROP_MASK] = dropReasonMask;
}

function radixPassCandidates(
  source: Uint32Array,
  target: Uint32Array,
  count: number,
  shift: number,
  field: 0 | 1 | 2,
  radixCounts: Uint32Array,
  keyHigh: Uint32Array,
  keyLow: Uint32Array,
  effectiveContribution: Uint32Array,
): void {
  radixCounts.fill(0);
  for (let index = 0; index < count; index += 1) {
    const candidate = source[index] ?? 0;
    const value =
      field === 2
        ? (effectiveContribution[candidate] ?? 0)
        : field === 0
          ? ~(keyLow[candidate] ?? 0)
          : ~(keyHigh[candidate] ?? 0);
    const bucket = (value >>> shift) & 0xffff;
    radixCounts[bucket] = (radixCounts[bucket] ?? 0) + 1;
  }
  let offset = 0;
  for (let bucket = 0; bucket < 65_536; bucket += 1) {
    const amount = radixCounts[bucket] ?? 0;
    radixCounts[bucket] = offset;
    offset += amount;
  }
  for (let index = 0; index < count; index += 1) {
    const candidate = source[index] ?? 0;
    const value =
      field === 2
        ? (effectiveContribution[candidate] ?? 0)
        : field === 0
          ? ~(keyLow[candidate] ?? 0)
          : ~(keyHigh[candidate] ?? 0);
    const bucket = (value >>> shift) & 0xffff;
    const destination = radixCounts[bucket] ?? 0;
    target[destination] = candidate;
    radixCounts[bucket] = destination + 1;
  }
}

function hashKey(high: number, low: number): number {
  let value = (low ^ Math.imul(high, 0x9e37_79b1) ^ 0x85eb_ca6b) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb_352d) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}

function assertResolution(
  value: SecondaryParticleResolution,
  label: string,
): void {
  assertPositiveInteger(value.width, `${label} width`);
  assertPositiveInteger(value.height, `${label} height`);
}

function assertFiniteNonnegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and nonnegative.`);
  }
}

function assertUnitFactor(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be in [0, 1].`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
}

function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative integer.`);
  }
}
