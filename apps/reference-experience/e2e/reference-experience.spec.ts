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
    /Preparation has not started|Completed [0-7] of 8/,
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
      announcement.startsWith("Completed 0 of 8"),
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
      const match = /^Completed ([0-9]+) of 8/u.exec(announcement);
      return match?.[1] === undefined ? [] : [Number(match[1])];
    });
  expect(retryProgress).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
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

test("applies a changed Quality Profile through a complete hidden preparation", async ({
  page,
}) => {
  await installStartupRecorder(page);
  await page.goto("/?qa=1&host=memory&scenario=success&delay=25");

  const placeholder = page.getByTestId("reference-placeholder");
  await expect(placeholder).toBeVisible();
  const before = await readQaSnapshot(page);

  const transitionStart = await page.evaluate(() => {
    const qa = window.__REAL_WATER_QA__ as
      (typeof window.__REAL_WATER_QA__ & QaSession) | undefined;
    if (qa === undefined) {
      throw new Error("QA session is unavailable.");
    }
    void qa.applySecondQualityProfile();
    const recorder = globalThis as typeof globalThis & StartupRecorderState;
    return {
      frame: recorder.startupFrames.at(-1)?.frame ?? 0,
      loadingVisible:
        document.querySelector('[data-testid="loading-experience"]') !== null,
      stageVisible:
        document.querySelector('[data-testid="reference-placeholder"]') !==
        null,
    };
  });

  expect(transitionStart.loadingVisible).toBe(true);
  expect(transitionStart.stageVisible).toBe(false);
  await expect(page.getByTestId("loading-experience")).toBeVisible();
  await expect(placeholder).toBeVisible();

  const after = await readQaSnapshot(page);
  expect(after.generation).toBe(before.generation + 1);
  expect(after.manifestHash).not.toBe(before.manifestHash);

  const evidence = await page.evaluate((startFrame) => {
    const state = globalThis as typeof globalThis & StartupRecorderState;
    return {
      announcements: state.loadingAnnouncements,
      frames: state.startupFrames.filter((frame) => frame.frame > startFrame),
    };
  }, transitionStart.frame);
  const retryStart = evidence.announcements.lastIndexOf(
    "Loading Experience visible. Preparation has not started.",
  );
  const progress = evidence.announcements
    .slice(retryStart + 1)
    .flatMap((announcement) => {
      const match = /^Completed ([0-9]+) of ([0-9]+)/u.exec(announcement);
      return match === null
        ? []
        : [{ completed: Number(match[1]), total: Number(match[2]) }];
    });
  const total = progress.at(-1)?.total;
  expect(total).toBeGreaterThan(0);
  expect(progress.map(({ completed }) => completed)).toEqual(
    Array.from({ length: (total ?? 0) + 1 }, (_, index) => index),
  );
  const readyFrame = evidence.frames.find(
    (frame) => frame.loadingState === "ready" && !frame.placeholderVisible,
  );
  const revealFrame = evidence.frames.find((frame) => frame.placeholderVisible);
  expect(readyFrame).toBeDefined();
  expect(revealFrame).toBeDefined();
  expect(readyFrame?.frame).toBeLessThan(revealFrame?.frame ?? 0);
});

test("reprepares after long suspension without spending device recovery", async ({
  page,
}) => {
  await page.goto("/?qa=1&host=memory&scenario=success&delay=25");

  const placeholder = page.getByTestId("reference-placeholder");
  await expect(placeholder).toBeVisible();
  const before = await readQaSnapshot(page);

  const concealedSynchronously = await page.evaluate(() => {
    const qa = window.__REAL_WATER_QA__;
    if (qa === undefined) {
      throw new Error("QA session is unavailable.");
    }
    void qa.signalLongSuspension();
    return (
      document.querySelector('[data-testid="loading-experience"]') !== null &&
      document.querySelector('[data-testid="reference-placeholder"]') === null
    );
  });

  expect(concealedSynchronously).toBe(true);
  await expect(page.getByTestId("loading-experience")).toBeVisible();
  await expect(placeholder).toBeVisible();
  const after = await readQaSnapshot(page);
  expect(after.generation).toBe(before.generation + 1);
  expect(after.manifestHash).toBe(before.manifestHash);

  await synthesizeDeviceLoss(page);
  await expect
    .poll(() => readQaSnapshot(page))
    .toMatchObject({ generation: before.generation + 2, state: "ready" });
  await expect(placeholder).toBeVisible();
});

test("reprepares on bfcache resume and disposes on ordinary pagehide", async ({
  page,
}) => {
  await page.goto("/?qa=1&host=memory&scenario=success&delay=20");
  await expect(page.getByTestId("reference-placeholder")).toBeVisible();
  const before = await readQaSnapshot(page);

  const lifecycleResult = await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
    const stageRemainedDuringSuspension =
      document.querySelector('[data-testid="reference-placeholder"]') !== null;
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    return {
      loadingVisibleOnResume:
        document.querySelector('[data-testid="loading-experience"]') !== null,
      stageRemainedDuringSuspension,
    };
  });

  expect(lifecycleResult).toEqual({
    loadingVisibleOnResume: true,
    stageRemainedDuringSuspension: true,
  });
  await expect
    .poll(() => readQaSnapshot(page))
    .toMatchObject({ generation: before.generation + 1, state: "ready" });
  const after = await readQaSnapshot(page);
  expect(after.manifestHash).toBe(before.manifestHash);

  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: false }),
    );
  });
  await expect
    .poll(() => readQaSnapshot(page))
    .toMatchObject({ state: "disposed" });
  await expect(page.locator("#app")).toBeEmpty();
});

