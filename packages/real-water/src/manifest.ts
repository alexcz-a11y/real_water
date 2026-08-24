import { RealWaterStartupError } from "./errors.js";
import {
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
  SUPPORTED_HOST_ENVIRONMENT_WORK_PLAN_FINGERPRINT,
  type HostEnvironmentReflectionDescriptor,
} from "./environment.js";
import { hasExactKeys, isRecord } from "./internal/record-validation.js";
import { sha256Identifier } from "./internal/sha256.js";
import {
  createMinimalWaterQualityProfile,
  normalizeQualityProfile,
  qualityProfileIdentity,
  type MinimalWaterQualityProfileId,
  type QualityProfile,
  type QualityProfileIdentity,
} from "./quality-profile.js";

/**
 * The discriminator for supported Prewarm Manifests.
 *
 * @public
 */
export const PREWARM_MANIFEST_SCHEMA = "real-water/prewarm" as const;

/**
 * The only Prewarm Manifest version accepted by this release.
 *
 * Version 12 comes from #30's complete prepared Storm Front route. Version 11
 * added the bounded art-directed Hero Breaker to version 10's
 * complete T22 underwater tracer: prewarmed deformation, dedicated foam,
 * shared-pool spray, and diagnostics. There is no migration rung: the only
 * consumer is an equality gate that rejects any other value, so the number is
 * an identity stamp for a declaration set, not a payload that can be carried
 * forward.
 *
 * @public
 */
export const PREWARM_MANIFEST_VERSION = 12 as const;

/**
 * Immutable physical drawing-buffer dimensions bound into a Prewarm Manifest.
 *
 * @public
 */
export interface PrewarmDrawingBuffer {
  readonly width: number;
  readonly height: number;
}

const DEFAULT_MEMORY_PREWARM_DRAWING_BUFFER: PrewarmDrawingBuffer =
  Object.freeze({
    width: 320,
    height: 180,
  });
const PREWARM_MANIFEST_KEYS = [
  "schema",
  "version",
  "id",
  "manifestHash",
  "qualityProfile",
  "drawingBuffer",
  "environmentReflection",
  "effectVariants",
  "declarations",
] as const;

/**
 * Structural declaration kinds supported by the first Readiness Gate.
 *
 * @public
 */
export type PrewarmDeclarationKind =
  "resource" | "effect-state" | "conditional-route";

/**
 * One declared item of work in a supported Prewarm Manifest.
 *
 * @public
 */
export interface PrewarmDeclaration {
  readonly id: string;
  readonly kind: PrewarmDeclarationKind;
  readonly label: string;
  readonly fingerprint: string;
}

/**
 * One exact effect route prepared by a supported Prewarm Manifest.
 *
 * @public
 */
export interface PrewarmEffectVariant {
  readonly effectId: string;
  readonly variantId: string;
}

/**
 * A closed, versioned declaration of structural work required before readiness.
 *
 * @public
 */
export interface PrewarmManifest {
  readonly schema: typeof PREWARM_MANIFEST_SCHEMA;
  readonly version: typeof PREWARM_MANIFEST_VERSION;
  readonly id: string;
  readonly manifestHash: string;
  readonly qualityProfile: QualityProfile;
  readonly drawingBuffer: PrewarmDrawingBuffer;
  readonly environmentReflection: HostEnvironmentReflectionDescriptor;
  readonly effectVariants: readonly PrewarmEffectVariant[];
  readonly declarations: readonly PrewarmDeclaration[];
}

/**
 * The immutable manifest identity attached to a ready lease.
 *
 * @public
 */
export interface PrewarmManifestIdentity {
  readonly schema: typeof PREWARM_MANIFEST_SCHEMA;
  readonly version: typeof PREWARM_MANIFEST_VERSION;
  readonly id: string;
  readonly manifestHash: string;
  readonly qualityProfile: QualityProfileIdentity;
  readonly drawingBuffer: PrewarmDrawingBuffer;
  readonly environmentReflection: HostEnvironmentReflectionDescriptor;
  readonly effectVariants: readonly PrewarmEffectVariant[];
}

const SHA_256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const DECLARATION_KINDS: readonly PrewarmDeclarationKind[] = [
  "resource",
  "effect-state",
  "conditional-route",
];

/**
 * The immutable registry of effect variants supported by this release.
 */
export const SUPPORTED_EFFECT_VARIANTS: readonly PrewarmEffectVariant[] =
  Object.freeze([
    Object.freeze({
      effectId: "minimal-water-surface",
      variantId: "basic",
    }),
    Object.freeze({
      effectId: "unified-foam",
      variantId: "source-resolved-persistent",
    }),
    Object.freeze({
      effectId: "underwater-volume",
      variantId: "depth-aware",
    }),
    Object.freeze({
      effectId: "secondary-particles",
      variantId: "bounded-post-traa",
    }),
    Object.freeze({
      effectId: "underwater-caustics",
      variantId: "prepared-surface-visible-receivers",
    }),
    Object.freeze({
      effectId: "underwater-particles",
      variantId: "deterministic-depth-aware",
    }),
    Object.freeze({
      effectId: "underwater-bubbles",
      variantId: "cloud-and-rising-depth-aware",
    }),
    Object.freeze({
      effectId: "lens-wetness",
      variantId: "bounded-emergence-decay",
    }),
    Object.freeze({
      effectId: "hero-breaker",
      variantId: "art-directed-overturning",
    }),
    Object.freeze({
      effectId: "rain",
      variantId: "additive-ripples-and-shared-spray",
    }),
    Object.freeze({
      effectId: "storm-aerosol",
      variantId: "shared-spray-post-traa-atmosphere",
    }),
    Object.freeze({
      effectId: "cloud-shadow",
      variantId: "coherent-optical-atmosphere-modulation",
    }),
    Object.freeze({
      effectId: "lightning",
      variantId: "fixed-tick-coherent-transient",
    }),
  ]);

export const MINIMAL_WATER_PREWARM_DECLARATION_IDS = Object.freeze({
  texture: "water-texture",
  environmentRadiance: "water-environment-radiance",
  sceneColor: "water-scene-color",
  sceneDepth: "water-scene-depth",
  renderTarget: "water-render-target",
  clipmap: "water-clipmap",
  localInteractionField: "water-local-interaction-field",
  localInteractionBuffers: "water-local-interaction-buffers",
  localInteractionRadialImpactRoute:
    "water-local-interaction-radial-impact-route",
  localInteractionDirectionalWakeRoute:
    "water-local-interaction-directional-wake-route",
  heroBreakerState: "water-hero-breaker-state",
  heroBreakerDeformationRoute: "water-hero-breaker-deformation-route",
  heroBreakerFoamRoute: "water-hero-breaker-foam-route",
  heroBreakerSprayRoute: "water-hero-breaker-spray-route",
  heroBreakerFoamDiagnosticsTarget:
    "water-hero-breaker-foam-diagnostics-target",
  heroBreakerFoamDiagnosticsRoute: "water-hero-breaker-foam-diagnostics-route",
  heroBreakerFoamProbe: "water-hero-breaker-foam-probe",
  stormFrontState: "water-storm-front-state",
  stormRainRippleRoute: "water-storm-rain-ripple-route",
  stormRainSprayRoute: "water-storm-rain-spray-route",
  stormAerosolRoute: "water-storm-aerosol-route",
  stormCloudShadowRoute: "water-storm-cloud-shadow-route",
  stormLightningRoute: "water-storm-lightning-route",
  stormAtmosphereTarget: "water-storm-atmosphere-target",
  stormAtmosphereStageRoute: "water-storm-atmosphere-stage-route",
  stormDiagnosticsTarget: "water-storm-diagnostics-target",
  stormDiagnosticsRoute: "water-storm-diagnostics-route",
  stormProbe: "water-storm-probe",
  bodySocketEmissionRoute: "water-body-socket-emission-route",
  spectralBandSwell: "water-spectral-band-swell",
  spectralBandWind: "water-spectral-band-wind",
  spectralBandChop: "water-spectral-band-chop",
  spectralBandRipple: "water-spectral-band-ripple",
  whitecapFieldA: "water-whitecap-field-a",
  whitecapFieldB: "water-whitecap-field-b",
  whitecapResetRoute: "water-whitecap-reset-route",
  whitecapGenerationRoute: "water-whitecap-generation-route",
  whitecapHistory: "water-whitecap-history",
  whitecapAdvectionRoute: "water-whitecap-advection-route",
  whitecapDiffusionRoute: "water-whitecap-diffusion-route",
  whitecapDecayRoute: "water-whitecap-decay-route",
  whitecapStageTarget: "water-whitecap-stage-target",
  whitecapStageRoute: "water-whitecap-stage-route",
  whitecapProbe: "water-whitecap-probe",
  foamLocalFieldA: "water-foam-local-field-a",
  foamLocalFieldB: "water-foam-local-field-b",
  foamSourceHistory: "water-foam-source-history",
  foamLocalAdvectionRoute: "water-foam-local-advection-route",
  foamLocalResolveRoute: "water-foam-local-resolve-route",
  underwaterCausticsLocalSurfaceField:
    "water-underwater-caustics-local-surface-field",
  foamSourceIdentityTarget: "water-foam-source-identity-target",
  foamSourceIdentityRoute: "water-foam-source-identity-route",
  foamSourceIdentityProbe: "water-foam-source-identity-probe",
  material: "water-material",
  opticalRoute: "water-optical-route",
  waterlineState: "water-waterline-state",
  undersideOpticalRoute: "water-underside-optical-route",
  waterlineHistoryResetRoute: "water-waterline-history-reset-route",
  lensWetnessTransition: "water-lens-wetness-transition",
  planarReflectionTarget: "water-planar-reflection-target",
  planarReflectionRoute: "water-planar-reflection-route",
  planarEnvironmentFallback: "water-planar-environment-fallback",
  planarReflectionProbe: "water-planar-reflection-probe",
  ssrRawTarget: "water-ssr-raw-target",
  ssrBlurTarget: "water-ssr-blur-target",
  ssrCompositeTarget: "water-ssr-composite-target",
  ssrRoute: "water-ssr-route",
  ssrBlurCopyRoute: "water-ssr-blur-copy-route",
  ssrBlurRoute: "water-ssr-blur-route",
  ssrCompositeRoute: "water-ssr-composite-route",
  ssrHistoryTarget: "water-ssr-history-target",
  ssrHistoryResolveTarget: "water-ssr-history-resolve-target",
  ssrHistoryBeautyTarget: "water-ssr-history-beauty-target",
  ssrHistoryBeautyRoute: "water-ssr-history-beauty-route",
  ssrHistoryResolvedCaptureTarget: "water-ssr-history-resolved-capture-target",
  ssrHistoryResolvedCopyRoute: "water-ssr-history-resolved-copy-route",
  ssrHistoryPreviousDepth: "water-ssr-history-previous-depth",
  ssrHistoryPreviousNormal: "water-ssr-history-previous-normal",
  ssrHistorySeedRoute: "water-ssr-history-seed-route",
  ssrHistoryResolveRoute: "water-ssr-history-resolve-route",
  ssrHistoryAccumulateRoute: "water-ssr-history-accumulate-route",
  ssrHistoryResetRoute: "water-ssr-history-reset-route",
  ssrHistoryResetVelocityTarget: "water-ssr-history-reset-velocity-target",
  ssrHistoryResetVelocityRoute: "water-ssr-history-reset-velocity-route",
  ssrHistoryProbe: "water-ssr-history-probe",
  ssrProbe: "water-ssr-probe",
  underwaterVolumeTarget: "water-underwater-volume-target",
  underwaterVolumeRoute: "water-underwater-volume-route",
  underwaterDepthCompositionRoute: "water-underwater-depth-composition-route",
  underwaterSunShaftShadowRoute: "water-underwater-sun-shaft-shadow-route",
  underwaterDiagnosticsTarget: "water-underwater-diagnostics-target",
  underwaterDiagnosticsRoute: "water-underwater-diagnostics-route",
  underwaterProbe: "water-underwater-probe",
  underwaterCausticsReceiverRoute: "water-underwater-caustics-receiver-route",
  underwaterCausticsDiagnosticsTarget:
    "water-underwater-caustics-diagnostics-target",
  underwaterCausticsDiagnosticsRoute:
    "water-underwater-caustics-diagnostics-route",
  underwaterCausticsProbe: "water-underwater-caustics-probe",
  underwaterParticleCandidateState: "water-underwater-particle-candidate-state",
  underwaterParticleAllocationRoutes:
    "water-underwater-particle-allocation-routes",
  underwaterSuspendedParticleTarget:
    "water-underwater-suspended-particle-target",
  underwaterSuspendedParticleRoute: "water-underwater-suspended-particle-route",
  underwaterBubbleTarget: "water-underwater-bubble-target",
  underwaterBubbleRoute: "water-underwater-bubble-route",
  underwaterTracerCompositeTarget: "water-underwater-tracer-composite-target",
  underwaterTracerCompositeRoute: "water-underwater-tracer-composite-route",
  underwaterTracerProbe: "water-underwater-tracer-probe",
  renderRoute: "water-render-route",
  proceduralMotion: "water-procedural-motion",
  motionVectors: "water-motion-vectors",
  inverseLinearDepth: "water-inverse-linear-depth",
  viewNormal: "water-view-normal",
  opticalFactorsTarget: "water-optical-factors-target",
  historyRejectionTarget: "water-history-rejection-target",
  historyRejectionRoute: "water-history-rejection-route",
  opticalDiagnosticsA: "water-optical-diagnostics-a",
  opticalDiagnosticsB: "water-optical-diagnostics-b",
  finalColorTarget: "water-final-color-target",
  currentColorTarget: "water-current-color-target",
  stockTraaHistory: "water-stock-traa-history",
  traaResolveJitter: "water-traa-resolve-jitter",
  traaResetRoute: "water-traa-reset-route",
  secondaryParticlePool: "water-secondary-particle-pool",
  secondaryParticleAllocationRoute: "water-secondary-particle-allocation-route",
  postTraaCompositionPlan: "water-post-traa-composition-plan",
  traaResolvedTarget: "water-traa-resolved-target",
  secondaryParticleAccumulationTarget:
    "water-secondary-particle-accumulation-target",
  secondaryParticleCompositeTarget: "water-secondary-particle-composite-target",
  secondaryParticleStageRoute: "water-secondary-particle-stage-route",
  secondaryParticleCompositeRoute: "water-secondary-particle-composite-route",
  secondaryParticleDiagnosticsRoute:
    "water-secondary-particle-diagnostics-route",
  secondaryParticleProbe: "water-secondary-particle-probe",
  lensWetnessDiagnosticsTarget: "water-lens-wetness-diagnostics-target",
  lensWetnessStageRoute: "water-lens-wetness-stage-route",
  lensWetnessDiagnosticsRoute: "water-lens-wetness-diagnostics-route",
  lensWetnessProbe: "water-lens-wetness-probe",
  currentColorConversion: "water-current-color-conversion",
  namedOutputRoutes: "water-named-output-routes",
  hiddenStabilization: "water-hidden-stabilization",
  completionProbe: "water-completion-probe",
  mainCameraGuard: "water-main-camera-guard",
} as const);

