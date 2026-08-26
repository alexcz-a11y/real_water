import { expect, test, type Page } from "@playwright/test";
import {
  createStormFrontEnvironmentPreset,
  createWaterPreset,
  type HostEnvironmentSnapshot,
} from "real-water";
import type { QaCameraV1, QaHarness } from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import { decodeFloat32, decodeUint8 } from "./qa-capture-bytes.js";

const VIEWPORT = { width: 320, height: 180 } as const;
const SEED = 0x3019_0001;
const TARGET_TICK = 90;
const HERO_ACTIVE_AGE_TICKS = 12;
const HERO_ID = 0x3019_0018;
const HERO_POSITION = [8, 0, 22] as const;
const HERO_DIRECTION = [1, 0, 0] as const;
const HERO_RADIUS_METRES = 12;
const HERO_AMPLITUDE_METRES = 2.25;
const HERO_LIFETIME_TICKS = 180;
const HERO_PRIORITY = 255;
const CAMERA = Object.freeze({
  projection: "perspective",
  position: [0, 8, 0] as const,
  target: [24, 0, 65] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 50,
  near: 0.1,
  far: 2_000,
}) satisfies QaCameraV1;
const CONTROLS = createWaterPreset("storm").artisticControls;
const STORM_PRESET = createStormFrontEnvironmentPreset();
const CLEAR_WEATHER = Object.freeze({
  windDirectionX: STORM_PRESET.weather.windDirectionX,
  windDirectionZ: STORM_PRESET.weather.windDirectionZ,
  windStrength: 0,
  gustStrength: 0,
  rainIntensity: 0,
});
const CLEAR_ATMOSPHERE = Object.freeze({
  cloudCoverage: 0,
  cloudShadowStrength: 0,
  horizonHaze: 0,
  stormAerosolIntensity: 0,
  lightningIntensity: 0,
});
const DRY_ENVIRONMENT = Object.freeze({
  lighting: STORM_PRESET.lighting,
  weather: CLEAR_WEATHER,
  atmosphere: CLEAR_ATMOSPHERE,
}) satisfies HostEnvironmentSnapshot;
const RAIN_ENVIRONMENT = Object.freeze({
  lighting: STORM_PRESET.lighting,
  weather: STORM_PRESET.weather,
  atmosphere: CLEAR_ATMOSPHERE,
}) satisfies HostEnvironmentSnapshot;
const CLOUD_ENVIRONMENT = Object.freeze({
  lighting: STORM_PRESET.lighting,
  weather: CLEAR_WEATHER,
  atmosphere: Object.freeze({
    ...CLEAR_ATMOSPHERE,
    cloudCoverage: STORM_PRESET.atmosphere.cloudCoverage,
    cloudShadowStrength: STORM_PRESET.atmosphere.cloudShadowStrength,
  }),
}) satisfies HostEnvironmentSnapshot;
const STORM_ENVIRONMENT = Object.freeze({
  lighting: STORM_PRESET.lighting,
  weather: STORM_PRESET.weather,
  atmosphere: STORM_PRESET.atmosphere,
}) satisfies HostEnvironmentSnapshot;
const LIGHTNING_ENVIRONMENT = Object.freeze({
  ...STORM_ENVIRONMENT,
  atmosphere: Object.freeze({
    ...STORM_ENVIRONMENT.atmosphere,
    lightningIntensity: 1,
  }),
}) satisfies HostEnvironmentSnapshot;

const CAPTURE_NAMES = Object.freeze([
  "final-color",
  "normal",
  "foam-source-identity",
  "optical-glint",
  "optical-environment-reflection",
  "reflection-base-color",
  "ssr-composite-color",
  "secondary-particle-contribution",
  "secondary-particle-overdraw",
  "storm-rain-ripples",
  "storm-aerosol",
  "storm-cloud-shadow",
  "storm-lightning",
] as const);
const HERO_CAPTURE_NAME = "hero-breaker-foam" as const;

type PresentationReceipt = Awaited<ReturnType<QaHarness["present"]>>;
type CaptureReceipt = Awaited<ReturnType<QaHarness["capture"]>>;
type SecondaryParticlesReceipt = PresentationReceipt["secondaryParticles"];
type SecondaryParticleReceipt = SecondaryParticlesReceipt["consumers"][number];
type StormCaptureName = (typeof CAPTURE_NAMES)[number];
type CapturedData = Pick<
  CaptureReceipt,
  | "name"
  | "width"
  | "height"
  | "origin"
  | "format"
  | "elementType"
  | "components"
  | "dataEncoding"
  | "byteOrder"
  | "data"
