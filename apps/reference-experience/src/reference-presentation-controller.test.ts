import { describe, expect, it, vi } from "vitest";
import {
  readHostPresentationBinding,
  readHostPresentationRoute,
  type HostPresentedFrame,
} from "real-water";
import {
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

describe("Reference Host Presentation Controller", () => {
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
});
