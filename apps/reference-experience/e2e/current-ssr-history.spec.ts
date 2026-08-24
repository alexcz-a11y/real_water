import { expect, test, type Page } from "@playwright/test";
import { createWaterPreset } from "real-water";
import type { QaCameraV1, QaHarnessV17 } from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32 } from "./qa-capture-bytes.js";

const VIEWPORT = { width: 320, height: 180 } as const;
const HIT_CAMERA = {
  projection: "perspective" as const,
  position: [0, 12, 20] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 40,
  near: 0.1,
  far: 200,
} satisfies QaCameraV1;
const OFFSCREEN_CAMERA = {
  ...HIT_CAMERA,
  position: [40, 12, 40] as const,
  target: [80, 0, 80] as const,
} satisfies QaCameraV1;
const HALF_FLOAT_EPSILON = 2 ** -10;
const SSR_CONTROLS = {
  ...createWaterPreset("swell").artisticControls,
  whitecapAmount: 0,
  foamPersistence: 0,
  underwaterHaze: 1,
  underwaterTurbidity: 1,
  underwaterLightShafts: 1,
  underwaterColor: 1,
  underwaterExposure: 1,
};

function rawHitPixels(hit: ArrayLike<number>): number[] {
  const pixels: number[] = [];
  for (let pixel = 0; pixel < hit.length; pixel += 1) {
    if ((hit[pixel] ?? 0) > HALF_FLOAT_EPSILON) {
      pixels.push(pixel);
    }
  }
  return pixels;
}

function assertResetHistoryReseed(
  hit: ArrayLike<number>,
  input: ArrayLike<number>,
  history: ArrayLike<number>,
  weight: ArrayLike<number>,
): void {
  const pixels = rawHitPixels(hit);
  expect(pixels.length).toBeGreaterThan(0);
  for (const pixel of pixels) {
    expect(Math.abs((weight[pixel] ?? 0) - 1)).toBeLessThanOrEqual(
      HALF_FLOAT_EPSILON,
    );
    expect(
      Math.abs((history[pixel * 3] ?? 0) - (input[pixel * 3] ?? 0)),
    ).toBeLessThanOrEqual(HALF_FLOAT_EPSILON);
    expect(
      Math.abs((history[pixel * 3 + 1] ?? 0) - (input[pixel * 3 + 1] ?? 0)),
    ).toBeLessThanOrEqual(HALF_FLOAT_EPSILON);
    expect(
      Math.abs((history[pixel * 3 + 2] ?? 0) - (input[pixel * 3 + 2] ?? 0)),
    ).toBeLessThanOrEqual(HALF_FLOAT_EPSILON);
  }
}

function linearRgbWithinHalfEpsilon(
  left: readonly number[],
  right: readonly number[],
  pixel: number,
): boolean {
  return (
    Math.abs((left[pixel * 3] ?? 0) - (right[pixel * 3] ?? 0)) <=
      HALF_FLOAT_EPSILON &&
    Math.abs((left[pixel * 3 + 1] ?? 0) - (right[pixel * 3 + 1] ?? 0)) <=
      HALF_FLOAT_EPSILON &&
    Math.abs((left[pixel * 3 + 2] ?? 0) - (right[pixel * 3 + 2] ?? 0)) <=
      HALF_FLOAT_EPSILON
  );
}

function magentaEnergy(color: readonly number[], pixel: number): number {
  return (
    (color[pixel * 3] ?? 0) +
    (color[pixel * 3 + 2] ?? 0) -
    (color[pixel * 3 + 1] ?? 0)
  );
}

function isBlackRgb(color: readonly number[], pixel: number): boolean {
  return (
    Math.abs(color[pixel * 3] ?? 0) <= HALF_FLOAT_EPSILON &&
    Math.abs(color[pixel * 3 + 1] ?? 0) <= HALF_FLOAT_EPSILON &&
    Math.abs(color[pixel * 3 + 2] ?? 0) <= HALF_FLOAT_EPSILON
  );
}

function assertStableHitWeightBelowOne(
  hit: ArrayLike<number>,
  weight: ArrayLike<number>,
): void {
  const pixels = rawHitPixels(hit);
  expect(
    pixels.some((pixel) => (weight[pixel] ?? 1) < 1 - HALF_FLOAT_EPSILON),
  ).toBe(true);
}

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

