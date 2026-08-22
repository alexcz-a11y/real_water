import { describe, expect, it, vi } from "vitest";
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearSRGBColorSpace,
  Mesh,
  NearestFilter,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
} from "three";
import { velocity } from "three/tsl";
import { RenderPipeline } from "three/webgpu";
import {
  createMinimalWaterQualityProfile,
  createMinimalWaterPrewarmManifest,
  createStaticHostEnvironmentAdapter,
  createStaticHostPresentationAdapter,
  createStaticHostSimulationAdapter,
  createSupportedHostEnvironmentRadianceBytes,
  createThreeHostLifecycleAdapter as createBaseThreeHostLifecycleAdapter,
  prepareRealWater,
  readHostPresentationRoute,
  readHostPresentedFrame,
  type HostEnvironmentAdapter,
  type HostPresentationAdapter,
  type HostPresentationRoute,
  type HostPresentedFrame,
  type HostSimulationAdapter,
  type HostSimulationState,
  type LoadingPresenterAdapter,
  type StartupSnapshot,
  type ThreeHostLifecycleAdapterOptions,
  type ThreeHostRenderer,
} from "../src/index.js";
import {
  TEST_ENVIRONMENT_STATE,
  createTestEnvironmentAdapter,
  createTestEnvironmentReflection,
} from "./test-host-environment.js";
import {
  DIAGNOSTICS_CAPTURE_NAMES,
  readHostDiagnosticsPresentedFrame,
  readHostDiagnosticsRoute,
} from "../src/diagnostics.js";

const STATIC_SIMULATION = createStaticHostSimulationAdapter();
const CORE_READY_TEMPORAL = Object.freeze({
  mode: "TRAA" as const,
  renderScale: 1 as const,
  resolutionPolicy: "drawing-buffer-exact" as const,
  taau: false as const,
  dynamicResolution: false as const,
  frameGeneration: false as const,
  msaaSamples: 0 as const,
  updateCadence: "host-present" as const,
  motionFormat: "rg16float" as const,
  stockThreeRevision: "185" as const,
});
const CORE_READY_REFLECTION = Object.freeze({
  environment: Object.freeze({ source: "host-adapter" as const }),
  planar: Object.freeze({
    width: 320,
    height: 180,
    format: "rgba8unorm-srgb" as const,
    samples: 0 as const,
  }),
  ssr: Object.freeze({
    width: 320,
    height: 180,
    rawFormat: "rgba16float" as const,
    compositeFormat: "rgba16float" as const,
    samples: 0 as const,
    mode: "current-frame" as const,
    history: Object.freeze({
      width: 320,
      height: 180,
      historyFormat: "rgba16float" as const,
      resolveFormat: "rgba16float" as const,
      inputFormat: "rgba16float" as const,
      captureFormat: "rgba16float" as const,
      resetVelocityFormat: "rg16float" as const,
      maxFrames: 32 as const,
      mode: "temporal-reproject-specular" as const,
      accumulate: true as const,
      hitPointReprojection: true as const,
      normalFormat: "packed-rgba16float" as const,
      resetDomains: Object.freeze([
        "simulation-reset",
        "camera-cut",
        "origin-shift",
        "sea-state-cut",
      ] as const),
      updateCadence: "host-present" as const,
    }),
    updateCadence: "host-present" as const,
    missFallbackPriority: Object.freeze(["planar", "host-adapter"] as const),
    blur: Object.freeze({
      width: 320,
      height: 180,
      format: "rgba16float" as const,
      mipCount: 5 as const,
      blurQuality: 2 as const,
      enabled: true as const,
    }),
  }),
});

function mockDrawingBufferSize() {
  return vi.fn((target: { width: number; height: number }) => {
    target.width = 320;
    target.height = 180;
    return target;
  });
}

function createTestEnvironmentTexture(
  width = 8,
  height = 4,
  colorSpace:
    typeof SRGBColorSpace | typeof LinearSRGBColorSpace = SRGBColorSpace,
) {
  const data =
    width === 8 && height === 4
      ? createSupportedHostEnvironmentRadianceBytes()
      : new Uint8Array(width * height * 4).fill(255);
  const environmentRadiance = new DataTexture(data, width, height);
  environmentRadiance.name = "test-environment-radiance";
  environmentRadiance.colorSpace = colorSpace;
  environmentRadiance.wrapS = RepeatWrapping;
  environmentRadiance.wrapT = ClampToEdgeWrapping;
  environmentRadiance.magFilter = NearestFilter;
  environmentRadiance.minFilter = NearestFilter;
  environmentRadiance.generateMipmaps = false;
  environmentRadiance.needsUpdate = true;
  return environmentRadiance;
}

function createTestEnvironment(): HostEnvironmentAdapter {
  return createTestEnvironmentAdapter(createTestEnvironmentTexture());
}

function createThreeHostLifecycleAdapter(
  options: Omit<
    ThreeHostLifecycleAdapterOptions,
    "simulation" | "environment" | "presentation"
  > &
    Partial<
      Pick<
        ThreeHostLifecycleAdapterOptions,
        "environment" | "simulation" | "presentation"
      >
    >,
) {
  return createBaseThreeHostLifecycleAdapter({
    ...options,
    simulation: options.simulation ?? STATIC_SIMULATION,
    environment: options.environment ?? createTestEnvironment(),
    presentation: options.presentation ?? createStaticHostPresentationAdapter(),
  });
}

class RecordingLoadingPresenter implements LoadingPresenterAdapter {
  public readonly snapshots: StartupSnapshot[] = [];

  public present(snapshot: StartupSnapshot): void {
    this.snapshots.push(snapshot);
  }
}

