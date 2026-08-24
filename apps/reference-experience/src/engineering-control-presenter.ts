// Tweakpane 4.0.5's published declarations import @tweakpane/core even though
// its package manifest omits that dependency, so the Reference app pins both.
import { Pane, type FolderApi } from "tweakpane";
import type {
  ReferenceControlModel,
  ReferenceControlSnapshot,
  ReferenceEffectControlDescriptor,
  ReferenceMonitorDescriptor,
  ReferenceNumericControlDescriptor,
} from "./reference-control-model.js";

export interface EngineeringControlPresenter {
  dispose(): void;
}

type DiagnosticsOptions = Parameters<
  ReferenceControlModel["setHeavyDiagnostics"]
>[0];
type DiagnosticsOutput = DiagnosticsOptions["outputs"][number];

/**
 * Creates the lazy-loaded Tweakpane surface for prepared Engineering controls.
 * The outer controller owns loading this module; the presenter owns no frame loop.
 */
export function createEngineeringControlPresenter(
  container: HTMLElement,
  model: ReferenceControlModel,
  requestArtistMode: () => void,
): EngineeringControlPresenter {
  const pane = new Pane({
    container,
    title: "Engineering",
  });
  const numericState: Record<string, unknown> = {};
  const structuralState: Record<string, unknown> = {};
  const effectState: Record<string, unknown> = {};
  const monitorState: Record<string, unknown> = {};
  const qualityState: Record<string, unknown> = { preparation: "" };
  const diagnosticsState: Record<string, unknown> = { enabled: false };
  const controlFolders = new Map<string, FolderApi>();
  const monitorFolders = new Map<string, FolderApi>();
  const diagnosticsOutputs = collectDiagnosticsOutputs(
    model.descriptors.effects,
  );

  pane.addButton({ title: "Return to Artist" }).on("click", requestArtistMode);

  const folderForControl = (group: string, advanced: boolean): FolderApi => {
    const existing = controlFolders.get(group);
    if (existing !== undefined) {
      return existing;
    }
    const folder = pane.addFolder({
      title: titleFromGroup(group),
      expanded: !advanced,
    });
    controlFolders.set(group, folder);
    return folder;
  };

  for (const descriptor of model.descriptors.numeric) {
    numericState[descriptor.id] = readNumeric(model.snapshot(), descriptor);
    folderForControl(descriptor.group, descriptor.advanced)
      .addBinding(numericState, descriptor.id, {
        label: descriptor.label,
        min: descriptor.min,
        max: descriptor.max,
        step: descriptor.step,
        readonly: descriptor.readOnly,
      })
      .on("change", (event) => {
        if (
          !descriptor.readOnly &&
          typeof event.value === "number" &&
          Number.isFinite(event.value)
        ) {
          try {
            model.setNumeric(descriptor.id, event.value);
          } catch {
            numericState[descriptor.id] = readNumeric(
              model.snapshot(),
              descriptor,
            );
            pane.refresh();
          }
        }
      });
  }

  const structuralFolder = pane.addFolder({
    title: "Structural quality · reload required",
    expanded: false,
  });
  for (const descriptor of model.descriptors.structural) {
    structuralState[descriptor.id] = model.snapshot().qualityProfile.draftId;
    structuralFolder
      .addBinding(structuralState, descriptor.id, {
        label: descriptor.label,
        options: Object.fromEntries(
          descriptor.options.map((option) => [option, option]),
        ),
      })
      .on("change", (event) => {
        const accepted = descriptor.options.find(
          (option) => option === event.value,
        );
        if (accepted !== undefined) {
          model.setQualityProfileDraft(accepted);
        }
      });
  }
  structuralFolder.addBinding(qualityState, "preparation", {
    label: "Preparation",
    readonly: true,
  });

  for (const descriptor of model.descriptors.actions) {
    const folder =
      descriptor.id === "qualityProfile.apply"
        ? structuralFolder
        : folderForControl(descriptor.group, descriptor.advanced);
    folder.addButton({ title: descriptor.label }).on("click", () => {
      if (descriptor.id === "qualityProfile.apply") {
        const quality = model.snapshot().qualityProfile;
        if (!quality.reloadRequired || quality.applying) {
          return;
        }
      }
      void Promise.resolve(model.invoke(descriptor.id)).catch(() => undefined);
    });
  }

  const effectsFolder = pane.addFolder({
    title: "Prepared effects",
    expanded: true,
  });
  for (const effect of model.descriptors.effects) {
    effectState[effect.effectId] = summarizeEffect(effect);
    effectsFolder.addBinding(effectState, effect.effectId, {
      label: effect.label,
      readonly: true,
    });
  }

  for (const descriptor of model.descriptors.monitors) {
    const existing = monitorFolders.get(descriptor.group);
    const folder =
      existing ??
      pane.addFolder({
        title: `Monitor · ${titleFromGroup(descriptor.group)}`,
        expanded: !descriptor.heavy,
      });
    monitorFolders.set(descriptor.group, folder);
    monitorState[descriptor.id] = formatMonitorValue(
      descriptor,
      descriptor.read(model.snapshot()),
    );
    folder.addBinding(monitorState, descriptor.id, {
      label: descriptor.label,
      readonly: true,
    });
  }

  const diagnosticsFolder = pane.addFolder({
    title: "Heavy diagnostics · explicit opt-in",
    expanded: false,
  });
  diagnosticsFolder
    .addBinding(diagnosticsState, "enabled", {
      label: "Enable readbacks",
    })
    .on("change", (event) => {
      if (typeof event.value !== "boolean") {
        return;
      }
      model.setHeavyDiagnostics({
        enabled: event.value,
        outputs: selectedDiagnosticsOutputs(
          diagnosticsOutputs,
          diagnosticsState,
        ),
      });
    });
  for (const output of diagnosticsOutputs) {
    diagnosticsState[output] = false;
    diagnosticsFolder
      .addBinding(diagnosticsState, output, {
        label: output,
      })
      .on("change", (event) => {
        if (typeof event.value !== "boolean") {
          return;
        }
        model.setHeavyDiagnostics({
          enabled: diagnosticsState.enabled === true,
          outputs: selectedDiagnosticsOutputs(
            diagnosticsOutputs,
            diagnosticsState,
          ),
        });
      });
  }

  const updateFromSnapshot = (snapshot: ReferenceControlSnapshot): void => {
    for (const descriptor of model.descriptors.numeric) {
      numericState[descriptor.id] = readNumeric(snapshot, descriptor);
    }
    for (const descriptor of model.descriptors.structural) {
      structuralState[descriptor.id] = snapshot.qualityProfile.draftId;
    }
    for (const effect of snapshot.effects) {
      effectState[effect.effectId] = summarizeEffect(effect);
    }
    for (const descriptor of model.descriptors.monitors) {
      monitorState[descriptor.id] = formatMonitorValue(
        descriptor,
        descriptor.read(snapshot),
      );
    }
    qualityState.preparation = qualityPreparationSummary(snapshot);
    diagnosticsState.enabled = snapshot.diagnostics.enabled;
    const selected = new Set(snapshot.diagnostics.outputs);
    for (const output of diagnosticsOutputs) {
      diagnosticsState[output] = selected.has(output);
    }
    pane.refresh();
  };

  let monitoringEnabled = false;
  let unsubscribe: (() => void) | undefined;
  let disposed = false;
  try {
    model.setEngineeringMonitoring(true);
    monitoringEnabled = true;
    unsubscribe = model.subscribe(updateFromSnapshot);
  } catch (cause) {
    if (monitoringEnabled && model.snapshot().state !== "disposed") {
      model.setEngineeringMonitoring(false);
    }
    pane.dispose();
    throw cause;
  }

  return Object.freeze({
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribe?.();
      if (model.snapshot().state !== "disposed") {
        model.setHeavyDiagnostics({
          enabled: false,
          outputs: selectedDiagnosticsOutputs(
            diagnosticsOutputs,
            diagnosticsState,
          ),
        });
        model.setEngineeringMonitoring(false);
      }
      pane.dispose();
    },
  });
}

