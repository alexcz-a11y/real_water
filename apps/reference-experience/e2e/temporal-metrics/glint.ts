import {
  decodeFloat32,
  decodeUint8,
  dilateMask,
  formatGate,
  historyUvInBounds,
  isRouteWaterPixel,
  luma8,
  maxOf,
  motionAxisStep,
  motionPixels,
  percentile,
  sampleBilinear,
  unionMasks,
  warpFloatField,
  type EncodedFrameBuffers,
  type ViewportSize,
  type WaterBandConfig,
} from "./frame-sampling.js";

export interface CausalGlintAnalysisConfig {
  readonly viewport: ViewportSize;
  readonly water: WaterBandConfig;
  readonly glintThreshold: number;
  readonly activeMinPixels: number;
  readonly componentAreaMin: number;
  readonly componentEnergyMin: number;
  readonly roiDilatePx: number;
  readonly allowedDilatePx: number;
  readonly outsideLsb: number;
  readonly frameCount: number;
}

export interface CausalGlintReport {
  readonly lines: readonly string[];
  readonly summary: string;
  readonly offGlintMax: number;
  readonly offGlintHot: number;
  readonly onGlintMax: number;
  readonly offGlintEnergy: number;
  readonly onGlintEnergy: number;
  readonly minWaterCount: number;
  readonly minOutsideWater: number;
  readonly activeFrames: number;
  readonly validPeakFrames: number;
  readonly glintPixelFrames: number;
  readonly peakRatioP10: number;
  readonly outsideResidualP99: number;
  readonly outsideCoverage: number;
  readonly validComponentFrames: number;
  readonly motionQualifiedComponents: number;
  readonly centroidLagP95: number;
  readonly maxTrail: number;
  readonly madEligible: number;
  readonly madValid: number;
  readonly currentMadP75: number;
  readonly finalMadP75: number;
}

interface GlintDecodedFrame {
  readonly current: Uint8Array;
  readonly final: Uint8Array;
  readonly motion: Float32Array;
  readonly depth: Float32Array;
  readonly normal: Float32Array;
  readonly fresnel: Float32Array;
  readonly glint: Float32Array;
  readonly water: Uint8Array;
  readonly glints: Uint8Array;
  readonly waterCount: number;
  readonly glintCount: number;
  readonly glintMax: number;
  readonly glintEnergy: number;
}

interface CausalGlintPair {
  readonly on: GlintDecodedFrame;
  readonly off: GlintDecodedFrame;
  readonly currentContribution: Float32Array;
  readonly finalContribution: Float32Array;
}