describe("createThreeHostLifecycleAdapter", () => {
  it("does not initialize the borrowed renderer after Host preparation is cancelled", async () => {
    const renderer = {
      init: vi.fn(async () => {}),
      copyTextureToTexture: vi.fn(),
    };
    const adapter = createTestThreeHostLifecycleAdapter(renderer);
    const controller = new AbortController();
    controller.abort("Cancelled before Three initialization.");

    await expect(
      adapter.prepare({
        manifest: createMinimalWaterPrewarmManifest(),
        progress: { complete: vi.fn(async () => {}) },
        signal: controller.signal,
      }),
    ).rejects.toThrow("Three Host preparation was cancelled.");
    expect(renderer.init).not.toHaveBeenCalled();
  });

  it("prewarms and disposes the declared water route through the Startup Interface", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.updateProjectionMatrix();
    const hostProjection = camera.projectionMatrix.clone();
    const hostProjectionInverse = camera.projectionMatrixInverse.clone();
    const initialRenderTarget = Object.freeze({ name: "host-target" });
    let currentRenderTarget: unknown = initialRenderTarget;
    let releaseWarmup: ((pixels: Uint8Array) => void) | undefined;
    const warmup = new Promise<Uint8Array>((resolve) => {
      releaseWarmup = resolve;
    });
    let readbackCount = 0;
    const previousOnDeviceLost = vi.fn();
    const renderer = {
      autoClear: false,
      backend: {
        device: {
          limits: coreDeviceLimits(),
        },
      },
      compileAsync: vi.fn(async () => {}),
      computeAsync: vi.fn(async () => {}),
      clear: vi.fn(),
      contextNode: null,
      coordinateSystem: 2_001,
      dispose: vi.fn(),
      getActiveCubeFace: vi.fn(() => 4),
      getActiveMipmapLevel: vi.fn(() => 2),
      getClearAlpha: vi.fn(() => 1),
      getClearColor: vi.fn(
        (color: { r: number; g: number; b: number }) => color,
      ),
      getDrawingBufferSize: mockDrawingBufferSize(),
      getMRT: vi.fn(() => null),
      getRenderTarget: vi.fn(() => currentRenderTarget),
      hasFeature: vi.fn((name: string) =>
        ["core-features-and-limits", "timestamp-query"].includes(name),
      ),
      init: vi.fn(async () => {}),
      initTexture: vi.fn(),
      onDeviceLost: previousOnDeviceLost,
      opaque: true,
      outputColorSpace: "srgb",
      readRenderTargetPixelsAsync: vi.fn(() => {
        readbackCount += 1;
        return readbackCount === 1
          ? warmup
          : Promise.resolve(Uint8Array.from([0, 96, 160, 255]));
      }),
      render: vi.fn(),
      setClearColor: vi.fn(),
      setRenderTarget: vi.fn((target: unknown) => {
        currentRenderTarget = target;
      }),
      setMRT: vi.fn(),
      toneMapping: 0,
      transparent: false,
      xr: { enabled: false },
      getRenderObjectFunction: vi.fn(() => null),
      setRenderObjectFunction: vi.fn(),
      getScissorTest: vi.fn(() => false),
      setScissorTest: vi.fn(),
      getPixelRatio: vi.fn(() => 1),
      setPixelRatio: vi.fn(),
      initRenderTarget: vi.fn(),
      copyTextureToTexture: vi.fn(),
    };
    const loading = new RecordingLoadingPresenter();
    const manifest = createMinimalWaterPrewarmManifest(
      createMinimalWaterQualityProfile("minimal-high-detail"),
    );
    const run = prepareRealWater({
      manifest,
      loading,
      host: createThreeHostLifecycleAdapter({ renderer, scene, camera }),
    });

    await vi.waitFor(() => {
      expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(1);
    });
    expect(
      loading.snapshots.at(-1)?.status === "preparing"
        ? loading.snapshots.at(-1)?.progress.completedWork
        : undefined,
    ).toBe(8);
    releaseWarmup?.(Uint8Array.from([0, 96, 160, 255]));
    const lease = await run.ready;

    expect(lease.capabilities).toEqual({
      gameplay: { maxQueryPointsPerTick: 2_048 },
      rendering: {
        backend: "core-webgpu",
        timestampQuery: true,
        temporal: CORE_READY_TEMPORAL,
        reflection: CORE_READY_REFLECTION,
      },
    });
    expect(Object.isFrozen(lease.capabilities.rendering.temporal)).toBe(true);
    expect(() => {
      (lease.capabilities.rendering.temporal as { taau: boolean }).taau = true;
    }).toThrow(TypeError);
    expect(renderer.init).toHaveBeenCalledTimes(1);
    expect(renderer.onDeviceLost).not.toBe(previousOnDeviceLost);
    expect(renderer.initTexture).toHaveBeenCalledTimes(5);
    expect(renderer.computeAsync).toHaveBeenCalledTimes(8);
    expect(renderer.compileAsync).toHaveBeenCalledWith(scene, camera);
    expect(
      renderer.compileAsync.mock.calls.some((call) => call[1] !== camera),
    ).toBe(true);
    expect(renderer.render).toHaveBeenCalledTimes(129);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(29);
    const readbackTargets = renderer.readRenderTargetPixelsAsync.mock.calls.map(
      (call) =>
        call[0] as { texture?: { name?: string }; textures?: unknown[] },
    );
    expect(readbackTargets[0]?.texture?.name).toBe("Real Water final color");
    expect(readbackTargets[1]?.texture?.name).toBe("Real Water current color");
    expect(readbackTargets[2]?.texture?.name).toBe(
      "Real Water inverse linear depth",
    );
    expect(readbackTargets[28]?.texture?.name).toBe("Real Water final color");
    expect(camera.aspect).toBe(1.777);
    expect(camera.view).toBeNull();
    expect(camera.projectionMatrix.equals(hostProjection)).toBe(true);
    expect(camera.projectionMatrixInverse.equals(hostProjectionInverse)).toBe(
      true,
    );
    expect(currentRenderTarget).toBe(initialRenderTarget);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(
      initialRenderTarget,
      4,
      2,
    );
    expect(scene.children).toHaveLength(1);
    const preparedMesh = scene.children[0] as unknown as {
      readonly geometry: {
        readonly boundingBox: {
          readonly max: { readonly x: number; readonly z: number };
        } | null;
      };
      readonly position: { readonly x: number; readonly z: number };
    };
    expect(preparedMesh.geometry.boundingBox?.max.x).toBeGreaterThan(3_000);
    expect(preparedMesh.geometry.boundingBox?.max.z).toBeGreaterThan(3_000);
    camera.position.set(12.4, 8, -7.1);
    camera.updateMatrixWorld();
    expect(preparedMesh.position.x).toBe(0);
    expect(preparedMesh.position.z).toBe(0);
    const completedIds = loading.snapshots.flatMap((snapshot) =>
      snapshot.status === "preparing" &&
      snapshot.progress.lastCompleted !== undefined
        ? [snapshot.progress.lastCompleted.id]
        : [],
    );
    expect(completedIds).toHaveLength(manifest.declarations.length);
    expect(new Set(completedIds)).toEqual(
      new Set(manifest.declarations.map((declaration) => declaration.id)),
    );
    expect(completedIds.indexOf("water-named-output-routes")).toBeGreaterThan(
      -1,
    );
    expect(completedIds.indexOf("water-ssr-blur-target")).toBeGreaterThan(
      completedIds.indexOf("water-named-output-routes"),
    );
    expect(completedIds.indexOf("water-ssr-probe")).toBeGreaterThan(
      completedIds.indexOf("water-named-output-routes"),
    );
    const preparedPlane = scene.children[0];
    const queryResults = {
      heights: new Float32Array(1),
      normals: new Float32Array(3),
      velocities: new Float32Array(3),
      foam: new Float32Array(1),
      ticks: new Float64Array(1),
      controlRevisions: new Float64Array(1),
      snapshotAges: new Uint8Array(1),
    };
    expect(
      lease.queryGameplay({
        count: 1,
        positions: new Float32Array(3),
        results: queryResults,
      }),
    ).toBe(queryResults);
    const geometryBefore = {
      height: queryResults.heights[0],
      normal: Array.from(queryResults.normals),
      velocity: Array.from(queryResults.velocities),
      foam: queryResults.foam[0],
    };
    expect(
      lease.updateArtisticControls({
        ...lease.inspectRuntime().artisticControls,
        grazingReflection: 2,
      }),
    ).toMatchObject({
      changed: true,
      revision: 1,
    });
    expect(
      lease.queryGameplay({
        count: 1,
        positions: new Float32Array(3),
        results: queryResults,
      }),
    ).toBe(queryResults);
    expect(queryResults.heights[0]).toBe(geometryBefore.height);
    expect(Array.from(queryResults.normals)).toEqual(geometryBefore.normal);
    expect(Array.from(queryResults.velocities)).toEqual(
      geometryBefore.velocity,
    );
    expect(queryResults.foam[0]).toBe(geometryBefore.foam);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(2);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(29);
    expect(camera.aspect).toBe(1.777);
    expect(camera.view).toBeNull();
    expect(camera.projectionMatrix.equals(hostProjection)).toBe(true);
    expect(camera.projectionMatrixInverse.equals(hostProjectionInverse)).toBe(
      true,
    );
    expect(scene.children[0]).toBe(preparedPlane);

    renderer.onDeviceLost({
      message: "Synthetic post-ready Three device loss.",
      reason: "unknown",
    });
    await expect(lease.invalidated).resolves.toEqual({
      code: "WEBGPU_DEVICE_LOST",
      message: "Synthetic post-ready Three device loss.",
      reason: "unknown",
      diagnostics: {
        deviceLossMessage: "Synthetic post-ready Three device loss.",
        deviceLossReason: "unknown",
      },
    });
    expect(previousOnDeviceLost).toHaveBeenCalledTimes(1);
    expect(previousOnDeviceLost.mock.instances[0]).toBe(renderer);

    const overlappingRun = prepareRealWater({
      manifest,
      loading: new RecordingLoadingPresenter(),
      host: createThreeHostLifecycleAdapter({ renderer, scene, camera }),
    });
    await expect(overlappingRun.ready).rejects.toMatchObject({
      code: "PREWARM_FAILED",
      message: "The Host renderer already owns an active Open Water Domain.",
    });
    expect(scene.children).toHaveLength(1);
    expect(renderer.init).toHaveBeenCalledTimes(1);

    const firstDisposal = lease.dispose();
    expect(lease.dispose()).toBe(firstDisposal);
    await firstDisposal;

    expect(scene.children).toHaveLength(0);
    expect(renderer.onDeviceLost).toBe(previousOnDeviceLost);
    expect(renderer.dispose).not.toHaveBeenCalled();

    const replacementRun = prepareRealWater({
      manifest,
      loading: new RecordingLoadingPresenter(),
      host: createThreeHostLifecycleAdapter({ renderer, scene, camera }),
    });
    const replacementLease = await replacementRun.ready;
    expect(scene.children).toHaveLength(1);
    const hostReplacementOnDeviceLost = vi.fn();
    renderer.onDeviceLost = hostReplacementOnDeviceLost;
    await replacementLease.dispose();
    expect(scene.children).toHaveLength(0);
    expect(renderer.onDeviceLost).toBe(hostReplacementOnDeviceLost);
  });

  it("rejects a drawing-buffer mismatch before compile or water allocation", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    const renderer = {
      autoClear: true,
      backend: {
        device: {
          limits: coreDeviceLimits(),
        },
      },
      compileAsync: vi.fn(async () => {}),
      computeAsync: vi.fn(async () => {}),
      clear: vi.fn(),
      contextNode: null,
      coordinateSystem: 2_001,
      dispose: vi.fn(),
      getActiveCubeFace: vi.fn(() => 0),
      getClearAlpha: vi.fn(() => 1),
      getClearColor: vi.fn(
        (color: { r: number; g: number; b: number }) => color,
      ),
      getActiveMipmapLevel: vi.fn(() => 0),
      getDrawingBufferSize: vi.fn(
        (target: { width: number; height: number }) => {
          target.width = 64;
          target.height = 32;
          return target;
        },
      ),
      getMRT: vi.fn(() => null),
      getRenderTarget: vi.fn(() => null),
      hasFeature: vi.fn((name: string) => name === "core-features-and-limits"),
      init: vi.fn(async () => {}),
      initTexture: vi.fn(),
      onDeviceLost: vi.fn(),
      opaque: true,
      outputColorSpace: "srgb",
      readRenderTargetPixelsAsync: vi.fn(async () => new Uint8Array(4)),
      render: vi.fn(),
      setClearColor: vi.fn(),
      setMRT: vi.fn(),
      setRenderTarget: vi.fn(),
      toneMapping: 0,
      transparent: false,
      xr: { enabled: false },
      getRenderObjectFunction: vi.fn(() => null),
      setRenderObjectFunction: vi.fn(),
      getScissorTest: vi.fn(() => false),
      setScissorTest: vi.fn(),
      getPixelRatio: vi.fn(() => 1),
      setPixelRatio: vi.fn(),
      initRenderTarget: vi.fn(),
      copyTextureToTexture: vi.fn(),
    };
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(
        createMinimalWaterQualityProfile(),
        { width: 320, height: 180 },
      ),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({ renderer, scene, camera }),
    });

    await expect(run.ready).rejects.toThrow(
      "The Three Host drawing buffer does not match the Prewarm Manifest.",
    );
    expect(renderer.init).toHaveBeenCalledTimes(1);
    expect(renderer.compileAsync).not.toHaveBeenCalled();
    expect(renderer.initTexture).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
    expect(scene.children).toHaveLength(0);
  });

  it("rejects a borrowed camera that already has an enabled tiled view offset", async () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.setViewOffset(1920, 1080, 0, 0, 960, 1080);
    const renderer = createCapableRenderer();
    const scene = new Scene();
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
      }),
    });

    await expect(run.ready).rejects.toThrow(
      "The Three Host Adapter refuses a camera that already has a tiled view offset.",
    );
    expect(renderer.init).not.toHaveBeenCalled();
    expect(scene.children).toHaveLength(0);
    expect(camera.view?.enabled).toBe(true);
  });

  it("rejects an orthographic camera at Host preparation", async () => {
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer: createCapableRenderer(),
        scene: new Scene(),
        camera: new OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
      }),
    });

    await expect(run.ready).rejects.toThrow(
      "The Three Host Adapter requires a perspective camera for the basic optical path.",
    );
  });

  it("keeps Host Environment Adapter textures owned by the Host after disposal", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    const environment = createTestEnvironment();
    const environmentDispose = vi.spyOn(
      environment.texture as { dispose(): void },
      "dispose",
    );
    const renderer = {
      autoClear: true,
      backend: {
        device: {
          limits: coreDeviceLimits(),
        },
      },
      compileAsync: vi.fn(async () => {}),
      computeAsync: vi.fn(async () => {}),
      clear: vi.fn(),
      contextNode: null,
      coordinateSystem: 2_001,
      dispose: vi.fn(),
      getActiveCubeFace: vi.fn(() => 0),
      getClearAlpha: vi.fn(() => 1),
      getClearColor: vi.fn(
        (color: { r: number; g: number; b: number }) => color,
      ),
      getActiveMipmapLevel: vi.fn(() => 0),
      getDrawingBufferSize: mockDrawingBufferSize(),
      getMRT: vi.fn(() => null),
      getRenderTarget: vi.fn(() => null),
      hasFeature: vi.fn((name: string) => name === "core-features-and-limits"),
      init: vi.fn(async () => {}),
      initTexture: vi.fn(),
      onDeviceLost: vi.fn(),
      opaque: true,
      outputColorSpace: "srgb",
      readRenderTargetPixelsAsync: vi.fn(async () => new Uint8Array(4)),
      render: vi.fn(),
      setClearColor: vi.fn(),
      setMRT: vi.fn(),
      setRenderTarget: vi.fn(),
      toneMapping: 0,
      transparent: false,
      xr: { enabled: false },
      getRenderObjectFunction: vi.fn(() => null),
      setRenderObjectFunction: vi.fn(),
      getScissorTest: vi.fn(() => false),
      setScissorTest: vi.fn(),
      getPixelRatio: vi.fn(() => 1),
      setPixelRatio: vi.fn(),
      initRenderTarget: vi.fn(),
      copyTextureToTexture: vi.fn(),
    };
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        environment,
      }),
    }).ready;

    const texture = environment.texture as DataTexture;
    const expectedBytes = createSupportedHostEnvironmentRadianceBytes();
    expect(renderer.initTexture).toHaveBeenCalledWith(environment.texture);
    expect(renderer.initTexture).toHaveBeenCalledTimes(5);
    expect(Array.from(texture.image.data)).toEqual(Array.from(expectedBytes));
    expect(texture.name).toBe("test-environment-radiance");
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(ClampToEdgeWrapping);
    expect(texture.magFilter).toBe(NearestFilter);
    expect(texture.minFilter).toBe(NearestFilter);
    expect(texture.generateMipmaps).toBe(false);
    await lease.dispose();
    expect(environmentDispose).not.toHaveBeenCalled();
    expect(Array.from(texture.image.data)).toEqual(Array.from(expectedBytes));
    expect(texture.name).toBe("test-environment-radiance");
    expect(texture.wrapS).toBe(RepeatWrapping);
  });

  it("samples the Host Environment Adapter instead of scene.environment", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    const decoy = new DataTexture(Uint8Array.from([255, 0, 0, 255]), 1, 1);
    decoy.name = "scene-environment-decoy";
    decoy.needsUpdate = true;
    scene.environment = decoy;
    const environment = createTestEnvironment();
    const renderer = {
      autoClear: true,
      backend: {
        device: {
          limits: coreDeviceLimits(),
        },
      },
      compileAsync: vi.fn(async () => {}),
      computeAsync: vi.fn(async () => {}),
      clear: vi.fn(),
      contextNode: null,
      coordinateSystem: 2_001,
      dispose: vi.fn(),
      getActiveCubeFace: vi.fn(() => 0),
      getClearAlpha: vi.fn(() => 1),
      getClearColor: vi.fn(
        (color: { r: number; g: number; b: number }) => color,
      ),
      getActiveMipmapLevel: vi.fn(() => 0),
      getDrawingBufferSize: mockDrawingBufferSize(),
      getMRT: vi.fn(() => null),
      getRenderTarget: vi.fn(() => null),
      hasFeature: vi.fn((name: string) => name === "core-features-and-limits"),
      init: vi.fn(async () => {}),
      initTexture: vi.fn(),
      onDeviceLost: vi.fn(),
      opaque: true,
      outputColorSpace: "srgb",
      readRenderTargetPixelsAsync: vi.fn(async () => new Uint8Array(4)),
      render: vi.fn(),
      setClearColor: vi.fn(),
      setMRT: vi.fn(),
      setRenderTarget: vi.fn(),
      toneMapping: 0,
      transparent: false,
      xr: { enabled: false },
      getRenderObjectFunction: vi.fn(() => null),
      setRenderObjectFunction: vi.fn(),
      getScissorTest: vi.fn(() => false),
      setScissorTest: vi.fn(),
      getPixelRatio: vi.fn(() => 1),
      setPixelRatio: vi.fn(),
      initRenderTarget: vi.fn(),
      copyTextureToTexture: vi.fn(),
    };
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        environment,
      }),
    }).ready;

    expect(renderer.initTexture).toHaveBeenCalledWith(environment.texture);
    expect(renderer.initTexture).not.toHaveBeenCalledWith(decoy);
    await lease.dispose();
  });

  it("fails closed when Host Environment Adapter textures are not textures", async () => {
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer: {
          coordinateSystem: 2_001,
          copyTextureToTexture: vi.fn(),
          hasFeature: vi.fn((name: string) =>
            ["core-features-and-limits"].includes(name),
          ),
          init: vi.fn(async () => {}),
          onDeviceLost: vi.fn(),
          backend: {
            device: {
              limits: coreDeviceLimits(),
            },
          },
        },
        scene: new Scene(),
        camera: new PerspectiveCamera(),
        environment: createStaticHostEnvironmentAdapter(
          createTestEnvironmentReflection({ isTexture: false }),
          TEST_ENVIRONMENT_STATE,
        ),
      }),
    });

    await expect(run.ready).rejects.toMatchObject({
      message:
        "The Host environment radiance must be a Host-owned Three texture.",
    });
  });

  it("rejects a borrowed environment texture whose size does not match the descriptor", async () => {
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer: createCapableRenderer(),
        scene: new Scene(),
        camera: new PerspectiveCamera(),
        environment: createStaticHostEnvironmentAdapter(
          createTestEnvironmentReflection(createTestEnvironmentTexture(2, 2)),
          TEST_ENVIRONMENT_STATE,
        ),
      }),
    });

    await expect(run.ready).rejects.toThrow(
      "The Host environment radiance texture does not match its reflection descriptor.",
    );
  });

  it("rejects a borrowed cube texture when the prepared radiance is equirect", async () => {
    const cube = createTestEnvironmentTexture();
    (cube as { isCubeTexture: boolean }).isCubeTexture = true;
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer: createCapableRenderer(),
        scene: new Scene(),
        camera: new PerspectiveCamera(),
        environment: createStaticHostEnvironmentAdapter(
          createTestEnvironmentReflection(cube),
          TEST_ENVIRONMENT_STATE,
        ),
      }),
    });

    await expect(run.ready).rejects.toThrow(
      "The Host environment radiance texture does not match its reflection descriptor.",
    );
  });

  it("applies Host environment scalar changes on a later frame without recompiling", async () => {
    const lighting = { ...TEST_ENVIRONMENT_STATE };
    const environment = createStaticHostEnvironmentAdapter(
      createTestEnvironmentReflection(createTestEnvironmentTexture()),
      lighting,
    );
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    const initialRenderTarget = Object.freeze({ name: "host-target" });
    let currentRenderTarget: unknown = initialRenderTarget;
    const renderer = {
      autoClear: true,
      backend: {
        device: {
          limits: coreDeviceLimits(),
        },
      },
      compileAsync: vi.fn(async () => {}),
      computeAsync: vi.fn(async () => {}),
      clear: vi.fn(),
      contextNode: null,
      coordinateSystem: 2_001,
      dispose: vi.fn(),
      getActiveCubeFace: vi.fn(() => 0),
      getClearAlpha: vi.fn(() => 1),
      getClearColor: vi.fn(
        (color: { r: number; g: number; b: number }) => color,
      ),
      getActiveMipmapLevel: vi.fn(() => 0),
      getDrawingBufferSize: mockDrawingBufferSize(),
      getMRT: vi.fn(() => null),
      getRenderTarget: vi.fn(() => currentRenderTarget),
      hasFeature: vi.fn((name: string) => name === "core-features-and-limits"),
      init: vi.fn(async () => {}),
      initTexture: vi.fn(),
      onDeviceLost: vi.fn(),
      opaque: true,
      outputColorSpace: "srgb",
      readRenderTargetPixelsAsync: vi.fn(async () => new Uint8Array(4)),
      render: vi.fn(),
      setClearColor: vi.fn(),
      setMRT: vi.fn(),
      setRenderTarget: vi.fn((target: unknown) => {
        currentRenderTarget = target;
      }),
      toneMapping: 0,
      transparent: false,
      xr: { enabled: false },
      getRenderObjectFunction: vi.fn(() => null),
      setRenderObjectFunction: vi.fn(),
      getScissorTest: vi.fn(() => false),
      setScissorTest: vi.fn(),
      getPixelRatio: vi.fn(() => 1),
      setPixelRatio: vi.fn(),
      initRenderTarget: vi.fn(),
      copyTextureToTexture: vi.fn(),
    };
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        environment,
      }),
    }).ready;

    const preparedChildren = [...scene.children];
    const compileCalls = renderer.compileAsync.mock.calls.length;
    const probeCalls = renderer.readRenderTargetPixelsAsync.mock.calls.length;
    const renderCalls = renderer.render.mock.calls.length;

    lighting.sunIntensity = 0;
    lighting.environmentIntensity = 0.25;
    expect(environment.snapshot()).toMatchObject({
      sunIntensity: 0,
      environmentIntensity: 0.25,
    });
    renderer.render(scene, camera);

    expect(renderer.compileAsync).toHaveBeenCalledTimes(compileCalls);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(
      probeCalls,
    );
    expect(renderer.render).toHaveBeenCalledTimes(renderCalls + 1);
    expect(scene.children).toEqual(preparedChildren);
    await lease.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("rejects a borrowed environment texture whose color space does not match", async () => {
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer: createCapableRenderer(),
        scene: new Scene(),
        camera: new PerspectiveCamera(),
        environment: createStaticHostEnvironmentAdapter(
          createTestEnvironmentReflection(
            createTestEnvironmentTexture(8, 4, LinearSRGBColorSpace),
          ),
          TEST_ENVIRONMENT_STATE,
        ),
      }),
    });

    await expect(run.ready).rejects.toThrow(
      "The Host environment radiance texture does not match its reflection descriptor.",
    );
  });

  it("cleans partial water resources when progress presentation fails", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    let currentRenderTarget: unknown = null;
    const renderer = {
      autoClear: true,
      backend: {
        device: {
          limits: coreDeviceLimits(),
        },
      },
      compileAsync: vi.fn(async () => {}),
      computeAsync: vi.fn(async () => {}),
      clear: vi.fn(),
      contextNode: null,
      coordinateSystem: 2_001,
      dispose: vi.fn(),
      getActiveCubeFace: vi.fn(() => 0),
      getClearAlpha: vi.fn(() => 1),
      getClearColor: vi.fn(
        (color: { r: number; g: number; b: number }) => color,
      ),
      getActiveMipmapLevel: vi.fn(() => 0),
      getDrawingBufferSize: mockDrawingBufferSize(),
      getMRT: vi.fn(() => null),
      getRenderTarget: vi.fn(() => currentRenderTarget),
      hasFeature: vi.fn((name: string) => name === "core-features-and-limits"),
      init: vi.fn(async () => {}),
      initTexture: vi.fn(),
      onDeviceLost: vi.fn(),
      opaque: true,
      outputColorSpace: "srgb",
      readRenderTargetPixelsAsync: vi.fn(async () => new Uint8Array(4)),
      render: vi.fn(),
      setClearColor: vi.fn(),
      setMRT: vi.fn(),
      setRenderTarget: vi.fn((target: unknown) => {
        currentRenderTarget = target;
      }),
      toneMapping: 0,
      transparent: false,
      xr: { enabled: false },
      getRenderObjectFunction: vi.fn(() => null),
      setRenderObjectFunction: vi.fn(),
      getScissorTest: vi.fn(() => false),
      setScissorTest: vi.fn(),
      getPixelRatio: vi.fn(() => 1),
      setPixelRatio: vi.fn(),
      initRenderTarget: vi.fn(),
      copyTextureToTexture: vi.fn(),
    };
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: {
        present(snapshot) {
          if (
            snapshot.status === "preparing" &&
            snapshot.progress.lastCompleted?.id === "water-material"
          ) {
            throw new Error("Synthetic progress presentation failure.");
          }
        },
      },
      host: createThreeHostLifecycleAdapter({ renderer, scene, camera }),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "LOADING_PRESENTER_FAILED",
    });
    expect(scene.children).toHaveLength(0);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(2);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(14);
    expect(renderer.dispose).not.toHaveBeenCalled();
  });

  it("rejects the initialized WebGL fallback without disposing the Host renderer", async () => {
    const renderer = {
      coordinateSystem: 2_000,
      copyTextureToTexture: vi.fn(),
      dispose: vi.fn(),
      hasFeature: vi.fn(() => false),
      init: vi.fn(async () => {}),
      onDeviceLost: vi.fn(),
    };
    const loading = new RecordingLoadingPresenter();
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading,
      host: createTestThreeHostLifecycleAdapter(renderer),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "CORE_WEBGPU_REQUIRED",
      diagnostics: {
        requiredBackend: "core-webgpu",
        selectedBackend: "webgl2",
      },
      phase: "host-compatibility",
    });
    expect(renderer.init).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(
      loading.snapshots.some((snapshot) => snapshot.status === "ready"),
    ).toBe(false);
  });

  it("rejects Compatibility Mode reported by the initialized Three renderer", async () => {
    const renderer = {
      coordinateSystem: 2_001,
      copyTextureToTexture: vi.fn(),
      hasFeature: vi.fn((name: string) => name !== "core-features-and-limits"),
      init: vi.fn(async () => {}),
      onDeviceLost: vi.fn(),
    };
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createTestThreeHostLifecycleAdapter(renderer),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "WEBGPU_COMPATIBILITY_MODE_UNSUPPORTED",
      diagnostics: {
        requiredFeatureLevel: "core",
        selectedFeatureLevel: "compatibility",
      },
      phase: "host-compatibility",
    });
    expect(renderer.hasFeature).toHaveBeenCalledWith(
      "core-features-and-limits",
    );
  });

  it("rejects missing limits observed from the initialized Three device", async () => {
    const renderer = {
      backend: {
        device: {
          limits: coreDeviceLimits({
            maxStorageBufferBindingSize: 67_108_864,
          }),
        },
      },
      coordinateSystem: 2_001,
      copyTextureToTexture: vi.fn(),
      hasFeature: vi.fn((name: string) => name === "core-features-and-limits"),
      init: vi.fn(async () => {}),
      onDeviceLost: vi.fn(),
    };
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createTestThreeHostLifecycleAdapter(renderer),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "WEBGPU_LIMIT_UNSUPPORTED",
      diagnostics: {
        actualLimit: 67_108_864,
        limitName: "maxStorageBufferBindingSize",
        missingLimitCount: 1,
        requiredLimit: 134_217_728,
      },
      phase: "host-compatibility",
    });
  });

  it("rejects a Core device below eight color attachments", async () => {
    const renderer = {
      backend: {
        device: {
          limits: coreDeviceLimits({
            maxColorAttachments: 7,
          }),
        },
      },
      coordinateSystem: 2_001,
      copyTextureToTexture: vi.fn(),
      hasFeature: vi.fn((name: string) => name === "core-features-and-limits"),
      init: vi.fn(async () => {}),
      onDeviceLost: vi.fn(),
    };
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createTestThreeHostLifecycleAdapter(renderer),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "WEBGPU_LIMIT_UNSUPPORTED",
      diagnostics: {
        actualLimit: 7,
        limitName: "maxColorAttachments",
        missingLimitCount: 1,
        requiredLimit: 8,
      },
      phase: "host-compatibility",
    });
  });

  it("rejects a Core device below 32 color-attachment bytes per sample", async () => {
    const renderer = {
      backend: {
        device: {
          limits: coreDeviceLimits({
            maxColorAttachmentBytesPerSample: 28,
          }),
        },
      },
      coordinateSystem: 2_001,
      copyTextureToTexture: vi.fn(),
      hasFeature: vi.fn((name: string) => name === "core-features-and-limits"),
      init: vi.fn(async () => {}),
      onDeviceLost: vi.fn(),
    };
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createTestThreeHostLifecycleAdapter(renderer),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "WEBGPU_LIMIT_UNSUPPORTED",
      diagnostics: {
        actualLimit: 28,
        limitName: "maxColorAttachmentBytesPerSample",
        missingLimitCount: 1,
        requiredLimit: 32,
      },
      phase: "host-compatibility",
    });
  });

  it("reports device loss raised during Three renderer initialization", async () => {
    const previousOnDeviceLost = vi.fn();
    const renderer = {
      backend: {
        device: {
          limits: coreDeviceLimits(),
        },
      },
      coordinateSystem: 2_001,
      copyTextureToTexture: vi.fn(),
      hasFeature: vi.fn(() => true),
      async init() {
        this.onDeviceLost({
          message: "Synthetic Three device loss.",
          reason: "unknown",
        });
      },
      onDeviceLost: previousOnDeviceLost,
    };
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createTestThreeHostLifecycleAdapter(renderer),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "WEBGPU_DEVICE_LOST",
      diagnostics: {
        deviceLossMessage: "Synthetic Three device loss.",
        deviceLossReason: "unknown",
      },
      phase: "host-compatibility",
    });
    expect(previousOnDeviceLost).toHaveBeenCalledTimes(1);
    expect(previousOnDeviceLost.mock.instances[0]).toBe(renderer);
    expect(renderer.onDeviceLost).toBe(previousOnDeviceLost);
  });

  it("fails promptly and cleans late resources when the device is lost during prewarm", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const initialRenderTarget = Object.freeze({ name: "host-target" });
    let currentRenderTarget: unknown = initialRenderTarget;
    let releaseReadback: ((pixels: Uint8Array) => void) | undefined;
    const pendingReadback = new Promise<Uint8Array>((resolve) => {
      releaseReadback = resolve;
    });
    let readbackCount = 0;
    const previousOnDeviceLost = vi.fn();
    const renderer = {
      autoClear: true,
      backend: {
        device: {
          limits: coreDeviceLimits(),
        },
      },
      compileAsync: vi.fn(async () => {}),
      computeAsync: vi.fn(async () => {}),
      clear: vi.fn(),
      contextNode: null,
      coordinateSystem: 2_001,
      dispose: vi.fn(),
      getActiveCubeFace: vi.fn(() => 0),
      getClearAlpha: vi.fn(() => 1),
      getClearColor: vi.fn(
        (color: { r: number; g: number; b: number }) => color,
      ),
      getActiveMipmapLevel: vi.fn(() => 0),
      getDrawingBufferSize: mockDrawingBufferSize(),
      getMRT: vi.fn(() => null),
      getRenderTarget: vi.fn(() => currentRenderTarget),
      hasFeature: vi.fn((name: string) => name === "core-features-and-limits"),
      init: vi.fn(async () => {}),
      initTexture: vi.fn(),
      onDeviceLost: previousOnDeviceLost,
      opaque: true,
      outputColorSpace: "srgb",
      readRenderTargetPixelsAsync: vi.fn(() => {
        readbackCount += 1;
        return readbackCount === 1
          ? pendingReadback
          : Promise.resolve(new Uint8Array(4));
      }),
      render: vi.fn(),
      setClearColor: vi.fn(),
      setMRT: vi.fn(),
      setRenderTarget: vi.fn((target: unknown) => {
        currentRenderTarget = target;
      }),
      toneMapping: 0,
      transparent: false,
      xr: { enabled: false },
      getRenderObjectFunction: vi.fn(() => null),
      setRenderObjectFunction: vi.fn(),
      getScissorTest: vi.fn(() => false),
      setScissorTest: vi.fn(),
      getPixelRatio: vi.fn(() => 1),
      setPixelRatio: vi.fn(),
      initRenderTarget: vi.fn(),
      copyTextureToTexture: vi.fn(),
    };
    const loading = new RecordingLoadingPresenter();
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading,
      host: createThreeHostLifecycleAdapter({ renderer, scene, camera }),
    });

    await vi.waitFor(() => {
      expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(1);
    });
    renderer.onDeviceLost({
      message: "Synthetic device loss during prewarm.",
      reason: "unknown",
    });
    const promptOutcome = await Promise.race([
      run.ready.then(
        () => ({ status: "ready" as const }),
        (error: unknown) => ({ status: "failed" as const, error }),
      ),
      new Promise<Readonly<{ status: "timeout" }>>((resolve) => {
        setTimeout(() => resolve({ status: "timeout" }), 100);
      }),
    ]);

    expect(promptOutcome).toMatchObject({
      status: "failed",
      error: {
        code: "WEBGPU_DEVICE_LOST",
        diagnostics: {
          deviceLossMessage: "Synthetic device loss during prewarm.",
          deviceLossReason: "unknown",
        },
      },
    });
    expect(scene.children).toHaveLength(0);
    expect(currentRenderTarget).toBe(initialRenderTarget);
    expect(previousOnDeviceLost).toHaveBeenCalledTimes(1);
    expect(previousOnDeviceLost.mock.instances[0]).toBe(renderer);
    expect(renderer.onDeviceLost).toBe(previousOnDeviceLost);
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(
      loading.snapshots.some((snapshot) => snapshot.status === "ready"),
    ).toBe(false);

    const replacementRun = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createThreeHostLifecycleAdapter({ renderer, scene, camera }),
    });
    const replacementLease = await replacementRun.ready;
    expect(scene.children).toHaveLength(1);
    const restorationCallsBeforeReadbackSettles =
      renderer.setRenderTarget.mock.calls.length;

    releaseReadback?.(new Uint8Array(4));
    await pendingReadback;
    await run.ready.catch(() => {});
    expect(scene.children).toHaveLength(1);
    expect(renderer.setRenderTarget).toHaveBeenCalledTimes(
      restorationCallsBeforeReadbackSettles,
    );
    await replacementLease.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("reports a structured retryable renderer initialization failure", async () => {
    const renderer = {
      coordinateSystem: 2_001,
      copyTextureToTexture: vi.fn(),
      hasFeature: vi.fn(() => true),
      init: vi.fn(async () => {
        throw new Error("Synthetic renderer initialization failure.");
      }),
      onDeviceLost: vi.fn(),
    };
    const loading = new RecordingLoadingPresenter();
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading,
      host: createTestThreeHostLifecycleAdapter(renderer),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "RENDERER_INITIALIZATION_FAILED",
      diagnostics: {
        initializationMessage: "Synthetic renderer initialization failure.",
      },
      message: "Three r185 renderer initialization failed.",
      phase: "host-compatibility",
      retryable: true,
    });
    expect(loading.snapshots.at(-1)?.status).toBe("failed");
  });

  it("presents through the bound Core Host route without ready-frame compile or probe", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.updateProjectionMatrix();
    const hostProjection = camera.projectionMatrix.clone();
    const simulation = createMutableSimulationAdapter();
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const manifest = createMinimalWaterPrewarmManifest();
    const lease = await prepareRealWater({
      manifest,
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        simulation,
        presentation,
      }),
    }).ready;

    expect(lease).not.toHaveProperty("present");
    expect(renderer.compileAsync).toHaveBeenCalledTimes(2);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(29);
    expect(renderer.render).toHaveBeenCalledTimes(129);
    expect(presentation.route).toBeDefined();

    const first = readHostPresentedFrame(await presentation.present());
    const second = readHostPresentedFrame(await presentation.present());
    expect(first).toMatchObject({
      presentationId: 1,
      manifestHash: manifest.manifestHash,
      seed: 0,
      tick: 0,
      timeSeconds: 0,
      simulationResetRevision: 0,
      controlRevision: 0,
      originRevision: 0,
      cameraCutRevision: 0,
      seaStateCutRevision: 0,
      temporal: {
        historyEpoch: 1,
        resetReason: null,
        resetFrame: false,
      },
    });
    expect(second.presentationId).toBe(2);
    expect(second.temporal.historyEpoch).toBe(1);
    expect(second.temporal.resetReason).toBeNull();
    expect(renderer.compileAsync).toHaveBeenCalledTimes(2);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(29);

    simulation.assign({ tick: 8, timeSeconds: 8 / 60, paused: false });
    const continuousTick = readHostPresentedFrame(await presentation.present());
    expect(continuousTick).toMatchObject({
      presentationId: 3,
      tick: 8,
      temporal: {
        historyEpoch: 1,
        resetReason: null,
        resetFrame: false,
      },
    });

    lease.updateArtisticControls({
      ...lease.inspectRuntime().artisticControls,
      waveStrength: 2,
    });
    const continuousControl = readHostPresentedFrame(
      await presentation.present(),
    );
    expect(continuousControl).toMatchObject({
      controlRevision: 1,
      seaStateCutRevision: 0,
      temporal: {
        historyEpoch: 1,
        resetReason: null,
        resetFrame: false,
      },
    });

    presentation.incrementCameraCut();
    const cameraCut = readHostPresentedFrame(await presentation.present());
    expect(cameraCut).toMatchObject({
      cameraCutRevision: 1,
      temporal: {
        historyEpoch: 2,
        resetReason: "camera-cut",
        resetFrame: true,
      },
    });
    const afterCameraCut = readHostPresentedFrame(await presentation.present());
    expect(afterCameraCut.temporal).toEqual({
      historyEpoch: 2,
      resetReason: null,
      resetFrame: false,
    });

    simulation.assign({ originX: 12, originZ: -4 });
    const originShift = readHostPresentedFrame(await presentation.present());
    expect(originShift).toMatchObject({
      originRevision: 1,
      temporal: {
        historyEpoch: 3,
        resetReason: "origin-shift",
        resetFrame: true,
      },
    });

    lease.updateArtisticControls(lease.inspectRuntime().artisticControls, {
      transition: "sea-state-cut",
    });
    const seaStateCut = readHostPresentedFrame(await presentation.present());
    expect(seaStateCut).toMatchObject({
      seaStateCutRevision: 1,
      temporal: {
        historyEpoch: 4,
        resetReason: "sea-state-cut",
        resetFrame: true,
      },
    });

    simulation.assign({ seed: 7 });
    const seedReset = readHostPresentedFrame(await presentation.present());
    expect(seedReset).toMatchObject({
      temporal: {
        historyEpoch: 5,
        resetReason: "simulation-reset",
        resetFrame: true,
      },
    });

    simulation.assign({ tick: 2, timeSeconds: 2 / 60 });
    const rewind = readHostPresentedFrame(await presentation.present());
    expect(rewind).toMatchObject({
      tick: 2,
      temporal: {
        historyEpoch: 6,
        resetReason: "simulation-reset",
        resetFrame: true,
      },
    });

    simulation.assign({ timeSeconds: 1 / 60 });
    const timeRewind = readHostPresentedFrame(await presentation.present());
    expect(timeRewind).toMatchObject({
      tick: 2,
      temporal: {
        historyEpoch: 7,
        resetReason: "simulation-reset",
        resetFrame: true,
      },
    });

    const [queuedFirst, queuedSecond] = await Promise.all([
      presentation.present(),
      presentation.present(),
    ]);
    expect(queuedFirst.presentationId + 1).toBe(queuedSecond.presentationId);

    expect(renderer.compileAsync).toHaveBeenCalledTimes(2);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(29);
    expect(camera.view).toBeNull();
    expect(camera.projectionMatrix.equals(hostProjection)).toBe(true);
    expect(scene.children).toHaveLength(1);

    renderer.getDrawingBufferSize.mockImplementation(
      (target: { width: number; height: number }) => {
        target.width = 64;
        target.height = 32;
        return target;
      },
    );
    await expect(presentation.present()).rejects.toThrow(
      "The Three Host drawing buffer does not match the Prewarm Manifest.",
    );
    renderer.getDrawingBufferSize.mockImplementation(mockDrawingBufferSize());
    const recovered = readHostPresentedFrame(await presentation.present());
    expect(recovered.presentationId).toBe(queuedSecond.presentationId + 1);

    const boundRoute = presentation.route as HostPresentationRoute;
    await lease.dispose();
    await expect(boundRoute.present()).rejects.toThrow(/unbound/i);
    expect(scene.children).toHaveLength(0);
  });

  it("serializes queued presents at concurrency 1 and restores full Host state", async () => {
    const scene = new Scene();
    scene.name = "host-scene";
    const hostOverride = Object.freeze({ name: "host-override" });
    scene.overrideMaterial = hostOverride as never;
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.layers.mask = 7;
    camera.updateProjectionMatrix();
    const hostProjection = camera.projectionMatrix.clone();
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const hostTarget = Object.freeze({ name: "live-host-target" });
    const hostMrt = Object.freeze({ name: "host-mrt" });
    const hostContext = Object.freeze({ name: "host-context" });
    renderer.autoClear = false;
    renderer.toneMapping = 4;
    renderer.outputColorSpace = "srgb-linear";
    renderer.transparent = true;
    renderer.opaque = false;
    renderer.contextNode = hostContext;
    renderer.xr.enabled = true;
    renderer.getMRT.mockReturnValue(hostMrt);
    renderer.getActiveCubeFace.mockReturnValue(3);
    renderer.getActiveMipmapLevel.mockReturnValue(2);
    renderer.setRenderTarget(hostTarget, 3, 2);
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;

    const sizeCallsAtReady = renderer.getDrawingBufferSize.mock.calls.length;
    const first = presentation.present();
    const second = presentation.present();
    const [firstFrame, secondFrame] = await Promise.all([first, second]);
    expect(secondFrame.presentationId).toBe(firstFrame.presentationId + 1);
    expect(renderer.getDrawingBufferSize.mock.calls.length).toBe(
      sizeCallsAtReady + 8,
    );

    expect(renderer.autoClear).toBe(false);
    expect(renderer.toneMapping).toBe(4);
    expect(renderer.outputColorSpace).toBe("srgb-linear");
    expect(renderer.transparent).toBe(true);
    expect(renderer.opaque).toBe(false);
    expect(renderer.contextNode).toBe(hostContext);
    expect(renderer.xr.enabled).toBe(true);
    expect(renderer.setMRT).toHaveBeenLastCalledWith(hostMrt);
    expect(renderer.getRenderTarget()).toBe(hostTarget);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(hostTarget, 3, 2);
    expect(scene.name).toBe("host-scene");
    expect(scene.overrideMaterial).toBe(hostOverride);
    expect(camera.layers.mask).toBe(7);
    expect(camera.view).toBeNull();
    expect(camera.projectionMatrix.equals(hostProjection)).toBe(true);

    renderer.render.mockImplementationOnce(() => {
      throw new Error("Synthetic present failure.");
    });
    await expect(presentation.present()).rejects.toThrow(
      "Synthetic present failure.",
    );
    expect(renderer.autoClear).toBe(false);
    expect(renderer.getRenderTarget()).toBe(hostTarget);
    expect(scene.name).toBe("host-scene");
    expect(camera.layers.mask).toBe(7);
    await expect(presentation.present()).rejects.toThrow(/unbound/i);
    await lease.dispose();
  });

  it("reuses prewarmed render-target identities on repeated ready presents", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;

    const targetsAtReady = new Set(
      renderer.setRenderTarget.mock.calls.map((call) => call[0]),
    );
    const compileAtReady = renderer.compileAsync.mock.calls.length;
    const probeAtReady = renderer.readRenderTargetPixelsAsync.mock.calls.length;
    const initAtReady = renderer.initTexture.mock.calls.length;

    await presentation.present();
    await presentation.present();

    for (const call of renderer.setRenderTarget.mock.calls) {
      const target = call[0];
      if (target !== null && target !== undefined) {
        expect(targetsAtReady.has(target)).toBe(true);
      }
    }
    expect(renderer.compileAsync).toHaveBeenCalledTimes(compileAtReady);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(
      probeAtReady,
    );
    expect(renderer.initTexture).toHaveBeenCalledTimes(initAtReady);
    expect(scene.children).toHaveLength(1);
    await lease.dispose();
  });

  it("drains an in-flight Core present before destroying Host resources", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;

    const order: string[] = [];
    const originalRemove = scene.remove.bind(scene);
    scene.remove = ((object: Parameters<Scene["remove"]>[0]) => {
      order.push("destroy");
      return originalRemove(object);
    }) as Scene["remove"];
    renderer.render.mockImplementation(() => {
      order.push("render");
    });

    const presentP = readHostDiagnosticsRoute(
      presentation.route as HostPresentationRoute,
    ).present({
      outputs: ["final-color"],
    });
    await Promise.resolve();
    order.push("dispose-start");
    const disposeP = lease.dispose();
    const overlappingPrepare = createThreeHostLifecycleAdapter({
      renderer,
      scene,
      camera,
    }).prepare({
      manifest: createMinimalWaterPrewarmManifest(),
      progress: { complete: async () => {} },
      signal: new AbortController().signal,
    });
    await expect(overlappingPrepare).rejects.toThrow(
      "The Host renderer already owns an active Open Water Domain.",
    );
    await presentP;
    await disposeP;
    expect(order.includes("render")).toBe(true);
    expect(order.includes("dispose-start")).toBe(true);
    expect(order.indexOf("dispose-start")).toBeLessThan(
      order.indexOf("render"),
    );
    expect(order.indexOf("render")).toBeLessThan(order.lastIndexOf("destroy"));
    expect(order.at(-1)).toBe("destroy");
    expect(scene.children).toHaveLength(0);
  });

  it("keeps the first live diagnostics reset on the prewarmed history epoch", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    const simulation = createMutableSimulationAdapter();
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        simulation,
        presentation,
      }),
    }).ready;

    simulation.assign({ simulationResetRevision: 1 });
    const first = readHostDiagnosticsPresentedFrame(
      await readHostDiagnosticsRoute(
        presentation.route as HostPresentationRoute,
      ).present({
        outputs: [],
      }),
    );
    expect(first.simulationResetRevision).toBe(1);
    expect(first.seed).toBe(0);
    expect(first.timeSeconds).toBe(0);
    expect(first.temporal).toEqual({
      historyEpoch: 1,
      resetReason: "simulation-reset",
      resetFrame: true,
    });
    simulation.assign({ simulationResetRevision: 2 });
    const second = readHostDiagnosticsPresentedFrame(
      await readHostDiagnosticsRoute(
        presentation.route as HostPresentationRoute,
      ).present({
        outputs: [],
      }),
    );
    expect(second.simulationResetRevision).toBe(2);
    expect(second.temporal).toEqual({
      historyEpoch: 2,
      resetReason: "simulation-reset",
      resetFrame: true,
    });
    await lease.dispose();
  });

  it("presents diagnostics outputs from the bound Core route without a second scene render", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    const simulation = createMutableSimulationAdapter();
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const manifest = createMinimalWaterPrewarmManifest();
    const lease = await prepareRealWater({
      manifest,
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        simulation,
        presentation,
      }),
    }).ready;

    expect(lease).not.toHaveProperty("present");
    expect(lease).not.toHaveProperty("captures");
    const route = presentation.route as HostPresentationRoute;
    expect(Object.keys(route)).toEqual(["present"]);
    const diagnostics = readHostDiagnosticsRoute(route);
    const compileAtReady = renderer.compileAsync.mock.calls.length;
    const probeAtReady = renderer.readRenderTargetPixelsAsync.mock.calls.length;
    const renderAtReady = renderer.render.mock.calls.length;

    const empty = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({ outputs: [] }),
    );
    expect(empty.outputs).toEqual([]);
    expect(empty.temporal.historyEpoch).toBe(1);
    expect(empty.diagnosticReadbackCount).toBe(0);
    expect(empty.probeCount).toBe(probeAtReady);
    expect(empty.compileCount).toBe(compileAtReady);
    expect(empty.sceneRenderCount).toBeGreaterThan(0);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(compileAtReady);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(
      probeAtReady,
    );
    expect(renderer.render.mock.calls.length).toBeGreaterThan(renderAtReady);

    const sceneRendersAfterEmpty = empty.sceneRenderCount;
    const withCurrent = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({
        outputs: ["final-color", "current-color", "motion-vector"],
      }),
    );
    expect(withCurrent.outputs.map((output) => output.name)).toEqual([
      "final-color",
      "current-color",
      "motion-vector",
    ]);
    expect(
      new Set(withCurrent.outputs.map((output) => output.width)).size,
    ).toBe(1);
    expect(
      new Set(withCurrent.outputs.map((output) => output.height)).size,
    ).toBe(1);
    expect(withCurrent.outputs[0]?.width).toBe(withCurrent.width);
    expect(withCurrent.outputs[0]?.height).toBe(withCurrent.height);
    expect(withCurrent.presentationId).toBe(empty.presentationId + 1);
    expect(withCurrent.manifestHash).toBe(manifest.manifestHash);
    expect(withCurrent.diagnosticReadbackCount).toBe(3);
    expect(withCurrent.probeCount).toBe(probeAtReady);
    expect(withCurrent.compileCount).toBe(compileAtReady);
    expect(withCurrent.sceneRenderCount).toBe(sceneRendersAfterEmpty + 1);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(compileAtReady);
    expect(withCurrent.outputs[2]).toMatchObject({
      name: "motion-vector",
      format: "rg32float-ndc",
    });
    expect(withCurrent.outputs[2]?.data[0]).toBe(0.25);
    expect(withCurrent.outputs[2]?.data[1]).toBe(-0.125);

    simulation.assign({ simulationResetRevision: 1 });
    const resetFrame = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({
        outputs: ["motion-vector"],
      }),
    );
    expect(resetFrame.temporal).toEqual({
      historyEpoch: 2,
      resetReason: "simulation-reset",
      resetFrame: true,
    });
    expect(resetFrame.outputs[0]?.data[0]).toBe(0.25);
    expect(resetFrame.outputs[0]?.data[1]).toBe(-0.125);

    await expect(
      diagnostics.present({
        outputs: ["final-color", "final-color"],
      }),
    ).rejects.toThrowError(/unique/i);

    const all = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({
        outputs: [...DIAGNOSTICS_CAPTURE_NAMES],
      }),
    );
    expect(all.outputs).toHaveLength(27);
    expect(all.diagnosticReadbackCount).toBe(28);
    expect(all.sceneRenderCount).toBe(resetFrame.sceneRenderCount + 1);

    await lease.dispose();
    await expect(diagnostics.present({ outputs: [] })).rejects.toThrow(
      /unbound/i,
    );
    await expect(route.present()).rejects.toThrow(/unbound/i);
  });

  it("shares one queue and one Host scene render across interleaved root and diagnostics presents", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    const route = presentation.route as HostPresentationRoute;
    const diagnostics = readHostDiagnosticsRoute(route);
    const renderAtReady = renderer.render.mock.calls.length;

    const rootFirst = readHostPresentedFrame(await route.present());
    const renderAfterRoot = renderer.render.mock.calls.length;
    const diagnosticsFrame = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({ outputs: [] }),
    );
    const renderAfterDiagnostics = renderer.render.mock.calls.length;
    const rootSecond = readHostPresentedFrame(await route.present());
    const renderAfterSecondRoot = renderer.render.mock.calls.length;
    const trailing = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({ outputs: [] }),
    );

    expect(rootFirst.presentationId).toBe(1);
    expect(diagnosticsFrame.presentationId).toBe(2);
    expect(rootSecond.presentationId).toBe(3);
    expect(trailing.presentationId).toBe(4);
    expect(rootFirst.seed).toBe(0);
    expect(rootFirst.timeSeconds).toBe(0);
    expect(rootFirst.simulationResetRevision).toBe(0);
    expect(trailing.sceneRenderCount).toBe(
      diagnosticsFrame.sceneRenderCount + 2,
    );
    expect(renderAfterRoot).toBeGreaterThan(renderAtReady);
    expect(renderAfterDiagnostics).toBeGreaterThan(renderAfterRoot);
    expect(renderAfterSecondRoot).toBeGreaterThan(renderAfterDiagnostics);
    expect(renderer.render.mock.calls.length).toBeGreaterThan(
      renderAfterSecondRoot,
    );

    await lease.dispose();
  });

  it("recovers from a pre-render viewport mismatch and poisons after a post-render failure", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    const route = presentation.route as HostPresentationRoute;
    const diagnostics = readHostDiagnosticsRoute(route);

    renderer.getDrawingBufferSize.mockImplementation(
      (target: { width: number; height: number }) => {
        target.width = 64;
        target.height = 32;
        return target;
      },
    );
    await expect(route.present()).rejects.toThrow(
      "The Three Host drawing buffer does not match the Prewarm Manifest.",
    );
    renderer.getDrawingBufferSize.mockImplementation(mockDrawingBufferSize());
    const recovered = readHostPresentedFrame(await route.present());
    expect(recovered.presentationId).toBe(1);

    renderer.readRenderTargetPixelsAsync.mockImplementationOnce(async () => {
      throw new Error("named-output readback failed");
    });
    await expect(
      diagnostics.present({ outputs: ["final-color"] }),
    ).rejects.toThrow(/named-output readback failed/i);
    await expect(route.present()).rejects.toThrow(/unbound/i);
    await expect(diagnostics.present({ outputs: [] })).rejects.toThrow(
      /unbound/i,
    );

    await lease.dispose();
  });

  it("hides the Real Water plane during planar reflection and restores Host state", async () => {
    const scene = new Scene();
    const background = createTestEnvironmentTexture(4, 2);
    const hostFog = Object.freeze({ name: "host-fog" });
    const hostOverride = Object.freeze({ name: "host-override" });
    const hostMrt = Object.freeze({ name: "host-mrt" });
    const hostContext = Object.freeze({ name: "host-context" });
    scene.background = background;
    scene.fog = hostFog as never;
    scene.overrideMaterial = hostOverride as never;
    scene.add(new Mesh());
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, 10, 18);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const hostTarget = Object.freeze({ name: "host-target" });
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    renderer.getRenderTarget.mockImplementation(() => hostTarget);
    renderer.getActiveCubeFace.mockImplementation(() => 3);
    renderer.getActiveMipmapLevel.mockImplementation(() => 1);
    renderer.getMRT.mockImplementation(() => hostMrt);
    renderer.getClearColor.mockImplementation(
      (color: { r: number; g: number; b: number }) => {
        color.r = 0.1;
        color.g = 0.2;
        color.b = 0.3;
        return color;
      },
    );
    renderer.getClearAlpha.mockImplementation(() => 0.25);
    renderer.autoClear = false;
    renderer.toneMapping = 4;
    renderer.outputColorSpace = "srgb";
    renderer.transparent = true;
    renderer.opaque = false;
    renderer.contextNode = hostContext;
    const visibilities: boolean[] = [];
    renderer.render.mockImplementation(() => {
      const water = scene.getObjectByName("Real Water clipmap");
      visibilities.push(water?.visible === true);
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    const water = scene.getObjectByName("Real Water clipmap");
    expect(water?.visible).toBe(true);
    expect(visibilities.includes(false)).toBe(true);
    expect(visibilities.at(-1)).toBe(true);

    const compileAtReady = renderer.compileAsync.mock.calls.length;
    const hostProjection = camera.projectionMatrix.clone();
    const hostProjectionInverse = camera.projectionMatrixInverse.clone();
    await presentation.present();
    expect(water?.visible).toBe(true);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(compileAtReady);
    expect(renderer.getRenderTarget()).toBe(hostTarget);
    expect(renderer.getActiveCubeFace).toHaveBeenCalled();
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(hostTarget, 3, 1);
    expect(renderer.getMRT()).toBe(hostMrt);
    expect(renderer.autoClear).toBe(false);
    expect(renderer.setClearColor.mock.calls.at(-1)?.[0]).toMatchObject({
      r: 0.1,
      g: 0.2,
      b: 0.3,
    });
    expect(renderer.setClearColor.mock.calls.at(-1)?.[1]).toBe(0.25);
    expect(renderer.toneMapping).toBe(4);
    expect(renderer.outputColorSpace).toBe("srgb");
    expect(renderer.transparent).toBe(true);
    expect(renderer.opaque).toBe(false);
    expect(renderer.contextNode).toBe(hostContext);
    expect(scene.background).toBe(background);
    expect(scene.fog).toBe(hostFog);
    expect(scene.overrideMaterial).toBe(hostOverride);
    expect(camera.position.y).toBe(10);
    expect(camera.projectionMatrix.equals(hostProjection)).toBe(true);
    expect(camera.projectionMatrixInverse.equals(hostProjectionInverse)).toBe(
      true,
    );
    expect(renderer.dispose).not.toHaveBeenCalled();

    await lease.dispose();
    expect(scene.getObjectByName("Real Water clipmap")).toBeUndefined();
    expect(renderer.dispose).not.toHaveBeenCalled();
  });

  it("restores Host state when planar reflection throws", async () => {
    const scene = new Scene();
    const background = createTestEnvironmentTexture(4, 2);
    const hostFog = Object.freeze({ name: "host-fog" });
    const hostOverride = Object.freeze({ name: "host-override" });
    const hostContext = Object.freeze({ name: "host-context" });
    scene.background = background;
    scene.fog = hostFog as never;
    scene.overrideMaterial = hostOverride as never;
    scene.add(new Mesh());
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, 10, 18);
    camera.lookAt(0, 0, 0);
    const hostTarget = Object.freeze({ name: "host-target" });
    const hostMrt = Object.freeze({ name: "host-mrt" });
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    renderer.getRenderTarget.mockImplementation(() => hostTarget);
    renderer.getActiveCubeFace.mockImplementation(() => 2);
    renderer.getActiveMipmapLevel.mockImplementation(() => 1);
    renderer.getMRT.mockImplementation(() => hostMrt);
    renderer.getClearColor.mockImplementation(
      (color: { r: number; g: number; b: number }) => {
        color.r = 0.4;
        color.g = 0.5;
        color.b = 0.6;
        return color;
      },
    );
    renderer.getClearAlpha.mockImplementation(() => 0.75);
    renderer.autoClear = false;
    renderer.toneMapping = 3;
    renderer.outputColorSpace = "srgb";
    renderer.transparent = true;
    renderer.opaque = false;
    renderer.contextNode = hostContext;
    const hostProjection = camera.projectionMatrix.clone();
    const hostProjectionInverse = camera.projectionMatrixInverse.clone();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    renderer.render.mockImplementation(
      (_scene: unknown, usedCamera: unknown) => {
        if (usedCamera !== camera) {
          throw new Error("planar reflection failed");
        }
      },
    );
    await expect(presentation.present()).rejects.toThrow(
      /planar reflection failed/i,
    );
    expect(scene.getObjectByName("Real Water clipmap")?.visible).toBe(true);
    expect(renderer.getRenderTarget()).toBe(hostTarget);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(hostTarget, 2, 1);
    expect(renderer.getMRT()).toBe(hostMrt);
    expect(renderer.autoClear).toBe(false);
    expect(renderer.setClearColor.mock.calls.at(-1)?.[0]).toMatchObject({
      r: 0.4,
      g: 0.5,
      b: 0.6,
    });
    expect(renderer.setClearColor.mock.calls.at(-1)?.[1]).toBe(0.75);
    expect(renderer.toneMapping).toBe(3);
    expect(renderer.outputColorSpace).toBe("srgb");
    expect(renderer.transparent).toBe(true);
    expect(renderer.opaque).toBe(false);
    expect(renderer.contextNode).toBe(hostContext);
    expect(scene.background).toBe(background);
    expect(scene.fog).toBe(hostFog);
    expect(scene.overrideMaterial).toBe(hostOverride);
    expect(camera.position.y).toBe(10);
    expect(camera.projectionMatrix.equals(hostProjection)).toBe(true);
    expect(camera.projectionMatrixInverse.equals(hostProjectionInverse)).toBe(
      true,
    );
    await lease.dispose();
  });

  it("refuses reverse-Z on the renderer without occupying a lease", async () => {
    const renderer = { ...createCapableRenderer(), reversedDepthBuffer: true };
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({ renderer, scene, camera }),
    });
    await expect(run.ready).rejects.toThrow(/reverse-Z/i);
    expect(renderer.init).not.toHaveBeenCalled();
    expect(scene.children).toHaveLength(0);
  });

  it("refuses reverse-Z on the camera without occupying a lease", async () => {
    const camera = {
      isCamera: true,
      isPerspectiveCamera: true,
      reversedDepth: true,
    };
    const renderer = createCapableRenderer();
    const scene = new Scene();
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({ renderer, scene, camera }),
    });
    await expect(run.ready).rejects.toThrow(/reverse-Z/i);
    expect(renderer.init).not.toHaveBeenCalled();
    expect(scene.children).toHaveLength(0);
  });

  it("reads a parented rolled camera from world matrices and leaves Host camera unchanged", async () => {
    const scene = new Scene();
    const parent = new Object3D();
    parent.position.set(10, 0, 6);
    parent.rotation.y = 0.35;
    scene.add(parent);
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, 12, 18);
    camera.rotation.z = 0.4;
    parent.add(camera);
    camera.updateMatrixWorld(true);
    const localBefore = camera.position.clone();
    const rollBefore = camera.rotation.z;
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    expect(camera.position.equals(localBefore)).toBe(true);
    expect(camera.rotation.z).toBeCloseTo(rollBefore);
    expect(camera.parent).toBe(parent);
    const worldAfterReady = camera.matrixWorld.clone();
    const projectionAfterReady = camera.projectionMatrix.clone();
    const inverseAfterReady = camera.projectionMatrixInverse.clone();
    await presentation.present();
    expect(camera.position.equals(localBefore)).toBe(true);
    expect(camera.rotation.z).toBeCloseTo(rollBefore);
    expect(camera.matrixWorld.equals(worldAfterReady)).toBe(true);
    expect(camera.projectionMatrix.equals(projectionAfterReady)).toBe(true);
    expect(camera.projectionMatrixInverse.equals(inverseAfterReady)).toBe(true);
    expect(camera.parent).toBe(parent);
    await lease.dispose();
  });

  it("primes planar while below the plane and does not compile again after rising above", async () => {
    const scene = new Scene();
    scene.add(new Mesh());
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, -2, 8);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    expect(renderer.compileAsync.mock.calls.length).toBeGreaterThan(1);
    expect(
      renderer.compileAsync.mock.calls.some((call) => call[1] !== camera),
    ).toBe(true);
    expect(renderer.render.mock.calls.some((call) => call[1] !== camera)).toBe(
      true,
    );
    const compileAtReady = renderer.compileAsync.mock.calls.length;
    const diagnostics = readHostDiagnosticsRoute(
      presentation.route as HostPresentationRoute,
    );
    const below = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({ outputs: ["planar-target-alpha"] }),
    );
    expect(
      below.outputs[0] && "data" in below.outputs[0]
        ? [...(below.outputs[0].data as Float32Array)].every(
            (value) => value === 0,
          )
        : false,
    ).toBe(true);
    expect(below.compileCount).toBe(compileAtReady);
    expect(below.sceneRenderCount).toBeGreaterThan(0);
    camera.position.set(0, 10, 18);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const rendersBeforeAbove = renderer.render.mock.calls.length;
    const above = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({ outputs: ["planar-target-alpha"] }),
    );
    expect(renderer.compileAsync).toHaveBeenCalledTimes(compileAtReady);
    expect(above.compileCount).toBe(compileAtReady);
    expect(above.sceneRenderCount).toBeGreaterThan(below.sceneRenderCount);
    expect(
      renderer.render.mock.calls
        .slice(rendersBeforeAbove)
        .some((call) => call[1] !== camera),
    ).toBe(true);
    await lease.dispose();
  });

  it("disposes the planar target exactly once", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const planarTargets: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
    renderer.setRenderTarget.mockImplementation((target: unknown) => {
      const candidate = target as {
        texture?: { name?: string };
        dispose?: (() => void) & { mock?: unknown };
      } | null;
      if (
        candidate !== null &&
        candidate !== undefined &&
        String(candidate.texture?.name ?? "").includes("planar reflection") &&
        typeof candidate.dispose === "function" &&
        candidate.dispose.mock === undefined
      ) {
        candidate.dispose = vi.fn(candidate.dispose.bind(candidate));
        planarTargets.push(candidate as { dispose: ReturnType<typeof vi.fn> });
      }
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    expect(planarTargets.length).toBeGreaterThan(0);
    await lease.dispose();
    await lease.dispose();
    expect(renderer.dispose).not.toHaveBeenCalled();
    for (const target of planarTargets) {
      expect(target.dispose).toHaveBeenCalledTimes(1);
    }
  });

  it("disposes a partial planar target when a later compile fails", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    const renderer = createPrewarmRenderer();
    const planarTargets: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
    let compileCalls = 0;
    renderer.compileAsync.mockImplementation(async () => {
      compileCalls += 1;
      if (compileCalls === 2) {
        throw new Error("scene compile failed");
      }
    });
    renderer.setRenderTarget.mockImplementation((target: unknown) => {
      const candidate = target as {
        texture?: { name?: string };
        dispose?: (() => void) & { mock?: unknown };
      } | null;
      if (
        candidate !== null &&
        candidate !== undefined &&
        String(candidate.texture?.name ?? "").includes("planar reflection") &&
        typeof candidate.dispose === "function" &&
        candidate.dispose.mock === undefined
      ) {
        candidate.dispose = vi.fn(candidate.dispose.bind(candidate));
        planarTargets.push(candidate as { dispose: ReturnType<typeof vi.fn> });
      }
    });
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({ renderer, scene, camera }),
    });
    await expect(run.ready).rejects.toThrow(/scene compile failed/i);
    expect(scene.children).toHaveLength(0);
    expect(planarTargets.length).toBeGreaterThan(0);
    for (const target of planarTargets) {
      expect(target.dispose).toHaveBeenCalledTimes(1);
    }
    expect(renderer.dispose).not.toHaveBeenCalled();
  });

  it("rejects a changed drawing buffer without compiling or resizing planar", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    expect(lease.capabilities.rendering.reflection).toEqual(
      CORE_READY_REFLECTION,
    );
    const compileAtReady = renderer.compileAsync.mock.calls.length;
    renderer.getDrawingBufferSize.mockImplementation(
      (target: { width: number; height: number }) => {
        target.width = 64;
        target.height = 32;
        return target;
      },
    );
    await expect(presentation.present()).rejects.toThrow(
      "The Three Host drawing buffer does not match the Prewarm Manifest.",
    );
    expect(renderer.compileAsync).toHaveBeenCalledTimes(compileAtReady);
    await lease.dispose();
  });

  it("falls back to Host environment when planar confidence is zero", async () => {
    const scene = new Scene();
    scene.environment = createTestEnvironmentTexture(4, 2);
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, -2, 8);
    camera.lookAt(0, 0, 0);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    expect(
      renderer.compileAsync.mock.calls.some((call) => call[1] !== camera),
    ).toBe(true);
    const compileAtReady = renderer.compileAsync.mock.calls.length;
    const diagnostics = readHostDiagnosticsRoute(
      presentation.route as HostPresentationRoute,
    );
    const frame = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({
        outputs: ["planar-target-alpha", "optical-environment-reflection"],
      }),
    );
    const occupancy = frame.outputs[0];
    const environment = frame.outputs[1];
    expect(occupancy?.name).toBe("planar-target-alpha");
    expect(
      occupancy && "data" in occupancy
        ? [...(occupancy.data as Float32Array)].every((value) => value === 0)
        : false,
    ).toBe(true);
    expect(environment?.name).toBe("optical-environment-reflection");
    expect(renderer.compileAsync).toHaveBeenCalledTimes(compileAtReady);
    expect(scene.environment).not.toBeNull();
    await lease.dispose();
  });

  it("reports planar target occupancy from a facing fixture without reading scene.environment", async () => {
    const scene = new Scene();
    scene.environment = createTestEnvironmentTexture(4, 2);
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, 10, 18);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    renderer.readRenderTargetPixelsAsync.mockImplementation(
      (
        target: {
          texture?: { name?: string };
          textures?: ReadonlyArray<{ name?: string }>;
        },
        _x: number,
        _y: number,
        width: number,
        height: number,
        textureIndex = 0,
      ) => {
        if (String(target.texture?.name ?? "").includes("planar reflection")) {
          const data = new Uint8Array(
            Math.max(1, width) * Math.max(1, height) * 4,
          );
          data[0] = 255;
          data[1] = 0;
          data[2] = 255;
          data[3] = 255;
          return data;
        }
        return mockPresentationReadback(target, width, height, textureIndex);
      },
    );
    const diagnostics = readHostDiagnosticsRoute(
      presentation.route as HostPresentationRoute,
    );
    const frame = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({
        outputs: ["planar-target-alpha", "planar-color"],
      }),
    );
    const confidence = frame.outputs[0];
    const planarColor = frame.outputs[1];
    expect(confidence?.name).toBe("planar-target-alpha");
    expect(
      confidence && "data" in confidence
        ? [...(confidence.data as Float32Array)].some((value) => value > 0)
        : false,
    ).toBe(true);
    expect(planarColor?.name).toBe("planar-color");
    expect(
      planarColor && "data" in planarColor
        ? Array.from((planarColor.data as Uint8Array).slice(0, 4))
        : [],
    ).toEqual([255, 0, 255, 255]);
    expect(scene.environment).not.toBeNull();
    await lease.dispose();
  });

  it("applies TRAA jitter and velocity original projection before the Host scene render", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, 10, 18);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const hostProjection = camera.projectionMatrix.clone();
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const jitteredViews: boolean[] = [];
    const velocityDuringApply: unknown[] = [];
    let lastVelocity: unknown;
    const originalSetViewOffset = camera.setViewOffset.bind(camera);
    camera.setViewOffset = ((
      ...args: Parameters<PerspectiveCamera["setViewOffset"]>
    ) => {
      originalSetViewOffset(...args);
      jitteredViews.push(camera.view !== null && camera.view.enabled === true);
      velocityDuringApply.push(lastVelocity);
    }) as PerspectiveCamera["setViewOffset"];
    const originalSet = velocity.setProjectionMatrix.bind(velocity);
    const velocitySpy = vi
      .spyOn(velocity, "setProjectionMatrix")
      .mockImplementation((matrix) => {
        lastVelocity = matrix;
        return originalSet(matrix);
      });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    jitteredViews.length = 0;
    velocityDuringApply.length = 0;
    await presentation.present();
    expect(jitteredViews.includes(true)).toBe(true);
    expect(velocityDuringApply.some((value) => value != null)).toBe(true);
    expect(camera.view).toBeNull();
    expect(camera.projectionMatrix.equals(hostProjection)).toBe(true);
    velocitySpy.mockRestore();
    await lease.dispose();
  });

  it("applies the stock r185 Halton view-offset sequence from the first reset frame", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, 10, 18);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const offsets: Array<readonly [number, number]> = [];
    const originalSetViewOffset = camera.setViewOffset.bind(camera);
    camera.setViewOffset = ((
      fullWidth: number,
      fullHeight: number,
      offsetX: number,
      offsetY: number,
      width: number,
      height: number,
    ) => {
      offsets.push([offsetX, offsetY]);
      originalSetViewOffset(
        fullWidth,
        fullHeight,
        offsetX,
        offsetY,
        width,
        height,
      );
    }) as PerspectiveCamera["setViewOffset"];
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    const sequence = collapseConsecutiveOffsets(offsets);
    expect(sequence.length).toBeGreaterThanOrEqual(9);
    expect(sequence[0]?.[0]).toBeCloseTo(stockR185HaltonOffset(0)[0], 10);
    expect(sequence[0]?.[1]).toBeCloseTo(stockR185HaltonOffset(0)[1], 10);
    expect(sequence[0]?.[0] === 0 && sequence[0]?.[1] === 0).toBe(false);
    for (const [slot, offset] of sequence.entries()) {
      const expected = stockR185HaltonOffset(slot);
      expect(offset[0]).toBeCloseTo(expected[0], 10);
      expect(offset[1]).toBeCloseTo(expected[1], 10);
    }
    await lease.dispose();
  });

  it("propagates an injected TypeError from public setViewOffset on a ready present", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, 10, 18);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    camera.setViewOffset = (() => {
      throw new TypeError("injected TRAA setViewOffset failure");
    }) as PerspectiveCamera["setViewOffset"];
    await expect(presentation.present()).rejects.toThrow(TypeError);
    await lease.dispose();
  });

  it("does not blit the SSR setup pipeline on repeated ready presents", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, 10, 18);
    camera.lookAt(0, 0, 0);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const originalRender = RenderPipeline.prototype.render;
    let observingPresents = false;
    let ssrSetupPresents = 0;
    let pipelineRenders = 0;
    RenderPipeline.prototype.render = function renderOverride() {
      if (observingPresents) {
        pipelineRenders += 1;
        const node = this.outputNode as {
          getRenderTarget?: unknown;
          maxDistance?: unknown;
        };
        if (
          typeof node.getRenderTarget === "function" &&
          node.maxDistance !== undefined
        ) {
          ssrSetupPresents += 1;
        }
      }
      return originalRender.call(this);
    };
    try {
      const lease = await prepareRealWater({
        manifest: createMinimalWaterPrewarmManifest(),
        loading: { present() {} },
        host: createThreeHostLifecycleAdapter({
          renderer,
          scene,
          camera,
          presentation,
        }),
      }).ready;
      const diagnostics = readHostDiagnosticsRoute(
        presentation.route as HostPresentationRoute,
      );
      observingPresents = true;
      await diagnostics.present({ outputs: [] });
      const firstPipelineRenders = pipelineRenders;
      const firstSsrSetup = ssrSetupPresents;
      await diagnostics.present({ outputs: [] });
      expect(firstSsrSetup).toBe(0);
      expect(ssrSetupPresents).toBe(0);
      expect(pipelineRenders - firstPipelineRenders).toBe(firstPipelineRenders);
      await lease.dispose();
    } finally {
      RenderPipeline.prototype.render = originalRender;
    }
  });

  it("renders the Host scene with the Host camera exactly once per present", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, 10, 18);
    camera.lookAt(0, 0, 0);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    const diagnostics = readHostDiagnosticsRoute(
      presentation.route as HostPresentationRoute,
    );
    const before = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({ outputs: [] }),
    );
    const renderBefore = renderer.render.mock.calls.length;
    const after = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({ outputs: [] }),
    );
    const hostRenders = renderer.render.mock.calls
      .slice(renderBefore)
      .filter((call) => call[0] === scene && call[1] === camera);
    expect(after.sceneRenderCount - before.sceneRenderCount).toBe(2);
    if (hostRenders.length > 0) {
      expect(hostRenders).toHaveLength(1);
    } else {
      expect(renderer.render.mock.calls.length).toBeGreaterThan(renderBefore);
    }
    await lease.dispose();
  });

  it("restores Host renderer state after success and SSR/composite/depth throws", async () => {
    const runCase = async (
      failNeedle: string,
      failMessage: string,
    ): Promise<void> => {
      const scene = new Scene();
      const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
      const presentation = createCapturingPresentationAdapter();
      const renderer = createPrewarmRenderer();
      const hostTarget = Object.freeze({ name: "live-host-target" });
      const hostMrt = Object.freeze({ name: "host-mrt" });
      const hostContext = Object.freeze({ name: "host-context" });
      const hostRenderObject = Object.freeze({ name: "host-rof" });
      let clearColor = { r: 0.15, g: 0.25, b: 0.35 };
      let clearAlpha = 0.4;
      let renderObjectFunction: unknown = hostRenderObject;
      let scissorTest = true;
      let pixelRatio = 2;
      renderer.autoClear = false;
      renderer.toneMapping = 4;
      renderer.toneMappingExposure = 1.25;
      renderer.outputColorSpace = "srgb-linear";
      renderer.transparent = true;
      renderer.opaque = false;
      renderer.contextNode = hostContext;
      renderer.xr.enabled = true;
      renderer.getMRT.mockReturnValue(hostMrt);
      renderer.getActiveCubeFace.mockReturnValue(3);
      renderer.getActiveMipmapLevel.mockReturnValue(2);
      renderer.setRenderTarget(hostTarget, 3, 2);
      renderer.getClearColor.mockImplementation(
        (color: { r: number; g: number; b: number }) => {
          color.r = clearColor.r;
          color.g = clearColor.g;
          color.b = clearColor.b;
          return color;
        },
      );
      renderer.getClearAlpha.mockImplementation(() => clearAlpha);
      renderer.setClearColor.mockImplementation(
        (color: { r: number; g: number; b: number }, alpha?: number) => {
          clearColor = { r: color.r, g: color.g, b: color.b };
          if (typeof alpha === "number") {
            clearAlpha = alpha;
          }
        },
      );
      renderer.getRenderObjectFunction.mockImplementation(
        () => renderObjectFunction,
      );
      renderer.setRenderObjectFunction.mockImplementation((next: unknown) => {
        renderObjectFunction = next;
      });
      renderer.getScissorTest.mockImplementation(() => scissorTest);
      renderer.setScissorTest.mockImplementation((next: boolean) => {
        scissorTest = next;
      });
      renderer.getPixelRatio.mockImplementation(() => pixelRatio);
      renderer.setPixelRatio.mockImplementation((next: number) => {
        pixelRatio = next;
      });
      const lease = await prepareRealWater({
        manifest: createMinimalWaterPrewarmManifest(),
        loading: { present() {} },
        host: createThreeHostLifecycleAdapter({
          renderer,
          scene,
          camera,
          presentation,
        }),
      }).ready;
      await presentation.present();
      const expectRestored = () => {
        expect(renderer.autoClear).toBe(false);
        expect(renderer.toneMapping).toBe(4);
        expect(renderer.toneMappingExposure).toBe(1.25);
        expect(renderer.outputColorSpace).toBe("srgb-linear");
        expect(renderer.getRenderTarget()).toBe(hostTarget);
        expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(
          hostTarget,
          3,
          2,
        );
        expect(renderer.setMRT).toHaveBeenLastCalledWith(hostMrt);
        expect(clearColor).toEqual({ r: 0.15, g: 0.25, b: 0.35 });
        expect(clearAlpha).toBe(0.4);
        expect(renderObjectFunction).toBe(hostRenderObject);
        expect(scissorTest).toBe(true);
        expect(pixelRatio).toBe(2);
        expect(renderer.xr.enabled).toBe(true);
      };
      expectRestored();
      const originalSet = renderer.setRenderTarget.getMockImplementation();
      renderer.setRenderTarget.mockImplementation(
        (
          target: { texture?: { name?: string } } | null,
          face?: number,
          mip?: number,
        ) => {
          const name = String(target?.texture?.name ?? "");
          if (name.includes(failNeedle)) {
            throw new Error(failMessage);
          }
          originalSet?.(target, face, mip);
        },
      );
      await expect(presentation.present()).rejects.toThrow(failMessage);
      expectRestored();
      await lease.dispose();
    };

    await runCase("current color", "SSR scene trigger failed");
    await runCase("SSR composite", "SSR composite failed");
    await runCase("inverse linear", "SSR depth failed");
    await runCase("TemporalReproject", "SSR TemporalReproject failed");
    await runCase("SSR history beauty", "SSR history beauty failed");
  });

  it("poisons the presentation route after a TemporalReproject throw", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const hostTarget = Object.freeze({ name: "live-host-target" });
    renderer.setRenderTarget(hostTarget);
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    await presentation.present();
    const originalSet = renderer.setRenderTarget.getMockImplementation();
    renderer.setRenderTarget.mockImplementation(
      (
        target: { texture?: { name?: string } } | null,
        face?: number,
        mip?: number,
      ) => {
        const name = String(target?.texture?.name ?? "");
        if (name.includes("TemporalReproject")) {
          throw new Error("SSR TemporalReproject poisoned");
        }
        originalSet?.(target, face, mip);
      },
    );
    await expect(presentation.present()).rejects.toThrow(
      /SSR TemporalReproject poisoned/,
    );
    renderer.setRenderTarget.mockImplementation(originalSet);
    await expect(presentation.present()).rejects.toThrow(/unbound/i);
    await lease.dispose();
  });

  it("fails closed immediately when the Host renderer omits copyTextureToTexture", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    const renderer = createCapableRenderer() as ThreeHostRenderer & {
      copyTextureToTexture?: unknown;
    };
    delete renderer.copyTextureToTexture;
    await expect(
      prepareRealWater({
        manifest: createMinimalWaterPrewarmManifest(),
        loading: { present() {} },
        host: createThreeHostLifecycleAdapter({
          renderer,
          scene,
          camera,
        }),
      }).ready,
    ).rejects.toThrow(/copyTextureToTexture/);
    expect(renderer.init).not.toHaveBeenCalled();
  });

  it("seeds TemporalReproject on the first reset present and does not reallocate after hidden frames", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    const initsAtReady = renderer.initRenderTarget.mock.calls.length;
    expect(initsAtReady).toBeGreaterThan(0);
    expect(renderer.copyTextureToTexture).toHaveBeenCalled();
    await presentation.present();
    await presentation.present();
    expect(renderer.initRenderTarget).toHaveBeenCalledTimes(initsAtReady);
    await lease.dispose();
  });

  it("prepares the reset velocity target once and does not redraw it after ready", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const countResetVelocityTargets = (): number =>
      renderer.setRenderTarget.mock.calls.filter(([target]) =>
        String(
          (target as { texture?: { name?: string } } | null)?.texture?.name ??
            "",
        ).includes("reset velocity"),
      ).length;
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    expect(countResetVelocityTargets()).toBe(1);
    const initsAtReady = renderer.initRenderTarget.mock.calls.length;
    const resetTargetsAtReady = countResetVelocityTargets();
    await presentation.present();
    await presentation.present();
    expect(countResetVelocityTargets()).toBe(resetTargetsAtReady);
    expect(renderer.initRenderTarget).toHaveBeenCalledTimes(initsAtReady);
    await lease.dispose();
  });

  it("keeps a parented rolled Host camera unchanged while history still updates", async () => {
    const scene = new Scene();
    const parent = new Object3D();
    parent.position.set(2, 1, -3);
    parent.rotation.z = Math.PI / 6;
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, 12, 20);
    parent.add(camera);
    const hostPosition = camera.position.clone();
    const hostQuaternion = camera.quaternion.clone();
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    const diagnostics = readHostDiagnosticsRoute(
      presentation.route as HostPresentationRoute,
    );
    const first = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({
        outputs: ["ssr-history-color", "ssr-history-frame-weight"],
      }),
    );
    const second = readHostDiagnosticsPresentedFrame(
      await diagnostics.present({
        outputs: ["ssr-history-color", "ssr-history-frame-weight"],
      }),
    );
    expect(camera.parent).toBe(parent);
    expect(camera.position.equals(hostPosition)).toBe(true);
    expect(camera.quaternion.equals(hostQuaternion)).toBe(true);
    expect(first.outputs[0]?.data.length).toBeGreaterThan(0);
    expect(second.outputs[0]?.data.length).toBe(first.outputs[0]?.data.length);
    expect(second.compileCount).toBe(first.compileCount);
    await lease.dispose();
  });

  it("captures and restores scene.backgroundNode around the planar pass", async () => {
    const scene = new Scene();
    const hostBackgroundNode = Object.freeze({ name: "host-background-node" });
    scene.backgroundNode = hostBackgroundNode as never;
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    camera.position.set(0, 10, 18);
    camera.lookAt(0, 0, 0);
    const presentation = createCapturingPresentationAdapter();
    const renderer = createPrewarmRenderer();
    const planarBackgrounds: unknown[] = [];
    renderer.render.mockImplementation(() => {
      const target = renderer.getRenderTarget() as {
        texture?: { name?: string };
      } | null;
      if (String(target?.texture?.name ?? "").includes("planar reflection")) {
        planarBackgrounds.push(scene.backgroundNode);
      }
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        renderer,
        scene,
        camera,
        presentation,
      }),
    }).ready;
    planarBackgrounds.length = 0;
    await presentation.present();
    expect(planarBackgrounds.length).toBeGreaterThan(0);
    expect(planarBackgrounds.every((value) => value == null)).toBe(true);
    expect(scene.backgroundNode).toBe(hostBackgroundNode);
    await lease.dispose();
  });
});

