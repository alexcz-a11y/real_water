import {
  TextureNode,
  type Node,
  type NodeBuilder,
  type UniformNode,
} from "three/webgpu";
import { uniform, vec4, velocity } from "three/tsl";

export const STOCK_R185_TRAA_JITTER_PERIOD = 31;
const STOCK_R185_HALTON_OFFSET_COUNT = 32;

export type TraaResetUniform = UniformNode<"float", number>;

export function createTraaResetUniform(): TraaResetUniform {
  return uniform(0);
}

class ResettableVelocityTextureNode extends TextureNode {
  constructor(
    readonly actualMotion: TextureNode,
    readonly resetUniform: TraaResetUniform,
    value = actualMotion.value,
    uvNode: Node | null = null,
    levelNode: Node | null = null,
    biasNode: Node | null = null,
  ) {
    super(value, uvNode, levelNode, biasNode);
  }

  override clone(): this {
    const cloned = new ResettableVelocityTextureNode(
      this.actualMotion,
      this.resetUniform,
      this.value,
      this.uvNode,
      this.levelNode,
      this.biasNode,
    );
    cloned.sampler = this.sampler;
    cloned.depthNode = this.depthNode;
    cloned.compareNode = this.compareNode;
    cloned.gradNode = this.gradNode;
    cloned.gatherNode = this.gatherNode;
    return cloned as this;
  }

  override setup(builder: NodeBuilder): Node {
    const uvNode = this.uvNode;
    if (uvNode === null || uvNode === undefined) {
      return super.setup(builder) as Node;
    }
    super.setup(builder);
    return this.resetUniform
      .greaterThan(0.5)
      .select(vec4(4, 4, 0, 0), this.actualMotion.load(uvNode)) as Node;
  }

  override load(texel: Node): this {
    return this.resetUniform
      .greaterThan(0.5)
      .select(vec4(4, 4, 0, 0), this.actualMotion.load(texel)) as this;
  }
}

export function createResettableVelocityTextureNode(
  actualMotion: TextureNode,
  resetUniform: TraaResetUniform,
): TextureNode {
  return new ResettableVelocityTextureNode(actualMotion, resetUniform);
}

export interface TraaPublicJitterNode {
  setViewOffset(width: number, height: number): void;
  clearViewOffset(): void;
  readonly camera?: {
    clearViewOffset(): void;
    updateProjectionMatrix(): void;
    setViewOffset(
      fullWidth: number,
      fullHeight: number,
      offsetX: number,
      offsetY: number,
      width: number,
      height: number,
    ): void;
    readonly projectionMatrix: { clone(): unknown };
  };
}

export interface TraaJitterAdapter {
  applyCurrentJitter(width: number, height: number): void;
  clearHostCameraViewOffset(camera: { clearViewOffset(): void }): void;
  beginTemporalRender(): void;
  endTemporalRender(succeeded: boolean): void;
  realign(): void;
}

function stockR185Halton(index: number, base: number): number {
  let fraction = 1;
  let result = 0;
  while (index > 0) {
    fraction /= base;
    result += fraction * (index % base);
    index = Math.floor(index / base);
  }
  return result;
}

const STOCK_R185_HALTON_OFFSETS: ReadonlyArray<readonly [number, number]> =
  Object.freeze(
    Array.from({ length: STOCK_R185_HALTON_OFFSET_COUNT }, (_, index) =>
      Object.freeze([
        stockR185Halton(index + 1, 2),
        stockR185Halton(index + 1, 3),
      ] as const),
    ),
  );

export function createTraaJitterAdapter(node: object): TraaJitterAdapter {
  const traa = node as TraaPublicJitterNode;
  if (
    typeof traa.setViewOffset !== "function" ||
    typeof traa.clearViewOffset !== "function"
  ) {
    throw new TypeError(
      "Stock r185 TRAA is missing public setViewOffset/clearViewOffset.",
    );
  }
  const camera = traa.camera;
  if (
    camera === undefined ||
    typeof camera.clearViewOffset !== "function" ||
    typeof camera.setViewOffset !== "function" ||
    typeof camera.updateProjectionMatrix !== "function"
  ) {
    throw new TypeError("Stock r185 TRAA is missing a public camera.");
  }
  let index = 0;
  let tracking = false;
  let advanced = false;
  const applyPatchedSetViewOffset = (width: number, height: number): void => {
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    velocity.setProjectionMatrix(camera.projectionMatrix.clone() as never);
    const jitterOffset = STOCK_R185_HALTON_OFFSETS[index];
    if (jitterOffset === undefined) {
      throw new RangeError("Stock r185 TRAA Halton index is out of range.");
    }
    camera.setViewOffset(
      width,
      height,
      jitterOffset[0] - 0.5,
      jitterOffset[1] - 0.5,
      width,
      height,
    );
  };
  const applyPatchedClearViewOffset = (): void => {
    camera.clearViewOffset();
    velocity.setProjectionMatrix(null);
    if (tracking) {
      index = (index + 1) % STOCK_R185_TRAA_JITTER_PERIOD;
      advanced = true;
    }
  };
  traa.setViewOffset = applyPatchedSetViewOffset;
  traa.clearViewOffset = applyPatchedClearViewOffset;
  return {
    applyCurrentJitter(width, height) {
      applyPatchedSetViewOffset(width, height);
    },
    clearHostCameraViewOffset(camera) {
      camera.clearViewOffset();
    },
    beginTemporalRender() {
      tracking = true;
      advanced = false;
    },
    endTemporalRender(succeeded) {
      if (succeeded && tracking && !advanced) {
        index = (index + 1) % STOCK_R185_TRAA_JITTER_PERIOD;
      }
      tracking = false;
      advanced = false;
    },
    realign() {
      tracking = false;
      advanced = false;
      camera.clearViewOffset();
      velocity.setProjectionMatrix(null);
      index = 0;
    },
  };
}
