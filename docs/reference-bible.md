# Reference Bible

The visual identity of Real Water's five Demonstration Subjects, and the constraints under which
their Reference Packs are generated.

**Version**: v3, written 2026-08-26 after v2 and every pack it governed were deleted. Section 8
records why.

---

## 0. What this document is, and what it is not

This document constrains **one thing**: what we ask the image service to make.

It does **not** decide whether an image is good enough, and it does **not** decide what the
reconstruction must satisfy. Both of those belong to `img2threejs` (pinned at `v1.5.1`, `dede590`),
and it already enforces them:

| | Owner | Where |
|---|---|---|
| What to generate — world, palette, materials, scale, per-asset identity | **This document** | here |
| Whether an image may be admitted as a reference | `img2threejs` | `grimoire/intake/validation_rubric.md`, `forge/stage1_intake/check_reference_admission.py` |
| What the reconstruction must satisfy | `img2threejs` | the Loop, `SKILL.md` steps 1–12 |

**v2 died of ignoring this split.** Its §5 both specified a background colour (ours to say) and
declared that colour acceptable (not ours to say). The declaration was never linked to the code
that actually judges acceptability, so the two drifted until a white superstructure at
`(230,232,235)` sat `8.8` away from a `(237,237,237)` background — below the `24.0` floor in
`extract_pbr_evidence.py:252` — and the mask classified the entire vessel as background. Four
recorded passes of Tier 1 results were computed on that mask and had to be voided.

Every pixel-facing constraint in section 6 therefore **cites the skill line it serves**. When the
skill changes, the citation goes stale visibly instead of the constraint going wrong quietly.

---

## 1. World

Contemporary offshore research and rescue. Working vessels and working equipment, in service, used
but maintained. Grounded realism at the level of a documentary photograph.

Excluded: military, historical sail, science fiction, cartoon, post-apocalyptic, luxury yachting.

---

## 2. Palette and roles

| Colour | Role | Where it appears |
|---|---|---|
| Graphite | Structural and mechanical mass | Deck fittings, machinery, frames, rails, hardware, submerged structure, crate banding and corner castings |
| Warm grey | Weathered neutral ground | Hull below the waterline band, concrete, rock, worn composite |
| Matte white | Primary superstructure | Wheelhouse, cabin sides, buoy upper body |
| Safety orange | Signal only, never a field colour | Hull stripe, buoy band, grab rails, float collars, markings |

Safety orange is a marking colour. It never becomes the dominant surface of an asset. An image that
returns an object reading as predominantly orange has failed the palette invariant.

---

## 3. Material vocabulary

Salt-worn painted metal · rubber · composite · rope · wet concrete · basalt.

Bronze is permitted for propellers only, and does not enter the palette above.

Wear reads as: chalked paint on sun-facing surfaces, salt bloom in recesses, rust bleed at fastener
lines and weld seams, scuffed rubber, sun-faded rope. Wear is present and legible but never
derelict — every asset is in service.

---

## 4. Scale table

The hero vessel is the scale anchor. Its pack is generated and approved first; every other asset is
sized against it. This ordering is recorded in `docs/adr/0022-generate-consistent-reference-packs-before-procedural-modeling.md`.

| Asset | Length / height | Notes |
|---|---|---|
| Hero vessel | ~14 m | Twin propulsion. Anchors the scale for everything below. |
| Navigation buoy | 2.4 m | Above-water height. |
| Marine crate | 1.2 m | Longest edge. |
| Underwater structure | 8 m | Bounded caustic and volume receiver. |
| Basalt sea stack | 250–300 m | Distant silhouette only; no shoreline. |

---

## 5. What a Reference Pack contains

One directory per asset, outside the repository, at
`/Users/alexnear/rw/reference-packs/<asset>-v001/`.

