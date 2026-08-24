import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import { createMinimalWaterQualityProfile } from "real-water";
import {
  CORE_WEBGPU_MAX_COLOR_ATTACHMENT_BYTES_PER_SAMPLE,
  QA_FRAME_CAPTURE_SHAPES,
  QA_SCENE_PASS_COLOR_ATTACHMENT_FORMATS,
  calculateColorAttachmentBytesPerSample,
} from "../src/qa-frame-contract.js";
import {
  QA_CAPTURE_VERSION,
  type QaCameraV1,
  type QaHarnessV14,
} from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32, decodeUint8 } from "./qa-capture-bytes.js";

const COMPOSE_SSR_MAX_DISTANCE =
  createMinimalWaterQualityProfile().reflection.ssr.maxDistance;

const FIXED_CAMERA = {
  projection: "perspective" as const,
  position: [8, 6, 10] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 50,
  near: 0.1,
  far: 100,
} satisfies QaCameraV1;

test("exposes the versioned QA Harness only on the explicit QA route", async ({
  page,
}) => {
  await page.goto("/");
  expect(
    await page.evaluate(() =>
      Object.prototype.hasOwnProperty.call(window, "__REAL_WATER_QA__"),
    ),
  ).toBe(false);

  await page.goto("/?qa=1&host=memory&delay=0");
  await expect(page.getByTestId("reference-placeholder")).toBeVisible();

  const contract = await page.evaluate(() => {
    const harness = window.__REAL_WATER_QA__;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    return {
      schema: harness.schema,
      version: harness.version,
      fixedTickHz: harness.fixedTickHz,
      captureNames: harness.captureNames,
      prewarmSchema: harness.prewarmManifest.schema,
      prewarmVersion: harness.prewarmManifest.version,
      prewarmCoreDeclarations: harness.prewarmManifest.coreDeclarations,
      prewarmCaptures: harness.prewarmManifest.captures.map(
        ({ name, preparedFormat }) => ({ name, preparedFormat }),
      ),
      interactionCommands: {
        updateInteractionAnchor: typeof harness.updateInteractionAnchor,
        submitDisturbances: typeof harness.submitDisturbances,
      },
      frozen: Object.isFrozen(harness),
    };
  });

  expect(
    calculateColorAttachmentBytesPerSample([
      "rgba16float",
      "r32float",
      "rgba16float",
      "rgba16float",
      "rgba8unorm",
    ]),
  ).toBe(36);
  expect(QA_SCENE_PASS_COLOR_ATTACHMENT_FORMATS).toEqual([
    "rgba16float",
    "rgba16float",
    "rg16float",
    "rgba16float",
    "rg8unorm",
    "rg8unorm",
  ]);
  expect(
    calculateColorAttachmentBytesPerSample(
      QA_SCENE_PASS_COLOR_ATTACHMENT_FORMATS,
    ),
  ).toBe(32);
  expect(
    calculateColorAttachmentBytesPerSample(
      QA_SCENE_PASS_COLOR_ATTACHMENT_FORMATS,
    ),
  ).toBe(CORE_WEBGPU_MAX_COLOR_ATTACHMENT_BYTES_PER_SAMPLE);
  expect(contract).toEqual({
    schema: "real-water/qa-harness",
    // The one place the QA Harness version number is pinned to a reviewed
    // value. Everywhere else compares against the exported constant, so this
    // assertion is what makes a bump deliberate instead of self-confirming.
    // eslint-disable-next-line no-restricted-syntax
    version: 14,
    fixedTickHz: 60,
    captureNames: [
      "final-color",
      "current-color",
      "depth",
      "normal",
      "motion-vector",
      "whitecap-generation",
      "whitecap-history",
      "whitecap-advection",
      "whitecap-decay",
      "foam-source-identity",
      "waterline",
      "history-rejection",
      "optical-fresnel",
      "optical-thickness",
      "optical-scattering",
      "optical-environment-reflection",
      "optical-crest-transmission",
      "optical-transmittance",
      "optical-glint",
      "underwater-transmittance",
      "underwater-scattering",
      "underwater-light-shafts",
      "underwater-shadow",
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
      "secondary-particle-contribution",
      "secondary-particle-overdraw",
    ],
    prewarmSchema: "real-water/qa-frame-prewarm",
    // Pinned for the same reason as `version` above: this contract test is
    // where a QA frame prewarm bump has to be stated, not inferred.
    // eslint-disable-next-line no-restricted-syntax
    prewarmVersion: 13,
    prewarmCoreDeclarations: {
      "final-color": "water-final-color-target",
      "current-color": "water-current-color-target",
      "depth": "water-inverse-linear-depth",
      "normal": "water-view-normal",
      "motion-vector": "water-motion-vectors",
      "whitecap-generation": "water-whitecap-stage-target",
      "whitecap-history": "water-whitecap-stage-target",
      "whitecap-advection": "water-whitecap-stage-target",
      "whitecap-decay": "water-whitecap-stage-target",
      "foam-source-identity": "water-foam-source-identity-target",
      "waterline": "water-optical-factors-target",
      "history-rejection": "water-history-rejection-target",
      "optical-fresnel": "water-optical-factors-target",
      "optical-thickness": "water-optical-factors-target",
      "optical-scattering": "water-optical-diagnostics-b",
      "optical-environment-reflection": "water-optical-diagnostics-b",
      "optical-crest-transmission": "water-optical-diagnostics-a",
      "optical-transmittance": "water-optical-diagnostics-a",
      "optical-glint": "water-optical-factors-target",
      "underwater-transmittance": "water-underwater-diagnostics-target",
      "underwater-scattering": "water-underwater-diagnostics-target",
      "underwater-light-shafts": "water-underwater-diagnostics-target",
      "underwater-shadow": "water-underwater-diagnostics-target",
      "planar-color": "water-planar-reflection-target",
      "planar-target-alpha": "water-planar-reflection-target",
      "ssr-hit": "water-ssr-raw-target",
      "ssr-confidence": "water-ssr-composite-target",
      "ssr-color": "water-ssr-raw-target",
      "ssr-roughness": "water-view-normal",
      "reflection-base-color": "water-render-target",
      "ssr-composite-color": "water-ssr-composite-target",
      "ssr-history-color": "water-ssr-history-resolved-capture-target",
      "ssr-history-frame-weight": "water-ssr-history-resolved-capture-target",
      "ssr-history-input-color": "water-ssr-history-beauty-target",
      "secondary-particle-contribution":
        "water-secondary-particle-accumulation-target",
      "secondary-particle-overdraw":
        "water-secondary-particle-accumulation-target",
    },
    prewarmCaptures: [
      { name: "final-color", preparedFormat: "rgba8unorm-srgb" },
      { name: "current-color", preparedFormat: "rgba8unorm-srgb" },
      { name: "depth", preparedFormat: "r32float-inverse-linear-view" },
      { name: "normal", preparedFormat: "rgba16float-view-normal" },
      { name: "motion-vector", preparedFormat: "rg16float-ndc" },
      {
        name: "whitecap-generation",
        preparedFormat: "rgba16float-whitecap-stages",
      },
      {
        name: "whitecap-history",
        preparedFormat: "rgba16float-whitecap-stages",
      },
      {
        name: "whitecap-advection",
        preparedFormat: "rgba16float-whitecap-stages",
      },
      {
        name: "whitecap-decay",
        preparedFormat: "rgba16float-whitecap-stages",
      },
      {
        name: "foam-source-identity",
        preparedFormat: "rgba16float-foam-source-identity",
      },
      {
        name: "waterline",
        preparedFormat: "rgba16float-waterline-coverage",
      },
      {
        name: "history-rejection",
        preparedFormat: "rgba8unorm-history-rejection",
      },
      {
        name: "optical-fresnel",
        preparedFormat: "rgba16float-optical-factors",
      },
      {
        name: "optical-thickness",
        preparedFormat: "rgba16float-optical-factors",
      },
      {
        name: "optical-scattering",
        preparedFormat: "rg8unorm-optical-diagnostics-b",
      },
      {
        name: "optical-environment-reflection",
        preparedFormat: "rg8unorm-optical-diagnostics-b",
      },
      {
        name: "optical-crest-transmission",
        preparedFormat: "rg8unorm-optical-diagnostics-a",
      },
      {
        name: "optical-transmittance",
        preparedFormat: "rg8unorm-optical-diagnostics-a",
      },
      { name: "optical-glint", preparedFormat: "rgba16float-optical-factors" },
      {
        name: "underwater-transmittance",
        preparedFormat: "rgba16float-underwater-volume-diagnostics",
      },
      {
        name: "underwater-scattering",
        preparedFormat: "rgba16float-underwater-volume-diagnostics",
      },
      {
        name: "underwater-light-shafts",
        preparedFormat: "rgba16float-underwater-volume-diagnostics",
      },
      {
        name: "underwater-shadow",
        preparedFormat: "rgba16float-underwater-volume-diagnostics",
      },
      { name: "planar-color", preparedFormat: "rgba8unorm-srgb" },
      { name: "planar-target-alpha", preparedFormat: "rgba8unorm-srgb" },
      { name: "ssr-hit", preparedFormat: "rgba16float-ssr-raw" },
      { name: "ssr-confidence", preparedFormat: "rgba16float-ssr-composite" },
      { name: "ssr-color", preparedFormat: "rgba16float-ssr-raw" },
      { name: "ssr-roughness", preparedFormat: "rgba16float-view-normal" },
      {
        name: "reflection-base-color",
        preparedFormat: "rgba16float-scene-output",
      },
      {
        name: "ssr-composite-color",
        preparedFormat: "rgba16float-ssr-composite",
      },
      {
        name: "ssr-history-color",
        preparedFormat: "rgba16float-ssr-history-resolve",
      },
      {
        name: "ssr-history-frame-weight",
        preparedFormat: "rgba16float-ssr-history-resolve",
      },
      {
        name: "ssr-history-input-color",
        preparedFormat: "rgba16float-ssr-history-beauty",
      },
      {
        name: "secondary-particle-contribution",
        preparedFormat: "rgba16float-secondary-particle-accumulation",
      },
      {
        name: "secondary-particle-overdraw",
        preparedFormat: "rgba16float-secondary-particle-accumulation",
      },
    ],
    interactionCommands: {
      updateInteractionAnchor: "function",
      submitDisturbances: "function",
    },
    frozen: true,
  });
});

