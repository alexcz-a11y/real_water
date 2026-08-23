import type { BodyWakeUpdateReceipt } from "../body-physics.js";
import type {
  DirectionalWakeDisturbanceBatch,
  GameplayQueryBatch,
  HostSimulationState,
  InteractionAnchor,
  RadialImpactDisturbanceBatch,
} from "../runtime.js";
import {
  INTERACTION_FIELD_EDGE_FADE_METRES,
  INTERACTION_FIELD_RADIUS_METRES,
  MAX_ACTIVE_DISTURBANCES,
} from "../capabilities.js";

export const RADIAL_IMPACT_LIFETIME_SECONDS = 2;
export const MIN_RADIAL_IMPACT_RADIUS_METRES = 0.000_1;
export const MAX_RADIAL_IMPACT_RADIUS_METRES = 48;
export const MAX_RADIAL_IMPACT_AMPLITUDE_METRES = 4;
export const LOCAL_INTERACTION_KIND_RADIAL_IMPACT = 0;
export const LOCAL_INTERACTION_KIND_DIRECTIONAL_WAKE = 1;
export const LOCAL_INTERACTION_KIND_PROPELLER_WASH = 2;
export const PERSISTENT_BODY_WAKE_START_TIME_SECONDS = -1;
export const DIRECTIONAL_WAKE_LENGTH_RADIUS_MULTIPLIER = 4;
export const PROPELLER_WASH_LENGTH_RADIUS_MULTIPLIER = 6;
export const DIRECTIONAL_WAKE_WIDTH_RADIUS_MULTIPLIER = 1;
export const PROPELLER_WASH_WIDTH_RADIUS_MULTIPLIER = 0.65;
export const DIRECTIONAL_WAKE_HEIGHT_SCALE = 0.35;
export const PROPELLER_WASH_HEIGHT_SCALE = 0.25;
export const DIRECTIONAL_WAKE_SPATIAL_RADIANS = Math.PI * 0.75;
export const PROPELLER_WASH_SPATIAL_RADIANS = Math.PI * 1.5;
export const DIRECTIONAL_WAKE_TEMPORAL_RADIANS_PER_SECOND = Math.PI;
export const PROPELLER_WASH_TEMPORAL_RADIANS_PER_SECOND = Math.PI * 4;
const FIXED_TICK_SECONDS = 1 / 60;

type LocalInteractionRenderKind =
  "radial-impact" | "directional-wake" | "propeller-wash";

interface ActiveDisturbanceBase {
  readonly kind: LocalInteractionRenderKind;
  readonly x: number;
  readonly z: number;
  readonly directionX: number;
  readonly directionZ: number;
  readonly radius: number;
  readonly amplitude: number;
  readonly priority: number;
  readonly startTimeSeconds: number;
  readonly sequence: number;
}

interface ActiveManualDisturbance extends ActiveDisturbanceBase {
  readonly origin: "manual";
  readonly id: number;
  readonly kind: "radial-impact" | "directional-wake";
}

interface ActiveBodyWake extends ActiveDisturbanceBase {
  readonly origin: "body";
  readonly attachmentId: number;
  readonly socketId: string;
  readonly kind: "directional-wake" | "propeller-wash";
}

type ActiveDisturbance = ActiveManualDisturbance | ActiveBodyWake;

export interface BodyWakeSource {
  readonly socketId: string;
  readonly kind: "bow" | "stern" | "propeller" | "wake";
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly directionX: number;
  readonly directionZ: number;
  readonly radius: number;
  readonly amplitude: number;
  readonly priority: number;
}

export interface LocalInteractionRenderImpact {
  readonly kind: LocalInteractionRenderKind;
  readonly x: number;
  readonly z: number;
  readonly directionX: number;
  readonly directionZ: number;
  readonly radius: number;
  readonly amplitude: number;
  readonly startTimeSeconds: number;
}

export interface LocalInteractionRenderSnapshot {
  readonly revision: number;
  readonly anchorX: number;
  readonly anchorZ: number;
  readonly impacts: readonly LocalInteractionRenderImpact[];
}

interface DisturbanceSubmissionReceipt {
  readonly tick: number;
  readonly acceptedDisturbanceIds: readonly number[];
  readonly droppedDisturbanceIds: readonly number[];
  readonly activeDisturbanceCount: number;
}