| File | Purpose |
|---|---|
| `<asset>-anchor-3q-v001.png` | Identity anchor. **Approved before any other view is generated**; every other view derives from it. |
| `<asset>-elev-*-v001.png` | Geometric elevations — **the count follows the subject's symmetry, it is not fixed**; see 5.1 |
| `<asset>-plan-top-v001.png` | Top view — **omitted for the basalt sea stack and for any body of revolution** |
| `<asset>-mat-<material>-v001.png` | Material close-ups, **N per asset** — see section 7 |
| `<asset>-lookdev-wet-v001.png` | Wet look-dev. Material evidence only; not part of the identity. |
| `<asset>-v001.glb` | Placed by hand. See section 5.2. |

### 5.1 The elevation count follows the subject's symmetry

The GLB service needs four views — front, left, right, back. The right elevation is generated for
that purpose only and is **not** delivered to the reconstruction agent.

This is not a workaround. `img2threejs` would refuse it, correctly, and says so:
`check_reference_admission.py:7` lists `a duplicate angle that adds no information` among the four
kinds of junk it exists to reject.

The refusal is **structural, not marginal**. The duplicate check hashes with a DCT pHash whose bits
are thresholded on the **absolute value** of each coefficient (`forge/_shared/image_hash.py:92`).
Mirroring an image flips the sign of the odd horizontal coefficients and leaves their magnitude
untouched, so a mirrored view hashes **identically** — measured Hamming distance `0`, against a
control of `22` for a genuinely different subject, and `0` still holds for a textured, noisy,
deliberately left-weighted test image. Four of our five assets are left-right symmetric, so this
would fire on all of them every time.

**Generating it and then not shipping it is cheaper than shipping it and explaining the rejection
five times.**

The same argument does not stop at mirrors. The duplicate check fires on **any** pair within a
pHash Hamming distance of 6, so a subject with higher symmetry loses more than one view. A **body
of revolution** — the navigation buoy — looks the same from every azimuth, and a single
orthographic elevation already defines the whole revolve curve. Measured on a buoy set generated
before this was understood, `check_reference_admission.py` admitted the three-quarter anchor and
rejected **all four** elevations as near-duplicates.

So the pack carries as many elevations as the subject's symmetry earns, and no more:

| subject symmetry | elevations in the pack |
|---|---|
| none | front, port, back, plan-top (starboard for the GLB service only) |
| bilateral on one axis | front, port, plan-top — **back is a mirror and is rejected too** |
| bilateral on both axes | front, port, plan-top |
| body of revolution | one `elev-profile`, no plan-top |

**The mirror exclusion is wider than the starboard case.** Measured on marine-crate, an unmarked
box with no asymmetric feature: every one of its three elevations hashes at **Hamming 0** against
its own mirror, while the three differ from each other by 14-20.

```
elev-front  vs its mirror   0    rejected
elev-port   vs its mirror   0    rejected
plan-top    vs its mirror   0    rejected
elev-front  vs elev-port   14    admitted
elev-front  vs plan-top    18    admitted
elev-port   vs plan-top    20    admitted
```

So for a subject with no markings and no handed feature, `elev-back` is a duplicate of
`elev-front` and `elev-starboard` a duplicate of `elev-port` — both are excluded from the pack, and
both are generated for the GLB service only. The moment the subject gains an asymmetric feature — a
placard on one face, a hinge, a lifting eye — re-measure; the exclusion no longer holds.

Decide from the symmetry, then **prove it with the gate** — run each candidate view with
`--against` the pHashes of the already-admitted set before it enters the pack. A rejection has two
possible causes and they need different responses: the view really is redundant (shorten the
matrix), or the view should have been distinguishable and the lighting/projection has flattened the
subject into a silhouette (fix that instead — see the Lighting section of the constraint block).

### 5.2 The GLB is part of the pack

The pack is delivered as **one unit**: approved images plus the GLB. Never separately.

The GLB is a **measurement instrument, not pixel evidence**. `SKILL.md` is explicit: the raw GLB is
never pixel evidence, and its topology and materials are never copied into the factory. Labels
derived from it stay `hypothesis-requires-render-confirmation` until a render confirms them
(`forge/stage1_intake/label_glb_nodes.py`).

