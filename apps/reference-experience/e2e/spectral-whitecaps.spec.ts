import { expect, test, type Page } from "@playwright/test";
import { createWaterPreset } from "real-water";
import type { QaCameraV1, QaHarnessV10 } from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32, decodeUint8 } from "./qa-capture-bytes.js";

const WHITE_CAP_CAMERA = {
  projection: "perspective" as const,
  position: [0, 18, 0] as const,
  target: [0, 0, 0] as const,
  up: [0, 0, -1] as const,
  verticalFovDegrees: 46,
  near: 0.1,
  far: 160,
} satisfies QaCameraV1;

const STORM_CONTROLS = createWaterPreset("storm").artisticControls;

test.describe.configure({ mode: "serial" });

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

test("captures deterministic nonzero spectral-whitecap generation at a fixed tick", async ({
  page,
}) => {
  await openQaStage(page);

  const result = await page.evaluate(
    async ({ camera, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const drive = async () => {
        await harness.reset({ seed: 0x5eed_cafe });
        await harness.updateArtisticControls(controls, {
          transition: "continuous",
        });
        await harness.advanceTicks(90);
        await harness.setCamera(camera, { transition: "continuous" });
        const presentation = await harness.present();
        return {
          presentation,
          generation: await harness.capture("whitecap-generation"),
        };
      };
      return { first: await drive(), replay: await drive() };
    },
    { camera: WHITE_CAP_CAMERA, controls: STORM_CONTROLS },
  );

  expect(result.first.presentation).toMatchObject({
    seed: 0x5eed_cafe,
    tick: 90,
    controlRevision: expect.any(Number),
  });
  expect(result.first.generation).toMatchObject({
    name: "whitecap-generation",
    format: "r32float-whitecap-stage",
    elementType: "float32",
    components: 1,
    width: 320,
    height: 180,
  });
  expect(result.replay.generation.data).toBe(result.first.generation.data);

  const generation = decodeFloat32(result.first.generation.data);
  const active = generation.filter((value) => value > 0.01);
  expect(active.length).toBeGreaterThan(100);
  expect(Math.max(...generation)).toBeGreaterThan(0.1);
  expect(new Set(generation).size).toBeGreaterThan(8);
});

test("spectral-whitecap density drives every prepared surface material response", async ({
  page,
}) => {
  await openQaStage(page);
  const controlsOff = {
    ...STORM_CONTROLS,
    whitecapAmount: 0,
    foamPersistence: 0,
  };
  const controlsOn = {
    ...STORM_CONTROLS,
    whitecapAmount: 2,
    foamPersistence: 2,
  };

  const result = await page.evaluate(
    async ({ camera, off, on }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x5eed_cafe });
      await harness.updateArtisticControls(off, { transition: "continuous" });
      await harness.advanceTicks(90);
      await harness.setCamera(camera, { transition: "continuous" });
      const offPresentation = await harness.present();
      const offCaptures = {
        decay: await harness.capture("whitecap-decay"),
        reflection: await harness.capture("optical-environment-reflection"),
        transmission: await harness.capture("optical-transmittance"),
        roughness: await harness.capture("ssr-roughness"),
        normal: await harness.capture("normal"),
        current: await harness.capture("current-color"),
      };

      const update = await harness.updateArtisticControls(on, {
        transition: "continuous",
      });
      await harness.advanceTicks(1);
      const onPresentation = await harness.present();
      const onCaptures = {
        decay: await harness.capture("whitecap-decay"),
        reflection: await harness.capture("optical-environment-reflection"),
        transmission: await harness.capture("optical-transmittance"),
        roughness: await harness.capture("ssr-roughness"),
        normal: await harness.capture("normal"),
        current: await harness.capture("current-color"),
      };
      return {
        offPresentation,
        onPresentation,
        offCaptures,
        onCaptures,
        update,
      };
    },
    { camera: WHITE_CAP_CAMERA, off: controlsOff, on: controlsOn },
  );

  expect(result.update).toMatchObject({ changed: true });
  expect(result.onPresentation).toMatchObject({
    manifestHash: result.offPresentation.manifestHash,
    compileCount: result.offPresentation.compileCount,
    probeCount: result.offPresentation.probeCount,
    temporal: {
      historyEpoch: result.offPresentation.temporal.historyEpoch,
      resetReason: null,
      resetFrame: false,
    },
  });

  const density = decodeFloat32(result.onCaptures.decay.data);
  const region = density.flatMap((value, index) =>
    value > 0.12 ? [index] : [],
  );
  expect(region.length).toBeGreaterThan(100);

  const offRoughness = decodeFloat32(result.offCaptures.roughness.data);
  const onRoughness = decodeFloat32(result.onCaptures.roughness.data);
  const offTransmission = decodeFloat32(result.offCaptures.transmission.data);
  const onTransmission = decodeFloat32(result.onCaptures.transmission.data);
  const offReflection = decodeFloat32(result.offCaptures.reflection.data);
  const onReflection = decodeFloat32(result.onCaptures.reflection.data);
  const offNormal = decodeFloat32(result.offCaptures.normal.data);
  const onNormal = decodeFloat32(result.onCaptures.normal.data);
  const offCurrent = decodeUint8(result.offCaptures.current.data);
  const onCurrent = decodeUint8(result.onCaptures.current.data);

  expect(meanDelta(region, onRoughness, offRoughness, 1)).toBeGreaterThan(0.08);
  expect(meanDelta(region, offTransmission, onTransmission, 1)).toBeGreaterThan(
    0.04,
  );
  expect(meanDelta(region, offReflection, onReflection, 1)).toBeGreaterThan(
    0.01,
  );
  expect(meanAbsDelta(region, onNormal, offNormal, 3)).toBeGreaterThan(0.01);
  expect(meanAbsDelta(region, onCurrent, offCurrent, 4)).toBeGreaterThan(4);
});

