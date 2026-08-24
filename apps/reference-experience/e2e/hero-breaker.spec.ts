import { expect, test, type Page } from "@playwright/test";
import { createWaterPreset } from "real-water";
import type {
  QaCameraV1,
  QaCaptureV16,
  QaHarnessV16,
  QaPresentationReceiptV16,
} from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32, decodeUint8 } from "./qa-capture-bytes.js";

const VIEWPORT = { width: 320, height: 180 } as const;
const SEED = 0x2918_0001;
const START_TICK = 60;
const ACTIVE_AGE_TICKS = 45;
const HERO_ID = 0x2918_0018;
const HERO_POSITION = [0, 0, -6] as const;
const HERO_DIRECTION = [1, 0, 0] as const;
const HERO_RADIUS_METRES = 10;
const HERO_AMPLITUDE_METRES = 2.25;
const HERO_FOAM_AMOUNT = 1;
const HERO_SPRAY_AMOUNT = 1;
const HERO_LIFETIME_TICKS = 180;
const HERO_PRIORITY = 255;
const CAMERA = Object.freeze({
  projection: "perspective",
  position: [0, 9, 18] as const,
  target: [0, 1, -6] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 48,
  near: 0.1,
  far: 160,
}) satisfies QaCameraV1;
const CONTROLS = createWaterPreset("swell").artisticControls;

type PresentationIdentity = Pick<
  QaPresentationReceiptV16,
  "tick" | "manifestHash" | "compileCount" | "probeCount" | "secondaryParticles"
>;

interface HeroFrame {
  readonly presentation: PresentationIdentity;
  readonly finalColor: QaCaptureV16;
  readonly depth: QaCaptureV16;
  readonly normal: QaCaptureV16;
  readonly heroFoam: QaCaptureV16;
  readonly secondaryContribution: QaCaptureV16;
  readonly secondaryOverdraw: QaCaptureV16;
  readonly query: Awaited<ReturnType<QaHarnessV16["queryGameplay"]>>;
}

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

