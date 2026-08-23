import type {
  HostTemporalResetReason,
  PrewarmManifest,
  RealWaterCapabilities,
} from "real-water";
import { PREWARM_MANIFEST_VERSION } from "real-water";
import {
  createQaBoundCoreManifestIdentity,
  readReadyCapabilities,
  type QaBoundCoreManifestIdentity,
} from "./qa-bound-core-identity.js";
export type { QaBoundCoreManifestIdentity } from "./qa-bound-core-identity.js";
import {
  readHostDiagnosticsPresentedFrame,
  type HostDiagnosticsPresentedFrame,
  type HostDiagnosticsRoute,
} from "real-water/diagnostics";
import {
  QA_FRAME_FIXED_TICK_HZ,
  isQaFrameCaptureName,
  isQaFrameSeed,
  isQaFrameTickCount,
  type QaFrameCaptureName,
} from "./qa-frame-contract.js";
import type { QaHostSimulationController } from "./qa-simulation-controller.js";

export const QA_TO_CORE_DECLARATION_IDS = Object.freeze({
  "final-color": "water-final-color-target",
  "current-color": "water-current-color-target",
  "depth": "water-inverse-linear-depth",
  "normal": "water-view-normal",
  "motion-vector": "water-motion-vectors",
  "whitecap-generation": "water-whitecap-stage-target",
  "whitecap-history": "water-whitecap-stage-target",
  "whitecap-advection": "water-whitecap-stage-target",
  "whitecap-decay": "water-whitecap-stage-target",
  "optical-fresnel": "water-optical-factors-target",
  "optical-thickness": "water-optical-factors-target",
  "optical-scattering": "water-optical-diagnostics-b",
  "optical-environment-reflection": "water-optical-diagnostics-b",
  "optical-crest-transmission": "water-optical-diagnostics-a",
  "optical-transmittance": "water-optical-diagnostics-a",
  "optical-glint": "water-optical-factors-target",
  "planar-color": "water-planar-reflection-target",
  "planar-target-alpha": "water-planar-reflection-target",
  "ssr-hit": "water-ssr-raw-target",
  "ssr-confidence": "water-ssr-composite-target",
  "ssr-color": "water-ssr-raw-target",
  "ssr-roughness": "water-view-normal",
  "reflection-base-color": "water-render-target",
  "ssr-composite-color": "water-ssr-composite-target",
  "ssr-history-color": "water-ssr-history-resolved-capture-target",
  "ssr-history-frame-weight": "water-ssr-history-resolved-capture-target",
  "ssr-history-input-color": "water-ssr-history-beauty-target",
} as const);

