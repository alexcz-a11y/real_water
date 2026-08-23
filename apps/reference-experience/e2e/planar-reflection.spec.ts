import { expect, test, type Page } from "@playwright/test";
import { createWaterPreset, type ArtisticControls } from "real-water";
import type {
  QaCameraV1,
  QaHarnessV11,
  QaPlanarReflectionFixtureHotColor,
  QaPlanarReflectionFixtureState,
} from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32, decodeUint8 } from "./qa-capture-bytes.js";

const VIEWPORT = { width: 320, height: 180 } as const;
const HIT_CAMERA = {
  projection: "perspective" as const,
  position: [-20, 12, -20] as const,
  target: [-20, 0, -40] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 40,
  near: 0.1,
  far: 200,
} satisfies QaCameraV1;
const BELOW_CAMERA = {
  ...HIT_CAMERA,
  position: [-20, -8, -20] as const,
  target: [-20, 0, -40] as const,
} satisfies QaCameraV1;
const PLANAR_CONTROLS = {
  ...createWaterPreset("swell").artisticControls,
  whitecapAmount: 0,
  foamPersistence: 0,
} satisfies ArtisticControls;

async function openQaStage(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();
}

async function presentPlanarEvidence(
  page: Page,
  enabled: boolean,
  hotColor: QaPlanarReflectionFixtureHotColor = "magenta",
): Promise<{
  readonly occupancy: string;
  readonly environment: string;
  readonly planarColor: string;
  readonly finalColor: string;
  readonly currentColor: string;
  readonly depth: string;
  readonly normal: string;
  readonly motion: string;
  readonly compileCount: number;
  readonly fixture: QaPlanarReflectionFixtureState;
}> {
  return page.evaluate(
    async ({ fixtureEnabled, fixtureColor, camera, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV11 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x4000_0000 });
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      await harness.setCamera(camera, { transition: "camera-cut" });
      await harness.advanceTicks(24);
      await harness.present();
      await harness.setHostScenePlanarReflectionFixtureHotColor(fixtureColor);
      await harness.setHostScenePlanarReflectionFixture(fixtureEnabled);
      await harness.advanceTicks(1);
      const presentation = await harness.present();
      const [
        occupancy,
        environment,
        planarColor,
        finalColor,
        currentColor,
        depth,
        normal,
        motion,
      ] = await Promise.all([
        harness.capture("planar-target-alpha"),
        harness.capture("optical-environment-reflection"),
        harness.capture("planar-color"),
        harness.capture("final-color"),
        harness.capture("current-color"),
        harness.capture("depth"),
        harness.capture("normal"),
        harness.capture("motion-vector"),
      ]);
      return {
        occupancy: occupancy.data,
        environment: environment.data,
        planarColor: planarColor.data,
        finalColor: finalColor.data,
        currentColor: currentColor.data,
        depth: depth.data,
        normal: normal.data,
        motion: motion.data,
        compileCount: presentation.compileCount,
        fixture: await harness.readHostScenePlanarReflectionFixture(),
      };
    },
    {
      fixtureEnabled: enabled,
      fixtureColor: hotColor,
      camera: HIT_CAMERA,
      controls: PLANAR_CONTROLS,
    },
  );
}

test.describe.configure({ mode: "serial" });

test("keeps the BackSide planar fixture visible and scale-disabled through ready", async ({
  page,
}) => {
  await openQaStage(page);
  const ready = await page.evaluate(async () => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV11 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    const before = await harness.readHostScenePlanarReflectionFixture();
    await harness.reset({ seed: 0x4000_0000 });
    await harness.setCamera(
      {
        projection: "perspective",
        position: [-20, 12, -20],
        target: [-20, 0, -40],
        up: [0, 1, 0],
        verticalFovDegrees: 40,
        near: 0.1,
        far: 200,
      },
      { transition: "camera-cut" },
    );
    await harness.advanceTicks(24);
    await harness.present();
    const settled = await harness.present();
    await harness.setHostScenePlanarReflectionFixture(true);
    const enabled = await harness.present();
    const afterEnable = await harness.readHostScenePlanarReflectionFixture();
    await harness.setHostScenePlanarReflectionFixtureHotColor("black");
    const black = await harness.present();
    await harness.setHostScenePlanarReflectionFixtureHotColor("magenta");
    await harness.setHostScenePlanarReflectionFixture(false);
    const disabled = await harness.present();
    return {
      before,
      afterEnable,
      compileAtReady: settled.compileCount,
      compileAfterEnable: enabled.compileCount,
      compileAfterBlack: black.compileCount,
      compileAfterDisable: disabled.compileCount,
      disabled: await harness.readHostScenePlanarReflectionFixture(),
    };
  });

  expect(ready.before).toEqual({
    visible: true,
    frustumCulled: false,
    enabled: false,
    scale: [0, 0, 0],
    hotColor: "magenta",
  });
  expect(ready.afterEnable).toMatchObject({
    visible: true,
    frustumCulled: false,
    enabled: true,
    scale: [1, 1, 1],
  });
  expect(ready.disabled).toEqual({
    visible: true,
    frustumCulled: false,
    enabled: false,
    scale: [0, 0, 0],
    hotColor: "magenta",
  });
  expect(ready.compileAfterEnable).toBe(ready.compileAtReady);
  expect(ready.compileAfterBlack).toBe(ready.compileAtReady);
  expect(ready.compileAfterDisable).toBe(ready.compileAtReady);
});

