import {
  createArtistControlPresenter,
  type ArtistControlPresenter,
} from "./artist-control-presenter.js";
import type { ReferenceControlModel } from "./reference-control-model.js";

interface EngineeringControlPresenterModule {
  createEngineeringControlPresenter(
    container: HTMLElement,
    model: ReferenceControlModel,
    requestArtistMode: () => void,
  ): { dispose(): void };
}

export interface ReferenceControlPresenters {
  dispose(): void;
}

export interface ReferenceControlPresenterOptions {
  readonly createArtistPresenter?: typeof createArtistControlPresenter;
  readonly loadEngineeringPresenter?: () => Promise<EngineeringControlPresenterModule>;
}

/**
 * Owns the explicit Artist/Engineering presenter mode without persisting UI
 * library state. The Engineering module is fetched only after its Artist-mode
 * button is used, and one fulfilled import is reused for this ready stage.
 */
export function createReferenceControlPresenters(
  mount: Element,
  model: ReferenceControlModel,
  options: ReferenceControlPresenterOptions = {},
): ReferenceControlPresenters {
  const createArtist =
    options.createArtistPresenter ?? createArtistControlPresenter;
  const loadEngineering =
    options.loadEngineeringPresenter ??
    (() => import("./engineering-control-presenter.js"));
  const root = document.createElement("div");
  root.className = "reference-control-presenters";
  root.dataset.mode = "artist";
  root.dataset.testid = "reference-control-presenters";

  const surface = document.createElement("div");
  surface.className = "reference-control-surface";

  const status = document.createElement("p");
  status.className = "reference-control-mode-status";
  status.dataset.testid = "reference-control-mode-status";
  status.setAttribute("aria-atomic", "true");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("role", "status");
  root.append(surface, status);
  mount.append(root);

  let disposed = false;
  let loadingEngineering = false;
  let engineeringModule: Promise<EngineeringControlPresenterModule> | undefined;
  let activePresenter: ArtistControlPresenter | { dispose(): void };

  const showArtist = (): void => {
    if (disposed) {
      return;
    }
    activePresenter?.dispose();
    surface.replaceChildren();
    status.textContent = "";
    root.dataset.mode = "artist";
    activePresenter = createArtist(surface, model, () => {
      void showEngineering();
    });
  };

  const showEngineering = async (): Promise<void> => {
    if (disposed || loadingEngineering || root.dataset.mode === "engineering") {
      return;
    }
    loadingEngineering = true;
    root.dataset.mode = "artist-loading-engineering";
    status.textContent = "Loading Engineering controls.";
    engineeringModule ??= loadEngineering();
    try {
      const module = await engineeringModule;
      if (disposed || !loadingEngineering) {
        return;
      }
      const engineeringMount = document.createElement("section");
      engineeringMount.className = "engineering-control-presenter";
      engineeringMount.dataset.testid = "engineering-control-presenter";
      engineeringMount.setAttribute("aria-label", "Engineering controls");
      const presenter = module.createEngineeringControlPresenter(
        engineeringMount,
        model,
        showArtist,
      );
      activePresenter.dispose();
      activePresenter = presenter;
      surface.replaceChildren(engineeringMount);
      root.dataset.mode = "engineering";
      status.textContent = "Engineering controls loaded.";
    } catch {
      if (!disposed) {
        engineeringModule = undefined;
        root.dataset.mode = "artist";
        status.textContent =
          "Engineering controls could not be loaded. Artist controls remain available.";
      }
    } finally {
      loadingEngineering = false;
    }
  };

  activePresenter = createArtist(surface, model, () => {
    void showEngineering();
  });

  return Object.freeze({
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      loadingEngineering = false;
      activePresenter.dispose();
      root.remove();
    },
  });
}