export const QA_FRAME_PREWARM_MANIFEST = Object.freeze({
  schema: "real-water/qa-frame-prewarm" as const,
  version: 8 as const,
  id: "reference-qa-frame" as const,
  captures: Object.freeze([
    Object.freeze({
      name: "final-color" as const,
      preparedFormat: "rgba8unorm-srgb" as const,
    }),
    Object.freeze({
      name: "current-color" as const,
      preparedFormat: "rgba8unorm-srgb" as const,
    }),
    Object.freeze({
      name: "depth" as const,
      preparedFormat: "r32float-inverse-linear-view" as const,
    }),
    Object.freeze({
      name: "normal" as const,
      preparedFormat: "rgba16float-view-normal" as const,
    }),
    Object.freeze({
      name: "motion-vector" as const,
      preparedFormat: "rg16float-ndc" as const,
    }),
    Object.freeze({
      name: "whitecap-generation" as const,
      preparedFormat: "rgba16float-whitecap-stages" as const,
    }),
    Object.freeze({
      name: "whitecap-history" as const,
      preparedFormat: "rgba16float-whitecap-stages" as const,
    }),
    Object.freeze({
      name: "whitecap-advection" as const,
      preparedFormat: "rgba16float-whitecap-stages" as const,
    }),
    Object.freeze({
      name: "whitecap-decay" as const,
      preparedFormat: "rgba16float-whitecap-stages" as const,
    }),
    Object.freeze({
      name: "optical-fresnel" as const,
      preparedFormat: "rgba16float-optical-factors" as const,
    }),
    Object.freeze({
      name: "optical-thickness" as const,
      preparedFormat: "rgba16float-optical-factors" as const,
    }),
    Object.freeze({
      name: "optical-scattering" as const,
      preparedFormat: "rg8unorm-optical-diagnostics-b" as const,
    }),
    Object.freeze({
      name: "optical-environment-reflection" as const,
      preparedFormat: "rg8unorm-optical-diagnostics-b" as const,
    }),
    Object.freeze({
      name: "optical-crest-transmission" as const,
      preparedFormat: "rg8unorm-optical-diagnostics-a" as const,
    }),
    Object.freeze({
      name: "optical-transmittance" as const,
      preparedFormat: "rg8unorm-optical-diagnostics-a" as const,
    }),
    Object.freeze({
      name: "optical-glint" as const,
      preparedFormat: "rgba16float-optical-factors" as const,
    }),
    Object.freeze({
      name: "planar-color" as const,
      preparedFormat: "rgba8unorm-srgb" as const,
    }),
    Object.freeze({
      name: "planar-target-alpha" as const,
      preparedFormat: "rgba8unorm-srgb" as const,
    }),
    Object.freeze({
      name: "ssr-hit" as const,
      preparedFormat: "rgba16float-ssr-raw" as const,
    }),
    Object.freeze({
      name: "ssr-confidence" as const,
      preparedFormat: "rgba16float-ssr-composite" as const,
    }),
    Object.freeze({
      name: "ssr-color" as const,
      preparedFormat: "rgba16float-ssr-raw" as const,
    }),
    Object.freeze({
      name: "ssr-roughness" as const,
      preparedFormat: "rgba16float-view-normal" as const,
    }),
    Object.freeze({
      name: "reflection-base-color" as const,
      preparedFormat: "rgba16float-scene-output" as const,
    }),
    Object.freeze({
      name: "ssr-composite-color" as const,
      preparedFormat: "rgba16float-ssr-composite" as const,
    }),
    Object.freeze({
      name: "ssr-history-color" as const,
      preparedFormat: "rgba16float-ssr-history-resolve" as const,
    }),
    Object.freeze({
      name: "ssr-history-frame-weight" as const,
      preparedFormat: "rgba16float-ssr-history-resolve" as const,
    }),
    Object.freeze({
      name: "ssr-history-input-color" as const,
      preparedFormat: "rgba16float-ssr-history-beauty" as const,
    }),
  ]),
  coreDeclarations: QA_TO_CORE_DECLARATION_IDS,
});

export type QaFrameDriverCaptureName = QaFrameCaptureName;

interface QaFrameDriverCaptureBase {
  readonly width: number;
  readonly height: number;
  readonly origin: "top-left";
}

export interface QaFrameDriverFinalColorCapture extends QaFrameDriverCaptureBase {
  readonly name: "final-color";
  readonly format: "rgba8unorm-srgb";
  readonly data: Uint8Array;
}

export interface QaFrameDriverCurrentColorCapture extends QaFrameDriverCaptureBase {
  readonly name: "current-color";
  readonly format: "rgba8unorm-srgb";
  readonly data: Uint8Array;
}

export interface QaFrameDriverPlanarColorCapture extends QaFrameDriverCaptureBase {
  readonly name: "planar-color";
  readonly format: "rgba8unorm-srgb";
  readonly data: Uint8Array;
}

export interface QaFrameDriverDepthCapture extends QaFrameDriverCaptureBase {
  readonly name: "depth";
  readonly format: "r32float-linear-view";
  readonly data: Float32Array;
}

export interface QaFrameDriverNormalCapture extends QaFrameDriverCaptureBase {
  readonly name: "normal";
  readonly format: "rgb32float-view-normal";
  readonly data: Float32Array;
}

export interface QaFrameDriverMotionVectorCapture extends QaFrameDriverCaptureBase {
  readonly name: "motion-vector";
  readonly format: "rg32float-ndc";
  readonly data: Float32Array;
}

export interface QaFrameDriverWhitecapStageCapture extends QaFrameDriverCaptureBase {
  readonly name:
    | "whitecap-generation"
    | "whitecap-history"
    | "whitecap-advection"
    | "whitecap-decay";
  readonly format: "r32float-whitecap-stage";
  readonly data: Float32Array;
}

