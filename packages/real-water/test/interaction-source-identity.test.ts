import { describe, expect, it } from "vitest";
import {
  bodyInteractionStableSourceId,
  canonicalizeInteractionStableSources,
  createBodyInteractionSourceIdentityRegistry,
  manualInteractionStableSourceId,
} from "../src/interaction-source-identity.js";

describe("interaction source identity", () => {
  it("writes the same canonical source order for every input permutation", () => {
    const identities = [
      manualInteractionStableSourceId(29),
      bodyInteractionStableSourceId(7, "wake"),
      manualInteractionStableSourceId(17),
    ];
    const permutations = [
      identities,
      [identities[2], identities[0], identities[1]],
      [...identities].reverse(),
    ];
    const canonical = permutations.map((permutation) => {
      const sources = permutation.map((stableSourceId) => ({
        stableSourceId: stableSourceId ?? -1,
      }));
      const stableSourceIds = new Float64Array(128);
      const sourceOrder = new Uint32Array(128);
      const count = canonicalizeInteractionStableSources(
        sources,
        stableSourceIds,
        sourceOrder,
      );
      return Array.from(
        { length: count },
        (_, index) => stableSourceIds[sourceOrder[index] ?? 0] ?? -1,
      );
    });

    expect(canonical[1]).toEqual(canonical[0]);
    expect(canonical[2]).toEqual(canonical[0]);
    expect(canonical[0]).toEqual([...identities].sort((a, b) => a - b));
  });

  it("maps manual Uint32 identities losslessly and repeatably", () => {
    const first = [17, 29].map(manualInteractionStableSourceId);
    expect(first).toEqual([0x1_0000_0000 + 17, 0x1_0000_0000 + 29]);
    expect(
      first.map((stableSourceId) => stableSourceId % 0x1_0000_0000),
    ).toEqual([17, 29]);
    expect(manualInteractionStableSourceId(17)).toBe(first[0]);
  });

  it("derives Body source ids from domain tuples independent of reservation order", () => {
    const forward = createBodyInteractionSourceIdentityRegistry();
    const firstWake = forward.reserve(41, ["wake"]);
    const firstPropeller = forward.reserve(73, ["propeller-port"]);
    const reverse = createBodyInteractionSourceIdentityRegistry();
    const reversePropeller = reverse.reserve(73, ["propeller-port"]);
    const reverseWake = reverse.reserve(41, ["wake"]);

    expect(firstWake.sources[0]?.stableSourceId).toBe(
      reverseWake.sources[0]?.stableSourceId,
    );
    expect(firstPropeller.sources[0]?.stableSourceId).toBe(
      reversePropeller.sources[0]?.stableSourceId,
    );
    expect(
      Math.floor((firstWake.sources[0]?.stableSourceId ?? 0) / 0x1_0000_0000),
    ).toBeGreaterThanOrEqual(2);
  });

  it("reuses the same id after release and rejects active duplicates atomically", () => {
    const registry = createBodyInteractionSourceIdentityRegistry();
    const first = registry.reserve(19, ["wake"]);
    const stableSourceId = first.sources[0]?.stableSourceId;
    expect(() => registry.reserve(19, ["wake"])).toThrow(/already reserves/i);
    first.release();
    first.release();
    expect(registry.reserve(19, ["wake"]).sources[0]?.stableSourceId).toBe(
      stableSourceId,
    );

    expect(() => registry.reserve(20, ["bow", "bow"])).toThrow(
      /already reserves/i,
    );
    expect(registry.reserve(20, ["bow"]).sources).toHaveLength(1);
  });

  it("rejects invalid domain identities and non-canonical socket text without partial reservations", () => {
    const registry = createBodyInteractionSourceIdentityRegistry();
    for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => registry.reserve(invalid, ["wake"])).toThrow(
        /non-negative safe integer/i,
      );
    }
    expect(() => registry.reserve(24, ["wake", "e\u0301"])).toThrow(
      /NFC-normalized/i,
    );
    expect(registry.reserve(24, ["wake"]).sources).toHaveLength(1);
  });

  it("fails closed on active hash collisions and releases the reservation", () => {
    const collisionId = bodyInteractionStableSourceId(31, "wake");
    const registry = createBodyInteractionSourceIdentityRegistry(
      () => collisionId,
    );
    const first = registry.reserve(31, ["wake"]);
    expect(() => registry.reserve(32, ["stern"])).toThrow(/collision/i);
    first.release();
    expect(registry.reserve(32, ["stern"]).sources[0]?.stableSourceId).toBe(
      collisionId,
    );
  });
});
