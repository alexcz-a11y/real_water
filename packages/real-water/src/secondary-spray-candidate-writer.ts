import type { PerspectiveCamera } from "three/webgpu";
import type { OpenWaterRuntimeSnapshot } from "./runtime.js";
import type { StormFrontFrame } from "./storm-front.js";
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
import {
  HERO_BREAKER_FORWARD_TRAVEL_RADII,
  HERO_BREAKER_INITIAL_CREST_CENTER_RADII,
} from "./internal/hero-breaker.js";

const FIXED_TICKS_PER_SECOND = 60;
const GLOBAL_SPRAY_SOURCE = 0x6c8e_9cf5;
export const SECONDARY_RAIN_SPRAY_STABLE_SOURCE_ID = 0x4f2a_7c19;
export const SECONDARY_STORM_AEROSOL_STABLE_SOURCE_ID = 0xb613_58e7;
export const MAX_SECONDARY_RAIN_SPRAY_CANDIDATES = 8_192;
export const MAX_SECONDARY_STORM_AEROSOL_CANDIDATES = 8_192;
export const MAX_SECONDARY_SPRAY_CANDIDATES_PER_HERO_BREAKER = 4_096;

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
  readonly heroImpactSourceOrder: Uint32Array;
}

export interface SecondarySprayInteractionImpact {
  readonly stableSourceId: number;
  readonly kind:
    "radial-impact" | "directional-wake" | "propeller-wash" | "hero-breaker";
  readonly x: number;
  readonly z: number;
  readonly directionX: number;
  readonly directionZ: number;
  readonly radius: number;
  readonly amplitude: number;
  readonly startTick: number;
  readonly lifetimeTicks: number;
  readonly sprayAmount: number;
}

export interface SecondarySprayInteractionSnapshot {
  readonly revision: number;
  readonly anchorX: number;
  readonly anchorZ: number;
  readonly impacts: readonly SecondarySprayInteractionImpact[];
}

