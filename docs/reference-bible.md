# Reference Bible

The shared visual identity, scale, material, palette, lighting, and framing rules that keep every
generated demonstration asset in one world. This document is the invariant block: its Prompt
Invariants section is pasted verbatim into every image-generation session, and its scale table is
the authority every procedural reconstruction cites.

It is a specification, not a mood board and not a decision record. The decision that this document
exists at all lives in ADR-0022.

**Version**: v2, written back after the hero vessel pack was approved. Sections 5, 6 and 11 now
rest on nine approved views rather than on expectation.

## 1. World

Contemporary offshore research and rescue. Working vessels and working equipment, in service, used
but maintained. Grounded realism at the level of a documentary photograph.

Excluded: military, historical sail, science fiction, cartoon, post-apocalyptic, luxury yachting.

## 2. Palette and roles

| Colour | Role | Where it appears |
|---|---|---|
| Graphite | Structural and mechanical mass | Deck fittings, machinery, frames, rails, hardware, submerged structure, crate banding and corner castings |
| Warm grey | Weathered neutral ground | Hull below the waterline band, concrete, rock, worn composite |
| Matte white | Primary superstructure | Wheelhouse, cabin sides, buoy upper body |
| Safety orange | Signal only, never a field colour | Hull stripe, buoy band, grab rails, float collars, markings |

Safety orange is a marking colour. It never becomes the dominant surface of an asset. If an image
returns an object that reads as predominantly orange, it has failed the palette invariant.

## 3. Material vocabulary

Salt-worn painted metal · rubber · composite · rope · wet concrete · basalt.

Bronze is permitted for propellers only. It was missing from v1, which made the first stern
elevation read as a palette violation when it was in fact correct: a real propeller is bronze.
No other part may use it, and it does not enter the palette in section 2.

Wear reads as: chalked paint on sun-facing surfaces, salt bloom in recesses, rust bleed at fastener
lines and weld seams, scuffed rubber, sun-faded rope. Wear is present and legible but never
derelict — every asset is in service.

## 4. Scale table

The hero vessel is the scale anchor. Every other asset is generated after it and sized against it.

| Asset | Length / height | Notes |
|---|---|---|
| Hero vessel | ~14 m | Twin propulsion. Anchors the scale for everything below. |
| Navigation buoy | 2.4 m | Above-water height. |
| Marine crate | 1.2 m | Longest edge. |
| Underwater structure | 8 m | Bounded caustic and volume receiver. |
| Basalt sea stack | 250–300 m | Distant silhouette only; no shoreline. |

## 5. Neutral modelling references

Modelling references and cinematic concept art are separate products and are never mixed in one
pack. Everything a reconstruction reads from must be a neutral modelling reference:

- Seamless plain background, light neutral grey. No environment, no ocean, no sky, no props.
- Soft overcast daylight. Low key-to-fill ratio. No rim lighting, no dramatic shadow, no lens flare.
- **The entire object, bow to stern and keel to masthead, sits inside the frame with visible empty
  margin on all four sides.** Nothing is cropped. (v1 said "fills the frame with even margins" and
  every one of the first four candidates cropped the stern: the model honoured *fills* and dropped
  the margin, which arrived as a subordinate clause. See section 12.)
- Horizon-level camera unless the view is the top view.
- Square framing.
- An elevation is orthographic: no perspective, every visible edge vertical or horizontal, nothing
  receding. Ask for it explicitly — a plain request for a side view returns a shallow three-quarter.
- The whole object is visible. Nothing cropped, nothing occluded, no depth-of-field blur on the subject.
- No motion, no spray, no wake, no crew.

The wet look-dev view is the single exception: it exists to show how the materials read when wet,
and is material evidence only. Geometry is never read from it.

## 6. Views per asset

The reference-side requirements come from `img2threejs`: front, side and back views, a neutral
background, high resolution, and close-ups of material detail
(`grimoire/intake/validation_rubric.md`). Its Pass criteria additionally require that the hidden
side can be reasonably inferred, which is what makes the back view mandatory rather than optional.

