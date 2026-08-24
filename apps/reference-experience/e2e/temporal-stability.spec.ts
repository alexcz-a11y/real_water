import { Buffer } from "node:buffer";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
  WATER_PRESET_SCHEMA,
  WATER_PRESET_VERSION,
  createWaterPreset,
  type ArtisticControls,
  type HostEnvironmentState,
} from "real-water";
import type { QaFramePrewarmReceipt } from "../src/qa-frame-driver.js";
import {
  QA_CAPTURE_SCHEMA,
  QA_CAPTURE_VERSION,
  QA_HARNESS_CAPTURE_NAMES,
  QA_HARNESS_SCHEMA,
  QA_HARNESS_VERSION,
  type QaCameraV1,
  type QaHarnessV16,
  type QaPresentationReceiptV16,
} from "../src/qa-harness.js";
import {
  createTemporalStressEvidence,
  type TemporalStressFrameCaptureInput,
} from "./regression-acceptance-evidence.js";
import { REFERENCE_ENVIRONMENT_LIGHTING } from "../src/reference-optical-inputs.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32, decodeUint8 } from "./qa-capture-bytes.js";
import {
  attachRegressionAcceptance,
  coreManifestEvidence,
} from "./regression-acceptance.js";
import {
  formatGate,
  maxOf,
  percentile,
  projectQueryPoint,
  waterMotionMagnitudesPx,
  type EncodedFrameBuffers,
  type ProjectionSample,
} from "./temporal-metrics/frame-sampling.js";
import { analyzeFastPan } from "./temporal-metrics/fast-pan.js";
import { analyzeCausalGlint } from "./temporal-metrics/glint.js";
import { analyzeThinDetail } from "./temporal-metrics/thin-detail.js";

const VIEWPORT = { width: 320, height: 180 } as const;
const SEED = 0x4000_0000;
const OBLIQUE_CAMERA = {
  projection: "perspective" as const,
  position: [0, 10, 18] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 50,
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
const SWELL_PRESET = createWaterPreset("swell");
const FAST_PAN_CONTROLS = SWELL_PRESET.artisticControls;
const TRAA_STABILITY_CONTROLS = {
  ...FAST_PAN_CONTROLS,
  whitecapAmount: 0,
  foamPersistence: 0,
  underwaterHaze: 1,
  underwaterTurbidity: 1,
  underwaterLightShafts: 1,
  underwaterColor: 1,
  underwaterExposure: 1,
} satisfies ArtisticControls;
const TEMPORAL_QA_HARNESS = {
  schema: QA_HARNESS_SCHEMA,
  version: QA_HARNESS_VERSION,
} as const;
const TEMPORAL_QA_CAPTURE = {
  schema: QA_CAPTURE_SCHEMA,
  version: QA_CAPTURE_VERSION,
  names: QA_HARNESS_CAPTURE_NAMES,
} as const;
const SWELL_WATER_PRESET = {
  schema: WATER_PRESET_SCHEMA,
  version: WATER_PRESET_VERSION,
  id: SWELL_PRESET.id,
  presetHash: SWELL_PRESET.presetHash,
} as const;
const FAST_PAN_FRAMES = 16;
const FAST_PAN_PRIME_PRESENTATIONS = 8;
const FAST_PAN_TICK = 24;
const FAST_PAN_TARGET_X = 400;
const FAST_PAN_Y0 = 0.35;
const FAST_PAN_Y1 = 0.9;
const FAST_PAN_DEPTH_MIN = 5;
const FAST_PAN_DEPTH_MAX = 3_500;
const FAST_PAN_FRESNEL_MIN = 0.001;
const FAST_PAN_NORMAL_MIN = 0.9;
const FAST_PAN_NORMAL_MAX = 1.1;
const FAST_PAN_GLINT_MAX = 0.05;
const FAST_PAN_DEPTH_WARP_M = 1;
const FAST_PAN_NORMAL_DOT_MIN = 0.9;
const FAST_PAN_MASK_MIN = 256;
const FAST_PAN_IN_BOUNDS_RATIO_MIN = 0.4;
const FAST_PAN_OOB_WATER_MIN = 64;
const FAST_PAN_MOTION_P50_MIN = 2;
const FAST_PAN_MOTION_P95_MAX = 12;
const FAST_PAN_RESIDUAL_P95_MAX = 0.05;
const FAST_PAN_RESIDUAL_P99_MAX = 0.1;
const FAST_PAN_DISOCCLUSION_P99_MAX = 1;
const FAST_PAN_DISOCCLUSION_MAX = 1;
const FAST_PAN_OUTSIDE_LSB = 16;
const FAST_PAN_CURRENT_RESIDUAL_P95_MIN = 0.005;
const FAST_PAN_FINAL_CURRENT_RESIDUAL_RATIO_MAX = 0.9;
const FAST_PAN_STABLE_DIFF_LSB = 1;
const FAST_PAN_STABLE_DIFF_COVERAGE_MIN = 0.01;
const GLINT_STRAFE_FRAMES = 24;
const GLINT_PRIME_PRESENTATIONS = 8;
const GLINT_START_TICK = 24;
const GLINT_STRAFE_METRES = 0.25;
const GLINT_THRESHOLD = 0.08;
const GLINT_ON_RADIUS = 0.069;
const GLINT_OFF_RADIUS = 0.0001;
const GLINT_ACTIVE_MIN_PIXELS = 4;
const GLINT_ACTIVE_MIN_FRAMES = 12;
const GLINT_PIXEL_FRAMES_MIN = 128;
const GLINT_WATER_MIN = 256;
const GLINT_OUTSIDE_WATER_MIN = 64;
const GLINT_COMPONENT_AREA_MIN = 4;
const GLINT_COMPONENT_ENERGY_MIN = 0.5;
const GLINT_COMPONENT_FRAMES_MIN = 32;
const GLINT_ROI_DILATE_PX = 3;
const GLINT_ALLOWED_DILATE_PX = 1;
const GLINT_PEAK_RATIO_P10_MIN = 0.7;
const GLINT_OUTSIDE_RESIDUAL_P99_MAX = 8;
const GLINT_OUTSIDE_LSB = 16;
const GLINT_OUTSIDE_COVERAGE_MAX = 0.005;
const GLINT_CENTROID_LAG_P95_MAX = 1.5;
const GLINT_TRAIL_MAX = 2;
const GLINT_MAD_SAMPLE_MIN = 128;
const GLINT_MAD_VALID_RATIO_MIN = 0.85;
const GLINT_CURRENT_MAD_P75_MIN = 1;
const GLINT_FINAL_MAD_RATIO_MAX = 0.9;
const GLINT_OFF_MAX = 0.005;
const GLINT_OFF_ENERGY_RATIO_MAX = 0.01;
const GLINT_ON_MAX_MIN = 0.2;
const GLINT_VALID_PEAK_FRAMES_MIN = 12;
const GLINT_MOTION_QUALIFIED_MIN = 32;
const GLINT_ON_LIGHTING = Object.freeze({
  ...REFERENCE_ENVIRONMENT_LIGHTING,
  sunAngularRadiusRadians: GLINT_ON_RADIUS,
});
const GLINT_OFF_LIGHTING = Object.freeze({
  ...REFERENCE_ENVIRONMENT_LIGHTING,
  sunAngularRadiusRadians: GLINT_OFF_RADIUS,
});
const THIN_FRAMES = 16;
const THIN_PRIME_PRESENTATIONS = 8;
const THIN_TICK = 24;
const THIN_GLINT_MAX = FAST_PAN_GLINT_MAX;
const THIN_GRADIENT_MIN = 12;
const THIN_DEPTH_RANGE_MAX = 2;
const THIN_RIDGE_MAX = 2;
const THIN_UNION_MIN = 64;
const THIN_PER_FRAME_MIN = 8;
const THIN_ACTIVE_FRAMES_MIN = 8;
const THIN_MAD_SAMPLE_MIN = 64;
const THIN_RATIO_SAMPLE_MIN = 64;
const THIN_COMPONENT_AREA_MIN = 4;
const THIN_TRACK_MIN = 4;
const THIN_TRACK_FRAMES_MIN = 8;
const THIN_CURRENT_MAD_P75_MIN = 0.5;
const THIN_FINAL_MAD_RATIO_MAX = 0.8;
const THIN_GRADIENT_RATIO_MEDIAN_MIN = 0.8;
const THIN_COVERAGE_RETAIN_MIN = 0.85;
const THIN_MOTION_P95_MAX = 0.05;
const THIN_MOTION_MAX = 0.15;
const HORIZON_WATER_BAND = {
  y0: FAST_PAN_Y0,
  y1: FAST_PAN_Y1,
  depthMin: FAST_PAN_DEPTH_MIN,
  depthMax: FAST_PAN_DEPTH_MAX,
  fresnelMin: FAST_PAN_FRESNEL_MIN,
  normalMin: FAST_PAN_NORMAL_MIN,
  normalMax: FAST_PAN_NORMAL_MAX,
} as const;
const FAST_PAN_ANALYSIS = {
  viewport: VIEWPORT,
  water: HORIZON_WATER_BAND,
  glintMax: FAST_PAN_GLINT_MAX,
  depthWarpM: FAST_PAN_DEPTH_WARP_M,
  normalDotMin: FAST_PAN_NORMAL_DOT_MIN,
  outsideLsb: FAST_PAN_OUTSIDE_LSB,
  stableDiffLsb: FAST_PAN_STABLE_DIFF_LSB,
} as const;
const GLINT_ANALYSIS = {
  viewport: VIEWPORT,
  water: HORIZON_WATER_BAND,
  glintThreshold: GLINT_THRESHOLD,
  activeMinPixels: GLINT_ACTIVE_MIN_PIXELS,
  componentAreaMin: GLINT_COMPONENT_AREA_MIN,
  componentEnergyMin: GLINT_COMPONENT_ENERGY_MIN,
  roiDilatePx: GLINT_ROI_DILATE_PX,
  allowedDilatePx: GLINT_ALLOWED_DILATE_PX,
  outsideLsb: GLINT_OUTSIDE_LSB,
  frameCount: GLINT_STRAFE_FRAMES,
} as const;
const THIN_ANALYSIS = {
  viewport: VIEWPORT,
  water: HORIZON_WATER_BAND,
  glintMax: THIN_GLINT_MAX,
  gradientMin: THIN_GRADIENT_MIN,
  depthRangeMax: THIN_DEPTH_RANGE_MAX,
  ridgeMax: THIN_RIDGE_MAX,
  perFrameMin: THIN_PER_FRAME_MIN,
  componentAreaMin: THIN_COMPONENT_AREA_MIN,
  frameCount: THIN_FRAMES,
} as const;

test("settles presented water motion, then records deterministic nonzero motion after six ticks", async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const result = await page.evaluate(
    async ({ camera, seed }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }

      const drive = async () => {
        await harness.reset({ seed });
        await harness.advanceTicks(120);
        await harness.setCamera(camera, { transition: "continuous" });
        await harness.present();
        const settled = await harness.present();
        const settledCaptures = {
          motion: await harness.capture("motion-vector"),
          fresnel: await harness.capture("optical-fresnel"),
          depth: await harness.capture("depth"),
          normal: await harness.capture("normal"),
        };
        await harness.advanceTicks(6);
        const moved = await harness.present();
        return {
          settled,
          settledCaptures,
          moved,
          movedMotion: await harness.capture("motion-vector"),
          movedFresnel: await harness.capture("optical-fresnel"),
          movedDepth: await harness.capture("depth"),
          movedNormal: await harness.capture("normal"),
        };
      };

      return {
        first: await drive(),
        replay: await drive(),
      };
    },
    { camera: OBLIQUE_CAMERA, seed: SEED },
  );

  expect(result.first.settled.tick).toBe(120);
  expect(result.first.moved.tick).toBe(126);
  expect(result.first.settledCaptures.motion).toMatchObject({
    name: "motion-vector",
    version: QA_CAPTURE_VERSION,
    format: "rg32float-ndc",
    origin: "top-left",
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    components: 2,
    elementType: "float32",
    byteOrder: "little-endian",
  });

  const settledMotion = decodeFloat32(result.first.settledCaptures.motion.data);
  const movedMotion = decodeFloat32(result.first.movedMotion.data);
  expect(settledMotion).toHaveLength(VIEWPORT.width * VIEWPORT.height * 2);
  expect(movedMotion).toHaveLength(VIEWPORT.width * VIEWPORT.height * 2);
  expect(settledMotion.every((value) => Number.isFinite(value))).toBe(true);
  expect(movedMotion.every((value) => Number.isFinite(value))).toBe(true);

  const settledMask = waterMotionMagnitudesPx(
    settledMotion,
    decodeFloat32(result.first.settledCaptures.fresnel.data),
    decodeFloat32(result.first.settledCaptures.depth.data),
    decodeFloat32(result.first.settledCaptures.normal.data),
    VIEWPORT.width,
    VIEWPORT.height,
  );
  const movedMask = waterMotionMagnitudesPx(
    movedMotion,
    decodeFloat32(result.first.movedFresnel.data),
    decodeFloat32(result.first.movedDepth.data),
    decodeFloat32(result.first.movedNormal.data),
    VIEWPORT.width,
    VIEWPORT.height,
  );
  expect(settledMask.length).toBeGreaterThan(0);
  expect(movedMask.length).toBeGreaterThan(0);
  expect(percentile(settledMask, 99)).toBeLessThanOrEqual(0.05);
  expect(Math.max(...settledMask)).toBeLessThanOrEqual(0.15);
  expect(Math.max(...movedMask)).toBeGreaterThan(0.15);
  expect(percentile(movedMask, 99)).toBeGreaterThan(0.05);

  expect(result.first.settled.motion).toEqual({
    previous: result.first.settled.motion.current,
    current: {
      tick: 120,
      controlRevision: result.first.settled.controlRevision,
      originRevision: result.first.settled.originRevision,
      cameraRevision: result.first.settled.cameraRevision,
      cameraCutRevision: 0,
      seaStateCutRevision: 0,
    },
  });
  expect(result.first.moved.motion).toEqual({
    previous: {
      tick: 120,
      controlRevision: result.first.settled.controlRevision,
      originRevision: result.first.settled.originRevision,
      cameraRevision: result.first.settled.cameraRevision,
      cameraCutRevision: 0,
      seaStateCutRevision: 0,
    },
    current: {
      tick: 126,
      controlRevision: result.first.moved.controlRevision,
      originRevision: result.first.moved.originRevision,
      cameraRevision: result.first.moved.cameraRevision,
      cameraCutRevision: 0,
      seaStateCutRevision: 0,
    },
  });

  expect(result.replay.movedMotion.data).toBe(result.first.movedMotion.data);
  expect(result.replay.settledCaptures.motion.data).toBe(
    result.first.settledCaptures.motion.data,
  );
  expect(associationWithoutPresentationId(result.replay.settled)).toEqual(
    associationWithoutPresentationId(result.first.settled),
  );
  expect(associationWithoutPresentationId(result.replay.moved)).toEqual(
    associationWithoutPresentationId(result.first.moved),
  );
});

