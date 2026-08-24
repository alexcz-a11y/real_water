import { describe, expect, it } from "vitest";
import {
  createMinimalWaterPrewarmManifest,
  createWaterPreset,
  MAX_ATTACHED_BODIES,
  MAX_GAMEPLAY_QUERY_POINTS,
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
  type RealWaterCapabilities,
} from "real-water";
import { createBoundCoreDiagnosticsPrewarmReceipt } from "../src/qa-frame-driver.js";
import { REFERENCE_ENVIRONMENT_LIGHTING } from "../src/reference-optical-inputs.js";
import {
  canonicalJson,
  coreManifestEvidence,
  createPresentationFrameEvidence,
  createQaBoundCoreManifestIdentity,
  createTemporalStressEvidence,
  NATIVE_REGRESSION_TEMPORAL_POLICY,
  readPresentationFrameEvidence,
  readRegressionAcceptanceEvidence,
  readTemporalStressEvidence,
  REGRESSION_ACCEPTANCE_EVIDENCE_CLASS,
  REGRESSION_ACCEPTANCE_SCHEMA,
  REGRESSION_ACCEPTANCE_VERSION,
  sha256Buffer,
  sha256CanonicalJson,
  sha256CaptureBytes,
  TEMPORAL_STRESS_JITTER_SEQUENCE,
  TEMPORAL_STRESS_RECIPE_POLICY,
  temporalStressMetricPolicy,
  type TemporalStressEvidenceV1,
  type TemporalStressFrameCaptureInput,
  type TemporalStressPrimeReceipt,
} from "../e2e/regression-acceptance-evidence.js";
import { rendererDeviceFingerprint } from "../e2e/optical-screenshot-profile.js";

const CORE = createMinimalWaterPrewarmManifest();
const SWELL = createWaterPreset("swell");
const WATER_PRESET = {
  schema: SWELL.schema,
  version: SWELL.version,
  id: SWELL.id,
  presetHash: SWELL.presetHash,
} as const;
const HORIZON = {
  projection: "perspective" as const,
  position: [0, 8, 0] as const,
  target: [400, 0, 0] as const,
  up: [0, 1, 0] as const,
  verticalFovDegrees: 50,
  near: 0.5,
  far: 4_000,
};
const FAST_PAN_CAMERA = {
  ...HORIZON,
  target: [400, 0, -60] as const,
};
const BYTES = Buffer.from([1, 2, 3, 4]).toString("base64");
const OTHER_BYTES = Buffer.from([9, 9, 9, 9]).toString("base64");
const DURABLE_PNG_NAME =
  "optical--testid--worker-0--retry-0--horizon-glint-crest.png";
const DURABLE_PNG_PATH = `test-results/regression-acceptance/${DURABLE_PNG_NAME}`;
const PRIME: TemporalStressPrimeReceipt = {
  presentationId: 8,
  tick: 24,
  historyEpoch: 1,
  resetReason: null,
  resetFrame: false,
  simulationResetRevision: 1,
  seed: 0x4000_0000,
  manifestHash: CORE.manifestHash,
  controlRevision: 1,
  cameraCutRevision: 0,
  seaStateCutRevision: 0,
  originRevision: 0,
};
const OFF_PRIME: TemporalStressPrimeReceipt = {
  ...PRIME,
  presentationId: 40,
  simulationResetRevision: 2,
};
const READY_CAPABILITIES: RealWaterCapabilities = {
  rendering: {
    backend: "core-webgpu",
    timestampQuery: false,
    temporal: {
      ...NATIVE_REGRESSION_TEMPORAL_POLICY,
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
          ],
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
      stages: [{ id: "secondary-particles", after: "traa" }],
      accumulationFormat: "rgba16float",
      finalColorFormat: "rgba8unorm-srgb",
    },
  },
  gameplay: {
    maxAttachedBodies: MAX_ATTACHED_BODIES,
    maxQueryPointsPerTick: MAX_GAMEPLAY_QUERY_POINTS,
    maxActiveDisturbances: 128,
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
const DEVICE = {
  features: ["texture-compression-bc"],
  limits: { maxTextureDimension2D: 8192 },
};
const DEVICE_FINGERPRINT = rendererDeviceFingerprint(DEVICE);

function capture(
  overrides: Partial<TemporalStressFrameCaptureInput> = {},
): TemporalStressFrameCaptureInput {
  return {
    tick: 24,
    presentationId: 9,
    manifestHash: CORE.manifestHash,
    seed: 0x4000_0000,
    timeSeconds: 24 / 60,
    cameraRevision: 1,
    cameraCutRevision: 0,
    controlRevision: 1,
    seaStateCutRevision: 0,
    originRevision: 0,
    simulationResetRevision: 1,
    historyEpoch: 1,
    resetReason: null,
    resetFrame: false,
    current: BYTES,
    final: BYTES,
    motion: BYTES,
    depth: BYTES,
    normal: BYTES,
    fresnel: BYTES,
    glint: BYTES,
    ...overrides,
  };
}

function omitShaAndPassed(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => omitShaAndPassed(entry));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const record: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "sha256" || key === "passed") {
      continue;
    }
    record[key] = omitShaAndPassed(entry);
  }
  return record;
}

