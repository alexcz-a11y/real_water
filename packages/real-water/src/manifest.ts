import { RealWaterStartupError } from "./errors.js";
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
export const PREWARM_MANIFEST_VERSION = 1 as const;

/**
 * Structural declaration kinds supported by the first Readiness Gate.
 *
 * @public
 */
export type PrewarmDeclarationKind =
  "resource" | "effect-state" | "conditional-route";

/**
 * One declared item of work in a version 1 Prewarm Manifest.
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
 * One exact effect route prepared by a version 1 Prewarm Manifest.
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
  renderTarget: "water-render-target",
  geometry: "water-geometry",
  spectralBand: "water-spectral-band",
  material: "water-material",
  renderRoute: "water-render-route",
  hiddenStabilization: "water-hidden-stabilization",
  completionProbe: "water-completion-probe",
  mainCameraGuard: "water-main-camera-guard",
} as const);

const MINIMAL_WATER_MANIFEST_ID = "reference-minimal-water";
const MINIMAL_WATER_MANIFEST_HASH =
  "sha256:48af0d22099244d6cc6b547450e1b79a916375df0fa5d4eb294601a20388e2b1";
const MINIMAL_HIGH_DETAIL_WATER_MANIFEST_HASH =
  "sha256:16a9310a96ab00ac7b44cd8ce2a77026f67057d7c534d785ba37ec1112f32c04";
const MINIMAL_WATER_DECLARATIONS: readonly PrewarmDeclaration[] = [
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.texture,
    kind: "resource",
    label: "Minimal water texture",
    fingerprint:
      "sha256:6a6c8aa146e7dd50e15eed0c5b627b961a11fbd49b4655147345a44a5d0bb1bc",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.renderTarget,
    kind: "resource",
    label: "Minimal water render target",
    fingerprint:
      "sha256:65d1be5b0a29b0f3c321446487931e44cfe098e96943d4bed09c77f82e4815f0",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.geometry,
    kind: "resource",
    label: "Minimal water plane geometry",
    fingerprint:
      "sha256:14bc8848f560c11d223eb40ebcb936d86cacc19263ac5b1c4152a77bcfa84313",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.spectralBand,
    kind: "effect-state",
    label: "Single coherent spectral wave band",
    fingerprint:
      "sha256:d80f9ba83f878f62e9bb3f2d5c67d516ea5395606165edf548b8e653de9ac80a",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.material,
    kind: "effect-state",
    label: "Minimal water material",
    fingerprint:
      "sha256:cb92e44849230c27f6fc9ba15d36b173413aae6084afbf08c06c6a7bbe492f75",
  },
  {
    id: MINIMAL_WATER_PREWARM_DECLARATION_IDS.renderRoute,
    kind: "conditional-route",
    label: "Minimal water render route",
    fingerprint:
      "sha256:1980a55d78567111049b94ebc51967e22a7c07656dcefebe38436ed3c8a35d8b",
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
      "sha256:8d9e2a4c4179496527e5dbda169711fedd3efb8673d53a6456b0167f13af83ab",
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
    declaration.id === MINIMAL_WATER_PREWARM_DECLARATION_IDS.geometry
      ? {
          ...declaration,
          fingerprint:
            "sha256:27b789113e72349d7a65e871dfd7362acfa987e41709beb45c3d9ca64b8f2356",
        }
      : declaration,
  );

interface SupportedManifestPlan {
  readonly manifestHash: string;
  readonly declarations: readonly PrewarmDeclaration[];
}

/**
 * Returns the complete manifest for the first prewarmed water plane.
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
    effectVariants: freezeEffectVariants(manifest.effectVariants),
  });
}

function freezeManifest(manifest: PrewarmManifest): PrewarmManifest {
  return Object.freeze({
    ...manifest,
    qualityProfile: normalizeQualityProfile(manifest.qualityProfile),
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
