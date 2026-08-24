import {
  ARTISTIC_CONTROL_DESCRIPTORS,
  createMinimalWaterQualityProfile,
  createReferenceEnvironmentPreset,
  createWaterPreset,
  type ArtisticControls,
  type HostEnvironmentAtmosphereState,
  type HostEnvironmentSnapshot,
  type HostEnvironmentState,
  type HostEnvironmentWeatherState,
  type HeroBreakerDisturbanceBatch,
  type MinimalWaterQualityProfileId,
  type OpenWaterRuntimeSnapshot,
  type QualityProfile,
  type RealWaterLease,
} from "real-water";
import type { DiagnosticsCaptureName } from "real-water/diagnostics";
import type { ReferenceEngineeringDiagnosticsSnapshot } from "./reference-engineering-diagnostics.js";

export const REFERENCE_CONTROL_MONITOR_INTERVAL_MS = 250;

export type ReferenceControlAudience = "artist" | "engineering";

export type ReferenceNumericControlId =
  | keyof ArtisticControls
  | `environment.lighting.${keyof HostEnvironmentState}`
  | `environment.weather.${keyof HostEnvironmentWeatherState}`
  | `environment.atmosphere.${keyof HostEnvironmentAtmosphereState}`
  | `heroBreaker.${keyof ReferenceHeroBreakerDraft}`;

interface ReferenceNumericControlDescriptorBase {
  readonly audience: ReferenceControlAudience;
  readonly label: string;
  readonly description: string;
  readonly group: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly readOnly: boolean;
  readonly advanced: boolean;
  readonly read: (snapshot: ReferenceControlSnapshot) => number;
}

interface ReferenceArtisticControlDescriptor extends ReferenceNumericControlDescriptorBase {
  readonly id: keyof ArtisticControls;
  readonly source: "artistic-control";
}

interface ReferenceEnvironmentControlDescriptor extends ReferenceNumericControlDescriptorBase {
  readonly id: Extract<ReferenceNumericControlId, `environment.${string}`>;
  readonly source: "environment";
  readonly update: (
    current: HostEnvironmentSnapshot,
    value: number,
  ) => HostEnvironmentSnapshot;
}

interface ReferenceHeroBreakerControlDescriptor extends ReferenceNumericControlDescriptorBase {
  readonly id: Extract<ReferenceNumericControlId, `heroBreaker.${string}`>;
  readonly source: "hero-breaker";
  readonly update: (
    current: ReferenceHeroBreakerDraft,
    value: number,
  ) => ReferenceHeroBreakerDraft;
}

export type ReferenceNumericControlDescriptor =
  | ReferenceArtisticControlDescriptor
  | ReferenceEnvironmentControlDescriptor
  | ReferenceHeroBreakerControlDescriptor;

export type ReferenceControlActionId =
  "heroBreaker.submit" | "qualityProfile.apply";

export interface ReferenceActionDescriptor {
  readonly id: ReferenceControlActionId;
  readonly audience: ReferenceControlAudience;
  readonly label: string;
  readonly description: string;
  readonly group: string;
  readonly advanced: boolean;
}

export interface ReferenceStructuralControlDescriptor {
  readonly id: "qualityProfile.id";
  readonly audience: "engineering";
  readonly label: string;
  readonly description: string;
  readonly options: readonly MinimalWaterQualityProfileId[];
  readonly applyActionId: "qualityProfile.apply";
}

export interface ReferenceEffectControlDescriptor {
  readonly effectId: string;
  readonly variantId: string;
  readonly label: string;
  readonly controlIds: readonly (
    ReferenceNumericControlId | ReferenceControlActionId
  )[];
  readonly diagnosticOutputs: readonly DiagnosticsCaptureName[];
  readonly automatic: boolean;
}

export type ReferenceMonitorId =
  | "binding-state"
  | "simulation-tick"
  | "sea-level"
  | "control-revision"
  | "interaction-anchor-x"
  | "interaction-anchor-z"
  | "active-disturbances"
  | "active-hero-breakers"
  | "active-body-wakes"
  | "attached-bodies"
  | "active-quality-profile"
  | "draft-quality-profile"
  | "reload-required"
  | "reload-in-progress"
  | "heavy-diagnostics-enabled"
  | "engineering-monitors-active"
  | "diagnostic-presentation-id"
  | "diagnostic-output-width"
  | "diagnostic-output-height"
  | "diagnostic-compile-count"
  | "diagnostic-probe-count"
  | "diagnostic-readback-count"
  | "diagnostic-scene-render-count"
  | "diagnostic-requested-output-count"
  | "diagnostic-returned-output-count"
  | "particle-candidates"
  | "retained-particles"
  | "thinned-particles"
  | "waterline-classification"
  | "camera-submersion"
  | "particle-pool-oversubscribed";

export interface ReferenceMonitorDescriptor {
  readonly id: ReferenceMonitorId;
  readonly audience: "engineering";
  readonly label: string;
  readonly group: string;
  readonly value: "number" | "boolean" | "text";
  readonly heavy: boolean;
  readonly read: (
    snapshot: ReferenceControlSnapshot,
  ) => number | boolean | string | null;
}

export interface ReferenceControlDescriptors {
  readonly numeric: readonly ReferenceNumericControlDescriptor[];
  readonly actions: readonly ReferenceActionDescriptor[];
  readonly structural: readonly ReferenceStructuralControlDescriptor[];
  readonly effects: readonly ReferenceEffectControlDescriptor[];
  readonly monitors: readonly ReferenceMonitorDescriptor[];
}

export interface ReferenceHeroBreakerDraft {
  readonly anchorOffsetX: number;
  readonly anchorOffsetZ: number;
  readonly headingDegrees: number;
  readonly radiusMetres: number;
  readonly amplitudeMetres: number;
  readonly foamAmount: number;
  readonly sprayAmount: number;
  readonly lifetimeSeconds: number;
  readonly lifetimeTicks: number;
  readonly priority: number;
}

export interface ReferenceControlRuntimeSnapshot {
  readonly tick: number;
  readonly seaLevelMetres: number;
  readonly controlRevision: number;
  readonly interactionAnchorX: number;
  readonly interactionAnchorZ: number;
  readonly activeDisturbanceCount: number;
  readonly activeHeroBreakerCount: number;
  readonly activeBodyWakeCount: number;
  readonly attachedBodyCount: number;
}

export interface ReferenceHeavyDiagnosticsSnapshot {
  readonly enabled: boolean;
  readonly outputs: readonly DiagnosticsCaptureName[];
  readonly latest: ReferenceEngineeringDiagnosticsSnapshot | null;
}

export interface ReferenceControlSnapshot {
  readonly revision: number;
  readonly state: "unbound" | "bound" | "disposed";
  readonly artisticControls: ArtisticControls;
  readonly environment: HostEnvironmentSnapshot;
  readonly heroBreakerDraft: ReferenceHeroBreakerDraft;
  readonly qualityProfile: Readonly<{
    readonly activeId: MinimalWaterQualityProfileId | null;
    readonly draftId: MinimalWaterQualityProfileId;
    readonly reloadRequired: boolean;
    readonly applying: boolean;
  }>;
  readonly effects: readonly ReferenceEffectControlDescriptor[];
  readonly runtime: ReferenceControlRuntimeSnapshot | null;
  readonly diagnostics: ReferenceHeavyDiagnosticsSnapshot;
  readonly engineeringMonitoring: boolean;
}