export function analyzeCausalGlint(input: {
  readonly onFrames: readonly EncodedFrameBuffers[];
  readonly offFrames: readonly EncodedFrameBuffers[];
  readonly config: CausalGlintAnalysisConfig;
}): CausalGlintReport {
  const width = input.config.viewport.width;
  const height = input.config.viewport.height;
  const pairs: CausalGlintPair[] = [];
  for (let index = 0; index < input.onFrames.length; index += 1) {
    const onFrame = input.onFrames[index];
    const offFrame = input.offFrames[index];
    if (onFrame === undefined || offFrame === undefined) {
      throw new Error(`Missing causal glint pair ${String(index)}.`);
    }
    const on = decodeGlintFrame(onFrame, input.config);
    const off = decodeGlintFrame(offFrame, input.config);
    pairs.push({
      on,
      off,
      currentContribution: causalContribution(on.current, off.current),
      finalContribution: causalContribution(on.final, off.final),
    });
  }

  const lines: string[] = [];
  const peakRatios: number[] = [];
  const residualP99s: number[] = [];
  const coverages: number[] = [];
  const lags: number[] = [];
  const trails: number[] = [];
  const waterCounts: number[] = [];
  const outsideWaters: number[] = [];
  const currentMads: number[] = [];
  const finalMads: number[] = [];
  let activeFrames = 0;
  let validPeakFrames = 0;
  let glintPixelFrames = 0;
  let offGlintMax = 0;
  let onGlintMax = 0;
  let offGlintHot = 0;
  let offGlintEnergy = 0;
  let onGlintEnergy = 0;
  let motionQualifiedComponents = 0;
  let madEligible = 0;
  let madValid = 0;

  for (const [index, pair] of pairs.entries()) {
    offGlintMax = Math.max(offGlintMax, pair.off.glintMax);
    onGlintMax = Math.max(onGlintMax, pair.on.glintMax);
    offGlintHot += pair.off.glintCount;
    offGlintEnergy += pair.off.glintEnergy;
    onGlintEnergy += pair.on.glintEnergy;
    waterCounts.push(pair.on.waterCount);
    glintPixelFrames += pair.on.glintCount;
    const active = pair.on.glintCount >= input.config.activeMinPixels;
    if (active) {
      activeFrames += 1;
    }
    const currentPeaks: number[] = [];
    const finalPeaks: number[] = [];
    for (let pixel = 0; pixel < pair.on.glints.length; pixel += 1) {
      if (pair.on.glints[pixel] !== 1) {
        continue;
      }
      currentPeaks.push(pair.currentContribution[pixel] ?? 0);
      finalPeaks.push(pair.finalContribution[pixel] ?? 0);
    }
    const currentPeak = percentile(currentPeaks, 99);
    const finalPeak = percentile(finalPeaks, 99);
    const peakRatio =
      currentPeak > 0 &&
      Number.isFinite(currentPeak) &&
      Number.isFinite(finalPeak)
        ? finalPeak / currentPeak
        : Number.NaN;
    if (active && Number.isFinite(peakRatio)) {
      peakRatios.push(peakRatio);
      validPeakFrames += 1;
    }

    const components = collectGlintComponents(
      pair.on.glints,
      pair.on.glint,
      width,
      height,
      input.config.componentAreaMin,
      input.config.componentEnergyMin,
    );
    let frameLagCount = 0;
    let frameTrail = 0;
    const previous = index === 0 ? undefined : pairs[index - 1];
    let outsideWater = Number.POSITIVE_INFINITY;
    let residualP99 = 0;
    let coverage = 0;
    let allowed: Uint8Array | null = null;
    if (previous !== undefined) {
      const warpedGlint = warpFloatField(
        previous.on.glint,
        pair.on.motion,
        width,
        height,
      );
      const previousMask = new Uint8Array(width * height);
      for (let pixel = 0; pixel < warpedGlint.length; pixel += 1) {
        if ((warpedGlint[pixel] ?? 0) >= input.config.glintThreshold) {
          previousMask[pixel] = 1;
        }
      }
      allowed = dilateMask(
        unionMasks(previousMask, pair.on.glints),
        width,
        height,
        input.config.allowedDilatePx,
      );
      const excesses: number[] = [];
      let hot = 0;
      outsideWater = 0;
      for (let pixel = 0; pixel < pair.on.water.length; pixel += 1) {
        if (pair.on.water[pixel] !== 1 || allowed[pixel] === 1) {
          continue;
        }
        outsideWater += 1;
        const excess = Math.max(
          0,
          (pair.finalContribution[pixel] ?? 0) -
            (pair.currentContribution[pixel] ?? 0),
        );
        excesses.push(excess);
        if (excess > input.config.outsideLsb) {
          hot += 1;
        }
      }
      residualP99 = excesses.length === 0 ? 0 : percentile(excesses, 99);
      coverage = outsideWater === 0 ? 1 : hot / outsideWater;
      residualP99s.push(residualP99);
      coverages.push(coverage);
      outsideWaters.push(outsideWater);
    }

    const visited = new Uint8Array(width * height);
    for (const component of components) {
      const motionQualified = componentHasMotion(
        component.members,
        pair.on.motion,
        width,
        height,
      );
      if (motionQualified) {
        motionQualifiedComponents += 1;
      }
      const roi = dilateMask(
        component.mask,
        width,
        height,
        input.config.roiDilatePx,
      );
      const currentCentroid = weightedCentroid(
        roi,
        pair.currentContribution,
        width,
      );
      const finalCentroid = weightedCentroid(
        roi,
        pair.finalContribution,
        width,
      );
      if (currentCentroid !== null && finalCentroid !== null) {
        lags.push(
          Math.hypot(
            finalCentroid[0] - currentCentroid[0],
            finalCentroid[1] - currentCentroid[1],
          ),
        );
        frameLagCount += 1;
      }
      if (allowed !== null && motionQualified) {
        const trail = trailBehindComponent(
          component.members,
          pair.on.motion,
          allowed,
          pair.currentContribution,
          pair.finalContribution,
          width,
          height,
          input.config.outsideLsb,
        );
        if (trail > frameTrail) {
          frameTrail = trail;
        }
      }
      if (previous !== undefined) {
        const sampled = collectMotionCompensatedMads(
          roi,
          pair.on.motion,
          pair.currentContribution,
          pair.finalContribution,
          previous.currentContribution,
          previous.finalContribution,
          width,
          height,
          visited,
          currentMads,
          finalMads,
        );
        madEligible += sampled.eligible;
        madValid += sampled.valid;
      }
    }
    if (allowed !== null) {
      trails.push(frameTrail);
    }

    lines.push(
      [
        `frame=${String(index + 1)}`,
        `water=${String(pair.on.waterCount)}`,
        `glint=${String(pair.on.glintCount)}`,
        `offMax=${formatGate(pair.off.glintMax)}`,
        `peakRatio=${formatGate(peakRatio)}`,
        `components=${String(frameLagCount)}`,
        `outsideWater=${Number.isFinite(outsideWater) ? String(outsideWater) : "n/a"}`,
        `residualP99=${formatGate(residualP99)}`,
        `coverage=${formatGate(coverage)}`,
        `trail=${String(frameTrail)}`,
      ].join(" "),
    );
  }

  const stats = {
    lines: Object.freeze([...lines]),
    offGlintMax,
    offGlintHot,
    onGlintMax,
    offGlintEnergy,
    onGlintEnergy,
    minWaterCount: waterCounts.length === 0 ? 0 : Math.min(...waterCounts),
    minOutsideWater:
      outsideWaters.length === 0 ? 0 : Math.min(...outsideWaters),
    activeFrames,
    validPeakFrames,
    glintPixelFrames,
    peakRatioP10: percentile(peakRatios, 10),
    outsideResidualP99: residualP99s.length === 0 ? 0 : maxOf(residualP99s),
    outsideCoverage: coverages.length === 0 ? 1 : maxOf(coverages),
    validComponentFrames: lags.length,
    motionQualifiedComponents,
    centroidLagP95: percentile(lags, 95),
    maxTrail: trails.length === 0 ? Number.POSITIVE_INFINITY : maxOf(trails),
    madEligible,
    madValid,
    currentMadP75: percentile(currentMads, 75),
    finalMadP75: percentile(finalMads, 75),
  };
  return Object.freeze({
    ...stats,
    summary: formatCausalGlintSummary(stats, input.config.frameCount),
  });
}