| # | View | Vessel | Buoy | Crate | Structure | Island |
|---|---|---|---|---|---|---|
| 1 | Identity anchor — three-quarter | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | Front elevation | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | Side elevation (port / left) | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | Back elevation | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | Top view | ✓ | ✓ | ✓ | ✓ | — |
| 6 | Material close-up ×3 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | Wet look-dev | ✓ | ✓ | ✓ | ✓ | ✓ |

Nine approved views per asset, eight for the island. The island omits the top view: it is a distant
silhouette and is not reconstructed at part level.

The identity anchor is approved before any derivative view is generated. A derivative view that
contradicts the approved anchor is rejected and regenerated; it is never accepted and reconciled
afterwards.

Only the geometric views — anchor, front, side, back, top — become Ingredients of the asset's saved
reference. The material close-ups and the wet look-dev stay out of it: a tight surface crop carries
no identity and pulls later generations toward close-up framing. They belong to the pack, not to the
identity.

Framing defects do not require a re-roll. Extending the canvas in the tool's literal mode preserves
the approved pixels exactly and paints only what was missing. Whatever it paints is invented,
though, so that region is held to a higher standard than the rest of the image — and if the missing
region carries runtime sockets, say so in the pack record.

## 7. Prompt invariants

Repeated in every generation. Where a tool offers persistent instructions, this block goes there
rather than being retyped.

```text
Contemporary offshore research and rescue equipment, in service, used but maintained.
Grounded documentary realism. No military, historical, science-fiction, or cartoon styling.

Palette: graphite for structure and machinery, warm grey for weathered neutral surfaces,
matte white for primary superstructure, safety orange for markings and signal elements only —
never as a dominant surface.

Materials: salt-worn painted metal, rubber, composite, rope, wet concrete, basalt.
Wear is legible but never derelict.

Presentation: seamless plain light neutral grey background, soft overcast daylight,
low key-to-fill ratio, no rim light, no dramatic shadow, no lens flare, no depth-of-field
on the subject. The entire object sits inside the frame with visible empty margin on all four
sides. Nothing is cropped.

Never: brand names, logos, any rendered text or numerals, crew or people, water, spray, wake,
sky, environment, added equipment that is not already present on the approved identity anchor.
```

## 8. Invariants every derivative view must hold

1. **Silhouette** — the outline of the approved anchor, seen from the new angle.
2. **Part count** — no part gained, no part lost.
3. **Proportion** — relative dimensions of every part unchanged.
4. **Material** — every surface keeps the material it had on the anchor.
5. **Palette** — colour roles unchanged; no new colour introduced.
6. **No new equipment** — the model may not invent antennas, hatches, fittings, or markings.

A view that breaks any one of these is rejected regardless of how good it looks.

## 9. Rejections

- Independently prompted angles. Every derivative view derives from the approved anchor.
- Silent identity drift accepted because the new image is more attractive.
- Any claim about geometry on a side no approved view shows. **Before writing that sentence, open
  every view.** "Absent from the view that should have had it" is not "absent from the pack": the
  hero vessel's running gear was recorded as shown by nothing after one elevation was found to have
  dropped it, while the stern elevation had it in full and to measurable precision. **Write "I did
  not find it in" and name the views actually opened, never "no view shows it".** The two read
  identically and the second sends a reconstruction off to build from prose.
- Brands, logos, and generated text or numerals.
- Downloaded art packs, third-party textures, and any asset whose licence is unverified.

## 10. Asset specifications

Fixed at v1 unless the note says provisional. Provisional entries are settled by the approved
identity anchor and written back here.

### Hero vessel — ~14 m, twin propulsion

Fixed: hard-hulled working vessel; wheelhouse forward; open working aft deck; twin propulsion with
propellers below the waterline; matte white superstructure; safety orange hull stripe; graphite deck
fittings, rails, and machinery.

Provisional: wheelhouse profile, aft-deck equipment (davit or A-frame), fender arrangement, window
count and shape.

