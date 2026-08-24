import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
  RepeatWrapping,
  StorageTexture,
  Vector4,
  type ComputeNode,
  type Node,
  type Renderer,
  type UniformNode,
} from "three/webgpu";
import {
  abs,
  cos,
  exp,
  float,
  floor,
  Fn,
  fract,
  If,
  int,
  instanceIndex,
  ivec2,
  length,
  Loop,
  mix,
  pow,
  sin,
  smoothstep,
  sqrt,
  step,
  texture,
  textureLoad,
  textureStore,
  uniform,
  uniformArray,
  uvec2,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  INTERACTION_FIELD_EDGE_FADE_METRES,
  INTERACTION_FIELD_RADIUS_METRES,
  MAX_ACTIVE_DISTURBANCES,
  MAX_ACTIVE_HERO_BREAKERS,
} from "../capabilities.js";
import type { QualityProfileSpectralWhitecaps } from "../quality-profile.js";
import type { OpenWaterRuntimeSnapshot, RuntimeStateSink } from "../runtime.js";
import {
  DIRECTIONAL_WAKE_HEIGHT_SCALE,
  DIRECTIONAL_WAKE_LENGTH_RADIUS_MULTIPLIER,
  DIRECTIONAL_WAKE_SPATIAL_RADIANS,
  DIRECTIONAL_WAKE_TEMPORAL_RADIANS_PER_SECOND,
  LOCAL_INTERACTION_KIND_DIRECTIONAL_WAKE,
  LOCAL_INTERACTION_KIND_PROPELLER_WASH,
  LOCAL_INTERACTION_KIND_RADIAL_IMPACT,
  MIN_RADIAL_IMPACT_RADIUS_METRES,
  PERSISTENT_BODY_WAKE_START_TIME_SECONDS,
  PROPELLER_WASH_HEIGHT_SCALE,
  PROPELLER_WASH_LENGTH_RADIUS_MULTIPLIER,
  PROPELLER_WASH_SPATIAL_RADIANS,
  PROPELLER_WASH_TEMPORAL_RADIANS_PER_SECOND,
  PROPELLER_WASH_WIDTH_RADIUS_MULTIPLIER,
  DIRECTIONAL_WAKE_WIDTH_RADIUS_MULTIPLIER,
  RADIAL_IMPACT_LIFETIME_SECONDS,
  type LocalInteractionRenderSnapshot,
} from "./local-interaction.js";
import {
  HERO_BREAKER_ATTACK_FRACTION,
  HERO_BREAKER_BACK_WIDTH_RADII,
  HERO_BREAKER_FIXED_TICKS_PER_SECOND,
  HERO_BREAKER_FORWARD_HOLLOW_CENTER_RADII,
  HERO_BREAKER_FORWARD_HOLLOW_DEPTH,
  HERO_BREAKER_FORWARD_HOLLOW_WIDTH_RADII,
  HERO_BREAKER_FORWARD_TRAVEL_RADII,
  HERO_BREAKER_FRONT_WIDTH_RADII,
  HERO_BREAKER_INITIAL_CREST_CENTER_RADII,
  HERO_BREAKER_LATERAL_WIDTH_RADII,
  HERO_BREAKER_RELEASE_START_FRACTION,
} from "./hero-breaker.js";
import {
  NON_PERIODIC_BLEND_K1,
  NON_PERIODIC_BLEND_K2,
  NON_PERIODIC_OFFSET_X,
  NON_PERIODIC_OFFSET_Z,
  NON_PERIODIC_ROTATION_COS,
  NON_PERIODIC_ROTATION_SIN,
  SPECTRAL_BANDS,
  SPECTRAL_WHITECAP_ADVECTION_BASE_METRES_PER_SECOND,
  SPECTRAL_WHITECAP_ADVECTION_CHOPPINESS_SCALE,
  SPECTRAL_WHITECAP_BREAKUP_BASE,
  SPECTRAL_WHITECAP_BREAKUP_PRIMARY_PHASE_SCALE,
  SPECTRAL_WHITECAP_BREAKUP_PRIMARY_X,
  SPECTRAL_WHITECAP_BREAKUP_PRIMARY_Z,
  SPECTRAL_WHITECAP_BREAKUP_RANGE,
  SPECTRAL_WHITECAP_BREAKUP_SECONDARY_PHASE_SCALE,
  SPECTRAL_WHITECAP_BREAKUP_SECONDARY_X,
  SPECTRAL_WHITECAP_BREAKUP_SECONDARY_Z,
  SPECTRAL_WHITECAP_CREST_BASE_WEIGHT,
  SPECTRAL_WHITECAP_CREST_POSITIVE_WEIGHT,
  SPECTRAL_WHITECAP_DIFFUSION_CENTER_WEIGHT,
  SPECTRAL_WHITECAP_DIFFUSION_SIDE_WEIGHT,
  SPECTRAL_WHITECAP_HALF_LIFE_BASE_SECONDS,
  SPECTRAL_WHITECAP_HALF_LIFE_PERSISTENCE_SCALE,
  SPECTRAL_WHITECAP_PERSISTENCE_EPSILON,
  SPECTRAL_WHITECAP_SECOND_HARMONIC_SCALE,
  SPECTRAL_WHITECAP_THRESHOLD_MAX,
  SPECTRAL_WHITECAP_THRESHOLD_MIN,
  SPECTRAL_WHITECAP_THRESHOLD_RAMP,
  prepareSpectralBands,
  spectralBandPhaseOffset,
} from "./spectral-bands.js";

const WORKGROUP_SIZE = 64;
type FloatNode = Node<"float">;
type IVec2Node = Node<"ivec2">;
type UVec2Node = Node<"uvec2">;
type Vec4Node = Node<"vec4">;
type FloatUniform = UniformNode<"float", number>;
type IntUniform = UniformNode<"int", number>;

const LOCAL_FOAM_DIAMETER_METRES = INTERACTION_FIELD_RADIUS_METRES * 2;

interface UnifiedFoamComputeUniforms {
  readonly phaseOffset: FloatUniform;
  readonly timeSeconds: FloatUniform;
  readonly tick: FloatUniform;
  readonly timeScale: FloatUniform;
  readonly crestSharpness: FloatUniform;
  readonly whitecapAmount: FloatUniform;
  readonly foamPersistence: FloatUniform;
  readonly choppiness: FloatUniform;
  readonly sampleOriginX: FloatUniform;
  readonly sampleOriginZ: FloatUniform;
  readonly localSampleAnchorHostX: FloatUniform;
  readonly localSampleAnchorHostZ: FloatUniform;
  readonly localAnchorDeltaX: FloatUniform;
  readonly localAnchorDeltaZ: FloatUniform;
  readonly interactionCount: IntUniform;
  readonly interactionGeometry: ReturnType<typeof uniformArray<"vec4">>;
  readonly interactionTiming: ReturnType<typeof uniformArray<"vec4">>;
  readonly heroBreakerCount: IntUniform;
  readonly heroBreakerGeometry: ReturnType<typeof uniformArray<"vec4">>;
  readonly heroBreakerTiming: ReturnType<typeof uniformArray<"vec4">>;
  readonly heroBreakerArt: ReturnType<typeof uniformArray<"vec4">>;
  readonly resetHistory: FloatUniform;
  readonly bands: readonly WhitecapBandUniforms[];
}

interface WhitecapBandUniforms {
  readonly amplitude: FloatUniform;
  readonly waveNumber: FloatUniform;
  readonly angularFrequency: FloatUniform;
  readonly directionX: FloatUniform;
  readonly directionZ: FloatUniform;
}

interface UnifiedFoamKernels {
  readonly generate: ComputeNode;
  readonly advect: ComputeNode;
  readonly diffuse: ComputeNode;
  readonly decay: ComputeNode;
  readonly reprojectLocal: ComputeNode;
  readonly resolveLocal: ComputeNode;
}

interface FoamTimelineState {
  readonly snapshot: OpenWaterRuntimeSnapshot;
  readonly interaction: LocalInteractionRenderSnapshot;
}

interface FoamTimelineEntry extends FoamTimelineState {
  readonly tick: number;
  readonly sequence: number;
}

interface FoamTimelinePlan {
  readonly epoch: number;
  readonly sequenceCeiling: number;
  readonly entries: readonly FoamTimelineEntry[];
}

interface SynchronizedFoamBaseline extends FoamTimelineState {
  readonly tick: number;
}

export interface UnifiedFoamField {
  /**
   * Global repeating spectral-stage attachment. RGBA remains the T15
   * generation/history/advection/decay diagnostic contract.
   */
  readonly spectralStageTexture: StorageTexture;
  /**
   * Anchor-local, non-repeating source-history attachment. RGBA is
   * wake/impact/Hero-Breaker/local-union.
   */
  readonly localSourceHistoryTexture: StorageTexture;
  /** Samples the global spectral diagnostic stages at a Host-frame XZ point. */
  sampleStages(hostXNode: FloatNode, hostZNode: FloatNode): Vec4Node;
  /**
   * Resolves the global spectral attachment and anchor-local source history as
   * spectral/wake/impact/union without repeating the 96 m local domain.
   */
  sampleSources(hostXNode: FloatNode, hostZNode: FloatNode): Vec4Node;
  /**
   * Samples the current anchor-local interaction correction as signed
   * height/slopeX/slopeZ/velocityY. The backing field is current-state only;
   * no source-history or timing resource crosses this seam.
   */
  sampleLocalSurface(
    hostXNode: FloatNode,
    hostZNode: FloatNode,
  ): Readonly<{
    readonly height: FloatNode;
    readonly slopeX: FloatNode;
    readonly slopeZ: FloatNode;
    readonly velocityY: FloatNode;
  }>;
  /**
   * Samples the same logical field on a canonical anchor-local diagnostic UV,
   * independent of camera projection, depth, and temporal jitter.
   */
  sampleSourcesAtFieldUv(uvXNode: FloatNode, uvYNode: FloatNode): Vec4Node;
  /** Samples dedicated Hero Breaker foam on the canonical local-field UV. */
  sampleHeroBreakerFoamAtFieldUv(
    uvXNode: FloatNode,
    uvYNode: FloatNode,
  ): FloatNode;
  /** Runtime sink used to stage the latest hot controls and world origin. */
  readonly runtimeStateSink: RuntimeStateSink;
  /** Advances every missing authoritative fixed tick exactly once. */
  synchronize(
    renderer: Renderer,
    snapshot: OpenWaterRuntimeSnapshot,
  ): Promise<void>;
  /** Compiles every compute route, then restores the supplied live state. */
  prewarm(
    renderer: Renderer,
    snapshot: OpenWaterRuntimeSnapshot,
  ): Promise<void>;
  dispose(): void;
}

