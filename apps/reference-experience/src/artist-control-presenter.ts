import type {
  ReferenceActionDescriptor,
  ReferenceControlModel,
  ReferenceControlSnapshot,
  ReferenceNumericControlDescriptor,
  ReferenceNumericControlId,
} from "./reference-control-model.js";

export interface ArtistControlPresenter {
  dispose(): void;
}

interface NumericBinding {
  readonly descriptor: ReferenceNumericControlDescriptor;
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement;
}

interface ArtistControlGroup {
  readonly id: string;
  readonly numeric: ReferenceNumericControlDescriptor[];
  readonly actions: ReferenceActionDescriptor[];
}

let presenterSequence = 0;

export function createArtistControlPresenter(
  mount: Element,
  model: ReferenceControlModel,
  requestEngineeringMode: () => void,
): ArtistControlPresenter {
  const instanceId = `artist-controls-${String(++presenterSequence)}`;
  const root = document.createElement("aside");
  root.className = "artist-control-presenter";
  root.dataset.mode = "artist";
  root.dataset.testid = "artist-control-presenter";
  root.setAttribute("aria-labelledby", `${instanceId}-title`);

  const heading = document.createElement("h2");
  heading.id = `${instanceId}-title`;
  heading.textContent = "Artist controls";

  const introduction = document.createElement("p");
  introduction.textContent =
    "Shape the prepared water and effects with perceptual controls.";

  root.append(heading, introduction);

  const numericBindings = new Map<ReferenceNumericControlId, NumericBinding>();
  const actionButtons: HTMLButtonElement[] = [];
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

  for (const group of collectArtistGroups(model)) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "artist-control-group";
    fieldset.dataset.testid = `artist-group-${toTestId(group.id)}`;

    const legend = document.createElement("legend");
    legend.textContent = groupLabel(group.id);
    fieldset.append(legend);

    for (const descriptor of group.numeric) {
      const controlId = `${instanceId}-${toTestId(descriptor.id)}`;
      const descriptionId = `${controlId}-description`;
      const wrapper = document.createElement("div");
      wrapper.className = "artist-numeric-control";
      wrapper.dataset.testid = `artist-control-${toTestId(descriptor.id)}`;

      const label = document.createElement("label");
      label.setAttribute("for", controlId);
      label.textContent = descriptor.label;

      const description = document.createElement("p");
      description.id = descriptionId;
      description.className = "artist-control-description";
      description.textContent = descriptor.description;

      const valueRow = document.createElement("div");
      valueRow.className = "artist-control-value";

      const input = document.createElement("input");
      input.id = controlId;
      input.type = "range";
      input.min = String(descriptor.min);
      input.max = String(descriptor.max);
      input.step = String(descriptor.step);
      input.dataset.testid = `artist-input-${toTestId(descriptor.id)}`;
      input.setAttribute("aria-describedby", descriptionId);

      const output = document.createElement("output");
      output.setAttribute("for", controlId);
      output.dataset.testid = `artist-output-${toTestId(descriptor.id)}`;

      const onInput = (): void => {
        if (disposed) {
          return;
        }
        const value = input.valueAsNumber;
        if (Number.isFinite(value)) {
          try {
            model.setNumeric(descriptor.id, value);
          } catch (cause) {
            reloadStatus.textContent = `Control update rejected: ${errorMessage(cause)}`;
            const accepted = readNumericValue(model.snapshot(), descriptor);
            if (accepted !== undefined) {
              renderNumericValue(descriptor, input, output, accepted);
            }
          }
        }
      };
      listen(input, "input", onInput);

      valueRow.append(input, output);
      wrapper.append(label, description, valueRow);
      fieldset.append(wrapper);
      numericBindings.set(descriptor.id, { descriptor, input, output });
    }

    for (const descriptor of group.actions) {
      const descriptionId = `${instanceId}-${toTestId(descriptor.id)}-description`;
      const wrapper = document.createElement("div");
      wrapper.className = "artist-action-control";

      const description = document.createElement("p");
      description.id = descriptionId;
      description.className = "artist-control-description";
      description.textContent = descriptor.description;

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.testid = `artist-action-${toTestId(descriptor.id)}`;
      button.setAttribute("aria-describedby", descriptionId);
      button.textContent = descriptor.label;
      const onAction = (): void => {
        if (!disposed) {
          try {
            void Promise.resolve(model.invoke(descriptor.id)).catch(
              (cause: unknown) => {
                reloadStatus.textContent = `Control action rejected: ${errorMessage(cause)}`;
              },
            );
          } catch (cause) {
            reloadStatus.textContent = `Control action rejected: ${errorMessage(cause)}`;
          }
        }
      };
      listen(button, "click", onAction);

      wrapper.append(description, button);
      fieldset.append(wrapper);
      actionButtons.push(button);
    }

    root.append(fieldset);
  }

  const reloadStatus = document.createElement("p");
  reloadStatus.className = "artist-reload-status";
  reloadStatus.dataset.testid = "artist-reload-status";
  reloadStatus.setAttribute("aria-atomic", "true");
  reloadStatus.setAttribute("aria-live", "polite");
  reloadStatus.setAttribute("role", "status");

  const engineeringButton = document.createElement("button");
  engineeringButton.type = "button";
  engineeringButton.dataset.testid = "open-engineering-controls";
  engineeringButton.textContent = "Open Engineering controls";
  listen(engineeringButton, "click", () => {
    if (!disposed) {
      requestEngineeringMode();
    }
  });

  root.append(reloadStatus, engineeringButton);
  mount.replaceChildren(root);

  const render = (snapshot: ReferenceControlSnapshot): void => {
    if (disposed) {
      return;
    }

    root.dataset.state = snapshot.state;
    const controlsDisabled = snapshot.state === "disposed";
    for (const binding of numericBindings.values()) {
      const value = readNumericValue(snapshot, binding.descriptor);
      if (value !== undefined) {
        renderNumericValue(
          binding.descriptor,
          binding.input,
          binding.output,
          value,
        );
      }
      binding.input.disabled = controlsDisabled;
    }
    for (const button of actionButtons) {
      button.disabled = controlsDisabled;
    }
    engineeringButton.disabled = controlsDisabled;

    const reloadRequired = snapshot.qualityProfile.reloadRequired;
    root.dataset.reloadRequired = String(reloadRequired);
    reloadStatus.textContent = reloadRequired ? "Reload required" : "";
  };

  const unsubscribe = model.subscribe(render);

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
      root.remove();
    },
  });
}

