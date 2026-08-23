import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  QUALITY_PROFILE_SCHEMA,
  QUALITY_PROFILE_VERSION,
  createMinimalWaterQualityProfile,
  getMinimalWaterGeometrySegments,
  migrateQualityProfile,
  normalizeQualityProfile,
  qualityProfileIdentity,
  type QualityProfile,
} from "../src/quality-profile.js";
import { SUPPORTED_HOST_ENVIRONMENT_REFLECTION } from "../src/environment.js";
import {
  PREWARM_MANIFEST_VERSION,
  SUPPORTED_EFFECT_VARIANTS,
  createMinimalWaterPrewarmManifest,
  manifestIdentity,
  normalizePrewarmManifest,
  type PrewarmManifest,
} from "../src/manifest.js";

const NATIVE_TEMPORAL = Object.freeze({
  mode: "TRAA" as const,
  renderScale: 1 as const,
  resolutionPolicy: "drawing-buffer-exact" as const,
  taau: false as const,
  dynamicResolution: false as const,
  frameGeneration: false as const,
  msaaSamples: 0 as const,
  updateCadence: "host-present" as const,
});
const NATIVE_SSR_HISTORY = Object.freeze({
  mode: "temporal-reproject-specular" as const,
  accumulate: true as const,
  hitPointReprojection: true as const,
  maxFrames: 32 as const,
  historyFormat: "rgba16float" as const,
  resolveFormat: "rgba16float" as const,
  inputFormat: "rgba16float" as const,
  captureFormat: "rgba16float" as const,
  resetVelocityFormat: "rg16float" as const,
  normalFormat: "packed-rgba16float" as const,
  resetDomains: Object.freeze([
    "simulation-reset",
    "camera-cut",
    "origin-shift",
    "sea-state-cut",
    "waterline-crossing",
  ] as const),
  updateCadence: "host-present" as const,
});
const NATIVE_SSR = Object.freeze({
  mode: "current-frame" as const,
  history: NATIVE_SSR_HISTORY,
  updateCadence: "host-present" as const,
  stochastic: false as const,
  reflectNonMetals: false as const,
  binaryRefine: true as const,
  quality: 0.5 as const,
  maxDistance: 48 as const,
  thickness: 0.35 as const,
  resolutionPolicy: "drawing-buffer-exact" as const,
  resolutionScale: 1 as const,
  samples: 0 as const,
  rawFormat: "rgba16float" as const,
  compositeFormat: "rgba16float" as const,
  blurFormat: "rgba16float" as const,
  blurResolutionPolicy: "drawing-buffer-exact" as const,
  mipCount: 5 as const,
  blurQuality: 2 as const,
  blurRoute: "enabled" as const,
  screenEdgeFade: 0.08 as const,
  roughnessCutoff: 0.5 as const,
});
const NATIVE_REFLECTION = Object.freeze({
  environment: Object.freeze({ source: "host-adapter" as const }),
  planar: Object.freeze({
    resolutionPolicy: "drawing-buffer-exact" as const,
    format: "rgba8unorm-srgb" as const,
    samples: 0 as const,
  }),
  ssr: NATIVE_SSR,
});
const LOCAL_INTERACTION = Object.freeze({
  anchorCount: 1 as const,
  field: Object.freeze({
    radiusMetres: 48 as const,
    edgeFadeMetres: 8 as const,
    maxActiveDisturbances: 128 as const,
    snapshotBanks: 2 as const,
    maxSnapshotAgeTicks: 1 as const,
    radialImpactRoute: "analytic-uniform-array" as const,
  }),
});
const MINIMAL_PROFILE_HASH =
  "sha256:f896b4033ed12264eabcc4e88fc2f41cdbd9e8a2d2a70698b296683b586d3c3f";
const HIGH_DETAIL_PROFILE_HASH =
  "sha256:d33533c3f740eb2d9ef0d4a516f8e242ce22ca83ce90f38fb72f74e57c9738b3";