function waterMaskedChannelAbsDiffs(
  current: Uint8Array,
  finalColor: Uint8Array,
  fresnel: readonly number[],
  depth: readonly number[],
  normals: readonly number[],
  width: number,
  height: number,
): number[] {
  const diffs: number[] = [];
  const pixelCount = width * height;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const fresnelValue = fresnel[pixel] ?? Number.NaN;
    const depthValue = depth[pixel] ?? Number.NaN;
    const nx = normals[pixel * 3] ?? Number.NaN;
    const ny = normals[pixel * 3 + 1] ?? Number.NaN;
    const nz = normals[pixel * 3 + 2] ?? Number.NaN;
    const normalLength = Math.hypot(nx, ny, nz);
    if (
      !(fresnelValue > 0.001) ||
      !Number.isFinite(depthValue) ||
      normalLength < 0.9 ||
      normalLength > 1.1
    ) {
      continue;
    }
    const offset = pixel * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      diffs.push(
        Math.abs(
          (current[offset + channel] ?? 0) -
            (finalColor[offset + channel] ?? 0),
        ),
      );
    }
  }
  return diffs;
}

function associationWithoutPresentationId(
  receipt: QaPresentationReceiptV16,
  epochBase = receipt.temporal.historyEpoch,
) {
  return {
    seed: receipt.seed,
    tick: receipt.tick,
    timeSeconds: receipt.timeSeconds,
    originX: receipt.originX,
    originZ: receipt.originZ,
    originRevision: receipt.originRevision,
    cameraRevision: receipt.cameraRevision,
    controlRevision: receipt.controlRevision,
    motion: receipt.motion,
    temporal: {
      historyEpoch: receipt.temporal.historyEpoch - epochBase,
      resetReason: receipt.temporal.resetReason,
      resetFrame: receipt.temporal.resetFrame,
    },
  };
}

const QUERY_XS = [-6, 0, 6] as const;
const QUERY_ZS = [-4, 0, 4] as const;
const QUERY_POINTS = QUERY_XS.flatMap((x) =>
  QUERY_ZS.map((z) => [x, z] as const),
);

test("projects queried heights independently onto nearby motion AOV across a six-tick leap", async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const result = await page.evaluate(
    async ({ camera, seed, points }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const queryHeights = async () => {
        const heights: Array<{
          readonly x: number;
          readonly z: number;
          readonly height: number;
          readonly tick: number;
        }> = [];
        for (const [x, z] of points) {
          const query = await harness.queryGameplay([x, 0, z]);
          heights.push({
            x,
            z,
            height: query.height,
            tick: query.tick,
          });
        }
        return heights;
      };

      await harness.reset({ seed });
      await harness.advanceTicks(120);
      await harness.setCamera(camera, { transition: "continuous" });
      const presented120 = await harness.present();
      const heights120 = await queryHeights();
      await harness.advanceTicks(6);
      const presented126 = await harness.present();
      const heights126 = await queryHeights();
      const motion = await harness.capture("motion-vector");
      const fresnel = await harness.capture("optical-fresnel");
      const depth = await harness.capture("depth");
      const normal = await harness.capture("normal");

      await harness.reset({ seed });
      await harness.advanceTicks(125);
      await harness.setCamera(camera, { transition: "continuous" });
      await harness.present();
      const heights125 = await queryHeights();

      return {
        presented120,
        presented126,
        heights120,
        heights125,
        heights126,
        motion,
        fresnel,
        depth,
        normal,
      };
    },
    { camera: OBLIQUE_CAMERA, seed: SEED, points: QUERY_POINTS },
  );

  expect(result.presented126.motion).toEqual({
    previous: {
      tick: 120,
      controlRevision: result.presented126.controlRevision,
      originRevision: result.presented126.originRevision,
      cameraRevision: result.presented126.cameraRevision,
      cameraCutRevision: 0,
      seaStateCutRevision: 0,
    },
    current: {
      tick: 126,
      controlRevision: result.presented126.controlRevision,
      originRevision: result.presented126.originRevision,
      cameraRevision: result.presented126.cameraRevision,
      cameraCutRevision: 0,
      seaStateCutRevision: 0,
    },
  });
  expect(result.presented120.controlRevision).toBe(
    result.presented126.controlRevision,
  );
  expect(result.presented120.originRevision).toBe(
    result.presented126.originRevision,
  );
  expect(result.presented120.cameraRevision).toBe(
    result.presented126.cameraRevision,
  );

  const motion = decodeFloat32(result.motion.data);
  const fresnel = decodeFloat32(result.fresnel.data);
  const depth = decodeFloat32(result.depth.data);
  const normals = decodeFloat32(result.normal.data);
  const samples: ProjectionSample[] = [];
  for (let index = 0; index < QUERY_POINTS.length; index += 1) {
    const previous = result.heights120[index];
    const incorrect = result.heights125[index];
    const current = result.heights126[index];
    if (
      previous === undefined ||
      incorrect === undefined ||
      current === undefined
    ) {
      continue;
    }
    expect(previous.tick).toBe(120);
    expect(incorrect.tick).toBe(125);
    expect(current.tick).toBe(126);
    const sample = projectQueryPoint({
      camera: OBLIQUE_CAMERA,
      viewport: VIEWPORT,
      x: current.x,
      z: current.z,
      previousHeight: previous.height,
      incorrectHeight: incorrect.height,
      currentHeight: current.height,
      motion,
      fresnel,
      depth,
      normals,
    });
    if (sample !== null) {
      samples.push(sample);
    }
  }

  const leaping = samples.filter(
    (sample) => sample.expectedMagnitudePx >= 0.15,
  );
  const componentErrors = samples.flatMap((sample) => [
    Math.abs(sample.sampledPx[0] - sample.expectedPx[0]),
    Math.abs(sample.sampledPx[1] - sample.expectedPx[1]),
  ]);
  const directionCosines = leaping.map((sample) => {
    const expectedLength = sample.expectedMagnitudePx;
    const sampledLength = Math.hypot(...sample.sampledPx);
    if (expectedLength === 0 || sampledLength === 0) {
      return 0;
    }
    return (
      (sample.expectedPx[0] * sample.sampledPx[0] +
        sample.expectedPx[1] * sample.sampledPx[1]) /
      (expectedLength * sampledLength)
    );
  });
  const magnitudeRatios = leaping.map(
    (sample) => Math.hypot(...sample.sampledPx) / sample.expectedMagnitudePx,
  );
  const closerToLeap = samples.filter(
    (sample) => sample.distanceToLeap < sample.distanceToOneTick,
  ).length;
  const stats = [
    `valid=${String(samples.length)}/${String(QUERY_POINTS.length)}`,
    `leap>=0.15px=${String(leaping.length)}`,
    `err p50=${formatGate(percentile(componentErrors, 50))} p95=${formatGate(percentile(componentErrors, 95))} max=${formatGate(Math.max(...componentErrors))}`,
    `dir p10=${formatGate(percentile(directionCosines, 10))}`,
    `mag p50=${formatGate(percentile(magnitudeRatios, 50))}`,
    `closerTo120to126=${String(closerToLeap)}/${String(samples.length)}`,
  ].join(" ");

  expect(samples.length, stats).toBeGreaterThanOrEqual(7);
  expect(leaping.length, stats).toBeGreaterThanOrEqual(4);
  expect(percentile(componentErrors, 50), stats).toBeLessThanOrEqual(0.25);
  expect(percentile(componentErrors, 95), stats).toBeLessThanOrEqual(0.75);
  expect(Math.max(...componentErrors), stats).toBeLessThanOrEqual(1.5);
  expect(percentile(directionCosines, 10), stats).toBeGreaterThanOrEqual(0.95);
  expect(percentile(magnitudeRatios, 50), stats).toBeGreaterThanOrEqual(0.8);
  expect(percentile(magnitudeRatios, 50), stats).toBeLessThanOrEqual(1.2);
  expect(closerToLeap / samples.length, stats).toBeGreaterThanOrEqual(0.9);
});