function coreDeviceLimits(
  overrides: Partial<{
    maxComputeInvocationsPerWorkgroup: number;
    maxComputeWorkgroupSizeX: number;
    maxComputeWorkgroupsPerDimension: number;
    maxColorAttachmentBytesPerSample: number;
    maxColorAttachments: number;
    maxStorageBufferBindingSize: number;
    maxTextureDimension2D: number;
  }> = {},
) {
  return {
    maxComputeInvocationsPerWorkgroup: 256,
    maxComputeWorkgroupSizeX: 256,
    maxComputeWorkgroupsPerDimension: 65_535,
    maxColorAttachmentBytesPerSample: 32,
    maxColorAttachments: 8,
    maxStorageBufferBindingSize: 134_217_728,
    maxTextureDimension2D: 8_192,
    ...overrides,
  };
}

function createCapableRenderer(): ThreeHostRenderer {
  return {
    coordinateSystem: 2_001,
    hasFeature: vi.fn((name: string) =>
      ["core-features-and-limits"].includes(name),
    ),
    init: vi.fn(async () => {}),
    copyTextureToTexture: vi.fn(),
    onDeviceLost: vi.fn(),
    backend: {
      device: {
        limits: coreDeviceLimits(),
      },
    },
  };
}

function createTestThreeHostLifecycleAdapter(renderer: ThreeHostRenderer) {
  return createThreeHostLifecycleAdapter({
    renderer,
    scene: new Scene(),
    camera: new PerspectiveCamera(),
  });
}

