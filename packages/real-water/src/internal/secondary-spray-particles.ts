import {
  CustomBlending,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  OneFactor,
  PointsNodeMaterial,
  Sprite,
  type PerspectiveCamera,
  type Renderer,
  type SpriteMaterial,
} from "three/webgpu";
import { instancedDynamicBufferAttribute, vec4 } from "three/tsl";
import type { OpenWaterRuntimeSnapshot, RuntimeStateSink } from "../runtime.js";
import type { StormFrontController } from "../storm-front.js";
import { createSecondaryParticleStableKeyWriter } from "../secondary-particle-key.js";
import { createSecondaryParticleOutputFrustumVisibility } from "../secondary-particle-visibility.js";
import type { LocalInteractionRenderSnapshot } from "./local-interaction.js";
import {
  createSecondaryParticleCameraInputRevision,
  type SecondaryParticleAllocationParticipant,
} from "../secondary-particle-allocation-route.js";
import type {
  SecondaryParticleCandidateBatch,
  SecondaryParticleConsumerBinding,
  SecondaryParticleConsumerPlan,
  SecondaryParticleContributionQuantizer,
  SecondaryParticleContributionReference,
} from "../secondary-particle-pool.js";
import {
  MAX_ACTIVE_DISTURBANCES,
  MAX_ACTIVE_HERO_BREAKERS,
} from "../capabilities.js";
import {
  writeSecondarySprayCandidates,
  type SecondarySprayCandidateStorage,
  type SecondarySprayCandidateWriter,
} from "../secondary-spray-candidate-writer.js";

export const SECONDARY_SPRAY_PARTICLE_CONSUMER_ID =
  "spray-droplet-mist" as const;
export const MAX_SECONDARY_SPRAY_PARTICLES = 65_536;
export const SECONDARY_SPRAY_MINIMUM_RETAINED_SLOTS = 2_048;
export const SECONDARY_SPRAY_SOFT_REQUEST_CEILING = 32_768;

interface SecondarySprayRenderStorage {
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly colors: Float32Array;
}

export interface SecondarySprayParticlesOptions {
  readonly contributionReference: SecondaryParticleContributionReference;
  readonly contributionQuantizer: SecondaryParticleContributionQuantizer;
  readonly stormFront: StormFrontController;
}

export interface SecondarySprayParticlesInspection {
  readonly candidateCount: number;
  readonly renderInstanceCount: number;
  readonly synchronizedTick: number | null;
  readonly disposed: boolean;
}

export interface SecondarySprayParticles {
  readonly consumerPlan: SecondaryParticleConsumerPlan;
  readonly runtimeStateSink: RuntimeStateSink;
  synchronize(
    snapshot: OpenWaterRuntimeSnapshot,
    interaction: LocalInteractionRenderSnapshot,
  ): void;
  candidateInputRevision(): number;
  candidateBatch(
    snapshot: OpenWaterRuntimeSnapshot,
    interaction: LocalInteractionRenderSnapshot,
    camera: PerspectiveCamera,
  ): SecondaryParticleCandidateBatch;
  applyRetained(binding: SecondaryParticleConsumerBinding): void;
  renderAccumulation(renderer: Renderer, camera: PerspectiveCamera): void;
  inspect(): SecondarySprayParticlesInspection;
  dispose(): void;
}

/** Creates the spray adapter for the unified allocation transaction seam. */
export function createSecondarySprayAllocationParticipant(
  secondarySpray: SecondarySprayParticles,
  camera: PerspectiveCamera,
): SecondaryParticleAllocationParticipant {
  const cameraInputRevision =
    createSecondaryParticleCameraInputRevision(camera);
  const participant: SecondaryParticleAllocationParticipant = {
    consumerId: SECONDARY_SPRAY_PARTICLE_CONSUMER_ID,
    candidateInputRevision() {
      return combineInputRevisions(
        cameraInputRevision(),
        secondarySpray.candidateInputRevision(),
      );
    },
    candidateBatch(
      snapshot: OpenWaterRuntimeSnapshot,
      interaction: LocalInteractionRenderSnapshot,
    ) {
      return secondarySpray.candidateBatch(snapshot, interaction, camera);
    },
    applyRetained(binding: SecondaryParticleConsumerBinding) {
      secondarySpray.applyRetained(binding);
    },
  };
  return Object.freeze(participant);
}