// The two shapes committed as version 6 on the two parallel branches: one
// added interaction, the other added whitecaps.
const LEGACY_V6_INTERACTION_PROFILES = Object.freeze({
  "minimal": Object.freeze({
    profileHash:
      "sha256:c60b0a30fa310fbc1f21270c413a35b5b6265d6f157e5f41233be4b8042d8ec5",
    segments: 128,
  }),
  "minimal-high-detail": Object.freeze({
    profileHash:
      "sha256:4cba756cba61d7f4e071605c4d6939c1ba76b2cab0ef500bcf5ed1be7404d7f4",
    segments: 256,
  }),
} as const);
const LEGACY_V6_WHITECAP_PROFILES = Object.freeze({
  "minimal": Object.freeze({
    profileHash:
      "sha256:e89f6484cb983b184dee0ee46a77f8f05561b97df2a37c4686525b73b53eda28",
    segments: 128,
  }),
  "minimal-high-detail": Object.freeze({
    profileHash:
      "sha256:008a6a813e5e048fca87cce20a13ea7c1a2187a146a4fda7e2a441f4e7d71a37",
    segments: 256,
  }),
} as const);
const LEGACY_V1_PROFILE_VARIANTS = Object.freeze([
  Object.freeze({
    "minimal": Object.freeze({
      profileHash:
        "sha256:869ac714e56e70d4ffb37b75ff85432accba3caa2feb62946dc341eca66735ec",
      segments: 1,
    }),
    "minimal-high-detail": Object.freeze({
      profileHash:
        "sha256:e76e54fc9cb01a477c3006634c5a1cf99bd96e605c6355ed2859241bcd2e6201",
      segments: 2,
    }),
  }),
  Object.freeze({
    "minimal": Object.freeze({
      profileHash:
        "sha256:10dcb2e1e7b9e4cf47a49e6805329fd9a9906c198537934603b65a219c4f1f86",
      segments: 128,
    }),
    "minimal-high-detail": Object.freeze({
      profileHash:
        "sha256:a528f78e921767962db0afcf519aed7dbfed894e54284fcb7b2c7d21e93e1d0b",
      segments: 256,
    }),
  }),
] as const);
const LEGACY_V2_TEMPORAL = Object.freeze({
  mode: "TRAA" as const,
  renderScale: 1 as const,
  resolutionPolicy: "drawing-buffer-exact" as const,
  taau: false as const,
  dynamicResolution: false as const,
  frameGeneration: false as const,
  msaaSamples: 0 as const,
});
const LEGACY_V2_PROFILES = Object.freeze({
  "minimal": Object.freeze({
    profileHash:
      "sha256:647ceaf12d769ddc4a95414593ca23131f3ec9a516a32341517609d4788cbc73",
    segments: 128,
  }),
  "minimal-high-detail": Object.freeze({
    profileHash:
      "sha256:975a61a72c43c660866970618ee747db41fab60cd54d6cce6654edd7376b8ba3",
    segments: 256,
  }),
} as const);
const LEGACY_PRE_RESET_SSR_HISTORY = Object.freeze({
  mode: "temporal-reproject-specular" as const,
  accumulate: true as const,
  hitPointReprojection: true as const,
  maxFrames: 32 as const,
  historyFormat: "rgba16float" as const,
  resolveFormat: "rgba16float" as const,
  inputFormat: "rgba16float" as const,
  captureFormat: "rgba16float" as const,
  normalFormat: "packed-rgba16float" as const,
  resetDomains: Object.freeze([
    "simulation-reset",
    "camera-cut",
    "origin-shift",
    "sea-state-cut",
  ] as const),
  updateCadence: "host-present" as const,
});
const LEGACY_PRE_RESET_PROFILES = Object.freeze({
  "minimal": Object.freeze({
    profileHash:
      "sha256:3ec933fa8238e5bfd50608dc451d8354374c8337e49c793f191a3ad86cdf67b2",
    segments: 128,
  }),
  "minimal-high-detail": Object.freeze({
    profileHash:
      "sha256:d61edd12017f4b8adfe9878fa2c116fd9831b1681ce8b52c5e474e012ad94886",
    segments: 256,
  }),
} as const);
const NATIVE_WHITECAPS = Object.freeze({
  mode: "spectral-ping-pong" as const,
  fixedTickHz: 60 as const,
  fieldResolution: 128 as const,
  tileSizeMetres: 256 as const,
  fieldFormat: "rgba16float" as const,
  stageLayout: "generation-history-advection-decay" as const,
  diffusionTaps: 3 as const,
  updateCadence: "host-fixed-tick" as const,
  captureResolutionPolicy: "drawing-buffer-exact" as const,
  captureFormat: "rgba16float" as const,
  resetDomains: Object.freeze([
    "simulation-reset",
    "seed-change",
    "tick-rewind",
    "time-rewind",
    "sea-state-cut",
  ] as const),
});
const MEMORY_PREWARM_DRAWING_BUFFER = Object.freeze({
  width: 320,
  height: 180,
});
const NEXT_DRAWING_BUFFER = Object.freeze({
  width: 384,
  height: 216,
});
const DRAWING_BUFFER_BOUND_BASE_FINGERPRINTS = Object.freeze({
  "water-scene-color":
    "sha256:7761ba3b4ab1e04567aa1e9e796d3a66e8dab91e157940cce9281e4eaf9e53fb",
  "water-scene-depth":
    "sha256:b1c0600e109f08f14c72d84ac848e85a64d47d69daf0406aa966911a0872a169",
  "water-render-target":
    "sha256:e6249a83e55512d997edbe3d8a2ce16875b2abc1f721bb48834a7281a419a262",
  "water-motion-vectors":
    "sha256:22d81a8fcf82eb4c38c70f64cbdd809d308218ae003cff43d3d0e4495c532026",
  "water-inverse-linear-depth":
    "sha256:fbf21f1edb1ad428145d3bcbe2a95a8d46ed4ecc1b171ece1c527e02297f8e44",
  "water-view-normal":
    "sha256:9202e800870f86fd41deba3fbec57a3a94469cce59e3c93eea5513c006345bb5",
  "water-optical-factors-target":
    "sha256:a5e8e85cd5f940d0994f62131051afb9922d6aad02ae9c93327a4eb1f98d527c",
  "water-history-rejection-target":
    "sha256:2d61d9c6e0c778789600c7b8bd0b6c11171cdceb8d627d779c47924e2296f42c",
  "water-history-rejection-route":
    "sha256:26a2465bc403ca51bdc7a57eb42cd57c2c8c3439ac49641e56f551d8db0f9276",
  "water-optical-diagnostics-a":
    "sha256:17bc4d8de01c8456f0cabc9ef93cd4b42994b069a7392abca453116b57189758",
  "water-optical-diagnostics-b":
    "sha256:36a1f57ebc891ac92a1d92f6257ea21e2b501a02b8d3df22dcc00a4c7d1133fa",
  "water-final-color-target":
    "sha256:95e187bfaa85ab73fddaa0060eb8d184622ffb5e1184b6ed83fb1840ac5c298d",
  "water-current-color-target":
    "sha256:e696b8999adaa67392cac034126b180ca2a99c4365fbf56099c912940313d771",
  "water-stock-traa-history":
    "sha256:48a08329f1097cf2c968d3623b945b709e44165c4cfeca9f4bb32b3462e3070e",
  "water-traa-resolve-jitter":
    "sha256:ba8bdc48d2842afd8f4f620e5296fce9bde9055047e4de7d593eec83dce25733",
  "water-render-route":
    "sha256:6cac0421e8bfc58786596e077221136c4f29dc249e4c70b557836692958322b4",
  "water-current-color-conversion":
    "sha256:ea19f958120b52c05d673abcec39db3aa8ca7157f326d5d4449a4faa0457c57c",
  "water-named-output-routes":
    "sha256:a5f86239f7b86685991bc1e5e0669cadc120c4acb3f9749c5dc70991735c444f",
  "water-ssr-raw-target":
    "sha256:5229f76bc28be7b7aa032fadcb3adabfada2202dde29a88f499d16fac9ba659f",
  "water-ssr-blur-target":
    "sha256:7de03a661f8f354b4936ce102689f719ec015d4fa9e56a01c9ac09521d790cb1",
  "water-ssr-composite-target":
    "sha256:e9e8d713d8c38ada27f083c3c3cca0698ea4df327b40e247450e0f3d0420b336",
  "water-ssr-route":
    "sha256:1a331354906edd1886eccf37a780586db70fa5d9326e29b65ef66f690f10dcee",
  "water-ssr-blur-copy-route":
    "sha256:0be4df8ca02cbf5d130d34c54d9fa60713d07cd1370eccc81c5c9bfef7b2ffb9",
  "water-ssr-blur-route":
    "sha256:12c33037a77f9494ee861a6b56807f479afdc0e68ce7cc46477dca3509fe92c3",
  "water-ssr-composite-route":
    "sha256:ff8885aece4baf4f604f40783c8b641c5338d5bea1d8f79ac3bb0e5d5dc5b893",
  "water-ssr-probe":
    "sha256:ee3f19cd28ba2891f410f0467b7ff688e477aa40926f72812e71a2932bc71104",
  "water-ssr-history-target":
    "sha256:01163977af38992ab615fb739c87de571568fe8e5d8b2abb4c0814f8e4f69159",
  "water-ssr-history-resolve-target":
    "sha256:668109307d81e0f44bb3b88df15cb4214ca818eead92cdcd79927a8543881b26",
  "water-ssr-history-beauty-target":
    "sha256:80863d1535f37527febcfa90f24e8c8d1cf5c3f2cbde6daf11730f028691aa8f",
  "water-ssr-history-beauty-route":
    "sha256:1fcc820049c348593edbe52c246d3201e5acd5f667fdf135fa1baf4529aaf5bb",
  "water-ssr-history-resolved-capture-target":
    "sha256:fb768c5c2f3ed1b26274913eeaa7185d686db9f4a01f4b88abb13fa2b59d562f",
  "water-ssr-history-resolved-copy-route":
    "sha256:cbd5fc2889a202ba3ebd2e514ea9e58379f5d3491339a6edae6fda3c2b5b4d0d",
  "water-ssr-history-previous-depth":
    "sha256:4a5523625b107bd68d4da4805bf1b76d73fdd9349ca1759449091a8ca1548aee",
  "water-ssr-history-previous-normal":
    "sha256:e06ddd63eec10a66ab84d8ad7a5d45712bfb4657f87dc4dfa59f8c84301ab065",
  "water-ssr-history-seed-route":
    "sha256:a795d239b5301dd3ffa64fd58a1ba3698244349ec7a4449851ee2ad3d074bd52",
  "water-ssr-history-resolve-route":
    "sha256:4b2e56c27d2a86a5c7896f9c8be33eaa45b2890c6b70347007e32ad06195584b",
  "water-ssr-history-accumulate-route":
    "sha256:f20d52a23de875e18cf3f589f5d68f83357423af3f0ba268f2c377539b51e075",
  "water-ssr-history-reset-route":
    "sha256:c06ff1649e380debb6466059d6f548f4b582c592faf8c3719cef4d4e45df95ff",
  "water-ssr-history-reset-velocity-target":
    "sha256:ae0fedb85438f0e2219c04b0c688362e43f20519c0b35fa7a493228d44611a9f",
  "water-ssr-history-reset-velocity-route":
    "sha256:0eb74170734227ae0812e75df3cfcbd8a4bdceb09b3f62f97cabf97faa38403b",
  "water-ssr-history-probe":
    "sha256:42eac93d1c673fe058eb09c61f470083df6b7afa3683328e788656732491a2e6",
  "water-planar-reflection-target":
    "sha256:380ced36a62272cecd356b28c02587cb24d24d7390b6d79ac5051cad272a52ba",
  "water-planar-reflection-route":
    "sha256:717e164787f7d1d29b1111b1a80e75c1968ae31b5e3e3011a7d79cfb99238265",
  "water-planar-reflection-probe":
    "sha256:f203f71435dfe40d3d14d3b19b853fd13f8338aba138c1eee29400570074311e",
  "water-completion-probe":
    "sha256:d80c56dde025d2eeb391c93648ef11eda60ee07a9b9337afa1375484bd5268f3",
  "water-main-camera-guard":
    "sha256:ef72fd8cb5959aa73eeef6a857f67edc3f32b1b9f7e73b76b295f913ae6aca25",
  "water-whitecap-stage-target":
    "sha256:731d234e5ce0ccd2bb8c4102219849e318b619dc1ea21723562e9a0ebbd08969",
  "water-whitecap-stage-route":
    "sha256:caf42fa74e220528b2c24d8fe5831ce569629a93eba6a26bba085f18173d6666",
  "water-whitecap-probe":
    "sha256:d740f79214a0fbb393edfb647e59881e642cf6b9ba79347db72d990058a81881",
});
const DRAWING_BUFFER_BOUND_IDS = [
  "water-scene-color",
  "water-scene-depth",
  "water-render-target",
  "water-motion-vectors",
  "water-inverse-linear-depth",
  "water-view-normal",
  "water-optical-factors-target",
  "water-history-rejection-target",
  "water-history-rejection-route",
  "water-optical-diagnostics-a",
  "water-optical-diagnostics-b",
  "water-final-color-target",
  "water-current-color-target",
  "water-stock-traa-history",
  "water-traa-resolve-jitter",
  "water-render-route",
  "water-current-color-conversion",
  "water-named-output-routes",
  "water-completion-probe",
  "water-main-camera-guard",
  "water-planar-reflection-target",
  "water-planar-reflection-route",
  "water-planar-reflection-probe",
  "water-ssr-raw-target",
  "water-ssr-blur-target",
  "water-ssr-composite-target",
  "water-ssr-route",
  "water-ssr-blur-copy-route",
  "water-ssr-blur-route",
  "water-ssr-composite-route",
  "water-ssr-probe",
  "water-ssr-history-target",
  "water-ssr-history-resolve-target",
  "water-ssr-history-beauty-target",
  "water-ssr-history-beauty-route",
  "water-ssr-history-resolved-capture-target",
  "water-ssr-history-resolved-copy-route",
  "water-ssr-history-previous-depth",
  "water-ssr-history-previous-normal",
  "water-ssr-history-seed-route",
  "water-ssr-history-resolve-route",
  "water-ssr-history-accumulate-route",
  "water-ssr-history-reset-route",
  "water-ssr-history-reset-velocity-target",
  "water-ssr-history-reset-velocity-route",
  "water-ssr-history-probe",
  "water-whitecap-stage-target",
  "water-whitecap-stage-route",
  "water-whitecap-probe",
] as const;

