import { describe, expect, it } from "vitest";
import {
  REFERENCE_AUTHORED_LOOKS,
  isReferenceAuthoredLookId,
  resolveReferenceAuthoredLook,
} from "./reference-authored-looks.js";

describe("Reference authored looks", () => {
  it("owns the one closed mapping from mode labels to Water and Environment presets", () => {
    expect(REFERENCE_AUTHORED_LOOKS).toEqual([
      { id: "calm-sunrise", label: "Calm Sunrise" },
      { id: "blue-noon-swell", label: "Blue Noon Swell" },
      { id: "storm-front", label: "Storm Front" },
    ]);
    expect(
      REFERENCE_AUTHORED_LOOKS.map(({ id }) => {
        const resolved = resolveReferenceAuthoredLook(id);
        return [
          resolved.id,
          resolved.waterPreset.id,
          resolved.environmentPreset.id,
        ];
      }),
    ).toEqual([
      ["calm-sunrise", "calm", "calm-sunrise"],
      ["blue-noon-swell", "swell", "blue-noon"],
      ["storm-front", "storm", "storm-front"],
    ]);
    expect(Object.isFrozen(REFERENCE_AUTHORED_LOOKS)).toBe(true);
    expect(REFERENCE_AUTHORED_LOOKS.every(Object.isFrozen)).toBe(true);
  });

  it("provides the type guard used by Director and QA composition", () => {
    expect(isReferenceAuthoredLookId("calm-sunrise")).toBe(true);
    expect(isReferenceAuthoredLookId("blue-noon-swell")).toBe(true);
    expect(isReferenceAuthoredLookId("storm-front")).toBe(true);
    expect(isReferenceAuthoredLookId("reference")).toBe(false);
  });
});
