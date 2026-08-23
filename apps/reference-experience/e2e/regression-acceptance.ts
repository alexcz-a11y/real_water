import { mkdir, writeFile } from "node:fs/promises";
import { cpus, release } from "node:os";
import { resolve } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import {
  createMinimalWaterQualityProfile,
  type ArtisticControls,
  type HostEnvironmentReflectionDescriptor,
  type HostEnvironmentState,
  type WaterPresetIdentity,
} from "real-water";
import type { QaCameraV1 } from "../src/qa-harness.js";
import type { QaFramePrewarmReceipt } from "../src/qa-frame-driver.js";
import { QA_FRAME_PREWARM_MANIFEST } from "../src/qa-frame-driver.js";
import {
  REGRESSION_ACCEPTANCE_EVIDENCE_CLASS,
  REGRESSION_ACCEPTANCE_RELATIVE_DIRECTORY,
  REGRESSION_ACCEPTANCE_SCHEMA,
  REGRESSION_ACCEPTANCE_VERSION,
  assertNativeTemporalPolicy,
  assertRegressionDrawingBuffersAgree,
  canonicalJson,
  readPresentationFrameEvidence,
  readQaBoundCoreManifestIdentity,
  readReadyCapabilities,
  readRegressionAcceptanceEvidence,
  readTemporalStressEvidence,
  sha256Buffer,
  type PresentationFrameEvidence,
  type QaBoundCoreManifestIdentity,
  type RegressionDrawingBuffer,
  type TemporalStressEvidenceV1,
} from "./regression-acceptance-evidence.js";
import { readHostPowerProfile } from "./host-power-profile.js";
import {
  isAdmittedOpticalScreenshotProfile,
  rendererDeviceFingerprint,
  type OpticalScreenshotProfile,
} from "./optical-screenshot-profile.js";

export {
  coreManifestEvidence,
  NATIVE_REGRESSION_TEMPORAL_POLICY,
  REGRESSION_ACCEPTANCE_EVIDENCE_CLASS,
  REGRESSION_ACCEPTANCE_RELATIVE_DIRECTORY,
  createPresentationFrameEvidence,
  readPresentationFrameEvidence,
  sha256Buffer,
} from "./regression-acceptance-evidence.js";
export {
  ADMITTED_OPTICAL_SCREENSHOT_PROFILE,
  isAdmittedOpticalScreenshotProfile,
  rendererDeviceFingerprint,
  type OpticalScreenshotProfile,
} from "./optical-screenshot-profile.js";

export const REGRESSION_ACCEPTANCE_DIRECTORY =
  REGRESSION_ACCEPTANCE_RELATIVE_DIRECTORY;

const HOST_POWER_PROFILE = readHostPowerProfile();

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
  readonly seaLevelMetres?: number;
  readonly camera: QaCameraV1;
  readonly controlRevision: number;
  readonly coreManifest: {
    readonly hash: string;
    readonly identity: QaBoundCoreManifestIdentity;
  };
  readonly qaPrewarm: QaFramePrewarmReceipt;
  readonly captures?: readonly RegressionDrawingBuffer[];
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
  readonly temporalStress?: TemporalStressEvidenceV1;
  readonly presentationFrame?: PresentationFrameEvidence;
  readonly screenshotPng?: Buffer;
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

