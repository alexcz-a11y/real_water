# Third-party license inventory

`dependencies.json` records every direct external dependency declared by a
workspace package manifest, including development and peer dependencies. The
public `real-water` package bundles no dependency; Three.js remains a peer.

`pnpm check:licenses` compares the committed inventory with the exact packages
resolved by the frozen workspace and rejects stale entries, undeclared license
changes, dependency aliases, and licenses outside the reviewed SPDX allowlist.
The lockfile continues to freeze the transitive development graph.

Third-party assets must be added manually to the `assets` array with their
repository path, source, and reviewed SPDX license. A dependency, license, or
asset change therefore requires an explicit inventory diff before CI passes.
