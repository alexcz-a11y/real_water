import {
  REFERENCE_AUTHORED_LOOKS,
  REFERENCE_DEFAULT_AUTHORED_LOOK_ID,
  isReferenceAuthoredLookId,
  type AuthoredLookId,
} from "./reference-authored-looks.js";
export {
  REFERENCE_AUTHORED_LOOKS,
  type AuthoredLookId,
  type ReferenceAuthoredLook,
} from "./reference-authored-looks.js";

export type ReferenceExperienceMode = "director" | "sandbox";

export interface ReferenceExperienceModeSnapshot {
  readonly revision: number;
  readonly mode: ReferenceExperienceMode;
  readonly paused: boolean;
  readonly activeLook: AuthoredLookId;
}

export type ReferenceExperienceModeSubscriber = (
  snapshot: ReferenceExperienceModeSnapshot,
) => void;

/**
 * App-composition callbacks keep the mode seam independent of Main, leases,
 * and the concrete vessel, camera, and Showcase implementations. Disabling
 * Sandbox input is also the composition layer's signal to clear held input.
 */
export interface ReferenceExperienceModeControllerOptions {
  readonly initialLook?: AuthoredLookId;
  readonly setShowcaseEnabled: (enabled: boolean) => void;
  readonly setSandboxInputEnabled: (enabled: boolean) => void;
  readonly setSimulationPaused: (paused: boolean) => void;
  readonly resetDirector: () => void;
  readonly resetSandbox: () => void;
  readonly selectSandboxLook: (look: AuthoredLookId) => void;
  readonly releaseManualLookOwnership: () => void;
}

export interface ReferenceExperienceModeController {
  snapshot(): ReferenceExperienceModeSnapshot;
  subscribe(subscriber: ReferenceExperienceModeSubscriber): () => void;
  setMode(mode: ReferenceExperienceMode): void;
  setPaused(paused: boolean): void;
  reset(): void;
  selectSandboxLook(look: AuthoredLookId): void;
  reportDirectorLook(look: AuthoredLookId): void;
  dispose(): void;
}

export interface ReferenceExperienceModePresenter {
  dispose(): void;
}

let presenterSequence = 0;

export function createReferenceExperienceModeController(
  options: ReferenceExperienceModeControllerOptions,
): ReferenceExperienceModeController {
  let revision = 0;
  let mode: ReferenceExperienceMode = "director";
  let paused = false;
  const initialLook = options.initialLook ?? REFERENCE_DEFAULT_AUTHORED_LOOK_ID;
  assertAuthoredLook(initialLook);
  let activeLook: AuthoredLookId = initialLook;
  let disposed = false;
  let currentSnapshot = freezeSnapshot(revision, mode, paused, activeLook);
  const subscribers = new Set<ReferenceExperienceModeSubscriber>();

  const publish = (): void => {
    revision += 1;
    currentSnapshot = freezeSnapshot(revision, mode, paused, activeLook);
    for (const subscriber of subscribers) {
      subscriber(currentSnapshot);
    }
  };

  const controller: ReferenceExperienceModeController = {
    snapshot(): ReferenceExperienceModeSnapshot {
      assertUsable(disposed);
      return currentSnapshot;
    },
    subscribe(subscriber: ReferenceExperienceModeSubscriber): () => void {
      assertUsable(disposed);
      if (typeof subscriber !== "function") {
        throw new TypeError(
          "Reference Experience mode subscriber must be a function.",
        );
      }
      subscribers.add(subscriber);
      subscriber(currentSnapshot);
      let subscribed = true;
      return () => {
        if (!subscribed) {
          return;
        }
        subscribed = false;
        subscribers.delete(subscriber);
      };
    },
    setMode(nextMode: ReferenceExperienceMode): void {
      assertUsable(disposed);
      assertMode(nextMode);
      if (nextMode === mode) {
        return;
      }

      if (nextMode === "sandbox") {
        options.setShowcaseEnabled(false);
        options.setSandboxInputEnabled(true);
        options.setSimulationPaused(false);
      } else {
        options.setSandboxInputEnabled(false);
        options.setSimulationPaused(false);
        options.releaseManualLookOwnership();
        options.setShowcaseEnabled(true);
        options.resetDirector();
        activeLook = REFERENCE_DEFAULT_AUTHORED_LOOK_ID;
      }
      mode = nextMode;
      paused = false;
      publish();
    },
    setPaused(nextPaused: boolean): void {
      assertUsable(disposed);
      if (mode !== "sandbox") {
        throw new Error(
          "The Reference Experience can only be paused in Sandbox mode.",
        );
      }
      if (typeof nextPaused !== "boolean") {
        throw new TypeError("Sandbox paused state must be a boolean.");
      }
      if (nextPaused === paused) {
        return;
      }
      options.setSimulationPaused(nextPaused);
      paused = nextPaused;
      publish();
    },
    reset(): void {
      assertUsable(disposed);
      if (mode === "director") {
        options.resetDirector();
        activeLook = REFERENCE_DEFAULT_AUTHORED_LOOK_ID;
      } else {
        options.setSimulationPaused(false);
        options.resetSandbox();
        paused = false;
      }
      publish();
    },
    selectSandboxLook(nextLook: AuthoredLookId): void {
      assertUsable(disposed);
      assertAuthoredLook(nextLook);
      if (mode !== "sandbox") {
        throw new Error(
          "Authored looks can only be selected manually in Sandbox mode.",
        );
      }
      if (nextLook === activeLook) {
        return;
      }
      options.selectSandboxLook(nextLook);
      activeLook = nextLook;
      publish();
    },
    reportDirectorLook(nextLook: AuthoredLookId): void {
      assertUsable(disposed);
      assertAuthoredLook(nextLook);
      if (mode !== "director") {
        throw new Error(
          "Director look reports are only accepted in Director mode.",
        );
      }
      if (nextLook === activeLook) {
        return;
      }
      activeLook = nextLook;
      publish();
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      subscribers.clear();
      let failure: unknown;
      try {
        options.setSandboxInputEnabled(false);
      } catch (cause) {
        failure = cause;
      }
      try {
        options.setSimulationPaused(false);
      } catch (cause) {
        failure ??= cause;
      }
      if (failure !== undefined) {
        throw failure;
      }
    },
  };

  return Object.freeze(controller);
}

