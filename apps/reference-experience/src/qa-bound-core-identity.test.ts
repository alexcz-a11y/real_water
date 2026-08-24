import { describe, expect, it } from "vitest";
import {
  createMinimalWaterPrewarmManifest,
  createMinimalWaterQualityProfile,
  MAX_ATTACHED_BODIES,
  MAX_ACTIVE_DISTURBANCES,
  MAX_ACTIVE_HERO_BREAKERS,
  MAX_GAMEPLAY_QUERY_POINTS,
  type RealWaterCapabilities,
} from "real-water";
import { createBoundCoreDiagnosticsPrewarmReceipt } from "./qa-frame-driver.js";
import {
  assertRegressionDrawingBuffersAgree,
  coreManifestEvidence,
  createQaBoundCoreManifestIdentity,
  NATIVE_REGRESSION_TEMPORAL_POLICY,
  readQaBoundCoreManifestIdentity,
  readReadyCapabilities,
} from "./qa-bound-core-identity.js";

const CORE = createMinimalWaterPrewarmManifest();
const READY_CAPABILITIES: RealWaterCapabilities = {
  rendering: {
    backend: "core-webgpu",
    timestampQuery: false,
    temporal: {
      mode: "TRAA",
      renderScale: 1,
      resolutionPolicy: "drawing-buffer-exact",
      taau: false,
      dynamicResolution: false,
      frameGeneration: false,
      msaaSamples: 0,
      updateCadence: "host-present",
      motionFormat: "rg16float",
      stockThreeRevision: "185",
    },
    reflection: {
      environment: { source: "host-adapter" },
      planar: {
        width: 320,
        height: 180,
        format: "rgba8unorm-srgb",
        samples: 0,
      },
      ssr: {
        width: 320,
        height: 180,
        rawFormat: "rgba16float",
        compositeFormat: "rgba16float",
        samples: 0,
        mode: "current-frame",
        history: {
          width: 320,
          height: 180,
          historyFormat: "rgba16float",
          resolveFormat: "rgba16float",
          inputFormat: "rgba16float",
          captureFormat: "rgba16float",
          resetVelocityFormat: "rg16float",
          maxFrames: 32,
          mode: "temporal-reproject-specular",
          accumulate: true,
          hitPointReprojection: true,
          normalFormat: "packed-rgba16float",
          resetDomains: [
            "simulation-reset",
            "camera-cut",
            "origin-shift",
            "sea-state-cut",
            "waterline-crossing",
          ] as const,
          updateCadence: "host-present",
        },
        updateCadence: "host-present",
        missFallbackPriority: ["planar", "host-adapter"],
        blur: {
          width: 320,
          height: 180,
          format: "rgba16float",
          mipCount: 5,
          blurQuality: 2,
          enabled: true,
        },
      },
    },
    secondaryParticles: {
      capacity: 131_072,
      maximumCandidateCount: 147_456,
      contributionReference: {
        width: 320,
        height: 180,
        space: "output-drawing-buffer",
        screenAreaDivisor: 3_600,
        quantization: "q16-unorm-round-nearest",
      },
      hysteresis: {
        retainedContributionBonusQ16: 4_096,
        minimumResidenceTicks: 4,
        reentryCooldownTicks: 4,
      },
      consumers: [
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
      ],
      selection: "q16-global-contribution-radix",
      updateCadence: "host-fixed-tick",
      renderPhaseKnowledge: "none",
    },
    stormFront: {
      mode: "prepared-deterministic-route",
      updateCadence: "host-fixed-tick",
      rain: {
        surfaceRoute: "additive-spectral-ripples",
        secondaryParticleConsumerId: "spray-droplet-mist",
        maximumCandidateCount: 8_192,
      },
      stormAerosol: {
        secondaryParticleConsumerId: "spray-droplet-mist",
        maximumCandidateCount: 8_192,
      },
      cloudAndLightning: {
        illuminationRoute: "coherent-glint-foam-reflection-atmosphere",
        atmosphereStageId: "storm-atmosphere",
      },
      diagnostics: {
        resolutionPolicy: "drawing-buffer-exact",
        format: "rgba16float",
        samples: 0,
      },
    },
    postTraaComposition: {
      width: 320,
      height: 180,
      stages: [
        { id: "secondary-particles", after: "traa" },
        { id: "storm-atmosphere", after: "secondary-particles" },
        { id: "lens-wetness", after: "storm-atmosphere" },
      ],
      accumulationFormat: "rgba16float",
      finalColorFormat: "rgba8unorm-srgb",
    },
  },
  gameplay: {
    maxAttachedBodies: MAX_ATTACHED_BODIES,
    maxQueryPointsPerTick: MAX_GAMEPLAY_QUERY_POINTS,
    maxActiveDisturbances: MAX_ACTIVE_DISTURBANCES,
    maxActiveHeroBreakers: MAX_ACTIVE_HERO_BREAKERS,
    interactionField: {
      radiusMetres: 48,
      edgeFadeMetres: 8,
      maxSnapshotAgeTicks: 1,
      disturbanceKinds: ["radial-impact", "directional-wake", "hero-breaker"],
    },
    bodyInteraction: {
      fixedTickHz: 60,
      maxShapeSamplesPerBody: 32,
      maxConvexHullVertices: 64,
      maxSocketsPerBody: 8,
      shapeKinds: ["sphere", "box", "capsule", "convex-hull", "compound"],
      socketKinds: ["bow", "stern", "propeller", "wake", "interaction-anchor"],
      generatedDisturbanceKinds: ["directional-wake", "propeller-wash"],
    },
  },
};