test("resets TRAA history on the first present and matches current-color within one LSB", async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const result = await page.evaluate(
    async ({ camera, seed }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed });
      await harness.setCamera(camera, { transition: "continuous" });
      await harness.updateInteractionAnchor({ x: 50_000, z: 50_000 });
      await harness.advanceTicks(1);
      const first = await harness.present();
      const firstCaptures = {
        current: await harness.capture("current-color"),
        final: await harness.capture("final-color"),
        fresnel: await harness.capture("optical-fresnel"),
        depth: await harness.capture("depth"),
        normal: await harness.capture("normal"),
      };
      const second = await harness.present();
      return {
        first,
        second,
        firstCaptures,
        captureNames: harness.captureNames,
        currentShape: {
          version: firstCaptures.current.version,
          format: firstCaptures.current.format,
          elementType: firstCaptures.current.elementType,
          components: firstCaptures.current.components,
          origin: firstCaptures.current.origin,
          width: firstCaptures.current.width,
          height: firstCaptures.current.height,
        },
      };
    },
    { camera: OBLIQUE_CAMERA, seed: SEED },
  );

  expect(result.captureNames[0]).toBe("final-color");
  expect(result.captureNames[1]).toBe("current-color");
  expect(result.currentShape).toEqual({
    version: QA_CAPTURE_VERSION,
    format: "rgba8unorm-srgb",
    elementType: "uint8",
    components: 4,
    origin: "top-left",
    width: VIEWPORT.width,
    height: VIEWPORT.height,
  });
  expect(decodeUint8(result.firstCaptures.current.data)).toHaveLength(
    VIEWPORT.width * VIEWPORT.height * 4,
  );
  expect(result.first.temporal).toEqual({
    historyEpoch: 1,
    resetReason: "qa-reset",
    resetFrame: true,
  });
  expect(result.first.motion.previous).toEqual(result.first.motion.current);
  expect(result.second.temporal).toEqual({
    historyEpoch: 1,
    resetReason: null,
    resetFrame: false,
  });
  expect(result.second.manifestHash).toBe(result.first.manifestHash);
  expect(result.second.compileCount).toBe(result.first.compileCount);
  expect(result.second.prewarm).toEqual(result.first.prewarm);

  const diffs = waterMaskedChannelAbsDiffs(
    decodeUint8(result.firstCaptures.current.data),
    decodeUint8(result.firstCaptures.final.data),
    decodeFloat32(result.firstCaptures.fresnel.data),
    decodeFloat32(result.firstCaptures.depth.data),
    decodeFloat32(result.firstCaptures.normal.data),
    VIEWPORT.width,
    VIEWPORT.height,
  );
  expect(diffs.length).toBeGreaterThan(0);
  expect(percentile(diffs, 99)).toBeLessThanOrEqual(1);
  expect(maxOf(diffs)).toBeLessThanOrEqual(1);
});

