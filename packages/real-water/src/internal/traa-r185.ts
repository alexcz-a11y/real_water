import { TextureNode, type Node, type UniformNode } from "three/webgpu";
import { uniform, vec4 } from "three/tsl";

export const STOCK_R185_TRAA_JITTER_PERIOD = 31;

export type TraaResetUniform = UniformNode<"float", number>;

export function createTraaResetUniform(): TraaResetUniform {
  return uniform(0);
}

class ResettableVelocityTextureNode extends TextureNode {
  constructor(
    readonly actualMotion: TextureNode,
    readonly resetUniform: TraaResetUniform,
  ) {
    super(actualMotion.value);
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

export interface TraaJitterAdapter {
  clearViewOffset(): void;
  beginTemporalRender(): void;
  endTemporalRender(succeeded: boolean): void;
  realign(): void;
}

export function createTraaJitterAdapter(node: object): TraaJitterAdapter {
  const original = (node as { clearViewOffset?: () => void }).clearViewOffset;
  if (typeof original !== "function") {
    throw new TypeError("Stock r185 TRAA is missing public clearViewOffset.");
  }
  let index = 0;
  let tracking = false;
  const trackedClearViewOffset = (): void => {
    original.call(node);
    if (tracking) {
      index = (index + 1) % STOCK_R185_TRAA_JITTER_PERIOD;
    }
  };
  (node as { clearViewOffset: () => void }).clearViewOffset =
    trackedClearViewOffset;
  return {
    clearViewOffset() {
      trackedClearViewOffset();
    },
    beginTemporalRender() {
      tracking = true;
    },
    endTemporalRender(succeeded) {
      tracking = false;
      if (!succeeded) {
        return;
      }
    },
    realign() {
      tracking = false;
      const remaining = remainingJitterRealignments(index);
      for (let step = 0; step < remaining; step += 1) {
        original.call(node);
      }
      index = 0;
    },
  };
}

export function remainingJitterRealignments(index: number): number {
  return (
    (STOCK_R185_TRAA_JITTER_PERIOD - (index % STOCK_R185_TRAA_JITTER_PERIOD)) %
    STOCK_R185_TRAA_JITTER_PERIOD
  );
}