test("bounds rendered and queried height at one fixed Open Water point", async ({
  page,
}) => {
  await page.setViewportSize({ width: 321, height: 181 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );

  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();
  const result = await page.evaluate(async () => {
    const harness = window.__REAL_WATER_QA__ as
      | (QaHarnessV14 & {
          updateArtisticControls(
            controls: {
              readonly waveStrength: number;
              readonly swellDrama: number;
              readonly directionality: number;
              readonly choppiness: number;
              readonly crestSharpness: number;
              readonly microDetail: number;
              readonly timeScale: number;
              readonly grazingReflection: number;
              readonly environmentReflection: number;
              readonly depthSeeThrough: number;
              readonly depthColoring: number;
              readonly inWaterGlow: number;
              readonly crestGlow: number;
              readonly whitecapAmount: number;
              readonly foamPersistence: number;
              readonly underwaterHaze: number;
              readonly underwaterTurbidity: number;
              readonly underwaterLightShafts: number;
              readonly underwaterColor: number;
              readonly underwaterExposure: number;
            },
            options: { readonly transition: "continuous" | "sea-state-cut" },
          ): Promise<{ readonly revision: number }>;
          queryGameplay(point: readonly [number, number, number]): Promise<{
            readonly height: number;
            readonly normal: readonly [number, number, number];
            readonly velocity: readonly [number, number, number];
            readonly foam: number;
            readonly tick: number;
            readonly controlRevision: number;
            readonly snapshotAge: number;
            readonly presentationId: number;
          }>;
        })
      | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x4000_0000 });
    await harness.advanceTicks(30);
    const before = harness.snapshot();
    const controls = await harness.updateArtisticControls(
      {
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
        whitecapAmount: 1,
        foamPersistence: 1,
        underwaterHaze: 1,
        underwaterTurbidity: 1,
        underwaterLightShafts: 1,
        underwaterColor: 1,
        underwaterExposure: 1,
      },
      {
        transition: "continuous",
      },
    );
    await harness.setCamera(
      {
        projection: "perspective",
        position: [0.7, 12, 0],
        target: [0.7, 0, 0],
        up: [0, 0, -1],
        verticalFovDegrees: 40,
        near: 0.1,
        far: 100,
      },
      { transition: "continuous" },
    );
    const presentation = await harness.present();
    const depth = await harness.capture("depth");
    const normal = await harness.capture("normal");
    const scattering = await harness.capture("optical-scattering");
    const environmentReflection = await harness.capture(
      "optical-environment-reflection",
    );
    const crest = await harness.capture("optical-crest-transmission");
    const transmittance = await harness.capture("optical-transmittance");
    const query = await harness.queryGameplay([0.7, 0, 0]);
    const after = harness.snapshot();
    return {
      before,
      controls,
      presentation,
      depth,
      normal,
      scattering,
      environmentReflection,
      crest,
      transmittance,
      query,
      after,
    };
  });

  const depths = decodeFloat32(result.depth.data);
  const center =
    Math.floor(result.depth.height / 2) * result.depth.width +
    Math.floor(result.depth.width / 2);
  const renderedHeight = 12 - (depths[center] ?? Number.NaN);
  expect(result.query.height).toBeCloseTo(1.815_34, 5);
  expect(Math.abs(renderedHeight - result.query.height)).toBeLessThanOrEqual(
    0.03,
  );
  expect(result.query).toMatchObject({
    normal: expect.any(Array),
    velocity: expect.any(Array),
    foam: expect.any(Number),
    tick: 30,
    controlRevision: result.controls.revision,
    snapshotAge: 0,
    presentationId: result.presentation.presentationId,
  });
  expect(result.query.foam).toBeCloseTo(0.758_019, 5);
  const normalValues = decodeFloat32(result.normal.data);
  const normalIndex = center * 3;
  expect(normalValues[normalIndex]).toBeCloseTo(result.query.normal[0], 1);
  expect(normalValues[normalIndex + 1]).toBeCloseTo(-result.query.normal[2], 1);
  expect(normalValues[normalIndex + 2]).toBeCloseTo(result.query.normal[1], 1);
  expect(result.after).toEqual(result.before);
  expect(result.presentation.prewarm.progress).toMatchObject({
    completedWork: 19,
    totalWork: 19,
  });
  const encodedRg8ByteLength = result.depth.width * result.depth.height * 4;
  for (const capture of [
    result.scattering,
    result.environmentReflection,
    result.crest,
    result.transmittance,
  ]) {
    expect(capture.width).toBe(321);
    expect(capture.height).toBe(181);
    expect(Buffer.from(capture.data, "base64")).toHaveLength(
      encodedRg8ByteLength,
    );
    const values = decodeFloat32(capture.data);
    expect(values).toHaveLength(result.depth.width * result.depth.height);
    expect(
      values.every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      ),
    ).toBe(true);
  }
});

