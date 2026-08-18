import {
  RealWaterStartupError,
  type StartupDiagnostics,
  type StartupPhase,
} from "./errors.js";
import {
  manifestIdentity,
  normalizePrewarmManifest,
  type PrewarmManifest,
  type PrewarmManifestIdentity,
} from "./manifest.js";

/**
 * Truthful completed-work accounting for one preparation run.
 *
 * @public
 */
export interface StartupProgress {
  readonly completedWork: number;
  readonly totalWork: number;
  readonly lastCompleted?: Readonly<{
    readonly id: string;
    readonly label: string;
  }>;
}

/**
 * The Loading Experience has been requested and no preparation work has begun.
 *
 * @public
 */
export interface LoadingStartupSnapshot {
  readonly status: "loading";
  readonly sequence: number;
}

/**
 * A valid manifest is being prepared.
 *
 * @public
 */
export interface PreparingStartupSnapshot {
  readonly status: "preparing";
  readonly sequence: number;
  readonly manifest: PrewarmManifestIdentity;
  readonly progress: StartupProgress;
}

/**
 * The Readiness Gate has completed and a lease is ready.
 *
 * @public
 */
export interface ReadyStartupSnapshot {
  readonly status: "ready";
  readonly sequence: number;
  readonly manifest: PrewarmManifestIdentity;
  readonly progress: StartupProgress;
}

/**
 * A terminal non-ready startup state.
 *
 * @public
 */
export interface ErrorStartupSnapshot {
  readonly status: "unsupported" | "failed" | "cancelled";
  readonly sequence: number;
  readonly manifest: PrewarmManifestIdentity | null;
  readonly progress: StartupProgress | null;
  readonly error: RealWaterStartupError;
}

/**
 * An observable startup state delivered to a Loading Presenter Adapter.
 *
 * @public
 */
export type StartupSnapshot =
  | LoadingStartupSnapshot
  | PreparingStartupSnapshot
  | ReadyStartupSnapshot
  | ErrorStartupSnapshot;

/**
 * Presentation seam used by core without taking ownership of UI.
 *
 * The first call must resolve only after the Loading Experience has been made
 * visible. Calls are ordered and awaited before Host preparation continues.
 * An Adapter must stop pending presentation work when the signal aborts and
 * must not commit that stale snapshot afterward.
 *
 * @public
 */
export interface LoadingPresenterAdapter {
  present(snapshot: StartupSnapshot, signal: AbortSignal): void | Promise<void>;
}

/**
 * Truthful progress reporter supplied to a Host Lifecycle Adapter.
 *
 * @public
 */
export interface HostProgressReporter {
  /**
   * Reports one declaration only after that work has actually completed.
   */
  complete(declarationId: string): Promise<void>;
}

/**
 * Values supplied to a Host Lifecycle Adapter for one complete preparation.
 *
 * @public
 */
export interface HostPreparationRequest {
  readonly manifest: PrewarmManifest;
  readonly signal: AbortSignal;
  readonly progress: HostProgressReporter;
}

/**
 * Real Water-owned prepared resources returned by a Host Lifecycle Adapter.
 *
 * @public
 */
export interface HostPreparedLease {
  /**
   * Releases only resources created for Real Water. The method may be called
   * more than once and must be safe for the Adapter to observe once.
   */
  dispose(): void | Promise<void>;
}

/**
 * Result of a Host Lifecycle preparation transaction.
 *
 * @public
 */
export type HostPreparationResult =
  | Readonly<{
      readonly status: "ready";
      readonly lease: HostPreparedLease;
    }>
  | Readonly<{
      readonly status: "unsupported";
      readonly reason: string;
      readonly diagnostics?: StartupDiagnostics;
    }>;

/**
 * Host-owned preparation seam. Adapters borrow host state and must never
 * dispose the host renderer, scene, camera, or assets.
 *
 * @public
 */
export interface HostLifecycleAdapter {
  prepare(request: HostPreparationRequest): Promise<HostPreparationResult>;
}

/**
 * Input to the Startup Interface.
 *
 * @public
 */
export interface PrepareRealWaterOptions {
  readonly manifest: PrewarmManifest;
  readonly loading: LoadingPresenterAdapter;
  readonly host: HostLifecycleAdapter;
  readonly signal?: AbortSignal;
}

/**
 * A ready, disposable Real Water lease.
 *
 * @public
 */
