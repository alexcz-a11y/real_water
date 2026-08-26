import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReferenceEnvironmentPreset,
  createWaterPreset,
} from "real-water";
import type {
  ReferenceControlDescriptors,
  ReferenceControlModel,
  ReferenceControlSnapshot,
  ReferenceControlSubscriber,
} from "./reference-control-model.js";

const paneMock = vi.hoisted(() => {
  type ChangeHandler = (event: Readonly<{ value: unknown }>) => void;

  class FakeBinding {
    readonly handlers: ChangeHandler[] = [];

    constructor(
      readonly target: Record<string, unknown>,
      readonly key: string,
      readonly options: Readonly<Record<string, unknown>> | undefined,
    ) {}

    on(event: "change", handler: ChangeHandler): this {
      if (event === "change") {
        this.handlers.push(handler);
      }
      return this;
    }

    emit(value: unknown): void {
      this.target[this.key] = value;
      for (const handler of this.handlers) {
        handler({ value });
      }
    }
  }

  class FakeButton {
    readonly handlers: (() => void)[] = [];

    constructor(readonly options: Readonly<{ title: string }>) {}

    on(event: "click", handler: () => void): this {
      if (event === "click") {
        this.handlers.push(handler);
      }
      return this;
    }

    click(): void {
      for (const handler of this.handlers) {
        handler();
      }
    }
  }

  interface FakePaneCollections {
    readonly bindings: FakeBinding[];
    readonly buttons: FakeButton[];
    readonly folders: string[];
  }

  class FakeFolder {
    constructor(readonly collections: FakePaneCollections) {}

    addBinding(
      target: Record<string, unknown>,
      key: string,
      options?: Readonly<Record<string, unknown>>,
    ): FakeBinding {
      const binding = new FakeBinding(target, key, options);
      this.collections.bindings.push(binding);
      return binding;
    }

    addButton(options: Readonly<{ title: string }>): FakeButton {
      const button = new FakeButton(options);
      this.collections.buttons.push(button);
      return button;
    }

    addFolder(options: Readonly<{ title: string }>): FakeFolder {
      this.collections.folders.push(options.title);
      return new FakeFolder(this.collections);
    }
  }

  class FakePane extends FakeFolder {
    readonly bindings: FakeBinding[] = [];
    readonly buttons: FakeButton[] = [];
    readonly folders: string[] = [];
    readonly dispose = vi.fn();
    readonly refresh = vi.fn();

    constructor(
      readonly options: Readonly<{
        container: HTMLElement;
        title: string;
      }>,
    ) {
      const collections: FakePaneCollections = {
        bindings: [],
        buttons: [],
        folders: [],
      };
      super(collections);
      this.bindings = collections.bindings;
      this.buttons = collections.buttons;
      this.folders = collections.folders;
      panes.push(this);
    }
  }

  const panes: FakePane[] = [];
  return { Pane: FakePane, panes };
});

vi.mock("tweakpane", () => ({ Pane: paneMock.Pane }));

import { createEngineeringControlPresenter } from "./engineering-control-presenter.js";