export interface LocalInteractionField {
  updateAnchor(
    anchor: InteractionAnchor,
    state: HostSimulationState,
  ): Readonly<{
    anchor: InteractionAnchor;
    changed: boolean;
    revision: number;
  }>;
  submitRadialImpacts(
    batch: RadialImpactDisturbanceBatch,
    state: HostSimulationState,
  ): Readonly<DisturbanceSubmissionReceipt>;
  submitDirectionalWakes(
    batch: DirectionalWakeDisturbanceBatch,
    state: HostSimulationState,
  ): Readonly<DisturbanceSubmissionReceipt>;
  updateBodyWakes(
    attachmentId: number,
    sources: readonly BodyWakeSource[],
    state: HostSimulationState,
  ): BodyWakeUpdateReceipt;
  removeBodyWakes(attachmentId: number): void;
  applyQueries(batch: GameplayQueryBatch, state: HostSimulationState): 0 | 1;
  inspect(state: HostSimulationState): Readonly<{
    anchor: InteractionAnchor;
    revision: number;
    activeBodyWakeCount: number;
    activeDisturbanceCount: number;
  }>;
  renderRevision(): number;
  renderSnapshot(): LocalInteractionRenderSnapshot;
}

export function createLocalInteractionField(
  initial: HostSimulationState,
): LocalInteractionField {
  let anchorX = initial.originX;
  let anchorZ = initial.originZ;
  let anchorRevision = 0;
  let lastSeed = initial.seed;
  let lastTick = initial.tick;
  let lastTimeSeconds = initial.timeSeconds;
  let lastResetRevision = initial.simulationResetRevision;
  let nextSequence = 0;
  let renderRevision = 0;
  const disturbances: Array<ActiveDisturbance | null> = Array.from(
    { length: MAX_ACTIVE_DISTURBANCES },
    () => null,
  );
  const querySnapshotDisturbances: Array<ActiveDisturbance | null> = Array.from(
    { length: MAX_ACTIVE_DISTURBANCES },
    () => null,
  );
  let querySnapshotManualTick: number | null = null;
  let querySnapshotBodyTick: number | null = null;
  let querySnapshotManualTimeSeconds = initial.timeSeconds;
  let querySnapshotBodyTimeSeconds = initial.timeSeconds;
  let querySnapshotAnchorX = anchorX;
  let querySnapshotAnchorZ = anchorZ;

  const publishFullQuerySnapshot = (
    tick: number,
    timeSeconds: number,
  ): void => {
    querySnapshotDisturbances.fill(null);
    let writeIndex = 0;
    for (const disturbance of disturbances) {
      if (disturbance !== null && isActiveAtTime(disturbance, timeSeconds)) {
        querySnapshotDisturbances[writeIndex] = disturbance;
        writeIndex += 1;
      }
    }
    querySnapshotManualTick = querySnapshotDisturbances.some(
      (disturbance) => disturbance?.origin === "manual",
    )
      ? tick
      : null;
    querySnapshotBodyTick = querySnapshotDisturbances.some(
      (disturbance) => disturbance?.origin === "body",
    )
      ? tick
      : null;
    querySnapshotManualTimeSeconds = timeSeconds;
    querySnapshotBodyTimeSeconds = timeSeconds;
    querySnapshotAnchorX = anchorX;
    querySnapshotAnchorZ = anchorZ;
  };

  const publishImmediateManualSnapshot = (
    tick: number,
    timeSeconds: number,
  ): void => {
    const manual = disturbances.filter(
      (disturbance): disturbance is ActiveManualDisturbance =>
        disturbance?.origin === "manual" &&
        isActiveAtTime(disturbance, timeSeconds),
    );
    const bodyCapacity = MAX_ACTIVE_DISTURBANCES - manual.length;
    const previousBody = querySnapshotDisturbances
      .filter(
        (disturbance): disturbance is ActiveBodyWake =>
          disturbance?.origin === "body",
      )
      .sort(compareHigherPriorityFirst)
      .slice(0, bodyCapacity);
    querySnapshotDisturbances.fill(null);
    let writeIndex = 0;
    for (const disturbance of [...previousBody, ...manual]) {
      querySnapshotDisturbances[writeIndex] = disturbance;
      writeIndex += 1;
    }
    querySnapshotManualTick = manual.length > 0 ? tick : null;
    querySnapshotManualTimeSeconds = timeSeconds;
    if (previousBody.length === 0) {
      querySnapshotBodyTick = null;
    }
    querySnapshotAnchorX = anchorX;
    querySnapshotAnchorZ = anchorZ;
  };

  const observe = (state: HostSimulationState): void => {
    const reset =
      state.seed !== lastSeed ||
      state.tick < lastTick ||
      state.timeSeconds < lastTimeSeconds ||
      state.simulationResetRevision !== lastResetRevision;
    if (reset) {
      if (activeDisturbanceCount(disturbances) > 0) {
        disturbances.fill(null);
        renderRevision += 1;
      }
      querySnapshotDisturbances.fill(null);
      querySnapshotManualTick = null;
      querySnapshotBodyTick = null;
      querySnapshotManualTimeSeconds = state.timeSeconds;
      querySnapshotBodyTimeSeconds = state.timeSeconds;
      querySnapshotAnchorX = anchorX;
      querySnapshotAnchorZ = anchorZ;
      nextSequence = 0;
    } else if (state.tick > lastTick) {
      publishFullQuerySnapshot(
        state.tick - 1,
        Math.max(0, state.timeSeconds - FIXED_TICK_SECONDS),
      );
    }
    lastSeed = state.seed;
    lastTick = state.tick;
    lastTimeSeconds = state.timeSeconds;
    lastResetRevision = state.simulationResetRevision;
    if (removeExpiredManualDisturbances(disturbances, state.timeSeconds)) {
      renderRevision += 1;
    }
  };

  const submitManualDisturbances = (
    submitted: readonly ActiveManualDisturbance[],
    state: HostSimulationState,
  ): Readonly<DisturbanceSubmissionReceipt> => {
    const activeIdsBeforeSubmission = new Set(
      disturbances.flatMap((disturbance) =>
        disturbance?.origin === "manual" ? [disturbance.id] : [],
      ),
    );
    for (const disturbance of submitted) {
      if (activeIdsBeforeSubmission.has(disturbance.id)) {
        throw new TypeError(
          `Disturbance id ${String(disturbance.id)} is already active in the local field.`,
        );
      }
    }
    const droppedDisturbanceIds: number[] = [];
    let mutated = false;
    for (const disturbance of submitted) {
      const freeIndex = disturbances.indexOf(null);
      if (freeIndex >= 0) {
        disturbances[freeIndex] = disturbance;
        mutated = true;
        continue;
      }
      const lowestIndex = findLowestPriorityDisturbance(disturbances, "manual");
      const lowest = disturbances[lowestIndex];
      if (
        lowest?.origin === "manual" &&
        disturbance.priority > lowest.priority
      ) {
        droppedDisturbanceIds.push(lowest.id);
        disturbances[lowestIndex] = disturbance;
        mutated = true;
      } else {
        droppedDisturbanceIds.push(disturbance.id);
      }
    }
    if (mutated) {
      renderRevision += 1;
      publishImmediateManualSnapshot(state.tick, state.timeSeconds);
    }
    const activeIds = new Set(
      disturbances.flatMap((disturbance) =>
        disturbance?.origin === "manual" ? [disturbance.id] : [],
      ),
    );
    const acceptedDisturbanceIds = submitted
      .map(({ id }) => id)
      .filter((id) => activeIds.has(id));
    return Object.freeze({
      tick: state.tick,
      acceptedDisturbanceIds: Object.freeze(acceptedDisturbanceIds),
      droppedDisturbanceIds: Object.freeze(droppedDisturbanceIds),
      activeDisturbanceCount: activeDisturbanceCount(disturbances),
    });
  };

  return Object.freeze({
    updateAnchor(anchor: InteractionAnchor, state: HostSimulationState) {
      observe(state);
      const nextX = anchor.x + state.originX;
      const nextZ = anchor.z + state.originZ;
      const changed = nextX !== anchorX || nextZ !== anchorZ;
      if (changed) {
        anchorX = nextX;
        anchorZ = nextZ;
        anchorRevision += 1;
        renderRevision += 1;
        publishImmediateManualSnapshot(state.tick, state.timeSeconds);
      }
      return Object.freeze({
        anchor: freezeAnchor(anchor.x, anchor.z),
        changed,
        revision: anchorRevision,
      });
    },
    submitRadialImpacts(
      batch: RadialImpactDisturbanceBatch,
      state: HostSimulationState,
    ) {
      observe(state);
      const submitted = Array.from(
        { length: batch.count },
        (_, index): ActiveManualDisturbance => {
          const vectorIndex = index * 3;
          const disturbance: ActiveManualDisturbance = {
            origin: "manual",
            kind: "radial-impact",
            id: batch.ids[index] ?? 0,
            x: (batch.positions[vectorIndex] ?? 0) + state.originX,
            z: (batch.positions[vectorIndex + 2] ?? 0) + state.originZ,
            directionX: 0,
            directionZ: 0,
            radius: batch.radii[index] ?? 0,
            amplitude: batch.amplitudes[index] ?? 0,
            priority: batch.priorities[index] ?? 0,
            startTimeSeconds: state.timeSeconds,
            sequence: nextSequence,
          };
          nextSequence += 1;
          return disturbance;
        },
      );
      return submitManualDisturbances(submitted, state);
    },
    submitDirectionalWakes(
      batch: DirectionalWakeDisturbanceBatch,
      state: HostSimulationState,
    ) {
      observe(state);
      const submitted = Array.from(
        { length: batch.count },
        (_, index): ActiveManualDisturbance => {
          const vectorIndex = index * 3;
          const direction = normalizeHorizontalDirection(
            batch.directions[vectorIndex] ?? 0,
            batch.directions[vectorIndex + 2] ?? 0,
          );
          const disturbance: ActiveManualDisturbance = {
            origin: "manual",
            kind: "directional-wake",
            id: batch.ids[index] ?? 0,
            x: (batch.positions[vectorIndex] ?? 0) + state.originX,
            z: (batch.positions[vectorIndex + 2] ?? 0) + state.originZ,
            directionX: direction.x,
            directionZ: direction.z,
            radius: batch.radii[index] ?? 0,
            amplitude: batch.amplitudes[index] ?? 0,
            priority: batch.priorities[index] ?? 0,
            startTimeSeconds: state.timeSeconds,
            sequence: nextSequence,
          };
          nextSequence += 1;
          return disturbance;
        },
      );
      return submitManualDisturbances(submitted, state);
    },
    updateBodyWakes(
      attachmentId: number,
      sources: readonly BodyWakeSource[],
      state: HostSimulationState,
    ) {
      observe(state);
      const requestedSocketIds = sources.map(({ socketId }) => socketId);
      if (new Set(requestedSocketIds).size !== requestedSocketIds.length) {
        throw new TypeError(
          "Body wake updates require unique socket ids per attachment.",
        );
      }
      const requested = new Set(requestedSocketIds);
      let mutated = false;
      for (let index = 0; index < disturbances.length; index += 1) {
        const disturbance = disturbances[index];
        if (
          disturbance?.origin === "body" &&
          disturbance.attachmentId === attachmentId &&
          !requested.has(disturbance.socketId)
        ) {
          disturbances[index] = null;
          mutated = true;
        }
      }
      for (const source of sources) {
        const existingIndex = findBodyWakeIndex(
          disturbances,
          attachmentId,
          source.socketId,
        );
        if (existingIndex < 0) {
          continue;
        }
        const existing = disturbances[existingIndex];
        if (existing?.origin !== "body") {
          continue;
        }
        const updated = createActiveBodyWake(
          attachmentId,
          source,
          state,
          existing.sequence,
        );
        if (!sameBodyWake(existing, updated)) {
          disturbances[existingIndex] = updated;
          mutated = true;
        }
      }
      for (const source of sources) {
        if (
          findBodyWakeIndex(disturbances, attachmentId, source.socketId) >= 0
        ) {
          continue;
        }
        const disturbance = createActiveBodyWake(
          attachmentId,
          source,
          state,
          nextSequence,
        );
        nextSequence += 1;
        const freeIndex = disturbances.indexOf(null);
        if (freeIndex >= 0) {
          disturbances[freeIndex] = disturbance;
          mutated = true;
          continue;
        }
        const lowestIndex = findLowestPriorityDisturbance(disturbances, "body");
        const lowest = disturbances[lowestIndex];
        if (
          lowest?.origin === "body" &&
          disturbance.priority > lowest.priority
        ) {
          disturbances[lowestIndex] = disturbance;
          mutated = true;
        }
      }
      if (mutated) {
        renderRevision += 1;
      }
      const emittedSocketIds = requestedSocketIds.filter(
        (socketId) =>
          findBodyWakeIndex(disturbances, attachmentId, socketId) >= 0,
      );
      const emitted = new Set(emittedSocketIds);
      const droppedSocketIds = requestedSocketIds.filter(
        (socketId) => !emitted.has(socketId),
      );
      return Object.freeze({
        tick: state.tick,
        emittedSocketIds: Object.freeze(emittedSocketIds),
        droppedSocketIds: Object.freeze(droppedSocketIds),
        activeBodyWakeCount: activeBodyWakeCount(disturbances),
        activeDisturbanceCount: activeDisturbanceCount(disturbances),
      });
    },
    removeBodyWakes(attachmentId: number) {
      let removedActive = false;
      for (let index = 0; index < disturbances.length; index += 1) {
        const disturbance = disturbances[index];
        if (
          disturbance?.origin === "body" &&
          disturbance.attachmentId === attachmentId
        ) {
          disturbances[index] = null;
          removedActive = true;
        }
        const queryDisturbance = querySnapshotDisturbances[index];
        if (
          queryDisturbance?.origin === "body" &&
          queryDisturbance.attachmentId === attachmentId
        ) {
          querySnapshotDisturbances[index] = null;
        }
      }
      compactDisturbances(querySnapshotDisturbances);
      if (activeBodyWakeCount(querySnapshotDisturbances) === 0) {
        querySnapshotBodyTick = null;
      }
      if (removedActive) {
        renderRevision += 1;
      }
    },
    applyQueries(batch: GameplayQueryBatch, state: HostSimulationState) {
      observe(state);
      const snapshotAge: 0 | 1 =
        (querySnapshotBodyTick !== null &&
          querySnapshotBodyTick < state.tick) ||
        (querySnapshotManualTick !== null &&
          querySnapshotManualTick < state.tick)
          ? 1
          : 0;
      for (let point = 0; point < batch.count; point += 1) {
        const vectorIndex = point * 3;
        const x = (batch.positions[vectorIndex] ?? 0) + state.originX;
        const z = (batch.positions[vectorIndex + 2] ?? 0) + state.originZ;
        const correction = evaluateLocalCorrection(
          x,
          z,
          querySnapshotAnchorX,
          querySnapshotAnchorZ,
          querySnapshotManualTimeSeconds,
          querySnapshotBodyTimeSeconds,
          querySnapshotDisturbances,
        );
        const normalY = batch.results.normals[vectorIndex + 1] ?? 1;
        const spectralSlopeX =
          normalY === 0
            ? 0
            : -(batch.results.normals[vectorIndex] ?? 0) / normalY;
        const spectralSlopeZ =
          normalY === 0
            ? 0
            : -(batch.results.normals[vectorIndex + 2] ?? 0) / normalY;
        const slopeX = spectralSlopeX + correction.slopeX;
        const slopeZ = spectralSlopeZ + correction.slopeZ;
        const inverseNormalLength = 1 / Math.hypot(slopeX, 1, slopeZ);
        batch.results.heights[point] =
          (batch.results.heights[point] ?? 0) + correction.height;
        batch.results.normals[vectorIndex] = -slopeX * inverseNormalLength;
        batch.results.normals[vectorIndex + 1] = inverseNormalLength;
        batch.results.normals[vectorIndex + 2] = -slopeZ * inverseNormalLength;
        batch.results.velocities[vectorIndex + 1] =
          (batch.results.velocities[vectorIndex + 1] ?? 0) +
          correction.velocityY;
      }
      return snapshotAge;
    },
    inspect(state: HostSimulationState) {
      observe(state);
      return Object.freeze({
        anchor: freezeAnchor(anchorX - state.originX, anchorZ - state.originZ),
        revision: anchorRevision,
        activeBodyWakeCount: activeBodyWakeCount(disturbances),
        activeDisturbanceCount: activeDisturbanceCount(disturbances),
      });
    },
    renderRevision() {
      return renderRevision;
    },
    renderSnapshot() {
      return Object.freeze({
        revision: renderRevision,
        anchorX,
        anchorZ,
        impacts: Object.freeze(
          disturbances.flatMap((disturbance) =>
            disturbance === null
              ? []
              : [
                  Object.freeze({
                    kind: disturbance.kind,
                    x: disturbance.x,
                    z: disturbance.z,
                    directionX: disturbance.directionX,
                    directionZ: disturbance.directionZ,
                    radius: disturbance.radius,
                    amplitude: disturbance.amplitude,
                    startTimeSeconds: disturbance.startTimeSeconds,
                  }),
                ],
          ),
        ),
      });
    },
  });
}

