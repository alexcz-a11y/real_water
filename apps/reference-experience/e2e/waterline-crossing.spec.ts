import { expect, test, type Page } from "@playwright/test";
import type { ArtisticControls } from "real-water";
import {
  QA_CAPTURE_SCHEMA,
  QA_CAPTURE_VERSION,
  QA_HARNESS_CAPTURE_NAMES,
  QA_HARNESS_SCHEMA,
  QA_HARNESS_VERSION,
  type QaCameraV1,
  type QaHarnessV16,
} from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32, decodeUint8 } from "./qa-capture-bytes.js";
import {
  attachRegressionAcceptance,
  coreManifestEvidence,
} from "./regression-acceptance.js";

const VIEWPORT = { width: 320, height: 180 } as const;
const SEED = 0x4000_0000;
const TICK = 30;
const WATERLINE_CONTROLS = Object.freeze({
  waveStrength: 2,
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
  // Zero, like every other spec that is not about foam: #31 wrote this literal
  // before the whitecap controls existed, so zero is what it actually measured.
  whitecapAmount: 0,
  foamPersistence: 0,
  underwaterHaze: 1,
  underwaterTurbidity: 1,
  underwaterLightShafts: 1,
  underwaterColor: 1,
  underwaterExposure: 1,
}) satisfies ArtisticControls;

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

