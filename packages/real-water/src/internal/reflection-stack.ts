import {
  Color,
  LinearSRGBColorSpace,
  Matrix4,
  type Mesh,
  NoToneMapping,
  type PerspectiveCamera,
  Quaternion,
  type Renderer,
  RenderTarget,
  type Scene,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
} from "three/webgpu";
import {
  createHorizontalPlanarReflectionView,
  liftWorldPerspectiveCameraAboveHorizontalPlane,
} from "../reflection.js";

export const REAL_WATER_CLIPMAP_NAME = "Real Water clipmap";
export const PLANAR_REFLECTION_TEXTURE_NAME = "Real Water planar reflection";
export const PLANAR_REFLECTION_PLANE_Y = 0;
export const PLANAR_REFLECTION_SAMPLES = 0;
export const PLANAR_REFLECTION_FORMAT = "rgba8unorm-srgb" as const;

const worldPosition = new Vector3();
const worldQuaternion = new Quaternion();
const worldScale = new Vector3();
const worldForward = new Vector3();
const worldUp = new Vector3();

export interface PlanarReflectionPass {
  readonly target: RenderTarget;
  readonly viewProjection: Matrix4;
  readonly hasOutput: { value: number };
  bindWaterMesh(mesh: Mesh): void;
  prime(
    renderer: Renderer,
    scene: Scene,
    hostCamera: PerspectiveCamera,
  ): Promise<void>;
  render(renderer: Renderer, scene: Scene, hostCamera: PerspectiveCamera): void;
  dispose(): void;
}

