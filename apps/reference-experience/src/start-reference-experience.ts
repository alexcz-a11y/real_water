import {
  RealWaterStartupError,
  createMockPrewarmManifest,
  prepareRealWater,
  type HostLifecycleAdapter,
  type PreparationRun,
  type RealWaterLease,
} from "real-water";
import { DomLoadingPresenter } from "./loading-presenter.js";

export interface StartReferenceExperienceOptions {
  readonly createHost: () => HostLifecycleAdapter;
  readonly revealDelayFrames?: number;
}

export interface ReferenceExperienceSession {
  dispose(): Promise<void>;
}

export function startReferenceExperience(
  mount: Element,
  options: StartReferenceExperienceOptions,
): ReferenceExperienceSession {
  let activeLease: RealWaterLease | null = null;
  let activeRun: PreparationRun | null = null;
  let activeStage: HTMLElement | null = null;
  let revealController: AbortController | null = null;
  let attempt = 0;
  let attemptTask: Promise<void> = Promise.resolve();
  let disposed = false;
  let disposal: Promise<void> | undefined;

  const presenter = new DomLoadingPresenter(mount, {
    cancel: () => {
      activeRun?.cancel("Preparation cancelled from the Loading Experience.");
    },
    retry: () => {
      if (!disposed) {
        startAttempt();
      }
    },
  });

  function startAttempt(): void {
    const attemptId = ++attempt;
    const host = options.createHost();
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      host,
      loading: presenter,
    });
    activeRun = run;

    attemptTask = run.ready
      .then(async (lease) => {
        if (disposed || attemptId !== attempt) {
          await lease.dispose();
          return;
        }

        activeLease = lease;
        const controller = new AbortController();
        revealController = controller;

        try {
          await nextRefresh(controller.signal, options.revealDelayFrames ?? 1);
        } catch {
          await lease.dispose();
          if (activeLease === lease) {
            activeLease = null;
          }
          return;
        } finally {
          if (revealController === controller) {
            revealController = null;
          }
        }

        if (disposed || attemptId !== attempt) {
          await lease.dispose();
          if (activeLease === lease) {
            activeLease = null;
          }
          return;
        }

        const stage = createPlaceholder(lease);
        presenter.dispose();
        mount.replaceChildren(stage);
        stage.focus({ preventScroll: true });
        activeStage = stage;
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof RealWaterStartupError)) {
          throw cause;
        }
      })
      .finally(() => {
        if (attemptId === attempt) {
          activeRun = null;
        }
      });
  }

  startAttempt();

  return Object.freeze({
    dispose(): Promise<void> {
      disposal ??= (async () => {
        if (disposed) {
          return;
        }

        disposed = true;
        attempt += 1;
        activeRun?.cancel("Reference Experience disposed.");
        revealController?.abort();
        const lease = activeLease;
        activeLease = null;
        await lease?.dispose();
        await attemptTask;
        presenter.dispose();
        activeStage?.remove();
        activeStage = null;
      })();

      return disposal;
    },
  });
}

function createPlaceholder(lease: RealWaterLease): HTMLElement {
  const stage = document.createElement("main");
  stage.className = "reference-placeholder";
  stage.dataset.testid = "reference-placeholder";
  stage.dataset.manifestHash = lease.manifest.manifestHash;
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