/**
 * Allocates the complete r185 TSL unified foam field. Spectral stage identity
 * remains intact while the anchor-local source textures, compute graphs, and
 * descriptor storage stay fixed for the field lifetime.
 */
export function createUnifiedFoamField(
  policy: QualityProfileSpectralWhitecaps,
): UnifiedFoamField {
  const resolution = policy.fieldResolution;
  const tileSizeMetres = policy.tileSizeMetres;
  const fixedStepSeconds = 1 / policy.fixedTickHz;
  const foamTimeline = createFoamTimeline(policy.foamTimelineCapacityTicks);
  const finalStageTexture = createWhitecapTexture(
    resolution,
    "Real Water spectral whitecaps A (final)",
  );
  const stagingTexture = createWhitecapTexture(
    resolution,
    "Real Water spectral whitecaps B (staging)",
  );
  const localFinalTexture = createLocalFoamTexture(
    resolution,
    "Real Water unified foam local A (final)",
  );
  const localStagingTexture = createLocalFoamTexture(
    resolution,
    "Real Water unified foam local B (staging)",
  );
  const localSurfaceTexture = createLocalFoamTexture(
    resolution,
    "Real Water anchor-local current surface correction",
  );
  const interactionGeometryValues = Array.from(
    { length: MAX_ACTIVE_DISTURBANCES },
    () => new Vector4(),
  );
  const interactionTimingValues = Array.from(
    { length: MAX_ACTIVE_DISTURBANCES },
    () => new Vector4(),
  );
  const heroBreakerGeometryValues = Array.from(
    { length: MAX_ACTIVE_HERO_BREAKERS },
    () => new Vector4(),
  );
  const heroBreakerTimingValues = Array.from(
    { length: MAX_ACTIVE_HERO_BREAKERS },
    () => new Vector4(),
  );
  const heroBreakerArtValues = Array.from(
    { length: MAX_ACTIVE_HERO_BREAKERS },
    () => new Vector4(),
  );
  const uniforms = createUnifiedFoamUniforms(
    interactionGeometryValues,
    interactionTimingValues,
    heroBreakerGeometryValues,
    heroBreakerTimingValues,
    heroBreakerArtValues,
  );
  const kernels = createUnifiedFoamKernels(
    finalStageTexture,
    stagingTexture,
    localFinalTexture,
    localStagingTexture,
    localSurfaceTexture,
    uniforms,
    resolution,
    tileSizeMetres,
    fixedStepSeconds,
  );
  let pendingResetSnapshot: OpenWaterRuntimeSnapshot | undefined;
  let lastObservedSnapshot: OpenWaterRuntimeSnapshot | undefined;
  let synchronizedSnapshot: OpenWaterRuntimeSnapshot | undefined;
  let synchronizedFoamBaseline: SynchronizedFoamBaseline | undefined;
  let synchronizedLocalAnchor:
    Readonly<{ readonly x: number; readonly z: number }> | undefined;
  let operationQueue = Promise.resolve();
  let disposed = false;

  const observeSnapshot = (
    snapshot: OpenWaterRuntimeSnapshot,
  ): OpenWaterRuntimeSnapshot => {
    const observed = copySnapshot(snapshot);
    const previous = lastObservedSnapshot ?? synchronizedSnapshot;
    if (requiresHistoryReset(previous, observed)) {
      pendingResetSnapshot = observed;
      foamTimeline.reset();
      synchronizedFoamBaseline = undefined;
      synchronizedLocalAnchor = undefined;
    }
    lastObservedSnapshot = observed;
    return observed;
  };

  const stageSample = (
    hostXNode: FloatNode,
    hostZNode: FloatNode,
  ): Vec4Node => {
    const worldX = hostXNode.add(uniforms.sampleOriginX);
    const worldZ = hostZNode.add(uniforms.sampleOriginZ);
    const primaryUv = fract(vec2(worldX, worldZ).div(tileSizeMetres));
    const rotatedX = worldX
      .mul(NON_PERIODIC_ROTATION_COS)
      .sub(worldZ.mul(NON_PERIODIC_ROTATION_SIN))
      .add(NON_PERIODIC_OFFSET_X);
    const rotatedZ = worldX
      .mul(NON_PERIODIC_ROTATION_SIN)
      .add(worldZ.mul(NON_PERIODIC_ROTATION_COS))
      .add(NON_PERIODIC_OFFSET_Z);
    const secondaryUv = fract(vec2(rotatedX, rotatedZ).div(tileSizeMetres));
    const blendArgumentA = worldX
      .mul(NON_PERIODIC_BLEND_K1)
      .add(worldZ.mul(NON_PERIODIC_BLEND_K2))
      .add(uniforms.phaseOffset);
    const blendArgumentB = worldX
      .mul(NON_PERIODIC_BLEND_K2)
      .sub(worldZ.mul(NON_PERIODIC_BLEND_K1).mul(0.7))
      .add(uniforms.phaseOffset.mul(1.3));
    const blendField = sin(blendArgumentA).mul(sin(blendArgumentB));
    const blendT = blendField.mul(0.5).add(0.5).sub(0.2).div(0.6).clamp(0, 1);
    const blendWeight = blendT.mul(blendT).mul(float(3).sub(blendT.mul(2)));
    return mix(
      texture(finalStageTexture, primaryUv),
      texture(finalStageTexture, secondaryUv),
      blendWeight,
    );
  };

  const sourceSample = (
    hostXNode: FloatNode,
    hostZNode: FloatNode,
  ): Vec4Node => {
    const relativeX = hostXNode.sub(uniforms.localSampleAnchorHostX);
    const relativeZ = hostZNode.sub(uniforms.localSampleAnchorHostZ);
    const localUv = vec2(relativeX, relativeZ)
      .div(LOCAL_FOAM_DIAMETER_METRES)
      .add(0.5);
    const inside = step(float(0), localUv.x)
      .mul(step(localUv.x, float(1)))
      .mul(step(float(0), localUv.y))
      .mul(step(localUv.y, float(1)));
    const distanceFromAnchor = length(vec2(relativeX, relativeZ));
    const fadeStart =
      INTERACTION_FIELD_RADIUS_METRES - INTERACTION_FIELD_EDGE_FADE_METRES;
    const fadeT = distanceFromAnchor
      .sub(fadeStart)
      .div(INTERACTION_FIELD_EDGE_FADE_METRES)
      .clamp(0, 1);
    const fieldFade = float(1).sub(
      fadeT.mul(fadeT).mul(float(3).sub(fadeT.mul(2))),
    );
    const local = texture(localFinalTexture, localUv)
      .mul(inside)
      .mul(fieldFade);
    const spectral = stageSample(hostXNode, hostZNode).a.clamp(0, 1);
    const wake = local.r.clamp(0, 1);
    const impact = local.g.clamp(0, 1);
    const heroBreaker = local.b.clamp(0, 1);
    const localUnion = saturatingUnionNode(
      saturatingUnionNode(wake, impact),
      heroBreaker,
    );
    const union = saturatingUnionNode(spectral, localUnion);
    return vec4(spectral, wake, impact, union);
  };
  const sourceFieldUvSample = (
    uvXNode: FloatNode,
    uvYNode: FloatNode,
  ): Vec4Node =>
    sourceSample(
      uniforms.localSampleAnchorHostX.add(
        uvXNode.sub(0.5).mul(LOCAL_FOAM_DIAMETER_METRES),
      ),
      uniforms.localSampleAnchorHostZ.add(
        uvYNode.sub(0.5).mul(LOCAL_FOAM_DIAMETER_METRES),
      ),
    );
  const heroBreakerFieldUvSample = (
    uvXNode: FloatNode,
    uvYNode: FloatNode,
  ): FloatNode => {
    const localX = uvXNode.sub(0.5).mul(LOCAL_FOAM_DIAMETER_METRES);
    const localZ = uvYNode.sub(0.5).mul(LOCAL_FOAM_DIAMETER_METRES);
    const anchorDistance = length(vec2(localX, localZ));
    const fadeStart =
      INTERACTION_FIELD_RADIUS_METRES - INTERACTION_FIELD_EDGE_FADE_METRES;
    const fadeT = anchorDistance
      .sub(fadeStart)
      .div(INTERACTION_FIELD_EDGE_FADE_METRES)
      .clamp(0, 1);
    const fieldFade = float(1).sub(
      fadeT.mul(fadeT).mul(float(3).sub(fadeT.mul(2))),
    );
    return texture(localFinalTexture, vec2(uvXNode, uvYNode))
      .b.mul(fieldFade)
      .clamp(0, 1);
  };
  const localSurfaceSample = (hostXNode: FloatNode, hostZNode: FloatNode) => {
    const relativeX = hostXNode.sub(uniforms.localSampleAnchorHostX);
    const relativeZ = hostZNode.sub(uniforms.localSampleAnchorHostZ);
    const localUv = vec2(relativeX, relativeZ)
      .div(LOCAL_FOAM_DIAMETER_METRES)
      .add(0.5);
    const inside = step(float(0), localUv.x)
      .mul(step(localUv.x, float(1)))
      .mul(step(float(0), localUv.y))
      .mul(step(localUv.y, float(1)));
    // Caustics invoke this sampler inside a receiver-eligibility branch. An
    // explicit level avoids implicit derivatives in non-uniform control flow;
    // the single-level field has no mip chain in any case.
    const correction = texture(localSurfaceTexture, localUv)
      .level(float(0))
      .mul(inside);
    return Object.freeze({
      height: correction.x,
      slopeX: correction.y,
      slopeZ: correction.z,
      velocityY: correction.w,
    });
  };

  const runtimeStateSink: RuntimeStateSink = Object.freeze({
    synchronize(
      snapshot: OpenWaterRuntimeSnapshot,
      interaction: LocalInteractionRenderSnapshot,
    ): void {
      if (disposed) {
        return;
      }
      const observed = observeSnapshot(snapshot);
      // The declared 128-tick ring is the bounded bridge between authoritative
      // 60 Hz controls/sources and a slower presentation cadence. Same-tick
      // writes replace, and a full ring overwrites only its oldest entry.
      foamTimeline.record({ snapshot: observed, interaction });
    },
    observe(snapshot: OpenWaterRuntimeSnapshot): void {
      if (disposed) {
        return;
      }
      observeSnapshot(snapshot);
    },
  });

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const result = operationQueue.then(async () => {
      assertNotDisposed(disposed);
      try {
        await operation();
      } catch (cause) {
        // A partial six-stage tick is not authoritative. Force the next call
        // through the reset path instead of continuing from an unknown field.
        synchronizedSnapshot = undefined;
        throw cause;
      }
    });
    operationQueue = result.catch(() => undefined);
    return result;
  };

  return Object.freeze({
    spectralStageTexture: finalStageTexture,
    localSourceHistoryTexture: localFinalTexture,
    sampleStages: stageSample,
    sampleSources: sourceSample,
    sampleLocalSurface: localSurfaceSample,
    sampleSourcesAtFieldUv: sourceFieldUvSample,
    sampleHeroBreakerFoamAtFieldUv: heroBreakerFieldUvSample,
    runtimeStateSink,
    synchronize(
      renderer: Renderer,
      snapshot: OpenWaterRuntimeSnapshot,
    ): Promise<void> {
      const requestedSnapshot = observeSnapshot(snapshot);
      // Copy only immutable references out of the fixed ring. This plan cannot
      // be changed by sink callbacks arriving between asynchronous dispatches.
      const foamPlan = foamTimeline.capture();
      const resetBoundary = pendingResetSnapshot;
      return enqueue(async () => {
        let previous = synchronizedSnapshot;
        const foamBaseline = synchronizedFoamBaseline;
        let appliedLocalAnchor = synchronizedLocalAnchor;
        let appliedState: FoamTimelineState = Object.freeze({
          snapshot: foamBaseline?.snapshot ?? requestedSnapshot,
          interaction:
            foamBaseline?.interaction ?? emptyInteraction(requestedSnapshot),
        });
        const stageTimelineState = (
          tick: number,
          fallbackSnapshot: OpenWaterRuntimeSnapshot,
          snapshotOverride?: OpenWaterRuntimeSnapshot,
        ): void => {
          // A sink snapshot labelled T is published by the Host's
          // before-integrate route and drives the T -> T+1 interval. Therefore
          // field tick T consumes the latest complete foam state through T-1.
          // Reset ticks deliberately retain their current reset snapshot.
          const selected = foamStateAtTick(
            foamPlan,
            foamBaseline,
            tick - 1,
            fallbackSnapshot,
          );
          appliedState =
            snapshotOverride === undefined
              ? selected
              : Object.freeze({
                  snapshot: snapshotOverride,
                  interaction: selected.interaction,
                });
          writeSnapshotUniforms(
            uniforms,
            appliedState.snapshot,
            tileSizeMetres,
          );
          const anchor = interactionAnchorWorld(appliedState.interaction);
          writeInteractionUniforms(
            uniforms,
            appliedState.interaction,
            interactionGeometryValues,
            interactionTimingValues,
            heroBreakerGeometryValues,
            heroBreakerTimingValues,
            heroBreakerArtValues,
          );
          writeLocalAnchorUniforms(
            uniforms,
            appliedState.snapshot,
            anchor,
            appliedLocalAnchor,
          );
        };
        const executeTimelineTick = async (
          tick: number,
          tickTime: number,
          tickSnapshot: OpenWaterRuntimeSnapshot,
          resetHistory: boolean,
          snapshotOverride?: OpenWaterRuntimeSnapshot,
        ): Promise<void> => {
          stageTimelineState(tick, tickSnapshot, snapshotOverride);
          await executeFixedTick(
            renderer,
            kernels,
            uniforms,
            tickTime,
            resetHistory,
          );
          appliedLocalAnchor = interactionAnchorWorld(appliedState.interaction);
        };

        if (
          resetBoundary !== undefined &&
          requiresHistoryReset(previous, resetBoundary)
        ) {
          const preparedReset = Object.freeze({
            ...resetBoundary,
            artisticControls: requestedSnapshot.artisticControls,
            controlRevision: requestedSnapshot.controlRevision,
          });
          await executeTimelineTick(
            preparedReset.tick,
            preparedReset.timeSeconds,
            preparedReset,
            true,
            preparedReset,
          );
          previous = preparedReset;
        }
        const reset = requiresHistoryReset(previous, requestedSnapshot);

        if (
          reset &&
          previous !== undefined &&
          requestedSnapshot.tick > previous.tick &&
          requestedSnapshot.timeSeconds >= previous.timeSeconds
        ) {
          for (
            let tick = previous.tick + 1;
            tick <= requestedSnapshot.tick;
            tick += 1
          ) {
            const remainingTicks = requestedSnapshot.tick - tick;
            const tickTime = Math.max(
              0,
              requestedSnapshot.timeSeconds - remainingTicks * fixedStepSeconds,
            );
            await executeTimelineTick(
              tick,
              tickTime,
              requestedSnapshot,
              tick === previous.tick + 1,
              tick === previous.tick + 1 ? requestedSnapshot : undefined,
            );
          }
        } else if (reset) {
          await executeTimelineTick(
            requestedSnapshot.tick,
            requestedSnapshot.timeSeconds,
            requestedSnapshot,
            true,
            requestedSnapshot,
          );
        } else if (
          previous !== undefined &&
          requestedSnapshot.tick > previous.tick
        ) {
          for (
            let tick = previous.tick + 1;
            tick <= requestedSnapshot.tick;
            tick += 1
          ) {
            const remainingTicks = requestedSnapshot.tick - tick;
            const tickTime = Math.max(
              0,
              requestedSnapshot.timeSeconds - remainingTicks * fixedStepSeconds,
            );
            await executeTimelineTick(tick, tickTime, requestedSnapshot, false);
          }
        }

        // Same-tick hot/sample state is always the requested state, while the
        // inclusive authoritative foam pair becomes the next tick baseline.
        writeSnapshotUniforms(uniforms, requestedSnapshot, tileSizeMetres);
        const currentState = foamStateAtTick(
          foamPlan,
          foamBaseline,
          requestedSnapshot.tick,
          requestedSnapshot,
        );

        if (appliedLocalAnchor !== undefined) {
          writeLocalSampleAnchorUniforms(
            uniforms,
            requestedSnapshot,
            appliedLocalAnchor,
          );
        }

        // Same-tick calls deliberately update only hot uniforms and world
        // phase. They never evolve persistent state a second time.
        synchronizedSnapshot = requestedSnapshot;
        if (foamTimeline.epoch() === foamPlan.epoch) {
          synchronizedLocalAnchor = appliedLocalAnchor;
          synchronizedFoamBaseline = Object.freeze({
            tick: requestedSnapshot.tick,
            snapshot: currentState.snapshot,
            interaction: currentState.interaction,
          });
          foamTimeline.consume(foamPlan, requestedSnapshot.tick);
        }
        if (pendingResetSnapshot === resetBoundary) {
          pendingResetSnapshot = undefined;
        }
      });
    },
    prewarm(
      renderer: Renderer,
      snapshot: OpenWaterRuntimeSnapshot,
    ): Promise<void> {
      const liveSnapshot = observeSnapshot(snapshot);
      const foamPlan = foamTimeline.capture();
      return enqueue(async () => {
        const foamBaseline = synchronizedFoamBaseline;
        renderer.initTexture(finalStageTexture);
        renderer.initTexture(stagingTexture);
        renderer.initTexture(localFinalTexture);
        renderer.initTexture(localStagingTexture);
        renderer.initTexture(localSurfaceTexture);
        writeSnapshotUniforms(uniforms, liveSnapshot, tileSizeMetres);
        const currentState = foamStateAtTick(
          foamPlan,
          foamBaseline,
          liveSnapshot.tick,
          liveSnapshot,
        );
        const interaction = currentState.interaction;
        const liveAnchor = interactionAnchorWorld(interaction);
        writeInteractionUniforms(
          uniforms,
          interaction,
          interactionGeometryValues,
          interactionTimingValues,
          heroBreakerGeometryValues,
          heroBreakerTimingValues,
          heroBreakerArtValues,
        );
        writeLocalAnchorUniforms(uniforms, liveSnapshot, liveAnchor, undefined);

        // The first reset tick reaches and compiles all six fixed routes. The
        // second reset tick overwrites both ping-pong paths from the same Host
        // state, leaving deterministic live content rather than warmup data.
        await executeFixedTick(
          renderer,
          kernels,
          uniforms,
          liveSnapshot.timeSeconds,
          true,
        );
        synchronizedLocalAnchor = liveAnchor;
        writeLocalAnchorUniforms(
          uniforms,
          liveSnapshot,
          liveAnchor,
          liveAnchor,
        );
        await executeFixedTick(
          renderer,
          kernels,
          uniforms,
          liveSnapshot.timeSeconds,
          true,
        );
        writeLocalSampleAnchorUniforms(uniforms, liveSnapshot, liveAnchor);
        synchronizedSnapshot = liveSnapshot;
        if (foamTimeline.epoch() === foamPlan.epoch) {
          synchronizedFoamBaseline = Object.freeze({
            tick: liveSnapshot.tick,
            snapshot: liveSnapshot,
            interaction,
          });
          foamTimeline.consume(foamPlan, liveSnapshot.tick);
        }
        lastObservedSnapshot = liveSnapshot;
        pendingResetSnapshot = undefined;
      });
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      kernels.generate.dispose();
      kernels.advect.dispose();
      kernels.diffuse.dispose();
      kernels.decay.dispose();
      kernels.reprojectLocal.dispose();
      kernels.resolveLocal.dispose();
      finalStageTexture.dispose();
      stagingTexture.dispose();
      localFinalTexture.dispose();
      localStagingTexture.dispose();
      localSurfaceTexture.dispose();
      pendingResetSnapshot = undefined;
      lastObservedSnapshot = undefined;
      synchronizedSnapshot = undefined;
      synchronizedFoamBaseline = undefined;
      synchronizedLocalAnchor = undefined;
      foamTimeline.reset();
    },
  });
}