describe("QA Core identity", () => {
  it("retains actual PrewarmManifest identity fields, temporal policy, and declarations", () => {
    const receipt = createBoundCoreDiagnosticsPrewarmReceipt(
      CORE,
      null,
      READY_CAPABILITIES,
    );
    expect(receipt.core).toEqual(createQaBoundCoreManifestIdentity(CORE));
    expect(receipt.core.qualityProfile.temporal).toEqual(
      CORE.qualityProfile.temporal,
    );
    expect(receipt.core.drawingBuffer).toEqual({ width: 320, height: 180 });
    expect(receipt.core.environmentReflection).toEqual(
      CORE.environmentReflection,
    );
    expect(receipt.core.effectVariants).toEqual(CORE.effectVariants);
    expect(
      receipt.core.declarations.map((declaration) => declaration.id),
    ).toEqual(CORE.declarations.map((declaration) => declaration.id));
    expect(receipt.capabilities).toEqual(READY_CAPABILITIES);
  });

  it("deep-clones and freezes the validated candidate instead of returning rebuilt expected", () => {
    const identity = createQaBoundCoreManifestIdentity(CORE);
    const declarations = identity.declarations.map((declaration) => ({
      id: declaration.id,
      kind: declaration.kind,
      label: declaration.label,
      fingerprint: declaration.fingerprint,
    }));
    const frozen = readQaBoundCoreManifestIdentity({
      ...identity,
      declarations,
    });
    const first = declarations[0] as { label: string } | undefined;
    if (first === undefined) {
      throw new Error("expected a declaration");
    }
    first.label = "tampered-after-read";
    expect(frozen.declarations[0]?.label).toBe(identity.declarations[0]?.label);
    expect(frozen.declarations[0]?.label).not.toBe("tampered-after-read");
    expect(() => {
      (frozen.qualityProfile as { id: string }).id = "mutated";
    }).toThrow();
  });

  it("rejects a Core identity whose hash disagrees with profile and drawing buffer", () => {
    const identity = createQaBoundCoreManifestIdentity(CORE);
    expect(() =>
      coreManifestEvidence({
        ...identity,
        manifestHash:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      }),
    ).toThrowError(/manifestHash|drawingBuffer|qualityProfile|Core evidence/i);
  });

  it("rejects a Core identity whose drawing buffer disagrees with the hash", () => {
    const identity = createQaBoundCoreManifestIdentity(CORE);
    expect(() =>
      coreManifestEvidence({
        ...identity,
        drawingBuffer: { width: 640, height: 360 },
      }),
    ).toThrowError(/drawingBuffer|manifestHash|Core evidence/i);
  });

  it("rejects a free hash combined with the module-default identity", () => {
    expect(() =>
      coreManifestEvidence({
        schema: CORE.schema,
        version: CORE.version,
        id: CORE.id,
        manifestHash: CORE.manifestHash,
        qualityProfile: {
          schema: CORE.qualityProfile.schema,
          version: CORE.qualityProfile.version,
          id: CORE.qualityProfile.id,
          profileHash: CORE.qualityProfile.profileHash,
        },
        drawingBuffer: CORE.drawingBuffer,
        environmentReflection: CORE.environmentReflection,
        effectVariants: CORE.effectVariants,
        declarations: CORE.declarations,
      } as never),
    ).toThrowError(/temporal/i);
  });

  it("fail-closes a tampered declaration kind instead of canonicalizing it", () => {
    const identity = createQaBoundCoreManifestIdentity(CORE);
    const first = identity.declarations[0];
    if (first === undefined) {
      throw new Error("expected a declaration");
    }
    const tamperedKind =
      first.kind === "resource" ? "effect-state" : "resource";
    expect(() =>
      readQaBoundCoreManifestIdentity({
        ...identity,
        declarations: identity.declarations.map((declaration, index) =>
          index === 0 ? { ...declaration, kind: tamperedKind } : declaration,
        ),
      }),
    ).toThrowError(/Core evidence disagrees/i);
  });

  it("fail-closes a tampered declaration label instead of canonicalizing it", () => {
    const identity = createQaBoundCoreManifestIdentity(CORE);
    expect(() =>
      readQaBoundCoreManifestIdentity({
        ...identity,
        declarations: identity.declarations.map((declaration, index) =>
          index === 0
            ? { ...declaration, label: "tampered-label" }
            : declaration,
        ),
      }),
    ).toThrowError(/Core evidence disagrees/i);
  });

  it("fail-closes a tampered quality-profile schema instead of canonicalizing it", () => {
    const identity = createQaBoundCoreManifestIdentity(CORE);
    expect(() =>
      readQaBoundCoreManifestIdentity({
        ...identity,
        qualityProfile: {
          ...identity.qualityProfile,
          schema: "real-water/quality-profile-tampered",
        },
      }),
    ).toThrowError(/Core evidence disagrees/i);
  });

  it("fail-closes a tampered quality-profile version instead of canonicalizing it", () => {
    const identity = createQaBoundCoreManifestIdentity(CORE);
    expect(() =>
      readQaBoundCoreManifestIdentity({
        ...identity,
        qualityProfile: {
          ...identity.qualityProfile,
          version: identity.qualityProfile.version + 1,
        },
      }),
    ).toThrowError(/Core evidence disagrees/i);
  });
});

