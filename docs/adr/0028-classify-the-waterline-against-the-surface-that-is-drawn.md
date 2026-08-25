# Classify the waterline against the surface that is drawn

Waterline classification sampled the spectral ocean alone. `waterline-state.ts` called
`evaluateSpectralSurface` at the camera position and derived a signed distance from that height,
so the Local Interaction field — the wakes, radial impacts, and propeller wash that make up the
other half of the surface actually presented — was absent from the decision. The surface being
drawn composes both, and #33 found the divergence while wiring caustics: its criterion is
`classify(previous, ds) != classify(previous, ds - δ)` against the `WATERLINE_ENTER_METRES` /
`WATERLINE_EXIT_METRES` band of 0.08 m / 0.18 m, and the QA harness's constructed amplitude of
0.59662134662614952 m already exceeds that band by roughly seven times. We decide that waterline
classification takes its signed distance from the same composed surface the frame draws: the
spectral ocean plus the Local Interaction field, evaluated at the camera position for the frame
being presented.

The decision that made this an ADR rather than an edit is that the spectral-only policy is
#31/#32's settled, merged behaviour, and #33 was correct to write the divergence up rather than
act on it. What the handoff framed as three options is really two, because the third — one
shared Prepared Surface authority behind one interface — cannot exist as stated. The prepared
surface consumers do not share an execution domain. The sampler the caustics graph reads
(`spectral-bands-rendering.ts`, `surfaceSampler.sampleSurface`) is a TSL node function closing
over GPU uniforms; waterline classification is CPU scalar arithmetic that must resolve inside
the same tick as its own `preview`/`commit` hysteresis. One implementation serving both would
require either a GPU readback, whose latency destroys same-tick classification, or a CPU
composition of the same math. The CPU composition is what the codebase already does, twice:
`evaluateSpectralSurface` in `spectral-bands.ts` is a CPU mirror of the TSL spectral evaluation
sharing its constants, and `evaluateLocalCorrection` in `local-interaction.ts` is a complete CPU
evaluation of the Local Interaction field — radial impacts, directional wakes, propeller wash,
and the Interaction Anchor edge fade — already composed with the spectral result to serve every
Gameplay Query. The correct answer to "where does the waterline get its surface from" was
therefore already implemented and simply not reachable from `waterline-state.ts`.

That CPU composition becomes the single definition of where the surface is, exported rather than
module-private, and `applyQueries` is rewired to call the same exported evaluator it currently
calls privately. This is the whole of the structural change: the waterline controller's interface
does not grow a sampler parameter, no `PreparedSurface` module is created, and the composition
gains locality by having exactly one definition rather than by acquiring a name.

## Considered options

**Introduce a shared Prepared Surface authority.** Rejected on two independent grounds, and the
first is a fact about the code rather than a preference. It is not implementable as one authority:
the prepared surface exists as TSL nodes bound to GPU uniforms and as CPU scalars, and no single
implementation spans them without a readback that breaks same-tick classification. What the option
could actually deliver is a named CPU interface over the composition — which is what this decision
delivers without the name. On the second ground, there is one prepared surface implementation and
one prepared-surface consumer chain; a seam is hypothetical until something varies across it, and
nothing does. If a second prepared surface implementation ever appears — a simplified surface under
a lower Quality Profile, or a non-Three backend — this rejection should be re-examined, because the
ground it rests on will have moved.

**Contain the divergence inside T22.** Rejected because the consumer set is six, not two.
`lens-wetness-post-traa-stage.ts`, `minimal-water-prewarm.ts`, `prepared-water-presentation.ts`,
`underwater-caustics-rendering.ts`, `underwater-volume-rendering.ts`, and
`water-optics-rendering.ts` all read the classification; only the caustics graph reads the prepared
surface. Containment fixes one consumer and leaves five switching on a surface other than the one
presented, with no consumer aware of it. It does not fully fix even that one: the caustics graph
takes `signedDistanceMetres` as a uniform while sampling the prepared surface, so the divergence
is present inside the single consumer the option targets. An earlier lean toward this option was
given before the consumer set was read and is withdrawn rather than overruled.

**Align the waterline to the Gameplay Query snapshot instead of the frame.** Rejected. Reusing the
published query snapshot would make buoyancy and the waterline agree by construction, but that
snapshot is permitted to lag the current tick — `applyQueries` reports the lag as `snapshotAge`
rather than eliminating it. The classification's job is to decide whether the frame is drawn above
or below water, so it must agree with the frame; the query path's one-tick allowance is its own
published contract and is not inherited here. The waterline therefore composes against the
render-side disturbance data for the frame being presented, at that frame's time.

## Consequences

The 0.08 m / 0.18 m thresholds and the hysteresis carried through `committed` are #31/#32's settled
behaviour and are unchanged by this decision. Composing the Local Interaction field changes the
distribution of the signed distance fed to `classifyWaterline` without changing the constants; if
#40's evidence shows the hysteresis destabilising under the new distribution, that is a new
decision and not a detail of this one.

Two CPU-side hazards belong to the implementing ticket. The render-side snapshot emits every
occupied disturbance slot and lets the shader window each one by age, while the query-side snapshot
filters by activity before publishing; a CPU evaluation over render-side data must apply the same
windowing the shader applies, or it will accumulate expired disturbances. And the query path
resolves manual and body disturbance times separately, where the frame path has a single time, so
the shared evaluator takes the sample time per disturbance rather than assuming one clock.

CPU-to-GPU parity is not demonstrated by this decision. Proving that the composed CPU surface
agrees with the drawn surface requires running the reference experience, which the GPU hold
forbids in the session that produced this ADR, and the existing `evaluateSpectralSurface` mirror
carries no parity test today either. The implementing ticket lands CPU-side regression coverage
over the composition; parity evidence against the drawn frame is #40's obligation, where the
complete visual and temporal quality matrix is enforced.

One divergence heals as a side effect: the caustics graph's `signedDistanceMetres` uniform now
carries the same surface its `sampleSurface` calls read, so the option-3 symptom disappears without
option 3 being implemented.

`CONTEXT.md` gains **Waterline**, **Prepared Surface**, and **Local Interaction Field**. The
glossary already ruled on this case without naming it: **Gameplay Query** is defined as an
observation "expected to agree perceptually with the rendered surface", and the classification is
that kind of observation. The three terms were absent, which is how one phrase came to denote two
different surfaces across the consumer chain.