export interface RealWaterLease {
  readonly manifest: PrewarmManifestIdentity;

  /**
   * Idempotently releases only Real Water-owned resources.
   */
  dispose(): Promise<void>;
}

/**
 * A single-use, cancellable preparation run.
 *
 * @public
 */
export interface PreparationRun {
  /**
   * Resolves only after the complete mock Readiness Gate passes.
   */
  readonly ready: Promise<RealWaterLease>;

  /**
   * Requests cancellation before readiness. Returns true only for the first
   * request that can still affect this run.
   */
  cancel(reason?: string): boolean;
}

/**
 * Starts a complete, fail-closed preparation run.
 *
 * @public
 */
export function prepareRealWater(
  options: PrepareRealWaterOptions,
): PreparationRun {
  const controller = new AbortController();
  let sequence = 0;
  let terminal = false;
  let cancellationReason = "Preparation cancelled.";
  let currentIdentity: PrewarmManifestIdentity | null = null;
  let currentProgress: StartupProgress | null = null;
  let pendingHostLease: HostPreparedLease | null = null;
  let publishedLease = false;

  const cancel = (reason = "Preparation cancelled."): boolean => {
    if (terminal || controller.signal.aborted) {
      return false;
    }

    cancellationReason = reason;
    controller.abort(reason);
    return true;
  };

  const externalAbort = (): void => {
    const reason =
      typeof options.signal?.reason === "string"
        ? options.signal.reason
        : "Preparation cancelled by the caller.";
    cancel(reason);
  };

  if (options.signal?.aborted === true) {
    externalAbort();
  } else {
    options.signal?.addEventListener("abort", externalAbort, { once: true });
  }

  const present = async (
    snapshot: StartupSnapshot,
    cancellable = true,
  ): Promise<void> => {
    const presentationController = new AbortController();
    const cancelPresentation = (): void => {
      presentationController.abort(controller.signal.reason);
    };
    if (cancellable) {
      if (controller.signal.aborted) {
        cancelPresentation();
      } else {
        controller.signal.addEventListener("abort", cancelPresentation, {
          once: true,
        });
      }
    }

    try {
      const presentation = Promise.resolve().then(() =>
        options.loading.present(snapshot, presentationController.signal),
      );
      await racePresentation(presentation, presentationController.signal);
    } catch (cause) {
      if (cancellable && controller.signal.aborted) {
        throw cancellationError(cancellationReason, cause);
      }
      throw new RealWaterStartupError({
        code: "LOADING_PRESENTER_FAILED",
        phase: "loading-experience",
        retryable: true,
        message: "The Loading Presenter could not commit the startup state.",
        diagnostics: { startupStatus: snapshot.status },
        cause,
      });
    } finally {
      controller.signal.removeEventListener("abort", cancelPresentation);
    }
  };

  const execute = async (): Promise<RealWaterLease> => {
    let phase: StartupPhase = "loading-experience";

    try {
      await present({
        status: "loading",
        sequence: sequence++,
      });
      throwIfCancelled(controller.signal, cancellationReason);

      phase = "manifest-validation";
      const manifest = normalizePrewarmManifest(options.manifest);
      const identity = manifestIdentity(manifest);
      currentIdentity = identity;
      currentProgress = makeProgress(manifest, 0);

      await present({
        status: "preparing",
        sequence: sequence++,
        manifest: identity,
        progress: currentProgress,
      });
      throwIfCancelled(controller.signal, cancellationReason);

      phase = "prewarm";
      const declarations = new Map(
        manifest.declarations.map((declaration) => [
          declaration.id,
          declaration,
        ]),
      );
      const completedIds = new Set<string>();
      let reporterOpen = true;
      let reportQueue = Promise.resolve();
      let reporterFailed = false;
      let reporterFailure: unknown;
      let rejectReporterFailure: (cause: unknown) => void = () => {};
      const reporterFailurePromise = new Promise<never>((_, reject) => {
        rejectReporterFailure = reject;
      });
      const hostController = new AbortController();
      const cancelHost = (): void => {
        hostController.abort(controller.signal.reason);
      };
      const closeReporter = (): void => {
        reporterOpen = false;
      };

      const latchReporterFailure = (cause: unknown): void => {
        if (!reporterFailed) {
          reporterFailed = true;
          reporterFailure = cause;
          closeReporter();
          hostController.abort(cause);
          rejectReporterFailure(cause);
        }
      };

      const progress: HostProgressReporter = {
        complete(declarationId: string): Promise<void> {
          if (!reporterOpen) {
            const failure = Promise.reject(
              protocolError(
                "The Host Adapter reported work after preparation.",
                {
                  completedWork: completedIds.size,
                  declarationId,
                },
              ),
            );
            void failure.catch(() => {});
            return failure;
          }

          const operation = reportQueue.then(async () => {
            if (reporterFailed) {
              throw reporterFailure;
            }
            throwIfCancelled(controller.signal, cancellationReason);

            const declaration = declarations.get(declarationId);
            if (declaration === undefined) {
              throw protocolError(
                "The Host Adapter reported work absent from the manifest.",
                { declarationId },
              );
            }
            if (completedIds.has(declarationId)) {
              throw protocolError(
                "The Host Adapter reported the same work more than once.",
                { declarationId },
              );
            }

            completedIds.add(declarationId);
            currentProgress = makeProgress(
              manifest,
              completedIds.size,
              declaration,
            );
            await present({
              status: "preparing",
              sequence: sequence++,
              manifest: identity,
              progress: currentProgress,
            });
          });

          void operation.catch(latchReporterFailure);
          reportQueue = operation.then(
            () => {},
            () => {},
          );
          return operation;
        },
      };

      if (controller.signal.aborted) {
        cancelHost();
      } else {
        controller.signal.addEventListener("abort", cancelHost, { once: true });
      }
      const hostPromise = Promise.resolve().then(() =>
        options.host.prepare({
          manifest,
          signal: hostController.signal,
          progress,
        }),
      );
      void hostPromise.then(closeReporter, closeReporter);

      let result: HostPreparationResult;
      try {
        result = await raceHostPreparation(
          hostPromise,
          controller.signal,
          cancellationReason,
          closeReporter,
          reporterFailurePromise,
        );

        if (result.status === "ready") {
          pendingHostLease = result.lease;
        }

        await raceReportCompletion(
          reportQueue,
          reporterFailurePromise,
          controller.signal,
          cancellationReason,
        );
        if (reporterFailed) {
          throw reporterFailure;
        }
      } finally {
        controller.signal.removeEventListener("abort", cancelHost);
        if (controller.signal.aborted) {
          closeReporter();
        }
      }

      if (result.status === "unsupported") {
        phase = "host-compatibility";
        throw new RealWaterStartupError({
          code: "UNSUPPORTED_ENVIRONMENT",
          phase,
          retryable: false,
          message: result.reason,
          ...(result.diagnostics === undefined
            ? {}
            : { diagnostics: result.diagnostics }),
        });
      }

      const hostLease = result.lease;
      throwIfCancelled(controller.signal, cancellationReason);

      if (completedIds.size !== manifest.declarations.length) {
        throw protocolError(
          "The Host Adapter returned ready before all declared work completed.",
          {
            completedWork: completedIds.size,
            totalWork: manifest.declarations.length,
          },
        );
      }

      phase = "readiness-gate";
      await present({
        status: "ready",
        sequence: sequence++,
        manifest: identity,
        progress: currentProgress,
      });

      terminal = true;
      const lease = createLease(identity, hostLease);
      publishedLease = true;
      pendingHostLease = null;
      return lease;
    } catch (cause) {
      const error = normalizeStartupError(
        cause,
        phase,
        controller.signal,
        cancellationReason,
      );
      terminal = true;

      if (pendingHostLease !== null && !publishedLease) {
        await disposeHostLease(pendingHostLease);
        pendingHostLease = null;
      }

      if (error.code !== "LOADING_PRESENTER_FAILED") {
        const status =
          error.code === "PREPARATION_CANCELLED"
            ? "cancelled"
            : error.code === "UNSUPPORTED_ENVIRONMENT"
              ? "unsupported"
              : "failed";

        try {
          await present(
            {
              status,
              sequence: sequence++,
              manifest: currentIdentity,
              progress: currentProgress,
              error,
            },
            false,
          );
        } catch {
          // The original structured failure remains the authoritative outcome.
        }
      }

      throw error;
    } finally {
      options.signal?.removeEventListener("abort", externalAbort);
    }
  };

  return Object.freeze({
    ready: execute(),
    cancel,
  });
}

