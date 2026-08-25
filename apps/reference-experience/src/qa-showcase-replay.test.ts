import { describe, expect, it, vi } from "vitest";
import {
  createReferenceShowcasePreset,
  type HostLifecycleAdapter,
  type OpenWaterRuntimeSnapshot,
  type RealWaterLease,
  type ShowcasePreset,
} from "real-water";
import {
  QA_FRAME_CAPTURE_NAMES,
  QA_FRAME_FIXED_TICK_HZ,
} from "./qa-frame-contract.js";
import type {
  QaFrameDriver,
  QaFrameDriverCapture,
  QaFrameDriverPresentedFrame,
  QaFramePrewarmReceipt,
} from "./qa-frame-driver.js";
import {
  createQaHarness,
  type QaCaptureName,
  type QaFrameSource,
  type QaShowcaseReplayController,
  type QaShowcaseReplaySnapshotV18,
} from "./qa-harness.js";
import type { ReferenceExperienceSnapshot } from "./start-reference-experience.js";

describe("QA Showcase replay", () => {
  it("replays the preset seed and tick with every authored state field and all captures", async () => {
    const fixture = createFixture();

    const receipt = await fixture.harness.replayShowcase({ tick: 1_800 });

    expect(fixture.driverResetSeeds).toEqual([fixture.preset.seed]);
    expect(fixture.driverPresentTicks).toEqual([1_800]);
    expect(fixture.driverCaptureRequests).toEqual([QA_FRAME_CAPTURE_NAMES]);
    expect(fixture.operationOrder).toEqual(["reset", "activate", "present"]);
    expect(fixture.activate).toHaveBeenCalledTimes(1);
    expect(fixture.deactivate).not.toHaveBeenCalled();
    expect(receipt).toMatchObject({
      showcase: {
        schema: fixture.preset.schema,
        version: fixture.preset.version,
        id: fixture.preset.id,
        presetHash: fixture.preset.presetHash,
      },
      capturePoint: null,
      seed: fixture.preset.seed,
      tick: 1_800,
      look: fixture.snapshotAt(1_800).look,
      camera: fixture.snapshotAt(1_800).camera,
      body: fixture.snapshotAt(1_800).body,
      environment: fixture.snapshotAt(1_800).environment,
      events: fixture.snapshotAt(1_800).events,
      presentation: {
        seed: fixture.preset.seed,
        tick: 1_800,
        captureNames: QA_FRAME_CAPTURE_NAMES,
      },
    });
    expect(isDeeplyFrozen(receipt)).toBe(true);
    expect((await fixture.harness.capture("final-color")).tick).toBe(1_800);
  });

  it("fully resets and activates the shared schedule for repeat requests", async () => {
    const fixture = createFixture();

    const first = await fixture.harness.replayShowcase({ tick: 3_600 });
    const second = await fixture.harness.replayShowcase({ tick: 3_600 });

    expect(fixture.driverResetSeeds).toEqual([
      fixture.preset.seed,
      fixture.preset.seed,
    ]);
    expect(fixture.driverPresentTicks).toEqual([3_600, 3_600]);
    expect(fixture.activate).toHaveBeenCalledTimes(2);
    expect(fixture.deactivate).toHaveBeenCalledTimes(1);
    expect(withoutPresentation(first)).toEqual(withoutPresentation(second));
  });

  it("resolves a named preset capture point without caller overrides", async () => {
    const fixture = createFixture();
    const expected = fixture.preset.captureTimeline.find(
      ({ id }) => id === "blue-noon-swell",
    );

    const receipt = await fixture.harness.replayShowcase({
      capturePoint: "blue-noon-swell",
    });

    expect(expected).toBeDefined();
    expect(fixture.driverPresentTicks).toEqual([1_800]);
    expect(fixture.driverCaptureRequests).toEqual([
      [
        "final-color",
        "depth",
        "normal",
        "hero-breaker-foam",
        "underwater-caustics",
        "underwater-particles",
        "underwater-bubbles",
        "lens-wetness",
      ],
    ]);
    expect(receipt.capturePoint).toEqual(expected);
    expect(receipt.tick).toBe(expected?.tick);
    expect(receipt.presentation.captureNames).toEqual(expected?.captureNames);
    expect(isDeeplyFrozen(receipt.capturePoint)).toBe(true);

    expect(() =>
      fixture.harness.replayShowcase({
        capturePoint: "blue-noon-swell",
        captures: ["final-color"],
      } as Parameters<typeof fixture.harness.replayShowcase>[0]),
    ).toThrowError(
      /select a capture point or tick|non-negative safe integers/u,
    );
  });

  it("requests and caches only the named captures for a focused replay", async () => {
    const fixture = createFixture();

    const receipt = await fixture.harness.replayShowcase({
      tick: 120,
      captures: ["final-color"],
    });

    expect(fixture.driverCaptureRequests).toEqual([["final-color"]]);
    expect(receipt.capturePoint).toBeNull();
    expect(receipt.presentation.captureNames).toEqual(["final-color"]);
    await expect(fixture.harness.capture("final-color")).resolves.toMatchObject(
      { tick: 120 },
    );
    await expect(fixture.harness.capture("depth")).rejects.toMatchObject({
      code: "QA_PRESENT_REQUIRED",
    });
    expect(() =>
      fixture.harness.replayShowcase({ tick: 0, captures: [] }),
    ).toThrowError(/at least one named output/u);
    expect(() =>
      fixture.harness.replayShowcase({
        tick: 0,
        captures: ["final-color", "final-color"],
      }),
    ).toThrowError(/must be unique/u);
  });

  it("rejects unknown points and point capture names outside the QA contract", async () => {
    const fixture = createFixture();
    await expect(
      fixture.harness.replayShowcase({ capturePoint: "not-authored" }),
    ).rejects.toMatchObject({ code: "QA_INVALID_ARGUMENT" });
    expect(fixture.driverResetSeeds).toEqual([]);

    const validPreset = createReferenceShowcasePreset();
    const invalidPreset = Object.freeze({
      ...validPreset,
      captureTimeline: Object.freeze([
        Object.freeze({
          id: "unsupported-capture",
          tick: 0,
          captureNames: Object.freeze(["not-a-qa-capture"]),
        }),
      ]),
    }) as ShowcasePreset;
    const invalid = createFixture({ preset: invalidPreset });
    await expect(
      invalid.harness.replayShowcase({
        capturePoint: "unsupported-capture",
      }),
    ).rejects.toMatchObject({ code: "QA_CAPTURE_UNSUPPORTED" });
    expect(invalid.driverResetSeeds).toEqual([]);
  });

  it("rejects an unavailable controller and invalid or out-of-range ticks", async () => {
    const unsupported = createFixture({ showcaseReplay: false });
    await expect(
      unsupported.harness.replayShowcase({ tick: 0 }),
    ).rejects.toMatchObject({ code: "QA_SHOWCASE_UNSUPPORTED" });
    expect(unsupported.driverResetSeeds).toEqual([]);

    const fixture = createFixture();
    expect(() => fixture.harness.replayShowcase({ tick: -1 })).toThrowError(
      /non-negative safe integers/u,
    );
    expect(() => fixture.harness.replayShowcase({ tick: 1.5 })).toThrowError(
      /non-negative safe integers/u,
    );
    expect(() =>
      fixture.harness.replayShowcase({ tick: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrowError(/non-negative safe integers/u);
    await expect(
      fixture.harness.replayShowcase({
        tick: fixture.preset.durationTicks + 1,
      }),
    ).rejects.toMatchObject({ code: "QA_INVALID_ARGUMENT" });
    expect(fixture.driverResetSeeds).toEqual([]);

    await expect(
      fixture.harness.replayShowcase({ tick: fixture.preset.durationTicks }),
    ).resolves.toMatchObject({ tick: fixture.preset.durationTicks });
  });

  it.each([
    "reset",
    "quality-profile",
    "dispose",
    "long-suspension",
    "device-loss",
  ] as const)("deactivates replay on %s invalidation", async (action) => {
    const fixture = createFixture();
    await fixture.harness.replayShowcase({ tick: 10 });

    switch (action) {
      case "reset":
        await fixture.harness.reset({ seed: 9 });
        break;
      case "quality-profile":
        await fixture.harness.applySecondQualityProfile();
        break;
      case "dispose":
        await fixture.harness.dispose();
        break;
      case "long-suspension":
        await fixture.harness.signalLongSuspension();
        break;
      case "device-loss":
        fixture.harness.synthesizeDeviceLoss();
        break;
    }

    expect(fixture.deactivate).toHaveBeenCalledTimes(1);
  });

  it("preserves the manual reset, camera, advance, and present path", async () => {
    const fixture = createFixture();

    await fixture.harness.reset({ seed: 42 });
    await fixture.harness.setCamera(fixture.snapshotAt(0).camera, {
      transition: "continuous",
    });
    await fixture.harness.advanceTicks(12);
    const presentation = await fixture.harness.present();

    expect(presentation).toMatchObject({ seed: 42, tick: 12 });
    expect(fixture.activate).not.toHaveBeenCalled();
    expect(fixture.deactivate).not.toHaveBeenCalled();
  });
});

interface Fixture {
  readonly harness: ReturnType<typeof createQaHarness>;
  readonly preset: ShowcasePreset;
  readonly activate: ReturnType<typeof vi.fn>;
  readonly deactivate: ReturnType<typeof vi.fn>;
  readonly driverResetSeeds: number[];
  readonly driverPresentTicks: number[];
  readonly driverCaptureRequests: (readonly QaCaptureName[])[];
  readonly operationOrder: string[];
  snapshotAt(tick: number): QaShowcaseReplaySnapshotV18;
}

function createFixture(
  options: {
    readonly showcaseReplay?: boolean;
    readonly preset?: ShowcasePreset;
  } = {},
): Fixture {
  const preset = options.preset ?? createReferenceShowcasePreset();
  const driverResetSeeds: number[] = [];
  const driverPresentTicks: number[] = [];
  const driverCaptureRequests: (readonly QaCaptureName[])[] = [];
  const operationOrder: string[] = [];
  let seed = 0;
  let tick = 0;
  let resetRevision = 0;
  let presentationId = 0;
  let showcaseTick = 0;
  const activate = vi.fn(() => {
    operationOrder.push("activate");
    showcaseTick = 0;
  });
  const deactivate = vi.fn(() => {
    operationOrder.push("deactivate");
  });
  const snapshotAt = (snapshotTick: number): QaShowcaseReplaySnapshotV18 =>
    createReplaySnapshot(preset, snapshotTick);
  const showcaseReplay: QaShowcaseReplayController = Object.freeze({
    preset: () => preset,
    activate,
    deactivate,
    snapshot: () => snapshotAt(showcaseTick),
  });

  const runtimeSnapshot = (): OpenWaterRuntimeSnapshot =>
    ({
      seed,
      tick,
      timeSeconds: tick / QA_FRAME_FIXED_TICK_HZ,
      simulationResetRevision: resetRevision,
      controlRevision: 0,
      originRevision: 0,
      cameraCutRevision: 0,
      seaStateCutRevision: 0,
      originX: 0,
      originZ: 0,
      seaLevelMetres: 0,
    }) as OpenWaterRuntimeSnapshot;
  const lease = Object.freeze({
    inspectRuntime: runtimeSnapshot,
  }) as unknown as RealWaterLease;
  const prewarm = Object.freeze({
    core: Object.freeze({ manifestHash: "sha256:test-manifest" }),
  }) as QaFramePrewarmReceipt;
  const driver: QaFrameDriver = Object.freeze({
    fixedTickHz: QA_FRAME_FIXED_TICK_HZ,
    prewarm,
    async reset(request: Parameters<QaFrameDriver["reset"]>[0]) {
      operationOrder.push("reset");
      driverResetSeeds.push(request.seed);
      seed = request.seed;
      tick = 0;
      resetRevision += 1;
      return Object.freeze({
        seed,
        tick,
        timeSeconds: 0,
        seaLevelMetres: 0,
        simulationResetRevision: resetRevision,
      });
    },
    async present(request: Parameters<QaFrameDriver["present"]>[0]) {
      operationOrder.push("present");
      tick += request.advanceFixedTicks;
      showcaseTick = tick;
      driverPresentTicks.push(tick);
      driverCaptureRequests.push(Object.freeze([...request.captures]));
      presentationId += 1;
      return createPresentedFrame({
        seed,
        tick,
        resetRevision,
        presentationId,
        prewarm,
        captureNames: request.captures,
      });
    },
    async dispose() {},
  });
  const source: QaFrameSource = Object.freeze({
    host: Object.freeze({}) as HostLifecycleAdapter,
    driver: () => driver,
    lease: () => lease,
    bindLease() {},
    setCamera() {},
    incrementCameraCut() {},
    setOrigin() {},
    setSeaLevel() {},
    setEnvironmentLighting() {},
    setEnvironmentState() {},
    setHostSceneLightingDecoy() {},
    setHostSceneForegroundFixture() {},
    setHostScenePlanarReflectionFixture() {},
    setHostScenePlanarReflectionFixtureHotColor() {},
    readHostScenePlanarReflectionFixture: () =>
      Object.freeze({
        visible: true,
        frustumCulled: false,
        enabled: false,
        scale: Object.freeze([0, 0, 0] as const),
        hotColor: "magenta" as const,
      }),
    setHostSceneCurrentSsrFixture() {},
    setHostSceneCurrentSsrFixtureHotColor() {},
    readHostSceneCurrentSsrFixture: () =>
      Object.freeze({
        visible: true,
        frustumCulled: false,
        enabled: false,
        scale: Object.freeze([0, 0, 0] as const),
        hotColor: "magenta" as const,
        colorWrite: true,
        depthWrite: true,
      }),
    readEnvironmentLighting: () => createEnvironment().lighting,
    readEnvironmentState: createEnvironment,
  });
  const referenceSnapshot: ReferenceExperienceSnapshot = Object.freeze({
    generation: 7,
    manifestHash: "sha256:test-manifest",
    qualityProfileId: "minimal",
    state: "ready",
    viewport: Object.freeze({
      drawingBufferWidth: 1,
      drawingBufferHeight: 1,
    }),
  });
  const harness = createQaHarness({
    applySecondQualityProfile: async () => {},
    dispose: async () => {},
    frameSource: () => source,
    signalLongSuspension: async () => {},
    ...(options.showcaseReplay === false ? {} : { showcaseReplay }),
    snapshot: () => referenceSnapshot,
    synthesizeDeviceLoss() {},
  });
  return {
    harness,
    preset,
    activate,
    deactivate,
    driverResetSeeds,
    driverPresentTicks,
    driverCaptureRequests,
    operationOrder,
    snapshotAt,
  };
}

function createPresentedFrame(options: {
  readonly seed: number;
  readonly tick: number;
  readonly resetRevision: number;
  readonly presentationId: number;
  readonly prewarm: QaFramePrewarmReceipt;
  readonly captureNames: readonly QaCaptureName[];
}): QaFrameDriverPresentedFrame {
  return Object.freeze({
    seed: options.seed,
    tick: options.tick,
    timeSeconds: options.tick / QA_FRAME_FIXED_TICK_HZ,
    seaLevelMetres: 0,
    simulationResetRevision: options.resetRevision,
    presentationId: options.presentationId,
    manifestHash: options.prewarm.core.manifestHash,
    controlRevision: 0,
    originRevision: 0,
    cameraCutRevision: 0,
    seaStateCutRevision: 0,
    compileCount: 1,
    probeCount: 1,
    prewarm: options.prewarm,
    captures: Object.freeze(options.captureNames.map(createCapture)),
    waterline: Object.freeze({}),
    secondaryParticles: Object.freeze({}),
    temporal: Object.freeze({
      historyEpoch: options.resetRevision,
      resetReason: "simulation-reset",
      resetFrame: true,
    }),
  }) as unknown as QaFrameDriverPresentedFrame;
}

function createCapture(
  name: (typeof QA_FRAME_CAPTURE_NAMES)[number],
): QaFrameDriverCapture {
  return Object.freeze({
    name,
    width: 1,
    height: 1,
    origin: "top-left",
    format: "rgba8unorm-srgb",
    data: Uint8Array.of(0, 0, 0, 255),
  }) as unknown as QaFrameDriverCapture;
}

function createReplaySnapshot(
  preset: ShowcasePreset,
  tick: number,
): QaShowcaseReplaySnapshotV18 {
  const look =
    [...preset.lookTimeline]
      .reverse()
      .find((candidate) => candidate.tick <= tick) ?? preset.lookTimeline[0];
  const camera =
    [...preset.cameraTimeline]
      .reverse()
      .find((candidate) => candidate.tick <= tick) ?? preset.cameraTimeline[0];
  const body =
    [...preset.bodyTimeline]
      .reverse()
      .find((candidate) => candidate.tick <= tick) ?? preset.bodyTimeline[0];
  if (look === undefined || camera === undefined || body === undefined) {
    throw new Error("The test Showcase timelines are empty.");
  }
  return Object.freeze({
    look: Object.freeze({
      id: look.id,
      waterPreset: look.waterPreset,
      environmentPreset: look.environmentPreset,
    }),
    camera: Object.freeze({
      projection: "perspective",
      position: camera.position,
      target: camera.target,
      up: Object.freeze([0, 1, 0] as const),
      verticalFovDegrees: camera.verticalFovDegrees,
      near: 0.1,
      far: 4_000,
    }),
    body: Object.freeze({
      id: body.bodyId,
      controls: Object.freeze({
        throttle: body.throttle,
        steering: body.steering,
      }),
      fixedStepCount: tick,
      pose: Object.freeze({
        position: Object.freeze({ x: tick / 60, y: 0.5, z: -4 }),
        rotation: Object.freeze({ x: 0, y: 0.25, z: 0, w: 0.968_245_836 }),
      }),
    }),
    environment: createEnvironment(),
    events: Object.freeze(
      preset.eventTimeline
        .filter((event) => event.tick <= tick)
        .map((event) => Object.freeze({ id: event.id, tick: event.tick })),
    ),
  });
}

function createEnvironment(): QaShowcaseReplaySnapshotV18["environment"] {
  return Object.freeze({
    lighting: Object.freeze({
      sunDirectionX: 0.25,
      sunDirectionY: 0.9,
      sunDirectionZ: -0.15,
      sunColorR: 1,
      sunColorG: 0.8,
      sunColorB: 0.6,
      sunIntensity: 2.5,
      environmentIntensity: 0.7,
      sunAngularRadiusRadians: 0.069,
    }),
    weather: Object.freeze({
      windDirectionX: 0.8,
      windDirectionZ: -0.2,
      windStrength: 0.6,
      gustStrength: 0.4,
      rainIntensity: 0.3,
    }),
    atmosphere: Object.freeze({
      cloudCoverage: 0.7,
      cloudShadowStrength: 0.5,
      horizonHaze: 0.4,
      stormAerosolIntensity: 0.3,
      lightningIntensity: 0.2,
    }),
  });
}

function withoutPresentation(
  receipt: Awaited<ReturnType<Fixture["harness"]["replayShowcase"]>>,
): Omit<typeof receipt, "presentation"> {
  const { presentation: _presentation, ...replay } = receipt;
  void _presentation;
  return replay;
}

function isDeeplyFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return true;
  }
  if (!Object.isFrozen(value)) {
    return false;
  }
  return Object.values(value).every(isDeeplyFrozen);
}
