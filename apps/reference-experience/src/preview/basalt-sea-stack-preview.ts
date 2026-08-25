import type { Group } from "three";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  NoToneMapping,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
} from "three";
import { MeshStandardNodeMaterial, WebGPURenderer } from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";
import {
  BASALT_SEA_STACK_FIELD,
  createReferenceBasaltSeaStack,
  disposeReferenceBasaltSeaStack,
} from "../reference-basalt-sea-stack.js";

/**
 * Dev-only review page for the basalt sea stack reconstruction (ticket T28b).
 *
 * NOT part of the Reference Experience. The production build's only input is `index.html`, so
 * nothing here ships. It exists for two jobs:
 *
 *   1. Deterministic capture for the img2threejs comparison gates. Framing is reproducible to the
 *      pixel: OrbitControls is disabled until a human clicks into the page, and the render loop
 *      never calls `controls.update()` while `window.__interactive` is false. Without that, the
 *      controls overwrite the scripted camera every frame and a "failed" comparison gate is
 *      really a framing artefact.
 *   2. Human visual approval, through the parameter panel. The panel is a DOM overlay that is
 *      hidden while the page is in capture mode, so it cannot enter a comparison screenshot, and
 *      it only becomes reachable after the human explicitly enables interaction — which is the
 *      same flag the capture path asserts is false.
 *
 * Serve it on port 5185 exactly:
 *   pnpm exec vite apps/reference-experience --port 5185 --strictPort
 * The port is assigned, not chosen. 4173 belongs to the repository's Playwright singleton and
 * must never be bound here.
 */

declare global {
  interface Window {
    __interactive: boolean;
    __ready: boolean;
    __setView: (name: string) => void;
    __previewState: () => Record<string, unknown>;
    __partsManifest: () => Record<string, unknown>;
    __exportGeometry: () => Record<string, unknown>;
    /** True only while every parameter still sits at its sculpt-spec default. */
    __atSpecDefaults: () => boolean;
  }
}

/**
 * Where the object sits inside each approved reference frame, measured on the pack pixels and
 * normalised to the 4096-square frame. `top`/`bottom` bound the ABOVE-WATER part only: three of
 * the four views crop the submerged shaft at a different, unknowable depth, so the above-water
 * box is the only region every view actually shows.
 *
 * Fitting matches HEIGHT and centres horizontally. It deliberately does not match width: the
 * elevations disagree with the anchor on above-water height/diameter by up to 1.80 vs 1.02, and
 * the pack record makes the anchor authoritative for proportion. Stretching each render to its
 * own elevation would hide that drift instead of showing it.
 */
const REVIEW_VIEWS = {
  "anchor-3q": {
    projection: "perspective",
    azimuthDeg: 35,
    elevationDeg: 2,
    referenceTop: 0.0542,
    referenceBottom: 0.7324,
    referenceImage: "sea-stack-anchor-3q-v001.png",
  },
  "front": {
    projection: "orthographic",
    azimuthDeg: 0,
    elevationDeg: 0,
    referenceTop: 0.0854,
    referenceBottom: 0.8076,
    referenceImage: "sea-stack-elev-front-v001.png",
  },
  "side": {
    projection: "orthographic",
    azimuthDeg: 90,
    elevationDeg: 0,
    referenceTop: 0.1116,
    referenceBottom: 0.8323,
    referenceImage: "sea-stack-elev-side-v001.png",
  },
  "back": {
    projection: "orthographic",
    azimuthDeg: 180,
    elevationDeg: 0,
    referenceTop: 0.1099,
    referenceBottom: 0.73,
    referenceImage: "sea-stack-elev-back-v001.png",
  },
} as const;

type ViewName = keyof typeof REVIEW_VIEWS;

const CANVAS_SIZE = 1024;
/** Median studio-background value across the admitted views. */
const DEFAULT_BACKGROUND = "#dcdcde";

const parameters = new URLSearchParams(window.location.search);
const requestedView = (parameters.get("view") ?? "anchor-3q") as ViewName;
const viewName: ViewName =
  requestedView in REVIEW_VIEWS ? requestedView : "anchor-3q";
/** Off by default and never present in a comparison capture — it is a human-review aid only. */
const showWaterPlane = parameters.get("water") === "1";
/**
 * Capture mode. Every comparison capture passes it, and it removes all DOM chrome from the page.
 * The first blockout capture was taken without it and the "enable interaction" button entered the
 * frame, which pulled the measured silhouette's left edge from x=272 to x=12 — a bounding box that
 * was 53 % button.
 */
