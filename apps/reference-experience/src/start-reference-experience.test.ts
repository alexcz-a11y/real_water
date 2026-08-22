import { afterEach, describe, expect, it } from "vitest";
import {
  createMemoryHostLifecycleAdapter,
  createMinimalWaterQualityProfile,
  createStaticHostPresentationAdapter,
  createStaticHostSimulationAdapter,
} from "real-water";
import { createReferenceEnvironmentAdapter } from "./reference-optical-inputs.js";
import { createReferenceHostSimulationController } from "./reference-simulation-controller.js";
import { startReferenceExperience } from "./start-reference-experience.js";

const INITIAL = Object.freeze({
  drawingBufferWidth: 320,
  drawingBufferHeight: 180,
});
const NEXT = Object.freeze({
  drawingBufferWidth: 384,
  drawingBufferHeight: 216,
});

let currentSession: ReturnType<typeof startReferenceExperience> | null = null;
let mount: {
  querySelector(selector: string): { dataset?: DOMStringMap } | null;
};

describe("ReferenceExperienceSession.applyQualityProfile", () => {
  afterEach(async () => {
    await currentSession?.dispose();
    currentSession = null;
  });

  it("re-enters the Loading Experience when the same Quality Profile is applied", async () => {
    const session = startSession();
    await waitForReady(session);
    const before = session.snapshot();

    const applying = session.applyQualityProfile(
      createMinimalWaterQualityProfile("minimal"),
    );

    expect(session.snapshot().state).toBe("loading");
    expect(mount.querySelector("[data-testid='reference-stage']")).toBeNull();
    expect(
      mount.querySelector("[data-testid='loading-experience']"),
    ).not.toBeNull();

    await applying;
    await waitForReady(session);
    const after = session.snapshot();
    expect(after.generation).toBe(before.generation + 1);
    expect(after.manifestHash).toBe(before.manifestHash);
  });
});

describe("ReferenceExperienceSession.applyViewport", () => {
  afterEach(async () => {
    await currentSession?.dispose();
    currentSession = null;
  });

  it("records the drawing buffer on the snapshot and no-ops an exact repeat", async () => {
    const session = startSession();
    await waitForReady(session);

    const first = session.snapshot();
    expect(first.state).toBe("ready");
    expect(first.viewport).toEqual(INITIAL);
    expect(Object.isFrozen(first.viewport)).toBe(true);

    await session.applyViewport(INITIAL);
    const afterSame = session.snapshot();
    expect(afterSame.generation).toBe(first.generation);
    expect(afterSame.manifestHash).toBe(first.manifestHash);
    expect(afterSame.viewport).toEqual(INITIAL);
  });

  it("schedules a full conceal and reprepare when the physical size changes", async () => {
    const session = startSession();
    await waitForReady(session);
    const before = session.snapshot();

    const changed = session.applyViewport(NEXT);
    expect(session.snapshot().state).toBe("loading");
    expect(mount.querySelector("[data-testid='reference-stage']")).toBeNull();
    expect(
      mount.querySelector("[data-testid='loading-experience']"),
    ).not.toBeNull();

    await changed;
    await waitForReady(session);
    const after = session.snapshot();
    expect(after.generation).toBe(before.generation + 1);
    expect(after.manifestHash).not.toBe(before.manifestHash);
    expect(after.qualityProfileId).toBe(before.qualityProfileId);
    expect(after.viewport).toEqual(NEXT);
  });

  it("keeps only the latest rapid viewport revision", async () => {
    const session = startSession();
    await waitForReady(session);
    const before = session.snapshot();

    const first = session.applyViewport({
      drawingBufferWidth: 400,
      drawingBufferHeight: 200,
    });
    const second = session.applyViewport(NEXT);
    await first;
    await second;
    await waitForReady(session);

    const after = session.snapshot();
    expect(after.generation).toBe(before.generation + 1);
    expect(after.viewport).toEqual(NEXT);
    expect(after.manifestHash).not.toBe(before.manifestHash);
  });
});