function createActiveBodyWake(
  attachmentId: number,
  source: BodyWakeSource,
  state: HostSimulationState,
  sequence: number,
): ActiveBodyWake {
  const direction = normalizeHorizontalDirection(
    source.directionX,
    source.directionZ,
  );
  return {
    origin: "body",
    attachmentId,
    socketId: source.socketId,
    kind: source.kind === "propeller" ? "propeller-wash" : "directional-wake",
    x: source.x + state.originX,
    z: source.z + state.originZ,
    directionX: direction.x,
    directionZ: direction.z,
    radius: source.radius,
    amplitude: source.amplitude,
    priority: source.priority,
    startTimeSeconds: PERSISTENT_BODY_WAKE_START_TIME_SECONDS,
    sequence,
  };
}

function findBodyWakeIndex(
  disturbances: readonly (ActiveDisturbance | null)[],
  attachmentId: number,
  socketId: string,
): number {
  return disturbances.findIndex(
    (disturbance) =>
      disturbance?.origin === "body" &&
      disturbance.attachmentId === attachmentId &&
      disturbance.socketId === socketId,
  );
}

function findLowestPriorityDisturbance(
  disturbances: readonly (ActiveDisturbance | null)[],
  origin: ActiveDisturbance["origin"],
): number {
  let lowestIndex = -1;
  for (let index = 0; index < disturbances.length; index += 1) {
    const candidate = disturbances[index];
    const lowest = disturbances[lowestIndex];
    if (
      candidate?.origin === origin &&
      (lowest === undefined ||
        lowest === null ||
        candidate.priority < lowest.priority ||
        (candidate.priority === lowest.priority &&
          candidate.sequence < lowest.sequence))
    ) {
      lowestIndex = index;
    }
  }
  return lowestIndex;
}

