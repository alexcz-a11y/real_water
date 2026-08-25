import type {
  DiagnosticsCaptureName,
  HostDiagnosticsPresentedFrame,
} from "real-water/diagnostics";

export interface ReferenceEngineeringDiagnosticsSampling {
  readonly enabled: boolean;
  readonly outputs?: readonly DiagnosticsCaptureName[];
}

export interface ReferenceEngineeringDiagnosticsSnapshot {
  readonly presentationId: number;
  readonly width: number;
  readonly height: number;
  readonly compileCount: number;
  readonly probeCount: number;
  readonly diagnosticReadbackCount: number;
  readonly sceneRenderCount: number;
  readonly waterline: HostDiagnosticsPresentedFrame["waterline"];
  readonly secondaryParticles: HostDiagnosticsPresentedFrame["secondaryParticles"];
  readonly requestedOutputNames: readonly DiagnosticsCaptureName[];
  readonly requestedOutputCount: number;
  readonly returnedOutputNames: readonly DiagnosticsCaptureName[];
  readonly returnedOutputCount: number;
}

export type ReferenceEngineeringDiagnosticsSubscriber = (
  snapshot: ReferenceEngineeringDiagnosticsSnapshot,
) => void;
