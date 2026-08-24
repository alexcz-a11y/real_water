import { expect, test, type Page } from "@playwright/test";
import {
  createMinimalWaterQualityProfile,
  createWaterPreset,
  type ArtisticControls,
  type HostEnvironmentState,
} from "real-water";
import {
  QA_CAPTURE_SCHEMA,
  QA_CAPTURE_VERSION,
  QA_HARNESS_CAPTURE_NAMES,
  QA_HARNESS_SCHEMA,
  QA_HARNESS_VERSION,
  type QaCameraV1,
  type QaHarnessV15,
} from "../src/qa-harness.js";
import { REFERENCE_ENVIRONMENT_LIGHTING } from "../src/reference-optical-inputs.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32 } from "./qa-capture-bytes.js";
import {
  attachRegressionAcceptance,
  coreManifestEvidence,
} from "./regression-acceptance.js";

const VIEWPORT = { width: 320, height: 180 } as const;
const SEED = 0x22_000_001;
const BASE_TICK = 30;
const SHALLOW_BOUNDS = { x0: 0.08, x1: 0.32, y0: 0.2, y1: 0.8 } as const;
const DEEP_BOUNDS = { x0: 0.68, x1: 0.92, y0: 0.2, y1: 0.8 } as const;
const RECEIVER_GAP_BOUNDS = {
  x0: 0.46,
  x1: 0.54,
  y0: 0.15,
  y1: 0.85,
} as const;

const SWELL_CONTROLS = createWaterPreset("swell").artisticControls;
const FLAT_SURFACE_CONTROLS = Object.freeze({
  ...SWELL_CONTROLS,
  waveStrength: 0,
  swellDrama: 0,
  directionality: 0,
  choppiness: 0,
  crestSharpness: 0,
  microDetail: 0,
}) satisfies ArtisticControls;
const CAUSTICS_ENVIRONMENT = Object.freeze({
  ...REFERENCE_ENVIRONMENT_LIGHTING,
  sunDirectionX: 0.28,
  sunDirectionY: 0.92,
  sunDirectionZ: 0.27,
}) satisfies HostEnvironmentState;
const NEAR_RECEIVER_CAMERA = Object.freeze({
  projection: "perspective",
  position: [0, 12, -40] as const,
  target: [0, 0, -40] as const,
  up: [0, 0, -1] as const,
  verticalFovDegrees: 40,
  near: 0.05,
  far: 100,
}) satisfies QaCameraV1;
const OUT_OF_RANGE_CAMERA = Object.freeze({
  ...NEAR_RECEIVER_CAMERA,
  position: [0, 52, -40] as const,
}) satisfies QaCameraV1;
const CAUSTICS_POLICY = createMinimalWaterQualityProfile().underwater.caustics;

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

