import { RealWaterStartupError } from "./errors.js";
import {
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
  SUPPORTED_HOST_ENVIRONMENT_WORK_PLAN_FINGERPRINT,
  type HostEnvironmentReflectionDescriptor,
} from "./environment.js";
import { hasExactKeys, isRecord } from "./internal/record-validation.js";
import { sha256Identifier } from "./internal/sha256.js";
import {
  createMinimalWaterQualityProfile,
  normalizeQualityProfile,
  qualityProfileIdentity,
  type MinimalWaterQualityProfileId,
  type QualityProfile,
  type QualityProfileIdentity,
} from "./quality-profile.js";

/**
 * The discriminator for supported Prewarm Manifests.
 *
 * @public
 */
export const PREWARM_MANIFEST_SCHEMA = "real-water/prewarm" as const;

/**
 * The only Prewarm Manifest version accepted by this release.
 *
 * @public
 */
export const PREWARM_MANIFEST_VERSION = 3 as const;

/**
 * Immutable physical drawing-buffer dimensions bound into a Prewarm Manifest.
 *
 * @public
 */
export interface PrewarmDrawingBuffer {
  readonly width: number;
  readonly height: number;
}

const DEFAULT_MEMORY_PREWARM_DRAWING_BUFFER: PrewarmDrawingBuffer =
  Object.freeze({
    width: 320,
    height: 180,
  });
const PREWARM_MANIFEST_KEYS = [
  "schema",
  "version",
  "id",
  "manifestHash",
  "qualityProfile",
  "drawingBuffer",
  "environmentReflection",
  "effectVariants",
  "declarations",
] as const;

/**
 * Structural declaration kinds supported by the first Readiness Gate.
 *
 * @public
 */
export type PrewarmDeclarationKind =
  "resource" | "effect-state" | "conditional-route";

/**
 * One declared item of work in a supported Prewarm Manifest.
 *
 * @public
 */
export interface PrewarmDeclaration {
  readonly id: string;
  readonly kind: PrewarmDeclarationKind;
  readonly label: string;
  readonly fingerprint: string;
}

/**
 * One exact effect route prepared by a supported Prewarm Manifest.
 *
 * @public
 */
export interface PrewarmEffectVariant {
  readonly effectId: string;
  readonly variantId: string;
}

/**
 * A closed, versioned declaration of structural work required before readiness.
 *
 * @public
 */
export interface PrewarmManifest {
  readonly schema: typeof PREWARM_MANIFEST_SCHEMA;
  readonly version: typeof PREWARM_MANIFEST_VERSION;
  readonly id: string;
  readonly manifestHash: string;
  readonly qualityProfile: QualityProfile;
  readonly drawingBuffer: PrewarmDrawingBuffer;
  readonly environmentReflection: HostEnvironmentReflectionDescriptor;
  readonly effectVariants: readonly PrewarmEffectVariant[];
  readonly declarations: readonly PrewarmDeclaration[];
}

/**
 * The immutable manifest identity attached to a ready lease.
 *
 * @public
 */
export interface PrewarmManifestIdentity {
  readonly schema: typeof PREWARM_MANIFEST_SCHEMA;
  readonly version: typeof PREWARM_MANIFEST_VERSION;
  readonly id: string;
  readonly manifestHash: string;
  readonly qualityProfile: QualityProfileIdentity;
  readonly drawingBuffer: PrewarmDrawingBuffer;
  readonly environmentReflection: HostEnvironmentReflectionDescriptor;
  readonly effectVariants: readonly PrewarmEffectVariant[];
}

const SHA_256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const DECLARATION_KINDS: readonly PrewarmDeclarationKind[] = [
  "resource",
  "effect-state",
  "conditional-route",
];

/**
 * The immutable registry of effect variants supported by this release.
 */
export const SUPPORTED_EFFECT_VARIANTS: readonly PrewarmEffectVariant[] =
  Object.freeze([
    Object.freeze({
      effectId: "minimal-water-surface",
      variantId: "basic",
    }),
  ]);

