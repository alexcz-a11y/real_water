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
const SEED = 0x22_330_003;
const IMPULSE_TICK = 60;
const DECAY_AGES = Object.freeze([0, 1, 30, 90, 179, 180, 181] as const);
const WETNESS_CONTROLS = Object.freeze({
  waveStrength: 1,
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
  whitecapAmount: 1,
  foamPersistence: 1,
  underwaterHaze: 1,
  underwaterTurbidity: 1,
  underwaterLightShafts: 1,
  underwaterColor: 1,
  underwaterExposure: 1,
}) satisfies ArtisticControls;
const BELOW_CAMERA = Object.freeze({
  projection: "perspective",
  position: [0, 12, -40] as const,
  target: [0, 8, -46] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 50,
  near: 0.1,
  far: 100,
}) satisfies QaCameraV1;
const EMERGED_CAMERA = Object.freeze({
  ...BELOW_CAMERA,
  position: [0, 30, -40] as const,
  target: [0, 20, -46] as const,
}) satisfies QaCameraV1;

test.describe.configure({ mode: "serial" });

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

async function captureEmergence(page: Page) {
  return page.evaluate(
    async ({ ages, belowCamera, controls, emergedCamera, seed, tick }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const captureFrame = async (age: number) => {
        const presentation = await harness.present();
        const [wetness, finalColor, caustics, particles, bubbles] =
          await Promise.all([
            harness.capture("lens-wetness"),
            harness.capture("final-color"),
            harness.capture("underwater-caustics"),
            harness.capture("underwater-particles"),
            harness.capture("underwater-bubbles"),
          ]);
        return {
          age,
          wetness,
          finalColor,
          otherT22: { bubbles, caustics, particles },
          presentation,
        };
      };
      const prepareCommonState = async () => {
        await harness.reset({ seed });
        await harness.advanceTicks(tick);
        await harness.setSeaLevel({ metres: 20 });
        await harness.updateArtisticControls(controls, {
          transition: "continuous",
        });
        await harness.setHostSceneForegroundFixture(false);
      };

      await prepareCommonState();
      await harness.setCamera(belowCamera, { transition: "continuous" });
      const dryBelow = await captureFrame(-1);

      await harness.setCamera(emergedCamera, { transition: "continuous" });
      const frames = [];
      let previousAge = 0;
      for (const age of ages) {
        if (age > previousAge) {
          await harness.advanceTicks(age - previousAge);
        }
        frames.push(await captureFrame(age));
        previousAge = age;
      }

      // Replay the same fixed-tick/camera sequence without ever committing a
      // below-water classification immediately before emergence. The two
      // above->crossing->above cycles reset TRAA at ages 0 and 1 just like the
      // wet path, while never producing a below->not-below wetness impulse.
      await prepareCommonState();
      await harness.setCamera(emergedCamera, { transition: "continuous" });
      await harness.present();
      await harness.setCamera(belowCamera, { transition: "continuous" });
      await harness.present();
      await harness.setCamera(emergedCamera, { transition: "continuous" });
      const dryFrames = [await captureFrame(0)];
      await harness.advanceTicks(1);
      await harness.setCamera(belowCamera, { transition: "continuous" });
      await harness.present();
      await harness.setCamera(emergedCamera, { transition: "continuous" });
      dryFrames.push(await captureFrame(1));
      previousAge = 1;
      for (const age of ages.slice(2)) {
        await harness.advanceTicks(age - previousAge);
        dryFrames.push(await captureFrame(age));
        previousAge = age;
      }
      return { dryBelow, dryFrames, frames };
    },
    {
      ages: DECAY_AGES,
      belowCamera: BELOW_CAMERA,
      controls: WETNESS_CONTROLS,
      emergedCamera: EMERGED_CAMERA,
      seed: SEED,
      tick: IMPULSE_TICK,
    },
  );
}

