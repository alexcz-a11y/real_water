import { expect, test, type Page } from "@playwright/test";
import type { ArtisticControls, HostEnvironmentState } from "real-water";
import type { QaCameraV1, QaHarnessV14 } from "../src/qa-harness.js";
import { REFERENCE_ENVIRONMENT_LIGHTING } from "../src/reference-optical-inputs.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";
import {
  decodeFloat32,
  decodeUint8,
  meanAbsDifference,
} from "./qa-capture-bytes.js";

const VIEWPORT = { width: 320, height: 180 } as const;
const SHALLOW_BOUNDS = { x0: 0.08, x1: 0.32, y0: 0.2, y1: 0.8 } as const;
const DEEP_BOUNDS = { x0: 0.68, x1: 0.92, y0: 0.2, y1: 0.8 } as const;
const SHADOW_BOUNDS = { x0: 0.35, x1: 0.65, y0: 0.15, y1: 0.85 } as const;

const UNDERWATER_DOWN_CAMERA = {
  projection: "perspective",
  position: [0, 12, -40],
  target: [0, 0, -40],
  up: [0, 0, -1],
  verticalFovDegrees: 40,
  near: 0.05,
  far: 100,
} as const satisfies QaCameraV1;

const FLAT_UNDERWATER_CONTROLS = {
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
  underwaterHaze: 1,
  underwaterTurbidity: 0.35,
  underwaterLightShafts: 0,
  underwaterColor: 1,
  underwaterExposure: 1,
} as const satisfies ArtisticControls;
const SHAFT_ENVIRONMENT = {
  ...REFERENCE_ENVIRONMENT_LIGHTING,
  sunDirectionX: 0,
  sunDirectionY: -1,
  sunDirectionZ: 0,
} as const satisfies HostEnvironmentState;
const ANGLED_SHAFT_ENVIRONMENT = {
  ...REFERENCE_ENVIRONMENT_LIGHTING,
  sunDirectionX: 0.45,
  sunDirectionY: -0.85,
  sunDirectionZ: 0.25,
} as const satisfies HostEnvironmentState;
const DARK_SHAFT_ENVIRONMENT = {
  ...SHAFT_ENVIRONMENT,
  sunIntensity: 0,
} as const satisfies HostEnvironmentState;

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