>;
type StormCaptures = Readonly<Record<StormCaptureName, CapturedData>>;
type PresentationIdentity = Pick<
  PresentationReceipt,
  "tick" | "manifestHash" | "compileCount" | "probeCount" | "secondaryParticles"
>;

interface StormFrame {
  readonly presentation: PresentationIdentity;
  readonly captures: StormCaptures;
}

interface HeroWeatherFrame {
  readonly baseline: PresentationIdentity;
  readonly receipt: Awaited<ReturnType<QaHarness["submitDisturbances"]>> | null;
  readonly frame: StormFrame;
  readonly heroFoam: CapturedData;
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

test("runs and byte-replays the complete prepared Storm Front route", async ({
  page,
}) => {
  test.slow();
  await openQaStage(page);

  const result = await page.evaluate(
    async ({
      camera,
      captureNames,
      cloudEnvironment,
      controls,
      dryEnvironment,
      hero,
      heroActiveAgeTicks,
      heroCaptureName,
      lightningEnvironment,
      rainEnvironment,
      seed,
      stormEnvironment,
      targetTick,
    }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarness | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }

      const presentationIdentity = (
        presentation: PresentationReceipt,
      ): PresentationIdentity => ({
        tick: presentation.tick,
        manifestHash: presentation.manifestHash,
        compileCount: presentation.compileCount,
        probeCount: presentation.probeCount,
        secondaryParticles: presentation.secondaryParticles,
      });
      const capturedData = (capture: CaptureReceipt): CapturedData => ({
        name: capture.name,
        width: capture.width,
        height: capture.height,
        origin: capture.origin,
        format: capture.format,
        elementType: capture.elementType,
        components: capture.components,
        dataEncoding: capture.dataEncoding,
        byteOrder: capture.byteOrder,
        data: capture.data,
      });
      const captureFrame = async (): Promise<StormFrame> => {
        const presentation = await harness.present();
        const captures = await Promise.all(
          captureNames.map((name) => harness.capture(name)),
        );
        return {
          presentation: presentationIdentity(presentation),
          captures: Object.fromEntries(
            captures.map((capture) => [capture.name, capturedData(capture)]),
          ) as StormCaptures,
        };
      };
      const prepare = async (
        environment: HostEnvironmentSnapshot,
      ): Promise<void> => {
        await harness.reset({ seed });
        await harness.updateArtisticControls(controls, {
          transition: "continuous",
        });
        await harness.updateInteractionAnchor({
          x: hero.position[0],
          z: hero.position[2],
        });
        await harness.setCamera(camera, { transition: "continuous" });
        await harness.updateEnvironment(environment);
        await harness.advanceTicks(targetTick);
      };
      const captureIsolated = async (
        environment: HostEnvironmentSnapshot,
      ): Promise<StormFrame> => {
        await prepare(environment);
        return captureFrame();
      };
      const runRoute = async () => ({
        dry: await captureIsolated(dryEnvironment),
        rain: await captureIsolated(rainEnvironment),
        cloud: await captureIsolated(cloudEnvironment),
        storm: await captureIsolated(stormEnvironment),
        lightning: await captureIsolated(lightningEnvironment),
      });
      const heroBatch = {
        kind: "hero-breaker" as const,
        count: 1,
        ids: Uint32Array.of(hero.id),
        positions: Float32Array.from(hero.position),
        directions: Float32Array.from(hero.direction),
        radii: Float32Array.of(hero.radiusMetres),
        amplitudes: Float32Array.of(hero.amplitudeMetres),
        foamAmounts: Float32Array.of(1),
        sprayAmounts: Float32Array.of(1),
        lifetimeTicks: Uint16Array.of(hero.lifetimeTicks),
        priorities: Uint8Array.of(hero.priority),
      };
      const runHeroWeather = async (
        trigger: boolean,
      ): Promise<HeroWeatherFrame> => {
        await prepare(stormEnvironment);
        const baseline = presentationIdentity(await harness.present());
        const receipt = trigger
          ? await harness.submitDisturbances(heroBatch)
          : null;
        await harness.advanceTicks(heroActiveAgeTicks);
        const frame = await captureFrame();
        const heroFoam = capturedData(await harness.capture(heroCaptureName));
        return { baseline, receipt, frame, heroFoam };
      };

      return {
        first: await runRoute(),
        replay: await runRoute(),
        weatherOnly: await runHeroWeather(false),
        heroWeather: await runHeroWeather(true),
      };
    },
    {
      camera: CAMERA,
      captureNames: CAPTURE_NAMES,
      cloudEnvironment: CLOUD_ENVIRONMENT,
      controls: CONTROLS,
      dryEnvironment: DRY_ENVIRONMENT,
      hero: {
        id: HERO_ID,
        position: HERO_POSITION,
        direction: HERO_DIRECTION,
        radiusMetres: HERO_RADIUS_METRES,
        amplitudeMetres: HERO_AMPLITUDE_METRES,
        lifetimeTicks: HERO_LIFETIME_TICKS,
        priority: HERO_PRIORITY,
      },
      heroActiveAgeTicks: HERO_ACTIVE_AGE_TICKS,
      heroCaptureName: HERO_CAPTURE_NAME,
      lightningEnvironment: LIGHTNING_ENVIRONMENT,
      rainEnvironment: RAIN_ENVIRONMENT,
      seed: SEED,
      stormEnvironment: STORM_ENVIRONMENT,
      targetTick: TARGET_TICK,
    },
  );

  for (const frame of Object.values(result.first)) {
    expect(Object.keys(frame.captures)).toEqual(CAPTURE_NAMES);
    expect(frame.presentation.tick).toBe(TARGET_TICK);
    for (const capture of Object.values(frame.captures)) {
      expect(capture).toMatchObject({
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        origin: "top-left",
        dataEncoding: "base64",
      });
    }
  }

  for (const name of [
    "storm-rain-ripples",
    "storm-aerosol",
    "storm-cloud-shadow",
    "storm-lightning",
  ] as const) {
    expect(result.first.storm.captures[name]).toMatchObject({
      name,
      format: "r32float-storm-front",
      elementType: "float32",
      components: 1,
      byteOrder: "little-endian",
    });
  }

  expectAllZero(result.first.dry, [
    "storm-rain-ripples",
    "storm-aerosol",
    "storm-cloud-shadow",
    "storm-lightning",
  ]);
  expectPositive(result.first.rain, "storm-rain-ripples");
  expectAllZero(result.first.rain, [
    "storm-aerosol",
    "storm-cloud-shadow",
    "storm-lightning",
  ]);
  expectPositive(result.first.cloud, "storm-cloud-shadow");
  expectAllZero(result.first.cloud, [
    "storm-rain-ripples",
    "storm-aerosol",
    "storm-lightning",
  ]);
  expectPositive(result.first.storm, "storm-rain-ripples");
  expectPositive(result.first.storm, "storm-aerosol");
  expectPositive(result.first.storm, "storm-cloud-shadow");
  expectAllZero(result.first.storm, ["storm-lightning"]);
  expectPositive(result.first.lightning, "storm-rain-ripples");
  expectPositive(result.first.lightning, "storm-aerosol");
  expectPositive(result.first.lightning, "storm-cloud-shadow");
  expectPositive(result.first.lightning, "storm-lightning");

  const rainNormal = captureFloats(result.first.rain, "normal");
  expect(rainNormal.every(Number.isFinite)).toBe(true);
  expect(
    rainNormal.some(
      (value, index) =>
        value !== captureFloats(result.first.dry, "normal")[index],
    ),
  ).toBe(true);
  const rainContribution = captureFloats(
    result.first.rain,
    "secondary-particle-contribution",
  );
  const rainOverdraw = captureFloats(
    result.first.rain,
    "secondary-particle-overdraw",
  );
  expect(rainContribution.some((value) => value > 0)).toBe(true);
  expect(rainOverdraw.some((value) => value > 0)).toBe(true);
  expect(
    result.first.rain.captures["secondary-particle-contribution"].data,
  ).not.toBe(result.first.dry.captures["secondary-particle-contribution"].data);
  expect(
    result.first.rain.captures["secondary-particle-overdraw"].data,
  ).not.toBe(result.first.dry.captures["secondary-particle-overdraw"].data);
  expect(sprayReceipt(result.first.rain).requested).toBeGreaterThan(
    sprayReceipt(result.first.dry).requested,
  );
  expect(
    sprayReceipt(result.first.rain).contributionMaximumQ16,
  ).toBeGreaterThan(0);

  expect(result.first.cloud.captures["foam-source-identity"].data).toBe(
    result.first.dry.captures["foam-source-identity"].data,
  );
  expect(expectChannelEnergy(result.first.cloud, "optical-glint")).toBeLessThan(
    expectChannelEnergy(result.first.dry, "optical-glint"),
  );
  expect(
    expectChannelEnergy(result.first.cloud, "optical-environment-reflection"),
  ).toBeLessThan(
    expectChannelEnergy(result.first.dry, "optical-environment-reflection"),
  );
  expect(
    expectChannelEnergy(result.first.cloud, "reflection-base-color"),
  ).toBeLessThan(
    expectChannelEnergy(result.first.dry, "reflection-base-color"),
  );
  expect(
    expectChannelEnergy(result.first.cloud, "ssr-composite-color"),
  ).toBeLessThan(expectChannelEnergy(result.first.dry, "ssr-composite-color"));
  expect(expectFinalColorEnergy(result.first.cloud)).toBeLessThan(
    expectFinalColorEnergy(result.first.dry),
  );
  const cloudFoamPixels = foamPixels(result.first.cloud);
  expect(cloudFoamPixels.length).toBeGreaterThan(0);
  expect(
    expectFinalColorEnergy(result.first.cloud, cloudFoamPixels),
  ).toBeLessThan(expectFinalColorEnergy(result.first.dry, cloudFoamPixels));

  expect(result.first.lightning.captures["foam-source-identity"].data).toBe(
    result.first.storm.captures["foam-source-identity"].data,
  );
  expect(
    expectChannelEnergy(result.first.lightning, "optical-glint"),
  ).toBeGreaterThan(expectChannelEnergy(result.first.storm, "optical-glint"));
  expect(
    expectChannelEnergy(
      result.first.lightning,
      "optical-environment-reflection",
    ),
  ).toBeGreaterThan(
    expectChannelEnergy(result.first.storm, "optical-environment-reflection"),
  );
  expect(
    expectChannelEnergy(result.first.lightning, "reflection-base-color"),
  ).toBeGreaterThan(
    expectChannelEnergy(result.first.storm, "reflection-base-color"),
  );
  expect(
    expectChannelEnergy(result.first.lightning, "ssr-composite-color"),
  ).toBeGreaterThan(
    expectChannelEnergy(result.first.storm, "ssr-composite-color"),
  );
  expect(expectFinalColorEnergy(result.first.lightning)).toBeGreaterThan(
    expectFinalColorEnergy(result.first.storm),
  );
  const lightningFoamPixels = foamPixels(result.first.lightning);
  expect(lightningFoamPixels.length).toBeGreaterThan(0);
  expect(
    expectFinalColorEnergy(result.first.lightning, lightningFoamPixels),
  ).toBeGreaterThan(
    expectFinalColorEnergy(result.first.storm, lightningFoamPixels),
  );

  expect(result.first.cloud.presentation).toMatchObject({
    manifestHash: result.first.dry.presentation.manifestHash,
    compileCount: result.first.dry.presentation.compileCount,
    probeCount: result.first.dry.presentation.probeCount,
  });
  expect(result.first.storm.presentation).toMatchObject({
    manifestHash: result.first.dry.presentation.manifestHash,
    compileCount: result.first.dry.presentation.compileCount,
    probeCount: result.first.dry.presentation.probeCount,
  });
  expect(result.first.lightning.presentation).toMatchObject({
    manifestHash: result.first.dry.presentation.manifestHash,
    compileCount: result.first.dry.presentation.compileCount,
    probeCount: result.first.dry.presentation.probeCount,
  });

  for (const name of ["dry", "rain", "cloud", "storm", "lightning"] as const) {
    expectFrameReplay(result.first[name], result.replay[name]);
  }

  expect(result.heroWeather.receipt).toEqual({
    tick: TARGET_TICK,
    acceptedDisturbanceIds: [HERO_ID],
    droppedDisturbanceIds: [],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 1,
  });
  expect(result.heroWeather.frame.presentation.tick).toBe(
    TARGET_TICK + HERO_ACTIVE_AGE_TICKS,
  );
  expect(result.heroWeather.frame.presentation).toMatchObject({
    manifestHash: result.heroWeather.baseline.manifestHash,
    compileCount: result.heroWeather.baseline.compileCount,
    probeCount: result.heroWeather.baseline.probeCount,
  });
  expectPositive(result.heroWeather.frame, "storm-rain-ripples");
  expectPositive(result.heroWeather.frame, "storm-aerosol");
  expectPositive(result.heroWeather.frame, "storm-cloud-shadow");
  expect(result.heroWeather.frame.captures["storm-rain-ripples"].data).toBe(
    result.weatherOnly.frame.captures["storm-rain-ripples"].data,
  );
  expect(result.heroWeather.frame.captures["storm-aerosol"].data).toBe(
    result.weatherOnly.frame.captures["storm-aerosol"].data,
  );
  const heroFoam = decodeFloat32(result.heroWeather.heroFoam.data);
  expect(heroFoam.some((value) => value > 0)).toBe(true);
  expect(result.heroWeather.heroFoam.data).not.toBe(
    result.weatherOnly.heroFoam.data,
  );
  expect(
    result.heroWeather.frame.captures["secondary-particle-contribution"].data,
  ).not.toBe(
    result.weatherOnly.frame.captures["secondary-particle-contribution"].data,
  );

  const sharedPool = result.heroWeather.frame.presentation.secondaryParticles;
  expectReceiptConservation(sharedPool);
  expectGlobalReceiptAggregates(sharedPool);
  for (const consumer of sharedPool.consumers) {
    expectReceiptConservation(consumer);
  }
});

