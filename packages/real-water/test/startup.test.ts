import { describe, expect, it, vi } from "vitest";
import {
  RealWaterStartupError,
  createMemoryHostLifecycleAdapter,
  createMockPrewarmManifest,
  prepareRealWater,
  type HostLifecycleAdapter,
  type HostPreparedLease,
  type LoadingPresenterAdapter,
  type StartupSnapshot,
} from "../src/index.js";

class RecordingLoadingPresenter implements LoadingPresenterAdapter {
  public readonly snapshots: StartupSnapshot[] = [];

  public present(snapshot: StartupSnapshot): void {
    this.snapshots.push(snapshot);
  }
}

const TEST_CAPABILITIES = Object.freeze({
  rendering: Object.freeze({
    backend: "core-webgpu" as const,
    timestampQuery: false,
  }),
});

describe("prepareRealWater", () => {
  it("publishes deeply immutable Core WebGPU capabilities from the Memory Host", async () => {
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createMemoryHostLifecycleAdapter({
        scenario: { kind: "success", timestampQuery: true },
        stepDelayMs: 0,
      }),
    });

    const lease = await run.ready;

    expect(lease.capabilities).toEqual({
      rendering: {
        backend: "core-webgpu",
        timestampQuery: true,
      },
    });
    expect(Object.isFrozen(lease.capabilities)).toBe(true);
    expect(Object.isFrozen(lease.capabilities.rendering)).toBe(true);
    await lease.dispose();
  });

  it("reports only completed manifest work before resolving a ready lease", async () => {
    const loading = new RecordingLoadingPresenter();
    const manifest = createMockPrewarmManifest();
    const run = prepareRealWater({
      manifest,
      loading,
      host: createMemoryHostLifecycleAdapter({ stepDelayMs: 0 }),
    });

    const lease = await run.ready;
    const progress = loading.snapshots.flatMap((snapshot) =>
      snapshot.status === "preparing" ? [snapshot.progress.completedWork] : [],
    );

    expect(loading.snapshots.map((snapshot) => snapshot.status)).toEqual([
      "loading",
      "preparing",
      "preparing",
      "preparing",
      "preparing",
      "ready",
    ]);
    expect(progress).toEqual([0, 1, 2, 3]);
    expect(lease.manifest).toEqual({
      schema: "real-water/prewarm",
      version: 1,
      id: manifest.id,
      manifestHash: manifest.manifestHash,
    });

    await lease.dispose();
  });

  it("waits for the Loading Experience before Host preparation begins", async () => {
    let revealLoading: (() => void) | undefined;
    let hostStarted = false;
    const loadingVisible = new Promise<void>((resolve) => {
      revealLoading = resolve;
    });
    const loading: LoadingPresenterAdapter = {
      present(snapshot) {
        return snapshot.status === "loading" ? loadingVisible : undefined;
      },
    };
    const host = createReadyHost(() => {
      hostStarted = true;
    });
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading,
      host,
    });

    await Promise.resolve();
    expect(hostStarted).toBe(false);

    revealLoading?.();
    const lease = await run.ready;
    expect(hostStarted).toBe(true);
    await lease.dispose();
  });

  it("rejects a Memory WebGL fallback with stable capability diagnostics", async () => {
    const loading = new RecordingLoadingPresenter();
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading,
      host: createMemoryHostLifecycleAdapter({
        scenario: { kind: "webgl-fallback" },
        stepDelayMs: 0,
      }),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "CORE_WEBGPU_REQUIRED",
      diagnostics: {
        requiredBackend: "core-webgpu",
        selectedBackend: "webgl2",
      },
      message: "Three initialized a WebGL2 fallback; Core WebGPU is required.",
      phase: "host-compatibility",
      retryable: false,
    });

    expect(loading.snapshots.at(-1)).toMatchObject({
      status: "unsupported",
      progress: {
        completedWork: 0,
      },
    });
    expect(
      loading.snapshots.some((snapshot) => snapshot.status === "ready"),
    ).toBe(false);
  });

  it("rejects Memory WebGPU Compatibility Mode before readiness", async () => {
    const loading = new RecordingLoadingPresenter();
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading,
      host: createMemoryHostLifecycleAdapter({
        scenario: { kind: "compatibility-mode" },
        stepDelayMs: 0,
      }),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "WEBGPU_COMPATIBILITY_MODE_UNSUPPORTED",
      diagnostics: {
        requiredFeatureLevel: "core",
        selectedFeatureLevel: "compatibility",
      },
      message:
        "WebGPU Compatibility Mode is unsupported; Core WebGPU is required.",
      phase: "host-compatibility",
      retryable: false,
    });
    expect(loading.snapshots.at(-1)?.status).toBe("unsupported");
    expect(
      loading.snapshots.some((snapshot) => snapshot.status === "ready"),
    ).toBe(false);
  });

  it("rejects a Memory Core device that misses a required limit", async () => {
    const loading = new RecordingLoadingPresenter();
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading,
      host: createMemoryHostLifecycleAdapter({
        scenario: { kind: "missing-limit" },
        stepDelayMs: 0,
      }),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "WEBGPU_LIMIT_UNSUPPORTED",
      diagnostics: {
        actualLimit: 67_108_864,
        limitName: "maxStorageBufferBindingSize",
        missingLimitCount: 1,
        requiredLimit: 134_217_728,
      },
      message: "The Core WebGPU device does not meet required limits.",
      phase: "host-compatibility",
      retryable: false,
    });
    expect(loading.snapshots.at(-1)?.status).toBe("unsupported");
    expect(
      loading.snapshots.some((snapshot) => snapshot.status === "ready"),
    ).toBe(false);
  });

  it("reports Memory WebGPU device loss as a retryable capability failure", async () => {
    const loading = new RecordingLoadingPresenter();
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading,
      host: createMemoryHostLifecycleAdapter({
        scenario: {
          kind: "device-lost",
          reason: "unknown",
          message: "Synthetic device loss.",
        },
        stepDelayMs: 0,
      }),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "WEBGPU_DEVICE_LOST",
      diagnostics: {
        deviceLossMessage: "Synthetic device loss.",
        deviceLossReason: "unknown",
      },
      message: "The WebGPU device was lost during renderer initialization.",
      phase: "host-compatibility",
      retryable: true,
    });
    expect(loading.snapshots.at(-1)?.status).toBe("failed");
    expect(
      loading.snapshots.some((snapshot) => snapshot.status === "ready"),
    ).toBe(false);
  });

  it("keeps failed progress at the last actually completed declaration", async () => {
    const loading = new RecordingLoadingPresenter();
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading,
      host: createMemoryHostLifecycleAdapter({
        scenario: {
          kind: "failure",
          declarationId: "placeholder-surface",
          message: "Synthetic pipeline failure.",
        },
        stepDelayMs: 0,
      }),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "PREWARM_FAILED",
      message: "Synthetic pipeline failure.",
    });
    expect(loading.snapshots.at(-1)).toMatchObject({
      status: "failed",
      progress: {
        completedWork: 1,
        totalWork: 3,
      },
    });
  });

  it("cancels once and rejects only after cancellation is presented", async () => {
    const loading = new RecordingLoadingPresenter();
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading,
      host: createMemoryHostLifecycleAdapter({ stepDelayMs: 100 }),
    });
    const outcome = run.ready.catch((error: unknown) => error);

    await vi.waitFor(() => {
      expect(
        loading.snapshots.some((snapshot) => snapshot.status === "preparing"),
      ).toBe(true);
    });

    expect(run.cancel("Navigation cancelled startup.")).toBe(true);
    expect(run.cancel()).toBe(false);

    const error = await outcome;
    expect(error).toBeInstanceOf(RealWaterStartupError);
    expect(error).toMatchObject({
      code: "PREPARATION_CANCELLED",
      message: "Navigation cancelled startup.",
    });
    expect(loading.snapshots.at(-1)?.status).toBe("cancelled");
  });

  it("returns one idempotent lease-disposal transaction", async () => {
    let disposalCalls = 0;
    const host = createReadyHost(undefined, {
      dispose() {
        disposalCalls += 1;
      },
    });
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host,
    });
    const lease = await run.ready;

    const first = lease.dispose();
    const second = lease.dispose();

    expect(first).toBe(second);
    await first;
    expect(disposalCalls).toBe(1);
  });

  it("fails invalid manifest versions before invoking the Host Adapter", async () => {
    let hostStarted = false;
    const manifest = {
      ...createMockPrewarmManifest(),
      version: 2,
    } as unknown as ReturnType<typeof createMockPrewarmManifest>;
    const run = prepareRealWater({
      manifest,
      loading: new RecordingLoadingPresenter(),
      host: createReadyHost(() => {
        hostStarted = true;
      }),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "MANIFEST_VERSION_UNSUPPORTED",
    });
    expect(hostStarted).toBe(false);
  });

  it("rejects a Host that claims readiness before completing the manifest", async () => {
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: {
        async prepare() {
          return {
            status: "ready",
            capabilities: TEST_CAPABILITIES,
            lease: { dispose() {} },
          };
        },
      },
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "HOST_PROTOCOL_VIOLATION",
    });
  });

  it("settles cancellation even when the Host ignores the AbortSignal", async () => {
    let hostStarted = false;
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: {
        prepare() {
          hostStarted = true;
          return new Promise(() => {});
        },
      },
    });

    await vi.waitFor(() => {
      expect(hostStarted).toBe(true);
    });
    expect(run.cancel("Host did not cooperate.")).toBe(true);
    await expect(run.ready).rejects.toMatchObject({
      code: "PREPARATION_CANCELLED",
      message: "Host did not cooperate.",
    });
  });

  it("disposes a ready lease returned after cancellation", async () => {
    let resolveHost:
      | ((result: {
          status: "ready";
          capabilities: typeof TEST_CAPABILITIES;
          lease: HostPreparedLease;
        }) => void)
      | undefined;
    let hostStarted = false;
    let disposalCalls = 0;
    const hostResult = new Promise<{
      status: "ready";
      capabilities: typeof TEST_CAPABILITIES;
      lease: HostPreparedLease;
    }>((resolve) => {
      resolveHost = resolve;
    });
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: {
        prepare() {
          hostStarted = true;
          return hostResult;
        },
      },
    });

    await vi.waitFor(() => {
      expect(hostStarted).toBe(true);
    });
    expect(run.cancel()).toBe(true);
    await expect(run.ready).rejects.toMatchObject({
      code: "PREPARATION_CANCELLED",
    });

    resolveHost?.({
      status: "ready",
      capabilities: TEST_CAPABILITIES,
      lease: {
        dispose() {
          disposalCalls += 1;
        },
      },
    });
    await vi.waitFor(() => {
      expect(disposalCalls).toBe(1);
    });
  });

  it("awaits an unawaited final progress presentation before readiness", async () => {
    let releaseFinal: (() => void) | undefined;
    let finalReportStarted = false;
    const finalPresentation = new Promise<void>((resolve) => {
      releaseFinal = resolve;
    });
    const manifest = createMockPrewarmManifest();
    const loading: LoadingPresenterAdapter = {
      present(snapshot) {
        if (
          snapshot.status === "preparing" &&
          snapshot.progress.completedWork === manifest.declarations.length
        ) {
          finalReportStarted = true;
          return finalPresentation;
        }
      },
    };
    const run = prepareRealWater({
      manifest,
      loading,
      host: {
        async prepare(request) {
          const finalDeclaration = request.manifest.declarations.at(-1);
          for (const declaration of request.manifest.declarations.slice(
            0,
            -1,
          )) {
            await request.progress.complete(declaration.id);
          }
          if (finalDeclaration !== undefined) {
            void request.progress.complete(finalDeclaration.id);
          }
          return {
            status: "ready",
            capabilities: TEST_CAPABILITIES,
            lease: { dispose() {} },
          };
        },
      },
    });
    let readySettled = false;
    void run.ready.finally(() => {
      readySettled = true;
    });

    await vi.waitFor(() => {
      expect(finalReportStarted).toBe(true);
    });
    expect(readySettled).toBe(false);

    releaseFinal?.();
    const lease = await run.ready;
    expect(readySettled).toBe(true);
    await lease.dispose();
  });

  it("latches a reporter failure even when the Host catches it", async () => {
    let disposalCalls = 0;
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: {
        async prepare(request) {
          try {
            await request.progress.complete("not-in-the-manifest");
          } catch {
            // A Host cannot recover the core progress ledger after a violation.
          }
          for (const declaration of request.manifest.declarations) {
            try {
              await request.progress.complete(declaration.id);
            } catch {
              // Deliberately attempt to hide the latched error.
            }
          }
          return {
            status: "ready",
            capabilities: TEST_CAPABILITIES,
            lease: {
              dispose() {
                disposalCalls += 1;
              },
            },
          };
        },
      },
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "HOST_PROTOCOL_VIOLATION",
    });
    expect(disposalCalls).toBe(1);
  });

  it("surfaces a swallowed reporter failure even when the Host never settles", async () => {
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: {
        async prepare(request) {
          try {
            await request.progress.complete("not-in-the-manifest");
          } catch {
            // Deliberately swallow the core failure and hang.
          }
          return new Promise(() => {});
        },
      },
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "HOST_PROTOCOL_VIOLATION",
    });
  });

  it("cancels an in-flight progress presentation without a stale commit", async () => {
    const committedStates: string[] = [];
    let progressPresentationStarted = false;
    const loading: LoadingPresenterAdapter = {
      present(snapshot, signal) {
        if (
          snapshot.status === "preparing" &&
          snapshot.progress.completedWork === 1
        ) {
          progressPresentationStarted = true;
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              committedStates.push("preparing-1");
              resolve();
            }, 1_000);
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(new Error("Presentation aborted."));
              },
              { once: true },
            );
          });
        }

        committedStates.push(snapshot.status);
      },
    };
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading,
      host: createReadyHost(),
    });

    await vi.waitFor(() => {
      expect(progressPresentationStarted).toBe(true);
    });
    expect(run.cancel()).toBe(true);
    await expect(run.ready).rejects.toMatchObject({
      code: "PREPARATION_CANCELLED",
    });
    expect(committedStates.at(-1)).toBe("cancelled");
    expect(committedStates).not.toContain("preparing-1");
  });

  it("cancels after Host readiness while progress presentation is pending", async () => {
    let progressPresentationStarted = false;
    let disposalCalls = 0;
    const loading: LoadingPresenterAdapter = {
      present(snapshot, signal) {
        if (
          snapshot.status === "preparing" &&
          snapshot.progress.completedWork === 3
        ) {
          progressPresentationStarted = true;
          return new Promise((_, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                reject(new Error("Presentation aborted."));
              },
              { once: true },
            );
          });
        }
      },
    };
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading,
      host: {
        async prepare(request) {
          for (const declaration of request.manifest.declarations.slice(
            0,
            -1,
          )) {
            await request.progress.complete(declaration.id);
          }
          const finalDeclaration = request.manifest.declarations.at(-1);
          if (finalDeclaration !== undefined) {
            void request.progress.complete(finalDeclaration.id);
          }
          return {
            status: "ready",
            capabilities: TEST_CAPABILITIES,
            lease: {
              dispose() {
                disposalCalls += 1;
              },
            },
          };
        },
      },
    });

    await vi.waitFor(() => {
      expect(progressPresentationStarted).toBe(true);
    });
    expect(run.cancel()).toBe(true);
    await expect(run.ready).rejects.toMatchObject({
      code: "PREPARATION_CANCELLED",
    });
    expect(disposalCalls).toBe(1);
  });

  it("closes the progress reporter at the Host terminal result", async () => {
    const loading = new RecordingLoadingPresenter();
    let savedRequest:
      Parameters<HostLifecycleAdapter["prepare"]>[0] | undefined;
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading,
      host: {
        async prepare(request) {
          savedRequest = request;
          return {
            status: "unsupported",
            reason: "Unsupported for this test.",
          };
        },
      },
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "UNSUPPORTED_ENVIRONMENT",
    });
    const snapshotsBeforeLateReport = loading.snapshots.length;
    const firstId = createMockPrewarmManifest().declarations[0]?.id;
    expect(firstId).toBeDefined();
    await expect(
      savedRequest?.progress.complete(firstId ?? ""),
    ).rejects.toMatchObject({
      code: "HOST_PROTOCOL_VIOLATION",
    });
    expect(loading.snapshots).toHaveLength(snapshotsBeforeLateReport);
  });

  it("cancels while the ready presentation is pending and disposes the Host lease", async () => {
    let releaseReady: (() => void) | undefined;
    let readyPresentationStarted = false;
    const presentedStatuses: string[] = [];
    const disposeHostLease = vi.fn();
    const readyPresentation = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    const loading: LoadingPresenterAdapter = {
      present(snapshot) {
        presentedStatuses.push(snapshot.status);
        if (snapshot.status === "ready") {
          readyPresentationStarted = true;
          return readyPresentation;
        }
      },
    };
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading,
      host: createReadyHost(undefined, { dispose: disposeHostLease }),
    });

    await vi.waitFor(() => {
      expect(readyPresentationStarted).toBe(true);
    });
    expect(run.cancel("Cancelled while readiness was being presented.")).toBe(
      true,
    );
    expect(run.cancel()).toBe(false);

    await expect(run.ready).rejects.toMatchObject({
      code: "PREPARATION_CANCELLED",
      message: "Cancelled while readiness was being presented.",
      phase: "readiness-gate",
    });
    expect(presentedStatuses.at(-1)).toBe("cancelled");
    expect(disposeHostLease).toHaveBeenCalledTimes(1);

    releaseReady?.();
  });

  it("classifies null and sparse manifest structures as manifest errors", async () => {
    let hostCalls = 0;
    const host = createReadyHost(() => {
      hostCalls += 1;
    });
    const loading = new RecordingLoadingPresenter();
    const nullRun = prepareRealWater({
      manifest: null as unknown as ReturnType<typeof createMockPrewarmManifest>,
      loading,
      host,
    });
    await expect(nullRun.ready).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
    });

    const sparseDeclarations = new Array(2) as ReturnType<
      typeof createMockPrewarmManifest
    >["declarations"];
    const sparseRun = prepareRealWater({
      manifest: {
        ...createMockPrewarmManifest(),
        declarations: sparseDeclarations,
      },
      loading,
      host,
    });
    await expect(sparseRun.ready).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
    });

    const inheritedDeclarations = new Array(1) as unknown[];
    Object.setPrototypeOf(inheritedDeclarations, {
      0: createMockPrewarmManifest().declarations[0],
    });
    const inheritedRun = prepareRealWater({
      manifest: {
        ...createMockPrewarmManifest(),
        declarations: inheritedDeclarations as ReturnType<
          typeof createMockPrewarmManifest
        >["declarations"],
      },
      loading,
      host,
    });
    await expect(inheritedRun.ready).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
    });
    expect(hostCalls).toBe(0);
  });

  it("allows truthful declarations to complete in any serialized order", async () => {
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: {
        async prepare(request) {
          for (const declaration of [
            ...request.manifest.declarations,
          ].reverse()) {
            await request.progress.complete(declaration.id);
          }
          return {
            status: "ready",
            capabilities: TEST_CAPABILITIES,
            lease: { dispose() {} },
          };
        },
      },
    });

    const lease = await run.ready;
    await lease.dispose();
  });

  it("fails deterministically for an unknown configured mock failure", async () => {
    const run = prepareRealWater({
      manifest: createMockPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createMemoryHostLifecycleAdapter({
        scenario: {
          kind: "failure",
          declarationId: "missing-declaration",
        },
        stepDelayMs: 0,
      }),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "PREWARM_FAILED",
      message:
        "The configured mock failure declaration is absent from the Prewarm Manifest.",
    });
  });

  it("returns a deeply immutable deterministic mock manifest", () => {
    const manifest = createMockPrewarmManifest();
    const first = manifest.declarations[0];

    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.declarations)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => {
      if (first !== undefined) {
        (first as { label: string }).label = "mutated";
      }
    }).toThrow(TypeError);
    expect(manifest.declarations[0]?.label).toBe("Loading shell");
  });
});

function createReadyHost(
  onStart?: () => void,
  lease: HostPreparedLease = { dispose() {} },
): HostLifecycleAdapter {
  return {
    async prepare(request) {
      onStart?.();
      for (const declaration of request.manifest.declarations) {
        await request.progress.complete(declaration.id);
      }

      return {
        status: "ready",
        capabilities: TEST_CAPABILITIES,
        lease,
      };
    },
  };
}
