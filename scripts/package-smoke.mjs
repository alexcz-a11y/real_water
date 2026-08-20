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
  const diagnosticsExport = packedPackage.exports["./diagnostics"];
  if (
    diagnosticsExport === undefined ||
    !existsSync(join(packageRoot, diagnosticsExport.import)) ||
    !existsSync(join(packageRoot, diagnosticsExport.types))
  ) {
    throw new Error(
      "The packed diagnostics subpath is missing built code or types.",
    );
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
    "assertHostPresentationAdapter",
    "createStaticHostPresentationAdapter",
    "readHostPresentationRoute",
    "readHostPresentedFrame",
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
    '  "MEMORY_TEST_PREWARM_DRAWING_BUFFER",',
    '  "DEFAULT_MEMORY_PREWARM_DRAWING_BUFFER",',
    '  "DIAGNOSTICS_CAPTURE_NAMES",',
    '  "DIAGNOSTICS_CAPTURE_SHAPES",',
    '  "readHostDiagnosticsRoute",',
    '  "readHostDiagnosticsPresentRequest",',
    '  "readHostDiagnosticsPresentedFrame",',
    "];",
    "for (const name of leakedHelpers) {",
    '  if (name in realWater) throw new Error("Internal helper leaked onto the public Interface: " + name);',
    "}",
    'const profile = realWater.createMinimalWaterQualityProfile("minimal-high-detail");',
    'if (profile.temporal.resolutionPolicy !== "drawing-buffer-exact") throw new Error("Packed Quality Profile is missing drawing-buffer-exact resolutionPolicy.");',
    'if (profile.temporal.mode !== "TRAA" || profile.temporal.taau !== false || profile.temporal.msaaSamples !== 0) throw new Error("Packed Quality Profile temporal policy drifted.");',
    "const manifest = realWater.createMinimalWaterPrewarmManifest(profile, { width: 320, height: 180 });",
    'if (manifest.declarations.length !== 30) throw new Error("Packed Prewarm Manifest work count drifted.");',
    'const environmentFingerprint = manifest.declarations.find((declaration) => declaration.id === "water-environment-radiance")?.fingerprint;',
    'if (typeof environmentFingerprint !== "string") throw new Error("Packed manifest is missing environment radiance.");',
    "const descriptor = realWater.SUPPORTED_HOST_ENVIRONMENT_REFLECTION;",
    'if (realWater.PREWARM_MANIFEST_VERSION !== 3) throw new Error("Packed Prewarm Manifest version must be 3.");',
    'if (manifest.version !== 3) throw new Error("Packed manifest version must be 3.");',
    'if (manifest.drawingBuffer.width !== 320 || manifest.drawingBuffer.height !== 180) throw new Error("Packed Memory-test drawing buffer drifted.");',
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
    "  host: realWater.createMemoryHostLifecycleAdapter({ simulation: realWater.createStaticHostSimulationAdapter(), environment, presentation: realWater.createStaticHostPresentationAdapter(), stepDelayMs: 0 }),",
    "});",
    "const lease = await run.ready;",
    'if (lease.capabilities.gameplay.maxQueryPointsPerTick !== 2048) throw new Error("Packed Gameplay Query capacity is incorrect.");',
    "const temporal = lease.capabilities.rendering.temporal;",
    'if (temporal.mode !== "TRAA" || temporal.renderScale !== 1 || temporal.resolutionPolicy !== "drawing-buffer-exact" || temporal.taau !== false || temporal.dynamicResolution !== false || temporal.frameGeneration !== false || temporal.msaaSamples !== 0 || temporal.motionFormat !== "rg16float" || temporal.stockThreeRevision !== "185") throw new Error("Packed ready temporal capabilities drifted.");',
    'if (!Object.isFrozen(temporal)) throw new Error("Packed ready temporal capabilities are mutable.");',
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
    'const diagnostics = await import("real-water/diagnostics");',
    'if (!Array.isArray(diagnostics.DIAGNOSTICS_CAPTURE_NAMES) || diagnostics.DIAGNOSTICS_CAPTURE_NAMES.length !== 12) throw new Error("Packed diagnostics capture names drifted.");',
    'if (typeof diagnostics.readHostDiagnosticsRoute !== "function") throw new Error("Packed diagnostics reader is missing.");',
    'if (typeof diagnostics.readHostDiagnosticsPresentedFrame !== "function") throw new Error("Packed diagnostics frame reader is missing.");',
    'if ("HostPresentedFrame" in diagnostics) throw new Error("Re-exported presentation types must stay type-only on the diagnostics subpath.");',
    'if ("DIAGNOSTICS_CAPTURE_NAMES" in realWater) throw new Error("Diagnostics DTOs leaked onto the root Interface.");',
    'if ("HostDiagnosticsPresentedFrame" in realWater) throw new Error("Diagnostics DTOs leaked onto the root Interface.");',
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
      'import { createMemoryHostLifecycleAdapter, createMinimalWaterPrewarmManifest, createMinimalWaterQualityProfile, createStaticHostEnvironmentAdapter, createStaticHostPresentationAdapter, createSupportedHostEnvironmentReflection, createStaticHostSimulationAdapter, prepareRealWater, type GameplayQueryResults, type QualityProfile, type RealWaterLease } from "real-water";',
      'import { DIAGNOSTICS_CAPTURE_NAMES, readHostDiagnosticsRoute, type DiagnosticsCaptureBase, type HostPresentedFrame, type HostPresentedTemporal, type HostPresentationRoute } from "real-water/diagnostics";',
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
      "  host: createMemoryHostLifecycleAdapter({ simulation: createStaticHostSimulationAdapter(), environment, presentation: createStaticHostPresentationAdapter(), stepDelayMs: 0 }),",
      "});",
      "const names: typeof DIAGNOSTICS_CAPTURE_NAMES = DIAGNOSTICS_CAPTURE_NAMES;",
      'const captureBase: DiagnosticsCaptureBase = { width: 320, height: 180, origin: "top-left" };',
      "void names;",
      "void captureBase;",
      "void readHostDiagnosticsRoute;",
      "type Presented = HostPresentedFrame;",
      "type Temporal = HostPresentedTemporal;",
      "type Route = HostPresentationRoute;",
      "const _temporal: Temporal | undefined = undefined;",
      "void _temporal;",
      "const _presented: Presented | undefined = undefined;",
      "const _route: Route | undefined = undefined;",
      "void _presented;",
      "void _route;",
      "void run.ready.then((lease: RealWaterLease) => { const results: GameplayQueryResults = { heights: new Float32Array(1), normals: new Float32Array(3), velocities: new Float32Array(3), foam: new Float32Array(1), ticks: new Float64Array(1), controlRevisions: new Float64Array(1), snapshotAges: new Uint8Array(1) }; lease.queryGameplay({ count: 1, positions: new Float32Array(3), results }); return lease.invalidateForLongSuspension(); });",
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
