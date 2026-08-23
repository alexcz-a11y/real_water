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
 * The thirty-four named diagnostic outputs. Names and CPU shapes match the QA
 * capture contract. Planar color and target-alpha occupancy are their own
 * prepared target. `planar-confidence` is reserved for a future screen-space
 * mask and is not a current capture. Current-frame SSR hit (stock raw
 * world-distance, 0 = miss), confidence,
 * linear raw color, water roughness, scene-pass reflection base, SSR
 * composite color, TemporalReproject beauty input RGB, resolved history RGB,
 * and inverse accumulated frame-count weight are included. History DTOs read
 * the prepared beauty and resolved textures and do not invent CPU history.
 *
 * @public
 */
export const DIAGNOSTICS_CAPTURE_NAMES = Object.freeze([
  "final-color",
  "current-color",
  "depth",
  "normal",
  "motion-vector",
  "whitecap-generation",
  "whitecap-history",
  "whitecap-advection",
  "whitecap-decay",
  "foam-source-identity",
  "waterline",
  "history-rejection",
  "optical-fresnel",
  "optical-thickness",
  "optical-scattering",
  "optical-environment-reflection",
  "optical-crest-transmission",
  "optical-transmittance",
  "optical-glint",
  "underwater-transmittance",
  "underwater-scattering",
  "underwater-light-shafts",
  "underwater-shadow",
  "planar-color",
  "planar-target-alpha",
  "ssr-hit",
  "ssr-confidence",
  "ssr-color",
  "ssr-roughness",
  "reflection-base-color",
  "ssr-composite-color",
  "ssr-history-color",
  "ssr-history-frame-weight",
  "ssr-history-input-color",
] as const);

/**
 * One of the thirty-four named diagnostic CPU outputs.
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
  "whitecap-generation": Object.freeze({
    format: "r32float-whitecap-stage" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "whitecap-history": Object.freeze({
    format: "r32float-whitecap-stage" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "whitecap-advection": Object.freeze({
    format: "r32float-whitecap-stage" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "whitecap-decay": Object.freeze({
    format: "r32float-whitecap-stage" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "foam-source-identity": Object.freeze({
    format: "rgba32float-foam-source-identity" as const,
    elementType: "float32" as const,
    components: 4 as const,
  }),
  "waterline": Object.freeze({
    format: "r32float-waterline-coverage" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "history-rejection": Object.freeze({
    format: "r32float-history-rejection" as const,
    elementType: "float32" as const,
    components: 1 as const,
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
  "underwater-transmittance": Object.freeze({
    format: "r32float-underwater-volume" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "underwater-scattering": Object.freeze({
    format: "r32float-underwater-volume" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "underwater-light-shafts": Object.freeze({
    format: "r32float-underwater-volume" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "underwater-shadow": Object.freeze({
    format: "r32float-underwater-volume" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "planar-color": Object.freeze({
    format: "rgba8unorm-srgb" as const,
    elementType: "uint8" as const,
    components: 4 as const,
  }),
  "planar-target-alpha": Object.freeze({
    format: "r32float-optical" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "ssr-hit": Object.freeze({
    format: "r32float-optical" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "ssr-confidence": Object.freeze({
    format: "r32float-optical" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "ssr-color": Object.freeze({
    format: "rgb32float-linear-ssr" as const,
    elementType: "float32" as const,
    components: 3 as const,
  }),
  "ssr-roughness": Object.freeze({
    format: "r32float-ssr-roughness" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "reflection-base-color": Object.freeze({
    format: "rgb32float-linear-reflection-base" as const,
    elementType: "float32" as const,
    components: 3 as const,
  }),
  "ssr-composite-color": Object.freeze({
    format: "rgb32float-linear-ssr-composite" as const,
    elementType: "float32" as const,
    components: 3 as const,
  }),
  "ssr-history-color": Object.freeze({
    format: "rgb32float-linear-ssr-history" as const,
    elementType: "float32" as const,
    components: 3 as const,
  }),
  "ssr-history-frame-weight": Object.freeze({
    format: "r32float-ssr-history-frame-weight" as const,
    elementType: "float32" as const,
    components: 1 as const,
  }),
  "ssr-history-input-color": Object.freeze({
    format: "rgb32float-linear-ssr-history-input" as const,
    elementType: "float32" as const,
    components: 3 as const,
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
  "waterline",
  "outputs",
  "compileCount",
  "probeCount",
  "diagnosticReadbackCount",
  "sceneRenderCount",
  "width",
  "height",
] as const;
const DIAGNOSTICS_WATERLINE_KEYS = [
  "classification",
  "seaLevelMetres",
  "surfaceHeightMetres",
  "signedDistanceMetres",
  "submersion",
  "transitionRevision",
  "lensWetnessImpulse",
] as const;
const DIAGNOSTICS_WATERLINE_CLASSIFICATIONS = [
  "above",
  "crossing",
  "below",
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
 * Planar reflection color readback from the auxiliary target.
 *
 * @public
 */
export interface DiagnosticsPlanarColorCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "planar-color";
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
 * One scalar stage of the deterministic spectral-whitecap reconstruction.
 *
 * @public
 */
export interface DiagnosticsWhitecapStageCapture extends DiagnosticsCaptureBase {
  /** Whitecap stage capture name. */
  readonly name:
    | "whitecap-generation"
    | "whitecap-history"
    | "whitecap-advection"
    | "whitecap-decay";
  /** Packed scalar whitecap density format. */
  readonly format: "r32float-whitecap-stage";
  /** Tightly packed scalar density samples. */
  readonly data: Float32Array;
}

/**
 * Canonical anchor-local contribution map and saturating union of the unified
 * foam field. Unlike screen-space stage captures, this map covers the prepared
 * 96-metre Interaction Field directly and is independent of camera jitter.
 *
 * @public
 */
export interface DiagnosticsFoamSourceIdentityCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "foam-source-identity";
  /** Packed RGBA source-identity format. */
  readonly format: "rgba32float-foam-source-identity";
  /**
   * Tightly packed anchor-local samples: R = spectral whitecap, G = vessel wake
   * or propeller wash, B = local impact, A = saturating union.
   */
  readonly data: Float32Array;
}

/**
 * Waterline coverage read from the prepared water-only attachment channel.
 *
 * @public
 */
export interface DiagnosticsWaterlineCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "waterline";
  /** Packed waterline coverage format. */
  readonly format: "r32float-waterline-coverage";
  /** Tightly packed waterline coverage samples. */
  readonly data: Float32Array;
}

/**
 * Full-frame shared-domain TRAA and SSR reset rejection for the presented
 * frame. Stock per-pixel depth and disocclusion heuristics remain internal.
 *
 * @public
 */
export interface DiagnosticsHistoryRejectionCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "history-rejection";
  /** Packed temporal rejection format. */
  readonly format: "r32float-history-rejection";
  /** Tightly packed temporal rejection samples. */
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
    | "optical-glint"
    | "planar-target-alpha"
    | "ssr-hit"
    | "ssr-confidence";
  /** Packed optical scalar format. */
  readonly format: "r32float-optical";
  /** Tightly packed scalar samples. */
  readonly data: Float32Array;
}

/**
 * One scalar channel unpacked from the prepared underwater diagnostics target.
 *
 * @public
 */
export interface DiagnosticsUnderwaterVolumeCapture extends DiagnosticsCaptureBase {
  /** Underwater volume capture name. */
  readonly name:
    | "underwater-transmittance"
    | "underwater-scattering"
    | "underwater-light-shafts"
    | "underwater-shadow";
  /** Packed scalar underwater volume format. */
  readonly format: "r32float-underwater-volume";
  /** Tightly packed scalar samples. */
  readonly data: Float32Array;
}

/**
 * Water-origin roughness read from the view-normal attachment alpha.
 *
 * @public
 */
export interface DiagnosticsSsrRoughnessCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "ssr-roughness";
  /** Packed roughness format. */
  readonly format: "r32float-ssr-roughness";
  /** Tightly packed roughness samples. */
  readonly data: Float32Array;
}

/**
 * Current-frame raw SSR color readback. Linear RGB from the stock raw
 * target. Black RGB with a raw hit is still a hit; do not treat RGB 0 as a
 * miss.
 *
 * @public
 */
export interface DiagnosticsSsrColorCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "ssr-color";
  /** Packed linear RGB format. */
  readonly format: "rgb32float-linear-ssr";
  /** Tightly packed linear RGB samples. */
  readonly data: Float32Array;
}

/**
 * Same-frame scene-pass beauty RGB. Linear half-float scene output packed
 * as Float32 RGB. This is the SSR compose base, not Host viewport scene
 * color and not TRAA current-color.
 *
 * @public
 */
export interface DiagnosticsReflectionBaseColorCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "reflection-base-color";
  /** Packed linear RGB format. */
  readonly format: "rgb32float-linear-reflection-base";
  /** Tightly packed linear RGB samples. */
  readonly data: Float32Array;
}

/**
 * Same-frame SSR composite RGB. Linear half-float compose-target color
 * packed as Float32 RGB. Confidence 0 must match reflection-base RGB.
 *
 * @public
 */
export interface DiagnosticsSsrCompositeColorCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "ssr-composite-color";
  /** Packed linear RGB format. */
  readonly format: "rgb32float-linear-ssr-composite";
  /** Tightly packed linear RGB samples. */
  readonly data: Float32Array;
}

/**
 * TemporalReproject resolved history RGB. Linear Float32 from the public
 * resolved texture (`getTextureNode().value`), not a CPU reconstruction.
 *
 * @public
 */
export interface DiagnosticsSsrHistoryColorCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "ssr-history-color";
  /** Packed linear RGB format. */
  readonly format: "rgb32float-linear-ssr-history";
  /** Tightly packed linear RGB samples. */
  readonly data: Float32Array;
}

/**
 * TemporalReproject resolved alpha: r185 inverse accumulated frame count.
 *
 * @public
 */