describe("ReferenceExperienceSession.reportPresentationFailure", () => {
  afterEach(async () => {
    await currentSession?.dispose();
    currentSession = null;
  });

  it("conceals the ready canvas and shows a retryable failed Loading Experience", async () => {
    const session = startSession();
    await waitForReady(session);
    const before = session.snapshot();

    await session.reportPresentationFailure(
      new Error("Synthetic Core presentation rejection."),
    );

    const after = session.snapshot();
    expect(after.state).toBe("failed");
    expect(after.generation).toBe(before.generation);
    expect(mount.querySelector("[data-testid='reference-stage']")).toBeNull();
    const loading = mount.querySelector("[data-testid='loading-experience']");
    expect(loading).not.toBeNull();
    expect(loading?.dataset?.state).toBe("failed");
    expect(mount.querySelector("[data-testid='loading-alert']")).not.toBeNull();
    expect(
      mount.querySelector("[data-testid='retry-preparation']"),
    ).not.toBeNull();
  });

  it("starts a fresh attempt when Retry is used after a presentation failure", async () => {
    const session = startSession();
    await waitForReady(session);
    const before = session.snapshot();
    await session.reportPresentationFailure(new Error("presentation failed"));

    const retry = mount.querySelector("[data-testid='retry-preparation']") as {
      click?: () => void;
    } | null;
    retry?.click?.();
    await waitForReady(session);

    const after = session.snapshot();
    expect(after.state).toBe("ready");
    expect(after.generation).toBe(before.generation + 1);
    expect(
      mount.querySelector("[data-testid='reference-stage']"),
    ).not.toBeNull();
  });

  it("becomes ready with the Reference Host Simulation at seed 0", async () => {
    const simulation = createReferenceHostSimulationController();
    installMinimalDocument();
    mount = document.createElement("div") as unknown as typeof mount;
    document.body.append(mount as unknown as Node);
    const session = startReferenceExperience(mount as unknown as Element, {
      initialDrawingBuffer: {
        width: INITIAL.drawingBufferWidth,
        height: INITIAL.drawingBufferHeight,
      },
      createHostAttempt: (drawingBuffer) => ({
        host: createMemoryHostLifecycleAdapter({
          simulation,
          environment: createReferenceEnvironmentAdapter(),
          presentation: createStaticHostPresentationAdapter(),
          stepDelayMs: 0,
        }),
        createReadyStage: () => {
          const stage = document.createElement("main");
          stage.dataset.testid = "reference-stage";
          return stage;
        },
        dispose() {
          void drawingBuffer;
        },
      }),
      revealDelayFrames: 1,
    });
    currentSession = session;
    await waitForReady(session);
    expect(simulation.snapshot()).toEqual({
      seed: 0,
      tick: 0,
      timeSeconds: 0,
      paused: false,
      originX: 0,
      originZ: 0,
      simulationResetRevision: 0,
    });
  });

  it("ignores a stale presentation failure after a newer generation starts", async () => {
    const session = startSession();
    await waitForReady(session);
    const before = session.snapshot();
    const stale = session.reportPresentationFailure(new Error("stale"));
    const newer = session.applyViewport(NEXT);
    await stale;
    await newer;
    await waitForReady(session);
    const after = session.snapshot();
    expect(after.state).toBe("ready");
    expect(after.generation).toBe(before.generation + 1);
    expect(after.viewport).toEqual(NEXT);
  });
});

