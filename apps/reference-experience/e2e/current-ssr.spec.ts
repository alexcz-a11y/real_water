import { expect, test, type Page } from "@playwright/test";
import {
  createMinimalWaterQualityProfile,
  createWaterPreset,
  type ArtisticControls,
} from "real-water";
import { PerspectiveCamera, Vector3, Vector4 } from "three";
import type {
  QaCameraV1,
  QaCurrentSsrFixtureHotColor,
  QaCurrentSsrFixtureState,
  QaHarness,
} from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32, decodeUint8 } from "./qa-capture-bytes.js";

const VIEWPORT = { width: 320, height: 180 } as const;
const HIT_CAMERA = {
  projection: "perspective" as const,
  position: [0, 12, 20] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 40,
  near: 0.1,
  far: 200,
} satisfies QaCameraV1;
const FAR_WATER_CAMERA = {
  projection: "perspective" as const,
  position: [0, 80, 400] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 40,
  near: 1,
  far: 2000,
} satisfies QaCameraV1;
const SSR_CONTROLS = {
  ...createWaterPreset("swell").artisticControls,
  whitecapAmount: 0,
  foamPersistence: 0,
  underwaterHaze: 1,
  underwaterTurbidity: 1,
  underwaterLightShafts: 1,
  underwaterColor: 1,
  underwaterExposure: 1,
} satisfies ArtisticControls;
const FAR_WATER_CONTROLS = {
  ...createWaterPreset("storm").artisticControls,
  whitecapAmount: 0,
  foamPersistence: 0,
  underwaterHaze: 1,
  underwaterTurbidity: 1,
  underwaterLightShafts: 1,
  underwaterColor: 1,
  underwaterExposure: 1,
} satisfies ArtisticControls;
const OFFSCREEN_CAMERA = {
  ...HIT_CAMERA,
  position: [40, 12, 40] as const,
  target: [80, 0, 80] as const,
} satisfies QaCameraV1;
const ROUGHNESS_CUTOFF = 0.5;
const HALF_FLOAT_EPSILON = 2 ** -10;

interface CurrentSsrEvidence {
  readonly whitecapDensity?: string;
  readonly occupancy: string;
  readonly environment: string;
  readonly fresnel: string;
  readonly hit: string;
  readonly confidence: string;
  readonly color: string;
  readonly roughness: string;
  readonly reflectionBase: string;
  readonly ssrComposite: string;
  readonly planarColor: string;
  readonly finalColor: string;
  readonly currentColor: string;
  readonly depth: string;
  readonly normal: string;
  readonly motion: string;
  readonly compileCount: number;
  readonly fixture: QaCurrentSsrFixtureState;
}

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

async function presentCurrentSsrEvidence(
  page: Page,
  enabled: boolean,
  hotColor: QaCurrentSsrFixtureHotColor = "magenta",
  camera: QaCameraV1 = HIT_CAMERA,
  controls: ArtisticControls = SSR_CONTROLS,
): Promise<CurrentSsrEvidence> {
  return page.evaluate(
    async ({ fixtureEnabled, fixtureColor, cameraPose, artisticControls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarness | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x4000_0000 });
      await harness.updateArtisticControls(artisticControls, {
        transition: "continuous",
      });
      await harness.setCamera(cameraPose, { transition: "camera-cut" });
      await harness.setHostSceneForegroundFixture(false);
      await harness.advanceTicks(24);
      await harness.present();
      await harness.setHostSceneCurrentSsrFixtureHotColor(fixtureColor);
      await harness.setHostSceneCurrentSsrFixture(fixtureEnabled);
      await harness.advanceTicks(1);
      const presentation = await harness.present();
      const [
        whitecapDensity,
        occupancy,
        environment,
        fresnel,
        hit,
        confidence,
        color,
        roughness,
        reflectionBase,
        ssrComposite,
        planarColor,
        finalColor,
        currentColor,
        depth,
        normal,
        motion,
      ] = await Promise.all([
        harness.capture("whitecap-decay"),
        harness.capture("planar-target-alpha"),
        harness.capture("optical-environment-reflection"),
        harness.capture("optical-fresnel"),
        harness.capture("ssr-hit"),
        harness.capture("ssr-confidence"),
        harness.capture("ssr-color"),
        harness.capture("ssr-roughness"),
        harness.capture("reflection-base-color"),
        harness.capture("ssr-composite-color"),
        harness.capture("planar-color"),
        harness.capture("final-color"),
        harness.capture("current-color"),
        harness.capture("depth"),
        harness.capture("normal"),
        harness.capture("motion-vector"),
      ]);
      return {
        whitecapDensity: whitecapDensity.data,
        occupancy: occupancy.data,
        environment: environment.data,
        fresnel: fresnel.data,
        hit: hit.data,
        confidence: confidence.data,
        color: color.data,
        roughness: roughness.data,
        reflectionBase: reflectionBase.data,
        ssrComposite: ssrComposite.data,
        planarColor: planarColor.data,
        finalColor: finalColor.data,
        currentColor: currentColor.data,
        depth: depth.data,
        normal: normal.data,
        motion: motion.data,
        compileCount: presentation.compileCount,
        fixture: await harness.readHostSceneCurrentSsrFixture(),
      };
    },
    {
      fixtureEnabled: enabled,
      fixtureColor: hotColor,
      cameraPose: camera,
      artisticControls: controls,
    },
  );
}

