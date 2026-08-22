import {
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
  RepeatWrapping,
  StorageTexture,
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
  int,
  instanceIndex,
  ivec2,
  mix,
  pow,
  sin,
  smoothstep,
  step,
  texture,
  textureLoad,
  textureStore,
  uniform,
  uvec2,
  vec2,
  vec4,
} from "three/tsl";
import type { QualityProfileSpectralWhitecaps } from "../quality-profile.js";
import type { OpenWaterRuntimeSnapshot, RuntimeStateSink } from "../runtime.js";
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
}

export interface SpectralWhitecapField {
  /** Stable final-stage texture. RGBA is generation/history/advection/decay. */
  readonly texture: StorageTexture;
  /** Samples the final stages at a Host-frame XZ position. */
  sampleStages(hostXNode: FloatNode, hostZNode: FloatNode): Vec4Node;
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
 * Allocates the complete r185 TSL spectral-whitecap field. Texture identities,
 * compute graphs, and stage layout remain fixed for the field lifetime.
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
  const uniforms = createWhitecapUniforms();
  const kernels = createWhitecapKernels(
    finalStageTexture,
    stagingTexture,
    uniforms,
    resolution,
    tileSizeMetres,
    fixedStepSeconds,
  );
  let pendingResetSnapshot: OpenWaterRuntimeSnapshot | undefined;
  let lastObservedSnapshot: OpenWaterRuntimeSnapshot | undefined;
  let synchronizedSnapshot: OpenWaterRuntimeSnapshot | undefined;
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

  const runtimeStateSink: RuntimeStateSink = Object.freeze({
    synchronize(snapshot: OpenWaterRuntimeSnapshot): void {
      if (disposed) {
        return;
      }
      // Sink callbacks may arrive between the four async dispatch submissions.
      // Cache only; the queued GPU synchronization applies one coherent copy.
      observeSnapshot(snapshot);
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
    sampleStages: stageSample,
    runtimeStateSink,
    synchronize(
      renderer: Renderer,
      snapshot: OpenWaterRuntimeSnapshot,
    ): Promise<void> {
      const requestedSnapshot = observeSnapshot(snapshot);
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
          writeSnapshotUniforms(uniforms, preparedReset, tileSizeMetres);
          await executeFixedTick(
            renderer,
            kernels,
            uniforms,
            preparedReset.timeSeconds,
            true,
          );
          previous = preparedReset;
        }
        writeSnapshotUniforms(uniforms, requestedSnapshot, tileSizeMetres);
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
            await executeFixedTick(
              renderer,
              kernels,
              uniforms,
              tickTime,
              tick === previous.tick + 1,
            );
          }
        } else if (reset) {
          await executeFixedTick(
            renderer,
            kernels,
            uniforms,
            requestedSnapshot.timeSeconds,
            true,
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
            await executeFixedTick(
              renderer,
              kernels,
              uniforms,
              tickTime,
              false,
            );
          }
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
        writeSnapshotUniforms(uniforms, liveSnapshot, tileSizeMetres);

        // The first reset tick reaches and compiles all four fixed routes. The
        // second reset tick overwrites both ping-pong paths from the same Host
        // state, leaving deterministic live content rather than warmup data.
        await executeFixedTick(
          renderer,
          kernels,
          uniforms,
          liveSnapshot.timeSeconds,
          true,
        );
        await executeFixedTick(
          renderer,
          kernels,
          uniforms,
          liveSnapshot.timeSeconds,
          true,
        );
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
      finalStageTexture.dispose();
      stagingTexture.dispose();
      pendingResetSnapshot = undefined;
      lastObservedSnapshot = undefined;
      synchronizedSnapshot = undefined;
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

function createWhitecapUniforms(): WhitecapComputeUniforms {
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

  return { generate, advect, diffuse, decay };
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
