import { describe, expect, it } from "vitest";
import { analyzeFastPan } from "../../e2e/temporal-metrics/fast-pan.js";
import type { WaterBandConfig } from "../../e2e/temporal-metrics/frame-sampling.js";
import {
  SYNTH_CAMERA,
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
  depthWarpM: 1,
  normalDotMin: 0.9,
  outsideLsb: 16,
  stableDiffLsb: 1,
} as const;

function paintFastPanPlanes(input: {
  readonly oobMotion: number;
  readonly waterGlint: number;
  readonly currentGray: number;
  readonly finalGray: number;
}): ReturnType<typeof createBlankPlanes> {
  const planes = createBlankPlanes();
  for (let y = 0; y < SYNTH_VIEWPORT.height; y += 1) {
    for (let x = 0; x < SYNTH_VIEWPORT.width; x += 1) {
      const pixel = pixelAt(x, y);
      planes.glint[pixel] = input.waterGlint;
      if (x >= 10) {
        planes.motion[pixel * 2] = input.oobMotion;
      }
      setRgba(
        planes.current,
        pixel,
        input.currentGray,
        input.currentGray,
        input.currentGray,
      );
      setRgba(
        planes.final,
        pixel,
        input.finalGray,
        input.finalGray,
        input.finalGray,
      );
    }
  }
  return planes;
}

function analyzePainted(input: {
  readonly water: WaterBandConfig;
  readonly waterGlint?: number;
  readonly previousFinalGray?: number;
  readonly currentFinalGray?: number;
}): ReturnType<typeof analyzeFastPan> {
  const previous = paintFastPanPlanes({
    oobMotion: 6,
    waterGlint: input.waterGlint ?? 0,
    currentGray: 200,
    finalGray: input.previousFinalGray ?? 40,
  });
  const current = paintFastPanPlanes({
    oobMotion: 6,
    waterGlint: input.waterGlint ?? 0,
    currentGray: 80,
    finalGray: input.currentFinalGray ?? 40,
  });
  return analyzeFastPan({
    frames: [encodeFrame(previous), encodeFrame(current)],
    cameras: [SYNTH_CAMERA, SYNTH_CAMERA],
    config: {
      ...CONFIG,
      water: input.water,
    },
  });
}

describe("analyzeFastPan", () => {
  it("samples in-band water and OOB motion, and ignores sky-row AOVs", () => {
    const banded = analyzePainted({ water: SYNTH_WATER });
    const pair = banded.pairs[0];
    expect(pair).toBeDefined();
    expect(pair?.stats.inBoundsWaterCount).toBeGreaterThan(0);
    expect(pair?.stats.maskCount).toBeGreaterThan(0);
    expect(pair?.stats.oobCount).toBeGreaterThan(0);
    expect(pair?.stats.maskCount).toBeLessThan(
      pair?.stats.inBoundsWaterCount ?? 0,
    );

    const fullHeight = analyzePainted({
      water: { ...SYNTH_WATER, y0: 0, y1: 1 },
    });
    const fullPair = fullHeight.pairs[0];
    expect(fullPair).toBeDefined();
    expect(
      (fullPair?.stats.maskCount ?? 0) + (fullPair?.stats.oobCount ?? 0),
    ).toBeGreaterThan(
      (pair?.stats.maskCount ?? 0) + (pair?.stats.oobCount ?? 0),
    );
  });

  it("drops the water mask when every in-band pixel exceeds glintMax", () => {
    const water = analyzePainted({ water: SYNTH_WATER, waterGlint: 0 });
    const blocked = analyzePainted({ water: SYNTH_WATER, waterGlint: 1 });
    expect(water.pairs[0]?.stats.inBoundsWaterCount).toBeGreaterThan(0);
    expect(blocked.pairs[0]?.stats.inBoundsWaterCount).toBe(0);
    expect(blocked.pairs[0]?.stats.maskCount).toBe(0);
    expect(blocked.pairs[0]?.stats.oobCount).toBe(0);
  });

  it("raises the warped residual when the previous final color disagrees", () => {
    const matched = analyzePainted({
      water: SYNTH_WATER,
      previousFinalGray: 40,
      currentFinalGray: 40,
    });
    const mismatched = analyzePainted({
      water: SYNTH_WATER,
      previousFinalGray: 40,
      currentFinalGray: 200,
    });
    expect(matched.pairs[0]?.stats.residualP95).toBeLessThan(
      mismatched.pairs[0]?.stats.residualP95 ?? Number.NEGATIVE_INFINITY,
    );
  });

  it("returns a frozen deterministic report", () => {
    const first = analyzePainted({ water: SYNTH_WATER });
    const second = analyzePainted({ water: SYNTH_WATER });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.pairs)).toBe(true);
    expect(Object.isFrozen(first.pairs[0])).toBe(true);
    expect(Object.isFrozen(first.pairs[0]?.stats)).toBe(true);
    expect(Object.isFrozen(first.lines)).toBe(true);
    expect(() => {
      (first as { summary: string }).summary = "mutated";
    }).toThrow(TypeError);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.pairs[0]).not.toBe(first.pairs[0]);
  });
});
