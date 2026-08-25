import { expect, test } from "@playwright/test";
import {
  createMinimalWaterPrewarmManifest,
  createMinimalWaterQualityProfile,
  type HostEnvironmentSnapshot,
} from "real-water";
import type { QaCameraV1, QaHarnessV17 } from "../src/qa-harness.js";
import { REFERENCE_ENVIRONMENT_LIGHTING } from "../src/reference-optical-inputs.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32, decodeUint8 } from "./qa-capture-bytes.js";

const INITIAL = { width: 320, height: 180 } as const;
const NEXT = { width: 384, height: 216 } as const;
const RAPID_FIRST = { width: 400, height: 200 } as const;
const CAMERA = {
  projection: "perspective" as const,
  position: [0, 10, 18] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 50,
  near: 0.1,
  far: 100,
} satisfies QaCameraV1;
const SEED = 0x4000_0000;
// Quality Profile v15 routes final-color through particles, storm atmosphere,
// and lens wetness after TRAA. Keep those stages at identity on both sides of
// the viewport reprepare so the reset-frame comparison measures TRAA alone.
const TRAA_ISOLATION_ANCHOR = { x: 50_000, z: 50_000 } as const;
const TRAA_ISOLATION_ENVIRONMENT = Object.freeze({
  lighting: REFERENCE_ENVIRONMENT_LIGHTING,
  weather: Object.freeze({
    windDirectionX: 1,
    windDirectionZ: 0,
    windStrength: 0,
    gustStrength: 0,
    rainIntensity: 0,
  }),
  atmosphere: Object.freeze({
    cloudCoverage: 0,
    cloudShadowStrength: 0,
    horizonHaze: 0,
    stormAerosolIntensity: 0,
    lightningIntensity: 0,
  }),
}) satisfies HostEnvironmentSnapshot;

function expectedSsrCapabilities(width: number, height: number) {
  return {
    width,
    height,
    rawFormat: "rgba16float" as const,
    compositeFormat: "rgba16float" as const,
    samples: 0 as const,
    mode: "current-frame" as const,
    history: Object.freeze({
      width,
      height,
      historyFormat: "rgba16float" as const,
      resolveFormat: "rgba16float" as const,
      inputFormat: "rgba16float" as const,
      captureFormat: "rgba16float" as const,
      resetVelocityFormat: "rg16float" as const,
      maxFrames: 32 as const,
      mode: "temporal-reproject-specular" as const,
      accumulate: true as const,
      hitPointReprojection: true as const,
      normalFormat: "packed-rgba16float" as const,
      resetDomains: Object.freeze([
        "simulation-reset",
        "camera-cut",
        "origin-shift",
        "sea-state-cut",
        "waterline-crossing",
      ] as const),
      updateCadence: "host-present" as const,
    }),
    updateCadence: "host-present" as const,
    missFallbackPriority: ["planar", "host-adapter"] as const,
    blur: {
      width,
      height,
      format: "rgba16float" as const,
      mipCount: 5 as const,
      blurQuality: 2 as const,
      enabled: true as const,
    },
  };
}
const NEXT_MANIFEST_HASH = createMinimalWaterPrewarmManifest(
  createMinimalWaterQualityProfile(),
  NEXT,
).manifestHash;
const RAPID_FIRST_MANIFEST_HASH = createMinimalWaterPrewarmManifest(
  createMinimalWaterQualityProfile(),
  RAPID_FIRST,
).manifestHash;

