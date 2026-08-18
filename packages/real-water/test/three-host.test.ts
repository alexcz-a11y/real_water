import { describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, Scene } from "three";
import {
  createMinimalWaterPrewarmManifest,
  createThreeHostLifecycleAdapter,
  prepareRealWater,
  type LoadingPresenterAdapter,
  type StartupSnapshot,
  type ThreeHostRenderer,
} from "../src/index.js";

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
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
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
          limits: {
            maxComputeInvocationsPerWorkgroup: 256,
            maxComputeWorkgroupSizeX: 256,
            maxComputeWorkgroupsPerDimension: 65_535,
            maxStorageBufferBindingSize: 134_217_728,
            maxTextureDimension2D: 8_192,
          },
        },
      },
      compileAsync: vi.fn(async () => {}),
      contextNode: null,
      coordinateSystem: 2_001,
      dispose: vi.fn(),
      getActiveCubeFace: vi.fn(() => 4),
      getActiveMipmapLevel: vi.fn(() => 2),
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
      setRenderTarget: vi.fn((target: unknown) => {
        currentRenderTarget = target;
      }),
      setMRT: vi.fn(),
      toneMapping: 0,
      transparent: false,
      xr: { enabled: false },
    };
    const loading = new RecordingLoadingPresenter();
    const manifest = createMinimalWaterPrewarmManifest();
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
    ).toBe(0);
    releaseWarmup?.(Uint8Array.from([0, 96, 160, 255]));
    const lease = await run.ready;

    expect(lease.capabilities).toEqual({
      rendering: {
        backend: "core-webgpu",
        timestampQuery: true,
      },
    });
    expect(renderer.init).toHaveBeenCalledTimes(1);
    expect(renderer.onDeviceLost).toBe(previousOnDeviceLost);
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
    expect(renderer.compileAsync).toHaveBeenCalledWith(scene, camera);
    expect(renderer.render).toHaveBeenCalledTimes(10);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(3);
    expect(currentRenderTarget).toBe(initialRenderTarget);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(
      initialRenderTarget,
      4,
      2,
    );
    expect(scene.children).toHaveLength(1);
    expect(
      loading.snapshots.flatMap((snapshot) =>
        snapshot.status === "preparing" &&
        snapshot.progress.lastCompleted !== undefined
          ? [snapshot.progress.lastCompleted.id]
          : [],
      ),
    ).toEqual(manifest.declarations.map((declaration) => declaration.id));

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
    expect(renderer.dispose).not.toHaveBeenCalled();

    const replacementRun = prepareRealWater({
      manifest,
      loading: new RecordingLoadingPresenter(),
      host: createThreeHostLifecycleAdapter({ renderer, scene, camera }),
    });
    const replacementLease = await replacementRun.ready;
    expect(scene.children).toHaveLength(1);
    await replacementLease.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("cleans partial water resources when progress presentation fails", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    let currentRenderTarget: unknown = null;
    const renderer = {
      autoClear: true,
      backend: {
        device: {
          limits: {
            maxComputeInvocationsPerWorkgroup: 256,
            maxComputeWorkgroupSizeX: 256,
            maxComputeWorkgroupsPerDimension: 65_535,
            maxStorageBufferBindingSize: 134_217_728,
            maxTextureDimension2D: 8_192,
          },
        },
      },
      compileAsync: vi.fn(async () => {}),
      contextNode: null,
      coordinateSystem: 2_001,
      dispose: vi.fn(),
      getActiveCubeFace: vi.fn(() => 0),
      getActiveMipmapLevel: vi.fn(() => 0),
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
      setMRT: vi.fn(),
      setRenderTarget: vi.fn((target: unknown) => {
        currentRenderTarget = target;
      }),
      toneMapping: 0,
      transparent: false,
      xr: { enabled: false },
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
    expect(renderer.compileAsync).toHaveBeenCalledTimes(1);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).not.toHaveBeenCalled();
  });

  it("rejects the initialized WebGL fallback without disposing the Host renderer", async () => {
    const renderer = {
      coordinateSystem: 2_000,
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
          limits: {
            maxComputeInvocationsPerWorkgroup: 256,
            maxComputeWorkgroupSizeX: 256,
            maxComputeWorkgroupsPerDimension: 65_535,
            maxStorageBufferBindingSize: 67_108_864,
            maxTextureDimension2D: 8_192,
          },
        },
      },
      coordinateSystem: 2_001,
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

  it("reports device loss raised during Three renderer initialization", async () => {
    const previousOnDeviceLost = vi.fn();
    const renderer = {
      backend: {
        device: {
          limits: {
            maxComputeInvocationsPerWorkgroup: 256,
            maxComputeWorkgroupSizeX: 256,
            maxComputeWorkgroupsPerDimension: 65_535,
            maxStorageBufferBindingSize: 134_217_728,
            maxTextureDimension2D: 8_192,
          },
        },
      },
      coordinateSystem: 2_001,
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

  it("reports a structured retryable renderer initialization failure", async () => {
    const renderer = {
      coordinateSystem: 2_001,
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
});

function createTestThreeHostLifecycleAdapter(renderer: ThreeHostRenderer) {
  return createThreeHostLifecycleAdapter({
    renderer,
    scene: new Scene(),
    camera: new PerspectiveCamera(),
  });
}
