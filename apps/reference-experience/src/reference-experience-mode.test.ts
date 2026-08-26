import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REFERENCE_AUTHORED_LOOKS,
  createReferenceExperienceModeController,
  createReferenceExperienceModePresenter,
  type AuthoredLookId,
  type ReferenceExperienceMode,
  type ReferenceExperienceModeController,
  type ReferenceExperienceModeControllerOptions,
  type ReferenceExperienceModeSubscriber,
} from "./reference-experience-mode.js";

describe("Reference Experience mode controller", () => {
  it("starts in Director, synchronously subscribes, and freezes its authored state", () => {
    const fixture = createControllerFixture();
    const subscriber = vi.fn();

    const unsubscribe = fixture.controller.subscribe(subscriber);

    expect(fixture.controller.snapshot()).toEqual({
      revision: 0,
      mode: "director",
      paused: false,
      activeLook: "calm-sunrise",
    });
    expect(Object.isFrozen(fixture.controller.snapshot())).toBe(true);
    expect(Object.isFrozen(REFERENCE_AUTHORED_LOOKS)).toBe(true);
    expect(
      REFERENCE_AUTHORED_LOOKS.every((look) => Object.isFrozen(look)),
    ).toBe(true);
    expect(REFERENCE_AUTHORED_LOOKS).toEqual([
      { id: "calm-sunrise", label: "Calm Sunrise" },
      { id: "blue-noon-swell", label: "Blue Noon Swell" },
      { id: "storm-front", label: "Storm Front" },
    ]);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenLastCalledWith(fixture.controller.snapshot());
    expect(fixture.calls).toEqual([]);

    unsubscribe();
    unsubscribe();
    fixture.controller.reportDirectorLook("blue-noon-swell");
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  it("restores the last authored look without applying it during construction", () => {
    const fixture = createControllerFixture();
    const restored = createReferenceExperienceModeController({
      ...fixture.options,
      initialLook: "storm-front",
    });

    expect(restored.snapshot()).toMatchObject({
      mode: "director",
      activeLook: "storm-front",
    });
    expect(fixture.calls).toEqual([]);
    expect(() =>
      createReferenceExperienceModeController({
        ...fixture.options,
        initialLook: "unknown" as AuthoredLookId,
      }),
    ).toThrowError(/Unknown authored look/i);
  });

  it("orders app-composition callbacks and makes repeated mode selection idempotent", () => {
    const fixture = createControllerFixture();

    fixture.controller.setMode("director");
    expect(fixture.calls).toEqual([]);
    expect(fixture.controller.snapshot().revision).toBe(0);

    fixture.controller.setMode("sandbox");
    expect(fixture.calls).toEqual([
      "showcase:false",
      "sandbox-input:true",
      "paused:false",
    ]);
    expect(fixture.controller.snapshot()).toEqual({
      revision: 1,
      mode: "sandbox",
      paused: false,
      activeLook: "calm-sunrise",
    });

    fixture.controller.setMode("sandbox");
    expect(fixture.calls).toHaveLength(3);
    expect(fixture.controller.snapshot().revision).toBe(1);

    fixture.controller.setMode("director");
    expect(fixture.calls).toEqual([
      "showcase:false",
      "sandbox-input:true",
      "paused:false",
      "sandbox-input:false",
      "paused:false",
      "manual-look:release",
      "showcase:true",
      "director:reset",
    ]);
    expect(fixture.controller.snapshot()).toEqual({
      revision: 2,
      mode: "director",
      paused: false,
      activeLook: "calm-sunrise",
    });

    fixture.controller.setMode("director");
    expect(fixture.calls).toHaveLength(8);
    expect(fixture.controller.snapshot().revision).toBe(2);
  });

  it("limits pause and manual looks to Sandbox and coordinates each mode's reset", () => {
    const fixture = createControllerFixture();

    expect(() => fixture.controller.setPaused(true)).toThrowError(/Sandbox/i);
    expect(() =>
      fixture.controller.selectSandboxLook("storm-front"),
    ).toThrowError(/Sandbox/i);
    fixture.controller.reset();
    expect(fixture.calls).toEqual(["director:reset"]);
    expect(fixture.controller.snapshot().revision).toBe(1);

    fixture.controller.reportDirectorLook("blue-noon-swell");
    fixture.controller.reportDirectorLook("blue-noon-swell");
    expect(fixture.controller.snapshot()).toMatchObject({
      revision: 2,
      activeLook: "blue-noon-swell",
    });

    fixture.controller.setMode("sandbox");
    fixture.calls.length = 0;
    expect(() =>
      fixture.controller.reportDirectorLook("storm-front"),
    ).toThrowError(/Director/i);

    fixture.controller.setPaused(true);
    fixture.controller.setPaused(true);
    fixture.controller.selectSandboxLook("storm-front");
    fixture.controller.selectSandboxLook("storm-front");
    expect(fixture.calls).toEqual(["paused:true", "sandbox-look:storm-front"]);
    expect(fixture.controller.snapshot()).toMatchObject({
      paused: true,
      activeLook: "storm-front",
    });

    fixture.controller.reset();
    expect(fixture.calls).toEqual([
      "paused:true",
      "sandbox-look:storm-front",
      "paused:false",
      "sandbox:reset",
    ]);
    expect(fixture.controller.snapshot()).toMatchObject({
      paused: false,
      activeLook: "storm-front",
    });
  });

  it("fails closed on unknown values and after idempotent disposal", () => {
    const fixture = createControllerFixture();

    expect(() =>
      fixture.controller.setMode("qa" as ReferenceExperienceMode),
    ).toThrowError(/Unknown Reference Experience mode/i);
    fixture.controller.setMode("sandbox");
    expect(() =>
      fixture.controller.selectSandboxLook("fog" as AuthoredLookId),
    ).toThrowError(/Unknown authored look/i);
    fixture.controller.setPaused(true);
    fixture.calls.length = 0;

    fixture.controller.dispose();
    fixture.controller.dispose();

    expect(fixture.calls).toEqual(["sandbox-input:false", "paused:false"]);
    expect(() => fixture.controller.snapshot()).toThrowError(/disposed/i);
    expect(() => fixture.controller.setMode("director")).toThrowError(
      /disposed/i,
    );
    expect(() => fixture.controller.setPaused(false)).toThrowError(/disposed/i);
    expect(() => fixture.controller.reset()).toThrowError(/disposed/i);
    expect(() =>
      fixture.controller.selectSandboxLook("calm-sunrise"),
    ).toThrowError(/disposed/i);
    expect(() =>
      fixture.controller.reportDirectorLook("storm-front"),
    ).toThrowError(/disposed/i);
    expect(() => fixture.controller.subscribe(vi.fn())).toThrowError(
      /disposed/i,
    );
  });
});

describe("Reference Experience mode presenter", () => {
  beforeEach(() => {
    vi.stubGlobal("document", new FakeDocument());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders semantic Director state with live status and correctly disabled hidden controls", () => {
    const fixture = createControllerFixture();
    const mount = new FakeElement("main");
    const presenter = createReferenceExperienceModePresenter(
      mount as unknown as Element,
      fixture.controller,
    );
    const root = requiredTestId(mount, "reference-experience-mode-presenter");
    const heading = requiredTestId(root, "reference-experience-mode-heading");
    const director = requiredTestId(root, "reference-experience-mode-director");
    const sandbox = requiredTestId(root, "reference-experience-mode-sandbox");
    const status = requiredTestId(root, "reference-experience-mode-status");
    const currentLook = requiredTestId(
      root,
      "reference-experience-active-look",
    );
    const directorControls = requiredTestId(
      root,
      "reference-experience-director-controls",
    );
    const sandboxControls = requiredTestId(
      root,
      "reference-experience-sandbox-controls",
    );
    const restart = requiredTestId(
      root,
      "reference-experience-director-restart",
    );
    const lookSelect = requiredTestId(
      root,
      "reference-experience-sandbox-look",
    );
    const pause = requiredTestId(root, "reference-experience-sandbox-pause");
    const reset = requiredTestId(root, "reference-experience-sandbox-reset");
    const instructions = requiredTestId(
      root,
      "reference-experience-sandbox-instructions",
    );

    expect(root.tagName).toBe("aside");
    expect(root.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(director.tagName).toBe("button");
    expect(sandbox.tagName).toBe("button");
    expect(director.getAttribute("aria-pressed")).toBe("true");
    expect(sandbox.getAttribute("aria-pressed")).toBe("false");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(status.textContent).toBe("Director mode active.");
    expect(currentLook.tagName).toBe("output");
    expect(currentLook.value).toBe("Calm Sunrise");
    expect(directorControls.hidden).toBe(false);
    expect(sandboxControls.hidden).toBe(true);
    expect(restart.disabled).toBe(false);
    expect(lookSelect.disabled).toBe(true);
    expect(pause.disabled).toBe(true);
    expect(reset.disabled).toBe(true);
    expect(lookSelect.tagName).toBe("select");
    expect(lookSelect.children.map(({ value }) => value)).toEqual([
      "calm-sunrise",
      "blue-noon-swell",
      "storm-front",
    ]);
    expect(lookSelect.children.map(({ textContent }) => textContent)).toEqual([
      "Calm Sunrise",
      "Blue Noon Swell",
      "Storm Front",
    ]);
    expect(instructions.textContent).toContain("mouse");
    expect(instructions.textContent).toContain("wheel");
    expect(instructions.textContent).toContain("WASD");
    expect(instructions.textContent).toContain("arrow keys");

    presenter.dispose();
  });

  it("supports mode clicks, keyboard traversal, look selection, pause, and reset", () => {
    const fixture = createControllerFixture();
    const mount = new FakeElement("main");
    const presenter = createReferenceExperienceModePresenter(
      mount as unknown as Element,
      fixture.controller,
    );
    const root = requiredTestId(mount, "reference-experience-mode-presenter");
    const director = requiredTestId(root, "reference-experience-mode-director");
    const sandbox = requiredTestId(root, "reference-experience-mode-sandbox");
    const status = requiredTestId(root, "reference-experience-mode-status");
    const currentLook = requiredTestId(
      root,
      "reference-experience-active-look",
    );
    const directorControls = requiredTestId(
      root,
      "reference-experience-director-controls",
    );
    const sandboxControls = requiredTestId(
      root,
      "reference-experience-sandbox-controls",
    );
    const restart = requiredTestId(
      root,
      "reference-experience-director-restart",
    );
    const lookSelect = requiredTestId(
      root,
      "reference-experience-sandbox-look",
    );
    const pause = requiredTestId(root, "reference-experience-sandbox-pause");
    const reset = requiredTestId(root, "reference-experience-sandbox-reset");

    const arrowRight = new FakeKeyboardEvent("ArrowRight");
    director.dispatch("keydown", arrowRight);
    expect(arrowRight.defaultPrevented).toBe(true);
    expect(sandbox.focused).toBe(true);
    expect(fixture.controller.snapshot().mode).toBe("sandbox");
    expect(director.getAttribute("aria-pressed")).toBe("false");
    expect(sandbox.getAttribute("aria-pressed")).toBe("true");
    expect(directorControls.hidden).toBe(true);
    expect(sandboxControls.hidden).toBe(false);
    expect(restart.disabled).toBe(true);
    expect(lookSelect.disabled).toBe(false);
    expect(pause.disabled).toBe(false);
    expect(reset.disabled).toBe(false);
    expect(status.textContent).toContain("Simulation running");

    const arrowLeft = new FakeKeyboardEvent("ArrowLeft");
    sandbox.dispatch("keydown", arrowLeft);
    expect(arrowLeft.defaultPrevented).toBe(true);
    expect(director.focused).toBe(true);
    expect(fixture.controller.snapshot().mode).toBe("director");

    sandbox.click();
    expect(fixture.controller.snapshot().mode).toBe("sandbox");
    lookSelect.value = "storm-front";
    lookSelect.dispatch("change");
    expect(fixture.controller.snapshot().activeLook).toBe("storm-front");
    expect(currentLook.value).toBe("Storm Front");

    pause.click();
    expect(fixture.controller.snapshot().paused).toBe(true);
    expect(pause.textContent).toBe("Resume");
    expect(status.textContent).toContain("Simulation paused");

    reset.click();
    expect(fixture.controller.snapshot().paused).toBe(false);
    expect(pause.textContent).toBe("Pause");
    expect(fixture.calls.slice(-2)).toEqual(["paused:false", "sandbox:reset"]);

    director.click();
    fixture.calls.length = 0;
    restart.click();
    expect(fixture.calls).toEqual(["director:reset"]);

    presenter.dispose();
  });

  it("idempotently removes DOM, listeners, and the controller subscription", () => {
    const fixture = createControllerFixture();
    const unsubscribe = vi.fn();
    const trackingController = trackSubscription(
      fixture.controller,
      unsubscribe,
    );
    const mount = new FakeElement("main");
    const presenter = createReferenceExperienceModePresenter(
      mount as unknown as Element,
      trackingController,
    );
    const root = requiredTestId(mount, "reference-experience-mode-presenter");
    const sandbox = requiredTestId(root, "reference-experience-mode-sandbox");
    const lookSelect = requiredTestId(
      root,
      "reference-experience-sandbox-look",
    );

    presenter.dispose();
    presenter.dispose();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(mount.children).toHaveLength(0);
    expect(sandbox.disabled).toBe(true);
    expect(lookSelect.disabled).toBe(true);
    expect(sandbox.listenerCount()).toBe(0);
    expect(lookSelect.listenerCount()).toBe(0);
    sandbox.click();
    lookSelect.value = "storm-front";
    lookSelect.dispatch("change");
    expect(fixture.calls).toEqual([]);
    expect(fixture.controller.snapshot().mode).toBe("director");
  });
});

function createControllerFixture(): {
  readonly calls: string[];
  readonly controller: ReferenceExperienceModeController;
  readonly options: ReferenceExperienceModeControllerOptions;
} {
  const calls: string[] = [];
  const options: ReferenceExperienceModeControllerOptions = {
    setShowcaseEnabled(enabled): void {
      calls.push(`showcase:${String(enabled)}`);
    },
    setSandboxInputEnabled(enabled): void {
      calls.push(`sandbox-input:${String(enabled)}`);
    },
    setSimulationPaused(paused): void {
      calls.push(`paused:${String(paused)}`);
    },
    resetDirector(): void {
      calls.push("director:reset");
    },
    resetSandbox(): void {
      calls.push("sandbox:reset");
    },
    selectSandboxLook(look): void {
      calls.push(`sandbox-look:${look}`);
    },
    releaseManualLookOwnership(): void {
      calls.push("manual-look:release");
    },
  };
  return {
    calls,
    options,
    controller: createReferenceExperienceModeController(options),
  };
}

function trackSubscription(
  controller: ReferenceExperienceModeController,
  onUnsubscribe: () => void,
): ReferenceExperienceModeController {
  return Object.freeze({
    snapshot: () => controller.snapshot(),
    subscribe(subscriber: ReferenceExperienceModeSubscriber): () => void {
      const unsubscribe = controller.subscribe(subscriber);
      return () => {
        onUnsubscribe();
        unsubscribe();
      };
    },
    setMode: (mode: ReferenceExperienceMode) => controller.setMode(mode),
    setPaused: (paused: boolean) => controller.setPaused(paused),
    reset: () => controller.reset(),
    selectSandboxLook: (look: AuthoredLookId) =>
      controller.selectSandboxLook(look),
    reportDirectorLook: (look: AuthoredLookId) =>
      controller.reportDirectorLook(look),
    dispose: () => controller.dispose(),
  });
}

function requiredTestId(root: FakeElement, testId: string): FakeElement {
  const element = root.findByTestId(testId);
  if (element === undefined) {
    throw new Error(`Missing test element: ${testId}`);
  }
  return element;
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
}

class FakeEvent {
  defaultPrevented = false;

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class FakeKeyboardEvent extends FakeEvent {
  public constructor(readonly key: string) {
    super();
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<
    string,
    Set<EventListenerOrEventListenerObject>
  >();
  className = "";
  disabled = false;
  focused = false;
  hidden = false;
  id = "";
  parent: FakeElement | null = null;
  textContent = "";
  type = "";
  value = "";

  public constructor(readonly tagName: string) {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: FakeEvent = new FakeEvent()): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") {
        listener(event as unknown as Event);
      } else {
        listener.handleEvent(event as unknown as Event);
      }
    }
  }

  click(): void {
    if (!this.disabled) {
      this.dispatch("click");
    }
  }

  focus(): void {
    this.focused = true;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
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

  listenerCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) {
      count += listeners.size;
    }
    return count;
  }

  findByTestId(testId: string): FakeElement | undefined {
    if (this.dataset.testid === testId) {
      return this;
    }
    for (const child of this.children) {
      const match = child.findByTestId(testId);
      if (match !== undefined) {
        return match;
      }
    }
    return undefined;
  }
}