describe("Engineering Control Presenter", () => {
  beforeEach(() => {
    paneMock.panes.length = 0;
  });

  it("binds the shared descriptors and refreshes only from model publications", () => {
    vi.useFakeTimers();
    const fixture = createModelFixture();
    const requestArtistMode = vi.fn();
    const container = {} as HTMLElement;

    const presenter = createEngineeringControlPresenter(
      container,
      fixture.model,
      requestArtistMode,
    );

    const pane = paneMock.panes[0];
    expect(pane?.options).toEqual({ container, title: "Engineering" });
    expect(fixture.setEngineeringMonitoring).toHaveBeenCalledWith(true);
    expect(pane?.refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000);
    expect(pane?.refresh).toHaveBeenCalledTimes(1);

    bindingByLabel(pane, "Wave presence").emit(1.4);
    expect(fixture.setNumeric).toHaveBeenCalledWith("waveStrength", 1.4);
    fixture.setNumeric.mockImplementationOnce(() => {
      throw new RangeError("Synthetic rejected control value.");
    });
    const waveBinding = bindingByLabel(pane, "Wave presence");
    const refreshBeforeRejection = pane?.refresh.mock.calls.length ?? 0;
    waveBinding.emit(0);
    expect(waveBinding.target[waveBinding.key]).toBe(
      fixture.snapshot().artisticControls.waveStrength,
    );
    expect(pane?.refresh).toHaveBeenCalledTimes(refreshBeforeRejection + 1);

    bindingByLabel(pane, "Quality profile").emit("minimal-high-detail");
    expect(fixture.setQualityProfileDraft).toHaveBeenCalledWith(
      "minimal-high-detail",
    );
    expect(
      String(bindingByLabel(pane, "Preparation").target.preparation),
    ).toContain("Reload required");

    buttonByTitle(pane, "Submit Hero Breaker").click();
    buttonByTitle(pane, "Apply quality and reload").click();
    expect(fixture.invoke).toHaveBeenNthCalledWith(1, "heroBreaker.submit");
    expect(fixture.invoke).toHaveBeenNthCalledWith(2, "qualityProfile.apply");

    const effect = bindingByLabel(pane, "Hero Breaker");
    const monitor = bindingByLabel(pane, "Runtime tick");
    expect(effect.options?.readonly).toBe(true);
    expect(String(effect.target[effect.key])).toContain("manual");
    expect(monitor.options?.readonly).toBe(true);
    expect(monitor.target[monitor.key]).toBe("120");

    buttonByTitle(pane, "Return to Artist").click();
    expect(requestArtistMode).toHaveBeenCalledTimes(1);

    const runtime = fixture.snapshot().runtime;
    if (runtime === null) {
      throw new Error("Expected a bound runtime snapshot.");
    }
    const refreshBeforePublication = pane?.refresh.mock.calls.length ?? 0;
    fixture.publish({
      ...fixture.snapshot(),
      revision: fixture.snapshot().revision + 1,
      runtime: Object.freeze({
        ...runtime,
        tick: 121,
      }),
    });
    expect(pane?.refresh).toHaveBeenCalledTimes(refreshBeforePublication + 1);
    expect(monitor.target[monitor.key]).toBe("121");

    presenter.dispose();
    presenter.dispose();
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fixture.setEngineeringMonitoring).toHaveBeenLastCalledWith(false);
    expect(pane?.dispose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("keeps heavy diagnostics off until selected prepared outputs are opted in", () => {
    const fixture = createModelFixture();
    const presenter = createEngineeringControlPresenter(
      {} as HTMLElement,
      fixture.model,
      vi.fn(),
    );
    const pane = paneMock.panes[0];

    bindingByLabel(pane, "hero-breaker-foam").emit(true);
    expect(fixture.setHeavyDiagnostics).toHaveBeenLastCalledWith({
      enabled: false,
      outputs: ["hero-breaker-foam"],
    });

    bindingByLabel(pane, "Enable readbacks").emit(true);
    expect(fixture.setHeavyDiagnostics).toHaveBeenLastCalledWith({
      enabled: true,
      outputs: ["hero-breaker-foam"],
    });

    bindingByLabel(pane, "storm-rain-ripples").emit(true);
    expect(fixture.setHeavyDiagnostics).toHaveBeenLastCalledWith({
      enabled: true,
      outputs: ["hero-breaker-foam", "storm-rain-ripples"],
    });

    presenter.dispose();
    expect(fixture.setHeavyDiagnostics).toHaveBeenLastCalledWith({
      enabled: false,
      outputs: ["hero-breaker-foam", "storm-rain-ripples"],
    });
  });
});

function bindingByLabel(
  pane: (typeof paneMock.panes)[number] | undefined,
  label: string,
): (typeof paneMock.panes)[number]["bindings"][number] {
  const binding = pane?.bindings.find(
    (candidate) => candidate.options?.label === label,
  );
  if (binding === undefined) {
    throw new Error(`Missing mocked Tweakpane binding ${label}.`);
  }
  return binding;
}

function buttonByTitle(
  pane: (typeof paneMock.panes)[number] | undefined,
  title: string,
): (typeof paneMock.panes)[number]["buttons"][number] {
  const button = pane?.buttons.find(
    (candidate) => candidate.options.title === title,
  );
  if (button === undefined) {
    throw new Error(`Missing mocked Tweakpane button ${title}.`);
  }
  return button;
}

const DESCRIPTORS = Object.freeze({
  numeric: Object.freeze([
    Object.freeze({
      id: "waveStrength",
      source: "artistic-control",
      audience: "artist",
      label: "Wave presence",
      description: "Overall sea strength.",
      group: "sea-character",
      min: 0,
      max: 2,
      step: 0.01,
      readOnly: false,
      advanced: false,
      read: (snapshot: ReferenceControlSnapshot) =>
        snapshot.artisticControls.waveStrength,
    }),
  ]),
  actions: Object.freeze([
    Object.freeze({
      id: "heroBreaker.submit",
      audience: "artist",
      label: "Submit Hero Breaker",
      description: "Submit the current authored event.",
      group: "hero-breaker",
      advanced: false,
    }),
    Object.freeze({
      id: "qualityProfile.apply",
      audience: "engineering",
      label: "Apply quality and reload",
      description: "Prepare and activate the structural draft.",
      group: "quality-profile",
      advanced: true,
    }),
  ]),
  structural: Object.freeze([
    Object.freeze({
      id: "qualityProfile.id",
      audience: "engineering",
      label: "Quality profile",
      description: "Changing structure requires preparation.",
      options: Object.freeze(["minimal", "minimal-high-detail"] as const),
      applyActionId: "qualityProfile.apply",
    }),
  ]),
  effects: Object.freeze([
    Object.freeze({
      effectId: "hero-breaker",
      variantId: "art-directed",
      label: "Hero Breaker",
      controlIds: Object.freeze(["heroBreaker.submit"] as const),
      diagnosticOutputs: Object.freeze(["hero-breaker-foam"] as const),
      automatic: false,
    }),
    Object.freeze({
      effectId: "storm-front",
      variantId: "prepared",
      label: "Storm Front",
      controlIds: Object.freeze([] as const),
      diagnosticOutputs: Object.freeze(["storm-rain-ripples"] as const),
      automatic: true,
    }),
  ]),
  monitors: Object.freeze([
    Object.freeze({
      id: "simulation-tick",
      audience: "engineering",
      label: "Runtime tick",
      group: "runtime",
      value: "number",
      heavy: false,
      read: (snapshot: ReferenceControlSnapshot) =>
        snapshot.runtime?.tick ?? null,
    }),
    Object.freeze({
      id: "diagnostic-compile-count",
      audience: "engineering",
      label: "Compile count",
      group: "diagnostics",
      value: "number",
      heavy: true,
      read: (snapshot: ReferenceControlSnapshot) =>
        snapshot.diagnostics.latest?.compileCount ?? null,
    }),
  ]),
} satisfies ReferenceControlDescriptors);

function createModelFixture() {
  let snapshot = createSnapshot();
  let subscriber: ReferenceControlSubscriber | undefined;
  const unsubscribe = vi.fn();
  const setEngineeringMonitoring = vi.fn();
  const setNumeric = vi.fn();
  const invoke = vi.fn();
  const setQualityProfileDraft = vi.fn();
  const setHeavyDiagnostics = vi.fn();
  const model = {
    descriptors: DESCRIPTORS,
    snapshot: () => snapshot,
    subscribe: vi.fn((next: ReferenceControlSubscriber) => {
      subscriber = next;
      next(snapshot);
      return unsubscribe;
    }),
    setNumeric,
    invoke,
    setQualityProfileDraft,
    setHeavyDiagnostics,
    setEngineeringMonitoring,
    bind: vi.fn(),
    unbind: vi.fn(),
    dispose: vi.fn(),
  } satisfies ReferenceControlModel;
  return {
    invoke,
    model,
    publish(next: ReferenceControlSnapshot): void {
      snapshot = next;
      subscriber?.(snapshot);
    },
    setEngineeringMonitoring,
    setHeavyDiagnostics,
    setNumeric,
    setQualityProfileDraft,
    snapshot: () => snapshot,
    unsubscribe,
  };
}

function createSnapshot(): ReferenceControlSnapshot {
  const environmentPreset = createReferenceEnvironmentPreset();
  return Object.freeze({
    revision: 3,
    state: "bound",
    artisticControls: createWaterPreset("swell").artisticControls,
    environment: Object.freeze({
      lighting: environmentPreset.lighting,
      weather: environmentPreset.weather,
      atmosphere: environmentPreset.atmosphere,
    }),
    heroBreakerDraft: Object.freeze({
      anchorOffsetX: 0,
      anchorOffsetZ: -8,
      headingDegrees: 0,
      radiusMetres: 10,
      amplitudeMetres: 2.25,
      foamAmount: 1,
      sprayAmount: 1,
      lifetimeSeconds: 4,
      lifetimeTicks: 240,
      priority: 255,
    }),
    qualityProfile: Object.freeze({
      activeId: "minimal",
      draftId: "minimal-high-detail",
      reloadRequired: true,
      applying: false,
    }),
    effects: DESCRIPTORS.effects,
    runtime: Object.freeze({
      tick: 120,
      seaLevelMetres: 0,
      controlRevision: 2,
      interactionAnchorX: 5,
      interactionAnchorZ: -3,
      activeDisturbanceCount: 1,
      activeHeroBreakerCount: 1,
      activeBodyWakeCount: 0,
      attachedBodyCount: 1,
    }),
    diagnostics: Object.freeze({
      enabled: false,
      outputs: Object.freeze([]),
      latest: null,
    }),
    engineeringMonitoring: true,
  });
}
