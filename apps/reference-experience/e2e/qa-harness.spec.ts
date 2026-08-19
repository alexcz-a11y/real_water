import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import type { QaCameraV1, QaHarnessV1 } from "../src/qa-harness.js";

const FIXED_CAMERA = {
  projection: "perspective" as const,
  position: [8, 6, 10] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 50,
  near: 0.1,
  far: 100,
} satisfies QaCameraV1;

test("exposes the versioned QA Harness only on the explicit QA route", async ({
  page,
}) => {
  await page.goto("/");
  expect(
    await page.evaluate(() =>
      Object.prototype.hasOwnProperty.call(window, "__REAL_WATER_QA__"),
    ),
  ).toBe(false);

  await page.goto("/?qa=1&host=memory&delay=0");
  await expect(page.getByTestId("reference-placeholder")).toBeVisible();

  const contract = await page.evaluate(() => {
    const harness = window.__REAL_WATER_QA__;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    return {
      schema: harness.schema,
      version: harness.version,
      fixedTickHz: harness.fixedTickHz,
      captureNames: harness.captureNames,
      prewarmSchema: harness.prewarmManifest.schema,
      prewarmVersion: harness.prewarmManifest.version,
      frozen: Object.isFrozen(harness),
    };
  });

  expect(contract).toEqual({
    schema: "real-water/qa-harness",
    version: 1,
    fixedTickHz: 60,
    captureNames: ["final-color", "depth", "normal"],
    prewarmSchema: "real-water/qa-frame-prewarm",
    prewarmVersion: 1,
    frozen: true,
  });
});

test("drives and captures a repeatable rendered frame without wall-clock animation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto("/?qa=1&host=memory&delay=0");
  const coreWebGPUAvailable = await page.evaluate(async () => {
    const gpu = (
      navigator as Navigator & {
        gpu?: {
          requestAdapter(): Promise<{
            features: { has(name: string): boolean };
          } | null>;
        };
      }
    ).gpu;
    const adapter = await gpu?.requestAdapter();
    return adapter?.features.has("core-features-and-limits") === true;
  });
  test.skip(
    !coreWebGPUAvailable,
    "Core WebGPU is unavailable in this browser profile.",
  );

  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const result = await page.evaluate(async (camera) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV1 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }

    const drive = async (ticks: number) => {
      await harness.reset({ seed: 0x5eed_0016 });
      const advanced = await harness.advanceTicks(ticks);
      await harness.setCamera(camera);
      const presentation = await harness.present();
      const captures = await Promise.all(
        harness.captureNames.map((name) => harness.capture(name)),
      );
      return { advanced, presentation, captures };
    };

    return {
      first: await drive(120),
      repeated: await drive(120),
      changedTick: await drive(121),
    };
  }, FIXED_CAMERA);

  expect(result.first.advanced).toMatchObject({
    seed: 0x5eed_0016,
    tick: 120,
  });
  expect(result.first.presentation).toMatchObject({
    seed: 0x5eed_0016,
    tick: 120,
    captureNames: ["final-color", "depth", "normal"],
    prewarm: {
      width: 320,
      height: 180,
      progress: {
        completedWork: 8,
        totalWork: 8,
      },
    },
  });
  expect(result.first.captures.map(({ name }) => name)).toEqual([
    "final-color",
    "depth",
    "normal",
  ]);
  expect(result.first.captures.map(({ format }) => format)).toEqual([
    "rgba8unorm-srgb",
    "r32float-linear-view",
    "rgb32float-view-normal",
  ]);
  expect(result.first.captures.every(({ data }) => data.length > 0)).toBe(true);
  expect(result.repeated.captures[0]?.data).toBe(
    result.first.captures[0]?.data,
  );
  expect(result.changedTick.captures[0]?.data).not.toBe(
    result.first.captures[0]?.data,
  );

  const [finalColor, depth, normal] = result.first.captures;
  expect(finalColor).toMatchObject({ width: 320, height: 180, components: 4 });
  expect(depth).toMatchObject({ width: 320, height: 180, components: 1 });
  expect(normal).toMatchObject({ width: 320, height: 180, components: 3 });
  expect(Buffer.from(finalColor?.data ?? "", "base64")).toHaveLength(
    320 * 180 * 4,
  );

  const depthValues = decodeFloat32(depth?.data ?? "");
  expect(depthValues).toHaveLength(320 * 180);
  expect(
    depthValues.every(
      (value) => Number.isFinite(value) && value >= 0.1 && value <= 100.001,
    ),
  ).toBe(true);
  expect(depthValues.some((value) => value < 99)).toBe(true);
  expect(depthValues.some((value) => Math.abs(value - 100) < 0.001)).toBe(true);

  const normalValues = decodeFloat32(normal?.data ?? "");
  expect(normalValues).toHaveLength(320 * 180 * 3);
  expect(
    normalValues.every(
      (value) => Number.isFinite(value) && value >= -1.001 && value <= 1.001,
    ),
  ).toBe(true);
  expect(hasUnitNormal(normalValues)).toBe(true);
});

function decodeFloat32(encoded: string): number[] {
  const bytes = Buffer.from(encoded, "base64");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 4 }, (_, index) =>
    view.getFloat32(index * 4, true),
  );
}

function hasUnitNormal(values: readonly number[]): boolean {
  for (let index = 0; index < values.length; index += 3) {
    const x = values[index] ?? 0;
    const y = values[index + 1] ?? 0;
    const z = values[index + 2] ?? 0;
    const length = Math.hypot(x, y, z);
    if (length > 0.99 && length < 1.01) {
      return true;
    }
  }
  return false;
}
