# Reference Bible

The shared visual identity, scale, material, palette, lighting, and framing rules that keep every
generated demonstration asset in one world. This document is the invariant block: its Prompt
Invariants section is pasted verbatim into every image-generation session, and its scale table is
the authority every procedural reconstruction cites.

It is a specification, not a mood board and not a decision record. The decision that this document
exists at all lives in ADR-0022.

**Version**: v1 (drafted before the first hero-vessel anchor was approved). Sections 5 and 6 are
provisional until the hero vessel pack is approved; see "Open at v1" at the end.

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
- Object fills the frame with even margins. Horizon-level camera unless the view is the top view.
- Square framing.
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
on the subject. The whole object is visible and uncropped, filling the frame with even margins.

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

Fixed: floating navigation buoy; matte white body with a safety orange band; graphite fittings;
visible mooring hardware; no light or radar reflector beyond what the anchor shows.

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

## Open at v1

Settled by the approved hero-vessel anchor, then written back as v2:

- Section 5's lighting and framing rules are stated but not yet validated against real output.
- Section 6's material close-up count (3) is an estimate.
- The hero vessel's provisional items above.