export const MINIMAL_WATER_PREWARM_DECLARATION_IDS = Object.freeze({
  texture: "water-texture",
  environmentRadiance: "water-environment-radiance",
  sceneColor: "water-scene-color",
  sceneDepth: "water-scene-depth",
  renderTarget: "water-render-target",
  clipmap: "water-clipmap",
  spectralBandSwell: "water-spectral-band-swell",
  spectralBandWind: "water-spectral-band-wind",
  spectralBandChop: "water-spectral-band-chop",
  spectralBandRipple: "water-spectral-band-ripple",
  material: "water-material",
  opticalRoute: "water-optical-route",
  renderRoute: "water-render-route",
  proceduralMotion: "water-procedural-motion",
  motionVectors: "water-motion-vectors",
  inverseLinearDepth: "water-inverse-linear-depth",
  viewNormal: "water-view-normal",
  opticalFactorsTarget: "water-optical-factors-target",
  opticalDiagnosticsA: "water-optical-diagnostics-a",
  opticalDiagnosticsB: "water-optical-diagnostics-b",
  finalColorTarget: "water-final-color-target",
  currentColorTarget: "water-current-color-target",
  stockTraaHistory: "water-stock-traa-history",
  traaResolveJitter: "water-traa-resolve-jitter",
  traaResetRoute: "water-traa-reset-route",
  currentColorConversion: "water-current-color-conversion",
  namedOutputRoutes: "water-named-output-routes",
  hiddenStabilization: "water-hidden-stabilization",
  completionProbe: "water-completion-probe",
  mainCameraGuard: "water-main-camera-guard",
} as const);

