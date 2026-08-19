import type { Page } from "@playwright/test";

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
