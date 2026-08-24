import {
  Vector4,
  WebGPUCoordinateSystem,
  type PerspectiveCamera,
} from "three/webgpu";

/** Output pixel ruler used by frustum visibility and particle contribution. */
export interface SecondaryParticleOutputDrawingBufferReference {
  readonly width: number;
  readonly height: number;
  readonly space: "output-drawing-buffer";
}

export interface SecondaryParticleOutputFrustumVisibility {
  /**
   * Returns one when the current output-space sprite support intersects the
   * camera frustum, otherwise zero. This package-private post-TRAA overlay has
   * no CPU opaque-depth sample: depthVisibility means current output-frustum
   * visibility here, not a claim that opaque scene geometry was tested.
   */
  evaluate(
    camera: PerspectiveCamera,
    worldX: number,
    worldY: number,
    worldZ: number,
    spriteRadiusPixels: number,
  ): 0 | 1;
}

/** Creates an allocation-free evaluator with one preallocated clip scratch. */
export function createSecondaryParticleOutputFrustumVisibility(
  reference: SecondaryParticleOutputDrawingBufferReference,
): SecondaryParticleOutputFrustumVisibility {
  assertOutputDrawingBufferReference(reference);
  const clip = new Vector4();

  return Object.freeze({
    evaluate(
      camera: PerspectiveCamera,
      worldX: number,
      worldY: number,
      worldZ: number,
      spriteRadiusPixels: number,
    ): 0 | 1 {
      clip
        .set(worldX, worldY, worldZ, 1)
        .applyMatrix4(camera.matrixWorldInverse)
        .applyMatrix4(camera.projectionMatrix);

      const clipW = clip.w;
      if (
        !Number.isFinite(clip.x) ||
        !Number.isFinite(clip.y) ||
        !Number.isFinite(clip.z) ||
        !Number.isFinite(clipW) ||
        !(clipW > 0)
      ) {
        return 0;
      }

      const depthInside =
        camera.coordinateSystem === WebGPUCoordinateSystem
          ? clip.z >= 0 && clip.z <= clipW
          : clip.z >= -clipW && clip.z <= clipW;
      if (!depthInside) {
        return 0;
      }

      const ndcX = clip.x / clipW;
      const ndcY = clip.y / clipW;
      const marginX = (spriteRadiusPixels * 2) / reference.width;
      const marginY = (spriteRadiusPixels * 2) / reference.height;
      return ndcX >= -1 - marginX &&
        ndcX <= 1 + marginX &&
        ndcY >= -1 - marginY &&
        ndcY <= 1 + marginY
        ? 1
        : 0;
    },
  });
}

function assertOutputDrawingBufferReference(
  reference: SecondaryParticleOutputDrawingBufferReference,
): void {
  if (
    reference.space !== "output-drawing-buffer" ||
    !Number.isSafeInteger(reference.width) ||
    reference.width <= 0 ||
    !Number.isSafeInteger(reference.height) ||
    reference.height <= 0
  ) {
    throw new TypeError(
      "Secondary-particle visibility requires a positive output-drawing-buffer reference.",
    );
  }
}
