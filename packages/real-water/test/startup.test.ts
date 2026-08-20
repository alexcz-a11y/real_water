import { describe, expect, it, vi } from "vitest";
import {
  RealWaterStartupError,
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
  createMemoryHostLifecycleAdapter as createBaseMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createStaticHostSimulationAdapter,
  prepareRealWater,
  type HostLifecycleAdapter,
  type HostPreparedLease,
  type LoadingPresenterAdapter,
  type MemoryHostLifecycleAdapterOptions,
  type StartupSnapshot,
  type WebGPUDeviceLoss,
} from "../src/index.js";
import { createTestEnvironmentAdapter } from "./test-host-environment.js";

class RecordingLoadingPresenter implements LoadingPresenterAdapter {
  public readonly snapshots: StartupSnapshot[] = [];

  public present(snapshot: StartupSnapshot): void {
    this.snapshots.push(snapshot);
  }
}

const TEST_CAPABILITIES = Object.freeze({
  gameplay: Object.freeze({ maxQueryPointsPerTick: 2_048 as const }),
  rendering: Object.freeze({
    backend: "core-webgpu" as const,
    timestampQuery: false,
  }),
});
const NEVER_INVALIDATED = new Promise<never>(() => {});
const STATIC_SIMULATION = createStaticHostSimulationAdapter();

function createMemoryHostLifecycleAdapter(
  options: Omit<
    MemoryHostLifecycleAdapterOptions,
    "simulation" | "environment"
  >,
): HostLifecycleAdapter {
  return createBaseMemoryHostLifecycleAdapter({
    ...options,
    simulation: STATIC_SIMULATION,
    environment: createTestEnvironmentAdapter(),
  });
}