test("captures TemporalReproject resolved history RGB and inverse frame weight from the same present", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ cameraPose, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x4000_0000 });
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      await harness.setCamera(cameraPose, { transition: "camera-cut" });
      await harness.setHostSceneForegroundFixture(false);
      await harness.setHostSceneCurrentSsrFixtureHotColor("magenta");
      await harness.setHostSceneCurrentSsrFixture(true);
      await harness.advanceTicks(24);
      const first = await harness.present();
      const firstHistory = await harness.capture("ssr-history-color");
      const firstWeight = await harness.capture("ssr-history-frame-weight");
      const firstInput = await harness.capture("ssr-history-input-color");
      const firstConfidence = await harness.capture("ssr-confidence");
      const firstBase = await harness.capture("reflection-base-color");
      const firstComposite = await harness.capture("ssr-composite-color");
      await harness.reset({ seed: 0x4000_0000 });
      await harness.setCamera(cameraPose, { transition: "camera-cut" });
      await harness.setHostSceneForegroundFixture(false);
      await harness.setHostSceneCurrentSsrFixtureHotColor("magenta");
      await harness.setHostSceneCurrentSsrFixture(true);
      await harness.advanceTicks(24);
      await harness.present();
      const replayHistory = await harness.capture("ssr-history-color");
      const replayWeight = await harness.capture("ssr-history-frame-weight");
      const replayInput = await harness.capture("ssr-history-input-color");
      return {
        firstHistory: firstHistory.data,
        firstWeight: firstWeight.data,
        firstInput: firstInput.data,
        replayHistory: replayHistory.data,
        replayWeight: replayWeight.data,
        replayInput: replayInput.data,
        confidence: firstConfidence.data,
        base: firstBase.data,
        composite: firstComposite.data,
        compileCount: first.compileCount,
        replayCompileCount: (await harness.present()).compileCount,
      };
    },
    { cameraPose: HIT_CAMERA, controls: SSR_CONTROLS },
  );
  expect(result.firstHistory).toBe(result.replayHistory);
  expect(result.firstWeight).toBe(result.replayWeight);
  expect(result.firstInput).toBe(result.replayInput);
  const weight = decodeFloat32(result.firstWeight);
  expect(weight.every((value) => Number.isFinite(value))).toBe(true);
  expect(weight.every((value) => value > 0 && value <= 1)).toBe(true);
  const confidence = decodeFloat32(result.confidence);
  const base = decodeFloat32(result.base);
  const composite = decodeFloat32(result.composite);
  for (let pixel = 0; pixel < confidence.length; pixel += 1) {
    if ((confidence[pixel] ?? 0) > HALF_FLOAT_EPSILON) {
      continue;
    }
    expect(
      Math.abs((composite[pixel * 3] ?? 0) - (base[pixel * 3] ?? 0)),
    ).toBeLessThanOrEqual(HALF_FLOAT_EPSILON);
    expect(
      Math.abs((composite[pixel * 3 + 1] ?? 0) - (base[pixel * 3 + 1] ?? 0)),
    ).toBeLessThanOrEqual(HALF_FLOAT_EPSILON);
    expect(
      Math.abs((composite[pixel * 3 + 2] ?? 0) - (base[pixel * 3 + 2] ?? 0)),
    ).toBeLessThanOrEqual(HALF_FLOAT_EPSILON);
  }
});

