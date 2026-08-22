import { RealWaterRuntimeError } from "./errors.js";
import { MAX_GAMEPLAY_QUERY_POINTS } from "./capabilities.js";
import { hasExactKeys, isRecord } from "./internal/record-validation.js";
import {
  createOriginRevisionTracker,
  type OriginRevisionTracker,
} from "./internal/origin-revision-tracker.js";
import { writeSpectralBandQueries } from "./internal/spectral-bands.js";
import { createWaterPreset } from "./water-preset.js";
import {
  readHostPresentationState,
  type HostPresentationAdapter,
} from "./presentation.js";

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
  /** How strongly glancing views pick up the Host environment. */
  readonly grazingReflection: number;
  /** How strongly the Host environment radiance appears on the surface. */
  readonly environmentReflection: number;
  /** How clearly the Host scene behind the water shows through. */
  readonly depthSeeThrough: number;
  /** How quickly the water column colors with optical path. */
  readonly depthColoring: number;
  /** How much in-water glow gathers along the optical path. */
  readonly inWaterGlow: number;
  /** How brightly thin crests transmit light. */
  readonly crestGlow: number;
}

export const ARTISTIC_CONTROL_KEYS = [
  "waveStrength",
  "swellDrama",
  "directionality",
  "choppiness",
  "crestSharpness",
  "microDetail",
  "timeScale",
  "grazingReflection",
  "environmentReflection",
  "depthSeeThrough",
  "depthColoring",
  "inWaterGlow",
  "crestGlow",
] as const;

const DEFAULT_ARTISTIC_CONTROLS: ArtisticControls =
  createWaterPreset("swell").artisticControls;

/**
 * Host-authored deterministic state for the Open Water Domain.
 *
 * `originX` and `originZ` are the Host-owned floating-origin offset in metres.
 * Gameplay Query positions are in the current Host frame; the runtime evaluates
 * the Open Water Domain at `(x + originX, z + originZ)`.
 * `seaLevelMetres` is the single horizontal Open Water Domain mean level.
 *
 * `simulationResetRevision` is a monotonic Host-authored reset hook. It starts
 * at 0 from adapter creation and increments on every explicit Host simulation
 * reset, including when seed and tick are unchanged. Seed change, tick rewind,
 * and time rewind remain fail-safe Core resets even if this revision is
 * unchanged.
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
  readonly seaLevelMetres: number;
  readonly simulationResetRevision: number;
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
 * across origin shifts. `seaStateCutRevision` increments only on an explicit
 * sea-state cut. `cameraCutRevision` is read from the Host Presentation
 * Adapter and is not stored as runtime-owned durable state.
 *
 * @public
 */
export interface OpenWaterRuntimeSnapshot extends HostSimulationState {
  readonly artisticControls: ArtisticControls;
  readonly controlRevision: number;
  readonly originRevision: number;
  readonly seaStateCutRevision: number;
  readonly cameraCutRevision: number;
}

/**
 * How an Artistic Control update treats the previous presented sea state.
 *
 * `continuous` updates the current field and preserves previous presented
 * controls. `sea-state-cut` is an explicit history reset even when values are
 * unchanged.
 *
 * @public
 */
export type ArtisticControlTransition = "continuous" | "sea-state-cut";

/**
 * Exact options for a hot Artistic Control update.
 *
 * @public
 */