function racePresentation(
  presentation: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", abort);
      reject(new Error("Loading presentation cancelled."));
    };

    if (signal.aborted) {
      abort();
    } else {
      signal.addEventListener("abort", abort, { once: true });
    }

    void presentation.then(
      () => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener("abort", abort);
        resolve();
      },
      (cause: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener("abort", abort);
        reject(cause);
      },
    );
  });
}

function raceHostPreparation(
  hostPromise: Promise<HostPreparationResult>,
  signal: AbortSignal,
  cancellationReason: string,
  onAbort: () => void,
  reporterFailure: Promise<never>,
): Promise<HostPreparationResult> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const abort = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      onAbort();
      signal.removeEventListener("abort", abort);
      reject(cancellationError(cancellationReason));
    };

    if (signal.aborted) {
      abort();
    } else {
      signal.addEventListener("abort", abort, { once: true });
    }

    void hostPromise.then(
      async (result) => {
        if (settled) {
          if (result.status === "ready") {
            await disposeHostLease(result.lease);
          }
          return;
        }

        settled = true;
        signal.removeEventListener("abort", abort);
        resolve(result);
      },
      (cause: unknown) => {
        if (settled) {
          return;
        }

        settled = true;
        signal.removeEventListener("abort", abort);
        reject(cause);
      },
    );

    void reporterFailure.catch((cause: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      signal.removeEventListener("abort", abort);
      reject(cause);
    });
  });
}

