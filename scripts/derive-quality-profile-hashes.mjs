import { createHash } from "node:crypto";

import { createMinimalWaterQualityProfile } from "../packages/real-water/dist/quality-profile.js";

// Canonical field order is a versioned decision. profileHash is deliberately
// excluded: schema, version, id, surface, interaction, bodyCoupling, temporal,
// reflection.
const CANONICAL_QUALITY_PROFILE_FIELDS = Object.freeze([
  "schema",
  "version",
  "id",
  "surface",
  "interaction",
  "bodyCoupling",
  "temporal",
  "reflection",
]);

let failed = false;
for (const id of ["minimal", "minimal-high-detail"]) {
  const profile = createMinimalWaterQualityProfile(id);
  const canonical = Object.fromEntries(
    CANONICAL_QUALITY_PROFILE_FIELDS.map((field) => [field, profile[field]]),
  );
  const derived = `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")}`;
  console.log(
    `${id}\n  source:  ${profile.profileHash}\n  derived: ${derived}`,
  );
  if (derived !== profile.profileHash) {
    failed = true;
  }
}

if (failed) {
  throw new Error("A Quality Profile hash does not match its canonical JSON.");
}
