import {
  HalfFloatType,
  LinearSRGBColorSpace,
  RGBAFormat,
  RenderPipeline,
  RenderTarget,
  UnsignedByteType,
  type Node,
  type Renderer,
} from "three/webgpu";
import {
  float,
  hash,
  mix,
  screenUV,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  createLensWetnessTracker,
  LENS_WETNESS_MAX_DISTORTION_UV,
  LENS_WETNESS_MAX_VISUAL_OPACITY,
  type LensWetnessInspection,
} from "../lens-wetness.js";
import type {
  PostTraaStageDeclaration,
  PostTraaStageFactory,
  PreparedPostTraaStage,
} from "../post-traa-composition.js";
import type { OpenWaterRuntimeSnapshot } from "../runtime.js";
import { STORM_FRONT_POST_TRAA_STAGE_ID } from "./storm-front-post-traa-stage.js";
import type { WaterlineFrameState } from "./waterline-state.js";

export const LENS_WETNESS_POST_TRAA_STAGE_ID = "lens-wetness" as const;

export const LENS_WETNESS_POST_TRAA_STAGE_DECLARATION: PostTraaStageDeclaration =
  Object.freeze({
    id: LENS_WETNESS_POST_TRAA_STAGE_ID,
    after: STORM_FRONT_POST_TRAA_STAGE_ID,
  });

export {
  LENS_WETNESS_DECAY_TICKS,
  LENS_WETNESS_MAX_DISTORTION_UV,
  LENS_WETNESS_MAX_VISUAL_OPACITY,
  LENS_WETNESS_MINIMUM_QA_VISIBILITY,
} from "../lens-wetness.js";

export type LensWetnessPostTraaInspection = LensWetnessInspection;

export interface LensWetnessPostTraaFrameCandidate {
  readonly inspection: LensWetnessPostTraaInspection;
}

export interface LensWetnessPostTraaStageRegistration {
  readonly factory: PostTraaStageFactory;
  readonly declaration: PostTraaStageDeclaration;
  diagnosticsTarget(): RenderTarget;
  preview(
    snapshot: OpenWaterRuntimeSnapshot,
    waterline: WaterlineFrameState,
  ): LensWetnessPostTraaFrameCandidate;
  commit(candidate: LensWetnessPostTraaFrameCandidate): void;
  inspect(): LensWetnessPostTraaInspection;
}

/**
 * Creates a bounded post-TRAA lens-wetness stage. Wetness is event-driven by
 * `lensWetnessImpulse`; rendering and probing never advance its fixed-tick
 * envelope, so stepped and batched simulation updates resolve identically.
 * Preview applies a candidate to the GPU uniforms, while commit alone advances
 * authoritative state, matching the presentation route's preview/commit
 * transaction.
 */