export async function attachRegressionAcceptance(
  testInfo: TestInfo,
  page: Page,
  details: RegressionAcceptanceDetails,
): Promise<Readonly<Record<string, unknown>>> {
  const coreIdentity = readQaBoundCoreManifestIdentity(
    details.coreManifest.identity,
  );
  if (details.coreManifest.hash !== coreIdentity.manifestHash) {
    throw new Error(
      "Regression acceptance coreManifest.hash disagrees with the Core identity.",
    );
  }
  if (details.qaPrewarm.core.manifestHash !== coreIdentity.manifestHash) {
    throw new Error(
      "QA prewarm Core identity disagrees with the Regression acceptance Core hash.",
    );
  }
  assertNativeTemporalPolicy(coreIdentity.qualityProfile.temporal);
  const capabilities = readReadyCapabilities(
    details.qaPrewarm.capabilities,
    createMinimalWaterQualityProfile(coreIdentity.qualityProfile.id),
    coreIdentity.drawingBuffer,
  );
  assertQaPrewarmV11(details.qaPrewarm);
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
  assertRegressionDrawingBuffersAgree({
    browserCanvas: drawingBuffer,
    coreDrawingBuffer: coreIdentity.drawingBuffer,
    qaPrewarm: {
      width: details.qaPrewarm.width,
      height: details.qaPrewarm.height,
    },
    captures: details.captures,
  });
  const temporalStress =
    details.temporalStress === undefined
      ? undefined
      : readTemporalStressEvidence(details.temporalStress);
  const presentationFrame =
    details.presentationFrame === undefined
      ? undefined
      : readPresentationFrameEvidence(details.presentationFrame);
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
  const manifest = readRegressionAcceptanceEvidence({
    schema: REGRESSION_ACCEPTANCE_SCHEMA,
    version: REGRESSION_ACCEPTANCE_VERSION,
    evidenceClass: REGRESSION_ACCEPTANCE_EVIDENCE_CLASS,
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
    drawingBuffer: coreIdentity.drawingBuffer,
    browserCanvas: drawingBuffer,
    temporalPolicy: capabilities.rendering.temporal,
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
    seaLevelMetres: details.seaLevelMetres ?? 0,
    seed: details.seed,
    tick: details.tick,
    camera: details.camera,
    controlRevision: details.controlRevision,
    coreManifest: details.coreManifest,
    qaPrewarmManifest: details.qaPrewarm,
    qaHarness: details.qaHarness ?? null,
    qaCapture: details.qaCapture ?? null,
    artisticControls: details.artisticControls ?? null,
    waterPreset: details.waterPreset ?? null,
    environment: details.environment ?? null,
    screenshot: details.screenshot ?? null,
    presentationFrame: presentationFrame ?? null,
    temporalStress: temporalStress ?? null,
  });
  const artifacts = regressionAcceptanceArtifacts(testInfo);
  await mkdir(resolve(process.cwd(), REGRESSION_ACCEPTANCE_DIRECTORY), {
    recursive: true,
  });
  if (presentationFrame !== undefined) {
    if (details.screenshotPng === undefined) {
      throw new Error(
        "Isolated presentationFrame evidence requires the persisted PNG buffer.",
      );
    }
    const pngHash = sha256Buffer(details.screenshotPng);
    if (
      presentationFrame.pngAttachmentName !== artifacts.pngFileName ||
      presentationFrame.pngAttachmentPath !== artifacts.pngRelativePath ||
      presentationFrame.pngAttachmentSha256 !== pngHash ||
      presentationFrame.screenshotPngSha256 !== pngHash
    ) {
      throw new Error(
        "presentationFrame PNG identity must match the persisted regression-acceptance artifact.",
      );
    }
    await writeFile(artifacts.pngPath, details.screenshotPng);
    await testInfo.attach(artifacts.pngFileName, {
      path: artifacts.pngPath,
      contentType: "image/png",
    });
  }
  await writeFile(
    artifacts.jsonPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await testInfo.attach("regression-acceptance.json", {
    path: artifacts.jsonPath,
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

export function regressionAcceptanceArtifacts(testInfo: TestInfo): {
  readonly jsonFileName: string;
  readonly pngFileName: string;
  readonly jsonRelativePath: string;
  readonly pngRelativePath: string;
  readonly jsonPath: string;
  readonly pngPath: string;
} {
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
  const stem = `${unique}${title === "" ? "" : `--${title}`}`;
  const jsonFileName = `${stem}.json`;
  const pngFileName = `${stem}.png`;
  const jsonRelativePath = `${REGRESSION_ACCEPTANCE_DIRECTORY}/${jsonFileName}`;
  const pngRelativePath = `${REGRESSION_ACCEPTANCE_DIRECTORY}/${pngFileName}`;
  return {
    jsonFileName,
    pngFileName,
    jsonRelativePath,
    pngRelativePath,
    jsonPath: resolve(process.cwd(), jsonRelativePath),
    pngPath: resolve(process.cwd(), pngRelativePath),
  };
}

function chromeVersionFromUserAgent(userAgent: string): string {
  return /(?:Chrome|Chromium)\/([\d.]+)/u.exec(userAgent)?.[1] ?? userAgent;
}

function assertQaPrewarmV11(prewarm: QaFramePrewarmReceipt): void {
  if (
    prewarm.manifest.schema !== QA_FRAME_PREWARM_MANIFEST.schema ||
    prewarm.manifest.version !== QA_FRAME_PREWARM_MANIFEST.version ||
    prewarm.manifest.id !== QA_FRAME_PREWARM_MANIFEST.id
  ) {
    throw new Error("Regression acceptance requires QA prewarm v11.");
  }
  if (
    canonicalJson(prewarm.manifest.captures) !==
      canonicalJson(QA_FRAME_PREWARM_MANIFEST.captures) ||
    canonicalJson(prewarm.manifest.coreDeclarations) !==
      canonicalJson(QA_FRAME_PREWARM_MANIFEST.coreDeclarations) ||
    QA_FRAME_PREWARM_MANIFEST.captures.length !== 33
  ) {
    throw new Error(
      "Regression acceptance requires the exact QA v11 33-name capture mapping.",
    );
  }
  if (prewarm.rendererDevice === null || prewarm.rendererDevice === undefined) {
    throw new Error(
      "Regression acceptance requires the QA renderer device inventory.",
    );
  }
  if (prewarm.capabilities === undefined) {
    throw new Error(
      "Regression acceptance requires the actual ready capabilities.",
    );
  }
}
