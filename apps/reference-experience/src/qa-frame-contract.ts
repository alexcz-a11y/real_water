import {
  DIAGNOSTICS_CAPTURE_NAMES,
  DIAGNOSTICS_CAPTURE_SHAPES,
  isDiagnosticsCaptureName,
  type DiagnosticsCaptureName,
} from "real-water/diagnostics";

export const QA_FRAME_FIXED_TICK_HZ = 60 as const;

export const QA_FRAME_CAPTURE_NAMES = DIAGNOSTICS_CAPTURE_NAMES;
export type QaFrameCaptureName = DiagnosticsCaptureName;
export const QA_FRAME_CAPTURE_SHAPES = DIAGNOSTICS_CAPTURE_SHAPES;

export const isQaFrameCaptureName = isDiagnosticsCaptureName;

export function isQaFrameSeed(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
}

export function isQaFrameTickCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export const CORE_WEBGPU_MAX_COLOR_ATTACHMENT_BYTES_PER_SAMPLE = 32;

export type QaScenePassColorAttachmentFormat =
  "rgba16float" | "r32float" | "rg16float" | "rgba8unorm" | "rg8unorm";

// Scene-pass color attachments only. Core final color is the blit, not MRT.
export const QA_SCENE_PASS_COLOR_ATTACHMENT_FORMATS = Object.freeze([
  "rgba16float",
  "r32float",
  "rg16float",
  "rg16float",
  "rgba16float",
  "rg8unorm",
  "rg8unorm",
] as const satisfies readonly QaScenePassColorAttachmentFormat[]);

// WebGPU "Calculating color attachment bytes per sample" uses render-target
// pixel byte cost and component alignment, not texel storage size.
const COLOR_ATTACHMENT_LAYOUT = Object.freeze({
  rgba16float: Object.freeze({ pixelByteCost: 8, componentAlignment: 2 }),
  r32float: Object.freeze({ pixelByteCost: 4, componentAlignment: 4 }),
  rg16float: Object.freeze({ pixelByteCost: 4, componentAlignment: 2 }),
  rgba8unorm: Object.freeze({ pixelByteCost: 8, componentAlignment: 1 }),
  rg8unorm: Object.freeze({ pixelByteCost: 2, componentAlignment: 1 }),
});

export function calculateColorAttachmentBytesPerSample(
  formats: readonly QaScenePassColorAttachmentFormat[],
): number {
  let bytesPerSample = 0;
  for (const format of formats) {
    const layout = COLOR_ATTACHMENT_LAYOUT[format];
    bytesPerSample =
      Math.ceil(bytesPerSample / layout.componentAlignment) *
        layout.componentAlignment +
      layout.pixelByteCost;
  }
  return bytesPerSample;
}
