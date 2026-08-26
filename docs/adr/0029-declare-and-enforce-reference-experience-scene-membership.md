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
measures the built application rather than the file list.

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
it compiles and its unit tests pass. Only a measurement of the built application separates the
two cases. The hand grep on the #49 merge is what found this, and it is not that measurement:
it reached a true conclusion by a reading that cannot tell an unwired Subject from a minified
one.

## Consequences

The check asserts that every declared Demonstration Subject is reachable from the production
entry point of the built application. It belongs beside
`scripts/check-reference-production.mjs` and fails when the declared population comes back
empty. A preview page must never satisfy it: preview pages are not entry points, which is
precisely how 1133 approved lines shipped nothing.

What the check keys on is deliberately left to whoever builds it, and this record does not
prescribe a method. Four candidate methods were tried against the merged tree and all four
failed, each for a reason the previous attempt did not suggest. They are written down because
the next reader will think of at least two of them.

**Identifiers in the built bundle.** The build minifies. `createReferenceProxyVessel` and
`REFERENCE_PROXY_VESSEL_NAME` each appear zero times while the proxy vessel is fully composed
into the scene. The measurement's subject is rewritten by the build.

**The exact declared string value.** The build also rewrites quote style: the source declares
`"Reference proxy vessel"` and the bundle carries `` `Reference proxy vessel` ``, so an
exact-value search over a wired Subject returns zero. Same failure, second form.

**A count of the identity literal's text.** Of the eight occurrences of `Reference proxy vessel`
in the bundle, exactly one is the identity constant. Six are error messages inside the vessel
module, and the eighth is a substring of an unrelated sentence in `reference-sandbox-controls.ts`
— a module that neither imports the constant nor creates a vessel; the text merely collides.
Run as a negative control — remove the vessel from the scene assembly, empty `dist/`, rebuild —
the count went from eight to one rather than to zero. The measurement returns a number, and the
number is mostly about error prose.

**The production module graph.** Not a text search, and immune to all three failures above: an
entry-chunk module list separates a wired Subject from an unwired one. It still fails the
negative control. `main.ts` imports two values from the vessel module, `createReferenceProxyVessel`
and `REFERENCE_PROXY_VESSEL_SOCKETS`, so removing the composition leaves the second import
holding the module in the graph. This is a property of Subject modules rather than an accident:
a Subject exports more than its factory, and any surviving export keeps it reachable.

The shape those four share is the finding, and it is the shape this project keeps meeting: there
is no proxy readable off the build product that answers "did anyone place it". Every attempt
measures something the build controls, something adjacent to the question, or something one
level coarser than the question. Two of the four returned a plausible number while wrong, which
is the dangerous kind. The direct measurement — ask the running scene which Subjects it contains
— has not been tried, costs a browser, and is not decided here.

What is fixed is the evidence standard rather than the method. The check must ship with both
controls run and retained: with every Subject composed it is green, and with one Subject removed
from the scene assembly it is red with that Subject's count at **zero**. The removal must take
away the composition, not the module — deleting the file passes trivially and proves nothing.
Both runs start from an emptied `dist/`, because a failed build leaves the previous build's
output in place and every count then reads normal. A method that cannot produce that pair is not
eligible, whatever it measures.

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