test("gates TRAA warp residuals on a frozen-simulation fast pan", async ({
  page,
}, testInfo) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const recipe = await page.evaluate(
    async ({
      camera,
      controls,
      seed,
      primeCount,
      frameCount,
      tickCount,
      targetX,
    }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed });
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      await harness.setCamera(camera, { transition: "continuous" });
      await harness.advanceTicks(tickCount);
      let lastPrime: QaPresentationReceiptV16 | null = null;
      for (let prime = 0; prime < primeCount; prime += 1) {
        lastPrime = await harness.present();
      }
      if (lastPrime === null) {
        throw new Error("The fast-pan recipe produced no prime presentation.");
      }
      const captured: Array<{
        readonly tick: number;
        readonly presentationId: number;
        readonly manifestHash: string;
        readonly seed: number;
        readonly timeSeconds: number;
        readonly cameraRevision: number;
        readonly cameraCutRevision: number;
        readonly controlRevision: number;
        readonly seaStateCutRevision: number;
        readonly originRevision: number;
        readonly simulationResetRevision: number;
        readonly historyEpoch: number;
        readonly resetReason: string | null;
        readonly resetFrame: boolean;
        readonly prewarm: QaPresentationReceiptV16["prewarm"];
        readonly current: string;
        readonly final: string;
        readonly motion: string;
        readonly depth: string;
        readonly normal: string;
        readonly fresnel: string;
        readonly glint: string;
      }> = [];
      for (let frame = 0; frame < frameCount; frame += 1) {
        await harness.setCamera(
          {
            ...camera,
            target: [targetX, 0, -60 + frame * 8],
          },
          { transition: "continuous" },
        );
        const presentation = await harness.present();
        captured.push({
          tick: presentation.tick,
          presentationId: presentation.presentationId,
          manifestHash: presentation.manifestHash,
          seed: presentation.seed,
          timeSeconds: presentation.timeSeconds,
          cameraRevision: presentation.cameraRevision,
          cameraCutRevision: presentation.cameraCutRevision,
          controlRevision: presentation.controlRevision,
          seaStateCutRevision: presentation.seaStateCutRevision,
          originRevision: presentation.originRevision,
          simulationResetRevision: presentation.simulationResetRevision,
          historyEpoch: presentation.temporal.historyEpoch,
          resetReason: presentation.temporal.resetReason,
          resetFrame: presentation.temporal.resetFrame,
          prewarm: presentation.prewarm,
          current: (await harness.capture("current-color")).data,
          final: (await harness.capture("final-color")).data,
          motion: (await harness.capture("motion-vector")).data,
          depth: (await harness.capture("depth")).data,
          normal: (await harness.capture("normal")).data,
          fresnel: (await harness.capture("optical-fresnel")).data,
          glint: (await harness.capture("optical-glint")).data,
        });
      }
      const firstCaptured = captured[0];
      if (firstCaptured === undefined) {
        throw new Error("The fast-pan recipe produced no presented frames.");
      }
      return {
        frames: captured,
        prewarm: firstCaptured.prewarm,
        prime: {
          presentationId: lastPrime.presentationId,
          tick: lastPrime.tick,
          historyEpoch: lastPrime.temporal.historyEpoch,
          resetReason: lastPrime.temporal.resetReason,
          resetFrame: lastPrime.temporal.resetFrame,
          simulationResetRevision: lastPrime.simulationResetRevision,
          seed: lastPrime.seed,
          manifestHash: lastPrime.manifestHash,
          controlRevision: lastPrime.controlRevision,
          cameraCutRevision: lastPrime.cameraCutRevision,
          seaStateCutRevision: lastPrime.seaStateCutRevision,
          originRevision: lastPrime.originRevision,
        },
      };
    },
    {
      camera: HORIZON_CAMERA,
      controls: FAST_PAN_CONTROLS,
      seed: SEED,
      primeCount: FAST_PAN_PRIME_PRESENTATIONS,
      frameCount: FAST_PAN_FRAMES,
      tickCount: FAST_PAN_TICK,
      targetX: FAST_PAN_TARGET_X,
    },
  );

  const { frames, prewarm, prime } = recipe;
  expect(frames).toHaveLength(FAST_PAN_FRAMES);
  const first = frames[0];
  if (first === undefined) {
    throw new Error("The fast-pan recipe produced no presented frames.");
  }
  for (const [index, frame] of frames.entries()) {
    expect(frame.tick, `frame ${String(index)} tick`).toBe(FAST_PAN_TICK);
    expect(frame.historyEpoch, `frame ${String(index)} epoch`).toBe(
      first.historyEpoch,
    );
    expect(frame.resetReason, `frame ${String(index)} resetReason`).toBeNull();
    expect(frame.resetFrame, `frame ${String(index)} resetFrame`).toBe(false);
    expect(frame.cameraCutRevision, `frame ${String(index)} cameraCut`).toBe(
      first.cameraCutRevision,
    );
    if (index > 0) {
      expect(
        frame.cameraRevision,
        `frame ${String(index)} cameraRevision`,
      ).toBeGreaterThan(frames[index - 1]?.cameraRevision ?? 0);
    }
  }

  const report = analyzeFastPan({
    frames,
    cameras: Array.from({ length: frames.length }, (_, index) =>
      fastPanCamera(index),
    ),
    config: FAST_PAN_ANALYSIS,
  });
  const measured = report.pairs;
  console.log(report.lines.join("\n"));
  let stableMaskTotal = 0;
  let stableDiffTotal = 0;
  for (const { stats, summary: label } of measured) {
    expect(stats.maskCount, label).toBeGreaterThanOrEqual(FAST_PAN_MASK_MIN);
    expect(stats.inBoundsWaterCount, label).toBeGreaterThan(0);
    expect(
      stats.maskCount / stats.inBoundsWaterCount,
      label,
    ).toBeGreaterThanOrEqual(FAST_PAN_IN_BOUNDS_RATIO_MIN);
    expect(stats.oobCount, label).toBeGreaterThanOrEqual(
      FAST_PAN_OOB_WATER_MIN,
    );
    expect(stats.motionP50, label).toBeGreaterThanOrEqual(
      FAST_PAN_MOTION_P50_MIN,
    );
    expect(stats.motionP95, label).toBeLessThanOrEqual(FAST_PAN_MOTION_P95_MAX);
    expect(stats.currentResidualP95, label).toBeGreaterThanOrEqual(
      FAST_PAN_CURRENT_RESIDUAL_P95_MIN,
    );
    expect(stats.residualP95, label).toBeLessThanOrEqual(
      FAST_PAN_FINAL_CURRENT_RESIDUAL_RATIO_MAX * stats.currentResidualP95,
    );
    expect(stats.residualP95, label).toBeLessThanOrEqual(
      FAST_PAN_RESIDUAL_P95_MAX,
    );
    expect(stats.residualP99, label).toBeLessThanOrEqual(
      FAST_PAN_RESIDUAL_P99_MAX,
    );
    expect(stats.disocclusionP99, label).toBeLessThanOrEqual(
      FAST_PAN_DISOCCLUSION_P99_MAX,
    );
    expect(stats.disocclusionMax, label).toBeLessThanOrEqual(
      FAST_PAN_DISOCCLUSION_MAX,
    );
    expect(stats.outsideCoverage, label).toBe(0);
    expect(stats.maxTrail, label).toBe(0);
    stableMaskTotal += stats.maskCount;
    stableDiffTotal += stats.stableDiffCount;
  }
  expect(
    stableMaskTotal === 0 ? 0 : stableDiffTotal / stableMaskTotal,
    `stableDiff=${String(stableDiffTotal)}/${String(stableMaskTotal)}`,
  ).toBeGreaterThanOrEqual(FAST_PAN_STABLE_DIFF_COVERAGE_MIN);
  const pairValues = measured.map(({ stats }) => stats);
  const residualRatios = pairValues.map(
    (stats) => stats.residualP95 / stats.currentResidualP95,
  );
  const inBoundsRatios = pairValues.map(
    (stats) => stats.maskCount / stats.inBoundsWaterCount,
  );
  await attachTemporalStressAcceptance(testInfo, page, {
    tick: first.tick,
    controlRevision: first.controlRevision,
    prewarm,
    artisticControls: FAST_PAN_CONTROLS,
    temporalStress: createTemporalStressEvidence({
      id: "fast-pan-frozen-simulation",
      startTick: FAST_PAN_TICK,
      ticksPerFrame: 0,
      primePresentations: FAST_PAN_PRIME_PRESENTATIONS,
      frameCount: FAST_PAN_FRAMES,
      runs: [
        {
          id: "default",
          cameraPath: Array.from({ length: FAST_PAN_FRAMES }, (_, index) =>
            fastPanCamera(index),
          ),
          artisticControls: FAST_PAN_CONTROLS,
          waterPreset: SWELL_WATER_PRESET,
          reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          lighting: REFERENCE_ENVIRONMENT_LIGHTING,
          prime,
          frames: temporalStressCaptures(frames),
        },
      ],
      thresholds: {
        maskMin: FAST_PAN_MASK_MIN,
        inBoundsRatioMin: FAST_PAN_IN_BOUNDS_RATIO_MIN,
        oobWaterMin: FAST_PAN_OOB_WATER_MIN,
        motionP50Min: FAST_PAN_MOTION_P50_MIN,
        motionP95Max: FAST_PAN_MOTION_P95_MAX,
        residualP95Max: FAST_PAN_RESIDUAL_P95_MAX,
        residualP99Max: FAST_PAN_RESIDUAL_P99_MAX,
        disocclusionP99Max: FAST_PAN_DISOCCLUSION_P99_MAX,
        disocclusionMax: FAST_PAN_DISOCCLUSION_MAX,
        outsideCoverage: 0,
        maxTrail: 0,
        currentResidualP95Min: FAST_PAN_CURRENT_RESIDUAL_P95_MIN,
        finalCurrentResidualRatioMax: FAST_PAN_FINAL_CURRENT_RESIDUAL_RATIO_MAX,
        stableDiffCoverageMin: FAST_PAN_STABLE_DIFF_COVERAGE_MIN,
      },
      observed: {
        maskMin: Math.min(...pairValues.map((stats) => stats.maskCount)),
        inBoundsRatioMin: Math.min(...inBoundsRatios),
        oobWaterMin: Math.min(...pairValues.map((stats) => stats.oobCount)),
        motionP50Min: Math.min(...pairValues.map((stats) => stats.motionP50)),
        motionP95Max: Math.max(...pairValues.map((stats) => stats.motionP95)),
        residualP95Max: Math.max(
          ...pairValues.map((stats) => stats.residualP95),
        ),
        residualP99Max: Math.max(
          ...pairValues.map((stats) => stats.residualP99),
        ),
        disocclusionP99Max: Math.max(
          ...pairValues.map((stats) => stats.disocclusionP99),
        ),
        disocclusionMax: Math.max(
          ...pairValues.map((stats) => stats.disocclusionMax),
        ),
        outsideCoverage: Math.max(
          ...pairValues.map((stats) => stats.outsideCoverage),
        ),
        maxTrail: Math.max(...pairValues.map((stats) => stats.maxTrail)),
        currentResidualP95Min: Math.min(
          ...pairValues.map((stats) => stats.currentResidualP95),
        ),
        finalCurrentResidualRatioMax: Math.max(...residualRatios),
        stableDiffCoverage:
          stableMaskTotal === 0 ? 0 : stableDiffTotal / stableMaskTotal,
      },
    }),
  });
});

