import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "real-water-package-smoke-"),
);

try {
  const pnpmEntryPoint = process.env.npm_execpath;
  if (pnpmEntryPoint === undefined) {
    throw new Error("Package smoke must run from the pinned pnpm command.");
  }

  execFileSync(
    process.execPath,
    [
      pnpmEntryPoint,
      "--filter",
      "real-water",
      "pack",
      "--pack-destination",
      temporaryDirectory,
    ],
    { stdio: "inherit" },
  );

  const archive = readdirSync(temporaryDirectory).find((entry) =>
    entry.endsWith(".tgz"),
  );
  if (archive === undefined) {
    throw new Error("pnpm pack did not produce a package archive.");
  }

  execFileSync(
    "tar",
    ["-xzf", join(temporaryDirectory, archive), "-C", temporaryDirectory],
    { stdio: "inherit" },
  );

  const extractedPackageRoot = join(temporaryDirectory, "package");
  const consumerRoot = join(temporaryDirectory, "consumer");
  const packageRoot = join(consumerRoot, "node_modules", "real-water");
  mkdirSync(join(consumerRoot, "node_modules"), { recursive: true });
  renameSync(extractedPackageRoot, packageRoot);
  symlinkSync(
    resolve("node_modules", "three"),
    join(consumerRoot, "node_modules", "three"),
    "dir",
  );

  const packedPackage = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  );
  const importPath = join(packageRoot, packedPackage.exports["."].import);
  const typesPath = join(packageRoot, packedPackage.exports["."].types);

  if (!existsSync(importPath) || !existsSync(typesPath)) {
    throw new Error("The packed root export is missing built code or types.");
  }

  for (const mapName of ["index.js.map", "index.d.ts.map"]) {
    const mapPath = join(packageRoot, "dist", mapName);
    const sourceMap = JSON.parse(readFileSync(mapPath, "utf8"));
    const inlineSources =
      Array.isArray(sourceMap.sourcesContent) &&
      sourceMap.sourcesContent.every((source) => typeof source === "string");
    const packagedSources =
      Array.isArray(sourceMap.sources) &&
      sourceMap.sources.every((source) =>
        existsSync(resolve(dirname(mapPath), source)),
      );
    if (!inlineSources && !packagedSources) {
      throw new Error("Packed source map is not self-contained: " + mapName);
    }
  }

  const requiredExports = [
    "QUALITY_PROFILE_SCHEMA",
    "MAX_GAMEPLAY_QUERY_POINTS",
    "RealWaterRuntimeError",
    "RealWaterStartupError",
    "createMemoryHostLifecycleAdapter",
    "SUPPORTED_HOST_ENVIRONMENT_REFLECTION",
    "createStaticHostEnvironmentAdapter",
    "createSupportedHostEnvironmentReflection",
    "PREWARM_MANIFEST_VERSION",
    "createMinimalWaterPrewarmManifest",
    "createMinimalWaterQualityProfile",
    "createWaterPreset",
    "createThreeHostLifecycleAdapter",
    "prepareRealWater",
  ];
  const runtimeSmoke = [
    'const realWater = await import("real-water");',
    "const requiredExports = " + JSON.stringify(requiredExports) + ";",
    "for (const name of requiredExports) {",
    '  if (!(name in realWater)) throw new Error("Missing packed export: " + name);',
    "}",
    "const leakedHelpers = [",
    '  "assertHostEnvironmentTextureMatchesDescriptor",',
    '  "hostEnvironmentReflectionWorkPlanFingerprint",',
    '  "SUPPORTED_HOST_ENVIRONMENT_WORK_PLAN_FINGERPRINT",',
    '  "ThreeHostTexture",',
    "];",
    "for (const name of leakedHelpers) {",
    '  if (name in realWater) throw new Error("Internal helper leaked onto the public Interface: " + name);',
    "}",
    'const profile = realWater.createMinimalWaterQualityProfile("minimal-high-detail");',
    "const manifest = realWater.createMinimalWaterPrewarmManifest(profile);",
    'const environmentFingerprint = manifest.declarations.find((declaration) => declaration.id === "water-environment-radiance")?.fingerprint;',
    'if (typeof environmentFingerprint !== "string") throw new Error("Packed manifest is missing environment radiance.");',
    "const descriptor = realWater.SUPPORTED_HOST_ENVIRONMENT_REFLECTION;",
    'if (realWater.PREWARM_MANIFEST_VERSION !== 2) throw new Error("Packed Prewarm Manifest version must be 2.");',
    'if (manifest.version !== 2) throw new Error("Packed manifest version must be 2.");',
    'if (JSON.stringify(manifest.environmentReflection) !== JSON.stringify(descriptor)) throw new Error("Packed manifest is missing the canonical environment reflection.");',
    "const encoded = JSON.stringify({ identity: descriptor.identity, fingerprint: descriptor.fingerprint, width: descriptor.width, height: descriptor.height, format: descriptor.format, type: descriptor.type, colorSpace: descriptor.colorSpace });",
    'const { createHash } = await import("node:crypto");',
    'const structural = "sha256:" + createHash("sha256").update(encoded).digest("hex");',
    'if (environmentFingerprint !== structural) throw new Error("Packed environment declaration fingerprint does not encode the canonical descriptor.");',
    'if (environmentFingerprint === descriptor.fingerprint) throw new Error("Work-plan fingerprint must bind more than the radiance content hash.");',
    "const environment = realWater.createStaticHostEnvironmentAdapter(realWater.createSupportedHostEnvironmentReflection(), {",
    "  sunDirectionX: 0.32, sunDirectionY: 0.84, sunDirectionZ: 0.44,",
    "  sunColorR: 1, sunColorG: 0.96, sunColorB: 0.82,",
    "  sunIntensity: 1, environmentIntensity: 1, sunAngularRadiusRadians: 0.069,",
    "});",
    "const run = realWater.prepareRealWater({",
    "  manifest,",
    "  loading: { present() {} },",
    "  host: realWater.createMemoryHostLifecycleAdapter({ simulation: realWater.createStaticHostSimulationAdapter(), environment, stepDelayMs: 0 }),",
    "});",
    "const lease = await run.ready;",
    'if (lease.capabilities.gameplay.maxQueryPointsPerTick !== 2048) throw new Error("Packed Gameplay Query capacity is incorrect.");',
    "const queryResults = { heights: new Float32Array(1), normals: new Float32Array(3), velocities: new Float32Array(3), foam: new Float32Array(1), ticks: new Float64Array(1), controlRevisions: new Float64Array(1), snapshotAges: new Uint8Array(1) };",
    "lease.updateArtisticControls({ ...lease.inspectRuntime().artisticControls, waveStrength: 2 });",
    "const returnedResults = lease.queryGameplay({ count: 1, positions: new Float32Array(3), results: queryResults });",
    'if (returnedResults !== queryResults || queryResults.controlRevisions[0] !== 1 || queryResults.snapshotAges[0] !== 0) throw new Error("Packed Gameplay Query failed.");',
    'const receipt = lease.selectEffectVariant({ effectId: "minimal-water-surface", variantId: "basic" });',
    'if (!receipt.changed || receipt.revision !== 1) throw new Error("Prepared variant selection failed.");',
    "try {",
    '  lease.selectEffectVariant({ effectId: "minimal-water-surface", variantId: "undeclared" });',
    '  throw new Error("Undeclared effect variant was accepted.");',
    "} catch (error) {",
    '  if (!(error instanceof realWater.RealWaterRuntimeError) || error.code !== "EFFECT_NOT_PREWARMED") throw error;',
    "}",
    "const suspension = lease.invalidateForLongSuspension();",
    'if (lease.invalidateForLongSuspension() !== suspension || (await lease.invalidated) !== suspension) throw new Error("Long-suspension invalidation was not idempotent.");',
    "try {",
    '  lease.selectEffectVariant({ effectId: "minimal-water-surface", variantId: "basic" });',
    '  throw new Error("Invalidated runtime accepted an effect command.");',
    "} catch (error) {",
    '  if (!(error instanceof realWater.RealWaterRuntimeError) || error.code !== "RUNTIME_INVALIDATED") throw error;',
    "}",
    "await lease.dispose();",
  ].join("\n");
  execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", runtimeSmoke],
    {
      cwd: consumerRoot,
      stdio: "inherit",
    },
  );

  writeFileSync(
    join(consumerRoot, "index.mts"),
    [
      'import { createMemoryHostLifecycleAdapter, createMinimalWaterPrewarmManifest, createMinimalWaterQualityProfile, createStaticHostEnvironmentAdapter, createSupportedHostEnvironmentReflection, createStaticHostSimulationAdapter, prepareRealWater, type GameplayQueryResults, type QualityProfile } from "real-water";',
      "const profile: QualityProfile = createMinimalWaterQualityProfile();",
      "const manifest = createMinimalWaterPrewarmManifest(profile);",
      "const environment = createStaticHostEnvironmentAdapter(createSupportedHostEnvironmentReflection(), {",
      "  sunDirectionX: 0.32, sunDirectionY: 0.84, sunDirectionZ: 0.44,",
      "  sunColorR: 1, sunColorG: 0.96, sunColorB: 0.82,",
      "  sunIntensity: 1, environmentIntensity: 1, sunAngularRadiusRadians: 0.069,",
      "});",
      "const run = prepareRealWater({",
      "  manifest,",
      "  loading: { present() {} },",
      "  host: createMemoryHostLifecycleAdapter({ simulation: createStaticHostSimulationAdapter(), environment, stepDelayMs: 0 }),",
      "});",
      "void run.ready.then((lease) => { const results: GameplayQueryResults = { heights: new Float32Array(1), normals: new Float32Array(3), velocities: new Float32Array(3), foam: new Float32Array(1), ticks: new Float64Array(1), controlRevisions: new Float64Array(1), snapshotAges: new Uint8Array(1) }; lease.queryGameplay({ count: 1, positions: new Float32Array(3), results }); return lease.invalidateForLongSuspension(); });",
    ].join("\n"),
  );
  writeFileSync(
    join(consumerRoot, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        noEmit: true,
        strict: true,
        target: "ES2022",
      },
      files: ["index.mts"],
    }),
  );
  execFileSync(
    process.execPath,
    [
      join(process.cwd(), "node_modules/typescript/bin/tsc"),
      "--pretty",
      "false",
    ],
    {
      cwd: consumerRoot,
      stdio: "inherit",
    },
  );

  console.log(
    "Packed-package smoke passed using the built real-water root export.",
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
