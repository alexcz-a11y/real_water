import { describe, expect, it } from "vitest";
import {
  Matrix4,
  PerspectiveCamera,
  Vector4,
  WebGPUCoordinateSystem,
} from "three";
import {
  HORIZONTAL_PLANAR_REFLECTION_PLANE,
  createHorizontalPlanarReflectionView,
  isWebGpuPlanarProjectionSampleValid,
  liftWorldPerspectiveCameraAboveHorizontalPlane,
} from "../src/reflection.js";

function hostProjection(fov = 50, aspect = 16 / 9, near = 0.1, far = 200) {
  const camera = new PerspectiveCamera(fov, aspect, near, far);
  camera.coordinateSystem = WebGPUCoordinateSystem;
  camera.updateProjectionMatrix();
  return camera.projectionMatrix.toArray();
}

function viewProjection(
  view: ReturnType<typeof createHorizontalPlanarReflectionView>,
): Matrix4 {
  const camera = new PerspectiveCamera();
  camera.coordinateSystem = WebGPUCoordinateSystem;
  camera.position.set(view.position[0], view.position[1], view.position[2]);
  camera.up.set(view.up[0], view.up[1], view.up[2]);
  camera.lookAt(view.target[0], view.target[1], view.target[2]);
  camera.updateMatrixWorld();
  camera.projectionMatrix.fromArray(view.projectionMatrix);
  camera.projectionMatrixInverse.fromArray(view.projectionMatrixInverse);
  return new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
}

function projectWithView(
  view: ReturnType<typeof createHorizontalPlanarReflectionView>,
  world: readonly [number, number, number],
): Vector4 {
  return new Vector4(world[0], world[1], world[2], 1).applyMatrix4(
    viewProjection(view),
  );
}

function expectIdentity(matrix: Matrix4): void {
  const identity = new Matrix4();
  for (let index = 0; index < 16; index += 1) {
    expect(matrix.elements[index] ?? 0).toBeCloseTo(
      identity.elements[index] ?? 0,
      5,
    );
  }
}

describe("horizontal XZ planar reflection view", () => {
  it("reflects a camera across the XZ plane and inverts its oblique projection", () => {
    const view = createHorizontalPlanarReflectionView({
      coordinateSystem: "webgpu",
      planeY: 0,
      camera: {
        position: [0, 10, 18],
        target: [0, 0, 0],
        up: [0, 1, 0],
        projectionMatrix: hostProjection(),
      },
    });

    expect(view.plane).toBe(HORIZONTAL_PLANAR_REFLECTION_PLANE);
    expect(view.planeY).toBe(0);
    expect(view.facing).toBe(true);
    expect(view.hasOutput).toBe(true);
    expect(view.position).toEqual([0, -10, 18]);
    expect(view.target).toEqual([0, 0, 0]);
    expect(view.up).toEqual([0, -1, 0]);
    expectIdentity(
      new Matrix4()
        .fromArray(view.projectionMatrix)
        .multiply(new Matrix4().fromArray(view.projectionMatrixInverse)),
    );
    expect(Object.isFrozen(view)).toBe(true);
  });

  it("projects above, on, and below a non-zero plane from the returned pose", () => {
    const view = createHorizontalPlanarReflectionView({
      coordinateSystem: "webgpu",
      planeY: 3,
      camera: {
        position: [6, 11, 14],
        target: [2, 3, -4],
        up: [0.1, 1, 0],
        projectionMatrix: hostProjection(40, 1.6, 0.2, 80),
      },
    });

    expect(view.position).toEqual([6, -5, 14]);
    expect(view.target).toEqual([2, 3, -4]);
    expectIdentity(
      new Matrix4()
        .fromArray(view.projectionMatrix)
        .multiply(new Matrix4().fromArray(view.projectionMatrixInverse)),
    );
    const onPlane = projectWithView(view, [2, 3, -4]);
    const belowPlane = projectWithView(view, [2, -1, -4]);
    const abovePlane = projectWithView(view, [2, 8, -10]);
    expect(onPlane.w).toBeGreaterThan(0);
    expect(onPlane.z / onPlane.w).toBeCloseTo(0, 4);
    expect(belowPlane.z / belowPlane.w).toBeLessThan(0);
    expect(abovePlane.z / abovePlane.w).toBeGreaterThan(0);
    expect(
      isWebGpuPlanarProjectionSampleValid([
        belowPlane.x,
        belowPlane.y,
        belowPlane.z,
        belowPlane.w,
      ]),
    ).toBe(false);
    expect(
      isWebGpuPlanarProjectionSampleValid([
        abovePlane.x,
        abovePlane.y,
        abovePlane.z,
        abovePlane.w,
      ]),
    ).toBe(true);
  });

  it("reports no output when the Host camera is on or below the plane", () => {
    const below = createHorizontalPlanarReflectionView({
      coordinateSystem: "webgpu",
      planeY: 0,
      camera: {
        position: [0, -2, 8],
        target: [0, 0, 0],
        up: [0, 1, 0],
        projectionMatrix: hostProjection(),
      },
    });
    const onPlane = createHorizontalPlanarReflectionView({
      coordinateSystem: "webgpu",
      planeY: 0,
      camera: {
        position: [0, 0, 8],
        target: [0, 0, 0],
        up: [0, 1, 0],
        projectionMatrix: hostProjection(),
      },
    });
    expect(below.facing).toBe(false);
    expect(below.hasOutput).toBe(false);
    expect(below.position).toEqual([0, 2, 8]);
    expect(onPlane.hasOutput).toBe(false);
  });
});

