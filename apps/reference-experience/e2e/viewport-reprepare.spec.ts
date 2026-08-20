import { expect, test } from "@playwright/test";
import {
  createMinimalWaterPrewarmManifest,
  createMinimalWaterQualityProfile,
} from "real-water";
import type { QaCameraV1, QaHarnessV5 } from "../src/qa-harness.js";
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
    async ({ camera, seed }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV5 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed });
      await harness.setCamera(camera, { transition: "continuous" });
      const presented = await harness.present();
      return {
        presented,
        snapshot: harness.snapshot(),
        prewarm: presented.prewarm,
      };
    },
    { camera: CAMERA, seed: SEED },
  );

  expect(before.snapshot.state).toBe("ready");
  expect(before.prewarm.width).toBe(INITIAL.width);
  expect(before.prewarm.height).toBe(INITIAL.height);
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
    const harness = window.__REAL_WATER_QA__ as QaHarnessV5 | undefined;
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
    async ({ camera, seed }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV5 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const snapshot = harness.snapshot();
      await harness.reset({ seed });
      await harness.setCamera(camera, { transition: "continuous" });
      const presented = await harness.present();
      const current = await harness.capture("current-color");
      const finalColor = await harness.capture("final-color");
      const fresnel = await harness.capture("optical-fresnel");
      const depth = await harness.capture("depth");
      const normal = await harness.capture("normal");
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
      };
    },
    { camera: CAMERA, seed: SEED },
  );

  expect(after.snapshot.generation).toBe(before.snapshot.generation + 1);
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
    const harness = window.__REAL_WATER_QA__ as QaHarnessV5 | undefined;
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
  await page.setViewportSize(INITIAL);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();
  const before = await page.evaluate(() => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV5 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    return harness.snapshot();
  });

  await page.setViewportSize(RAPID_FIRST);
  await expect(page.getByTestId("loading-experience")).toBeVisible();
  await page.setViewportSize(NEXT);
  await expect(page.getByTestId("reference-stage")).toHaveCount(1);
  await expect(page.getByTestId("reference-stage")).toBeVisible();
  await expect(page.getByTestId("loading-experience")).toHaveCount(0);

  const after = await page.evaluate(
    async ({ camera, seed }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV5 | undefined;
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
