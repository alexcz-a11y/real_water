// Derives every Quality Profile hash this repository commits, and checks each
// one against the value the source actually carries.
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
// schema, version, id, surface, interaction, temporal, reflection, whitecaps.

import { createHash } from "node:crypto";

const { createMinimalWaterQualityProfile } =
  await import("../packages/real-water/dist/quality-profile.js");

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
    ...withLegacyResetDomains(omitKeys(profile, ["whitecaps"])),
    version: 6,
  };
}

function legacyV6Whitecaps(profile) {
  return {
    ...withLegacyResetDomains(omitKeys(profile, ["interaction"])),
    version: 6,
  };
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
}

if (failures > 0) {
  throw new Error(
    `${failures} Quality Profile hash${failures === 1 ? "" : "es"} do not match the committed source.`,
  );
}

console.log("Every committed Quality Profile hash is reproducible.");