const FAST_PAN_OBSERVED = {
  maskMin: 256,
  inBoundsRatioMin: 0.4,
  oobWaterMin: 64,
  motionP50Min: 2,
  motionP95Max: 12,
  residualP95Max: 0.05,
  residualP99Max: 0.1,
  disocclusionP99Max: 1,
  disocclusionMax: 1,
  outsideCoverage: 0,
  maxTrail: 0,
  currentResidualP95Min: 0.005,
  finalCurrentResidualRatioMax: 0.9,
  stableDiffCoverage: 0.01,
};

const FAST_PAN_THRESHOLDS = {
  maskMin: 256,
  inBoundsRatioMin: 0.4,
  oobWaterMin: 64,
  motionP50Min: 2,
  motionP95Max: 12,
  residualP95Max: 0.05,
  residualP99Max: 0.1,
  disocclusionP99Max: 1,
  disocclusionMax: 1,
  outsideCoverage: 0,
  maxTrail: 0,
  currentResidualP95Min: 0.005,
  finalCurrentResidualRatioMax: 0.9,
  stableDiffCoverageMin: 0.01,
};

const GLINT_OBSERVED = {
  offGlintMax: 0.005,
  offGlintHot: 0,
  onGlintMax: 0.2,
  offEnergyRatio: 0.01,
  minWaterCount: 256,
  minOutsideWater: 64,
  activeFrames: 12,
  validPeakFrames: 12,
  glintPixelFrames: 128,
  peakRatioP10: 0.7,
  outsideResidualP99: 8,
  outsideCoverage: 0.005,
  validComponentFrames: 32,
  motionQualifiedComponents: 32,
  centroidLagP95: 1.5,
  maxTrail: 2,
  madEligible: 140,
  madValid: 128,
  madValidRatio: 0.85,
  currentMadP75: 1,
  finalMadP75: 0.8,
  finalMadRatio: 0.9,
  commonSource: 1,
};

const GLINT_THRESHOLDS = {
  offGlintMax: 0.005,
  offGlintHot: 0,
  onGlintMaxMin: 0.2,
  offEnergyRatioMax: 0.01,
  minWaterCount: 256,
  minOutsideWater: 64,
  activeFramesMin: 12,
  validPeakFramesMin: 12,
  glintPixelFramesMin: 128,
  peakRatioP10Min: 0.7,
  outsideResidualP99Max: 8,
  outsideCoverageMax: 0.005,
  validComponentFramesMin: 32,
  motionQualifiedComponentsMin: 32,
  centroidLagP95Max: 1.5,
  maxTrail: 2,
  madValidMin: 128,
  madValidRatioMin: 0.85,
  currentMadP75Min: 1,
  finalMadRatioMax: 0.9,
  commonSource: 1,
};

const THIN_OBSERVED = {
  unionCount: 64,
  minFrameThin: 8,
  activeFrames: 8,
  madSamples: 64,
  currentMadP75: 0.5,
  finalMadP75: 0.3,
  finalMadRatio: 0.8,
  ratioSamples: 64,
  gradientRatioMedian: 0.8,
  coverageRetain: 0.85,
  minFrameRetain: 0.85,
  trackedComponents: 4,
  trackedComponentFrames: 8,
  maxConsecutiveMissing: 1,
  differingFrames: 1,
  motionP95Max: 0.05,
  motionMax: 0.15,
};

const THIN_THRESHOLDS = {
  unionMin: 64,
  perFrameMin: 8,
  activeFramesMin: 8,
  madSampleMin: 64,
  currentMadP75Min: 0.5,
  finalMadRatioMax: 0.8,
  ratioSampleMin: 64,
  gradientRatioMedianMin: 0.8,
  coverageRetainMin: 0.85,
  minFrameRetainMin: 0.85,
  tracksMin: 4,
  trackFramesMin: 8,
  maxConsecutiveMissing: 1,
  differingFramesMin: 1,
  motionP95Max: 0.05,
  motionMax: 0.15,
};

function recipeFrames(
  id:
    | "fast-pan-frozen-simulation"
    | "high-frequency-glint-horizon-strafe"
    | "thin-detail-jitter-only-hold",
  startPresentationId: number,
  simulationResetRevision: number,
  motion: string = BYTES,
): TemporalStressFrameCaptureInput[] {
  const recipe = TEMPORAL_STRESS_RECIPE_POLICY[id];
  const moving = id !== "thin-detail-jitter-only-hold";
  return Array.from({ length: recipe.frameCount }, (_, index) =>
    capture({
      tick: recipe.startTick + (index + 1) * recipe.ticksPerFrame,
      timeSeconds: (recipe.startTick + (index + 1) * recipe.ticksPerFrame) / 60,
      presentationId: startPresentationId + index,
      cameraRevision: moving ? 1 + index : 1,
      simulationResetRevision,
      motion,
    }),
  );
}

function recipeCameras(
  id:
    | "fast-pan-frozen-simulation"
    | "high-frequency-glint-horizon-strafe"
    | "thin-detail-jitter-only-hold",
) {
  const recipe = TEMPORAL_STRESS_RECIPE_POLICY[id];
  return Array.from({ length: recipe.frameCount }, (_, index) => {
    if (id === "fast-pan-frozen-simulation") {
      return {
        ...FAST_PAN_CAMERA,
        target: [400, 0, -60 + index * 8] as const,
      };
    }
    if (id === "high-frequency-glint-horizon-strafe") {
      const offsetZ = (index + 1) * 0.25;
      return {
        ...HORIZON,
        position: [0, 8, offsetZ] as const,
        target: [400, 0, offsetZ] as const,
      };
    }
    return HORIZON;
  });
}

