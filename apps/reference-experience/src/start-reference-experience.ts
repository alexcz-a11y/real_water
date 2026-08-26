import {
  RealWaterStartupError,
  createMinimalWaterPrewarmManifest,
  createMinimalWaterQualityProfile,
  prepareRealWater,
  type HostLifecycleAdapter,
  type HostPreparationRequest,
  type HostPreparationResult,
  type HostPreparedLease,
  type MinimalWaterQualityProfileId,
  type PreparationRun,
  type PrewarmDrawingBuffer,
  type PrewarmManifest,
  type QualityProfile,
  type RealWaterLease,
  type WebGPUDeviceLoss,
} from "real-water";
import { DomLoadingPresenter } from "./loading-presenter.js";
import type { LocalPresetLibrary } from "./local-preset-library.js";

export interface ReferenceHostAttempt {
  readonly host: HostLifecycleAdapter;
  readonly createReadyStage?: ReadyStageFactory;
  readonly decorateReadyStage?: ReadyStageDecorator;
  dispose(): void | Promise<void>;
}

export interface StartReferenceExperienceOptions {
  readonly createHostAttempt: (
    drawingBuffer: PrewarmDrawingBuffer,
  ) => ReferenceHostAttempt;
  readonly initialDrawingBuffer: PrewarmDrawingBuffer;
  readonly initialQualityProfile?: QualityProfile;
  readonly presetLibrary: LocalPresetLibrary;
  readonly revealDelayFrames?: number;
}

type ReadyStageFactory = (lease: RealWaterLease) => HTMLElement;

export interface ReadyStageDecoration {
  dispose(): void;
}

type ReadyStageDecorator = (
  stage: HTMLElement,
  lease: RealWaterLease,
) => ReadyStageDecoration;

export interface ReferenceExperienceSnapshot {
  readonly generation: number;
  readonly manifestHash: string;
  readonly qualityProfileId: MinimalWaterQualityProfileId;
  readonly state: "loading" | "ready" | "failed" | "disposed";
  readonly viewport: {
    readonly drawingBufferWidth: number;
    readonly drawingBufferHeight: number;
  };
}

export interface ReferenceViewport {
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
}

export interface ReferenceExperienceSession {
  readonly presets: LocalPresetLibrary;
  applyQualityProfile(profile: QualityProfile): Promise<void>;
  applyViewport(viewport: ReferenceViewport): Promise<void>;
  signalLongSuspension(): Promise<void>;
  reportPresentationFailure(cause: unknown): Promise<void>;
  snapshot(): ReferenceExperienceSnapshot;
  dispose(): Promise<void>;
}

interface ActiveAttempt {
  readonly attempt: ReferenceHostAttempt;
  readonly host: TrackedHost;
  readonly manifest: PrewarmManifest;
  readonly revision: number;
  lease: RealWaterLease | null;
  revealController: AbortController | null;
  retirement?: Promise<void>;
  stageDecoration: ReadyStageDecoration | null;
  stageDisposalFailure?: unknown;
  run: PreparationRun;
  stage: HTMLElement | null;
}

interface TrackedHost {
  readonly adapter: HostLifecycleAdapter;
  releasePreparedResources(): Promise<void>;
}

interface TransitionRequest {
  readonly manifest: PrewarmManifest;
  readonly presenter: DomLoadingPresenter;
  readonly revision: number;
  readonly terminalLoss?: WebGPUDeviceLoss;
}

type TransitionReason =
  | "initial"
  | "quality-profile"
  | "viewport"
  | "long-suspension"
  | "device-loss"
  | "retry"
  | "presentation-failure";