test("presents camera-relative Open Water through the horizon", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );

  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();
  const result = await page.evaluate(async () => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV14 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x4000_0000 });
    await harness.advanceTicks(15);
    await harness.setCamera(
      {
        projection: "perspective",
        position: [0, 8, 0],
        target: [400, 0, 0],
        up: [0, 1, 0],
        verticalFovDegrees: 50,
        near: 0.5,
        far: 4_000,
      },
      { transition: "continuous" },
    );
    const presentation = await harness.present();
    const depth = await harness.capture("depth");
    const nearQuery = await harness.queryGameplay([2, 0, 0]);
    const farQuery = await harness.queryGameplay([400, 0, 0]);
    return { presentation, depth, nearQuery, farQuery };
  });

  const depths = decodeFloat32(result.depth.data);
  const width = result.depth.width;
  const height = result.depth.height;
  const center = Math.floor(height / 2) * width + Math.floor(width / 2);
  const upper = Math.floor(height * 0.12) * width + Math.floor(width / 2);
  const centerDepth = depths[center] ?? Number.NaN;
  const upperDepth = depths[upper] ?? Number.NaN;

  expect(result.presentation.tick).toBe(15);
  expect(centerDepth).toBeGreaterThan(48);
  expect(centerDepth).toBeLessThan(3_500);
  expect(upperDepth).toBeGreaterThan(3_900);
  expect(result.nearQuery.height).not.toBe(result.farQuery.height);
  expect(Number.isFinite(result.nearQuery.height)).toBe(true);
  expect(Number.isFinite(result.farQuery.height)).toBe(true);
});

