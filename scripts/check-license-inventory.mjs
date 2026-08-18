import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(".");
const inventoryPath = join(root, "docs", "licenses", "dependencies.json");
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const approvedLicenses = ["Apache-2.0", "MIT", "MPL-2.0"];
const inventoryScope =
  "Direct external dependencies declared by workspace package manifests.";

const inventory = await readJson(inventoryPath);
const manifestPaths = [
  join(root, "package.json"),
  ...(await childPackageManifests("apps")),
  ...(await childPackageManifests("packages")),
];
const packages = new Map();

for (const manifestPath of manifestPaths) {
  const manifest = await readJson(manifestPath);
  const workspace = relative(root, manifestPath);

  for (const field of dependencyFields) {
    const declarations = manifest[field] ?? {};
    for (const [name, specifier] of Object.entries(declarations)) {
      if (typeof specifier !== "string" || specifier.startsWith("workspace:")) {
        continue;
      }

      const installed = await readInstalledPackage(dirname(manifestPath), name);
      if (installed.name !== name) {
        throw new Error(
          `${workspace}: dependency alias ${name} resolves to ${String(installed.name)}; record aliases explicitly before accepting them.`,
        );
      }
      if (typeof installed.version !== "string") {
        throw new Error(`${workspace}: ${name} has no installed version.`);
      }
      if (typeof installed.license !== "string") {
        throw new Error(
          `${workspace}: ${name}@${installed.version} needs one SPDX license string.`,
        );
      }
      if (!approvedLicenses.includes(installed.license)) {
        throw new Error(
          `${workspace}: ${name}@${installed.version} uses unapproved license ${installed.license}.`,
        );
      }

      const key = `${name}@${installed.version}`;
      const declaration = `${workspace}#${field} (${specifier})`;
      const existing = packages.get(key);
      if (existing === undefined) {
        packages.set(key, {
          name,
          version: installed.version,
          license: installed.license,
          declaredBy: [declaration],
        });
      } else {
        existing.declaredBy.push(declaration);
      }
    }
  }
}

const expectedPackages = [...packages.values()]
  .map((entry) => ({
    ...entry,
    declaredBy: entry.declaredBy.sort(compareText),
  }))
  .sort(
    (left, right) =>
      compareText(left.name, right.name) ||
      compareText(left.version, right.version),
  );
const assets = validateAssets(inventory.assets);
const expectedInventory = {
  schemaVersion: 1,
  scope: inventoryScope,
  approvedLicenses,
  packages: expectedPackages,
  assets,
};

if (JSON.stringify(inventory) !== JSON.stringify(expectedInventory)) {
  throw new Error(
    "docs/licenses/dependencies.json is stale or non-canonical. Review the dependency or asset license, then update the inventory to match the installed frozen workspace.\n\nExpected inventory:\n" +
      JSON.stringify(expectedInventory, null, 2),
  );
}

console.log(
  `License inventory check passed: ${expectedPackages.length} direct third-party packages and ${assets.length} third-party assets.`,
);

async function childPackageManifests(directory) {
  const absoluteDirectory = join(root, directory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(absoluteDirectory, entry.name, "package.json"))
    .sort(compareText);
}

async function readInstalledPackage(manifestDirectory, name) {
  const dependencyPath = [...name.split("/"), "package.json"];
  const candidates = [
    join(manifestDirectory, "node_modules", ...dependencyPath),
    join(root, "node_modules", ...dependencyPath),
  ];

  for (const candidate of new Set(candidates)) {
    try {
      return await readJson(candidate);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error(
    `${relative(root, manifestDirectory)}: ${name} is not installed; run the frozen install before checking licenses.`,
  );
}

function validateAssets(candidate) {
  if (!Array.isArray(candidate)) {
    throw new Error("License inventory assets must be an array.");
  }

  const paths = new Set();
  const assets = candidate.map((asset) => {
    if (
      typeof asset !== "object" ||
      asset === null ||
      typeof asset.path !== "string" ||
      typeof asset.source !== "string" ||
      typeof asset.license !== "string"
    ) {
      throw new Error(
        "Every third-party asset needs string path, source, and license fields.",
      );
    }
    if (paths.has(asset.path)) {
      throw new Error(`Duplicate third-party asset path: ${asset.path}`);
    }
    if (!approvedLicenses.includes(asset.license)) {
      throw new Error(
        `${asset.path}: third-party asset uses unapproved license ${asset.license}.`,
      );
    }
    paths.add(asset.path);
    return {
      path: asset.path,
      source: asset.source,
      license: asset.license,
    };
  });

  return assets.sort((left, right) => compareText(left.path, right.path));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
