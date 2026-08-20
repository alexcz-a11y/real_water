import { describe, expect, it, vi } from "vitest";
import {
  assertHostPresentationAdapter,
  createMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createStaticHostPresentationAdapter,
  createStaticHostSimulationAdapter,
  createThreeHostLifecycleAdapter,
  prepareRealWater,
  readHostPresentationBinding,
  readHostPresentationRoute,
  readHostPresentationState,
  readHostPresentedFrame,
  type HostPresentationAdapter,
  type HostPresentationRoute,
  type HostPresentedFrame,
} from "../src/index.js";
import { createRealWaterRuntime } from "../src/runtime.js";
import { createTestEnvironmentAdapter } from "./test-host-environment.js";

const STATIC_SIMULATION = createStaticHostSimulationAdapter();
const VALID_MANIFEST_HASH = `sha256:${"ab".repeat(32)}`;

function createMutablePresentationAdapter(
  cameraCutRevision = 0,
): HostPresentationAdapter & { setRevision(next: number): void } {
  let revision = cameraCutRevision;
  return {
    snapshot() {
      return { cameraCutRevision: revision };
    },
    bind(route) {
      readHostPresentationRoute(route);
      return Object.freeze({
        dispose() {},
      });
    },
    setRevision(next) {
      revision = next;
    },
  };
}

function createSilentRoute(
  present: HostPresentationRoute["present"] = async () =>
    createPresentedFrame(),
): HostPresentationRoute {
  return Object.freeze({ present });
}

function createPresentedFrame(
  overrides: Partial<HostPresentedFrame> = {},
): HostPresentedFrame {
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
    ...overrides,
  };
}

