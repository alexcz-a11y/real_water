import { expect, test, type Page } from "@playwright/test";
import {
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
  WATER_PRESET_SCHEMA,
  WATER_PRESET_VERSION,
  createWaterPreset,
} from "real-water";
import type { QaFramePrewarmReceipt } from "../src/qa-frame-driver.js";
import {
  QA_CAPTURE_SCHEMA,
  QA_CAPTURE_VERSION,
  QA_HARNESS_CAPTURE_NAMES,
  QA_HARNESS_SCHEMA,
  QA_HARNESS_VERSION,
  type QaCameraV1,
  type QaHarnessV10,
} from "../src/qa-harness.js";
import { REFERENCE_ENVIRONMENT_LIGHTING } from "../src/reference-optical-inputs.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import {
  decodeFloat32,
  decodeUint8,
  meanAbsDifference,
} from "./qa-capture-bytes.js";
import {
  attachRegressionAcceptance,
  coreManifestEvidence,
} from "./regression-acceptance.js";

const SWELL_PRESET = createWaterPreset("swell");
const HORIZON_QA_HARNESS = {
  schema: QA_HARNESS_SCHEMA,
  version: QA_HARNESS_VERSION,
} as const;
const HORIZON_QA_CAPTURE = {
  schema: QA_CAPTURE_SCHEMA,
  version: QA_CAPTURE_VERSION,
  names: QA_HARNESS_CAPTURE_NAMES,
} as const;

test.describe.configure({ mode: "serial" });

const DOWN_CAMERA = {
  projection: "perspective" as const,
  position: [0, 12, 0] as const,
  target: [0, 0, 0] as const,
  up: [0, 0, -1] as const,
  verticalFovDegrees: 40,
  near: 0.1,
  far: 100,
} satisfies QaCameraV1;

const HORIZON_CAMERA = {
  projection: "perspective" as const,
  position: [0, 8, 0] as const,
  target: [400, 0, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 50,
  near: 0.5,
  far: 4_000,
} satisfies QaCameraV1;

const ORIGIN_SHIFT_METRES = 96;
const LARGE_ORIGIN_METRES = 1_000_000_000;
const LOCAL_COORDINATE_BOUND_METRES = 200;
const ORIGIN_COLOR_MEAN_ABS = 4;
const ORIGIN_DEPTH_MEAN_ABS_METRES = 0.05;
const ORIGIN_NORMAL_MEAN_ABS = 0.01;
const NON_PERIODIC_SHIFT_METRES = 288;
const NEAR_DEPTH_METRES = { min: 8, max: 40 } as const;
const MID_DEPTH_METRES = { min: 70, max: 180 } as const;
const FAR_DEPTH_METRES = { min: 400, max: 1_200 } as const;
const FAR_HIGHLIGHT_DEPTH_METRES = { min: 400, max: 1_500 } as const;

async function openQaStage(page: Page): Promise<void> {
  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();
}

test("breaks repeating Open Water patches on the deterministic horizon route", async ({
  page,
}, testInfo) => {
  await openQaStage(page);
  const result = await page.evaluate(async (shiftMetres) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }

    const captureAt = async (
      positionX: number,
    ): Promise<{
      readonly depth: string;
      readonly normal: string;
      readonly cameraRevision: number;
      readonly presentationId: number;
      readonly seed: number;
      readonly tick: number;
      readonly manifestHash: string;
      readonly controlRevision: number;
      readonly qaPrewarm: QaFramePrewarmReceipt;
    }> => {
      const camera = await harness.setCamera(
        {
          projection: "perspective",
          position: [positionX, 8, 0],
          target: [positionX + 400, 0, 0],
          up: [0, 1, 0],
          verticalFovDegrees: 50,
          near: 0.5,
          far: 4_000,
        },
        { transition: "continuous" },
      );
      const presentation = await harness.present();
      const depth = await harness.capture("depth");
      const normal = await harness.capture("normal");
      return {
        depth: depth.data,
        normal: normal.data,
        cameraRevision: camera.cameraRevision,
        presentationId: presentation.presentationId,
        seed: presentation.seed,
        tick: presentation.tick,
        manifestHash: presentation.manifestHash,
        controlRevision: presentation.controlRevision,
        qaPrewarm: presentation.prewarm,
      };
    };

    await harness.reset({ seed: 0x4000_0000 });
    await harness.advanceTicks(30);
    const first = await captureAt(0);
    const originQuery = await harness.queryGameplay([0, 0, 0]);
    const shiftedQuery = await harness.queryGameplay([shiftMetres, 0, 0]);
    const shifted = await captureAt(shiftMetres);
    return {
      originQueryHeight: originQuery.height,
      shiftedQueryHeight: shiftedQuery.height,
      first,
      shifted,
    };
  }, NON_PERIODIC_SHIFT_METRES);

  expect(result.shiftedQueryHeight).not.toBeCloseTo(
    result.originQueryHeight,
    3,
  );
  expect(result.shifted.cameraRevision).toBeGreaterThan(
    result.first.cameraRevision,
  );
  expect(result.shifted.presentationId).toBeGreaterThan(
    result.first.presentationId,
  );
  expect(result.shifted.depth).not.toBe(result.first.depth);
  expect(result.shifted.normal).not.toBe(result.first.normal);
  expect(
    meanAbsDifference(
      decodeFloat32(result.first.depth),
      decodeFloat32(result.shifted.depth),
    ),
  ).toBeGreaterThan(0.05);
  await attachRegressionAcceptance(testInfo, page, {
    seed: result.first.seed,
    tick: result.first.tick,
    camera: HORIZON_CAMERA,
    controlRevision: result.first.controlRevision,
    coreManifest: coreManifestEvidence(result.first.qaPrewarm.core),
    qaPrewarm: result.first.qaPrewarm,
    captures: [
      {
        width: result.first.qaPrewarm.width,
        height: result.first.qaPrewarm.height,
      },
    ],
    qaHarness: HORIZON_QA_HARNESS,
    qaCapture: HORIZON_QA_CAPTURE,
    artisticControls: SWELL_PRESET.artisticControls,
    waterPreset: {
      schema: WATER_PRESET_SCHEMA,
      version: WATER_PRESET_VERSION,
      id: SWELL_PRESET.id,
      presetHash: SWELL_PRESET.presetHash,
    },
    environment: {
      reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      lighting: REFERENCE_ENVIRONMENT_LIGHTING,
    },
  });
});