describe("Ready capabilities", () => {
  it("records the actual lease temporal fields including motionFormat and stockThreeRevision", () => {
    const temporal = readReadyCapabilities(
      READY_CAPABILITIES,
      CORE.qualityProfile,
      CORE.drawingBuffer,
    ).rendering.temporal;
    expect(temporal).toEqual({
      ...NATIVE_REGRESSION_TEMPORAL_POLICY,
      motionFormat: "rg16float",
      stockThreeRevision: "185",
    });
  });

  it("cross-checks shared temporal fields against the Quality Profile", () => {
    expect(() =>
      readReadyCapabilities(
        {
          ...READY_CAPABILITIES,
          rendering: {
            ...READY_CAPABILITIES.rendering,
            temporal: {
              ...READY_CAPABILITIES.rendering.temporal,
              taau: true,
            },
          },
        },
        CORE.qualityProfile,
        CORE.drawingBuffer,
      ),
    ).toThrowError(/Quality Profile temporal/i);
  });

  it("rejects a Hero Breaker capacity that disagrees with Core", () => {
    expect(() =>
      readReadyCapabilities(
        {
          ...READY_CAPABILITIES,
          gameplay: {
            ...READY_CAPABILITIES.gameplay,
            maxActiveHeroBreakers: 7,
          },
        } as unknown,
        CORE.qualityProfile,
        CORE.drawingBuffer,
      ),
    ).toThrowError(/maxActiveHeroBreakers/i);
  });

  it("rejects an interaction field without the Hero Breaker disturbance kind", () => {
    expect(() =>
      readReadyCapabilities(
        {
          ...READY_CAPABILITIES,
          gameplay: {
            ...READY_CAPABILITIES.gameplay,
            interactionField: {
              ...READY_CAPABILITIES.gameplay.interactionField,
              disturbanceKinds: ["radial-impact", "directional-wake"],
            },
          },
        } as unknown,
        CORE.qualityProfile,
        CORE.drawingBuffer,
      ),
    ).toThrowError(/interactionField/i);
  });

  it("rejects planar dimensions that disagree with the Core drawing buffer", () => {
    expect(() =>
      readReadyCapabilities(
        {
          ...READY_CAPABILITIES,
          rendering: {
            ...READY_CAPABILITIES.rendering,
            reflection: {
              ...READY_CAPABILITIES.rendering.reflection,
              planar: {
                ...READY_CAPABILITIES.rendering.reflection.planar,
                width: 384,
                height: 216,
              },
            },
          },
        },
        CORE.qualityProfile,
        CORE.drawingBuffer,
      ),
    ).toThrowError(/drawing buffer/i);
  });

  it("rejects a reflection layer that disagrees with the Quality Profile", () => {
    expect(() =>
      readReadyCapabilities(
        {
          ...READY_CAPABILITIES,
          rendering: {
            ...READY_CAPABILITIES.rendering,
            reflection: {
              ...READY_CAPABILITIES.rendering.reflection,
              planar: {
                ...READY_CAPABILITIES.rendering.reflection.planar,
                samples: 4,
              },
            },
          },
        },
        CORE.qualityProfile,
        CORE.drawingBuffer,
      ),
    ).toThrowError(/Quality Profile reflection/i);
  });

  it("rejects a reflection format that disagrees with the Quality Profile", () => {
    expect(() =>
      readReadyCapabilities(
        {
          ...READY_CAPABILITIES,
          rendering: {
            ...READY_CAPABILITIES.rendering,
            reflection: {
              ...READY_CAPABILITIES.rendering.reflection,
              planar: {
                ...READY_CAPABILITIES.rendering.reflection.planar,
                format: "rgba16float",
              },
            },
          },
        } as unknown,
        CORE.qualityProfile,
        CORE.drawingBuffer,
      ),
    ).toThrowError(/Quality Profile reflection/i);
  });

  it("rejects current-frame SSR history=true", () => {
    expect(() =>
      readReadyCapabilities(
        {
          ...READY_CAPABILITIES,
          rendering: {
            ...READY_CAPABILITIES.rendering,
            reflection: {
              ...READY_CAPABILITIES.rendering.reflection,
              ssr: {
                ...READY_CAPABILITIES.rendering.reflection.ssr,
                history: true,
              },
            },
          },
        } as unknown,
        CORE.qualityProfile,
        CORE.drawingBuffer,
      ),
    ).toThrowError(/history/i);
  });

  it("rejects an environment source that disagrees with the Quality Profile", () => {
    expect(() =>
      readReadyCapabilities(
        {
          ...READY_CAPABILITIES,
          rendering: {
            ...READY_CAPABILITIES.rendering,
            reflection: {
              ...READY_CAPABILITIES.rendering.reflection,
              environment: { source: "scene-environment" },
            },
          },
        } as unknown,
        CORE.qualityProfile,
        CORE.drawingBuffer,
      ),
    ).toThrowError(/host-adapter/i);
  });

  it("rejects a consumer pressure-reentry policy that disagrees with the Quality Profile", () => {
    expect(() =>
      readReadyCapabilities(
        {
          ...READY_CAPABILITIES,
          rendering: {
            ...READY_CAPABILITIES.rendering,
            secondaryParticles: {
              ...READY_CAPABILITIES.rendering.secondaryParticles,
              consumers:
                READY_CAPABILITIES.rendering.secondaryParticles.consumers.map(
                  (consumer, index) =>
                    index === 3
                      ? {
                          ...consumer,
                          pressureReentryPolicy: "after-shared-cooldown",
                        }
                      : consumer,
                ),
            },
          },
        } as unknown,
        CORE.qualityProfile,
        CORE.drawingBuffer,
      ),
    ).toThrowError(/consumer capabilities/i);
  });
});

