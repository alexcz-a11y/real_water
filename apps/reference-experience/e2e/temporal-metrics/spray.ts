export interface PostTraaParticleResidualReport {
  readonly lines: readonly string[];
  readonly activeFrames: number;
  readonly outsideHotPixels: number;
  readonly maxOutsideResidual: number;
  readonly expiredResidualMax: number;
}

/**
 * Measures causal final-color residue outside the current post-TRAA particle
 * contribution support. It deliberately does not consult TRAA history: a
 * correctly ordered transparent stage has no legitimate contribution outside
 * its current output-resolution mask, including after the effect expires.
 */
export function analyzePostTraaParticleResidual(input: {
  readonly width: number;
  readonly height: number;
  readonly onFinal: readonly Uint8Array[];
  readonly offFinal: readonly Uint8Array[];
  readonly contribution: readonly Float32Array[];
  readonly contributionThreshold: number;
  readonly allowedDilatePixels: number;
  readonly residualLsb: number;
}): PostTraaParticleResidualReport {
  assertPositiveInteger(input.width, "width");
  assertPositiveInteger(input.height, "height");
  assertNonnegativeInteger(input.allowedDilatePixels, "allowedDilatePixels");
  assertFiniteNonnegative(input.contributionThreshold, "contributionThreshold");
  assertFiniteNonnegative(input.residualLsb, "residualLsb");
  if (
    input.onFinal.length !== input.offFinal.length ||
    input.onFinal.length !== input.contribution.length
  ) {
    throw new RangeError(
      "Post-TRAA particle analysis requires matched on/off/contribution frames.",
    );
  }

  const pixelCount = input.width * input.height;
  const lines: string[] = [];
  let activeFrames = 0;
  let outsideHotPixels = 0;
  let maxOutsideResidual = 0;
  let expiredResidualMax = 0;

  for (let frame = 0; frame < input.onFinal.length; frame += 1) {
    const on = input.onFinal[frame];
    const off = input.offFinal[frame];
    const contribution = input.contribution[frame];
    if (
      on === undefined ||
      off === undefined ||
      contribution === undefined ||
      on.length !== pixelCount * 4 ||
      off.length !== pixelCount * 4 ||
      contribution.length !== pixelCount
    ) {
      throw new RangeError(
        `Post-TRAA particle frame ${String(frame)} has invalid dimensions.`,
      );
    }
    const support = new Uint8Array(pixelCount);
    let supportPixels = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const value = contribution[pixel] ?? 0;
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(
          "Post-TRAA particle contribution must be finite and nonnegative.",
        );
      }
      if (value >= input.contributionThreshold) {
        support[pixel] = 1;
        supportPixels += 1;
      }
    }
    if (supportPixels > 0) {
      activeFrames += 1;
    }
    const allowed = dilate(
      support,
      input.width,
      input.height,
      input.allowedDilatePixels,
    );
    let frameOutsideMax = 0;
    let frameOutsideHot = 0;
    let frameResidualMax = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const color = pixel * 4;
      const residual = Math.max(
        Math.abs((on[color] ?? 0) - (off[color] ?? 0)),
        Math.abs((on[color + 1] ?? 0) - (off[color + 1] ?? 0)),
        Math.abs((on[color + 2] ?? 0) - (off[color + 2] ?? 0)),
      );
      frameResidualMax = Math.max(frameResidualMax, residual);
      if (allowed[pixel] === 0) {
        frameOutsideMax = Math.max(frameOutsideMax, residual);
        if (residual > input.residualLsb) {
          frameOutsideHot += 1;
        }
      }
    }
    maxOutsideResidual = Math.max(maxOutsideResidual, frameOutsideMax);
    outsideHotPixels += frameOutsideHot;
    if (supportPixels === 0) {
      expiredResidualMax = Math.max(expiredResidualMax, frameResidualMax);
    }
    lines.push(
      `frame=${String(frame + 1)} support=${String(supportPixels)} outsideMax=${String(frameOutsideMax)} outsideHot=${String(frameOutsideHot)}`,
    );
  }

  return Object.freeze({
    lines: Object.freeze(lines),
    activeFrames,
    outsideHotPixels,
    maxOutsideResidual,
    expiredResidualMax,
  });
}

function dilate(
  source: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  if (radius === 0) {
    return Uint8Array.from(source);
  }
  const output = new Uint8Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let active = false;
      for (let offsetY = -radius; offsetY <= radius && !active; offsetY += 1) {
        const sampleY = y + offsetY;
        if (sampleY < 0 || sampleY >= height) continue;
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleX = x + offsetX;
          if (sampleX < 0 || sampleX >= width) continue;
          if (source[sampleY * width + sampleX] === 1) {
            active = true;
            break;
          }
        }
      }
      if (active) output[y * width + x] = 1;
    }
  }
  return output;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
}

function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative integer.`);
  }
}

function assertFiniteNonnegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and nonnegative.`);
  }
}