function captureFloats(
  frame: StormFrame,
  name: StormCaptureName,
): readonly number[] {
  return decodeFloat32(frame.captures[name].data);
}

function expectAllZero(
  frame: StormFrame,
  names: readonly StormCaptureName[],
): void {
  for (const name of names) {
    const values = captureFloats(frame, name);
    expect(values.length).toBeGreaterThan(0);
    expect(
      values.every((value) => value === 0),
      name,
    ).toBe(true);
  }
}

function expectPositive(frame: StormFrame, name: StormCaptureName): void {
  const values = captureFloats(frame, name);
  expect(values.length).toBeGreaterThan(0);
  expect(values.every(Number.isFinite), name).toBe(true);
  expect(
    values.some((value) => value > 0),
    name,
  ).toBe(true);
}

function expectChannelEnergy(
  frame: StormFrame,
  name: StormCaptureName,
): number {
  const values = captureFloats(frame, name);
  expect(values.length).toBeGreaterThan(0);
  expect(values.every(Number.isFinite), name).toBe(true);
  return values.reduce((total, value) => total + Math.max(0, value), 0);
}

function foamPixels(frame: StormFrame): readonly number[] {
  const values = captureFloats(frame, "foam-source-identity");
  const pixels: number[] = [];
  for (let pixel = 0; pixel < VIEWPORT.width * VIEWPORT.height; pixel += 1) {
    if ((values[pixel * 4 + 3] ?? 0) > 0.01) {
      pixels.push(pixel);
    }
  }
  return pixels;
}

