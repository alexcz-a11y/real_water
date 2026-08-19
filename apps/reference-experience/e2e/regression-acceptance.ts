import { mkdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { join, resolve } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import type { QaCameraV1 } from "../src/qa-harness.js";

export const REGRESSION_ACCEPTANCE_DIRECTORY = join(
  "test-results",
  "regression-acceptance",
);

export async function attachRegressionAcceptance(
  testInfo: TestInfo,
  page: Page,
  details: {
    readonly seed: number;
    readonly tick: number;
    readonly camera: QaCameraV1;
    readonly qaPrewarm: {
      readonly schema: string;
      readonly version: number;
      readonly id: string;
      readonly hash?: string;
    };
  },
): Promise<void> {
  const [userAgent, hardwareConcurrency, drawingBuffer] = await Promise.all([
    page.evaluate(() => navigator.userAgent),
    page.evaluate(() => navigator.hardwareConcurrency),
    page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      return canvas === null
        ? { width: 0, height: 0 }
        : { width: canvas.width, height: canvas.height };
    }),
  ]);
  const manifest = {
    evidenceClass: "Regression acceptance",
    chromeVersion: chromeVersionFromUserAgent(userAgent),
    userAgent,
    os: process.platform,
    arch: process.arch,
    hardwareConcurrency: hardwareConcurrency || cpus().length,
    headed: testInfo.project.use.headless === false,
    devicePixelRatio: testInfo.project.use.deviceScaleFactor ?? 1,
    drawingBuffer,
    powerState: "uncontrolled",
    seed: details.seed,
    tick: details.tick,
    camera: details.camera,
    qaPrewarmManifest: details.qaPrewarm,
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

function chromeVersionFromUserAgent(userAgent: string): string {
  return /(?:Chrome|Chromium)\/([\d.]+)/u.exec(userAgent)?.[1] ?? userAgent;
}
