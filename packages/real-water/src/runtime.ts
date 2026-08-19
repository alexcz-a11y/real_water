import { RealWaterRuntimeError } from "./errors.js";
import { MAX_GAMEPLAY_QUERY_POINTS } from "./capabilities.js";
import { writeSingleSpectralBandQueries } from "./internal/single-spectral-band.js";

/**
 * Hot, perceptual controls for the first Open Water spectral tracer.
 *
 * @public
 */
export interface ArtisticControls {
  /** Relative visual strength of the prepared wave band, from still to bold. */
  readonly waveStrength: number;
}

/**
 * Host-authored deterministic state for the Open Water Domain.
 *
 * @public
 */
export interface HostSimulationState {
  readonly seed: number;
  readonly tick: number;
  readonly timeSeconds: number;
  readonly paused: boolean;
}

/**
 * Host-owned source of authoritative simulation state.
 *
 * @public
 */
export interface HostSimulationAdapter {
  snapshot(): HostSimulationState;
}

/**
 * Lightweight coherent state shared by rendering and Gameplay Queries.
 *
 * @public
 */
export interface OpenWaterRuntimeSnapshot extends HostSimulationState {
  readonly artisticControls: ArtisticControls;
  readonly controlRevision: number;
}

/**
 * Result of applying a complete hot Artistic Control state.
 *
 * @public
 */
export interface ArtisticControlUpdateReceipt {
  readonly artisticControls: ArtisticControls;
  readonly changed: boolean;
  readonly revision: number;
}

/**
 * Caller-owned output storage for one batched Gameplay Query.
 *
 * Every result is tagged in caller-owned metadata buffers. Per-point data is
 * tightly packed; normals and velocities use XYZ triples.
 *
 * @public
 */
export interface GameplayQueryResults {
  readonly heights: Float32Array;
  readonly normals: Float32Array;
  readonly velocities: Float32Array;
  readonly foam: Float32Array;
  readonly ticks: Float64Array;
  readonly controlRevisions: Float64Array;
  readonly snapshotAges: Uint8Array;
}

/**
 * One synchronous Gameplay Query batch in Three.js XYZ world coordinates.
 *
 * Positions are tightly packed XYZ triples. Their Y values do not affect the
 * horizontal Open Water surface query.
 *
 * @public
 */
export interface GameplayQueryBatch {
  readonly count: number;
  readonly positions: Float32Array;
  readonly results: GameplayQueryResults;
}

/**
 * Hot command/query Interface implemented by a ready Real Water lease.
 *
 * @public
 */
export interface RealWaterRuntime {
  updateArtisticControls(
    controls: ArtisticControls,
  ): ArtisticControlUpdateReceipt;
  queryGameplay(batch: GameplayQueryBatch): GameplayQueryResults;
  inspectRuntime(): OpenWaterRuntimeSnapshot;
}

export interface RuntimeStateSink {
  synchronize(snapshot: OpenWaterRuntimeSnapshot): void;
}

export function createRealWaterRuntime(
  assertActive: () => void,
  simulation: HostSimulationAdapter,
  sink?: RuntimeStateSink,
): RealWaterRuntime {
  let artisticControls = freezeArtisticControls({ waveStrength: 1 });
  let controlRevision = 0;
  let queryTick = -1;
  let queriesUsedThisTick = 0;

  return Object.freeze({
    updateArtisticControls(
      controls: ArtisticControls,
    ): ArtisticControlUpdateReceipt {
      assertActive();
      const nextControls = freezeArtisticControls(controls);
      const changed =
        nextControls.waveStrength !== artisticControls.waveStrength;
      if (changed) {
        const nextRevision = controlRevision + 1;
        const nextSnapshot = readSnapshot(
          simulation,
          nextControls,
          nextRevision,
        );
        sink?.synchronize(nextSnapshot);
        artisticControls = nextControls;
        controlRevision = nextRevision;
      }
      return Object.freeze({
        artisticControls,
        changed,
        revision: controlRevision,
      });
    },
    queryGameplay(batch: GameplayQueryBatch): GameplayQueryResults {
      assertActive();
      validateGameplayQueryBatch(batch);
      const state = readHostSimulationState(simulation);
      const usedThisTick = state.tick === queryTick ? queriesUsedThisTick : 0;
      if (usedThisTick + batch.count > MAX_GAMEPLAY_QUERY_POINTS) {
        throw queryCapacityError(batch.count, usedThisTick);
      }
      writeSingleSpectralBandQueries(batch, state, artisticControls);
      for (let point = 0; point < batch.count; point += 1) {
        batch.results.ticks[point] = state.tick;
        batch.results.controlRevisions[point] = controlRevision;
        batch.results.snapshotAges[point] = 0;
      }
      queryTick = state.tick;
      queriesUsedThisTick = usedThisTick + batch.count;
      return batch.results;
    },
    inspectRuntime(): OpenWaterRuntimeSnapshot {
      assertActive();
      return readSnapshot(simulation, artisticControls, controlRevision);
    },
  });
}

