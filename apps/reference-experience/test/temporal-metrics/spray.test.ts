import { describe, expect, it } from "vitest";
import { analyzePostTraaParticleResidual } from "../../e2e/temporal-metrics/spray.js";

const WIDTH = 16;
const HEIGHT = 8;

function color(): Uint8Array {
  return new Uint8Array(WIDTH * HEIGHT * 4);
}

function mask(): Float32Array {
  return new Float32Array(WIDTH * HEIGHT);
}

function paintColor(
  data: Uint8Array,
  x: number,
  y: number,
  value: number,
): void {
  const index = (y * WIDTH + x) * 4;
  data[index] = value;
  data[index + 1] = value;
  data[index + 2] = value;
  data[index + 3] = 255;
}

function paintMask(data: Float32Array, x: number, y: number): void {
  data[y * WIDTH + x] = 1;
}

describe("analyzePostTraaParticleResidual", () => {
  it("accepts moving and expiring contribution with no out-of-support residue", () => {
    const off = [color(), color(), color()] as const;
    const on = [color(), color(), color()] as const;
    const contribution = [mask(), mask(), mask()] as const;
    paintColor(on[0], 3, 4, 180);
    paintMask(contribution[0], 3, 4);
    paintColor(on[1], 8, 4, 180);
    paintMask(contribution[1], 8, 4);

    const report = analyzePostTraaParticleResidual({
      width: WIDTH,
      height: HEIGHT,
      onFinal: on,
      offFinal: off,
      contribution,
      contributionThreshold: 0.01,
      allowedDilatePixels: 1,
      residualLsb: 1,
    });

    expect(report.maxOutsideResidual).toBe(0);
    expect(report.outsideHotPixels).toBe(0);
    expect(report.expiredResidualMax).toBe(0);
    expect(report.activeFrames).toBe(2);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.lines)).toBe(true);
  });

  it("detects a persistent trail after contribution moves and expires", () => {
    const off = [color(), color(), color()] as const;
    const on = [color(), color(), color()] as const;
    const contribution = [mask(), mask(), mask()] as const;
    paintColor(on[0], 3, 4, 180);
    paintMask(contribution[0], 3, 4);
    paintColor(on[1], 8, 4, 180);
    paintColor(on[1], 3, 4, 70);
    paintMask(contribution[1], 8, 4);
    paintColor(on[2], 8, 4, 50);

    const report = analyzePostTraaParticleResidual({
      width: WIDTH,
      height: HEIGHT,
      onFinal: on,
      offFinal: off,
      contribution,
      contributionThreshold: 0.01,
      allowedDilatePixels: 1,
      residualLsb: 1,
    });

    expect(report.maxOutsideResidual).toBeGreaterThan(1);
    expect(report.outsideHotPixels).toBeGreaterThan(0);
    expect(report.expiredResidualMax).toBeGreaterThan(1);
  });
});