test("automatically rebuilds once with a fresh host after device loss", async ({
  page,
}) => {
  await page.goto("/?qa=1&host=memory&scenario=success&delay=25");

  await expect(page.getByTestId("reference-placeholder")).toBeVisible();
  const before = await readQaSnapshot(page);
  await page.evaluate(() => {
    const qa = window.__REAL_WATER_QA__;
    if (qa === undefined) {
      throw new Error("QA session is unavailable.");
    }
    qa.synthesizeDeviceLoss();
  });

  await expect(page.getByTestId("loading-experience")).toBeVisible();
  await expect
    .poll(() => readQaSnapshot(page))
    .toMatchObject({ generation: before.generation + 1, state: "ready" });
  await expect(page.getByTestId("reference-placeholder")).toBeVisible();
  const after = await readQaSnapshot(page);
  expect(after.manifestHash).toBe(before.manifestHash);
});

test("automatically rebuilds when the first host loses its device during preparation", async ({
  page,
}) => {
  await installStartupRecorder(page);
  await page.goto("/?qa=1&host=memory&scenario=first-device-loss&delay=25");

  await expect(page.getByTestId("loading-experience")).toBeVisible();
  await expect(page.getByTestId("reference-placeholder")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() => readQaSnapshot(page))
    .toMatchObject({ generation: 2, state: "ready" });

  const loadingStarts = await page.evaluate(() => {
    const state = globalThis as typeof globalThis & StartupRecorderState;
    return state.loadingAnnouncements.filter(
      (announcement) =>
        announcement ===
        "Loading Experience visible. Preparation has not started.",
    ).length;
  });
  expect(loadingStarts).toBe(2);
});

test("keeps a second device loss terminal without resetting recovery on Retry", async ({
  page,
}) => {
  await page.goto("/?qa=1&host=memory&scenario=success&delay=20");
  await expect(page.getByTestId("reference-placeholder")).toBeVisible();

  await synthesizeDeviceLoss(page);
  await expect
    .poll(() => readQaSnapshot(page))
    .toMatchObject({ generation: 2, state: "ready" });
  await expect(page.getByTestId("reference-placeholder")).toBeVisible();

  await synthesizeDeviceLoss(page);
  await expect(page.getByRole("alert")).toContainText("Preparation failed");
  await expect(page.getByTestId("loading-diagnostics")).toContainText(
    "WEBGPU_DEVICE_LOST",
  );
  await expect(page.getByTestId("reference-placeholder")).toHaveCount(0);
  await expectNoA11yViolations(page);
  await expect
    .poll(() => readQaSnapshot(page))
    .toMatchObject({ generation: 2, state: "failed" });

  await page.getByRole("button", { name: "Retry from the beginning" }).click();
  await expect
    .poll(() => readQaSnapshot(page))
    .toMatchObject({ generation: 3, state: "ready" });
  await expect(page.getByTestId("reference-placeholder")).toBeVisible();

  await synthesizeDeviceLoss(page);
  await expect(page.getByRole("alert")).toContainText("Preparation failed");
  await expect
    .poll(() => readQaSnapshot(page))
    .toMatchObject({ generation: 3, state: "failed" });
  await expect(page.getByTestId("reference-placeholder")).toHaveCount(0);
});

test("serializes racing transitions and disposes every attempt idempotently", async ({
  page,
}) => {
  await page.goto("/?qa=1&host=memory&scenario=success&delay=80");
  await expect(page.getByTestId("reference-placeholder")).toBeVisible();

  const result = await page.evaluate(async () => {
    const qa = window.__REAL_WATER_QA__;
    if (qa === undefined) {
      throw new Error("QA session is unavailable.");
    }
    qa.synthesizeDeviceLoss();
    const profileTransition = qa.applySecondQualityProfile();
    const suspensionTransition = qa.signalLongSuspension();
    const firstDisposal = qa.dispose();
    const secondDisposal = qa.dispose();
    const samePromise = firstDisposal === secondDisposal;
    await firstDisposal;
    await Promise.allSettled([profileTransition, suspensionTransition]);
    return { samePromise, snapshot: qa.snapshot() };
  });

  expect(result.samePromise).toBe(true);
  expect(result.snapshot.state).toBe("disposed");
  await expect(page.locator("#app")).toBeEmpty();
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

interface QaSnapshot {
  readonly generation: number;
  readonly manifestHash: string | null;
  readonly state: "loading" | "ready" | "failed" | "disposed";
}

interface QaSession {
  applySecondQualityProfile(): Promise<void>;
  signalLongSuspension(): Promise<void>;
  snapshot(): QaSnapshot;
}

async function readQaSnapshot(page: Page): Promise<QaSnapshot> {
  return page.evaluate(() => {
    const qa = window.__REAL_WATER_QA__ as
      (typeof window.__REAL_WATER_QA__ & QaSession) | undefined;
    if (qa === undefined) {
      throw new Error("QA session is unavailable.");
    }
    return qa.snapshot();
  });
}

async function synthesizeDeviceLoss(page: Page): Promise<void> {
  await page.evaluate(() => {
    const qa = window.__REAL_WATER_QA__;
    if (qa === undefined) {
      throw new Error("QA session is unavailable.");
    }
    qa.synthesizeDeviceLoss();
  });
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
