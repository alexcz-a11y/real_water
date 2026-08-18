import {
  evaluateRenderingCapability,
  type RenderingCapabilityObservation,
} from "./internal/rendering-capability.js";
import { inspectThreeR185RenderingCapability } from "./internal/three-r185-rendering-capability.js";
import type {
  HostLifecycleAdapter,
  HostPreparedLease,
  HostPreparationRequest,
} from "./startup.js";

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
 * Configuration for {@link createThreeHostLifecycleAdapter}.
 *
 * @public
 */
export interface ThreeHostLifecycleAdapterOptions {
  /** A borrowed Three r185 WebGPURenderer that remains Host-owned. */
  readonly renderer: ThreeHostRenderer;
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
      let observation: RenderingCapabilityObservation;
      try {
        observation = await inspectThreeR185RenderingCapability(
          options.renderer,
        );
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

      for (const declaration of request.manifest.declarations) {
        throwIfAborted(request.signal);
        await request.progress.complete(declaration.id);
      }

      return {
        status: "ready" as const,
        capabilities: capability.capabilities,
        lease: createPreparedLease(),
      };
    },
  });
}

function createPreparedLease(): HostPreparedLease {
  let disposal: Promise<void> | undefined;
  return Object.freeze({
    dispose(): Promise<void> {
      disposal ??= Promise.resolve();
      return disposal;
    },
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Three Host preparation was cancelled.");
  }
}
