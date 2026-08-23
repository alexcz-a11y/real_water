import { describe, expect, it } from "vitest";
import {
  createMinimalWaterQualityProfile,
  createReferenceEnvironmentPreset,
  createReferenceShowcasePreset,
  createWaterPreset,
  exportPresetJson,
  type PresetDocument,
} from "real-water";
import {
  createBrowserLocalPresetStorage,
  createLocalPresetLibrary,
  createMemoryLocalPresetStorage,
  LOCAL_PRESET_BUILT_IN_RECORD_IDS,
  type LocalPresetStorageAdapter,
} from "./local-preset-library.js";
import type { ArtisticControls } from "real-water";

// Versions 1 through 3 predate the spectral whitecap Artistic Controls, so a
// repository-authentic historical payload carries only the thirteen optical
// controls, in their original order.
function withoutWhitecapControls(
  controls: ArtisticControls,
): Record<string, number> {
  const legacy: Record<string, number> = { ...controls };
  delete legacy.whitecapAmount;
  delete legacy.foamPersistence;
  return legacy;
}

describe("Local Preset Library", () => {
  it("keeps record identity and display name separate from the Core preset payload", () => {
    const library = createLocalPresetLibrary({
      storage: createMemoryLocalPresetStorage(),
      createRecordId: createSequentialRecordId(),
    });
    const preset = createWaterPreset("storm");

    const saved = library.save({
      displayName: "My storm",
      preset,
    });
    const copied = library.copy(saved.recordId, "My storm copy");
    const renamed = library.rename(saved.recordId, "Storm at dusk");

    expect(saved).toMatchObject({
      status: "ready",
      recordId: "local-1",
      displayName: "My storm",
      preset,
    });
    expect(copied).toMatchObject({
      status: "ready",
      recordId: "local-2",
      displayName: "My storm copy",
      preset,
    });
    expect(renamed).toMatchObject({
      status: "ready",
      recordId: "local-1",
      displayName: "Storm at dusk",
      preset,
    });
    expect(library.get(saved.recordId)).toEqual(renamed);
    expect(library.get(copied.recordId)).toEqual(copied);
    expect(library.exportJson(saved.recordId)).toBe(
      library.exportJson(copied.recordId),
    );
  });

  it("rehydrates records independently and preserves a corrupt record for recovery", () => {
    const storage = createMemoryLocalPresetStorage();
    const firstLibrary = createLocalPresetLibrary({
      storage,
      createRecordId: createSequentialRecordId(),
    });
    const saved = firstLibrary.save({
      displayName: "Calm study",
      preset: createWaterPreset("calm"),
    });
    storage.write("damaged-record", "not a persisted preset envelope\n");

    const reloaded = createLocalPresetLibrary({
      storage,
      createRecordId: createSequentialRecordId(),
    });

    expect(reloaded.get(saved.recordId)).toMatchObject({
      status: "ready",
      recordId: saved.recordId,
      displayName: "Calm study",
      preset: createWaterPreset("calm"),
    });
    expect(reloaded.get("damaged-record")).toMatchObject({
      status: "recovery",
      recordId: "damaged-record",
      rawJson: "not a persisted preset envelope\n",
    });
    expect(reloaded.exportJson("damaged-record")).toBe(
      "not a persisted preset envelope\n",
    );
  });

  it("preserves invalid imported JSON byte-for-byte across storage reloads", () => {
    const storage = createMemoryLocalPresetStorage();
    const library = createLocalPresetLibrary({
      storage,
      createRecordId: createSequentialRecordId(),
    });
    const rawJson = " {\n  definitely not JSON\n}\n";

    const imported = library.importJson({
      displayName: "Broken import",
      rawJson,
    });

    expect(imported).toMatchObject({
      status: "recovery",
      record: {
        status: "recovery",
        recordId: "local-1",
        displayName: "Broken import",
        reason: "invalid-json",
        rawJson,
      },
    });
    expect(library.exportJson(imported.record.recordId)).toBe(rawJson);

    const reloaded = createLocalPresetLibrary({ storage });
    expect(reloaded.exportJson(imported.record.recordId)).toBe(rawJson);
  });

  it("restores a built-in idempotently without deleting copies or recovery records", () => {
    const storm = createWaterPreset("storm");
    const library = createLocalPresetLibrary({
      storage: createMemoryLocalPresetStorage(),
      createRecordId: createSequentialRecordId(),
      builtIns: [
        {
          recordId: "built-in:water:storm",
          displayName: "Storm",
          preset: storm,
        },
      ],
    });
    const copy = library.copy("built-in:water:storm", "Storm copy");
    const recovery = library.importJson({
      displayName: "Future experiment",
      rawJson: "not json",
    }).record;
    library.save({
      recordId: "built-in:water:storm",
      displayName: "Changed storm",
      preset: createWaterPreset("calm"),
    });

    const firstRestore = library.restore("built-in:water:storm");
    const secondRestore = library.restore("built-in:water:storm");

    expect(firstRestore).toMatchObject({
      status: "ready",
      recordId: "built-in:water:storm",
      displayName: "Storm",
      preset: storm,
    });
    expect(secondRestore).toEqual(firstRestore);
    expect(library.get(copy.recordId)).toEqual(copy);
    expect(library.get(recovery.recordId)).toEqual(recovery);
  });

  it.each([
    ["Water", () => createWaterPreset("swell")],
    ["Environment", () => createReferenceEnvironmentPreset()],
    ["Quality", () => createMinimalWaterQualityProfile("minimal-high-detail")],
    ["Showcase", () => createReferenceShowcasePreset()],
  ] as const)(
    "saves, imports, exports, copies, renames, snapshots, and gets %s presets",
    (_kind, createPreset) => {
      const library = createLocalPresetLibrary({
        storage: createMemoryLocalPresetStorage(),
        createRecordId: createSequentialRecordId(),
        builtIns: [],
      });
      const preset: PresetDocument = createPreset();
      const canonicalJson = exportPresetJson(preset);

      const saved = library.save({ displayName: "Saved", preset });
      const imported = library.importJson({
        displayName: "Imported",
        rawJson: canonicalJson,
      });
      const copied = library.copy(saved.recordId, "Copied");
      const renamed = library.rename(saved.recordId, "Renamed");

      expect(saved.preset).toEqual(preset);
      expect(imported).toMatchObject({
        status: "ready",
        migrated: false,
        sourceVersion: preset.version,
        record: { status: "ready", preset },
      });
      expect(library.exportJson(saved.recordId)).toBe(canonicalJson);
      expect(library.exportJson(imported.record.recordId)).toBe(canonicalJson);
      expect(library.exportJson(copied.recordId)).toBe(canonicalJson);
      expect(renamed.recordId).toBe(saved.recordId);
      expect(renamed.status).toBe("ready");
      if (renamed.status !== "ready") {
        throw new Error("A ready preset became recovery metadata on rename.");
      }
      expect(renamed.preset).toEqual(preset);
      expect(library.get(saved.recordId)).toEqual(renamed);
      expect(library.snapshot()).toContainEqual(renamed);
    },
  );

  it("migrates a valid historical import and persists only current canonical JSON", () => {
    const storage = createMemoryLocalPresetStorage();
    const library = createLocalPresetLibrary({
      storage,
      createRecordId: createSequentialRecordId(),
      builtIns: [],
    });
    const calm = createWaterPreset("calm");
    const historicalJson = `${JSON.stringify({
      schema: calm.schema,
      version: 2,
      id: calm.id,
      presetHash:
        "sha256:7823cba17b46a26315541babfde3d3b7fda6a937794df7a32cbc3bf3d28df047",
      artisticControls: withoutWhitecapControls(calm.artisticControls),
    })}\n`;

    const imported = library.importJson({
      displayName: "Old calm",
      rawJson: historicalJson,
    });

    expect(imported).toMatchObject({
      status: "ready",
      migrated: true,
      sourceVersion: 2,
      record: { preset: createWaterPreset("calm") },
    });
    expect(library.exportJson(imported.record.recordId)).toBe(
      exportPresetJson(createWaterPreset("calm")),
    );
    expect(library.exportJson(imported.record.recordId)).not.toBe(
      historicalJson,
    );

    const reloaded = createLocalPresetLibrary({ storage, builtIns: [] });
    expect(reloaded.exportJson(imported.record.recordId)).toBe(
      exportPresetJson(createWaterPreset("calm")),
    );
    expect(storage.read(imported.record.recordId)).toContain(
      createWaterPreset("calm").presetHash,
    );
    expect(storage.read(imported.record.recordId)).not.toContain(
      "sha256:7823cba17b46a26315541babfde3d3b7fda6a937794df7a32cbc3bf3d28df047",
    );
  });

  it.each([
    ["Water", createWaterPreset("swell")],
    ["Environment", createReferenceEnvironmentPreset()],
    ["Quality", createMinimalWaterQualityProfile()],
    ["Showcase", createReferenceShowcasePreset()],
  ] as const)("preserves future %s JSON byte-for-byte", (_kind, preset) => {
    const library = createLocalPresetLibrary({
      storage: createMemoryLocalPresetStorage(),
      createRecordId: createSequentialRecordId(),
      builtIns: [],
    });
    const rawJson = `  ${JSON.stringify({ ...preset, version: 999 })}\n\n`;

    const imported = library.importJson({
      displayName: "From the future",
      rawJson,
    });

    expect(imported).toMatchObject({
      status: "recovery",
      record: {
        reason: "future-version",
        rawJson,
        detectedSchema: preset.schema,
        detectedVersion: 999,
      },
    });
    expect(library.exportJson(imported.record.recordId)).toBe(rawJson);
  });

  it.each([
    ["Water", LOCAL_PRESET_BUILT_IN_RECORD_IDS.water.calm],
    ["Environment", LOCAL_PRESET_BUILT_IN_RECORD_IDS.environment.reference],
    ["Quality", LOCAL_PRESET_BUILT_IN_RECORD_IDS.quality.minimal],
    ["Showcase", LOCAL_PRESET_BUILT_IN_RECORD_IDS.showcase.referenceLoop],
  ] as const)("restores the default %s built-in", (_kind, recordId) => {
    const library = createLocalPresetLibrary({
      storage: createMemoryLocalPresetStorage(),
    });
    const builtIn = library.get(recordId);
    if (builtIn?.status !== "ready") {
      throw new Error(`Missing ready built-in ${recordId}.`);
    }
    library.save({
      recordId,
      displayName: "Local override",
      preset: builtIn.preset,
    });

    const restored = library.restore(recordId);

    expect(restored).toEqual(builtIn);
    expect(restored.builtIn).toBe(true);
  });

  it("publishes no mutation when storage rejects a write or restore", () => {
    const memory = createMemoryLocalPresetStorage();
    const failure = new Error("storage full");
    let rejectingWrites = false;
    const storage: LocalPresetStorageAdapter = {
      listRecordIds: () => memory.listRecordIds(),
      read: (recordId) => memory.read(recordId),
      write(recordId, value) {
        if (rejectingWrites) {
          throw failure;
        }
        memory.write(recordId, value);
      },
      remove(recordId) {
        if (rejectingWrites) {
          throw failure;
        }
        memory.remove(recordId);
      },
    };
    const library = createLocalPresetLibrary({
      storage,
      createRecordId: createSequentialRecordId(),
      builtIns: [
        {
          recordId: "built-in:water:storm",
          displayName: "Storm",
          preset: createWaterPreset("storm"),
        },
      ],
    });
    library.save({
      recordId: "built-in:water:storm",
      displayName: "Storm override",
      preset: createWaterPreset("calm"),
    });
    const before = library.snapshot();
    rejectingWrites = true;

    expect(() => library.rename("built-in:water:storm", "Lost rename")).toThrow(
      "storage full",
    );
    expect(library.snapshot()).toEqual(before);
    expect(() =>
      library.save({
        displayName: "Lost save",
        preset: createWaterPreset("storm"),
      }),
    ).toThrow("storage full");
    expect(library.snapshot()).toEqual(before);
    expect(() =>
      library.importJson({ displayName: "Lost import", rawJson: "broken" }),
    ).toThrow("storage full");
    expect(library.snapshot()).toEqual(before);
    expect(() => library.copy("built-in:water:storm")).toThrow("storage full");
    expect(library.snapshot()).toEqual(before);
    expect(() => library.restore("built-in:water:storm")).toThrow(
      "storage full",
    );
    expect(library.snapshot()).toEqual(before);
  });

  it("uses a namespaced browser localStorage adapter without touching unrelated data", () => {
    const browserStorage = createMemoryWebStorage();
    browserStorage.setItem("unrelated", "keep me");
    const storage = createBrowserLocalPresetStorage(browserStorage);
    const library = createLocalPresetLibrary({
      storage,
      createRecordId: createSequentialRecordId(),
      builtIns: [],
    });

    const saved = library.save({
      displayName: "Browser saved",
      preset: createWaterPreset("calm"),
    });

    expect(browserStorage.getItem("unrelated")).toBe("keep me");
    expect(browserStorage.getItem("real-water:preset:local-1")).not.toBeNull();
    const reloaded = createLocalPresetLibrary({ storage, builtIns: [] });
    expect(reloaded.get(saved.recordId)).toEqual(saved);
  });
});

function createSequentialRecordId(): () => string {
  let next = 1;
  return () => `local-${next++}`;
}

function createMemoryWebStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}
