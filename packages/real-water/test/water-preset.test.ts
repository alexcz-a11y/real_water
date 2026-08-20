import { describe, expect, it } from "vitest";
import {
  createMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createStaticHostSimulationAdapter,
  createWaterPreset,
  prepareRealWater,
} from "../src/index.js";
import { createTestEnvironmentAdapter } from "./test-host-environment.js";
import {
  WATER_PRESET_SCHEMA,
  WATER_PRESET_VERSION,
  normalizeWaterPreset,
  waterPresetIdentity,
  type WaterPreset,
} from "../src/water-preset.js";

describe("Water Presets", () => {
  it("creates versioned Calm, Swell, and Storm Artistic Control snapshots", () => {
    const calm = createWaterPreset("calm");
    const swell = createWaterPreset();
    const storm = createWaterPreset("storm");

    expect(swell).toEqual({
      schema: WATER_PRESET_SCHEMA,
      version: WATER_PRESET_VERSION,
      id: "swell",
      presetHash:
        "sha256:667f6dd3b383cc3909b98829ba6979aa99fe31b47996f7e806e4768feccad37b",
      artisticControls: {
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
      },
    });
    expect(calm.id).toBe("calm");
    expect(WATER_PRESET_VERSION).toBe(2);
    expect(calm.presetHash).toBe(
      "sha256:7823cba17b46a26315541babfde3d3b7fda6a937794df7a32cbc3bf3d28df047",
    );
    expect(calm.artisticControls).toMatchObject({
      grazingReflection: 0.7,
      environmentReflection: 0.85,
      depthSeeThrough: 0.95,
      depthColoring: 0.4,
      inWaterGlow: 0.35,
      crestGlow: 0.25,
    });
    expect(storm.id).toBe("storm");
    expect(storm.presetHash).toBe(
      "sha256:85ff6bf8c652aaecb3d7aa3e3bf35c693264365c19cec1683c42fe2fb1164f9e",
    );
    expect(storm.artisticControls).toMatchObject({
      grazingReflection: 1.15,
      environmentReflection: 0.7,
      depthSeeThrough: 0.4,
      depthColoring: 1.55,
      inWaterGlow: 1.45,
      crestGlow: 1.6,
    });
    expect(createWaterPreset("swell")).toEqual(swell);
    expect(Object.isFrozen(calm)).toBe(true);
    expect(Object.isFrozen(calm.artisticControls)).toBe(true);
    expect(Object.isFrozen(swell)).toBe(true);
    expect(Object.isFrozen(storm)).toBe(true);
  });

  it("normalizes a supported preset into immutable identity evidence", () => {
    const candidate = structuredClone(createWaterPreset("storm"));
    const normalized = normalizeWaterPreset(candidate);
    const identity = waterPresetIdentity(normalized);

    expect(normalized).toEqual(candidate);
    expect(normalized).not.toBe(candidate);
    expect(identity).toEqual({
      schema: WATER_PRESET_SCHEMA,
      version: WATER_PRESET_VERSION,
      id: "storm",
      presetHash:
        "sha256:85ff6bf8c652aaecb3d7aa3e3bf35c693264365c19cec1683c42fe2fb1164f9e",
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(identity)).toBe(true);
  });

  it.each([
    [
      "unknown id",
      {
        ...createWaterPreset(),
        id: "glassy",
      },
    ],
    [
      "preset hash drift",
      {
        ...createWaterPreset(),
        presetHash: `sha256:${"0".repeat(64)}`,
      },
    ],
    [
      "control drift",
      {
        ...createWaterPreset(),
        artisticControls: {
          ...createWaterPreset().artisticControls,
          waveStrength: 1.2,
        },
      },
    ],
    [
      "unknown control fields",
      {
        ...createWaterPreset(),
        artisticControls: {
          ...createWaterPreset().artisticControls,
          foamAmount: 1,
        },
      },
    ],
    [
      "version 1 optical reshape",
      {
        schema: WATER_PRESET_SCHEMA,
        version: 1,
        id: "swell",
        presetHash:
          "sha256:97e5225b435c40141672e31c3282584c246ef07b763351689c84f69ac3ca7b88",
        artisticControls: createWaterPreset().artisticControls,
      },
    ],
  ])("fails closed on %s", (_name, candidate) => {
    expect(() =>
      normalizeWaterPreset(candidate as unknown as WaterPreset),
    ).toThrow();
  });

  it("rejects version 1 instead of silently reshaping optical controls", () => {
    expect(() =>
      normalizeWaterPreset({
        schema: WATER_PRESET_SCHEMA,
        version: 1,
        id: "swell",
        presetHash:
          "sha256:97e5225b435c40141672e31c3282584c246ef07b763351689c84f69ac3ca7b88",
        artisticControls: createWaterPreset().artisticControls,
      } as unknown as WaterPreset),
    ).toThrow(
      "Water Preset version 1 does not include the required optical Artistic Controls.",
    );
  });
});

describe("Water Preset runtime switching", () => {
  it("switches Calm, Swell, and Storm only through hot Artistic Controls", async () => {
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: createStaticHostSimulationAdapter(),
        environment: createTestEnvironmentAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;
    const results = {
      heights: new Float32Array(1),
      normals: new Float32Array(3),
      velocities: new Float32Array(3),
      foam: new Float32Array(1),
      ticks: new Float64Array(1),
      controlRevisions: new Float64Array(1),
      snapshotAges: new Uint8Array(1),
    };
    const query = (): number => {
      lease.queryGameplay({
        count: 1,
        positions: Float32Array.of(2, 0, 0),
        results,
      });
      return results.heights[0] ?? Number.NaN;
    };

    expect(lease.inspectRuntime().artisticControls).toEqual(
      createWaterPreset("swell").artisticControls,
    );
    expect(query()).toBeCloseTo(1.177_562, 5);

    const storm = lease.updateArtisticControls(
      createWaterPreset("storm").artisticControls,
    );
    expect(storm).toMatchObject({ changed: true, revision: 1 });
    expect(query()).toBeCloseTo(2.941_599, 5);
    expect(
      lease.updateArtisticControls(createWaterPreset("storm").artisticControls),
    ).toMatchObject({ changed: false, revision: 1 });

    const calm = lease.updateArtisticControls(
      createWaterPreset("calm").artisticControls,
    );
    expect(calm).toMatchObject({ changed: true, revision: 2 });
    expect(query()).toBeCloseTo(0.200_01, 5);
    expect(lease.inspectRuntime().artisticControls).toEqual(
      createWaterPreset("calm").artisticControls,
    );

    await lease.dispose();
  });
});