async function presentFarWaterSsrEvidence(
  page: Page,
  enabled: boolean,
  controls: ArtisticControls = FAR_WATER_CONTROLS,
  camera: QaCameraV1 = FAR_WATER_CAMERA,
): Promise<CurrentSsrEvidence> {
  return page.evaluate(
    async ({ fixtureEnabled, cameraPose, artisticControls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarness | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x4000_0000 });
      await harness.setCamera(cameraPose, { transition: "camera-cut" });
      await harness.updateArtisticControls(artisticControls, {
        transition: "sea-state-cut",
      });
      await harness.setHostSceneForegroundFixture(false);
      await harness.advanceTicks(24);
      await harness.present();
      await harness.setHostSceneCurrentSsrFixtureHotColor("magenta");
      await harness.setHostSceneCurrentSsrFixture(fixtureEnabled);
      await harness.advanceTicks(1);
      const presentation = await harness.present();
      const [fresnel, hit, confidence, roughness] = await Promise.all([
        harness.capture("optical-fresnel"),
        harness.capture("ssr-hit"),
        harness.capture("ssr-confidence"),
        harness.capture("ssr-roughness"),
      ]);
      return {
        occupancy: "",
        environment: "",
        fresnel: fresnel.data,
        hit: hit.data,
        confidence: confidence.data,
        color: "",
        roughness: roughness.data,
        reflectionBase: "",
        ssrComposite: "",
        planarColor: "",
        finalColor: "",
        currentColor: "",
        depth: "",
        normal: "",
        motion: "",
        compileCount: presentation.compileCount,
        fixture: await harness.readHostSceneCurrentSsrFixture(),
      };
    },
    {
      fixtureEnabled: enabled,
      cameraPose: camera,
      artisticControls: controls,
    },
  );
}

function waterPixels(fresnelA: readonly number[], fresnelB: readonly number[]) {
  return fresnelA
    .map((value, index) =>
      value > 0.001 && (fresnelB[index] ?? 0) > 0.001 ? index : -1,
    )
    .filter((index) => index >= 0);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function luminance(color: Uint8Array, pixel: number): number {
  const source = pixel * 4;
  return (
    0.2126 * (color[source] ?? 0) +
    0.7152 * (color[source + 1] ?? 0) +
    0.0722 * (color[source + 2] ?? 0)
  );
}

function colorDelta(
  left: Uint8Array,
  right: Uint8Array,
  pixel: number,
): number {
  const source = pixel * 4;
  return Math.max(
    Math.abs((left[source] ?? 0) - (right[source] ?? 0)),
    Math.abs((left[source + 1] ?? 0) - (right[source + 1] ?? 0)),
    Math.abs((left[source + 2] ?? 0) - (right[source + 2] ?? 0)),
  );
}

function linearRgbWithinHalfEpsilon(
  left: readonly number[],
  right: readonly number[],
  pixel: number,
): boolean {
  const source = pixel * 3;
  return (
    Math.abs((left[source] ?? 0) - (right[source] ?? 0)) <=
      HALF_FLOAT_EPSILON &&
    Math.abs((left[source + 1] ?? 0) - (right[source + 1] ?? 0)) <=
      HALF_FLOAT_EPSILON &&
    Math.abs((left[source + 2] ?? 0) - (right[source + 2] ?? 0)) <=
      HALF_FLOAT_EPSILON
  );
}

function linearLuminance(color: readonly number[], pixel: number): number {
  const source = pixel * 3;
  return (
    0.2126 * (color[source] ?? 0) +
    0.7152 * (color[source + 1] ?? 0) +
    0.0722 * (color[source + 2] ?? 0)
  );
}

function magentaEnergy(color: readonly number[], pixel: number): number {
  const source = pixel * 3;
  return (
    (color[source] ?? 0) + (color[source + 2] ?? 0) - (color[source + 1] ?? 0)
  );
}

function isSignificantSsrHitSample(worldDistance: number): boolean {
  return worldDistance > HALF_FLOAT_EPSILON;
}

function viewZToPerspectiveDepth(
  viewZ: number,
  near: number,
  far: number,
): number {
  return ((near + viewZ) * far) / ((far - near) * viewZ);
}

function createQaPerspectiveCamera(pose: QaCameraV1): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    pose.verticalFovDegrees,
    VIEWPORT.width / VIEWPORT.height,
    pose.near,
    pose.far,
  );
  camera.position.set(...pose.position);
  camera.up.set(...pose.up);
  camera.lookAt(...pose.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function reconstructViewPosition(
  camera: PerspectiveCamera,
  pixel: number,
  linearViewDistance: number,
): Vector3 {
  const x = pixel % VIEWPORT.width;
  const y = Math.floor(pixel / VIEWPORT.width);
  const screenX = (x + 0.5) / VIEWPORT.width;
  const screenY = (y + 0.5) / VIEWPORT.height;
  const viewZ = -linearViewDistance;
  const clip = new Vector4(
    screenX * 2 - 1,
    (1 - screenY) * 2 - 1,
    viewZToPerspectiveDepth(viewZ, camera.near, camera.far),
    1,
  );
  clip.applyMatrix4(camera.projectionMatrixInverse);
  return new Vector3(clip.x / clip.w, clip.y / clip.w, clip.z / clip.w);
}

function projectViewToScreenUv(
  camera: PerspectiveCamera,
  viewPosition: Vector3,
): { readonly u: number; readonly v: number } {
  const clip = new Vector4(
    viewPosition.x,
    viewPosition.y,
    viewPosition.z,
    1,
  ).applyMatrix4(camera.projectionMatrix);
  return {
    u: clip.x / clip.w / 2 + 0.5,
    v: 1 - (clip.y / clip.w / 2 + 0.5),
  };
}

function reconstructComposeHitUv(
  camera: PerspectiveCamera,
  pixel: number,
  linearViewDistance: number,
  viewNormal: readonly [number, number, number],
  worldDistance: number,
): { readonly u: number; readonly v: number } | null {
  if (
    !Number.isFinite(linearViewDistance) ||
    !Number.isFinite(worldDistance) ||
    !isSignificantSsrHitSample(worldDistance)
  ) {
    return null;
  }
  const viewPosition = reconstructViewPosition(
    camera,
    pixel,
    linearViewDistance,
  );
  const viewIncident = viewPosition.clone().normalize();
  const viewReflect = viewIncident
    .clone()
    .reflect(new Vector3(...viewNormal))
    .normalize();
  const hitView = viewPosition.addScaledVector(viewReflect, worldDistance);
  return projectViewToScreenUv(camera, hitView);
}

function everyPixelRgbWithinHalfEpsilon(
  left: readonly number[],
  right: readonly number[],
): boolean {
  const pixels = left.length / 3;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (!linearRgbWithinHalfEpsilon(left, right, pixel)) {
      return false;
    }
  }
  return true;
}