function expectFinalColorEnergy(
  frame: StormFrame,
  pixels?: readonly number[],
): number {
  const values = decodeUint8(frame.captures["final-color"].data);
  const selected =
    pixels ??
    Array.from(
      { length: VIEWPORT.width * VIEWPORT.height },
      (_, pixel) => pixel,
    );
  let total = 0;
  for (const pixel of selected) {
    const offset = pixel * 4;
    total +=
      (values[offset] ?? 0) * 0.2126 +
      (values[offset + 1] ?? 0) * 0.7152 +
      (values[offset + 2] ?? 0) * 0.0722;
  }
  return total;
}

function sprayReceipt(frame: StormFrame): SecondaryParticleReceipt {
  const receipt = frame.presentation.secondaryParticles.consumers.find(
    ({ consumerId }) => consumerId === "spray-droplet-mist",
  );
  if (receipt === undefined) {
    throw new Error("The shared pool omitted the spray-droplet-mist consumer.");
  }
  return receipt;
}

function expectFrameReplay(first: StormFrame, replay: StormFrame): void {
  expect(replay.presentation.tick).toBe(first.presentation.tick);
  expect(replay.presentation.manifestHash).toBe(
    first.presentation.manifestHash,
  );
  expect(replay.presentation.secondaryParticles).toEqual(
    first.presentation.secondaryParticles,
  );
  for (const name of CAPTURE_NAMES) {
    expect(replay.captures[name].data, name).toBe(first.captures[name].data);
  }
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
}
