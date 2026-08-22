import {
  HalfFloatType,
  Matrix4,
  RenderPipeline,
  RenderTarget,
  type PerspectiveCamera,
  type Renderer,
  type Texture,
} from "three/webgpu";
import {
  float,
  getViewPosition,
  screenUV,
  step,
  texture,
  uniform,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import { CURRENT_FRAME_SSR_WATER_MASK_EPSILON } from "../ssr.js";

export interface SpectralWhitecapStageSampler {
  sampleStages(hostX: Node<"float">, hostZ: Node<"float">): Node<"vec4">;
}

export interface SpectralWhitecapDiagnostics {
  readonly target: RenderTarget;
  render(renderer: Renderer, camera: PerspectiveCamera): void;
  dispose(): void;
}

export function createSpectralWhitecapDiagnostics(
  renderer: Renderer,
  camera: PerspectiveCamera,
  depthTexture: Texture,
  opticalFactorsTexture: Texture,
  drawingBuffer: Readonly<{ width: number; height: number }>,
  sampler: SpectralWhitecapStageSampler,
): SpectralWhitecapDiagnostics {
  const target = new RenderTarget(drawingBuffer.width, drawingBuffer.height, {
    depthBuffer: false,
    stencilBuffer: false,
    type: HalfFloatType,
  });
  target.texture.name = "Real Water spectral whitecap stages";
  try {
    const hostProjectionInverse = new Matrix4().copy(
      camera.projectionMatrixInverse,
    );
    const hostWorldMatrix = new Matrix4().copy(camera.matrixWorld);
    const projectionInverseNode = uniform(hostProjectionInverse).setName(
      "whitecapHostProjectionInverse",
    );
    const worldMatrixNode = uniform(hostWorldMatrix).setName(
      "whitecapHostWorldMatrix",
    );
    const depth = texture(depthTexture, screenUV).r;
    const viewPosition = getViewPosition(
      screenUV,
      depth,
      projectionInverseNode,
    );
    const worldPosition = worldMatrixNode.mul(vec4(viewPosition, 1)).xyz;
    const waterMask = step(
      float(CURRENT_FRAME_SSR_WATER_MASK_EPSILON),
      texture(opticalFactorsTexture, screenUV).r,
    );
    const packedStages = vec4(
      sampler.sampleStages(worldPosition.x, worldPosition.z),
    ).mul(waterMask);
    const pipeline = new RenderPipeline(renderer, packedStages);
    pipeline.outputColorTransform = false;
    let disposed = false;

    return Object.freeze({
      target,
      render(nextRenderer: Renderer, nextCamera: PerspectiveCamera): void {
        if (disposed) {
          throw new Error(
            "The spectral-whitecap diagnostics route is disposed.",
          );
        }
        nextCamera.updateMatrixWorld();
        hostProjectionInverse.copy(nextCamera.projectionMatrixInverse);
        hostWorldMatrix.copy(nextCamera.matrixWorld);
        nextRenderer.setRenderTarget(target);
        pipeline.render();
      },
      dispose(): void {
        if (disposed) {
          return;
        }
        disposed = true;
        pipeline.dispose();
        target.dispose();
      },
    });
  } catch (cause) {
    target.dispose();
    throw cause;
  }
}
