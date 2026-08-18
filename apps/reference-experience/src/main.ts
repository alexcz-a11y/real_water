import "./styles.css";
import { startReferenceExperience } from "./start-reference-experience.js";
import type { MemoryHostScenario } from "real-water";

const mount = document.querySelector("#app");

if (mount === null) {
  throw new Error("The Reference Experience mount was not found.");
}

const parameters = new URLSearchParams(window.location.search);
const scenario = readScenario(parameters.get("scenario"));
const stepDelayMs = readDelay(parameters.get("delay"));
const session = startReferenceExperience(mount, {
  scenario,
  stepDelayMs,
  revealDelayFrames: readRevealFrames(parameters),
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
