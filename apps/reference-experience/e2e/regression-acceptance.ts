import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, release } from "node:os";
import { join, resolve } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import {
  createMinimalWaterPrewarmManifest,
  type ArtisticControls,
  type HostEnvironmentReflectionDescriptor,
  type HostEnvironmentState,
  type WaterPresetIdentity,
} from "real-water";
import type { QaCameraV1 } from "../src/qa-harness.js";
import {
  isAdmittedPowerProfile,
  readHostPowerProfile,
  type HostPowerProfile,
} from "./host-power-profile.js";

export const REGRESSION_ACCEPTANCE_DIRECTORY = join(
  "test-results",
  "regression-acceptance",
);

const CORE_MANIFEST = createMinimalWaterPrewarmManifest();
const HOST_POWER_PROFILE = readHostPowerProfile();

export const ADMITTED_OPTICAL_SCREENSHOT_PROFILE = Object.freeze({
  os: "darwin",
  osRelease: "27.0.0",
  arch: "arm64",
  cpuModel: "Apple M5",
  chromeVersion: "151.0.7922.169",
  headless: true,
  powerState: "ac",
  lowPowerMode: 0,
  rendererDeviceFingerprint:
    "sha256:6ee054fd1f40dd96953cf1c3be499df39dd40c603c7817e8abadaa5d0f08a2b5",
});

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

export interface RegressionAcceptanceScreenshot {
  readonly name: string;
  readonly asserted: boolean;
  readonly authoritative: boolean;
  readonly criticalRegion:
    | Readonly<{
        readonly kind: "full-canvas";
        readonly reason: string;
      }>
    | Readonly<{
        readonly kind: "clip";
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly reason: string;
      }>;
}

export interface RegressionAcceptanceDetails {
  readonly seed: number;
  readonly tick: number;
  readonly camera: QaCameraV1;
  readonly controlRevision: number;
  readonly coreManifest: {
    readonly hash: string;
    readonly identity: {
      readonly schema: string;
      readonly version: number;
      readonly id: string;
      readonly manifestHash: string;
      readonly qualityProfile: {
        readonly schema: string;
        readonly version: number;
        readonly id: string;
        readonly profileHash: string;
      };
      readonly environmentReflection: HostEnvironmentReflectionDescriptor;
      readonly effectVariants: readonly unknown[];
    };
  };
  readonly qaPrewarm: {
    readonly schema: string;
    readonly version: number;
    readonly id: string;
    readonly declarations?: readonly unknown[];
    readonly captures?: readonly unknown[];
    readonly rendererDevice?: unknown;
  };
  readonly qaHarness?: {
    readonly schema: string;
    readonly version: number;
  };
  readonly qaCapture?: {
    readonly schema: string;
    readonly version: number;
    readonly names: readonly string[];
  };
  readonly artisticControls?: ArtisticControls;
  readonly waterPreset?: WaterPresetIdentity;
  readonly environment?: {
    readonly reflection: HostEnvironmentReflectionDescriptor;
    readonly lighting: HostEnvironmentState;
  };
  readonly screenshot?: RegressionAcceptanceScreenshot;
}