function createPrewarmRenderer() {
  let currentRenderTarget: unknown = Object.freeze({ name: "host-target" });
  return {
    autoClear: true,
    backend: {
      device: {
        limits: coreDeviceLimits(),
      },
    },
    compileAsync: vi.fn(async () => {}),
    computeAsync: vi.fn(async () => {}),
    clear: vi.fn(),
    contextNode: null,
    coordinateSystem: 2_001,
    dispose: vi.fn(),
    getActiveCubeFace: vi.fn(() => 0),
    getActiveMipmapLevel: vi.fn(() => 0),
    getClearAlpha: vi.fn(() => 1),
    getClearColor: vi.fn((color: { r: number; g: number; b: number }) => color),
    getDrawingBufferSize: mockDrawingBufferSize(),
    getMRT: vi.fn(() => null),
    getRenderTarget: vi.fn(() => currentRenderTarget),
    hasFeature: vi.fn((name: string) => name === "core-features-and-limits"),
    init: vi.fn(async () => {}),
    initTexture: vi.fn(),
    onDeviceLost: vi.fn(),
    opaque: true,
    outputColorSpace: "srgb",
    readRenderTargetPixelsAsync: vi.fn(
      async (
        target: {
          texture?: { name?: string };
          textures?: ReadonlyArray<{ name?: string }>;
        },
        _x: number,
        _y: number,
        width: number,
        height: number,
        textureIndex = 0,
      ) => mockPresentationReadback(target, width, height, textureIndex),
    ),
    render: vi.fn(),
    setClearColor: vi.fn(),
    setMRT: vi.fn(),
    setRenderTarget: vi.fn((target: unknown) => {
      currentRenderTarget = target;
    }),
    toneMapping: 0,
    toneMappingExposure: 1,
    transparent: false,
    xr: { enabled: false },
    getRenderObjectFunction: vi.fn(() => null),
    setRenderObjectFunction: vi.fn(),
    getScissorTest: vi.fn(() => false),
    setScissorTest: vi.fn(),
    getPixelRatio: vi.fn(() => 1),
    setPixelRatio: vi.fn(),
    initRenderTarget: vi.fn(),
    copyTextureToTexture: vi.fn(),
  };
}