export interface ArtisticControlUpdateOptions {
  readonly transition: ArtisticControlTransition;
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
  readonly transition: ArtisticControlTransition;
  readonly seaStateCutRevision: number;
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
    options?: ArtisticControlUpdateOptions,
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
  presentation: HostPresentationAdapter,
  sink?: RuntimeStateSink,
): RealWaterRuntime {
  readHostPresentationState(presentation);
  let artisticControls = DEFAULT_ARTISTIC_CONTROLS;
  let controlRevision = 0;
  let seaStateCutRevision = 0;
  let queryTick = -1;
  let queriesUsedThisTick = 0;
  const originRevisions = createOriginRevisionTracker(
    readHostSimulationState(simulation),
  );

  return Object.freeze({
    updateArtisticControls(
      controls: ArtisticControls,
      options?: ArtisticControlUpdateOptions,
    ): ArtisticControlUpdateReceipt {
      assertActive();
      const presentationState = readHostPresentationState(presentation);
      const nextTransition = readArtisticControlUpdateOptions(options);
      const nextControls = freezeArtisticControls(controls);
      const changed = artisticControlsChanged(artisticControls, nextControls);
      if (changed) {
        artisticControls = nextControls;
        controlRevision += 1;
      }
      if (nextTransition === "sea-state-cut") {
        seaStateCutRevision += 1;
      }
      if (changed || nextTransition === "sea-state-cut") {
        sink?.synchronize(
          readSnapshot(
            simulation,
            presentationState,
            artisticControls,
            controlRevision,
            originRevisions,
            seaStateCutRevision,
          ),
        );
      }
      return Object.freeze({
        artisticControls,
        changed,
        revision: controlRevision,
        transition: nextTransition,
        seaStateCutRevision,
      });
    },
    queryGameplay(batch: GameplayQueryBatch): GameplayQueryResults {
      assertActive();
      readHostPresentationState(presentation);
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
        readHostPresentationState(presentation),
        artisticControls,
        controlRevision,
        originRevisions,
        seaStateCutRevision,
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
    seaLevelMetres: 0,
    simulationResetRevision: 0,
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
  if (!Number.isFinite(state.seaLevelMetres)) {
    throw new RangeError("Open Water sea level must be finite metres.");
  }
  if (
    !Number.isSafeInteger(state.simulationResetRevision) ||
    state.simulationResetRevision < 0
  ) {
    throw new RangeError(
      "Open Water simulationResetRevision must be a non-negative safe integer.",
    );
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
  assertControlRange(value.grazingReflection, 0, 2, "grazingReflection");
  assertControlRange(
    value.environmentReflection,
    0,
    2,
    "environmentReflection",
  );
  assertControlRange(value.depthSeeThrough, 0, 2, "depthSeeThrough");
  assertControlRange(value.depthColoring, 0, 2, "depthColoring");
  assertControlRange(value.inWaterGlow, 0, 2, "inWaterGlow");
  assertControlRange(value.crestGlow, 0, 2, "crestGlow");

  return Object.freeze({
    waveStrength: value.waveStrength,
    swellDrama: value.swellDrama,
    directionality: value.directionality,
    choppiness: value.choppiness,
    crestSharpness: value.crestSharpness,
    microDetail: value.microDetail,
    timeScale: value.timeScale,
    grazingReflection: value.grazingReflection,
    environmentReflection: value.environmentReflection,
    depthSeeThrough: value.depthSeeThrough,
    depthColoring: value.depthColoring,
    inWaterGlow: value.inWaterGlow,
    crestGlow: value.crestGlow,
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

function readArtisticControlUpdateOptions(
  options: ArtisticControlUpdateOptions | undefined,
): ArtisticControlTransition {
  if (options === undefined) {
    return "continuous";
  }
  if (!isRecord(options) || !hasExactKeys(options, ["transition"])) {
    throw new TypeError(
      "Artistic Control update options must use the exact supported set.",
    );
  }
  if (
    options.transition !== "continuous" &&
    options.transition !== "sea-state-cut"
  ) {
    throw new TypeError(
      "Artistic Control transition must be continuous or sea-state-cut.",
    );
  }
  return options.transition;
}

function readSnapshot(
  simulation: HostSimulationAdapter,
  presentationState: ReturnType<typeof readHostPresentationState>,
  artisticControls: ArtisticControls,
  controlRevision: number,
  originRevisions: OriginRevisionTracker,
  seaStateCutRevision: number,
): OpenWaterRuntimeSnapshot {
  const state = readHostSimulationState(simulation);
  return freezeSnapshot({
    seed: state.seed,
    tick: state.tick,
    timeSeconds: state.timeSeconds,
    paused: state.paused,
    originX: state.originX,
    originZ: state.originZ,
    seaLevelMetres: state.seaLevelMetres,
    simulationResetRevision: state.simulationResetRevision,
    artisticControls,
    controlRevision,
    originRevision: originRevisions.observe(state),
    seaStateCutRevision,
    cameraCutRevision: presentationState.cameraCutRevision,
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
