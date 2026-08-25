import { expect, test } from "@playwright/test";
import { SHOWCASE_PRESET_VERSION } from "real-water";
import type { QaHarness } from "../src/qa-harness.js";
import { hasCoreWebGPU } from "./core-webgpu-support.js";

test("switches Director and Sandbox controls without replacing the ready runtime", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 450 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );

  await page.goto("/");
  const stage = page.getByTestId("reference-stage");
  await expect(stage).toBeVisible();
  const manifestHash = await stage.getAttribute("data-manifest-hash");
  await stage.evaluate((element) => {
    element.setAttribute("data-t25-stage-identity", "retained");
  });

  const modePresenter = page.getByTestId("reference-experience-mode-presenter");
  await expect(modePresenter).toHaveAttribute("data-mode", "director");
  await expect(page.getByTestId("reference-experience-active-look")).toHaveText(
    "Calm Sunrise",
  );
  await expect(
    page.getByTestId("reference-experience-mode-director"),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("reference-experience-mode-sandbox").click();
  await expect(modePresenter).toHaveAttribute("data-mode", "sandbox");
  await expect(stage).toHaveAttribute("data-sandbox-controls", "enabled");
  await expect(stage).toHaveAttribute("data-t25-stage-identity", "retained");
  await expect(stage).toHaveAttribute("data-manifest-hash", manifestHash ?? "");
  await expect(page.getByTestId("loading-experience")).toHaveCount(0);

  const look = page.getByTestId("reference-experience-sandbox-look");
  await look.selectOption("blue-noon-swell");
  await expect(page.getByTestId("reference-experience-active-look")).toHaveText(
    "Blue Noon Swell",
  );
  await expect(page.getByTestId("artist-output-waveStrength")).toHaveText("1");
  await expect(stage).toHaveAttribute("data-manifest-hash", manifestHash ?? "");
  await expect(page.getByTestId("loading-experience")).toHaveCount(0);

  const pause = page.getByTestId("reference-experience-sandbox-pause");
  await pause.click();
  await expect(modePresenter).toHaveAttribute("data-paused", "true");
  await expect(pause).toHaveText("Resume");
  await page.getByTestId("reference-experience-sandbox-reset").click();
  await expect(modePresenter).toHaveAttribute("data-paused", "false");
  await expect(pause).toHaveText("Pause");

  await page.getByTestId("reference-experience-mode-director").click();
  await expect(modePresenter).toHaveAttribute("data-mode", "director");
  await expect(stage).toHaveAttribute("data-sandbox-controls", "disabled");
  await expect(page.getByTestId("reference-experience-active-look")).toHaveText(
    "Calm Sunrise",
  );
  await expect(stage).toHaveAttribute("data-t25-stage-identity", "retained");
  await expect(stage).toHaveAttribute("data-manifest-hash", manifestHash ?? "");
});

test("keeps the selected Sandbox look coherent through structural reload", async ({
  page,
}) => {
  // Two complete readiness runs are lifecycle regression evidence, not a
  // Reference Experience performance or timeout claim.
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 800, height: 450 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/");
  const stage = page.getByTestId("reference-stage");
  await expect(stage).toBeVisible();
  const initialManifestHash = await stage.getAttribute("data-manifest-hash");

  await page.getByTestId("reference-experience-mode-sandbox").click();
  await page
    .getByTestId("reference-experience-sandbox-look")
    .selectOption("blue-noon-swell");
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __T25_SAW_LOADING__?: boolean;
    };
    state.__T25_SAW_LOADING__ = false;
    const root = document.querySelector("#app");
    if (root === null) {
      throw new Error("The Reference Experience mount is unavailable.");
    }
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="loading-experience"]')) {
        state.__T25_SAW_LOADING__ = true;
      }
    }).observe(root, { childList: true, subtree: true });
  });

  await page.getByRole("button", { name: "Open Engineering controls" }).click();
  const engineering = page.getByTestId("engineering-control-presenter");
  await engineering
    .getByRole("button", { name: "Structural quality · reload required" })
    .click();
  await engineering
    .locator(".tp-lblv")
    .filter({ hasText: "Quality Profile" })
    .locator("select")
    .selectOption("minimal-high-detail");
  await engineering.getByRole("button", { name: "Apply and reload" }).click();

  await expect(stage).toHaveAttribute(
    "data-quality-profile",
    "minimal-high-detail",
    { timeout: 30_000 },
  );
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as typeof globalThis & {
            __T25_SAW_LOADING__?: boolean;
          }
        ).__T25_SAW_LOADING__,
    ),
  ).toBe(true);
  expect(await stage.getAttribute("data-manifest-hash")).not.toBe(
    initialManifestHash,
  );
  await expect(
    page.getByTestId("reference-experience-mode-presenter"),
  ).toHaveAttribute("data-mode", "sandbox");
  await expect(stage).toHaveAttribute("data-sandbox-controls", "enabled");
  await expect(page.getByTestId("reference-experience-active-look")).toHaveText(
    "Blue Noon Swell",
  );
  await expect(
    page.getByTestId("reference-experience-sandbox-look"),
  ).toHaveValue("blue-noon-swell");
  await expect(page.getByTestId("artist-output-waveStrength")).toHaveText("1");
});

