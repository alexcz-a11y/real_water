import { createHash } from "node:crypto";
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
  PREWARM_MANIFEST_VERSION,
  SUPPORTED_EFFECT_VARIANTS,
  createMinimalWaterPrewarmManifest,
  manifestIdentity,
  normalizePrewarmManifest,
  type PrewarmManifest,
} from "../src/manifest.js";

const NATIVE_TEMPORAL = Object.freeze({
  mode: "TRAA" as const,
  renderScale: 1 as const,
  resolutionPolicy: "drawing-buffer-exact" as const,
  taau: false as const,
  dynamicResolution: false as const,
  frameGeneration: false as const,
  msaaSamples: 0 as const,
});
const MINIMAL_PROFILE_HASH =
  "sha256:647ceaf12d769ddc4a95414593ca23131f3ec9a516a32341517609d4788cbc73";
const HIGH_DETAIL_PROFILE_HASH =
  "sha256:975a61a72c43c660866970618ee747db41fab60cd54d6cce6654edd7376b8ba3";
const MEMORY_PREWARM_DRAWING_BUFFER = Object.freeze({
  width: 320,
  height: 180,
});
const NEXT_DRAWING_BUFFER = Object.freeze({
  width: 384,
  height: 216,
});
const DRAWING_BUFFER_BOUND_BASE_FINGERPRINTS = Object.freeze({
  "water-scene-color":
    "sha256:7761ba3b4ab1e04567aa1e9e796d3a66e8dab91e157940cce9281e4eaf9e53fb",
  "water-scene-depth":
    "sha256:b1c0600e109f08f14c72d84ac848e85a64d47d69daf0406aa966911a0872a169",
  "water-render-target":
    "sha256:154cbf47d199c3e5501bb9bf1fb30a862c6bf3b770caa1a759f55fb14fea34e9",
  "water-motion-vectors":
    "sha256:22d81a8fcf82eb4c38c70f64cbdd809d308218ae003cff43d3d0e4495c532026",
  "water-inverse-linear-depth":
    "sha256:8c437e59eb9f4c22921b61c6d5bb39af290007a27e424b1916e934175743cc4c",
  "water-view-normal":
    "sha256:c9c8dc85087bbbf6c696e4aed1efe7796b22d6eabb9d25b6e7f1fd12ed256577",
  "water-optical-factors-target":
    "sha256:17bb803da6968b516f2ea1f286d25d6e8aa0b2eda5bc9ba118cc0e4bdb18e5ec",
  "water-optical-diagnostics-a":
    "sha256:17bc4d8de01c8456f0cabc9ef93cd4b42994b069a7392abca453116b57189758",
  "water-optical-diagnostics-b":
    "sha256:36a1f57ebc891ac92a1d92f6257ea21e2b501a02b8d3df22dcc00a4c7d1133fa",
  "water-final-color-target":
    "sha256:95e187bfaa85ab73fddaa0060eb8d184622ffb5e1184b6ed83fb1840ac5c298d",
  "water-current-color-target":
    "sha256:e696b8999adaa67392cac034126b180ca2a99c4365fbf56099c912940313d771",
  "water-stock-traa-history":
    "sha256:c497047138e197f87d7a3ac341246033cdb18d36701cc88b79774b51df0638c5",
  "water-traa-resolve-jitter":
    "sha256:ba8bdc48d2842afd8f4f620e5296fce9bde9055047e4de7d593eec83dce25733",
  "water-render-route":
    "sha256:02a2ef11bb80777f29a294b21601b96fefa73a10f1a531bb9427067e5f326772",
  "water-current-color-conversion":
    "sha256:c3ccd110aed4171e0e15c0bdde797b266ed744751a437ae54ea1ec157f8dcb14",
  "water-named-output-routes":
    "sha256:aa21153732af519ab15fdd5e9f46311d2e9f4c8096b9f35bd26bb561d18e5139",
  "water-completion-probe":
    "sha256:c4e77fab97a18b547bf0053649e772e8faf9ce0dd58958136d531ecfca9ab89f",
  "water-main-camera-guard":
    "sha256:ef72fd8cb5959aa73eeef6a857f67edc3f32b1b9f7e73b76b295f913ae6aca25",
});
const DRAWING_BUFFER_BOUND_IDS = [
  "water-scene-color",
  "water-scene-depth",
  "water-render-target",
  "water-motion-vectors",
  "water-inverse-linear-depth",
  "water-view-normal",
  "water-optical-factors-target",
  "water-optical-diagnostics-a",
  "water-optical-diagnostics-b",
  "water-final-color-target",
  "water-current-color-target",
  "water-stock-traa-history",
  "water-traa-resolve-jitter",
  "water-render-route",
  "water-current-color-conversion",
  "water-named-output-routes",
  "water-completion-probe",
  "water-main-camera-guard",
] as const;

