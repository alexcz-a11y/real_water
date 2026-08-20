import {
  channelAbsMax,
  decodeFloat32,
  decodeUint8,
  dot,
  everyFiniteInRangeMotionIsOob,
  formatGate,
  isGlintLimitedWaterPixel,
  linearLumaRgba,
  longestPositiveTrail,
  maxOf,
  motionPixels,
  normalAt,
  percentile,
  sampleBilinearRgba,
  sampleViewDepth,
  sampleViewNormal,
  unprojectPixelViewDepth,
  viewDepthAlongCamera,
  viewNormalToWorld,
  type EncodedFrameBuffers,
  type MetricCamera,
  type ViewportSize,
  type WaterBandConfig,
} from "./frame-sampling.js";

export interface FastPanAnalysisConfig {
  readonly viewport: ViewportSize;
  readonly water: WaterBandConfig;
  readonly glintMax: number;
  readonly depthWarpM: number;
  readonly normalDotMin: number;
  readonly outsideLsb: number;
  readonly stableDiffLsb: number;
}

export interface FastPanPairStats {
  readonly maskCount: number;
  readonly inBoundsWaterCount: number;
  readonly oobCount: number;
  readonly motionP50: number;
  readonly motionP95: number;
  readonly currentResidualP95: number;
  readonly residualP95: number;
  readonly residualP99: number;
  readonly disocclusionP99: number;
  readonly disocclusionMax: number;
  readonly outsideCoverage: number;
  readonly maxTrail: number;
  readonly stableDiffCount: number;
}

export interface FastPanPairReport {
  readonly pair: number;
  readonly stats: FastPanPairStats;
  readonly summary: string;
}

export interface FastPanReport {
  readonly pairs: readonly FastPanPairReport[];
  readonly lines: readonly string[];
  readonly summary: string;
}

export function analyzeFastPan(input: {
  readonly frames: readonly EncodedFrameBuffers[];
  readonly cameras: readonly MetricCamera[];
  readonly config: FastPanAnalysisConfig;
}): FastPanReport {
  const pairs: FastPanPairReport[] = [];
  for (let index = 1; index < input.frames.length; index += 1) {
    const previous = input.frames[index - 1];
    const current = input.frames[index];
    const previousCamera = input.cameras[index - 1];
    const currentCamera = input.cameras[index];
    if (
      previous === undefined ||
      current === undefined ||
      previousCamera === undefined ||
      currentCamera === undefined
    ) {
      throw new Error(`Missing fast-pan pair ${String(index)}.`);
    }
    const stats = measureFastPanPair(
      previous,
      current,
      previousCamera,
      currentCamera,
      input.config,
    );
    const summary = formatFastPanStats(index, stats);
    pairs.push(
      Object.freeze({
        pair: index,
        stats: Object.freeze(stats),
        summary,
      }),
    );
  }
  const lines = pairs.map((entry) => entry.summary);
  return Object.freeze({
    pairs: Object.freeze(pairs),
    lines: Object.freeze(lines),
    summary: lines.join("\n"),
  });
}

