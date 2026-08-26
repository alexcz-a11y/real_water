import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import { ARTISTIC_CONTROL_DESCRIPTORS } from "real-water";

const require = createRequire(import.meta.url);

test("exposes event-driven accessible Artist controls without re-preparing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?qa=1&host=memory&scenario=success&delay=0");
  const stage = page.getByTestId("reference-placeholder");
  await expect(stage).toBeVisible();
  const before = await readQaSnapshot(page);

  const artist = page.getByTestId("artist-control-presenter");
  await expect(artist).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Artist controls" }),
  ).toBeVisible();
  for (const descriptor of ARTISTIC_CONTROL_DESCRIPTORS) {
    const slider = artist.getByRole("slider", { name: descriptor.label });
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAccessibleDescription(descriptor.description);
  }
  await expect(artist.getByRole("combobox")).toHaveCount(0);

  const wave = artist.getByRole("slider", { name: "Wave presence" });
  const beforeValue = Number(await wave.inputValue());
  await wave.focus();
  await page.keyboard.press("ArrowRight");
  await expect(wave).toHaveValue(String(beforeValue + 0.01));
  await expect(stage).toBeVisible();
  await expect(page.getByTestId("loading-experience")).toHaveCount(0);
  expect(await readQaSnapshot(page)).toEqual(before);

  const motion = await artist.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationName: style.animationName,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(motion.animationName).toBe("none");
  expect(parseFloat(motion.transitionDuration)).toBeLessThanOrEqual(0.001);
  await expectNoA11yViolations(page, artist);
});

test("lazy-loads Engineering, keeps heavy diagnostics opt-in, and applies structural drafts through preparation", async ({
  page,
}) => {
  await page.goto("/?qa=1&host=memory&scenario=success&delay=0");
  const stage = page.getByTestId("reference-placeholder");
  await expect(stage).toBeVisible();
  const before = await readQaSnapshot(page);
  await expect(page.getByTestId("engineering-control-presenter")).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Open Engineering controls" }).click();
  const engineering = page.getByTestId("engineering-control-presenter");
  await expect(engineering).toBeVisible();
  const heavyDiagnosticsFolder = engineering.getByRole("button", {
    name: "Heavy diagnostics · explicit opt-in",
  });
  await expect(heavyDiagnosticsFolder).toBeVisible();
  await heavyDiagnosticsFolder.click();
  await expect(engineering.getByText("Enable readbacks")).toBeVisible();
  const heavyToggle = engineering
    .locator(".tp-lblv")
    .filter({ hasText: "Enable readbacks" })
    .locator('input[type="checkbox"]');
  await expect(heavyToggle).not.toBeChecked();

  await engineering
    .getByRole("button", { name: "Structural quality · reload required" })
    .click();
  const qualityBlade = engineering
    .locator(".tp-lblv")
    .filter({ hasText: "Quality Profile" });
  await qualityBlade.locator("select").selectOption("minimal-high-detail");
  await expect(engineering.getByText(/Reload required/u)).toBeVisible();
  expect(await readQaSnapshot(page)).toEqual(before);
  await expect(stage).toBeVisible();

  await engineering.getByRole("button", { name: "Apply and reload" }).click();
  await expect(page.getByTestId("loading-experience")).toBeVisible();
  await expect(stage).toBeVisible();
  await expect(stage).toHaveAttribute(
    "data-quality-profile",
    "minimal-high-detail",
  );
  const after = await readQaSnapshot(page);
  expect(after.generation).toBe(before.generation + 1);
  expect(after.manifestHash).not.toBe(before.manifestHash);
});

async function expectNoA11yViolations(
  page: Page,
  scope: ReturnType<Page["locator"]>,
): Promise<void> {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const selector = await scope.evaluate((element) => {
    element.id ||= "control-presenter-a11y-scope";
    return `#${element.id}`;
  });
  const violations = await page.evaluate(async (rootSelector) => {
    const axeGlobal = globalThis as typeof globalThis & {
      axe: {
        run(context: string): Promise<{ violations: unknown[] }>;
      };
    };
    return (await axeGlobal.axe.run(rootSelector)).violations;
  }, selector);
  expect(violations).toEqual([]);
}

interface QaSnapshot {
  readonly generation: number;
  readonly manifestHash: string;
  readonly state: "loading" | "ready" | "failed" | "disposed";
}

async function readQaSnapshot(page: Page): Promise<QaSnapshot> {
  return page.evaluate(() => {
    const qa = window.__REAL_WATER_QA__;
    if (qa === undefined) {
      throw new Error("QA session is unavailable.");
    }
    return qa.snapshot();
  });
}