export function createReferenceExperienceModePresenter(
  mount: Element,
  controller: ReferenceExperienceModeController,
): ReferenceExperienceModePresenter {
  const instanceId = `reference-experience-mode-${String(++presenterSequence)}`;
  const root = document.createElement("aside");
  root.className = "reference-experience-mode-presenter";
  root.dataset.testid = "reference-experience-mode-presenter";
  root.setAttribute("aria-labelledby", `${instanceId}-heading`);

  const heading = document.createElement("h2");
  heading.id = `${instanceId}-heading`;
  heading.dataset.testid = "reference-experience-mode-heading";
  heading.textContent = "Experience mode";

  const modeGroup = document.createElement("div");
  modeGroup.className = "reference-experience-mode-options";
  modeGroup.setAttribute("aria-label", "Experience mode");
  modeGroup.setAttribute("role", "group");

  const directorButton = createButton("Director");
  directorButton.dataset.testid = "reference-experience-mode-director";
  const sandboxButton = createButton("Sandbox");
  sandboxButton.dataset.testid = "reference-experience-mode-sandbox";
  modeGroup.append(directorButton, sandboxButton);

  const status = document.createElement("p");
  status.dataset.testid = "reference-experience-mode-status";
  status.setAttribute("aria-atomic", "true");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("role", "status");

  const lookStatus = document.createElement("p");
  const lookStatusLabel = document.createElement("span");
  lookStatusLabel.id = `${instanceId}-active-look-label`;
  lookStatusLabel.textContent = "Current look: ";
  const activeLookOutput = document.createElement("output");
  activeLookOutput.dataset.testid = "reference-experience-active-look";
  activeLookOutput.setAttribute("aria-labelledby", lookStatusLabel.id);
  lookStatus.append(lookStatusLabel, activeLookOutput);

  const directorControls = document.createElement("section");
  directorControls.dataset.testid = "reference-experience-director-controls";
  directorControls.setAttribute("aria-label", "Director controls");
  const directorDescription = document.createElement("p");
  directorDescription.textContent =
    "Director follows the repeatable authored Showcase route.";
  const restartDirectorButton = createButton("Restart route");
  restartDirectorButton.dataset.testid =
    "reference-experience-director-restart";
  directorControls.append(directorDescription, restartDirectorButton);

  const sandboxControls = document.createElement("section");
  sandboxControls.dataset.testid = "reference-experience-sandbox-controls";
  sandboxControls.setAttribute("aria-label", "Sandbox controls");

  const lookSelectId = `${instanceId}-sandbox-look`;
  const lookLabel = document.createElement("label");
  lookLabel.setAttribute("for", lookSelectId);
  lookLabel.textContent = "Authored look";
  const lookSelect = document.createElement("select");
  lookSelect.id = lookSelectId;
  lookSelect.dataset.testid = "reference-experience-sandbox-look";
  for (const look of REFERENCE_AUTHORED_LOOKS) {
    const option = document.createElement("option");
    option.value = look.id;
    option.textContent = look.label;
    lookSelect.append(option);
  }

  const pauseButton = createButton("Pause");
  pauseButton.dataset.testid = "reference-experience-sandbox-pause";
  const resetSandboxButton = createButton("Reset");
  resetSandboxButton.dataset.testid = "reference-experience-sandbox-reset";

  const sandboxInstructions = document.createElement("p");
  sandboxInstructions.dataset.testid =
    "reference-experience-sandbox-instructions";
  sandboxInstructions.textContent =
    "Drag with the mouse to orbit the camera and use the mouse wheel to zoom. Drive the vessel with WASD or the arrow keys.";
  sandboxControls.append(
    lookLabel,
    lookSelect,
    pauseButton,
    resetSandboxButton,
    sandboxInstructions,
  );

  root.append(
    heading,
    modeGroup,
    status,
    lookStatus,
    directorControls,
    sandboxControls,
  );
  mount.append(root);

  const removeListeners: Array<() => void> = [];
  let disposed = false;

  const listen = (
    target: EventTarget,
    type: string,
    listener: EventListener,
  ): void => {
    target.addEventListener(type, listener);
    removeListeners.push(() => target.removeEventListener(type, listener));
  };

  listen(directorButton, "click", () => {
    if (!disposed) {
      controller.setMode("director");
    }
  });
  listen(sandboxButton, "click", () => {
    if (!disposed) {
      controller.setMode("sandbox");
    }
  });

  const onModeKeydown = (event: Event): void => {
    if (disposed) {
      return;
    }
    const key = (event as KeyboardEvent).key;
    let nextMode: ReferenceExperienceMode | undefined;
    if (key === "ArrowLeft" || key === "ArrowUp" || key === "Home") {
      nextMode = "director";
    } else if (key === "ArrowRight" || key === "ArrowDown" || key === "End") {
      nextMode = "sandbox";
    }
    if (nextMode === undefined) {
      return;
    }
    event.preventDefault();
    controller.setMode(nextMode);
    (nextMode === "director" ? directorButton : sandboxButton).focus();
  };
  listen(directorButton, "keydown", onModeKeydown);
  listen(sandboxButton, "keydown", onModeKeydown);
  listen(restartDirectorButton, "click", () => {
    if (!disposed) {
      controller.reset();
    }
  });
  listen(lookSelect, "change", () => {
    if (!disposed) {
      controller.selectSandboxLook(readAuthoredLook(lookSelect.value));
    }
  });
  listen(pauseButton, "click", () => {
    if (!disposed) {
      controller.setPaused(!controller.snapshot().paused);
    }
  });
  listen(resetSandboxButton, "click", () => {
    if (!disposed) {
      controller.reset();
    }
  });

  const render = (snapshot: ReferenceExperienceModeSnapshot): void => {
    if (disposed) {
      return;
    }
    const directorActive = snapshot.mode === "director";
    root.dataset.mode = snapshot.mode;
    root.dataset.paused = String(snapshot.paused);
    root.dataset.revision = String(snapshot.revision);
    root.dataset.activeLook = snapshot.activeLook;
    directorButton.setAttribute("aria-pressed", String(directorActive));
    sandboxButton.setAttribute("aria-pressed", String(!directorActive));
    directorControls.hidden = !directorActive;
    sandboxControls.hidden = directorActive;
    restartDirectorButton.disabled = !directorActive;
    lookSelect.disabled = directorActive;
    pauseButton.disabled = directorActive;
    resetSandboxButton.disabled = directorActive;
    pauseButton.textContent = snapshot.paused ? "Resume" : "Pause";
    status.textContent = directorActive
      ? "Director mode active."
      : `Sandbox mode active. Simulation ${snapshot.paused ? "paused" : "running"}.`;
    const lookLabelText = labelForLook(snapshot.activeLook);
    activeLookOutput.value = lookLabelText;
    activeLookOutput.textContent = lookLabelText;
    lookSelect.value = snapshot.activeLook;
  };

  const unsubscribe = controller.subscribe(render);

  return Object.freeze({
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribe();
      for (const removeListener of removeListeners) {
        removeListener();
      }
      removeListeners.length = 0;
      directorButton.disabled = true;
      sandboxButton.disabled = true;
      restartDirectorButton.disabled = true;
      lookSelect.disabled = true;
      pauseButton.disabled = true;
      resetSandboxButton.disabled = true;
      root.remove();
    },
  });
}

