/**
 * Stable startup error identifiers suitable for control flow and diagnostics.
 *
 * @public
 */
export type StartupErrorCode =
  | "MANIFEST_INVALID"
  | "MANIFEST_VERSION_UNSUPPORTED"
  | "UNSUPPORTED_ENVIRONMENT"
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

function formatDiagnosticText(error: RealWaterStartupError): string {
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
