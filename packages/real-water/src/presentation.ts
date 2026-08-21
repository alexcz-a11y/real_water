import { hasExactKeys, isRecord } from "./internal/record-validation.js";

const HOST_PRESENTATION_KEYS = ["cameraCutRevision"] as const;
const HOST_PRESENTATION_ROUTE_KEYS = ["present"] as const;
const HOST_PRESENTATION_BINDING_KEYS = ["dispose"] as const;
const HOST_PRESENTED_FRAME_KEYS = [
  "presentationId",
  "manifestHash",
  "seed",
  "tick",
  "timeSeconds",
  "simulationResetRevision",
  "controlRevision",
  "originRevision",
  "cameraCutRevision",
  "seaStateCutRevision",
  "temporal",
] as const;
const HOST_PRESENTED_TEMPORAL_KEYS = [
  "historyEpoch",
  "resetReason",
  "resetFrame",
] as const;
const HOST_TEMPORAL_RESET_REASONS = [
  "simulation-reset",
  "camera-cut",
  "origin-shift",
  "sea-state-cut",
] as const;
const SHA_256_PATTERN = /^sha256:[a-f0-9]{64}$/u;

/**
 * Host-authored presentation discontinuities that are not camera matrices.
 *
 * `cameraCutRevision` is a monotonic cut hook. It starts at 0 for a static
 * Host and increments only when the Host reports an explicit camera cut.
 *
 * @public
 */
export interface HostPresentationState {
  readonly cameraCutRevision: number;
}

/**
 * Why Core reset TRAA and dedicated SSR TemporalReproject history for one
 * presented frame. Both histories share this Host domain.
 *
 * Continuous tick, camera, and Artistic Control updates do not emit a reason.
 * `initial` is omitted until a live route actually emits it.
 *
 * @public
 */
export type HostTemporalResetReason =
  "simulation-reset" | "camera-cut" | "origin-shift" | "sea-state-cut";

/**
 * Temporal history carried by one Host-presented frame receipt.
 *
 * @public
 */
export interface HostPresentedTemporal {
  /** Monotonic TRAA and SSR history epoch. Increments only on a successful reset. */
  readonly historyEpoch: number;
  /** Why Core reset TRAA and SSR history, or `null` when history continued. */
  readonly resetReason: HostTemporalResetReason | null;
  /** `true` when this present reset TRAA and SSR history. */
  readonly resetFrame: boolean;
}

/**
 * Receipt-only result of one Core presentation. Named AOVs stay off this root
 * route.
 *
 * @public
 */
export interface HostPresentedFrame {
  /** Monotonic Core present identifier for this bound route. */
  readonly presentationId: number;
  /** SHA-256 identity of the prepared Prewarm Manifest. */
  readonly manifestHash: string;
  /** Authoritative Host simulation seed copied onto the receipt. */
  readonly seed: number;
  /** Authoritative Host simulation tick copied onto the receipt. */
  readonly tick: number;
  /** Authoritative Host simulation time in seconds. */
  readonly timeSeconds: number;
  /** Authoritative Host simulation-reset revision copied onto the receipt. */
  readonly simulationResetRevision: number;
  /** Host Artistic Control revision at present time. */
  readonly controlRevision: number;
  /** Host origin-shift revision at present time. */
  readonly originRevision: number;
  /** Host camera-cut revision at present time. */
  readonly cameraCutRevision: number;
  /** Host sea-state-cut revision at present time. */
  readonly seaStateCutRevision: number;
  /** TRAA and dedicated SSR history epoch and reset association for this present. */
  readonly temporal: HostPresentedTemporal;
}

/**
 * Opaque Host-owned present command. The route is receipt-only.
 *
 * @public
 */
export interface HostPresentationRoute {
  /** Presents one Core frame and returns the receipt-only result. */
  present(): Promise<HostPresentedFrame>;
}

/**
 * Handle returned by {@link HostPresentationAdapter.bind}. `dispose()` is
 * idempotent and must stop, cancel, and drain any Host-owned scheduling.
 *
 * @public
 */
export interface HostPresentationBinding {
  dispose(): void;
}

/**
 * Host-owned source of presentation cut revisions and the Core present route.
 *
 * `bind(route)` must only accept or store the route. It must not call
 * `present()` or schedule a frame. Hosts that drive frames start later.
 *
 * @public
 */
export interface HostPresentationAdapter {
  snapshot(): HostPresentationState;
  bind(route: HostPresentationRoute): HostPresentationBinding;
}

/**
 * Creates an immutable Host Presentation Adapter with camera-cut revision 0.
 *
 * `bind(route)` validates the route and returns a no-op binding. The static
 * Adapter does not retain or drive the route.
 *
 * @public
 */
export function createStaticHostPresentationAdapter(): HostPresentationAdapter {
  const snapshot = Object.freeze({ cameraCutRevision: 0 });
  return Object.freeze({
    snapshot: () => snapshot,
    bind(route: HostPresentationRoute): HostPresentationBinding {
      readHostPresentationRoute(route);
      return createNoopPresentationBinding();
    },
  });
}

/**
 * Confirms a Host Presentation Adapter exposes `snapshot()` and `bind(route)`
 * and that its snapshot uses the exact public key set.
 *
 * @public
 */
export function assertHostPresentationAdapter(
  presentation: HostPresentationAdapter,
): HostPresentationAdapter {
  if (
    !isRecord(presentation) ||
    typeof presentation.snapshot !== "function" ||
    typeof presentation.bind !== "function"
  ) {
    throw new TypeError(
      "The Host Presentation Adapter requires snapshot() and bind(route).",
    );
  }
  readHostPresentationState(presentation);
  return presentation;
}

