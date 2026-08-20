import { describe, expect, it, vi } from "vitest";
import type { HostPresentedFrame } from "real-water";
import { createQaHostPresentationController } from "./qa-presentation-controller.js";

const VALID_MANIFEST_HASH = `sha256:${"ef".repeat(32)}`;

function createReceipt(presentationId: number): HostPresentedFrame {
  return {
    presentationId,
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

describe("QA Host Presentation Controller", () => {
  it("stores the bound Core route and only presents when driven manually", async () => {
    const present = vi.fn(async () => createReceipt(1));
    const controller = createQaHostPresentationController();

    await expect(controller.presentBoundFrame()).rejects.toThrowError(/bound/i);
    const binding = controller.bind({ present });
    expect(present).not.toHaveBeenCalled();

    await expect(controller.presentBoundFrame()).resolves.toMatchObject({
      presentationId: 1,
    });
    expect(present).toHaveBeenCalledTimes(1);

    binding.dispose();
    binding.dispose();
    await expect(controller.presentBoundFrame()).rejects.toThrowError(/bound/i);
    expect(present).toHaveBeenCalledTimes(1);
  });

  it("scopes dispose to the binding generation so a stale dispose leaves the next bind", async () => {
    const presentA = vi.fn(async () => createReceipt(1));
    const presentB = vi.fn(async () => createReceipt(2));
    const controller = createQaHostPresentationController();

    const bindingA = controller.bind({ present: presentA });
    bindingA.dispose();
    const bindingB = controller.bind({ present: presentB });
    bindingA.dispose();

    await expect(controller.presentBoundFrame()).resolves.toMatchObject({
      presentationId: 2,
    });
    expect(presentA).not.toHaveBeenCalled();
    expect(presentB).toHaveBeenCalledTimes(1);

    bindingB.dispose();
    await expect(controller.presentBoundFrame()).rejects.toThrowError(/bound/i);
  });
});