export type ReferenceControlSubscriber = (
  snapshot: ReferenceControlSnapshot,
) => void;

export interface ReferenceControlEnvironmentAdapter {
  snapshot(): HostEnvironmentSnapshot;
  setEnvironmentState(state: HostEnvironmentSnapshot): void;
}

export interface ReferenceControlDiagnosticsSampler {
  setDiagnosticsSampling(sampling: {
    readonly enabled: boolean;
    readonly outputs?: readonly DiagnosticsCaptureName[];
  }): void;
  subscribeDiagnostics(
    subscriber: (snapshot: ReferenceEngineeringDiagnosticsSnapshot) => void,
  ): () => void;
}

export interface ReferenceControlBinding {
  readonly lease: RealWaterLease;
  readonly environment: ReferenceControlEnvironmentAdapter;
  readonly claimManualLook: () => void;
  readonly diagnostics?: ReferenceControlDiagnosticsSampler;
}

export interface ReferenceControlModelOptions {
  readonly applyQualityProfile: (
    profile: QualityProfile,
  ) => void | Promise<void>;
  readonly setInterval?: (callback: () => void, intervalMs: number) => number;
  readonly clearInterval?: (handle: number) => void;
}

export interface ReferenceControlModel {
  readonly descriptors: ReferenceControlDescriptors;
  snapshot(): ReferenceControlSnapshot;
  subscribe(subscriber: ReferenceControlSubscriber): () => void;
  setNumeric(id: ReferenceNumericControlId, value: number): void;
  invoke(actionId: ReferenceControlActionId): void | Promise<void>;
  setQualityProfileDraft(id: MinimalWaterQualityProfileId): void;
  setHeavyDiagnostics(options: {
    readonly enabled: boolean;
    readonly outputs: readonly DiagnosticsCaptureName[];
  }): void;
  setEngineeringMonitoring(enabled: boolean): void;
  bind(binding: ReferenceControlBinding): void;
  unbind(expectedLease?: RealWaterLease): void;
  dispose(): void;
}

const ARTISTIC_NUMERIC_DESCRIPTORS = Object.freeze(
  ARTISTIC_CONTROL_DESCRIPTORS.map((descriptor) =>
    Object.freeze({
      id: descriptor.key,
      source: "artistic-control" as const,
      audience: "artist" as const,
      label: descriptor.label,
      description: descriptor.description,
      group: descriptor.group,
      min: descriptor.min,
      max: descriptor.max,
      step: descriptor.step,
      readOnly: false,
      advanced: false,
      read: (snapshot: ReferenceControlSnapshot) =>
        snapshot.artisticControls[descriptor.key],
    }),
  ),
);

const ENVIRONMENT_NUMERIC_DESCRIPTORS: readonly ReferenceEnvironmentControlDescriptor[] =
  Object.freeze([
    environmentDescriptor(
      "environment.lighting.sunDirectionX",
      "Sun east–west",
      "Moves the Host-authored sun across the east–west horizon.",
      "lighting",
      -1,
      1,
      0.01,
    ),
    environmentDescriptor(
      "environment.lighting.sunDirectionY",
      "Sun height",
      "Raises or lowers the Host-authored sun in the sky.",
      "lighting",
      -1,
      1,
      0.01,
    ),
    environmentDescriptor(
      "environment.lighting.sunDirectionZ",
      "Sun north–south",
      "Moves the Host-authored sun across the north–south horizon.",
      "lighting",
      -1,
      1,
      0.01,
    ),
    environmentDescriptor(
      "environment.lighting.sunColorR",
      "Sun warmth",
      "Adds warm red light to the Host-authored sun color.",
      "lighting",
      0,
      4,
      0.01,
    ),
    environmentDescriptor(
      "environment.lighting.sunColorG",
      "Sun balance",
      "Balances the green contribution of the Host-authored sun color.",
      "lighting",
      0,
      4,
      0.01,
    ),
    environmentDescriptor(
      "environment.lighting.sunColorB",
      "Sun coolness",
      "Adds cool blue light to the Host-authored sun color.",
      "lighting",
      0,
      4,
      0.01,
    ),
    environmentDescriptor(
      "environment.lighting.sunIntensity",
      "Sun presence",
      "Visual strength of direct Host-authored sunlight.",
      "lighting",
      0,
      4,
      0.01,
    ),
    environmentDescriptor(
      "environment.lighting.environmentIntensity",
      "Sky presence",
      "Visual strength of the prepared Host environment radiance.",
      "lighting",
      0,
      4,
      0.01,
    ),
    environmentDescriptor(
      "environment.lighting.sunAngularRadiusRadians",
      "Sun disk size",
      "Angular size of the visible Host-authored sun disk.",
      "lighting",
      0.001,
      Math.PI,
      0.001,
    ),
    environmentDescriptor(
      "environment.weather.windDirectionX",
      "Wind direction X",
      "Current inert Host wind-direction X input; shown for engineering inspection.",
      "weather",
      -1,
      1,
      0.01,
      true,
      "engineering",
    ),
    environmentDescriptor(
      "environment.weather.windDirectionZ",
      "Wind direction Z",
      "Current inert Host wind-direction Z input; shown for engineering inspection.",
      "weather",
      -1,
      1,
      0.01,
      true,
      "engineering",
    ),
    environmentDescriptor(
      "environment.weather.windStrength",
      "Wind energy",
      "Host weather energy consumed by the prepared Storm Front route.",
      "weather",
      0,
      4,
      0.01,
    ),
    environmentDescriptor(
      "environment.weather.gustStrength",
      "Gust energy",
      "Host gust energy consumed by the prepared Storm Front route.",
      "weather",
      0,
      4,
      0.01,
    ),
    environmentDescriptor(
      "environment.weather.rainIntensity",
      "Rain presence",
      "Strength of rain ripples and shared-pool rain spray.",
      "weather",
      0,
      1,
      0.01,
    ),
    environmentDescriptor(
      "environment.atmosphere.cloudCoverage",
      "Cloud coverage",
      "Coverage driving coherent Storm Front atmosphere response.",
      "atmosphere",
      0,
      1,
      0.01,
    ),
    environmentDescriptor(
      "environment.atmosphere.cloudShadowStrength",
      "Cloud shadow",
      "Visual strength of prepared cloud-shadow modulation.",
      "atmosphere",
      0,
      1,
      0.01,
    ),
    environmentDescriptor(
      "environment.atmosphere.horizonHaze",
      "Horizon haze",
      "Amount of atmosphere gathering at the horizon.",
      "atmosphere",
      0,
      1,
      0.01,
    ),
    environmentDescriptor(
      "environment.atmosphere.stormAerosolIntensity",
      "Storm aerosol",
      "Visual strength of the prepared shared-spray atmosphere route.",
      "atmosphere",
      0,
      1,
      0.01,
    ),
    environmentDescriptor(
      "environment.atmosphere.lightningIntensity",
      "Lightning flash",
      "Fixed-tick coherent lightning response.",
      "atmosphere",
      0,
      1,
      0.01,
    ),
  ]);

