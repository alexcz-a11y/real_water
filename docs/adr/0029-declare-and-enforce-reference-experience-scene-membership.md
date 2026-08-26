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

What the check keys on is not free, and the obvious key is wrong. The production build
minifies, so identifiers do not survive it: in the built tree `createReferenceProxyVessel` and
`REFERENCE_PROXY_VESSEL_NAME` each appear zero times while the proxy vessel is fully composed
into the scene, and the string literal `"Reference proxy vessel"` appears eight times. The hand
measurement recorded on the #49 merge — grep the built output for `basalt` and
`BasaltSeaStack`, zero hits — therefore reached a true conclusion through a reading that cannot
separate an unwired Subject from a minified one, and mechanizing that reading would commit the
wrong evidence as a gate. Each Subject declares instead a string-literal identity that survives
minification, and that identity must exist on the composition path alone: a literal that also
appears in a QA-only route or in preset data stays present after the Subject is removed from
the scene, which is a green check standing over the exact defect the check exists to prevent.
The check therefore ships with a negative control — removing one Subject from the scene
assembly must turn it red — and that demonstration is evidence the ticket owes, not an
assumption about the key.

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
