import { expect, test, type Page } from "@playwright/test";
import {
  createWaterPreset,
  type ArtisticControls,
  type InteractionAnchor,
} from "real-water";
import type {
  QaCameraV1,
  QaCaptureV17,
  QaHarness,
  QaPresentationReceiptV17,
} from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32, decodeUint8 } from "./qa-capture-bytes.js";
import { analyzePostTraaParticleResidual } from "./temporal-metrics/spray.js";

const VIEWPORT = { width: 320, height: 180 } as const;
const SEED = 0x4000_0000;
const ACTIVE_FRAME_COUNT = 3;
const PRIME_TICKS = 24;
const EXPIRE_TICKS = 48;
const FAR_ANCHOR = {
  x: 50_000,
  z: 50_000,
} as const satisfies InteractionAnchor;
// Hero sprayAmount is consumed by the post-TRAA secondary writer, while zero
// amplitude and foam leave the Prepared Surface identical between A and B.
const HERO_SPRAY = Object.freeze({
  id: 0x4000_0028,
  position: [0, 0, -6] as const,
  direction: [1, 0, 0] as const,
  radiusMetres: 10,
  sprayAmount: 1,
  lifetimeTicks: EXPIRE_TICKS,
  priority: 255,
});
const CAMERA = {
  projection: "perspective" as const,
  position: [0, 10, 18] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 50,
  near: 0.1,
  far: 100,
} satisfies QaCameraV1;
const SPRAY_CONTROLS = {
  ...createWaterPreset("swell").artisticControls,
} satisfies ArtisticControls;
const CONTRIBUTION_THRESHOLD = 1 / 1_024;
const ALLOWED_SUPPORT_DILATION_PIXELS = 2;
const FINAL_RESIDUAL_LSB = 1;

type SecondaryParticlesReceipt = QaPresentationReceiptV17["secondaryParticles"];
type SecondaryParticleReceipt = SecondaryParticlesReceipt["consumers"][number];

interface CaptureShape {
  readonly name: QaCaptureV17["name"];
  readonly width: number;
  readonly height: number;
  readonly origin: QaCaptureV17["origin"];
  readonly format: QaCaptureV17["format"];
  readonly elementType: QaCaptureV17["elementType"];
  readonly components: QaCaptureV17["components"];
  readonly dataEncoding: QaCaptureV17["dataEncoding"];
  readonly byteOrder: QaCaptureV17["byteOrder"];
}