function assertFiniteUnitInterval(values: readonly number[]): void {
  expect(values.every((value) => Number.isFinite(value))).toBe(true);
  expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
}

test.describe.configure({ mode: "serial" });

test("keeps the FrontSide current-frame SSR fixture visible and scale-disabled through ready", async ({
  page,
}) => {
  await openQaStage(page);
  const ready = await page.evaluate(async () => {
    const harness = window.__REAL_WATER_QA__ as QaHarness | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    const before = await harness.readHostSceneCurrentSsrFixture();
    await harness.reset({ seed: 0x4000_0000 });
    await harness.setCamera(
      {
        projection: "perspective",
        position: [0, 12, 20],
        target: [0, 0, 0],
        up: [0, 1, 0],
        verticalFovDegrees: 40,
        near: 0.1,
        far: 200,
      },
      { transition: "camera-cut" },
    );
    await harness.advanceTicks(24);
    await harness.present();
    const settled = await harness.present();
    await harness.setHostSceneCurrentSsrFixture(true);
    const enabled = await harness.present();
    const afterEnable = await harness.readHostSceneCurrentSsrFixture();
    await harness.setHostSceneCurrentSsrFixtureHotColor("black");
    const black = await harness.present();
    await harness.setHostSceneCurrentSsrFixtureHotColor("magenta");
    await harness.setHostSceneCurrentSsrFixture(false);
    const disabled = await harness.present();
    return {
      before,
      afterEnable,
      compileAtReady: settled.compileCount,
      compileAfterEnable: enabled.compileCount,
      compileAfterBlack: black.compileCount,
      compileAfterDisable: disabled.compileCount,
      disabled: await harness.readHostSceneCurrentSsrFixture(),
    };
  });

  expect(ready.before).toEqual({
    visible: true,
    frustumCulled: false,
    enabled: false,
    scale: [0, 0, 0],
    hotColor: "magenta",
    colorWrite: true,
    depthWrite: true,
  });
  expect(ready.afterEnable).toMatchObject({
    visible: true,
    frustumCulled: false,
    enabled: true,
    scale: [1, 1, 1],
    colorWrite: true,
    depthWrite: true,
  });
  expect(ready.disabled).toEqual({
    visible: true,
    frustumCulled: false,
    enabled: false,
    scale: [0, 0, 0],
    hotColor: "magenta",
    colorWrite: true,
    depthWrite: true,
  });
  expect(ready.compileAfterEnable).toBe(ready.compileAtReady);
  expect(ready.compileAfterBlack).toBe(ready.compileAtReady);
  expect(ready.compileAfterDisable).toBe(ready.compileAtReady);
});