Runtime sockets the reconstruction must expose: bow, stern, propeller, wake, and Interaction Anchor.
Their semantics are fixed by the proxy vessel and are not renegotiated by the visual replacement.

### Navigation buoy — 2.4 m

Fixed: floating navigation buoy; spherical matte white float body on a tapered neck, with a single
safety orange band around its widest point; graphite fittings, including a lifting eye on the neck;
a graphite navigation lantern in a protective cage at the very top.

The approved anchor introduced the lantern, which the specification had not named. It is kept: a
navigation buoy without a light is not one. Fixed here so that the eight derivative views inherit it
rather than each inventing their own.

The parts the buoy's function requires and no floating view can show. Fixed in advance under §11
so that generation does not get to invent them:

- **A graphite ballast keel hangs beneath the hull on a short central shaft, its mass concentrated
  in a weight at the very bottom.** The buoy's righting moment comes from this weight, so its depth
  below the waterline is a modelling input, not decoration.
- **A single heavy graphite mooring ring is set into the base of the hull directly below the lifting
  eye, with the first links of an anchor chain shackled through it, and the chain hangs from that
  ring alone.** This is the visible mooring hardware named above. Its angular position is fixed here
  because generation does not keep it consistent: derivative views rotate the lifting eye correctly
  and leave the ring where it was, and three of eight candidates dropped the ring entirely and let
  the chain float free. Where an approved view disagrees with this sentence, this sentence wins.
- **The ballast shaft is rigid and the chain is not.** They are separate parts that both hang below
  the hull, and generation repeatedly merges them — hanging the ballast weight on the chain, which
  would leave the buoy with no righting moment at all. The weight is carried by the shaft.
- **A band of dark green-brown biological growth covers the hull from the waterline downward**,
  ending where the ballast shaft begins.

Every buoy view that includes the underwater body shows all of them. The floating anchor view shows
none of them, which is why they are written here rather than discovered mid-pack.

This paragraph said "Three parts" and "all three" above four bullets until 2026-08-25. It was written
with three and broke when a fourth was inserted between them. **The count was correct when written;
what failed was an edit that changed one of two places three lines apart.** Removing the count is not
a style rule — it decouples those two places so that inserting an item is a single edit again.

Two modelling sessions read this paragraph independently and both stopped at the third bullet. The
number does not merely omit the fourth item: it hands the reader a completion signal at the third,
which is a different defect from missing information and is not fixed by reading more carefully.

### Marine crate — 1.2 m

Fixed: closed marine shipping crate; composite or timber body in warm grey; graphite corner
hardware and banding; no markings, no stencilled text.

Three parts the crate's function requires and a three-quarter anchor cannot show. Fixed in advance
under §11:

- **Two graphite skids run the full length of the underside, lifting the body clear of whatever it
  rests on.** They set the crate's floating attitude and the height of its waterline, so their depth
  is a modelling input.
- **A recessed graphite rope becket is set into each end panel.** The crate has to be moved by hand
  or by line, and the beckets are where a rope or a hook takes hold.
- **The lid meets the body on a single continuous seam around all four sides, closed by six graphite
  over-centre clamps — two on each long side and one on each end panel.** The seam is where the
  geometry splits, so its height on the body is fixed here rather than left to whichever view
  happens to show it. The count was written as four per the original guess and corrected to six from
  the approved anchor, which distributed them that way in every candidate.

The lid's hardware is **one scheme running round all four sides of the rim**, not two unrelated
systems, and every piece of it sits at the same quarter positions:

- **Two graphite bands cross the lid across its width, at 0.236 and 0.766 of its length**, ending in
  short stubs at the lid rim. They do not turn down the body. (Measured twice independently on the
  top view: 0.2359 / 0.7643 and 0.2357 / 0.7695.)
- **Each band's stub is the upper hook of an over-centre clamp.** The bands and the clamps are one
  assembly seen from two sides, which is why 2 bands × 2 ends = 4 long-side clamps, plus 1 on each
  end panel, gives the **6** that section 10 already recorded from counting the anchor. The counted
  number and the derived number agree, which is evidence rather than circular reasoning because the
  6 was counted before the relationship was known.
