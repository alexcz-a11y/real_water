import { describe, expect, it, vi } from "vitest";
import {
  createMinimalWaterPrewarmManifest,
  createMinimalWaterQualityProfile,
  createReferenceEnvironmentPreset,
  createWaterPreset,
  type ArtisticControls,
  type HostEnvironmentSnapshot,
  type HeroBreakerDisturbanceBatch,
  type OpenWaterRuntimeSnapshot,
  type QualityProfile,
  type RealWaterLease,
} from "real-water";
import {
  createReferenceControlModel,
  type ReferenceControlBinding,
  type ReferenceControlModelOptions,
} from "./reference-control-model.js";

describe("Reference Control Model", () => {
  it("writes complete Water and Environment snapshots through their hot seams", () => {
    const fixture = createFixture();
    fixture.model.bind(fixture.binding);

    fixture.model.setNumeric("waveStrength", 1.35);
    expect(fixture.updateArtisticControls).toHaveBeenLastCalledWith(
      {
        ...createWaterPreset("swell").artisticControls,
        waveStrength: 1.35,
      },
      { transition: "continuous" },
    );
    expect(
      Object.keys(fixture.updateArtisticControls.mock.lastCall?.[0] ?? {}),
    ).toHaveLength(20);

    fixture.model.setNumeric("environment.weather.rainIntensity", 0.7);
    expect(fixture.setEnvironmentState).toHaveBeenLastCalledWith({
      ...fixture.initialEnvironment,
      weather: {
        ...fixture.initialEnvironment.weather,
        rainIntensity: 0.7,
      },
    });
  });

  it("routes all twenty Artistic Control descriptors through complete continuous writes", () => {
    const fixture = createFixture();
    fixture.model.bind(fixture.binding);
    const descriptors = fixture.model.descriptors.numeric.filter(
      ({ source }) => source === "artistic-control",
    );

    for (const descriptor of descriptors) {
      fixture.updateArtisticControls.mockClear();
      const before = fixture.model.snapshot().artisticControls;
      const value =
        before[descriptor.id as keyof ArtisticControls] === descriptor.min
          ? descriptor.min + descriptor.step
          : descriptor.min;

      fixture.model.setNumeric(descriptor.id, value);

      expect(fixture.updateArtisticControls).toHaveBeenCalledTimes(1);
      expect(fixture.updateArtisticControls).toHaveBeenCalledWith(
        { ...before, [descriptor.id]: value },
        { transition: "continuous" },
      );
      expect(
        Object.keys(fixture.updateArtisticControls.mock.lastCall?.[0] ?? {}),
      ).toHaveLength(20);
    }
  });

  it("routes every consumed Environment scalar as a whole snapshot and keeps inert wind direction read-only", () => {
    const fixture = createFixture();
    fixture.model.bind(fixture.binding);
    const descriptors = fixture.model.descriptors.numeric.filter(
      ({ source }) => source === "environment",
    );

    for (const descriptor of descriptors) {
      fixture.setEnvironmentState.mockClear();
      if (descriptor.readOnly) {
        expect(() => fixture.model.setNumeric(descriptor.id, 0.5)).toThrowError(
          /read-only/i,
        );
        expect(fixture.setEnvironmentState).not.toHaveBeenCalled();
        continue;
      }
      const value = safeEnvironmentTestValue(descriptor.id);
      fixture.model.setNumeric(descriptor.id, value);
      expect(fixture.setEnvironmentState).toHaveBeenCalledTimes(1);
      expect(fixture.setEnvironmentState).toHaveBeenCalledWith(
        fixture.model.snapshot().environment,
      );
    }
  });

  it("claims manual-look ownership once after a hot write is accepted", () => {
    const fixture = createFixture();
    fixture.model.bind(fixture.binding);

    fixture.model.setNumeric("crestSharpness", 1.4);
    fixture.model.setNumeric("environment.atmosphere.horizonHaze", 0.6);

    expect(fixture.claimManualLook).toHaveBeenCalledTimes(1);
    expect(fixture.claimManualLook.mock.invocationCallOrder[0]).toBeGreaterThan(
      fixture.updateArtisticControls.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("submits the one-Hero draft as a complete batch with unique uint32 ids", () => {
    const fixture = createFixture();
    fixture.model.bind(fixture.binding);
    fixture.model.setNumeric("heroBreaker.anchorOffsetX", 7);
    fixture.model.setNumeric("heroBreaker.anchorOffsetZ", -9);
    fixture.model.setNumeric("heroBreaker.headingDegrees", 90);
    fixture.model.setNumeric("heroBreaker.radiusMetres", 12);
    fixture.model.setNumeric("heroBreaker.amplitudeMetres", 3);
    fixture.model.setNumeric("heroBreaker.foamAmount", 0.8);
    fixture.model.setNumeric("heroBreaker.sprayAmount", 0.6);
    fixture.model.setNumeric("heroBreaker.lifetimeSeconds", 5);
    fixture.model.setNumeric("heroBreaker.priority", 240);

    fixture.model.invoke("heroBreaker.submit");
    fixture.model.invoke("heroBreaker.submit");

    expect(fixture.submitDisturbances).toHaveBeenCalledTimes(2);
    const first = fixture.submitDisturbances.mock.calls[0]?.[0];
    const second = fixture.submitDisturbances.mock.calls[1]?.[0];
    expect(first).toMatchObject({ kind: "hero-breaker", count: 1 });
    expect(Array.from(first?.positions ?? [])).toEqual([12, 0, -12]);
    expect(first?.directions[0]).toBeCloseTo(1);
    expect(first?.directions[1]).toBe(0);
    expect(first?.directions[2]).toBeCloseTo(0);
    expect(Array.from(first?.radii ?? [])).toEqual([12]);
    expect(Array.from(first?.amplitudes ?? [])).toEqual([3]);
    expect(first?.foamAmounts[0]).toBeCloseTo(0.8);
    expect(first?.sprayAmounts[0]).toBeCloseTo(0.6);
    expect(Array.from(first?.lifetimeTicks ?? [])).toEqual([300]);
    expect(Array.from(first?.priorities ?? [])).toEqual([240]);
    expect(first?.ids).toBeInstanceOf(Uint32Array);
    expect(first?.ids[0]).not.toBe(second?.ids[0]);
    expect(fixture.claimManualLook).not.toHaveBeenCalled();
  });

  it("keeps a Quality Profile edit as a reload-required draft until Apply", async () => {
    const fixture = createFixture();
    fixture.model.bind(fixture.binding);

    fixture.model.setQualityProfileDraft("minimal-high-detail");

    expect(fixture.model.snapshot().qualityProfile).toMatchObject({
      activeId: "minimal",
      draftId: "minimal-high-detail",
      reloadRequired: true,
      applying: false,
    });
    expect(fixture.applyQualityProfile).not.toHaveBeenCalled();
    expect(fixture.claimManualLook).not.toHaveBeenCalled();

    await fixture.model.invoke("qualityProfile.apply");

    expect(fixture.applyQualityProfile).toHaveBeenCalledTimes(1);
    expect(fixture.applyQualityProfile.mock.calls[0]?.[0]).toMatchObject({
      id: "minimal-high-detail",
    });
  });

  it("restores claimed Water and Environment authoring state across lease rebinds", () => {
    const fixture = createFixture();
    fixture.model.bind(fixture.binding);
    fixture.model.setNumeric("waveStrength", 1.6);
    fixture.model.setNumeric("environment.weather.rainIntensity", 0.75);
    const replacement = fixture.createReplacementBinding();

    fixture.model.unbind(fixture.lease);
    fixture.model.bind(replacement.binding);

    expect(replacement.claimManualLook).toHaveBeenCalledTimes(1);
    expect(replacement.updateArtisticControls).toHaveBeenCalledWith(
      {
        ...createWaterPreset("swell").artisticControls,
        waveStrength: 1.6,
      },
      { transition: "continuous" },
    );
    expect(replacement.setEnvironmentState).toHaveBeenCalledWith({
      ...fixture.initialEnvironment,
      weather: {
        ...fixture.initialEnvironment.weather,
        rainIntensity: 0.75,
      },
    });
    expect(fixture.model.snapshot().qualityProfile.activeId).toBe(
      "minimal-high-detail",
    );
  });

  it("rolls a rejected replacement binding back to an unbound model", () => {
    const fixture = createFixture();
    fixture.model.bind(fixture.binding);
    fixture.model.setNumeric("waveStrength", 1.6);
    const replacement = fixture.createReplacementBinding();
    replacement.setEnvironmentState.mockImplementationOnce(() => {
      throw new RangeError("Synthetic replacement Environment rejection.");
    });

    expect(() => fixture.model.bind(replacement.binding)).toThrowError(
      /replacement Environment rejection/u,
    );

    expect(fixture.model.snapshot()).toMatchObject({
      state: "unbound",
      runtime: null,
    });
  });

  it("maps every prepared effect exactly without inventing automatic-effect toggles", () => {
    const fixture = createFixture();

    expect(
      fixture.model.descriptors.effects.map(({ effectId, variantId }) => ({
        effectId,
        variantId,
      })),
    ).toEqual(fixture.lease.manifest.effectVariants);
    expect(fixture.model.descriptors.effects).toHaveLength(13);
    expect(
      fixture.model.descriptors.numeric.filter(
        ({ source }) => source === "artistic-control",
      ),
    ).toHaveLength(20);
    expect(
      fixture.model.descriptors.numeric.filter(
        ({ source }) => source === "environment",
      ),
    ).toHaveLength(19);
    expect(
      fixture.model.descriptors.numeric.filter(
        ({ source }) => source === "hero-breaker",
      ),
    ).toHaveLength(10);
    expect(
      fixture.model.descriptors.numeric.filter(({ id }) =>
        [
          "environment.weather.windDirectionX",
          "environment.weather.windDirectionZ",
        ].includes(id),
      ),
    ).toEqual([
      expect.objectContaining({ audience: "engineering", readOnly: true }),
      expect.objectContaining({ audience: "engineering", readOnly: true }),
    ]);
    for (const effectId of [
      "underwater-caustics",
      "underwater-particles",
      "underwater-bubbles",
      "lens-wetness",
    ]) {
      const effect = fixture.model.descriptors.effects.find(
        (candidate) => candidate.effectId === effectId,
      );
      expect(effect).toMatchObject({ automatic: true });
      expect(effect?.controlIds).not.toContain(`${effectId}.enabled`);
    }
    expect(effectControls(fixture, "underwater-caustics")).toEqual([
      "environment.lighting.sunDirectionX",
      "environment.lighting.sunDirectionY",
      "environment.lighting.sunDirectionZ",
      "environment.lighting.sunIntensity",
      "underwaterTurbidity",
    ]);
    expect(effectControls(fixture, "underwater-particles")).toEqual([]);
    expect(effectControls(fixture, "underwater-bubbles")).toEqual([]);
    expect(effectControls(fixture, "rain")).toEqual([
      "environment.weather.windStrength",
      "environment.weather.gustStrength",
      "environment.weather.rainIntensity",
    ]);
    expect(effectControls(fixture, "storm-aerosol")).toEqual([
      "environment.atmosphere.stormAerosolIntensity",
      "environment.atmosphere.horizonHaze",
    ]);
    expect(effectControls(fixture, "cloud-shadow")).toEqual([
      "environment.atmosphere.cloudCoverage",
      "environment.atmosphere.cloudShadowStrength",
    ]);
  });

  it("publishes one frozen, internally referential descriptor collection for both presenters", () => {
    const { descriptors } = createFixture().model;
    const numericIds = descriptors.numeric.map(({ id }) => id);
    const actionIds = descriptors.actions.map(({ id }) => id);
    const availableControlIds = new Set([...numericIds, ...actionIds]);

    expect(new Set(numericIds).size).toBe(numericIds.length);
    expect(new Set(actionIds).size).toBe(actionIds.length);
    expect(new Set(descriptors.monitors.map(({ id }) => id)).size).toBe(
      descriptors.monitors.length,
    );
    expect(Object.isFrozen(descriptors)).toBe(true);
    for (const collection of Object.values(descriptors)) {
      expect(Object.isFrozen(collection)).toBe(true);
      for (const descriptor of collection) {
        expect(Object.isFrozen(descriptor)).toBe(true);
      }
    }
    for (const effect of descriptors.effects) {
      expect(Object.isFrozen(effect.controlIds)).toBe(true);
      expect(Object.isFrozen(effect.diagnosticOutputs)).toBe(true);
      for (const controlId of effect.controlIds) {
        expect(availableControlIds.has(controlId)).toBe(true);
      }
    }
    const snapshot = createFixture().model.snapshot();
    for (const monitor of descriptors.monitors) {
      const value = monitor.read(snapshot);
      if (value !== null) {
        expect(typeof value).toBe(
          monitor.value === "text" ? "string" : monitor.value,
        );
      }
    }
  });

  it("keeps heavy diagnostics off by default and requires explicit output selection", () => {
    const fixture = createFixture();
    fixture.model.bind(fixture.binding);

    expect(fixture.setDiagnosticsSampling).not.toHaveBeenCalled();
    expect(fixture.model.snapshot().diagnostics).toEqual({
      enabled: false,
      outputs: [],
      latest: null,
    });

    fixture.model.setHeavyDiagnostics({
      enabled: true,
      outputs: ["hero-breaker-foam", "storm-lightning"],
    });

    expect(fixture.setDiagnosticsSampling).toHaveBeenLastCalledWith({
      enabled: true,
      outputs: ["hero-breaker-foam", "storm-lightning"],
    });
    fixture.model.unbind(fixture.lease);
    expect(fixture.setDiagnosticsSampling).toHaveBeenLastCalledWith({
      enabled: false,
      outputs: [],
    });
  });

  it("does not cache or claim an Environment write rejected by the Adapter", () => {
    const fixture = createFixture();
    fixture.model.bind(fixture.binding);
    fixture.setEnvironmentState.mockImplementationOnce(() => {
      throw new RangeError("Synthetic Host Environment rejection.");
    });

    expect(() =>
      fixture.model.setNumeric("environment.weather.rainIntensity", 0.9),
    ).toThrowError(/rejection/i);

    expect(fixture.model.snapshot().environment).toEqual(
      fixture.initialEnvironment,
    );
    expect(fixture.claimManualLook).not.toHaveBeenCalled();
  });

  it("polls lightweight runtime state only while Engineering monitoring is enabled", () => {
    let intervalCallback: (() => void) | undefined;
    const setInterval = vi.fn((callback: () => void, intervalMs: number) => {
      intervalCallback = callback;
      expect(intervalMs).toBe(250);
      return 17;
    });
    const clearInterval = vi.fn();
    const fixture = createFixture({ setInterval, clearInterval });
    const snapshots = vi.fn();
    fixture.model.bind(fixture.binding);
    fixture.model.subscribe(snapshots);

    expect(setInterval).not.toHaveBeenCalled();
    fixture.model.setEngineeringMonitoring(true);
    expect(setInterval).toHaveBeenCalledTimes(1);
    const afterOpening = snapshots.mock.calls.length;

    intervalCallback?.();
    expect(snapshots).toHaveBeenCalledTimes(afterOpening);

    fixture.setRuntime({ tick: 121, activeHeroBreakerCount: 1 });
    intervalCallback?.();
    expect(snapshots).toHaveBeenCalledTimes(afterOpening + 1);
    expect(fixture.model.snapshot().runtime).toMatchObject({
      tick: 121,
      activeHeroBreakerCount: 1,
    });

    fixture.model.unbind(fixture.lease);
    expect(clearInterval).toHaveBeenCalledWith(17);
  });
});

function effectControls(
  fixture: ReturnType<typeof createFixture>,
  effectId: string,
) {
  return fixture.model.descriptors.effects.find(
    (effect) => effect.effectId === effectId,
  )?.controlIds;
}

function safeEnvironmentTestValue(id: string): number {
  if (id.endsWith("sunDirectionX")) return 0.2;
  if (id.endsWith("sunDirectionY")) return 0.9;
  if (id.endsWith("sunDirectionZ")) return 0.3;
  if (id.endsWith("sunAngularRadiusRadians")) return 0.08;
  if (
    id.endsWith("sunColorR") ||
    id.endsWith("sunColorG") ||
    id.endsWith("sunColorB") ||
    id.endsWith("sunIntensity") ||
    id.endsWith("environmentIntensity") ||
    id.endsWith("windStrength") ||
    id.endsWith("gustStrength")
  ) {
    return 1.25;
  }
  return 0.55;
}

function createFixture(
  timerOptions: Pick<
    ReferenceControlModelOptions,
    "setInterval" | "clearInterval"
  > = {},
) {
  const water = createWaterPreset("swell").artisticControls;
  const environmentPreset = createReferenceEnvironmentPreset();
  let environmentState: HostEnvironmentSnapshot = Object.freeze({
    lighting: environmentPreset.lighting,
    weather: environmentPreset.weather,
    atmosphere: environmentPreset.atmosphere,
  });
  const initialEnvironment = environmentState;
  const setEnvironmentState = vi.fn((state: HostEnvironmentSnapshot) => {
    environmentState = state;
  });
  const updateArtisticControls = vi.fn((controls: ArtisticControls) => ({
    artisticControls: controls,
    changed: true,
    revision: 1,
    transition: "continuous" as const,
    seaStateCutRevision: 0,
  }));
  let currentRuntime = runtimeSnapshot(water);
  const inspectRuntime = vi.fn(() => currentRuntime);
  const manifest = createMinimalWaterPrewarmManifest();
  const submitDisturbances = vi.fn((batch: HeroBreakerDisturbanceBatch) => ({
    tick: 120,
    acceptedDisturbanceIds: Array.from(batch.ids),
    droppedDisturbanceIds: [],
    displacedBodyWakeSources: [],
    activeDisturbanceCount: 1,
  }));
  const lease = {
    manifest,
    updateArtisticControls,
    inspectRuntime,
    submitDisturbances,
    selectEffectVariant: vi.fn(),
  } as unknown as RealWaterLease;
  const claimManualLook = vi.fn();
  const setDiagnosticsSampling = vi.fn();
  const unsubscribeDiagnostics = vi.fn();
  const subscribeDiagnostics = vi.fn(() => unsubscribeDiagnostics);
  const binding: ReferenceControlBinding = {
    lease,
    environment: {
      snapshot: () => environmentState,
      setEnvironmentState,
    },
    claimManualLook,
    diagnostics: {
      setDiagnosticsSampling,
      subscribeDiagnostics,
    },
  };
  const applyQualityProfile = vi.fn(async (profile: QualityProfile) => {
    void profile;
  });
  const model = createReferenceControlModel({
    applyQualityProfile,
    ...timerOptions,
  });
  const createReplacementBinding = () => {
    const replacementEnvironmentPreset = createReferenceEnvironmentPreset();
    let replacementEnvironment: HostEnvironmentSnapshot = Object.freeze({
      lighting: replacementEnvironmentPreset.lighting,
      weather: replacementEnvironmentPreset.weather,
      atmosphere: replacementEnvironmentPreset.atmosphere,
    });
    const setEnvironmentState = vi.fn((state: HostEnvironmentSnapshot) => {
      replacementEnvironment = state;
    });
    const updateArtisticControls = vi.fn();
    const replacementLease = {
      manifest: createMinimalWaterPrewarmManifest(
        createMinimalWaterQualityProfile("minimal-high-detail"),
      ),
      updateArtisticControls,
      inspectRuntime: vi.fn(() =>
        runtimeSnapshot(createWaterPreset("calm").artisticControls),
      ),
      submitDisturbances: vi.fn(),
      selectEffectVariant: vi.fn(),
    } as unknown as RealWaterLease;
    const claimManualLook = vi.fn();
    return {
      binding: {
        lease: replacementLease,
        environment: {
          snapshot: () => replacementEnvironment,
          setEnvironmentState,
        },
        claimManualLook,
      } satisfies ReferenceControlBinding,
      claimManualLook,
      setEnvironmentState,
      updateArtisticControls,
    };
  };
  return {
    applyQualityProfile,
    binding,
    claimManualLook,
    createReplacementBinding,
    initialEnvironment,
    inspectRuntime,
    lease,
    model,
    setEnvironmentState,
    setDiagnosticsSampling,
    setRuntime(overrides: Partial<OpenWaterRuntimeSnapshot>) {
      currentRuntime = Object.freeze({ ...currentRuntime, ...overrides });
    },
    submitDisturbances,
    updateArtisticControls,
  };
}

function runtimeSnapshot(
  artisticControls: ArtisticControls,
): OpenWaterRuntimeSnapshot {
  return Object.freeze({
    seed: 0,
    tick: 120,
    timeSeconds: 2,
    paused: false,
    originX: 0,
    originZ: 0,
    seaLevelMetres: 0,
    simulationResetRevision: 0,
    artisticControls,
    controlRevision: 0,
    originRevision: 0,
    seaStateCutRevision: 0,
    cameraCutRevision: 0,
    interactionAnchor: Object.freeze({ x: 5, z: -3 }),
    interactionAnchorRevision: 0,
    activeDisturbanceCount: 0,
    activeHeroBreakerCount: 0,
    activeBodyWakeCount: 0,
    attachedBodyCount: 0,
  });
}
