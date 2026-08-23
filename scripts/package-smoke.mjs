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
    "ENVIRONMENT_PRESET_SCHEMA",
    "QUALITY_PROFILE_SCHEMA",
    "SHOWCASE_PRESET_SCHEMA",
    "WATER_PRESET_SCHEMA",
    "WATER_PRESET_VERSION",
    "BODY_PHYSICS_FIXED_TICK_HZ",
    "MAX_ATTACHED_BODIES",
    "MAX_GAMEPLAY_QUERY_POINTS",
    "RealWaterRuntimeError",
    "RealWaterStartupError",
    "createBodyPhysicsAdapter",
    "createMemoryBodyPhysicsAdapter",
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
    "createAuthoredWaterPreset",
    "createReferenceEnvironmentPreset",
    "createReferenceShowcasePreset",
    "createWaterPreset",
    "exportPresetJson",
    "importPresetJson",
    "migrateEnvironmentPreset",
    "migrateQualityProfile",
    "migrateShowcasePreset",
    "migrateWaterPreset",
    "createThreeHostLifecycleAdapter",
    "prepareRealWater",
  ];
  const runtimeSmoke = [
    'const realWater = await import("real-water");',
    "const requiredExports = " + JSON.stringify(requiredExports) + ";",
    "for (const name of requiredExports) {",
    '  if (!(name in realWater)) throw new Error("Missing packed export: " + name);',
    "}",
    "const packedPresets = [",
    '  realWater.createWaterPreset("storm"),',
    "  realWater.createReferenceEnvironmentPreset(),",
    '  realWater.createMinimalWaterQualityProfile("minimal-high-detail"),',
    "  realWater.createReferenceShowcasePreset(),",
    "];",
    "for (const preset of packedPresets) {",
    "  const encodedPreset = realWater.exportPresetJson(preset);",
    "  const importedPreset = realWater.importPresetJson(encodedPreset);",
    '  if (importedPreset.status !== "current" || JSON.stringify(importedPreset.preset) !== JSON.stringify(preset)) throw new Error("Packed preset codec failed a current round trip.");',
    "}",
    "const futurePresetRaw = `  ${JSON.stringify({ ...packedPresets[1], version: 999 })}\\n`;",
    "const futurePreset = realWater.importPresetJson(futurePresetRaw);",
    'if (futurePreset.status !== "recovery" || futurePreset.reason !== "future-version" || futurePreset.rawJson !== futurePresetRaw) throw new Error("Packed preset codec did not preserve future JSON.");',
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
    'if (profile.reflection.ssr.roughnessCutoff !== 0.5 || profile.reflection.ssr.blurQuality !== 2 || profile.reflection.ssr.mipCount !== 5 || profile.reflection.ssr.history.mode !== "temporal-reproject-specular" || profile.reflection.ssr.history.accumulate !== true || profile.reflection.ssr.history.maxFrames !== 32 || profile.reflection.ssr.history.resetVelocityFormat !== "rg16float") throw new Error("Packed Quality Profile SSR policy drifted.");',
    'if (profile.temporal.mode !== "TRAA" || profile.temporal.taau !== false || profile.temporal.msaaSamples !== 0 || profile.temporal.updateCadence !== "host-present") throw new Error("Packed Quality Profile temporal policy drifted.");',
    'if (profile.interaction.anchorCount !== 1 || profile.interaction.field.radiusMetres !== 48 || profile.interaction.field.edgeFadeMetres !== 8 || profile.interaction.field.maxActiveDisturbances !== 128 || profile.interaction.field.snapshotBanks !== 2 || profile.interaction.field.maxSnapshotAgeTicks !== 1 || profile.interaction.field.radialImpactRoute !== "analytic-uniform-array") throw new Error("Packed Quality Profile interaction policy drifted.");',
    "const manifest = realWater.createMinimalWaterPrewarmManifest(profile, { width: 320, height: 180 });",
    'if (manifest.declarations.length !== 68) throw new Error("Packed Prewarm Manifest work count drifted.");',
    'const environmentFingerprint = manifest.declarations.find((declaration) => declaration.id === "water-environment-radiance")?.fingerprint;',
    'if (typeof environmentFingerprint !== "string") throw new Error("Packed manifest is missing environment radiance.");',
    "const descriptor = realWater.SUPPORTED_HOST_ENVIRONMENT_REFLECTION;",
    'if (realWater.PREWARM_MANIFEST_VERSION !== 4) throw new Error("Packed Prewarm Manifest version must be 4.");',
    'if (manifest.version !== 4) throw new Error("Packed manifest version must be 4.");',
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
    'if (lease.capabilities.gameplay.maxAttachedBodies !== 32 || realWater.MAX_ATTACHED_BODIES !== 32) throw new Error("Packed Body attachment capacity is incorrect.");',
    'if (realWater.MAX_ACTIVE_DISTURBANCES !== 128 || lease.capabilities.gameplay.maxActiveDisturbances !== 128 || lease.capabilities.gameplay.interactionField.radiusMetres !== 48 || lease.capabilities.gameplay.interactionField.edgeFadeMetres !== 8 || lease.capabilities.gameplay.interactionField.maxSnapshotAgeTicks !== 1 || lease.capabilities.gameplay.interactionField.disturbanceKinds[0] !== "radial-impact") throw new Error("Packed local interaction capabilities drifted.");',
    "const temporal = lease.capabilities.rendering.temporal;",
    'if (temporal.mode !== "TRAA" || temporal.renderScale !== 1 || temporal.resolutionPolicy !== "drawing-buffer-exact" || temporal.taau !== false || temporal.dynamicResolution !== false || temporal.frameGeneration !== false || temporal.msaaSamples !== 0 || temporal.updateCadence !== "host-present" || temporal.motionFormat !== "rg16float" || temporal.stockThreeRevision !== "185") throw new Error("Packed ready temporal capabilities drifted.");',
    "const reflection = lease.capabilities.rendering.reflection;",
    'if (reflection.environment.source !== "host-adapter" || reflection.planar.format !== "rgba8unorm-srgb" || reflection.planar.samples !== 0 || reflection.planar.width !== 320 || reflection.planar.height !== 180) throw new Error("Packed ready reflection capabilities drifted.");',
    'if (reflection.ssr.mode !== "current-frame" || reflection.ssr.history.mode !== "temporal-reproject-specular" || reflection.ssr.history.accumulate !== true || reflection.ssr.history.maxFrames !== 32 || reflection.ssr.history.width !== 320 || reflection.ssr.history.height !== 180 || reflection.ssr.history.historyFormat !== "rgba16float" || reflection.ssr.history.resolveFormat !== "rgba16float" || reflection.ssr.history.inputFormat !== "rgba16float" || reflection.ssr.history.captureFormat !== "rgba16float" || reflection.ssr.updateCadence !== "host-present" || reflection.ssr.rawFormat !== "rgba16float" || reflection.ssr.compositeFormat !== "rgba16float" || reflection.ssr.samples !== 0 || reflection.ssr.width !== 320 || reflection.ssr.height !== 180 || JSON.stringify(reflection.ssr.missFallbackPriority) !== JSON.stringify(["planar","host-adapter"]) || reflection.ssr.blur.format !== "rgba16float" || reflection.ssr.blur.mipCount !== 5 || reflection.ssr.blur.blurQuality !== 2 || reflection.ssr.blur.enabled !== true || reflection.ssr.blur.width !== 320 || reflection.ssr.blur.height !== 180) throw new Error("Packed ready current-frame SSR capabilities drifted.");',
    'if (reflection.ssr.history === true || reflection.ssr.history === false) throw new Error("Packed ready reflection history must be the TemporalReproject policy.");',
    'if (!Object.isFrozen(temporal)) throw new Error("Packed ready temporal capabilities are mutable.");',
    "const queryResults = { heights: new Float32Array(1), normals: new Float32Array(3), velocities: new Float32Array(3), foam: new Float32Array(1), ticks: new Float64Array(1), controlRevisions: new Float64Array(1), snapshotAges: new Uint8Array(1) };",
    "lease.updateArtisticControls({ ...lease.inspectRuntime().artisticControls, waveStrength: 2 });",
    "const anchorReceipt = lease.updateInteractionAnchor({ x: 0, z: 0 });",
    'if (anchorReceipt.changed !== false || anchorReceipt.revision !== 0) throw new Error("Packed Interaction Anchor failed.");',
    'const impactReceipt = lease.submitDisturbances({ kind: "radial-impact", count: 1, ids: Uint32Array.of(24), positions: Float32Array.of(0, 0, 0), radii: Float32Array.of(8), amplitudes: Float32Array.of(1), priorities: Uint8Array.of(1) });',
    'if (impactReceipt.acceptedDisturbanceIds[0] !== 24 || impactReceipt.activeDisturbanceCount !== 1) throw new Error("Packed radial Disturbance failed.");',
    "const returnedResults = lease.queryGameplay({ count: 1, positions: new Float32Array(3), results: queryResults });",
    'if (returnedResults !== queryResults || queryResults.controlRevisions[0] !== 1 || queryResults.snapshotAges[0] !== 0) throw new Error("Packed Gameplay Query failed.");',
    "const bodyState = { position: { x: 0, y: queryResults.heights[0], z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, linearVelocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 }, mass: 1 };",
    "let bodyRoute;",
    "let bodyLoad;",
    "const body = realWater.createBodyPhysicsAdapter({ snapshot: () => bodyState, applyWaterLoad: (load) => { bodyLoad = load; }, bind: (route) => { bodyRoute = route; return Object.freeze({ dispose() { bodyRoute = undefined; } }); } });",
    'const bodyAttachment = lease.attachBody({ physics: body, shape: { kind: "sphere", radius: 0.5 } });',
    'if (typeof bodyRoute?.beforeIntegrate !== "function") throw new Error("Packed Body Adapter did not bind its fixed-step route.");',
    "const appliedBodyLoad = bodyRoute.beforeIntegrate();",
    'if (bodyLoad?.queryTick !== appliedBodyLoad.queryTick || bodyLoad?.querySnapshotAge !== 0 || appliedBodyLoad.querySnapshotAge !== 0 || bodyAttachment.inspect().lastWaterLoad !== appliedBodyLoad) throw new Error("Packed Body coupling failed.");',
    "bodyAttachment.detach();",
    "const memoryBody = realWater.createMemoryBodyPhysicsAdapter({ initialState: bodyState });",
    'const memoryAttachment = lease.attachBody({ physics: memoryBody, shape: { kind: "sphere", radius: 0.5 } });',
    "memoryBody.integrateFixedStep();",
    'if (realWater.BODY_PHYSICS_FIXED_TICK_HZ !== 60 || !Number.isFinite(memoryBody.interpolate(0.5).position.y) || memoryAttachment.inspect().lastWaterLoad?.querySnapshotAge !== 0) throw new Error("Packed Memory Body coupling failed.");',
    "memoryAttachment.detach();",
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
    'if (!Array.isArray(diagnostics.DIAGNOSTICS_CAPTURE_NAMES) || diagnostics.DIAGNOSTICS_CAPTURE_NAMES.length !== 27) throw new Error("Packed diagnostics capture names drifted.");',
    'if (!diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("planar-color") || !diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("planar-target-alpha")) throw new Error("Packed diagnostics omitted planar captures.");',
    'if (diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("planar-confidence")) throw new Error("Packed diagnostics claimed screen-space planar-confidence.");',
    'if (!diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("ssr-hit") || !diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("ssr-confidence") || !diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("ssr-color") || !diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("ssr-roughness") || !diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("reflection-base-color") || !diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("ssr-composite-color") || !diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("ssr-history-color") || !diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("ssr-history-frame-weight") || !diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("ssr-history-input-color")) throw new Error("Packed diagnostics omitted current-frame SSR captures.");',
    'if (!diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("whitecap-generation") || !diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("whitecap-history") || !diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("whitecap-advection") || !diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("whitecap-decay") || diagnostics.DIAGNOSTICS_CAPTURE_SHAPES["whitecap-decay"].format !== "r32float-whitecap-stage") throw new Error("Packed diagnostics omitted spectral-whitecap stages.");',
    'if (diagnostics.DIAGNOSTICS_CAPTURE_SHAPES["ssr-color"].format !== "rgb32float-linear-ssr" || diagnostics.DIAGNOSTICS_CAPTURE_SHAPES["ssr-color"].elementType !== "float32" || diagnostics.DIAGNOSTICS_CAPTURE_SHAPES["ssr-color"].components !== 3) throw new Error("Packed ssr-color is not linear Float32 RGB.");',
    'if (diagnostics.DIAGNOSTICS_CAPTURE_SHAPES["ssr-roughness"].format !== "r32float-ssr-roughness") throw new Error("Packed ssr-roughness shape drifted.");',
    'if (diagnostics.DIAGNOSTICS_CAPTURE_SHAPES["reflection-base-color"].format !== "rgb32float-linear-reflection-base" || diagnostics.DIAGNOSTICS_CAPTURE_SHAPES["reflection-base-color"].components !== 3) throw new Error("Packed reflection-base-color is not linear Float32 RGB.");',
    'if (diagnostics.DIAGNOSTICS_CAPTURE_SHAPES["ssr-composite-color"].format !== "rgb32float-linear-ssr-composite" || diagnostics.DIAGNOSTICS_CAPTURE_SHAPES["ssr-composite-color"].components !== 3) throw new Error("Packed ssr-composite-color is not linear Float32 RGB.");',
    'if (diagnostics.DIAGNOSTICS_CAPTURE_NAMES.includes("ssr-history")) throw new Error("Packed diagnostics claimed a synthetic ssr-history name.");',
    'if (diagnostics.DIAGNOSTICS_CAPTURE_SHAPES["ssr-history-color"].format !== "rgb32float-linear-ssr-history" || diagnostics.DIAGNOSTICS_CAPTURE_SHAPES["ssr-history-frame-weight"].format !== "r32float-ssr-history-frame-weight" || diagnostics.DIAGNOSTICS_CAPTURE_SHAPES["ssr-history-input-color"].format !== "rgb32float-linear-ssr-history-input") throw new Error("Packed SSR history shapes drifted.");',
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
      'import { createMemoryBodyPhysicsAdapter, createMemoryHostLifecycleAdapter, createMinimalWaterPrewarmManifest, createMinimalWaterQualityProfile, createStaticHostEnvironmentAdapter, createStaticHostPresentationAdapter, createSupportedHostEnvironmentReflection, createStaticHostSimulationAdapter, prepareRealWater, type BodyAttachment, type BodyPhysicsState, type GameplayQueryResults, type QualityProfile, type RealWaterLease } from "real-water";',
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
      "const bodyState: BodyPhysicsState = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, linearVelocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 }, mass: 1 };",
      "const memoryBody = createMemoryBodyPhysicsAdapter({ initialState: bodyState });",
      "const _attachment: BodyAttachment | undefined = undefined;",
      "void memoryBody;",
      "void _attachment;",
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