test("drives and captures a repeatable rendered frame without wall-clock animation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );

  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const result = await page.evaluate(async (camera) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV14 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }

    const drive = async (ticks: number) => {
      await harness.reset({ seed: 0x5eed_0016 });
      const advanced = await harness.advanceTicks(ticks);
      await harness.setCamera(camera, { transition: "continuous" });
      const presentation = await harness.present();
      const captures = await Promise.all(
        harness.captureNames.map((name) => harness.capture(name)),
      );
      return { advanced, presentation, captures };
    };

    return {
      first: await drive(120),
      repeated: await drive(120),
      changedTick: await drive(121),
    };
  }, FIXED_CAMERA);

  expect(result.first.advanced).toMatchObject({
    seed: 0x5eed_0016,
    tick: 120,
  });
  expect(result.first.presentation).toMatchObject({
    seed: 0x5eed_0016,
    tick: 120,
    timeSeconds: 2,
    simulationResetRevision: 1,
    originRevision: 0,
    captureNames: [
      "final-color",
      "current-color",
      "depth",
      "normal",
      "motion-vector",
      "whitecap-generation",
      "whitecap-history",
      "whitecap-advection",
      "whitecap-decay",
      "foam-source-identity",
      "waterline",
      "history-rejection",
      "optical-fresnel",
      "optical-thickness",
      "optical-scattering",
      "optical-environment-reflection",
      "optical-crest-transmission",
      "optical-transmittance",
      "optical-glint",
      "underwater-transmittance",
      "underwater-scattering",
      "underwater-light-shafts",
      "underwater-shadow",
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
      "secondary-particle-contribution",
      "secondary-particle-overdraw",
    ],
    prewarm: {
      width: 320,
      height: 180,
      progress: {
        completedWork: 19,
        totalWork: 19,
      },
    },
  });
  expect(result.first.presentation.prewarm.rendererDevice).toEqual({
    features: expect.any(Array),
    limits: expect.objectContaining({
      maxTextureDimension2D: expect.any(Number),
      maxColorAttachmentBytesPerSample: expect.any(Number),
      maxColorAttachments: expect.any(Number),
    }),
  });
  expect(result.first.captures.map(({ name }) => name)).toEqual([
    "final-color",
    "current-color",
    "depth",
    "normal",
    "motion-vector",
    "whitecap-generation",
    "whitecap-history",
    "whitecap-advection",
    "whitecap-decay",
    "foam-source-identity",
    "waterline",
    "history-rejection",
    "optical-fresnel",
    "optical-thickness",
    "optical-scattering",
    "optical-environment-reflection",
    "optical-crest-transmission",
    "optical-transmittance",
    "optical-glint",
    "underwater-transmittance",
    "underwater-scattering",
    "underwater-light-shafts",
    "underwater-shadow",
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
    "secondary-particle-contribution",
    "secondary-particle-overdraw",
  ]);
  expect(result.first.captures.map(({ version }) => version)).toEqual(
    new Array<number>(36).fill(QA_CAPTURE_VERSION),
  );
  expect(result.first.captures.map(({ format }) => format)).toEqual([
    "rgba8unorm-srgb",
    "rgba8unorm-srgb",
    "r32float-linear-view",
    "rgb32float-view-normal",
    "rg32float-ndc",
    "r32float-whitecap-stage",
    "r32float-whitecap-stage",
    "r32float-whitecap-stage",
    "r32float-whitecap-stage",
    "rgba32float-foam-source-identity",
    "r32float-waterline-coverage",
    "r32float-history-rejection",
    "r32float-optical",
    "r32float-optical",
    "r32float-optical",
    "r32float-optical",
    "r32float-optical",
    "r32float-optical",
    "r32float-optical",
    "r32float-underwater-volume",
    "r32float-underwater-volume",
    "r32float-underwater-volume",
    "r32float-underwater-volume",
    "rgba8unorm-srgb",
    "r32float-optical",
    "r32float-optical",
    "r32float-optical",
    "rgb32float-linear-ssr",
    "r32float-ssr-roughness",
    "rgb32float-linear-reflection-base",
    "rgb32float-linear-ssr-composite",
    "rgb32float-linear-ssr-history",
    "r32float-ssr-history-frame-weight",
    "rgb32float-linear-ssr-history-input",
    "r32float-secondary-particle-contribution",
    "r32float-secondary-particle-overdraw",
  ]);
  expect(result.first.captures.every(({ data }) => data.length > 0)).toBe(true);
  expect(
    result.repeated.captures.map(
      ({
        name,
        version,
        width,
        height,
        origin,
        format,
        components,
        elementType,
        dataEncoding,
        byteOrder,
        data,
      }) => ({
        name,
        version,
        width,
        height,
        origin,
        format,
        components,
        elementType,
        dataEncoding,
        byteOrder,
        data,
      }),
    ),
  ).toEqual(
    result.first.captures.map(
      ({
        name,
        version,
        width,
        height,
        origin,
        format,
        components,
        elementType,
        dataEncoding,
        byteOrder,
        data,
      }) => ({
        name,
        version,
        width,
        height,
        origin,
        format,
        components,
        elementType,
        dataEncoding,
        byteOrder,
        data,
      }),
    ),
  );
  expect(
    result.first.captures.every(
      (capture) => capture.version === QA_CAPTURE_VERSION,
    ),
  ).toBe(true);
  expect(result.changedTick.captures[0]?.data).not.toBe(
    result.first.captures[0]?.data,
  );

  const pixelCount = 320 * 180;
  for (const capture of result.first.captures) {
    const shape = QA_FRAME_CAPTURE_SHAPES[capture.name];
    const elementBytes = shape.elementType === "uint8" ? 1 : 4;
    expect(capture).toMatchObject({
      width: 320,
      height: 180,
      origin: "top-left",
      components: shape.components,
      format: shape.format,
      elementType: shape.elementType,
      dataEncoding: "base64",
      byteOrder:
        shape.elementType === "float32" ? "little-endian" : "not-applicable",
    });
    expect(Buffer.from(capture.data, "base64")).toHaveLength(
      pixelCount * shape.components * elementBytes,
    );
    if (shape.elementType === "float32") {
      const values = decodeFloat32(capture.data);
      expect(values).toHaveLength(pixelCount * shape.components);
      if (capture.name === "ssr-hit") {
        expect(
          values.every((value) => Number.isFinite(value) && value >= 0),
        ).toBe(true);
      } else if (
        capture.name === "motion-vector" ||
        capture.name === "ssr-color" ||
        capture.name === "reflection-base-color" ||
        capture.name === "ssr-composite-color"
      ) {
        expect(values.every((value) => Number.isFinite(value))).toBe(true);
      } else {
        expect(
          values.every(
            (value) =>
              Number.isFinite(value) &&
              value >= opticalScalarMin(capture.name) &&
              value <= opticalScalarMax(capture.name),
          ),
        ).toBe(true);
      }
    }
  }

  const ssrHit = result.first.captures.find(
    (capture) => capture.name === "ssr-hit",
  );
  const ssrConfidence = result.first.captures.find(
    (capture) => capture.name === "ssr-confidence",
  );
  const hitDistances = decodeFloat32(ssrHit?.data ?? "");
  const confidence = decodeFloat32(ssrConfidence?.data ?? "");
  expect(hitDistances).toHaveLength(pixelCount);
  expect(confidence).toHaveLength(pixelCount);
  expect(
    confidence.every((value, pixel) => {
      if (!(value > 0)) {
        return true;
      }
      const worldDistance = hitDistances[pixel] ?? Number.NaN;
      return worldDistance > 0 && worldDistance <= COMPOSE_SSR_MAX_DISTANCE;
    }),
  ).toBe(true);

  const depth = result.first.captures.find(
    (capture) => capture.name === "depth",
  );
  const normal = result.first.captures.find(
    (capture) => capture.name === "normal",
  );
  const depthValues = decodeFloat32(depth?.data ?? "");
  expect(depthValues.some((value) => value < 99)).toBe(true);
  expect(depthValues.some((value) => Math.abs(value - 100) < 0.001)).toBe(true);
  expect(hasUnitNormal(decodeFloat32(normal?.data ?? ""))).toBe(true);
});

