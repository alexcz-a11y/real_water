import {
  BackSide,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Object3D,
} from "three";

export const QA_PLANAR_REFLECTION_FIXTURE_NAME =
  "Reference planar reflection fixture" as const;

export const QA_PLANAR_REFLECTION_FIXTURE_HOT_COLORS = Object.freeze({
  magenta: 0xff40c8,
  black: 0x000000,
});

export type QaPlanarReflectionFixtureHotColor =
  keyof typeof QA_PLANAR_REFLECTION_FIXTURE_HOT_COLORS;

export interface QaPlanarReflectionFixtureState {
  readonly visible: boolean;
  readonly frustumCulled: boolean;
  readonly enabled: boolean;
  readonly scale: readonly [number, number, number];
  readonly hotColor: QaPlanarReflectionFixtureHotColor;
}

export function createQaPlanarReflectionFixture(): Mesh {
  const mesh = new Mesh(
    new PlaneGeometry(16, 16),
    new MeshBasicMaterial({
      color: new Color(QA_PLANAR_REFLECTION_FIXTURE_HOT_COLORS.magenta),
      side: BackSide,
    }),
  );
  mesh.name = QA_PLANAR_REFLECTION_FIXTURE_NAME;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(-20, 6, -40);
  applyQaPlanarReflectionFixtureEnabled(mesh, false);
  return mesh;
}

export function applyQaPlanarReflectionFixtureEnabled(
  fixture: Object3D,
  enabled: boolean,
): void {
  const mesh = requirePlanarReflectionFixtureMesh(fixture);
  mesh.visible = true;
  mesh.frustumCulled = false;
  const scale = enabled ? 1 : 0;
  mesh.scale.set(scale, scale, scale);
}

export function applyQaPlanarReflectionFixtureHotColor(
  fixture: Object3D,
  hotColor: QaPlanarReflectionFixtureHotColor,
): void {
  const mesh = requirePlanarReflectionFixtureMesh(fixture);
  mesh.material.color.setHex(QA_PLANAR_REFLECTION_FIXTURE_HOT_COLORS[hotColor]);
}

export function readQaPlanarReflectionFixture(
  fixture: Object3D,
): QaPlanarReflectionFixtureState {
  const mesh = requirePlanarReflectionFixtureMesh(fixture);
  const scale: readonly [number, number, number] = [
    mesh.scale.x,
    mesh.scale.y,
    mesh.scale.z,
  ];
  return Object.freeze({
    visible: mesh.visible,
    frustumCulled: mesh.frustumCulled,
    enabled: scale[0] === 1 && scale[1] === 1 && scale[2] === 1,
    scale,
    hotColor: readHotColor(mesh.material.color.getHex()),
  });
}

export function disposeQaPlanarReflectionFixture(fixture: Object3D): void {
  const mesh = requirePlanarReflectionFixtureMesh(fixture);
  mesh.removeFromParent();
  mesh.geometry.dispose();
  mesh.material.dispose();
}

function requirePlanarReflectionFixtureMesh(
  fixture: Object3D,
): Mesh<PlaneGeometry, MeshBasicMaterial> {
  if (
    !(fixture instanceof Mesh) ||
    fixture.name !== QA_PLANAR_REFLECTION_FIXTURE_NAME ||
    !(fixture.material instanceof MeshBasicMaterial)
  ) {
    throw new TypeError(
      "The Reference planar reflection fixture must stay a named BackSide Mesh.",
    );
  }
  return fixture as Mesh<PlaneGeometry, MeshBasicMaterial>;
}

function readHotColor(hex: number): QaPlanarReflectionFixtureHotColor {
  if (hex === QA_PLANAR_REFLECTION_FIXTURE_HOT_COLORS.black) {
    return "black";
  }
  if (hex === QA_PLANAR_REFLECTION_FIXTURE_HOT_COLORS.magenta) {
    return "magenta";
  }
  throw new Error(
    "The Reference planar reflection fixture hot color must be magenta or black.",
  );
}