function createFoamTimeline(capacity: number) {
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new RangeError(
      "The unified foam timeline requires a positive fixed capacity.",
    );
  }
  // These are the only structural timeline stores. The declared 128-tick
  // bound covers 60 Hz foam-state publication across the controlled 30 FPS
  // route; pressure overwrites the oldest tick and never grows a backing array.
  const ticks = new Float64Array(capacity);
  const sequences = new Float64Array(capacity);
  const snapshots = Array<OpenWaterRuntimeSnapshot | undefined>(capacity).fill(
    undefined,
  );
  const interactions = Array<LocalInteractionRenderSnapshot | undefined>(
    capacity,
  ).fill(undefined);
  let start = 0;
  let length = 0;
  let nextSequence = 1;
  let currentEpoch = 0;

  const reset = (): void => {
    snapshots.fill(undefined);
    interactions.fill(undefined);
    start = 0;
    length = 0;
    nextSequence = 1;
    currentEpoch += 1;
  };

  return Object.freeze({
    epoch(): number {
      return currentEpoch;
    },
    reset,
    record(state: FoamTimelineState): void {
      const tick = state.snapshot.tick;
      const immutableSnapshot = copySnapshot(state.snapshot);
      const immutable = copyInteraction(state.interaction);
      const sequence = nextSequence;
      nextSequence += 1;
      if (length > 0) {
        const newest = (start + length - 1) % capacity;
        if (ticks[newest] === tick) {
          snapshots[newest] = immutableSnapshot;
          interactions[newest] = immutable;
          sequences[newest] = sequence;
          return;
        }
      }
      const writeIndex =
        length < capacity ? (start + length) % capacity : start;
      ticks[writeIndex] = tick;
      sequences[writeIndex] = sequence;
      snapshots[writeIndex] = immutableSnapshot;
      interactions[writeIndex] = immutable;
      if (length < capacity) {
        length += 1;
      } else {
        start = (start + 1) % capacity;
      }
    },
    capture(): FoamTimelinePlan {
      const entries: FoamTimelineEntry[] = [];
      for (let offset = 0; offset < length; offset += 1) {
        const index = (start + offset) % capacity;
        const interaction = interactions[index];
        const snapshot = snapshots[index];
        if (interaction === undefined || snapshot === undefined) {
          continue;
        }
        entries.push(
          Object.freeze({
            tick: ticks[index] ?? 0,
            sequence: sequences[index] ?? 0,
            snapshot,
            interaction,
          }),
        );
      }
      return Object.freeze({
        epoch: currentEpoch,
        sequenceCeiling: nextSequence - 1,
        entries: Object.freeze(entries),
      });
    },
    consume(plan: FoamTimelinePlan, throughTick: number): void {
      if (plan.epoch !== currentEpoch) {
        return;
      }
      while (length > 0) {
        const sequence = sequences[start] ?? 0;
        const tick = ticks[start] ?? 0;
        if (sequence > plan.sequenceCeiling || tick > throughTick) {
          break;
        }
        interactions[start] = undefined;
        snapshots[start] = undefined;
        start = (start + 1) % capacity;
        length -= 1;
      }
    },
  });
}

