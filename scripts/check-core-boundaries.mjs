import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve("packages/real-water");
const sourceRoot = resolve(root, "src");
const forbiddenModules =
  "(?:react|react-dom|vue|svelte|@react-three/fiber|rapier|@dimforge/rapier|@dimforge/rapier(?:2d|3d)(?:-compat)?|cannon|cannon-es|ammo(?:\\.js)?|node:fs|node:fs/promises|fs|fs/promises|node:http|node:https|node:net|node:dgram|node:dns)";
const bannedSource = [
  [/\bfetch\s*\(/u, "network fetch"],
  [/\bXMLHttpRequest\b/u, "XMLHttpRequest"],
  [/\bWebSocket\s*\(/u, "WebSocket"],
  [/\bEventSource\s*\(/u, "EventSource"],
  [/\bnavigator\s*\.\s*sendBeacon\s*\(/u, "analytics beacon"],
  [/\blocalStorage\b/u, "localStorage"],
  [/\bsessionStorage\b/u, "sessionStorage"],
  [/\bindexedDB\b/u, "IndexedDB"],
  [/\bdocument\b/u, "DOM document"],
  [/\bwindow\b/u, "DOM window"],
  [
    /\bnew\s+(?:(?:THREE|Three)\s*\.\s*)?(?:Scene|(?:Perspective|Orthographic|Array|Cube)?Camera|WebGPURenderer|WebGLRenderer)\s*\(/u,
    "hidden Three ownership",
  ],
  [
    new RegExp("\\bfrom\\s+[\"']" + forbiddenModules + "(?:[/\"'])", "u"),
    "forbidden static import",
  ],
  [
    new RegExp(
      "\\bimport\\s*(?:\\(\\s*)?[\"']" + forbiddenModules + "(?:[/\"'])",
      "u",
    ),
    "forbidden side-effect or dynamic import",
  ],
  [
    new RegExp(
      "\\brequire\\s*\\(\\s*[\"']" + forbiddenModules + "(?:[/\"'])",
      "u",
    ),
    "forbidden require",
  ],
];

const failures = [];
for (const path of await sourceFiles(sourceRoot)) {
  const source = await readFile(path, "utf8");
  for (const [pattern, label] of bannedSource) {
    if (pattern.test(source)) {
      failures.push(path + ": forbidden " + label);
    }
  }
}

const packageJson = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
for (const field of [
  "dependencies",
  "optionalDependencies",
  "bundledDependencies",
  "bundleDependencies",
]) {
  const value = packageJson[field] ?? {};
  const dependencies = Array.isArray(value) ? value : Object.keys(value);
  if (dependencies.length > 0) {
    failures.push(
      "packages/real-water/package.json: " + field + " are not allowed in T01",
    );
  }
}

const peerDependencies = Object.keys(packageJson.peerDependencies ?? {});
if (
  peerDependencies.length !== 1 ||
  peerDependencies[0] !== "three" ||
  packageJson.peerDependencies.three !== ">=0.185.1 <0.186.0"
) {
  failures.push(
    "packages/real-water/package.json: Three must be the sole tested peer dependency",
  );
}

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}

console.log(
  "Core boundary check passed: no UI, network, persistence, framework, physics-engine, or hidden Three ownership.",
);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return sourceFiles(path);
      }
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return files.flat();
}
