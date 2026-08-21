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
import type * as TemporalReprojectAddon from "three/addons/tsl/display/TemporalReprojectNode.js";
import {
  createMinimalWaterPrewarmManifest,
  createStaticHostPresentationAdapter,
  createStaticHostSimulationAdapter,
  createSupportedHostEnvironmentRadianceBytes,
  createThreeHostLifecycleAdapter,
  prepareRealWater,
} from "../src/index.js";
import { createTestEnvironmentAdapter } from "./test-host-environment.js";

const factoryFailure = vi.hoisted(() => ({
  disposeCount: 0,
  stripHitPoint: false,
}));

vi.mock(
  "three/addons/tsl/display/TemporalReprojectNode.js",
  async (importOriginal) => {
    const actual = (await importOriginal()) as typeof TemporalReprojectAddon;
    return {
      ...actual,
      temporalReproject: (
        ...args: Parameters<typeof actual.temporalReproject>
      ) => {
        const node = actual.temporalReproject(...args) as {
          dispose: () => void;
          hitPointReprojection?: { value: boolean };
        };
        const dispose = node.dispose.bind(node);
        node.dispose = () => {
          factoryFailure.disposeCount += 1;
          dispose();
        };
        if (factoryFailure.stripHitPoint) {
          delete node.hitPointReprojection;
        }
        return node;
      },
    };
  },
);

function createFactoryRenderer() {
  return {
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
    getClearColor: vi.fn((color: { r: number; g: number; b: number }) => color),
    getDrawingBufferSize: vi.fn((target: { width: number; height: number }) => {
      target.width = 320;
      target.height = 180;
      return target;
    }),
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
    initRenderTarget() {},
    copyTextureToTexture() {},
  };
}

describe("Specular TemporalReproject factory cleanup", () => {
  it("disposes the stock node once when the public hitPointReprojection shape is missing", async () => {
    factoryFailure.disposeCount = 0;
    factoryFailure.stripHitPoint = true;
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1.777, 0.1, 100);
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
    await expect(
      prepareRealWater({
        manifest: createMinimalWaterPrewarmManifest(),
        loading: { present() {} },
        host: createThreeHostLifecycleAdapter({
          environment: createTestEnvironmentAdapter(radiance),
          simulation: createStaticHostSimulationAdapter(),
          presentation: createStaticHostPresentationAdapter(),
          renderer: createFactoryRenderer(),
          scene,
          camera,
        }),
      }).ready,
    ).rejects.toThrow(/hitPointReprojection/);
    expect(factoryFailure.disposeCount).toBe(1);
  });
});
