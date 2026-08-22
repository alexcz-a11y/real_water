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
  readonly updateCadence: "host-present";
  readonly motionFormat: "rg16float";
  readonly stockThreeRevision: "185";
}

/**
 * Prepared current-frame stock roughness-blur evidence. Dimensions are the
 * public policy base size. This blur is current-frame spatial only;
 * TemporalReproject history is a separate capability.
 *
 * @public
 */
export interface RenderingCapabilitiesReflectionSsrBlur {
  readonly width: number;
  readonly height: number;
  readonly format: "rgba16float";
  readonly mipCount: 5;
  readonly blurQuality: 2;
  readonly enabled: true;
}

/**
 * Prepared dedicated TemporalReproject history evidence. Dimensions are
 * the actual history and resolve targets. Reset shares the Host
 * presentation domain with TRAA.
 *
 * @public
 */
export interface RenderingCapabilitiesReflectionSsrHistory {
  readonly width: number;
  readonly height: number;
  readonly historyFormat: "rgba16float";
  readonly resolveFormat: "rgba16float";
  readonly inputFormat: "rgba16float";
  readonly captureFormat: "rgba16float";
  readonly resetVelocityFormat: "rg16float";
  readonly maxFrames: 32;
  readonly mode: "temporal-reproject-specular";
  readonly accumulate: true;
  readonly hitPointReprojection: true;
  readonly normalFormat: "packed-rgba16float";
  readonly resetDomains: readonly [
    "simulation-reset",
    "camera-cut",
    "origin-shift",
    "sea-state-cut",
    "waterline-crossing",
  ];
  readonly updateCadence: "host-present";
}

/**
 * Prepared current-frame SSR evidence. Dimensions are the actual raw and
 * composite targets. History is the dedicated TemporalReproject policy.
 *
 * @public
 */
export interface RenderingCapabilitiesReflectionSsr {
  readonly width: number;
  readonly height: number;
  readonly rawFormat: "rgba16float";
  readonly compositeFormat: "rgba16float";
  readonly samples: 0;
  readonly mode: "current-frame";
  readonly history: RenderingCapabilitiesReflectionSsrHistory;
  readonly updateCadence: "host-present";
  readonly missFallbackPriority: readonly ["planar", "host-adapter"];
  readonly blur: RenderingCapabilitiesReflectionSsrBlur;
}

/**
 * Resolved reflection layers proven by a ready lease. Dimensions are the
 * prepared planar and current-frame SSR targets, not a live resize policy.
 *
 * @public
 */
export interface RenderingCapabilitiesReflection {
  readonly environment: {
    readonly source: "host-adapter";
  };
  readonly planar: {
    readonly width: number;
    readonly height: number;
    readonly format: "rgba8unorm-srgb";
    readonly samples: 0;
  };
  readonly ssr: RenderingCapabilitiesReflectionSsr;
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
  readonly reflection: RenderingCapabilitiesReflection;
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

const NATIVE_TEMPORAL_CAPABILITIES: RenderingCapabilitiesTemporal =
  Object.freeze({
    mode: "TRAA",
    renderScale: 1,
    resolutionPolicy: "drawing-buffer-exact",
    taau: false,
    dynamicResolution: false,
    frameGeneration: false,
    msaaSamples: 0,
    updateCadence: "host-present",
    motionFormat: "rg16float",
    stockThreeRevision: "185",
  });

const CURRENT_FRAME_SSR_MISS_FALLBACK_PRIORITY = Object.freeze([
  "planar",
  "host-adapter",
] as const);

export function createCoreWebGPUCapabilities(
  timestampQuery: boolean,
  drawingBuffer: Readonly<{ width: number; height: number }>,
): RealWaterCapabilities {
  if (
    !Number.isSafeInteger(drawingBuffer.width) ||
    !Number.isSafeInteger(drawingBuffer.height) ||
    drawingBuffer.width < 1 ||
    drawingBuffer.height < 1
  ) {
    throw new RangeError(
      "Core WebGPU reflection capabilities require a positive drawing buffer.",
    );
  }
  return Object.freeze({
    gameplay: Object.freeze({
      maxQueryPointsPerTick: MAX_GAMEPLAY_QUERY_POINTS,
    }),
    rendering: Object.freeze({
      backend: "core-webgpu" as const,
      timestampQuery,
      temporal: NATIVE_TEMPORAL_CAPABILITIES,
      reflection: Object.freeze({
        environment: Object.freeze({
          source: "host-adapter" as const,
        }),
        planar: Object.freeze({
          width: drawingBuffer.width,
          height: drawingBuffer.height,
          format: "rgba8unorm-srgb" as const,
          samples: 0 as const,
        }),
        ssr: Object.freeze({
          width: drawingBuffer.width,
          height: drawingBuffer.height,
          rawFormat: "rgba16float" as const,
          compositeFormat: "rgba16float" as const,
          samples: 0 as const,
          mode: "current-frame" as const,
          history: Object.freeze({
            width: drawingBuffer.width,
            height: drawingBuffer.height,
            historyFormat: "rgba16float" as const,
            resolveFormat: "rgba16float" as const,
            inputFormat: "rgba16float" as const,
            captureFormat: "rgba16float" as const,
            resetVelocityFormat: "rg16float" as const,
            maxFrames: 32 as const,
            mode: "temporal-reproject-specular" as const,
            accumulate: true as const,
            hitPointReprojection: true as const,
            normalFormat: "packed-rgba16float" as const,
            resetDomains: Object.freeze([
              "simulation-reset",
              "camera-cut",
              "origin-shift",
              "sea-state-cut",
              "waterline-crossing",
            ] as const),
            updateCadence: "host-present" as const,
          }),
          updateCadence: "host-present" as const,
          missFallbackPriority: CURRENT_FRAME_SSR_MISS_FALLBACK_PRIORITY,
          blur: Object.freeze({
            width: drawingBuffer.width,
            height: drawingBuffer.height,
            format: "rgba16float" as const,
            mipCount: 5 as const,
            blurQuality: 2 as const,
            enabled: true as const,
          }),
        }),
      }),
    }),
  });
}

/**
 * Read-only capabilities proven by the active Readiness Gate.
 *
 * @public
 */
export interface RealWaterCapabilities {
  readonly rendering: RenderingCapabilities;
  readonly gameplay: GameplayCapabilities;
}
