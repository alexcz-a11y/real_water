import type {
  HostLifecycleAdapter,
  HostPreparedLease,
  HostPreparationRequest,
  WebGPUDeviceLoss,
} from "./startup.js";
import type { HostSimulationAdapter } from "./runtime.js";
import type { HostEnvironmentAdapter } from "./environment.js";
import { assertHostEnvironmentMatchesManifest } from "./environment.js";
import {
  coreWebGPULimits,
  evaluateRenderingCapability,
} from "./internal/rendering-capability.js";

/**
 * Deterministic outcomes supported by the Memory Host Adapter.
 *
 * @public
 */
export type MemoryHostScenario =
  | Readonly<{
      readonly kind: "success";
      readonly timestampQuery?: boolean;
    }>
  | Readonly<{
      readonly kind: "unsupported";
      readonly reason?: string;
    }>
  | Readonly<{
      readonly kind: "webgl-fallback";
    }>
  | Readonly<{
      readonly kind: "compatibility-mode";
    }>
  | Readonly<{
      readonly kind: "missing-limit";
    }>
  | Readonly<{
      readonly kind: "device-lost";
      readonly message?: string;
      readonly reason?: string;
    }>
  | Readonly<{
      readonly kind: "failure";
      readonly declarationId?: string;
      readonly message?: string;
    }>;

/**
 * Configuration for {@link createMemoryHostLifecycleAdapter}.
 *
 * @public
 */
export interface MemoryHostLifecycleAdapterOptions {
  readonly scenario?: MemoryHostScenario;
  readonly simulation: HostSimulationAdapter;
  readonly environment: HostEnvironmentAdapter;
  readonly stepDelayMs?: number;
}

/**
 * Creates an in-memory Host Lifecycle Adapter for deterministic startup
 * verification and the placeholder Reference Experience.
 *
 * @public
 */
export function createMemoryHostLifecycleAdapter(
  options: MemoryHostLifecycleAdapterOptions,
): HostLifecycleAdapter {
  if (options.environment === undefined) {
    throw new TypeError(
      "The Memory Host Adapter requires a Host Environment Adapter.",
    );
  }
  const scenario = options.scenario ?? { kind: "success" };
  const stepDelayMs = normalizeDelay(options.stepDelayMs);

  return Object.freeze({
    async prepare(request: HostPreparationRequest) {
      assertHostEnvironmentMatchesManifest(
        options.environment,
        request.manifest,
      );
      await waitForTurn(stepDelayMs, request.signal);

      if (scenario.kind === "unsupported") {
        return {
          status: "unsupported" as const,
          reason:
            scenario.reason ??
            "This mock Host Adapter reports an unsupported environment.",
          diagnostics: Object.freeze({ adapter: "memory" }),
        };
      }

      const capability = evaluateRenderingCapability(
        scenario.kind === "webgl-fallback"
          ? { backend: "webgl2" }
          : scenario.kind === "compatibility-mode"
            ? { backend: "webgpu-compatibility" }
            : scenario.kind === "device-lost"
              ? {
                  backend: "device-lost",
                  message:
                    scenario.message ?? "The mock WebGPU device was lost.",
                  reason: scenario.reason ?? null,
                }
              : {
                  backend: "core-webgpu",
                  limits:
                    scenario.kind === "missing-limit"
                      ? coreWebGPULimits({
                          maxStorageBufferBindingSize: 67_108_864,
                        })
                      : coreWebGPULimits(),
                  timestampQuery:
                    scenario.kind === "success" &&
                    scenario.timestampQuery === true,
                },
      );
      if (capability.status !== "supported") {
        return capability;
      }

      const failureId =
        scenario.kind === "failure"
          ? (scenario.declarationId ??
            request.manifest.declarations.at(1)?.id ??
            request.manifest.declarations[0]?.id)
          : undefined;
      if (
        scenario.kind === "failure" &&
        (failureId === undefined ||
          !request.manifest.declarations.some(
            (declaration) => declaration.id === failureId,
          ))
      ) {
        throw new Error(
          "The configured mock failure declaration is absent from the Prewarm Manifest.",
        );
      }

      for (const declaration of request.manifest.declarations) {
        await waitForTurn(stepDelayMs, request.signal);

        if (scenario.kind === "failure" && declaration.id === failureId) {
          throw new Error(
            scenario.message ??
              "The Memory Host Adapter failed during declared prewarm work.",
          );
        }

        await request.progress.complete(declaration.id);
      }

      return {
        status: "ready" as const,
        capabilities: capability.capabilities,
        lease: createMemoryPreparedLease(options.simulation),
      };
    },
  });
}

function normalizeDelay(candidate: number | undefined): number {
  if (candidate === undefined) {
    return 40;
  }

  if (!Number.isFinite(candidate) || candidate < 0) {
    throw new TypeError("stepDelayMs must be a finite, non-negative number.");
  }

  return candidate;
}

function createMemoryPreparedLease(
  simulation: HostSimulationAdapter,
): HostPreparedLease {
  let disposal: Promise<void> | undefined;
  const invalidated = new Promise<WebGPUDeviceLoss>(() => {});

  return Object.freeze({
    invalidated,
    simulation,
    dispose(): Promise<void> {
      disposal ??= Promise.resolve();
      return disposal;
    },
  });
}

function waitForTurn(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Preparation was cancelled."));
      return;
    }

    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error("Preparation was cancelled."));
    };

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
