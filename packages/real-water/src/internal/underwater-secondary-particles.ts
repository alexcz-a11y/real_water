import {
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  NormalBlending,
  PointsNodeMaterial,
  Sprite,
  type PerspectiveCamera,
  type Renderer,
  type SpriteMaterial,
  type Texture,
} from "three/webgpu";
import {
  cameraProjectionMatrixInverse,
  getViewPosition,
  instancedDynamicBufferAttribute,
  positionView,
  screenUV,
  smoothstep,
  texture,
  vec4,
} from "three/tsl";
import type { OpenWaterRuntimeSnapshot, RuntimeStateSink } from "../runtime.js";
import type { SecondaryParticleAllocationParticipant } from "../secondary-particle-allocation-route.js";
import type {
  SecondaryParticleCandidateBatch,
  SecondaryParticleConsumerBinding,
  SecondaryParticleConsumerPlan,
  SecondaryParticleContributionQuantizer,
  SecondaryParticleContributionReference,
} from "../secondary-particle-pool.js";
import {
  RISING_BUBBLE_CONSUMER_ID,
  SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
  UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
  createUnderwaterSecondaryParticleModel,
  type UnderwaterSecondaryParticleConsumerId,
  type UnderwaterSecondaryParticleModelInspection,
  type UnderwaterSecondaryParticleRetainedLane,
} from "../underwater-secondary-particle-model.js";
import type { LocalInteractionRenderSnapshot } from "./local-interaction.js";

interface UnderwaterParticleRenderLane {
  readonly retained: UnderwaterSecondaryParticleRetainedLane;
  readonly positionAttribute: InstancedBufferAttribute;
  readonly sizeAttribute: InstancedBufferAttribute;
  readonly colorAttribute: InstancedBufferAttribute;
  readonly material: PointsNodeMaterial;
  readonly sprite: Sprite;
}

export interface UnderwaterSecondaryParticlesOptions {
  /** Borrowed opaque scene depth. This consumer never disposes it. */
  readonly sceneDepth: Texture;
  readonly contributionReference: SecondaryParticleContributionReference;
  readonly contributionQuantizer: SecondaryParticleContributionQuantizer;
}

export interface UnderwaterSecondaryParticlesInspection extends UnderwaterSecondaryParticleModelInspection {
  readonly synchronizedTick: number | null;
  readonly disposed: boolean;
}

export interface UnderwaterSecondaryParticles {
  readonly consumerPlans: readonly SecondaryParticleConsumerPlan[];
  readonly runtimeStateSink: RuntimeStateSink;
  synchronize(
    snapshot: OpenWaterRuntimeSnapshot,
    interaction: LocalInteractionRenderSnapshot,
  ): void;
  candidateBatch(
    consumerId: UnderwaterSecondaryParticleConsumerId,
    snapshot: OpenWaterRuntimeSnapshot,
    interaction: LocalInteractionRenderSnapshot,
    camera: PerspectiveCamera,
  ): SecondaryParticleCandidateBatch;
  applyRetained(binding: SecondaryParticleConsumerBinding): void;
  renderSuspended(renderer: Renderer, camera: PerspectiveCamera): void;
  renderBubbles(renderer: Renderer, camera: PerspectiveCamera): void;
  inspect(): UnderwaterSecondaryParticlesInspection;
  dispose(): void;
}

/** Creates the three adapters for the shared submit-all allocation seam. */
export function createUnderwaterSecondaryParticleAllocationParticipants(
  particles: UnderwaterSecondaryParticles,
  camera: PerspectiveCamera,
): readonly SecondaryParticleAllocationParticipant[] {
  return Object.freeze(
    particles.consumerPlans.map((plan) =>
      Object.freeze({
        consumerId: plan.consumerId,
        candidateBatch(
          snapshot: OpenWaterRuntimeSnapshot,
          interaction: LocalInteractionRenderSnapshot,
        ) {
          return particles.candidateBatch(
            plan.consumerId as UnderwaterSecondaryParticleConsumerId,
            snapshot,
            interaction,
            camera,
          );
        },
        applyRetained(binding: SecondaryParticleConsumerBinding) {
          particles.applyRetained(binding);
        },
      }),
    ),
  );
}

/**
 * Adapts the deterministic underwater-particle model to pre-TRAA Three/TSL
 * rendering. The model owns fixed particle data; this adapter only owns GPU
 * attributes, materials, render roots, and borrowed scene-depth sampling.
 */