function compareHigherPriorityFirst(
  left: ActiveDisturbance,
  right: ActiveDisturbance,
): number {
  return right.priority - left.priority || left.sequence - right.sequence;
}

function removeExpiredManualDisturbances(
  disturbances: Array<ActiveDisturbance | null>,
  timeSeconds: number,
): boolean {
  let removed = false;
  for (let index = 0; index < disturbances.length; index += 1) {
    const disturbance = disturbances[index];
    if (
      disturbance?.origin === "manual" &&
      timeSeconds - disturbance.startTimeSeconds >=
        RADIAL_IMPACT_LIFETIME_SECONDS
    ) {
      disturbances[index] = null;
      removed = true;
    }
  }
  return removed;
}

function isActiveAtTime(
  disturbance: ActiveDisturbance,
  timeSeconds: number,
): boolean {
  return (
    disturbance.origin === "body" ||
    (disturbance.startTimeSeconds <= timeSeconds &&
      timeSeconds - disturbance.startTimeSeconds <
        RADIAL_IMPACT_LIFETIME_SECONDS)
  );
}

function activeDisturbanceCount(
  disturbances: readonly (ActiveDisturbance | null)[],
): number {
  let count = 0;
  for (const disturbance of disturbances) {
    if (disturbance !== null) {
      count += 1;
    }
  }
  return count;
}