const HERO_BREAKER_NUMERIC_DESCRIPTORS: readonly ReferenceHeroBreakerControlDescriptor[] =
  Object.freeze([
    heroBreakerDescriptor(
      "heroBreaker.anchorOffsetX",
      "Breaker left–right",
      "Places the Hero Breaker beside the current Interaction Anchor.",
      -48,
      48,
      0.1,
    ),
    heroBreakerDescriptor(
      "heroBreaker.anchorOffsetZ",
      "Breaker forward–back",
      "Places the Hero Breaker ahead of or behind the current Interaction Anchor.",
      -48,
      48,
      0.1,
    ),
    heroBreakerDescriptor(
      "heroBreaker.headingDegrees",
      "Breaker travel direction",
      "Sets the horizontal travel heading in degrees, with zero facing positive Z.",
      -180,
      180,
      1,
    ),
    heroBreakerDescriptor(
      "heroBreaker.radiusMetres",
      "Breaker footprint",
      "Sets the authored footprint radius in metres.",
      0.0001,
      48,
      0.1,
    ),
    heroBreakerDescriptor(
      "heroBreaker.amplitudeMetres",
      "Crest drama",
      "Sets the authored Hero Breaker crest amplitude in metres.",
      0,
      4,
      0.05,
    ),
    heroBreakerDescriptor(
      "heroBreaker.foamAmount",
      "Foam presence",
      "Sets the dedicated Hero Breaker foam contribution.",
      0,
      1,
      0.01,
    ),
    heroBreakerDescriptor(
      "heroBreaker.sprayAmount",
      "Spray presence",
      "Sets the Hero Breaker's shared-pool spray contribution.",
      0,
      1,
      0.01,
    ),
    heroBreakerDescriptor(
      "heroBreaker.lifetimeSeconds",
      "Visible lifetime",
      "Sets the fixed-tick lifetime in artist-facing seconds.",
      1 / 60,
      10,
      1 / 60,
    ),
    heroBreakerDescriptor(
      "heroBreaker.lifetimeTicks",
      "Lifetime ticks",
      "Exact fixed-tick lifetime submitted to the runtime.",
      1,
      600,
      1,
      true,
      "engineering",
    ),
    heroBreakerDescriptor(
      "heroBreaker.priority",
      "Overflow priority",
      "Unsigned visual priority used by deterministic Disturbance overflow.",
      0,
      255,
      1,
      true,
      "engineering",
    ),
  ]);

const ACTION_DESCRIPTORS: readonly ReferenceActionDescriptor[] = Object.freeze([
  Object.freeze({
    id: "heroBreaker.submit",
    audience: "artist",
    label: "Create Hero Breaker",
    description: "Submits the complete one-Hero draft at the current anchor.",
    group: "hero-breaker",
    advanced: false,
  }),
  Object.freeze({
    id: "qualityProfile.apply",
    audience: "engineering",
    label: "Apply and reload",
    description:
      "Applies the structural Quality Profile draft through a complete preparation run.",
    group: "quality-profile",
    advanced: true,
  }),
]);

const STRUCTURAL_DESCRIPTORS: readonly ReferenceStructuralControlDescriptor[] =
  Object.freeze([
    Object.freeze({
      id: "qualityProfile.id",
      audience: "engineering",
      label: "Quality Profile",
      description:
        "Structural resource and route configuration; changes require Apply and Reload.",
      options: Object.freeze(["minimal", "minimal-high-detail"] as const),
      applyActionId: "qualityProfile.apply",
    }),
  ]);

const EFFECT_DESCRIPTORS: readonly ReferenceEffectControlDescriptor[] =
  Object.freeze([
    effectDescriptor(
      "minimal-water-surface",
      "basic",
      "Open Water surface",
      [
        "waveStrength",
        "swellDrama",
        "directionality",
        "choppiness",
        "crestSharpness",
        "microDetail",
        "timeScale",
        "grazingReflection",
        "environmentReflection",
        "depthSeeThrough",
        "depthColoring",
        "inWaterGlow",
        "crestGlow",
      ],
      ["current-color", "normal", "motion-vector"],
      false,
    ),
    effectDescriptor(
      "unified-foam",
      "source-resolved-persistent",
      "Unified foam",
      ["whitecapAmount", "foamPersistence"],
      ["whitecap-generation", "whitecap-history", "foam-source-identity"],
      false,
    ),
    effectDescriptor(
      "underwater-volume",
      "depth-aware",
      "Underwater volume",
      [
        "underwaterHaze",
        "underwaterTurbidity",
        "underwaterLightShafts",
        "underwaterColor",
        "underwaterExposure",
      ],
      [
        "underwater-transmittance",
        "underwater-scattering",
        "underwater-light-shafts",
        "underwater-shadow",
      ],
      false,
    ),
    effectDescriptor(
      "secondary-particles",
      "bounded-post-traa",
      "Shared secondary particles",
      ["waveStrength", "choppiness", "whitecapAmount"],
      ["secondary-particle-contribution", "secondary-particle-overdraw"],
      true,
    ),
    effectDescriptor(
      "underwater-caustics",
      "prepared-surface-visible-receivers",
      "Underwater caustics",
      [
        "environment.lighting.sunDirectionX",
        "environment.lighting.sunDirectionY",
        "environment.lighting.sunDirectionZ",
        "environment.lighting.sunIntensity",
        "underwaterTurbidity",
      ],
      ["underwater-caustics"],
      true,
    ),
    effectDescriptor(
      "underwater-particles",
      "deterministic-depth-aware",
      "Suspended underwater particles",
      [],
      ["underwater-particles"],
      true,
    ),
    effectDescriptor(
      "underwater-bubbles",
      "cloud-and-rising-depth-aware",
      "Bubble clouds and rising bubbles",
      [],
      ["underwater-bubbles"],
      true,
    ),
    effectDescriptor(
      "lens-wetness",
      "bounded-emergence-decay",
      "Lens wetness",
      [],
      ["lens-wetness"],
      true,
    ),
    effectDescriptor(
      "hero-breaker",
      "art-directed-overturning",
      "Hero Breaker",
      [
        "heroBreaker.anchorOffsetX",
        "heroBreaker.anchorOffsetZ",
        "heroBreaker.headingDegrees",
        "heroBreaker.radiusMetres",
        "heroBreaker.amplitudeMetres",
        "heroBreaker.foamAmount",
        "heroBreaker.sprayAmount",
        "heroBreaker.lifetimeSeconds",
        "heroBreaker.lifetimeTicks",
        "heroBreaker.priority",
        "heroBreaker.submit",
      ],
      ["hero-breaker-foam", "foam-source-identity"],
      false,
    ),
    effectDescriptor(
      "rain",
      "additive-ripples-and-shared-spray",
      "Rain ripples and spray",
      [
        "environment.weather.windStrength",
        "environment.weather.gustStrength",
        "environment.weather.rainIntensity",
      ],
      ["storm-rain-ripples"],
      false,
    ),
    effectDescriptor(
      "storm-aerosol",
      "shared-spray-post-traa-atmosphere",
      "Storm aerosol",
      [
        "environment.atmosphere.stormAerosolIntensity",
        "environment.atmosphere.horizonHaze",
      ],
      ["storm-aerosol"],
      false,
    ),
    effectDescriptor(
      "cloud-shadow",
      "coherent-optical-atmosphere-modulation",
      "Cloud shadow",
      [
        "environment.atmosphere.cloudCoverage",
        "environment.atmosphere.cloudShadowStrength",
      ],
      ["storm-cloud-shadow"],
      false,
    ),
    effectDescriptor(
      "lightning",
      "fixed-tick-coherent-transient",
      "Lightning response",
      ["environment.atmosphere.lightningIntensity"],
      ["storm-lightning"],
      false,
    ),
  ]);