export function coreManifestEvidence(hash: string): {
  readonly hash: string;
  readonly identity: RegressionAcceptanceDetails["coreManifest"]["identity"];
} {
  return {
    hash,
    identity: {
      schema: CORE_MANIFEST.schema,
      version: CORE_MANIFEST.version,
      id: CORE_MANIFEST.id,
      manifestHash: hash,
      qualityProfile: {
        schema: CORE_MANIFEST.qualityProfile.schema,
        version: CORE_MANIFEST.qualityProfile.version,
        id: CORE_MANIFEST.qualityProfile.id,
        profileHash: CORE_MANIFEST.qualityProfile.profileHash,
      },
      environmentReflection: CORE_MANIFEST.environmentReflection,
      effectVariants: CORE_MANIFEST.effectVariants,
    },
  };
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

export async function readOpticalScreenshotProfile(
  page: Page,
  testInfo: TestInfo,
  rendererDevice: unknown,
): Promise<OpticalScreenshotProfile> {
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const chromeVersion =
    page.context().browser()?.version() ??
    chromeVersionFromUserAgent(userAgent);
  return {
    os: process.platform,
    osRelease: release(),
    arch: process.arch,
    cpuModel: cpus()[0]?.model ?? "unknown",
    chromeVersion,
    headless: testInfo.project.use.headless !== false,
    powerState: HOST_POWER_PROFILE.powerState,
    lowPowerMode: HOST_POWER_PROFILE.lowPowerMode,
    projectId: testInfo.project.name,
    rendererDeviceFingerprint: rendererDeviceFingerprint(rendererDevice),
  };
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

export async function attachRegressionAcceptance(
  testInfo: TestInfo,
  page: Page,
  details: RegressionAcceptanceDetails,
): Promise<Readonly<Record<string, unknown>>> {
  const [userAgent, hardwareConcurrency, drawingBuffer, navigatorGpuAdapter] =
    await Promise.all([
      page.evaluate(() => navigator.userAgent),
      page.evaluate(() => navigator.hardwareConcurrency),
      page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        return canvas === null
          ? { width: 0, height: 0 }
          : { width: canvas.width, height: canvas.height };
      }),
      readNavigatorGpuAdapterEvidence(page),
    ]);
  const chromeVersion =
    page.context().browser()?.version() ??
    chromeVersionFromUserAgent(userAgent);
  const screenshotProfile = await readOpticalScreenshotProfile(
    page,
    testInfo,
    details.qaPrewarm.rendererDevice,
  );
  const admitted = isAdmittedOpticalScreenshotProfile(screenshotProfile);
  const screenshotAsserted = details.screenshot?.asserted ?? false;
  const screenshotAuthoritative =
    details.screenshot?.authoritative ?? (screenshotAsserted && admitted);
  const manifest = {
    evidenceClass: "Regression acceptance",
    chromeVersion,
    userAgent,
    os: process.platform,
    osRelease: release(),
    arch: process.arch,
    cpuModel: cpus()[0]?.model ?? "unknown",
    hardwareConcurrency: hardwareConcurrency || cpus().length,
    projectId: testInfo.project.name,
    profileId: testInfo.project.name,
    headed: testInfo.project.use.headless === false,
    headless: testInfo.project.use.headless !== false,
    devicePixelRatio: testInfo.project.use.deviceScaleFactor ?? 1,
    drawingBuffer,
    navigatorGpuAdapter,
    rendererDevice: details.qaPrewarm.rendererDevice ?? null,
    rendererDeviceFingerprint: screenshotProfile.rendererDeviceFingerprint,
    powerState: HOST_POWER_PROFILE.powerState,
    lowPowerMode: HOST_POWER_PROFILE.lowPowerMode,
    screenshotProfile: {
      ...screenshotProfile,
      admitted,
      asserted: screenshotAsserted,
      authoritative: screenshotAuthoritative,
    },
    seed: details.seed,
    tick: details.tick,
    camera: details.camera,
    controlRevision: details.controlRevision,
    coreManifest: details.coreManifest,
    qaPrewarmManifest: details.qaPrewarm,
    qaHarness: details.qaHarness,
    qaCapture: details.qaCapture,
    artisticControls: details.artisticControls,
    waterPreset: details.waterPreset,
    environment: details.environment,
    screenshot: details.screenshot,
  };
  const filePath = resolve(
    process.cwd(),
    REGRESSION_ACCEPTANCE_DIRECTORY,
    regressionAcceptanceFileName(testInfo),
  );
  await mkdir(resolve(process.cwd(), REGRESSION_ACCEPTANCE_DIRECTORY), {
    recursive: true,
  });
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await testInfo.attach("regression-acceptance.json", {
    path: filePath,
    contentType: "application/json",
  });
  return manifest;
}

async function readNavigatorGpuAdapterEvidence(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const gpu = navigator.gpu;
    if (gpu === undefined) {
      return null;
    }
    const adapter = await gpu.requestAdapter();
    if (adapter === null) {
      return null;
    }
    const info =
      "info" in adapter && adapter.info !== undefined
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            device: adapter.info.device,
            description: adapter.info.description,
          }
        : undefined;
    return {
      info,
      limits: {
        maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
        maxColorAttachmentBytesPerSample:
          adapter.limits.maxColorAttachmentBytesPerSample,
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      },
    };
  });
}

function regressionAcceptanceFileName(testInfo: TestInfo): string {
  const unique = [
    testInfo.project.name,
    testInfo.testId,
    `worker-${String(testInfo.workerIndex)}`,
    `retry-${String(testInfo.retry)}`,
  ]
    .join("--")
    .replace(/[^A-Za-z0-9._-]+/gu, "-");
  const title = testInfo.titlePath
    .join("--")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return `${unique}${title === "" ? "" : `--${title}`}.json`;
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

function chromeVersionFromUserAgent(userAgent: string): string {
  return /(?:Chrome|Chromium)\/([\d.]+)/u.exec(userAgent)?.[1] ?? userAgent;
}
