import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

test("shows an accessible Loading Experience before an atomic ready reveal", async ({
  page,
}) => {
  await installStartupRecorder(page);
  await page.goto("/?qa=1&host=memory&scenario=success&delay=140");

  const loading = page.getByTestId("loading-experience");
  await expect(loading).toBeVisible();
  await expect(page.getByTestId("reference-placeholder")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Preparing the Open Water Domain",
    }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    /Preparation has not started|Completed 0 of 3/,
  );
  await expect(page.getByRole("progressbar")).toHaveAccessibleName(
    "Preparation progress",
  );
  const announcements = await page.evaluate(() => {
    const state = globalThis as typeof globalThis & StartupRecorderState;
    return state.loadingAnnouncements;
  });
  expect(announcements[0]).toBe(
    "Loading Experience visible. Preparation has not started.",
  );
  expect(
    announcements.findIndex((announcement) =>
      announcement.startsWith("Completed 0 of 3"),
    ),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Cancel preparation" }).focus();
  await expectNoA11yViolations(page);

  const placeholder = page.getByTestId("reference-placeholder");
  await expect(placeholder).toBeVisible();
  await expect(placeholder).toBeFocused();
  await expect(loading).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Reference Experience placeholder" }),
  ).toBeVisible();

  const frames = await page.evaluate(() => {
    const state = globalThis as typeof globalThis & StartupRecorderState;
    return state.startupFrames;
  });
  const readyFrame = frames.find(
    (frame) => frame.loadingState === "ready" && !frame.placeholderVisible,
  );
  const revealFrame = frames.find((frame) => frame.placeholderVisible);
  const loadingFrameIndex = frames.findIndex(
    (frame) => frame.loadingState === "loading",
  );
  const preparingFrameIndex = frames.findIndex(
    (frame) => frame.loadingState === "preparing",
  );
  expect(loadingFrameIndex).toBeGreaterThanOrEqual(0);
  const loadingFramesBeforePreparation = frames
    .slice(0, preparingFrameIndex)
    .filter((frame) => frame.loadingState === "loading");
  expect(loadingFramesBeforePreparation.length).toBeGreaterThanOrEqual(2);
  expect(preparingFrameIndex).toBeGreaterThan(loadingFrameIndex + 1);
  expect(readyFrame).toBeDefined();
  expect(revealFrame).toBeDefined();
  expect(readyFrame?.frame).toBeLessThan(revealFrame?.frame ?? 0);
});

test("keeps unsupported and failure paths behind the Loading Experience", async ({
  page,
}) => {
  await page.goto("/?qa=1&host=memory&scenario=unsupported&delay=0");
  await expect(page.getByRole("alert")).toContainText(
    "environment is unsupported",
  );
  await expect(page.getByTestId("reference-placeholder")).toHaveCount(0);
  await expect(page.getByTestId("loading-diagnostics")).toContainText(
    "UNSUPPORTED_ENVIRONMENT",
  );

  await page.goto("/?qa=1&host=memory&scenario=failure&delay=0");
  await expect(page.getByRole("alert")).toContainText("Preparation failed");
  await expect(page.getByTestId("loading-progress")).toHaveAttribute(
    "value",
    "1",
  );
  await expect(page.getByTestId("reference-placeholder")).toHaveCount(0);
  await expect(page.getByTestId("loading-diagnostics")).toContainText(
    "PREWARM_FAILED",
  );
});

test("supports keyboard cancellation and a complete retry", async ({
  page,
}) => {
  await installStartupRecorder(page);
  await page.goto("/?qa=1&host=memory&scenario=success&delay=180");

  const cancel = page.getByRole("button", { name: "Cancel preparation" });
  await cancel.focus();
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("alert")).toContainText("Preparation cancelled");
  await expect(page.getByTestId("reference-placeholder")).toHaveCount(0);

  const retry = page.getByRole("button", {
    name: "Retry from the beginning",
  });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("reference-placeholder")).toBeVisible();

  const announcements = await page.evaluate(() => {
    const state = globalThis as typeof globalThis & StartupRecorderState;
    return state.loadingAnnouncements;
  });
  const retryStart = announcements.lastIndexOf(
    "Loading Experience visible. Preparation has not started.",
  );
  const retryProgress = announcements
    .slice(retryStart + 1)
    .flatMap((announcement) => {
      const match = /^Completed ([0-9]+) of 3/u.exec(announcement);
      return match?.[1] === undefined ? [] : [Number(match[1])];
    });
  expect(retryProgress).toEqual([0, 1, 2, 3]);
});

test("removes nonessential motion for reduced-motion users", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?qa=1&host=memory&scenario=success&delay=200");

  await expect(page.getByTestId("loading-experience")).toBeVisible();
  const animationName = await page
    .locator(".loading-indicator")
    .evaluate((element) => getComputedStyle(element).animationName);

  expect(animationName).toBe("none");
});

test("disposes idempotently while a ready lease awaits reveal", async ({
  page,
}) => {
  await page.goto(
    "/?host=memory&qa=1&scenario=success&delay=0&revealFrames=120",
  );
  await expect(page.getByRole("status")).toContainText(
    "Readiness Gate complete",
  );

  const samePromise = await page.evaluate(async () => {
    const qa = window.__REAL_WATER_QA__;
    if (qa === undefined) {
      throw new Error("QA session is unavailable.");
    }
    const first = qa.dispose();
    const second = qa.dispose();
    const same = first === second;
    await first;
    return same;
  });

  expect(samePromise).toBe(true);
  await expect(page.getByTestId("reference-placeholder")).toHaveCount(0);
  await expect(page.getByTestId("loading-experience")).toHaveCount(0);
});

async function expectNoA11yViolations(page: Page): Promise<void> {
  await page.addScriptTag({
    path: require.resolve("axe-core/axe.min.js"),
  });
  const violations = await page.evaluate(async () => {
    const axeGlobal = globalThis as typeof globalThis & {
      axe: {
        run(): Promise<{ violations: unknown[] }>;
      };
    };
    const result = await axeGlobal.axe.run();
    return result.violations;
  });

  expect(violations).toEqual([]);
}

interface StartupRecorderState {
  loadingAnnouncements: string[];
  startupFrames: Array<{
    frame: number;
    loadingState: string | null;
    placeholderVisible: boolean;
  }>;
}

async function installStartupRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = globalThis as typeof globalThis & StartupRecorderState;
    state.loadingAnnouncements = [];
    state.startupFrames = [];

    new MutationObserver(() => {
      const announcement = document.querySelector(
        '[data-testid="loading-status"]',
      )?.textContent;
      const previous = state.loadingAnnouncements.at(-1);
      if (
        announcement !== undefined &&
        announcement.length > 0 &&
        announcement !== previous
      ) {
        state.loadingAnnouncements.push(announcement);
      }
    }).observe(document, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    let frame = 0;
    const recordFrame = (): void => {
      frame += 1;
      state.startupFrames.push({
        frame,
        loadingState:
          document.querySelector<HTMLElement>(
            '[data-testid="loading-experience"]',
          )?.dataset.state ?? null,
        placeholderVisible:
          document.querySelector('[data-testid="reference-placeholder"]') !==
          null,
      });
      requestAnimationFrame(recordFrame);
    };
    requestAnimationFrame(recordFrame);
  });
}
