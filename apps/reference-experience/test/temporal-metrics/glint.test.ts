import { describe, expect, it } from "vitest";
import { analyzeCausalGlint } from "../../e2e/temporal-metrics/glint.js";
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
  glintThreshold: 0.08,
  activeMinPixels: 4,
  componentAreaMin: 4,
  componentEnergyMin: 0.5,
  roiDilatePx: 3,
  allowedDilatePx: 1,
  outsideLsb: 16,
  frameCount: 2,
} as const;

function paintGlintPlanes(input: {
  readonly glintValue: number;
  readonly includeSkyBlob: boolean;
  readonly onColor: number;
  readonly firstRoiMotion: number;
}): ReturnType<typeof createBlankPlanes> {
  const planes = createBlankPlanes();
  const seeds = [
    [6, 8],
    [7, 8],
    [6, 9],
    [7, 9],
  ] as const;
  for (const [x, y] of seeds) {
    planes.glint[pixelAt(x, y)] = input.glintValue;
    setRgba(
      planes.current,
      pixelAt(x, y),
      input.onColor,
      input.onColor,
      input.onColor,
    );
    setRgba(planes.final, pixelAt(x, y), input.onColor, 40, 40);
  }
  if (input.includeSkyBlob) {
    for (const [x, y] of [
      [6, 1],
      [7, 1],
      [6, 2],
      [7, 2],
    ] as const) {
      planes.glint[pixelAt(x, y)] = 0.9;
      setRgba(planes.current, pixelAt(x, y), 255, 255, 255);
    }
  }
  const firstRoiPixel = pixelAt(3, 5);
  planes.motion[firstRoiPixel * 2] = input.firstRoiMotion;
  return planes;
}

function analyzePainted(input: {
  readonly water?: WaterBandConfig;
  readonly includeSkyBlob?: boolean;
  readonly firstRoiMotion?: number;
}): ReturnType<typeof analyzeCausalGlint> {
  const off = paintGlintPlanes({
    glintValue: 0,
    includeSkyBlob: false,
    onColor: 10,
    firstRoiMotion: 0,
  });
  const onA = paintGlintPlanes({
    glintValue: 0.2,
    includeSkyBlob: input.includeSkyBlob ?? false,
    onColor: 220,
    firstRoiMotion: input.firstRoiMotion ?? 0,
  });
  const onB = paintGlintPlanes({
    glintValue: 0.2,
    includeSkyBlob: input.includeSkyBlob ?? false,
    onColor: 80,
    firstRoiMotion: input.firstRoiMotion ?? 0,
  });
  return analyzeCausalGlint({
    onFrames: [encodeFrame(onA), encodeFrame(onB)],
    offFrames: [encodeFrame(off), encodeFrame(off)],
    config: {
      ...CONFIG,
      water: input.water ?? SYNTH_WATER,
    },
  });
}

describe("analyzeCausalGlint", () => {
  it("counts only in-band glint components and stays inactive without them", () => {
    const on = analyzePainted({});
    expect(on.glintPixelFrames).toBe(8);
    expect(on.activeFrames).toBe(2);
    expect(on.onGlintMax).toBeGreaterThan(on.offGlintMax);
    expect(on.validComponentFrames).toBeGreaterThan(0);

    const offOnly = analyzeCausalGlint({
      onFrames: [
        encodeFrame(
          paintGlintPlanes({
            glintValue: 0,
            includeSkyBlob: false,
            onColor: 10,
            firstRoiMotion: 0,
          }),
        ),
        encodeFrame(
          paintGlintPlanes({
            glintValue: 0,
            includeSkyBlob: false,
            onColor: 10,
            firstRoiMotion: 0,
          }),
        ),
      ],
      offFrames: [
        encodeFrame(
          paintGlintPlanes({
            glintValue: 0,
            includeSkyBlob: false,
            onColor: 10,
            firstRoiMotion: 0,
          }),
        ),
        encodeFrame(
          paintGlintPlanes({
            glintValue: 0,
            includeSkyBlob: false,
            onColor: 10,
            firstRoiMotion: 0,
          }),
        ),
      ],
      config: CONFIG,
    });
    expect(offOnly.glintPixelFrames).toBe(0);
    expect(offOnly.activeFrames).toBe(0);
    expect(offOnly.validComponentFrames).toBe(0);
  });

  it("does not treat a sky-row glint blob as water or as a sampled component", () => {
    const waterOnly = analyzePainted({ includeSkyBlob: true });
    const includingSky = analyzePainted({
      includeSkyBlob: true,
      water: { ...SYNTH_WATER, y0: 0, y1: 1 },
    });
    expect(waterOnly.glintPixelFrames).toBe(8);
    expect(includingSky.glintPixelFrames).toBeGreaterThan(
      waterOnly.glintPixelFrames,
    );
    expect(includingSky.minWaterCount).toBeGreaterThan(waterOnly.minWaterCount);
  });

  it("keeps later MAD samples when the first dilated ROI history UV is out of bounds", () => {
    const inBounds = analyzePainted({ firstRoiMotion: 0 });
    const firstHistoryOob = analyzePainted({ firstRoiMotion: 8 });
    expect(inBounds.madEligible).toBeGreaterThan(0);
    expect(inBounds.madValid).toBeGreaterThan(0);
    expect(firstHistoryOob.madEligible).toBe(inBounds.madEligible);
    expect(firstHistoryOob.madValid).toBeGreaterThan(0);
    expect(firstHistoryOob.madValid).toBeLessThan(inBounds.madValid);
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
