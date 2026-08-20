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
import { SUPPORTED_HOST_ENVIRONMENT_REFLECTION } from "../src/environment.js";
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
        "sha256:10dcb2e1e7b9e4cf47a49e6805329fd9a9906c198537934603b65a219c4f1f86",
      surface: {
        geometry: {
          widthSegments: 128,
          heightSegments: 128,
        },
      },
    });
    expect(highDetail).toEqual({
      schema: QUALITY_PROFILE_SCHEMA,
      version: QUALITY_PROFILE_VERSION,
      id: "minimal-high-detail",
      profileHash:
        "sha256:a528f78e921767962db0afcf519aed7dbfed894e54284fcb7b2c7d21e93e1d0b",
      surface: {
        geometry: {
          widthSegments: 256,
          heightSegments: 256,
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
        "sha256:a528f78e921767962db0afcf519aed7dbfed894e54284fcb7b2c7d21e93e1d0b",
    });
    expect(geometry).toEqual({ widthSegments: 256, heightSegments: 256 });
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
      "sha256:22e8ad66ea9b58d02ceba64377534916c2167f8b1ed1d1aff5bdd0af8587fefc",
    );
    expect(repeated.manifestHash).toBe(minimal.manifestHash);
    expect(highDetail.manifestHash).toBe(
      "sha256:421ce1d9ceead8b1c1975922ce74bda9245325fb47c2c5485e322ad0961607cb",
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
      "water-environment-radiance",
      "water-scene-color",
      "water-scene-depth",
      "water-render-target",
      "water-clipmap",
      "water-spectral-band-swell",
      "water-spectral-band-wind",
      "water-spectral-band-chop",
      "water-spectral-band-ripple",
      "water-material",
      "water-optical-route",
      "water-render-route",
      "water-hidden-stabilization",
      "water-completion-probe",
      "water-main-camera-guard",
    ]);
    expect(highDetail.declarations.map(({ id }) => id)).toEqual(
      minimal.declarations.map(({ id }) => id),
    );
    expect(
      Object.fromEntries(
        minimal.declarations
          .filter((declaration) =>
            [
              "water-environment-radiance",
              "water-scene-color",
              "water-scene-depth",
              "water-optical-route",
            ].includes(declaration.id),
          )
          .map((declaration) => [declaration.id, declaration.label]),
      ),
    ).toEqual({
      "water-environment-radiance":
        "Host environment radiance (equirect rgba8unorm 8x4 srgb)",
      "water-scene-color":
        "Viewport pre-water scene color (viewportSharedTexture)",
      "water-scene-depth": "Viewport opaque scene depth (viewportDepthTexture)",
      "water-optical-route":
        "Basic optical composition route (projected refraction, RGB Beer-Lambert, perspective camera)",
    });
    const highDetailClipmap = highDetail.declarations.find(
      (declaration) => declaration.id === "water-clipmap",
    );
    const minimalClipmap = minimal.declarations.find(
      (declaration) => declaration.id === "water-clipmap",
    );
    expect(highDetailClipmap?.fingerprint).toBe(
      "sha256:ac0f415a7ca925b92112e332ed39c7cebef51fcec3ffc07216a0484181be6930",
    );
    expect(highDetailClipmap?.fingerprint).not.toBe(
      minimalClipmap?.fingerprint,
    );
    expect(
      Object.fromEntries(
        minimal.declarations
          .filter((declaration) =>
            [
              "water-environment-radiance",
              "water-material",
              "water-optical-route",
              "water-render-route",
              "water-completion-probe",
            ].includes(declaration.id),
          )
          .map((declaration) => [declaration.id, declaration.fingerprint]),
      ),
    ).toEqual({
      "water-environment-radiance":
        "sha256:3b4e72ce8470faf690ea64fa4f7e0e99c36517e5c93df2036bd80472021b777d",
      "water-material":
        "sha256:511030f29a5d42d01344b6a689a2e59f5248e522f1a4249c01a8916fc10e2314",
      "water-optical-route":
        "sha256:d223bdd7539e1d31659f03fa18a8e8e8784fde725f9fce9d499f33f48dcf1e63",
      "water-render-route":
        "sha256:7eea5ea8565cc2e71e32575ee2dbdae1b997cc7343f3ca96356ddf9f9447a85b",
      "water-completion-probe":
        "sha256:21038351bc7a86b5d19736ad762f4be33c24cad188c8613832a8a2c67e13b127",
    });
    expect(
      minimal.declarations.find(
        (declaration) => declaration.id === "water-optical-route",
      )?.kind,
    ).toBe("effect-state");
    expect(minimal.environmentReflection).toEqual(
      SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
    );
    expect(highDetail.environmentReflection).toEqual(
      SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
    );
    expect(manifestIdentity(highDetail)).toEqual({
      schema: "real-water/prewarm",
      version: 2,
      id: "reference-minimal-water",
      manifestHash: highDetail.manifestHash,
      qualityProfile: qualityProfileIdentity(highDetailProfile),
      environmentReflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
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
      expect(Object.isFrozen(normalized.environmentReflection)).toBe(true);
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
    [
      "missing environment reflection",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return {
          schema: manifest.schema,
          version: manifest.version,
          id: manifest.id,
          manifestHash: manifest.manifestHash,
          qualityProfile: manifest.qualityProfile,
          effectVariants: manifest.effectVariants,
          declarations: manifest.declarations,
        } as PrewarmManifest;
      },
    ],
    [
      "extra environment reflection field",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return {
          ...manifest,
          environmentReflection: {
            ...manifest.environmentReflection,
            encoding: "srgb",
          } as PrewarmManifest["environmentReflection"],
        };
      },
    ],
    [
      "environment reflection identity drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          identity: "other-environment-radiance",
        },
      }),
    ],
    [
      "environment reflection fingerprint drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          fingerprint: `sha256:${"0".repeat(64)}`,
        },
      }),
    ],
    [
      "environment reflection width drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          width: 16,
        },
      }),
    ],
    [
      "environment reflection height drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          height: 8,
        },
      }),
    ],
    [
      "environment reflection format drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          format: "rgba16float",
        } as PrewarmManifest["environmentReflection"],
      }),
    ],
    [
      "environment reflection type drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          type: "cube",
        } as PrewarmManifest["environmentReflection"],
      }),
    ],
    [
      "environment reflection color-space drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          colorSpace: "linear",
        } as PrewarmManifest["environmentReflection"],
      }),
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