test("reprepares a new drawing-buffer manifest through conceal, dispose, and reveal", async ({
  page,
}) => {
  await page.setViewportSize(INITIAL);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const before = await page.evaluate(
    async ({ anchor, camera, environment, seed }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed });
      await harness.updateEnvironment(environment);
      await harness.updateInteractionAnchor(anchor);
      await harness.setCamera(camera, { transition: "continuous" });
      const presented = await harness.present();
      const planarColor = await harness.capture("planar-color");
      const occupancy = await harness.capture("planar-target-alpha");
      const ssrHit = await harness.capture("ssr-hit");
      const ssrConfidence = await harness.capture("ssr-confidence");
      const ssrColor = await harness.capture("ssr-color");
      const ssrRoughness = await harness.capture("ssr-roughness");
      const ssrHistoryColor = await harness.capture("ssr-history-color");
      const ssrHistoryWeight = await harness.capture(
        "ssr-history-frame-weight",
      );
      const ssrHistoryInput = await harness.capture("ssr-history-input-color");
      const underwater = await harness.capture("underwater-transmittance");
      return {
        presented,
        snapshot: harness.snapshot(),
        prewarm: presented.prewarm,
        capabilities: presented.prewarm.capabilities,
        planarColorWidth: planarColor.width,
        planarColorHeight: planarColor.height,
        planarColor: planarColor.data,
        occupancyWidth: occupancy.width,
        occupancyHeight: occupancy.height,
        occupancy: occupancy.data,
        ssrHitWidth: ssrHit.width,
        ssrHitHeight: ssrHit.height,
        ssrHit: ssrHit.data,
        ssrConfidenceWidth: ssrConfidence.width,
        ssrConfidenceHeight: ssrConfidence.height,
        ssrConfidence: ssrConfidence.data,
        ssrColorWidth: ssrColor.width,
        ssrColorHeight: ssrColor.height,
        ssrColor: ssrColor.data,
        ssrRoughnessWidth: ssrRoughness.width,
        ssrRoughnessHeight: ssrRoughness.height,
        ssrRoughness: ssrRoughness.data,
        ssrHistoryColorWidth: ssrHistoryColor.width,
        ssrHistoryColorHeight: ssrHistoryColor.height,
        ssrHistoryColor: ssrHistoryColor.data,
        ssrHistoryWeightWidth: ssrHistoryWeight.width,
        ssrHistoryWeightHeight: ssrHistoryWeight.height,
        ssrHistoryWeight: ssrHistoryWeight.data,
        ssrHistoryInputWidth: ssrHistoryInput.width,
        ssrHistoryInputHeight: ssrHistoryInput.height,
        ssrHistoryInput: ssrHistoryInput.data,
        underwaterWidth: underwater.width,
        underwaterHeight: underwater.height,
        underwater: underwater.data,
      };
    },
    {
      anchor: TRAA_ISOLATION_ANCHOR,
      camera: CAMERA,
      environment: TRAA_ISOLATION_ENVIRONMENT,
      seed: SEED,
    },
  );

  expect(before.snapshot.state).toBe("ready");
  expect(before.prewarm.width).toBe(INITIAL.width);
  expect(before.prewarm.height).toBe(INITIAL.height);
  expect(before.capabilities.rendering.reflection.planar).toEqual({
    width: INITIAL.width,
    height: INITIAL.height,
    format: "rgba8unorm-srgb",
    samples: 0,
  });
  expect(before.capabilities.rendering.reflection.ssr).toEqual(
    expectedSsrCapabilities(INITIAL.width, INITIAL.height),
  );
  expect(before.ssrHitWidth).toBe(INITIAL.width);
  expect(before.ssrHitHeight).toBe(INITIAL.height);
  expect(before.ssrConfidenceWidth).toBe(INITIAL.width);
  expect(before.ssrConfidenceHeight).toBe(INITIAL.height);
  expect(before.ssrColorWidth).toBe(INITIAL.width);
  expect(before.ssrColorHeight).toBe(INITIAL.height);
  expect(before.ssrRoughnessWidth).toBe(INITIAL.width);
  expect(before.ssrRoughnessHeight).toBe(INITIAL.height);
  expect(before.ssrHistoryColorWidth).toBe(INITIAL.width);
  expect(before.ssrHistoryColorHeight).toBe(INITIAL.height);
  expect(before.ssrHistoryWeightWidth).toBe(INITIAL.width);
  expect(before.ssrHistoryWeightHeight).toBe(INITIAL.height);
  expect(decodeFloat32(before.ssrHistoryColor).length).toBe(
    INITIAL.width * INITIAL.height * 3,
  );
  expect(decodeFloat32(before.ssrHistoryWeight).length).toBe(
    INITIAL.width * INITIAL.height,
  );
  expect(before.ssrHistoryInputWidth).toBe(INITIAL.width);
  expect(before.ssrHistoryInputHeight).toBe(INITIAL.height);
  expect(decodeFloat32(before.ssrHistoryInput).length).toBe(
    INITIAL.width * INITIAL.height * 3,
  );
  expect(before.underwaterWidth).toBe(INITIAL.width);
  expect(before.underwaterHeight).toBe(INITIAL.height);
  expect(decodeFloat32(before.underwater).length).toBe(
    INITIAL.width * INITIAL.height,
  );
  expect(decodeFloat32(before.ssrHit).length).toBe(
    INITIAL.width * INITIAL.height,
  );
  expect(decodeFloat32(before.ssrConfidence).length).toBe(
    INITIAL.width * INITIAL.height,
  );
  expect(decodeFloat32(before.ssrColor).length).toBe(
    INITIAL.width * INITIAL.height * 3,
  );
  expect(decodeFloat32(before.ssrRoughness).length).toBe(
    INITIAL.width * INITIAL.height,
  );
  expect(before.planarColorWidth).toBe(INITIAL.width);
  expect(before.planarColorHeight).toBe(INITIAL.height);
  expect(before.occupancyWidth).toBe(INITIAL.width);
  expect(before.occupancyHeight).toBe(INITIAL.height);
  expect(decodeUint8(before.planarColor).length).toBe(
    INITIAL.width * INITIAL.height * 4,
  );
  expect(decodeFloat32(before.occupancy).length).toBe(
    INITIAL.width * INITIAL.height,
  );
  expect(before.snapshot.viewport).toEqual({
    drawingBufferWidth: INITIAL.width,
    drawingBufferHeight: INITIAL.height,
  });

  const resizeStarted = page.waitForFunction(() => {
    const loading = document.querySelector(
      '[data-testid="loading-experience"]',
    );
    const stage = document.querySelector('[data-testid="reference-stage"]');
    return loading !== null && stage === null;
  });
  await page.setViewportSize(NEXT);
  await resizeStarted;
  await expect(page.getByTestId("reference-stage")).toHaveCount(0);
  await expect(page.getByTestId("loading-experience")).toBeVisible();

  const invalidated = await page.evaluate(async () => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    try {
      await harness.present();
      return { code: "presented" };
    } catch (error) {
      return {
        code:
          error instanceof Error && "code" in error
            ? String((error as { code: unknown }).code)
            : "unknown",
      };
    }
  });
  expect(invalidated.code).toBe("QA_INVALIDATED");

  await expect(page.getByTestId("reference-stage")).toBeVisible();
  await expect(page.getByTestId("loading-experience")).toHaveCount(0);

  const after = await page.evaluate(
    async ({ anchor, camera, environment, seed }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const snapshot = harness.snapshot();
      await harness.reset({ seed });
      await harness.updateEnvironment(environment);
      await harness.updateInteractionAnchor(anchor);
      await harness.setCamera(camera, { transition: "continuous" });
      const presented = await harness.present();
      const current = await harness.capture("current-color");
      const finalColor = await harness.capture("final-color");
      const fresnel = await harness.capture("optical-fresnel");
      const depth = await harness.capture("depth");
      const normal = await harness.capture("normal");
      const planarColor = await harness.capture("planar-color");
      const occupancy = await harness.capture("planar-target-alpha");
      const ssrHit = await harness.capture("ssr-hit");
      const ssrConfidence = await harness.capture("ssr-confidence");
      const ssrColor = await harness.capture("ssr-color");
      const ssrRoughness = await harness.capture("ssr-roughness");
      const ssrHistoryColor = await harness.capture("ssr-history-color");
      const ssrHistoryWeight = await harness.capture(
        "ssr-history-frame-weight",
      );
      const ssrHistoryInput = await harness.capture("ssr-history-input-color");
      const underwater = await harness.capture("underwater-transmittance");
      const repeated = await harness.present();
      const repeatedPlanar = await harness.capture("planar-color");
      const repeatedOccupancy = await harness.capture("planar-target-alpha");
      const repeatedSsrHit = await harness.capture("ssr-hit");
      const repeatedSsrColor = await harness.capture("ssr-color");
      const repeatedSsrRoughness = await harness.capture("ssr-roughness");
      const repeatedSsrHistoryColor =
        await harness.capture("ssr-history-color");
      const repeatedUnderwater = await harness.capture(
        "underwater-transmittance",
      );
      return {
        snapshot,
        presented,
        current: current.data,
        finalColor: finalColor.data,
        fresnel: fresnel.data,
        depth: depth.data,
        normal: normal.data,
        currentWidth: current.width,
        currentHeight: current.height,
        finalWidth: finalColor.width,
        finalHeight: finalColor.height,
        capabilities: presented.prewarm.capabilities,
        planarColorWidth: planarColor.width,
        planarColorHeight: planarColor.height,
        planarColor: planarColor.data,
        occupancyWidth: occupancy.width,
        occupancyHeight: occupancy.height,
        occupancy: occupancy.data,
        ssrHitWidth: ssrHit.width,
        ssrHitHeight: ssrHit.height,
        ssrHit: ssrHit.data,
        ssrConfidenceWidth: ssrConfidence.width,
        ssrConfidenceHeight: ssrConfidence.height,
        ssrConfidence: ssrConfidence.data,
        ssrColorWidth: ssrColor.width,
        ssrColorHeight: ssrColor.height,
        ssrColor: ssrColor.data,
        ssrRoughnessWidth: ssrRoughness.width,
        ssrRoughnessHeight: ssrRoughness.height,
        ssrRoughness: ssrRoughness.data,
        ssrHistoryColorWidth: ssrHistoryColor.width,
        ssrHistoryColorHeight: ssrHistoryColor.height,
        ssrHistoryColor: ssrHistoryColor.data,
        ssrHistoryWeightWidth: ssrHistoryWeight.width,
        ssrHistoryWeightHeight: ssrHistoryWeight.height,
        ssrHistoryWeight: ssrHistoryWeight.data,
        ssrHistoryInputWidth: ssrHistoryInput.width,
        ssrHistoryInputHeight: ssrHistoryInput.height,
        ssrHistoryInput: ssrHistoryInput.data,
        underwaterWidth: underwater.width,
        underwaterHeight: underwater.height,
        underwater: underwater.data,
        repeatedCapabilities: repeated.prewarm.capabilities,
        repeatedPlanarWidth: repeatedPlanar.width,
        repeatedPlanarHeight: repeatedPlanar.height,
        repeatedOccupancyWidth: repeatedOccupancy.width,
        repeatedOccupancyHeight: repeatedOccupancy.height,
        repeatedSsrHitWidth: repeatedSsrHit.width,
        repeatedSsrHitHeight: repeatedSsrHit.height,
        repeatedSsrColorWidth: repeatedSsrColor.width,
        repeatedSsrColorLength: repeatedSsrColor.data.length,
        repeatedSsrRoughnessWidth: repeatedSsrRoughness.width,
        repeatedSsrHistoryColorWidth: repeatedSsrHistoryColor.width,
        repeatedUnderwaterWidth: repeatedUnderwater.width,
        repeatedUnderwaterHeight: repeatedUnderwater.height,
      };
    },
    {
      anchor: TRAA_ISOLATION_ANCHOR,
      camera: CAMERA,
      environment: TRAA_ISOLATION_ENVIRONMENT,
      seed: SEED,
    },
  );

  expect(after.snapshot.generation).toBe(before.snapshot.generation + 1);
  expect(after.snapshot.manifestHash).toBe(NEXT_MANIFEST_HASH);
  expect(after.snapshot.manifestHash).not.toBe(before.snapshot.manifestHash);
  expect(after.snapshot.qualityProfileId).toBe(
    before.snapshot.qualityProfileId,
  );
  expect(after.snapshot.viewport).toEqual({
    drawingBufferWidth: NEXT.width,
    drawingBufferHeight: NEXT.height,
  });
  expect(after.presented.prewarm.width).toBe(NEXT.width);
  expect(after.presented.prewarm.height).toBe(NEXT.height);
  expect(after.currentWidth).toBe(NEXT.width);
  expect(after.currentHeight).toBe(NEXT.height);
  expect(after.finalWidth).toBe(NEXT.width);
  expect(after.finalHeight).toBe(NEXT.height);
  expect(after.capabilities.rendering.reflection.planar).toEqual({
    width: NEXT.width,
    height: NEXT.height,
    format: "rgba8unorm-srgb",
    samples: 0,
  });
  expect(after.capabilities.rendering.reflection.ssr).toEqual(
    expectedSsrCapabilities(NEXT.width, NEXT.height),
  );
  expect(after.ssrHitWidth).toBe(NEXT.width);
  expect(after.ssrHitHeight).toBe(NEXT.height);
  expect(after.ssrConfidenceWidth).toBe(NEXT.width);
  expect(after.ssrConfidenceHeight).toBe(NEXT.height);
  expect(after.ssrColorWidth).toBe(NEXT.width);
  expect(after.ssrColorHeight).toBe(NEXT.height);
  expect(after.ssrRoughnessWidth).toBe(NEXT.width);
  expect(after.ssrRoughnessHeight).toBe(NEXT.height);
  expect(after.ssrHistoryColorWidth).toBe(NEXT.width);
  expect(after.ssrHistoryColorHeight).toBe(NEXT.height);
  expect(after.ssrHistoryWeightWidth).toBe(NEXT.width);
  expect(after.ssrHistoryWeightHeight).toBe(NEXT.height);
  expect(decodeFloat32(after.ssrHistoryColor).length).toBe(
    NEXT.width * NEXT.height * 3,
  );
  expect(decodeFloat32(after.ssrHistoryWeight).length).toBe(
    NEXT.width * NEXT.height,
  );
  expect(after.ssrHistoryInputWidth).toBe(NEXT.width);
  expect(after.ssrHistoryInputHeight).toBe(NEXT.height);
  expect(decodeFloat32(after.ssrHistoryInput).length).toBe(
    NEXT.width * NEXT.height * 3,
  );
  expect(after.underwaterWidth).toBe(NEXT.width);
  expect(after.underwaterHeight).toBe(NEXT.height);
  expect(decodeFloat32(after.underwater).length).toBe(NEXT.width * NEXT.height);
  expect(decodeFloat32(after.ssrHit).length).toBe(NEXT.width * NEXT.height);
  expect(decodeFloat32(after.ssrConfidence).length).toBe(
    NEXT.width * NEXT.height,
  );
  expect(decodeFloat32(after.ssrColor).length).toBe(
    NEXT.width * NEXT.height * 3,
  );
  expect(decodeFloat32(after.ssrRoughness).length).toBe(
    NEXT.width * NEXT.height,
  );
  expect(after.planarColorWidth).toBe(NEXT.width);
  expect(after.planarColorHeight).toBe(NEXT.height);
  expect(after.occupancyWidth).toBe(NEXT.width);
  expect(after.occupancyHeight).toBe(NEXT.height);
  expect(decodeUint8(after.planarColor).length).toBe(
    NEXT.width * NEXT.height * 4,
  );
  expect(decodeFloat32(after.occupancy).length).toBe(NEXT.width * NEXT.height);
  expect(after.repeatedCapabilities.rendering.reflection.planar).toEqual(
    after.capabilities.rendering.reflection.planar,
  );
  expect(after.repeatedCapabilities.rendering.reflection.ssr).toEqual(
    after.capabilities.rendering.reflection.ssr,
  );
  expect(after.repeatedSsrHitWidth).toBe(NEXT.width);
  expect(after.repeatedSsrHitHeight).toBe(NEXT.height);
  expect(after.repeatedSsrColorWidth).toBe(NEXT.width);
  expect(after.repeatedSsrRoughnessWidth).toBe(NEXT.width);
  expect(after.repeatedSsrHistoryColorWidth).toBe(NEXT.width);
  expect(after.repeatedUnderwaterWidth).toBe(NEXT.width);
  expect(after.repeatedUnderwaterHeight).toBe(NEXT.height);
  expect(after.repeatedPlanarWidth).toBe(NEXT.width);
  expect(after.repeatedPlanarHeight).toBe(NEXT.height);
  expect(after.repeatedOccupancyWidth).toBe(NEXT.width);
  expect(after.repeatedOccupancyHeight).toBe(NEXT.height);
  expect(after.presented.temporal).toEqual({
    historyEpoch: 1,
    resetReason: "qa-reset",
    resetFrame: true,
  });
  expect(after.presented.compileCount).toBeGreaterThan(0);
  const diffs = waterMaskedChannelAbsDiffs(
    decodeUint8(after.current),
    decodeUint8(after.finalColor),
    decodeFloat32(after.fresnel),
    decodeFloat32(after.depth),
    decodeFloat32(after.normal),
    NEXT.width,
    NEXT.height,
  );
  expect(diffs.length).toBeGreaterThan(0);
  let maxDiff = 0;
  for (const diff of diffs) {
    if (diff > maxDiff) {
      maxDiff = diff;
    }
  }
  expect(maxDiff).toBeLessThanOrEqual(1);

  const sameSize = await page.evaluate(async () => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    const beforeSame = harness.snapshot();
    window.dispatchEvent(new Event("resize"));
    const afterSame = harness.snapshot();
    return { beforeSame, afterSame };
  });
  expect(sameSize.afterSame.generation).toBe(sameSize.beforeSame.generation);
  expect(sameSize.afterSame.manifestHash).toBe(
    sameSize.beforeSame.manifestHash,
  );
  expect(sameSize.afterSame.viewport).toEqual(sameSize.beforeSame.viewport);
});

