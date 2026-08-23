import { expect, test, type Page } from "@playwright/test";
import { createWaterPreset } from "real-water";
import type { QaCameraV1, QaHarnessV13 } from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32 } from "./qa-capture-bytes.js";

const CAPTURE_WIDTH = 320;
const CAPTURE_HEIGHT = 180;
const SOURCE_EPSILON = 1e-5;
const FOAM_CAMERA: QaCameraV1 = {
  projection: "perspective",
  position: [0, 32, 0],
  target: [0, 0, 0],
  up: [0, 0, -1],
  verticalFovDegrees: 50,
  near: 0.1,
  far: 160,
};
const PROPELLER_CAMERA: QaCameraV1 = {
  ...FOAM_CAMERA,
  position: [0, 32, 8],
  target: [0, 0, 8],
};
const STORM_CONTROLS = createWaterPreset("storm").artisticControls;
const CHANGED_FOAM_CONTROLS = {
  ...STORM_CONTROLS,
  choppiness: 0.65,
  whitecapAmount: 0.9,
  foamPersistence: 0.55,
};

test.describe.configure({ mode: "serial" });

async function openQaStage(page: Page, proxyMode?: "propeller"): Promise<void> {
  await page.setViewportSize({
    width: CAPTURE_WIDTH,
    height: CAPTURE_HEIGHT,
  });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto(
    proxyMode === undefined
      ? "/?qa=1&host=three"
      : `/?qa=1&host=three&proxy=${proxyMode}`,
  );
  await expect(page.getByTestId("reference-stage")).toBeVisible();
}

