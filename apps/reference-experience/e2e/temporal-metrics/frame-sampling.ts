import { Buffer } from "node:buffer";

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface WaterBandConfig {
  readonly y0: number;
  readonly y1: number;
  readonly depthMin: number;
  readonly depthMax: number;
  readonly fresnelMin: number;
  readonly normalMin: number;
  readonly normalMax: number;
}

export interface MetricCamera {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly verticalFovDegrees: number;
  readonly near: number;
  readonly far: number;
}

export interface EncodedFrameBuffers {
  readonly current: string;
  readonly final: string;
  readonly motion: string;
  readonly depth: string;
  readonly normal: string;
  readonly fresnel: string;
  readonly glint: string;
}

export function decodeFloat32(encoded: string): number[] {
  const bytes = Buffer.from(encoded, "base64");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 4 }, (_, index) =>
    view.getFloat32(index * 4, true),
  );
}

export function decodeUint8(encoded: string): Uint8Array {
  return Uint8Array.from(Buffer.from(encoded, "base64"));
}

export function subtract(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): readonly [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

export function cross(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): readonly [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function dot(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function normalize(
  value: readonly [number, number, number],
): readonly [number, number, number] {
  const length = Math.hypot(...value);
  return [value[0] / length, value[1] / length, value[2] / length];
}

export function mix(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

export function cameraAxes(camera: MetricCamera): {
  readonly position: readonly [number, number, number];
  readonly forward: readonly [number, number, number];
  readonly right: readonly [number, number, number];
  readonly cameraUp: readonly [number, number, number];
  readonly tanY: number;
} {
  const forward = normalize(subtract(camera.target, camera.position));
  const right = normalize(cross(forward, camera.up));
  return {
    position: camera.position,
    forward,
    right,
    cameraUp: cross(right, forward),
    tanY: Math.tan((camera.verticalFovDegrees * Math.PI) / 360),
  };
}

export function unprojectPixelViewDepth(
  camera: MetricCamera,
  viewport: ViewportSize,
  pixelX: number,
  pixelY: number,
  viewDepth: number,
): readonly [number, number, number] | null {
  if (!(viewDepth > camera.near) || viewDepth >= camera.far) {
    return null;
  }
  const axes = cameraAxes(camera);
  const ndcX = (pixelX / viewport.width) * 2 - 1;
  const ndcY = 1 - (pixelY / viewport.height) * 2;
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) {
    return null;
  }
  const aspect = viewport.width / viewport.height;
  const viewX = ndcX * viewDepth * axes.tanY * aspect;
  const viewY = ndcY * viewDepth * axes.tanY;
  return [
    axes.position[0] +
      axes.right[0] * viewX +
      axes.cameraUp[0] * viewY +
      axes.forward[0] * viewDepth,
    axes.position[1] +
      axes.right[1] * viewX +
      axes.cameraUp[1] * viewY +
      axes.forward[1] * viewDepth,
    axes.position[2] +
      axes.right[2] * viewX +
      axes.cameraUp[2] * viewY +
      axes.forward[2] * viewDepth,
  ];
}

export function viewDepthAlongCamera(
  camera: MetricCamera,
  world: readonly [number, number, number],
): number {
  return dot(subtract(world, camera.position), cameraAxes(camera).forward);
}

export function viewNormalToWorld(
  camera: MetricCamera,
  viewNormal: readonly [number, number, number] | null,
): readonly [number, number, number] | null {
  if (viewNormal === null) {
    return null;
  }
  const axes = cameraAxes(camera);
  const world: readonly [number, number, number] = [
    axes.right[0] * viewNormal[0] +
      axes.cameraUp[0] * viewNormal[1] -
      axes.forward[0] * viewNormal[2],
    axes.right[1] * viewNormal[0] +
      axes.cameraUp[1] * viewNormal[1] -
      axes.forward[1] * viewNormal[2],
    axes.right[2] * viewNormal[0] +
      axes.cameraUp[2] * viewNormal[1] -
      axes.forward[2] * viewNormal[2],
  ];
  return Math.hypot(...world) > 0 ? normalize(world) : null;
}

export function sampleBilinear(
  data: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
  components: number,
  component: number,
): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  if (x0 < 0 || y0 < 0 || x1 >= width || y1 >= height) {
    return null;
  }
  const tx = x - x0;
  const ty = y - y0;
  const v00 = data[(y0 * width + x0) * components + component];
  const v10 = data[(y0 * width + x1) * components + component];
  const v01 = data[(y1 * width + x0) * components + component];
  const v11 = data[(y1 * width + x1) * components + component];
  if (
    v00 === undefined ||
    v10 === undefined ||
    v01 === undefined ||
    v11 === undefined ||
    !Number.isFinite(v00) ||
    !Number.isFinite(v10) ||
    !Number.isFinite(v01) ||
    !Number.isFinite(v11)
  ) {
    return null;
  }
  return mix(mix(v00, v10, tx), mix(v01, v11, tx), ty);
}

export function sampleBilinearRgba(
  data: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): Uint8Array | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  if (x0 < 0 || y0 < 0 || x1 >= width || y1 >= height) {
    return null;
  }
  const tx = x - x0;
  const ty = y - y0;
  const sampled = new Uint8Array(4);
  for (let channel = 0; channel < 4; channel += 1) {
    const v00 = data[(y0 * width + x0) * 4 + channel] ?? 0;
    const v10 = data[(y0 * width + x1) * 4 + channel] ?? 0;
    const v01 = data[(y1 * width + x0) * 4 + channel] ?? 0;
    const v11 = data[(y1 * width + x1) * 4 + channel] ?? 0;
    sampled[channel] = Math.round(
      mix(mix(v00, v10, tx), mix(v01, v11, tx), ty),
    );
  }
  return sampled;
}

export function sampleViewDepth(
  data: readonly number[],
  width: number,
  height: number,
  x: number,
  y: number,
): number | null {
  const bilinear = sampleBilinear(data, width, height, x, y, 1, 0);
  if (bilinear !== null) {
    return bilinear;
  }
  const nearestX = Math.round(x);
  const nearestY = Math.round(y);
  if (nearestX < 0 || nearestY < 0 || nearestX >= width || nearestY >= height) {
    return null;
  }
  const value = data[nearestY * width + nearestX];
  return value !== undefined && Number.isFinite(value) ? value : null;
}

export function sampleViewNormal(
  data: readonly number[],
  width: number,
  height: number,
  x: number,
  y: number,
): readonly [number, number, number] | null {
  const nx = sampleBilinear(data, width, height, x, y, 3, 0);
  const ny = sampleBilinear(data, width, height, x, y, 3, 1);
  const nz = sampleBilinear(data, width, height, x, y, 3, 2);
  if (nx === null || ny === null || nz === null) {
    return null;
  }
  return [nx, ny, nz];
}

export function motionPixels(
  motion: ArrayLike<number>,
  pixel: number,
  width: number,
  height: number,
): readonly [number, number] {
  return [
    (motion[pixel * 2] ?? 0) * (width / 2),
    -(motion[pixel * 2 + 1] ?? 0) * (height / 2),
  ];
}

export function historyUvInBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return false;
  }
  const u = (x + 0.5) / width;
  const v = (y + 0.5) / height;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

