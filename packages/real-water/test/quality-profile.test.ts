import { describe, expect, it } from "vitest";
import {
  QUALITY_PROFILE_SCHEMA,
  QUALITY_PROFILE_VERSION,
  createMinimalWaterQualityProfile,
  getMinimalWaterGeometrySegments,
  normalizeQualityProfile,
  qualityProfileIdentity,
  type QualityProfile,
} from "../src/quality-profile.js";
import {
  SUPPORTED_EFFECT_VARIANTS,
  createMinimalWaterPrewarmManifest,
  manifestIdentity,
  normalizePrewarmManifest,
  type PrewarmManifest,
} from "../src/manifest.js";

describe("Quality Profiles", () => {
  it("creates deterministic deeply immutable minimal-water structures", () => {
    const minimal = createMinimalWaterQualityProfile();
    const highDetail = createMinimalWaterQualityProfile("minimal-high-detail");

    expect(minimal).toEqual({
      schema: QUALITY_PROFILE_SCHEMA,
      version: QUALITY_PROFILE_VERSION,
      id: "minimal",
      profileHash:
        "sha256:869ac714e56e70d4ffb37b75ff85432accba3caa2feb62946dc341eca66735ec",
      surface: {
        geometry: {
          widthSegments: 1,
          heightSegments: 1,
        },
      },
    });
    expect(highDetail).toEqual({
      schema: QUALITY_PROFILE_SCHEMA,
      version: QUALITY_PROFILE_VERSION,
      id: "minimal-high-detail",
      profileHash:
        "sha256:e76e54fc9cb01a477c3006634c5a1cf99bd96e605c6355ed2859241bcd2e6201",
      surface: {
        geometry: {
          widthSegments: 2,
          heightSegments: 2,
        },
      },
    });
    expect(createMinimalWaterQualityProfile()).toEqual(minimal);
    expect(Object.isFrozen(minimal)).toBe(true);
    expect(Object.isFrozen(minimal.surface)).toBe(true);
    expect(Object.isFrozen(minimal.surface.geometry)).toBe(true);
    expect(Object.isFrozen(highDetail)).toBe(true);
    expect(() => {
      (minimal.surface.geometry as { widthSegments: number }).widthSegments =
        99;
    }).toThrow(TypeError);
  });

  it("normalizes a supported profile into immutable structural evidence", () => {
    const candidate = structuredClone(
      createMinimalWaterQualityProfile("minimal-high-detail"),
    );
    const normalized = normalizeQualityProfile(candidate);
    const identity = qualityProfileIdentity(normalized);
    const geometry = getMinimalWaterGeometrySegments(normalized);

    expect(normalized).toEqual(candidate);
    expect(normalized).not.toBe(candidate);
    expect(identity).toEqual({
      schema: QUALITY_PROFILE_SCHEMA,
      version: QUALITY_PROFILE_VERSION,
      id: "minimal-high-detail",
      profileHash:
        "sha256:e76e54fc9cb01a477c3006634c5a1cf99bd96e605c6355ed2859241bcd2e6201",
    });
    expect(geometry).toEqual({ widthSegments: 2, heightSegments: 2 });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(geometry)).toBe(true);
  });

  it.each([
    [
      "unknown id",
      {
        ...createMinimalWaterQualityProfile(),
        id: "native",
      },
    ],
    [
      "profile hash drift",
      {
        ...createMinimalWaterQualityProfile(),
        profileHash: `sha256:${"0".repeat(64)}`,
      },
    ],
    [
      "geometry drift",
      {
        ...createMinimalWaterQualityProfile(),
        surface: { geometry: { widthSegments: 2, heightSegments: 1 } },
      },
    ],
    [
      "unknown structural fields",
      {
        ...createMinimalWaterQualityProfile(),
        surface: {
          ...createMinimalWaterQualityProfile().surface,
          nativeQuality: true,
        },
      },
    ],
  ])("fails closed on %s", (_name, candidate) => {
    expect(() =>
      normalizeQualityProfile(candidate as unknown as QualityProfile),
    ).toThrow();
  });

  it("rejects prototype property names as unsupported built-in ids", () => {
    expect(() =>
      createMinimalWaterQualityProfile("__proto__" as unknown as "minimal"),
    ).toThrow(RangeError);
  });
});

