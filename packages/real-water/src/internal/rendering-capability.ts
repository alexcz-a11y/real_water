import { createCoreWebGPUCapabilities } from "../capabilities.js";
import type { StartupDiagnostics } from "../errors.js";
import type { RealWaterCapabilities } from "../capabilities.js";

export const requiredCoreWebGPULimits = Object.freeze({
  maxTextureDimension2D: 8_192,
  maxStorageBufferBindingSize: 134_217_728,
  maxComputeInvocationsPerWorkgroup: 256,
  maxComputeWorkgroupSizeX: 256,
  maxComputeWorkgroupsPerDimension: 65_535,
  maxColorAttachments: 8,
  maxColorAttachmentBytesPerSample: 32,
});

export type CoreWebGPULimitName = keyof typeof requiredCoreWebGPULimits;
export type CoreWebGPULimits = Readonly<
  Record<CoreWebGPULimitName, number | undefined>
>;

export type RenderingCapabilityObservation =
  | Readonly<{
      readonly backend: "core-webgpu";
      readonly limits: CoreWebGPULimits;
      readonly timestampQuery: boolean;
    }>
  | Readonly<{
      readonly backend: "webgl2";
    }>
  | Readonly<{
      readonly backend: "webgpu-compatibility";
    }>
  | Readonly<{
      readonly backend: "device-lost";
      readonly message: string;
      readonly reason: string | null;
    }>;

export type RenderingCapabilityDecision =
  | Readonly<{
      readonly status: "supported";
      readonly capabilities: RealWaterCapabilities;
    }>
  | Readonly<{
      readonly status: "unsupported";
      readonly code:
        | "CORE_WEBGPU_REQUIRED"
        | "WEBGPU_COMPATIBILITY_MODE_UNSUPPORTED"
        | "WEBGPU_LIMIT_UNSUPPORTED";
      readonly reason: string;
      readonly diagnostics: StartupDiagnostics;
    }>
  | Readonly<{
      readonly status: "failed";
      readonly code: "WEBGPU_DEVICE_LOST";
      readonly reason: string;
      readonly retryable: true;
      readonly diagnostics: StartupDiagnostics;
    }>;

export function evaluateRenderingCapability(
  observation: RenderingCapabilityObservation,
  drawingBuffer?: Readonly<{ width: number; height: number }>,
): RenderingCapabilityDecision {
  if (observation.backend === "device-lost") {
    return Object.freeze({
      status: "failed",
      code: "WEBGPU_DEVICE_LOST",
      reason: "The WebGPU device was lost during renderer initialization.",
      retryable: true,
      diagnostics: Object.freeze({
        deviceLossMessage: observation.message,
        deviceLossReason: observation.reason,
      }),
    });
  }

  if (observation.backend === "webgl2") {
    return Object.freeze({
      status: "unsupported",
      code: "CORE_WEBGPU_REQUIRED",
      reason: "Three initialized a WebGL2 fallback; Core WebGPU is required.",
      diagnostics: Object.freeze({
        requiredBackend: "core-webgpu",
        selectedBackend: "webgl2",
      }),
    });
  }

  if (observation.backend === "webgpu-compatibility") {
    return Object.freeze({
      status: "unsupported",
      code: "WEBGPU_COMPATIBILITY_MODE_UNSUPPORTED",
      reason:
        "WebGPU Compatibility Mode is unsupported; Core WebGPU is required.",
      diagnostics: Object.freeze({
        requiredFeatureLevel: "core",
        selectedFeatureLevel: "compatibility",
      }),
    });
  }

  const missingLimits = Object.entries(requiredCoreWebGPULimits).flatMap(
    ([name, requiredLimit]) => {
      const limitName = name as CoreWebGPULimitName;
      const actualLimit = observation.limits[limitName];
      return typeof actualLimit !== "number" || actualLimit < requiredLimit
        ? [{ actualLimit, limitName, requiredLimit }]
        : [];
    },
  );
  const firstMissingLimit = missingLimits[0];
  if (firstMissingLimit !== undefined) {
    return Object.freeze({
      status: "unsupported",
      code: "WEBGPU_LIMIT_UNSUPPORTED",
      reason: "The Core WebGPU device does not meet required limits.",
      diagnostics: Object.freeze({
        actualLimit: firstMissingLimit.actualLimit ?? null,
        limitName: firstMissingLimit.limitName,
        missingLimitCount: missingLimits.length,
        requiredLimit: firstMissingLimit.requiredLimit,
      }),
    });
  }

  if (
    drawingBuffer === undefined ||
    !Number.isSafeInteger(drawingBuffer.width) ||
    !Number.isSafeInteger(drawingBuffer.height) ||
    drawingBuffer.width < 1 ||
    drawingBuffer.height < 1
  ) {
    throw new TypeError(
      "Supported Core WebGPU capabilities require the prepared drawing buffer.",
    );
  }

  return Object.freeze({
    status: "supported",
    capabilities: createCoreWebGPUCapabilities(
      observation.timestampQuery,
      drawingBuffer,
    ),
  });
}

export function coreWebGPULimits(
  overrides: Partial<Record<CoreWebGPULimitName, number>> = {},
): CoreWebGPULimits {
  return Object.freeze({
    ...requiredCoreWebGPULimits,
    ...overrides,
  });
}