test("composes planar hits over non-black Host environment fallback", async ({
  page,
}) => {
  await openQaStage(page);
  const miss = await presentPlanarEvidence(page, false);
  const hit = await presentPlanarEvidence(page, true);
  const missOccupancy = decodeFloat32(miss.occupancy);
  const hitOccupancy = decodeFloat32(hit.occupancy);
  const missEnvironment = decodeFloat32(miss.environment);
  const hitEnvironment = decodeFloat32(hit.environment);
  const missPlanar = decodeUint8(miss.planarColor);
  const hitPlanar = decodeUint8(hit.planarColor);
  const missFinal = decodeUint8(miss.finalColor);
  const hitFinal = decodeUint8(hit.finalColor);
  const missCurrent = decodeUint8(miss.currentColor);
  const hitCurrent = decodeUint8(hit.currentColor);

  expect(miss.fixture.enabled).toBe(false);
  expect(hit.fixture).toMatchObject({
    visible: true,
    frustumCulled: false,
    enabled: true,
    hotColor: "magenta",
  });
  expect(miss.depth).toBe(hit.depth);
  expect(miss.normal).toBe(hit.normal);
  expect(miss.motion).toBe(hit.motion);
  expect(missOccupancy.every((value) => value === 0)).toBe(true);
  expect(missPlanar.every((value) => value === 0)).toBe(true);
  expect(missEnvironment.some((value) => value > 0.02)).toBe(true);
  expect(missFinal.some((value) => value > 8)).toBe(true);
  expect(hitOccupancy.every((value) => Number.isFinite(value))).toBe(true);
  expect(hitOccupancy.every((value) => value >= 0 && value <= 1)).toBe(true);
  expect(hitOccupancy.some((value) => value === 0)).toBe(true);
  expect(hitOccupancy.some((value) => value > 0.25)).toBe(true);
  expect(
    hitOccupancy.every(
      (value, index) =>
        Math.abs(value - (hitPlanar[index * 4 + 3] ?? 0) / 255) < 1e-5,
    ),
  ).toBe(true);
  expect(hitEnvironment.some((value) => value > 0.02)).toBe(true);
  expect(
    [...hitPlanar.keys()].some(
      (index) => index % 4 !== 3 && (hitPlanar[index] ?? 0) > 32,
    ),
  ).toBe(true);
  expect(hit.compileCount).toBe(miss.compileCount);
  expect(meanAbsDifference(hitFinal, missFinal)).toBeGreaterThan(1);
  expect(meanAbsDifference(hitCurrent, missCurrent)).toBeGreaterThan(1);
});

test("composes opaque black planar hits by alpha rather than RGB brightness", async ({
  page,
}) => {
  await openQaStage(page);
  const miss = await presentPlanarEvidence(page, false, "magenta");
  const black = await presentPlanarEvidence(page, true, "black");
  const missOccupancy = decodeFloat32(miss.occupancy);
  const blackOccupancy = decodeFloat32(black.occupancy);
  const missEnvironment = decodeFloat32(miss.environment);
  const blackEnvironment = decodeFloat32(black.environment);
  const blackPlanar = decodeUint8(black.planarColor);
  const missFinal = decodeUint8(miss.finalColor);
  const blackFinal = decodeUint8(black.finalColor);
  const missCurrent = decodeUint8(miss.currentColor);
  const blackCurrent = decodeUint8(black.currentColor);

  expect(black.fixture).toMatchObject({
    visible: true,
    frustumCulled: false,
    enabled: true,
    hotColor: "black",
  });
  expect(black.depth).toBe(miss.depth);
  expect(black.normal).toBe(miss.normal);
  expect(black.motion).toBe(miss.motion);
  expect(black.compileCount).toBe(miss.compileCount);
  expect(missOccupancy.every((value) => value === 0)).toBe(true);
  expect(blackOccupancy.some((value) => value > 0.25)).toBe(true);
  expect(black.environment).toBe(miss.environment);
  expect(missEnvironment.some((value) => value > 0.02)).toBe(true);
  expect(blackEnvironment.some((value) => value > 0.02)).toBe(true);
  expect(
    blackOccupancy.every((value, index) => {
      if (!(value > 0.25)) {
        return true;
      }
      const red = blackPlanar[index * 4] ?? 255;
      const green = blackPlanar[index * 4 + 1] ?? 255;
      const blue = blackPlanar[index * 4 + 2] ?? 255;
      const alpha = blackPlanar[index * 4 + 3] ?? 0;
      return red <= 2 && green <= 2 && blue <= 2 && alpha > 64;
    }),
  ).toBe(true);
  expect(meanLuma(blackFinal)).toBeLessThan(meanLuma(missFinal) - 1);
  expect(meanLuma(blackCurrent)).toBeLessThan(meanLuma(missCurrent) - 1);
});

