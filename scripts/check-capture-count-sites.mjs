// Count sites prove only that every repeated count agrees with the registry.
// Exact-name sites additionally prove that the five complete repeated lists
// preserve every registry member in registry order. Neither check can prove
// that DIAGNOSTICS_CAPTURE_NAMES itself is the correct product contract.

import { readFile } from "node:fs/promises";

const DIAGNOSTICS_PATH = "packages/real-water/src/diagnostics.ts";
const MANIFEST_PATH = "packages/real-water/src/manifest.ts";

// The checker uses an explicit site list today. Any future repository-wide
// scan must preserve these exclusions so generated copies cannot pose as source.
const REPOSITORY_SCAN_EXCLUSIONS = [
  "dist",
  "dist-types",
  "*.tsbuildinfo",
  "node_modules",
  ".scratch",
];

// These values share an old capture count by coincidence. They must not change
// in a count sweep. README.md intentionally also has a real count site below:
// one file can contain both a count and a non-count.
const DO_NOT_TOUCH = [
  [
    "apps/reference-experience/src/reference-proxy-vessel.test.ts",
    "34 ms step and timestamps",
  ],
  [
    "apps/reference-experience/src/reference-simulation-controller.test.ts",
    "34 ms catch-up timing",
  ],
  [
    "docs/adr/0009-certify-native-with-a-frozen-repeatable-benchmark.md",
    "p99 <= 34 ms pass condition",
  ],
  ["docs/research/native-quality-baseline.md", "<= 34.0 ms measurement"],
  ["README.md", "Ticket #34 is an issue number, not a quantity"],
];

const NUMERIC_SITES = [
  [
    "apps/reference-experience/src/qa-frame-driver.test.ts",
    "QA frame prewarm capture assertion",
    /expect\(QA_FRAME_PREWARM_MANIFEST\.captures\)\.toHaveLength\((\d+)\)/gu,
  ],
  [
    "apps/reference-experience/e2e/optical-path.spec.ts",
    "optical baseline capture assertion",
    /expect\(Object\.keys\(result\.baseline\.captures\)\)\.toHaveLength\((\d+)\)/gu,
  ],
  [
    "apps/reference-experience/e2e/qa-harness.spec.ts",
    "QA capture-version array",
    /new Array<number>\((\d+)\)\.fill\(QA_CAPTURE_VERSION\)/gu,
  ],
  [
    "apps/reference-experience/e2e/regression-acceptance.ts",
    "regression prewarm capture guard",
    /QA_FRAME_PREWARM_MANIFEST\.captures\.length !== (\d+)/gu,
  ],
  [
    "apps/reference-experience/e2e/regression-acceptance.ts",
    "regression capture-mapping error",
    /Regression acceptance requires the exact QA v\d+ (\d+)-name capture mapping\./gu,
  ],
  [
    "apps/reference-experience/e2e/regression-acceptance-evidence.ts",
    "evidence capture-mapping error",
    /Regression acceptance requires the exact QA v\d+ (\d+)-name capture mapping\./gu,
  ],
  [
    "apps/reference-experience/e2e/regression-acceptance-evidence.ts",
    "evidence prewarm capture guard",
    /QA_FRAME_PREWARM_MANIFEST\.captures\.length !== (\d+)/gu,
  ],
  [
    "apps/reference-experience/e2e/regression-acceptance-evidence.ts",
    "evidence capture-contract error",
    /capture contract must name exactly (\d+) outputs/gu,
  ],
  [
    "apps/reference-experience/test/regression-acceptance-evidence.test.ts",
    "serialized prewarm capture assertion",
    /expect\(document\.qaPrewarmManifest\?\.manifest\.captures\)\.toHaveLength\((\d+)\)/gu,
  ],
  [
    "packages/real-water/test/three-host.test.ts",
    "Three host diagnostics output assertion",
    /expect\(all\.outputs\)\.toHaveLength\((\d+)\)/gu,
  ],
  [
    "scripts/package-smoke.mjs",
    "packed diagnostics capture guard",
    /DIAGNOSTICS_CAPTURE_NAMES\.length !== (\d+)/gu,
  ],
];

