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
| Graphite | Structural and mechanical mass | Deck fittings, machinery, frames, rails, hardware, submerged structure |
| Warm grey | Weathered neutral ground | Hull below the waterline band, concrete, rock, worn composite |
| Matte white | Primary superstructure | Wheelhouse, cabin sides, buoy upper body, crate banding |
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
- Any claim about geometry on a side no approved view shows.
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

Three parts the buoy's function requires and no floating view can show. Fixed in advance under §11
so that generation does not get to invent them:

- **A graphite ballast keel hangs beneath the hull on a short central shaft, its mass concentrated
  in a weight at the very bottom.** The buoy's righting moment comes from this weight, so its depth
  below the waterline is a modelling input, not decoration.
- **A single heavy graphite mooring ring is set into the base of the hull, with the first links of
  an anchor chain shackled through it.** This is the visible mooring hardware named above, seen
  from below.
- **A band of dark green-brown biological growth covers the hull from the waterline downward**,
  ending where the ballast shaft begins.

Every buoy view that includes the underwater body shows all three. The floating anchor view shows
none of them, which is why they are written here rather than discovered mid-pack.

### Marine crate — 1.2 m

Fixed: closed marine shipping crate; composite or timber body in warm grey; graphite corner
hardware and banding; no markings, no stencilled text.

### Underwater structure — 8 m

Fixed: submerged receiver structure with clear semantic regions; wet concrete and graphite;
biological growth limited to what does not obscure the silhouette. It is a caustic and volume
receiver, so its upper surfaces must read as broad and continuous.

### Basalt sea stack — 250–300 m

Fixed: columnar basalt sea stack; warm grey to graphite; no beach, no shoreline, no vegetation mass.
Distant silhouette and reflection subject only.

## 11. Two checklists, each covering a different half

Every asset gets both. Run them at different moments, because they answer opposite questions.

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