test("accumulates inverse frame weight on a static hit and stays bounded", async ({
  page,
}) => {
  await openQaStage(page);
  const weights = await page.evaluate(async (cameraPose) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x4000_0000 });
    await harness.setCamera(cameraPose, { transition: "camera-cut" });
    await harness.setHostSceneForegroundFixture(false);
    await harness.setHostSceneCurrentSsrFixture(true);
    await harness.advanceTicks(8);
    const samples: Array<{
      readonly weight: string;
      readonly hit: string;
      readonly confidence: string;
      readonly input: string;
      readonly resetFrame: boolean;
    }> = [];
    for (let frame = 0; frame < 6; frame += 1) {
      const presented = await harness.present();
      samples.push({
        weight: (await harness.capture("ssr-history-frame-weight")).data,
        hit: (await harness.capture("ssr-hit")).data,
        confidence: (await harness.capture("ssr-confidence")).data,
        input: (await harness.capture("ssr-history-input-color")).data,
        resetFrame: presented.temporal.resetFrame,
      });
    }
    return samples;
  }, HIT_CAMERA);
  const first = weights[0];
  const last = weights[weights.length - 1];
  expect(first).toBeDefined();
  expect(last).toBeDefined();
  if (first === undefined || last === undefined) {
    throw new Error("History frame-weight samples are missing.");
  }
  const firstWeight = decodeFloat32(first.weight);
  const lastWeight = decodeFloat32(last.weight);
  const firstHit = decodeFloat32(first.hit);
  const lastHit = decodeFloat32(last.hit);
  const firstConfidence = decodeFloat32(first.confidence);
  const lastConfidence = decodeFloat32(last.confidence);
  const firstInput = decodeFloat32(first.input);
  const lastInput = decodeFloat32(last.input);
  const validHit = (
    hit: ArrayLike<number>,
    confidence: ArrayLike<number>,
    input: ArrayLike<number>,
    pixel: number,
  ): boolean => {
    const inputRed = input[pixel * 3] ?? Number.NaN;
    const inputGreen = input[pixel * 3 + 1] ?? Number.NaN;
    const inputBlue = input[pixel * 3 + 2] ?? Number.NaN;
    return (
      (hit[pixel] ?? 0) > HALF_FLOAT_EPSILON &&
      (confidence[pixel] ?? 0) > HALF_FLOAT_EPSILON &&
      Number.isFinite(inputRed) &&
      Number.isFinite(inputGreen) &&
      Number.isFinite(inputBlue)
    );
  };
  const stable: number[] = [];
  for (let pixel = 0; pixel < lastHit.length; pixel += 1) {
    if (
      validHit(firstHit, firstConfidence, firstInput, pixel) &&
      validHit(lastHit, lastConfidence, lastInput, pixel)
    ) {
      stable.push(pixel);
    }
  }
  expect(first.resetFrame).toBe(true);
  expect(last.resetFrame).toBe(false);
  expect(stable.length).toBeGreaterThan(0);
  const declined = stable.filter(
    (pixel) =>
      (lastWeight[pixel] ?? 1) < (firstWeight[pixel] ?? 0) - HALF_FLOAT_EPSILON,
  );
  expect(declined.length).toBeGreaterThan(0);
  expect(
    Math.min(...declined.map((pixel) => lastWeight[pixel] ?? 1)),
  ).toBeLessThan(1 - HALF_FLOAT_EPSILON);
  expect(lastWeight.every((value) => value >= 1 / 32 && value <= 1)).toBe(true);
});

test("keeps a black current hit instead of residual bright history", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ cameraPose, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x4000_0000 });
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      await harness.setCamera(cameraPose, { transition: "camera-cut" });
      await harness.setHostSceneForegroundFixture(false);
      await harness.setHostSceneCurrentSsrFixtureHotColor("magenta");
      await harness.setHostSceneCurrentSsrFixture(true);
      await harness.advanceTicks(16);
      await harness.present();
      await harness.setHostSceneCurrentSsrFixtureHotColor("black");
      const presentation = await harness.present();
      return {
        hit: (await harness.capture("ssr-hit")).data,
        color: (await harness.capture("ssr-color")).data,
        composite: (await harness.capture("ssr-composite-color")).data,
        base: (await harness.capture("reflection-base-color")).data,
        confidence: (await harness.capture("ssr-confidence")).data,
        compileCount: presentation.compileCount,
      };
    },
    { cameraPose: HIT_CAMERA, controls: SSR_CONTROLS },
  );
  const hits = decodeFloat32(result.hit);
  const color = decodeFloat32(result.color);
  const composite = decodeFloat32(result.composite);
  const confidence = decodeFloat32(result.confidence);
  const blackHits = hits
    .map((value, index) => ({ value, index }))
    .filter(
      ({ value, index }) =>
        value > HALF_FLOAT_EPSILON &&
        (color[index * 3] ?? 1) < 1e-3 &&
        (color[index * 3 + 1] ?? 1) < 1e-3 &&
        (color[index * 3 + 2] ?? 1) < 1e-3,
    );
  expect(blackHits.length).toBeGreaterThan(0);
  for (const { index } of blackHits) {
    if ((confidence[index] ?? 0) <= HALF_FLOAT_EPSILON) {
      continue;
    }
    expect(composite[index * 3] ?? 1).toBeLessThan(0.35);
    expect(composite[index * 3 + 1] ?? 1).toBeLessThan(0.35);
    expect(composite[index * 3 + 2] ?? 1).toBeLessThan(0.35);
  }
});

