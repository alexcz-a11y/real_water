# Reconstruction — basalt sea stack, v001

Ticket #49 (T28b). Rebuilds the approved Reference Pack `docs/reference-packs/basalt-sea-stack-v001.md`
as a code-only procedural Three.js model under `apps/reference-experience`, through the
`img2threejs` staged pipeline.

The reconstruction's own record is `basalt-sea-stack-v001.sculpt.json` beside this file: the
`ObjectSculptSpec` with every measurement, assumption, revision note and pass review. The committed
spec passes `validate_sculpt_spec.py --strict-quality` as committed.

Pixels — renders, comparison sheets and geometry dumps — stay outside the repository, for the same
reason ADR-0022 keeps the pack pixels out: the text is the evidence a published MIT package can
carry. They are **retained beside the pack pixels they were compared against**, at
`~/rw/reference-packs/basalt-sea-stack/reconstruction-v001/`, and hashed below so the record and the
files stay tied together. The working directory this was produced in
(`.img2threejs/`) is gitignored scratch and is not the retained copy.

| | |
|---|---|
| Delivered module | `apps/reference-experience/src/reference-basalt-sea-stack.ts` |
| Tests | `apps/reference-experience/src/reference-basalt-sea-stack.test.ts` |
| Review page (dev only) | `apps/reference-experience/preview-basalt-sea-stack.html` + `src/preview/basalt-sea-stack-preview.ts` |
| Serve it on | port **5185**, `--strictPort` |
| Build passes | all 8 complete: blockout, structural, form-refinement, material, surface, lighting, interaction, optimization |
| Budget | 31 920 triangles / 40 000 · 10 draw calls / 12 · **0 textures** |

```bash
pnpm exec vite apps/reference-experience --port 5185 --strictPort
# then http://localhost:5185/preview-basalt-sea-stack.html
#   ?view=anchor-3q|front|side|back   review viewpoints
#   &capture=1                        hides all DOM chrome (every gate capture uses this)
#   &scene=1                          water plane + fog + shadow, for the reflection-edge review
#   &maps=off                         material-stripped, for the blockout gate's evidence
```

## What the model is

One connected field of **266 vertical basalt prisms** inside a terraced, near-radial envelope,
generated from a seeded jittered-hex Voronoi lattice. Model space is metres and **the origin is on
the waterline**: `y = 0` is the top edge of the dark stain, which is where the scene's water plane
meets the stack. Place the group at water height and the reflection joins the model on a level line.

Static by `docs/reference-bible.md` §10. `userData.tick` exists and does nothing — the hook keeps
the runtime hierarchy uniform with the animated assets, and the empty body is the record that
static was a decision, not an omission.

## Measurements the model is built from

All measured on the approved pack pixels, whose eight sha256 prefixes were verified against the
pack record before anything was read.

| Quantity | Value | Source |
|---|---|---|
| Above-water height | 275 m | Bible §4's 250–300 m, mid-band |
| Maximum radius | 134 m | anchor: above-water height / max diameter = 1.026 |
| Submerged depth | 84 m | anchor's own proportion below the stain boundary (0.307) |
| Mean column width | 15.0 m (5.6 % of diameter) | joint counting on three views (4.0–6.7 %, median 5.0); autocorrelation at matched resolution put the reference at 5.65 % |
| Height courses | 9 | width-gradient ledge peaks on the anchor, mean spacing 0.11 of height |
| Envelope profile | 20 (u, r/R) points | anchor silhouette width, 1st/99th percentile over a 9-row window |
| Dry basalt albedo | `#615d5c` | `extract_pbr_evidence` de-lit dominant, confidence 0.86 |
| Wet basalt albedo | `#29231c` | dry albedo × the measured lit ratio (49,40,30)/(116,107,99) |
| Bleached top albedo | `#868488` | dry albedo × the measured tops/faces ratio 128/92, shifted cool |

## The waterline, and how it is proven

Bible §10 makes the waterline the edge the water reflection reads from, so it must be level,
unbroken, and identical from every view. It is guaranteed twice over and **measured on geometry,
before any renderer is involved**:

- the geometry is **cut at exactly `y = 0`**, so the wet/dry boundary is a mesh boundary;
- the shading boundary is a function of **world Y alone**, so it cannot follow the column steps.