test("replays caustics from the prepared surface and changes only with authoritative surface input", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ camera, environment, flat, seed, swell, tick }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV15 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const captureAt = async (
        nextTick: number,
        controls: ArtisticControls,
        localImpact = false,
      ) => {
        await harness.reset({ seed });
        await harness.advanceTicks(nextTick - (localImpact ? 1 : 0));
        await harness.setSeaLevel({ metres: 20 });
        await harness.updateEnvironmentLighting(environment);
        await harness.updateArtisticControls(controls, {
          transition: "continuous",
        });
        await harness.setHostSceneForegroundFixture(false);
        await harness.setCamera(camera, { transition: "camera-cut" });
        if (localImpact) {
          await harness.updateInteractionAnchor({ x: 6, z: -34 });
          await harness.submitDisturbances({
            kind: "radial-impact",
            count: 1,
            ids: Uint32Array.of(0x22),
            positions: Float32Array.of(6, 0, -34),
            radii: Float32Array.of(12),
            amplitudes: Float32Array.of(2),
            priorities: Uint8Array.of(255),
          });
          // The prepared caustic local-surface field is a fixed-tick snapshot
          // with an explicit maximum age of one tick.
          await harness.advanceTicks(1);
        }
        const presentation = await harness.present();
        const [caustics, depth, normal] = await Promise.all([
          harness.capture("underwater-caustics"),
          harness.capture("depth"),
          harness.capture("normal"),
        ]);
        return {
          caustics: caustics.data,
          depth: depth.data,
          normal: normal.data,
          presentation,
        };
      };

      const baseline = await captureAt(tick, swell);
      const replay = await captureAt(tick, swell);
      const flatSurface = await captureAt(tick, flat);
      const evolvedSurface = await captureAt(tick + 30, swell);
      const localBaseline = await captureAt(tick + 1, swell);
      const localImpact = await captureAt(tick + 1, swell, true);
      return {
        baseline,
        replay,
        flatSurface,
        evolvedSurface,
        localBaseline,
        localImpact,
      };
    },
    {
      camera: NEAR_RECEIVER_CAMERA,
      environment: CAUSTICS_ENVIRONMENT,
      flat: FLAT_SURFACE_CONTROLS,
      seed: SEED,
      swell: SWELL_CONTROLS,
      tick: BASE_TICK,
    },
  );

  expect(result.replay.caustics).toBe(result.baseline.caustics);
  expect(result.replay.depth).toBe(result.baseline.depth);
  expect(result.replay.normal).toBe(result.baseline.normal);
  const receiverGeometry = (sample: typeof result.baseline) => {
    const depth = decodeFloat32(sample.depth);
    const normal = decodeFloat32(sample.normal);
    return {
      depth: [
        ...regionValues(depth, VIEWPORT.width, VIEWPORT.height, SHALLOW_BOUNDS),
        ...regionValues(depth, VIEWPORT.width, VIEWPORT.height, DEEP_BOUNDS),
      ],
      normal: [
        ...regionValues(
          normal,
          VIEWPORT.width,
          VIEWPORT.height,
          SHALLOW_BOUNDS,
          3,
        ),
        ...regionValues(
          normal,
          VIEWPORT.width,
          VIEWPORT.height,
          DEEP_BOUNDS,
          3,
        ),
      ],
    };
  };
  expect(receiverGeometry(result.flatSurface)).toEqual(
    receiverGeometry(result.baseline),
  );
  expect(receiverGeometry(result.evolvedSurface)).toEqual(
    receiverGeometry(result.baseline),
  );
  expect(receiverGeometry(result.localImpact)).toEqual(
    receiverGeometry(result.localBaseline),
  );
  expect(result.flatSurface.caustics).not.toBe(result.baseline.caustics);
  expect(result.evolvedSurface.caustics).not.toBe(result.baseline.caustics);
  expect(result.localImpact.caustics).not.toBe(result.localBaseline.caustics);

  for (const sample of [
    result.replay,
    result.flatSurface,
    result.evolvedSurface,
    result.localBaseline,
    result.localImpact,
  ]) {
    expect(sample.presentation.manifestHash).toBe(
      result.baseline.presentation.manifestHash,
    );
    expect(sample.presentation.compileCount).toBe(
      result.baseline.presentation.compileCount,
    );
    expect(sample.presentation.prewarm.progress).toEqual(
      result.baseline.presentation.prewarm.progress,
    );
  }
});

