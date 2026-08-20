/**
 * Native temporal evidence exposed only after a ready lease is published.
 *
 * @public
 */
export interface RenderingCapabilitiesTemporal {
  readonly mode: "TRAA";
  readonly renderScale: 1;
  readonly resolutionPolicy: "drawing-buffer-exact";
  readonly taau: false;
  readonly dynamicResolution: false;
  readonly frameGeneration: false;
  readonly msaaSamples: 0;
  readonly motionFormat: "rg16float";
  readonly stockThreeRevision: "185";
}

/**
 * Stable rendering capabilities exposed by a ready Real Water lease.
 *
 * @public
 */
export interface RenderingCapabilities {
  readonly backend: "core-webgpu";
  readonly timestampQuery: boolean;
  readonly temporal: RenderingCapabilitiesTemporal;
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

const NATIVE_TEMPORAL_CAPABILITIES: RenderingCapabilitiesTemporal =
  Object.freeze({
    mode: "TRAA",
    renderScale: 1,
    resolutionPolicy: "drawing-buffer-exact",
    taau: false,
    dynamicResolution: false,
    frameGeneration: false,
    msaaSamples: 0,
    motionFormat: "rg16float",
    stockThreeRevision: "185",
  });

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
      temporal: NATIVE_TEMPORAL_CAPABILITIES,
    }),
  });
}