- **Each end panel carries two short graphite tongues on the lid rim, at 0.239 and 0.751 of its
  width.** The same quarter-point layout on the other axis. They stay on the rim: a row scan of the
  top view finds no lengthwise band at all, and a lengthwise band would necessarily show on the lid.
- **One central hinge at the midpoint of one long side**, two round knuckles.
- **One central catch at the midpoint of the opposite long side**, a central raised bar with side ears.

The hinge and the catch appear in the top view and in neither long-side elevation. **They are fixed
here anyway**, on two independent grounds. The functional one: this ticket requires a lid that opens,
and a lid that meets the body on a seam and is held by clamps must be hinged or it is a loose board.
The evidential one, which needs no functional argument at all: **the two fittings are different from
each other and functionally complementary** — a hinge on one side, a catch on the other — and a
generation artefact would have to invent two co-operating pieces on opposite faces to produce that.

**The two elevations are not two witnesses here.** In an orthographic elevation a near-face rim
fitting stands out on the silhouette and a far-face one is invisible, so each elevation speaks only
for its own face. It is one view against one, twice, with no majority either time — and both
elevations were checked at full resolution: the seam is unobstructed and the wood grain is fully
resolved, so their silence is a real absence rather than a limit of the image.

This replaces "and down both long sides", which the approved pixels contradict: the lid bands end at
the rim in the anchor and on the end elevation, and neither long-side elevation carries a vertical
strap. **The difference is geometric, not decorative — the banding is not a U-shaped wrap over three
faces.** The crate carries no painted marking of any colour: safety orange appeared on two anchor
candidates as stripes and bands, which §2 reserves for markings and signal elements — a cargo crate
in this world has neither.

Every crate view that includes the underside or an end panel shows these.

**Correction 2026-08-25 — the skids are not hidden.** This paragraph used to argue that the skids
had to be fixed in advance because the anchor could not show them. The anchor shows both skids
plainly, fork slots and chamfered ends included, and the end elevation photographs them square-on,
so their depth is measurable rather than inferred. The parts above stay fixed here — that was the
right call for the becket depth and the seam height — but **the skid entry is now supported by
pixels, and its confidence goes up rather than staying at "specified, unseen".**

### Underwater structure — 8 m

Fixed: submerged receiver structure with clear semantic regions; wet concrete and graphite;
biological growth limited to what does not obscure the silhouette. It is a caustic and volume
receiver, so its upper surfaces must read as broad and continuous.

The semantic regions are fixed here, because "clear semantic regions" is an acceptance criterion of
`#39` and generation will otherwise invent a different set for every view:

- **A broad flat concrete deck across the top**, unbroken except where the instrument bay opens.
  This is the caustic receiver: it is the reason the asset exists, and nothing may clutter it.
- **A recessed graphite instrument bay set into the deck**, its opening a plain rectangle.
- **Four square concrete legs**, one at each corner, carrying the deck.
- **A single continuous concrete footing slab** joining the legs at the bottom.

Three parts the structure's function requires and a three-quarter anchor cannot show. Fixed in
advance under §11:

- **The underside of the deck is a flat, unbroken concrete soffit.** It bounds the shadowed volume
  between the legs, which is the volume half of "caustic and volume receiver", so it is geometry the
  reconstruction needs and no top-down or horizon-level view reveals.
- **The footing slab's outer edge is chamfered and its underside is flat**, so the structure meets
  the seabed on a definite plane rather than trailing off into it.
- **Biological growth covers the legs and the footing from the slab upward to a little past half the
  legs' clear height, and stops well clear of the deck surface.** The deck stays bare concrete,
  because growth on it would break the continuous receiver surface the asset exists to provide.

  This said "to roughly deck height" until 2026-08-25, which all three approved elevations
  contradict. Measured on the legs' clear height between the deck soffit and the footing: `#39` read
  0.523 with a per-column olive-pixel median, and this pack's owner read 0.553 / 0.573 / 0.604 with a
  different leg-band window. **The magnitudes differ and the reading does not: growth stops a little
  past halfway.** The half of this sentence that carries the acceptance weight is "stops clear of the
  deck" — two candidates were rejected for breaking it and all three approved views satisfy it — so
  the height was a loose upper bound rather than a target. It is now written as what the pixels show,
  because "roughly deck height" would send the next reconstruction to the deck and every approved
  view would then disagree with it.