test("applies replayable hot haze by scene depth without re-preparing", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ camera, controls }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV14 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      const presentHaze = async (underwaterHaze: number) => {
        await harness.reset({ seed: 0x21_000_001 });
        await harness.setSeaLevel({ metres: 20 });
        await harness.updateArtisticControls(
          { ...controls, underwaterHaze },
          { transition: "continuous" },
        );
        await harness.setCamera(camera, { transition: "camera-cut" });
        let presentation = await harness.present();
        for (let frame = 0; frame < 8; frame += 1) {
          presentation = await harness.present();
        }
        const [color, depth, normal, transmittance, scattering] =
          await Promise.all([
            harness.capture("final-color"),
            harness.capture("depth"),
            harness.capture("normal"),
            harness.capture("underwater-transmittance"),
            harness.capture("underwater-scattering"),
          ]);
        return {
          color: color.data,
          depth: depth.data,
          normal: normal.data,
          transmittance: transmittance.data,
          scattering: scattering.data,
          width: color.width,
          height: color.height,
          presentation,
        };
      };

      const hazeOff = await presentHaze(0);
      const hazeOn = await presentHaze(2);
      const replay = await presentHaze(2);
      return { hazeOff, hazeOn, replay };
    },
    { camera: UNDERWATER_DOWN_CAMERA, controls: FLAT_UNDERWATER_CONTROLS },
  );

  expect(result.hazeOff.presentation.waterline.classification).toBe("below");
  expect(result.hazeOn.presentation.waterline.submersion).toBeGreaterThan(0.99);
  expect(result.hazeOn.presentation.manifestHash).toBe(
    result.hazeOff.presentation.manifestHash,
  );
  expect(result.hazeOn.presentation.compileCount).toBe(
    result.hazeOff.presentation.compileCount,
  );
  expect(result.hazeOn.presentation.prewarm.progress).toEqual(
    result.hazeOff.presentation.prewarm.progress,
  );
  expect(result.hazeOn.depth).toBe(result.hazeOff.depth);
  expect(result.hazeOn.normal).toBe(result.hazeOff.normal);
  expect(result.replay.color).toBe(result.hazeOn.color);
  expect(result.replay.transmittance).toBe(result.hazeOn.transmittance);
  expect(result.replay.scattering).toBe(result.hazeOn.scattering);

  const off = decodeUint8(result.hazeOff.color);
  const on = decodeUint8(result.hazeOn.color);
  const shallowDelta = meanAbsDifference(
    regionValues(
      off,
      result.hazeOff.width,
      result.hazeOff.height,
      SHALLOW_BOUNDS,
      4,
    ),
    regionValues(
      on,
      result.hazeOn.width,
      result.hazeOn.height,
      SHALLOW_BOUNDS,
      4,
    ),
  );
  const deepDelta = meanAbsDifference(
    regionValues(
      off,
      result.hazeOff.width,
      result.hazeOff.height,
      DEEP_BOUNDS,
      4,
    ),
    regionValues(on, result.hazeOn.width, result.hazeOn.height, DEEP_BOUNDS, 4),
  );
  expect(deepDelta).toBeGreaterThan(shallowDelta + 2);
  expect(deepDelta).toBeGreaterThan(5);

  const offTransmittance = decodeFloat32(result.hazeOff.transmittance);
  const onTransmittance = decodeFloat32(result.hazeOn.transmittance);
  const offScattering = decodeFloat32(result.hazeOff.scattering);
  const onScattering = decodeFloat32(result.hazeOn.scattering);
  expect(
    mean(
      regionValues(
        offTransmittance,
        result.hazeOff.width,
        result.hazeOff.height,
        DEEP_BOUNDS,
      ),
    ),
  ).toBeGreaterThan(
    mean(
      regionValues(
        onTransmittance,
        result.hazeOn.width,
        result.hazeOn.height,
        DEEP_BOUNDS,
      ),
    ) + 0.05,
  );
  expect(
    mean(
      regionValues(
        onScattering,
        result.hazeOn.width,
        result.hazeOn.height,
        DEEP_BOUNDS,
      ),
    ),
  ).toBeGreaterThan(
    mean(
      regionValues(
        offScattering,
        result.hazeOff.width,
        result.hazeOff.height,
        DEEP_BOUNDS,
      ),
    ) + 0.2,
  );

  const depth = decodeFloat32(result.hazeOn.depth);
  expect(
    mean(
      regionValues(
        depth,
        result.hazeOn.width,
        result.hazeOn.height,
        SHALLOW_BOUNDS,
      ),
    ),
  ).toBeGreaterThan(10);
  expect(
    mean(
      regionValues(
        depth,
        result.hazeOn.width,
        result.hazeOn.height,
        SHALLOW_BOUNDS,
      ),
    ),
  ).toBeLessThan(16);
  expect(
    mean(
      regionValues(
        depth,
        result.hazeOn.width,
        result.hazeOn.height,
        DEEP_BOUNDS,
      ),
    ),
  ).toBeGreaterThan(28);
});

