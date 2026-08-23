import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-types/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/*.api.md",
      ".firecrawl/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-confusing-void-expression": "off",
    },
  },
  {
    // A version bump renames the types and updates the constants, but a bare
    // number in an assertion is invisible to that rename: the QA Harness bump
    // from 9 to 10 left five of them behind, and every one of them failed a
    // test that had been passing. Assertions here go through the exported
    // constant so the next bump carries them automatically. The single pinned
    // literal, in the QA Harness contract test, disables this rule on its own
    // line and says why.
    files: ["apps/reference-experience/e2e/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name=/[Vv]ersion$/] > Literal[value>=0]",
          message:
            "Compare QA versions against the exported constant, not a bare number.",
        },
        {
          selector:
            "BinaryExpression[left.name=/[Vv]ersion$/] > Literal[value>=0]",
          message:
            "Compare QA versions against the exported constant, not a bare number.",
        },
        {
          selector:
            "BinaryExpression[left.property.name=/[Vv]ersion$/] > Literal[value>=0]",
          message:
            "Compare QA versions against the exported constant, not a bare number.",
        },
      ],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
);