const MINIMAL_WATER_MANIFEST_ID = "reference-minimal-water";
const ENVIRONMENT_REFLECTION_KEYS = [
  "identity",
  "fingerprint",
  "width",
  "height",
  "format",
  "type",
  "colorSpace",
] as const;
const DRAWING_BUFFER_BOUND_DECLARATION_IDS: ReadonlySet<string> = new Set([
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.sceneColor,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.sceneDepth,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.renderTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.motionVectors,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.inverseLinearDepth,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.viewNormal,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalFactorsTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.historyRejectionTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.historyRejectionRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalDiagnosticsA,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalDiagnosticsB,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.finalColorTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.currentColorTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.stockTraaHistory,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.traaResolveJitter,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleAllocationRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.postTraaCompositionPlan,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.traaResolvedTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleAccumulationTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleCompositeTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleStageRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleCompositeRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleDiagnosticsRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleProbe,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.lensWetnessDiagnosticsTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.lensWetnessStageRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.lensWetnessDiagnosticsRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.lensWetnessProbe,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.renderRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.currentColorConversion,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.namedOutputRoutes,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.completionProbe,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.mainCameraGuard,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.planarReflectionTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.planarReflectionRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.planarReflectionProbe,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrRawTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrBlurTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrCompositeTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrBlurCopyRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrBlurRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrCompositeRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResolveTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryBeautyTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryBeautyRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResolvedCaptureTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResolvedCopyRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryPreviousDepth,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryPreviousNormal,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistorySeedRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResolveRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryAccumulateRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResetRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResetVelocityTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResetVelocityRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryProbe,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrProbe,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterVolumeTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterVolumeRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterDiagnosticsTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterDiagnosticsRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterProbe,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterCausticsReceiverRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterCausticsDiagnosticsTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterCausticsDiagnosticsRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterCausticsProbe,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterParticleAllocationRoutes,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterSuspendedParticleTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterSuspendedParticleRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterBubbleTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterBubbleRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterTracerCompositeTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterTracerCompositeRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterTracerProbe,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapStageTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapStageRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapProbe,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamSourceIdentityTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.heroBreakerFoamDiagnosticsTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormRainRippleRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormRainSprayRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormAerosolRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormCloudShadowRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormLightningRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormAtmosphereTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormAtmosphereStageRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormDiagnosticsTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormDiagnosticsRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormProbe,
]);
const MINIMAL_WATER_DECLARATIONS: readonly PrewarmDeclaration[] = [
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.texture,
    kind: "resource",
    label: "Minimal water texture",
    fingerprint:
      "sha256:6a6c8aa146e7dd50e15eed0c5b627b961a11fbd49b4655147345a44a5d0bb1bc",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.environmentRadiance,
    kind: "resource",
    label: "Host environment radiance (equirect rgba8unorm 8x4 srgb)",
    fingerprint: SUPPORTED_HOST_ENVIRONMENT_WORK_PLAN_FINGERPRINT,
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.sceneColor,
    kind: "resource",
    label: "Viewport pre-water scene color (viewportSharedTexture)",
    fingerprint:
      "sha256:7761ba3b4ab1e04567aa1e9e796d3a66e8dab91e157940cce9281e4eaf9e53fb",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.sceneDepth,
    kind: "resource",
    label: "Viewport opaque scene depth (viewportDepthTexture)",
    fingerprint:
      "sha256:b1c0600e109f08f14c72d84ac848e85a64d47d69daf0406aa966911a0872a169",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.renderTarget,
    kind: "resource",
    label: "Minimal water 6-attachment MRT (32 bytes/sample)",
    fingerprint:
      "sha256:e6249a83e55512d997edbe3d8a2ce16875b2abc1f721bb48834a7281a419a262",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.clipmap,
    kind: "resource",
    label: "Camera-relative Open Water clipmap (128x128 segments)",
    fingerprint:
      "sha256:61fcb210b4d47847c615ceaec5c83d943ab09fbd993708771ba19d63cf8189e9",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.localInteractionField,
    kind: "effect-state",
    label:
      "Movable local interaction field (one anchor, 48m radius, 8m Hermite edge fade)",
    fingerprint:
      "sha256:cdf050c8eca5e1959e92c4c24a6e852ee1978418ee5fbae98f3633ea54426030",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.localInteractionBuffers,
    kind: "resource",
    label:
      "Preallocated current/previous local Disturbance uniform arrays (128 shared slots plus 8 Hero Breaker slots; radial, directional wake, propeller-wash, and art-directed overturning descriptors; host-fixed 60Hz; Hero lifetime 1..600 ticks)",
    fingerprint:
      // Provenance: #29 reminted the reproducible seed from this declaration's expanded exact label bytes.
      "sha256:5b314ffb9d6a63500d1c406ede0b10cf05dbb7f919e50db46b67f36107ddc3b0",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.localInteractionRadialImpactRoute,
    kind: "conditional-route",
    label:
      "Analytic radial-impact deformation and zero-or-one-tick local correction snapshot route",
    fingerprint:
      "sha256:14c091bcb991385050dc738b3f032e64cc654059db94b7edd4dfc4f8329e17bc",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.localInteractionDirectionalWakeRoute,
    kind: "conditional-route",
    label:
      "Analytic directional-wake deformation and zero-or-one-tick local correction snapshot route",
    fingerprint:
      "sha256:0f10fe46295e2ce29efbb4ece51e4c9c0b56b218415c66b96eecea2394ac8c9f",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.heroBreakerState,
    kind: "resource",
    label:
      "Hero Breaker current/previous fixed-tick uniform-array state (8 slots; host-fixed 60Hz; lifetime 1..600 ticks)",
    fingerprint:
      // Provenance: #29 minted this reproducible seed from the declaration's exact label bytes.
      "sha256:d2c0f70342df3753c767ca747ffb6bd7c8e98ad66d3a9854deba43295cb81654",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.heroBreakerDeformationRoute,
    kind: "conditional-route",
    label:
      "Art-directed asymmetric Hero Breaker overturning deformation route (uniform-array; host-fixed 60Hz; initial crest center -0.2 radii; forward travel 0.75 radii; back/front widths 0.72/0.26 radii; forward hollow center/width/depth 0.38/0.24 radii/0.42; lateral width 0.7 radii; attack/release-start fractions 0.18/0.68; forward curl 0.35)",
    fingerprint:
      // Provenance: #29 minted this reproducible seed from the declaration's exact label bytes.
      "sha256:184521c4f2e18a147db2ae679dccf5327f63f63da0a08fcc88bd52ece6bbd808",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.heroBreakerFoamRoute,
    kind: "conditional-route",
    label:
      "Dedicated Hero Breaker foam injection (third local source channel: R wake, G impact, B Hero, A union; RGBA16F 128x128 anchor-local ping-pong; host-fixed 60Hz)",
    fingerprint:
      // Provenance: #29 minted this reproducible seed from the declaration's exact label bytes.
      "sha256:7b610af44ca748e6832c503f79727c6d12dffd46df4310e2c1a7281eed23fe1d",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.heroBreakerSprayRoute,
    kind: "conditional-route",
    label:
      "Hero Breaker spray generation through the existing spray-droplet-mist consumer partition (up to 4,096 deterministic candidates per active Hero; shared-pool post-TRAA)",
    fingerprint:
      // Provenance: #29 minted this reproducible seed from the declaration's exact label bytes.
      "sha256:a14193d923605cd51acf4fb8ec7df00871e0ce627db9f2a4670464bff053dd5d",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.heroBreakerFoamDiagnosticsTarget,
    kind: "resource",
    label:
      "Hero Breaker foam diagnostics target (RGBA16F, drawing-buffer-exact; R scalar Hero foam)",
    fingerprint:
      // Provenance: #29 minted this reproducible seed from the declaration's exact label bytes.
      "sha256:3e57313110292e7292a28f379183191e87a37c252e3ede01a808393a923046aa",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.heroBreakerFoamDiagnosticsRoute,
    kind: "conditional-route",
    label:
      "On-request Hero Breaker foam diagnostics route (R scalar unpacked from the RGBA16F drawing-buffer-exact target)",
    fingerprint:
      // Provenance: #29 minted this reproducible seed from the declaration's exact label bytes.
      "sha256:1e34854cd60391c94cfd13888346053efeb4b444ee6ebfb129aaa01a7f885977",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.heroBreakerFoamProbe,
    kind: "conditional-route",
    label:
      "GPU completion probe of Hero Breaker deformation, dedicated foam, shared-pool spray, and RGBA16F drawing-buffer-exact foam diagnostics target",
    fingerprint:
      // Provenance: #29 minted this reproducible seed from the declaration's exact label bytes.
      "sha256:791a1f852d2d6e5c3c1648490c9a5e7cedada270d85c3e20f8d81f6c02f76566",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormFrontState,
    kind: "effect-state",
    label:
      "Storm Front fixed-tick state (Host Environment lighting/weather/atmosphere snapshot; additive rain ripples; shared rain/aerosol spray partitions; coherent cloud/lightning response)",
    fingerprint:
      // Provenance: #30 minted this seed from the declaration's exact UTF-8 label bytes.
      "sha256:f3a12010c37865d18d49711d8543045f3080faba8974b5708ebf5dd60762e681",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormRainRippleRoute,
    kind: "conditional-route",
    label:
      "Additive rain-ripple surface route (0.012m maximum correction; current/previous spectral surface, normals, motion, and prepared receiver sampling)",
    fingerprint:
      // Provenance: #30 minted this seed from the declaration's exact UTF-8 label bytes.
      "sha256:79b6fb7f0bb5320397b518823c5024fd2633847564c33fde0d8e933d94c846e0",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormRainSprayRoute,
    kind: "conditional-route",
    label:
      "Near-camera rain-spray generation through spray-droplet-mist (up to 8,192 deterministic candidates; output-drawing-buffer Q16 contribution ruler)",
    fingerprint:
      // Provenance: #30 minted this seed from the declaration's exact UTF-8 label bytes.
      "sha256:9a6c68bda80805fa995a10d249834c9fbfcdbb87b057c1040ed4aa96d83a01ce",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormAerosolRoute,
    kind: "conditional-route",
    label:
      "Storm aerosol generation through spray-droplet-mist (up to 8,192 deterministic candidates; output-drawing-buffer Q16 contribution ruler; post-TRAA)",
    fingerprint:
      // Provenance: #30 minted this seed from the declaration's exact UTF-8 label bytes.
      "sha256:779efcffce9e01100861ecd15c961ca04f49479a22dd05c25c3dc47f147483f6",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormCloudShadowRoute,
    kind: "conditional-route",
    label:
      "Cloud-shadow modulation route for glints, foam, planar/environment reflection, and drawing-buffer-exact atmosphere",
    fingerprint:
      // Provenance: #30 minted this seed from the declaration's exact UTF-8 label bytes.
      "sha256:f9d98f3120f42282cee47757d339c91566c28db8e077c541bead23dcab1aad84",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormLightningRoute,
    kind: "conditional-route",
    label:
      "Fixed-tick lightning transient route for glints, foam, planar/environment reflection, and drawing-buffer-exact atmosphere",
    fingerprint:
      // Provenance: #30 minted this seed from the declaration's exact UTF-8 label bytes.
      "sha256:7059e3a74a0e06887dd44cfaa99b21cda4134ae6db444096de82471a4fbaeca6",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormAtmosphereTarget,
    kind: "resource",
    label:
      "Storm atmosphere output (RGBA8, drawing-buffer-exact, post-secondary-particles intermediate)",
    fingerprint:
      // Provenance: #30 minted this seed from the declaration's exact UTF-8 label bytes.
      "sha256:6eea0ac108673774db2b3bd3e7c9a1a8d8a5ad75d1bf55b15ae44f6227495102",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormAtmosphereStageRoute,
    kind: "conditional-route",
    label:
      "Storm atmosphere stage (cloud shadow, horizon haze, aerosol, and lightning; drawing-buffer-exact; after secondary particles)",
    fingerprint:
      // Provenance: #30 minted this seed from the declaration's exact UTF-8 label bytes.
      "sha256:630c0e5085e5965eb84fea070209b6c737ac155dd13b2715c1e9ccb83ce51fde",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormDiagnosticsTarget,
    kind: "resource",
    label:
      "Storm diagnostics (RGBA16F rain-ripple/aerosol/cloud-shadow/lightning channels, drawing-buffer-exact)",
    fingerprint:
      // Provenance: #30 minted this seed from the declaration's exact UTF-8 label bytes.
      "sha256:349a060add874f02d14e66a4e10f344c5b9458407f92699d52a0d1efb2b0ba65",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormDiagnosticsRoute,
    kind: "conditional-route",
    label:
      "On-request Storm Front scalar diagnostics route (four normalized channels from one RGBA16F drawing-buffer-exact target)",
    fingerprint:
      // Provenance: #30 minted this seed from the declaration's exact UTF-8 label bytes.
      "sha256:acf8cb2680094af8636032bd9999472b877226df5fafedb0fa1a44f409e878b5",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stormProbe,
    kind: "conditional-route",
    label:
      "Completion probe of Storm atmosphere output and RGBA16F diagnostics target",
    fingerprint:
      // Provenance: #30 minted this seed from the declaration's exact UTF-8 label bytes.
      "sha256:66fdc9cef7c1420c5c9475ba943e83cedd0a393d13fd1bffe1a4f6965b7cc6ff",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.bodySocketEmissionRoute,
    kind: "conditional-route",
    label:
      "Stable Body socket upsert route for bow, stern, wake, and propeller-wash sources",
    fingerprint:
      "sha256:c1cfe69dc318716f368f32c9fdc5f4a008d71b00785049ae34e524b2c98d06b5",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBandSwell,
    kind: "effect-state",
    label: "Swell spectral wave band",
    fingerprint:
      "sha256:b709b5a7bd700e839813432079e70edde4a842ec73fdf4210ae1d37573b9ec3b",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBandWind,
    kind: "effect-state",
    label: "Wind spectral wave band",
    fingerprint:
      "sha256:d214280fa8ae2939a9b001fced931d4261f801b7b7f2175015726bbd6952fc3c",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBandChop,
    kind: "effect-state",
    label: "Chop spectral wave band",
    fingerprint:
      "sha256:1391b6df834fd361e6caeebea074f47a3edae589715f6edf4bc75c13dea807a8",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBandRipple,
    kind: "effect-state",
    label: "Ripple spectral wave band",
    fingerprint:
      "sha256:f45d0459b6c83de101d0b860c7173104c9602a29f6e5f57d1c2fd64f35e9fb8e",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapFieldA,
    kind: "resource",
    label:
      "Spectral whitecap field A (RGBA16F 128x128 repeat, stable final stage identity)",
    fingerprint:
      "sha256:6964c28972247bfe521e4f289cb6e937dd33e2a09bd6bde1907fc6417df5532a",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapFieldB,
    kind: "resource",
    label: "Spectral whitecap field B (RGBA16F 128x128 repeat scratch)",
    fingerprint:
      "sha256:da7fa829786648edc0ee13c9e5520ac1839d46ab9f2cec9474b21be27f35e514",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapResetRoute,
    kind: "conditional-route",
    label:
      "Spectral whitecap A/B 128x128 deterministic reset (seed, simulation reset, rewind, sea-state cut)",
    fingerprint:
      "sha256:0873837843076c0623008daa1287245383edbec389643e5cbebe16641b6f8d98",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapGenerationRoute,
    kind: "conditional-route",
    label: "Steep spectral crest generation (128x128 A to B, host fixed tick)",
    fingerprint:
      "sha256:97a3c3c72e722e2fb9af00dd1ded5af1b68dc5bb1f692aac84111fec17766461",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapHistory,
    kind: "effect-state",
    label:
      "Previous fixed-tick 128x128 whitecap decay carried as bounded history",
    fingerprint:
      "sha256:fed268c92da5f225f3ca5be2daa9e66dbea47d2f951a1051b5548c118b1dcfe3",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapAdvectionRoute,
    kind: "conditional-route",
    label:
      "World-domain semi-Lagrangian whitecap advection (128x128 manual bilinear B to A)",
    fingerprint:
      "sha256:50d3908c21fd1dd73226fd30491b9518ae22c096aa44f00b658f990a17566235",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapDiffusionRoute,
    kind: "conditional-route",
    label: "Three-tap cross-crest whitecap diffusion (128x128 A to B)",
    fingerprint:
      "sha256:d502167e1c04ddf8a6b39a7fcc6f356a340c40be88ec94131ca4bc3eb3057cfd",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapDecayRoute,
    kind: "conditional-route",
    label:
      "Persistent whitecap decay and fresh-generation composition (128x128 B to A)",
    fingerprint:
      "sha256:5bff6f48ddcfecf86f604b3b021004cc886855fdccb23e643e89697187b11199",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapStageTarget,
    kind: "resource",
    label:
      "Spectral whitecap stage diagnostics (RGBA16F, drawing-buffer-exact)",
    fingerprint:
      "sha256:731d234e5ce0ccd2bb8c4102219849e318b619dc1ea21723562e9a0ebbd08969",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapStageRoute,
    kind: "conditional-route",
    label:
      "Output-resolution generation/history/advection/decay resolve from world field",
    fingerprint:
      "sha256:caf42fa74e220528b2c24d8fe5831ce569629a93eba6a26bba085f18173d6666",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapProbe,
    kind: "conditional-route",
    label: "GPU completion probe of packed spectral whitecap stages",
    fingerprint:
      "sha256:d740f79214a0fbb393edfb647e59881e642cf6b9ba79347db72d990058a81881",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamLocalFieldA,
    kind: "resource",
    label:
      "Unified foam local field A (RGBA16F 128x128 anchor-local ping-pong, R wake/G impact/B Hero/A union, 48m radius, 8m Hermite edge fade, stable final identity)",
    fingerprint:
      // Provenance: this historical fingerprint's reproducible source was not recorded; #29 changed only the label and retained the committed value.
      "sha256:654d41ced88d65264012da784dd5d6d45a16dcfac7873a7cd7ea578a78f04a2b",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamLocalFieldB,
    kind: "resource",
    label:
      "Unified foam local field B (RGBA16F 128x128 anchor-local ping-pong scratch, R wake/G impact/B Hero/A union, 48m radius, 8m Hermite edge fade)",
    fingerprint:
      // Provenance: this historical fingerprint's reproducible source was not recorded; #29 changed only the label and retained the committed value.
      "sha256:82dac57c07467b78a7bc2bc880daef08ffbd422daf546aa958855f2a72814aab",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterCausticsLocalSurfaceField,
    kind: "resource",
    label:
      "Underwater caustics local surface field (RGBA16F 128x128 anchor-local current height/slope/velocity, 48m radius, 8m Hermite edge fade)",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:0d2b1c6a6f9e294675c9d50614dac4b0820997d0e03163c969038805d4a30862",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamSourceHistory,
    kind: "effect-state",
    label:
      "Bounded foam history (128-source including at most 8 Hero Breakers, two GPU banks, 128-tick preallocated CPU foam-state timeline with Artistic Controls and source poses/lifetimes for 60Hz simulation, 30Hz present, and bounded catch-up)",
    fingerprint:
      // Provenance: this historical fingerprint's reproducible source was not recorded; #29 changed only the label and retained the committed value.
      "sha256:b6921d58b2beb103bc12115f47b2430d7db11117842c74213ffef5812e75eaae",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamLocalAdvectionRoute,
    kind: "conditional-route",
    label:
      "Anchor-local unified foam RGB wake/impact/Hero advection compute route (A to B, host fixed tick, 128x128)",
    fingerprint:
      // Provenance: this historical fingerprint's reproducible source was not recorded; #29 changed only the label and retained the committed value.
      "sha256:ae50160423e8c912dfe71eba8b3a6cf91c0aad2323cab5796a61ca3902e1dcd5",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamLocalResolveRoute,
    kind: "conditional-route",
    label:
      "Source-prioritized whitecap, wake, impact, and Hero Breaker foam plus current local-surface resolve compute route (B to A as R wake/G impact/B Hero/A union plus caustics field, 128x128)",
    fingerprint:
      // Provenance: this historical fingerprint's reproducible source was not recorded; #33 changed only the label and retained the committed value.
      "sha256:61617d619104b9e50914d24d287b3fda56af58041a35fc013321c282bbc898c3",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamSourceIdentityTarget,
    kind: "resource",
    label:
      "Unified foam source-identity diagnostics (RGBA16F spectral/wake/impact/union with Hero Breaker included in union, canonical anchor-local 96m field, drawing-buffer-exact)",
    fingerprint:
      // Provenance: this historical fingerprint's reproducible source was not recorded; #29 changed only the label and retained the committed value.
      "sha256:7aed6a2a182c10f42c5853d5e86b07c27800aebcf7c82e15830fc48d7f0774f8",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamSourceIdentityRoute,
    kind: "conditional-route",
    label:
      "Drawing-buffer canonical anchor-local spectral, wake, impact, and Hero-inclusive union source-identity diagnostics route",
    fingerprint:
      // Provenance: this historical fingerprint's reproducible source was not recorded; #29 changed only the label and retained the committed value.
      "sha256:00a84dfdb990f853318915cc3b164e201bf8e548c32ea12d851e336d1f5054b2",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamSourceIdentityProbe,
    kind: "conditional-route",
    label:
      "GPU completion probe of canonical anchor-local unified foam source identity with Hero-inclusive union",
    fingerprint:
      // Provenance: this historical fingerprint's reproducible source was not recorded; #29 changed only the label and retained the committed value.
      "sha256:8bc0852433ba4552576bc066f3af3728b95fa9dd03048c34ef3243698b5925a8",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.material,
    kind: "effect-state",
    label:
      "Double-sided minimal water material with persistent unified whitecap, wake, impact, and Hero Breaker source-resolved foam response",
    // Provenance: this historical fingerprint's reproducible source was not
    // recorded; #29 changed only the label and retained the committed value.
    fingerprint:
      "sha256:0bac2d6549fce1b062e2b79e104109eddef671ab3478d6f75fc35600838fbd85",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalRoute,
    kind: "effect-state",
    label:
      "Waterline optical composition route (planar+environment fallback, air/water refraction, underside Fresnel and TIR, RGB Beer-Lambert, unified whitecap/wake/impact/Hero Breaker foam reflection/transmission/roughness/micro detail)",
    // Provenance: this historical fingerprint's reproducible source was not
    // recorded; #29 changed only the label and retained the committed value.
    fingerprint:
      "sha256:b526b877082981792ee86708b08d71525a43be1471b06a08ab82567c51a7f044",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.waterlineState,
    kind: "effect-state",
    label:
      "Seed-matched above/crossing/below camera-medium state with one Host sea level and hysteresis",
    fingerprint:
      "sha256:45b2f75e0297158c9462d4fee95cb01bab3f44319ad492dbe0619da59c96e603",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.undersideOpticalRoute,
    kind: "effect-state",
    label: "Double-sided water-to-air refraction and total internal reflection",
    fingerprint:
      "sha256:d4fc5c63528d53d720ed3e7a16c40b18aa7369ec71cc8d53b8384843d70b1fb1",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.waterlineHistoryResetRoute,
    kind: "conditional-route",
    label:
      "Shared TRAA and SSR reset plus prepared GPU rejection route on committed waterline classification",
    fingerprint:
      "sha256:1514885dfa55ba27b6952367bdb97ab2d0c1116fe96f78210c5c076d78dd1610",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.lensWetnessTransition,
    kind: "effect-state",
    label: "One-frame deterministic lens-wetness emergence handoff",
    fingerprint:
      "sha256:c27da44a2e284b79a97fdb413f0bd12558a05a669c1102e65dd2dd95aa859446",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.planarReflectionTarget,
    kind: "resource",
    label:
      "Planar reflection color+target-alpha occupancy (RGBA8 sRGB, samples 0, drawing-buffer-exact)",
    fingerprint:
      "sha256:380ced36a62272cecd356b28c02587cb24d24d7390b6d79ac5051cad272a52ba",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.planarReflectionRoute,
    kind: "conditional-route",
    label:
      "Horizontal XZ planar reflection route (dynamic Host sea level, waterline crossing fade and below clear, oblique clip, water hidden, no bounce)",
    fingerprint:
      "sha256:717e164787f7d1d29b1111b1a80e75c1968ae31b5e3e3011a7d79cfb99238265",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.planarEnvironmentFallback,
    kind: "effect-state",
    label:
      "Explicit environment fallback for planar miss (Host Adapter radiance)",
    fingerprint:
      "sha256:5c87e9ee57fb714b882e29e6dcf43b74d35953cffaecb0b4f0c15123d403b5e0",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.planarReflectionProbe,
    kind: "conditional-route",
    label: "GPU completion probe of the planar reflection target",
    fingerprint:
      "sha256:f203f71435dfe40d3d14d3b19b853fd13f8338aba138c1eee29400570074311e",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrRawTarget,
    kind: "resource",
    label:
      "Stock r185 current-frame SSR raw target (RGBA16F, samples 0, drawing-buffer-exact)",
    fingerprint:
      "sha256:5229f76bc28be7b7aa032fadcb3adabfada2202dde29a88f499d16fac9ba659f",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrBlurTarget,
    kind: "resource",
    label:
      "Stock r185 current-frame SSR roughness blur target (RGBA16F, 5 mip slots, drawing-buffer-exact, not history)",
    fingerprint:
      "sha256:7de03a661f8f354b4936ce102689f719ec015d4fa9e56a01c9ac09521d790cb1",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrCompositeTarget,
    kind: "resource",
    label:
      "Current-frame SSR composite (RGBA16F RGB pre-TRAA, A ssrConfidence, drawing-buffer-exact)",
    fingerprint:
      "sha256:e9e8d713d8c38ada27f083c3c3cca0698ea4df327b40e247450e0f3d0420b336",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrRoute,
    kind: "conditional-route",
    label:
      "Stock r185 non-stochastic current-frame SSR (host-present cadence, water-mask metalness, spatial blur, dedicated TemporalReproject history, no scene.environment)",
    fingerprint:
      "sha256:1a331354906edd1886eccf37a780586db70fa5d9326e29b65ef66f690f10dcee",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrBlurCopyRoute,
    kind: "conditional-route",
    label:
      "Stock r185 SSR blur base-mip copy (roughnessNode present, blurQuality 2)",
    fingerprint:
      "sha256:0be4df8ca02cbf5d130d34c54d9fa60713d07cd1370eccc81c5c9bfef7b2ffb9",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrBlurRoute,
    kind: "conditional-route",
    label:
      "Stock r185 current-frame spatial SSR blur (4 mip passes, blurQuality 2, not history)",
    fingerprint:
      "sha256:12c33037a77f9494ee861a6b56807f479afdc0e68ce7cc46477dca3509fe92c3",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrCompositeRoute,
    kind: "conditional-route",
    label:
      "Explicit current-frame SSR compose over planar+environment base (history candidate, black-hit current, minimum-error fresnel overlay)",
    fingerprint:
      "sha256:ff8885aece4baf4f604f40783c8b641c5338d5bea1d8f79ac3bb0e5d5dc5b893",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrProbe,
    kind: "conditional-route",
    label:
      "GPU completion probe of SSR raw, composite, and TemporalReproject resolved history; stock roughness blur mips complete transitively after hidden frames",
    fingerprint:
      "sha256:ee3f19cd28ba2891f410f0467b7ff688e477aa40926f72812e71a2932bc71104",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryTarget,
    kind: "resource",
    label:
      "Stock r185 TemporalReproject history (RGBA16F, accumulate, drawing-buffer-exact)",
    fingerprint:
      "sha256:01163977af38992ab615fb739c87de571568fe8e5d8b2abb4c0814f8e4f69159",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResolveTarget,
    kind: "resource",
    label:
      "Stock r185 TemporalReproject resolve (RGBA16F, drawing-buffer-exact, getTextureNode)",
    fingerprint:
      "sha256:668109307d81e0f44bb3b88df15cb4214ca818eead92cdcd79927a8543881b26",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryBeautyTarget,
    kind: "resource",
    label:
      "SSR TemporalReproject beauty input (RGBA16F, drawing-buffer-exact, blurred RGB + raw worldDistance A)",
    fingerprint:
      "sha256:80863d1535f37527febcfa90f24e8c8d1cf5c3f2cbde6daf11730f028691aa8f",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryBeautyRoute,
    kind: "conditional-route",
    label:
      "SSR TemporalReproject beauty blit (host-present, stock blur RGB + raw A)",
    fingerprint:
      "sha256:1fcc820049c348593edbe52c246d3201e5acd5f667fdf135fa1baf4529aaf5bb",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResolvedCaptureTarget,
    kind: "resource",
    label:
      "SSR TemporalReproject resolved diagnostics copy (RGBA16F, drawing-buffer-exact)",
    fingerprint:
      "sha256:fb768c5c2f3ed1b26274913eeaa7185d686db9f4a01f4b88abb13fa2b59d562f",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResolvedCopyRoute,
    kind: "conditional-route",
    label:
      "SSR TemporalReproject resolved copyTextureToTexture (host-present, required)",
    fingerprint:
      "sha256:cbd5fc2889a202ba3ebd2e514ea9e58379f5d3491339a6edae6fda3c2b5b4d0d",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryPreviousDepth,
    kind: "resource",
    label:
      "Stock r185 TemporalReproject previous depth (copied from main depth, drawing-buffer-exact)",
    fingerprint:
      "sha256:4a5523625b107bd68d4da4805bf1b76d73fdd9349ca1759449091a8ca1548aee",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryPreviousNormal,
    kind: "resource",
    label:
      "Stock r185 TemporalReproject previous packed normal (RGBA16F, drawing-buffer-exact)",
    fingerprint:
      "sha256:e06ddd63eec10a66ab84d8ad7a5d45712bfb4657f87dc4dfa59f8c84301ab065",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistorySeedRoute,
    kind: "conditional-route",
    label:
      "Stock r185 TemporalReproject seed (host-present, first prepared size only)",
    fingerprint:
      "sha256:a795d239b5301dd3ffa64fd58a1ba3698244349ec7a4449851ee2ad3d074bd52",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResolveRoute,
    kind: "conditional-route",
    label:
      "Stock r185 TemporalReproject specular resolve (host-present, no FRAME)",
    fingerprint:
      "sha256:4b2e56c27d2a86a5c7896f9c8be33eaa45b2890c6b70347007e32ad06195584b",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryAccumulateRoute,
    kind: "conditional-route",
    label:
      "Stock r185 TemporalReproject accumulate copy (resolve into history)",
    fingerprint:
      "sha256:f20d52a23de875e18cf3f589f5d68f83357423af3f0ba268f2c377539b51e075",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResetRoute,
    kind: "conditional-route",
    label:
      "Shared Host-domain SSR history reset including waterline crossing (velocity sentinel, hitPointReprojection disabled, resolve reseed)",
    fingerprint:
      "sha256:c06ff1649e380debb6466059d6f548f4b582c592faf8c3719cef4d4e45df95ff",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResetVelocityTarget,
    kind: "resource",
    label:
      "SSR TemporalReproject reset velocity (RG16F, vec4(4,4,0,0) sentinel, drawing-buffer-exact, prewarm once)",
    fingerprint:
      "sha256:ae0fedb85438f0e2219c04b0c688362e43f20519c0b35fa7a493228d44611a9f",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryResetVelocityRoute,
    kind: "conditional-route",
    label:
      "SSR TemporalReproject reset-velocity prepare (transform-free, host-present prewarm once, no ready redraw)",
    fingerprint:
      "sha256:0eb74170734227ae0812e75df3cfcbd8a4bdceb09b3f62f97cabf97faa38403b",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.ssrHistoryProbe,
    kind: "conditional-route",
    label:
      "GPU completion probe of TemporalReproject beauty input and resolved diagnostics copy",
    fingerprint:
      "sha256:42eac93d1c673fe058eb09c61f470083df6b7afa3683328e788656732491a2e6",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterVolumeTarget,
    kind: "resource",
    label:
      "Underwater volume plus prepared-surface caustics color (RGBA16F, samples 0, drawing-buffer-exact, post-SSR pre-TRAA)",
    fingerprint:
      // Provenance: this historical fingerprint's reproducible source was not recorded; #33 changed only the label and retained the committed value.
      "sha256:6a75542631256bd1f689adb7a8e6b8c81cbc6a9d11f41d22b874b596dfa49474",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterVolumeRoute,
    kind: "conditional-route",
    label:
      "Per-ray underwater absorption, haze, scattering, color, exposure, and prepared-surface caustics composition from scene depth, local interface, and Host Environment",
    fingerprint:
      // Provenance: this historical fingerprint's reproducible source was not recorded; #33 changed only the label and retained the committed value.
      "sha256:07b5b5d14dac572c25546f04cf86ce2cf41c8e895bfc95d7f90806f42ee52821",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterDepthCompositionRoute,
    kind: "effect-state",
    label:
      "Bounded 96m scene-depth and local horizontal-interface ray termination for geometry, water surface, and far-plane volume composition",
    fingerprint:
      "sha256:bf8d34efc551a99f04c2c54c3332689078a2a0acbd38ec1c80fa0a538ca4dac0",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterSunShaftShadowRoute,
    kind: "conditional-route",
    label:
      "Deterministic epipolar sun shafts with screen-space scene-depth occlusion from Host sun",
    fingerprint:
      "sha256:a0e96cb179c2597702862df89cf330d8330224b1c7e8bb6b8050d09b0002afd2",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterDiagnosticsTarget,
    kind: "resource",
    label:
      "Underwater volume diagnostics (RGBA16F transmittance/scattering/shaft/shadow, drawing-buffer-exact)",
    fingerprint:
      "sha256:585994ca2c4858380903d9e94f20b0a880378b411ad7a2b2ad60cb931abda5f4",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterDiagnosticsRoute,
    kind: "conditional-route",
    label:
      "On-request packed underwater transmittance, scattering, sun-shaft, and shadow diagnostics",
    fingerprint:
      "sha256:803a8e7688fa35fea43ca767b364b836d2c29a028c6d0509fa3c8169e4b79e90",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterProbe,
    kind: "conditional-route",
    label:
      "GPU completion probe of underwater volume color and diagnostics targets",
    fingerprint:
      "sha256:e634ca001324670cad2f7ef46a7b011bb753692940733a1e108ebbf8d53f422d",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterCausticsReceiverRoute,
    kind: "conditional-route",
    label:
      "Prepared-surface dynamic caustics on non-sky, non-water, upward-facing visible receivers within 48m",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:403f4e25ac454354683e7c9b0032726ebd5a11cc4a58bba02be688ca110a0a17",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterCausticsDiagnosticsTarget,
    kind: "resource",
    label:
      "Underwater caustics diagnostics (R in RGBA16F, drawing-buffer-exact)",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:ef4aee18704adb533480019f188212abf0788bd272ade556ebdb103ca8447e4c",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterCausticsDiagnosticsRoute,
    kind: "conditional-route",
    label: "On-request independent underwater caustics scalar output",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:8f4006e4caaabeed9397ecbbcd79fdffd5e5fb079116f636c25c2f4e04282a5d",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterCausticsProbe,
    kind: "conditional-route",
    label: "GPU completion probe of underwater caustics diagnostics target",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:de4dc7c236b8ff82ca5c881a0b86befebd03cc34203751ba1ef4e4e5564140bd",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterParticleCandidateState,
    kind: "resource",
    label:
      "Underwater secondary-particle candidate and retained payload storage (three predeclared consumers; fixed maximum arrays)",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:d3277abe8ee69d2cec1aae2961665b96dda5354238b5fe98704ba909fce0fa78",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterParticleAllocationRoutes,
    kind: "conditional-route",
    label:
      "Underwater secondary-particle participants in the shared submit-all/resolve-once/apply-all transaction",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:85da9f932339dea1e75c79cfbd21f4ced7a7aa761edce093b854ea9b3f6ae0c2",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterSuspendedParticleTarget,
    kind: "resource",
    label:
      "Suspended-particle accumulation (RGBA16F depth-aware, drawing-buffer-exact, pre-TRAA)",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:35cf15ad7dc9e097f87b3125d2f0883b19e772c7ca01998c971a4bcf8339823d",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterSuspendedParticleRoute,
    kind: "conditional-route",
    label: "Depth-aware suspended-particle accumulation route before TRAA",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:af3dd6c207d3bf02eddda925ed6cbbbae06b5eba1fe843592f14b0fc52e8bdaf",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterBubbleTarget,
    kind: "resource",
    label:
      "Subsurface foam-cloud and rising-bubble accumulation (RGBA16F depth-aware, drawing-buffer-exact, pre-TRAA)",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:3c4c4444be41867e6d958c9a10b67b5c6cac9634fc0c11e716f82b6b36a539bd",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterBubbleRoute,
    kind: "conditional-route",
    label:
      "Depth-aware subsurface foam-cloud and rising-bubble accumulation route before TRAA",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:7843678ab677997778028d776c4e000ed46def2105d610f69df80fb1a75bf15c",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterTracerCompositeTarget,
    kind: "resource",
    label:
      "Underwater tracer composite (RGBA16F particles plus bubbles, drawing-buffer-exact, pre-TRAA)",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:a681c952e2b38dca2722fb7d97f886aaf85cadb7f671b6a030877e3b90fa8a22",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterTracerCompositeRoute,
    kind: "conditional-route",
    label:
      "Underwater volume plus particle and bubble composite route before TRAA",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:269fcb2c1927da6f2b8c681f0092b54b720b52c8f18d0b63a991353f7b1c6135",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterTracerProbe,
    kind: "conditional-route",
    label:
      "Completion probe of underwater particle, bubble, and tracer-composite targets",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:87963d7431f5ca046b790d0f78eabc004d13c1cb50e82de7388026e1ba04d892",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.renderRoute,
    kind: "conditional-route",
    label:
      "Fixed-tick whitecaps plus Hero Breaker deformation/foam, additive Storm rain ripples, coherent cloud/lightning optics, and shared particle allocation; waterline-gated planar aux; one jittered main MRT; current-frame SSR; underwater volume/caustics/tracers; stock TRAA; then ordered secondary-particle, Storm-atmosphere, and lens-wetness composition",
    fingerprint:
      // Provenance: this BASE fingerprint's source was not recorded and cannot be recovered; #28, #33, and #30 changed only the label and retained it.
      "sha256:f7f44a7ddf3041a2cda3654fb87e9181f0ca87730eb64017725c664995bafb91",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.proceduralMotion,
    kind: "effect-state",
    label:
      "Previous presented wave-field positionPrevious (current clipmap XZ and Host sea level)",
    fingerprint:
      "sha256:4971b46f9510ba5d5e0c43ae7e0a40a2eb552b82d3fb8ad5471f4b596ac9cc96",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.motionVectors,
    kind: "resource",
    label: "Procedural water velocity (RG16F NDC, scale 1, samples 0)",
    fingerprint:
      "sha256:22d81a8fcf82eb4c38c70f64cbdd809d308218ae003cff43d3d0e4495c532026",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.inverseLinearDepth,
    kind: "resource",
    label:
      "QA inverse-linear view depth conversion (R32F, independent of main MRT, drawing-buffer-exact)",
    fingerprint:
      "sha256:fbf21f1edb1ad428145d3bcbe2a95a8d46ed4ecc1b171ece1c527e02297f8e44",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.viewNormal,
    kind: "resource",
    label:
      "Packed view-normal RGB (packNormalToRGB) + water roughness A (RGBA16F, drawing-buffer-exact)",
    fingerprint:
      "sha256:9202e800870f86fd41deba3fbec57a3a94469cce59e3c93eea5513c006345bb5",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalFactorsTarget,
    kind: "resource",
    label:
      "Optical factors plus waterline coverage A (RGBA16F, drawing-buffer-exact)",
    fingerprint:
      "sha256:a5e8e85cd5f940d0994f62131051afb9922d6aad02ae9c93327a4eb1f98d527c",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.historyRejectionTarget,
    kind: "resource",
    label:
      "Shared history-rejection diagnostics target (RGBA8, drawing-buffer-exact)",
    fingerprint:
      "sha256:2d61d9c6e0c778789600c7b8bd0b6c11171cdceb8d627d779c47924e2296f42c",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.historyRejectionRoute,
    kind: "conditional-route",
    label:
      "Diagnostics-only full-screen GPU route writing the shared TRAA and SSR reset uniform",
    fingerprint:
      "sha256:26a2465bc403ca51bdc7a57eb42cd57c2c8c3439ac49641e56f551d8db0f9276",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalDiagnosticsA,
    kind: "resource",
    label: "Optical diagnostics A (RG8, drawing-buffer-exact)",
    fingerprint:
      "sha256:17bc4d8de01c8456f0cabc9ef93cd4b42994b069a7392abca453116b57189758",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalDiagnosticsB,
    kind: "resource",
    label: "Optical diagnostics B (RG8, drawing-buffer-exact)",
    fingerprint:
      "sha256:36a1f57ebc891ac92a1d92f6257ea21e2b501a02b8d3df22dcc00a4c7d1133fa",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.finalColorTarget,
    kind: "resource",
    label: "Core final-color target (RGBA8, drawing-buffer-exact)",
    fingerprint:
      "sha256:95e187bfaa85ab73fddaa0060eb8d184622ffb5e1184b6ed83fb1840ac5c298d",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.currentColorTarget,
    kind: "resource",
    label: "Core current-color target (RGBA8, drawing-buffer-exact)",
    fingerprint:
      "sha256:e696b8999adaa67392cac034126b180ca2a99c4365fbf56099c912940313d771",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stockTraaHistory,
    kind: "effect-state",
    label: "Stock TRAA color+depth history with waterline reset domain",
    fingerprint:
      "sha256:48a08329f1097cf2c968d3623b945b709e44165c4cfeca9f4bb32b3462e3070e",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.traaResolveJitter,
    kind: "conditional-route",
    label: "Stock TRAA resolve/jitter route",
    fingerprint:
      "sha256:ba8bdc48d2842afd8f4f620e5296fce9bde9055047e4de7d593eec83dce25733",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.traaResetRoute,
    kind: "conditional-route",
    label:
      "No-allocation TRAA and dedicated SSR history reset (shared Host domain including waterline crossing)",
    fingerprint:
      "sha256:3f32ddae6ca9dde0bcfedf7e8c12e2d7f8c1c71d5fb53de9e2fb4e958e660239",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticlePool,
    kind: "resource",
    label:
      "Shared secondary-particle pool (131,072 retained slots; 147,456 declared candidates across four consumers; render-stage-agnostic)",
    fingerprint:
      // Provenance: #28 introduced this value, minted once from the exact UTF-8 label bytes (no trailing newline; quotes excluded): "Shared secondary-particle pool (131,072 retained slots; 147,456 declared candidates across four consumers; render-stage-agnostic)"
      "sha256:3bd2141be77da74f9a089795b154fa8cac0cd479f536cb5bdc0961141b13d2c5",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleAllocationRoute,
    kind: "conditional-route",
    label:
      "Q16 global contribution allocation (four consumers; 5,376 borrowable survival-floor slots; stable-key ties; +4096 incumbent bonus; 4-tick residence/cooldown; lifecycle no-reentry)",
    fingerprint:
      // Provenance: #28 introduced this value, minted once from the exact UTF-8 label bytes (no trailing newline; quotes excluded): "Q16 global contribution allocation (four consumers; 5,376 borrowable survival-floor slots; stable-key ties; +4096 incumbent bonus; 4-tick residence/cooldown; lifecycle no-reentry)"
      "sha256:5eb0ddd03a38ddad2925ef38280e21fe9f240f07a0875a9f2067c0b2bea80a71",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.postTraaCompositionPlan,
    kind: "effect-state",
    label:
      "Ordered post-TRAA composition plan (drawing-buffer-exact: TRAA -> secondary-particles -> storm-atmosphere -> lens-wetness -> presentation)",
    fingerprint:
      // Provenance: #30 reminted the reproducible seed from this declaration's exact expanded label bytes.
      "sha256:b113e0281a295f43847976962feb311a99c3d90b8d55d3cfdb56ec8ec6a4b93b",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.traaResolvedTarget,
    kind: "resource",
    label: "Stock TRAA resolved color (RGBA8, drawing-buffer-exact)",
    fingerprint:
      // Provenance: #28 introduced this value, minted from the exact UTF-8 label bytes (no trailing newline; quotes excluded): "Stock TRAA resolved color (RGBA8, drawing-buffer-exact)"
      "sha256:97f0c10a22209f0f6644438d126fa062aa296245e7d18429cc4a42e58730fb09",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleAccumulationTarget,
    kind: "resource",
    label:
      "Secondary-particle additive accumulation and diagnostics (RGBA16F RGB contribution plus A overdraw, drawing-buffer-exact)",
    fingerprint:
      // Provenance: #28 introduced this value, minted from the exact UTF-8 label bytes (no trailing newline; quotes excluded): "Secondary-particle additive accumulation and diagnostics (RGBA16F RGB contribution plus A overdraw, drawing-buffer-exact)"
      "sha256:e21721a0f3dd09ddcdcd1546022ede326713f190253d2f24ae2ef3f8c34aa053",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleCompositeTarget,
    kind: "resource",
    label:
      "Secondary-particle composite output (RGBA8, drawing-buffer-exact, post-TRAA intermediate)",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:b602533b267c26de51eb517a720cb89049b551a298e0604e4fafb9f54e68a9da",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleStageRoute,
    kind: "conditional-route",
    label:
      "Secondary-particle spray, droplet, and mist accumulation stage after TRAA",
    fingerprint:
      // Provenance: #28 introduced this value, minted from the exact UTF-8 label bytes (no trailing newline; quotes excluded): "Secondary-particle spray, droplet, and mist accumulation stage after TRAA"
      "sha256:2e01c9f15616e821e3be2f3347c8bff7cff47435ed46086d38492279bb2b5b81",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleCompositeRoute,
    kind: "conditional-route",
    label: "Post-TRAA secondary-particle composite for the next declared stage",
    fingerprint:
      // Provenance: #33 reminted #28's reproducible value from the exact UTF-8 label bytes above (no trailing newline; quotes excluded) when the composite became an intermediate stage output.
      "sha256:d45e9fbb4292f4384108f621e634e7b5faabe775ef87c07c9111316d29e56893",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleDiagnosticsRoute,
    kind: "conditional-route",
    label: "Secondary-particle contribution and overdraw diagnostics route",
    fingerprint:
      // Provenance: #28 introduced this value, minted from the exact UTF-8 label bytes (no trailing newline; quotes excluded): "Secondary-particle contribution and overdraw diagnostics route"
      "sha256:3b379f85cfe563c2a0dccf32deb4f5eebe4c42b1f034851efda2bd678f874bfa",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.secondaryParticleProbe,
    kind: "conditional-route",
    label:
      "Completion probe of shared secondary-particle allocation canary, accumulation, and intermediate composite before Storm Front atmosphere",
    fingerprint:
      // Provenance: #30 reminted the reproducible seed from this declaration's exact expanded label bytes.
      "sha256:50f14f59e4cec7a4e072abade4c23a427aabfb19d62d1d3c4c76f35ce14e31ce",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.lensWetnessDiagnosticsTarget,
    kind: "resource",
    label: "Lens-wetness diagnostics (R in RGBA16F, drawing-buffer-exact)",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:a0bec0c560242b5154b76a55261076c46b6e61e1c0c882c74ec498b84636c4fa",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.lensWetnessStageRoute,
    kind: "conditional-route",
    label:
      "Bounded emergence-driven lens-wetness stage after Storm Front atmosphere",
    fingerprint:
      // Provenance: #30 reminted the reproducible seed from this declaration's exact expanded label bytes.
      "sha256:65bc3d679949d16b47a709b24b86a3d6f3efd56a40fbb75778a32a348c0da6b8",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.lensWetnessDiagnosticsRoute,
    kind: "conditional-route",
    label: "On-request independent lens-wetness scalar output",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:a615dbe3b7e5408e41b5e89378665d89c9ffc4731ee27732773dd5bf5af2df15",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.lensWetnessProbe,
    kind: "conditional-route",
    label: "Completion probe of lens-wetness output and diagnostics targets",
    fingerprint:
      // Provenance: #33 introduced this value, minted from the exact UTF-8 label bytes above (no trailing newline; quotes excluded).
      "sha256:1b06d93ac9ee8a5a5f20e4d355a255407df55de0579ec13c0ec6ebf14f6430e7",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.currentColorConversion,
    kind: "conditional-route",
    label:
      "Current-color conversion sampling pre-TRAA underwater-volume, caustics, particles, and bubbles with restored scene alpha",
    fingerprint:
      // Provenance: this historical fingerprint's reproducible source was not recorded; #33 changed only the label and retained the committed value.
      "sha256:750febf150f950dd006fc0a7df54e7e5faa9aace9e026c452f1b9aa0f639a0c8",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.namedOutputRoutes,
    kind: "conditional-route",
    label:
      "Forty-five named diagnostics output routes including Storm Front rain/aerosol/cloud-shadow/lightning, unified foam identity, Hero Breaker foam, underwater caustics/particles/bubbles, lens wetness, and secondary-particle contribution/overdraw",
    fingerprint:
      // Provenance: #30 reminted the reproducible seed from this declaration's exact expanded label bytes.
      "sha256:1da79fc6a622b709430452bfd4ebf991f816b523a0c3d9555db9f85fbc223818",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.hiddenStabilization,
    kind: "effect-state",
    label:
      "Eight hidden underwater-volume/caustics/tracers, TRAA, SSR-history, and ordered particle/Storm-atmosphere/lens-wetness stabilization frames",
    fingerprint:
      // Provenance: this BASE fingerprint's source was not recorded and cannot be recovered; #28, #33, and #30 changed only the label and retained it.
      "sha256:caf44b79f85f7ef51388340b5a0b802e9f6d1974d25d28e3e3644c9856fcc441",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.completionProbe,
    kind: "conditional-route",
    label:
      "GPU completion probe of all forty-five named output routes including Storm Front rain/aerosol/cloud-shadow/lightning, Hero Breaker foam, underwater volume/tracers, lens wetness, unified foam identity, and secondary-particle contribution/overdraw",
    fingerprint:
      // Provenance: #30 reminted the reproducible seed from this declaration's exact expanded label bytes.
      "sha256:40aa86e9f5a2e952fc96b6ce4a6a56a87caee84bbf2d838c149794e862f35a47",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.mainCameraGuard,
    kind: "conditional-route",
    label:
      "Main-camera guard frame including underwater volume/caustics/tracers and ordered post-TRAA secondary-particle/Storm-atmosphere/lens-wetness composition",
    fingerprint:
      // Provenance: this BASE fingerprint's source was not recorded and cannot be recovered; #28, #33, and #30 changed only the label and retained it.
      "sha256:e59db4a839b5f36edfaec493a1f334f44ba6bae5a5046a758c0ceb69ea143841",
  },
];