export function startReferenceExperience(
  mount: Element,
  options: StartReferenceExperienceOptions,
): ReferenceExperienceSession {
  let desiredDrawingBuffer = options.initialDrawingBuffer;
  const initialManifest = createMinimalWaterPrewarmManifest(
    options.initialQualityProfile ??
      createMinimalWaterQualityProfile("minimal"),
    desiredDrawingBuffer,
  );
  let activeAttempt: ActiveAttempt | null = null;
  let activePresenter: DomLoadingPresenter | null = null;
  let automaticDeviceRecoveryUsed = false;
  let desiredManifest = initialManifest;
  let disposed = false;
  let disposal: Promise<void> | undefined;
  let generation = 0;
  let latestTransition = Promise.resolve();
  let revision = 0;
  let state: ReferenceExperienceSnapshot["state"] = "loading";
  let transitionQueue = Promise.resolve();

  function createPresenter(): DomLoadingPresenter {
    activePresenter?.dispose();
    const presenter = new DomLoadingPresenter(mount, {
      cancel: () => {
        if (activePresenter === presenter && !disposed) {
          activeAttempt?.run.cancel(
            "Preparation cancelled from the Loading Experience.",
          );
        }
      },
      retry: () => {
        if (activePresenter === presenter && !disposed) {
          void scheduleTransition(desiredManifest, "retry").catch(() => {});
        }
      },
    });
    activePresenter = presenter;
    return presenter;
  }

  function concealActiveStage(reason: string): void {
    activeAttempt?.run.cancel(reason);
    activeAttempt?.revealController?.abort(reason);
    if (activeAttempt !== null) {
      disposeReadyStage(activeAttempt);
    }
  }

  function scheduleTransition(
    manifest: PrewarmManifest,
    reason: TransitionReason,
    terminalLoss?: WebGPUDeviceLoss,
  ): Promise<void> {
    if (disposed) {
      return disposal ?? Promise.resolve();
    }

    desiredManifest = manifest;
    const requestRevision = ++revision;
    state = "loading";
    concealActiveStage(transitionCancellationReason(reason));
    const presenter = createPresenter();
    const request: TransitionRequest = {
      manifest,
      presenter,
      revision: requestRevision,
      ...(terminalLoss === undefined ? {} : { terminalLoss }),
    };
    const operation = transitionQueue.then(() => executeTransition(request));
    transitionQueue = operation.catch(() => {});
    latestTransition = operation;
    return operation;
  }

  async function executeTransition(request: TransitionRequest): Promise<void> {
    if (!isCurrent(request)) {
      return;
    }

    try {
      await retireActiveAttempt();
    } catch (cause) {
      await presentApplicationFailure(
        request,
        "The previous Reference host could not be retired safely.",
        cause,
      );
      return;
    }

    if (!isCurrent(request)) {
      return;
    }
    if (request.terminalLoss !== undefined) {
      await presentTerminalDeviceLoss(request, request.terminalLoss);
      return;
    }

    let attempt: ReferenceHostAttempt;
    try {
      attempt = options.createHostAttempt(request.manifest.drawingBuffer);
    } catch (cause) {
      await presentApplicationFailure(
        request,
        "The Reference host could not be created.",
        cause,
      );
      return;
    }

    const host = trackHost(attempt.host);
    const record: ActiveAttempt = {
      attempt,
      host,
      lease: null,
      manifest: request.manifest,
      revealController: null,
      revision: request.revision,
      run: prepareRealWater({
        manifest: request.manifest,
        host: host.adapter,
        loading: request.presenter,
      }),
      stageDecoration: null,
      stage: null,
    };
    generation += 1;
    activeAttempt = record;

    let lease: RealWaterLease;
    try {
      lease = await record.run.ready;
    } catch (cause) {
      if (
        cause instanceof RealWaterStartupError &&
        cause.code === "WEBGPU_DEVICE_LOST" &&
        !automaticDeviceRecoveryUsed &&
        isCurrent(request)
      ) {
        automaticDeviceRecoveryUsed = true;
        void scheduleTransition(record.manifest, "device-loss").catch(() => {});
        return;
      }

      if (cause instanceof RealWaterStartupError && isCurrent(request)) {
        state = "failed";
      }
      try {
        await retireAttempt(record);
      } catch (cleanupCause) {
        if (isCurrent(request)) {
          await presentApplicationFailure(
            request,
            "The failed Reference host could not be retired safely.",
            cleanupCause,
          );
        }
      }
      if (!(cause instanceof RealWaterStartupError) && isCurrent(request)) {
        await presentApplicationFailure(
          request,
          "The Reference Experience could not be prepared.",
          cause,
        );
      }
      return;
    }

    record.lease = lease;
    watchInvalidation(record, lease);
    if (!isCurrent(request) || activeAttempt !== record) {
      await retireAttempt(record);
      return;
    }

    const controller = new AbortController();
    record.revealController = controller;
    try {
      await nextRefresh(controller.signal, options.revealDelayFrames ?? 1);
    } catch {
      return;
    } finally {
      if (record.revealController === controller) {
        record.revealController = null;
      }
    }

    if (!isCurrent(request) || activeAttempt !== record) {
      return;
    }

    try {
      const stage =
        record.attempt.createReadyStage?.(lease) ?? createPlaceholder(lease);
      record.stage = stage;
      const decoration =
        record.attempt.decorateReadyStage?.(stage, lease) ?? null;
      record.stageDecoration = decoration;
      if (!isCurrent(request) || activeAttempt !== record) {
        disposeReadyStage(record);
        return;
      }

      request.presenter.dispose();
      if (activePresenter === request.presenter) {
        activePresenter = null;
      }
      mount.replaceChildren(stage);
      stage.focus({ preventScroll: true });
      state = "ready";
    } catch (cause) {
      await presentApplicationFailure(
        request,
        "The prepared Reference stage could not be revealed.",
        cause,
      );
      await retireAttempt(record).catch(() => {});
    }
  }

  function watchInvalidation(
    record: ActiveAttempt,
    lease: RealWaterLease,
  ): void {
    void lease.invalidated.then((invalidation) => {
      if (invalidation.code === "LONG_SUSPENSION") {
        return;
      }
      const loss = invalidation;
      if (
        disposed ||
        activeAttempt !== record ||
        record.lease !== lease ||
        record.retirement !== undefined ||
        record.revision !== revision
      ) {
        return;
      }

      if (!automaticDeviceRecoveryUsed) {
        automaticDeviceRecoveryUsed = true;
        void scheduleTransition(record.manifest, "device-loss").catch(() => {});
        return;
      }

      void scheduleTransition(record.manifest, "device-loss", loss).catch(
        () => {},
      );
    });
  }

  function isCurrent(request: TransitionRequest): boolean {
    return !disposed && request.revision === revision;
  }

  async function retireActiveAttempt(): Promise<void> {
    if (activeAttempt !== null) {
      await retireAttempt(activeAttempt);
    }
  }

  function retireAttempt(record: ActiveAttempt): Promise<void> {
    record.retirement ??= (async () => {
      record.run.cancel("Reference host attempt retired.");
      record.revealController?.abort("Reference host attempt retired.");
      disposeReadyStage(record);

      let firstFailure: unknown = record.stageDisposalFailure;
      let resolvedLease: RealWaterLease | null = null;
      try {
        resolvedLease = await record.run.ready;
      } catch {
        // The structured startup failure is already visible in its presenter.
      }

      const lease = record.lease ?? resolvedLease;
      try {
        await lease?.dispose();
      } catch (cause) {
        firstFailure = cause;
      }
      record.lease = null;

      try {
        await record.host.releasePreparedResources();
      } catch (cause) {
        firstFailure ??= cause;
      }

      try {
        await record.attempt.dispose();
      } catch (cause) {
        firstFailure ??= cause;
      }

      if (activeAttempt === record) {
        activeAttempt = null;
      }
      if (firstFailure !== undefined) {
        throw firstFailure;
      }
    })();
    return record.retirement;
  }

  async function presentTerminalDeviceLoss(
    request: TransitionRequest,
    loss: WebGPUDeviceLoss,
  ): Promise<void> {
    const error = new RealWaterStartupError({
      code: "WEBGPU_DEVICE_LOST",
      phase: "readiness-gate",
      retryable: true,
      message:
        "The WebGPU device was lost after the one automatic recovery attempt.",
      diagnostics: {
        ...loss.diagnostics,
        deviceLossMessage: loss.message,
        deviceLossReason: loss.reason,
      },
    });
    await presentFailure(request, error);
  }

  async function presentApplicationFailure(
    request: TransitionRequest,
    message: string,
    cause: unknown,
  ): Promise<void> {
    if (!isCurrent(request)) {
      return;
    }
    const error = new RealWaterStartupError({
      code: "PREWARM_FAILED",
      phase: "readiness-gate",
      retryable: true,
      message,
      cause,
    });
    await presentFailure(request, error);
  }

  async function presentFailure(
    request: TransitionRequest,
    error: RealWaterStartupError,
  ): Promise<void> {
    if (!isCurrent(request) || activePresenter !== request.presenter) {
      return;
    }
    state = "failed";
    await request.presenter.present(
      {
        status: "failed",
        sequence: 0,
        manifest: request.manifest,
        progress: null,
        error,
      },
      new AbortController().signal,
    );
  }

  const initialTransition = scheduleTransition(initialManifest, "initial");
  void initialTransition.catch(() => {});

  return Object.freeze({
    presets: options.presetLibrary,
    applyQualityProfile(profile: QualityProfile): Promise<void> {
      // Derivation validates the complete structural input before desired state
      // or the visible Reference Experience is mutated.
      const manifest = createMinimalWaterPrewarmManifest(
        profile,
        desiredDrawingBuffer,
      );
      return scheduleTransition(manifest, "quality-profile");
    },
    applyViewport(viewport: ReferenceViewport): Promise<void> {
      const drawingBuffer = {
        width: viewport.drawingBufferWidth,
        height: viewport.drawingBufferHeight,
      };
      const manifest = createMinimalWaterPrewarmManifest(
        desiredManifest.qualityProfile,
        drawingBuffer,
      );
      if (
        manifest.drawingBuffer.width === desiredDrawingBuffer.width &&
        manifest.drawingBuffer.height === desiredDrawingBuffer.height
      ) {
        return latestTransition;
      }
      desiredDrawingBuffer = manifest.drawingBuffer;
      return scheduleTransition(manifest, "viewport");
    },
    signalLongSuspension(): Promise<void> {
      activeAttempt?.lease?.invalidateForLongSuspension();
      return scheduleTransition(desiredManifest, "long-suspension");
    },
    reportPresentationFailure(cause: unknown): Promise<void> {
      if (disposed) {
        return Promise.resolve();
      }
      const startedRevision = revision;
      const startedGeneration = generation;
      const operation = transitionQueue.then(async () => {
        if (
          disposed ||
          revision !== startedRevision ||
          generation !== startedGeneration
        ) {
          return;
        }
        const requestRevision = ++revision;
        state = "loading";
        concealActiveStage(
          transitionCancellationReason("presentation-failure"),
        );
        const presenter = createPresenter();
        const request: TransitionRequest = {
          manifest: desiredManifest,
          presenter,
          revision: requestRevision,
        };
        try {
          await retireActiveAttempt();
        } catch (cleanupCause) {
          await presentApplicationFailure(
            request,
            "The failed Reference host could not be retired safely.",
            cleanupCause,
          );
          return;
        }
        if (!isCurrent(request)) {
          return;
        }
        await presentApplicationFailure(
          request,
          "Core presentation failed. The Reference Experience remains hidden.",
          cause,
        );
      });
      transitionQueue = operation.catch(() => {});
      latestTransition = operation;
      return operation;
    },
    snapshot(): ReferenceExperienceSnapshot {
      return Object.freeze({
        generation,
        manifestHash: desiredManifest.manifestHash,
        qualityProfileId: desiredManifest.qualityProfile.id,
        state,
        viewport: Object.freeze({
          drawingBufferWidth: desiredDrawingBuffer.width,
          drawingBufferHeight: desiredDrawingBuffer.height,
        }),
      });
    },
    dispose(): Promise<void> {
      disposal ??= (async () => {
        if (disposed) {
          return;
        }

        disposed = true;
        state = "disposed";
        revision += 1;
        concealActiveStage("Reference Experience disposed.");
        activePresenter?.dispose();
        activePresenter = null;
        await transitionQueue;
        await retireActiveAttempt();
        mount.replaceChildren();
      })();
      return disposal;
    },
  });
}