### Basalt sea stack — 250–300 m

Fixed: columnar basalt sea stack; warm grey to graphite; no beach, no shoreline, no vegetation mass.
Distant silhouette and reflection subject only.

Two things the stack's role requires that a three-quarter anchor cannot show, fixed in advance under
§11:

- **The waterline band is a single horizontal dark stain running unbroken around the whole stack**,
  darker than the rock above it and free of weed. The stack is a reflection subject, so where its
  silhouette meets the water is the part the reflection reads from, and it must not vary by view.
- **The base below the waterline continues straight down as the same columnar rock**, without
  flaring into a plinth or a skirt of debris. Nothing in this world sees it, but the reconstruction
  needs the silhouette to terminate somewhere definite.

This is the one asset with no top view: Bible §6 omits it because the stack is a distant silhouette
and is not reconstructed at part level.

## 11. Three checklists, each covering a different question

Every asset gets all three. Run them at different moments, because they answer different questions:
two compare images against each other, and the third compares the specification against the images.

**After the album closes — every fixed part against every view that should show it.** Walk §10's
fixed-part list for the asset and, for each part, name the approved views whose angle should show it
and confirm it is there. Run it from the specification, not from the images.

This is the check the hero vessel pack did not run, and it cost two approved views (see
`reference-packs/hero-vessel-v001.md`). The reason it is a separate pass is that the other two
checks are driven by *disputes between images*, and **an absent part starts no dispute**: a view
missing the running gear agrees with every view that also cannot see it. Absence is invisible to any
check that compares images to each other; only the specification notices it.

**Before the album opens — what must exist but the anchor cannot show.** List the parts that the
asset's function implies and the chosen anchor angle hides. On the hero vessel this list would have
read: propellers (below the waterline), the fittings the fenders hang from (behind the fenders),
the rudder and shaft struts. Both of the first two were instead discovered mid-pack, when a
generated image produced them and forced a ruling. Writing the list first turns that into a decision
made in advance.

Every asset has such a region: the buoy's underwater ballast and mooring attachment, the crate's
base pallet and closure hardware, the underwater structure's above-water portion and its anchoring
points, the sea stack's submerged base. These are also, repeatedly, where the runtime sockets
attach — the hero vessel's propeller list item carried three of them.

**After each view is approved — what is in the picture that nobody counted.** The generating tool
decomposes an approved image into named regions; read that list against the specification and ask
which named region has no counterpart in it. This is how a stray fitting or an extra fender gets
caught. It is a completeness check, not a component hierarchy: it is a flat set of 2D masks with no
transforms, depth or parenthood, so it must never drive the reconstruction's component structure.

The first list checks what cannot be seen; the second checks what was seen but not counted. Either
one alone misses half.

## 12. How to write a constraint

State what must be present, as the sentence's main clause, and enumerate it. Keep negations to a
short closing list, scoped tightly — "only two things are hidden: X and Y".

A negation defines a forbidden region rather than a target, and the model satisfies it by deleting
more than was asked. This cost two rounds during the hero vessel pack:

- "filling the frame with even margins" produced four cropped candidates.
- "the far-side railing must not be visible" removed the railing entirely, took the winch and deck
  boxes with it, and stretched the hull.

Both were fixed by naming every part that had to stay and hiding exactly two named things.

## 13. When generation forces a decision

A part that the anchor could not show will eventually appear in a derivative view. Settle it the
moment it appears: either write it into section 10 as specification, or remove it. Never leave it
undecided, because an undecided part drifts differently in every later view and there is nothing to
judge the drift against.

Bronze propellers and graphite horn cleats both entered this Bible that way. Section 11's first
checklist exists to make the next one a decision taken in advance instead.