function decodeGlintFrame(
  frame: EncodedFrameBuffers,
  config: CausalGlintAnalysisConfig,
): GlintDecodedFrame {
  const width = config.viewport.width;
  const height = config.viewport.height;
  const current = decodeUint8(frame.current);
  const final = decodeUint8(frame.final);
  const motion = Float32Array.from(decodeFloat32(frame.motion));
  const depth = Float32Array.from(decodeFloat32(frame.depth));
  const normal = Float32Array.from(decodeFloat32(frame.normal));
  const fresnel = Float32Array.from(decodeFloat32(frame.fresnel));
  const glint = Float32Array.from(decodeFloat32(frame.glint));
  const water = new Uint8Array(width * height);
  const glints = new Uint8Array(width * height);
  let waterCount = 0;
  let glintCount = 0;
  let glintMax = 0;
  let glintEnergy = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const glintValue = glint[pixel] ?? Number.NaN;
      if (
        !isRouteWaterPixel(
          pixel,
          x,
          y,
          depth,
          fresnel,
          normal,
          config.viewport,
          config.water,
        )
      ) {
        continue;
      }
      if (Number.isFinite(glintValue)) {
        glintEnergy += glintValue;
        if (glintValue > glintMax) {
          glintMax = glintValue;
        }
      }
      water[pixel] = 1;
      waterCount += 1;
      if (glintValue >= config.glintThreshold) {
        glints[pixel] = 1;
        glintCount += 1;
      }
    }
  }
  return {
    current,
    final,
    motion,
    depth,
    normal,
    fresnel,
    glint,
    water,
    glints,
    waterCount,
    glintCount,
    glintMax,
    glintEnergy,
  };
}

