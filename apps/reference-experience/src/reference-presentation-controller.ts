import {
  readHostPresentationRoute,
  type HostPresentationAdapter,
  type HostPresentationBinding,
  type HostPresentationRoute,
  type HostPresentationState,
  type HostPresentedFrame,
} from "real-water";
import {
  readHostDiagnosticsPresentedFrame,
  readHostDiagnosticsPresentRequest,
  readHostDiagnosticsRoute,
  type HostDiagnosticsPresentedFrame,
  type HostDiagnosticsPresentRequest,
  type HostDiagnosticsRoute,
} from "real-water/diagnostics";
import type {
  ReferenceEngineeringDiagnosticsSampling,
  ReferenceEngineeringDiagnosticsSnapshot,
  ReferenceEngineeringDiagnosticsSubscriber,
} from "./reference-engineering-diagnostics.js";
export type {
  ReferenceEngineeringDiagnosticsSampling,
  ReferenceEngineeringDiagnosticsSnapshot,
  ReferenceEngineeringDiagnosticsSubscriber,
} from "./reference-engineering-diagnostics.js";

export const REFERENCE_PRESENTATION_INTERVAL_MS = 1000 / 30;
export const REFERENCE_ENGINEERING_DIAGNOSTICS_INTERVAL_MS = 1000;

export interface ReferenceHostPresentationController extends HostPresentationAdapter {
  start(): void;
  incrementCameraCut(): number;
  setDiagnosticsSampling(
    sampling: ReferenceEngineeringDiagnosticsSampling,
  ): void;
  subscribeDiagnostics(
    subscriber: ReferenceEngineeringDiagnosticsSubscriber,
  ): () => void;
}

export interface ReferenceHostPresentationControllerOptions {
  readonly scheduleFrame?: (callback: (time: number) => void) => number;
  readonly cancelFrame?: (handle: number) => void;
  readonly onError?: (cause: unknown) => void;
  readonly beforePresent?: (timestamp: number, generation: number) => void;
}

interface PresentationBindingRecord {
  readonly generation: number;
  readonly route: HostPresentationRoute;
  started: boolean;
  disposed: boolean;
  rejected: boolean;
  scheduled: number;
  nextPresentTime: number | undefined;
  nextDiagnosticsTime: number | undefined;
  diagnostics: HostDiagnosticsRoute | undefined;
}

interface ActiveDiagnosticsSampling {
  readonly revision: number;
  readonly request: HostDiagnosticsPresentRequest;
}

interface DiagnosticsInvocation {
  readonly revision: number;
  readonly request: HostDiagnosticsPresentRequest;
}

function haveSameOutputs(
  left: HostDiagnosticsPresentRequest,
  right: HostDiagnosticsPresentRequest,
): boolean {
  return (
    left.outputs.length === right.outputs.length &&
    left.outputs.every((name, index) => name === right.outputs[index])
  );
}

function summarizeDiagnosticsFrame(
  frame: HostDiagnosticsPresentedFrame,
  request: HostDiagnosticsPresentRequest,
): ReferenceEngineeringDiagnosticsSnapshot {
  const returnedOutputNames = Object.freeze(
    frame.outputs.map((output) => output.name),
  );
  return Object.freeze({
    presentationId: frame.presentationId,
    width: frame.width,
    height: frame.height,
    compileCount: frame.compileCount,
    probeCount: frame.probeCount,
    diagnosticReadbackCount: frame.diagnosticReadbackCount,
    sceneRenderCount: frame.sceneRenderCount,
    waterline: frame.waterline,
    secondaryParticles: frame.secondaryParticles,
    requestedOutputNames: request.outputs,
    requestedOutputCount: request.outputs.length,
    returnedOutputNames,
    returnedOutputCount: returnedOutputNames.length,
  });
}

