import { describe, expect, it, vi } from "vitest";
import {
  createMockPrewarmManifest,
  createThreeHostLifecycleAdapter,
  prepareRealWater,
  type LoadingPresenterAdapter,
  type StartupSnapshot,
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
    const adapter = createThreeHostLifecycleAdapter({ renderer });
    const controller = new AbortController();
    controller.abort("Cancelled before Three initialization.");

    await expect(
      adapter.prepare({
        manifest: createMockPrewarmManifest(),
        progress: { complete: vi.fn(async () => {}) },
        signal: controller.signal,
      }),
    ).rejects.toThrow("Three Host preparation was cancelled.");
    expect(renderer.init).not.toHaveBeenCalled();
  });

  it("publishes Core capabilities without taking ownership of the Host renderer", async () => {
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
      dispose: vi.fn(),
      hasFeature: vi.fn((name: string) =>
        ["core-features-and-limits", "timestamp-query"].includes(name),
      ),
      init: vi.fn(async () => {}),
      onDeviceLost: previousOnDeviceLost,
    };
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createThreeHostLifecycleAdapter({ renderer }),
    });

    const lease = await run.ready;

    expect(lease.capabilities).toEqual({
      rendering: {
        backend: "core-webgpu",
        timestampQuery: true,
      },
    });
    expect(renderer.init).toHaveBeenCalledTimes(1);
    expect(renderer.onDeviceLost).toBe(previousOnDeviceLost);
    const firstDisposal = lease.dispose();
    expect(lease.dispose()).toBe(firstDisposal);
    await firstDisposal;
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
      manifest: createMockPrewarmManifest(),
      loading,
      host: createThreeHostLifecycleAdapter({ renderer }),
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
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createThreeHostLifecycleAdapter({ renderer }),
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
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createThreeHostLifecycleAdapter({ renderer }),
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
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createThreeHostLifecycleAdapter({ renderer }),
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
      manifest: createMockPrewarmManifest(),
      loading,
      host: createThreeHostLifecycleAdapter({ renderer }),
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
