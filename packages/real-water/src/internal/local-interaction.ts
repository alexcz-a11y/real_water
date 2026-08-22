import type {
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
const FIXED_TICK_SECONDS = 1 / 60;

interface ActiveRadialImpact {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly amplitude: number;
  readonly priority: number;
  readonly startTimeSeconds: number;
  readonly sequence: number;
}

export interface LocalInteractionRenderImpact {
  readonly x: number;
  readonly z: number;
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
  ): Readonly<{
    tick: number;
    acceptedDisturbanceIds: readonly number[];
    droppedDisturbanceIds: readonly number[];
    activeDisturbanceCount: number;
  }>;
  applyQueries(batch: GameplayQueryBatch, state: HostSimulationState): 0 | 1;
  inspect(state: HostSimulationState): Readonly<{
    anchor: InteractionAnchor;
    revision: number;
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
  const impacts: Array<ActiveRadialImpact | null> = Array.from(
    { length: MAX_ACTIVE_DISTURBANCES },
    () => null,
  );
  const querySnapshotImpacts: Array<ActiveRadialImpact | null> = Array.from(
    { length: MAX_ACTIVE_DISTURBANCES },
    () => null,
  );
  let querySnapshotTick = initial.tick;
  let querySnapshotTimeSeconds = initial.timeSeconds;
  let querySnapshotAnchorX = anchorX;
  let querySnapshotAnchorZ = anchorZ;

  const publishQuerySnapshot = (tick: number, timeSeconds: number): void => {
    querySnapshotImpacts.fill(null);
    let writeIndex = 0;
    for (const impact of impacts) {
      if (
        impact !== null &&
        impact.startTimeSeconds <= timeSeconds &&
        timeSeconds - impact.startTimeSeconds < RADIAL_IMPACT_LIFETIME_SECONDS
      ) {
        querySnapshotImpacts[writeIndex] = impact;
        writeIndex += 1;
      }
    }
    querySnapshotTick = tick;
    querySnapshotTimeSeconds = timeSeconds;
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
      if (activeImpactCount(impacts) > 0) {
        impacts.fill(null);
        renderRevision += 1;
      }
      querySnapshotImpacts.fill(null);
      querySnapshotTick = state.tick;
      querySnapshotTimeSeconds = state.timeSeconds;
      querySnapshotAnchorX = anchorX;
      querySnapshotAnchorZ = anchorZ;
    } else if (state.tick > lastTick) {
      publishQuerySnapshot(
        state.tick - 1,
        Math.max(0, state.timeSeconds - FIXED_TICK_SECONDS),
      );
    }
    lastSeed = state.seed;
    lastTick = state.tick;
    lastTimeSeconds = state.timeSeconds;
    lastResetRevision = state.simulationResetRevision;
    if (removeExpiredImpacts(impacts, state.timeSeconds)) {
      renderRevision += 1;
    }
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
        publishQuerySnapshot(state.tick, state.timeSeconds);
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
      const activeIdsBeforeSubmission = new Set(
        impacts.flatMap((impact) => (impact === null ? [] : [impact.id])),
      );
      for (let index = 0; index < batch.count; index += 1) {
        const id = batch.ids[index] ?? 0;
        if (activeIdsBeforeSubmission.has(id)) {
          throw new TypeError(
            `Disturbance id ${String(id)} is already active in the local field.`,
          );
        }
      }
      const submittedDisturbanceIds: number[] = [];
      const droppedDisturbanceIds: number[] = [];
      let mutated = false;
      for (let index = 0; index < batch.count; index += 1) {
        const vectorIndex = index * 3;
        const id = batch.ids[index] ?? 0;
        const impact: ActiveRadialImpact = {
          id,
          x: (batch.positions[vectorIndex] ?? 0) + state.originX,
          z: (batch.positions[vectorIndex + 2] ?? 0) + state.originZ,
          radius: batch.radii[index] ?? 0,
          amplitude: batch.amplitudes[index] ?? 0,
          priority: batch.priorities[index] ?? 0,
          startTimeSeconds: state.timeSeconds,
          sequence: nextSequence,
        };
        nextSequence += 1;
        submittedDisturbanceIds.push(id);
        const freeIndex = impacts.indexOf(null);
        if (freeIndex >= 0) {
          impacts[freeIndex] = impact;
          mutated = true;
          continue;
        }
        const lowestIndex = findLowestPriorityImpact(impacts);
        const lowest = impacts[lowestIndex];
        if (
          lowest !== undefined &&
          lowest !== null &&
          impact.priority > lowest.priority
        ) {
          droppedDisturbanceIds.push(lowest.id);
          impacts[lowestIndex] = impact;
          mutated = true;
        } else {
          droppedDisturbanceIds.push(impact.id);
        }
      }
      if (mutated) {
        renderRevision += 1;
        publishQuerySnapshot(state.tick, state.timeSeconds);
      }
      const activeIds = new Set(
        impacts.flatMap((impact) => (impact === null ? [] : [impact.id])),
      );
      const acceptedDisturbanceIds = submittedDisturbanceIds.filter((id) =>
        activeIds.has(id),
      );
      return Object.freeze({
        tick: state.tick,
        acceptedDisturbanceIds: Object.freeze(acceptedDisturbanceIds),
        droppedDisturbanceIds: Object.freeze(droppedDisturbanceIds),
        activeDisturbanceCount: activeImpactCount(impacts),
      });
    },
    applyQueries(batch: GameplayQueryBatch, state: HostSimulationState) {
      observe(state);
      const snapshotAge: 0 | 1 =
        activeImpactCount(querySnapshotImpacts) > 0 &&
        querySnapshotTick < state.tick
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
          querySnapshotTimeSeconds,
          querySnapshotImpacts,
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
        activeDisturbanceCount: activeImpactCount(impacts),
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
          impacts.flatMap((impact) =>
            impact === null
              ? []
              : [
                  Object.freeze({
                    x: impact.x,
                    z: impact.z,
                    radius: impact.radius,
                    amplitude: impact.amplitude,
                    startTimeSeconds: impact.startTimeSeconds,
                  }),
                ],
          ),
        ),
      });
    },
  });
}

