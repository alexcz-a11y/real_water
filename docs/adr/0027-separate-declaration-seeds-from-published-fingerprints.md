# Separate declaration seeds from published fingerprints

`PrewarmDeclaration` carries a `fingerprint`, and until now nothing recorded what it
identified. Two different values were being discussed as one: the **Declaration Seed**, the
arbitrary literal a person writes beside a declaration in source, and the **Declaration
Fingerprint**, the value a Host reads off a built Prewarm Manifest. For most declarations
these are not the same value: the factory composes the seed with the drawing buffer that
declaration is bound to before publishing it, and, by a separate mechanism, the active Quality
Profile selects a different authored value for some declarations. By either route the published
fingerprint already moves with a structural input the label does not carry. We define the
published Declaration Fingerprint as the identity of the declared work under its structural
inputs, not as a stamp of the declaration's label, and the Declaration Seed as a deliberately
meaningless, permanently stable starting value whose only job is to keep one declaration
distinguishable from another.

Seeds for new declarations continue to be minted as `sha256(label)`, which keeps them
reproducible, and the rule that makes that honest is stated positively rather than left to
writing habit: a declaration's label must name every parameter that distinguishes it from a
sibling declaration. That rule is enforced rather than trusted. A committed check must assert
that, across the union of supported Quality Profiles, no two declarations share a label while
carrying different fingerprints. It builds both profiles' manifests at check time, commits no
label or fingerprint literal of its own, and fails when either population comes back empty. It
belongs in `.github/workflows/ci.yml`, not in the `pnpm verify` chain a human runs before a
release. Seeds whose input was never recorded are permanent historical fact: they are never
recomputed and never backfilled, and the comment beside such a value records where the value
came from rather than what it should equal.

## Considered options

**Hash the declared work itself.** Rejected, and the reason is a property of the pinned
dependency rather than a budget, so it should not be re-proposed without first re-checking that
property. Most declarations are conditional routes and effect states whose content is a TSL
node graph or a runtime plan, and for an ordinary node every identity three r185 exposes
defaults to `this.id`: `customCacheKey()` returns it, `getCacheKey()` folds it into its digest,
`getHash()` stringifies it. That id is a module-global allocation counter
(`three/build/three.webgpu.js`: `let _nodeId = 0`, `this.id = _nodeId ++`), so it records where
a node was allocated rather than what it contains — an identical run reproduces it, and one
extra allocation anywhere upstream shifts every id and every key derived from it. Several
further declarations name resources constructed inside stock three addons, against a peer range
wider than the installed copy. The one structured, GPU-free parameter source in this package is
the capability descriptor set, and the creation sites demonstrably do not read it, so hashing it
would fingerprint a claim rather than the work. Publishing a hash of a claim is the failure this
decision exists to prevent, so a partial adoption covering only the resource kind is rejected
for the same reason.

**Declare the fingerprint a stamp of the label.** Rejected because it is already untrue and
adopting it would create collisions rather than describe the code. The high-detail Quality
Profile overrides fingerprints for declarations whose work genuinely differs, and for several
of them the label is byte-identical across profiles; under a label rule those would share one
identity. The first use of that override mechanism changed a fingerprint with no label change
at all, so this is structural rather than an oversight in one delivery.

**Leave the question open and keep minting `sha256(label)`.** Rejected. That is the interim
rule, and it is what allowed a comment scoped explicitly to two values to become a convention
without anyone deciding it.

## Consequences

The published TSDoc for `PrewarmDeclaration.fingerprint` must state one promise and one
explicit non-promise: equal fingerprints mean the same declared work under the same structural
inputs, and they are not evidence that the code preparing that work is unchanged. A
Host-supplied manifest is already held to that value: ingest rejects any declaration whose
kind, label, or fingerprint differs from the plan this build recomputes. What ingest cannot
check is that the committed values describe the work, which is what the label rule and the
check exist for.

Every published `fingerprint` is now named, without renaming any field:
`PrewarmDeclaration.fingerprint` is the Declaration Fingerprint above, and
`HostEnvironmentReflectionDescriptor.fingerprint` is the Radiance Credential, the SHA-256 of
the canonical environment radiance bytes that a Host asserts and Real Water verifies. The
environment work-plan fingerprint is not published; it is a structural hash of that descriptor
and serves as the Declaration Fingerprint of the environment-radiance declaration. It is the
only fingerprint in the field that folds in no Declaration Seed — its inputs are entirely a
description of the declared work — and is the pattern a future content-derived fingerprint
would follow if the dependency ever makes one possible.

The label rule has existing violations, and the check that would catch them does not exist yet.
Both are delivered by #52 rather than here: the affected labels gain the
parameter that distinguishes them, and only then does the check land, because a check added
first turns CI red on a defect that ticket owns. The fingerprints are not re-minted, and none
of the affected values is a hash of its own label, so correcting a label leaves them correct
rather than stale.

The manifest hash covers every declaration and moves on any fingerprint change, but it does
not substitute for the per-declaration check. It collapses every cause into one symptom, and
re-baking it is a legitimate action that removes the only signal that something else moved
with it. It is also not currently compared to its committed value by anything the automated
gate runs, which #53 corrects.

`manifest.ts` has no countable declarations array — it is constructed at runtime — so any
declaration figure obtained by reading the file is a proxy for a different population, and the
places this repository asserts its own declaration count are
`packages/real-water/test/startup.test.ts` and `scripts/package-smoke.mjs`.