const MINIMAL_WATER_MANIFEST_ID = "reference-minimal-water";
const ENVIRONMENT_REFLECTION_KEYS = [
  "identity",
  "fingerprint",
  "width",
  "height",
  "format",
  "type",
  "colorSpace",
] as const;
const DRAWING_BUFFER_BOUND_DECLARATION_IDS: ReadonlySet<string> = new Set([
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.sceneColor,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.sceneDepth,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.renderTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.motionVectors,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.inverseLinearDepth,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.viewNormal,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalFactorsTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalDiagnosticsA,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalDiagnosticsB,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.finalColorTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.currentColorTarget,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.stockTraaHistory,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.traaResolveJitter,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.renderRoute,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.currentColorConversion,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.namedOutputRoutes,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.completionProbe,
  MINIMAL_WATER_PREWARM_DECLARATION_IDS.mainCameraGuard,
]);
const MINIMAL_WATER_DECLARATIONS: readonly PrewarmDeclaration[] = [
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.texture,
    kind: "resource",
    label: "Minimal water texture",
    fingerprint:
      "sha256:6a6c8aa146e7dd50e15eed0c5b627b961a11fbd49b4655147345a44a5d0bb1bc",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.environmentRadiance,
    kind: "resource",
    label: "Host environment radiance (equirect rgba8unorm 8x4 srgb)",
    fingerprint: SUPPORTED_HOST_ENVIRONMENT_WORK_PLAN_FINGERPRINT,
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.sceneColor,
    kind: "resource",
    label: "Viewport pre-water scene color (viewportSharedTexture)",
    fingerprint:
      "sha256:7761ba3b4ab1e04567aa1e9e796d3a66e8dab91e157940cce9281e4eaf9e53fb",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.sceneDepth,
    kind: "resource",
    label: "Viewport opaque scene depth (viewportDepthTexture)",
    fingerprint:
      "sha256:b1c0600e109f08f14c72d84ac848e85a64d47d69daf0406aa966911a0872a169",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.renderTarget,
    kind: "resource",
    label: "Minimal water 7-attachment MRT (32 bytes/sample)",
    fingerprint:
      "sha256:154cbf47d199c3e5501bb9bf1fb30a862c6bf3b770caa1a759f55fb14fea34e9",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.clipmap,
    kind: "resource",
    label: "Camera-relative Open Water clipmap",
    fingerprint:
      "sha256:61fcb210b4d47847c615ceaec5c83d943ab09fbd993708771ba19d63cf8189e9",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBandSwell,
    kind: "effect-state",
    label: "Swell spectral wave band",
    fingerprint:
      "sha256:b709b5a7bd700e839813432079e70edde4a842ec73fdf4210ae1d37573b9ec3b",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBandWind,
    kind: "effect-state",
    label: "Wind spectral wave band",
    fingerprint:
      "sha256:d214280fa8ae2939a9b001fced931d4261f801b7b7f2175015726bbd6952fc3c",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBandChop,
    kind: "effect-state",
    label: "Chop spectral wave band",
    fingerprint:
      "sha256:1391b6df834fd361e6caeebea074f47a3edae589715f6edf4bc75c13dea807a8",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBandRipple,
    kind: "effect-state",
    label: "Ripple spectral wave band",
    fingerprint:
      "sha256:f45d0459b6c83de101d0b860c7173104c9602a29f6e5f57d1c2fd64f35e9fb8e",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.material,
    kind: "effect-state",
    label: "Minimal water material",
    fingerprint:
      "sha256:0a8c1aaa649d6a28ff0565d73cf0cf6e45acf14135c54e5162fbc7fbe0c7e386",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalRoute,
    kind: "effect-state",
    label:
      "Basic optical composition route (projected refraction, RGB Beer-Lambert, perspective camera)",
    fingerprint:
      "sha256:d223bdd7539e1d31659f03fa18a8e8e8784fde725f9fce9d499f33f48dcf1e63",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.renderRoute,
    kind: "conditional-route",
    label: "One scene MRT through stock TRAA with optional current-color",
    fingerprint:
      "sha256:02a2ef11bb80777f29a294b21601b96fefa73a10f1a531bb9427067e5f326772",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.proceduralMotion,
    kind: "effect-state",
    label:
      "Previous presented wave-field positionPrevious (current clipmap XZ)",
    fingerprint:
      "sha256:9dfd0b4318451260c87a7146d234e2cce4e74315eccfe5d5eec89729695dea82",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.motionVectors,
    kind: "resource",
    label: "Procedural water velocity (RG16F NDC, scale 1, samples 0)",
    fingerprint:
      "sha256:22d81a8fcf82eb4c38c70f64cbdd809d308218ae003cff43d3d0e4495c532026",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.inverseLinearDepth,
    kind: "resource",
    label: "Inverse-linear view depth (R32F, drawing-buffer-exact)",
    fingerprint:
      "sha256:8c437e59eb9f4c22921b61c6d5bb39af290007a27e424b1916e934175743cc4c",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.viewNormal,
    kind: "resource",
    label: "View-normal XY (RG16F, drawing-buffer-exact)",
    fingerprint:
      "sha256:c9c8dc85087bbbf6c696e4aed1efe7796b22d6eabb9d25b6e7f1fd12ed256577",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalFactorsTarget,
    kind: "resource",
    label: "Optical factors (RGBA16F, drawing-buffer-exact)",
    fingerprint:
      "sha256:17bb803da6968b516f2ea1f286d25d6e8aa0b2eda5bc9ba118cc0e4bdb18e5ec",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalDiagnosticsA,
    kind: "resource",
    label: "Optical diagnostics A (RG8, drawing-buffer-exact)",
    fingerprint:
      "sha256:17bc4d8de01c8456f0cabc9ef93cd4b42994b069a7392abca453116b57189758",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.opticalDiagnosticsB,
    kind: "resource",
    label: "Optical diagnostics B (RG8, drawing-buffer-exact)",
    fingerprint:
      "sha256:36a1f57ebc891ac92a1d92f6257ea21e2b501a02b8d3df22dcc00a4c7d1133fa",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.finalColorTarget,
    kind: "resource",
    label: "Core final-color target (RGBA8, drawing-buffer-exact)",
    fingerprint:
      "sha256:95e187bfaa85ab73fddaa0060eb8d184622ffb5e1184b6ed83fb1840ac5c298d",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.currentColorTarget,
    kind: "resource",
    label: "Core current-color target (RGBA8, drawing-buffer-exact)",
    fingerprint:
      "sha256:e696b8999adaa67392cac034126b180ca2a99c4365fbf56099c912940313d771",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.stockTraaHistory,
    kind: "effect-state",
    label: "Stock TRAA color+depth history policy",
    fingerprint:
      "sha256:c497047138e197f87d7a3ac341246033cdb18d36701cc88b79774b51df0638c5",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.traaResolveJitter,
    kind: "conditional-route",
    label: "Stock TRAA resolve/jitter route",
    fingerprint:
      "sha256:ba8bdc48d2842afd8f4f620e5296fce9bde9055047e4de7d593eec83dce25733",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.traaResetRoute,
    kind: "conditional-route",
    label: "No-allocation TRAA reset route",
    fingerprint:
      "sha256:e4a59425b89a6138d620200a8404be90b74fd8d20a5da54fbefb259a3b4dd9ab",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.currentColorConversion,
    kind: "conditional-route",
    label: "Current-color conversion sampling the already-rendered output",
    fingerprint:
      "sha256:c3ccd110aed4171e0e15c0bdde797b266ed744751a437ae54ea1ec157f8dcb14",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.namedOutputRoutes,
    kind: "conditional-route",
    label: "Twelve named diagnostics output routes",
    fingerprint:
      "sha256:aa21153732af519ab15fdd5e9f46311d2e9f4c8096b9f35bd26bb561d18e5139",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.hiddenStabilization,
    kind: "effect-state",
    label: "Eight hidden stabilization frames",
    fingerprint:
      "sha256:f35d6cdd70b97589e93e16f61bb2ecb684031f9681d47d324413e2617810c726",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.completionProbe,
    kind: "conditional-route",
    label: "GPU completion probe of every named output route",
    fingerprint:
      "sha256:c4e77fab97a18b547bf0053649e772e8faf9ce0dd58958136d531ecfca9ab89f",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.mainCameraGuard,
    kind: "conditional-route",
    label: "Main-camera guard frame",
    fingerprint:
      "sha256:ef72fd8cb5959aa73eeef6a857f67edc3f32b1b9f7e73b76b295f913ae6aca25",
  },
];

