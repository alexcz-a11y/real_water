import {
  FloatType,
  HalfFloatType,
  RedFormat,
  RGBAFormat,
  RGFormat,
  RenderPipeline,
  RenderTarget,
  type PerspectiveCamera,
  type Renderer,
  type Texture,
} from "three/webgpu";
import {
  float,
  getScreenPosition,
  getViewPosition,
  mix,
  perspectiveDepthToViewZ,
  reflect,
  saturate,
  select,
  step,
  texture,
  uniform,
  uv,
  vec3,
  vec4,
  viewZToOrthographicDepth,
} from "three/tsl";
import { ssr } from "three/addons/tsl/display/SSRNode.js";
import {
  CURRENT_FRAME_SSR_POLICY,
  type QualityProfileReflectionSsr,
} from "../quality-profile.js";
import {
  CURRENT_FRAME_SSR_BLACK_HIT_EPSILON,
  CURRENT_FRAME_SSR_WATER_MASK_EPSILON,
} from "../ssr.js";
import {
  assertRendererCopyTextureToTexture,
  assertResolvedHistorySize,
  createSpecularTemporalReproject,
  createUnpackedViewNormalTextureNode,
  createUnparentedHistoryCamera,
  readResolvedHistoryTexture,
  syncUnparentedHistoryCamera,
  type SpecularTemporalReprojectPublic,
} from "./ssr-temporal-reproject.js";

export interface CurrentFrameSsrStack {
  readonly ssrNode: ReturnType<typeof ssr>;
  readonly sceneTriggerPipeline: RenderPipeline;
  readonly ssrTriggerPipeline: RenderPipeline;
  readonly historyTriggerPipeline: RenderPipeline;
  readonly beautyPipeline: RenderPipeline;
  readonly beautyTarget: RenderTarget;
  readonly history: SpecularTemporalReprojectPublic;
  readonly historyResolvedTarget: RenderTarget;
  readonly resetVelocityTarget: RenderTarget;
  readonly resetVelocityPipeline: RenderPipeline;
  readonly compositePipeline: RenderPipeline;
  readonly compositeTarget: RenderTarget;
  readonly depthConversionPipeline: RenderPipeline;
  readonly depthConversionTarget: RenderTarget;
  readonly preparedWidth: number;
  readonly preparedHeight: number;
  syncCamera(camera: PerspectiveCamera): void;
  ensureGraphPrepared(renderer: Renderer): void;
}