test("overlays current-frame SSR hits over planar-plus-environment base without changing planar occupancy", async ({
  page,
}) => {
  await openQaStage(page);
  const miss = await presentCurrentSsrEvidence(page, false);
  const hit = await presentCurrentSsrEvidence(page, true);
  const missOccupancy = decodeFloat32(miss.occupancy);
  const hitOccupancy = decodeFloat32(hit.occupancy);
  const missEnvironment = decodeFloat32(miss.environment);
  const hitEnvironment = decodeFloat32(hit.environment);
  const missHit = decodeFloat32(miss.hit);
  const hitHit = decodeFloat32(hit.hit);
  const missConfidence = decodeFloat32(miss.confidence);
  const hitConfidence = decodeFloat32(hit.confidence);
  const missCurrent = decodeUint8(miss.currentColor);
  const hitCurrent = decodeUint8(hit.currentColor);
  const missFinal = decodeUint8(miss.finalColor);
  const hitFinal = decodeUint8(hit.finalColor);
  const hitColor = decodeFloat32(hit.color);
  const missColor = decodeFloat32(miss.color);
  const missBase = decodeFloat32(miss.reflectionBase);
  const hitBase = decodeFloat32(hit.reflectionBase);
  const missComposite = decodeFloat32(miss.ssrComposite);
  const hitComposite = decodeFloat32(hit.ssrComposite);
  const hitRoughness = decodeFloat32(hit.roughness);
  const missFresnel = decodeFloat32(miss.fresnel);
  const hitFresnel = decodeFloat32(hit.fresnel);
  const missDepth = decodeFloat32(miss.depth);
  const hitDepth = decodeFloat32(hit.depth);
  const missNormal = decodeFloat32(miss.normal);
  const hitNormal = decodeFloat32(hit.normal);
  const missMotion = decodeFloat32(miss.motion);
  const hitMotion = decodeFloat32(hit.motion);
  const pixels = waterPixels(missFresnel, hitFresnel);
  const confidenceHits = pixels.filter(
    (index) =>
      (hitConfidence[index] ?? 0) > 0 &&
      (hitHit[index] ?? 0) > HALF_FLOAT_EPSILON,
  );
  const magentaEnergies = confidenceHits.map((index) => {
    const red = hitColor[index * 3] ?? 0;
    const green = hitColor[index * 3 + 1] ?? 0;
    const blue = hitColor[index * 3 + 2] ?? 0;
    return red + blue - green;
  });
  magentaEnergies.sort((left, right) => left - right);
  const percentile =
    magentaEnergies[Math.floor(magentaEnergies.length * 0.75)] ?? 0;

  expect(miss.fixture.enabled).toBe(false);
  expect(hit.fixture).toMatchObject({
    visible: true,
    frustumCulled: false,
    enabled: true,
    hotColor: "magenta",
  });
  expect(pixels.length).toBeGreaterThan(32);
  expect(
    pixels.every((index) => {
      const depthDelta = Math.abs(
        (missDepth[index] ?? 0) - (hitDepth[index] ?? 0),
      );
      const normalDelta = Math.hypot(
        (missNormal[index * 3] ?? 0) - (hitNormal[index * 3] ?? 0),
        (missNormal[index * 3 + 1] ?? 0) - (hitNormal[index * 3 + 1] ?? 0),
        (missNormal[index * 3 + 2] ?? 0) - (hitNormal[index * 3 + 2] ?? 0),
      );
      const motionDelta = Math.hypot(
        (missMotion[index * 2] ?? 0) - (hitMotion[index * 2] ?? 0),
        (missMotion[index * 2 + 1] ?? 0) - (hitMotion[index * 2 + 1] ?? 0),
      );
      return depthDelta < 0.05 && normalDelta < 0.08 && motionDelta < 0.02;
    }),
  ).toBe(true);
  expect(missOccupancy).toEqual(hitOccupancy);
  expect(missOccupancy.every((value) => value === 0)).toBe(true);
  expect(missEnvironment.some((value) => value > 0.02)).toBe(true);
  expect(
    pixels.every(
      (index) =>
        Math.abs((missEnvironment[index] ?? 0) - (hitEnvironment[index] ?? 0)) <
        1e-5,
    ),
  ).toBe(true);
  expect(missConfidence.every((value) => value === 0)).toBe(true);
  assertFiniteUnitInterval(missConfidence);
  assertFiniteUnitInterval(hitConfidence);
  expect(hitHit.every((value) => Number.isFinite(value))).toBe(true);
  expect(hitColor.every((value) => Number.isFinite(value))).toBe(true);
  expect(missBase.every((value) => Number.isFinite(value))).toBe(true);
  expect(hitBase.every((value) => Number.isFinite(value))).toBe(true);
  expect(missComposite.every((value) => Number.isFinite(value))).toBe(true);
  expect(hitComposite.every((value) => Number.isFinite(value))).toBe(true);
  expect(missBase).toHaveLength(VIEWPORT.width * VIEWPORT.height * 3);
  expect(hitBase).toHaveLength(missBase.length);
  expect(missComposite).toHaveLength(missBase.length);
  expect(hitComposite).toHaveLength(missBase.length);
  expect(hitRoughness.every((value) => Number.isFinite(value))).toBe(true);
  expect(pixels.some((index) => luminance(missCurrent, index) > 8)).toBe(true);
  expect(pixels.some((index) => luminance(missFinal, index) > 8)).toBe(true);
  expect(hitHit.some((value) => isSignificantSsrHitSample(value))).toBe(true);
  expect(hitConfidence.some((value) => value === 0)).toBe(true);
  expect(hitConfidence.some((value) => value > 0 && value < 1)).toBe(true);
  if (missHit.some((value) => value > HALF_FLOAT_EPSILON)) {
    expect(
      missHit.every(
        (value, index) =>
          value <= HALF_FLOAT_EPSILON || missConfidence[index] === 0,
      ),
    ).toBe(true);
  }
  expect(confidenceHits.length).toBeGreaterThan(0);
  expect(percentile).toBeGreaterThan(0);
  expect(magentaEnergies.some((value) => value > 0)).toBe(true);
  expect(missColor.every((value) => value === 0) && percentile <= 0).toBe(
    false,
  );
  expect(
    confidenceHits.some(
      (index) => colorDelta(hitCurrent, missCurrent, index) > 2,
    ),
  ).toBe(true);
  expect(
    confidenceHits.some((index) => colorDelta(hitFinal, missFinal, index) > 2),
  ).toBe(true);
  expect(
    pixels.every((index) =>
      linearRgbWithinHalfEpsilon(missComposite, missBase, index),
    ),
  ).toBe(true);
  expect(
    pixels.every((index) => {
      if ((hitConfidence[index] ?? 0) > HALF_FLOAT_EPSILON) {
        return true;
      }
      return linearRgbWithinHalfEpsilon(hitComposite, hitBase, index);
    }),
  ).toBe(true);
  expect(
    confidenceHits.some(
      (index) => !linearRgbWithinHalfEpsilon(hitComposite, hitBase, index),
    ),
  ).toBe(true);
  expect(
    confidenceHits.some(
      (index) =>
        magentaEnergy(hitComposite, index) >
        magentaEnergy(hitBase, index) + HALF_FLOAT_EPSILON,
    ),
  ).toBe(true);
  const centerWater = pixels.filter((index) => {
    const x = index % VIEWPORT.width;
    const y = Math.floor(index / VIEWPORT.width);
    return (
      x >= 8 && x < VIEWPORT.width - 8 && y >= 8 && y < VIEWPORT.height - 8
    );
  });
  expect(centerWater.length).toBeGreaterThan(8);
  expect(
    centerWater.some(
      (index) =>
        isSignificantSsrHitSample(hitHit[index] ?? 0) &&
        (hitConfidence[index] ?? 0) === 0,
    ),
  ).toBe(true);
  expect(
    centerWater.some((index) => {
      const value = hitConfidence[index] ?? 0;
      return value > 0 && value < 1;
    }),
  ).toBe(true);
  expect(hit.compileCount).toBe(miss.compileCount);
});