const MONITOR_DESCRIPTORS: readonly ReferenceMonitorDescriptor[] =
  Object.freeze([
    monitorDescriptor(
      "binding-state",
      "Binding state",
      "lifecycle",
      "text",
      false,
      (snapshot) => snapshot.state,
    ),
    monitorDescriptor(
      "simulation-tick",
      "Simulation tick",
      "runtime",
      "number",
      false,
      (snapshot) => snapshot.runtime?.tick ?? null,
    ),
    monitorDescriptor(
      "sea-level",
      "Sea level",
      "runtime",
      "number",
      false,
      (snapshot) => snapshot.runtime?.seaLevelMetres ?? null,
    ),
    monitorDescriptor(
      "control-revision",
      "Control revision",
      "runtime",
      "number",
      false,
      (snapshot) => snapshot.runtime?.controlRevision ?? null,
    ),
    monitorDescriptor(
      "interaction-anchor-x",
      "Anchor X",
      "runtime",
      "number",
      false,
      (snapshot) => snapshot.runtime?.interactionAnchorX ?? null,
    ),
    monitorDescriptor(
      "interaction-anchor-z",
      "Anchor Z",
      "runtime",
      "number",
      false,
      (snapshot) => snapshot.runtime?.interactionAnchorZ ?? null,
    ),
    monitorDescriptor(
      "active-disturbances",
      "Active disturbances",
      "runtime",
      "number",
      false,
      (snapshot) => snapshot.runtime?.activeDisturbanceCount ?? null,
    ),
    monitorDescriptor(
      "active-hero-breakers",
      "Active Hero Breakers",
      "runtime",
      "number",
      false,
      (snapshot) => snapshot.runtime?.activeHeroBreakerCount ?? null,
    ),
    monitorDescriptor(
      "active-body-wakes",
      "Active body wakes",
      "runtime",
      "number",
      false,
      (snapshot) => snapshot.runtime?.activeBodyWakeCount ?? null,
    ),
    monitorDescriptor(
      "attached-bodies",
      "Attached bodies",
      "runtime",
      "number",
      false,
      (snapshot) => snapshot.runtime?.attachedBodyCount ?? null,
    ),
    monitorDescriptor(
      "active-quality-profile",
      "Active Quality Profile",
      "quality-profile",
      "text",
      false,
      (snapshot) => snapshot.qualityProfile.activeId,
    ),
    monitorDescriptor(
      "draft-quality-profile",
      "Draft Quality Profile",
      "quality-profile",
      "text",
      false,
      (snapshot) => snapshot.qualityProfile.draftId,
    ),
    monitorDescriptor(
      "reload-required",
      "Reload required",
      "quality-profile",
      "boolean",
      false,
      (snapshot) => snapshot.qualityProfile.reloadRequired,
    ),
    monitorDescriptor(
      "reload-in-progress",
      "Reload in progress",
      "quality-profile",
      "boolean",
      false,
      (snapshot) => snapshot.qualityProfile.applying,
    ),
    monitorDescriptor(
      "heavy-diagnostics-enabled",
      "Heavy diagnostics enabled",
      "diagnostics",
      "boolean",
      false,
      (snapshot) => snapshot.diagnostics.enabled,
    ),
    monitorDescriptor(
      "engineering-monitors-active",
      "Engineering monitors active",
      "diagnostics",
      "boolean",
      false,
      (snapshot) => snapshot.engineeringMonitoring,
    ),
    monitorDescriptor(
      "diagnostic-presentation-id",
      "Presentation id",
      "diagnostics",
      "number",
      true,
      (snapshot) => snapshot.diagnostics.latest?.presentationId ?? null,
    ),
    monitorDescriptor(
      "diagnostic-output-width",
      "Output width",
      "diagnostics",
      "number",
      true,
      (snapshot) => snapshot.diagnostics.latest?.width ?? null,
    ),
    monitorDescriptor(
      "diagnostic-output-height",
      "Output height",
      "diagnostics",
      "number",
      true,
      (snapshot) => snapshot.diagnostics.latest?.height ?? null,
    ),
    monitorDescriptor(
      "diagnostic-compile-count",
      "Compile count",
      "diagnostics",
      "number",
      true,
      (snapshot) => snapshot.diagnostics.latest?.compileCount ?? null,
    ),
    monitorDescriptor(
      "diagnostic-probe-count",
      "Probe count",
      "diagnostics",
      "number",
      true,
      (snapshot) => snapshot.diagnostics.latest?.probeCount ?? null,
    ),
    monitorDescriptor(
      "diagnostic-readback-count",
      "Readback count",
      "diagnostics",
      "number",
      true,
      (snapshot) =>
        snapshot.diagnostics.latest?.diagnosticReadbackCount ?? null,
    ),
    monitorDescriptor(
      "diagnostic-scene-render-count",
      "Scene render count",
      "diagnostics",
      "number",
      true,
      (snapshot) => snapshot.diagnostics.latest?.sceneRenderCount ?? null,
    ),
    monitorDescriptor(
      "diagnostic-requested-output-count",
      "Requested outputs",
      "diagnostics",
      "number",
      true,
      (snapshot) => snapshot.diagnostics.latest?.requestedOutputCount ?? null,
    ),
    monitorDescriptor(
      "diagnostic-returned-output-count",
      "Returned outputs",
      "diagnostics",
      "number",
      true,
      (snapshot) => snapshot.diagnostics.latest?.returnedOutputCount ?? null,
    ),
    monitorDescriptor(
      "particle-candidates",
      "Particle candidates",
      "diagnostics",
      "number",
      true,
      (snapshot) =>
        snapshot.diagnostics.latest?.secondaryParticles.requested ?? null,
    ),
    monitorDescriptor(
      "retained-particles",
      "Retained particles",
      "diagnostics",
      "number",
      true,
      (snapshot) =>
        snapshot.diagnostics.latest?.secondaryParticles.retained ?? null,
    ),
    monitorDescriptor(
      "thinned-particles",
      "Thinned particles",
      "diagnostics",
      "number",
      true,
      (snapshot) =>
        snapshot.diagnostics.latest?.secondaryParticles.thinned ?? null,
    ),
    monitorDescriptor(
      "waterline-classification",
      "Waterline classification",
      "diagnostics",
      "text",
      true,
      (snapshot) =>
        snapshot.diagnostics.latest?.waterline.classification ?? null,
    ),
    monitorDescriptor(
      "camera-submersion",
      "Camera submersion",
      "diagnostics",
      "number",
      true,
      (snapshot) => snapshot.diagnostics.latest?.waterline.submersion ?? null,
    ),
    monitorDescriptor(
      "particle-pool-oversubscribed",
      "Particle pool oversubscribed",
      "diagnostics",
      "boolean",
      true,
      (snapshot) =>
        snapshot.diagnostics.latest?.secondaryParticles.overSubscribed ?? null,
    ),
  ]);

