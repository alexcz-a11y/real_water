const { createMinimalWaterPrewarmManifest, createMinimalWaterQualityProfile } =
  await import("../packages/real-water/dist/index.js");

const drawingBuffer = Object.freeze({ width: 320, height: 180 });
const profileIds = ["minimal", "minimal-high-detail"];
const populations = profileIds.map((profileId) => ({
  profileId,
  declarations: createMinimalWaterPrewarmManifest(
    createMinimalWaterQualityProfile(profileId),
    drawingBuffer,
  ).declarations,
}));

for (const { profileId, declarations } of populations) {
  if (declarations.length === 0) {
    throw new Error(
      `Declaration label check received an empty ${profileId} population.`,
    );
  }
}

const declarationsByLabel = new Map();
for (const { profileId, declarations } of populations) {
  for (const declaration of declarations) {
    const populationEntry = { profileId, ...declaration };
    const siblings = declarationsByLabel.get(declaration.label);
    if (siblings === undefined) {
      declarationsByLabel.set(declaration.label, [populationEntry]);
    } else {
      siblings.push(populationEntry);
    }
  }
}

const violations = [...declarationsByLabel.entries()].filter(
  ([, declarations]) =>
    new Set(declarations.map(({ fingerprint }) => fingerprint)).size > 1,
);

if (violations.length > 0) {
  console.error(
    `Declaration label rule failed for ${violations.length} label${
      violations.length === 1 ? "" : "s"
    }:`,
  );
  for (const [label, declarations] of violations) {
    console.error(`  ${JSON.stringify(label)}`);
    for (const { profileId, id, fingerprint } of declarations) {
      console.error(`    ${profileId}/${id}: ${fingerprint}`);
    }
  }
  process.exit(1);
}

console.log(
  `Declaration labels distinguish all fingerprints across ${populations
    .map(({ profileId, declarations }) => `${profileId}=${declarations.length}`)
    .join(", ")}.`,
);