function activeBodyWakeCount(
  disturbances: readonly (ActiveDisturbance | null)[],
): number {
  let count = 0;
  for (const disturbance of disturbances) {
    if (disturbance?.origin === "body") {
      count += 1;
    }
  }
  return count;
}

function compactDisturbances(
  disturbances: Array<ActiveDisturbance | null>,
): void {
  let writeIndex = 0;
  for (const disturbance of disturbances) {
    if (disturbance !== null) {
      disturbances[writeIndex] = disturbance;
      writeIndex += 1;
    }
  }
  disturbances.fill(null, writeIndex);
}

function sameBodyWake(left: ActiveBodyWake, right: ActiveBodyWake): boolean {
  return (
    left.kind === right.kind &&
    left.x === right.x &&
    left.z === right.z &&
    left.directionX === right.directionX &&
    left.directionZ === right.directionZ &&
    left.radius === right.radius &&
    left.amplitude === right.amplitude &&
    left.priority === right.priority
  );
}

function normalizeHorizontalDirection(
  directionX: number,
  directionZ: number,
): Readonly<{ x: number; z: number }> {
  const length = Math.hypot(directionX, directionZ);
  if (!Number.isFinite(length) || length < 1e-6) {
    return Object.freeze({ x: 0, z: 1 });
  }
  return Object.freeze({ x: directionX / length, z: directionZ / length });
}

