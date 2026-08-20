import {
  clipMask,
  countMask,
  decodeFloat32,
  decodeUint8,
  dilateMask,
  formatGate,
  intersectCount,
  isGlintLimitedWaterPixel,
  lumaPlane,
  maxOf,
  median,
  orMaskInto,
  percentile,
  waterMotionMagnitudesPx,
  type EncodedFrameBuffers,
  type ViewportSize,
  type WaterBandConfig,
} from "./frame-sampling.js";

export interface ThinDetailAnalysisConfig {
  readonly viewport: ViewportSize;
  readonly water: WaterBandConfig;
  readonly glintMax: number;
  readonly gradientMin: number;
  readonly depthRangeMax: number;
  readonly ridgeMax: number;
  readonly perFrameMin: number;
  readonly componentAreaMin: number;
  readonly frameCount: number;
}

export interface ThinDetailReport {
  readonly lines: readonly string[];
  readonly summary: string;
  readonly unionCount: number;
  readonly minFrameThin: number;
  readonly activeFrames: number;
  readonly madSamples: number;
  readonly currentMadP75: number;
  readonly finalMadP75: number;
  readonly ratioSamples: number;
  readonly gradientRatioMedian: number;
  readonly coverageRetain: number;
  readonly minFrameRetain: number;
  readonly trackedComponents: number;
  readonly trackedComponentFrames: number;
  readonly maxConsecutiveMissing: number;
  readonly differingFrames: number;
  readonly motionP95Max: number;
  readonly motionMax: number;
}

interface ThinComponent {
  readonly members: readonly number[];
  readonly mask: Uint8Array;
  readonly cx: number;
  readonly cy: number;
}

interface ThinDecodedFrame {
  readonly motion: readonly number[];
  readonly depth: number[];
  readonly normal: number[];
  readonly fresnel: number[];
  readonly glint: number[];
  readonly currentLuma: Float32Array;
  readonly finalLuma: Float32Array;
  readonly water: Uint8Array;
  readonly currentThin: Uint8Array;
  readonly finalThin: Uint8Array;
  readonly currentThinCount: number;
  readonly finalThinCount: number;
  readonly retainedCount: number;
  readonly dilatedWater: Uint8Array;
}

interface ThinTrackRecord {
  readonly frameIndex: number;
  readonly missingFinal: boolean;
}

