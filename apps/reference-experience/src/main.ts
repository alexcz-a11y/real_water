import "./styles.css";
import {
  Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from "three";
import { WebGPURenderer } from "three/webgpu";
import {
  createMinimalWaterQualityProfile,
  createStaticHostPresentationAdapter,
  createStaticHostSimulationAdapter,
  createThreeHostLifecycleAdapter,
  type HostLifecycleAdapter,
  type HostPreparationRequest,
  type MemoryHostScenario,
  type PrewarmDrawingBuffer,
  type RealWaterLease,
  type WebGPUDeviceLoss,
} from "real-water";
import type { QaFrameSource, QaHarnessV12 } from "./qa-harness.js";
import {
  createQaPlanarReflectionFixture,
  disposeQaPlanarReflectionFixture,
} from "./qa-planar-reflection-fixture.js";
import {
  createQaCurrentSsrFixture,
  disposeQaCurrentSsrFixture,
} from "./qa-current-ssr-fixture.js";
import type * as QaHarnessModuleContract from "./qa-harness.js";
import { createLocalPresetLibrary } from "./local-preset-library.js";
import {
  createReferenceHostPresentationController,
  type ReferenceHostPresentationController,
} from "./reference-presentation-controller.js";
import { createReferenceHostSimulationController } from "./reference-simulation-controller.js";
import {
  REFERENCE_PROXY_VESSEL_SOCKETS,
  createReferenceProxyVessel,
  type ReferenceProxyVessel,
} from "./reference-proxy-vessel.js";
import { createReferenceEnvironmentAdapter } from "./reference-optical-inputs.js";
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
const presentationFailureSink: {
  report(cause: unknown): void;
} = {
  report() {},
};
const hostSetup = createHostSetup(parameters, qaHarnessModule, (cause) => {
  presentationFailureSink.report(cause);
});
const referenceSession = startReferenceExperience(mount, {
  createHostAttempt: hostSetup.createHostAttempt,
  initialDrawingBuffer: readPhysicalDrawingBuffer(),
  presetLibrary: createLocalPresetLibrary(),
  revealDelayFrames: readRevealFrames(parameters, qaHarnessModule !== null),
});
presentationFailureSink.report = (cause) => {
  void referenceSession.reportPresentationFailure(cause);
};
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
const handleViewportResize = (): void => {
  const drawingBuffer = readPhysicalDrawingBuffer();
  void referenceSession
    .applyViewport({
      drawingBufferWidth: drawingBuffer.width,
      drawingBufferHeight: drawingBuffer.height,
    })
    .catch(() => {});
};
const session = Object.freeze({
  dispose(): Promise<void> {
    disposal ??= (async () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("resize", handleViewportResize);
      document.removeEventListener("freeze", markLifecycleSuspension);
      document.removeEventListener("resume", recoverFromLifecycleSuspension);
      await referenceSession.dispose();
    })();
    return disposal;
  },
});

window.addEventListener("pagehide", handlePageHide);
window.addEventListener("pageshow", handlePageShow);
window.addEventListener("resize", handleViewportResize);
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
  readonly createHostAttempt: (
    drawingBuffer: PrewarmDrawingBuffer,
  ) => ReferenceHostAttempt;
  readonly frameSource: () => QaFrameSource | null;
  readonly synthesizeDeviceLoss?: () => void;
}