function evaluateLocalCorrection(
  x: number,
  z: number,
  anchorX: number,
  anchorZ: number,
  manualTimeSeconds: number,
  bodyTimeSeconds: number,
  disturbances: readonly (ActiveDisturbance | null)[],
): Readonly<{
  height: number;
  slopeX: number;
  slopeZ: number;
  velocityY: number;
}> {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  let velocityY = 0;
  for (const disturbance of disturbances) {
    if (disturbance === null) {
      continue;
    }
    const timeSeconds =
      disturbance.origin === "manual" ? manualTimeSeconds : bodyTimeSeconds;
    const correction =
      disturbance.kind === "radial-impact"
        ? evaluateRadialImpact(x, z, timeSeconds, disturbance)
        : evaluateDirectionalWake(x, z, timeSeconds, disturbance);
    height += correction.height;
    slopeX += correction.slopeX;
    slopeZ += correction.slopeZ;
    velocityY += correction.velocityY;
  }

  const anchorDx = x - anchorX;
  const anchorDz = z - anchorZ;
  const anchorDistance = Math.hypot(anchorDx, anchorDz);
  const fadeStart =
    INTERACTION_FIELD_RADIUS_METRES - INTERACTION_FIELD_EDGE_FADE_METRES;
  if (anchorDistance >= INTERACTION_FIELD_RADIUS_METRES) {
    return { height: 0, slopeX: 0, slopeZ: 0, velocityY: 0 };
  }
  if (anchorDistance <= fadeStart) {
    return { height, slopeX, slopeZ, velocityY };
  }
  const fadeT =
    (anchorDistance - fadeStart) / INTERACTION_FIELD_EDGE_FADE_METRES;
  const fade = 1 - smoothHermite(fadeT);
  const fadeDerivative =
    (-6 * fadeT * (1 - fadeT)) / INTERACTION_FIELD_EDGE_FADE_METRES;
  const inverseAnchorDistance = anchorDistance === 0 ? 0 : 1 / anchorDistance;
  return {
    height: height * fade,
    slopeX:
      slopeX * fade +
      height * fadeDerivative * anchorDx * inverseAnchorDistance,
    slopeZ:
      slopeZ * fade +
      height * fadeDerivative * anchorDz * inverseAnchorDistance,
    velocityY: velocityY * fade,
  };
}

