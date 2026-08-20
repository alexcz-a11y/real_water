import { Buffer } from "node:buffer";
import type {
  EncodedFrameBuffers,
  WaterBandConfig,
} from "../../e2e/temporal-metrics/frame-sampling.js";

export const SYNTH_WIDTH = 16;
export const SYNTH_HEIGHT = 16;
export const SYNTH_VIEWPORT = {
  width: SYNTH_WIDTH,
  height: SYNTH_HEIGHT,
} as const;

export const SYNTH_WATER: WaterBandConfig = {
  y0: 0.35,
  y1: 0.9,
  depthMin: 5,
  depthMax: 100,
  fresnelMin: 0.001,
  normalMin: 0.9,
  normalMax: 1.1,
};

export const SYNTH_CAMERA = {
  position: [0, 8, 0] as const,
  target: [400, 0, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 50,
  near: 0.5,
  far: 4_000,
};

export function encodeFloat32(values: readonly number[]): string {
  const bytes = Buffer.alloc(values.length * 4);
  for (let index = 0; index < values.length; index += 1) {
    bytes.writeFloatLE(values[index] ?? 0, index * 4);
  }
  return bytes.toString("base64");
}

export function encodeRgba(rgba: Uint8Array): string {
  return Buffer.from(rgba).toString("base64");
}

export function encodeFrame(planes: {
  readonly current: Uint8Array;
  readonly final: Uint8Array;
  readonly motion: readonly number[];
  readonly depth: readonly number[];
  readonly normal: readonly number[];
  readonly fresnel: readonly number[];
  readonly glint: readonly number[];
}): EncodedFrameBuffers {
  return {
    current: encodeRgba(planes.current),
    final: encodeRgba(planes.final),
    motion: encodeFloat32(planes.motion),
    depth: encodeFloat32(planes.depth),
    normal: encodeFloat32(planes.normal),
    fresnel: encodeFloat32(planes.fresnel),
    glint: encodeFloat32(planes.glint),
  };
}

export function createBlankPlanes(): {
  current: Uint8Array;
  final: Uint8Array;
  motion: number[];
  depth: number[];
  normal: number[];
  fresnel: number[];
  glint: number[];
} {
  const pixels = SYNTH_WIDTH * SYNTH_HEIGHT;
  return {
    current: new Uint8Array(pixels * 4),
    final: new Uint8Array(pixels * 4),
    motion: Array.from({ length: pixels * 2 }, () => 0),
    depth: Array.from({ length: pixels }, () => 20),
    normal: Array.from({ length: pixels * 3 }, (_, index) =>
      index % 3 === 2 ? 1 : 0,
    ),
    fresnel: Array.from({ length: pixels }, () => 0.1),
    glint: Array.from({ length: pixels }, () => 0),
  };
}

export function setRgba(
  target: Uint8Array,
  pixel: number,
  red: number,
  green: number,
  blue: number,
): void {
  const offset = pixel * 4;
  target[offset] = red;
  target[offset + 1] = green;
  target[offset + 2] = blue;
  target[offset + 3] = 255;
}

export function pixelAt(x: number, y: number): number {
  return y * SYNTH_WIDTH + x;
}