export function everyFiniteInRangeMotionIsOob(
  x: number,
  y: number,
  motion: readonly number[],
  depth: readonly number[],
  width: number,
  height: number,
  depthMin: number,
  depthMax: number,
): boolean {
  let candidates = 0;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
        continue;
      }
      const pixel = nextY * width + nextX;
      const motionX = motion[pixel * 2];
      const motionY = motion[pixel * 2 + 1];
      const depthValue = depth[pixel] ?? Number.NaN;
      if (
        motionX === undefined ||
        motionY === undefined ||
        !Number.isFinite(motionX) ||
        !Number.isFinite(motionY) ||
        !Number.isFinite(depthValue) ||
        depthValue < depthMin ||
        depthValue > depthMax
      ) {
        continue;
      }
      candidates += 1;
      const prevX = x - motionX * (width / 2);
      const prevY = y + motionY * (height / 2);
      if (historyUvInBounds(prevX, prevY, width, height)) {
        return false;
      }
    }
  }
  return candidates > 0;
}

export function normalAt(
  normals: ArrayLike<number>,
  pixel: number,
): readonly [number, number, number] | null {
  const nx = normals[pixel * 3];
  const ny = normals[pixel * 3 + 1];
  const nz = normals[pixel * 3 + 2];
  if (nx === undefined || ny === undefined || nz === undefined) {
    return null;
  }
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) {
    return null;
  }
  return [nx, ny, nz];
}