const MINIMAL_HIGH_DETAIL_WATER_DECLARATIONS: readonly PrewarmDeclaration[] =
  MINIMAL_WATER_DECLARATIONS.map((declaration) =>
    declaration.id === MINIMAL_WATER_PREWARM_DECLARATION_IDS.clipmap
      ? {
          ...declaration,
          fingerprint:
            "sha256:ac0f415a7ca925b92112e332ed39c7cebef51fcec3ffc07216a0484181be6930",
        }
      : declaration,
  );

/**
 * Returns the complete manifest for the first prewarmed water plane. This
 * release binds the canonical 8x4 RGBA8 sRGB equirect Host environment
 * reflection into both the public descriptor field and the environment-radiance
 * declaration. Production Hosts must pass `drawingBuffer`. When omitted, the
 * factory uses a 320×180 Memory-test default. The factory is synchronous and
 * hashes with the package-internal SHA-256 implementation.
 *
 * @public
 */
export function createMinimalWaterPrewarmManifest(
  profile: QualityProfile = createMinimalWaterQualityProfile(),
  drawingBuffer: PrewarmDrawingBuffer = DEFAULT_MEMORY_PREWARM_DRAWING_BUFFER,
): PrewarmManifest {
  const normalizedProfile = normalizeQualityProfile(profile);
  const normalizedDrawingBuffer = normalizeDrawingBuffer(drawingBuffer);
  const declarations = createMinimalWaterDeclarations(
    normalizedProfile.id,
    normalizedDrawingBuffer,
  );
  return freezeHashedManifest({
    schema: PREWARM_MANIFEST_SCHEMA,
    version: PREWARM_MANIFEST_VERSION,
    id: MINIMAL_WATER_MANIFEST_ID,
    qualityProfile: normalizedProfile,
    drawingBuffer: normalizedDrawingBuffer,
    environmentReflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
    effectVariants: SUPPORTED_EFFECT_VARIANTS,
    declarations,
  });
}

