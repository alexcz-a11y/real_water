import { expect, test, type Page } from "@playwright/test";
import type { ArtisticControls } from "real-water";
import {
  QA_CAPTURE_SCHEMA,
  QA_CAPTURE_VERSION,
  QA_HARNESS_CAPTURE_NAMES,
  QA_HARNESS_SCHEMA,
  QA_HARNESS_VERSION,
  type QaCameraV1,
  type QaHarness,
  type QaPresentationReceiptV17,
} from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32 } from "./qa-capture-bytes.js";
import {
  attachRegressionAcceptance,
  coreManifestEvidence,
} from "./regression-acceptance.js";

const VIEWPORT = { width: 320, height: 180 } as const;
const SEED = 0x22_330_002;
const VISUAL_TICK = 60;
const PRESSURE_TICK = 80;
const HIGH_SEA_CONTROLS = Object.freeze({
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
const OCCLUSION_CAMERA = Object.freeze({
  projection: "perspective",
  position: [-14, 12, -40] as const,
  target: [-14, 0, -40] as const,
  up: [0, 0, -1] as const,
  verticalFovDegrees: 40,
  near: 0.05,
  far: 100,
}) satisfies QaCameraV1;
const PRESSURE_CAMERA = Object.freeze({
  projection: "perspective",
  position: [0, -5, 100] as const,
  target: [0, -5, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 90,
  near: 0.1,
  far: 300,
}) satisfies QaCameraV1;

type SecondaryParticlesReceipt = QaPresentationReceiptV17["secondaryParticles"];

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

test("replays independent bounded tracer AOVs and soft-fades them against scene depth", async ({
  page,
}, testInfo) => {
  test.slow();
  expect(Object.keys(HIGH_SEA_CONTROLS)).toHaveLength(20);
  await openQaStage(page);

  const captureAt = async (foregroundVisible: boolean) =>
    page.evaluate(
      async ({ camera, controls, foreground, seed, tick }) => {
        const harness = window.__REAL_WATER_QA__ as QaHarness | undefined;
        if (harness === undefined) {
          throw new Error("QA Harness is unavailable.");
        }
        await harness.reset({ seed });
        await harness.advanceTicks(tick);
        await harness.setSeaLevel({ metres: 20 });
        await harness.updateArtisticControls(controls, {
          transition: "continuous",
        });
        await harness.updateInteractionAnchor({ x: -16, z: -40 });
        await harness.setHostSceneForegroundFixture(foreground);
        await harness.setCamera(camera, { transition: "camera-cut" });
        await harness.submitDisturbances({
          kind: "radial-impact",
          count: 1,
          ids: Uint32Array.of(0x2233),
          positions: Float32Array.of(-16, 20, -40),
          radii: Float32Array.of(4),
          amplitudes: Float32Array.of(0.5),
          priorities: Uint8Array.of(255),
        });
        const presentation = await harness.present();
        const [particles, bubbles, depth] = await Promise.all([
          harness.capture("underwater-particles"),
          harness.capture("underwater-bubbles"),
          harness.capture("depth"),
        ]);
        return { particles, bubbles, depth, presentation };
      },
      {
        camera: OCCLUSION_CAMERA,
        controls: HIGH_SEA_CONTROLS,
        foreground: foregroundVisible,
        seed: SEED,
        tick: VISUAL_TICK,
      },
    );

  const open = await captureAt(false);
  const replay = await captureAt(false);
  const occluded = await captureAt(true);

  expect(replay.particles.data).toBe(open.particles.data);
  expect(replay.bubbles.data).toBe(open.bubbles.data);
  expect(replay.depth.data).toBe(open.depth.data);
  expect(replay.presentation.secondaryParticles).toEqual(
    open.presentation.secondaryParticles,
  );
  expect(open.particles).toMatchObject({
    name: "underwater-particles",
    format: "r32float-underwater-particles",
    elementType: "float32",
    components: 1,
  });
  expect(open.bubbles).toMatchObject({
    name: "underwater-bubbles",
    format: "r32float-underwater-bubbles",
    elementType: "float32",
    components: 1,
  });

  const openParticles = decodeFloat32(open.particles.data);
  const openBubbles = decodeFloat32(open.bubbles.data);
  const occludedParticles = decodeFloat32(occluded.particles.data);
  const occludedBubbles = decodeFloat32(occluded.bubbles.data);
  for (const values of [
    openParticles,
    openBubbles,
    occludedParticles,
    occludedBubbles,
  ]) {
    expect(
      values.every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      ),
    ).toBe(true);
  }
  expect(Math.max(...openParticles)).toBeGreaterThan(0);
  expect(Math.max(...openBubbles)).toBeGreaterThan(0);

  const openDepth = decodeFloat32(open.depth.data);
  const occludedDepth = decodeFloat32(occluded.depth.data);
  const changedDepthPixels = Array.from(openDepth.keys()).filter(
    (pixel) => (occludedDepth[pixel] ?? 0) + 0.5 < (openDepth[pixel] ?? 0),
  );
  expect(changedDepthPixels.length).toBeGreaterThan(
    VIEWPORT.width * VIEWPORT.height * 0.05,
  );
  const openSignal = changedDepthPixels.map(
    (pixel) => (openParticles[pixel] ?? 0) + (openBubbles[pixel] ?? 0),
  );
  const occludedSignal = changedDepthPixels.map(
    (pixel) => (occludedParticles[pixel] ?? 0) + (occludedBubbles[pixel] ?? 0),
  );
  expect(maximumDifference(openSignal, occludedSignal)).toBeGreaterThan(1e-4);
  expect(mean(openSignal)).toBeGreaterThan(mean(occludedSignal));

  expect(occluded.presentation.manifestHash).toBe(
    open.presentation.manifestHash,
  );
  expect(occluded.presentation.compileCount).toBe(
    open.presentation.compileCount,
  );
  expect(occluded.presentation.prewarm.progress).toEqual(
    open.presentation.prewarm.progress,
  );

  await attachRegressionAcceptance(testInfo, page, {
    seed: open.presentation.seed,
    tick: open.presentation.tick,
    seaLevelMetres: 20,
    camera: OCCLUSION_CAMERA,
    controlRevision: open.presentation.controlRevision,
    coreManifest: coreManifestEvidence(open.presentation.prewarm.core),
    qaPrewarm: open.presentation.prewarm,
    captures: [
      { width: open.particles.width, height: open.particles.height },
      { width: open.bubbles.width, height: open.bubbles.height },
    ],
    qaHarness: { schema: QA_HARNESS_SCHEMA, version: QA_HARNESS_VERSION },
    qaCapture: {
      schema: QA_CAPTURE_SCHEMA,
      version: QA_CAPTURE_VERSION,
      names: QA_HARNESS_CAPTURE_NAMES,
    },
    artisticControls: HIGH_SEA_CONTROLS,
  });
});

test("drives genuine four-consumer pressure and permanently suppresses pressure-retired rising lifecycles", async ({
  page,
}, testInfo) => {
  test.slow();
  expect(Object.keys(HIGH_SEA_CONTROLS)).toHaveLength(20);
  await openQaStage(page);

  const result = await page.evaluate(
    async ({ camera, controls, seed, tick }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarness | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const run = async () => {
        await harness.reset({ seed });
        await harness.advanceTicks(tick);
        await harness.setSeaLevel({ metres: 0 });
        await harness.updateArtisticControls(controls, {
          transition: "continuous",
        });
        await harness.updateInteractionAnchor({ x: 0, z: 0 });
        await harness.setHostSceneForegroundFixture(false);
        await harness.setCamera(camera, { transition: "camera-cut" });
        const ids = new Uint32Array(16);
        const positions = new Float32Array(16 * 3);
        const radii = new Float32Array(16);
        const amplitudes = new Float32Array(16);
        const priorities = new Uint8Array(16);
        for (let index = 0; index < 16; index += 1) {
          ids[index] = 0x3300 + index;
          positions[index * 3] = index * 0.5;
          positions[index * 3 + 1] = 0;
          positions[index * 3 + 2] = -index * 0.25;
          radii[index] = 2 + index * 0.1;
          amplitudes[index] = 0.5;
          priorities[index] = 255 - index;
        }
        const disturbance = await harness.submitDisturbances({
          kind: "radial-impact",
          count: 16,
          ids,
          positions,
          radii,
          amplitudes,
          priorities,
        });
        const firstPresentation = await harness.present();
        const particles = await harness.capture("underwater-particles");
        await harness.advanceTicks(1);
        const nextPresentation = await harness.present();
        return {
          disturbance,
          firstPresentation,
          nextPresentation,
          capture: { width: particles.width, height: particles.height },
        };
      };
      return { first: await run(), replay: await run() };
    },
    {
      camera: PRESSURE_CAMERA,
      controls: HIGH_SEA_CONTROLS,
      seed: SEED,
      tick: PRESSURE_TICK,
    },
  );

  expect(result.first.disturbance.acceptedDisturbanceIds).toHaveLength(16);
  expect(result.first.disturbance.droppedDisturbanceIds).toEqual([]);
  expect(result.replay.disturbance).toEqual(result.first.disturbance);
  expect(result.replay.firstPresentation.secondaryParticles).toEqual(
    result.first.firstPresentation.secondaryParticles,
  );
  expect(result.replay.nextPresentation.secondaryParticles).toEqual(
    result.first.nextPresentation.secondaryParticles,
  );

  const first = result.first.firstPresentation.secondaryParticles;
  expectPressureReceipt(first);
  const next = result.first.nextPresentation.secondaryParticles;
  expectPressureReceipt(next);
  const rising = requiredConsumer(next, "rising-bubbles");
  expect(rising.lifecycleReentryForbidden).toBeGreaterThan(0);
  expect(rising.dropReasons.lifecycleReentryForbidden).toBe(
    rising.lifecycleReentryForbidden,
  );
  expect(rising.reentryCooldown).toBe(0);

  await attachRegressionAcceptance(testInfo, page, {
    seed: result.first.firstPresentation.seed,
    tick: result.first.firstPresentation.tick,
    seaLevelMetres: 0,
    camera: PRESSURE_CAMERA,
    controlRevision: result.first.firstPresentation.controlRevision,
    coreManifest: coreManifestEvidence(
      result.first.firstPresentation.prewarm.core,
    ),
    qaPrewarm: result.first.firstPresentation.prewarm,
    captures: [result.first.capture],
    qaHarness: { schema: QA_HARNESS_SCHEMA, version: QA_HARNESS_VERSION },
    qaCapture: {
      schema: QA_CAPTURE_SCHEMA,
      version: QA_CAPTURE_VERSION,
      names: QA_HARNESS_CAPTURE_NAMES,
    },
    artisticControls: HIGH_SEA_CONTROLS,
  });
});

function expectPressureReceipt(receipt: SecondaryParticlesReceipt): void {
  expect(receipt).toMatchObject({
    capacity: 131_072,
    maximumCandidateCount: 147_456,
    requested: 147_456,
    retained: 131_072,
    overSubscribed: true,
  });
  expect(receipt.thinned).toBeGreaterThan(0);
  for (const [consumerId, requested, floor] of [
    ["spray-droplet-mist", 65_536, 2_048],
    ["underwater-suspended-particles", 49_152, 2_048],
    ["subsurface-foam-bubble-cloud", 24_576, 1_024],
    ["rising-bubbles", 8_192, 256],
  ] as const) {
    const consumer = requiredConsumer(receipt, consumerId);
    expect(consumer.requested).toBe(requested);
    expect(consumer.minimumRetainedSlots).toBe(floor);
    expect(consumer.retainedByFloor).toBe(floor);
    expect(consumer.retained).toBeGreaterThanOrEqual(floor);
  }
}

function requiredConsumer(
  receipt: SecondaryParticlesReceipt,
  consumerId: string,
): SecondaryParticlesReceipt["consumers"][number] {
  const consumer = receipt.consumers.find(
    (candidate) => candidate.consumerId === consumerId,
  );
  if (consumer === undefined) {
    throw new Error(`Missing secondary-particle consumer ${consumerId}.`);
  }
  return consumer;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function maximumDifference(
  left: readonly number[],
  right: readonly number[],
): number {
  let maximum = 0;
  for (let index = 0; index < left.length; index += 1) {
    maximum = Math.max(
      maximum,
      Math.abs((left[index] ?? 0) - (right[index] ?? 0)),
    );
  }
  return maximum;
}