test("replays the exact Showcase recipe through deterministic QA mode", async ({
  page,
}) => {
  // The complete 3,600-tick body route is regression acceptance work, not a
  // Reference Experience performance or timeout claim.
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 160, height: 90 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );

  await page.goto("/?qa=1&host=three&mode=qa");
  await expect(page.getByTestId("reference-stage")).toBeVisible();
  const result = await page.evaluate(async () => {
    const harness = window.__REAL_WATER_QA__ as QaHarness | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    return {
      storm: {
        receipt: await harness.replayShowcase({ capturePoint: "storm-front" }),
      },
    };
  });

  expect(result.storm.receipt).toMatchObject({
    seed: 0x5eed_0025,
    tick: 3_600,
    showcase: {
      schema: "real-water/showcase-preset",
      version: SHOWCASE_PRESET_VERSION,
      id: "reference-loop",
    },
    capturePoint: {
      id: "storm-front",
      tick: 3_600,
      captureNames: [
        "final-color",
        "hero-breaker-foam",
        "storm-rain-ripples",
        "storm-aerosol",
        "storm-cloud-shadow",
        "storm-lightning",
      ],
    },
    look: {
      id: "storm-front",
      waterPreset: { id: "storm" },
      environmentPreset: { id: "storm-front" },
    },
    camera: {
      position: [-18, 5, 24],
      target: [0, 0, 0],
      verticalFovDegrees: 58,
    },
    body: {
      controls: { throttle: 0.9, steering: -0.22 },
      fixedStepCount: 3_600,
    },
    environment: {
      weather: { rainIntensity: 0.9 },
      atmosphere: {
        cloudCoverage: 0.9,
        stormAerosolIntensity: 0.8,
        lightningIntensity: 0,
      },
    },
    events: [
      { id: "showcase-start", tick: 0 },
      { id: "hero-breaker", tick: 1_800 },
      { id: "weather-front", tick: 3_600 },
      { id: "storm-front-hero-breaker", tick: 3_600 },
    ],
  });
});

test("repeats the same Showcase frame bytes and authored state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 160, height: 90 });
  await page.goto("/?qa=1&host=memory&delay=0");
  test.skip(
    !(await hasCoreWebGPU(page)),
    "Core WebGPU is unavailable in this browser profile.",
  );
  await page.goto("/?qa=1&host=three&mode=qa");
  await expect(page.getByTestId("reference-stage")).toBeVisible();

  const result = await page.evaluate(async () => {
    const harness = window.__REAL_WATER_QA__ as QaHarness | undefined;
    if (harness === undefined) {
      throw new Error("QA Harness is unavailable.");
    }
    const replay = async () => {
      const receipt = await harness.replayShowcase({
        capturePoint: "calm-stability",
      });
      const finalColor = await harness.capture("final-color");
      return { receipt, finalColor: finalColor.data };
    };
    return { first: await replay(), repeated: await replay() };
  });

  expect(result.first.receipt).toMatchObject({
    seed: 0x5eed_0025,
    tick: 120,
    capturePoint: {
      id: "calm-stability",
      tick: 120,
      captureNames: ["final-color"],
    },
    look: { id: "calm-sunrise" },
    camera: { position: [12, 7, 18], target: [0, 1, 0] },
    body: {
      controls: { throttle: 0.45, steering: 0 },
      fixedStepCount: 120,
    },
    environment: { weather: { windStrength: 0.18, rainIntensity: 0 } },
    events: [{ id: "showcase-start", tick: 0 }],
  });
  expect(result.repeated.receipt.showcase).toEqual(
    result.first.receipt.showcase,
  );
  expect(result.repeated.receipt.look).toEqual(result.first.receipt.look);
  expect(result.repeated.receipt.camera).toEqual(result.first.receipt.camera);
  expect(result.repeated.receipt.body).toEqual(result.first.receipt.body);
  expect(result.repeated.receipt.environment).toEqual(
    result.first.receipt.environment,
  );
  expect(result.repeated.receipt.events).toEqual(result.first.receipt.events);
  expect(result.repeated.receipt.presentation.manifestHash).toBe(
    result.first.receipt.presentation.manifestHash,
  );
  expect(result.repeated.receipt.presentation.compileCount).toBe(
    result.first.receipt.presentation.compileCount,
  );
  expect(result.repeated.receipt.presentation.probeCount).toBe(
    result.first.receipt.presentation.probeCount,
  );
  expect(result.repeated.finalColor).toBe(result.first.finalColor);
});