/**
 * Creates the post-temporal spray consumer without binding it to a render
 * phase. The shared pool sees only stable handles and Q16 contributions; this
 * consumer later copies retained handles into its own prepared draw buffers.
 */
export function createSecondarySprayParticles(
  options: SecondarySprayParticlesOptions,
): SecondarySprayParticles {
  assertContributionReference(options.contributionReference);
  const consumerPlan: SecondaryParticleConsumerPlan = Object.freeze({
    consumerId: SECONDARY_SPRAY_PARTICLE_CONSUMER_ID,
    contributionReference: Object.freeze({ ...options.contributionReference }),
    maximumRequestCount: MAX_SECONDARY_SPRAY_PARTICLES,
    minimumRetainedSlots: SECONDARY_SPRAY_MINIMUM_RETAINED_SLOTS,
    softRequestCeiling: SECONDARY_SPRAY_SOFT_REQUEST_CEILING,
    pressureReentryPolicy: "after-shared-cooldown",
  });

  const candidateStorage: SecondarySprayCandidateStorage = Object.freeze({
    stableKeys: Object.freeze({
      high: new Uint32Array(MAX_SECONDARY_SPRAY_PARTICLES),
      low: new Uint32Array(MAX_SECONDARY_SPRAY_PARTICLES),
    }),
    contributionsQ16: new Uint16Array(MAX_SECONDARY_SPRAY_PARTICLES),
    payloadHandles: new Uint32Array(MAX_SECONDARY_SPRAY_PARTICLES),
    positions: new Float32Array(MAX_SECONDARY_SPRAY_PARTICLES * 3),
    sizes: new Float32Array(MAX_SECONDARY_SPRAY_PARTICLES),
    colors: new Float32Array(MAX_SECONDARY_SPRAY_PARTICLES * 4),
  });
  const renderStorage: SecondarySprayRenderStorage = Object.freeze({
    positions: new Float32Array(MAX_SECONDARY_SPRAY_PARTICLES * 3),
    sizes: new Float32Array(MAX_SECONDARY_SPRAY_PARTICLES),
    colors: new Float32Array(MAX_SECONDARY_SPRAY_PARTICLES * 4),
  });
  const candidateWriter: SecondarySprayCandidateWriter = Object.freeze({
    contributionReference: options.contributionReference,
    quantizeContribution: options.contributionQuantizer,
    stableKeyWriter: createSecondaryParticleStableKeyWriter(
      SECONDARY_SPRAY_PARTICLE_CONSUMER_ID,
    ),
    visibility: createSecondaryParticleOutputFrustumVisibility(
      options.contributionReference,
    ),
    storage: candidateStorage,
    minimumRetainedSlots: SECONDARY_SPRAY_MINIMUM_RETAINED_SLOTS,
    impactStableSourceIds: new Float64Array(MAX_ACTIVE_DISTURBANCES),
    impactSourceOrder: new Uint32Array(MAX_ACTIVE_DISTURBANCES),
    heroImpactSourceOrder: new Uint32Array(MAX_ACTIVE_HERO_BREAKERS),
  });
  const positionAttribute = new InstancedBufferAttribute(
    renderStorage.positions,
    3,
  ).setUsage(DynamicDrawUsage);
  const sizeAttribute = new InstancedBufferAttribute(
    renderStorage.sizes,
    1,
  ).setUsage(DynamicDrawUsage);
  const colorAttribute = new InstancedBufferAttribute(
    renderStorage.colors,
    4,
  ).setUsage(DynamicDrawUsage);

  const material = new PointsNodeMaterial();
  material.name = "Real Water secondary spray accumulation";
  material.positionNode = instancedDynamicBufferAttribute(
    positionAttribute,
    "vec3",
  );
  material.sizeNode = instancedDynamicBufferAttribute(sizeAttribute, "float");
  const instanceColor = vec4(
    instancedDynamicBufferAttribute<"vec4">(colorAttribute, "vec4"),
  );
  material.colorNode = instanceColor.rgb;
  material.opacityNode = instanceColor.a;
  material.sizeAttenuation = false;
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.blending = CustomBlending;
  material.blendSrc = OneFactor;
  material.blendDst = OneFactor;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = OneFactor;
  material.fog = false;
  material.toneMapped = false;

  // @types/three has not yet widened Sprite's constructor to the documented
  // SpriteNodeMaterial subtype, although the r185 runtime supports it.
  const sprite = new Sprite(material as unknown as SpriteMaterial);
  sprite.name = "Real Water secondary spray instances";
  sprite.count = 0;
  sprite.frustumCulled = false;
  const renderRoot = new Group();
  renderRoot.name = "Real Water secondary spray accumulation scene";
  renderRoot.add(sprite);

  let candidateCount = 0;
  let renderInstanceCount = 0;
  let synchronizedTick: number | null = null;
  let disposed = false;

  const batch: SecondaryParticleCandidateBatch = Object.freeze({
    get count(): number {
      return candidateCount;
    },
    stableKeyHigh: candidateStorage.stableKeys.high,
    stableKeyLow: candidateStorage.stableKeys.low,
    contributionsQ16: candidateStorage.contributionsQ16,
    payloadHandles: candidateStorage.payloadHandles,
  });
  const inspection: SecondarySprayParticlesInspection = Object.freeze({
    get candidateCount(): number {
      return candidateCount;
    },
    get renderInstanceCount(): number {
      return renderInstanceCount;
    },
    get synchronizedTick(): number | null {
      return synchronizedTick;
    },
    get disposed(): boolean {
      return disposed;
    },
  });

  const synchronize = (
    snapshot: OpenWaterRuntimeSnapshot,
    interaction: LocalInteractionRenderSnapshot,
  ): void => {
    assertActive(disposed);
    void interaction;
    synchronizedTick = snapshot.tick;
  };
  const runtimeStateSink: RuntimeStateSink = Object.freeze({ synchronize });

  return Object.freeze({
    consumerPlan,
    runtimeStateSink,
    synchronize,
    candidateInputRevision(): number {
      const frame = options.stormFront.inspect()?.current;
      if (frame === undefined) {
        throw new Error(
          "Storm Front must be synchronized before secondary spray allocation.",
        );
      }
      return frame.inputRevision;
    },
    candidateBatch(
      snapshot: OpenWaterRuntimeSnapshot,
      interaction: LocalInteractionRenderSnapshot,
      camera: PerspectiveCamera,
    ): SecondaryParticleCandidateBatch {
      synchronize(snapshot, interaction);
      candidateCount = writeSecondarySprayCandidates(
        snapshot,
        interaction,
        requireStormFrontFrame(options.stormFront),
        camera,
        desiredGeneralCandidateCount(snapshot, interaction),
        candidateWriter,
      );
      return batch;
    },
    applyRetained(binding: SecondaryParticleConsumerBinding): void {
      assertActive(disposed);
      if (binding.consumerId !== SECONDARY_SPRAY_PARTICLE_CONSUMER_ID) {
        throw new Error(
          `Secondary spray cannot consume binding ${binding.consumerId}.`,
        );
      }
      const retainedCount = binding.retained.count[0] ?? 0;
      if (retainedCount > MAX_SECONDARY_SPRAY_PARTICLES) {
        throw new Error("Secondary spray retained count exceeds its capacity.");
      }
      for (let index = 0; index < retainedCount; index += 1) {
        const payload = binding.retained.payloadHandles[index] ?? 0;
        if (payload >= candidateCount) {
          throw new Error(
            `Secondary spray retained unknown payload handle ${String(payload)}.`,
          );
        }
        const sourcePosition = payload * 3;
        const targetPosition = index * 3;
        renderStorage.positions[targetPosition] =
          candidateStorage.positions[sourcePosition] ?? 0;
        renderStorage.positions[targetPosition + 1] =
          candidateStorage.positions[sourcePosition + 1] ?? 0;
        renderStorage.positions[targetPosition + 2] =
          candidateStorage.positions[sourcePosition + 2] ?? 0;
        renderStorage.sizes[index] = candidateStorage.sizes[payload] ?? 0;
        const sourceColor = payload * 4;
        const targetColor = index * 4;
        renderStorage.colors[targetColor] =
          candidateStorage.colors[sourceColor] ?? 0;
        renderStorage.colors[targetColor + 1] =
          candidateStorage.colors[sourceColor + 1] ?? 0;
        renderStorage.colors[targetColor + 2] =
          candidateStorage.colors[sourceColor + 2] ?? 0;
        renderStorage.colors[targetColor + 3] =
          candidateStorage.colors[sourceColor + 3] ?? 0;
      }
      renderInstanceCount = retainedCount;
      sprite.count = retainedCount;
      positionAttribute.needsUpdate = true;
      sizeAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;
    },
    renderAccumulation(renderer: Renderer, camera: PerspectiveCamera): void {
      assertActive(disposed);
      // The caller owns and has already cleared/bound the RGBA16F accumulation
      // target. RGB is premultiplied particle radiance; A is weighted overdraw.
      renderer.render(renderRoot, camera);
    },
    inspect(): SecondarySprayParticlesInspection {
      return inspection;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      candidateCount = 0;
      renderInstanceCount = 0;
      sprite.count = 0;
      renderRoot.clear();
      material.dispose();
    },
  });
}