export function normalizePrewarmManifest(
  candidate: PrewarmManifest,
): PrewarmManifest {
  const value: unknown = candidate;
  if (!isRecord(value)) {
    throw manifestError("The Prewarm Manifest must be an object.");
  }

  if (value.schema !== PREWARM_MANIFEST_SCHEMA) {
    throw manifestError("The Prewarm Manifest schema is not supported.", {
      receivedSchema: String(value.schema),
    });
  }

  if (value.version !== PREWARM_MANIFEST_VERSION) {
    throw new RealWaterStartupError({
      code: "MANIFEST_VERSION_UNSUPPORTED",
      phase: "manifest-validation",
      retryable: false,
      message: "The Prewarm Manifest version is not supported.",
      diagnostics: {
        receivedVersion:
          typeof value.version === "number"
            ? value.version
            : String(value.version),
        supportedVersion: PREWARM_MANIFEST_VERSION,
      },
    });
  }

  if (!hasExactKeys(value, PREWARM_MANIFEST_KEYS)) {
    throw manifestError(
      "The Prewarm Manifest must use the supported structure.",
      typeof value.id === "string" ? { manifestId: value.id } : {},
    );
  }

  if (!isNonEmptyText(value.id)) {
    throw manifestError("The Prewarm Manifest id must not be empty.");
  }

  if (
    typeof value.manifestHash !== "string" ||
    !SHA_256_PATTERN.test(value.manifestHash)
  ) {
    throw manifestError(
      "The Prewarm Manifest hash must be a lowercase SHA-256 identifier.",
      { manifestId: value.id },
    );
  }

  const qualityProfile = normalizeManifestQualityProfile(
    value.qualityProfile,
    value.id,
  );
  const drawingBuffer = normalizeDrawingBuffer(value.drawingBuffer, value.id);
  const environmentReflection = normalizeManifestEnvironmentReflection(
    value.environmentReflection,
    value.id,
  );
  const effectVariants = normalizeEffectVariants(
    value.effectVariants,
    value.id,
  );

  if (!Array.isArray(value.declarations) || value.declarations.length === 0) {
    throw manifestError(
      "The Prewarm Manifest must declare at least one item.",
      { manifestId: value.id },
    );
  }

  const declarationIds = new Set<string>();
  const declarations: PrewarmDeclaration[] = [];
  for (let index = 0; index < value.declarations.length; index += 1) {
    if (!Object.hasOwn(value.declarations, index)) {
      throw manifestError("Prewarm declarations must not contain gaps.", {
        declarationIndex: index,
        manifestId: value.id,
      });
    }

    const declaration: unknown = value.declarations[index];
    if (!isRecord(declaration)) {
      throw manifestError("Every prewarm declaration must be an object.", {
        declarationIndex: index,
        manifestId: value.id,
      });
    }

    if (!hasExactKeys(declaration, ["id", "kind", "label", "fingerprint"])) {
      throw manifestError(
        "Every prewarm declaration must use the supported structure.",
        {
          declarationIndex: index,
          manifestId: value.id,
        },
      );
    }

    if (!isNonEmptyText(declaration.id)) {
      throw manifestError("Every prewarm declaration needs a non-empty id.", {
        declarationIndex: index,
        manifestId: value.id,
      });
    }

    if (declarationIds.has(declaration.id)) {
      throw manifestError("Prewarm declaration ids must be unique.", {
        declarationId: declaration.id,
        manifestId: value.id,
      });
    }
    declarationIds.add(declaration.id);

    if (
      typeof declaration.kind !== "string" ||
      !DECLARATION_KINDS.includes(declaration.kind as PrewarmDeclarationKind)
    ) {
      throw manifestError("The prewarm declaration kind is not supported.", {
        declarationId: declaration.id,
        manifestId: value.id,
      });
    }

    if (!isNonEmptyText(declaration.label)) {
      throw manifestError("Every prewarm declaration needs a readable label.", {
        declarationId: declaration.id,
        manifestId: value.id,
      });
    }

    if (
      typeof declaration.fingerprint !== "string" ||
      !SHA_256_PATTERN.test(declaration.fingerprint)
    ) {
      throw manifestError(
        "Every prewarm declaration needs a lowercase SHA-256 fingerprint.",
        {
          declarationId: declaration.id,
          manifestId: value.id,
        },
      );
    }

    declarations.push({
      id: declaration.id,
      kind: declaration.kind as PrewarmDeclarationKind,
      label: declaration.label,
      fingerprint: declaration.fingerprint,
    });
  }

  const manifest = freezeManifest({
    schema: PREWARM_MANIFEST_SCHEMA,
    version: PREWARM_MANIFEST_VERSION,
    id: value.id,
    manifestHash: value.manifestHash,
    qualityProfile,
    drawingBuffer,
    environmentReflection,
    effectVariants,
    declarations,
  });

  assertMinimalWaterPrewarmManifest(manifest);

  return manifest;
}