export function analyzeThinDetail(input: {
  readonly frames: readonly EncodedFrameBuffers[];
  readonly config: ThinDetailAnalysisConfig;
}): ThinDetailReport {
  const width = input.config.viewport.width;
  const height = input.config.viewport.height;
  const decoded = input.frames.map((frame) =>
    decodeThinDetailFrame(frame, input.config),
  );
  const union = new Uint8Array(width * height);
  const currentMads: number[] = [];
  const finalMads: number[] = [];
  const gradientRatios: number[] = [];
  const frameLines: string[] = [];
  let minFrameThin = Number.POSITIVE_INFINITY;
  let activeFrames = 0;
  let currentThinTotal = 0;
  let retainedTotal = 0;
  let minFrameRetain = Number.POSITIVE_INFINITY;
  let differingFrames = 0;
  let motionP95Max = 0;
  let motionMax = 0;

  for (const [index, frame] of decoded.entries()) {
    orMaskInto(union, frame.dilatedWater);
    minFrameThin = Math.min(minFrameThin, frame.currentThinCount);
    currentThinTotal += frame.currentThinCount;
    retainedTotal += frame.retainedCount;
    if (frame.currentThinCount >= input.config.perFrameMin) {
      activeFrames += 1;
      const retain =
        frame.currentThinCount === 0
          ? Number.NaN
          : frame.retainedCount / frame.currentThinCount;
      minFrameRetain = Math.min(minFrameRetain, retain);
    }
    if (capturedBuffersDiffer(input.frames[index])) {
      differingFrames += 1;
    }
    const motionMags = waterMotionMagnitudesPx(
      frame.motion,
      frame.fresnel,
      frame.depth,
      frame.normal,
      width,
      height,
    );
    const motionP95 = percentile(motionMags, 95);
    const frameMotionMax = motionMags.length === 0 ? 0 : maxOf(motionMags);
    if (Number.isFinite(motionP95) && motionP95 > motionP95Max) {
      motionP95Max = motionP95;
    }
    if (Number.isFinite(frameMotionMax) && frameMotionMax > motionMax) {
      motionMax = frameMotionMax;
    }
    for (let pixel = 0; pixel < frame.currentThin.length; pixel += 1) {
      if (frame.currentThin[pixel] !== 1) {
        continue;
      }
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const currentGrad = localLumaGradient(
        frame.currentLuma,
        x,
        y,
        width,
        height,
      );
      const finalGrad = localLumaGradient(frame.finalLuma, x, y, width, height);
      if (currentGrad === null || finalGrad === null || !(currentGrad > 0)) {
        continue;
      }
      gradientRatios.push(finalGrad / currentGrad);
    }
    frameLines.push(
      `thin[${String(index)}] current=${String(frame.currentThinCount)} final=${String(frame.finalThinCount)} retain=${formatGate(frame.currentThinCount === 0 ? Number.NaN : frame.retainedCount / frame.currentThinCount)} motionP95=${formatGate(motionP95)}`,
    );
  }

  for (let index = 1; index < decoded.length; index += 1) {
    const previous = decoded[index - 1];
    const current = decoded[index];
    if (previous === undefined || current === undefined) {
      throw new Error(`Missing thin-detail pair ${String(index)}.`);
    }
    for (let pixel = 0; pixel < union.length; pixel += 1) {
      if (union[pixel] !== 1) {
        continue;
      }
      if (previous.water[pixel] !== 1 || current.water[pixel] !== 1) {
        continue;
      }
      currentMads.push(
        Math.abs(
          (current.currentLuma[pixel] ?? 0) -
            (previous.currentLuma[pixel] ?? 0),
        ),
      );
      finalMads.push(
        Math.abs(
          (current.finalLuma[pixel] ?? 0) - (previous.finalLuma[pixel] ?? 0),
        ),
      );
    }
  }

  const tracks = trackThinComponents(
    decoded,
    width,
    height,
    input.config.componentAreaMin,
  );
  const tracked = tracks.filter((track) => track.length >= 2);
  let trackedComponentFrames = 0;
  let maxConsecutiveMissing = 0;
  for (const track of tracked) {
    trackedComponentFrames += track.length;
    let consecutive = 0;
    let previousFrame: number | null = null;
    for (const record of track) {
      if (previousFrame !== null && record.frameIndex !== previousFrame + 1) {
        consecutive = 0;
      }
      if (record.missingFinal) {
        consecutive += 1;
        maxConsecutiveMissing = Math.max(maxConsecutiveMissing, consecutive);
      } else {
        consecutive = 0;
      }
      previousFrame = record.frameIndex;
    }
  }

  const coverageRetain =
    currentThinTotal === 0 ? Number.NaN : retainedTotal / currentThinTotal;
  if (!Number.isFinite(minFrameThin)) {
    minFrameThin = 0;
  }
  if (!Number.isFinite(minFrameRetain)) {
    minFrameRetain = Number.NaN;
  }

  const stats = {
    lines: Object.freeze([...frameLines]),
    unionCount: countMask(union),
    minFrameThin,
    activeFrames,
    madSamples: currentMads.length,
    currentMadP75: percentile(currentMads, 75),
    finalMadP75: percentile(finalMads, 75),
    ratioSamples: gradientRatios.length,
    gradientRatioMedian: median(gradientRatios),
    coverageRetain,
    minFrameRetain,
    trackedComponents: tracked.length,
    trackedComponentFrames,
    maxConsecutiveMissing,
    differingFrames,
    motionP95Max,
    motionMax,
  };
  return Object.freeze({
    ...stats,
    summary: formatThinDetailSummary(stats, input.config.frameCount),
  });
}

function decodeThinDetailFrame(
  frame: EncodedFrameBuffers,
  config: ThinDetailAnalysisConfig,
): ThinDecodedFrame {
  const width = config.viewport.width;
  const height = config.viewport.height;
  const current = decodeUint8(frame.current);
  const final = decodeUint8(frame.final);
  const motion = decodeFloat32(frame.motion);
  const depth = decodeFloat32(frame.depth);
  const normal = decodeFloat32(frame.normal);
  const fresnel = decodeFloat32(frame.fresnel);
  const glint = decodeFloat32(frame.glint);
  const currentLuma = lumaPlane(current, width * height);
  const finalLuma = lumaPlane(final, width * height);
  const water = routeWaterMask(depth, fresnel, normal, glint, config);
  const currentThin = thinDetailMask(currentLuma, water, depth, config);
  const finalThin = thinDetailMask(finalLuma, water, depth, config);
  const associatedFinal = dilateMask(finalThin, width, height, 1);
  const dilatedWater = clipMask(
    dilateMask(currentThin, width, height, 1),
    water,
  );
  return {
    motion,
    depth,
    normal,
    fresnel,
    glint,
    currentLuma,
    finalLuma,
    water,
    currentThin,
    finalThin,
    currentThinCount: countMask(currentThin),
    finalThinCount: countMask(finalThin),
    retainedCount: intersectCount(currentThin, associatedFinal),
    dilatedWater,
  };
}