function collectDiagnosticsOutputs(
  effects: readonly ReferenceEffectControlDescriptor[],
): readonly DiagnosticsOutput[] {
  const outputs = new Set<DiagnosticsOutput>();
  for (const effect of effects) {
    for (const output of effect.diagnosticOutputs) {
      outputs.add(output);
    }
  }
  return Object.freeze([...outputs]);
}

function selectedDiagnosticsOutputs(
  outputs: readonly DiagnosticsOutput[],
  state: Readonly<Record<string, unknown>>,
): readonly DiagnosticsOutput[] {
  return Object.freeze(outputs.filter((output) => state[output] === true));
}

function readNumeric(
  snapshot: ReferenceControlSnapshot,
  descriptor: ReferenceNumericControlDescriptor,
): number {
  return descriptor.read(snapshot);
}

function formatMonitorValue(
  descriptor: ReferenceMonitorDescriptor,
  value: unknown,
): string {
  switch (descriptor.value) {
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : "Unavailable";
    case "boolean":
      return typeof value === "boolean" ? String(value) : "Unavailable";
    case "text":
      return typeof value === "string" ? value : "Unavailable";
  }
}

function summarizeEffect(effect: ReferenceEffectControlDescriptor): string {
  const controlSummary = `${String(effect.controlIds.length)} controls`;
  const routing = effect.automatic ? "automatic" : "manual";
  return `${effect.variantId} · ${routing} · ${controlSummary}`;
}

function qualityPreparationSummary(snapshot: ReferenceControlSnapshot): string {
  const quality = snapshot.qualityProfile;
  if (quality.applying) {
    return `Applying ${quality.draftId} through preparation; reload in progress.`;
  }
  if (quality.reloadRequired) {
    return `Reload required: apply ${quality.draftId} through preparation.`;
  }
  if (quality.activeId === null) {
    return `Draft ${quality.draftId} requires preparation before activation.`;
  }
  return `Prepared ${quality.activeId} is active; no reload required.`;
}

function titleFromGroup(group: string): string {
  return group
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