function foamStateAtTick(
  plan: FoamTimelinePlan,
  baseline: SynchronizedFoamBaseline | undefined,
  tick: number,
  snapshot: OpenWaterRuntimeSnapshot,
): FoamTimelineState {
  const usableBaseline = baseline !== undefined && baseline.tick <= tick;
  let selectedTick = usableBaseline ? baseline.tick : Number.NEGATIVE_INFINITY;
  let selectedSnapshot = usableBaseline ? baseline.snapshot : undefined;
  let selectedInteraction = usableBaseline ? baseline.interaction : undefined;
  for (const entry of plan.entries) {
    if (entry.tick <= tick && entry.tick >= selectedTick) {
      selectedTick = entry.tick;
      selectedSnapshot = entry.snapshot;
      selectedInteraction = entry.interaction;
    }
  }
  return Object.freeze({
    snapshot: selectedSnapshot ?? snapshot,
    interaction: selectedInteraction ?? emptyInteraction(snapshot),
  });
}

function copyInteraction(
  interaction: LocalInteractionRenderSnapshot,
): LocalInteractionRenderSnapshot {
  return Object.freeze({
    revision: interaction.revision,
    anchorX: interaction.anchorX,
    anchorZ: interaction.anchorZ,
    impacts: Object.freeze(
      interaction.impacts.map((source) => Object.freeze({ ...source })),
    ),
  });
}

function createWhitecapTexture(
  resolution: number,
  name: string,
): StorageTexture {
  const result = new StorageTexture(resolution, resolution);
  result.name = name;
  result.format = RGBAFormat;
  result.type = HalfFloatType;
  result.wrapS = RepeatWrapping;
  result.wrapT = RepeatWrapping;
  result.minFilter = LinearFilter;
  result.magFilter = LinearFilter;
  result.generateMipmaps = false;
  (
    result as StorageTexture & {
      mipmapsAutoUpdate: boolean;
    }
  ).mipmapsAutoUpdate = false;
  result.needsUpdate = true;
  return result;
}

function createLocalFoamTexture(
  resolution: number,
  name: string,
): StorageTexture {
  const result = createWhitecapTexture(resolution, name);
  result.wrapS = ClampToEdgeWrapping;
  result.wrapT = ClampToEdgeWrapping;
  return result;
}

function createUnifiedFoamUniforms(
  interactionGeometryValues: Vector4[],
  interactionTimingValues: Vector4[],
  heroBreakerGeometryValues: Vector4[],
  heroBreakerTimingValues: Vector4[],
  heroBreakerArtValues: Vector4[],
): UnifiedFoamComputeUniforms {
  return {
    phaseOffset: uniform(0),
    timeSeconds: uniform(0),
    tick: uniform(0),
    timeScale: uniform(1),
    crestSharpness: uniform(1),
    whitecapAmount: uniform(0),
    foamPersistence: uniform(0),
    choppiness: uniform(1),
    sampleOriginX: uniform(0),
    sampleOriginZ: uniform(0),
    localSampleAnchorHostX: uniform(0),
    localSampleAnchorHostZ: uniform(0),
    localAnchorDeltaX: uniform(0),
    localAnchorDeltaZ: uniform(0),
    interactionCount: uniform(0, "int"),
    interactionGeometry: uniformArray<"vec4">(
      interactionGeometryValues,
      "vec4",
    ).setName("unifiedFoamInteractionGeometry"),
    interactionTiming: uniformArray<"vec4">(
      interactionTimingValues,
      "vec4",
    ).setName("unifiedFoamInteractionTiming"),
    heroBreakerCount: uniform(0, "int"),
    heroBreakerGeometry: uniformArray<"vec4">(
      heroBreakerGeometryValues,
      "vec4",
    ).setName("unifiedFoamHeroBreakerGeometry"),
    heroBreakerTiming: uniformArray<"vec4">(
      heroBreakerTimingValues,
      "vec4",
    ).setName("unifiedFoamHeroBreakerTiming"),
    heroBreakerArt: uniformArray<"vec4">(heroBreakerArtValues, "vec4").setName(
      "unifiedFoamHeroBreakerArt",
    ),
    resetHistory: uniform(1),
    bands: SPECTRAL_BANDS.map((band) => ({
      amplitude: uniform(band.amplitudeMetres),
      waveNumber: uniform((Math.PI * 2) / band.wavelengthMetres),
      angularFrequency: uniform((Math.PI * 2) / band.periodSeconds),
      directionX: uniform(Math.cos(band.baseDirectionRadians)),
      directionZ: uniform(Math.sin(band.baseDirectionRadians)),
    })),
  };
}