export function manifestIdentity(
  manifest: PrewarmManifest,
): PrewarmManifestIdentity {
  return Object.freeze({
    schema: manifest.schema,
    version: manifest.version,
    id: manifest.id,
    manifestHash: manifest.manifestHash,
    qualityProfile: qualityProfileIdentity(manifest.qualityProfile),
    drawingBuffer: freezeDrawingBuffer(manifest.drawingBuffer),
    environmentReflection: freezeEnvironmentReflection(
      manifest.environmentReflection,
    ),
    effectVariants: freezeEffectVariants(manifest.effectVariants),
  });
}

function freezeManifest(manifest: PrewarmManifest): PrewarmManifest {
  return Object.freeze({
    schema: manifest.schema,
    version: manifest.version,
    id: manifest.id,
    manifestHash: manifest.manifestHash,
    qualityProfile: normalizeQualityProfile(manifest.qualityProfile),
    drawingBuffer: freezeDrawingBuffer(manifest.drawingBuffer),
    environmentReflection: freezeEnvironmentReflection(
      manifest.environmentReflection,
    ),
    effectVariants: freezeEffectVariants(manifest.effectVariants),
    declarations: Object.freeze(
      manifest.declarations.map((declaration) =>
        Object.freeze({ ...declaration }),
      ),
    ),
  });
}

export function assertMinimalWaterPrewarmManifest(
  manifest: PrewarmManifest,
): void {
  if (manifest.id !== MINIMAL_WATER_MANIFEST_ID) {
    throw manifestError(
      "This release supports only the minimal-water Prewarm Manifest.",
      {
        expectedManifestId: MINIMAL_WATER_MANIFEST_ID,
        receivedManifestId: manifest.id,
      },
    );
  }

  const qualityProfile = normalizeManifestQualityProfile(
    manifest.qualityProfile,
    manifest.id,
  );
  const drawingBuffer = freezeDrawingBuffer(manifest.drawingBuffer);
  const plan = supportedManifestPlan(qualityProfile.id, drawingBuffer);

  if (manifest.manifestHash !== plan.manifestHash) {
    throw manifestError(
      "The minimal-water Prewarm Manifest hash does not match its supported work plan.",
      {
        expectedManifestHash: plan.manifestHash,
        manifestId: manifest.id,
        receivedManifestHash: manifest.manifestHash,
      },
    );
  }

  assertEffectVariants(manifest.effectVariants, manifest.id);
  assertCanonicalEnvironmentReflection(
    manifest.environmentReflection,
    manifest.id,
  );

  for (const required of plan.declarations) {
    const candidate = manifest.declarations.find(
      (declaration) => declaration.id === required.id,
    );
    if (candidate === undefined) {
      throw manifestError(
        "The minimal-water Prewarm Manifest is missing required work.",
        {
          manifestId: manifest.id,
          missingDeclarationId: required.id,
        },
      );
    }

    if (
      candidate.kind !== required.kind ||
      candidate.label !== required.label ||
      candidate.fingerprint !== required.fingerprint
    ) {
      throw manifestError(
        "A minimal-water prewarm declaration does not match the supported work plan.",
        {
          declarationId: required.id,
          manifestId: manifest.id,
        },
      );
    }
  }

  if (manifest.declarations.length !== plan.declarations.length) {
    const unexpected = manifest.declarations.find(
      (candidate) =>
        !plan.declarations.some((required) => required.id === candidate.id),
    );
    throw manifestError(
      "The minimal-water Prewarm Manifest contains unsupported work.",
      {
        manifestId: manifest.id,
        unexpectedDeclarationId: unexpected?.id ?? "unknown",
      },
    );
  }

  for (let index = 0; index < plan.declarations.length; index += 1) {
    const required = plan.declarations[index];
    const candidate = manifest.declarations[index];
    if (required?.id !== candidate?.id) {
      throw manifestError(
        "The minimal-water Prewarm Manifest work order does not match the supported plan.",
        {
          declarationIndex: index,
          expectedDeclarationId: required?.id ?? "missing",
          manifestId: manifest.id,
          receivedDeclarationId: candidate?.id ?? "missing",
        },
      );
    }
  }
}