test("rejects offscreen history ghosts: confidence 0 composite equals base", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(async (cameraPose) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x4000_0000 });
    await harness.setCamera(cameraPose, { transition: "camera-cut" });
    await harness.setHostSceneForegroundFixture(false);
    await harness.setHostSceneCurrentSsrFixture(true);
    await harness.advanceTicks(8);
    await harness.present();
    return {
      confidence: (await harness.capture("ssr-confidence")).data,
      composite: (await harness.capture("ssr-composite-color")).data,
      base: (await harness.capture("reflection-base-color")).data,
    };
  }, OFFSCREEN_CAMERA);
  const confidence = decodeFloat32(result.confidence);
  const composite = decodeFloat32(result.composite);
  const base = decodeFloat32(result.base);
  expect(confidence.every((value) => value === 0)).toBe(true);
  expect(composite).toEqual(base);
});

test("rejects history residual after fixture disappear, continuous move, and restore", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ hitCamera, movedCamera, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const captureBuffers = async () => ({
        hit: (await harness.capture("ssr-hit")).data,
        confidence: (await harness.capture("ssr-confidence")).data,
        composite: (await harness.capture("ssr-composite-color")).data,
        base: (await harness.capture("reflection-base-color")).data,
        input: (await harness.capture("ssr-history-input-color")).data,
        history: (await harness.capture("ssr-history-color")).data,
        weight: (await harness.capture("ssr-history-frame-weight")).data,
      });
      await harness.reset({ seed: 0x4000_0000 });
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      await harness.setCamera(hitCamera, { transition: "camera-cut" });
      await harness.setHostSceneForegroundFixture(false);
      await harness.setHostSceneCurrentSsrFixtureHotColor("magenta");
      await harness.setHostSceneCurrentSsrFixture(true);
      await harness.advanceTicks(16);
      const primed = await harness.present();
      const prime = await captureBuffers();
      await harness.setHostSceneCurrentSsrFixture(false);
      const cleared = await harness.present();
      const disappeared = await captureBuffers();
      await harness.setCamera(movedCamera, { transition: "continuous" });
      const moved = await harness.present();
      const vacated = await captureBuffers();
      await harness.setHostSceneCurrentSsrFixture(true);
      const restored = await harness.present();
      return {
        primedReset: primed.temporal.resetFrame,
        clearedReset: cleared.temporal.resetFrame,
        movedReset: moved.temporal.resetFrame,
        restoredReset: restored.temporal.resetFrame,
        prime,
        disappeared,
        vacated,
        restored: await captureBuffers(),
      };
    },
    {
      hitCamera: HIT_CAMERA,
      movedCamera: {
        ...HIT_CAMERA,
        position: [2, 12, 20] as const,
      },
      controls: SSR_CONTROLS,
    },
  );
  expect(result.primedReset).toBe(true);
  expect(result.clearedReset).toBe(false);
  expect(result.movedReset).toBe(false);
  expect(result.restoredReset).toBe(false);
  const primeHit = decodeFloat32(result.prime.hit);
  const primeConfidence = decodeFloat32(result.prime.confidence);
  const primeHistory = decodeFloat32(result.prime.history);
  const disappearedHit = decodeFloat32(result.disappeared.hit);
  const disappearedConfidence = decodeFloat32(result.disappeared.confidence);
  const disappearedComposite = decodeFloat32(result.disappeared.composite);
  const disappearedBase = decodeFloat32(result.disappeared.base);
  const disappearedInput = decodeFloat32(result.disappeared.input);
  const disappearedHistory = decodeFloat32(result.disappeared.history);
  const disappearedWeight = decodeFloat32(result.disappeared.weight);
  const vacatedHit = decodeFloat32(result.vacated.hit);
  const vacatedConfidence = decodeFloat32(result.vacated.confidence);
  const vacatedComposite = decodeFloat32(result.vacated.composite);
  const vacatedBase = decodeFloat32(result.vacated.base);
  const vacatedInput = decodeFloat32(result.vacated.input);
  const vacatedHistory = decodeFloat32(result.vacated.history);
  const restoredHit = decodeFloat32(result.restored.hit);
  const restoredConfidence = decodeFloat32(result.restored.confidence);
  const restoredComposite = decodeFloat32(result.restored.composite);
  const restoredBase = decodeFloat32(result.restored.base);
  const restoredInput = decodeFloat32(result.restored.input);
  const restoredWeight = decodeFloat32(result.restored.weight);
  const disappearedVacated: number[] = [];
  const movedVacated: number[] = [];
  for (let pixel = 0; pixel < primeHit.length; pixel += 1) {
    const primed =
      (primeHit[pixel] ?? 0) > HALF_FLOAT_EPSILON &&
      (primeConfidence[pixel] ?? 0) > HALF_FLOAT_EPSILON &&
      magentaEnergy(primeHistory, pixel) > HALF_FLOAT_EPSILON;
    if (!primed) {
      continue;
    }
    if ((disappearedHit[pixel] ?? 1) <= HALF_FLOAT_EPSILON) {
      disappearedVacated.push(pixel);
    }
    if ((vacatedHit[pixel] ?? 1) <= HALF_FLOAT_EPSILON) {
      movedVacated.push(pixel);
    }
  }
  for (const pixel of disappearedVacated) {
    expect(disappearedConfidence[pixel] ?? 1).toBeLessThanOrEqual(
      HALF_FLOAT_EPSILON,
    );
    expect(
      linearRgbWithinHalfEpsilon(disappearedComposite, disappearedBase, pixel),
    ).toBe(true);
    expect(isBlackRgb(disappearedInput, pixel)).toBe(true);
    expect(disappearedWeight[pixel] ?? 0).toBeGreaterThan(0);
    expect(disappearedWeight[pixel] ?? 1).toBeLessThanOrEqual(1);
  }
  const disappearedHistoryResidual = disappearedVacated.filter(
    (pixel) => !isBlackRgb(disappearedHistory, pixel),
  ).length;
  const movedHistoryResidual = movedVacated.filter(
    (pixel) => !isBlackRgb(vacatedHistory, pixel),
  ).length;
  expect(
    disappearedVacated.length,
    `disappearedVacated=${disappearedVacated.length} historyResidual=${disappearedHistoryResidual}`,
  ).toBeGreaterThan(0);
  expect(
    movedVacated.length,
    `movedVacated=${movedVacated.length} historyResidual=${movedHistoryResidual}`,
  ).toBeGreaterThan(0);
  for (const pixel of movedVacated) {
    expect(vacatedConfidence[pixel] ?? 1).toBeLessThanOrEqual(
      HALF_FLOAT_EPSILON,
    );
    expect(
      linearRgbWithinHalfEpsilon(vacatedComposite, vacatedBase, pixel),
    ).toBe(true);
    expect(isBlackRgb(vacatedInput, pixel)).toBe(true);
  }
  const restoredStillVacated = movedVacated.filter(
    (pixel) => (restoredHit[pixel] ?? 1) <= HALF_FLOAT_EPSILON,
  );
  expect(restoredStillVacated.length).toBeGreaterThan(0);
  for (const pixel of restoredStillVacated) {
    expect(restoredConfidence[pixel] ?? 1).toBeLessThanOrEqual(
      HALF_FLOAT_EPSILON,
    );
    expect(
      linearRgbWithinHalfEpsilon(restoredComposite, restoredBase, pixel),
    ).toBe(true);
  }
  for (let pixel = 0; pixel < restoredConfidence.length; pixel += 1) {
    if ((restoredConfidence[pixel] ?? 1) > HALF_FLOAT_EPSILON) {
      continue;
    }
    expect(
      linearRgbWithinHalfEpsilon(restoredComposite, restoredBase, pixel),
    ).toBe(true);
  }
  expect(
    restoredHit.some(
      (value, pixel) =>
        value > HALF_FLOAT_EPSILON &&
        (restoredConfidence[pixel] ?? 0) > HALF_FLOAT_EPSILON &&
        magentaEnergy(restoredInput, pixel) > HALF_FLOAT_EPSILON,
    ),
  ).toBe(true);
  expect(restoredWeight.every((value) => value > 0 && value <= 1)).toBe(true);
});

