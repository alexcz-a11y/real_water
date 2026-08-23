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
  step,
  texture,
  textureLoad,
  textureStore,
  uniform,
  uniformArray,
  uvec2,
  vec2,
  vec4,
} from "three/tsl";
import {
  INTERACTION_FIELD_EDGE_FADE_METRES,
  INTERACTION_FIELD_RADIUS_METRES,
  MAX_ACTIVE_DISTURBANCES,
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
type Vec4Node = Node<"vec4">;
type FloatUniform = UniformNode<"float", number>;
type IntUniform = UniformNode<"int", number>;

const LOCAL_FOAM_DIAMETER_METRES = INTERACTION_FIELD_RADIUS_METRES * 2;

interface WhitecapComputeUniforms {
  readonly phaseOffset: FloatUniform;
  readonly timeSeconds: FloatUniform;
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

interface WhitecapKernels {
  readonly generate: ComputeNode;
  readonly advect: ComputeNode;
  readonly diffuse: ComputeNode;
  readonly decay: ComputeNode;
  readonly reprojectLocal: ComputeNode;
  readonly resolveLocal: ComputeNode;
}

export interface SpectralWhitecapField {
  /** Stable final-stage texture. RGBA is generation/history/advection/decay. */
  readonly texture: StorageTexture;
  /** Stable anchor-local wake/impact field. RGBA is wake/impact/union/union. */
  readonly sourceTexture: StorageTexture;
  /** Samples the final stages at a Host-frame XZ position. */
  sampleStages(hostXNode: FloatNode, hostZNode: FloatNode): Vec4Node;
  /** Samples spectral, wake, impact, and their saturating union. */
  sampleSources(hostXNode: FloatNode, hostZNode: FloatNode): Vec4Node;
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
export function createSpectralWhitecapField(
  policy: QualityProfileSpectralWhitecaps,
): SpectralWhitecapField {
  const resolution = policy.fieldResolution;
  const tileSizeMetres = policy.tileSizeMetres;
  const fixedStepSeconds = 1 / policy.fixedTickHz;
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
  const interactionGeometryValues = Array.from(
    { length: MAX_ACTIVE_DISTURBANCES },
    () => new Vector4(),
  );
  const interactionTimingValues = Array.from(
    { length: MAX_ACTIVE_DISTURBANCES },
    () => new Vector4(),
  );
  const uniforms = createWhitecapUniforms(
    interactionGeometryValues,
    interactionTimingValues,
  );
  const kernels = createWhitecapKernels(
    finalStageTexture,
    stagingTexture,
    localFinalTexture,
    localStagingTexture,
    uniforms,
    resolution,
    tileSizeMetres,
    fixedStepSeconds,
  );
  let pendingResetSnapshot: OpenWaterRuntimeSnapshot | undefined;
  let lastObservedSnapshot: OpenWaterRuntimeSnapshot | undefined;
  let synchronizedSnapshot: OpenWaterRuntimeSnapshot | undefined;
  let latestInteraction: LocalInteractionRenderSnapshot | undefined;
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
    const localUnion = float(1)
      .sub(float(1).sub(wake).mul(float(1).sub(impact)))
      .clamp(0, 1);
    const union = float(1)
      .sub(float(1).sub(spectral).mul(float(1).sub(localUnion)))
      .clamp(0, 1);
    return vec4(spectral, wake, impact, union);
  };

  const runtimeStateSink: RuntimeStateSink = Object.freeze({
    synchronize(
      snapshot: OpenWaterRuntimeSnapshot,
      interaction: LocalInteractionRenderSnapshot,
    ): void {
      if (disposed) {
        return;
      }
      // Sink callbacks may arrive between the four async dispatch submissions.
      // Cache only; the queued GPU synchronization applies one coherent copy.
      observeSnapshot(snapshot);
      latestInteraction = interaction;
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
        // A partial four-stage tick is not authoritative. Force the next call
        // through the reset path instead of continuing from an unknown field.
        synchronizedSnapshot = undefined;
        throw cause;
      }
    });
    operationQueue = result.catch(() => undefined);
    return result;
  };

  return Object.freeze({
    texture: finalStageTexture,
    sourceTexture: localFinalTexture,
    sampleStages: stageSample,
    sampleSources: sourceSample,
    runtimeStateSink,
    synchronize(
      renderer: Renderer,
      snapshot: OpenWaterRuntimeSnapshot,
    ): Promise<void> {
      const requestedSnapshot = observeSnapshot(snapshot);
      const requestedInteraction = latestInteraction;
      const resetBoundary = pendingResetSnapshot;
      return enqueue(async () => {
        let previous = synchronizedSnapshot;
        if (
          resetBoundary !== undefined &&
          requiresHistoryReset(previous, resetBoundary)
        ) {
          const preparedReset = Object.freeze({
            ...resetBoundary,
            artisticControls: requestedSnapshot.artisticControls,
            controlRevision: requestedSnapshot.controlRevision,
          });
          const resetInteraction =
            requestedInteraction ?? emptyInteraction(preparedReset);
          const resetAnchor = interactionAnchorWorld(resetInteraction);
          writeSnapshotUniforms(uniforms, preparedReset, tileSizeMetres);
          writeInteractionUniforms(
            uniforms,
            resetInteraction,
            interactionGeometryValues,
            interactionTimingValues,
          );
          writeLocalAnchorUniforms(
            uniforms,
            preparedReset,
            resetAnchor,
            synchronizedLocalAnchor,
          );
          await executeFixedTick(
            renderer,
            kernels,
            uniforms,
            preparedReset.timeSeconds,
            true,
          );
          previous = preparedReset;
          synchronizedLocalAnchor = resetAnchor;
        }
        writeSnapshotUniforms(uniforms, requestedSnapshot, tileSizeMetres);
        const interaction =
          requestedInteraction ?? emptyInteraction(requestedSnapshot);
        const requestedAnchor = interactionAnchorWorld(interaction);
        writeInteractionUniforms(
          uniforms,
          interaction,
          interactionGeometryValues,
          interactionTimingValues,
        );
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
            writeLocalAnchorUniforms(
              uniforms,
              requestedSnapshot,
              requestedAnchor,
              synchronizedLocalAnchor,
            );
            await executeFixedTick(
              renderer,
              kernels,
              uniforms,
              tickTime,
              tick === previous.tick + 1,
            );
            synchronizedLocalAnchor = requestedAnchor;
          }
        } else if (reset) {
          writeLocalAnchorUniforms(
            uniforms,
            requestedSnapshot,
            requestedAnchor,
            synchronizedLocalAnchor,
          );
          await executeFixedTick(
            renderer,
            kernels,
            uniforms,
            requestedSnapshot.timeSeconds,
            true,
          );
          synchronizedLocalAnchor = requestedAnchor;
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
            writeLocalAnchorUniforms(
              uniforms,
              requestedSnapshot,
              requestedAnchor,
              synchronizedLocalAnchor,
            );
            await executeFixedTick(
              renderer,
              kernels,
              uniforms,
              tickTime,
              false,
            );
            synchronizedLocalAnchor = requestedAnchor;
          }
        }

        if (synchronizedLocalAnchor !== undefined) {
          writeLocalSampleAnchorUniforms(
            uniforms,
            requestedSnapshot,
            synchronizedLocalAnchor,
          );
        }

        // Same-tick calls deliberately update only hot uniforms and world
        // phase. They never evolve persistent state a second time.
        synchronizedSnapshot = requestedSnapshot;
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
      return enqueue(async () => {
        renderer.initTexture(finalStageTexture);
        renderer.initTexture(stagingTexture);
        renderer.initTexture(localFinalTexture);
        renderer.initTexture(localStagingTexture);
        writeSnapshotUniforms(uniforms, liveSnapshot, tileSizeMetres);
        const interaction = latestInteraction ?? emptyInteraction(liveSnapshot);
        const liveAnchor = interactionAnchorWorld(interaction);
        writeInteractionUniforms(
          uniforms,
          interaction,
          interactionGeometryValues,
          interactionTimingValues,
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
      pendingResetSnapshot = undefined;
      lastObservedSnapshot = undefined;
      synchronizedSnapshot = undefined;
      latestInteraction = undefined;
      synchronizedLocalAnchor = undefined;
    },
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

function createWhitecapUniforms(
  interactionGeometryValues: Vector4[],
  interactionTimingValues: Vector4[],
): WhitecapComputeUniforms {
  return {
    phaseOffset: uniform(0),
    timeSeconds: uniform(0),
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

function createWhitecapKernels(
  finalStageTexture: StorageTexture,
  stagingTexture: StorageTexture,
  localFinalTexture: StorageTexture,
  localStagingTexture: StorageTexture,
  uniforms: WhitecapComputeUniforms,
  resolution: number,
  tileSizeMetres: number,
  fixedStepSeconds: number,
): WhitecapKernels {
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
      .rg.mul(SPECTRAL_WHITECAP_DIFFUSION_CENTER_WEIGHT)
      .add(
        texture(localStagingTexture, texel.uv.add(crossTexel)).rg.mul(
          SPECTRAL_WHITECAP_DIFFUSION_SIDE_WEIGHT,
        ),
      )
      .add(
        texture(localStagingTexture, texel.uv.sub(crossTexel)).rg.mul(
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
    const generated = createLocalGenerationNode(
      texel.localX,
      texel.localZ,
      uniforms,
    );
    const wake = float(1)
      .sub(float(1).sub(history.x).mul(float(1).sub(generated.x)))
      .clamp(0, 1);
    const impact = float(1)
      .sub(float(1).sub(history.y).mul(float(1).sub(generated.y)))
      .clamp(0, 1);
    const localUnion = float(1)
      .sub(float(1).sub(wake).mul(float(1).sub(impact)))
      .clamp(0, 1);
    textureStore(
      localFinalTexture,
      texel.coordinate,
      vec4(wake, impact, localUnion, localUnion),
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

function createLocalGenerationNode(
  localX: FloatNode,
  localZ: FloatNode,
  uniforms: WhitecapComputeUniforms,
) {
  return Fn(() => {
    const wake = float(0).toVar();
    const impact = float(0).toVar();
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
          const ringPhase = normalizedRadius.sub(progress.mul(2)).mul(Math.PI);
          const ringEnergy = abs(cos(ringPhase));
          const radialActive = step(0, age)
            .mul(float(1).sub(step(RADIAL_IMPACT_LIFETIME_SECONDS, age)))
            .mul(float(1).sub(step(1, normalizedRadius)))
            .mul(radialKind);
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
          const wakePhase = along
            .mul(spatialRadians.div(radius))
            .sub(uniforms.timeSeconds.mul(temporalFrequency));
          const wakeEnergy = abs(cos(wakePhase));
          const heightScale = mix(
            float(DIRECTIONAL_WAKE_HEIGHT_SCALE),
            float(PROPELLER_WASH_HEIGHT_SCALE),
            propellerKind,
          );
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
    return vec2(wake, impact);
  })();
}

function createGenerationNode(
  worldX: FloatNode,
  worldZ: FloatNode,
  uniforms: WhitecapComputeUniforms,
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
  kernels: WhitecapKernels,
  uniforms: WhitecapComputeUniforms,
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
  uniforms: WhitecapComputeUniforms,
  snapshot: OpenWaterRuntimeSnapshot,
  tileSizeMetres: number,
): void {
  uniforms.phaseOffset.value = spectralBandPhaseOffset(snapshot.seed);
  uniforms.timeSeconds.value = snapshot.timeSeconds;
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
  uniforms: WhitecapComputeUniforms,
  interaction: LocalInteractionRenderSnapshot,
  geometryValues: Vector4[],
  timingValues: Vector4[],
): void {
  const count = Math.min(interaction.impacts.length, MAX_ACTIVE_DISTURBANCES);
  uniforms.interactionCount.value = count;
  for (let index = 0; index < MAX_ACTIVE_DISTURBANCES; index += 1) {
    const geometry = geometryValues[index];
    const timing = timingValues[index];
    if (geometry === undefined || timing === undefined) {
      continue;
    }
    const source = index < count ? interaction.impacts[index] : undefined;
    if (source === undefined) {
      geometry.set(0, 0, MIN_RADIAL_IMPACT_RADIUS_METRES, 0);
      timing.set(0, LOCAL_INTERACTION_KIND_RADIAL_IMPACT, 0, 0);
      continue;
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
      source.kind === "radial-impact"
        ? LOCAL_INTERACTION_KIND_RADIAL_IMPACT
        : source.kind === "directional-wake"
          ? LOCAL_INTERACTION_KIND_DIRECTIONAL_WAKE
          : LOCAL_INTERACTION_KIND_PROPELLER_WASH,
      source.directionX,
      source.directionZ,
    );
  }
}

function writeLocalAnchorUniforms(
  uniforms: WhitecapComputeUniforms,
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
  uniforms: WhitecapComputeUniforms,
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