function createUnifiedFoamKernels(
  finalStageTexture: StorageTexture,
  stagingTexture: StorageTexture,
  localFinalTexture: StorageTexture,
  localStagingTexture: StorageTexture,
  localSurfaceTexture: StorageTexture,
  uniforms: UnifiedFoamComputeUniforms,
  resolution: number,
  tileSizeMetres: number,
  fixedStepSeconds: number,
): UnifiedFoamKernels {
  const texelCoordinate = () => {
    const x = instanceIndex.mod(resolution);
    const y = instanceIndex.div(resolution);
    return {
      coordinate: uvec2(x, y),
      uv: vec2(float(x).add(0.5), float(y).add(0.5)).div(resolution),
      worldX: float(x)
        .add(0.5)
        .mul(tileSizeMetres / resolution),
      worldZ: float(y)
        .add(0.5)
        .mul(tileSizeMetres / resolution),
    };
  };

  const generate = Fn(() => {
    const texel = texelCoordinate();
    const previous = texture(finalStageTexture, texel.uv);
    const history = uniforms.resetHistory
      .greaterThan(0.5)
      .select(0, previous.a);
    const generation = createGenerationNode(
      texel.worldX,
      texel.worldZ,
      uniforms,
    );
    textureStore(
      stagingTexture,
      texel.coordinate,
      vec4(generation, history, history, history),
    ).toWriteOnly();
  })().compute(resolution * resolution, [WORKGROUP_SIZE]);
  generate.name = "Real Water whitecaps generate A to B";

  const travelBand = uniforms.bands[2] ?? uniforms.bands[0];
  if (travelBand === undefined) {
    throw new Error("The spectral whitecap field requires four bands.");
  }
  const advect = Fn(() => {
    const texel = texelCoordinate();
    const current = texture(stagingTexture, texel.uv);
    const speed = uniforms.choppiness
      .mul(SPECTRAL_WHITECAP_ADVECTION_CHOPPINESS_SCALE)
      .add(SPECTRAL_WHITECAP_ADVECTION_BASE_METRES_PER_SECOND);
    const backtraceTexels = vec2(
      travelBand.directionX,
      travelBand.directionZ,
    ).mul(speed.mul((fixedStepSeconds * resolution) / tileSizeMetres));
    const sourceTexel = vec2(texel.coordinate).sub(backtraceTexels).toVar();
    const sourceBase = ivec2(floor(sourceTexel)).toVar();
    const sourceFraction = fract(sourceTexel);
    const wrap = (coordinate: IVec2Node): IVec2Node =>
      coordinate.add(ivec2(resolution)).mod(int(resolution));
    const history00 = textureLoad(stagingTexture, wrap(sourceBase)).g;
    const history10 = textureLoad(
      stagingTexture,
      wrap(sourceBase.add(ivec2(1, 0))),
    ).g;
    const history01 = textureLoad(
      stagingTexture,
      wrap(sourceBase.add(ivec2(0, 1))),
    ).g;
    const history11 = textureLoad(
      stagingTexture,
      wrap(sourceBase.add(ivec2(1, 1))),
    ).g;
    const advected = mix(
      mix(history00, history10, sourceFraction.x),
      mix(history01, history11, sourceFraction.x),
      sourceFraction.y,
    );
    textureStore(
      finalStageTexture,
      texel.coordinate,
      vec4(current.r, current.g, advected, advected),
    ).toWriteOnly();
  })().compute(resolution * resolution, [WORKGROUP_SIZE]);
  advect.name = "Real Water whitecaps advect B to A";

  const diffuse = Fn(() => {
    const texel = texelCoordinate();
    const current = texture(finalStageTexture, texel.uv);
    const crossTexel = vec2(
      travelBand.directionZ.mul(-1),
      travelBand.directionX,
    ).div(resolution);
    const diffused = current.b
      .mul(SPECTRAL_WHITECAP_DIFFUSION_CENTER_WEIGHT)
      .add(
        texture(finalStageTexture, texel.uv.add(crossTexel)).b.mul(
          SPECTRAL_WHITECAP_DIFFUSION_SIDE_WEIGHT,
        ),
      )
      .add(
        texture(finalStageTexture, texel.uv.sub(crossTexel)).b.mul(
          SPECTRAL_WHITECAP_DIFFUSION_SIDE_WEIGHT,
        ),
      );
    textureStore(
      stagingTexture,
      texel.coordinate,
      vec4(current.r, current.g, current.b, diffused),
    ).toWriteOnly();
  })().compute(resolution * resolution, [WORKGROUP_SIZE]);
  diffuse.name = "Real Water whitecaps diffuse A to B (3 tap)";

  const decay = Fn(() => {
    const texel = texelCoordinate();
    const current = texture(stagingTexture, texel.uv);
    const persistenceEnabled = step(
      float(SPECTRAL_WHITECAP_PERSISTENCE_EPSILON),
      uniforms.foamPersistence,
    );
    const halfLifeSeconds = uniforms.foamPersistence
      .mul(SPECTRAL_WHITECAP_HALF_LIFE_PERSISTENCE_SCALE)
      .add(SPECTRAL_WHITECAP_HALF_LIFE_BASE_SECONDS);
    const decayWeight = persistenceEnabled.mul(
      pow(2, float(-fixedStepSeconds).div(halfLifeSeconds)),
    );
    const decayedHistory = current.a.mul(decayWeight).clamp(0, 1);
    const finalDensity = float(1)
      .sub(float(1).sub(current.r).mul(float(1).sub(decayedHistory)))
      .clamp(0, 1);
    textureStore(
      finalStageTexture,
      texel.coordinate,
      vec4(current.r, current.g, current.b, finalDensity),
    ).toWriteOnly();
  })().compute(resolution * resolution, [WORKGROUP_SIZE]);
  decay.name = "Real Water whitecaps decay B to A";

  const localTexelCoordinate = () => {
    const x = instanceIndex.mod(resolution);
    const y = instanceIndex.div(resolution);
    const uv = vec2(float(x).add(0.5), float(y).add(0.5)).div(resolution);
    return {
      coordinate: uvec2(x, y),
      uv,
      localX: uv.x.sub(0.5).mul(LOCAL_FOAM_DIAMETER_METRES),
      localZ: uv.y.sub(0.5).mul(LOCAL_FOAM_DIAMETER_METRES),
    };
  };

  const reprojectLocal = Fn(() => {
    const texel = localTexelCoordinate();
    const speed = uniforms.choppiness
      .mul(SPECTRAL_WHITECAP_ADVECTION_CHOPPINESS_SCALE)
      .add(SPECTRAL_WHITECAP_ADVECTION_BASE_METRES_PER_SECOND);
    const flow = vec2(travelBand.directionX, travelBand.directionZ).mul(
      speed.mul(fixedStepSeconds),
    );
    // The current texel's absolute point is transformed into the previous
    // anchor-local frame before backtracing the ocean flow. Both anchor values
    // are differenced on the CPU, so billion-metre worlds never reach f32 GPU
    // subtraction. The inside mask prevents ClampToEdge from pulling a border
    // texel through a large anchor move.
    const sourceUv = texel.uv.add(
      vec2(uniforms.localAnchorDeltaX, uniforms.localAnchorDeltaZ)
        .sub(flow)
        .div(LOCAL_FOAM_DIAMETER_METRES),
    );
    const inside = step(float(0), sourceUv.x)
      .mul(step(sourceUv.x, float(1)))
      .mul(step(float(0), sourceUv.y))
      .mul(step(sourceUv.y, float(1)))
      .mul(float(1).sub(uniforms.resetHistory));
    const reprojected = texture(localFinalTexture, sourceUv).mul(inside);
    textureStore(
      localStagingTexture,
      texel.coordinate,
      reprojected,
    ).toWriteOnly();
  })().compute(resolution * resolution, [WORKGROUP_SIZE]);
  reprojectLocal.name = "Real Water unified foam reproject local A to B";

  const resolveLocal = Fn(() => {
    const texel = localTexelCoordinate();
    const crossTexel = vec2(
      travelBand.directionZ.mul(-1),
      travelBand.directionX,
    ).div(resolution);
    const diffused = texture(localStagingTexture, texel.uv)
      .rgb.mul(SPECTRAL_WHITECAP_DIFFUSION_CENTER_WEIGHT)
      .add(
        texture(localStagingTexture, texel.uv.add(crossTexel)).rgb.mul(
          SPECTRAL_WHITECAP_DIFFUSION_SIDE_WEIGHT,
        ),
      )
      .add(
        texture(localStagingTexture, texel.uv.sub(crossTexel)).rgb.mul(
          SPECTRAL_WHITECAP_DIFFUSION_SIDE_WEIGHT,
        ),
      );
    const persistenceEnabled = step(
      float(SPECTRAL_WHITECAP_PERSISTENCE_EPSILON),
      uniforms.foamPersistence,
    );
    const halfLifeSeconds = uniforms.foamPersistence
      .mul(SPECTRAL_WHITECAP_HALF_LIFE_PERSISTENCE_SCALE)
      .add(SPECTRAL_WHITECAP_HALF_LIFE_BASE_SECONDS);
    const decayWeight = persistenceEnabled.mul(
      pow(2, float(-fixedStepSeconds).div(halfLifeSeconds)),
    );
    const history = diffused.mul(decayWeight).clamp(0, 1);
    const generated = createLocalGenerationAndSurfaceNode(
      texel.localX,
      texel.localZ,
      uniforms,
      localSurfaceTexture,
      texel.coordinate,
    );
    const wake = saturatingUnionNode(history.x, generated.x);
    const impact = saturatingUnionNode(history.y, generated.y);
    const heroBreaker = saturatingUnionNode(history.z, generated.z);
    const localUnion = saturatingUnionNode(
      saturatingUnionNode(wake, impact),
      heroBreaker,
    );
    textureStore(
      localFinalTexture,
      texel.coordinate,
      vec4(wake, impact, heroBreaker, localUnion),
    ).toWriteOnly();
  })().compute(resolution * resolution, [WORKGROUP_SIZE]);
  resolveLocal.name = "Real Water unified foam resolve local B to A";

  return {
    generate,
    advect,
    diffuse,
    decay,
    reprojectLocal,
    resolveLocal,
  };
}