function mockPresentationReadback(
  target: {
    texture?: { name?: string };
    textures?: ReadonlyArray<{ name?: string }>;
  },
  width: number,
  height: number,
  textureIndex: number,
): Uint8Array | Uint16Array | Float32Array {
  const name = String(
    target.textures?.[textureIndex]?.name ?? target.texture?.name ?? "",
  );
  const pixels = Math.max(1, width) * Math.max(1, height);
  if (name.includes("inverse linear")) {
    return new Float32Array(pixels).fill(1);
  }
  if (name.includes("view normal")) {
    return new Uint16Array(pixels * 4);
  }
  if (name.includes("spectral whitecap stages")) {
    return new Uint16Array(pixels * 4);
  }
  if (
    name.includes("SSR raw") ||
    name.includes("SSR composite") ||
    name.includes("SSR history beauty") ||
    name.includes("SSR TemporalReproject resolved")
  ) {
    return new Uint16Array(pixels * 4);
  }
  if (name === "output") {
    return new Uint16Array(pixels * 4);
  }
  if (name.includes("motion")) {
    const data = new Float32Array(pixels * 2);
    data[0] = 0.25;
    data[1] = -0.125;
    return data;
  }
  if (name.includes("optical factors")) {
    return new Uint16Array(pixels * 4);
  }
  if (name.includes("diagnostics")) {
    return new Uint8Array(pixels * 2);
  }
  return new Uint8Array(pixels * 4);
}