test("rapid viewport changes reveal only the latest drawing buffer", async ({
  page,
}) => {
  // This test budgets 60s for the reveal below, which the 30s per-test cap in
  // playwright.config.ts would cut short: the budget was never actually
  // available, so the test could only ever pass when the real wait happened to
  // land under the cap. Raise the cap past the budget it already asks for
  // rather than shrinking the budget to fit the cap.
  test.setTimeout(90_000);
  await page.setViewportSize(INITIAL);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();
  const before = await page.evaluate(() => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    return harness.snapshot();
  });

  await page.setViewportSize(RAPID_FIRST);
  await expect(page.getByTestId("loading-experience")).toBeVisible();
  await page.setViewportSize(NEXT);
  await expect(page.getByTestId("reference-stage")).toHaveCount(1, {
    timeout: 60_000,
  });
  await expect(page.getByTestId("reference-stage")).toBeVisible();
  await expect(page.getByTestId("loading-experience")).toHaveCount(0);

  const after = await page.evaluate(
    async ({ camera, seed }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed });
      await harness.setCamera(camera, { transition: "continuous" });
      const presented = await harness.present();
      return {
        snapshot: harness.snapshot(),
        prewarm: presented.prewarm,
      };
    },
    { camera: CAMERA, seed: SEED },
  );

  expect(after.snapshot.generation).toBeGreaterThan(before.generation);
  expect(after.snapshot.viewport).toEqual({
    drawingBufferWidth: NEXT.width,
    drawingBufferHeight: NEXT.height,
  });
  expect(after.snapshot.manifestHash).toBe(NEXT_MANIFEST_HASH);
  expect(after.snapshot.manifestHash).not.toBe(before.manifestHash);
  expect(after.snapshot.manifestHash).not.toBe(RAPID_FIRST_MANIFEST_HASH);
  expect(after.prewarm.width).toBe(NEXT.width);
  expect(after.prewarm.height).toBe(NEXT.height);
});

function waterMaskedChannelAbsDiffs(
  current: Uint8Array,
  finalColor: Uint8Array,
  fresnel: readonly number[],
  depth: readonly number[],
  normals: readonly number[],
  width: number,
  height: number,
): number[] {
  const diffs: number[] = [];
  const pixelCount = width * height;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const fresnelValue = fresnel[pixel] ?? Number.NaN;
    const depthValue = depth[pixel] ?? Number.NaN;
    const nx = normals[pixel * 3] ?? Number.NaN;
    const ny = normals[pixel * 3 + 1] ?? Number.NaN;
    const nz = normals[pixel * 3 + 2] ?? Number.NaN;
    const normalLength = Math.hypot(nx, ny, nz);
    if (
      !(fresnelValue > 0.001) ||
      !Number.isFinite(depthValue) ||
      normalLength < 0.9 ||
      normalLength > 1.1
    ) {
      continue;
    }
    const offset = pixel * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      diffs.push(
        Math.abs(
          (current[offset + channel] ?? 0) -
            (finalColor[offset + channel] ?? 0),
        ),
      );
    }
  }
  return diffs;
}