function saturatingUnionNode(left: FloatNode, right: FloatNode): FloatNode {
  return float(1)
    .sub(float(1).sub(left).mul(float(1).sub(right)))
    .clamp(0, 1);
}

function createLocalGenerationAndSurfaceNode(
  localX: FloatNode,
  localZ: FloatNode,
  uniforms: UnifiedFoamComputeUniforms,
  localSurfaceTexture: StorageTexture,
  coordinate: UVec2Node,
) {
  return Fn(() => {
    const wake = float(0).toVar();
    const impact = float(0).toVar();
    const heroBreaker = float(0).toVar();
    // This is the texture form of local-interaction.ts's analytic correction.
    // Foam and surface output deliberately share the descriptor windows and
    // phases below so the two GPU representations cannot drift independently.
    const surfaceCorrection = vec4(0).toVar();
    Loop(
      {
        start: 0,
        end: MAX_ACTIVE_DISTURBANCES,
        type: "int",
        condition: "<",
      },
      ({ i }) => {
        If(i.lessThan(uniforms.interactionCount), () => {
          const descriptor = vec4(uniforms.interactionGeometry.element(i));
          const timing = vec4(uniforms.interactionTiming.element(i));
          const dx = localX.sub(descriptor.x);
          const dz = localZ.sub(descriptor.y);
          const radius = descriptor.z.max(MIN_RADIAL_IMPACT_RADIUS_METRES);
          const amplitude = abs(descriptor.w).clamp(0, 4);
          const kind = timing.y;
          const radialKind = float(1).sub(step(0.5, kind));
          const directionalKind = step(0.5, kind);
          const propellerKind = step(1.5, kind);
          const age = uniforms.timeSeconds.sub(timing.x);

          const distance = length(vec2(dx, dz));
          const normalizedRadius = distance.div(radius);
          const progress = age.div(RADIAL_IMPACT_LIFETIME_SECONDS).clamp(0, 1);
          const remaining = float(1).sub(progress);
          const decay = remaining.mul(remaining);
          const radialT = normalizedRadius.clamp(0, 1);
          const radialWindow = float(1).sub(
            radialT.mul(radialT).mul(float(3).sub(radialT.mul(2))),
          );
          const radialWindowDerivative = radialT
            .mul(float(1).sub(radialT))
            .mul(-6);
          const radialPhase = normalizedRadius
            .sub(progress.mul(2))
            .mul(Math.PI);
          const radialCosine = cos(radialPhase);
          const radialSine = sin(radialPhase);
          const ringEnergy = abs(radialCosine);
          const radialActive = step(0, age)
            .mul(float(1).sub(step(RADIAL_IMPACT_LIFETIME_SECONDS, age)))
            .mul(float(1).sub(step(1, normalizedRadius)))
            .mul(radialKind);
          const radialHeight = descriptor.w
            .mul(decay)
            .mul(radialCosine)
            .mul(radialWindow)
            .mul(radialActive);
          const radialDerivativeRadius = descriptor.w
            .mul(decay)
            .mul(
              radialSine
                .mul(-Math.PI)
                .mul(radialWindow)
                .add(radialCosine.mul(radialWindowDerivative)),
            )
            .div(radius)
            .mul(radialActive);
          const inverseDistance = float(1).div(distance.max(1e-5));
          const radialVelocity = descriptor.w
            .mul(radialWindow)
            .mul(
              remaining
                .mul(-2 / RADIAL_IMPACT_LIFETIME_SECONDS)
                .mul(radialCosine)
                .add(
                  decay
                    .mul((2 * Math.PI) / RADIAL_IMPACT_LIFETIME_SECONDS)
                    .mul(radialSine),
                ),
            )
            .mul(radialActive);
          surfaceCorrection.x.addAssign(radialHeight);
          surfaceCorrection.y.addAssign(
            radialDerivativeRadius.mul(dx).mul(inverseDistance),
          );
          surfaceCorrection.z.addAssign(
            radialDerivativeRadius.mul(dz).mul(inverseDistance),
          );
          surfaceCorrection.w.addAssign(radialVelocity);
          const radialGeneration = amplitude
            .mul(0.65)
            .mul(decay)
            .mul(radialWindow)
            .mul(ringEnergy)
            .mul(radialActive)
            .clamp(0, 1);
          impact.addAssign(
            radialGeneration.mul(float(1).sub(impact)).clamp(0, 1),
          );

          const directionX = timing.z;
          const directionZ = timing.w;
          const along = dx.mul(directionX).add(dz.mul(directionZ));
          const lateral = dx.mul(directionZ).mul(-1).add(dz.mul(directionX));
          const wakeLength = radius.mul(
            mix(
              float(DIRECTIONAL_WAKE_LENGTH_RADIUS_MULTIPLIER),
              float(PROPELLER_WASH_LENGTH_RADIUS_MULTIPLIER),
              propellerKind,
            ),
          );
          const wakeWidth = radius.mul(
            mix(
              float(DIRECTIONAL_WAKE_WIDTH_RADIUS_MULTIPLIER),
              float(PROPELLER_WASH_WIDTH_RADIUS_MULTIPLIER),
              propellerKind,
            ),
          );
          const alongT = along.div(wakeLength).clamp(0, 1);
          const lateralT = abs(lateral).div(wakeWidth).clamp(0, 1);
          const longitudinalWindow = float(1).sub(
            alongT.mul(alongT).mul(float(3).sub(alongT.mul(2))),
          );
          const lateralWindow = float(1).sub(
            lateralT.mul(lateralT).mul(float(3).sub(lateralT.mul(2))),
          );
          const longitudinalDerivative = alongT
            .mul(float(1).sub(alongT))
            .mul(-6)
            .div(wakeLength);
          const lateralDerivative = lateralT
            .mul(float(1).sub(lateralT))
            .mul(-6)
            .div(wakeWidth);
          const persistent = float(1).sub(
            step(PERSISTENT_BODY_WAKE_START_TIME_SECONDS + 1, timing.x),
          );
          const lifetimeActive = step(0, age).mul(
            float(1).sub(step(RADIAL_IMPACT_LIFETIME_SECONDS, age)),
          );
          const directionalActive = persistent
            .max(lifetimeActive)
            .mul(step(0, along))
            .mul(float(1).sub(step(1, along.div(wakeLength))))
            .mul(float(1).sub(step(1, abs(lateral).div(wakeWidth))))
            .mul(directionalKind);
          const directionalDecay = mix(decay, float(1), persistent);
          const directionalDecayDerivative = mix(
            remaining.mul(-2 / RADIAL_IMPACT_LIFETIME_SECONDS),
            float(0),
            persistent,
          );
          const spatialRadians = mix(
            float(DIRECTIONAL_WAKE_SPATIAL_RADIANS),
            float(PROPELLER_WASH_SPATIAL_RADIANS),
            propellerKind,
          );
          const temporalFrequency = mix(
            float(DIRECTIONAL_WAKE_TEMPORAL_RADIANS_PER_SECOND),
            float(PROPELLER_WASH_TEMPORAL_RADIANS_PER_SECOND),
            propellerKind,
          );
          const spatialFrequency = spatialRadians.div(radius);
          const wakePhase = along
            .mul(spatialFrequency)
            .sub(uniforms.timeSeconds.mul(temporalFrequency));
          const directionalCosine = cos(wakePhase);
          const directionalSine = sin(wakePhase);
          const wakeEnergy = abs(directionalCosine);
          const heightScale = mix(
            float(DIRECTIONAL_WAKE_HEIGHT_SCALE),
            float(PROPELLER_WASH_HEIGHT_SCALE),
            propellerKind,
          );
          const scaledAmplitude = descriptor.w.mul(heightScale);
          const directionalHeight = scaledAmplitude
            .mul(directionalDecay)
            .mul(directionalCosine)
            .mul(longitudinalWindow)
            .mul(lateralWindow)
            .mul(directionalActive);
          const derivativeAlong = scaledAmplitude
            .mul(directionalDecay)
            .mul(lateralWindow)
            .mul(
              longitudinalDerivative
                .mul(directionalCosine)
                .sub(
                  longitudinalWindow.mul(directionalSine).mul(spatialFrequency),
                ),
            )
            .mul(directionalActive);
          const lateralSign = step(0, lateral).mul(2).sub(1);
          const derivativeLateral = scaledAmplitude
            .mul(directionalDecay)
            .mul(directionalCosine)
            .mul(longitudinalWindow)
            .mul(lateralDerivative)
            .mul(lateralSign)
            .mul(directionalActive);
          const directionalVelocity = scaledAmplitude
            .mul(longitudinalWindow)
            .mul(lateralWindow)
            .mul(
              directionalDecayDerivative
                .mul(directionalCosine)
                .add(
                  directionalDecay.mul(temporalFrequency).mul(directionalSine),
                ),
            )
            .mul(directionalActive);
          surfaceCorrection.x.addAssign(directionalHeight);
          surfaceCorrection.y.addAssign(
            derivativeAlong
              .mul(directionX)
              .sub(derivativeLateral.mul(directionZ)),
          );
          surfaceCorrection.z.addAssign(
            derivativeAlong
              .mul(directionZ)
              .add(derivativeLateral.mul(directionX)),
          );
          surfaceCorrection.w.addAssign(directionalVelocity);
          const wakeGeneration = amplitude
            .mul(heightScale)
            .mul(directionalDecay)
            .mul(longitudinalWindow)
            .mul(lateralWindow)
            .mul(wakeEnergy.mul(0.65).add(0.35))
            .mul(directionalActive)
            .clamp(0, 1);
          wake.addAssign(wakeGeneration.mul(float(1).sub(wake)).clamp(0, 1));
        });
      },
    );
    // TSL form of hero-breaker.ts's authored CPU evaluator. This fixed 8-slot
    // bank gives deformation, caustics, and dedicated foam one profile source.
    Loop(
      {
        start: 0,
        end: MAX_ACTIVE_HERO_BREAKERS,
        type: "int",
        condition: "<",
      },
      ({ i }) => {
        If(i.lessThan(uniforms.heroBreakerCount), () => {
          const descriptor = vec4(uniforms.heroBreakerGeometry.element(i));
          const timing = vec4(uniforms.heroBreakerTiming.element(i));
          const art = vec4(uniforms.heroBreakerArt.element(i));
          const directionX = timing.z;
          const directionZ = timing.w;
          const dx = localX.sub(descriptor.x);
          const dz = localZ.sub(descriptor.y);
          const along = dx.mul(directionX).add(dz.mul(directionZ));
          const lateral = dx.mul(directionZ).mul(-1).add(dz.mul(directionX));
          const radius = descriptor.z;
          const lifetimeTicks = timing.y.max(1);
          const ageTicks = uniforms.tick.sub(timing.x);
          const progress = ageTicks.div(lifetimeTicks).clamp(0, 1);
          const active = step(0, ageTicks).mul(
            float(1).sub(step(lifetimeTicks, ageTicks)),
          );
          const attackT = progress
            .div(HERO_BREAKER_ATTACK_FRACTION)
            .clamp(0, 1);
          const attack = attackT.mul(attackT).mul(float(3).sub(attackT.mul(2)));
          const attackDerivative = attackT
            .mul(float(1).sub(attackT))
            .mul(6 / HERO_BREAKER_ATTACK_FRACTION);
          const releaseDuration = 1 - HERO_BREAKER_RELEASE_START_FRACTION;
          const releaseT = progress
            .sub(HERO_BREAKER_RELEASE_START_FRACTION)
            .div(releaseDuration)
            .clamp(0, 1);
          const release = float(1).sub(
            releaseT.mul(releaseT).mul(float(3).sub(releaseT.mul(2))),
          );
          const releaseDerivative = releaseT
            .mul(float(1).sub(releaseT))
            .mul(-6 / releaseDuration);
          const envelope = attack.mul(release);
          const envelopeDerivative = attackDerivative
            .mul(release)
            .add(attack.mul(releaseDerivative));
          const lateralWidth = radius.mul(HERO_BREAKER_LATERAL_WIDTH_RADII);
          const lateralT = abs(lateral).div(lateralWidth);
          const clampedLateralT = lateralT.clamp(0, 1);
          const lateralWindow = float(1).sub(
            clampedLateralT
              .mul(clampedLateralT)
              .mul(float(3).sub(clampedLateralT.mul(2))),
          );
          const lateralActive = float(1).sub(step(1, lateralT));
          const lateralSign = step(0, lateral).mul(2).sub(1);
          const lateralDerivative = lateralT
            .mul(float(1).sub(lateralT))
            .mul(-6)
            .div(lateralWidth)
            .mul(lateralSign)
            .mul(lateralActive);
          const crestCenter = float(
            HERO_BREAKER_INITIAL_CREST_CENTER_RADII,
          ).add(progress.mul(HERO_BREAKER_FORWARD_TRAVEL_RADII));
          const localAlong = along.div(radius).sub(crestCenter);
          const crestWidth = mix(
            float(HERO_BREAKER_BACK_WIDTH_RADII),
            float(HERO_BREAKER_FRONT_WIDTH_RADII),
            step(0, localAlong),
          );
          const crestNormalized = localAlong.div(crestWidth);
          const crest = exp(crestNormalized.mul(crestNormalized).mul(-0.5));
          const crestDerivative = localAlong
            .mul(crest)
            .mul(-1)
            .div(crestWidth.mul(crestWidth));
          const hollowAlong = localAlong.sub(
            HERO_BREAKER_FORWARD_HOLLOW_CENTER_RADII,
          );
          const hollowNormalized = hollowAlong.div(
            HERO_BREAKER_FORWARD_HOLLOW_WIDTH_RADII,
          );
          const forwardHollow = exp(
            hollowNormalized.mul(hollowNormalized).mul(-0.5),
          );
          const forwardHollowDerivative = hollowAlong
            .mul(forwardHollow)
            .mul(-1)
            .div(
              HERO_BREAKER_FORWARD_HOLLOW_WIDTH_RADII *
                HERO_BREAKER_FORWARD_HOLLOW_WIDTH_RADII,
            );
          const shape = crest.sub(
            forwardHollow.mul(HERO_BREAKER_FORWARD_HOLLOW_DEPTH),
          );
          const shapeDerivative = crestDerivative.sub(
            forwardHollowDerivative.mul(HERO_BREAKER_FORWARD_HOLLOW_DEPTH),
          );
          const amplitudeEnvelope = descriptor.w.mul(envelope);
          const height = amplitudeEnvelope
            .mul(lateralWindow)
            .mul(shape)
            .mul(lateralActive)
            .mul(active);
          const slopeAlong = amplitudeEnvelope
            .mul(lateralWindow)
            .mul(shapeDerivative)
            .div(radius)
            .mul(lateralActive)
            .mul(active);
          const slopeLateral = amplitudeEnvelope
            .mul(lateralDerivative)
            .mul(shape)
            .mul(active);
          const velocityY = descriptor.w
            .mul(lateralWindow)
            .mul(
              envelopeDerivative
                .mul(shape)
                .sub(
                  envelope
                    .mul(shapeDerivative)
                    .mul(HERO_BREAKER_FORWARD_TRAVEL_RADII),
                ),
            )
            .mul(HERO_BREAKER_FIXED_TICKS_PER_SECOND)
            .div(lifetimeTicks)
            .mul(lateralActive)
            .mul(active);
          surfaceCorrection.x.addAssign(height);
          surfaceCorrection.y.addAssign(
            slopeAlong.mul(directionX).sub(slopeLateral.mul(directionZ)),
          );
          surfaceCorrection.z.addAssign(
            slopeAlong.mul(directionZ).add(slopeLateral.mul(directionX)),
          );
          surfaceCorrection.w.addAssign(velocityY);
          const generatedFoam = art.x
            .clamp(0, 1)
            .mul(sqrt(envelope))
            .mul(lateralWindow)
            .mul(crest.mul(0.72).add(forwardHollow.mul(0.58)).clamp(0, 1))
            .mul(lateralActive)
            .mul(active)
            .clamp(0, 1);
          heroBreaker.addAssign(
            generatedFoam.mul(float(1).sub(heroBreaker)).clamp(0, 1),
          );
        });
      },
    );
    const anchorDistance = length(vec2(localX, localZ));
    const fadeStart =
      INTERACTION_FIELD_RADIUS_METRES - INTERACTION_FIELD_EDGE_FADE_METRES;
    const fadeT = anchorDistance
      .sub(fadeStart)
      .div(INTERACTION_FIELD_EDGE_FADE_METRES)
      .clamp(0, 1);
    const fieldFade = float(1).sub(
      fadeT.mul(fadeT).mul(float(3).sub(fadeT.mul(2))),
    );
    const fieldFadeDerivative = fadeT
      .mul(float(1).sub(fadeT))
      .mul(-6 / INTERACTION_FIELD_EDGE_FADE_METRES);
    const inverseAnchorDistance = float(1).div(anchorDistance.max(1e-5));
    textureStore(
      localSurfaceTexture,
      coordinate,
      vec4(
        surfaceCorrection.x.mul(fieldFade),
        surfaceCorrection.y
          .mul(fieldFade)
          .add(
            surfaceCorrection.x
              .mul(fieldFadeDerivative)
              .mul(localX)
              .mul(inverseAnchorDistance),
          ),
        surfaceCorrection.z
          .mul(fieldFade)
          .add(
            surfaceCorrection.x
              .mul(fieldFadeDerivative)
              .mul(localZ)
              .mul(inverseAnchorDistance),
          ),
        surfaceCorrection.w.mul(fieldFade),
      ),
    ).toWriteOnly();
    return vec3(wake, impact, heroBreaker);
  })();
}