test("captures transported history and lets hot persistence control its decay", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ camera, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const captureStages = async () => ({
        generation: await harness.capture("whitecap-generation"),
        history: await harness.capture("whitecap-history"),
        advection: await harness.capture("whitecap-advection"),
        decay: await harness.capture("whitecap-decay"),
      });

      await harness.reset({ seed: 0x5eed_cafe });
      await harness.updateArtisticControls(
        { ...controls, whitecapAmount: 2, foamPersistence: 2 },
        { transition: "continuous" },
      );
      await harness.advanceTicks(30);
      await harness.setCamera(camera, { transition: "continuous" });
      const generatedPresentation = await harness.present();
      const generated = await captureStages();

      await harness.updateArtisticControls(
        { ...controls, whitecapAmount: 0, foamPersistence: 2 },
        { transition: "continuous" },
      );
      await harness.advanceTicks(1);
      const retainedPresentation = await harness.present();
      const retained = await captureStages();

      await harness.updateArtisticControls(
        { ...controls, whitecapAmount: 0, foamPersistence: 1 },
        { transition: "continuous" },
      );
      await harness.advanceTicks(6);
      const defaultPersistencePresentation = await harness.present();
      const defaultPersistence = await captureStages();

      await harness.updateArtisticControls(
        { ...controls, whitecapAmount: 0, foamPersistence: 0 },
        { transition: "continuous" },
      );
      await harness.advanceTicks(1);
      const clearedPresentation = await harness.present();
      const cleared = await captureStages();
      return {
        generatedPresentation,
        retainedPresentation,
        defaultPersistencePresentation,
        clearedPresentation,
        generated,
        retained,
        defaultPersistence,
        cleared,
      };
    },
    { camera: WHITE_CAP_CAMERA, controls: STORM_CONTROLS },
  );

  const generatedDecay = decodeFloat32(result.generated.decay.data);
  const retainedGeneration = decodeFloat32(result.retained.generation.data);
  const retainedHistory = decodeFloat32(result.retained.history.data);
  const retainedAdvection = decodeFloat32(result.retained.advection.data);
  const retainedDecay = decodeFloat32(result.retained.decay.data);
  const active = generatedDecay.flatMap((value, index) =>
    value > 0.12 ? [index] : [],
  );

  expect(active.length).toBeGreaterThan(100);
  expect(Math.max(...retainedGeneration)).toBeLessThan(1e-4);
  expect(meanAbsDelta(active, retainedHistory, generatedDecay, 1)).toBeLessThan(
    0.04,
  );
  expect(
    meanAbsDelta(active, retainedAdvection, retainedHistory, 1),
  ).toBeGreaterThan(0.0001);
  expect(meanValue(active, retainedDecay)).toBeGreaterThan(0.01);
  expect(meanValue(active, retainedHistory)).toBeGreaterThan(
    meanValue(active, retainedDecay),
  );
  expect(
    meanValue(active, decodeFloat32(result.defaultPersistence.decay.data)),
  ).toBeGreaterThan(meanValue(active, retainedDecay) * 0.5);
  expect(Math.max(...decodeFloat32(result.cleared.decay.data))).toBeLessThan(
    1e-4,
  );
  expect(result.retainedPresentation).toMatchObject({
    manifestHash: result.generatedPresentation.manifestHash,
    compileCount: result.generatedPresentation.compileCount,
    probeCount: result.generatedPresentation.probeCount,
    temporal: {
      historyEpoch: result.generatedPresentation.temporal.historyEpoch,
      resetReason: null,
      resetFrame: false,
    },
  });
  expect(result.clearedPresentation.temporal.historyEpoch).toBe(
    result.generatedPresentation.temporal.historyEpoch,
  );
  expect(result.defaultPersistencePresentation.temporal.historyEpoch).toBe(
    result.generatedPresentation.temporal.historyEpoch,
  );
});