function requireStormFrontFrame(stormFront: StormFrontController) {
  const frame = stormFront.inspect()?.current;
  if (frame === undefined) {
    throw new Error(
      "Storm Front must be synchronized before secondary spray candidates are written.",
    );
  }
  return frame;
}

function combineInputRevisions(camera: number, stormFront: number): number {
  return (Math.imul(camera >>> 0, 0x0100_0193) ^ (stormFront >>> 0)) >>> 0;
}

function desiredGeneralCandidateCount(
  snapshot: OpenWaterRuntimeSnapshot,
  interaction: LocalInteractionRenderSnapshot,
): number {
  const controls = snapshot.artisticControls;
  const seaEnergy =
    (controls.waveStrength + controls.choppiness + controls.whitecapAmount) / 3;
  let generalInteractionCount = 0;
  for (const impact of interaction.impacts) {
    if (impact.kind !== "hero-breaker") {
      generalInteractionCount += 1;
    }
  }
  const activeInteractionBoost = Math.min(generalInteractionCount, 16) * 2_048;
  return Math.max(
    SECONDARY_SPRAY_MINIMUM_RETAINED_SLOTS,
    Math.min(
      MAX_SECONDARY_SPRAY_PARTICLES,
      Math.round(32_768 * seaEnergy + activeInteractionBoost),
    ),
  );
}

function assertContributionReference(
  reference: SecondaryParticleContributionReference,
): void {
  if (
    reference.space !== "output-drawing-buffer" ||
    !Number.isInteger(reference.width) ||
    reference.width <= 0 ||
    !Number.isInteger(reference.height) ||
    reference.height <= 0
  ) {
    throw new Error(
      "Secondary spray requires a positive output-drawing-buffer contribution ruler.",
    );
  }
}

function assertActive(disposed: boolean): void {
  if (disposed) {
    throw new Error("Secondary spray particles are disposed.");
  }
}