describe("Regression drawing-buffer agreement", () => {
  it("accepts a matching browser canvas, Core buffer, QA prewarm, and captures", () => {
    expect(() =>
      assertRegressionDrawingBuffersAgree({
        browserCanvas: { width: 320, height: 180 },
        coreDrawingBuffer: CORE.drawingBuffer,
        qaPrewarm: { width: 320, height: 180 },
        captures: [
          { width: 320, height: 180 },
          { width: 320, height: 180 },
        ],
      }),
    ).not.toThrow();
  });

  it("fail-closes a drawing-buffer mismatch", () => {
    expect(() =>
      assertRegressionDrawingBuffersAgree({
        browserCanvas: { width: 320, height: 180 },
        coreDrawingBuffer: { width: 640, height: 360 },
        qaPrewarm: { width: 320, height: 180 },
      }),
    ).toThrowError(/drawing buffer/i);
  });
});

describe("Native temporal policy constant", () => {
  it("pins the shared Quality Profile TRAA fields and not QA-authored lease proof", () => {
    expect(NATIVE_REGRESSION_TEMPORAL_POLICY).toEqual({
      mode: "TRAA",
      renderScale: 1,
      resolutionPolicy: "drawing-buffer-exact",
      taau: false,
      dynamicResolution: false,
      frameGeneration: false,
      msaaSamples: 0,
      updateCadence: "host-present",
    });
    expect(NATIVE_REGRESSION_TEMPORAL_POLICY).not.toHaveProperty(
      "motionFormat",
    );
    expect(NATIVE_REGRESSION_TEMPORAL_POLICY).not.toHaveProperty(
      "stockThreeRevision",
    );
    expect(createMinimalWaterQualityProfile().temporal).toMatchObject(
      NATIVE_REGRESSION_TEMPORAL_POLICY,
    );
  });
});
