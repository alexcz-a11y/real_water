# Reference Pack — marine crate, v001

Generated 2026-08-24. Selected view by view by the agent under `docs/reference-bible.md`; the
project owner reviews the pack as a whole.

Nine approved views. The pixels live outside the repository at
`~/rw/reference-packs/marine-crate/v001/`; this file is their in-repo evidence. See ADR-0022 for why
the pixels stay out.

Unlike the other two packs, **every view here came straight from generation** — no region edit, no
canvas extension. The prompts plus the album Guidelines are the whole record of how they were made,
though the images are still not reproducible from them, because the service does not guarantee a
seed.

## Provenance

| Field | Value |
|---|---|
| Service | Reve, model 2.1, via `app.reve.com` |
| Plan | Reve Lite (paid) |
| Operated by | Claude Opus 5 through the ego-browser agent browser |
| Album | Marine Shipping Crate Visualization, `d637771a-b0de-4ce5-be0c-c8fa3c5e1601` |
| Reference object | `@marine-crate`, type Object, holding the five geometric views as Ingredients |
| Settings | 1:1 aspect · Count 4 · attachments interpreted Literally |
| Output | 4096 × 4096 PNG, every view |

The account's identity is deliberately not recorded — `hero-vessel-v001.md` sets out why, and its
record of the service's output terms applies to this pack too.

## Approved views

| File | View | sha256 (first 16) |
|---|---|---|
| `marine-crate-anchor-3q-v001.png` | Identity anchor, three-quarter | `e9b7faf18fc18d05` |
| `marine-crate-elev-front-v001.png` | Front elevation, long side | `3cc2b16e7c05d153` |
| `marine-crate-elev-end-v001.png` | End elevation, short side | `7dca71a6073b9736` |
| `marine-crate-elev-back-v001.png` | Back elevation, opposite long side | `4b529c0b60541e96` |
| `marine-crate-plan-top-v001.png` | Top view | `8c2153a340b2421b` |
| `marine-crate-mat-timber-v001.png` | Material — body panel timber | `a485afabe46e9289` |
| `marine-crate-mat-corner-casting-v001.png` | Material — corner casting meeting a band | `a6549c74cc947ad3` |
| `marine-crate-mat-rope-becket-v001.png` | Material — rope becket in its frame | `89e86a2e1ba2df47` |
| `marine-crate-lookdev-wet-v001.png` | Wet look-dev | `6e3c614386b00d2d` |

Only the five geometric views are Ingredients of `@marine-crate`, per Bible §6.

## Decisions forced by generation

- **Six clamps, not four.** The specification guessed one per side. Every anchor candidate
  distributed them two per long side and one per end, and Bible §10 was corrected to match before
  any derivative view was generated.
- **No painted markings at all.** Two anchor candidates carried safety orange as stripes and as a
  wide band. §2 reserves orange for markings and signal elements, and a cargo crate in this world
  has neither, so the Bible now says so explicitly and the chosen anchor carries none.

## Rejections and why

- Two anchor candidates carried safety orange stripes or bands — the palette rule in §2 reserves
  orange for markings and signal elements, which a cargo crate does not have.
- One anchor candidate placed four clamps on a single face and further clamps on the end, which is
  neither the specified layout nor a consistent one.

## Known differences from the specification

- **The clamp bodies drift between the front and back elevations.** Both show two clamps in the
  right places, but the back elevation draws a taller clamp with a different linkage. Take the clamp
  form from the anchor and the front elevation; the back elevation is authoritative only for what is
  present, not for its shape.
- **The end elevation is the only view that shows a becket square-on.** The top view shows the two
  beckets as recesses and the anchor shows one at an angle, so the becket's depth into the panel
  rests on a single view.
- The material studies show the corner casting and the becket in more detail than any geometric view
  does; treat their part shapes as indicative and their materials as authoritative.