test("preserves queried and rendered Open Water across a host origin shift", async ({
  page,
}, testInfo) => {
  await openQaStage(page);
  const result = await page.evaluate(async (periodMetres) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }

    await harness.reset({ seed: 0x4000_0000 });
    await harness.advanceTicks(18);
    await harness.setCamera(
      {
        projection: "perspective",
        position: [periodMetres, 12, 0],
        target: [periodMetres, 0, 0],
        up: [0, 0, -1],
        verticalFovDegrees: 40,
        near: 0.1,
        far: 100,
      },
      { transition: "continuous" },
    );
    const beforePresentation = await harness.present();
    const beforeQuery = await harness.queryGameplay([periodMetres, 0, 0]);
    const beforeColor = await harness.capture("final-color");
    const beforeDepth = await harness.capture("depth");
    const beforeNormal = await harness.capture("normal");
    const origin = await harness.setOrigin({ x: periodMetres, z: 0 });
    const repeatedOrigin = await harness.setOrigin({
      x: periodMetres,
      z: 0,
    });
    await harness.setCamera(
      {
        projection: "perspective",
        position: [0, 12, 0],
        target: [0, 0, 0],
        up: [0, 0, -1],
        verticalFovDegrees: 40,
        near: 0.1,
        far: 100,
      },
      { transition: "continuous" },
    );
    const afterPresentation = await harness.present();
    const afterQuery = await harness.queryGameplay([0, 0, 0]);
    const afterColor = await harness.capture("final-color");
    const afterDepth = await harness.capture("depth");
    const afterNormal = await harness.capture("normal");
    const resetAfterShift = await harness.reset({ seed: 0x4000_0000 });
    return {
      beforePresentation,
      afterPresentation,
      beforeQuery,
      afterQuery,
      origin,
      repeatedOrigin,
      resetAfterShift,
      beforeColor: beforeColor.data,
      afterColor: afterColor.data,
      beforeDepth: beforeDepth.data,
      afterDepth: afterDepth.data,
      beforeNormal: beforeNormal.data,
      afterNormal: afterNormal.data,
      qaPrewarm: afterPresentation.prewarm,
    };
  }, ORIGIN_SHIFT_METRES);

  expect(result.origin).toMatchObject({
    originX: ORIGIN_SHIFT_METRES,
    originZ: 0,
    originRevision: result.beforePresentation.originRevision + 1,
  });
  expect(result.repeatedOrigin.originRevision).toBe(
    result.origin.originRevision,
  );
  expect(result.beforePresentation).toMatchObject({
    tick: 18,
    originX: 0,
    originZ: 0,
    originRevision: 0,
  });
  expect(result.afterPresentation).toMatchObject({
    tick: 18,
    originX: ORIGIN_SHIFT_METRES,
    originZ: 0,
    originRevision: result.origin.originRevision,
  });
  expect(result.resetAfterShift).toMatchObject({
    originX: 0,
    originZ: 0,
    originRevision: result.origin.originRevision + 1,
  });
  expect(result.afterQuery.height).toBeCloseTo(result.beforeQuery.height, 4);
  expect(result.afterQuery.normal[0]).toBeCloseTo(
    result.beforeQuery.normal[0],
    4,
  );
  expect(result.afterQuery.normal[1]).toBeCloseTo(
    result.beforeQuery.normal[1],
    4,
  );
  expect(result.afterQuery.normal[2]).toBeCloseTo(
    result.beforeQuery.normal[2],
    4,
  );
  expectOriginShiftContinuous(result);
  await attachRegressionAcceptance(testInfo, page, {
    seed: result.afterPresentation.seed,
    tick: result.afterPresentation.tick,
    camera: DOWN_CAMERA,
    controlRevision: result.afterPresentation.controlRevision,
    coreManifest: coreManifestEvidence(result.qaPrewarm.core),
    qaPrewarm: result.qaPrewarm,
    captures: [
      { width: result.qaPrewarm.width, height: result.qaPrewarm.height },
    ],
    qaHarness: HORIZON_QA_HARNESS,
    qaCapture: HORIZON_QA_CAPTURE,
    artisticControls: SWELL_PRESET.artisticControls,
    waterPreset: {
      schema: WATER_PRESET_SCHEMA,
      version: WATER_PRESET_VERSION,
      id: SWELL_PRESET.id,
      presetHash: SWELL_PRESET.presetHash,
    },
    environment: {
      reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      lighting: REFERENCE_ENVIRONMENT_LIGHTING,
    },
  });
});