test("art-directs turbidity, shafts, color, and exposure as continuous hot controls", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ camera, controls, shaftEnvironment, angledEnvironment, dark }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV14 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x21_000_002 });
      await harness.setSeaLevel({ metres: 20 });
      await harness.setCamera(camera, { transition: "camera-cut" });
      await harness.updateEnvironmentLighting(shaftEnvironment);

      const captureControls = async (
        next: ArtisticControls,
        lighting: HostEnvironmentState = shaftEnvironment,
      ) => {
        await harness.updateEnvironmentLighting(lighting);
        const update = await harness.updateArtisticControls(next, {
          transition: "continuous",
        });
        const presentation = await harness.present();
        const [
          color,
          depth,
          normal,
          transmittance,
          scattering,
          shafts,
          shadow,
        ] = await Promise.all([
          harness.capture("current-color"),
          harness.capture("depth"),
          harness.capture("normal"),
          harness.capture("underwater-transmittance"),
          harness.capture("underwater-scattering"),
          harness.capture("underwater-light-shafts"),
          harness.capture("underwater-shadow"),
        ]);
        return {
          update,
          presentation,
          color: color.data,
          depth: depth.data,
          normal: normal.data,
          transmittance: transmittance.data,
          scattering: scattering.data,
          shafts: shafts.data,
          shadow: shadow.data,
          width: color.width,
          height: color.height,
        };
      };

      const baseline = await captureControls(controls);
      const turbidityOff = await captureControls({
        ...controls,
        underwaterTurbidity: 0,
      });
      const turbidityOn = await captureControls({
        ...controls,
        underwaterTurbidity: 2,
      });
      const shaftsOff = await captureControls({
        ...controls,
        underwaterLightShafts: 0,
      });
      const shaftsOn = await captureControls({
        ...controls,
        underwaterLightShafts: 2,
      });
      const shaftsDark = await captureControls(
        { ...controls, underwaterLightShafts: 2 },
        dark,
      );
      const shadowed = await captureControls(
        { ...controls, underwaterLightShafts: 2 },
        angledEnvironment,
      );
      const colorOff = await captureControls({
        ...controls,
        underwaterColor: 0,
      });
      const colorOn = await captureControls({
        ...controls,
        underwaterColor: 2,
      });
      const exposureOff = await captureControls({
        ...controls,
        underwaterExposure: 0,
      });
      const exposureOn = await captureControls({
        ...controls,
        underwaterExposure: 2,
      });
      return {
        baseline,
        turbidityOff,
        turbidityOn,
        shaftsOff,
        shaftsOn,
        shaftsDark,
        shadowed,
        colorOff,
        colorOn,
        exposureOff,
        exposureOn,
      };
    },
    {
      camera: UNDERWATER_DOWN_CAMERA,
      controls: FLAT_UNDERWATER_CONTROLS,
      shaftEnvironment: SHAFT_ENVIRONMENT,
      angledEnvironment: ANGLED_SHAFT_ENVIRONMENT,
      dark: DARK_SHAFT_ENVIRONMENT,
    },
  );

  const variants = Object.values(result);
  for (const variant of variants) {
    expect(variant.presentation.manifestHash).toBe(
      result.baseline.presentation.manifestHash,
    );
    expect(variant.presentation.compileCount).toBe(
      result.baseline.presentation.compileCount,
    );
    expect(variant.presentation.prewarm.progress).toEqual(
      result.baseline.presentation.prewarm.progress,
    );
    const depth = decodeFloat32(variant.depth);
    const shallowDepth = mean(
      regionValues(depth, variant.width, variant.height, SHALLOW_BOUNDS),
    );
    const deepDepth = mean(
      regionValues(depth, variant.width, variant.height, DEEP_BOUNDS),
    );
    expect(shallowDepth).toBeGreaterThan(10);
    expect(shallowDepth).toBeLessThan(16);
    expect(deepDepth).toBeGreaterThan(28);
    expect(deepDepth).toBeLessThan(36);
    expect(
      decodeFloat32(variant.normal).every(
        (value) => Number.isFinite(value) && Math.abs(value) <= 1.001,
      ),
    ).toBe(true);
  }
  for (const variant of variants.slice(1)) {
    expect(variant.presentation.temporal.resetReason).toBeNull();
  }

  const deepScalar = (data: string, variant = result.baseline) =>
    mean(
      regionValues(
        decodeFloat32(data),
        variant.width,
        variant.height,
        DEEP_BOUNDS,
      ),
    );
  expect(deepScalar(result.turbidityOff.transmittance)).toBeGreaterThan(
    deepScalar(result.turbidityOn.transmittance) + 0.2,
  );
  expect(deepScalar(result.turbidityOn.scattering)).toBeGreaterThan(
    deepScalar(result.turbidityOff.scattering) + 0.2,
  );
  const deepShafts = (data: string, variant = result.baseline) =>
    regionValues(
      decodeFloat32(data),
      variant.width,
      variant.height,
      DEEP_BOUNDS,
    );
  expect(Math.max(...deepShafts(result.shaftsOff.shafts))).toBeLessThan(1e-5);
  expect(Math.max(...deepShafts(result.shaftsOn.shafts))).toBeGreaterThan(0.05);
  expect(mean(deepShafts(result.shaftsOn.shafts))).toBeGreaterThan(0.002);
  expect(Math.max(...deepShafts(result.shaftsDark.shafts))).toBeLessThan(1e-5);
  const shadowRegion = regionValues(
    decodeFloat32(result.shadowed.shadow),
    result.shadowed.width,
    result.shadowed.height,
    SHADOW_BOUNDS,
  );
  expect(Math.max(...shadowRegion)).toBeGreaterThan(0.005);
  expect(mean(shadowRegion)).toBeGreaterThan(0.0001);
  expect(
    meanAbsDifference(
      regionValues(
        decodeUint8(result.colorOff.color),
        result.colorOff.width,
        result.colorOff.height,
        DEEP_BOUNDS,
        4,
      ),
      regionValues(
        decodeUint8(result.colorOn.color),
        result.colorOn.width,
        result.colorOn.height,
        DEEP_BOUNDS,
        4,
      ),
    ),
  ).toBeGreaterThan(3);
  const exposureOffRegion = regionValues(
    decodeUint8(result.exposureOff.color),
    result.exposureOff.width,
    result.exposureOff.height,
    DEEP_BOUNDS,
    4,
  );
  const exposureOnRegion = regionValues(
    decodeUint8(result.exposureOn.color),
    result.exposureOn.width,
    result.exposureOn.height,
    DEEP_BOUNDS,
    4,
  );
  expect(meanRgb(exposureOnRegion)).toBeGreaterThan(
    meanRgb(exposureOffRegion) + 12,
  );
  expect(meanRgb(exposureOffRegion)).toBeGreaterThan(5);
  expect(meanRgb(exposureOnRegion)).toBeLessThan(245);
});