test("renders a stable non-black underside and bounds crossing rejection", async ({
  page,
}, testInfo) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ controls, seed, tick }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed });
      await harness.advanceTicks(tick);
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      await harness.setHostScenePlanarReflectionFixture(true);
      await harness.setHostSceneCurrentSsrFixture(true);
      const initialCamera = {
        projection: "perspective" as const,
        position: [0.7, 12, 0] as const,
        target: [0.7, 0, -6] as const,
        up: [0, 1, 0] as const,
        verticalFovDegrees: 50,
        near: 0.1,
        far: 100,
      } satisfies QaCameraV1;
      await harness.setCamera(initialCamera, { transition: "continuous" });
      await harness.present();
      const query = await harness.queryGameplay([0.7, 0, 0]);

      const presentAt = async (offsetMetres: number) => {
        const camera = {
          ...initialCamera,
          position: [0.7, query.height + offsetMetres, 0] as const,
          target: [0.7, query.height, -6] as const,
        } satisfies QaCameraV1;
        await harness.setCamera(camera, { transition: "continuous" });
        const presentation = await harness.present();
        return {
          camera,
          presentation,
          finalColor: (await harness.capture("final-color")).data,
          currentColor: (await harness.capture("current-color")).data,
          waterline: (await harness.capture("waterline")).data,
          rejection: (await harness.capture("history-rejection")).data,
          fresnel: (await harness.capture("optical-fresnel")).data,
          planar: (await harness.capture("planar-target-alpha")).data,
          motion: (await harness.capture("motion-vector")).data,
          reflectionBase: (await harness.capture("reflection-base-color")).data,
          reflectionComposite: (await harness.capture("ssr-composite-color"))
            .data,
          confidence: (await harness.capture("ssr-confidence")).data,
          hit: (await harness.capture("ssr-hit")).data,
          history: (await harness.capture("ssr-history-color")).data,
          historyInput: (await harness.capture("ssr-history-input-color")).data,
          historyWeight: (await harness.capture("ssr-history-frame-weight"))
            .data,
          underwaterTransmittance: (
            await harness.capture("underwater-transmittance")
          ).data,
          underwaterScattering: (await harness.capture("underwater-scattering"))
            .data,
        };
      };

      const above = await presentAt(0.5);
      const crossing = await presentAt(0.05);
      const crossingBelow = await presentAt(-0.05);
      const below = await presentAt(-0.5);
      const stableBelow = await presentAt(-0.45);
      return { query, above, crossing, crossingBelow, below, stableBelow };
    },
    { controls: WATERLINE_CONTROLS, seed: SEED, tick: TICK },
  );

  expect(result.query.height).toBeGreaterThan(1);
  expect(result.above.presentation.waterline.classification).toBe("above");
  expect(result.crossing.presentation.waterline.classification).toBe(
    "crossing",
  );
  expect(result.below.presentation.waterline).toMatchObject({
    classification: "below",
    submersion: 1,
  });
  expect(result.crossing.presentation.temporal.resetReason).toBe(
    "waterline-crossing",
  );
  expect(result.crossingBelow.presentation).toMatchObject({
    waterline: { classification: "crossing" },
    temporal: { resetReason: null, resetFrame: false },
  });
  expect(result.below.presentation.temporal.resetReason).toBe(
    "waterline-crossing",
  );
  expect(result.stableBelow.presentation.temporal).toMatchObject({
    resetReason: null,
    resetFrame: false,
  });

  const crossingBelowTransmittance = decodeFloat32(
    result.crossingBelow.underwaterTransmittance,
  );
  const crossingBelowScattering = decodeFloat32(
    result.crossingBelow.underwaterScattering,
  );
  expect(meanHorizontalBand(crossingBelowTransmittance, "air")).toBeGreaterThan(
    meanHorizontalBand(crossingBelowTransmittance, "water") + 0.05,
  );
  expect(meanHorizontalBand(crossingBelowScattering, "water")).toBeGreaterThan(
    meanHorizontalBand(crossingBelowScattering, "air") + 0.05,
  );

  const belowWaterline = decodeFloat32(result.below.waterline);
  const belowRejection = decodeFloat32(result.below.rejection);
  const crossingRejection = decodeFloat32(result.crossing.rejection);
  const stableRejection = decodeFloat32(result.stableBelow.rejection);
  const belowFresnel = decodeFloat32(result.below.fresnel);
  const belowPlanar = decodeFloat32(result.below.planar);
  const crossingPlanar = decodeFloat32(result.crossing.planar);
  const belowMotion = decodeFloat32(result.below.motion);
  const belowFinal = decodeUint8(result.below.finalColor);
  const waterPixels = Array.from(belowWaterline.keys()).filter(
    (pixel) => (belowWaterline[pixel] ?? 0) > 0.5,
  );
  expect(waterPixels.length).toBeGreaterThan(VIEWPORT.width);
  expect(belowMotion.every((value) => Number.isFinite(value))).toBe(true);
  expect(Math.max(...crossingPlanar)).toBeGreaterThan(0);
  expect(Math.max(...belowPlanar)).toBe(0);
  expect(
    waterPixels.every(
      (pixel) =>
        Math.abs((belowRejection[pixel] ?? 0) - (belowWaterline[pixel] ?? 0)) <=
        2 ** -10,
    ),
  ).toBe(true);
  expect(belowRejection.every((value) => value === 1)).toBe(true);
  expect(crossingRejection.every((value) => value === 1)).toBe(true);
  expect(stableRejection.every((value) => value === 0)).toBe(true);
  expect(
    Math.max(...waterPixels.map((pixel) => belowFresnel[pixel] ?? 0)),
  ).toBeGreaterThan(0.95);
  const blackWaterPixels = waterPixels.filter((pixel) => {
    const offset = pixel * 4;
    return (
      (belowFinal[offset] ?? 0) +
        (belowFinal[offset + 1] ?? 0) +
        (belowFinal[offset + 2] ?? 0) <=
      3
    );
  });
  expect(blackWaterPixels.length / waterPixels.length).toBeLessThan(0.05);

  for (const frame of [result.crossing, result.below]) {
    const mask = decodeFloat32(frame.waterline);
    const resetPixels = Array.from(mask.keys()).filter(
      (pixel) => (mask[pixel] ?? 0) > 0.5,
    );
    const current = decodeUint8(frame.currentColor);
    const final = decodeUint8(frame.finalColor);
    const history = decodeFloat32(frame.history);
    const historyInput = decodeFloat32(frame.historyInput);
    const historyWeight = decodeFloat32(frame.historyWeight);
    const confidence = decodeFloat32(frame.confidence);
    const hit = decodeFloat32(frame.hit);
    const reflectionBase = decodeFloat32(frame.reflectionBase);
    const reflectionComposite = decodeFloat32(frame.reflectionComposite);
    let maxFinalCurrentDifference = 0;
    let maxHistoryInputDifference = 0;
    let maxMissFallbackDifference = 0;
    let maxHistoryWeightDifference = 0;
    let historyHitPixels = 0;
    for (const pixel of resetPixels) {
      for (let channel = 0; channel < 3; channel += 1) {
        maxFinalCurrentDifference = Math.max(
          maxFinalCurrentDifference,
          Math.abs(
            (final[pixel * 4 + channel] ?? 0) -
              (current[pixel * 4 + channel] ?? 0),
          ),
        );
        if ((hit[pixel] ?? 0) > 2 ** -10) {
          maxHistoryInputDifference = Math.max(
            maxHistoryInputDifference,
            Math.abs(
              (history[pixel * 3 + channel] ?? 0) -
                (historyInput[pixel * 3 + channel] ?? 0),
            ),
          );
        }
        if ((confidence[pixel] ?? 0) <= 2 ** -10) {
          maxMissFallbackDifference = Math.max(
            maxMissFallbackDifference,
            Math.abs(
              (reflectionComposite[pixel * 3 + channel] ?? 0) -
                (reflectionBase[pixel * 3 + channel] ?? 0),
            ),
          );
        }
      }
      if ((hit[pixel] ?? 0) > 2 ** -10) {
        historyHitPixels += 1;
        maxHistoryWeightDifference = Math.max(
          maxHistoryWeightDifference,
          Math.abs((historyWeight[pixel] ?? 0) - 1),
        );
      }
    }
    expect(historyHitPixels).toBeGreaterThan(0);
    expect(maxFinalCurrentDifference).toBeLessThanOrEqual(1);
    expect(maxHistoryInputDifference).toBeLessThanOrEqual(2 ** -10);
    expect(maxMissFallbackDifference).toBeLessThanOrEqual(2 ** -10);
    expect(maxHistoryWeightDifference).toBeLessThanOrEqual(2 ** -10);
  }

  await attachRegressionAcceptance(testInfo, page, {
    seed: result.below.presentation.seed,
    tick: result.below.presentation.tick,
    camera: result.below.camera,
    controlRevision: result.below.presentation.controlRevision,
    coreManifest: coreManifestEvidence(result.below.presentation.prewarm.core),
    qaPrewarm: result.below.presentation.prewarm,
    captures: [
      {
        width: result.below.presentation.prewarm.width,
        height: result.below.presentation.prewarm.height,
      },
    ],
    qaHarness: {
      schema: QA_HARNESS_SCHEMA,
      version: QA_HARNESS_VERSION,
    },
    qaCapture: {
      schema: QA_CAPTURE_SCHEMA,
      version: QA_CAPTURE_VERSION,
      names: QA_HARNESS_CAPTURE_NAMES,
    },
    artisticControls: WATERLINE_CONTROLS,
  });
});