test("preserves queried and rendered Open Water across a billion-metre origin shift", async ({
  page,
}, testInfo) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ baselineOrigin, periodMetres }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }

      await harness.reset({ seed: 0x4000_0000 });
      await harness.advanceTicks(18);
      await harness.setOrigin({ x: baselineOrigin, z: 0 });
      await harness.setCamera(
        {
          projection: "perspective",
          position: [periodMetres, 12, 0],
          target: [periodMetres, 0, 0],
          up: [0, 0, -1],
          verticalFovDegrees: 40,
          near: 0.1,
          far: 100,
        },
        { transition: "continuous" },
      );
      const beforePresentation = await harness.present();
      const beforeQuery = await harness.queryGameplay([periodMetres, 0, 0]);
      const beforeColor = await harness.capture("final-color");
      const beforeDepth = await harness.capture("depth");
      const beforeNormal = await harness.capture("normal");
      const origin = await harness.setOrigin({
        x: baselineOrigin + periodMetres,
        z: 0,
      });
      await harness.setCamera(
        {
          projection: "perspective",
          position: [0, 12, 0],
          target: [0, 0, 0],
          up: [0, 0, -1],
          verticalFovDegrees: 40,
          near: 0.1,
          far: 100,
        },
        { transition: "continuous" },
      );
      const afterPresentation = await harness.present();
      const afterQuery = await harness.queryGameplay([0, 0, 0]);
      const afterColor = await harness.capture("final-color");
      const afterDepth = await harness.capture("depth");
      const afterNormal = await harness.capture("normal");
      const center =
        Math.floor(afterDepth.height / 2) * afterDepth.width +
        Math.floor(afterDepth.width / 2);
      return {
        beforePresentation,
        afterPresentation,
        beforeQuery,
        afterQuery,
        origin,
        beforeCamera: [periodMetres, 12, 0] as const,
        afterCamera: [0, 12, 0] as const,
        beforeColor: beforeColor.data,
        afterColor: afterColor.data,
        beforeDepth: beforeDepth.data,
        afterDepth: afterDepth.data,
        beforeNormal: beforeNormal.data,
        afterNormal: afterNormal.data,
        center,
        width: afterDepth.width,
        height: afterDepth.height,
        qaPrewarm: afterPresentation.prewarm,
      };
    },
    {
      baselineOrigin: LARGE_ORIGIN_METRES,
      periodMetres: ORIGIN_SHIFT_METRES,
    },
  );

  const depths = decodeFloat32(result.afterDepth);
  const renderedHeight = 12 - (depths[result.center] ?? Number.NaN);
  expect(result.origin.originRevision).toBe(
    result.beforePresentation.originRevision + 1,
  );
  expect(result.beforePresentation.originX).toBe(LARGE_ORIGIN_METRES);
  expect(result.afterPresentation.originX).toBe(
    LARGE_ORIGIN_METRES + ORIGIN_SHIFT_METRES,
  );
  expectLocalCoordinates(result.beforeCamera);
  expectLocalCoordinates(result.afterCamera);
  expectLocalCoordinates(result.beforeQuery.point);
  expectLocalCoordinates(result.afterQuery.point);
  expect(result.afterQuery.height).toBeCloseTo(result.beforeQuery.height, 4);
  expectOriginShiftContinuous(result);
  expect(
    Math.abs(renderedHeight - result.afterQuery.height),
  ).toBeLessThanOrEqual(0.03);
  await attachRegressionAcceptance(testInfo, page, {
    seed: result.afterPresentation.seed,
    tick: result.afterPresentation.tick,
    camera: DOWN_CAMERA,
    controlRevision: result.afterPresentation.controlRevision,
    coreManifest: coreManifestEvidence(result.qaPrewarm.core),
    qaPrewarm: result.qaPrewarm,
    captures: [
      { width: result.qaPrewarm.width, height: result.qaPrewarm.height },
    ],
    qaHarness: HORIZON_QA_HARNESS,
    qaCapture: HORIZON_QA_CAPTURE,
    artisticControls: SWELL_PRESET.artisticControls,
    waterPreset: {
      schema: WATER_PRESET_SCHEMA,
      version: WATER_PRESET_VERSION,
      id: SWELL_PRESET.id,
      presetHash: SWELL_PRESET.presetHash,
    },
    environment: {
      reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      lighting: REFERENCE_ENVIRONMENT_LIGHTING,
    },
  });
});