function routeWaterMask(
  depth: readonly number[],
  fresnel: readonly number[],
  normals: readonly number[],
  glint: readonly number[],
  config: ThinDetailAnalysisConfig,
): Uint8Array {
  const width = config.viewport.width;
  const height = config.viewport.height;
  const water = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (
        isGlintLimitedWaterPixel(
          pixel,
          x,
          y,
          depth,
          fresnel,
          normals,
          glint,
          config.viewport,
          config.water,
          config.glintMax,
        )
      ) {
        water[pixel] = 1;
      }
    }
  }
  return water;
}

function thinDetailMask(
  luma: Float32Array,
  water: Uint8Array,
  depth: readonly number[],
  config: ThinDetailAnalysisConfig,
): Uint8Array {
  const width = config.viewport.width;
  const height = config.viewport.height;
  const candidates = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (water[pixel] !== 1) {
        continue;
      }
      const gradient = localLumaGradient(luma, x, y, width, height);
      const depthRange = depthRange3x3(depth, x, y, width, height);
      if (
        gradient !== null &&
        depthRange !== null &&
        gradient >= config.gradientMin &&
        depthRange <= config.depthRangeMax
      ) {
        candidates[pixel] = 1;
      }
    }
  }
  const thin = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (candidates[pixel] !== 1) {
        continue;
      }
      const xWidth = ridgeRunLength(candidates, x, y, width, height, "x");
      const yWidth = ridgeRunLength(candidates, x, y, width, height, "y");
      if (xWidth <= config.ridgeMax || yWidth <= config.ridgeMax) {
        thin[pixel] = 1;
      }
    }
  }
  return thin;
}

function localLumaGradient(
  luma: Float32Array,
  x: number,
  y: number,
  width: number,
  height: number,
): number | null {
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) {
    return null;
  }
  const center = y * width + x;
  const gx = Math.abs((luma[center + 1] ?? 0) - (luma[center - 1] ?? 0)) / 2;
  const gy =
    Math.abs((luma[center + width] ?? 0) - (luma[center - width] ?? 0)) / 2;
  return Math.max(gx, gy);
}

function depthRange3x3(
  depth: readonly number[],
  x: number,
  y: number,
  width: number,
  height: number,
): number | null {
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) {
    return null;
  }
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const value = depth[(y + offsetY) * width + (x + offsetX)] ?? Number.NaN;
      if (!Number.isFinite(value)) {
        return null;
      }
      if (value < minimum) {
        minimum = value;
      }
      if (value > maximum) {
        maximum = value;
      }
    }
  }
  return maximum - minimum;
}

function ridgeRunLength(
  mask: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
  axis: "x" | "y",
): number {
  let length = 1;
  if (axis === "x") {
    for (
      let nextX = x - 1;
      nextX >= 0 && mask[y * width + nextX] === 1;
      nextX -= 1
    ) {
      length += 1;
    }
    for (
      let nextX = x + 1;
      nextX < width && mask[y * width + nextX] === 1;
      nextX += 1
    ) {
      length += 1;
    }
    return length;
  }
  for (
    let nextY = y - 1;
    nextY >= 0 && mask[nextY * width + x] === 1;
    nextY -= 1
  ) {
    length += 1;
  }
  for (
    let nextY = y + 1;
    nextY < height && mask[nextY * width + x] === 1;
    nextY += 1
  ) {
    length += 1;
  }
  return length;
}

function collectThinComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  areaMin: number,
): readonly ThinComponent[] {
  const assigned = new Uint8Array(width * height);
  const stack: number[] = [];
  const components: ThinComponent[] = [];
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (mask[seed] !== 1 || assigned[seed] === 1) {
      continue;
    }
    stack.length = 0;
    stack.push(seed);
    assigned[seed] = 1;
    const members: number[] = [];
    const componentMask = new Uint8Array(width * height);
    let sumX = 0;
    let sumY = 0;
    while (stack.length > 0) {
      const pixel = stack.pop();
      if (pixel === undefined) {
        break;
      }
      members.push(pixel);
      componentMask[pixel] = 1;
      sumX += pixel % width;
      sumY += Math.floor(pixel / width);
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
          if (mask[next] !== 1 || assigned[next] === 1) {
            continue;
          }
          assigned[next] = 1;
          stack.push(next);
        }
      }
    }
    if (members.length >= areaMin) {
      components.push({
        members,
        mask: componentMask,
        cx: sumX / members.length,
        cy: sumY / members.length,
      });
    }
  }
  return components;
}

