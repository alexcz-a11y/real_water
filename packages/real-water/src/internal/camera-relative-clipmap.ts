import { BufferGeometry, Float32BufferAttribute } from "three/webgpu";

interface NumericUniform {
  value: number;
}

export const CLIPMAP_INNER_EXTENT_METRES = 48;
export const CLIPMAP_LEVEL_COUNT = 8;

export function createCameraRelativeClipmapGeometry(
  innerSegments: number,
): BufferGeometry {
  if (
    !Number.isInteger(innerSegments) ||
    innerSegments < 4 ||
    innerSegments % 4 !== 0
  ) {
    throw new RangeError(
      "Clipmap inner segments must be a positive multiple of 4.",
    );
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const innerHalf = CLIPMAP_INNER_EXTENT_METRES / 2;

  for (let level = 0; level < CLIPMAP_LEVEL_COUNT; level += 1) {
    const outerHalf = innerHalf * 2 ** level;
    const cell = (CLIPMAP_INNER_EXTENT_METRES / innerSegments) * 2 ** level;
    appendClipmapRing(
      positions,
      uvs,
      indices,
      innerSegments,
      outerHalf,
      cell,
      level === 0 ? 0 : innerSegments / 4,
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function clipmapInnerCellMetres(innerSegments: number): number {
  return CLIPMAP_INNER_EXTENT_METRES / innerSegments;
}

export function snapClipmapToCamera(
  camera: {
    updateMatrixWorld(): void;
    readonly matrixWorld: { readonly elements: ArrayLike<number> };
  },
  originX: NumericUniform,
  originZ: NumericUniform,
  innerCellMetres: number,
): void {
  camera.updateMatrixWorld();
  originX.value =
    Math.round((camera.matrixWorld.elements[12] ?? 0) / innerCellMetres) *
    innerCellMetres;
  originZ.value =
    Math.round((camera.matrixWorld.elements[14] ?? 0) / innerCellMetres) *
    innerCellMetres;
}

function appendClipmapRing(
  positions: number[],
  uvs: number[],
  indices: number[],
  segments: number,
  outerHalf: number,
  cell: number,
  holeStart: number,
): void {
  const holeEnd = segments - holeStart;
  const vertexIndex = new Map<string, number>();

  const vertex = (column: number, row: number): number => {
    const insideHole =
      holeStart > 0 &&
      column > holeStart &&
      column < holeEnd &&
      row > holeStart &&
      row < holeEnd;
    if (insideHole) {
      return -1;
    }
    const key = `${column},${row}`;
    const existing = vertexIndex.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const index = positions.length / 3;
    const x = -outerHalf + column * cell;
    const z = -outerHalf + row * cell;
    positions.push(x, 0, z);
    uvs.push(column / segments, row / segments);
    vertexIndex.set(key, index);
    return index;
  };

  for (let column = 0; column < segments; column += 1) {
    for (let row = 0; row < segments; row += 1) {
      const southWest = vertex(column, row);
      const southEast = vertex(column + 1, row);
      const northEast = vertex(column + 1, row + 1);
      const northWest = vertex(column, row + 1);
      if (southWest < 0 || southEast < 0 || northEast < 0 || northWest < 0) {
        continue;
      }
      indices.push(
        southWest,
        northWest,
        northEast,
        southWest,
        northEast,
        southEast,
      );
    }
  }
}