test("preserves source-resolved deterministic foam after manual sources expire", async ({
  page,
}) => {
  await openQaStage(page);

  const result = await page.evaluate(
    async ({ camera, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV13 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }

      const wake = () => ({
        kind: "directional-wake" as const,
        count: 1,
        ids: Uint32Array.of(27_001),
        positions: Float32Array.of(-8, 0, -7),
        directions: Float32Array.of(0, 0, 1),
        radii: Float32Array.of(4),
        amplitudes: Float32Array.of(1.5),
        priorities: Uint8Array.of(180),
      });
      const impact = () => ({
        kind: "radial-impact" as const,
        count: 1,
        ids: Uint32Array.of(27_002),
        positions: Float32Array.of(8, 0, 0),
        radii: Float32Array.of(6),
        amplitudes: Float32Array.of(1.5),
        priorities: Uint8Array.of(200),
      });
      const summarizeScalarCapture = async (
        name:
          | "whitecap-generation"
          | "whitecap-history"
          | "whitecap-advection"
          | "whitecap-decay",
      ) => {
        const capture = await harness.capture(name);
        const binary = atob(capture.data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        const view = new DataView(bytes.buffer);
        let finite = bytes.byteLength % 4 === 0;
        let maximum = Number.NEGATIVE_INFINITY;
        for (let offset = 0; offset < bytes.byteLength; offset += 4) {
          const value = view.getFloat32(offset, true);
          finite = finite && Number.isFinite(value);
          maximum = Math.max(maximum, value);
        }
        return {
          name: capture.name,
          format: capture.format,
          elementType: capture.elementType,
          components: capture.components,
          width: capture.width,
          height: capture.height,
          sampleCount: bytes.byteLength / 4,
          finite,
          maximum,
        };
      };
      const drive = async (cadence: "batched" | "stepped") => {
        await harness.reset({ seed: 0x2700_0016 });
        await harness.updateArtisticControls(controls, {
          transition: "continuous",
        });
        await harness.updateInteractionAnchor({ x: 0, z: 0 });
        await harness.setCamera(camera, { transition: "continuous" });

        // Make tick 90 authoritative before submission so both manual sources
        // have an unambiguous start time independent of presentation cadence.
        await harness.advanceTicks(90);
        await harness.present();
        const wakeReceipt = await harness.submitDisturbances(wake());
        const impactReceipt = await harness.submitDisturbances(impact());

        // Age one second: both manual sources are active and have contributed
        // enough fixed ticks to the persistent local history.
        await harness.advanceTicks(60);
        const activePresentation = await harness.present();
        const active = await harness.capture("foam-source-identity");
        const legacy = [];
        for (const name of [
          "whitecap-generation",
          "whitecap-history",
          "whitecap-advection",
          "whitecap-decay",
        ] as const) {
          legacy.push(await summarizeScalarCapture(name));
        }

        // Reach age three seconds with the same fixed ticks and commands but
        // two presentation cadences. A correct source journal must not let the
        // final presentation cadence change generation or decay history.
        let expiredPresentation;
        if (cadence === "batched") {
          await harness.advanceTicks(120);
          await harness.setCamera(camera, { transition: "camera-cut" });
          expiredPresentation = await harness.present();
        } else {
          for (let step = 0; step < 4; step += 1) {
            await harness.advanceTicks(30);
            if (step === 3) {
              await harness.setCamera(camera, { transition: "camera-cut" });
            }
            expiredPresentation = await harness.present();
          }
        }
        if (expiredPresentation === undefined) {
          throw new Error("The expired foam state was not presented.");
        }
        const expired = await harness.capture("foam-source-identity");
        return {
          wakeReceipt,
          impactReceipt,
          activePresentation,
          expiredPresentation,
          active,
          expired,
          legacy,
        };
      };

      return {
        batched: await drive("batched"),
        replay: await drive("batched"),
        stepped: await drive("stepped"),
      };
    },
    { camera: FOAM_CAMERA, controls: STORM_CONTROLS },
  );

  expect(result.batched.wakeReceipt).toEqual({
    tick: 90,
    acceptedDisturbanceIds: [27_001],
    droppedDisturbanceIds: [],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 1,
  });
  expect(result.batched.impactReceipt).toEqual({
    tick: 90,
    acceptedDisturbanceIds: [27_002],
    droppedDisturbanceIds: [],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 2,
  });
  expect(result.replay.wakeReceipt).toEqual(result.batched.wakeReceipt);
  expect(result.replay.impactReceipt).toEqual(result.batched.impactReceipt);
  expect(result.stepped.wakeReceipt).toEqual(result.batched.wakeReceipt);
  expect(result.stepped.impactReceipt).toEqual(result.batched.impactReceipt);

  expect(result.batched.active).toMatchObject({
    name: "foam-source-identity",
    format: "rgba32float-foam-source-identity",
    elementType: "float32",
    components: 4,
    width: CAPTURE_WIDTH,
    height: CAPTURE_HEIGHT,
  });
  expectFoamCapturesIdentical(
    result.batched.active.data,
    result.replay.active.data,
  );
  expectFoamCapturesIdentical(
    result.batched.expired.data,
    result.replay.expired.data,
  );
  expectFoamCapturesIdentical(
    result.batched.active.data,
    result.stepped.active.data,
  );
  expectFoamCapturesIdentical(
    result.batched.expired.data,
    result.stepped.expired.data,
  );

  const active = summarizeFoamCapture(result.batched.active.data);
  const expired = summarizeFoamCapture(result.batched.expired.data);
  expectFoamCaptureWellFormed(active);
  expectFoamCaptureWellFormed(expired);
  for (const channel of active.channels) {
    expect(channel.nonZero).toBeGreaterThan(0);
    expect(channel.sum).toBeGreaterThan(SOURCE_EPSILON);
    expect(channel.maximum).toBeGreaterThan(SOURCE_EPSILON);
  }
  expect(active.spatialMad.whitecapWake).toBeGreaterThan(0.001);
  expect(active.spatialMad.whitecapImpact).toBeGreaterThan(0.001);
  expect(active.spatialMad.wakeImpact).toBeGreaterThan(0.001);
  expect(active.union.meanAbsoluteError).toBeLessThan(0.001);
  expect(active.union.maximumAbsoluteError).toBeLessThan(0.005);

  const activeLocalSum = active.channels[1].sum + active.channels[2].sum;
  const expiredLocalSum = expired.channels[1].sum + expired.channels[2].sum;
  expect(expired.channels[1].nonZero).toBeGreaterThan(0);
  expect(expired.channels[2].nonZero).toBeGreaterThan(0);
  expect(expiredLocalSum).toBeGreaterThan(SOURCE_EPSILON);
  expect(expiredLocalSum).toBeLessThan(activeLocalSum);

  expect(result.batched.activePresentation).toMatchObject({
    tick: 150,
    manifestHash: result.batched.expiredPresentation.manifestHash,
    compileCount: result.batched.expiredPresentation.compileCount,
    probeCount: result.batched.expiredPresentation.probeCount,
  });
  expect(result.batched.expiredPresentation.tick).toBe(270);
  expect(result.stepped.expiredPresentation.tick).toBe(270);
  expect(result.batched.legacy).toEqual(
    [
      "whitecap-generation",
      "whitecap-history",
      "whitecap-advection",
      "whitecap-decay",
    ].map((name) => ({
      name,
      format: "r32float-whitecap-stage",
      elementType: "float32",
      components: 1,
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
      sampleCount: CAPTURE_WIDTH * CAPTURE_HEIGHT,
      finite: true,
      maximum: expect.any(Number),
    })),
  );
});

test("applies continuous foam-control changes at the same tick regardless of presentation cadence", async ({
  page,
}) => {
  await openQaStage(page);

  const result = await page.evaluate(
    async ({ camera, initialControls, changedControls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV13 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }

      const wake = () => ({
        kind: "directional-wake" as const,
        count: 1,
        ids: Uint32Array.of(27_101),
        positions: Float32Array.of(-8, 0, -7),
        directions: Float32Array.of(0, 0, 1),
        radii: Float32Array.of(4),
        amplitudes: Float32Array.of(1.5),
        priorities: Uint8Array.of(180),
      });
      const impact = () => ({
        kind: "radial-impact" as const,
        count: 1,
        ids: Uint32Array.of(27_102),
        positions: Float32Array.of(8, 0, 0),
        radii: Float32Array.of(6),
        amplitudes: Float32Array.of(1.5),
        priorities: Uint8Array.of(200),
      });
      const drive = async (cadence: "batched" | "stepped") => {
        await harness.reset({ seed: 0x2700_c016 });
        await harness.updateArtisticControls(
          { ...initialControls },
          { transition: "continuous" },
        );
        await harness.updateInteractionAnchor({ x: 0, z: 0 });
        await harness.setCamera(camera, { transition: "continuous" });

        await harness.advanceTicks(90);
        const baseline = await harness.present();
        const wakeReceipt = await harness.submitDisturbances(wake());
        const impactReceipt = await harness.submitDisturbances(impact());

        const controlTick = await harness.advanceTicks(60);
        // QA advanceTicks queues work until present, so both routes establish
        // the same authoritative tick-150 command boundary before updating.
        const controlBoundary = await harness.present();
        const update = await harness.updateArtisticControls(
          { ...changedControls },
          { transition: "continuous" },
        );
        if (cadence === "stepped") {
          // Same-tick presentation records the new complete control snapshot
          // without evolving the fixed-tick field a second time.
          await harness.present();
          await harness.advanceTicks(30);
          await harness.present();
          await harness.advanceTicks(30);
        } else {
          await harness.advanceTicks(60);
        }

        await harness.setCamera(camera, { transition: "camera-cut" });
        const finalPresentation = await harness.present();
        const finalCapture = await harness.capture("foam-source-identity");
        return {
          baseline,
          wakeReceipt,
          impactReceipt,
          controlTick,
          controlBoundary,
          update,
          finalPresentation,
          finalCapture,
        };
      };

      return {
        batched: await drive("batched"),
        replay: await drive("batched"),
        stepped: await drive("stepped"),
      };
    },
    {
      camera: FOAM_CAMERA,
      initialControls: STORM_CONTROLS,
      changedControls: CHANGED_FOAM_CONTROLS,
    },
  );

  expect(result.batched.wakeReceipt).toEqual({
    tick: 90,
    acceptedDisturbanceIds: [27_101],
    droppedDisturbanceIds: [],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 1,
  });
  expect(result.batched.impactReceipt).toEqual({
    tick: 90,
    acceptedDisturbanceIds: [27_102],
    droppedDisturbanceIds: [],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 2,
  });
  expect(result.batched.update).toMatchObject({
    artisticControls: CHANGED_FOAM_CONTROLS,
    changed: true,
    transition: "continuous",
  });
  expect(result.batched.baseline.tick).toBe(90);
  expect(result.batched.controlTick.tick).toBe(150);
  expect(result.replay.controlTick.tick).toBe(150);
  expect(result.stepped.controlTick.tick).toBe(150);
  expect(result.batched.controlBoundary.tick).toBe(150);
  expect(result.replay.controlBoundary.tick).toBe(150);
  expect(result.stepped.controlBoundary.tick).toBe(150);
  expect(result.batched.finalPresentation).toMatchObject({
    tick: 210,
    manifestHash: result.stepped.finalPresentation.manifestHash,
    compileCount: result.stepped.finalPresentation.compileCount,
    probeCount: result.stepped.finalPresentation.probeCount,
  });
  expect(result.replay.finalPresentation.tick).toBe(210);
  expect(result.stepped.finalPresentation.tick).toBe(210);
  expect(result.batched.finalCapture).toMatchObject({
    name: "foam-source-identity",
    format: "rgba32float-foam-source-identity",
    elementType: "float32",
    components: 4,
    width: CAPTURE_WIDTH,
    height: CAPTURE_HEIGHT,
  });
  expectFoamCapturesIdentical(
    result.batched.finalCapture.data,
    result.replay.finalCapture.data,
  );
  expectFoamCapturesIdentical(
    result.batched.finalCapture.data,
    result.stepped.finalCapture.data,
  );

  const final = summarizeFoamCapture(result.batched.finalCapture.data);
  expectFoamCaptureWellFormed(final);
  for (const channel of final.channels) {
    expect(channel.nonZero).toBeGreaterThan(0);
    expect(channel.sum).toBeGreaterThan(SOURCE_EPSILON);
  }
  expect(final.union.meanAbsoluteError).toBeLessThan(0.001);
  expect(final.union.maximumAbsoluteError).toBeLessThan(0.005);
});

test("keeps bounded foam allocated while overflow evicts the lowest oldest source", async ({
  page,
}) => {
  await openQaStage(page);

  const result = await page.evaluate(
    async ({ camera, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV13 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }

      const wakeCount = 64;
      const impactCount = 64;
      const wakePositions = new Float32Array(wakeCount * 3);
      const wakeDirections = new Float32Array(wakeCount * 3);
      const impactPositions = new Float32Array(impactCount * 3);
      for (let index = 0; index < wakeCount; index += 1) {
        const vectorIndex = index * 3;
        wakePositions[vectorIndex] = -14 + (index % 8) * 1.5;
        wakePositions[vectorIndex + 2] = -11 + Math.floor(index / 8) * 2.5;
        wakeDirections[vectorIndex + 2] = 1;
      }
      for (let index = 0; index < impactCount; index += 1) {
        const vectorIndex = index * 3;
        impactPositions[vectorIndex] = 3.5 + (index % 8) * 1.5;
        impactPositions[vectorIndex + 2] = -11 + Math.floor(index / 8) * 2.5;
      }
      const wakePriorities = new Uint8Array(wakeCount).fill(100);
      // IDs 1 and 2 tie for globally lowest priority. Since ID 1 was
      // submitted first, the deterministic oldest-source rule must evict it.
      wakePriorities[0] = 1;
      wakePriorities[1] = 1;

      await harness.reset({ seed: 0x2700_1280 });
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      await harness.updateInteractionAnchor({ x: 0, z: 0 });
      await harness.setCamera(camera, { transition: "continuous" });
      await harness.advanceTicks(90);
      await harness.present();

      const wakeFill = await harness.submitDisturbances({
        kind: "directional-wake",
        count: wakeCount,
        ids: Uint32Array.from({ length: wakeCount }, (_, index) => index + 1),
        positions: wakePositions,
        directions: wakeDirections,
        radii: new Float32Array(wakeCount).fill(2),
        amplitudes: new Float32Array(wakeCount).fill(1),
        priorities: wakePriorities,
      });
      const impactFill = await harness.submitDisturbances({
        kind: "radial-impact",
        count: impactCount,
        ids: Uint32Array.from(
          { length: impactCount },
          (_, index) => index + wakeCount + 1,
        ),
        positions: impactPositions,
        radii: new Float32Array(impactCount).fill(2.25),
        amplitudes: new Float32Array(impactCount).fill(1),
        priorities: new Uint8Array(impactCount).fill(100),
      });

      await harness.advanceTicks(30);
      const beforePresentation = await harness.present();
      const before = await harness.capture("foam-source-identity");

      const highPriority = await harness.submitDisturbances({
        kind: "radial-impact",
        count: 1,
        ids: Uint32Array.of(999),
        positions: Float32Array.of(8, 0, 0),
        radii: Float32Array.of(4),
        amplitudes: Float32Array.of(1.5),
        priorities: Uint8Array.of(200),
      });
      const lowPriority = await harness.submitDisturbances({
        kind: "directional-wake",
        count: 1,
        ids: Uint32Array.of(1_000),
        positions: Float32Array.of(-8, 0, -4),
        directions: Float32Array.of(0, 0, 1),
        radii: Float32Array.of(4),
        amplitudes: Float32Array.of(1.5),
        priorities: Uint8Array.of(0),
      });
      await harness.advanceTicks(1);
      const afterPresentation = await harness.present();
      const after = await harness.capture("foam-source-identity");

      return {
        wakeFill,
        impactFill,
        highPriority,
        lowPriority,
        beforePresentation,
        afterPresentation,
        samePrewarmIdentity:
          beforePresentation.prewarm === afterPresentation.prewarm,
        before,
        after,
      };
    },
    { camera: FOAM_CAMERA, controls: STORM_CONTROLS },
  );

  expect(result.wakeFill).toMatchObject({
    tick: 90,
    acceptedDisturbanceIds: Array.from({ length: 64 }, (_, index) => index + 1),
    droppedDisturbanceIds: [],
    activeDisturbanceCount: 64,
  });
  expect(result.impactFill).toMatchObject({
    tick: 90,
    acceptedDisturbanceIds: Array.from(
      { length: 64 },
      (_, index) => index + 65,
    ),
    droppedDisturbanceIds: [],
    activeDisturbanceCount: 128,
  });
  expect(result.highPriority).toEqual({
    tick: 120,
    acceptedDisturbanceIds: [999],
    droppedDisturbanceIds: [1],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 128,
  });
  expect(result.lowPriority).toEqual({
    tick: 120,
    acceptedDisturbanceIds: [],
    droppedDisturbanceIds: [1_000],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 128,
  });

  expect(result.samePrewarmIdentity).toBe(true);
  expect(result.afterPresentation).toMatchObject({
    manifestHash: result.beforePresentation.manifestHash,
    compileCount: result.beforePresentation.compileCount,
    probeCount: result.beforePresentation.probeCount,
    prewarm: result.beforePresentation.prewarm,
  });
  expect(result.after).toMatchObject({
    name: "foam-source-identity",
    format: "rgba32float-foam-source-identity",
    elementType: "float32",
    components: 4,
    width: result.before.width,
    height: result.before.height,
  });

  const before = summarizeFoamCapture(result.before.data);
  const after = summarizeFoamCapture(result.after.data);
  expectFoamCaptureWellFormed(before);
  expectFoamCaptureWellFormed(after);
  expect(after.channels[0].sum).toBeGreaterThan(SOURCE_EPSILON);
  expect(after.channels[1].sum).toBeGreaterThan(SOURCE_EPSILON);
  expect(after.channels[2].sum).toBeGreaterThan(SOURCE_EPSILON);
  expect(after.channels[3].sum).toBeGreaterThan(SOURCE_EPSILON);
  expect(after.channels[3].sum).toBeGreaterThan(before.channels[3].sum * 0.5);
  expect(after.union.meanAbsoluteError).toBeLessThan(0.001);
  expect(after.union.maximumAbsoluteError).toBeLessThan(0.005);
});

test("keeps Body propeller-wash foam independent of presentation cadence", async ({
  page,
}) => {
  await openQaStage(page, "propeller");

  const result = await page.evaluate(
    async ({ camera, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV13 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }

      const drive = async (cadence: "batched" | "stepped") => {
        await harness.reset({ seed: 0x2700_2514 });
        await harness.updateArtisticControls(controls, {
          transition: "sea-state-cut",
        });
        await harness.setCamera(camera, { transition: "continuous" });

        let presentation;
        if (cadence === "batched") {
          await harness.advanceTicks(30);
          await harness.setCamera(camera, { transition: "camera-cut" });
          presentation = await harness.present();
        } else {
          for (let step = 0; step < 15; step += 1) {
            await harness.advanceTicks(2);
            if (step === 14) {
              await harness.setCamera(camera, { transition: "camera-cut" });
            }
            presentation = await harness.present();
          }
        }
        if (presentation === undefined) {
          throw new Error("The propeller-wash state was not presented.");
        }
        return {
          presentation,
          capture: await harness.capture("foam-source-identity"),
        };
      };

      const batched = await drive("batched");
      const stepped = await drive("stepped");
      return {
        batched,
        stepped,
        samePrewarmIdentity:
          batched.presentation.prewarm === stepped.presentation.prewarm,
      };
    },
    { camera: PROPELLER_CAMERA, controls: STORM_CONTROLS },
  );

  expect(result.batched.presentation.tick).toBe(30);
  expect(result.stepped.presentation).toMatchObject({
    tick: 30,
    manifestHash: result.batched.presentation.manifestHash,
    compileCount: result.batched.presentation.compileCount,
    probeCount: result.batched.presentation.probeCount,
    prewarm: result.batched.presentation.prewarm,
  });
  expect(result.samePrewarmIdentity).toBe(true);
  expect(result.batched.capture).toMatchObject({
    name: "foam-source-identity",
    format: "rgba32float-foam-source-identity",
    elementType: "float32",
    components: 4,
    width: CAPTURE_WIDTH,
    height: CAPTURE_HEIGHT,
  });
  expectFoamCapturesIdentical(
    result.batched.capture.data,
    result.stepped.capture.data,
  );

  const batched = summarizeFoamCapture(result.batched.capture.data);
  const stepped = summarizeFoamCapture(result.stepped.capture.data);
  expectFoamCaptureWellFormed(batched);
  expectFoamCaptureWellFormed(stepped);
  expect(batched.channels[1].nonZero).toBeGreaterThan(0);
  expect(batched.channels[1].sum).toBeGreaterThan(SOURCE_EPSILON);
  expect(batched.channels[2].nonZero).toBe(0);
  expect(batched.channels[2].maximum).toBeLessThanOrEqual(1e-6);
  expect(batched.channels[3].sum).toBeGreaterThan(SOURCE_EPSILON);
  expect(batched.union.meanAbsoluteError).toBeLessThan(0.001);
  expect(batched.union.maximumAbsoluteError).toBeLessThan(0.005);
});

interface FoamChannelStats {
  readonly sum: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly nonZero: number;
  readonly finite: boolean;
}

interface FoamCaptureStats {
  readonly channels: readonly [
    FoamChannelStats,
    FoamChannelStats,
    FoamChannelStats,
    FoamChannelStats,
  ];
  readonly spatialMad: {
    readonly whitecapWake: number;
    readonly whitecapImpact: number;
    readonly wakeImpact: number;
  };
  readonly union: {
    readonly meanAbsoluteError: number;
    readonly maximumAbsoluteError: number;
  };
}

function summarizeFoamCapture(encoded: string): FoamCaptureStats {
  const values = decodeFloat32(encoded);
  expect(values.length % 4).toBe(0);
  const channels = [0, 1, 2, 3].map((component) => {
    let sum = 0;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    let nonZero = 0;
    let finite = true;
    for (let index = component; index < values.length; index += 4) {
      const value = values[index] ?? Number.NaN;
      finite = finite && Number.isFinite(value);
      sum += value;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      if (value > SOURCE_EPSILON) {
        nonZero += 1;
      }
    }
    return { sum, minimum, maximum, nonZero, finite };
  }) as unknown as FoamCaptureStats["channels"];

  let unionAbsoluteError = 0;
  let maximumUnionAbsoluteError = 0;
  for (let index = 0; index < values.length; index += 4) {
    const whitecap = values[index] ?? 0;
    const wake = values[index + 1] ?? 0;
    const impact = values[index + 2] ?? 0;
    const union = values[index + 3] ?? 0;
    const expectedUnion = 1 - (1 - whitecap) * (1 - wake) * (1 - impact);
    const error = Math.abs(union - expectedUnion);
    unionAbsoluteError += error;
    maximumUnionAbsoluteError = Math.max(maximumUnionAbsoluteError, error);
  }

  return {
    channels,
    spatialMad: {
      whitecapWake: normalizedChannelMad(values, channels, 0, 1),
      whitecapImpact: normalizedChannelMad(values, channels, 0, 2),
      wakeImpact: normalizedChannelMad(values, channels, 1, 2),
    },
    union: {
      meanAbsoluteError: unionAbsoluteError / Math.max(1, values.length / 4),
      maximumAbsoluteError: maximumUnionAbsoluteError,
    },
  };
}

function expectFoamCaptureWellFormed(stats: FoamCaptureStats): void {
  for (const channel of stats.channels) {
    expect(channel.finite).toBe(true);
    expect(channel.minimum).toBeGreaterThanOrEqual(-0.001);
    expect(channel.maximum).toBeLessThanOrEqual(1.001);
  }
}

function compareFoamCaptures(
  leftEncoded: string,
  rightEncoded: string,
): readonly Readonly<{ count: number; maximum: number }>[] {
  const left = decodeFloat32(leftEncoded);
  const right = decodeFloat32(rightEncoded);
  expect(right.length).toBe(left.length);
  return [0, 1, 2, 3].map((component) => {
    let count = 0;
    let maximum = 0;
    for (let index = component; index < left.length; index += 4) {
      const difference = Math.abs(
        (left[index] ?? Number.NaN) - (right[index] ?? Number.NaN),
      );
      if (difference !== 0) {
        count += 1;
        maximum = Math.max(maximum, difference);
      }
    }
    return { count, maximum };
  });
}

function expectFoamCapturesIdentical(left: string, right: string): void {
  expect(compareFoamCaptures(left, right)).toEqual(
    [0, 1, 2, 3].map(() => ({ count: 0, maximum: 0 })),
  );
}

function normalizedChannelMad(
  values: readonly number[],
  channels: FoamCaptureStats["channels"],
  leftComponent: number,
  rightComponent: number,
): number {
  const leftMaximum = channels[leftComponent]?.maximum ?? 0;
  const rightMaximum = channels[rightComponent]?.maximum ?? 0;
  let difference = 0;
  for (let index = 0; index < values.length; index += 4) {
    difference += Math.abs(
      (values[index + leftComponent] ?? 0) /
        Math.max(SOURCE_EPSILON, leftMaximum) -
        (values[index + rightComponent] ?? 0) /
          Math.max(SOURCE_EPSILON, rightMaximum),
    );
  }
  return difference / Math.max(1, values.length / 4);
}
