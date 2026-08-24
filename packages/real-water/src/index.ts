export {
  QUALITY_PROFILE_SCHEMA,
  QUALITY_PROFILE_VERSION,
  createMinimalWaterQualityProfile,
  migrateQualityProfile,
  normalizeQualityProfile,
  qualityProfileIdentity,
} from "./quality-profile.js";
export type {
  MinimalWaterGeometrySegments,
  MinimalWaterQualityProfileId,
  QualityProfile,
  QualityProfileBodyCoupling,
  QualityProfileIdentity,
  QualityProfileInteraction,
  QualityProfileInteractionField,
  QualityProfileReflection,
  QualityProfileReflectionSsr,
  QualityProfileReflectionSsrHistory,
  QualityProfileSpectralWhitecaps,
  QualityProfileStormFront,
  QualityProfileSecondaryParticleConsumer,
  QualityProfileSecondaryParticles,
  QualityProfilePostTraaStage,
  QualityProfilePostTraaComposition,
  QualityProfileSurface,
  QualityProfileTemporal,
  QualityProfileUnderwaterCaustics,
  QualityProfileUnderwaterTracers,
  QualityProfileUnderwaterVolume,
  QualityProfileLensWetness,
} from "./quality-profile.js";

export {
  PREWARM_MANIFEST_SCHEMA,
  PREWARM_MANIFEST_VERSION,
  createMinimalWaterPrewarmManifest,
} from "./manifest.js";
export type {
  PrewarmDeclaration,
  PrewarmDeclarationKind,
  PrewarmDrawingBuffer,
  PrewarmEffectVariant,
  PrewarmManifest,
  PrewarmManifestIdentity,
} from "./manifest.js";

export type {
  GameplayCapabilities,
  GameplayCapabilitiesBodyInteraction,
  GameplayCapabilitiesInteractionField,
  RealWaterCapabilities,
  RenderingCapabilities,
  RenderingCapabilitiesReflection,
  RenderingCapabilitiesReflectionSsr,
  RenderingCapabilitiesReflectionSsrBlur,
  RenderingCapabilitiesReflectionSsrHistory,
  RenderingCapabilitiesSecondaryParticles,
  RenderingCapabilitiesStormFront,
  RenderingCapabilitiesPostTraaComposition,
  RenderingCapabilitiesTemporal,
} from "./capabilities.js";
export {
  MAX_ATTACHED_BODIES,
  MAX_ACTIVE_DISTURBANCES,
  MAX_ACTIVE_HERO_BREAKERS,
  MAX_GAMEPLAY_QUERY_POINTS,
  MAX_SECONDARY_PARTICLES,
} from "./capabilities.js";

export { RealWaterRuntimeError, RealWaterStartupError } from "./errors.js";
export type {
  HostCompatibilityErrorCode,
  HostPreparationFailureCode,
  RealWaterRuntimeErrorInit,
  RealWaterStartupErrorInit,
  RuntimeDiagnostics,
  RuntimeErrorCode,
  StartupDiagnostics,
  StartupErrorCode,
  StartupPhase,
} from "./errors.js";

export { createStaticHostSimulationAdapter } from "./runtime.js";
export type {
  ArtisticControls,
  ArtisticControlTransition,
  ArtisticControlUpdateOptions,
  ArtisticControlUpdateReceipt,
  GameplayQueryBatch,
  GameplayQueryResults,
  HeroBreakerDisturbanceBatch,
  DisturbanceBatch,
  DisturbanceSubmissionReceipt,
  DirectionalWakeDisturbanceBatch,
  HostSimulationAdapter,
  HostSimulationState,
  InteractionAnchor,
  InteractionAnchorUpdateReceipt,
  OpenWaterRuntimeSnapshot,
  RadialImpactDisturbanceBatch,
  RealWaterRuntime,
} from "./runtime.js";

export {
  MAX_BODY_INTERACTION_SOCKETS,
  MAX_COMPOUND_INTERACTION_SHAPE_CHILDREN,
  MAX_CONVEX_HULL_VERTICES,
  createBodyPhysicsAdapter,
} from "./body-physics.js";
export type {
  BodyEffectSocket,
  BodyAttachment,
  BodyAttachmentOptions,
  BodyAttachmentSnapshot,
  BodyPhysicsAdapter,
  BodyPhysicsAdapterOptions,
  BodyPhysicsBinding,
  BodyPhysicsFixedStepRoute,
  BodyPhysicsPose,
  BodyPhysicsQuaternion,
  BodyPhysicsState,
  BodyPhysicsVector3,
  BodyInteractionAnchorSocket,
  BodyInteractionSocket,
  BodyInteractionSocketKind,
  BodyWaterLoad,
  BodyWakeUpdateReceipt,
  BodyWakeSourceIdentity,
  BoxInteractionShape,
  CapsuleInteractionShape,
  CompoundInteractionShape,
  CompoundInteractionShapeChild,
  ConvexHullInteractionShape,
  InteractionShape,
  PrimitiveInteractionShape,
  SphereInteractionShape,
} from "./body-physics.js";