export function createCurrentFrameSsrStack(
  renderer: Renderer,
  scenePass: {
    readonly getTexture: (name: string) => Texture;
    readonly getTextureNode: (name?: string) => unknown;
  },
  camera: PerspectiveCamera,
  drawingBuffer: Readonly<{ width: number; height: number }>,
  attachments: {
    readonly viewNormal: Texture;
    readonly opticalFactors: Texture;
    readonly motionVectors: Texture;
    readonly outputName?: string;
  },
  policy: QualityProfileReflectionSsr = CURRENT_FRAME_SSR_POLICY,
): CurrentFrameSsrStack {
  const allocated: {
    ssrNode?: ReturnType<typeof ssr>;
    history?: SpecularTemporalReprojectPublic;
    beautyTarget?: RenderTarget;
    beautyPipeline?: RenderPipeline;
    historyResolvedTarget?: RenderTarget;
    historyTriggerPipeline?: RenderPipeline;
    resetVelocityTarget?: RenderTarget;
    resetVelocityPipeline?: RenderPipeline;
    compositeTarget?: RenderTarget;
    compositePipeline?: RenderPipeline;
    sceneTriggerPipeline?: RenderPipeline;
    ssrTriggerPipeline?: RenderPipeline;
    depthConversionTarget?: RenderTarget;
    depthConversionPipeline?: RenderPipeline;
  } = {};
  try {
    const beautyTexture = scenePass.getTexture(
      attachments.outputName ?? "output",
    );
    const depthTexture = scenePass.getTexture("depth");
    const unpackedViewNormal = createUnpackedViewNormalTextureNode(
      attachments.viewNormal,
    );
    const ssrNode = ssr(
      texture(beautyTexture),
      texture(depthTexture),
      unpackedViewNormal as never,
      {
        stochastic: false,
        reflectNonMetals: false,
        binaryRefine: policy.binaryRefine,
        metalnessNode: step(
          float(CURRENT_FRAME_SSR_WATER_MASK_EPSILON),
          texture(attachments.opticalFactors).r,
        ),
        roughnessNode: texture(attachments.viewNormal).a,
        camera,
      },
    );
    allocated.ssrNode = ssrNode;
    ssrNode.updateBeforeType = "none";
    ssrNode.resolutionScale = policy.resolutionScale;
    ssrNode.maxDistance.value = policy.maxDistance;
    ssrNode.thickness.value = policy.thickness;
    ssrNode.quality.value = policy.quality;
    ssrNode.blurQuality = policy.blurQuality;
    ssrNode.screenEdgeFade.value = policy.screenEdgeFade;
    ssrNode.screenEdgeFadeBlack = true;
    ssrNode.setSize(drawingBuffer.width, drawingBuffer.height);
    ssrNode.getRenderTarget().texture.name = "Real Water current-frame SSR raw";

    const rawSsr = texture(ssrNode.getRenderTarget().texture);
    const stockSsr = ssrNode;
    const beautyTarget = new RenderTarget(
      drawingBuffer.width,
      drawingBuffer.height,
      {
        depthBuffer: false,
        stencilBuffer: false,
        type: HalfFloatType,
        format: RGBAFormat,
      },
    );
    allocated.beautyTarget = beautyTarget;
    beautyTarget.texture.name = "Real Water SSR history beauty";
    const beautyPipeline = new RenderPipeline(
      renderer,
      vec4(vec3(stockSsr.rgb), rawSsr.a),
    );
    allocated.beautyPipeline = beautyPipeline;
    beautyPipeline.outputColorTransform = false;

    const historyCamera = createUnparentedHistoryCamera(camera);
    syncUnparentedHistoryCamera(historyCamera, camera);
    const history = createSpecularTemporalReproject(
      beautyTarget.texture,
      depthTexture,
      attachments.viewNormal,
      attachments.motionVectors,
      historyCamera,
    );
    allocated.history = history;
    const historyResolvedTarget = new RenderTarget(
      drawingBuffer.width,
      drawingBuffer.height,
      {
        depthBuffer: false,
        stencilBuffer: false,
        type: HalfFloatType,
        format: RGBAFormat,
      },
    );
    allocated.historyResolvedTarget = historyResolvedTarget;
    historyResolvedTarget.texture.name =
      "Real Water SSR TemporalReproject resolved";
    const historyTriggerPipeline = new RenderPipeline(
      renderer,
      history as never,
    );
    allocated.historyTriggerPipeline = historyTriggerPipeline;
    historyTriggerPipeline.outputColorTransform = false;

    const resetVelocityTarget = new RenderTarget(
      drawingBuffer.width,
      drawingBuffer.height,
      {
        depthBuffer: false,
        stencilBuffer: false,
        type: HalfFloatType,
        format: RGFormat,
      },
    );
    allocated.resetVelocityTarget = resetVelocityTarget;
    resetVelocityTarget.texture.name = "Real Water SSR history reset velocity";
    const resetVelocityPipeline = new RenderPipeline(
      renderer,
      vec4(4, 4, 0, 0),
    );
    allocated.resetVelocityPipeline = resetVelocityPipeline;
    resetVelocityPipeline.outputColorTransform = false;

    const baseColor = texture(beautyTexture);
    const fresnel = texture(attachments.opticalFactors).r;
    const roughness = texture(attachments.viewNormal).a;
    const worldDistance = rawSsr.a;
    const rawHit = step(float(1e-6), worldDistance);
    const distanceFactor = saturate(
      float(1).sub(worldDistance.div(policy.maxDistance)),
    );
    const roughnessFactor = float(1).sub(
      step(float(policy.roughnessCutoff), roughness),
    );
    const waterMask = float(1).sub(
      step(fresnel, float(CURRENT_FRAME_SSR_WATER_MASK_EPSILON)),
    );
    const projectionMatrix = uniform(camera.projectionMatrix);
    const projectionMatrixInverse = uniform(camera.projectionMatrixInverse);
    const uvNode = uv();
    const viewPosition = getViewPosition(
      uvNode,
      texture(depthTexture).sample(uvNode).r,
      projectionMatrixInverse,
    );
    const viewNormal = texture(attachments.viewNormal)
      .rgb.mul(2)
      .sub(1)
      .normalize();
    const viewReflectDir = reflect(
      viewPosition.normalize(),
      viewNormal,
    ).normalize();
    const hitUv = getScreenPosition(
      viewPosition.add(viewReflectDir.mul(worldDistance)),
      projectionMatrix,
    );
    const hitOnScreen = step(float(0), hitUv.x)
      .mul(step(hitUv.x, float(1)))
      .mul(step(float(0), hitUv.y))
      .mul(step(hitUv.y, float(1)));
    const hitEdgeDist = hitUv.x
      .min(float(1).sub(hitUv.x))
      .min(hitUv.y)
      .min(float(1).sub(hitUv.y));
    const edgeFactor = saturate(
      hitEdgeDist.div(Math.max(policy.screenEdgeFade, 1e-6)),
    );
    const hitFresnel = texture(attachments.opticalFactors, hitUv).r;
    const waterHitReject = float(1).sub(
      step(float(CURRENT_FRAME_SSR_WATER_MASK_EPSILON), hitFresnel),
    );
    const hitDepth = texture(depthTexture).sample(hitUv).r;
    const hitHasGeometry = float(1).sub(step(float(1), hitDepth));
    const boundedCandidate = rawHit
      .mul(distanceFactor)
      .mul(edgeFactor)
      .mul(roughnessFactor)
      .mul(waterMask)
      .mul(waterHitReject)
      .mul(hitHasGeometry)
      .mul(hitOnScreen)
      .clamp(0, 1);
    const historyRgb = history.getTextureNode().rgb;
    const currentRgb = vec3(stockSsr.rgb);
    const currentBlack = currentRgb
      .length()
      .lessThan(float(CURRENT_FRAME_SSR_BLACK_HIT_EPSILON));
    const useCurrentBlack = rawHit.mul(
      select(currentBlack, float(1), float(0)),
    );
    const historyFinite = select(
      historyRgb.x.mul(0).equal(0),
      float(1),
      float(0),
    )
      .mul(select(historyRgb.y.mul(0).equal(0), float(1), float(0)))
      .mul(select(historyRgb.z.mul(0).equal(0), float(1), float(0)))
      .equal(float(1));
    const candidateSsrRgb = select(
      useCurrentBlack.equal(float(1)),
      currentRgb,
      select(historyFinite, historyRgb, currentRgb),
    );
    const valid = select(worldDistance.mul(0).equal(0), float(1), float(0))
      .mul(select(roughness.mul(0).equal(0), float(1), float(0)))
      .mul(select(fresnel.mul(0).equal(0), float(1), float(0)))
      .mul(select(hitUv.x.mul(0).equal(0), float(1), float(0)))
      .mul(select(hitUv.y.mul(0).equal(0), float(1), float(0)))
      .mul(select(hitFresnel.mul(0).equal(0), float(1), float(0)))
      .mul(select(hitDepth.mul(0).equal(0), float(1), float(0)))
      .mul(select(stockSsr.r.mul(0).equal(0), float(1), float(0)))
      .mul(select(stockSsr.g.mul(0).equal(0), float(1), float(0)))
      .mul(select(stockSsr.b.mul(0).equal(0), float(1), float(0)))
      .mul(select(candidateSsrRgb.x.mul(0).equal(0), float(1), float(0)))
      .mul(select(candidateSsrRgb.y.mul(0).equal(0), float(1), float(0)))
      .mul(select(candidateSsrRgb.z.mul(0).equal(0), float(1), float(0)))
      .equal(float(1));
    const candidateWeight = boundedCandidate.mul(fresnel);
    const candidateMixedRgb = mix(
      vec3(baseColor.rgb),
      candidateSsrRgb,
      candidateWeight,
    );
    const confidence = select(valid, boundedCandidate, float(0));
    const finalCompositeRgb = select(
      valid,
      candidateMixedRgb,
      vec3(baseColor.rgb),
    );
    const compositeNode = vec4(finalCompositeRgb, confidence);

    const compositeTarget = new RenderTarget(
      drawingBuffer.width,
      drawingBuffer.height,
      {
        depthBuffer: false,
        stencilBuffer: false,
        type: HalfFloatType,
        format: RGBAFormat,
      },
    );
    allocated.compositeTarget = compositeTarget;
    compositeTarget.texture.name = "Real Water current-frame SSR composite";
    const compositePipeline = new RenderPipeline(renderer, compositeNode);
    allocated.compositePipeline = compositePipeline;
    compositePipeline.outputColorTransform = false;
    const sceneTriggerPipeline = new RenderPipeline(
      renderer,
      scenePass.getTextureNode("output") as never,
    );
    allocated.sceneTriggerPipeline = sceneTriggerPipeline;
    sceneTriggerPipeline.outputColorTransform = false;
    const ssrTriggerPipeline = new RenderPipeline(renderer, ssrNode);
    allocated.ssrTriggerPipeline = ssrTriggerPipeline;
    ssrTriggerPipeline.outputColorTransform = false;

    const cameraNearUniform = uniform(camera.near);
    const cameraFarUniform = uniform(camera.far);
    const viewZ = perspectiveDepthToViewZ(
      texture(depthTexture),
      cameraNearUniform,
      cameraFarUniform,
    );
    const linear = viewZToOrthographicDepth(
      viewZ,
      cameraNearUniform,
      cameraFarUniform,
    );
    const depthConversionTarget = new RenderTarget(
      drawingBuffer.width,
      drawingBuffer.height,
      {
        depthBuffer: false,
        stencilBuffer: false,
        type: FloatType,
        format: RedFormat,
      },
    );
    allocated.depthConversionTarget = depthConversionTarget;
    depthConversionTarget.texture.name = "Real Water inverse linear depth";
    const depthConversionPipeline = new RenderPipeline(
      renderer,
      vec4(float(1).sub(linear), 0, 0, 1),
    );
    allocated.depthConversionPipeline = depthConversionPipeline;
    depthConversionPipeline.outputColorTransform = false;

    let graphPrepared = false;
    const ensureGraphPrepared = (nextRenderer: Renderer): void => {
      if (graphPrepared) {
        return;
      }
      const previous = nextRenderer.getRenderTarget();
      try {
        nextRenderer.setRenderTarget(ssrNode.getRenderTarget());
        ssrTriggerPipeline.render();
        nextRenderer.setRenderTarget(resetVelocityTarget);
        resetVelocityPipeline.render();
        nextRenderer.setRenderTarget(historyResolvedTarget);
        historyTriggerPipeline.render();
        graphPrepared = true;
      } finally {
        nextRenderer.setRenderTarget(previous);
      }
    };

    return {
      ssrNode,
      sceneTriggerPipeline,
      ssrTriggerPipeline,
      historyTriggerPipeline,
      beautyPipeline,
      beautyTarget,
      history,
      historyResolvedTarget,
      resetVelocityTarget,
      resetVelocityPipeline,
      compositePipeline,
      compositeTarget,
      depthConversionPipeline,
      depthConversionTarget,
      preparedWidth: drawingBuffer.width,
      preparedHeight: drawingBuffer.height,
      syncCamera(nextCamera) {
        cameraNearUniform.value = nextCamera.near;
        cameraFarUniform.value = nextCamera.far;
        projectionMatrix.value = nextCamera.projectionMatrix;
        projectionMatrixInverse.value = nextCamera.projectionMatrixInverse;
        syncUnparentedHistoryCamera(historyCamera, nextCamera);
      },
      ensureGraphPrepared,
    };
  } catch (cause) {
    disposeAllocatedCurrentFrameSsr(allocated);
    throw cause;
  }
}