function startSession() {
  installMinimalDocument();
  mount = document.createElement("div") as unknown as typeof mount;
  document.body.append(mount as unknown as Node);
  const session = startReferenceExperience(mount as unknown as Element, {
    initialDrawingBuffer: {
      width: INITIAL.drawingBufferWidth,
      height: INITIAL.drawingBufferHeight,
    },
    createHostAttempt: (drawingBuffer) => ({
      host: createMemoryHostLifecycleAdapter({
        simulation: createStaticHostSimulationAdapter(),
        environment: createReferenceEnvironmentAdapter(),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
      createReadyStage: () => {
        const stage = document.createElement("main");
        stage.dataset.testid = "reference-stage";
        return stage;
      },
      dispose() {
        void drawingBuffer;
      },
    }),
    revealDelayFrames: 1,
  });
  currentSession = session;
  return session;
}

async function waitForReady(
  session: ReturnType<typeof startReferenceExperience>,
): Promise<void> {
  const started = Date.now();
  while (session.snapshot().state !== "ready") {
    if (Date.now() - started > 2_000) {
      throw new Error(
        `Reference Experience stayed ${session.snapshot().state}.`,
      );
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

function installMinimalDocument(): void {
  const frames = new Map<number, () => void>();
  let nextFrame = 1;
  const requestAnimationFrame = (callback: (time: number) => void): number => {
    const id = nextFrame;
    nextFrame += 1;
    frames.set(id, () => callback(0));
    queueMicrotask(() => {
      const frame = frames.get(id);
      if (frame !== undefined) {
        frames.delete(id);
        frame();
      }
    });
    return id;
  };
  const cancelAnimationFrame = (id: number): void => {
    frames.delete(id);
  };

  if (typeof document !== "undefined" && "createElement" in document) {
    if (typeof globalThis.requestAnimationFrame !== "function") {
      Object.defineProperty(globalThis, "requestAnimationFrame", {
        configurable: true,
        value: requestAnimationFrame,
      });
      Object.defineProperty(globalThis, "cancelAnimationFrame", {
        configurable: true,
        value: cancelAnimationFrame,
      });
    }
    return;
  }

  class FakeElement {
    readonly children: FakeElement[] = [];
    readonly dataset: Record<string, string> = {};
    readonly style: Record<string, string> = {};
    readonly listeners = new Map<string, Array<() => void>>();
    className = "";
    hidden = false;
    disabled = false;
    id = "";
    textContent = "";
    type = "";
    tabIndex = 0;
    max = 1;
    value = 0;
    parent: FakeElement | null = null;

    setAttribute(name: string, value: string): void {
      if (name.startsWith("data-")) {
        this.dataset[name.slice(5)] = value;
      }
    }
    getAttribute(name: string): string | null {
      if (name.startsWith("data-")) {
        return this.dataset[name.slice(5)] ?? null;
      }
      return null;
    }
    addEventListener(name: string, listener: () => void): void {
      const existing = this.listeners.get(name) ?? [];
      existing.push(listener);
      this.listeners.set(name, existing);
    }
    removeEventListener(name: string, listener: () => void): void {
      const existing = this.listeners.get(name);
      if (existing === undefined) {
        return;
      }
      this.listeners.set(
        name,
        existing.filter((candidate) => candidate !== listener),
      );
    }
    click(): void {
      for (const listener of this.listeners.get("click") ?? []) {
        listener();
      }
    }
    append(...nodes: FakeElement[]): void {
      for (const node of nodes) {
        node.parent = this;
        this.children.push(node);
      }
    }
    replaceChildren(...nodes: FakeElement[]): void {
      for (const child of this.children) {
        child.parent = null;
      }
      this.children.length = 0;
      this.append(...nodes);
    }
    remove(): void {
      if (this.parent === null) {
        return;
      }
      const index = this.parent.children.indexOf(this);
      if (index >= 0) {
        this.parent.children.splice(index, 1);
      }
      this.parent = null;
    }
    focus(): void {}
    querySelector(selector: string): FakeElement | null {
      const testId = selector.match(/\[data-testid=['"]([^'"]+)['"]\]/u)?.[1];
      if (testId === undefined) {
        return null;
      }
      if (this.dataset.testid === testId) {
        return this;
      }
      for (const child of this.children) {
        const match = child.querySelector(selector);
        if (match !== null) {
          return match;
        }
      }
      return null;
    }
  }

  const body = new FakeElement();
  const documentRoot = {
    body,
    createElement() {
      return new FakeElement();
    },
    createRange() {
      return { selectNodeContents() {} };
    },
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentRoot,
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: requestAnimationFrame,
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: cancelAnimationFrame,
  });
}