function sha256Identifier(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function boundDeclarationHashInput(
  declaration: {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
  },
  drawingBuffer: { readonly width: number; readonly height: number },
) {
  return {
    id: declaration.id,
    kind: declaration.kind,
    label: declaration.label,
    baseFingerprint:
      DRAWING_BUFFER_BOUND_BASE_FINGERPRINTS[
        declaration.id as keyof typeof DRAWING_BUFFER_BOUND_BASE_FINGERPRINTS
      ],
    width: drawingBuffer.width,
    height: drawingBuffer.height,
  };
}

function canonicalManifestHashInput(manifest: PrewarmManifest) {
  return {
    schema: manifest.schema,
    version: manifest.version,
    id: manifest.id,
    qualityProfile: manifest.qualityProfile,
    drawingBuffer: manifest.drawingBuffer,
    environmentReflection: manifest.environmentReflection,
    effectVariants: manifest.effectVariants,
    declarations: manifest.declarations,
  };
}
const CORE_PREWARM_DECLARATION_IDS = [
  "water-texture",
  "water-environment-radiance",
  "water-scene-color",
  "water-scene-depth",
  "water-render-target",
  "water-clipmap",
  "water-local-interaction-field",
  "water-local-interaction-buffers",
  "water-local-interaction-radial-impact-route",
  "water-spectral-band-swell",
  "water-spectral-band-wind",
  "water-spectral-band-chop",
  "water-spectral-band-ripple",
  "water-whitecap-field-a",
  "water-whitecap-field-b",
  "water-whitecap-reset-route",
  "water-whitecap-generation-route",
  "water-whitecap-history",
  "water-whitecap-advection-route",
  "water-whitecap-diffusion-route",
  "water-whitecap-decay-route",
  "water-whitecap-stage-target",
  "water-whitecap-stage-route",
  "water-whitecap-probe",
  "water-material",
  "water-optical-route",
  "water-waterline-state",
  "water-underside-optical-route",
  "water-waterline-history-reset-route",
  "water-lens-wetness-transition",
  "water-planar-reflection-target",
  "water-planar-reflection-route",
  "water-planar-environment-fallback",
  "water-planar-reflection-probe",
  "water-ssr-raw-target",
  "water-ssr-blur-target",
  "water-ssr-composite-target",
  "water-ssr-route",
  "water-ssr-blur-copy-route",
  "water-ssr-blur-route",
  "water-ssr-composite-route",
  "water-ssr-probe",
  "water-ssr-history-target",
  "water-ssr-history-resolve-target",
  "water-ssr-history-beauty-target",
  "water-ssr-history-beauty-route",
  "water-ssr-history-resolved-capture-target",
  "water-ssr-history-resolved-copy-route",
  "water-ssr-history-previous-depth",
  "water-ssr-history-previous-normal",
  "water-ssr-history-seed-route",
  "water-ssr-history-resolve-route",
  "water-ssr-history-accumulate-route",
  "water-ssr-history-reset-route",
  "water-ssr-history-reset-velocity-target",
  "water-ssr-history-reset-velocity-route",
  "water-ssr-history-probe",
  "water-render-route",
  "water-procedural-motion",
  "water-motion-vectors",
  "water-inverse-linear-depth",
  "water-view-normal",
  "water-optical-factors-target",
  "water-history-rejection-target",
  "water-history-rejection-route",
  "water-optical-diagnostics-a",
  "water-optical-diagnostics-b",
  "water-final-color-target",
  "water-current-color-target",
  "water-stock-traa-history",
  "water-traa-resolve-jitter",
  "water-traa-reset-route",
  "water-current-color-conversion",
  "water-named-output-routes",
  "water-hidden-stabilization",
  "water-completion-probe",
  "water-main-camera-guard",
] as const;

describe("Quality Profiles", () => {
  it("pins spectral-whitecap history structure outside hot Artistic Controls", () => {
    const profile = createMinimalWaterQualityProfile();

    expect(profile.whitecaps).toEqual({
      mode: "spectral-ping-pong",
      fixedTickHz: 60,
      fieldResolution: 128,
      tileSizeMetres: 256,
      fieldFormat: "rgba16float",
      stageLayout: "generation-history-advection-decay",
      diffusionTaps: 3,
      updateCadence: "host-fixed-tick",
      captureResolutionPolicy: "drawing-buffer-exact",
      captureFormat: "rgba16float",
      resetDomains: [
        "simulation-reset",
        "seed-change",
        "tick-rewind",
        "time-rewind",
        "sea-state-cut",
      ],
    });
    expect(Object.isFrozen(profile.whitecaps)).toBe(true);
    expect(Object.isFrozen(profile.whitecaps.resetDomains)).toBe(true);
    expect(
      createMinimalWaterQualityProfile("minimal-high-detail").whitecaps
        .fieldResolution,
    ).toBe(256);
  });

  it("creates deterministic deeply immutable minimal-water structures", () => {
    const minimal = createMinimalWaterQualityProfile();
    const highDetail = createMinimalWaterQualityProfile("minimal-high-detail");

    expect(QUALITY_PROFILE_VERSION).toBe(7);
    expect(minimal).toEqual({
      schema: QUALITY_PROFILE_SCHEMA,
      version: 7,
      id: "minimal",
      profileHash: MINIMAL_PROFILE_HASH,
      surface: {
        geometry: {
          widthSegments: 128,
          heightSegments: 128,
        },
      },
      interaction: LOCAL_INTERACTION,
      temporal: NATIVE_TEMPORAL,
      reflection: NATIVE_REFLECTION,
      whitecaps: NATIVE_WHITECAPS,
    });
    expect(highDetail).toEqual({
      schema: QUALITY_PROFILE_SCHEMA,
      version: 7,
      id: "minimal-high-detail",
      profileHash: HIGH_DETAIL_PROFILE_HASH,
      surface: {
        geometry: {
          widthSegments: 256,
          heightSegments: 256,
        },
      },
      interaction: LOCAL_INTERACTION,
      temporal: NATIVE_TEMPORAL,
      reflection: NATIVE_REFLECTION,
      whitecaps: {
        ...NATIVE_WHITECAPS,
        fieldResolution: 256,
      },
    });
    expect(createMinimalWaterQualityProfile()).toEqual(minimal);
    expect(Object.isFrozen(minimal)).toBe(true);
    expect(Object.isFrozen(minimal.surface)).toBe(true);
    expect(Object.isFrozen(minimal.surface.geometry)).toBe(true);
    expect(Object.isFrozen(minimal.interaction)).toBe(true);
    expect(Object.isFrozen(minimal.interaction.field)).toBe(true);
    expect(Object.isFrozen(minimal.temporal)).toBe(true);
    expect(Object.isFrozen(minimal.reflection)).toBe(true);
    expect(Object.isFrozen(minimal.reflection.planar)).toBe(true);
    expect(Object.isFrozen(minimal.reflection.ssr)).toBe(true);
    expect(minimal.reflection.ssr.history).toEqual(NATIVE_SSR_HISTORY);
    expect(Object.isFrozen(minimal.reflection.ssr.history)).toBe(true);
    expect(minimal.reflection.ssr.mode).toBe("current-frame");
    expect(Object.isFrozen(highDetail)).toBe(true);
    expect(() => {
      (minimal.surface.geometry as { widthSegments: number }).widthSegments =
        99;
    }).toThrow(TypeError);
    expect(() => {
      (minimal.temporal as { msaaSamples: number }).msaaSamples = 4;
    }).toThrow(TypeError);
  });

  it("normalizes a supported profile into immutable structural evidence", () => {
    const candidate = structuredClone(
      createMinimalWaterQualityProfile("minimal-high-detail"),
    );
    const normalized = normalizeQualityProfile(candidate);
    const identity = qualityProfileIdentity(normalized);
    const geometry = getMinimalWaterGeometrySegments(normalized);

    expect(normalized).toEqual(candidate);
    expect(normalized).not.toBe(candidate);
    expect(identity).toEqual({
      schema: QUALITY_PROFILE_SCHEMA,
      version: 7,
      id: "minimal-high-detail",
      profileHash: HIGH_DETAIL_PROFILE_HASH,
    });
    expect(geometry).toEqual({ widthSegments: 256, heightSegments: 256 });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(geometry)).toBe(true);
    expect(Object.isFrozen(normalized.temporal)).toBe(true);
    expect(normalized.temporal).toEqual(NATIVE_TEMPORAL);
  });

  it("migrates the current Quality Profile through strict normalization", () => {
    const candidate = structuredClone(
      createMinimalWaterQualityProfile("minimal-high-detail"),
    );

    const migrated = migrateQualityProfile(candidate);

    expect(migrated).toEqual(
      createMinimalWaterQualityProfile("minimal-high-detail"),
    );
    expect(migrated).not.toBe(candidate);
    expect(Object.isFrozen(migrated)).toBe(true);
  });

  it("migrates both committed version 1 Quality Profile variants", () => {
    for (const variant of LEGACY_V1_PROFILE_VARIANTS) {
      for (const id of ["minimal", "minimal-high-detail"] as const) {
        const legacy = variant[id];
        const candidate = {
          schema: QUALITY_PROFILE_SCHEMA,
          version: 1,
          id,
          profileHash: legacy.profileHash,
          surface: {
            geometry: {
              widthSegments: legacy.segments,
              heightSegments: legacy.segments,
            },
          },
        };

        expect(migrateQualityProfile(candidate)).toEqual(
          createMinimalWaterQualityProfile(id),
        );
      }
    }
  });

  it("migrates the committed version 2 TRAA Quality Profiles", () => {
    for (const id of ["minimal", "minimal-high-detail"] as const) {
      const legacy = LEGACY_V2_PROFILES[id];
      const candidate = {
        schema: QUALITY_PROFILE_SCHEMA,
        version: 2,
        id,
        profileHash: legacy.profileHash,
        surface: {
          geometry: {
            widthSegments: legacy.segments,
            heightSegments: legacy.segments,
          },
        },
        temporal: LEGACY_V2_TEMPORAL,
      };

      expect(migrateQualityProfile(candidate)).toEqual(
        createMinimalWaterQualityProfile(id),
      );
    }
  });

  it("migrates the committed pre-reset version 5 Quality Profiles", () => {
    for (const id of ["minimal", "minimal-high-detail"] as const) {
      const legacy = LEGACY_PRE_RESET_PROFILES[id];
      const candidate = {
        schema: QUALITY_PROFILE_SCHEMA,
        version: 5,
        id,
        profileHash: legacy.profileHash,
        surface: {
          geometry: {
            widthSegments: legacy.segments,
            heightSegments: legacy.segments,
          },
        },
        temporal: NATIVE_TEMPORAL,
        reflection: {
          ...NATIVE_REFLECTION,
          ssr: {
            ...NATIVE_SSR,
            history: LEGACY_PRE_RESET_SSR_HISTORY,
          },
        },
      };

      expect(migrateQualityProfile(candidate)).toEqual(
        createMinimalWaterQualityProfile(id),
      );
    }
  });

  it("matches a legacy reset-domain list per variant, not against the current one", () => {
    const legacy = LEGACY_PRE_RESET_PROFILES.minimal;
    const candidate = {
      schema: QUALITY_PROFILE_SCHEMA,
      version: 5,
      id: "minimal",
      profileHash: legacy.profileHash,
      surface: {
        geometry: {
          widthSegments: legacy.segments,
          heightSegments: legacy.segments,
        },
      },
      temporal: NATIVE_TEMPORAL,
      reflection: {
        ...NATIVE_REFLECTION,
        ssr: {
          ...NATIVE_SSR,
          history: {
            ...LEGACY_PRE_RESET_SSR_HISTORY,
            resetDomains: [
              ...LEGACY_PRE_RESET_SSR_HISTORY.resetDomains,
              "waterline-crossing",
            ],
          },
        },
      },
    };

    expect(() => migrateQualityProfile(candidate)).toThrow(TypeError);
  });

  it("migrates both committed version 6 Quality Profiles", () => {
    for (const id of ["minimal", "minimal-high-detail"] as const) {
      const withInteraction = LEGACY_V6_INTERACTION_PROFILES[id];
      const withWhitecaps = LEGACY_V6_WHITECAP_PROFILES[id];
      const surface = {
        geometry: {
          widthSegments: withInteraction.segments,
          heightSegments: withInteraction.segments,
        },
      };
      const whitecaps = {
        ...NATIVE_WHITECAPS,
        fieldResolution: withWhitecaps.segments,
      };

      expect(
        migrateQualityProfile({
          schema: QUALITY_PROFILE_SCHEMA,
          version: 6,
          id,
          profileHash: withInteraction.profileHash,
          surface,
          interaction: LOCAL_INTERACTION,
          temporal: NATIVE_TEMPORAL,
          reflection: NATIVE_REFLECTION,
        }),
      ).toEqual(createMinimalWaterQualityProfile(id));

      expect(
        migrateQualityProfile({
          schema: QUALITY_PROFILE_SCHEMA,
          version: 6,
          id,
          profileHash: withWhitecaps.profileHash,
          surface,
          temporal: NATIVE_TEMPORAL,
          reflection: NATIVE_REFLECTION,
          whitecaps,
        }),
      ).toEqual(createMinimalWaterQualityProfile(id));
    }
  });

  it("refuses to mix the two committed version 6 shapes", () => {
    const surface = {
      geometry: { widthSegments: 128, heightSegments: 128 },
    };

    expect(() =>
      migrateQualityProfile({
        schema: QUALITY_PROFILE_SCHEMA,
        version: 6,
        id: "minimal",
        profileHash: LEGACY_V6_WHITECAP_PROFILES.minimal.profileHash,
        surface,
        interaction: LOCAL_INTERACTION,
        temporal: NATIVE_TEMPORAL,
        reflection: NATIVE_REFLECTION,
      }),
    ).toThrow(TypeError);

    expect(() =>
      migrateQualityProfile({
        schema: QUALITY_PROFILE_SCHEMA,
        version: 6,
        id: "minimal",
        profileHash: LEGACY_V6_INTERACTION_PROFILES.minimal.profileHash,
        surface,
        temporal: NATIVE_TEMPORAL,
        reflection: NATIVE_REFLECTION,
        whitecaps: NATIVE_WHITECAPS,
      }),
    ).toThrow(TypeError);
  });

  it.each([
    [
      "unknown version 3",
      { ...createMinimalWaterQualityProfile(), version: 3 },
    ],
    [
      "unknown version 4",
      { ...createMinimalWaterQualityProfile(), version: 4 },
    ],
    ["future version", { ...createMinimalWaterQualityProfile(), version: 8 }],
    [
      "version 1 hash tampering",
      {
        schema: QUALITY_PROFILE_SCHEMA,
        version: 1,
        id: "minimal",
        profileHash: `sha256:${"0".repeat(64)}`,
        surface: { geometry: { widthSegments: 1, heightSegments: 1 } },
      },
    ],
    [
      "version 1 variant mixing",
      {
        schema: QUALITY_PROFILE_SCHEMA,
        version: 1,
        id: "minimal",
        profileHash: LEGACY_V1_PROFILE_VARIANTS[0].minimal.profileHash,
        surface: { geometry: { widthSegments: 128, heightSegments: 128 } },
      },
    ],
    [
      "version 1 extra data",
      {
        schema: QUALITY_PROFILE_SCHEMA,
        version: 1,
        id: "minimal",
        profileHash: LEGACY_V1_PROFILE_VARIANTS[0].minimal.profileHash,
        surface: { geometry: { widthSegments: 1, heightSegments: 1 } },
        temporal: LEGACY_V2_TEMPORAL,
      },
    ],
    [
      "version 2 temporal tampering",
      {
        schema: QUALITY_PROFILE_SCHEMA,
        version: 2,
        id: "minimal",
        profileHash: LEGACY_V2_PROFILES.minimal.profileHash,
        surface: { geometry: { widthSegments: 128, heightSegments: 128 } },
        temporal: { ...LEGACY_V2_TEMPORAL, taau: true },
      },
    ],
    [
      "pre-reset version 5 history tampering",
      {
        schema: QUALITY_PROFILE_SCHEMA,
        version: 5,
        id: "minimal",
        profileHash: LEGACY_PRE_RESET_PROFILES.minimal.profileHash,
        surface: { geometry: { widthSegments: 128, heightSegments: 128 } },
        temporal: NATIVE_TEMPORAL,
        reflection: {
          ...NATIVE_REFLECTION,
          ssr: {
            ...NATIVE_SSR,
            history: { ...LEGACY_PRE_RESET_SSR_HISTORY, maxFrames: 31 },
          },
        },
      },
    ],
    [
      "current version 5 hash tampering",
      {
        ...createMinimalWaterQualityProfile(),
        profileHash: `sha256:${"0".repeat(64)}`,
      },
    ],
  ])("rejects %s instead of restoring by version or id", (_name, candidate) => {
    expect(() => migrateQualityProfile(candidate)).toThrow(TypeError);
  });

  it.each([
    [
      "unknown id",
      {
        ...createMinimalWaterQualityProfile(),
        id: "native",
      },
    ],
    [
      "profile hash drift",
      {
        ...createMinimalWaterQualityProfile(),
        profileHash: `sha256:${"0".repeat(64)}`,
      },
    ],
    [
      "geometry drift",
      {
        ...createMinimalWaterQualityProfile(),
        surface: { geometry: { widthSegments: 2, heightSegments: 1 } },
      },
    ],
    [
      "local interaction capacity drift",
      {
        ...createMinimalWaterQualityProfile(),
        interaction: {
          ...LOCAL_INTERACTION,
          field: {
            ...LOCAL_INTERACTION.field,
            maxActiveDisturbances: 129,
          },
        },
      },
    ],
    [
      "unknown structural fields",
      {
        ...createMinimalWaterQualityProfile(),
        surface: {
          ...createMinimalWaterQualityProfile().surface,
          nativeQuality: true,
        },
      },
    ],
    [
      "stale version",
      {
        ...createMinimalWaterQualityProfile(),
        version: 1,
      },
    ],
    [
      "temporal mode drift",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, mode: "TAAU" },
      },
    ],
    [
      "renderScale drift",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, renderScale: 0.5 },
      },
    ],
    [
      "taau enabled",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, taau: true },
      },
    ],
    [
      "dynamic resolution enabled",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, dynamicResolution: true },
      },
    ],
    [
      "frame generation enabled",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, frameGeneration: true },
      },
    ],
    [
      "msaaSamples drift",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, msaaSamples: 4 },
      },
    ],
    [
      "resolutionPolicy drift",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, resolutionPolicy: "viewport-shared" },
      },
    ],
    [
      "unknown temporal fields",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: { ...NATIVE_TEMPORAL, historyWeight: 0.9 },
      },
    ],
    [
      "missing resolutionPolicy",
      {
        ...createMinimalWaterQualityProfile(),
        temporal: {
          mode: NATIVE_TEMPORAL.mode,
          renderScale: NATIVE_TEMPORAL.renderScale,
          taau: NATIVE_TEMPORAL.taau,
          dynamicResolution: NATIVE_TEMPORAL.dynamicResolution,
          frameGeneration: NATIVE_TEMPORAL.frameGeneration,
          msaaSamples: NATIVE_TEMPORAL.msaaSamples,
        },
      },
    ],
    [
      "missing temporal",
      (() => {
        const profile = createMinimalWaterQualityProfile() as QualityProfile & {
          temporal?: unknown;
        };
        const rest = { ...profile };
        Reflect.deleteProperty(rest, "temporal");
        return rest;
      })(),
    ],
    [
      "missing reflection",
      (() => {
        const profile = createMinimalWaterQualityProfile() as QualityProfile & {
          reflection?: unknown;
        };
        const rest = { ...profile };
        Reflect.deleteProperty(rest, "reflection");
        return rest;
      })(),
    ],
    [
      "ssr history claimed",
      {
        ...createMinimalWaterQualityProfile(),
        reflection: {
          ...NATIVE_REFLECTION,
          ssr: { ...NATIVE_SSR, history: true },
        },
      },
    ],
    [
      "ssr history false",
      {
        ...createMinimalWaterQualityProfile(),
        reflection: {
          ...NATIVE_REFLECTION,
          ssr: { ...NATIVE_SSR, history: false },
        },
      },
    ],
    [
      "stale v4",
      {
        ...createMinimalWaterQualityProfile(),
        version: 4,
      },
    ],
    [
      "ssr history extra field",
      {
        ...createMinimalWaterQualityProfile(),
        reflection: {
          ...NATIVE_REFLECTION,
          ssr: {
            ...NATIVE_SSR,
            history: { ...NATIVE_SSR_HISTORY, requestReset: true },
          },
        },
      },
    ],
    [
      "ssr history missing input format",
      {
        ...createMinimalWaterQualityProfile(),
        reflection: {
          ...NATIVE_REFLECTION,
          ssr: {
            ...NATIVE_SSR,
            history: {
              mode: NATIVE_SSR_HISTORY.mode,
              accumulate: NATIVE_SSR_HISTORY.accumulate,
              hitPointReprojection: NATIVE_SSR_HISTORY.hitPointReprojection,
              maxFrames: NATIVE_SSR_HISTORY.maxFrames,
              historyFormat: NATIVE_SSR_HISTORY.historyFormat,
              resolveFormat: NATIVE_SSR_HISTORY.resolveFormat,
              normalFormat: NATIVE_SSR_HISTORY.normalFormat,
              resetDomains: NATIVE_SSR_HISTORY.resetDomains,
              updateCadence: NATIVE_SSR_HISTORY.updateCadence,
            },
          },
        },
      },
    ],
    [
      "ssr history missing reset velocity format",
      {
        ...createMinimalWaterQualityProfile(),
        reflection: {
          ...NATIVE_REFLECTION,
          ssr: {
            ...NATIVE_SSR,
            history: {
              mode: NATIVE_SSR_HISTORY.mode,
              accumulate: NATIVE_SSR_HISTORY.accumulate,
              hitPointReprojection: NATIVE_SSR_HISTORY.hitPointReprojection,
              maxFrames: NATIVE_SSR_HISTORY.maxFrames,
              historyFormat: NATIVE_SSR_HISTORY.historyFormat,
              resolveFormat: NATIVE_SSR_HISTORY.resolveFormat,
              inputFormat: NATIVE_SSR_HISTORY.inputFormat,
              captureFormat: NATIVE_SSR_HISTORY.captureFormat,
              normalFormat: NATIVE_SSR_HISTORY.normalFormat,
              resetDomains: NATIVE_SSR_HISTORY.resetDomains,
              updateCadence: NATIVE_SSR_HISTORY.updateCadence,
            },
          },
        },
      },
    ],
    [
      "ssr extra field",
      {
        ...createMinimalWaterQualityProfile(),
        reflection: {
          ...NATIVE_REFLECTION,
          ssr: { ...NATIVE_SSR, setHistory: true },
        },
      },
    ],
    [
      "ssr stochastic claimed",
      {
        ...createMinimalWaterQualityProfile(),
        reflection: {
          ...NATIVE_REFLECTION,
          ssr: { ...NATIVE_SSR, stochastic: true },
        },
      },
    ],
    [
      "missing ssr",
      {
        ...createMinimalWaterQualityProfile(),
        reflection: {
          environment: NATIVE_REFLECTION.environment,
          planar: NATIVE_REFLECTION.planar,
        },
      },
    ],
    [
      "planar samples drift",
      {
        ...createMinimalWaterQualityProfile(),
        reflection: {
          ...NATIVE_REFLECTION,
          planar: { ...NATIVE_REFLECTION.planar, samples: 4 },
        },
      },
    ],
  ])("fails closed on %s", (_name, candidate) => {
    expect(() =>
      normalizeQualityProfile(candidate as unknown as QualityProfile),
    ).toThrow();
  });

  it("rejects prototype property names as unsupported built-in ids", () => {
    expect(() =>
      createMinimalWaterQualityProfile("__proto__" as unknown as "minimal"),
    ).toThrow(RangeError);
  });
});

