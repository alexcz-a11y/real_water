export const QA_FRAME_FIXED_TICK_HZ = 60 as const;

export const QA_FRAME_CAPTURE_NAMES = Object.freeze([
  "final-color",
  "depth",
  "normal",
] as const);

export type QaFrameCaptureName = (typeof QA_FRAME_CAPTURE_NAMES)[number];

export const QA_FRAME_CAPTURE_SHAPES = Object.freeze({
  "final-color": Object.freeze({
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
});

export function isQaFrameCaptureName(
  value: unknown,
): value is QaFrameCaptureName {
  return value === "final-color" || value === "depth" || value === "normal";
}

export function isQaFrameSeed(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
}

export function isQaFrameTickCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
