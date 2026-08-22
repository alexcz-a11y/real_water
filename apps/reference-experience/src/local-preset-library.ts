import {
  createMinimalWaterQualityProfile,
  createReferenceEnvironmentPreset,
  createReferenceShowcasePreset,
  createWaterPreset,
  exportPresetJson,
  importPresetJson,
  type PresetDocument,
  type PresetRecoveryReason,
} from "real-water";

const LOCAL_PRESET_STORAGE_PREFIX = "real-water:preset:";
const LOCAL_PRESET_RECORD_SCHEMA = "real-water/local-preset-record";
const LOCAL_PRESET_RECORD_VERSION = 1;

export const LOCAL_PRESET_BUILT_IN_RECORD_IDS = Object.freeze({
  water: Object.freeze({
    calm: "built-in:water:calm",
    swell: "built-in:water:swell",
    storm: "built-in:water:storm",
  }),
  environment: Object.freeze({
    reference: "built-in:environment:reference",
  }),
  quality: Object.freeze({
    minimal: "built-in:quality:minimal",
    minimalHighDetail: "built-in:quality:minimal-high-detail",
  }),
  showcase: Object.freeze({
    referenceLoop: "built-in:showcase:reference-loop",
  }),
});

export interface LocalPresetStorageAdapter {
  listRecordIds(): readonly string[];
  read(recordId: string): string | null;
  write(recordId: string, value: string): void;
  remove(recordId: string): void;
}

interface LocalPresetRecordMetadata {
  readonly recordId: string;
  readonly displayName: string;
  readonly builtIn: boolean;
}

export interface ReadyLocalPresetRecord extends LocalPresetRecordMetadata {
  readonly status: "ready";
  readonly preset: PresetDocument;
}

export interface RecoveryLocalPresetRecord extends LocalPresetRecordMetadata {
  readonly status: "recovery";
  readonly reason: PresetRecoveryReason | "corrupt-storage";
  readonly rawJson: string;
  readonly detectedSchema?: string;
  readonly detectedVersion?: number;
}

export type LocalPresetRecord =
  ReadyLocalPresetRecord | RecoveryLocalPresetRecord;

export interface SaveLocalPresetInput {
  readonly recordId?: string;
  readonly displayName: string;
  readonly preset: PresetDocument;
}

export interface ImportLocalPresetInput {
  readonly recordId?: string;
  readonly displayName: string;
  readonly rawJson: string;
}

export type LocalPresetImportReceipt =
  | {
      readonly status: "ready";
      readonly record: ReadyLocalPresetRecord;
      readonly sourceVersion: number;
      readonly migrated: boolean;
    }
  | {
      readonly status: "recovery";
      readonly record: RecoveryLocalPresetRecord;
    };

export interface LocalPresetBuiltIn {
  readonly recordId: string;
  readonly displayName: string;
  readonly preset: PresetDocument;
}

export interface LocalPresetLibraryOptions {
  readonly storage?: LocalPresetStorageAdapter;
  readonly createRecordId?: () => string;
  readonly builtIns?: readonly LocalPresetBuiltIn[];
}

export interface LocalPresetLibrary {
  save(input: SaveLocalPresetInput): ReadyLocalPresetRecord;
  importJson(input: ImportLocalPresetInput): LocalPresetImportReceipt;
  exportJson(recordId: string): string;
  copy(recordId: string, displayName?: string): LocalPresetRecord;
  rename(recordId: string, displayName: string): LocalPresetRecord;
  restore(recordId: string): ReadyLocalPresetRecord;
  snapshot(): readonly LocalPresetRecord[];
  get(recordId: string): LocalPresetRecord | undefined;
}

export function createMemoryLocalPresetStorage(): LocalPresetStorageAdapter {
  const values = new Map<string, string>();
  return {
    listRecordIds: () => [...values.keys()],
    read: (recordId) => values.get(recordId) ?? null,
    write(recordId, value) {
      values.set(recordId, value);
    },
    remove(recordId) {
      values.delete(recordId);
    },
  };
}

export function createBrowserLocalPresetStorage(
  storage: Storage = localStorage,
): LocalPresetStorageAdapter {
  return {
    listRecordIds() {
      const recordIds: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(LOCAL_PRESET_STORAGE_PREFIX) === true) {
          recordIds.push(key.slice(LOCAL_PRESET_STORAGE_PREFIX.length));
        }
      }
      return recordIds.sort();
    },
    read: (recordId) =>
      storage.getItem(`${LOCAL_PRESET_STORAGE_PREFIX}${recordId}`),
    write: (recordId, value) => {
      storage.setItem(`${LOCAL_PRESET_STORAGE_PREFIX}${recordId}`, value);
    },
    remove: (recordId) => {
      storage.removeItem(`${LOCAL_PRESET_STORAGE_PREFIX}${recordId}`);
    },
  };
}

