// Derives every Quality Profile hash and every Prewarm Manifest hash this
// repository commits, and checks each one against the value the source
// actually carries.
//
// The Quality Profile hash is otherwise an open loop: it is hardcoded in
// quality-profile.ts and hardcoded again in the tests, so a miscomputed value
// would validate against itself. This script is the closed loop. Run it
// whenever QUALITY_PROFILE_VERSION changes, and record its output alongside the
// change:
//
//   pnpm exec tsc -b packages/real-water && node scripts/derive-quality-profile-hashes.mjs
//
// The recipe is the SHA-256 digest of the profile's canonical JSON with
// profileHash removed and the remaining public field order preserved:
// schema, version, id, surface, interaction, temporal, reflection, whitecaps,
// underwater.
//
// The Prewarm Manifest hash is checked the same way, at the bottom of this
// file, against anchors committed here. Run this whenever
// PREWARM_MANIFEST_VERSION, a declaration, or a fingerprint changes.

import { createHash } from "node:crypto";

const { createMinimalWaterQualityProfile } =
  await import("../packages/real-water/dist/quality-profile.js");
const { createMinimalWaterPrewarmManifest } =
  await import("../packages/real-water/dist/manifest.js");

const PROFILE_IDS = ["minimal", "minimal-high-detail"];

