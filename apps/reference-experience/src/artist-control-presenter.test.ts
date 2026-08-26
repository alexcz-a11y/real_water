import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createArtistControlPresenter,
  type ArtistControlPresenter,
} from "./artist-control-presenter.js";
import {
  createReferenceControlModel,
  type ReferenceControlDescriptors,
  type ReferenceControlModel,
  type ReferenceControlSnapshot,
  type ReferenceControlSubscriber,
} from "./reference-control-model.js";

describe("Artist Control Presenter", () => {
  beforeEach(() => {
    vi.stubGlobal("document", new FakeDocument());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("labels and describes every current Artist numeric descriptor", () => {
    const mount = new FakeElement("div");
    const model = createReferenceControlModel({
      applyQualityProfile: vi.fn(),
    });
    const presenter = createArtistControlPresenter(
      mount as unknown as Element,
      model,
      vi.fn(),
    );
    const root = requiredByTestId(mount, "artist-control-presenter");
    const artistDescriptors = model.descriptors.numeric.filter(
      (descriptor) => descriptor.audience === "artist" && !descriptor.readOnly,
    );

    expect(artistDescriptors.length).toBeGreaterThan(0);
    for (const descriptor of artistDescriptors) {
      const testId = descriptor.id.replace(/[^a-zA-Z0-9]+/gu, "-");
      const input = requiredByTestId(root, `artist-input-${testId}`);
      const label = findAll(root, "LABEL").find(
        (candidate) => candidate.getAttribute("for") === input.id,
      );
      const descriptionId = input.getAttribute("aria-describedby");
      expect(label?.textContent).toBe(descriptor.label);
      expect(requiredById(root, descriptionId ?? "").textContent).toBe(
        descriptor.description,
      );
      expect(input.type).toBe("range");
      expect(input.min).toBe(String(descriptor.min));
      expect(input.max).toBe(String(descriptor.max));
      expect(input.step).toBe(String(descriptor.step));
    }

    presenter.dispose();
    model.dispose();
  });

  it("renders native, explicitly described controls for Artist descriptors only", () => {
    const fixture = createFixture();

    fixture.createPresenter();

    const root = requiredByTestId(fixture.mount, "artist-control-presenter");
    expect(root.tagName).toBe("ASIDE");
    const titleId = root.getAttribute("aria-labelledby");
    expect(titleId).not.toBeNull();
    expect(requiredById(root, titleId ?? "").textContent).toBe(
      "Artist controls",
    );

    const waveInput = requiredByTestId(root, "artist-input-waveStrength");
    expect(waveInput.tagName).toBe("INPUT");
    expect(waveInput.type).toBe("range");
    expect(waveInput.min).toBe("0");
    expect(waveInput.max).toBe("2");
    expect(waveInput.step).toBe("0.01");

    const label = findAll(root, "LABEL").find(
      (candidate) => candidate.getAttribute("for") === waveInput.id,
    );
    expect(label?.textContent).toBe("Wave presence");
    const descriptionId = waveInput.getAttribute("aria-describedby");
    expect(requiredById(root, descriptionId ?? "").textContent).toBe(
      "Sets the sea's overall visual strength.",
    );

    expect(requiredByTestId(root, "artist-group-sea-character").tagName).toBe(
      "FIELDSET",
    );
    expect(findAll(root, "LEGEND").map((legend) => legend.textContent)).toEqual(
      ["Sea character", "Storm front", "Hero breaker"],
    );
    expect(
      findByTestId(root, "artist-input-heroBreaker-priority"),
    ).toBeUndefined();
    expect(
      findByTestId(root, "artist-input-heroBreaker-lifetimeTicks"),
    ).toBeUndefined();
    expect(findAll(root, "SELECT")).toHaveLength(0);
  });

  it("forwards native events and updates persistent controls from model events", () => {
    const fixture = createFixture();
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    fixture.createPresenter();
    const root = requiredByTestId(fixture.mount, "artist-control-presenter");
    const waveInput = requiredByTestId(root, "artist-input-waveStrength");

    expect(waveInput.value).toBe("1.1");
    expect(
      requiredByTestId(root, "artist-output-waveStrength").textContent,
    ).toBe("1.1");
    waveInput.value = "1.35";
    waveInput.emit("input");
    expect(fixture.model.setNumeric).toHaveBeenCalledWith("waveStrength", 1.35);

    fixture.publish({
      artisticControls: { waveStrength: 1.5 },
    });
    expect(requiredByTestId(root, "artist-input-waveStrength")).toBe(waveInput);
    expect(waveInput.value).toBe("1.5");
    expect(waveInput.getAttribute("aria-valuetext")).toBe("Wave presence: 1.5");

    fixture.model.setNumeric.mockImplementationOnce(() => {
      throw new RangeError("Synthetic rejected control value.");
    });
    waveInput.value = "0";
    waveInput.emit("input");
    expect(waveInput.value).toBe("1.5");
    expect(
      requiredByTestId(root, "artist-output-waveStrength").textContent,
    ).toBe("1.5");
    expect(
      requiredByTestId(root, "artist-reload-status").textContent,
    ).toContain("Synthetic rejected control value");

    requiredByTestId(root, "artist-action-heroBreaker-submit").click();
    expect(fixture.model.invoke).toHaveBeenCalledWith("heroBreaker.submit");
    requiredByTestId(root, "open-engineering-controls").click();
    expect(fixture.requestEngineeringMode).toHaveBeenCalledTimes(1);

    fixture.publish({ reloadRequired: true });
    const status = requiredByTestId(root, "artist-reload-status");
    expect(status.textContent).toBe("Reload required");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("unsubscribes, removes listeners and removes its root on dispose", () => {
    const fixture = createFixture();
    const presenter = fixture.createPresenter();
    const root = requiredByTestId(fixture.mount, "artist-control-presenter");
    const input = requiredByTestId(root, "artist-input-waveStrength");
    const engineeringButton = requiredByTestId(
      root,
      "open-engineering-controls",
    );

    presenter.dispose();
    presenter.dispose();

    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fixture.mount.children).toHaveLength(0);
    input.value = "1.75";
    input.emit("input");
    engineeringButton.click();
    expect(fixture.model.setNumeric).not.toHaveBeenCalled();
    expect(fixture.requestEngineeringMode).not.toHaveBeenCalled();
  });
});

const DESCRIPTORS = {
  numeric: [
    {
      id: "waveStrength",
      source: "artistic-control",
      audience: "artist",
      label: "Wave presence",
      description: "Sets the sea's overall visual strength.",
      group: "sea-character",
      min: 0,
      max: 2,
      step: 0.01,
      readOnly: false,
      advanced: false,
      read: (snapshot: ReferenceControlSnapshot) =>
        snapshot.artisticControls.waveStrength,
    },
    {
      id: "environment.weather.rainIntensity",
      source: "environment",
      audience: "artist",
      label: "Rain presence",
      description: "Sets the visible rain presence.",
      group: "storm-front",
      min: 0,
      max: 1,
      step: 0.01,
      readOnly: false,
      advanced: false,
      read: (snapshot: ReferenceControlSnapshot) =>
        snapshot.environment.weather.rainIntensity,
      update: (current: ReferenceControlSnapshot["environment"]) => current,
    },
    {
      id: "heroBreaker.amplitudeMetres",
      source: "hero-breaker",
      audience: "artist",
      label: "Breaker drama",
      description: "Sets the local breaker's visual drama.",
      group: "hero-breaker",
      min: 0.1,
      max: 4,
      step: 0.05,
      readOnly: false,
      advanced: false,
      read: (snapshot: ReferenceControlSnapshot) =>
        snapshot.heroBreakerDraft.amplitudeMetres,
      update: (current: ReferenceControlSnapshot["heroBreakerDraft"]) =>
        current,
    },
    {
      id: "heroBreaker.priority",
      source: "hero-breaker",
      audience: "engineering",
      label: "Breaker priority",
      description: "Shows the submitted disturbance priority.",
      group: "hero-breaker",
      min: 0,
      max: 255,
      step: 1,
      readOnly: true,
      advanced: true,
      read: (snapshot: ReferenceControlSnapshot) =>
        snapshot.heroBreakerDraft.priority,
      update: (current: ReferenceControlSnapshot["heroBreakerDraft"]) =>
        current,
    },
    {
      id: "heroBreaker.lifetimeTicks",
      source: "hero-breaker",
      audience: "artist",
      label: "Breaker ticks",
      description: "Shows the structural tick lifetime.",
      group: "hero-breaker",
      min: 1,
      max: 600,
      step: 1,
      readOnly: true,
      advanced: true,
      read: (snapshot: ReferenceControlSnapshot) =>
        snapshot.heroBreakerDraft.lifetimeTicks,
      update: (current: ReferenceControlSnapshot["heroBreakerDraft"]) =>
        current,
    },
  ],
  actions: [
    {
      id: "heroBreaker.submit",
      audience: "artist",
      label: "Create Hero Breaker",
      description: "Creates the prepared local breaking-wave event.",
      group: "hero-breaker",
      advanced: false,
    },
    {
      id: "qualityProfile.apply",
      audience: "engineering",
      label: "Apply quality profile",
      description: "Prepares the structural draft.",
      group: "quality-profile",
      advanced: true,
    },
  ],
  structural: [
    {
      id: "qualityProfile.id",
      audience: "engineering",
      label: "Quality profile",
      description: "Selects a structural quality draft.",
      options: ["minimal", "minimal-high-detail"],
      applyActionId: "qualityProfile.apply",
    },
  ],
  effects: [],
  monitors: [],
} as const satisfies ReferenceControlDescriptors;

function createFixture(): {
  readonly createPresenter: () => ArtistControlPresenter;
  readonly model: ReferenceControlModel & {
    readonly invoke: ReturnType<typeof vi.fn>;
    readonly setNumeric: ReturnType<typeof vi.fn>;
  };
  readonly mount: FakeElement;
  readonly publish: (change: {
    readonly artisticControls?: Readonly<Record<string, number>>;
    readonly reloadRequired?: boolean;
  }) => void;
  readonly requestEngineeringMode: ReturnType<typeof vi.fn>;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
} {
  const mount = new FakeElement("div");
  let subscriber: ReferenceControlSubscriber | undefined;
  let snapshot = createSnapshot();
  const unsubscribe = vi.fn(() => {
    subscriber = undefined;
  });
  const model = {
    descriptors: DESCRIPTORS,
    snapshot: vi.fn(() => snapshot),
    subscribe: vi.fn((next: ReferenceControlSubscriber) => {
      subscriber = next;
      next(snapshot);
      return unsubscribe;
    }),
    setNumeric: vi.fn(),
    invoke: vi.fn(),
    setQualityProfileDraft: vi.fn(),
    setHeavyDiagnostics: vi.fn(),
    bind: vi.fn(),
    unbind: vi.fn(),
    dispose: vi.fn(),
  } as unknown as ReferenceControlModel & {
    readonly invoke: ReturnType<typeof vi.fn>;
    readonly setNumeric: ReturnType<typeof vi.fn>;
  };
  const requestEngineeringMode = vi.fn();

  return {
    createPresenter: () =>
      createArtistControlPresenter(
        mount as unknown as Element,
        model,
        requestEngineeringMode,
      ),
    model,
    mount,
    publish(change): void {
      snapshot = {
        ...snapshot,
        artisticControls: change.artisticControls ?? snapshot.artisticControls,
        qualityProfile: {
          ...snapshot.qualityProfile,
          reloadRequired:
            change.reloadRequired ?? snapshot.qualityProfile.reloadRequired,
        },
      } as ReferenceControlSnapshot;
      subscriber?.(snapshot);
    },
    requestEngineeringMode,
    unsubscribe,
  };
}

function createSnapshot(): ReferenceControlSnapshot {
  return {
    revision: 1,
    state: "bound",
    artisticControls: { waveStrength: 1.1 },
    environment: {
      lighting: {},
      weather: { rainIntensity: 0.25 },
      atmosphere: {},
    },
    heroBreakerDraft: {
      amplitudeMetres: 2.25,
    },
    qualityProfile: {
      activeId: "minimal",
      draftId: "minimal",
      reloadRequired: false,
      applying: false,
    },
    effects: [],
    runtime: null,
    diagnostics: {
      enabled: false,
      outputs: [],
      latest: null,
    },
  } as unknown as ReferenceControlSnapshot;
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<
    string,
    Set<EventListenerOrEventListenerObject>
  >();
  readonly tagName: string;
  className = "";
  disabled = false;
  id = "";
  max = "";
  min = "";
  parent: FakeElement | null = null;
  step = "";
  textContent = "";
  type = "";
  value = "";

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get valueAsNumber(): number {
    return Number(this.value);
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  click(): void {
    if (!this.disabled) {
      this.emit("click");
    }
  }

  emit(type: string): void {
    const event = {
      currentTarget: this,
      target: this,
      type,
    } as unknown as Event;
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
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

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of this.children) {
      child.parent = null;
    }
    this.children.length = 0;
    this.append(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

function findAll(root: FakeElement, tagName: string): FakeElement[] {
  const matches = root.tagName === tagName ? [root] : [];
  for (const child of root.children) {
    matches.push(...findAll(child, tagName));
  }
  return matches;
}

function findById(root: FakeElement, id: string): FakeElement | undefined {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    const match = findById(child, id);
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
}

function findByTestId(
  root: FakeElement,
  testId: string,
): FakeElement | undefined {
  if (root.dataset.testid === testId) {
    return root;
  }
  for (const child of root.children) {
    const match = findByTestId(child, testId);
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
}

function requiredById(root: FakeElement, id: string): FakeElement {
  const match = findById(root, id);
  if (match === undefined) {
    throw new Error(`Missing element id: ${id}`);
  }
  return match;
}

function requiredByTestId(root: FakeElement, testId: string): FakeElement {
  const match = findByTestId(root, testId);
  if (match === undefined) {
    throw new Error(`Missing element data-testid: ${testId}`);
  }
  return match;
}
