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
 * Prepared shared secondary-particle allocation policy and every structurally
 * declared consumer. Reference pixels always use this lease's physical output
 * drawing buffer, independent of the consumer's later render phase.
 *
 * @public
 */
export interface RenderingCapabilitiesSecondaryParticles {
  readonly capacity: 131_072;
  readonly maximumCandidateCount: 147_456;
  readonly contributionReference: {
    readonly width: number;
    readonly height: number;
    readonly space: "output-drawing-buffer";
    readonly screenAreaDivisor: 3_600;
    readonly quantization: "q16-unorm-round-nearest";
  };
  readonly hysteresis: {
    readonly retainedContributionBonusQ16: 4_096;
    readonly minimumResidenceTicks: 4;
    readonly reentryCooldownTicks: 4;
  };
  readonly consumers: readonly [
    {
      readonly consumerId: "spray-droplet-mist";
      readonly maximumRequestCount: 65_536;
      readonly softRequestCeiling: 32_768;
      readonly minimumRetainedSlots: 2_048;
      readonly pressureReentryPolicy: "after-shared-cooldown";
    },
    {
      readonly consumerId: "underwater-suspended-particles";
      readonly maximumRequestCount: 49_152;
      readonly softRequestCeiling: 24_576;
      readonly minimumRetainedSlots: 2_048;
      readonly pressureReentryPolicy: "after-shared-cooldown";
    },
    {
      readonly consumerId: "subsurface-foam-bubble-cloud";
      readonly maximumRequestCount: 24_576;
      readonly softRequestCeiling: 12_288;
      readonly minimumRetainedSlots: 1_024;
      readonly pressureReentryPolicy: "after-shared-cooldown";
    },
    {
      readonly consumerId: "rising-bubbles";
      readonly maximumRequestCount: 8_192;
      readonly softRequestCeiling: 4_096;
      readonly minimumRetainedSlots: 256;
      readonly pressureReentryPolicy: "forbidden-until-absent";
    },
  ];
  readonly selection: "q16-global-contribution-radix";
  readonly updateCadence: "host-fixed-tick";
  readonly renderPhaseKnowledge: "none";
}

/**
 * Prepared ordered drawing-buffer-exact stages after TRAA and before Host
 * presentation.
 *
 * @public
 */
export interface RenderingCapabilitiesPostTraaComposition {
  readonly width: number;
  readonly height: number;
  readonly stages: readonly [
    { readonly id: "secondary-particles"; readonly after: "traa" },
    {
      readonly id: "lens-wetness";
      readonly after: "secondary-particles";
    },
  ];
  readonly accumulationFormat: "rgba16float";
  readonly finalColorFormat: "rgba8unorm-srgb";
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
  readonly secondaryParticles: RenderingCapabilitiesSecondaryParticles;
  readonly postTraaComposition: RenderingCapabilitiesPostTraaComposition;
}

/**
 * Structural local interaction field prepared before the runtime becomes ready.
 *
 * @public
 */
export interface GameplayCapabilitiesInteractionField {
  readonly radiusMetres: 48;
  readonly edgeFadeMetres: 8;
  readonly maxSnapshotAgeTicks: 1;
  readonly disturbanceKinds: readonly [
    "radial-impact",
    "directional-wake",
    "hero-breaker",
  ];
}

/**
 * Bounded compound-shape and authored-socket policy behind `attachBody`.
 *
 * @public
 */
export interface GameplayCapabilitiesBodyInteraction {
  readonly fixedTickHz: 60;
  readonly maxShapeSamplesPerBody: 32;
  readonly maxConvexHullVertices: 64;
  readonly maxSocketsPerBody: 8;
  readonly shapeKinds: readonly [
    "sphere",
    "box",
    "capsule",
    "convex-hull",
    "compound",
  ];
  readonly socketKinds: readonly [
    "bow",
    "stern",
    "propeller",
    "wake",
    "interaction-anchor",
  ];
  readonly generatedDisturbanceKinds: readonly [
    "directional-wake",
    "propeller-wash",
  ];
}

/**
 * Bounded hot-path capacities prepared for gameplay commands and queries.
 *
 * @public
 */
export interface GameplayCapabilities {
  readonly maxAttachedBodies: 32;
  readonly maxQueryPointsPerTick: 2_048;
  readonly maxActiveDisturbances: 128;
  readonly maxActiveHeroBreakers: 8;
  readonly interactionField: GameplayCapabilitiesInteractionField;
  readonly bodyInteraction: GameplayCapabilitiesBodyInteraction;
}

/**
 * Maximum Body attachments accepted by one ready runtime.
 *
 * @public
 */
export const MAX_ATTACHED_BODIES = 32 as const;

/**
 * Maximum Gameplay Query points accepted by one ready-runtime tick.
 *
 * @public
 */
export const MAX_GAMEPLAY_QUERY_POINTS = 2_048 as const;

/**
 * Maximum active Disturbances retained by one prepared local interaction field.
 *
 * @public
 */
export const MAX_ACTIVE_DISTURBANCES = 128 as const;

/**
 * Maximum Hero Breakers retained inside the global Disturbance capacity.
 *
 * @public
 */
export const MAX_ACTIVE_HERO_BREAKERS = 8 as const;

/**
 * Global retained-slot capacity shared by every prepared secondary-particle
 * consumer, independent of whether it later renders before or after TRAA.
 *
 * @public
 */