test("suppresses current-frame SSR confidence across default active whitecaps", async ({
  page,
}) => {
  await openQaStage(page);
  const frame = await presentCurrentSsrEvidence(
    page,
    true,
    "magenta",
    HIT_CAMERA,
    createWaterPreset("swell").artisticControls,
  );
  if (frame.whitecapDensity === undefined) {
    throw new Error("Default whitecap density capture is unavailable.");
  }
  const density = decodeFloat32(frame.whitecapDensity);
  const fresnel = decodeFloat32(frame.fresnel);
  const hit = decodeFloat32(frame.hit);
  const confidence = decodeFloat32(frame.confidence);
  const roughness = decodeFloat32(frame.roughness);
  const activeRawHits = density
    .map((value, index) =>
      value > 0.5 &&
      (fresnel[index] ?? 0) > 0.001 &&
      (hit[index] ?? 0) > HALF_FLOAT_EPSILON
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
  const activeDensity = activeRawHits.map((index) => density[index] ?? 0);
  const activeRoughness = activeRawHits.map((index) => roughness[index] ?? 0);
  const meanDensity = mean(activeDensity);
  const meanRoughness = mean(activeRoughness);

  expect(activeRawHits.length).toBeGreaterThan(1_000);
  expect(meanDensity).toBeGreaterThan(0.75);
  expect(meanDensity).toBeLessThan(0.86);
  expect(Math.min(...activeRoughness)).toBeGreaterThanOrEqual(ROUGHNESS_CUTOFF);
  expect(meanRoughness).toBeGreaterThan(0.65);
  expect(meanRoughness).toBeLessThan(0.78);
  expect(activeRawHits.every((index) => confidence[index] === 0)).toBe(true);
});

test("keeps a black main-visible fixture as an SSR hit that darkens same-frame composite", async ({
  page,
}) => {
  await openQaStage(page);
  const disabled = await presentCurrentSsrEvidence(page, false, "black");
  const black = await presentCurrentSsrEvidence(page, true, "black");
  const disabledHit = decodeFloat32(disabled.hit);
  const hits = decodeFloat32(black.hit);
  const disabledConfidence = decodeFloat32(disabled.confidence);
  const confidence = decodeFloat32(black.confidence);
  const color = decodeFloat32(black.color);
  const disabledBase = decodeFloat32(disabled.reflectionBase);
  const blackBase = decodeFloat32(black.reflectionBase);
  const disabledComposite = decodeFloat32(disabled.ssrComposite);
  const blackComposite = decodeFloat32(black.ssrComposite);
  const disabledEnv = decodeFloat32(disabled.environment);
  const blackEnv = decodeFloat32(black.environment);
  const disabledOccupancy = decodeFloat32(disabled.occupancy);
  const blackOccupancy = decodeFloat32(black.occupancy);
  const disabledPlanar = decodeUint8(disabled.planarColor);
  const blackPlanar = decodeUint8(black.planarColor);
  const disabledFresnel = decodeFloat32(disabled.fresnel);
  const blackFresnel = decodeFloat32(black.fresnel);
  const pixels = waterPixels(disabledFresnel, blackFresnel);
  expect(black.fixture.hotColor).toBe("black");
  expect(hits.some((value) => isSignificantSsrHitSample(value))).toBe(true);
  expect(confidence.some((value) => value > 0)).toBe(true);
  assertFiniteUnitInterval(confidence);
  expect(disabledOccupancy).toEqual(blackOccupancy);
  expect(
    pixels.every(
      (index) =>
        Math.abs((disabledEnv[index] ?? 0) - (blackEnv[index] ?? 0)) < 1e-5,
    ),
  ).toBe(true);
  expect(disabledPlanar).toEqual(blackPlanar);
  expect(disabledConfidence.every((value) => value === 0)).toBe(true);
  expect(
    disabledHit.every(
      (value) => value === 0 || (Number.isFinite(value) && value > 0),
    ),
    "disabled ssr-hit must be exact 0 miss or finite world-distance > 0",
  ).toBe(true);
  const darkened = pixels.filter((index) => (confidence[index] ?? 0) > 0);
  expect(darkened.length).toBeGreaterThan(0);
  expect(disabledBase.every((value) => Number.isFinite(value))).toBe(true);
  expect(blackBase.every((value) => Number.isFinite(value))).toBe(true);
  expect(disabledComposite.every((value) => Number.isFinite(value))).toBe(true);
  expect(blackComposite.every((value) => Number.isFinite(value))).toBe(true);
  expect(
    pixels.every((index) =>
      linearRgbWithinHalfEpsilon(disabledComposite, disabledBase, index),
    ),
  ).toBe(true);
  expect(
    darkened.some(
      (index) =>
        linearLuminance(blackComposite, index) <
        linearLuminance(blackBase, index) - HALF_FLOAT_EPSILON,
    ),
  ).toBe(true);
  expect(
    hits.some((value, index) => {
      if (!isSignificantSsrHitSample(value)) {
        return false;
      }
      const red = color[index * 3] ?? 0;
      const green = color[index * 3 + 1] ?? 0;
      const blue = color[index * 3 + 2] ?? 0;
      return red < 0.05 && green < 0.05 && blue < 0.05;
    }),
  ).toBe(true);
  expect(black.compileCount).toBe(disabled.compileCount);
});

test("returns confidence 0 for offscreen current-frame SSR misses", async ({
  page,
}) => {
  await openQaStage(page);
  const disabled = await presentCurrentSsrEvidence(
    page,
    false,
    "magenta",
    OFFSCREEN_CAMERA,
  );
  const offscreen = await presentCurrentSsrEvidence(
    page,
    true,
    "magenta",
    OFFSCREEN_CAMERA,
  );
  const disabledConfidence = decodeFloat32(disabled.confidence);
  const confidence = decodeFloat32(offscreen.confidence);
  const disabledBase = decodeFloat32(disabled.reflectionBase);
  const offscreenBase = decodeFloat32(offscreen.reflectionBase);
  const disabledComposite = decodeFloat32(disabled.ssrComposite);
  const offscreenComposite = decodeFloat32(offscreen.ssrComposite);
  const disabledEnv = decodeFloat32(disabled.environment);
  const offscreenEnv = decodeFloat32(offscreen.environment);
  const disabledOccupancy = decodeFloat32(disabled.occupancy);
  const offscreenOccupancy = decodeFloat32(offscreen.occupancy);
  const hits = decodeFloat32(offscreen.hit);
  expect(disabledConfidence.every((value) => value === 0)).toBe(true);
  expect(confidence.every((value) => value === 0)).toBe(true);
  assertFiniteUnitInterval(confidence);
  expect(disabledBase.every((value) => Number.isFinite(value))).toBe(true);
  expect(offscreenBase.every((value) => Number.isFinite(value))).toBe(true);
  expect(disabledComposite.every((value) => Number.isFinite(value))).toBe(true);
  expect(offscreenComposite.every((value) => Number.isFinite(value))).toBe(
    true,
  );
  expect(everyPixelRgbWithinHalfEpsilon(disabledComposite, disabledBase)).toBe(
    true,
  );
  expect(
    everyPixelRgbWithinHalfEpsilon(offscreenComposite, offscreenBase),
  ).toBe(true);
  expect(disabledEnv).toEqual(offscreenEnv);
  expect(disabledOccupancy).toEqual(offscreenOccupancy);
  if (hits.some((value) => isSignificantSsrHitSample(value))) {
    expect(
      hits.every(
        (value, index) =>
          !isSignificantSsrHitSample(value) || confidence[index] === 0,
      ),
    ).toBe(true);
  }
  expect(offscreen.compileCount).toBe(disabled.compileCount);
});

test("tapers confidence and composite on a valid raw hit crossing the hit-UV fade band", async ({
  page,
}) => {
  await openQaStage(page);
  const hit = await presentCurrentSsrEvidence(page, true);
  const ssr = createMinimalWaterQualityProfile().reflection.ssr;
  const camera = createQaPerspectiveCamera(HIT_CAMERA);
  const hits = decodeFloat32(hit.hit);
  const confidence = decodeFloat32(hit.confidence);
  const fresnel = decodeFloat32(hit.fresnel);
  const roughness = decodeFloat32(hit.roughness);
  const depth = decodeFloat32(hit.depth);
  const normal = decodeFloat32(hit.normal);
  const color = decodeFloat32(hit.color);
  const base = decodeFloat32(hit.reflectionBase);
  const composite = decodeFloat32(hit.ssrComposite);
  const fade: number[] = [];
  const interior: number[] = [];
  const reconstructedOffscreen: number[] = [];
  for (let pixel = 0; pixel < hits.length; pixel += 1) {
    const worldDistance = hits[pixel] ?? 0;
    if (
      !isSignificantSsrHitSample(worldDistance) ||
      worldDistance > ssr.maxDistance
    ) {
      continue;
    }
    if ((fresnel[pixel] ?? 0) <= 0.001) {
      continue;
    }
    if ((roughness[pixel] ?? 1) >= ssr.roughnessCutoff) {
      continue;
    }
    if (magentaEnergy(color, pixel) <= HALF_FLOAT_EPSILON) {
      continue;
    }
    const reconstructed = reconstructComposeHitUv(
      camera,
      pixel,
      depth[pixel] ?? Number.NaN,
      [
        normal[pixel * 3] ?? Number.NaN,
        normal[pixel * 3 + 1] ?? Number.NaN,
        normal[pixel * 3 + 2] ?? Number.NaN,
      ],
      worldDistance,
    );
    if (reconstructed === null) {
      continue;
    }
    const edgeDist = Math.min(
      reconstructed.u,
      1 - reconstructed.u,
      reconstructed.v,
      1 - reconstructed.v,
    );
    if (
      reconstructed.u < 0 ||
      reconstructed.u > 1 ||
      reconstructed.v < 0 ||
      reconstructed.v > 1
    ) {
      reconstructedOffscreen.push(pixel);
      continue;
    }
    if (edgeDist < ssr.screenEdgeFade) {
      fade.push(pixel);
    } else {
      interior.push(pixel);
    }
  }
  expect(
    fade.length,
    `fade=${fade.length} interior=${interior.length} offscreen=${reconstructedOffscreen.length}`,
  ).toBeGreaterThan(0);
  expect(interior.length).toBeGreaterThan(0);
  const fadeConfidence = fade.map((pixel) => confidence[pixel] ?? 0);
  const interiorConfidence = interior.map((pixel) => confidence[pixel] ?? 0);
  const fadePositive = fadeConfidence.filter(
    (value) => value > HALF_FLOAT_EPSILON,
  ).length;
  const interiorPositive = interiorConfidence.filter(
    (value) => value > HALF_FLOAT_EPSILON,
  ).length;
  expect(
    fadeConfidence.some((value) => value > HALF_FLOAT_EPSILON),
    `fade=${fade.length} fadePositive=${fadePositive} fadeMin=${Math.min(...fadeConfidence)} fadeMax=${Math.max(...fadeConfidence)} interior=${interior.length} interiorPositive=${interiorPositive} interiorMax=${Math.max(...interiorConfidence)}`,
  ).toBe(true);
  expect(
    fadeConfidence.some(
      (value) => value > HALF_FLOAT_EPSILON && value < 1 - HALF_FLOAT_EPSILON,
    ),
  ).toBe(true);
  const fadeMean =
    fadeConfidence.reduce((sum, value) => sum + value, 0) / fade.length;
  const interiorMean =
    interiorConfidence.reduce((sum, value) => sum + value, 0) / interior.length;
  expect(
    fadeMean,
    `fadeMean=${fadeMean} interiorMean=${interiorMean}`,
  ).toBeLessThan(interiorMean - HALF_FLOAT_EPSILON);
  const fadeOverlay = fade.map((pixel) =>
    Math.max(0, magentaEnergy(composite, pixel) - magentaEnergy(base, pixel)),
  );
  const interiorOverlay = interior.map((pixel) =>
    Math.max(0, magentaEnergy(composite, pixel) - magentaEnergy(base, pixel)),
  );
  const fadeOverlayMean =
    fadeOverlay.reduce((sum, value) => sum + value, 0) / fade.length;
  const interiorOverlayMean =
    interiorOverlay.reduce((sum, value) => sum + value, 0) / interior.length;
  expect(fadeOverlay.some((value) => value > HALF_FLOAT_EPSILON)).toBe(true);
  const fadeMetrics = `fade=${fade.length} fadePositive=${fadePositive} fadeMin=${Math.min(...fadeConfidence)} fadeMax=${Math.max(...fadeConfidence)} fadeMean=${fadeMean} interior=${interior.length} interiorPositive=${interiorPositive} interiorMax=${Math.max(...interiorConfidence)} interiorMean=${interiorMean} fadeOverlayMean=${fadeOverlayMean} interiorOverlayMean=${interiorOverlayMean} reconstructedOffscreen=${reconstructedOffscreen.length}`;
  expect(fadeOverlayMean, fadeMetrics).toBeLessThan(
    interiorOverlayMean - HALF_FLOAT_EPSILON,
  );
});

test("updates raw SSR and TRAA final on the same JS task after a miss-to-hit present", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ cameraPose, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarness | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x4000_0000 });
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      await harness.setCamera(cameraPose, { transition: "camera-cut" });
      await harness.setHostSceneForegroundFixture(false);
      await harness.advanceTicks(24);
      await harness.setHostSceneCurrentSsrFixture(false);
      const missPresentation = await harness.present();
      const miss = {
        hit: (await harness.capture("ssr-hit")).data,
        confidence: (await harness.capture("ssr-confidence")).data,
        color: (await harness.capture("ssr-color")).data,
        finalColor: (await harness.capture("final-color")).data,
        compileCount: missPresentation.compileCount,
      };
      await harness.setHostSceneCurrentSsrFixture(true);
      const hitPresentation = await harness.present();
      const hit = {
        hit: (await harness.capture("ssr-hit")).data,
        confidence: (await harness.capture("ssr-confidence")).data,
        color: (await harness.capture("ssr-color")).data,
        finalColor: (await harness.capture("final-color")).data,
        compileCount: hitPresentation.compileCount,
      };
      return { miss, hit };
    },
    { cameraPose: HIT_CAMERA, controls: SSR_CONTROLS },
  );
  const missHit = decodeFloat32(result.miss.hit);
  const hitHit = decodeFloat32(result.hit.hit);
  const missConfidence = decodeFloat32(result.miss.confidence);
  const hitConfidence = decodeFloat32(result.hit.confidence);
  const missColor = decodeFloat32(result.miss.color);
  const hitColor = decodeFloat32(result.hit.color);
  const missFinal = decodeUint8(result.miss.finalColor);
  const hitFinal = decodeUint8(result.hit.finalColor);
  expect(missConfidence.every((value) => value === 0)).toBe(true);
  expect(hitHit.some((value) => isSignificantSsrHitSample(value))).toBe(true);
  expect(hitConfidence.some((value) => value > 0)).toBe(true);
  expect(
    hitColor.some((value, index) => value !== (missColor[index] ?? 0)),
  ).toBe(true);
  expect(
    Array.from(hitFinal).some(
      (value, index) => value !== (missFinal[index] ?? 0),
    ),
  ).toBe(true);
  expect(hitHit.some((value, index) => value !== (missHit[index] ?? 0))).toBe(
    true,
  );
  expect(result.hit.compileCount).toBe(result.miss.compileCount);
});

