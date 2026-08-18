import "./styles.css";
import { Color, PerspectiveCamera, Scene } from "three";
import { WebGPURenderer } from "three/webgpu";
import {
  createMemoryHostLifecycleAdapter,
  createThreeHostLifecycleAdapter,
  type HostLifecycleAdapter,
  type MemoryHostScenario,
  type RealWaterLease,
} from "real-water";
import { startReferenceExperience } from "./start-reference-experience.js";

const mount = document.querySelector("#app");

if (mount === null) {
  throw new Error("The Reference Experience mount was not found.");
}

const parameters = new URLSearchParams(window.location.search);
const hostSetup = createHostSetup(parameters);
const referenceSession = startReferenceExperience(mount, {
  createHost: hostSetup.createHost,
  ...(hostSetup.createReadyStage === undefined
    ? {}
    : { createReadyStage: hostSetup.createReadyStage }),
  revealDelayFrames: readRevealFrames(parameters),
});
let disposal: Promise<void> | undefined;
const session = Object.freeze({
  dispose(): Promise<void> {
    disposal ??= (async () => {
      await referenceSession.dispose();
      await hostSetup.dispose?.();
    })();
    return disposal;
  },
});

if (parameters.get("qa") === "1") {
  window.__REAL_WATER_QA__ = Object.freeze({
    dispose: () => session.dispose(),
  });
}

window.addEventListener(
  "pagehide",
  () => {
    void session.dispose();
  },
  { once: true },
);

interface ReferenceHostSetup {
  readonly createHost: () => HostLifecycleAdapter;
  readonly createReadyStage?: (lease: RealWaterLease) => HTMLElement;
  readonly dispose?: () => void | Promise<void>;
}

function createHostSetup(parameters: URLSearchParams): ReferenceHostSetup {
  if (parameters.get("qa") === "1" && parameters.get("host") === "memory") {
    const scenario = readScenario(parameters.get("scenario"));
    const stepDelayMs = readDelay(parameters.get("delay"));

    return {
      createHost: () =>
        createMemoryHostLifecycleAdapter({
          scenario,
          stepDelayMs,
        }),
    };
  }

  const renderer = new WebGPURenderer({
    forceWebGL: parameters.get("forceWebGL") === "1",
  });
  const scene = new Scene();
  scene.background = new Color(0x031019);

  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const camera = new PerspectiveCamera(50, width / height, 0.1, 100);
  camera.position.set(8, 6, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);

  return {
    createHost: () =>
      createThreeHostLifecycleAdapter({ renderer, scene, camera }),
    createReadyStage: (lease) => createCanvasStage(renderer, lease),
    dispose: () => renderer.dispose(),
  };
}

function createCanvasStage(
  renderer: WebGPURenderer,
  lease: RealWaterLease,
): HTMLElement {
  const stage = document.createElement("main");
  stage.className = "reference-stage";
  stage.dataset.testid = "reference-stage";
  stage.dataset.manifestHash = lease.manifest.manifestHash;
  stage.dataset.backend = lease.capabilities.rendering.backend;
  stage.dataset.timestampQuery = String(
    lease.capabilities.rendering.timestampQuery,
  );
  stage.id = "reference-stage";
  stage.tabIndex = -1;
  stage.setAttribute("aria-label", "Real Water Reference Experience");

  const canvas = renderer.domElement;
  canvas.className = "reference-canvas";
  canvas.setAttribute("aria-label", "Minimal prewarmed water plane");
  canvas.setAttribute("role", "img");
  stage.append(canvas);
  return stage;
}

function readScenario(value: string | null): MemoryHostScenario {
  switch (value) {
    case "unsupported":
      return {
        kind: "unsupported",
        reason: "The requested mock environment is unsupported.",
      };
    case "failure":
      return {
        kind: "failure",
        message: "The requested mock prewarm step failed.",
      };
    default:
      return { kind: "success" };
  }
}

function readDelay(value: string | null): number {
  if (value === null) {
    return 80;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 2_000) : 80;
}

function readRevealFrames(parameters: URLSearchParams): number {
  if (parameters.get("qa") !== "1") {
    return 1;
  }

  const parsed = Number(parameters.get("revealFrames"));
  return Number.isFinite(parsed) && parsed >= 1
    ? Math.min(Math.floor(parsed), 240)
    : 1;
}

declare global {
  interface Window {
    __REAL_WATER_QA__?: Readonly<{
      dispose(): Promise<void>;
    }>;
  }
}
