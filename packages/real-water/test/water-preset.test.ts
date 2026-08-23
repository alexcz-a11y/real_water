import { describe, expect, it } from "vitest";
import {
  createMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createStaticHostPresentationAdapter,
  createStaticHostSimulationAdapter,
  createWaterPreset,
  prepareRealWater,
} from "../src/index.js";
import { createTestEnvironmentAdapter } from "./test-host-environment.js";
import {
  WATER_PRESET_SCHEMA,
  WATER_PRESET_VERSION,
  createAuthoredWaterPreset,
  migrateWaterPreset,
  normalizeWaterPreset,
  waterPresetIdentity,
  type WaterPreset,
} from "../src/water-preset.js";
import type { ArtisticControls } from "../src/runtime.js";

// Versions 1 through 3 predate the spectral whitecap Artistic Controls, so a
// repository-authentic historical payload carries only the thirteen optical
// controls, in their original order.
function withoutWhitecapControls(
  controls: ArtisticControls,
): Record<string, number> {
  const legacy = withoutUnderwaterControls(controls);
  delete legacy.whitecapAmount;
  delete legacy.foamPersistence;
  return legacy;
}

function withoutUnderwaterControls(
  controls: ArtisticControls,
): Record<string, number> {
  const legacy: Record<string, number> = { ...controls };
  delete legacy.underwaterHaze;
  delete legacy.underwaterTurbidity;
  delete legacy.underwaterLightShafts;
  delete legacy.underwaterColor;
  delete legacy.underwaterExposure;
  return legacy;
}

// Version 3 was committed twice, in two different shapes, on two branches
// developed in parallel: one derived presetHash at runtime over the thirteen
// optical controls, the other added the two spectral whitecap controls. Both
// hash sets are taken from the two commits, not recomputed here.
const LEGACY_V3_PRE_WHITECAP_HASHES = {
  calm: "sha256:4e857b4e7b20f4d2317e62980ef769d7d7547bf5b7b3aa7e3394bc4e8518aae5",
  swell:
    "sha256:7a24dac40f64cf2d8bef944832c661adefb49883d2ad541c13eaeb91254f580c",
  storm:
    "sha256:6eb0e333bf6a5b3242002057c8380800eaa0b2aad7e4dacf39ffb73f408a5fe5",
} as const;
const LEGACY_V3_WHITECAP_HASHES = {
  calm: "sha256:2636557cea16c0c4c8fc249e486192db8b205737d2679df95e36ee10baeb2825",
  swell:
    "sha256:a271f14c1aad0eaf6681b9499cb962b94b19531870cf5b4bca3a6061636ccbeb",
  storm:
    "sha256:04ba3bb41ea6ca9c9f6b54bd7bf8888c0b634df026379be67bad284143f2d3e9",
} as const;

const LEGACY_V2_BUILT_INS = [
  {
    schema: "real-water/water-preset",
    version: 2,
    id: "calm",
    presetHash:
      "sha256:7823cba17b46a26315541babfde3d3b7fda6a937794df7a32cbc3bf3d28df047",
    artisticControls: {
      waveStrength: 0.55,
      swellDrama: 0.35,
      directionality: 0.85,
      choppiness: 0.25,
      crestSharpness: 0.15,
      microDetail: 0.4,
      timeScale: 0.85,
      grazingReflection: 0.7,
      environmentReflection: 0.85,
      depthSeeThrough: 0.95,
      depthColoring: 0.4,
      inWaterGlow: 0.35,
      crestGlow: 0.25,
    },
  },
  {
    schema: "real-water/water-preset",
    version: 2,
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
  },
  {
    schema: "real-water/water-preset",
    version: 2,
    id: "storm",
    presetHash:
      "sha256:85ff6bf8c652aaecb3d7aa3e3bf35c693264365c19cec1683c42fe2fb1164f9e",
    artisticControls: {
      waveStrength: 1.45,
      swellDrama: 1.6,
      directionality: 0.35,
      choppiness: 1.7,
      crestSharpness: 1.1,
      microDetail: 1.5,
      timeScale: 1.15,
      grazingReflection: 1.15,
      environmentReflection: 0.7,
      depthSeeThrough: 0.4,
      depthColoring: 1.55,
      inWaterGlow: 1.45,
      crestGlow: 1.6,
    },
  },
] as const;

