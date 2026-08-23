import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
  WATER_PRESET_SCHEMA,
  WATER_PRESET_VERSION,
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
  type QaHarnessV10,
} from "../src/qa-harness.js";
import { REFERENCE_ENVIRONMENT_LIGHTING } from "../src/reference-optical-inputs.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import {
  decodeFloat32,
  decodeUint8,
  meanAbsDifference,
} from "./qa-capture-bytes.js";
import {
  attachRegressionAcceptance,
  coreManifestEvidence,
  createPresentationFrameEvidence,
  isAdmittedOpticalScreenshotProfile,
  readOpticalScreenshotProfile,
  regressionAcceptanceArtifacts,
  sha256Buffer,
} from "./regression-acceptance.js";

const VIEWPORT = { width: 320, height: 180 } as const;
const HORIZON_WATER_BOUNDS = { x0: 0, x1: 1, y0: 0.58, y1: 1 } as const;
const HORIZON_WATER_CLIP = {
  x: 0,
  y: Math.round(VIEWPORT.height * HORIZON_WATER_BOUNDS.y0),
  width: VIEWPORT.width,
  height:
    VIEWPORT.height - Math.round(VIEWPORT.height * HORIZON_WATER_BOUNDS.y0),
} as const;
const NADIR_REFRACTION_CLIP = {
  x: Math.round(VIEWPORT.width * 0.08),
  y: Math.round(VIEWPORT.height * 0.2),
  width: Math.round(VIEWPORT.width * 0.84),
  height: Math.round(VIEWPORT.height * 0.6),
} as const;
const REGION_SNAPSHOT_MAX_DIFF_PIXEL_RATIO = 0.01;
const SWELL_PRESET = createWaterPreset("swell");
const OPTICAL_QA_HARNESS = {
  schema: QA_HARNESS_SCHEMA,
  version: QA_HARNESS_VERSION,
} as const;
const OPTICAL_QA_CAPTURE = {
  schema: QA_CAPTURE_SCHEMA,
  version: QA_CAPTURE_VERSION,
  names: QA_HARNESS_CAPTURE_NAMES,
} as const;

test.describe.configure({ mode: "serial" });

const DOWN_CAMERA = {
  projection: "perspective" as const,
  position: [0, 12, -40] as const,
  target: [0, 0, -40] as const,
  up: [0, 0, -1] as const,
  verticalFovDegrees: 40,
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

const MISS_CAMERA = {
  projection: "perspective" as const,
  position: [0, 12, 80] as const,
  target: [0, 0, 80] as const,
  up: [0, 0, -1] as const,
  verticalFovDegrees: 40,
  near: 0.1,
  far: 100,
} satisfies QaCameraV1;

const FOREGROUND_CAMERA = {
  projection: "perspective" as const,
  position: [-20, 12, -40] as const,
  target: [-20, 0, -40] as const,
  up: [0, 0, -1] as const,
  verticalFovDegrees: 40,
  near: 0.1,
  far: 100,
} satisfies QaCameraV1;

const DEEP_ONLY_CAMERA = {
  projection: "perspective" as const,
  position: [10, 12, -40] as const,
  target: [10, 0, -40] as const,
  up: [0, 0, -1] as const,
  verticalFovDegrees: 40,
  near: 0.1,
  far: 100,
} satisfies QaCameraV1;

const ROTATED_DOWN_CAMERA = {
  ...DOWN_CAMERA,
  up: [0, 0, 1] as const,
} satisfies QaCameraV1;

const ROLL_90_CAMERA = {
  ...DOWN_CAMERA,
  up: [1, 0, 0] as const,
} satisfies QaCameraV1;

const YAW_CAMERA = {
  projection: "perspective" as const,
  position: [5, 12, -35] as const,
  target: [0, 0, -40] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 40,
  near: 0.1,
  far: 100,
} satisfies QaCameraV1;

const OFF_AXIS_CAMERA = {
  projection: "perspective" as const,
  position: [6, 10, -30] as const,
  target: [0, 0, -40] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 40,
  near: 0.1,
  far: 100,
} satisfies QaCameraV1;

const FLAT_CONTROLS = {
  waveStrength: 0,
  swellDrama: 0,
  directionality: 0,
  choppiness: 0,
  crestSharpness: 0,
  microDetail: 0,
  timeScale: 0,
  grazingReflection: 1,
  environmentReflection: 1,
  depthSeeThrough: 1,
  depthColoring: 1,
  inWaterGlow: 1,
  crestGlow: 1,
  whitecapAmount: 0,
  foamPersistence: 0,
} satisfies ArtisticControls;

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
} satisfies ArtisticControls;

const BACKLIT_SUN = {
  ...REFERENCE_ENVIRONMENT_LIGHTING,
  sunDirectionX: 1,
  sunDirectionY: 0.2,
  sunDirectionZ: 0,
} satisfies HostEnvironmentState;

const FRONTLIT_SUN = {
  ...REFERENCE_ENVIRONMENT_LIGHTING,
  sunDirectionX: -1,
  sunDirectionY: 0.2,
  sunDirectionZ: 0,
} satisfies HostEnvironmentState;

const NADIR_BACKLIT_SUN = {
  ...REFERENCE_ENVIRONMENT_LIGHTING,
  sunDirectionX: 0,
  sunDirectionY: -1,
  sunDirectionZ: 0,
} satisfies HostEnvironmentState;

const NADIR_FRONTLIT_SUN = {
  ...REFERENCE_ENVIRONMENT_LIGHTING,
  sunDirectionX: 0,
  sunDirectionY: 1,
  sunDirectionZ: 0,
} satisfies HostEnvironmentState;

const DARK_SUN = {
  ...REFERENCE_ENVIRONMENT_LIGHTING,
  sunIntensity: 0,
} satisfies HostEnvironmentState;

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