function causalContribution(
  onColor: Uint8Array,
  offColor: Uint8Array,
): Float32Array {
  const contribution = new Float32Array(onColor.length / 4);
  for (let pixel = 0; pixel < contribution.length; pixel += 1) {
    const offset = pixel * 4;
    contribution[pixel] = Math.max(
      luma8(onColor, offset) - luma8(offColor, offset),
      0,
    );
  }
  return contribution;
}

function collectGlintComponents(
  glints: Uint8Array,
  glintAov: Float32Array,
  width: number,
  height: number,
  areaMin: number,
  energyMin: number,
): readonly {
  readonly members: readonly number[];
  readonly mask: Uint8Array;
}[] {
  const assigned = new Uint8Array(width * height);
  const stack: number[] = [];
  const components: Array<{
    readonly members: readonly number[];
    readonly mask: Uint8Array;
  }> = [];
  for (let seed = 0; seed < glints.length; seed += 1) {
    if (glints[seed] !== 1 || assigned[seed] === 1) {
      continue;
    }
    stack.length = 0;
    stack.push(seed);
    assigned[seed] = 1;
    const members: number[] = [];
    const mask = new Uint8Array(width * height);
    let energy = 0;
    while (stack.length > 0) {
      const pixel = stack.pop();
      if (pixel === undefined) {
        break;
      }
      members.push(pixel);
      mask[pixel] = 1;
      energy += glintAov[pixel] ?? 0;
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
          if (glints[next] !== 1 || assigned[next] === 1) {
            continue;
          }
          assigned[next] = 1;
          stack.push(next);
        }
      }
    }
    if (members.length >= areaMin && energy >= energyMin) {
      components.push({ members, mask });
    }
  }
  return components;
}

function weightedCentroid(
  roi: Uint8Array,
  weights: Float32Array,
  width: number,
): readonly [number, number] | null {
  let sum = 0;
  let sumX = 0;
  let sumY = 0;
  for (let pixel = 0; pixel < roi.length; pixel += 1) {
    if (roi[pixel] !== 1) {
      continue;
    }
    const weight = weights[pixel] ?? 0;
    if (!(weight > 0)) {
      continue;
    }
    sum += weight;
    sumX += (pixel % width) * weight;
    sumY += Math.floor(pixel / width) * weight;
  }
  if (!(sum > 0)) {
    return null;
  }
  return [sumX / sum, sumY / sum];
}

function trailBehindComponent(
  members: readonly number[],
  motion: Float32Array,
  allowed: Uint8Array,
  currentContribution: Float32Array,
  finalContribution: Float32Array,
  width: number,
  height: number,
  outsideLsb: number,
): number {
  let axisX = 0;
  let axisY = 0;
  for (const pixel of members) {
    const motionPx = motionPixels(motion, pixel, width, height);
    axisX += motionPx[0];
    axisY += motionPx[1];
  }
  const step = motionAxisStep(axisX, axisY);
  if (step === null) {
    return 0;
  }
  let longest = 0;
  for (const pixel of members) {
    let x = pixel % width;
    let y = Math.floor(pixel / width);
    while (true) {
      x -= step[0];
      y -= step[1];
      if (x < 0 || y < 0 || x >= width || y >= height) {
        break;
      }
      const index = y * width + x;
      if (allowed[index] === 1) {
        continue;
      }
      let length = 0;
      while (x >= 0 && y >= 0 && x < width && y < height) {
        const trailIndex = y * width + x;
        if (allowed[trailIndex] === 1) {
          break;
        }
        const excess = Math.max(
          0,
          (finalContribution[trailIndex] ?? 0) -
            (currentContribution[trailIndex] ?? 0),
        );
        if (excess <= outsideLsb) {
          break;
        }
        length += 1;
        x -= step[0];
        y -= step[1];
      }
      if (length > longest) {
        longest = length;
      }
      break;
    }
  }
  return longest;
}