test("transitions near geometry, middle normals, and far slope detail without a seam", async ({
  page,
}, testInfo) => {
  await openQaStage(page);
  const result = await page.evaluate(async () => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x4000_0000 });
    await harness.advanceTicks(24);
    await harness.setCamera(
      {
        projection: "perspective",
        position: [0, 8, 0],
        target: [400, 0, 0],
        up: [0, 1, 0],
        verticalFovDegrees: 50,
        near: 0.5,
        far: 4_000,
      },
      { transition: "continuous" },
    );
    const presentation = await harness.present();
    const depth = await harness.capture("depth");
    const normal = await harness.capture("normal");
    const color = await harness.capture("final-color");
    const current = await harness.capture("current-color");
    const glint = await harness.capture("optical-glint");
    return {
      width: depth.width,
      height: depth.height,
      depth: depth.data,
      normal: normal.data,
      color: color.data,
      current: current.data,
      glint: glint.data,
      seed: presentation.seed,
      tick: presentation.tick,
      manifestHash: presentation.manifestHash,
      controlRevision: presentation.controlRevision,
      qaPrewarm: presentation.prewarm,
    };
  });

  const depths = decodeFloat32(result.depth);
  const normals = decodeFloat32(result.normal);
  const color = decodeUint8(result.color);
  const current = decodeUint8(result.current);
  const near = collectDepthBand(
    depths,
    normals,
    color,
    result.width,
    result.height,
    NEAR_DEPTH_METRES.min,
    NEAR_DEPTH_METRES.max,
  );
  const mid = collectDepthBand(
    depths,
    normals,
    color,
    result.width,
    result.height,
    MID_DEPTH_METRES.min,
    MID_DEPTH_METRES.max,
  );
  const far = collectDepthBand(
    depths,
    normals,
    color,
    result.width,
    result.height,
    FAR_DEPTH_METRES.min,
    FAR_DEPTH_METRES.max,
  );
  const adjacent = adjacentNormalJumps(
    depths,
    normals,
    result.width,
    result.height,
    Math.floor(result.width / 2),
    NEAR_DEPTH_METRES.min,
    FAR_DEPTH_METRES.max,
  );

  const farCurrentLuma = bandLuma(
    depths,
    current,
    result.width,
    result.height,
    FAR_DEPTH_METRES.min,
    FAR_DEPTH_METRES.max,
  );
  expect(near.count).toBeGreaterThan(4);
  expect(mid.count).toBeGreaterThan(4);
  expect(far.count).toBeGreaterThan(4);
  expect(near.normalSpread).toBeGreaterThan(0.04);
  expect(mid.normalSpread).toBeGreaterThan(0.06);
  expect(mid.normalSpread).toBeGreaterThan(far.normalSpread * 2);
  expect(far.normalSpread).toBeLessThan(0.12);
  expect(farCurrentLuma.range).toBeGreaterThan(8);
  const glintValues = decodeFloat32(result.glint);
  const midGlint = collectScalarBand(
    depths,
    glintValues,
    result.width,
    result.height,
    MID_DEPTH_METRES.min,
    MID_DEPTH_METRES.max,
  );
  const waterGlint = collectScalarBand(
    depths,
    glintValues,
    result.width,
    result.height,
    NEAR_DEPTH_METRES.min,
    FAR_DEPTH_METRES.max,
  );
  expect(waterGlint.count).toBeGreaterThan(far.count);
  expect(waterGlint.max).toBeGreaterThan(0.2);
  expect(waterGlint.mean).toBeGreaterThan(0.002);
  expect(midGlint.max).toBeGreaterThan(0.05);
  expect(midGlint.mean).toBeGreaterThan(0.0005);
  expect(adjacent.count).toBeGreaterThan(10);
  expect(adjacent.max).toBeLessThan(adjacent.p95 * 4 + 0.08);
  await attachRegressionAcceptance(testInfo, page, {
    seed: result.seed,
    tick: result.tick,
    camera: HORIZON_CAMERA,
    controlRevision: result.controlRevision,
    coreManifest: coreManifestEvidence(result.qaPrewarm.core),
    qaPrewarm: result.qaPrewarm,
    captures: [
      { width: result.qaPrewarm.width, height: result.qaPrewarm.height },
    ],
    qaHarness: HORIZON_QA_HARNESS,
    qaCapture: HORIZON_QA_CAPTURE,
    artisticControls: SWELL_PRESET.artisticControls,
    waterPreset: {
      schema: WATER_PRESET_SCHEMA,
      version: WATER_PRESET_VERSION,
      id: SWELL_PRESET.id,
      presetHash: SWELL_PRESET.presetHash,
    },
    environment: {
      reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      lighting: REFERENCE_ENVIRONMENT_LIGHTING,
    },
  });
});

