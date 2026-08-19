import "./styles.css";
import { Color, PerspectiveCamera, Scene } from "three";
import { WebGPURenderer } from "three/webgpu";
import {
  createMinimalWaterQualityProfile,
  createStaticHostSimulationAdapter,
  createThreeHostLifecycleAdapter,
  type HostLifecycleAdapter,
  type HostPreparationRequest,
  type MemoryHostScenario,
  type RealWaterLease,
  type WebGPUDeviceLoss,
} from "real-water";
import type { QaFrameSource, QaHarnessV2 } from "./qa-harness.js";
import type * as QaHarnessModuleContract from "./qa-harness.js";
import {
  startReferenceExperience,
  type ReferenceHostAttempt,
} from "./start-reference-experience.js";

const mount = document.querySelector("#app");

if (mount === null) {
  throw new Error("The Reference Experience mount was not found.");
}

const parameters = new URLSearchParams(window.location.search);
const qaHarnessModule =
  import.meta.env.MODE === "test" ? await import("./qa-harness.js") : null;
const hostSetup = createHostSetup(parameters, qaHarnessModule);
const referenceSession = startReferenceExperience(mount, {
  createHostAttempt: hostSetup.createHostAttempt,
  revealDelayFrames: readRevealFrames(parameters, qaHarnessModule !== null),
});
let lifecycleRecoveryHandled = true;
let disposal: Promise<void> | undefined;

const markLifecycleSuspension = (): void => {
  lifecycleRecoveryHandled = false;
};
const recoverFromLifecycleSuspension = (): void => {
  if (lifecycleRecoveryHandled) {
    return;
  }
  lifecycleRecoveryHandled = true;
  void referenceSession.signalLongSuspension().catch(() => {});
};
const handlePageHide = (event: PageTransitionEvent): void => {
  if (event.persisted) {
    markLifecycleSuspension();
    return;
  }
  void session.dispose().catch(() => {});
};
const handlePageShow = (event: PageTransitionEvent): void => {
  if (event.persisted) {
    recoverFromLifecycleSuspension();
  }
};
const session = Object.freeze({
  dispose(): Promise<void> {
    disposal ??= (async () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("freeze", markLifecycleSuspension);
      document.removeEventListener("resume", recoverFromLifecycleSuspension);
      await referenceSession.dispose();
    })();
    return disposal;
  },
});

window.addEventListener("pagehide", handlePageHide);
window.addEventListener("pageshow", handlePageShow);
document.addEventListener("freeze", markLifecycleSuspension);
document.addEventListener("resume", recoverFromLifecycleSuspension);

if (qaHarnessModule !== null && parameters.get("qa") === "1") {
  window.__REAL_WATER_QA__ = qaHarnessModule.createQaHarness({
    applySecondQualityProfile: () =>
      referenceSession.applyQualityProfile(
        createMinimalWaterQualityProfile("minimal-high-detail"),
      ),
    frameSource: hostSetup.frameSource,
    signalLongSuspension: () => referenceSession.signalLongSuspension(),
    synthesizeDeviceLoss: () => {
      if (hostSetup.synthesizeDeviceLoss === undefined) {
        throw new Error("Synthetic device loss requires the QA Memory host.");
      }
      hostSetup.synthesizeDeviceLoss();
    },
    snapshot: () => referenceSession.snapshot(),
    dispose: () => session.dispose(),
  });
}

type QaHarnessModule = typeof QaHarnessModuleContract;

interface ReferenceHostSetup {
  readonly createHostAttempt: () => ReferenceHostAttempt;
  readonly frameSource: () => QaFrameSource | null;
  readonly synthesizeDeviceLoss?: () => void;
}

function createHostSetup(
  parameters: URLSearchParams,
  qaModule: QaHarnessModule | null,
): ReferenceHostSetup {
  if (
    qaModule !== null &&
    parameters.get("qa") === "1" &&
    parameters.get("host") === "memory"
  ) {
    const scenario = readScenario(parameters.get("scenario"));
    const stepDelayMs = readDelay(parameters.get("delay"));
    const firstPreparationLosesDevice =
      parameters.get("scenario") === "first-device-loss";
    let preparationAttempt = 0;
    let activeControl: MemoryDeviceLossControl | null = null;

    return {
      createHostAttempt: () => {
        const attemptScenario: MemoryHostScenario =
          firstPreparationLosesDevice && preparationAttempt === 0
            ? {
                kind: "device-lost",
                message:
                  "The first QA Memory host lost its device during preparation.",
                reason: "qa-first-preparation",
              }
            : scenario;
        preparationAttempt += 1;
        const control = createControllableMemoryHost(
          qaModule,
          attemptScenario,
          stepDelayMs,
        );
        activeControl = control;
        return {
          host: control.host,
          dispose: () => {
            if (activeControl === control) {
              activeControl = null;
            }
          },
        };
      },
      frameSource: () => null,
      synthesizeDeviceLoss: () => {
        if (activeControl === null) {
          throw new Error("The QA Memory host is not ready for device loss.");
        }
        activeControl.loseDevice();
      },
    };
  }

  let activeFrameSource: QaFrameSource | null = null;
  return {
    createHostAttempt: () => {
      const created = createThreeReferenceHostAttempt(
        parameters,
        parameters.get("qa") === "1" ? qaModule : null,
      );
      activeFrameSource = created.frameSource;
      return {
        ...created.attempt,
        async dispose() {
          try {
            await created.attempt.dispose();
          } finally {
            if (activeFrameSource === created.frameSource) {
              activeFrameSource = null;
            }
          }
        },
      };
    },
    frameSource: () => activeFrameSource,
  };
}

