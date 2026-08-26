import { sha256Hex } from "./internal/sha256.js";
import { MAX_ACTIVE_DISTURBANCES } from "./capabilities.js";

const UINT32_RANGE = 0x1_0000_0000;
// High word zero remains reserved for global particle-domain sources. Manual
// Disturbances use high word one; Body-domain hashes start at high word two.
const MANUAL_SOURCE_DOMAIN_OFFSET = UINT32_RANGE;
const BODY_SOURCE_DOMAIN_OFFSET = UINT32_RANGE * 2;
const BODY_SOURCE_DOMAIN_SIZE =
  Number.MAX_SAFE_INTEGER - BODY_SOURCE_DOMAIN_OFFSET + 1;

export interface BodyInteractionSourceIdentity {
  readonly interactionSourceId: number;
  readonly socketId: string;
  readonly stableSourceId: number;
}

export interface BodyInteractionSourceIdentityReservation {
  readonly sources: readonly BodyInteractionSourceIdentity[];
  release(): void;
}

export interface BodyInteractionSourceIdentityRegistry {
  reserve(
    interactionSourceId: number,
    socketIds: readonly string[],
  ): BodyInteractionSourceIdentityReservation;
}

type BodyStableSourceIdMint = (
  interactionSourceId: number,
  socketId: string,
) => number;

export interface StableInteractionSource {
  readonly stableSourceId: number;
}

/**
 * Validates every active interaction source and writes its stable-id order
 * into caller-owned scratch. The insertion sort is intentionally bounded and
 * allocation-free because consumers call this on the candidate hot path.
 */
export function canonicalizeInteractionStableSources(
  sources: readonly StableInteractionSource[],
  stableSourceIds: Float64Array,
  sourceOrder: Uint32Array,
): number {
  const count = sources.length;
  if (
    count > MAX_ACTIVE_DISTURBANCES ||
    stableSourceIds.length < MAX_ACTIVE_DISTURBANCES ||
    sourceOrder.length < MAX_ACTIVE_DISTURBANCES
  ) {
    throw new RangeError(
      `Interaction source canonicalization requires scratch for ${String(MAX_ACTIVE_DISTURBANCES)} sources and no more than that many inputs.`,
    );
  }

  for (let index = 0; index < count; index += 1) {
    const stableSourceId = sources[index]?.stableSourceId;
    if (
      stableSourceId === undefined ||
      !Number.isSafeInteger(stableSourceId) ||
      stableSourceId < 0
    ) {
      throw new RangeError(
        "Interaction stableSourceId values must be non-negative safe integers.",
      );
    }
    stableSourceIds[index] = stableSourceId;
    let insertion = index;
    while (insertion > 0) {
      const previousSourceIndex = sourceOrder[insertion - 1];
      if (previousSourceIndex === undefined) {
        throw new Error(
          "Interaction source canonicalization order scratch is incomplete.",
        );
      }
      const previousStableSourceId = stableSourceIds[previousSourceIndex];
      if (previousStableSourceId === undefined) {
        throw new Error(
          "Interaction source canonicalization scratch is incomplete.",
        );
      }
      if (previousStableSourceId === stableSourceId) {
        throw new TypeError(
          "Interaction stableSourceId values must be unique across active source partitions.",
        );
      }
      if (previousStableSourceId < stableSourceId) {
        break;
      }
      sourceOrder[insertion] = previousSourceIndex;
      insertion -= 1;
    }
    sourceOrder[insertion] = index;
  }
  return count;
}

/** Manual Disturbance ids occupy high word one without losing the Uint32 id. */
export function manualInteractionStableSourceId(id: number): number {
  if (!Number.isInteger(id) || id < 0 || id >= UINT32_RANGE) {
    throw new RangeError(
      "Manual interaction source ids must be Uint32 values.",
    );
  }
  return MANUAL_SOURCE_DOMAIN_OFFSET + id;
}

/**
 * Mints one Body-domain source id from the Host Body identity and canonical
 * socket identity. Neither attachment handles nor container order participate.
 */
