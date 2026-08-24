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
  abs,
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
import type {
  PostTraaStageDeclaration,
  PostTraaStageFactory,
  PreparedPostTraaStage,
} from "../post-traa-composition.js";
import type { StormFrontFrame } from "../storm-front.js";
import { SECONDARY_PARTICLE_POST_TRAA_STAGE_ID } from "./secondary-particle-post-traa-stage.js";

export const STORM_FRONT_POST_TRAA_STAGE_ID = "storm-atmosphere" as const;

export const STORM_FRONT_POST_TRAA_STAGE_DECLARATION: PostTraaStageDeclaration =
  Object.freeze({
    id: STORM_FRONT_POST_TRAA_STAGE_ID,
    after: SECONDARY_PARTICLE_POST_TRAA_STAGE_ID,
  });

export interface StormFrontPostTraaStageRegistration {
  readonly factory: PostTraaStageFactory;
  readonly declaration: PostTraaStageDeclaration;
  diagnosticsTarget(): RenderTarget;
  synchronize(frame: StormFrontFrame): void;
}

/**
 * Creates the drawing-buffer-exact Storm Front atmosphere stage. Rain remains
 * part of the prepared ocean and shared secondary-particle routes; this stage
 * applies only bounded whole-frame atmosphere and exposes all four Storm Front
 * evidence channels through one stable diagnostics target.
 */
export function createStormFrontPostTraaStageRegistration(options: {
  readonly onProbe: () => void;
}): StormFrontPostTraaStageRegistration {
  const rainRippleStrength = uniform(0).setName("stormFrontRainRippleStrength");
  const stormAerosolStrength = uniform(0).setName("stormFrontAerosolStrength");
  const cloudShadowStrength = uniform(0).setName(
    "stormFrontCloudShadowStrength",
  );
  const lightningStrength = uniform(0).setName("stormFrontLightningStrength");
  const horizonHaze = uniform(0).setName("stormFrontHorizonHaze");
  const spatialPhase = uniform(0).setName("stormFrontSpatialPhase");
  let diagnostics: RenderTarget | undefined;

  const factory: PostTraaStageFactory = Object.freeze({
    id: STORM_FRONT_POST_TRAA_STAGE_ID,
    create({
      renderer,
      input,
      drawingBuffer,
    }: Parameters<PostTraaStageFactory["create"]>[0]): PreparedPostTraaStage {
      if (diagnostics !== undefined) {
        throw new Error(
          "The Storm Front post-TRAA stage factory is already bound.",
        );
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
        output.texture.name = "Real Water Storm Front atmosphere color";

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
        diagnosticsTarget.texture.name =
          "Real Water Storm Front atmosphere diagnostics";
        diagnosticsTarget.texture.colorSpace = LinearSRGBColorSpace;

        const nodes = createStormFrontNodes(input, {
          rainRippleStrength,
          stormAerosolStrength,
          cloudShadowStrength,
          lightningStrength,
          horizonHaze,
          spatialPhase,
        });
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
            throw new Error("The Storm Front post-TRAA stage is disposed.");
          }
          renderer.setMRT(null);
          renderer.setRenderTarget(output);
          outputPipeline.render();
          renderer.setRenderTarget(diagnosticsTarget);
          diagnosticsPipeline.render();
        };

        const stage: PreparedPostTraaStage = Object.freeze({
          id: STORM_FRONT_POST_TRAA_STAGE_ID,
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
                "The Storm Front post-TRAA stage is not prepared.",
              );
            }
            renderPreparedStage();
          },
          async probe(signal: AbortSignal): Promise<void> {
            if (!prepared || disposed) {
              throw new Error(
                "The Storm Front post-TRAA stage is not available for probing.",
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
    declaration: STORM_FRONT_POST_TRAA_STAGE_DECLARATION,
    diagnosticsTarget(): RenderTarget {
      if (diagnostics === undefined) {
        throw new Error(
          "The Storm Front atmosphere diagnostics target is not prepared.",
        );
      }
      return diagnostics;
    },
    synchronize(frame: StormFrontFrame): void {
      rainRippleStrength.value = clampUnit(frame.rainRippleStrength);
      stormAerosolStrength.value = clampUnit(frame.stormAerosolStrength);
      cloudShadowStrength.value = clampUnit(frame.cloudShadowStrength);
      lightningStrength.value = clampUnit(frame.lightningStrength);
      horizonHaze.value = clampUnit(frame.atmosphere.horizonHaze);
      spatialPhase.value = clampUnit(frame.spatialPhase);
    },
  });
}

function createStormFrontNodes(
  input: RenderTarget,
  strengths: Readonly<{
    rainRippleStrength: Node<"float">;
    stormAerosolStrength: Node<"float">;
    cloudShadowStrength: Node<"float">;
    lightningStrength: Node<"float">;
    horizonHaze: Node<"float">;
    spatialPhase: Node<"float">;
  }>,
): Readonly<{
  output: Node<"vec4">;
  diagnostics: Node<"vec4">;
}> {
  const base = texture(input.texture);
  const atmosphereCell = screenUV
    .mul(vec2(12, 7))
    .floor()
    .add(vec2(strengths.spatialPhase.mul(17), strengths.spatialPhase.mul(29)));
  const atmospherePattern = mix(0.55, 1, hash(atmosphereCell));
  const horizonBand = float(1).sub(
    smoothstep(0.06, 0.5, abs(screenUV.y.sub(0.54))),
  );

  const cloudShadowOpacity = strengths.cloudShadowStrength
    .mul(atmospherePattern)
    .mul(0.34)
    .clamp(0, 0.34);
  const shadowed = base.rgb.mul(float(1).sub(cloudShadowOpacity));

  const hazeOpacity = strengths.horizonHaze
    .mul(horizonBand)
    .mul(0.36)
    .clamp(0, 0.36);
  const hazed = mix(shadowed, vec3(0.48, 0.55, 0.6), hazeOpacity);

  const aerosolOpacity = strengths.stormAerosolStrength
    .mul(horizonBand.mul(0.65).add(0.08))
    .mul(atmospherePattern)
    .clamp(0, 0.48);
  const aerosolized = mix(hazed, vec3(0.27, 0.32, 0.36), aerosolOpacity);

  const lightningEnvelope = strengths.lightningStrength
    .mul(mix(0.22, 1, horizonBand))
    .mul(mix(0.75, 1, atmospherePattern))
    .mul(0.6)
    .clamp(0, 0.6);
  const composed = aerosolized
    .add(vec3(0.75, 0.84, 1).mul(lightningEnvelope))
    .clamp(0, 1);

  return Object.freeze({
    output: vec4(composed, base.a),
    diagnostics: vec4(
      strengths.rainRippleStrength.clamp(0, 1),
      strengths.stormAerosolStrength.clamp(0, 1),
      strengths.cloudShadowStrength.clamp(0, 1),
      strengths.lightningStrength.clamp(0, 1),
    ),
  });
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
    throw new Error(
      "The Storm Front post-TRAA completion probe returned no pixels.",
    );
  }
  throwIfAborted(signal);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Three Host preparation was cancelled.");
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Storm Front post-TRAA inputs must be finite.");
  }
  return Math.min(1, Math.max(0, value));
}