export function createLensWetnessPostTraaStageRegistration(options: {
  readonly onProbe: () => void;
}): LensWetnessPostTraaStageRegistration {
  const wetnessStrength = uniform(0).setName("lensWetnessStrength");
  const patternPhase = uniform(0).setName("lensWetnessPatternPhase");
  let diagnostics: RenderTarget | undefined;
  const tracker = createLensWetnessTracker();

  const applyInspection = (inspection: LensWetnessInspection): void => {
    wetnessStrength.value = inspection.intensityQ16 / 65_535;
    patternPhase.value = inspection.patternPhase;
  };

  const factory: PostTraaStageFactory = Object.freeze({
    id: LENS_WETNESS_POST_TRAA_STAGE_ID,
    create({
      renderer,
      input,
      drawingBuffer,
    }: Parameters<PostTraaStageFactory["create"]>[0]): PreparedPostTraaStage {
      if (diagnostics !== undefined) {
        throw new Error("The lens-wetness post-TRAA stage is already bound.");
      }
      const partial: {
        diagnostics?: RenderTarget;
        output?: RenderTarget;
        diagnosticsPipeline?: RenderPipeline;
        outputPipeline?: RenderPipeline;
      } = {};
      try {
        const output = new RenderTarget(
          drawingBuffer.width,
          drawingBuffer.height,
          {
            depthBuffer: false,
            stencilBuffer: false,
            type: UnsignedByteType,
            format: RGBAFormat,
          },
        );
        partial.output = output;
        output.texture.name = "Real Water final color";

        const diagnosticsTarget = new RenderTarget(
          drawingBuffer.width,
          drawingBuffer.height,
          {
            depthBuffer: false,
            stencilBuffer: false,
            type: HalfFloatType,
            format: RGBAFormat,
          },
        );
        partial.diagnostics = diagnosticsTarget;
        diagnosticsTarget.texture.name = "Real Water lens-wetness diagnostics";
        diagnosticsTarget.texture.colorSpace = LinearSRGBColorSpace;

        const nodes = createLensWetnessNodes(
          input,
          wetnessStrength,
          patternPhase,
        );
        const outputPipeline = new RenderPipeline(renderer, nodes.output);
        partial.outputPipeline = outputPipeline;
        outputPipeline.outputColorTransform = false;
        const diagnosticsPipeline = new RenderPipeline(
          renderer,
          nodes.diagnostics,
        );
        partial.diagnosticsPipeline = diagnosticsPipeline;
        diagnosticsPipeline.outputColorTransform = false;
        let disposed = false;
        let prepared = false;

        const renderPreparedStage = (): void => {
          if (disposed) {
            throw new Error("The lens-wetness post-TRAA stage is disposed.");
          }
          renderer.setMRT(null);
          renderer.setRenderTarget(output);
          outputPipeline.render();
          renderer.setRenderTarget(diagnosticsTarget);
          diagnosticsPipeline.render();
        };

        const stage: PreparedPostTraaStage = Object.freeze({
          id: LENS_WETNESS_POST_TRAA_STAGE_ID,
          output,
          async prepare(signal: AbortSignal): Promise<void> {
            throwIfAborted(signal);
            renderer.initRenderTarget(output);
            renderer.initRenderTarget(diagnosticsTarget);
            renderPreparedStage();
            throwIfAborted(signal);
            prepared = true;
          },
          render(): void {
            if (!prepared) {
              throw new Error(
                "The lens-wetness post-TRAA stage is not prepared.",
              );
            }
            renderPreparedStage();
          },
          async probe(signal: AbortSignal): Promise<void> {
            if (!prepared || disposed) {
              throw new Error(
                "The lens-wetness post-TRAA stage is not available for probing.",
              );
            }
            await probeTarget(renderer, output, signal, options.onProbe);
            await probeTarget(
              renderer,
              diagnosticsTarget,
              signal,
              options.onProbe,
            );
          },
          dispose(): void {
            if (disposed) {
              return;
            }
            disposed = true;
            diagnosticsPipeline.dispose();
            outputPipeline.dispose();
            diagnosticsTarget.dispose();
            output.dispose();
          },
        });
        diagnostics = diagnosticsTarget;
        return stage;
      } catch (cause) {
        disposePartialStage(partial);
        throw cause;
      }
    },
  });

  return Object.freeze({
    factory,
    declaration: LENS_WETNESS_POST_TRAA_STAGE_DECLARATION,
    diagnosticsTarget(): RenderTarget {
      if (diagnostics === undefined) {
        throw new Error("The lens-wetness diagnostics target is not prepared.");
      }
      return diagnostics;
    },
    preview(
      snapshot: OpenWaterRuntimeSnapshot,
      waterline: WaterlineFrameState,
    ): LensWetnessPostTraaFrameCandidate {
      const candidate = tracker.preview(snapshot, waterline);
      applyInspection(candidate.inspection);
      return candidate;
    },
    commit(candidate: LensWetnessPostTraaFrameCandidate): void {
      tracker.commit(candidate);
      applyInspection(tracker.inspect());
    },
    inspect(): LensWetnessPostTraaInspection {
      return tracker.inspect();
    },
  });
}