`vertex_region_gate.py` classifies **100 % of 95 760 vertices** against the three-colour palette and
puts the stained region's top edge at normalised **y = 0.7663 at all eight azimuths, identical to four decimals**
against a 0.01 tolerance. The dry region's bottom edge is the same plane.

## Gates

### Applicable, and passing

| Gate | Result |
|---|---|
| `validate_sculpt_spec.py --strict-quality` | PASS |
| `generate_threejs_factory.py` (fail-closed) | wrote the factory at blockout and structural-pass |
| `diagnose_render.py` Tier 1 — **anchor** | PASS · IoU 0.8507 · aspect Δ 0.032 · scale Δ 0.032 · symmetry err 0.041 · max ΔE 2.41 |
| `diagnose_render_multi_angle.py` | non-degenerate · area ratios 1.149 / 1.093 / 0.885 |
| `turntable_gate.py` (4 distinct azimuths) | PASS · covered, non-degenerate, no interior holes, segmentation reliable |
| `vertex_region_gate.py` (8 azimuths, with expectations) | PASS · delta 0.0000 · 0 unclassified |
| `check_part_coverage.py` | PASS · 15 specified, 15 built, 0 errors, 0 warnings, 0 unnamed meshes |
| `interior_difference.py` | measured over 30 277 cells, no fallback warnings |
| `make_comparison_sheet.py` + agent vision | 8 pass reviews recorded in `reviewHistory` |
| vitest regression suite | 10 tests |

### Applicable, and NOT passing

**`self_intersection.py` — `selfIntersecting: true`, 143 of 31 566 sampled vertices (0.45 %).**
Not claimed as a pass. Three genuine defects it exposed were found and fixed:

1. **every mesh was wound inside-out** — signed volume negative on all ten, which pointed the
   explicit normals into the solid and inverted `normalWorld.y`, the input the bleached-top
   material layer keys on;
2. **the joint inset was radial, not a polygon offset** — a vertex moved toward the centroid
   retreats its edges by only `d·cos θ`, so neighbouring columns kept touching whatever the groove
   was set to;
3. **the meshes were open at the cut plane** — ray parity through an open bottom is undefined, so a
   clean verdict would have been meaningless either way.

The residual was not isolated. It is thinly spread (about one vertex per column) and concentrated
on above-water columns rather than the simpler submerged ones, but a diagnostic that removed the
chamfer made it 4.6× worse, so the chamfer is not the cause.

### Applicable, with a caveat worth stating

**Tier 1's IoU threshold sits inside this subject's noise band.** Sweeping one parameter (the
vertical arris width) gave IoU 0.8498 at 0.12, 0.8506 at 0.09 and 0.8484 at 0.07 — non-monotonic
across the 0.85 line. For a silhouette this broken up, the third decimal is noise, and the pass at
0.8507 is not evidence of more fidelity than a fail at 0.8498.

**Tier 1 against the three elevations fails** (IoU 0.63–0.73, scale Δ 0.23–0.29) and is **not**
treated as a model defect. Those three views disagree with the anchor on above-water height over
diameter by 1.24, 1.65 and 1.80 against 1.02, and the pack record rules the anchor authoritative for
proportion and the elevations "evidence for column arrangement only". A silhouette-IoU/scale gate is
a proportion gate, so running it against a view the pack itself declares non-authoritative for
proportion measures the pack's internal disagreement, not the model. The numbers are recorded rather
than suppressed.

### Not applicable, and why

