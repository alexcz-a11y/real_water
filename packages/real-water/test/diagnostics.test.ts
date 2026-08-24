import { describe, expect, it } from "vitest";
import {
  createMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createStaticHostEnvironmentAdapter,
  createStaticHostPresentationAdapter,
  createStaticHostSimulationAdapter,
  createSupportedHostEnvironmentReflection,
  prepareRealWater,
  readHostPresentationRoute,
  type HostPresentationRoute,
  type HostPresentedFrame,
  type RealWaterLease,
} from "../src/index.js";
import {
  DIAGNOSTICS_CAPTURE_NAMES,
  DIAGNOSTICS_CAPTURE_SHAPES,
  isDiagnosticsCaptureName,
  readHostDiagnosticsPresentRequest,
  readHostDiagnosticsPresentedFrame,
  readHostDiagnosticsRoute,
  type DiagnosticsCapture,
  type DiagnosticsSecondaryParticles,
} from "../src/diagnostics.js";

const VALID_MANIFEST_HASH = `sha256:${"cd".repeat(32)}`;
const ABOVE_WATERLINE = Object.freeze({
  classification: "above" as const,
  seaLevelMetres: 0,
  surfaceHeightMetres: 0,
  signedDistanceMetres: 1,
  submersion: 0,
  transitionRevision: 0,
  lensWetnessImpulse: false,
});

function createSecondaryParticles(): DiagnosticsSecondaryParticles {
  return {
    capacity: 131_072,
    maximumCandidateCount: 147_456,
    requested: 6,
    retained: 2,
    thinned: 1,
    invisibleOrOccluded: 1,
    reentryCooldown: 1,
    lifecycleReentryForbidden: 1,
    retainedByFloor: 1,
    retainedByGlobalCompetition: 1,
    retainedIncumbents: 0,
    requestedAboveSoftCeiling: 0,
    overSubscribed: true,
    contributionMinimumQ16: 1_024,
    contributionMaximumQ16: 49_152,
    dropReasons: {
      invisibleOrOccluded: 1,
      globalContributionPressure: 1,
      reentryCooldown: 1,
      lifecycleReentryForbidden: 1,
    },
    consumers: [
      {
        consumerId: "spray-droplet-mist",
        maximumRequestCount: 65_536,
        minimumRetainedSlots: 2_048,
        softRequestCeiling: 32_768,
        pressureReentryPolicy: "after-shared-cooldown",
        requested: 6,
        retained: 2,
        thinned: 1,
        invisibleOrOccluded: 1,
        reentryCooldown: 1,
        lifecycleReentryForbidden: 1,
        retainedByFloor: 1,
        retainedByGlobalCompetition: 1,
        retainedIncumbents: 0,
        requestedAboveSoftCeiling: 0,
        overSubscribed: false,
        contributionMinimumQ16: 1_024,
        contributionMaximumQ16: 49_152,
        dropReasons: {
          invisibleOrOccluded: 1,
          globalContributionPressure: 1,
          reentryCooldown: 1,
          lifecycleReentryForbidden: 1,
        },
      },
      ...[
        {
          consumerId: "underwater-suspended-particles" as const,
          maximumRequestCount: 49_152,
          minimumRetainedSlots: 2_048,
          softRequestCeiling: 24_576,
          pressureReentryPolicy: "after-shared-cooldown" as const,
        },
        {
          consumerId: "subsurface-foam-bubble-cloud" as const,
          maximumRequestCount: 24_576,
          minimumRetainedSlots: 1_024,
          softRequestCeiling: 12_288,
          pressureReentryPolicy: "after-shared-cooldown" as const,
        },
        {
          consumerId: "rising-bubbles" as const,
          maximumRequestCount: 8_192,
          minimumRetainedSlots: 256,
          softRequestCeiling: 4_096,
          pressureReentryPolicy: "forbidden-until-absent" as const,
        },
      ].map((plan) => ({
        ...plan,
        requested: 0,
        retained: 0,
        thinned: 0,
        invisibleOrOccluded: 0,
        reentryCooldown: 0,
        lifecycleReentryForbidden: 0,
        retainedByFloor: 0,
        retainedByGlobalCompetition: 0,
        retainedIncumbents: 0,
        requestedAboveSoftCeiling: 0,
        overSubscribed: false,
        contributionMinimumQ16: null,
        contributionMaximumQ16: null,
        dropReasons: {
          invisibleOrOccluded: 0,
          globalContributionPressure: 0,
          reentryCooldown: 0,
          lifecycleReentryForbidden: 0,
        },
      })),
    ],
  } as DiagnosticsSecondaryParticles;
}