export interface QaFrameDriverOpticalScalarCapture extends QaFrameDriverCaptureBase {
  readonly name:
    | "optical-fresnel"
    | "optical-thickness"
    | "optical-scattering"
    | "optical-environment-reflection"
    | "optical-crest-transmission"
    | "optical-transmittance"
    | "optical-glint"
    | "planar-target-alpha"
    | "ssr-hit"
    | "ssr-confidence";
  readonly format: "r32float-optical";
  readonly data: Float32Array;
}

export interface QaFrameDriverSsrColorCapture extends QaFrameDriverCaptureBase {
  readonly name: "ssr-color";
  readonly format: "rgb32float-linear-ssr";
  readonly data: Float32Array;
}

export interface QaFrameDriverSsrRoughnessCapture extends QaFrameDriverCaptureBase {
  readonly name: "ssr-roughness";
  readonly format: "r32float-ssr-roughness";
  readonly data: Float32Array;
}

export interface QaFrameDriverReflectionBaseColorCapture extends QaFrameDriverCaptureBase {
  readonly name: "reflection-base-color";
  readonly format: "rgb32float-linear-reflection-base";
  readonly data: Float32Array;
}

export interface QaFrameDriverSsrCompositeColorCapture extends QaFrameDriverCaptureBase {
  readonly name: "ssr-composite-color";
  readonly format: "rgb32float-linear-ssr-composite";
  readonly data: Float32Array;
}

export interface QaFrameDriverSsrHistoryColorCapture extends QaFrameDriverCaptureBase {
  readonly name: "ssr-history-color";
  readonly format: "rgb32float-linear-ssr-history";
  readonly data: Float32Array;
}

export interface QaFrameDriverSsrHistoryFrameWeightCapture extends QaFrameDriverCaptureBase {
  readonly name: "ssr-history-frame-weight";
  readonly format: "r32float-ssr-history-frame-weight";
  readonly data: Float32Array;
}

export interface QaFrameDriverSsrHistoryInputColorCapture extends QaFrameDriverCaptureBase {
  readonly name: "ssr-history-input-color";
  readonly format: "rgb32float-linear-ssr-history-input";
  readonly data: Float32Array;
}

export type QaFrameDriverCapture =
  | QaFrameDriverFinalColorCapture
  | QaFrameDriverCurrentColorCapture
  | QaFrameDriverPlanarColorCapture
  | QaFrameDriverSsrColorCapture
  | QaFrameDriverSsrRoughnessCapture
  | QaFrameDriverReflectionBaseColorCapture
  | QaFrameDriverSsrCompositeColorCapture
  | QaFrameDriverSsrHistoryColorCapture
  | QaFrameDriverSsrHistoryFrameWeightCapture
  | QaFrameDriverSsrHistoryInputColorCapture
  | QaFrameDriverDepthCapture
  | QaFrameDriverNormalCapture
  | QaFrameDriverMotionVectorCapture
  | QaFrameDriverWhitecapStageCapture
  | QaFrameDriverOpticalScalarCapture;

export interface QaFrameDriverStateReceipt {
  readonly seed: number;
  readonly tick: number;
  readonly timeSeconds: number;
  readonly simulationResetRevision: number;
}

export interface QaRendererDeviceInventory {
  readonly features: readonly string[];
  readonly limits: Readonly<Record<string, number>>;
}

export interface QaFramePrewarmReceipt {
  readonly manifest: typeof QA_FRAME_PREWARM_MANIFEST;
  readonly core: QaBoundCoreManifestIdentity;
  readonly capabilities: RealWaterCapabilities;
  readonly width: number;
  readonly height: number;
  readonly rendererDevice: QaRendererDeviceInventory | null;
  readonly progress: Readonly<{
    readonly completedWork: number;
    readonly totalWork: number;
    readonly completedDeclarationIds: readonly string[];
  }>;
}

export type QaTemporalResetReason =
  "qa-reset" | "camera-cut" | "origin-shift" | "sea-state-cut";

export interface QaTemporalReceipt {
  readonly historyEpoch: number;
  readonly resetReason: QaTemporalResetReason | null;
  readonly resetFrame: boolean;
}