It is produced by hand outside this pipeline and needs no prompt — only the four elevations.

---

## 6. Image constraints

Two columns. The left is what `img2threejs` will actually enforce; the right is what we ask for.
**The left column is a floor, not a target** — `64 px` means "not a thumbnail", not "64 px is fine".

| Constraint | Skill floor | We ask for | Source |
|---|---|---|---|
| Short side | ≥ 64 px | ≥ 2048 px | `check_reference_admission.py:32` |
| Foreground coverage | 0.05 – 0.97 | 0.15 – 0.45 | `check_reference_admission.py:30-31` |
| Largest connected blob | ≥ 60% of foreground, on a 96×96 grid | ≥ 95% | `check_reference_admission.py:33,35` |
| Subject ↔ background distance | > `max(24.0, background_noise × 2.4)` | > 60, RGB Euclidean | `extract_pbr_evidence.py:252` |
| Background uniformity | (not checked) | four-corner spread ≤ 2 | derived — see below |
| Duplicate views | pHash Hamming > 6 vs any admitted view | no two admitted views may be mirrors | `check_reference_admission.py:34`, `image_hash.py:92` |

### 6.1 Background is specified relative to the subject, never as an absolute colour

The skill has no opinion about background colour. It only requires that the subject stand far
enough from it. So this document must not name one colour for all five assets — v2 did, and that is
what broke.

| Asset | Dominant subject value | Background |
|---|---|---|
| Hero vessel | Matte white superstructure | **Dark or saturated.** A light neutral is the v2 failure. |
| Navigation buoy | Matte white spherical float | **Dark or saturated.** |
| Marine crate | Warm grey body, graphite hardware | Light neutral is fine |
| Underwater structure | Wet concrete, graphite | Light neutral is fine |
| Basalt sea stack | Warm grey to graphite | Light neutral is fine |

The four-corner uniformity requirement exists because the admission mask estimates the background
by sampling corners. A gradient background makes that estimate wrong everywhere else in the frame.

### 6.2 Elevations must be orthographic, and this is not machine-checked

`an elevation is orthographic: no perspective, every visible edge vertical or horizontal, nothing
receding.`

**Nothing in the skill tests this.** v2 stated the same rule and three plates approved under it were
perspective renders — the near columns each showed a second, receding column body inside them, which
orthographic projection cannot produce. The rule was right and unenforced for the whole of v2.

Since no gate will catch it, the check is a named human step, with a decisive test:

> In an orthographic view with a small azimuth error, a far element appears **outside** the near one
> on one side and **inside** on the other — it swaps sides. Under perspective it converges toward
> the principal point and appears **inside on both sides**. Inside on both sides means perspective.

---

## 7. Material close-ups: no fixed number

`grimoire/intake/quality_contract.md:5`, first line of the file:

> Do not use fixed domain profiles. Assess the object from observed traits, complexity, and target
> fidelity.

So this document sets **no count**. After all geometric views for an asset exist, the generating
agent enumerates every distinct material the asset actually shows and requests one close-up each.
Floor of 2; **no ceiling**; split as finely as the asset warrants.