test("captures color, depth, normal, and optical intermediates", async ({
  page,
}, testInfo) => {
  await openQaStage(page);
  const result = await page.evaluate(async (camera) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x4000_0000 });
    await harness.advanceTicks(24);
    await harness.setCamera(camera, { transition: "continuous" });
    const presentation = await harness.present();
    const captures = await Promise.all(
      harness.captureNames.map((name) => harness.capture(name)),
    );
    const depth = captures.find((capture) => capture.name === "depth");
    return {
      names: captures.map((capture) => capture.name),
      versions: captures.map((capture) => capture.version),
      seed: presentation.seed,
      tick: presentation.tick,
      timeSeconds: presentation.timeSeconds,
      simulationResetRevision: presentation.simulationResetRevision,
      presentationId: presentation.presentationId,
      manifestHash: presentation.manifestHash,
      depth: depth?.data,
      width: depth?.width,
      height: depth?.height,
      controlRevision: presentation.controlRevision,
      qaPrewarm: presentation.prewarm,
    };
  }, DOWN_CAMERA);

  expect(result.names).toEqual([
    "final-color",
    "current-color",
    "depth",
    "normal",
    "motion-vector",
    "whitecap-generation",
    "whitecap-history",
    "whitecap-advection",
    "whitecap-decay",
    "optical-fresnel",
    "optical-thickness",
    "optical-scattering",
    "optical-environment-reflection",
    "optical-crest-transmission",
    "optical-transmittance",
    "optical-glint",
    "planar-color",
    "planar-target-alpha",
    "ssr-hit",
    "ssr-confidence",
    "ssr-color",
    "ssr-roughness",
    "reflection-base-color",
    "ssr-composite-color",
    "ssr-history-color",
    "ssr-history-frame-weight",
    "ssr-history-input-color",
  ]);
  expect(result.versions.every((version) => version === 10)).toBe(true);
  expect(result.depth).toBeDefined();
  const downDepth = decodeFloat32(result.depth ?? "");
  expect(downDepth.every((value) => Number.isFinite(value))).toBe(true);
  const inRange =
    downDepth.filter((value) => value > 5 && value < 20).length /
    downDepth.length;
  expect(inRange).toBeGreaterThan(0.99);
  attachScreenshotFrameReceipt(testInfo, "optical-nadir-refraction.png", {
    seed: result.seed,
    tick: result.tick,
    timeSeconds: result.timeSeconds,
    simulationResetRevision: result.simulationResetRevision,
    presentationId: result.presentationId,
    controlRevision: result.controlRevision,
    manifestHash: result.manifestHash,
  });
  const nadirSnapshot = await expectClippedCanvasSnapshot(
    page,
    testInfo,
    "optical-nadir-refraction.png",
    NADIR_REFRACTION_CLIP,
    result.qaPrewarm.rendererDevice,
  );
  const downEvidence = await attachRegressionAcceptance(testInfo, page, {
    seed: result.seed,
    tick: result.tick,
    camera: DOWN_CAMERA,
    controlRevision: result.controlRevision,
    coreManifest: coreManifestEvidence(result.qaPrewarm.core),
    qaPrewarm: result.qaPrewarm,
    captures: [
      { width: result.qaPrewarm.width, height: result.qaPrewarm.height },
    ],
    qaHarness: OPTICAL_QA_HARNESS,
    qaCapture: OPTICAL_QA_CAPTURE,
    artisticControls: SWELL_PRESET.artisticControls,
    waterPreset: {
      schema: WATER_PRESET_SCHEMA,
      version: WATER_PRESET_VERSION,
      id: SWELL_PRESET.id,
      presetHash: SWELL_PRESET.presetHash,
    },
    environment: {
      reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      lighting: REFERENCE_ENVIRONMENT_LIGHTING,
    },
    screenshot: {
      name: "optical-nadir-refraction.png",
      asserted: nadirSnapshot.asserted,
      authoritative: nadirSnapshot.authoritative,
      criticalRegion: {
        kind: "clip",
        ...NADIR_REFRACTION_CLIP,
        reason:
          "The nadir clip covers the Host 1 m and 21 m refraction fixtures without the full-canvas score.",
      },
    },
  });
  expect(downEvidence.qaHarness).toEqual(OPTICAL_QA_HARNESS);
  expect(downEvidence.artisticControls).toEqual(SWELL_PRESET.artisticControls);
});