describe("Quality Profile manifests", () => {
  it("declares every prepared spectral-whitecap field and capture route", () => {
    const manifest = createMinimalWaterPrewarmManifest();
    const declarations = new Map(
      manifest.declarations.map((declaration) => [
        declaration.id,
        declaration.kind,
      ]),
    );

    expect(manifest.effectVariants).toContainEqual({
      effectId: "spectral-whitecaps",
      variantId: "persistent",
    });
    expect(Object.fromEntries(declarations)).toMatchObject({
      "water-whitecap-field-a": "resource",
      "water-whitecap-field-b": "resource",
      "water-whitecap-reset-route": "conditional-route",
      "water-whitecap-generation-route": "conditional-route",
      "water-whitecap-history": "effect-state",
      "water-whitecap-advection-route": "conditional-route",
      "water-whitecap-diffusion-route": "conditional-route",
      "water-whitecap-decay-route": "conditional-route",
      "water-whitecap-stage-target": "resource",
      "water-whitecap-stage-route": "conditional-route",
      "water-whitecap-probe": "conditional-route",
    });

    const nextSize = createMinimalWaterPrewarmManifest(
      createMinimalWaterQualityProfile(),
      NEXT_DRAWING_BUFFER,
    );
    expect(
      nextSize.declarations.find(
        ({ id }) => id === "water-whitecap-stage-target",
      )?.fingerprint,
    ).not.toBe(
      manifest.declarations.find(
        ({ id }) => id === "water-whitecap-stage-target",
      )?.fingerprint,
    );
  });

  it("declares the complete waterline optical and shared-history route", () => {
    const profile = createMinimalWaterQualityProfile();
    const manifest = createMinimalWaterPrewarmManifest(profile);

    expect(QUALITY_PROFILE_VERSION).toBe(6);
    expect(profile.reflection.ssr.history.resetDomains).toEqual([
      "simulation-reset",
      "camera-cut",
      "origin-shift",
      "sea-state-cut",
      "waterline-crossing",
    ]);
    expect(
      Object.fromEntries(
        manifest.declarations
          .filter(({ id }) =>
            [
              "water-waterline-state",
              "water-underside-optical-route",
              "water-waterline-history-reset-route",
              "water-lens-wetness-transition",
            ].includes(id),
          )
          .map(({ id, kind }) => [id, kind]),
      ),
    ).toEqual({
      "water-waterline-state": "effect-state",
      "water-underside-optical-route": "effect-state",
      "water-waterline-history-reset-route": "conditional-route",
      "water-lens-wetness-transition": "effect-state",
    });
  });

  it("maps each supported structure to a deterministic complete work plan", () => {
    const minimalProfile = createMinimalWaterQualityProfile();
    const highDetailProfile = createMinimalWaterQualityProfile(
      "minimal-high-detail",
    );
    const minimal = createMinimalWaterPrewarmManifest(minimalProfile);
    const repeated = createMinimalWaterPrewarmManifest(
      createMinimalWaterQualityProfile(),
    );
    const highDetail = createMinimalWaterPrewarmManifest(highDetailProfile);

    expect(PREWARM_MANIFEST_VERSION).toBe(5);
    expect(minimal.version).toBe(5);
    expect(minimal.drawingBuffer).toEqual(MEMORY_PREWARM_DRAWING_BUFFER);
    expect(Object.isFrozen(minimal.drawingBuffer)).toBe(true);
    expect(minimal.manifestHash).toBe(
      sha256Identifier(JSON.stringify(canonicalManifestHashInput(minimal))),
    );
    expect(repeated.manifestHash).toBe(minimal.manifestHash);
    expect(highDetail.manifestHash).toBe(
      sha256Identifier(JSON.stringify(canonicalManifestHashInput(highDetail))),
    );
    expect(highDetail.manifestHash).not.toBe(minimal.manifestHash);
    expect(minimal.qualityProfile).toEqual(minimalProfile);
    expect(highDetail.qualityProfile).toEqual(highDetailProfile);
    expect(minimal.effectVariants).toEqual([
      { effectId: "minimal-water-surface", variantId: "basic" },
      { effectId: "spectral-whitecaps", variantId: "persistent" },
    ]);
    expect(minimal.effectVariants).toEqual(SUPPORTED_EFFECT_VARIANTS);
    expect(minimal.qualityProfile.temporal).toEqual(NATIVE_TEMPORAL);
    expect(minimal.qualityProfile.reflection).toEqual(NATIVE_REFLECTION);
    expect(minimal.qualityProfile.version).toBe(7);

    expect(minimal.qualityProfile.whitecaps).toEqual(NATIVE_WHITECAPS);
    expect(minimal.declarations.map(({ id }) => id)).toEqual([
      ...CORE_PREWARM_DECLARATION_IDS,
    ]);
    expect(
      minimal.declarations.find(
        (declaration) => declaration.id === "water-named-output-routes",
      )?.label,
    ).toBe("Twenty-seven named diagnostics output routes");
    expect(
      Object.fromEntries(
        minimal.declarations
          .filter((declaration) =>
            [
              "water-procedural-motion",
              "water-motion-vectors",
              "water-final-color-target",
              "water-stock-traa-history",
              "water-traa-resolve-jitter",
              "water-traa-reset-route",
            ].includes(declaration.id),
          )
          .map((declaration) => [
            declaration.id,
            { kind: declaration.kind, label: declaration.label },
          ]),
      ),
    ).toEqual({
      "water-procedural-motion": {
        kind: "effect-state",
        label:
          "Previous presented wave-field positionPrevious (current clipmap XZ and Host sea level)",
      },
      "water-motion-vectors": {
        kind: "resource",
        label: "Procedural water velocity (RG16F NDC, scale 1, samples 0)",
      },
      "water-final-color-target": {
        kind: "resource",
        label: "Core final-color target (RGBA8, drawing-buffer-exact)",
      },
      "water-stock-traa-history": {
        kind: "effect-state",
        label: "Stock TRAA color+depth history with waterline reset domain",
      },
      "water-traa-resolve-jitter": {
        kind: "conditional-route",
        label: "Stock TRAA resolve/jitter route",
      },
      "water-traa-reset-route": {
        kind: "conditional-route",
        label:
          "No-allocation TRAA and dedicated SSR history reset (shared Host domain including waterline crossing)",
      },
    });
    expect(highDetail.declarations.map(({ id }) => id)).toEqual(
      minimal.declarations.map(({ id }) => id),
    );
    expect(
      Object.fromEntries(
        minimal.declarations
          .filter((declaration) =>
            [
              "water-environment-radiance",
              "water-scene-color",
              "water-scene-depth",
              "water-optical-route",
            ].includes(declaration.id),
          )
          .map((declaration) => [declaration.id, declaration.label]),
      ),
    ).toEqual({
      "water-environment-radiance":
        "Host environment radiance (equirect rgba8unorm 8x4 srgb)",
      "water-scene-color":
        "Viewport pre-water scene color (viewportSharedTexture)",
      "water-scene-depth": "Viewport opaque scene depth (viewportDepthTexture)",
      "water-optical-route":
        "Optical composition route (planar+environment fallback, projected refraction, RGB Beer-Lambert, whitecap reflection/transmission/roughness/micro detail)",
    });
    const highDetailClipmap = highDetail.declarations.find(
      (declaration) => declaration.id === "water-clipmap",
    );
    const minimalClipmap = minimal.declarations.find(
      (declaration) => declaration.id === "water-clipmap",
    );
    expect(highDetailClipmap?.fingerprint).toBe(
      "sha256:ac0f415a7ca925b92112e332ed39c7cebef51fcec3ffc07216a0484181be6930",
    );
    expect(highDetailClipmap?.fingerprint).not.toBe(
      minimalClipmap?.fingerprint,
    );
    expect(
      Object.fromEntries(
        minimal.declarations
          .filter((declaration) =>
            [
              "water-environment-radiance",
              "water-material",
              "water-optical-route",
              "water-traa-reset-route",
              "water-hidden-stabilization",
            ].includes(declaration.id),
          )
          .map((declaration) => [declaration.id, declaration.fingerprint]),
      ),
    ).toEqual({
      "water-environment-radiance":
        "sha256:3b4e72ce8470faf690ea64fa4f7e0e99c36517e5c93df2036bd80472021b777d",
      "water-material":
        "sha256:20c6447eb1b1d8ea56fc606898ea49e9505013b24ede63e70535057d5c0050ec",
      "water-optical-route":
        "sha256:c2c89db1c48c537cd41aedafb7dc88cf1b3a55c96399f308ab94cc679a076e07",
      "water-traa-reset-route":
        "sha256:3f32ddae6ca9dde0bcfedf7e8c12e2d7f8c1c71d5fb53de9e2fb4e958e660239",
      "water-hidden-stabilization":
        "sha256:f35d6cdd70b97589e93e16f61bb2ecb684031f9681d47d324413e2617810c726",
    });
    expect(
      minimal.declarations.find(
        (declaration) => declaration.id === "water-optical-route",
      )?.kind,
    ).toBe("effect-state");
    expect(minimal.environmentReflection).toEqual(
      SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
    );
    expect(highDetail.environmentReflection).toEqual(
      SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
    );
    expect(manifestIdentity(highDetail)).toEqual({
      schema: "real-water/prewarm",
      version: 5,
      id: "reference-minimal-water",
      manifestHash: highDetail.manifestHash,
      qualityProfile: qualityProfileIdentity(highDetailProfile),
      drawingBuffer: MEMORY_PREWARM_DRAWING_BUFFER,
      environmentReflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      effectVariants: [
        { effectId: "minimal-water-surface", variantId: "basic" },
        { effectId: "spectral-whitecaps", variantId: "persistent" },
      ],
    });
    expect(Object.isFrozen(minimal.drawingBuffer)).toBe(true);
    expect(Object.isFrozen(minimal.qualityProfile)).toBe(true);
    expect(Object.isFrozen(minimal.effectVariants)).toBe(true);
    expect(Object.isFrozen(minimal.effectVariants[0])).toBe(true);
    expect(Object.isFrozen(SUPPORTED_EFFECT_VARIANTS)).toBe(true);
    expect(Object.isFrozen(SUPPORTED_EFFECT_VARIANTS[0])).toBe(true);
    expect(Object.isFrozen(SUPPORTED_EFFECT_VARIANTS[1])).toBe(true);
  });

  it("binds drawing-buffer-exact fingerprints and hashes to each physical size", () => {
    const profile = createMinimalWaterQualityProfile();
    const small = createMinimalWaterPrewarmManifest(
      profile,
      MEMORY_PREWARM_DRAWING_BUFFER,
    );
    const large = createMinimalWaterPrewarmManifest(
      profile,
      NEXT_DRAWING_BUFFER,
    );
    const repeatedLarge = createMinimalWaterPrewarmManifest(
      createMinimalWaterQualityProfile(),
      NEXT_DRAWING_BUFFER,
    );

    expect(small.drawingBuffer).toEqual(MEMORY_PREWARM_DRAWING_BUFFER);
    expect(large.drawingBuffer).toEqual(NEXT_DRAWING_BUFFER);
    expect(small.manifestHash).not.toBe(large.manifestHash);
    expect(repeatedLarge.manifestHash).toBe(large.manifestHash);
    expect(small.manifestHash).toBe(
      sha256Identifier(JSON.stringify(canonicalManifestHashInput(small))),
    );
    expect(large.manifestHash).toBe(
      sha256Identifier(JSON.stringify(canonicalManifestHashInput(large))),
    );
    for (const id of DRAWING_BUFFER_BOUND_IDS) {
      const smallDeclaration = small.declarations.find(
        (declaration) => declaration.id === id,
      );
      const largeDeclaration = large.declarations.find(
        (declaration) => declaration.id === id,
      );
      expect(smallDeclaration).toBeDefined();
      expect(largeDeclaration).toBeDefined();
      if (smallDeclaration === undefined || largeDeclaration === undefined) {
        throw new Error(`Missing drawing-buffer-bound declaration ${id}.`);
      }
      expect(smallDeclaration.fingerprint).toBe(
        sha256Identifier(
          JSON.stringify(
            boundDeclarationHashInput(smallDeclaration, small.drawingBuffer),
          ),
        ),
      );
      expect(largeDeclaration.fingerprint).toBe(
        sha256Identifier(
          JSON.stringify(
            boundDeclarationHashInput(largeDeclaration, large.drawingBuffer),
          ),
        ),
      );
      expect(smallDeclaration.fingerprint).not.toBe(
        sha256Identifier(
          JSON.stringify({
            id: smallDeclaration.id,
            kind: smallDeclaration.kind,
            label: smallDeclaration.label,
            width: small.drawingBuffer.width,
            height: small.drawingBuffer.height,
          }),
        ),
      );
      expect(smallDeclaration.fingerprint).not.toBe(
        largeDeclaration.fingerprint,
      );
    }
    expect(
      small.declarations.find(
        (declaration) => declaration.id === "water-texture",
      )?.fingerprint,
    ).toBe(
      large.declarations.find(
        (declaration) => declaration.id === "water-texture",
      )?.fingerprint,
    );
    expect(() => {
      (small.drawingBuffer as { width: number }).width = 1;
    }).toThrow(TypeError);
  });

  it("normalizes either supported plan into deeply immutable evidence", () => {
    for (const profileId of ["minimal", "minimal-high-detail"] as const) {
      const candidate = structuredClone(
        createMinimalWaterPrewarmManifest(
          createMinimalWaterQualityProfile(profileId),
        ),
      );
      const normalized = normalizePrewarmManifest(candidate);

      expect(normalized).toEqual(candidate);
      expect(normalized).not.toBe(candidate);
      expect(Object.isFrozen(normalized)).toBe(true);
      expect(Object.isFrozen(normalized.qualityProfile.surface.geometry)).toBe(
        true,
      );
      expect(Object.isFrozen(normalized.effectVariants)).toBe(true);
      expect(Object.isFrozen(normalized.effectVariants[0])).toBe(true);
      expect(Object.isFrozen(normalized.environmentReflection)).toBe(true);
      expect(Object.isFrozen(normalized.declarations)).toBe(true);
      expect(Object.isFrozen(normalized.declarations[0])).toBe(true);
    }
  });

  it.each([
    [
      "profile structure drift",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return {
          ...manifest,
          qualityProfile: {
            ...manifest.qualityProfile,
            surface: {
              geometry: { widthSegments: 2, heightSegments: 1 },
            },
          },
        };
      },
    ],
    [
      "manifest hash drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        manifestHash: `sha256:${"0".repeat(64)}`,
      }),
    ],
    [
      "missing readiness work",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return { ...manifest, declarations: manifest.declarations.slice(1) };
      },
    ],
    [
      "reordered readiness work",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        const [first, second, ...remaining] = manifest.declarations;
        if (first === undefined || second === undefined) {
          throw new Error("The supported plan must contain two declarations.");
        }
        return {
          ...manifest,
          declarations: [second, first, ...remaining],
        };
      },
    ],
    [
      "undeclared registry",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        effectVariants: [],
      }),
    ],
    [
      "effect variant registry drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        effectVariants: [
          { effectId: "minimal-water-surface", variantId: "unprewarmed" },
        ],
      }),
    ],
    [
      "unknown declaration structure",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return {
          ...manifest,
          declarations: manifest.declarations.map((declaration, index) =>
            index === 0
              ? { ...declaration, cachePolicy: "unsupported" }
              : declaration,
          ),
        };
      },
    ],
    [
      "unknown top-level field",
      (): PrewarmManifest =>
        ({
          ...createMinimalWaterPrewarmManifest(),
          notes: "unsupported",
        }) as PrewarmManifest,
    ],
    [
      "missing drawing buffer",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return {
          schema: manifest.schema,
          version: manifest.version,
          id: manifest.id,
          manifestHash: manifest.manifestHash,
          qualityProfile: manifest.qualityProfile,
          environmentReflection: manifest.environmentReflection,
          effectVariants: manifest.effectVariants,
          declarations: manifest.declarations,
        } as PrewarmManifest;
      },
    ],
    [
      "drawing buffer extra field",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return {
          ...manifest,
          drawingBuffer: {
            ...manifest.drawingBuffer,
            scale: 1,
          } as PrewarmManifest["drawingBuffer"],
        };
      },
    ],
    [
      "drawing buffer width drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        drawingBuffer: { width: 319, height: 180 },
      }),
    ],
    [
      "non-positive drawing buffer",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        drawingBuffer: { width: 0, height: 180 },
      }),
    ],
    [
      "missing environment reflection",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return {
          schema: manifest.schema,
          version: manifest.version,
          id: manifest.id,
          manifestHash: manifest.manifestHash,
          qualityProfile: manifest.qualityProfile,
          effectVariants: manifest.effectVariants,
          declarations: manifest.declarations,
        } as PrewarmManifest;
      },
    ],
    [
      "extra environment reflection field",
      (): PrewarmManifest => {
        const manifest = createMinimalWaterPrewarmManifest();
        return {
          ...manifest,
          environmentReflection: {
            ...manifest.environmentReflection,
            encoding: "srgb",
          } as PrewarmManifest["environmentReflection"],
        };
      },
    ],
    [
      "environment reflection identity drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          identity: "other-environment-radiance",
        },
      }),
    ],
    [
      "environment reflection fingerprint drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          fingerprint: `sha256:${"0".repeat(64)}`,
        },
      }),
    ],
    [
      "environment reflection width drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          width: 16,
        },
      }),
    ],
    [
      "environment reflection height drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          height: 8,
        },
      }),
    ],
    [
      "environment reflection format drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          format: "rgba16float",
        } as PrewarmManifest["environmentReflection"],
      }),
    ],
    [
      "environment reflection type drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          type: "cube",
        } as PrewarmManifest["environmentReflection"],
      }),
    ],
    [
      "environment reflection color-space drift",
      (): PrewarmManifest => ({
        ...createMinimalWaterPrewarmManifest(),
        environmentReflection: {
          ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
          colorSpace: "linear",
        } as PrewarmManifest["environmentReflection"],
      }),
    ],
  ])("fails closed on %s", (_name, makeCandidate) => {
    expect(() => normalizePrewarmManifest(makeCandidate())).toThrowError(
      expect.objectContaining({
        code: "MANIFEST_INVALID",
        phase: "manifest-validation",
        retryable: false,
      }),
    );
  });

  it("keeps the Memory drawing-buffer default off the public Interface", async () => {
    const publicApi = await import("../src/index.js");
    expect("MEMORY_TEST_PREWARM_DRAWING_BUFFER" in publicApi).toBe(false);
    expect("DEFAULT_MEMORY_PREWARM_DRAWING_BUFFER" in publicApi).toBe(false);
  });

  it("rejects a stale Prewarm Manifest version", () => {
    expect(() =>
      normalizePrewarmManifest({
        ...createMinimalWaterPrewarmManifest(),
        version: 2 as PrewarmManifest["version"],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "MANIFEST_VERSION_UNSUPPORTED",
        phase: "manifest-validation",
        retryable: false,
      }),
    );
  });
});
