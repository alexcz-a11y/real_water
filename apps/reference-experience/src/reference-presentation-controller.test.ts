import { describe, expect, it, vi } from "vitest";
import {
  readHostPresentationBinding,
  readHostPresentationRoute,
  type HostPresentationRoute,
  type HostPresentedFrame,
} from "real-water";
import {
  type DiagnosticsCapture,
  type DiagnosticsCaptureName,
  type HostDiagnosticsPresentedFrame,
  type HostDiagnosticsPresentRequest,
  type HostDiagnosticsRoute,
} from "real-water/diagnostics";
import {
  REFERENCE_ENGINEERING_DIAGNOSTICS_INTERVAL_MS,
  REFERENCE_PRESENTATION_INTERVAL_MS,
  createReferenceHostPresentationController,
} from "./reference-presentation-controller.js";

const VALID_MANIFEST_HASH = `sha256:${"cd".repeat(32)}`;

function createReceipt(presentationId: number): HostPresentedFrame {
  return {
    presentationId,
    manifestHash: VALID_MANIFEST_HASH,
    seed: 0,
    tick: presentationId,
    timeSeconds: presentationId,
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

function createScheduler() {
  const callbacks: Array<(time: number) => void> = [];
  const scheduleFrame = vi.fn((callback: (time: number) => void) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  const cancelFrame = vi.fn();
  return { callbacks, scheduleFrame, cancelFrame };
}

function createDiagnosticsCapture(
  name: DiagnosticsCaptureName,
): DiagnosticsCapture {
  if (name !== "final-color") {
    throw new Error(`Unsupported test diagnostics capture: ${name}`);
  }
  return {
    name,
    format: "rgba8unorm-srgb",
    width: 1,
    height: 1,
    origin: "top-left",
    data: new Uint8Array([0, 0, 0, 255]),
  };
}

function createDiagnosticsFrame(
  request: HostDiagnosticsPresentRequest,
  presentationId = 1,
): HostDiagnosticsPresentedFrame {
  return {
    ...createReceipt(presentationId),
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
      maximumCandidateCount: 0,
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
      consumers: [],
    },
    outputs: request.outputs.map(createDiagnosticsCapture),
    compileCount: 2,
    probeCount: 3,
    diagnosticReadbackCount: request.outputs.length,
    sceneRenderCount: presentationId,
    width: 1,
    height: 1,
  };
}

function createDiagnosticsCapableRoute(
  present: HostPresentationRoute["present"],
  diagnostics: HostDiagnosticsRoute,
): HostPresentationRoute {
  const route: HostPresentationRoute = { present };
  return new Proxy(route, {
    get(target, property, receiver) {
      if (
        typeof property === "symbol" &&
        property.description === "real-water/host-diagnostics-route"
      ) {
        return diagnostics;
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
}

describe("Reference Host Presentation Controller", () => {
  it("publishes every authored Showcase camera cut revision", () => {
    const controller = createReferenceHostPresentationController({
      scheduleFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
    });

    expect(controller.snapshot()).toEqual({ cameraCutRevision: 0 });
    expect(controller.incrementCameraCut()).toBe(1);
    expect(controller.incrementCameraCut()).toBe(2);
    expect(controller.snapshot()).toEqual({ cameraCutRevision: 2 });
  });

  it("stores the bound route without scheduling and presents at 30 FPS timestamps", async () => {
    const { callbacks, scheduleFrame, cancelFrame } = createScheduler();
    let presentationId = 0;
    const present = vi.fn(async () => {
      presentationId += 1;
      return createReceipt(presentationId);
    });
    const route = readHostPresentationRoute({ present });
    const controller = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame,
    });

    expect(() => controller.start()).toThrowError(/bound/i);
    const binding = readHostPresentationBinding(controller.bind(route));
    expect(scheduleFrame).not.toHaveBeenCalled();
    expect(present).not.toHaveBeenCalled();

    controller.start();
    controller.start();
    expect(scheduleFrame).toHaveBeenCalledTimes(1);
    expect(present).not.toHaveBeenCalled();

    callbacks[0]?.(0);
    await vi.waitFor(() => {
      expect(present).toHaveBeenCalledTimes(1);
    });
    expect(present.mock.instances[0]).toBe(route);
    await vi.waitFor(() => {
      expect(scheduleFrame).toHaveBeenCalledTimes(2);
    });

    callbacks[1]?.(16);
    await Promise.resolve();
    await Promise.resolve();
    expect(present).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(scheduleFrame).toHaveBeenCalledTimes(3);
    });

    callbacks[2]?.(REFERENCE_PRESENTATION_INTERVAL_MS);
    await vi.waitFor(() => {
      expect(present).toHaveBeenCalledTimes(2);
    });
    expect(present.mock.instances[1]).toBe(route);

    binding.dispose();
    binding.dispose();
    expect(cancelFrame).toHaveBeenCalledTimes(1);

    callbacks[3]?.(REFERENCE_PRESENTATION_INTERVAL_MS * 2);
    await Promise.resolve();
    expect(present).toHaveBeenCalledTimes(2);
  });

  it("drains an in-flight present without scheduling another frame", async () => {
    const { callbacks, scheduleFrame, cancelFrame } = createScheduler();
    let release: ((frame: HostPresentedFrame) => void) | undefined;
    const present = vi.fn(
      () =>
        new Promise<HostPresentedFrame>((resolve) => {
          release = resolve;
        }),
    );
    const controller = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame,
    });
    const binding = controller.bind({ present });
    controller.start();
    callbacks[0]?.(0);
    await vi.waitFor(() => {
      expect(present).toHaveBeenCalledTimes(1);
    });

    binding.dispose();
    release?.(createReceipt(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduleFrame).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledTimes(0);
  });

  it("scopes dispose and stale RAF callbacks to the binding generation", async () => {
    const { callbacks, scheduleFrame } = createScheduler();
    const presentA = vi.fn(async () => createReceipt(1));
    const presentB = vi.fn(async () => createReceipt(2));
    const controller = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame: vi.fn(),
    });

    const bindingA = controller.bind({ present: presentA });
    controller.start();
    expect(scheduleFrame).toHaveBeenCalledTimes(1);
    bindingA.dispose();

    const bindingB = controller.bind({ present: presentB });
    controller.start();
    expect(scheduleFrame).toHaveBeenCalledTimes(2);

    bindingA.dispose();
    callbacks[0]?.(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(presentA).not.toHaveBeenCalled();
    expect(presentB).not.toHaveBeenCalled();

    callbacks[1]?.(0);
    await vi.waitFor(() => {
      expect(presentB).toHaveBeenCalledTimes(1);
    });
    expect(presentA).not.toHaveBeenCalled();
    expect(presentB.mock.instances[0]).toBeDefined();

    bindingB.dispose();
  });

  it("does not let an in-flight generation A completion schedule generation B", async () => {
    const { callbacks, scheduleFrame } = createScheduler();
    let releaseA: ((frame: HostPresentedFrame) => void) | undefined;
    const presentA = vi.fn(
      () =>
        new Promise<HostPresentedFrame>((resolve) => {
          releaseA = resolve;
        }),
    );
    const presentB = vi.fn(async () => createReceipt(2));
    const controller = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame: vi.fn(),
    });

    const bindingA = controller.bind({ present: presentA });
    controller.start();
    callbacks[0]?.(0);
    await vi.waitFor(() => {
      expect(presentA).toHaveBeenCalledTimes(1);
    });

    bindingA.dispose();
    const bindingB = controller.bind({ present: presentB });
    controller.start();
    const scheduledAfterBStart = scheduleFrame.mock.calls.length;

    releaseA?.(createReceipt(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduleFrame).toHaveBeenCalledTimes(scheduledAfterBStart);
    expect(presentB).not.toHaveBeenCalled();

    callbacks[scheduledAfterBStart - 1]?.(0);
    await vi.waitFor(() => {
      expect(presentB).toHaveBeenCalledTimes(1);
    });
    bindingB.dispose();
  });

  it("stops that binding's loop when route.present rejects", async () => {
    const { callbacks, scheduleFrame } = createScheduler();
    const onError = vi.fn();
    const present = vi.fn(async () => {
      throw new Error("Synthetic presentation rejection.");
    });
    const controller = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame: vi.fn(),
      onError,
    });
    const binding = controller.bind({ present });
    controller.start();
    callbacks[0]?.(0);
    await vi.waitFor(() => {
      expect(present).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduleFrame).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      message: "Synthetic presentation rejection.",
    });

    callbacks[0]?.(REFERENCE_PRESENTATION_INTERVAL_MS);
    await Promise.resolve();
    expect(present).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    binding.dispose();
  });

  it("invokes beforePresent immediately before route.present on 30 FPS presents", async () => {
    const { callbacks, scheduleFrame } = createScheduler();
    const order: string[] = [];
    const beforePresent = vi.fn((time: number, generation: number) => {
      order.push(`sim:${String(time)}:${String(generation)}`);
    });
    const present = vi.fn(async () => {
      order.push("present");
      return createReceipt(order.filter((entry) => entry === "present").length);
    });
    const controller = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame: vi.fn(),
      beforePresent,
    });
    const binding = controller.bind({ present });
    controller.start();
    callbacks[0]?.(0);
    await vi.waitFor(() => {
      expect(present).toHaveBeenCalledTimes(1);
    });
    expect(order).toEqual(["sim:0:1", "present"]);

    await vi.waitFor(() => {
      expect(scheduleFrame).toHaveBeenCalledTimes(2);
    });
    callbacks[1]?.(16);
    await Promise.resolve();
    await Promise.resolve();
    expect(present).toHaveBeenCalledTimes(1);
    expect(beforePresent).toHaveBeenCalledTimes(1);

    callbacks[2]?.(REFERENCE_PRESENTATION_INTERVAL_MS);
    await vi.waitFor(() => {
      expect(present).toHaveBeenCalledTimes(2);
    });
    expect(order).toEqual([
      "sim:0:1",
      "present",
      `sim:${String(REFERENCE_PRESENTATION_INTERVAL_MS)}:1`,
      "present",
    ]);
    binding.dispose();
  });

  it("does not call beforePresent for a stale or rejected generation", async () => {
    const { callbacks, scheduleFrame } = createScheduler();
    const beforePresent = vi.fn();
    const present = vi.fn(async () => createReceipt(1));
    const onError = vi.fn();
    const failing = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame: vi.fn(),
      beforePresent: () => {
        throw new Error("Synthetic beforePresent rejection.");
      },
      onError,
    });
    const failingBinding = failing.bind({ present });
    failing.start();
    callbacks[0]?.(0);
    await Promise.resolve();
    expect(present).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    failingBinding.dispose();

    const stale = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame: vi.fn(),
      beforePresent,
    });
    const staleBinding = stale.bind({ present });
    stale.start();
    staleBinding.dispose();
    callbacks[scheduleFrame.mock.calls.length - 1]?.(0);
    await Promise.resolve();
    expect(beforePresent).not.toHaveBeenCalled();
    expect(present).not.toHaveBeenCalled();
  });

  it("does not invoke onError for a stale generation rejection", async () => {
    const { callbacks, scheduleFrame } = createScheduler();
    const onError = vi.fn();
    let rejectA: ((error: Error) => void) | undefined;
    const presentA = vi.fn(
      () =>
        new Promise<HostPresentedFrame>((_resolve, reject) => {
          rejectA = reject;
        }),
    );
    const presentB = vi.fn(async () => createReceipt(2));
    const controller = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame: vi.fn(),
      onError,
    });

    const bindingA = controller.bind({ present: presentA });
    controller.start();
    callbacks[0]?.(0);
    await vi.waitFor(() => {
      expect(presentA).toHaveBeenCalledTimes(1);
    });
    bindingA.dispose();
    const bindingB = controller.bind({ present: presentB });
    controller.start();
    rejectA?.(new Error("Stale generation rejection."));
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();
    bindingB.dispose();
  });

  it("keeps diagnostics closed by default and when explicitly disabled", async () => {
    const { callbacks, scheduleFrame } = createScheduler();
    const present = vi.fn(async () => createReceipt(1));
    const presentDiagnostics = vi.fn(
      async (request: HostDiagnosticsPresentRequest) =>
        createDiagnosticsFrame(request),
    );
    const controller = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame: vi.fn(),
    });
    const binding = controller.bind(
      createDiagnosticsCapableRoute(present, {
        present: presentDiagnostics,
      }),
    );
    controller.start();

    callbacks[0]?.(0);
    await vi.waitFor(() => {
      expect(present).toHaveBeenCalledTimes(1);
    });
    expect(presentDiagnostics).not.toHaveBeenCalled();

    controller.setDiagnosticsSampling({
      enabled: false,
      outputs: ["final-color"],
    });
    await vi.waitFor(() => {
      expect(scheduleFrame).toHaveBeenCalledTimes(2);
    });
    callbacks[1]?.(REFERENCE_PRESENTATION_INTERVAL_MS);
    await vi.waitFor(() => {
      expect(present).toHaveBeenCalledTimes(2);
    });
    expect(presentDiagnostics).not.toHaveBeenCalled();
    binding.dispose();
  });

  it("replaces a normal present with one bounded diagnostics sample and publishes a frozen summary", async () => {
    const { callbacks, scheduleFrame } = createScheduler();
    const present = vi.fn(async () => createReceipt(2));
    let releaseDiagnostics: (() => void) | undefined;
    const presentDiagnostics = vi.fn(
      (request: HostDiagnosticsPresentRequest) =>
        new Promise<HostDiagnosticsPresentedFrame>((resolve) => {
          releaseDiagnostics = () => resolve(createDiagnosticsFrame(request));
        }),
    );
    const subscriber = vi.fn();
    const controller = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame: vi.fn(),
    });
    controller.setDiagnosticsSampling({
      enabled: true,
      outputs: ["final-color"],
    });
    const unsubscribe = controller.subscribeDiagnostics(subscriber);
    const binding = controller.bind(
      createDiagnosticsCapableRoute(present, {
        present: presentDiagnostics,
      }),
    );
    controller.start();

    callbacks[0]?.(0);
    expect(presentDiagnostics).toHaveBeenCalledTimes(1);
    expect(presentDiagnostics).toHaveBeenCalledWith({
      outputs: ["final-color"],
    });
    expect(present).not.toHaveBeenCalled();
    expect(scheduleFrame).toHaveBeenCalledTimes(1);

    releaseDiagnostics?.();
    await vi.waitFor(() => {
      expect(subscriber).toHaveBeenCalledTimes(1);
    });
    const summary = subscriber.mock.calls[0]?.[0];
    expect(summary).toMatchObject({
      presentationId: 1,
      width: 1,
      height: 1,
      compileCount: 2,
      probeCount: 3,
      diagnosticReadbackCount: 1,
      sceneRenderCount: 1,
      requestedOutputNames: ["final-color"],
      requestedOutputCount: 1,
      returnedOutputNames: ["final-color"],
      returnedOutputCount: 1,
    });
    expect(summary).not.toHaveProperty("outputs");
    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.requestedOutputNames)).toBe(true);
    expect(Object.isFrozen(summary.returnedOutputNames)).toBe(true);
    expect(Object.isFrozen(summary.waterline)).toBe(true);
    expect(Object.isFrozen(summary.secondaryParticles)).toBe(true);
    expect(Object.isFrozen(summary.secondaryParticles.consumers)).toBe(true);
    unsubscribe();
    unsubscribe();
    await vi.waitFor(() => {
      expect(scheduleFrame).toHaveBeenCalledTimes(2);
    });

    callbacks[1]?.(REFERENCE_PRESENTATION_INTERVAL_MS);
    await vi.waitFor(() => {
      expect(present).toHaveBeenCalledTimes(1);
    });
    expect(presentDiagnostics).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(scheduleFrame).toHaveBeenCalledTimes(3);
    });

    callbacks[2]?.(REFERENCE_ENGINEERING_DIAGNOSTICS_INTERVAL_MS);
    expect(presentDiagnostics).toHaveBeenCalledTimes(2);
    expect(present).toHaveBeenCalledTimes(1);
    releaseDiagnostics?.();
    await vi.waitFor(() => {
      expect(scheduleFrame).toHaveBeenCalledTimes(4);
    });
    expect(subscriber).toHaveBeenCalledTimes(1);
    binding.dispose();
  });

  it("requests no named outputs unless the client explicitly opts in", async () => {
    const { callbacks, scheduleFrame } = createScheduler();
    const present = vi.fn(async () => createReceipt(2));
    const presentDiagnostics = vi.fn(
      async (request: HostDiagnosticsPresentRequest) =>
        createDiagnosticsFrame(request),
    );
    const controller = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame: vi.fn(),
    });
    controller.setDiagnosticsSampling({ enabled: true });
    const binding = controller.bind(
      createDiagnosticsCapableRoute(present, { present: presentDiagnostics }),
    );
    controller.start();

    callbacks[0]?.(0);
    await vi.waitFor(() => {
      expect(presentDiagnostics).toHaveBeenCalledTimes(1);
    });
    expect(presentDiagnostics.mock.calls[0]?.[0]).toEqual({ outputs: [] });
    await vi.waitFor(() => {
      expect(scheduleFrame).toHaveBeenCalledTimes(2);
    });

    controller.setDiagnosticsSampling({
      enabled: true,
      outputs: ["final-color"],
    });
    controller.setDiagnosticsSampling({
      enabled: true,
      outputs: ["final-color"],
    });
    callbacks[1]?.(REFERENCE_PRESENTATION_INTERVAL_MS);
    await vi.waitFor(() => {
      expect(present).toHaveBeenCalledTimes(1);
    });
    expect(presentDiagnostics).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(scheduleFrame).toHaveBeenCalledTimes(3);
    });
    callbacks[2]?.(REFERENCE_ENGINEERING_DIAGNOSTICS_INTERVAL_MS);
    await vi.waitFor(() => {
      expect(presentDiagnostics).toHaveBeenCalledTimes(2);
    });
    expect(presentDiagnostics.mock.calls[1]?.[0]).toEqual({
      outputs: ["final-color"],
    });
    binding.dispose();
  });

  it("does not publish a diagnostics sample after disabling or disposing its generation", async () => {
    const { callbacks, scheduleFrame } = createScheduler();
    const subscriber = vi.fn();
    const releases: Array<() => void> = [];
    const presentDiagnostics = vi.fn(
      (request: HostDiagnosticsPresentRequest) =>
        new Promise<HostDiagnosticsPresentedFrame>((resolve) => {
          releases.push(() => resolve(createDiagnosticsFrame(request)));
        }),
    );
    const present = vi.fn(async () => createReceipt(2));
    const controller = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame: vi.fn(),
    });
    controller.subscribeDiagnostics(subscriber);
    controller.setDiagnosticsSampling({ enabled: true });
    const bindingA = controller.bind(
      createDiagnosticsCapableRoute(present, {
        present: presentDiagnostics,
      }),
    );
    controller.start();
    callbacks[0]?.(0);
    expect(presentDiagnostics).toHaveBeenCalledTimes(1);

    controller.setDiagnosticsSampling({ enabled: false });
    releases[0]?.();
    await vi.waitFor(() => {
      expect(scheduleFrame).toHaveBeenCalledTimes(2);
    });
    expect(subscriber).not.toHaveBeenCalled();
    callbacks[1]?.(REFERENCE_PRESENTATION_INTERVAL_MS);
    await vi.waitFor(() => {
      expect(present).toHaveBeenCalledTimes(1);
    });
    expect(presentDiagnostics).toHaveBeenCalledTimes(1);

    bindingA.dispose();
    controller.setDiagnosticsSampling({ enabled: true });
    const bindingB = controller.bind(
      createDiagnosticsCapableRoute(present, {
        present: presentDiagnostics,
      }),
    );
    controller.start();
    callbacks[scheduleFrame.mock.calls.length - 1]?.(
      REFERENCE_PRESENTATION_INTERVAL_MS * 2,
    );
    expect(presentDiagnostics).toHaveBeenCalledTimes(2);
    bindingB.dispose();
    const bindingC = controller.bind(
      createDiagnosticsCapableRoute(present, {
        present: presentDiagnostics,
      }),
    );
    const scheduledBeforeStaleCompletion = scheduleFrame.mock.calls.length;
    releases[1]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(subscriber).not.toHaveBeenCalled();
    expect(scheduleFrame).toHaveBeenCalledTimes(scheduledBeforeStaleCompletion);
    bindingC.dispose();
  });

  it("routes diagnostics rejection to onError and stops the single present loop", async () => {
    const { callbacks, scheduleFrame } = createScheduler();
    const onError = vi.fn();
    const present = vi.fn(async () => createReceipt(1));
    const presentDiagnostics = vi.fn(async () => {
      throw new Error("Synthetic Engineering diagnostics rejection.");
    });
    const controller = createReferenceHostPresentationController({
      scheduleFrame,
      cancelFrame: vi.fn(),
      onError,
    });
    controller.setDiagnosticsSampling({ enabled: true });
    const binding = controller.bind(
      createDiagnosticsCapableRoute(present, {
        present: presentDiagnostics,
      }),
    );
    controller.start();
    callbacks[0]?.(0);

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      message: "Synthetic Engineering diagnostics rejection.",
    });
    expect(presentDiagnostics).toHaveBeenCalledTimes(1);
    expect(present).not.toHaveBeenCalled();
    expect(scheduleFrame).toHaveBeenCalledTimes(1);
    binding.dispose();
  });
});