function createGenerationNode(
  worldX: FloatNode,
  worldZ: FloatNode,
  uniforms: UnifiedFoamComputeUniforms,
): FloatNode {
  const contributions = uniforms.bands.map((band) => {
    const phase = worldX
      .mul(band.waveNumber)
      .mul(band.directionX)
      .add(worldZ.mul(band.waveNumber).mul(band.directionZ))
      .add(uniforms.phaseOffset)
      .sub(
        uniforms.timeSeconds.mul(band.angularFrequency).mul(uniforms.timeScale),
      );
    const secondHarmonic = uniforms.crestSharpness.mul(
      SPECTRAL_WHITECAP_SECOND_HARMONIC_SCALE,
    );
    const wave = sin(phase).sub(secondHarmonic.mul(sin(phase.mul(2))));
    const derivative = cos(phase).sub(
      secondHarmonic.mul(2).mul(cos(phase.mul(2))),
    );
    const steepness = abs(band.amplitude.mul(band.waveNumber).mul(derivative));
    return steepness.mul(
      wave
        .max(0)
        .mul(SPECTRAL_WHITECAP_CREST_POSITIVE_WEIGHT)
        .add(SPECTRAL_WHITECAP_CREST_BASE_WEIGHT),
    );
  });
  const first = contributions[0];
  if (first === undefined) {
    throw new Error("The spectral whitecap field requires four bands.");
  }
  const crestEnergy = contributions
    .slice(1)
    .reduce((sum, contribution) => sum.add(contribution), first);
  const amount = uniforms.whitecapAmount.div(2).clamp(0, 1);
  const threshold = float(SPECTRAL_WHITECAP_THRESHOLD_MAX).add(
    float(SPECTRAL_WHITECAP_THRESHOLD_MIN)
      .sub(SPECTRAL_WHITECAP_THRESHOLD_MAX)
      .mul(amount),
  );
  const formed = smoothstep(
    threshold,
    threshold.add(SPECTRAL_WHITECAP_THRESHOLD_RAMP),
    crestEnergy,
  );
  const breakupA = worldX
    .mul(SPECTRAL_WHITECAP_BREAKUP_PRIMARY_X)
    .add(worldZ.mul(SPECTRAL_WHITECAP_BREAKUP_PRIMARY_Z))
    .add(
      uniforms.phaseOffset.mul(SPECTRAL_WHITECAP_BREAKUP_PRIMARY_PHASE_SCALE),
    );
  const breakupB = worldX
    .mul(SPECTRAL_WHITECAP_BREAKUP_SECONDARY_X)
    .add(worldZ.mul(SPECTRAL_WHITECAP_BREAKUP_SECONDARY_Z))
    .sub(
      uniforms.phaseOffset.mul(SPECTRAL_WHITECAP_BREAKUP_SECONDARY_PHASE_SCALE),
    );
  const breakup = abs(sin(breakupA).mul(sin(breakupB)))
    .mul(SPECTRAL_WHITECAP_BREAKUP_RANGE)
    .add(SPECTRAL_WHITECAP_BREAKUP_BASE);
  return formed
    .mul(breakup)
    .mul(uniforms.whitecapAmount.clamp(0, 1))
    .clamp(0, 1);
}