export interface QaFrameDriverPresentedFrame extends QaFrameDriverStateReceipt {
  readonly presentationId: number;
  readonly manifestHash: string;
  readonly controlRevision: number;
  readonly originRevision: number;
  readonly cameraCutRevision: number;
  readonly seaStateCutRevision: number;
  readonly compileCount: number;
  readonly probeCount: number;
  readonly prewarm: QaFramePrewarmReceipt;
  readonly captures: readonly QaFrameDriverCapture[];
  readonly temporal: QaTemporalReceipt;
}

export interface QaFrameDriver {
  readonly fixedTickHz: typeof QA_FRAME_FIXED_TICK_HZ;
  readonly prewarm: QaFramePrewarmReceipt;
  reset(request: { readonly seed: number }): Promise<QaFrameDriverStateReceipt>;
  present(request: {
    readonly advanceFixedTicks: number;
    readonly captures: readonly QaFrameDriverCaptureName[];
  }): Promise<QaFrameDriverPresentedFrame>;
  dispose(): Promise<void>;
}

export interface CreateQaFrameDriverOptions {
  readonly diagnostics: HostDiagnosticsRoute;
  readonly manifestHash: string;
  readonly simulation: QaHostSimulationController;
  readonly prewarm: QaFramePrewarmReceipt;
}

export function createQaFrameDriver(
  options: CreateQaFrameDriverOptions,
): QaFrameDriver {
  let accepting = true;
  let disposal: Promise<void> | undefined;
  let queue = Promise.resolve();
  let reset = false;

  const enqueue = <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    if (!accepting) {
      return Promise.reject(
        new Error("The QA frame driver has been disposed."),
      );
    }
    const result = queue.then(operation);
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  };

  return Object.freeze({
    fixedTickHz: QA_FRAME_FIXED_TICK_HZ,
    prewarm: options.prewarm,
    reset(request: { readonly seed: number }) {
      const nextSeed = request.seed;
      assertSeed(nextSeed);
      return enqueue(async () => {
        reset = true;
        const state = options.simulation.reset(nextSeed);
        return Object.freeze({
          seed: state.seed,
          tick: state.tick,
          timeSeconds: state.timeSeconds,
          simulationResetRevision: state.simulationResetRevision,
        });
      });
    },
    present(request: {
      readonly advanceFixedTicks: number;
      readonly captures: readonly QaFrameDriverCaptureName[];
    }) {
      const advance = request.advanceFixedTicks;
      const requestedCaptures = [...request.captures];
      return enqueue(async () => {
        if (!reset) {
          throw new Error("Reset the QA frame driver before presentation.");
        }
        const current = options.simulation.snapshot();
        assertTickAdvance(advance, current.tick);
        assertCaptureNames(requestedCaptures);
        const nextState = options.simulation.advance(advance);
        try {
          const frame = readHostDiagnosticsPresentedFrame(
            await options.diagnostics.present({
              outputs: requestedCaptures,
            }),
          );
          return toQaPresentedFrame(
            frame,
            nextState,
            options.manifestHash,
            options.prewarm,
            requestedCaptures,
          );
        } catch (error) {
          reset = false;
          throw error;
        }
      });
    },
    dispose(): Promise<void> {
      accepting = false;
      disposal ??= queue.then(() => undefined);
      return disposal;
    },
  });
}

export function createBoundCoreDiagnosticsPrewarmReceipt(
  coreManifest: PrewarmManifest,
  rendererDevice: QaRendererDeviceInventory | null,
  capabilities: RealWaterCapabilities,
): QaFramePrewarmReceipt {
  if (
    coreManifest.schema !== "real-water/prewarm" ||
    coreManifest.version !== PREWARM_MANIFEST_VERSION ||
    typeof coreManifest.id !== "string" ||
    typeof coreManifest.manifestHash !== "string" ||
    !Array.isArray(coreManifest.declarations)
  ) {
    throw new TypeError(
      "QA prewarm receipt requires the actual Host Core Prewarm Manifest.",
    );
  }
  const width = coreManifest.drawingBuffer.width;
  const height = coreManifest.drawingBuffer.height;
  if (
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    !Number.isSafeInteger(height) ||
    height <= 0
  ) {
    throw new RangeError(
      "QA prewarm receipt requires the Core drawing buffer.",
    );
  }
  const coreIds = new Set(
    coreManifest.declarations.map((declaration) => declaration.id),
  );
  const mappedIds: string[] = [];
  for (const coreId of Object.values(QA_TO_CORE_DECLARATION_IDS)) {
    if (!coreIds.has(coreId)) {
      throw new Error(
        `QA capture-contract maps to missing Core declaration ${coreId}.`,
      );
    }
    if (!mappedIds.includes(coreId)) {
      mappedIds.push(coreId);
    }
  }
  const core = createQaBoundCoreManifestIdentity(coreManifest);
  return Object.freeze({
    manifest: QA_FRAME_PREWARM_MANIFEST,
    core,
    capabilities: readReadyCapabilities(
      capabilities,
      coreManifest.qualityProfile,
      coreManifest.drawingBuffer,
    ),
    width,
    height,
    rendererDevice,
    progress: Object.freeze({
      completedWork: mappedIds.length,
      totalWork: mappedIds.length,
      completedDeclarationIds: Object.freeze(mappedIds),
    }),
  });
}