const MINIMAL_HIGH_DETAIL_WATER_DECLARATIONS: readonly PrewarmDeclaration[] =
  MINIMAL_WATER_DECLARATIONS.map((declaration) =>
    highDetailDeclaration(declaration),
  );

function highDetailDeclaration(
  declaration: PrewarmDeclaration,
): PrewarmDeclaration {
  const fingerprints: Readonly<Record<string, string>> = Object.freeze({
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.clipmap]:
      "sha256:ac0f415a7ca925b92112e332ed39c7cebef51fcec3ffc07216a0484181be6930",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapFieldA]:
      "sha256:d555b34c2fe10fa320bba4678909ab1b3760a9604634992177d5ea9309097c5f",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapFieldB]:
      "sha256:d7f60462ee1929d08737b9f48297968adc6cdfbfa9fe6ddda2fcbdbbb7c96140",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapResetRoute]:
      "sha256:78d5524d9bbbef7fa330407172d0fef44ac0d3170e474dac0819b8440bebdd02",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapGenerationRoute]:
      "sha256:4fdea4350600184360645ac55cd43bd41c8776a532cb9367d6a33f5c2456aa54",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapHistory]:
      "sha256:5d4498f62aff4e63f5b745c10ccb73ce4e62f8029a8a65ade31f4c89f005f022",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapAdvectionRoute]:
      "sha256:6cda56103043786608daeb0d6638c7e5787ff1725191a49f035c23d000f83639",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapDiffusionRoute]:
      "sha256:0d7dd8b91573cb52914ce0c22e32f6ac1189ec47c3eadd8a90d444392b256812",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.whitecapDecayRoute]:
      "sha256:10faf88f44796a9e5ce1533a2cdf5c2fc986b2bb01bf2c5f14c650d88115a8ee",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamLocalFieldA]:
      "sha256:ee4d471913df6f0f09bff048557fd863e1f5ce7a681c76c86951df5bf295a148",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamLocalFieldB]:
      "sha256:a0ef7d6c0c3601881f8dfc57a080cd5cc454dada02f3ed5500a998e640a9e031",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.underwaterCausticsLocalSurfaceField]:
      // Provenance: #33 introduced this high-detail value, minted from the exact UTF-8 label bytes after replacing 128x128 with 256x256 (no trailing newline; quotes excluded).
      "sha256:6b972c2678244b436a0590a16141db4449b2fd44315e2de7921d1be1db392ce7",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamLocalAdvectionRoute]:
      "sha256:bf745e588618cc8e7effc2e2367058fe7216c7768e18be7da63dbface4906b8b",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.foamLocalResolveRoute]:
      // Provenance: this historical high-detail fingerprint's reproducible source was not recorded; #33 changed only the effective 256x256 label and retained the committed value.
      "sha256:c914cf36381b90065a8e759b57c6621b16b9316c22f9df01b3c530625aab69f8",
    [MINIMAL_WATER_PREWARM_DECLARATION_IDS.heroBreakerFoamRoute]:
      // Provenance: #29 minted this high-detail reproducible seed from the declaration's effective 256x256 label bytes.
      "sha256:e45ff48a5dca6426a15b0f8ea70cbcb5690560d2d9ce938f5f8c958970bde56b",
  });
  const fingerprint = fingerprints[declaration.id];
  if (fingerprint === undefined) {
    return declaration;
  }
  const label = declaration.label.replaceAll("128x128", "256x256");
  return { ...declaration, label, fingerprint };
}