function createLensWetnessNodes(
  input: RenderTarget,
  wetnessStrength: Node<"float">,
  patternPhase: Node<"float">,
): Readonly<{
  output: Node<"vec4">;
  diagnostics: Node<"vec4">;
}> {
  const base = texture(input.texture);
  const cellSpace = screenUV
    .mul(vec2(18, 10))
    .add(vec2(patternPhase.mul(7), patternPhase.mul(11)));
  const cell = cellSpace.floor();
  const local = cellSpace.fract().sub(
    vec2(
      hash(cell.add(vec2(3.17, 8.91)))
        .sub(0.5)
        .mul(0.44),
      hash(cell.add(vec2(6.73, 1.29)))
        .sub(0.5)
        .mul(0.5),
    ).add(0.5),
  );
  const ellipseDistance = vec2(local.x.mul(0.78), local.y.mul(1.42)).length();
  const dropletCore = float(1).sub(smoothstep(0.12, 0.34, ellipseDistance));
  const dropletRim = smoothstep(0.2, 0.3, ellipseDistance).mul(
    float(1).sub(smoothstep(0.3, 0.39, ellipseDistance)),
  );
  const centerDistance = screenUV.sub(vec2(0.5)).length();
  const centerVisibilityGuard = mix(
    0.35,
    1,
    smoothstep(0.1, 0.38, centerDistance),
  );
  const edgeGuard = smoothstep(
    0,
    0.04,
    screenUV.x
      .mul(float(1).sub(screenUV.x))
      .min(screenUV.y.mul(float(1).sub(screenUV.y))),
  );
  const coverage = dropletCore
    .mul(0.72)
    .add(dropletRim)
    .clamp(0, 1)
    .mul(centerVisibilityGuard)
    .mul(edgeGuard);
  const distortionDirection = local.div(local.length().max(1e-4));
  const distortionOffset = distortionDirection
    .mul(dropletRim)
    .mul(centerVisibilityGuard)
    .mul(edgeGuard)
    .mul(wetnessStrength)
    .mul(LENS_WETNESS_MAX_DISTORTION_UV);
  const distortedUv = screenUV.add(distortionOffset).clamp(0.001, 0.999);
  const distorted = texture(input.texture, distortedUv);
  const wetness = coverage
    .mul(wetnessStrength)
    .mul(LENS_WETNESS_MAX_VISUAL_OPACITY)
    .clamp(0, LENS_WETNESS_MAX_VISUAL_OPACITY);
  const wetColor = distorted.rgb
    .mul(float(1).sub(wetness))
    .add(vec3(0.8, 0.92, 0.98).mul(wetness).mul(0.42))
    .clamp(0, 1);
  const composed = vec4(wetColor, base.a);
  const output = wetnessStrength.equal(0).select(base, composed);
  const scalar = coverage.mul(wetnessStrength).clamp(0, 1);
  const diagnostics = vec4(scalar, scalar, scalar, 1);
  return Object.freeze({ output, diagnostics });
}

function disposePartialStage(partial: {
  readonly diagnostics?: RenderTarget;
  readonly output?: RenderTarget;
  readonly diagnosticsPipeline?: RenderPipeline;
  readonly outputPipeline?: RenderPipeline;
}): void {
  const disposals = [
    () => partial.diagnosticsPipeline?.dispose(),
    () => partial.outputPipeline?.dispose(),
    () => partial.diagnostics?.dispose(),
    () => partial.output?.dispose(),
  ];
  for (const dispose of disposals) {
    try {
      dispose();
    } catch {
      // Preserve the authoritative construction failure.
    }
  }
}

async function probeTarget(
  renderer: Renderer,
  target: RenderTarget,
  signal: AbortSignal,
  onProbe: () => void,
): Promise<void> {
  throwIfAborted(signal);
  const pixels = await renderer.readRenderTargetPixelsAsync(
    target,
    Math.max(0, Math.floor(target.width / 2)),
    Math.max(0, Math.floor(target.height / 2)),
    1,
    1,
  );
  onProbe();
  if (pixels.length === 0) {
    throw new Error("The lens-wetness completion probe returned no pixels.");
  }
  throwIfAborted(signal);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Three Host preparation was cancelled.");
  }
}