const DESCRIPTORS: ReferenceControlDescriptors = Object.freeze({
  numeric: Object.freeze([
    ...ARTISTIC_NUMERIC_DESCRIPTORS,
    ...ENVIRONMENT_NUMERIC_DESCRIPTORS,
    ...HERO_BREAKER_NUMERIC_DESCRIPTORS,
  ]),
  actions: ACTION_DESCRIPTORS,
  structural: STRUCTURAL_DESCRIPTORS,
  effects: EFFECT_DESCRIPTORS,
  monitors: MONITOR_DESCRIPTORS,
});

const DEFAULT_HERO_BREAKER_DRAFT: ReferenceHeroBreakerDraft = Object.freeze({
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
});

export function createReferenceControlModel(
  options: ReferenceControlModelOptions,
): ReferenceControlModel {
  const scheduleInterval =
    options.setInterval ??
    ((callback: () => void, intervalMs: number) => {
      const handle = globalThis.setInterval(callback, intervalMs);
      return typeof handle === "number" ? handle : Number(handle);
    });
  const cancelInterval =
    options.clearInterval ??
    ((handle: number) => globalThis.clearInterval(handle));
  const referenceEnvironment = createReferenceEnvironmentPreset();
  let artisticControls = freezeArtisticControls(
    createWaterPreset("swell").artisticControls,
  );
  let environment = freezeEnvironment({
    lighting: referenceEnvironment.lighting,
    weather: referenceEnvironment.weather,
    atmosphere: referenceEnvironment.atmosphere,
  });
  let heroBreakerDraft = DEFAULT_HERO_BREAKER_DRAFT;
  let activeQualityProfileId: MinimalWaterQualityProfileId | null = null;
  let draftQualityProfileId: MinimalWaterQualityProfileId = "minimal";
  let qualityProfileDraftTouched = false;
  let qualityProfileApplying = false;
  let manualOwnershipClaimed = false;
  let activeBinding: ReferenceControlBinding | undefined;
  let runtime: ReferenceControlRuntimeSnapshot | null = null;
  let diagnosticsEnabled = false;
  let diagnosticsOutputs: readonly DiagnosticsCaptureName[] = Object.freeze([]);
  let diagnosticsLatest: ReferenceEngineeringDiagnosticsSnapshot | null = null;
  let engineeringMonitoring = false;
  let monitorHandle: number | undefined;
  let unsubscribeDiagnostics: (() => void) | undefined;
  let nextHeroBreakerId = 0x2400_0001;
  let revision = 0;
  let state: ReferenceControlSnapshot["state"] = "unbound";
  let currentSnapshot: ReferenceControlSnapshot;
  const subscribers = new Set<ReferenceControlSubscriber>();

  const buildSnapshot = (): ReferenceControlSnapshot =>
    Object.freeze({
      revision,
      state,
      artisticControls,
      environment,
      heroBreakerDraft,
      qualityProfile: Object.freeze({
        activeId: activeQualityProfileId,
        draftId: draftQualityProfileId,
        reloadRequired:
          activeQualityProfileId !== null &&
          draftQualityProfileId !== activeQualityProfileId,
        applying: qualityProfileApplying,
      }),
      effects: DESCRIPTORS.effects,
      runtime,
      diagnostics: Object.freeze({
        enabled: diagnosticsEnabled,
        outputs: diagnosticsOutputs,
        latest: diagnosticsLatest,
      }),
      engineeringMonitoring,
    });

  const publish = (): void => {
    revision += 1;
    currentSnapshot = buildSnapshot();
    for (const subscriber of subscribers) {
      subscriber(currentSnapshot);
    }
  };

  const claimManualOwnership = (): void => {
    if (manualOwnershipClaimed) {
      return;
    }
    manualOwnershipClaimed = true;
    activeBinding?.claimManualLook();
  };

  const detachBinding = (): void => {
    if (monitorHandle !== undefined) {
      cancelInterval(monitorHandle);
      monitorHandle = undefined;
    }
    if (diagnosticsEnabled) {
      activeBinding?.diagnostics?.setDiagnosticsSampling({
        enabled: false,
        outputs: Object.freeze([]),
      });
    }
    unsubscribeDiagnostics?.();
    unsubscribeDiagnostics = undefined;
    activeBinding = undefined;
    runtime = null;
    diagnosticsLatest = null;
  };

  const startEngineeringMonitoring = (): void => {
    if (
      !engineeringMonitoring ||
      activeBinding === undefined ||
      monitorHandle !== undefined
    ) {
      return;
    }
    monitorHandle = scheduleInterval(() => {
      const binding = activeBinding;
      if (binding === undefined || !engineeringMonitoring) {
        return;
      }
      let next: ReferenceControlRuntimeSnapshot;
      try {
        next = freezeLightweightRuntime(binding.lease.inspectRuntime());
      } catch {
        return;
      }
      if (sameLightweightRuntime(runtime, next)) {
        return;
      }
      runtime = next;
      publish();
    }, REFERENCE_CONTROL_MONITOR_INTERVAL_MS);
  };

  currentSnapshot = buildSnapshot();

  return Object.freeze({
    descriptors: DESCRIPTORS,
    snapshot: () => currentSnapshot,
    subscribe(subscriber: ReferenceControlSubscriber): () => void {
      assertUsable(state);
      subscribers.add(subscriber);
      subscriber(currentSnapshot);
      return () => subscribers.delete(subscriber);
    },
    setNumeric(id: ReferenceNumericControlId, value: number): void {
      assertUsable(state);
      if (!Number.isFinite(value)) {
        throw new RangeError("Reference numeric controls must be finite.");
      }
      const artisticDescriptor = ARTISTIC_CONTROL_DESCRIPTORS.find(
        (descriptor) => descriptor.key === id,
      );
      if (artisticDescriptor !== undefined) {
        assertInRange(
          id,
          value,
          artisticDescriptor.min,
          artisticDescriptor.max,
        );
        const candidate = freezeArtisticControls({
          ...artisticControls,
          [artisticDescriptor.key]: value,
        });
        activeBinding?.lease.updateArtisticControls(candidate, {
          transition: "continuous",
        });
        claimManualOwnership();
        artisticControls = candidate;
        runtime = readLightweightRuntime(activeBinding?.lease);
        publish();
        return;
      }
      const environmentDescriptor = ENVIRONMENT_NUMERIC_DESCRIPTORS.find(
        (descriptor) => descriptor.id === id,
      );
      if (environmentDescriptor !== undefined) {
        if (environmentDescriptor.readOnly) {
          throw new RangeError(
            `${id} is read-only until the runtime consumes wind direction.`,
          );
        }
        assertInRange(
          id,
          value,
          environmentDescriptor.min,
          environmentDescriptor.max,
        );
        const candidate = environmentDescriptor.update(environment, value);
        activeBinding?.environment.setEnvironmentState(candidate);
        claimManualOwnership();
        environment = candidate;
        publish();
        return;
      }
      const heroDescriptor = HERO_BREAKER_NUMERIC_DESCRIPTORS.find(
        (descriptor) => descriptor.id === id,
      );
      if (heroDescriptor !== undefined) {
        assertInRange(id, value, heroDescriptor.min, heroDescriptor.max);
        if (heroDescriptor.step === 1 && !Number.isInteger(value)) {
          throw new RangeError(`${id} must be an integer.`);
        }
        heroBreakerDraft = heroDescriptor.update(heroBreakerDraft, value);
        publish();
        return;
      }
      throw new RangeError(`Unknown writable Reference numeric control: ${id}`);
    },
    invoke(actionId: ReferenceControlActionId): void | Promise<void> {
      assertUsable(state);
      if (actionId === "heroBreaker.submit") {
        const binding = activeBinding;
        if (binding === undefined) {
          throw new Error(
            "A ready Real Water lease is required to submit a Hero Breaker.",
          );
        }
        const currentRuntime = binding.lease.inspectRuntime();
        const id = nextHeroBreakerId;
        if (id > 0xffff_ffff) {
          throw new RangeError(
            "The Reference Hero Breaker disturbance-id range is exhausted.",
          );
        }
        nextHeroBreakerId += 1;
        binding.lease.submitDisturbances(
          createHeroBreakerBatch(id, heroBreakerDraft, currentRuntime),
        );
        runtime = readLightweightRuntime(binding.lease);
        publish();
        return;
      }
      if (actionId === "qualityProfile.apply") {
        const profile = createMinimalWaterQualityProfile(draftQualityProfileId);
        qualityProfileApplying = true;
        publish();
        return Promise.resolve()
          .then(() => options.applyQualityProfile(profile))
          .finally(() => {
            if (state === "disposed") {
              return;
            }
            qualityProfileApplying = false;
            publish();
          });
      }
      throw new RangeError(`Unknown Reference control action: ${actionId}`);
    },
    setQualityProfileDraft(id: MinimalWaterQualityProfileId): void {
      assertUsable(state);
      createMinimalWaterQualityProfile(id);
      draftQualityProfileId = id;
      qualityProfileDraftTouched = true;
      publish();
    },
    setHeavyDiagnostics(next: {
      readonly enabled: boolean;
      readonly outputs: readonly DiagnosticsCaptureName[];
    }): void {
      assertUsable(state);
      const outputs = Object.freeze([...next.outputs]);
      activeBinding?.diagnostics?.setDiagnosticsSampling({
        enabled: next.enabled,
        outputs,
      });
      diagnosticsEnabled = next.enabled;
      diagnosticsOutputs = outputs;
      if (!next.enabled) {
        diagnosticsLatest = null;
      }
      publish();
    },
    setEngineeringMonitoring(enabled: boolean): void {
      assertUsable(state);
      if (engineeringMonitoring === enabled) {
        return;
      }
      engineeringMonitoring = enabled;
      if (enabled) {
        startEngineeringMonitoring();
      } else if (monitorHandle !== undefined) {
        cancelInterval(monitorHandle);
        monitorHandle = undefined;
      }
      publish();
    },
    bind(binding: ReferenceControlBinding): void {
      assertUsable(state);
      detachBinding();
      activeBinding = binding;
      try {
        let incomingRuntime = binding.lease.inspectRuntime();
        activeQualityProfileId = binding.lease.manifest.qualityProfile.id;
        if (!qualityProfileDraftTouched) {
          draftQualityProfileId = activeQualityProfileId;
        }
        if (manualOwnershipClaimed) {
          binding.claimManualLook();
          binding.lease.updateArtisticControls(artisticControls, {
            transition: "continuous",
          });
          binding.environment.setEnvironmentState(environment);
          incomingRuntime = binding.lease.inspectRuntime();
        } else {
          artisticControls = freezeArtisticControls(
            incomingRuntime.artisticControls,
          );
          environment = freezeEnvironment(binding.environment.snapshot());
        }
        runtime = freezeLightweightRuntime(incomingRuntime);
        if (binding.diagnostics !== undefined) {
          unsubscribeDiagnostics = binding.diagnostics.subscribeDiagnostics(
            (snapshot) => {
              if (activeBinding !== binding || !diagnosticsEnabled) {
                return;
              }
              diagnosticsLatest = snapshot;
              publish();
            },
          );
          if (diagnosticsEnabled) {
            binding.diagnostics.setDiagnosticsSampling({
              enabled: true,
              outputs: diagnosticsOutputs,
            });
          }
        }
        state = "bound";
        startEngineeringMonitoring();
        publish();
      } catch (cause) {
        detachBinding();
        state = "unbound";
        publish();
        throw cause;
      }
    },
    unbind(expectedLease?: RealWaterLease): void {
      assertUsable(state);
      if (
        expectedLease !== undefined &&
        activeBinding?.lease !== expectedLease
      ) {
        return;
      }
      detachBinding();
      state = "unbound";
      publish();
    },
    dispose(): void {
      if (state === "disposed") {
        return;
      }
      detachBinding();
      engineeringMonitoring = false;
      diagnosticsEnabled = false;
      diagnosticsOutputs = Object.freeze([]);
      state = "disposed";
      publish();
      subscribers.clear();
    },
  });
}

