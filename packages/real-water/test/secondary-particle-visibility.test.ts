import { describe, expect, it } from "vitest";
import {
  PerspectiveCamera,
  WebGLCoordinateSystem,
  WebGPUCoordinateSystem,
} from "three/webgpu";
import { createSecondaryParticleOutputFrustumVisibility } from "../src/secondary-particle-visibility.js";

function camera(
  coordinateSystem:
    typeof WebGLCoordinateSystem | typeof WebGPUCoordinateSystem,
): PerspectiveCamera {
  const value = new PerspectiveCamera(90, 1, 1, 10);
  value.coordinateSystem = coordinateSystem;
  value.updateProjectionMatrix();
  value.updateMatrixWorld(true);
  return value;
}

describe("secondary-particle output-frustum visibility", () => {
  it.each([WebGLCoordinateSystem, WebGPUCoordinateSystem])(
    "rejects support behind the camera, outside near/far, or outside the output for coordinate system %s",
    (coordinateSystem) => {
      const visibility = createSecondaryParticleOutputFrustumVisibility({
        width: 100,
        height: 100,
        space: "output-drawing-buffer",
      });
      const view = camera(coordinateSystem);

      expect(visibility.evaluate(view, 0, 0, -5, 1)).toBe(1);
      expect(visibility.evaluate(view, 0, 0, 1, 1)).toBe(0);
      expect(visibility.evaluate(view, 0, 0, -0.5, 1)).toBe(0);
      expect(visibility.evaluate(view, 0, 0, -11, 1)).toBe(0);
      expect(visibility.evaluate(view, 20, 0, -5, 1)).toBe(0);
      expect(visibility.evaluate(view, 0, 20, -5, 1)).toBe(0);
    },
  );

  it("keeps a center outside NDC only while its sprite radius intersects the output", () => {
    const visibility = createSecondaryParticleOutputFrustumVisibility({
      width: 100,
      height: 100,
      space: "output-drawing-buffer",
    });
    const view = camera(WebGPUCoordinateSystem);

    expect(visibility.evaluate(view, 5.2, 0, -5, 4)).toBe(1);
    expect(visibility.evaluate(view, 5.6, 0, -5, 4)).toBe(0);
  });
});