export interface DiagnosticsSsrHistoryFrameWeightCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "ssr-history-frame-weight";
  /** Packed inverse-frame-count format. */
  readonly format: "r32float-ssr-history-frame-weight";
  /** Tightly packed scalar samples. */
  readonly data: Float32Array;
}

/**
 * TemporalReproject beauty input RGB. Linear Float32 from the prepared
 * full-resolution beauty target, not a CPU reconstruction.
 *
 * @public
 */
export interface DiagnosticsSsrHistoryInputColorCapture extends DiagnosticsCaptureBase {
  /** Capture name. */
  readonly name: "ssr-history-input-color";
  /** Packed linear RGB format. */
  readonly format: "rgb32float-linear-ssr-history-input";
  /** Tightly packed linear RGB samples. */
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
  | DiagnosticsPlanarColorCapture
  | DiagnosticsSsrColorCapture
  | DiagnosticsSsrRoughnessCapture
  | DiagnosticsReflectionBaseColorCapture
  | DiagnosticsSsrCompositeColorCapture
  | DiagnosticsSsrHistoryColorCapture
  | DiagnosticsSsrHistoryFrameWeightCapture
  | DiagnosticsSsrHistoryInputColorCapture
  | DiagnosticsDepthCapture
  | DiagnosticsNormalCapture
  | DiagnosticsMotionVectorCapture
  | DiagnosticsWhitecapStageCapture
  | DiagnosticsFoamSourceIdentityCapture
  | DiagnosticsWaterlineCapture
  | DiagnosticsHistoryRejectionCapture
  | DiagnosticsOpticalScalarCapture
  | DiagnosticsUnderwaterVolumeCapture;

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
 * Stable camera-medium classification and deterministic transition handoff for
 * one presented Open Water frame.
 *
 * @public
 */
export interface DiagnosticsWaterlineState {
  /** Stable camera-medium classification. */
  readonly classification: "above" | "crossing" | "below";
  /** Authoritative Host mean sea level for the single Open Water Domain. */
  readonly seaLevelMetres: number;
  /** Seed-matched Open Water surface height at the camera XZ position. */
  readonly surfaceHeightMetres: number;
  /** Camera world Y minus the seed-matched surface height. */
  readonly signedDistanceMetres: number;
  /** Continuous optical blend: 0 above, 1 below. */
  readonly submersion: number;
  /** Monotonic revision incremented once per successful classification change. */
  readonly transitionRevision: number;
  /** One-frame handoff for the future lens-wetness composition route. */
  readonly lensWetnessImpulse: boolean;
}

/**
 * One diagnostics present: the root receipt plus named CPU outputs and
 * truthful readiness counters.
 *
 * @public
 */
export interface HostDiagnosticsPresentedFrame extends HostPresentedFrame {
  /** Stable waterline state associated with this presented frame. */
  readonly waterline: DiagnosticsWaterlineState;
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
 * Confirms `value` is one of the thirty-four diagnostic capture names.
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
  const waterline = readDiagnosticsWaterlineState(frame.waterline);
  return Object.freeze({
    ...receipt,
    waterline,
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

function readDiagnosticsWaterlineState(
  value: DiagnosticsWaterlineState,
): DiagnosticsWaterlineState {
  if (!isRecord(value) || !hasExactKeys(value, DIAGNOSTICS_WATERLINE_KEYS)) {
    throw new TypeError(
      "Host diagnostics waterline state must use the exact receipt contract.",
    );
  }
  if (
    typeof value.classification !== "string" ||
    !(DIAGNOSTICS_WATERLINE_CLASSIFICATIONS as readonly string[]).includes(
      value.classification,
    )
  ) {
    throw new TypeError(
      "Host diagnostics waterline classification must be above, crossing, or below.",
    );
  }
  if (
    !Number.isFinite(value.seaLevelMetres) ||
    !Number.isFinite(value.surfaceHeightMetres) ||
    !Number.isFinite(value.signedDistanceMetres)
  ) {
    throw new RangeError(
      "Host diagnostics waterline heights must be finite metres.",
    );
  }
  if (
    !Number.isFinite(value.submersion) ||
    value.submersion < 0 ||
    value.submersion > 1
  ) {
    throw new RangeError(
      "Host diagnostics waterline submersion must be inside [0, 1].",
    );
  }
  if (typeof value.lensWetnessImpulse !== "boolean") {
    throw new TypeError(
      "Host diagnostics lens wetness impulse must be boolean.",
    );
  }
  return Object.freeze({
    classification: value.classification,
    seaLevelMetres: value.seaLevelMetres,
    surfaceHeightMetres: value.surfaceHeightMetres,
    signedDistanceMetres: value.signedDistanceMetres,
    submersion: value.submersion,
    transitionRevision: readNonNegativeSafeInteger(
      value.transitionRevision,
      "Host diagnostics waterline transitionRevision",
    ),
    lensWetnessImpulse: value.lensWetnessImpulse,
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