interface SprayRouteFrame {
  readonly tick: number;
  readonly temporalResetFrame: boolean;
  readonly current: string;
  readonly depth: string;
  readonly motion: string;
  readonly final: string;
  readonly contribution: string;
  readonly overdraw: string;
  readonly contributionShape: CaptureShape;
  readonly overdrawShape: CaptureShape;
  readonly secondaryParticles: SecondaryParticlesReceipt;
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

async function captureSprayRoute(
  page: Page,
  active: boolean,
): Promise<readonly SprayRouteFrame[]> {
  return page.evaluate(
    async ({
      activeFrameCount,
      activeRoute,
      camera,
      controls,
      expireTicks,
      farAnchor,
      hero,
      primeTicks,
      seed,
    }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarness | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const frames: SprayRouteFrame[] = [];
      await harness.reset({ seed });
      await harness.updateArtisticControls(controls, {
        transition: "continuous",
      });
      await harness.setCamera(camera, { transition: "continuous" });
      await harness.updateInteractionAnchor(farAnchor);
      await harness.submitDisturbances({
        kind: "hero-breaker",
        count: 1,
        ids: Uint32Array.of(hero.id),
        positions: Float32Array.from(hero.position),
        directions: Float32Array.from(hero.direction),
        radii: Float32Array.of(hero.radiusMetres),
        amplitudes: Float32Array.of(0),
        foamAmounts: Float32Array.of(0),
        sprayAmounts: Float32Array.of(activeRoute ? hero.sprayAmount : 0),
        lifetimeTicks: Uint16Array.of(hero.lifetimeTicks),
        priorities: Uint8Array.of(hero.priority),
      });

      for (let index = 0; index < activeFrameCount; index += 1) {
        await harness.advanceTicks(index === 0 ? primeTicks : 1);
        frames.push(await captureFrame(harness));
      }

      await harness.advanceTicks(expireTicks);
      frames.push(await captureFrame(harness));
      return frames;

      async function captureFrame(qa: QaHarness): Promise<SprayRouteFrame> {
        const presentation = await qa.present();
        const [current, depth, motion, final, contribution, overdraw] =
          await Promise.all([
            qa.capture("current-color"),
            qa.capture("depth"),
            qa.capture("motion-vector"),
            qa.capture("final-color"),
            qa.capture("secondary-particle-contribution"),
            qa.capture("secondary-particle-overdraw"),
          ]);
        return {
          tick: presentation.tick,
          temporalResetFrame: presentation.temporal.resetFrame,
          current: current.data,
          depth: depth.data,
          motion: motion.data,
          final: final.data,
          contribution: contribution.data,
          overdraw: overdraw.data,
          contributionShape: captureShape(contribution),
          overdrawShape: captureShape(overdraw),
          secondaryParticles: presentation.secondaryParticles,
        };
      }

      function captureShape(capture: QaCaptureV17): CaptureShape {
        return {
          name: capture.name,
          width: capture.width,
          height: capture.height,
          origin: capture.origin,
          format: capture.format,
          elementType: capture.elementType,
          components: capture.components,
          dataEncoding: capture.dataEncoding,
          byteOrder: capture.byteOrder,
        };
      }
    },
    {
      activeFrameCount: ACTIVE_FRAME_COUNT,
      activeRoute: active,
      camera: CAMERA,
      controls: SPRAY_CONTROLS,
      expireTicks: EXPIRE_TICKS,
      farAnchor: FAR_ANCHOR,
      hero: HERO_SPRAY,
      primeTicks: PRIME_TICKS,
      seed: SEED,
    },
  );
}

function decodeContribution(frame: SprayRouteFrame): Float32Array {
  return Float32Array.from(decodeFloat32(frame.contribution));
}

function decodeOverdraw(frame: SprayRouteFrame): Float32Array {
  return Float32Array.from(decodeFloat32(frame.overdraw));
}

function isZero(values: Float32Array): boolean {
  return values.every((value) => value === 0);
}

function maxRgbDifference(left: Uint8Array, right: Uint8Array): number {
  let maximum = 0;
  for (let index = 0; index < left.length; index += 4) {
    maximum = Math.max(
      maximum,
      Math.abs((left[index] ?? 0) - (right[index] ?? 0)),
      Math.abs((left[index + 1] ?? 0) - (right[index + 1] ?? 0)),
      Math.abs((left[index + 2] ?? 0) - (right[index + 2] ?? 0)),
    );
  }
  return maximum;
}

function maxScalarDifference(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
): number {
  expect(left.length, "maxScalarDifference requires equal lengths").toBe(
    right.length,
  );
  let maximum = 0;
  for (let index = 0; index < left.length; index += 1) {
    maximum = Math.max(
      maximum,
      Math.abs((left[index] ?? 0) - (right[index] ?? 0)),
    );
  }
  return maximum;
}

function requiredFrame<T>(
  frames: readonly T[],
  index: number,
  label: string,
): T {
  const frame = frames[index];
  if (frame === undefined) {
    throw new Error(`${label} frame ${String(index + 1)} is unavailable.`);
  }
  return frame;
}

function expectReceiptConservation(
  receipt: SecondaryParticlesReceipt | SecondaryParticleReceipt,
): void {
  expect(receipt.requested).toBe(
    receipt.retained +
      receipt.thinned +
      receipt.invisibleOrOccluded +
      receipt.reentryCooldown +
      receipt.lifecycleReentryForbidden,
  );
  expect(receipt.retained).toBe(
    receipt.retainedByFloor +
      receipt.retainedByGlobalCompetition +
      receipt.retainedIncumbents,
  );
  expect(receipt.dropReasons).toEqual({
    invisibleOrOccluded: receipt.invisibleOrOccluded,
    globalContributionPressure: receipt.thinned,
    reentryCooldown: receipt.reentryCooldown,
    lifecycleReentryForbidden: receipt.lifecycleReentryForbidden,
  });
  const visible =
    receipt.retained +
    receipt.thinned +
    receipt.reentryCooldown +
    receipt.lifecycleReentryForbidden;
  if (visible === 0) {
    expect(receipt.contributionMinimumQ16).toBeNull();
    expect(receipt.contributionMaximumQ16).toBeNull();
  } else {
    expect(receipt.contributionMinimumQ16).toBeGreaterThanOrEqual(0);
    expect(receipt.contributionMaximumQ16).toBeLessThanOrEqual(0xffff);
    expect(receipt.contributionMinimumQ16).toBeLessThanOrEqual(
      receipt.contributionMaximumQ16 ?? -1,
    );
  }
}

function expectGlobalReceiptAggregates(
  receipt: SecondaryParticlesReceipt,
): void {
  for (const field of [
    "requested",
    "retained",
    "thinned",
    "invisibleOrOccluded",
    "reentryCooldown",
    "lifecycleReentryForbidden",
    "retainedByFloor",
    "retainedByGlobalCompetition",
    "retainedIncumbents",
    "requestedAboveSoftCeiling",
  ] as const) {
    expect(receipt[field], `global ${field}`).toBe(
      receipt.consumers.reduce((total, consumer) => total + consumer[field], 0),
    );
  }
  expect(receipt.maximumCandidateCount).toBe(
    receipt.consumers.reduce(
      (total, consumer) => total + consumer.maximumRequestCount,
      0,
    ),
  );
  const visibleConsumers = receipt.consumers.filter(
    (consumer) => consumer.contributionMinimumQ16 !== null,
  );
  expect(receipt.contributionMinimumQ16).toBe(
    visibleConsumers.length === 0
      ? null
      : Math.min(
          ...visibleConsumers.map(
            (consumer) => consumer.contributionMinimumQ16 ?? 0,
          ),
        ),
  );
  expect(receipt.contributionMaximumQ16).toBe(
    visibleConsumers.length === 0
      ? null
      : Math.max(
          ...visibleConsumers.map(
            (consumer) => consumer.contributionMaximumQ16 ?? 0,
          ),
        ),
  );
}

test.describe.configure({ mode: "serial" });

test("composites moving spray after TRAA without persistent residue and exposes its receipts", async ({
  page,
}) => {
  test.slow();
  expect(Object.keys(SPRAY_CONTROLS)).toHaveLength(20);
  await openQaStage(page);

  const active = await captureSprayRoute(page, true);
  const off = await captureSprayRoute(page, false);
  const replay = await captureSprayRoute(page, true);

  expect(active).toHaveLength(ACTIVE_FRAME_COUNT + 1);
  expect(active.map(({ tick }) => tick)).toEqual(off.map(({ tick }) => tick));
  expect(
    replay.map(({ final, contribution, overdraw, secondaryParticles }) => ({
      final,
      contribution,
      overdraw,
      secondaryParticles,
    })),
  ).toEqual(
    active.map(({ final, contribution, overdraw, secondaryParticles }) => ({
      final,
      contribution,
      overdraw,
      secondaryParticles,
    })),
  );

  const activeContribution = active.map(decodeContribution);
  const activeOverdraw = active.map(decodeOverdraw);
  const offContribution = off.map(decodeContribution);
  const offOverdraw = off.map(decodeOverdraw);
  for (let index = 0; index < active.length; index += 1) {
    const activeFrame = requiredFrame(active, index, "active");
    const offFrame = requiredFrame(off, index, "off");
    expect(
      maxRgbDifference(
        decodeUint8(activeFrame.current),
        decodeUint8(offFrame.current),
      ),
      `pre-TRAA current-color frame ${String(index + 1)}`,
    ).toBe(0);
    expect(
      maxScalarDifference(
        decodeFloat32(activeFrame.depth),
        decodeFloat32(offFrame.depth),
      ),
      `pre-TRAA depth frame ${String(index + 1)}`,
    ).toBe(0);
    expect(activeFrame.temporalResetFrame).toBe(offFrame.temporalResetFrame);
    // Reset frames feed the TRAA node an explicit rejection velocity, so the
    // raw motion AOV is only a causal input on non-reset frames.
    if (!activeFrame.temporalResetFrame) {
      expect(
        maxScalarDifference(
          decodeFloat32(activeFrame.motion),
          decodeFloat32(offFrame.motion),
        ),
        `pre-TRAA motion frame ${String(index + 1)}`,
      ).toBe(0);
    }
  }
  for (let index = 0; index < ACTIVE_FRAME_COUNT; index += 1) {
    const activeFrame = requiredFrame(active, index, "active");
    const offFrame = requiredFrame(off, index, "off");
    const contribution = requiredFrame(
      activeContribution,
      index,
      "active contribution",
    );
    const overdraw = requiredFrame(activeOverdraw, index, "active overdraw");
    expect(
      contribution.some((value) => value >= CONTRIBUTION_THRESHOLD),
      `active contribution frame ${String(index + 1)}`,
    ).toBe(true);
    expect(
      overdraw.some((value) => value > 0),
      `active overdraw frame ${String(index + 1)}`,
    ).toBe(true);
    expect(
      maxRgbDifference(
        decodeUint8(activeFrame.final),
        decodeUint8(offFrame.final),
      ),
      `active final-color support frame ${String(index + 1)}`,
    ).toBeGreaterThan(FINAL_RESIDUAL_LSB);
  }
  expect(offContribution.every(isZero)).toBe(true);
  expect(offOverdraw.every(isZero)).toBe(true);
  expect(
    isZero(
      requiredFrame(
        activeContribution,
        ACTIVE_FRAME_COUNT,
        "expired contribution",
      ),
    ),
  ).toBe(true);
  expect(
    isZero(
      requiredFrame(activeOverdraw, ACTIVE_FRAME_COUNT, "expired overdraw"),
    ),
  ).toBe(true);

  const report = analyzePostTraaParticleResidual({
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    onFinal: active.map(({ final }) => decodeUint8(final)),
    offFinal: off.map(({ final }) => decodeUint8(final)),
    contribution: activeContribution,
    contributionThreshold: CONTRIBUTION_THRESHOLD,
    allowedDilatePixels: ALLOWED_SUPPORT_DILATION_PIXELS,
    residualLsb: FINAL_RESIDUAL_LSB,
  });
  expect(report.activeFrames, report.lines.join("\n")).toBe(ACTIVE_FRAME_COUNT);
  expect(report.outsideHotPixels, report.lines.join("\n")).toBe(0);
  expect(
    report.maxOutsideResidual,
    report.lines.join("\n"),
  ).toBeLessThanOrEqual(FINAL_RESIDUAL_LSB);
  expect(
    report.expiredResidualMax,
    report.lines.join("\n"),
  ).toBeLessThanOrEqual(FINAL_RESIDUAL_LSB);

  const firstActive = requiredFrame(active, 0, "active");
  expect(firstActive.contributionShape).toEqual({
    name: "secondary-particle-contribution",
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    origin: "top-left",
    format: "r32float-secondary-particle-contribution",
    elementType: "float32",
    components: 1,
    dataEncoding: "base64",
    byteOrder: "little-endian",
  });
  expect(firstActive.overdrawShape).toEqual({
    name: "secondary-particle-overdraw",
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    origin: "top-left",
    format: "r32float-secondary-particle-overdraw",
    elementType: "float32",
    components: 1,
    dataEncoding: "base64",
    byteOrder: "little-endian",
  });
  expect(activeContribution[0]).toHaveLength(VIEWPORT.width * VIEWPORT.height);
  expect(activeOverdraw[0]).toHaveLength(VIEWPORT.width * VIEWPORT.height);

  const diagnostics = firstActive.secondaryParticles;
  expect(diagnostics).toMatchObject({
    capacity: 131_072,
    maximumCandidateCount: 147_456,
  });
  expect(diagnostics.consumers).toMatchObject([
    {
      consumerId: "spray-droplet-mist",
      maximumRequestCount: 65_536,
      softRequestCeiling: 32_768,
      minimumRetainedSlots: 2_048,
      pressureReentryPolicy: "after-shared-cooldown",
    },
    {
      consumerId: "underwater-suspended-particles",
      maximumRequestCount: 49_152,
      softRequestCeiling: 24_576,
      minimumRetainedSlots: 2_048,
      pressureReentryPolicy: "after-shared-cooldown",
    },
    {
      consumerId: "subsurface-foam-bubble-cloud",
      maximumRequestCount: 24_576,
      softRequestCeiling: 12_288,
      minimumRetainedSlots: 1_024,
      pressureReentryPolicy: "after-shared-cooldown",
    },
    {
      consumerId: "rising-bubbles",
      maximumRequestCount: 8_192,
      softRequestCeiling: 4_096,
      minimumRetainedSlots: 256,
      pressureReentryPolicy: "forbidden-until-absent",
    },
  ]);
  expectReceiptConservation(diagnostics);
  expectGlobalReceiptAggregates(diagnostics);
  for (const consumer of diagnostics.consumers) {
    expectReceiptConservation(consumer);
  }
  const spray = diagnostics.consumers.find(
    ({ consumerId }) => consumerId === "spray-droplet-mist",
  );
  expect(spray?.requested).toBeGreaterThan(0);
  // Every declared consumer submits its base candidates. Isolation here means
  // the off-camera consumers are wholly invisible and retain nothing.
  for (const consumer of diagnostics.consumers.filter(
    ({ consumerId }) => consumerId !== "spray-droplet-mist",
  )) {
    expect(consumer.retained, consumer.consumerId).toBe(0);
    expect(consumer.invisibleOrOccluded, consumer.consumerId).toBe(
      consumer.requested,
    );
    expect(consumer.contributionMinimumQ16, consumer.consumerId).toBeNull();
    expect(consumer.contributionMaximumQ16, consumer.consumerId).toBeNull();
  }
});
