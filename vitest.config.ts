import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
    },
    include: [
      "packages/*/test/**/*.test.ts",
      "apps/reference-experience/src/**/*.test.ts",
      "apps/reference-experience/test/**/*.test.ts",
    ],
    pool: "forks",
  },
});
