import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
  SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS,
  createMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createMinimalWaterQualityProfile,
  createStaticHostEnvironmentAdapter,
  createStaticHostSimulationAdapter,
  createSupportedHostEnvironmentRadianceBytes,
  prepareRealWater,
} from "../src/index.js";
import {
  SUPPORTED_ENVIRONMENT_FINGERPRINT,
  TEST_ENVIRONMENT_STATE,
  createTestEnvironmentReflection,
} from "./test-host-environment.js";

describe("Host Environment Adapter", () => {
  it("keeps environment implementation helpers off the public Interface", async () => {
    const publicApi = await import("../src/index.js");
    expect("assertHostEnvironmentTextureMatchesDescriptor" in publicApi).toBe(
      false,
    );
    expect("hostEnvironmentReflectionWorkPlanFingerprint" in publicApi).toBe(
      false,
    );
    expect(
      "SUPPORTED_HOST_ENVIRONMENT_WORK_PLAN_FINGERPRINT" in publicApi,
    ).toBe(false);
    expect("ThreeHostTexture" in publicApi).toBe(false);
  });

  it("publishes the SHA-256 of the canonical 8x4 RGBA radiance as the Host verification credential", () => {
    const bytes = createSupportedHostEnvironmentRadianceBytes();
    expect(bytes).toHaveLength(8 * 4 * 4);
    expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(
      "sha256:84b8a165a60b53c9e86a4b1741543e54dba29c63628244127792cbc9fa236f91",
    );
    expect(SUPPORTED_HOST_ENVIRONMENT_REFLECTION.fingerprint).toBe(
      "sha256:84b8a165a60b53c9e86a4b1741543e54dba29c63628244127792cbc9fa236f91",
    );
    expect(createSupportedHostEnvironmentRadianceBytes()).not.toBe(bytes);
  });

  it("publishes a borrowed reflection descriptor and hot lighting scalars", () => {
    const reflection = createTestEnvironmentReflection();
    const adapter = createStaticHostEnvironmentAdapter(
      reflection,
      TEST_ENVIRONMENT_STATE,
    );

    expect(adapter.reflection).toEqual({
      identity: "water-environment-radiance",
      fingerprint: SUPPORTED_ENVIRONMENT_FINGERPRINT,
      width: 8,
      height: 4,
      format: "rgba8unorm",
      type: "equirect",
      colorSpace: "srgb",
    });
    expect(adapter.texture).toBeNull();
    expect(adapter.snapshot()).toEqual(TEST_ENVIRONMENT_STATE);
    expect(Object.isFrozen(adapter)).toBe(true);
    expect(Object.isFrozen(adapter.reflection)).toBe(true);
    expect(Object.isFrozen(adapter.snapshot())).toBe(true);
  });

  it("re-reads mutable Host environment scalars without replacing the adapter", () => {
    const lighting = { ...TEST_ENVIRONMENT_STATE };
    const adapter = createStaticHostEnvironmentAdapter(
      createTestEnvironmentReflection(),
      lighting,
    );

    lighting.sunIntensity = 0.2;
    lighting.environmentIntensity = 0.35;
    lighting.sunDirectionX = -1;
    lighting.sunAngularRadiusRadians = 0.2;

    expect(adapter.snapshot()).toEqual({
      ...TEST_ENVIRONMENT_STATE,
      sunIntensity: 0.2,
      environmentIntensity: 0.35,
      sunDirectionX: -1,
      sunAngularRadiusRadians: 0.2,
    });
    expect(Object.isFrozen(adapter.snapshot())).toBe(true);
  });

  it("rejects a texture-only marker as an environment reflection descriptor", () => {
    expect(() =>
      createStaticHostEnvironmentAdapter(
        {
          isTexture: true,
        } as never,
        TEST_ENVIRONMENT_STATE,
      ),
    ).toThrow(
      "The Host environment reflection needs identity, fingerprint, dimensions, format, and type.",
    );
  });

  it("rejects a zero or non-finite Host sun direction", () => {
    expect(() =>
      createStaticHostEnvironmentAdapter(createTestEnvironmentReflection(), {
        ...TEST_ENVIRONMENT_STATE,
        sunDirectionX: 0,
        sunDirectionY: 0,
        sunDirectionZ: 0,
      }),
    ).toThrow("Host sun direction must be a non-zero finite vector.");
    expect(() =>
      createStaticHostEnvironmentAdapter(createTestEnvironmentReflection(), {
        ...TEST_ENVIRONMENT_STATE,
        sunIntensity: Number.POSITIVE_INFINITY,
      }),
    ).toThrow("Host environment lighting scalars must be finite.");
    expect(() =>
      createStaticHostEnvironmentAdapter(createTestEnvironmentReflection(), {
        ...TEST_ENVIRONMENT_STATE,
        sunAngularRadiusRadians: 0,
      }),
    ).toThrow("Host sun angular radius must be a positive finite angle.");
    expect(() =>
      createStaticHostEnvironmentAdapter(createTestEnvironmentReflection(), {
        ...TEST_ENVIRONMENT_STATE,
        sunAngularRadiusRadians: Number.POSITIVE_INFINITY,
      }),
    ).toThrow("Host sun angular radius must be a positive finite angle.");
    expect(() =>
      createStaticHostEnvironmentAdapter(createTestEnvironmentReflection(), {
        ...TEST_ENVIRONMENT_STATE,
        sunAngularRadiusRadians: Math.PI + 0.01,
      }),
    ).toThrow("Host sun angular radius must be a positive finite angle.");
    expect(SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS).toBe(0.069);
  });

  it("requires a Host Environment Adapter on the Memory Host", async () => {
    expect(() =>
      createMemoryHostLifecycleAdapter({
        simulation: createStaticHostSimulationAdapter(),
        stepDelayMs: 0,
      } as never),
    ).toThrow("The Memory Host Adapter requires a Host Environment Adapter.");

    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation: createStaticHostSimulationAdapter(),
        environment: createStaticHostEnvironmentAdapter(
          createTestEnvironmentReflection(),
          TEST_ENVIRONMENT_STATE,
        ),
        stepDelayMs: 0,
      }),
    }).ready;
    await lease.dispose();
  });

  it("rejects an environment fingerprint that does not match the prepared radiance", () => {
    expect(() =>
      createStaticHostEnvironmentAdapter(
        {
          ...createTestEnvironmentReflection(),
          fingerprint: `sha256:${"b".repeat(64)}`,
        },
        TEST_ENVIRONMENT_STATE,
      ),
    ).toThrow(
      "The Host environment reflection does not match the prepared environment radiance.",
    );
  });

  it("binds identity, content fingerprint, and layout into the work plan", () => {
    const descriptor = {
      identity: SUPPORTED_HOST_ENVIRONMENT_REFLECTION.identity,
      fingerprint: SUPPORTED_HOST_ENVIRONMENT_REFLECTION.fingerprint,
      width: SUPPORTED_HOST_ENVIRONMENT_REFLECTION.width,
      height: SUPPORTED_HOST_ENVIRONMENT_REFLECTION.height,
      format: SUPPORTED_HOST_ENVIRONMENT_REFLECTION.format,
      type: SUPPORTED_HOST_ENVIRONMENT_REFLECTION.type,
      colorSpace: SUPPORTED_HOST_ENVIRONMENT_REFLECTION.colorSpace,
    };
    const structural = `sha256:${createHash("sha256")
      .update(JSON.stringify(descriptor))
      .digest("hex")}`;
    const manifest = createMinimalWaterPrewarmManifest(
      createMinimalWaterQualityProfile(),
    );
    const declared = manifest.declarations.find(
      (declaration) => declaration.id === "water-environment-radiance",
    );

    expect(structural).not.toBe(SUPPORTED_ENVIRONMENT_FINGERPRINT);
    expect(declared?.fingerprint).toBe(structural);
    expect(declared?.label).toBe(
      "Host environment radiance (equirect rgba8unorm 8x4 srgb)",
    );
    expect(createMinimalWaterPrewarmManifest().manifestHash).toBe(
      manifest.manifestHash,
    );
    expect(manifest.environmentReflection).toEqual(
      SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
    );
    expect(Object.isFrozen(manifest.environmentReflection)).toBe(true);
  });

  it("rejects cube or linear environment radiance from the public equirect sRGB contract", () => {
    expect(() =>
      createStaticHostEnvironmentAdapter(
        {
          ...createTestEnvironmentReflection(),
          type: "cube",
        } as never,
        TEST_ENVIRONMENT_STATE,
      ),
    ).toThrow("This release prepares only equirect Host environment radiance.");
    expect(() =>
      createStaticHostEnvironmentAdapter(
        {
          ...createTestEnvironmentReflection(),
          colorSpace: "linear",
        } as never,
        TEST_ENVIRONMENT_STATE,
      ),
    ).toThrow(
      "The Host environment reflection does not match the prepared environment radiance.",
    );
  });

  it("rejects a Host-asserted fingerprint that hides a different identity or size", async () => {
    const mismatched = {
      reflection: {
        identity: "host-asserted-radiance",
        fingerprint: SUPPORTED_ENVIRONMENT_FINGERPRINT,
        width: 2,
        height: 2,
        format: "rgba8unorm",
        type: "equirect" as const,
        colorSpace: "srgb" as const,
      },
      texture: null,
      snapshot: () => TEST_ENVIRONMENT_STATE,
    };

    await expect(
      prepareRealWater({
        manifest: createMinimalWaterPrewarmManifest(),
        loading: { present() {} },
        host: createMemoryHostLifecycleAdapter({
          simulation: createStaticHostSimulationAdapter(),
          environment: mismatched,
          stepDelayMs: 0,
        }),
      }).ready,
    ).rejects.toThrow(
      "The Host environment reflection does not match the prepared environment radiance.",
    );
  });
});
