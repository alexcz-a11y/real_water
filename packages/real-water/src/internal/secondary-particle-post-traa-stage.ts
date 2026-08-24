import {
  HalfFloatType,
  LinearSRGBColorSpace,
  RGBAFormat,
  RenderPipeline,
  RenderTarget,
  UnsignedByteType,
  type Renderer,
} from "three/webgpu";
import { texture, vec4 } from "three/tsl";
import type {
  PostTraaCompositionPlan,
  PostTraaStageFactory,
  PreparedPostTraaStage,
} from "../post-traa-composition.js";

export const SECONDARY_PARTICLE_POST_TRAA_STAGE_ID =
  "secondary-particles" as const;

export const SECONDARY_PARTICLE_POST_TRAA_PLAN: PostTraaCompositionPlan =
  Object.freeze({
    mode: "ordered-declarative-stages",
    resolutionPolicy: "drawing-buffer-exact",
    stages: Object.freeze([
      Object.freeze({
        id: SECONDARY_PARTICLE_POST_TRAA_STAGE_ID,
        after: "traa",
      }),
    ]),
  });

export interface SecondaryParticlePostTraaStageRegistration {
  readonly factory: PostTraaStageFactory;
  diagnosticsTarget(): RenderTarget;
}

/**
 * Creates the prepared post-TRAA insertion point for secondary-particle
 * synthesis. The registered producer remains consumer-neutral: it receives
 * the prepared renderer after this stage binds and clears its accumulation
 * target, then this stage composites the result over the TRAA-resolved input.
 */
export function createSecondaryParticlePostTraaStageRegistration(options: {
  readonly onProbe: () => void;
  readonly renderAccumulation: (renderer: Renderer) => void;
}): SecondaryParticlePostTraaStageRegistration {
  let diagnostics: RenderTarget | undefined;
  const factory: PostTraaStageFactory = Object.freeze({
    id: SECONDARY_PARTICLE_POST_TRAA_STAGE_ID,
    create({
      renderer,
      input,
      drawingBuffer,
    }: Parameters<PostTraaStageFactory["create"]>[0]): PreparedPostTraaStage {
      if (diagnostics !== undefined) {
        throw new Error(
          "The secondary-particle post-TRAA stage factory is already bound.",
        );
      }
      const partial: {
        accumulationTarget?: RenderTarget;
        output?: RenderTarget;
        pipeline?: RenderPipeline;
      } = {};
      try {
        const accumulationTarget = new RenderTarget(
          drawingBuffer.width,
          drawingBuffer.height,
          {
            depthBuffer: false,
            stencilBuffer: false,
            type: HalfFloatType,
            format: RGBAFormat,
          },
        );
        partial.accumulationTarget = accumulationTarget;
        accumulationTarget.texture.name =
          "Real Water secondary particle accumulation";
        accumulationTarget.texture.colorSpace = LinearSRGBColorSpace;

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
        const base = texture(input.texture);
        const accumulation = texture(accumulationTarget.texture);
        const pipeline = new RenderPipeline(
          renderer,
          vec4(base.rgb.add(accumulation.rgb).clamp(0, 1), base.a),
        );
        partial.pipeline = pipeline;
        pipeline.outputColorTransform = false;
        let disposed = false;
        let prepared = false;

        const renderPreparedStage = (): void => {
          if (disposed) {
            throw new Error(
              "The secondary-particle post-TRAA stage is disposed.",
            );
          }
          renderer.setMRT(null);
          renderer.setRenderTarget(accumulationTarget);
          renderer.setClearColor(0x000000, 0);
          renderer.clear();
          options.renderAccumulation(renderer);
          renderer.setRenderTarget(output);
          pipeline.render();
        };

        const stage: PreparedPostTraaStage = Object.freeze({
          id: SECONDARY_PARTICLE_POST_TRAA_STAGE_ID,
          output,
          async prepare(signal: AbortSignal): Promise<void> {
            throwIfAborted(signal);
            renderer.initRenderTarget(accumulationTarget);
            renderer.initRenderTarget(output);
            renderPreparedStage();
            throwIfAborted(signal);
            prepared = true;
          },
          render(): void {
            if (!prepared) {
              throw new Error(
                "The secondary-particle post-TRAA stage is not prepared.",
              );
            }
            renderPreparedStage();
          },
          async probe(signal: AbortSignal): Promise<void> {
            if (!prepared || disposed) {
              throw new Error(
                "The secondary-particle post-TRAA stage is not available for probing.",
              );
            }
            await probeTarget(renderer, output, signal, options.onProbe);
            await probeTarget(
              renderer,
              accumulationTarget,
              signal,
              options.onProbe,
            );
          },
          dispose(): void {
            if (disposed) {
              return;
            }
            disposed = true;
            pipeline.dispose();
            output.dispose();
            accumulationTarget.dispose();
          },
        });
        diagnostics = accumulationTarget;
        return stage;
      } catch (cause) {
        disposePartialStage(partial);
        throw cause;
      }
    },
  });

  return Object.freeze({
    factory,
    diagnosticsTarget(): RenderTarget {
      if (diagnostics === undefined) {
        throw new Error(
          "The secondary-particle diagnostics target is not prepared.",
        );
      }
      return diagnostics;
    },
  });
}

function disposePartialStage(partial: {
  readonly accumulationTarget?: RenderTarget;
  readonly output?: RenderTarget;
  readonly pipeline?: RenderPipeline;
}): void {
  const disposals = [
    () => partial.pipeline?.dispose(),
    () => partial.output?.dispose(),
    () => partial.accumulationTarget?.dispose(),
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
    throw new Error("The post-TRAA stage completion probe returned no pixels.");
  }
  throwIfAborted(signal);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Three Host preparation was cancelled.");
  }
}
