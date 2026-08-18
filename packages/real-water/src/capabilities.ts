/**
 * Stable rendering capabilities exposed by a ready Real Water lease.
 *
 * @public
 */
export interface RenderingCapabilities {
  readonly backend: "core-webgpu";
  readonly timestampQuery: boolean;
}

/**
 * Read-only capabilities proven by the active Readiness Gate.
 *
 * @public
 */
export interface RealWaterCapabilities {
  readonly rendering: RenderingCapabilities;
}

export function createCoreWebGPUCapabilities(
  timestampQuery: boolean,
): RealWaterCapabilities {
  return Object.freeze({
    rendering: Object.freeze({
      backend: "core-webgpu" as const,
      timestampQuery,
    }),
  });
}
