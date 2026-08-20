import { RealWaterStartupError } from "./errors.js";
import {
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
  SUPPORTED_HOST_ENVIRONMENT_WORK_PLAN_FINGERPRINT,
  type HostEnvironmentReflectionDescriptor,
} from "./environment.js";
import { hasExactKeys, isRecord } from "./internal/record-validation.js";
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
export const PREWARM_MANIFEST_VERSION = 2 as const;

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
// Each static hash is the SHA-256 digest of the manifest's canonical JSON,
// excluding manifestHash and preserving the public field order:
// schema, version, id, qualityProfile, environmentReflection, effectVariants,
// declarations.
const MINIMAL_WATER_MANIFEST_HASH =
  "sha256:22e8ad66ea9b58d02ceba64377534916c2167f8b1ed1d1aff5bdd0af8587fefc";
const MINIMAL_HIGH_DETAIL_WATER_MANIFEST_HASH =
  "sha256:421ce1d9ceead8b1c1975922ce74bda9245325fb47c2c5485e322ad0961607cb";
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
    label: "Minimal water render target",
    fingerprint:
      "sha256:65d1be5b0a29b0f3c321446487931e44cfe098e96943d4bed09c77f82e4815f0",
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
      "sha256:511030f29a5d42d01344b6a689a2e59f5248e522f1a4249c01a8916fc10e2314",
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
    label: "Minimal water render route",
    fingerprint:
      "sha256:7eea5ea8565cc2e71e32575ee2dbdae1b997cc7343f3ca96356ddf9f9447a85b",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.hiddenStabilization,
    kind: "effect-state",
    label: "Eight hidden stabilization frames",
    fingerprint:
      "sha256:6a7b2642ef2717c31419931da4593f74b3b165ce2832a3b319e8612fbbecdeaf",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.completionProbe,
    kind: "conditional-route",
    label: "GPU completion probe",
    fingerprint:
      "sha256:21038351bc7a86b5d19736ad762f4be33c24cad188c8613832a8a2c67e13b127",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.mainCameraGuard,
    kind: "conditional-route",
    label: "Main-camera guard frame",
    fingerprint:
      "sha256:02ad80f6c1c5a4735739945ef8d52e6072cda68c7641b261257f6761c80f03e7",
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

interface SupportedManifestPlan {
  readonly manifestHash: string;
  readonly declarations: readonly PrewarmDeclaration[];
}

/**
 * Returns the complete manifest for the first prewarmed water plane. This
 * release binds the canonical 8x4 RGBA8 sRGB equirect Host environment
 * reflection into both the public descriptor field and the environment-radiance
 * declaration. The factory is synchronous and does not hash at runtime.
 *
 * @public
 */
export function createMinimalWaterPrewarmManifest(
  profile: QualityProfile = createMinimalWaterQualityProfile(),
): PrewarmManifest {
  const normalizedProfile = normalizeQualityProfile(profile);
  const plan = supportedManifestPlan(normalizedProfile.id);
  return freezeManifest({
    schema: PREWARM_MANIFEST_SCHEMA,
    version: PREWARM_MANIFEST_VERSION,
    id: MINIMAL_WATER_MANIFEST_ID,
    manifestHash: plan.manifestHash,
    qualityProfile: normalizedProfile,
    environmentReflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
    effectVariants: SUPPORTED_EFFECT_VARIANTS,
    declarations: plan.declarations,
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
  const plan = supportedManifestPlan(qualityProfile.id);

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
): SupportedManifestPlan {
  return profileId === "minimal-high-detail"
    ? {
        manifestHash: MINIMAL_HIGH_DETAIL_WATER_MANIFEST_HASH,
        declarations: MINIMAL_HIGH_DETAIL_WATER_DECLARATIONS,
      }
    : {
        manifestHash: MINIMAL_WATER_MANIFEST_HASH,
        declarations: MINIMAL_WATER_DECLARATIONS,
      };
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
