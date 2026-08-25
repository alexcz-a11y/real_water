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
  createReferenceShowcasePreset,
  createStaticHostPresentationAdapter,
  createStaticHostSimulationAdapter,
  createThreeHostLifecycleAdapter,
  type HostLifecycleAdapter,
  type HostPreparationRequest,
  type MemoryHostScenario,
  type PrewarmDrawingBuffer,
  type RealWaterLease,
  type ShowcaseCameraKeyframe,
  type ShowcasePreset,
  type WebGPUDeviceLoss,
} from "real-water";
import type {
  QaFrameSource,
  QaHarness,
  QaShowcaseReplayController,
} from "./qa-harness.js";
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
  createReferenceControlModel,
  type ReferenceControlBinding,
  type ReferenceLookControlModel,
} from "./reference-control-model.js";
import { createReferenceControlPresenters } from "./reference-control-presenters.js";
import {
  createReferenceHostPresentationController,
  type ReferenceHostPresentationController,
} from "./reference-presentation-controller.js";
import {
  createReferenceHostSimulationController,
  type ReferenceHostSimulationController,
} from "./reference-simulation-controller.js";
import {
  REFERENCE_PROXY_VESSEL_BODY_ID,
  createReferenceShowcaseSchedule,
  type ReferenceShowcaseSchedule,
} from "./reference-showcase-schedule.js";
import {
  createReferenceExperienceModeController,
  createReferenceExperienceModePresenter,
  type AuthoredLookId,
  type ReferenceExperienceMode,
  type ReferenceExperienceModeController,
} from "./reference-experience-mode.js";
import {
  REFERENCE_DEFAULT_AUTHORED_LOOK_ID,
  isReferenceAuthoredLookId,
  resolveReferenceAuthoredLook,
} from "./reference-authored-looks.js";
import {
  createReferenceSandboxCameraController,
  createReferenceSandboxControls,
} from "./reference-sandbox-controls.js";
import {
  REFERENCE_PROXY_VESSEL_SOCKETS,
  createReferenceProxyVessel,
  type ReferenceProxyVessel,
} from "./reference-proxy-vessel.js";
import {
  createReferenceEnvironmentAdapter,
  type ReferenceEnvironmentAdapter,
} from "./reference-optical-inputs.js";
import {
  startReferenceExperience,
  type ReferenceHostAttempt,
  type ReferenceExperienceSession,
  type ReadyStageDecoration,
} from "./start-reference-experience.js";

const mount = document.querySelector("#app");

if (mount === null) {
  throw new Error("The Reference Experience mount was not found.");
}

const parameters = new URLSearchParams(window.location.search);
const qaHarnessModule =
  import.meta.env.MODE === "test" ? await import("./qa-harness.js") : null;
const modePreference: ReferenceModePreference = {
  mode: readInitialExperienceMode(parameters),
  sandboxLook: REFERENCE_DEFAULT_AUTHORED_LOOK_ID,
};
const referenceSessionReference: {
  current: ReferenceExperienceSession | null;
} = { current: null };
const referenceControlModel = createReferenceControlModel({
  applyQualityProfile: (profile) => {
    const session = referenceSessionReference.current;
    if (session === null) {
      throw new Error("The Reference Experience session is not available.");
    }
    return session.applyQualityProfile(profile);
  },
});
const presentationFailureSink: {
  report(cause: unknown): void;
} = {
  report() {},
};
const hostSetup = createHostSetup(
  parameters,
  qaHarnessModule,
  referenceControlModel,
  modePreference,
  (cause) => {
    presentationFailureSink.report(cause);
  },
);
const referenceSession = startReferenceExperience(mount, {
  createHostAttempt: hostSetup.createHostAttempt,
  initialDrawingBuffer: readPhysicalDrawingBuffer(),
  presetLibrary: createLocalPresetLibrary(),
  revealDelayFrames: readRevealFrames(parameters, qaHarnessModule !== null),
});
referenceSessionReference.current = referenceSession;
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
      try {
        await referenceSession.dispose();
      } finally {
        referenceSessionReference.current = null;
        referenceControlModel.dispose();
      }
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
  const showcaseReplay =
    parameters.get("mode") === "qa"
      ? createDeferredQaShowcaseReplayController(hostSetup)
      : undefined;
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
    ...(showcaseReplay === undefined ? {} : { showcaseReplay }),
  });
}

