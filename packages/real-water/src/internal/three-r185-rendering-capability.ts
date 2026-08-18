import { WebGLCoordinateSystem, WebGPUCoordinateSystem } from "three";
import type { ThreeHostRenderer } from "../three-host.js";
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

export async function inspectThreeR185RenderingCapability(
  renderer: ThreeHostRenderer,
): Promise<RenderingCapabilityObservation> {
  const internals = renderer as ThreeR185RendererInternals;
  if (typeof internals.onDeviceLost !== "function") {
    throw new TypeError(
      "The Host renderer is not a compatible Three r185 WebGPURenderer.",
    );
  }

  const previousOnDeviceLost = internals.onDeviceLost;
  const deviceLoss = {
    current: null as Readonly<{
      message: string;
      reason: string | null;
    }> | null,
  };
  const onDeviceLost = (info: unknown): void => {
    deviceLoss.current = normalizeDeviceLoss(info);
    previousOnDeviceLost.call(renderer, info);
  };
  internals.onDeviceLost = onDeviceLost;

  try {
    await renderer.init();
    const observedDeviceLoss = deviceLoss.current;
    if (observedDeviceLoss !== null) {
      return Object.freeze({
        backend: "device-lost",
        message: observedDeviceLoss.message,
        reason: observedDeviceLoss.reason,
      });
    }
    if (internals.coordinateSystem === WebGLCoordinateSystem) {
      return Object.freeze({ backend: "webgl2" });
    }

    if (internals.coordinateSystem !== WebGPUCoordinateSystem) {
      throw new Error(
        "The initialized Three renderer selected an unknown coordinate system.",
      );
    }
    if (internals.hasFeature("core-features-and-limits") === false) {
      return Object.freeze({ backend: "webgpu-compatibility" });
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
    return Object.freeze({
      backend: "core-webgpu",
      limits,
      timestampQuery: internals.hasFeature("timestamp-query"),
    });
  } finally {
    if (internals.onDeviceLost === onDeviceLost) {
      internals.onDeviceLost = previousOnDeviceLost;
    }
  }
}

function normalizeDeviceLoss(
  info: unknown,
): Readonly<{ message: string; reason: string | null }> {
  if (typeof info !== "object" || info === null) {
    return Object.freeze({ message: "Unknown reason", reason: null });
  }

  const value = info as Readonly<Record<string, unknown>>;
  return Object.freeze({
    message:
      typeof value.message === "string" && value.message.length > 0
        ? value.message
        : "Unknown reason",
    reason: typeof value.reason === "string" ? value.reason : null,
  });
}