describe("Quality Profile manifests", () => {
  it("maps each supported structure to a deterministic complete work plan", () => {
    const minimalProfile = createMinimalWaterQualityProfile();
    const highDetailProfile = createMinimalWaterQualityProfile(
      "minimal-high-detail",
    );
    const minimal = createMinimalWaterPrewarmManifest(minimalProfile);
    const repeated = createMinimalWaterPrewarmManifest(
      createMinimalWaterQualityProfile(),
    );
    const highDetail = createMinimalWaterPrewarmManifest(highDetailProfile);

    expect(minimal.manifestHash).toBe(
      "sha256:cd1f46244381f23881c64cdad5d729ae2a6fd07e4af6a64e08509d2c080fa2f4",
    );
    expect(repeated.manifestHash).toBe(minimal.manifestHash);
    expect(highDetail.manifestHash).toBe(
      "sha256:f213c2f8dc39f1f324a7d1e97494d3a815fb3af64083b78eef768e92bc60d328",
    );
    expect(highDetail.manifestHash).not.toBe(minimal.manifestHash);
    expect(minimal.qualityProfile).toEqual(minimalProfile);
    expect(highDetail.qualityProfile).toEqual(highDetailProfile);
    expect(minimal.effectVariants).toEqual([
      { effectId: "minimal-water-surface", variantId: "basic" },
    ]);
    expect(minimal.effectVariants).toEqual(SUPPORTED_EFFECT_VARIANTS);
    expect(minimal.declarations.map(({ id }) => id)).toEqual([
      "water-texture",
      "water-render-target",
      "water-geometry",
      "water-material",
      "water-render-route",
      "water-hidden-stabilization",
      "water-completion-probe",
      "water-main-camera-guard",
    ]);
    expect(highDetail.declarations.map(({ id }) => id)).toEqual(
      minimal.declarations.map(({ id }) => id),
    );
    expect(highDetail.declarations[2]?.fingerprint).toBe(
      "sha256:12ae3cedf7ee158660e0393182280f323336e3b7549a791ed9f3eeee731da795",
    );
    expect(highDetail.declarations[2]?.fingerprint).not.toBe(
      minimal.declarations[2]?.fingerprint,
    );
    expect(manifestIdentity(highDetail)).toEqual({
      schema: "real-water/prewarm",
      version: 1,
      id: "reference-minimal-water",
      manifestHash: highDetail.manifestHash,
      qualityProfile: qualityProfileIdentity(highDetailProfile),
      effectVariants: [
        { effectId: "minimal-water-surface", variantId: "basic" },
      ],
    });
    expect(Object.isFrozen(minimal.qualityProfile)).toBe(true);
    expect(Object.isFrozen(minimal.effectVariants)).toBe(true);
    expect(Object.isFrozen(minimal.effectVariants[0])).toBe(true);
    expect(Object.isFrozen(SUPPORTED_EFFECT_VARIANTS)).toBe(true);
    expect(Object.isFrozen(SUPPORTED_EFFECT_VARIANTS[0])).toBe(true);
  });

  it("normalizes either supported plan into deeply immutable evidence", () => {
    for (const profileId of ["minimal", "minimal-high-detail"] as const) {
      const candidate = structuredClone(
        createMinimalWaterPrewarmManifest(
          createMinimalWaterQualityProfile(profileId),
        ),
      );
      const normalized = normalizePrewarmManifest(candidate);

      expect(normalized).toEqual(candidate);
      expect(normalized).not.toBe(candidate);
      expect(Object.isFrozen(normalized)).toBe(true);
      expect(Object.isFrozen(normalized.qualityProfile.surface.geometry)).toBe(
        true,
      );
      expect(Object.isFrozen(normalized.effectVariants)).toBe(true);
      expect(Object.isFrozen(normalized.effectVariants[0])).toBe(true);
      expect(Object.isFrozen(normalized.declarations)).toBe(true);
      expect(Object.isFrozen(normalized.declarations[0])).toBe(true);
    }
  });

  it.each([
    [
      "profile structure drift",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return {
          ...manifest,
          qualityProfile: {
            ...manifest.qualityProfile,
            surface: {
              geometry: { widthSegments: 2, heightSegments: 1 },
            },
          },
        };
      },
    ],
    [
      "manifest hash drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        manifestHash: `sha256:${"0".repeat(64)}`,
      }),
    ],
    [
      "missing readiness work",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return { ...manifest, declarations: manifest.declarations.slice(1) };
      },
    ],
    [
      "reordered readiness work",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        const [first, second, ...remaining] = manifest.declarations;
        if (first === undefined || second === undefined) {
          throw new Error("The supported plan must contain two declarations.");
        }
        return {
          ...manifest,
          declarations: [second, first, ...remaining],
        };
      },
    ],
    [
      "undeclared registry",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        effectVariants: [],
      }),
    ],
    [
      "effect variant registry drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        effectVariants: [
          { effectId: "minimal-water-surface", variantId: "unprewarmed" },
        ],
      }),
    ],
    [
      "unknown declaration structure",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return {
          ...manifest,
          declarations: manifest.declarations.map((declaration, index) =>
            index === 0
              ? { ...declaration, cachePolicy: "unsupported" }
              : declaration,
          ),
        };
      },
    ],
  ])("fails closed on %s", (_name, makeCandidate) => {
    expect(() => normalizePrewarmManifest(makeCandidate())).toThrowError(
      expect.objectContaining({
        code: "MANIFEST_INVALID",
        phase: "manifest-validation",
        retryable: false,
      }),
    );
  });
});
