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
  it("publishes the thirty-three frozen CPU capture names and shapes only", () => {
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
    ]);
    expect(isDiagnosticsCaptureName("ssr-history")).toBe(false);
    expect(isDiagnosticsCaptureName("ssr-history-color")).toBe(true);
    expect(isDiagnosticsCaptureName("ssr-history-input-color")).toBe(true);
    expect(isDiagnosticsCaptureName("whitecap-generation")).toBe(true);
    expect(isDiagnosticsCaptureName("whitecap-history")).toBe(true);
    expect(isDiagnosticsCaptureName("whitecap-advection")).toBe(true);
    expect(isDiagnosticsCaptureName("whitecap-decay")).toBe(true);
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
        width: 2,
        height: 1,
      }),
    ).toThrowError(/dimensions must match presentation/i);
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
      ],
      compileCount: 1,
      probeCount: 1,
      diagnosticReadbackCount: 1,
      sceneRenderCount: 1,
      waterline: ABOVE_WATERLINE,
      width: 2,
      height: 1,
    };
    expect(readHostDiagnosticsPresentedFrame(valid).width).toBe(2);
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
});
