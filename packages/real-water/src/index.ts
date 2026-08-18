export {
  PREWARM_MANIFEST_SCHEMA,
  PREWARM_MANIFEST_VERSION,
  createMockPrewarmManifest,
} from "./manifest.js";
export type {
  PrewarmDeclaration,
  PrewarmDeclarationKind,
  PrewarmManifest,
  PrewarmManifestIdentity,
} from "./manifest.js";

export type {
  RealWaterCapabilities,
  RenderingCapabilities,
} from "./capabilities.js";

export { RealWaterStartupError } from "./errors.js";
export type {
  HostCompatibilityErrorCode,
  HostPreparationFailureCode,
  RealWaterStartupErrorInit,
  StartupDiagnostics,
  StartupErrorCode,
  StartupPhase,
} from "./errors.js";

export { createMemoryHostLifecycleAdapter } from "./memory-host.js";
export type {
  MemoryHostLifecycleAdapterOptions,
  MemoryHostScenario,
} from "./memory-host.js";

export { prepareRealWater } from "./startup.js";
export type {
  ErrorStartupSnapshot,
  HostLifecycleAdapter,
  HostPreparationRequest,
  HostPreparationResult,
  HostPreparedLease,
  HostProgressReporter,
  LoadingPresenterAdapter,
  LoadingStartupSnapshot,
  PreparationRun,
  PrepareRealWaterOptions,
  PreparingStartupSnapshot,
  ReadyStartupSnapshot,
  RealWaterLease,
  StartupProgress,
  StartupSnapshot,
} from "./startup.js";

export { createThreeHostLifecycleAdapter } from "./three-host.js";
export type {
  ThreeHostLifecycleAdapterOptions,
  ThreeHostRenderer,
} from "./three-host.js";