function trackThinComponents(
  frames: readonly ThinDecodedFrame[],
  width: number,
  height: number,
  areaMin: number,
): readonly ThinTrackRecord[][] {
  const tracks: Array<{
    readonly last: ThinComponent;
    readonly lastMatchedFrame: number;
    readonly graceUsed: boolean;
    readonly records: ThinTrackRecord[];
  }> = [];
  for (const [frameIndex, frame] of frames.entries()) {
    const components = collectThinComponents(
      frame.currentThin,
      width,
      height,
      areaMin,
    );
    const matched = new Uint8Array(tracks.length);
    const nextTracks: Array<{
      readonly last: ThinComponent;
      readonly lastMatchedFrame: number;
      readonly graceUsed: boolean;
      readonly records: ThinTrackRecord[];
    }> = [];
    for (const component of components) {
      let best = -1;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const [index, track] of tracks.entries()) {
        if (matched[index] === 1) {
          continue;
        }
        const age = frameIndex - track.lastMatchedFrame;
        if (age !== 1 && !(age === 2 && track.graceUsed)) {
          continue;
        }
        if (!thinComponentsAssociate(track.last, component, width, height)) {
          continue;
        }
        const score = Math.hypot(
          track.last.cx - component.cx,
          track.last.cy - component.cy,
        );
        if (score < bestScore) {
          bestScore = score;
          best = index;
        }
      }
      const record = {
        frameIndex,
        missingFinal: !componentPresentInFinal(component, frame, width, height),
      };
      if (best >= 0) {
        const track = tracks[best];
        if (track === undefined) {
          throw new Error(
            "Thin-detail track match pointed at a missing track.",
          );
        }
        matched[best] = 1;
        track.records.push(record);
        nextTracks.push({
          last: component,
          lastMatchedFrame: frameIndex,
          graceUsed: false,
          records: track.records,
        });
      } else {
        nextTracks.push({
          last: component,
          lastMatchedFrame: frameIndex,
          graceUsed: false,
          records: [record],
        });
      }
    }
    for (const [index, track] of tracks.entries()) {
      if (matched[index] === 1 || track.graceUsed) {
        continue;
      }
      nextTracks.push({
        last: track.last,
        lastMatchedFrame: track.lastMatchedFrame,
        graceUsed: true,
        records: track.records,
      });
    }
    tracks.length = 0;
    tracks.push(...nextTracks);
  }
  return tracks.map((track) => track.records);
}

function componentPresentInFinal(
  component: ThinComponent,
  frame: ThinDecodedFrame,
  width: number,
  height: number,
): boolean {
  return (
    intersectCount(
      dilateMask(component.mask, width, height, 1),
      frame.finalThin,
    ) > 0
  );
}

function capturedBuffersDiffer(
  frame: EncodedFrameBuffers | undefined,
): boolean {
  return frame !== undefined && frame.current !== frame.final;
}

function thinComponentsAssociate(
  left: ThinComponent,
  right: ThinComponent,
  width: number,
  height: number,
): boolean {
  const source =
    left.members.length <= right.members.length ? left.members : right.members;
  const target = source === left.members ? right.mask : left.mask;
  for (const pixel of source) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const minX = Math.max(0, x - 1);
    const maxX = Math.min(width - 1, x + 1);
    const minY = Math.max(0, y - 1);
    const maxY = Math.min(height - 1, y + 1);
    for (let nextY = minY; nextY <= maxY; nextY += 1) {
      const row = nextY * width;
      for (let nextX = minX; nextX <= maxX; nextX += 1) {
        if (target[row + nextX] === 1) {
          return true;
        }
      }
    }
  }
  return false;
}

function formatThinDetailSummary(
  stats: Omit<ThinDetailReport, "summary">,
  frameCount: number,
): string {
  const madRatio =
    stats.currentMadP75 > 0
      ? stats.finalMadP75 / stats.currentMadP75
      : Number.NaN;
  return [
    `union=${String(stats.unionCount)}`,
    `minFrame=${String(stats.minFrameThin)}`,
    `active=${String(stats.activeFrames)}/${String(frameCount)}`,
    `madN=${String(stats.madSamples)}`,
    `currentMadP75=${formatGate(stats.currentMadP75)}`,
    `finalMadP75=${formatGate(stats.finalMadP75)}`,
    `madRatio=${formatGate(madRatio)}`,
    `ratioN=${String(stats.ratioSamples)}`,
    `gradRatioMed=${formatGate(stats.gradientRatioMedian)}`,
    `retain=${formatGate(stats.coverageRetain)}`,
    `minRetain=${formatGate(stats.minFrameRetain)}`,
    `tracks=${String(stats.trackedComponents)}`,
    `trackFrames=${String(stats.trackedComponentFrames)}`,
    `maxMissing=${String(stats.maxConsecutiveMissing)}`,
    `bypass=${String(stats.differingFrames)}`,
    `motionP95=${formatGate(stats.motionP95Max)}`,
    `motionMax=${formatGate(stats.motionMax)}`,
  ].join(" ");
}
