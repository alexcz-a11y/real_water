import { describe, expect, it } from "vitest";
import {
  createMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createStaticHostSimulationAdapter,
  createWaterPreset,
  prepareRealWater,
} from "../src/index.js";
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
        "sha256:88703f2f6e7efb3ccba841230d4ac58dfe9c18bc57ea8969c1a7426cf3c3dc48",
      artisticControls: {
        waveStrength: 1,
        swellDrama: 1,
        directionality: 0,
        choppiness: 1,
        crestSharpness: 0,
        microDetail: 1,
        timeScale: 1,
      },
    });
    expect(calm.id).toBe("calm");
    expect(calm.presetHash).toBe(
      "sha256:46e77abd2ff1bc2db00440dab4634c935e56e36d624a0e5fc932c06c9c203069",
    );
    expect(storm.id).toBe("storm");
    expect(storm.presetHash).toBe(
      "sha256:07ef1822a50063f707e4a723e15f1eb0e0cb7310b4563a598d7225f7066fe956",
    );
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
        "sha256:07ef1822a50063f707e4a723e15f1eb0e0cb7310b4563a598d7225f7066fe956",
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
  ])("fails closed on %s", (_name, candidate) => {
    expect(() =>
      normalizeWaterPreset(candidate as unknown as WaterPreset),
    ).toThrow();
  });
});

describe("Water Preset runtime switching", () => {
  it("switches Calm, Swell, and Storm only through hot Artistic Controls", async () => {
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: createStaticHostSimulationAdapter(),
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
    expect(query()).toBeCloseTo(0.941_342, 5);

    const storm = lease.updateArtisticControls(
      createWaterPreset("storm").artisticControls,
    );
    expect(storm).toMatchObject({ changed: true, revision: 1 });
    expect(query()).toBeCloseTo(2.468_177, 5);
    expect(
      lease.updateArtisticControls(createWaterPreset("storm").artisticControls),
    ).toMatchObject({ changed: false, revision: 1 });

    const calm = lease.updateArtisticControls(
      createWaterPreset("calm").artisticControls,
    );
    expect(calm).toMatchObject({ changed: true, revision: 2 });
    expect(query()).toBeCloseTo(0.165_602, 5);
    expect(lease.inspectRuntime().artisticControls).toEqual(
      createWaterPreset("calm").artisticControls,
    );

    await lease.dispose();
  });
});
