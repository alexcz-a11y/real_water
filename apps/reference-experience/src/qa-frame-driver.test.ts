import { describe, expect, it } from "vitest";
import {
  createMinimalWaterPrewarmManifest,
  MAX_ATTACHED_BODIES,
  MAX_ACTIVE_DISTURBANCES,
  MAX_GAMEPLAY_QUERY_POINTS,
  type PrewarmManifest,
  type RealWaterCapabilities,
} from "real-water";
import type {
  HostDiagnosticsPresentRequest,
  HostDiagnosticsPresentedFrame,
  HostDiagnosticsRoute,
} from "real-water/diagnostics";
import {
  QA_FRAME_PREWARM_MANIFEST,
  QA_TO_CORE_DECLARATION_IDS,
  createBoundCoreDiagnosticsPrewarmReceipt,
  createQaFrameDriver,
} from "./qa-frame-driver.js";
import { createQaBoundCoreManifestIdentity } from "./qa-bound-core-identity.js";
import { createQaHostSimulationController } from "./qa-simulation-controller.js";

const CORE_MANIFEST = createMinimalWaterPrewarmManifest();
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
    postTraaComposition: {
      width: 320,
      height: 180,
      stages: [
        { id: "secondary-particles", after: "traa" },
        { id: "lens-wetness", after: "secondary-particles" },
      ],
      accumulationFormat: "rgba16float",
      finalColorFormat: "rgba8unorm-srgb",
    },
  },
  gameplay: {
    maxAttachedBodies: MAX_ATTACHED_BODIES,
    maxQueryPointsPerTick: MAX_GAMEPLAY_QUERY_POINTS,
    maxActiveDisturbances: MAX_ACTIVE_DISTURBANCES,
    interactionField: {
      radiusMetres: 48,
      edgeFadeMetres: 8,
      maxSnapshotAgeTicks: 1,
      disturbanceKinds: ["radial-impact", "directional-wake"],
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

function createCapture(
  name: HostDiagnosticsPresentedFrame["outputs"][number]["name"],
  width: number,
  height: number,
): HostDiagnosticsPresentedFrame["outputs"][number] {
  if (
    name === "final-color" ||
    name === "current-color" ||
    name === "planar-color"
  ) {
    return {
      name,
      format: "rgba8unorm-srgb",
      width,
      height,
      origin: "top-left",
      data: new Uint8Array(width * height * 4),
    };
  }
  if (name === "underwater-caustics") {
    return {
      name,
      format: "r32float-underwater-caustics",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  if (name === "underwater-particles") {
    return {
      name,
      format: "r32float-underwater-particles",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  if (name === "underwater-bubbles") {
    return {
      name,
      format: "r32float-underwater-bubbles",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  if (name === "lens-wetness") {
    return {
      name,
      format: "r32float-lens-wetness",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  if (name === "foam-source-identity") {
    return {
      name,
      format: "rgba32float-foam-source-identity",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height * 4),
    };
  }
  if (name === "ssr-color") {
    return {
      name,
      format: "rgb32float-linear-ssr",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height * 3),
    };
  }
  if (name === "reflection-base-color") {
    return {
      name,
      format: "rgb32float-linear-reflection-base",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height * 3),
    };
  }
  if (name === "ssr-composite-color") {
    return {
      name,
      format: "rgb32float-linear-ssr-composite",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height * 3),
    };
  }
  if (name === "ssr-history-color") {
    return {
      name,
      format: "rgb32float-linear-ssr-history",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height * 3),
    };
  }
  if (name === "ssr-history-frame-weight") {
    return {
      name,
      format: "r32float-ssr-history-frame-weight",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  if (name === "ssr-history-input-color") {
    return {
      name,
      format: "rgb32float-linear-ssr-history-input",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height * 3),
    };
  }
  if (name === "ssr-roughness") {
    return {
      name,
      format: "r32float-ssr-roughness",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  if (name === "depth") {
    return {
      name,
      format: "r32float-linear-view",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  if (name === "normal") {
    return {
      name,
      format: "rgb32float-view-normal",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height * 3),
    };
  }
  if (name === "motion-vector") {
    return {
      name,
      format: "rg32float-ndc",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height * 2),
    };
  }
  if (
    name === "whitecap-generation" ||
    name === "whitecap-history" ||
    name === "whitecap-advection" ||
    name === "whitecap-decay"
  ) {
    return {
      name,
      format: "r32float-whitecap-stage",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  if (name === "waterline") {
    return {
      name,
      format: "r32float-waterline-coverage",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  if (name === "history-rejection") {
    return {
      name,
      format: "r32float-history-rejection",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  if (
    name === "underwater-transmittance" ||
    name === "underwater-scattering" ||
    name === "underwater-light-shafts" ||
    name === "underwater-shadow"
  ) {
    return {
      name,
      format: "r32float-underwater-volume",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  if (name === "secondary-particle-contribution") {
    return {
      name,
      format: "r32float-secondary-particle-contribution",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  if (name === "secondary-particle-overdraw") {
    return {
      name,
      format: "r32float-secondary-particle-overdraw",
      width,
      height,
      origin: "top-left",
      data: new Float32Array(width * height),
    };
  }
  return {
    name,
    format: "r32float-optical",
    width,
    height,
    origin: "top-left",
    data: new Float32Array(width * height),
  };
}

function createFakeDiagnostics(
  present: (
    request: HostDiagnosticsPresentRequest,
    state: ReturnType<
      ReturnType<typeof createQaHostSimulationController>["snapshot"]
    >,
  ) => Promise<HostDiagnosticsPresentedFrame> | HostDiagnosticsPresentedFrame,
  simulation: ReturnType<typeof createQaHostSimulationController>,
): HostDiagnosticsRoute {
  return {
    async present(request) {
      return present(request, simulation.snapshot());
    },
  };
}

function coreFrame(
  state: ReturnType<
    ReturnType<typeof createQaHostSimulationController>["snapshot"]
  >,
  request: HostDiagnosticsPresentRequest,
  overrides: Partial<HostDiagnosticsPresentedFrame> = {},
): HostDiagnosticsPresentedFrame {
  return {
    presentationId: 1,
    manifestHash: CORE_MANIFEST.manifestHash,
    seed: state.seed,
    tick: state.tick,
    timeSeconds: state.timeSeconds,
    simulationResetRevision: state.simulationResetRevision,
    controlRevision: 0,
    originRevision: 0,
    cameraCutRevision: 0,
    seaStateCutRevision: 0,
    temporal: {
      historyEpoch: 1,
      resetReason: "simulation-reset",
      resetFrame: true,
    },
    waterline: {
      classification: "above",
      seaLevelMetres: 0,
      surfaceHeightMetres: 0,
      signedDistanceMetres: 1,
      submersion: 0,
      transitionRevision: 0,
      lensWetnessImpulse: false,
    },
    secondaryParticles: {
      capacity: 131_072,
      maximumCandidateCount: 147_456,
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
      consumers: [
        {
          consumerId: "spray-droplet-mist",
          maximumRequestCount: 65_536,
          minimumRetainedSlots: 2_048,
          softRequestCeiling: 32_768,
          pressureReentryPolicy: "after-shared-cooldown",
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
        },
        {
          consumerId: "underwater-suspended-particles",
          maximumRequestCount: 49_152,
          minimumRetainedSlots: 2_048,
          softRequestCeiling: 24_576,
          pressureReentryPolicy: "after-shared-cooldown",
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
        },
        {
          consumerId: "subsurface-foam-bubble-cloud",
          maximumRequestCount: 24_576,
          minimumRetainedSlots: 1_024,
          softRequestCeiling: 12_288,
          pressureReentryPolicy: "after-shared-cooldown",
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
        },
        {
          consumerId: "rising-bubbles",
          maximumRequestCount: 8_192,
          minimumRetainedSlots: 256,
          softRequestCeiling: 4_096,
          pressureReentryPolicy: "forbidden-until-absent",
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
        },
      ],
    },
    outputs: request.outputs.map((name) =>
      createCapture(
        name,
        CORE_MANIFEST.drawingBuffer.width,
        CORE_MANIFEST.drawingBuffer.height,
      ),
    ),
    compileCount: 1,
    probeCount: 1,
    diagnosticReadbackCount: request.outputs.length,
    sceneRenderCount: 1,
    width: CORE_MANIFEST.drawingBuffer.width,
    height: CORE_MANIFEST.drawingBuffer.height,
    ...overrides,
  };
}

describe("QA frame driver Core association", () => {
  it("publishes a v14 capture-contract mapped to actual Core declaration IDs", () => {
    expect(QA_FRAME_PREWARM_MANIFEST.version).toBe(14);
    expect(QA_FRAME_PREWARM_MANIFEST.captures).toHaveLength(40);
    expect(QA_FRAME_PREWARM_MANIFEST.coreDeclarations).toEqual(
      QA_TO_CORE_DECLARATION_IDS,
    );
    expect(QA_TO_CORE_DECLARATION_IDS.waterline).toBe(
      "water-optical-factors-target",
    );
    expect(QA_TO_CORE_DECLARATION_IDS["history-rejection"]).toBe(
      "water-history-rejection-target",
    );
    expect(QA_TO_CORE_DECLARATION_IDS["foam-source-identity"]).toBe(
      "water-foam-source-identity-target",
    );
    expect(QA_TO_CORE_DECLARATION_IDS["secondary-particle-contribution"]).toBe(
      "water-secondary-particle-accumulation-target",
    );
    expect(QA_TO_CORE_DECLARATION_IDS["secondary-particle-overdraw"]).toBe(
      "water-secondary-particle-accumulation-target",
    );
    expect(QA_TO_CORE_DECLARATION_IDS["underwater-caustics"]).toBe(
      "water-underwater-caustics-diagnostics-target",
    );
    expect(QA_TO_CORE_DECLARATION_IDS["underwater-particles"]).toBe(
      "water-underwater-suspended-particle-target",
    );
    expect(QA_TO_CORE_DECLARATION_IDS["underwater-bubbles"]).toBe(
      "water-underwater-bubble-target",
    );
    expect(QA_TO_CORE_DECLARATION_IDS["lens-wetness"]).toBe(
      "water-lens-wetness-diagnostics-target",
    );
    expect(QA_FRAME_PREWARM_MANIFEST.captures.slice(23, 27)).toEqual([
      {
        name: "underwater-caustics",
        preparedFormat: "rgba16float-underwater-caustics-diagnostics",
      },
      {
        name: "underwater-particles",
        preparedFormat: "rgba16float-underwater-suspended-particles",
      },
      {
        name: "underwater-bubbles",
        preparedFormat: "rgba16float-underwater-bubbles",
      },
      {
        name: "lens-wetness",
        preparedFormat: "rgba16float-lens-wetness-diagnostics",
      },
    ]);
    expect(QA_FRAME_PREWARM_MANIFEST.captures.slice(9, 12)).toEqual([
      {
        name: "foam-source-identity",
        preparedFormat: "rgba16float-foam-source-identity",
      },
      {
        name: "waterline",
        preparedFormat: "rgba16float-waterline-coverage",
      },
      {
        name: "history-rejection",
        preparedFormat: "rgba8unorm-history-rejection",
      },
    ]);
    expect(JSON.stringify(QA_FRAME_PREWARM_MANIFEST)).not.toMatch(
      /qa-(?:final|current|inverse|view|motion|optical|stock|traa|single|eight|named|main|transform)-/,
    );
    const receipt = createBoundCoreDiagnosticsPrewarmReceipt(
      CORE_MANIFEST,
      null,
      READY_CAPABILITIES,
    );
    expect(receipt.core).toEqual(
      createQaBoundCoreManifestIdentity(CORE_MANIFEST),
    );
    expect(receipt.core.qualityProfile.temporal).toEqual(
      CORE_MANIFEST.qualityProfile.temporal,
    );
    expect(receipt.capabilities).toEqual(READY_CAPABILITIES);
    expect(receipt.capabilities.rendering.temporal.motionFormat).toBe(
      "rg16float",
    );
    expect(receipt.capabilities.rendering.temporal.stockThreeRevision).toBe(
      "185",
    );
    expect(receipt.core.declarations).toHaveLength(
      CORE_MANIFEST.declarations.length,
    );
    expect(receipt.progress.completedDeclarationIds).toEqual([
      "water-final-color-target",
      "water-current-color-target",
      "water-inverse-linear-depth",
      "water-view-normal",
      "water-motion-vectors",
      "water-whitecap-stage-target",
      "water-foam-source-identity-target",
      "water-optical-factors-target",
      "water-history-rejection-target",
      "water-optical-diagnostics-b",
      "water-optical-diagnostics-a",
      "water-underwater-diagnostics-target",
      "water-underwater-caustics-diagnostics-target",
      "water-underwater-suspended-particle-target",
      "water-underwater-bubble-target",
      "water-lens-wetness-diagnostics-target",
      "water-planar-reflection-target",
      "water-ssr-raw-target",
      "water-ssr-composite-target",
      "water-render-target",
      "water-ssr-history-resolved-capture-target",
      "water-ssr-history-beauty-target",
      "water-secondary-particle-accumulation-target",
    ]);
    expect(receipt.progress.completedWork).toBe(23);
    expect(receipt.progress.totalWork).toBe(23);
  });

  it("rejects a Core manifest that is missing a mapped declaration", () => {
    const incomplete = {
      ...CORE_MANIFEST,
      declarations: CORE_MANIFEST.declarations.filter(
        (declaration) => declaration.id !== "water-final-color-target",
      ),
    } as PrewarmManifest;
    expect(() =>
      createBoundCoreDiagnosticsPrewarmReceipt(
        incomplete,
        null,
        READY_CAPABILITIES,
      ),
    ).toThrowError(/water-final-color-target/i);
  });

  it("uses authoritative Core frame fields and fail-closes association mismatches", async () => {
    const simulation = createQaHostSimulationController();
    const prewarm = createBoundCoreDiagnosticsPrewarmReceipt(
      CORE_MANIFEST,
      null,
      READY_CAPABILITIES,
    );
    const driver = createQaFrameDriver({
      diagnostics: createFakeDiagnostics(
        (request, state) => coreFrame(state, request),
        simulation,
      ),
      manifestHash: CORE_MANIFEST.manifestHash,
      simulation,
      prewarm,
    });

    const resetReceipt = await driver.reset({ seed: 0x4000_0000 });
    expect(resetReceipt).toEqual({
      seed: 0x4000_0000,
      tick: 0,
      timeSeconds: 0,
      seaLevelMetres: 0,
      simulationResetRevision: 1,
    });
    const frame = await driver.present({
      advanceFixedTicks: 6,
      captures: [
        "final-color",
        "depth",
        "underwater-caustics",
        "underwater-particles",
        "underwater-bubbles",
        "lens-wetness",
      ],
    });
    expect(frame.seed).toBe(0x4000_0000);
    expect(frame.tick).toBe(6);
    expect(frame.timeSeconds).toBe(6 / 60);
    expect(frame.simulationResetRevision).toBe(1);
    expect(frame.manifestHash).toBe(CORE_MANIFEST.manifestHash);
    expect(frame.waterline).toEqual({
      classification: "above",
      seaLevelMetres: 0,
      surfaceHeightMetres: 0,
      signedDistanceMetres: 1,
      submersion: 0,
      transitionRevision: 0,
      lensWetnessImpulse: false,
    });
    expect(frame.temporal.resetReason).toBe("qa-reset");
    expect(frame.secondaryParticles.lifecycleReentryForbidden).toBe(0);
    expect(frame.secondaryParticles.dropReasons.lifecycleReentryForbidden).toBe(
      0,
    );
    expect(frame.captures.map((capture) => capture.name)).toEqual([
      "final-color",
      "depth",
      "underwater-caustics",
      "underwater-particles",
      "underwater-bubbles",
      "lens-wetness",
    ]);
    expect(frame.captures[2]).toMatchObject({
      name: "underwater-caustics",
      format: "r32float-underwater-caustics",
    });
    expect(frame.captures.slice(3)).toMatchObject([
      {
        name: "underwater-particles",
        format: "r32float-underwater-particles",
      },
      {
        name: "underwater-bubbles",
        format: "r32float-underwater-bubbles",
      },
      { name: "lens-wetness", format: "r32float-lens-wetness" },
    ]);

    const mismatching = createQaFrameDriver({
      diagnostics: createFakeDiagnostics(
        (request, state) =>
          coreFrame(state, request, {
            manifestHash: `sha256:${"ab".repeat(32)}`,
          }),
        simulation,
      ),
      manifestHash: CORE_MANIFEST.manifestHash,
      simulation,
      prewarm,
    });
    await mismatching.reset({ seed: 1 });
    await expect(
      mismatching.present({ advanceFixedTicks: 0, captures: [] }),
    ).rejects.toThrowError(/manifestHash/i);

    const wrongSeed = createQaFrameDriver({
      diagnostics: createFakeDiagnostics(
        (request, state) => coreFrame(state, request, { seed: 99 }),
        simulation,
      ),
      manifestHash: CORE_MANIFEST.manifestHash,
      simulation,
      prewarm,
    });
    await wrongSeed.reset({ seed: 2 });
    await expect(
      wrongSeed.present({ advanceFixedTicks: 0, captures: [] }),
    ).rejects.toThrowError(/simulation state/i);
  });

  it("keeps the domain reset revision after a failed present", async () => {
    const simulation = createQaHostSimulationController();
    const prewarm = createBoundCoreDiagnosticsPrewarmReceipt(
      CORE_MANIFEST,
      null,
      READY_CAPABILITIES,
    );
    let fail = true;
    const driver = createQaFrameDriver({
      diagnostics: createFakeDiagnostics((request, state) => {
        if (fail) {
          fail = false;
          throw new Error("diagnostics present failed");
        }
        return coreFrame(state, request);
      }, simulation),
      manifestHash: CORE_MANIFEST.manifestHash,
      simulation,
      prewarm,
    });

    await driver.reset({ seed: 7 });
    expect(simulation.snapshot().simulationResetRevision).toBe(1);
    await expect(
      driver.present({ advanceFixedTicks: 0, captures: [] }),
    ).rejects.toThrowError(/diagnostics present failed/i);
    expect(simulation.snapshot().simulationResetRevision).toBe(1);
    await expect(
      driver.present({ advanceFixedTicks: 0, captures: [] }),
    ).rejects.toThrowError(/reset/i);
    await driver.reset({ seed: 7 });
    const recovered = await driver.present({
      advanceFixedTicks: 0,
      captures: [],
    });
    expect(simulation.snapshot().tick).toBe(0);
    expect(recovered.simulationResetRevision).toBe(2);
    expect(recovered.temporal.resetReason).toBe("qa-reset");
  });

  it("requires reset after a nonzero-advance diagnostics failure so a retry cannot double-advance", async () => {
    const simulation = createQaHostSimulationController();
    const prewarm = createBoundCoreDiagnosticsPrewarmReceipt(
      CORE_MANIFEST,
      null,
      READY_CAPABILITIES,
    );
    let fail = true;
    const driver = createQaFrameDriver({
      diagnostics: createFakeDiagnostics((request, state) => {
        if (fail) {
          fail = false;
          throw new Error("diagnostics present failed");
        }
        return coreFrame(state, request);
      }, simulation),
      manifestHash: CORE_MANIFEST.manifestHash,
      simulation,
      prewarm,
    });

    await driver.reset({ seed: 9 });
    await expect(
      driver.present({ advanceFixedTicks: 5, captures: ["final-color"] }),
    ).rejects.toThrowError(/diagnostics present failed/i);
    expect(simulation.snapshot().tick).toBe(5);
    await expect(
      driver.present({ advanceFixedTicks: 5, captures: ["final-color"] }),
    ).rejects.toThrowError(/reset/i);
    expect(simulation.snapshot().tick).toBe(5);
    await driver.reset({ seed: 9 });
    expect(simulation.snapshot().tick).toBe(0);
    const recovered = await driver.present({
      advanceFixedTicks: 5,
      captures: ["final-color"],
    });
    expect(recovered.tick).toBe(5);
    expect(simulation.snapshot().tick).toBe(5);
    expect(recovered.simulationResetRevision).toBe(2);
  });

  it("fail-closes malformed Core frames through the public diagnostics reader and then requires reset", async () => {
    const simulation = createQaHostSimulationController();
    const prewarm = createBoundCoreDiagnosticsPrewarmReceipt(
      CORE_MANIFEST,
      null,
      READY_CAPABILITIES,
    );

    const presentMalformed = async (
      label: string,
      mutate: (
        frame: HostDiagnosticsPresentedFrame,
      ) => HostDiagnosticsPresentedFrame,
      pattern: RegExp,
    ): Promise<void> => {
      const driver = createQaFrameDriver({
        diagnostics: createFakeDiagnostics(
          (request, state) => mutate(coreFrame(state, request)),
          simulation,
        ),
        manifestHash: CORE_MANIFEST.manifestHash,
        simulation,
        prewarm,
      });
      await driver.reset({ seed: 3 });
      await expect(
        driver.present({ advanceFixedTicks: 2, captures: ["final-color"] }),
        label,
      ).rejects.toThrowError(pattern);
      expect(simulation.snapshot().tick).toBe(2);
      await expect(
        driver.present({ advanceFixedTicks: 0, captures: ["final-color"] }),
      ).rejects.toThrowError(/reset/i);
    };

    await presentMalformed(
      "extra keys",
      (frame) => ({ ...frame, extra: true }) as never,
      /exact receipt contract/i,
    );
    await presentMalformed(
      "wrong format",
      (frame) => ({
        ...frame,
        outputs: [
          {
            name: "final-color",
            format: "r32float-optical",
            width: frame.width,
            height: frame.height,
            origin: "top-left",
            data: new Float32Array(frame.width * frame.height),
          } as never,
        ],
      }),
      /must use format/i,
    );
    await presentMalformed(
      "wrong length",
      (frame) => ({
        ...frame,
        outputs: [
          {
            name: "final-color",
            format: "rgba8unorm-srgb",
            width: frame.width,
            height: frame.height,
            origin: "top-left",
            data: new Uint8Array(4),
          },
        ],
      }),
      /packed Uint8 data/i,
    );
    await presentMalformed(
      "wrong counter",
      (frame) => ({ ...frame, sceneRenderCount: -1 }),
      /sceneRenderCount/i,
    );
    const orderDriver = createQaFrameDriver({
      diagnostics: createFakeDiagnostics(
        (request, state) =>
          coreFrame(state, request, {
            outputs: (["depth", "final-color"] as const).map((name) =>
              createCapture(
                name,
                CORE_MANIFEST.drawingBuffer.width,
                CORE_MANIFEST.drawingBuffer.height,
              ),
            ),
          }),
        simulation,
      ),
      manifestHash: CORE_MANIFEST.manifestHash,
      simulation,
      prewarm,
    });
    await orderDriver.reset({ seed: 4 });
    await expect(
      orderDriver.present({
        advanceFixedTicks: 2,
        captures: ["final-color", "depth"],
      }),
    ).rejects.toThrowError(/output names/i);
    await expect(
      orderDriver.present({
        advanceFixedTicks: 0,
        captures: ["final-color", "depth"],
      }),
    ).rejects.toThrowError(/reset/i);
  });
});