/**
 * Returns the complete manifest for the first prewarmed water plane. This
 * release binds the canonical 8x4 RGBA8 sRGB equirect Host environment
 * reflection into both the public descriptor field and the environment-radiance
 * declaration. Production Hosts must pass `drawingBuffer`. When omitted, the
 * factory uses a 320×180 Memory-test default. The factory is synchronous and
 * hashes with the package-internal SHA-256 implementation.
 *
 * @public
 */
export function createMinimalWaterPrewarmManifest(
  profile: QualityProfile = createMinimalWaterQualityProfile(),
  drawingBuffer: PrewarmDrawingBuffer = DEFAULT_MEMORY_PREWARM_DRAWING_BUFFER,
): PrewarmManifest {
  const normalizedProfile = normalizeQualityProfile(profile);
  const normalizedDrawingBuffer = normalizeDrawingBuffer(drawingBuffer);
  const declarations = createMinimalWaterDeclarations(
    normalizedProfile.id,
    normalizedDrawingBuffer,
  );
  return freezeHashedManifest({
    schema: PREWARM_MANIFEST_SCHEMA,
    version: PREWARM_MANIFEST_VERSION,
    id: MINIMAL_WATER_MANIFEST_ID,
    qualityProfile: normalizedProfile,
    drawingBuffer: normalizedDrawingBuffer,
    environmentReflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
    effectVariants: SUPPORTED_EFFECT_VARIANTS,
    declarations,
  });
}

