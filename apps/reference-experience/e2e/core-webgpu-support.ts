import type { Page } from "@playwright/test";

// Loads the one declaration of `Window.__REAL_WATER_QA__`, which lives beside
// the code that assigns it (`../src/main.ts`). Type-only on purpose: a bare
// side-effect import survives `verbatimModuleSyntax` and would run the browser
// bootstrap inside Playwright's Node runner. Every spec that talks to the QA
// Harness imports this helper, so loading it once here is what puts the global
// in scope for all of them - there is deliberately no second copy of the shape.
import type {} from "../src/main.js";

export function hasCoreWebGPU(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
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
}