function toQaPresentedFrame(
  frame: HostDiagnosticsPresentedFrame,
  state: ReturnType<QaHostSimulationController["snapshot"]>,
  manifestHash: string,
  prewarm: QaFramePrewarmReceipt,
  requestedCaptures: readonly QaFrameDriverCaptureName[],
): QaFrameDriverPresentedFrame {
  if (frame.manifestHash !== manifestHash) {
    throw new Error(
      "Core presented frame manifestHash diverged from Host prepare.",
    );
  }
  if (
    frame.seed !== state.seed ||
    frame.tick !== state.tick ||
    frame.timeSeconds !== state.timeSeconds ||
    frame.simulationResetRevision !== state.simulationResetRevision
  ) {
    throw new Error(
      "Core presented frame simulation state diverged from the Host adapter.",
    );
  }
  if (frame.width !== prewarm.width || frame.height !== prewarm.height) {
    throw new Error(
      "Core presented frame dimensions diverged from the Core drawing buffer.",
    );
  }
  if (frame.outputs.length !== requestedCaptures.length) {
    throw new Error(
      "Core presented frame output count diverged from the requested captures.",
    );
  }
  for (const [index, name] of requestedCaptures.entries()) {
    if (frame.outputs[index]?.name !== name) {
      throw new Error(
        "Core presented frame output names diverged from the requested captures.",
      );
    }
  }
  return Object.freeze({
    seed: frame.seed,
    tick: frame.tick,
    timeSeconds: frame.timeSeconds,
    presentationId: frame.presentationId,
    manifestHash: frame.manifestHash,
    simulationResetRevision: frame.simulationResetRevision,
    controlRevision: frame.controlRevision,
    originRevision: frame.originRevision,
    cameraCutRevision: frame.cameraCutRevision,
    seaStateCutRevision: frame.seaStateCutRevision,
    compileCount: frame.compileCount,
    probeCount: frame.probeCount,
    prewarm,
    captures: Object.freeze([
      ...frame.outputs,
    ]) as readonly QaFrameDriverCapture[],
    temporal: Object.freeze({
      historyEpoch: frame.temporal.historyEpoch,
      resetReason: mapQaTemporalResetReason(frame.temporal.resetReason),
      resetFrame: frame.temporal.resetFrame,
    }),
  });
}

function mapQaTemporalResetReason(
  reason: HostTemporalResetReason | null,
): QaTemporalResetReason | null {
  if (reason === null) {
    return null;
  }
  return reason === "simulation-reset" ? "qa-reset" : reason;
}

function assertSeed(seed: number): void {
  if (!isQaFrameSeed(seed)) {
    throw new RangeError("QA frame seeds must be unsigned 32-bit integers.");
  }
}

function assertTickAdvance(advance: number, currentTick: number): void {
  if (
    !isQaFrameTickCount(advance) ||
    !Number.isSafeInteger(currentTick + advance)
  ) {
    throw new RangeError(
      "QA frame tick advances must be non-negative safe integers.",
    );
  }
}

function assertCaptureNames(names: readonly QaFrameDriverCaptureName[]): void {
  if (new Set(names).size !== names.length) {
    throw new TypeError("QA frame capture names must be unique.");
  }
  for (const name of names) {
    if (!isQaFrameCaptureName(name)) {
      throw new TypeError(`Unsupported QA frame capture: ${String(name)}`);
    }
  }
}
