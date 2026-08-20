import { describe, expect, it } from "vitest";
import { analyzeThinDetail } from "../../e2e/temporal-metrics/thin-detail.js";
import type { WaterBandConfig } from "../../e2e/temporal-metrics/frame-sampling.js";
import {
  SYNTH_VIEWPORT,
  SYNTH_WATER,
  createBlankPlanes,
  encodeFrame,
  pixelAt,
  setRgba,
} from "./synthetic-buffers.js";

const CONFIG = {
  viewport: SYNTH_VIEWPORT,
  water: SYNTH_WATER,
  glintMax: 0.05,
  gradientMin: 12,
  depthRangeMax: 2,
  ridgeMax: 2,
  perFrameMin: 4,
  componentAreaMin: 4,
  frameCount: 2,
} as const;

function paintRidge(input: {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly gray: number;
  readonly backgroundGray: number;
  readonly currentMatchesFinal: boolean;
  readonly waterGlint: number;
  readonly ramp: boolean;
}): ReturnType<typeof createBlankPlanes> {
  const planes = createBlankPlanes();
  for (let y = 0; y < SYNTH_VIEWPORT.height; y += 1) {
    for (let x = 0; x < SYNTH_VIEWPORT.width; x += 1) {
      const pixel = pixelAt(x, y);
      planes.glint[pixel] = input.waterGlint;
      const onBand =
        x >= input.x0 && x <= input.x1 && y >= input.y0 && y <= input.y1;
      const gray = onBand
        ? input.ramp
          ? Math.min(255, 30 + (x - input.x0) * 28)
          : input.gray
        : input.backgroundGray;
      setRgba(planes.current, pixel, gray, gray, gray);
      setRgba(
        planes.final,
        pixel,
        input.currentMatchesFinal ? gray : Math.max(0, gray - 40),
        input.currentMatchesFinal ? gray : Math.max(0, gray - 40),
        input.currentMatchesFinal ? gray : Math.max(0, gray - 40),
      );
    }
  }
  return planes;
}

function analyzePainted(input: {
  readonly water?: WaterBandConfig;
  readonly x0?: number;
  readonly x1?: number;
  readonly y0?: number;
  readonly y1?: number;
  readonly currentMatchesFinal?: boolean;
  readonly waterGlint?: number;
  readonly secondGray?: number;
  readonly backgroundGray?: number;
  readonly secondBackgroundGray?: number;
  readonly ramp?: boolean;
  readonly perFrameMin?: number;
}): ReturnType<typeof analyzeThinDetail> {
  const first = paintRidge({
    x0: input.x0 ?? 6,
    x1: input.x1 ?? 7,
    y0: input.y0 ?? 7,
    y1: input.y1 ?? 12,
    gray: 255,
    backgroundGray: input.backgroundGray ?? 0,
    currentMatchesFinal: input.currentMatchesFinal ?? false,
    waterGlint: input.waterGlint ?? 0,
    ramp: input.ramp ?? false,
  });
  const second = paintRidge({
    x0: input.x0 ?? 6,
    x1: input.x1 ?? 7,
    y0: input.y0 ?? 7,
    y1: input.y1 ?? 12,
    gray: input.secondGray ?? 180,
    backgroundGray: input.secondBackgroundGray ?? input.backgroundGray ?? 0,
    currentMatchesFinal: input.currentMatchesFinal ?? false,
    waterGlint: input.waterGlint ?? 0,
    ramp: input.ramp ?? false,
  });
  return analyzeThinDetail({
    frames: [encodeFrame(first), encodeFrame(second)],
    config: {
      ...CONFIG,
      water: input.water ?? SYNTH_WATER,
      perFrameMin: input.perFrameMin ?? CONFIG.perFrameMin,
    },
  });
}

describe("analyzeThinDetail", () => {
  it("keeps a two-pixel water ridge and rejects a thick in-band slab", () => {
    const ridge = analyzePainted({});
    const slab = analyzePainted({ x0: 3, x1: 10, ramp: true });
    expect(ridge.minFrameThin).toBeGreaterThan(0);
    expect(ridge.activeFrames).toBe(2);
    expect(ridge.unionCount).toBeGreaterThan(0);
    expect(ridge.ratioSamples).toBeGreaterThan(0);
    expect(slab.minFrameThin).toBe(0);
    expect(slab.activeFrames).toBe(0);
    expect(slab.ratioSamples).toBe(0);
  });

  it("ignores a sky-row ridge unless the water band includes that row", () => {
    const skyRidge = analyzePainted({ y0: 1, y1: 2, perFrameMin: 1 });
    const skyAsWater = analyzePainted({
      y0: 1,
      y1: 2,
      perFrameMin: 1,
      water: { ...SYNTH_WATER, y0: 0, y1: 1 },
    });
    expect(skyRidge.minFrameThin).toBe(0);
    expect(skyRidge.activeFrames).toBe(0);
    expect(skyAsWater.minFrameThin).toBeGreaterThan(0);
    expect(skyAsWater.activeFrames).toBe(2);
  });

  it("samples overlapping water MADs and flags current/final buffer identity", () => {
    const changing = analyzePainted({
      backgroundGray: 90,
      secondBackgroundGray: 20,
      secondGray: 40,
    });
    const still = analyzePainted({
      backgroundGray: 90,
      secondBackgroundGray: 90,
      secondGray: 255,
    });
    const matchingBuffers = analyzePainted({
      currentMatchesFinal: true,
      secondGray: 40,
    });
    expect(changing.madSamples).toBeGreaterThan(0);
    expect(changing.currentMadP75).toBeGreaterThan(still.currentMadP75);
    expect(changing.differingFrames).toBe(2);
    expect(matchingBuffers.differingFrames).toBe(0);
  });

  it("returns a frozen deterministic report", () => {
    const first = analyzePainted({});
    const second = analyzePainted({});
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.lines)).toBe(true);
    expect(() => {
      (first as { summary: string }).summary = "mutated";
    }).toThrow(TypeError);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(first.summary).toContain("active=2/2");
  });
});