const captureMode = parameters.get("capture") === "1";
document.body.dataset.capture = captureMode ? "1" : "0";
/**
 * Material-stripped capture. `diagnose_render.py` requires unlit/map-stripped evidence for the
 * blockout pass, so the page can swap the TSL basalt for one flat grey with no vertex colour and
 * no procedural node — the silhouette with nothing for shading to flatter.
 */
const stripMaps = parameters.get("maps") === "off";
/**
 * Scene-participation demo: sea-level water plane, scene fog and a directional shadow. It exists
 * to show the ticket's acceptance criterion — reflection, shadow, fog and horizon composition —
 * and it is NEVER used for a comparison capture, because the reference pack is a neutral studio
 * reference with none of those things in it.
 */
const sceneMode = parameters.get("scene") === "1";
/** Review lens, in degrees. Overridable for the framing calibration sweep. */
const fovOverride = Number.parseFloat(parameters.get("fov") ?? "");
/** Camera elevation override, in degrees, for the same sweep. */
const elevationOverride = Number.parseFloat(parameters.get("elev") ?? "");
/**
 * Camera azimuth override, in degrees. The turntable gate demands four distinct azimuths and
 * exists precisely to catch defects that only appear off-axis, so feeding it the same capture
 * twice would defeat it.
 */
const azimuthOverride = Number.parseFloat(parameters.get("az") ?? "");

const specDefaults = {
  stainRiseMetres: 0,
  aboveWaterHeightMetres: BASALT_SEA_STACK_FIELD.aboveWaterHeightMetres,
  maxRadiusMetres: BASALT_SEA_STACK_FIELD.maxRadiusMetres,
  submergedDepthMetres: BASALT_SEA_STACK_FIELD.submergedDepthMetres,
  roughnessScale: 1,
  background: DEFAULT_BACKGROUND,
  keyIntensity: 5.5,
  fillIntensity: 5.4,
  ambientIntensity: 1.8,
};
const settings = { ...specDefaults };

const stage = document.querySelector("#stage");
const panelLayer = document.querySelector("#panel-layer");
const enableButton = document.querySelector("#enable");
const readout = document.querySelector("#readout");
if (
  !(stage instanceof HTMLElement) ||
  !(panelLayer instanceof HTMLElement) ||
  !(enableButton instanceof HTMLButtonElement) ||
  !(readout instanceof HTMLElement)
) {
  throw new Error("preview page markup is missing an expected element");
}
// Re-bind after the guard: `setView` is hoisted, so TypeScript will not carry the narrowing
// above into a function that could in principle be called before it ran.
const stageEl: HTMLElement = stage;
const panelEl: HTMLElement = panelLayer;
const enableEl: HTMLButtonElement = enableButton;
const readoutEl: HTMLElement = readout;

const renderer = new WebGPURenderer({ antialias: true });
renderer.setPixelRatio(1);
// No tone mapping. The reference pack is a neutral studio capture, so the render is exposed to
// match its measured rock luma directly instead of being pushed through a filmic curve the
// reference never saw.
renderer.toneMapping = NoToneMapping;
renderer.setSize(CANVAS_SIZE, CANVAS_SIZE);
renderer.shadowMap.enabled = true;
stageEl.append(renderer.domElement);

const scene = new Scene();
scene.background = new Color(settings.background);
if (sceneMode) {
  scene.background = new Color("#9fb3bf");
  scene.fog = new Fog(0x9fb3bf, 900, 6500);
}

// Soft overcast daylight with a low key-to-fill ratio, matching the pack's neutral modelling
// reference lighting (Reference Bible section 5). No rim light: the reference has none, and
// adding one would flatter the silhouette the comparison is supposed to judge.
const hemisphere = new HemisphereLight(
  0xc9cbce,
  0x6a6560,
  settings.fillIntensity,
);
scene.add(hemisphere);
const key = new DirectionalLight(0xfff6e8, settings.keyIntensity);
key.position.set(-260, 520, 420);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 100;
key.shadow.camera.far = 4000;
key.shadow.camera.left = -400;
key.shadow.camera.right = 400;
key.shadow.camera.top = 400;
key.shadow.camera.bottom = -400;
scene.add(key);
// Low key-to-fill ratio (Bible §5). Calibrated so the rendered rock lands on the reference's
// measured lit luma of 92-128 out of 255; at the first blockout exposure it rendered at 25-52 and
// the silhouette could not be judged at all.
const ambient = new AmbientLight(0xf2f3f5, settings.ambientIntensity);
scene.add(ambient);

let model: Group = createReferenceBasaltSeaStack({
  stainRiseMetres: settings.stainRiseMetres,
});
if (stripMaps) applyStrippedMaterial(model);
scene.add(model);