export function createLocalPresetLibrary(
  options: LocalPresetLibraryOptions = {},
): LocalPresetLibrary {
  const storage = options.storage ?? createBrowserLocalPresetStorage();
  const createRecordId =
    options.createRecordId ?? (() => globalThis.crypto.randomUUID());
  const builtInDefaults = createBuiltInDefaults(
    options.builtIns ?? createDefaultBuiltIns(),
  );
  const records = new Map<string, LocalPresetRecord>(builtInDefaults);
  const occupiedRecordIds = new Set<string>(records.keys());

  for (const recordId of [...storage.listRecordIds()].sort()) {
    occupiedRecordIds.add(recordId);
    let raw: string | null;
    try {
      raw = storage.read(recordId);
    } catch {
      continue;
    }
    if (raw === null) {
      continue;
    }
    records.set(
      recordId,
      readStoredRecord(recordId, raw, builtInDefaults.has(recordId)),
    );
  }

  function publish(record: LocalPresetRecord): void {
    storage.write(record.recordId, serializeStoredRecord(record));
    occupiedRecordIds.add(record.recordId);
    records.set(record.recordId, record);
  }

  function resolveRecordId(requested: string | undefined): string {
    if (requested !== undefined) {
      return readRecordId(requested);
    }
    return createUniqueRecordId(occupiedRecordIds, createRecordId);
  }

  function requireRecord(recordId: string): LocalPresetRecord {
    const record = records.get(recordId);
    if (record === undefined) {
      throw new RangeError(`Unknown local preset record: ${recordId}`);
    }
    return record;
  }

  return {
    save(input) {
      const recordId = resolveRecordId(input.recordId);
      const record = createReadyRecord(
        recordId,
        input.displayName,
        builtInDefaults.has(recordId),
        input.preset,
      );
      publish(record);
      return record;
    },
    importJson(input) {
      const recordId = resolveRecordId(input.recordId);
      const displayName = readDisplayName(input.displayName);
      const imported = importPresetJson(input.rawJson);
      if (imported.status === "recovery") {
        const record = createRecoveryRecord(
          recordId,
          displayName,
          builtInDefaults.has(recordId),
          imported,
        );
        publish(record);
        return Object.freeze({ status: "recovery" as const, record });
      }

      const record = createReadyRecord(
        recordId,
        displayName,
        builtInDefaults.has(recordId),
        imported.preset,
      );
      publish(record);
      return Object.freeze({
        status: "ready" as const,
        record,
        sourceVersion: imported.sourceVersion,
        migrated: imported.status === "migrated",
      });
    },
    exportJson(recordId) {
      const record = requireRecord(recordId);
      return record.status === "ready"
        ? exportPresetJson(record.preset)
        : record.rawJson;
    },
    copy(recordId, displayName) {
      const source = requireRecord(recordId);
      const copyId = createUniqueRecordId(occupiedRecordIds, createRecordId);
      const copyName = readDisplayName(
        displayName ?? `${source.displayName} copy`,
      );
      const record =
        source.status === "ready"
          ? createReadyRecord(copyId, copyName, false, source.preset)
          : Object.freeze({
              ...source,
              recordId: copyId,
              displayName: copyName,
              builtIn: false,
            });
      publish(record);
      return record;
    },
    rename(recordId, displayName) {
      const source = requireRecord(recordId);
      const record = Object.freeze({
        ...source,
        displayName: readDisplayName(displayName),
      });
      publish(record);
      return record;
    },
    restore(recordId) {
      const builtIn = builtInDefaults.get(recordId);
      if (builtIn === undefined) {
        throw new TypeError(`Preset record is not a built-in: ${recordId}`);
      }
      if (records.get(recordId) === builtIn) {
        return builtIn;
      }
      storage.remove(recordId);
      records.set(recordId, builtIn);
      return builtIn;
    },
    snapshot: () => Object.freeze([...records.values()]),
    get: (recordId) => records.get(recordId),
  };
}

function createDefaultBuiltIns(): readonly LocalPresetBuiltIn[] {
  return [
    {
      recordId: LOCAL_PRESET_BUILT_IN_RECORD_IDS.water.calm,
      displayName: "Calm Water",
      preset: createWaterPreset("calm"),
    },
    {
      recordId: LOCAL_PRESET_BUILT_IN_RECORD_IDS.water.swell,
      displayName: "Swell Water",
      preset: createWaterPreset("swell"),
    },
    {
      recordId: LOCAL_PRESET_BUILT_IN_RECORD_IDS.water.storm,
      displayName: "Storm Water",
      preset: createWaterPreset("storm"),
    },
    {
      recordId: LOCAL_PRESET_BUILT_IN_RECORD_IDS.environment.reference,
      displayName: "Reference Environment",
      preset: createReferenceEnvironmentPreset(),
    },
    {
      recordId: LOCAL_PRESET_BUILT_IN_RECORD_IDS.quality.minimal,
      displayName: "Minimal Quality",
      preset: createMinimalWaterQualityProfile("minimal"),
    },
    {
      recordId: LOCAL_PRESET_BUILT_IN_RECORD_IDS.quality.minimalHighDetail,
      displayName: "Minimal High Detail Quality",
      preset: createMinimalWaterQualityProfile("minimal-high-detail"),
    },
    {
      recordId: LOCAL_PRESET_BUILT_IN_RECORD_IDS.showcase.referenceLoop,
      displayName: "Reference Showcase Loop",
      preset: createReferenceShowcasePreset(),
    },
  ];
}

