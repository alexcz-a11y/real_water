import type { PerspectiveCamera } from "three/webgpu";
import type { OpenWaterRuntimeSnapshot } from "./runtime.js";
import type {
  SecondaryParticleStableKeyBuffers,
  SecondaryParticleStableKeyWriter,
} from "./secondary-particle-key.js";
import type { SecondaryParticleOutputFrustumVisibility } from "./secondary-particle-visibility.js";
import type {
  SecondaryParticleContributionQuantizer,
  SecondaryParticleContributionReference,
} from "./secondary-particle-pool.js";
import { canonicalizeInteractionStableSources } from "./interaction-source-identity.js";

const FIXED_TICKS_PER_SECOND = 60;
const GLOBAL_SPRAY_SOURCE = 0x6c8e_9cf5;

export interface SecondarySprayCandidateStorage {
  readonly stableKeys: SecondaryParticleStableKeyBuffers;
  readonly contributionsQ16: Uint16Array;
  readonly payloadHandles: Uint32Array;
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly colors: Float32Array;
}

export interface SecondarySprayCandidateWriter {
  readonly contributionReference: SecondaryParticleContributionReference;
  readonly quantizeContribution: SecondaryParticleContributionQuantizer;
  readonly stableKeyWriter: SecondaryParticleStableKeyWriter;
  readonly visibility: SecondaryParticleOutputFrustumVisibility;
  readonly storage: SecondarySprayCandidateStorage;
  readonly minimumRetainedSlots: number;
  readonly impactStableSourceIds: Float64Array;
  readonly impactSourceOrder: Uint32Array;
}

export interface SecondarySprayInteractionImpact {
  readonly stableSourceId: number;
  readonly x: number;
  readonly z: number;
  readonly directionX: number;
  readonly directionZ: number;
  readonly radius: number;
  readonly amplitude: number;
}

export interface SecondarySprayInteractionSnapshot {
  readonly anchorX: number;
  readonly anchorZ: number;
  readonly impacts: readonly SecondarySprayInteractionImpact[];
}

/** Writes one deterministic, allocation-free secondary-spray candidate batch. */
export function writeSecondarySprayCandidates(
  snapshot: OpenWaterRuntimeSnapshot,
  interaction: SecondarySprayInteractionSnapshot,
  camera: PerspectiveCamera,
  count: number,
  writer: SecondarySprayCandidateWriter,
): void {
  const impacts = interaction.impacts;
  const impactCount = canonicalizeInteractionStableSources(
    impacts,
    writer.impactStableSourceIds,
    writer.impactSourceOrder,
  );
  const focalCount = Math.min(writer.minimumRetainedSlots, count);
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
    const sourceIndex =
      impactIndex < 0 ? undefined : writer.impactSourceOrder[impactIndex];
    const impact = sourceIndex === undefined ? undefined : impacts[sourceIndex];
    const sourceId =
      sourceIndex === undefined
        ? GLOBAL_SPRAY_SOURCE
        : writer.impactStableSourceIds[sourceIndex];
    if (sourceId === undefined || (sourceIndex !== undefined && !impact)) {
      throw new Error(
        "A canonical secondary-spray source is missing from prepared scratch.",
      );
    }
    const sourceLocalOrdinal =
      impactCount === 0 ? ordinal : Math.floor(ordinal / impactCount);
    const lifetimeTicks = 12 + (mix32(sourceLocalOrdinal ^ sourceId) % 29);
    const phase = mix32(sourceLocalOrdinal + sourceId) % lifetimeTicks;
    const ageTicks = positiveModulo(snapshot.tick - phase, lifetimeTicks);
    const spawnEpochTick = snapshot.tick - ageTicks;
    writer.stableKeyWriter.writeAt(
      storage.stableKeys,
      ordinal,
      snapshot.seed,
      sourceId,
      spawnEpochTick,
      sourceLocalOrdinal,
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