export const MAX_SECONDARY_PARTICLES = 131_072 as const;

export const INTERACTION_FIELD_RADIUS_METRES = 48 as const;
export const INTERACTION_FIELD_EDGE_FADE_METRES = 8 as const;

const SUPPORTED_DISTURBANCE_KINDS = Object.freeze([
  "radial-impact",
  "directional-wake",
  "hero-breaker",
] as const);
const INTERACTION_FIELD_CAPABILITIES: GameplayCapabilitiesInteractionField =
  Object.freeze({
    radiusMetres: INTERACTION_FIELD_RADIUS_METRES,
    edgeFadeMetres: INTERACTION_FIELD_EDGE_FADE_METRES,
    maxSnapshotAgeTicks: 1 as const,
    disturbanceKinds: SUPPORTED_DISTURBANCE_KINDS,
  });
const SUPPORTED_INTERACTION_SHAPE_KINDS = Object.freeze([
  "sphere",
  "box",
  "capsule",
  "convex-hull",
  "compound",
] as const);
const SUPPORTED_BODY_SOCKET_KINDS = Object.freeze([
  "bow",
  "stern",
  "propeller",
  "wake",
  "interaction-anchor",
] as const);
const BODY_GENERATED_DISTURBANCE_KINDS = Object.freeze([
  "directional-wake",
  "propeller-wash",
] as const);
const BODY_INTERACTION_CAPABILITIES: GameplayCapabilitiesBodyInteraction =
  Object.freeze({
    fixedTickHz: 60,
    maxShapeSamplesPerBody: MAX_COMPOUND_INTERACTION_SHAPE_CHILDREN,
    maxConvexHullVertices: MAX_CONVEX_HULL_VERTICES,
    maxSocketsPerBody: MAX_BODY_INTERACTION_SOCKETS,
    shapeKinds: SUPPORTED_INTERACTION_SHAPE_KINDS,
    socketKinds: SUPPORTED_BODY_SOCKET_KINDS,
    generatedDisturbanceKinds: BODY_GENERATED_DISTURBANCE_KINDS,
  });

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
// Declaration order is stable identity evidence, not allocation priority. The
// allocator canonicalizes by consumerId before global contribution selection.
const SECONDARY_PARTICLE_CONSUMERS = Object.freeze([
  Object.freeze({
    consumerId: "spray-droplet-mist",
    maximumRequestCount: 65_536,
    softRequestCeiling: 32_768,
    minimumRetainedSlots: 2_048,
    pressureReentryPolicy: "after-shared-cooldown",
  }),
  Object.freeze({
    consumerId: "underwater-suspended-particles",
    maximumRequestCount: 49_152,
    softRequestCeiling: 24_576,
    minimumRetainedSlots: 2_048,
    pressureReentryPolicy: "after-shared-cooldown",
  }),
  Object.freeze({
    consumerId: "subsurface-foam-bubble-cloud",
    maximumRequestCount: 24_576,
    softRequestCeiling: 12_288,
    minimumRetainedSlots: 1_024,
    pressureReentryPolicy: "after-shared-cooldown",
  }),
  Object.freeze({
    consumerId: "rising-bubbles",
    maximumRequestCount: 8_192,
    softRequestCeiling: 4_096,
    minimumRetainedSlots: 256,
    pressureReentryPolicy: "forbidden-until-absent",
  }),
] as const);
const POST_TRAA_STAGES = Object.freeze([
  Object.freeze({ id: "secondary-particles", after: "traa" }),
  Object.freeze({ id: "lens-wetness", after: "secondary-particles" }),
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
      maxAttachedBodies: MAX_ATTACHED_BODIES,
      maxQueryPointsPerTick: MAX_GAMEPLAY_QUERY_POINTS,
      maxActiveDisturbances: MAX_ACTIVE_DISTURBANCES,
      maxActiveHeroBreakers: MAX_ACTIVE_HERO_BREAKERS,
      interactionField: INTERACTION_FIELD_CAPABILITIES,
      bodyInteraction: BODY_INTERACTION_CAPABILITIES,
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
      secondaryParticles: Object.freeze({
        capacity: MAX_SECONDARY_PARTICLES,
        maximumCandidateCount: 147_456 as const,
        contributionReference: Object.freeze({
          width: drawingBuffer.width,
          height: drawingBuffer.height,
          space: "output-drawing-buffer" as const,
          screenAreaDivisor: 3_600 as const,
          quantization: "q16-unorm-round-nearest" as const,
        }),
        hysteresis: Object.freeze({
          retainedContributionBonusQ16: 4_096 as const,
          minimumResidenceTicks: 4 as const,
          reentryCooldownTicks: 4 as const,
        }),
        consumers: SECONDARY_PARTICLE_CONSUMERS,
        selection: "q16-global-contribution-radix" as const,
        updateCadence: "host-fixed-tick" as const,
        renderPhaseKnowledge: "none" as const,
      }),
      postTraaComposition: Object.freeze({
        width: drawingBuffer.width,
        height: drawingBuffer.height,
        stages: POST_TRAA_STAGES,
        accumulationFormat: "rgba16float" as const,
        finalColorFormat: "rgba8unorm-srgb" as const,
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
import {
  MAX_BODY_INTERACTION_SOCKETS,
  MAX_COMPOUND_INTERACTION_SHAPE_CHILDREN,
  MAX_CONVEX_HULL_VERTICES,
} from "./body-physics.js";
