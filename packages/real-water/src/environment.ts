import { hasExactKeys, isRecord } from "./internal/record-validation.js";

const SHA_256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const THREE_RGBA_FORMAT = 1023;
const THREE_UNSIGNED_BYTE_TYPE = 1009;
const THREE_SRGB_COLOR_SPACE = "srgb";
const THREE_LINEAR_SRGB_COLOR_SPACE = "srgb-linear";

/**
 * The only environment radiance this release prepares. This release accepts
 * equirect layouts only; cube maps are rejected. Identity, content fingerprint,
 * size, format, type, and color space are structural. Those fields are encoded
 * in the static environment-radiance declaration fingerprint; changing one
 * requires a new Prewarm Manifest and re-preparation.
 *
 * `fingerprint` is the Host verification credential: the SHA-256 of the
 * canonical 8x4 RGBA8 sRGB pixels. Real Water checks this asserted credential
 * and the borrowed texture's layout. It does not dispose the Host texture or
 * read back its pixels at runtime. Texture bytes, sampler, and identity must
 * remain unchanged and alive through the lease.
 *
 * @public
 */
export const SUPPORTED_HOST_ENVIRONMENT_REFLECTION = Object.freeze({
  identity: "water-environment-radiance",
  fingerprint:
    "sha256:84b8a165a60b53c9e86a4b1741543e54dba29c63628244127792cbc9fa236f91",
  width: 8,
  height: 4,
  format: "rgba8unorm",
  type: "equirect",
  colorSpace: "srgb",
}) satisfies HostEnvironmentReflectionDescriptor;

/**
 * SHA-256 of the supported reflection's identity, content fingerprint, width,
 * height, format, type, and colorSpace. This is the Prewarm Manifest
 * declaration fingerprint; it is not the radiance content hash.
 */
export const SUPPORTED_HOST_ENVIRONMENT_WORK_PLAN_FINGERPRINT =
  "sha256:3b4e72ce8470faf690ea64fa4f7e0e99c36517e5c93df2036bd80472021b777d";

/**
 * Visible finite sun disk used by Reference and test lighting. The glint lobe
 * width is derived from this radius and surface roughness.
 *
 * @public
 */
export const SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS = 0.069;

const CANONICAL_ENVIRONMENT_RADIANCE_BYTES = Uint8Array.from([
  120, 220, 255, 255, 138, 220, 255, 255, 155, 220, 255, 255, 173, 220, 255,
  255, 190, 220, 255, 255, 208, 220, 255, 255, 225, 220, 255, 255, 243, 220,
  255, 255, 107, 177, 183, 255, 124, 177, 183, 255, 142, 177, 183, 255, 159,
  177, 183, 255, 177, 177, 183, 255, 194, 177, 183, 255, 212, 177, 183, 255,
  229, 177, 183, 255, 93, 133, 112, 255, 111, 133, 112, 255, 128, 133, 112, 255,
  146, 133, 112, 255, 163, 133, 112, 255, 181, 133, 112, 255, 198, 133, 112,
  255, 216, 133, 112, 255, 80, 90, 40, 255, 98, 90, 40, 255, 115, 90, 40, 255,
  133, 90, 40, 255, 150, 90, 40, 255, 168, 90, 40, 255, 185, 90, 40, 255, 203,
  90, 40, 255,
]);

/**
 * Stable marker from a borrowed Host texture.
 *
 * @public
 */
export interface HostTexture {
  /** Native texture type marker retained by the Host. */
  readonly isTexture: boolean;
}

/**
 * Structural identity of a borrowed Host environment reflection resource.
 *
 * @public
 */
export type HostEnvironmentReflectionType = "equirect";

/**
 * Color space declared for a borrowed Host environment reflection resource.
 *
 * @public
 */
export type HostEnvironmentColorSpace = "srgb";

/**
 * Host-authored finite lighting used by the basic optical path.
 *
 * Texture identity, format, and size are structural. These scalars may change
 * on a hot tick.
 *
 * @public
 */
export interface HostEnvironmentState {
  readonly sunDirectionX: number;
  readonly sunDirectionY: number;
  readonly sunDirectionZ: number;
  readonly sunColorR: number;
  readonly sunColorG: number;
  readonly sunColorB: number;
  readonly sunIntensity: number;
  readonly environmentIntensity: number;
  readonly sunAngularRadiusRadians: number;
}

/**
 * Structural descriptor verified against the Prewarm Manifest.
 *
 * @public
 */
export interface HostEnvironmentReflectionDescriptor {
  readonly identity: string;
  readonly fingerprint: string;
  readonly width: number;
  readonly height: number;
  readonly format: "rgba8unorm";
  readonly type: HostEnvironmentReflectionType;
  readonly colorSpace: HostEnvironmentColorSpace;
}

/**
 * Canonical reflection descriptor plus an optional Host-owned texture.
 *
 * @public
 */
export interface HostEnvironmentReflectionResource extends HostEnvironmentReflectionDescriptor {
  readonly texture?: HostTexture | null;
}

/**
 * Host-owned Environment Adapter. Real Water never reads `scene.environment`
 * or guesses sun, sky, or weather.
 *
 * @public
 */