const waterPlane = new Mesh(
  new PlaneGeometry(4000, 4000),
  new MeshBasicMaterial({ color: 0x2b3a44, transparent: true, opacity: 0.72 }),
);
waterPlane.rotation.x = -Math.PI / 2;
waterPlane.visible = showWaterPlane || sceneMode;
waterPlane.receiveShadow = true;
scene.add(waterPlane);

// The reference anchor is very nearly orthographic. At the 32 degrees the spec opened with, the
// object nearly fills a square frame and perspective stretched the model's true total H/D of 1.34
// into 1.52 on screen — a proportion failure that was entirely lens. The default below is the
// value the framing sweep landed on; see the spec's referenceCamera note.
const DEFAULT_FOV_DEGREES = 10;
const perspective = new PerspectiveCamera(
  Number.isFinite(fovOverride) && fovOverride > 0
    ? fovOverride
    : DEFAULT_FOV_DEGREES,
  1,
  1,
  400000,
);
const orthographic = new OrthographicCamera(-1, 1, 1, -1, -4000, 8000);
let camera: PerspectiveCamera | OrthographicCamera = perspective;

const controls = new OrbitControls<PerspectiveCamera | OrthographicCamera>(
  camera,
  renderer.domElement,
);
controls.enabled = false;
window.__interactive = false;
window.__ready = false;
controls.addEventListener("start", () => {
  window.__interactive = true;
});

/** Replace the TSL basalt with one flat unlit-ish grey, for map-stripped blockout evidence. */
function applyStrippedMaterial(target: Group): void {
  const flat = new MeshStandardNodeMaterial();
  flat.flatShading = true;
  flat.metalness = 0;
  flat.roughness = 0.9;
  flat.color = new Color("#8a8a8c");
  target.traverse((child) => {
    if (child instanceof Mesh) child.material = flat;
  });
}

/**
 * Points on the MODEL's own above-water surface, for framing.
 *
 * Two earlier versions of this were wrong in the same way — they framed an idealisation instead of
 * the thing being photographed. The bounding box put the object at 0.585 of the frame where the
 * reference has 0.678, because a box's near corner is closer than any point of a solid seen at
 * three-quarters. The analytic envelope was better but still not the model: the seeded field's
 * outer columns protrude past it, so the render came out about 15 % too large in frame. Sampling
 * the built vertices removes the class of error rather than another instance of it.
 */
function framingSamples(target: Group): Vector3[] {
  const points: Vector3[] = [];
  const point = new Vector3();
  target.updateMatrixWorld(true);
  target.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const position = child.geometry.getAttribute("position");
    // Every 7th vertex: the silhouette extremes are shared by many triangles, so a stride this
    // coarse still lands on them and keeps the six fit iterations cheap.
    for (let index = 0; index < position.count; index += 7) {
      point
        .fromBufferAttribute(position, index)
        .applyMatrix4(child.matrixWorld);
      if (point.y >= 0) points.push(point.clone());
    }
  });
  return points;
}

/** Above-water bounding box, which is the box every reference view actually shows. */
function aboveWaterBox(): Box3 {
  const box = new Box3().setFromObject(model);
  box.min.y = 0;
  return box;
}