export function createUnderwaterSecondaryParticles(
  options: UnderwaterSecondaryParticlesOptions,
): UnderwaterSecondaryParticles {
  const model = createUnderwaterSecondaryParticleModel(options);
  const suspended = createRenderLane(
    UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID,
    model.retainedLane(UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID),
    options.sceneDepth,
  );
  const cloud = createRenderLane(
    SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID,
    model.retainedLane(SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID),
    options.sceneDepth,
  );
  const rising = createRenderLane(
    RISING_BUBBLE_CONSUMER_ID,
    model.retainedLane(RISING_BUBBLE_CONSUMER_ID),
    options.sceneDepth,
  );

  const suspendedRoot = new Group();
  suspendedRoot.name = "Real Water underwater suspended particles scene";
  suspendedRoot.add(suspended.sprite);
  const bubbleRoot = new Group();
  bubbleRoot.name = "Real Water underwater bubble particles scene";
  bubbleRoot.add(cloud.sprite, rising.sprite);

  let synchronizedTick: number | null = null;
  let disposed = false;
  const synchronize = (
    snapshot: OpenWaterRuntimeSnapshot,
    interaction: LocalInteractionRenderSnapshot,
  ): void => {
    assertActive(disposed);
    void interaction;
    synchronizedTick = snapshot.tick;
  };
  const runtimeStateSink: RuntimeStateSink = Object.freeze({ synchronize });
  const modelInspection = model.inspect();
  const inspection: UnderwaterSecondaryParticlesInspection = Object.freeze({
    candidateCounts: modelInspection.candidateCounts,
    retainedCounts: modelInspection.retainedCounts,
    receipts: modelInspection.receipts,
    retainedOpacitySamples: modelInspection.retainedOpacitySamples,
    get synchronizedTick(): number | null {
      return synchronizedTick;
    },
    get disposed(): boolean {
      return disposed;
    },
  });

  return Object.freeze({
    consumerPlans: model.consumerPlans,
    runtimeStateSink,
    synchronize,
    candidateBatch(
      consumerId: UnderwaterSecondaryParticleConsumerId,
      snapshot: OpenWaterRuntimeSnapshot,
      interaction: LocalInteractionRenderSnapshot,
      camera: PerspectiveCamera,
    ): SecondaryParticleCandidateBatch {
      assertActive(disposed);
      synchronize(snapshot, interaction);
      return model.candidateBatch(consumerId, snapshot, interaction, camera);
    },
    applyRetained(binding: SecondaryParticleConsumerBinding): void {
      assertActive(disposed);
      model.applyRetained(binding);
      refreshRenderLane(renderLaneForConsumer(binding.consumerId));
    },
    renderSuspended(renderer: Renderer, camera: PerspectiveCamera): void {
      assertActive(disposed);
      renderer.render(suspendedRoot, camera);
    },
    renderBubbles(renderer: Renderer, camera: PerspectiveCamera): void {
      assertActive(disposed);
      renderer.render(bubbleRoot, camera);
    },
    inspect(): UnderwaterSecondaryParticlesInspection {
      return inspection;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      model.reset();
      for (const lane of [suspended, cloud, rising]) {
        lane.sprite.count = 0;
        lane.material.dispose();
      }
      suspendedRoot.clear();
      bubbleRoot.clear();
    },
  });

  function renderLaneForConsumer(
    consumerId: string,
  ): UnderwaterParticleRenderLane {
    switch (consumerId) {
      case UNDERWATER_SUSPENDED_PARTICLE_CONSUMER_ID:
        return suspended;
      case SUBSURFACE_BUBBLE_CLOUD_CONSUMER_ID:
        return cloud;
      case RISING_BUBBLE_CONSUMER_ID:
        return rising;
      default:
        throw new Error(
          `Unknown underwater particle consumer ${String(consumerId)}.`,
        );
    }
  }
}

function createRenderLane(
  consumerId: string,
  retained: UnderwaterSecondaryParticleRetainedLane,
  sceneDepth: Texture,
): UnderwaterParticleRenderLane {
  const positionAttribute = new InstancedBufferAttribute(
    retained.positions,
    3,
  ).setUsage(DynamicDrawUsage);
  const sizeAttribute = new InstancedBufferAttribute(
    retained.sizes,
    1,
  ).setUsage(DynamicDrawUsage);
  const colorAttribute = new InstancedBufferAttribute(
    retained.colors,
    4,
  ).setUsage(DynamicDrawUsage);
  const material = new PointsNodeMaterial();
  material.name = `Real Water ${consumerId} soft-depth particles`;
  material.positionNode = instancedDynamicBufferAttribute(
    positionAttribute,
    "vec3",
  );
  material.sizeNode = instancedDynamicBufferAttribute(sizeAttribute, "float");
  const instanceColor = vec4(
    instancedDynamicBufferAttribute<"vec4">(colorAttribute, "vec4"),
  );
  const sceneViewPosition = getViewPosition(
    screenUV,
    texture(sceneDepth, screenUV).r,
    cameraProjectionMatrixInverse,
  );
  // View-space comparison deliberately replaces fixed-function depth testing:
  // an opaque surface in front fades the particle over a narrow metric band.
  const softSceneDepthVisibility = smoothstep(
    -0.2,
    0.05,
    positionView.z.sub(sceneViewPosition.z),
  );
  material.colorNode = instanceColor.rgb;
  material.opacityNode = instanceColor.a.mul(softSceneDepthVisibility);
  material.sizeAttenuation = false;
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.blending = NormalBlending;
  material.fog = false;
  material.toneMapped = false;

  // @types/three has not yet widened Sprite's constructor to the documented
  // SpriteNodeMaterial subtype, although the r185 runtime supports it.
  const sprite = new Sprite(material as unknown as SpriteMaterial);
  sprite.name = `Real Water ${consumerId} instances`;
  sprite.count = 0;
  sprite.frustumCulled = false;
  return Object.freeze({
    retained,
    positionAttribute,
    sizeAttribute,
    colorAttribute,
    material,
    sprite,
  });
}

function refreshRenderLane(lane: UnderwaterParticleRenderLane): void {
  lane.sprite.count = lane.retained.count;
  lane.positionAttribute.needsUpdate = true;
  lane.sizeAttribute.needsUpdate = true;
  lane.colorAttribute.needsUpdate = true;
}

function assertActive(disposed: boolean): void {
  if (disposed) {
    throw new Error("Underwater secondary particles are disposed.");
  }
}