export {
  BODY_PHYSICS_FIXED_TICK_HZ,
  createMemoryBodyPhysicsAdapter,
} from "./memory-body-physics.js";
export type {
  MemoryBodyPhysicsAdapter,
  MemoryBodyPhysicsAdapterOptions,
} from "./memory-body-physics.js";

export {
  assertHostPresentationAdapter,
  createStaticHostPresentationAdapter,
  readHostPresentationBinding,
  readHostPresentationRoute,
  readHostPresentationState,
  readHostPresentedFrame,
} from "./presentation.js";
export type {
  HostPresentationAdapter,
  HostPresentationBinding,
  HostPresentationRoute,
  HostPresentationState,
  HostPresentedFrame,
  HostPresentedTemporal,
  HostTemporalResetReason,
} from "./presentation.js";

export {
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
  SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS,
  createStaticHostEnvironmentAdapter,
  createSupportedHostEnvironmentRadianceBytes,
  createSupportedHostEnvironmentReflection,
} from "./environment.js";
export type {
  HostEnvironmentAdapter,
  HostEnvironmentAtmosphereState,
  HostEnvironmentColorSpace,
  HostEnvironmentReflectionDescriptor,
  HostEnvironmentReflectionResource,
  HostEnvironmentReflectionType,
  HostEnvironmentSnapshot,
  HostEnvironmentState,
  HostEnvironmentWeatherState,
  HostTexture,
} from "./environment.js";

export {
  WATER_PRESET_SCHEMA,
  WATER_PRESET_VERSION,
  createAuthoredWaterPreset,
  createWaterPreset,
  migrateWaterPreset,
  normalizeWaterPreset,
  waterPresetIdentity,
} from "./water-preset.js";
export type {
  WaterPreset,
  WaterPresetId,
  WaterPresetIdentity,
} from "./water-preset.js";

export {
  ENVIRONMENT_PRESET_SCHEMA,
  ENVIRONMENT_PRESET_VERSION,
  createAuthoredEnvironmentPreset,
  createReferenceEnvironmentPreset,
  createStormFrontEnvironmentPreset,
  environmentPresetIdentity,
  migrateEnvironmentPreset,
  normalizeEnvironmentPreset,
} from "./environment-preset.js";
export type {
  EnvironmentPreset,
  EnvironmentPresetAtmosphere,
  EnvironmentPresetIdentity,
  EnvironmentPresetSnapshot,
  EnvironmentPresetWeather,
} from "./environment-preset.js";

export {
  SHOWCASE_PRESET_SCHEMA,
  SHOWCASE_PRESET_VERSION,
  createAuthoredShowcasePreset,
  createReferenceShowcasePreset,
  migrateShowcasePreset,
  normalizeShowcasePreset,
  showcasePresetIdentity,
} from "./showcase-preset.js";
export type {
  ShowcaseCameraKeyframe,
  ShowcaseEventKeyframe,
  ShowcasePreset,
  ShowcasePresetAuthoring,
  ShowcasePresetIdentity,
  ShowcaseStormFrontSegment,
  ShowcaseVector3,
} from "./showcase-preset.js";

export {
  exportPresetJson,
  importPresetJson,
  normalizePreset,
} from "./preset-codec.js";
export type {
  CurrentPresetImport,
  MigratedPresetImport,
  PresetDocument,
  PresetImportResult,
  PresetRecoveryReason,
  RecoveryPresetImport,
} from "./preset-codec.js";

export { createMemoryHostLifecycleAdapter } from "./memory-host.js";
export type {
  MemoryHostLifecycleAdapterOptions,
  MemoryHostScenario,
} from "./memory-host.js";

export { prepareRealWater } from "./startup.js";
export type {
  EffectVariantSelection,
  EffectVariantSelectionReceipt,
  ErrorStartupSnapshot,
  HostLifecycleAdapter,
  HostPreparationRequest,
  HostPreparationResult,
  HostPreparedLease,
  HostProgressReporter,
  LongSuspensionInvalidation,
  LoadingPresenterAdapter,
  LoadingStartupSnapshot,
  PreparationRun,
  PrepareRealWaterOptions,
  PreparingStartupSnapshot,
  ReadyStartupSnapshot,
  RealWaterInvalidation,
  RealWaterLease,
  StartupProgress,
  StartupSnapshot,
  WebGPUDeviceLoss,
} from "./startup.js";

export { createThreeHostLifecycleAdapter } from "./three-host.js";
export type {
  ThreeHostCamera,
  ThreeHostLifecycleAdapterOptions,
  ThreeHostRenderer,
  ThreeHostScene,
} from "./three-host.js";