describe("prepareRealWater", () => {
  it("publishes deeply immutable Core WebGPU capabilities from the Memory Host", async () => {
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createMemoryHostLifecycleAdapter({
        scenario: { kind: "success", timestampQuery: true },
        stepDelayMs: 0,
      }),
    });

    const lease = await run.ready;

    expect(lease.capabilities).toEqual({
      gameplay: { maxQueryPointsPerTick: 2_048 },
      rendering: {
        backend: "core-webgpu",
        timestampQuery: true,
      },
    });
    expect(Object.isFrozen(lease.capabilities)).toBe(true);
    expect(Object.isFrozen(lease.capabilities.rendering)).toBe(true);
    await lease.dispose();
  });

  it("selects a declared effect variant with an immutable revision receipt", async () => {
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createMemoryHostLifecycleAdapter({ stepDelayMs: 0 }),
    });
    const lease = await run.ready;

    const receipt = lease.selectEffectVariant({
      effectId: "minimal-water-surface",
      variantId: "basic",
    });

    expect(receipt).toEqual({
      selection: {
        effectId: "minimal-water-surface",
        variantId: "basic",
      },
      changed: true,
      revision: 1,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.selection)).toBe(true);
    await lease.dispose();
  });

  it("keeps the revision stable when the selected effect variant is unchanged", async () => {
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createMemoryHostLifecycleAdapter({ stepDelayMs: 0 }),
    });
    const lease = await run.ready;
    const selection = {
      effectId: "minimal-water-surface",
      variantId: "basic",
    };

    lease.selectEffectVariant(selection);
    const receipt = lease.selectEffectVariant(selection);

    expect(receipt).toEqual({
      selection,
      changed: false,
      revision: 1,
    });
    await lease.dispose();
  });

  it("rejects an undeclared effect variant before changing runtime state", async () => {
    const manifest = createMinimalWaterPrewarmManifest();
    const run = prepareRealWater({
      manifest,
      loading: new RecordingLoadingPresenter(),
      host: createMemoryHostLifecycleAdapter({ stepDelayMs: 0 }),
    });
    const lease = await run.ready;
    const preparedSelection = {
      effectId: "minimal-water-surface",
      variantId: "basic",
    };
    lease.selectEffectVariant(preparedSelection);

    let failure: unknown;
    try {
      lease.selectEffectVariant({
        effectId: "minimal-water-surface",
        variantId: "undeclared",
      });
    } catch (cause) {
      failure = cause;
    }

    expect(failure).toMatchObject({
      name: "RealWaterRuntimeError",
      code: "EFFECT_NOT_PREWARMED",
      diagnostics: {
        effectId: "minimal-water-surface",
        manifestHash: manifest.manifestHash,
        variantId: "undeclared",
      },
      diagnosticText:
        "EFFECT_NOT_PREWARMED: The requested effect variant was not prepared by this lease.\n" +
        "effectId: minimal-water-surface\n" +
        `manifestHash: ${manifest.manifestHash}\n` +
        "variantId: undeclared",
    });
    expect(lease.selectEffectVariant(preparedSelection)).toMatchObject({
      changed: false,
      revision: 1,
    });
    await lease.dispose();
  });

  it("resolves one immutable device-loss invalidation after readiness", async () => {
    let invalidate:
      | ((loss: {
          readonly code: "WEBGPU_DEVICE_LOST";
          readonly message: string;
          readonly reason: string | null;
          readonly diagnostics: Readonly<
            Record<string, string | number | boolean | null>
          >;
        }) => void)
      | undefined;
    const invalidated = new Promise<{
      readonly code: "WEBGPU_DEVICE_LOST";
      readonly message: string;
      readonly reason: string | null;
      readonly diagnostics: Readonly<
        Record<string, string | number | boolean | null>
      >;
    }>((resolve) => {
      invalidate = resolve;
    });
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createReadyHost(undefined, {
        invalidated,
        simulation: STATIC_SIMULATION,
        dispose() {},
      }),
    });
    const lease = await run.ready;

    invalidate?.({
      code: "WEBGPU_DEVICE_LOST",
      message: "Synthetic post-ready device loss.",
      reason: "unknown",
      diagnostics: {
        deviceLossMessage: "Synthetic post-ready device loss.",
        deviceLossReason: "unknown",
      },
    });

    const loss = await lease.invalidated;
    expect(loss).toEqual({
      code: "WEBGPU_DEVICE_LOST",
      message: "Synthetic post-ready device loss.",
      reason: "unknown",
      diagnostics: {
        deviceLossMessage: "Synthetic post-ready device loss.",
        deviceLossReason: "unknown",
      },
    });
    expect(Object.isFrozen(loss)).toBe(true);
    expect(Object.isFrozen(loss.diagnostics)).toBe(true);

    let commandFailure: unknown;
    try {
      lease.selectEffectVariant({
        effectId: "minimal-water-surface",
        variantId: "basic",
      });
    } catch (cause) {
      commandFailure = cause;
    }
    expect(commandFailure).toMatchObject({
      name: "RealWaterRuntimeError",
      code: "RUNTIME_INVALIDATED",
      diagnostics: {
        deviceLossMessage: "Synthetic post-ready device loss.",
        deviceLossReason: "unknown",
        runtimeState: "device-lost",
      },
      diagnosticText:
        "RUNTIME_INVALIDATED: The Real Water runtime was invalidated by WebGPU device loss.\n" +
        "deviceLossMessage: Synthetic post-ready device loss.\n" +
        "deviceLossReason: unknown\n" +
        "runtimeState: device-lost",
    });
    await lease.dispose();
  });

  it("invalidates once for a long suspension and rejects later effect commands", async () => {
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createMemoryHostLifecycleAdapter({ stepDelayMs: 0 }),
    });
    const lease = await run.ready;

    const first = lease.invalidateForLongSuspension();
    const second = lease.invalidateForLongSuspension();

    expect(second).toBe(first);
    expect(first).toEqual({
      code: "LONG_SUSPENSION",
      message:
        "The Real Water runtime was invalidated after a long suspension.",
      diagnostics: { runtimeState: "long-suspension" },
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.diagnostics)).toBe(true);
    await expect(lease.invalidated).resolves.toBe(first);

    let commandFailure: unknown;
    try {
      lease.selectEffectVariant({
        effectId: "minimal-water-surface",
        variantId: "basic",
      });
    } catch (cause) {
      commandFailure = cause;
    }
    expect(commandFailure).toMatchObject({
      name: "RealWaterRuntimeError",
      code: "RUNTIME_INVALIDATED",
      diagnostics: { runtimeState: "long-suspension" },
      diagnosticText:
        "RUNTIME_INVALIDATED: The Real Water runtime was invalidated after a long suspension.\n" +
        "runtimeState: long-suspension",
    });
    await lease.dispose();
  });

  it("keeps a long-suspension invalidation when the Host reports device loss later", async () => {
    let loseDevice: ((loss: WebGPUDeviceLoss) => void) | undefined;
    const hostInvalidated = new Promise<WebGPUDeviceLoss>((resolve) => {
      loseDevice = resolve;
    });
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: createReadyHost(undefined, {
        invalidated: hostInvalidated,
        simulation: STATIC_SIMULATION,
        dispose() {},
      }),
    });
    const lease = await run.ready;
    const suspension = lease.invalidateForLongSuspension();

    loseDevice?.({
      code: "WEBGPU_DEVICE_LOST",
      message: "Synthetic late device loss.",
      reason: "unknown",
      diagnostics: {
        deviceLossMessage: "Synthetic late device loss.",
        deviceLossReason: "unknown",
      },
    });
    await Promise.resolve();

    await expect(lease.invalidated).resolves.toBe(suspension);
    expect(() =>
      lease.selectEffectVariant({
        effectId: "minimal-water-surface",
        variantId: "basic",
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "RUNTIME_INVALIDATED",
        diagnostics: { runtimeState: "long-suspension" },
      }),
    );
    await lease.dispose();
  });

  it("fails the Readiness Gate when the prepared Host lease is already invalidated", async () => {
    const loading = new RecordingLoadingPresenter();
    const dispose = vi.fn();
    const loss = Object.freeze({
      code: "WEBGPU_DEVICE_LOST" as const,
      message: "Synthetic loss before readiness.",
      reason: "destroyed",
      diagnostics: Object.freeze({
        deviceLossMessage: "Synthetic loss before readiness.",
        deviceLossReason: "destroyed",
      }),
    });
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading,
      host: createReadyHost(undefined, {
        invalidated: Promise.resolve(loss),
        simulation: STATIC_SIMULATION,
        dispose,
      }),
    });

    await expect(run.ready).rejects.toMatchObject({
      name: "RealWaterStartupError",
      code: "WEBGPU_DEVICE_LOST",
      phase: "readiness-gate",
      retryable: true,
      diagnostics: {
        deviceLossMessage: "Synthetic loss before readiness.",
        deviceLossReason: "destroyed",
      },
      message: "The WebGPU device was lost before readiness completed.",
    });
    expect(loading.snapshots.at(-1)?.status).toBe("failed");
    expect(
      loading.snapshots.some((snapshot) => snapshot.status === "ready"),
    ).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("aborts pending progress and fails promptly when a ready Host lease invalidates", async () => {
    const manifest = createMinimalWaterPrewarmManifest();
    let finalProgressStarted = false;
    const committedStates: string[] = [];
    const loading: LoadingPresenterAdapter = {
      present(snapshot, signal) {
        if (
          snapshot.status === "preparing" &&
          snapshot.progress.completedWork === manifest.declarations.length
        ) {
          finalProgressStarted = true;
          return new Promise((_, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                reject(new Error("Progress presentation aborted."));
              },
              { once: true },
            );
          });
        }
        committedStates.push(snapshot.status);
      },
    };
    let invalidate:
      | ((loss: {
          readonly code: "WEBGPU_DEVICE_LOST";
          readonly message: string;
          readonly reason: string | null;
          readonly diagnostics: Readonly<
            Record<string, string | number | boolean | null>
          >;
        }) => void)
      | undefined;
    const invalidated = new Promise<{
      readonly code: "WEBGPU_DEVICE_LOST";
      readonly message: string;
      readonly reason: string | null;
      readonly diagnostics: Readonly<
        Record<string, string | number | boolean | null>
      >;
    }>((resolve) => {
      invalidate = resolve;
    });
    const dispose = vi.fn();
    const run = prepareRealWater({
      manifest,
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
            lease: { invalidated, simulation: STATIC_SIMULATION, dispose },
          };
        },
      },
    });
    let outcome: unknown;
    void run.ready.catch((error: unknown) => {
      outcome = error;
    });

    await vi.waitFor(() => {
      expect(finalProgressStarted).toBe(true);
    });
    invalidate?.({
      code: "WEBGPU_DEVICE_LOST",
      message: "Synthetic loss during final progress.",
      reason: null,
      diagnostics: {
        deviceLossMessage: "Synthetic loss during final progress.",
        deviceLossReason: null,
      },
    });

    await vi.waitFor(
      () => {
        expect(outcome).toMatchObject({
          code: "WEBGPU_DEVICE_LOST",
          phase: "readiness-gate",
        });
      },
      { timeout: 200 },
    );
    expect(committedStates.at(-1)).toBe("failed");
    expect(committedStates).not.toContain("ready");
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("reports only completed manifest work before resolving a ready lease", async () => {
    const loading = new RecordingLoadingPresenter();
    const manifest = createMinimalWaterPrewarmManifest();
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
      ...Array.from(
        { length: manifest.declarations.length + 1 },
        () => "preparing" as const,
      ),
      "ready",
    ]);
    expect(progress).toEqual(
      Array.from(
        { length: manifest.declarations.length + 1 },
        (_, index) => index,
      ),
    );
    expect(lease.manifest).toEqual({
      schema: "real-water/prewarm",
      version: 2,
      id: manifest.id,
      manifestHash: manifest.manifestHash,
      qualityProfile: {
        schema: "real-water/quality-profile",
        version: 1,
        id: "minimal",
        profileHash: manifest.qualityProfile.profileHash,
      },
      environmentReflection: SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
      effectVariants: [
        {
          effectId: "minimal-water-surface",
          variantId: "basic",
        },
      ],
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
      manifest: createMinimalWaterPrewarmManifest(),
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
      manifest: createMinimalWaterPrewarmManifest(),
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
      manifest: createMinimalWaterPrewarmManifest(),
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
      manifest: createMinimalWaterPrewarmManifest(),
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
      manifest: createMinimalWaterPrewarmManifest(),
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
      manifest: createMinimalWaterPrewarmManifest(),
      loading,
      host: createMemoryHostLifecycleAdapter({
        scenario: {
          kind: "failure",
          declarationId: "water-render-target",
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
        completedWork: 4,
        totalWork: 16,
      },
    });
  });

  it("cancels once and rejects only after cancellation is presented", async () => {
    const loading = new RecordingLoadingPresenter();
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
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
      invalidated: NEVER_INVALIDATED,
      simulation: STATIC_SIMULATION,
      dispose() {
        disposalCalls += 1;
      },
    });
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host,
    });
    const lease = await run.ready;

    const first = lease.dispose();
    const second = lease.dispose();

    let commandFailure: unknown;
    try {
      lease.selectEffectVariant({
        effectId: "minimal-water-surface",
        variantId: "basic",
      });
    } catch (cause) {
      commandFailure = cause;
    }

    expect(first).toBe(second);
    expect(commandFailure).toMatchObject({
      name: "RealWaterRuntimeError",
      code: "RUNTIME_INVALIDATED",
      diagnostics: { runtimeState: "disposed" },
      diagnosticText:
        "RUNTIME_INVALIDATED: The Real Water runtime has been disposed.\n" +
        "runtimeState: disposed",
    });
    await first;
    expect(disposalCalls).toBe(1);
  });

  it("fails invalid manifest versions before invoking the Host Adapter", async () => {
    let hostStarted = false;
    const manifest = {
      ...createMinimalWaterPrewarmManifest(),
      version: 1,
    } as unknown as ReturnType<typeof createMinimalWaterPrewarmManifest>;
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

  it("fails before Host preparation when required water work is absent", async () => {
    const manifest = createMinimalWaterPrewarmManifest();
    for (const missingDeclaration of manifest.declarations) {
      const hostStarted = vi.fn();
      const run = prepareRealWater({
        manifest: {
          ...manifest,
          declarations: manifest.declarations.filter(
            (declaration) => declaration.id !== missingDeclaration.id,
          ),
        },
        loading: new RecordingLoadingPresenter(),
        host: createReadyHost(hostStarted),
      });

      await expect(run.ready).rejects.toMatchObject({
        code: "MANIFEST_INVALID",
        diagnostics: {
          missingDeclarationId: missingDeclaration.id,
        },
        phase: "manifest-validation",
        retryable: false,
      });
      expect(hostStarted).not.toHaveBeenCalled();
    }
  });

  it("rejects a changed minimal-water work plan with a syntactically valid hash", async () => {
    const hostStarted = vi.fn();
    const manifest = createMinimalWaterPrewarmManifest();
    const run = prepareRealWater({
      manifest: {
        ...manifest,
        manifestHash: "sha256:" + "0".repeat(64),
      },
      loading: new RecordingLoadingPresenter(),
      host: createReadyHost(hostStarted),
    });

    await expect(run.ready).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
      diagnostics: {
        expectedManifestHash: manifest.manifestHash,
        receivedManifestHash: "sha256:" + "0".repeat(64),
      },
      phase: "manifest-validation",
    });
    expect(hostStarted).not.toHaveBeenCalled();
  });

  it("rejects a Host that claims readiness before completing the manifest", async () => {
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: new RecordingLoadingPresenter(),
      host: {
        async prepare() {
          return {
            status: "ready",
            capabilities: TEST_CAPABILITIES,
            lease: {
              invalidated: NEVER_INVALIDATED,
              simulation: STATIC_SIMULATION,
              dispose() {},
            },
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
      manifest: createMinimalWaterPrewarmManifest(),
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
      manifest: createMinimalWaterPrewarmManifest(),
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
        invalidated: NEVER_INVALIDATED,
        simulation: STATIC_SIMULATION,
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
    const manifest = createMinimalWaterPrewarmManifest();
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
            lease: {
              invalidated: NEVER_INVALIDATED,
              simulation: STATIC_SIMULATION,
              dispose() {},
            },
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
      manifest: createMinimalWaterPrewarmManifest(),
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
              invalidated: NEVER_INVALIDATED,
              simulation: STATIC_SIMULATION,
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
    await vi.waitFor(() => {
      expect(disposalCalls).toBe(1);
    });
  });

  it("surfaces a swallowed reporter failure even when the Host never settles", async () => {
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
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
      manifest: createMinimalWaterPrewarmManifest(),
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
    const manifest = createMinimalWaterPrewarmManifest();
    const loading: LoadingPresenterAdapter = {
      present(snapshot, signal) {
        if (
          snapshot.status === "preparing" &&
          snapshot.progress.completedWork === manifest.declarations.length
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
      manifest,
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
              invalidated: NEVER_INVALIDATED,
              simulation: STATIC_SIMULATION,
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
      manifest: createMinimalWaterPrewarmManifest(),
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
    const firstId = createMinimalWaterPrewarmManifest().declarations[0]?.id;
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
      manifest: createMinimalWaterPrewarmManifest(),
      loading,
      host: createReadyHost(undefined, {
        invalidated: NEVER_INVALIDATED,
        simulation: STATIC_SIMULATION,
        dispose: disposeHostLease,
      }),
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
      manifest: null as unknown as ReturnType<
        typeof createMinimalWaterPrewarmManifest
      >,
      loading,
      host,
    });
    await expect(nullRun.ready).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
    });

    const sparseDeclarations = new Array(2) as ReturnType<
      typeof createMinimalWaterPrewarmManifest
    >["declarations"];
    const sparseRun = prepareRealWater({
      manifest: {
        ...createMinimalWaterPrewarmManifest(),
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
      0: createMinimalWaterPrewarmManifest().declarations[0],
    });
    const inheritedRun = prepareRealWater({
      manifest: {
        ...createMinimalWaterPrewarmManifest(),
        declarations: inheritedDeclarations as ReturnType<
          typeof createMinimalWaterPrewarmManifest
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
      manifest: createMinimalWaterPrewarmManifest(),
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
            lease: {
              invalidated: NEVER_INVALIDATED,
              simulation: STATIC_SIMULATION,
              dispose() {},
            },
          };
        },
      },
    });

    const lease = await run.ready;
    await lease.dispose();
  });

  it("fails deterministically for an unknown configured mock failure", async () => {
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
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

  it("returns a deeply immutable deterministic minimal-water manifest", () => {
    const manifest = createMinimalWaterPrewarmManifest();
    const first = manifest.declarations[0];

    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.declarations)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(manifest.declarations.map((declaration) => declaration.id)).toEqual([
      "water-texture",
      "water-environment-radiance",
      "water-scene-color",
      "water-scene-depth",
      "water-render-target",
      "water-clipmap",
      "water-spectral-band-swell",
      "water-spectral-band-wind",
      "water-spectral-band-chop",
      "water-spectral-band-ripple",
      "water-material",
      "water-optical-route",
      "water-render-route",
      "water-hidden-stabilization",
      "water-completion-probe",
      "water-main-camera-guard",
    ]);
    expect(() => {
      if (first !== undefined) {
        (first as { label: string }).label = "mutated";
      }
    }).toThrow(TypeError);
    expect(manifest.declarations[0]?.label).toBe("Minimal water texture");
  });
});

function createReadyHost(
  onStart?: () => void,
  lease: HostPreparedLease = {
    invalidated: NEVER_INVALIDATED,
    simulation: STATIC_SIMULATION,
    dispose() {},
  },
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