async function executeFixedTick(
  renderer: Renderer,
  kernels: UnifiedFoamKernels,
  uniforms: UnifiedFoamComputeUniforms,
  timeSeconds: number,
  resetHistory: boolean,
): Promise<void> {
  uniforms.timeSeconds.value = timeSeconds;
  uniforms.resetHistory.value = resetHistory ? 1 : 0;
  await renderer.computeAsync(kernels.generate);
  await renderer.computeAsync(kernels.advect);
  await renderer.computeAsync(kernels.diffuse);
  await renderer.computeAsync(kernels.decay);
  await renderer.computeAsync(kernels.reprojectLocal);
  await renderer.computeAsync(kernels.resolveLocal);
  uniforms.resetHistory.value = 0;
}

function writeSnapshotUniforms(
  uniforms: UnifiedFoamComputeUniforms,
  snapshot: OpenWaterRuntimeSnapshot,
  tileSizeMetres: number,
): void {
  uniforms.phaseOffset.value = spectralBandPhaseOffset(snapshot.seed);
  uniforms.timeSeconds.value = snapshot.timeSeconds;
  uniforms.tick.value = snapshot.tick;
  uniforms.timeScale.value = snapshot.artisticControls.timeScale;
  uniforms.crestSharpness.value = snapshot.artisticControls.crestSharpness;
  uniforms.whitecapAmount.value = snapshot.artisticControls.whitecapAmount;
  uniforms.foamPersistence.value = snapshot.artisticControls.foamPersistence;
  uniforms.choppiness.value = snapshot.artisticControls.choppiness;
  uniforms.sampleOriginX.value = wrapWorldCoordinate(
    snapshot.originX,
    tileSizeMetres,
  );
  uniforms.sampleOriginZ.value = wrapWorldCoordinate(
    snapshot.originZ,
    tileSizeMetres,
  );

  const preparedBands = prepareSpectralBands(snapshot.artisticControls);
  for (let index = 0; index < uniforms.bands.length; index += 1) {
    const target = uniforms.bands[index];
    const source = preparedBands[index];
    if (target === undefined || source === undefined) {
      throw new Error("The spectral whitecap field requires four bands.");
    }
    target.amplitude.value = source.amplitude;
    target.waveNumber.value = source.waveNumber;
    target.angularFrequency.value = source.angularFrequency;
    target.directionX.value = source.directionX;
    target.directionZ.value = source.directionZ;
  }
}

function writeInteractionUniforms(
  uniforms: UnifiedFoamComputeUniforms,
  interaction: LocalInteractionRenderSnapshot,
  geometryValues: Vector4[],
  timingValues: Vector4[],
  heroBreakerGeometryValues: Vector4[],
  heroBreakerTimingValues: Vector4[],
  heroBreakerArtValues: Vector4[],
): void {
  const sourceCount = Math.min(
    interaction.impacts.length,
    MAX_ACTIVE_DISTURBANCES,
  );
  let count = 0;
  let heroBreakerCount = 0;
  for (let index = 0; index < sourceCount; index += 1) {
    const source = interaction.impacts[index];
    if (source === undefined) {
      continue;
    }
    if (source.kind === "hero-breaker") {
      if (heroBreakerCount >= MAX_ACTIVE_HERO_BREAKERS) {
        throw new Error("Unified foam Hero Breaker capacity was exceeded.");
      }
      heroBreakerGeometryValues[heroBreakerCount]?.set(
        source.x - interaction.anchorX,
        source.z - interaction.anchorZ,
        source.radius,
        source.amplitude,
      );
      heroBreakerTimingValues[heroBreakerCount]?.set(
        source.startTick - (interaction.revision === -1 ? 1 : 0),
        source.lifetimeTicks,
        source.directionX,
        source.directionZ,
      );
      heroBreakerArtValues[heroBreakerCount]?.set(
        source.foamAmount,
        source.sprayAmount,
        0,
        0,
      );
      heroBreakerCount += 1;
      continue;
    }
    const geometry = geometryValues[count];
    const timing = timingValues[count];
    if (geometry === undefined || timing === undefined) {
      throw new Error("Unified foam interaction scratch is undersized.");
    }
    // Both operands are JavaScript doubles. Only the small anchor-relative
    // result crosses the uniform boundary.
    geometry.set(
      source.x - interaction.anchorX,
      source.z - interaction.anchorZ,
      source.radius,
      source.amplitude,
    );
    timing.set(
      source.startTimeSeconds,
      localInteractionKindValue(source.kind),
      source.directionX,
      source.directionZ,
    );
    count += 1;
  }
  uniforms.interactionCount.value = count;
  uniforms.heroBreakerCount.value = heroBreakerCount;
}

function writeLocalAnchorUniforms(
  uniforms: UnifiedFoamComputeUniforms,
  snapshot: OpenWaterRuntimeSnapshot,
  currentAnchor: Readonly<{ readonly x: number; readonly z: number }>,
  previousAnchor:
    Readonly<{ readonly x: number; readonly z: number }> | undefined,
): void {
  uniforms.localAnchorDeltaX.value =
    previousAnchor === undefined ? 0 : currentAnchor.x - previousAnchor.x;
  uniforms.localAnchorDeltaZ.value =
    previousAnchor === undefined ? 0 : currentAnchor.z - previousAnchor.z;
  writeLocalSampleAnchorUniforms(uniforms, snapshot, currentAnchor);
}

function writeLocalSampleAnchorUniforms(
  uniforms: UnifiedFoamComputeUniforms,
  snapshot: OpenWaterRuntimeSnapshot,
  anchor: Readonly<{ readonly x: number; readonly z: number }>,
): void {
  // The absolute subtraction stays on the CPU. Host-frame shader coordinates
  // therefore remain precise even when the floating origin is near 1e9 m.
  uniforms.localSampleAnchorHostX.value = anchor.x - snapshot.originX;
  uniforms.localSampleAnchorHostZ.value = anchor.z - snapshot.originZ;
}

function interactionAnchorWorld(
  interaction: LocalInteractionRenderSnapshot,
): Readonly<{ readonly x: number; readonly z: number }> {
  return Object.freeze({ x: interaction.anchorX, z: interaction.anchorZ });
}

function emptyInteraction(
  snapshot: OpenWaterRuntimeSnapshot,
): LocalInteractionRenderSnapshot {
  return Object.freeze({
    revision: 0,
    anchorX: snapshot.interactionAnchor.x + snapshot.originX,
    anchorZ: snapshot.interactionAnchor.z + snapshot.originZ,
    impacts: Object.freeze([]),
  });
}

function requiresHistoryReset(
  previous: OpenWaterRuntimeSnapshot | undefined,
  next: OpenWaterRuntimeSnapshot,
): boolean {
  return (
    previous === undefined ||
    next.seed !== previous.seed ||
    next.simulationResetRevision !== previous.simulationResetRevision ||
    next.seaStateCutRevision !== previous.seaStateCutRevision ||
    next.tick < previous.tick ||
    next.timeSeconds < previous.timeSeconds
  );
}

function copySnapshot(
  snapshot: OpenWaterRuntimeSnapshot,
): OpenWaterRuntimeSnapshot {
  return Object.freeze({
    ...snapshot,
    artisticControls: Object.freeze({ ...snapshot.artisticControls }),
    interactionAnchor: Object.freeze({ ...snapshot.interactionAnchor }),
  });
}

function wrapWorldCoordinate(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function assertNotDisposed(disposed: boolean): void {
  if (disposed) {
    throw new Error("The spectral whitecap field has been disposed.");
  }
}

function localInteractionKindValue(
  kind: "radial-impact" | "directional-wake" | "propeller-wash",
): number {
  switch (kind) {
    case "radial-impact":
      return LOCAL_INTERACTION_KIND_RADIAL_IMPACT;
    case "directional-wake":
      return LOCAL_INTERACTION_KIND_DIRECTIONAL_WAKE;
    case "propeller-wash":
      return LOCAL_INTERACTION_KIND_PROPELLER_WASH;
    default:
      throw new Error("Unified foam received an unknown interaction kind.");
  }
}
