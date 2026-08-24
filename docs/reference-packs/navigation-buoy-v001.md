# Reference Pack — navigation buoy, v001

Generated 2026-08-24. Selected view by view by the agent under `docs/reference-bible.md`; the
project owner reviews the pack as a whole.

Nine approved views. The pixels live outside the repository at
`~/rw/reference-packs/navigation-buoy/v001/`; this file is their in-repo evidence. See ADR-0022 for
why the pixels stay out.

**These images are not reproducible from their prompts alone.** The identity anchor was repaired by
a region edit inside the generating tool, and that operation is described here in words because no
prompt reproduces it. Auditability, not reproducibility, is what this record provides.

## Provenance

| Field | Value |
|---|---|
| Service | Reve, model 2.1, via `app.reve.com` |
| Plan | Reve Lite (paid), upgraded from Free part-way through this pack |
| Operated by | Claude Opus 5 through the ego-browser agent browser |
| Album | Navigation Buoy Technical Visualization, `f3384399-0bce-4f51-ac31-8d701268a977` |
| Reference object | `@nav-buoy`, type Object, holding the five geometric views as Ingredients |
| Settings | 1:1 aspect · Count 4 · attachments interpreted Literally |
| Output | 4096 × 4096 PNG, every view |

The account's identity is deliberately not recorded — see `hero-vessel-v001.md`, which sets out why
an identifier here would carry no information and a permanent cost. Terms §2.3 output terms are
recorded there and apply to this pack too.

The Reference Bible's prompt-invariant block was set once as the album's persistent Guidelines
rather than repeated per prompt, so every generation in this pack carried it.

## Approved views

| File | View | sha256 (first 16) |
|---|---|---|
| `nav-buoy-anchor-3q-v001.png` | Identity anchor, three-quarter | `4f9e9dbe8a9309dc` |
| `nav-buoy-elev-front-v001.png` | Front elevation | `a9567abd0525e0d8` |
| `nav-buoy-elev-port-v001.png` | Port side elevation | `9b966bbd104d40b4` |
| `nav-buoy-elev-back-v001.png` | Back elevation | `6fa575998426c86c` |
| `nav-buoy-plan-top-v001.png` | Top view | `529d3a09816a6540` |
| `nav-buoy-mat-paint-band-v001.png` | Material — white paint meeting the orange band | `b973a1da853da74e` |
| `nav-buoy-mat-growth-band-v001.png` | Material — the growth band's upper boundary | `8c217e548f228ee7` |
| `nav-buoy-mat-ring-chain-v001.png` | Material — mooring ring and chain | `6e82abbc561646da` |
| `nav-buoy-lookdev-wet-v001.png` | Wet look-dev | `c40597cb110b06ba` |

Only the five geometric views are Ingredients of `@nav-buoy`. The three material studies and the wet
look-dev stay out of it, per Bible §6.

## Manual operations no prompt reproduces

- **The identity anchor's mooring ring was added by a region edit.** The approved generation had the
  chain emerging from the growth band with no visible ring. A Spotlight selection over the chain's
  attachment point, instructed to set a heavy graphite ring into the hull with the chain's first
  link through it, produced the anchor that all five geometric views derive from. Everything outside
  that region is the original generation. The pre-edit image is retained in the album as
  `ab21cb75`.

## Decisions forced by generation

- **The navigation lantern.** Every anchor candidate produced a caged lantern at the top, which the
  specification had not named. It was kept — a navigation buoy without a light is not one — and
  written into Bible §10 before any derivative view was generated.
- **The mooring ring's angular position.** Generation does not keep it consistent across views, so
  Bible §10 now fixes it directly below the lifting eye and states that the Bible wins over any
  approved view that disagrees. The back elevation in this pack is one such view: it rotates the
  lifting eye correctly and leaves the ring where the front elevation had it.
- **Ballast shaft and chain as separate parts.** Two candidates hung the ballast weight on the
  chain, which would leave the buoy with no righting moment at all. Bible §10 now states that the
  shaft is rigid, the chain is not, and the weight is carried by the shaft.

## Rejections and why

- Three back elevations and one side elevation drew the chain hanging free beside the hull with no
  mooring ring — a part lost, Bible §8 rule 2.
- Two back elevations hung the ballast weight on the chain rather than the rigid shaft.
- One top view reduced the lantern to a featureless stub with its cage gone.
- Three front elevations buried the mooring ring in the growth band so that it could not be read.
- One anchor candidate carried a boarding ladder that nothing had asked for.

## Known differences from the specification

- **The buoy is very nearly rotationally symmetric.** The side elevation differs from the front only
  in the lifting eye and the small fitting opposite it. That is a property of the object, not a
  defect in the view, but it means the side elevation carries less independent information than it
  does for an asymmetric asset.
- The mooring ring's angular position disagrees between the front and back elevations, as described
  above. Take it from the Bible, not from the images.
- The material studies show the ring and chain in more detail than any geometric view does; treat
  their part shapes as indicative and their materials as authoritative.