/**
 * Reads and validates Host Presentation state.
 *
 * The snapshot must use the exact public key set. `cameraCutRevision` must be a
 * finite non-negative safe integer.
 *
 * @public
 */
export function readHostPresentationState(
  presentation: HostPresentationAdapter,
): HostPresentationState {
  const state = presentation.snapshot();
  if (!isRecord(state) || !hasExactKeys(state, HOST_PRESENTATION_KEYS)) {
    throw new TypeError(
      "Host Presentation must use the exact camera-cut revision state.",
    );
  }
  return Object.freeze({
    cameraCutRevision: readNonNegativeSafeInteger(
      state.cameraCutRevision,
      "Host Presentation camera-cut revision",
    ),
  });
}

/**
 * Reads and validates the opaque Host Presentation Route.
 *
 * The route must use the exact `present()` key set. Named outputs must not
 * appear on this root contract.
 *
 * @public
 */
export function readHostPresentationRoute(
  route: HostPresentationRoute,
): HostPresentationRoute {
  if (!isRecord(route) || !hasExactKeys(route, HOST_PRESENTATION_ROUTE_KEYS)) {
    throw new TypeError(
      "Host Presentation Route must use the exact present() contract.",
    );
  }
  if (typeof route.present !== "function") {
    throw new TypeError("Host Presentation Route must implement present().");
  }
  return route;
}

/**
 * Reads and validates a Host Presentation Binding.
 *
 * The binding must use the exact `dispose()` key set.
 *
 * @public
 */
export function readHostPresentationBinding(
  binding: HostPresentationBinding,
): HostPresentationBinding {
  if (
    !isRecord(binding) ||
    !hasExactKeys(binding, HOST_PRESENTATION_BINDING_KEYS)
  ) {
    throw new TypeError(
      "Host Presentation Binding must use the exact dispose() contract.",
    );
  }
  if (typeof binding.dispose !== "function") {
    throw new TypeError("Host Presentation Binding must implement dispose().");
  }
  return binding;
}

/**
 * Reads and validates one receipt-only presented frame.
 *
 * @public
 */
export function readHostPresentedFrame(
  frame: HostPresentedFrame,
): HostPresentedFrame {
  if (!isRecord(frame) || !hasExactKeys(frame, HOST_PRESENTED_FRAME_KEYS)) {
    throw new TypeError(
      "Host presented frame must use the exact receipt contract.",
    );
  }
  if (
    typeof frame.manifestHash !== "string" ||
    !SHA_256_PATTERN.test(frame.manifestHash)
  ) {
    throw new TypeError(
      "Host presented frame manifestHash must be a lowercase SHA-256 digest.",
    );
  }
  const temporal = readHostPresentedTemporal(frame.temporal);
  return Object.freeze({
    presentationId: readNonNegativeSafeInteger(
      frame.presentationId,
      "Host presented frame presentationId",
    ),
    manifestHash: frame.manifestHash,
    seed: readUnsigned32(frame.seed, "Host presented frame seed"),
    tick: readNonNegativeSafeInteger(frame.tick, "Host presented frame tick"),
    timeSeconds: readNonNegativeFinite(
      frame.timeSeconds,
      "Host presented frame timeSeconds",
    ),
    simulationResetRevision: readNonNegativeSafeInteger(
      frame.simulationResetRevision,
      "Host presented frame simulationResetRevision",
    ),
    controlRevision: readNonNegativeSafeInteger(
      frame.controlRevision,
      "Host presented frame controlRevision",
    ),
    originRevision: readNonNegativeSafeInteger(
      frame.originRevision,
      "Host presented frame originRevision",
    ),
    cameraCutRevision: readNonNegativeSafeInteger(
      frame.cameraCutRevision,
      "Host presented frame cameraCutRevision",
    ),
    seaStateCutRevision: readNonNegativeSafeInteger(
      frame.seaStateCutRevision,
      "Host presented frame seaStateCutRevision",
    ),
    temporal,
  });
}

function readHostPresentedTemporal(
  value: HostPresentedTemporal,
): HostPresentedTemporal {
  if (!isRecord(value) || !hasExactKeys(value, HOST_PRESENTED_TEMPORAL_KEYS)) {
    throw new TypeError(
      "Host presented temporal state must use the exact receipt contract.",
    );
  }
  const { resetReason, resetFrame } = value;
  if (resetReason !== null && !isHostTemporalResetReason(resetReason)) {
    throw new TypeError(
      "Host presented resetReason must be a supported temporal discontinuity.",
    );
  }
  if (typeof resetFrame !== "boolean") {
    throw new TypeError("Host presented resetFrame must be boolean.");
  }
  if (resetFrame !== (resetReason !== null)) {
    throw new TypeError(
      "Host presented resetFrame must match the presence of resetReason.",
    );
  }
  return Object.freeze({
    historyEpoch: readNonNegativeSafeInteger(
      value.historyEpoch,
      "Host presented historyEpoch",
    ),
    resetReason,
    resetFrame,
  });
}

function isHostTemporalResetReason(
  value: unknown,
): value is HostTemporalResetReason {
  return (
    typeof value === "string" &&
    (HOST_TEMPORAL_RESET_REASONS as readonly string[]).includes(value)
  );
}

function readNonNegativeSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${label} must be a finite non-negative safe integer.`,
    );
  }
  return value;
}

function readUnsigned32(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 0xffff_ffff
  ) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer.`);
  }
  return value;
}

function readNonNegativeFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative.`);
  }
  return value;
}

function createNoopPresentationBinding(): HostPresentationBinding {
  return Object.freeze({
    dispose() {},
  });
}