**Under-supplying them is not a small loss.** Material count is an input to the complexity tier
(`quality_contract.md:33-36` — `simple` is "one or two materials", `complex` is "multiple
materials"), the tier sets `targetMinDetails`, and `--strict-quality` blocks code generation until
that many details are enumerated. Too few close-ups therefore pushes an asset into a lower fidelity
tier, **silently**, and every later gate is judged against the lowered bar.

---

## 8. Asset specifications

`Fixed` is not renegotiated by any view. A view that contradicts it is regenerated, never
reconciled.

### Hero vessel — ~14 m, twin propulsion

**Fixed**: hard-hulled working vessel; wheelhouse forward; open working aft deck; twin propulsion
with **propellers below the waterline**; matte white superstructure; safety orange hull stripe;
graphite deck fittings, rails, and machinery.

Runtime sockets the reconstruction must expose: bow, stern, propeller, wake, and Interaction Anchor.
Their semantics are fixed by the proxy vessel (`reference-proxy-vessel.ts`, still shipping) and are
not renegotiated by the visual replacement.

### Navigation buoy — 2.4 m

**Fixed**: floating navigation buoy; spherical matte white float body on a tapered neck, with a
single safety orange band around its widest point; graphite fittings including a lifting eye on the
neck; a graphite navigation lantern in a protective cage at the very top.

The lantern is fixed here rather than left to the anchor: a navigation buoy without a light is not
one.

A graphite ballast keel hangs beneath the hull on a short central shaft, its mass concentrated in a
weight at the bottom. No floating view can show it; it is fixed in advance so that generation does
not invent a different one per view.

### Marine crate — 1.2 m

**Fixed**: closed marine shipping crate; composite or timber body in warm grey; graphite corner
hardware and banding; no markings, no stencilled text.

Two graphite skids run the full length of the underside, lifting the body clear of whatever it rests
on. They set the crate's floating attitude and its waterline. Fixed in advance for the same reason
as the buoy's keel.

### Underwater structure — 8 m

**Fixed**: submerged receiver structure with clear semantic regions; wet concrete and graphite;
biological growth limited to what does not obscure the silhouette. It is a caustic and volume
receiver, so its upper surfaces must read as broad and continuous.

A broad flat concrete deck runs across the top, unbroken except where the instrument bay opens.
"Clear semantic regions" is an acceptance criterion of `#39`, so the regions are fixed here rather
than reinvented per view.

### Basalt sea stack — 250–300 m

**Fixed**: columnar basalt sea stack; warm grey to graphite; **no beach, no shoreline, no vegetation
mass**. Distant silhouette and reflection subject only.

**There is no waterline band.** v3 required one — "a single horizontal dark stain running unbroken
around the whole stack, darker than the rock above it and free of weed" — and it was retracted on
2026-08-28 after seven generation attempts across three separate levers failed to produce it and the
columnar rock together. Measured, every attempt landed in one of three failure modes:

```
geometric wording ("razor-sharp", "like a painted line")
    -> a level band, and the columnar relief destroyed: fine flat stripes on a smooth cylinder,
       the band itself a flat area with the texture wiped out of it
material wording ("the stone itself is dark through", "wet zone")
    -> the columnar relief kept, and the band dissolved into a bottom-to-top gradient with no
       boundary, or a blotchy patch dark on one side and pale on the other
editing an accepted render (silhouette IoU 0.9854 -- the edit did NOT re-render the subject)
    -> a level unbroken band, rendered as a collar of separate material strapped around the tower,
       the columns not running through it
```

The columnar relief is what only pixels can carry; the band's height, depth and tone were prompt
parameters being read back. So the band goes and the rock stays. The base continues straight down as
the same columnar rock, without flaring into a plinth or a skirt of debris.

**This is the one asset with no top view** — it is a distant silhouette and is not reconstructed at
part level.

---

## 9. What v2 got wrong

Kept because each of these cost a full round, and none of them is obvious in hindsight.

1. **A background colour was specified as an absolute and declared acceptable in prose.** The
   acceptance test lived in code that had never heard of the prose. Superseded by section 6.1.

2. **The elevation rule was stated and never enforced.** Three plates approved under it were
   perspective renders. Superseded by section 6.2, which names the human check and gives it a
   decisive test rather than restating the rule.

3. **The document owned acceptance and reconstruction rules the skill already owned.** Two
   authorities for one question is one authority too many. Superseded by section 0.

4. **A fixed count of three material close-ups.** The skill's own first line forbids fixed profiles,
   and a fixed count silently caps the complexity tier. Superseded by section 7.

5. **One side elevation, chosen without recording why.** The pack matrix had port and no starboard.
   That was correct for the reconstruction consumer and wrong for the GLB consumer, and nothing in
   the document said which consumer it was written for. Superseded by section 5.1.