test("keeps the world-domain whitecap field stable through continuous camera rotation", async ({
  page,
}) => {
  await openQaStage(page);
  const rotatedCamera = {
    ...WHITE_CAP_CAMERA,
    up: [1, 0, 0] as const,
  };
  const result = await page.evaluate(
    async ({ firstCamera, secondCamera, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x5eed_cafe });
      await harness.updateArtisticControls(
        { ...controls, whitecapAmount: 2, foamPersistence: 2 },
        { transition: "continuous" },
      );
      await harness.advanceTicks(90);
      await harness.setCamera(firstCamera, { transition: "continuous" });
      const firstPresentation = await harness.present();
      const first = await harness.capture("whitecap-decay");
      await harness.setCamera(secondCamera, { transition: "continuous" });
      const secondPresentation = await harness.present();
      const second = await harness.capture("whitecap-decay");
      return { firstPresentation, secondPresentation, first, second };
    },
    {
      firstCamera: WHITE_CAP_CAMERA,
      secondCamera: rotatedCamera,
      controls: STORM_CONTROLS,
    },
  );

  expect(result.secondPresentation).toMatchObject({
    tick: result.firstPresentation.tick,
    manifestHash: result.firstPresentation.manifestHash,
    controlRevision: result.firstPresentation.controlRevision,
    cameraCutRevision: result.firstPresentation.cameraCutRevision,
    temporal: {
      historyEpoch: result.firstPresentation.temporal.historyEpoch,
      resetReason: null,
      resetFrame: false,
    },
  });
  const first = decodeFloat32(result.first.data);
  const second = decodeFloat32(result.second.data);
  const comparison = compareQuarterTurn(
    first,
    second,
    result.first.width,
    result.first.height,
    64,
  );
  expect(comparison.activeSamples).toBeGreaterThan(100);
  expect(comparison.meanAbs).toBeLessThan(0.015);
  expect(comparison.p95Abs).toBeLessThan(0.05);
});

function meanDelta(
  pixels: readonly number[],
  minuend: ArrayLike<number>,
  subtrahend: ArrayLike<number>,
  components: number,
): number {
  let total = 0;
  for (const pixel of pixels) {
    total +=
      (minuend[pixel * components] ?? 0) -
      (subtrahend[pixel * components] ?? 0);
  }
  return total / Math.max(1, pixels.length);
}

function meanAbsDelta(
  pixels: readonly number[],
  left: ArrayLike<number>,
  right: ArrayLike<number>,
  components: number,
): number {
  let total = 0;
  for (const pixel of pixels) {
    for (let component = 0; component < components; component += 1) {
      total += Math.abs(
        (left[pixel * components + component] ?? 0) -
          (right[pixel * components + component] ?? 0),
      );
    }
  }
  return total / Math.max(1, pixels.length * components);
}

function meanValue(
  pixels: readonly number[],
  values: ArrayLike<number>,
): number {
  let total = 0;
  for (const pixel of pixels) {
    total += values[pixel] ?? 0;
  }
  return total / Math.max(1, pixels.length);
}

function compareQuarterTurn(
  first: Float32Array,
  second: Float32Array,
  width: number,
  height: number,
  radius: number,
): Readonly<{
  activeSamples: number;
  meanAbs: number;
  p95Abs: number;
}> {
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const differences: number[] = [];
  let activeSamples = 0;
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const firstX = centerX + offsetX;
      const firstY = centerY + offsetY;
      const secondX = centerX + offsetY;
      const secondY = centerY - offsetX;
      const firstValue = first[firstY * width + firstX] ?? 0;
      const secondValue = second[secondY * width + secondX] ?? 0;
      if (firstValue > 0.01 || secondValue > 0.01) {
        activeSamples += 1;
      }
      differences.push(Math.abs(firstValue - secondValue));
    }
  }
  differences.sort((left, right) => left - right);
  return {
    activeSamples,
    meanAbs:
      differences.reduce((sum, value) => sum + value, 0) /
      Math.max(1, differences.length),
    p95Abs:
      differences[Math.floor((differences.length - 1) * 0.95)] ??
      Number.POSITIVE_INFINITY,
  };
}