function evaluateRadialImpact(
  x: number,
  z: number,
  timeSeconds: number,
  impact: ActiveManualDisturbance,
): Readonly<{
  height: number;
  slopeX: number;
  slopeZ: number;
  velocityY: number;
}> {
  const ageSeconds = timeSeconds - impact.startTimeSeconds;
  if (ageSeconds < 0 || ageSeconds >= RADIAL_IMPACT_LIFETIME_SECONDS) {
    return { height: 0, slopeX: 0, slopeZ: 0, velocityY: 0 };
  }
  const dx = x - impact.x;
  const dz = z - impact.z;
  const distance = Math.hypot(dx, dz);
  const normalizedRadius = distance / impact.radius;
  if (normalizedRadius >= 1) {
    return { height: 0, slopeX: 0, slopeZ: 0, velocityY: 0 };
  }
  const progress = ageSeconds / RADIAL_IMPACT_LIFETIME_SECONDS;
  const remaining = 1 - progress;
  const decay = remaining * remaining;
  const radialWindow = 1 - smoothHermite(normalizedRadius);
  const radialWindowDerivative = -6 * normalizedRadius * (1 - normalizedRadius);
  const phase = Math.PI * (normalizedRadius - progress * 2);
  const cosine = Math.cos(phase);
  const sine = Math.sin(phase);
  const height = impact.amplitude * decay * cosine * radialWindow;
  const heightDerivativeRadius =
    (impact.amplitude *
      decay *
      (-Math.PI * sine * radialWindow + cosine * radialWindowDerivative)) /
    impact.radius;
  const inverseDistance = distance === 0 ? 0 : 1 / distance;
  const velocityY =
    impact.amplitude *
    radialWindow *
    ((-2 * remaining * cosine) / RADIAL_IMPACT_LIFETIME_SECONDS +
      (2 * Math.PI * decay * sine) / RADIAL_IMPACT_LIFETIME_SECONDS);
  return {
    height,
    slopeX: heightDerivativeRadius * dx * inverseDistance,
    slopeZ: heightDerivativeRadius * dz * inverseDistance,
    velocityY,
  };
}

