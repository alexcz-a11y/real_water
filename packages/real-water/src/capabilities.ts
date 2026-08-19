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
 * Bounded hot-path capacities prepared for Gameplay Queries.
 *
 * @public
 */
export interface GameplayCapabilities {
  readonly maxQueryPointsPerTick: 2_048;
}

/**
 * Maximum Gameplay Query points accepted by one ready-runtime tick.
 *
 * @public
 */
export const MAX_GAMEPLAY_QUERY_POINTS = 2_048 as const;

/**
 * Read-only capabilities proven by the active Readiness Gate.
 *
 * @public
 */
export interface RealWaterCapabilities {
  readonly rendering: RenderingCapabilities;
  readonly gameplay: GameplayCapabilities;
}

export function createCoreWebGPUCapabilities(
  timestampQuery: boolean,
): RealWaterCapabilities {
  return Object.freeze({
    gameplay: Object.freeze({
      maxQueryPointsPerTick: MAX_GAMEPLAY_QUERY_POINTS,
    }),
    rendering: Object.freeze({
      backend: "core-webgpu" as const,
      timestampQuery,
    }),
  });
}