function disposeReadyStage(record: ActiveAttempt): void {
  const decoration = record.stageDecoration;
  const stage = record.stage;
  record.stageDecoration = null;
  record.stage = null;
  try {
    decoration?.dispose();
  } catch (cause) {
    record.stageDisposalFailure ??= cause;
  }
  stage?.remove();
}

function trackHost(host: HostLifecycleAdapter): TrackedHost {
  let result: HostPreparationResult | undefined;
  let settlement: Promise<void> = Promise.resolve();

  const adapter: HostLifecycleAdapter = Object.freeze({
    async prepare(request: HostPreparationRequest) {
      const preparation = Promise.resolve()
        .then(() => host.prepare(request))
        .then((prepared): HostPreparationResult => {
          if (prepared.status !== "ready") {
            return prepared;
          }
          return Object.freeze({
            ...prepared,
            lease: trackPreparedLease(prepared.lease),
          });
        });
      settlement = preparation.then(
        (prepared) => {
          result = prepared;
        },
        () => {},
      );
      return preparation;
    },
  });

  return Object.freeze({
    adapter,
    async releasePreparedResources(): Promise<void> {
      await settlement;
      if (result?.status === "ready") {
        await result.lease.dispose();
      }
    },
  });
}

function trackPreparedLease(lease: HostPreparedLease): HostPreparedLease {
  let disposal: Promise<void> | undefined;
  return Object.freeze({
    ...lease,
    invalidated: lease.invalidated,
    dispose(): Promise<void> {
      disposal ??= Promise.resolve().then(() => lease.dispose());
      return disposal;
    },
  });
}