export function renderCurrentFrameSsr(
  renderer: Renderer,
  stack: CurrentFrameSsrStack,
): void {
  stack.ssrNode.updateBefore({ renderer } as never);
  renderer.setRenderTarget(stack.beautyTarget);
  stack.beautyPipeline.render();
}

export function renderCurrentFrameSsrHistory(
  renderer: Renderer,
  stack: CurrentFrameSsrStack,
  resetActive: boolean,
): void {
  assertRendererCopyTextureToTexture(renderer);
  const hitPoint = stack.history.hitPointReprojection;
  const velocityNode = stack.history.velocityNode;
  const previousVelocityTexture = velocityNode.value;
  if (resetActive) {
    velocityNode.value = stack.resetVelocityTarget.texture;
    hitPoint.value = false;
  }
  try {
    stack.history.updateBefore({ renderer });
    renderer.copyTextureToTexture(
      readResolvedHistoryTexture(stack.history),
      stack.historyResolvedTarget.texture,
    );
  } finally {
    if (resetActive) {
      velocityNode.value = previousVelocityTexture;
    }
    hitPoint.value = true;
  }
}

export function assertCurrentFrameSsrPreparedSize(
  stack: CurrentFrameSsrStack,
): void {
  const raw = stack.ssrNode.getRenderTarget();
  if (
    raw.width !== stack.preparedWidth ||
    raw.height !== stack.preparedHeight ||
    stack.compositeTarget.width !== stack.preparedWidth ||
    stack.compositeTarget.height !== stack.preparedHeight ||
    stack.depthConversionTarget.width !== stack.preparedWidth ||
    stack.depthConversionTarget.height !== stack.preparedHeight ||
    stack.beautyTarget.width !== stack.preparedWidth ||
    stack.beautyTarget.height !== stack.preparedHeight ||
    stack.historyResolvedTarget.width !== stack.preparedWidth ||
    stack.historyResolvedTarget.height !== stack.preparedHeight ||
    stack.resetVelocityTarget.width !== stack.preparedWidth ||
    stack.resetVelocityTarget.height !== stack.preparedHeight
  ) {
    throw new Error(
      "Current-frame SSR raw, composite, depth, beauty, history, or reset-velocity targets drifted from the prepared drawing buffer.",
    );
  }
  assertResolvedHistorySize(stack.history, {
    width: stack.preparedWidth,
    height: stack.preparedHeight,
  });
}