function runInput(
  id: "default" | "sun-on" | "sun-off",
  stressId:
    | "fast-pan-frozen-simulation"
    | "high-frequency-glint-horizon-strafe"
    | "thin-detail-jitter-only-hold",
  lighting = REFERENCE_ENVIRONMENT_LIGHTING,
  frames: readonly TemporalStressFrameCaptureInput[] = recipeFrames(
    stressId,
    9,
    1,
  ),
  prime: TemporalStressPrimeReceipt = PRIME,
) {
  return {
    id,
    cameraPath: recipeCameras(stressId),
    artisticControls: SWELL.artisticControls,
    waterPreset: WATER_PRESET,
    reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
    lighting,
    prime,
    frames,
  };
}

function createFastPan(
  overrides: {
    readonly observed?: typeof FAST_PAN_OBSERVED;
    readonly thresholds?: typeof FAST_PAN_THRESHOLDS;
    readonly frames?: readonly TemporalStressFrameCaptureInput[];
    readonly cameras?: ReturnType<typeof recipeCameras>;
    readonly startTick?: number;
    readonly ticksPerFrame?: number;
    readonly primePresentations?: number;
    readonly frameCount?: number;
  } = {},
): TemporalStressEvidenceV1 {
  const recipe = TEMPORAL_STRESS_RECIPE_POLICY["fast-pan-frozen-simulation"];
  const frames =
    overrides.frames ?? recipeFrames("fast-pan-frozen-simulation", 9, 1);
  return createTemporalStressEvidence({
    id: "fast-pan-frozen-simulation",
    startTick: overrides.startTick ?? recipe.startTick,
    ticksPerFrame: overrides.ticksPerFrame ?? recipe.ticksPerFrame,
    primePresentations:
      overrides.primePresentations ?? recipe.primePresentations,
    frameCount: overrides.frameCount ?? recipe.frameCount,
    runs: [
      {
        ...runInput(
          "default",
          "fast-pan-frozen-simulation",
          REFERENCE_ENVIRONMENT_LIGHTING,
          frames,
        ),
        cameraPath:
          overrides.cameras ?? recipeCameras("fast-pan-frozen-simulation"),
      },
    ],
    thresholds: overrides.thresholds ?? FAST_PAN_THRESHOLDS,
    observed: overrides.observed ?? FAST_PAN_OBSERVED,
  });
}

function createGlint(
  observed = GLINT_OBSERVED,
  offMotion: string = BYTES,
): TemporalStressEvidenceV1 {
  const recipe =
    TEMPORAL_STRESS_RECIPE_POLICY["high-frequency-glint-horizon-strafe"];
  return createTemporalStressEvidence({
    id: "high-frequency-glint-horizon-strafe",
    startTick: recipe.startTick,
    ticksPerFrame: recipe.ticksPerFrame,
    primePresentations: recipe.primePresentations,
    frameCount: recipe.frameCount,
    runs: [
      runInput(
        "sun-on",
        "high-frequency-glint-horizon-strafe",
        REFERENCE_ENVIRONMENT_LIGHTING,
        recipeFrames("high-frequency-glint-horizon-strafe", 9, 1),
        PRIME,
      ),
      runInput(
        "sun-off",
        "high-frequency-glint-horizon-strafe",
        {
          ...REFERENCE_ENVIRONMENT_LIGHTING,
          sunAngularRadiusRadians: 0.0001,
        },
        recipeFrames("high-frequency-glint-horizon-strafe", 41, 2, offMotion),
        OFF_PRIME,
      ),
    ],
    thresholds: GLINT_THRESHOLDS,
    observed,
  });
}

function createThin(observed = THIN_OBSERVED): TemporalStressEvidenceV1 {
  const recipe = TEMPORAL_STRESS_RECIPE_POLICY["thin-detail-jitter-only-hold"];
  return createTemporalStressEvidence({
    id: "thin-detail-jitter-only-hold",
    startTick: recipe.startTick,
    ticksPerFrame: recipe.ticksPerFrame,
    primePresentations: recipe.primePresentations,
    frameCount: recipe.frameCount,
    runs: [
      runInput(
        "default",
        "thin-detail-jitter-only-hold",
        REFERENCE_ENVIRONMENT_LIGHTING,
        recipeFrames("thin-detail-jitter-only-hold", 9, 1),
      ),
    ],
    thresholds: THIN_THRESHOLDS,
    observed,
  });
}

function screenshotProfile(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    os: "darwin",
    osRelease: "27.0.0",
    arch: "arm64",
    cpuModel: "Apple M5",
    chromeVersion: "151.0.7922.169",
    headless: true,
    powerState: "ac",
    lowPowerMode: 0,
    projectId: "optical",
    rendererDeviceFingerprint: DEVICE_FINGERPRINT,
    admitted: false,
    asserted: false,
    authoritative: false,
    ...overrides,
  };
}

function forgeObserved(
  evidence: TemporalStressEvidenceV1,
  observed: Readonly<Record<string, number>>,
): unknown {
  return {
    ...evidence,
    observed,
    passed: true,
    sha256: sha256CanonicalJson(
      omitShaAndPassed({
        ...evidence,
        observed,
        passed: true,
      }),
    ),
  };
}

