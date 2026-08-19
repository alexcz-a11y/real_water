import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const productionRoot = resolve("apps/reference-experience/dist");
const forbiddenMarkers = [
  "__REAL_WATER_QA__",
  "real-water/qa-harness",
  "real-water/qa-capture",
  "real-water/qa-frame-prewarm",
];
const failures = [];

for (const path of await outputFiles(productionRoot)) {
  const contents = await readFile(path, "utf8");
  for (const marker of forbiddenMarkers) {
    if (contents.includes(marker)) {
      failures.push(`${path}: contains test-only marker ${marker}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}

console.log("Reference production check passed: QA Harness code is absent.");

async function outputFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return outputFiles(path);
      }
      return entry.isFile() && /\.(?:css|html|js)$/u.test(entry.name)
        ? [path]
        : [];
    }),
  );
  return files.flat();
}