export interface HostEnvironmentAdapter {
  readonly reflection: HostEnvironmentReflectionDescriptor;
  readonly texture: HostTexture | null;
  snapshot(): HostEnvironmentState;
}

/**
 * Returns the supported Host environment reflection, optionally borrowing a
 * Host-owned texture that must agree at Three Host preparation.
 *
 * @public
 */
export function createSupportedHostEnvironmentReflection(
  texture: HostTexture | null = null,
): HostEnvironmentReflectionResource {
  return Object.freeze({
    ...SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
    texture,
  });
}

/**
 * Returns a copy of the canonical 8x4 RGBA8 sRGB pixels whose SHA-256 is
 * {@link SUPPORTED_HOST_ENVIRONMENT_REFLECTION.fingerprint}. Hosts may use
 * these bytes to satisfy the verification credential.
 *
 * @public
 */
export function createSupportedHostEnvironmentRadianceBytes(): Uint8Array {
  return Uint8Array.from(CANONICAL_ENVIRONMENT_RADIANCE_BYTES);
}

/**
 * Creates a Host Environment Adapter. The reflection descriptor is structural.
 * Lighting scalars are re-read from `state` on every snapshot so a Host can
 * change sun and environment intensity without replacing the adapter.
 *
 * @public
 */
export function createStaticHostEnvironmentAdapter(
  reflection: HostEnvironmentReflectionResource,
  state: HostEnvironmentState,
): HostEnvironmentAdapter {
  const adapter = {
    reflection: {
      identity: reflection.identity,
      fingerprint: reflection.fingerprint,
      width: reflection.width,
      height: reflection.height,
      format: reflection.format,
      type: reflection.type,
      colorSpace: reflection.colorSpace,
    },
    texture: reflection.texture ?? null,
    snapshot: () => state,
  };
  const descriptor = readHostEnvironmentReflection(adapter);
  assertSupportedHostEnvironmentReflection(descriptor);
  readHostEnvironmentState({
    ...adapter,
    reflection: descriptor,
  });
  return Object.freeze({
    reflection: descriptor,
    texture: reflection.texture ?? null,
    snapshot: () =>
      readHostEnvironmentState({
        ...adapter,
        reflection: descriptor,
      }),
  });
}

export function readHostEnvironmentReflection(
  environment: Pick<HostEnvironmentAdapter, "reflection">,
): HostEnvironmentReflectionDescriptor {
  const value: unknown = environment.reflection;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "identity",
      "fingerprint",
      "width",
      "height",
      "format",
      "type",
      "colorSpace",
    ])
  ) {
    throw new TypeError(
      "The Host environment reflection needs identity, fingerprint, dimensions, format, and type.",
    );
  }
  if (
    typeof value.identity !== "string" ||
    value.identity.length === 0 ||
    typeof value.fingerprint !== "string" ||
    !SHA_256_PATTERN.test(value.fingerprint) ||
    typeof value.width !== "number" ||
    typeof value.height !== "number" ||
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    value.width < 1 ||
    value.height < 1 ||
    typeof value.format !== "string" ||
    value.format.length === 0 ||
    typeof value.colorSpace !== "string" ||
    value.colorSpace.length === 0
  ) {
    throw new TypeError(
      "The Host environment reflection needs identity, fingerprint, dimensions, format, and type.",
    );
  }
  if (!isReflectionType(value.type)) {
    throw new TypeError(
      "This release prepares only equirect Host environment radiance.",
    );
  }
  return Object.freeze({
    identity: value.identity,
    fingerprint: value.fingerprint,
    width: value.width,
    height: value.height,
    format: value.format,
    type: value.type,
    colorSpace: value.colorSpace,
  }) as HostEnvironmentReflectionDescriptor;
}

export function readHostEnvironmentState(
  environment: HostEnvironmentAdapter,
): HostEnvironmentState {
  const state = environment.snapshot();
  const {
    sunDirectionX,
    sunDirectionY,
    sunDirectionZ,
    sunColorR,
    sunColorG,
    sunColorB,
    sunIntensity,
    environmentIntensity,
    sunAngularRadiusRadians,
  } = state;
  if (
    !Number.isFinite(sunDirectionX) ||
    !Number.isFinite(sunDirectionY) ||
    !Number.isFinite(sunDirectionZ) ||
    sunDirectionX * sunDirectionX +
      sunDirectionY * sunDirectionY +
      sunDirectionZ * sunDirectionZ ===
      0
  ) {
    throw new RangeError(
      "Host sun direction must be a non-zero finite vector.",
    );
  }
  if (
    !Number.isFinite(sunColorR) ||
    !Number.isFinite(sunColorG) ||
    !Number.isFinite(sunColorB) ||
    !Number.isFinite(sunIntensity) ||
    !Number.isFinite(environmentIntensity) ||
    sunColorR < 0 ||
    sunColorG < 0 ||
    sunColorB < 0 ||
    sunIntensity < 0 ||
    environmentIntensity < 0
  ) {
    throw new RangeError("Host environment lighting scalars must be finite.");
  }
  if (
    !Number.isFinite(sunAngularRadiusRadians) ||
    sunAngularRadiusRadians <= 0 ||
    sunAngularRadiusRadians > Math.PI
  ) {
    throw new RangeError(
      "Host sun angular radius must be a positive finite angle.",
    );
  }
  return Object.freeze({
    sunDirectionX,
    sunDirectionY,
    sunDirectionZ,
    sunColorR,
    sunColorG,
    sunColorB,
    sunIntensity,
    environmentIntensity,
    sunAngularRadiusRadians,
  });
}

