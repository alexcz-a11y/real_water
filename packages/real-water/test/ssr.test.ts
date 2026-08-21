import { describe, expect, it } from "vitest";
import {
  CURRENT_FRAME_SSR_HISTORY_POLICY,
  CURRENT_FRAME_SSR_POLICY,
  createMinimalWaterQualityProfile,
} from "../src/quality-profile.js";
import {
  CURRENT_FRAME_SSR_BLACK_HIT_EPSILON,
  CURRENT_FRAME_SSR_WATER_MASK_EPSILON,
  composeCurrentFrameSsrRgb,
  evaluateCurrentFrameSsrConfidence,
  selectSsrHistoryCandidateRgb,
  unpackPackedViewNormalRgb,
} from "../src/ssr.js";

describe("current-frame SSR policy", () => {
  it("pins the Quality Profile current-frame structural constants", () => {
    expect(CURRENT_FRAME_SSR_POLICY).toEqual({
      mode: "current-frame",
      history: CURRENT_FRAME_SSR_HISTORY_POLICY,
      stochastic: false,
      reflectNonMetals: false,
      binaryRefine: true,
      quality: 0.5,
      maxDistance: 48,
      thickness: 0.35,
      resolutionPolicy: "drawing-buffer-exact",
      resolutionScale: 1,
      samples: 0,
      rawFormat: "rgba16float",
      compositeFormat: "rgba16float",
      blurFormat: "rgba16float",
      blurResolutionPolicy: "drawing-buffer-exact",
      mipCount: 5,
      blurQuality: 2,
      blurRoute: "enabled",
      screenEdgeFade: 0.08,
      roughnessCutoff: 0.5,
      updateCadence: "host-present",
    });
    expect(createMinimalWaterQualityProfile().reflection.ssr).toEqual(
      CURRENT_FRAME_SSR_POLICY,
    );
    expect(CURRENT_FRAME_SSR_POLICY.history).toEqual(
      CURRENT_FRAME_SSR_HISTORY_POLICY,
    );
    expect(CURRENT_FRAME_SSR_POLICY.updateCadence).toBe("host-present");
    expect(CURRENT_FRAME_SSR_POLICY.blurRoute).toBe("enabled");
  });

  it("treats a miss, far hit, offscreen sample, and roughness cutoff as confidence 0", () => {
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 0,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 48.01,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: -0.01,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: 1.01,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.5,
        fresnel: 0.4,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: 0.5,
        screenV: 0.5,
        roughness: Number.NaN,
        fresnel: 0.4,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: Number.NaN,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: 0.5,
        screenV: Number.POSITIVE_INFINITY,
        roughness: 0.2,
        fresnel: 0.4,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: Number.NaN,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: Number.POSITIVE_INFINITY,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: 0.5,
        screenV: 0.5,
        roughness: Number.POSITIVE_INFINITY,
        fresnel: 0.4,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
        hitFresnel: Number.NaN,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
        hitFresnel: Number.POSITIVE_INFINITY,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
        hitDepth: Number.NaN,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
        hitDepth: Number.POSITIVE_INFINITY,
      }),
    ).toBe(0);
  });

  it("rejects a non-water mask even when the raw stock alpha is a hit", () => {
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 8,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: CURRENT_FRAME_SSR_WATER_MASK_EPSILON,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 8,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 8,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
        hitFresnel: 0.2,
      }),
    ).toBe(0);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 8,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
        hitDepth: 1,
      }),
    ).toBe(0);
  });

  it("keeps a black raw RGB sample with worldDistance > 0 as a hit", () => {
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
      }),
    ).toBe(0.75);
  });

  it("applies the independent edge and distance literals to hit UV", () => {
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: 0.02,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
      }),
    ).toBe(0.1875);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 12,
        screenU: -0.001,
        screenV: 0.5,
        roughness: 0.2,
        fresnel: 0.4,
      }),
    ).toBe(0);
  });

  it("bounds confidence to [0, 1]", () => {
    const center = evaluateCurrentFrameSsrConfidence({
      worldDistance: 1,
      screenU: 0.5,
      screenV: 0.5,
      roughness: 0.08,
      fresnel: 1,
    });
    expect(center).toBeGreaterThan(0);
    expect(center).toBeLessThanOrEqual(1);
    expect(
      evaluateCurrentFrameSsrConfidence({
        worldDistance: 0,
        screenU: 0.5,
        screenV: 0.5,
        roughness: 0,
        fresnel: 1,
      }),
    ).toBe(0);
  });

  it("returns the base channels unchanged when confidence is 0", () => {
    const base = [0.31, 0.44, 0.52] as const;
    expect(
      composeCurrentFrameSsrRgb({
        baseRgb: base,
        ssrRgb: [0, 0, 0],
        confidence: 0,
        fresnel: 0.9,
      }),
    ).toEqual([0.31, 0.44, 0.52]);
    expect(
      composeCurrentFrameSsrRgb({
        baseRgb: base,
        ssrRgb: [1, 0, 0.5],
        confidence: 0,
        fresnel: 1,
      })[0],
    ).toBe(0.31);
  });

  it("uses the minimum-error fresnel-weighted overlay, not a full BRDF", () => {
    const rgb = composeCurrentFrameSsrRgb({
      baseRgb: [0.2, 0.2, 0.2],
      ssrRgb: [1, 0, 0],
      confidence: 0.5,
      fresnel: 0.5,
    });
    expect(rgb[0]).toBeCloseTo(0.4, 10);
    expect(rgb[1]).toBeCloseTo(0.15, 10);
    expect(rgb[2]).toBeCloseTo(0.15, 10);
  });

  it("selects base RGB when fresnel or stock SSR RGB is non-finite", () => {
    const base = [0.31, 0.44, 0.52] as const;
    expect(
      composeCurrentFrameSsrRgb({
        baseRgb: base,
        ssrRgb: [1, 0, 0.5],
        confidence: 0.8,
        fresnel: Number.NaN,
      }),
    ).toEqual([0.31, 0.44, 0.52]);
    expect(
      composeCurrentFrameSsrRgb({
        baseRgb: base,
        ssrRgb: [Number.NaN, 0, 0],
        confidence: 0.8,
        fresnel: 0.9,
      }),
    ).toEqual([0.31, 0.44, 0.52]);
    expect(
      composeCurrentFrameSsrRgb({
        baseRgb: base,
        ssrRgb: [0, Number.POSITIVE_INFINITY, 0],
        confidence: 0,
        fresnel: 0.9,
      }),
    ).toEqual([0.31, 0.44, 0.52]);
  });

  it("unpacks packed RGB as multiply-2 subtract-1", () => {
    expect(unpackPackedViewNormalRgb([1, 0.5, 0])).toEqual([1, 0, -1]);
    expect(unpackPackedViewNormalRgb([0.5, 0.5, 1])).toEqual([0, 0, 1]);
  });

  it("keeps a valid black current hit instead of bright history", () => {
    expect(
      selectSsrHistoryCandidateRgb({
        currentRgb: [0, 0, 0],
        historyRgb: [0.8, 0.2, 0.1],
        rawWorldDistance: 12,
      }),
    ).toEqual([0, 0, 0]);
    expect(
      composeCurrentFrameSsrRgb({
        baseRgb: [0.31, 0.44, 0.52],
        ssrRgb: [0, 0, 0],
        historyRgb: [0.8, 0.2, 0.1],
        rawWorldDistance: 12,
        confidence: 0.8,
        fresnel: 1,
      }),
    ).toEqual([
      expect.closeTo(0.062, 10),
      expect.closeTo(0.088, 10),
      expect.closeTo(0.104, 10),
    ]);
  });

  it("uses finite history RGB for a valid non-black hit", () => {
    expect(
      selectSsrHistoryCandidateRgb({
        currentRgb: [0.2, 0.1, 0.05],
        historyRgb: [0.4, 0.3, 0.2],
        rawWorldDistance: 8,
      }),
    ).toEqual([0.4, 0.3, 0.2]);
  });

  it("fails closed from non-finite history to current, then base when invalid", () => {
    expect(
      selectSsrHistoryCandidateRgb({
        currentRgb: [0.2, 0.1, 0.05],
        historyRgb: [Number.NaN, 0.3, 0.2],
        rawWorldDistance: 8,
      }),
    ).toEqual([0.2, 0.1, 0.05]);
    expect(
      composeCurrentFrameSsrRgb({
        baseRgb: [0.31, 0.44, 0.52],
        ssrRgb: [0.2, 0.1, 0.05],
        historyRgb: [Number.NaN, 0.3, 0.2],
        rawWorldDistance: 8,
        confidence: 0,
        fresnel: 1,
      }),
    ).toEqual([0.31, 0.44, 0.52]);
    expect(CURRENT_FRAME_SSR_BLACK_HIT_EPSILON).toBe(1e-6);
  });
});