function sha256Identifier(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function boundDeclarationHashInput(
  declaration: {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
  },
  drawingBuffer: { readonly width: number; readonly height: number },
) {
  return {
    id: declaration.id,
    kind: declaration.kind,
    label: declaration.label,
    baseFingerprint:
      DRAWING_BUFFER_BOUND_BASE_FINGERPRINTS[
        declaration.id as keyof typeof DRAWING_BUFFER_BOUND_BASE_FINGERPRINTS
      ],
    width: drawingBuffer.width,
    height: drawingBuffer.height,
  };
}

function canonicalManifestHashInput(manifest: PrewarmManifest) {
  return {
    schema: manifest.schema,
    version: manifest.version,
    id: manifest.id,
    qualityProfile: manifest.qualityProfile,
    drawingBuffer: manifest.drawingBuffer,
    environmentReflection: manifest.environmentReflection,
    effectVariants: manifest.effectVariants,
    declarations: manifest.declarations,
  };
}
const CORE_PREWARM_DECLARATION_IDS = [
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
  "water-procedural-motion",
  "water-motion-vectors",
  "water-inverse-linear-depth",
  "water-view-normal",
  "water-optical-factors-target",
  "water-optical-diagnostics-a",
  "water-optical-diagnostics-b",
  "water-final-color-target",
  "water-current-color-target",
  "water-stock-traa-history",
  "water-traa-resolve-jitter",
  "water-traa-reset-route",
  "water-current-color-conversion",
  "water-named-output-routes",
  "water-hidden-stabilization",
  "water-completion-probe",
  "water-main-camera-guard",
] as const;

describe("Quality Profiles", () => {
  it("creates deterministic deeply immutable minimal-water structures", () => {
    const minimal = createMinimalWaterQualityProfile();
    const highDetail = createMinimalWaterQualityProfile("minimal-high-detail");

    expect(QUALITY_PROFILE_VERSION).toBe(2);
    expect(minimal).toEqual({
      schema: QUALITY_PROFILE_SCHEMA,
      version: 2,
      id: "minimal",
      profileHash: MINIMAL_PROFILE_HASH,
      surface: {
        geometry: {
          widthSegments: 128,
          heightSegments: 128,
        },
      },
      temporal: NATIVE_TEMPORAL,
    });
    expect(highDetail).toEqual({
      schema: QUALITY_PROFILE_SCHEMA,
      version: 2,
      id: "minimal-high-detail",
      profileHash: HIGH_DETAIL_PROFILE_HASH,
      surface: {
        geometry: {
          widthSegments: 256,
          heightSegments: 256,
        },
      },
      temporal: NATIVE_TEMPORAL,
    });
    expect(createMinimalWaterQualityProfile()).toEqual(minimal);
    expect(Object.isFrozen(minimal)).toBe(true);
    expect(Object.isFrozen(minimal.surface)).toBe(true);
    expect(Object.isFrozen(minimal.surface.geometry)).toBe(true);
    expect(Object.isFrozen(minimal.temporal)).toBe(true);
    expect(Object.isFrozen(highDetail)).toBe(true);
    expect(() => {
      (minimal.surface.geometry as { widthSegments: number }).widthSegments =
        99;
    }).toThrow(TypeError);
    expect(() => {
      (minimal.temporal as { msaaSamples: number }).msaaSamples = 4;
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
      version: 2,
      id: "minimal-high-detail",
      profileHash: HIGH_DETAIL_PROFILE_HASH,
    });
    expect(geometry).toEqual({ widthSegments: 256, heightSegments: 256 });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(geometry)).toBe(true);
    expect(Object.isFrozen(normalized.temporal)).toBe(true);
    expect(normalized.temporal).toEqual(NATIVE_TEMPORAL);
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
    [
      "stale version",
      {
        ...createMinimalWaterQualityProfile(),
        version: 1,
      },
    ],
    [
      "temporal mode drift",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, mode: "TAAU" },
      },
    ],
    [
      "renderScale drift",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, renderScale: 0.5 },
      },
    ],
    [
      "taau enabled",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, taau: true },
      },
    ],
    [
      "dynamic resolution enabled",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, dynamicResolution: true },
      },
    ],
    [
      "frame generation enabled",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, frameGeneration: true },
      },
    ],
    [
      "msaaSamples drift",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, msaaSamples: 4 },
      },
    ],
    [
      "resolutionPolicy drift",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, resolutionPolicy: "viewport-shared" },
      },
    ],
    [
      "unknown temporal fields",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, historyWeight: 0.9 },
      },
    ],
    [
      "missing resolutionPolicy",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: {
          mode: NATIVE_TEMPORAL.mode,
          renderScale: NATIVE_TEMPORAL.renderScale,
          taau: NATIVE_TEMPORAL.taau,
          dynamicResolution: NATIVE_TEMPORAL.dynamicResolution,
          frameGeneration: NATIVE_TEMPORAL.frameGeneration,
          msaaSamples: NATIVE_TEMPORAL.msaaSamples,
        },
      },
    ],
    [
      "missing temporal",
      (() => {
        const profile = createMinimalWaterQualityProfile() as QualityProfile & {
          temporal?: unknown;
        };
        const rest = { ...profile };
        Reflect.deleteProperty(rest, "temporal");
        return rest;
      })(),
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

    expect(PREWARM_MANIFEST_VERSION).toBe(3);
    expect(minimal.version).toBe(3);
    expect(minimal.drawingBuffer).toEqual(MEMORY_PREWARM_DRAWING_BUFFER);
    expect(Object.isFrozen(minimal.drawingBuffer)).toBe(true);
    expect(minimal.manifestHash).toBe(
      sha256Identifier(JSON.stringify(canonicalManifestHashInput(minimal))),
    );
    expect(repeated.manifestHash).toBe(minimal.manifestHash);
    expect(highDetail.manifestHash).toBe(
      sha256Identifier(JSON.stringify(canonicalManifestHashInput(highDetail))),
    );
    expect(highDetail.manifestHash).not.toBe(minimal.manifestHash);
    expect(minimal.qualityProfile).toEqual(minimalProfile);
    expect(highDetail.qualityProfile).toEqual(highDetailProfile);
    expect(minimal.effectVariants).toEqual([
      { effectId: "minimal-water-surface", variantId: "basic" },
    ]);
    expect(minimal.effectVariants).toEqual(SUPPORTED_EFFECT_VARIANTS);
    expect(minimal.qualityProfile.temporal).toEqual(NATIVE_TEMPORAL);
    expect(minimal.qualityProfile.version).toBe(2);
    expect(minimal.declarations.map(({ id }) => id)).toEqual([
      ...CORE_PREWARM_DECLARATION_IDS,
    ]);
    expect(
      Object.fromEntries(
        minimal.declarations
          .filter((declaration) =>
            [
              "water-procedural-motion",
              "water-motion-vectors",
              "water-final-color-target",
              "water-stock-traa-history",
              "water-traa-resolve-jitter",
              "water-traa-reset-route",
            ].includes(declaration.id),
          )
          .map((declaration) => [
            declaration.id,
            { kind: declaration.kind, label: declaration.label },
          ]),
      ),
    ).toEqual({
      "water-procedural-motion": {
        kind: "effect-state",
        label:
          "Previous presented wave-field positionPrevious (current clipmap XZ)",
      },
      "water-motion-vectors": {
        kind: "resource",
        label: "Procedural water velocity (RG16F NDC, scale 1, samples 0)",
      },
      "water-final-color-target": {
        kind: "resource",
        label: "Core final-color target (RGBA8, drawing-buffer-exact)",
      },
      "water-stock-traa-history": {
        kind: "effect-state",
        label: "Stock TRAA color+depth history policy",
      },
      "water-traa-resolve-jitter": {
        kind: "conditional-route",
        label: "Stock TRAA resolve/jitter route",
      },
      "water-traa-reset-route": {
        kind: "conditional-route",
        label: "No-allocation TRAA reset route",
      },
    });
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
              "water-traa-reset-route",
              "water-hidden-stabilization",
            ].includes(declaration.id),
          )
          .map((declaration) => [declaration.id, declaration.fingerprint]),
      ),
    ).toEqual({
      "water-environment-radiance":
        "sha256:3b4e72ce8470faf690ea64fa4f7e0e99c36517e5c93df2036bd80472021b777d",
      "water-material":
        "sha256:0a8c1aaa649d6a28ff0565d73cf0cf6e45acf14135c54e5162fbc7fbe0c7e386",
      "water-optical-route":
        "sha256:d223bdd7539e1d31659f03fa18a8e8e8784fde725f9fce9d499f33f48dcf1e63",
      "water-traa-reset-route":
        "sha256:e4a59425b89a6138d620200a8404be90b74fd8d20a5da54fbefb259a3b4dd9ab",
      "water-hidden-stabilization":
        "sha256:f35d6cdd70b97589e93e16f61bb2ecb684031f9681d47d324413e2617810c726",
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
      version: 3,
      id: "reference-minimal-water",
      manifestHash: highDetail.manifestHash,
      qualityProfile: qualityProfileIdentity(highDetailProfile),
      drawingBuffer: MEMORY_PREWARM_DRAWING_BUFFER,
      environmentReflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      effectVariants: [
        { effectId: "minimal-water-surface", variantId: "basic" },
      ],
    });
    expect(Object.isFrozen(minimal.drawingBuffer)).toBe(true);
    expect(Object.isFrozen(minimal.qualityProfile)).toBe(true);
    expect(Object.isFrozen(minimal.effectVariants)).toBe(true);
    expect(Object.isFrozen(minimal.effectVariants[0])).toBe(true);
    expect(Object.isFrozen(SUPPORTED_EFFECT_VARIANTS)).toBe(true);
    expect(Object.isFrozen(SUPPORTED_EFFECT_VARIANTS[0])).toBe(true);
  });

  it("binds drawing-buffer-exact fingerprints and hashes to each physical size", () => {
    const profile = createMinimalWaterQualityProfile();
    const small = createMinimalWaterPrewarmManifest(
      profile,
      MEMORY_PREWARM_DRAWING_BUFFER,
    );
    const large = createMinimalWaterPrewarmManifest(
      profile,
      NEXT_DRAWING_BUFFER,
    );
    const repeatedLarge = createMinimalWaterPrewarmManifest(
      createMinimalWaterQualityProfile(),
      NEXT_DRAWING_BUFFER,
    );

    expect(small.drawingBuffer).toEqual(MEMORY_PREWARM_DRAWING_BUFFER);
    expect(large.drawingBuffer).toEqual(NEXT_DRAWING_BUFFER);
    expect(small.manifestHash).not.toBe(large.manifestHash);
    expect(repeatedLarge.manifestHash).toBe(large.manifestHash);
    expect(small.manifestHash).toBe(
      sha256Identifier(JSON.stringify(canonicalManifestHashInput(small))),
    );
    expect(large.manifestHash).toBe(
      sha256Identifier(JSON.stringify(canonicalManifestHashInput(large))),
    );
    for (const id of DRAWING_BUFFER_BOUND_IDS) {
      const smallDeclaration = small.declarations.find(
        (declaration) => declaration.id === id,
      );
      const largeDeclaration = large.declarations.find(
        (declaration) => declaration.id === id,
      );
      expect(smallDeclaration).toBeDefined();
      expect(largeDeclaration).toBeDefined();
      if (smallDeclaration === undefined || largeDeclaration === undefined) {
        throw new Error(`Missing drawing-buffer-bound declaration ${id}.`);
      }
      expect(smallDeclaration.fingerprint).toBe(
        sha256Identifier(
          JSON.stringify(
            boundDeclarationHashInput(smallDeclaration, small.drawingBuffer),
          ),
        ),
      );
      expect(largeDeclaration.fingerprint).toBe(
        sha256Identifier(
          JSON.stringify(
            boundDeclarationHashInput(largeDeclaration, large.drawingBuffer),
          ),
        ),
      );
      expect(smallDeclaration.fingerprint).not.toBe(
        sha256Identifier(
          JSON.stringify({
            id: smallDeclaration.id,
            kind: smallDeclaration.kind,
            label: smallDeclaration.label,
            width: small.drawingBuffer.width,
            height: small.drawingBuffer.height,
          }),
        ),
      );
      expect(smallDeclaration.fingerprint).not.toBe(
        largeDeclaration.fingerprint,
      );
    }
    expect(
      small.declarations.find(
        (declaration) => declaration.id === "water-texture",
      )?.fingerprint,
    ).toBe(
      large.declarations.find(
        (declaration) => declaration.id === "water-texture",
      )?.fingerprint,
    );
    expect(() => {
      (small.drawingBuffer as { width: number }).width = 1;
    }).toThrow(TypeError);
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
      "unknown top-level field",
      (): PrewarmManifest =>
        ({
          ...createMinimalWaterPrewarmManifest(),
          notes: "unsupported",
        }) as PrewarmManifest,
    ],
    [
      "missing drawing buffer",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return {
          schema: manifest.schema,
          version: manifest.version,
          id: manifest.id,
          manifestHash: manifest.manifestHash,
          qualityProfile: manifest.qualityProfile,
          environmentReflection: manifest.environmentReflection,
          effectVariants: manifest.effectVariants,
          declarations: manifest.declarations,
        } as PrewarmManifest;
      },
    ],
    [
      "drawing buffer extra field",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return {
          ...manifest,
          drawingBuffer: {
            ...manifest.drawingBuffer,
            scale: 1,
          } as PrewarmManifest["drawingBuffer"],
        };
      },
    ],
    [
      "drawing buffer width drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        drawingBuffer: { width: 319, height: 180 },
      }),
    ],
    [
      "non-positive drawing buffer",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        drawingBuffer: { width: 0, height: 180 },
      }),
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

  it("keeps the Memory drawing-buffer default off the public Interface", async () => {
    const publicApi = await import("../src/index.js");
    expect("MEMORY_TEST_PREWARM_DRAWING_BUFFER" in publicApi).toBe(false);
    expect("DEFAULT_MEMORY_PREWARM_DRAWING_BUFFER" in publicApi).toBe(false);
  });

  it("rejects a stale Prewarm Manifest version", () => {
    expect(() =>
      normalizePrewarmManifest({
        ...createMinimalWaterPrewarmManifest(),
        version: 2 as PrewarmManifest["version"],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "MANIFEST_VERSION_UNSUPPORTED",
        phase: "manifest-validation",
        retryable: false,
      }),
    );
  });
});