function componentHasMotion(
  members: readonly number[],
  motion: Float32Array,
  width: number,
  height: number,
): boolean {
  for (const pixel of members) {
    const motionPx = motionPixels(motion, pixel, width, height);
    if (Math.hypot(motionPx[0], motionPx[1]) > 1e-6) {
      return true;
    }
  }
  return false;
}

function collectMotionCompensatedMads(
  roi: Uint8Array,
  motion: Float32Array,
  currentContribution: Float32Array,
  finalContribution: Float32Array,
  previousCurrent: Float32Array,
  previousFinal: Float32Array,
  width: number,
  height: number,
  visited: Uint8Array,
  currentMads: number[],
  finalMads: number[],
): { readonly eligible: number; readonly valid: number } {
  let eligible = 0;
  let valid = 0;
  for (let pixel = 0; pixel < roi.length; pixel += 1) {
    if (roi[pixel] !== 1 || visited[pixel] === 1) {
      continue;
    }
    visited[pixel] = 1;
    eligible += 1;
    const motionPx = motionPixels(motion, pixel, width, height);
    const prevX = (pixel % width) - motionPx[0];
    const prevY = Math.floor(pixel / width) - motionPx[1];
    if (!historyUvInBounds(prevX, prevY, width, height)) {
      continue;
    }
    const prevCurrent = sampleBilinear(
      previousCurrent,
      width,
      height,
      prevX,
      prevY,
      1,
      0,
    );
    const prevFinal = sampleBilinear(
      previousFinal,
      width,
      height,
      prevX,
      prevY,
      1,
      0,
    );
    if (prevCurrent === null || prevFinal === null) {
      continue;
    }
    valid += 1;
    currentMads.push(Math.abs((currentContribution[pixel] ?? 0) - prevCurrent));
    finalMads.push(Math.abs((finalContribution[pixel] ?? 0) - prevFinal));
  }
  return { eligible, valid };
}

function formatCausalGlintSummary(
  stats: Omit<CausalGlintReport, "summary">,
  frameCount: number,
): string {
  return [
    `offMax=${formatGate(stats.offGlintMax)}`,
    `offHot=${String(stats.offGlintHot)}`,
    `onMax=${formatGate(stats.onGlintMax)}`,
    `offEnergy=${formatGate(stats.offGlintEnergy)}`,
    `onEnergy=${formatGate(stats.onGlintEnergy)}`,
    `minWater=${String(stats.minWaterCount)}`,
    `minOutside=${String(stats.minOutsideWater)}`,
    `active=${String(stats.activeFrames)}/${String(frameCount)}`,
    `peakFrames=${String(stats.validPeakFrames)}`,
    `glintPx=${String(stats.glintPixelFrames)}`,
    `peakRatioP10=${formatGate(stats.peakRatioP10)}`,
    `residualP99=${formatGate(stats.outsideResidualP99)}`,
    `coverage=${formatGate(stats.outsideCoverage)}`,
    `compFrames=${String(stats.validComponentFrames)}`,
    `motionComps=${String(stats.motionQualifiedComponents)}`,
    `lagP95=${formatGate(stats.centroidLagP95)}`,
    `trail=${String(stats.maxTrail)}`,
    `madEligible=${String(stats.madEligible)}`,
    `madValid=${String(stats.madValid)}`,
    `currentMadP75=${formatGate(stats.currentMadP75)}`,
    `finalMadP75=${formatGate(stats.finalMadP75)}`,
  ].join(" ");
}