export function normalizePrewarmManifest(
  candidate: PrewarmManifest,
): PrewarmManifest {
  const value: unknown = candidate;
  if (!isRecord(value)) {
    throw manifestError("The Prewarm Manifest must be an object.");
  }

  if (value.schema !== PREWARM_MANIFEST_SCHEMA) {
    throw manifestError("The Prewarm Manifest schema is not supported.", {
      receivedSchema: String(value.schema),
    });
  }

  if (value.version !== PREWARM_MANIFEST_VERSION) {
    throw new RealWaterStartupError({
      code: "MANIFEST_VERSION_UNSUPPORTED",
      phase: "manifest-validation",
      retryable: false,
      message: "The Prewarm Manifest version is not supported.",
      diagnostics: {
        receivedVersion:
          typeof value.version === "number"
            ? value.version
            : String(value.version),
        supportedVersion: PREWARM_MANIFEST_VERSION,
      },
    });
  }

  if (!hasExactKeys(value, PREWARM_MANIFEST_KEYS)) {
    throw manifestError(
      "The Prewarm Manifest must use the supported structure.",
      typeof value.id === "string" ? { manifestId: value.id } : {},
    );
  }

  if (!isNonEmptyText(value.id)) {
    throw manifestError("The Prewarm Manifest id must not be empty.");
  }

  if (
    typeof value.manifestHash !== "string" ||
    !SHA_256_PATTERN.test(value.manifestHash)
  ) {
    throw manifestError(
      "The Prewarm Manifest hash must be a lowercase SHA-256 identifier.",
      { manifestId: value.id },
    );
  }

  const qualityProfile = normalizeManifestQualityProfile(
    value.qualityProfile,
    value.id,
  );
  const drawingBuffer = normalizeDrawingBuffer(value.drawingBuffer, value.id);
  const environmentReflection = normalizeManifestEnvironmentReflection(
    value.environmentReflection,
    value.id,
  );
  const effectVariants = normalizeEffectVariants(
    value.effectVariants,
    value.id,
  );

  if (!Array.isArray(value.declarations) || value.declarations.length === 0) {
    throw manifestError(
      "The Prewarm Manifest must declare at least one item.",
      { manifestId: value.id },
    );
  }

  const declarationIds = new Set<string>();
  const declarations: PrewarmDeclaration[] = [];
  for (let index = 0; index < value.declarations.length; index += 1) {
    if (!Object.hasOwn(value.declarations, index)) {
      throw manifestError("Prewarm declarations must not contain gaps.", {
        declarationIndex: index,
        manifestId: value.id,
      });
    }

    const declaration: unknown = value.declarations[index];
    if (!isRecord(declaration)) {
      throw manifestError("Every prewarm declaration must be an object.", {
        declarationIndex: index,
        manifestId: value.id,
      });
    }

    if (!hasExactKeys(declaration, ["id", "kind", "label", "fingerprint"])) {
      throw manifestError(
        "Every prewarm declaration must use the supported structure.",
        {
          declarationIndex: index,
          manifestId: value.id,
        },
      );
    }

    if (!isNonEmptyText(declaration.id)) {
      throw manifestError("Every prewarm declaration needs a non-empty id.", {
        declarationIndex: index,
        manifestId: value.id,
      });
    }

    if (declarationIds.has(declaration.id)) {
      throw manifestError("Prewarm declaration ids must be unique.", {
        declarationId: declaration.id,
        manifestId: value.id,
      });
    }
    declarationIds.add(declaration.id);

    if (
      typeof declaration.kind !== "string" ||
      !DECLARATION_KINDS.includes(declaration.kind as PrewarmDeclarationKind)
    ) {
      throw manifestError("The prewarm declaration kind is not supported.", {
        declarationId: declaration.id,
        manifestId: value.id,
      });
    }

    if (!isNonEmptyText(declaration.label)) {
      throw manifestError("Every prewarm declaration needs a readable label.", {
        declarationId: declaration.id,
        manifestId: value.id,
      });
    }

    if (
      typeof declaration.fingerprint !== "string" ||
      !SHA_256_PATTERN.test(declaration.fingerprint)
    ) {
      throw manifestError(
        "Every prewarm declaration needs a lowercase SHA-256 fingerprint.",
        {
          declarationId: declaration.id,
          manifestId: value.id,
        },
      );
    }

    declarations.push({
      id: declaration.id,
      kind: declaration.kind as PrewarmDeclarationKind,
      label: declaration.label,
      fingerprint: declaration.fingerprint,
    });
  }

  const manifest = freezeManifest({
    schema: PREWARM_MANIFEST_SCHEMA,
    version: PREWARM_MANIFEST_VERSION,
    id: value.id,
    manifestHash: value.manifestHash,
    qualityProfile,
    drawingBuffer,
    environmentReflection,
    effectVariants,
    declarations,
  });

  assertMinimalWaterPrewarmManifest(manifest);

  return manifest;
}

