import { expect, test } from "@playwright/test";

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
  const coreWebGPUAvailable = await page.evaluate(async () => {
    const gpu = (
      navigator as Navigator & {
        gpu?: {
          requestAdapter(): Promise<{
            features: { has(name: string): boolean };
          } | null>;
        };
      }
    ).gpu;
    const adapter = await gpu?.requestAdapter();
    return adapter?.features.has("core-features-and-limits") === true;
  });
  test.skip(
    !coreWebGPUAvailable,
    "Core WebGPU is unavailable in this browser profile.",
  );

  await page.goto("/?host=three");

  const placeholder = page.getByTestId("reference-placeholder");
  await expect(placeholder).toBeVisible();
  await expect(placeholder).toHaveAttribute("data-backend", "core-webgpu");
  await expect(placeholder).toHaveAttribute(
    "data-timestamp-query",
    /^(?:true|false)$/u,
  );
  await expect(page.getByTestId("loading-experience")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
});