test("renders and byte-replays one bounded art-directed Hero Breaker", async ({
  page,
}) => {
  test.slow();
  await openQaStage(page);

  const result = await page.evaluate(
    async ({ activeAgeTicks, camera, controls, hero, seed, startTick }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV16 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }

      const batch = (sprayAmount: number) => ({
        kind: "hero-breaker" as const,
        count: 1,
        ids: Uint32Array.of(hero.id),
        positions: Float32Array.from(hero.position),
        directions: Float32Array.from(hero.direction),
        radii: Float32Array.of(hero.radiusMetres),
        amplitudes: Float32Array.of(hero.amplitudeMetres),
        foamAmounts: Float32Array.of(hero.foamAmount),
        sprayAmounts: Float32Array.of(sprayAmount),
        lifetimeTicks: Uint16Array.of(hero.lifetimeTicks),
        priorities: Uint8Array.of(hero.priority),
      });
      const presentationIdentity = (
        presentation: QaPresentationReceiptV16,
      ): PresentationIdentity => ({
        tick: presentation.tick,
        manifestHash: presentation.manifestHash,
        compileCount: presentation.compileCount,
        probeCount: presentation.probeCount,
        secondaryParticles: presentation.secondaryParticles,
      });
      const captureFrame = async (): Promise<HeroFrame> => {
        const presentation = await harness.present();
        const [
          finalColor,
          depth,
          normal,
          heroFoam,
          secondaryContribution,
          secondaryOverdraw,
        ] = await Promise.all([
          harness.capture("final-color"),
          harness.capture("depth"),
          harness.capture("normal"),
          harness.capture("hero-breaker-foam"),
          harness.capture("secondary-particle-contribution"),
          harness.capture("secondary-particle-overdraw"),
        ]);
        const query = await harness.queryGameplay(hero.position);
        return {
          presentation: presentationIdentity(presentation),
          finalColor,
          depth,
          normal,
          heroFoam,
          secondaryContribution,
          secondaryOverdraw,
          query,
        };
      };
      const drive = async (
        trigger: boolean,
        sprayAmount = hero.sprayAmount,
      ) => {
        await harness.reset({ seed });
        await harness.updateArtisticControls(controls, {
          transition: "continuous",
        });
        await harness.updateInteractionAnchor({ x: 0, z: 0 });
        await harness.setCamera(camera, { transition: "continuous" });
        await harness.advanceTicks(startTick);
        const baseline = presentationIdentity(await harness.present());
        const receipt = trigger
          ? await harness.submitDisturbances(batch(sprayAmount))
          : null;
        await harness.advanceTicks(activeAgeTicks);
        const active = await captureFrame();
        await harness.advanceTicks(hero.lifetimeTicks - activeAgeTicks);
        const expired = await captureFrame();
        const rearmReceipt = trigger
          ? await harness.submitDisturbances(batch(sprayAmount))
          : null;
        return { baseline, receipt, active, expired, rearmReceipt };
      };

      return {
        first: await drive(true),
        replay: await drive(true),
        zeroSpray: await drive(true, 0),
        control: await drive(false),
      };
    },
    {
      activeAgeTicks: ACTIVE_AGE_TICKS,
      camera: CAMERA,
      controls: CONTROLS,
      hero: {
        id: HERO_ID,
        position: HERO_POSITION,
        direction: HERO_DIRECTION,
        radiusMetres: HERO_RADIUS_METRES,
        amplitudeMetres: HERO_AMPLITUDE_METRES,
        foamAmount: HERO_FOAM_AMOUNT,
        sprayAmount: HERO_SPRAY_AMOUNT,
        lifetimeTicks: HERO_LIFETIME_TICKS,
        priority: HERO_PRIORITY,
      },
      seed: SEED,
      startTick: START_TICK,
    },
  );

  expect(result.first.receipt).toEqual({
    tick: START_TICK,
    acceptedDisturbanceIds: [HERO_ID],
    droppedDisturbanceIds: [],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 1,
  });
  expect(result.first.rearmReceipt).toEqual({
    tick: START_TICK + HERO_LIFETIME_TICKS,
    acceptedDisturbanceIds: [HERO_ID],
    droppedDisturbanceIds: [],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 1,
  });
  expect(result.replay.receipt).toEqual(result.first.receipt);
  expect(result.replay.rearmReceipt).toEqual(result.first.rearmReceipt);
  expect(result.zeroSpray.receipt).toEqual(result.first.receipt);

  expect(result.first.active.presentation).toMatchObject({
    tick: START_TICK + ACTIVE_AGE_TICKS,
    manifestHash: result.first.baseline.manifestHash,
    compileCount: result.first.baseline.compileCount,
    probeCount: result.first.baseline.probeCount,
  });
  expect(result.first.expired.presentation).toMatchObject({
    tick: START_TICK + HERO_LIFETIME_TICKS,
    manifestHash: result.first.baseline.manifestHash,
    compileCount: result.first.baseline.compileCount,
    probeCount: result.first.baseline.probeCount,
  });

  expect(result.first.active.heroFoam).toMatchObject({
    name: "hero-breaker-foam",
    format: "r32float-hero-breaker-foam",
    elementType: "float32",
    components: 1,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
  });
  expect(result.first.active.secondaryContribution).toMatchObject({
    name: "secondary-particle-contribution",
    format: "r32float-secondary-particle-contribution",
    elementType: "float32",
    components: 1,
  });
  expect(result.first.active.secondaryOverdraw).toMatchObject({
    name: "secondary-particle-overdraw",
    format: "r32float-secondary-particle-overdraw",
    elementType: "float32",
    components: 1,
  });

  for (const capture of [
    result.first.active.depth,
    result.first.active.normal,
    result.first.active.heroFoam,
    result.first.active.secondaryContribution,
    result.first.active.secondaryOverdraw,
  ]) {
    const values = decodeFloat32(capture.data);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every(Number.isFinite)).toBe(true);
  }
  const activeFoam = decodeFloat32(result.first.active.heroFoam.data);
  const activeContribution = decodeFloat32(
    result.first.active.secondaryContribution.data,
  );
  const activeOverdraw = decodeFloat32(
    result.first.active.secondaryOverdraw.data,
  );
  expect(activeFoam.every((value) => value >= 0 && value <= 1)).toBe(true);
  expect(activeContribution.every((value) => value >= 0)).toBe(true);
  expect(activeOverdraw.every((value) => value >= 0)).toBe(true);
  expect(
    regionalNonZeroPixelCount(activeFoam, VIEWPORT.width, VIEWPORT.height),
  ).toBeGreaterThan(0);
  expect(
    regionalNonZeroPixelCount(
      activeContribution,
      VIEWPORT.width,
      VIEWPORT.height,
    ),
  ).toBeGreaterThan(0);
  expect(
    regionalNonZeroPixelCount(activeOverdraw, VIEWPORT.width, VIEWPORT.height),
  ).toBeGreaterThan(0);

  expectFrameDiffs(result.first.active, result.control.active);
  const silhouette = measureSignedDepthSupport(
    result.first.active.depth,
    result.control.active.depth,
    VIEWPORT.width,
    VIEWPORT.height,
  );
  expect(silhouette.activePixels).toBeGreaterThan(32);
  expect(silhouette.width).toBeGreaterThan(4);
  expect(silhouette.height).toBeGreaterThan(4);
  expect(silhouette.positivePixels).toBeGreaterThan(4);
  expect(silhouette.negativePixels).toBeGreaterThan(4);
  // The authored crest and forward hollow occupy distinct screen-space lobes;
  // a symmetric radial bump cannot satisfy this directional silhouette check.
  expect(
    Math.abs(silhouette.positiveCentroidX - silhouette.negativeCentroidX),
  ).toBeGreaterThan(1);
  expect(result.first.active.query.height).not.toBe(
    result.control.active.query.height,
  );
  expect(result.first.active.query.normal).not.toEqual(
    result.control.active.query.normal,
  );

  const spray =
    result.first.active.presentation.secondaryParticles.consumers.find(
      ({ consumerId }) => consumerId === "spray-droplet-mist",
    );
  expect(spray).toMatchObject({
    consumerId: "spray-droplet-mist",
  });
  expect(spray?.requested).toBeGreaterThan(0);
  expect(spray?.retained).toBeGreaterThan(0);
  expect(spray?.contributionMaximumQ16).toBeGreaterThan(0);
  const zeroSprayReceipt =
    result.zeroSpray.active.presentation.secondaryParticles.consumers.find(
      ({ consumerId }) => consumerId === "spray-droplet-mist",
    );
  expect(zeroSprayReceipt).toMatchObject({
    consumerId: "spray-droplet-mist",
  });
  expect(spray?.requested).toBeGreaterThan(zeroSprayReceipt?.requested ?? 0);
  expectIsolatedHeroSpray(result.first.active, result.zeroSpray.active);

  expectFrameReplay(result.first.active, result.replay.active);
  expectFrameReplay(result.first.expired, result.replay.expired);
  expect(result.replay.active.presentation.secondaryParticles).toEqual(
    result.first.active.presentation.secondaryParticles,
  );

  const expiredFoam = decodeFloat32(result.first.expired.heroFoam.data);
  // The authored deformation and spray source expire at the batch boundary;
  // dedicated foam may remain in the prepared persistent history and decay
  // under the hot foamPersistence control.
  expect(expiredFoam.every((value) => value >= 0 && value <= 1)).toBe(true);
  const { presentationId: _expiredPresentationId, ...expiredQuery } =
    result.first.expired.query;
  const { presentationId: _controlPresentationId, ...controlExpiredQuery } =
    result.control.expired.query;
  void _expiredPresentationId;
  void _controlPresentationId;
  expect(expiredQuery).toEqual(controlExpiredQuery);
});