test("camera-cut resets SSR history once and the next present is stable", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(async (cameraPose) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x4000_0000 });
    await harness.setCamera(cameraPose, { transition: "camera-cut" });
    await harness.setHostSceneCurrentSsrFixture(true);
    await harness.advanceTicks(8);
    const primed = await harness.present();
    await harness.setCamera(
      {
        ...cameraPose,
        position: [2, 12, 20],
      },
      { transition: "camera-cut" },
    );
    const cut = await harness.present();
    const cutHit = (await harness.capture("ssr-hit")).data;
    const cutInput = (await harness.capture("ssr-history-input-color")).data;
    const cutHistory = (await harness.capture("ssr-history-color")).data;
    const cutWeight = (await harness.capture("ssr-history-frame-weight")).data;
    const stable = await harness.present();
    return {
      primedEpoch: primed.temporal.historyEpoch,
      cutReason: cut.temporal.resetReason,
      cutReset: cut.temporal.resetFrame,
      cutEpoch: cut.temporal.historyEpoch,
      cutHit,
      cutInput,
      cutHistory,
      cutWeight,
      stableReason: stable.temporal.resetReason,
      stableReset: stable.temporal.resetFrame,
      stableEpoch: stable.temporal.historyEpoch,
      stableHit: (await harness.capture("ssr-hit")).data,
      stableWeight: (await harness.capture("ssr-history-frame-weight")).data,
    };
  }, HIT_CAMERA);
  expect(result.cutReset).toBe(true);
  expect(result.cutReason).toBe("camera-cut");
  expect(result.cutEpoch).toBe(result.primedEpoch + 1);
  assertResetHistoryReseed(
    decodeFloat32(result.cutHit),
    decodeFloat32(result.cutInput),
    decodeFloat32(result.cutHistory),
    decodeFloat32(result.cutWeight),
  );
  expect(result.stableReset).toBe(false);
  expect(result.stableReason).toBeNull();
  expect(result.stableEpoch).toBe(result.cutEpoch);
  assertStableHitWeightBelowOne(
    decodeFloat32(result.stableHit),
    decodeFloat32(result.stableWeight),
  );
});