export function isRouteWaterPixel(
  pixel: number,
  x: number,
  y: number,
  depth: ArrayLike<number>,
  fresnel: ArrayLike<number>,
  normals: ArrayLike<number>,
  viewport: ViewportSize,
  water: WaterBandConfig,
): boolean {
  const yNorm = (y + 0.5) / viewport.height;
  if (yNorm < water.y0 || yNorm > water.y1) {
    return false;
  }
  void x;
  const depthValue = depth[pixel] ?? Number.NaN;
  const fresnelValue = fresnel[pixel] ?? Number.NaN;
  const normal = normalAt(normals, pixel);
  if (normal === null) {
    return false;
  }
  const normalLength = Math.hypot(...normal);
  return (
    fresnelValue > water.fresnelMin &&
    depthValue >= water.depthMin &&
    depthValue <= water.depthMax &&
    normalLength >= water.normalMin &&
    normalLength <= water.normalMax
  );
}

export function isGlintLimitedWaterPixel(
  pixel: number,
  x: number,
  y: number,
  depth: ArrayLike<number>,
  fresnel: ArrayLike<number>,
  normals: ArrayLike<number>,
  glint: ArrayLike<number>,
  viewport: ViewportSize,
  water: WaterBandConfig,
  glintMax: number,
): boolean {
  const glintValue = glint[pixel] ?? Number.NaN;
  return (
    isRouteWaterPixel(pixel, x, y, depth, fresnel, normals, viewport, water) &&
    glintValue < glintMax
  );
}

export function srgb8ToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

export function linearLumaRgba(
  data: ArrayLike<number>,
  offset: number,
): number {
  return (
    0.2126 * srgb8ToLinear(data[offset] ?? 0) +
    0.7152 * srgb8ToLinear(data[offset + 1] ?? 0) +
    0.0722 * srgb8ToLinear(data[offset + 2] ?? 0)
  );
}

export function luma8(data: ArrayLike<number>, offset: number): number {
  return (
    0.2126 * (data[offset] ?? 0) +
    0.7152 * (data[offset + 1] ?? 0) +
    0.0722 * (data[offset + 2] ?? 0)
  );
}

export function lumaPlane(rgba: Uint8Array, pixelCount: number): Float32Array {
  const luma = new Float32Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    luma[pixel] = luma8(rgba, pixel * 4);
  }
  return luma;
}

export function channelAbsMax(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
  offset: number,
): number {
  let maximum = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    const delta = Math.abs(
      (left[offset + channel] ?? 0) - (right[offset + channel] ?? 0),
    );
    if (delta > maximum) {
      maximum = delta;
    }
  }
  return maximum;
}

export function motionAxisStep(
  motionX: number,
  motionY: number,
): readonly [number, number] | null {
  const magnitude = Math.hypot(motionX, motionY);
  if (magnitude < 1e-6) {
    return null;
  }
  const stepX =
    Math.round(motionX / magnitude) ||
    (Math.abs(motionX) >= Math.abs(motionY) ? Math.sign(motionX) : 0);
  const stepY =
    Math.round(motionY / magnitude) ||
    (Math.abs(motionY) > Math.abs(motionX) ? Math.sign(motionY) : 0);
  if (stepX === 0 && stepY === 0) {
    return null;
  }
  return [stepX, stepY];
}

