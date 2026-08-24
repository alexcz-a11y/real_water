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

const leakedNodeBridge = [
  [/\.userData\b/u, "Object3D.userData bridge"],
  [/Real Water optical outputs/u, "TSL optical-output userData leak"],
  [/\breadPreparedOpticalOutputs\b/u, "optical-output package seam"],
  [/\bopticalOutputNode\b/u, "optical-output package seam"],
];
const publicTslImport =
  /\bfrom\s+["']three\/tsl["']|\bimport\s*(?:\(\s*)?["']three\/tsl["']/u;
const internalTestImport =
  /\bfrom\s+["'](?:\.\.\/)+src\/internal\/|\bimport\s*(?:\(\s*)?["'](?:\.\.\/)+src\/internal\//u;
const sourceGrepTest =
  /\breadFileSync\s*\(|\breadFile\s*\(|from\s+["']node:fs(?:\/promises)?["']/u;

const failures = [];
for (const path of await sourceFiles(sourceRoot)) {
  const source = await readFile(path, "utf8");
  for (const [pattern, label] of bannedSource) {
    if (pattern.test(source)) {
      failures.push(path + ": forbidden " + label);
    }
  }
  for (const [pattern, label] of leakedNodeBridge) {
    if (pattern.test(source)) {
      failures.push(path + ": forbidden " + label);
    }
  }
  if (!path.includes("/internal/") && publicTslImport.test(source)) {
    failures.push(path + ": public surface must not import three/tsl");
  }
}

const testRoot = resolve(root, "test");
for (const path of await sourceFiles(testRoot)) {
  const source = await readFile(path, "utf8");
  if (internalTestImport.test(source)) {
    failures.push(path + ": tests must not import private internal helpers");
  }
  if (
    sourceGrepTest.test(source) &&
    /SOURCE_ROOT|internal\/|water-optics-rendering|minimal-water-prewarm/u.test(
      source,
    )
  ) {
    failures.push(path + ": tests must not grep package source text");
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

const qaFrameDriver = resolve(
  "apps/reference-experience/src/qa-frame-driver.ts",
);
const qaFrameDriverSource = await readFile(qaFrameDriver, "utf8");
const qaDriverBans = [
  [/\bfrom\s+["']three(?:\/tsl|\/webgpu|\/addons)?["']/u, "Three/TSL import"],
  [/\bTRAANode\b/u, "TRAANode ownership"],
  [/\bRenderTarget\b/u, "RenderTarget ownership"],
  [/\bRenderPipeline\b/u, "RenderPipeline ownership"],
  [/\bpass\s*\(/u, "pass() ownership"],
  [/\bmrt\s*\(/u, "mrt() ownership"],
  [/qa-traa-r185/u, "duplicate QA TRAA adapter"],
  [/\bresetHistory\b/u, "public diagnostics resetHistory knob"],
  [/\bpendingResetHistory\b/u, "QA pendingResetHistory latch"],
  [/\bsuppressJitter\b/u, "test-tailored jitter suppression"],
  [/\breplayLast\b/u, "test-tailored jitter replay"],
  [/qa-final-color-target/u, "fake QA GPU declaration"],
];
for (const [pattern, label] of qaDriverBans) {
  if (pattern.test(qaFrameDriverSource)) {
    failures.push(qaFrameDriver + ": forbidden " + label);
  }
}

const controlPresenters = [
  {
    path: resolve("apps/reference-experience/src/artist-control-presenter.ts"),
    allowedModules: new Set(["./reference-control-model.js"]),
  },
  {
    path: resolve(
      "apps/reference-experience/src/engineering-control-presenter.ts",
    ),
    allowedModules: new Set(["./reference-control-model.js", "tweakpane"]),
  },
];
const controlPresenterBans = [
  [/\bHostPresentationRoute\b/u, "HostPresentationRoute seam"],
  [/\breadHostPresentationRoute\b/u, "readHostPresentationRoute seam"],
  [/\breadHostDiagnosticsRoute\b/u, "readHostDiagnosticsRoute seam"],
  [/\b(?:WebGPU|WebGL)?Renderer\b/u, "renderer ownership"],
  [/\brenderer\b/u, "renderer ownership"],
  [/\bScene\b/u, "scene ownership"],
  [/\bscene\b/u, "scene ownership"],
  [/\b(?:WebGPU|WebGL)?RenderTarget\b/u, "render-target ownership"],
  [/\bRenderPipeline\b/u, "render-pipeline ownership"],
];
let checkedControlPresenterCount = 0;
for (const presenter of controlPresenters) {
  const source = await readOptionalSource(presenter.path);
  if (source === undefined) {
    continue;
  }
  checkedControlPresenterCount += 1;

  for (const specifier of moduleSpecifiers(source)) {
    if (!presenter.allowedModules.has(specifier)) {
      failures.push(
        `${presenter.path}: forbidden presenter import ${JSON.stringify(specifier)}`,
      );
    }
  }
  for (const [pattern, label] of controlPresenterBans) {
    if (pattern.test(source)) {
      failures.push(`${presenter.path}: forbidden ${label}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}

console.log(
  `Core boundary check passed: no UI, network, persistence, framework, physics-engine, hidden Three ownership, TSL node package seam, QA scene/TRAA ownership, or control-presenter rendering ownership; checked ${checkedControlPresenterCount} control presenters.`,
);

async function readOptionalSource(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function moduleSpecifiers(source) {
  const specifiers = [];
  const staticModules =
    /\b(?:import|export)\s+(?:type\s+)?(?:[\w*{},\s]+\s+from\s+)?["']([^"']+)["']/gu;
  const loadedModules = /\b(?:import|require)\s*\(\s*["']([^"']+)["']/gu;

  for (const pattern of [staticModules, loadedModules]) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

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
