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
  QualityProfileIdentity,
  QualityProfileInteraction,
  QualityProfileInteractionField,
  QualityProfileReflection,
  QualityProfileReflectionSsr,
  QualityProfileReflectionSsrHistory,
  QualityProfileSpectralWhitecaps,
  QualityProfileSurface,
  QualityProfileTemporal,
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
  GameplayCapabilitiesInteractionField,
  RealWaterCapabilities,
  RenderingCapabilities,
  RenderingCapabilitiesReflection,
  RenderingCapabilitiesReflectionSsr,
  RenderingCapabilitiesReflectionSsrBlur,
  RenderingCapabilitiesReflectionSsrHistory,
  RenderingCapabilitiesTemporal,
} from "./capabilities.js";
export {
  MAX_ATTACHED_BODIES,
  MAX_ACTIVE_DISTURBANCES,
  MAX_GAMEPLAY_QUERY_POINTS,
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
  DisturbanceBatch,
  DisturbanceSubmissionReceipt,
  HostSimulationAdapter,
  HostSimulationState,
  InteractionAnchor,
  InteractionAnchorUpdateReceipt,
  OpenWaterRuntimeSnapshot,
  RadialImpactDisturbanceBatch,
  RealWaterRuntime,
} from "./runtime.js";

export { createBodyPhysicsAdapter } from "./body-physics.js";
export type {
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
  BodyWaterLoad,
  InteractionShape,
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
  HostEnvironmentColorSpace,
  HostEnvironmentReflectionDescriptor,
  HostEnvironmentReflectionResource,
  HostEnvironmentReflectionType,
  HostEnvironmentState,
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
