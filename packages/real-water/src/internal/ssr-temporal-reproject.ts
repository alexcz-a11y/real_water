import {
  TextureNode,
  type Node,
  type NodeBuilder,
  type PerspectiveCamera,
  type Renderer,
  type Texture,
} from "three/webgpu";
import { texture, vec4 } from "three/tsl";
import { temporalReproject } from "three/addons/tsl/display/TemporalReprojectNode.js";

export interface SpecularTemporalReprojectPublic {
  getTextureNode(): TextureNode;
  setSize(width: number, height: number): void;
  updateBefore(frame: { renderer: Renderer }): void;
  dispose(): void;
  updateBeforeType: string;
  maxFrames: { value: number };
  hitPointReprojection: { value: boolean };
  velocityNode: { value: Texture };
}

export class UnpackedViewNormalTextureNode extends TextureNode {
  constructor(
    packed: Texture,
    uvNode: Node | null = null,
    levelNode: Node | null = null,
    biasNode: Node | null = null,
  ) {
    super(packed, uvNode, levelNode, biasNode);
  }

  override setup(builder: NodeBuilder): Node {
    super.setup(builder);
    const packed =
      this.uvNode === null || this.uvNode === undefined
        ? texture(this.value)
        : texture(this.value, this.uvNode);
    return vec4(packed.rgb.mul(2).sub(1), packed.a);
  }

  override sample(uvNode: Node): this {
    const sampled = texture(this.value, uvNode);
    return vec4(sampled.rgb.mul(2).sub(1), sampled.a) as unknown as this;
  }

  override load(uvNode: Node): this {
    const loaded = texture(this.value).load(uvNode);
    return vec4(loaded.rgb.mul(2).sub(1), loaded.a) as unknown as this;
  }
}

export function createUnpackedViewNormalTextureNode(
  packed: Texture,
): TextureNode {
  return new UnpackedViewNormalTextureNode(packed);
}

export function asSpecularTemporalReprojectPublic(
  node: object,
): SpecularTemporalReprojectPublic {
  const candidate = node as Partial<SpecularTemporalReprojectPublic>;
  if (
    typeof candidate.getTextureNode !== "function" ||
    typeof candidate.setSize !== "function" ||
    typeof candidate.updateBefore !== "function" ||
    typeof candidate.dispose !== "function" ||
    candidate.maxFrames === undefined ||
    candidate.hitPointReprojection === undefined ||
    typeof candidate.hitPointReprojection.value !== "boolean" ||
    candidate.velocityNode === undefined ||
    candidate.velocityNode.value === undefined ||
    candidate.velocityNode.value === null ||
    (candidate.velocityNode.value as { readonly isTexture?: boolean })
      .isTexture !== true
  ) {
    throw new TypeError(
      "Stock r185 TemporalReproject is missing public getTextureNode/setSize/updateBefore/dispose/hitPointReprojection/velocityNode.",
    );
  }
  return candidate as SpecularTemporalReprojectPublic;
}

export function createUnparentedHistoryCamera(
  host: PerspectiveCamera,
): PerspectiveCamera {
  const proxy = host.clone();
  proxy.matrixAutoUpdate = false;
  proxy.removeFromParent();
  return proxy;
}

export function syncUnparentedHistoryCamera(
  proxy: PerspectiveCamera,
  host: PerspectiveCamera,
): void {
  host.updateWorldMatrix(true, false);
  proxy.coordinateSystem = host.coordinateSystem;
  proxy.fov = host.fov;
  proxy.aspect = host.aspect;
  proxy.near = host.near;
  proxy.far = host.far;
  proxy.zoom = host.zoom;
  proxy.filmGauge = host.filmGauge;
  proxy.filmOffset = host.filmOffset;
  if (host.view === null || host.view === undefined) {
    proxy.view = null;
  } else {
    proxy.view = {
      enabled: host.view.enabled,
      fullWidth: host.view.fullWidth,
      fullHeight: host.view.fullHeight,
      offsetX: host.view.offsetX,
      offsetY: host.view.offsetY,
      width: host.view.width,
      height: host.view.height,
    };
  }
  proxy.projectionMatrix.copy(host.projectionMatrix);
  proxy.projectionMatrixInverse.copy(host.projectionMatrixInverse);
  proxy.position.setFromMatrixPosition(host.matrixWorld);
  proxy.matrixWorld.copy(host.matrixWorld);
  proxy.matrixWorldInverse.copy(host.matrixWorldInverse);
}

export function createSpecularTemporalReproject(
  beauty: Texture,
  depth: Texture,
  packedViewNormal: Texture,
  motionVectors: Texture,
  camera: PerspectiveCamera,
): SpecularTemporalReprojectPublic {
  let node: object | undefined;
  try {
    node = temporalReproject(
      texture(beauty),
      texture(depth),
      texture(packedViewNormal),
      texture(motionVectors),
      camera,
      {
        mode: "specular",
        hitPointReprojection: true,
        accumulate: true,
      },
    );
    const publicNode = asSpecularTemporalReprojectPublic(node);
    publicNode.updateBeforeType = "none";
    publicNode.maxFrames.value = 32;
    return publicNode;
  } catch (cause) {
    if (
      node !== undefined &&
      typeof (node as { dispose?: unknown }).dispose === "function"
    ) {
      (node as { dispose(): void }).dispose();
    }
    throw cause;
  }
}

export function readResolvedHistoryTexture(
  node: SpecularTemporalReprojectPublic,
): Texture {
  const textureNode = node.getTextureNode();
  const resolved = textureNode.value;
  if (resolved === undefined || resolved === null) {
    throw new TypeError(
      "Stock r185 TemporalReproject getTextureNode() did not expose a resolved texture.",
    );
  }
  return resolved;
}

export function assertResolvedHistorySize(
  node: SpecularTemporalReprojectPublic,
  drawingBuffer: Readonly<{ width: number; height: number }>,
): void {
  const resolved = readResolvedHistoryTexture(node);
  const image = resolved.image as
    { width?: number; height?: number } | null | undefined;
  const width = image?.width;
  const height = image?.height;
  if (width !== drawingBuffer.width || height !== drawingBuffer.height) {
    throw new Error(
      "TemporalReproject resolved texture drifted from the prepared drawing buffer.",
    );
  }
}

export function assertRendererCopyTextureToTexture(renderer: {
  readonly copyTextureToTexture?: unknown;
}): void {
  if (typeof renderer.copyTextureToTexture !== "function") {
    throw new TypeError(
      "The Host renderer must expose copyTextureToTexture for TemporalReproject history.",
    );
  }
}
