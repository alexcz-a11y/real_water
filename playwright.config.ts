import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 5_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
  ],
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 2 : 0,
  testDir: "./apps/reference-experience/e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "vite preview apps/reference-experience --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