function freezeSnapshot(
  revision: number,
  mode: ReferenceExperienceMode,
  paused: boolean,
  activeLook: AuthoredLookId,
): ReferenceExperienceModeSnapshot {
  return Object.freeze({ revision, mode, paused, activeLook });
}

function assertUsable(disposed: boolean): void {
  if (disposed) {
    throw new Error("The Reference Experience mode controller is disposed.");
  }
}

function assertMode(mode: unknown): asserts mode is ReferenceExperienceMode {
  if (mode !== "director" && mode !== "sandbox") {
    throw new TypeError(`Unknown Reference Experience mode: ${String(mode)}.`);
  }
}

function assertAuthoredLook(look: unknown): asserts look is AuthoredLookId {
  if (typeof look !== "string" || !isReferenceAuthoredLookId(look)) {
    throw new TypeError(`Unknown authored look: ${String(look)}.`);
  }
}

function readAuthoredLook(look: string): AuthoredLookId {
  assertAuthoredLook(look);
  return look;
}

function labelForLook(look: AuthoredLookId): string {
  const authoredLook = REFERENCE_AUTHORED_LOOKS.find(({ id }) => id === look);
  if (authoredLook === undefined) {
    throw new Error(`Missing label for authored look: ${look}.`);
  }
  return authoredLook.label;
}

function createButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  return button;
}