function setView(name: ViewName): void {
  const view = REVIEW_VIEWS[name];
  const box = aboveWaterBox();
  const centre = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const radius = Math.max(size.x, size.z) / 2;

  const azimuthDeg = Number.isFinite(azimuthOverride)
    ? azimuthOverride
    : view.azimuthDeg;
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevationDeg = Number.isFinite(elevationOverride)
    ? elevationOverride
    : view.elevationDeg;
  const elevation = (elevationDeg * Math.PI) / 180;
  const direction = new Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  );

  // The object must occupy the same vertical share of the frame as it does in the reference,
  // or the fidelity gates score a framing difference as a proportion difference.
  const frameShare = view.referenceBottom - view.referenceTop;
  const worldPerFrame = size.y / frameShare;
  // The reference is not vertically centred; shift the target so the waterline lands where the
  // reference puts it rather than in the middle of the canvas.
  const centreShare = (view.referenceTop + view.referenceBottom) / 2 - 0.5;
  const lookAt = centre.clone();
  lookAt.y += centreShare * worldPerFrame;

  if (view.projection === "perspective") {
    let distance =
      worldPerFrame / 2 / Math.tan((perspective.fov * Math.PI) / 360) + radius;
    const envelopeSamples = framingSamples(model);
    perspective.up.set(0, 1, 0);
    // Solve the distance numerically instead of in closed form. The closed form is exact for a
    // flat billboard and wrong for a solid: the near face subtends more than the centre plane, so
    // a distance derived from the centre framed the object 10 % short, and a framing difference
    // is scored by the fidelity gates as a proportion difference.
    for (let pass = 0; pass < 6; pass += 1) {
      perspective.position.copy(direction).multiplyScalar(distance).add(lookAt);
      perspective.near = Math.max(1, distance * 0.02);
      perspective.far = distance * 4 + radius * 8;
      perspective.updateProjectionMatrix();
      perspective.lookAt(lookAt);
      perspective.updateMatrixWorld(true);
      let top = -Infinity;
      let bottom = Infinity;
      for (const sample of envelopeSamples) {
        const projected = sample.clone().project(perspective);
        top = Math.max(top, projected.y);
        bottom = Math.min(bottom, projected.y);
      }
      const measured = (top - bottom) / 2;
      if (!Number.isFinite(measured) || measured <= 0) break;
      distance *= measured / frameShare;
    }
    camera = perspective;
  } else {
    const half = worldPerFrame / 2;
    orthographic.left = -half;
    orthographic.right = half;
    orthographic.top = half;
    orthographic.bottom = -half;
    orthographic.updateProjectionMatrix();
    orthographic.position
      .copy(direction)
      .multiplyScalar(radius * 8)
      .add(lookAt);
    orthographic.up.set(0, 1, 0);
    orthographic.lookAt(lookAt);
    camera = orthographic;
  }
  controls.object = camera;
  controls.target.copy(lookAt);
  controls.update();

  readoutEl.textContent = [
    `view: ${name} (${view.projection})`,
    `reference: ${view.referenceImage}`,
    `above-water height: ${size.y.toFixed(1)} m   max diameter: ${(radius * 2).toFixed(1)} m`,
    `H/D: ${(size.y / (radius * 2)).toFixed(3)}   columns: ${String(model.userData.columnCount)}`,
    `stain rise: ${settings.stainRiseMetres.toFixed(2)} m   water plane: ${showWaterPlane ? "on" : "off"}`,
  ].join("\n");
}

function rebuildModel(): void {
  scene.remove(model);
  disposeReferenceBasaltSeaStack(model);
  model = createReferenceBasaltSeaStack({
    stainRiseMetres: settings.stainRiseMetres,
  });
  if (stripMaps) applyStrippedMaterial(model);
  model.scale.set(
    settings.maxRadiusMetres / specDefaults.maxRadiusMetres,
    settings.aboveWaterHeightMetres / specDefaults.aboveWaterHeightMetres,
    settings.maxRadiusMetres / specDefaults.maxRadiusMetres,
  );
  scene.add(model);
  setView(viewName);
}

window.__setView = (name: string) => setView(name as ViewName);
/** Screen row of the model's y = 0 plane, so the capture measurement reads the waterline rather
 * than inferring it from a luma derivative that also fires on the object's own bottom edge. */
function projectedWaterlineRow(): number {
  const point = new Vector3(0, 0, 0).project(camera);
  return Math.round(((1 - point.y) / 2) * CANVAS_SIZE);
}

window.__previewState = () => ({
  view: viewName,
  sceneMode,
  waterlineRow: projectedWaterlineRow(),
  waterPlane: showWaterPlane,
  interactive: window.__interactive,
  columnCount: model.userData.columnCount,
  settings: { ...settings },
});
/**
 * Part-tree dump for `check_part_coverage.py`. Every named Group and every named Mesh is a part,
 * because explode and part-picking must share one definition of "a part" — if they disagree, both
 * are wrong.
 */
window.__partsManifest = () => {
  const parts: {
    name: string;
    kind: string;
    module: string;
    triangles: number;
  }[] = [];
  let unnamed = 0;
  model.traverse((child) => {
    if (child instanceof Mesh) {
      const position = child.geometry.getAttribute("position");
      const triangles = position ? Math.floor(position.count / 3) : 0;
      if (child.name) {
        parts.push({
          name: child.name,
          kind: "part",
          module: child.parent?.name ?? "root",
          triangles,
        });
      } else {
        unnamed += 1;
      }
    } else if (child !== model && child.name && child.children.length > 0) {
      parts.push({
        name: child.name,
        kind: "group",
        module: "root",
        triangles: 0,
      });
    }
  });
  return {
    model: "reference-basalt-sea-stack",
    parts,
    unnamedMeshes: unnamed,
    integralMeshes: parts.filter((part) => part.kind === "part").length,
  };
};