test("reports metric optical thickness from the Host 1m and 21m scene-depth fixtures", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({
      downCamera,
      missCamera,
      foregroundCamera,
      deepOnlyCamera,
      rotatedCamera,
      roll90Camera,
      yawCamera,
      offAxisCamera,
      controls,
    }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const presentThickness = async (camera: QaCameraV1) => {
        await harness.setCamera(camera, { transition: "continuous" });
        await harness.present();
        const thickness = await harness.capture("optical-thickness");
        return {
          data: thickness.data,
          width: thickness.width,
          height: thickness.height,
        };
      };

      await harness.reset({ seed: 0x4000_0000 });
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      const down = await presentThickness(downCamera);
      const miss = await presentThickness(missCamera);
      const foreground = await presentThickness(foregroundCamera);
      const deepOnly = await presentThickness(deepOnlyCamera);
      const rotated = await presentThickness(rotatedCamera);
      const roll90 = await presentThickness(roll90Camera);
      const yaw = await presentThickness(yawCamera);
      const offAxis = await presentThickness(offAxisCamera);
      await harness.setOrigin({ x: 80, z: 80 });
      const afterOrigin = await presentThickness(downCamera);
      await harness.updateArtisticControls(
        {
          ...controls,
          grazingReflection: 2,
          environmentReflection: 2,
          depthSeeThrough: 2,
          depthColoring: 2,
          inWaterGlow: 2,
          crestGlow: 2,
        },
        {
          transition: "continuous",
        },
      );
      const extreme = await presentThickness(downCamera);
      return {
        down,
        miss,
        foreground,
        deepOnly,
        rotated,
        roll90,
        yaw,
        offAxis,
        afterOrigin,
        extreme,
      };
    },
    {
      downCamera: DOWN_CAMERA,
      missCamera: MISS_CAMERA,
      foregroundCamera: FOREGROUND_CAMERA,
      deepOnlyCamera: DEEP_ONLY_CAMERA,
      rotatedCamera: ROTATED_DOWN_CAMERA,
      roll90Camera: ROLL_90_CAMERA,
      yawCamera: YAW_CAMERA,
      offAxisCamera: OFF_AXIS_CAMERA,
      controls: FLAT_CONTROLS,
    },
  );

  const down = decodeFloat32(result.down.data);
  const miss = decodeFloat32(result.miss.data);
  const foreground = decodeFloat32(result.foreground.data);
  const deepOnly = decodeFloat32(result.deepOnly.data);
  const rotated = decodeFloat32(result.rotated.data);
  const roll90 = decodeFloat32(result.roll90.data);
  const yaw = decodeFloat32(result.yaw.data);
  const offAxis = decodeFloat32(result.offAxis.data);
  const afterOrigin = decodeFloat32(result.afterOrigin.data);
  const extreme = decodeFloat32(result.extreme.data);
  const shallowMetres = mean(
    insetHalf(down, result.down.width, result.down.height, "left"),
  );
  const deepMetres = mean(
    insetHalf(down, result.down.width, result.down.height, "right"),
  );
  const rotatedShallow = mean(
    insetHalf(rotated, result.rotated.width, result.rotated.height, "right"),
  );
  const rotatedDeep = mean(
    insetHalf(rotated, result.rotated.width, result.rotated.height, "left"),
  );
  const originShallow = mean(
    insetHalf(
      afterOrigin,
      result.afterOrigin.width,
      result.afterOrigin.height,
      "left",
    ),
  );
  const originDeep = mean(
    insetHalf(
      afterOrigin,
      result.afterOrigin.width,
      result.afterOrigin.height,
      "right",
    ),
  );

  expect(down.every((value) => Number.isFinite(value) && value >= 0)).toBe(
    true,
  );
  expect(miss.every((value) => Number.isFinite(value) && value >= 0)).toBe(
    true,
  );
  expect(
    foreground.every((value) => Number.isFinite(value) && value >= 0),
  ).toBe(true);
  expect(deepOnly.every((value) => Number.isFinite(value) && value >= 0)).toBe(
    true,
  );
  expect(rotated.every((value) => Number.isFinite(value) && value >= 0)).toBe(
    true,
  );
  expect(
    afterOrigin.every((value) => Number.isFinite(value) && value >= 0),
  ).toBe(true);
  expect(extreme.every((value) => Number.isFinite(value) && value >= 0)).toBe(
    true,
  );
  expect(shallowMetres).toBeGreaterThan(0.7);
  expect(shallowMetres).toBeLessThan(1.4);
  expect(deepMetres).toBeGreaterThan(20);
  expect(deepMetres).toBeLessThan(22.2);
  expectMissOrForegroundThickness(
    centerBand(miss, result.miss.width, result.miss.height),
  );
  expectMissOrForegroundThickness(
    centerBand(foreground, result.foreground.width, result.foreground.height),
  );
  expect(
    mean(centerBand(deepOnly, result.deepOnly.width, result.deepOnly.height)),
  ).toBeGreaterThan(20);
  expect(rotatedShallow).toBeGreaterThan(0.7);
  expect(rotatedShallow).toBeLessThan(1.4);
  expect(rotatedDeep).toBeGreaterThan(20);
  expect(originShallow).toBeGreaterThan(0.7);
  expect(originShallow).toBeLessThan(1.4);
  expect(originDeep).toBeGreaterThan(20);
  expect(mean(extreme)).toBeGreaterThan(0);

  const rollTop = mean(
    insetBand(roll90, result.roll90.width, result.roll90.height, "top"),
  );
  const rollBottom = mean(
    insetBand(roll90, result.roll90.width, result.roll90.height, "bottom"),
  );
  expect(roll90.every((value) => Number.isFinite(value) && value >= 0)).toBe(
    true,
  );
  expect(Math.abs(rollTop - rollBottom)).toBeGreaterThan(10);
  expect(Math.min(rollTop, rollBottom)).toBeGreaterThan(0.7);
  expect(Math.max(rollTop, rollBottom)).toBeGreaterThan(20);
  expect(yaw.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  expect(offAxis.every((value) => Number.isFinite(value) && value >= 0)).toBe(
    true,
  );
  const yawWater = yaw.filter((value) => value > 0.2);
  const offAxisWater = offAxis.filter((value) => value > 0.2);
  expect(Math.min(...yawWater)).toBeLessThan(4);
  expect(Math.max(...yawWater)).toBeGreaterThan(18);
  expect(Math.max(...yawWater) - Math.min(...yawWater)).toBeGreaterThan(10);
  expect(Math.min(...offAxisWater)).toBeLessThan(6);
  expect(Math.max(...offAxisWater)).toBeGreaterThan(15);
  expect(Math.max(...offAxisWater) - Math.min(...offAxisWater)).toBeGreaterThan(
    8,
  );
  expect(seamJump(down, result.down.width, result.down.height)).toBeGreaterThan(
    10,
  );
});

