import { describe, expect, it } from "vitest";
import { PerspectiveCamera } from "three/webgpu";
import { createWaterPreset } from "../src/water-preset.js";
import type { OpenWaterRuntimeSnapshot } from "../src/runtime.js";
import { createSecondaryParticleStableKeyWriter } from "../src/secondary-particle-key.js";
import { createSecondaryParticleOutputFrustumVisibility } from "../src/secondary-particle-visibility.js";
import { createSecondaryParticleContributionQuantizer } from "../src/secondary-particle-pool.js";
import {
  writeSecondarySprayCandidates,
  type SecondarySprayCandidateStorage,
  type SecondarySprayInteractionImpact,
} from "../src/secondary-spray-candidate-writer.js";

const reference = Object.freeze({
  width: 320,
  height: 180,
  space: "output-drawing-buffer" as const,
});

describe("secondary spray candidate writer", () => {
  it("writes byte-exact keys and contributions for every source permutation", () => {
    const impacts = [
      impact(0x1_0000_001d, 2),
      impact(0x1_0000_0011, -1),
      impact(0x1_0000_0017, 0),
    ] as const;
    const permutations = [
      impacts,
      [impacts[2], impacts[0], impacts[1]],
      [...impacts].reverse(),
    ] as const;
    const batches = permutations.map((sources) => writeBatch(sources));

    for (const batch of batches.slice(1)) {
      expect(batch.high).toEqual(batches[0]?.high);
      expect(batch.low).toEqual(batches[0]?.low);
      expect(batch.contributions).toEqual(batches[0]?.contributions);
      expect(batch.positions).toEqual(batches[0]?.positions);
      expect(batch.colors).toEqual(batches[0]?.colors);
    }
  });

  it("canonicalizes more than sixteen sources and rejects duplicate identities", () => {
    const impacts = Array.from({ length: 20 }, (_, index) =>
      impact(0x1_0000_0100 + index, index - 10),
    );
    const forward = writeBatch(impacts);
    const reverse = writeBatch([...impacts].reverse());

    expect(reverse.high).toEqual(forward.high);
    expect(reverse.low).toEqual(forward.low);
    expect(reverse.contributions).toEqual(forward.contributions);
    expect(reverse.positions).toEqual(forward.positions);
    expect(reverse.colors).toEqual(forward.colors);
    const duplicate = impacts[0];
    if (duplicate === undefined) {
      throw new Error("The spray identity test requires one source.");
    }
    expect(() => writeBatch([duplicate, duplicate])).toThrow(/unique/i);
  });
});

function writeBatch(impacts: readonly SecondarySprayInteractionImpact[]) {
  const count = 128;
  const storage: SecondarySprayCandidateStorage = {
    stableKeys: { high: new Uint32Array(count), low: new Uint32Array(count) },
    contributionsQ16: new Uint16Array(count),
    payloadHandles: new Uint32Array(count),
    positions: new Float32Array(count * 3),
    sizes: new Float32Array(count),
    colors: new Float32Array(count * 4),
  };
  const camera = new PerspectiveCamera(70, 16 / 9, 0.1, 200);
  camera.position.set(0, 2, 8);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  writeSecondarySprayCandidates(
    snapshot(),
    { anchorX: 0, anchorZ: 0, impacts },
    camera,
    count,
    {
      contributionReference: reference,
      quantizeContribution: createSecondaryParticleContributionQuantizer({
        projectedAreaResolution: reference,
        referenceResolution: reference,
      }),
      stableKeyWriter:
        createSecondaryParticleStableKeyWriter("spray-droplet-mist"),
      visibility: createSecondaryParticleOutputFrustumVisibility(reference),
      storage,
      minimumRetainedSlots: 64,
      impactStableSourceIds: new Float64Array(128),
      impactSourceOrder: new Uint32Array(128),
    },
  );
  return {
    high: storage.stableKeys.high,
    low: storage.stableKeys.low,
    contributions: storage.contributionsQ16,
    positions: storage.positions,
    colors: storage.colors,
  };
}

function impact(
  stableSourceId: number,
  x: number,
): SecondarySprayInteractionImpact {
  return Object.freeze({
    stableSourceId,
    x,
    z: -x * 0.5,
    directionX: 1,
    directionZ: 0,
    radius: 2,
    amplitude: 0.5,
  });
}

function snapshot(): OpenWaterRuntimeSnapshot {
  return Object.freeze({
    seed: 0x1020_3040,
    tick: 73,
    timeSeconds: 73 / 60,
    paused: false,
    originX: 0,
    originZ: 0,
    seaLevelMetres: 0,
    simulationResetRevision: 0,
    artisticControls: createWaterPreset("swell").artisticControls,
    controlRevision: 0,
    originRevision: 0,
    seaStateCutRevision: 0,
    cameraCutRevision: 0,
    interactionAnchor: Object.freeze({ x: 0, z: 0 }),
    interactionAnchorRevision: 0,
    activeDisturbanceCount: 3,
    activeBodyWakeCount: 0,
    attachedBodyCount: 0,
  });
}
