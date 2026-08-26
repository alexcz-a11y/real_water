# Declare and enforce Reference Experience scene membership

Five reconstruction tickets (#37 hero vessel, #38 navigation buoy, #48 marine crate, #39
underwater structure, #49 basalt sea stack) each deliver a **Demonstration Subject**, and
nothing places any of them in the scene the quality claims are evaluated against. The gap is
older than the tickets: the spec's asset arc ends at "reconstructed as independently verified
code-only procedural models" and never reaches "composed into the Reference Experience", so no
ticket derived from it inherited the obligation. We define **Scene Participation** as a
declared property of each Subject — which Reference Experience modes it is composed into and
what water behavior it carries in each — hold ADR-0006's quality claims to Subjects whose
declared participation is satisfied, and enforce the declaration with a committed check that
measures the built tree rather than the file list.

Participation is per-Subject rather than uniform. The buoy and the crate are Sandbox
participants with a Body lease; the underwater structure is a caustic and volume receiver
reachable only below the Waterline; the sea stack is a distant reflection, shadow, fog, and
horizon target with no lease at all. A single Subject may declare different behavior in
Director, Sandbox, and QA modes, but all three modes are composed from one scene assembly:
the frame a human approves and the frame a gate measures must not be two different scenes.

## Considered options

**Compose every Subject into every mode.** Rejected. It charges the Director's surface route
for an underwater-only structure and gives the horizon subject a lease it has no use for, and
it states the participation contract at a granularity that cannot express what #38 and #39
already ask for in their own words.

**Fold placement into #40 (T29)'s acceptance criteria.** Rejected. T29 is a gates ticket.
Placement changes the first-frame path and invalidates every committed capture baseline, so a
T29 that also re-bakes its own baselines cannot fail honestly — the one property a gates ticket
must have.

**Add a "reachable in the Reference Experience" criterion to each of the five reconstruction
tickets.** Rejected, and rejected on evidence rather than on taste. #49 already carried a
criterion of exactly that shape — "It participates in reflection, shadow, scene fog, and
horizon composition" — and merged with its 1133 lines unreachable from the production entry
point. Beyond that, `apps/reference-experience/src/main.ts` is the single assembly point and
five concurrent branches would all edit it.

**State the obligation in prose and trust review to catch it.** Rejected. The defect's
signature is that an unwired module is indistinguishable from a verified one by reading source:
it sits under `src/`, has tests, types clean, and passes every green gate — which say only that
it compiles and its unit tests pass. Only a measurement on the built output separates the two
cases, and that measurement is the one a human already had to perform by hand to find this.

## Consequences

The check asserts that every declared Demonstration Subject is reachable from the production
entry point of the built application. It belongs beside
`scripts/check-reference-production.mjs` and fails when the declared population comes back
empty. A preview page must never satisfy it: preview pages are not entry points, which is
precisely how 1133 approved lines shipped nothing.

What the check keys on is not free, and a text search over the built bundle cannot answer this
question at all. Three separate reasons, each measured on a build of the merged tree rather
than reasoned from the config. First, the build minifies, so identifiers do not survive:
`createReferenceProxyVessel` and `REFERENCE_PROXY_VESSEL_NAME` each appear zero times while the
proxy vessel is fully composed into the scene. Second, the build rewrites quote style, so even
an exact-value search fails: the source declares `"Reference proxy vessel"` and the bundle
carries `` `Reference proxy vessel` ``. Third, and fatally, the text that does match is
dominated by prose that says nothing about composition. Of the eight occurrences of `Reference
proxy vessel` in the bundle, exactly one is the identity constant; six are error messages
inside the vessel module itself, and the eighth is a substring of an unrelated sentence in
`reference-sandbox-controls.ts`, a module that never creates a vessel and only names one when
validating its arguments.

The negative control was run rather than assumed. Removing the vessel from the scene assembly
and rebuilding from an emptied `dist/` took the count from eight to one, not to zero, and
restoring it returned it to eight. So a presence test on that text would have stayed green over
a Subject that had been removed — the exact defect the check exists to prevent. The hand
measurement recorded on the #49 merge, grep the built output for `basalt` and `BasaltSeaStack`,
therefore reached a true conclusion through a reading that could not have distinguished the two
cases, and mechanizing it would have committed the wrong evidence as a gate.

The check instead measures the production **module graph**: every declared Subject's module must
appear among the modules of the production entry's chunks. That measurement is immune to all
three failures above, and it is what "reachable from the production entry point" already means.
The build emits no module list today and the app has no Vite config at all, so producing one is
part of the work. The negative control stays an acceptance requirement rather than an
assumption, and it must now reach zero: removing one Subject from the scene assembly turns the
check red.

Reachability is not composition. A module can be in the graph and its Subject still absent from
the frame, which is what the T29 asset-region gates measure. The division is deliberate: this
check answers "did anyone place it", and #40 answers "is it right".

The check measures reachability, not correctness. A Subject can be reachable and still wrong;
this replaces "did anyone place it", not the T29 gates.

Placement moves the committed profile and prewarm hashes and invalidates existing capture
baselines, so it lands after the open temporal and masking defects (#58, #60, #61) and before
#40 (T29) — otherwise a red gate has more than one candidate cause.

#37 is a placement ticket already, by construction: it replaces the visible geometry of the
proxy vessel, which `main.ts` already creates, adds to the scene, attaches to a lease, and
drives from the Showcase schedule. Its boundary with the placement ticket is that #37 owns the
hero vessel's geometry and its five sockets, and the placement ticket owns the other four
Subjects and the shared declaration and check.