test("makes Fresnel, environment, refraction, absorption, scattering, and crest transmission art-directable", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({
      downCamera,
      horizonCamera,
      swell,
      flat,
      defaultLighting,
      backlit,
      frontlit,
      nadirBacklit,
      nadirFrontlit,
      dark,
    }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }

      const capturePresented = async (camera: QaCameraV1) => {
        await harness.setCamera(camera, { transition: "continuous" });
        const presentation = await harness.present();
        const [
          color,
          depth,
          normal,
          fresnel,
          thickness,
          scattering,
          environmentReflectionFactor,
          crest,
          transmittance,
          glint,
        ] = await Promise.all([
          harness.capture("final-color"),
          harness.capture("depth"),
          harness.capture("normal"),
          harness.capture("optical-fresnel"),
          harness.capture("optical-thickness"),
          harness.capture("optical-scattering"),
          harness.capture("optical-environment-reflection"),
          harness.capture("optical-crest-transmission"),
          harness.capture("optical-transmittance"),
          harness.capture("optical-glint"),
        ]);
        return {
          presentation,
          controlRevision: presentation.controlRevision,
          color: color.data,
          depth: depth.data,
          normal: normal.data,
          fresnel: fresnel.data,
          thickness: thickness.data,
          scattering: scattering.data,
          environmentReflectionFactor: environmentReflectionFactor.data,
          crest: crest.data,
          transmittance: transmittance.data,
          glint: glint.data,
          width: color.width,
          height: color.height,
        };
      };
      const presentIsolated = async (
        camera: QaCameraV1,
        nextControls: ArtisticControls,
        lighting: HostEnvironmentState = defaultLighting,
      ) => {
        await harness.reset({ seed: 0x4000_0000 });
        await harness.advanceTicks(24);
        const appliedLighting =
          await harness.updateEnvironmentLighting(lighting);
        await harness.updateArtisticControls(nextControls, {
          transition: "continuous",
        });
        return {
          ...(await capturePresented(camera)),
          lighting: appliedLighting,
        };
      };

      const fresnelOff = await presentIsolated(horizonCamera, {
        ...swell,
        grazingReflection: 0,
      });
      const fresnelOn = await presentIsolated(horizonCamera, {
        ...swell,
        grazingReflection: 2,
      });
      const environmentOff = await presentIsolated(horizonCamera, {
        ...swell,
        environmentReflection: 0,
      });
      const environmentOn = await presentIsolated(horizonCamera, {
        ...swell,
        environmentReflection: 2,
      });
      const refractionOff = await presentIsolated(downCamera, {
        ...swell,
        depthSeeThrough: 0,
      });
      const refractionOn = await presentIsolated(downCamera, {
        ...swell,
        depthSeeThrough: 2,
      });
      const absorptionOff = await presentIsolated(downCamera, {
        ...swell,
        depthColoring: 0,
      });
      const absorptionOn = await presentIsolated(downCamera, {
        ...swell,
        depthColoring: 2,
      });
      const scatteringOff = await presentIsolated(downCamera, {
        ...swell,
        inWaterGlow: 0,
      });
      const scatteringOn = await presentIsolated(downCamera, {
        ...swell,
        inWaterGlow: 2,
      });
      const scatterBack = await presentIsolated(
        downCamera,
        swell,
        nadirBacklit,
      );
      const scatterFront = await presentIsolated(
        downCamera,
        swell,
        nadirFrontlit,
      );
      const scatterDark = await presentIsolated(downCamera, swell, dark);
      const crestOff = await presentIsolated(
        horizonCamera,
        {
          ...swell,
          crestGlow: 0,
        },
        backlit,
      );
      const crestOn = await presentIsolated(
        horizonCamera,
        {
          ...swell,
          crestGlow: 2,
        },
        backlit,
      );
      const crestNoSun = await presentIsolated(
        horizonCamera,
        {
          ...swell,
          crestGlow: 2,
        },
        dark,
      );
      const crestFront = await presentIsolated(
        horizonCamera,
        {
          ...swell,
          crestGlow: 2,
        },
        frontlit,
      );
      const crestFlat = await presentIsolated(
        horizonCamera,
        {
          ...flat,
          crestGlow: 2,
        },
        backlit,
      );
      const crestThin = await presentIsolated(
        horizonCamera,
        {
          ...swell,
          crestGlow: 2,
        },
        backlit,
      );
      const horizonDefault = await presentIsolated(horizonCamera, swell);

      return {
        fresnelOff,
        fresnelOn,
        environmentOff,
        environmentOn,
        refractionOff,
        refractionOn,
        absorptionOff,
        absorptionOn,
        scatteringOff,
        scatteringOn,
        scatterBack,
        scatterFront,
        scatterDark,
        crestOff,
        crestOn,
        crestNoSun,
        crestFront,
        crestFlat,
        crestThin,
        darkLighting: crestNoSun.lighting,
        frontLighting: crestFront.lighting,
        horizonDefault,
        qaPrewarm: horizonDefault.presentation.prewarm,
      };
    },
    {
      downCamera: DOWN_CAMERA,
      horizonCamera: HORIZON_CAMERA,
      swell: SWELL_CONTROLS,
      flat: FLAT_CONTROLS,
      defaultLighting: REFERENCE_ENVIRONMENT_LIGHTING,
      backlit: BACKLIT_SUN,
      frontlit: FRONTLIT_SUN,
      nadirBacklit: NADIR_BACKLIT_SUN,
      nadirFrontlit: NADIR_FRONTLIT_SUN,
      dark: DARK_SUN,
    },
  );

  expect(
    mean(
      regionValues(
        decodeFloat32(result.fresnelOn.fresnel),
        result.fresnelOn.width,
        result.fresnelOn.height,
        HORIZON_WATER_BOUNDS,
      ),
    ),
  ).toBeGreaterThan(
    mean(
      regionValues(
        decodeFloat32(result.fresnelOff.fresnel),
        result.fresnelOff.width,
        result.fresnelOff.height,
        HORIZON_WATER_BOUNDS,
      ),
    ) + 0.02,
  );
  expect(
    meanAbsDifference(
      regionValues(
        decodeUint8(result.fresnelOn.color),
        result.fresnelOn.width,
        result.fresnelOn.height,
        HORIZON_WATER_BOUNDS,
        4,
      ),
      regionValues(
        decodeUint8(result.fresnelOff.color),
        result.fresnelOff.width,
        result.fresnelOff.height,
        HORIZON_WATER_BOUNDS,
        4,
      ),
    ),
  ).toBeGreaterThan(1);
  expectPreservedSurface(result.fresnelOff, result.fresnelOn);
  expect(
    meanAbsDifference(
      regionValues(
        decodeUint8(result.environmentOn.color),
        result.environmentOn.width,
        result.environmentOn.height,
        HORIZON_WATER_BOUNDS,
        4,
      ),
      regionValues(
        decodeUint8(result.environmentOff.color),
        result.environmentOff.width,
        result.environmentOff.height,
        HORIZON_WATER_BOUNDS,
        4,
      ),
    ),
  ).toBeGreaterThan(2);
  expect(
    mean(decodeFloat32(result.environmentOn.environmentReflectionFactor)),
  ).toBeGreaterThan(
    mean(decodeFloat32(result.environmentOff.environmentReflectionFactor)) +
      0.02,
  );
  expectPreservedSurface(result.environmentOff, result.environmentOn);
  expect(
    meanAbsDifference(
      decodeUint8(result.refractionOn.color),
      decodeUint8(result.refractionOff.color),
    ),
  ).toBeGreaterThan(1);
  expectPreservedSurface(result.refractionOff, result.refractionOn);
  expect(
    meanAbsDifference(
      decodeFloat32(result.refractionOn.thickness),
      decodeFloat32(result.refractionOff.thickness),
    ),
  ).toBeGreaterThan(0.05);
  expect(
    meanAbsDifference(
      decodeUint8(result.absorptionOn.color),
      decodeUint8(result.absorptionOff.color),
    ),
  ).toBeGreaterThan(1);
  expectPreservedGeometry(result.absorptionOff, result.absorptionOn);
  expect(
    mean(decodeFloat32(result.absorptionOff.transmittance)),
  ).toBeGreaterThan(
    mean(decodeFloat32(result.absorptionOn.transmittance)) + 0.02,
  );
  expect(mean(decodeFloat32(result.scatteringOn.scattering))).toBeGreaterThan(
    mean(decodeFloat32(result.scatteringOff.scattering)) + 0.02,
  );
  expect(
    meanAbsDifference(
      decodeUint8(result.scatteringOn.color),
      decodeUint8(result.scatteringOff.color),
    ),
  ).toBeGreaterThan(1);
  expectPreservedGeometry(result.scatteringOff, result.scatteringOn);
  expect(mean(decodeFloat32(result.scatterBack.scattering))).toBeGreaterThan(
    mean(decodeFloat32(result.scatterFront.scattering)) + 0.01,
  );
  expect(
    Math.max(...decodeFloat32(result.scatterDark.scattering)),
  ).toBeLessThan(1e-5);
  const crestOn = mean(
    regionValues(
      decodeFloat32(result.crestOn.crest),
      result.crestOn.width,
      result.crestOn.height,
      HORIZON_WATER_BOUNDS,
    ),
  );
  const crestOff = mean(
    regionValues(
      decodeFloat32(result.crestOff.crest),
      result.crestOff.width,
      result.crestOff.height,
      HORIZON_WATER_BOUNDS,
    ),
  );
  const crestNoSunValues = regionValues(
    decodeFloat32(result.crestNoSun.crest),
    result.crestNoSun.width,
    result.crestNoSun.height,
    HORIZON_WATER_BOUNDS,
  );
  const crestNoSun = mean(crestNoSunValues);
  const glintNoSunValues = regionValues(
    decodeFloat32(result.crestNoSun.glint),
    result.crestNoSun.width,
    result.crestNoSun.height,
    HORIZON_WATER_BOUNDS,
  );
  const crestFront = mean(
    regionValues(
      decodeFloat32(result.crestFront.crest),
      result.crestFront.width,
      result.crestFront.height,
      HORIZON_WATER_BOUNDS,
    ),
  );
  const crestThin = mean(
    regionValues(
      decodeFloat32(result.crestThin.crest),
      result.crestThin.width,
      result.crestThin.height,
      HORIZON_WATER_BOUNDS,
    ),
  );
  const crestFlat = mean(
    regionValues(
      decodeFloat32(result.crestFlat.crest),
      result.crestFlat.width,
      result.crestFlat.height,
      HORIZON_WATER_BOUNDS,
    ),
  );
  expect(crestOn).toBeGreaterThan(crestOff + 0.01);
  expect(
    meanAbsDifference(
      regionValues(
        decodeUint8(result.crestOn.color),
        result.crestOn.width,
        result.crestOn.height,
        HORIZON_WATER_BOUNDS,
        4,
      ),
      regionValues(
        decodeUint8(result.crestOff.color),
        result.crestOff.width,
        result.crestOff.height,
        HORIZON_WATER_BOUNDS,
        4,
      ),
    ),
  ).toBeGreaterThan(1);
  expectPreservedSurface(result.crestOff, result.crestOn);
  expect(result.darkLighting.sunIntensity).toBe(0);
  expect(result.frontLighting.sunDirectionX).toBe(-1);
  expect(result.crestNoSun.presentation.seed).toBe(
    result.crestOn.presentation.seed,
  );
  expect(result.crestNoSun.presentation.tick).toBe(
    result.crestOn.presentation.tick,
  );
  expect(Math.max(...crestNoSunValues)).toBeLessThan(1e-5);
  expect(percentile99(crestNoSunValues)).toBeLessThan(1e-5);
  expect(Math.max(...glintNoSunValues)).toBeLessThan(1e-5);
  expect(crestOn).toBeGreaterThan(crestFront + 0.01);
  expect(crestThin).toBeGreaterThan(crestFlat + 0.01);
  expect(crestOn).toBeGreaterThan(crestNoSun + 0.01);
});

