import { arch, cpus, platform } from "node:os";
import { defineConfig } from "@playwright/test";
import {
  powerProjectToken,
  readHostPowerProfile,
} from "./apps/reference-experience/e2e/host-power-profile.js";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

const cpuModel = cpus()[0]?.model ?? "unknown-cpu";

export const PLAYWRIGHT_PROJECT_ID = [
  platform(),
  arch(),
  slugify(cpuModel),
  "chrome",
  "headless",
  powerProjectToken(readHostPowerProfile()),
].join("-");

export default defineConfig({
  expect: {
    timeout: 5_000,
  },
  forbidOnly: Boolean(process.env.CI),
  // Every spec in this suite drives the one WebGPU device this machine has, so
  // parallel workers do not run in parallel -- they queue inside the driver and
  // perturb each other's timing and GPU state. That made acceptance results
  // depend on scheduling: two full runs of the same tree failed on different,
  // non-overlapping sets. A suite that reports a different answer each time is
  // worse than a slow one, so the device constraint is written down here rather
  // than rediscovered per ticket.
  workers: 1,
  fullyParallel: false,
  snapshotPathTemplate:
    "{testDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}",
  projects: [
    {
      name: PLAYWRIGHT_PROJECT_ID,
      use: {
        browserName: "chromium",
        channel: "chrome",
        headless: true,
        deviceScaleFactor: 1,
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 2 : 0,
  testDir: "./apps/reference-experience/e2e",
  testMatch: "**/*.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "vite build apps/reference-experience --mode test --outDir ../../test-results/qa-build --emptyOutDir && vite preview apps/reference-experience --outDir ../../test-results/qa-build --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