| Gate | Why it does not apply |
|---|---|
| **Top-down comparison of any kind** | **No approved top view exists.** Bible §6 omits it for this asset *by design* — the stack is a distant silhouette and reflection subject and is not reconstructed at part level — so this pack has eight approved views, not nine. There is nothing to compare a top-down render against. `mat-summit-tops` is the closest thing that exists, and the pack record rules its part shapes indicative and only its materials authoritative. Multi-angle review still applies in full and ran on four horizon-level viewpoints, because the form is non-planar. |
| Projection-first fidelity — `solve_camera_pose.py`, `delight_albedo.py`, `bake_projected_texture.py` | No patterned or reference-matched surface. The finish is procedural weathered basalt, not a decal, livery or CS2 skin, and the repository forbids unverified textures (ADR-0022). Material fidelity was routed through `analyze_texture.py` + `extract_pbr_evidence.py` instead, at 0.86 extraction confidence. |
| `cs2_review.py` and the CS2 intake contract | Wrong family — this is a natural landform, not a CS2 item. |
| Character track: `extract_landmarks.py`, `humanoid_proportions.py`, `scalp_exposure.py`, `hair_gate.py`, `validate_rig_payload.py` | `objectClass.primaryDomain` is `object`. No anatomy, no hair, no skeleton. |
| `validate_chirality` / `medial_lateral_bias` | No `-l`/`-r` pairs. The form is near-radial with no mirror plane, and the spec says so rather than asserting a symmetry it does not have. |
| `swept_arc_gate.py` | No curve claim anywhere in the spec. |
| `attachment_anchor.py` | No child appendages. The model is one connected field, so `parentSocket` / `localStart` / `localEnd` / `contactType` / `embedDepth` have no subject. There are no mid-air parts because there are no separable parts to float. |
| `decimate.py` / offline LOD tiers | Inside budget at the near tier (31 920 of 40 000 triangles). The LOD plan is specified, not implemented. |

**What `check_part_coverage.py` proves, in the skill's own words:** it *"proves you built what you
specified, never that you specified enough."* It compares the built tree against the spec and the
spec against the detail inventory; it cannot invent domain knowledge intake never captured. A
15-of-15 pass here means the fifteen named parts exist and none are fused — not that fifteen is the
right decomposition. For this asset the part granularity is **column groups and height courses, not
individual columns**, which is the granularity ticket T28b fixes because the stack is not
reconstructed at part level.

## Remaining differences

Honest list. None of these are claimed as done.

1. **Summit plateau.** At u = 1.00 the render is 0.038 of maximum width against the reference's
   0.208 — the top row is one or two spires where the anchor holds a small plateau. Two fixes were
   tried and measured: more spires with a smaller bonus moved it 0.054 → 0.038, and normalising
   height on the 97th percentile of column tops instead of the maximum left the summit at 0.038
   *and* pushed total H/W from 1.315 to 1.404. Both reverted rather than bought at the price of the
   authoritative proportion.
2. **Terrace shelf depth.** About 0.7 of a column deep against the reference's two to four. The
   radius step per shelf is the taper divided by the course count, so deepening it means fewer
   courses — and seven courses leaves `course-8` with no columns, no mesh, and a part-coverage
   failure. Left at nine.
3. **Face contrast.** The reference's column faces carry strong light and dark blotches; the meso
   band is present but gentler, so faces read closer to flat between their joint lines. Raising it
   washes out the joint darkening, which is the more identity-relevant of the two — a real trade,
   taken deliberately.
4. **No surface relief at all.** This pipeline emits no textures, so relief that is not geometry has
   no representation. The reference's face-scale spall and fracture relief is absent; spall rides
   the roughness channel only and is not legible.
5. **Exposure by azimuth.** Back and side views sit at rock luma 83.5 and 89.1, just under the
   reference's measured 92 floor, because the key light is fixed in world space.
6. **`self_intersection` residual**, above.
7. **Column width is matched to the reference, not to geology.** 15 m columns on a 268 m diameter is
   what the approved anchor shows; real basalt columns are 0.3–3 m. The pack is the contract. This
   is a recorded departure, not an error.

## Assumptions

Three of these are low confidence and are the ones to challenge first.

| Assumption | Confidence | Basis |
|---|---|---|
| Bible §4's 250–300 m is **above-water** height | 0.70 | A sea stack's height is conventionally measured above sea level, and "distant silhouette only" is the above-water part. The buoy row says "Above-water height" explicitly; this row does not. |
| Maximum diameter 268 m, from the anchor's H/D of 1.026 | 0.85 | Makes the asset a monolith rather than a slender stack — which is what the approved anchor shows, and the generating album is named "The Monolith of Basalt". The pack record makes the anchor authoritative for proportion. |
| Submerged depth 84 m | **0.40** | The anchor's own proportion below the stain. No view shows the shaft terminating; Bible §10 fixes its character, not its depth. |
| The dark band covers the whole submerged shaft; `stainRiseMetres` defaults to 0 | **0.35** | Every view crops or fades before the band's lower edge, so only its **top** edge is evidence. Exposed as a review parameter for the human approver to settle. **If the approver moves it off 0, write the chosen value into `BASALT_SEA_STACK_FIELD`, the sculpt spec and this row** — otherwise the decision lives only in someone's memory of the review. |
| Summit plan arrangement | **0.45** | Generated from the field statistics. Bible §6 omits the top view by design, so there is nothing to compare it against. |

