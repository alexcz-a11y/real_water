import { Buffer } from "node:buffer";
import { cpus } from "node:os";
import type { Page, TestInfo } from "@playwright/test";
import type { QaCameraV1 } from "../src/qa-harness.js";

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
  await testInfo.attach("regression-acceptance.json", {
    body: Buffer.from(
      JSON.stringify(
        {
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
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
}

function chromeVersionFromUserAgent(userAgent: string): string {
  return /(?:Chrome|Chromium)\/([\d.]+)/u.exec(userAgent)?.[1] ?? userAgent;
}