test("gates far-water current-frame SSR confidence from the roughness attachment on both sides of cutoff", async ({
  page,
}) => {
  await openQaStage(page);
  const miss = await presentFarWaterSsrEvidence(page, false);
  const hit = await presentFarWaterSsrEvidence(page, true);
  const missFresnel = decodeFloat32(miss.fresnel);
  const hitFresnel = decodeFloat32(hit.fresnel);
  const hitHit = decodeFloat32(hit.hit);
  const hitConfidence = decodeFloat32(hit.confidence);
  const hitRoughness = decodeFloat32(hit.roughness);
  const pixels = waterPixels(missFresnel, hitFresnel);
  const cameraXz = Math.hypot(
    FAR_WATER_CAMERA.position[0],
    FAR_WATER_CAMERA.position[2],
  );
  const rawHits = pixels.filter((index) =>
    isSignificantSsrHitSample(hitHit[index] ?? 0),
  );
  const roughHits = rawHits.filter(
    (index) => (hitRoughness[index] ?? 0) >= ROUGHNESS_CUTOFF,
  );
  const smoothRawHits = rawHits.filter(
    (index) => (hitRoughness[index] ?? 0) < ROUGHNESS_CUTOFF,
  );
  const maxRoughness = hitRoughness.reduce(
    (max, value) => (value > max ? value : max),
    Number.NEGATIVE_INFINITY,
  );
  const minHitRoughness = rawHits.reduce((min, index) => {
    const value = hitRoughness[index] ?? Number.POSITIVE_INFINITY;
    return value < min ? value : min;
  }, Number.POSITIVE_INFINITY);
  expect(cameraXz).toBeGreaterThan(320);
  expect(pixels.length).toBeGreaterThan(32);
  assertFiniteUnitInterval(hitConfidence);
  expect(hitRoughness.every((value) => Number.isFinite(value))).toBe(true);
  expect(
    roughHits.length,
    `far rawHits=${rawHits.length} roughHits=${roughHits.length} smoothRawHits=${smoothRawHits.length} maxRoughness=${maxRoughness} minHitRoughness=${minHitRoughness}`,
  ).toBeGreaterThan(0);
  expect(roughHits.every((index) => (hitConfidence[index] ?? 0) === 0)).toBe(
    true,
  );
  expect(
    smoothRawHits.some((index) => (hitConfidence[index] ?? 0) > 0),
    `smooth raw-hit pixels with confidence>0: ${smoothRawHits.filter((index) => (hitConfidence[index] ?? 0) > 0).length}`,
  ).toBe(true);
  expect(hit.compileCount).toBe(miss.compileCount);
});
