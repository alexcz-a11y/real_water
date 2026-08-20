/**
 * Package-private Host diagnostics present route and CPU capture DTOs.
 *
 * @packageDocumentation
 */

import { hasExactKeys, isRecord } from "./internal/record-validation.js";
import { getHostDiagnosticsImplementation } from "./internal/diagnostics-route-bridge.js";
import {
  readHostPresentationRoute,
  readHostPresentedFrame,
  type HostPresentationRoute,
  type HostPresentedFrame,
} from "./presentation.js";

/**
 * Re-exported root presentation receipt so diagnostics consumers can name the
 * extended frame without importing the root barrel.
 *
 * @public
 */
export type {
  HostPresentedFrame,
  HostPresentedTemporal,
  HostPresentationRoute,
  HostTemporalResetReason,
} from "./presentation.js";

/**
 * The twelve named diagnostic outputs. Names and CPU shapes match the QA
 * capture contract.
 *
 * @public
 */
export const DIAGNOSTICS_CAPTURE_NAMES = Object.freeze([
  "final-color",
  "current-color",
  "depth",
  "normal",
  "motion-vector",
  "optical-fresnel",
  "optical-thickness",
  "optical-scattering",
  "optical-environment-reflection",
  "optical-crest-transmission",
  "optical-transmittance",
  "optical-glint",
] as const);

/**
 * One of the twelve named diagnostic CPU outputs.
 *
 * @public
 */
export type DiagnosticsCaptureName = (typeof DIAGNOSTICS_CAPTURE_NAMES)[number];

/**
 * Frozen CPU DTO metadata for each named diagnostic output.
 *
 * @public
 */