function expectFrameDiffs(active: HeroFrame, control: HeroFrame): void {
  for (const [left, right, components] of [
    [
      decodeUint8(active.finalColor.data),
      decodeUint8(control.finalColor.data),
      4,
    ],
    [decodeFloat32(active.depth.data), decodeFloat32(control.depth.data), 1],
    [decodeFloat32(active.normal.data), decodeFloat32(control.normal.data), 3],
    [
      decodeFloat32(active.secondaryContribution.data),
      decodeFloat32(control.secondaryContribution.data),
      1,
    ],
    [
      decodeFloat32(active.secondaryOverdraw.data),
      decodeFloat32(control.secondaryOverdraw.data),
      1,
    ],
  ] as const) {
    expect(
      regionalChangedPixelCount(
        left,
        right,
        VIEWPORT.width,
        VIEWPORT.height,
        components,
      ),
    ).toBeGreaterThan(0);
  }
}

function expectIsolatedHeroSpray(
  active: HeroFrame,
  zeroSpray: HeroFrame,
): void {
  // Deformation, dedicated foam, and the CPU query are byte/value identical;
  // only the authored Hero spray amount differs between these two frames.
  expect(zeroSpray.depth.data).toBe(active.depth.data);
  expect(zeroSpray.normal.data).toBe(active.normal.data);
  expect(zeroSpray.heroFoam.data).toBe(active.heroFoam.data);
  const { presentationId: _activePresentationId, ...activeQuery } =
    active.query;
  const { presentationId: _zeroPresentationId, ...zeroQuery } = zeroSpray.query;
  void _activePresentationId;
  void _zeroPresentationId;
  expect(zeroQuery).toEqual(activeQuery);

  for (const [left, right, components] of [
    [
      decodeUint8(active.finalColor.data),
      decodeUint8(zeroSpray.finalColor.data),
      4,
    ],
    [
      decodeFloat32(active.secondaryContribution.data),
      decodeFloat32(zeroSpray.secondaryContribution.data),
      1,
    ],
    [
      decodeFloat32(active.secondaryOverdraw.data),
      decodeFloat32(zeroSpray.secondaryOverdraw.data),
      1,
    ],
  ] as const) {
    expect(
      regionalChangedPixelCount(
        left,
        right,
        VIEWPORT.width,
        VIEWPORT.height,
        components,
      ),
    ).toBeGreaterThan(0);
  }
}

