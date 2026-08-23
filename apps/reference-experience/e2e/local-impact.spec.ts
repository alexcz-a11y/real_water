import { expect, test } from "@playwright/test";
import type { QaHarnessV11 } from "../src/qa-harness.js";
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
      const harness = window.__REAL_WATER_QA__ as QaHarnessV11 | undefined;
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

function centerRenderedHeight(encodedDepth: string): number {
  const values = decodeFloat32(encodedDepth);
  const center = Math.floor(181 / 2) * 321 + Math.floor(321 / 2);
  return CAMERA_Y - (values[center] ?? Number.NaN);
}
