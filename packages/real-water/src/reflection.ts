/**
 * Package-private horizontal XZ planar-reflection view and WebGPU
 * oblique-clip math. The Core pass consumes this view; it is not a root export.
 */

export const HORIZONTAL_PLANAR_REFLECTION_PLANE = "xz" as const;

/**
 * One Host perspective camera expressed as numbers.
 */
export interface HorizontalPlanarReflectionCamera {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly projectionMatrix: readonly number[];
}

/**
 * Inputs for the horizontal XZ planar reflection view.
 */
export interface HorizontalPlanarReflectionViewInput {
  readonly camera: HorizontalPlanarReflectionCamera;
  readonly planeY: number;
  readonly coordinateSystem: "webgpu";
}

/**
 * Reflected virtual camera plus facing/output flags and the oblique projection.
 */
export interface HorizontalPlanarReflectionView {
  readonly plane: typeof HORIZONTAL_PLANAR_REFLECTION_PLANE;
  readonly planeY: number;
  readonly facing: boolean;
  readonly hasOutput: boolean;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly projectionMatrix: readonly number[];
  readonly projectionMatrixInverse: readonly number[];
}

/**
 * Raises a world-space perspective camera above `planeY` by translating the
 * eye and look-at target by the same deltaY so forward and up stay intact.
 * Used only to force a facing compile path; it is not a root export.
 */
export function liftWorldPerspectiveCameraAboveHorizontalPlane(
  camera: Pick<HorizontalPlanarReflectionCamera, "position" | "target" | "up">,
  planeY: number,
): Pick<HorizontalPlanarReflectionCamera, "position" | "target" | "up"> {
  if (!Number.isFinite(planeY)) {
    throw new TypeError(
      "Lifting a planar camera above the water requires a finite plane.",
    );
  }
  const lift = Math.max(planeY - camera.position[1], 1);
  const raisedY = planeY + lift;
  const deltaY = raisedY - camera.position[1];
  return {
    position: [camera.position[0], raisedY, camera.position[2]],
    target: [camera.target[0], camera.target[1] + deltaY, camera.target[2]],
    up: camera.up,
  };
}

/**
 * Reflects a perspective camera across a horizontal XZ plane and applies the
 * WebGPU oblique clip so geometry below the water is not sampled as a hit.
 */
export function createHorizontalPlanarReflectionView(
  input: HorizontalPlanarReflectionViewInput,
): HorizontalPlanarReflectionView {
  if (input.coordinateSystem !== "webgpu") {
    throw new TypeError(
      "Horizontal planar reflection requires the WebGPU coordinate system.",
    );
  }
  if (
    !Number.isFinite(input.planeY) ||
    input.camera.projectionMatrix.length !== 16 ||
    input.camera.projectionMatrix.some((value) => !Number.isFinite(value))
  ) {
    throw new TypeError(
      "Horizontal planar reflection requires a finite plane and 4x4 projection.",
    );
  }

  const planeY = input.planeY;
  const facing = input.camera.position[1] > planeY;
  const position = reflectPointAcrossXZ(input.camera.position, planeY);
  const target = reflectPointAcrossXZ(input.camera.target, planeY);
  const up = reflectDirectionAcrossXZ(input.camera.up);
  const projection = facing
    ? applyWebGpuObliqueClip(
        input.camera.projectionMatrix,
        lookAtViewMatrix(position, target, up),
        planeY,
      )
    : [...input.camera.projectionMatrix];

  return Object.freeze({
    plane: HORIZONTAL_PLANAR_REFLECTION_PLANE,
    planeY,
    facing,
    hasOutput: facing,
    position: Object.freeze(position) as readonly [number, number, number],
    target: Object.freeze(target) as readonly [number, number, number],
    up: Object.freeze(up) as readonly [number, number, number],
    projectionMatrix: Object.freeze(projection),
    projectionMatrixInverse: Object.freeze(invertMatrix4(projection)),
  });
}

/**
 * Host-shader projected-sample gate for a WebGPU clip-space position.
 * Strict positive w, normal 0 <= z <= w, and NDC xy in [-1, 1]. Any failure
 * is a miss and must fall back to Host environment.
 */
