import {
  evaluateRenderingCapability,
  type RenderingCapabilityObservation,
} from "./internal/rendering-capability.js";
import { prepareMinimalWaterPlane } from "./internal/minimal-water-prewarm.js";
import { inspectThreeR185RenderingCapability } from "./internal/three-r185-rendering-capability.js";
import type {
  HostLifecycleAdapter,
  HostPreparedLease,
  HostPreparationRequest,
  WebGPUDeviceLoss,
} from "./startup.js";

const activeRenderers = new WeakSet<object>();

/**
 * The stable part of a host-owned Three WebGPURenderer used by Real Water.
 * Three revision-sensitive fields remain private Implementation.
 *
 * @public
 */
export interface ThreeHostRenderer {
  init(): Promise<unknown>;
}

/**
 * Stable marker from a borrowed native Three Scene.
 *
 * @public
 */
export interface ThreeHostScene {
  /** Native Three Scene type marker. */
  readonly isScene: boolean;
}

/**
 * Stable marker from a borrowed native Three Camera.
 *
 * @public
 */
export interface ThreeHostCamera {
  /** Native Three Camera type marker. */
  readonly isCamera: boolean;
}

/**
 * Configuration for {@link createThreeHostLifecycleAdapter}.
 *
 * @public
 */
export interface ThreeHostLifecycleAdapterOptions {
  /** A borrowed Three r185 WebGPURenderer that remains Host-owned. */
  readonly renderer: ThreeHostRenderer;
  /** The borrowed Host scene that will contain the Real Water-owned plane. */
  readonly scene: ThreeHostScene;
  /** The borrowed main camera used for prewarm and the guard frame. */
  readonly camera: ThreeHostCamera;
}

/**
 * Creates a Host Lifecycle Adapter backed by a borrowed Three r185 renderer.
 *
 * @public
 */
export function createThreeHostLifecycleAdapter(
  options: ThreeHostLifecycleAdapterOptions,
): HostLifecycleAdapter {
  return Object.freeze({
    async prepare(request: HostPreparationRequest) {
      throwIfAborted(request.signal);
      assertNativeHostObjects(options);
      reserveRenderer(options.renderer);
      let leaseOwnsReservation = false;
      let capabilityInspection:
        | Awaited<ReturnType<typeof inspectThreeR185RenderingCapability>>
        | undefined;
      try {
        let observation: RenderingCapabilityObservation;
        try {
          capabilityInspection = await inspectThreeR185RenderingCapability(
            options.renderer,
          );
          observation = capabilityInspection.observation;
        } catch (cause) {
          if (request.signal.aborted) {
            throw cause;
          }
          return {
            status: "failed" as const,
            code: "RENDERER_INITIALIZATION_FAILED" as const,
            reason: "Three r185 renderer initialization failed.",
            retryable: true,
            diagnostics: Object.freeze({
              initializationMessage:
                cause instanceof Error
                  ? cause.message
                  : "Unknown renderer initialization failure.",
            }),
          };
        }
        throwIfAborted(request.signal);
        const capability = evaluateRenderingCapability(observation);
        if (capability.status !== "supported") {
          return capability;
        }

        const prewarmController = new AbortController();
        const abortPrewarm = (): void => {
          prewarmController.abort(request.signal.reason);
        };
        if (request.signal.aborted) {
          abortPrewarm();
        } else {
          request.signal.addEventListener("abort", abortPrewarm, {
            once: true,
          });
        }
        const preparation = prepareMinimalWaterPlane({
          renderer: options.renderer,
          scene: options.scene,
          camera: options.camera,
          request: {
            ...request,
            signal: prewarmController.signal,
          },
          invalidated: capabilityInspection.invalidated,
        });
        let prewarm: PrewarmOutcome;
        try {
          prewarm = await racePrewarmAgainstDeviceLoss(
            preparation,
            capabilityInspection.invalidated,
          );
        } finally {
          request.signal.removeEventListener("abort", abortPrewarm);
        }
        if (prewarm.status === "device-lost") {
          prewarmController.abort(prewarm.loss);
          return {
            status: "failed" as const,
            code: "WEBGPU_DEVICE_LOST" as const,
            reason: "The WebGPU device was lost during water preparation.",
            retryable: true,
            diagnostics: prewarm.loss.diagnostics,
          };
        }

        const lease = prewarm.lease;
        const exclusiveLease = createExclusiveLease(
          options.renderer,
          lease,
          capabilityInspection.release,
        );
        leaseOwnsReservation = true;

        return {
          status: "ready" as const,
          capabilities: capability.capabilities,
          lease: exclusiveLease,
        };
      } finally {
        if (!leaseOwnsReservation) {
          capabilityInspection?.release();
          activeRenderers.delete(options.renderer);
        }
      }
    },
  });
}

type PrewarmOutcome =
  | Readonly<{ status: "ready"; lease: HostPreparedLease }>
  | Readonly<{ status: "device-lost"; loss: WebGPUDeviceLoss }>;

function racePrewarmAgainstDeviceLoss(
  preparation: Promise<HostPreparedLease>,
  invalidated: Promise<WebGPUDeviceLoss>,
): Promise<PrewarmOutcome> {
  return Promise.race([
    preparation.then((lease) => ({ status: "ready" as const, lease })),
    invalidated.then((loss) => ({ status: "device-lost" as const, loss })),
  ]);
}

function reserveRenderer(renderer: ThreeHostRenderer): void {
  if (activeRenderers.has(renderer)) {
    throw new Error(
      "The Host renderer already owns an active Open Water Domain.",
    );
  }
  activeRenderers.add(renderer);
}

function createExclusiveLease(
  renderer: ThreeHostRenderer,
  lease: HostPreparedLease,
  releaseCapabilityInspection: () => void,
): HostPreparedLease {
  let disposal: Promise<void> | undefined;
  return Object.freeze({
    invalidated: lease.invalidated,
    dispose(): Promise<void> {
      disposal ??= Promise.resolve()
        .then(() => lease.dispose())
        .finally(() => {
          releaseCapabilityInspection();
          activeRenderers.delete(renderer);
        });
      return disposal;
    },
  });
}

function assertNativeHostObjects(
  options: ThreeHostLifecycleAdapterOptions,
): void {
  if (options.scene.isScene !== true || options.camera.isCamera !== true) {
    throw new TypeError(
      "The Three Host Adapter requires a native Three Scene and Camera.",
    );
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Three Host preparation was cancelled.");
  }
}