export const DIAGNOSTICS_CAPTURE_SHAPES = Object.freeze({
  "final-color": Object.freeze({
    format: "rgba8unorm-srgb" as const,
    elementType: "uint8" as const,
    components: 4 as const,
  }),
  "current-color": Object.freeze({
    format: "rgba8unorm-srgb" as const,
    elementType: "uint8" as const,
    components: 4 as const,
  }),
  "depth": Object.freeze({
    format: "r32float-linear-view" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "normal": Object.freeze({
    format: "rgb32float-view-normal" as const,
    elementType: "float32" as const,
    components: 3 as const,
  }),
  "motion-vector": Object.freeze({
    format: "rg32float-ndc" as const,
    elementType: "float32" as const,
    components: 2 as const,
  }),
  "optical-fresnel": Object.freeze({
    format: "r32float-optical" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "optical-thickness": Object.freeze({
    format: "r32float-optical" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "optical-scattering": Object.freeze({
    format: "r32float-optical" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "optical-environment-reflection": Object.freeze({
    format: "r32float-optical" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "optical-crest-transmission": Object.freeze({
    format: "r32float-optical" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "optical-transmittance": Object.freeze({
    format: "r32float-optical" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "optical-glint": Object.freeze({
    format: "r32float-optical" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
});

const CAPTURE_NAME_SET = new Set<string>(DIAGNOSTICS_CAPTURE_NAMES);
const HOST_DIAGNOSTICS_PRESENT_REQUEST_KEYS = ["outputs"] as const;
const HOST_DIAGNOSTICS_PRESENTED_FRAME_KEYS = [
  "presentationId",
  "manifestHash",
  "seed",
  "tick",
  "timeSeconds",
  "simulationResetRevision",
  "controlRevision",
  "originRevision",
  "cameraCutRevision",
  "seaStateCutRevision",
  "temporal",
  "outputs",
  "compileCount",
  "probeCount",
  "diagnosticReadbackCount",
  "sceneRenderCount",
  "width",
  "height",
] as const;

/**
 * Shared CPU layout for every named diagnostic output. Origin is top-left.
 *
 * @public
 */
export interface DiagnosticsCaptureBase {
  /** Output width in pixels. */
  readonly width: number;
  /** Output height in pixels. */
  readonly height: number;
  /** Packed buffer origin. Always top-left. */
  readonly origin: "top-left";
}

/**
 * TRAA-resolved final color readback.
 *
 * @public
 */
export interface DiagnosticsFinalColorCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "final-color";
  /** Packed sRGB8 format. */
  readonly format: "rgba8unorm-srgb";
  /** Tightly packed RGBA8 pixels. */
  readonly data: Uint8Array;
}

/**
 * Current-color AOV before TRAA resolve.
 *
 * @public
 */
export interface DiagnosticsCurrentColorCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "current-color";
  /** Packed sRGB8 format. */
  readonly format: "rgba8unorm-srgb";
  /** Tightly packed RGBA8 pixels. */
  readonly data: Uint8Array;
}

/**
 * Linear-view depth readback.
 *
 * @public
 */
export interface DiagnosticsDepthCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "depth";
  /** Packed linear-view depth format. */
  readonly format: "r32float-linear-view";
  /** Tightly packed depth samples. */
  readonly data: Float32Array;
}

/**
 * View-space normal readback.
 *
 * @public
 */
export interface DiagnosticsNormalCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "normal";
  /** Packed view-normal format. */
  readonly format: "rgb32float-view-normal";
  /** Tightly packed XYZ normals. */
  readonly data: Float32Array;
}

/**
 * NDC motion-vector readback.
 *
 * @public
 */
export interface DiagnosticsMotionVectorCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "motion-vector";
  /** Packed NDC motion format. */
  readonly format: "rg32float-ndc";
  /** Tightly packed RG motion samples. */
  readonly data: Float32Array;
}

/**
 * Optical scalar AOV readback.
 *
 * @public
 */
export interface DiagnosticsOpticalScalarCapture extends DiagnosticsCaptureBase {
  /** Optical capture name. */
  readonly name:
    | "optical-fresnel"
    | "optical-thickness"
    | "optical-scattering"
    | "optical-environment-reflection"
    | "optical-crest-transmission"
    | "optical-transmittance"
    | "optical-glint";
  /** Packed optical scalar format. */
  readonly format: "r32float-optical";
  /** Tightly packed scalar samples. */
  readonly data: Float32Array;
}

/**
 * Frozen CPU DTO for one named diagnostic output. No GPU object types.
 *
 * @public
 */
export type DiagnosticsCapture =
  | DiagnosticsFinalColorCapture
  | DiagnosticsCurrentColorCapture
  | DiagnosticsDepthCapture
  | DiagnosticsNormalCapture
  | DiagnosticsMotionVectorCapture
  | DiagnosticsOpticalScalarCapture;

/**
 * Diagnostics present request. The exact key is `outputs`. Named outputs must
 * be unique supported names. Domain reset is Host simulation-reset revision,
 * not a request knob.
 *
 * @public
 */
export interface HostDiagnosticsPresentRequest {
  /** Unique supported diagnostic output names to read back. */
  readonly outputs: readonly DiagnosticsCaptureName[];
}

/**
 * One diagnostics present: the root receipt plus named CPU outputs and
 * truthful readiness counters.
 *
 * @public
 */
export interface HostDiagnosticsPresentedFrame extends HostPresentedFrame {
  /** Named CPU outputs in request order. */
  readonly outputs: readonly DiagnosticsCapture[];
  /** Material compile count observed for this present. */
  readonly compileCount: number;
  /** Probe count observed for this present. */
  readonly probeCount: number;
  /** Number of diagnostic readbacks performed for this present. */
  readonly diagnosticReadbackCount: number;
  /** Host scene renders performed for this present. */
  readonly sceneRenderCount: number;
  /** Drawing-buffer width of the presented frame. */
  readonly width: number;
  /** Drawing-buffer height of the presented frame. */
  readonly height: number;
}

/**
 * Package-private diagnostics command on a bound Host Presentation Route.
 *
 * @public
 */
export interface HostDiagnosticsRoute {
  /**
   * Presents one Core frame and reads the requested CPU outputs.
   */
  present(
    request: HostDiagnosticsPresentRequest,
  ): Promise<HostDiagnosticsPresentedFrame>;
}

/**
 * Confirms `value` is one of the twelve diagnostic capture names.
 *
 * @public
 */
export function isDiagnosticsCaptureName(
  value: unknown,
): value is DiagnosticsCaptureName {
  return typeof value === "string" && CAPTURE_NAME_SET.has(value);
}

/**
 * Reads the package-private diagnostics implementation from a root
 * Host Presentation Route. The symbol is not a string key and is
 * invisible to the root route reader.
 *
 * @public
 */
export function readHostDiagnosticsRoute(
  route: HostPresentationRoute,
): HostDiagnosticsRoute {
  const accepted = readHostPresentationRoute(route);
  const diagnostics = getHostDiagnosticsImplementation(accepted);
  if (
    diagnostics === undefined ||
    !isRecord(diagnostics) ||
    typeof diagnostics.present !== "function"
  ) {
    throw new TypeError(
      "Host Presentation Route has no Core diagnostics implementation.",
    );
  }
  return diagnostics;
}

/**
 * Validates a diagnostics present request. Duplicate or unknown output names
 * fail closed.
 *
 * @public
 */
export function readHostDiagnosticsPresentRequest(
  request: HostDiagnosticsPresentRequest,
): HostDiagnosticsPresentRequest {
  if (!isRecord(request)) {
    throw new TypeError("Host diagnostics present request must be an object.");
  }
  if (!hasExactKeys(request, HOST_DIAGNOSTICS_PRESENT_REQUEST_KEYS)) {
    throw new TypeError(
      "Host diagnostics present request must use the exact outputs key.",
    );
  }
  if (!Array.isArray(request.outputs)) {
    throw new TypeError(
      "Host diagnostics present request outputs must be an array.",
    );
  }
  if (new Set(request.outputs).size !== request.outputs.length) {
    throw new TypeError("Host diagnostics output names must be unique.");
  }
  for (const name of request.outputs) {
    if (!isDiagnosticsCaptureName(name)) {
      throw new TypeError(
        `Unsupported Host diagnostics output: ${String(name)}`,
      );
    }
  }
  return Object.freeze({
    outputs: Object.freeze([...request.outputs]),
  });
}

/**
 * Reads and validates one diagnostics presented frame.
 *
 * @public
 */
export function readHostDiagnosticsPresentedFrame(
  frame: HostDiagnosticsPresentedFrame,
): HostDiagnosticsPresentedFrame {
  if (
    !isRecord(frame) ||
    !hasExactKeys(frame, HOST_DIAGNOSTICS_PRESENTED_FRAME_KEYS)
  ) {
    throw new TypeError(
      "Host diagnostics presented frame must use the exact receipt contract.",
    );
  }
  const receipt = readHostPresentedFrame({
    presentationId: frame.presentationId,
    manifestHash: frame.manifestHash,
    seed: frame.seed,
    tick: frame.tick,
    timeSeconds: frame.timeSeconds,
    simulationResetRevision: frame.simulationResetRevision,
    controlRevision: frame.controlRevision,
    originRevision: frame.originRevision,
    cameraCutRevision: frame.cameraCutRevision,
    seaStateCutRevision: frame.seaStateCutRevision,
    temporal: frame.temporal,
  });
  if (!Array.isArray(frame.outputs)) {
    throw new TypeError("Host diagnostics outputs must be an array.");
  }
  const width = readNonNegativeSafeInteger(
    frame.width,
    "Host diagnostics frame width",
  );
  const height = readNonNegativeSafeInteger(
    frame.height,
    "Host diagnostics frame height",
  );
  const outputs = frame.outputs.map((output) =>
    readDiagnosticsCapture(output, receipt.presentationId, width, height),
  );
  return Object.freeze({
    ...receipt,
    outputs: Object.freeze(outputs),
    compileCount: readNonNegativeSafeInteger(
      frame.compileCount,
      "Host diagnostics compileCount",
    ),
    probeCount: readNonNegativeSafeInteger(
      frame.probeCount,
      "Host diagnostics probeCount",
    ),
    diagnosticReadbackCount: readNonNegativeSafeInteger(
      frame.diagnosticReadbackCount,
      "Host diagnostics diagnosticReadbackCount",
    ),
    sceneRenderCount: readNonNegativeSafeInteger(
      frame.sceneRenderCount,
      "Host diagnostics sceneRenderCount",
    ),
    width,
    height,
  });
}

function readDiagnosticsCapture(
  value: DiagnosticsCapture,
  presentationId: number,
  width: number,
  height: number,
): DiagnosticsCapture {
  if (!isRecord(value) || !isDiagnosticsCaptureName(value.name)) {
    throw new TypeError("Host diagnostics output must use a supported name.");
  }
  if (value.origin !== "top-left") {
    throw new TypeError("Host diagnostics output origin must be top-left.");
  }
  if (value.width !== width || value.height !== height) {
    throw new TypeError(
      `Host diagnostics output ${value.name} dimensions must match presentation ${String(presentationId)}.`,
    );
  }
  const shape = DIAGNOSTICS_CAPTURE_SHAPES[value.name];
  if (value.format !== shape.format) {
    throw new TypeError(
      `Host diagnostics output ${value.name} must use format ${shape.format}.`,
    );
  }
  const expectedLength = width * height * shape.components;
  if (shape.elementType === "uint8") {
    if (
      !(value.data instanceof Uint8Array) ||
      value.data.length !== expectedLength
    ) {
      throw new TypeError(
        `Host diagnostics output ${value.name} must be packed Uint8 data.`,
      );
    }
  } else if (
    !(value.data instanceof Float32Array) ||
    value.data.length !== expectedLength
  ) {
    throw new TypeError(
      `Host diagnostics output ${value.name} must be packed Float32 data.`,
    );
  }
  return Object.freeze({ ...value, data: value.data }) as DiagnosticsCapture;
}

function readNonNegativeSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${label} must be a finite non-negative safe integer.`,
    );
  }
  return value;
}