function createPresentedFrame(): HostPresentedFrame {
  return {
    presentationId: 1,
    manifestHash: VALID_MANIFEST_HASH,
    seed: 0,
    tick: 0,
    timeSeconds: 0,
    simulationResetRevision: 0,
    controlRevision: 0,
    originRevision: 0,
    cameraCutRevision: 0,
    seaStateCutRevision: 0,
    temporal: {
      historyEpoch: 1,
      resetReason: null,
      resetFrame: false,
    },
  };
}

describe("real-water/diagnostics", () => {
  it("publishes the forty-one frozen CPU capture names and shapes only", () => {
    expect(DIAGNOSTICS_CAPTURE_NAMES).toEqual([
      "final-color",
      "current-color",
      "depth",
      "normal",
      "motion-vector",
      "whitecap-generation",
      "whitecap-history",
      "whitecap-advection",
      "whitecap-decay",
      "foam-source-identity",
      "waterline",
      "history-rejection",
      "optical-fresnel",
      "optical-thickness",
      "optical-scattering",
      "optical-environment-reflection",
      "optical-crest-transmission",
      "optical-transmittance",
      "optical-glint",
      "underwater-transmittance",
      "underwater-scattering",
      "underwater-light-shafts",
      "underwater-shadow",
      "underwater-caustics",
      "underwater-particles",
      "underwater-bubbles",
      "lens-wetness",
      "planar-color",
      "planar-target-alpha",
      "ssr-hit",
      "ssr-confidence",
      "ssr-color",
      "ssr-roughness",
      "reflection-base-color",
      "ssr-composite-color",
      "ssr-history-color",
      "ssr-history-frame-weight",
      "ssr-history-input-color",
      "secondary-particle-contribution",
      "secondary-particle-overdraw",
      "hero-breaker-foam",
    ]);
    expect(isDiagnosticsCaptureName("ssr-history")).toBe(false);
    expect(isDiagnosticsCaptureName("ssr-history-color")).toBe(true);
    expect(isDiagnosticsCaptureName("ssr-history-input-color")).toBe(true);
    expect(isDiagnosticsCaptureName("whitecap-generation")).toBe(true);
    expect(isDiagnosticsCaptureName("whitecap-history")).toBe(true);
    expect(isDiagnosticsCaptureName("whitecap-advection")).toBe(true);
    expect(isDiagnosticsCaptureName("whitecap-decay")).toBe(true);
    expect(isDiagnosticsCaptureName("foam-source-identity")).toBe(true);
    for (const name of [
      "whitecap-generation",
      "whitecap-history",
      "whitecap-advection",
      "whitecap-decay",
    ] as const) {
      expect(DIAGNOSTICS_CAPTURE_SHAPES[name]).toEqual({
        format: "r32float-whitecap-stage",
        elementType: "float32",
        components: 1,
      });
    }
    expect(DIAGNOSTICS_CAPTURE_SHAPES["foam-source-identity"]).toEqual({
      format: "rgba32float-foam-source-identity",
      elementType: "float32",
      components: 4,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES["ssr-hit"]).toEqual({
      format: "r32float-optical",
      elementType: "float32",
      components: 1,
    });
    for (const name of [
      "underwater-transmittance",
      "underwater-scattering",
      "underwater-light-shafts",
      "underwater-shadow",
    ] as const) {
      expect(DIAGNOSTICS_CAPTURE_SHAPES[name]).toEqual({
        format: "r32float-underwater-volume",
        elementType: "float32",
        components: 1,
      });
      expect(isDiagnosticsCaptureName(name)).toBe(true);
    }
    expect(DIAGNOSTICS_CAPTURE_SHAPES["underwater-caustics"]).toEqual({
      format: "r32float-underwater-caustics",
      elementType: "float32",
      components: 1,
    });
    expect(isDiagnosticsCaptureName("underwater-caustics")).toBe(true);
    for (const [name, format] of [
      ["underwater-particles", "r32float-underwater-particles"],
      ["underwater-bubbles", "r32float-underwater-bubbles"],
      ["lens-wetness", "r32float-lens-wetness"],
    ] as const) {
      expect(DIAGNOSTICS_CAPTURE_SHAPES[name]).toEqual({
        format,
        elementType: "float32",
        components: 1,
      });
      expect(isDiagnosticsCaptureName(name)).toBe(true);
    }
    expect(DIAGNOSTICS_CAPTURE_SHAPES["ssr-confidence"]).toEqual({
      format: "r32float-optical",
      elementType: "float32",
      components: 1,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES["ssr-color"]).toEqual({
      format: "rgb32float-linear-ssr",
      elementType: "float32",
      components: 3,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES["ssr-roughness"]).toEqual({
      format: "r32float-ssr-roughness",
      elementType: "float32",
      components: 1,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES["reflection-base-color"]).toEqual({
      format: "rgb32float-linear-reflection-base",
      elementType: "float32",
      components: 3,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES["ssr-composite-color"]).toEqual({
      format: "rgb32float-linear-ssr-composite",
      elementType: "float32",
      components: 3,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES["ssr-history-color"]).toEqual({
      format: "rgb32float-linear-ssr-history",
      elementType: "float32",
      components: 3,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES["ssr-history-frame-weight"]).toEqual({
      format: "r32float-ssr-history-frame-weight",
      elementType: "float32",
      components: 1,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES["ssr-history-input-color"]).toEqual({
      format: "rgb32float-linear-ssr-history-input",
      elementType: "float32",
      components: 3,
    });
    expect(
      DIAGNOSTICS_CAPTURE_SHAPES["secondary-particle-contribution"],
    ).toEqual({
      format: "r32float-secondary-particle-contribution",
      elementType: "float32",
      components: 1,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES["secondary-particle-overdraw"]).toEqual({
      format: "r32float-secondary-particle-overdraw",
      elementType: "float32",
      components: 1,
    });
    expect(isDiagnosticsCaptureName("secondary-particle-contribution")).toBe(
      true,
    );
    expect(isDiagnosticsCaptureName("secondary-particle-overdraw")).toBe(true);
    expect(DIAGNOSTICS_CAPTURE_SHAPES["hero-breaker-foam"]).toEqual({
      format: "r32float-hero-breaker-foam",
      elementType: "float32",
      components: 1,
    });
    expect(isDiagnosticsCaptureName("hero-breaker-foam")).toBe(true);
    expect(Object.isFrozen(DIAGNOSTICS_CAPTURE_NAMES)).toBe(true);
    expect(Object.isFrozen(DIAGNOSTICS_CAPTURE_SHAPES)).toBe(true);
    expect(DIAGNOSTICS_CAPTURE_SHAPES["final-color"]).toEqual({
      format: "rgba8unorm-srgb",
      elementType: "uint8",
      components: 4,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES.depth).toEqual({
      format: "r32float-linear-view",
      elementType: "float32",
      components: 1,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES.normal).toEqual({
      format: "rgb32float-view-normal",
      elementType: "float32",
      components: 3,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES["motion-vector"]).toEqual({
      format: "rg32float-ndc",
      elementType: "float32",
      components: 2,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES.waterline).toEqual({
      format: "r32float-waterline-coverage",
      elementType: "float32",
      components: 1,
    });
    expect(DIAGNOSTICS_CAPTURE_SHAPES["history-rejection"]).toEqual({
      format: "r32float-history-rejection",
      elementType: "float32",
      components: 1,
    });
    expect(isDiagnosticsCaptureName("waterline")).toBe(true);
    expect(isDiagnosticsCaptureName("history-rejection")).toBe(true);
    expect(isDiagnosticsCaptureName("optical-glint")).toBe(true);
    expect(isDiagnosticsCaptureName("velocity")).toBe(false);
    expect(Object.keys(DIAGNOSTICS_CAPTURE_SHAPES)).toEqual([
      ...DIAGNOSTICS_CAPTURE_NAMES,
    ]);
  });

  it("is not re-exported from the root runtime Interface", async () => {
    const root = await import("../src/index.js");
    expect(root).not.toHaveProperty("DIAGNOSTICS_CAPTURE_NAMES");
    expect(root).not.toHaveProperty("DIAGNOSTICS_CAPTURE_SHAPES");
    expect(root).not.toHaveProperty("readHostDiagnosticsRoute");
    expect(root).not.toHaveProperty("readHostDiagnosticsPresentRequest");
    expect(root).not.toHaveProperty("HostDiagnosticsRoute");
  });

  it("keeps the root route exact {present} and rejects routes without diagnostics", () => {
    const route = Object.freeze({
      present: async () => createPresentedFrame(),
    }) satisfies HostPresentationRoute;
    expect(readHostPresentationRoute(route)).toBe(route);
    expect(Object.keys(route)).toEqual(["present"]);
    expect(() => readHostDiagnosticsRoute(route)).toThrowError(
      /diagnostics implementation/i,
    );
  });

  it("does not leak present() or captures onto a Memory-host lease", async () => {
    const environment = createStaticHostEnvironmentAdapter(
      createSupportedHostEnvironmentReflection(),
      {
        sunDirectionX: 0.32,
        sunDirectionY: 0.84,
        sunDirectionZ: 0.44,
        sunColorR: 1,
        sunColorG: 0.96,
        sunColorB: 0.82,
        sunIntensity: 1,
        environmentIntensity: 1,
        sunAngularRadiusRadians: 0.069,
      },
    );
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: createStaticHostSimulationAdapter(),
        environment,
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    });
    const lease: RealWaterLease = await run.ready;
    expect(lease).not.toHaveProperty("present");
    expect(lease).not.toHaveProperty("captures");
    expect(lease).not.toHaveProperty("outputs");
    await lease.dispose();
  });

  it("fail-closes duplicate and unknown diagnostics outputs", () => {
    expect(() =>
      readHostDiagnosticsPresentRequest({
        outputs: ["final-color", "final-color"],
      }),
    ).toThrowError(/unique/i);
    expect(() =>
      readHostDiagnosticsPresentRequest({
        outputs: ["velocity" as never],
      }),
    ).toThrowError(/Unsupported Host diagnostics output/i);
    expect(() =>
      readHostDiagnosticsPresentRequest({
        outputs: ["final-color"],
        extra: true,
      } as never),
    ).toThrowError(/exact outputs key/i);
    expect(() =>
      readHostDiagnosticsPresentRequest({
        outputs: ["depth", "normal"],
        resetHistory: true,
      } as never),
    ).toThrowError(/exact outputs key/i);
    expect(
      readHostDiagnosticsPresentRequest({
        outputs: ["depth", "normal"],
      }),
    ).toEqual({
      outputs: ["depth", "normal"],
    });
  });

  it("fail-closes diagnostics frames whose outputs disagree on dimensions", () => {
    const receipt = createPresentedFrame();
    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...receipt,
        outputs: [
          {
            name: "final-color",
            format: "rgba8unorm-srgb",
            width: 2,
            height: 1,
            origin: "top-left",
            data: new Uint8Array(8),
          },
          {
            name: "depth",
            format: "r32float-linear-view",
            width: 1,
            height: 1,
            origin: "top-left",
            data: new Float32Array(1),
          },
        ],
        compileCount: 1,
        probeCount: 1,
        diagnosticReadbackCount: 2,
        sceneRenderCount: 1,
        waterline: ABOVE_WATERLINE,
        secondaryParticles: createSecondaryParticles(),
        width: 2,
        height: 1,
      }),
    ).toThrowError(/dimensions must match presentation/i);
  });

  it("accepts a required frozen exact secondary-particle receipt and scalar captures", () => {
    const accepted = readHostDiagnosticsPresentedFrame({
      ...createPresentedFrame(),
      outputs: [
        {
          name: "secondary-particle-contribution",
          format: "r32float-secondary-particle-contribution",
          width: 2,
          height: 1,
          origin: "top-left",
          data: Float32Array.of(0.25, 0.75),
        },
        {
          name: "secondary-particle-overdraw",
          format: "r32float-secondary-particle-overdraw",
          width: 2,
          height: 1,
          origin: "top-left",
          data: Float32Array.of(1, 2),
        },
      ],
      compileCount: 1,
      probeCount: 1,
      diagnosticReadbackCount: 2,
      sceneRenderCount: 1,
      waterline: ABOVE_WATERLINE,
      secondaryParticles: createSecondaryParticles(),
      width: 2,
      height: 1,
    });

    expect(Object.isFrozen(accepted)).toBe(true);
    expect(Object.isFrozen(accepted.outputs[0])).toBe(true);
    expect(Object.isFrozen(accepted.secondaryParticles)).toBe(true);
    expect(Object.keys(accepted.secondaryParticles ?? {})).toEqual([
      "capacity",
      "maximumCandidateCount",
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
      "overSubscribed",
      "contributionMinimumQ16",
      "contributionMaximumQ16",
      "dropReasons",
      "consumers",
    ]);
    expect(Object.isFrozen(accepted.secondaryParticles?.dropReasons)).toBe(
      true,
    );
    expect(Object.isFrozen(accepted.secondaryParticles?.consumers)).toBe(true);
    expect(Object.isFrozen(accepted.secondaryParticles?.consumers[0])).toBe(
      true,
    );
    expect(
      Object.isFrozen(accepted.secondaryParticles?.consumers[0]?.dropReasons),
    ).toBe(true);
    expect(
      Object.keys(accepted.secondaryParticles?.consumers[0] ?? {}),
    ).toEqual([
      "consumerId",
      "maximumRequestCount",
      "minimumRetainedSlots",
      "softRequestCeiling",
      "pressureReentryPolicy",
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
      "overSubscribed",
      "contributionMinimumQ16",
      "contributionMaximumQ16",
      "dropReasons",
    ]);
    expect(
      accepted.secondaryParticles?.consumers.map((consumer) =>
        Reflect.get(consumer, "pressureReentryPolicy"),
      ),
    ).toEqual([
      "after-shared-cooldown",
      "after-shared-cooldown",
      "after-shared-cooldown",
      "forbidden-until-absent",
    ]);
    expect(accepted.secondaryParticles).toMatchObject({
      requested: 6,
      retained: 2,
      thinned: 1,
      contributionMinimumQ16: 1_024,
      contributionMaximumQ16: 49_152,
      dropReasons: {
        invisibleOrOccluded: 1,
        globalContributionPressure: 1,
        reentryCooldown: 1,
        lifecycleReentryForbidden: 1,
      },
    });
    expect(accepted.secondaryParticles?.consumers).toHaveLength(4);
    expect(accepted.secondaryParticles?.consumers[0]).toMatchObject({
      consumerId: "spray-droplet-mist",
      requested: 6,
      retained: 2,
      thinned: 1,
      contributionMinimumQ16: 1_024,
      contributionMaximumQ16: 49_152,
      dropReasons: {
        invisibleOrOccluded: 1,
        globalContributionPressure: 1,
        reentryCooldown: 1,
        lifecycleReentryForbidden: 1,
      },
    });
  });

  it("fail-closes invalid secondary-particle receipts and non-exact captures", () => {
    const secondaryParticles = createSecondaryParticles();
    const base = {
      ...createPresentedFrame(),
      outputs: [],
      compileCount: 1,
      probeCount: 1,
      diagnosticReadbackCount: 0,
      sceneRenderCount: 1,
      waterline: ABOVE_WATERLINE,
      secondaryParticles,
      width: 2,
      height: 1,
    };
    const consumer = secondaryParticles.consumers[0];
    if (consumer === undefined) {
      throw new Error("expected a secondary-particle consumer");
    }
    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...base,
        secondaryParticles: {
          ...secondaryParticles,
          consumers: [
            {
              ...consumer,
              pressureReentryPolicy: "unknown",
            },
            ...secondaryParticles.consumers.slice(1),
          ],
        },
      } as never),
    ).toThrowError(/pressureReentryPolicy.*after-shared-cooldown/i);
    const {
      pressureReentryPolicy: omittedPressureReentryPolicy,
      ...consumerWithoutPressureReentryPolicy
    } = consumer;
    expect(omittedPressureReentryPolicy).toBe("after-shared-cooldown");
    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...base,
        secondaryParticles: {
          ...secondaryParticles,
          consumers: [
            consumerWithoutPressureReentryPolicy,
            ...secondaryParticles.consumers.slice(1),
          ],
        },
      } as never),
    ).toThrowError(/consumer.*exact receipt contract/i);

    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...base,
        secondaryParticles: {
          ...secondaryParticles,
          retained: 3,
        },
      }),
    ).toThrowError(/requested must equal retained/i);
    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...base,
        secondaryParticles: {
          ...secondaryParticles,
          lifecycleReentryForbidden: 0,
        },
      }),
    ).toThrowError(/requested must equal retained/i);
    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...base,
        secondaryParticles: {
          ...secondaryParticles,
          contributionMaximumQ16: 65_536,
        },
      }),
    ).toThrowError(/\[0, 65535\]/i);
    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...base,
        secondaryParticles: {
          ...secondaryParticles,
          consumers: [
            {
              ...consumer,
              requested: -1,
            },
          ],
        },
      }),
    ).toThrowError(/requested.*non-negative safe integer/i);
    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...base,
        secondaryParticles: {
          ...secondaryParticles,
          extra: true,
        },
      } as never),
    ).toThrowError(/secondaryParticles.*exact receipt contract/i);
    const { secondaryParticles: omitted, ...withoutSecondaryParticles } = base;
    expect(omitted).toBe(secondaryParticles);
    expect(() =>
      readHostDiagnosticsPresentedFrame(withoutSecondaryParticles as never),
    ).toThrowError(/exact receipt contract/i);
    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...base,
        outputs: [
          {
            name: "secondary-particle-overdraw",
            format: "r32float-secondary-particle-overdraw",
            width: 2,
            height: 1,
            origin: "top-left",
            data: new Float32Array(2),
            extra: true,
          },
        ],
        diagnosticReadbackCount: 1,
      } as never),
    ).toThrowError(/supported name/i);
  });

  it("fail-closes diagnostics frames with extra keys, wrong format, length, or counters", () => {
    const receipt = createPresentedFrame();
    const valid = {
      ...receipt,
      outputs: [
        {
          name: "final-color" as const,
          format: "rgba8unorm-srgb" as const,
          width: 2,
          height: 1,
          origin: "top-left" as const,
          data: new Uint8Array(8),
        },
        {
          name: "foam-source-identity" as const,
          format: "rgba32float-foam-source-identity" as const,
          width: 2,
          height: 1,
          origin: "top-left" as const,
          // R = spectral, G = wake/wash, B = impact, A = saturating union.
          data: Float32Array.of(0.2, 0.3, 0.4, 0.664, 0, 0, 0, 0),
        },
      ],
      compileCount: 1,
      probeCount: 1,
      diagnosticReadbackCount: 2,
      sceneRenderCount: 1,
      waterline: ABOVE_WATERLINE,
      secondaryParticles: createSecondaryParticles(),
      width: 2,
      height: 1,
    };
    const accepted = readHostDiagnosticsPresentedFrame(valid);
    expect(accepted.width).toBe(2);
    expect(accepted.outputs[1]).toMatchObject({
      name: "foam-source-identity",
      format: "rgba32float-foam-source-identity",
    });
    const firstOutput = valid.outputs[0];
    if (firstOutput === undefined) {
      throw new Error("expected a diagnostics output");
    }
    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...valid,
        extra: true,
      } as never),
    ).toThrowError(/exact receipt contract/i);
    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...valid,
        outputs: [
          {
            ...firstOutput,
            format: "r32float-optical",
            data: new Float32Array(2),
          } as never,
        ],
      }),
    ).toThrowError(/must use format/i);
    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...valid,
        outputs: [
          {
            ...firstOutput,
            data: new Uint8Array(4),
          },
        ],
      }),
    ).toThrowError(/packed Uint8 data/i);
    expect(() =>
      readHostDiagnosticsPresentedFrame({
        ...valid,
        sceneRenderCount: -1,
      }),
    ).toThrowError(/sceneRenderCount/i);
  });

  it("strictly reads the independent finite normalized effect captures", () => {
    const receipt = createPresentedFrame();
    const captures = [
      {
        name: "underwater-caustics",
        format: "r32float-underwater-caustics",
        width: 2,
        height: 1,
        origin: "top-left" as const,
        data: Float32Array.of(0.25, 1),
      },
      {
        name: "underwater-particles",
        format: "r32float-underwater-particles",
        width: 2,
        height: 1,
        origin: "top-left" as const,
        data: Float32Array.of(0.25, 1),
      },
      {
        name: "underwater-bubbles",
        format: "r32float-underwater-bubbles",
        width: 2,
        height: 1,
        origin: "top-left" as const,
        data: Float32Array.of(0.25, 1),
      },
      {
        name: "lens-wetness",
        format: "r32float-lens-wetness",
        width: 2,
        height: 1,
        origin: "top-left" as const,
        data: Float32Array.of(0.25, 1),
      },
      {
        name: "hero-breaker-foam",
        format: "r32float-hero-breaker-foam",
        width: 2,
        height: 1,
        origin: "top-left" as const,
        data: Float32Array.of(0.25, 1),
      },
    ] as const satisfies readonly DiagnosticsCapture[];
    for (const capture of captures) {
      const { name, format } = capture;
      const valid = {
        ...receipt,
        outputs: [capture],
        compileCount: 1,
        probeCount: 1,
        diagnosticReadbackCount: 1,
        sceneRenderCount: 1,
        waterline: ABOVE_WATERLINE,
        secondaryParticles: createSecondaryParticles(),
        width: 2,
        height: 1,
      };

      const accepted = readHostDiagnosticsPresentedFrame(valid);
      expect(accepted.outputs[0]).toMatchObject({
        name,
        format,
        data: Float32Array.of(0.25, 1),
      });
      expect(() =>
        readHostDiagnosticsPresentedFrame({
          ...valid,
          outputs: [{ ...capture, extra: true } as never],
        }),
      ).toThrowError(
        new RegExp(
          `${name}.*exact name, format, width, height, origin, and data keys`,
          "i",
        ),
      );
      expect(() =>
        readHostDiagnosticsPresentedFrame({
          ...valid,
          outputs: [
            {
              ...capture,
              format: "r32float-underwater-volume",
            } as never,
          ],
        }),
      ).toThrowError(new RegExp(`${name}.*${format}`, "i"));
      for (const invalid of [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        -0.01,
        1.01,
      ]) {
        expect(() =>
          readHostDiagnosticsPresentedFrame({
            ...valid,
            outputs: [
              {
                ...capture,
                data: Float32Array.of(0.25, invalid),
              },
            ],
          }),
        ).toThrowError(
          new RegExp(`${name}.*finite normalized scalar data`, "i"),
        );
      }
      expect(() =>
        readHostDiagnosticsPresentedFrame({
          ...valid,
          outputs: [
            {
              ...capture,
              data: new Uint8Array(2),
            } as never,
          ],
        }),
      ).toThrowError(new RegExp(`${name}.*packed Float32 data`, "i"));
    }
  });
});