test("gates TRAA high-frequency glints on a moving horizon strafe", async ({
  page,
}, testInfo) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const routes = await page.evaluate(
    async ({
      camera,
      controls,
      seed,
      primeCount,
      frameCount,
      startTick,
      strafeMetres,
      onLighting,
      offLighting,
    }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const runRoute = async (
        lighting: typeof onLighting | typeof offLighting,
      ) => {
        await harness.reset({ seed });
        const appliedLighting =
          await harness.updateEnvironmentLighting(lighting);
        await harness.updateArtisticControls(controls, {
          transition: "continuous",
        });
        await harness.setCamera(camera, { transition: "continuous" });
        await harness.advanceTicks(startTick);
        let lastPrime: QaPresentationReceiptV16 | null = null;
        for (let prime = 0; prime < primeCount; prime += 1) {
          lastPrime = await harness.present();
        }
        if (lastPrime === null) {
          throw new Error(
            "The glint-strafe recipe produced no prime presentation.",
          );
        }
        const captured: Array<{
          readonly tick: number;
          readonly presentationId: number;
          readonly seed: number;
          readonly timeSeconds: number;
          readonly cameraRevision: number;
          readonly cameraCutRevision: number;
          readonly controlRevision: number;
          readonly seaStateCutRevision: number;
          readonly originRevision: number;
          readonly simulationResetRevision: number;
          readonly historyEpoch: number;
          readonly resetReason: string | null;
          readonly resetFrame: boolean;
          readonly manifestHash: string;
          readonly compileCount: number;
          readonly prewarm: QaPresentationReceiptV16["prewarm"];
          readonly current: string;
          readonly final: string;
          readonly motion: string;
          readonly depth: string;
          readonly normal: string;
          readonly fresnel: string;
          readonly glint: string;
        }> = [];
        for (let frame = 1; frame <= frameCount; frame += 1) {
          await harness.advanceTicks(1);
          const offsetZ = frame * strafeMetres;
          await harness.setCamera(
            {
              ...camera,
              position: [
                camera.position[0],
                camera.position[1],
                camera.position[2] + offsetZ,
              ],
              target: [
                camera.target[0],
                camera.target[1],
                camera.target[2] + offsetZ,
              ],
            },
            { transition: "continuous" },
          );
          const presentation = await harness.present();
          captured.push({
            tick: presentation.tick,
            presentationId: presentation.presentationId,
            seed: presentation.seed,
            timeSeconds: presentation.timeSeconds,
            cameraRevision: presentation.cameraRevision,
            cameraCutRevision: presentation.cameraCutRevision,
            controlRevision: presentation.controlRevision,
            seaStateCutRevision: presentation.seaStateCutRevision,
            originRevision: presentation.originRevision,
            simulationResetRevision: presentation.simulationResetRevision,
            historyEpoch: presentation.temporal.historyEpoch,
            resetReason: presentation.temporal.resetReason,
            resetFrame: presentation.temporal.resetFrame,
            manifestHash: presentation.manifestHash,
            compileCount: presentation.compileCount,
            prewarm: presentation.prewarm,
            current: (await harness.capture("current-color")).data,
            final: (await harness.capture("final-color")).data,
            motion: (await harness.capture("motion-vector")).data,
            depth: (await harness.capture("depth")).data,
            normal: (await harness.capture("normal")).data,
            fresnel: (await harness.capture("optical-fresnel")).data,
            glint: (await harness.capture("optical-glint")).data,
          });
        }
        return {
          lighting: appliedLighting,
          frames: captured,
          prime: {
            presentationId: lastPrime.presentationId,
            tick: lastPrime.tick,
            historyEpoch: lastPrime.temporal.historyEpoch,
            resetReason: lastPrime.temporal.resetReason,
            resetFrame: lastPrime.temporal.resetFrame,
            simulationResetRevision: lastPrime.simulationResetRevision,
            seed: lastPrime.seed,
            manifestHash: lastPrime.manifestHash,
            controlRevision: lastPrime.controlRevision,
            cameraCutRevision: lastPrime.cameraCutRevision,
            seaStateCutRevision: lastPrime.seaStateCutRevision,
            originRevision: lastPrime.originRevision,
          },
        };
      };
      return {
        on: await runRoute(onLighting),
        off: await runRoute(offLighting),
      };
    },
    {
      camera: HORIZON_CAMERA,
      controls: TRAA_STABILITY_CONTROLS,
      seed: SEED,
      primeCount: GLINT_PRIME_PRESENTATIONS,
      frameCount: GLINT_STRAFE_FRAMES,
      startTick: GLINT_START_TICK,
      strafeMetres: GLINT_STRAFE_METRES,
      onLighting: GLINT_ON_LIGHTING,
      offLighting: GLINT_OFF_LIGHTING,
    },
  );

  expect(routes.on.frames).toHaveLength(GLINT_STRAFE_FRAMES);
  expect(routes.off.frames).toHaveLength(GLINT_STRAFE_FRAMES);
  assertGlintLightingExceptRadius(routes.on.lighting, routes.off.lighting);
  assertGlintRouteReceipts(routes.on.frames, "on");
  assertGlintRouteReceipts(routes.off.frames, "off");
  const firstOnEpoch = routes.on.frames[0]?.historyEpoch;
  const firstOffEpoch = routes.off.frames[0]?.historyEpoch;
  if (firstOnEpoch === undefined || firstOffEpoch === undefined) {
    throw new Error("The glint-strafe recipe produced no presented frames.");
  }
  for (const [index, onFrame] of routes.on.frames.entries()) {
    const offFrame = routes.off.frames[index];
    if (onFrame === undefined || offFrame === undefined) {
      throw new Error(`Missing glint A/B pair ${String(index)}.`);
    }
    assertGlintCommonSource(onFrame, offFrame, index);
    expect(
      onFrame.historyEpoch - firstOnEpoch,
      `on frame ${String(index)} relative epoch`,
    ).toBe(0);
    expect(
      offFrame.historyEpoch - firstOffEpoch,
      `off frame ${String(index)} relative epoch`,
    ).toBe(onFrame.historyEpoch - firstOnEpoch);
  }

  const route = analyzeCausalGlint({
    onFrames: routes.on.frames,
    offFrames: routes.off.frames,
    config: GLINT_ANALYSIS,
  });
  console.log(route.lines.join("\n"));
  console.log(route.summary);
  expect(route.offGlintMax, route.summary).toBeLessThanOrEqual(GLINT_OFF_MAX);
  expect(route.offGlintHot, route.summary).toBe(0);
  expect(route.onGlintMax, route.summary).toBeGreaterThanOrEqual(
    GLINT_ON_MAX_MIN,
  );
  expect(route.offGlintEnergy, route.summary).toBeLessThanOrEqual(
    GLINT_OFF_ENERGY_RATIO_MAX * route.onGlintEnergy,
  );
  expect(route.minWaterCount, route.summary).toBeGreaterThanOrEqual(
    GLINT_WATER_MIN,
  );
  expect(route.minOutsideWater, route.summary).toBeGreaterThanOrEqual(
    GLINT_OUTSIDE_WATER_MIN,
  );
  expect(route.activeFrames, route.summary).toBeGreaterThanOrEqual(
    GLINT_ACTIVE_MIN_FRAMES,
  );
  expect(route.validPeakFrames, route.summary).toBeGreaterThanOrEqual(
    GLINT_VALID_PEAK_FRAMES_MIN,
  );
  expect(route.glintPixelFrames, route.summary).toBeGreaterThanOrEqual(
    GLINT_PIXEL_FRAMES_MIN,
  );
  expect(route.peakRatioP10, route.summary).toBeGreaterThanOrEqual(
    GLINT_PEAK_RATIO_P10_MIN,
  );
  expect(route.outsideResidualP99, route.summary).toBeLessThanOrEqual(
    GLINT_OUTSIDE_RESIDUAL_P99_MAX,
  );
  expect(route.outsideCoverage, route.summary).toBeLessThanOrEqual(
    GLINT_OUTSIDE_COVERAGE_MAX,
  );
  expect(route.validComponentFrames, route.summary).toBeGreaterThanOrEqual(
    GLINT_COMPONENT_FRAMES_MIN,
  );
  expect(route.motionQualifiedComponents, route.summary).toBeGreaterThanOrEqual(
    GLINT_MOTION_QUALIFIED_MIN,
  );
  expect(route.centroidLagP95, route.summary).toBeLessThanOrEqual(
    GLINT_CENTROID_LAG_P95_MAX,
  );
  expect(route.maxTrail, route.summary).toBeLessThanOrEqual(GLINT_TRAIL_MAX);
  expect(route.madValid, route.summary).toBeGreaterThanOrEqual(
    GLINT_MAD_SAMPLE_MIN,
  );
  expect(
    route.madEligible === 0 ? 0 : route.madValid / route.madEligible,
    route.summary,
  ).toBeGreaterThanOrEqual(GLINT_MAD_VALID_RATIO_MIN);
  expect(route.currentMadP75, route.summary).toBeGreaterThanOrEqual(
    GLINT_CURRENT_MAD_P75_MIN,
  );
  expect(route.finalMadP75, route.summary).toBeLessThanOrEqual(
    GLINT_FINAL_MAD_RATIO_MAX * route.currentMadP75,
  );
  const firstOn = routes.on.frames[0];
  if (firstOn === undefined) {
    throw new Error("The glint-strafe recipe produced no presented frames.");
  }
  const cameraPath = Array.from({ length: GLINT_STRAFE_FRAMES }, (_, index) =>
    glintStrafeCamera(index + 1),
  );
  await attachTemporalStressAcceptance(testInfo, page, {
    tick: firstOn.tick,
    controlRevision: firstOn.controlRevision,
    prewarm: firstOn.prewarm,
    artisticControls: TRAA_STABILITY_CONTROLS,
    temporalStress: createTemporalStressEvidence({
      id: "high-frequency-glint-horizon-strafe",
      startTick: GLINT_START_TICK,
      ticksPerFrame: 1,
      primePresentations: GLINT_PRIME_PRESENTATIONS,
      frameCount: GLINT_STRAFE_FRAMES,
      runs: [
        {
          id: "sun-on",
          cameraPath,
          artisticControls: TRAA_STABILITY_CONTROLS,
          waterPreset: SWELL_WATER_PRESET,
          reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          lighting: GLINT_ON_LIGHTING,
          prime: routes.on.prime,
          frames: temporalStressCaptures(routes.on.frames),
        },
        {
          id: "sun-off",
          cameraPath,
          artisticControls: TRAA_STABILITY_CONTROLS,
          waterPreset: SWELL_WATER_PRESET,
          reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          lighting: GLINT_OFF_LIGHTING,
          prime: routes.off.prime,
          frames: temporalStressCaptures(routes.off.frames),
        },
      ],
      thresholds: {
        offGlintMax: GLINT_OFF_MAX,
        offGlintHot: 0,
        onGlintMaxMin: GLINT_ON_MAX_MIN,
        offEnergyRatioMax: GLINT_OFF_ENERGY_RATIO_MAX,
        minWaterCount: GLINT_WATER_MIN,
        minOutsideWater: GLINT_OUTSIDE_WATER_MIN,
        activeFramesMin: GLINT_ACTIVE_MIN_FRAMES,
        validPeakFramesMin: GLINT_VALID_PEAK_FRAMES_MIN,
        glintPixelFramesMin: GLINT_PIXEL_FRAMES_MIN,
        peakRatioP10Min: GLINT_PEAK_RATIO_P10_MIN,
        outsideResidualP99Max: GLINT_OUTSIDE_RESIDUAL_P99_MAX,
        outsideCoverageMax: GLINT_OUTSIDE_COVERAGE_MAX,
        validComponentFramesMin: GLINT_COMPONENT_FRAMES_MIN,
        motionQualifiedComponentsMin: GLINT_MOTION_QUALIFIED_MIN,
        centroidLagP95Max: GLINT_CENTROID_LAG_P95_MAX,
        maxTrail: GLINT_TRAIL_MAX,
        madValidMin: GLINT_MAD_SAMPLE_MIN,
        madValidRatioMin: GLINT_MAD_VALID_RATIO_MIN,
        currentMadP75Min: GLINT_CURRENT_MAD_P75_MIN,
        finalMadRatioMax: GLINT_FINAL_MAD_RATIO_MAX,
        commonSource: 1,
      },
      observed: {
        offGlintMax: route.offGlintMax,
        offGlintHot: route.offGlintHot,
        onGlintMax: route.onGlintMax,
        offEnergyRatio:
          route.onGlintEnergy === 0
            ? 0
            : route.offGlintEnergy / route.onGlintEnergy,
        minWaterCount: route.minWaterCount,
        minOutsideWater: route.minOutsideWater,
        activeFrames: route.activeFrames,
        validPeakFrames: route.validPeakFrames,
        glintPixelFrames: route.glintPixelFrames,
        peakRatioP10: route.peakRatioP10,
        outsideResidualP99: route.outsideResidualP99,
        outsideCoverage: route.outsideCoverage,
        validComponentFrames: route.validComponentFrames,
        motionQualifiedComponents: route.motionQualifiedComponents,
        centroidLagP95: route.centroidLagP95,
        maxTrail: route.maxTrail,
        madEligible: route.madEligible,
        madValid: route.madValid,
        madValidRatio:
          route.madEligible === 0 ? 0 : route.madValid / route.madEligible,
        currentMadP75: route.currentMadP75,
        finalMadP75: route.finalMadP75,
        finalMadRatio:
          route.currentMadP75 === 0
            ? 0
            : route.finalMadP75 / route.currentMadP75,
        commonSource: 1,
      },
    }),
  });
});