test("matches the visible WebGPU canvas RGB to the same-frame final-color capture", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const result = await page.evaluate(async (camera) => {
    const harness = window.__REAL_WATER_QA__ as QaHarnessV14 | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    await harness.reset({ seed: 0x5eed_0016 });
    await harness.setCamera(camera, { transition: "continuous" });
    const presentation = await harness.present();
    const finalColor = await harness.capture("final-color");
    if (finalColor.presentationId !== presentation.presentationId) {
      throw new Error("final-color capture left the presented frame.");
    }
    const encodeBase64 = (bytes: Uint8ClampedArray): string => {
      let binary = "";
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + chunkSize),
        );
      }
      return btoa(binary);
    };
    const canvas = document.querySelector("canvas.reference-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("The visible WebGPU Reference canvas is missing.");
    }
    const copy = document.createElement("canvas");
    copy.width = presentation.prewarm.width;
    copy.height = presentation.prewarm.height;
    const context = copy.getContext("2d", {
      colorSpace: "srgb",
      willReadFrequently: true,
    });
    if (context === null) {
      throw new Error("The 2D canvas context is unavailable.");
    }
    const snapshot = await createImageBitmap(
      await (await fetch(canvas.toDataURL("image/png"))).blob(),
      { colorSpaceConversion: "none" },
    );
    if (snapshot.width !== copy.width || snapshot.height !== copy.height) {
      throw new Error(
        "The visible canvas snapshot does not match final-color.",
      );
    }
    context.drawImage(snapshot, 0, 0);
    snapshot.close();
    const image = context.getImageData(0, 0, copy.width, copy.height);
    return {
      presentationId: presentation.presentationId,
      width: presentation.prewarm.width,
      height: presentation.prewarm.height,
      captureWidth: finalColor.width,
      captureHeight: finalColor.height,
      origin: finalColor.origin,
      final: finalColor.data,
      canvas: encodeBase64(image.data),
    };
  }, FIXED_CAMERA);

  expect(result.origin).toBe("top-left");
  expect(result.captureWidth).toBe(result.width);
  expect(result.captureHeight).toBe(result.height);
  const finalColor = decodeUint8(result.final);
  const canvas = Uint8Array.from(Buffer.from(result.canvas, "base64"));
  expect(finalColor.length).toBe(result.width * result.height * 4);
  expect(canvas.length).toBe(finalColor.length);
  const diffs: number[] = [];
  for (let index = 0; index < finalColor.length; index += 4) {
    diffs.push(Math.abs((finalColor[index] ?? 0) - (canvas[index] ?? 0)));
    diffs.push(
      Math.abs((finalColor[index + 1] ?? 0) - (canvas[index + 1] ?? 0)),
    );
    diffs.push(
      Math.abs((finalColor[index + 2] ?? 0) - (canvas[index + 2] ?? 0)),
    );
  }
  expect(diffs.length).toBeGreaterThan(1_000);
  const sorted = [...diffs].sort((left, right) => left - right);
  const p99 = sorted[Math.max(0, Math.ceil(sorted.length * 0.99) - 1)] ?? 0;
  expect(p99).toBeLessThanOrEqual(1);
  expect(sorted.at(-1) ?? 0).toBeLessThanOrEqual(2);
});

function opticalScalarMin(name: string): number {
  if (name === "normal") {
    return -1.001;
  }
  if (name === "depth") {
    return 0.1;
  }
  return 0;
}

function opticalScalarMax(name: string): number {
  if (name === "normal") {
    return 1.001;
  }
  if (name === "depth" || name === "optical-thickness") {
    return 100.001;
  }
  return 2;
}

function hasUnitNormal(values: readonly number[]): boolean {
  for (let index = 0; index < values.length; index += 3) {
    const x = values[index] ?? 0;
    const y = values[index + 1] ?? 0;
    const z = values[index + 2] ?? 0;
    const length = Math.hypot(x, y, z);
    if (length > 0.99 && length < 1.01) {
      return true;
    }
  }
  return false;
}