/** Writes one deterministic, allocation-free secondary-spray candidate batch. */
export function writeSecondarySprayCandidates(
  snapshot: OpenWaterRuntimeSnapshot,
  interaction: SecondarySprayInteractionSnapshot,
  stormFront: StormFrontFrame,
  camera: PerspectiveCamera,
  count: number,
  writer: SecondarySprayCandidateWriter,
): number {
  const impacts = interaction.impacts;
  const canonicalImpactCount = canonicalizeInteractionStableSources(
    impacts,
    writer.impactStableSourceIds,
    writer.impactSourceOrder,
  );
  let impactCount = 0;
  let heroImpactCount = 0;
  for (
    let canonicalIndex = 0;
    canonicalIndex < canonicalImpactCount;
    canonicalIndex += 1
  ) {
    const sourceIndex = writer.impactSourceOrder[canonicalIndex];
    const impact = sourceIndex === undefined ? undefined : impacts[sourceIndex];
    if (sourceIndex === undefined || impact === undefined) {
      throw new Error(
        "A canonical secondary-spray source is missing from prepared scratch.",
      );
    }
    switch (impact.kind) {
      case "hero-breaker":
        if (heroImpactCount >= writer.heroImpactSourceOrder.length) {
          throw new Error(
            "Secondary spray Hero Breaker source capacity was exceeded.",
          );
        }
        writer.heroImpactSourceOrder[heroImpactCount] = sourceIndex;
        heroImpactCount += 1;
        break;
      case "radial-impact":
      case "directional-wake":
      case "propeller-wash":
        writer.impactSourceOrder[impactCount] = sourceIndex;
        impactCount += 1;
        break;
      default:
        throw new Error(
          "Secondary spray received an unknown interaction kind.",
        );
    }
  }
  let requestedHeroCandidateCount = 0;
  const evaluationTick =
    interaction.revision === -1 ? snapshot.tick + 1 : snapshot.tick;
  for (let heroIndex = 0; heroIndex < heroImpactCount; heroIndex += 1) {
    const sourceIndex = writer.heroImpactSourceOrder[heroIndex];
    const hero = sourceIndex === undefined ? undefined : impacts[sourceIndex];
    if (hero !== undefined && heroBreakerIsActive(evaluationTick, hero)) {
      requestedHeroCandidateCount += heroBreakerCandidateCount(
        hero.sprayAmount,
      );
    }
  }
  const requestedRainCandidateCount = weatherCandidateCount(
    stormFront.rainSprayStrength,
    MAX_SECONDARY_RAIN_SPRAY_CANDIDATES,
  );
  const requestedAerosolCandidateCount = weatherCandidateCount(
    stormFront.stormAerosolStrength,
    MAX_SECONDARY_STORM_AEROSOL_CANDIDATES,
  );
  const requestedFixedPartitionCount =
    requestedHeroCandidateCount +
    requestedRainCandidateCount +
    requestedAerosolCandidateCount;
  const storageCapacity = candidateStorageCapacity(writer.storage);
  if (requestedFixedPartitionCount > storageCapacity) {
    throw new Error(
      "Secondary spray weather and Hero Breaker partitions exceed prepared candidate capacity.",
    );
  }
  const generalCandidateCount = Math.min(
    count,
    storageCapacity - requestedFixedPartitionCount,
  );
  const focalCount = Math.min(
    writer.minimumRetainedSlots,
    generalCandidateCount,
  );
  camera.updateWorldMatrix(true, false);
  const cameraWorld = camera.matrixWorld.elements;
  const cameraX = cameraWorld[12] ?? 0;
  const cameraY = cameraWorld[13] ?? 0;
  const cameraZ = cameraWorld[14] ?? 0;
  const cameraRightX = cameraWorld[0] ?? 1;
  const cameraRightZ = cameraWorld[2] ?? 0;
  const rawCameraForwardX = -(cameraWorld[8] ?? 0);
  const rawCameraForwardZ = -(cameraWorld[10] ?? 1);
  const horizontalForwardLength = Math.hypot(
    rawCameraForwardX,
    rawCameraForwardZ,
  );
  const cameraForwardX =
    horizontalForwardLength > 0
      ? rawCameraForwardX / horizontalForwardLength
      : 0;
  const cameraForwardZ =
    horizontalForwardLength > 0
      ? rawCameraForwardZ / horizontalForwardLength
      : -1;
  const pixelsPerRadian =
    writer.contributionReference.height /
    (2 * Math.tan((camera.fov * Math.PI) / 360));
  const storage = writer.storage;

  for (let ordinal = 0; ordinal < generalCandidateCount; ordinal += 1) {
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

  let ordinal = generalCandidateCount;
  for (
    let sourceLocalOrdinal = 0;
    sourceLocalOrdinal < requestedRainCandidateCount;
    sourceLocalOrdinal += 1
  ) {
    const particleLifetimeTicks =
      8 +
      (mix32(sourceLocalOrdinal ^ SECONDARY_RAIN_SPRAY_STABLE_SOURCE_ID) % 9);
    const spawnPhase =
      mix32(sourceLocalOrdinal + SECONDARY_RAIN_SPRAY_STABLE_SOURCE_ID) %
      particleLifetimeTicks;
    const ageTicks = positiveModulo(
      stormFront.tick - spawnPhase,
      particleLifetimeTicks,
    );
    const spawnEpochTick = stormFront.tick - ageTicks;
    writer.stableKeyWriter.writeAt(
      storage.stableKeys,
      ordinal,
      stormFront.seed,
      SECONDARY_RAIN_SPRAY_STABLE_SOURCE_ID,
      spawnEpochTick,
      sourceLocalOrdinal,
    );
    const keyHigh = storage.stableKeys.high[ordinal] ?? 0;
    const keyLow = storage.stableKeys.low[ordinal] ?? 0;
    storage.payloadHandles[ordinal] = ordinal;

    const randomA = unitFloat(mix32(keyLow ^ 0x9e37_79b9));
    const randomB = unitFloat(mix32(keyHigh ^ 0x27d4_eb2d));
    const randomC = unitFloat(mix32(keyLow ^ keyHigh ^ 0x1656_67b1));
    const forwardDistance = 4 + randomB * 18;
    const lateralDistance = (randomA * 2 - 1) * (1.2 + forwardDistance * 0.25);
    const windOffset =
      (randomC - 0.5) *
      (ageTicks / FIXED_TICKS_PER_SECOND) *
      (0.5 + stormFront.spatialPhase);
    const x =
      cameraX +
      cameraForwardX * forwardDistance +
      cameraRightX * (lateralDistance + windOffset);
    const z =
      cameraZ +
      cameraForwardZ * forwardDistance +
      cameraRightZ * (lateralDistance + windOffset);
    const y = snapshot.seaLevelMetres + 0.04 + randomC * 0.72;
    const positionOffset = ordinal * 3;
    storage.positions[positionOffset] = x;
    storage.positions[positionOffset + 1] = y;
    storage.positions[positionOffset + 2] = z;

    const cameraDistance = Math.max(
      0.25,
      Math.hypot(x - cameraX, y - cameraY, z - cameraZ),
    );
    const worldRadius = 0.018 + randomC * 0.045;
    const diameterPixels = Math.max(
      0.5,
      Math.min(24, (worldRadius * 2 * pixelsPerRadian) / cameraDistance),
    );
    storage.sizes[ordinal] = diameterPixels;
    const projectedAreaPixels =
      Math.PI * diameterPixels * diameterPixels * 0.25;
    const normalizedAge = ageTicks / particleLifetimeTicks;
    const opacity =
      clampUnit(stormFront.rainSprayStrength) *
      (0.32 + randomA * 0.5) *
      (0.45 + Math.sin(normalizedAge * Math.PI) * 0.55);
    const contrast = 0.48 + randomB * 0.38;
    // Weather shares the post-TRAA consumer's output-frustum visibility.
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
    const radiance = opacity * (0.58 + randomC * 0.18);
    const colorOffset = ordinal * 4;
    storage.colors[colorOffset] = radiance * 0.72;
    storage.colors[colorOffset + 1] = radiance * 0.84;
    storage.colors[colorOffset + 2] = radiance;
    storage.colors[colorOffset + 3] = opacity;
    ordinal += 1;
  }

  for (
    let sourceLocalOrdinal = 0;
    sourceLocalOrdinal < requestedAerosolCandidateCount;
    sourceLocalOrdinal += 1
  ) {
    const particleLifetimeTicks =
      90 +
      (mix32(sourceLocalOrdinal ^ SECONDARY_STORM_AEROSOL_STABLE_SOURCE_ID) %
        91);
    const spawnPhase =
      mix32(sourceLocalOrdinal + SECONDARY_STORM_AEROSOL_STABLE_SOURCE_ID) %
      particleLifetimeTicks;
    const ageTicks = positiveModulo(
      stormFront.tick - spawnPhase,
      particleLifetimeTicks,
    );
    const spawnEpochTick = stormFront.tick - ageTicks;
    writer.stableKeyWriter.writeAt(
      storage.stableKeys,
      ordinal,
      stormFront.seed,
      SECONDARY_STORM_AEROSOL_STABLE_SOURCE_ID,
      spawnEpochTick,
      sourceLocalOrdinal,
    );
    const keyHigh = storage.stableKeys.high[ordinal] ?? 0;
    const keyLow = storage.stableKeys.low[ordinal] ?? 0;
    storage.payloadHandles[ordinal] = ordinal;

    const randomA = unitFloat(mix32(keyLow ^ 0x94d0_49bb));
    const randomB = unitFloat(mix32(keyHigh ^ 0xed5a_d4bb));
    const randomC = unitFloat(mix32(keyLow ^ keyHigh ^ 0x3184_8bab));
    const forwardDistance = 8 + randomB * 28;
    const lateralDistance = (randomA * 2 - 1) * (3 + forwardDistance * 0.4);
    const drift =
      (ageTicks / FIXED_TICKS_PER_SECOND) *
      (0.08 + stormFront.spatialPhase * 0.16);
    const x =
      cameraX +
      cameraForwardX * (forwardDistance + drift) +
      cameraRightX * lateralDistance;
    const z =
      cameraZ +
      cameraForwardZ * (forwardDistance + drift) +
      cameraRightZ * lateralDistance;
    const y = snapshot.seaLevelMetres + 0.55 + randomC * 5.2;
    const positionOffset = ordinal * 3;
    storage.positions[positionOffset] = x;
    storage.positions[positionOffset + 1] = y;
    storage.positions[positionOffset + 2] = z;

    const cameraDistance = Math.max(
      0.25,
      Math.hypot(x - cameraX, y - cameraY, z - cameraZ),
    );
    const worldRadius = 0.42 + randomC * 1.18;
    const diameterPixels = Math.max(
      1,
      Math.min(96, (worldRadius * 2 * pixelsPerRadian) / cameraDistance),
    );
    storage.sizes[ordinal] = diameterPixels;
    const projectedAreaPixels =
      Math.PI * diameterPixels * diameterPixels * 0.25;
    const normalizedAge = ageTicks / particleLifetimeTicks;
    const opacity =
      clampUnit(stormFront.stormAerosolStrength) *
      (0.014 + randomA * 0.045) *
      (0.65 + Math.sin(normalizedAge * Math.PI) * 0.35);
    const contrast = 0.12 + randomB * 0.2;
    // Aerosol uses the same output-frustum visibility and Q16 pressure ruler.
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
    const radiance = opacity * (0.34 + randomC * 0.12);
    const colorOffset = ordinal * 4;
    storage.colors[colorOffset] = radiance * 0.62;
    storage.colors[colorOffset + 1] = radiance * 0.72;
    storage.colors[colorOffset + 2] = radiance * 0.82;
    storage.colors[colorOffset + 3] = opacity;
    ordinal += 1;
  }

  for (let heroIndex = 0; heroIndex < heroImpactCount; heroIndex += 1) {
    const sourceIndex = writer.heroImpactSourceOrder[heroIndex];
    const hero = sourceIndex === undefined ? undefined : impacts[sourceIndex];
    if (
      sourceIndex === undefined ||
      hero === undefined ||
      !heroBreakerIsActive(evaluationTick, hero)
    ) {
      continue;
    }
    const sourceId = writer.impactStableSourceIds[sourceIndex];
    if (sourceId === undefined) {
      throw new Error(
        "A canonical Hero Breaker spray source is missing from prepared scratch.",
      );
    }
    const sourceCandidateCount = heroBreakerCandidateCount(hero.sprayAmount);
    for (
      let sourceLocalOrdinal = 0;
      sourceLocalOrdinal < sourceCandidateCount;
      sourceLocalOrdinal += 1
    ) {
      const particleLifetimeTicks =
        18 + (mix32(sourceLocalOrdinal ^ (sourceId >>> 0)) % 25);
      const spawnPhase =
        mix32(sourceLocalOrdinal ^ (sourceId >>> 0) ^ 0x7a31_89d5) %
        particleLifetimeTicks;
      const sourceAgeTicks = evaluationTick - hero.startTick;
      const generation = Math.floor(
        (sourceAgeTicks - spawnPhase) / particleLifetimeTicks,
      );
      const spawned = generation >= 0;
      const spawnEpochTick =
        hero.startTick +
        spawnPhase +
        Math.max(0, generation) * particleLifetimeTicks;
      const ageTicks = spawned ? evaluationTick - spawnEpochTick : 0;
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

      const randomA = unitFloat(mix32(keyLow ^ 0x61af_d289));
      const randomB = unitFloat(mix32(keyHigh ^ 0xc7e4_102b));
      const randomC = unitFloat(mix32(keyLow ^ keyHigh ^ 0x35b9_7f11));
      const sourceProgress = sourceAgeTicks / hero.lifetimeTicks;
      const sourceEnvelope = Math.min(
        1,
        sourceProgress / 0.18,
        (1 - sourceProgress) / 0.25,
      );
      const particleEnvelope = spawned
        ? Math.min(1, ageTicks / 3, (particleLifetimeTicks - ageTicks) / 6)
        : 0;
      const ageSeconds = ageTicks / FIXED_TICKS_PER_SECOND;
      const crestCenter =
        HERO_BREAKER_INITIAL_CREST_CENTER_RADII +
        sourceProgress * HERO_BREAKER_FORWARD_TRAVEL_RADII;
      const along = hero.radius * (crestCenter + (randomA - 0.5) * 0.22);
      const lateral = hero.radius * (randomB * 2 - 1) * 0.5;
      const drift = (0.4 + randomC * 1.6) * ageSeconds;
      const x =
        hero.x + hero.directionX * (along + drift) - hero.directionZ * lateral;
      const z =
        hero.z + hero.directionZ * (along + drift) + hero.directionX * lateral;
      const kind = mix32(keyHigh ^ sourceLocalOrdinal) % 3;
      const initialVerticalSpeed =
        kind === 0
          ? 2.4 + Math.abs(hero.amplitude) * 1.4 + randomB * 3.6
          : kind === 1
            ? 1.3 + Math.abs(hero.amplitude) + randomB * 2.5
            : 0.45 + randomB * 0.55;
      const y =
        snapshot.seaLevelMetres +
        Math.abs(hero.amplitude) * (0.35 + sourceEnvelope * 0.45) +
        initialVerticalSpeed * ageSeconds -
        (kind === 2 ? 0.2 : 4.9) * ageSeconds * ageSeconds;
      const positionOffset = ordinal * 3;
      storage.positions[positionOffset] = x;
      storage.positions[positionOffset + 1] = y;
      storage.positions[positionOffset + 2] = z;

      const dx = x - cameraX;
      const dy = y - cameraY;
      const dz = z - cameraZ;
      const cameraDistance = Math.max(0.25, Math.hypot(dx, dy, dz));
      const worldRadius =
        kind === 2
          ? 0.1 + randomC * 0.22
          : kind === 1
            ? 0.035 + randomC * 0.1
            : 0.018 + randomC * 0.065;
      const diameterPixels = Math.max(
        0.5,
        Math.min(64, (worldRadius * 2 * pixelsPerRadian) / cameraDistance),
      );
      storage.sizes[ordinal] = diameterPixels;
      const projectedAreaPixels =
        Math.PI * diameterPixels * diameterPixels * 0.25;
      const opacity =
        particleEnvelope *
        sourceEnvelope *
        clampUnit(hero.sprayAmount) *
        (kind === 2 ? 0.08 + randomA * 0.17 : 0.2 + randomA * 0.45);
      const contrast =
        kind === 2 ? 0.2 + randomB * 0.25 : 0.38 + randomB * 0.32;
      // Like general spray, Hero droplets are a post-TRAA overlay with only
      // deterministic output-frustum visibility available on the CPU.
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
      const radiance = opacity * (kind === 2 ? 0.34 : kind === 1 ? 0.62 : 0.78);
      const colorOffset = ordinal * 4;
      storage.colors[colorOffset] = radiance * (kind === 2 ? 0.72 : 0.84);
      storage.colors[colorOffset + 1] = radiance * (kind === 2 ? 0.82 : 0.92);
      storage.colors[colorOffset + 2] = radiance;
      storage.colors[colorOffset + 3] = opacity;
      ordinal += 1;
    }
  }
  return ordinal;
}

function heroBreakerIsActive(
  tick: number,
  source: SecondarySprayInteractionImpact,
): boolean {
  return (
    source.kind === "hero-breaker" &&
    source.sprayAmount > 0 &&
    source.lifetimeTicks > 0 &&
    tick >= source.startTick &&
    tick < source.startTick + source.lifetimeTicks
  );
}

function heroBreakerCandidateCount(sprayAmount: number): number {
  const amount = clampUnit(sprayAmount);
  return amount === 0
    ? 0
    : Math.ceil(amount * MAX_SECONDARY_SPRAY_CANDIDATES_PER_HERO_BREAKER);
}

function weatherCandidateCount(strength: number, maximum: number): number {
  const amount = clampUnit(strength);
  return amount === 0 ? 0 : Math.ceil(amount * maximum);
}

function candidateStorageCapacity(
  storage: SecondarySprayCandidateStorage,
): number {
  const capacity = storage.contributionsQ16.length;
  if (
    storage.stableKeys.high.length < capacity ||
    storage.stableKeys.low.length < capacity ||
    storage.payloadHandles.length < capacity ||
    storage.positions.length < capacity * 3 ||
    storage.sizes.length < capacity ||
    storage.colors.length < capacity * 4
  ) {
    throw new Error("Secondary spray candidate storage is undersized.");
  }
  return capacity;
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

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}