function measureFastPanPair(
  previous: EncodedFrameBuffers,
  current: EncodedFrameBuffers,
  previousCamera: MetricCamera,
  currentCamera: MetricCamera,
  config: FastPanAnalysisConfig,
): FastPanPairStats {
  const width = config.viewport.width;
  const height = config.viewport.height;
  const prevFinal = decodeUint8(previous.final);
  const prevCurrent = decodeUint8(previous.current);
  const prevDepth = decodeFloat32(previous.depth);
  const prevNormal = decodeFloat32(previous.normal);
  const currFinal = decodeUint8(current.final);
  const currCurrent = decodeUint8(current.current);
  const currMotion = decodeFloat32(current.motion);
  const currDepth = decodeFloat32(current.depth);
  const currNormal = decodeFloat32(current.normal);
  const currFresnel = decodeFloat32(current.fresnel);
  const currGlint = decodeFloat32(current.glint);
  const residuals: number[] = [];
  const currentResiduals: number[] = [];
  const motions: number[] = [];
  const disocclusions: number[] = [];
  const positive = new Uint8Array(width * height);
  const trailMotionX = new Float32Array(width * height);
  const trailMotionY = new Float32Array(width * height);
  let maskCount = 0;
  let inBoundsWaterCount = 0;
  let oobCount = 0;
  let outsidePositive = 0;
  let stableDiffCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const isWater = isGlintLimitedWaterPixel(
        pixel,
        x,
        y,
        currDepth,
        currFresnel,
        currNormal,
        currGlint,
        config.viewport,
        config.water,
        config.glintMax,
      );
      if (!isWater) {
        continue;
      }
      const colorOffset = pixel * 4;
      const motionPx = motionPixels(currMotion, pixel, width, height);
      const prevX = x - motionPx[0];
      const prevY = y - motionPx[1];
      if (
        everyFiniteInRangeMotionIsOob(
          x,
          y,
          currMotion,
          currDepth,
          width,
          height,
          config.water.depthMin,
          config.water.depthMax,
        )
      ) {
        const rgbGhost = channelAbsMax(currFinal, currCurrent, colorOffset);
        disocclusions.push(rgbGhost);
        oobCount += 1;
        if (rgbGhost > config.outsideLsb) {
          outsidePositive += 1;
          positive[pixel] = 1;
          trailMotionX[pixel] = motionPx[0];
          trailMotionY[pixel] = motionPx[1];
        }
        continue;
      }
      inBoundsWaterCount += 1;
      const previousViewDepth = sampleViewDepth(
        prevDepth,
        width,
        height,
        prevX,
        prevY,
      );
      const previousWorld =
        previousViewDepth === null
          ? null
          : unprojectPixelViewDepth(
              previousCamera,
              config.viewport,
              prevX + 0.5,
              prevY + 0.5,
              previousViewDepth,
            );
      const reconstructedViewDepth =
        previousWorld === null
          ? null
          : viewDepthAlongCamera(currentCamera, previousWorld);
      const currentViewDepth = currDepth[pixel] ?? Number.NaN;
      const depthDelta =
        reconstructedViewDepth === null || !Number.isFinite(currentViewDepth)
          ? Number.NaN
          : Math.abs(currentViewDepth - reconstructedViewDepth);
      const geometryMatch =
        Number.isFinite(depthDelta) && depthDelta <= config.depthWarpM;
      const warped = sampleBilinearRgba(prevFinal, width, height, prevX, prevY);
      const currentWorldNormal = viewNormalToWorld(
        currentCamera,
        normalAt(currNormal, pixel),
      );
      const previousWorldNormal = viewNormalToWorld(
        previousCamera,
        sampleViewNormal(prevNormal, width, height, prevX, prevY),
      );
      const warpedDot =
        currentWorldNormal === null || previousWorldNormal === null
          ? Number.NaN
          : dot(currentWorldNormal, previousWorldNormal);
      if (
        !geometryMatch ||
        warped === null ||
        !Number.isFinite(warpedDot) ||
        warpedDot < config.normalDotMin
      ) {
        continue;
      }
      maskCount += 1;
      motions.push(Math.hypot(motionPx[0], motionPx[1]));
      residuals.push(
        Math.abs(
          linearLumaRgba(currFinal, colorOffset) - linearLumaRgba(warped, 0),
        ),
      );
      const warpedCurrent = sampleBilinearRgba(
        prevCurrent,
        width,
        height,
        prevX,
        prevY,
      );
      if (warpedCurrent !== null) {
        currentResiduals.push(
          Math.abs(
            linearLumaRgba(currCurrent, colorOffset) -
              linearLumaRgba(warpedCurrent, 0),
          ),
        );
      }
      if (
        channelAbsMax(currFinal, currCurrent, colorOffset) >
        config.stableDiffLsb
      ) {
        stableDiffCount += 1;
      }
    }
  }

  return {
    maskCount,
    inBoundsWaterCount,
    oobCount,
    motionP50: percentile(motions, 50),
    motionP95: percentile(motions, 95),
    currentResidualP95: percentile(currentResiduals, 95),
    residualP95: percentile(residuals, 95),
    residualP99: percentile(residuals, 99),
    disocclusionP99:
      disocclusions.length === 0 ? 0 : percentile(disocclusions, 99),
    disocclusionMax: disocclusions.length === 0 ? 0 : maxOf(disocclusions),
    outsideCoverage: oobCount === 0 ? 0 : outsidePositive / oobCount,
    maxTrail: longestPositiveTrail(
      positive,
      trailMotionX,
      trailMotionY,
      width,
      height,
    ),
    stableDiffCount,
  };
}

function formatFastPanStats(pair: number, stats: FastPanPairStats): string {
  return [
    `pair=${String(pair)}`,
    `mask=${String(stats.maskCount)}`,
    `inBounds=${String(stats.inBoundsWaterCount)}`,
    `maskRatio=${formatGate(stats.inBoundsWaterCount === 0 ? Number.NaN : stats.maskCount / stats.inBoundsWaterCount)}`,
    `oob=${String(stats.oobCount)}`,
    `motion p50=${formatGate(stats.motionP50)} p95=${formatGate(stats.motionP95)}`,
    `currentResP95=${formatGate(stats.currentResidualP95)}`,
    `residual p95=${formatGate(stats.residualP95)} p99=${formatGate(stats.residualP99)}`,
    `disocc p99=${formatGate(stats.disocclusionP99)} max=${formatGate(stats.disocclusionMax)}`,
    `outside=${formatGate(stats.outsideCoverage)}`,
    `trail=${String(stats.maxTrail)}`,
    `diff=${String(stats.stableDiffCount)}`,
  ].join(" ");
}