function assertUsable(state: ReferenceControlSnapshot["state"]): void {
  if (state === "disposed") {
    throw new Error("The Reference Control Model is disposed.");
  }
}

function environmentDescriptor(
  id: Extract<ReferenceNumericControlId, `environment.${string}`>,
  label: string,
  description: string,
  group: "lighting" | "weather" | "atmosphere",
  min: number,
  max: number,
  step: number,
  readOnly = false,
  audience: ReferenceControlAudience = "artist",
): ReferenceEnvironmentControlDescriptor {
  return Object.freeze({
    id,
    source: "environment",
    audience,
    label,
    description,
    group,
    min,
    max,
    step,
    readOnly,
    advanced: false,
    read: (snapshot: ReferenceControlSnapshot) =>
      readEnvironmentNumeric(snapshot, id),
    update: (current: HostEnvironmentSnapshot, value: number) =>
      setEnvironmentNumeric(current, id, value),
  });
}

function heroBreakerDescriptor(
  id: Extract<ReferenceNumericControlId, `heroBreaker.${string}`>,
  label: string,
  description: string,
  min: number,
  max: number,
  step: number,
  advanced = false,
  audience: ReferenceControlAudience = "artist",
): ReferenceHeroBreakerControlDescriptor {
  return Object.freeze({
    id,
    source: "hero-breaker",
    audience,
    label,
    description,
    group: "hero-breaker",
    min,
    max,
    step,
    readOnly: false,
    advanced,
    read: (snapshot: ReferenceControlSnapshot) =>
      readHeroBreakerNumeric(snapshot, id),
    update: (current: ReferenceHeroBreakerDraft, value: number) =>
      updateHeroBreakerDraft(current, id, value),
  });
}