export function createPlanarReflectionPass(
  hostCamera: PerspectiveCamera,
  drawingBuffer: Readonly<{ width: number; height: number }>,
): PlanarReflectionPass {
  if (
    !Number.isSafeInteger(drawingBuffer.width) ||
    !Number.isSafeInteger(drawingBuffer.height) ||
    drawingBuffer.width < 1 ||
    drawingBuffer.height < 1
  ) {
    throw new RangeError(
      "The planar reflection target requires a positive drawing buffer.",
    );
  }
  const target = new RenderTarget(drawingBuffer.width, drawingBuffer.height, {
    depthBuffer: true,
    stencilBuffer: false,
    type: UnsignedByteType,
    samples: PLANAR_REFLECTION_SAMPLES,
  });
  target.texture.name = PLANAR_REFLECTION_TEXTURE_NAME;
  target.texture.colorSpace = SRGBColorSpace;
  target.texture.generateMipmaps = false;
  const virtualCamera = hostCamera.clone();
  virtualCamera.parent = null;
  const viewProjection = new Matrix4();
  const hasOutput = { value: 0 };
  let waterMesh: Mesh | undefined;
  let disposed = false;
  let targetDisposed = false;

  const disposeTargetOnce = (): void => {
    if (targetDisposed) {
      return;
    }
    targetDisposed = true;
    target.dispose();
  };

  const assertReady = (): void => {
    if (disposed) {
      throw new Error("The planar reflection pass has been disposed.");
    }
    if (
      target.width !== drawingBuffer.width ||
      target.height !== drawingBuffer.height
    ) {
      throw new Error(
        "The planar reflection target is immutable after prepare.",
      );
    }
  };

  const applyView = (
    view: ReturnType<typeof createHorizontalPlanarReflectionView>,
    camera: PerspectiveCamera,
  ): void => {
    virtualCamera.coordinateSystem = camera.coordinateSystem;
    virtualCamera.fov = camera.fov;
    virtualCamera.near = camera.near;
    virtualCamera.far = camera.far;
    virtualCamera.aspect = camera.aspect;
    virtualCamera.layers.mask = camera.layers.mask;
    virtualCamera.position.set(
      view.position[0],
      view.position[1],
      view.position[2],
    );
    virtualCamera.up.set(view.up[0], view.up[1], view.up[2]);
    virtualCamera.lookAt(view.target[0], view.target[1], view.target[2]);
    virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.fromArray(view.projectionMatrix);
    virtualCamera.projectionMatrixInverse.fromArray(
      view.projectionMatrixInverse,
    );
    viewProjection.multiplyMatrices(
      virtualCamera.projectionMatrix,
      virtualCamera.matrixWorldInverse,
    );
    hasOutput.value = view.hasOutput ? 1 : 0;
  };

  const withBorrowedHostState = (
    renderer: Renderer,
    scene: Scene,
    camera: PerspectiveCamera,
    run: () => void | Promise<void>,
  ): void | Promise<void> => {
    const previousTarget = renderer.getRenderTarget();
    const previousCubeFace = renderer.getActiveCubeFace();
    const previousMipmap = renderer.getActiveMipmapLevel();
    const previousMrt = renderer.getMRT();
    const previousAutoClear = renderer.autoClear;
    const previousClearColor = renderer.getClearColor(new Color());
    const previousClearAlpha = renderer.getClearAlpha();
    const previousToneMapping = renderer.toneMapping;
    const previousOutputColorSpace = renderer.outputColorSpace;
    const previousTransparent = renderer.transparent;
    const previousOpaque = renderer.opaque;
    const previousContextNode = renderer.contextNode;
    const previousBackground = scene.background;
    const previousBackgroundNode = scene.backgroundNode;
    const previousFog = scene.fog;
    const previousOverrideMaterial = scene.overrideMaterial;
    const hostProjection = camera.projectionMatrix.clone();
    const hostProjectionInverse = camera.projectionMatrixInverse.clone();
    const hostMatrixWorld = camera.matrixWorld.clone();
    const hostMatrixWorldInverse = camera.matrixWorldInverse.clone();
    const previousVisibility = waterMesh?.visible;
    if (waterMesh !== undefined) {
      waterMesh.visible = false;
    }
    const restore = (): void => {
      if (waterMesh !== undefined && previousVisibility !== undefined) {
        waterMesh.visible = previousVisibility;
      }
      scene.background = previousBackground;
      scene.backgroundNode = previousBackgroundNode;
      scene.fog = previousFog;
      scene.overrideMaterial = previousOverrideMaterial;
      renderer.setMRT(previousMrt);
      renderer.setRenderTarget(
        previousTarget,
        previousCubeFace,
        previousMipmap,
      );
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      renderer.toneMapping = previousToneMapping;
      renderer.outputColorSpace = previousOutputColorSpace;
      renderer.transparent = previousTransparent;
      renderer.opaque = previousOpaque;
      renderer.contextNode = previousContextNode;
      camera.projectionMatrix.copy(hostProjection);
      camera.projectionMatrixInverse.copy(hostProjectionInverse);
      camera.matrixWorld.copy(hostMatrixWorld);
      camera.matrixWorldInverse.copy(hostMatrixWorldInverse);
    };
    try {
      scene.background = null;
      scene.backgroundNode = null;
      scene.fog = null;
      scene.overrideMaterial = null;
      renderer.setMRT(null);
      renderer.setRenderTarget(target);
      renderer.autoClear = true;
      renderer.toneMapping = NoToneMapping;
      renderer.outputColorSpace = LinearSRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      const result = run();
      if (result !== undefined && typeof result.then === "function") {
        return result.finally(restore);
      }
      restore();
      return result;
    } catch (cause) {
      restore();
      throw cause;
    }
  };

  return {
    target,
    viewProjection,
    hasOutput,
    bindWaterMesh(mesh) {
      waterMesh = mesh;
    },
    async prime(renderer, scene, camera) {
      assertReady();
      if (typeof renderer.compileAsync !== "function") {
        throw new TypeError(
          "The Host renderer must expose compileAsync for planar prewarm.",
        );
      }
      const actualView = createHorizontalPlanarReflectionView({
        coordinateSystem: "webgpu",
        planeY: PLANAR_REFLECTION_PLANE_Y,
        camera: {
          ...readWorldPerspectiveCamera(camera),
          projectionMatrix: camera.projectionMatrix.toArray(),
        },
      });
      const primeView = actualView.hasOutput
        ? actualView
        : createHorizontalPlanarReflectionView({
            coordinateSystem: "webgpu",
            planeY: PLANAR_REFLECTION_PLANE_Y,
            camera: {
              ...forcedFacingWorldCamera(camera),
              projectionMatrix: camera.projectionMatrix.toArray(),
            },
          });
      await withBorrowedHostState(renderer, scene, camera, async () => {
        applyView(primeView, camera);
        await renderer.compileAsync(scene, virtualCamera);
        renderer.render(scene, virtualCamera);
        if (!actualView.hasOutput) {
          applyView(actualView, camera);
          renderer.clear();
        }
      });
    },
    render(renderer, scene, camera) {
      assertReady();
      const view = createHorizontalPlanarReflectionView({
        coordinateSystem: "webgpu",
        planeY: PLANAR_REFLECTION_PLANE_Y,
        camera: {
          ...readWorldPerspectiveCamera(camera),
          projectionMatrix: camera.projectionMatrix.toArray(),
        },
      });
      applyView(view, camera);
      withBorrowedHostState(renderer, scene, camera, () => {
        if (!view.hasOutput) {
          renderer.clear();
          return;
        }
        renderer.render(scene, virtualCamera);
      });
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      waterMesh = undefined;
      disposeTargetOnce();
    },
  };
}

function readWorldPerspectiveCamera(camera: PerspectiveCamera): {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
} {
  camera.updateWorldMatrix(true, false);
  camera.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
  worldForward.set(0, 0, -1).applyQuaternion(worldQuaternion);
  worldUp.set(0, 1, 0).applyQuaternion(worldQuaternion);
  return {
    position: [worldPosition.x, worldPosition.y, worldPosition.z],
    target: [
      worldPosition.x + worldForward.x,
      worldPosition.y + worldForward.y,
      worldPosition.z + worldForward.z,
    ],
    up: [worldUp.x, worldUp.y, worldUp.z],
  };
}

function forcedFacingWorldCamera(camera: PerspectiveCamera): {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
} {
  return liftWorldPerspectiveCameraAboveHorizontalPlane(
    readWorldPerspectiveCamera(camera),
    PLANAR_REFLECTION_PLANE_Y,
  );
}