describe("Host Presentation", () => {
  it("publishes static camera-cut revision 0", () => {
    const adapter = createStaticHostPresentationAdapter();

    expect(adapter.snapshot()).toEqual({ cameraCutRevision: 0 });
    expect(readHostPresentationState(adapter)).toEqual({
      cameraCutRevision: 0,
    });
    expect(assertHostPresentationAdapter(adapter)).toBe(adapter);
  });

  it("binds a validated route without retaining or driving it", async () => {
    const present = vi.fn(async () => createPresentedFrame());
    const route = createSilentRoute(present);
    const adapter = createStaticHostPresentationAdapter();

    const binding = adapter.bind(route);
    expect(readHostPresentationRoute(route)).toBe(route);
    expect(readHostPresentationBinding(binding)).toBe(binding);
    expect(present).not.toHaveBeenCalled();

    binding.dispose();
    binding.dispose();
    expect(present).not.toHaveBeenCalled();
    await expect(route.present()).resolves.toMatchObject({
      presentationId: 1,
    });
  });

  it("rejects routes and bindings that are not the exact public contracts", () => {
    const adapter = createStaticHostPresentationAdapter();
    const present = async () => createPresentedFrame();

    for (const invalid of [{}, { present, extra: 1 }, { present: 1 }]) {
      expect(() => adapter.bind(invalid as never)).toThrowError(/route/i);
      expect(() => readHostPresentationRoute(invalid as never)).toThrowError(
        /route/i,
      );
    }

    expect(() =>
      readHostPresentationBinding({ dispose() {}, extra: true } as never),
    ).toThrowError(/binding/i);
    expect(() => readHostPresentationBinding({} as never)).toThrowError(
      /binding/i,
    );
    expect(() =>
      readHostPresentedFrame({
        ...createPresentedFrame(),
        extra: 1,
      } as never),
    ).toThrowError(/receipt/i);
    expect(() =>
      readHostPresentedFrame({
        presentationId: 1,
        manifestHash: VALID_MANIFEST_HASH,
        tick: 0,
        controlRevision: 0,
        originRevision: 0,
        cameraCutRevision: 0,
        seaStateCutRevision: 0,
        temporal: {
          historyEpoch: 1,
          resetReason: null,
          resetFrame: false,
        },
      } as never),
    ).toThrowError(/receipt/i);
    expect(
      readHostPresentedFrame({
        ...createPresentedFrame(),
        seed: 7,
        timeSeconds: 1.5,
        simulationResetRevision: 3,
      }),
    ).toMatchObject({
      seed: 7,
      timeSeconds: 1.5,
      simulationResetRevision: 3,
    });
    expect(() =>
      readHostPresentedFrame({
        ...createPresentedFrame(),
        temporal: {
          historyEpoch: 1,
          resetReason: "initial",
          resetFrame: true,
        },
      } as never),
    ).toThrowError(/resetReason/i);
    expect(() =>
      assertHostPresentationAdapter({
        snapshot: () => ({ cameraCutRevision: 0 }),
      } as never),
    ).toThrowError(/bind/i);
  });

  it("rejects invalid presentation before mutating runtime output", () => {
    const presentation = createMutablePresentationAdapter(0);
    const sink = { synchronize: vi.fn() };
    const runtime = createRealWaterRuntime(
      () => {},
      STATIC_SIMULATION,
      presentation,
      sink,
    );
    const before = runtime.inspectRuntime();

    presentation.setRevision(Number.NaN);

    expect(() =>
      runtime.updateArtisticControls(before.artisticControls),
    ).toThrowError(/presentation/i);
    expect(sink.synchronize).not.toHaveBeenCalled();
    presentation.setRevision(0);
    expect(runtime.inspectRuntime()).toEqual(before);

    for (const invalid of [
      {},
      { cameraCutRevision: 0, extra: 1 },
      { cameraCutRevision: -1 },
      { cameraCutRevision: 1.5 },
      { cameraCutRevision: Number.POSITIVE_INFINITY },
      { cameraCutRevision: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      expect(() =>
        readHostPresentationState({ snapshot: () => invalid as never }),
      ).toThrowError(/presentation/i);
    }
  });
});

describe("Runtime sea-state continuity", () => {
  it("does not increment sea-state-cut on continuous control changes", () => {
    const sink = { synchronize: vi.fn() };
    const runtime = createRealWaterRuntime(
      () => {},
      STATIC_SIMULATION,
      createStaticHostPresentationAdapter(),
      sink,
    );
    const controls = runtime.inspectRuntime().artisticControls;

    const unchanged = runtime.updateArtisticControls(controls);
    expect(unchanged).toMatchObject({
      changed: false,
      revision: 0,
      transition: "continuous",
      seaStateCutRevision: 0,
    });
    expect(sink.synchronize).not.toHaveBeenCalled();

    const changed = runtime.updateArtisticControls({
      ...controls,
      waveStrength: 2,
    });
    expect(changed).toMatchObject({
      changed: true,
      revision: 1,
      transition: "continuous",
      seaStateCutRevision: 0,
    });
    expect(sink.synchronize).toHaveBeenCalledTimes(1);
    expect(runtime.inspectRuntime()).toMatchObject({
      controlRevision: 1,
      seaStateCutRevision: 0,
      cameraCutRevision: 0,
    });
    expect(runtime.inspectRuntime()).not.toHaveProperty("transition");
  });

  it("increments sea-state-cut once for an explicit cut even when controls are unchanged", () => {
    const sink = { synchronize: vi.fn() };
    const runtime = createRealWaterRuntime(
      () => {},
      STATIC_SIMULATION,
      createStaticHostPresentationAdapter(),
      sink,
    );
    const controls = runtime.inspectRuntime().artisticControls;

    const receipt = runtime.updateArtisticControls(controls, {
      transition: "sea-state-cut",
    });

    expect(receipt).toMatchObject({
      changed: false,
      revision: 0,
      transition: "sea-state-cut",
      seaStateCutRevision: 1,
    });
    expect(sink.synchronize).toHaveBeenCalledTimes(1);
    expect(sink.synchronize.mock.calls[0]?.[0]).toMatchObject({
      artisticControls: controls,
      seaStateCutRevision: 1,
    });
    expect(runtime.inspectRuntime()).toMatchObject({
      controlRevision: 0,
      seaStateCutRevision: 1,
      cameraCutRevision: 0,
    });
    expect(runtime.inspectRuntime()).not.toHaveProperty("transition");
  });

  it("exposes Host Presentation camera-cut revisions on the lightweight snapshot", () => {
    const presentation = createMutablePresentationAdapter(3);
    const runtime = createRealWaterRuntime(
      () => {},
      STATIC_SIMULATION,
      presentation,
    );

    expect(runtime.inspectRuntime().cameraCutRevision).toBe(3);

    presentation.setRevision(4);
    expect(runtime.inspectRuntime().cameraCutRevision).toBe(4);
  });
});

describe("Host adapters require Presentation", () => {
  it("requires Memory Host to supply a Presentation Adapter", () => {
    expect(() =>
      createMemoryHostLifecycleAdapter({
        simulation: STATIC_SIMULATION,
        environment: createTestEnvironmentAdapter(),
      } as never),
    ).toThrowError(/presentation/i);
  });

  it("exposes the supplied Presentation Adapter on a Memory Host lease", async () => {
    const presentation = createMutablePresentationAdapter(2);
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: STATIC_SIMULATION,
        environment: createTestEnvironmentAdapter(),
        presentation,
        stepDelayMs: 0,
      }),
    }).ready;

    expect(lease.inspectRuntime().cameraCutRevision).toBe(2);
    presentation.setRevision(5);
    expect(lease.inspectRuntime().cameraCutRevision).toBe(5);
    await lease.dispose();
  });

  it("requires Three Host to supply a Presentation Adapter", () => {
    expect(() =>
      createThreeHostLifecycleAdapter({
        renderer: { init: async () => {} },
        scene: {} as never,
        camera: {} as never,
        simulation: STATIC_SIMULATION,
        environment: createTestEnvironmentAdapter(),
      } as never),
    ).toThrowError(/presentation/i);
  });

  it("requires Memory and Three Host adapters to implement bind(route)", () => {
    const presentation = {
      snapshot: () => ({ cameraCutRevision: 0 }),
    };

    expect(() =>
      createMemoryHostLifecycleAdapter({
        simulation: STATIC_SIMULATION,
        environment: createTestEnvironmentAdapter(),
        presentation: presentation as never,
      }),
    ).toThrowError(/bind/i);
    expect(() =>
      createThreeHostLifecycleAdapter({
        renderer: { init: async () => {} },
        scene: {} as never,
        camera: {} as never,
        simulation: STATIC_SIMULATION,
        environment: createTestEnvironmentAdapter(),
        presentation: presentation as never,
      }),
    ).toThrowError(/bind/i);
  });
});
