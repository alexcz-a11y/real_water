/**
 * Package-private deterministic identity writer shared by secondary-particle
 * consumers. It is intentionally not part of the root package export.
 */

const UINT32_RANGE = 0x1_0000_0000;
const FNV_OFFSET_A = 0x811c_9dc5;
const FNV_OFFSET_B = 0x9e37_79b9;
const FNV_PRIME = 0x0100_0193;

export interface SecondaryParticleStableKeyBuffers {
  readonly high: Uint32Array;
  readonly low: Uint32Array;
}

export interface SecondaryParticleConsumerKeyDomain {
  readonly consumerId: string;
  readonly high: number;
  readonly low: number;
}

export interface SecondaryParticleStableKeyWriter {
  readonly domain: SecondaryParticleConsumerKeyDomain;

  /**
   * Hashes runtimeSeed + canonical consumerId domain + stableSourceId +
   * spawnEpochTick + ordinal into the caller-owned buffers. Numeric identities
   * are non-negative safe integers; runtimeSeed and ordinal are uint32.
   * Construction is cold-path work and writeAt performs no allocation.
   */
  writeAt(
    target: SecondaryParticleStableKeyBuffers,
    index: number,
    runtimeSeed: number,
    stableSourceId: number,
    spawnEpochTick: number,
    ordinal: number,
  ): void;
}

/** Creates one allocation-free stable-key writer for a canonical consumer. */
export function createSecondaryParticleStableKeyWriter(
  consumerId: string,
): SecondaryParticleStableKeyWriter {
  assertCanonicalConsumerId(consumerId);
  const domain = hashCanonicalConsumerId(consumerId);

  return Object.freeze({
    domain,
    writeAt(
      target: SecondaryParticleStableKeyBuffers,
      index: number,
      runtimeSeed: number,
      stableSourceId: number,
      spawnEpochTick: number,
      ordinal: number,
    ): void {
      const sourceLow = stableSourceId >>> 0;
      const sourceHigh = Math.floor(stableSourceId / UINT32_RANGE) >>> 0;
      const epochLow = spawnEpochTick >>> 0;
      const epochHigh = Math.floor(spawnEpochTick / UINT32_RANGE) >>> 0;

      let high = foldWord(domain.high, runtimeSeed, 0xa511_e9b3);
      high = foldWord(high, domain.low, 0x63d8_35f1);
      high = foldWord(high, sourceLow, 0x91e1_0da5);
      high = foldWord(high, sourceHigh, 0xc2b2_ae35);
      high = foldWord(high, epochLow, 0x27d4_eb2d);
      high = foldWord(high, epochHigh, 0x1656_67b1);
      high = foldWord(high, ordinal, 0x85eb_ca6b);

      let low = foldWord(domain.low, runtimeSeed, 0x7feb_352d);
      low = foldWord(low, domain.high, 0x846c_a68b);
      low = foldWord(low, sourceHigh, 0x94d0_49bb);
      low = foldWord(low, sourceLow, 0xed5a_d4bb);
      low = foldWord(low, epochHigh, 0xac4c_1b51);
      low = foldWord(low, epochLow, 0x3184_8bab);
      low = foldWord(low, ordinal, 0x9e37_79b9);

      target.high[index] = high;
      target.low[index] = low;
    },
  });
}

function hashCanonicalConsumerId(
  consumerId: string,
): SecondaryParticleConsumerKeyDomain {
  let high = FNV_OFFSET_A;
  let low = FNV_OFFSET_B;
  const writeByte = (byte: number): void => {
    high = Math.imul(high ^ byte, FNV_PRIME) >>> 0;
    low = Math.imul(low ^ byte, 0x27d4_eb2d) >>> 0;
  };

  // Hash canonical UTF-8 bytes without allocating a temporary encoded buffer.
  for (const symbol of consumerId) {
    const codePoint = symbol.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      writeByte(codePoint);
    } else if (codePoint <= 0x7ff) {
      writeByte(0xc0 | (codePoint >>> 6));
      writeByte(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      writeByte(0xe0 | (codePoint >>> 12));
      writeByte(0x80 | ((codePoint >>> 6) & 0x3f));
      writeByte(0x80 | (codePoint & 0x3f));
    } else {
      writeByte(0xf0 | (codePoint >>> 18));
      writeByte(0x80 | ((codePoint >>> 12) & 0x3f));
      writeByte(0x80 | ((codePoint >>> 6) & 0x3f));
      writeByte(0x80 | (codePoint & 0x3f));
    }
  }

  return Object.freeze({
    consumerId,
    high: mix32(high ^ consumerId.length),
    low: mix32(low ^ Math.imul(consumerId.length, FNV_PRIME)),
  });
}

function foldWord(state: number, word: number, salt: number): number {
  return mix32(state ^ mix32((word + salt) >>> 0));
}

function mix32(input: number): number {
  let value = input >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function assertCanonicalConsumerId(consumerId: string): void {
  if (
    consumerId.length === 0 ||
    consumerId !== consumerId.trim() ||
    consumerId !== consumerId.normalize("NFC")
  ) {
    throw new TypeError(
      "Secondary-particle key domains require a canonical consumerId.",
    );
  }
}
