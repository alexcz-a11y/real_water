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
import {
  createSecondaryParticleStableKeyWriter,
  type SecondaryParticleStableKeyBuffers,
  type SecondaryParticleStableKeyWriter,
} from "../secondary-particle-key.js";
import {
  createSecondaryParticleOutputFrustumVisibility,
  type SecondaryParticleOutputFrustumVisibility,
} from "../secondary-particle-visibility.js";
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

export const SECONDARY_SPRAY_PARTICLE_CONSUMER_ID =
  "spray-droplet-mist" as const;
export const MAX_SECONDARY_SPRAY_PARTICLES = 65_536;
export const SECONDARY_SPRAY_MINIMUM_RETAINED_SLOTS = 2_048;
export const SECONDARY_SPRAY_SOFT_REQUEST_CEILING = 32_768;

const FIXED_TICKS_PER_SECOND = 60;
const GLOBAL_SPRAY_SOURCE = 0x6c8e_9cf5;

interface SecondarySprayCandidateStorage {
  readonly stableKeys: SecondaryParticleStableKeyBuffers;
  readonly contributionsQ16: Uint16Array;
  readonly payloadHandles: Uint32Array;
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly colors: Float32Array;
}

interface SecondarySprayRenderStorage {
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly colors: Float32Array;
}

interface SecondarySprayCandidateWriter {
  readonly contributionReference: SecondaryParticleContributionReference;
  readonly quantizeContribution: SecondaryParticleContributionQuantizer;
  readonly stableKeyWriter: SecondaryParticleStableKeyWriter;
  readonly visibility: SecondaryParticleOutputFrustumVisibility;
  readonly storage: SecondarySprayCandidateStorage;
}