test("uses the same Environment Adapter above and below while ignoring scene lighting decoys", async ({
  page,
}) => {
  await openQaStage(page);
  const result = await page.evaluate(
    async ({ camera, controls, lit, dark }) => {
      const harness = window.__REAL_WATER_QA__ as QaHarnessV14 | undefined;
      if (harness === undefined) {
        throw new Error("QA Harness is unavailable.");
      }
      await harness.reset({ seed: 0x21_000_003 });
      await harness.updateArtisticControls(
        { ...controls, underwaterLightShafts: 2 },
        { transition: "continuous" },
      );
      await harness.setCamera(camera, { transition: "camera-cut" });

      const presentCapture = async (
        seaLevelMetres: number,
        lighting: HostEnvironmentState,
        name: "optical-scattering" | "underwater-light-shafts",
      ) => {
        await harness.setSeaLevel({ metres: seaLevelMetres });
        const updated = await harness.updateEnvironmentLighting(lighting);
        const presentation = await harness.present();
        const capture = await harness.capture(name);
        return {
          updated,
          presentation,
          data: capture.data,
          width: capture.width,
          height: capture.height,
        };
      };

      await harness.setHostSceneLightingDecoy(false);
      const aboveLit = await presentCapture(0, lit, "optical-scattering");
      const aboveDark = await presentCapture(0, dark, "optical-scattering");
      const belowLit = await presentCapture(20, lit, "underwater-light-shafts");
      const belowDark = await presentCapture(
        20,
        dark,
        "underwater-light-shafts",
      );
      const controlRevision = belowDark.presentation.controlRevision;

      await harness.setHostSceneLightingDecoy(false);
      const aboveBaseline = await presentCapture(0, lit, "optical-scattering");
      await harness.setHostSceneLightingDecoy(true);
      const aboveDecoy = await presentCapture(0, lit, "optical-scattering");
      const belowDecoy = await presentCapture(
        20,
        lit,
        "underwater-light-shafts",
      );
      await harness.setHostSceneLightingDecoy(false);
      const belowCleared = await presentCapture(
        20,
        lit,
        "underwater-light-shafts",
      );
      return {
        aboveLit,
        aboveDark,
        belowLit,
        belowDark,
        aboveBaseline,
        aboveDecoy,
        belowDecoy,
        belowCleared,
        controlRevision,
      };
    },
    {
      camera: UNDERWATER_DOWN_CAMERA,
      controls: FLAT_UNDERWATER_CONTROLS,
      lit: SHAFT_ENVIRONMENT,
      dark: DARK_SHAFT_ENVIRONMENT,
    },
  );

  expect(result.aboveLit.data).not.toBe(result.aboveDark.data);
  expect(result.belowLit.data).not.toBe(result.belowDark.data);
  const belowLitRegion = regionValues(
    decodeFloat32(result.belowLit.data),
    result.belowLit.width,
    result.belowLit.height,
    DEEP_BOUNDS,
  );
  const belowDarkRegion = regionValues(
    decodeFloat32(result.belowDark.data),
    result.belowDark.width,
    result.belowDark.height,
    DEEP_BOUNDS,
  );
  expect(Math.max(...belowLitRegion)).toBeGreaterThan(0.05);
  expect(mean(belowLitRegion)).toBeGreaterThan(0.002);
  expect(Math.max(...belowDarkRegion)).toBeLessThan(1e-5);
  expect(result.aboveDecoy.data).toBe(result.aboveBaseline.data);
  expect(result.belowDecoy.data).toBe(result.belowCleared.data);
  for (const sample of Object.values(result).filter(
    (value): value is typeof result.aboveLit =>
      typeof value === "object" && value !== null && "presentation" in value,
  )) {
    expect(sample.presentation.manifestHash).toBe(
      result.aboveLit.presentation.manifestHash,
    );
    expect(sample.presentation.compileCount).toBe(
      result.aboveLit.presentation.compileCount,
    );
    expect(sample.presentation.controlRevision).toBe(result.controlRevision);
  }
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

function meanRgb(rgba: readonly number[]): number {
  let total = 0;
  let samples = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    total +=
      (rgba[index] ?? 0) + (rgba[index + 1] ?? 0) + (rgba[index + 2] ?? 0);
    samples += 3;
  }
  return samples === 0 ? 0 : total / samples;
}
