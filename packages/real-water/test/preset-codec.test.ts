import { describe, expect, it } from "vitest";
import { createReferenceEnvironmentPreset } from "../src/environment-preset.js";
import { createMinimalWaterQualityProfile } from "../src/quality-profile.js";
import { createReferenceShowcasePreset } from "../src/showcase-preset.js";
import { createWaterPreset } from "../src/water-preset.js";
import {
  exportPresetJson,
  importPresetJson,
  type PresetDocument,
} from "../src/preset-codec.js";
import type { ArtisticControls } from "../src/runtime.js";

// Versions 1 through 3 predate the spectral whitecap Artistic Controls, so a
// repository-authentic historical payload carries only the thirteen optical
// controls, in their original order.
function withoutWhitecapControls(
  controls: ArtisticControls,
): Record<string, number> {
  const legacy: Record<string, number> = { ...controls };
  delete legacy.whitecapAmount;
  delete legacy.foamPersistence;
  return legacy;
}

describe("Preset JSON codec", () => {
  it("round-trips every current preset schema through one public seam", () => {
    const presets: readonly PresetDocument[] = [
      createWaterPreset("storm"),
      createReferenceEnvironmentPreset(),
      createMinimalWaterQualityProfile("minimal-high-detail"),
      createReferenceShowcasePreset(),
    ];

    for (const preset of presets) {
      const rawJson = exportPresetJson(preset);
      const imported = importPresetJson(rawJson);

      expect(imported).toEqual({
        status: "current",
        sourceVersion: preset.version,
        preset,
      });
      if (imported.status !== "recovery") {
        expect(Object.isFrozen(imported.preset)).toBe(true);
      }
      expect(rawJson.endsWith("\n")).toBe(true);
    }
  });

  it("imports a known historical Water Preset through the explicit migration", () => {
    const current = createWaterPreset("storm");
    const rawJson = JSON.stringify({
      schema: current.schema,
      version: 2,
      id: current.id,
      presetHash:
        "sha256:85ff6bf8c652aaecb3d7aa3e3bf35c693264365c19cec1683c42fe2fb1164f9e",
      artisticControls: withoutWhitecapControls(current.artisticControls),
    });

    expect(importPresetJson(rawJson)).toEqual({
      status: "migrated",
      sourceVersion: 2,
      preset: current,
    });
  });

  it("imports a known historical Quality Profile through the explicit migration", () => {
    const current = createMinimalWaterQualityProfile("minimal");
    const rawJson = JSON.stringify({
      schema: current.schema,
      version: 1,
      id: current.id,
      profileHash:
        "sha256:10dcb2e1e7b9e4cf47a49e6805329fd9a9906c198537934603b65a219c4f1f86",
      surface: current.surface,
    });

    expect(importPresetJson(rawJson)).toEqual({
      status: "migrated",
      sourceVersion: 1,
      preset: current,
    });
  });

  it("preserves invalid and future JSON byte-for-byte for recovery", () => {
    const future = ` {\n  "schema": "real-water/environment-preset",\n  "version": 2,\n  "future": true\n} `;
    const invalid = `{"schema": "real-water/water-preset",`;

    expect(importPresetJson(future)).toEqual({
      status: "recovery",
      reason: "future-version",
      rawJson: future,
      detectedSchema: "real-water/environment-preset",
      detectedVersion: 2,
    });
    expect(importPresetJson(invalid)).toEqual({
      status: "recovery",
      reason: "invalid-json",
      rawJson: invalid,
    });
  });
});
