import {
  readHostPresentationRoute,
  type HostPresentationAdapter,
  type HostPresentationBinding,
  type HostPresentationRoute,
  type HostPresentationState,
} from "real-water";

export const REFERENCE_PRESENTATION_INTERVAL_MS = 1000 / 30;

export interface ReferenceHostPresentationController extends HostPresentationAdapter {
  start(): void;
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
}

export function createReferenceHostPresentationController(
  options: ReferenceHostPresentationControllerOptions = {},
): ReferenceHostPresentationController {
  const scheduleFrame = options.scheduleFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  const cameraCutRevision = 0;
  let nextGeneration = 0;
  let current: PresentationBindingRecord | undefined;

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
    try {
      options.beforePresent?.(time, capturedGeneration);
    } catch (cause) {
      record.rejected = true;
      options.onError?.(cause);
      return;
    }
    void capturedRoute.present().then(
      () => {
        if (
          record.disposed ||
          record.rejected ||
          record.generation !== capturedGeneration ||
          current !== record
        ) {
          return;
        }
        record.scheduled = scheduleFrame((nextTime) =>
          onFrame(nextTime, record),
        );
      },
      (cause) => {
        if (
          record.generation !== capturedGeneration ||
          record.rejected ||
          record.disposed
        ) {
          return;
        }
        record.rejected = true;
        options.onError?.(cause);
      },
    );
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
  });
}
