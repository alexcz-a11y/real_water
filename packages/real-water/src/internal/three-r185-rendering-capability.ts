import { WebGLCoordinateSystem, WebGPUCoordinateSystem } from "three";
import type { ThreeHostRenderer } from "../three-host.js";
import type { WebGPUDeviceLoss } from "../startup.js";
import {
  requiredCoreWebGPULimits,
  type CoreWebGPULimitName,
  type RenderingCapabilityObservation,
} from "./rendering-capability.js";

interface ThreeR185RendererInternals extends ThreeHostRenderer {
  readonly backend?: Readonly<{
    readonly device?: Readonly<{
      readonly limits?: Readonly<Record<string, number | undefined>>;
    }>;
  }>;
  readonly coordinateSystem: number;
  hasFeature(name: string): boolean;
  onDeviceLost: (info: unknown) => void;
}

export interface ThreeR185RenderingCapabilityInspection {
  readonly observation: RenderingCapabilityObservation;
  readonly invalidated: Promise<WebGPUDeviceLoss>;
  release(): void;
}

export async function inspectThreeR185RenderingCapability(
  renderer: ThreeHostRenderer,
): Promise<ThreeR185RenderingCapabilityInspection> {
  const internals = renderer as ThreeR185RendererInternals;
  if (typeof internals.onDeviceLost !== "function") {
    throw new TypeError(
      "The Host renderer is not a compatible Three r185 WebGPURenderer.",
    );
  }

  const previousOnDeviceLost = internals.onDeviceLost;
  let resolveInvalidation: (loss: WebGPUDeviceLoss) => void = () => {};
  const invalidated = new Promise<WebGPUDeviceLoss>((resolve) => {
    resolveInvalidation = resolve;
  });
  const deviceLoss = { current: null as WebGPUDeviceLoss | null };
  const onDeviceLost = (info: unknown): void => {
    if (deviceLoss.current === null) {
      deviceLoss.current = normalizeDeviceLoss(info);
      resolveInvalidation(deviceLoss.current);
    }
    previousOnDeviceLost.call(renderer, info);
  };
  internals.onDeviceLost = onDeviceLost;
  let released = false;
  const release = (): void => {
    if (released) {
      return;
    }
    released = true;
    if (internals.onDeviceLost === onDeviceLost) {
      internals.onDeviceLost = previousOnDeviceLost;
    }
  };

  try {
    await renderer.init();
    const observedDeviceLoss = deviceLoss.current;
    if (observedDeviceLoss !== null) {
      return createInspection({
        backend: "device-lost",
        message: observedDeviceLoss.message,
        reason: observedDeviceLoss.reason,
      });
    }
    if (internals.coordinateSystem === WebGLCoordinateSystem) {
      return createInspection({ backend: "webgl2" });
    }

    if (internals.coordinateSystem !== WebGPUCoordinateSystem) {
      throw new Error(
        "The initialized Three renderer selected an unknown coordinate system.",
      );
    }
    if (internals.hasFeature("core-features-and-limits") === false) {
      return createInspection({ backend: "webgpu-compatibility" });
    }

    const deviceLimits = internals.backend?.device?.limits;
    const limits = Object.freeze(
      Object.fromEntries(
        Object.keys(requiredCoreWebGPULimits).map((name) => [
          name,
          deviceLimits?.[name],
        ]),
      ) as Record<CoreWebGPULimitName, number | undefined>,
    );
    return createInspection({
      backend: "core-webgpu",
      limits,
      timestampQuery: internals.hasFeature("timestamp-query"),
    });
  } catch (cause) {
    release();
    throw cause;
  }

  function createInspection(
    observation: RenderingCapabilityObservation,
  ): ThreeR185RenderingCapabilityInspection {
    return Object.freeze({
      observation: Object.freeze(observation),
      invalidated,
      release,
    });
  }
}

function normalizeDeviceLoss(info: unknown): WebGPUDeviceLoss {
  if (typeof info !== "object" || info === null) {
    return createDeviceLoss("Unknown reason", null);
  }

  const value = info as Readonly<Record<string, unknown>>;
  return createDeviceLoss(
    typeof value.message === "string" && value.message.length > 0
      ? value.message
      : "Unknown reason",
    typeof value.reason === "string" ? value.reason : null,
  );
}

function createDeviceLoss(
  message: string,
  reason: string | null,
): WebGPUDeviceLoss {
  return Object.freeze({
    code: "WEBGPU_DEVICE_LOST",
    message,
    reason,
    diagnostics: Object.freeze({
      deviceLossMessage: message,
      deviceLossReason: reason,
    }),
  });
}