function effectDescriptor(
  effectId: string,
  variantId: string,
  label: string,
  controlIds: readonly (ReferenceNumericControlId | ReferenceControlActionId)[],
  diagnosticOutputs: readonly DiagnosticsCaptureName[],
  automatic: boolean,
): ReferenceEffectControlDescriptor {
  return Object.freeze({
    effectId,
    variantId,
    label,
    controlIds: Object.freeze([...controlIds]),
    diagnosticOutputs: Object.freeze([...diagnosticOutputs]),
    automatic,
  });
}

function monitorDescriptor(
  id: ReferenceMonitorId,
  label: string,
  group: string,
  value: ReferenceMonitorDescriptor["value"],
  heavy: boolean,
  read: ReferenceMonitorDescriptor["read"],
): ReferenceMonitorDescriptor {
  return Object.freeze({
    id,
    audience: "engineering",
    label,
    group,
    value,
    heavy,
    read,
  });
}

function assertInRange(
  id: string,
  value: number,
  min: number,
  max: number,
): void {
  if (value < min || value > max) {
    throw new RangeError(
      `${id} must be between ${String(min)} and ${String(max)}.`,
    );
  }
}

function freezeArtisticControls(controls: ArtisticControls): ArtisticControls {
  return Object.freeze({ ...controls });
}

function freezeEnvironment(
  candidate: HostEnvironmentSnapshot,
): HostEnvironmentSnapshot {
  return Object.freeze({
    lighting: Object.freeze({ ...candidate.lighting }),
    weather: Object.freeze({ ...candidate.weather }),
    atmosphere: Object.freeze({ ...candidate.atmosphere }),
  });
}

function setEnvironmentNumeric(
  current: HostEnvironmentSnapshot,
  id: Extract<ReferenceNumericControlId, `environment.${string}`>,
  value: number,
): HostEnvironmentSnapshot {
  switch (id) {
    case "environment.lighting.sunDirectionX":
      return freezeEnvironment({
        ...current,
        lighting: { ...current.lighting, sunDirectionX: value },
      });
    case "environment.lighting.sunDirectionY":
      return freezeEnvironment({
        ...current,
        lighting: { ...current.lighting, sunDirectionY: value },
      });
    case "environment.lighting.sunDirectionZ":
      return freezeEnvironment({
        ...current,
        lighting: { ...current.lighting, sunDirectionZ: value },
      });
    case "environment.lighting.sunColorR":
      return freezeEnvironment({
        ...current,
        lighting: { ...current.lighting, sunColorR: value },
      });
    case "environment.lighting.sunColorG":
      return freezeEnvironment({
        ...current,
        lighting: { ...current.lighting, sunColorG: value },
      });
    case "environment.lighting.sunColorB":
      return freezeEnvironment({
        ...current,
        lighting: { ...current.lighting, sunColorB: value },
      });
    case "environment.lighting.sunIntensity":
      return freezeEnvironment({
        ...current,
        lighting: { ...current.lighting, sunIntensity: value },
      });
    case "environment.lighting.environmentIntensity":
      return freezeEnvironment({
        ...current,
        lighting: { ...current.lighting, environmentIntensity: value },
      });
    case "environment.lighting.sunAngularRadiusRadians":
      return freezeEnvironment({
        ...current,
        lighting: { ...current.lighting, sunAngularRadiusRadians: value },
      });
    case "environment.weather.windDirectionX":
      return freezeEnvironment({
        ...current,
        weather: { ...current.weather, windDirectionX: value },
      });
    case "environment.weather.windDirectionZ":
      return freezeEnvironment({
        ...current,
        weather: { ...current.weather, windDirectionZ: value },
      });
    case "environment.weather.windStrength":
      return freezeEnvironment({
        ...current,
        weather: { ...current.weather, windStrength: value },
      });
    case "environment.weather.gustStrength":
      return freezeEnvironment({
        ...current,
        weather: { ...current.weather, gustStrength: value },
      });
    case "environment.weather.rainIntensity":
      return freezeEnvironment({
        ...current,
        weather: { ...current.weather, rainIntensity: value },
      });
    case "environment.atmosphere.cloudCoverage":
      return freezeEnvironment({
        ...current,
        atmosphere: { ...current.atmosphere, cloudCoverage: value },
      });
    case "environment.atmosphere.cloudShadowStrength":
      return freezeEnvironment({
        ...current,
        atmosphere: { ...current.atmosphere, cloudShadowStrength: value },
      });
    case "environment.atmosphere.horizonHaze":
      return freezeEnvironment({
        ...current,
        atmosphere: { ...current.atmosphere, horizonHaze: value },
      });
    case "environment.atmosphere.stormAerosolIntensity":
      return freezeEnvironment({
        ...current,
        atmosphere: { ...current.atmosphere, stormAerosolIntensity: value },
      });
    case "environment.atmosphere.lightningIntensity":
      return freezeEnvironment({
        ...current,
        atmosphere: { ...current.atmosphere, lightningIntensity: value },
      });
  }
  return unreachableControl(id);
}

function readEnvironmentNumeric(
  snapshot: ReferenceControlSnapshot,
  id: Extract<ReferenceNumericControlId, `environment.${string}`>,
): number {
  switch (id) {
    case "environment.lighting.sunDirectionX":
      return snapshot.environment.lighting.sunDirectionX;
    case "environment.lighting.sunDirectionY":
      return snapshot.environment.lighting.sunDirectionY;
    case "environment.lighting.sunDirectionZ":
      return snapshot.environment.lighting.sunDirectionZ;
    case "environment.lighting.sunColorR":
      return snapshot.environment.lighting.sunColorR;
    case "environment.lighting.sunColorG":
      return snapshot.environment.lighting.sunColorG;
    case "environment.lighting.sunColorB":
      return snapshot.environment.lighting.sunColorB;
    case "environment.lighting.sunIntensity":
      return snapshot.environment.lighting.sunIntensity;
    case "environment.lighting.environmentIntensity":
      return snapshot.environment.lighting.environmentIntensity;
    case "environment.lighting.sunAngularRadiusRadians":
      return snapshot.environment.lighting.sunAngularRadiusRadians;
    case "environment.weather.windDirectionX":
      return snapshot.environment.weather.windDirectionX;
    case "environment.weather.windDirectionZ":
      return snapshot.environment.weather.windDirectionZ;
    case "environment.weather.windStrength":
      return snapshot.environment.weather.windStrength;
    case "environment.weather.gustStrength":
      return snapshot.environment.weather.gustStrength;
    case "environment.weather.rainIntensity":
      return snapshot.environment.weather.rainIntensity;
    case "environment.atmosphere.cloudCoverage":
      return snapshot.environment.atmosphere.cloudCoverage;
    case "environment.atmosphere.cloudShadowStrength":
      return snapshot.environment.atmosphere.cloudShadowStrength;
    case "environment.atmosphere.horizonHaze":
      return snapshot.environment.atmosphere.horizonHaze;
    case "environment.atmosphere.stormAerosolIntensity":
      return snapshot.environment.atmosphere.stormAerosolIntensity;
    case "environment.atmosphere.lightningIntensity":
      return snapshot.environment.atmosphere.lightningIntensity;
  }
  return unreachableControl(id);
}