export function isWebGpuPlanarProjectionSampleValid(
  clip: readonly [number, number, number, number],
): boolean {
  const clipX = clip[0];
  const clipY = clip[1];
  const clipZ = clip[2];
  const clipW = clip[3];
  if (
    !Number.isFinite(clipX) ||
    !Number.isFinite(clipY) ||
    !Number.isFinite(clipZ) ||
    !Number.isFinite(clipW) ||
    !(clipW > 0) ||
    clipZ < 0 ||
    clipZ > clipW
  ) {
    return false;
  }
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  return ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1;
}

function reflectPointAcrossXZ(
  point: readonly [number, number, number],
  planeY: number,
): [number, number, number] {
  return [point[0], 2 * planeY - point[1], point[2]];
}

function reflectDirectionAcrossXZ(
  direction: readonly [number, number, number],
): [number, number, number] {
  return [direction[0], -direction[1], direction[2]];
}

function lookAtViewMatrix(
  eye: readonly [number, number, number],
  target: readonly [number, number, number],
  up: readonly [number, number, number],
): number[] {
  const z = normalize([
    eye[0] - target[0],
    eye[1] - target[1],
    eye[2] - target[2],
  ]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return [
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ];
}

function applyWebGpuObliqueClip(
  projectionMatrix: readonly number[],
  viewMatrix: readonly number[],
  planeY: number,
): number[] {
  const projection = requireMatrix4(projectionMatrix);
  const viewPlane = transformPlaneByMatrix([0, 1, 0, -planeY], viewMatrix);
  const clipPlane: [number, number, number, number] = [
    viewPlane[0],
    viewPlane[1],
    viewPlane[2],
    viewPlane[3],
  ];
  const q: [number, number, number, number] = [
    (Math.sign(clipPlane[0]) + projection[8]) / projection[0],
    (Math.sign(clipPlane[1]) + projection[9]) / projection[5],
    -1,
    (1 + projection[10]) / projection[14],
  ];
  const scale = 1 / dot4(clipPlane, q);
  clipPlane[0] *= scale;
  clipPlane[1] *= scale;
  clipPlane[2] *= scale;
  clipPlane[3] *= scale;
  projection[2] = clipPlane[0];
  projection[6] = clipPlane[1];
  projection[10] = clipPlane[2];
  projection[14] = clipPlane[3];
  return projection;
}

function transformPlaneByMatrix(
  plane: readonly [number, number, number, number],
  matrix: readonly number[],
): [number, number, number, number] {
  const inverseTranspose = transposeMatrix4(invertMatrix4(matrix));
  return multiplyMatrix4Vector4(inverseTranspose, plane);
}

function multiplyMatrix4Vector4(
  matrix: readonly number[],
  vector: readonly [number, number, number, number],
): [number, number, number, number] {
  const m = requireMatrix4(matrix);
  return [
    m[0] * vector[0] + m[4] * vector[1] + m[8] * vector[2] + m[12] * vector[3],
    m[1] * vector[0] + m[5] * vector[1] + m[9] * vector[2] + m[13] * vector[3],
    m[2] * vector[0] + m[6] * vector[1] + m[10] * vector[2] + m[14] * vector[3],
    m[3] * vector[0] + m[7] * vector[1] + m[11] * vector[2] + m[15] * vector[3],
  ];
}

function invertMatrix4(matrix: readonly number[]): number[] {
  const m = requireMatrix4(matrix);
  const n11 = m[0],
    n21 = m[1],
    n31 = m[2],
    n41 = m[3];
  const n12 = m[4],
    n22 = m[5],
    n32 = m[6],
    n42 = m[7];
  const n13 = m[8],
    n23 = m[9],
    n33 = m[10],
    n43 = m[11];
  const n14 = m[12],
    n24 = m[13],
    n34 = m[14],
    n44 = m[15];
  const t11 =
    n23 * n34 * n42 -
    n24 * n33 * n42 +
    n24 * n32 * n43 -
    n22 * n34 * n43 -
    n23 * n32 * n44 +
    n22 * n33 * n44;
  const t12 =
    n14 * n33 * n42 -
    n13 * n34 * n42 -
    n14 * n32 * n43 +
    n12 * n34 * n43 +
    n13 * n32 * n44 -
    n12 * n33 * n44;
  const t13 =
    n13 * n24 * n42 -
    n14 * n23 * n42 +
    n14 * n22 * n43 -
    n12 * n24 * n43 -
    n13 * n22 * n44 +
    n12 * n23 * n44;
  const t14 =
    n14 * n23 * n32 -
    n13 * n24 * n32 -
    n14 * n22 * n33 +
    n12 * n24 * n33 +
    n13 * n22 * n34 -
    n12 * n23 * n34;
  const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
  if (det === 0) {
    throw new RangeError("The planar projection matrix is not invertible.");
  }
  const inv = 1 / det;
  return [
    t11 * inv,
    (n24 * n33 * n41 -
      n23 * n34 * n41 -
      n24 * n31 * n43 +
      n21 * n34 * n43 +
      n23 * n31 * n44 -
      n21 * n33 * n44) *
      inv,
    (n22 * n34 * n41 -
      n24 * n32 * n41 +
      n24 * n31 * n42 -
      n21 * n34 * n42 -
      n22 * n31 * n44 +
      n21 * n32 * n44) *
      inv,
    (n23 * n32 * n41 -
      n22 * n33 * n41 -
      n23 * n31 * n42 +
      n21 * n33 * n42 +
      n22 * n31 * n43 -
      n21 * n32 * n43) *
      inv,
    t12 * inv,
    (n13 * n34 * n41 -
      n14 * n33 * n41 +
      n14 * n31 * n43 -
      n11 * n34 * n43 -
      n13 * n31 * n44 +
      n11 * n33 * n44) *
      inv,
    (n14 * n32 * n41 -
      n12 * n34 * n41 -
      n14 * n31 * n42 +
      n11 * n34 * n42 +
      n12 * n31 * n44 -
      n11 * n32 * n44) *
      inv,
    (n12 * n33 * n41 -
      n13 * n32 * n41 +
      n13 * n31 * n42 -
      n11 * n33 * n42 -
      n12 * n31 * n43 +
      n11 * n32 * n43) *
      inv,
    t13 * inv,
    (n14 * n23 * n41 -
      n13 * n24 * n41 -
      n14 * n21 * n43 +
      n11 * n24 * n43 +
      n13 * n21 * n44 -
      n11 * n23 * n44) *
      inv,
    (n12 * n24 * n41 -
      n14 * n22 * n41 +
      n14 * n21 * n42 -
      n11 * n24 * n42 -
      n12 * n21 * n44 +
      n11 * n22 * n44) *
      inv,
    (n13 * n22 * n41 -
      n12 * n23 * n41 -
      n13 * n21 * n42 +
      n11 * n23 * n42 +
      n12 * n21 * n43 -
      n11 * n22 * n43) *
      inv,
    t14 * inv,
    (n13 * n24 * n31 -
      n14 * n23 * n31 +
      n14 * n21 * n33 -
      n11 * n24 * n33 -
      n13 * n21 * n34 +
      n11 * n23 * n34) *
      inv,
    (n14 * n22 * n31 -
      n12 * n24 * n31 -
      n14 * n21 * n32 +
      n11 * n24 * n32 +
      n12 * n21 * n34 -
      n11 * n22 * n34) *
      inv,
    (n12 * n23 * n31 -
      n13 * n22 * n31 +
      n13 * n21 * n32 -
      n11 * n23 * n32 -
      n12 * n21 * n33 +
      n11 * n22 * n33) *
      inv,
  ];
}

type Matrix4Array = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

function requireMatrix4(matrix: readonly number[]): Matrix4Array {
  if (matrix.length !== 16) {
    throw new TypeError("A 4x4 matrix requires 16 finite numbers.");
  }
  const copy: number[] = [];
  for (let index = 0; index < 16; index += 1) {
    const value = matrix[index];
    if (value === undefined || !Number.isFinite(value)) {
      throw new TypeError("A 4x4 matrix requires 16 finite numbers.");
    }
    copy.push(value);
  }
  return copy as Matrix4Array;
}

function transposeMatrix4(matrix: readonly number[]): Matrix4Array {
  const m = requireMatrix4(matrix);
  return [
    m[0],
    m[4],
    m[8],
    m[12],
    m[1],
    m[5],
    m[9],
    m[13],
    m[2],
    m[6],
    m[10],
    m[14],
    m[3],
    m[7],
    m[11],
    m[15],
  ];
}

function cross(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function dot4(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

function normalize(
  value: readonly [number, number, number],
): [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length === 0) {
    throw new RangeError("The planar camera basis is degenerate.");
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}