test("keeps Host environment fallback independent of scene.environment", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(async (camera) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV11 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    const captureEnvironment = async () => {
      await harness.reset({ seed: 0x4000_0000 });
      await harness.setHostScenePlanarReflectionFixture(false);
      await harness.setCamera(camera, { transition: "continuous" });
      await harness.advanceTicks(24);
      await harness.present();
      return (await harness.capture("optical-environment-reflection")).data;
    };
    await harness.reset({ seed: 0x4000_0000 });
    await harness.setHostSceneLightingDecoy(false);
    const baseline = await captureEnvironment();
    await harness.setHostSceneLightingDecoy(true);
    const decoy = await captureEnvironment();
    await harness.setHostSceneLightingDecoy(false);
    return { baseline, decoy };
  }, HIT_CAMERA);

  expect(result.decoy).toBe(result.baseline);
});

test("restores planar output on the same lease after rising above the plane", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ below, above }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV11 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x4000_0000 });
      await harness.setHostScenePlanarReflectionFixture(true);
      await harness.setCamera(below, { transition: "camera-cut" });
      await harness.advanceTicks(24);
      await harness.present();
      const belowPresent = await harness.present();
      const belowOccupancy = (await harness.capture("planar-target-alpha"))
        .data;
      const belowPlanar = (await harness.capture("planar-color")).data;
      const belowFinal = (await harness.capture("final-color")).data;
      const belowCurrent = (await harness.capture("current-color")).data;
      await harness.setCamera(above, { transition: "camera-cut" });
      await harness.present();
      const abovePresent = await harness.present();
      return {
        belowCompile: belowPresent.compileCount,
        aboveCompile: abovePresent.compileCount,
        belowOccupancy,
        aboveOccupancy: (await harness.capture("planar-target-alpha")).data,
        belowPlanar,
        abovePlanar: (await harness.capture("planar-color")).data,
        belowFinal,
        aboveFinal: (await harness.capture("final-color")).data,
        belowCurrent,
        aboveCurrent: (await harness.capture("current-color")).data,
        fixture: await harness.readHostScenePlanarReflectionFixture(),
      };
    },
    { below: BELOW_CAMERA, above: HIT_CAMERA },
  );
  const belowOccupancy = decodeFloat32(result.belowOccupancy);
  const aboveOccupancy = decodeFloat32(result.aboveOccupancy);
  const belowPlanar = decodeUint8(result.belowPlanar);
  const abovePlanar = decodeUint8(result.abovePlanar);
  const belowFinal = decodeUint8(result.belowFinal);
  const aboveFinal = decodeUint8(result.aboveFinal);
  const belowCurrent = decodeUint8(result.belowCurrent);
  const aboveCurrent = decodeUint8(result.aboveCurrent);

  expect(result.fixture.enabled).toBe(true);
  expect(result.aboveCompile).toBe(result.belowCompile);
  expect(belowOccupancy.every((value) => value === 0)).toBe(true);
  expect(belowPlanar.every((value) => value === 0)).toBe(true);
  expect(aboveOccupancy.some((value) => value > 0.25)).toBe(true);
  expect(meanAbsDifference(abovePlanar, belowPlanar)).toBeGreaterThan(1);
  expect(
    meanAbsDifference(aboveFinal, belowFinal) > 1 ||
      meanAbsDifference(aboveCurrent, belowCurrent) > 1,
  ).toBe(true);
});

function meanAbsDifference(left: Uint8Array, right: Uint8Array): number {
  let total = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    total += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }
  return length === 0 ? 0 : total / length;
}

function meanLuma(pixels: Uint8Array): number {
  let total = 0;
  const count = Math.floor(pixels.length / 4);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const red = pixels[pixel * 4] ?? 0;
    const green = pixels[pixel * 4 + 1] ?? 0;
    const blue = pixels[pixel * 4 + 2] ?? 0;
    total += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }
  return count === 0 ? 0 : total / count;
}
