import { describe, expect, it } from "vitest";
import {
  ARTISTIC_CONTROL_DESCRIPTORS,
  ARTISTIC_CONTROL_KEYS,
  createStaticHostPresentationAdapter,
  createStaticHostSimulationAdapter,
  type ArtisticControlDescriptor,
} from "../src/index.js";
import { createRealWaterRuntime } from "../src/runtime.js";

const EXPECTED_DESCRIPTORS = [
  {
    key: "waveStrength",
    label: "Wave presence",
    description:
      "Sets the overall visual strength of the prepared sea, from still to bold.",
    group: "sea-character",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "swellDrama",
    label: "Swell drama",
    description: "Sets how much the longest swell band shapes the sea's drama.",
    group: "sea-character",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "directionality",
    label: "Directional focus",
    description:
      "Sets how strongly smaller wave bands follow the swell direction.",
    group: "sea-character",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "choppiness",
    label: "Surface choppiness",
    description: "Sets the visual strength of mid-scale surface chop.",
    group: "sea-character",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "crestSharpness",
    label: "Crest definition",
    description:
      "Sets how strongly every prepared wave band peaks at its crest.",
    group: "sea-character",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "microDetail",
    label: "Fine surface detail",
    description: "Sets the visual strength of the finest ripple detail.",
    group: "sea-character",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "timeScale",
    label: "Motion pace",
    description: "Sets how quickly all prepared wave bands move.",
    group: "sea-character",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "grazingReflection",
    label: "Grazing reflection",
    description:
      "Sets how strongly glancing views reflect the Host environment.",
    group: "surface-optics",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "environmentReflection",
    label: "Environment reflection",
    description:
      "Sets how strongly Host environment radiance appears on the surface.",
    group: "surface-optics",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "depthSeeThrough",
    label: "Depth clarity",
    description:
      "Sets how clearly the Host scene remains visible through the water.",
    group: "surface-optics",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "depthColoring",
    label: "Depth color",
    description: "Sets how quickly water color builds with viewed depth.",
    group: "surface-optics",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "inWaterGlow",
    label: "In-water glow",
    description: "Sets how much glow gathers through the water.",
    group: "surface-optics",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "crestGlow",
    label: "Crest glow",
    description: "Sets how brightly thin crests transmit light.",
    group: "surface-optics",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "whitecapAmount",
    label: "Whitecap amount",
    description: "Sets how readily steep crests form persistent whitecaps.",
    group: "whitewater",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "foamPersistence",
    label: "Foam persistence",
    description:
      "Sets how long generated foam remains visible while moving and breaking up.",
    group: "whitewater",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "underwaterHaze",
    label: "Underwater haze",
    description: "Sets the density of depth-aware underwater haze.",
    group: "underwater",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "underwaterTurbidity",
    label: "Underwater turbidity",
    description:
      "Sets how strongly distant underwater light is absorbed and scattered.",
    group: "underwater",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "underwaterLightShafts",
    label: "Underwater light shafts",
    description: "Sets the strength of depth-shadowed underwater sun shafts.",
    group: "underwater",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "underwaterColor",
    label: "Underwater color",
    description:
      "Sets the strength of the authored underwater depth-color palette.",
    group: "underwater",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "underwaterExposure",
    label: "Underwater exposure",
    description: "Sets the exposure used only while the camera is submerged.",
    group: "underwater",
    min: 0,
    max: 2,
    step: 0.01,
  },
] satisfies readonly ArtisticControlDescriptor[];

describe("Artistic Control descriptors", () => {
  it("publishes the exact perceptual metadata and key order", () => {
    expect(ARTISTIC_CONTROL_DESCRIPTORS).toEqual(EXPECTED_DESCRIPTORS);
    expect(ARTISTIC_CONTROL_KEYS).toEqual(
      EXPECTED_DESCRIPTORS.map((descriptor) => descriptor.key),
    );
    expect(ARTISTIC_CONTROL_KEYS).toHaveLength(20);
  });

  it("freezes the descriptor collection, every descriptor, and the key order", () => {
    expect(Object.isFrozen(ARTISTIC_CONTROL_DESCRIPTORS)).toBe(true);
    expect(
      ARTISTIC_CONTROL_DESCRIPTORS.every((descriptor) =>
        Object.isFrozen(descriptor),
      ),
    ).toBe(true);
    expect(Object.isFrozen(ARTISTIC_CONTROL_KEYS)).toBe(true);
  });

  it("uses every descriptor range as the runtime acceptance boundary", () => {
    const runtime = createRealWaterRuntime(
      () => {},
      createStaticHostSimulationAdapter(),
      createStaticHostPresentationAdapter(),
    );
    const baseline = runtime.inspectRuntime().artisticControls;

    for (const descriptor of ARTISTIC_CONTROL_DESCRIPTORS) {
      expect(() =>
        runtime.updateArtisticControls({
          ...baseline,
          [descriptor.key]: descriptor.min,
        }),
      ).not.toThrow();
      expect(() =>
        runtime.updateArtisticControls({
          ...baseline,
          [descriptor.key]: descriptor.max,
        }),
      ).not.toThrow();
      expect(() =>
        runtime.updateArtisticControls({
          ...baseline,
          [descriptor.key]: descriptor.min - descriptor.step,
        }),
      ).toThrow(
        `${descriptor.key} must be between ${descriptor.min} and ${descriptor.max}`,
      );
      expect(() =>
        runtime.updateArtisticControls({
          ...baseline,
          [descriptor.key]: descriptor.max + descriptor.step,
        }),
      ).toThrow(
        `${descriptor.key} must be between ${descriptor.min} and ${descriptor.max}`,
      );
    }
  });
});