const PROSE_SITES = [
  [
    "packages/real-water/src/diagnostics.ts",
    "diagnostics registry summary",
    "The ",
    " named diagnostic outputs",
  ],
  [
    "packages/real-water/src/diagnostics.ts",
    "diagnostics capture-name TSDoc",
    "the ",
    " named diagnostic CPU",
  ],
  [
    "packages/real-water/src/diagnostics.ts",
    "diagnostics capture-name guard TSDoc",
    "the ",
    " diagnostic capture names",
  ],
  [
    "packages/real-water/test/diagnostics.test.ts",
    "diagnostics registry test title",
    "the ",
    " frozen CPU capture",
  ],
  [
    "packages/real-water/test/quality-profile.test.ts",
    "named-output declaration label",
    '"',
    " named diagnostics output routes",
  ],
  [
    "packages/real-water/test/quality-profile.test.ts",
    "completion-probe declaration label",
    "all ",
    " named output routes",
  ],
  [
    "README.md",
    "README diagnostics output summary",
    "conversion, ",
    " named diagnostics",
  ],
];

// manifest.ts is intentionally absent from the text patterns above. Its
// declarations are constructed at runtime, so a regex would count a proxy
// population. These two logical sites are read from both built manifests.
const MANIFEST_LABEL_SITES = [
  [
    "water-named-output-routes",
    "named-output declaration label",
    "",
    " named diagnostics output routes",
  ],
  [
    "water-completion-probe",
    "completion-probe declaration label",
    "all ",
    " named output routes",
  ],
];

// These close the alias chain from the QA Harness back to the registry. Keep the
// trailing semicolon so a prefix of a longer assignment cannot satisfy a site.
const WIRING_SITES = [
  [
    "apps/reference-experience/src/qa-frame-contract.ts",
    "QA frame capture-name alias",
    /export const QA_FRAME_CAPTURE_NAMES\s*=\s*DIAGNOSTICS_CAPTURE_NAMES\s*;/gu,
  ],
  [
    "apps/reference-experience/src/qa-harness.ts",
    "QA Harness capture-name alias",
    /export const QA_HARNESS_CAPTURE_NAMES\s*=\s*QA_FRAME_CAPTURE_NAMES\s*;/gu,
  ],
];

// These are the complete literal repetitions of DIAGNOSTICS_CAPTURE_NAMES.
// Partial lists and generated documentation are intentionally excluded. The
// selectors describe the surrounding expectation, so line shifts and other
// arrays in the same test do not change which site is checked.
const EXACT_NAME_SITES = [
  {
    path: "packages/real-water/test/diagnostics.test.ts",
    label: "diagnostics capture-name contract",
    matcher: "toEqual",
    subjectPath: "DIAGNOSTICS_CAPTURE_NAMES",
  },
  {
    path: "apps/reference-experience/e2e/qa-harness.spec.ts",
    label: "QA Harness contract capture names",
    matcher: "toEqual",
    subjectPath: "contract",
    property: "captureNames",
  },
  {
    path: "apps/reference-experience/e2e/qa-harness.spec.ts",
    label: "QA presentation capture names",
    matcher: "toMatchObject",
    subjectPath: "result.first.presentation",
    property: "captureNames",
  },
  {
    path: "apps/reference-experience/e2e/qa-harness.spec.ts",
    label: "QA captured output names",
    matcher: "toEqual",
    subjectCall: "result.first.captures.map",
    mappedProperty: "name",
  },
  {
    path: "apps/reference-experience/e2e/optical-path.spec.ts",
    label: "optical captured output names",
    matcher: "toEqual",
    subjectPath: "result.names",
  },
];

const SMALL_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS_WORDS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];
const SCALE_WORDS = [
  "",
  "thousand",
  "million",
  "billion",
  "trillion",
  "quadrillion",
];

console.log(
  `Future repository-wide scans must exclude: ${REPOSITORY_SCAN_EXCLUSIONS.join(", ")}.`,
);
console.log("NOT capture counts; leave unchanged:");
for (const [path, reason] of DO_NOT_TOUCH) {
  console.log(`  ${path}: ${reason}`);
}

const { default: ts } = await import("typescript");
const cache = new Map();
const sourceFileCache = new Map();
const failures = [];
const truthNames = await readDiagnosticsCaptureNames();
const truth = truthNames.length;
const truthWord = integerToEnglish(truth);

for (const [path, label, pattern] of NUMERIC_SITES) {
  const matches = [...(await source(path)).matchAll(pattern)];
  if (matches.length !== 1) {
    failures.push(cardinalityFailure(path, label, matches.length));
    continue;
  }
  const token = matches[0][1];
  const value = Number(token);
  if (!Number.isSafeInteger(value) || String(value) !== token) {
    failures.push(
      `${describe(path, label)} has invalid integer ${JSON.stringify(token)}.`,
    );
  } else if (value !== truth) {
    failures.push(
      `${describe(path, label)} states ${value}; DIAGNOSTICS_CAPTURE_NAMES has ${truth}.`,
    );
  }
}