export function longestPositiveTrail(
  positive: Uint8Array,
  motionX: Float32Array,
  motionY: Float32Array,
  width: number,
  height: number,
): number {
  const assigned = new Uint8Array(width * height);
  const component = new Uint8Array(width * height);
  const stack: number[] = [];
  let longest = 0;
  for (let seed = 0; seed < positive.length; seed += 1) {
    if (positive[seed] !== 1 || assigned[seed] === 1) {
      continue;
    }
    stack.length = 0;
    stack.push(seed);
    assigned[seed] = 1;
    const members: number[] = [];
    let axisX = 0;
    let axisY = 0;
    while (stack.length > 0) {
      const pixel = stack.pop();
      if (pixel === undefined) {
        break;
      }
      members.push(pixel);
      component[pixel] = 1;
      axisX += motionX[pixel] ?? 0;
      axisY += motionY[pixel] ?? 0;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) {
            continue;
          }
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
            continue;
          }
          const next = nextY * width + nextX;
          if (positive[next] !== 1 || assigned[next] === 1) {
            continue;
          }
          assigned[next] = 1;
          stack.push(next);
        }
      }
    }
    const step = motionAxisStep(axisX, axisY);
    if (step === null) {
      longest = Math.max(longest, members.length > 0 ? 1 : 0);
    } else {
      const walked = new Uint8Array(width * height);
      for (const member of members) {
        if (walked[member] === 1) {
          continue;
        }
        let x = member % width;
        let y = Math.floor(member / width);
        while (true) {
          const backX = x - step[0];
          const backY = y - step[1];
          if (
            backX < 0 ||
            backY < 0 ||
            backX >= width ||
            backY >= height ||
            component[backY * width + backX] !== 1
          ) {
            break;
          }
          x = backX;
          y = backY;
        }
        let length = 0;
        while (x >= 0 && y >= 0 && x < width && y < height) {
          const index = y * width + x;
          if (component[index] !== 1) {
            break;
          }
          walked[index] = 1;
          length += 1;
          x += step[0];
          y += step[1];
        }
        if (length > longest) {
          longest = length;
        }
      }
    }
    for (const member of members) {
      component[member] = 0;
    }
  }
  return longest;
}

export function warpFloatField(
  previous: Float32Array,
  motion: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const warped = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const motionPx = motionPixels(motion, pixel, width, height);
      warped[pixel] =
        sampleBilinear(
          previous,
          width,
          height,
          x - motionPx[0],
          y - motionPx[1],
          1,
          0,
        ) ?? 0;
    }
  }
  return warped;
}

export function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  let current = mask;
  for (let step = 0; step < radius; step += 1) {
    const dilated = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let filled = 0;
        for (let offsetY = -1; offsetY <= 1 && filled === 0; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const nextX = x + offsetX;
            const nextY = y + offsetY;
            if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
              continue;
            }
            if (current[nextY * width + nextX] === 1) {
              filled = 1;
              break;
            }
          }
        }
        dilated[y * width + x] = filled;
      }
    }
    current = dilated;
  }
  return current;
}

export function unionMasks(left: Uint8Array, right: Uint8Array): Uint8Array {
  const union = new Uint8Array(left.length);
  for (let pixel = 0; pixel < left.length; pixel += 1) {
    union[pixel] = left[pixel] === 1 || right[pixel] === 1 ? 1 : 0;
  }
  return union;
}

export function countMask(mask: Uint8Array): number {
  let count = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel] === 1) {
      count += 1;
    }
  }
  return count;
}

export function intersectCount(left: Uint8Array, right: Uint8Array): number {
  let count = 0;
  const length = Math.min(left.length, right.length);
  for (let pixel = 0; pixel < length; pixel += 1) {
    if (left[pixel] === 1 && right[pixel] === 1) {
      count += 1;
    }
  }
  return count;
}

export function clipMask(mask: Uint8Array, keep: Uint8Array): Uint8Array {
  const clipped = new Uint8Array(mask.length);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    clipped[pixel] = mask[pixel] === 1 && keep[pixel] === 1 ? 1 : 0;
  }
  return clipped;
}

export function orMaskInto(target: Uint8Array, source: Uint8Array): void {
  for (let pixel = 0; pixel < target.length; pixel += 1) {
    if (source[pixel] === 1) {
      target[pixel] = 1;
    }
  }
}