test("keeps filtered slope detail and optical glints stable under camera motion", async ({
  page,
}, testInfo) => {
  await openQaStage(page);
  const result = await page.evaluate(async () => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x4000_0000 });
    await harness.advanceTicks(24);
    await harness.setCamera(
      {
        projection: "perspective",
        position: [0, 8, 0],
        target: [400, 0, 0],
        up: [0, 1, 0],
        verticalFovDegrees: 50,
        near: 0.5,
        far: 4_000,
      },
      { transition: "continuous" },
    );
    const presentation = await harness.present();
    const firstColor = await harness.capture("final-color");
    const firstDepth = await harness.capture("depth");
    const firstNormal = await harness.capture("normal");
    const firstGlint = await harness.capture("optical-glint");
    await harness.setCamera(
      {
        projection: "perspective",
        position: [0, 8, 1],
        target: [400, 0, 1],
        up: [0, 1, 0],
        verticalFovDegrees: 50,
        near: 0.5,
        far: 4_000,
      },
      { transition: "continuous" },
    );
    await harness.present();
    const secondColor = await harness.capture("final-color");
    const secondDepth = await harness.capture("depth");
    const secondNormal = await harness.capture("normal");
    const secondGlint = await harness.capture("optical-glint");
    const decodeFloat32 = (data: string): Float32Array => {
      const bytes = Uint8Array.from(atob(data), (byte) => byte.charCodeAt(0));
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      const values = new Float32Array(bytes.byteLength / 4);
      for (let index = 0; index < values.length; index += 1) {
        values[index] = view.getFloat32(index * 4, true);
      }
      return values;
    };
    const decodeUint8 = (data: string): Uint8Array =>
      Uint8Array.from(atob(data), (byte) => byte.charCodeAt(0));
    const median = (values: readonly number[]): number => {
      if (values.length === 0) {
        return 0;
      }
      const sorted = [...values].sort((left, right) => left - right);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
        : (sorted[middle] ?? 0);
    };
    const measureRoi = (
      depths: ArrayLike<number>,
      glint: ArrayLike<number>,
      color: Uint8Array,
      width: number,
      height: number,
    ) => {
      const farLuma: number[] = [];
      const roiLuma: number[] = [];
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        const depth = depths[pixel] ?? Number.NaN;
        if (depth < 8 || depth > 1_500) {
          continue;
        }
        const colorIndex = pixel * 4;
        const luma =
          0.2126 * (color[colorIndex] ?? 0) +
          0.7152 * (color[colorIndex + 1] ?? 0) +
          0.0722 * (color[colorIndex + 2] ?? 0);
        farLuma.push(luma);
        if ((glint[pixel] ?? 0) >= 0.08) {
          roiLuma.push(luma);
        }
      }
      const bandMedian = median(farLuma);
      const roiMedian = median(roiLuma);
      return {
        farCount: farLuma.length,
        roiCount: roiLuma.length,
        minRoiCount: Math.max(4, Math.ceil(farLuma.length * 0.001)),
        farMedian: bandMedian,
        roiMedian,
        gain: roiMedian - bandMedian,
      };
    };
    const stress: Array<{
      readonly farCount: number;
      readonly roiCount: number;
      readonly minRoiCount: number;
      readonly gain: number;
    }> = [];
    for (let frame = 0; frame < 24; frame += 1) {
      await harness.present();
      const color = await harness.capture("final-color");
      const depth = await harness.capture("depth");
      const glint = await harness.capture("optical-glint");
      stress.push(
        measureRoi(
          decodeFloat32(depth.data),
          decodeFloat32(glint.data),
          decodeUint8(color.data),
          color.width,
          color.height,
        ),
      );
    }
    return {
      width: firstColor.width,
      height: firstColor.height,
      firstColor: firstColor.data,
      secondColor: secondColor.data,
      firstDepth: firstDepth.data,
      secondDepth: secondDepth.data,
      firstNormal: firstNormal.data,
      firstGlint: firstGlint.data,
      secondNormal: secondNormal.data,
      secondGlint: secondGlint.data,
      stress,
      seed: presentation.seed,
      tick: presentation.tick,
      manifestHash: presentation.manifestHash,
      controlRevision: presentation.controlRevision,
      qaPrewarm: presentation.prewarm,
    };
  });

  const firstDepths = decodeFloat32(result.firstDepth);
  const secondDepths = decodeFloat32(result.secondDepth);
  const firstColor = decodeUint8(result.firstColor);
  const secondColor = decodeUint8(result.secondColor);
  const firstNormal = decodeFloat32(result.firstNormal);
  const secondNormal = decodeFloat32(result.secondNormal);
  const far = collectFarRegion(
    firstDepths,
    firstColor,
    secondColor,
    firstNormal,
    secondNormal,
    result.width,
    result.height,
    FAR_HIGHLIGHT_DEPTH_METRES.min,
    FAR_HIGHLIGHT_DEPTH_METRES.max,
  );
  const firstRoi = collectCausalGlintRoi(
    firstDepths,
    decodeFloat32(result.firstGlint),
    firstColor,
    result.width,
    result.height,
    NEAR_DEPTH_METRES.min,
    FAR_HIGHLIGHT_DEPTH_METRES.max,
  );
  const secondRoi = collectCausalGlintRoi(
    secondDepths,
    decodeFloat32(result.secondGlint),
    secondColor,
    result.width,
    result.height,
    NEAR_DEPTH_METRES.min,
    FAR_HIGHLIGHT_DEPTH_METRES.max,
  );

  const firstGlint = collectScalarBand(
    firstDepths,
    decodeFloat32(result.firstGlint),
    result.width,
    result.height,
    NEAR_DEPTH_METRES.min,
    FAR_HIGHLIGHT_DEPTH_METRES.max,
  );
  const secondGlint = collectScalarBand(
    secondDepths,
    decodeFloat32(result.secondGlint),
    result.width,
    result.height,
    NEAR_DEPTH_METRES.min,
    FAR_HIGHLIGHT_DEPTH_METRES.max,
  );
  console.log(
    JSON.stringify({
      firstRoi,
      secondRoi,
      stress: result.stress,
    }),
  );
  expect(far.count).toBeGreaterThan(80);
  expect(far.highlightContrast).toBeGreaterThan(18);
  expect(firstRoi.roiCount).toBeGreaterThanOrEqual(firstRoi.minRoiCount);
  expect(firstRoi.gain).toBeGreaterThan(12);
  expect(secondRoi.roiCount).toBeGreaterThanOrEqual(secondRoi.minRoiCount);
  expect(secondRoi.gain).toBeGreaterThan(12);
  expect(firstGlint.max).toBeGreaterThan(0.2);
  expect(firstGlint.mean).toBeGreaterThan(0.002);
  expect(Math.abs(firstGlint.mean - secondGlint.mean)).toBeLessThan(0.01);
  // Persistent world-locked whitecaps add legitimate high-contrast parallax;
  // the translated far field must still stay below a five-percent byte delta.
  expect(far.colorMeanAbs).toBeLessThan(12);
  expect(far.normalMeanAbs).toBeLessThan(0.12);
  expect(result.stress).toHaveLength(24);
  for (const frame of result.stress) {
    expect(frame.roiCount).toBeGreaterThanOrEqual(frame.minRoiCount);
    expect(frame.gain).toBeGreaterThan(12);
  }
  await attachRegressionAcceptance(testInfo, page, {
    seed: result.seed,
    tick: result.tick,
    camera: HORIZON_CAMERA,
    controlRevision: result.controlRevision,
    coreManifest: coreManifestEvidence(result.qaPrewarm.core),
    qaPrewarm: result.qaPrewarm,
    captures: [
      { width: result.qaPrewarm.width, height: result.qaPrewarm.height },
    ],
    qaHarness: HORIZON_QA_HARNESS,
    qaCapture: HORIZON_QA_CAPTURE,
    artisticControls: SWELL_PRESET.artisticControls,
    waterPreset: {
      schema: WATER_PRESET_SCHEMA,
      version: WATER_PRESET_VERSION,
      id: SWELL_PRESET.id,
      presetHash: SWELL_PRESET.presetHash,
    },
    environment: {
      reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      lighting: REFERENCE_ENVIRONMENT_LIGHTING,
    },
  });
});

