import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import type { QaCameraV1, QaHarnessV2 } from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";

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
const NON_PERIODIC_SHIFT_METRES = 288;
const NEAR_DEPTH_METRES = { min: 8, max: 40 } as const;
const MID_DEPTH_METRES = { min: 70, max: 180 } as const;
const FAR_DEPTH_METRES = { min: 400, max: 1_200 } as const;
const FAR_HIGHLIGHT_DEPTH_METRES = { min: 400, max: 1_500 } as const;

test("breaks repeating Open Water patches on the deterministic horizon route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );

  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();
  const result = await page.evaluate(async (shiftMetres) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV2 | undefined;
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
    }> => {
      const camera = await harness.setCamera({
        projection: "perspective",
        position: [positionX, 8, 0],
        target: [positionX + 400, 0, 0],
        up: [0, 1, 0],
        verticalFovDegrees: 50,
        near: 0.5,
        far: 4_000,
      });
      await harness.present();
      const presentation = await harness.present();
      const depth = await harness.capture("depth");
      const normal = await harness.capture("normal");
      return {
        depth: depth.data,
        normal: normal.data,
        cameraRevision: camera.cameraRevision,
        presentationId: presentation.presentationId,
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
});

test("preserves queried and rendered Open Water across a host origin shift", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );

  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();
  const result = await page.evaluate(
    async ({ periodMetres, camera }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV2 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }

      await harness.reset({ seed: 0x4000_0000 });
      await harness.advanceTicks(18);
      await harness.setCamera({
        ...camera,
        position: [
          camera.position[0] + periodMetres,
          camera.position[1],
          camera.position[2],
        ],
        target: [
          camera.target[0] + periodMetres,
          camera.target[1],
          camera.target[2],
        ],
      });
      const beforePresentation = await harness.present();
      const beforeQuery = await harness.queryGameplay([periodMetres, 0, 0]);
      const beforeColor = await harness.capture("final-color");
      const origin = await harness.setOrigin({ x: periodMetres, z: 0 });
      await harness.setCamera(camera);
      const afterPresentation = await harness.present();
      const afterQuery = await harness.queryGameplay([0, 0, 0]);
      const afterColor = await harness.capture("final-color");
      return {
        beforePresentation,
        afterPresentation,
        beforeQuery,
        afterQuery,
        origin,
        beforeColor: beforeColor.data,
        afterColor: afterColor.data,
      };
    },
    { periodMetres: ORIGIN_SHIFT_METRES, camera: DOWN_CAMERA },
  );

  expect(result.origin).toMatchObject({
    originX: ORIGIN_SHIFT_METRES,
    originZ: 0,
    temporalHistoryValid: false,
  });
  expect(result.beforePresentation).toMatchObject({
    tick: 18,
    originX: 0,
    originZ: 0,
    temporalHistoryValid: true,
  });
  expect(result.afterPresentation).toMatchObject({
    tick: 18,
    originX: ORIGIN_SHIFT_METRES,
    originZ: 0,
    temporalHistoryValid: false,
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
  expect(result.afterColor).toBe(result.beforeColor);
});

test("transitions near geometry, middle normals, and far slope detail without a seam", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );

  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();
  const result = await page.evaluate(async (camera) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV2 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x4000_0000 });
    await harness.advanceTicks(24);
    await harness.setCamera(camera);
    await harness.present();
    const depth = await harness.capture("depth");
    const normal = await harness.capture("normal");
    const color = await harness.capture("final-color");
    return {
      width: depth.width,
      height: depth.height,
      depth: depth.data,
      normal: normal.data,
      color: color.data,
    };
  }, HORIZON_CAMERA);

  const depths = decodeFloat32(result.depth);
  const normals = decodeFloat32(result.normal);
  const color = decodeUint8(result.color);
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

  expect(near.count).toBeGreaterThan(4);
  expect(mid.count).toBeGreaterThan(4);
  expect(far.count).toBeGreaterThan(4);
  expect(near.normalSpread).toBeGreaterThan(0.04);
  expect(mid.normalSpread).toBeGreaterThan(0.06);
  expect(mid.normalSpread).toBeGreaterThan(far.normalSpread * 2);
  expect(far.normalSpread).toBeLessThan(0.12);
  expect(far.slopeEnergy).toBeGreaterThan(10);
  expect(adjacent.count).toBeGreaterThan(10);
  expect(adjacent.max).toBeLessThan(adjacent.p95 * 4 + 0.08);
});

