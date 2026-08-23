import { expect, test, type Page } from "@playwright/test";
import type { QaHarnessV13 } from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32 } from "./qa-capture-bytes.js";

const IMPACT_X = 48;
const SAMPLE_X = 50;
const EDGE_ANCHOR_X = 2;
const CAMERA_Y = 12;
const TOP_DOWN_CAMERA = {
  projection: "perspective" as const,
  position: [SAMPLE_X, CAMERA_Y, 0] as const,
  target: [SAMPLE_X, 0, 0] as const,
  up: [0, 0, -1] as const,
  verticalFovDegrees: 40,
  near: 0.1,
  far: 100,
};
const WAKE_SAMPLE_Z = 1;
const WAKE_CAMERA = {
  projection: "perspective" as const,
  position: [0, CAMERA_Y, WAKE_SAMPLE_Z] as const,
  target: [0, 0, WAKE_SAMPLE_Z] as const,
  up: [0, 0, -1] as const,
  verticalFovDegrees: 40,
  near: 0.1,
  far: 100,
};
test("renders and replays an edge-free radial impact around the Interaction Anchor", async ({
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
  const result = await page.evaluate(
    async ({ camera, impactX, sampleX, edgeAnchorX }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV13 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const controls = {
        waveStrength: 0,
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
      };
      const impact = () => ({
        kind: "radial-impact" as const,
        count: 1,
        ids: Uint32Array.of(24),
        positions: Float32Array.of(impactX, 0, 0),
        radii: Float32Array.of(8),
        amplitudes: Float32Array.of(1),
        priorities: Uint8Array.of(200),
      });
      const presentState = async () => {
        const presentation = await harness.present();
        const depth = await harness.capture("depth");
        const normal = await harness.capture("normal");
        const query = await harness.queryGameplay([sampleX, 0, 0]);
        return { presentation, depth, normal, query };
      };

      await harness.reset({ seed: 0x2400_0013 });
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      await harness.updateInteractionAnchor({ x: edgeAnchorX, z: 0 });
      await harness.setCamera(camera, { transition: "continuous" });
      const baseline = await presentState();

      const edgeReceipt = await harness.submitDisturbances(impact());
      const edge = await presentState();

      const anchor = await harness.updateInteractionAnchor({
        x: impactX,
        z: 0,
      });
      const followed = await presentState();

      await harness.updateInteractionAnchor({ x: edgeAnchorX, z: 0 });
      await harness.reset({ seed: 0x2400_0013 });
      await harness.updateInteractionAnchor({ x: edgeAnchorX, z: 0 });
      await harness.setCamera(camera, { transition: "continuous" });
      await presentState();
      const replayReceipt = await harness.submitDisturbances(impact());
      await presentState();
      await harness.updateInteractionAnchor({ x: impactX, z: 0 });
      const replay = await presentState();
      return {
        baseline,
        edgeReceipt,
        edge,
        anchor,
        followed,
        replayReceipt,
        replay,
      };
    },
    {
      camera: TOP_DOWN_CAMERA,
      impactX: IMPACT_X,
      sampleX: SAMPLE_X,
      edgeAnchorX: EDGE_ANCHOR_X,
    },
  );

  const baselineHeight = centerRenderedHeight(result.baseline.depth.data);
  const edgeHeight = centerRenderedHeight(result.edge.depth.data);
  const followedHeight = centerRenderedHeight(result.followed.depth.data);
  const replayHeight = centerRenderedHeight(result.replay.depth.data);
  expect(Math.abs(baselineHeight)).toBeLessThanOrEqual(0.02);
  expect(Math.abs(result.baseline.query.height)).toBeLessThanOrEqual(0.001);
  expect(Math.abs(edgeHeight - baselineHeight)).toBeLessThanOrEqual(0.01);
  expect(result.edge.query.height).toBeCloseTo(result.baseline.query.height, 5);
  expect(result.edgeReceipt).toMatchObject({
    acceptedDisturbanceIds: [24],
    droppedDisturbanceIds: [],
    activeDisturbanceCount: 1,
  });
  expect(result.anchor).toEqual({
    anchor: { x: IMPACT_X, z: 0 },
    changed: true,
    revision: 2,
  });
  const expectedLocalHeight =
    Math.cos(Math.PI / 4) * (1 - 0.25 * 0.25 * (3 - 2 * 0.25));
  expect(
    result.followed.query.height - result.baseline.query.height,
  ).toBeCloseTo(expectedLocalHeight, 5);
  expect(followedHeight - baselineHeight).toBeCloseTo(expectedLocalHeight, 2);
  expect(
    Math.abs(followedHeight - result.followed.query.height),
  ).toBeLessThanOrEqual(0.03);
  expect(result.followed.query.snapshotAge).toBe(0);
  expect(Math.abs(result.followed.query.normal[0])).toBeGreaterThan(0.2);
  expect(result.followed.presentation.compileCount).toBe(
    result.baseline.presentation.compileCount,
  );

  const normal = decodeFloat32(result.followed.normal.data);
  const center =
    Math.floor(result.followed.normal.height / 2) *
      result.followed.normal.width +
    Math.floor(result.followed.normal.width / 2);
  const normalIndex = center * 3;
  expect(normal[normalIndex]).toBeCloseTo(result.followed.query.normal[0], 2);
  expect(normal[normalIndex + 1]).toBeCloseTo(
    -result.followed.query.normal[2],
    2,
  );
  expect(normal[normalIndex + 2]).toBeCloseTo(
    result.followed.query.normal[1],
    2,
  );

  expect(result.replayReceipt).toEqual(result.edgeReceipt);
  expect(result.replay.depth.data).toBe(result.followed.depth.data);
  expect(replayHeight).toBe(followedHeight);
  const { presentationId: _followedPresentationId, ...followedQuery } =
    result.followed.query;
  const { presentationId: _replayPresentationId, ...replayQuery } =
    result.replay.query;
  void _followedPresentationId;
  void _replayPresentationId;
  expect(replayQuery).toEqual(followedQuery);
});

test("renders a prewarmed directional wake coherently with Gameplay Query", async ({
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
  const result = await page.evaluate(
    async ({ camera, sampleZ }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV13 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const controls = {
        waveStrength: 0,
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
        // Zero, like the sibling literal above and every other spec that is not
        // about foam: #25 wrote this before the whitecap controls existed, so
        // zero is what it actually measured.
        whitecapAmount: 0,
        foamPersistence: 0,
        // The neutral underwater values #32 itself migrates a pre-underwater
        // payload to. These tests are above water and predate the volume.
        underwaterHaze: 1,
        underwaterTurbidity: 1,
        underwaterLightShafts: 1,
        underwaterColor: 1,
        underwaterExposure: 1,
      };
      const wake = () => ({
        kind: "directional-wake" as const,
        count: 1,
        ids: Uint32Array.of(25),
        positions: Float32Array.of(0, 0, 0),
        directions: Float32Array.of(0, 0, 1),
        radii: Float32Array.of(2),
        amplitudes: Float32Array.of(1),
        priorities: Uint8Array.of(200),
      });
      const presentState = async () => ({
        presentation: await harness.present(),
        depth: await harness.capture("depth"),
        query: await harness.queryGameplay([0, 0, sampleZ]),
      });
      const prepare = async () => {
        await harness.reset({ seed: 0x2500_0014 });
        await harness.updateArtisticControls(controls, {
          transition: "continuous",
        });
        await harness.updateInteractionAnchor({ x: 0, z: 0 });
        await harness.setCamera(camera, { transition: "continuous" });
      };

      await prepare();
      const baseline = await presentState();
      const receipt = await harness.submitDisturbances(wake());
      const affected = await presentState();

      await prepare();
      await presentState();
      const replayReceipt = await harness.submitDisturbances(wake());
      const replay = await presentState();
      return { baseline, receipt, affected, replayReceipt, replay };
    },
    { camera: WAKE_CAMERA, sampleZ: WAKE_SAMPLE_Z },
  );

  const baselineHeight = centerRenderedHeight(result.baseline.depth.data);
  const affectedHeight = centerRenderedHeight(result.affected.depth.data);
  expect(result.receipt).toEqual({
    tick: 0,
    acceptedDisturbanceIds: [25],
    droppedDisturbanceIds: [],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 1,
  });
  expect(
    Math.abs(result.affected.query.height - result.baseline.query.height),
  ).toBeGreaterThan(0.05);
  expect(
    Math.abs(
      affectedHeight -
        baselineHeight -
        (result.affected.query.height - result.baseline.query.height),
    ),
  ).toBeLessThanOrEqual(0.03);
  expect(result.affected.query.snapshotAge).toBe(0);
  expect(result.affected.presentation.compileCount).toBe(
    result.baseline.presentation.compileCount,
  );
  expect(result.replayReceipt).toEqual(result.receipt);
  expect(result.replay.depth.data).toBe(result.affected.depth.data);
  const { presentationId: _affectedPresentationId, ...affectedQuery } =
    result.affected.query;
  const { presentationId: _replayPresentationId, ...replayQuery } =
    result.replay.query;
  void _affectedPresentationId;
  void _replayPresentationId;
  expect(replayQuery).toEqual(affectedQuery);
});

test("drives prewarmed proxy-vessel wakes without per-tick Disturbance submissions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 321, height: 181 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );

  expectAutomaticProxyWake(await runAutomaticProxyWake(page, "1"));
  expectAutomaticProxyWake(await runAutomaticProxyWake(page, "propeller"));
});

async function runAutomaticProxyWake(page: Page, proxyMode: "1" | "propeller") {
  await page.goto(`/?qa=1&host=three&proxy=${proxyMode}`);
  await expect(page.getByTestId("reference-stage")).toBeVisible();
  return page.evaluate(
    async ({ cameraY }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV13 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const controls = {
        waveStrength: 0,
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
        // Zero, like the sibling literal above and every other spec that is not
        // about foam: #25 wrote this before the whitecap controls existed, so
        // zero is what it actually measured.
        whitecapAmount: 0,
        foamPersistence: 0,
        // The neutral underwater values #32 itself migrates a pre-underwater
        // payload to. These tests are above water and predate the volume.
        underwaterHaze: 1,
        underwaterTurbidity: 1,
        underwaterLightShafts: 1,
        underwaterColor: 1,
        underwaterExposure: 1,
      };
      const presentState = async (point: { x: number; z: number }) => ({
        presentation: await harness.present(),
        depth: await harness.capture("depth"),
        query: await harness.queryGameplay([point.x, 0, point.z]),
      });
      const prepare = async () => {
        await harness.reset({ seed: 0x2500_0014 });
        await harness.updateArtisticControls(controls, {
          transition: "sea-state-cut",
        });
      };
      const advanceVessel = async () => {
        await harness.advanceTicks(30);
      };

      await prepare();
      await harness.setCamera(
        {
          projection: "perspective",
          position: [0, cameraY, 8],
          target: [0, 0, 8],
          up: [0, 0, -1],
          verticalFovDegrees: 40,
          near: 0.1,
          far: 100,
        },
        { transition: "continuous" },
      );
      await advanceVessel();
      await harness.present();
      const samples: Array<{ x: number; z: number; height: number }> = [];
      for (let x = -4; x <= 4; x += 0.5) {
        for (let z = 6.5; z <= 12; z += 0.5) {
          const query = await harness.queryGameplay([x, 0, z]);
          samples.push({ x, z, height: query.height });
        }
      }
      const point = samples.reduce((strongest, candidate) =>
        Math.abs(candidate.height) > Math.abs(strongest.height)
          ? candidate
          : strongest,
      );
      const camera = {
        projection: "perspective" as const,
        position: [point.x, cameraY, point.z] as const,
        target: [point.x, 0, point.z] as const,
        up: [0, 0, -1] as const,
        verticalFovDegrees: 40,
        near: 0.1,
        far: 100,
      };

      await prepare();
      await harness.setCamera(camera, { transition: "continuous" });
      const baseline = await presentState(point);
      await advanceVessel();
      const affected = await presentState(point);
      await prepare();
      await harness.setCamera(camera, { transition: "continuous" });
      await presentState(point);
      await advanceVessel();
      const replay = await presentState(point);
      return { point, baseline, affected, replay };
    },
    { cameraY: CAMERA_Y },
  );
}

function expectAutomaticProxyWake(
  result: Awaited<ReturnType<typeof runAutomaticProxyWake>>,
): void {
  const baselineHeight = centerRenderedHeight(result.baseline.depth.data);
  const affectedHeight = centerRenderedHeight(result.affected.depth.data);
  const queryDelta =
    result.affected.query.height - result.baseline.query.height;
  expect(Math.abs(queryDelta)).toBeGreaterThan(0.01);
  expect(
    Math.abs(affectedHeight - baselineHeight - queryDelta),
  ).toBeLessThanOrEqual(0.03);
  expect(result.affected.query.snapshotAge).toBe(1);
  expect(result.affected.presentation.compileCount).toBe(
    result.baseline.presentation.compileCount,
  );
  expect(result.replay.depth.data).toBe(result.affected.depth.data);
  const { presentationId: _affectedPresentationId, ...affectedQuery } =
    result.affected.query;
  const { presentationId: _replayPresentationId, ...replayQuery } =
    result.replay.query;
  void _affectedPresentationId;
  void _replayPresentationId;
  expect(replayQuery).toEqual(affectedQuery);
}

function centerRenderedHeight(encodedDepth: string): number {
  const values = decodeFloat32(encodedDepth);
  const center = Math.floor(181 / 2) * 321 + Math.floor(321 / 2);
  return CAMERA_Y - (values[center] ?? Number.NaN);
}