function bandLuma(
  depths: readonly number[],
  color: Uint8Array,
  width: number,
  height: number,
  minDepth: number,
  maxDepth: number,
): Readonly<{
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly range: number;
}> {
  const luma: number[] = [];
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const depth = depths[pixel] ?? Number.NaN;
    if (depth < minDepth || depth > maxDepth) {
      continue;
    }
    const colorIndex = pixel * 4;
    luma.push(
      0.2126 * (color[colorIndex] ?? 0) +
        0.7152 * (color[colorIndex + 1] ?? 0) +
        0.0722 * (color[colorIndex + 2] ?? 0),
    );
  }
  const min = Math.min(...luma);
  const max = Math.max(...luma);
  return {
    count: luma.length,
    min,
    max,
    mean: luma.reduce((sum, value) => sum + value, 0) / luma.length,
    range: max - min,
  };
}

function collectDepthBand(
  depths: readonly number[],
  normals: readonly number[],
  color: Uint8Array,
  width: number,
  height: number,
  minDepth: number,
  maxDepth: number,
): Readonly<{
  readonly count: number;
  readonly normalSpread: number;
  readonly slopeEnergy: number;
}> {
  const nx: number[] = [];
  const ny: number[] = [];
  const luma: number[] = [];
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const depth = depths[pixel] ?? Number.NaN;
    if (depth < minDepth || depth > maxDepth) {
      continue;
    }
    nx.push(normals[pixel * 3] ?? 0);
    ny.push(normals[pixel * 3 + 1] ?? 0);
    const colorIndex = pixel * 4;
    luma.push(
      0.2126 * (color[colorIndex] ?? 0) +
        0.7152 * (color[colorIndex + 1] ?? 0) +
        0.0722 * (color[colorIndex + 2] ?? 0),
    );
  }
  return {
    count: nx.length,
    normalSpread: standardDeviation(nx) + standardDeviation(ny),
    slopeEnergy: standardDeviation(luma),
  };
}