## One conflict found in the pack, and how it was settled

**Only the front elevation carries the level, chromatic waterline stain.** Measured across the
boundary, at native resolution, object pixels only:

| view | luma above → below | R−B above → below | saturation above → below | character |
|---|---|---|---|---|
| front elevation | 99 → **65** | +4.1 → **+16.7** | 0.045 → **0.177** | hard, level, ~5 px of a 3400 px silhouette |
| anchor | 90 → 67 | +1.3 → **−0.4** | 0.045 → 0.052 | diffuse, follows the column steps |
| back elevation | 88 → 66 | +1.6 → **+0.8** | 0.033 → 0.036 | diffuse, follows the column steps |
| side elevation | 118 → 82 | +1.7 → **+0.7** | 0.025 → 0.033 | diffuse, follows the column steps |

Luminance alone drops in all four, so a luminance-only reading calls them the same. The **chroma**
reading separates them: the front elevation *gains* warmth and saturation across the boundary — a
colour change, i.e. a stain — while the other three *lose* warmth, which is what shading does.

This contradicts the pack record, which states the region edit "produced the level stain that all
three elevations derive from". The approved anchor's own pixels (hash verified) show the pre-edit
character the record describes as rejected. **Reported to the pack owner rather than reconciled by
eye.** It changes nothing about the model: Bible §10 outranks any approved image and requires one
level, unbroken, sharp band regardless, so the front elevation and `mat-waterline` are the evidence
for how it looks and the other three contribute nothing to it.

## Retained comparison evidence

`~/rw/reference-packs/basalt-sea-stack/reconstruction-v001/`, sha256 first 16:

| File | What it is | sha256 (first 16) |
|---|---|---|
| `render-anchor-3q.png` | Review render — identity anchor, three-quarter (the authoritative view) | `a5223f353dc8c998` |
| `render-front.png` | Review render — front orthographic | `2580cc7d5d9fcb31` |
| `render-side.png` | Review render — side orthographic | `343f70344de4e9e8` |
| `render-back.png` | Review render — back orthographic | `8feb3f01fc50f512` |
| `render-az270.png` | Review render — azimuth 270, the turntable gate's fourth angle | `7b513841053f4f37` |
| `render-mapstripped-anchor-3q.png` | Material-stripped render, the blockout gate's required evidence | `bb78147cc0aeea0e` |
| `cmp-anchor-3q.png` | Comparison sheet — anchor | `60b32c1f98d85e78` |
| `cmp-front.png` | Comparison sheet — front | `8b3856e4b0c04e64` |
| `cmp-side.png` | Comparison sheet — side | `85259b0a03268de5` |
| `cmp-back.png` | Comparison sheet — back | `776dcac450e7ce0b` |
| `scene-participation.png` | Scene participation — water plane, fog, shadow, level reflection edge | `5962986688b2f1d0` |
| `geometry.json` | World-space vertices, normals and colours of all ten meshes (gate input) | `43e1fe5e3023b0bb` |
| `parts.json` | Runtime part-tree dump (`check_part_coverage` input) | `487bec81ae2bafed` |
| `part-coverage.json` | `check_part_coverage` findings | `65bf7591bdfdf65f` |
| `turntable.json` | `turntable_gate` findings | `14fc216057c7e1c7` |
| `self-intersection.json` | `self_intersection` findings, including the unresolved residual | `50ac34536b6f4b6b` |
| `palette.json` | Vertex-colour palette (`vertex_region_gate` input) | `01b85162e13f7b99` |
| `waterline-expect.json` | Waterline expectation the region gate is run against | `3267d3a5bd91033c` |

The per-pass evidence for the eight build passes, and the review history that cites it, live in the
committed sculpt spec's `reviewHistory`.

## The limit of all of this

Every deterministic gate above reads a 2D image or a vertex array. A model can hold its silhouette,
its terraces and its waterline from four angles, pass every one of them, and still not read as rock.
Final acceptance is a human looking at the preview page — not a passing gate.
