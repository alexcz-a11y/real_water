import {
  RealWaterRuntimeError,
  RealWaterStartupError,
  type HostCompatibilityErrorCode,
  type HostPreparationFailureCode,
  type RuntimeDiagnostics,
  type StartupDiagnostics,
  type StartupPhase,
} from "./errors.js";
import {
  manifestIdentity,
  normalizePrewarmManifest,
  type PrewarmManifest,
  type PrewarmManifestIdentity,
} from "./manifest.js";
import type { RealWaterCapabilities } from "./capabilities.js";
import {
  createRealWaterRuntime,
  type HostSimulationAdapter,
  type RealWaterRuntime,
} from "./runtime.js";
import type { HostPresentationAdapter } from "./presentation.js";
import {
  readHostPresentationBinding,
  readHostPresentationRoute,
  type HostPresentationBinding,
} from "./presentation.js";
import { runtimeStateSink } from "./internal/runtime-state-bridge.js";
import {
  activatePreparedPresentationRoute,
  connectPreparedPresentationRoute,
  createPresentationBindSession,
  unbindPreparedPresentationRoute,
} from "./internal/presentation-route-bridge.js";

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
 * The immutable reason a prepared lease can no longer be used.
 *
 * @public
 */
export interface WebGPUDeviceLoss {
  readonly code: "WEBGPU_DEVICE_LOST";
  readonly message: string;
  readonly reason: string | null;
  readonly diagnostics: StartupDiagnostics;
}

/**
 * The immutable invalidation raised when a ready runtime resumes too late to
 * preserve coherent temporal state.
 *
 * @public
 */
export interface LongSuspensionInvalidation {
  readonly code: "LONG_SUSPENSION";
  readonly message: string;
  readonly diagnostics: RuntimeDiagnostics;
}

/**
 * The first terminal condition observed by a ready Real Water lease.
 *
 * @public
 */
export type RealWaterInvalidation =
  WebGPUDeviceLoss | LongSuspensionInvalidation;

/**
 * Real Water-owned prepared resources returned by a Host Lifecycle Adapter.
 *
 * @public
 */
export interface HostPreparedLease {
  /**
   * Resolves once if the borrowed WebGPU device is lost. It never rejects.
   */
  readonly invalidated: Promise<WebGPUDeviceLoss>;

  /** Host-owned authoritative time and seed source for the ready runtime. */
  readonly simulation: HostSimulationAdapter;