function collectArtistGroups(
  model: ReferenceControlModel,
): ArtistControlGroup[] {
  const groups = new Map<string, ArtistControlGroup>();
  const findGroup = (id: string): ArtistControlGroup => {
    const current = groups.get(id);
    if (current !== undefined) {
      return current;
    }
    const created: ArtistControlGroup = { id, numeric: [], actions: [] };
    groups.set(id, created);
    return created;
  };

  for (const descriptor of model.descriptors.numeric) {
    if (descriptor.audience === "artist" && !descriptor.readOnly) {
      findGroup(descriptor.group).numeric.push(descriptor);
    }
  }
  for (const descriptor of model.descriptors.actions) {
    if (descriptor.audience === "artist") {
      findGroup(descriptor.group).actions.push(descriptor);
    }
  }

  return [...groups.values()];
}

function readNumericValue(
  snapshot: ReferenceControlSnapshot,
  descriptor: ReferenceNumericControlDescriptor,
): number {
  return descriptor.read(snapshot);
}

function renderNumericValue(
  descriptor: ReferenceNumericControlDescriptor,
  input: HTMLInputElement,
  output: HTMLOutputElement,
  value: number,
): void {
  const presentedValue = String(value);
  input.value = presentedValue;
  input.setAttribute(
    "aria-valuetext",
    `${descriptor.label}: ${presentedValue}`,
  );
  output.value = presentedValue;
  output.textContent = presentedValue;
}

function groupLabel(group: string): string {
  const words = group.replace(/[-_.]+/gu, " ");
  return words.length === 0
    ? "Controls"
    : words.charAt(0).toUpperCase() + words.slice(1);
}

function toTestId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