const digest = (canonical) =>
  `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;

function omitKeys(record, omitted) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !omitted.includes(key)),
  );
}

function canonicalJson(profile) {
  return JSON.stringify(omitKeys(profile, ["profileHash"]));
}

// Version 6 was committed twice, in two different shapes, on two branches
// developed in parallel: #24 added `interaction`, #26 added `whitecaps`. Both
// are reconstructed from the current profile so this script cannot drift from
// the shared policy constants, and both are checked against the digests those
// two commits carry.
const COMMITTED_LEGACY_HASHES = {
  "6 (interaction)": {
    "minimal":
      "sha256:c60b0a30fa310fbc1f21270c413a35b5b6265d6f157e5f41233be4b8042d8ec5",
    "minimal-high-detail":
      "sha256:4cba756cba61d7f4e071605c4d6939c1ba76b2cab0ef500bcf5ed1be7404d7f4",
  },
  "6 (whitecaps)": {
    "minimal":
      "sha256:e89f6484cb983b184dee0ee46a77f8f05561b97df2a37c4686525b73b53eda28",
    "minimal-high-detail":
      "sha256:008a6a813e5e048fca87cce20a13ea7c1a2187a146a4fda7e2a441f4e7d71a37",
  },
  "6 (waterline)": {
    "minimal":
      "sha256:e09b96aea95dcf7f52f3220a07ec83a90f29f59c978814b5e107f86098e892c2",
    "minimal-high-detail":
      "sha256:cb9323969633c4f8a5d6e44dfe9baf84bd3b61923dbc884e65f704e4d7e3b772",
  },
  "7": {
    "minimal":
      "sha256:f896b4033ed12264eabcc4e88fc2f41cdbd9e8a2d2a70698b296683b586d3c3f",
    "minimal-high-detail":
      "sha256:d33533c3f740eb2d9ef0d4a516f8e242ce22ca83ce90f38fb72f74e57c9738b3",
  },
  "8": {
    "minimal":
      "sha256:b2e727a8016dbac41a2ea1036275f10c344cffc82b2a10bea2c4bc4807bc651d",
    "minimal-high-detail":
      "sha256:a760008c06d5c27ea2cd42f986aff9272f7eaf184e97c6aab6bedf1d73f96bcd",
  },
};

// The reset domains every shape committed so far. Held here as its own literal
// rather than read off the current profile: reconstructing a historical shape
// from the current one means the next policy change silently rewrites history
// and this script starts reporting mismatches against digests that are still
// perfectly correct. quality-profile.ts declares the same list separately, for
// the same reason.
const LEGACY_SSR_HISTORY_RESET_DOMAINS = [
  "simulation-reset",
  "camera-cut",
  "origin-shift",
  "sea-state-cut",
];

function withLegacyResetDomains(profile) {
  return {
    ...profile,
    reflection: {
      ...profile.reflection,
      ssr: {
        ...profile.reflection.ssr,
        history: {
          ...profile.reflection.ssr.history,
          resetDomains: LEGACY_SSR_HISTORY_RESET_DOMAINS,
        },
      },
    },
  };
}

function legacyV6Interaction(profile) {
  return {
    ...withLegacyResetDomains(omitKeys(profile, ["whitecaps", "underwater"])),
    version: 6,
  };
}

function legacyV6Whitecaps(profile) {
  return {
    ...withLegacyResetDomains(omitKeys(profile, ["interaction", "underwater"])),
    version: 6,
  };
}

// #31's version 6 added no field; it is a distinct shape only because it
// already carried waterline-crossing, so the current reset domains are correct
// for it and only interaction and whitecaps are removed.
function legacyV6Waterline(profile) {
  return {
    ...omitKeys(profile, ["interaction", "whitecaps", "underwater"]),
    version: 6,
  };
}

function legacyV7(profile) {
  return {
    ...withLegacyResetDomains(omitKeys(profile, ["underwater"])),
    version: 7,
  };
}

function legacyV8(profile) {
  return { ...omitKeys(profile, ["underwater"]), version: 8 };
}

let failures = 0;

function report(label, id, canonical, expected) {
  const actual = digest(canonical);
  const matches = actual === expected;
  if (!matches) {
    failures += 1;
  }
  const verdict = matches
    ? "matches source"
    : `MISMATCH, source has ${expected}`;
  console.log(`version ${label}  ${id.padEnd(20)} ${actual}  ${verdict}`);
}

for (const id of PROFILE_IDS) {
  const profile = createMinimalWaterQualityProfile(id);
  report("current", id, canonicalJson(profile), profile.profileHash);
}

for (const id of PROFILE_IDS) {
  const profile = createMinimalWaterQualityProfile(id);
  report(
    "6 (interaction)",
    id,
    canonicalJson(legacyV6Interaction(profile)),
    COMMITTED_LEGACY_HASHES["6 (interaction)"][id],
  );
  report(
    "6 (whitecaps)",
    id,
    canonicalJson(legacyV6Whitecaps(profile)),
    COMMITTED_LEGACY_HASHES["6 (whitecaps)"][id],
  );
  report(
    "6 (waterline)",
    id,
    canonicalJson(legacyV6Waterline(profile)),
    COMMITTED_LEGACY_HASHES["6 (waterline)"][id],
  );
  report(
    "7",
    id,
    canonicalJson(legacyV7(profile)),
    COMMITTED_LEGACY_HASHES["7"][id],
  );
  report(
    "8",
    id,
    canonicalJson(legacyV8(profile)),
    COMMITTED_LEGACY_HASHES["8"][id],
  );
}

// The Prewarm Manifest hash had the same open loop the Quality Profile hash
// had, one level up: the manifest computes it, and every test that mentions it
// compares `manifest.manifestHash` to itself. Nothing in the repository stated
// what the digest is supposed to be, so the whole manifest - all 77
// declarations and every fingerprint inside them - agreed with itself no matter
// what it said. This version carries 84 declarations.
//
// These two values are the anchor. They were generated once, read off a
// reviewed manifest, and pasted in. The recipe below is restated here rather
// than imported so a change to the manifest's own hashing would show up as a
// mismatch instead of following along silently: SHA-256 of the manifest's
// public fields in declared order, with manifestHash itself excluded.
const COMMITTED_MANIFEST_HASHES = {
  "minimal":
    "sha256:9e74048ce7c4cb4dd501c68623b722700c36a384626bfc33125a481078279a80",
  "minimal-high-detail":
    "sha256:16e7c07b62915f609c7145462dbf70f230dc76f6041d5f37a346709bba4f0fc3",
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
  console.log(`manifest         ${id.padEnd(20)} ${derived}  ${verdict}`);
}

if (failures > 0) {
  throw new Error(
    `${failures} committed hash${failures === 1 ? "" : "es"} do not match the source.`,
  );
}

console.log(
  "Every committed Quality Profile and Prewarm Manifest hash is reproducible.",
);