test("captures an isolated stock-TRAA horizon golden after eight prime presents", async ({
  page,
}, testInfo) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ camera, swell, lighting }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x4000_0000 });
      await harness.advanceTicks(24);
      await harness.updateEnvironmentLighting(lighting);
      await harness.updateArtisticControls(swell, {
        transition: "continuous",
      });
      await harness.setCamera(camera, { transition: "continuous" });
      for (let prime = 0; prime < 8; prime += 1) {
        await harness.present();
      }
      const presentation = await harness.present();
      const current = await harness.capture("current-color");
      const finalColor = await harness.capture("final-color");
      const glint = await harness.capture("optical-glint");
      return {
        presentation,
        current: current.data,
        final: finalColor.data,
        glint: glint.data,
        qaPrewarm: presentation.prewarm,
      };
    },
    {
      camera: HORIZON_CAMERA,
      swell: SWELL_CONTROLS,
      lighting: REFERENCE_ENVIRONMENT_LIGHTING,
    },
  );

  const current = decodeUint8(result.current);
  const finalColor = decodeUint8(result.final);
  expect(current.length).toBe(finalColor.length);
  expect(current.length).toBe(VIEWPORT.width * VIEWPORT.height * 4);
  const diff = new Uint8Array(current.length);
  let rgbDiffCoverage = 0;
  for (let index = 0; index < current.length; index += 4) {
    const dr = Math.abs((current[index] ?? 0) - (finalColor[index] ?? 0));
    const dg = Math.abs(
      (current[index + 1] ?? 0) - (finalColor[index + 1] ?? 0),
    );
    const db = Math.abs(
      (current[index + 2] ?? 0) - (finalColor[index + 2] ?? 0),
    );
    diff[index] = dr;
    diff[index + 1] = dg;
    diff[index + 2] = db;
    if (dr > 0 || dg > 0 || db > 0) {
      rgbDiffCoverage += 1;
    }
  }
  const digest = (bytes: Uint8Array): string =>
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const currentDigest = digest(current);
  const finalDigest = digest(finalColor);
  const glintDigest = digest(decodeUint8(result.glint));
  const diffDigest = digest(diff);
  expect(currentDigest).not.toBe(finalDigest);
  expect(rgbDiffCoverage).toBeGreaterThan(0);

  const receipt = {
    name: "optical-horizon-glint-crest.png",
    seed: result.presentation.seed,
    tick: result.presentation.tick,
    timeSeconds: result.presentation.timeSeconds,
    simulationResetRevision: result.presentation.simulationResetRevision,
    presentationId: result.presentation.presentationId,
    historyEpoch: result.presentation.temporal.historyEpoch,
    resetReason: result.presentation.temporal.resetReason,
    controlRevision: result.presentation.controlRevision,
    manifestHash: result.presentation.manifestHash,
    currentDigest,
    finalDigest,
    glintDigest,
    diffDigest,
    rgbDiffCoverage,
  };
  console.log(`screenshot-frame-receipt ${JSON.stringify(receipt)}`);
  testInfo.annotations.push({
    type: "screenshot-frame-receipt",
    description: JSON.stringify(receipt),
  });

  const horizonSnapshot = await expectClippedCanvasSnapshot(
    page,
    testInfo,
    "optical-horizon-glint-crest.png",
    HORIZON_WATER_CLIP,
    result.qaPrewarm.rendererDevice,
  );
  const artifacts = regressionAcceptanceArtifacts(testInfo);
  const baselineSnapshotSha256 = sha256Buffer(
    await readFile(testInfo.snapshotPath("optical-horizon-glint-crest.png")),
  );
  const horizonEvidence = await attachRegressionAcceptance(testInfo, page, {
    seed: result.presentation.seed,
    tick: result.presentation.tick,
    camera: HORIZON_CAMERA,
    controlRevision: result.presentation.controlRevision,
    coreManifest: coreManifestEvidence(result.qaPrewarm.core),
    qaPrewarm: result.qaPrewarm,
    captures: [
      { width: result.qaPrewarm.width, height: result.qaPrewarm.height },
    ],
    presentationFrame: createPresentationFrameEvidence({
      presentationId: result.presentation.presentationId,
      historyEpoch: result.presentation.temporal.historyEpoch,
      resetReason: result.presentation.temporal.resetReason,
      resetFrame: result.presentation.temporal.resetFrame,
      simulationResetRevision: result.presentation.simulationResetRevision,
      seed: result.presentation.seed,
      tick: result.presentation.tick,
      timeSeconds: result.presentation.timeSeconds,
      controlRevision: result.presentation.controlRevision,
      cameraCutRevision: result.presentation.cameraCutRevision,
      seaStateCutRevision: result.presentation.seaStateCutRevision,
      originRevision: result.presentation.originRevision,
      manifestHash: result.presentation.manifestHash,
      camera: HORIZON_CAMERA,
      clip: HORIZON_WATER_CLIP,
      snapshotName: "optical-horizon-glint-crest.png",
      pngAttachmentName: artifacts.pngFileName,
      pngAttachmentPath: artifacts.pngRelativePath,
      pngAttachmentContentType: "image/png",
      screenshotPng: horizonSnapshot.png,
      baselineSnapshotSha256,
      currentDigest,
      finalDigest,
      glintDigest,
      diffDigest,
      rgbDiffCoverage,
    }),
    qaHarness: OPTICAL_QA_HARNESS,
    qaCapture: OPTICAL_QA_CAPTURE,
    artisticControls: SWELL_CONTROLS,
    waterPreset: {
      schema: WATER_PRESET_SCHEMA,
      version: WATER_PRESET_VERSION,
      id: SWELL_PRESET.id,
      presetHash: SWELL_PRESET.presetHash,
    },
    environment: {
      reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      lighting: REFERENCE_ENVIRONMENT_LIGHTING,
    },
    screenshot: {
      name: "optical-horizon-glint-crest.png",
      asserted: horizonSnapshot.asserted,
      authoritative: horizonSnapshot.authoritative,
      criticalRegion: {
        kind: "clip",
        ...HORIZON_WATER_CLIP,
        reason:
          "The upper canvas is empty sky; the clip is the sea surface below the horizon, where glint and crest live.",
      },
    },
    screenshotPng: horizonSnapshot.png,
  });
  expect(horizonEvidence.qaCapture).toEqual(OPTICAL_QA_CAPTURE);
  expect(horizonEvidence.environment).toEqual({
    reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
    lighting: REFERENCE_ENVIRONMENT_LIGHTING,
  });
});