function createMutableSimulationAdapter(): HostSimulationAdapter & {
  assign(next: Partial<HostSimulationState>): void;
} {
  let state: HostSimulationState = {
    seed: 0,
    tick: 0,
    timeSeconds: 0,
    paused: true,
    originX: 0,
    originZ: 0,
    simulationResetRevision: 0,
  };
  return {
    snapshot() {
      return { ...state };
    },
    assign(next) {
      state = { ...state, ...next };
    },
  };
}

function createCapturingPresentationAdapter(): HostPresentationAdapter & {
  incrementCameraCut(): number;
  present(): Promise<HostPresentedFrame>;
  route: HostPresentationRoute | undefined;
} {
  let cameraCutRevision = 0;
  let route: HostPresentationRoute | undefined;
  return {
    snapshot() {
      return { cameraCutRevision };
    },
    bind(next) {
      route = readHostPresentationRoute(next);
      return Object.freeze({
        dispose() {},
      });
    },
    incrementCameraCut() {
      cameraCutRevision += 1;
      return cameraCutRevision;
    },
    present() {
      if (route === undefined) {
        throw new Error(
          "The capturing presentation adapter has no bound route.",
        );
      }
      return route.present();
    },
    get route() {
      return route;
    },
  };
}

function stockR185Halton(index: number, base: number): number {
  let fraction = 1;
  let result = 0;
  while (index > 0) {
    fraction /= base;
    result += fraction * (index % base);
    index = Math.floor(index / base);
  }
  return result;
}

function stockR185HaltonOffset(index: number): readonly [number, number] {
  const slot = index % 31;
  return [
    stockR185Halton(slot + 1, 2) - 0.5,
    stockR185Halton(slot + 1, 3) - 0.5,
  ];
}

function collapseConsecutiveOffsets(
  offsets: ReadonlyArray<readonly [number, number]>,
): Array<readonly [number, number]> {
  const sequence: Array<readonly [number, number]> = [];
  for (const offset of offsets) {
    const previous = sequence[sequence.length - 1];
    if (
      previous === undefined ||
      previous[0] !== offset[0] ||
      previous[1] !== offset[1]
    ) {
      sequence.push(offset);
    }
  }
  return sequence;
}
