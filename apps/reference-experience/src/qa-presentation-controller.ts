import {
  readHostPresentationRoute,
  type HostPresentationAdapter,
  type HostPresentationBinding,
  type HostPresentationRoute,
  type HostPresentationState,
  type HostPresentedFrame,
} from "real-water";
import {
  readHostDiagnosticsRoute,
  type HostDiagnosticsPresentRequest,
  type HostDiagnosticsPresentedFrame,
  type HostDiagnosticsRoute,
} from "real-water/diagnostics";

export interface QaHostPresentationController extends HostPresentationAdapter {
  incrementCameraCut(): number;
  presentBoundFrame(): Promise<HostPresentedFrame>;
  presentBoundDiagnostics(
    request: HostDiagnosticsPresentRequest,
  ): Promise<HostDiagnosticsPresentedFrame>;
  diagnosticsRoute(): HostDiagnosticsRoute;
}

interface QaBindingRecord {
  readonly generation: number;
  readonly route: HostPresentationRoute;
  readonly diagnostics: HostDiagnosticsRoute | undefined;
  disposed: boolean;
}

export function createQaHostPresentationController(): QaHostPresentationController {
  let cameraCutRevision = 0;
  let nextGeneration = 0;
  let current: QaBindingRecord | undefined;

  const requireRecord = (): QaBindingRecord => {
    const record = current;
    if (record === undefined || record.disposed) {
      throw new Error(
        "The QA Host Presentation Controller has no bound Core route.",
      );
    }
    return record;
  };

  return Object.freeze({
    snapshot(): HostPresentationState {
      return Object.freeze({ cameraCutRevision });
    },
    bind(next: HostPresentationRoute): HostPresentationBinding {
      const accepted = readHostPresentationRoute(next);
      if (current !== undefined && !current.disposed) {
        throw new Error(
          "The QA Host Presentation Controller is already bound.",
        );
      }
      let diagnostics: HostDiagnosticsRoute | undefined;
      try {
        diagnostics = readHostDiagnosticsRoute(accepted);
      } catch {
        diagnostics = undefined;
      }
      const record: QaBindingRecord = {
        generation: (nextGeneration += 1),
        route: accepted,
        diagnostics,
        disposed: false,
      };
      current = record;
      return Object.freeze({
        dispose() {
          if (record.disposed) {
            return;
          }
          record.disposed = true;
          if (current === record) {
            current = undefined;
          }
        },
      });
    },
    incrementCameraCut(): number {
      cameraCutRevision += 1;
      return cameraCutRevision;
    },
    presentBoundFrame(): Promise<HostPresentedFrame> {
      try {
        return requireRecord().route.present();
      } catch (cause) {
        return Promise.reject(cause);
      }
    },
    presentBoundDiagnostics(
      request: HostDiagnosticsPresentRequest,
    ): Promise<HostDiagnosticsPresentedFrame> {
      try {
        const diagnostics = requireRecord().diagnostics;
        if (diagnostics === undefined) {
          return Promise.reject(
            new Error(
              "The QA Host Presentation Controller has no bound Core diagnostics route.",
            ),
          );
        }
        return diagnostics.present(request);
      } catch (cause) {
        return Promise.reject(cause);
      }
    },
    diagnosticsRoute(): HostDiagnosticsRoute {
      const diagnostics = requireRecord().diagnostics;
      if (diagnostics === undefined) {
        throw new Error(
          "The QA Host Presentation Controller has no bound Core diagnostics route.",
        );
      }
      return diagnostics;
    },
  });
}