function meanHorizontalBand(
  values: readonly number[],
  band: "air" | "water",
): number {
  const x0 = Math.floor(VIEWPORT.width * 0.1);
  const x1 = Math.ceil(VIEWPORT.width * 0.9);
  const y0 = Math.floor(VIEWPORT.height * (band === "air" ? 0.05 : 0.5));
  const y1 = Math.ceil(VIEWPORT.height * (band === "air" ? 0.25 : 0.7));
  let total = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      total += values[y * VIEWPORT.width + x] ?? 0;
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

test("keeps rendering, queries, and classification coherent at a nonzero sea level", async ({
  page,
}, testInfo) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ controls, seed, tick }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed });
      await harness.advanceTicks(tick);
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      await harness.setSeaLevel({ metres: 4 });
      const downCamera = {
        projection: "perspective" as const,
        position: [0.7, 12, 0] as const,
        target: [0.7, 4, 0] as const,
        up: [0, 0, -1] as const,
        verticalFovDegrees: 40,
        near: 0.1,
        far: 100,
      } satisfies QaCameraV1;
      await harness.setCamera(downCamera, { transition: "continuous" });
      const above = await harness.present();
      const depth = await harness.capture("depth");
      const query = await harness.queryGameplay([0.7, 0, 0]);
      const belowCamera = {
        ...downCamera,
        position: [0.7, query.height - 0.5, 0] as const,
        target: [0.7, query.height, -6] as const,
        up: [0, 1, 0] as const,
      } satisfies QaCameraV1;
      await harness.setCamera(belowCamera, { transition: "camera-cut" });
      const below = await harness.present();
      return {
        above,
        below,
        downCamera,
        depth: depth.data,
        width: depth.width,
        height: depth.height,
        query,
      };
    },
    { controls: WATERLINE_CONTROLS, seed: SEED, tick: TICK },
  );

  const depth = decodeFloat32(result.depth);
  const center =
    Math.floor(result.height / 2) * result.width + Math.floor(result.width / 2);
  const renderedHeight = result.downCamera.position[1] - (depth[center] ?? NaN);
  expect(result.query.height).toBeGreaterThan(4);
  expect(renderedHeight).toBeCloseTo(result.query.height, 1);
  expect(result.above).toMatchObject({
    seaLevelMetres: 4,
    waterline: {
      classification: "above",
    },
  });
  expect(result.above.waterline.surfaceHeightMetres).toBeCloseTo(
    result.query.height,
    5,
  );
  expect(result.below).toMatchObject({
    seaLevelMetres: 4,
    waterline: { classification: "below", submersion: 1 },
    temporal: { resetReason: "camera-cut", resetFrame: true },
  });

  await attachRegressionAcceptance(testInfo, page, {
    seed: result.above.seed,
    tick: result.above.tick,
    seaLevelMetres: 4,
    camera: result.downCamera,
    controlRevision: result.above.controlRevision,
    coreManifest: coreManifestEvidence(result.above.prewarm.core),
    qaPrewarm: result.above.prewarm,
    captures: [
      {
        width: result.above.prewarm.width,
        height: result.above.prewarm.height,
      },
    ],
    qaHarness: {
      schema: QA_HARNESS_SCHEMA,
      version: QA_HARNESS_VERSION,
    },
    qaCapture: {
      schema: QA_CAPTURE_SCHEMA,
      version: QA_CAPTURE_VERSION,
      names: QA_HARNESS_CAPTURE_NAMES,
    },
    artisticControls: WATERLINE_CONTROLS,
  });
});