test("gates TRAA thin water detail on a jitter-only horizon hold", async ({
  page,
}, testInfo) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const recipe = await page.evaluate(
    async ({
      camera,
      controls,
      lighting,
      seed,
      primeCount,
      frameCount,
      tickCount,
    }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed });
      await harness.updateEnvironmentLighting(lighting);
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      await harness.setCamera(camera, { transition: "continuous" });
      await harness.advanceTicks(tickCount);
      let lastPrime: QaPresentationReceiptV16 | null = null;
      for (let prime = 0; prime < primeCount; prime += 1) {
        lastPrime = await harness.present();
      }
      if (lastPrime === null) {
        throw new Error(
          "The thin-detail recipe produced no prime presentation.",
        );
      }
      const captured: Array<{
        readonly tick: number;
        readonly presentationId: number;
        readonly manifestHash: string;
        readonly seed: number;
        readonly timeSeconds: number;
        readonly cameraRevision: number;
        readonly cameraCutRevision: number;
        readonly controlRevision: number;
        readonly seaStateCutRevision: number;
        readonly originRevision: number;
        readonly simulationResetRevision: number;
        readonly historyEpoch: number;
        readonly resetReason: string | null;
        readonly resetFrame: boolean;
        readonly prewarm: QaPresentationReceiptV16["prewarm"];
        readonly current: string;
        readonly final: string;
        readonly motion: string;
        readonly depth: string;
        readonly normal: string;
        readonly fresnel: string;
        readonly glint: string;
      }> = [];
      for (let frame = 0; frame < frameCount; frame += 1) {
        const presentation = await harness.present();
        captured.push({
          tick: presentation.tick,
          presentationId: presentation.presentationId,
          manifestHash: presentation.manifestHash,
          seed: presentation.seed,
          timeSeconds: presentation.timeSeconds,
          cameraRevision: presentation.cameraRevision,
          cameraCutRevision: presentation.cameraCutRevision,
          controlRevision: presentation.controlRevision,
          seaStateCutRevision: presentation.seaStateCutRevision,
          originRevision: presentation.originRevision,
          simulationResetRevision: presentation.simulationResetRevision,
          historyEpoch: presentation.temporal.historyEpoch,
          resetReason: presentation.temporal.resetReason,
          resetFrame: presentation.temporal.resetFrame,
          prewarm: presentation.prewarm,
          current: (await harness.capture("current-color")).data,
          final: (await harness.capture("final-color")).data,
          motion: (await harness.capture("motion-vector")).data,
          depth: (await harness.capture("depth")).data,
          normal: (await harness.capture("normal")).data,
          fresnel: (await harness.capture("optical-fresnel")).data,
          glint: (await harness.capture("optical-glint")).data,
        });
      }
      const firstCaptured = captured[0];
      if (firstCaptured === undefined) {
        throw new Error("The thin-detail recipe produced no presented frames.");
      }
      return {
        frames: captured,
        prewarm: firstCaptured.prewarm,
        prime: {
          presentationId: lastPrime.presentationId,
          tick: lastPrime.tick,
          historyEpoch: lastPrime.temporal.historyEpoch,
          resetReason: lastPrime.temporal.resetReason,
          resetFrame: lastPrime.temporal.resetFrame,
          simulationResetRevision: lastPrime.simulationResetRevision,
          seed: lastPrime.seed,
          manifestHash: lastPrime.manifestHash,
          controlRevision: lastPrime.controlRevision,
          cameraCutRevision: lastPrime.cameraCutRevision,
          seaStateCutRevision: lastPrime.seaStateCutRevision,
          originRevision: lastPrime.originRevision,
        },
      };
    },
    {
      camera: HORIZON_CAMERA,
      controls: TRAA_STABILITY_CONTROLS,
      lighting: REFERENCE_ENVIRONMENT_LIGHTING,
      seed: SEED,
      primeCount: THIN_PRIME_PRESENTATIONS,
      frameCount: THIN_FRAMES,
      tickCount: THIN_TICK,
    },
  );

  const { frames, prewarm, prime } = recipe;
  expect(frames).toHaveLength(THIN_FRAMES);
  assertThinDetailReceipts(frames);

  const route = analyzeThinDetail({
    frames,
    config: THIN_ANALYSIS,
  });
  console.log(route.lines.join("\n"));
  console.log(route.summary);
  expect(route.unionCount, route.summary).toBeGreaterThanOrEqual(
    THIN_UNION_MIN,
  );
  expect(route.minFrameThin, route.summary).toBeGreaterThanOrEqual(
    THIN_PER_FRAME_MIN,
  );
  expect(route.activeFrames, route.summary).toBeGreaterThanOrEqual(
    THIN_ACTIVE_FRAMES_MIN,
  );
  expect(route.madSamples, route.summary).toBeGreaterThanOrEqual(
    THIN_MAD_SAMPLE_MIN,
  );
  expect(route.currentMadP75, route.summary).toBeGreaterThanOrEqual(
    THIN_CURRENT_MAD_P75_MIN,
  );
  expect(route.finalMadP75, route.summary).toBeLessThanOrEqual(
    THIN_FINAL_MAD_RATIO_MAX * route.currentMadP75,
  );
  expect(route.ratioSamples, route.summary).toBeGreaterThanOrEqual(
    THIN_RATIO_SAMPLE_MIN,
  );
  expect(route.gradientRatioMedian, route.summary).toBeGreaterThanOrEqual(
    THIN_GRADIENT_RATIO_MEDIAN_MIN,
  );
  expect(route.coverageRetain, route.summary).toBeGreaterThanOrEqual(
    THIN_COVERAGE_RETAIN_MIN,
  );
  expect(route.minFrameRetain, route.summary).toBeGreaterThanOrEqual(
    THIN_COVERAGE_RETAIN_MIN,
  );
  expect(route.trackedComponents, route.summary).toBeGreaterThanOrEqual(
    THIN_TRACK_MIN,
  );
  expect(route.trackedComponentFrames, route.summary).toBeGreaterThanOrEqual(
    THIN_TRACK_FRAMES_MIN,
  );
  expect(route.maxConsecutiveMissing, route.summary).toBeLessThanOrEqual(1);
  expect(route.differingFrames, route.summary).toBeGreaterThanOrEqual(1);
  expect(route.motionP95Max, route.summary).toBeLessThanOrEqual(
    THIN_MOTION_P95_MAX,
  );
  expect(route.motionMax, route.summary).toBeLessThanOrEqual(THIN_MOTION_MAX);
  const firstThin = frames[0];
  if (firstThin === undefined) {
    throw new Error("The thin-detail recipe produced no presented frames.");
  }
  await attachTemporalStressAcceptance(testInfo, page, {
    tick: firstThin.tick,
    controlRevision: firstThin.controlRevision,
    prewarm,
    artisticControls: TRAA_STABILITY_CONTROLS,
    temporalStress: createTemporalStressEvidence({
      id: "thin-detail-jitter-only-hold",
      startTick: THIN_TICK,
      ticksPerFrame: 0,
      primePresentations: THIN_PRIME_PRESENTATIONS,
      frameCount: THIN_FRAMES,
      runs: [
        {
          id: "default",
          cameraPath: Array.from({ length: THIN_FRAMES }, () => HORIZON_CAMERA),
          artisticControls: TRAA_STABILITY_CONTROLS,
          waterPreset: SWELL_WATER_PRESET,
          reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          lighting: REFERENCE_ENVIRONMENT_LIGHTING,
          prime,
          frames: temporalStressCaptures(frames),
        },
      ],
      thresholds: {
        unionMin: THIN_UNION_MIN,
        perFrameMin: THIN_PER_FRAME_MIN,
        activeFramesMin: THIN_ACTIVE_FRAMES_MIN,
        madSampleMin: THIN_MAD_SAMPLE_MIN,
        currentMadP75Min: THIN_CURRENT_MAD_P75_MIN,
        finalMadRatioMax: THIN_FINAL_MAD_RATIO_MAX,
        ratioSampleMin: THIN_RATIO_SAMPLE_MIN,
        gradientRatioMedianMin: THIN_GRADIENT_RATIO_MEDIAN_MIN,
        coverageRetainMin: THIN_COVERAGE_RETAIN_MIN,
        minFrameRetainMin: THIN_COVERAGE_RETAIN_MIN,
        tracksMin: THIN_TRACK_MIN,
        trackFramesMin: THIN_TRACK_FRAMES_MIN,
        maxConsecutiveMissing: 1,
        differingFramesMin: 1,
        motionP95Max: THIN_MOTION_P95_MAX,
        motionMax: THIN_MOTION_MAX,
      },
      observed: {
        unionCount: route.unionCount,
        minFrameThin: route.minFrameThin,
        activeFrames: route.activeFrames,
        madSamples: route.madSamples,
        currentMadP75: route.currentMadP75,
        finalMadP75: route.finalMadP75,
        finalMadRatio:
          route.currentMadP75 === 0
            ? 0
            : route.finalMadP75 / route.currentMadP75,
        ratioSamples: route.ratioSamples,
        gradientRatioMedian: route.gradientRatioMedian,
        coverageRetain: route.coverageRetain,
        minFrameRetain: route.minFrameRetain,
        trackedComponents: route.trackedComponents,
        trackedComponentFrames: route.trackedComponentFrames,
        maxConsecutiveMissing: route.maxConsecutiveMissing,
        differingFrames: route.differingFrames,
        motionP95Max: route.motionP95Max,
        motionMax: route.motionMax,
      },
    }),
  });
});

test("replays sixteen fixed-tick TRAA frames with an identical jitter sequence after reset", async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const result = await page.evaluate(
    async ({ camera, seed }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const drive = async () => {
        await harness.reset({ seed });
        await harness.setCamera(camera, { transition: "continuous" });
        await harness.present();
        await harness.reset({ seed });
        await harness.setCamera(camera, { transition: "continuous" });
        const frames: Array<{
          readonly presentation: QaPresentationReceiptV16;
          readonly current: string;
          readonly final: string;
          readonly motion: string;
          readonly glint: string;
        }> = [];
        for (let frame = 0; frame < 16; frame += 1) {
          await harness.advanceTicks(1);
          const presentation = await harness.present();
          frames.push({
            presentation,
            current: (await harness.capture("current-color")).data,
            final: (await harness.capture("final-color")).data,
            motion: (await harness.capture("motion-vector")).data,
            glint: (await harness.capture("optical-glint")).data,
          });
        }
        return frames;
      };
      return {
        first: await drive(),
        replay: await drive(),
      };
    },
    { camera: OBLIQUE_CAMERA, seed: SEED },
  );

  expect(result.first).toHaveLength(16);
  const firstEpoch = result.first[0]?.presentation.temporal.historyEpoch;
  expect(firstEpoch).toBeGreaterThan(1);
  expect(result.first[0]?.presentation.temporal).toEqual({
    historyEpoch: firstEpoch,
    resetReason: "qa-reset",
    resetFrame: true,
  });
  expect(
    result.first
      .slice(1)
      .every(
        (frame) =>
          frame.presentation.temporal.historyEpoch === firstEpoch &&
          frame.presentation.temporal.resetReason === null &&
          frame.presentation.temporal.resetFrame === false,
      ),
  ).toBe(true);
  expect(
    result.first.some(
      (frame, index) => index > 0 && frame.current !== frame.final,
    ),
  ).toBe(true);

  expect(result.replay).toHaveLength(result.first.length);
  for (const [index, frame] of result.first.entries()) {
    const replay = result.replay[index];
    expect(replay, `replay frame ${String(index)}`).toBeDefined();
    if (replay === undefined) {
      continue;
    }
    const replayBase =
      result.replay[0]?.presentation.temporal.historyEpoch ?? 0;
    expect(
      associationWithoutPresentationId(replay.presentation, replayBase),
      `temporal association frame ${String(index)}`,
    ).toEqual(associationWithoutPresentationId(frame.presentation, firstEpoch));
    expect(
      captureReplayMismatch(replay.current, frame.current),
      `current-color frame ${String(index)}`,
    ).toBeNull();
    expect(
      captureReplayMismatch(replay.final, frame.final),
      `final-color frame ${String(index)}`,
    ).toBeNull();
    expect(
      captureReplayMismatch(replay.motion, frame.motion),
      `motion-vector frame ${String(index)}`,
    ).toBeNull();
    expect(
      captureReplayMismatch(replay.glint, frame.glint),
      `optical-glint frame ${String(index)}`,
    ).toBeNull();
  }
});

