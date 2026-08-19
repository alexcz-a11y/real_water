import { RealWaterRuntimeError } from "./errors.js";
import { MAX_GAMEPLAY_QUERY_POINTS } from "./capabilities.js";
import { hasExactKeys, isRecord } from "./internal/record-validation.js";
import {
  createOriginRevisionTracker,
  type OriginRevisionTracker,
} from "./internal/origin-revision-tracker.js";
import { writeSpectralBandQueries } from "./internal/spectral-bands.js";
import { createWaterPreset } from "./water-preset.js";

/**
 * Hot, perceptual controls for the prepared four-band Open Water Domain.
 *
 * @public
 */
export interface ArtisticControls {
  /** Overall visual strength of the prepared sea, from still to bold. */
  readonly waveStrength: number;
  /** Relative drama of the longest swell band. */
  readonly swellDrama: number;
  /** How strongly secondary bands align with the swell direction. */
  readonly directionality: number;
  /** Relative strength of the mid-scale chop band. */
  readonly choppiness: number;
  /** Art-directed crest peaking applied to every prepared band. */
  readonly crestSharpness: number;
  /** Relative strength of the shortest ripple band. */
  readonly microDetail: number;
  /** Multiplier applied to every band's temporal frequency. */
  readonly timeScale: number;
}

const ARTISTIC_CONTROL_KEYS = [
  "waveStrength",
  "swellDrama",
  "directionality",
  "choppiness",
  "crestSharpness",
  "microDetail",
  "timeScale",
] as const;

const DEFAULT_ARTISTIC_CONTROLS: ArtisticControls =
  createWaterPreset("swell").artisticControls;

/**
 * Host-authored deterministic state for the Open Water Domain.
 *
 * `originX` and `originZ` are the Host-owned floating-origin offset in metres.
 * Gameplay Query positions are in the current Host frame; the runtime evaluates
 * the Open Water Domain at `(x + originX, z + originZ)`.
 *
 * @public
 */
export interface HostSimulationState {
  readonly seed: number;
  readonly tick: number;
  readonly timeSeconds: number;
  readonly paused: boolean;
  readonly originX: number;
  readonly originZ: number;
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
 * `originRevision` is a monotonic discontinuity hook. It starts at 0 from the
 * verified Host origin at runtime creation, increments only when that origin
 * actually changes, and is unchanged by later ticks at the same origin.
 * Spectral wave state, seed, tick, time, and Artistic Controls are retained
 * across origin shifts.
 *
 * @public
 */
export interface OpenWaterRuntimeSnapshot extends HostSimulationState {
  readonly artisticControls: ArtisticControls;
  readonly controlRevision: number;
  readonly originRevision: number;
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
  let artisticControls = DEFAULT_ARTISTIC_CONTROLS;
  let controlRevision = 0;
  let queryTick = -1;
  let queriesUsedThisTick = 0;
  const originRevisions = createOriginRevisionTracker(
    readHostSimulationState(simulation),
  );

  return Object.freeze({
    updateArtisticControls(
      controls: ArtisticControls,
    ): ArtisticControlUpdateReceipt {
      assertActive();
      const nextControls = freezeArtisticControls(controls);
      const changed = artisticControlsChanged(artisticControls, nextControls);
      if (changed) {
        const nextRevision = controlRevision + 1;
        const nextSnapshot = readSnapshot(
          simulation,
          nextControls,
          nextRevision,
          originRevisions,
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
      originRevisions.observe(state);
      const usedThisTick = state.tick === queryTick ? queriesUsedThisTick : 0;
      if (usedThisTick + batch.count > MAX_GAMEPLAY_QUERY_POINTS) {
        throw queryCapacityError(batch.count, usedThisTick);
      }
      writeSpectralBandQueries(batch, state, artisticControls);
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
      return readSnapshot(
        simulation,
        artisticControls,
        controlRevision,
        originRevisions,
      );
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
    originX: 0,
    originZ: 0,
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
  if (!Number.isFinite(state.originX) || !Number.isFinite(state.originZ)) {
    throw new RangeError("Open Water origin must be finite.");
  }
  return state;
}

function freezeArtisticControls(controls: ArtisticControls): ArtisticControls {
  const value: unknown = controls;
  if (!isRecord(value) || !hasExactKeys(value, ARTISTIC_CONTROL_KEYS)) {
    throw new TypeError(
      "Artistic Controls must use the complete supported control set.",
    );
  }

  assertControlRange(value.waveStrength, 0, 2, "waveStrength");
  assertControlRange(value.swellDrama, 0, 2, "swellDrama");
  assertControlRange(value.directionality, 0, 1, "directionality");
  assertControlRange(value.choppiness, 0, 2, "choppiness");
  assertControlRange(value.crestSharpness, 0, 2, "crestSharpness");
  assertControlRange(value.microDetail, 0, 2, "microDetail");
  assertControlRange(value.timeScale, 0, 2, "timeScale");

  return Object.freeze({
    waveStrength: value.waveStrength,
    swellDrama: value.swellDrama,
    directionality: value.directionality,
    choppiness: value.choppiness,
    crestSharpness: value.crestSharpness,
    microDetail: value.microDetail,
    timeScale: value.timeScale,
  });
}

function artisticControlsChanged(
  current: ArtisticControls,
  next: ArtisticControls,
): boolean {
  return ARTISTIC_CONTROL_KEYS.some((key) => current[key] !== next[key]);
}

function assertControlRange(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
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
  originRevisions: OriginRevisionTracker,
): OpenWaterRuntimeSnapshot {
  const state = readHostSimulationState(simulation);
  return freezeSnapshot({
    seed: state.seed,
    tick: state.tick,
    timeSeconds: state.timeSeconds,
    paused: state.paused,
    originX: state.originX,
    originZ: state.originZ,
    artisticControls,
    controlRevision,
    originRevision: originRevisions.observe(state),
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