describe("TemporalStressEvidenceV1", () => {
  it("hashes canonical JSON and raw capture bytes", () => {
    expect(sha256CanonicalJson({ b: 2, a: 1 })).toBe(
      sha256CanonicalJson({ a: 1, b: 2 }),
    );
    expect(sha256CanonicalJson({ a: 1, b: 2 })).not.toBe(
      sha256CanonicalJson({ a: 1, b: 3 }),
    );
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(sha256CaptureBytes(BYTES)).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("builds a continuous fast-pan document whose run hash covers path, controls, environment, prime, and frames", () => {
    const evidence = createFastPan();
    expect(evidence.passed).toBe(true);
    expect(evidence.jitterSequence).toEqual(TEMPORAL_STRESS_JITTER_SEQUENCE);
    expect(evidence.runs[0]?.prime).toEqual(PRIME);
    expect(evidence.runs[0]?.frames[0]?.presentationId).toBe(9);
    expect(evidence.runs[0]?.frames[0]?.currentColor).toBe(
      sha256CaptureBytes(BYTES),
    );
    expect(evidence.runs[0]?.sha256).toBe(
      sha256CanonicalJson(
        omitShaAndPassed({
          id: "default",
          cameraPath: evidence.runs[0]?.cameraPath,
          controls: evidence.runs[0]?.controls,
          environment: evidence.runs[0]?.environment,
          prime: evidence.runs[0]?.prime,
          frames: evidence.runs[0]?.frames,
        }),
      ),
    );
    expect(evidence.sha256).toBe(
      sha256CanonicalJson(omitShaAndPassed({ ...evidence, sha256: "x" })),
    );
    expect(readTemporalStressEvidence(evidence)).toEqual(evidence);
  });

  it("deep-freezes cameras, controls, environment, frames, thresholds, and observed", () => {
    const evidence = createFastPan();
    const hash = evidence.sha256;
    const run = evidence.runs[0];
    const camera = run?.cameraPath[0];
    if (run === undefined || camera === undefined) {
      throw new Error("expected a frozen run");
    }
    expect(() => {
      (camera.position as number[])[0] = 99;
    }).toThrow();
    expect(() => {
      (run.controls.artisticControls as { waveStrength: number }).waveStrength =
        0;
    }).toThrow();
    expect(() => {
      (run.environment.lighting as { sunIntensity: number }).sunIntensity = 0;
    }).toThrow();
    expect(() => {
      (run.frames[0] as { tick: number }).tick = 0;
    }).toThrow();
    expect(() => {
      (evidence.thresholds as { maskMin: number }).maskMin = 1;
    }).toThrow();
    expect(() => {
      (evidence.observed as { maskMin: number }).maskMin = 1;
    }).toThrow();
    expect(camera.position[0]).toBe(0);
    expect(evidence.sha256).toBe(hash);
    expect(readTemporalStressEvidence(evidence).sha256).toBe(hash);
  });

  it("rejects a malformed frame that records a reset", () => {
    const evidence = createThin();
    const run = evidence.runs[0];
    if (run === undefined) {
      throw new Error("expected a run");
    }
    const frame = run.frames[0];
    if (frame === undefined) {
      throw new Error("expected a frame");
    }
    expect(() =>
      readTemporalStressEvidence({
        ...evidence,
        runs: [
          {
            ...run,
            frames: [
              { ...frame, resetReason: "camera-cut", resetFrame: true },
              ...run.frames.slice(1),
            ],
          },
        ],
      }),
    ).toThrowError(/cut or reset/i);
  });

  it("rejects a frame missing a required digest", () => {
    const evidence = createThin();
    const run = evidence.runs[0];
    const frame = run?.frames[0];
    if (run === undefined || frame === undefined) {
      throw new Error("expected a frame");
    }
    const rest = { ...frame };
    Reflect.deleteProperty(rest, "glint");
    expect(() =>
      readTemporalStressEvidence({
        ...evidence,
        runs: [{ ...run, frames: [rest, ...run.frames.slice(1)] }],
      }),
    ).toThrowError(/exact frame contract/i);
  });
});

describe("exact metric truth", () => {
  it("pins exact threshold and observed keys for each stress id", () => {
    const sameKeys = (
      actual: readonly string[],
      expected: readonly string[],
    ): void => {
      expect([...actual].sort()).toEqual([...expected].sort());
    };
    const fast = temporalStressMetricPolicy("fast-pan-frozen-simulation");
    const glint = temporalStressMetricPolicy(
      "high-frequency-glint-horizon-strafe",
    );
    const thin = temporalStressMetricPolicy("thin-detail-jitter-only-hold");
    sameKeys(fast.thresholdKeys, Object.keys(FAST_PAN_THRESHOLDS));
    sameKeys(fast.observedKeys, Object.keys(FAST_PAN_OBSERVED));
    sameKeys(glint.thresholdKeys, Object.keys(GLINT_THRESHOLDS));
    sameKeys(glint.observedKeys, Object.keys(GLINT_OBSERVED));
    sameKeys(thin.thresholdKeys, Object.keys(THIN_THRESHOLDS));
    sameKeys(thin.observedKeys, Object.keys(THIN_OBSERVED));
  });

  it("fails a forged threshold, failing observed, or passed=true cover-up", () => {
    const evidence = createFastPan();
    expect(() =>
      createFastPan({
        thresholds: { ...FAST_PAN_THRESHOLDS, maskMin: 255 },
      }),
    ).toThrowError(/exact policy value/i);
    expect(() =>
      createFastPan({
        observed: { ...FAST_PAN_OBSERVED, maskMin: 255 },
      }),
    ).toThrowError(/do not satisfy the exact metric policy/i);
    expect(() =>
      readTemporalStressEvidence(
        forgeObserved(evidence, { ...evidence.observed, maskMin: 255 }),
      ),
    ).toThrowError(/do not satisfy the exact metric policy/i);
  });

  it("mutates one metric across the gte, lte, and eq boundaries for fast-pan", () => {
    expect(() =>
      createFastPan({ observed: { ...FAST_PAN_OBSERVED, maskMin: 255 } }),
    ).toThrowError(/metric policy/i);
    expect(() =>
      createFastPan({
        observed: { ...FAST_PAN_OBSERVED, motionP95Max: 12.0001 },
      }),
    ).toThrowError(/metric policy/i);
    expect(() =>
      createFastPan({
        observed: { ...FAST_PAN_OBSERVED, outsideCoverage: 1 },
      }),
    ).toThrowError(/metric policy/i);
  });

  it("mutates one metric across the gte, lte, and eq boundaries for glint", () => {
    expect(() =>
      createGlint({ ...GLINT_OBSERVED, currentMadP75: 0.999 }),
    ).toThrowError(/metric policy/i);
    expect(() =>
      createGlint({ ...GLINT_OBSERVED, offGlintMax: 0.0051 }),
    ).toThrowError(/metric policy/i);
    expect(() =>
      createGlint({ ...GLINT_OBSERVED, offGlintHot: 1 }),
    ).toThrowError(/metric policy/i);
  });

  it("mutates one metric across the gte and lte boundaries for thin-detail", () => {
    expect(() => createThin({ ...THIN_OBSERVED, unionCount: 63 })).toThrowError(
      /metric policy/i,
    );
    expect(() =>
      createThin({ ...THIN_OBSERVED, motionMax: 0.1501 }),
    ).toThrowError(/metric policy/i);
  });
});

describe("isolated presentation-frame evidence", () => {
  const current = sha256CaptureBytes("AA==");
  const finalColor = sha256CaptureBytes("AQ==");
  const glint = sha256CaptureBytes("Ag==");
  const diff = sha256CaptureBytes("Aw==");
  const png = Buffer.from("png-bytes");

  function golden(
    overrides: Record<string, unknown> = {},
  ): ReturnType<typeof createPresentationFrameEvidence> {
    return createPresentationFrameEvidence({
      presentationId: 9,
      historyEpoch: 1,
      resetReason: null,
      resetFrame: false,
      simulationResetRevision: 1,
      seed: 0x4000_0000,
      tick: 24,
      timeSeconds: 24 / 60,
      controlRevision: 1,
      cameraCutRevision: 0,
      seaStateCutRevision: 0,
      originRevision: 0,
      manifestHash: CORE.manifestHash,
      camera: HORIZON,
      clip: { x: 0, y: 104, width: 320, height: 76 },
      snapshotName: "optical-horizon-glint-crest.png",
      pngAttachmentName: DURABLE_PNG_NAME,
      pngAttachmentPath: DURABLE_PNG_PATH,
      screenshotPng: png,
      baselineSnapshotSha256: sha256Buffer(Buffer.from("baseline-png")),
      currentDigest: current,
      finalDigest: finalColor,
      glintDigest: glint,
      diffDigest: diff,
      rgbDiffCoverage: 12,
      ...overrides,
    });
  }

  it("hashes the exact screenshot Buffer and requires distinct current/final/diff", () => {
    const evidence = golden();
    expect(evidence.screenshotPngSha256).toBe(sha256Buffer(png));
    expect(evidence.currentDigest).not.toBe(evidence.finalDigest);
    expect(evidence.finalDigest).not.toBe(evidence.diffDigest);
    expect(readPresentationFrameEvidence(evidence)).toEqual(evidence);
  });

  it("rejects reused current/final/diff hashes, zero coverage, and receipt tampers", () => {
    expect(() =>
      createPresentationFrameEvidence({
        presentationId: 9,
        historyEpoch: 1,
        resetReason: null,
        resetFrame: false,
        simulationResetRevision: 1,
        seed: 0x4000_0000,
        tick: 24,
        timeSeconds: 24 / 60,
        controlRevision: 1,
        cameraCutRevision: 0,
        seaStateCutRevision: 0,
        originRevision: 0,
        manifestHash: CORE.manifestHash,
        camera: HORIZON,
        clip: { x: 0, y: 104, width: 320, height: 76 },
        snapshotName: "optical-horizon-glint-crest.png",
        pngAttachmentName: DURABLE_PNG_NAME,
        pngAttachmentPath: DURABLE_PNG_PATH,
        screenshotPng: png,
        baselineSnapshotSha256: sha256Buffer(Buffer.from("baseline-png")),
        currentDigest: current,
        finalDigest: current,
        glintDigest: glint,
        diffDigest: diff,
        rgbDiffCoverage: 12,
      }),
    ).toThrowError(/distinct/i);
    expect(() =>
      readPresentationFrameEvidence({
        ...golden(),
        rgbDiffCoverage: 0,
      }),
    ).toThrowError(/rgbDiffCoverage/i);
    expect(() =>
      readPresentationFrameEvidence({
        ...golden(),
        timeSeconds: 0.5,
      }),
    ).toThrowError(/tick \/ 60/i);
    const missingSeed = { ...golden() };
    Reflect.deleteProperty(missingSeed, "seed");
    expect(() => readPresentationFrameEvidence(missingSeed)).toThrowError(
      /exact isolated-receipt contract/i,
    );
    expect(() =>
      readPresentationFrameEvidence({
        ...golden(),
        pngAttachmentContentType: "image/jpeg",
      }),
    ).toThrowError(/image\/png/i);
    expect(() =>
      readPresentationFrameEvidence({
        ...golden(),
        pngAttachmentSha256: sha256Buffer(Buffer.from("other-png")),
      }),
    ).toThrowError(/pngAttachmentSha256 must equal screenshotPngSha256/i);
    const missingSnapshot = { ...golden() };
    Reflect.deleteProperty(missingSnapshot, "snapshotName");
    expect(() => readPresentationFrameEvidence(missingSnapshot)).toThrowError(
      /exact isolated-receipt contract/i,
    );
    expect(() =>
      readPresentationFrameEvidence({
        ...golden(),
        pngAttachmentName: "optical-horizon-glint-crest.png",
        pngAttachmentPath:
          "test-results/regression-acceptance/optical-horizon-glint-crest.png",
      }),
    ).toThrowError(/unique project\/testId\/worker\/retry PNG basename/i);
    expect(() =>
      readPresentationFrameEvidence({
        ...golden(),
        pngAttachmentPath: `elsewhere/${DURABLE_PNG_NAME}`,
      }),
    ).toThrowError(/regression-acceptance basename path/i);
  });

  it("does not let a post-create clip mutation change the payload", () => {
    const evidence = golden();
    expect(() => {
      (evidence.clip as { x: number }).x = 9;
    }).toThrow();
    expect(evidence.clip.x).toBe(0);
  });
});

describe("Regression acceptance version-3 reader", () => {
  it("accepts the exact schema/version contract with actual capabilities and no raw captures", () => {
    const prewarm = createBoundCoreDiagnosticsPrewarmReceipt(
      CORE,
      DEVICE,
      READY_CAPABILITIES,
    );
    const identity = createQaBoundCoreManifestIdentity(CORE);
    const document = readRegressionAcceptanceEvidence({
      schema: REGRESSION_ACCEPTANCE_SCHEMA,
      version: REGRESSION_ACCEPTANCE_VERSION,
      evidenceClass: REGRESSION_ACCEPTANCE_EVIDENCE_CLASS,
      chromeVersion: "151.0.7922.169",
      userAgent: "Mozilla/5.0",
      os: "darwin",
      osRelease: "27.0.0",
      arch: "arm64",
      cpuModel: "Apple M5",
      hardwareConcurrency: 10,
      projectId: "optical",
      profileId: "optical",
      headed: false,
      headless: true,
      devicePixelRatio: 1,
      drawingBuffer: identity.drawingBuffer,
      browserCanvas: identity.drawingBuffer,
      temporalPolicy: prewarm.capabilities.rendering.temporal,
      navigatorGpuAdapter: null,
      rendererDevice: DEVICE,
      rendererDeviceFingerprint: DEVICE_FINGERPRINT,
      powerState: "ac",
      lowPowerMode: 0,
      screenshotProfile: screenshotProfile(),
      seaLevelMetres: 0,
      seed: 0x4000_0000,
      tick: 24,
      camera: HORIZON,
      controlRevision: 1,
      coreManifest: coreManifestEvidence(identity),
      qaPrewarmManifest: prewarm,
      qaHarness: null,
      qaCapture: null,
      artisticControls: null,
      waterPreset: null,
      environment: null,
      screenshot: null,
      presentationFrame: null,
      temporalStress: null,
    });
    expect(document.schema).toBe("real-water/regression-acceptance");
    expect(document.version).toBe(3);
    expect(document.temporalPolicy).toEqual(
      prewarm.capabilities.rendering.temporal,
    );
    expect(document.qaPrewarmManifest).toMatchObject({
      capabilities: READY_CAPABILITIES,
      manifest: {
        version: 13,
        captures: expect.arrayContaining([
          {
            name: "foam-source-identity",
            preparedFormat: "rgba16float-foam-source-identity",
          },
        ]),
        coreDeclarations: expect.objectContaining({
          "foam-source-identity": "water-foam-source-identity-target",
        }),
      },
    });
    expect(document.qaPrewarmManifest?.manifest.captures).toHaveLength(36);
  });

  it("rejects raw base64 capture payloads and a forged schema", () => {
    const prewarm = createBoundCoreDiagnosticsPrewarmReceipt(
      CORE,
      DEVICE,
      READY_CAPABILITIES,
    );
    const identity = createQaBoundCoreManifestIdentity(CORE);
    const base = {
      schema: REGRESSION_ACCEPTANCE_SCHEMA,
      version: REGRESSION_ACCEPTANCE_VERSION,
      evidenceClass: REGRESSION_ACCEPTANCE_EVIDENCE_CLASS,
      chromeVersion: "151.0.7922.169",
      userAgent: "Mozilla/5.0",
      os: "darwin",
      osRelease: "27.0.0",
      arch: "arm64",
      cpuModel: "Apple M5",
      hardwareConcurrency: 10,
      projectId: "optical",
      profileId: "optical",
      headed: false,
      headless: true,
      devicePixelRatio: 1,
      drawingBuffer: identity.drawingBuffer,
      browserCanvas: identity.drawingBuffer,
      temporalPolicy: prewarm.capabilities.rendering.temporal,
      navigatorGpuAdapter: null,
      rendererDevice: DEVICE,
      rendererDeviceFingerprint: DEVICE_FINGERPRINT,
      powerState: "ac",
      lowPowerMode: 0,
      screenshotProfile: screenshotProfile(),
      seaLevelMetres: 0,
      seed: 1,
      tick: 0,
      camera: HORIZON,
      controlRevision: 0,
      coreManifest: coreManifestEvidence(identity),
      qaPrewarmManifest: prewarm,
      qaHarness: null,
      qaCapture: null,
      artisticControls: null,
      waterPreset: null,
      environment: null,
      screenshot: null,
      presentationFrame: null,
      temporalStress: null,
    };
    expect(() =>
      readRegressionAcceptanceEvidence({ ...base, version: 1 }),
    ).toThrowError(/version 3/i);
    expect(() =>
      readRegressionAcceptanceEvidence({
        ...base,
        qaCapture: {
          data: Buffer.alloc(200, 1).toString("base64"),
        },
      }),
    ).toThrowError(/raw/i);
  });

  it("rejects a shallow screenshotProfile and a forged admitted fingerprint", () => {
    const prewarm = createBoundCoreDiagnosticsPrewarmReceipt(
      CORE,
      DEVICE,
      READY_CAPABILITIES,
    );
    const identity = createQaBoundCoreManifestIdentity(CORE);
    const base = {
      schema: REGRESSION_ACCEPTANCE_SCHEMA,
      version: REGRESSION_ACCEPTANCE_VERSION,
      evidenceClass: REGRESSION_ACCEPTANCE_EVIDENCE_CLASS,
      chromeVersion: "151.0.7922.169",
      userAgent: "Mozilla/5.0",
      os: "darwin",
      osRelease: "27.0.0",
      arch: "arm64",
      cpuModel: "Apple M5",
      hardwareConcurrency: 10,
      projectId: "optical",
      profileId: "optical",
      headed: false,
      headless: true,
      devicePixelRatio: 1,
      drawingBuffer: identity.drawingBuffer,
      browserCanvas: identity.drawingBuffer,
      temporalPolicy: prewarm.capabilities.rendering.temporal,
      navigatorGpuAdapter: null,
      rendererDevice: DEVICE,
      rendererDeviceFingerprint: DEVICE_FINGERPRINT,
      powerState: "ac",
      lowPowerMode: 0,
      screenshotProfile: screenshotProfile(),
      seaLevelMetres: 0,
      seed: 0x4000_0000,
      tick: 24,
      camera: HORIZON,
      controlRevision: 1,
      coreManifest: coreManifestEvidence(identity),
      qaPrewarmManifest: prewarm,
      qaHarness: null,
      qaCapture: null,
      artisticControls: null,
      waterPreset: null,
      environment: null,
      screenshot: null,
      presentationFrame: null,
      temporalStress: null,
    };
    expect(() =>
      readRegressionAcceptanceEvidence({
        ...base,
        screenshotProfile: {
          os: "darwin",
          admitted: true,
          asserted: false,
          authoritative: false,
        },
      }),
    ).toThrowError(/exact admitted-profile contract/i);
    expect(() =>
      readRegressionAcceptanceEvidence({
        ...base,
        screenshotProfile: screenshotProfile({ admitted: true }),
      }),
    ).toThrowError(/admitted\/asserted\/authoritative/i);
    expect(() =>
      readRegressionAcceptanceEvidence({
        ...base,
        rendererDeviceFingerprint: "sha256:" + "ab".repeat(32),
      }),
    ).toThrowError(/recomputed from the renderer device/i);
  });

  it("binds a temporal stress document to top seed, controls, environment, and Core", () => {
    const prewarm = createBoundCoreDiagnosticsPrewarmReceipt(
      CORE,
      DEVICE,
      READY_CAPABILITIES,
    );
    const identity = createQaBoundCoreManifestIdentity(CORE);
    const stress = createFastPan();
    const document = readRegressionAcceptanceEvidence({
      schema: REGRESSION_ACCEPTANCE_SCHEMA,
      version: REGRESSION_ACCEPTANCE_VERSION,
      evidenceClass: REGRESSION_ACCEPTANCE_EVIDENCE_CLASS,
      chromeVersion: "151.0.7922.169",
      userAgent: "Mozilla/5.0",
      os: "darwin",
      osRelease: "27.0.0",
      arch: "arm64",
      cpuModel: "Apple M5",
      hardwareConcurrency: 10,
      projectId: "optical",
      profileId: "optical",
      headed: false,
      headless: true,
      devicePixelRatio: 1,
      drawingBuffer: identity.drawingBuffer,
      browserCanvas: identity.drawingBuffer,
      temporalPolicy: prewarm.capabilities.rendering.temporal,
      navigatorGpuAdapter: null,
      rendererDevice: DEVICE,
      rendererDeviceFingerprint: DEVICE_FINGERPRINT,
      powerState: "ac",
      lowPowerMode: 0,
      screenshotProfile: screenshotProfile(),
      seaLevelMetres: 0,
      seed: 0x4000_0000,
      tick: 24,
      camera: HORIZON,
      controlRevision: 1,
      coreManifest: coreManifestEvidence(identity),
      qaPrewarmManifest: prewarm,
      qaHarness: null,
      qaCapture: null,
      artisticControls: SWELL.artisticControls,
      waterPreset: WATER_PRESET,
      environment: {
        reflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
        lighting: REFERENCE_ENVIRONMENT_LIGHTING,
      },
      screenshot: null,
      presentationFrame: null,
      temporalStress: stress,
    });
    expect(document.temporalStress).toEqual(stress);
  });
});

describe("exact temporal recipe and derived common-source", () => {
  it("enforces the exact 24/0/8/16, 24/1/8/24, and 24/0/8/16 recipes", () => {
    expect(createFastPan().frameCount).toBe(16);
    expect(createGlint().frameCount).toBe(24);
    expect(createThin().frameCount).toBe(16);
    expect(createFastPan().runs[0]?.frames).toHaveLength(16);
    expect(createGlint().runs[0]?.prime.presentationId).toBe(8);
    expect(createGlint().runs[1]?.prime.presentationId).toBe(40);
    expect(createGlint().runs[1]?.prime.simulationResetRevision).toBe(2);
    expect(createFastPan().runs[0]?.frames[0]?.presentationId).toBe(9);
    expect(createGlint().runs[1]?.frames[0]?.presentationId).toBe(41);
  });

  it("rejects a tamper of each recipe field and 1-frame or 0-prime fixtures", () => {
    expect(() => createFastPan({ startTick: 23 })).toThrowError(
      /exact recipe/i,
    );
    expect(() => createFastPan({ ticksPerFrame: 1 })).toThrowError(
      /exact recipe/i,
    );
    expect(() => createFastPan({ primePresentations: 0 })).toThrowError(
      /exact recipe/i,
    );
    expect(() => createFastPan({ frameCount: 1 })).toThrowError(
      /exact recipe/i,
    );
    const evidence = createFastPan();
    for (const field of [
      "startTick",
      "ticksPerFrame",
      "primePresentations",
      "frameCount",
    ] as const) {
      const tampered = {
        ...evidence,
        [field]: field === "ticksPerFrame" ? 1 : 1,
      };
      expect(() => readTemporalStressEvidence(tampered)).toThrowError(
        /exact recipe/i,
      );
    }
  });

  it("derives glint commonSource and never trusts a literal 1", () => {
    const matching = createGlint();
    expect(matching.observed.commonSource).toBe(1);
    expect(readTemporalStressEvidence(matching).observed.commonSource).toBe(1);
    expect(() => createGlint(GLINT_OBSERVED, OTHER_BYTES)).toThrowError(
      /derived common-source/i,
    );
    const off = matching.runs[1];
    const first = off?.frames[0];
    if (off === undefined || first === undefined) {
      throw new Error("expected an off run");
    }
    const tamperedFrames = [
      { ...first, motionVector: sha256CaptureBytes(OTHER_BYTES) },
      ...off.frames.slice(1),
    ];
    const unsignedOff = {
      id: off.id,
      cameraPath: off.cameraPath,
      controls: off.controls,
      environment: off.environment,
      prime: off.prime,
      frames: tamperedFrames,
    };
    const tamperedOff = {
      ...unsignedOff,
      sha256: sha256CanonicalJson(omitShaAndPassed(unsignedOff)),
    };
    const unsigned = {
      ...matching,
      runs: [matching.runs[0], tamperedOff],
    };
    expect(() =>
      readTemporalStressEvidence({
        ...unsigned,
        sha256: sha256CanonicalJson(omitShaAndPassed(unsigned)),
      }),
    ).toThrowError(/derived common-source/i);
  });

  it("rejects last-prime ID 100 and a last-prime reset receipt", () => {
    const fast = createFastPan();
    const thin = createThin();
    const glint = createGlint();
    const fastRun = fast.runs[0];
    const thinRun = thin.runs[0];
    const onRun = glint.runs[0];
    const offRun = glint.runs[1];
    if (
      fastRun === undefined ||
      thinRun === undefined ||
      onRun === undefined ||
      offRun === undefined
    ) {
      throw new Error("expected recipe runs");
    }
    expect(fastRun.prime.presentationId).toBe(8);
    expect(thinRun.prime.presentationId).toBe(8);
    expect(onRun.prime.presentationId).toBe(8);
    expect(offRun.prime.presentationId).toBe(40);
    expect(() =>
      readTemporalStressEvidence({
        ...fast,
        runs: [
          {
            ...fastRun,
            prime: { ...fastRun.prime, presentationId: 100 },
          },
        ],
      }),
    ).toThrowError(/prime presentationId must be 8/i);
    expect(() =>
      readTemporalStressEvidence({
        ...thin,
        runs: [
          {
            ...thinRun,
            prime: { ...thinRun.prime, presentationId: 100 },
          },
        ],
      }),
    ).toThrowError(/prime presentationId must be 8/i);
    expect(() =>
      readTemporalStressEvidence({
        ...glint,
        runs: [
          onRun,
          {
            ...offRun,
            prime: { ...offRun.prime, presentationId: 100 },
          },
        ],
      }),
    ).toThrowError(/prime presentationId must be 40/i);
    expect(() =>
      readTemporalStressEvidence({
        ...fast,
        runs: [
          {
            ...fastRun,
            prime: { ...fastRun.prime, resetFrame: true },
          },
        ],
      }),
    ).toThrowError(/resetReason=null and resetFrame=false/i);
    expect(() =>
      readTemporalStressEvidence({
        ...fast,
        runs: [
          {
            ...fastRun,
            prime: { ...fastRun.prime, resetReason: "camera-cut" },
          },
        ],
      }),
    ).toThrowError(/resetReason=null and resetFrame=false/i);
  });
});