const SWELL_CONTROLS = {
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
  whitecapAmount: 0,
  foamPersistence: 0,
  underwaterHaze: 1,
  underwaterTurbidity: 1,
  underwaterLightShafts: 1,
  underwaterColor: 1,
  underwaterExposure: 1,
} as const;

const PAN_CAMERA = {
  ...OBLIQUE_CAMERA,
  position: [0.45, 10, 18] as const,
} satisfies QaCameraV1;

const CUT_CAMERA = {
  ...OBLIQUE_CAMERA,
  position: [16, 8, -12] as const,
  target: [2, 0, 1] as const,
} satisfies QaCameraV1;

test("camera-cut resets TRAA history once; a continuous pan does not", async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const result = await page.evaluate(
    async ({ seed, setup, pan, cut }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const primed = await primePresentedFrames(harness, seed, setup);
      await harness.setCamera(pan, { transition: "continuous" });
      const continuous = await harness.present();
      await harness.setCamera(cut, { transition: "camera-cut" });
      const cutFrame = await capturePresentedBuffers(harness);
      const stable = await harness.present();
      return { primed, continuous, cut: cutFrame, stable };

      async function primePresentedFrames(
        qa: QaHarnessV16,
        nextSeed: number,
        camera: QaCameraV1,
      ) {
        await qa.reset({ seed: nextSeed });
        await qa.setCamera(camera, { transition: "continuous" });
        await qa.present();
        let presentation!: QaPresentationReceiptV16;
        for (let frame = 0; frame < 8; frame += 1) {
          await qa.advanceTicks(1);
          presentation = await qa.present();
        }
        return {
          presentation,
          ...(await readPresentedBuffers(qa)),
        };
      }

      async function capturePresentedBuffers(qa: QaHarnessV16) {
        const presentation = await qa.present();
        return {
          presentation,
          ...(await readPresentedBuffers(qa)),
        };
      }

      async function readPresentedBuffers(qa: QaHarnessV16) {
        return {
          current: (await qa.capture("current-color")).data,
          final: (await qa.capture("final-color")).data,
          fresnel: (await qa.capture("optical-fresnel")).data,
          depth: (await qa.capture("depth")).data,
          normal: (await qa.capture("normal")).data,
        };
      }
    },
    {
      seed: SEED,
      setup: OBLIQUE_CAMERA,
      pan: PAN_CAMERA,
      cut: CUT_CAMERA,
    },
  );

  expect(result.continuous.temporal).toEqual({
    historyEpoch: result.primed.presentation.temporal.historyEpoch,
    resetReason: null,
    resetFrame: false,
  });
  expect(result.continuous.cameraRevision).toBeGreaterThan(
    result.primed.presentation.cameraRevision,
  );
  expect(result.continuous.motion.current.cameraCutRevision).toBe(
    result.primed.presentation.motion.current.cameraCutRevision,
  );
  expectResetEquivalence(
    result.primed,
    result.cut,
    result.stable,
    "camera-cut",
  );
  expect(result.cut.presentation.motion.current.cameraCutRevision).toBe(
    result.primed.presentation.motion.current.cameraCutRevision + 1,
  );
});

test("origin-shift resets TRAA history once; the same origin does not", async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const result = await page.evaluate(
    async ({ seed, camera }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const primed = await primePresentedFrames(harness, seed, camera);
      const same = await harness.setOrigin({ x: 0, z: 0 });
      const continuous = await harness.present();
      const shifted = await harness.setOrigin({ x: 24, z: -16 });
      const cut = await capturePresentedBuffers(harness);
      const stable = await harness.present();
      return { primed, same, continuous, shifted, cut, stable };

      async function primePresentedFrames(
        qa: QaHarnessV16,
        nextSeed: number,
        nextCamera: QaCameraV1,
      ) {
        await qa.reset({ seed: nextSeed });
        await qa.setCamera(nextCamera, { transition: "continuous" });
        await qa.present();
        let presentation!: QaPresentationReceiptV16;
        for (let frame = 0; frame < 8; frame += 1) {
          await qa.advanceTicks(1);
          presentation = await qa.present();
        }
        return {
          presentation,
          current: (await qa.capture("current-color")).data,
          final: (await qa.capture("final-color")).data,
          fresnel: (await qa.capture("optical-fresnel")).data,
          depth: (await qa.capture("depth")).data,
          normal: (await qa.capture("normal")).data,
        };
      }

      async function capturePresentedBuffers(qa: QaHarnessV16) {
        const presentation = await qa.present();
        return {
          presentation,
          current: (await qa.capture("current-color")).data,
          final: (await qa.capture("final-color")).data,
          fresnel: (await qa.capture("optical-fresnel")).data,
          depth: (await qa.capture("depth")).data,
          normal: (await qa.capture("normal")).data,
        };
      }
    },
    { seed: SEED, camera: OBLIQUE_CAMERA },
  );

  expect(result.same.originRevision).toBe(
    result.primed.presentation.originRevision,
  );
  expect(result.continuous.temporal).toEqual({
    historyEpoch: result.primed.presentation.temporal.historyEpoch,
    resetReason: null,
    resetFrame: false,
  });
  expect(result.shifted.originRevision).toBeGreaterThan(
    result.primed.presentation.originRevision,
  );
  expectResetEquivalence(
    result.primed,
    result.cut,
    result.stable,
    "origin-shift",
  );
});

test("sea-state-cut resets TRAA history once; a continuous control change does not", async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const result = await page.evaluate(
    async ({ seed, camera, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const primed = await primePresentedFrames(harness, seed, camera);
      const continuousReceipt = await harness.updateArtisticControls(
        { ...controls, waveStrength: 1.4 },
        { transition: "continuous" },
      );
      const continuous = await harness.present();
      const cutReceipt = await harness.updateArtisticControls(
        { ...controls, waveStrength: 1.4 },
        { transition: "sea-state-cut" },
      );
      const cut = await capturePresentedBuffers(harness);
      const stable = await harness.present();
      return {
        primed,
        continuousReceipt,
        continuous,
        cutReceipt,
        cut,
        stable,
      };

      async function primePresentedFrames(
        qa: QaHarnessV16,
        nextSeed: number,
        nextCamera: QaCameraV1,
      ) {
        await qa.reset({ seed: nextSeed });
        await qa.setCamera(nextCamera, { transition: "continuous" });
        await qa.present();
        let presentation!: QaPresentationReceiptV16;
        for (let frame = 0; frame < 8; frame += 1) {
          await qa.advanceTicks(1);
          presentation = await qa.present();
        }
        return {
          presentation,
          current: (await qa.capture("current-color")).data,
          final: (await qa.capture("final-color")).data,
          fresnel: (await qa.capture("optical-fresnel")).data,
          depth: (await qa.capture("depth")).data,
          normal: (await qa.capture("normal")).data,
        };
      }

      async function capturePresentedBuffers(qa: QaHarnessV16) {
        const presentation = await qa.present();
        return {
          presentation,
          current: (await qa.capture("current-color")).data,
          final: (await qa.capture("final-color")).data,
          fresnel: (await qa.capture("optical-fresnel")).data,
          depth: (await qa.capture("depth")).data,
          normal: (await qa.capture("normal")).data,
        };
      }
    },
    { seed: SEED, camera: OBLIQUE_CAMERA, controls: SWELL_CONTROLS },
  );

  expect(result.continuousReceipt).toMatchObject({
    changed: true,
    transition: "continuous",
    seaStateCutRevision: 0,
  });
  expect(result.continuous.controlRevision).toBeGreaterThan(
    result.primed.presentation.controlRevision,
  );
  expect(result.continuous.temporal).toEqual({
    historyEpoch: result.primed.presentation.temporal.historyEpoch,
    resetReason: null,
    resetFrame: false,
  });
  expect(result.continuous.motion.current.seaStateCutRevision).toBe(0);
  expect(result.cutReceipt).toMatchObject({
    changed: false,
    transition: "sea-state-cut",
    seaStateCutRevision: 1,
  });
  expectResetEquivalence(
    result.primed,
    result.cut,
    result.stable,
    "sea-state-cut",
  );
  expect(result.cut.presentation.motion.current.seaStateCutRevision).toBe(1);
});

interface QaResetFrameCaptures {
  readonly presentation: QaPresentationReceiptV16;
  readonly current: string;
  readonly final: string;
  readonly fresnel: string;
  readonly depth: string;
  readonly normal: string;
}

function expectResetEquivalence(
  primed: QaResetFrameCaptures,
  cut: QaResetFrameCaptures,
  stable: QaPresentationReceiptV16,
  reason: "camera-cut" | "origin-shift" | "sea-state-cut",
): void {
  expect(cut.presentation.temporal).toEqual({
    historyEpoch: primed.presentation.temporal.historyEpoch + 1,
    resetReason: reason,
    resetFrame: true,
  });
  expect(cut.presentation.motion.previous).toEqual(
    cut.presentation.motion.current,
  );
  expect(stable.temporal).toEqual({
    historyEpoch: cut.presentation.temporal.historyEpoch,
    resetReason: null,
    resetFrame: false,
  });
  expect(cut.presentation.compileCount).toBe(primed.presentation.compileCount);
  expect(cut.presentation.manifestHash).toBe(primed.presentation.manifestHash);
  expect(cut.presentation.prewarm).toEqual(primed.presentation.prewarm);
  const diffs = waterMaskedChannelAbsDiffs(
    decodeUint8(cut.current),
    decodeUint8(cut.final),
    decodeFloat32(cut.fresnel),
    decodeFloat32(cut.depth),
    decodeFloat32(cut.normal),
    VIEWPORT.width,
    VIEWPORT.height,
  );
  expect(diffs.length).toBeGreaterThan(0);
  expect(percentile(diffs, 99)).toBeLessThanOrEqual(1);
  expect(maxOf(diffs)).toBeLessThanOrEqual(1);
}