function transitionCancellationReason(reason: TransitionReason): string {
  switch (reason) {
    case "initial":
      return "Initial Reference Experience preparation started.";
    case "quality-profile":
      return "A newer Quality Profile replaced this preparation.";
    case "viewport":
      return "A newer drawing buffer replaced this preparation.";
    case "long-suspension":
      return "A confirmed long suspension requires complete preparation.";
    case "device-loss":
      return "WebGPU device loss requires complete preparation.";
    case "retry":
      return "The Loading Experience requested a fresh preparation.";
    case "presentation-failure":
      return "Core presentation failed; the ready canvas is retired.";
  }
}

function createPlaceholder(lease: RealWaterLease): HTMLElement {
  const stage = document.createElement("main");
  stage.className = "reference-placeholder";
  stage.dataset.testid = "reference-placeholder";
  stage.dataset.manifestHash = lease.manifest.manifestHash;
  stage.dataset.qualityProfile = lease.manifest.qualityProfile.id;
  stage.dataset.backend = lease.capabilities.rendering.backend;
  stage.dataset.timestampQuery = String(
    lease.capabilities.rendering.timestampQuery,
  );
  stage.id = "reference-placeholder";
  stage.tabIndex = -1;
  stage.setAttribute("aria-labelledby", "reference-placeholder-title");

  const eyebrow = document.createElement("p");
  eyebrow.className = "placeholder-eyebrow";
  eyebrow.textContent = "Ready lease resolved";

  const heading = document.createElement("h1");
  heading.id = "reference-placeholder-title";
  heading.textContent = "Reference Experience placeholder";

  const description = document.createElement("p");
  description.textContent =
    "The visible stage proves the startup, capability, and reveal contract. It makes no visual or Native Quality claim.";

  stage.append(eyebrow, heading, description);
  return stage;
}

function nextRefresh(signal: AbortSignal, frameCount: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Reference reveal cancelled."));
      return;
    }

    let remainingFrames = Math.max(1, Math.floor(frameCount));
    let frame = 0;
    const advance = (): void => {
      remainingFrames -= 1;
      if (remainingFrames === 0) {
        signal.removeEventListener("abort", onAbort);
        resolve();
        return;
      }
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    const onAbort = (): void => {
      cancelAnimationFrame(frame);
      reject(new Error("Reference reveal cancelled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