/**
 * Flat position/colour arrays per mesh, in WORLD space, for the geometry-side gates
 * (`vertex_region_gate.py`, `self_intersection.py`).
 *
 * Colours are converted back to sRGB on the way out. Three.js stores an sRGB hex as LINEAR in the
 * attribute, so exporting it raw handed the gate values it could not match against the sRGB
 * palette it is given: 75 % of vertices came back unclassified and, worse, the whole upface region
 * was silently matched to `basalt-wet` because two very different colours land within the 0.06
 * tolerance once one of them has been linearised.
 */
window.__exportGeometry = () => {
  const meshes: {
    name: string;
    positions: number[];
    colors: number[];
    normals: number[];
  }[] = [];
  model.updateMatrixWorld(true);
  model.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const position = child.geometry.getAttribute("position");
    const colour = child.geometry.getAttribute("color");
    const normal = child.geometry.getAttribute("normal");
    if (!position) return;
    const positions: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];
    const point = new Vector3();
    const direction = new Vector3();
    const exported = new Color();
    for (let index = 0; index < position.count; index += 1) {
      point
        .fromBufferAttribute(position, index)
        .applyMatrix4(child.matrixWorld);
      positions.push(point.x, point.y, point.z);
      if (colour !== undefined) {
        exported
          .setRGB(colour.getX(index), colour.getY(index), colour.getZ(index))
          .convertLinearToSRGB();
        colors.push(exported.r, exported.g, exported.b);
      }
      if (normal !== undefined) {
        // Real surface normals, not a centroid guess. `self_intersection.py` falls back to
        // "away from the MESH centroid" when none are supplied, and each course mesh holds
        // hundreds of separate columns spread over a 268 m disc — so for a column near the rim
        // that direction points into its own inward-facing wall, and the gate reported 950
        // vertices "inside" that are nothing of the kind.
        direction
          .fromBufferAttribute(normal, index)
          .transformDirection(child.matrixWorld);
        normals.push(direction.x, direction.y, direction.z);
      }
    }
    meshes.push({ name: child.name, positions, colors, normals });
  });
  return { meshes };
};

window.__atSpecDefaults = () =>
  !showWaterPlane &&
  !sceneMode &&
  (Object.keys(specDefaults) as (keyof typeof specDefaults)[]).every(
    (name) => settings[name] === specDefaults[name],
  );

enableEl.addEventListener("click", () => {
  window.__interactive = true;
  controls.enabled = true;
  panelEl.dataset.visible = "true";
  readoutEl.hidden = false;
  enableEl.hidden = true;
});

const gui = new GUI({ container: panelEl, title: "Basalt sea stack — review" });
const shape = gui.addFolder("Shape (spec defaults)");
shape
  .add(settings, "aboveWaterHeightMetres", 250, 300, 1)
  .name("above-water height (m)")
  .onFinishChange(rebuildModel);
shape
  .add(settings, "maxRadiusMetres", 90, 180, 1)
  .name("max radius (m)")
  .onFinishChange(rebuildModel);
shape
  .add(settings, "submergedDepthMetres", 20, 180, 1)
  .name("submerged depth (m)")
  .onFinishChange(rebuildModel);
const waterline = gui.addFolder("Waterline");
waterline
  .add(settings, "stainRiseMetres", 0, 24, 0.5)
  .name("stain rise above water (m)")
  .onFinishChange(rebuildModel);
const look = gui.addFolder("Look");
look
  .addColor(settings, "background")
  .name("background")
  .onChange(() => {
    scene.background = new Color(settings.background);
  });
look
  .add(settings, "keyIntensity", 0, 4, 0.05)
  .name("key intensity")
  .onChange(() => {
    key.intensity = settings.keyIntensity;
  });
look
  .add(settings, "fillIntensity", 0, 3, 0.05)
  .name("fill intensity")
  .onChange(() => {
    hemisphere.intensity = settings.fillIntensity;
  });
const motion = gui.addFolder("Animation");
motion
  .add(
    {
      note: "static by Bible section 10 — userData.tick exists and does nothing",
    },
    "note",
  )
  .name("state")
  .disable();

setView(viewName);

let renderInFlight = false;
function loop(): void {
  requestAnimationFrame(loop);
  if (window.__interactive) controls.update();
  if (renderInFlight) return;
  renderInFlight = true;
  void renderer.renderAsync(scene, camera).then(() => {
    renderInFlight = false;
    // Set only after a frame has actually reached the swap chain, so a capture that waits on
    // `__ready` is waiting on pixels rather than on module evaluation.
    window.__ready = true;
  });
}

await renderer.init();
loop();