export function waterMotionMagnitudesPx(
  motion: readonly number[],
  fresnel: readonly number[],
  depth: readonly number[],
  normals: readonly number[],
  width: number,
  height: number,
): number[] {
  const magnitudes: number[] = [];
  const pixelCount = width * height;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const fresnelValue = fresnel[pixel] ?? Number.NaN;
    const depthValue = depth[pixel] ?? Number.NaN;
    const nx = normals[pixel * 3] ?? Number.NaN;
    const ny = normals[pixel * 3 + 1] ?? Number.NaN;
    const nz = normals[pixel * 3 + 2] ?? Number.NaN;
    const normalLength = Math.hypot(nx, ny, nz);
    if (
      !(fresnelValue > 0.001) ||
      !Number.isFinite(depthValue) ||
      normalLength < 0.9 ||
      normalLength > 1.1
    ) {
      continue;
    }
    magnitudes.push(
      Math.hypot(
        ((motion[pixel * 2] ?? 0) * width) / 2,
        ((motion[pixel * 2 + 1] ?? 0) * height) / 2,
      ),
    );
  }
  return magnitudes;
}

export function percentile(values: readonly number[], percent: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? Number.NaN;
}

export function maxOf(values: readonly number[]): number {
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value > maximum) {
      maximum = value;
    }
  }
  return maximum;
}

export function formatGate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : String(value);
}

export interface ProjectionSample {
  readonly expectedPx: readonly [number, number];
  readonly sampledPx: readonly [number, number];
  readonly expectedMagnitudePx: number;
  readonly distanceToLeap: number;
  readonly distanceToOneTick: number;
}

export function projectQueryPoint(input: {
  readonly camera: MetricCamera;
  readonly viewport: ViewportSize;
  readonly x: number;
  readonly z: number;
  readonly previousHeight: number;
  readonly incorrectHeight: number;
  readonly currentHeight: number;
  readonly motion: readonly number[];
  readonly fresnel: readonly number[];
  readonly depth: readonly number[];
  readonly normals: readonly number[];
}): ProjectionSample | null {
  const previous = projectWorldPoint(
    input.camera,
    input.viewport,
    input.x,
    input.previousHeight,
    input.z,
  );
  const incorrect = projectWorldPoint(
    input.camera,
    input.viewport,
    input.x,
    input.incorrectHeight,
    input.z,
  );
  const current = projectWorldPoint(
    input.camera,
    input.viewport,
    input.x,
    input.currentHeight,
    input.z,
  );
  if (previous === null || incorrect === null || current === null) {
    return null;
  }
  const sampledNdc = sampleMotionNdc(
    input.viewport,
    current.pixelX,
    current.pixelY,
    current.depth,
    input.motion,
    input.fresnel,
    input.depth,
    input.normals,
  );
  if (sampledNdc === null) {
    return null;
  }
  const expectedPx = ndcToPixelVector(
    input.viewport,
    current.ndcX - previous.ndcX,
    current.ndcY - previous.ndcY,
  );
  const incorrectPx = ndcToPixelVector(
    input.viewport,
    current.ndcX - incorrect.ndcX,
    current.ndcY - incorrect.ndcY,
  );
  const sampledPx = ndcToPixelVector(
    input.viewport,
    sampledNdc[0],
    sampledNdc[1],
  );
  return {
    expectedPx,
    sampledPx,
    expectedMagnitudePx: Math.hypot(...expectedPx),
    distanceToLeap: Math.hypot(
      sampledPx[0] - expectedPx[0],
      sampledPx[1] - expectedPx[1],
    ),
    distanceToOneTick: Math.hypot(
      sampledPx[0] - incorrectPx[0],
      sampledPx[1] - incorrectPx[1],
    ),
  };
}

function projectWorldPoint(
  camera: MetricCamera,
  viewport: ViewportSize,
  x: number,
  y: number,
  z: number,
): Readonly<{
  readonly ndcX: number;
  readonly ndcY: number;
  readonly depth: number;
  readonly pixelX: number;
  readonly pixelY: number;
}> | null {
  const forward = normalize(subtract(camera.target, camera.position));
  const right = normalize(cross(forward, camera.up));
  const cameraUp = cross(right, forward);
  const offset = subtract([x, y, z], camera.position);
  const cameraX = dot(offset, right);
  const cameraY = dot(offset, cameraUp);
  const depth = dot(offset, forward);
  if (!(depth > camera.near) || depth >= camera.far) {
    return null;
  }
  const tanY = Math.tan((camera.verticalFovDegrees * Math.PI) / 360);
  const aspect = viewport.width / viewport.height;
  const ndcX = cameraX / (depth * tanY * aspect);
  const ndcY = cameraY / (depth * tanY);
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) {
    return null;
  }
  return {
    ndcX,
    ndcY,
    depth,
    pixelX: (ndcX * 0.5 + 0.5) * viewport.width,
    pixelY: (0.5 - ndcY * 0.5) * viewport.height,
  };
}