interface MemoryDeviceLossControl {
  readonly host: HostLifecycleAdapter;
  loseDevice(): void;
}

function createControllableMemoryHost(
  qaModule: QaHarnessModule,
  scenario: MemoryHostScenario,
  stepDelayMs: number,
): MemoryDeviceLossControl {
  const base = qaModule.createQaMemoryHostLifecycleAdapter({
    scenario,
    simulation: createStaticHostSimulationAdapter(),
    stepDelayMs,
  });
  let resolveLoss: (loss: WebGPUDeviceLoss) => void = () => {};
  let lost = false;
  const invalidated = new Promise<WebGPUDeviceLoss>((resolve) => {
    resolveLoss = resolve;
  });
  const host: HostLifecycleAdapter = Object.freeze({
    async prepare(request: HostPreparationRequest) {
      const result = await base.prepare(request);
      if (result.status !== "ready") {
        return result;
      }
      return Object.freeze({
        ...result,
        lease: Object.freeze({
          ...result.lease,
          invalidated,
          dispose: () => result.lease.dispose(),
        }),
      });
    },
  });

  return Object.freeze({
    host,
    loseDevice(): void {
      if (lost) {
        return;
      }
      lost = true;
      resolveLoss(
        Object.freeze({
          code: "WEBGPU_DEVICE_LOST",
          message: "The QA Memory host synthesized post-ready device loss.",
          reason: "qa-synthetic-loss",
          diagnostics: Object.freeze({
            adapter: "memory",
            trigger: "qa",
          }),
        }),
      );
    },
  });
}

interface CreatedThreeReferenceHostAttempt {
  readonly attempt: ReferenceHostAttempt;
  readonly frameSource: QaFrameSource | null;
}

function createThreeReferenceHostAttempt(
  parameters: URLSearchParams,
  qaModule: QaHarnessModule | null,
): CreatedThreeReferenceHostAttempt {
  const renderer = new WebGPURenderer({
    forceWebGL: parameters.get("forceWebGL") === "1",
  });
  const scene = new Scene();
  scene.background = new Color(0x031019);

  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const camera = new PerspectiveCamera(50, width / height, 0.1, 100);
  camera.position.set(8, 6, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  let disposed = false;
  const qaSimulation = qaModule?.createQaHostSimulationController();
  const simulation = qaSimulation ?? createStaticHostSimulationAdapter();
  const baseHost = createThreeHostLifecycleAdapter({
    renderer,
    scene,
    camera,
    simulation,
  });
  const frameSource =
    (qaSimulation === undefined
      ? null
      : qaModule?.createQaThreeFrameSource(
          baseHost,
          renderer,
          scene,
          camera,
          qaSimulation,
        )) ?? null;

  return Object.freeze({
    frameSource,
    attempt: {
      host: frameSource?.host ?? baseHost,
      createReadyStage: (lease: RealWaterLease) => {
        frameSource?.bindLease(lease);
        return createCanvasStage(renderer, lease);
      },
      dispose: () => {
        if (!disposed) {
          disposed = true;
          renderer.dispose();
        }
      },
    },
  });
}

function createCanvasStage(
  renderer: WebGPURenderer,
  lease: RealWaterLease,
): HTMLElement {
  const stage = document.createElement("main");
  stage.className = "reference-stage";
  stage.dataset.testid = "reference-stage";
  stage.dataset.manifestHash = lease.manifest.manifestHash;
  stage.dataset.qualityProfile = lease.manifest.qualityProfile.id;
  stage.dataset.backend = lease.capabilities.rendering.backend;
  stage.dataset.timestampQuery = String(
    lease.capabilities.rendering.timestampQuery,
  );
  stage.id = "reference-stage";
  stage.tabIndex = -1;
  stage.setAttribute("aria-label", "Real Water Reference Experience");

  const canvas = renderer.domElement;
  canvas.className = "reference-canvas";
  canvas.setAttribute("aria-label", "Minimal prewarmed water plane");
  canvas.setAttribute("role", "img");
  stage.append(canvas);
  return stage;
}

function readScenario(value: string | null): MemoryHostScenario {
  switch (value) {
    case "unsupported":
      return {
        kind: "unsupported",
        reason: "The requested mock environment is unsupported.",
      };
    case "failure":
      return {
        kind: "failure",
        message: "The requested mock prewarm step failed.",
      };
    default:
      return { kind: "success" };
  }
}

function readDelay(value: string | null): number {
  if (value === null) {
    return 80;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 2_000) : 80;
}

function readRevealFrames(
  parameters: URLSearchParams,
  qaBuild: boolean,
): number {
  if (!qaBuild || parameters.get("qa") !== "1") {
    return 1;
  }

  const parsed = Number(parameters.get("revealFrames"));
  return Number.isFinite(parsed) && parsed >= 1
    ? Math.min(Math.floor(parsed), 240)
    : 1;
}

declare global {
  interface Window {
    __REAL_WATER_QA__?: QaHarnessV2;
  }
}