function raceReportCompletion(
  reportQueue: Promise<void>,
  reporterFailure: Promise<never>,
  signal: AbortSignal,
  cancellationReason: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", abort);
      reject(cancellationError(cancellationReason));
    };

    if (signal.aborted) {
      abort();
    } else {
      signal.addEventListener("abort", abort, { once: true });
    }

    void reportQueue.then(() => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", abort);
      resolve();
    });
    void reporterFailure.catch((cause: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", abort);
      reject(cause);
    });
  });
}

function makeProgress(
  manifest: PrewarmManifest,
  completedWork: number,
  lastCompleted?: PrewarmManifest["declarations"][number],
): StartupProgress {
  if (lastCompleted === undefined) {
    return Object.freeze({
      completedWork,
      totalWork: manifest.declarations.length,
    });
  }

  return Object.freeze({
    completedWork,
    totalWork: manifest.declarations.length,
    lastCompleted: Object.freeze({
      id: lastCompleted.id,
      label: lastCompleted.label,
    }),
  });
}

function createLease(
  manifest: PrewarmManifestIdentity,
  hostLease: HostPreparedLease,
): RealWaterLease {
  let disposal: Promise<void> | undefined;

  return Object.freeze({
    manifest,
    dispose(): Promise<void> {
      disposal ??= Promise.resolve().then(() => hostLease.dispose());
      return disposal;
    },
  });
}

async function disposeHostLease(lease: HostPreparedLease): Promise<void> {
  try {
    await lease.dispose();
  } catch {
    // Startup still rejects with the primary failure.
  }
}

function throwIfCancelled(signal: AbortSignal, reason: string): void {
  if (!signal.aborted) {
    return;
  }

  throw cancellationError(reason);
}

function cancellationError(
  reason: string,
  cause?: unknown,
): RealWaterStartupError {
  return new RealWaterStartupError({
    code: "PREPARATION_CANCELLED",
    phase: "readiness-gate",
    retryable: true,
    message: reason,
    ...(cause === undefined ? {} : { cause }),
  });
}

function normalizeStartupError(
  cause: unknown,
  phase: StartupPhase,
  signal: AbortSignal,
  cancellationReason: string,
): RealWaterStartupError {
  if (signal.aborted) {
    const error = cancellationError(cancellationReason, cause);
    return phase === "readiness-gate"
      ? error
      : new RealWaterStartupError({
          code: error.code,
          phase,
          retryable: error.retryable,
          message: error.message,
          cause,
        });
  }

  if (cause instanceof RealWaterStartupError) {
    return cause;
  }

  return new RealWaterStartupError({
    code: "PREWARM_FAILED",
    phase,
    retryable: true,
    message: cause instanceof Error ? cause.message : "Prewarm failed.",
    cause,
  });
}

function protocolError(
  message: string,
  diagnostics: StartupDiagnostics,
): RealWaterStartupError {
  return new RealWaterStartupError({
    code: "HOST_PROTOCOL_VIOLATION",
    phase: "prewarm",
    retryable: false,
    message,
    diagnostics,
  });
}
