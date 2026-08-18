import type { LoadingPresenterAdapter, StartupSnapshot } from "real-water";

export interface LoadingActions {
  readonly cancel: () => void;
  readonly retry: () => void;
}

export class DomLoadingPresenter implements LoadingPresenterAdapter {
  readonly #alert: HTMLParagraphElement;
  readonly #cancelButton: HTMLButtonElement;
  readonly #copyButton: HTMLButtonElement;
  readonly #diagnostics: HTMLPreElement;
  readonly #indicator: HTMLSpanElement;
  readonly #progress: HTMLProgressElement;
  readonly #retryButton: HTMLButtonElement;
  readonly #root: HTMLElement;
  readonly #status: HTMLParagraphElement;
  #disposed = false;

  public constructor(mount: Element, actions: LoadingActions) {
    this.#root = document.createElement("main");
    this.#root.className = "loading-experience";
    this.#root.dataset.testid = "loading-experience";
    this.#root.setAttribute("aria-labelledby", "loading-title");

    const eyebrow = document.createElement("p");
    eyebrow.className = "loading-eyebrow";
    eyebrow.textContent = "Real Water";

    const heading = document.createElement("h1");
    heading.id = "loading-title";
    heading.textContent = "Preparing the Open Water Domain";

    const intro = document.createElement("p");
    intro.className = "loading-intro";
    intro.textContent =
      "The Reference Experience remains concealed until every declared startup item is ready.";

    this.#indicator = document.createElement("span");
    this.#indicator.className = "loading-indicator";
    this.#indicator.setAttribute("aria-hidden", "true");

    this.#status = document.createElement("p");
    this.#status.className = "loading-status";
    this.#status.dataset.testid = "loading-status";
    this.#status.setAttribute("role", "status");
    this.#status.setAttribute("aria-atomic", "true");
    this.#status.setAttribute("aria-live", "polite");

    const progressLabel = document.createElement("p");
    progressLabel.id = "loading-progress-label";
    progressLabel.className = "loading-progress-label";
    progressLabel.textContent = "Preparation progress";

    this.#progress = document.createElement("progress");
    this.#progress.className = "loading-progress";
    this.#progress.dataset.testid = "loading-progress";
    this.#progress.setAttribute("aria-labelledby", "loading-progress-label");
    this.#progress.max = 1;
    this.#progress.value = 0;

    this.#alert = document.createElement("p");
    this.#alert.className = "loading-alert";
    this.#alert.dataset.testid = "loading-alert";
    this.#alert.setAttribute("role", "alert");
    this.#alert.hidden = true;

    this.#diagnostics = document.createElement("pre");
    this.#diagnostics.className = "loading-diagnostics";
    this.#diagnostics.dataset.testid = "loading-diagnostics";
    this.#diagnostics.tabIndex = 0;
    this.#diagnostics.hidden = true;

    const actionsElement = document.createElement("div");
    actionsElement.className = "loading-actions";

    this.#cancelButton = document.createElement("button");
    this.#cancelButton.type = "button";
    this.#cancelButton.dataset.testid = "cancel-preparation";
    this.#cancelButton.textContent = "Cancel preparation";
    this.#cancelButton.addEventListener("click", actions.cancel);

    this.#retryButton = document.createElement("button");
    this.#retryButton.type = "button";
    this.#retryButton.dataset.testid = "retry-preparation";
    this.#retryButton.textContent = "Retry from the beginning";
    this.#retryButton.hidden = true;
    this.#retryButton.addEventListener("click", actions.retry);

    this.#copyButton = document.createElement("button");
    this.#copyButton.type = "button";
    this.#copyButton.dataset.testid = "copy-diagnostics";
    this.#copyButton.textContent = "Copy diagnostics";
    this.#copyButton.hidden = true;
    this.#copyButton.addEventListener("click", () => {
      void this.#copyDiagnostics();
    });

    actionsElement.append(
      this.#cancelButton,
      this.#retryButton,
      this.#copyButton,
    );

    const panel = document.createElement("div");
    panel.className = "loading-panel";
    panel.append(
      eyebrow,
      heading,
      intro,
      this.#indicator,
      this.#status,
      progressLabel,
      this.#progress,
      this.#alert,
      this.#diagnostics,
      actionsElement,
    );
    this.#root.append(panel);
    mount.replaceChildren(this.#root);
  }

  public present(
    snapshot: StartupSnapshot,
    signal: AbortSignal,
  ): void | Promise<void> {
    if (this.#disposed) {
      return;
    }
    if (signal.aborted) {
      return Promise.reject(new Error("Loading presentation cancelled."));
    }

    this.#root.dataset.state = snapshot.status;
    this.#alert.hidden = true;
    this.#diagnostics.hidden = true;
    this.#copyButton.hidden = true;
    this.#retryButton.hidden = true;

    switch (snapshot.status) {
      case "loading":
        this.#indicator.hidden = false;
        this.#progress.hidden = true;
        this.#cancelButton.disabled = false;
        this.#status.textContent =
          "Loading Experience visible. Preparation has not started.";
        return this.#waitForFirstVisibleFrame(signal);

      case "preparing":
        this.#indicator.hidden = false;
        this.#progress.hidden = false;
        this.#cancelButton.disabled = false;
        this.#renderProgress(snapshot.progress);
        this.#status.textContent =
          "Completed " +
          String(snapshot.progress.completedWork) +
          " of " +
          String(snapshot.progress.totalWork) +
          " declared startup items.";
        return;

      case "ready":
        this.#indicator.hidden = false;
        this.#progress.hidden = false;
        this.#cancelButton.disabled = true;
        this.#renderProgress(snapshot.progress);
        this.#status.textContent =
          "Readiness Gate complete. Revealing on the next refresh.";
        return;

      case "unsupported":
      case "failed":
      case "cancelled":
        this.#indicator.hidden = true;
        this.#cancelButton.disabled = true;
        this.#retryButton.hidden = false;
        this.#copyButton.hidden = false;
        this.#alert.hidden = false;
        this.#diagnostics.hidden = false;
        this.#alert.textContent =
          snapshot.status === "cancelled"
            ? "Preparation cancelled. The Reference Experience remains hidden."
            : snapshot.status === "unsupported"
              ? "This environment is unsupported. The Reference Experience remains hidden."
              : "Preparation failed. The Reference Experience remains hidden.";
        this.#status.textContent = "";
        this.#diagnostics.textContent = snapshot.error.diagnosticText;
        if (snapshot.progress !== null) {
          this.#progress.hidden = false;
          this.#renderProgress(snapshot.progress);
        }
    }
  }

  public dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#root.remove();
  }

  async #copyDiagnostics(): Promise<void> {
    const text = this.#diagnostics.textContent ?? "";

    try {
      await navigator.clipboard.writeText(text);
      this.#status.textContent = "Diagnostics copied.";
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(this.#diagnostics);
      selection?.removeAllRanges();
      selection?.addRange(range);
      this.#status.textContent =
        "Diagnostics selected. Use your browser copy command.";
    }
  }

  #renderProgress(
    progress: Readonly<{
      completedWork: number;
      totalWork: number;
    }>,
  ): void {
    this.#progress.max = progress.totalWork;
    this.#progress.value = progress.completedWork;
    this.#progress.setAttribute(
      "aria-valuetext",
      String(progress.completedWork) +
        " of " +
        String(progress.totalWork) +
        " startup items complete",
    );
  }

  #waitForFirstVisibleFrame(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      let secondFrame: number | undefined;
      const firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        });
      });
      const abort = (): void => {
        cancelAnimationFrame(firstFrame);
        if (secondFrame !== undefined) {
          cancelAnimationFrame(secondFrame);
        }
        reject(new Error("Loading presentation cancelled."));
      };
      signal.addEventListener("abort", abort, { once: true });
    });
  }
}