function collectScalarBand(
  depths: readonly number[],
  values: readonly number[],
  width: number,
  height: number,
  minDepth: number,
  maxDepth: number,
): Readonly<{
  readonly count: number;
  readonly mean: number;
  readonly max: number;
}> {
  const selected: number[] = [];
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const depth = depths[pixel] ?? Number.NaN;
    if (depth < minDepth || depth > maxDepth) {
      continue;
    }
    selected.push(values[pixel] ?? 0);
  }
  return {
    count: selected.length,
    mean: mean(selected),
    max: selected.reduce((best, value) => Math.max(best, value), 0),
  };
}

function adjacentNormalJumps(
  depths: readonly number[],
  normals: readonly number[],
  width: number,
  height: number,
  column: number,
  minDepth: number,
  maxDepth: number,
): Readonly<{
  readonly max: number;
  readonly p95: number;
  readonly count: number;
}> {
  const jumps: number[] = [];
  let previous: number | undefined;
  for (let row = height - 1; row >= 0; row -= 1) {
    const pixel = row * width + column;
    const depth = depths[pixel] ?? Number.NaN;
    if (depth < minDepth || depth > maxDepth) {
      previous = undefined;
      continue;
    }
    const nx = normals[pixel * 3] ?? 0;
    const ny = normals[pixel * 3 + 1] ?? 0;
    const nz = normals[pixel * 3 + 2] ?? 0;
    if (previous !== undefined) {
      const prior = previous;
      const previousDepth = depths[prior] ?? Number.NaN;
      if (Math.abs(depth - previousDepth) <= 25) {
        const dx = nx - (normals[prior * 3] ?? 0);
        const dy = ny - (normals[prior * 3 + 1] ?? 0);
        const dz = nz - (normals[prior * 3 + 2] ?? 0);
        jumps.push(Math.hypot(dx, dy, dz));
      }
    }
    previous = pixel;
  }
  jumps.sort((left, right) => left - right);
  return {
    max: jumps.at(-1) ?? 0,
    p95: jumps[Math.max(0, Math.floor(jumps.length * 0.95) - 1)] ?? 0,
    count: jumps.length,
  };
}