function createBuiltInDefaults(
  builtIns: readonly LocalPresetBuiltIn[],
): ReadonlyMap<string, ReadyLocalPresetRecord> {
  const records = new Map<string, ReadyLocalPresetRecord>();
  for (const builtIn of builtIns) {
    const recordId = readRecordId(builtIn.recordId);
    if (records.has(recordId)) {
      throw new TypeError(`Duplicate built-in preset id: ${recordId}`);
    }
    records.set(
      recordId,
      createReadyRecord(recordId, builtIn.displayName, true, builtIn.preset),
    );
  }
  return records;
}

function createReadyRecord(
  recordId: string,
  displayName: string,
  builtIn: boolean,
  preset: PresetDocument,
): ReadyLocalPresetRecord {
  const canonicalJson = exportPresetJson(preset);
  const normalized = importPresetJson(canonicalJson);
  if (normalized.status === "recovery") {
    throw new TypeError("The Core preset codec rejected its canonical export.");
  }
  return Object.freeze({
    status: "ready",
    recordId: readRecordId(recordId),
    displayName: readDisplayName(displayName),
    builtIn,
    preset: normalized.preset,
  });
}

function createRecoveryRecord(
  recordId: string,
  displayName: string,
  builtIn: boolean,
  imported: Extract<
    ReturnType<typeof importPresetJson>,
    { readonly status: "recovery" }
  >,
): RecoveryLocalPresetRecord {
  return Object.freeze({
    status: "recovery",
    recordId: readRecordId(recordId),
    displayName: readDisplayName(displayName),
    builtIn,
    reason: imported.reason,
    rawJson: imported.rawJson,
    ...(imported.detectedSchema === undefined
      ? {}
      : { detectedSchema: imported.detectedSchema }),
    ...(imported.detectedVersion === undefined
      ? {}
      : { detectedVersion: imported.detectedVersion }),
  });
}

function serializeStoredRecord(record: LocalPresetRecord): string {
  return JSON.stringify({
    schema: LOCAL_PRESET_RECORD_SCHEMA,
    version: LOCAL_PRESET_RECORD_VERSION,
    recordId: record.recordId,
    displayName: record.displayName,
    rawJson:
      record.status === "ready"
        ? exportPresetJson(record.preset)
        : record.rawJson,
  });
}

function readStoredRecord(
  recordId: string,
  raw: string,
  builtIn: boolean,
): LocalPresetRecord {
  try {
    const envelope: unknown = JSON.parse(raw);
    if (isStoredRecordEnvelope(envelope) && envelope.recordId === recordId) {
      const imported = importPresetJson(envelope.rawJson);
      return imported.status === "recovery"
        ? createRecoveryRecord(
            recordId,
            envelope.displayName,
            builtIn,
            imported,
          )
        : createReadyRecord(
            recordId,
            envelope.displayName,
            builtIn,
            imported.preset,
          );
    }
  } catch {
    // The entire untouched storage value becomes the recovery payload below.
  }
  return Object.freeze({
    status: "recovery",
    recordId,
    displayName: `Recovered ${recordId}`,
    builtIn,
    reason: "corrupt-storage",
    rawJson: raw,
  });
}

function isStoredRecordEnvelope(value: unknown): value is {
  readonly schema: typeof LOCAL_PRESET_RECORD_SCHEMA;
  readonly version: typeof LOCAL_PRESET_RECORD_VERSION;
  readonly recordId: string;
  readonly displayName: string;
  readonly rawJson: string;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 5 &&
    record.schema === LOCAL_PRESET_RECORD_SCHEMA &&
    record.version === LOCAL_PRESET_RECORD_VERSION &&
    typeof record.recordId === "string" &&
    typeof record.displayName === "string" &&
    typeof record.rawJson === "string"
  );
}

function createUniqueRecordId(
  occupiedRecordIds: ReadonlySet<string>,
  createRecordId: () => string,
): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const recordId = readRecordId(createRecordId());
    if (!occupiedRecordIds.has(recordId)) {
      return recordId;
    }
  }
  throw new Error("Could not create a unique local preset record id.");
}

function readRecordId(recordId: string): string {
  if (recordId.length === 0) {
    throw new TypeError("A local preset record id cannot be empty.");
  }
  return recordId;
}

function readDisplayName(displayName: string): string {
  if (displayName.trim().length === 0) {
    throw new TypeError("A local preset display name cannot be empty.");
  }
  return displayName;
}