export function manifestIdentity(
  manifest: PrewarmManifest,
): PrewarmManifestIdentity {
  return Object.freeze({
    schema: manifest.schema,
    version: manifest.version,
    id: manifest.id,
    manifestHash: manifest.manifestHash,
    qualityProfile: qualityProfileIdentity(manifest.qualityProfile),
    drawingBuffer: freezeDrawingBuffer(manifest.drawingBuffer),
    environmentReflection: freezeEnvironmentReflection(
      manifest.environmentReflection,
    ),
    effectVariants: freezeEffectVariants(manifest.effectVariants),
  });
}

function freezeManifest(manifest: PrewarmManifest): PrewarmManifest {
  return Object.freeze({
    schema: manifest.schema,
    version: manifest.version,
    id: manifest.id,
    manifestHash: manifest.manifestHash,
    qualityProfile: normalizeQualityProfile(manifest.qualityProfile),
    drawingBuffer: freezeDrawingBuffer(manifest.drawingBuffer),
    environmentReflection: freezeEnvironmentReflection(
      manifest.environmentReflection,
    ),
    effectVariants: freezeEffectVariants(manifest.effectVariants),
    declarations: Object.freeze(
      manifest.declarations.map((declaration) =>
        Object.freeze({ ...declaration }),
      ),
    ),
  });
}

