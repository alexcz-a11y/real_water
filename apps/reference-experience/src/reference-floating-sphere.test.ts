import { describe, expect, it } from "vitest";
import { Scene } from "three";
import {
  createMemoryHostLifecycleAdapter,
  createMinimalWaterPrewarmManifest,
  createStaticHostEnvironmentAdapter,
  createStaticHostPresentationAdapter,
  createSupportedHostEnvironmentReflection,
  prepareRealWater,
} from "real-water";
import {
  REFERENCE_FLOATING_SPHERE_NAME,
  createReferenceFloatingSphere,
} from "./reference-floating-sphere.js";
import { createReferenceHostSimulationController } from "./reference-simulation-controller.js";

describe("Reference floating sphere", () => {
  it("presents interpolated Host-owned state after every required fixed step", async () => {
    const scene = new Scene();
    const sphere = createReferenceFloatingSphere(scene);
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: sphere.integrateFixedStep,
    });
    const lease = await prepareRealWater({
      manifest: createMinimalWaterPrewarmManifest(),
      loading: { present() {} },
      host: createMemoryHostLifecycleAdapter({
        simulation,
        environment: createStaticHostEnvironmentAdapter(
          createSupportedHostEnvironmentReflection(),
          {
            sunDirectionX: 0.32,
            sunDirectionY: 0.84,
            sunDirectionZ: 0.44,
            sunColorR: 1,
            sunColorG: 0.96,
            sunColorB: 0.82,
            sunIntensity: 1,
            environmentIntensity: 1,
            sunAngularRadiusRadians: 0.069,
          },
        ),
        presentation: createStaticHostPresentationAdapter(),
        stepDelayMs: 0,
      }),
    }).ready;
    const attachment = sphere.attach(lease);

    simulation.start(0);
    simulation.beforePresent(34);
    const alpha = simulation.interpolationAlpha(42);
    sphere.present(alpha);

    expect(simulation.snapshot().tick).toBe(2);
    expect(attachment.inspect().lastWaterLoad).toMatchObject({
      queryTick: 1,
      querySnapshotAge: 0,
    });
    const mesh = scene.getObjectByName(REFERENCE_FLOATING_SPHERE_NAME);
    expect(mesh?.position.y).toBeCloseTo(
      sphere.physics.interpolate(alpha).position.y,
      12,
    );

    await lease.dispose();
    expect(attachment.inspect().attached).toBe(false);
    expect(() => sphere.physics.snapshot()).not.toThrow();
    expect(scene.getObjectByName(REFERENCE_FLOATING_SPHERE_NAME)).toBe(mesh);
    sphere.dispose();
    expect(
      scene.getObjectByName(REFERENCE_FLOATING_SPHERE_NAME),
    ).toBeUndefined();
  });
});