export function disposeCurrentFrameSsrStack(stack: CurrentFrameSsrStack): void {
  disposeAllocatedCurrentFrameSsr(stack);
}

function disposeAllocatedCurrentFrameSsr(allocated: {
  readonly ssrNode?: { dispose(): void };
  readonly history?: { dispose(): void };
  readonly beautyTarget?: { dispose(): void };
  readonly beautyPipeline?: { dispose(): void };
  readonly historyResolvedTarget?: { dispose(): void };
  readonly historyTriggerPipeline?: { dispose(): void };
  readonly resetVelocityTarget?: { dispose(): void };
  readonly resetVelocityPipeline?: { dispose(): void };
  readonly compositeTarget?: { dispose(): void };
  readonly compositePipeline?: { dispose(): void };
  readonly sceneTriggerPipeline?: { dispose(): void };
  readonly ssrTriggerPipeline?: { dispose(): void };
  readonly depthConversionTarget?: { dispose(): void };
  readonly depthConversionPipeline?: { dispose(): void };
}): void {
  allocated.sceneTriggerPipeline?.dispose();
  allocated.ssrTriggerPipeline?.dispose();
  allocated.historyTriggerPipeline?.dispose();
  allocated.resetVelocityPipeline?.dispose();
  allocated.beautyPipeline?.dispose();
  allocated.compositePipeline?.dispose();
  allocated.depthConversionPipeline?.dispose();
  allocated.history?.dispose();
  allocated.ssrNode?.dispose();
  allocated.beautyTarget?.dispose();
  allocated.historyResolvedTarget?.dispose();
  allocated.resetVelocityTarget?.dispose();
  allocated.compositeTarget?.dispose();
  allocated.depthConversionTarget?.dispose();
}
