import {
  BufferAttribute,
  BufferGeometry,
  Color,
  FrontSide,
  Mesh,
  MeshBasicMaterial,
  type Camera,
  type Object3D,
} from "three";

export const QA_CURRENT_SSR_FIXTURE_NAME =
  "Reference current-frame SSR fixture" as const;

export const QA_CURRENT_SSR_FIXTURE_HOT_COLORS = Object.freeze({
  magenta: 0xff40c8,
  black: 0x000000,
});

export type QaCurrentSsrFixtureHotColor =
  keyof typeof QA_CURRENT_SSR_FIXTURE_HOT_COLORS;

export interface QaCurrentSsrFixtureState {
  readonly visible: boolean;
  readonly frustumCulled: boolean;
  readonly enabled: boolean;
  readonly scale: readonly [number, number, number];
  readonly hotColor: QaCurrentSsrFixtureHotColor;
  readonly colorWrite: boolean;
  readonly depthWrite: boolean;
}

const QA_CURRENT_SSR_WATER_PLANE_Y = 0;
const CURRENT_SSR_FIXTURE_HALF_HEIGHT = 24;
const CURRENT_SSR_FIXTURE_CENTER_Y = 20;

export const QA_CURRENT_SSR_FIXTURE_BOUNDS = Object.freeze({
  farWallZ: -8,
  nearWallZ: 240,
  halfWidth: 32,
  minY: CURRENT_SSR_FIXTURE_CENTER_Y - CURRENT_SSR_FIXTURE_HALF_HEIGHT,
  maxY: CURRENT_SSR_FIXTURE_CENTER_Y + CURRENT_SSR_FIXTURE_HALF_HEIGHT,
});

export function createQaCurrentSsrFixture(): Mesh {
  const mesh = new Mesh(
    createCurrentSsrFixtureGeometry(),
    new MeshBasicMaterial({
      color: new Color(QA_CURRENT_SSR_FIXTURE_HOT_COLORS.magenta),
      side: FrontSide,
    }),
  );
  mesh.name = QA_CURRENT_SSR_FIXTURE_NAME;
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    applyCurrentSsrFixturePassWrite(mesh, isMainCameraSsrFixture(camera));
  };
  mesh.onAfterRender = () => {
    applyCurrentSsrFixturePassWrite(mesh, true);
  };
  applyQaCurrentSsrFixtureEnabled(mesh, false);
  return mesh;
}

export function applyQaCurrentSsrFixtureEnabled(
  fixture: Object3D,
  enabled: boolean,
): void {
  const mesh = requireCurrentSsrFixtureMesh(fixture);
  mesh.visible = true;
  mesh.frustumCulled = false;
  mesh.userData.qaCurrentSsrEnabled = enabled;
  applyCurrentSsrFixtureScale(mesh);
  applyCurrentSsrFixturePassWrite(mesh, true);
}

export function applyQaCurrentSsrFixtureHotColor(
  fixture: Object3D,
  hotColor: QaCurrentSsrFixtureHotColor,
): void {
  const mesh = requireCurrentSsrFixtureMesh(fixture);
  mesh.material.color.setHex(QA_CURRENT_SSR_FIXTURE_HOT_COLORS[hotColor]);
}

export function readQaCurrentSsrFixture(
  fixture: Object3D,
): QaCurrentSsrFixtureState {
  const mesh = requireCurrentSsrFixtureMesh(fixture);
  const enabled = mesh.userData.qaCurrentSsrEnabled === true;
  const scale = enabled ? 1 : 0;
  return Object.freeze({
    visible: mesh.visible,
    frustumCulled: mesh.frustumCulled,
    enabled,
    scale: [scale, scale, scale] as const,
    hotColor: readHotColor(mesh.material.color.getHex()),
    colorWrite: mesh.material.colorWrite,
    depthWrite: mesh.material.depthWrite,
  });
}

export function disposeQaCurrentSsrFixture(fixture: Object3D): void {
  const mesh = requireCurrentSsrFixtureMesh(fixture);
  mesh.onBeforeRender = () => {};
  mesh.onAfterRender = () => {};
  mesh.removeFromParent();
  mesh.geometry.dispose();
  mesh.material.dispose();
}

function applyCurrentSsrFixtureScale(
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>,
): void {
  const scale = mesh.userData.qaCurrentSsrEnabled === true ? 1 : 0;
  mesh.scale.set(scale, scale, scale);
  mesh.updateMatrixWorld();
}

function applyCurrentSsrFixturePassWrite(
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>,
  allowMainCamera: boolean,
): void {
  mesh.material.colorWrite = allowMainCamera;
  mesh.material.depthWrite = allowMainCamera;
}

function isMainCameraSsrFixture(camera: Camera): boolean {
  return camera.position.y >= QA_CURRENT_SSR_WATER_PLANE_Y;
}

function requireCurrentSsrFixtureMesh(
  fixture: Object3D,
): Mesh<BufferGeometry, MeshBasicMaterial> {
  if (
    !(fixture instanceof Mesh) ||
    fixture.name !== QA_CURRENT_SSR_FIXTURE_NAME ||
    !(fixture.material instanceof MeshBasicMaterial) ||
    fixture.material.side !== FrontSide
  ) {
    throw new TypeError(
      "The Reference current-frame SSR fixture must stay a named FrontSide Mesh.",
    );
  }
  return fixture as Mesh<BufferGeometry, MeshBasicMaterial>;
}

function createCurrentSsrFixtureGeometry(): BufferGeometry {
  const halfWidth = QA_CURRENT_SSR_FIXTURE_BOUNDS.halfWidth;
  const y0 = QA_CURRENT_SSR_FIXTURE_BOUNDS.minY;
  const y1 = QA_CURRENT_SSR_FIXTURE_BOUNDS.maxY;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([
        -halfWidth,
        y0,
        QA_CURRENT_SSR_FIXTURE_BOUNDS.farWallZ,
        halfWidth,
        y0,
        QA_CURRENT_SSR_FIXTURE_BOUNDS.farWallZ,
        halfWidth,
        y1,
        QA_CURRENT_SSR_FIXTURE_BOUNDS.farWallZ,
        -halfWidth,
        y1,
        QA_CURRENT_SSR_FIXTURE_BOUNDS.farWallZ,
        -halfWidth,
        y0,
        QA_CURRENT_SSR_FIXTURE_BOUNDS.nearWallZ,
        halfWidth,
        y0,
        QA_CURRENT_SSR_FIXTURE_BOUNDS.nearWallZ,
        halfWidth,
        y1,
        QA_CURRENT_SSR_FIXTURE_BOUNDS.nearWallZ,
        -halfWidth,
        y1,
        QA_CURRENT_SSR_FIXTURE_BOUNDS.nearWallZ,
      ]),
      3,
    ),
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(
      new Float32Array([
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
      ]),
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new BufferAttribute(
      new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]),
      2,
    ),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return geometry;
}

function readHotColor(hex: number): QaCurrentSsrFixtureHotColor {
  if (hex === QA_CURRENT_SSR_FIXTURE_HOT_COLORS.black) {
    return "black";
  }
  if (hex === QA_CURRENT_SSR_FIXTURE_HOT_COLORS.magenta) {
    return "magenta";
  }
  throw new Error(
    "The Reference current-frame SSR fixture hot color must be magenta or black.",
  );
}