for (const [path, label, prefix, suffix] of PROSE_SITES) {
  const body = await source(path);
  const observed = tokensBetween(body, prefix, suffix);
  if (observed.length !== 1) {
    failures.push(cardinalityFailure(path, label, observed.length));
    continue;
  }
  // Do not use \b here: it matches a stale word inside a hyphenated number.
  const expected = new RegExp(
    `${escapeRegExp(prefix)}(?<![\\w-])${escapeRegExp(truthWord)}(?![\\w-])${escapeRegExp(suffix)}`,
    "giu",
  );
  if ([...body.matchAll(expected)].length === 1) {
    continue;
  }
  failures.push(
    `${describe(path, label)} states ${JSON.stringify(observed[0])}; DIAGNOSTICS_CAPTURE_NAMES has ${truth} (${JSON.stringify(truthWord)}).`,
  );
}

const runtimeManifests = await supportedManifests();
for (const [id, label, prefix, suffix] of MANIFEST_LABEL_SITES) {
  const observed = [];
  let malformed = false;
  for (const { profileId, manifest } of runtimeManifests) {
    const declarations = manifest.declarations.filter(
      (declaration) => declaration.id === id,
    );
    if (declarations.length !== 1) {
      failures.push(
        `${describe(MANIFEST_PATH, label)} matched ${declarations.length} declarations in ${profileId}; expected exactly one.`,
      );
      malformed = true;
      continue;
    }
    const tokens = tokensFromLabel(declarations[0].label, prefix, suffix);
    if (tokens.length !== 1) {
      failures.push(
        `${describe(MANIFEST_PATH, label)} matched ${tokens.length} anchors in the ${profileId} runtime manifest; expected exactly one.`,
      );
      malformed = true;
      continue;
    }
    observed.push([profileId, tokens[0]]);
  }
  if (
    !malformed &&
    observed.some(([, token]) => token.toLowerCase() !== truthWord)
  ) {
    failures.push(
      `${describe(MANIFEST_PATH, label)} states ${observed
        .map(([profileId, token]) => `${profileId}=${JSON.stringify(token)}`)
        .join(
          ", ",
        )}; DIAGNOSTICS_CAPTURE_NAMES has ${truth} (${JSON.stringify(truthWord)}).`,
    );
  }
}

for (const [path, label, pattern] of WIRING_SITES) {
  const matches = [...(await source(path)).matchAll(pattern)];
  if (matches.length !== 1) {
    failures.push(cardinalityFailure(path, label, matches.length));
  }
}

for (const site of EXACT_NAME_SITES) {
  const matches = await exactNameExpectations(site);
  if (matches.length !== 1) {
    failures.push(cardinalityFailure(site.path, site.label, matches.length));
    continue;
  }
  const result = namesFromExpectation(matches[0], site);
  if (result.failure !== undefined) {
    failures.push(`${describe(site.path, site.label)} ${result.failure}`);
    continue;
  }
  if (result.names.length !== truthNames.length) {
    failures.push(
      `${describe(site.path, site.label)} has ${result.names.length} names; DIAGNOSTICS_CAPTURE_NAMES has ${truthNames.length}.`,
    );
    continue;
  }
  const mismatch = result.names.findIndex(
    (name, index) => name !== truthNames[index],
  );
  if (mismatch !== -1) {
    failures.push(
      `${describe(site.path, site.label)} has ${JSON.stringify(result.names[mismatch])} at index ${mismatch}; DIAGNOSTICS_CAPTURE_NAMES has ${JSON.stringify(truthNames[mismatch])}.`,
    );
  }
}

const countSiteCount =
  NUMERIC_SITES.length + PROSE_SITES.length + MANIFEST_LABEL_SITES.length;
console.log(
  `Capture-count source: ${DIAGNOSTICS_PATH} DIAGNOSTICS_CAPTURE_NAMES has ${truth} (${JSON.stringify(truthWord)}).`,
);
console.log(
  `Checked ${countSiteCount} count sites, ${EXACT_NAME_SITES.length} exact-name sites, and ${WIRING_SITES.length} capture-name wiring anchors.`,
);