test("emergence alone creates deterministic wetness that decays to a finite dry identity", async ({
  page,
}, testInfo) => {
  test.slow();
  expect(Object.keys(WETNESS_CONTROLS)).toHaveLength(20);
  await openQaStage(page);
  const first = await captureEmergence(page);
  await openQaStage(page);
  const replay = await captureEmergence(page);

  expect(
    replay.frames.map(({ wetness, presentation }) => ({
      data: wetness.data,
      tick: presentation.tick,
      waterline: presentation.waterline,
    })),
  ).toEqual(
    first.frames.map(({ wetness, presentation }) => ({
      data: wetness.data,
      tick: presentation.tick,
      waterline: presentation.waterline,
    })),
  );

  const dryBelow = decodeFloat32(first.dryBelow.wetness.data);
  expect(first.dryBelow.presentation.waterline).toMatchObject({
    classification: "below",
    lensWetnessImpulse: false,
  });
  expect(dryBelow.every((value) => value === 0)).toBe(true);

  const decoded = first.frames.map(({ wetness }) =>
    decodeFloat32(wetness.data),
  );
  const dryDecoded = first.dryFrames.map(({ wetness }) =>
    decodeFloat32(wetness.data),
  );
  const impulse = requiredFrame(first.frames, 0);
  expect(impulse.presentation.waterline).toMatchObject({
    classification: "crossing",
    lensWetnessImpulse: true,
  });
  expect(impulse.wetness).toMatchObject({
    name: "lens-wetness",
    format: "r32float-lens-wetness",
    elementType: "float32",
    components: 1,
  });
  expect(impulse.wetness).not.toHaveProperty("outputs");
  expect(Math.max(...requiredFrame(decoded, 0))).toBeGreaterThan(0.05);

  const maxima = decoded.map((values) => Math.max(...values));
  const means = decoded.map(mean);
  expect(isMonotoneNonIncreasing(maxima)).toBe(true);
  expect(isMonotoneNonIncreasing(means)).toBe(true);
  expect(maxima[4]).toBeGreaterThan(0);
  expect(maxima[5]).toBe(0);
  expect(maxima[6]).toBe(0);
  for (const values of decoded) {
    expect(
      values.every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      ),
    ).toBe(true);
  }
  for (const [index, values] of dryDecoded.entries()) {
    expect(values.every((value) => value === 0)).toBe(true);
    expect(
      requiredFrame(first.dryFrames, index).presentation.waterline,
    ).toMatchObject({ lensWetnessImpulse: false });
  }

  const wetAtOne = requiredFrame(first.frames, 1);
  const dryAtOne = requiredFrame(first.dryFrames, 1);
  expect(wetAtOne.wetness.data).not.toBe(dryAtOne.wetness.data);
  expect(wetAtOne.otherT22.caustics.data).toBe(dryAtOne.otherT22.caustics.data);
  expect(wetAtOne.otherT22.particles.data).toBe(
    dryAtOne.otherT22.particles.data,
  );
  expect(wetAtOne.otherT22.bubbles.data).toBe(dryAtOne.otherT22.bubbles.data);

  for (let index = 1; index < first.frames.length; index += 1) {
    const wetAlpha = alphaBytes(
      decodeUint8(requiredFrame(first.frames, index).finalColor.data),
    );
    const dryAlpha = alphaBytes(
      decodeUint8(requiredFrame(first.dryFrames, index).finalColor.data),
    );
    expect(wetAlpha).toEqual(dryAlpha);
  }
  for (const age of [180, 181] as const) {
    const index = DECAY_AGES.indexOf(age);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(requiredFrame(first.frames, index).finalColor.data).toBe(
      requiredFrame(first.dryFrames, index).finalColor.data,
    );
  }

  for (const frame of [first.dryBelow, ...first.frames]) {
    const finalColor = decodeUint8(frame.finalColor.data);
    expect(blackPixelFraction(finalColor)).toBeLessThan(0.05);
    expect(frame.presentation.manifestHash).toBe(
      first.dryBelow.presentation.manifestHash,
    );
    expect(frame.presentation.compileCount).toBe(
      first.dryBelow.presentation.compileCount,
    );
    expect(frame.presentation.generation).toBe(
      first.dryBelow.presentation.generation,
    );
    expect(frame.presentation.prewarm.progress).toEqual(
      first.dryBelow.presentation.prewarm.progress,
    );
  }
  expect(
    requiredFrame(first.frames, 5).presentation.waterline.lensWetnessImpulse,
  ).toBe(false);

  await attachRegressionAcceptance(testInfo, page, {
    seed: impulse.presentation.seed,
    tick: impulse.presentation.tick,
    seaLevelMetres: 20,
    camera: EMERGED_CAMERA,
    controlRevision: impulse.presentation.controlRevision,
    coreManifest: coreManifestEvidence(impulse.presentation.prewarm.core),
    qaPrewarm: impulse.presentation.prewarm,
    captures: [
      { width: impulse.wetness.width, height: impulse.wetness.height },
    ],
    qaHarness: { schema: QA_HARNESS_SCHEMA, version: QA_HARNESS_VERSION },
    qaCapture: {
      schema: QA_CAPTURE_SCHEMA,
      version: QA_CAPTURE_VERSION,
      names: QA_HARNESS_CAPTURE_NAMES,
    },
    artisticControls: WETNESS_CONTROLS,
  });
});

function requiredFrame<T>(frames: readonly T[], index: number): T {
  const frame = frames[index];
  if (frame === undefined) {
    throw new Error(`Missing wetness frame ${String(index)}.`);
  }
  return frame;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function isMonotoneNonIncreasing(values: readonly number[]): boolean {
  return values.every(
    (value, index) => index === 0 || value <= (values[index - 1] ?? value),
  );
}

function alphaBytes(rgba: Uint8Array): Uint8Array {
  const alpha = new Uint8Array(rgba.length / 4);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    alpha[pixel] = rgba[pixel * 4 + 3] ?? 0;
  }
  return alpha;
}

function blackPixelFraction(rgba: Uint8Array): number {
  let blackPixels = 0;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if (
      (rgba[offset] ?? 0) + (rgba[offset + 1] ?? 0) + (rgba[offset + 2] ?? 0) <=
      3
    ) {
      blackPixels += 1;
    }
  }
  return blackPixels / (rgba.length / 4);
}