const LEGACY_V1_BUILT_INS = [
  {
    schema: "real-water/water-preset",
    version: 1,
    id: "calm",
    presetHash:
      "sha256:46e77abd2ff1bc2db00440dab4634c935e56e36d624a0e5fc932c06c9c203069",
    artisticControls: {
      waveStrength: 0.55,
      swellDrama: 0.35,
      directionality: 0.85,
      choppiness: 0.25,
      crestSharpness: 0.15,
      microDetail: 0.4,
      timeScale: 0.85,
    },
  },
  {
    schema: "real-water/water-preset",
    version: 1,
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
  },
  {
    schema: "real-water/water-preset",
    version: 1,
    id: "storm",
    presetHash:
      "sha256:07ef1822a50063f707e4a723e15f1eb0e0cb7310b4563a598d7225f7066fe956",
    artisticControls: {
      waveStrength: 1.45,
      swellDrama: 1.6,
      directionality: 0.35,
      choppiness: 1.7,
      crestSharpness: 1.1,
      microDetail: 1.5,
      timeScale: 1.15,
    },
  },
] as const;

describe("Water Presets", () => {
  it("creates a current Water Preset from any legal Artistic Controls", () => {
    const controls = {
      ...createWaterPreset("storm").artisticControls,
      waveStrength: 1.25,
      directionality: 0.4,
    };

    const authored = createAuthoredWaterPreset("storm", controls);

    expect(authored).toEqual({
      schema: WATER_PRESET_SCHEMA,
      version: 5,
      id: "storm",
      presetHash:
        "sha256:fce44a5709dcd774026f2597d42d2b0fc91d23e6ff5e88460a7817d95a2a3265",
      artisticControls: controls,
    });
    expect(WATER_PRESET_VERSION).toBe(5);
    expect(Object.isFrozen(authored)).toBe(true);
    expect(Object.isFrozen(authored.artisticControls)).toBe(true);
  });

  it("rejects authored ids and Artistic Controls outside the runtime contract", () => {
    const controls = createWaterPreset().artisticControls;

    expect(() =>
      createAuthoredWaterPreset("glassy" as never, controls),
    ).toThrow("Unsupported Water Preset: glassy");
    expect(() =>
      createAuthoredWaterPreset("swell", {
        ...controls,
        directionality: 1.01,
      }),
    ).toThrow("directionality");
    expect(() =>
      createAuthoredWaterPreset("swell", {
        ...controls,
        waveStrength: Number.NaN,
      }),
    ).toThrow("waveStrength");
    expect(() =>
      createAuthoredWaterPreset("swell", {
        ...controls,
        foamAmount: 1,
      } as unknown as WaterPreset["artisticControls"]),
    ).toThrow("complete supported control set");
  });

  it("creates versioned Calm, Swell, and Storm Artistic Control snapshots", () => {
    const calm = createWaterPreset("calm");
    const swell = createWaterPreset();
    const storm = createWaterPreset("storm");

    expect(swell).toEqual({
      schema: WATER_PRESET_SCHEMA,
      version: WATER_PRESET_VERSION,
      id: "swell",
      presetHash:
        "sha256:1ec9172feb2e6fb910c98b1ae064b465517f3ee811a7676018d9c4441127f822",
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
        whitecapAmount: 1,
        foamPersistence: 1,
        underwaterHaze: 1,
        underwaterTurbidity: 1,
        underwaterLightShafts: 1,
        underwaterColor: 1,
        underwaterExposure: 1,
      },
    });
    expect(calm.id).toBe("calm");
    expect(WATER_PRESET_VERSION).toBe(5);
    expect(calm.presetHash).toBe(
      "sha256:9ac9a6f352d1ed9090d00c2e7f979cc8b73f91ed2c9797d3e39ba15600fa243a",
    );
    expect(calm.artisticControls).toMatchObject({
      grazingReflection: 0.7,
      environmentReflection: 0.85,
      depthSeeThrough: 0.95,
      depthColoring: 0.4,
      inWaterGlow: 0.35,
      crestGlow: 0.25,
      whitecapAmount: 0.25,
      foamPersistence: 0.45,
      underwaterHaze: 0.45,
      underwaterTurbidity: 0.35,
      underwaterLightShafts: 0.65,
      underwaterColor: 0.7,
      underwaterExposure: 1.15,
    });
    expect(storm.id).toBe("storm");
    expect(storm.presetHash).toBe(
      "sha256:3f71363c4b433640a4a0dad6b0e030fb819be0640fe10b643bcce0d42db08df3",
    );
    expect(storm.artisticControls).toMatchObject({
      grazingReflection: 1.15,
      environmentReflection: 0.7,
      depthSeeThrough: 0.4,
      depthColoring: 1.55,
      inWaterGlow: 1.45,
      crestGlow: 1.6,
      whitecapAmount: 1.65,
      foamPersistence: 1.6,
      underwaterHaze: 1.45,
      underwaterTurbidity: 1.7,
      underwaterLightShafts: 0.55,
      underwaterColor: 1.35,
      underwaterExposure: 0.8,
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
        "sha256:3f71363c4b433640a4a0dad6b0e030fb819be0640fe10b643bcce0d42db08df3",
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(identity)).toBe(true);
  });

  it("strictly normalizes an authored current-version snapshot", () => {
    const authored = createAuthoredWaterPreset("calm", {
      ...createWaterPreset("calm").artisticControls,
      choppiness: 0.75,
      crestGlow: 0.6,
    });
    const candidate = structuredClone(authored);

    const normalized = normalizeWaterPreset(candidate);

    expect(normalized).toEqual(authored);
    expect(normalized).not.toBe(candidate);
    expect(normalized.artisticControls).not.toBe(candidate.artisticControls);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.artisticControls)).toBe(true);
  });

  it("migrates a current Water Preset through strict normalization", () => {
    const authored = createAuthoredWaterPreset("swell", {
      ...createWaterPreset("swell").artisticControls,
      swellDrama: 1.4,
    });
    const candidate = structuredClone(authored);

    const migrated = migrateWaterPreset(candidate);

    expect(migrated).toEqual(authored);
    expect(migrated).not.toBe(candidate);
    expect(Object.isFrozen(migrated)).toBe(true);
    expect(Object.isFrozen(migrated.artisticControls)).toBe(true);
  });

  it("migrates an authenticated authored v4 preset without losing its controls", () => {
    const oldControls = {
      ...withoutUnderwaterControls(createWaterPreset("storm").artisticControls),
      waveStrength: 1.25,
      directionality: 0.4,
    };

    const migrated = migrateWaterPreset({
      schema: WATER_PRESET_SCHEMA,
      version: 4,
      id: "storm",
      presetHash:
        "sha256:4f7b89f0a5f836dff2371e451991e129a3d8e3a1e847b4077dee63dfa4fccb12",
      artisticControls: oldControls,
    });

    expect(migrated.version).toBe(5);
    expect(migrated.artisticControls).toEqual({
      ...oldControls,
      underwaterHaze: 1,
      underwaterTurbidity: 1,
      underwaterLightShafts: 1,
      underwaterColor: 1,
      underwaterExposure: 1,
    });
    expect(Object.isFrozen(migrated)).toBe(true);
    expect(Object.isFrozen(migrated.artisticControls)).toBe(true);
  });

  it.each(LEGACY_V2_BUILT_INS)(
    "migrates the repository's v2 $id built-in snapshot",
    (legacy) => {
      const migrated = migrateWaterPreset(structuredClone(legacy));

      expect(migrated).toEqual(createWaterPreset(legacy.id));
      expect(migrated.version).toBe(5);
      expect(Object.isFrozen(migrated)).toBe(true);
      expect(Object.isFrozen(migrated.artisticControls)).toBe(true);
    },
  );

  it.each(LEGACY_V1_BUILT_INS)(
    "migrates the repository's v1 $id built-in snapshot",
    (legacy) => {
      const migrated = migrateWaterPreset(structuredClone(legacy));

      expect(migrated).toEqual(createWaterPreset(legacy.id));
      expect(migrated.version).toBe(5);
      expect(Object.isFrozen(migrated)).toBe(true);
      expect(Object.isFrozen(migrated.artisticControls)).toBe(true);
    },
  );

  it.each(["calm", "swell", "storm"] as const)(
    "migrates both committed v3 %s built-in snapshots",
    (id) => {
      const current = createWaterPreset(id);
      const preWhitecap = withoutWhitecapControls(current.artisticControls);

      expect(
        migrateWaterPreset({
          schema: WATER_PRESET_SCHEMA,
          version: 3,
          id,
          presetHash: LEGACY_V3_PRE_WHITECAP_HASHES[id],
          artisticControls: preWhitecap,
        }),
      ).toEqual(current);

      expect(
        migrateWaterPreset({
          schema: WATER_PRESET_SCHEMA,
          version: 3,
          id,
          presetHash: LEGACY_V3_WHITECAP_HASHES[id],
          artisticControls: withoutUnderwaterControls(current.artisticControls),
        }),
      ).toEqual(current);
    },
  );

  it("refuses to mix the two committed v3 shapes", () => {
    const current = createWaterPreset("calm");
    const preWhitecap = withoutWhitecapControls(current.artisticControls);

    expect(() =>
      migrateWaterPreset({
        schema: WATER_PRESET_SCHEMA,
        version: 3,
        id: "calm",
        presetHash: LEGACY_V3_WHITECAP_HASHES.calm,
        artisticControls: preWhitecap,
      }),
    ).toThrow(TypeError);

    expect(() =>
      migrateWaterPreset({
        schema: WATER_PRESET_SCHEMA,
        version: 3,
        id: "calm",
        presetHash: LEGACY_V3_PRE_WHITECAP_HASHES.calm,
        artisticControls: withoutUnderwaterControls(current.artisticControls),
      }),
    ).toThrow(TypeError);
  });

  it.each([
    [
      "a future version",
      {
        ...createWaterPreset("storm"),
        version: 6,
      },
    ],
    [
      "an unknown historical schema",
      {
        ...LEGACY_V2_BUILT_INS[0],
        schema: "another-package/water-preset",
      },
    ],
    [
      "an unknown historical id",
      {
        ...LEGACY_V2_BUILT_INS[0],
        id: "glassy",
      },
    ],
    [
      "a tampered v1 snapshot",
      {
        ...LEGACY_V1_BUILT_INS[2],
        artisticControls: {
          ...LEGACY_V1_BUILT_INS[2].artisticControls,
          swellDrama: 1.5,
        },
      },
    ],
    [
      "a hash-valid but non-built-in v2 snapshot",
      {
        ...LEGACY_V2_BUILT_INS[1],
        presetHash:
          "sha256:771e939564d626af7e9506f95d0e1f0b189b9c34c46885090a9a38f3bbd7ef00",
        artisticControls: {
          ...LEGACY_V2_BUILT_INS[1].artisticControls,
          waveStrength: 1.2,
        },
      },
    ],
  ])("refuses to migrate %s", (_name, candidate) => {
    expect(() => migrateWaterPreset(candidate)).toThrow();
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
  it("changes whitecap amount and foam persistence as hot Artistic Controls", async () => {
    const manifest = createMinimalWaterPrewarmManifest();
    const lease = await prepareRealWater({
      manifest,
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: createStaticHostSimulationAdapter(),
        environment: createTestEnvironmentAdapter(),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;

    expect(createWaterPreset("calm").artisticControls).toMatchObject({
      whitecapAmount: 0.25,
      foamPersistence: 0.45,
    });
    expect(createWaterPreset("storm").artisticControls).toMatchObject({
      whitecapAmount: 1.65,
      foamPersistence: 1.6,
    });

    const receipt = lease.updateArtisticControls({
      ...lease.inspectRuntime().artisticControls,
      whitecapAmount: 0,
      foamPersistence: 2,
    });

    expect(receipt).toMatchObject({ changed: true, revision: 1 });
    expect(lease.inspectRuntime().artisticControls).toMatchObject({
      whitecapAmount: 0,
      foamPersistence: 2,
    });
    expect(lease.manifest.manifestHash).toBe(manifest.manifestHash);
    await lease.dispose();
  });

  it("switches Calm, Swell, and Storm only through hot Artistic Controls", async () => {
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: createStaticHostSimulationAdapter(),
        environment: createTestEnvironmentAdapter(),
        presentation: createStaticHostPresentationAdapter(),
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