function updateHeroBreakerDraft(
  current: ReferenceHeroBreakerDraft,
  id: Extract<ReferenceNumericControlId, `heroBreaker.${string}`>,
  value: number,
): ReferenceHeroBreakerDraft {
  switch (id) {
    case "heroBreaker.anchorOffsetX":
      return Object.freeze({ ...current, anchorOffsetX: value });
    case "heroBreaker.anchorOffsetZ":
      return Object.freeze({ ...current, anchorOffsetZ: value });
    case "heroBreaker.headingDegrees":
      return Object.freeze({ ...current, headingDegrees: value });
    case "heroBreaker.radiusMetres":
      return Object.freeze({ ...current, radiusMetres: value });
    case "heroBreaker.amplitudeMetres":
      return Object.freeze({ ...current, amplitudeMetres: value });
    case "heroBreaker.foamAmount":
      return Object.freeze({ ...current, foamAmount: value });
    case "heroBreaker.sprayAmount":
      return Object.freeze({ ...current, sprayAmount: value });
    case "heroBreaker.lifetimeSeconds": {
      const lifetimeTicks = Math.max(1, Math.min(600, Math.round(value * 60)));
      return Object.freeze({
        ...current,
        lifetimeSeconds: lifetimeTicks / 60,
        lifetimeTicks,
      });
    }
    case "heroBreaker.lifetimeTicks":
      return Object.freeze({
        ...current,
        lifetimeSeconds: value / 60,
        lifetimeTicks: value,
      });
    case "heroBreaker.priority":
      return Object.freeze({ ...current, priority: value });
  }
  return unreachableControl(id);
}

function readHeroBreakerNumeric(
  snapshot: ReferenceControlSnapshot,
  id: Extract<ReferenceNumericControlId, `heroBreaker.${string}`>,
): number {
  switch (id) {
    case "heroBreaker.anchorOffsetX":
      return snapshot.heroBreakerDraft.anchorOffsetX;
    case "heroBreaker.anchorOffsetZ":
      return snapshot.heroBreakerDraft.anchorOffsetZ;
    case "heroBreaker.headingDegrees":
      return snapshot.heroBreakerDraft.headingDegrees;
    case "heroBreaker.radiusMetres":
      return snapshot.heroBreakerDraft.radiusMetres;
    case "heroBreaker.amplitudeMetres":
      return snapshot.heroBreakerDraft.amplitudeMetres;
    case "heroBreaker.foamAmount":
      return snapshot.heroBreakerDraft.foamAmount;
    case "heroBreaker.sprayAmount":
      return snapshot.heroBreakerDraft.sprayAmount;
    case "heroBreaker.lifetimeSeconds":
      return snapshot.heroBreakerDraft.lifetimeSeconds;
    case "heroBreaker.lifetimeTicks":
      return snapshot.heroBreakerDraft.lifetimeTicks;
    case "heroBreaker.priority":
      return snapshot.heroBreakerDraft.priority;
  }
  return unreachableControl(id);
}

function unreachableControl(id: never): never {
  throw new RangeError(`Unknown Reference numeric control: ${String(id)}`);
}

function createHeroBreakerBatch(
  id: number,
  draft: ReferenceHeroBreakerDraft,
  runtime: OpenWaterRuntimeSnapshot,
): HeroBreakerDisturbanceBatch {
  const heading = (draft.headingDegrees * Math.PI) / 180;
  return Object.freeze({
    kind: "hero-breaker",
    count: 1,
    ids: Uint32Array.of(id),
    positions: Float32Array.of(
      runtime.interactionAnchor.x + draft.anchorOffsetX,
      runtime.seaLevelMetres,
      runtime.interactionAnchor.z + draft.anchorOffsetZ,
    ),
    directions: Float32Array.of(Math.sin(heading), 0, Math.cos(heading)),
    radii: Float32Array.of(draft.radiusMetres),
    amplitudes: Float32Array.of(draft.amplitudeMetres),
    foamAmounts: Float32Array.of(draft.foamAmount),
    sprayAmounts: Float32Array.of(draft.sprayAmount),
    lifetimeTicks: Uint16Array.of(draft.lifetimeTicks),
    priorities: Uint8Array.of(draft.priority),
  });
}

function freezeLightweightRuntime(
  snapshot: OpenWaterRuntimeSnapshot,
): ReferenceControlRuntimeSnapshot {
  return Object.freeze({
    tick: snapshot.tick,
    seaLevelMetres: snapshot.seaLevelMetres,
    controlRevision: snapshot.controlRevision,
    interactionAnchorX: snapshot.interactionAnchor.x,
    interactionAnchorZ: snapshot.interactionAnchor.z,
    activeDisturbanceCount: snapshot.activeDisturbanceCount,
    activeHeroBreakerCount: snapshot.activeHeroBreakerCount,
    activeBodyWakeCount: snapshot.activeBodyWakeCount,
    attachedBodyCount: snapshot.attachedBodyCount,
  });
}

function readLightweightRuntime(
  lease: RealWaterLease | undefined,
): ReferenceControlRuntimeSnapshot | null {
  return lease === undefined
    ? null
    : freezeLightweightRuntime(lease.inspectRuntime());
}

function sameLightweightRuntime(
  left: ReferenceControlRuntimeSnapshot | null,
  right: ReferenceControlRuntimeSnapshot,
): boolean {
  return (
    left !== null &&
    left.tick === right.tick &&
    left.seaLevelMetres === right.seaLevelMetres &&
    left.controlRevision === right.controlRevision &&
    left.interactionAnchorX === right.interactionAnchorX &&
    left.interactionAnchorZ === right.interactionAnchorZ &&
    left.activeDisturbanceCount === right.activeDisturbanceCount &&
    left.activeHeroBreakerCount === right.activeHeroBreakerCount &&
    left.activeBodyWakeCount === right.activeBodyWakeCount &&
    left.attachedBodyCount === right.attachedBodyCount
  );
}
