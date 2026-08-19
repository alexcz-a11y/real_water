import { expect, test, type Page } from "@playwright/test";
import { hasCoreWebGPU } from "./core-webgpu-support.js";

test("does not expose the Memory Host outside the QA route", async ({
  page,
}) => {
  await page.goto("/?host=memory&forceWebGL=1");

  await expect(page.getByTestId("loading-diagnostics")).toContainText(
    "CORE_WEBGPU_REQUIRED",
  );
  await expect(page.getByTestId("reference-placeholder")).toHaveCount(0);
});

test("rejects a real Three r185 WebGL fallback behind the Loading Experience", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = globalThis as typeof globalThis & {
      copiedDiagnostics?: string;
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text: string) {
          state.copiedDiagnostics = text;
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto("/?host=three&forceWebGL=1");

  await expect(page.getByRole("alert")).toContainText(
    "environment is unsupported",
  );
  await expect(page.getByTestId("reference-placeholder")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  const diagnostics = page.getByTestId("loading-diagnostics");
  await expect(diagnostics).toContainText("CORE_WEBGPU_REQUIRED");
  await expect(diagnostics).toContainText("requiredBackend: core-webgpu");
  await expect(diagnostics).toContainText("selectedBackend: webgl2");

  await page.getByRole("button", { name: "Copy diagnostics" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = globalThis as typeof globalThis & {
          copiedDiagnostics?: string;
        };
        return state.copiedDiagnostics;
      }),
    )
    .toContain("CORE_WEBGPU_REQUIRED");
});

test("accepts a real Core WebGPU renderer when the browser profile provides it", async ({
  page,
}) => {
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );

  await installCanvasStartupRecorder(page);
  await page.goto("/?host=three");

  const stage = page.getByTestId("reference-stage");
  await expect(stage).toBeVisible();
  await expect(stage).toBeFocused();
  await expect(stage).toHaveAttribute("data-backend", "core-webgpu");
  await expect(stage).toHaveAttribute(
    "data-timestamp-query",
    /^(?:true|false)$/u,
  );
  await expect(page.getByTestId("loading-experience")).toHaveCount(0);
  await expect(page.getByTestId("reference-placeholder")).toHaveCount(0);

  const canvas = stage.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        height: bounds.height,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
      };
    }),
  ).toEqual({
    height: await page.evaluate(() => window.innerHeight),
    left: 0,
    top: 0,
    width: await page.evaluate(() => window.innerWidth),
  });

  const frames = await page.evaluate(() => {
    const state = globalThis as typeof globalThis & CanvasStartupRecorderState;
    return state.canvasStartupFrames;
  });
  const readyFrame = frames.find(
    (frame) => frame.loadingState === "ready" && !frame.canvasAttached,
  );
  const revealFrame = frames.find((frame) => frame.canvasAttached);
  expect(readyFrame).toBeDefined();
  expect(revealFrame).toBeDefined();
  expect(readyFrame?.frame).toBeLessThan(revealFrame?.frame ?? 0);
});

interface CanvasStartupRecorderState {
  canvasStartupFrames: Array<{
    frame: number;
    loadingState: string | null;
    canvasAttached: boolean;
  }>;
}

async function installCanvasStartupRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = globalThis as typeof globalThis & CanvasStartupRecorderState;
    state.canvasStartupFrames = [];

    let frame = 0;
    const recordFrame = (): void => {
      frame += 1;
      state.canvasStartupFrames.push({
        frame,
        loadingState:
          document.querySelector<HTMLElement>(
            '[data-testid="loading-experience"]',
          )?.dataset.state ?? null,
        canvasAttached: document.querySelector("canvas") !== null,
      });
      requestAnimationFrame(recordFrame);
    };
    requestAnimationFrame(recordFrame);
  });
}