function findLowestPriorityImpact(
  impacts: readonly (ActiveRadialImpact | null)[],
): number {
  let lowestIndex = -1;
  for (let index = 0; index < impacts.length; index += 1) {
    const candidate = impacts[index];
    const lowest = impacts[lowestIndex];
    if (
      candidate !== undefined &&
      candidate !== null &&
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

function removeExpiredImpacts(
  impacts: Array<ActiveRadialImpact | null>,
  timeSeconds: number,
): boolean {
  let removed = false;
  for (let index = 0; index < impacts.length; index += 1) {
    const impact = impacts[index];
    if (
      impact !== null &&
      impact !== undefined &&
      timeSeconds - impact.startTimeSeconds >= RADIAL_IMPACT_LIFETIME_SECONDS
    ) {
      impacts[index] = null;
      removed = true;
    }
  }
  return removed;
}

function activeImpactCount(
  impacts: readonly (ActiveRadialImpact | null)[],
): number {
  let count = 0;
  for (const impact of impacts) {
    if (impact !== null) {
      count += 1;
    }
  }
  return count;
}

function evaluateLocalCorrection(
  x: number,
  z: number,
  anchorX: number,
  anchorZ: number,
  timeSeconds: number,
  impacts: readonly (ActiveRadialImpact | null)[],
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
  for (const impact of impacts) {
    if (impact === null) {
      continue;
    }
    const correction = evaluateRadialImpact(x, z, timeSeconds, impact);
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
  impact: ActiveRadialImpact,
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

function smoothHermite(value: number): number {
  return value * value * (3 - 2 * value);
}

function freezeAnchor(x: number, z: number): InteractionAnchor {
  return Object.freeze({ x, z });
}