test("replays 32 paused continuous-control presents with live stock jitter", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ camera, swell }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const runRecipe = async () => {
        await harness.reset({ seed: 0x4000_0000 });
        await harness.updateArtisticControls(swell, {
          transition: "continuous",
        });
        await harness.setCamera(camera, { transition: "continuous" });
        const frames: Array<{
          readonly resetFrame: boolean;
          readonly data: string;
        }> = [];
        for (let index = 0; index < 32; index += 1) {
          await harness.updateArtisticControls(swell, {
            transition: "continuous",
          });
          const presentation = await harness.present();
          const color = await harness.capture("current-color");
          frames.push({
            resetFrame: presentation.temporal.resetFrame,
            data: color.data,
          });
        }
        return frames;
      };
      const first = await runRecipe();
      const replay = await runRecipe();
      return { first, replay };
    },
    { camera: HORIZON_CAMERA, swell: SWELL_CONTROLS },
  );

  expect(result.first).toHaveLength(32);
  expect(result.first[0]?.resetFrame).toBe(true);
  expect(new Set(result.first.map((frame) => frame.data)).size).toBeGreaterThan(
    1,
  );
  expect(result.replay.map((frame) => frame.data)).toEqual(
    result.first.map((frame) => frame.data),
  );
});

test("ignores Host scene environment and lights and follows only the Environment Adapter", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ camera, lighting }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const presentAligned = async () => {
        await harness.reset({ seed: 0x4000_0000 });
        await harness.setCamera(camera, { transition: "continuous" });
        await harness.present();
        await harness.reset({ seed: 0x4000_0000 });
        await harness.advanceTicks(24);
        await harness.setCamera(camera, { transition: "continuous" });
        const presentation = await harness.present();
        const captures = await Promise.all(
          harness.captureNames.map((name) => harness.capture(name)),
        );
        return {
          presentation,
          compileCount: presentation.compileCount,
          probeCount: presentation.probeCount,
          prewarm: presentation.prewarm.progress,
          captures: Object.fromEntries(
            captures.map((capture) => [capture.name, capture.data]),
          ) as Record<string, string>,
        };
      };

      await harness.reset({ seed: 0x4000_0000 });
      await harness.setHostSceneLightingDecoy(false);
      const baseline = await presentAligned();
      await harness.setHostSceneLightingDecoy(true);
      const decoy = await presentAligned();
      await harness.setHostSceneLightingDecoy(false);
      const cleared = await presentAligned();
      await harness.updateEnvironmentLighting({
        ...lighting,
        environmentIntensity: 0,
      });
      const adapted = await presentAligned();
      return { baseline, decoy, cleared, adapted };
    },
    {
      camera: HORIZON_CAMERA,
      lighting: REFERENCE_ENVIRONMENT_LIGHTING,
    },
  );

  const shadingNames = [
    "final-color",
    "current-color",
    "depth",
    "normal",
    "motion-vector",
    "whitecap-generation",
    "whitecap-history",
    "whitecap-advection",
    "whitecap-decay",
    "optical-fresnel",
    "optical-thickness",
    "optical-scattering",
    "optical-environment-reflection",
    "optical-crest-transmission",
    "optical-transmittance",
    "optical-glint",
  ] as const;
  expect(Object.keys(result.baseline.captures)).toHaveLength(27);
  expect(
    Object.fromEntries(
      shadingNames.map((name) => [name, result.decoy.captures[name]]),
    ),
  ).toEqual(
    Object.fromEntries(
      shadingNames.map((name) => [name, result.baseline.captures[name]]),
    ),
  );
  expect(
    Object.fromEntries(
      shadingNames.map((name) => [name, result.cleared.captures[name]]),
    ),
  ).toEqual(
    Object.fromEntries(
      shadingNames.map((name) => [name, result.baseline.captures[name]]),
    ),
  );
  expect(result.decoy.compileCount).toBe(result.baseline.compileCount);
  expect(result.cleared.compileCount).toBe(result.baseline.compileCount);
  expect(result.decoy.prewarm).toEqual(result.baseline.prewarm);
  expect(result.cleared.prewarm).toEqual(result.baseline.prewarm);
  expect(result.decoy.probeCount - result.baseline.probeCount).toBe(
    result.cleared.probeCount - result.decoy.probeCount,
  );
  expect(result.adapted.captures["final-color"]).not.toBe(
    result.baseline.captures["final-color"],
  );
});

