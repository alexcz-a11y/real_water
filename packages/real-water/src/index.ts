export {
  QUALITY_PROFILE_SCHEMA,
  QUALITY_PROFILE_VERSION,
  createMinimalWaterQualityProfile,
} from "./quality-profile.js";
export type {
  MinimalWaterGeometrySegments,
  MinimalWaterQualityProfileId,
  QualityProfile,
  QualityProfileIdentity,
  QualityProfileSurface,
} from "./quality-profile.js";

export {
  PREWARM_MANIFEST_SCHEMA,
  PREWARM_MANIFEST_VERSION,
  createMinimalWaterPrewarmManifest,
} from "./manifest.js";
export type {
  PrewarmDeclaration,
  PrewarmDeclarationKind,
  PrewarmEffectVariant,
  PrewarmManifest,
  PrewarmManifestIdentity,
} from "./manifest.js";

export type {
  GameplayCapabilities,
  RealWaterCapabilities,
  RenderingCapabilities,
} from "./capabilities.js";
export { MAX_GAMEPLAY_QUERY_POINTS } from "./capabilities.js";

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
  ArtisticControlUpdateReceipt,
  GameplayQueryBatch,
  GameplayQueryResults,
  HostSimulationAdapter,
  HostSimulationState,
  OpenWaterRuntimeSnapshot,
  RealWaterRuntime,
} from "./runtime.js";

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