function captureReplayMismatch(left: string, right: string): string | null {
  if (left === right) {
    return null;
  }
  const first = Buffer.from(left, "base64");
  const second = Buffer.from(right, "base64");
  let differing = 0;
  let maxAbs = 0;
  const length = Math.min(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    const delta = Math.abs((first[index] ?? 0) - (second[index] ?? 0));
    if (delta === 0) {
      continue;
    }
    differing += 1;
    if (delta > maxAbs) {
      maxAbs = delta;
    }
  }
  return `${String(differing)} differing bytes, maxAbs=${String(maxAbs)}, lengths=${String(first.length)}/${String(second.length)}`;
}

interface GlintCapturedFrame extends EncodedFrameBuffers {
  readonly tick: number;
  readonly presentationId: number;
  readonly seed: number;
  readonly timeSeconds: number;
  readonly cameraRevision: number;
  readonly cameraCutRevision: number;
  readonly controlRevision: number;
  readonly seaStateCutRevision: number;
  readonly originRevision: number;
  readonly simulationResetRevision: number;
  readonly historyEpoch: number;
  readonly resetReason: string | null;
  readonly resetFrame: boolean;
  readonly manifestHash: string;
  readonly compileCount: number;
  readonly prewarm: QaFramePrewarmReceipt;
}

interface ThinCapturedFrame extends EncodedFrameBuffers {
  readonly tick: number;
  readonly presentationId: number;
  readonly manifestHash: string;
  readonly seed: number;
  readonly timeSeconds: number;
  readonly cameraRevision: number;
  readonly cameraCutRevision: number;
  readonly controlRevision: number;
  readonly seaStateCutRevision: number;
  readonly originRevision: number;
  readonly simulationResetRevision: number;
  readonly historyEpoch: number;
  readonly resetReason: string | null;
  readonly resetFrame: boolean;
}

function fastPanCamera(frame: number): QaCameraV1 {
  return {
    ...HORIZON_CAMERA,
    target: [FAST_PAN_TARGET_X, 0, -60 + frame * 8],
  };
}

function glintStrafeCamera(frame: number): QaCameraV1 {
  const offsetZ = frame * GLINT_STRAFE_METRES;
  return {
    ...HORIZON_CAMERA,
    position: [
      HORIZON_CAMERA.position[0],
      HORIZON_CAMERA.position[1],
      HORIZON_CAMERA.position[2] + offsetZ,
    ],
    target: [
      HORIZON_CAMERA.target[0],
      HORIZON_CAMERA.target[1],
      HORIZON_CAMERA.target[2] + offsetZ,
    ],
  };
}

function temporalStressCaptures(
  frames: readonly TemporalStressFrameCaptureInput[],
): readonly TemporalStressFrameCaptureInput[] {
  return frames.map((frame) => ({
    tick: frame.tick,
    presentationId: frame.presentationId,
    manifestHash: frame.manifestHash,
    seed: frame.seed,
    timeSeconds: frame.timeSeconds,
    cameraRevision: frame.cameraRevision,
    cameraCutRevision: frame.cameraCutRevision,
    controlRevision: frame.controlRevision,
    seaStateCutRevision: frame.seaStateCutRevision,
    originRevision: frame.originRevision,
    simulationResetRevision: frame.simulationResetRevision,
    historyEpoch: frame.historyEpoch,
    resetReason: frame.resetReason,
    resetFrame: frame.resetFrame,
    current: frame.current,
    final: frame.final,
    motion: frame.motion,
    depth: frame.depth,
    normal: frame.normal,
    fresnel: frame.fresnel,
    glint: frame.glint,
  }));
}

async function attachTemporalStressAcceptance(
  testInfo: TestInfo,
  page: Page,
  details: {
    readonly tick: number;
    readonly controlRevision: number;
    readonly prewarm: QaFramePrewarmReceipt;
    readonly artisticControls: ArtisticControls;
    readonly temporalStress: ReturnType<typeof createTemporalStressEvidence>;
  },
): Promise<void> {
  await attachRegressionAcceptance(testInfo, page, {
    seed: SEED,
    tick: details.tick,
    camera: HORIZON_CAMERA,
    controlRevision: details.controlRevision,
    coreManifest: coreManifestEvidence(details.prewarm.core),
    qaPrewarm: details.prewarm,
    captures: [
      { width: details.prewarm.width, height: details.prewarm.height },
    ],
    qaHarness: TEMPORAL_QA_HARNESS,
    qaCapture: TEMPORAL_QA_CAPTURE,
    artisticControls: details.artisticControls,
    waterPreset: SWELL_WATER_PRESET,
    environment: {
      reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      lighting: REFERENCE_ENVIRONMENT_LIGHTING,
    },
    temporalStress: details.temporalStress,
  });
}

function assertGlintLightingExceptRadius(
  onLighting: HostEnvironmentState,
  offLighting: HostEnvironmentState,
): void {
  const onRest = environmentStateWithoutRadius(onLighting);
  const offRest = environmentStateWithoutRadius(offLighting);
  expect(offRest, "glint on/off environment except radius").toEqual(onRest);
  expect(onLighting.sunAngularRadiusRadians).toBe(GLINT_ON_RADIUS);
  expect(offLighting.sunAngularRadiusRadians).toBe(GLINT_OFF_RADIUS);
}

function environmentStateWithoutRadius(
  lighting: HostEnvironmentState,
): Omit<HostEnvironmentState, "sunAngularRadiusRadians"> {
  return Object.fromEntries(
    Object.entries(lighting).filter(
      ([key]) => key !== "sunAngularRadiusRadians",
    ),
  ) as Omit<HostEnvironmentState, "sunAngularRadiusRadians">;
}

function assertGlintCommonSource(
  onFrame: GlintCapturedFrame,
  offFrame: GlintCapturedFrame,
  index: number,
): void {
  const prefix = `glint pair ${String(index)}`;
  expect(offFrame.motion, `${prefix} motion`).toBe(onFrame.motion);
  expect(offFrame.depth, `${prefix} depth`).toBe(onFrame.depth);
  expect(offFrame.normal, `${prefix} normal`).toBe(onFrame.normal);
  expect(offFrame.fresnel, `${prefix} fresnel`).toBe(onFrame.fresnel);
  expect(offFrame.tick, `${prefix} tick`).toBe(onFrame.tick);
  expect(offFrame.cameraRevision, `${prefix} cameraRevision`).toBe(
    onFrame.cameraRevision,
  );
  expect(offFrame.cameraCutRevision, `${prefix} cameraCut`).toBe(
    onFrame.cameraCutRevision,
  );
  expect(offFrame.controlRevision, `${prefix} controlRevision`).toBe(
    onFrame.controlRevision,
  );
  expect(offFrame.seaStateCutRevision, `${prefix} seaStateCut`).toBe(
    onFrame.seaStateCutRevision,
  );
  expect(offFrame.originRevision, `${prefix} originRevision`).toBe(
    onFrame.originRevision,
  );
  expect(offFrame.manifestHash, `${prefix} manifestHash`).toBe(
    onFrame.manifestHash,
  );
  expect(offFrame.compileCount, `${prefix} compileCount`).toBe(
    onFrame.compileCount,
  );
  expect(offFrame.prewarm, `${prefix} prewarm`).toEqual(onFrame.prewarm);
}

function assertGlintRouteReceipts(
  frames: readonly GlintCapturedFrame[],
  label: string,
): void {
  const first = frames[0];
  if (first === undefined) {
    throw new Error(
      `The ${label} glint-strafe recipe produced no presented frames.`,
    );
  }
  expect(first.tick, `${label} first tick`).toBe(GLINT_START_TICK + 1);
  for (const [index, frame] of frames.entries()) {
    const prefix = `${label} frame ${String(index)}`;
    expect(frame.tick, `${prefix} tick`).toBe(first.tick + index);
    expect(frame.historyEpoch, `${prefix} epoch`).toBe(first.historyEpoch);
    expect(frame.resetReason, `${prefix} resetReason`).toBeNull();
    expect(frame.resetFrame, `${prefix} resetFrame`).toBe(false);
    expect(frame.cameraCutRevision, `${prefix} cameraCut`).toBe(
      first.cameraCutRevision,
    );
    if (index > 0) {
      expect(frame.cameraRevision, `${prefix} cameraRevision`).toBeGreaterThan(
        frames[index - 1]?.cameraRevision ?? 0,
      );
    }
  }
}

function assertThinDetailReceipts(frames: readonly ThinCapturedFrame[]): void {
  const first = frames[0];
  if (first === undefined) {
    throw new Error("The thin-detail recipe produced no presented frames.");
  }
  for (const [index, frame] of frames.entries()) {
    const prefix = `thin frame ${String(index)}`;
    expect(frame.tick, `${prefix} tick`).toBe(THIN_TICK);
    expect(frame.historyEpoch, `${prefix} epoch`).toBe(first.historyEpoch);
    expect(frame.cameraRevision, `${prefix} cameraRevision`).toBe(
      first.cameraRevision,
    );
    expect(frame.cameraCutRevision, `${prefix} cameraCut`).toBe(
      first.cameraCutRevision,
    );
    expect(frame.controlRevision, `${prefix} controlRevision`).toBe(
      first.controlRevision,
    );
    expect(frame.seaStateCutRevision, `${prefix} seaStateCut`).toBe(
      first.seaStateCutRevision,
    );
    expect(frame.originRevision, `${prefix} originRevision`).toBe(
      first.originRevision,
    );
    expect(
      frame.simulationResetRevision,
      `${prefix} simulationResetRevision`,
    ).toBe(first.simulationResetRevision);
    expect(frame.resetReason, `${prefix} resetReason`).toBeNull();
    expect(frame.resetFrame, `${prefix} resetFrame`).toBe(false);
  }
}