function evaluateDirectionalWake(
  x: number,
  z: number,
  timeSeconds: number,
  wake: ActiveDisturbanceBase,
): Readonly<{
  height: number;
  slopeX: number;
  slopeZ: number;
  velocityY: number;
}> {
  const propeller = wake.kind === "propeller-wash";
  const ageSeconds = timeSeconds - wake.startTimeSeconds;
  const persistent =
    wake.startTimeSeconds === PERSISTENT_BODY_WAKE_START_TIME_SECONDS;
  if (
    !persistent &&
    (ageSeconds < 0 || ageSeconds >= RADIAL_IMPACT_LIFETIME_SECONDS)
  ) {
    return { height: 0, slopeX: 0, slopeZ: 0, velocityY: 0 };
  }
  const dx = x - wake.x;
  const dz = z - wake.z;
  const along = dx * wake.directionX + dz * wake.directionZ;
  const lateral = -dx * wake.directionZ + dz * wake.directionX;
  const length =
    wake.radius *
    (propeller
      ? PROPELLER_WASH_LENGTH_RADIUS_MULTIPLIER
      : DIRECTIONAL_WAKE_LENGTH_RADIUS_MULTIPLIER);
  const width =
    wake.radius *
    (propeller
      ? PROPELLER_WASH_WIDTH_RADIUS_MULTIPLIER
      : DIRECTIONAL_WAKE_WIDTH_RADIUS_MULTIPLIER);
  const alongT = along / length;
  const lateralT = Math.abs(lateral) / width;
  if (alongT < 0 || alongT >= 1 || lateralT >= 1) {
    return { height: 0, slopeX: 0, slopeZ: 0, velocityY: 0 };
  }
  const longitudinalWindow = 1 - smoothHermite(alongT);
  const lateralWindow = 1 - smoothHermite(lateralT);
  const longitudinalDerivative = (-6 * alongT * (1 - alongT)) / length;
  const lateralDerivative = (-6 * lateralT * (1 - lateralT)) / width;
  const spatialFrequency =
    (propeller
      ? PROPELLER_WASH_SPATIAL_RADIANS
      : DIRECTIONAL_WAKE_SPATIAL_RADIANS) / wake.radius;
  const temporalFrequency = propeller
    ? PROPELLER_WASH_TEMPORAL_RADIANS_PER_SECOND
    : DIRECTIONAL_WAKE_TEMPORAL_RADIANS_PER_SECOND;
  const phase = along * spatialFrequency - timeSeconds * temporalFrequency;
  const cosine = Math.cos(phase);
  const sine = Math.sin(phase);
  const heightScale = propeller
    ? PROPELLER_WASH_HEIGHT_SCALE
    : DIRECTIONAL_WAKE_HEIGHT_SCALE;
  const progress = persistent ? 0 : ageSeconds / RADIAL_IMPACT_LIFETIME_SECONDS;
  const remaining = 1 - progress;
  const decay = persistent ? 1 : remaining * remaining;
  const decayDerivative = persistent
    ? 0
    : (-2 * remaining) / RADIAL_IMPACT_LIFETIME_SECONDS;
  const scaledAmplitude = wake.amplitude * heightScale;
  const height =
    scaledAmplitude * decay * cosine * longitudinalWindow * lateralWindow;
  const derivativeAlong =
    scaledAmplitude *
    decay *
    lateralWindow *
    (longitudinalDerivative * cosine -
      longitudinalWindow * sine * spatialFrequency);
  const derivativeLateral =
    scaledAmplitude *
    decay *
    cosine *
    longitudinalWindow *
    lateralDerivative *
    (lateral < 0 ? -1 : 1);
  return {
    height,
    slopeX:
      derivativeAlong * wake.directionX - derivativeLateral * wake.directionZ,
    slopeZ:
      derivativeAlong * wake.directionZ + derivativeLateral * wake.directionX,
    velocityY:
      scaledAmplitude *
      longitudinalWindow *
      lateralWindow *
      (decayDerivative * cosine + decay * temporalFrequency * sine),
  };
}

function smoothHermite(value: number): number {
  return value * value * (3 - 2 * value);
}

function freezeAnchor(x: number, z: number): InteractionAnchor {
  return Object.freeze({ x, z });
}
