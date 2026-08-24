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

## Generating service and output terms

Retrieved 2026-08-24 from `https://app.reve.com/terms` (redirected from `https://reve.com/terms`)
and `https://app.reve.com/usage`. The Terms of Service carry **LAST UPDATED: 10/28/25**; the Usage
Policy carries **LAST UPDATED: 9/15/25**. An archived earlier version is published at
`/terms/archive/20250915.html`, so the version in force is identifiable after the fact.

Quotations below are verbatim. They are recorded, not interpreted — the compatibility judgement
against ADR-0008 belongs to the project owner and is recorded separately at the end of this section.

### Ownership of output — Terms §2.2

> To the extent permitted by applicable law and subject to the license you grant to Reve (and, in
> some cases, other users) in Section 2.3 below, you (a) retain any ownership rights you may have
> in your Input, and (b) own the rights to any Output you create using the Services.

> Reve hereby assigns to you all right, title, and interest held by Reve, if any, in and to Output
> you create, subject to the license you grant to Reve in Section 2.3 below.

> Reve does not represent or warrant that Outputs are protectible by intellectual property rights
> under applicable law or free from any third-party intellectual property rights.

### Commercial use

The Terms and the Usage Policy contain **no clause restricting commercial use of Output**. The
nearest restriction is Terms §1.3(c), which is narrower than commercial use in general:

> use Output to develop models that compete with Reve

### Redistribution — Terms §1.3(a) and §2.3

Terms §1.3(a) prohibits redistributing **the Services**, not Output:

> license, sublicense, sell, rent, lease, transfer, assign, reproduce or distribute, any of the
> Services

Terms §2.3 attaches a licence that runs the other way, and its scope depends on account tier:

> Output that you create using a Free Account may be made available (but Reve has no obligation)
> to and/or searchable by other users, including on Reve's Inspiration page, and Free Account users
> (or Paid Account users who choose to share Content with other users through Reve's Services)
> hereby grant a perpetual license to Reve and other users to reproduce, distribute, create
> derivative works of and publicly display such Output for this purpose.

> You agree that Reve may use Your Content to improve and promote the Services, including by
> training its artificial intelligence models. If you are using a Paid Account, you may opt-out of
> the use of Your Content for model training by selecting the opt-out option on your Account page.

### Two facts this record cannot settle

1. ~~The account tier of the generating account is not recorded here.~~ **Settled 2026-08-24: the
   generating account was on the Reve **Free plan** at the time of this pack, read from the account
   page.** The account's own identity is deliberately not recorded: §2.3 turns on the *tier*, and the
   conclusion below is identical for any Free account, so an identifier here would carry no
   information and a permanent cost. Terms §2.3 therefore applies in full to these nine views: they
   "may be made available ... to and/or searchable by other users, including on Reve's Inspiration
   page", and a "perpetual license to Reve **and other users** to reproduce, distribute, create
   derivative works of and publicly display such Output" has been granted. Ownership is retained
   regardless; what a Free Account grants alongside it is a licence to third parties. The model
   training opt-out in §2.3 is available to Paid Accounts only, and by its own wording applies only
   to Content created *after* the opt-out is selected — so it could not be applied retroactively to
   this pack even if the account were upgraded.
2. **The nine files were downloaded by an agent driving the site's own download control.** Terms
   §1.3(b) prohibits "automatically or programmatically extract or scrape data or Outputs from the
   Services". Whether an agent operating the published UI falls inside that phrase is not settled
   by the text, and §1.4 addresses agents acting on a user's behalf without resolving it either way.

Both are recorded as open facts, not as findings.

### Owner's determination

On 2026-08-24 the project owner determined that copyright in the Output belongs to them, that
commercial use is licensed, and that the Output may be redistributed, and stated that they will not
put it to commercial use. Recorded as the owner's decision; the quotations above are the material
it was taken on.

On 2026-08-24, after reading the Free-plan finding above, the owner decided to continue generating
the remaining packs on the Free account, knowing that Terms §2.3 grants Reve and other users a
perpetual licence over the Output and that the training opt-out is unavailable on this tier. The
decision covers every pack in this series, not this one alone.
