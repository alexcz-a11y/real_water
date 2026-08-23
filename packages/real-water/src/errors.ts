/**
 * Stable Host compatibility rejection identifiers.
 *
 * @public
 */
export type HostCompatibilityErrorCode =
  | "UNSUPPORTED_ENVIRONMENT"
  | "CORE_WEBGPU_REQUIRED"
  | "WEBGPU_COMPATIBILITY_MODE_UNSUPPORTED"
  | "WEBGPU_LIMIT_UNSUPPORTED";

/**
 * Stable retryable Host preparation failure identifiers.
 *
 * @public
 */
export type HostPreparationFailureCode =
  "RENDERER_INITIALIZATION_FAILED" | "WEBGPU_DEVICE_LOST";

/**
 * Stable startup error identifiers suitable for control flow and diagnostics.
 *
 * @public
 */
export type StartupErrorCode =
  | "MANIFEST_INVALID"
  | "MANIFEST_VERSION_UNSUPPORTED"
  | HostCompatibilityErrorCode
  | HostPreparationFailureCode
  | "HOST_PROTOCOL_VIOLATION"
  | "PREWARM_FAILED"
  | "LOADING_PRESENTER_FAILED"
  | "PREPARATION_CANCELLED";

/**
 * Coarse startup phases that remain stable while internal prewarm work evolves.
 *
 * @public
 */
export type StartupPhase =
  | "loading-experience"
  | "manifest-validation"
  | "host-compatibility"
  | "prewarm"
  | "readiness-gate";

/**
 * JSON-safe diagnostic values exposed by startup failures.
 *
 * @public
 */
export type StartupDiagnostics = Readonly<
  Record<string, string | number | boolean | null>
>;

/**
 * Stable ready-runtime error identifiers suitable for command control flow.
 *
 * @public
 */
export type RuntimeErrorCode =
  | "EFFECT_NOT_PREWARMED"
  | "BODY_CAPACITY_EXCEEDED"
  | "BODY_ROUTE_TICK_REPEATED"
  | "INTERACTION_ANCHOR_CAPACITY_EXCEEDED"
  | "INTERACTION_ANCHOR_OWNED_BY_BODY"
  | "GAMEPLAY_QUERY_CAPACITY_EXCEEDED"
  | "RUNTIME_INVALIDATED";

/**
 * JSON-safe diagnostic values exposed by ready-runtime failures.
 *
 * @public
 */
export type RuntimeDiagnostics = StartupDiagnostics;

/**
 * Constructor values for {@link RealWaterRuntimeError}.
 *
 * @public
 */
export interface RealWaterRuntimeErrorInit {
  readonly code: RuntimeErrorCode;
  readonly message: string;
  readonly diagnostics?: RuntimeDiagnostics;
  readonly cause?: unknown;
}

/**
 * A structured, copyable failure from a ready Runtime command.
 *
 * @public
 */
export class RealWaterRuntimeError extends Error {
  public readonly code: RuntimeErrorCode;
  public readonly diagnosticText: string;
  public readonly diagnostics: RuntimeDiagnostics;

  public constructor(init: RealWaterRuntimeErrorInit) {
    super(
      init.message,
      init.cause === undefined ? undefined : { cause: init.cause },
    );
    this.name = "RealWaterRuntimeError";
    this.code = init.code;
    this.diagnostics = Object.freeze({ ...init.diagnostics });
    this.diagnosticText = formatDiagnosticText(this);
  }
}

/**
 * Constructor values for {@link RealWaterStartupError}.
 *
 * @public
 */
export interface RealWaterStartupErrorInit {
  readonly code: StartupErrorCode;
  readonly phase: StartupPhase;
  readonly retryable: boolean;
  readonly message: string;
  readonly diagnostics?: StartupDiagnostics;
  readonly cause?: unknown;
}

/**
 * A structured, copyable failure from the Startup Interface.
 *
 * @public
 */
export class RealWaterStartupError extends Error {
  public readonly code: StartupErrorCode;
  public readonly diagnosticText: string;
  public readonly diagnostics: StartupDiagnostics;
  public readonly phase: StartupPhase;
  public readonly retryable: boolean;

  public constructor(init: RealWaterStartupErrorInit) {
    super(
      init.message,
      init.cause === undefined ? undefined : { cause: init.cause },
    );
    this.name = "RealWaterStartupError";
    this.code = init.code;
    this.phase = init.phase;
    this.retryable = init.retryable;
    this.diagnostics = Object.freeze({ ...init.diagnostics });
    this.diagnosticText = formatDiagnosticText(this);
  }
}

function formatDiagnosticText(
  error: Readonly<{
    readonly code: string;
    readonly message: string;
    readonly diagnostics: StartupDiagnostics;
  }>,
): string {
  const entries = Object.entries(error.diagnostics).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const details =
    entries.length === 0
      ? ""
      : "\n" +
        entries.map(([key, value]) => key + ": " + String(value)).join("\n");

  return error.code + ": " + error.message + details;
}
