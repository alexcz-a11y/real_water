// Derives every Quality Profile hash and every Prewarm Manifest hash this
// repository commits, and checks each one against the value the source
// actually carries.
//
// The Quality Profile hash is otherwise an open loop: it is hardcoded in
// quality-profile.ts and hardcoded again in the tests, so a miscomputed value
// would validate against itself. This script is the closed loop. Run it
// whenever QUALITY_PROFILE_VERSION or PREWARM_MANIFEST_VERSION changes, a
// declaration moves, or a fingerprint is minted, and record its output
// alongside the change:
//
//   pnpm exec tsc -b packages/real-water && node scripts/derive-quality-profile-hashes.mjs
//
// The recipe is the SHA-256 digest of the profile's canonical JSON with
// profileHash removed and the remaining public field order preserved.

import { createHash } from "node:crypto";

const { createMinimalWaterQualityProfile } =
  await import("../packages/real-water/dist/quality-profile.js");
const { createMinimalWaterPrewarmManifest } =
  await import("../packages/real-water/dist/manifest.js");

const PROFILE_IDS = ["minimal", "minimal-high-detail"];

const digest = (canonical) =>
  `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;

// The canonical field order, stated rather than inherited. Reading it off the
// live object's key order would make the recipe agree with whatever the source
// happens to do, which is not a check. #25 committed this list for that
// reason and it is kept.
const CANONICAL_QUALITY_PROFILE_FIELDS = Object.freeze([
  "schema",
  "version",
  "id",
  "surface",
  "interaction",
  "bodyCoupling",
  "temporal",
  "reflection",
  "whitecaps",
  "secondaryParticles",
  "underwater",
  "postTraaComposition",
]);

const CANONICAL_INTERACTION_FIELD_KEYS = Object.freeze([
  "radiusMetres",
  "edgeFadeMetres",
  "maxActiveDisturbances",
  "snapshotBanks",
  "maxSnapshotAgeTicks",
  "radialImpactRoute",
  "directionalWakeRoute",
]);

const CANONICAL_WHITECAP_FIELDS = Object.freeze([
  "mode",
  "fixedTickHz",
  "fieldResolution",
  "tileSizeMetres",
  "fieldFormat",
  "stageLayout",
  "sourceLayout",
  "localHistoryBanks",
  "maxLocalSources",
  "foamTimelineCapacityTicks",
  "diffusionTaps",
  "updateCadence",
  "captureResolutionPolicy",
  "captureFormat",
  "resetDomains",
]);

const LEGACY_SPECTRAL_WHITECAP_FIELDS = Object.freeze([
  "mode",
  "fixedTickHz",
  "fieldResolution",
  "tileSizeMetres",
  "fieldFormat",
  "stageLayout",
  "diffusionTaps",
  "updateCadence",
  "captureResolutionPolicy",
  "captureFormat",
  "resetDomains",
]);

const CANONICAL_SECONDARY_PARTICLE_FIELDS = Object.freeze([
  "mode",
  "capacity",
  "maximumCandidateCount",
  "selection",
  "contribution",
  "hysteresis",
  "consumers",
  "updateCadence",
  "payloadOwnership",
  "renderPhaseKnowledge",
]);
const CANONICAL_SECONDARY_PARTICLE_CONTRIBUTION_FIELDS = Object.freeze([
  "projectedAreaReference",
  "screenAreaDivisor",
  "formula",
  "quantization",
]);
const CANONICAL_SECONDARY_PARTICLE_HYSTERESIS_FIELDS = Object.freeze([
  "mode",
  "retainedContributionBonusQ16",
  "minimumResidenceTicks",
  "reentryCooldownTicks",
]);
const CANONICAL_SECONDARY_PARTICLE_CONSUMER_FIELDS = Object.freeze([
  "consumerId",
  "maximumRequestCount",
  "softRequestCeiling",
  "minimumRetainedSlots",
  "contributionReference",
  "pressureReentryPolicy",
]);

const CANONICAL_POST_TRAA_FIELDS = Object.freeze([
  "mode",
  "resolutionPolicy",
  "accumulationFormat",
  "finalColorFormat",
  "samples",
  "stages",
]);

let failures = 0;

// One key-set check, used for the current profile and every legacy variant
// alike. A variant carries the canonical fields minus the ones it predates,
// never "the canonical fields, roughly". Without this a field added later is
// silently dropped from the canonical form and the resulting mismatch points
// at the hash instead of at the omission - which is the failure that invites
// someone to just update the hash.
function checkKeys(label, present, expected) {
  const actual = [...present].sort();
  const wanted = [...expected].sort();
  if (actual.join(",") === wanted.join(",")) {
    return;
  }
  failures += 1;
  const missing = wanted.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !wanted.includes(key));
  console.log(
    `  ${label}: key set drifted.` +
      (missing.length > 0 ? ` Missing ${missing.join(", ")}.` : "") +
      (extra.length > 0 ? ` Unexpected ${extra.join(", ")}.` : ""),
  );
}

function canonicalJson(label, profile, variant) {
  const absentKeys = variant?.absentKeys ?? [];
  const fields = CANONICAL_QUALITY_PROFILE_FIELDS.filter(
    (field) => !absentKeys.includes(field),
  );
  checkKeys(
    label,
    Object.keys(profile).filter((key) => key !== "profileHash"),
    fields,
  );
  if (profile.interaction !== undefined) {
    const absentFieldKeys = variant?.absentInteractionFieldKeys ?? [];
    checkKeys(
      `${label} interaction field`,
      Object.keys(profile.interaction.field),
      CANONICAL_INTERACTION_FIELD_KEYS.filter(
        (key) => !absentFieldKeys.includes(key),
      ),
    );
  }
  if (profile.whitecaps !== undefined) {
    checkKeys(
      `${label} whitecaps`,
      Object.keys(profile.whitecaps),
      variant?.legacySpectralWhitecaps === true
        ? LEGACY_SPECTRAL_WHITECAP_FIELDS
        : CANONICAL_WHITECAP_FIELDS,
    );
  }
  if (profile.secondaryParticles !== undefined) {
    checkKeys(
      `${label} secondary particles`,
      Object.keys(profile.secondaryParticles),
      CANONICAL_SECONDARY_PARTICLE_FIELDS,
    );
    checkKeys(
      `${label} secondary-particle contribution`,
      Object.keys(profile.secondaryParticles.contribution),
      CANONICAL_SECONDARY_PARTICLE_CONTRIBUTION_FIELDS,
    );
    checkKeys(
      `${label} secondary-particle hysteresis`,
      Object.keys(profile.secondaryParticles.hysteresis),
      CANONICAL_SECONDARY_PARTICLE_HYSTERESIS_FIELDS,
    );
    profile.secondaryParticles.consumers.forEach((consumer, index) => {
      checkKeys(
        `${label} secondary-particle consumer ${index}`,
        Object.keys(consumer),
        CANONICAL_SECONDARY_PARTICLE_CONSUMER_FIELDS,
      );
    });
  }
  if (profile.postTraaComposition !== undefined) {
    checkKeys(
      `${label} post-TRAA composition`,
      Object.keys(profile.postTraaComposition),
      CANONICAL_POST_TRAA_FIELDS,
    );
  }
  return JSON.stringify(
    Object.fromEntries(fields.map((field) => [field, profile[field]])),
  );
}

// The reset domains every shape committed so far. Held here as their own
// literals rather than read off the current profile: reconstructing a
// historical shape from the current one means the next policy change silently
// rewrites history and this script starts reporting mismatches against digests
// that are still perfectly correct. quality-profile.ts declares the same lists
// separately, for the same reason.
const LEGACY_SSR_HISTORY_RESET_DOMAINS = [
  "simulation-reset",
  "camera-cut",
  "origin-shift",
  "sea-state-cut",
];

const WATERLINE_SSR_HISTORY_RESET_DOMAINS = [
  "simulation-reset",
  "camera-cut",
  "origin-shift",
  "sea-state-cut",
  "waterline-crossing",
];

// Every legacy shape this release still migrates, stated the way
// quality-profile.ts states it: what the shape was missing, what its reset
// domains were, and the two digests it was committed with. Versions 6 and 7
// were each committed more than once, in more than one shape, on branches
// developed in parallel - #24 added interaction, #26 added whitecaps, #31
// added the waterline domain, #25 added bodyCoupling and a directional wake
// route, #32 added the underwater volume. Same numbers, different payloads,
// all still recoverable.
const COMMITTED_LEGACY_VARIANTS = [
  {
    label: "6 (interaction)",
    version: 6,
    absentKeys: [
      "bodyCoupling",
      "whitecaps",
      "secondaryParticles",
      "underwater",
      "postTraaComposition",
    ],
    absentInteractionFieldKeys: ["directionalWakeRoute"],
    ssrHistoryResetDomains: LEGACY_SSR_HISTORY_RESET_DOMAINS,
    hashes: {
      "minimal":
        "sha256:c60b0a30fa310fbc1f21270c413a35b5b6265d6f157e5f41233be4b8042d8ec5",
      "minimal-high-detail":
        "sha256:4cba756cba61d7f4e071605c4d6939c1ba76b2cab0ef500bcf5ed1be7404d7f4",
    },
  },
  {
    label: "6 (whitecaps)",
    version: 6,
    absentKeys: [
      "interaction",
      "bodyCoupling",
      "secondaryParticles",
      "underwater",
      "postTraaComposition",
    ],
    absentInteractionFieldKeys: [],
    ssrHistoryResetDomains: LEGACY_SSR_HISTORY_RESET_DOMAINS,
    legacySpectralWhitecaps: true,
    hashes: {
      "minimal":
        "sha256:e89f6484cb983b184dee0ee46a77f8f05561b97df2a37c4686525b73b53eda28",
      "minimal-high-detail":
        "sha256:008a6a813e5e048fca87cce20a13ea7c1a2187a146a4fda7e2a441f4e7d71a37",
    },
  },
  {
    label: "6 (waterline)",
    version: 6,
    absentKeys: [
      "interaction",
      "bodyCoupling",
      "whitecaps",
      "secondaryParticles",
      "underwater",
      "postTraaComposition",
    ],
    absentInteractionFieldKeys: [],
    ssrHistoryResetDomains: WATERLINE_SSR_HISTORY_RESET_DOMAINS,
    hashes: {
      "minimal":
        "sha256:e09b96aea95dcf7f52f3220a07ec83a90f29f59c978814b5e107f86098e892c2",
      "minimal-high-detail":
        "sha256:cb9323969633c4f8a5d6e44dfe9baf84bd3b61923dbc884e65f704e4d7e3b772",
    },
  },
  {
    label: "7 (whitecaps)",
    version: 7,
    absentKeys: [
      "bodyCoupling",
      "secondaryParticles",
      "underwater",
      "postTraaComposition",
    ],
    absentInteractionFieldKeys: ["directionalWakeRoute"],
    ssrHistoryResetDomains: LEGACY_SSR_HISTORY_RESET_DOMAINS,
    legacySpectralWhitecaps: true,
    hashes: {
      "minimal":
        "sha256:f896b4033ed12264eabcc4e88fc2f41cdbd9e8a2d2a70698b296683b586d3c3f",
      "minimal-high-detail":
        "sha256:d33533c3f740eb2d9ef0d4a516f8e242ce22ca83ce90f38fb72f74e57c9738b3",
    },
  },
  {
    label: "7 (body coupling)",
    version: 7,
    absentKeys: [
      "whitecaps",
      "secondaryParticles",
      "underwater",
      "postTraaComposition",
    ],
    absentInteractionFieldKeys: [],
    ssrHistoryResetDomains: LEGACY_SSR_HISTORY_RESET_DOMAINS,
    hashes: {
      "minimal":
        "sha256:1c11f4a6ae5099ee4ffe2610edc4c57fc546975fdb05a3a55ad4b662991db6a4",
      "minimal-high-detail":
        "sha256:98911284133f9b9be6f93548f7726657c9f5164d4e241c08bab0ac440c04e67a",
    },
  },
  {
    label: "8",
    version: 8,
    absentKeys: [
      "bodyCoupling",
      "secondaryParticles",
      "underwater",
      "postTraaComposition",
    ],
    absentInteractionFieldKeys: ["directionalWakeRoute"],
    ssrHistoryResetDomains: WATERLINE_SSR_HISTORY_RESET_DOMAINS,
    legacySpectralWhitecaps: true,
    hashes: {
      "minimal":
        "sha256:b2e727a8016dbac41a2ea1036275f10c344cffc82b2a10bea2c4bc4807bc651d",
      "minimal-high-detail":
        "sha256:a760008c06d5c27ea2cd42f986aff9272f7eaf184e97c6aab6bedf1d73f96bcd",
    },
  },
  {
    label: "9 (body coupling)",
    version: 9,
    absentKeys: ["secondaryParticles", "underwater", "postTraaComposition"],
    absentInteractionFieldKeys: [],
    ssrHistoryResetDomains: WATERLINE_SSR_HISTORY_RESET_DOMAINS,
    legacySpectralWhitecaps: true,
    hashes: {
      "minimal":
        "sha256:6a3385d04d854e423957d290f562696ce4041c0ad1eb38e3f26fc9306a950978",
      "minimal-high-detail":
        "sha256:3ef8c9bbcb9e5895de1a42425aa67ce69ed171c037ce29f21f82cefae398f637",
    },
  },
  {
    label: "9 (underwater)",
    version: 9,
    absentKeys: ["bodyCoupling", "secondaryParticles", "postTraaComposition"],
    absentInteractionFieldKeys: ["directionalWakeRoute"],
    ssrHistoryResetDomains: WATERLINE_SSR_HISTORY_RESET_DOMAINS,
    legacySpectralWhitecaps: true,
    hashes: {
      "minimal":
        "sha256:9ec18552c76f5c2df7da7798b9d18148f27d247b97fff2b252742a321daa1bed",
      "minimal-high-detail":
        "sha256:98d424b79e24f5b785e9305eb7f50e83057a30ce3d37d50c90e1ce8dd72954b3",
    },
  },
  // Version 10 is the first same-number-different-meaning rung on this ladder.
  // Both parents shipped a version 10 and neither saw the other's: the merge
  // line's 10 carries the underwater volume with spectral whitecaps, and
  // ticket/t16's 10 carries unified foam with no underwater volume. Both are
  // committed shapes, so both migrate.
  {
    label: "10 (underwater, spectral whitecaps)",
    version: 10,
    absentKeys: ["secondaryParticles", "postTraaComposition"],
    absentInteractionFieldKeys: [],
    ssrHistoryResetDomains: WATERLINE_SSR_HISTORY_RESET_DOMAINS,
    legacySpectralWhitecaps: true,
    hashes: {
      "minimal":
        "sha256:ab07356cb71f4cdf9dabad49af2c9aa1c89ee2405588830c4c3493d1fe7280a4",
      "minimal-high-detail":
        "sha256:294f30cbd88b56da8b81cf5e8201fd2ea250faf0f25a35f869820cf87b9f2742",
    },
  },
  {
    label: "10 (unified foam, no underwater)",
    version: 10,
    absentKeys: ["secondaryParticles", "underwater", "postTraaComposition"],
    absentInteractionFieldKeys: [],
    ssrHistoryResetDomains: WATERLINE_SSR_HISTORY_RESET_DOMAINS,
    hashes: {
      "minimal":
        "sha256:47475f80673e8e4c942b567715e0e3d36dedf0d6d1320e83825dc866fefacd93",
      "minimal-high-detail":
        "sha256:a8ce0bc38f028341be0567b0e467355f1b0bc74d4abe3f2043c59e28a2dbc239",
    },
  },
  {
    label: "11 (merged foam and underwater)",
    version: 11,
    absentKeys: ["secondaryParticles", "postTraaComposition"],
    absentInteractionFieldKeys: [],
    ssrHistoryResetDomains: WATERLINE_SSR_HISTORY_RESET_DOMAINS,
    hashes: {
      "minimal":
        "sha256:6f6ccb6262b8b3239dcfbcfc80dd3322ca75408260ea947cdd5892a16a8ef908",
      "minimal-high-detail":
        "sha256:e1e1c7af79374e668a1f82c4b5c742d42e5009f5162389d8f3dc0ead9978d5a9",
    },
  },
];

function omitKeys(record, omitted) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !omitted.includes(key)),
  );
}

function legacyProfile(profile, variant) {
  const reduced = omitKeys(profile, variant.absentKeys);
  if (reduced.interaction !== undefined) {
    reduced.interaction = {
      ...reduced.interaction,
      field: omitKeys(
        reduced.interaction.field,
        variant.absentInteractionFieldKeys,
      ),
    };
  }
  if (
    reduced.whitecaps !== undefined &&
    variant.legacySpectralWhitecaps === true
  ) {
    reduced.whitecaps = {
      ...omitKeys(reduced.whitecaps, [
        "sourceLayout",
        "localHistoryBanks",
        "maxLocalSources",
        "foamTimelineCapacityTicks",
      ]),
      mode: "spectral-ping-pong",
    };
  }
  return {
    ...reduced,
    version: variant.version,
    reflection: {
      ...reduced.reflection,
      ssr: {
        ...reduced.reflection.ssr,
        history: {
          ...reduced.reflection.ssr.history,
          resetDomains: variant.ssrHistoryResetDomains,
        },
      },
    },
  };
}

function report(label, id, actual, expected) {
  const matches = actual === expected;
  if (!matches) {
    failures += 1;
  }
  const verdict = matches
    ? "matches source"
    : `MISMATCH, source has ${expected}`;
  console.log(
    `version ${label.padEnd(18)} ${id.padEnd(20)} ${actual}  ${verdict}`,
  );
}

for (const id of PROFILE_IDS) {
  const profile = createMinimalWaterQualityProfile(id);
  report(
    "current",
    id,
    digest(canonicalJson(`current ${id}`, profile)),
    profile.profileHash,
  );
}

for (const variant of COMMITTED_LEGACY_VARIANTS) {
  for (const id of PROFILE_IDS) {
    const profile = createMinimalWaterQualityProfile(id);
    report(
      variant.label,
      id,
      digest(
        canonicalJson(
          `${variant.label} ${id}`,
          legacyProfile(profile, variant),
          variant,
        ),
      ),
      variant.hashes[id],
    );
  }
}

// The Prewarm Manifest hash had the same open loop the Quality Profile hash
// had, one level up: the manifest computes it, and every reference in the
// repository compares `manifest.manifestHash` to itself. Nothing in the
// repository stated what the digest is supposed to be, so the whole manifest -
// every declaration and every fingerprint inside them - agreed with itself no
// matter what it said.
//
// These two values are the anchor. They were generated once, read off a
// reviewed manifest, and pasted in. The recipe below is restated here rather
// than imported so a change to the manifest's own hashing would show up as a
// mismatch instead of following along silently: SHA-256 of the manifest's
// public fields in declared order, with manifestHash itself excluded.
const COMMITTED_MANIFEST_HASHES = {
  "minimal":
    "sha256:0675c9a0f7b99bcdcceb508446e889f059a8542847328266715c2f7e73661ef2",
  "minimal-high-detail":
    "sha256:f9b2adc6daf8834d2867a24c1d062084a432f3e8169ff937a612e925021e7f1a",
};

function canonicalManifestJson(manifest) {
  return JSON.stringify({
    schema: manifest.schema,
    version: manifest.version,
    id: manifest.id,
    qualityProfile: manifest.qualityProfile,
    drawingBuffer: manifest.drawingBuffer,
    environmentReflection: manifest.environmentReflection,
    effectVariants: manifest.effectVariants,
    declarations: manifest.declarations,
  });
}

for (const id of PROFILE_IDS) {
  const manifest = createMinimalWaterPrewarmManifest(
    createMinimalWaterQualityProfile(id),
  );
  const expected = COMMITTED_MANIFEST_HASHES[id];
  const derived = digest(canonicalManifestJson(manifest));
  const matchesCommitted = derived === expected;
  const matchesManifest = derived === manifest.manifestHash;
  if (!matchesCommitted || !matchesManifest) {
    failures += 1;
  }
  const verdict = !matchesCommitted
    ? `MISMATCH, the committed anchor is ${expected}`
    : !matchesManifest
      ? `MISMATCH, the manifest carries ${manifest.manifestHash}`
      : "matches the committed anchor and the manifest";
  console.log(`manifest           ${id.padEnd(20)} ${derived}  ${verdict}`);
}

if (failures > 0) {
  throw new Error(
    `${failures} committed hash${failures === 1 ? "" : "es"} do not match the source.`,
  );
}

console.log(
  "Every committed Quality Profile and Prewarm Manifest hash is reproducible.",
);
