import { createHash } from "node:crypto";
import {
  isAdmittedPowerProfile,
  type HostPowerProfile,
} from "./host-power-profile.js";

export const ADMITTED_OPTICAL_SCREENSHOT_PROFILE = Object.freeze({
  os: "darwin",
  osRelease: "27.0.0",
  arch: "arm64",
  cpuModel: "Apple M5",
  chromeVersion: "151.0.7922.169",
  headless: true,
  powerState: "ac" as const,
  lowPowerMode: 0 as const,
  rendererDeviceFingerprint:
    "sha256:6ee054fd1f40dd96953cf1c3be499df39dd40c603c7817e8abadaa5d0f08a2b5",
});

export const SCREENSHOT_PROFILE_EVIDENCE_KEYS = [
  "os",
  "osRelease",
  "arch",
  "cpuModel",
  "chromeVersion",
  "headless",
  "powerState",
  "lowPowerMode",
  "projectId",
  "rendererDeviceFingerprint",
  "admitted",
  "asserted",
  "authoritative",
] as const;

export interface OpticalScreenshotProfile {
  readonly os: string;
  readonly osRelease: string;
  readonly arch: string;
  readonly cpuModel: string;
  readonly chromeVersion: string;
  readonly headless: boolean;
  readonly powerState: HostPowerProfile["powerState"];
  readonly lowPowerMode: HostPowerProfile["lowPowerMode"];
  readonly projectId: string;
  readonly rendererDeviceFingerprint: string | null;
}

export interface ScreenshotProfileEvidence extends OpticalScreenshotProfile {
  readonly admitted: boolean;
  readonly asserted: boolean;
  readonly authoritative: boolean;
}

export function rendererDeviceFingerprint(
  rendererDevice: unknown,
): string | null {
  if (!isRendererDeviceInventory(rendererDevice)) {
    return null;
  }
  const canonical = {
    features: [...rendererDevice.features].sort(),
    limits: Object.fromEntries(
      Object.entries(rendererDevice.limits).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isFinite(entry[1]),
      ),
    ),
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
}

export function isAdmittedOpticalScreenshotProfile(
  profile: OpticalScreenshotProfile,
): boolean {
  return (
    profile.os === ADMITTED_OPTICAL_SCREENSHOT_PROFILE.os &&
    profile.osRelease === ADMITTED_OPTICAL_SCREENSHOT_PROFILE.osRelease &&
    profile.arch === ADMITTED_OPTICAL_SCREENSHOT_PROFILE.arch &&
    profile.cpuModel === ADMITTED_OPTICAL_SCREENSHOT_PROFILE.cpuModel &&
    profile.chromeVersion ===
      ADMITTED_OPTICAL_SCREENSHOT_PROFILE.chromeVersion &&
    profile.headless === ADMITTED_OPTICAL_SCREENSHOT_PROFILE.headless &&
    profile.powerState === ADMITTED_OPTICAL_SCREENSHOT_PROFILE.powerState &&
    profile.lowPowerMode === ADMITTED_OPTICAL_SCREENSHOT_PROFILE.lowPowerMode &&
    profile.rendererDeviceFingerprint ===
      ADMITTED_OPTICAL_SCREENSHOT_PROFILE.rendererDeviceFingerprint &&
    isAdmittedPowerProfile({
      powerState: profile.powerState,
      lowPowerMode: profile.lowPowerMode,
    })
  );
}

export function readScreenshotProfileEvidence(input: {
  readonly value: unknown;
  readonly rendererDevice: unknown;
  readonly topFingerprint: unknown;
  readonly asserted: boolean;
}): ScreenshotProfileEvidence {
  if (
    !isRecord(input.value) ||
    !hasExactKeys(input.value, SCREENSHOT_PROFILE_EVIDENCE_KEYS)
  ) {
    throw new TypeError(
      "Regression acceptance screenshotProfile must use the exact admitted-profile contract.",
    );
  }
  const fingerprint = rendererDeviceFingerprint(input.rendererDevice);
  if (
    input.topFingerprint !== fingerprint ||
    input.value.rendererDeviceFingerprint !== fingerprint
  ) {
    throw new Error(
      "rendererDeviceFingerprint must be recomputed from the renderer device features and limits.",
    );
  }
  if (
    typeof input.value.os !== "string" ||
    typeof input.value.osRelease !== "string" ||
    typeof input.value.arch !== "string" ||
    typeof input.value.cpuModel !== "string" ||
    typeof input.value.chromeVersion !== "string" ||
    typeof input.value.projectId !== "string" ||
    typeof input.value.headless !== "boolean"
  ) {
    throw new TypeError(
      "screenshotProfile host identity fields must be exact.",
    );
  }
  if (
    input.value.powerState !== "ac" &&
    input.value.powerState !== "battery" &&
    input.value.powerState !== "unknown"
  ) {
    throw new TypeError(
      "screenshotProfile.powerState must be a host power state.",
    );
  }
  if (
    input.value.lowPowerMode !== 0 &&
    input.value.lowPowerMode !== 1 &&
    input.value.lowPowerMode !== null
  ) {
    throw new TypeError(
      "screenshotProfile.lowPowerMode must be 0, 1, or null.",
    );
  }
  const profile: OpticalScreenshotProfile = {
    os: input.value.os,
    osRelease: input.value.osRelease,
    arch: input.value.arch,
    cpuModel: input.value.cpuModel,
    chromeVersion: input.value.chromeVersion,
    headless: input.value.headless,
    powerState: input.value.powerState,
    lowPowerMode: input.value.lowPowerMode,
    projectId: input.value.projectId,
    rendererDeviceFingerprint: fingerprint,
  };
  const admitted = isAdmittedOpticalScreenshotProfile(profile);
  const authoritative = input.asserted && admitted;
  if (
    input.value.admitted !== admitted ||
    input.value.asserted !== input.asserted ||
    input.value.authoritative !== authoritative
  ) {
    throw new Error(
      "screenshotProfile admitted/asserted/authoritative must match the admitted profile and power policy.",
    );
  }
  return Object.freeze({
    ...profile,
    admitted,
    asserted: input.asserted,
    authoritative,
  });
}

function isRendererDeviceInventory(value: unknown): value is {
  readonly features: readonly string[];
  readonly limits: Readonly<Record<string, number>>;
} {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (!("features" in value) || !("limits" in value)) {
    return false;
  }
  const { features, limits } = value;
  if (
    !Array.isArray(features) ||
    !features.every((feature) => typeof feature === "string")
  ) {
    return false;
  }
  if (limits === null || typeof limits !== "object" || Array.isArray(limits)) {
    return false;
  }
  return Object.values(limits).every(
    (entry) => typeof entry === "number" && Number.isFinite(entry),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