test("keeps distant highlights and white-detail placeholders stable under camera motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );

  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();
  const result = await page.evaluate(async (camera) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV2 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x4000_0000 });
    await harness.advanceTicks(24);
    await harness.setCamera(camera);
    await harness.present();
    const firstColor = await harness.capture("final-color");
    const firstDepth = await harness.capture("depth");
    const firstNormal = await harness.capture("normal");
    await harness.setCamera({
      ...camera,
      position: [
        camera.position[0],
        camera.position[1],
        camera.position[2] + 1,
      ],
      target: [camera.target[0], camera.target[1], camera.target[2] + 1],
    });
    await harness.present();
    const secondColor = await harness.capture("final-color");
    const secondNormal = await harness.capture("normal");
    return {
      width: firstColor.width,
      height: firstColor.height,
      firstColor: firstColor.data,
      secondColor: secondColor.data,
      firstDepth: firstDepth.data,
      firstNormal: firstNormal.data,
      secondNormal: secondNormal.data,
    };
  }, HORIZON_CAMERA);

  const depths = decodeFloat32(result.firstDepth);
  const firstColor = decodeUint8(result.firstColor);
  const secondColor = decodeUint8(result.secondColor);
  const firstNormal = decodeFloat32(result.firstNormal);
  const secondNormal = decodeFloat32(result.secondNormal);
  const far = collectFarRegion(
    depths,
    firstColor,
    secondColor,
    firstNormal,
    secondNormal,
    result.width,
    result.height,
    FAR_HIGHLIGHT_DEPTH_METRES.min,
    FAR_HIGHLIGHT_DEPTH_METRES.max,
  );

  expect(far.count).toBeGreaterThan(80);
  expect(far.highlightContrast).toBeGreaterThan(18);
  expect(far.brightFraction).toBeGreaterThan(0.02);
  expect(Math.abs(far.brightFraction - far.movedBrightFraction)).toBeLessThan(
    0.05,
  );
  expect(far.colorMeanAbs).toBeLessThan(8);
  expect(far.normalMeanAbs).toBeLessThan(0.12);
});

function decodeFloat32(encoded: string): number[] {
  const bytes = Buffer.from(encoded, "base64");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 4 }, (_, index) =>
    view.getFloat32(index * 4, true),
  );
}

function decodeUint8(encoded: string): Uint8Array {
  return Uint8Array.from(Buffer.from(encoded, "base64"));
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
  readonly brightFraction: number;
  readonly movedBrightFraction: number;
  readonly colorMeanAbs: number;
  readonly normalMeanAbs: number;
}> {
  const luma: number[] = [];
  const movedLuma: number[] = [];
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
    movedLuma.push(0.2126 * r2 + 0.7152 * g2 + 0.0722 * b2);
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
  const meanLuma = mean(luma);
  const medianLuma = median(luma);
  const maxLuma = luma.reduce((best, value) => Math.max(best, value), 0);
  const bright = (values: readonly number[]): number =>
    count === 0
      ? 0
      : values.filter((value) => value > meanLuma + 12).length / count;
  return {
    count,
    highlightContrast: maxLuma - medianLuma,
    brightFraction: bright(luma),
    movedBrightFraction: bright(movedLuma),
    colorMeanAbs: count === 0 ? 0 : colorAbs / count,
    normalMeanAbs: count === 0 ? 0 : normalAbs / count,
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

function meanAbsDifference(
  left: readonly number[],
  right: readonly number[],
): number {
  const count = Math.min(left.length, right.length);
  if (count === 0) {
    return 0;
  }
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }
  return total / count;
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