describe("forced facing world camera lift", () => {
  it("translates target by the same deltaY and keeps forward and up", () => {
    const lifted = liftWorldPerspectiveCameraAboveHorizontalPlane(
      {
        position: [0, -2, 8],
        target: [0, 0, 0],
        up: [0, 1, 0],
      },
      0,
    );
    expect(lifted.position).toEqual([0, 2, 8]);
    expect(lifted.target).toEqual([0, 4, 0]);
    expect(lifted.up).toEqual([0, 1, 0]);
    expect(lifted.target[1] - lifted.position[1]).toBeCloseTo(2);
    expect(lifted.target[0] - lifted.position[0]).toBe(0);
    expect(lifted.target[2] - lifted.position[2]).toBe(-8);
  });

  it("does not collapse an on-plane camera that looks along +Y", () => {
    const lifted = liftWorldPerspectiveCameraAboveHorizontalPlane(
      {
        position: [4, 0, -3],
        target: [4, 1, -3],
        up: [1, 0, 0],
      },
      0,
    );
    expect(lifted.position[1]).toBeGreaterThan(0);
    expect(lifted.position).not.toEqual(lifted.target);
    expect(lifted.target[1] - lifted.position[1]).toBeCloseTo(1);
    expect(lifted.up).toEqual([1, 0, 0]);
  });
});

describe("WebGPU planar projection sample validity", () => {
  it("accepts an interior frustum sample and rejects w, z, and xy misses", () => {
    expect(isWebGpuPlanarProjectionSampleValid([0, 0, 0.25, 1])).toBe(true);
    expect(isWebGpuPlanarProjectionSampleValid([0, 0, 0, 1])).toBe(true);
    expect(isWebGpuPlanarProjectionSampleValid([0, 0, 1, 1])).toBe(true);
    expect(isWebGpuPlanarProjectionSampleValid([0, 0, 0.25, 0])).toBe(false);
    expect(isWebGpuPlanarProjectionSampleValid([0, 0, 0.25, -1])).toBe(false);
    expect(isWebGpuPlanarProjectionSampleValid([0, 0, -0.01, 1])).toBe(false);
    expect(isWebGpuPlanarProjectionSampleValid([0, 0, 1.01, 1])).toBe(false);
    expect(isWebGpuPlanarProjectionSampleValid([0, 0, 0.6, 0.5])).toBe(false);
    expect(isWebGpuPlanarProjectionSampleValid([Number.NaN, 0, 0.25, 1])).toBe(
      false,
    );
    expect(isWebGpuPlanarProjectionSampleValid([1.01, 0, 0.25, 1])).toBe(false);
    expect(isWebGpuPlanarProjectionSampleValid([0, -1.01, 0.25, 1])).toBe(
      false,
    );
  });

  it("treats a Y-flipped interior UV as valid and an off-screen Y as a miss", () => {
    expect(isWebGpuPlanarProjectionSampleValid([0.4, 0.8, 0.3, 1])).toBe(true);
    expect(isWebGpuPlanarProjectionSampleValid([0.4, 1.2, 0.3, 1])).toBe(false);
  });
});