export function assertMinimalWaterPrewarmManifest(
  manifest: PrewarmManifest,
): void {
  if (manifest.id !== MINIMAL_WATER_MANIFEST_ID) {
    throw manifestError(
      "This release supports only the minimal-water Prewarm Manifest.",
      {
        expectedManifestId: MINIMAL_WATER_MANIFEST_ID,
        receivedManifestId: manifest.id,
      },
    );
  }

  const qualityProfile = normalizeManifestQualityProfile(
    manifest.qualityProfile,
    manifest.id,
  );
  const drawingBuffer = freezeDrawingBuffer(manifest.drawingBuffer);
  const plan = supportedManifestPlan(qualityProfile.id, drawingBuffer);

  if (manifest.manifestHash !== plan.manifestHash) {
    throw manifestError(
      "The minimal-water Prewarm Manifest hash does not match its supported work plan.",
      {
        expectedManifestHash: plan.manifestHash,
        manifestId: manifest.id,
        receivedManifestHash: manifest.manifestHash,
      },
    );
  }

  assertEffectVariants(manifest.effectVariants, manifest.id);
  assertCanonicalEnvironmentReflection(
    manifest.environmentReflection,
    manifest.id,
  );

  for (const required of plan.declarations) {
    const candidate = manifest.declarations.find(
      (declaration) => declaration.id === required.id,
    );
    if (candidate === undefined) {
      throw manifestError(
        "The minimal-water Prewarm Manifest is missing required work.",
        {
          manifestId: manifest.id,
          missingDeclarationId: required.id,
        },
      );
    }

    if (
      candidate.kind !== required.kind ||
      candidate.label !== required.label ||
      candidate.fingerprint !== required.fingerprint
    ) {
      throw manifestError(
        "A minimal-water prewarm declaration does not match the supported work plan.",
        {
          declarationId: required.id,
          manifestId: manifest.id,
        },
      );
    }
  }

  if (manifest.declarations.length !== plan.declarations.length) {
    const unexpected = manifest.declarations.find(
      (candidate) =>
        !plan.declarations.some((required) => required.id === candidate.id),
    );
    throw manifestError(
      "The minimal-water Prewarm Manifest contains unsupported work.",
      {
        manifestId: manifest.id,
        unexpectedDeclarationId: unexpected?.id ?? "unknown",
      },
    );
  }

  for (let index = 0; index < plan.declarations.length; index += 1) {
    const required = plan.declarations[index];
    const candidate = manifest.declarations[index];
    if (required?.id !== candidate?.id) {
      throw manifestError(
        "The minimal-water Prewarm Manifest work order does not match the supported plan.",
        {
          declarationIndex: index,
          expectedDeclarationId: required?.id ?? "missing",
          manifestId: manifest.id,
          receivedDeclarationId: candidate?.id ?? "missing",
        },
      );
    }
  }
}

