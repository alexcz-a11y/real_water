import { describe, expect, it, vi } from "vitest";
import {
  ClampToEdgeWrapping,
  DataTexture,
  NearestFilter,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
} from "three";
import * as ThreeWebgpu from "three/webgpu";
import {
  createMinimalWaterPrewarmManifest,
  createStaticHostPresentationAdapter,
  createStaticHostSimulationAdapter,
  createSupportedHostEnvironmentRadianceBytes,
  createThreeHostLifecycleAdapter,
  prepareRealWater,
} from "../src/index.js";
import { createTestEnvironmentAdapter } from "./test-host-environment.js";

const pipelineFailure = vi.hoisted(() => ({
  remaining: 0,
}));

vi.mock("three/webgpu", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ThreeWebgpu;
  return {
    ...actual,
    RenderPipeline: class extends actual.RenderPipeline {
      constructor(
        ...args: ConstructorParameters<typeof actual.RenderPipeline>
      ) {
        if (pipelineFailure.remaining > 0) {
          pipelineFailure.remaining -= 1;
          if (pipelineFailure.remaining === 0) {
            throw new Error("SSR composite pipeline failed");
          }
        }
        super(...args);
      }
    },
  };
});

describe("current-frame SSR stack cleanup", () => {
  it("disposes allocated SSR resources once when a later constructor fails", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
    const disposeCounts = new Map<object, number>();
    const originalDispose = ThreeWebgpu.RenderTarget.prototype.dispose;
    ThreeWebgpu.RenderTarget.prototype.dispose = function disposeOverride() {
      disposeCounts.set(this, (disposeCounts.get(this) ?? 0) + 1);
      return originalDispose.call(this);
    };
    // Fail the first pipeline constructed after the SSR stack is allocated.
    // Unified foam adds source-identity and Hero-foam diagnostics pipelines
    // before SSR.
    pipelineFailure.remaining = 8;
    const radiance = new DataTexture(
      createSupportedHostEnvironmentRadianceBytes(),
      8,
      4,
    );
    radiance.colorSpace = SRGBColorSpace;
    radiance.wrapS = RepeatWrapping;
    radiance.wrapT = ClampToEdgeWrapping;
    radiance.magFilter = NearestFilter;
    radiance.minFilter = NearestFilter;
    radiance.generateMipmaps = false;
    radiance.needsUpdate = true;
    const run = prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createThreeHostLifecycleAdapter({
        environment: createTestEnvironmentAdapter(radiance),
        simulation: createStaticHostSimulationAdapter(),
        presentation: createStaticHostPresentationAdapter(),
        renderer: {
          autoClear: true,
          backend: {
            device: {
              limits: {
                maxComputeInvocationsPerWorkgroup: 256,
                maxComputeWorkgroupSizeX: 256,
                maxComputeWorkgroupsPerDimension: 65_535,
                maxColorAttachmentBytesPerSample: 32,
                maxColorAttachments: 8,
                maxStorageBufferBindingSize: 134_217_728,
                maxTextureDimension2D: 8_192,
              },
            },
          },
          compileAsync: vi.fn(async () => {}),
          coordinateSystem: 2_001,
          dispose: vi.fn(),
          getActiveCubeFace: vi.fn(() => 0),
          getActiveMipmapLevel: vi.fn(() => 0),
          getClearAlpha: vi.fn(() => 1),
          getClearColor: vi.fn(
            (color: { r: number; g: number; b: number }) => color,
          ),
          getDrawingBufferSize: vi.fn(
            (target: { width: number; height: number }) => {
              target.width = 320;
              target.height = 180;
              return target;
            },
          ),
          getMRT: vi.fn(() => null),
          getRenderTarget: vi.fn(() => null),
          hasFeature: vi.fn(
            (name: string) => name === "core-features-and-limits",
          ),
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
          initRenderTarget() {},
          copyTextureToTexture() {},
        },
        scene,
        camera,
      }),
    });
    try {
      await expect(run.ready).rejects.toThrow(/SSR composite pipeline failed/i);
      expect(scene.children).toHaveLength(0);
      const named = [...disposeCounts.entries()].filter(([target]) => {
        const name = String(
          (target as { texture?: { name?: string } }).texture?.name ?? "",
        );
        return (
          name.includes("SSR raw") ||
          name.includes("SSR composite") ||
          name.includes("SSR history beauty") ||
          name.includes("SSR TemporalReproject resolved") ||
          name.includes("SSR history reset velocity")
        );
      });
      expect(named.length).toBeGreaterThanOrEqual(2);
      expect(
        named.some(([target]) =>
          String(
            (target as { texture?: { name?: string } }).texture?.name ?? "",
          ).includes("SSR raw"),
        ),
      ).toBe(true);
      const composite = named.filter(([target]) =>
        String(
          (target as { texture?: { name?: string } }).texture?.name ?? "",
        ).includes("SSR composite"),
      );
      expect(composite).toHaveLength(1);
      expect(composite[0]?.[1]).toBe(1);
      const resetVelocity = named.filter(([target]) =>
        String(
          (target as { texture?: { name?: string } }).texture?.name ?? "",
        ).includes("SSR history reset velocity"),
      );
      expect(resetVelocity).toHaveLength(1);
      expect(resetVelocity[0]?.[1]).toBe(1);
    } finally {
      ThreeWebgpu.RenderTarget.prototype.dispose = originalDispose;
      pipelineFailure.remaining = 0;
    }
  });
});