function supportedManifestPlan(
  profileId: MinimalWaterQualityProfileId,
  drawingBuffer: PrewarmDrawingBuffer,
): {
  readonly manifestHash: string;
  readonly declarations: readonly PrewarmDeclaration[];
} {
  const declarations = createMinimalWaterDeclarations(profileId, drawingBuffer);
  return {
    declarations,
    manifestHash: hashMinimalWaterManifest({
      schema: PREWARM_MANIFEST_SCHEMA,
      version: PREWARM_MANIFEST_VERSION,
      id: MINIMAL_WATER_MANIFEST_ID,
      qualityProfile: createMinimalWaterQualityProfile(profileId),
      drawingBuffer,
      environmentReflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      effectVariants: SUPPORTED_EFFECT_VARIANTS,
      declarations,
    }),
  };
}

function createMinimalWaterDeclarations(
  profileId: MinimalWaterQualityProfileId,
  drawingBuffer: PrewarmDrawingBuffer,
): readonly PrewarmDeclaration[] {
  const declarations =
    profileId === "minimal-high-detail"
      ? MINIMAL_HIGH_DETAIL_WATER_DECLARATIONS
      : MINIMAL_WATER_DECLARATIONS;
  return declarations.map((declaration) =>
    DRAWING_BUFFER_BOUND_DECLARATION_IDS.has(declaration.id)
      ? {
          ...declaration,
          fingerprint: sha256Identifier(
            JSON.stringify({
              id: declaration.id,
              kind: declaration.kind,
              label: declaration.label,
              baseFingerprint: declaration.fingerprint,
              width: drawingBuffer.width,
              height: drawingBuffer.height,
            }),
          ),
        }
      : declaration,
  );
}

function freezeHashedManifest(
  manifest: Omit<PrewarmManifest, "manifestHash">,
): PrewarmManifest {
  return freezeManifest({
    ...manifest,
    manifestHash: hashMinimalWaterManifest(manifest),
  });
}

function hashMinimalWaterManifest(
  manifest: Omit<PrewarmManifest, "manifestHash">,
): string {
  return sha256Identifier(
    JSON.stringify({
      schema: manifest.schema,
      version: manifest.version,
      id: manifest.id,
      qualityProfile: manifest.qualityProfile,
      drawingBuffer: manifest.drawingBuffer,
      environmentReflection: manifest.environmentReflection,
      effectVariants: manifest.effectVariants,
      declarations: manifest.declarations,
    }),
  );
}

function normalizeDrawingBuffer(
  value: unknown,
  manifestId?: string,
): PrewarmDrawingBuffer {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["width", "height"]) ||
    !isPositiveSafeInteger(value.width) ||
    !isPositiveSafeInteger(value.height)
  ) {
    throw manifestError(
      "The Prewarm Manifest drawing buffer must be positive safe integers.",
      manifestId === undefined ? {} : { manifestId },
    );
  }
  return freezeDrawingBuffer({
    width: value.width,
    height: value.height,
  });
}

function freezeDrawingBuffer(
  drawingBuffer: PrewarmDrawingBuffer,
): PrewarmDrawingBuffer {
  return Object.freeze({
    width: drawingBuffer.width,
    height: drawingBuffer.height,
  });
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function normalizeManifestEnvironmentReflection(
  value: unknown,
  manifestId: string,
): HostEnvironmentReflectionDescriptor {
  if (value === undefined) {
    throw manifestError(
      "The Prewarm Manifest must declare its environment reflection.",
      { manifestId },
    );
  }
  return assertCanonicalEnvironmentReflection(value, manifestId);
}

function assertCanonicalEnvironmentReflection(
  value: unknown,
  manifestId: string,
): HostEnvironmentReflectionDescriptor {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [...ENVIRONMENT_REFLECTION_KEYS])
  ) {
    throw manifestError(
      "The Prewarm Manifest environment reflection must use the supported structure.",
      { manifestId },
    );
  }
  const supported = SUPPORTED_HOST_ENVIRONMENT_REFLECTION;
  for (const field of ENVIRONMENT_REFLECTION_KEYS) {
    if (value[field] !== supported[field]) {
      throw manifestError(
        "The Prewarm Manifest environment reflection does not match this release.",
        {
          field,
          manifestId,
        },
      );
    }
  }
  return freezeEnvironmentReflection(supported);
}