function createHostSetup(
  parameters: URLSearchParams,
  qaModule: QaHarnessModule | null,
  onPresentationError?: (cause: unknown) => void,
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
    createHostAttempt: (drawingBuffer: PrewarmDrawingBuffer) => {
      const created = createThreeReferenceHostAttempt(
        parameters,
        parameters.get("qa") === "1" ? qaModule : null,
        drawingBuffer,
        onPresentationError,
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
    environment: createReferenceEnvironmentAdapter(),
    presentation: createStaticHostPresentationAdapter(),
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
  drawingBuffer: PrewarmDrawingBuffer,
  onPresentationError?: (cause: unknown) => void,
): CreatedThreeReferenceHostAttempt {
  const renderer = new WebGPURenderer({
    forceWebGL: parameters.get("forceWebGL") === "1",
  });
  const scene = new Scene();
  scene.background = new Color(0x031019);
  const seabed = addReferenceSeabed(scene, qaModule !== null);
  const proxyMode = parameters.get("proxy");
  const qaProxyRequested = proxyMode === "1" || proxyMode === "propeller";
  const proxyVessel =
    qaModule === null || qaProxyRequested
      ? createReferenceProxyVessel(
          scene,
          qaModule !== null && proxyMode === "propeller"
            ? {
                attachmentSockets: REFERENCE_PROXY_VESSEL_SOCKETS.filter(
                  (socket) =>
                    socket.kind === "propeller" ||
                    socket.kind === "interaction-anchor",
                ),
              }
            : {},
        )
      : undefined;
  const disposeVesselControls =
    proxyVessel === undefined
      ? undefined
      : bindReferenceVesselControls(proxyVessel);

  const width = drawingBuffer.width;
  const height = drawingBuffer.height;
  const camera = new PerspectiveCamera(50, width / height, 0.1, 4_000);
  camera.position.set(8, 6, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  let disposed = false;
  const qaSimulation = qaModule?.createQaHostSimulationController({
    ...(proxyVessel === undefined
      ? {}
      : {
          integrateFixedStep: proxyVessel.integrateFixedStep,
          reset: () => {
            proxyVessel.reset();
            proxyVessel.setControls({ throttle: 1, steering: 0 });
          },
        }),
  });
  const qaPresentation = qaModule?.createQaHostPresentationController();
  let referencePresentation: ReferenceHostPresentationController | undefined;
  const referenceSimulation =
    qaSimulation === undefined
      ? createReferenceHostSimulationController({
          ...(proxyVessel === undefined
            ? {}
            : { integrateFixedStep: proxyVessel.integrateFixedStep }),
        })
      : undefined;
  let referenceSimulationStarted = false;
  const presentation =
    qaPresentation ??
    (referencePresentation = createReferenceHostPresentationController({
      ...(onPresentationError === undefined
        ? {}
        : { onError: onPresentationError }),
      beforePresent: (timestamp) => {
        const simulationController = referenceSimulation;
        if (simulationController === undefined) {
          return;
        }
        if (!referenceSimulationStarted) {
          referenceSimulationStarted = true;
          simulationController.start(timestamp);
          proxyVessel?.present(1);
          return;
        }
        simulationController.beforePresent(timestamp);
        proxyVessel?.present(
          simulationController.interpolationAlpha(timestamp),
        );
      },
    }));
  const simulation = qaSimulation ?? referenceSimulation;
  if (simulation === undefined) {
    throw new Error("The Reference Host Simulation Controller is unavailable.");
  }
  const environment = createReferenceEnvironmentAdapter();
  const baseHost = createThreeHostLifecycleAdapter({
    renderer,
    scene,
    camera,
    simulation,
    environment,
    presentation,
  });
  const frameSource =
    qaSimulation === undefined || qaPresentation === undefined
      ? null
      : (qaModule?.createQaThreeFrameSource(
          baseHost,
          renderer,
          scene,
          camera,
          qaSimulation,
          environment,
          qaPresentation,
        ) ?? null);

  return Object.freeze({
    frameSource,
    attempt: {
      host: frameSource?.host ?? baseHost,
      createReadyStage: (lease: RealWaterLease) => {
        frameSource?.bindLease(lease);
        proxyVessel?.attach(lease);
        const stage = createCanvasStage(renderer, lease);
        referencePresentation?.start();
        return stage;
      },
      dispose: () => {
        if (!disposed) {
          disposed = true;
          renderer.dispose();
          seabed.dispose();
          disposeVesselControls?.();
          proxyVessel?.dispose();
          if (environment.texture !== null) {
            disposeHostTexture(environment.texture);
          }
        }
      },
    },
  });
}

function bindReferenceVesselControls(vessel: ReferenceProxyVessel): () => void {
  const held = new Set<string>();
  const acceptedKeys = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
  ]);
  const apply = (): void => {
    vessel.setControls({
      throttle:
        Number(held.has("ArrowUp") || held.has("KeyW")) -
        Number(held.has("ArrowDown") || held.has("KeyS")),
      steering:
        Number(held.has("ArrowLeft") || held.has("KeyA")) -
        Number(held.has("ArrowRight") || held.has("KeyD")),
    });
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!acceptedKeys.has(event.code) || event.repeat) {
      return;
    }
    held.add(event.code);
    apply();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (!acceptedKeys.has(event.code)) {
      return;
    }
    held.delete(event.code);
    apply();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  return (): void => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    held.clear();
  };
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

function addReferenceSeabed(
  scene: Scene,
  qaFixtures = false,
): { dispose(): void } {
  const fixtureColor = new MeshBasicMaterial({ color: new Color(0x0a505a) });
  const shallow = new Mesh(new PlaneGeometry(16, 20), fixtureColor);
  shallow.name = "Reference 1m scene-depth fixture";
  shallow.rotation.x = -Math.PI / 2;
  shallow.position.set(-10, -1, -40);
  const deep = new Mesh(new PlaneGeometry(16, 20), fixtureColor);
  deep.name = "Reference 21m scene-depth fixture";
  deep.rotation.x = -Math.PI / 2;
  deep.position.set(10, -21, -40);
  const foreground = new Mesh(
    new PlaneGeometry(16, 16),
    new MeshBasicMaterial({ color: new Color(0xff40c8) }),
  );
  foreground.name = "Reference foreground scene-depth fixture";
  foreground.rotation.x = -Math.PI / 2;
  foreground.position.set(-20, 6, -40);
  const planar = qaFixtures ? createQaPlanarReflectionFixture() : null;
  const currentSsr = qaFixtures ? createQaCurrentSsrFixture() : null;
  scene.add(shallow, deep, foreground);
  if (planar !== null) {
    scene.add(planar);
  }
  if (currentSsr !== null) {
    scene.add(currentSsr);
  }
  return Object.freeze({
    dispose(): void {
      scene.remove(shallow, deep, foreground);
      shallow.geometry.dispose();
      deep.geometry.dispose();
      foreground.geometry.dispose();
      fixtureColor.dispose();
      foreground.material.dispose();
      if (planar !== null) {
        disposeQaPlanarReflectionFixture(planar);
      }
      if (currentSsr !== null) {
        disposeQaCurrentSsrFixture(currentSsr);
      }
    },
  });
}

function disposeHostTexture(texture: object): void {
  if ("dispose" in texture && typeof texture.dispose === "function") {
    texture.dispose();
  }
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

function readPhysicalDrawingBuffer(): PrewarmDrawingBuffer {
  return Object.freeze({
    width: Math.max(1, Math.floor(window.innerWidth)),
    height: Math.max(1, Math.floor(window.innerHeight)),
  });
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
    __REAL_WATER_QA__?: QaHarnessV12;
  }
}