  /** Host-owned presentation cut revisions for the ready runtime. */
  readonly presentation: HostPresentationAdapter;

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
      readonly capabilities: RealWaterCapabilities;
      readonly lease: HostPreparedLease;
    }>
  | Readonly<{
      readonly status: "unsupported";
      readonly code?: HostCompatibilityErrorCode;
      readonly reason: string;
      readonly retryable?: boolean;
      readonly diagnostics?: StartupDiagnostics;
    }>
  | Readonly<{
      readonly status: "failed";
      readonly code: HostPreparationFailureCode;
      readonly reason: string;
      readonly retryable: boolean;
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
 * One exact effect route selected from the active Prewarm Manifest.
 *
 * @public
 */
export interface EffectVariantSelection {
  readonly effectId: string;
  readonly variantId: string;
}

/**
 * The immutable outcome of selecting a prepared effect route.
 *
 * @public
 */
export interface EffectVariantSelectionReceipt {
  readonly selection: EffectVariantSelection;
  readonly changed: boolean;
  readonly revision: number;
}

/**
 * A ready, disposable Real Water lease.
 *
 * @public
 */
export interface RealWaterLease extends RealWaterRuntime {
  readonly capabilities: RealWaterCapabilities;
  /** Resolves once after the first runtime invalidation. It never rejects. */
  readonly invalidated: Promise<RealWaterInvalidation>;
  readonly manifest: PrewarmManifestIdentity;

  /**
   * Invalidates temporal runtime state after a long Host suspension.
   */
  invalidateForLongSuspension(): LongSuspensionInvalidation;

  /**
   * Selects an effect route already prepared by this lease's manifest.
   */
  selectEffectVariant(
    selection: EffectVariantSelection,
  ): EffectVariantSelectionReceipt;

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
   * Resolves only after the complete Readiness Gate passes.
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
  const hostInvalidationController = new AbortController();
  let sequence = 0;
  let terminal = false;
  let cancellationReason = "Preparation cancelled.";
  let currentIdentity: PrewarmManifestIdentity | null = null;
  let currentProgress: StartupProgress | null = null;
  let pendingHostLease: HostPreparedLease | null = null;
  let pendingPublicLease: RealWaterLease | null = null;
  let publishedLease = false;
  let preparationDeviceLoss: WebGPUDeviceLoss | undefined;

  const invalidateBeforeReady = (loss: WebGPUDeviceLoss): void => {
    if (
      terminal ||
      publishedLease ||
      hostInvalidationController.signal.aborted
    ) {
      return;
    }
    preparationDeviceLoss = freezeDeviceLoss(loss);
    hostInvalidationController.abort(preparationDeviceLoss);
  };

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
    const invalidatePresentation = (): void => {
      presentationController.abort(hostInvalidationController.signal.reason);
    };
    if (cancellable) {
      if (controller.signal.aborted) {
        cancelPresentation();
      } else {
        controller.signal.addEventListener("abort", cancelPresentation, {
          once: true,
        });
      }
      if (hostInvalidationController.signal.aborted) {
        invalidatePresentation();
      } else {
        hostInvalidationController.signal.addEventListener(
          "abort",
          invalidatePresentation,
          { once: true },
        );
      }
    }

    try {
      const presentation = Promise.resolve().then(() => {
        if (presentationController.signal.aborted) {
          throw new Error("Loading presentation cancelled.");
        }
        return options.loading.present(snapshot, presentationController.signal);
      });
      await racePresentation(presentation, presentationController.signal);
    } catch (cause) {
      if (cancellable && controller.signal.aborted) {
        throw cancellationError(cancellationReason, cause);
      }
      if (preparationDeviceLoss !== undefined) {
        throw startupDeviceLossError(preparationDeviceLoss);
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
      hostInvalidationController.signal.removeEventListener(
        "abort",
        invalidatePresentation,
      );
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
          void result.lease.invalidated.then(invalidateBeforeReady, () => {});
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

      if (result.status === "unsupported" || result.status === "failed") {
        phase = "host-compatibility";
        throw new RealWaterStartupError({
          code:
            result.status === "unsupported"
              ? (result.code ?? "UNSUPPORTED_ENVIRONMENT")
              : result.code,
          phase,
          retryable: result.retryable ?? false,
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
      pendingPublicLease = createLease(
        manifest,
        identity,
        result.capabilities,
        hostLease,
      );
      await present({
        status: "ready",
        sequence: sequence++,
        manifest: identity,
        progress: currentProgress,
      });

      terminal = true;
      publishedLease = true;
      pendingHostLease = null;
      return pendingPublicLease;
    } catch (cause) {
      const error = normalizeStartupError(
        cause,
        phase,
        controller.signal,
        cancellationReason,
      );
      terminal = true;

      if (pendingPublicLease !== null && !publishedLease) {
        await pendingPublicLease.dispose();
        pendingPublicLease = null;
        pendingHostLease = null;
      } else if (pendingHostLease !== null && !publishedLease) {
        await disposeHostLease(pendingHostLease);
        pendingHostLease = null;
      }

      if (error.code !== "LOADING_PRESENTER_FAILED") {
        const status =
          error.code === "PREPARATION_CANCELLED"
            ? "cancelled"
            : isUnsupportedEnvironment(error.code)
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
  preparedManifest: PrewarmManifest,
  manifest: PrewarmManifestIdentity,
  capabilities: RealWaterCapabilities,
  hostLease: HostPreparedLease,
): RealWaterLease {
  let disposal: Promise<void> | undefined;
  let selectionRevision = 0;
  let terminalState: "active" | "disposed" | RealWaterInvalidation = "active";
  let resolveInvalidation: (
    invalidation: RealWaterInvalidation,
  ) => void = () => {};
  const selectedVariants = new Map<string, string>();
  const invalidated = new Promise<RealWaterInvalidation>((resolve) => {
    resolveInvalidation = resolve;
  });
  const latchInvalidation = (invalidation: RealWaterInvalidation): void => {
    if (terminalState !== "active") {
      return;
    }
    terminalState = invalidation;
    resolveInvalidation(invalidation);
  };
  void hostLease.invalidated.then(
    (loss) => {
      latchInvalidation(freezeDeviceLoss(loss));
    },
    () => {},
  );
  const longSuspensionInvalidation = createLongSuspensionInvalidation();
  const runtime = createRealWaterRuntime(
    () => {
      if (terminalState !== "active") {
        throw runtimeInvalidatedError(terminalState);
      }
    },
    hostLease.simulation,
    hostLease.presentation,
    runtimeStateSink(hostLease),
  );
  const bindSession = createPresentationBindSession(
    connectPreparedPresentationRoute(hostLease, () => runtime.inspectRuntime()),
  );
  let presentationBinding: HostPresentationBinding;
  try {
    presentationBinding = readHostPresentationBinding(
      hostLease.presentation.bind(readHostPresentationRoute(bindSession.route)),
    );
    if (bindSession.presentedDuringBind) {
      throw new Error("Host Presentation bind must not call present().");
    }
  } catch (cause) {
    throw new RealWaterStartupError({
      code: "HOST_PROTOCOL_VIOLATION",
      phase: "readiness-gate",
      retryable: false,
      message:
        cause instanceof Error
          ? cause.message
          : "Host Presentation bind failed.",
      cause,
    });
  }
  activatePreparedPresentationRoute(hostLease);
  bindSession.activate();

  return Object.freeze({
    updateArtisticControls: runtime.updateArtisticControls,
    updateInteractionAnchor: runtime.updateInteractionAnchor,
    submitDisturbances: runtime.submitDisturbances,
    queryGameplay: runtime.queryGameplay,
    attachBody: runtime.attachBody,
    inspectRuntime: runtime.inspectRuntime,
    capabilities,
    invalidated,
    manifest,
    invalidateForLongSuspension(): LongSuspensionInvalidation {
      if (terminalState === "active") {
        latchInvalidation(longSuspensionInvalidation);
        return longSuspensionInvalidation;
      }
      if (
        terminalState !== "disposed" &&
        terminalState.code === "LONG_SUSPENSION"
      ) {
        return terminalState;
      }
      throw runtimeInvalidatedError(terminalState);
    },
    selectEffectVariant(
      selection: EffectVariantSelection,
    ): EffectVariantSelectionReceipt {
      if (terminalState !== "active") {
        throw runtimeInvalidatedError(terminalState);
      }

      const selected = Object.freeze({
        effectId: selection.effectId,
        variantId: selection.variantId,
      });
      const prepared = preparedManifest.effectVariants.some(
        (candidate) =>
          candidate.effectId === selected.effectId &&
          candidate.variantId === selected.variantId,
      );
      if (!prepared) {
        throw new RealWaterRuntimeError({
          code: "EFFECT_NOT_PREWARMED",
          message:
            "The requested effect variant was not prepared by this lease.",
          diagnostics: {
            effectId: selected.effectId,
            manifestHash: preparedManifest.manifestHash,
            variantId: selected.variantId,
          },
        });
      }

      const changed =
        selectedVariants.get(selected.effectId) !== selected.variantId;
      if (changed) {
        selectedVariants.set(selected.effectId, selected.variantId);
        selectionRevision += 1;
      }

      return Object.freeze({
        selection: selected,
        changed,
        revision: selectionRevision,
      });
    },
    dispose(): Promise<void> {
      if (terminalState === "active") {
        terminalState = "disposed";
      }
      runtime.disposeBodyAttachments();
      unbindPreparedPresentationRoute(hostLease);
      try {
        presentationBinding.dispose();
      } catch {
        // Host binding disposal must not block Core resource teardown.
      }
      disposal ??= Promise.resolve().then(() => hostLease.dispose());
      return disposal;
    },
  });
}

function freezeDeviceLoss(loss: WebGPUDeviceLoss): WebGPUDeviceLoss {
  return Object.freeze({
    code: "WEBGPU_DEVICE_LOST",
    message: loss.message,
    reason: loss.reason,
    diagnostics: Object.freeze({ ...loss.diagnostics }),
  });
}

function createLongSuspensionInvalidation(): LongSuspensionInvalidation {
  return Object.freeze({
    code: "LONG_SUSPENSION",
    message: "The Real Water runtime was invalidated after a long suspension.",
    diagnostics: Object.freeze({ runtimeState: "long-suspension" }),
  });
}

function runtimeInvalidatedError(
  terminalState: "disposed" | RealWaterInvalidation,
): RealWaterRuntimeError {
  if (terminalState === "disposed") {
    return new RealWaterRuntimeError({
      code: "RUNTIME_INVALIDATED",
      message: "The Real Water runtime has been disposed.",
      diagnostics: { runtimeState: "disposed" },
    });
  }
  if (terminalState.code === "LONG_SUSPENSION") {
    return new RealWaterRuntimeError({
      code: "RUNTIME_INVALIDATED",
      message: terminalState.message,
      diagnostics: terminalState.diagnostics,
    });
  }
  return new RealWaterRuntimeError({
    code: "RUNTIME_INVALIDATED",
    message: "The Real Water runtime was invalidated by WebGPU device loss.",
    diagnostics: {
      deviceLossMessage: terminalState.message,
      deviceLossReason: terminalState.reason,
      runtimeState: "device-lost",
    },
  });
}

function startupDeviceLossError(loss: WebGPUDeviceLoss): RealWaterStartupError {
  return new RealWaterStartupError({
    code: "WEBGPU_DEVICE_LOST",
    phase: "readiness-gate",
    retryable: true,
    message: "The WebGPU device was lost before readiness completed.",
    diagnostics: {
      deviceLossMessage: loss.message,
      deviceLossReason: loss.reason,
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

function isUnsupportedEnvironment(code: string): boolean {
  return (
    code === "UNSUPPORTED_ENVIRONMENT" ||
    code === "CORE_WEBGPU_REQUIRED" ||
    code === "WEBGPU_COMPATIBILITY_MODE_UNSUPPORTED" ||
    code === "WEBGPU_LIMIT_UNSUPPORTED"
  );
}