function collectFarRegion(
  depths: readonly number[],
  firstColor: Uint8Array,
  secondColor: Uint8Array,
  firstNormal: readonly number[],
  secondNormal: readonly number[],
  width: number,
  height: number,
  minDepth: number,
  maxDepth: number,
): Readonly<{
  readonly count: number;
  readonly highlightContrast: number;
  readonly colorMeanAbs: number;
  readonly normalMeanAbs: number;
}> {
  const luma: number[] = [];
  let colorAbs = 0;
  let normalAbs = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const depth = depths[pixel] ?? Number.NaN;
    if (depth < minDepth || depth > maxDepth) {
      continue;
    }
    const colorIndex = pixel * 4;
    const r = firstColor[colorIndex] ?? 0;
    const g = firstColor[colorIndex + 1] ?? 0;
    const b = firstColor[colorIndex + 2] ?? 0;
    const r2 = secondColor[colorIndex] ?? 0;
    const g2 = secondColor[colorIndex + 1] ?? 0;
    const b2 = secondColor[colorIndex + 2] ?? 0;
    luma.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    colorAbs += (Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2)) / 3;
    const normalIndex = pixel * 3;
    normalAbs += Math.hypot(
      (firstNormal[normalIndex] ?? 0) - (secondNormal[normalIndex] ?? 0),
      (firstNormal[normalIndex + 1] ?? 0) -
        (secondNormal[normalIndex + 1] ?? 0),
      (firstNormal[normalIndex + 2] ?? 0) -
        (secondNormal[normalIndex + 2] ?? 0),
    );
  }
  const count = luma.length;
  const medianLuma = median(luma);
  const maxLuma = luma.reduce((best, value) => Math.max(best, value), 0);
  return {
    count,
    highlightContrast: maxLuma - medianLuma,
    colorMeanAbs: count === 0 ? 0 : colorAbs / count,
    normalMeanAbs: count === 0 ? 0 : normalAbs / count,
  };
}

function collectCausalGlintRoi(
  depths: readonly number[],
  glint: readonly number[],
  color: Uint8Array,
  width: number,
  height: number,
  minDepth: number,
  maxDepth: number,
): Readonly<{
  readonly farCount: number;
  readonly roiCount: number;
  readonly minRoiCount: number;
  readonly farMedian: number;
  readonly roiMedian: number;
  readonly gain: number;
}> {
  const farLuma: number[] = [];
  const roiLuma: number[] = [];
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const depth = depths[pixel] ?? Number.NaN;
    if (depth < minDepth || depth > maxDepth) {
      continue;
    }
    const colorIndex = pixel * 4;
    const luma =
      0.2126 * (color[colorIndex] ?? 0) +
      0.7152 * (color[colorIndex + 1] ?? 0) +
      0.0722 * (color[colorIndex + 2] ?? 0);
    farLuma.push(luma);
    if ((glint[pixel] ?? 0) >= 0.08) {
      roiLuma.push(luma);
    }
  }
  const farMedian = median(farLuma);
  const roiMedian = median(roiLuma);
  return {
    farCount: farLuma.length,
    roiCount: roiLuma.length,
    minRoiCount: Math.max(4, Math.ceil(farLuma.length * 0.001)),
    farMedian,
    roiMedian,
    gain: roiMedian - farMedian,
  };
}

function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      values.length,
  );
}

function expectOriginShiftContinuous(result: {
  readonly beforeColor: string;
  readonly afterColor: string;
  readonly beforeDepth: string;
  readonly afterDepth: string;
  readonly beforeNormal: string;
  readonly afterNormal: string;
}): void {
  expect(
    meanAbsDifference(
      decodeUint8(result.beforeColor),
      decodeUint8(result.afterColor),
    ),
  ).toBeLessThan(ORIGIN_COLOR_MEAN_ABS);
  expect(
    meanAbsDifference(
      decodeFloat32(result.beforeDepth),
      decodeFloat32(result.afterDepth),
    ),
  ).toBeLessThan(ORIGIN_DEPTH_MEAN_ABS_METRES);
  expect(
    meanAbsDifference(
      decodeFloat32(result.beforeNormal),
      decodeFloat32(result.afterNormal),
    ),
  ).toBeLessThan(ORIGIN_NORMAL_MEAN_ABS);
}

function expectLocalCoordinates(values: readonly number[]): void {
  expect(values.length).toBeGreaterThan(0);
  for (const value of values) {
    expect(Math.abs(value)).toBeLessThan(LOCAL_COORDINATE_BOUND_METRES);
  }
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const high = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) {
    return high;
  }
  return ((sorted[middle - 1] ?? 0) + high) / 2;
}