if (failures.length === 0) {
  console.log(
    "Capture counts, exact-name lists, and wiring agree with DIAGNOSTICS_CAPTURE_NAMES.",
  );
} else {
  console.error(
    `Capture consistency check failed with ${failures.length} problem${failures.length === 1 ? "" : "s"}:`,
  );
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exitCode = 1;
}

async function readDiagnosticsCaptureNames() {
  const declarations = collectNodes(
    await sourceFile(DIAGNOSTICS_PATH),
    (node) =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "DIAGNOSTICS_CAPTURE_NAMES",
  );
  if (declarations.length !== 1) {
    throw new Error(
      `${DIAGNOSTICS_PATH}: found ${declarations.length} DIAGNOSTICS_CAPTURE_NAMES declarations; expected exactly one.`,
    );
  }

  const initializer = unwrap(declarations[0].initializer);
  if (
    initializer === undefined ||
    !ts.isCallExpression(initializer) ||
    !ts.isPropertyAccessExpression(initializer.expression) ||
    !ts.isIdentifier(initializer.expression.expression) ||
    initializer.expression.expression.text !== "Object" ||
    initializer.expression.name.text !== "freeze" ||
    initializer.arguments.length !== 1
  ) {
    throw new Error(
      `${DIAGNOSTICS_PATH}: DIAGNOSTICS_CAPTURE_NAMES is no longer one Object.freeze(array) source of truth.`,
    );
  }
  const array = unwrap(initializer.arguments[0]);
  if (
    array === undefined ||
    !ts.isArrayLiteralExpression(array) ||
    array.elements.length === 0 ||
    array.elements.some(
      (element) =>
        !ts.isStringLiteral(element) &&
        !ts.isNoSubstitutionTemplateLiteral(element),
    )
  ) {
    throw new Error(
      `${DIAGNOSTICS_PATH}: DIAGNOSTICS_CAPTURE_NAMES must be a non-empty literal string array.`,
    );
  }
  return array.elements.map((element) => element.text);
}

async function exactNameExpectations(site) {
  return collectNodes(await sourceFile(site.path), (node) =>
    isSelectedExpectation(node, site),
  );
}

async function sourceFile(path) {
  if (!sourceFileCache.has(path)) {
    sourceFileCache.set(
      path,
      ts.createSourceFile(
        path,
        await source(path),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      ),
    );
  }
  return sourceFileCache.get(path);
}

function collectNodes(root, predicate) {
  const matches = [];
  visit(root);
  return matches;

  function visit(node) {
    if (predicate(node)) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  }
}

function isSelectedExpectation(node, site) {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== site.matcher
  ) {
    return false;
  }
  const expectCall = unwrap(node.expression.expression);
  if (
    expectCall === undefined ||
    !ts.isCallExpression(expectCall) ||
    !ts.isIdentifier(expectCall.expression) ||
    expectCall.expression.text !== "expect" ||
    expectCall.arguments.length !== 1
  ) {
    return false;
  }
  const subject = unwrap(expectCall.arguments[0]);
  if (site.subjectPath !== undefined) {
    return propertyPath(subject) === site.subjectPath;
  }
  if (
    subject === undefined ||
    !ts.isCallExpression(subject) ||
    propertyPath(unwrap(subject.expression)) !== site.subjectCall
  ) {
    return false;
  }
  return (
    site.mappedProperty === undefined ||
    mapsDestructuredProperty(subject, site.mappedProperty)
  );
}

function mapsDestructuredProperty(call, name) {
  if (call.arguments.length !== 1 || !ts.isArrowFunction(call.arguments[0])) {
    return false;
  }
  const callback = call.arguments[0];
  if (
    callback.parameters.length !== 1 ||
    !ts.isObjectBindingPattern(callback.parameters[0].name) ||
    callback.parameters[0].name.elements.length !== 1
  ) {
    return false;
  }
  const binding = callback.parameters[0].name.elements[0];
  return (
    binding.propertyName === undefined &&
    ts.isIdentifier(binding.name) &&
    binding.name.text === name &&
    ts.isIdentifier(callback.body) &&
    callback.body.text === name
  );
}