export function createReferenceHostPresentationController(
  options: ReferenceHostPresentationControllerOptions = {},
): ReferenceHostPresentationController {
  const scheduleFrame = options.scheduleFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  let cameraCutRevision = 0;
  let nextGeneration = 0;
  let current: PresentationBindingRecord | undefined;
  let nextDiagnosticsRevision = 0;
  let diagnosticsSampling: ActiveDiagnosticsSampling | undefined;
  const diagnosticsSubscribers =
    new Set<ReferenceEngineeringDiagnosticsSubscriber>();

  const isCurrent = (
    record: PresentationBindingRecord,
    generation: number,
  ): boolean =>
    !record.disposed &&
    !record.rejected &&
    record.generation === generation &&
    current === record;

  const rejectRecord = (
    cause: unknown,
    record: PresentationBindingRecord,
    generation: number,
  ): void => {
    if (!isCurrent(record, generation)) {
      return;
    }
    record.rejected = true;
    options.onError?.(cause);
  };

  const onFrame = (time: number, record: PresentationBindingRecord): void => {
    record.scheduled = 0;
    if (record.disposed || record.rejected || current !== record) {
      return;
    }
    if (record.nextPresentTime !== undefined && time < record.nextPresentTime) {
      record.scheduled = scheduleFrame((nextTime) => onFrame(nextTime, record));
      return;
    }
    record.nextPresentTime = time + REFERENCE_PRESENTATION_INTERVAL_MS;
    const capturedGeneration = record.generation;
    const capturedRoute = record.route;
    const activeSampling = diagnosticsSampling;
    const sampleDiagnostics =
      activeSampling !== undefined &&
      (record.nextDiagnosticsTime === undefined ||
        time >= record.nextDiagnosticsTime);
    let diagnosticsInvocation: DiagnosticsInvocation | undefined;
    let present: () => Promise<HostPresentedFrame>;
    try {
      if (sampleDiagnostics) {
        const diagnostics =
          record.diagnostics ?? readHostDiagnosticsRoute(capturedRoute);
        record.diagnostics = diagnostics;
        record.nextDiagnosticsTime =
          time + REFERENCE_ENGINEERING_DIAGNOSTICS_INTERVAL_MS;
        diagnosticsInvocation = activeSampling;
        present = () => diagnostics.present(activeSampling.request);
      } else {
        present = () => capturedRoute.present();
      }
      options.beforePresent?.(time, capturedGeneration);
      const presented = present();
      void presented.then(
        (frame) => {
          if (!isCurrent(record, capturedGeneration)) {
            return;
          }
          try {
            if (
              diagnosticsInvocation !== undefined &&
              diagnosticsSampling?.revision === diagnosticsInvocation.revision
            ) {
              const accepted = readHostDiagnosticsPresentedFrame(
                frame as HostDiagnosticsPresentedFrame,
              );
              const snapshot = summarizeDiagnosticsFrame(
                accepted,
                diagnosticsInvocation.request,
              );
              if (
                !isCurrent(record, capturedGeneration) ||
                diagnosticsSampling?.revision !== diagnosticsInvocation.revision
              ) {
                return;
              }
              for (const subscriber of diagnosticsSubscribers) {
                subscriber(snapshot);
              }
            }
          } catch (cause) {
            rejectRecord(cause, record, capturedGeneration);
            return;
          }
          if (!isCurrent(record, capturedGeneration)) {
            return;
          }
          record.scheduled = scheduleFrame((nextTime) =>
            onFrame(nextTime, record),
          );
        },
        (cause) => {
          rejectRecord(cause, record, capturedGeneration);
        },
      );
    } catch (cause) {
      rejectRecord(cause, record, capturedGeneration);
      return;
    }
  };

  return Object.freeze({
    snapshot(): HostPresentationState {
      return Object.freeze({ cameraCutRevision });
    },
    bind(next: HostPresentationRoute): HostPresentationBinding {
      const accepted = readHostPresentationRoute(next);
      if (current !== undefined && !current.disposed) {
        throw new Error(
          "The Reference Host Presentation Controller is already bound.",
        );
      }
      const record: PresentationBindingRecord = {
        generation: (nextGeneration += 1),
        route: accepted,
        started: false,
        disposed: false,
        rejected: false,
        scheduled: 0,
        nextPresentTime: undefined,
        nextDiagnosticsTime: undefined,
        diagnostics: undefined,
      };
      current = record;
      return Object.freeze({
        dispose() {
          if (record.disposed) {
            return;
          }
          record.disposed = true;
          if (record.scheduled !== 0) {
            cancelFrame(record.scheduled);
            record.scheduled = 0;
          }
          if (current === record) {
            current = undefined;
          }
        },
      });
    },
    start() {
      const record = current;
      if (record === undefined || record.disposed) {
        throw new Error(
          "The Reference Host Presentation Controller has no bound Core route.",
        );
      }
      if (record.started) {
        return;
      }
      record.started = true;
      record.scheduled = scheduleFrame((time) => onFrame(time, record));
    },
    incrementCameraCut(): number {
      cameraCutRevision += 1;
      return cameraCutRevision;
    },
    setDiagnosticsSampling(
      sampling: ReferenceEngineeringDiagnosticsSampling,
    ): void {
      if (
        typeof sampling !== "object" ||
        sampling === null ||
        typeof sampling.enabled !== "boolean"
      ) {
        throw new TypeError(
          "Reference Engineering diagnostics sampling requires an enabled boolean.",
        );
      }
      const request = readHostDiagnosticsPresentRequest({
        outputs: sampling.outputs ?? [],
      });
      if (!sampling.enabled && diagnosticsSampling === undefined) {
        return;
      }
      if (
        sampling.enabled &&
        diagnosticsSampling !== undefined &&
        haveSameOutputs(diagnosticsSampling.request, request)
      ) {
        return;
      }
      nextDiagnosticsRevision += 1;
      diagnosticsSampling = sampling.enabled
        ? Object.freeze({
            revision: nextDiagnosticsRevision,
            request,
          })
        : undefined;
    },
    subscribeDiagnostics(
      subscriber: ReferenceEngineeringDiagnosticsSubscriber,
    ): () => void {
      if (typeof subscriber !== "function") {
        throw new TypeError(
          "Reference Engineering diagnostics subscriber must be a function.",
        );
      }
      diagnosticsSubscribers.add(subscriber);
      let subscribed = true;
      return () => {
        if (!subscribed) {
          return;
        }
        subscribed = false;
        diagnosticsSubscribers.delete(subscriber);
      };
    },
  });
}
