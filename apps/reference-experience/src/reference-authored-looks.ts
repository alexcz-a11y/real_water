import {
  createBlueNoonEnvironmentPreset,
  createCalmSunriseEnvironmentPreset,
  createStormFrontEnvironmentPreset,
  createWaterPreset,
  type EnvironmentPreset,
  type WaterPreset,
  type WaterPresetId,
} from "real-water";

interface ReferenceAuthoredLookDefinition {
  readonly id: string;
  readonly label: string;
  readonly waterPresetId: WaterPresetId;
  readonly createEnvironmentPreset: () => EnvironmentPreset;
}

const REFERENCE_AUTHORED_LOOK_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "calm-sunrise",
    label: "Calm Sunrise",
    waterPresetId: "calm",
    createEnvironmentPreset: createCalmSunriseEnvironmentPreset,
  }),
  Object.freeze({
    id: "blue-noon-swell",
    label: "Blue Noon Swell",
    waterPresetId: "swell",
    createEnvironmentPreset: createBlueNoonEnvironmentPreset,
  }),
  Object.freeze({
    id: "storm-front",
    label: "Storm Front",
    waterPresetId: "storm",
    createEnvironmentPreset: createStormFrontEnvironmentPreset,
  }),
] as const satisfies readonly ReferenceAuthoredLookDefinition[]);

export type AuthoredLookId =
  (typeof REFERENCE_AUTHORED_LOOK_DEFINITIONS)[number]["id"];

export const REFERENCE_DEFAULT_AUTHORED_LOOK_ID =
  "calm-sunrise" as const satisfies AuthoredLookId;
export const REFERENCE_STORM_AUTHORED_LOOK_ID =
  "storm-front" as const satisfies AuthoredLookId;

export interface ReferenceAuthoredLook {
  readonly id: AuthoredLookId;
  readonly label: string;
}

export interface ResolvedReferenceAuthoredLook extends ReferenceAuthoredLook {
  readonly waterPreset: WaterPreset;
  readonly environmentPreset: EnvironmentPreset;
}

export const REFERENCE_AUTHORED_LOOKS: readonly ReferenceAuthoredLook[] =
  Object.freeze(
    REFERENCE_AUTHORED_LOOK_DEFINITIONS.map(({ id, label }) =>
      Object.freeze({ id, label }),
    ),
  );

export function isReferenceAuthoredLookId(
  value: string,
): value is AuthoredLookId {
  return REFERENCE_AUTHORED_LOOK_DEFINITIONS.some(({ id }) => id === value);
}

export function resolveReferenceAuthoredLook(
  id: AuthoredLookId,
): ResolvedReferenceAuthoredLook {
  const definition = REFERENCE_AUTHORED_LOOK_DEFINITIONS.find(
    (candidate) => candidate.id === id,
  );
  if (definition === undefined) {
    throw new RangeError(`Unknown authored look: ${String(id)}`);
  }
  return Object.freeze({
    id: definition.id,
    label: definition.label,
    waterPreset: createWaterPreset(definition.waterPresetId),
    environmentPreset: definition.createEnvironmentPreset(),
  });
}
