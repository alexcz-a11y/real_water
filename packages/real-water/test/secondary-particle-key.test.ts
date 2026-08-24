import { describe, expect, it } from "vitest";
import {
  createSecondaryParticleStableKeyWriter,
  type SecondaryParticleStableKeyBuffers,
} from "../src/secondary-particle-key.js";

const CONSUMER_IDS = [
  "spray-droplet-mist",
  "underwater-suspended-particles",
  "subsurface-foam-bubble-cloud",
  "rising-bubbles",
] as const;

function keyBuffers(count = 1): SecondaryParticleStableKeyBuffers {
  return {
    high: new Uint32Array(count),
    low: new Uint32Array(count),
  };
}

describe("secondary-particle stable keys", () => {
  it("replays the same key and separates canonical consumer domains", () => {
    const domains = new Set<string>();
    const keys = new Set<string>();

    for (const consumerId of CONSUMER_IDS) {
      const writer = createSecondaryParticleStableKeyWriter(consumerId);
      const replayWriter = createSecondaryParticleStableKeyWriter(consumerId);
      const first = keyBuffers();
      const replay = keyBuffers();

      writer.writeAt(first, 0, 0x1020_3040, 0x5060_7080, 0x1_0000_0011, 7);
      replayWriter.writeAt(
        replay,
        0,
        0x1020_3040,
        0x5060_7080,
        0x1_0000_0011,
        7,
      );

      expect(replay.high[0]).toBe(first.high[0]);
      expect(replay.low[0]).toBe(first.low[0]);
      expect(replayWriter.domain).toEqual(writer.domain);
      domains.add(`${String(writer.domain.high)}:${String(writer.domain.low)}`);
      keys.add(`${String(first.high[0])}:${String(first.low[0])}`);
    }

    expect(domains.size).toBe(CONSUMER_IDS.length);
    expect(keys.size).toBe(CONSUMER_IDS.length);
  });

  it("includes every consumer-owned identity field in the stable key", () => {
    const writer = createSecondaryParticleStableKeyWriter(CONSUMER_IDS[0]);
    const keys = keyBuffers(5);
    const identities = [
      [11, 22, 33, 44],
      [12, 22, 33, 44],
      [11, 23, 33, 44],
      [11, 22, 34, 44],
      [11, 22, 33, 45],
    ] as const;

    identities.forEach(
      ([runtimeSeed, stableSourceId, spawnEpochTick, ordinal], index) => {
        writer.writeAt(
          keys,
          index,
          runtimeSeed,
          stableSourceId,
          spawnEpochTick,
          ordinal,
        );
      },
    );

    expect(
      new Set(
        identities.map(
          (_, index) =>
            `${String(keys.high[index])}:${String(keys.low[index])}`,
        ),
      ).size,
    ).toBe(identities.length);
  });

  it.each(["", " spray-droplet-mist", "spray-droplet-mist ", "e\u0301"])(
    "rejects the non-canonical consumer id %j",
    (consumerId) => {
      expect(() => createSecondaryParticleStableKeyWriter(consumerId)).toThrow(
        /canonical consumerId/i,
      );
    },
  );
});
