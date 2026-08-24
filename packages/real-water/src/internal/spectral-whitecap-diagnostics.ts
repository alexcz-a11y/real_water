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

export interface UnifiedFoamSampler {
  sampleStages(hostX: Node<"float">, hostZ: Node<"float">): Node<"vec4">;
  sampleSources(hostX: Node<"float">, hostZ: Node<"float">): Node<"vec4">;
  sampleSourcesAtFieldUv(uvX: Node<"float">, uvY: Node<"float">): Node<"vec4">;
  sampleHeroBreakerFoamAtFieldUv(
    uvX: Node<"float">,
    uvY: Node<"float">,
  ): Node<"float">;
}

export interface UnifiedFoamDiagnostics {
  readonly stageTarget: RenderTarget;
  readonly sourceIdentityTarget: RenderTarget;
  readonly heroBreakerFoamTarget: RenderTarget;
  renderStages(renderer: Renderer, camera: PerspectiveCamera): void;
  renderSources(renderer: Renderer): void;
  renderHeroBreakerFoam(renderer: Renderer): void;
  renderAll(renderer: Renderer, camera: PerspectiveCamera): void;
  dispose(): void;
}

export function createUnifiedFoamDiagnostics(
  renderer: Renderer,
  camera: PerspectiveCamera,
  depthTexture: Texture,
  opticalFactorsTexture: Texture,
  drawingBuffer: Readonly<{ width: number; height: number }>,
  sampler: UnifiedFoamSampler,
): UnifiedFoamDiagnostics {
  const stageTarget = new RenderTarget(
    drawingBuffer.width,
    drawingBuffer.height,
    {
      depthBuffer: false,
      stencilBuffer: false,
      type: HalfFloatType,
    },
  );
  stageTarget.texture.name = "Real Water spectral whitecap stages";
  const sourceIdentityTarget = new RenderTarget(
    drawingBuffer.width,
    drawingBuffer.height,
    {
      depthBuffer: false,
      stencilBuffer: false,
      type: HalfFloatType,
    },
  );
  sourceIdentityTarget.texture.name = "Real Water unified foam sources";
  const heroBreakerFoamTarget = new RenderTarget(
    drawingBuffer.width,
    drawingBuffer.height,
    {
      depthBuffer: false,
      stencilBuffer: false,
      type: HalfFloatType,
    },
  );
  heroBreakerFoamTarget.texture.name = "Real Water Hero Breaker foam identity";
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
    // Source identity is a canonical view of the logical field's anchor-local
    // ±48 m domain. Unlike the legacy screen-space stage attachment, it does
    // not inherit camera jitter, depth reconstruction, or presentation count.
    const packedSources = vec4(
      sampler.sampleSourcesAtFieldUv(screenUV.x, screenUV.y),
    );
    const heroBreakerFoam = sampler.sampleHeroBreakerFoamAtFieldUv(
      screenUV.x,
      screenUV.y,
    );
    const packedHeroBreakerFoam = vec4(heroBreakerFoam, 0, 0, 1);
    const stagePipeline = new RenderPipeline(renderer, packedStages);
    stagePipeline.outputColorTransform = false;
    const sourcePipeline = new RenderPipeline(renderer, packedSources);
    sourcePipeline.outputColorTransform = false;
    const heroBreakerFoamPipeline = new RenderPipeline(
      renderer,
      packedHeroBreakerFoam,
    );
    heroBreakerFoamPipeline.outputColorTransform = false;
    let disposed = false;

    const updateCamera = (nextCamera: PerspectiveCamera): void => {
      nextCamera.updateMatrixWorld();
      hostProjectionInverse.copy(nextCamera.projectionMatrixInverse);
      hostWorldMatrix.copy(nextCamera.matrixWorld);
    };
    const assertActive = (): void => {
      if (disposed) {
        throw new Error("The spectral-whitecap diagnostics route is disposed.");
      }
    };
    const renderStages = (
      nextRenderer: Renderer,
      nextCamera: PerspectiveCamera,
    ): void => {
      assertActive();
      updateCamera(nextCamera);
      nextRenderer.setRenderTarget(stageTarget);
      stagePipeline.render();
    };
    const renderSources = (nextRenderer: Renderer): void => {
      assertActive();
      nextRenderer.setRenderTarget(sourceIdentityTarget);
      sourcePipeline.render();
    };
    const renderHeroBreakerFoam = (nextRenderer: Renderer): void => {
      assertActive();
      nextRenderer.setRenderTarget(heroBreakerFoamTarget);
      heroBreakerFoamPipeline.render();
    };

    return Object.freeze({
      stageTarget,
      sourceIdentityTarget,
      heroBreakerFoamTarget,
      renderStages,
      renderSources,
      renderHeroBreakerFoam,
      renderAll(nextRenderer: Renderer, nextCamera: PerspectiveCamera): void {
        assertActive();
        updateCamera(nextCamera);
        nextRenderer.setRenderTarget(stageTarget);
        stagePipeline.render();
        nextRenderer.setRenderTarget(sourceIdentityTarget);
        sourcePipeline.render();
        nextRenderer.setRenderTarget(heroBreakerFoamTarget);
        heroBreakerFoamPipeline.render();
      },
      dispose(): void {
        if (disposed) {
          return;
        }
        disposed = true;
        stagePipeline.dispose();
        sourcePipeline.dispose();
        heroBreakerFoamPipeline.dispose();
        stageTarget.dispose();
        sourceIdentityTarget.dispose();
        heroBreakerFoamTarget.dispose();
      },
    });
  } catch (cause) {
    stageTarget.dispose();
    sourceIdentityTarget.dispose();
    heroBreakerFoamTarget.dispose();
    throw cause;
  }
}
