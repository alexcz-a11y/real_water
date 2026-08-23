# Reference Pack — hero vessel, v001

Approved 2026-08-23. Approver: the project owner, view by view, in a live session.

Nine approved views. The pixels live outside the repository at
`~/rw/reference-packs/hero-vessel/v001/` so that every reconstruction worktree can read them;
this file is their in-repo evidence. See ADR-0022 for why the pixels stay out.

**These images are not reproducible from their prompts alone.** Four of the nine were produced or
repaired by direct manipulation in the generating tool — a canvas extension and two region edits —
and those operations are described here in words because no prompt reproduces them. Auditability,
not reproducibility, is what this record provides.

## Provenance

| Field | Value |
|---|---|
| Service | Reve, model 2.1, via `app.reve.com` |
| Operated by | Claude Opus 5 through the ego-browser agent browser |
| Album | Offshore Research Workboat Study, `2edff8ad-0419-469e-84af-94fc4f73ec13` |
| Reference object | `@hero-vessel`, type Object, holding the approved views as Ingredients |
| Settings | 1:1 aspect · Count 4 · attachments interpreted Literally |
| Output | 4096 × 4096 PNG, every view |

The Reference Bible's prompt-invariant block was set once as the album's persistent Guidelines
rather than repeated per prompt, so every generation in this pack carried it.

## Approved views

| File | View | sha256 (first 16) |
|---|---|---|
| `hero-vessel-anchor-3q-v001.png` | Identity anchor, port bow three-quarter | `885bd16eda6936c6` |
| `hero-vessel-elev-front-v001.png` | Front elevation | `55ce065cfdb73ce5` |
| `hero-vessel-elev-port-v001.png` | Orthographic port elevation | `bff9b80b2ccc2031` |
| `hero-vessel-elev-stern-v001.png` | Orthographic stern elevation | `18bdb15ef2103838` |
| `hero-vessel-plan-top-v001.png` | Orthographic top view | `7c6b979a02fbbf72` |
| `hero-vessel-mat-hull-paint-v001.png` | Material — topside paint, orange stripe, waterline | `bf6cb48399d5ac03` |
| `hero-vessel-mat-fender-rope-v001.png` | Material — rubber fender, rope, graphite cleat | `6fde4d4c93e68ca8` |
| `hero-vessel-mat-deck-winch-v001.png` | Material — deck non-slip, stanchion base, winch | `c92b6be3ddbc6964` |
| `hero-vessel-lookdev-wet-v001.png` | Wet look-dev | `802cec9e78ef37cf` |

The five geometric views are Ingredients of `@hero-vessel`. The three material studies and the wet
look-dev are deliberately **not** Ingredients: a tight surface crop carries no identity information
and pulls later generations toward close-up framing. They are material evidence, held in this pack
and cited from here.

## Manual operations that no prompt reproduces

**Identity anchor.** All four first-round candidates cropped the stern at the frame edge. Rather
than re-rolling, the chosen candidate was extended with the tool's Reframe in Literal mode at 0.70
scale, which paints new canvas around the original pixels. The vessel's identity survived exactly —
wheelhouse, window count, single orange stripe, graphite fittings, bow anchor all unchanged — but
**the stern in this anchor is generated, not observed**. It is the only invented region of the
vessel, and it is where the stern, propeller and wake sockets attach. Hold it to a higher standard
than the rest.

**Top view, twice.** The first plan carried six fenders, three per side. A region edit replaced the
forward pair with plain hull plating. A second region edit removed the remaining odd fender on the
starboard side. The result is two per side, which agrees with the port elevation.

## Decisions forced by generation

Two parts appeared that the anchor could not show, both functionally necessary. Each was settled at
the moment it appeared — written into the Reference Bible as specification — rather than left
undecided, because an undecided part drifts differently in every later view.

- **Bronze propellers.** Twin four-bladed bronze propellers on exposed shafts with A-bracket struts,
  either side of a central skeg. Bronze was absent from the Bible's palette, which made a correct
  image look like a violation. The Bible now permits bronze for propellers only.
- **Graphite horn cleats.** The fenders must hang from something. The Bible now fixes a graphite
  horn cleat at each fender position.

## Rejections and why

- A stern view whose boarding ladder had moved to the transom — a part relocated, not added.
- A material study whose winch drum read as brass, which would have broken the bronze scope on the
  day it was written.
- A wet look-dev with rain-like streaking across the whole frame: rain is weather in this project,
  not a material property, and reading it as wetness would bias the reconstruction.
- A starboard three-quarter look-dev: no approved view covers that side, so nothing could check it.

## Known differences from the specification

- The stern geometry is self-consistent across the stern elevation and the top view but descends
  from the Reframe extension rather than from any observed view.
- The material studies show a cleat and a winch in more detail than any geometric view does; treat
  their part shapes as indicative and their materials as authoritative.
