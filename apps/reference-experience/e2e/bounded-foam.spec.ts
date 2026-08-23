import { expect, test, type Page } from "@playwright/test";
import { createWaterPreset } from "real-water";
import type { QaCameraV1, QaHarnessV12 } from "../src/qa-harness.js";
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
const STORM_CONTROLS = createWaterPreset("storm").artisticControls;

test.describe.configure({ mode: "serial" });

async function openQaStage(page: Page): Promise<void> {
  await page.setViewportSize({
    width: CAPTURE_WIDTH,
    height: CAPTURE_HEIGHT,
  });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();
}

test("preserves source-resolved deterministic foam after manual sources expire", async ({
  page,
}) => {
  await openQaStage(page);

  const result = await page.evaluate(
    async ({ camera, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV12 | undefined;
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
      const drive = async () => {
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

        // Keep the fixed-tick field current through the source lifetime, then
        // age to three seconds. Generation stopped just over one second ago,
        // while the storm preset's 1.232 s half-life must leave local history.
        await harness.advanceTicks(59);
        await harness.present();
        await harness.advanceTicks(61);
        const expiredPresentation = await harness.present();
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

      return { first: await drive(), replay: await drive() };
    },
    { camera: FOAM_CAMERA, controls: STORM_CONTROLS },
  );

  expect(result.first.wakeReceipt).toEqual({
    tick: 90,
    acceptedDisturbanceIds: [27_001],
    droppedDisturbanceIds: [],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 1,
  });
  expect(result.first.impactReceipt).toEqual({
    tick: 90,
    acceptedDisturbanceIds: [27_002],
    droppedDisturbanceIds: [],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 2,
  });
  expect(result.replay.wakeReceipt).toEqual(result.first.wakeReceipt);
  expect(result.replay.impactReceipt).toEqual(result.first.impactReceipt);

  expect(result.first.active).toMatchObject({
    name: "foam-source-identity",
    format: "rgba32float-foam-source-identity",
    elementType: "float32",
    components: 4,
    width: CAPTURE_WIDTH,
    height: CAPTURE_HEIGHT,
  });
  expect(result.first.active.data).toBe(result.replay.active.data);
  expect(result.first.expired.data).toBe(result.replay.expired.data);

  const active = summarizeFoamCapture(result.first.active.data);
  const expired = summarizeFoamCapture(result.first.expired.data);
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

  expect(result.first.activePresentation).toMatchObject({
    tick: 150,
    manifestHash: result.first.expiredPresentation.manifestHash,
    compileCount: result.first.expiredPresentation.compileCount,
    probeCount: result.first.expiredPresentation.probeCount,
  });
  expect(result.first.expiredPresentation.tick).toBe(270);
  expect(result.first.legacy).toEqual(
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

test("keeps bounded foam allocated while overflow evicts the lowest oldest source", async ({
  page,
}) => {
  await openQaStage(page);

  const result = await page.evaluate(
    async ({ camera, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV12 | undefined;
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