export function bodyInteractionStableSourceId(
  interactionSourceId: number,
  socketId: string,
): number {
  assertInteractionSourceId(interactionSourceId);
  assertCanonicalSocketId(socketId);
  const canonical = bodySourceCanonicalTuple(interactionSourceId, socketId);
  const digest = sha256Hex(new TextEncoder().encode(canonical));
  const digestPrefix = BigInt(`0x${digest.slice(0, 16)}`);
  const bodyDomainOffset = BigInt(BODY_SOURCE_DOMAIN_OFFSET);
  const bodyDomainSize = BigInt(BODY_SOURCE_DOMAIN_SIZE);
  return Number(bodyDomainOffset + (digestPrefix % bodyDomainSize));
}

/**
 * Maintains the cold-path active reservation that turns a hash collision or
 * duplicate domain tuple into an attach-time failure instead of an alias.
 */
export function createBodyInteractionSourceIdentityRegistry(
  mintStableSourceId: BodyStableSourceIdMint = bodyInteractionStableSourceId,
): BodyInteractionSourceIdentityRegistry {
  const activeCanonicalTuples = new Map<string, number>();
  const activeStableSourceIds = new Map<number, string>();

  return Object.freeze({
    reserve(
      interactionSourceId: number,
      socketIds: readonly string[],
    ): BodyInteractionSourceIdentityReservation {
      assertInteractionSourceId(interactionSourceId);
      if (!Array.isArray(socketIds)) {
        throw new TypeError(
          "Body interaction source socket ids must be an array.",
        );
      }
      const pendingCanonicalTuples = new Set<string>();
      const pendingStableSourceIds = new Map<number, string>();
      const sources = socketIds.map(
        (socketId): BodyInteractionSourceIdentity => {
          assertCanonicalSocketId(socketId);
          const canonical = bodySourceCanonicalTuple(
            interactionSourceId,
            socketId,
          );
          if (
            pendingCanonicalTuples.has(canonical) ||
            activeCanonicalTuples.has(canonical)
          ) {
            throw new TypeError(
              "An active Body interaction source already reserves this canonical Body and socket identity.",
            );
          }
          const stableSourceId = mintStableSourceId(
            interactionSourceId,
            socketId,
          );
          assertBodyDomainStableSourceId(stableSourceId);
          const collidingCanonical =
            pendingStableSourceIds.get(stableSourceId) ??
            activeStableSourceIds.get(stableSourceId);
          if (
            collidingCanonical !== undefined &&
            collidingCanonical !== canonical
          ) {
            throw new TypeError(
              "A Body interaction source stable-id collision was detected before attachment.",
            );
          }
          pendingCanonicalTuples.add(canonical);
          pendingStableSourceIds.set(stableSourceId, canonical);
          return Object.freeze({
            interactionSourceId,
            socketId,
            stableSourceId,
          });
        },
      );

      for (const source of sources) {
        const canonical = bodySourceCanonicalTuple(
          source.interactionSourceId,
          source.socketId,
        );
        activeCanonicalTuples.set(canonical, source.stableSourceId);
        activeStableSourceIds.set(source.stableSourceId, canonical);
      }

      let released = false;
      return Object.freeze({
        sources: Object.freeze(sources),
        release(): void {
          if (released) {
            return;
          }
          released = true;
          for (const source of sources) {
            const canonical = bodySourceCanonicalTuple(
              source.interactionSourceId,
              source.socketId,
            );
            if (
              activeCanonicalTuples.get(canonical) === source.stableSourceId
            ) {
              activeCanonicalTuples.delete(canonical);
            }
            if (
              activeStableSourceIds.get(source.stableSourceId) === canonical
            ) {
              activeStableSourceIds.delete(source.stableSourceId);
            }
          }
        },
      });
    },
  });
}

function bodySourceCanonicalTuple(
  interactionSourceId: number,
  socketId: string,
): string {
  return `${String(interactionSourceId)}:${String(socketId.length)}:${socketId}`;
}

function assertInteractionSourceId(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "A Body interactionSourceId must be a non-negative safe integer.",
    );
  }
}

function assertCanonicalSocketId(value: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value
  ) {
    throw new TypeError(
      "Body interaction socket ids must be non-empty, trimmed, and NFC-normalized.",
    );
  }
}

function assertBodyDomainStableSourceId(value: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < BODY_SOURCE_DOMAIN_OFFSET ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError(
      "Body interaction stable source ids must be safe integers in the Body domain.",
    );
  }
}