function measureSignedDepthSupport(
  active: QaCaptureV16,
  control: QaCaptureV16,
  width: number,
  height: number,
): Readonly<{
  activePixels: number;
  width: number;
  height: number;
  positivePixels: number;
  negativePixels: number;
  positiveCentroidX: number;
  negativeCentroidX: number;
}> {
  const activeDepth = decodeFloat32(active.data);
  const controlDepth = decodeFloat32(control.data);
  expect(activeDepth.length).toBe(controlDepth.length);
  let activePixels = 0;
  let positivePixels = 0;
  let negativePixels = 0;
  let positiveWeight = 0;
  let negativeWeight = 0;
  let positiveWeightedX = 0;
  let negativeWeightedX = 0;
  let minimumX = width;
  let maximumX = -1;
  let minimumY = height;
  let maximumY = -1;
  visitCentralPixels(width, height, (pixel) => {
    const delta = (activeDepth[pixel] ?? 0) - (controlDepth[pixel] ?? 0);
    if (delta === 0) {
      return;
    }
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    activePixels += 1;
    minimumX = Math.min(minimumX, x);
    maximumX = Math.max(maximumX, x);
    minimumY = Math.min(minimumY, y);
    maximumY = Math.max(maximumY, y);
    if (delta > 0) {
      positivePixels += 1;
      positiveWeight += delta;
      positiveWeightedX += x * delta;
    } else {
      const weight = -delta;
      negativePixels += 1;
      negativeWeight += weight;
      negativeWeightedX += x * weight;
    }
  });
  return Object.freeze({
    activePixels,
    width: maximumX < minimumX ? 0 : maximumX - minimumX + 1,
    height: maximumY < minimumY ? 0 : maximumY - minimumY + 1,
    positivePixels,
    negativePixels,
    positiveCentroidX:
      positiveWeight === 0 ? Number.NaN : positiveWeightedX / positiveWeight,
    negativeCentroidX:
      negativeWeight === 0 ? Number.NaN : negativeWeightedX / negativeWeight,
  });
}

function expectFrameReplay(first: HeroFrame, replay: HeroFrame): void {
  for (const [left, right] of [
    [first.finalColor, replay.finalColor],
    [first.depth, replay.depth],
    [first.normal, replay.normal],
    [first.heroFoam, replay.heroFoam],
    [first.secondaryContribution, replay.secondaryContribution],
    [first.secondaryOverdraw, replay.secondaryOverdraw],
  ] as const) {
    expect(right.data).toBe(left.data);
  }
  const { presentationId: _firstPresentationId, ...firstQuery } = first.query;
  const { presentationId: _replayPresentationId, ...replayQuery } =
    replay.query;
  void _firstPresentationId;
  void _replayPresentationId;
  expect(replayQuery).toEqual(firstQuery);
}

function regionalNonZeroPixelCount(
  values: readonly number[],
  width: number,
  height: number,
): number {
  let nonZero = 0;
  visitCentralPixels(width, height, (pixel) => {
    if ((values[pixel] ?? 0) > 0) {
      nonZero += 1;
    }
  });
  return nonZero;
}

function regionalChangedPixelCount(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
  width: number,
  height: number,
  components: number,
): number {
  expect(left.length).toBe(right.length);
  let changed = 0;
  visitCentralPixels(width, height, (pixel) => {
    const start = pixel * components;
    for (let component = 0; component < components; component += 1) {
      if (left[start + component] !== right[start + component]) {
        changed += 1;
        return;
      }
    }
  });
  return changed;
}

function visitCentralPixels(
  width: number,
  height: number,
  visit: (pixel: number) => void,
): void {
  const left = Math.floor(width / 4);
  const right = Math.ceil((width * 3) / 4);
  const top = Math.floor(height / 4);
  const bottom = Math.ceil((height * 3) / 4);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      visit(y * width + x);
    }
  }
}
