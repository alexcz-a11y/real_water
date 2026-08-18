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

export { RealWaterStartupError } from "./errors.js";
export type {
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