function freezeEnvironmentReflection(
  descriptor: HostEnvironmentReflectionDescriptor,
): HostEnvironmentReflectionDescriptor {
  return Object.freeze({
    identity: descriptor.identity,
    fingerprint: descriptor.fingerprint,
    width: descriptor.width,
    height: descriptor.height,
    format: descriptor.format,
    type: descriptor.type,
    colorSpace: descriptor.colorSpace,
  });
}

function normalizeManifestQualityProfile(
  value: unknown,
  manifestId: string,
): QualityProfile {
  try {
    return normalizeQualityProfile(value as QualityProfile);
  } catch {
    throw manifestError(
      "The Prewarm Manifest Quality Profile is not supported.",
      { manifestId },
    );
  }
}

function normalizeEffectVariants(
  value: unknown,
  manifestId: string,
): readonly PrewarmEffectVariant[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw manifestError(
      "The Prewarm Manifest must declare its effect variants.",
      { manifestId },
    );
  }

  const variants: PrewarmEffectVariant[] = [];
  const variantKeys = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw manifestError("Prewarm effect variants must not contain gaps.", {
        manifestId,
        variantIndex: index,
      });
    }

    const variant: unknown = value[index];
    if (
      !isRecord(variant) ||
      !hasExactKeys(variant, ["effectId", "variantId"]) ||
      !isNonEmptyText(variant.effectId) ||
      !isNonEmptyText(variant.variantId)
    ) {
      throw manifestError(
        "Every prewarm effect variant needs exact effect and variant ids.",
        { manifestId, variantIndex: index },
      );
    }

    const key = effectVariantKey(variant.effectId, variant.variantId);
    if (variantKeys.has(key)) {
      throw manifestError("Prewarm effect variants must be unique.", {
        effectId: variant.effectId,
        manifestId,
        variantId: variant.variantId,
      });
    }
    variantKeys.add(key);
    variants.push({
      effectId: variant.effectId,
      variantId: variant.variantId,
    });
  }

  assertEffectVariants(variants, manifestId);
  return freezeEffectVariants(variants);
}

function assertEffectVariants(
  variants: readonly PrewarmEffectVariant[],
  manifestId: string,
): void {
  if (variants.length !== SUPPORTED_EFFECT_VARIANTS.length) {
    throw manifestError(
      "The Prewarm Manifest effect registry does not match this release.",
      { manifestId },
    );
  }

  for (let index = 0; index < SUPPORTED_EFFECT_VARIANTS.length; index += 1) {
    const supported = SUPPORTED_EFFECT_VARIANTS[index];
    const candidate = variants[index];
    if (
      supported === undefined ||
      candidate === undefined ||
      candidate.effectId !== supported.effectId ||
      candidate.variantId !== supported.variantId
    ) {
      throw manifestError(
        "The Prewarm Manifest effect registry does not match this release.",
        {
          effectId: candidate?.effectId ?? "missing",
          manifestId,
          variantId: candidate?.variantId ?? "missing",
        },
      );
    }
  }
}

function freezeEffectVariants(
  variants: readonly PrewarmEffectVariant[],
): readonly PrewarmEffectVariant[] {
  return Object.freeze(
    variants.map((variant) => Object.freeze({ ...variant })),
  );
}

function effectVariantKey(effectId: string, variantId: string): string {
  return `${effectId}\u0000${variantId}`;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function manifestError(
  message: string,
  diagnostics: Readonly<Record<string, string | number | boolean | null>> = {},
): RealWaterStartupError {
  return new RealWaterStartupError({
    code: "MANIFEST_INVALID",
    phase: "manifest-validation",
    retryable: false,
    message,
    diagnostics,
  });
}