test("replays repeated crossings and treats a teleport as one camera-cut reset", async ({
  page,
}, testInfo) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ controls, seed, tick }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const initialCamera = {
        projection: "perspective" as const,
        position: [0.7, 12, 0] as const,
        target: [0.7, 0, -6] as const,
        up: [0, 1, 0] as const,
        verticalFovDegrees: 50,
        near: 0.1,
        far: 100,
      } satisfies QaCameraV1;
      const cameraAt = (height: number, offsetMetres: number) =>
        ({
          ...initialCamera,
          position: [0.7, height + offsetMetres, 0] as const,
          target: [0.7, height, -6] as const,
        }) satisfies QaCameraV1;
      const resetAndQuery = async () => {
        await harness.reset({ seed });
        await harness.advanceTicks(tick);
        await harness.updateArtisticControls(controls, {
          transition: "continuous",
        });
        await harness.setCamera(initialCamera, { transition: "continuous" });
        await harness.present();
        return harness.queryGameplay([0.7, 0, 0]);
      };
      const captureFrame = async () => {
        const presentation = await harness.present();
        return {
          presentation,
          finalColor: (await harness.capture("final-color")).data,
          waterline: (await harness.capture("waterline")).data,
          depth: (await harness.capture("depth")).data,
          motion: (await harness.capture("motion-vector")).data,
          rejection: (await harness.capture("history-rejection")).data,
          reflection: (await harness.capture("ssr-composite-color")).data,
        };
      };
      const sha256 = async (value: string) => {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(value),
        );
        return Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
      };
      const path = [0.5, 0.05, -0.5, -0.05, 0.5, 0.05, -0.5] as const;
      const runPath = async () => {
        const query = await resetAndQuery();
        const frames = [];
        for (const offset of path) {
          await harness.setCamera(cameraAt(query.height, offset), {
            transition: "continuous",
          });
          frames.push(await captureFrame());
        }
        const first = frames[0];
        if (first === undefined) {
          throw new Error("The waterline replay path produced no frames.");
        }
        const normalized = await Promise.all(
          frames.map(async (frame) => ({
            classification: frame.presentation.waterline.classification,
            submersion: frame.presentation.waterline.submersion,
            transitionRevision:
              frame.presentation.waterline.transitionRevision -
              first.presentation.waterline.transitionRevision,
            lensWetnessImpulse: frame.presentation.waterline.lensWetnessImpulse,
            historyEpoch:
              frame.presentation.temporal.historyEpoch -
              first.presentation.temporal.historyEpoch,
            resetReason: frame.presentation.temporal.resetReason,
            resetFrame: frame.presentation.temporal.resetFrame,
            compileCount: frame.presentation.compileCount,
            finalColor: await sha256(frame.finalColor),
            waterline: await sha256(frame.waterline),
            depth: await sha256(frame.depth),
            motion: await sha256(frame.motion),
            rejection: await sha256(frame.rejection),
            reflection: await sha256(frame.reflection),
          })),
        );
        return {
          height: query.height,
          frames: normalized,
        };
      };

      const first = await runPath();
      const replay = await runPath();
      await harness.setCamera(cameraAt(replay.height, 0.5), {
        transition: "continuous",
      });
      await harness.present();
      await harness.present();
      await harness.setCamera(cameraAt(replay.height, -0.5), {
        transition: "camera-cut",
      });
      const teleportedBelow = await captureFrame();
      const stableBelow = await captureFrame();
      await harness.setCamera(cameraAt(replay.height, 0.5), {
        transition: "camera-cut",
      });
      const teleportedAbove = await captureFrame();
      const stableAbove = await captureFrame();
      return {
        first,
        replay,
        teleportedBelow,
        stableBelow,
        teleportedAbove,
        stableAbove,
      };
    },
    { controls: WATERLINE_CONTROLS, seed: SEED, tick: TICK },
  );

  expect(result.replay.frames).toEqual(result.first.frames);
  expect(
    result.first.frames.map(({ classification }) => classification),
  ).toEqual([
    "above",
    "crossing",
    "below",
    "crossing",
    "above",
    "crossing",
    "below",
  ]);
  expect(
    result.first.frames.map(({ lensWetnessImpulse }) => lensWetnessImpulse),
  ).toEqual([false, false, false, true, false, false, false]);
  expect(result.teleportedBelow.presentation).toMatchObject({
    waterline: { classification: "below", lensWetnessImpulse: false },
    temporal: { resetReason: "camera-cut", resetFrame: true },
  });
  expect(result.stableBelow.presentation.temporal).toMatchObject({
    resetReason: null,
    resetFrame: false,
  });
  expect(result.teleportedAbove.presentation).toMatchObject({
    waterline: { classification: "above", lensWetnessImpulse: true },
    temporal: { resetReason: "camera-cut", resetFrame: true },
  });
  expect(result.stableAbove.presentation.temporal).toMatchObject({
    resetReason: null,
    resetFrame: false,
  });
  const teleportRejection = decodeFloat32(result.teleportedAbove.rejection);
  expect(teleportRejection.every((value) => value === 1)).toBe(true);

  await attachRegressionAcceptance(testInfo, page, {
    seed: result.teleportedAbove.presentation.seed,
    tick: result.teleportedAbove.presentation.tick,
    camera: {
      projection: "perspective",
      position: [0.7, result.replay.height + 0.5, 0],
      target: [0.7, result.replay.height, -6],
      up: [0, 1, 0],
      verticalFovDegrees: 50,
      near: 0.1,
      far: 100,
    },
    controlRevision: result.teleportedAbove.presentation.controlRevision,
    coreManifest: coreManifestEvidence(
      result.teleportedAbove.presentation.prewarm.core,
    ),
    qaPrewarm: result.teleportedAbove.presentation.prewarm,
    captures: [
      {
        width: result.teleportedAbove.presentation.prewarm.width,
        height: result.teleportedAbove.presentation.prewarm.height,
      },
    ],
    qaHarness: {
      schema: QA_HARNESS_SCHEMA,
      version: QA_HARNESS_VERSION,
    },
    qaCapture: {
      schema: QA_CAPTURE_SCHEMA,
      version: QA_CAPTURE_VERSION,
      names: QA_HARNESS_CAPTURE_NAMES,
    },
    artisticControls: WATERLINE_CONTROLS,
  });
});