test("updates glint from a hot sun angular radius without re-preparing", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ camera, lighting, wideSun }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV10 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x4000_0000 });
      await harness.advanceTicks(24);
      await harness.setCamera(camera, { transition: "continuous" });
      const firstPresentation = await harness.present();
      const firstGlint = await harness.capture("optical-glint");
      const updated = await harness.updateEnvironmentLighting(wideSun);
      const secondPresentation = await harness.present();
      const secondGlint = await harness.capture("optical-glint");
      return {
        firstPresentation,
        secondPresentation,
        firstGlint: firstGlint.data,
        secondGlint: secondGlint.data,
        updated,
        lighting,
        prewarmFirst: firstPresentation.prewarm.progress,
        prewarmSecond: secondPresentation.prewarm.progress,
      };
    },
    {
      camera: HORIZON_CAMERA,
      lighting: REFERENCE_ENVIRONMENT_LIGHTING,
      wideSun: {
        ...REFERENCE_ENVIRONMENT_LIGHTING,
        sunAngularRadiusRadians: 0.2,
      },
    },
  );

  expect(result.updated.sunAngularRadiusRadians).toBe(0.2);
  expect(result.secondPresentation.controlRevision).toBe(
    result.firstPresentation.controlRevision,
  );
  expect(result.secondPresentation.manifestHash).toBe(
    result.firstPresentation.manifestHash,
  );
  expect(result.prewarmSecond).toEqual(result.prewarmFirst);
  expect(result.secondGlint).not.toBe(result.firstGlint);
});