function sampleMotionNdc(
  viewport: ViewportSize,
  pixelX: number,
  pixelY: number,
  forwardDepth: number,
  motion: readonly number[],
  fresnel: readonly number[],
  depth: readonly number[],
  normals: readonly number[],
): readonly [number, number] | null {
  const sampleX = pixelX - 0.5;
  const sampleY = pixelY - 0.5;
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const bilinearTaps = [
    [x0, y0],
    [x0 + 1, y0],
    [x0, y0 + 1],
    [x0 + 1, y0 + 1],
  ] as const;
  if (
    bilinearTaps.every(([x, y]) =>
      isValidTap(viewport, x, y, forwardDepth, fresnel, depth, normals),
    )
  ) {
    const tx = sampleX - x0;
    const ty = sampleY - y0;
    const v00 = motionAt(motion, viewport.width, x0, y0);
    const v10 = motionAt(motion, viewport.width, x0 + 1, y0);
    const v01 = motionAt(motion, viewport.width, x0, y0 + 1);
    const v11 = motionAt(motion, viewport.width, x0 + 1, y0 + 1);
    return [
      mix(mix(v00[0], v10[0], tx), mix(v01[0], v11[0], tx), ty),
      mix(mix(v00[1], v10[1], tx), mix(v01[1], v11[1], tx), ty),
    ];
  }
  const centerX = Math.round(pixelX);
  const centerY = Math.round(pixelY);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
    for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
      const x = centerX + offsetX;
      const y = centerY + offsetY;
      if (!isValidTap(viewport, x, y, forwardDepth, fresnel, depth, normals)) {
        continue;
      }
      const sample = motionAt(motion, viewport.width, x, y);
      xs.push(sample[0]);
      ys.push(sample[1]);
    }
  }
  if (xs.length === 0 || ys.length === 0) {
    return null;
  }
  return [median(xs), median(ys)];
}

function isValidTap(
  viewport: ViewportSize,
  x: number,
  y: number,
  forwardDepth: number,
  fresnel: readonly number[],
  depth: readonly number[],
  normals: readonly number[],
): boolean {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 3 ||
    y < 3 ||
    x > viewport.width - 4 ||
    y > viewport.height - 4
  ) {
    return false;
  }
  const pixel = y * viewport.width + x;
  const fresnelValue = fresnel[pixel] ?? Number.NaN;
  const capturedDepth = depth[pixel] ?? Number.NaN;
  const nx = normals[pixel * 3] ?? Number.NaN;
  const ny = normals[pixel * 3 + 1] ?? Number.NaN;
  const nz = normals[pixel * 3 + 2] ?? Number.NaN;
  const normalLength = Math.hypot(nx, ny, nz);
  return (
    fresnelValue > 0.001 &&
    normalLength >= 0.9 &&
    normalLength <= 1.1 &&
    Number.isFinite(capturedDepth) &&
    Math.abs(capturedDepth - forwardDepth) <= 0.5
  );
}

function motionAt(
  motion: readonly number[],
  width: number,
  x: number,
  y: number,
): readonly [number, number] {
  const pixel = y * width + x;
  return [motion[pixel * 2] ?? Number.NaN, motion[pixel * 2 + 1] ?? Number.NaN];
}

function ndcToPixelVector(
  viewport: ViewportSize,
  ndcX: number,
  ndcY: number,
): readonly [number, number] {
  return [ndcX * (viewport.width / 2), -ndcY * (viewport.height / 2)];
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const high = sorted[middle];
  const low = sorted[middle - 1];
  if (high === undefined) {
    return Number.NaN;
  }
  if (sorted.length % 2 === 1 || low === undefined) {
    return high;
  }
  return (low + high) / 2;
}