/**
 * Creates an immutable zero-time Host Simulation Adapter.
 *
 * @public
 */
export function createStaticHostSimulationAdapter(): HostSimulationAdapter {
  const snapshot = Object.freeze({
    seed: 0,
    tick: 0,
    timeSeconds: 0,
    paused: true,
  });
  return Object.freeze({ snapshot: () => snapshot });
}

export function readHostSimulationState(
  simulation: HostSimulationAdapter,
): HostSimulationState {
  const state = simulation.snapshot();
  if (
    !Number.isInteger(state.seed) ||
    state.seed < 0 ||
    state.seed > 0xffff_ffff
  ) {
    throw new RangeError("Open Water seeds must be unsigned 32-bit integers.");
  }
  if (!Number.isSafeInteger(state.tick) || state.tick < 0) {
    throw new RangeError(
      "Open Water ticks must be non-negative safe integers.",
    );
  }
  if (!Number.isFinite(state.timeSeconds) || state.timeSeconds < 0) {
    throw new RangeError(
      "Open Water simulation time must be finite and non-negative.",
    );
  }
  if (typeof state.paused !== "boolean") {
    throw new TypeError("Open Water pause state must be boolean.");
  }
  return state;
}

function freezeArtisticControls(controls: ArtisticControls): ArtisticControls {
  if (
    !Number.isFinite(controls.waveStrength) ||
    controls.waveStrength < 0 ||
    controls.waveStrength > 2
  ) {
    throw new RangeError("waveStrength must be between 0 and 2.");
  }
  return Object.freeze({ waveStrength: controls.waveStrength });
}

function freezeSnapshot(
  snapshot: OpenWaterRuntimeSnapshot,
): OpenWaterRuntimeSnapshot {
  return Object.freeze({ ...snapshot });
}

function readSnapshot(
  simulation: HostSimulationAdapter,
  artisticControls: ArtisticControls,
  controlRevision: number,
): OpenWaterRuntimeSnapshot {
  const state = readHostSimulationState(simulation);
  return freezeSnapshot({
    seed: state.seed,
    tick: state.tick,
    timeSeconds: state.timeSeconds,
    paused: state.paused,
    artisticControls,
    controlRevision,
  });
}

function validateGameplayQueryBatch(batch: GameplayQueryBatch): void {
  if (!Number.isSafeInteger(batch.count) || batch.count < 0) {
    throw new RangeError(
      "Gameplay Query counts must be non-negative safe integers.",
    );
  }
  if (batch.count > MAX_GAMEPLAY_QUERY_POINTS) {
    throw queryCapacityError(batch.count, 0);
  }

  requireLength(batch.positions, batch.count * 3, "positions");
  requireLength(batch.results.heights, batch.count, "heights");
  requireLength(batch.results.normals, batch.count * 3, "normals");
  requireLength(batch.results.velocities, batch.count * 3, "velocities");
  requireLength(batch.results.foam, batch.count, "foam");
  requireFloat64Length(batch.results.ticks, batch.count, "ticks");
  requireFloat64Length(
    batch.results.controlRevisions,
    batch.count,
    "controlRevisions",
  );
  requireUint8Length(batch.results.snapshotAges, batch.count, "snapshotAges");
  for (let index = 0; index < batch.count * 3; index += 1) {
    if (!Number.isFinite(batch.positions[index])) {
      throw new RangeError(
        "Gameplay Query positions must contain finite values.",
      );
    }
  }
}

function requireFloat64Length(
  buffer: Float64Array,
  required: number,
  label: string,
): void {
  if (!(buffer instanceof Float64Array) || buffer.length < required) {
    throw new RangeError(
      `The Gameplay Query ${label} buffer requires at least ${required} Float64 values.`,
    );
  }
}

function requireUint8Length(
  buffer: Uint8Array,
  required: number,
  label: string,
): void {
  if (!(buffer instanceof Uint8Array) || buffer.length < required) {
    throw new RangeError(
      `The Gameplay Query ${label} buffer requires at least ${required} Uint8 values.`,
    );
  }
}

function queryCapacityError(
  requestedThisBatch: number,
  usedThisTick: number,
): RealWaterRuntimeError {
  return new RealWaterRuntimeError({
    code: "GAMEPLAY_QUERY_CAPACITY_EXCEEDED",
    message: "The Gameplay Query batch exceeds the prepared per-tick capacity.",
    diagnostics: {
      capacity: MAX_GAMEPLAY_QUERY_POINTS,
      requestedThisBatch,
      usedThisTick,
    },
  });
}

function requireLength(
  buffer: Float32Array,
  required: number,
  label: string,
): void {
  if (!(buffer instanceof Float32Array) || buffer.length < required) {
    throw new RangeError(
      `The Gameplay Query ${label} buffer requires at least ${required} Float32 values.`,
    );
  }
}