test("updates history RGB on the same JS task after a current-color change", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(async (cameraPose) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x4000_0000 });
    await harness.setCamera(cameraPose, { transition: "camera-cut" });
    await harness.setHostSceneForegroundFixture(false);
    await harness.setHostSceneCurrentSsrFixtureHotColor("magenta");
    await harness.setHostSceneCurrentSsrFixture(true);
    await harness.advanceTicks(8);
    const first = await harness.present();
    const firstHistory = (await harness.capture("ssr-history-color")).data;
    await harness.setHostSceneCurrentSsrFixtureHotColor("black");
    const second = await harness.present();
    return {
      firstHistory,
      secondHistory: (await harness.capture("ssr-history-color")).data,
      firstCompile: first.compileCount,
      secondCompile: second.compileCount,
    };
  }, HIT_CAMERA);
  expect(result.secondHistory).not.toBe(result.firstHistory);
  expect(result.secondCompile).toBe(result.firstCompile);
});

test("simulation, origin, and sea-state resets each reseed SSR history once", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(async (cameraPose) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV17 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x4000_0000 });
    await harness.setCamera(cameraPose, { transition: "continuous" });
    await harness.setHostSceneCurrentSsrFixture(true);
    await harness.advanceTicks(8);
    const primed = await harness.present();
    await harness.reset({ seed: 0x4000_0000 });
    await harness.setCamera(cameraPose, { transition: "continuous" });
    const simulation = await harness.present();
    const simulationHit = (await harness.capture("ssr-hit")).data;
    const simulationInput = (await harness.capture("ssr-history-input-color"))
      .data;
    const simulationHistory = (await harness.capture("ssr-history-color")).data;
    const simulationWeight = (await harness.capture("ssr-history-frame-weight"))
      .data;
    const simulationStable = await harness.present();
    const simulationStableHit = (await harness.capture("ssr-hit")).data;
    const simulationStableWeight = (
      await harness.capture("ssr-history-frame-weight")
    ).data;
    await harness.setOrigin({ x: 24, z: -16 });
    const origin = await harness.present();
    const originHit = (await harness.capture("ssr-hit")).data;
    const originInput = (await harness.capture("ssr-history-input-color")).data;
    const originHistory = (await harness.capture("ssr-history-color")).data;
    const originWeight = (await harness.capture("ssr-history-frame-weight"))
      .data;
    const originStable = await harness.present();
    const originStableHit = (await harness.capture("ssr-hit")).data;
    const originStableWeight = (
      await harness.capture("ssr-history-frame-weight")
    ).data;
    await harness.updateArtisticControls(
      {
        waveStrength: 1.4,
        swellDrama: 1,
        directionality: 0,
        choppiness: 1,
        crestSharpness: 0,
        microDetail: 1,
        timeScale: 1,
        grazingReflection: 1,
        environmentReflection: 1,
        depthSeeThrough: 1,
        depthColoring: 1,
        inWaterGlow: 1,
        crestGlow: 1,
        whitecapAmount: 0,
        foamPersistence: 0,
        underwaterHaze: 1,
        underwaterTurbidity: 1,
        underwaterLightShafts: 1,
        underwaterColor: 1,
        underwaterExposure: 1,
      },
      { transition: "sea-state-cut" },
    );
    const sea = await harness.present();
    const seaHit = (await harness.capture("ssr-hit")).data;
    const seaInput = (await harness.capture("ssr-history-input-color")).data;
    const seaHistory = (await harness.capture("ssr-history-color")).data;
    const seaWeight = (await harness.capture("ssr-history-frame-weight")).data;
    const seaStable = await harness.present();
    return {
      primedEpoch: primed.temporal.historyEpoch,
      simulation: simulation.temporal,
      simulationHit,
      simulationInput,
      simulationHistory,
      simulationWeight,
      simulationStable: simulationStable.temporal,
      simulationStableHit,
      simulationStableWeight,
      origin: origin.temporal,
      originHit,
      originInput,
      originHistory,
      originWeight,
      originStable: originStable.temporal,
      originStableHit,
      originStableWeight,
      sea: sea.temporal,
      seaHit,
      seaInput,
      seaHistory,
      seaWeight,
      seaStable: seaStable.temporal,
      seaStableHit: (await harness.capture("ssr-hit")).data,
      seaStableWeight: (await harness.capture("ssr-history-frame-weight")).data,
    };
  }, HIT_CAMERA);
  expect(result.simulation).toEqual({
    historyEpoch: result.primedEpoch + 1,
    resetReason: "qa-reset",
    resetFrame: true,
  });
  assertResetHistoryReseed(
    decodeFloat32(result.simulationHit),
    decodeFloat32(result.simulationInput),
    decodeFloat32(result.simulationHistory),
    decodeFloat32(result.simulationWeight),
  );
  expect(result.simulationStable).toEqual({
    historyEpoch: result.simulation.historyEpoch,
    resetReason: null,
    resetFrame: false,
  });
  assertStableHitWeightBelowOne(
    decodeFloat32(result.simulationStableHit),
    decodeFloat32(result.simulationStableWeight),
  );
  expect(result.origin).toEqual({
    historyEpoch: result.simulation.historyEpoch + 1,
    resetReason: "origin-shift",
    resetFrame: true,
  });
  assertResetHistoryReseed(
    decodeFloat32(result.originHit),
    decodeFloat32(result.originInput),
    decodeFloat32(result.originHistory),
    decodeFloat32(result.originWeight),
  );
  expect(result.originStable).toEqual({
    historyEpoch: result.origin.historyEpoch,
    resetReason: null,
    resetFrame: false,
  });
  assertStableHitWeightBelowOne(
    decodeFloat32(result.originStableHit),
    decodeFloat32(result.originStableWeight),
  );
  expect(result.sea).toEqual({
    historyEpoch: result.origin.historyEpoch + 1,
    resetReason: "sea-state-cut",
    resetFrame: true,
  });
  assertResetHistoryReseed(
    decodeFloat32(result.seaHit),
    decodeFloat32(result.seaInput),
    decodeFloat32(result.seaHistory),
    decodeFloat32(result.seaWeight),
  );
  expect(result.seaStable).toEqual({
    historyEpoch: result.sea.historyEpoch,
    resetReason: null,
    resetFrame: false,
  });
  assertStableHitWeightBelowOne(
    decodeFloat32(result.seaStableHit),
    decodeFloat32(result.seaStableWeight),
  );
});