function namesFromExpectation(expectation, site) {
  if (expectation.arguments.length !== 1) {
    return { failure: "must pass exactly one expected value to the matcher." };
  }
  let value = unwrap(expectation.arguments[0]);
  if (site.property !== undefined) {
    if (value === undefined || !ts.isObjectLiteralExpression(value)) {
      return {
        failure: `must use an object literal containing ${site.property}.`,
      };
    }
    const properties = value.properties.filter(
      (property) =>
        ts.isPropertyAssignment(property) &&
        propertyName(property.name) === site.property,
    );
    if (properties.length !== 1) {
      return {
        failure: `contains ${properties.length} ${site.property} properties; expected exactly one.`,
      };
    }
    value = unwrap(properties[0].initializer);
  }
  if (value === undefined || !ts.isArrayLiteralExpression(value)) {
    return { failure: "must use a literal capture-name array." };
  }
  if (
    value.elements.some(
      (element) =>
        !ts.isStringLiteral(element) &&
        !ts.isNoSubstitutionTemplateLiteral(element),
    )
  ) {
    return { failure: "must contain only literal strings." };
  }
  return { names: value.elements.map((element) => element.text) };
}

function propertyPath(expression) {
  const value = unwrap(expression);
  if (value === undefined) {
    return undefined;
  }
  if (ts.isIdentifier(value)) {
    return value.text;
  }
  if (!ts.isPropertyAccessExpression(value)) {
    return undefined;
  }
  const prefix = propertyPath(value.expression);
  return prefix === undefined ? undefined : `${prefix}.${value.name.text}`;
}

function propertyName(name) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }
  return undefined;
}

function unwrap(expression) {
  let current = expression;
  while (
    current !== undefined &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

async function supportedManifests() {
  let api;
  try {
    api = await import("../packages/real-water/dist/index.js");
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      throw new Error(
        "Capture-count manifest labels require built runtime declarations; run pnpm typecheck first.",
        { cause: error },
      );
    }
    throw error;
  }
  return ["minimal", "minimal-high-detail"].map((profileId) => ({
    profileId,
    manifest: api.createMinimalWaterPrewarmManifest(
      api.createMinimalWaterQualityProfile(profileId),
    ),
  }));
}

function tokensFromLabel(value, prefix, suffix) {
  const starts = [];
  if (prefix.length === 0) {
    starts.push(0);
  } else {
    let cursor = 0;
    for (;;) {
      const start = value.indexOf(prefix, cursor);
      if (start === -1) {
        break;
      }
      starts.push(start + prefix.length);
      cursor = start + prefix.length;
    }
  }

  const tokens = [];
  for (const start of starts) {
    let cursor = start;
    for (;;) {
      const end = value.indexOf(suffix, cursor);
      if (end === -1) {
        break;
      }
      tokens.push(value.slice(start, end));
      cursor = end + suffix.length;
    }
  }
  return tokens.filter((token) => token.length > 0);
}

function tokensBetween(body, prefix, suffix) {
  const tokens = [];
  let cursor = 0;
  for (;;) {
    const end = body.indexOf(suffix, cursor);
    if (end === -1) {
      return tokens;
    }
    const start = body.lastIndexOf(prefix, end);
    if (start !== -1) {
      tokens.push(body.slice(start + prefix.length, end));
    }
    cursor = end + suffix.length;
  }
}

function integerToEnglish(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Cannot spell non-negative safe integer ${String(value)}.`);
  }
  if (value === 0) {
    return SMALL_WORDS[0];
  }
  const groups = [];
  let remaining = value;
  let scale = 0;
  while (remaining > 0) {
    const group = remaining % 1000;
    if (group > 0) {
      if (scale >= SCALE_WORDS.length) {
        throw new Error(`No English scale word for ${String(value)}.`);
      }
      groups.unshift(
        [underOneThousand(group), SCALE_WORDS[scale]]
          .filter((word) => word.length > 0)
          .join(" "),
      );
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  return groups.join(" ");
}

function underOneThousand(value) {
  const words = [];
  let remaining = value;
  if (remaining >= 100) {
    words.push(SMALL_WORDS[Math.floor(remaining / 100)], "hundred");
    remaining %= 100;
  }
  if (remaining >= 20) {
    const tens = TENS_WORDS[Math.floor(remaining / 10)];
    const ones = remaining % 10;
    words.push(ones === 0 ? tens : `${tens}-${SMALL_WORDS[ones]}`);
  } else if (remaining > 0) {
    words.push(SMALL_WORDS[remaining]);
  }
  return words.join(" ");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function source(path) {
  if (!cache.has(path)) {
    cache.set(path, await readFile(path, "utf8"));
  }
  return cache.get(path);
}

function cardinalityFailure(path, label, count) {
  return `${describe(path, label)} matched ${count} sites; expected exactly one, because a missing or ambiguous site is not checked.`;
}

function describe(path, label) {
  return `${path}: ${label}`;
}