export interface SecondarySprayParticlesOptions {
  readonly contributionReference: SecondaryParticleContributionReference;
  readonly contributionQuantizer: SecondaryParticleContributionQuantizer;
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
      return cameraInputRevision();
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
    candidateBatch(
      snapshot: OpenWaterRuntimeSnapshot,
      interaction: LocalInteractionRenderSnapshot,
      camera: PerspectiveCamera,
    ): SecondaryParticleCandidateBatch {
      synchronize(snapshot, interaction);
      candidateCount = desiredCandidateCount(snapshot, interaction);
      writeCandidates(
        snapshot,
        interaction,
        camera,
        candidateCount,
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

function desiredCandidateCount(
  snapshot: OpenWaterRuntimeSnapshot,
  interaction: LocalInteractionRenderSnapshot,
): number {
  const controls = snapshot.artisticControls;
  const seaEnergy =
    (controls.waveStrength + controls.choppiness + controls.whitecapAmount) / 3;
  const activeInteractionBoost =
    Math.min(interaction.impacts.length, 16) * 2_048;
  return Math.max(
    SECONDARY_SPRAY_MINIMUM_RETAINED_SLOTS,
    Math.min(
      MAX_SECONDARY_SPRAY_PARTICLES,
      Math.round(32_768 * seaEnergy + activeInteractionBoost),
    ),
  );
}

function writeCandidates(
  snapshot: OpenWaterRuntimeSnapshot,
  interaction: LocalInteractionRenderSnapshot,
  camera: PerspectiveCamera,
  count: number,
  writer: SecondarySprayCandidateWriter,
): void {
  const impacts = interaction.impacts;
  const impactCount = impacts.length;
  const focalCount = Math.min(SECONDARY_SPRAY_MINIMUM_RETAINED_SLOTS, count);
  camera.updateWorldMatrix(true, false);
  const cameraWorld = camera.matrixWorld.elements;
  const cameraX = cameraWorld[12] ?? 0;
  const cameraY = cameraWorld[13] ?? 0;
  const cameraZ = cameraWorld[14] ?? 0;
  const pixelsPerRadian =
    writer.contributionReference.height /
    (2 * Math.tan((camera.fov * Math.PI) / 360));
  const storage = writer.storage;

  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const focal = ordinal < focalCount;
    const impactIndex = impactCount === 0 ? -1 : ordinal % impactCount;
    const impact = impactIndex < 0 ? undefined : impacts[impactIndex];
    const sourceId =
      impact === undefined
        ? GLOBAL_SPRAY_SOURCE
        : stableImpactSource(impact.x, impact.z, impact.startTimeSeconds);
    const lifetimeTicks = 12 + (mix32(ordinal ^ sourceId) % 29);
    const phase = mix32(ordinal + sourceId) % lifetimeTicks;
    const ageTicks = positiveModulo(snapshot.tick - phase, lifetimeTicks);
    const spawnEpochTick = snapshot.tick - ageTicks;
    writer.stableKeyWriter.writeAt(
      storage.stableKeys,
      ordinal,
      snapshot.seed,
      sourceId,
      spawnEpochTick,
      ordinal,
    );
    const keyHigh = storage.stableKeys.high[ordinal] ?? 0;
    const keyLow = storage.stableKeys.low[ordinal] ?? 0;
    storage.payloadHandles[ordinal] = ordinal;

    const randomA = unitFloat(mix32(keyLow ^ 0xa511_e9b3));
    const randomB = unitFloat(mix32(keyHigh ^ 0x63d8_35f1));
    const randomC = unitFloat(mix32(keyLow ^ keyHigh ^ 0x91e1_0da5));
    const normalizedAge = ageTicks / lifetimeTicks;
    const ageSeconds = ageTicks / FIXED_TICKS_PER_SECOND;
    const angle = randomA * Math.PI * 2;
    const sourceRadius = impact?.radius ?? 24;
    const radialDistance =
      Math.sqrt(randomB) * sourceRadius * (focal ? 0.35 : 1);
    const sourceX = impact?.x ?? interaction.anchorX;
    const sourceZ = impact?.z ?? interaction.anchorZ;
    const directionX = impact?.directionX ?? Math.cos(angle);
    const directionZ = impact?.directionZ ?? Math.sin(angle);
    const drift = (0.25 + randomC * 1.5) * ageSeconds;
    const x = sourceX + Math.cos(angle) * radialDistance + directionX * drift;
    const z = sourceZ + Math.sin(angle) * radialDistance + directionZ * drift;
    const kind = mix32(keyHigh + ordinal) % 3;
    const initialVerticalSpeed =
      kind === 0 ? 2.2 + randomB * 4.5 : kind === 1 ? 1.2 + randomB * 3 : 0.35;
    const y =
      snapshot.seaLevelMetres +
      (impact === undefined ? 0 : Math.abs(impact.amplitude) * 0.2) +
      initialVerticalSpeed * ageSeconds -
      (kind === 2 ? 0.15 : 4.9) * ageSeconds * ageSeconds;
    const positionOffset = ordinal * 3;
    storage.positions[positionOffset] = x;
    storage.positions[positionOffset + 1] = y;
    storage.positions[positionOffset + 2] = z;

    const dx = x - cameraX;
    const dy = y - cameraY;
    const dz = z - cameraZ;
    const cameraDistance = Math.max(0.25, Math.hypot(dx, dy, dz));
    const worldRadius = focal
      ? 0.35 + randomC * 0.7
      : kind === 2
        ? 0.08 + randomC * 0.28
        : 0.015 + randomC * 0.11;
    const diameterPixels = Math.max(
      0.5,
      Math.min(96, (worldRadius * 2 * pixelsPerRadian) / cameraDistance),
    );
    storage.sizes[ordinal] = diameterPixels;
    const projectedAreaPixels =
      Math.PI * diameterPixels * diameterPixels * 0.25;
    const lifetimeEnvelope = Math.min(
      1,
      normalizedAge * 6,
      (1 - normalizedAge) * 5,
    );
    const visibleEnvelope = focal
      ? Math.max(0.35, lifetimeEnvelope)
      : lifetimeEnvelope;
    const opacity =
      visibleEnvelope * (focal ? 0.82 + randomA * 0.15 : 0.06 + randomA * 0.24);
    const contrast = focal ? 0.82 + randomB * 0.16 : 0.12 + randomB * 0.38;
    // This post-TRAA overlay has no CPU opaque-depth sample. Its shared-pool
    // depthVisibility is deterministic current output-frustum support only.
    const depthVisibility = writer.visibility.evaluate(
      camera,
      x,
      y,
      z,
      diameterPixels * 0.5,
    );
    storage.contributionsQ16[ordinal] = writer.quantizeContribution(
      projectedAreaPixels,
      opacity,
      contrast,
      depthVisibility,
    );

    const radiance = opacity * (kind === 2 ? 0.3 : kind === 1 ? 0.55 : 0.72);
    const colorOffset = ordinal * 4;
    storage.colors[colorOffset] = radiance * (kind === 2 ? 0.68 : 0.82);
    storage.colors[colorOffset + 1] = radiance * (kind === 2 ? 0.78 : 0.9);
    storage.colors[colorOffset + 2] = radiance;
    storage.colors[colorOffset + 3] = opacity;
  }
}

function stableImpactSource(
  x: number,
  z: number,
  startTimeSeconds: number,
): number {
  const xMillimetres = Math.round(x * 1_000);
  const zMillimetres = Math.round(z * 1_000);
  const startTick = Math.round(startTimeSeconds * FIXED_TICKS_PER_SECOND);
  return mix32(
    Math.imul(xMillimetres, 0x27d4_eb2d) ^
      Math.imul(zMillimetres, 0x1656_67b1) ^
      startTick,
  );
}

function mix32(input: number): number {
  let value = input >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function unitFloat(value: number): number {
  return value / 0x1_0000_0000;
}

function positiveModulo(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
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