type QaHarnessModule = typeof QaHarnessModuleContract;

interface ReferenceHostSetup {
  readonly createHostAttempt: (
    drawingBuffer: PrewarmDrawingBuffer,
  ) => ReferenceHostAttempt;
  readonly frameSource: () => QaFrameSource | null;
  readonly showcaseReplay: () => QaShowcaseReplayController | null;
  readonly synthesizeDeviceLoss?: () => void;
}

interface ReferenceModePreference {
  mode: ReferenceExperienceMode;
  sandboxLook: AuthoredLookId;
}

function createHostSetup(
  parameters: URLSearchParams,
  qaModule: QaHarnessModule | null,
  controlModel: ReferenceLookControlModel,
  modePreference: ReferenceModePreference,
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
        const environment = createReferenceEnvironmentAdapter();
        const control = createControllableMemoryHost(
          qaModule,
          attemptScenario,
          stepDelayMs,
          environment,
        );
        activeControl = control;
        return {
          host: control.host,
          decorateReadyStage: (stage, lease) =>
            bindReferenceControlStage(stage, controlModel, {
              lease,
              environment,
              claimManualLook() {},
            }),
          dispose: () => {
            if (activeControl === control) {
              activeControl = null;
            }
          },
        };
      },
      frameSource: () => null,
      showcaseReplay: () => null,
      synthesizeDeviceLoss: () => {
        if (activeControl === null) {
          throw new Error("The QA Memory host is not ready for device loss.");
        }
        activeControl.loseDevice();
      },
    };
  }

  let activeFrameSource: QaFrameSource | null = null;
  let activeShowcaseReplay: QaShowcaseReplayController | null = null;
  return {
    createHostAttempt: (drawingBuffer: PrewarmDrawingBuffer) => {
      const created = createThreeReferenceHostAttempt(
        parameters,
        parameters.get("qa") === "1" ? qaModule : null,
        drawingBuffer,
        controlModel,
        modePreference,
        onPresentationError,
      );
      activeFrameSource = created.frameSource;
      activeShowcaseReplay = created.showcaseReplay;
      return {
        ...created.attempt,
        async dispose() {
          try {
            await created.attempt.dispose();
          } finally {
            if (activeFrameSource === created.frameSource) {
              activeFrameSource = null;
            }
            if (activeShowcaseReplay === created.showcaseReplay) {
              activeShowcaseReplay = null;
            }
          }
        },
      };
    },
    frameSource: () => activeFrameSource,
    showcaseReplay: () => activeShowcaseReplay,
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
  environment: ReferenceEnvironmentAdapter,
): MemoryDeviceLossControl {
  const base = qaModule.createQaMemoryHostLifecycleAdapter({
    scenario,
    simulation: createStaticHostSimulationAdapter(),
    environment,
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
  readonly showcaseReplay: QaShowcaseReplayController | null;
}

function createThreeReferenceHostAttempt(
  parameters: URLSearchParams,
  qaModule: QaHarnessModule | null,
  drawingBuffer: PrewarmDrawingBuffer,
  controlModel: ReferenceLookControlModel,
  modePreference: ReferenceModePreference,
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
  const qaShowcaseRequested =
    qaModule !== null && parameters.get("mode") === "qa";
  const proxyVessel =
    qaModule === null || qaProxyRequested || qaShowcaseRequested
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

  const width = drawingBuffer.width;
  const height = drawingBuffer.height;
  const referenceShowcase = createReferenceShowcasePreset();
  const initialShowcaseCamera =
    qaModule === null || qaShowcaseRequested
      ? referenceShowcase.cameraTimeline[0]
      : undefined;
  const camera = new PerspectiveCamera(50, width / height, 0.1, 4_000);
  camera.position.set(...(initialShowcaseCamera?.position ?? [8, 6, 10]));
  camera.fov = initialShowcaseCamera?.verticalFovDegrees ?? 50;
  camera.lookAt(...(initialShowcaseCamera?.target ?? [0, 0, 0]));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  let appliedShowcaseCamera = initialShowcaseCamera;

  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  let disposed = false;
  const qaPresentation = qaModule?.createQaHostPresentationController();
  const environment = createReferenceEnvironmentAdapter();
  let referencePresentation: ReferenceHostPresentationController | undefined;
  let modeController: ReferenceExperienceModeController | null = null;
  const referenceShowcaseSchedule =
    proxyVessel !== undefined && (qaModule === null || qaShowcaseRequested)
      ? createReferenceShowcaseSchedule({
          showcase: referenceShowcase,
          environment,
          enabled: qaModule === null && modePreference.mode === "director",
          enforceQualityProfile: qaShowcaseRequested,
          body: {
            bodyId: REFERENCE_PROXY_VESSEL_BODY_ID,
            reset: proxyVessel.reset,
            setControls: proxyVessel.setControls,
          },
          camera: {
            setCamera(keyframe) {
              if (appliedShowcaseCamera === keyframe) {
                return;
              }
              camera.position.set(...keyframe.position);
              camera.fov = keyframe.verticalFovDegrees;
              camera.lookAt(...keyframe.target);
              camera.updateProjectionMatrix();
              camera.updateMatrixWorld(true);
              appliedShowcaseCamera = keyframe;
              referencePresentation?.incrementCameraCut();
              qaPresentation?.incrementCameraCut();
            },
          },
          onLookApplied: (look, controls, environmentState) => {
            controlModel.adoptShowcaseLook(controls, environmentState);
            if (
              modeController !== null &&
              modeController.snapshot().mode === "director" &&
              isReferenceAuthoredLookId(look.id)
            ) {
              modeController.reportDirectorLook(look.id);
            }
          },
        })
      : undefined;
  const qaSimulation = qaModule?.createQaHostSimulationController({
    ...(proxyVessel === undefined
      ? {}
      : {
          integrateFixedStep: proxyVessel.integrateFixedStep,
          afterFixedStep: (state) => {
            referenceShowcaseSchedule?.afterFixedStep(state);
            proxyVessel.present(1);
          },
          reset: () => {
            proxyVessel.reset();
            if (!qaShowcaseRequested) {
              proxyVessel.setControls({ throttle: 1, steering: 0 });
            }
          },
        }),
  });
  const referenceSimulation =
    qaSimulation === undefined
      ? createReferenceHostSimulationController({
          ...(proxyVessel === undefined
            ? {}
            : { integrateFixedStep: proxyVessel.integrateFixedStep }),
          ...(referenceShowcaseSchedule === undefined
            ? {}
            : {
                afterFixedStep: referenceShowcaseSchedule.afterFixedStep,
              }),
          ...(proxyVessel === undefined ? {} : { reset: proxyVessel.reset }),
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
  const showcaseReplay = createQaShowcaseReplayController(
    qaShowcaseRequested,
    referenceShowcase,
    referenceShowcaseSchedule,
    proxyVessel,
    environment,
    camera,
    () => appliedShowcaseCamera,
  );

  return Object.freeze({
    frameSource,
    showcaseReplay,
    attempt: {
      host: frameSource?.host ?? baseHost,
      createReadyStage: (lease: RealWaterLease) => {
        frameSource?.bindLease(lease);
        proxyVessel?.attach(lease);
        referenceShowcaseSchedule?.bindLease(lease);
        const stage = createCanvasStage(renderer, lease);
        stage.dataset.experienceMode =
          qaModule === null ? modePreference.mode : "qa";
        referencePresentation?.start();
        return stage;
      },
      decorateReadyStage: (stage: HTMLElement, lease: RealWaterLease) => {
        if (
          qaModule === null &&
          proxyVessel !== undefined &&
          referenceShowcaseSchedule !== undefined &&
          referenceSimulation !== undefined &&
          referencePresentation !== undefined &&
          initialShowcaseCamera !== undefined
        ) {
          return bindThreeReferenceReadyStage({
            stage,
            lease,
            renderer,
            camera,
            proxyVessel,
            environment,
            controlModel,
            schedule: referenceShowcaseSchedule,
            simulation: referenceSimulation,
            presentation: referencePresentation,
            initialCamera: initialShowcaseCamera,
            modePreference,
            setModeController(controller) {
              modeController = controller;
            },
          });
        }
        return bindReferenceControlStage(stage, controlModel, {
          lease,
          environment,
          claimManualLook: () => {
            referenceShowcaseSchedule?.setLookControlOwner("manual");
          },
        });
      },
      dispose: () => {
        if (!disposed) {
          disposed = true;
          renderer.dispose();
          seabed.dispose();
          proxyVessel?.dispose();
          if (environment.texture !== null) {
            disposeHostTexture(environment.texture);
          }
        }
      },
    },
  });
}

function bindReferenceControlStage(
  stage: HTMLElement,
  model: ReferenceLookControlModel,
  binding: ReferenceControlBinding,
): ReadyStageDecoration {
  model.bind(binding);
  let presenters: ReturnType<typeof createReferenceControlPresenters>;
  try {
    presenters = createReferenceControlPresenters(stage, model);
  } catch (cause) {
    model.unbind(binding.lease);
    throw cause;
  }
  let disposed = false;
  return Object.freeze({
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      presenters.dispose();
      model.unbind(binding.lease);
    },
  });
}

interface BindThreeReferenceReadyStageOptions {
  readonly stage: HTMLElement;
  readonly lease: RealWaterLease;
  readonly renderer: WebGPURenderer;
  readonly camera: PerspectiveCamera;
  readonly proxyVessel: ReferenceProxyVessel;
  readonly environment: ReferenceEnvironmentAdapter;
  readonly controlModel: ReferenceLookControlModel;
  readonly schedule: ReferenceShowcaseSchedule;
  readonly simulation: ReferenceHostSimulationController;
  readonly presentation: ReferenceHostPresentationController;
  readonly initialCamera: ShowcaseCameraKeyframe;
  readonly modePreference: ReferenceModePreference;
  readonly setModeController: (
    controller: ReferenceExperienceModeController | null,
  ) => void;
}

function bindThreeReferenceReadyStage(
  options: BindThreeReferenceReadyStageOptions,
): ReadyStageDecoration {
  const sandboxCamera = createReferenceSandboxCameraController(options.camera, {
    resetKeyframe: {
      position: options.initialCamera.position,
      target: options.initialCamera.target,
      verticalFovDegrees: options.initialCamera.verticalFovDegrees,
    },
    onCameraCut: options.presentation.incrementCameraCut,
  });
  const sandboxControls = createReferenceSandboxControls({
    vessel: options.proxyVessel,
    camera: sandboxCamera,
  });
  const inputAttachment = sandboxControls.attach(
    options.stage,
    options.renderer.domElement,
  );
  let controller: ReferenceExperienceModeController | null = null;
  const binding: ReferenceControlBinding = {
    lease: options.lease,
    environment: options.environment,
    claimManualLook: () => {
      options.schedule.setLookControlOwner("manual");
      if (controller?.snapshot().mode === "director") {
        controller.setMode("sandbox");
      }
    },
    diagnostics: options.presentation,
  };
  options.controlModel.bind(binding);

  let controlPresenters:
    ReturnType<typeof createReferenceControlPresenters> | undefined;
  let modePresenter:
    ReturnType<typeof createReferenceExperienceModePresenter> | undefined;
  let unsubscribeMode: () => void = () => {};
  try {
    controlPresenters = createReferenceControlPresenters(
      options.stage,
      options.controlModel,
    );
    controller = createReferenceExperienceModeController({
      initialLook:
        options.modePreference.mode === "sandbox"
          ? options.modePreference.sandboxLook
          : REFERENCE_DEFAULT_AUTHORED_LOOK_ID,
      setShowcaseEnabled: options.schedule.setEnabled,
      setSandboxInputEnabled(enabled) {
        sandboxControls.setEnabled(enabled);
        if (enabled) {
          options.proxyVessel.setControls({ throttle: 0, steering: 0 });
          sandboxControls.resetCamera();
        }
      },
      setSimulationPaused: (paused) => {
        options.simulation.setPaused(paused);
      },
      resetDirector() {
        options.simulation.reset();
        options.schedule.reset();
      },
      resetSandbox() {
        options.simulation.reset();
        sandboxControls.resetCamera();
        applySandboxLook(
          options.controlModel,
          controller?.snapshot().activeLook ??
            REFERENCE_DEFAULT_AUTHORED_LOOK_ID,
        );
      },
      selectSandboxLook: (look) => {
        applySandboxLook(options.controlModel, look);
      },
      releaseManualLookOwnership() {
        options.controlModel.releaseManualLookOwnership();
        options.schedule.setLookControlOwner("showcase");
      },
    });
    options.setModeController(controller);
    const desiredMode = options.modePreference.mode;
    if (desiredMode === "sandbox") {
      controller.setMode("sandbox");
      if (options.controlModel.snapshot().lookControlOwner !== "manual") {
        applySandboxLook(
          options.controlModel,
          REFERENCE_DEFAULT_AUTHORED_LOOK_ID,
        );
      }
    }
    unsubscribeMode = controller.subscribe((snapshot) => {
      options.modePreference.mode = snapshot.mode;
      if (snapshot.mode === "sandbox") {
        options.modePreference.sandboxLook = snapshot.activeLook;
      }
      options.stage.dataset.experienceMode = snapshot.mode;
    });
    modePresenter = createReferenceExperienceModePresenter(
      options.stage,
      controller,
    );
  } catch (cause) {
    options.setModeController(null);
    controller?.dispose();
    controlPresenters?.dispose();
    options.controlModel.unbind(options.lease);
    inputAttachment.dispose();
    sandboxControls.dispose();
    throw cause;
  }

  let disposed = false;
  return Object.freeze({
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      options.setModeController(null);
      modePresenter?.dispose();
      unsubscribeMode();
      controller?.dispose();
      controlPresenters?.dispose();
      options.controlModel.unbind(options.lease);
      inputAttachment.dispose();
      sandboxControls.dispose();
    },
  });
}

function applySandboxLook(
  model: ReferenceLookControlModel,
  look: AuthoredLookId,
): void {
  const resolved = resolveReferenceAuthoredLook(look);
  model.applyWaterPreset(resolved.waterPreset);
  model.applyEnvironmentPreset(resolved.environmentPreset);
}

function createQaShowcaseReplayController(
  requested: boolean,
  showcase: ShowcasePreset,
  schedule: ReferenceShowcaseSchedule | undefined,
  vessel: ReferenceProxyVessel | undefined,
  environment: ReferenceEnvironmentAdapter,
  camera: PerspectiveCamera,
  appliedCamera: () => ShowcaseCameraKeyframe | undefined,
): QaShowcaseReplayController | null {
  if (!requested || schedule === undefined || vessel === undefined) {
    return null;
  }
  return Object.freeze({
    preset: () => showcase,
    activate(): void {
      schedule.setLookControlOwner("showcase");
      schedule.setEnabled(true);
      schedule.reset();
    },
    deactivate(): void {
      schedule.setEnabled(false);
    },
    snapshot() {
      const route = schedule.snapshot();
      const cameraKeyframe = appliedCamera();
      if (cameraKeyframe === undefined) {
        throw new Error("The QA Showcase camera has not been applied.");
      }
      const body = vessel.inspect();
      return Object.freeze({
        look: Object.freeze({
          id: route.activeLook.id,
          waterPreset: route.activeLook.waterPreset,
          environmentPreset: route.activeLook.environmentPreset,
        }),
        camera: Object.freeze({
          projection: "perspective" as const,
          position: cameraKeyframe.position,
          target: cameraKeyframe.target,
          up: Object.freeze([camera.up.x, camera.up.y, camera.up.z] as const),
          verticalFovDegrees: camera.fov,
          near: camera.near,
          far: camera.far,
        }),
        body: Object.freeze({
          id: REFERENCE_PROXY_VESSEL_BODY_ID,
          controls: body.controls,
          fixedStepCount: body.fixedStepCount,
          pose: body.pose,
        }),
        environment: environment.snapshot(),
        events: route.events,
      });
    },
  });
}

function createDeferredQaShowcaseReplayController(
  hostSetup: ReferenceHostSetup,
): QaShowcaseReplayController {
  let active: QaShowcaseReplayController | null = null;
  const requireController = (): QaShowcaseReplayController => {
    const controller = hostSetup.showcaseReplay();
    if (controller === null) {
      throw new Error("The QA Showcase replay Host is not ready.");
    }
    return controller;
  };
  return Object.freeze({
    preset: () => requireController().preset(),
    activate(): void {
      const controller = requireController();
      active = controller;
      controller.activate();
    },
    deactivate(): void {
      const controller = active;
      active = null;
      controller?.deactivate();
    },
    snapshot: () => (active ?? requireController()).snapshot(),
  });
}

function readInitialExperienceMode(
  parameters: URLSearchParams,
): ReferenceExperienceMode {
  return parameters.get("mode") === "sandbox" ? "sandbox" : "director";
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
    __REAL_WATER_QA__?: QaHarness;
  }
}