function supportedManifestPlan(
  profileId: MinimalWaterQualityProfileId,
  drawingBuffer: PrewarmDrawingBuffer,
): {
  readonly manifestHash: string;
  readonly declarations: readonly PrewarmDeclaration[];
} {
  const declarations = createMinimalWaterDeclarations(profileId, drawingBuffer);
  return {
    declarations,
    manifestHash: hashMinimalWaterManifest({
      schema: PREWARM_MANIFEST_SCHEMA,
      version: PREWARM_MANIFEST_VERSION,
      id: MINIMAL_WATER_MANIFEST_ID,
      qualityProfile: createMinimalWaterQualityProfile(profileId),
      drawingBuffer,
      environmentReflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      effectVariants: SUPPORTED_EFFECT_VARIANTS,
      declarations,
    }),
  };
}

function createMinimalWaterDeclarations(
  profileId: MinimalWaterQualityProfileId,
  drawingBuffer: PrewarmDrawingBuffer,
): readonly PrewarmDeclaration[] {
  const declarations =
    profileId === "minimal-high-detail"
      ? MINIMAL_HIGH_DETAIL_WATER_DECLARATIONS
      : MINIMAL_WATER_DECLARATIONS;
  return declarations.map((declaration) =>
    DRAWING_BUFFER_BOUND_DECLARATION_IDS.has(declaration.id)
      ? {
          ...declaration,
          fingerprint: sha256Identifier(
            JSON.stringify({
              id: declaration.id,
              kind: declaration.kind,
              label: declaration.label,
              baseFingerprint: declaration.fingerprint,
              width: drawingBuffer.width,
              height: drawingBuffer.height,
            }),
          ),
        }
      : declaration,
  );
}

function freezeHashedManifest(
  manifest: Omit<PrewarmManifest, "manifestHash">,
): PrewarmManifest {
  return freezeManifest({
    ...manifest,
    manifestHash: hashMinimalWaterManifest(manifest),
  });
}

function hashMinimalWaterManifest(
  manifest: Omit<PrewarmManifest, "manifestHash">,
): string {
  return sha256Identifier(
    JSON.stringify({
      schema: manifest.schema,
      version: manifest.version,
      id: manifest.id,
      qualityProfile: manifest.qualityProfile,
      drawingBuffer: manifest.drawingBuffer,
      environmentReflection: manifest.environmentReflection,
      effectVariants: manifest.effectVariants,
      declarations: manifest.declarations,
    }),
  );
}

function normalizeDrawingBuffer(
  value: unknown,
  manifestId?: string,
): PrewarmDrawingBuffer {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["width", "height"]) ||
    !isPositiveSafeInteger(value.width) ||
    !isPositiveSafeInteger(value.height)
  ) {
    throw manifestError(
      "The Prewarm Manifest drawing buffer must be positive safe integers.",
      manifestId === undefined ? {} : { manifestId },
    );
  }
  return freezeDrawingBuffer({
    width: value.width,
    height: value.height,
  });
}

function freezeDrawingBuffer(
  drawingBuffer: PrewarmDrawingBuffer,
): PrewarmDrawingBuffer {
  return Object.freeze({
    width: drawingBuffer.width,
    height: drawingBuffer.height,
  });
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function normalizeManifestEnvironmentReflection(
  value: unknown,
  manifestId: string,
): HostEnvironmentReflectionDescriptor {
  if (value === undefined) {
    throw manifestError(
      "The Prewarm Manifest must declare its environment reflection.",
      { manifestId },
    );
  }
  return assertCanonicalEnvironmentReflection(value, manifestId);
}

function assertCanonicalEnvironmentReflection(
  value: unknown,
  manifestId: string,
): HostEnvironmentReflectionDescriptor {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [...ENVIRONMENT_REFLECTION_KEYS])
  ) {
    throw manifestError(
      "The Prewarm Manifest environment reflection must use the supported structure.",
      { manifestId },
    );
  }
  const supported = SUPPORTED_HOST_ENVIRONMENT_REFLECTION;
  for (const field of ENVIRONMENT_REFLECTION_KEYS) {
    if (value[field] !== supported[field]) {
      throw manifestError(
        "The Prewarm Manifest environment reflection does not match this release.",
        {
          field,
          manifestId,
        },
      );
    }
  }
  return freezeEnvironmentReflection(supported);
}

function freezeEnvironmentReflection(
  descriptor: HostEnvironmentReflectionDescriptor,
): HostEnvironmentReflectionDescriptor {
  return Object.freeze({
    identity: descriptor.identity,
    fingerprint: descriptor.fingerprint,
    width: descriptor.width,
    height: descriptor.height,
    format: descriptor.format,
    type: descriptor.type,
    colorSpace: descriptor.colorSpace,
  });
}

function normalizeManifestQualityProfile(
  value: unknown,
  manifestId: string,
): QualityProfile {
  try {
    return normalizeQualityProfile(value as QualityProfile);
  } catch {
    throw manifestError(
      "The Prewarm Manifest Quality Profile is not supported.",
      { manifestId },
    );
  }
}

function normalizeEffectVariants(
  value: unknown,
  manifestId: string,
): readonly PrewarmEffectVariant[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw manifestError(
      "The Prewarm Manifest must declare its effect variants.",
      { manifestId },
    );
  }

  const variants: PrewarmEffectVariant[] = [];
  const variantKeys = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw manifestError("Prewarm effect variants must not contain gaps.", {
        manifestId,
        variantIndex: index,
      });
    }

    const variant: unknown = value[index];
    if (
      !isRecord(variant) ||
      !hasExactKeys(variant, ["effectId", "variantId"]) ||
      !isNonEmptyText(variant.effectId) ||
      !isNonEmptyText(variant.variantId)
    ) {
      throw manifestError(
        "Every prewarm effect variant needs exact effect and variant ids.",
        { manifestId, variantIndex: index },
      );
    }

    const key = effectVariantKey(variant.effectId, variant.variantId);
    if (variantKeys.has(key)) {
      throw manifestError("Prewarm effect variants must be unique.", {
        effectId: variant.effectId,
        manifestId,
        variantId: variant.variantId,
      });
    }
    variantKeys.add(key);
    variants.push({
      effectId: variant.effectId,
      variantId: variant.variantId,
    });
  }

  assertEffectVariants(variants, manifestId);
  return freezeEffectVariants(variants);
}

function assertEffectVariants(
  variants: readonly PrewarmEffectVariant[],
  manifestId: string,
): void {
  if (variants.length !== SUPPORTED_EFFECT_VARIANTS.length) {
    throw manifestError(
      "The Prewarm Manifest effect registry does not match this release.",
      { manifestId },
    );
  }

  for (let index = 0; index < SUPPORTED_EFFECT_VARIANTS.length; index += 1) {
    const supported = SUPPORTED_EFFECT_VARIANTS[index];
    const candidate = variants[index];
    if (
      supported === undefined ||
      candidate === undefined ||
      candidate.effectId !== supported.effectId ||
      candidate.variantId !== supported.variantId
    ) {
      throw manifestError(
        "The Prewarm Manifest effect registry does not match this release.",
        {
          effectId: candidate?.effectId ?? "missing",
          manifestId,
          variantId: candidate?.variantId ?? "missing",
        },
      );
    }
  }
}

function freezeEffectVariants(
  variants: readonly PrewarmEffectVariant[],
): readonly PrewarmEffectVariant[] {
  return Object.freeze(
    variants.map((variant) => Object.freeze({ ...variant })),
  );
}

function effectVariantKey(effectId: string, variantId: string): string {
  return `${effectId}\u0000${variantId}`;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function manifestError(
  message: string,
  diagnostics: Readonly<Record<string, string | number | boolean | null>> = {},
): RealWaterStartupError {
  return new RealWaterStartupError({
    code: "MANIFEST_INVALID",
    phase: "manifest-validation",
    retryable: false,
    message,
    diagnostics,
  });
}