test("gates caustics independently to bounded visible underwater receivers", async ({
  page,
}, testInfo) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({
      environment,
      nearCamera,
      outOfRangeCamera,
      seed,
      swell,
      tick,
    }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV15 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const captureAt = async (camera: QaCameraV1, seaLevelMetres: number) => {
        await harness.reset({ seed });
        await harness.advanceTicks(tick);
        await harness.setSeaLevel({ metres: seaLevelMetres });
        await harness.updateEnvironmentLighting(environment);
        await harness.updateArtisticControls(swell, {
          transition: "continuous",
        });
        await harness.setHostSceneForegroundFixture(false);
        await harness.setCamera(camera, { transition: "camera-cut" });
        const presentation = await harness.present();
        const caustics = await harness.capture("underwater-caustics");
        return {
          caustics: caustics.data,
          height: caustics.height,
          presentation,
          width: caustics.width,
        };
      };

      return {
        near: await captureAt(nearCamera, 20),
        outOfRange: await captureAt(outOfRangeCamera, 60),
      };
    },
    {
      environment: CAUSTICS_ENVIRONMENT,
      nearCamera: NEAR_RECEIVER_CAMERA,
      outOfRangeCamera: OUT_OF_RANGE_CAMERA,
      seed: SEED,
      swell: SWELL_CONTROLS,
      tick: BASE_TICK,
    },
  );

  expect(CAUSTICS_POLICY).toMatchObject({
    mode: "prepared-surface-visible-receivers",
    maxReceiverDistanceMetres: 48,
    diagnosticsFormat: "rgba16float",
    localSurfaceFieldFormat: "rgba16float",
    localSurfaceFieldLayout: "height-slope-x-slope-z-vertical-velocity",
    localSurfaceFieldResolutionPolicy: "match-unified-foam-field",
    localSurfaceFieldUpdateCadence: "host-fixed-tick",
    maxLocalSurfaceSnapshotAgeTicks: 1,
    updateCadence: "host-present",
  });
  expect(result.near.presentation.prewarm.core.effectVariants).toContainEqual({
    effectId: "underwater-caustics",
    variantId: "prepared-surface-visible-receivers",
  });
  expect(
    result.near.presentation.prewarm.core.declarations.some(
      ({ id }) => id === "water-underwater-caustics-diagnostics-target",
    ),
  ).toBe(true);
  expect(result.near.presentation.captureNames).toContain(
    "underwater-caustics",
  );

  const near = decodeFloat32(result.near.caustics);
  const shallow = regionValues(
    near,
    result.near.width,
    result.near.height,
    SHALLOW_BOUNDS,
  );
  const deep = regionValues(
    near,
    result.near.width,
    result.near.height,
    DEEP_BOUNDS,
  );
  const receiverGap = regionValues(
    near,
    result.near.width,
    result.near.height,
    RECEIVER_GAP_BOUNDS,
  );
  expect(near.every((value) => value >= 0 && value <= 1)).toBe(true);
  expect(Math.max(...shallow)).toBeGreaterThan(0.005);
  expect(Math.max(...deep)).toBeGreaterThan(0.002);
  expect(mean(shallow)).toBeGreaterThan(mean(deep));
  expect(Math.max(...receiverGap)).toBeLessThan(1e-5);

  const outOfRange = decodeFloat32(result.outOfRange.caustics);
  expect(outOfRange.every((value) => value === 0)).toBe(true);
  expect(result.outOfRange.presentation.manifestHash).toBe(
    result.near.presentation.manifestHash,
  );
  expect(result.outOfRange.presentation.compileCount).toBe(
    result.near.presentation.compileCount,
  );

  await attachRegressionAcceptance(testInfo, page, {
    seed: result.near.presentation.seed,
    tick: result.near.presentation.tick,
    seaLevelMetres: 20,
    camera: NEAR_RECEIVER_CAMERA,
    controlRevision: result.near.presentation.controlRevision,
    coreManifest: coreManifestEvidence(result.near.presentation.prewarm.core),
    qaPrewarm: result.near.presentation.prewarm,
    captures: [
      {
        width: result.near.width,
        height: result.near.height,
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
    artisticControls: SWELL_CONTROLS,
  });
});

function regionValues(
  values: ArrayLike<number>,
  width: number,
  height: number,
  bounds: {
    readonly x0: number;
    readonly x1: number;
    readonly y0: number;
    readonly y1: number;
  },
  components = 1,
): number[] {
  const selected: number[] = [];
  const x0 = Math.floor(width * bounds.x0);
  const x1 = Math.ceil(width * bounds.x1);
  const y0 = Math.floor(height * bounds.y0);
  const y1 = Math.ceil(height * bounds.y1);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (y * width + x) * components;
      for (let component = 0; component < components; component += 1) {
        selected.push(values[index + component] ?? 0);
      }
    }
  }
  return selected;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}