function attachScreenshotFrameReceipt(
  testInfo: TestInfo,
  name: string,
  receipt: {
    readonly seed: number;
    readonly tick: number;
    readonly timeSeconds: number;
    readonly simulationResetRevision: number;
    readonly presentationId: number;
    readonly controlRevision: number;
    readonly manifestHash: string;
  },
): void {
  const serialized = JSON.stringify({ name, ...receipt });
  console.log(`screenshot-frame-receipt ${serialized}`);
  testInfo.annotations.push({
    type: "screenshot-frame-receipt",
    description: serialized,
  });
}

async function expectClippedCanvasSnapshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  clip: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  rendererDevice: unknown,
): Promise<{
  readonly asserted: boolean;
  readonly authoritative: boolean;
  readonly png: Buffer;
  readonly pngSha256: string;
}> {
  const box = await page.locator("canvas").boundingBox();
  if (box === null) {
    throw new Error("The reference canvas has no layout box.");
  }
  const png = await page.screenshot({
    animations: "disabled",
    caret: "hide",
    clip: {
      x: box.x + clip.x,
      y: box.y + clip.y,
      width: clip.width,
      height: clip.height,
    },
    scale: "css",
  });
  expect(png.readUInt32BE(16)).toBe(clip.width);
  expect(png.readUInt32BE(20)).toBe(clip.height);
  const pngSha256 = sha256Buffer(png);
  const profile = await readOpticalScreenshotProfile(
    page,
    testInfo,
    rendererDevice,
  );
  if (!isAdmittedOpticalScreenshotProfile(profile)) {
    testInfo.annotations.push({
      type: "optical-screenshot-profile",
      description: `Screenshot assertion is not authoritative for ${name}; running ${profile.cpuModel} / ${profile.os} ${profile.osRelease} / Chrome ${profile.chromeVersion} / ${profile.powerState} / lowpowermode=${String(profile.lowPowerMode)} / rendererDevice=${profile.rendererDeviceFingerprint ?? "null"} / headless=${String(profile.headless)} is not the admitted Apple M5 / Darwin 27.0.0 / AC / lowpowermode=0 / headless Chrome 151.0.7922.169 / rendererDevice sha256:6ee054fd1f40dd96953cf1c3be499df39dd40c603c7817e8abadaa5d0f08a2b5 profile.`,
    });
    return { asserted: false, authoritative: false, png, pngSha256 };
  }
  expect(png).toMatchSnapshot(name, {
    maxDiffPixelRatio: REGION_SNAPSHOT_MAX_DIFF_PIXEL_RATIO,
  });
  return { asserted: true, authoritative: true, png, pngSha256 };
}

function percentile99(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(0.99 * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function mean(values: ArrayLike<number>): number {
  if (values.length === 0) {
    return 0;
  }
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    total += values[index] ?? 0;
  }
  return total / values.length;
}

function expectPreservedSurface(
  left: {
    readonly depth: string;
    readonly normal: string;
  },
  right: {
    readonly depth: string;
    readonly normal: string;
  },
): void {
  expect(left.depth).toBe(right.depth);
  expect(left.normal).toBe(right.normal);
}

function expectPreservedGeometry(
  left: {
    readonly depth: string;
    readonly normal: string;
    readonly thickness: string;
  },
  right: {
    readonly depth: string;
    readonly normal: string;
    readonly thickness: string;
  },
): void {
  expectPreservedSurface(left, right);
  expect(left.thickness).toBe(right.thickness);
}

function expectMissOrForegroundThickness(values: readonly number[]): void {
  expect(mean(values)).toBeLessThan(0.2);
  expect(percentile99(values)).toBeLessThan(0.5);
  expect(Math.max(...values)).toBeLessThan(2);
  expect(coverageAbove(values, 0.5)).toBeLessThan(0.02);
}

function coverageAbove(values: readonly number[], threshold: number): number {
  if (values.length === 0) {
    return 0;
  }
  let count = 0;
  for (const value of values) {
    if (value > threshold) {
      count += 1;
    }
  }
  return count / values.length;
}

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

function centerBand(
  values: readonly number[],
  width: number,
  height: number,
): number[] {
  const selected: number[] = [];
  const y0 = Math.floor(height * 0.4);
  const y1 = Math.floor(height * 0.6);
  const x0 = Math.floor(width * 0.4);
  const x1 = Math.floor(width * 0.6);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      selected.push(values[y * width + x] ?? 0);
    }
  }
  return selected;
}

function insetBand(
  values: readonly number[],
  width: number,
  height: number,
  side: "top" | "bottom",
): number[] {
  const selected: number[] = [];
  const x0 = Math.floor(width * 0.35);
  const x1 = Math.floor(width * 0.65);
  const y0 =
    side === "top" ? Math.floor(height * 0.06) : Math.floor(height * 0.74);
  const y1 =
    side === "top" ? Math.floor(height * 0.22) : Math.floor(height * 0.9);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      selected.push(values[y * width + x] ?? 0);
    }
  }
  return selected;
}

function seamJump(
  values: readonly number[],
  width: number,
  height: number,
): number {
  const y = Math.floor(height / 2);
  const left = values[y * width + Math.floor(width * 0.42)] ?? 0;
  const right = values[y * width + Math.floor(width * 0.58)] ?? 0;
  return Math.abs(right - left);
}

function insetHalf(
  values: readonly number[],
  width: number,
  height: number,
  side: "left" | "right",
): number[] {
  const selected: number[] = [];
  const y0 = Math.floor(height * 0.2);
  const y1 = Math.floor(height * 0.8);
  const x0 =
    side === "left" ? Math.floor(width * 0.08) : Math.floor(width * 0.68);
  const x1 =
    side === "left" ? Math.floor(width * 0.32) : Math.floor(width * 0.92);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      selected.push(values[y * width + x] ?? 0);
    }
  }
  return selected;
}