export function assertHostEnvironmentMatchesManifest(
  environment: HostEnvironmentAdapter,
  manifest: {
    readonly environmentReflection: HostEnvironmentReflectionDescriptor;
  },
): void {
  const descriptor = readHostEnvironmentReflection(environment);
  readHostEnvironmentState(environment);
  assertSupportedHostEnvironmentReflection(descriptor);
  const declared = readHostEnvironmentReflection({
    reflection: manifest.environmentReflection,
  });
  if (
    descriptor.identity !== declared.identity ||
    descriptor.fingerprint !== declared.fingerprint ||
    descriptor.width !== declared.width ||
    descriptor.height !== declared.height ||
    descriptor.format !== declared.format ||
    descriptor.type !== declared.type ||
    descriptor.colorSpace !== declared.colorSpace
  ) {
    throw new TypeError(
      "The Host environment reflection does not match the Prewarm Manifest.",
    );
  }
}

/**
 * Confirms a borrowed Three texture's size, format, type, and color space
 * match the public reflection descriptor. Real Water never inspects TSL nodes.
 */
export function assertHostEnvironmentTextureMatchesDescriptor(
  texture: HostTexture,
  descriptor: HostEnvironmentReflectionDescriptor,
): void {
  if (texture.isTexture !== true) {
    throw new TypeError(
      "The Host environment radiance must be a Host-owned Three texture.",
    );
  }
  const observed = readBorrowedEnvironmentTextureLayout(texture);
  if (
    observed.width !== descriptor.width ||
    observed.height !== descriptor.height ||
    observed.format !== descriptor.format ||
    observed.type !== descriptor.type ||
    observed.colorSpace !== descriptor.colorSpace
  ) {
    throw new TypeError(
      "The Host environment radiance texture does not match its reflection descriptor.",
    );
  }
}

function assertSupportedHostEnvironmentReflection(
  descriptor: HostEnvironmentReflectionDescriptor,
): void {
  if (descriptor.type !== "equirect") {
    throw new TypeError(
      "This release prepares only equirect Host environment radiance.",
    );
  }
  const supported = SUPPORTED_HOST_ENVIRONMENT_REFLECTION;
  if (
    descriptor.identity !== supported.identity ||
    descriptor.fingerprint !== supported.fingerprint ||
    descriptor.width !== supported.width ||
    descriptor.height !== supported.height ||
    descriptor.format !== supported.format ||
    descriptor.colorSpace !== supported.colorSpace
  ) {
    throw new TypeError(
      "The Host environment reflection does not match the prepared environment radiance.",
    );
  }
}

function readBorrowedEnvironmentTextureLayout(texture: HostTexture): {
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly type: HostEnvironmentReflectionType | "cube";
  readonly colorSpace: "srgb" | "linear";
} {
  const candidate = texture as HostTexture & {
    readonly isCubeTexture?: boolean;
    readonly image?: unknown;
    readonly format?: unknown;
    readonly type?: unknown;
    readonly colorSpace?: unknown;
  };
  const size = readBorrowedTextureSize(candidate.image);
  const format =
    candidate.format === THREE_RGBA_FORMAT &&
    candidate.type === THREE_UNSIGNED_BYTE_TYPE
      ? "rgba8unorm"
      : undefined;
  const colorSpace =
    candidate.colorSpace === THREE_SRGB_COLOR_SPACE
      ? "srgb"
      : candidate.colorSpace === THREE_LINEAR_SRGB_COLOR_SPACE ||
          candidate.colorSpace === ""
        ? "linear"
        : undefined;
  if (format === undefined || colorSpace === undefined) {
    throw new TypeError(
      "The Host environment radiance texture does not match its reflection descriptor.",
    );
  }
  return {
    width: size.width,
    height: size.height,
    format,
    type: candidate.isCubeTexture === true ? "cube" : "equirect",
    colorSpace,
  };
}

function readBorrowedTextureSize(image: unknown): {
  readonly width: number;
  readonly height: number;
} {
  const face = Array.isArray(image) ? image[0] : image;
  if (
    !isRecord(face) ||
    typeof face.width !== "number" ||
    typeof face.height !== "number" ||
    !Number.isInteger(face.width) ||
    !Number.isInteger(face.height) ||
    face.width < 1 ||
    face.height < 1
  ) {
    throw new TypeError(
      "The Host environment radiance texture does not match its reflection descriptor.",
    );
  }
  return {
    width: face.width,
    height: face.height,
  };
}

function isReflectionType(
  value: unknown,
): value is HostEnvironmentReflectionType {
  return value === "equirect";
}
